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
import { requireStripe } from '@/lib/stripe'
import { envoyerAuCommercant, emailCommandeAnnuleeYopper, emailCommandeAnnuleeCommercant } from '@/lib/resend'
import { brusselsInstant } from '@/lib/timezone'
import { rembourserCarteCommande, effetsAnnulationCommande } from '@/lib/commande-annulation-server'
import { referenceCommande } from '@/lib/numero-commande'
import { libelleOptions } from '@/lib/options-ligne'
import { chezLeCommerce } from '@/lib/nom-commerce'

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
      bon_cadeau_id, bon_cadeau_montant, bons_utilises, fidelite_recompense_id, fidelite_remise,
      mode_retrait, rdv_reservation_id,
      commercants:commercant_id (id, nom, slug, stripe_account_id, delai_annulation_heures, categorie),
      creneau:creneaux!creneau_id (heure_debut),
      creneau_livraison:livraison_creneaux!creneau_livraison_id (heure_debut)
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
      // ⚠️ « PRÊTE », PAS « PRÊTE À RETIRER » (audit I4, 05/10) : une livraison
      // prête part chez le client, il n'a rien à retirer.
      return NextResponse.json({
        ok: false,
        error: `Trop tard : ta commande est déjà prête. Contacte directement ${cmd.commercants?.nom || 'le commerçant'} pour gérer l'annulation.`,
      }, { status: 400 })
    }

    // 🔴 UNE COMMANDE LIÉE À UN RENDEZ-VOUS NE S'ANNULE PAS ICI (audit I4,
    // 05/10). Elle partage le paiement du rendez-vous : rembourser ce paiement
    // rendrait aussi l'acompte, et le rendez-vous resterait debout. Elle suit
    // le rendez-vous, qui a sa propre annulation.
    if (cmd.rdv_reservation_id) {
      return NextResponse.json({
        ok: false,
        error: 'Ces produits sont liés à ton rendez-vous : annule le rendez-vous, ils seront annulés avec lui.',
      }, { status: 400 })
    }

    // ─── 4) Vérif cutoff (X heures AVANT le créneau de retrait) ────────────
    // Logique : on annule jusqu'à `delai_annulation_heures` heures AVANT
    // l'heure de retrait (default 2h). Pas basé sur le paiement : un client
    // qui paie 3 jours à l'avance pour un retrait à J+3 doit pouvoir annuler
    // jusqu'à 2h avant J+3, pas seulement les 2h qui suivent le paiement.
    const commercant = cmd.commercants
    const delaiH = commercant?.delai_annulation_heures ?? 2
    // 🔴 LA TOURNÉE COMPTE AUSSI (audit I4, 05/10). Seul le créneau de RETRAIT
    // était lu : en livraison il est vide, et le délai se calculait sur 23 h 59.
    // On pouvait annuler une livraison de midi à 21 h 30, le livreur déjà
    // revenu. Sans créneau du tout (retrait boutique), 23 h 59 reste juste.
    const heureDebut = cmd.creneau?.heure_debut || cmd.creneau_livraison?.heure_debut || '23:59:59'
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

    const remboursable = !!(cmd.paye_en_ligne && cmd.stripe_payment_intent_id)
    if (remboursable && !commercant?.stripe_account_id) {
      // Compte Connect manquant : on bloque l'annulation (impossible de refund proprement)
      return NextResponse.json({
        ok: false,
        error: 'Compte Stripe commerçant indisponible — annulation impossible pour le moment.',
      }, { status: 500 })
    }

    // ─── 5) LA BASCULE D'ABORD, ET UN SEUL GAGNANT ────────────────────────
    //
    // 🔴 LE REMBOURSEMENT PARTAIT AVANT L'ÉCRITURE (audit I4, 05/10), sans clé
    // d'idempotence et sans relire le statut dans l'écriture. Le commerçant qui
    // passait la commande « prête » pendant ce temps voyait son client
    // remboursé sur une commande toujours en cours ; deux clics remboursaient
    // deux fois si Stripe l'acceptait, et les emails partaient même quand rien
    // n'avait basculé.
    //
    // Désormais : la commande bascule SEULEMENT si elle est encore annulable,
    // dans la même écriture. Zéro ligne = quelqu'un est passé avant, on ne
    // touche ni à l'argent ni aux emails.
    const { data: basculees, error: errUpd } = await supabase
      .from('commandes')
      .update({
        statut: 'annulee_client_refund',
        annulee_at: new Date().toISOString(),
        annulation_motif: 'client',
      })
      .eq('id', cmd.id)
      .in('statut', statutsAnnulables)
      .select('id')
    if (errUpd) {
      console.error('[commande/cancel] UPDATE statut KO', errUpd)
      return NextResponse.json({ ok: false, error: 'Erreur mise à jour commande.' }, { status: 500 })
    }
    if (!basculees || basculees.length === 0) {
      return NextResponse.json({
        ok: false,
        error: `Ta commande vient de changer de statut. Recharge la page, ou contacte ${commercant?.nom || 'le commerçant'}.`,
      }, { status: 409 })
    }

    // ─── 6) Refund Stripe (Direct Charge sur compte connecté) ──────────────
    //
    // ⚠️ LE MONTANT VIENT DE STRIPE : ce qui a été capturé, moins ce qui a déjà
    // été rendu. La part payée par bon ou par récompense n'est jamais passée
    // par la carte, elle revient plus bas sur le bon et la carte de fidélité.
    // ⚠️ UNE CLÉ PAR COMMANDE ET PAR MONTANT : un rejeu rend la même réponse
    // de Stripe au lieu d'un second remboursement.
    // ⚠️ SI STRIPE REFUSE, L'ANNULATION EST DÉFAITE. Laisser la commande
    // annulée sans argent rendu promettait au client un remboursement que
    // personne ne ferait ; il peut réessayer, la clé protège du doublon.
    // ⚠️ LE CALCUL ET LA CLÉ VIVENT DANS `lib/commande-annulation-server.js`
    // depuis le 05/10 : le commerce rembourse par la même fonction (I5).
    let refundId = null
    let refundStatus = null
    if (remboursable) {
      try {
        const r = await rembourserCarteCommande({ commande: cmd, compteStripe: commercant.stripe_account_id, origine: 'client' })
        refundId = r.refundId
        refundStatus = r.refundStatus
      } catch (e) {
        console.error('[commande/cancel] refund Stripe KO, annulation défaite', e?.message, { commande_id: cmd.id, pi: cmd.stripe_payment_intent_id })
        const { error: errRetour } = await supabase.from('commandes')
          .update({ statut: cmd.statut, annulee_at: null, annulation_motif: null })
          .eq('id', cmd.id)
          .eq('statut', 'annulee_client_refund')
        if (errRetour) console.error('[commande/cancel] 🔴 annulation NON défaite après refus Stripe', errRetour.message, { commande_id: cmd.id })
        return NextResponse.json({
          ok: false,
          error: `Le remboursement n'a pas pu être lancé, ta commande n'est donc pas annulée. Réessaie dans un instant, ou contacte ${commercant?.nom || 'le commerçant'}.`,
        }, { status: 502 })
      }
    }

    // ─── Ce que l'annulation rend ───────────────────────────────────────────
    // Le stock des versions, TOUS les bons, la récompense, le rappel de retrait
    // et la place retenue : `effetsAnnulationCommande`, partagée avec
    // l'annulation par le commerce (I5, 05/10). La bascule a eu lieu (sinon on
    // est sorti plus haut) : on rend une fois.
    await effetsAnnulationCommande(supabase, cmd, '[commande/cancel]')

    // ─── 8) Email confirmation annulation ──────────────────────────────────
    // Appel DIRECT des helpers (pas de fetch HTTP interne fragile, cf. pattern RDV)
    // Un refus de Stripe défait l'annulation plus haut : arrivé ici, le
    // remboursement est lancé, il n'y a plus de remboursement « manuel ».
    const refundManuel = false
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
          commercant_categorie: commercant?.categorie || null,
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
          // 🔴 ET COMBIEN DE BONS (Alex, 01/09). Sa commande #CC2 était payée
          // par TROIS bons, et l'email disait « ton bon gourmand ». Il en
          // cherche un, il en a trois : le compte ne tombe jamais juste.
          nb_bons:            (cmd.bons_utilises || []).length,
          refund_manuel:   refundManuel,
          paye_en_ligne:   !!cmd.paye_en_ligne,
        })
        await envoyerAuCommercant({
          to: cmd.client_email,
          subject: `Ta commande ${chezLeCommerce(commercant?.nom || 'le commerçant')} a été annulée`,
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
          commercant_categorie: commercant?.categorie || null,
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
          nb_bons:            (cmd.bons_utilises || []).length,
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
      message: remboursable
        ? 'Ta commande est annulée. Le remboursement arrivera sur ton moyen de paiement dans 5 à 10 jours.'
        : 'Ta commande est annulée.',
    })
  } catch (e) {
    console.error('[commande/cancel]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: e?.status || 500 })
  }
}
