// L'ARTICLE PARTAGÉ : SON ADRESSE ET CE QUE DIT SON APERÇU (16/10 soir).
//
// Voir lib/partage-article-server.js pour le pourquoi. ⚠️ MODULE PUR : la
// fiche (le bouton « Partager ») et la page de partage lisent la même règle.

import { BASE_YOPPAA } from './lien-fiche.js'
import { chezLeCommerce } from './nom-commerce.js'

// L'adresse qu'on partage : elle porte l'aperçu de l'article. `base` : le site
// où l'on est (le site d'essai partage des liens d'essai).
export function lienPartageArticle(slug, articleId, base = BASE_YOPPAA) {
  if (!slug || !articleId) return null
  return `${base}/commander/${encodeURIComponent(slug)}/article/${encodeURIComponent(articleId)}`
}

// L'adresse où le lien mène vraiment : la fiche, ouverte sur l'article.
export function ficheSurArticle(slug, articleId) {
  return `/commander/${encodeURIComponent(slug)}?article=${encodeURIComponent(articleId)}`
}

export function prixLisible(prix) {
  const n = Number(prix)
  if (!Number.isFinite(n) || n <= 0) return null
  return `${n.toFixed(2).replace('.', ',')} €`
}

// Ce que la conversation affiche sous l'image.
// ⚠️ UNE DESCRIPTION VIDE NE LAISSE PAS UN TROU : elle dit où le trouver.
export function texteApercuArticle({ commerce, article } = {}) {
  if (!commerce || !article) return null
  const prix = prixLisible(article.prix)
  const titre = `${article.nom}${prix ? ` · ${prix}` : ''} · ${commerce.nom}`
  const brute = String(article.description || '').replace(/\s+/g, ' ').trim()
  const description = brute
    ? (brute.length > 160 ? `${brute.slice(0, 157).trimEnd()}…` : brute)
    : `À commander ${chezLeCommerce(commerce.nom)} sur Yoppaa, sans faire la file.`
  return { titre, description, prix }
}
