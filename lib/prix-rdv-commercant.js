// LE PRIX D'UN RENDEZ-VOUS ENCODÉ PAR LE COMMERCE (03/11, Alex au tableau).
//
// 🔴 POURQUOI CE FICHIER EXISTE. En ligne, le serveur applique la promo du
// jour du rendez-vous et le tarif découverte. Au téléphone, le commerçant ou
// son équipe encodait le rendez-vous au prix plein : la cliente qui appelait
// payait plus que celle qui réservait en ligne le même mercredi.
//
// ✅ DÉCISIONS D'ALEX (03/11) :
//   • la promo est PROPOSÉE (déjà cochée) et le commerçant peut la RETIRER ;
//   • le tarif découverte de même ;
//   • c'est le SERVEUR qui calcule : la fenêtre ne dit que « garder » ou
//     « retirer ». Le prix barré d'un email (« Tu as économisé 6 € ») ne peut
//     donc pas être inventé depuis un navigateur.
//   • un rendez-vous DÉPLACÉ par le commerce garde sa promo, et le commerçant
//     peut la retirer à ce moment-là.
//
// ⚠️ Ce module est PUR : la lecture de la base vit dans
// `lib/prix-rdv-commercant-server.js`, qui appelle `prixPrestationServeur`
// (la même règle que la réservation en ligne).

import { accrocheDuDeal } from './promos-visibles'

// Ce que le serveur PROPOSE au commerçant : la promo ou le tarif découverte,
// ou rien. `resultat` est la sortie de `prixPrestationServeur`.
export function reductionProposee(plein, resultat) {
  const pleinN = Number(plein)
  const prix = Number(resultat?.prix)
  if (!Number.isFinite(pleinN) || pleinN <= 0 || !Number.isFinite(prix) || prix <= 0 || prix >= pleinN) return null
  if (resultat.decouverte === true) {
    return { type: 'decouverte', prix, prixPlein: pleinN, titre: 'Tarif découverte', accroche: 'Découverte', dealId: null }
  }
  const deal = resultat.remise?.deal
  if (!deal?.id) return null
  return { type: 'promo', prix, prixPlein: pleinN, titre: deal.titre || 'Promo', accroche: accrocheDuDeal(deal), dealId: deal.id }
}

// L'acompte d'un prix : la même règle que la fenêtre et la route de l'équipe.
export function acompteDuPrix(prix, acomptePct) {
  const pct = Number(acomptePct) || 0
  return prix != null && Number.isFinite(Number(prix)) && pct > 0 ? Math.round(Number(prix) * pct) / 100 : null
}

// Les colonnes de prix à écrire sur le rendez-vous.
// ⚠️ LE TARIF DÉCOUVERTE NE PORTE NI PRIX PLEIN NI PROMO, comme en ligne
// (`traceRdv` rend null quand la découverte remplace la promo) : il se lit
// dans `tarif_decouverte`.
// ⚠️ UN ACOMPTE DÉJÀ PAYÉ NE SE RÉÉCRIT PAS : l'argent est encaissé, seul le
// reste à payer bouge.
export function champsPrixRdv({ plein, reduction = null, garder = true, acomptePct = 0, acomptePaye = false }) {
  const applique = !!(garder && reduction)
  const pleinN = plein != null && Number.isFinite(Number(plein)) ? Number(plein) : null
  const prix = applique ? reduction.prix : pleinN
  const acompte = acompteDuPrix(prix, acomptePct)
  return {
    prix_estime: prix,
    prix_plein: applique && reduction.type === 'promo' ? reduction.prixPlein : null,
    promo_deal_id: applique && reduction.type === 'promo' ? reduction.dealId : null,
    tarif_decouverte: applique && reduction.type === 'decouverte',
    ...(acomptePaye ? {} : { acompte_montant: acompte, acompte_du: acompte }),
  }
}

// Le rendez-vous porte-t-il une réduction qu'on peut retirer ?
export function reductionDuRdv(rdv) {
  if (!rdv || rdv.abonnement_id) return null
  if (rdv.promo_deal_id && Number(rdv.prix_plein) > Number(rdv.prix_estime)) {
    return { type: 'promo', prix: Number(rdv.prix_estime), prixPlein: Number(rdv.prix_plein) }
  }
  if (rdv.tarif_decouverte === true) return { type: 'decouverte', prix: Number(rdv.prix_estime), prixPlein: null }
  return null
}

// La phrase de la fenêtre : « Promo -20 % : 24 € au lieu de 30 € ».
export function phraseReduction(reduction, euros) {
  if (!reduction) return ''
  const fmt = typeof euros === 'function' ? euros : (n) => `${n} €`
  const quoi = reduction.type === 'decouverte' ? 'Tarif découverte' : `Promo ${reduction.accroche && reduction.accroche !== 'Offre' ? reduction.accroche : ''}`.trim()
  return reduction.prixPlein != null
    ? `${quoi} : ${fmt(reduction.prix)} au lieu de ${fmt(reduction.prixPlein)}`
    : `${quoi} : ${fmt(reduction.prix)}`
}
