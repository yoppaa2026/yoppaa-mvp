'use client'
// Modale "Nouveau RDV manuel" pour le commerçant vitrine.
// Déclenchée par tap sur un slot libre dans AgendaRdv.
// Saisie rapide : prestation + prénom + nom + tél (+ email/notes optionnels).
// Statut auto = 'confirme', source = 'commercant' (cf VITRINE-1).
// Pas de création de row clients : juste les champs RDV (decision Alex 2026-06-01).
// Validations server-side : overlap RDV existants + horaires shop + pause.

import { useState, useEffect } from 'react'
import { postPro } from '@/lib/fetch-pro'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { champsLieuPour } from '@/lib/lieu-fige'
import { euros } from '@/lib/montants'
import { capacitePrestation, premierePlaceLibre, rangLibre, estParCouverts, bornesCouverts, couvertsValides } from '@/lib/cours-collectifs'
import { motsReservation } from '@/lib/reservation-metier'
import { creneauAcceptable, creneauxDuJour } from '@/lib/deplacement-rdv'
import {
  enModeInventaire, formatPourAffichage, plusGrandeTable,
  dureeDuGroupe, etatSalle, tableAPoser, phraseSalle, lireSalleDuJour,
} from '@/lib/inventaire-salle'
// ⚠️ LES RÈGLES DE L'ABONNEMENT NE SONT PAS RÉÉCRITES ICI, elles sont APPELÉES.
// Le solde, le plafond hebdomadaire, la fenêtre de validité et l'ordre de
// consommation vivent dans `lib/abonnements.js` depuis le premier jour, éprouvés
// par 455 vérifications. Les recopier aurait garanti qu'un jour la cliente et la
// commerçante obtiennent deux réponses différentes sur la même séance.
import {
  peutReserverSurAbonnement, seancesConsommees, datesConsommees, soldeAbonnement,
  semainesSuivantes, expliquerRefusCommercant, formatDateCourte,
} from '@/lib/abonnements'

const T = {
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

const JOURS_KEY  = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOURS_LONG = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']
const MOIS_LONG  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function jourIdxLun(d) { return (d.getDay() + 6) % 7 }

// Le choix « une table » du menu, quand la salle se compte en tables : la table
// précise, c'est la salle qui la donne, pas le menu.
const UNE_TABLE = '__table__'

// ⚠️ LA SALLE SE LIT EN BASE, JAMAIS DANS L'ÉTAT DE L'AGENDA (10/09 au soir).
// Une table réservée en ligne pendant que le restaurateur est au téléphone doit
// compter, et l'agenda ouvert depuis vingt minutes ne la connaît pas.
const lireSalle = (commercantId, dateStr) => lireSalleDuJour(supabase, { commercantId, dateStr })

export default function ModalNouveauRdv({
  commercant, prestations, creneaux, rdvsExistants,
  dateInit, heureInit,
  onClose, onCreated,
}) {
  // 🔴 LE TÉLÉPHONE EST LE PREMIER CANAL D'UN RESTAURANT, ET CETTE MODALE
  // COMPTAIT CHAQUE APPEL POUR UNE PERSONNE. Une table de six prise de vive
  // voix entrait en base avec `couverts` à sa valeur par défaut : la jauge de
  // la salle voyait un couvert au lieu de six, et le service se remplissait de
  // réservations que la salle ne pouvait pas tenir. Ce n'est pas un libellé,
  // c'est la donnée qui fait tenir la salle.
  const mots = motsReservation(commercant)

  // 🔴 LA SALLE N'ÉTAIT PAS COMPTÉE ICI (Alex, 10/09 au soir : « quand on ajoute
  // une résa manuellement, il tient compte des dispos ? »). Le restaurateur
  // choisissait un format à l'aveugle, sans rien voir de ce qui était pris.
  // Désormais, comme sur la fiche en ligne : il dit combien ils sont, Yoppaa
  // propose la plus petite table libre, et montre ce qui reste.
  //
  // ⚠️ SEULEMENT QUAND LA SALLE SE COMPTE EN TABLES, c'est-à-dire quand chaque
  // format a sa quantité. Sans inventaire, rien ne permet de dire « libre », et
  // la saisie reste celle d'avant, format choisi à la main.
  const salleEnTables = enModeInventaire(prestations)
  const autresPrestations = (prestations || []).filter(p => !estParCouverts(p))
  // Un restaurant qui ne propose que des tables n'a rien à choisir dans un menu.
  const tableSeule = salleEnTables && autresPrestations.length === 0
  const [prestationId, setPrestationId] = useState(tableSeule ? UNE_TABLE : '')
  const [couverts, setCouverts] = useState('')
  // La table désignée par le restaurateur, quand il ne veut pas celle proposée.
  const [formatManuelId, setFormatManuelId] = useState(null)
  const [changerTable, setChangerTable] = useState(false)
  const [salle, setSalle] = useState({ etat: 'repos', reservations: [] })
  const [relire, setRelire] = useState(0)
  const enTable = salleEnTables && prestationId === UNE_TABLE
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [tel, setTel] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // ─── LES ABONNÉS DE CE COURS ────────────────────────────────────────────
  //
  // ⚠️ CE BLOC COMBLE UN TROU, PAS UN CONFORT. Jusqu'au 18/08, un abonnement
  // obligeait la CLIENTE à réserver depuis l'application : cette modale ne
  // connaissait même pas le mot « abonnement ». Une abonnée de 70 ans qui
  // téléphone ne pouvait tout simplement pas être inscrite, et depuis que le
  // jour fixe a disparu, plus aucune séance ne se pose toute seule.
  //
  // ⚠️ ON PART DE LA PERSONNE, PAS DU FORMULAIRE. La commerçante pense « la
  // séance de Sophie », jamais « un rendez-vous qui se trouve être sur un
  // abonnement ». Choisir l'abonnée remplit son identité ET attache le contrat.
  const [abonnes, setAbonnes] = useState([])
  const [aboChoisiId, setAboChoisiId] = useState(null)
  const [repeter, setRepeter] = useState(0)

  useEffect(() => {
    let annule = false
    setAboChoisiId(null); setRepeter(0)
    // ⚠️ « Une table » n'est pas une prestation : la chercher en base ferait
    // échouer la requête sur un identifiant qui n'existe pas.
    if (!prestationId || prestationId === UNE_TABLE) { setAbonnes([]); return }
    ;(async () => {
      const { data: contrats } = await supabase
        .from('abonnements')
        .select('id, client_prenom, client_nom, client_telephone, client_email, statut, date_debut, date_fin, seances_total, seances_par_semaine, formule:abonnement_formules(libelle)')
        .eq('commercant_id', commercant.id)
        .eq('prestation_id', prestationId)
        .eq('statut', 'actif')
        .is('deleted_at', null)
      if (annule) return
      const ids = (contrats || []).map(c => c.id)
      // ⚠️ LE DÉCOMPTE SE LIT EN BASE, JAMAIS DANS L'ÉTAT DE L'ÉCRAN. L'agenda
      // ouvert depuis vingt minutes ne sait pas que la cliente a réservé entre
      // temps depuis son téléphone, et le solde afficherait une séance de trop.
      let reservations = []
      if (ids.length > 0) {
        const { data } = await supabase
          .from('rdv_reservations')
          .select('abonnement_id, date_rdv, statut')
          .in('abonnement_id', ids)
          .is('deleted_at', null)
        reservations = data || []
      }
      if (annule) return
      setAbonnes((contrats || []).map(c => {
        const consommees = seancesConsommees(reservations, { abonnementId: c.id })
        return {
          contrat: c,
          consommees,
          solde: soldeAbonnement(c, consommees),
          datesPrises: datesConsommees(reservations, { abonnementId: c.id }),
        }
      }))
    })().catch(e => console.warn('[ModalNouveauRdv] abonnés KO', e?.message))
    return () => { annule = true }
  }, [prestationId, commercant.id])

  // Focus auto à l'ouverture : sur le menu, ou sur le nombre de personnes quand
  // il n'y a pas de menu, chez un restaurant qui ne propose que des tables.
  useEffect(() => {
    const el = document.getElementById('mn-rdv-presta') || document.getElementById('mn-rdv-couverts')
    if (el) el.focus()
  }, [])

  // La salle du jour, relue à l'ouverture et à chaque « Réessayer ».
  const dateSalle = isoDate(dateInit)
  useEffect(() => {
    if (!enTable) return
    let annule = false
    setSalle({ etat: 'lecture', reservations: [] })
    lireSalle(commercant.id, dateSalle).then(({ reservations, error }) => {
      if (annule) return
      setSalle(error
        ? { etat: 'erreur', reservations: [], message: error.message }
        : { etat: 'ok', reservations })
    }).catch(e => {
      // ⚠️ UNE LECTURE QUI LÈVE NE LAISSE PAS « JE REGARDE TA SALLE » À VIE.
      if (!annule) setSalle({ etat: 'erreur', reservations: [], message: e?.message || String(e) })
    })
    return () => { annule = true }
  }, [enTable, commercant.id, dateSalle, relire])

  // ESC pour fermer
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dateLabel = `${JOURS_LONG[jourIdxLun(dateInit)]} ${dateInit.getDate()} ${MOIS_LONG[dateInit.getMonth()]}`
  const debutMin = timeToMinutes(heureInit)

  // ─── LA TABLE QUE LA SALLE DONNE ───────────────────────────────────────────
  //
  // ⚠️ DANS CET ORDRE, ET IL N'Y EN A PAS D'AUTRE : la durée du repas d'abord,
  // qui ne dépend que du groupe ; puis ce qui est libre sur toute cette durée ;
  // puis la table. Choisir la table avant de connaître la durée compterait la
  // salle sur une fenêtre fausse.
  const nCouverts = Math.floor(Number(couverts))
  const nombreSaisi = couverts !== '' && Number.isFinite(nCouverts) && nCouverts >= 1
  const referenceGroupe = enTable && nombreSaisi ? formatPourAffichage(prestations, nCouverts) : null
  const dureeGroupe = referenceGroupe
    ? dureeDuGroupe({ prestation: referenceGroupe, formats: prestations, couverts: nCouverts })
    : null
  const etat = dureeGroupe && salle.etat === 'ok'
    ? etatSalle({ formats: prestations, couverts: nCouverts, reservations: salle.reservations, debutMin, finMin: debutMin + dureeGroupe })
    : null
  const choixTable = !enTable || !nombreSaisi ? null
    : !referenceGroupe ? { format: null, forcer: false, raison: 'trop_grand' }
    : tableAPoser(etat, { prefere: formatManuelId })

  const presta = enTable
    ? (choixTable?.format || null)
    : prestations.find(p => String(p.id) === String(prestationId))
  // ⚠️ LA DURÉE SUIT LE GROUPE ICI AUSSI, et c'est la fonction du serveur,
  // `dureeDuGroupe`. Elle calculait la sienne sur la table choisie : un couple
  // posé au téléphone sur une table de quatre bloquait deux heures, le même
  // couple réservé en ligne une heure et demie. Hors inventaire, tant que le
  // nombre n'est pas saisi, on affiche la durée du plus petit groupe possible,
  // celle qui sera juste si le commerçant valide sans y toucher.
  const dureeMin = enTable
    ? (dureeGroupe || undefined)
    : presta
    ? dureeDuGroupe({ prestation: presta, formats: prestations, couverts: couverts === '' ? bornesCouverts(presta).min : couverts })
    : undefined
  const finMin = dureeMin ? debutMin + dureeMin : null
  const heureFin = finMin != null ? minutesToTime(finMin) : null
  const messageSalle = choixTable
    ? phraseSalle({ formats: prestations, etat, choix: choixTable, couverts: nCouverts, debut: heureInit, fin: heureFin, manuel: !!formatManuelId })
    : null

  // Le prix de la prestation. Plus de fourchette depuis le 27/08 : le prix est
  // le prix, et ce qu'on ajoute se règle à la caisse.
  const prixEstime = presta && presta.prix != null ? Number(presta.prix) : null

  // ⚠️ LE VERDICT EST CALCULÉ ICI ET RÉUTILISÉ PARTOUT : l'encadré, le libellé du
  // bouton et l'écriture posent la MÊME question. Deux calculs auraient fini par
  // proposer un geste que l'enregistrement refuse.
  const dateChoisie = isoDate(dateInit)
  const aboChoisi = abonnes.find(a => a.contrat.id === aboChoisiId) || null
  const verdictAbo = aboChoisi
    ? peutReserverSurAbonnement(aboChoisi.contrat, {
        date: dateChoisie,
        seancesUtilisees: aboChoisi.consommees,
        datesDejaPrises: aboChoisi.datesPrises,
      })
    : null
  const surAbonnement = !!(aboChoisi && verdictAbo?.ok)

  // Les dates que le bouton « répéter » poserait vraiment, bornes comprises.
  const datesRepetees = surAbonnement && repeter > 0
    ? semainesSuivantes(dateChoisie, {
        nombre: repeter,
        jusqua: aboChoisi.contrat.date_fin,
        datesDejaPrises: aboChoisi.datesPrises,
        // ⚠️ Moins un : la séance du jour consomme déjà une unité du solde.
        soldeRestant: aboChoisi.solde === null ? null : Math.max(0, aboChoisi.solde - 1),
      })
    : []

  // ⚠️ L'IDENTITÉ VIENT DU CONTRAT quand on pose sur un abonnement : le nom et
  // le téléphone sont ceux de la souscription, et le formulaire n'a plus à être
  // rempli. Un abonné sans téléphone existe, la garde ne doit donc pas l'exiger.
  // ⚠️ `presta` ET PAS SEULEMENT `prestationId` : « une table » n'est choisie
  // qu'une fois la salle lue et le nombre saisi. Avant, il n'y a rien à écrire.
  const formValide = !!(prestationId && presta && (
    aboChoisi ? true : (prenom.trim() && nom.trim() && tel.trim())
  ))

  async function valider() {
    if (!formValide || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const dateStr = isoDate(dateInit)
      const jourKey = JOURS_KEY[jourIdxLun(dateInit)]
      const horaireJour = commercant.horaires_detail?.[jourKey]
      // Logs diag : si la modale accepte un RDV qui chevauche pause/fermeture, on saura
      // immediatement quel input est manquant (creneaux vide, horaireJour null, etc.)
      console.info('[ModalNouveauRdv] valider — context', {
        dateStr, jourKey, heureInit, dureeMin, debutMin, finMin,
        horaireJour,
        nbCreneaux: (creneaux || []).length,
        nbRdvsExistants: (rdvsExistants || []).length,
      })
      // 1) CE CRÉNEAU ACCEPTE-T-IL CE RENDEZ-VOUS ?
      //
      // ⚠️ LA RÈGLE A DÉMÉNAGÉ DANS `lib/deplacement-rdv.js`, et ce n'est pas
      // un rangement. Le déplacement d'un rendez-vous, livré le 15/08, doit
      // poser EXACTEMENT les mêmes questions que la création : chevauchement,
      // jour de fermeture, heures d'ouverture, pause, dépassement de créneau.
      // Deux copies de cinq contrôles auraient divergé au premier correctif, et
      // le commerçant aurait obtenu un créneau par une porte et un refus par
      // l'autre. Elle est PURE, donc le banc l'exécute au lieu de la lire.
      //
      // Elle distingue toujours deux natures de superposition : les CO-INSCRITS
      // d'un même cours, qui ne sont pas un conflit tant qu'il reste de la
      // place, et tout le reste, qui en est un.
      //
      // Un seul changement d'ordre : les contrôles de structure (fermeture,
      // horaires, pause) passent désormais AVANT le calcul des places. Un
      // rendez-vous posé un jour de fermeture disait « ce cours est complet »,
      // il dit maintenant « ton commerce est fermé ce jour-là », ce qui est la
      // vraie raison.
      const capacite = capacitePrestation(presta)

      // ⚠️ LE NOMBRE SE VALIDE AVANT D'ÊTRE ÉCRIT, avec la même fonction que le
      // tunnel client : `couvertsValides` rend `null` hors des bornes. Accepter
      // « 12 » sur une table de quatre remplirait la salle d'un service qui ne
      // peut pas se tenir, et personne ne s'en apercevrait avant le coup de feu.
      const couvertsRetenus = estParCouverts(presta)
        ? couvertsValides(presta, couverts === '' ? bornesCouverts(presta).min : couverts)
        : 1
      if (couvertsRetenus === null) {
        const { min, max } = bornesCouverts(presta)
        setError(`Cette table accueille de ${min} à ${max} personnes. Corrige le nombre.`)
        setSubmitting(false)
        return
      }

      const verdict = creneauAcceptable({
        dateStr,
        heureDebut: heureInit,
        dureeMinutes: dureeMin,
        horaireJour,
        creneauxJour: creneauxDuJour(creneaux, { dateStr, jour: jourKey }),
        rdvsExistants,
        capacite,
        prestationId: presta.id,
        // 🔴 SANS LE CATALOGUE, DEUX TABLES QUI SE CHEVAUCHENT ÉTAIENT UN
        // CONFLIT (10/09) : le restaurateur ne pouvait pas prendre au téléphone
        // une table à 19h30 si une autre était assise depuis 19h.
        prestations,
      })
      if (!verdict.ok) {
        console.warn('[ModalNouveauRdv] créneau refusé', verdict)
        setError(verdict.message)
        setSubmitting(false)
        return
      }

      // ─── LA SALLE, RELUE AU MOMENT D'ÉCRIRE ─────────────────────────────────
      //
      // ⚠️ CE QUE L'ÉCRAN A MONTRÉ N'EST PAS UNE PREUVE. Entre l'ouverture de la
      // fenêtre et ce clic, un client a pu réserver en ligne la dernière table
      // de quatre. Si la décision change, on n'écrit RIEN : on montre la salle
      // telle qu'elle est, et le restaurateur confirme en connaissance de cause.
      // C'est aussi ce qui fait du « poser quand même » un vrai second geste
      // quand la salle se remplit pendant l'appel.
      if (enTable) {
        const frais = await lireSalle(commercant.id, dateStr)
        if (frais.error) {
          setError(`Impossible de lire ta salle : ${frais.error.message}`)
          setSubmitting(false)
          return
        }
        const choixFrais = tableAPoser(etatSalle({
          formats: prestations, couverts: nCouverts, reservations: frais.reservations, debutMin, finMin,
        }), { prefere: formatManuelId })
        if (String(choixFrais.format?.id) !== String(presta.id) || choixFrais.forcer !== choixTable.forcer) {
          setSalle({ etat: 'ok', reservations: frais.reservations })
          setError('Ta salle a changé pendant la saisie. Relis la table proposée, puis confirme.')
          setSubmitting(false)
          return
        }
      }

      // ⚠️ LES PLACES SE LISENT EN BASE, JAMAIS DANS L'ÉTAT DE L'ÉCRAN. L'agenda
      // peut avoir quelques minutes de retard, et une place attribuée deux fois
      // serait rejetée par l'index unique avec un message incompréhensible.
      //
      // ⚠️ ET LA PLACE SE CALCULE POUR CHAQUE DATE, pas une fois pour toutes.
      // Répéter une séance sur huit semaines, c'est huit cours différents, avec
      // huit remplissages différents : recopier la place du premier ferait
      // rejeter la moitié de la série par l'index unique.
      const toutesLesDates = [dateStr, ...datesRepetees]
      const placeParDate = {}
      if (estParCouverts(presta)) {
        // 🔴 UNE TABLE CHERCHE SON RANG PARMI TOUTES LES RÉSERVATIONS DE L'HEURE
        // (10/09), tous formats confondus : l'index anti double-booking ne
        // connaît pas la prestation, et un rang cherché dans le seul format de
        // la table redonnait le 1 déjà pris par la table d'à côté. Même règle
        // que le serveur, `rangLibre`, et pas de « complet » ici : le
        // restaurateur connaît sa salle, son agenda reste le sien.
        const { data: memeHeure, error: errRangs } = await supabase
          .from('rdv_reservations')
          .select('date_rdv, place_no')
          .eq('commercant_id', commercant.id)
          .in('date_rdv', toutesLesDates)
          .eq('heure_debut', heureInit)
          .in('statut', ['confirme', 'honore'])
          .is('deleted_at', null)
        if (errRangs) {
          setError(`Impossible de lire les tables déjà posées à cette heure : ${errRangs.message}`)
          setSubmitting(false)
          return
        }
        const rangsParDate = {}
        for (const r of memeHeure || []) {
          (rangsParDate[r.date_rdv] = rangsParDate[r.date_rdv] || []).push(r.place_no)
        }
        for (const d of toutesLesDates) placeParDate[d] = rangLibre(rangsParDate[d] || [])
      } else if (capacite > 1) {
        const { data: dejaLa } = await supabase
          .from('rdv_reservations')
          .select('date_rdv, place_no')
          .eq('commercant_id', commercant.id)
          .eq('prestation_id', presta.id)
          .in('date_rdv', toutesLesDates)
          .eq('heure_debut', heureInit)
          .in('statut', ['confirme', 'honore'])
          .is('deleted_at', null)
        const prisesParDate = {}
        for (const r of dejaLa || []) {
          (prisesParDate[r.date_rdv] = prisesParDate[r.date_rdv] || []).push(r.place_no)
        }
        const completes = []
        for (const d of toutesLesDates) {
          const libre = premierePlaceLibre(presta, prisesParDate[d] || [])
          if (libre === null) { completes.push(d); continue }
          placeParDate[d] = libre
        }
        // ⚠️ ON NE CACHE JAMAIS UN TROU dans une série, et on ne refuse pas tout
        // pour autant : huit semaines dont une complète, ce sont sept séances à
        // poser et UNE à nommer. Sur la séance seule, en revanche, il n'y a rien
        // à sauver, on dit simplement que le cours est complet.
        if (completes.includes(dateStr)) {
          setError(`Ce cours est complet (${capacite} personne${capacite > 1 ? 's' : ''}).`)
          setSubmitting(false)
          return
        }
        if (completes.length > 0) {
          setError(`${completes.length} semaine${completes.length > 1 ? 's' : ''} déjà complète${completes.length > 1 ? 's' : ''} : ${completes.map(d => formatDateCourte(d)).join(', ')}. Les autres séances vont être posées.`)
        }
      } else {
        for (const d of toutesLesDates) placeParDate[d] = 1
      }
      const datesAPoser = toutesLesDates.filter(d => placeParDate[d] != null)

      // 2) Acompte (figé selon prestation ou pourcent global)
      const acomptePct = presta.acompte_pourcent || commercant.rdv_acompte_global || 0
      const acompteMontant = (prixEstime != null && acomptePct > 0)
        ? Math.round(prixEstime * acomptePct) / 100
        : null

      // 3) Insert
      //
      // ⚠️ L'IDENTITÉ VIENT DU CONTRAT quand la séance est posée dessus. Laisser
      // la commerçante retaper le nom, c'est laisser « Sophie Dubois » devenir
      // « sophie dubois » sur une séance et pas sur les autres, et l'abonnée se
      // retrouve en deux personnes dans son propre historique.
      const identite = aboChoisi
        ? {
            client_prenom: aboChoisi.contrat.client_prenom || prenom.trim() || 'Abonné',
            client_nom: aboChoisi.contrat.client_nom || nom.trim() || null,
            client_telephone: aboChoisi.contrat.client_telephone || tel.trim() || null,
            client_email: aboChoisi.contrat.client_email || email.trim() || null,
          }
        : {
            client_prenom: prenom.trim(),
            client_nom: nom.trim(),
            client_telephone: tel.trim(),
            client_email: email.trim() || null,
          }
      const rdvId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null
      const payload = {
        ...(rdvId ? { id: rdvId } : {}),
        commercant_id: commercant.id,
        client_id: null,                    // saisie manuelle, pas de lien clients (decision Alex)
        prestation_id: presta.id,
        ...identite,
        date_rdv: dateStr,
        heure_debut: heureInit,
        heure_fin: heureFin,
        duree_minutes: dureeMin,
        // ⚠️ LE LIEN AVEC LE CONTRAT, sans lequel le solde ne descend jamais et
        // la séance réclame de l'argent au comptoir alors qu'elle est payée.
        abonnement_id: surAbonnement ? aboChoisi.contrat.id : null,
        // ⚠️ PRIX ZÉRO SUR UNE SÉANCE D'ABONNEMENT, le montant vit sur le
        // contrat. Le recopier trente-six fois multiplierait le chiffre
        // d'affaires par trente-six, et c'est le piège du zéro à l'envers :
        // ici le zéro est la bonne réponse, pas une absence.
        prix_estime: surAbonnement ? 0 : prixEstime,
        acompte_montant: surAbonnement ? null : acompteMontant,
        // ⚠️ ICI, DÛ ET ENCAISSÉ SONT LE MÊME NOMBRE : un rendez-vous posé au
        // comptoir ne porte aucun bon cadeau, donc rien ne vient se déduire de
        // l'acompte. On l'écrit quand même, parce que `null` voudrait dire
        // « on ne sait pas » et priverait un futur no-show de sa borne.
        acompte_du: surAbonnement ? null : acompteMontant,
        acompte_paye: false,
        statut: 'confirme',
        // TVA figée à la réservation : recalculer plus tard depuis la
        // prestation réécrirait l'historique au moindre changement de taux.
        tva_taux: presta.tva_taux ?? null,
        notes_client: notes.trim() || null,
        rgpd_marketing: false,
        source: 'commercant',               // distingue des RDVs pris en ligne par un Yopper
        // ⚠️ LA PLACE ET LA CAPACITÉ, GRAVÉES ICI AUSSI. Sans `place_no`, deux
        // inscrits d'un même cours se disputaient la place 1 et l'index unique
        // renvoyait « ce créneau vient d'être pris » devant un cours vide. Sans
        // `capacite_creneau`, la contrainte d'exclusion, active quand elle vaut
        // 1, bloquait le deuxième inscrit dès qu'un praticien était nommé.
        place_no: placeParDate[dateStr],
        capacite_creneau: capacite,
        // ⚠️ APRÈS le reste, jamais avant : une clé écrite plus haut serait
        // écrasée par un `...champs` qui suit, et le couvert retomberait à 1
        // sans un mot. Même précaution que dans `rdv-creation-server`.
        couverts: couvertsRetenus,
      }
      // ⚠️ LE LIEU EST GRAVÉ À LA RÉSERVATION, ici aussi. Un rendez-vous pris
      // au comptoir par le commerçant doit dire où aller comme les autres.
      Object.assign(payload, await champsLieuPour(supabase, commercant, { jour: dateStr, heure: heureInit }))

      // ⚠️ LES SEMAINES RÉPÉTÉES SONT DES SÉANCES À PART ENTIÈRE, pas des copies.
      // Chacune a SA place, calculée plus haut, et SON lieu : le module LIEUX
      // autorise un endroit différent d'une semaine à l'autre, un marché de Noël
      // qui remplace la salle habituelle. Recopier le lieu du premier jour ferait
      // envoyer l'abonnée au mauvais endroit six semaines plus tard.
      const lignes = [payload]
      for (const d of datesAPoser) {
        if (d === dateStr) continue
        lignes.push({
          ...payload,
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : undefined,
          date_rdv: d,
          place_no: placeParDate[d],
          ...(await champsLieuPour(supabase, commercant, { jour: d, heure: heureInit })),
        })
      }
      const { error: errInsert } = await supabase.from('rdv_reservations').insert(lignes)
      if (errInsert) {
        if (errInsert.code === '23505') {
          // ⚠️ SUR UN COURS, CE MESSAGE MENTAIT. La place calculée juste avant
          // vient d'être prise par quelqu'un d'autre : le cours n'est pas
          // « déjà pris », il a simplement bougé pendant la saisie.
          setError(estParCouverts(presta)
            ? 'Une autre table vient d\'être posée à la même heure pendant ta saisie. Réessaie, le rang suivant sera calculé.'
            : capacite > 1
            ? 'Une place vient d\'être prise pendant ta saisie. Réessaie, la suivante sera calculée.'
            : 'Ce créneau exact vient d\'être pris (autre RDV identique). Recharge ton agenda.')
        } else {
          setError(`Erreur : ${errInsert.message || 'inconnue'}`)
        }
        setSubmitting(false)
        return
      }

      // 4) Email de confirmation au Yopper (non-bloquant, fire-and-forget).
      //    Pas d'email commercant (c'est lui qui cree le RDV, il sait deja).
      if (rdvId && (email.trim() || null)) {
        postPro('/api/emails/rdv-confirme', { rdv_id: rdvId }).catch(e => console.warn('[ModalNouveauRdv] emails fire-and-forget KO', e))
      }

      // 5) Success : callback + close
      if (onCreated) onCreated()
      onClose()

    } catch (e) {
      console.error('[ModalNouveauRdv] exception', e)
      setError(`Erreur inattendue : ${e?.message || String(e)}`)
      setSubmitting(false)
    }
  }

  const inputSt = {
    width: '100%', padding: '0.625rem 0.875rem', borderRadius: 10,
    border: `1.5px solid ${T.pale}`, fontSize: '0.9rem',
    fontFamily: '"DM Sans", sans-serif', color: T.ink,
    background: '#fff', outline: 'none', boxSizing: 'border-box',
  }
  const labelSt = { fontSize: '0.65rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }
  // Les trois tons de ce que la salle répond : une table, un avertissement, un refus.
  const TONS = {
    ok:     { fond: `${T.main}0D`, bord: `${T.main}33`, texte: T.deep },
    alerte: { fond: '#FFFBEB', bord: '#FCD34D', texte: '#92400E' },
    refus:  { fond: '#FEF2F2', bord: '#FCA5A5', texte: '#DC2626' },
  }
  const boiteSt = (ton) => ({ background: (TONS[ton] || TONS.ok).fond, border: `1.5px solid ${(TONS[ton] || TONS.ok).bord}`, borderRadius: 10, padding: '0.625rem 0.875rem' })
  const titreBoiteSt = (ton) => ({ fontSize: '0.84rem', fontWeight: 800, color: (TONS[ton] || TONS.ok).texte, margin: 0, lineHeight: 1.4 })
  const lienSt = { background: 'none', border: 'none', padding: 0, color: T.main, fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', fontFamily: '"DM Sans", sans-serif' }

  // React Portal : rend la modale au niveau document.body, ce qui la fait sortir de tous
  // les stacking contexts du dashboard (sidebar, topbar, ancestors avec transform/filter).
  // Sans le portal, la modale etait partiellement masquee par le layout dashboard.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, padding: '1rem', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18, overflow: 'hidden', marginTop: '2rem', marginBottom: '2rem', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 20px 60px rgba(22,6,54,0.4)' }}>

        {/* Header sombre canonique Yoppaa */}
        <div style={{ background: `linear-gradient(135deg, ${T.bgPanel || '#160636'} 0%, ${T.deep} 100%)`, color: '#fff', padding: '1rem 1.125rem', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', margin: 0, marginBottom: 4, opacity: 0.85 }}>
                {mots.manuelTitre}
              </p>
              <p style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                {dateLabel}<br/>
                <span style={{ color: T.light }}>à {heureInit}{heureFin ? ` – ${heureFin}` : ''}</span>
              </p>
            </div>
            <button onClick={onClose} aria-label="Fermer"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', cursor: 'pointer', borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Body — form */}
        <div style={{ padding: '1.125rem 1.125rem 0' }}>
          {/* Prestation. ⚠️ PAS DE MENU chez un restaurant qui ne propose que
              des tables : la table, c'est la salle qui la donne. Quand la salle
              se compte en tables, ses formats se rangent sous « Une table ». */}
          {!tableSeule && (
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="mn-rdv-presta" style={labelSt}>{mots.prestationLigne} *</label>
              <select id="mn-rdv-presta" value={prestationId}
                onChange={(e) => { setPrestationId(e.target.value); setFormatManuelId(null); setChangerTable(false) }} style={inputSt}>
                <option value="">Choisir {mots.prestationUne}</option>
                {salleEnTables && <option value={UNE_TABLE}>Une table</option>}
                {(salleEnTables ? autresPrestations : (prestations || [])).map(p => {
                  const prix = p.prix != null ? `${Number(p.prix).toFixed(0)}€` : ''
                  return (
                    <option key={p.id} value={p.id}>
                      {p.nom} · {p.duree_minutes}min{prix ? ` · ${prix}` : ''}
                    </option>
                  )
                })}
              </select>
              {!enTable && presta && heureFin && (
                <p style={{ fontSize: '0.72rem', color: T.main, fontWeight: 700, marginTop: 5 }}>
                  {mots.numeroLabel} de {dureeMin}min : {heureInit} → {heureFin}{prixEstime != null ? ` · ${prixEstime.toFixed(0)}€` : ''}
                </p>
              )}
            </div>
          )}

          {/* 🔴 COMBIEN DE PERSONNES, ET IL N'Y AVAIT AUCUN CHAMP POUR LE DIRE.
              Le téléphone est le premier canal d'un restaurant : une table de
              six prise de vive voix entrait à un seul couvert, et la salle se
              croyait vide alors qu'elle était pleine.
              ⚠️ N'APPARAÎT QUE SUR UNE PRESTATION DÉCLARÉE « TABLE ». Un
              rendez-vous de coiffure n'a pas de couverts, et lui poser la
              question serait aussi faux que de ne pas la poser au restaurant.
              ⚠️ ET QUAND LA SALLE SE COMPTE EN TABLES, IL VIENT EN PREMIER : c'est
              lui qui choisit la table, comme sur la fiche en ligne. */}
          {enTable ? (
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="mn-rdv-couverts" style={labelSt}>Combien de personnes ? *</label>
              <input id="mn-rdv-couverts" type="number" inputMode="numeric"
                min={1} max={plusGrandeTable(prestations) || undefined}
                value={couverts} onChange={(e) => { setCouverts(e.target.value); setFormatManuelId(null) }}
                placeholder="Par exemple 2" style={inputSt}/>
              {!nombreSaisi && (
                <p style={{ fontSize: '0.72rem', color: T.muted, marginTop: 5, lineHeight: 1.45 }}>
                  Yoppaa te propose ensuite la plus petite table libre, et te montre ce qui reste dans ta salle.
                </p>
              )}
            </div>
          ) : presta && estParCouverts(presta) && (
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="mn-rdv-couverts" style={labelSt}>Combien de personnes ? *</label>
              <input id="mn-rdv-couverts" type="number" inputMode="numeric"
                min={bornesCouverts(presta).min} max={bornesCouverts(presta).max}
                value={couverts} onChange={(e) => setCouverts(e.target.value)}
                placeholder={String(bornesCouverts(presta).min)} style={inputSt}/>
              <p style={{ fontSize: '0.72rem', color: T.muted, marginTop: 5, lineHeight: 1.45 }}>
                De {bornesCouverts(presta).min} à {bornesCouverts(presta).max} personnes pour cette table.
                C&rsquo;est ce nombre qui remplit ta salle.
              </p>
            </div>
          )}

          {/* ─── LA SALLE, TELLE QU'ELLE EST À CETTE HEURE ─────────────────────
              La table proposée, pourquoi celle-là, et ce qui reste libre sur
              TOUTE la durée du repas. Le restaurateur au téléphone voit sa
              salle au lieu de la deviner. */}
          {enTable && nombreSaisi && (
            <div style={{ marginBottom: 12 }}>
              {salle.etat === 'lecture' && choixTable?.raison !== 'trop_grand' && (
                <p style={{ fontSize: '0.78rem', color: T.muted, margin: 0 }}>Je regarde ta salle…</p>
              )}
              {salle.etat === 'erreur' && choixTable?.raison !== 'trop_grand' && (
                <div style={boiteSt('refus')}>
                  <p style={titreBoiteSt('refus')}>Impossible de lire ta salle{salle.message ? ` : ${salle.message}` : ''}.</p>
                  <button type="button" onClick={() => setRelire(n => n + 1)} style={lienSt}>Réessayer</button>
                </div>
              )}
              {messageSalle && (
                <div style={boiteSt(messageSalle.ton)}>
                  <p style={titreBoiteSt(messageSalle.ton)}>{messageSalle.titre}</p>
                  {messageSalle.detail && (
                    <p style={{ fontSize: '0.75rem', color: T.deep, margin: '4px 0 0', lineHeight: 1.5 }}>{messageSalle.detail}</p>
                  )}
                </div>
              )}
              {etat && etat.parFormat.length > 0 && heureFin && (
                <div style={{ marginTop: 10 }}>
                  <span style={labelSt}>Libres de {heureInit} à {heureFin}</span>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {etat.parFormat.map(l => {
                      const retenue = presta && String(presta.id) === String(l.format.id)
                      return (
                        <div key={l.format.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.8rem', color: l.libres > 0 ? T.deep : T.muted, fontWeight: retenue ? 800 : 600 }}>
                          <span>{l.format.nom}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{l.libres} sur {l.total}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {/* ⚠️ LE RESTAURATEUR GARDE LA MAIN : un habitué qui aime la
                  table du fond passe avant la règle. Mais on lui dit ce que
                  vaut chaque table, sans quoi il choisirait à l'aveugle comme
                  avant. Une table trop petite ou trop grande pour le groupe ne
                  se choisit pas : c'est la même borne qu'en ligne. */}
              {etat && choixTable?.format && (
                changerTable ? (
                  <div style={{ marginTop: 10 }}>
                    <label htmlFor="mn-rdv-table" style={labelSt}>Table</label>
                    <select id="mn-rdv-table" value={formatManuelId || ''} onChange={(e) => setFormatManuelId(e.target.value || null)} style={inputSt}>
                      <option value="">La table proposée par Yoppaa</option>
                      {etat.parFormat.map(l => (
                        <option key={l.format.id} value={l.format.id} disabled={!l.convient}>
                          {l.format.nom} · {!l.convient
                            ? `pas pour ${nCouverts} personne${nCouverts > 1 ? 's' : ''}`
                            : l.libres > 0 ? `${l.libres} libre${l.libres > 1 ? 's' : ''}` : 'aucune libre'}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <button type="button" onClick={() => setChangerTable(true)} style={{ ...lienSt, marginTop: 8 }}>Changer de table</button>
                )
              )}
            </div>
          )}

          {/* ─── L'ABONNÉE, S'IL Y EN A UNE ────────────────────────────────
              ⚠️ CE BLOC N'APPARAÎT QUE S'IL A QUELQUE CHOSE À DIRE : un cours
              sans abonné ne doit pas encombrer la saisie la plus fréquente,
              celle d'un rendez-vous ordinaire. */}
          {abonnes.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={labelSt}>Séance d&rsquo;abonnement</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {abonnes.map(a => {
                  const choisi = a.contrat.id === aboChoisiId
                  const v = peutReserverSurAbonnement(a.contrat, {
                    date: dateChoisie,
                    seancesUtilisees: a.consommees,
                    datesDejaPrises: a.datesPrises,
                  })
                  const nomComplet = `${a.contrat.client_prenom || ''} ${a.contrat.client_nom || ''}`.trim()
                  return (
                    <button key={a.contrat.id} type="button"
                      onClick={() => { setAboChoisiId(choisi ? null : a.contrat.id); setRepeter(0); setError(null) }}
                      style={{
                        textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                        background: choisi ? `${T.main}12` : '#fff',
                        border: `1.5px solid ${choisi ? T.main : T.pale}`,
                        fontFamily: '"DM Sans", sans-serif',
                      }}>
                      <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: choisi ? T.main : T.ink }}>
                        {nomComplet || 'Abonné'}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: T.muted, marginTop: 2 }}>
                        {a.contrat.formule?.libelle || 'Abonnement'}
                        {a.solde !== null ? ` · ${a.solde} séance${a.solde > 1 ? 's' : ''} restante${a.solde > 1 ? 's' : ''}` : ''}
                        {a.contrat.date_fin ? ` · jusqu’au ${formatDateCourte(a.contrat.date_fin)}` : ''}
                      </span>
                      {/* ⚠️ LE REFUS EST NOMMÉ, ET IL EST NOMMÉ ICI, sur la ligne
                          concernée. Griser la ligne sans dire pourquoi renvoie la
                          commerçante au téléphone : « tu as déjà ta séance cette
                          semaine » se règle en changeant de date, « solde épuisé »
                          en vendant un nouveau contrat. */}
                      {!v.ok && (
                        <span style={{ display: 'block', fontSize: '0.72rem', color: '#9A3412', marginTop: 4, lineHeight: 1.45 }}>
                          {expliquerRefusCommercant(v.raison, a.contrat, { plafond: v.plafond, prenom: a.contrat.client_prenom })}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* ⚠️ ON LAISSE PASSER OUTRE, ET C'EST INDISPENSABLE. Sans cette
                  sortie, la commerçante est bloquée par son PROPRE plafond : une
                  abonnée qui vient une fois de plus dans la semaine ne peut plus
                  être inscrite du tout, et Emily rappelle Alex. La séance est
                  alors posée au tarif normal, hors contrat, et le solde ne bouge
                  pas : c'est une vente, pas un passe-droit. */}
              {aboChoisi && !verdictAbo?.ok && (
                <p style={{ fontSize: '0.72rem', color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
                  Tu peux quand même poser cette séance : elle sera enregistrée <strong>hors abonnement</strong>, au tarif normal
                  {prixEstime != null ? ` de ${euros(prixEstime)}` : ''}, et le solde ne bougera pas.
                </p>
              )}

              {/* ─── LE BOUTON D'ALEX : répéter sur les semaines suivantes ─── */}
              {surAbonnement && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: `${T.main}0D`, border: `1px solid ${T.main}33`, borderRadius: 10 }}>
                  <span style={{ ...labelSt, marginBottom: 6 }}>Répéter les semaines suivantes</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[0, 4, 8, 12, 52].map(n => (
                      <button key={n} type="button" onClick={() => setRepeter(n)}
                        style={{
                          padding: '5px 12px', borderRadius: 100, cursor: 'pointer',
                          fontFamily: '"DM Sans", sans-serif', fontSize: '0.75rem', fontWeight: 800,
                          background: repeter === n ? T.main : '#fff',
                          color: repeter === n ? '#fff' : T.deep,
                          border: `1.5px solid ${repeter === n ? T.main : T.pale}`,
                        }}>
                        {n === 0 ? 'Cette séance' : n === 52 ? 'Tout le contrat' : `+ ${n}`}
                      </button>
                    ))}
                  </div>
                  {/* ⚠️ ON ANNONCE CE QUI VA VRAIMENT SE POSER, pas ce qui a été
                      demandé. Les trois bornes — fin du contrat, solde restant,
                      semaines déjà prises — rabotent la série en silence, et une
                      commerçante qui clique « + 52 » sur un contrat qui finit en
                      juin doit lire le vrai nombre AVANT d'enregistrer. */}
                  <p style={{ fontSize: '0.75rem', color: T.deep, fontWeight: 700, margin: '8px 0 0', lineHeight: 1.5 }}>
                    {repeter === 0
                      ? 'Une seule séance sera posée.'
                      : `${datesRepetees.length + 1} séances au total, jusqu’au ${formatDateCourte(datesRepetees[datesRepetees.length - 1] || dateChoisie)}.`}
                  </p>
                  {repeter > 0 && datesRepetees.length + 1 < repeter + 1 && (
                    <p style={{ fontSize: '0.72rem', color: T.muted, margin: '4px 0 0', lineHeight: 1.5 }}>
                      Moins que demandé : le contrat s’arrête, le solde ne suffit plus, ou ces semaines ont déjà leur séance.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Identite client : 2 colonnes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelSt}>Prénom *</label>
              <input type="text" value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Marie" style={inputSt} autoComplete="off"/>
            </div>
            <div>
              <label style={labelSt}>Nom *</label>
              <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Dupont" style={inputSt} autoComplete="off"/>
            </div>
          </div>

          {/* Tel + email */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelSt}>Téléphone *</label>
            <input type="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="0472 ..." style={inputSt} autoComplete="off"/>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelSt}>Email (optionnel)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="marie.dupont@..." style={inputSt} autoComplete="off"/>
            {/* ⚠️ « OPTIONNEL » A LONGTEMPS MENTI. La colonne était en NOT NULL
                en base : le commerçant lisait « optionnel », laissait le champ
                vide, et recevait une erreur qu'il ne pouvait pas comprendre.
                Relevé par Alex le 15/08, corrigé par
                MIGRATION_RDV_EMAIL_OPTIONNEL.sql.
                Le mot tient donc enfin, et l'écran dit ce qu'on perd sans lui
                plutôt que de promettre vaguement quelque chose en plus. */}
            <p style={{ fontSize: '0.68rem', color: T.muted, marginTop: 3, lineHeight: 1.45 }}>
              {email.trim()
                ? 'Ton client recevra sa confirmation, son rappel de la veille et son fichier calendrier.'
                : `Sans email, pas de confirmation ni de rappel : ${mots.laReservationDe} ne vit que dans ton agenda. C’est parfait pour quelqu’un qui te réserve par téléphone.`}
            </p>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Notes (optionnel)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Demande particulière, allergie, etc." rows={2}
              style={{ ...inputSt, resize: 'vertical', minHeight: 56 }}/>
          </div>

          {/* Erreur */}
          {error && (
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: 12 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.4, margin: 0 }}>{error}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: 8, padding: '0.75rem 1.125rem 1.125rem', borderTop: `1px solid ${T.pale}`, background: '#FAFAFA' }}>
          <button onClick={onClose} disabled={submitting}
            style={{ flex: 1, padding: '0.75rem', background: '#fff', border: `1.5px solid ${T.pale}`, borderRadius: 100, color: T.muted, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif' }}>
            Annuler
          </button>
          <button onClick={valider} disabled={!formValide || submitting}
            style={{
              flex: 2, padding: '0.75rem', border: 'none', borderRadius: 100,
              background: (!formValide || submitting) ? '#D1D5DB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`,
              color: '#fff', fontWeight: 800, cursor: (!formValide || submitting) ? 'default' : 'pointer',
              fontSize: '0.95rem', fontFamily: '"DM Sans", sans-serif',
              boxShadow: (!formValide || submitting) ? 'none' : `0 4px 16px ${T.main}55`,
            }}>
            {/* ⚠️ LE BOUTON DIT LE GESTE : quand aucune table n'est libre, il ne
                dit plus « Confirmer » comme si de rien n'était. */}
            {submitting ? 'Enregistrement…' : choixTable?.forcer ? 'Poser quand même ✓' : `${mots.manuelConfirmer} ✓`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
