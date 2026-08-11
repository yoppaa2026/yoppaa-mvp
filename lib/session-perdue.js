// « Est-ce que je n'ai rien, ou est-ce qu'on ne me reconnaît plus ? »
//
// ⚠️ CES DEUX SITUATIONS SE RESSEMBLAIENT À L'ÉCRAN, ET C'EST TOUT LE DÉFAUT.
// Quand le jeton du Yopper mourait pendant que l'application dormait, les
// routes répondaient 401 pour les commandes et les rendez-vous, mais une LISTE
// VIDE AVEC UN CODE 200 pour les favoris, et « connecte-toi » pour la fidélité.
// Côté écran, six `catch` posaient `[]` sans distinguer les deux cas. Le Yopper
// lisait « Aucune commande en cours » et croyait ses achats perdus.
//
// Cette décision vit dans un module à part, sans aucune dépendance, pour deux
// raisons : elle est appelée depuis une dizaine d'endroits, et le banc doit
// pouvoir l'EXÉCUTER sans monter un client Supabase.

// Le marqueur que `fetchYopper` pose quand il renonce à appeler le serveur.
export const ERREUR_SESSION = 'session_perdue'

// @param res    la réponse HTTP (ou n'importe quel objet portant `status`)
// @param corps  le JSON déjà lu, s'il l'a été
export function estSessionPerdue(res, corps) {
  if (corps && corps.error === ERREUR_SESSION) return true
  // 401 : la route a explicitement refusé l'appelant.
  if (res && res.status === 401) return true
  // ⚠️ LE CAS TRAÎTRE. `/api/fidelite/mes-cartes` répond 200 avec
  // `connecte:false` : ne pas être connecté n'est pas une erreur, dit son
  // commentaire, et c'est un choix défendable. Mais pour l'écran, c'est
  // exactement la même chose qu'un 401, et il faut le lire comme tel.
  if (corps && corps.connecte === false) return true
  return false
}
