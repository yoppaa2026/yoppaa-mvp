// QUI PREND DES RÉSERVATIONS, ET SOUS QUEL NOM.
//
// Deux métiers, un seul moteur. Un salon prend des RENDEZ-VOUS ; un restaurant
// réserve des TABLES. Derrière, c'est le même agenda, les mêmes plages, les
// mêmes acomptes, la même liste d'attente. Devant, ce ne sont pas les mêmes
// mots, et un restaurateur qui lit « prendre rendez-vous » sur sa fiche
// comprend tout de suite que l'outil n'a pas été pensé pour lui.
//
// 🔴 LA MATRICE AVAIT DÉJÀ TRANCHÉ, ET PERSONNE NE LA LISAIT. `lib/plans.js`
// porte `reservation_table: true` dans VENDRE depuis longtemps, listée dans
// `FEATURES_ALIMENTAIRE_ONLY` aux côtés de `commande`, `livraison` et
// `anti_gaspi`. Elle n'était lue nulle part : un drapeau écrit, jamais branché.
// La décision de modèle n'était pas à prendre, elle était à honorer.
//
// ⚠️ UN SEUL INTERRUPTEUR, `rdv_actif`, ET C'EST VOULU. La colonne existe déjà
// sur tout le parc. En créer une seconde pour la même chose donnerait deux
// vérités à tenir, et un jour l'une dirait oui pendant que l'autre dirait non.
// C'est la CATÉGORIE qui décide du vocabulaire, pas un second drapeau.

import { peut, isAlimentaire } from './plans'

// La fonction de forfait qui porte la réservation, selon le métier.
export function fonctionReservation(commercant) {
  return isAlimentaire(commercant) ? 'reservation_table' : 'rdv'
}

// Ce commerce a-t-il DROIT à la réservation ? (forfait + catégorie)
export function peutReserver(commercant, maintenant = new Date()) {
  return peut(commercant, fonctionReservation(commercant), maintenant)
}

// L'a-t-il ALLUMÉE ? C'est ce que la fiche publique doit regarder.
//
// ⚠️ LES DEUX CONDITIONS. Le droit sans l'interrupteur afficherait une
// réservation chez quelqu'un qui n'a jamais ouvert une seule plage ;
// l'interrupteur sans le droit la laisserait allumée après un changement de
// forfait, et le client réserverait dans le vide.
export function reservationActive(commercant, maintenant = new Date()) {
  return commercant?.rdv_actif === true && peutReserver(commercant, maintenant)
}

// Les mots de ce métier-là.
//
// ⚠️ UN SEUL ENDROIT, comme `libelleBon` pour les bons cadeaux. Un libellé
// recopié dans quinze écrans finit toujours par diverger dans trois d'entre
// eux, et ce sont ceux-là que le commerçant remarque.
const MOTS_TABLE = {
  action: 'Réserver une table',
  pastille: 'Réserver',
  nom: 'réservation',
  nomPluriel: 'réservations',
  onglet: 'Réservations',
  ongletCourt: 'Tables',
  laSienne: 'ta réservation',
  quandLaPrendre: 'Quand veux-tu venir ?',
  aucune: 'Aucune réservation',
}

const MOTS_RDV = {
  action: 'Prendre rendez-vous',
  pastille: 'Rendez-vous',
  nom: 'rendez-vous',
  nomPluriel: 'rendez-vous',
  onglet: 'Rendez-vous',
  ongletCourt: 'RDV',
  laSienne: 'ton rendez-vous',
  quandLaPrendre: 'Quand veux-tu venir ?',
  aucune: 'Aucun rendez-vous',
}

export function motsReservation(commercant) {
  return isAlimentaire(commercant) ? MOTS_TABLE : MOTS_RDV
}

// Raccourci pour les écrans qui n'ont besoin que d'un mot.
export function motReservation(commercant, cle) {
  const mots = motsReservation(commercant)
  return Object.prototype.hasOwnProperty.call(mots, cle) ? mots[cle] : ''
}

// 🔴 UN RESTAURANT N'A PAS DEUX FICHES, IL EN A UNE.
//
// La catégorie décidait jusqu'ici de QUELLE fiche le client voit : `/commander`
// pour un alimentaire, `/commander/rdv` pour une vitrine. Un restaurant a
// besoin des DEUX : sa carte à emporter ET sa réservation. Sa fiche reste donc
// celle des commandes, et la réservation s'y atteint par un bouton.
//
// ⚠️ Une vitrine, elle, ne change pas d'un pouce : sa fiche EST son agenda.
export function ficheDuCommerce(commercant) {
  if (!commercant?.slug) return '/commander'
  return isAlimentaire(commercant) || commercant.categorie === 'detail'
    ? `/commander/${commercant.slug}`
    : `/commander/rdv/${commercant.slug}`
}

export function pageReservation(commercant) {
  return commercant?.slug ? `/commander/rdv/${commercant.slug}` : '/commander'
}
