// GARDER SON TABLEAU DE BORD SOUS LA MAIN (Alex, 30/09 au soir).
//
// 🔴 UN COMMERÇANT CHERCHAIT SON TABLEAU DE BORD DANS L'APP DES STORES. Celle-ci
// est l'app des Yoppers ; le tableau de bord s'ouvre dans le navigateur, et
// s'installe sur l'écran d'accueil sous le nom « Yoppaa Pro ». L'email de
// validation le dit depuis le 30/09 (`blocAccesTableauDeBord`) ; le tableau de
// bord le dit aussi, une fois, à qui en a besoin.
//
// ⚠️ DISCRET, ET SEULEMENT À QUI EN A BESOIN :
//   • jamais depuis l'icône déjà installée, ni dans l'app des stores ;
//   • le geste de CET appareil, pas les trois ;
//   • « Plus tard » le range pour de bon sur cet appareil.
//
// Fichier PUR : on lui passe ce qu'il faut savoir, il ne va rien chercher. Il
// s'exécute donc au banc, sans navigateur.

export const ADRESSE_TABLEAU_DE_BORD = 'www.yoppaa.app/dashboard'
export const CLE_AIDE_RANGEE = 'yoppaa-aide-installation-rangee'

// L'appareil, d'après ce que le navigateur dit de lui.
// ⚠️ UN iPAD RÉCENT SE DÉCLARE « Macintosh » : c'est l'écran tactile qui le
// trahit. Sans ce test, il recevrait le conseil du clavier (Ctrl + D).
export function appareilDe({ userAgent = '', pointsTactiles = 0 } = {}) {
  const ua = String(userAgent || '')
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Macintosh/i.test(ua) && Number(pointsTactiles) > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'ordinateur'
}

// Faut-il montrer l'aide ?
// `installee` : ouvert depuis l'icône (mode autonome) ; `native` : l'app des
// stores ; `rangee` : « Plus tard » déjà touché sur cet appareil.
export function aideAMontrer({ installee = false, native = false, rangee = false } = {}) {
  return !installee && !native && !rangee
}

// Le geste, pour CET appareil. `installable` : Chrome a proposé l'installation
// (événement `beforeinstallprompt`), un vrai bouton peut alors la lancer.
export function gesteInstallation(appareil, { installable = false } = {}) {
  if (installable) {
    return { bouton: 'Installer Yoppaa Pro', texte: 'Un geste, et l’icône Yoppaa Pro se range à côté de tes apps.' }
  }
  if (appareil === 'ios') {
    return { bouton: null, texte: 'Dans Safari, touche Partager (le carré avec une flèche), puis « Sur l’écran d’accueil ». L’icône Yoppaa Pro se range à côté de tes apps.' }
  }
  if (appareil === 'android') {
    return { bouton: null, texte: 'Dans Chrome, touche les trois points en haut à droite, puis « Ajouter à l’écran d’accueil ». L’icône Yoppaa Pro se range à côté de tes apps.' }
  }
  return { bouton: null, texte: `Ajoute cette page à tes favoris : Ctrl + D (Cmd + D sur Mac). Ton tableau de bord reste à la même adresse : ${ADRESSE_TABLEAU_DE_BORD}.` }
}
