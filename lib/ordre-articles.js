// L'ORDRE DES ARTICLES DANS UNE CATÉGORIE (Alex, 10/10).
//
// 🔴 « Il faut aussi pouvoir modifier l'ordre des articles dans une
// catégorie. » Tout était trié par nom : la Margherita tombait après la
// Calzone, le Coca avant l'eau, sans que le commerçant y puisse rien.
//
// UNE RÈGLE, PARTOUT : la fiche publique, la carte de table, le tableau de
// bord et la fenêtre de commande encodée trient avec `comparerArticles`.
// Quatre tris écrits à la main finiraient par montrer quatre ordres.
//
//   - `ordre` d'abord (1 = en premier) ;
//   - un article jamais rangé (`ordre` nul) suit les rangés ;
//   - à égalité, le nom, à la française (« é » avec « e », sans tenir compte
//     des majuscules).
//
// ⚠️ MODULE PUR : il dit l'ordre et calcule les écritures, il n'écrit rien.

const rang = (a) => (a?.ordre === null || a?.ordre === undefined || a?.ordre === '' ? null : Number(a.ordre))
const nom = (a) => String(a?.nom || '')

export function comparerArticles(a, b) {
  const ra = rang(a)
  const rb = rang(b)
  if (ra !== null && rb !== null && ra !== rb) return ra - rb
  if (ra !== null && rb === null) return -1
  if (ra === null && rb !== null) return 1
  return nom(a).localeCompare(nom(b), 'fr', { sensitivity: 'base' })
}

/** Une copie triée ; la liste reçue n'est jamais modifiée. */
export function trierArticles(articles = []) {
  return [...(Array.isArray(articles) ? articles : [])].sort(comparerArticles)
}

const memeCategorie = (a, b) => (a?.categorie || null) === (b?.categorie || null)

/**
 * Où en est un article dans sa catégorie : `{ premier, dernier }`, pour
 * griser la flèche qui ne mène nulle part.
 */
export function positionDansCategorie(articles = [], id) {
  const article = (articles || []).find(a => String(a?.id) === String(id))
  if (!article) return { premier: true, dernier: true }
  const voisins = trierArticles((articles || []).filter(a => memeCategorie(a, article)))
  const i = voisins.findIndex(a => String(a.id) === String(id))
  return { premier: i <= 0, dernier: i < 0 || i === voisins.length - 1 }
}

/**
 * Les écritures pour monter (`sens` = -1) ou descendre (+1) un article d'un
 * cran DANS SA CATÉGORIE.
 *
 * ⚠️ TOUTE LA CATÉGORIE EST RENUMÉROTÉE 1, 2, 3… : tant que des articles
 * n'ont pas de rang, échanger deux numéros ne suffit pas (deux nuls ne
 * s'échangent pas). Mais seuls les articles dont le rang CHANGE sont écrits.
 *
 * @returns [{ id, ordre }] ; vide si le déplacement ne mène nulle part.
 */
export function deplacementDansCategorie(articles = [], id, sens) {
  if (sens !== -1 && sens !== 1) return []
  const article = (articles || []).find(a => String(a?.id) === String(id))
  if (!article) return []
  const voisins = trierArticles((articles || []).filter(a => memeCategorie(a, article)))
  const i = voisins.findIndex(a => String(a.id) === String(id))
  const j = i + sens
  if (i < 0 || j < 0 || j >= voisins.length) return []
  const suite = [...voisins]
  ;[suite[i], suite[j]] = [suite[j], suite[i]]
  return suite
    .map((a, k) => ({ id: a.id, ordre: k + 1, avant: rang(a) }))
    .filter(p => p.avant !== p.ordre)
    .map(({ id: x, ordre }) => ({ id: x, ordre }))
}
