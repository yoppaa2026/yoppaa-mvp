// LA RELECTURE DU MENU LU (13/10, session 2 du chantier « menu lu par l'IA »).
//
// La lecture (`lib/menu-lu.js`) rend une PROPOSITION. Ce module en fait l'état
// de l'écran de relecture, et dit quand elle est prête à créer : rien n'est
// créé sans que le commerçant ait regardé (décision d'Alex, semi-automatique
// TOUJOURS).
//
// ⚠️ MODULE PUR : aucun accès réseau ni base, le banc l'exécute.

import { lirePrix, cleNom, PRIX_MAX, MENU_MAX, TYPES_DOCUMENT } from './menu-lu.js'
import { libelleBornes } from './options-choix.js'

const fmt = (n) => Number(n).toFixed(2).replace('.', ',')

// ─── L'ENVOI ────────────────────────────────────────────────────────────────

// La plus grande dimension d'une photo réduite dans le navigateur. Un menu
// reste lisible à cette taille, et quatre pages tiennent sous la limite du
// serveur (`TAILLE_MAX_BASE64`).
export const COTE_MAX_PHOTO = 1800
export const QUALITE_JPEG = 0.82

/**
 * Les fichiers choisis, triés avant l'envoi : { pages, refus } où `refus` dit
 * pourquoi un fichier est écarté (type inconnu, trop de pages).
 */
export function pagesAcceptees(fichiers = [], dejaLa = 0) {
  const pages = []
  const refus = []
  for (const f of Array.from(fichiers || [])) {
    const type = String(f?.type || '')
    if (!TYPES_DOCUMENT.includes(type)) { refus.push(`« ${f?.name || 'fichier'} » : envoie une photo (JPEG, PNG, WebP) ou un PDF.`); continue }
    if (dejaLa + pages.length >= MENU_MAX.pages) { refus.push(`${MENU_MAX.pages} pages au maximum par lecture.`); break }
    pages.push(f)
  }
  return { pages, refus }
}

// ─── L'ÉTAT DE LA RELECTURE ─────────────────────────────────────────────────

/**
 * L'état de départ de l'écran, à partir de la proposition et du catalogue
 * actuel du commerce (noms des articles déjà là).
 *
 * ⚠️ UN ARTICLE DÉJÀ AU CATALOGUE N'EST PAS COCHÉ : le recréer ferait un
 * doublon que le client verrait deux fois. Il reste visible, marqué « déjà
 * dans ton catalogue », et le commerçant peut le cocher s'il le veut.
 */
/** Un article lu, tel que l'écran de relecture le tient. */
function articleDeRelecture(a, nomCategorie, existants, cle) {
  const deja = existants.has(cleNom(a.nom))
  return {
    cle,
    nom: a.nom,
    description: a.description || '',
    categorie: a.categorie || nomCategorie,
    prixTexte: a.prix === null || a.prix === undefined ? '' : fmt(a.prix),
    groupes: (a.groupes || []).map((g, i) => ({ ...g, cle: `${cle}-g${i}`, garder: true })),
    doutes: a.doutes || [],
    // Un doute se lève à la main : « J'ai vérifié ».
    verifie: false,
    deja,
    garder: !deja,
  }
}

// Les suppléments communs ne s'appliquent JAMAIS d'office (13/10) : le
// commerçant choisit les catégories qui les reçoivent (plusieurs : « toutes
// les pizzas » couvre souvent trois catégories, Alex au premier essai).
const supplementDeRelecture = (s, cle) => ({ ...s, cle, appliquerA: [] })

export function etatRelecture(proposition, nomsExistants = []) {
  const existants = new Set((nomsExistants || []).map(cleNom))
  const articles = []
  for (const c of proposition?.categories || []) {
    for (const a of c.articles || []) articles.push(articleDeRelecture(a, c.nom, existants, a.cle))
  }
  return {
    articles,
    supplements: (proposition?.supplements || []).map((s, i) => supplementDeRelecture(s, `s${i}`)),
    questions: (proposition?.questions || []).map((q, i) => ({ ...q, cle: `q${i}`, reglee: false })),
    infos: proposition?.infos || [],
    // Le numéro de la prochaine correction : il rend les clés uniques.
    corrections: 0,
  }
}

// ─── LA CORRECTION (13/10, Alex : « que je puisse lui dire ») ───────────────

/** Un article de la relecture, en bref, pour l'IA (sans les marques de l'écran). */
function articleEnBref(a) {
  return {
    nom: a.nom,
    categorie: a.categorie,
    prix: prixDeSaisie(a.prixTexte),
    description: a.description || undefined,
    choix: (a.groupes || []).filter(g => g.garder !== false).map(g => ({
      nom: g.nom, type: g.type, obligatoire: g.obligatoire, choix_min: g.choix_min ?? undefined, choix_max: g.choix_max ?? undefined,
      valeurs: (g.valeurs || []).map(v => ({ nom: v.nom, supplement: v.supplement || undefined, prix_par_taille: v.parTaille })),
    })),
  }
}

/**
 * L'extrait envoyé avec une remarque : l'article visé en entier (s'il y en a
 * un), et toute la carte en bref, pour que l'IA sache ce qui existe déjà.
 */
export function contexteDeCorrection(etat, cleCible = null) {
  const cible = cleCible ? (etat?.articles || []).find(a => a.cle === cleCible) : null
  return {
    cible: cible ? articleEnBref(cible) : null,
    carte: (etat?.articles || []).map(a => ({ nom: a.nom, categorie: a.categorie, prix: prixDeSaisie(a.prixTexte) })),
  }
}

/**
 * Applique une correction à la relecture, SANS TOUCHER AU RESTE : les prix
 * corrigés, les cases cochées et les doutes vérifiés des autres articles
 * restent tels quels.
 *
 *   - sur un article : il est remplacé, à sa place, par ce que l'IA rend ;
 *   - sur tout le menu : chaque article rendu remplace celui du même nom, ou
 *     s'ajoute à la fin de sa catégorie ;
 *   - « retirer » : l'article reste visible, DÉCOCHÉ et marqué (rien ne
 *     disparaît sans que le commerçant le voie) ;
 *   - les suppléments communs rendus remplacent ceux du même nom, ou
 *     s'ajoutent, toujours sans catégorie choisie.
 *
 * Rend { etat, revus, retires, supplements }.
 */
export function appliquerCorrection(etat, correction, { cleCible = null, nomsExistants = [] } = {}) {
  const existants = new Set((nomsExistants || []).map(cleNom))
  const numero = (etat?.corrections || 0) + 1
  let n = 0
  const nouveaux = []
  for (const c of correction?.categories || []) {
    for (const a of c.articles || []) nouveaux.push(articleDeRelecture(a, c.nom, existants, `c${numero}-${n++}`))
  }
  let liste = [...(etat?.articles || [])]

  if (cleCible) {
    const i = liste.findIndex(a => a.cle === cleCible)
    // Rien de rendu pour l'article visé : il reste tel quel (jamais effacé
    // en silence).
    if (i >= 0 && nouveaux.length > 0) liste.splice(i, 1, ...nouveaux)
    else if (i < 0) liste.push(...nouveaux)
  } else {
    for (const nv of nouveaux) {
      const j = liste.findIndex(a => cleNom(a.nom) === cleNom(nv.nom))
      if (j >= 0) { liste[j] = nv; continue }
      let fin = -1
      liste.forEach((a, k) => { if (cleNom(a.categorie) === cleNom(nv.categorie)) fin = k })
      if (fin >= 0) liste.splice(fin + 1, 0, nv)
      else liste.push(nv)
    }
  }

  const neufs = new Set(nouveaux.map(a => a.cle))
  const aRetirer = new Set((correction?.retirer || []).map(cleNom))
  let retires = 0
  liste = liste.map(a => {
    if (neufs.has(a.cle) || !aRetirer.has(cleNom(a.nom))) return a
    retires++
    return { ...a, garder: false, retireParIA: true }
  })

  const supplements = [...(etat?.supplements || [])]
  ;(correction?.supplements || []).forEach((s, i) => {
    const neuf = supplementDeRelecture(s, `cs${numero}-${i}`)
    const j = supplements.findIndex(x => cleNom(x.nom) === cleNom(s.nom))
    if (j >= 0) supplements[j] = neuf
    else supplements.push(neuf)
  })

  const questions = [
    ...(etat?.questions || []),
    ...(correction?.questions || []).map((q, i) => ({ ...q, cle: `cq${numero}-${i}`, reglee: false })),
  ]

  return {
    etat: { ...etat, articles: liste, supplements, questions, corrections: numero },
    revus: nouveaux.length,
    retires,
    supplements: (correction?.supplements || []).length,
  }
}

/** Ce que la correction a changé, en mots. */
export function phraseDeCorrection({ revus = 0, retires = 0, supplements = 0 } = {}) {
  const m = []
  if (revus) m.push(`${revus} article${revus > 1 ? 's' : ''} revu${revus > 1 ? 's' : ''}`)
  if (retires) m.push(`${retires} décoché${retires > 1 ? 's' : ''} (à retirer selon l’IA)`)
  if (supplements) m.push(`${supplements} groupe${supplements > 1 ? 's' : ''} de suppléments`)
  return m.length ? `Corrigé : ${m.join(', ')}.` : 'Rien n’a changé.'
}

/** Un prix saisi à la relecture : un nombre de 0,01 à 500 €, ou null. */
export function prixDeSaisie(txt) {
  const n = lirePrix(txt)
  return n !== null && n > 0 && n <= PRIX_MAX ? n : null
}

/** Les catégories de la relecture, dans l'ordre du menu, sans doublon. */
export function categoriesDeRelecture(etat) {
  const vues = []
  for (const a of etat?.articles || []) {
    const nom = String(a.categorie || '').trim()
    if (nom && !vues.some(v => cleNom(v) === cleNom(nom))) vues.push(nom)
  }
  return vues
}

/** L'article visé par une question (par son nom), ou null. */
export function articleDeQuestion(question, articles = []) {
  if (!question?.sujet) return null
  return articles.find(a => cleNom(a.nom) === cleNom(question.sujet)) || null
}

// ─── CE QUE L'ÉCRAN DIT D'UN GROUPE ─────────────────────────────────────────

/** « Jambon +1,50 € » ou « Jambon M 1,50 · L 2,50 · XL 3,50 € ». */
export function libelleValeur(v) {
  if (Array.isArray(v?.parTaille) && v.parTaille.length > 0) {
    return `${v.nom} ${v.parTaille.map(p => `${p.taille} ${fmt(p.prix)}`).join(' · ')} €`
  }
  return Number(v?.supplement) > 0 ? `${v.nom} +${fmt(v.supplement)} €` : v?.nom || ''
}

/** Le résumé d'un groupe : « Taille (choisis-en un) : M, L +3,00 €, XL +6,00 € ». */
export function resumeGroupe(g) {
  const regle = libelleBornes(g).toLowerCase()
  return `${g?.nom} (${g?.obligatoire && g?.type === 'multiple' && !Number.isInteger(g?.choix_min) ? `obligatoire, ${regle}` : regle}) : ${(g?.valeurs || []).map(libelleValeur).join(', ')}`
}

// ─── PRÊT À CRÉER ? ─────────────────────────────────────────────────────────

/**
 * Le bilan de la relecture.
 *   aCreer      articles cochés
 *   sansPrix    cochés sans prix valable (bloquant)
 *   sansNom     cochés sans nom (bloquant)
 *   aVerifier   cochés avec un doute pas encore vérifié (bloquant)
 *   pret        tout est prêt à créer
 *
 * 🔴 UN DOUTE NON VÉRIFIÉ BLOQUE LA CRÉATION. Un prix mal lu sur un menu,
 * c'est de l'argent et un litige au comptoir : le commerçant le regarde, puis
 * coche « J'ai vérifié ».
 */
export function bilanRelecture(etat) {
  const coches = (etat?.articles || []).filter(a => a.garder)
  const sansPrix = coches.filter(a => prixDeSaisie(a.prixTexte) === null).length
  const sansNom = coches.filter(a => !String(a.nom || '').trim()).length
  const aVerifier = coches.filter(a => a.doutes.length > 0 && !a.verifie).length
  return {
    aCreer: coches.length,
    sansPrix,
    sansNom,
    aVerifier,
    deja: (etat?.articles || []).filter(a => a.deja).length,
    pret: coches.length > 0 && sansPrix === 0 && sansNom === 0 && aVerifier === 0,
  }
}

/** Ce qui manque encore, en mots, ou '' si tout est prêt. */
export function phraseDuBilan(b) {
  if (!b || b.aCreer === 0) return 'Coche au moins un article à créer.'
  const manques = []
  if (b.aVerifier > 0) manques.push(`${b.aVerifier} article${b.aVerifier > 1 ? 's' : ''} à vérifier`)
  if (b.sansPrix > 0) manques.push(`${b.sansPrix} prix à indiquer`)
  if (b.sansNom > 0) manques.push(`${b.sansNom} nom${b.sansNom > 1 ? 's' : ''} à indiquer`)
  return manques.length ? `Encore ${manques.join(', ')}.` : ''
}

// Où se règle ce que le menu dit d'autre (bloc « Trouvé aussi sur ton menu »),
// avec les noms des onglets des Paramètres (les horaires vivent dans le Profil
// général).
export const OU_REGLER_INFO = Object.freeze({
  promotion: 'Paramètres, Deals',
  livraison: 'Paramètres, Livraison',
  horaires: 'Paramètres, Profil général',
  fidelite: 'Paramètres, Fidélité',
  autre: null,
})
