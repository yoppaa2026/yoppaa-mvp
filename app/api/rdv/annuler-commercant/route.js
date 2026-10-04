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
import { refus } from '@/lib/api-auth'
// 🔴 LE PATRON, L'ADMIN ET L'ÉQUIPE PAR LA MÊME GARDE (29/09, étape 3) : le
// patron et l'admin passent comme avant, un membre avec la case agenda.
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { rendreAvantagesRdv, lignesBonsDe, cleRemboursementRdv } from '@/lib/rdv-annulation-server'
import { restaurerStockVariantes } from '@/lib/stock-variantes-server'
import { annulerPush, envoyerPushParExternalId } from '@/lib/onesignal'
import { normaliserEmail } from '@/lib/email-normalise'
import { motsReservation } from '@/lib/reservation-metier'
import { jourLisible, annulationPrevientLaFile } from '@/lib/attente-rdv'
import { prevenirLaFile } from '@/lib/attente-rdv-server'

const arr = (n) => Math.round(Number(n || 0) * 100) / 100

export async function POST(request) {
  try {
    // `prevenir_file` : faux quand c'est tout le cours qui est annulé (aucune
    // place ne se libère, le cours n'a plus lieu) ou depuis une fermeture.
    const { rdv_id, raison = 'commercant', prevenir_file = true } = await request.json()
    if (!rdv_id) {
      return NextResponse.json({ ok: false, error: 'rdv_id requis.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const verdict = await gardeLigneEquipe(request, supabase, 'rdv_reservations', rdv_id, 'agenda')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, statut, acompte_paye, acompte_montant, stripe_payment_intent_id, stripe_refund_id,
        commande_id, fidelite_recompense_id, fidelite_remise, bon_cadeau_id, bon_cadeau_montant, bons_utilises,
        rappel_push_id, commercant_id,
        client_id, client_email, date_rdv, heure_debut, prestation_id,
        prestation:rdv_prestations(capacite, par_couverts),
        commercant:commercants(stripe_account_id, nom, categorie)
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
        .select('id, statut, total, bon_cadeau_id, bon_cadeau_montant, bons_utilises, fidelite_remise, fidelite_recompense_id')
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

    // ─── Ce qui n'est pas de la carte revient AVANT le remboursement ────────
    //
    // 🔴 L'ORDRE N'EST PAS COSMÉTIQUE, IL SUPPRIME UNE COURSE (traces du 30/08
    // relues en base). Créer le remboursement déclenche le webhook
    // `charge.refunded`, qui recrédite le bon et rend la récompense EN SECOURS.
    // Sur le rendez-vous d'Alex il est arrivé entre notre re-crédit du bon et
    // notre relecture de la récompense : la ligne était déjà libre, et l'email
    // s'est tu sur 10 € pourtant bien revenus.
    //
    // ⚠️ ANNONCER L'ÉTAT SUFFISAIT À DIRE VRAI, MAIS PAS À DORMIR TRANQUILLE :
    // l'alerte « récompense déjà libre » se serait déclenchée à CHAQUE
    // annulation remboursée. Une alerte qui crie en régime normal n'est plus
    // lue par personne, et c'est exactement le mal qu'on chasse. En agissant
    // les premiers, le webhook redevient un vrai secours et le cri retrouve son
    // sens : il ne reste que le cas anormal.
    //
    // ⚠️ ET C'EST AUSSI LE BON ORDRE EN CAS D'ÉCHEC. Si le remboursement rate
    // juste après, le Yopper garde son bon et sa récompense pendant qu'on règle
    // l'argent à la main. L'inverse lui prenait tout d'un coup.
    //
    // ⚠️ LES DEUX GESTES SONT IDEMPOTENTS : index unique partiel pour le bon,
    // `utilisee_at IS NULL` pour la récompense. Un rejeu ne double rien.
    //
    // ⚠️ LE COMMERÇANT ANNULE : TOUT REVIENT, y compris la part de récompense
    // posée sur les produits. Il n'y a pas de « je garde mes produits » ici,
    // c'est lui qui renonce à la vente.
    const rendu = await rendreAvantagesRdv(supabase, {
      ou: 'rdv/annuler-commercant',
      // 🔴 TOUS LES BONS, pas le premier avec le total : ce serait de l'argent
      // créé sur l'un et détruit sur les autres.
      bonsUtilises: lignesBonsDe(rdv),
      recompenseId: rdv.fidelite_recompense_id,
      recompenseMontant: arr(Number(rdv.fidelite_remise || 0)
        + Number(commandeLiee?.fidelite_remise || 0)),
      refs: { rdv_id: rdv.id },
    })
    let bonRendu = rendu.bon
    let recompenseRendue = rendu.recompense
    if (commandeLiee) {
      // ⚠️ ET SURTOUT PAS DEUX FOIS LA MÊME LIGNE. Une récompense est UNE ligne,
      // et le tunnel ne la pose que sur le rendez-vous ; une commande ancienne
      // pourrait pourtant porter le même identifiant. Tant qu'on ne comptait que
      // ce qu'on rendait soi-même, la seconde passe se taisait d'elle-même.
      // Depuis qu'on annonce l'ÉTAT, il faut le dire ici : sinon la part
      // produits serait annoncée deux fois.
      const memeRecompense = commandeLiee.fidelite_recompense_id
        && String(commandeLiee.fidelite_recompense_id) === String(rdv.fidelite_recompense_id || '')
      const rc = await rendreAvantagesRdv(supabase, {
        ou: 'rdv/annuler-commercant',
        bonsUtilises: lignesBonsDe(commandeLiee),
        recompenseId: memeRecompense ? null : commandeLiee.fidelite_recompense_id,
        recompenseMontant: Number(commandeLiee.fidelite_remise || 0),
        refs: { commande_id: commandeLiee.id },
      })
      bonRendu += rc.bon
      recompenseRendue += rc.recompense
    }

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
          // 🔴 UNE CLÉ D'IDEMPOTENCE PAR RENDEZ-VOUS (Annul-I8, 03/10). Deux
          // annulations simultanées (double tap, deux onglets, le client et le
          // studio à la même minute) créaient deux remboursements : le second
          // échouait, et le client recevait un email « remboursement échoué »
          // sur un acompte bel et bien rendu. Même clé ici et côté client :
          // Stripe ne rembourse ce rendez-vous qu'une fois, et rend la même
          // réponse au second appel.
          const refund = await stripe.refunds.create({
            payment_intent: rdv.stripe_payment_intent_id,
            reason: 'requested_by_customer',
            metadata: { yoppaa_rdv_id: rdv.id, yoppaa_motif: raison },
          }, { stripeAccount: rdv.commercant.stripe_account_id, idempotencyKey: cleRemboursementRdv(rdv.id) })
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
    // ⚠️ UN SEUL GAGNANT : le statut ne s'écrit que s'il n'a pas changé depuis
    // la lecture. La seconde annulation simultanée apprend qu'elle arrive
    // après, et l'écran n'envoie pas un second email.
    const { data: ecrit, error: errUpd } = await supabase.from('rdv_reservations').update(updateData)
      .eq('id', rdv.id).eq('statut', rdv.statut).select('id')
    if (errUpd) {
      console.error('[rdv/annuler-commercant] UPDATE KO', errUpd)
      return NextResponse.json({ ok: false, error: 'Erreur mise à jour du rendez-vous.' }, { status: 500 })
    }
    if (!ecrit || ecrit.length === 0) {
      return NextResponse.json({ ok: true, already_canceled: true, rdv_id: rdv.id })
    }

    if (commandeLiee) {
      // ⚠️ `.neq(...).select()` : l'écriture ne rend une ligne QUE si elle a
      // réellement fait basculer la commande. C'est cette bascule-là, et elle
      // seule, qui autorise à rendre le stock juste en dessous.
      const { data: basculees, error: errCmd } = await supabase
        .from('commandes').update({ statut: 'annulee_client_refund' })
        .eq('id', commandeLiee.id).neq('statut', 'annulee_client_refund').select('id')
      if (errCmd) console.error('[rdv/annuler-commercant] annulation commande liée KO', errCmd.message)
      // ⚠️ ET LE STOCK DES VERSIONS REVIENT, comme sur les quatre autres
      // sorties. Trois chemins d'annulation appelaient `restaurerStockVariantes`,
      // les deux annulations de RENDEZ-VOUS n'en faisaient pas partie : le
      // tunnel du rendez-vous ne vend pas encore d'article à versions, donc
      // c'est aujourd'hui sans effet, et ce sera un piège le jour où il en
      // vendra. Une famille se ferme entière ou pas du tout.
      else if ((basculees || []).length > 0) {
        const rest = await restaurerStockVariantes(supabase, [commandeLiee.id])
        if (!rest.ok) console.error('[rdv/annuler-commercant] restitution stock versions KO', rest.error)
      }
    }

    if (rdv.rappel_push_id) annulerPush(rdv.rappel_push_id).catch(() => {})

    // 🔴 LE CLIENT L'APPREND AUSSI PAR NOTIFICATION (Annul-I4, 03/10). Il ne
    // recevait qu'un email, envoyé par l'écran après coup : un cours annulé le
    // matin même était découvert sur place. La personne se retrouve par sa
    // fiche, ou par son adresse comme dans la liste d'attente (une séance
    // d'abonnement ou un acompte n'ont pas toujours `client_id`).
    // ⚠️ AU MIEUX : une notification ratée ne défait pas l'annulation.
    let notifie = false
    try {
      let pourQui = rdv.client_id || null
      if (!pourQui && rdv.client_email) {
        const { data: fiche } = await supabase
          .from('clients').select('id')
          .eq('email', normaliserEmail(rdv.client_email))
          .maybeSingle()
        pourQui = fiche?.id || null
      }
      if (pourQui) {
        const mots = motsReservation(rdv.commercant)
        const envoi = await envoyerPushParExternalId(pourQui, {
          headings: `${mots.sujetAnnule} ${rdv.commercant?.nom || 'ton commerce'} est ${mots.participeAnnule}`,
          contents: `Le ${jourLisible(rdv.date_rdv)} à ${String(rdv.heure_debut || '').slice(0, 5)}. Ce qui te revient est dans ton email.`,
          url: '/commander?onglet=commandes&tab=rdvs',
          data: { kind: 'rdv_annule_commercant', rdv_id: rdv.id },
        })
        notifie = Boolean(envoi?.ok)
        if (!envoi?.ok) console.warn('[rdv/annuler-commercant] notification au client KO', envoi?.error)
      }
    } catch (e) {
      console.warn('[rdv/annuler-commercant] notification au client KO', e?.message)
    }

    // 🔴 UNE PLACE LIBÉRÉE DANS UN COURS PRÉVIENT LA FILE (décision d'Alex du
    // 04/10 : « c'est une place de libre »). Depuis le 06/09, seule l'annulation
    // du CLIENT prévenait, et la commerçante devait penser au bouton : une
    // personne désinscrite par le studio laissait sa place vide pendant que
    // trois autres l'attendaient. La règle (quand oui, quand non) vit dans
    // `annulationPrevientLaFile`, exécutée au banc.
    // ⚠️ `prevenirLaFile` relit le cours, les fermetures et la fiche : un jour
    // fermé ou un cours retiré ne prévient personne. AU MIEUX : une file non
    // prévenue ne défait pas l'annulation.
    let filePrevenue = 0
    if (annulationPrevientLaFile(rdv, { prevenirFile: prevenir_file, raison })) {
      const file = await prevenirLaFile(supabase, {
        prestationId: rdv.prestation_id,
        dateRdv: rdv.date_rdv,
        heureDebut: String(rdv.heure_debut || '').slice(0, 5),
      })
      if (!file?.ok) console.error('[rdv/annuler-commercant] liste d’attente non prévenue', file?.error)
      else filePrevenue = Number(file.prevenus) || 0
    }

    // Le geste d'un membre de l'équipe, au journal (rien pour le patron).
    await journaliserGeste(supabase, verdict, { action: 'rdv_annule', cible_type: 'rdv', cible_id: rdv.id, details: { raison: raison || 'commercant', rembourse: refundMontant || 0 } })

    return NextResponse.json({
      ok: true,
      rdv_id: rdv.id,
      notifie,
      file_prevenue: filePrevenue,
      refund_id: refundId,
      refund_montant: refundMontant,
      refund_error: refundError,
      bon_rendu: arr(bonRendu),
      // 🔴 ET LE NOMBRE DE BONS (01/09). Cette réponse est ce que le tableau de
      // bord repasse à `/api/emails/rdv-annule` : sans ce compte, l'email
      // annonce « sur ton bon » alors que trois bons ont été recrédités.
      nb_bons: lignesBonsDe(rdv).length + lignesBonsDe(commandeLiee || {}).length,
      recompense_rendue: arr(recompenseRendue),
      produits_montant: produitsPayesCarte,
    })
  } catch (e) {
    console.error('[rdv/annuler-commercant]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
