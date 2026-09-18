// LA COMPOSITION DES VISUELS DES STORES.
//
// Séparé de la page pour une seule raison : un banc peut l'exécuter. Le dessin
// se fait sur un contexte de canvas, et un contexte se simule ; une page, non.
//
// ⚠️ POURQUOI UNE MISE EN PAGE, ET PAS UN REDIMENSIONNEMENT.
//
//   🔴 L'ÉTIREMENT SILENCIEUX. `scripts/preparer-captures-stores.mjs` étirait
//      tant que l'écart de ratio restait sous 3 %. Les captures font 1080 × 2400
//      (0,45), le format d'Apple 1290 × 2796 (0,4613) : l'écart vaut 2,5 %,
//      juste SOUS le seuil. Il aurait étiré les prix de 2,5 %, sans un mot.
//
//   🔴 LE FORMAT ANDROID ÉTAIT HORS RÈGLES. Google demande un ratio entre 16:9
//      et 9:16, donc 0,5625 AU MINIMUM ; le script produisait 1080 × 2340, soit
//      0,4615. Une capture 9:20 n'entre pas dans un 9:16 sans mise en page.
//
// Ici la capture est posée À SA TAILLE sur un fond au format du store : le
// ratio du fond est celui qu'on veut, quelle que soit la source.

// ────────── LA MARQUE ──────────
// ⚠️ RECOPIÉ DE `app/brand-kit/page.js`. Cette page est un composant, elle
// n'exporte rien ; plutôt que de la refondre à deux jours des soumissions, le
// banc COMPARE les deux listes et rougit si l'une bouge sans l'autre.
export const T = {
  ink: '#1A0840',
  main: '#6B35C4',
  mid: '#9660E0',
  light: '#C4A0F4',
  pale: '#EDE0FF',
  bg: '#F8F6FF',
}

// Les 5 dots du logo aux proportions canoniques du brand-kit (V2-B), dans leur
// repère d'origine. Ils sont mis à l'échelle au moment de dessiner : les
// recopier à une autre taille, c'est comme ça qu'un logo dérive.
export const DOTS = [
  { cx: 14, cy: 14, r: 14, fill: '#FFFFFF' },
  { cx: 51.1, cy: 21.7, r: 7.7, fill: T.light },
  { cx: 88.2, cy: 25.2, r: 14, fill: T.light },
  { cx: 125.3, cy: 21.7, r: 7.7, fill: T.mid },
  { cx: 162.4, cy: 14, r: 14, fill: T.mid },
]
export const DOTS_L = 176.4
export const DOTS_H = 39.2

// ────────── CE QUE LES STORES EXIGENT ──────────
// 🔴 APPLE REFUSE UNE DIMENSION QUI N'EST PAS DANS SA LISTE, au pixel près, et
// le rejet arrive APRÈS la soumission : un cycle de revue perdu.
// ⚠️ GOOGLE, LUI, IMPOSE UN RATIO : entre 16:9 et 9:16. En portrait, cela veut
// dire largeur/hauteur AU MOINS 0,5625. C'est cette borne que l'ancien format
// violait.
export const RATIO_MINIMUM_GOOGLE = 9 / 16

export const FORMATS = [
  { id: 'ios69', nom: 'iPhone 6,9"', l: 1290, h: 2796, store: 'apple', note: 'Apple — le format principal, obligatoire' },
  { id: 'ios65', nom: 'iPhone 6,5"', l: 1242, h: 2688, store: 'apple', note: 'Apple — demandé en plus par App Store Connect' },
  { id: 'android', nom: 'Android', l: 1080, h: 1920, store: 'google', note: 'Google — ratio 9:16, la limite basse autorisée' },
]

// ────────── LES HUIT VISUELS, ORDRE VALIDÉ PAR ALEX LE 18/09 ──────────
// L'ordre compte : c'est celui du défilement, et les deux premiers sont les
// seuls que la majorité verra.
export const VISUELS = [
  { n: 1, titre: 'Ton quartier dans ta poche', sous: 'Tous les commerces de chez toi, au même endroit', attendu: 'la liste des commerces, depuis Mettet' },
  { n: 2, titre: 'Commande sans faire la file', sous: 'Tu choisis ton heure, c’est prêt quand tu arrives', attendu: 'la carte de Chez Momo' },
  { n: 3, titre: 'Prends rendez-vous quand tu veux', sous: 'Même le dimanche soir, quand le salon est fermé', attendu: 'les créneaux du Salon Nathalie' },
  { n: 4, titre: 'Rien ne se perd', sous: 'Les derniers du jour, avant la fermeture', attendu: 'les invendus près de toi' },
  { n: 5, titre: 'Ta fidélité te suit', sous: 'Elle se remplit toute seule, à chaque passage', attendu: 'la carte de fidélité Chez Momo' },
  { n: 6, titre: 'Offre un bon cadeau', sous: 'Choisi en deux minutes, reçu par email', attendu: 'le bon cadeau du Studio Amandine' },
  { n: 7, titre: 'Les boutiques aussi', sous: 'Tu vois ce qu’il reste en stock avant de te déplacer', attendu: 'une fiche article du Dressing de Sophie' },
  { n: 8, titre: 'Ou livré chez toi', sous: 'Quand le commerçant propose la livraison', attendu: 'le choix du créneau de livraison' },
]

// ────────── LES PROPORTIONS ──────────
// Tout en FRACTIONS du cadre, jamais en pixels : les trois formats ont des
// hauteurs différentes, et des pixels donneraient trois mises en page.
export const P = {
  margeHaut: 0.062,
  tailleTitre: 0.036,
  tailleSous: 0.0165,
  gapTitreSous: 0.016,
  gapSousDots: 0.021,
  hauteurDots: 0.013,
  gapDotsCapture: 0.026,
  largeurTexte: 0.86,
  largeurCaptureMax: 0.78,
  debordBas: 1.04,
  rayonCoins: 0.018,
}

// ⚠️ LE RECADRAGE NE S'AUTOMATISE PAS : il dépend du téléphone. En POURCENTAGES
// de la source, jamais en pixels, pour la même raison.
export const RECADRAGE_DEFAUT = { haut: 3.8, bas: 1.8 }

// ────────── OUTILS ──────────

// `fillText` ne revient pas à la ligne : il faut couper à la main.
export function enLignes(ctx, texte, largeurMax) {
  const mots = String(texte || '').split(' ')
  const lignes = []
  let courante = ''
  for (const mot of mots) {
    const essai = courante ? courante + ' ' + mot : mot
    if (ctx.measureText(essai).width > largeurMax && courante) {
      lignes.push(courante)
      courante = mot
    } else {
      courante = essai
    }
  }
  if (courante) lignes.push(courante)
  return lignes
}

export function cheminArrondi(ctx, x, y, l, h, r) {
  const rr = Math.min(r, l / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + l - rr, y)
  ctx.quadraticCurveTo(x + l, y, x + l, y + rr)
  ctx.lineTo(x + l, y + h - rr)
  ctx.quadraticCurveTo(x + l, y + h, x + l - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

// ────────── LA COMPOSITION ──────────
// Rend ce qu'elle a décidé, pas seulement ce qu'elle a dessiné : le banc a
// besoin des NOMBRES pour vérifier qu'aucune capture n'est déformée.
export function dessiner(ctx, format, visuel, image, recadrage = RECADRAGE_DEFAUT) {
  const { l: L, h: H } = format
  ctx.clearRect(0, 0, L, H)
  ctx.fillStyle = T.ink
  ctx.fillRect(0, 0, L, H)

  const largeurTexte = L * P.largeurTexte
  const tailleTitre = H * P.tailleTitre
  const tailleSous = H * P.tailleSous

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '800 ' + tailleTitre + 'px "Plus Jakarta Sans", system-ui, sans-serif'
  const lignesTitre = enLignes(ctx, visuel.titre, largeurTexte)
  let y = H * P.margeHaut
  for (const ligne of lignesTitre) {
    ctx.fillText(ligne, L / 2, y)
    y += tailleTitre * 1.16
  }

  y += H * P.gapTitreSous
  ctx.fillStyle = T.light
  ctx.font = '600 ' + tailleSous + 'px "Plus Jakarta Sans", system-ui, sans-serif'
  const lignesSous = enLignes(ctx, visuel.sous, largeurTexte)
  for (const ligne of lignesSous) {
    ctx.fillText(ligne, L / 2, y)
    y += tailleSous * 1.35
  }

  y += H * P.gapSousDots
  const hDots = H * P.hauteurDots
  const echelle = hDots / DOTS_H
  const xDots = (L - DOTS_L * echelle) / 2
  for (const d of DOTS) {
    ctx.beginPath()
    ctx.arc(xDots + d.cx * echelle, y + d.cy * echelle, d.r * echelle, 0, Math.PI * 2)
    ctx.fillStyle = d.fill
    ctx.fill()
  }
  y += hDots

  const hautCapture = y + H * P.gapDotsCapture
  const plan = { hautCapture, lignesTitre: lignesTitre.length, lignesSous: lignesSous.length, capture: null }
  if (!image) return plan

  // On coupe la barre d'état et la barre de gestes : l'heure et la batterie
  // d'Alex n'apprennent rien à personne, et c'est la SEULE chose qui disait de
  // quel système venait la capture.
  const sy = Math.round(image.naturalHeight * (recadrage.haut / 100))
  const sl = image.naturalWidth
  const sh = Math.round(image.naturalHeight * (1 - recadrage.haut / 100 - recadrage.bas / 100))
  if (sh <= 0 || sl <= 0) return plan

  const ratio = sl / sh
  const placeRestante = H - hautCapture
  // Viser un peu plus bas que le cadre, pour toucher le bord au lieu de laisser
  // un vide sous la capture.
  let hCible = placeRestante * P.debordBas
  let lCible = hCible * ratio
  const lMax = L * P.largeurCaptureMax
  if (lCible > lMax) {
    // ⚠️ ON NE DÉFORME JAMAIS. Quand la largeur plafonne, c'est la HAUTEUR qui
    // suit ; le surplus est coupé par le bord bas, il n'est pas écrasé.
    lCible = lMax
    hCible = lCible / ratio
  }
  const xCapture = (L - lCible) / 2

  // 🔴 QUAND LA LARGEUR PLAFONNE, LA HAUTEUR NE SUFFIT PLUS À ATTEINDRE LE BAS.
  // Trouvé par le banc : sur les deux formats Apple, les visuels au titre court
  // laissaient 60 à 120 px de vide sous la capture, parce que le titre tenait
  // sur une ligne, que la place restante grandissait, et que la largeur, elle,
  // restait plafonnée à 78 %.
  // On DESCEND donc la capture jusqu'au bord bas, sans jamais remonter sur le
  // texte. Le blanc se retrouve entre le titre et la capture, où il respire ;
  // sous la capture, il ressemblait à un oubli.
  const yCapture = Math.max(hautCapture, H - hCible)

  ctx.save()
  cheminArrondi(ctx, xCapture, yCapture, lCible, Math.max(hCible, H - yCapture), L * P.rayonCoins)
  ctx.clip()
  ctx.drawImage(image, 0, sy, sl, sh, xCapture, yCapture, lCible, hCible)
  ctx.restore()

  plan.capture = { x: xCapture, y: yCapture, l: lCible, h: hCible, ratioSource: ratio, ratioDessine: lCible / hCible }
  return plan
}
