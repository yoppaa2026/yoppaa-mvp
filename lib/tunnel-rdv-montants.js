// LA VENTILATION D'UN RENDEZ-VOUS, avec ou sans produits.
//
// 🔴 POURQUOI CE MODULE EXISTE. Le même montant était calculé à TROIS endroits :
// deux fois dans l'écran du tunnel et une fois dans chaque route serveur. Le
// 29/08, Alex a reçu une confirmation annonçant « ACOMPTE 8,75 € ✓ payé en
// ligne » sur un rendez-vous où l'acompte valait ZÉRO, parce que son bon cadeau
// couvrait la prestation. Un des trois calculs prenait le prix PLEIN.
//
// ⚠️ ET AUCUN BANC NE POUVAIT LE VOIR : les trois calculs étaient justes
// séparément, c'est leur DIVERGENCE qui mentait. Une règle qui vit à trois
// endroits finit toujours par vivre à trois vitesses.
//
// ═══════════════════════════════════════════════════════════════════════════
// LES DEUX AVANTAGES N'ONT PAS LA MÊME PORTÉE (décision d'Alex, 29/08)
//
//   • LE BON CADEAU PAIE TOUT : la prestation ET les produits. C'est de
//     l'argent DÉJÀ VERSÉ chez ce commerçant le jour où quelqu'un a acheté le
//     bon. Le limiter à la prestation était arbitraire, et surtout illisible :
//     le client voyait « −25,00 € déduits » et « tu paies 43,80 € », soit très
//     exactement le même montant qu'avant la déduction.
//
//   • LA RÉCOMPENSE DE FIDÉLITÉ PAIE LA PRESTATION SEULE. C'est une remise
//     OFFERTE sur un acte, pas un avoir : le commerçant n'a pas à offrir sa
//     marge sur de la marchandise qu'il revend.
//
// ⚠️ L'ORDRE NE CHANGE PAS : la récompense s'applique AVANT le bon. Dans
// l'autre sens, le porteur du bon brûlerait du solde sur une part qui lui était
// offerte de toute façon.
//
// ⚠️ ET LE BON SE VENTILE EN DEUX : ce qu'il paie sur la prestation vit sur le
// rendez-vous, ce qu'il paie sur les produits vit sur la commande. Ce n'est pas
// un raffinement comptable, c'est la base : à l'annulation, le client peut
// GARDER ses produits, et alors seule la part prestation lui revient.
// ═══════════════════════════════════════════════════════════════════════════

const arrondi = (n) => Math.round(Number(n || 0) * 100) / 100

// ⚠️ LE PIÈGE DU ZÉRO, encore : `Number(null)` vaut 0 et EST fini. Un prix
// absent (prestation sur devis) et un prix nul ne sont pas la même chose, et
// les confondre ferait annoncer « gratuit » sur ce qu'on ne sait pas chiffrer.
function nombreOuNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {object} e
 *   prixPrestation   : prix affiché de la prestation, ou null (sur devis)
 *   acomptePourcent  : 0 à 100, le pourcentage demandé
 *   acompteEnLigne   : le commerçant encaisse-t-il l'acompte en ligne
 *   totalProduits    : prix complet des produits du panier (0 s'il n'y en a pas)
 *   remiseRecompense : montant déjà calculé de la récompense (0 si aucune)
 *   soldeBon         : solde disponible sur le bon cadeau (0 si aucun)
 */
export function ventilerTunnelRdv({
  prixPrestation = null,
  acomptePourcent = 0,
  acompteEnLigne = false,
  totalProduits = 0,
  remiseRecompense = 0,
  soldeBon = 0,
} = {}) {
  const prix = nombreOuNull(prixPrestation)
  const produits = Math.max(0, arrondi(totalProduits))
  const pct = Number(acomptePourcent) || 0

  // La récompense ne mord que sur la prestation, et jamais au-delà.
  const recompense = prix === null ? 0 : arrondi(Math.min(Math.max(0, Number(remiseRecompense) || 0), prix))
  const prestaApresRecompense = prix === null ? null : arrondi(Math.max(0, prix - recompense))

  // Le bon paie la prestation d'abord, les produits ensuite. Cet ordre n'est
  // pas neutre : la part prestation est celle qui revient toujours au client à
  // l'annulation, alors que la part produits ne revient que s'il les rend.
  let bonRestant = Math.max(0, arrondi(soldeBon))
  const bonSurPresta = prestaApresRecompense === null ? 0 : arrondi(Math.min(bonRestant, prestaApresRecompense))
  bonRestant = arrondi(bonRestant - bonSurPresta)
  const bonSurProduits = arrondi(Math.min(bonRestant, produits))
  const bonTotal = arrondi(bonSurPresta + bonSurProduits)

  const prestaNette = prestaApresRecompense === null ? null : arrondi(prestaApresRecompense - bonSurPresta)
  const produitsAPayer = arrondi(produits - bonSurProduits)

  // ⚠️ L'ACOMPTE SE CALCULE SUR LA PRESTATION NETTE (règle F22, Alex 24/08).
  // Sinon le Yopper avancerait un acompte assis sur un prix qu'il ne paie pas.
  const acompte = (acompteEnLigne && prestaNette !== null && pct > 0)
    ? arrondi(Math.round(prestaNette * pct) / 100)
    : 0

  return {
    prixPrestation: prix,
    remiseRecompense: recompense,
    bonSurPresta,
    bonSurProduits,
    bonTotal,
    prestaNette,
    produitsAPayer,
    acompte,
    // Ce que Stripe encaisse maintenant : l'acompte plus les produits non
    // couverts par le bon.
    aPayerMaintenant: arrondi(acompte + produitsAPayer),
    // Ce qui restera à régler au comptoir : le solde de la prestation. Les
    // produits sont payés en entier, ils ne laissent jamais de solde.
    // `null` quand le prix est inconnu : « on ne sait pas » n'est pas « zéro ».
    soldeSurPlace: prestaNette === null ? null : arrondi(Math.max(0, prestaNette - acompte)),
  }
}
