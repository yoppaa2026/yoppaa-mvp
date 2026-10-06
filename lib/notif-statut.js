// UNE NOTIFICATION DE STATUT NE PART QUE SI LE STATUT EST VRAI (audit
// livraison, mineur ; 06/10).
//
// 🔴 POURQUOI. Les routes `commande/push-statut`, `emails/commande-prete` et
// `livraison/statut` annonçaient le statut REÇU de l'écran, sans relire la
// commande. Un onglet resté ouvert, un double clic ou un appel direct
// envoyaient « 🎉 Ta commande est prête à retirer » ou « 🛵 Ta commande
// arrive » pour une commande ANNULÉE et remboursée : le client se déplaçait
// pour rien. On relit la commande, et on n'annonce que ce qui est vrai.
//
// Fichier PUR : les trois routes l'appliquent, le banc l'exécute.

/**
 * Le statut annoncé correspond-il à l'état RÉEL de la commande ?
 * @param {{ statut, statut_livraison, mode_retrait }} cmd la commande relue en base
 * @param {string} annonce 'en_preparation' | 'pret' | 'expediee' | 'en_livraison' | 'livree'
 */
export function annonceConforme(cmd, annonce) {
  if (!cmd) return false
  switch (annonce) {
    case 'en_preparation': return cmd.statut === 'en_preparation'
    case 'pret': return cmd.statut === 'pret'
    // Un colis expédié : `commande/expedier` le passe en `recupere`.
    case 'expediee': return cmd.mode_retrait === 'expedition' && cmd.statut === 'recupere'
    // La tournée : la commande est prête ET partie.
    case 'en_livraison': return cmd.mode_retrait === 'livraison' && cmd.statut === 'pret' && cmd.statut_livraison === 'en_livraison'
    // Livrée : `livraison/livrer` la passe en `recupere`.
    case 'livree': return cmd.mode_retrait === 'livraison' && cmd.statut === 'recupere' && cmd.statut_livraison === 'livree'
    default: return false
  }
}
