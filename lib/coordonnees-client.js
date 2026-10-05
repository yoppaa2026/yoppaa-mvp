// LES COORDONNÉES QU'UN CLIENT TAPE, VÉRIFIÉES UNE FOIS (audit livraison I9,
// 05/10).
//
// 🔴 AUCUN TUNNEL NE LES VÉRIFIAIT. Le serveur contrôlait leur PRÉSENCE, pas
// leur forme : n'importe quelle chaîne passait, et finissait telle quelle dans
// l'email « nouvelle commande » du commerçant. Les gabarits l'échappent
// désormais (lib/resend.js) ; ici, on refuse ce qui n'est ni un email ni un
// numéro, avec une phrase qui dit quoi corriger.
//
// ⚠️ LE TÉLÉPHONE N'EST PAS FORCÉMENT BELGE. `normaliserTelephone` (fidélité)
// n'accepte que +32 : c'est la clé d'une carte, pas une règle de commande. Un
// touriste français commande aussi. On demande donc un NUMÉRO : 8 à 15
// chiffres, un « + » devant au plus, les séparateurs usuels tolérés.
//
// Fichier PUR : importable par l'écran comme par le serveur.

const RE_EMAIL = /^[^\s@<>"'(),;:\\]+@[^\s@<>"'(),;:\\]+\.[^\s@<>"'(),;:\\]{2,}$/

export function emailValide(valeur) {
  const s = String(valeur ?? '').trim()
  return s.length > 0 && s.length <= 254 && RE_EMAIL.test(s)
}

export function telephoneValide(valeur) {
  const s = String(valeur ?? '').replace(/[\s./\-()]/g, '')
  return /^\+?\d{8,15}$/.test(s)
}

/**
 * @returns {string|null} la phrase à montrer au client, ou null si tout va bien
 */
export function refusCoordonnees({ email, telephone } = {}) {
  if (!emailValide(email)) return 'Ton adresse email ne semble pas valide. Vérifie-la, par exemple nom@exemple.be.'
  if (!telephoneValide(telephone)) return 'Ton numéro de téléphone ne semble pas valide. Indique-le avec ses chiffres, par exemple 0470 12 34 56.'
  return null
}
