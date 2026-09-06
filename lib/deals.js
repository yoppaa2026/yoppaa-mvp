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

// ─── LES PRESTATIONS DE RENDEZ-VOUS ─────────────────────────────────────────
//
// 🔴 UN COMMERCE DE SERVICE NE POUVAIT PAS METTRE CE QU'IL VEND EN PROMOTION
// (Alex, 06/09). Le champ « Article concerné » d'un deal ne lisait que
// `articles` : une prof de yoga voyait ses shampoings remisables et pas ses
// cours, c'est-à-dire l'inverse de son métier.
//
// ⚠️ SEULES LA REMISE % ET LE PRIX PROMO S'APPLIQUENT ICI, et ce n'est pas une
// simplification : un « lot de 3 séances + 1 offerte » EXISTE DÉJÀ dans Yoppaa
// sous la forme d'un CARNET D'ABONNEMENT, qui décompte les séances, porte une
// validité et sait exclure des périodes. Le permettre aussi en deal donnerait
// deux systèmes qui comptent les séances différemment, et le commerçant le
// découvrirait sur un client qui revient une fois de trop. La base l'interdit
// (`yoppaa_deals_prestation_type_check`), et ce module ne s'y fie pas : des
// lignes antérieures à la contrainte peuvent exister.
//
// ⚠️ UNE PRESTATION VISÉE NOMMÉMENT, JAMAIS PAR CATÉGORIE. `rdv_prestations`
// n'a pas de colonne `categorie` : une remise « sur toute une catégorie » n'y
// aurait aucune cible, et `categorie_cible` désigne des catégories d'ARTICLES.
// Sans ce garde-fou, une remise « -20 % sur les shampoings » s'appliquerait
// aussi aux soins.
//
// 🔴 ET UNE PRESTATION SANS PRIX NE SE REMISE PAS. `rdv_prestations.prix` est
// NULLABLE : « Prix sur demande » est un choix du commerçant. Vingt pour cent
// de rien ne veut rien dire, et `Number(null)` vaut ZÉRO — le piège du zéro,
// neuvième fois dans ce projet.

/** Le deal vise-t-il cette prestation ? Nommément, et c'est la seule façon. */
export function dealVisePrestation(deal, prestation) {
  if (!deal || !prestation) return false
  if (!deal.prestation_id || !prestation.id) return false
  return deal.prestation_id === prestation.id
}

/**
 * La meilleure remise applicable à une prestation, ou `null`.
 *
 * ⚠️ LA PLUS AVANTAGEUSE POUR LE CLIENT quand plusieurs se chevauchent, comme
 * pour les articles : personne ne comprendrait de payer plus cher parce que
 * deux promotions tombent le même jour.
 *
 * @returns {{deal:object, prix:number, prixBarre:number}|null}
 */
export function remiseSurPrestation(prestation, deals = [], jourISO) {
  if (!prestation) return null
  // ⚠️ ON EXIGE UN PRIX VALABLE, on n'écarte pas des cas d'absence un par un.
  // `Number(null)` vaut 0 et `Number(undefined)` vaut NaN : les énumérer serait
  // fragile, il suffirait d'en oublier un.
  const prixPlein = Number(prestation.prix)
  if (!Number.isFinite(prixPlein) || prixPlein <= 0) return null

  let meilleure = null
  for (const deal of deals) {
    if (!estRemiseSurProduit(deal)) continue
    if (!dealActifCeJour(deal, jourISO)) continue
    if (!dealVisePrestation(deal, prestation)) continue

    const prix = deal.deal_type === TYPE_REMISE
      ? arrondi(prixPlein * (100 - Number(deal.remise_pct || 0)) / 100)
      : arrondi(deal.prix_deal)

    // Une « remise » qui augmente le prix n'en est pas une.
    if (!Number.isFinite(prix) || prix <= 0 || prix >= prixPlein) continue
    if (!meilleure || prix < meilleure.prix) {
      meilleure = { deal, prix, prixBarre: arrondi(prixPlein) }
    }
  }
  return meilleure
}

/**
 * Prix effectif d'une prestation, remise comprise. `null` si le prix est
 * inconnu — « Prix sur demande » n'est pas un montant.
 *
 * 🔴 LE PIÈGE DU ZÉRO M'A REPRIS ICI, NEUVIÈME FOIS DANS CE PROJET, deux lignes
 * sous le commentaire où je venais de le nommer. La première version testait
 * `Number.isFinite(plein)` : or `Number(null)` vaut ZÉRO, qui est fini. Une
 * prestation « Prix sur demande » rendait donc 0, c'est-à-dire GRATUITE —
 * affichée « 0,00 € » sur la fiche au lieu de « Sur demande », et enregistrée à
 * zéro sur le rendez-vous. Attrapé par le banc, pas par la relecture.
 *
 * ⚠️ ON EXIGE DONC UN PRIX STRICTEMENT POSITIF, comme `remiseSurPrestation`
 * juste au-dessus. Les deux fonctions doivent dire la même chose de la même
 * donnée.
 */
export function prixEffectifPrestation(prestation, deals = [], jourISO) {
  const remise = remiseSurPrestation(prestation, deals, jourISO)
  if (remise) return remise.prix
  const plein = Number(prestation?.prix)
  return Number.isFinite(plein) && plein > 0 ? arrondi(plein) : null
}

/**
 * L'ACOMPTE SUIT LE PRIX REMISÉ, et c'est le cœur du sujet côté argent.
 *
 * 🔴 UN ACOMPTE CALCULÉ SUR LE PRIX PLEIN D'UNE PRESTATION REMISÉE FAIT PAYER
 * D'AVANCE PLUS QUE SA PART. Sur un soin à 50 € remisé à 40 € avec 50 %
 * d'acompte, c'est 25 € au lieu de 20 : le client voit « -20 % » et paie un
 * acompte de plein tarif. Le serveur doit donc partir du prix remisé, jamais
 * du prix de la fiche.
 *
 * ⚠️ ET LE POURCENTAGE, LUI, NE BOUGE PAS. Il vit sur la prestation, pas sur le
 * deal : une remise change le montant, pas la politique d'acompte du commerçant.
 *
 * @returns {{prix:number, acompte:number, solde:number}} tout en euros arrondis
 */
export function montantsPrestation(prestation, deals = [], jourISO) {
  const prix = prixEffectifPrestation(prestation, deals, jourISO)
  const base = Number.isFinite(prix) && prix > 0 ? prix : 0
  const pct = Number(prestation?.acompte_pourcent)
  const part = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0
  const acompte = arrondi(base * part / 100)
  return { prix: base, acompte, solde: arrondi(base - acompte) }
}
