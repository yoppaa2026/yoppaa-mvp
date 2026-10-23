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

// ─── LES COMBINAISONS AUTOMATIQUES (22/10, Alex, tableau de l'audit) ────────
//
// 🔴 AUDIT R1 : la boutique cochait « se décline », ajoutait S, M, L et
// fermait le panneau sans cliquer « Générer les combinaisons ». L'article
// partait sur la fiche SANS taille. Le bouton disparaît : chaque valeur
// ajoutée crée tout de suite ses combinaisons (stock 0), et SEULEMENT les
// siennes. Une combinaison supprimée exprès (« pas de XL en rouge ») ne
// revient donc pas quand on ajoute « Vert ».
//
// ⚠️ LE 2e AXE, LA PREMIÈRE FOIS : les combinaisons « S », « M » existent déjà
// sans couleur. Elles deviennent « S · Bleu », « M · Bleu » et GARDENT leur
// stock (le carton existe). Retirer la DERNIÈRE couleur fait l'inverse.

const cleCombo = (v1, v2) => `${cle(v1)}|${cle(v2)}`
const prochainOrdre = (variantes) => (Array.isArray(variantes) ? variantes : []).reduce((m, v) => Math.max(m, Number(v?.ordre) || 0), -1) + 1

/** Toutes les combinaisons des deux axes qui n'existent pas encore (stock 0, actives). */
export function combinaisonsManquantes({ articleId, axe1Valeurs = [], axe2Valeurs = [], variantes = [] } = {}) {
  const liste = Array.isArray(variantes) ? variantes : []
  const existe = new Set(liste.map(v => cleCombo(v?.axe1_valeur, v?.axe2_valeur)))
  const a2 = listeValeurs(axe2Valeurs).length ? listeValeurs(axe2Valeurs) : [null]
  let ordre = prochainOrdre(liste)
  const res = []
  for (const v1 of listeValeurs(axe1Valeurs)) for (const v2 of a2) {
    if (existe.has(cleCombo(v1, v2))) continue
    res.push({ article_id: articleId, axe1_valeur: v1, axe2_valeur: v2, stock: 0, actif: true, ordre: ordre++ })
  }
  return res
}

/**
 * Ce qu'une valeur AJOUTÉE fait naître : { aCreer, aConvertir }.
 * `axe1Valeurs`, `axe2Valeurs` : les listes APRÈS l'ajout. `aConvertir` : les
 * combinaisons sans 2e valeur qui reçoivent la première (stock gardé).
 */
export function combinaisonsDeLaValeur({ articleId, axe, valeur, axe1Valeurs = [], axe2Valeurs = [], variantes = [] } = {}) {
  const v = cle(valeur)
  const liste = Array.isArray(variantes) ? variantes : []
  if (!v) return { aCreer: [], aConvertir: [] }
  if (axe === 2 && listeValeurs(axe2Valeurs).length === 1) {
    const sansAxe2 = liste.filter(x => !cle(x?.axe2_valeur))
    const couverts = new Set(sansAxe2.map(x => cle(x.axe1_valeur)))
    return {
      aCreer: combinaisonsManquantes({ articleId, axe1Valeurs: listeValeurs(axe1Valeurs).filter(x => !couverts.has(x)), axe2Valeurs: [v], variantes: liste }),
      aConvertir: sansAxe2.map(x => x.id),
    }
  }
  return {
    aCreer: combinaisonsManquantes({
      articleId,
      axe1Valeurs: axe === 1 ? [v] : axe1Valeurs,
      axe2Valeurs: axe === 2 ? [v] : axe2Valeurs,
      variantes: liste,
    }),
    aConvertir: [],
  }
}

/**
 * Ce que le retrait d'une valeur emporte : { aSupprimer, aGarderSansAxe2 }.
 * `axe2Valeurs` : la liste AVANT le retrait. La dernière valeur du 2e axe ne
 * supprime rien : ses combinaisons la perdent et gardent leur stock.
 */
export function retraitDeValeur({ axe, valeur, axe2Valeurs = [], variantes = [] } = {}) {
  const combos = variantesDeLaValeur(variantes, axe, valeur)
  const a2 = listeValeurs(axe2Valeurs)
  if (axe === 2 && a2.length === 1 && a2[0] === cle(valeur)) return { aSupprimer: [], aGarderSansAxe2: combos.map(c => c.id) }
  return { aSupprimer: combos.map(c => c.id), aGarderSansAxe2: [] }
}

/**
 * La clé des axes d'un article tels qu'ils sont EN BASE : quand elle change
 * sans que le panneau l'ait écrite (grille posée, copie), il se relit (O1).
 */
export function cleDesAxes(a) {
  return JSON.stringify([a?.gere_variantes === true, cle(a?.axe1_nom), listeValeurs(a?.axe1_valeurs), cle(a?.axe2_nom), listeValeurs(a?.axe2_valeurs)])
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

// ─── LES GRILLES DE TAILLES RÉUTILISABLES (21/10, lot C) ────────────────────
//
// Comme la bibliothèque des groupes d'options de l'alimentaire : la boutique
// pense « ma grille XS à XL », « mes bonnets 85A à 95C », pas « les tailles
// de la bralette ». Sans nouvelle table : une grille est ce que des articles
// portent déjà (noms et valeurs de leurs axes), regroupée à l'identique.

const listeValeurs = (l) => (Array.isArray(l) ? l : []).map(cle).filter(Boolean)

/** La signature d'une grille : noms et valeurs des deux axes, dans l'ordre. */
// 🔴 (22/10, Alex) LE NOM D'UN AXE SANS VALEUR NE COMPTE PAS : un article qui
// garde « Couleur » sans aucune couleur faisait une 2e grille « Taille : 36 ·
// 38 · 40 · 42 · 44 », identique à l'œil. Idem pour le nom par défaut du 1er
// axe (vide = « Taille »).
export function signatureDeGrille(a) {
  const v2 = listeValeurs(a?.axe2_valeurs)
  return JSON.stringify([(cle(a?.axe1_nom) || 'Taille').toLowerCase(), listeValeurs(a?.axe1_valeurs), v2.length ? cle(a?.axe2_nom).toLowerCase() : '', v2])
}

/**
 * Les grilles du commerce, une par signature, la plus portée d'abord.
 * [{ cle, axe1_nom, axe1_valeurs, axe2_nom, axe2_valeurs, articles: [id] }]
 */
export function bibliothequeDeGrilles(articles = []) {
  const parCle = new Map()
  for (const a of Array.isArray(articles) ? articles : []) {
    if (!a?.gere_variantes || listeValeurs(a.axe1_valeurs).length === 0) continue
    const s = signatureDeGrille(a)
    if (!parCle.has(s)) {
      parCle.set(s, {
        cle: s, axe1_nom: cle(a.axe1_nom) || 'Taille', axe1_valeurs: listeValeurs(a.axe1_valeurs),
        axe2_nom: listeValeurs(a.axe2_valeurs).length ? cle(a.axe2_nom) : '', axe2_valeurs: listeValeurs(a.axe2_valeurs), articles: [],
        nom: '',
      })
    }
    const g = parCle.get(s)
    g.articles.push(a.id)
    // ✅ (Alex, 23/10) L'ÉTIQUETTE, ET RIEN D'AUTRE : le premier nom porté par
    // un article de la grille. Il ne compte pas dans la signature.
    if (!g.nom && cle(a.grille_nom)) g.nom = cle(a.grille_nom)
  }
  return [...parCle.values()].sort((x, y) => (y.articles.length - x.articles.length) || x.axe1_valeurs.join().localeCompare(y.axe1_valeurs.join()))
}

/** « Taille : S · M · L — Couleur : Bleu · Rose » */
export function libelleDeGrille(g) {
  const morceaux = [`${g.axe1_nom} : ${g.axe1_valeurs.join(' · ')}`]
  if (g.axe2_valeurs.length) morceaux.push(`${g.axe2_nom || 'Axe 2'} : ${g.axe2_valeurs.join(' · ')}`)
  return morceaux.join(' — ')
}

/** Le nom d'une grille tel qu'on l'écrit : nettoyé, 60 caractères au plus, ou null. */
export function nomDeGrille(texte) {
  const n = cle(texte).slice(0, 60).trim()
  return n || null
}

/** Les champs d'article qui posent la grille. */
// ✅ (23/10) ET SON ÉTIQUETTE quand la grille en porte une (`nom`) : un article
// qui reçoit « Taille gamme Primadonna » la porte à son tour.
export function axesDeGrille(g) {
  return {
    gere_variantes: true,
    axe1_nom: g.axe1_nom || 'Taille', axe1_valeurs: [...g.axe1_valeurs],
    axe2_nom: g.axe2_valeurs.length ? (g.axe2_nom || null) : null, axe2_valeurs: [...g.axe2_valeurs],
    ...('nom' in g ? { grille_nom: nomDeGrille(g.nom) } : {}),
  }
}

/**
 * Les combinaisons d'une grille pour un article : stock 0, prix de
 * l'article, actives, dans l'ordre (taille, puis couleur).
 */
export function combinaisonsDeGrille(g, articleId) {
  const a2 = g.axe2_valeurs.length ? g.axe2_valeurs : [null]
  const lignes = []
  for (const v1 of g.axe1_valeurs) for (const v2 of a2) {
    lignes.push({ article_id: articleId, axe1_valeur: v1, axe2_valeur: v2, stock: 0, actif: true, ordre: lignes.length })
  }
  return lignes
}

/**
 * Qui reçoit la grille : { aPoser, aRemplacer, ignores }.
 * ⚠️ Un article qui porte DÉJÀ une autre grille n'est remplacé que si on l'a
 * demandé (ses tailles, prix et stocks partent) ; sinon il est ignoré et dit.
 * Un article qui porte déjà CETTE grille ne bouge pas.
 */
export function repartirGrille({ grille, cibles = [], articles = [], remplacer = false } = {}) {
  const parId = new Map((Array.isArray(articles) ? articles : []).map(a => [String(a.id), a]))
  const aPoser = []
  const aRemplacer = []
  const ignores = []
  for (const id of Array.isArray(cibles) ? cibles : []) {
    const a = parId.get(String(id))
    if (!a) continue
    const equipe = a.gere_variantes && listeValeurs(a.axe1_valeurs).length > 0
    if (equipe && signatureDeGrille(a) === grille?.cle) continue
    if (!equipe) aPoser.push(a.id)
    else if (remplacer) aRemplacer.push(a.id)
    else ignores.push(a.id)
  }
  return { aPoser, aRemplacer, ignores }
}

// ─── CRÉER, MODIFIER PARTOUT, RETIRER UNE GRILLE (22/10, Alex, tableau) ─────
//
// « Où je peux créer ou supprimer ces grilles ? » Décision d'Alex : les trois
// gestes, SANS nouvelle table. Une grille reste ce que des articles portent ;
// la créer, c'est la poser ; la supprimer, c'est la retirer des articles ; la
// modifier, c'est changer tous les articles qui la portent, avec les mêmes
// règles que le panneau d'un article (combinaisons automatiques, stock gardé
// au renommage, première et dernière couleur).

const MAX_VALEURS = 60

/** Les valeurs tapées (« S, M, L » ou une par ligne), nettoyées, dans l'ordre. */
export function valeursSaisies(texte) {
  return String(texte ?? '').split(/[,;\n]/).map(x => cle(x).replace(/\s+/g, ' ')).filter(Boolean)
}

/**
 * La grille tapée dans « + Nouvelle grille » : { ok, grille } ou { ok: false, error }.
 * Elle a la forme de `bibliothequeDeGrilles` (sans articles) pour passer par
 * `poserGrille`.
 */
export function grilleDeSaisie({ axe1Nom = '', axe1Texte = '', axe2Nom = '', axe2Texte = '', nom = '' } = {}) {
  const v1 = valeursSaisies(axe1Texte)
  const v2 = valeursSaisies(axe2Texte)
  if (v1.length === 0) return { ok: false, error: 'Tape au moins une valeur, par exemple « S, M, L » ou « 36, 38, 40 ».' }
  for (const [liste, nom] of [[v1, cle(axe1Nom) || 'Taille'], [v2, cle(axe2Nom) || 'le 2e axe']]) {
    if (liste.length > MAX_VALEURS) return { ok: false, error: `${MAX_VALEURS} valeurs au plus pour ${nom}.` }
    const trop = liste.find(x => x.length > 40)
    if (trop) return { ok: false, error: `« ${trop.slice(0, 20)}… » : 40 caractères au plus.` }
    const doublon = liste.find((x, i) => liste.findIndex(y => memeValeur(x, y)) !== i)
    if (doublon) return { ok: false, error: `« ${doublon} » est tapé deux fois dans ${nom}.` }
  }
  if (v2.length > 0 && !cle(axe2Nom)) return { ok: false, error: 'Donne un nom au 2e axe (par exemple « Couleur »).' }
  const grille = {
    axe1_nom: cle(axe1Nom) || 'Taille', axe1_valeurs: v1,
    axe2_nom: v2.length ? cle(axe2Nom) : '', axe2_valeurs: v2, articles: [],
    // ✅ (23/10) l'étiquette tapée, facultative.
    nom: nomDeGrille(nom) || '',
  }
  grille.cle = signatureDeGrille(grille)
  return { ok: true, grille }
}

/**
 * Ce qu'une modification de la grille écrit sur TOUS ses articles.
 *
 * @param grille   { axe1_valeurs, axe2_valeurs, articles: [ids] } (de `bibliothequeDeGrilles`)
 * @param variantesParArticle { [articleId]: [{ id, axe1_valeur, axe2_valeur, ordre, stock }] }
 * @param op  { type: 'ajouter' | 'renommer' | 'deplacer' | 'retirer', axe: 1 | 2, valeur, nouveau?, sens? }
 * @returns { ok: false, error } | { ok: true, axes, aCreer, aConvertir: { ids, valeur }, aSupprimer, renommer, ordres, stockRetire }
 *   `axes` : le patch commun des articles ; `renommer` : { col, de, vers } ou null ;
 *   `stockRetire` : le stock des combinaisons supprimées (pour le dire avant).
 */
export function planGrille({ grille, variantesParArticle = {}, op = {} } = {}) {
  const ids = Array.isArray(grille?.articles) ? grille.articles : []
  if (ids.length === 0) return { ok: false, error: 'Cette grille n’est portée par aucun article.' }
  const a1 = listeValeurs(grille.axe1_valeurs)
  const a2 = listeValeurs(grille.axe2_valeurs)
  const axe = op.axe === 2 ? 2 : 1
  const liste = axe === 1 ? a1 : a2
  const v = cle(op.valeur)
  const vide = { aCreer: [], aConvertir: { ids: [], valeur: null }, aSupprimer: [], renommer: null, ordres: [], stockRetire: 0 }
  const varsDe = (id) => variantesParArticle?.[id] || variantesParArticle?.[String(id)] || []
  const colAxe = axe === 1 ? 'axe1_valeurs' : 'axe2_valeurs'

  if (op.type === 'ajouter') {
    if (!v) return { ok: false, error: 'Tape la valeur à ajouter.' }
    if (v.length > 40) return { ok: false, error: '40 caractères au plus.' }
    if (liste.some(x => memeValeur(x, v))) return { ok: false, error: `« ${v} » est déjà dans la grille.` }
    if (axe === 2 && a2.length === 0 && !cle(grille.axe2_nom) && !cle(op.nomAxe2)) return { ok: false, error: 'Donne un nom au 2e axe (par exemple « Couleur »).' }
    const apres = [...liste, v]
    const n1 = axe === 1 ? apres : a1
    const n2 = axe === 2 ? apres : a2
    const plan = { ...vide, axes: { [colAxe]: apres } }
    if (axe === 2 && a2.length === 0) plan.axes.axe2_nom = cle(grille.axe2_nom) || cle(op.nomAxe2)
    for (const id of ids) {
      const r = combinaisonsDeLaValeur({ articleId: id, axe, valeur: v, axe1Valeurs: n1, axe2Valeurs: n2, variantes: varsDe(id) })
      plan.aCreer.push(...r.aCreer)
      plan.aConvertir.ids.push(...r.aConvertir)
    }
    plan.aConvertir.valeur = plan.aConvertir.ids.length ? v : null
    return { ok: true, ...plan }
  }
  if (op.type === 'renommer') {
    const r = renommerValeur(liste, op.valeur, op.nouveau)
    if (!r.ok) return r
    if (r.nom === op.valeur) return { ok: true, ...vide, axes: null }
    return { ok: true, ...vide, axes: { [colAxe]: r.liste }, renommer: { col: axe === 1 ? 'axe1_valeur' : 'axe2_valeur', de: op.valeur, vers: r.nom } }
  }
  if (op.type === 'deplacer') {
    const apres = deplacerValeur(liste, op.valeur, op.sens)
    if (apres === liste) return { ok: true, ...vide, axes: null }
    const n1 = axe === 1 ? apres : a1
    const n2 = axe === 2 ? apres : a2
    return { ok: true, ...vide, axes: { [colAxe]: apres }, ordres: ids.flatMap(id => ordreDesVariantes(varsDe(id), n1, n2)) }
  }
  if (op.type === 'retirer') {
    if (!liste.includes(op.valeur)) return { ok: false, error: 'Cette valeur n’existe plus. Recharge la page.' }
    if (axe === 1 && a1.length === 1) return { ok: false, error: 'C’est la dernière valeur : pour enlever la grille, utilise « Retirer de… ».' }
    const plan = { ...vide, axes: { [colAxe]: liste.filter(x => x !== op.valeur) } }
    for (const id of ids) {
      const vars = varsDe(id)
      const r = retraitDeValeur({ axe, valeur: op.valeur, axe2Valeurs: a2, variantes: vars })
      plan.aSupprimer.push(...r.aSupprimer)
      plan.aConvertir.ids.push(...r.aGarderSansAxe2)
      plan.stockRetire += vars.filter(x => r.aSupprimer.includes(x.id)).reduce((s, x) => s + Math.max(0, Number(x.stock) || 0), 0)
    }
    if (axe === 2 && a2.length === 1) plan.axes.axe2_nom = null
    return { ok: true, ...plan }
  }
  return { ok: false, error: 'Modification inconnue.' }
}

/** Le patch qui retire une grille d'un article : plus de variantes, et masqué. */
// ✅ (23/10) l'étiquette part avec la grille.
export const RETRAIT_DE_GRILLE = Object.freeze({ gere_variantes: false, axe1_valeurs: [], axe2_nom: null, axe2_valeurs: [], actif: false, grille_nom: null })

/** Ce qu'on dit avant de retirer une grille de N articles. */
export function phraseRetraitDeGrille({ articles = 0, combinaisons = 0, stock = 0 } = {}) {
  const quoi = articles === 1 ? '1 article perd' : `${articles} articles perdent`
  return `${quoi} ${combinaisons === 1 ? 'sa combinaison' : `leurs ${combinaisons} combinaisons`} (stock : ${stock}). ${articles === 1 ? 'Il est masqué' : 'Ils sont masqués'} de ta fiche, à revoir avant de ${articles === 1 ? 'le' : 'les'} remontrer : sans variantes, ${articles === 1 ? 'il se vendrait' : 'ils se vendraient'} comme un article simple. Les commandes déjà passées ne changent pas.`
}

// ─── « STOCK D'UNE VARIANTE » SUR PLUSIEURS ARTICLES (22/10, Alex) ──────────

/**
 * Les valeurs proposées pour les articles cochés : chaque valeur d'axe d'un
 * article à variantes, une seule fois (« Taille M », « Couleur Bleu »).
 * [{ cle: '1|M', axe: 1, valeur: 'M', libelle: 'Taille M', articles: n }]
 */
export function ciblesVariantesDuLot(articles = []) {
  const parCle = new Map()
  for (const a of Array.isArray(articles) ? articles : []) {
    if (!a?.gere_variantes) continue
    for (const [axe, nom, valeurs] of [[1, cle(a.axe1_nom) || 'Taille', a.axe1_valeurs], [2, cle(a.axe2_nom) || 'Axe 2', a.axe2_valeurs]]) {
      for (const valeur of listeValeurs(valeurs)) {
        const k = `${axe}|${valeur}`
        if (!parCle.has(k)) parCle.set(k, { cle: k, axe, valeur, libelle: `${nom} ${valeur}`, articles: 0 })
        parCle.get(k).articles++
      }
    }
  }
  return [...parCle.values()]
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
