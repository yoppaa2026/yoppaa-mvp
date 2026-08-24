// POST /api/accompagnement/checkout
//
// Le commerçant commande un accompagnement sur place (Success Pack) et/ou du
// matériel de comptoir depuis son tableau de bord. Jusqu'ici ce choix n'existait
// qu'à l'étape 5 de l'inscription : celui qui passait à côté n'avait plus aucun
// moyen de le commander, alors que la page d'inscription le promettait déjà.
//
// Comme les packs SMS et les abonnements, c'est Yoppaa qui vend : le paiement
// va sur le compte PLATEFORME (pas de Direct Charge) et la TVA est portée par
// les Price Stripe. Le paiement est immédiat, à la commande.
//
// Effets :
//   1) une ligne success_packs par produit, statut 'paiement_en_attente'
//   2) une session Stripe Checkout (mode payment) avec une ligne par produit
//   3) le webhook billing bascule les lignes en 'paye' et prévient tout le monde
//
// Body : { commercant_id, produits: ['success_pack', 'kit_pro', …], message? }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG, PAYMENT_KIND } from '@/lib/stripe'
import { getStripePriceIdProduitBoutique, getOrCreateStripeCustomer } from '@/lib/stripe-billing'
import { produitParType } from '@/lib/produits-boutique'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    requireStripe()

    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const { commercant_id, produits, message } = await request.json()
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    // On ne fait confiance qu'au catalogue serveur : un type inconnu est ignoré,
    // et le montant débité vient du Price Stripe, jamais du client.
    const choisis = [...new Set(Array.isArray(produits) ? produits : [])]
      .map(t => produitParType(t))
      .filter(Boolean)
    if (choisis.length === 0) {
      return NextResponse.json({ ok: false, error: 'aucun produit valide dans la commande' }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    const { data: com } = await admin
      .from('commercants')
      .select('id, nom, email, plan, auth_user_id, stripe_customer_id')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!com) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (com.auth_user_id !== user.id && user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // Les Price sont résolus AVANT toute écriture : si l'un manque, on échoue
    // proprement sans laisser de commande fantôme en base.
    const lineItems = choisis.map(p => ({ price: getStripePriceIdProduitBoutique(p.envKey), quantity: 1 }))

    const note = String(message || '').trim().slice(0, 400)

    // ⚠️ LE SOUHAIT DU MÊME PRODUIT S'EFFACE ICI, sinon le commerçant verrait
    // deux lignes pour un seul Kit Pro : « choisi à l'inscription » ET « payé ».
    // On ne touche QUE le statut 'souhaite', et QUE les types réellement
    // commandés : ce qu'il avait coché sans le prendre aujourd'hui doit rester
    // proposé, il n'a pas renoncé, il a seulement commandé autre chose d'abord.
    const { error: errSouhaits } = await admin
      .from('success_packs')
      .delete()
      .eq('commercant_id', com.id)
      .eq('statut', 'souhaite')
      .in('type', choisis.map(p => p.type))
    if (errSouhaits) {
      // Non bloquant : un doublon à l'écran est désagréable, perdre un
      // paiement en cours le serait bien davantage.
      console.error('[accompagnement/checkout] souhaits non nettoyés', errSouhaits.message)
    }

    const { data: lignes, error: errIns } = await admin
      .from('success_packs')
      .insert(choisis.map(p => ({
        commercant_id: com.id,
        type: p.type,
        statut: 'paiement_en_attente',
        montant_ht: p.prix,
        notes: note ? `Commandé depuis le tableau de bord — ${note}` : 'Commandé depuis le tableau de bord',
      })))
      .select('id')
    if (errIns || !lignes?.length) {
      console.error('[accompagnement/checkout] insert échoué', errIns)
      return NextResponse.json({ ok: false, error: 'Création de la commande échouée, réessaie.' }, { status: 500 })
    }

    const customer = await getOrCreateStripeCustomer(com, admin)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customer.id,
      line_items: lineItems,
      success_url: `${STRIPE_CONFIG.appUrl}/dashboard?accompagnement=ok`,
      cancel_url:  `${STRIPE_CONFIG.appUrl}/dashboard?accompagnement=annule`,
      metadata: {
        yoppaa_kind: PAYMENT_KIND.ACCOMPAGNEMENT,
        yoppaa_commercant_id: com.id,
        // Les lignes à basculer en 'paye' côté webhook (Stripe limite les
        // valeurs de metadata à 500 caractères : 4 UUID tiennent largement).
        yoppaa_lignes: lignes.map(l => l.id).join(','),
      },
    })

    return NextResponse.json({ ok: true, url: session.url })
  } catch (e) {
    console.error('[accompagnement/checkout]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
