import { euros } from './montants'

// LA RÉCOMPENSE DE FIDÉLITÉ, DÉPENSÉE EN LIGNE.
//
// ⚠️ DEMANDE D'ALEX (24/08) : « ça doit couvrir le C&C, RDV, et détail ».
// Jusqu'ici la fidélité se GAGNAIT en ligne et ne se DÉPENSAIT qu'au comptoir.
// Pour un snack en Click and Collect, c'est-à-dire le cas d'usage principal,
// c'était incompréhensible.
//
// ⚠️ CE FICHIER NE RÉINVENTE RIEN : il suit la règle du BON CADEAU, écrite dans
// `lib/bons-cadeaux.js` et éprouvée depuis le 31/07. Deux mécaniques de remise
// qui coexistent finissent par diverger sur un arrondi, et c'est la
// comptabilité du commerçant qui paie la différence.

// Le minimum facturable par Stripe, en centimes. Une commande à 0,30 € dus est
// impossible à encaisser : plutôt que de laisser le client dans une impasse, on
// RABOTE la remise pour lui laisser exactement 0,50 € à payer.
const MINIMUM_STRIPE_CENTS = 50

/**
 * Ce qu'une récompense retire réellement d'un total.
 *
 * ⚠️ LA VALEUR VIENT DE LA RÉCOMPENSE, PAS DU COMMERÇANT. C'est tout l'objet de
 * la table `fidelite_recompenses` : le montant a été FIGÉ le jour où le client
 * l'a gagnée. Relire la configuration du commerçant ici, c'est lui permettre de
 * réécrire après coup ce que quelqu'un a déjà mérité.
 *
 * @param {{type:string, valeur:number}} recompense
 * @param {number} totalDu total en euros, AVANT bon cadeau
 * @returns {number} remise en euros (0 si rien à faire)
 */
export function calculerRemiseRecompense(recompense, totalDu) {
  const t = Math.round(Number(totalDu) * 100)
  if (!recompense || !(t > 0)) return 0

  const valeur = Number(recompense.valeur)
  if (!Number.isFinite(valeur) || valeur <= 0) return 0

  let remise
  if (recompense.type === 'remise_pct') {
    // ⚠️ Un pourcentage au-delà de 100 n'a aucun sens et viderait la caisse du
    // commerçant : on le borne plutôt que de faire confiance à une saisie.
    const pct = Math.min(100, valeur)
    remise = Math.round((t * pct) / 100)
  } else {
    remise = Math.round(valeur * 100)
  }

  remise = Math.min(remise, t)

  // Même garde que le bon cadeau : jamais de reste impossible à encaisser.
  const reste = t - remise
  if (reste > 0 && reste < MINIMUM_STRIPE_CENTS) remise = t - MINIMUM_STRIPE_CENTS

  return Math.max(0, remise) / 100
}

/**
 * L'ordre dans lequel les deux avantages s'appliquent, et le reste à payer.
 *
 * ⚠️ LA RÉCOMPENSE D'ABORD, LE BON CADEAU ENSUITE, et ce n'est pas arbitraire.
 * La récompense est une REMISE consentie par le commerçant : elle abaisse le
 * prix. Le bon cadeau est de l'ARGENT DÉJÀ PAYÉ par quelqu'un : il paie ce qui
 * reste. Dans l'autre sens, le bon serait consommé sur une part que le
 * commerçant offrait de toute façon, et son porteur perdrait du solde pour rien.
 *
 * @returns {{remiseRecompense:number, base:number}} base = ce qui reste à
 *          couvrir par le bon cadeau puis par le paiement.
 */
export function appliquerRecompenseAvantBon(recompense, totalDu) {
  const remiseRecompense = calculerRemiseRecompense(recompense, totalDu)
  const base = Math.round((Number(totalDu) - remiseRecompense) * 100) / 100
  return { remiseRecompense, base: base > 0 ? base : 0 }
}

/**
 * Une récompense est-elle utilisable ?
 *
 * ⚠️ LES TROIS CONDITIONS SE VÉRIFIENT ENSEMBLE, côté serveur. Une seule qui
 * manque et un client dépense la récompense d'un autre, ou la même deux fois.
 */
export function recompenseUtilisable(recompense, commercantId) {
  if (!recompense) return { ok: false, raison: 'introuvable' }
  if (recompense.utilisee_at) return { ok: false, raison: 'deja_utilisee' }
  if (recompense.commercant_id !== commercantId) return { ok: false, raison: 'autre_commercant' }
  return { ok: true }
}

/**
 * Le texte montré au Yopper au moment de payer.
 *
 * ⚠️ ON ANNONCE CE QUI SERA RÉELLEMENT DÉDUIT, pas la valeur nominale. Une
 * récompense de 10 € sur un panier à 6 € ne retire pas 10 € : le dire ferait
 * croire à un avoir de 4 € qui n'existe pas.
 */
export function libelleRemiseRecompense(recompense, totalDu) {
  const remise = calculerRemiseRecompense(recompense, totalDu)
  if (remise <= 0) return null
  const euros = `${remise.toFixed(2).replace('.', ',')} €`
  if (recompense.type === 'remise_pct') {
    return `Ta récompense fidélité : -${Number(recompense.valeur)} % (${euros})`
  }
  return `Ta récompense fidélité : -${euros}`
}

/**
 * 🔴 CE QUI SE PERD QUAND LA RÉCOMPENSE VAUT PLUS QUE LE PANIER.
 *
 * Trouvé par Alex le 28/08 : une récompense de 10 € sur un panier à 8 € déduit
 * 8 €, **consomme la récompense entièrement**, et les 2 € disparaissent. L'écran
 * n'en disait pas un mot, et affichait même « 10€ offerts sur ton prochain
 * achat » juste à côté du « −8,00 € ». Deux phrases qui se contredisent.
 *
 * ⚠️ LE DÉFAUT N'ÉTAIT PAS LE PLAFOND, C'ÉTAIT LE SILENCE. Décision d'Alex : on
 * ne bloque pas, on ne reporte pas le reste, ON LE DIT et il choisit. La
 * récompense n'est de toute façon pas active d'office.
 *
 * ⚠️ VAUT AUSSI POUR LE PLANCHER STRIPE : sur un panier à 5,30 €, une
 * récompense de 5 € ne retire que 4,80 € pour laisser 0,50 € encaissable. Les
 * 20 centimes se perdent de la même façon, et se disent pareil.
 *
 * @returns {number} les euros perdus, 0 s'il n'y a rien à signaler.
 */
export function perteRecompense(recompense, totalDu) {
  // Un pourcentage ne peut pas dépasser le panier : il n'y a rien à perdre,
  // sauf le rabot du plancher Stripe, que le calcul ci-dessous attrape aussi.
  const nominal = recompense?.type === 'remise_pct'
    ? (Number(totalDu) * Math.min(100, Number(recompense.valeur) || 0)) / 100
    : Number(recompense?.valeur) || 0
  if (!(nominal > 0)) return 0
  const reelle = calculerRemiseRecompense(recompense, totalDu)
  const perte = Math.round((nominal - reelle) * 100) / 100
  return perte > 0 ? perte : 0
}

/**
 * La phrase qui dit la perte, ou `null` s'il n'y a rien à dire.
 *
 * ⚠️ ELLE DIT LES TROIS CHIFFRES ET LE GESTE. « Tu vas perdre 2 € » sans dire
 * quoi faire ne sert à rien : personne ne cherche une information, il faut lui
 * donner la sortie.
 */
export function libellePerteRecompense(recompense, totalDu, quoi = 'ton panier') {
  const perte = perteRecompense(recompense, totalDu)
  if (perte <= 0) return null
  const reelle = calculerRemiseRecompense(recompense, totalDu)
  return `Ta récompense vaut ${euros(recompense?.type === 'remise_pct' ? reelle + perte : Number(recompense.valeur))} et ${quoi} ${euros(totalDu)} : tu n’en récupères que ${euros(reelle)}, les ${euros(perte)} restants sont perdus. Ajoute un article, ou garde-la pour une prochaine fois.`
}

// ─── Les deux phrases du tunnel ────────────────────────────────────────────
//
// ⚠️ ALEX, 24/08 : « Ta récompense fidélité t'attend » ne DONNE PAS ENVIE et
// ne dit pas ce qui va se passer. Le Yopper doit lire le MONTANT qui lui
// revient et comprendre en une ligne qu'il se déduira de sa commande. Et une
// fois qu'il a cliqué, il doit être félicité, pas informé.
//
// ⚠️ ELLES VIVENT ICI, PAS DANS LES ÉCRANS : le tunnel de commande et celui
// du rendez-vous les affichent tous les deux. Recopiées, elles auraient
// divergé au premier ajustement.

/** Ce qu'on lit AVANT d'avoir cliqué : le montant, et le geste. */
export function libelleOffreRecompense(recompense, totalDu) {
  const remise = calculerRemiseRecompense(recompense, totalDu)
  if (remise <= 0) return null
  const euros = `${remise.toFixed(2).replace('.', ',')} €`
  // ⚠️ ON ANNONCE CE QUI SERA RÉELLEMENT DÉDUIT, jamais la valeur nominale.
  // Une récompense de 10 € sur un panier à 6 € ne retire pas 10 € : le dire
  // ferait croire à un avoir de 4 € qui n'existe pas.
  //
  // ⚠️ Et l'accord suit le montant : « 1,00 € qui t'attend », « 5,00 € qui
  // t'attendent ». Une faute d'accord sur l'écran qui parle d'argent coûte
  // plus cher en crédibilité qu'elle ne coûte de temps à écrire.
  // ⚠️ `calculerRemiseRecompense` rend des EUROS, pas des centimes. J'avais
  // écrit le seuil à 200 en supposant l'inverse : le banc l'a attrapé avant
  // qu'Alex ne lise « 5,00 € qui t'attend » sur son écran.
  // Le pluriel commence à deux : « 1,50 € qui t'attend » est correct.
  const pluriel = remise >= 2 ? 'attendent' : 'attend'
  return `Tu as ${euros} qui t’${pluriel} 🟣`
}

/** Ce qu'on lit APRÈS avoir cliqué : une félicitation, pas un accusé de réception. */
export function libelleRecompenseUtilisee(recompense, totalDu) {
  const remise = calculerRemiseRecompense(recompense, totalDu)
  if (remise <= 0) return null
  const euros = `${remise.toFixed(2).replace('.', ',')} €`
  return `Bravo, tu utilises ta récompense fidélité : -${euros} 🟣`
}

// ─── QUAND IL Y EN A PLUSIEURS ─────────────────────────────────────────────
//
// 🔴 TROUVÉ PAR ALEX LE 25/08, avec deux récompenses en base chez le même
// commerce : le tunnel en proposait UNE, et rien nulle part ne disait que la
// seconde existait. Vu du Yopper, il en avait gagné deux et l'application n'en
// montrait qu'une : il pouvait légitimement croire l'autre perdue.
//
// ⚠️ UNE SEULE PAR COMMANDE, C'EST UN CHOIX, PAS UN OUBLI (arbitrage d'Alex,
// 25/08). La remise est bornée au panier : deux récompenses de 10 € posées sur
// un panier de 12 € seraient toutes deux consommées pour n'en rendre que
// 11,50 €, et le Yopper perdrait 8,50 € DÉJÀ GAGNÉS sans jamais comprendre
// pourquoi. La fidélité sert d'ailleurs à le faire revenir : deux récompenses
// cumulées, c'est une visite au lieu de deux.
//
// ⚠️ MAIS UN CHOIX QUI NE SE DIT PAS SE LIT COMME UNE PERTE. D'où ces phrases.

/**
 * Ce qui reste APRÈS celle qu'on propose maintenant, ou null s'il n'y a rien.
 *
 * ⚠️ `total` COMPTE CELLE QUI EST PROPOSÉE : le reste, c'est `total - 1`.
 * @param {number} total nombre de récompenses disponibles chez ce commerçant
 * @param {'commande'|'rdv'} contexte le tunnel qui pose la question
 */
export function libelleAutresRecompenses(total, contexte = 'commande') {
  const reste = Math.max(0, Math.floor(Number(total) || 0) - 1)
  if (reste <= 0) return null
  const estRdv = contexte === 'rdv'
  if (reste === 1) {
    return `Il t’en reste 1 autre : elle te sera proposée à ${estRdv ? 'ton prochain rendez-vous' : 'ta prochaine commande'}.`
  }
  // ⚠️ « elles te seront proposées à ta prochaine commande » SERAIT FAUX : on
  // n'en propose qu'une à la fois, donc il faudra autant de passages.
  return `Il t’en reste ${reste} autres : elles te seront proposées une par une, à ${estRdv ? 'tes prochains rendez-vous' : 'tes prochaines commandes'}.`
}

/**
 * Ce que la carte du Yopper annonce, au bon nombre.
 *
 * ⚠️ « CHACUNE » N'EST PAS UN ORNEMENT. Le libellé décrit UNE récompense
 * (« 10,00€ offerts ») : écrit à côté d'un « 2 récompenses » sans ce mot, il se
 * lirait comme un total de 10 €, et l'écran mentirait de moitié.
 *
 * @param {number} nombre `fidelite_cartes.recompenses_disponibles`
 * @param {string} libelle le libellé d'UNE récompense
 * @param {{court?:boolean}} options court = la liste « Mes cartes », serrée
 */
export function libelleCarteRecompenses(nombre, libelle, { court = false } = {}) {
  const n = Math.floor(Number(nombre) || 0)
  if (n <= 0) return null
  const quoi = libelle || 'Récompense fidélité'
  if (n === 1) return court ? `Récompense débloquée : ${quoi}` : `Bravo, ta récompense est débloquée : ${quoi} 🟣`
  return court
    ? `${n} récompenses débloquées : ${quoi} chacune`
    : `Bravo, tu as ${n} récompenses débloquées : ${quoi} chacune 🟣`
}
