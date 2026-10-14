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
export const GOOGLE_PLAY_URL = null

// Les badges OFFICIELS, en français, tels que fournis par Apple et Google : leurs
// règles de marque interdisent de les redessiner ou de les recolorer.
export const BADGE_APP_STORE = { src: '/store/badge-app-store-fr.svg', largeur: 127, hauteur: 40, alt: 'Télécharger dans l’App Store' }
// Le badge Google contient sa propre marge transparente : à hauteur égale, il
// paraît plus petit que celui d'Apple. Les deux tailles en tiennent compte.
export const BADGE_GOOGLE_PLAY = { src: '/store/badge-google-play-fr.png', largeur: 646, hauteur: 250, alt: 'Disponible sur Google Play' }

export function appPubliee() {
  return !!(APP_STORE_URL || GOOGLE_PLAY_URL)
}
