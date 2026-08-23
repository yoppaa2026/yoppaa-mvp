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
 */
export async function construireAffiche({ qrDataUrl, nomCommerce = '', clair = true } = {}) {
  if (!qrDataUrl) return null

  const QR  = 820
  const PAD = 56
  const W   = QR + PAD * 2
  const P   = paletteAffiche(clair)

  // 110 px de corps : le mot occupe environ 39 % de la largeur. Assez pour être
  // la première chose vue en vitrine, sans écraser le QR, qui est ce qu'on
  // vient scanner.
  const WM = 110
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

  // Les hauteurs, empilées de haut en bas.
  const yWmBaseline = PAD + montee
  const yDots       = yWmBaseline + descente + L.wordmarkToDots
  const ySlogan     = yDots + L.dotBase + L.dotOffset + L.dotsToSlogan + L.sloganSize * 0.78
  const yFilet      = ySlogan + 34
  const yNom        = yFilet + 54
  const qrY         = yNom + 34
  const qrSz        = QR + 32
  const yAccroche1  = qrY + qrSz + 74
  const yAccroche2  = yAccroche1 + 62
  const yPied       = yAccroche2 + 54
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

  // ── Nom du commerce ──
  ctx.font = `700 ${taillePourTenir(nomCommerce, 42, 700)}px "DM Sans", Arial, sans-serif`
  ctx.fillStyle = P.nom
  ctx.fillText(nomCommerce, W / 2, yNom)

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
    taillePourTenir(TEXTES_AFFICHE.accroche, 54, 900),
    taillePourTenir(TEXTES_AFFICHE.accrocheSuite, 54, 900),
  )
  ctx.font = `900 ${tailleAccroche}px "DM Sans", Arial, sans-serif`
  ctx.fillStyle = P.accroche
  ctx.fillText(TEXTES_AFFICHE.accroche, W / 2, yAccroche1)
  ctx.fillText(TEXTES_AFFICHE.accrocheSuite, W / 2, yAccroche2)

  // ── Pied ──
  ctx.font = `600 ${taillePourTenir(TEXTES_AFFICHE.pied, 28, 600)}px "DM Sans", Arial, sans-serif`
  ctx.fillStyle = P.pied
  ctx.fillText(TEXTES_AFFICHE.pied, W / 2, yPied)

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

/** Télécharge l'affiche en PDF, au format demandé (A4 ou A5). */
export async function telechargerAffichePdf({ qrDataUrl, nomCommerce, clair, slug, format = 'A4' }) {
  const canvas = await construireAffiche({ qrDataUrl, nomCommerce, clair })
  if (!canvas) return false
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: format.toLowerCase() })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const [r, v, b] = fondPdf(clair)
  pdf.setFillColor(r, v, b)
  pdf.rect(0, 0, W, H, 'F')
  const imgW = format === 'A4' ? 184 : 130
  const imgH = imgW * (canvas.height / canvas.width)
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (W - imgW) / 2, (H - imgH) / 2, imgW, imgH)
  pdf.save(nomFichierAffiche(slug, clair, 'pdf', format))
  return true
}
