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
