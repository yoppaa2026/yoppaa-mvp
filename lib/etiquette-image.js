// L'ÉTIQUETTE EN IMAGE, POUR LA TABLETTE DU COMPTOIR (« Yoppaa Comptoir », 12/10).
//
// Le SDK de Brother n'imprime pas une page web : il imprime une IMAGE. Cette
// image reprend, élément par élément, l'étiquette du navigateur que tu as
// validée sur la machine le 01/10 (`lib/impression-etiquette.js`) : mêmes
// lignes, mêmes corps, même pied « commerce + yoppaa ». Le CONTENU vient de la
// même règle (`contenuEtiquette`) : deux machines, une seule étiquette.
//
// Deux couches :
//   - `miseEnPageEtiquette` : PURE. Elle calcule chaque texte, filet et point
//     du logo, en pixels, et la hauteur exacte. Elle ne dessine rien : la
//     mesure d'un texte lui est fournie (`mesurer`), le banc l'exécute avec
//     une mesure de substitution ;
//   - `dessinerEtiquette` : pose ces éléments sur un canevas (navigateur, ou
//     la vue de l'app sur la tablette), d'où l'image part vers la Brother.
//
// ⚠️ LA BROTHER QL-820NWBc EST EN 300 dpi, et sur le rouleau continu de 62 mm
// elle imprime 696 points de large (58,9 mm). L'image fait EXACTEMENT cette
// largeur : sans mise à l'échelle, rien n'est flou ni rogné.
// ⚠️ LA HAUTEUR EST CELLE DU CONTENU, mesurée, pas estimée : le rouleau continu
// se coupe juste après (la page du navigateur, elle, devait être devinée).

import { proportionsLogo, pointsLogo, largeurPoints, LOGO } from './logo'
import { PIED_ETIQUETTE } from './etiquette-commande'

export const IMAGE_ETIQUETTE = {
  dpi: 300,
  largeurPx: 696,          // la zone imprimable du rouleau de 62 mm
  margeCoteMm: 1.5,        // 58,9 − 2 × 1,5 ≈ 56 mm utiles, comme la page du navigateur
  margeHautMm: 3,
  margeBasMm: 3,
}
export const PX_PAR_MM = IMAGE_ETIQUETTE.dpi / 25.4
const mm = (v) => v * PX_PAR_MM
const pt = (v) => v * 0.352778 * PX_PAR_MM

// Les polices : celles des étiquettes du navigateur. Le wordmark est en
// Jakarta 800 quand la page l'a chargée (`policeMarque`), sinon Arial.
export const POLICE = 'Arial, Helvetica, sans-serif'

// Les styles, repris de `feuilleEtiquette` (corps en points, interlignes).
export const STYLES = {
  ref: { taille: pt(22), graisse: 900, interligne: 1.05 },
  sac: { taille: pt(12), graisse: 900, interligne: 1.05 },
  client: { taille: pt(14), graisse: 800, interligne: 1.15, lignesMax: 2 },
  adresse: { taille: pt(9.5), graisse: 700, interligne: 1.2, lignesMax: 2 },
  quand: { taille: pt(10), graisse: 700, interligne: 1.2, lignesMax: 2 },
  article: { taille: pt(9), graisse: 800, interligne: 1.25 },
  options: { taille: pt(8), graisse: 600, interligne: 1.2, retraitMm: 3 },
  bas: { taille: pt(10), graisse: 700, interligne: 1.2 },
  commerce: { taille: pt(9), graisse: 800, interligne: 1.15 },
}

const police = (s, famille = POLICE) => `${s.graisse} ${Math.round(s.taille * 100) / 100}px ${famille}`

/**
 * Coupe un texte en lignes qui tiennent dans `largeur` (mot à mot, et un mot
 * trop long est coupé lettre à lettre). Au-delà de `lignesMax`, la dernière
 * ligne finit par « … ».
 */
export function couperTexte(texte, largeur, mesurer, fonte, lignesMax = Infinity) {
  const mots = String(texte || '').trim().split(/\s+/).filter(Boolean)
  const lignes = []
  let courante = ''
  const pousser = (l) => { if (l) lignes.push(l) }
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot
    if (mesurer(essai, fonte) <= largeur) { courante = essai; continue }
    pousser(courante)
    courante = ''
    // Un mot plus long que la ligne : lettre à lettre.
    let morceau = ''
    for (const ch of mot) {
      if (mesurer(morceau + ch, fonte) <= largeur || !morceau) morceau += ch
      else { lignes.push(morceau); morceau = ch }
    }
    courante = morceau
  }
  pousser(courante)
  if (lignes.length <= lignesMax) return lignes
  const gardees = lignes.slice(0, lignesMax)
  // La dernière ligne garde AUTANT DE TEXTE QUE POSSIBLE : on repart de tout ce
  // qui reste, et on retire lettre à lettre jusqu'à ce que « … » tienne.
  let derniere = lignes.slice(lignesMax - 1).join(' ')
  while (derniere && mesurer(`${derniere}…`, fonte) > largeur) derniere = derniere.slice(0, -1)
  gardees[lignesMax - 1] = `${derniere.trimEnd()}…`
  return gardees
}

/**
 * LA MISE EN PAGE : la liste des éléments à poser, et la hauteur.
 * @param contenu   ce que rend `contenuEtiquette` (une étiquette, un sac)
 * @param mesurer   (texte, fonte) => largeur en pixels
 * @returns { largeur, hauteur, elements: [{ type: 'texte'|'filet'|'rect'|'point', ... }] }
 */
export function miseEnPageEtiquette(contenu, { mesurer, policeMarque = POLICE } = {}) {
  if (typeof mesurer !== 'function') throw new Error('mesurer requis')
  const c = contenu || {}
  const L = IMAGE_ETIQUETTE.largeurPx
  const g = mm(IMAGE_ETIQUETTE.margeCoteMm)
  const d = L - g
  const utile = d - g
  const elements = []
  let y = mm(IMAGE_ETIQUETTE.margeHautMm)

  const texte = (t, s, x, ligneY, extra = {}) => elements.push({ type: 'texte', texte: t, fonte: police(s), x, y: ligneY, ...extra })
  const bloc = (t, s, { avant = 0, retrait = 0, lignesMax } = {}) => {
    if (!t) return
    y += avant
    const lignes = couperTexte(t, utile - retrait, mesurer, police(s), lignesMax ?? s.lignesMax ?? Infinity)
    for (const l of lignes) {
      y += s.taille * s.interligne
      texte(l, s, g + retrait, y - s.taille * (s.interligne - 1) / 2 - s.taille * 0.2)
    }
  }

  // La tête : la référence, et le sac à droite.
  if (c.reference || c.sac) {
    const s = STYLES.ref
    y += s.taille * s.interligne
    const base = y - s.taille * 0.2
    if (c.reference) texte(String(c.reference), s, g, base)
    if (c.sac) texte(String(c.sac), STYLES.sac, d, base, { aligne: 'droite' })
  }
  bloc(c.client || 'Client', STYLES.client, { avant: mm(1) })
  bloc(c.adresse, STYLES.adresse, { avant: mm(0.8) })
  bloc(c.quand, STYLES.quand, { avant: mm(1) })

  // Le bon de préparation : un filet, puis chaque article et ses options.
  const lignes = Array.isArray(c.lignes) ? c.lignes : []
  if (lignes.length > 0) {
    y += mm(1.5)
    elements.push({ type: 'filet', x1: g, x2: d, y, epaisseur: mm(0.3) })
    y += mm(1)
    for (const l of lignes) {
      bloc(l.article, STYLES.article)
      bloc(l.options, STYLES.options, { retrait: mm(STYLES.options.retraitMm) })
    }
  }

  // Le bas : le nombre d'articles, et le paiement (sur fond noir s'il reste dû).
  if (c.articles || c.paiement) {
    const s = STYLES.bas
    y += mm(2) + s.taille * s.interligne
    const base = y - s.taille * 0.25
    if (c.articles) texte(String(c.articles), s, g, base)
    if (c.paiement) {
      const fonte = police(s)
      if (c.aEncaisser) {
        const larg = mesurer(String(c.paiement), fonte) + mm(3.2)
        elements.push({ type: 'rect', x: d - larg, y: base - s.taille * 0.95, largeur: larg, hauteur: s.taille * 1.3 })
        texte(String(c.paiement), s, d - mm(1.6), base, { aligne: 'droite', couleur: '#fff' })
      } else {
        texte(String(c.paiement), s, d, base, { aligne: 'droite' })
      }
    }
  }

  // Le pied, toujours : le commerce à gauche, yoppaa en signature à droite.
  y += mm(1.5)
  elements.push({ type: 'filet', x1: g, x2: d, y, epaisseur: mm(0.3) })
  y += mm(1)
  const corps = mm(PIED_ETIQUETTE.corpsLogoMm)
  const prop = proportionsLogo(corps)
  const largeurLogo = largeurPoints(corps)
  const fonteMarque = `800 ${Math.round(corps * 100) / 100}px ${policeMarque}`
  const largeurMot = mesurer('yoppaa', fonteMarque) + LOGO.tracking * corps * 5
  const blocLogo = Math.max(largeurLogo, largeurMot)
  const xLogo = d - blocLogo
  const baseMot = y + corps * 0.95
  elements.push({ type: 'texte', texte: 'yoppaa', fonte: fonteMarque, x: xLogo + blocLogo / 2, y: baseMot, aligne: 'centre', espacement: LOGO.tracking * corps })
  let xp = xLogo + (blocLogo - largeurLogo) / 2
  // ⚠️ L'ÉCART DU LOGO SE COMPTE SOUS LES JAMBES DES « p », pas sous la ligne
  // de base (Alex, 12/10 : les points touchaient les lettres). Jakarta 800 a
  // des descendantes d'environ 22 % du corps : bas des jambes, puis l'écart
  // de la charte (`wordmarkToDots`), comme le pied de l'étiquette du navigateur.
  const yPoints = baseMot + corps * 0.22 + prop.wordmarkToDots
  for (const p of pointsLogo(corps)) {
    const r = p.diametre / 2
    elements.push({ type: 'point', x: xp + r, y: yPoints + p.decalage + r, r })
    xp += p.diametre + prop.dotGap
  }
  const basLogo = yPoints + prop.dotBase + prop.dotOffset
  if (c.commerce) {
    const s = STYLES.commerce
    const place = xLogo - g - mm(2)
    const [ligne] = couperTexte(String(c.commerce), place, mesurer, police(s), 1)
    texte(ligne, s, g, basLogo - mm(0.3))
  }
  y = basLogo + mm(IMAGE_ETIQUETTE.margeBasMm)

  return { largeur: L, hauteur: Math.ceil(y), elements }
}

/**
 * Pose une mise en page sur un canevas (fond blanc, tout en noir).
 * @param canvas un HTMLCanvasElement (navigateur ou vue de l'app)
 * @returns le canevas, à la bonne taille
 */
export function dessinerEtiquette(canvas, contenu, { policeMarque = POLICE } = {}) {
  const ctx = canvas.getContext('2d')
  const mesurer = (t, fonte) => { ctx.font = fonte; return ctx.measureText(t).width }
  const page = miseEnPageEtiquette(contenu, { mesurer, policeMarque })
  canvas.width = page.largeur
  canvas.height = page.hauteur
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, page.largeur, page.hauteur)
  for (const e of page.elements) {
    if (e.type === 'filet') { ctx.fillStyle = '#000'; ctx.fillRect(e.x1, e.y - e.epaisseur / 2, e.x2 - e.x1, e.epaisseur) }
    else if (e.type === 'rect') { ctx.fillStyle = '#000'; ctx.fillRect(e.x, e.y, e.largeur, e.hauteur) }
    else if (e.type === 'point') { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill() }
    else if (e.type === 'texte') {
      ctx.font = e.fonte
      ctx.fillStyle = e.couleur || '#000'
      ctx.textAlign = e.aligne === 'droite' ? 'right' : e.aligne === 'centre' ? 'center' : 'left'
      ctx.textBaseline = 'alphabetic'
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${e.espacement || 0}px`
      ctx.fillText(e.texte, e.x, e.y)
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
    }
  }
  return canvas
}

/** L'image en PNG, encodée en base64 (ce que l'extension Brother attend). */
export function etiquetteEnBase64(contenu, { document: doc = globalThis.document, policeMarque = POLICE } = {}) {
  const canvas = dessinerEtiquette(doc.createElement('canvas'), contenu, { policeMarque })
  return canvas.toDataURL('image/png').split(',')[1]
}
