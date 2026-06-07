// GET /api/rdv/from-session?session_id=cs_xxx&slug=dermae-mettet
//
// Recupere un RDV cree par le webhook Stripe a partir du session_id de la Checkout
// Session. Utilise par /commander/rdv/[slug] au retour Stripe pour afficher
// le numero_rdv assigne par le trigger DB (qui n'est pas disponible cote frontend
// puisque le RDV est cree async par le webhook).
//
// Le webhook payment_intent.succeeded stocke `stripe_payment_intent_id`.
// On retrouve le PI depuis la Checkout Session via Stripe SDK (necessite le
// stripeAccount du commercant car la session est sur son compte Connect).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('session_id')
    const slug = url.searchParams.get('slug')
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'session_id requis' }, { status: 400 })
    }

    if (!stripe) {
      return NextResponse.json({ ok: false, error: 'Stripe non configure' }, { status: 503 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // Si slug fourni : recupere direct le stripe_account_id du commercant.
    // Plus efficace que de boucler sur tous les comptes connect.
    let stripeAccountId = null
    if (slug) {
      const { data: c } = await supabase
        .from('commercants')
        .select('stripe_account_id')
        .eq('slug', slug)
        .maybeSingle()
      stripeAccountId = c?.stripe_account_id || null
    }

    let session = null
    if (stripeAccountId) {
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId, { stripeAccount: stripeAccountId })
      } catch (e) {
        console.warn('[api/rdv/from-session] retrieve KO sur compte', stripeAccountId, e.message)
      }
    }

    // Fallback : boucle sur TOUS les comptes Connect (filtre charges_enabled retire,
    // car en mode test Stripe peut etre flag a false meme apres onboarding complet).
    const triedAccounts = stripeAccountId ? [stripeAccountId] : []
    const errors = []
    if (!session) {
      const { data: comptes } = await supabase
        .from('commercants')
        .select('stripe_account_id, slug')
        .not('stripe_account_id', 'is', null)

      for (const c of (comptes || [])) {
        if (triedAccounts.includes(c.stripe_account_id)) continue
        triedAccounts.push(c.stripe_account_id)
        try {
          session = await stripe.checkout.sessions.retrieve(sessionId, { stripeAccount: c.stripe_account_id })
          if (session) break
        } catch (e) {
          errors.push({ account: c.stripe_account_id, slug: c.slug, error: e.message })
        }
      }
    }

    if (!session) {
      // Debug : on retourne les comptes testes et les erreurs pour comprendre
      console.warn('[api/rdv/from-session] session introuvable', { sessionId, triedAccounts, errors })
      return NextResponse.json({
        ok: false,
        error: 'session introuvable',
        not_found: true,
        debug: { tried_accounts: triedAccounts, slug_resolved: !!stripeAccountId, errors },
      }, { status: 404 })
    }

    const paymentIntentId = session.payment_intent
    if (!paymentIntentId) {
      return NextResponse.json({ ok: false, error: 'payment_intent non trouve dans session' }, { status: 404 })
    }

    // Fetch le RDV correspondant
    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select('id, numero_rdv, statut, acompte_montant, acompte_paye_en_ligne, date_rdv, heure_debut, heure_fin')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle()

    if (!rdv) {
      // RDV pas encore cree (webhook pas traite) → retour 404 pour que le frontend poll
      return NextResponse.json({ ok: false, error: 'RDV pas encore cree', pending: true, payment_intent_id: paymentIntentId }, { status: 404 })
    }

    return NextResponse.json({ ok: true, rdv })

  } catch (e) {
    console.error('[api/rdv/from-session]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
