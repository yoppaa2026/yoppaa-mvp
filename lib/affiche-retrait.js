// L'AFFICHE DU POINT DE RETRAIT (16/10 soir).
//
// ✅ ALEX, 16/10 soir : une fiche A4 et 2 × A5 qui indique OÙ se retirent les
// commandes Yoppaa (« la gauche du comptoir »), qui se DÉMARQUE des affiches
// QR du kit. Choix au tableau puis sur maquettes
// (https://claude.ai/artifact/HVJffXNdHjqp7ahwqfKU5F) :
//   • le BANDEAU (1 B) : un bloc de couleur sur un tiers de la largeur, du
//     côté où pointe la flèche, et la flèche dedans ;
//   • la flèche en POINTS YOPPAA (« plus dynamique, plus fun, plus yoppaa ») ;
//   • flèche au choix + phrase libre, A4 paysage + 2 A5 paysage, les deux
//     fonds du kit ;
//   • sans le filigrane des points (deux rangées de points, l'œil ne savait
//     plus laquelle suivre), l'intitulé plus gros (7 → 9 mm) ;
//   • la consigne, mot pour mot : « Donne ton numéro de commande et ton
//     prénom pour le retrait. »
//
// ✅ ET UN QR + LES BADGES DES STORES (Alex, 17/10, tableau). L'affiche est lue
// par la FILE D'ATTENTE : ceux qu'on veut convertir. Le QR ouvre la fiche de CE
// commerce (`lienFiche`, comme l'affiche de vitrine) : on commande ici, la
// prochaine fois, sans faire la file. Tout reste DANS LE BLOC, sous la flèche :
// la flèche se voit d'abord, le côté texte ne bouge pas.
//
// ⚠️ DEUX MOITIÉS. `planAfficheRetrait` est PURE : elle rend la liste de ce
// qu'il faut dessiner, en millimètres, sur une A4 paysage (297 × 210). Le banc
// l'exécute avec une mesure de texte factice et vérifie que rien ne déborde.
// `construireAfficheRetrait` (navigateur seulement) l'exécute sur un canvas.

import { proportionsLogo, pointsLogo, largeurPoints } from './logo.js'
import { BADGE_APP_STORE, BADGE_GOOGLE_PLAY, tailleBadge } from './stores.js'

export const PAGE_RETRAIT = { largeur: 297, hauteur: 210 }
const NBSP = ' '

// ⚠️ L'INTITULÉ SUR DEUX LIGNES (Alex, 16/10 soir : « augmente légèrement la
// taille, c'est quand même important comme message »). Sur une ligne, il ne
// tenait qu'à 7,6 mm dans la largeur du texte ; sur deux, il monte à 11.
export const TEXTES_RETRAIT = {
  intitule: ['RETRAIT DES COMMANDES', 'YOPPAA'],
  consigne: 'Donne ton numéro de commande et ton prénom pour le retrait.',
  pastille: `Sans faire la file${NBSP}!`,
  legendeQr: `Pas encore sur Yoppaa${NBSP}?`,
}
// Le QR et les badges, dans le bloc. Les badges : les fichiers OFFICIELS, à la
// même hauteur VISIBLE (lib/stores.js), jamais redessinés.
export const QR_RETRAIT = { carte: 54, marge: 4 }
export const BADGES_RETRAIT = [BADGE_APP_STORE, BADGE_GOOGLE_PLAY]
export const HAUTEUR_BADGES_RETRAIT = 9

// Le sens de la flèche. Le titre suit : « C'est par là ! », « C'est ici ! »,
// « Tout droit ! ». `angle` : rotation de la flèche dessinée vers la droite.
export const SENS_RETRAIT = [
  { id: 'gauche', libelle: 'À gauche', angle: 180, titre: ['C’est', `par là${NBSP}!`] },
  { id: 'droite', libelle: 'À droite', angle: 0, titre: ['C’est', `par là${NBSP}!`] },
  { id: 'ici', libelle: 'Ici (en bas)', angle: 90, titre: ['C’est', `ici${NBSP}!`] },
  { id: 'droit', libelle: 'Tout droit', angle: -90, titre: ['Tout', `droit${NBSP}!`] },
]
export const SENS_PAR_DEFAUT = 'gauche'
export function sensRetrait(id) {
  return SENS_RETRAIT.find(s => s.id === id) || SENS_RETRAIT.find(s => s.id === SENS_PAR_DEFAUT)
}

// La phrase du commerçant : facultative, une ligne de pensée, pas un roman.
export const PHRASE_MAX = 48
// ⚠️ UNE PHRASE TROP LONGUE SE COUPE AU DERNIER MOT ENTIER, jamais au milieu
// (« derrière le présento », vu au rendu le 16/10).
export function nettoyerPhrase(texte) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim()
  if (t.length <= PHRASE_MAX) return t
  const coupe = t.slice(0, PHRASE_MAX + 1)
  const espace = coupe.lastIndexOf(' ')
  return (espace > 0 ? coupe.slice(0, espace) : t.slice(0, PHRASE_MAX)).replace(/[\s,;:–-]+$/, '')
}

// Les deux fonds du kit (`paletteAffiche` de lib/affiche-kit.js). `wm` : les
// trois couleurs du logo ; `blocWm` : celles de la flèche, en contraste sur le bloc.
export function paletteRetrait(clair) {
  return clair
    ? { fond: '#FFFFFF', titre: '#1A0840', accent: '#6B35C4', texte: '#3A2A60', filet: '#E2D8F4',
        wm: ['#1A0840', '#6B35C4', '#9660E0'], bloc: '#6B35C4', blocWm: ['#FFFFFF', '#E7DCFA', '#C4A0F4'],
        pastille: '#6B35C4', pastilleTexte: '#FFFFFF' }
    : { fond: '#201044', titre: '#FFFFFF', accent: '#C4A0F4', texte: '#E7DCFA', filet: '#4B3178',
        wm: ['#FFFFFF', '#C4A0F4', '#9660E0'], bloc: '#C4A0F4', blocWm: ['#201044', '#6B35C4', '#9660E0'],
        pastille: '#C4A0F4', pastilleTexte: '#201044' }
}

// ─── LA FLÈCHE EN POINTS YOPPAA ─────────────────────────────────────────────
// Repère 100 × 100, flèche vers la droite. La tige : des points qui grossissent
// vers la pointe (la vitesse). La tête : un chevron de gros points. Les couleurs
// du logo, claire à la traîne (rang 2), forte à la pointe (rang 0).
export const POINTS_FLECHE = [
  { x: 9, y: 50, r: 3.4, rang: 2 }, { x: 22, y: 50, r: 4.6, rang: 2 },
  { x: 37, y: 50, r: 5.8, rang: 1 }, { x: 54, y: 50, r: 7, rang: 1 },
  { x: 61, y: 19, r: 6.4, rang: 1 }, { x: 75, y: 34, r: 7.4, rang: 0 },
  { x: 61, y: 81, r: 6.4, rang: 1 }, { x: 75, y: 66, r: 7.4, rang: 0 },
  { x: 89, y: 50, r: 8.6, rang: 0 },
]
// Les points tournés autour du centre de leur boîte, posés et mis à l'échelle.
export function pointsFlecheTournes(angle, x, y, taille) {
  const a = (Number(angle) || 0) * Math.PI / 180
  const k = taille / 100
  return POINTS_FLECHE.map(p => {
    const dx = p.x - 50, dy = p.y - 50
    return {
      x: x + (50 + dx * Math.cos(a) - dy * Math.sin(a)) * k,
      y: y + (50 + dx * Math.sin(a) + dy * Math.cos(a)) * k,
      r: p.r * k,
      rang: p.rang,
    }
  })
}

// Coupe un texte en lignes qui tiennent dans `largeur`, selon `mesurer`.
export function couperLignes(texte, largeur, mesurer, maxLignes = 2) {
  const mots = String(texte || '').trim().split(/\s+/).filter(Boolean)
  const lignes = []
  let l = ''
  for (const m of mots) {
    const essai = l ? `${l} ${m}` : m
    if (l && mesurer(essai) > largeur) { lignes.push(l); l = m } else l = essai
  }
  if (l) lignes.push(l)
  return lignes.slice(0, maxLignes)
}

/**
 * Ce qu'il faut dessiner, en millimètres, sur une A4 paysage.
 *
 * @param o.mesurer (texte, taille, poids, famille) => largeur en mm. Le
 *                  canvas mesure pour de vrai, le banc avec une estimation.
 * @returns { operations: [...], zoneTexte: { x, largeur } }
 *   { type: 'rect', x, y, w, h, couleur }
 *   { type: 'point', x, y, r, couleur }
 *   { type: 'texte', x, y, texte, taille, poids, famille, couleur, aligne, espacement, role }
 *   { type: 'pastille', x, y, w, h, angle, couleur, texte, taille, couleurTexte }
 *   { type: 'trait', x1, y1, x2, y2, couleur, epaisseur }
 *   { type: 'logo', xFin, y, corps }   (le wordmark et ses cinq points)
 */
export function planAfficheRetrait({ sens = SENS_PAR_DEFAUT, phrase = '', clair = true, nomCommerce = '', mesurer } = {}) {
  const P = paletteRetrait(clair)
  const S = sensRetrait(sens)
  const aDroite = S.id === 'droite'
  const { largeur: W, hauteur: H } = PAGE_RETRAIT
  const BLOC = 100
  const xBloc = aDroite ? W - BLOC : 0
  const xT = aDroite ? 20 : BLOC + 18
  const LARGEUR_T = W - BLOC - 18 - 22
  const DM = 'DM Sans'
  const mesure = (t, taille, poids, famille = DM) => (typeof mesurer === 'function' ? mesurer(t, taille, poids, famille) : String(t).length * taille * 0.56)
  // La taille demandée est un MAXIMUM : on réduit jusqu'à ce que ça tienne.
  const tenir = (t, max, poids, largeur = LARGEUR_T, famille = DM) => {
    let s = max
    while (s > 3 && mesure(t, s, poids, famille) > largeur) s -= 0.25
    return s
  }

  const ops = []
  ops.push({ type: 'rect', x: 0, y: 0, w: W, h: H, couleur: P.fond })
  ops.push({ type: 'rect', x: xBloc, y: 0, w: BLOC, h: H, couleur: P.bloc })
  for (const p of pointsFlecheTournes(S.angle, xBloc + 12, 12, 76)) {
    ops.push({ type: 'point', x: p.x, y: p.y, r: p.r, couleur: P.blocWm[p.rang] })
  }
  // Sous la flèche : la légende, le QR, les badges, centrés dans le bloc.
  const centreBloc = xBloc + BLOC / 2
  ops.push({ type: 'texte', role: 'legende-qr', x: centreBloc, y: 109, texte: TEXTES_RETRAIT.legendeQr,
    taille: tenir(TEXTES_RETRAIT.legendeQr, 6.5, 800, BLOC - 12), poids: 800, famille: DM, couleur: P.blocWm[0], aligne: 'center' })
  ops.push({ type: 'qr', x: centreBloc - QR_RETRAIT.carte / 2, y: 115, cote: QR_RETRAIT.carte, marge: QR_RETRAIT.marge })
  const tailles = BADGES_RETRAIT.map(b => tailleBadge(b, HAUTEUR_BADGES_RETRAIT))
  const ECART = 3
  const largeurBadges = tailles.reduce((w, t) => w + t.largeur, 0) + ECART * (tailles.length - 1)
  let xB = centreBloc - largeurBadges / 2
  ops.push({ type: 'badges', y: 176, hauteur: HAUTEUR_BADGES_RETRAIT, badges: BADGES_RETRAIT.map((b, i) => {
    const place = { badge: b, x: xB, largeur: tailles[i].largeur }
    xB += tailles[i].largeur + ECART
    return place
  }) })

  // La pastille, penchée comme un autocollant, au-dessus du texte.
  ops.push({ type: 'pastille', x: aDroite ? 100 : 206, y: 16, w: 70, h: 17, angle: -7,
    couleur: P.pastille, texte: TEXTES_RETRAIT.pastille, taille: 7, couleurTexte: P.pastilleTexte })

  // L'intitulé : il dit POUR QUOI on va par là. Deux lignes, une seule taille
  // (11 mm au plus), la plus grande que les deux permettent.
  const [int1, int2] = TEXTES_RETRAIT.intitule
  const tIntitule = Math.min(tenir(int1, 11, 800), tenir(int2, 11, 800))
  ops.push({ type: 'texte', role: 'intitule', x: xT, y: 47, texte: int1, taille: tIntitule, poids: 800, famille: DM, couleur: P.accent, espacement: 0.03 })
  ops.push({ type: 'texte', role: 'intitule', x: xT, y: 47 + tIntitule * 1.12, texte: int2, taille: tIntitule, poids: 800, famille: DM, couleur: P.accent, espacement: 0.03 })
  // Le titre, sur deux lignes, la seconde en couleur.
  const tTitre = Math.min(tenir(S.titre[0], 27, 900), tenir(S.titre[1], 27, 900))
  ops.push({ type: 'texte', role: 'titre', x: xT, y: 89, texte: S.titre[0], taille: tTitre, poids: 900, famille: DM, couleur: P.titre, espacement: -0.03 })
  ops.push({ type: 'texte', role: 'titre', x: xT, y: 116, texte: S.titre[1], taille: tTitre, poids: 900, famille: DM, couleur: P.accent, espacement: -0.03 })

  // ⚠️ LA PHRASE S'AFFICHE EN ENTIER, TOUJOURS (banc, 16/10) : coupée à deux
  // lignes, « … derrière la vitrine » perdait son dernier mot sans rien dire.
  // C'est la TAILLE qui cède, jusqu'à ce que la phrase tienne en deux lignes.
  let y = 137
  const texteP = nettoyerPhrase(phrase)
  let tPhrase = 11.5
  let lignesPhrase = couperLignes(texteP, LARGEUR_T, t => mesure(t, tPhrase, 700), 99)
  while (lignesPhrase.length > 2 && tPhrase > 6) {
    tPhrase -= 0.25
    lignesPhrase = couperLignes(texteP, LARGEUR_T, t => mesure(t, tPhrase, 700), 99)
  }
  for (const l of lignesPhrase) {
    ops.push({ type: 'texte', role: 'phrase', x: xT, y, texte: l, taille: tenir(l, tPhrase, 700), poids: 700, famille: DM, couleur: P.titre })
    y += tPhrase * 1.17
  }
  for (const l of couperLignes(TEXTES_RETRAIT.consigne, LARGEUR_T * 0.82, t => mesure(t, 6, 500))) {
    ops.push({ type: 'texte', role: 'consigne', x: xT, y: y + 2, texte: l, taille: 6, poids: 500, famille: DM, couleur: P.texte })
    y += 7.5
  }

  // Le pied : le commerce à gauche, le logo à droite, un filet au-dessus.
  // ⚠️ RIEN SOUS 205 mm : une imprimante de bureau ne marque pas les 4 ou
  // 5 derniers millimètres, et le logo y perdrait ses points.
  ops.push({ type: 'trait', x1: xT, y1: 179, x2: xT + LARGEUR_T, y2: 179, couleur: P.filet, epaisseur: 0.4 })
  const nom = String(nomCommerce || '').trim()
  if (nom) ops.push({ type: 'texte', role: 'commerce', x: xT, y: 192, texte: nom, taille: tenir(nom, 6.6, 700, LARGEUR_T - 45), poids: 700, famille: DM, couleur: P.titre })
  ops.push({ type: 'logo', xFin: xT + LARGEUR_T, y: 193, corps: 11, couleurs: P.wm })

  return { operations: ops, zoneTexte: { x: xT, largeur: LARGEUR_T }, bloc: { x: xBloc, largeur: BLOC } }
}

// ─── LES FORMATS ────────────────────────────────────────────────────────────
// Toujours une A4 : c'est ce que prend l'imprimante d'un commerce. Deux A5
// paysage = une A4 debout coupée en deux, l'une au-dessus de l'autre.
export const FORMATS_RETRAIT = ['A4-paysage', 'A4-2-paysage']
export const LIBELLES_RETRAIT = { 'A4-paysage': 'A4 paysage', 'A4-2-paysage': 'A4, 2 affiches A5' }
export function placementsRetrait(format) {
  if (format === 'A4-paysage') return { orientation: 'landscape', cases: [{ x: 0, y: 0, w: 297, h: 210 }], coupe: [] }
  if (format === 'A4-2-paysage') {
    return { orientation: 'portrait', cases: [{ x: 0, y: 0, w: 210, h: 148.5 }, { x: 0, y: 148.5, w: 210, h: 148.5 }],
      coupe: [{ x1: 0, y1: 148.5, x2: 210, y2: 148.5 }] }
  }
  return null
}
export function nomFichierRetrait(slug, clair, format) {
  return `yoppaa-retrait-${slug}-${format}-${clair ? 'blanc' : 'violet'}.pdf`
}

// ─── LE DESSIN (navigateur seulement) ───────────────────────────────────────
const PX_PAR_MM = 10

function rondRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Dessine l'affiche et rend le canvas (A4 paysage, 10 px par mm). */
// `qrDataUrl` : le QR de la fiche du commerce, déjà généré. Absent (l'aperçu
// avant qu'il soit prêt), la carte blanche reste vide ; le téléchargement, lui,
// l'exige (`telechargerAfficheRetraitPdf`).
export async function construireAfficheRetrait({ sens, phrase, clair = true, nomCommerce = '', qrDataUrl = null } = {}) {
  if (typeof document === 'undefined') return null
  // ⚠️ LES POLICES D'ABORD : un canvas dessiné avant leur chargement sort en
  // police de secours, et c'est ce fichier-là que le commerçant imprime.
  try {
    await Promise.all([
      document.fonts?.load('900 100px "DM Sans"'), document.fonts?.load('700 100px "DM Sans"'),
      document.fonts?.load('500 100px "DM Sans"'), document.fonts?.load('800 100px "Plus Jakarta Sans"'),
    ])
  } catch { /* la police de secours vaut mieux qu'aucune affiche */ }

  const k = PX_PAR_MM
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_RETRAIT.largeur * k
  canvas.height = PAGE_RETRAIT.hauteur * k
  const ctx = canvas.getContext('2d')
  const police = (poids, taille, famille) => `${poids} ${taille * k}px "${famille}", system-ui, Arial, sans-serif`
  const mesurer = (t, taille, poids, famille) => { ctx.font = police(poids, taille, famille); return ctx.measureText(String(t)).width / k }

  // ⚠️ LES IMAGES AVANT LE DESSIN. Un badge qui ne se charge pas ne laisse
  // pas un trou : sans les deux, la rangée n'est pas dessinée (même règle que
  // l'affiche de vitrine).
  const charger = (src) => new Promise(resolve => {
    if (!src) return resolve(null)
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
  const [imgQr, ...imgBadges] = await Promise.all([charger(qrDataUrl), ...BADGES_RETRAIT.map(b => charger(b.src))])
  const badgesPrets = imgBadges.every(Boolean)

  const { operations } = planAfficheRetrait({ sens, phrase, clair, nomCommerce, mesurer })
  for (const o of operations) {
    if (o.type === 'rect') { ctx.fillStyle = o.couleur; ctx.fillRect(o.x * k, o.y * k, o.w * k, o.h * k) }
    else if (o.type === 'point') { ctx.fillStyle = o.couleur; ctx.beginPath(); ctx.arc(o.x * k, o.y * k, o.r * k, 0, Math.PI * 2); ctx.fill() }
    else if (o.type === 'trait') { ctx.strokeStyle = o.couleur; ctx.lineWidth = o.epaisseur * k; ctx.beginPath(); ctx.moveTo(o.x1 * k, o.y1 * k); ctx.lineTo(o.x2 * k, o.y2 * k); ctx.stroke() }
    else if (o.type === 'texte') {
      ctx.font = police(o.poids, o.taille, o.famille)
      ctx.fillStyle = o.couleur
      ctx.textAlign = o.aligne === 'center' ? 'center' : 'left'
      ctx.textBaseline = 'alphabetic'
      try { ctx.letterSpacing = `${(o.espacement || 0) * o.taille * k}px` } catch { /* Safari < 17 */ }
      ctx.fillText(o.texte, o.x * k, o.y * k)
      try { ctx.letterSpacing = '0px' } catch { /* idem */ }
    } else if (o.type === 'qr') {
      // ⚠️ LE QR RESTE NOIR SUR BLANC quel que soit le fond : c'est la seule
      // façon de garantir qu'un téléphone le lise du premier coup.
      ctx.fillStyle = '#FFFFFF'
      rondRect(ctx, o.x * k, o.y * k, o.cote * k, o.cote * k, 3 * k)
      ctx.fill()
      if (imgQr) ctx.drawImage(imgQr, (o.x + o.marge) * k, (o.y + o.marge) * k, (o.cote - o.marge * 2) * k, (o.cote - o.marge * 2) * k)
    } else if (o.type === 'badges') {
      if (!badgesPrets) continue
      o.badges.forEach((b, i) => {
        const img = imgBadges[i]
        const echelle = img.naturalHeight / b.badge.hauteur
        // Seulement la partie OPAQUE du fichier, à la hauteur demandée.
        ctx.drawImage(img, 0, b.badge.visible.y * echelle, img.naturalWidth, b.badge.visible.hauteur * echelle,
          b.x * k, o.y * k, b.largeur * k, o.hauteur * k)
      })
    } else if (o.type === 'pastille') {
      ctx.save()
      ctx.translate(o.x * k, o.y * k)
      ctx.rotate(o.angle * Math.PI / 180)
      ctx.fillStyle = o.couleur
      rondRect(ctx, 0, 0, o.w * k, o.h * k, (o.h / 2) * k)
      ctx.fill()
      ctx.font = police(900, o.taille, 'DM Sans')
      ctx.fillStyle = o.couleurTexte
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(o.texte, (o.w / 2) * k, (o.h / 2) * k + 0.4 * k)
      ctx.restore()
    } else if (o.type === 'logo') {
      // Le wordmark et ses cinq points, aux proportions de lib/logo.js.
      const corps = o.corps * k
      const L = proportionsLogo(corps)
      ctx.font = `800 ${corps}px "Plus Jakarta Sans", system-ui, Arial, sans-serif`
      try { ctx.letterSpacing = `${L.tracking}px` } catch { /* Safari < 17 */ }
      const segments = [['yo', o.couleurs[0]], ['pp', o.couleurs[1]], ['aa', o.couleurs[2]]]
      const largeurWm = segments.reduce((w, [t]) => w + ctx.measureText(t).width, 0)
      const m = ctx.measureText('yoppaa')
      const descente = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || corps * 0.24
      let x = o.xFin * k - largeurWm
      const x0 = x
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      for (const [t, c] of segments) { ctx.fillStyle = c; ctx.fillText(t, x, o.y * k); x += ctx.measureText(t).width }
      try { ctx.letterSpacing = '0px' } catch { /* idem */ }
      let dx = x0 + largeurWm / 2 - largeurPoints(corps) / 2
      // ⚠️ LA MÊME RÈGLE QUE L'AFFICHE QR (`construireAffiche`) : sous la
      // descendante MESURÉE, plus l'écart du fichier de marque.
      const yDots = o.y * k + descente + L.wordmarkToDots
      pointsLogo(corps).forEach((p, i) => {
        const r = p.diametre / 2
        ctx.beginPath()
        ctx.arc(dx + r, yDots + p.decalage + r, r, 0, Math.PI * 2)
        ctx.fillStyle = o.couleurs[i < 1 ? 0 : i < 3 ? 1 : 2]
        ctx.fill()
        dx += p.diametre + L.dotGap
      })
    }
  }
  return canvas
}

/** Télécharge l'affiche en PDF, au format demandé (`FORMATS_RETRAIT`). */
export async function telechargerAfficheRetraitPdf({ sens, phrase, clair = true, nomCommerce = '', slug, format = 'A4-paysage', qrDataUrl = null }) {
  const gabarit = placementsRetrait(format)
  // ⚠️ PAS DE PDF SANS QR : une carte blanche vide imprimée, c'est un trou au
  // milieu de l'affiche. L'appelant le dit (« pas encore prête »).
  if (!gabarit || !qrDataUrl) return false
  const canvas = await construireAfficheRetrait({ sens, phrase, clair, nomCommerce, qrDataUrl })
  if (!canvas) return false
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: gabarit.orientation, unit: 'mm', format: 'a4' })
  const image = canvas.toDataURL('image/png')
  for (const c of gabarit.cases) pdf.addImage(image, 'PNG', c.x, c.y, c.w, c.h)
  if (gabarit.coupe.length > 0) {
    pdf.setDrawColor(clair ? 200 : 150, clair ? 190 : 130, clair ? 220 : 200)
    pdf.setLineWidth(0.2)
    pdf.setLineDashPattern([2, 2], 0)
    for (const t of gabarit.coupe) pdf.line(t.x1, t.y1, t.x2, t.y2)
  }
  pdf.save(nomFichierRetrait(slug, clair, format))
  return true
}
