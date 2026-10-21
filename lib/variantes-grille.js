// LA GRILLE DES TAILLES, PLUS VITE (21/10, Alex, après le Caprice de Magali).
//
// « Il me faut une vraie optimisation de l'espace article et groupe avec les
// variantes pour accélérer et faciliter l'encodage. » Tableau du 21/10 : le
// stock et le prix en masse, ranger et renommer les valeurs sans perdre leur
// stock, retirer une valeur emporte ses combinaisons (après confirmation),
// remplacer la grille d'un article déjà équipé, et la carte lue par couleur.
//
// ⚠️ MODULE PUR : le banc l'exécute. L'écran (`VariantesArticle`) écrit.

const cle = (s) => String(s ?? '').trim()
const memeValeur = (a, b) => cle(a).toLowerCase() === cle(b).toLowerCase()

/** Déplace une valeur d'un cran (sens -1 ou +1). Rend la MÊME liste si rien ne bouge. */
export function deplacerValeur(liste = [], valeur, sens) {
  const l = Array.isArray(liste) ? liste : []
  const i = l.findIndex(v => v === valeur)
  const j = i + (sens < 0 ? -1 : 1)
  if (i < 0 || j < 0 || j >= l.length) return l
  const copie = [...l]
  ;[copie[i], copie[j]] = [copie[j], copie[i]]
  return copie
}

/**
 * Renomme une valeur d'axe : { ok, liste } ou { ok: false, error }.
 * ⚠️ Un nom déjà pris par une AUTRE valeur est refusé : deux « M » feraient
 * deux combinaisons que personne ne distingue.
 */
export function renommerValeur(liste = [], ancien, nouveau) {
  const l = Array.isArray(liste) ? liste : []
  const n = cle(nouveau).replace(/\s+/g, ' ')
  if (!n) return { ok: false, error: 'Donne un nom à cette valeur.' }
  if (n.length > 40) return { ok: false, error: '40 caractères au plus.' }
  if (!l.includes(ancien)) return { ok: false, error: 'Cette valeur n’existe plus. Recharge la page.' }
  if (l.some(v => v !== ancien && memeValeur(v, n))) return { ok: false, error: `« ${n} » existe déjà.` }
  return { ok: true, liste: l.map(v => (v === ancien ? n : v)), nom: n }
}

/**
 * L'ordre des combinaisons suit l'ordre des valeurs : taille d'abord, puis
 * couleur. Rend seulement ce qui change : [{ id, ordre }].
 */
export function ordreDesVariantes(variantes = [], axe1 = [], axe2 = []) {
  const rang = (liste, v) => {
    const i = (Array.isArray(liste) ? liste : []).indexOf(v)
    return i < 0 ? 9999 : i
  }
  const triees = [...(Array.isArray(variantes) ? variantes : [])].sort((a, b) =>
    (rang(axe1, a.axe1_valeur) - rang(axe1, b.axe1_valeur))
    || (rang(axe2, a.axe2_valeur) - rang(axe2, b.axe2_valeur))
    || String(a.id).localeCompare(String(b.id)))
  return triees.map((v, ordre) => ({ id: v.id, ordre, avant: v.ordre })).filter(x => x.avant !== x.ordre).map(({ id, ordre }) => ({ id, ordre }))
}

/** Les combinaisons qui portent cette valeur sur cet axe (1 ou 2). */
export function variantesDeLaValeur(variantes = [], axe, valeur) {
  const col = axe === 2 ? 'axe2_valeur' : 'axe1_valeur'
  return (Array.isArray(variantes) ? variantes : []).filter(v => v?.[col] === valeur)
}

/**
 * Ce qu'on dit avant de retirer une valeur qui a des combinaisons.
 * « Retirer « 85a » supprime ses 3 combinaisons (stock : 0). »
 */
export function phraseRetraitValeur(valeur, combinaisons = []) {
  const n = combinaisons.length
  if (n === 0) return ''
  const stock = combinaisons.reduce((s, v) => s + Math.max(0, Number(v.stock) || 0), 0)
  return `Retirer « ${valeur} » supprime ${n === 1 ? 'sa combinaison' : `ses ${n} combinaisons`} (stock : ${stock}). Les commandes déjà passées ne changent pas.`
}

// ─── EN MASSE ───────────────────────────────────────────────────────────────

/** Les cibles proposées : toutes, ou une valeur d'un axe. [{ cle, libelle }] */
export function ciblesDeMasse({ axe1Nom = 'Taille', axe1Valeurs = [], axe2Nom = '', axe2Valeurs = [] } = {}) {
  const res = [{ cle: '', libelle: 'Toutes' }]
  for (const v of axe1Valeurs || []) res.push({ cle: `1|${v}`, libelle: `${axe1Nom || 'Axe 1'} ${v}` })
  for (const v of axe2Valeurs || []) res.push({ cle: `2|${v}`, libelle: `${axe2Nom || 'Axe 2'} ${v}` })
  return res
}

/** Les combinaisons visées par une cible ('' = toutes, '1|M', '2|Bleu'). */
export function variantesVisees(variantes = [], cibleCle = '') {
  const liste = Array.isArray(variantes) ? variantes : []
  if (!cibleCle) return liste
  const [axe, ...reste] = String(cibleCle).split('|')
  return variantesDeLaValeur(liste, axe === '2' ? 2 : 1, reste.join('|'))
}

/** Une quantité saisie : entier ≥ 0, ou null si la saisie n'en est pas une. */
export function quantiteSaisie(txt) {
  const s = String(txt ?? '').trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return n <= 100000 ? n : null
}

/**
 * Un prix saisi : { ok, prix } (prix null = le prix de l'article) ou
 * { ok: false, error }.
 */
export function prixSaisiMasse(txt) {
  const s = String(txt ?? '').trim().replace(',', '.')
  if (s === '') return { ok: true, prix: null }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, error: 'Un prix s’écrit comme 29,90.' }
  const n = Number(s)
  if (n <= 0 || n > 100000) return { ok: false, error: 'Ce prix n’est pas valable.' }
  return { ok: true, prix: n }
}

// ─── LA CARTE DE LA LISTE, PAR COULEUR ──────────────────────────────────────

/**
 * Les pastilles de stock d'un article, regroupées par la valeur du 2e axe
 * (« Bleu : 36 : 5 · 38 : 5 »). Sans 2e axe : un seul groupe sans titre.
 * Seules les combinaisons actives. [{ titre, items: [{ id, libelle, stock }] }]
 */
export function lignesDeStock(variantes = []) {
  const actives = (Array.isArray(variantes) ? variantes : []).filter(v => v && v.actif !== false)
  const avecAxe2 = actives.some(v => cle(v.axe2_valeur))
  if (!avecAxe2) {
    return actives.length === 0 ? [] : [{ titre: null, items: actives.map(v => ({ id: v.id, libelle: cle(v.axe1_valeur), stock: Math.max(0, Number(v.stock) || 0) })) }]
  }
  const groupes = []
  for (const v of actives) {
    const titre = cle(v.axe2_valeur) || '—'
    let g = groupes.find(x => x.titre === titre)
    if (!g) { g = { titre, items: [] }; groupes.push(g) }
    g.items.push({ id: v.id, libelle: cle(v.axe1_valeur), stock: Math.max(0, Number(v.stock) || 0) })
  }
  return groupes
}
