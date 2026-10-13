// LE MENU LU PAR L'IA (13/10, demande d'Alex : « accélérer l'onboarding des
// commerçants qui n'ont jamais le temps »).
//
// Le commerçant envoie la photo (ou le PDF) de son menu ; Claude le lit et
// rend une PROPOSITION de catalogue. Ce module la remet en ordre : il ne fait
// confiance à rien de ce que le modèle écrit.
//
// DÉCIDÉ AU TABLEAU (13/10) :
//   - SEMI-AUTOMATIQUE, TOUJOURS : rien n'est créé sans la relecture du
//     commerçant. Une erreur de prix sur un menu, c'est de l'argent et un
//     litige au comptoir ;
//   - toutes les formules, avec un quota mensuel ;
//   - AUCUNE photo gardée : lue, puis oubliée ;
//   - l'alimentaire d'abord. ⚠️ La boutique de détail viendra (Alex veut qu'on
//     lui repose la question en cours de route) : rien ici ne suppose un menu
//     de restaurant, sauf les consignes de lecture.
//
// ⚠️ MODULE PUR : il range, contrôle et signale. Il ne lit ni n'écrit la base,
// et le banc l'exécute sans réseau.

// ─── LES BORNES ─────────────────────────────────────────────────────────────
// Un menu de pizzeria tient dans ces limites avec de la marge. Au-delà, ce
// n'est plus un menu, et la relecture deviendrait impossible à l'écran.
export const MENU_MAX = Object.freeze({
  pages: 4,
  categories: 30,
  articles: 300,
  groupesParArticle: 8,
  valeursParGroupe: 30,
  nom: 80,
  description: 300,
  categorie: 40,
  question: 300,
})
// Ce qu'un menu dit d'autre que ses articles (bloc « Trouvé aussi sur ton
// menu »). Tout le reste devient « autre ».
export const SUJETS_INFOS = Object.freeze(['promotion', 'livraison', 'horaires', 'fidelite', 'autre'])

// Un prix au-delà de ce plafond est presque toujours une erreur de lecture
// (« 1250 » pour « 12,50 »). On ne le jette pas : on le signale.
export const PRIX_MAX = 500

export const TYPES_DOCUMENT = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

// ⚠️ LA TAILLE SE BORNE AU SERVEUR, ET PAS SEULEMENT DANS LE NAVIGATEUR :
// l'écran réduit les photos, mais une requête peut arriver d'ailleurs. ~3,5 Mo
// de base64 au total, sous la limite de corps de requête de l'hébergeur.
export const TAILLE_MAX_BASE64 = 3_500_000

/** Les documents reçus, contrôlés : { ok, documents } ou { ok: false, error }. */
export function documentsValides(liste) {
  const docs = Array.isArray(liste) ? liste : []
  if (docs.length === 0) return { ok: false, error: 'Ajoute au moins une photo ou un PDF de ton menu.' }
  if (docs.length > MENU_MAX.pages) return { ok: false, error: `${MENU_MAX.pages} pages au maximum par lecture.` }
  let total = 0
  const propres = []
  for (const d of docs) {
    const type = String(d?.type || '')
    const data = String(d?.data || '')
    if (!TYPES_DOCUMENT.includes(type)) return { ok: false, error: 'Envoie une photo (JPEG, PNG, WebP) ou un PDF.' }
    if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) return { ok: false, error: 'Fichier illisible, réessaie.' }
    total += data.length
    propres.push({ type, data })
  }
  if (total > TAILLE_MAX_BASE64) return { ok: false, error: 'Fichiers trop lourds : envoie moins de pages, ou des photos plus légères.' }
  return { ok: true, documents: propres }
}

// ─── LES PETITS OUTILS ──────────────────────────────────────────────────────
const texte = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const arrondi = (n) => Math.round(n * 100) / 100

/**
 * Un prix lu sur un menu : « 12,50 », « 12.50 € », « €8 », 9. Rend un nombre
 * arrondi au centime, ou `null` si ce n'est pas un prix.
 * ⚠️ « 12,50 » EST LA FORME BELGE : la virgule est le séparateur décimal. Un
 * point et une virgule ensemble (« 1.250,00 ») : le point est le millier.
 */
export function lirePrix(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? arrondi(v) : null
  let s = String(v ?? '').replace(/€|eur(os?)?/gi, '').replace(/\s+/g, '').trim()
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? arrondi(n) : null
}

/** Le nom comparable de deux articles (casse, accents, espaces). */
export function cleNom(nom) {
  return String(nom ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// ─── UN GROUPE DE CHOIX ─────────────────────────────────────────────────────

// Les bornes que la base accepte (`article_options_groupes`) : au moins 0 à
// 30, au plus 1 à 30, et l'un sous l'autre. Hors de là, on ne devine pas : on
// laisse sans limite et on le signale.
export const CHOIX_MAX_LU = 30

/**
 * Le nombre de choix lu (« 3 ingrédients au choix » = au moins 3, au plus 3).
 * Rend { min, max } (null = pas de limite), ou null s'il est illisible.
 */
export function bornesLues(minBrut, maxBrut) {
  const ent = (x) => (x === undefined || x === null || x === '') ? null : (Number.isInteger(Number(x)) ? Number(x) : NaN)
  const min = ent(minBrut)
  const max = ent(maxBrut)
  if (Number.isNaN(min) || Number.isNaN(max)) return null
  if (min !== null && (min < 0 || min > CHOIX_MAX_LU)) return null
  if (max !== null && (max < 1 || max > CHOIX_MAX_LU)) return null
  if (min !== null && max !== null && min > max) return null
  return { min: min === 0 ? null : min, max }
}

/**
 * Les prix d'un supplément selon la taille (« jambon : 1,50 en M, 2,50 en
 * L ») : [{ taille, prix }], les illisibles signalés. Les tailles restent des
 * NOMS ici : l'article les rattache à son groupe « Taille ».
 */
function prixParTailleLus(liste, doutes, nomV) {
  const lignes = []
  const vues = new Set()
  for (const p of (Array.isArray(liste) ? liste : []).slice(0, MENU_MAX.valeursParGroupe)) {
    const taille = texte(p?.taille, MENU_MAX.nom)
    if (!taille || vues.has(cleNom(taille))) continue
    vues.add(cleNom(taille))
    const prix = lirePrix(p?.prix)
    if (prix === null || prix < 0 || prix > PRIX_MAX) {
      doutes.push(`Prix de « ${nomV} » en « ${taille} » illisible : vérifie-le.`)
      continue
    }
    lignes.push({ taille, prix })
  }
  return lignes
}

function normaliserGroupe(g, doutes, nomArticle) {
  const nom = texte(g?.nom, MENU_MAX.nom)
  if (!nom) return null
  const valeurs = []
  const vus = new Set()
  for (const v of (Array.isArray(g?.valeurs) ? g.valeurs : []).slice(0, MENU_MAX.valeursParGroupe)) {
    const nomV = texte(v?.nom, MENU_MAX.nom)
    if (!nomV || vus.has(cleNom(nomV))) continue
    vus.add(cleNom(nomV))
    let supplement = v?.supplement === undefined || v?.supplement === null || v?.supplement === '' ? 0 : lirePrix(v.supplement)
    if (supplement === null || supplement < 0 || supplement > PRIX_MAX) {
      doutes.push(`Supplément illisible pour « ${nomV} » (${nom}) : vérifie-le.`)
      supplement = 0
    }
    const parTaille = prixParTailleLus(v?.prix_par_taille, doutes, nomV)
    // ⚠️ LA CLÉ N'EXISTE QUE S'IL Y A DES PRIX PAR TAILLE : une valeur simple
    // garde sa forme { nom, supplement }.
    valeurs.push(parTaille.length > 0 ? { nom: nomV, supplement, parTaille } : { nom: nomV, supplement })
  }
  if (valeurs.length === 0) return null

  // LE NOMBRE DE CHOIX (13/10). « Choisis-en un » = un choix unique ; au-delà,
  // un choix multiple borné. Un minimum d'au moins 1 rend le groupe
  // obligatoire, comme le fait `bornesChoix` au moment de commander.
  const bornes = bornesLues(g?.choix_min, g?.choix_max)
  if (bornes === null) doutes.push(`Nombre de choix illisible pour « ${nom} » : vérifie-le.`)
  const { min, max } = bornes || { min: null, max: null }
  const multiple = max === 1 ? false : (g?.plusieurs === true || (max !== null && max > 1) || (min !== null && min > 1))
  return {
    nom,
    obligatoire: g?.obligatoire === true || (min !== null && min >= 1),
    // `unique` / `multiple` : les deux types que le catalogue connaît.
    type: multiple ? 'multiple' : 'unique',
    // ⚠️ LES BORNES N'EXISTENT QUE SUR UN CHOIX MULTIPLE, comme dans le
    // formulaire du catalogue (`nouveauGroupe`).
    choix_min: multiple ? min : null,
    choix_max: multiple ? max : null,
    valeurs,
  }
}

/**
 * Rattache les prix par taille d'un article à son groupe « Taille ». Une
 * taille inconnue de l'article est signalée et retirée ; un article sans
 * tailles ne peut pas avoir de prix par taille.
 */
function rattacherTailles(groupes, doutes) {
  const tailles = groupes.find(g => g.estTaille)
  for (const g of groupes) {
    if (g.estTaille) continue
    for (const v of g.valeurs) {
      if (!v.parTaille) continue
      if (!tailles) {
        doutes.push(`« ${v.nom} » a un prix par taille, mais l'article n'a pas de tailles : vérifie-le.`)
        delete v.parTaille
        continue
      }
      const connues = v.parTaille.filter(p => tailles.valeurs.some(t => cleNom(t.nom) === cleNom(p.taille)))
      for (const p of v.parTaille) {
        if (!connues.includes(p)) doutes.push(`Taille « ${p.taille} » inconnue pour « ${v.nom} » : vérifie-la.`)
      }
      // Les noms rattachés s'écrivent comme la taille de l'article.
      v.parTaille = connues.map(p => ({ taille: tailles.valeurs.find(t => cleNom(t.nom) === cleNom(p.taille)).nom, prix: p.prix }))
      if (v.parTaille.length === 0) { delete v.parTaille; continue }
      // Sans supplément écrit, le prix de la plus petite taille sert de prix
      // de repli (celui d'une taille qui n'aurait pas le sien).
      if (!v.supplement) {
        const petite = v.parTaille.find(p => p.taille === tailles.valeurs[0].nom)
        v.supplement = petite ? petite.prix : Math.min(...v.parTaille.map(p => p.prix))
      }
    }
  }
  for (const g of groupes) delete g.estTaille
}

// ─── UN ARTICLE ─────────────────────────────────────────────────────────────
/**
 * ⚠️ LES TAILLES DEVIENNENT UN CHOIX OBLIGATOIRE « Taille », et le prix de
 * l'article est celui de la PLUS PETITE : c'est ce que le client paie au
 * minimum, et les autres tailles s'ajoutent en supplément. Une seule taille
 * lisible n'est pas un choix : elle donne le prix, sans groupe.
 */
function normaliserArticle(a, categorie) {
  const nom = texte(a?.nom, MENU_MAX.nom)
  if (!nom) return null
  const doutes = []
  if (a?.doute) doutes.push(texte(a.doute, MENU_MAX.question))

  const tailles = []
  const vues = new Set()
  for (const t of Array.isArray(a?.tailles) ? a.tailles : []) {
    const nomT = texte(t?.nom, MENU_MAX.nom)
    const prixT = lirePrix(t?.prix)
    if (!nomT || vues.has(cleNom(nomT))) continue
    vues.add(cleNom(nomT))
    if (prixT === null || prixT <= 0 || prixT > PRIX_MAX) {
      doutes.push(`Prix de la taille « ${nomT} » à vérifier.`)
      continue
    }
    tailles.push({ nom: nomT, prix: prixT })
  }

  let prix = lirePrix(a?.prix)
  const groupes = []
  if (tailles.length >= 2) {
    const base = Math.min(...tailles.map(t => t.prix))
    prix = base
    groupes.push({
      nom: 'Taille',
      obligatoire: true,
      type: 'unique',
      choix_min: null,
      choix_max: null,
      valeurs: [...tailles].sort((x, y) => x.prix - y.prix).map(t => ({ nom: t.nom, supplement: arrondi(t.prix - base) })),
      // Marque de travail, retirée par `rattacherTailles`.
      estTaille: true,
    })
  } else if (tailles.length === 1 && (prix === null || prix <= 0)) {
    prix = tailles[0].prix
  }

  if (prix === null || prix <= 0) {
    doutes.push('Prix introuvable sur le menu : indique-le.')
    prix = null
  } else if (prix > PRIX_MAX) {
    doutes.push(`Prix inhabituel (${String(prix).replace('.', ',')} €) : vérifie qu'il n'est pas mal lu.`)
  }

  for (const g of (Array.isArray(a?.options) ? a.options : [])) {
    if (groupes.length >= MENU_MAX.groupesParArticle) break
    const groupe = normaliserGroupe(g, doutes, nom)
    if (groupe && !groupes.some(x => cleNom(x.nom) === cleNom(groupe.nom))) groupes.push(groupe)
  }
  rattacherTailles(groupes, doutes)

  return {
    nom,
    description: texte(a?.description, MENU_MAX.description) || null,
    categorie,
    prix,
    groupes,
    doutes,
  }
}

/**
 * La proposition de catalogue, remise en ordre.
 *
 * @param {object} brut  ce que l'IA a rendu (outil `proposer_catalogue`)
 * @returns {{
 *   lisible: boolean,
 *   categories: { nom, articles: { cle, nom, description, categorie, prix, groupes, doutes }[] }[],
 *   supplements: { nom, pour, obligatoire, type, valeurs }[],
 *   questions: { sujet, question, propositions: string[] }[],
 *   infos: { sujet, texte }[],
 *   resume: { categories, articles, doutes, tronque }
 * }}
 */
export function normaliserLecture(brut) {
  const categories = []
  const nomsVus = new Map() // clé du nom -> première catégorie où on l'a vu
  let total = 0
  let tronque = false

  for (const c of Array.isArray(brut?.categories) ? brut.categories : []) {
    if (categories.length >= MENU_MAX.categories) { tronque = true; break }
    const nomCat = texte(c?.nom, MENU_MAX.categorie) || 'À classer'
    let cat = categories.find(x => cleNom(x.nom) === cleNom(nomCat))
    if (!cat) { cat = { nom: nomCat, articles: [] }; categories.push(cat) }
    for (const a of Array.isArray(c?.articles) ? c.articles : []) {
      if (total >= MENU_MAX.articles) { tronque = true; break }
      const art = normaliserArticle(a, nomCat)
      if (!art) continue
      // ⚠️ UN DOUBLON SE SIGNALE, IL NE SE SUPPRIME PAS EN SILENCE : « Coca »
      // en boissons et « Coca » dans un menu enfant peuvent être deux choses.
      const cle = cleNom(art.nom)
      if (nomsVus.has(cle)) art.doutes.push(`Même nom qu'un article de « ${nomsVus.get(cle)} » : doublon ?`)
      else nomsVus.set(cle, nomCat)
      art.cle = `a${total}`
      cat.articles.push(art)
      total++
    }
  }
  const categoriesNonVides = categories.filter(c => c.articles.length > 0)

  // Les suppléments communs (« supplément fromage +1 € sur toutes les
  // pizzas ») : l'IA dit à quoi ils s'appliquent si le menu le dit, sinon la
  // relecture le demandera. Jamais appliqués d'office.
  const supplements = []
  for (const s of (Array.isArray(brut?.supplements_communs) ? brut.supplements_communs : []).slice(0, 10)) {
    const doutes = []
    const g = normaliserGroupe(s, doutes, null)
    if (!g) continue
    supplements.push({ ...g, pour: texte(s?.pour, MENU_MAX.categorie) || null })
  }

  const questions = []
  for (const q of (Array.isArray(brut?.questions) ? brut.questions : []).slice(0, 20)) {
    const question = texte(q?.question, MENU_MAX.question)
    if (!question) continue
    questions.push({
      sujet: texte(q?.sujet, MENU_MAX.nom) || null,
      question,
      propositions: (Array.isArray(q?.propositions) ? q.propositions : []).map(p => texte(p, MENU_MAX.nom)).filter(Boolean).slice(0, 5),
    })
  }

  // « TROUVÉ AUSSI SUR TON MENU » (décidé au tableau le 13/10) : promotions,
  // livraison, horaires, fidélité. Montré au commerçant avec le réglage où ça
  // se règle ; RIEN n'est appliqué tout seul.
  const infos = []
  for (const i of (Array.isArray(brut?.autres_infos) ? brut.autres_infos : []).slice(0, 10)) {
    const t = texte(i?.texte, MENU_MAX.question)
    if (!t) continue
    infos.push({ sujet: SUJETS_INFOS.includes(i?.sujet) ? i.sujet : 'autre', texte: t })
  }

  const doutes = categoriesNonVides.reduce((n, c) => n + c.articles.filter(a => a.doutes.length > 0).length, 0)
  return {
    // ⚠️ « illisible » SE DÉCIDE AUSSI ICI : un modèle qui dit « lisible » sans
    // rendre un seul article n'a rien lu.
    lisible: brut?.lisible !== false && total > 0,
    categories: categoriesNonVides,
    supplements,
    questions,
    infos,
    resume: { categories: categoriesNonVides.length, articles: total, doutes, tronque },
  }
}

// ─── CE QU'ON DEMANDE À L'IA ────────────────────────────────────────────────
// Un groupe de choix, tel que le modèle le remplit : pour un article comme
// pour les suppléments communs.
const GROUPE_LU = {
  type: 'object',
  properties: {
    nom: { type: 'string' },
    obligatoire: { type: 'boolean' },
    plusieurs: { type: 'boolean', description: 'true si on peut en prendre plusieurs' },
    choix_min: { type: 'integer', description: 'nombre minimum de choix si le menu le dit, sinon absent' },
    choix_max: { type: 'integer', description: 'nombre maximum de choix si le menu le dit, sinon absent' },
    valeurs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          supplement: { type: 'number' },
          prix_par_taille: {
            type: 'array',
            description: 'si le prix du supplément dépend de la taille : une ligne par taille, avec le nom de la taille écrit comme dans « tailles »',
            items: { type: 'object', properties: { taille: { type: 'string' }, prix: { type: 'number' } }, required: ['taille', 'prix'] },
          },
        },
        required: ['nom'],
      },
    },
  },
  required: ['nom', 'valeurs'],
}

// ⚠️ UN OUTIL, PAS DU TEXTE À DÉCOUPER : le modèle remplit un formulaire typé
// (`proposer_catalogue`), et ce module en contrôle chaque case.
export const OUTIL_CATALOGUE = Object.freeze({
  name: 'proposer_catalogue',
  description: 'Rend le catalogue lu sur le menu, tel qu il est écrit, avec les doutes et les questions.',
  input_schema: {
    type: 'object',
    properties: {
      lisible: { type: 'boolean', description: 'false si le document n est pas un menu ou n est pas lisible' },
      categories: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nom: { type: 'string' },
            articles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nom: { type: 'string' },
                  description: { type: 'string', description: 'ingrédients ou précisions écrits sur le menu, sinon vide' },
                  prix: { type: ['number', 'null'], description: 'prix unique en euros, null s il y a des tailles ou s il est illisible' },
                  tailles: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, prix: { type: 'number' } }, required: ['nom', 'prix'] } },
                  options: {
                    type: 'array',
                    description: 'choix propres à cet article (ex. boisson du menu, sauce au choix, ingrédients compris)',
                    items: GROUPE_LU,
                  },
                  doute: { type: 'string', description: 'ce qui est incertain pour cet article, sinon vide' },
                },
                required: ['nom'],
              },
            },
          },
          required: ['nom', 'articles'],
        },
      },
      supplements_communs: {
        type: 'array',
        description: 'suppléments listés à part et valables pour plusieurs articles',
        items: {
          type: 'object',
          properties: {
            ...GROUPE_LU.properties,
            pour: { type: 'string', description: 'la catégorie concernée si le menu le dit, sinon vide' },
          },
          required: ['nom', 'valeurs'],
        },
      },
      autres_infos: {
        type: 'array',
        description: 'ce que le menu dit d autre que ses articles : promotions, livraison (frais, minimum, zone), horaires, fidélité',
        items: {
          type: 'object',
          properties: {
            sujet: { type: 'string', enum: [...SUJETS_INFOS] },
            texte: { type: 'string', description: 'recopié du menu, en une ou deux phrases' },
          },
          required: ['sujet', 'texte'],
        },
      },
      questions: {
        type: 'array',
        description: 'questions précises au commerçant, une par vrai doute',
        items: {
          type: 'object',
          properties: {
            sujet: { type: 'string' },
            question: { type: 'string' },
            propositions: { type: 'array', items: { type: 'string' } },
          },
          required: ['question'],
        },
      },
    },
    required: ['lisible', 'categories'],
  },
})

export const CONSIGNE_LECTURE = `Tu lis le menu d'un commerce alimentaire belge (snack, pizzeria, friterie, restaurant, boulangerie, traiteur) pour préparer son catalogue en ligne. Le commerçant relira tout avant que quoi que ce soit soit publié.

Règles absolues :
1. Recopie ce qui est ÉCRIT. N'invente jamais un article, un prix, une taille, un ingrédient ou une catégorie qui n'est pas sur le document.
2. Les prix sont en euros. En Belgique la virgule est le séparateur décimal : « 12,50 » vaut 12.5.
3. Un article proposé en plusieurs tailles (petite, moyenne, grande, 26 cm, 33 cm...) : mets les tailles dans « tailles » avec leur prix, et laisse « prix » à null.
4. Une formule ou un menu (« menu burger : burger + frites + boisson au choix ») est UN article, avec son prix, et ses choix dans « options » (par exemple un choix obligatoire « Boisson »).
5. Un choix propre à un article (sauce au choix, cuisson) va dans ses « options ». Des suppléments listés à part et valables pour plusieurs articles (« supplément fromage 1 € ») vont dans « supplements_communs », avec la catégorie concernée si le menu la dit.
6. Garde l'orthographe du commerçant pour les noms, corrige seulement les fautes évidentes. Mets la description (ingrédients) si elle est écrite, sinon laisse vide.
7. Chaque fois que tu hésites (prix flou ou coupé, taille ambiguë, supplément dont on ne sait pas à quoi il s'applique, formule ou article), écris-le dans « doute » de l'article, et pose une question précise dans « questions », avec des propositions de réponse quand c'est possible.
8. Si le document n'est pas un menu ou est illisible, rends lisible = false et aucune catégorie.
9. Français de Belgique. N'utilise jamais le tiret cadratin.
10. Le nombre de choix : « 3 ingrédients au choix » donne choix_min = 3 et choix_max = 3 ; « jusqu'à 2 sauces » donne choix_max = 2 ; « une boisson au choix » est un choix obligatoire avec choix_max = 1. Si le menu ne dit rien, n'écris ni choix_min ni choix_max.
11. Des ingrédients COMPRIS dans le prix, puis payants au-delà (« 3 ingrédients compris, 1 € l'ingrédient en plus ») : fais DEUX options, « Ingrédients compris » (les ingrédients, sans supplément, avec le nombre compris en choix_max) et « Ingrédients en plus » (les mêmes ingrédients, plusieurs = true, avec leur supplément).
12. Un supplément dont le prix change avec la taille (« charcuterie 1,50 en M, 2,50 en L ») : mets ces prix dans « prix_par_taille », avec le nom de chaque taille écrit exactement comme dans « tailles ».
13. Ce que le menu dit d'autre que ses articles (promotion, livraison, horaires, fidélité) va dans « autres_infos », recopié. Ne recopie jamais un numéro de téléphone ou une adresse e-mail.
14. Une rubrique de suppléments ou de garnitures (« Suppléments », « Crudités », « Viandes », « Fromages ») n'est PAS une liste d'articles : mets-la dans « supplements_communs », avec la catégorie concernée et ses prix par taille. Ne la mets dans les articles que si le menu la vend seule.
15. Un article qui annonce « N ingrédients au choix » sans liste à côté : propose comme valeurs les garnitures listées ailleurs sur le menu (rubrique de suppléments, ingrédients des autres articles de la même famille), avec choix_min et choix_max, et signale-le dans « doute ».`

// ─── LA CORRECTION (13/10, demande d'Alex au premier essai) ─────────────────
// « Il faudrait que je puisse lui dire pour qu'il adapte. » Le commerçant
// écrit une remarque sur un article ou sur tout le menu ; Claude RELIT LES
// PAGES avec cette remarque et rend seulement ce qui change.
//
// ✅ ALEX (tableau, 13/10) : la correction relit les pages ; elle ne compte
// PAS dans le quota des lectures, mais 10 corrections au plus par lecture.
export const CORRECTIONS_PAR_LECTURE = 10
// Une lecture se corrige le jour même : au-delà, on relit le menu.
export const DUREE_LECTURE_HEURES = 24
export const REMARQUE_MAX = 500
// L'extrait de la relecture envoyé avec la remarque (JSON), borné.
export const CONTEXTE_MAX = 40_000

export const CONSIGNE_CORRECTION = `Tu as déjà lu ce menu une première fois. Le commerçant relit ta lecture et te signale une erreur. Tu corriges.

Règles de la correction :
1. La remarque du commerçant prime sur ta première lecture : il connaît sa carte. Si elle contredit clairement le document, garde ce qui est écrit et pose une question.
2. Relis les pages pour appliquer la remarque (par exemple retrouver la liste des garnitures, un prix, une taille).
3. Rends SEULEMENT les articles concernés par la remarque, complets (prix, tailles, options), dans leur catégorie. N'en rends pas d'autres.
4. Si la remarque dit qu'un « article » n'en est pas un (par exemple une rubrique de suppléments), mets son nom dans « retirer » et rends-le à la bonne place (« supplements_communs »).
5. Les règles de la première lecture restent valables, en particulier : n'invente rien, et signale chaque doute.`

export const OUTIL_CORRECTION = Object.freeze({
  name: 'corriger_catalogue',
  description: 'Rend uniquement ce qui change après la remarque du commerçant.',
  input_schema: {
    type: 'object',
    properties: {
      categories: OUTIL_CATALOGUE.input_schema.properties.categories,
      supplements_communs: OUTIL_CATALOGUE.input_schema.properties.supplements_communs,
      retirer: { type: 'array', description: 'noms exacts des articles de la lecture qui ne doivent plus être des articles', items: { type: 'string' } },
      questions: OUTIL_CATALOGUE.input_schema.properties.questions,
    },
    required: ['categories'],
  },
})

/**
 * Le texte envoyé avec les pages pour une correction : le commerce, la
 * remarque, et l'extrait de la relecture (déjà contrôlé en taille).
 */
export function consigneDeCorrection({ com, remarque, contexte }) {
  return [
    `Commerce : ${com?.nom || ''}${com?.type ? ` (${com.type})` : ''}.`,
    `Remarque du commerçant : ${remarque}`,
    contexte?.cible
      ? `Article concerné, tel que tu l'as lu (JSON) :\n${JSON.stringify(contexte.cible)}`
      : 'La remarque porte sur tout le menu.',
    `Ta lecture actuelle, en bref (JSON) :\n${JSON.stringify(contexte?.carte || [])}`,
    'Relis les pages, applique la remarque, et remplis corriger_catalogue.',
  ].join('\n\n')
}

/** La remarque saisie, propre : { ok, remarque } ou { ok: false, error }. */
export function remarqueValide(v) {
  const r = texte(v, REMARQUE_MAX + 1)
  if (r.length < 3) return { ok: false, error: 'Écris ce qu’il faut corriger.' }
  if (r.length > REMARQUE_MAX) return { ok: false, error: `${REMARQUE_MAX} caractères au maximum.` }
  return { ok: true, remarque: r }
}

/** L'extrait envoyé avec la remarque : un objet, et pas trop gros. */
export function contexteValide(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, error: 'Extrait de la lecture manquant.' }
  const n = JSON.stringify(c).length
  if (n > CONTEXTE_MAX) return { ok: false, error: 'Menu trop long pour une correction : corrige article par article.' }
  return { ok: true, contexte: { cible: c.cible ?? null, carte: Array.isArray(c.carte) ? c.carte : [] } }
}

/**
 * La correction, remise en ordre comme une lecture : { categories,
 * supplements, questions, retirer, vide }.
 */
export function normaliserCorrection(brut) {
  const p = normaliserLecture({ lisible: true, categories: brut?.categories, supplements_communs: brut?.supplements_communs, questions: brut?.questions })
  const retirer = (Array.isArray(brut?.retirer) ? brut.retirer : []).map(x => texte(x, MENU_MAX.nom)).filter(Boolean).slice(0, MENU_MAX.articles)
  return {
    categories: p.categories,
    supplements: p.supplements,
    questions: p.questions,
    retirer,
    vide: p.resume.articles === 0 && p.supplements.length === 0 && retirer.length === 0,
  }
}
