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
import { stripe, requireStripe } from '@/lib/stripe'
import { envoyerAuCommercant, emailCommandeAnnuleeYopper, emailCommandeAnnuleeCommercant } from '@/lib/resend'
import { brusselsInstant } from '@/lib/timezone'
import { annulerPush } from '@/lib/onesignal'
import { recrediterBon } from '@/lib/bons-cadeaux-server'
import { rendreRecompense } from '@/lib/fidelite-recompense-server'
import { restaurerStockVariantes } from '@/lib/stock-variantes-server'
import { referenceCommande } from '@/lib/numero-commande'
import { libelleOptions } from '@/lib/options-ligne'

export async function POST(request) {
  try {
    requireStripe()

    const body = await request.json()
    const { commande_id, token, client_email } = body

    // 2 modes d'auth (au moins un requis) :
    //   - commande_id + client_email : bouton "Annuler" depuis l'étape 4 confirmation
    //   - token (seul)               : lien direct depuis email confirmation
    if (!commande_id && !token) {
      return NextResponse.json({ ok: false, error: 'commande_id (+ client_email) ou token requis.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ─── 1) Récup commande + commerçant + créneau (lookup par id OU par token) ─
    const selectCols = `
      id, statut, paye_en_ligne, total, stripe_payment_intent_id,
      client_email, client_nom, annulation_token, created_at, commercant_id,
      numero_commande, numero_prefixe, date_commande, creneau_id, rappel_push_id,
      bon_cadeau_id, bon_cadeau_montant, fidelite_recompense_id, fidelite_remise,
      commercants:commercant_id (id, nom, slug, stripe_account_id, delai_annulation_heures),
      creneau:creneaux!creneau_id (heure_debut)
    `
    const query = supabase.from('commandes').select(selectCols)
    const { data: cmd, error: errCmd } = await (commande_id
      ? query.eq('id', commande_id).single()
      : query.eq('annulation_token', token).single())
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

    // ─── 4) Vérif cutoff (X heures AVANT le créneau de retrait) ────────────
    // Logique : on annule jusqu'à `delai_annulation_heures` heures AVANT
    // l'heure de retrait (default 2h). Pas basé sur le paiement : un client
    // qui paie 3 jours à l'avance pour un retrait à J+3 doit pouvoir annuler
    // jusqu'à 2h avant J+3, pas seulement les 2h qui suivent le paiement.
    const commercant = cmd.commercants
    const delaiH = commercant?.delai_annulation_heures ?? 2
    const heureDebut = cmd.creneau?.heure_debut || '23:59:59'
    // Instant du retrait en heure murale Europe/Brussels, DST-aware (été +02:00 /
    // hiver +01:00) via brusselsInstant : sinon la deadline tombait 1h trop tôt
    // en hiver et pénalisait le client.
    const retraitDate = brusselsInstant(cmd.date_commande, heureDebut)
    const cutoffDate = new Date(retraitDate.getTime() - delaiH * 60 * 60 * 1000)
    const now = new Date()
    if (now > cutoffDate) {
      const heureFR = heureDebut.slice(0, 5)
      return NextResponse.json({
        ok: false,
        cutoff_expired: true,
        cutoff_date: cutoffDate.toISOString(),
        error: `Délai d'annulation dépassé. Tu pouvais annuler jusqu'à ${delaiH}h avant ton retrait (${heureFR}). Contacte directement ${commercant?.nom || 'le commerçant'}.`,
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
    // ⚠️ `.neq('statut', 'annulee_client_refund')` ET `.select()` : l'UPDATE ne
    // rend une ligne QUE s'il a réellement fait basculer la commande. C'est ce
    // qui garantit qu'un double clic, ou un rejeu, ne rende pas le stock deux
    // fois quelques lignes plus bas.
    const { data: basculees, error: errUpd } = await supabase
      .from('commandes')
      .update({
        statut: 'annulee_client_refund',
        annulee_at: new Date().toISOString(),
        annulation_motif: 'client',
      })
      .eq('id', cmd.id)
      .neq('statut', 'annulee_client_refund')
      .select('id')
    if (errUpd) {
      console.error('[commande/cancel] UPDATE statut KO', errUpd)
      return NextResponse.json({ ok: false, error: 'Erreur mise à jour commande.' }, { status: 500 })
    }

    // ─── Rendre le stock des VERSIONS (boutique détail) ────────────────────
    // Leur stock est décrémenté EN DUR à la commande, avant le paiement, et
    // personne ne le rendait : une annulation retirait la pièce des rayons de
    // Yoppaa alors qu'elle était toujours sur l'étagère du magasin.
    if ((basculees || []).length > 0) {
      const restitution = await restaurerStockVariantes(supabase, [cmd.id])
      if (!restitution.ok) {
        console.error('[commande/cancel] restitution stock versions KO', restitution.error, { commande_id: cmd.id })
      }
    }

    // Bon cadeau utilisé sur la commande : la part payée par le bon revient
    // SUR le bon (le refund Stripe ne couvre que la part carte). Idempotent
    // via l'index unique source='annulation' — le webhook charge.refunded
    // fait le même appel en backup, un seul des deux passe.
    if (cmd.bon_cadeau_id && Number(cmd.bon_cadeau_montant) > 0) {
      const rec = await recrediterBon(supabase, cmd.bon_cadeau_id, cmd.bon_cadeau_montant, cmd.id)
      if (!rec.ok) console.error('[commande/cancel] re-crédit bon cadeau KO', rec.error, { commande_id: cmd.id })
    }

    // ⚠️ ET LA RÉCOMPENSE DE FIDÉLITÉ AVEC, pour la même raison exactement :
    // une commande annulée n'a pas eu lieu. La laisser consommée ferait perdre
    // au Yopper une carte entière sur une commande qu'il n'a jamais reçue, et
    // il n'a aucun moyen de la récupérer lui-même. `rendreRecompense` ne rend
    // que ce qui est effectivement pris : le webhook de remboursement fait le
    // même appel en secours, un seul des deux passe.
    if (cmd.fidelite_recompense_id) {
      const { data: recFid } = await supabase
        .from('fidelite_recompenses')
        .select('id, carte_id, utilisee_at')
        .eq('id', cmd.fidelite_recompense_id)
        .maybeSingle()
      if (recFid?.utilisee_at) await rendreRecompense(supabase, recFid)
    }

    // Annule le rappel push programmé (30 min avant retrait) s'il existe :
    // sinon le Yopper recevrait « bientôt l'heure de ton retrait » sur une
    // commande annulée. Best-effort, non bloquant.
    if (cmd.rappel_push_id) {
      annulerPush(cmd.rappel_push_id).catch(() => {})
    }

    // ─── 7) Cleanup réservations stock résiduelles ─────────────────────────
    // Normalement déjà nettoyé par le webhook commande-succeeded, mais defensive
    // pour le cas annulation pendant 'paiement_en_attente' (avant webhook).
    await supabase
      .from('commande_stock_reservation')
      .delete()
      .eq('commande_id', cmd.id)

    // ─── 8) Email confirmation annulation ──────────────────────────────────
    // Appel DIRECT des helpers (pas de fetch HTTP interne fragile, cf. pattern RDV)
    const refundManuel = !!refundError
    // Fetch articles + créneau (pas chargés à l'étape 1 car pas nécessaires pour cancel).
    // NB : commande_articles a quantite/prix_unitaire/options(jsonb), PAS prix_total
    // ni option_libelle (calculés ici côté JS).
    const { data: details } = await supabase
      .from('commandes')
      .select(`
        creneau:creneaux(heure_debut, heure_fin),
        articles:commande_articles(quantite, prix_unitaire, options, article:articles(nom))
      `)
      .eq('id', cmd.id)
      .single()
    const articlesFlat = (details?.articles || []).map(a => ({
      nom:            a.article?.nom || '—',
      quantite:       a.quantite,
      option_libelle: libelleOptions(a.options),
      prix_total:     Number(a.prix_unitaire || 0) * Number(a.quantite || 0),
    }))

    if (cmd.client_email) {
      try {
        const html = emailCommandeAnnuleeYopper({
          yopper_prenom:   cmd.client_nom?.split(' ')[0] || 'Yopper',
          commercant_nom:  commercant?.nom || '',
          numero_commande: referenceCommande(cmd),
          total:           cmd.total,
          // 🔴 CES DEUX MONTANTS MANQUAIENT (Alex, 27/08 : « rien ne dit que
          // les 10 € de fidélité ont été remis »). La récompense EST bien
          // rendue quelques lignes plus haut ; c'est l'email qui se taisait.
          //
          // ⚠️ ET C'EST LE FRÈRE NON TRAITÉ. Les gabarits ont été corrigés le
          // 26/08 pour l'AUTRE route d'annulation, `/api/emails/commande-annulee`.
          // Celle-ci compose ses propres appels, et personne n'est allé voir.
          // Le gabarit se taisait donc en silence : `Number(undefined)` n'est
          // pas fini, aucune erreur, juste une ligne qui ne sort pas.
          fidelite_remise:    cmd.fidelite_remise,
          bon_cadeau_montant: cmd.bon_cadeau_montant,
          refund_manuel:   refundManuel,
          paye_en_ligne:   !!cmd.paye_en_ligne,
        })
        await envoyerAuCommercant({
          to: cmd.client_email,
          subject: `Ta commande chez ${commercant?.nom || 'le commerçant'} a été annulée`,
          html,
        })
      } catch (e) {
        console.error('[commande/cancel] envoi email Yopper KO', e?.message)
      }
    }
    // Récup email commerçant
    const { data: commercantFull } = await supabase
      .from('commercants')
      .select('email')
      .eq('id', commercant.id)
      .single()
    if (commercantFull?.email) {
      try {
        const html = emailCommandeAnnuleeCommercant({
          nom_commercant:  commercant.nom,
          yopper_prenom:   cmd.client_nom?.split(' ')[0],
          yopper_nom:      cmd.client_nom?.split(' ').slice(1).join(' '),
          numero_commande: referenceCommande(cmd),
          articles:        articlesFlat,
          total:           cmd.total,
          date_retrait:    cmd.date_commande,
          heure_debut:     details?.creneau?.heure_debut,
          heure_fin:       details?.creneau?.heure_fin,
          fidelite_remise:    cmd.fidelite_remise,
          bon_cadeau_montant: cmd.bon_cadeau_montant,
          refund_manuel:   refundManuel,
          paye_en_ligne:   !!cmd.paye_en_ligne,
        })
        await envoyerAuCommercant({
          to: commercantFull.email,
          subject: `Commande #${referenceCommande(cmd) || ''} annulée — ${cmd.client_nom?.split(' ')[0] || 'Yopper'}`,
          html,
        })
      } catch (e) {
        console.error('[commande/cancel] envoi email commerçant KO', e?.message)
      }
    }

    return NextResponse.json({
      ok: true,
      commande_id: cmd.id,
      numero_commande: referenceCommande(cmd),
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
