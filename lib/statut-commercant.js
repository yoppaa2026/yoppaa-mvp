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

// ═══════════════════════════════════════════════════════════════════════════
// ET L'AUTRE PORTE : LA FICHE ACCUEILLE-T-ELLE DES CLIENTS ?
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ DEUX COLONNES, DEUX PORTES, ET ON LES CONFOND FACILEMENT.
// `statut` commande l'entrée du commerçant dans son tableau de bord (ci-dessus).
// `statut_publication` commande tout autre chose : sa fiche est-elle offerte au
// public. Un commerçant peut parfaitement préparer sa page pendant des semaines
// sans qu'elle soit visible, et c'est même le cas normal avant une ouverture.
//
// 🔴 LE DÉFAUT DU 16/09 : `/api/rdv/reserver` ne regardait que `rdv_actif`.
// Chez un commerce non publié, l'interrupteur de l'agenda était donc le SEUL
// verrou du serveur : une requête bien formée posait un rendez-vous, bloquait
// un créneau et pouvait exiger une empreinte bancaire chez quelqu'un dont la
// page n'existe pour personne. Deux routes sœurs du même cœur transactionnel
// (`create-commande`, `bons-cadeaux/checkout`) faisaient le contrôle depuis
// toujours, chacune avec sa propre comparaison recopiée à la main.
//
// La règle vit ici, écrite UNE FOIS. `COLONNE_PUBLICATION` existe pour que le
// banc vérifie que chaque appelant CHARGE bien la colonne : absente du select,
// elle vaut `undefined`, la fonction rend `false` et la route refuse alors
// TOUT LE MONDE en silence. C'est le défaut le plus fréquent du dépôt, et ici
// il se retournerait contre les commerçants publiés.
export const PUBLICATION_OUVERTE = 'publie'
export const COLONNE_PUBLICATION = 'statut_publication'

// ⚠️ LISTE BLANCHE, JAMAIS LISTE NOIRE. Les autres valeurs vivantes sont
// `brouillon`, `en_attente`, `rejete` et `suspendu` ; en refuser quatre
// nommément laisserait passer la cinquième le jour où elle apparaîtra.
export function fichePubliee(commercant) {
  return commercant?.[COLONNE_PUBLICATION] === PUBLICATION_OUVERTE
}

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
