// LE VISUEL QU'ON PARTAGE SUR LES RÉSEAUX.
//
// 🔴 POURQUOI CE FICHIER EXISTE. Le générateur de posts produisait un texte que
// le commerçant collait sur Facebook. Depuis le 05/09 ce texte porte un lien
// vers sa fiche, mais sur Instagram un lien dans une légende n'est PAS
// CLIQUABLE : il ne ramène rigoureusement personne. La seule chose qui peut
// ramener quelqu'un depuis Instagram, c'est une adresse ÉCRITE SUR L'IMAGE.
//
// ⚠️ AUCUNE IMAGE EXTÉRIEURE, DÉCISION D'ALEX DU 05/09, et elle tient sur trois
// raisons dont deux sont des risques :
//   • Yoppaa ne devient pas co-éditrice d'une photo dont elle ne maîtrise ni la
//     qualité ni les droits, avec sa propre marque posée dessus ;
//   • dessiner une image distante dans un canvas le SALIT : l'export échoue
//     purement et simplement si l'hébergeur ne renvoie pas les bons en-têtes ;
//   • et les visuels se ressemblent enfin, au lieu d'avoir une moitié haute de
//     qualité variable.
//
// ⚠️ CE MODULE DÉCIDE, IL NE DESSINE PAS. Tout ce qui se juge — quels blocs
// s'affichent, à quelle taille, sur combien de lignes — est ici, en fonctions
// pures, donc mesurable au banc. Le tracé lui-même vit dans
// `lib/visuel-partage-canvas.js`, qui a besoin d'un navigateur.
//
// ⚠️ ET LE DESSIN EN CANVAS EST DÉJÀ ÉPROUVÉ ICI : `lib/affiche-kit.js` compose
// l'affiche du kit papier avec `fillText` et les vraies polices depuis le 23/08.
// On reprend sa technique plutôt que d'en inventer une seconde.

import { proportionsLogo, pointsLogo } from './logo'

// ─── LES DEUX FORMATS ───────────────────────────────────────────────────────
//
// 🔴 DEUX BARÈMES, PAS UN SEUL MIS À L'ÉCHELLE. Le paysage n'a que 630 de haut
// contre 1080 : réutiliser les tailles du carré fait sortir le titre et
// l'adresse du cadre, et le canvas les coupe EN SILENCE. C'est le défaut qu'Alex
// a vu sur les premières maquettes.

export const FORMAT_CARRE = 'carre'
export const FORMAT_PAYSAGE = 'paysage'

export const FORMATS = {
  [FORMAT_CARRE]: {
    cle: FORMAT_CARRE, largeur: 1080, hauteur: 1080, marge: 72,
    badge: 30, enseigne: 32, titre: 82, titreMini: 46, desc: 36,
    prix: 116, barre: 44, past: 27, adresse: 30, point: 22, ecart: 26,
    titreLignes: 3, descLignes: 3,
    // ⚠️ Instagram, les stories, WhatsApp. C'est le format par défaut : le
    // carré est le seul qui ne se fasse jamais rogner d'un réseau à l'autre.
    usage: 'Instagram, story, WhatsApp',
  },
  [FORMAT_PAYSAGE]: {
    cle: FORMAT_PAYSAGE, largeur: 1200, hauteur: 630, marge: 56,
    badge: 24, enseigne: 25, titre: 58, titreMini: 34, desc: 27,
    prix: 84, barre: 33, past: 22, adresse: 24, point: 17, ecart: 18,
    titreLignes: 2, descLignes: 2,
    usage: 'Facebook, aperçu de lien',
  },
}

// ─── LES TROIS HABITS ───────────────────────────────────────────────────────
//
// ⚠️ L'HABIT VIENT DU TYPE D'ANNONCE, et de rien d'autre. C'est ce qui fait
// qu'un invendu reste un invendu et qu'un deal reste un deal sans qu'on ait à
// lire le badge. Alex a fait corriger la confusion des deux le 04/09 dans
// l'application ; elle ne doit pas revenir par les visuels.
//
// ⚠️ LE CRÈME ET LA NUIT DE L'INVENDU SONT CEUX DE L'APPLICATION, pas des
// approximations : celui qui a vu la carte sur son accueil doit reconnaître le
// post, et l'inverse.
//
// ⚠️ LES TROIS FONDS SONT DES DÉGRADÉS DEPUIS LE 05/09 (Alex : « ça donne un peu
// de dynamisme »). Ils restent TRÈS légers sur les deux clairs : un dégradé
// marqué sur un fond pâle se lit comme une salissure, pas comme une intention.
//
// 🔴 ET L'ARGUMENT QUI ME LES FAISAIT ÉCARTER NE VALAIT PAS ICI. J'avais invoqué
// Gmail Android, qui jette les dégradés d'un fond HTML : c'est vrai d'un EMAIL,
// et faux d'un PNG, où le dégradé est cuit dans les pixels et voyage partout.
// Je m'étais trompé de médium.
//
// ⚠️ LE CONTRASTE EST MESURÉ AU POINT LE PLUS FONCÉ du dégradé, pas au plus
// clair : c'est là que le texte souffre. Titre 15,10 et 15,01 ; accent 5,94 et
// 5,90 ; encre douce 5,32 et 7,08. Tous très au-dessus du seuil.

export const TYPE_INVENDU = 'invendu'
export const TYPE_DEAL = 'deal'
export const TYPE_ACTU = 'actu'

export const HABITS = {
  [TYPE_INVENDU]: {
    badge: 'RIEN NE SE PERD', marqueSurBadge: true, pointsClairs: true,
    fond: '#FFFDF7', fondBas: '#F1E9DA',
    encre: '#1A0840', douce: '#5F5F5A', accent: '#6B35C4', marque: '#9660E0',
    filet: '#E6DECF',
    badgeFond: '#1A0840', badgeEncre: '#FFFFFF', badgeMarque: '#C4A0F4',
    pastFond: '#FFFFFF', pastFilet: '#E6DECF', pastEncre: '#4B4B47',
  },
  [TYPE_DEAL]: {
    badge: 'DEAL DU JOUR', marqueSurBadge: false, pointsClairs: false,
    fond: '#1A0840', fondBas: '#4A1E96',
    encre: '#FFFFFF', douce: 'rgba(255,255,255,0.72)', accent: '#C4A0F4', marque: '#C4A0F4',
    filet: 'rgba(255,255,255,0.20)',
    badgeFond: '#C4A0F4', badgeEncre: '#1A0840', badgeMarque: '#1A0840',
    pastFond: 'rgba(255,255,255,0.10)', pastFilet: 'rgba(255,255,255,0.28)', pastEncre: '#EDE0FF',
  },
  [TYPE_ACTU]: {
    badge: 'NOUVEAUTÉ', marqueSurBadge: false, pointsClairs: true,
    fond: '#FFFDFF', fondBas: '#EDE6FA',
    encre: '#1A0840', douce: '#4B4B57', accent: '#6B35C4', marque: '#9660E0',
    filet: '#EDE0FF',
    badgeFond: '#EDE0FF', badgeEncre: '#2D0F6B', badgeMarque: '#2D0F6B',
    pastFond: '#FFFFFF', pastFilet: '#EDE0FF', pastEncre: '#4B4B57',
  },
}

/** L'habit d'un type, avec repli sur l'actualité pour un type inconnu. */
export function habitDe(type) {
  return HABITS[type] || HABITS[TYPE_ACTU]
}

// ─── LE BADGE DIT L'OCCASION, PAS TOUJOURS LE TYPE ──────────────────────────
//
// 🔴 DÉFAUT TROUVÉ LE 05/09 EN RÉPONDANT À UNE QUESTION D'ALEX sur la couleur de
// fond. Le générateur propose six occasions, et le visuel annonçait
// « NOUVEAUTÉ » pour les six : un commerçant qui remercie ses clients publiait
// une carte qui dit le contraire de son texte.
//
// ⚠️ L'OCCASION CHANGE LE MOT, JAMAIS L'HABIT. Six fonds pour six occasions
// videraient le langage visuel de son sens : le crème dit « invendu », le violet
// profond dit « deal », et ces deux-là ne doivent pas se confondre, ce qu'Alex a
// fait corriger le 04/09 dans l'application. Le badge, lui, peut porter le mot
// juste sans rien coûter.
//
// ⚠️ ET ON NE PREND QUE CE QU'ON CONNAÎT. Un mot venu de l'écran et recopié tel
// quel sur l'image, c'est l'occasion d'écrire n'importe quoi en gros sur une
// publication.
export const OCCASIONS_BADGE = {
  'Nouveauté': 'NOUVEAUTÉ',
  'Bon plan': 'BON PLAN',
  'Événement': 'ÉVÉNEMENT',
  'Coup de cœur': 'COUP DE CŒUR',
  'Infos pratiques': 'INFOS PRATIQUES',
  'Remerciement': 'MERCI',
}

/**
 * Le mot du badge : celui de l'occasion quand elle est connue, sinon celui du
 * type.
 */
export function badgeDe(type, occasion) {
  const mot = OCCASIONS_BADGE[String(occasion || '').trim()]
  // ⚠️ SEULE L'ACTUALITÉ SUIT L'OCCASION. Un invendu porte « Rien ne se perd »
  // et un deal « Deal du jour » : ce sont des objets de l'application, pas des
  // intentions de communication, et leur nom ne se négocie pas.
  if (type === TYPE_ACTU && mot) return mot
  return habitDe(type).badge
}

/** Les couleurs des cinq points, selon le fond. Reprises de la spec du logo. */
export const POINTS_SUR_CLAIR = ['#1A0840', '#6B35C4', '#6B35C4', '#9660E0', '#9660E0']
export const POINTS_SUR_SOMBRE = ['#FFFFFF', '#C4A0F4', '#C4A0F4', '#9660E0', '#9660E0']

/**
 * Les cinq points du logo, prêts à tracer, pour un diamètre de grand point.
 *
 * ⚠️ LES PROPORTIONS VIENNENT DE `lib/logo.js`, jamais recopiées. Le décalage
 * porte sur les points 2, 3 et 4 : appliqué aux seuls petits, la ligne s'aplatit
 * et le logo n'est plus le logo.
 */
export function pointsDuVisuel(diametre, surClair = true) {
  const corps = diametre / 0.254
  const { dotGap } = proportionsLogo(corps)
  const couleurs = surClair ? POINTS_SUR_CLAIR : POINTS_SUR_SOMBRE
  let x = 0
  return pointsLogo(corps).map((p, i) => {
    const point = { x, diametre: p.diametre, decalage: p.decalage, couleur: couleurs[i] }
    x += p.diametre + dotGap
    return point
  })
}

/** La largeur totale de la rangée de points. */
export function largeurDesPoints(diametre) {
  const pts = pointsDuVisuel(diametre)
  const dernier = pts[pts.length - 1]
  return dernier.x + dernier.diametre
}

// ─── LE REPLI DU TEXTE ──────────────────────────────────────────────────────
//
// 🔴 `fillText` NE REPLIE NI NE RÉTRÉCIT : il déborde, et le canvas coupe, sans
// rien dire. `lib/affiche-kit.js` a réglé le cas d'une ligne unique en réduisant
// la taille jusqu'à ce que ça tienne. Ça ne suffit pas ici : « Assortiment de
// pâtisseries du jour » en 82 px devrait descendre à 30 px pour tenir sur une
// ligne, et le titre ne serait plus un titre.
//
// ⚠️ ON REPLIE D'ABORD, ON RÉDUIT ENSUITE, et seulement s'il le faut.

/**
 * Coupe un texte en lignes qui tiennent dans `largeur`.
 *
 * @param {Function} mesurer (texte) => largeur en pixels
 * @param {string}   texte
 * @param {number}   largeur
 * @param {number}   maxLignes au-delà, on tronque la dernière ligne
 * @returns {string[]}
 */
export function replierTexte(mesurer, texte, largeur, maxLignes = 3) {
  const mots = String(texte || '').trim().split(/\s+/).filter(Boolean)
  if (!mots.length) return []
  // 🔴 UN SEUL MÉCANISME DE PLAFOND, ET C'EST LE HARNAIS QUI L'A EXIGÉ (05/09).
  //
  // J'en avais posé DEUX : un arrêt dans la boucle et une coupe à la sortie
  // (`slice`). Chacun seul donnait le bon résultat, donc casser l'un des deux
  // laissait le banc VERT : deux mutations sont passées sans être vues.
  //
  // ⚠️ ET LA COUPE NE POUVAIT JAMAIS SE DÉCLENCHER : tant que l'arrêt existe,
  // la liste n'atteint jamais plus que le plafond. C'était donc une garde qui ne
  // se déclenche jamais, et le projet en connaît le prix : elle est pire qu'une
  // garde absente, parce qu'elle rassure sans protéger.
  //
  // ⚠️ LE PLAFOND EST NORMALISÉ ICI : à zéro ou à `NaN`, l'arrêt ne serait jamais
  // atteint et la fonction rendrait tout le texte, ligne par ligne.
  const plafond = Math.max(1, Math.floor(Number(maxLignes)) || 1)
  const lignes = []
  let courante = mots[0]
  for (let i = 1; i < mots.length; i++) {
    const essai = `${courante} ${mots[i]}`
    if (mesurer(essai) <= largeur) { courante = essai; continue }
    lignes.push(courante)
    courante = mots[i]
    // ⚠️ ON S'ARRÊTE AVANT DE DÉPASSER, pas après : une ligne de trop est déjà
    // sortie du cadre au moment où on s'en aperçoit.
    if (lignes.length === plafond) return lignes
  }
  lignes.push(courante)
  return lignes
}

/**
 * La taille à laquelle un texte tient en `maxLignes` au plus.
 *
 * ⚠️ ON NE DESCEND JAMAIS SOUS `mini`. En dessous, le titre cesse d'être un
 * titre : mieux vaut alors couper le texte, ce que fait `replierTexte`.
 */
export function taillePourTenir(mesurerA, texte, largeur, taille, mini, maxLignes) {
  let t = taille
  while (t > mini && replierTexte(m => mesurerA(m, t), texte, largeur, maxLignes + 1).length > maxLignes) {
    t -= 2
  }
  return t
}

// ─── LE TITRE D'UNE AFFICHE N'EST PAS UNE PHRASE ────────────────────────────
//
// 🔴 ALEX, 05/09, SUR CAPTURE : « peut-être faudrait-il adapter, réduire,
// limiter le nombre de caractères pour le titre et la description ».
//
// Le diagnostic est plus précis que « trop long » : la carte recevait LES
// MAUVAIS CHAMPS. Le titre était la version COURTE du post, c'est-à-dire une
// phrase entière avec deux points, un prix et un emoji. Ce n'est pas un titre,
// c'est un post écrit en très gros.
//
// ⚠️ LE REMÈDE PRINCIPAL EST EN AMONT : le modèle écrit désormais une
// « accroche » de deux à cinq mots, faite pour une affiche. Ce qui suit est le
// FILET, pour les réponses qui n'en portent pas et pour les autres appelants
// (un invendu, un deal) dont le titre vient du catalogue et peut être long.
//
// 🔴 ET ON NE TRONQUE PAS UN TITRE. « Une nouveauté au Centre Respire : le
// Rei… » ne veut plus rien dire, et c'est la leçon répétée deux fois aujourd'hui
// sur la bande de l'accueil et sur l'adresse du visuel. On coupe à la PREMIÈRE
// PONCTUATION FORTE, là où une phrase se casse naturellement en deux.

/**
 * Le texte sans emoji ni symbole décoratif.
 *
 * ⚠️ SUR UNE AFFICHE, UN EMOJI DÉTONNE. Il est rendu en couleurs par le système,
 * au milieu d'une typographie choisie : la carte cesse d'avoir l'air dessinée.
 * Il reste dans le TEXTE du post, où il est à sa place.
 */
export function sansEmoji(texte) {
  return String(texte || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Combien de mots au plus sur le titre d'une affiche. */
export const TITRE_MOTS_MAX = 7
/** Combien de caractères au plus sur le sous-titre. */
export const DESC_CAR_MAX = 120

/**
 * Ramène un texte à la taille d'un titre d'affiche.
 *
 * ⚠️ TROIS PASSES, DANS CET ORDRE, ET AUCUNE NE COUPE UN MOT :
 *   1. on retire les emojis ;
 *   2. on garde ce qui précède la première ponctuation forte, si ça suffit ;
 *   3. sinon on garde les premiers mots entiers, SANS points de suspension : un
 *      titre a le droit d'être un fragment, il n'a pas le droit d'être coupé.
 */
export function accrocheVisuelle(texte, maxMots = TITRE_MOTS_MAX) {
  const propre = sansEmoji(texte).replace(/\s*[:!?.;]\s*$/, '')
  if (!propre) return ''
  const plafond = Math.max(1, Math.floor(Number(maxMots)) || 1)
  if (propre.split(/\s+/).length <= plafond) return propre
  // ⚠️ LA PONCTUATION FORTE D'ABORD : « Une nouveauté au Centre Respire : le
  // Reiki arrive » se casse au deux-points, et la moitié gauche est le titre.
  const coupe = propre.split(/\s*[:!?.]\s+|\s*[:!?.]$/)[0].trim()
  if (coupe && coupe.split(/\s+/).length <= plafond) return coupe
  return propre.split(/\s+/).slice(0, plafond).join(' ')
}

/**
 * Ramène un texte à la taille d'un sous-titre.
 *
 * ⚠️ ICI L'ELLIPSE EST HONNÊTE, contrairement au titre : une description est de
 * la prose, et les points de suspension disent qu'elle continue. Mais on coupe
 * toujours à un mot entier.
 */
export function resumeVisuel(texte, maxCar = DESC_CAR_MAX) {
  const propre = sansEmoji(texte)
  if (!propre) return ''
  const plafond = Math.max(20, Math.floor(Number(maxCar)) || DESC_CAR_MAX)
  if (propre.length <= plafond) return propre
  const tranche = propre.slice(0, plafond)
  const dernier = tranche.lastIndexOf(' ')
  return `${(dernier > 20 ? tranche.slice(0, dernier) : tranche).replace(/[\s,;:]+$/, '')}…`
}

// ─── CE QUE LA CARTE DIT ────────────────────────────────────────────────────
//
// ⚠️ CHAQUE ÉLÉMENT N'APPARAÎT QUE SI LA DONNÉE EXISTE. Un prix barré absent ne
// laisse pas un blanc, il disparaît, et l'écart entre les blocs se referme. Un
// visuel ne doit jamais annoncer ce que la fiche ne dit pas : c'est la même
// règle que pour l'assistant de rédaction.
//
// 🔴 ET IL N'INVENTE AUCUNE QUANTITÉ NI AUCUNE HEURE. Une carte est vue des
// heures après avoir été publiée : « il en reste 3 » n'est vrai qu'au moment du
// dessin. On l'affiche parce que le commerçant la publie sciemment pour ce
// soir-là, mais jamais sur un deal, qui dure la semaine.

/**
 * Normalise une annonce en blocs à dessiner.
 *
 * @returns {object|null} `null` si l'essentiel manque
 */
export function contenuVisuel({
  type = TYPE_ACTU, enseigne = '', titre = '', occasion = null,
  prix = null, prixBarre = null, suffixe = null, description = null,
  tempsRestant = null, lien = null,
} = {}) {
  // ⚠️ LE FILET S'APPLIQUE ICI, POUR TOUS LES APPELANTS. Le générateur reçoit
  // désormais une accroche écrite pour l'affiche, mais un invendu ou un deal
  // apporte le titre de son article, qui vient du catalogue et peut faire
  // quarante caractères. Un seul endroit qui décide, jamais l'écran.
  const nom = accrocheVisuelle(enseigne, 6)
  const quoi = accrocheVisuelle(titre)
  // 🔴 SANS TITRE NI ENSEIGNE, IL N'Y A PAS DE CARTE. En dessiner une vide
  // enverrait le commerçant publier un rectangle violet.
  if (!quoi || !nom) return null

  const habit = habitDe(type)
  const nombre = (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const p = nombre(prix)
  const pb = nombre(prixBarre)
  // ⚠️ UN PRIX BARRÉ QUI NE DÉPASSE PAS LE PRIX N'EN EST PAS UN. L'afficher
  // ferait passer une hausse pour une remise.
  const barreUtile = p !== null && pb !== null && pb > p ? pb : null
  const remise = barreUtile ? Math.round((1 - p / barreUtile) * 100) : null

  // ⚠️ LA PASTILLE EST RÉSERVÉE À L'INVENDU. Un deal n'a pas d'heure de fin :
  // lui en coller ferait des deux le même objet, ce qu'Alex a fait corriger dans
  // l'application le 04/09.
  //
  // 🔴 ET ELLE NE DIT PLUS LE STOCK (05/09, en branchant les vrais boutons).
  // « Il en reste 3 » n'est vrai qu'à la seconde du dessin, et une image publiée
  // ne se corrige pas : elle répétera ce chiffre la semaine prochaine. C'est
  // exactement ce que `texteDePartage` refuse déjà côté Yopper — « un chiffre
  // gravé dans un message devient faux tout seul » — et deux règles opposées sur
  // la même donnée dans le même produit, c'est une de trop.
  //
  // ⚠️ L'HEURE, ELLE, RESTE VRAIE. « Jusqu'à 18 h 30 » est fixé à la
  // publication et le demeure toute la soirée : c'est un fait, pas un compteur.
  const pastilles = []
  if (type === TYPE_INVENDU && tempsRestant) {
    pastilles.push({ icone: 'horloge', texte: String(tempsRestant) })
  }

  return {
    type, habit,
    // ⚠️ LE MOT DU BADGE EST DÉCIDÉ ICI, pas au tracé : c'est une décision, et
    // les décisions se mesurent au banc.
    badge: badgeDe(type, occasion),
    enseigne: nom,
    titre: quoi,
    description: type === TYPE_ACTU && description ? (resumeVisuel(description) || null) : null,
    prix: p,
    prixBarre: barreUtile,
    remise: remise && remise > 0 ? `-${remise} %` : null,
    suffixe: suffixe ? String(suffixe).trim() : null,
    pastilles,
    // ⚠️ L'ADRESSE EST LA SEULE CHOSE QUI RAMÈNE QUELQU'UN. Sans elle, on
    // dessine une belle image qui travaille pour Facebook, ce qu'on vient
    // justement de corriger dans le générateur.
    adresse: adresseLisible(lien),
  }
}

/**
 * L'adresse telle qu'elle s'écrit sur une image.
 *
 * ⚠️ SANS « https:// » NI « www. » : personne ne les recopie, et ils mangent la
 * largeur dont l'adresse a besoin pour rester lisible. Ce qui compte est ce
 * qu'un lecteur va taper.
 */
export function adresseLisible(lien) {
  const url = String(lien || '').trim()
  if (!url) return null
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')
}

/**
 * Le nom du fichier téléchargé.
 *
 * ⚠️ IL DIT CE QU'IL CONTIENT. Un commerçant qui télécharge trois visuels dans
 * la journée doit les distinguer dans son dossier sans les ouvrir.
 */
export function nomFichierVisuel(type, format, slug) {
  const morceaux = ['yoppaa', String(type || 'post'), String(format || FORMAT_CARRE)]
  const s = String(slug || '').trim()
  if (s) morceaux.push(s)
  return `${morceaux.join('-').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.png`
}

// ─── ON NE PARTAGE QUE CE QUI EST ENCORE EN LIGNE ───────────────────────────
//
// 🔴 UN POST SURVIT À CE QU'IL ANNONCE. Le deal d'hier, l'actualité dont la date
// de fin est passée, l'offre qu'on vient d'éteindre : la carte disparaît de
// Yoppaa, la publication reste sur Facebook. Proposer le partage depuis une
// carte éteinte, c'est fabriquer un post qui envoie des gens vers une fiche où
// ils ne trouveront rien, et c'est nous qu'ils jugeront.
//
// ⚠️ UNE DATE DE FIN EST UNE FIN DE JOURNÉE, PAS UN INSTANT. Un deal daté
// d'aujourd'hui se partage toute la journée : la comparaison est `>=`, jamais
// `>`. C'est la même règle que `dealsActuels` dans le tableau de bord, et elle
// doit dire la même chose, sinon la carte s'affiche et le bouton manque.
//
// ⚠️ ET SANS REPÈRE DE DATE, ON NE PROPOSE PAS. Des deux erreurs possibles,
// celle-ci est la moins chère : un bouton absent se voit tout de suite et se
// signale, un post publié vers une offre morte ne se rattrape plus.

/**
 * Cette annonce peut-elle encore être partagée ?
 *
 * @param {boolean} actif l'interrupteur de l'annonce
 * @param {string|null} dateFin sa date de fin en `AAAA-MM-JJ`, ou rien
 * @param {string|null} aujourdhui le jour courant en `AAAA-MM-JJ`
 */
export function partageable(actif, dateFin, aujourdhui) {
  if (actif === false) return false
  const fin = String(dateFin || '').trim()
  if (!fin) return true
  const jour = String(aujourdhui || '').trim()
  if (!jour) return false
  return fin >= jour
}

// ─── LE PRIX TEL QU'IL S'ÉCRIT SUR UNE AFFICHE ──────────────────────────────
//
// ⚠️ SANS LES CENTIMES QUAND ILS SONT NULS : « 9 € », pas « 9,00 € ». C'est la
// seule raison pour laquelle il ne passe pas par `lib/montants.js`, dont le
// format est celui d'un ticket de caisse et qui a toute sa place partout
// ailleurs.
//
// 🔴 ET IL VIT ICI PARCE QUE DEUX ENDROITS L'ÉCRIVENT : l'image et la légende
// qui l'accompagne. Le tracé en avait sa propre copie ; deux formats pour le
// même prix, sur la même publication, c'est le genre de divergence qui se voit
// tout de suite et qui fait douter du reste.

/** Le prix d'un visuel, en euros, centimes muets s'ils sont nuls. */
export function prixDuVisuel(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return `${v.toFixed(2).replace('.', ',').replace(/,00$/, '')} €`
}

// ─── LA LÉGENDE QUI ACCOMPAGNE LE VISUEL ────────────────────────────────────
//
// ⚠️ ELLE N'INVENTE RIEN, ET SURTOUT AUCUNE URGENCE. « Dépêche-toi », « dernière
// chance », « à ne pas manquer » : ce serait Yoppaa qui parlerait à la place du
// commerçant, sur SA page, à SES clients. Elle n'assemble que des données de
// l'annonce, et il ajoute ses mots s'il en veut.
//
// ⚠️ ELLE PEUT EN DIRE PLUS QUE L'IMAGE, ET C'EST NORMAL. Un deal n'affiche pas
// sa description sur le visuel — elle y prendrait la place du prix — mais elle a
// toute sa place dans la légende, où elle ne coûte pas un pixel. Ce sont les
// mots du commerçant, pas une invention.
//
// ⚠️ ET ELLE NE DIT PAS LE STOCK, pour la même raison que la pastille l'a perdu
// et que `texteDePartage` l'a toujours refusé côté Yopper : un chiffre gravé
// dans un texte devient faux tout seul.
//
// ⚠️ LES MONTANTS ARRIVENT EN NOMBRES, jamais déjà mis en forme. Laisser
// l'appelant formater aurait rouvert la divergence que `prixDuVisuel` vient de
// fermer.

/**
 * La légende d'un visuel, faite des seules informations de l'annonce.
 *
 * @param {object} a l'annonce : `titre`, `prix`, `prixBarre`, `jusqua`,
 *   `description`, et `mention`, la phrase de fin propre au type.
 * @returns {string} la légende, sans le lien : c'est `postAvecSignature` qui
 *   l'ajoute, comme pour un post du générateur.
 */
export function legendeVisuel({
  titre = '', prix = null, prixBarre = null, jusqua = null,
  description = null, mention = null,
} = {}) {
  const quoi = String(titre || '').trim()
  if (!quoi) return ''

  const p = Number(prix)
  const pb = Number(prixBarre)
  const aPrix = Number.isFinite(p) && p > 0
  // ⚠️ MÊME RÈGLE QUE SUR L'IMAGE : un prix barré qui ne dépasse pas le prix
  // n'en est pas un, et l'écrire ferait passer une hausse pour une remise.
  const aBarre = aPrix && Number.isFinite(pb) && pb > p

  let phrase = quoi
  if (aPrix) {
    phrase += ` à ${prixDuVisuel(p)}`
    if (aBarre) phrase += ` au lieu de ${prixDuVisuel(pb)}`
  }
  const quand = String(jusqua || '').trim()
  if (quand) phrase += `, ${quand}`
  phrase += '.'

  const lignes = [phrase]
  const suite = String(description || '').trim()
  if (suite) lignes.push(suite)
  const fin = String(mention || '').trim()
  if (fin) lignes.push(fin.endsWith('.') ? fin : `${fin}.`)
  return lignes.join('\n\n')
}
