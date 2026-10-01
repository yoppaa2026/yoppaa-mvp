// LA COULEUR D'UNE COMMANDE SELON SON STATUT, POUR TOUS LES ÉCRANS (01/10).
//
// Alex, en comparant le tableau de bord et le Poste : « il faut mettre les
// couleurs comme dans le DB en fonction du statut ». Le Poste affichait toutes
// les commandes en violet pâle : une commande en attente et une commande prête
// se ressemblaient, alors que le patron les distingue d'un coup d'œil.
//
// ⚠️ UNE SEULE PALETTE : le tableau de bord la lit aussi (`T.rouge`, `T.vert`…
// et `STATUTS` dans app/dashboard/page.js). Deux copies finiraient par donner
// deux couleurs à la même commande sur deux écrans voisins.

export const PALETTE_STATUT = {
  gris:   { border: '#9CA3AF', badge: '#6B7280', cardBg: '#F9FAFB' },
  rouge:  { border: '#DC2626', badge: '#DC2626', cardBg: '#FFF0F0' },
  orange: { border: '#EA580C', badge: '#EA580C', cardBg: '#FFF7ED' },
  vert:   { border: '#10B981', badge: '#10B981', cardBg: '#F0FDF4' },
  bleu:   { border: '#2563EB', badge: '#2563EB', cardBg: '#EFF6FF' },
}

// En attente rouge (à lancer), en préparation orange, prête verte, remise
// bleue, non retirée grise ; annulée rouge, paiement refusé gris.
export const COULEUR_PAR_STATUT = {
  en_attente: PALETTE_STATUT.rouge,
  en_preparation: PALETTE_STATUT.orange,
  pret: PALETTE_STATUT.vert,
  recupere: PALETTE_STATUT.bleu,
  non_retire: PALETTE_STATUT.gris,
  annulee_client_refund: PALETTE_STATUT.rouge,
  annulee_paiement_ko: PALETTE_STATUT.gris,
}

/**
 * La couleur d'une commande, livraison comprise : EN ROUTE et LIVRÉE sont
 * bleues, comme sur la carte du tableau de bord. Un statut inconnu prend la
 * couleur d'« en attente », comme la carte du tableau de bord.
 */
export function couleurStatutCommande(commande) {
  if (commande?.mode_retrait === 'livraison' && ['en_livraison', 'livree'].includes(commande.statut_livraison)) {
    return PALETTE_STATUT.bleu
  }
  return COULEUR_PAR_STATUT[commande?.statut] || COULEUR_PAR_STATUT.en_attente
}
