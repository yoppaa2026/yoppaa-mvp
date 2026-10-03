// GET /api/rdv/from-session?session_id=cs_xxx&slug=<commerce>
//
// Recupere un RDV cree par le webhook Stripe a partir du session_id.
// Le webhook stocke directement le session_id dans rdv_reservations apres
// insert (cf MIGRATION_RDV_SESSION_ID.sql).
//
// 🔴 ET S'IL N'EXISTE PAS, ON DEMANDE POURQUOI (03/10). Depuis que le webhook
// rembourse au lieu de rejouer quand la place a disparu entre le contrôle et
// le paiement, une session payée peut ne JAMAIS donner de rendez-vous. L'écran
// de retour attendait alors quinze secondes en affichant « confirmé ». Le
// webhook marque le paiement (`yoppaa_refus`) : on le relit ici, sur le compte
// du commerce, pour que l'écran dise la vérité.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { motifApresPaiement } from '@/lib/refus-reservation'

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('session_id')
    const slug = url.searchParams.get('slug')
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'session_id requis' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select('id, numero_rdv, numero_prefixe, statut, acompte_montant, acompte_paye_en_ligne, date_rdv, heure_debut, heure_fin')
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle()

    if (rdv) return NextResponse.json({ ok: true, rdv })

    // ─── Pas de rendez-vous : refusé et remboursé, ou simplement pas encore là ?
    // ⚠️ TOUT DOUTE RÉPOND « PAS ENCORE » : l'écran continue d'attendre, et
    // l'email de confirmation ou de remboursement tranchera. On n'annonce un
    // refus que sur la marque posée par le webhook.
    const refus = slug ? await refusDeLaSession(supabase, sessionId, slug) : null
    if (refus) return NextResponse.json({ ok: false, refuse: true, ...refus })

    return NextResponse.json({ ok: false, pending: true, error: 'RDV pas encore associe a cette session' }, { status: 404 })
  } catch (e) {
    console.error('[api/rdv/from-session]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

async function refusDeLaSession(supabase, sessionId, slug) {
  try {
    const { data: commerce } = await supabase
      .from('commercants')
      .select('stripe_account_id')
      .eq('slug', slug)
      .maybeSingle()
    if (!commerce?.stripe_account_id) return null
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ['payment_intent', 'setup_intent'] },
      { stripeAccount: commerce.stripe_account_id },
    )
    const intention = session?.payment_intent || session?.setup_intent
    const code = intention && typeof intention === 'object' ? intention.metadata?.yoppaa_refus : null
    if (!code) return null
    const paye = !!session?.payment_intent
    const centimes = paye ? Number(session.payment_intent.amount_received ?? session.payment_intent.amount) || 0 : 0
    return {
      motif: motifApresPaiement(code),
      rembourse: paye,
      montant: centimes > 0 ? centimes / 100 : null,
    }
  } catch (e) {
    console.warn('[api/rdv/from-session] lecture du refus impossible', e?.message)
    return null
  }
}
