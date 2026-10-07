// GET /api/cron/recap-jour-8h
//
// Cron Vercel quotidien a 8h00 : envoie le recap matinal aux commercants
// avec notif_mode='recap_jour'. Selon categorie :
//   • vitrine Vendre avec rdv_actif → emailRecapRdvJour (RDV du jour)
//   • alimentaire Vendre            → emailRecapCommandesJour (commandes du jour)
//
// Securite : verifie le header Authorization: Bearer <CRON_SECRET>.
// Configuration vercel.json : { "path": "...", "schedule": "0 6,7 * * *" }
//
// 🔴 8 H TOUTE L'ANNÉE (audit, 06/10, décision d'Alex). Vercel planifie en
// temps universel : « 0 6 » tombait à 8 h en été et à 7 h en HIVER. Le cron
// passe donc à 6 h ET 7 h UTC, et seul le passage où il est 8 h à Bruxelles
// envoie (`estHeureDuRecap`). L'autre rend « pas l'heure » sans rien faire.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailRecapRdvJour, emailRecapCommandesJour } from '@/lib/resend'
import { planEffectif } from '@/lib/plans'
import { referenceRdv } from '@/lib/numero-commande'
import { motsReservation, reservationActive } from '@/lib/reservation-metier'
import { gardeCron, refusCron } from '@/lib/cron-auth'
import { envoyerAuAdmin, emailDossiersEnAttente } from '@/lib/resend'
// ⚠️ LE FILET : il relit les dossiers en attente côté SERVEUR, là où l'alerte
// de soumission dépend d'un navigateur resté ouvert.
import { dossiersEnRetard, COLONNES_PUBLICATION_DIFFEREE } from '@/lib/statut-commercant'
import { surveillerCompteur } from '@/lib/sonde-compteur'
import { bonsLimiter } from '@/lib/ratelimit'
import { jourBruxelles, jourCivilPlus, brusselsInstant } from '@/lib/timezone'
import { estHeureDuRecap, lignesRecapCommandes } from '@/lib/recap-commandes'

export async function GET(request) {
  const refuse = refusCron(gardeCron(request, 'cron/recap-jour-8h'), NextResponse)
  if (refuse) return refuse

  // Un appel manuel (secret exigé plus haut) peut forcer l'envoi hors de 8 h.
  const forcer = new URL(request.url).searchParams.get('forcer') === '1'
  if (!forcer && !estHeureDuRecap(new Date())) {
    // Le journal dit aussi le passage qui s'abstient (07/10) : sans lui, les
    // deux passages répondent 200 et rien ne dit lequel a envoyé.
    console.log('[cron] /api/cron/recap-jour-8h : pas son heure, rien envoyé')
    return NextResponse.json({ ok: true, ignore: 'pas_8h_a_bruxelles' })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ LE JOUR DE BRUXELLES, PAS CELUI DE LA MACHINE (Vercel tourne en temps
    // universel). À 8 h ils coïncident, mais un appel forcé après 22 h ou 23 h
    // UTC aurait pris la veille.
    const dateJour = jourBruxelles()
    // 🔴 « LA VEILLE » ÉTAIT AUJOURD'HUI (audit, 06/10) : la requête des bons
    // lisait `dateJour` de 00:00 à 23:59, sans fuseau. À 8 h, elle ne voyait
    // donc que les bons vendus entre minuit et 6 h du matin (UTC), presque
    // aucun. La veille va de minuit à minuit À BRUXELLES, été comme hiver.
    const debutVeille = brusselsInstant(jourCivilPlus(dateJour, -1), '00:00').toISOString()
    const debutJour = brusselsInstant(dateJour, '00:00').toISOString()

    // Fetch les commercants en notif_mode='recap_jour'
    const { data: commercants } = await supabase
      .from('commercants')
      // 🔴 `essai_plan` ET `created_at` MANQUAIENT (15/09). `reservationActive`
      // lit déjà le forfait effectif : sans eux, un restaurant en essai ne
      // voyait jamais ses tables dans ce récap, sans aucune erreur.
      .select('id, nom, email, categorie, plan, essai_plan, created_at, rdv_actif')
      .eq('notif_mode', 'recap_jour')
      .not('email', 'is', null)

    let sent = 0
    let failed = 0
    const details = []

    for (const c of (commercants || [])) {
      const estVitrine = c.categorie === 'vitrine'
      // Alimentaire ET détail (boutique, Module 2) reçoivent le récap commandes
      const estAlim    = (c.categorie === 'alimentaire' || c.categorie === 'detail') && planEffectif(c) === 'vendre'

      // 🔴 UN RESTAURANT A UNE SALLE ET UN COMPTOIR, ET CE CRON N'EN VOYAIT
      // QU'UN (trouvé le 09/09 en traitant le vocabulaire, arbitré par Alex).
      // L'aiguillage se faisait sur la seule CATÉGORIE : commandes pour un
      // alimentaire, rendez-vous pour une vitrine. Le Bistrologue aurait lu
      // « Aucune commande aujourd'hui » un matin où trente couverts
      // l'attendaient le soir, et rien ne le lui aurait dit.
      //
      // ⚠️ `reservationActive` PLUTÔT QUE `rdv_actif` SEUL : l'interrupteur
      // allumé chez qui n'a plus le forfait remplirait la section de tables que
      // personne ne peut plus réserver.
      const aUneSalle = !estVitrine && reservationActive(c)

      if (estVitrine && !c.rdv_actif) {
        continue  // pas concerne
      }
      if (!estVitrine && !estAlim) {
        continue  // ni RDV vitrine, ni C&C alim FULL
      }

      // ⚠️ UNE SEULE LECTURE, DEUX USAGES. La vitrine en fait son email entier,
      // le restaurant en fait la seconde section du sien. Recopier la requête
      // aurait garanti qu'un jour l'une charge `couverts` et pas l'autre.
      async function lireTablesDuJour() {
        const { data: rdvs, error: errRdvs } = await supabase
          .from('rdv_reservations')
          .select(`
            id, heure_debut, heure_fin, duree_minutes, numero_rdv, numero_prefixe, couverts,
            client_prenom, client_nom, client_telephone,
            prestation:rdv_prestations(nom)
          `)
          .eq('commercant_id', c.id)
          .eq('date_rdv', dateJour)
          .eq('statut', 'confirme')
          .is('deleted_at', null)
          .order('heure_debut', { ascending: true })
        if (errRdvs) {
          console.error('[cron/recap-jour-8h] fetch rdvs KO', { commercant: c.nom, error: errRdvs.message })
          throw new Error(errRdvs.message)
        }
        return (rdvs || []).map(r => ({
          heure_debut:    r.heure_debut,
          heure_fin:      r.heure_fin,
          duree_minutes:  r.duree_minutes,
          couverts:       r.couverts,
          numero_rdv:     referenceRdv(r),
          yopper_prenom:  r.client_prenom,
          yopper_nom:     r.client_nom,
          yopper_telephone: r.client_telephone,
          prestation_nom: r.prestation?.nom,
        }))
      }

      try {
        let html = null
        let subject = null
        let total = 0

        if (estVitrine) {
          const rdvsFlat = await lireTablesDuJour()
          total = rdvsFlat.length
          html = emailRecapRdvJour({
            nom_commercant: c.nom,
            commercant_categorie: c.categorie || null,
            date_jour:      dateJour,
            rdvs:           rdvsFlat,
          })
          const motsRecap = motsReservation(c)
          subject = total === 0
            ? `${motsRecap.sujetRecapAucun} aujourd'hui`
            : `${total} ${total > 1 ? motsRecap.recapPluriel : motsRecap.recapSingulier} aujourd'hui — Yoppaa`
        } else {
          // Commandes du jour pour ce commercant.
          // ⚠️ La table commandes n'a PAS de colonne client_prenom (nom complet
          // dans client_nom) : l'ancien select la demandait → PostgREST 400
          // silencieux → data null → « 0 commandes » à tort (bug Alex 28/07).
          const { data: cmds, error: errCmds } = await supabase
            .from('commandes')
            // 🔴 `mode_retrait` ET `adresse_livraison` (audit, 06/10) : sans
            // eux, une livraison de 11 h et un retrait de 11 h se lisaient
            // pareil. L'adresse ne sert qu'à en tirer la LOCALITÉ
            // (`lignesRecapCommandes`) : la rue ne part jamais par email.
            .select(`
              id, numero_commande, numero_prefixe, total, client_nom, mode_retrait, adresse_livraison,
              creneau:creneaux(heure_debut),
              creneau_livraison:livraison_creneaux(heure_debut),
              commande_articles(quantite)
            `)
            .eq('commercant_id', c.id)
            .eq('date_commande', dateJour)
            .in('statut', ['en_attente', 'en_preparation', 'pret'])
            .order('id', { ascending: true })
          if (errCmds) {
            console.error('[cron/recap-jour-8h] fetch commandes KO', { commercant: c.nom, error: errCmds.message })
            throw new Error(errCmds.message)
          }

          const cmdsFlat = lignesRecapCommandes(cmds || [])

          // ⚠️ LES BONS CADEAUX VENDUS LA VEILLE. Un commerçant réglé sur ce
          // récapitulatif ne recevait AUCUN email quand on lui achetait un bon :
          // l'envoi immédiat n'existe que pour « à chaque commande ». Il n'a
          // rien à préparer, mais quelqu'un a offert son commerce.
          // La journée entière, de minuit à minuit heure belge.
          const { data: bonsVeille } = await supabase
            .from('bons_cadeaux')
            .select('id, montant_initial')
            .eq('commercant_id', c.id)
            .gte('created_at', debutVeille)
            .lt('created_at', debutJour)

          // ⚠️ `null` QUAND CE COMMERCE N'A PAS DE SALLE, jamais `[]` : le
          // gabarit distingue « pas concerné » (aucune section) de « concerné,
          // mais rien aujourd'hui » (une section qui le dit). Une boulangerie
          // ne doit pas lire « Aucune table réservée ».
          const tablesFlat = aUneSalle ? await lireTablesDuJour() : null
          const couverts = (tablesFlat || []).reduce(
            (s, r) => s + (Number(r?.couverts) > 0 ? Number(r.couverts) : 1), 0)

          total = cmdsFlat.length
          html = emailRecapCommandesJour({
            nom_commercant: c.nom,
            commercant_categorie: c.categorie || null,
            date_jour:      dateJour,
            commandes:      cmdsFlat,
            bons_vendus:    bonsVeille || [],
            rdvs:           tablesFlat,
          })
          // Le sujet dit CE QUI ATTEND, et une journée sans commande mais avec
          // vingt couverts n'est pas une journée vide.
          const partCmd = total === 0 ? `Aucune commande` : `${total} commande${total > 1 ? 's' : ''}`
          const partTables = couverts > 0 ? ` et ${couverts} couvert${couverts > 1 ? 's' : ''}` : ''
          subject = total === 0 && !partTables
            ? `Aucune commande aujourd'hui`
            : `${partCmd}${partTables} aujourd'hui — Yoppaa`
        }

        await envoyerAuCommercant({ to: c.email, subject, html })
        sent++
        const typeEnvoye = estVitrine ? 'rdv' : aUneSalle ? 'commande+tables' : 'commande'
        details.push({ commercant: c.nom, type: typeEnvoye, total })
      } catch (e) {
        console.error('[cron/recap-jour-8h] envoi KO', { commercant: c.nom, error: e?.message })
        failed++
      }
    }

    console.info('[cron/recap-jour-8h]', { dateJour, sent, failed, details })

    // Une fois par jour, on demande au compteur de requetes s'il compte encore.
    //
    // ⚠️ APRES les recapitulatifs, et jamais devant : une sonde ne doit pas
    // retarder ni empecher l'envoi de sa journee a un commercant. Elle ne jette
    // pas non plus, elle rend son verdict. Alex n'est prevenu QUE si le
    // compteur ne compte plus, jamais quand tout va bien.
    const compteur = await surveillerCompteur({ limiteur: bonsLimiter, envoyerAuAdmin })

    // ═══ LE FILET DES DOSSIERS OUBLIÉS (16/09) ════════════════════════════
    //
    // 🔴 L'alerte « un commerçant attend » part d'un `fetch` DEPUIS LE
    // NAVIGATEUR, à la dernière étape de l'inscription. Elle se perd sur un 403,
    // sur un 500, ou simplement si l'onglet se ferme entre l'enregistrement et
    // l'appel : la fiche passe en attente et aucun email n'est même tenté.
    //
    // ⚠️ CE RAPPEL-CI PART DU SERVEUR et ne dépend d'aucun navigateur. Il
    // rattrape aussi le cas le plus banal : l'email bien parti, jamais lu.
    //
    // ⚠️ APRÈS les récapitulatifs, comme la sonde, et pour la même raison : un
    // filet ne retarde jamais l'envoi de sa journée à un commerçant.
    let enRetard = 0
    try {
      const { data: attente, error: errAttente } = await supabase
        .from('commercants')
        // ⚠️ `statut` VIENT DE LA RÈGLE : sans lui, une fiche validée dont la
        // publication est volontairement différée serait rappelée chaque matin
        // comme un dossier oublié.
        .select(`id, nom, type, created_at, ${COLONNES_PUBLICATION_DIFFEREE}`)
        .eq('statut_publication', 'en_attente')
      // 🔴 UNE LECTURE EN ÉCHEC N'EST PAS « AUCUN DOSSIER N'ATTEND ». Les deux
      // rendent zéro rappel, et la première doit se voir.
      if (errAttente) throw new Error(errAttente.message)
      const oublies = dossiersEnRetard(attente || [])
      enRetard = oublies.length
      // ⚠️ RIEN À SIGNALER, RIEN À ENVOYER : une alarme qui sonne tous les
      // matins ne protège plus rien.
      if (oublies.length) {
        await envoyerAuAdmin({
          subject: oublies.length > 1
            ? `${oublies.length} dossiers attendent ta validation`
            : 'Un dossier attend ta validation',
          html: emailDossiersEnAttente({ dossiers: oublies }),
        })
      }
    } catch (e) {
      console.error('[cron/recap-jour-8h] filet des dossiers en attente KO', e?.message || e)
    }

    console.log('[cron] /api/cron/recap-jour-8h : envoyé', JSON.stringify({ date_jour: dateJour, sent, failed, forcer }))
    return NextResponse.json({ ok: true, date_jour: dateJour, sent, failed, details, compteur, enRetard })

  } catch (e) {
    console.error('[cron/recap-jour-8h] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
