// POST /api/commande/cancel
//
// Annulation par le client (Yopper) d'une commande C&C alim avant le cutoff
// configuré par le commerçant (`commercants.delai_annulation_heures`, default 2h).
//
// Auth flexible :
//   - via `token`         → lien direct depuis email confirmation (annulation_token)
//   - via `client_email`  → bouton "Annuler" sur l'étape 4 confirmation
//
// Effets :
//   1. Refund Stripe automatique si paye_en_ligne=true (Direct Charge sur compte connecté)
//   2. Commande statut → 'annulee_client_refund', annulee_at=now, annulation_motif='client'
//   3. DELETE commande_stock_reservation (libération immédiate du stock)
//   4. Email confirmation annulation (Yopper + commerçant) fire-and-forget

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG } from '@/lib/stripe'

export async function POST(request) {
  try {
    requireStripe()

    const body = await request.json()
    const { commande_id, token, client_email } = body

    if (!commande_id) {
      return NextResponse.json({ ok: false, error: 'commande_id requis.' }, { status: 400 })
    }
    if (!token && !client_email) {
      return NextResponse.json({ ok: false, error: 'Token ou email requis pour identifier le client.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ─── 1) Récup commande + commerçant ────────────────────────────────────
    const { data: cmd, error: errCmd } = await supabase
      .from('commandes')
      .select(`
        id, statut, paye_en_ligne, total, stripe_payment_intent_id,
        client_email, client_nom, annulation_token, created_at, commercant_id,
        numero_commande, date_commande,
        commercants:commercant_id (id, nom, slug, stripe_account_id, delai_annulation_heures)
      `)
      .eq('id', commande_id)
      .single()
    if (errCmd || !cmd) {
      return NextResponse.json({ ok: false, error: 'Commande introuvable.' }, { status: 404 })
    }

    // ─── 2) Auth : token (lien email) OR email (bouton confirmation) ────────
    const tokenOk = token && cmd.annulation_token && String(token).toLowerCase() === String(cmd.annulation_token).toLowerCase()
    const emailOk = client_email && cmd.client_email && String(client_email).trim().toLowerCase() === String(cmd.client_email).trim().toLowerCase()
    if (!tokenOk && !emailOk) {
      return NextResponse.json({ ok: false, error: 'Accès refusé : token ou email invalide.' }, { status: 403 })
    }

    // ─── 3) Idempotence ────────────────────────────────────────────────────
    if (cmd.statut === 'annulee_client_refund') {
      return NextResponse.json({
        ok: true,
        already_canceled: true,
        commande_id: cmd.id,
        message: 'Cette commande est déjà annulée.',
      })
    }

    // Commandes déjà closes (récupérées, non retirées, paiement KO) : pas d'annulation possible
    const statutsTermines = ['recupere', 'non_retire', 'annulee_paiement_ko']
    if (statutsTermines.includes(cmd.statut)) {
      return NextResponse.json({
        ok: false,
        error: `Annulation impossible : la commande est au statut "${cmd.statut}".`,
      }, { status: 400 })
    }

    // Statuts autorisés à l'annulation client : paiement_en_attente, en_attente, en_preparation
    const statutsAnnulables = ['paiement_en_attente', 'en_attente', 'en_preparation']
    if (!statutsAnnulables.includes(cmd.statut)) {
      // Statut 'pret' : on bloque ici (commerçant a préparé, refund manuel à coordonner)
      return NextResponse.json({
        ok: false,
        error: `Trop tard : ta commande est prête à retirer. Contacte directement ${cmd.commercants?.nom || 'le commerçant'} pour gérer l'annulation.`,
      }, { status: 400 })
    }

    // ─── 4) Vérif cutoff (created_at + delai_annulation_heures) ─────────────
    const commercant = cmd.commercants
    const delaiH = commercant?.delai_annulation_heures ?? 2
    const createdAt = new Date(cmd.created_at)
    const cutoffDate = new Date(createdAt.getTime() + delaiH * 60 * 60 * 1000)
    const now = new Date()
    if (now > cutoffDate) {
      return NextResponse.json({
        ok: false,
        cutoff_expired: true,
        cutoff_date: cutoffDate.toISOString(),
        error: `Délai d'annulation dépassé (${delaiH}h après la commande). Contacte directement ${commercant?.nom || 'le commerçant'}.`,
      }, { status: 403 })
    }

    // ─── 5) Refund Stripe (Direct Charge sur compte connecté) ──────────────
    let refundId = null
    let refundStatus = null
    let refundError = null
    if (cmd.paye_en_ligne && cmd.stripe_payment_intent_id) {
      if (!commercant?.stripe_account_id) {
        // Compte Connect manquant : on bloque l'annulation (impossible de refund proprement)
        return NextResponse.json({
          ok: false,
          error: 'Compte Stripe commerçant indisponible — annulation impossible pour le moment.',
        }, { status: 500 })
      }
      try {
        const refund = await stripe.refunds.create({
          payment_intent: cmd.stripe_payment_intent_id,
          reason: 'requested_by_customer',
          metadata: {
            yoppaa_commande_id: cmd.id,
            yoppaa_motif: 'client',
          },
        }, {
          stripeAccount: commercant.stripe_account_id,
        })
        refundId = refund.id
        refundStatus = refund.status
      } catch (e) {
        // Refund Stripe échoué : on log et continue le UPDATE statut.
        // Le commerçant pourra refund manuellement depuis Stripe Dashboard
        // (et l'email annulation mentionnera le refund manuel).
        console.error('[commande/cancel] refund Stripe KO', e?.message, { commande_id: cmd.id, pi: cmd.stripe_payment_intent_id })
        refundError = e?.message || 'Refund Stripe échoué'
      }
    }

    // ─── 6) UPDATE commande (statut + annulee_at + motif) ──────────────────
    const { error: errUpd } = await supabase
      .from('commandes')
      .update({
        statut: 'annulee_client_refund',
        annulee_at: new Date().toISOString(),
        annulation_motif: 'client',
      })
      .eq('id', cmd.id)
    if (errUpd) {
      console.error('[commande/cancel] UPDATE statut KO', errUpd)
      return NextResponse.json({ ok: false, error: 'Erreur mise à jour commande.' }, { status: 500 })
    }

    // ─── 7) Cleanup réservations stock résiduelles ─────────────────────────
    // Normalement déjà nettoyé par le webhook commande-succeeded, mais defensive
    // pour le cas annulation pendant 'paiement_en_attente' (avant webhook).
    await supabase
      .from('commande_stock_reservation')
      .delete()
      .eq('commande_id', cmd.id)

    // ─── 8) Email confirmation annulation (fire-and-forget) ────────────────
    fetch(`${STRIPE_CONFIG.appUrl}/api/emails/commande-annulee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commande_id: cmd.id,
        refund_status: refundStatus,
        refund_error: refundError,
      }),
    }).catch(e => console.warn('[commande/cancel] email fire-and-forget KO', e?.message))

    return NextResponse.json({
      ok: true,
      commande_id: cmd.id,
      numero_commande: cmd.numero_commande,
      refund_id: refundId,
      refund_status: refundStatus,
      refund_error: refundError,
      message: cmd.paye_en_ligne
        ? (refundError
          ? 'Ta commande est annulée. Le remboursement sera traité manuellement par le commerçant sous quelques jours.'
          : 'Ta commande est annulée. Le remboursement arrivera sur ton moyen de paiement dans 5 à 10 jours.')
        : 'Ta commande est annulée.',
    })
  } catch (e) {
    console.error('[commande/cancel]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: e?.status || 500 })
  }
}
