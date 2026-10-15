// lib/stores.js
//
// Les liens de l'app Yoppers dans les deux stores, à UN seul endroit.
//
// ⚠️ NULL TANT QUE L'APP N'EST PAS PUBLIÉE (Alex, 03/10 : « publication
// MANUELLE, c'est moi qui décide du jour »). Les deux versions sont approuvées,
// mais une version approuvée n'est pas une version en vente : un lien vers une
// fiche non publiée ouvre une page « introuvable », et le visiteur conclut que
// l'app n'existe pas. Sans lien, la landing montre les badges en « Bientôt
// disponible », sans les rendre cliquables.
//
// ✅ LE JOUR DE LA PUBLICATION, UN SEUL GESTE : coller les deux adresses
// ci-dessous. Google Play se déduit de l'identifiant Capacitor
// (`app.yoppaa.client`, capacitor.config.ts) ; l'App Store porte un numéro que
// seule la fiche App Store Connect donne (« Lien de l'app »).
//
//   GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=app.yoppaa.client'
//   APP_STORE_URL   = 'https://apps.apple.com/be/app/yoppaa/id…'

export const APP_STORE_URL = null
// ✅ 15/10 : publiée par Alex, en ligne (vérifiée : la fiche répond depuis la
// Belgique). L'identifiant est celui de Capacitor, figé à vie.
export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=app.yoppaa.client'

// La phrase sous les badges : ce qui n'est pas encore en ligne, nommé. Avec
// une seule fiche publiée, « Bientôt disponible sur l'App Store et Google
// Play » serait faux pour l'une, et rien du tout laisserait un badge grisé
// sans explication. `null` quand les deux sont en ligne.
export function noteStores() {
  if (APP_STORE_URL && GOOGLE_PLAY_URL) return null
  if (!APP_STORE_URL && !GOOGLE_PLAY_URL) return 'Bientôt disponible sur l’App Store et Google Play.'
  return !APP_STORE_URL ? 'Bientôt disponible sur l’App Store.' : 'Bientôt disponible sur Google Play.'
}

// Les badges OFFICIELS, en français, tels que fournis par Apple et Google : leurs
// règles de marque interdisent de les redessiner ou de les recolorer.
export const BADGE_APP_STORE = { src: '/store/badge-app-store-fr.svg', largeur: 127, hauteur: 40, alt: 'Télécharger dans l’App Store', visible: { y: 0, hauteur: 40 } }
// ⚠️ LE BADGE GOOGLE PORTE SA PROPRE MARGE TRANSPARENTE, en haut et en bas
// seulement : mesurée pixel par pixel le 14/10, la partie opaque va de y = 29
// à y = 220 (192 px sur 250), et de bord à bord en largeur. À hauteur de
// fichier égale, il paraissait plus petit qu'Apple ; corrigé « à l'œil » par
// un rapport 46 / 68, il ne l'était qu'à peu près (Alex, 14/10 : « que les
// deux vignettes des stores soient de la même taille, surtout en hauteur »).
// `visible` est la partie OPAQUE : c'est elle qu'on aligne, jamais le fichier.
export const BADGE_GOOGLE_PLAY = { src: '/store/badge-google-play-fr.png', largeur: 646, hauteur: 250, alt: 'Disponible sur Google Play', visible: { y: 29, hauteur: 192 } }

// La taille d'affichage d'un badge pour une hauteur VISIBLE donnée : rend la
// boîte visible (largeur, hauteur) et la boîte du fichier entier, plus le
// décalage du haut de la partie visible dans le fichier.
export function tailleBadge(badge, hauteurVisible) {
  const echelle = hauteurVisible / badge.visible.hauteur
  return {
    largeur: badge.largeur * echelle,
    hauteur: hauteurVisible,
    hauteurFichier: badge.hauteur * echelle,
    decalageHaut: badge.visible.y * echelle,
  }
}

// ─── « TÉLÉCHARGER YOPPAA » : LE BON STORE POUR LE BON TÉLÉPHONE (15/10) ──────
//
// 🔴 LE BOUTON MENAIT À UNE PAGE INTROUVABLE. Après une commande passée depuis
// un PC, la confirmation propose « Télécharger Yoppaa » vers `/download`, qui
// n'existait pas (trouvé en ajoutant le lien Google Play, le jour où Play est
// passé en ligne). `/download` décide maintenant ici :
//   • iPhone ou iPad → l'App Store, s'il est en ligne ;
//   • Android → Google Play, s'il est en ligne ;
//   • sinon (PC, ou store pas encore publié) → la section des habitants de
//     la landing, où les badges disent ce qui est disponible.
// ⚠️ L'iPad récent se dit « Macintosh » : on ne le devine pas, il tombe sur la
// landing et ses badges, ce qui reste juste.
export const REPLI_TELECHARGEMENT = '/#preinscription'
export function cibleTelechargement(userAgent = '') {
  const ua = String(userAgent || '')
  if (/iPhone|iPad|iPod/i.test(ua)) return APP_STORE_URL || REPLI_TELECHARGEMENT
  if (/Android/i.test(ua)) return GOOGLE_PLAY_URL || REPLI_TELECHARGEMENT
  return REPLI_TELECHARGEMENT
}

export function appPubliee() {
  return !!(APP_STORE_URL || GOOGLE_PLAY_URL)
}
