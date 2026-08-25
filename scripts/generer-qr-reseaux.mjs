// Génère les QR codes des réseaux Yoppaa, au style de la marque.
//
//   node scripts/generer-qr-reseaux.mjs
//
// Sortie : public/qr/qr-facebook.svg et public/qr/qr-instagram.svg
//
// ⚠️ POURQUOI UN SCRIPT ET PAS UN COMPOSANT. Ces QR ne servent pas à l'écran :
// un visiteur déjà sur la page ne scanne pas son propre écran, il clique. Ils
// servent au PAPIER — affichette de vitrine, flyer, carte de visite, kakémono
// de marché. Ce sont donc des FICHIERS qu'on dépose dans un visuel, pas un
// bout d'interface.
//
// ⚠️ ET LES ADRESSES VIENNENT DE `lib/reseaux.js`, jamais recopiées ici. Un QR
// est le pire endroit où recopier une adresse : personne ne relit un QR, on
// découvre l'erreur quand quelqu'un scanne et tombe dans le vide, souvent des
// mois plus tard et sur du papier déjà imprimé.
//
// ⚠️ LE LOGO CENTRAL EST CELUI DE YOPPAA, pas celui de la plateforme. C'est ce
// qui donne l'uniformité qu'Alex cherche, et ça évite d'apposer la marque d'un
// tiers sur des supports commerciaux, ce qui obéit à des règles d'usage qu'on
// n'a pas envie d'aller lire.

import QRCode from 'qrcode'
import { mkdirSync, writeFileSync } from 'node:fs'
import { FACEBOOK_URL, INSTAGRAM_URL } from '../lib/reseaux.js'

// Les deux violets de la marque, en dégradé diagonal comme le QR Instagram
// d'origine. Le module reste assez sombre partout pour garder le contraste
// qu'un lecteur de QR exige : un dégradé trop clair en bas rend le code
// illisible sur certains téléphones, et ça ne se voit qu'au scan.
const VIOLET_CLAIR = '#9660E0'
const VIOLET_FONCE = '#4A1E96'

const TAILLE = 1024
const MARGE = 4          // en modules, la « zone calme » sans laquelle un QR ne se lit pas
const CREUX = 7          // modules réservés au logo central, en largeur comme en hauteur

function svgDuQr(texte, legende) {
  // Correction d'erreur HAUTE : on masque le centre pour y poser le logo, il
  // faut donc que le code survive à cette perte. Avec 'H', jusqu'à 30 % du
  // code peut être illisible sans perdre l'information.
  const qr = QRCode.create(texte, { errorCorrectionLevel: 'H' })
  const n = qr.modules.size
  const data = qr.modules.data
  const total = n + MARGE * 2
  const pas = TAILLE / total

  // Le carré central qu'on laisse vide pour le logo.
  const debutCreux = Math.floor((n - CREUX) / 2)
  const finCreux = debutCreux + CREUX

  let points = ''
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!data[y * n + x]) continue
      if (x >= debutCreux && x < finCreux && y >= debutCreux && y < finCreux) continue
      const cx = (MARGE + x + 0.5) * pas
      const cy = (MARGE + y + 0.5) * pas
      points += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(pas * 0.42).toFixed(2)}"/>`
    }
  }

  const c = (MARGE + n / 2) * pas
  const rLogo = pas * (CREUX / 2) * 0.92

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TAILLE}" height="${TAILLE + 120}" viewBox="0 0 ${TAILLE} ${TAILLE + 120}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${VIOLET_CLAIR}"/>
      <stop offset="1" stop-color="${VIOLET_FONCE}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  <g fill="url(#g)">${points}</g>
  <circle cx="${c.toFixed(2)}" cy="${c.toFixed(2)}" r="${rLogo.toFixed(2)}" fill="#FFFFFF"/>
  <circle cx="${c.toFixed(2)}" cy="${c.toFixed(2)}" r="${(rLogo * 0.62).toFixed(2)}" fill="url(#g)"/>
  <text x="${TAILLE / 2}" y="${TAILLE + 78}" text-anchor="middle"
        font-family="DM Sans, Arial, sans-serif" font-size="72" font-weight="800"
        letter-spacing="2" fill="url(#g)">${legende}</text>
</svg>
`
}

mkdirSync(new URL('../public/qr/', import.meta.url), { recursive: true })

for (const [nom, url, legende] of [
  ['qr-facebook', FACEBOOK_URL, 'YOPPAA.APP'],
  ['qr-instagram', INSTAGRAM_URL, 'YOPPAA.APP'],
]) {
  const chemin = new URL(`../public/qr/${nom}.svg`, import.meta.url)
  writeFileSync(chemin, svgDuQr(url, legende), 'utf8')
  console.log(`${nom}.svg  →  ${url}`)
}

console.log('\nDéposés dans public/qr/. À vérifier EN SCANNANT, jamais à l\'œil.')
