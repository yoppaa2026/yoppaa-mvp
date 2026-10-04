// LA LISTE D'ATTENTE EXIGE LES NOTIFICATIONS (décision d'Alex du 04/10 : « il
// doit avoir les notifs »).
//
// 🔴 POURQUOI. La file ne prévient QUE par notification : un Yopper inscrit
// sans elles tenait un rang, ne recevait jamais rien, et la place passait à la
// personne suivante pendant qu'il attendait. Il croyait être prévenu ; il ne
// pouvait pas l'être. Lui demander les notifications APRÈS l'inscription
// (03/10) ne suffisait pas : un refus le laissait inscrit pour rien.
//
// ⚠️ UNE RÈGLE D'ÉCRAN, ET C'EST VOULU. Elle ne protège ni argent ni donnée :
// une requête forgée sans notifications ne prive personne d'autre, elle prive
// seulement son auteur d'une alerte. Le serveur ne peut d'ailleurs pas savoir
// si le téléphone accepte les notifications.
//
// Fichier PUR : il s'exécute au banc, sans navigateur.

// L'état lu par `lireEtatPush` (OneSignalInit), traduit en ce que l'écran fait.
//   'actif'        → on inscrit directement ;
//   'a_demander'   → le clic demande l'autorisation, PUIS inscrit ;
//   'bloque'       → refusé dans le navigateur : on dit où le rouvrir ;
//   'non_supporte' → ce navigateur ne reçoit rien (iPhone hors de l'app) ;
//   'inconnu'      → le module de notifications n'est pas encore chargé : le
//                    clic tente quand même, et dit pourquoi s'il échoue.
export function etatNotifsAttente(etat) {
  if (!etat?.pret) return 'inconnu'
  if (etat.natif) return etat.optedIn ? 'actif' : 'a_demander'
  if (etat.supporte === false) return 'non_supporte'
  if (etat.permission === 'denied') return 'bloque'
  // ⚠️ AUTORISÉ MAIS DÉSABONNÉ (`optedIn` faux) n'est pas actif : le navigateur
  // accepte, mais OneSignal n'enverra rien. Le clic réabonne.
  if (etat.permission === 'granted' && etat.optedIn !== false) return 'actif'
  return 'a_demander'
}

// Ce qu'on dit quand l'activation demandée au clic n'a pas abouti. `raison`
// vient de `activerNotifications` (ou de `demanderPushNatif` dans l'app).
// ⚠️ CHAQUE PHRASE DIT QUOI FAIRE, pas seulement ce qui ne va pas.
export function phraseNotifsRefusees(raison) {
  if (raison === 'non_supporte') {
    return 'Ce navigateur ne reçoit pas les notifications. Installe l’app Yoppaa pour t’inscrire sur la liste d’attente.'
  }
  if (raison === 'refuse_os') {
    return 'Les notifications sont bloquées pour Yoppaa. Autorise-les dans les réglages de ton téléphone ou de ton navigateur, puis réessaie.'
  }
  if (raison === 'incomplet') {
    return 'Sans les notifications, on ne peut pas te prévenir. Autorise-les pour t’inscrire sur la liste d’attente.'
  }
  return 'Les notifications n’ont pas pu s’activer. Recharge la page et réessaie.'
}

// Ce qu'on dit AVANT le clic, quand on sait déjà que ça ne marchera pas.
// `null` : rien à dire, le bouton suffit.
export function phraseNotifsAvant(etatNotif) {
  if (etatNotif === 'non_supporte') return phraseNotifsRefusees('non_supporte')
  if (etatNotif === 'bloque') return phraseNotifsRefusees('refuse_os')
  if (etatNotif === 'a_demander' || etatNotif === 'inconnu') {
    return 'On te prévient par notification : il faudra les autoriser.'
  }
  return null
}
