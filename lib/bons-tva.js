// LE RÉGIME DE TVA D'UN BON CADEAU, ET LE TAUX QU'IL EMPORTE.
//
// 🔴 POURQUOI CE MODULE EXISTE (03/09). La vente d'un bon cadeau n'écrivait
// AUCUNE ligne comptable, alors que le paiement est un direct charge sur le
// compte Stripe du commerçant : l'argent arrive bien chez lui. Six bons vendus
// chez un seul commerce, 345 €, absents du journal, et la colonne « encaissé en
// ligne » que le tableau de bord présente comme la clé du rapprochement ne
// pouvait donc pas se rapprocher.
//
// ⚠️ ET ON NE PEUT PAS SIMPLEMENT AJOUTER LA VENTE AU CHIFFRE D'AFFAIRES :
// l'utilisation du bon y est DÉJÀ comptée, et la même prestation compterait
// deux fois. Tout dépend du régime, et le régime dépend du commerce.
//
// LA RÈGLE BELGE (directive 2016/1065, transposée au Code de la TVA) :
//
//   • BON À USAGE UNIQUE : le taux et le lieu sont connus dès l'émission, cas
//     d'un salon qui ne vend que du 21 %. La TVA est due À LA VENTE, et
//     l'utilisation n'est PLUS une opération taxable.
//   • BON À USAGES MULTIPLES : le taux n'est pas certain à l'achat, cas d'une
//     épicerie qui mélange 6 et 21. La TVA est due À L'UTILISATION, et la vente
//     n'est qu'un mouvement financier.
//
// ⚠️ LE CHIFFRE D'AFFAIRES ET LA TVA VOYAGENT ENSEMBLE. Poser la TVA à la vente
// en laissant le chiffre d'affaires à l'utilisation donnerait une ligne qui se
// contredit toute seule : base + TVA doit valoir le TTC, un comptable le
// vérifie en premier. Et laisser la TVA aux DEUX bouts la déclarerait deux fois.
//
// ⚠️ LE RÉGIME N'EST PAS UNE PRÉFÉRENCE, C'EST UN FAIT. Un interrupteur nu dans
// les réglages inviterait à choisir le plus commode. On le DÉDUIT donc du
// catalogue, et le réglage ne sert qu'à corriger une déduction fausse.
//
// Ces règles sont informatives et ne valent pas avis fiscal.

import { normaliser } from './tva'

export const USAGE_UNIQUE = 'usage_unique'
export const USAGE_MULTIPLE = 'usage_multiple'

/**
 * Le régime applicable et, sous le régime à usage unique, le taux qui sera figé
 * sur le bon.
 *
 * ⚠️ ON NE LIT QUE LES TAUX RÉELLEMENT VENDABLES AUJOURD'HUI. Le taux « sur
 * place » d'un article est volontairement ignoré : la consommation en salle
 * n'existe pas encore dans Yoppaa (voir lib/tva.js), et le compter ferait
 * basculer en usages multiples des commerces qui n'ont qu'un seul taux réel.
 * Le jour où la commande à table arrivera, il faudra l'ajouter ici, et ce
 * commentaire est là pour qu'on ne l'oublie pas.
 *
 * ⚠️ SANS AUCUN TAUX CONNU, C'EST USAGES MULTIPLES. Taxer à la vente exige un
 * taux : sans lui, on ne peut pas ventiler, et inventer une valeur dans un
 * document comptable est précisément ce que ce projet s'interdit.
 */
/**
 * ⚠️ 🔴 LA CATÉGORIE TRANCHE LE DOUTE, ET C'EST ALEX QUI L'A FAIT APPARAÎTRE
 * (03/09). Le catalogue de Kebabistro ne portait QUE du 6 %, donc la déduction
 * le classait « usage unique ». Légalement défendable au jour de l'émission,
 * mais une friterie vend des boissons : le 21 % arrivera, et le régime, lui,
 * est FIGÉ POUR TOUJOURS sur les bons déjà vendus.
 *
 * ⚠️ UN CATALOGUE À UN SEUL TAUX N'EST PAS LA MÊME CHOSE QU'UN COMMERCE À UN
 * SEUL TAUX. Chez un salon ou une boutique, le taux unique est STRUCTUREL. Dans
 * l'alimentaire, le mélange 6 / 21 est la norme, et un taux unique ne veut dire
 * qu'une chose : le catalogue n'est pas fini.
 *
 * On retient donc les usages multiples pour l'alimentaire, quoi que dise son
 * catalogue. C'est le régime le plus prudent : il ne déplace aucune TVA déjà
 * déclarée, et c'est ce que le journal a toujours fait.
 */
const CATEGORIES_A_TAUX_MELANGES = ['alimentaire']

export function regimeBon({
  tauxDefaut = null, tauxArticles = [], tauxPrestations = [], regimeChoisi = null,
  categorie = null,
} = {}) {
  const connus = [...tauxArticles, ...tauxPrestations]
    .map(normaliser)
    .filter(t => t !== null)
  const distincts = [...new Set(connus)]
  const parDefaut = normaliser(tauxDefaut)

  // Le catalogue fait foi quand il dit quelque chose ; sinon le taux du
  // commerce, qui est ce que toute vente appliquerait.
  const candidats = distincts.length > 0 ? distincts : (parDefaut === null ? [] : [parDefaut])

  // ⚠️ LE CHOIX DU COMMERÇANT PASSE DEVANT LA DÉDUCTION, mais il ne crée pas un
  // taux qui n'existe pas : réclamer l'usage unique sans qu'aucun taux ne soit
  // connu rendrait la ligne de vente inventée.
  if (regimeChoisi === USAGE_MULTIPLE) return { regime: USAGE_MULTIPLE, taux: null }
  if (regimeChoisi === USAGE_UNIQUE) {
    const taux = candidats.length === 1 ? candidats[0] : parDefaut
    return taux === null
      ? { regime: USAGE_MULTIPLE, taux: null }
      : { regime: USAGE_UNIQUE, taux }
  }

  // ⚠️ LA CATÉGORIE PASSE DEVANT LE CATALOGUE, mais JAMAIS devant le choix
  // explicite du commerçant, traité au-dessus : lui seul connaît son commerce.
  if (CATEGORIES_A_TAUX_MELANGES.includes(String(categorie || ''))) {
    return { regime: USAGE_MULTIPLE, taux: null }
  }

  if (candidats.length === 1) return { regime: USAGE_UNIQUE, taux: candidats[0] }
  return { regime: USAGE_MULTIPLE, taux: null }
}

/**
 * Le régime d'un bon DÉJÀ VENDU, lu sur le bon lui-même.
 *
 * ⚠️ LE RÉGIME EST FIGÉ À LA VENTE, exactement comme le taux d'une ligne de
 * commande. Un commerçant qui change de catalogue l'an prochain ne doit pas
 * réécrire la TVA de ses bons de cette année.
 *
 * ⚠️ ET UNE COLONNE VIDE VAUT USAGES MULTIPLES, parce que c'est ce que le
 * journal a toujours fait : les bons vendus avant le 03/09 n'ont pas de régime,
 * et leur donner rétroactivement l'usage unique déplacerait de la TVA déjà
 * déclarée.
 */
export function regimeDuBon(bon = {}) {
  return String(bon?.tva_regime || '') === USAGE_UNIQUE ? USAGE_UNIQUE : USAGE_MULTIPLE
}

// Un bon à usage unique a déjà porté sa TVA à la vente : son utilisation ne
// produit ni chiffre d'affaires ni TVA, sinon les deux seraient comptés deux
// fois. La ligne reste écrite, mais informative, sans quoi une prestation
// entièrement réglée par un bon disparaîtrait du journal, ce qui est le défaut
// corrigé le 29/08.
export function utilisationTaxable(bon = {}) {
  return regimeDuBon(bon) === USAGE_MULTIPLE
}
