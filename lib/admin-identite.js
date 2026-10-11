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

// 🔴 UNE LISTE COURTE, PAS UNE PORTE OUVERTE (11/10). Alex, puis Carole, qui
// l'aide à encoder les fiches commerçants : un compte À SON NOM, avec sa
// propre double authentification (le partage du compte d'Alex se coupait à
// chaque déconnexion, qui ferme toutes les sessions). ⚠️ LA MÊME LISTE EN BASE
// (`is_yoppaa_admin()`, MIGRATION_ADMIN_SECOND) : ajouter une adresse ici
// sans la migration ouvrirait les écrans sans les données, et l'inverse
// ouvrirait les données sans les écrans. Le banc compare les deux.
export const ADMIN_EMAILS = Object.freeze(['verstappenalexandre@gmail.com', 'carole.mackowiak@gmail.com'])

// L'administrateur principal (Alex) : les bancs et les messages qui le nomment.
export const ADMIN_EMAIL = ADMIN_EMAILS[0]

export function estAdresseAdmin(email) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase())
}
