// ════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR DES ÉCRANS DE LANCEMENT iOS
//
//   node scripts/generer-splash-ios.mjs
//
// Pourquoi ce script existe
// -------------------------
// Android compose son écran de lancement tout seul à partir de
// `manifest.json`. Safari, lui, IGNORE le manifeste. Sans
// `apple-touch-startup-image`, une PWA installée sur l'écran d'accueil d'un
// iPhone s'ouvre sur un FLASH BLANC, avant que le web n'ait peint quoi que
// ce soit. C'est exactement le blanc qu'Alex voit avant le splash animé.
//
// Et Safari veut UNE IMAGE PAR TAILLE D'ÉCRAN, chacune choisie par une
// requête média exacte. Écrire 19 balises à la main, c'est 19 occasions de
// se tromper d'un pixel sans que rien ne le dise.
//
// ⚠️ CE QU'ON DESSINE : LE DÉGRADÉ NU, SANS LOGO
// ----------------------------------------------
// L'écran de lancement animé (wordmark, 5 points, slogan) existe DÉJÀ dans
// l'application, dans `SplashScreen` de app/commander/page.js. Peindre le
// logo dans l'image native le ferait apparaître DEUX FOIS : une fois figé,
// puis une fois qui rejoue son animation depuis zéro. Un saut visible.
//
// L'image native ne porte donc que le fond, au pixel identique à celui du
// composant. Le natif pose la matière, l'app enchaîne l'animation dessus,
// et il n'y a aucune couture.
//
// Effet de bord heureux : aucun texte à rendre. librsvg, le moteur SVG de
// sharp, ne charge pas les polices web ; un wordmark y serait rendu dans une
// police de repli SANS QU'AUCUNE ERREUR NE LE DISE.
//
// Sortie : public/splash/*.png + lib/splash-ios.js (la table lue par le
// layout ET par le banc).
// ════════════════════════════════════════════════════════════════════

// ⚠️ `sharp` N'EST PAS IMPORTÉ EN TÊTE DE FICHIER, ET C'EST VOLONTAIRE.
// Le banc importe ce module pour sa table d'écrans et sa géométrie, et il
// tourne sur la CI, où `sharp` n'est PAS une dépendance déclarée : il n'existe
// que parce que Next l'installe pour lui-même. Un import en tête ferait
// échouer le banc sur une dépendance de hasard, très loin de ce qu'il
// vérifie. Il est donc chargé À L'EXÉCUTION seulement.
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ────────── LE FOND ──────────
// Recopié à l'identique de `SplashScreen` (app/commander/page.js) :
//   linear-gradient(160deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)
// ⚠️ Ces valeurs ne s'inventent pas et ne s'arrondissent pas : toute
// différence avec le composant se verrait comme un clignotement au moment
// où l'image native cède la place à la page.
export const FOND = {
  angle: 160,
  arrets: [
    { offset: 0,   couleur: '#160636' },
    { offset: 0.5, couleur: '#2D0F6B' },
    { offset: 1,   couleur: '#1A0840' },
  ],
}

// ────────── LES ÉCRANS ──────────
// [largeur CSS, hauteur CSS, densité] en PORTRAIT.
// ⚠️ Portrait seulement, et c'est délibéré : l'application est verrouillée en
// portrait (`orientation: "portrait"` dans le manifeste) et toute son
// interface est pensée pour le pouce. Doubler la table pour le paysage
// doublerait le nombre de fichiers sans servir personne.
const ECRANS = [
  // iPhone
  [320, 568, 2],   // SE 1re génération
  [375, 667, 2],   // 8, SE 2 et 3
  [414, 736, 3],   // 8 Plus
  [375, 812, 3],   // X, XS, 11 Pro, 12 mini, 13 mini
  [414, 896, 2],   // XR, 11
  [414, 896, 3],   // XS Max, 11 Pro Max
  [390, 844, 3],   // 12, 12 Pro, 13, 13 Pro, 14
  [428, 926, 3],   // 12 Pro Max, 13 Pro Max, 14 Plus
  [393, 852, 3],   // 14 Pro, 15, 15 Pro, 16
  [430, 932, 3],   // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  [402, 874, 3],   // 16 Pro
  [440, 956, 3],   // 16 Pro Max
  // iPad
  [744, 1133, 2],  // mini 6
  [768, 1024, 2],  // mini 4, 9,7 pouces
  [810, 1080, 2],  // 10,2 pouces
  [820, 1180, 2],  // Air 10,9 et 11 pouces
  [834, 1112, 2],  // 10,5 pouces
  [834, 1194, 2],  // Pro 11 pouces
  [1024, 1366, 2], // Pro 12,9 pouces
]

// ────────── LA GÉOMÉTRIE D'UN DÉGRADÉ CSS ──────────
// Un `linear-gradient(Xdeg, …)` de CSS n'est PAS un `<linearGradient>` de SVG :
// l'angle CSS se compte depuis « vers le haut », dans le sens des aiguilles,
// et la ligne du dégradé traverse le centre de la boîte sur une longueur qui
// dépend de l'angle ET des proportions. Reprendre naïvement 0,0 → 1,1 en SVG
// donnerait un dégradé qui tourne avec la forme de l'écran, donc des couleurs
// différentes d'un iPhone à l'autre.
export function ligneDegrade(largeur, hauteur, angleDeg) {
  const a = (angleDeg * Math.PI) / 180
  // Repère SVG : x vers la droite, y vers le BAS. 0° pointe vers le haut.
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const longueur = Math.abs(largeur * Math.sin(a)) + Math.abs(hauteur * Math.cos(a))
  const cx = largeur / 2
  const cy = hauteur / 2
  return {
    x1: cx - (dx * longueur) / 2, y1: cy - (dy * longueur) / 2,
    x2: cx + (dx * longueur) / 2, y2: cy + (dy * longueur) / 2,
  }
}

// ────────── LE SVG D'UN ÉCRAN ──────────
export function svgSplash(largeur, hauteur) {
  const l = ligneDegrade(largeur, hauteur, FOND.angle)
  const arrets = FOND.arrets
    .map(s => `      <stop offset="${s.offset}" stop-color="${s.couleur}"/>`)
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}">
  <defs>
    <linearGradient id="fond" gradientUnits="userSpaceOnUse" x1="${l.x1.toFixed(2)}" y1="${l.y1.toFixed(2)}" x2="${l.x2.toFixed(2)}" y2="${l.y2.toFixed(2)}">
${arrets}
    </linearGradient>
  </defs>
  <rect width="${largeur}" height="${hauteur}" fill="url(#fond)"/>
</svg>`
}

// ────────── LA TABLE PARTAGÉE ──────────
export const nomFichier = (largeur, hauteur) => `apple-splash-${largeur}x${hauteur}.png`

export const requeteMedia = (cssL, cssH, densite) =>
  `(device-width: ${cssL}px) and (device-height: ${cssH}px) and (-webkit-device-pixel-ratio: ${densite}) and (orientation: portrait)`

export const table = ECRANS.map(([cssL, cssH, d]) => ({
  cssL, cssH, densite: d, largeur: cssL * d, hauteur: cssH * d,
}))

// ────────── EXÉCUTION ──────────
// Le module est aussi importé par le banc, qui ne doit RIEN écrire sur le
// disque. On ne génère donc que si le script est lancé directement.
const lanceDirectement = Boolean(process.argv[1]) &&
  process.argv[1].replace(/\\/g, '/').endsWith('scripts/generer-splash-ios.mjs')

if (lanceDirectement) {
  const sharp = (await import('sharp')).default
  const dossier = join(process.cwd(), 'public', 'splash')
  mkdirSync(dossier, { recursive: true })

  // On repart d'un dossier propre : un écran retiré de la table doit voir son
  // image disparaître, sinon le dossier accumule des fichiers que plus aucune
  // balise ne référence.
  if (existsSync(dossier)) {
    for (const f of readdirSync(dossier)) {
      if (f.startsWith('apple-splash-') && f.endsWith('.png')) rmSync(join(dossier, f))
    }
  }

  let total = 0
  for (const e of table) {
    const nom = nomFichier(e.largeur, e.hauteur)
    const chemin = join(dossier, nom)
    await sharp(Buffer.from(svgSplash(e.largeur, e.hauteur)))
      .png({ compressionLevel: 9, effort: 10 })
      .toFile(chemin)
    const poids = statSync(chemin).size
    total += poids
    console.log(`  ${nom.padEnd(28)} ${String(Math.round(poids / 1024)).padStart(5)} Ko   ${e.cssL}×${e.cssH} @${e.densite}`)
  }
  console.log(`\n  ${table.length} images, ${Math.round(total / 1024)} Ko au total`)

  // ────────── LA TABLE LUE PAR LE LAYOUT ──────────
  const lignes = table.map(e =>
    `  { media: '${requeteMedia(e.cssL, e.cssH, e.densite)}', href: '/splash/${nomFichier(e.largeur, e.hauteur)}' },`
  ).join('\n')
  writeFileSync(join(process.cwd(), 'lib', 'splash-ios.js'), `// ⚠️ FICHIER GÉNÉRÉ par scripts/generer-splash-ios.mjs — ne pas éditer à la main.
//
// Safari ignore le manifeste : sans ces images, une PWA installée sur l'écran
// d'accueil d'un iPhone s'ouvre sur un flash blanc avant que la page n'ait
// peint. Une image par taille d'écran, chacune choisie par une requête média
// exacte. Elles ne portent que le dégradé, le logo étant animé par la page.
//
// Pour régénérer après avoir ajouté un appareil :
//   node scripts/generer-splash-ios.mjs
export const SPLASH_IOS = [
${lignes}
]
`, 'utf8')
  console.log('  lib/splash-ios.js réécrit')
}
