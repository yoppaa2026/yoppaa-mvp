// Passage du panier de la boutique vers le tunnel de rendez-vous.
//
// LE PROBLÈME QUE CE FICHIER RÈGLE. Chez un commerce de services qui vend
// aussi des produits, il existe deux pages : la boutique et la fiche
// rendez-vous. Chacune avait son panier. Le client faisait le geste naturel,
// mettre son shampoing dans le panier puis décider de réserver sa coupe, et
// le bouton « Prendre rendez-vous » quittait la page en perdant tout. Deux
// tunnels qui ne se rejoignaient jamais.
//
// Le panier est déposé ici avant la navigation et repris à l'arrivée. Ce n'est
// pas un panier persistant : il vit le temps d'un passage d'une page à
// l'autre, et s'efface dès qu'il est lu. Un panier qui ressusciterait trois
// jours plus tard, avec des prix et des stocks d'un autre jour, ferait plus de
// dégâts qu'il n'en éviterait.

const PREFIXE = 'yoppaa.panier.vers-rdv.'
const DUREE_MS = 30 * 60 * 1000   // 30 minutes : le temps d'hésiter, pas plus

function cle(slug) {
  return `${PREFIXE}${slug}`
}

// Ne voyagent que les lignes simples : un article et une quantité. Une ligne
// avec des options, une version ou un lot se compose dans la boutique, avec
// son écran dédié ; la reconstruire à l'aveugle dans le tunnel de rendez-vous
// donnerait un prix faux. Les noms des lignes laissées derrière sont
// transmis pour que le client soit prévenu au lieu de les voir disparaître.
export function deposerPanierPourRdv(slug, panier) {
  if (typeof window === 'undefined' || !slug) return
  const articles = []
  const ignores = []
  for (const [key, item] of Object.entries(panier || {})) {
    const simple = !item.deal_id && !item.variante && !item.options && !key.includes('_')
    if (simple && item.id && item.quantite > 0) {
      articles.push({ id: item.id, quantite: item.quantite })
    } else if (item.quantite > 0) {
      ignores.push(item.nom || 'un article')
    }
  }
  if (articles.length === 0 && ignores.length === 0) return
  try {
    sessionStorage.setItem(cle(slug), JSON.stringify({ ts: Date.now(), articles, ignores }))
  } catch (e) {
    console.warn('[panier-vers-rdv] dépôt impossible', e?.message)
  }
}

// Lit le panier déposé ET l'efface : il ne doit servir qu'une fois. Renvoie
// null si rien n'a été déposé ou si le dépôt est trop vieux.
export function reprendrePanierPourRdv(slug) {
  if (typeof window === 'undefined' || !slug) return null
  try {
    const brut = sessionStorage.getItem(cle(slug))
    if (!brut) return null
    sessionStorage.removeItem(cle(slug))
    const data = JSON.parse(brut)
    if (!data?.ts || Date.now() - data.ts > DUREE_MS) return null
    return { articles: data.articles || [], ignores: data.ignores || [] }
  } catch (e) {
    console.warn('[panier-vers-rdv] reprise impossible', e?.message)
    return null
  }
}
