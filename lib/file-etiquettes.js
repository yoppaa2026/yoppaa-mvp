// LA FILE DES ÉTIQUETTES ET LA STATION DU COMPTOIR (« Yoppaa Comptoir », 11/10).
//
// Décisions d'Alex (tableau, 11/10) :
//   - la tablette du kit appartient au commerce PAR LA CONNEXION : le
//     commerçant connecté coche « cette tablette est l'imprimante du comptoir » ;
//   - TOUTES les étiquettes passent PAR LA FILE, d'où qu'elles viennent
//     (tablette, téléphone de l'équipe, PC) : un seul chemin, une trace, et
//     jamais deux fois la même.
//
// La file vit dans `etiquettes_impression` (MIGRATION_FILE_ETIQUETTES),
// lisible par le SERVEUR seulement : les routes `/api/impression/*`.
//
// ⚠️ MODULE PUR : il décide et met en forme, il ne lit pas la base.

import { etiquetteConcernee, contenuEtiquette, etiquettesPourSacs, ETIQUETTE_ESSAI, SACS_MAX } from './etiquette-commande.js'

// La station interroge la file toutes les 3 secondes. Sans nouvelles depuis
// 20 secondes, elle est dite « hors ligne » au tableau de bord.
export const INTERVALLE_FILE_MS = 3000
export const STATION_EN_LIGNE_MS = 20 * 1000

// ⚠️ UNE ÉTIQUETTE PRISE ET JAMAIS RENDUE (l'app fermée en pleine impression)
// redevient « en attente » après 90 secondes : elle ne reste pas coincée, et
// une impression normale (quelques secondes) ne sera jamais reprise deux fois.
export const REPRISE_EN_COURS_MS = 90 * 1000

// Au plus 5 étiquettes par passage : une réouverture après une coupure ne
// déverse pas cinquante étiquettes d'un coup sans que personne ne regarde.
export const PAR_PASSAGE = 5

// Ce que l'étiquette lit d'une commande : la même lecture que le tableau de
// bord (SELECT_COMMANDES de app/dashboard/page.js), sans le rendez-vous lié
// dont l'étiquette n'a pas besoin.
export const SELECT_COMMANDE_ETIQUETTE = '*, creneau:creneaux(*), creneau_livraison:livraison_creneaux(*), commande_articles(*, article:articles(*))'

/** La station a-t-elle donné des nouvelles récemment ? */
export function stationEnLigne(dernierContact, maintenant = new Date()) {
  if (!dernierContact) return false
  const t = new Date(dernierContact).getTime()
  if (!Number.isFinite(t)) return false
  return maintenant.getTime() - t < STATION_EN_LIGNE_MS
}

/**
 * Faut-il déposer une étiquette au changement de statut ?
 * 🔴 AU DÉMARRAGE DE LA PRÉPA SEULEMENT, depuis « en attente » : la même règle
 * que l'impression du navigateur (décision d'Alex, 01/10). Une seule fois.
 * Retrait et livraison seulement (`etiquetteConcernee`), et seulement si le
 * commerce a une station : sans elle, personne ne viderait la file.
 */
export function etiquetteADeposer({ commande, deStatut, versStatut, stationExiste }) {
  return !!stationExiste && deStatut === 'en_attente' && versStatut === 'en_preparation' && etiquetteConcernee(commande)
}

/** Le nombre de sacs demandé, borné à ce que la table accepte (1 à 20). */
export function sacsBornes(sacs) {
  const n = Math.floor(Number(sacs))
  return Number.isFinite(n) ? Math.min(SACS_MAX, Math.max(1, n)) : 1
}

/**
 * Ce que la station reçoit pour UNE ligne de la file : les contenus à
 * imprimer, un par sac. Le contenu est calculé AU MOMENT D'IMPRIMER, depuis
 * la commande relue : une commande modifiée entre-temps sort à jour.
 * `null` si la commande a disparu (la ligne passe alors en échec).
 */
export function contenusAImprimer(ligne, { commande = null, categorie = null, commerce = null } = {}) {
  if (!ligne) return null
  const sacs = sacsBornes(ligne.sacs)
  if (ligne.origine === 'essai') return etiquettesPourSacs({ ...ETIQUETTE_ESSAI, commerce: commerce || null }, sacs)
  if (!commande) return null
  return etiquettesPourSacs(contenuEtiquette(commande, { categorie, commerce }), sacs)
}

// Les raisons d'échec que la station rend, et ce que le commerçant lit.
export const RAISONS_ECHEC = {
  papier: 'Plus de papier dans l’imprimante.',
  couvercle: 'Le couvercle de l’imprimante est ouvert.',
  injoignable: 'L’imprimante ne répond pas (allumée ? même Wi-Fi ?).',
  rouleau: 'Le rouleau ne correspond pas (62 mm continu attendu).',
  commande_introuvable: 'La commande n’existe plus.',
  autre: 'L’impression a échoué.',
}

/** La phrase d'une raison rendue par la station ; une raison inconnue devient « autre ». */
export function phraseEchec(raison) {
  return RAISONS_ECHEC[raison] || RAISONS_ECHEC.autre
}

/** Une raison acceptée en base (texte court, connu) ; sinon « autre ». */
export function raisonValide(raison) {
  return Object.prototype.hasOwnProperty.call(RAISONS_ECHEC, raison) ? raison : 'autre'
}
