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
  annulee_paiement_ko: 'Paiement échoué',
}

// Ce qui reste à faire, dans l'ordre du comptoir.
export const STATUTS_COMMANDE_EN_COURS = ['en_attente', 'en_preparation', 'pret']

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
 * Le libellé d'une commande, livraison et expédition comprises : une commande
 * livrée n'est pas « récupérée », elle est « livrée ». Mêmes mots que la carte
 * du tableau de bord.
 */
export function libelleStatutCommande(commande = {}) {
  const { statut, mode_retrait, statut_livraison } = commande
  if (mode_retrait === 'livraison') {
    if (statut_livraison === 'livree' || statut === 'recupere') return 'Livrée'
    if (statut_livraison === 'en_livraison') return 'En livraison'
  }
  if (mode_retrait === 'expedition') {
    if (statut === 'pret') return 'À expédier'
    if (statut === 'recupere') return 'Expédiée'
  }
  return LIBELLES_STATUT_COMMANDE[statut] || 'Statut inconnu'
}
