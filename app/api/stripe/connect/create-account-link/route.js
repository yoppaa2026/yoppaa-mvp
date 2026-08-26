// POST /api/stripe/connect/create-account-link
//
// Crée (ou récupère) un compte Connect Express pour un commerçant + génère un
// Account Link Stripe-hosted pour le faire onboarder.
//
// Flow attendu :
//   1. Commerçant clique "Connecter Stripe" dans son dashboard config RDV
//   2. FE POST sur cette route avec commercant_id
//   3. Backend : si pas de stripe_account_id sur le commerçant, on crée un account Express
//   4. Backend : on génère un account_link (URL one-shot Stripe-hosted)
//   5. FE redirect le commerçant vers cette URL
//   6. Commerçant fait son onboarding (IBAN, ID, adresse — 5 min)
//   7. Stripe redirect vers return_url (= dashboard config Yoppaa)
//   8. À l'arrivée, FE POST sur /api/stripe/connect/refresh-status pour update les flags
//      OU webhook account.updated nous notifie automatiquement
//
// Auth : commerçant connecté (auth Supabase) + ownership check sur commercant_id.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG } from '@/lib/stripe'
import { verdictForfait } from '@/lib/garde-forfait'

export async function POST(request) {
  try {
    requireStripe()

    const { commercant_id } = await request.json()
    if (!commercant_id) {
      return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    }

    // Auth : token JWT du commerçant connecté
    const authHeader = request.headers.get('authorization') || ''
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })
    }

    // Ownership : le user doit être le commerçant (auth_user_id match)
    const { data: commercant, error: errC } = await supabase
      .from('commercants')
      // ⚠️ `plan`, `essai_plan` ET `created_at` : sans ces trois colonnes la
      // garde de forfait ci-dessous se trompe EN SILENCE (voir COLONNES_GARDE).
      .select('id, nom, email, stripe_account_id, auth_user_id, plan, essai_plan, created_at')
      .eq('id', commercant_id)
      .single()

    if (errC || !commercant) {
      return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    }
    if (commercant.auth_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // 1. Crée le compte Connect Express si pas encore lié
    let accountId = commercant.stripe_account_id
    if (!accountId) {
      // 🔴 LA GARDE DE FORFAIT EST ICI, ET NULLE PART AILLEURS DANS CETTE
      // ROUTE. C'est le point le plus délicat des cinq gardes serveur.
      //
      // ⚠️ ELLE PORTE SUR LA CRÉATION D'UN COMPTE, JAMAIS SUR L'ACCÈS À UN
      // COMPTE EXISTANT. Posée au début de la route, elle empêcherait un
      // commerçant redescendu en Exister de regénérer son lien Stripe : il ne
      // pourrait plus **rembourser** un client, ni atteindre l'argent qu'il a
      // déjà encaissé. On lui interdirait l'accès à son propre compte
      // bancaire pour cause de forfait. Ce serait indéfendable, et c'est
      // exactement le piège signalé le 26/08.
      //
      // Encaisser en ligne demande Vendre. Ouvrir un compte pour la première
      // fois, c'est donc créer une capacité qu'il n'a pas encore : là, on
      // ferme. Après, jamais.
      const verdict = verdictForfait(commercant, 'paiement_ligne')
      if (!verdict.ok) {
        return NextResponse.json(
          { ok: false, error: verdict.message, code: verdict.code, plan_requis: verdict.plan_requis },
          { status: verdict.statut }
        )
      }
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'BE',
        email: commercant.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'company',  // ou 'individual' selon le commerçant — on laisse choisir pendant l'onboarding
        business_profile: {
          name: commercant.nom,
          url: `${STRIPE_CONFIG.appUrl}/commander/rdv/${commercant.slug || commercant.id}`,
          product_description: 'Réservations de rendez-vous et commandes click & collect via Yoppaa',
        },
        metadata: {
          yoppaa_commercant_id: commercant.id,
        },
      })
      accountId = account.id
      await supabase
        .from('commercants')
        .update({ stripe_account_id: accountId })
        .eq('id', commercant_id)
    }

    // 2. Génère l'Account Link (URL one-shot Stripe-hosted)
    // refresh_url : Stripe redirige ici si le lien expire (max 5 min). On regénère un nouveau lien.
    // return_url  : Stripe redirige ici quand le commerçant finit son onboarding (success ou abandon).
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${STRIPE_CONFIG.appUrl}/dashboard?stripe=refresh`,
      return_url:  `${STRIPE_CONFIG.appUrl}/dashboard?stripe=connected`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ ok: true, url: link.url, account_id: accountId })

  } catch (e) {
    console.error('[stripe/connect/create-account-link]', e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: e?.status || 500 }
    )
  }
}
