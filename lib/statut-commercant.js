// lib/statut-commercant.js
//
// QUI A LE DROIT D'ENTRER DANS LE TABLEAU DE BORD.
//
// Avant le 20/08, la réponse était « toute personne qui possède une ligne
// `commercants` ». Un commerçant qui venait de terminer son inscription entrait
// donc dans un espace complet alors que Yoppaa n'avait encore rien validé, et
// rien ne lui disait qu'il devait attendre.
//
// ⚠️ CE FICHIER EST UN PANNEAU, PAS UNE SERRURE.
// La politique RLS `commercant_select_own` autorise `auth_user_id = auth.uid()`
// SANS regarder le statut. Un appel direct à Supabase avec un jeton valide
// passe donc outre cette garde. Elle arrête la personne qui ouvre son
// navigateur, elle n'arrête pas quelqu'un qui contourne l'écran. Poser une
// vraie barrière demande de modifier les politiques, table par table.
// Décision assumée d'Alex : le risque réel est faible, la fiche d'un compte non
// validé n'étant publiée nulle part et son compte de paiement n'existant pas.
//
// Fichier PUR : testable en l'exécutant, sans base ni serveur.

// ⚠️ DEUX VALEURS, ET IL EN FAUT DEUX.
// `valide` est ce qu'écrit /api/admin/valider. Mais un compte en production
// porte `actif`, valeur posée à la main et qui n'apparaît nulle part dans le
// code. N'autoriser que `valide` l'aurait mis dehors du jour au lendemain.
// C'est la raison pour laquelle on ne devine jamais un statut : on va le lire.
export const STATUTS_ACCES_AUTORISE = ['valide', 'actif']

// Les raisons de refus, et chacune appelle un écran différent. Une porte
// fermée sans sa raison est la pire des réponses.
export const RAISON_OK = 'ok'
export const RAISON_AUCUN_COMPTE = 'aucun_compte'
export const RAISON_ONBOARDING = 'onboarding_incomplet'
export const RAISON_REJETE = 'rejete'
export const RAISON_ATTENTE = 'en_attente'

// Rend `{ autorise, raison, motif }`.
//
// L'ordre des tests n'est pas indifférent :
//   1. pas de fiche du tout ;
//   2. REJETÉ d'abord, parce que c'est l'information la plus utile et qu'elle
//      appelle un geste précis ;
//   3. validé, la porte s'ouvre ;
//   4. inscription jamais soumise (`brouillon`) : on le renvoie la finir plutôt
//      que de lui annoncer une attente qui ne viendra jamais ;
//   5. tout le reste est une attente de validation.
export function accesDashboard(commercant) {
  if (!commercant) return { autorise: false, raison: RAISON_AUCUN_COMPTE, motif: null }

  if (commercant.statut === 'rejete') {
    return { autorise: false, raison: RAISON_REJETE, motif: commercant.motif_rejet || null }
  }

  if (STATUTS_ACCES_AUTORISE.includes(commercant.statut)) {
    return { autorise: true, raison: RAISON_OK, motif: null }
  }

  // `brouillon` est l'état d'une inscription commencée et jamais soumise :
  // le signup le fait passer à `en_attente` au moment de l'envoi.
  if (commercant.statut_publication === 'brouillon') {
    return { autorise: false, raison: RAISON_ONBOARDING, motif: null }
  }

  return { autorise: false, raison: RAISON_ATTENTE, motif: null }
}
