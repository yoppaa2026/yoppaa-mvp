// POST /api/rdv/annuler-commercant
//
// 🔴 CETTE ROUTE N'EXISTAIT PAS, ET C'EST LE TROU LE PLUS COÛTEUX DU 29/08.
//
// Quand un commerçant annulait un rendez-vous, le tableau de bord faisait un
// simple `update` du statut DEPUIS LE NAVIGATEUR, puis envoyait un email. Il
// portait même son propre aveu en commentaire : « le commerçant refund
// manuellement via Stripe Dashboard ». Résultat, un salon qui ferme sa journée :
//
//   • l'acompte n'était PAS remboursé,
//   • le bon cadeau n'était PAS recrédité,
//   • la récompense de fidélité n'était PAS rendue,
//   • et le client recevait un email qui ne parlait d'argent nulle part.
//
// Le Yopper perdait donc tout, sur une annulation dont il n'était même pas
// responsable. C'est exactement ce que `/api/rdv/cancel` fait correctement pour
// l'annulation par le client : le geste n'avait jamais été porté de ce côté.
//
// ⚠️ ET ÇA DEVAIT DEVENIR UNE ROUTE SERVEUR. Un remboursement, un re-crédit de
// bon et un rendu de récompense sont des écritures d'argent : elles ne peuvent
// pas partir du navigateur du commerçant, où rien ne prouve qui appelle. La
// garde est celle des dix autres routes du tableau de bord.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe } from '@/lib/stripe'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { recrediterBon } from '@/lib/bons-cadeaux-server'
import { rendreRecompense } from '@/lib/fidelite-recompense-server'
import { annulerPush } from '@/lib/onesignal'

const arr = (n) => Math.round(Number(n || 0) * 100) / 100

export async function POST(request) {
  try {
    const { rdv_id, raison = 'commercant' } = await request.json()
    if (!rdv_id) {
      return NextResponse.json({ ok: false, error: 'rdv_id requis.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const verdict = await gardeSurLigne(request, supabase, 'rdv_reservations', rdv_id)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, statut, acompte_paye, acompte_montant, stripe_payment_intent_id, stripe_refund_id,
        commande_id, fidelite_recompense_id, bon_cadeau_id, bon_cadeau_montant,
        rappel_push_id, commercant_id,
        commercant:commercants(stripe_account_id)
      `)
      .eq('id', rdv_id)
      .is('deleted_at', null)
      .single()

    if (!rdv) return NextResponse.json({ ok: false, error: 'RDV introuvable.' }, { status: 404 })

    // Idempotence : rejouer une annulation ne rembourse pas deux fois.
    if (rdv.statut === 'annule_client' || rdv.statut === 'annule_commercant') {
      return NextResponse.json({ ok: true, already_canceled: true, rdv_id: rdv.id })
    }

    // ─── La commande de produits liée, s'il y en a une ──────────────────────
    // ⚠️ ELLE EST TOUJOURS ANNULÉE ICI, contrairement à l'annulation par le
    // client. On ne demande pas au Yopper s'il garde ses shampoings quand c'est
    // le salon qui ferme : il n'a rien décidé, il récupère tout.
    let commandeLiee = null
    if (rdv.commande_id) {
      const { data: cmd } = await supabase
        .from('commandes')
        .select('id, statut, total, bon_cadeau_id, bon_cadeau_montant, fidelite_remise, fidelite_recompense_id')
        .eq('id', rdv.commande_id)
        .maybeSingle()
      if (cmd && !['annulee_client_refund', 'annulee_paiement_ko'].includes(cmd.statut)) commandeLiee = cmd
    }

    const produitsPayesCarte = commandeLiee
      ? arr(Math.max(0, Number(commandeLiee.total || 0)
          - Number(commandeLiee.bon_cadeau_montant || 0)
          - Number(commandeLiee.fidelite_remise || 0)))
      : 0
    const acompteMontant = Number(rdv.acompte_montant || 0)
    const aRembourser = arr(acompteMontant + produitsPayesCarte)

    // ─── Remboursement Stripe ──────────────────────────────────────────────
    let refundId = null
    let refundError = null
    let refundMontant = null
    const aDejaPaye = (rdv.acompte_paye || !!commandeLiee) && rdv.stripe_payment_intent_id

    if (aDejaPaye && !rdv.stripe_refund_id && aRembourser > 0) {
      if (!rdv.commercant?.stripe_account_id) {
        refundError = 'Compte Stripe indisponible'
      } else {
        try {
          requireStripe()
          const refund = await stripe.refunds.create({
            payment_intent: rdv.stripe_payment_intent_id,
            reason: 'requested_by_customer',
            metadata: { yoppaa_rdv_id: rdv.id, yoppaa_motif: raison },
          }, { stripeAccount: rdv.commercant.stripe_account_id })
          refundId = refund.id
          refundMontant = aRembourser
        } catch (e) {
          console.error('[rdv/annuler-commercant] refund KO', e?.message, { rdvId: rdv.id })
          refundError = e?.message || 'Refund Stripe échoué'
        }
      }
    }

    // ─── Statuts ───────────────────────────────────────────────────────────
    const updateData = { statut: 'annule_commercant', motif_annulation: raison }
    if (refundId) {
      updateData.stripe_refund_id = refundId
      updateData.stripe_refund_amount = refundMontant
      updateData.stripe_refund_date = new Date().toISOString()
    }
    const { error: errUpd } = await supabase.from('rdv_reservations').update(updateData).eq('id', rdv.id)
    if (errUpd) {
      console.error('[rdv/annuler-commercant] UPDATE KO', errUpd)
      return NextResponse.json({ ok: false, error: 'Erreur mise à jour du rendez-vous.' }, { status: 500 })
    }

    if (commandeLiee) {
      const { error: errCmd } = await supabase
        .from('commandes').update({ statut: 'annulee_client_refund' }).eq('id', commandeLiee.id)
      if (errCmd) console.error('[rdv/annuler-commercant] annulation commande liée KO', errCmd.message)
    }

    // ─── Ce qui n'est pas de la carte revient aussi ─────────────────────────
    const rendreAvantages = async ({ bonId, bonMontant, recompenseId, refs }) => {
      let rendu = 0
      if (bonId && Number(bonMontant) > 0) {
        const rec = await recrediterBon(supabase, bonId, Number(bonMontant), refs)
        if (!rec?.ok) console.error('[rdv/annuler-commercant] re-crédit bon KO', rec?.error, refs)
        else if (!rec.deja_recredite) rendu = Number(bonMontant)
      }
      if (recompenseId) {
        const { data: recFid } = await supabase
          .from('fidelite_recompenses').select('id, carte_id, utilisee_at').eq('id', recompenseId).maybeSingle()
        if (recFid?.utilisee_at) await rendreRecompense(supabase, recFid)
      }
      return rendu
    }

    let bonRendu = await rendreAvantages({
      bonId: rdv.bon_cadeau_id, bonMontant: rdv.bon_cadeau_montant,
      recompenseId: rdv.fidelite_recompense_id, refs: { rdv_id: rdv.id },
    })
    if (commandeLiee) {
      bonRendu += await rendreAvantages({
        bonId: commandeLiee.bon_cadeau_id, bonMontant: commandeLiee.bon_cadeau_montant,
        recompenseId: commandeLiee.fidelite_recompense_id, refs: { commande_id: commandeLiee.id },
      })
    }

    if (rdv.rappel_push_id) annulerPush(rdv.rappel_push_id).catch(() => {})

    return NextResponse.json({
      ok: true,
      rdv_id: rdv.id,
      refund_id: refundId,
      refund_montant: refundMontant,
      refund_error: refundError,
      bon_rendu: arr(bonRendu),
      produits_montant: produitsPayesCarte,
    })
  } catch (e) {
    console.error('[rdv/annuler-commercant]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
