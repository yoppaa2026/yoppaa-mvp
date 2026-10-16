// « TABLE POUR 2 DÈS 19:00 » : LE BADGE D'UN RESTAURANT DANS LA LISTE (15/10).
//
// ✅ ALEX, 15/10 (le Bistrologue publié) : « on le fait ce soir, bonne idée ».
// Sur la carte d'un restaurant qui prend des réservations, la liste dit la
// première heure où une table est RÉELLEMENT libre aujourd'hui.
//
// 🔴 UN BADGE QUI MENT EST PIRE QUE PAS DE BADGE. Le calcul est donc celui de
// la fiche de réservation, et rien d'autre : le même moteur (`genererSlots`),
// les mêmes plages ouvertes (`plagesOuvertes`), la même table de référence
// pour le groupe (`formatPourAffichage` en salle inventoriée), la même durée
// selon le nombre de personnes (`dureeSelonCouverts`), la même salle et le même
// plafond de cuisine. S'il ne reste rien aujourd'hui, on ne dit RIEN : pas de
// « complet » sur une carte de liste, qui ferait passer le client à côté.
//
// ⚠️ POUR 2 PERSONNES, ET ON LE DIT : une table pour deux libre ne promet pas
// une table pour six.
//
// ⚠️ MODULE PUR : il reçoit tout ce que la liste a chargé, il ne lit aucune base.

import { genererSlots, filtrerReservationsPourSlots } from './rdv-slots.js'
import { plagesOuvertes } from './fermetures-rdv.js'
import { fermeturesAgenda, horairesPourDate } from './horaires-du-jour.js'
import { estParCouverts, couvertsValides, dureeSelonCouverts, capacitePrestation } from './cours-collectifs.js'
import { enModeInventaire, formatPourAffichage, estJointure, plafondCadence } from './inventaire-salle.js'

export const COUVERTS_BADGE = 2

// La table qu'on regarde pour ce groupe : celle que la fiche proposerait.
export function tableDeReference(prestations = [], couverts = COUVERTS_BADGE) {
  const liste = (Array.isArray(prestations) ? prestations : []).filter(p => p && p.actif !== false)
  const tables = liste.filter(p => estParCouverts(p) && !estJointure(p))
  if (tables.length === 0) return null
  if (enModeInventaire(liste)) return formatPourAffichage(liste, couverts) || null
  return tables.find(p => couvertsValides(p, couverts) !== null) || null
}

/**
 * La première heure libre AUJOURD'HUI pour une table de `couverts` personnes,
 * ou `null` (pas de table, jour fermé, plus rien de libre).
 *
 * @param jour  la date du jour (un objet Date) ; `genererSlots` écarte déjà
 *              les heures passées quand c'est aujourd'hui
 * @returns { heure: 'HH:MM', couverts } | null
 */
//
// ⚠️ `exceptions` (16/10) : la liste unique « Fermetures et horaires
// exceptionnels ». Une fermeture ferme l'agenda (`fermeturesAgenda`), un
// horaire adapté borne les arrivées (`horairesPourDate`), comme à la fiche.
export function tableLibreDuJour({
  jour, dateStr, commercant = null, prestations = [], creneaux = [], liaisons = null,
  fermetures = [], exceptions = [], reservations = [], couverts = COUVERTS_BADGE,
} = {}) {
  if (!(jour instanceof Date) || Number.isNaN(jour.getTime()) || !dateStr) return null
  const ref = tableDeReference(prestations, couverts)
  if (!ref) return null
  // ⚠️ LE JOUR FERMÉ SE JUGE PAR `plagesOuvertes`, plus bas, comme à la fiche :
  // une fermeture de toute la maison y retire toutes les plages. Un second
  // contrôle ici ne changeait rien au résultat (vu par mutation le 15/10).
  const resas = filtrerReservationsPourSlots(reservations || [], null, [], {})
  const inventaire = enModeInventaire((prestations || []).filter(p => p && p.actif !== false))
  const plafond = plafondCadence(commercant)
  const slots = genererSlots({
    dateChoisie: jour,
    dureeMinutes: dureeSelonCouverts(ref, couverts),
    // ⚠️ LA FERMETURE DE LA MAISON PASSE PAR UN SEUL CHEMIN (16/10) : la grille
    // du jour (`horairesPourDate`, juste en dessous) la ferme. Ici, seulement
    // les absences et cours annulés de l'agenda, et JAMAIS ses anciennes
    // fermetures « tout le commerce » (recopiées dans la liste unique). Deux
    // chemins pour la même règle, et aucune mutation ne pouvait en mesurer un.
    creneaux: plagesOuvertes(creneaux || [], fermeturesAgenda(fermetures, []), dateStr),
    reservations: resas,
    horairesDetail: horairesPourDate(commercant?.horaires_detail, dateStr, exceptions),
    capacite: capacitePrestation(ref),
    prestationId: ref.id ?? null,
    liaisonsCreneaux: Array.isArray(liaisons) ? liaisons : null,
    parCouverts: true,
    couvertsDemandes: couverts,
    salle: inventaire ? { formats: prestations, reservations: resas } : null,
    cadence: plafond !== null ? { plafond, reservations: resas } : null,
  })
  const libre = (slots || []).find(s => s && !s.pris)
  return libre ? { heure: libre.heure, couverts } : null
}

// Ce que la carte écrit.
export function libelleTableLibre(t) {
  if (!t || !t.heure) return null
  return `Table pour ${t.couverts} dès ${t.heure}`
}
