// ════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR DES ICÔNES DE L'APPLICATION CLIENT
//
//   node scripts/generer-icones.mjs
//
// Pourquoi le fond est un APLAT et non un dégradé
// -----------------------------------------------
// Android peint son propre écran de lancement : l'icône, centrée, sur la
// couleur `background_color` du manifeste. Tant que l'icône portait son
// dégradé, ce dégradé était plus clair que le fond en son milieu, et on
// voyait un CARRÉ ARRONDI se détacher nettement au lancement. Deux écrans
// bien distincts au lieu d'un enchaînement.
//
// Le fond de l'icône vaut donc exactement `#1A0840`, la même valeur que
// `background_color`. Android n'affiche plus alors que les 5 points, qui
// semblent flotter sur l'encre, et l'enchaînement vers le dégradé de la page
// ne montre plus de couture.
//
// ⚠️ CETTE VALEUR EST LIÉE AU MANIFESTE. Changer l'une sans l'autre fait
// revenir le carré, et rien ne le dirait : le banc les compare.
//
// Décision d'Alex, 19/08. Contrepartie assumée : l'icône de l'écran d'accueil
// perd son dégradé. À la taille où elle s'affiche, il se lisait déjà presque
// comme un aplat.
// ════════════════════════════════════════════════════════════════════

// ⚠️ `sharp` N'EST PAS IMPORTÉ EN TÊTE DE FICHIER, ET C'EST VOLONTAIRE.
// Le banc importe ce module pour comparer l'encre de l'icône à celle du
// manifeste, et il tourne sur la CI, où `sharp` n'est pas une dépendance
// déclarée : il n'existe que parce que Next l'installe pour lui-même. Un
// import en tête ferait échouer le banc sur une dépendance de hasard, très
// loin de ce qu'il vérifie. Il est donc chargé À L'EXÉCUTION seulement.
import { join } from 'node:path'

export const ENCRE = '#1A0840'

// Les 5 points, spec canonique V2-B du brand kit (viewBox 200 × 50, groupe
// translaté de 12, 7). Palette « dark ».
const POINTS = [
  { cx: 14,    cy: 14,   r: 14,  fill: '#FFFFFF' },
  { cx: 51.1,  cy: 21.7, r: 7.7, fill: '#C4A0F4' },
  { cx: 88.2,  cy: 25.2, r: 14,  fill: '#C4A0F4' },
  { cx: 125.3, cy: 21.7, r: 7.7, fill: '#9660E0' },
  { cx: 162.4, cy: 14,   r: 14,  fill: '#9660E0' },
]
const VB = { w: 200, h: 50, dx: 12, dy: 7 }

// Les points occupent 78 % de la largeur, centrés. C'est la proportion de
// l'icône d'origine, relevée sur `icon-512.png` avant de la remplacer, et il
// n'y a aucune raison de la changer : Alex l'a validée.
export const PART_LARGEUR = 0.78

export function svgIcone(cote) {
  const w = Math.round(cote * PART_LARGEUR)
  const h = (w * VB.h) / VB.w
  const x = (cote - w) / 2
  const y = (cote - h) / 2
  const echelle = w / VB.w
  const cercles = POINTS
    .map(p => `<circle cx="${p.cx + VB.dx}" cy="${p.cy + VB.dy}" r="${p.r}" fill="${p.fill}"/>`)
    .join('\n    ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cote}" height="${cote}" viewBox="0 0 ${cote} ${cote}">
  <rect width="${cote}" height="${cote}" fill="${ENCRE}"/>
  <g transform="translate(${x}, ${y}) scale(${echelle})">
    ${cercles}
  </g>
</svg>`
}

const lanceDirectement = Boolean(process.argv[1]) &&
  process.argv[1].replace(/\\/g, '/').endsWith('scripts/generer-icones.mjs')

if (lanceDirectement) {
  const sharp = (await import('sharp')).default
  for (const cote of [192, 512]) {
    const chemin = join(process.cwd(), 'public', `icon-${cote}.png`)
    await sharp(Buffer.from(svgIcone(cote))).png({ compressionLevel: 9, effort: 10 }).toFile(chemin)
    console.log(`  icon-${cote}.png réécrite, fond ${ENCRE}`)
  }
}
