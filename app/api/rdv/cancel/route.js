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
import { brusselsInstant } from '@/lib/timezone'
import { annulerPush } from '@/lib/onesignal'

export async function POST(request) {
  try {
    requireStripe()

    const body = await request.json()
    // `produits_choix` : 'garde' ou 'rend'. Demandé au client quand le
    // rendez-vous porte des produits payés dans le même paiement. Ce n'est pas
    // un détail de confort : c'est lui qui décide du montant remboursé, et la
    // trace de sa décision si la banque conteste plus tard.
    const { rdv_id, token, client_email, produits_choix } = body

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
      commercant_id, rappel_push_id, commande_id,
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
    // Instant du RDV en heure murale Europe/Brussels, DST-aware (été +02:00 /
    // hiver +01:00) via brusselsInstant : sinon la deadline tombait 1h trop tôt
    // en hiver et pénalisait le client.
    const rdvDate = brusselsInstant(rdv.date_rdv, rdv.heure_debut)
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

    // ─── 4.5) Le rendez-vous porte-t-il des produits déjà payés ? ───────────
    //
    // Si oui, le client tranche : il garde sa marchandise, ou il rend tout.
    // On ne décide pas à sa place. Garder les produits est souvent ce qu'il
    // veut (le shampoing est bon quel que soit le jour de la coupe), mais lui
    // imposer une commande dont il ne veut plus serait une vente forcée.
    let commandeLiee = null
    if (rdv.commande_id) {
      const { data: cmd } = await supabase
        .from('commandes')
        .select('id, statut, total, paye_en_ligne')
        .eq('id', rdv.commande_id)
        .maybeSingle()
      // Une commande déjà annulée ne pose plus de question.
      if (cmd && !['annulee_client_refund', 'annulee_paiement_ko'].includes(cmd.statut)) {
        commandeLiee = cmd
      }
    }

    if (commandeLiee && produits_choix !== 'garde' && produits_choix !== 'rend') {
      const { data: lignes } = await supabase
        .from('commande_articles')
        .select('quantite, prix_unitaire, article:articles(nom)')
        .eq('commande_id', commandeLiee.id)
      return NextResponse.json({
        ok: false,
        choix_produits_requis: true,
        rdv_id: rdv.id,
        produits: {
          total: Number(commandeLiee.total),
          acompte: Number(rdv.acompte_montant || 0),
          lignes: (lignes || []).map(l => ({
            nom: l.article?.nom || 'Article',
            quantite: l.quantite,
            total: Number(l.prix_unitaire) * l.quantite,
          })),
        },
      }, { status: 409 })
    }

    const gardeSesProduits = !!commandeLiee && produits_choix === 'garde'

    // ─── 5) Refund Stripe (Direct Charge sur compte connecté) ──────────────
    //
    // Montant remboursé :
    //   • rendez-vous seul                  → l'acompte, c'est tout ce qui a
    //     été encaissé ;
    //   • rendez-vous + produits rendus     → la totalité du paiement ;
    //   • rendez-vous + produits gardés     → l'acompte SEUL, remboursement
    //     partiel : la marchandise reste vendue et attend le client en
    //     boutique.
    let refundId = null
    let refundStatus = null
    let refundError = null
    let refundMontant = null

    const acompteMontant = Number(rdv.acompte_montant || 0)
    const aRembourser = gardeSesProduits
      ? acompteMontant
      : acompteMontant + Number(commandeLiee?.total || 0)
    const aDejaPaye = (rdv.acompte_paye || !!commandeLiee) && rdv.stripe_payment_intent_id

    if (aDejaPaye && !rdv.stripe_refund_id && aRembourser > 0) {
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
          // Remboursement partiel quand le client garde ses produits. Sans
          // `amount`, Stripe rembourse la totalité, produits compris.
          ...(gardeSesProduits ? { amount: Math.round(aRembourser * 100) } : {}),
          metadata: {
            yoppaa_rdv_id: rdv.id,
            yoppaa_motif: 'client',
            ...(commandeLiee ? { yoppaa_produits: produits_choix } : {}),
          },
        }, {
          stripeAccount: commercant.stripe_account_id,
        })
        refundId = refund.id
        refundStatus = refund.status
        refundMontant = aRembourser
      } catch (e) {
        console.error('[rdv/cancel] refund Stripe KO', e?.message, { rdv_id: rdv.id, pi: rdv.stripe_payment_intent_id })
        refundError = e?.message || 'Refund Stripe échoué'
      }
    }

    // ─── 5.5) Sort de la commande liée ─────────────────────────────────────
    // Le client rend ses produits : la commande est annulée et le stock
    // redevient disponible, le statut 'annulee_client_refund' étant justement
    // celui que le comptage de stock ignore. S'il les garde, la commande vit
    // sa vie : elle sera retirée en boutique.
    if (commandeLiee && !gardeSesProduits) {
      const { error: errCmd } = await supabase
        .from('commandes')
        .update({ statut: 'annulee_client_refund' })
        .eq('id', commandeLiee.id)
      if (errCmd) console.error('[rdv/cancel] annulation commande liée KO', errCmd.message, { commandeId: commandeLiee.id })
    }

    // ─── 6) UPDATE RDV (statut + motif + refund cols) ──────────────────────
    const updateData = {
      statut: 'annule_client',
      motif_annulation: 'yopper',
    }
    if (refundId) {
      updateData.stripe_refund_id = refundId
      // Le montant réellement remboursé, pas l'acompte : quand le client rend
      // ses produits, il récupère aussi leur prix.
      updateData.stripe_refund_amount = refundMontant
      updateData.stripe_refund_date = new Date().toISOString()
    }
    if (commandeLiee) updateData.produits_annulation = produits_choix
    const { error: errUpd } = await supabase
      .from('rdv_reservations')
      .update(updateData)
      .eq('id', rdv.id)
    if (errUpd) {
      console.error('[rdv/cancel] UPDATE statut KO', errUpd)
      return NextResponse.json({ ok: false, error: 'Erreur mise à jour RDV.' }, { status: 500 })
    }

    // Annule le rappel push programmé (1h avant) s'il existe. Best-effort.
    if (rdv.rappel_push_id) {
      annulerPush(rdv.rappel_push_id).catch(() => {})
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
        // ⚠️ CORRIGÉ LE 05/08 : cet appel passait `rdv_id` alors que la
        // fonction attend `id`, et `prestation_nom` pouvait être vide. Le
        // générateur levait donc une exception à tous les coups, avalée par le
        // try qui entoure tout le bloc : le client n'a JAMAIS reçu son email
        // d'annulation. Le champ obligatoire porte maintenant le bon nom.
        const ics = generateRdvIcs({
          id:           rdv.id,
          date_rdv:     rdv.date_rdv,
          heure_debut:  rdv.heure_debut,
          heure_fin:    rdv.heure_fin,
          duree_minutes:rdv.duree_minutes,
          commercant_nom:commercant?.nom || 'Yoppaa',
          commercant_adresse: commercant?.adresse || '',
          prestation_nom: rdv.prestation?.nom || 'Rendez-vous',
          client_email: rdv.client_email,
          client_nom:   [rdv.client_prenom, rdv.client_nom].filter(Boolean).join(' '),
          rappel_24h:   false,
          status:       'CANCELLED',
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

    // Message : dire exactement ce qui revient et ce qui reste à récupérer.
    // Un client qui garde ses produits doit lire noir sur blanc qu'ils
    // l'attendent, sinon il croit avoir perdu son argent.
    let message
    if (refundError) {
      message = 'Ton RDV est annulé. Le remboursement sera traité manuellement par le commerçant sous quelques jours.'
    } else if (gardeSesProduits) {
      message = refundMontant > 0
        ? `Ton RDV est annulé. Tes ${refundMontant.toFixed(2)}€ d'acompte reviennent sur ton moyen de paiement dans 5 à 10 jours, et tes produits t'attendent en boutique.`
        : 'Ton RDV est annulé. Tes produits t\'attendent en boutique.'
    } else if (refundMontant > 0) {
      message = `Ton RDV est annulé. ${refundMontant.toFixed(2)}€ reviennent sur ton moyen de paiement dans 5 à 10 jours.`
    } else {
      message = 'Ton RDV est annulé.'
    }

    return NextResponse.json({
      ok: true,
      rdv_id: rdv.id,
      refund_id: refundId,
      refund_status: refundStatus,
      refund_error: refundError,
      refund_montant: refundMontant,
      produits_choix: commandeLiee ? produits_choix : null,
      message,
    })
  } catch (e) {
    console.error('[rdv/cancel]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: e?.status || 500 })
  }
}
