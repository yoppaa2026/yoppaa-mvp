// Le panier qui passe d'une page à l'autre chez un même commerçant.
//
// LE PROBLÈME QUE CE FICHIER RÈGLE. Chez un commerce de services qui vend
// aussi des produits, il existe deux pages : la boutique (/commander/[slug])
// et la fiche rendez-vous (/commander/rdv/[slug]). Chacune a son panier. Le
// client fait le geste naturel, mettre son shampoing dans le panier puis
// décider de réserver sa coupe, et la navigation perd tout.
//
// ⚠️ IL FAUT LES DEUX SENS. La première version (04/08) ne transportait le
// panier que de la boutique vers le rendez-vous. Résultat, sur la fiche
// rendez-vous, ajouter un produit menait à un cul-de-sac : ni total, ni
// bouton, et la seule issue — ouvrir un produit pour rebondir vers la
// boutique — vidait le panier au passage (Alex, 09/08). Un client qui veut
// juste un shampoing n'a aucune raison de prendre rendez-vous pour l'acheter.
//
// Ce n'est pas un panier persistant : il vit le temps d'un passage d'une page
// à l'autre, et s'efface dès qu'il est lu. Un panier qui ressusciterait trois
// jours plus tard, avec des prix et des stocks d'un autre jour, ferait plus de
// dégâts qu'il n'en éviterait.
//
// ⚠️ UNE CLÉ PAR SENS. Avec une clé unique, la page qui dépose relit son
// propre dépôt si le client fait marche arrière, et se retrouve avec ses
// articles en double.

const PREFIXE = 'yoppaa.panier.'
const DUREE_MS = 30 * 60 * 1000   // 30 minutes : le temps d'hésiter, pas plus

// 'rdv' = la boutique dépose pour le tunnel de rendez-vous.
// 'boutique' = le tunnel de rendez-vous dépose pour la boutique.
function cle(sens, slug) {
  return `${PREFIXE}vers-${sens}.${slug}`
}

// Ne voyagent que les lignes simples : un article et une quantité. Une ligne
// avec des options, une version ou un lot se compose dans la boutique, avec
// son écran dédié ; la reconstruire à l'aveugle ailleurs donnerait un prix
// faux. Les noms des lignes laissées derrière sont transmis pour que le client
// soit prévenu au lieu de les voir disparaître.
function deposer(sens, slug, panier) {
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
    sessionStorage.setItem(cle(sens, slug), JSON.stringify({ ts: Date.now(), articles, ignores }))
  } catch (e) {
    console.warn('[panier-partage] dépôt impossible', e?.message)
  }
}

// Lit le panier déposé ET l'efface : il ne doit servir qu'une fois. Renvoie
// null si rien n'a été déposé ou si le dépôt est trop vieux.
function reprendre(sens, slug) {
  if (typeof window === 'undefined' || !slug) return null
  try {
    const brut = sessionStorage.getItem(cle(sens, slug))
    if (!brut) return null
    sessionStorage.removeItem(cle(sens, slug))
    const data = JSON.parse(brut)
    if (!data?.ts || Date.now() - data.ts > DUREE_MS) return null
    return { articles: data.articles || [], ignores: data.ignores || [] }
  } catch (e) {
    console.warn('[panier-partage] reprise impossible', e?.message)
    return null
  }
}

// Boutique → tunnel de rendez-vous
export function deposerPanierPourRdv(slug, panier) { deposer('rdv', slug, panier) }
export function reprendrePanierPourRdv(slug) { return reprendre('rdv', slug) }

// Tunnel de rendez-vous → boutique
export function deposerPanierPourBoutique(slug, panier) { deposer('boutique', slug, panier) }
export function reprendrePanierPourBoutique(slug) { return reprendre('boutique', slug) }

// Exportés pour le banc : les deux sens doivent utiliser des clés distinctes.
export const CLES = { rdv: (slug) => cle('rdv', slug), boutique: (slug) => cle('boutique', slug) }
export const DUREE_PARTAGE_MS = DUREE_MS
