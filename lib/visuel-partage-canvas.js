// LE TRACÉ DU VISUEL. Ce fichier a besoin d'un navigateur.
//
// ⚠️ IL NE DÉCIDE RIEN. Quels blocs s'affichent, à quelle taille, sur combien de
// lignes : tout cela est dans `lib/visuel-partage.js`, en fonctions pures, donc
// mesurable au banc. Ici on pose de l'encre, et c'est tout.
//
// ⚠️ MÊME TECHNIQUE QUE L'AFFICHE DU KIT PAPIER (`lib/affiche-kit.js`, 23/08) :
// un canvas, `fillText`, et les vraies polices. Convertir le texte en tracés
// aurait demandé une bibliothèque de plus ; intégrer la police en base64 dans un
// SVG aurait alourdi chaque visuel de plusieurs dizaines de kilo-octets.
//
// 🔴 ET LA POLICE DOIT ÊTRE CHARGÉE AVANT DE DESSINER. `fillText` ne l'attend
// pas : appelé trop tôt, il trace en Arial sans prévenir, et le visuel part sur
// Facebook dans la mauvaise police. `document.fonts.ready` est la garde.

import {
  FORMATS, FORMAT_CARRE, contenuVisuel, replierTexte, taillePourTenir,
  pointsDuVisuel, largeurDesPoints, nomFichierVisuel,
} from './visuel-partage'

const POLICE = '"DM Sans", system-ui, Arial, sans-serif'

/** Les deux pictogrammes tracés à la main : aucun fichier à charger. */
function tracerHorloge(ctx, x, y, taille, couleur) {
  const r = taille / 2
  ctx.save()
  ctx.strokeStyle = couleur
  ctx.lineWidth = Math.max(2, taille * 0.11)
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(x + r, y + r, r * 0.82, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + r, y + r * 0.55); ctx.lineTo(x + r, y + r)
  ctx.lineTo(x + r * 1.42, y + r * 1.2); ctx.stroke()
  ctx.restore()
}

function tracerSac(ctx, x, y, taille, couleur) {
  const l = taille
  ctx.save()
  ctx.strokeStyle = couleur
  ctx.lineWidth = Math.max(2, taille * 0.11)
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x + l * 0.16, y + l * 0.34)
  ctx.lineTo(x + l * 0.84, y + l * 0.34)
  ctx.lineTo(x + l * 0.74, y + l * 0.92)
  ctx.lineTo(x + l * 0.26, y + l * 0.92)
  ctx.closePath(); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + l * 0.34, y + l * 0.34)
  ctx.lineTo(x + l * 0.34, y + l * 0.20)
  ctx.bezierCurveTo(x + l * 0.34, y + l * 0.02, x + l * 0.66, y + l * 0.02, x + l * 0.66, y + l * 0.20)
  ctx.lineTo(x + l * 0.66, y + l * 0.34)
  ctx.stroke()
  ctx.restore()
}

/** La marque anti-gaspi : le cadran auquel il reste un quartier. */
function tracerMarque(ctx, x, y, taille, couleur) {
  const u = taille / 24
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = couleur
  ctx.fillStyle = couleur
  ctx.lineWidth = 2 * u
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(12 * u, 12 * u, 8 * u, 0, Math.PI * 1.5)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(13.7 * u, 10.3 * u)
  ctx.lineTo(13.7 * u, 4.2 * u)
  ctx.arc(13.7 * u, 10.3 * u, 6.1 * u, -Math.PI / 2, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function coinsArrondis(ctx, x, y, l, h, r) {
  const rayon = Math.min(r, l / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rayon, y)
  ctx.arcTo(x + l, y, x + l, y + h, rayon)
  ctx.arcTo(x + l, y + h, x, y + h, rayon)
  ctx.arcTo(x, y + h, x, y, rayon)
  ctx.arcTo(x, y, x + l, y, rayon)
  ctx.closePath()
}

/**
 * Compose le visuel et rend le canvas.
 *
 * @returns {Promise<HTMLCanvasElement|null>} `null` si l'annonce n'a pas de quoi
 *   faire une carte : l'appelant peut alors le DIRE plutôt que de proposer un
 *   bouton qui ne fait rien.
 */
export async function construireVisuel(annonce, formatCle = FORMAT_CARRE) {
  const c = contenuVisuel(annonce)
  if (!c) return null
  const F = FORMATS[formatCle] || FORMATS[FORMAT_CARRE]
  const h = c.habit

  const canvas = document.createElement('canvas')
  canvas.width = F.largeur
  canvas.height = F.hauteur
  const ctx = canvas.getContext('2d')

  // 🔴 SANS CETTE ATTENTE, LE VISUEL PART EN ARIAL. `fillText` n'attend pas le
  // chargement des polices, et rien ne le signale : le fichier est correct, il
  // est juste dans la mauvaise typographie.
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready } catch { /* police système */ }

  const police = (poids, taille) => `${poids} ${taille}px ${POLICE}`
  const mesurerA = (texte, taille, poids = 900) => {
    ctx.font = police(poids, taille)
    return ctx.measureText(String(texte || '')).width
  }

  // ── Le fond ──────────────────────────────────────────────────────────────
  if (h.fondBas) {
    const d = ctx.createLinearGradient(0, 0, F.largeur * 0.4, F.hauteur)
    d.addColorStop(0, h.fond)
    d.addColorStop(1, h.fondBas)
    ctx.fillStyle = d
  } else {
    ctx.fillStyle = h.fond
  }
  ctx.fillRect(0, 0, F.largeur, F.hauteur)

  const gauche = F.marge
  const utile = F.largeur - F.marge * 2

  // ── On MESURE tout avant de tracer ───────────────────────────────────────
  //
  // ⚠️ LA HAUTEUR TOTALE SE CONNAÎT AVANT LE PREMIER TRAIT, sinon on ne peut pas
  // centrer, et un bloc absent laisse un trou en bas. C'est aussi ce qui permet
  // de dire que rien ne déborde : on additionne, on compare, on réduit.
  const tailleTitre = taillePourTenir(
    (t, px) => mesurerA(t, px, 900), c.titre, utile, F.titre, F.titreMini, F.titreLignes)
  const lignesTitre = replierTexte(t => mesurerA(t, tailleTitre, 900), c.titre, utile, F.titreLignes)
  const lignesDesc = c.description
    ? replierTexte(t => mesurerA(t, F.desc, 500), c.description, utile, F.descLignes)
    : []

  const hBadge = F.badge * 1.9
  const hEnseigne = F.enseigne * 1.25
  const hTitre = lignesTitre.length * tailleTitre * 1.08
  const hDesc = lignesDesc.length * F.desc * 1.45
  const hPrix = c.prix !== null ? F.prix * 1.02 : 0
  const hPast = c.pastilles.length ? F.past * 2.2 : 0
  const hPoints = F.point * 1.4
  const hAdresse = F.adresse * 1.3
  // ⚠️ LE PIED NE PORTE PLUS QUE L'ADRESSE depuis le 05/09 : les points sont
  // remontés en tête. Elle y gagne toute la place, et c'est la seule chose du
  // visuel qui puisse ramener quelqu'un depuis Instagram.
  const hPied = hAdresse + F.ecart * 1.2

  // ─── TROIS ZONES ANCRÉES, PAS UN BLOC FLOTTANT ──────────────────────────
  //
  // 🔴 ALEX, 05/09 : « il y a trop d'espace libre au-dessus ». Tout était centré
  // d'un seul tenant : sur une actualité courte, l'en-tête descendait au tiers
  // de la carte et le haut restait vide. Une affiche a une TÊTE en haut, un PIED
  // en bas, et son sujet au milieu de ce qui reste.
  //
  // ⚠️ ET C'EST CE QUI REND LA CARTE JUSTE QUAND LE CONTENU MAIGRIT : une
  // actualité sans prix ni pastilles occupe moins de place, mais sa tête et son
  // pied ne bougent pas d'un pixel.
  const blocs = [hEnseigne, hTitre, hDesc, hPrix, hPast].filter(v => v > 0)
  const hEntete = Math.max(hBadge, hPoints)
  const hCorps = blocs.reduce((s, v) => s + v, 0) + F.ecart * (blocs.length - 1)
  const basDuCorps = F.hauteur - F.marge - hPied
  const hautDuCorps = F.marge + hEntete + F.ecart
  // ⚠️ JAMAIS AU-DESSUS DE LA TÊTE, même si le corps est plus haut que la place
  // disponible : on préfère qu'il déborde vers le bas, où le pied le contiendra,
  // plutôt qu'il vienne écrire sur les points.
  let y = Math.max(hautDuCorps, hautDuCorps + (basDuCorps - hautDuCorps - hCorps) / 2)

  // ── L'EN-TÊTE : LA MARQUE À GAUCHE, LE BADGE À DROITE ────────────────────
  //
  // 🔴 ALEX, 05/09 : « j'aimerais que les 5 dots soient positionnés ailleurs, je
  // pense en haut à gauche ». Son principe est juste : UNE MARQUE SE LIT EN
  // PREMIER, PAS EN DERNIER. En pied de page, les points n'étaient vus que par
  // ceux qui avaient déjà décidé de lire ; sur Instagram, une carte est regardée
  // moins d'une seconde.
  //
  // ⚠️ MAIS LE HAUT À GAUCHE ÉTAIT DÉJÀ PRIS par le badge, et deux marques dans
  // le même coin se gênent. Elles se partagent donc la ligne : la marque à
  // gauche, ce qui répond à la demande, et le badge à droite, où il garde tout
  // son poids sans rien disputer.
  const largeurMarque = h.marqueSurBadge ? F.badge * 1.5 : 0
  ctx.font = police(900, F.badge)
  const lBadge = ctx.measureText(c.badge).width + F.badge * 1.9 + largeurMarque
  // ⚠️ LA TÊTE EST ANCRÉE À LA MARGE HAUTE, elle ne suit pas le corps. C'est
  // exactement ce qui creusait le vide qu'Alex a vu.
  const yEntete = F.marge + (hEntete - hBadge) / 2
  const yPoints = F.marge + (hEntete - hPoints) / 2

  pointsDuVisuel(F.point, h.pointsClairs).forEach(p => {
    ctx.fillStyle = p.couleur
    ctx.beginPath()
    ctx.arc(gauche + p.x + p.diametre / 2, yPoints + p.decalage + p.diametre / 2, p.diametre / 2, 0, Math.PI * 2)
    ctx.fill()
  })

  // ⚠️ LE BADGE EST CALÉ SUR LE BORD DROIT, pas posé à une distance fixe des
  // points : son texte change avec l'occasion, et une position calculée depuis
  // la gauche l'aurait fait sortir du cadre sur « INFOS PRATIQUES ».
  const xBadge = F.largeur - F.marge - lBadge
  ctx.fillStyle = h.badgeFond
  coinsArrondis(ctx, xBadge, yEntete, lBadge, hBadge, hBadge / 2)
  ctx.fill()
  if (h.marqueSurBadge) {
    tracerMarque(ctx, xBadge + F.badge * 0.85, yEntete + (hBadge - F.badge) / 2, F.badge, h.badgeMarque)
  }
  ctx.fillStyle = h.badgeEncre
  ctx.textBaseline = 'middle'
  ctx.fillText(c.badge, xBadge + F.badge * 0.95 + largeurMarque, yEntete + hBadge / 2)

  // ── L'enseigne ───────────────────────────────────────────────────────────
  //
  // ⚠️ LE NOM DU COMMERÇANT PASSE AVANT LE TITRE. C'est lui qui fait sortir de
  // chez soi : on connaît sa boulangerie, pas son invendu. Même ordre que sur la
  // carte de l'accueil, décidé avec Alex le 05/09.
  //
  // 🔴 ET PLUS AUCUNE MARQUE ANTI-GASPI ICI (Alex, 05/09 : « il y a l'icône rien
  // ne se perd à côté du nom du commerçant alors qu'il est réservé à rien ne se
  // perd »). Je la traçais sur LES TROIS TYPES : une nouveauté et un deal
  // portaient la signature d'une rubrique qui n'est pas la leur, exactement la
  // confusion qu'Alex a fait corriger le 04/09 dans l'application.
  //
  // ⚠️ ET MON BANC AFFIRMAIT LE CONTRAIRE. Sa garde « la marque ne coiffe QUE
  // l'invendu » vérifiait le BADGE, pendant que le défaut vivait sur l'ENSEIGNE.
  // Une garde qui mesure un endroit ne dit rien de l'autre : c'est le motif le
  // plus coûteux de ce projet.
  //
  // ⚠️ ET IL N'Y A PLUS RIEN À METTRE DEVANT : les cinq points en tête sont la
  // marque de la carte. Un pictogramme de plus sur cette ligne ne dirait rien
  // que le haut ne dise déjà.
  ctx.font = police(900, F.enseigne)
  ctx.fillStyle = h.accent
  ctx.fillText(c.enseigne.toUpperCase(), gauche, y + F.enseigne * 0.55)
  y += hEnseigne + F.ecart

  // ── Le titre ─────────────────────────────────────────────────────────────
  ctx.font = police(900, tailleTitre)
  ctx.fillStyle = h.encre
  ctx.textBaseline = 'alphabetic'
  lignesTitre.forEach((ligne, i) => {
    ctx.fillText(ligne, gauche, y + tailleTitre * 0.82 + i * tailleTitre * 1.08)
  })
  y += hTitre + F.ecart

  // ── La description, sur une actualité seulement ──────────────────────────
  if (lignesDesc.length) {
    ctx.font = police(500, F.desc)
    ctx.fillStyle = h.douce
    lignesDesc.forEach((ligne, i) => {
      ctx.fillText(ligne, gauche, y + F.desc * 0.8 + i * F.desc * 1.45)
    })
    y += hDesc + F.ecart
  }

  // ── Le prix ──────────────────────────────────────────────────────────────
  if (c.prix !== null) {
    const euros = (n) => `${n.toFixed(2).replace('.', ',').replace(/,00$/, '')} €`
    ctx.font = police(900, F.prix)
    ctx.fillStyle = h.accent
    const txtPrix = euros(c.prix)
    ctx.fillText(txtPrix, gauche, y + F.prix * 0.8)
    let x = gauche + ctx.measureText(txtPrix).width + F.ecart * 0.7

    if (c.prixBarre !== null) {
      ctx.font = police(700, F.barre)
      ctx.fillStyle = h.douce
      const txtBarre = euros(c.prixBarre)
      const lBarre = ctx.measureText(txtBarre).width
      ctx.fillText(txtBarre, x, y + F.prix * 0.8)
      ctx.strokeStyle = h.douce
      ctx.lineWidth = Math.max(2, F.barre * 0.07)
      ctx.beginPath()
      ctx.moveTo(x, y + F.prix * 0.8 - F.barre * 0.28)
      ctx.lineTo(x + lBarre, y + F.prix * 0.8 - F.barre * 0.28)
      ctx.stroke()
      x += lBarre + F.ecart * 0.6
    }
    if (c.suffixe) {
      ctx.font = police(700, F.barre)
      ctx.fillStyle = h.douce
      ctx.fillText(c.suffixe, x, y + F.prix * 0.8)
    }
    y += hPrix + F.ecart
  }

  // ── Les pastilles de l'invendu ───────────────────────────────────────────
  if (c.pastilles.length) {
    let x = gauche
    const hp = F.past * 2.1
    c.pastilles.forEach(p => {
      ctx.font = police(800, F.past)
      const lTexte = ctx.measureText(p.texte).width
      const lp = lTexte + F.past * 3.6
      ctx.fillStyle = h.pastFond
      coinsArrondis(ctx, x, y, lp, hp, hp / 2)
      ctx.fill()
      ctx.strokeStyle = h.pastFilet
      ctx.lineWidth = 2
      coinsArrondis(ctx, x, y, lp, hp, hp / 2)
      ctx.stroke()
      const tailleIco = F.past * 0.95
      const yIco = y + (hp - tailleIco) / 2
      if (p.icone === 'horloge') tracerHorloge(ctx, x + F.past * 0.8, yIco, tailleIco, h.pastEncre)
      else tracerSac(ctx, x + F.past * 0.8, yIco, tailleIco, h.pastEncre)
      ctx.fillStyle = h.pastEncre
      ctx.textBaseline = 'middle'
      ctx.fillText(p.texte, x + F.past * 2.2, y + hp / 2)
      ctx.textBaseline = 'alphabetic'
      x += lp + F.ecart * 0.5
    })
    y += hPast + F.ecart
  }

  // ── Le pied : le filet, les cinq points, l'adresse ───────────────────────
  //
  // 🔴 L'ADRESSE A SA PROPRE LIGNE, SUR TOUTE LA LARGEUR. Partagée avec les
  // points, elle sortait du cadre en paysage. Et une adresse tronquée est PIRE
  // que pas d'adresse : sur Instagram, c'est la seule chose qui puisse ramener
  // quelqu'un, aucun lien n'y étant cliquable.
  const yPied = F.hauteur - F.marge - hAdresse
  ctx.strokeStyle = h.filet
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(gauche, yPied - F.ecart * 0.8)
  ctx.lineTo(F.largeur - F.marge, yPied - F.ecart * 0.8)
  ctx.stroke()

  if (c.adresse) {
    // ⚠️ ELLE RÉTRÉCIT PLUTÔT QUE DE SORTIR. Un slug long ne doit pas la faire
    // déborder : c'est le seul texte du visuel qu'on ne peut pas couper.
    //
    // ⚠️ ET ELLE A TOUTE LA LARGEUR DEPUIS QUE LES POINTS SONT REMONTÉS. Elle
    // peut donc rester plus grande plus longtemps avant de devoir maigrir.
    let ta = F.adresse
    while (ta > 14 && mesurerA(c.adresse, ta, 800) > utile) ta -= 1
    ctx.font = police(800, ta)
    ctx.fillStyle = h.accent
    ctx.fillText(c.adresse, gauche, yPied + ta * 0.9)
  }

  return canvas
}

/** Le visuel en Blob PNG, prêt à partager ou à télécharger. */
export async function visuelEnBlob(annonce, format) {
  const canvas = await construireVisuel(annonce, format)
  if (!canvas) return null
  return await new Promise(resoudre => canvas.toBlob(resoudre, 'image/png'))
}

/**
 * Télécharge le visuel, sans passer par la feuille de partage.
 *
 * ⚠️ IL FAUT LES DEUX BOUTONS, et ce n'est pas une redondance. Le partage
 * convient au commerçant qui publie depuis son téléphone ; le téléchargement
 * sert à celui qui prépare ses publications sur ordinateur, ou qui veut garder
 * le fichier pour l'imprimer, l'envoyer par courriel ou le donner à quelqu'un.
 *
 * @returns {Promise<boolean>} `false` si l'annonce n'a pas de quoi faire une
 *   carte, pour que l'appelant puisse le DIRE plutôt que de ne rien faire.
 */
export async function telechargerVisuel({ annonce, format, slug = '' }) {
  const blob = await visuelEnBlob(annonce, format)
  if (!blob) return false
  const a = document.createElement('a')
  a.download = nomFichierVisuel(annonce?.type, format, slug)
  a.href = URL.createObjectURL(blob)
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return true
}

/** Le visuel en data URL, pour l'aperçu à l'écran. */
export async function visuelEnApercu(annonce, format) {
  const canvas = await construireVisuel(annonce, format)
  return canvas ? canvas.toDataURL('image/png') : null
}

/**
 * Partage le visuel par la feuille du système, avec repli en téléchargement.
 *
 * 🔴 IL N'Y A PAS DE PUBLICATION AUTOMATIQUE, ET IL NE PEUT PAS Y EN AVOIR.
 * Facebook a supprimé le paramètre de texte pré-rempli en 2017 et l'interdit
 * dans sa politique ; Instagram n'a aucun partage depuis le web. La feuille
 * native du téléphone est le maximum atteignable sans passer sous la coupe de
 * Meta, et le commerçant tape deux fois au lieu d'une.
 *
 * @returns {Promise<'partage'|'telecharge'|'annule'|'impossible'>}
 */
export async function partagerVisuel({ annonce, format, texte = '', slug = '' }) {
  const blob = await visuelEnBlob(annonce, format)
  if (!blob) return 'impossible'
  const fichier = new File([blob], nomFichierVisuel(annonce?.type, format, slug), { type: 'image/png' })

  // ⚠️ ON DEMANDE À `canShare` AVANT D'APPELER `share`. Un navigateur peut
  // connaître `navigator.share` sans accepter les FICHIERS : appeler quand même
  // lève une erreur, et le commerçant n'aurait ni partage ni image.
  const peutPartagerLeFichier = typeof navigator !== 'undefined'
    && navigator.share && navigator.canShare && navigator.canShare({ files: [fichier] })

  if (peutPartagerLeFichier) {
    try {
      await navigator.share({ files: [fichier], text: texte })
      return 'partage'
    } catch (e) {
      // ⚠️ UN REFUS N'EST PAS UNE PANNE. `AbortError` veut dire que le
      // commerçant a fermé la feuille : lui télécharger un fichier qu'il vient
      // de refuser serait le contraire de ce qu'il a demandé.
      if (e && e.name === 'AbortError') return 'annule'
    }
  }

  const a = document.createElement('a')
  a.download = fichier.name
  a.href = URL.createObjectURL(blob)
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return 'telecharge'
}
