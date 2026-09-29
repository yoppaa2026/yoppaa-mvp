// QUI EST L'ADMINISTRATEUR YOPPAA : UNE ADRESSE, ÉCRITE ICI ET NULLE PART
// AILLEURS DANS LE CODE (29/09).
//
// 🔴 POURQUOI (relevé du 29/09, avant la double authentification). L'adresse
// était recopiée dans vingt-deux fichiers : chaque route d'administration,
// la fidélité, le kit, trois écrans. Exiger un second facteur demande qu'il
// n'existe PLUS AUCUN endroit qui se contente de comparer l'adresse : il
// suffirait d'un seul oubli pour contourner le code à six chiffres.
//
// ⚠️ CE FICHIER NE DONNE AUCUN POUVOIR. Il sert à RECONNAÎTRE l'adresse (pour
// afficher un écran, refuser d'effacer ce compte). Autoriser une action
// d'administration passe par `adminVerifie()` (lib/api-auth.js) côté serveur,
// et par `is_yoppaa_admin()` en base.
//
// Sans dépendance : importable depuis un écran comme depuis une route.

export const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export function estAdresseAdmin(email) {
  return String(email || '').trim().toLowerCase() === ADMIN_EMAIL
}
