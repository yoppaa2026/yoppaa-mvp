// Règle UNIQUE des promotions Yoppaa, pour toutes les catégories de commerce.
//
// LE PROBLÈME QUE CE FICHIER RÈGLE. La logique des deals était réécrite dans
// quatre endroits différents : la fiche commerçant, la fiche de prise de
// rendez-vous, le Good Morning Yoppers et le calcul serveur du panier. Chacun
// interprétait une remise à sa façon. Conséquence visible signalée par Alex le
// 03/08 : un shampoing remisé de 10 % apparaissait DEUX FOIS sur la même page,
// une fois en carte promo et une fois au prix plein, parce que la remise
// créait un produit parallèle au lieu de modifier le produit.
//
// LA RÈGLE, décidée le même jour : le comportement dépend du TYPE de deal.
//
//   • lot et duo (« 3 croissants + 1 offert », « un shampoing + un soin »)
//     restent des OFFRES SÉPARÉES : une unité n'est pas un lot, et la carte
//     distincte est légitime. Elles ont leur propre stock et leur propre prix.
//
//   • remise en pourcentage et prix promo s'appliquent AU PRODUIT lui-même :
//     il affiche son prix barré et son prix remisé, dans le catalogue comme au
//     panier, et AUCUNE carte parallèle n'est créée.
//
// Une remise peut viser un article précis ou une catégorie entière.
//
// ⚠️ Le prix qui fait foi est celui calculé par le SERVEUR, dans
// create-commande, avec ces mêmes fonctions. Un prix calculé dans le
// navigateur n'est qu'un affichage.

import { jourBruxelles } from './timezone'

export const TYPE_LOT = 'lot'
export const TYPE_DUO = 'bundle'
export const TYPE_REMISE = 'remise_pct'
export const TYPE_PRIX_FIXE = 'prix_fixe'

// Une offre séparée s'achète en plus de l'unité, elle ne la remplace pas.
export function estOffreSeparee(deal) {
  return deal?.deal_type === TYPE_LOT || deal?.deal_type === TYPE_DUO
}

// Une remise modifie le prix de l'article visé.
export function estRemiseSurProduit(deal) {
  return deal?.deal_type === TYPE_REMISE || deal?.deal_type === TYPE_PRIX_FIXE
}

// Fenêtre de validité. Deux formats coexistent : une date ponctuelle
// (`date_deal`) ou un intervalle (`date_debut` / `date_fin`). Reproduit à
// l'identique la logique qui existait sur la fiche, pour ne rien changer au
// comportement des deals déjà en place.
// ⚠️ LE JOUR PAR DÉFAUT EST BELGE. `toISOString()` rendait le jour de
// Greenwich : entre minuit et deux heures du matin, un deal du jour était jugé
// sur la VEILLE et disparaissait de la fiche alors qu'il venait de commencer.
export function dealActifCeJour(deal, jourISO = jourBruxelles()) {
  if (!deal || deal.actif === false) return false
  const dateDeal = deal.date_deal || null
  const debut = deal.date_debut ? String(deal.date_debut).slice(0, 10) : null
  const fin   = deal.date_fin   ? String(deal.date_fin).slice(0, 10)   : null
  if (dateDeal === jourISO) return true
  if (debut && fin && debut <= jourISO && jourISO <= fin) return true
  return false
}

// Le deal vise-t-il cet article ? Soit nommément, soit par sa catégorie.
export function dealViseArticle(deal, article) {
  if (!deal || !article) return false
  if (deal.article_id) return deal.article_id === article.id
  if (deal.categorie_cible) return deal.categorie_cible === article.categorie
  return false
}

function arrondi(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// Prix d'un article après remise, s'il y en a une.
//
// Quand plusieurs remises visent le même article, par exemple une remise sur
// l'article ET une remise sur sa catégorie, on retient LA PLUS AVANTAGEUSE
// POUR LE CLIENT. C'est le seul arbitrage défendable devant lui : personne ne
// comprendrait de payer plus cher parce que deux promotions se chevauchent.
//
// Renvoie null si aucune remise ne s'applique.
export function remiseSurArticle(article, deals = [], jourISO) {
  if (!article) return null
  const prixPlein = Number(article.prix)
  if (!Number.isFinite(prixPlein) || prixPlein <= 0) return null

  let meilleure = null
  for (const deal of deals) {
    if (!estRemiseSurProduit(deal)) continue
    if (!dealActifCeJour(deal, jourISO)) continue
    if (!dealViseArticle(deal, article)) continue

    const prix = deal.deal_type === TYPE_REMISE
      ? arrondi(prixPlein * (100 - Number(deal.remise_pct || 0)) / 100)
      : arrondi(deal.prix_deal)

    // Une « remise » qui augmente le prix n'en est pas une : on l'ignore
    // plutôt que de faire payer plus cher au nom d'une promotion.
    if (!Number.isFinite(prix) || prix <= 0 || prix >= prixPlein) continue
    if (!meilleure || prix < meilleure.prix) {
      meilleure = { deal, prix, prixBarre: arrondi(prixPlein) }
    }
  }
  return meilleure
}

// Prix effectif d'un article, remise comprise. Sert au panier et à l'affichage.
export function prixEffectif(article, deals = [], jourISO) {
  const remise = remiseSurArticle(article, deals, jourISO)
  return remise ? remise.prix : arrondi(article?.prix)
}

// Prix d'une VERSION d'article (taille, couleur) sous remise.
//
// Un pourcentage s'applique tel quel à toutes les versions : « -20 % sur ce
// pull » vaut pour le S comme pour le XL. Un prix promo fixe, lui, a été saisi
// en regardant le prix de base : l'appliquer à une version plus chère
// braderait la marchandise sans que le commerçant l'ait voulu. Dans ce cas on
// laisse la version à son prix.
export function prixEffectifVariante(prixVariante, article, deals = [], jourISO) {
  const base = arrondi(prixVariante)
  const remise = remiseSurArticle(article, deals, jourISO)
  if (!remise || remise.deal.deal_type !== TYPE_REMISE) return base
  const prix = arrondi(base * (100 - Number(remise.deal.remise_pct || 0)) / 100)
  return prix > 0 && prix < base ? prix : base
}

// Offres séparées visant cet article : ce sont les seules qui méritent encore
// une carte à part sur la fiche.
export function offresSepareesPourArticle(article, deals = [], jourISO) {
  return (deals || []).filter(d =>
    estOffreSeparee(d) && dealActifCeJour(d, jourISO) && dealViseArticle(d, article)
  )
}
