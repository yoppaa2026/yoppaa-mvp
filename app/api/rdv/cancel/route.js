// POST /api/rdv/cancel
//
// Annulation par le client (Yopper) d'un RDV vitrine avant le cutoff configuré
// par le commerçant (`commercants.rdv_delai_annulation_heures`, default 24h).
//
// Auth flexible (pattern M1 commande/cancel) :
//   - via `token`           → lien direct depuis email confirmation (annulation_token)
//   - via rdv_id + email    → bouton "Annuler" depuis la vue Mes RDVs Yopper
//
// Effets :
//   1. Refund Stripe automatique si stripe_payment_intent_id + Direct Charge
//   2. RDV statut → 'annule_client', motif_annulation = 'yopper'
//   3. Stockage stripe_refund_id/amount/date (colonnes existantes)
//   4. Email annulation Yopper + iCal CANCEL (appel direct emailRdvAnnule)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe } from '@/lib/stripe'
import { envoyerAuCommercant, emailRdvAnnule } from '@/lib/resend'
import { generateRdvIcs, icsToBase64Attachment } from '@/lib/ical'

export async function POST(request) {
  try {
    requireStripe()

    const body = await request.json()
    const { rdv_id, token, client_email } = body

    if (!rdv_id && !token) {
      return NextResponse.json({ ok: false, error: 'rdv_id (+ client_email) ou token requis.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ─── 1) Récup RDV + commerçant + prestation (lookup par id OU par token) ─
    const selectCols = `
      id, statut, acompte_paye, acompte_montant, stripe_payment_intent_id,
      stripe_refund_id, client_email, client_prenom, client_nom, annulation_token,
      date_rdv, heure_debut, heure_fin, duree_minutes, motif_annulation,
      commercant_id,
      commercant:commercants(id, nom, slug, adresse, stripe_account_id, rdv_delai_annulation_heures),
      prestation:rdv_prestations(nom)
    `
    const query = supabase.from('rdv_reservations').select(selectCols).is('deleted_at', null)
    const { data: rdv, error: errRdv } = await (rdv_id
      ? query.eq('id', rdv_id).single()
      : query.eq('annulation_token', token).single())
    if (errRdv || !rdv) {
      return NextResponse.json({ ok: false, error: 'RDV introuvable.' }, { status: 404 })
    }

    // ─── 2) Auth : token OR email ──────────────────────────────────────────
    const tokenOk = token && rdv.annulation_token && String(token).toLowerCase() === String(rdv.annulation_token).toLowerCase()
    const emailOk = client_email && rdv.client_email && String(client_email).trim().toLowerCase() === String(rdv.client_email).trim().toLowerCase()
    if (!tokenOk && !emailOk) {
      return NextResponse.json({ ok: false, error: 'Accès refusé : token ou email invalide.' }, { status: 403 })
    }

    // ─── 3) Idempotence ────────────────────────────────────────────────────
    if (rdv.statut === 'annule_client' || rdv.statut === 'annule_commercant') {
      return NextResponse.json({
        ok: true,
        already_canceled: true,
        rdv_id: rdv.id,
        message: 'Ce RDV est déjà annulé.',
      })
    }

    // Statuts non annulables : honore (déjà passé), no_show (déjà manqué)
    if (['honore', 'no_show'].includes(rdv.statut)) {
      return NextResponse.json({
        ok: false,
        error: `Annulation impossible : ce RDV est au statut "${rdv.statut}".`,
      }, { status: 400 })
    }

    // ─── 4) Vérif cutoff (date_rdv + heure_debut - delai_annulation_heures) ─
    const commercant = rdv.commercant
    const delaiH = commercant?.rdv_delai_annulation_heures ?? 24
    const rdvISO = `${rdv.date_rdv}T${rdv.heure_debut}+02:00`  // Europe/Brussels
    const rdvDate = new Date(rdvISO)
    const cutoffDate = new Date(rdvDate.getTime() - delaiH * 60 * 60 * 1000)
    const now = new Date()
    if (now > cutoffDate) {
      const heureFR = rdv.heure_debut?.slice(0, 5) || ''
      return NextResponse.json({
        ok: false,
        cutoff_expired: true,
        cutoff_date: cutoffDate.toISOString(),
        error: `Délai d'annulation dépassé. Tu pouvais annuler jusqu'à ${delaiH}h avant ton RDV (${heureFR}). Contacte directement ${commercant?.nom || 'le commerçant'}.`,
      }, { status: 403 })
    }

    // ─── 5) Refund Stripe (Direct Charge sur compte connecté) ──────────────
    let refundId = null
    let refundStatus = null
    let refundError = null
    if (rdv.acompte_paye && rdv.stripe_payment_intent_id && !rdv.stripe_refund_id) {
      if (!commercant?.stripe_account_id) {
        return NextResponse.json({
          ok: false,
          error: 'Compte Stripe commerçant indisponible, annulation impossible pour le moment.',
        }, { status: 500 })
      }
      try {
        const refund = await stripe.refunds.create({
          payment_intent: rdv.stripe_payment_intent_id,
          reason: 'requested_by_customer',
          metadata: {
            yoppaa_rdv_id: rdv.id,
            yoppaa_motif: 'client',
          },
        }, {
          stripeAccount: commercant.stripe_account_id,
        })
        refundId = refund.id
        refundStatus = refund.status
      } catch (e) {
        console.error('[rdv/cancel] refund Stripe KO', e?.message, { rdv_id: rdv.id, pi: rdv.stripe_payment_intent_id })
        refundError = e?.message || 'Refund Stripe échoué'
      }
    }

    // ─── 6) UPDATE RDV (statut + motif + refund cols) ──────────────────────
    const updateData = {
      statut: 'annule_client',
      motif_annulation: 'yopper',
    }
    if (refundId) {
      updateData.stripe_refund_id = refundId
      updateData.stripe_refund_amount = rdv.acompte_montant
      updateData.stripe_refund_date = new Date().toISOString()
    }
    const { error: errUpd } = await supabase
      .from('rdv_reservations')
      .update(updateData)
      .eq('id', rdv.id)
    if (errUpd) {
      console.error('[rdv/cancel] UPDATE statut KO', errUpd)
      return NextResponse.json({ ok: false, error: 'Erreur mise à jour RDV.' }, { status: 500 })
    }

    // ─── 7) Email annulation Yopper (avec iCal CANCEL en pièce jointe) ─────
    if (rdv.client_email) {
      try {
        const html = emailRdvAnnule({
          yopper_prenom:     rdv.client_prenom || 'Yopper',
          commercant_nom:    commercant?.nom || '',
          commercant_slug:   commercant?.slug || '',
          prestation_nom:    rdv.prestation?.nom || '',
          date_rdv:          rdv.date_rdv,
          heure_debut:       rdv.heure_debut,
          acompte_paye:      !!rdv.acompte_paye,
          acompte_montant:   rdv.acompte_montant,
          refund_en_cours:   !!refundId && !refundError,
          raison_annulation: 'yopper',
        })
        // iCal CANCEL (SEQUENCE+1 par rapport au confirme initial)
        const ics = generateRdvIcs({
          rdv_id:       rdv.id,
          date_rdv:     rdv.date_rdv,
          heure_debut:  rdv.heure_debut,
          heure_fin:    rdv.heure_fin,
          duree_minutes:rdv.duree_minutes,
          commercant_nom:commercant?.nom || '',
          commercant_adresse: commercant?.adresse || '',
          prestation_nom: rdv.prestation?.nom || '',
          method: 'CANCEL',
          sequence: 1,
        })
        const attachments = ics ? [icsToBase64Attachment(ics, `yoppaa-rdv-annulation-${rdv.id}.ics`)] : null
        await envoyerAuCommercant({
          to: rdv.client_email,
          subject: `Ton RDV chez ${commercant?.nom || 'le commerçant'} a été annulé`,
          html,
          attachments,
        })
      } catch (e) {
        console.error('[rdv/cancel] envoi email Yopper KO', e?.message)
      }
    }

    return NextResponse.json({
      ok: true,
      rdv_id: rdv.id,
      refund_id: refundId,
      refund_status: refundStatus,
      refund_error: refundError,
      message: rdv.acompte_paye
        ? (refundError
          ? 'Ton RDV est annulé. Le remboursement de l\'acompte sera traité manuellement par le commerçant sous quelques jours.'
          : 'Ton RDV est annulé. L\'acompte sera recrédité sur ton moyen de paiement dans 5 à 10 jours.')
        : 'Ton RDV est annulé.',
    })
  } catch (e) {
    console.error('[rdv/cancel]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: e?.status || 500 })
  }
}
