// À QUI APPARTIENT UNE FICHE CLIENT RETROUVÉE PAR SON EMAIL.
//
// 🔴 TROUVÉ LE 15/09, EN FERMANT L'INSERTION DE `clients` EN BASE. Quand un
// compte connecté n'a pas encore de fiche reliée, `lib/yopper-auth.js` la
// cherche par l'adresse, pour rejoindre la commande passée en invité. Il
// refusait bien de RATTACHER une fiche déjà reliée à un autre compte, mais il
// la RENDAIT quand même : son identifiant, le prénom, le nom et le téléphone de
// quelqu'un d'autre partaient avec l'identité du nouveau venu.
//
// ⚠️ LE CAS N'EST PAS THÉORIQUE. L'email est UNIQUE dans `clients`, et une
// fiche garde l'adresse sous laquelle elle est née. Celui qui change l'email
// de son compte laisse sa fiche à l'ancienne adresse ; la personne qui
// s'inscrit ensuite avec cette adresse-là retrouvait la fiche de l'autre, et
// avec elle ses rendez-vous, puisque les policies lisent `client_id`.
//
// ⚠️ PUR, SANS SUPABASE NI COOKIE : le banc l'exécute. La règle tient en une
// ligne, et c'est précisément pour ça qu'elle ne doit vivre qu'à un endroit.

/**
 * Une fiche trouvée par l'email peut-elle servir à ce compte ?
 * Oui si elle n'appartient encore à personne (fiche d'invité, à rattacher),
 * ou si elle lui appartient déjà. Jamais si elle est reliée à un AUTRE compte.
 *
 * @param {{ auth_user_id?: string|null }|null|undefined} fiche
 * @param {string|null|undefined} userId
 * @returns {boolean}
 */
export function ficheUtilisablePar(fiche, userId) {
  if (!fiche || !userId) return false
  return !fiche.auth_user_id || fiche.auth_user_id === userId
}
