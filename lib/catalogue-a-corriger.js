// LE BANDEAU « À CORRIGER » EN TÊTE DES ARTICLES (22/10, Alex, tableau de
// l'audit Articles + Personnalisation).
//
// 🔴 POURQUOI. Un article peut être « sur ta fiche » et ne se vendre à
// personne, sans qu'aucun écran ne le dise : des tailles sans combinaison, un
// groupe « obligatoire » sans option, toutes ses variantes à zéro. Le
// commerçant l'apprenait par un client, ou jamais. Le bandeau les nomme, avec
// la raison et le geste.
//
// ⚠️ SEULEMENT CE QUI EMPÊCHE OU FAUSSE UNE VENTE, sur un article sur la fiche
// et commandable en ligne. Un article masqué ou en vitrine ne se vend pas en
// ligne : il n'a rien à corriger. Un bandeau qui sonne pour rien n'est plus lu.
//
// ⚠️ MODULE PUR : le banc l'exécute. Il lit ce que le tableau de bord a déjà
// chargé (articles, variantes, groupes), il ne fait aucune requête.

import { problemeDuGroupe } from './options-choix.js'
import { variantesSansLimite, modeStockDe, joursFournisseur } from './stock-article.js'

/**
 * Les articles à corriger : [{ id, nom, raisons: [texte], geste: 'personnaliser' | 'modifier' }].
 *
 * @param articles            les articles du commerce (lus avec `*`)
 * @param variantesParArticle { [articleId]: [{ actif, stock }] } (toutes, actives ou non)
 * @param groupesParArticle   { [articleId]: [{ nom, valeurs: [] , obligatoire, choix_min }] }
 */
export function articlesACorriger({ articles = [], variantesParArticle = {}, groupesParArticle = {} } = {}) {
  const sortie = []
  for (const a of Array.isArray(articles) ? articles : []) {
    if (!a || a.actif === false || a.est_vitrine === true) continue
    const raisons = []
    let geste = 'personnaliser'
    if (a.gere_variantes === true) {
      const toutes = variantesParArticle[a.id] || variantesParArticle[String(a.id)] || []
      const actives = toutes.filter(v => v && v.actif !== false)
      if (actives.length === 0) {
        raisons.push(toutes.length === 0
          ? 'il se décline en variantes, mais n’en a aucune : il ne se vend pas'
          : 'toutes ses variantes sont éteintes : il ne se vend pas')
      } else if (!variantesSansLimite(a) && joursFournisseur(a) === null && actives.every(v => !(Number(v.stock) > 0))) {
        // ✅ (24/10, Caprice) Recommandable chez le fournisseur (`joursFournisseur`) :
        // des tailles à 0 se vendent « sur commande », il n'y a rien à corriger.
        raisons.push('toutes ses variantes sont à 0 : rien ne se vend')
      }
      // 🔴 (22/10, test C d'Alex) Un ancien stock général (ou un comptoir)
      // resté sur un article à variantes plafonne encore l'article entier à
      // la réservation (hors « stock qui baisse ») : un enregistrement de sa
      // fiche le remet à zéro.
      if (modeStockDe(a) !== 'magasin' && (Number(a.stock_jour) > 0 || (a.stock_comptoir !== null && a.stock_comptoir !== undefined))) {
        raisons.push(`un ancien stock général (${Number(a.stock_jour) > 0 ? Number(a.stock_jour) : a.stock_comptoir}) limite encore toutes ses variantes : ouvre sa fiche et enregistre-la une fois`)
        if (raisons.length === 1) geste = 'modifier'
      }
      // L'ancien réglage « par jour » ne se compte pas par variante.
      if (modeStockDe(a) === 'jour') {
        raisons.push('son stock est « par jour », qui n’existe pas par variante : choisis « Un stock par variante » ou « Fabriqué à la demande »')
        if (raisons.length === 1) geste = 'modifier'
      }
    }
    for (const g of groupesParArticle[a.id] || groupesParArticle[String(a.id)] || []) {
      const p = problemeDuGroupe(g)
      if (p) raisons.push(`« ${g.nom} » : ${p.charAt(0).toLowerCase()}${p.slice(1)}`)
    }
    if (raisons.length > 0) sortie.push({ id: a.id, nom: a.nom, raisons, geste })
  }
  return sortie
}

/** « 2 articles ne se vendent pas comme prévu », ou '' s'il n'y a rien. */
export function titreACorriger(liste = []) {
  const n = Array.isArray(liste) ? liste.length : 0
  if (n === 0) return ''
  return n === 1 ? '1 article ne se vend pas comme prévu' : `${n} articles ne se vendent pas comme prévu`
}
