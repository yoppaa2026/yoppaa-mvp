// GET /api/rdv/from-session?session_id=cs_xxx
//
// Recupere un RDV cree par le webhook Stripe a partir du session_id de la Checkout
// Session. Utilise par /commander/rdv/[slug] au retour Stripe pour afficher
// le numero_rdv assigne par le trigger DB (qui n'est pas disponible cote frontend
// puisque le RDV est cree async par le webhook).
//
// Le webhook payment_intent.succeeded stocke `stripe_payment_intent_id`.
// On retrouve le PI depuis la Checkout Session via Stripe SDK, puis on fetch
// le RDV par stripe_payment_intent_id.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('session_id')
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'session_id requis' }, { status: 400 })
    }

    if (!stripe) {
      return NextResponse.json({ ok: false, error: 'Stripe non configure' }, { status: 503 })
    }

    // On a besoin du commercant_id pour retrouver le compte connecte Stripe.
    // Astuce : le frontend connait le slug du commercant via le path, mais on
    // peut directement extraire depuis la session si on connait l'account.
    // Plus simple : on requete sur tous les commercants stripe_account_id et on
    // trouve celui dont la session existe. Mais c'est cher.
    // Solution pragmatique : on tente avec tous les commercants stripe configures.
    // Pour MVP en mode test (~10 commercants), c'est tout a fait acceptable.

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // Liste des comptes Stripe Connect actifs
    const { data: comptes } = await supabase
      .from('commercants')
      .select('stripe_account_id')
      .not('stripe_account_id', 'is', null)
      .eq('stripe_account_charges_enabled', true)

    let session = null
    for (const c of (comptes || [])) {
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId, { stripeAccount: c.stripe_account_id })
        if (session) break
      } catch (e) {
        // Session pas trouvee sur ce compte, on continue
      }
    }

    if (!session) {
      return NextResponse.json({ ok: false, error: 'session introuvable', not_found: true }, { status: 404 })
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
      return NextResponse.json({ ok: false, error: 'RDV pas encore cree', pending: true }, { status: 404 })
    }

    return NextResponse.json({ ok: true, rdv })

  } catch (e) {
    console.error('[api/rdv/from-session]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
