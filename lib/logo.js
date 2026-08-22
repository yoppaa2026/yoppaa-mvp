// LES PROPORTIONS DU LOGO YOPPAA, à un seul endroit.
//
// Spec définitive validée le 12/06/2026 :
//   • Wordmark : Plus Jakarta Sans 800, letter-spacing -0,05em, minuscules
//   • Dots : V2-B maillon (5 points, mini 0,55 · décalage 0,4 = le sourire)
//   • Slogan : « Ton quartier dans ta poche », Jakarta 600, sans ponctuation
//
// ⚠️ ELLES VIVENT ICI DEPUIS LE 23/08 PARCE QU'ELLES ÉTAIENT RECOPIÉES.
// `<YoppaaLogo>` les portait en dur, et l'affiche du kit — dessinée en canvas,
// donc incapable de réutiliser le composant — les recopiait de son côté. Deux
// jeux de nombres pour un seul logo : le jour où l'un bouge, l'autre ment, et
// personne ne le voit puisque les deux rendus ne sont jamais côte à côte.
//
// ⚠️ ET LE DÉCALAGE PORTE SUR LES POINTS 2, 3 ET 4, jamais sur les seuls
// petits. C'est lui qui creuse le sourire : appliqué aux deux petits points
// seulement, la ligne s'aplatit et le logo n'est plus le logo.

export const LOGO = {
  // Tout est exprimé en fraction du corps du wordmark.
  dotBase: 0.254,        // 28/110 dans la spec SVG
  miniRatio: 0.55,       // petit point = 0,55 × dotBase
  gapRatio: 0.55,        // écart entre points = 0,55 × dotBase
  offsetRatio: 0.4,      // décalage vertical = 0,4 × dotBase
  // Jakarta 800 a des descendantes marquées (y/p ≈ 22 % de l'em) : en dessous
  // de 0,25 les points viennent toucher la jambe du « p ».
  wordmarkToDots: 0.28,
  dotsToSlogan: 0.25,
  sloganSize: 0.236,     // 26/110
  tracking: -0.05,
  slogan: 'Ton quartier dans ta poche',
}

/**
 * Les mesures d'un logo rendu à `size` pixels de corps.
 * @param {number} size corps du wordmark, en pixels
 */
export function proportionsLogo(size) {
  const base = size * LOGO.dotBase
  return {
    wordmark: size,
    dotBase: base,
    dotMini: base * LOGO.miniRatio,
    dotGap: base * LOGO.gapRatio,
    dotOffset: base * LOGO.offsetRatio,
    wordmarkToDots: size * LOGO.wordmarkToDots,
    dotsToSlogan: size * LOGO.dotsToSlogan,
    sloganSize: size * LOGO.sloganSize,
    tracking: size * LOGO.tracking,
  }
}

/**
 * Les cinq points, dans l'ordre, avec leur diamètre et leur décalage.
 *
 * ⚠️ Le décalage est porté par les points 2, 3 et 4 — pas par les petits.
 * Cette fonction existe pour que la règle ne se réécrive nulle part.
 *
 * @param {number} size corps du wordmark, en pixels
 * @returns {Array<{diametre:number, decalage:number, rang:number}>}
 */
export function pointsLogo(size) {
  const { dotBase, dotMini, dotOffset } = proportionsLogo(size)
  return [
    { rang: 1, diametre: dotBase, decalage: 0 },
    { rang: 2, diametre: dotMini, decalage: dotOffset },
    { rang: 3, diametre: dotBase, decalage: dotOffset },
    { rang: 4, diametre: dotMini, decalage: dotOffset },
    { rang: 5, diametre: dotBase, decalage: 0 },
  ]
}

/** Largeur totale de la rangée de points, écarts compris. */
export function largeurPoints(size) {
  const { dotGap } = proportionsLogo(size)
  return pointsLogo(size).reduce((l, p) => l + p.diametre, 0) + dotGap * 4
}
