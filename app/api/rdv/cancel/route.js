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
import { euros } from '@/lib/montants'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe } from '@/lib/stripe'
import { envoyerAuCommercant, emailRdvAnnule } from '@/lib/resend'
import { generateRdvIcs, icsToBase64Attachment } from '@/lib/ical'
import { brusselsInstant } from '@/lib/timezone'
import { annulerPush } from '@/lib/onesignal'
import { adresseRendezVous } from '@/lib/lieu-fige'
import { rendreAvantagesRdv } from '@/lib/rdv-annulation-server'
import { restaurerStockVariantes } from '@/lib/stock-variantes-server'

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
      commercant_id, rappel_push_id, commande_id, fidelite_recompense_id,
      lieu_id, lieu_libelle, lieu_adresse,
      prix_estime, fidelite_remise, bon_cadeau_id, bon_cadeau_montant,
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
        // ⚠️ LES TROIS COLONNES D'AVANTAGE SONT OBLIGATOIRES ICI. `total` est le
        // tarif BRUT : un bon cadeau ou une récompense posés dessus n'ont
        // jamais été payés par carte, et les rembourser reviendrait à rendre
        // au client de l'argent qu'il n'a pas sorti.
        .select('id, statut, total, paye_en_ligne, bon_cadeau_id, bon_cadeau_montant, fidelite_remise, fidelite_recompense_id')
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
          // ⚠️ CE QUI REVIENT SUR LA CARTE N'EST PAS LE TOTAL DES PRODUITS.
          // Un bon cadeau ou une récompense posés dessus n'ont jamais été
          // payés par carte : l'écran annonçait donc un remboursement plus
          // gros que le prélèvement. Le brut sert à LISTER, ce montant-ci à
          // PROMETTRE, et on ne promet que ce que Stripe peut rendre.
          rembourse: Math.round(Math.max(0,
            Number(commandeLiee.total || 0)
            - Number(commandeLiee.bon_cadeau_montant || 0)
            - Number(commandeLiee.fidelite_remise || 0)
            + Number(rdv.acompte_montant || 0)) * 100) / 100,
          bon: Math.round((Number(commandeLiee.bon_cadeau_montant || 0) + Number(rdv.bon_cadeau_montant || 0)) * 100) / 100,
          lignes: (lignes || []).map(l => ({
            nom: l.article?.nom || 'Article',
            quantite: l.quantite,
            total: Number(l.prix_unitaire) * l.quantite,
          })),
        },
      }, { status: 409 })
    }

    const gardeSesProduits = !!commandeLiee && produits_choix === 'garde'
    const arr = (n) => Math.round(Number(n || 0) * 100) / 100

    // ─── 4.7) CE QUI N'EST PAS DE LA CARTE REVIENT, ET IL REVIENT D'ABORD ───
    //
    // 🔴 L'ORDRE SUPPRIME UNE COURSE, vérifiée dans les traces du 30/08. Créer
    // le remboursement déclenche le webhook `charge.refunded`, qui recrédite le
    // bon et rend la récompense EN SECOURS. Il peut arriver entre notre
    // re-crédit du bon et notre relecture de la récompense : la ligne est alors
    // déjà libre, et c'est ainsi qu'un email a annoncé 40 € de bon sans dire un
    // mot des 10 € de récompense pourtant bien revenus.
    //
    // ⚠️ ANNONCER L'ÉTAT SUFFISAIT À DIRE VRAI, PAS À DORMIR TRANQUILLE :
    // l'alerte « récompense déjà libre » se serait déclenchée à chaque
    // annulation remboursée. Une alerte qui crie en régime normal n'est plus
    // lue, et c'est le mal qu'on chasse. En agissant les premiers, le webhook
    // redevient un vrai secours et le cri ne reste que pour l'anormal.
    //
    // ⚠️ ET C'EST LE BON ORDRE EN CAS D'ÉCHEC : si le remboursement rate juste
    // après, le Yopper garde son bon et sa récompense pendant qu'on règle
    // l'argent à la main. L'inverse lui prenait tout d'un coup.
    //
    // 🔴 LE BON CADEAU N'ÉTAIT PAS RENDU, ET ALEX L'A VU EN PRODUCTION LE
    // 29/08. Un bon de 75 €, 35 € posés sur une coupe, le rendez-vous annulé :
    // sa fiche affichait toujours 40 €. Stripe ne rembourse QUE la part carte,
    // la part bon n'existe pas pour lui. Personne d'autre ne la rendait.
    //
    // ⚠️ ET LA COMMANDE LIÉE SUIT LE CHOIX DU CLIENT : ses avantages ne
    // reviennent que s'il rend ses produits. Les garder, c'est les acheter.
    //
    // ⚠️ UNE RÉCOMPENSE QUI A PAYÉ DES PRODUITS GARDÉS NE REVIENT PAS. Depuis
    // le 30/08 elle mord sur les produits quand elle dépasse la prestation. Si
    // le client annule mais GARDE sa marchandise, cette part est bel et bien
    // consommée : la rendre lui offrirait une remise sur ce qu'il emporte.
    //
    // ⚠️ ET ON NE LA REND PAS POUR LA REPRENDRE ENSUITE. `rendreRecompense`
    // incrémente `recompenses_disponibles` ET écrit un mouvement d'ajustement :
    // remettre `utilisee_at` après coup laisserait le compteur au-dessus du
    // nombre de lignes, l'invariant surveillé depuis le 24/08. On décide AVANT
    // d'agir. Une récompense est UNE ligne : prise ou rendue, jamais à moitié.
    const recompenseSurProduitsGardes = gardeSesProduits
      && Number(commandeLiee?.fidelite_remise || 0) > 0

    // ⚠️ LA REMISE ANNONCÉE EST CELLE QUI A ÉTÉ FIGÉE, prestation ET produits :
    // une récompense est UNE ligne, mais elle a pu mordre des deux côtés.
    // N'annoncer que la part prestation ferait dire « 6 € te reviennent » quand
    // 10 € reviennent.
    const rendu = await rendreAvantagesRdv(supabase, {
      ou: 'rdv/cancel',
      bonId: rdv.bon_cadeau_id,
      bonMontant: rdv.bon_cadeau_montant,
      recompenseId: recompenseSurProduitsGardes ? null : rdv.fidelite_recompense_id,
      recompenseMontant: arr(Number(rdv.fidelite_remise || 0)
        + (gardeSesProduits ? 0 : Number(commandeLiee?.fidelite_remise || 0))),
      refs: { rdv_id: rdv.id },
    })
    let bonRendu = rendu.bon
    let recompenseRendue = rendu.recompense

    if (commandeLiee && !gardeSesProduits) {
      // ⚠️ ET SURTOUT PAS DEUX FOIS LA MÊME LIGNE. Une récompense est UNE ligne,
      // portée par le rendez-vous. Tant qu'on ne comptait que ce qu'on rendait
      // soi-même, une commande qui aurait porté le même identifiant se taisait
      // d'elle-même à la seconde passe. Depuis qu'on annonce l'ÉTAT, il faut
      // l'écrire, sinon la part produits serait annoncée deux fois.
      const memeRecompense = commandeLiee.fidelite_recompense_id
        && String(commandeLiee.fidelite_recompense_id) === String(rdv.fidelite_recompense_id || '')
      const rc = await rendreAvantagesRdv(supabase, {
        ou: 'rdv/cancel',
        bonId: commandeLiee.bon_cadeau_id,
        bonMontant: commandeLiee.bon_cadeau_montant,
        recompenseId: memeRecompense ? null : commandeLiee.fidelite_recompense_id,
        recompenseMontant: Number(commandeLiee.fidelite_remise || 0),
        refs: { commande_id: commandeLiee.id },
      })
      bonRendu += rc.bon
      recompenseRendue += rc.recompense
    }
    bonRendu = arr(bonRendu)
    recompenseRendue = arr(recompenseRendue)

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
    // ⚠️ CE QUE LA CARTE A RÉELLEMENT PAYÉ SUR LES PRODUITS, pas leur prix
    // affiché. Un bon cadeau et une récompense posés sur la commande ont baissé
    // le montant encaissé d'autant : demander à Stripe de rembourser le brut,
    // c'est réclamer plus que ce qui a été prélevé.
    const produitsPayesCarte = commandeLiee
      ? arr(Math.max(0, Number(commandeLiee.total || 0)
          - Number(commandeLiee.bon_cadeau_montant || 0)
          - Number(commandeLiee.fidelite_remise || 0)))
      : 0
    const aRembourser = gardeSesProduits
      ? acompteMontant
      : arr(acompteMontant + produitsPayesCarte)
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
      // ⚠️ `.neq(...).select()` : l'écriture ne rend une ligne QUE si elle a
      // réellement fait basculer la commande, et c'est cette bascule seule qui
      // autorise à rendre le stock.
      const { data: basculees, error: errCmd } = await supabase
        .from('commandes')
        .update({ statut: 'annulee_client_refund' })
        .eq('id', commandeLiee.id)
        .neq('statut', 'annulee_client_refund')
        .select('id')
      if (errCmd) console.error('[rdv/cancel] annulation commande liée KO', errCmd.message, { commandeId: commandeLiee.id })
      // ⚠️ ET LE STOCK DES VERSIONS REVIENT, comme sur les autres sorties. Le
      // tunnel du rendez-vous ne vend pas encore d'article à versions : c'est
      // sans effet aujourd'hui, et ce serait un piège le jour où il en vendra.
      else if ((basculees || []).length > 0) {
        const rest = await restaurerStockVariantes(supabase, [commandeLiee.id])
        if (!rest.ok) console.error('[rdv/cancel] restitution stock versions KO', rest.error, { commandeId: commandeLiee.id })
      }
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
          // ⚠️ LES QUATRE MONTANTS ARRIVENT JUSQU'ICI, sans quoi le gabarit se
          // rabat sur le seul acompte et se tait dès qu'il vaut zéro. La
          // récompense est le quatrième, ajouté le 30/08 : elle revenait déjà,
          // et rien ne le disait.
          refund_montant:    refundMontant != null ? refundMontant : (refundError ? null : 0),
          bon_rendu:         bonRendu,
          recompense_rendue: recompenseRendue,
          produits_gardes:   gardeSesProduits,
          produits_montant:  produitsPayesCarte,
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
          commercant_adresse: adresseRendezVous({ ...rdv, commercant }),
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
    // ⚠️ ET LE BON CADEAU SE DIT, LUI AUSSI. Stripe ne rembourse que la carte :
    // sans cette phrase, le Yopper lit « 43,80 € reviennent » et croit avoir
    // perdu les 35 € de son bon. Il faut ouvrir sa fiche pour découvrir qu'ils
    // y sont revenus, et personne ne va vérifier ce qu'on ne lui annonce pas.
    const phraseBon = bonRendu > 0
      ? ` Les ${euros(bonRendu)} de ton bon cadeau sont recrédités dessus, utilisables tout de suite.`
      : ''
    // 🔴 ET LA RÉCOMPENSE, QUI REVENAIT SANS QUE PERSONNE NE LE DISE (Alex,
    // 30/08). Exactement le défaut du bon cadeau, un jour plus tard : le geste
    // avait été porté au bon et jamais à sa voisine. Le Yopper devait ouvrir sa
    // carte de fidélité pour découvrir que ses 10 € y étaient revenus, et
    // personne ne va vérifier ce qu'on ne lui annonce pas.
    const phraseRecompense = recompenseRendue > 0
      ? ` Ta récompense fidélité de ${euros(recompenseRendue)} retourne sur ta carte, utilisable à ton prochain passage.`
      : ''
    const retours = `${phraseBon}${phraseRecompense}`

    let message
    if (refundError) {
      message = `Ton RDV est annulé. Le remboursement sera traité manuellement par le commerçant sous quelques jours.${retours}`
    } else if (gardeSesProduits) {
      message = refundMontant > 0
        ? `Ton RDV est annulé. Tes ${euros(refundMontant)} d'acompte reviennent sur ton moyen de paiement dans 5 à 10 jours, et tes produits t'attendent en boutique.${retours}`
        : `Ton RDV est annulé. Tes produits t'attendent en boutique.${retours}`
    } else if (refundMontant > 0) {
      message = `Ton RDV est annulé. ${euros(refundMontant)} reviennent sur ton moyen de paiement dans 5 à 10 jours.${retours}`
    } else {
      message = `Ton RDV est annulé.${retours}`
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
