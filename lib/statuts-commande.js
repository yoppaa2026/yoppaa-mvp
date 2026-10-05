// LE NOM DE CHAQUE STATUT DE COMMANDE, UNE SEULE FOIS (29/09).
//
// Ils vivaient dans `app/dashboard/page.js`, avec les couleurs et les gestes du
// tableau de bord. Le Poste équipe les affiche aussi : les recopier aurait
// donné deux écrans qui appellent la même commande de deux noms différents,
// au premier changement de libellé. Le tableau de bord garde ses couleurs et
// ses gestes, et lit ses libellés ICI.
//
// ⚠️ LES VALEURS SONT CELLES DE LA CONTRAINTE EN BASE
// (MIGRATION_COMMANDES_STATUT_CHECK.sql). `paiement_en_attente` n'a pas de
// libellé : une commande pas encore payée ne s'affiche nulle part.

export const LIBELLES_STATUT_COMMANDE = {
  en_attente: 'Nouvelle',
  en_preparation: 'En prépa',
  pret: 'Prête',
  recupere: 'Récupérée',
  non_retire: 'Non retiré',
  annulee_client_refund: 'Annulée par client',
  annulee_commercant: 'Annulée par le commerce',
  annulee_paiement_ko: 'Paiement échoué',
}

// Ce qui reste à faire, dans l'ordre du comptoir.
export const STATUTS_COMMANDE_EN_COURS = ['en_attente', 'en_preparation', 'pret']

// 🔴 LES TROIS FAÇONS DE NE PAS AVOIR EU LIEU, en UN endroit (I5, 05/10).
// `annulee_commercant` est né le 05/10 : chaque liste recopiée à la main
// l'aurait oublié, et une commande annulée par le commerce aurait continué de
// peser sur le stock, les compteurs ou l'historique. On lit CETTE liste.
export const STATUTS_COMMANDE_ANNULEE = ['annulee_client_refund', 'annulee_commercant', 'annulee_paiement_ko']
export const estCommandeAnnulee = (commande) => STATUTS_COMMANDE_ANNULEE.includes(commande?.statut)

// Pour les filtres PostgREST `.not('statut', 'in', …)` : les statuts qui ne
// consomment rien (ni stock, ni place, ni préparation).
export const FILTRE_STATUTS_INACTIFS = `(${['non_retire', ...STATUTS_COMMANDE_ANNULEE].join(',')})`

// Et ceux d'une commande TERMINÉE (plus rien à faire dessus) : pour « ce
// créneau porte-t-il encore des commandes ? ». ⚠️ La configuration filtrait
// jusqu'au 05/10 des statuts INVENTÉS (`annulee_client`) : une commande
// annulée comptait comme active et bloquait la suppression d'un créneau.
export const FILTRE_STATUTS_TERMINES = `(${['recupere', 'non_retire', ...STATUTS_COMMANDE_ANNULEE].join(',')})`

// Le geste suivant d'une commande, et son bouton. Mêmes pas et mêmes mots que
// le tableau de bord (`STATUTS` dans app/dashboard/page.js, le banc vérifie
// qu'ils ne divergent pas).
export const STATUT_SUIVANT = { en_attente: 'en_preparation', en_preparation: 'pret', pret: 'recupere' }
export const LIBELLE_GESTE_SUIVANT = { en_attente: 'Démarrer la prépa', en_preparation: 'Marquer prête', pret: 'Remettre au client' }

/**
 * Ce passage est-il permis ? Un seul pas en avant.
 *
 * ⚠️ UNE LIVRAISON OU UNE EXPÉDITION PRÊTE NE SE « REMET » PAS AU COMPTOIR :
 * elle part en livraison ou chez le transporteur, par leurs propres gestes
 * (comme sur le tableau de bord, où ce bouton est masqué pour elles).
 */
export function transitionPermise(commande = {}, vers) {
  if (!commande?.statut || STATUT_SUIVANT[commande.statut] !== vers) return false
  if (commande.statut === 'pret' && ['livraison', 'expedition'].includes(commande.mode_retrait)) return false
  return true
}

/**
 * Le client peut-il clôturer lui-même sa commande (« Retirer ma commande »,
 * « J'ai reçu ma commande ») ?
 *
 * 🔴 LE SERVEUR NE VÉRIFIAIT AUCUN STATUT (audit livraison, 05/10). Un appel
 * fabriqué passait en « récupérée » une commande encore en préparation, ou
 * déjà annulée et remboursée, et la fidélité suivait. Même règle que les deux
 * listes de l'écran client (app/commander/page.js) : un retrait PRÊT, ou une
 * livraison EN ROUTE. Une expédition se clôture chez le commerçant, jamais ici.
 */
export function receptionConfirmableParClient(commande = {}) {
  if (commande?.statut !== 'pret') return false
  if (commande.mode_retrait === 'expedition') return false
  if (commande.mode_retrait === 'livraison') return commande.statut_livraison === 'en_livraison'
  return true
}

/**
 * Le libellé d'une commande, livraison et expédition comprises : une commande
 * livrée n'est pas « récupérée », elle est « livrée ». Mêmes mots que la carte
 * du tableau de bord.
 */
export function libelleStatutCommande(commande = {}) {
  const { statut, mode_retrait, statut_livraison } = commande
  if (mode_retrait === 'livraison') {
    // Avant « Livrée » : une livraison retirée au comptoir est « récupérée »
    // elle aussi, mais personne ne l'a livrée (I5, 05/10).
    if (statut_livraison === 'retiree_magasin') return 'Retirée au magasin'
    if (statut_livraison === 'livree' || statut === 'recupere') return 'Livrée'
    if (statut_livraison === 'en_livraison') return 'En livraison'
  }
  if (mode_retrait === 'expedition') {
    if (statut === 'pret') return 'À expédier'
    if (statut === 'recupere') return 'Expédiée'
  }
  return LIBELLES_STATUT_COMMANDE[statut] || 'Statut inconnu'
}
