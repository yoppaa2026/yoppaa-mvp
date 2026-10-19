// QUAND LA BARRE YOPPER SE MONTRE SUR UNE FICHE (19/10).
//
// ✅ ALEX, 19/10 (tableau) : « Sur la fiche, pas dans le tunnel ». La barre
// Accueil · Suivi · Tribu · Profil se montre quand on PARCOURT une fiche,
// jamais du créneau ou du panier jusqu'au paiement (elle prendrait la place
// du bouton « Payer » et offrirait une sortie au pire moment), et revient sur
// l'écran de confirmation, pour aller droit dans « Suivi ».
//
// Fichier PUR : les deux fiches et le banc lisent la même règle.

// La hauteur de la barre hors zone sûre de l'iPhone (icône, libellé, marges) :
// ce qui flotte en bas d'une fiche se pose au-dessus.
export const HAUTEUR_BARRE_YOPPER = 60

/**
 * @param type      'commande' (carte, boutique) ou 'rdv'
 * @param etape     l'étape de la fiche
 * @param panierVide rien au panier (un panier rempli, c'est le tunnel qui commence)
 * @param confirme  l'écran de confirmation est affiché
 */
export function barreSurLaFiche({ type, etape, panierVide = true, confirme = false } = {}) {
  if (confirme) return true
  // Commande et boutique : la carte (2) sans panier ; la confirmation (4).
  if (type === 'commande') return etape === 4 || (etape === 2 && panierVide)
  // Rendez-vous : le choix de la prestation (1), sans produits au panier.
  if (type === 'rdv') return etape === 1 && panierVide
  return false
}
