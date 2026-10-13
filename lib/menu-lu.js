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
    valeurs.push({ nom: nomV, supplement })
  }
  if (valeurs.length === 0) return null
  return {
    nom,
    obligatoire: g?.obligatoire === true,
    // `unique` / `multiple` : les deux types que le catalogue connaît.
    type: g?.plusieurs === true ? 'multiple' : 'unique',
    valeurs,
  }
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
      valeurs: [...tailles].sort((x, y) => x.prix - y.prix).map(t => ({ nom: t.nom, supplement: arrondi(t.prix - base) })),
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

  const doutes = categoriesNonVides.reduce((n, c) => n + c.articles.filter(a => a.doutes.length > 0).length, 0)
  return {
    // ⚠️ « illisible » SE DÉCIDE AUSSI ICI : un modèle qui dit « lisible » sans
    // rendre un seul article n'a rien lu.
    lisible: brut?.lisible !== false && total > 0,
    categories: categoriesNonVides,
    supplements,
    questions,
    resume: { categories: categoriesNonVides.length, articles: total, doutes, tronque },
  }
}

// ─── CE QU'ON DEMANDE À L'IA ────────────────────────────────────────────────
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
                    description: 'choix propres à cet article (ex. boisson du menu, sauce au choix)',
                    items: {
                      type: 'object',
                      properties: {
                        nom: { type: 'string' },
                        obligatoire: { type: 'boolean' },
                        plusieurs: { type: 'boolean', description: 'true si on peut en prendre plusieurs' },
                        valeurs: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, supplement: { type: 'number' } }, required: ['nom'] } },
                      },
                      required: ['nom', 'valeurs'],
                    },
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
            nom: { type: 'string' },
            pour: { type: 'string', description: 'la catégorie concernée si le menu le dit, sinon vide' },
            valeurs: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, supplement: { type: 'number' } }, required: ['nom'] } },
          },
          required: ['nom', 'valeurs'],
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
9. Français de Belgique. N'utilise jamais le tiret cadratin.`
