// LA CRÉATION DU MENU RELU (13/10, session 3 du chantier « menu lu par l'IA »).
//
// La relecture (`lib/menu-relecture.js`) est terminée : ce module en fait des
// lignes de catalogue, avec LES MÊMES RÈGLES que le formulaire d'un article
// (`saveArticle` du tableau de bord) et que « Nouveau groupe » :
//   - le stock par `champsStock` / `refusQuantite`, le défaut par métier
//     `modeStockParDefaut` ;
//   - les deux circuits par `champsCircuits` / `refusCircuits`, avec les
//     valeurs d'un nouvel article (`openNew`) ;
//   - chaque groupe passe par `nouveauGroupe` ;
//   - les catégories nouvelles s'ajoutent par `listeApresAjout`.
//
// ⚠️ L'ÉCRITURE PASSE PAR LE NAVIGATEUR, comme tout le catalogue : les règles
// d'accès de la base (propriétaire, ou admin en double authentification, et
// commerce non bloqué) s'appliquent à chaque ligne. Aucune route de service.
//
// ✅ DÉCISIONS D'ALEX (13/10, au tableau) : le stock « par jour » et la TVA
// font chacun UNE question dans la relecture, expliquée, et modifiable ensuite
// par groupe ou article par article.
//
// ⚠️ MODULE PUR pour le plan ; `ecrireCreation` reçoit le client en paramètre,
// ce qui permet au banc de l'exécuter sur une fausse base.

import { cleNom } from './menu-lu.js'
import { prixDeSaisie } from './menu-relecture.js'
import { champsStock, refusQuantite, modeStockParDefaut, aDeuxCircuits, champsCircuits, refusCircuits } from './stock-article.js'
import { nouveauGroupe } from './catalogue-copie.js'
import { listeApresAjout } from './categories-catalogue.js'

const NOM_GROUPE_MAX = 60

/**
 * Faut-il demander la quantité par jour ? Seulement au commerce qui compte
 * « par jour » (boulangerie, boucherie, traiteur) : celui qui sert à manger
 * prépare à la commande (« sans limite »).
 */
export function demandeLeStock(commercant) {
  return modeStockParDefaut(commercant) === 'jour'
}

/** Le taux de TVA choisi : un nombre, ou null (« je le règle plus tard »). */
const tauxChoisi = (v) => (v === '' || v === null || v === undefined || v === 'plus_tard' ? null : Number(v))

/**
 * Les réglages communs à tous les articles créés, contrôlés.
 *   reglages.stock     'illimite' | 'jour' (ignoré si le métier ne compte pas par jour)
 *   reglages.quantite  la quantité par jour, si 'jour'
 *   reglages.tva       un taux, 'plus_tard', ou '' (pas encore choisi)
 *   reglages.tvaSurPlace  un taux, ou '' (même taux qu'à emporter)
 * Rend { ok, stock, tva, tvaSurPlace } ou { ok: false, error }.
 */
export function reglagesCommuns(commercant, reglages = {}) {
  const defaut = modeStockParDefaut(commercant)
  if (defaut === 'magasin') return { ok: false, error: 'La lecture du menu est réservée aux commerces alimentaires pour l’instant.' }
  let stock
  if (defaut === 'jour') {
    const mode = reglages.stock === 'illimite' ? 'illimite' : reglages.stock === 'jour' ? 'jour' : null
    if (!mode) return { ok: false, error: 'Dis combien tu en prépares par jour, ou choisis « Sans limite ».' }
    const refus = refusQuantite(mode, reglages.quantite)
    if (refus) return { ok: false, error: refus }
    stock = champsStock({ mode, saisie: reglages.quantite })
  } else {
    stock = champsStock({ mode: 'illimite', saisie: '' })
  }
  // 🔴 LA TVA SE CHOISIT, ELLE NE SE DEVINE PAS : un taux choisi par défaut
  // serait un taux qu'on n'a pas choisi, et il finirait dans une déclaration
  // (`lib/tva-aide.js`). « Plus tard » est un choix ; le vide n'en est pas un.
  if (reglages.tva === '' || reglages.tva === undefined || reglages.tva === null) {
    return { ok: false, error: 'Choisis le taux de TVA de ces articles, ou « Je le règle plus tard ».' }
  }
  const tva = tauxChoisi(reglages.tva)
  // Le taux sur place : vide = « même taux qu'à emporter », comme le formulaire.
  const tvaSurPlace = tauxChoisi(reglages.tvaSurPlace)
  const horsBornes = (t) => t !== null && (!Number.isFinite(t) || t < 0 || t > 100)
  if (horsBornes(tva) || horsBornes(tvaSurPlace)) return { ok: false, error: 'Taux de TVA non valable.' }
  return { ok: true, stock, tva, tvaSurPlace }
}

/** Le nom d'une catégorie, écrit comme celle qui existe déjà s'il y en a une. */
function categorieExistante(nom, existantes) {
  const n = String(nom || '').trim()
  if (!n) return null
  return existantes.find(c => cleNom(c) === cleNom(n)) || n
}

/** Un groupe lu, passé par la règle du formulaire. */
function groupeDuFormulaire(g) {
  const res = nouveauGroupe({
    nom: String(g.nom || '').slice(0, NOM_GROUPE_MAX),
    type: g.type,
    obligatoire: g.obligatoire,
    options: (g.valeurs || []).map(v => ({ nom: v.nom, prix_supplement: v.supplement ?? 0 })),
    choix_min: g.choix_min ?? '',
    choix_max: g.choix_max ?? '',
  })
  return res
}

/**
 * Les prix par taille d'un groupe, rattachés aux tailles de l'article par
 * leur NOM : [{ valeur, taille, prix }]. Une taille inconnue est comptée.
 */
function prixTailleDuGroupe(g, valeursTaille, compteur) {
  const lignes = []
  // Un article SANS tailles (la Calzone qui reçoit la charcuterie des pizzas)
  // prend simplement le prix de base : ce n'est pas une anomalie, on ne la
  // compte pas, sinon le vrai cas (une taille mal lue) se noierait dans le bruit.
  if (valeursTaille.length === 0) return lignes
  for (const v of g.valeurs || []) {
    for (const p of v.parTaille || []) {
      const t = valeursTaille.find(x => cleNom(x) === cleNom(p.taille))
      if (!t) { compteur.inconnues++; continue }
      lignes.push({ valeur: v.nom, taille: t, prix: p.prix })
    }
  }
  return lignes
}

/**
 * LE PLAN DE CRÉATION.
 *
 * @returns {{ ok: true, articles: { cle, nom, payload, groupes: { groupe, prixTaille }[] }[],
 *             categories: string[] | null, avertissements: string[] } | { ok: false, error }}
 */
export function planCreation({ etat, commercant, commercantId, categoriesExistantes = [], articlesExistants = [], reglages = {} }) {
  const communs = reglagesCommuns(commercant, reglages)
  if (!communs.ok) return communs
  const avertissements = []
  const coches = (etat?.articles || []).filter(a => a.garder)
  if (coches.length === 0) return { ok: false, error: 'Coche au moins un article à créer.' }

  // Les deux circuits, avec les valeurs d'un NOUVEL article (`openNew`).
  let circuits = null
  if (aDeuxCircuits(commercant)) {
    const demainCommandable = (Number(commercant?.horizon_commande) || 2) >= 2
    const form = { vente_jour: true, commande_active: demainCommandable, delai_minutes: demainCommandable ? 1440 : 0, commande_max_jour: '', horizon_jours: '' }
    const refus = refusCircuits(form)
    if (refus) return { ok: false, error: refus }
    circuits = champsCircuits(form)
  }

  // L'ordre du menu se garde : chaque catégorie reprend après son dernier
  // article classé.
  const dernierOrdre = new Map()
  for (const a of articlesExistants || []) {
    const cle = cleNom(a?.categorie || '')
    if (Number.isInteger(a?.ordre)) dernierOrdre.set(cle, Math.max(dernierOrdre.get(cle) || 0, a.ordre))
  }

  let liste = [...(categoriesExistantes || [])]
  let listeChangee = false
  const articles = []
  const inconnues = { inconnues: 0 }

  for (const a of coches) {
    const nom = String(a.nom || '').trim()
    const prix = prixDeSaisie(a.prixTexte)
    if (!nom || prix === null) return { ok: false, error: `« ${nom || 'Article sans nom'} » : nom et prix obligatoires.` }
    if (a.doutes?.length > 0 && !a.verifie) return { ok: false, error: `« ${nom} » est encore à vérifier.` }

    const categorie = categorieExistante(a.categorie, liste)
    if (categorie) {
      const apres = listeApresAjout(liste, categorie)
      if (apres) { liste = apres; listeChangee = true }
    }
    const cleCat = cleNom(categorie || '')
    const ordre = (dernierOrdre.get(cleCat) || 0) + 1
    dernierOrdre.set(cleCat, ordre)

    const payload = {
      commercant_id: commercantId,
      nom,
      description: String(a.description || '').trim() || null,
      prix,
      ...communs.stock,
      actif: true,
      categorie,
      temps_prepa: 0,
      delai_minutes: 0,
      horizon_jours: null,
      ...(circuits || {}),
      photo_url: null,
      est_vitrine: false,
      tva_taux: communs.tva,
      tva_taux_sur_place: communs.tvaSurPlace,
      ordre,
    }

    // Les groupes de l'article, puis les suppléments communs que le
    // commerçant a choisi d'ajouter à sa catégorie.
    const lus = (a.groupes || []).filter(g => g.garder !== false)
    const tailles = lus.find(g => cleNom(g.nom) === cleNom('Taille'))
    const valeursTaille = tailles ? tailles.valeurs.map(v => v.nom) : []
    const groupes = []
    const nomsPris = new Set()
    const ajouter = (g, origine) => {
      if (nomsPris.has(cleNom(g.nom))) return
      const res = groupeDuFormulaire(g)
      if (!res.ok) { avertissements.push(`« ${nom} », ${origine} « ${g.nom} » non créé : ${res.error}`); return }
      nomsPris.add(cleNom(res.groupe.nom))
      groupes.push({ groupe: res.groupe, prixTaille: prixTailleDuGroupe(g, valeursTaille, inconnues) })
    }
    for (const g of lus) ajouter(g, 'groupe')
    for (const s of etat?.supplements || []) {
      if (!s.appliquerA || cleNom(s.appliquerA) !== cleCat) continue
      // Sans supplément écrit, le prix de la plus petite taille sert de repli.
      const valeurs = (s.valeurs || []).map(v => ({
        ...v,
        supplement: v.supplement || (v.parTaille?.length ? Math.min(...v.parTaille.map(p => p.prix)) : 0),
      }))
      ajouter({ ...s, valeurs }, 'supplément')
    }

    articles.push({ cle: a.cle, nom, payload, groupes })
  }

  if (inconnues.inconnues > 0) {
    avertissements.push(`${inconnues.inconnues} prix par taille sans taille correspondante sur l’article : le prix de base s’applique.`)
  }
  return { ok: true, articles, categories: listeChangee ? liste : null, avertissements }
}

/**
 * L'ÉCRITURE, article par article.
 *
 * ⚠️ PAS D'INSERTION EN BLOC DES ARTICLES : il faudrait relier chaque ligne
 * rendue à son article par l'ordre de retour, que rien ne garantit. Un article
 * à la fois, ses groupes reliés par leur NOM (unique dans l'article), ses
 * valeurs par (groupe, nom).
 *
 * ⚠️ UN ÉCHEC NE S'AVALE PAS : chaque article raté ou créé sans ses choix est
 * rendu, nommé, pour que l'écran le dise et ne le recrée pas en double.
 *
 * @returns {{ crees: { cle, id }[], echecs: { cle, nom, erreur }[], partiels: { cle, nom, erreur }[],
 *             categories: string | null, listeCategories: string[] | null }}
 */
export async function ecrireCreation(client, plan, { commercantId, surProgression } = {}) {
  const crees = []
  const echecs = []
  const partiels = []
  let n = 0
  for (const art of plan.articles) {
    n++
    surProgression?.(n, plan.articles.length)
    const { data: ligne, error } = await client.from('articles').insert(art.payload).select('id').single()
    if (error || !ligne?.id) { echecs.push({ cle: art.cle, nom: art.nom, erreur: error?.message || 'création refusée' }); continue }
    crees.push({ cle: art.cle, id: ligne.id })
    if (art.groupes.length === 0) continue

    const manque = (quoi, e) => partiels.push({ cle: art.cle, nom: art.nom, erreur: `${quoi} : ${e?.message || 'refusé'}` })
    const { data: gs, error: errG } = await client.from('article_options_groupes')
      .insert(art.groupes.map(({ groupe: g }) => ({ article_id: ligne.id, nom: g.nom, type: g.type, obligatoire: g.obligatoire, choix_min: g.choix_min, choix_max: g.choix_max })))
      .select('id, nom')
    if (errG || !Array.isArray(gs)) { manque('choix non créés', errG); continue }
    const idGroupe = new Map(gs.map(g => [g.nom, g.id]))

    const valeurs = art.groupes.flatMap(({ groupe: g }) => (g.valeurs || []).map(v => ({ groupe_id: idGroupe.get(g.nom), nom: v.nom, prix_supplement: v.prix_supplement })))
    if (valeurs.some(v => !v.groupe_id)) { manque('choix incomplets', null); continue }
    const { data: vs, error: errV } = await client.from('article_options_valeurs').insert(valeurs).select('id, groupe_id, nom')
    if (errV || !Array.isArray(vs)) { manque('options non créées', errV); continue }
    const idValeur = new Map(vs.map(v => [`${v.groupe_id}|${cleNom(v.nom)}`, v.id]))

    // Les prix par taille : la valeur et la taille, toutes deux de CET article.
    const groupeTaille = art.groupes.find(({ groupe: g }) => cleNom(g.nom) === cleNom('Taille'))
    const idTailleGroupe = groupeTaille ? idGroupe.get(groupeTaille.groupe.nom) : null
    const prix = []
    for (const { groupe: g, prixTaille } of art.groupes) {
      for (const p of prixTaille) {
        const valeur_id = idValeur.get(`${idGroupe.get(g.nom)}|${cleNom(p.valeur)}`)
        const taille_valeur_id = idTailleGroupe ? idValeur.get(`${idTailleGroupe}|${cleNom(p.taille)}`) : null
        if (valeur_id && taille_valeur_id) prix.push({ valeur_id, taille_valeur_id, prix: p.prix })
      }
    }
    if (prix.length > 0) {
      const { error: errP } = await client.from('article_options_prix_taille').insert(prix)
      if (errP) manque('prix par taille non créés', errP)
    }
  }

  // La liste des catégories, seulement si au moins un article est né.
  // `listeCategories` : la liste écrite, que l'écran pose à son tour (elle ne
  // se relit pas toute seule, voir `ecrireListeCats`).
  let categories = null
  let listeCategories = null
  if (plan.categories && crees.length > 0) {
    const { error: errC } = await client.from('commercants').update({ ordre_categories: plan.categories }).eq('id', commercantId)
    if (errC) categories = `Nouvelles catégories non rangées : ${errC.message}`
    else listeCategories = plan.categories
  }
  return { crees, echecs, partiels, categories, listeCategories }
}

/** Le compte rendu de la création, en mots. */
export function phraseDeCreation({ crees = [], echecs = [], partiels = [] } = {}) {
  const n = crees.length
  const morceaux = [`${n} article${n > 1 ? 's' : ''} créé${n > 1 ? 's' : ''}`]
  if (partiels.length) morceaux.push(`${partiels.length} sans tous leurs choix (${partiels.map(p => p.nom).join(', ')})`)
  if (echecs.length) morceaux.push(`${echecs.length} non créé${echecs.length > 1 ? 's' : ''} (${echecs.map(e => e.nom).join(', ')})`)
  return `${morceaux.join(', ')}.`
}
