// DÉPLACER UNE RÉSERVATION, CÔTÉ SERVEUR (30/09, étape 3b du Poste équipe).
//
// Le patron déplace depuis son navigateur (`ModalDeplacerRdv`), qui écrit en
// base sous sa propre identité. Un membre de l'équipe n'a AUCUN accès direct à
// la base : sa fenêtre est la même, mais elle envoie ici au lieu d'écrire.
//
// 🔴 LE SERVEUR REFAIT CE QUE LA FENÊTRE A FAIT, DANS LE MÊME ORDRE ET AVEC LES
// MÊMES FONCTIONS. Ce que l'écran a montré n'est pas une preuve :
//   • le créneau accepte (`creneauAcceptable`, sur les réservations RELUES) ;
//   • le passé est refusé, à la pendule BELGE (`penduleBelge`) : l'heure du
//     serveur est celle de Greenwich ;
//   • la salle et la cuisine, relues ici (`lireSalleDuJour`), doivent répondre
//     CE QUE LA FENÊTRE A MONTRÉ (`vu`), sinon on n'écrit rien : c'est la règle
//     « ta salle a changé pendant la saisie » de la fenêtre du patron ;
//   • la place (`rangLibre` pour une table, `premierePlaceLibre` pour un cours),
//     le lieu regravé au nouveau jour (`champsLieuPour`), puis
//     `champsDuDeplacement`, la liste des colonnes de la fenêtre.
//
// ⚠️ LE PRIX, LA TVA ET LA DURÉE NE BOUGENT PAS : figés à la réservation, comme
// chez le patron. Un déplacement ne renégocie rien avec le client.
//
// ⚠️ L'ÉCRITURE EST FILTRÉE SUR L'ANCIEN CRÉNEAU ET SUR LE STATUT. Deux
// personnes qui déplacent la même réservation en même temps : la seconde
// n'écrit rien, et elle le sait, au lieu d'écraser la première en silence.

import { creneauAcceptable, creneauxDuJour, deplacementUtile, champsDuDeplacement, minutesDeLHeure, jourCle } from './deplacement-rdv'
import { capacitePrestation, estParCouverts, couvertsDe, rangLibre, premierePlaceLibre } from './cours-collectifs'
import { enModeInventaire, etatSalle, tableAPoser, etatCadence, lireSalleDuJour } from './inventaire-salle'
import { champsLieuPour } from './lieu-fige'
import { plageQuiAccueille } from './rdv-slots'
import { penduleBelge } from './heure-belge'
import { COLONNES_PRESTATION_SAISIE, COLONNES_CRENEAU_RDV_EQUIPE } from './equipe-poste'
import { placePrise } from './attente-rdv-server'

// Les statuts qui OCCUPENT une place, comme dans la fenêtre.
const STATUTS_OCCUPENT = ['confirme', 'honore']

// Ce que le serveur lit de la réservation. `client_email` ne sort JAMAIS d'ici :
// on rend seulement s'il existe, pour que la fenêtre sache si l'email part.
export const COLONNES_RDV_DEPLACEMENT = 'id, commercant_id, prestation_id, praticien_id, date_rdv, heure_debut, duree_minutes, capacite_creneau, couverts, statut, deleted_at, client_email'

// Le commerce : ses horaires, et ce que lit le lieu gravé.
export const COLONNES_COMMERCE_DEPLACEMENT = 'id, nom, adresse, latitude, longitude, siege_social_est_lieu_activite, horaires_detail'

// Les refus, dits comme la fenêtre du patron les dit.
export const REFUS_DEPLACEMENT = {
  introuvable: 'Cette réservation n’existe plus.',
  pas_a_venir: 'Seule une réservation à venir se déplace.',
  inutile: 'C’est déjà la date et l’heure de ce rendez-vous.',
  duree_inconnue: 'La durée de ce rendez-vous est inconnue : vois avec ton responsable.',
  salle_changee: 'Ta salle a changé pendant la saisie. Relis ce qui est proposé, puis confirme.',
  cours_complet: 'Ce cours est complet à cette heure-là. Choisis un autre créneau.',
  passe: 'Cette heure est déjà passée. Choisis une heure à venir.',
  place_prise: 'Une autre réservation vient d’être posée à la même heure pendant ta saisie. Réessaie.',
  deja_modifiee: 'Cette réservation vient d’être modifiée par quelqu’un d’autre. Recharge l’agenda.',
}

/**
 * La salle répond-elle ce que la fenêtre a montré ?
 *
 * ⚠️ MÊME COMPARAISON QUE LA FENÊTRE DU PATRON, au moment d'écrire : même
 * table, même « forcer », même raison, même état de la cuisine. Les valeurs
 * arrivent en JSON, où `undefined` disparaît : on compare des formes normalisées.
 */
export function salleCommeVue({ salleEnTables, choix, cadenceDepassee, vu }) {
  const table = vu?.table || null
  const tableOk = !salleEnTables || (!!choix && !!table
    && String(choix.format?.id ?? '') === String(table.format_id ?? '')
    && !!choix.forcer === !!table.forcer
    && (choix.raison ?? null) === (table.raison ?? null))
  return tableOk && (cadenceDepassee === true) === (vu?.cadence_depassee === true)
}

/**
 * Déplace une réservation.
 *
 * @param db            client Supabase (service_role)
 * @param commercantId  le commerce, déjà vérifié par la garde de l'appelant
 * @param rdvId         la réservation
 * @param date          'AAAA-MM-JJ'
 * @param heure         'HH:MM'
 * @param vu            ce que la fenêtre a montré de la salle :
 *                      { table: { format_id, forcer, raison } | null, cadence_depassee }
 * @param instant       l'instant du geste (les bancs le fixent)
 *
 * Rend { ok: true, maj, ancienne_date, ancienne_heure, client_a_email }
 * ou { ok: false, code, message }.
 */
export async function deplacerReservationRdv(db, { commercantId, rdvId, date, heure, vu = null, instant = new Date() } = {}) {
  const refus = (code, message = REFUS_DEPLACEMENT[code]) => ({ ok: false, code, message })

  const { data: rdv, error: errRdv } = await db
    .from('rdv_reservations').select(COLONNES_RDV_DEPLACEMENT)
    .eq('id', rdvId).maybeSingle()
  if (errRdv) throw new Error(`lecture de la réservation : ${errRdv.message}`)
  if (!rdv || rdv.deleted_at || String(rdv.commercant_id) !== String(commercantId)) return refus('introuvable')
  // ⚠️ LE PATRON NE DÉPLACE QU'UNE RÉSERVATION CONFIRMÉE : son bouton n'existe
  // que sur celles-là. Une réservation honorée ou annulée ne se rouvre pas ici.
  if (rdv.statut !== 'confirme') return refus('pas_a_venir')
  if (!deplacementUtile(rdv, { date, heure })) return refus('inutile')

  const [commerce, prestations, creneaux, rdvsDuJour, fermetures] = await Promise.all([
    db.from('commercants').select(COLONNES_COMMERCE_DEPLACEMENT).eq('id', commercantId).maybeSingle(),
    // ⚠️ LA LISTE QUE LA FENÊTRE DU POSTE A REÇUE, colonnes comprises : la
    // table, la salle et le cours se décident sur le même catalogue des deux côtés.
    db.from('rdv_prestations').select(COLONNES_PRESTATION_SAISIE)
      .eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null),
    db.from('rdv_creneaux').select(COLONNES_CRENEAU_RDV_EQUIPE)
      .eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null),
    // ⚠️ `praticien_id` (Annul-I6, 04/10) : sans lui, le rendez-vous d'une
    // collègue à la même heure passait pour un conflit.
    db.from('rdv_reservations').select('id, date_rdv, statut, prestation_id, praticien_id, heure_debut, heure_fin')
      .eq('commercant_id', commercantId).eq('date_rdv', date).is('deleted_at', null),
    // 🔴 LES FERMETURES (Annul-I6, 04/10) : le déplacement ne les lisait pas.
    // Séance comprise : sans `prestation_id, heure_debut`, un cours annulé se
    // lirait comme une journée entière fermée. Les dates se jugent dans la
    // règle (`fermetureQuiBloque`), pas ici : un seul endroit les compare.
    db.from('rdv_fermetures').select('date_debut, date_fin, praticien_id, prestation_id, heure_debut')
      .eq('commercant_id', commercantId).is('deleted_at', null),
  ])
  for (const [quoi, r] of [['commerce', commerce], ['prestations', prestations], ['créneaux', creneaux], ['réservations', rdvsDuJour], ['fermetures', fermetures]]) {
    if (r.error) throw new Error(`lecture des ${quoi} : ${r.error.message}`)
  }
  if (!commerce.data) return refus('introuvable')
  const formats = prestations.data || []

  // ─── CE QUE LA FENÊTRE CALCULE, LIGNE POUR LIGNE ──────────────────────────
  const presta = formats.find(p => String(p.id) === String(rdv.prestation_id)) || null
  const dureeMinutes = Number(rdv.duree_minutes) || Number(presta?.duree_minutes) || 0
  if (!(dureeMinutes > 0)) return refus('duree_inconnue')
  const capacite = presta ? capacitePrestation(presta) : Math.max(1, Number(rdv.capacite_creneau) || 1)
  const estTable = presta ? estParCouverts(presta) : false
  const estCours = !estTable && capacite > 1
  const salleEnTables = estTable && enModeInventaire(formats)
  const couvertsRdv = couvertsDe(rdv)
  const jour = jourCle(new Date(`${date}T12:00:00`))

  const verdict = creneauAcceptable({
    dateStr: date, heureDebut: heure, dureeMinutes,
    horaireJour: commerce.data.horaires_detail?.[jour] || null,
    creneauxJour: creneauxDuJour(creneaux.data || [], { dateStr: date, jour }),
    rdvsExistants: rdvsDuJour.data || [],
    capacite, prestationId: rdv.prestation_id ?? null, exclureId: rdv.id,
    prestations: formats,
    // 🔴 LA PENDULE BELGE, PAS CELLE DU SERVEUR : voir `penduleBelge`.
    maintenant: penduleBelge(instant),
    // 🔴 LA PRATICIENNE ET LES FERMETURES (Annul-I6, 04/10).
    praticienId: rdv.praticien_id ?? null,
    fermetures: fermetures.data || [],
  })
  if (!verdict.ok) return { ok: false, code: verdict.raison || 'creneau', message: verdict.message }

  // ─── LA SALLE ET LA CUISINE, RELUES AU MOMENT D'ÉCRIRE ────────────────────
  let tableFinale = presta
  if (estTable) {
    const frais = await lireSalleDuJour(db, { commercantId, dateStr: date })
    if (frais.error) throw new Error(`lecture de la salle : ${frais.error.message}`)
    const debutMin = minutesDeLHeure(heure)
    let choix = null
    if (salleEnTables) {
      const etat = etatSalle({
        formats, couverts: couvertsRdv, reservations: frais.reservations,
        debutMin, finMin: debutMin + dureeMinutes, exclureId: rdv.id,
      })
      choix = tableAPoser(etat, { prefere: rdv.prestation_id, basculer: true })
    }
    const cadence = etatCadence({ plafond: frais.plafond, couverts: couvertsRdv, reservations: frais.reservations, debutMin, exclureId: rdv.id })
    if (!salleCommeVue({ salleEnTables, choix, cadenceDepassee: cadence?.depasse === true, vu })) return refus('salle_changee')
    if (choix) tableFinale = choix.format || presta
  }

  // ─── LA PLACE, LUE EN BASE EN S'EXCLUANT SOI-MÊME ─────────────────────────
  let placeNo = 1
  if (estTable || estCours) {
    let requete = db.from('rdv_reservations').select('id, place_no')
      .eq('commercant_id', commercantId).eq('date_rdv', date).eq('heure_debut', heure)
      .in('statut', STATUTS_OCCUPENT).is('deleted_at', null)
    // ⚠️ UNE TABLE CHERCHE SON RANG PARMI TOUTES LES RÉSERVATIONS DE L'HEURE,
    // tous formats confondus ; un cours, parmi les siennes.
    if (estCours) requete = requete.eq('prestation_id', rdv.prestation_id)
    const { data: memeHeure, error: errPlaces } = await requete
    if (errPlaces) throw new Error(`lecture des places : ${errPlaces.message}`)
    const prises = (memeHeure || []).filter(r => String(r.id) !== String(rdv.id)).map(r => r.place_no)
    if (estTable) placeNo = rangLibre(prises)
    else {
      const libre = premierePlaceLibre({ capacite }, prises)
      if (libre === null) return refus('cours_complet', `Ce cours est complet à cette heure-là (${capacite} personnes). Choisis un autre créneau.`)
      placeNo = libre
    }
  }

  // ─── LE LIEU SE REGRAVE AU NOUVEAU JOUR ────────────────────────────────────
  // 🔴 LE LIEU DE LA PLAGE QUI ACCUEILLE L'HEURE, pas celui que l'heure seule
  // désigne (03/10) : voir `plageQuiAccueille`. Sans lui, un cours donné dans
  // l'autre salle partait avec l'adresse de la salle principale.
  const plage = plageQuiAccueille(creneauxDuJour(creneaux.data || [], { dateStr: date, jour }), {
    prestationId: rdv.prestation_id ?? null,
    debutMin: minutesDeLHeure(heure), finMin: minutesDeLHeure(heure) + dureeMinutes,
    praticienId: rdv.praticien_id || null,
  })
  const lieu = await champsLieuPour(db, commerce.data, { jour: date, heure, lieuId: plage?.lieu_id || null })

  const tableChange = salleEnTables && tableFinale && String(tableFinale.id) !== String(rdv.prestation_id)
  const maj = champsDuDeplacement({
    date, heure, dureeMinutes, placeNo,
    capacite: tableChange ? capacitePrestation(tableFinale) : capacite,
    champsLieu: lieu,
    prestationId: tableChange ? tableFinale.id : null,
  })

  const { data: ecrites, error: errMaj } = await db
    .from('rdv_reservations').update(maj)
    .eq('id', rdv.id).eq('commercant_id', commercantId)
    .eq('statut', 'confirme').is('deleted_at', null)
    .eq('date_rdv', rdv.date_rdv).eq('heure_debut', rdv.heure_debut)
    .select('id')
  if (errMaj) {
    // ⚠️ LA BASE REFUSE AUSSI LE PASSÉ, à l'heure de Bruxelles.
    if (String(errMaj.message || '').includes('RDV_DEPLACE_DANS_LE_PASSE')) return refus('passe')
    if (errMaj.code === '23505') return refus('place_prise')
    throw new Error(`écriture du déplacement : ${errMaj.message}`)
  }
  if (!ecrites || ecrites.length === 0) return refus('deja_modifiee')

  // 🔴 LA LISTE D'ATTENTE DE LA NOUVELLE SÉANCE L'APPREND (LA-02, 04/10), comme
  // après une réservation : sinon les notifications d'une place libérée
  // partent vers une séance de nouveau complète. AU MIEUX : le déplacement est fait.
  const suite = await placePrise(db, {
    prestationId: maj.prestation_id ?? rdv.prestation_id,
    dateRdv: date,
    heureDebut: String(heure || '').slice(0, 5),
    clientId: null,
    clientEmail: rdv.client_email || null,
  })
  if (!suite?.ok) console.error('[rdv/deplacement] file d’attente non mise à jour', suite?.error)

  return {
    ok: true, maj,
    ancienne_date: rdv.date_rdv, ancienne_heure: rdv.heure_debut,
    client_a_email: !!rdv.client_email,
  }
}
