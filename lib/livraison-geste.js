// LIVRER UNE COMMANDE : LA RÈGLE (équipe, étape 4, 01/10).
//
// Deux gestes, dans l'ordre : « Partir en livraison », puis « Livrée ». Le
// patron les fait depuis son tableau de bord, le livreur depuis le Poste. La
// règle vit ICI, une seule fois, et le serveur l'applique pour les deux
// (`lib/livraison-serveur.js`) : c'était le dernier geste d'argent écrit
// depuis le navigateur du commerçant.
//
// ⚠️ « LIVRÉE » TERMINE LA COMMANDE : `statut` passe à « recupere », comme un
// retrait remis, pour que le chiffre d'affaires, la fidélité et l'avis la
// comptent. Et si le client paie à la porte, on écrit COMMENT (terminal,
// espèces, ou rien encaissé) : le livreur encaisse loin du comptoir, souvent
// en liquide, et c'est là qu'une trace manque le plus (Alex, 22/08).
//
// Fichier PUR : importable par l'écran comme par le serveur.

import { resteAEncaisserCommande } from './rdv-paiement'
import { champsEncaissement } from './encaissement'

// ⚠️ « ABSENT » (Alex, 01/10) : le livreur est à la porte, personne n'ouvre.
// La commande REVIENT « prête », à relivrer ou à faire retirer, et le client
// est prévenu d'appeler le commerce. Aucun argent ne bouge : une commande
// payée en ligne, le commerçant décide lui-même d'un éventuel remboursement.
export const GESTES_LIVRAISON = ['en_livraison', 'livree', 'absent']

/**
 * Ce geste est-il permis sur cette commande, maintenant ?
 * Une livraison PRÊTE seulement. « Partir » une seule fois ; « Livrée » depuis
 * la route ou directement (un livreur qui a oublié de toucher « Partir » ne
 * doit pas rester bloqué devant la porte), mais jamais deux fois.
 */
export function gesteLivraisonPermis(commande, vers) {
  if (!commande || commande.mode_retrait !== 'livraison' || commande.statut !== 'pret') return false
  const actuel = commande.statut_livraison || null
  if (vers === 'en_livraison') return actuel === null
  if (vers === 'livree') return actuel === null || actuel === 'en_livraison'
  // Absent : seulement EN ROUTE. Avant le départ, personne n'a sonné.
  if (vers === 'absent') return actuel === 'en_livraison'
  return false
}

/**
 * Ce que le geste écrit. Le montant vient de la commande relue en base, jamais
 * d'un nombre envoyé par l'écran.
 *
 * @returns {{ champs: object|null, refus: string|null }}
 */
export function champsLivraison(commande, vers, { encaissement = null, maintenant = new Date() } = {}) {
  if (!gesteLivraisonPermis(commande, vers)) {
    return { champs: null, refus: 'Cette livraison ne peut pas passer à cette étape maintenant.' }
  }
  if (vers === 'en_livraison') return { champs: { statut_livraison: 'en_livraison' }, refus: null }
  // La commande redevient « prête, pas encore partie » : elle repart plus tard.
  if (vers === 'absent') return { champs: { statut_livraison: null }, refus: null }

  let argent = null
  if (!commande.encaisse_mode) {
    const r = champsEncaissement({ choix: encaissement, reste: resteAEncaisserCommande(commande), maintenant })
    if (r.refus) return { champs: null, refus: r.refus }
    argent = r.champs
  }
  return { champs: { statut_livraison: 'livree', statut: 'recupere', ...(argent || {}) }, refus: null }
}
