// L'AFFICHE DE VITRINE, dessinée une seule fois pour toute l'application.
//
// ⚠️ ELLE VIT ICI DEPUIS LE 23/08 PARCE QU'ALEX LA VOULAIT AUX DEUX ENDROITS :
// « il faut juste mettre le même visuel à télécharger dans le kit, pas le QR en
// solo comme maintenant ». La page du kit ne proposait que le QR nu, sans logo,
// sans nom de commerce et sans accroche — un carré noir et blanc qu'un
// commerçant colle tel quel en vitrine, et qui ne dit rien de ce qu'il est.
//
// ⚠️ ET SURTOUT : PAS DEUX AFFICHES. Recopier le canvas dans la page du kit
// aurait donné deux visuels destinés au même mur, qui divergeraient au premier
// réglage. C'est exactement ce qui venait d'arriver au logo, recopié entre le
// composant et ce canvas.
//
// ⚠️ CÔTÉ NAVIGATEUR UNIQUEMENT : `document.createElement('canvas')` et
// `Image` n'existent pas au rendu serveur. Les deux appelants sont des
// composants clients.

import { LOGO, proportionsLogo, pointsLogo, largeurPoints } from './logo'
import { BADGE_APP_STORE, BADGE_GOOGLE_PLAY } from './stores'

// ⚠️ LES BADGES DES STORES SOUS L'ACCROCHE (Alex, 14/10, sur le carton ET
// l'affiche). Les fichiers OFFICIELS de `lib/stores.js`, jamais redessinés :
// les règles de marque d'Apple et de Google l'interdisent. Même rapport de
// hauteurs que la landing (46 / 68) : le badge Google porte sa propre marge
// transparente, et à hauteur égale il paraîtrait plus petit.
export const BADGES_AFFICHE = [
  { ...BADGE_APP_STORE, hauteurPx: 92 },
  { ...BADGE_GOOGLE_PLAY, hauteurPx: 136 },
]

// Le nom du commerce trop long pour une ligne se coupe en DEUX lignes
// équilibrées, plutôt que de rétrécir jusqu'à l'illisible (Alex, 14/10 : le
// nom doit être la chose qu'on voit). Rend une ou deux lignes ; la coupe se
// fait sur l'espace qui laisse les deux moitiés les plus proches en longueur.
export function couperEnDeux(texte) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim()
  let meilleure = null
  for (let i = t.indexOf(' '); i !== -1; i = t.indexOf(' ', i + 1)) {
    const ecart = Math.abs(i - (t.length - i - 1))
    if (!meilleure || ecart < meilleure.ecart) meilleure = { i, ecart }
  }
  return meilleure ? [t.slice(0, meilleure.i), t.slice(meilleure.i + 1)] : [t]
}

// ⚠️ TEXTES GÉNÉRIQUES, PLUS AUCUNE DATE (Alex, 22/08). L'affiche annonçait
// « ON ARRIVE LE 1ER OCTOBRE » : imprimée en septembre et encore collée en
// vitrine en décembre, elle disait quelque chose de faux, et personne ne serait
// allé la décoller. Une affiche qu'on n'a pas à surveiller vaut mieux qu'une
// affiche d'actualité.
//
// ⚠️ ELLE DIT CE QUE LE SCAN APPORTE, pas ce que Yoppaa est : elle est lue par
// des gens qui ne connaissent pas la marque, debout devant une vitrine.
export const TEXTES_AFFICHE = {
  accroche: 'TOUS LES COMMERCES DE TA COMMUNE',
  accrocheSuite: 'DANS UNE SEULE APP',
  pied: 'yoppaa.app',
}

// ⚠️ LE CARTON DE TABLE (29/09) EST LA MÊME AFFICHE, AVEC D'AUTRES MOTS. Le
// client est assis : il n'a pas besoin qu'on lui vende l'application, il veut
// la carte. Même logo, même QR, même nom de commerce : un seul dessin, qui ne
// peut pas diverger de l'affiche de vitrine.
export const TEXTES_CARTE_TABLE = {
  accroche: 'SCANNE POUR',
  accrocheSuite: 'VOIR LA CARTE',
  pied: 'yoppaa.app',
}

// ⚠️ DEUX FONDS AU CHOIX, arbitrage d'Alex du 23/08 : le violet pour la
// vitrine, le blanc pour l'imprimante. Un aplat violet en A4 vide une cartouche
// par affiche ; ne proposer que celui-là revenait à choisir à sa place.
export function paletteAffiche(clair) {
  return clair
    ? { fond: '#FFFFFF', wm: ['#1A0840', '#6B35C4', '#9660E0'], slogan: '#6B35C4',
        filet: '#E2D8F4', nom: '#1A0840', accroche: '#1A0840', pied: '#9585AE', cadreQR: '#EEE9F7' }
    : { fond: '#201044', wm: ['#FFFFFF', '#C4A0F4', '#9660E0'], slogan: '#C4A0F4',
        filet: '#4B3178', nom: '#FFFFFF', accroche: '#FFFFFF', pied: '#A78FD0', cadreQR: null }
}

// Le fond du PDF suit celui de l'affiche : il était peint en violet EN DUR, si
// bien qu'un PDF choisi en blanc sortait cerné de violet sans aucun moyen de
// l'enlever.
export function fondPdf(clair) {
  return clair ? [255, 255, 255] : [32, 16, 68]
}

/** Le nom de fichier dit le fond : deux téléchargements ne s'écrasent pas. */
export function nomFichierAffiche(slug, clair, extension, format = null) {
  const bout = format ? `-${format}` : ''
  return `yoppaa-affiche-${slug}${bout}-${clair ? 'blanc' : 'violet'}.${extension}`
}

/**
 * Dessine l'affiche complète et rend le canvas.
 *
 * @param {object} o
 * @param {string} o.qrDataUrl  le QR déjà généré, en data URL
 * @param {string} o.nomCommerce
 * @param {boolean} o.clair     fond blanc (true) ou violet uni (false)
 * @param {object} [o.textes]   l'accroche et le pied ; l'affiche de vitrine par défaut
 */
export async function construireAffiche({ qrDataUrl, nomCommerce = '', clair = true, textes = TEXTES_AFFICHE } = {}) {
  if (!qrDataUrl) return null

  const QR  = 820
  const PAD = 56
  const W   = QR + PAD * 2
  const P   = paletteAffiche(clair)

  // ⚠️ 72 px DE CORPS, PLUS 110 (Alex, 14/10 : « le logo Yoppaa un peu
  // réduit »). La première chose vue doit être le NOM DU COMMERCE : c'est chez
  // lui qu'on est assis, pas chez nous. Le logo signe, il ne titre plus.
  const WM = 72
  const L  = proportionsLogo(WM)

  const canvas = document.createElement('canvas')
  const mesure = canvas.getContext('2d')
  const police = (poids, taille) => `${poids} ${taille}px "Plus Jakarta Sans", system-ui, Arial, sans-serif`

  // ⚠️ LA DESCENDANTE SE MESURE, ELLE NE SE DEVINE PAS. Le composant place les
  // points à 0,28 em sous la BOÎTE DE LIGNE ; en canvas, `fillText` pose la
  // BASELINE. Sans cette mesure, l'écart dépendait de la police réellement
  // chargée et changeait d'un poste à l'autre.
  mesure.font = police(800, WM)
  const m = mesure.measureText('yoppaa')
  const descente = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || WM * 0.24
  const montee = m.fontBoundingBoxAscent || WM * 0.78

  // ⚠️ 🔴 AUCUN TEXTE N'ÉTAIT CONTRAINT À LA LARGEUR, et `fillText` ne replie ni
  // ne rétrécit : il déborde, et le canvas coupe. « TOUS LES COMMERCES DE TA
  // COMMUNE » en 54 px mesure plus large que la page : centrée, elle se faisait
  // rogner DES DEUX CÔTÉS et sortait « US LES COMMERCES DE TA COMMU ».
  //
  // ⚠️ ET CE N'ÉTAIT PAS QUE L'ACCROCHE : le nom du commerce, le slogan et le
  // pied avaient le même défaut, silencieux tant que les textes restaient
  // courts. « La Boulangerie du Coin de la Rue » aurait été tronquée pareil.
  //
  // La taille demandée est un MAXIMUM : on la réduit jusqu'à ce que le texte
  // tienne, plutôt que de le couper.
  const LARGEUR_UTILE = W - PAD * 2
  const taillePourTenir = (texte, taille, poids, famille = 'DM Sans') => {
    let t = taille
    const mesurer = (px) => {
      mesure.font = `${poids} ${px}px "${famille}", Arial, sans-serif`
      return mesure.measureText(String(texte || '')).width
    }
    while (t > 12 && mesurer(t) > LARGEUR_UTILE) t -= 1
    return t
  }

  // ── Le nom du commerce, EN GRAND (Alex, 14/10) ──
  //
  // 84 px au plus, en Jakarta 800 comme les titres de l'app. Sous 60 px sur
  // une ligne, il passe sur DEUX lignes équilibrées : « La Boulangerie du Coin
  // de la Rue » reste grande au lieu de devenir une ligne de légende.
  const NOM_MAX = 84
  const NOM_MINI_UNE_LIGNE = 60
  let lignesNom = [String(nomCommerce || '')]
  let tailleNom = taillePourTenir(lignesNom[0], NOM_MAX, 800, 'Plus Jakarta Sans')
  if (tailleNom < NOM_MINI_UNE_LIGNE) {
    const deux = couperEnDeux(nomCommerce)
    if (deux.length === 2) {
      lignesNom = deux
      tailleNom = Math.min(...deux.map(l => taillePourTenir(l, NOM_MAX, 800, 'Plus Jakarta Sans')))
    }
  }

  // ── Les badges, chargés AVANT la mise en page ──
  //
  // ⚠️ UN BADGE QUI NE SE CHARGE PAS NE LAISSE PAS UN TROU : sans les deux, la
  // rangée n'est pas prévue du tout, et l'affiche sort comme avant. Ce sont des
  // fichiers du site lui-même : l'échec est improbable, mais un blanc au milieu
  // d'un papier se verrait.
  const chargerImage = (src) => new Promise(resolve => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
  const imagesBadges = await Promise.all(BADGES_AFFICHE.map(b => chargerImage(b.src)))
  const badges = imagesBadges.every(Boolean)
    ? BADGES_AFFICHE.map((b, i) => ({ img: imagesBadges[i], h: b.hauteurPx, w: Math.round(b.hauteurPx * b.largeur / b.hauteur) }))
    : null
  const hauteurBadges = badges ? Math.max(...badges.map(b => b.h)) : 0
  const ECART_BADGES = 14

  // Les hauteurs, empilées de haut en bas.
  const yWmBaseline = PAD + montee
  const yDots       = yWmBaseline + descente + L.wordmarkToDots
  const ySlogan     = yDots + L.dotBase + L.dotOffset + L.dotsToSlogan + L.sloganSize * 0.78
  const yFilet      = ySlogan + 30
  // La ligne de BASE de chaque ligne du nom (`fillText` pose la baseline).
  const yNoms       = lignesNom.map((_, i) => yFilet + 34 + tailleNom * 0.8 + i * tailleNom * 1.06)
  const qrY         = yNoms[yNoms.length - 1] + tailleNom * 0.22 + 34
  const qrSz        = QR + 32
  const yAccroche1  = qrY + qrSz + 74
  const yAccroche2  = yAccroche1 + 62
  const yBadges     = yAccroche2 + 36
  const yPied       = badges ? yBadges + hauteurBadges + 48 : yAccroche2 + 54
  const H           = yPied + PAD

  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')

  // ── Fond UNI ──
  //
  // ⚠️ PLUS UN SEUL DÉGRADÉ (Alex, 22/08 : « cela pose problème à
  // l'impression »). Il y en avait CINQ : le fond, un halo radial derrière le
  // QR, deux filets décoratifs et le texte de l'accroche lui-même. Une
  // imprimante de commerce rend ces transitions en bandes.
  ctx.fillStyle = P.fond
  ctx.fillRect(0, 0, W, H)

  // ── Wordmark : trois paires de couleurs, mesurées une à une pour garder le
  //    tracking -0,05 em du fichier de marque. ──
  ctx.textAlign = 'left'
  try { ctx.letterSpacing = `${L.tracking}px` } catch { /* Safari < 17 */ }
  ctx.font = police(800, WM)
  const segments = [['yo', P.wm[0]], ['pp', P.wm[1]], ['aa', P.wm[2]]]
  const largeurWm = segments.reduce((w, [t]) => w + ctx.measureText(t).width, 0)
  let wx = W / 2 - largeurWm / 2
  for (const [txt, couleur] of segments) {
    ctx.fillStyle = couleur
    ctx.fillText(txt, wx, yWmBaseline)
    wx += ctx.measureText(txt).width
  }
  try { ctx.letterSpacing = '0px' } catch { /* idem */ }

  // ── Les cinq points V2-B, avec LEUR décalage : il porte sur les points 2, 3
  //    et 4, et c'est lui qui creuse le sourire. ──
  let dx = W / 2 - largeurPoints(WM) / 2
  pointsLogo(WM).forEach((p, i) => {
    const r = p.diametre / 2
    ctx.beginPath()
    ctx.arc(dx + r, yDots + p.decalage + r, r, 0, Math.PI * 2)
    ctx.fillStyle = P.wm[i < 1 ? 0 : i < 3 ? 1 : 2]
    ctx.fill()
    dx += p.diametre + L.dotGap
  })

  // ── Slogan ──
  ctx.textAlign = 'center'
  ctx.font = police(600, taillePourTenir(LOGO.slogan, Math.round(L.sloganSize), 600, 'Plus Jakarta Sans'))
  ctx.fillStyle = P.slogan
  ctx.fillText(LOGO.slogan, W / 2, ySlogan)

  // ── Filet plein ──
  ctx.strokeStyle = P.filet; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(PAD * 2, yFilet); ctx.lineTo(W - PAD * 2, yFilet); ctx.stroke()

  // ── Nom du commerce, la plus grande chose de l'affiche après le QR ──
  ctx.font = police(800, tailleNom)
  try { ctx.letterSpacing = `${-0.02 * tailleNom}px` } catch { /* Safari < 17 */ }
  ctx.fillStyle = P.nom
  lignesNom.forEach((ligne, i) => ctx.fillText(ligne, W / 2, yNoms[i]))
  try { ctx.letterSpacing = '0px' } catch { /* idem */ }

  // ── Cadre du QR, sans ombre portée ──
  //
  // ⚠️ 🔴 IL ÉTAIT DÉCENTRÉ DE 32 PIXELS, et c'est arithmétique : le cadre
  // mesure `QR + 32` mais était posé à `PAD`, si bien qu'il restait 56 px à
  // gauche et 24 à droite. On centre sur la largeur.
  const qrX = Math.round((W - qrSz) / 2)
  const rr = 28
  const cadre = () => {
    ctx.beginPath()
    ctx.moveTo(qrX + rr, qrY)
    ctx.lineTo(qrX + qrSz - rr, qrY)
    ctx.quadraticCurveTo(qrX + qrSz, qrY, qrX + qrSz, qrY + rr)
    ctx.lineTo(qrX + qrSz, qrY + qrSz - rr)
    ctx.quadraticCurveTo(qrX + qrSz, qrY + qrSz, qrX + qrSz - rr, qrY + qrSz)
    ctx.lineTo(qrX + rr, qrY + qrSz)
    ctx.quadraticCurveTo(qrX, qrY + qrSz, qrX, qrY + qrSz - rr)
    ctx.lineTo(qrX, qrY + rr)
    ctx.quadraticCurveTo(qrX, qrY, qrX + rr, qrY)
    ctx.closePath()
  }
  // ⚠️ LE QR RESTE NOIR SUR BLANC quel que soit le fond : c'est la seule façon
  // de garantir qu'un téléphone le lise du premier coup.
  ctx.fillStyle = '#FFFFFF'; cadre(); ctx.fill()
  if (P.cadreQR) { ctx.strokeStyle = P.cadreQR; ctx.lineWidth = 1.5; cadre(); ctx.stroke() }

  const qrImg = new window.Image()
  await new Promise(resolve => { qrImg.onload = resolve; qrImg.src = qrDataUrl })
  ctx.drawImage(qrImg, qrX + 16, qrY + 16, QR, QR)

  // ── L'accroche, sur deux lignes, en aplat ──
  //
  // ⚠️ LES DEUX LIGNES PARTAGENT UNE SEULE TAILLE, celle de la plus longue :
  // réglées séparément, une même phrase sortirait en deux corps différents.
  const tailleAccroche = Math.min(
    taillePourTenir(textes.accroche, 54, 900),
    taillePourTenir(textes.accrocheSuite, 54, 900),
  )
  ctx.font = `900 ${tailleAccroche}px "DM Sans", Arial, sans-serif`
  ctx.fillStyle = P.accroche
  ctx.fillText(textes.accroche, W / 2, yAccroche1)
  ctx.fillText(textes.accrocheSuite, W / 2, yAccroche2)

  // ── Les badges des stores, côte à côte, centrés verticalement sur la rangée ──
  if (badges) {
    const largeurRangee = badges.reduce((w, b) => w + b.w, 0) + ECART_BADGES * (badges.length - 1)
    let bx = Math.round((W - largeurRangee) / 2)
    for (const b of badges) {
      ctx.drawImage(b.img, bx, yBadges + (hauteurBadges - b.h) / 2, b.w, b.h)
      bx += b.w + ECART_BADGES
    }
  }

  // ── Pied ──
  ctx.font = `600 ${taillePourTenir(textes.pied, 28, 600)}px "DM Sans", Arial, sans-serif`
  ctx.fillStyle = P.pied
  ctx.fillText(textes.pied, W / 2, yPied)

  return canvas
}

/**
 * Télécharge l'affiche en PNG.
 * ⚠️ Rend `false` si le QR n'est pas prêt, pour que l'appelant puisse le dire
 * plutôt que de laisser le bouton ne rien faire.
 */
export async function telechargerAffichePng({ qrDataUrl, nomCommerce, clair, slug }) {
  const canvas = await construireAffiche({ qrDataUrl, nomCommerce, clair })
  if (!canvas) return false
  const a = document.createElement('a')
  a.download = nomFichierAffiche(slug, clair, 'png')
  a.href = canvas.toDataURL('image/png')
  a.click()
  return true
}

// ─── LA FEUILLE : UN OU PLUSIEURS EXEMPLAIRES SUR UNE A4 (12/10) ────────────
//
// 🔴 DEMANDE D'ALEX (12/10) : l'affiche en A4 pleine page, en deux A5 sur une
// A4, et en petit format sur une A4 ; les cartons de table en deux A5, quatre
// et huit sur une A4, avec des pointillés pour la découpe à la trancheuse.
// Toujours de l'A4 : c'est ce que prend l'imprimante d'un commerce.
//
// ⚠️ HUIT ET PAS SIX POUR LE PETIT FORMAT, ET C'EST UN CALCUL : l'affiche est
// 1,6 fois plus haute que large, donc sur une A4 c'est la HAUTEUR qui limite.
// Six (3 × 2) ou huit (4 × 2) en paysage sortent à la même taille (≈ 58 mm de
// large) : le huit en donne deux de plus pour rien.
//
// ⚠️ L'ORIENTATION EST CELLE QUI DONNE LE PLUS GRAND EXEMPLAIRE. Deux A5 sur
// une A4, c'est une A4 couchée coupée en deux : chaque moitié est une A5
// debout. Huit, c'est 4 × 2 couchée (58 mm) plutôt que 2 × 4 debout (38 mm).
export const FORMATS_FEUILLE = {
  'A4':   { orientation: 'portrait',  colonnes: 1, lignes: 1, marge: 10 },
  'A4-2': { orientation: 'landscape', colonnes: 2, lignes: 1, marge: 10 },
  'A4-4': { orientation: 'portrait',  colonnes: 2, lignes: 2, marge: 8 },
  'A4-8': { orientation: 'landscape', colonnes: 4, lignes: 2, marge: 6 },
}
/** Les formats de l'affiche de vitrine, dans l'ordre des boutons. */
export const FORMATS_AFFICHE = ['A4', 'A4-2', 'A4-8']
/** Les formats des cartons de table, dans l'ordre des boutons. */
export const FORMATS_CARTE_TABLE = ['A4-2', 'A4-4', 'A4-8']
// Les mots des boutons, ICI pour que le tableau de bord et la page du kit
// disent la même chose.
export const LIBELLES_AFFICHE = { 'A4': 'A4 pleine page', 'A4-2': 'A4, 2 affiches A5', 'A4-8': 'A4, 8 petites' }
export const LIBELLES_CARTE_TABLE = { 'A4-2': 'A4, 2 cartons A5', 'A4-4': 'A4, 4 cartons', 'A4-8': 'A4, 8 cartons' }

/**
 * Où poser chaque exemplaire sur la page, en millimètres.
 *
 * ⚠️ L'IMAGE TIENT DANS SA CASE DANS LES DEUX SENS, marge comprise : calculée
 * sur la seule largeur, elle déborderait sur l'exemplaire du dessous (l'A4
 * pleine page débordait de 0,4 mm en haut et en bas, à 184 mm de large).
 *
 * @param {string} format  une clé de `FORMATS_FEUILLE`
 * @param {number} W       largeur de la page (orientation comprise)
 * @param {number} H       hauteur de la page
 * @param {number} ratio   hauteur / largeur de l'image
 * @returns {{ x, y, w, h, caseW, caseH }[] | null}
 */
export function placementsFeuille(format, W, H, ratio) {
  const gabarit = FORMATS_FEUILLE[format]
  if (!gabarit || !(ratio > 0) || !(W > 0) || !(H > 0)) return null
  const caseW = W / gabarit.colonnes
  const caseH = H / gabarit.lignes
  const w = Math.min(caseW - gabarit.marge * 2, (caseH - gabarit.marge * 2) / ratio)
  const h = w * ratio
  const cases = []
  for (let l = 0; l < gabarit.lignes; l++) {
    for (let c = 0; c < gabarit.colonnes; c++) {
      cases.push({ x: c * caseW + (caseW - w) / 2, y: l * caseH + (caseH - h) / 2, w, h, caseW, caseH })
    }
  }
  return cases
}

/**
 * Les traits de coupe : [{ x1, y1, x2, y2 }], d'un BORD de la page à l'autre.
 * ⚠️ D'UN BORD À L'AUTRE, ET C'EST POUR LA TRANCHEUSE : la lame coupe toute la
 * feuille d'un coup, le trait doit donc la traverser entièrement pour qu'on
 * l'aligne sur le guide. Une seule case : rien à couper, aucun trait.
 */
export function traitsDeCoupe(format, W, H) {
  const gabarit = FORMATS_FEUILLE[format]
  if (!gabarit) return []
  const traits = []
  for (let c = 1; c < gabarit.colonnes; c++) traits.push({ x1: c * W / gabarit.colonnes, y1: 0, x2: c * W / gabarit.colonnes, y2: H })
  for (let l = 1; l < gabarit.lignes; l++) traits.push({ x1: 0, y1: l * H / gabarit.lignes, x2: W, y2: l * H / gabarit.lignes })
  return traits
}

// Le PDF d'une feuille : le fond, les exemplaires, les pointillés.
async function feuillePdf(canvas, format, clair) {
  const gabarit = FORMATS_FEUILLE[format]
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: gabarit.orientation, unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const [r, v, b] = fondPdf(clair)
  pdf.setFillColor(r, v, b)
  pdf.rect(0, 0, W, H, 'F')

  const cases = placementsFeuille(format, W, H, canvas.height / canvas.width)
  if (!cases) return null
  const image = canvas.toDataURL('image/png')
  for (const p of cases) pdf.addImage(image, 'PNG', p.x, p.y, p.w, p.h)

  // Les pointillés, discrets, seulement quand il y a quelque chose à couper.
  const traits = traitsDeCoupe(format, W, H)
  if (traits.length > 0) {
    pdf.setDrawColor(clair ? 200 : 90, clair ? 190 : 70, clair ? 220 : 130)
    pdf.setLineWidth(0.2)
    pdf.setLineDashPattern([2, 2], 0)
    for (const t of traits) pdf.line(t.x1, t.y1, t.x2, t.y2)
  }
  return pdf
}

/** Télécharge l'affiche en PDF, au format demandé (`FORMATS_AFFICHE`). */
export async function telechargerAffichePdf({ qrDataUrl, nomCommerce, clair, slug, format = 'A4' }) {
  if (!FORMATS_AFFICHE.includes(format)) return false
  const canvas = await construireAffiche({ qrDataUrl, nomCommerce, clair })
  if (!canvas) return false
  const pdf = await feuillePdf(canvas, format, clair)
  if (!pdf) return false
  pdf.save(nomFichierAffiche(slug, clair, 'pdf', format))
  return true
}

// ─── LE CARTON DE TABLE ─────────────────────────────────────────────────────

/** Le nom du fichier dit ce que c'est, le format et le fond. */
export function nomFichierCarteTable(slug, clair, format) {
  return `yoppaa-carte-table-${slug}-${format}-${clair ? 'blanc' : 'violet'}.pdf`
}

/**
 * Télécharge les cartons de table en PDF.
 *
 * ⚠️ LE QR DOIT MENER À LA CARTE (`lienCarte`), PAS À LA FICHE : c'est à
 * l'appelant de le générer avec la bonne adresse. Rend `false` si le QR
 * n'est pas prêt, pour que l'écran le dise.
 */
export async function telechargerCarteTablePdf({ qrDataUrl, nomCommerce, clair, slug, format = 'A4-4' }) {
  if (!FORMATS_CARTE_TABLE.includes(format)) return false
  const canvas = await construireAffiche({ qrDataUrl, nomCommerce, clair, textes: TEXTES_CARTE_TABLE })
  if (!canvas) return false
  const pdf = await feuillePdf(canvas, format, clair)
  if (!pdf) return false
  pdf.save(nomFichierCarteTable(slug, clair, format))
  return true
}
