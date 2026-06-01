// POST /api/stripe/refund
//
// Déclenche un refund Stripe sur un RDV (ou commande) annulé(e).
// Appelé depuis :
//   • L'API d'annulation client (/api/rdv/cancel — à venir)
//   • L'API d'annulation commerçant (depuis le dashboard)
//
// Politique : refund auto SEULEMENT si l'annulation est dans le délai cutoff
// (rdv_delai_annulation_heures du commerçant, par défaut 24h).
// La vérification du délai est faite ICI au cas où la route est appelée
// directement (defense in depth).
//
// Auth :
//   • Client : peut refund SON propre RDV (auth.email match)
//   • Commerçant : peut refund un RDV de son commerce (auth_user_id match)
//   • Admin Yoppaa : peut tout (geste commercial exceptionnel)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe } from '@/lib/stripe'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    requireStripe()

    const { rdv_id, raison } = await request.json()
    if (!rdv_id) {
      return NextResponse.json({ ok: false, error: 'rdv_id requis' }, { status: 400 })
    }

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
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    // Récupère le RDV + commercant (jointure pour ownership commerçant + délai)
    const { data: rdv, error: errRdv } = await supabase
      .from('rdv_reservations')
      .select('*, commercant:commercants(id, nom, auth_user_id, rdv_delai_annulation_heures)')
      .eq('id', rdv_id)
      .single()

    if (errRdv || !rdv) {
      return NextResponse.json({ ok: false, error: 'RDV introuvable' }, { status: 404 })
    }

    // Ownership : client (auth.email match) OU commerçant OU admin
    const isClient    = user.email === rdv.client_email
    const isCommercant = user.id === rdv.commercant?.auth_user_id
    const isAdmin     = user.email === ADMIN_EMAIL
    if (!isClient && !isCommercant && !isAdmin) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // Délai cutoff : seuls les admin/commerçant peuvent passer outre
    const dateRdv = new Date(`${rdv.date_rdv}T${rdv.heure_debut}`)
    const now = new Date()
    const heuresAvant = (dateRdv - now) / (1000 * 60 * 60)
    const delaiCutoff = rdv.commercant?.rdv_delai_annulation_heures ?? 24

    if (isClient && heuresAvant < delaiCutoff) {
      return NextResponse.json({
        ok: false,
        error: `Délai dépassé. L'annulation n'est plus possible (< ${delaiCutoff}h avant le RDV). Contacte directement ${rdv.commercant?.nom}.`,
        canCancel: false,
      }, { status: 400 })
    }

    if (!rdv.stripe_payment_intent_id) {
      // Pas de paiement en ligne, pas de refund à faire. On retourne OK pour que
      // l'appelant procède juste à l'update statut='annule'.
      return NextResponse.json({ ok: true, refunded: false, reason: 'aucun paiement en ligne' })
    }

    if (rdv.stripe_refund_id) {
      return NextResponse.json({ ok: true, refunded: true, reason: 'déjà remboursé', refund_id: rdv.stripe_refund_id })
    }

    // Refund Stripe
    const refund = await stripe.refunds.create({
      payment_intent: rdv.stripe_payment_intent_id,
      reason: 'requested_by_customer',
      metadata: {
        yoppaa_rdv_id: rdv.id,
        cancelled_by: isClient ? 'client' : isCommercant ? 'commercant' : 'admin',
        raison: (raison || '').slice(0, 480),
      },
    }, {
      stripeAccount: rdv.commercant?.stripe_account_id  // pour Direct Charge : refund sur le compte du commerçant
    })

    // Met à jour le RDV. Le statut='annule' est mis ailleurs (par l'API qui appelle ce refund).
    await supabase
      .from('rdv_reservations')
      .update({
        stripe_refund_id: refund.id,
        stripe_refund_amount: refund.amount / 100,
        stripe_refund_date: new Date().toISOString(),
      })
      .eq('id', rdv_id)

    return NextResponse.json({ ok: true, refunded: true, refund_id: refund.id, amount: refund.amount / 100 })

  } catch (e) {
    console.error('[stripe/refund]', e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: e?.status || 500 }
    )
  }
}
