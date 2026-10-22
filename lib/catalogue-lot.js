// AGIR SUR PLUSIEURS ARTICLES D'UN COUP.
//
// 🔴 POURQUOI (Alex, 25/09). Tout se fait article par article : rendre
// indisponible, changer de catégorie, ajuster un prix. Un soir de rupture,
// c'est un clic par pizza ; une carte qui change de saison, c'est une heure.
//
// ⚠️ LES TROIS ACTIONS NE SE VALENT PAS, ET LE MODULE LE DIT.
//   • DISPONIBILITÉ : se défait d'un clic, aucun regret possible.
//   • CATÉGORIE : se refait, mais il faut se souvenir d'où venait chaque
//     article, et ça, personne ne s'en souvient.
//   • PRIX : 🔴 NE SE DÉFAIT PAS. L'ancien prix n'est écrit nulle part, aucune
//     colonne ne le garde. Un « -10 % » appliqué deux fois par erreur ne se
//     rattrape qu'à la main, article par article, de mémoire. C'est pour ça
//     que cette action-là exige une confirmation qui montre le résultat.
//
// ⚠️ MODULE PUR. Il calcule des patchs, il n'écrit rien : c'est ce qui permet
// de mesurer chaque règle sans toucher à une base.

import { champsStock, refusQuantite, modeStockDe, MODES_STOCK, refusCircuits, champsCircuits } from './stock-article.js'
import { heureDePlage, refusDeSaisiePlage, libellePlage } from './plage-retrait.js'

// ⚠️ 10/10 (Alex, en encodant une pizzeria) : le TYPE DE STOCK et sa quantité,
// la TVA, et le temps de préparation (une pizzeria qui compte sa capacité en
// minutes) se règlent aussi d'un coup. Les trois RÉUTILISENT la règle d'un seul
// article (`champsStock`, `refusQuantite`) : deux règles divergeraient.
// ✅ 15/10 (Alex, au tableau, en encodant) : la façon de VENDRE se règle aussi
// d'un coup : en ligne ou en vitrine (`vente`), le jour même ou non
// (`jour_meme`), sur commande ou non (`sur_commande`). Elles réutilisent les
// règles de la fiche article (`refusQuantite`, `refusCircuits`,
// `champsCircuits`), et un article qu'une règle refuse est LAISSÉ DE CÔTÉ ET
// NOMMÉ (`ecartsDuLot`), jamais écrit à moitié.
// ✅ 19/10 (Alex, tableau) : la PLAGE DE RETRAIT (`plage`) se règle aussi d'un
// coup, pour toute une catégorie (« Sandwichs : jusqu'à 15 h »). Alimentaire
// seulement, comme les deux circuits : la boutique n'a pas de créneaux.
export const ACTIONS_LOT = ['disponible', 'indisponible', 'categorie', 'prix', 'stock', 'tva', 'temps_prepa', 'vente', 'jour_meme', 'sur_commande', 'plage']

// Les deux façons de vendre, mots de la fiche article (`choixDeVente`).
export const VENTE_EN_LIGNE = 'en_ligne'
export const VENTE_VITRINE = 'vitrine'

// Le délai d'une commande à l'avance se règle en jours dans le lot ; la base
// le garde en minutes, comme la fiche article (`delai_minutes`, 1 440 = 1 jour).
export const DELAI_JOURS_MAX = 60
const MINUTES_JOUR = 1440

// Les actions qui ne concernent que l'alimentaire (deux circuits : le jour même
// et sur commande, `aDeuxCircuits`). Hors alimentaire, la boutique garde son
// propre délai, et ces actions ne lui sont pas proposées.
export const ACTIONS_DEUX_CIRCUITS = ['jour_meme', 'sur_commande']

// Les réglages de vente d'un article, sous la forme que lit `refusCircuits`.
const circuitsDe = (a, change = {}) => ({
  vente_jour: a?.vente_jour !== false,
  commande_active: a?.commande_active === true,
  delai_minutes: a?.delai_minutes ?? 0,
  commande_max_jour: a?.commande_max_jour ?? '',
  horizon_jours: a?.horizon_jours ?? '',
  stock_mode: modeStockDe(a),
  ...change,
})

// La quantité du jour d'un article qui se vend aujourd'hui doit être valable :
// sinon il s'afficherait épuisé (« 0 par jour » n'existe pas).
const SANS_QUANTITE = 'pas de quantité valable : règle d’abord son stock (« Stock et quantités »)'

// Les jours d'une commande à l'avance, lus depuis la saisie du lot.
function delaiEnMinutes(valeur) {
  const brut = String(valeur?.delaiJours ?? '').trim()
  return /^\d+$/.test(brut) ? Number(brut) * MINUTES_JOUR : NaN
}

/**
 * Pourquoi CET article ne peut pas recevoir l'action, ou `null`.
 *
 * ⚠️ UNE RAISON, PAS UN CODE : elle s'affiche telle quelle à côté du nom.
 * ⚠️ `deuxCircuits` : faux hors alimentaire, où le jour même et la commande à
 * l'avance ne se règlent pas ainsi.
 */
export function ecartDuLot({ action, article: a, valeur = null, deuxCircuits = true } = {}) {
  if (!a) return null
  if (action === 'vente') {
    // En vitrine, rien ne se commande : aucune règle de vente à respecter.
    if (valeur !== VENTE_EN_LIGNE || a.est_vitrine !== true) return null
    const c = circuitsDe(a)
    const aujourdhui = !deuxCircuits || c.vente_jour
    if (aujourdhui && refusQuantite(modeStockDe(a), a.stock_jour)) return SANS_QUANTITE
    if (deuxCircuits) {
      const refus = refusCircuits(c)
      if (refus) return refus
    }
    return null
  }
  if (ACTIONS_DEUX_CIRCUITS.includes(action) || action === 'plage') {
    if (!deuxCircuits) return 'réglage réservé aux commerces alimentaires'
    if (a.est_vitrine === true) return 'en vitrine : il ne se commande pas en ligne'
  }
  if (action === 'jour_meme') {
    if (valeur === true) {
      if (a.vente_jour !== false) return null
      if (refusQuantite(modeStockDe(a), a.stock_jour)) return SANS_QUANTITE
      return refusCircuits(circuitsDe(a, { vente_jour: true }))
    }
    if (valeur === false) {
      if (a.vente_jour === false) return null
      // 🔴 SANS COMMANDE À L'AVANCE, « non » ne le vendrait plus DU TOUT.
      if (a.commande_active !== true) return 'il ne se vend pas sur commande : il ne serait plus vendu du tout'
      return refusCircuits(circuitsDe(a, { vente_jour: false }))
    }
    return null
  }
  if (action === 'sur_commande') {
    if (valeur?.actif === false) {
      if (a.commande_active !== true) return null
      // 🔴 MÊME PIÈGE DANS L'AUTRE SENS : s'il ne se vend QUE sur commande.
      if (a.vente_jour === false) return 'il ne se vend que sur commande : il ne serait plus vendu du tout'
      return null
    }
    if (valeur?.actif === true) {
      return refusCircuits(circuitsDe(a, {
        commande_active: true,
        delai_minutes: delaiEnMinutes(valeur),
        commande_max_jour: String(valeur?.max ?? '').trim(),
      }))
    }
  }
  return null
}

/** Les articles laissés de côté, avec leur raison : [{ id, nom, raison }]. */
export function ecartsDuLot({ action, articles = [], valeur = null, deuxCircuits = true } = {}) {
  const sortie = []
  for (const a of Array.isArray(articles) ? articles : []) {
    const raison = ecartDuLot({ action, article: a, valeur, deuxCircuits })
    if (raison) sortie.push({ id: a.id, nom: a.nom, raison })
  }
  return sortie
}

// La TVA d'un lot : chaque champ peut rester tel quel. `INCHANGE` n'écrit rien ;
// une chaîne vide remet « à définir » (null), comme le formulaire.
export const TVA_INCHANGEE = 'inchange'

const tauxOuNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const memeTaux = (a, b) => (a === null || a === undefined || a === '' ? null : Number(a)) === b

/**
 * Ce qui empêche une action groupée de partir, ou `null`.
 * Le prix garde son refus propre (`refusDAjustement`) ; les autres actions ont
 * le leur ici, avec les MÊMES mots que le formulaire d'un article.
 */
export function refusDuLot({ action, articles = [], valeur = null, prixVariantes = [] } = {}) {
  const liste = Array.isArray(articles) ? articles : []
  if (liste.length === 0) return 'Choisis au moins un article.'
  if (action === 'prix') return refusDAjustement(liste, valeur, prixVariantes)
  if (action === 'stock') {
    const mode = valeur?.mode
    if (!MODES_STOCK.includes(mode)) return 'Choisis le type de stock.'
    return refusQuantite(mode, valeur?.quantite)
  }
  if (action === 'tva') {
    const e = valeur?.emporter ?? TVA_INCHANGEE
    const s = valeur?.surPlace ?? TVA_INCHANGEE
    if (e === TVA_INCHANGEE && s === TVA_INCHANGEE) return 'Choisis au moins un taux à changer.'
    for (const t of [e, s]) {
      if (t === TVA_INCHANGEE || t === '') continue
      const n = Number(t)
      if (!Number.isFinite(n) || n < 0 || n > 100) return 'Ce taux de TVA n’est pas valable.'
    }
    return null
  }
  if (action === 'temps_prepa') {
    const brut = String(valeur ?? '').trim()
    if (!/^\d+$/.test(brut)) return 'Indique un temps de préparation en minutes (0 ou plus).'
    if (Number(brut) > 600) return 'Plus de 10 heures de préparation : vérifie le chiffre.'
    return null
  }
  if (action === 'vente') {
    if (![VENTE_EN_LIGNE, VENTE_VITRINE].includes(valeur)) return 'Choisis « Vendu en ligne » ou « En vitrine seulement ».'
    return null
  }
  if (action === 'jour_meme') {
    if (valeur !== true && valeur !== false) return 'Choisis « Oui, le jour même » ou « Non ».'
    return null
  }
  if (action === 'plage') {
    // Les deux vides = « tous les créneaux » : c'est un choix valable (on
    // retire une plage). La saisie, elle, suit la fiche article.
    return refusDeSaisiePlage(valeur?.de, valeur?.a)
  }
  if (action === 'sur_commande') {
    if (valeur?.actif !== true && valeur?.actif !== false) return 'Choisis « Oui, sur commande » ou « Non ».'
    if (valeur.actif === false) return null
    // Les mêmes bornes que la fiche article : 1 jour au moins, un maximum par
    // jour qui commence à 1 (vide = sans limite).
    const jours = String(valeur?.delaiJours ?? '').trim()
    if (!/^\d+$/.test(jours) || Number(jours) < 1) return 'Sur commande, le délai commence à 1 jour : commandé aujourd’hui, retiré demain.'
    if (Number(jours) > DELAI_JOURS_MAX) return `Plus de ${DELAI_JOURS_MAX} jours à l’avance : vérifie le chiffre.`
    const max = String(valeur?.max ?? '').trim()
    if (max !== '' && !(/^\d+$/.test(max) && Number(max) >= 1)) return 'Le maximum par jour commence à 1. Laisse vide pour « sans limite ».'
    return null
  }
  return null
}

/**
 * Les articles visés, retrouvés depuis leurs identifiants.
 *
 * ⚠️ LES IDENTIFIANTS ARRIVENT EN TEXTE depuis les cases à cocher, et en
 * nombre depuis la base. Comparer sans convertir laisse une sélection vide
 * alors que l'écran montre douze articles cochés.
 */
export function articlesDuLot(articles = [], ids = []) {
  const vises = new Set((Array.isArray(ids) ? ids : []).map(String))
  return (Array.isArray(articles) ? articles : []).filter(a => a && vises.has(String(a.id)))
}

/**
 * Le prix d'un article après un ajustement en pourcentage.
 *
 * ⚠️ ON ARRONDIT AU CENTIME, ET ON LE FAIT ICI. Laisser courir les décimales
 * donnerait des 9,405 € en base, que chaque écran arrondirait à sa façon : le
 * panier, la facture et le ticket finiraient par ne plus dire la même chose.
 *
 * 🔴 ET ON CALCULE EN CENTIMES, PAS EN EUROS. Défaut trouvé par le banc le
 * 25/09 : `9.5 * 0.99` vaut 9,404999999999999 en binaire, pas 9,405. L'arrondi
 * rendait donc 9,40 € là où le commerçant attend 9,41 €. Un centime par
 * article, sur un catalogue entier, sur chaque changement de saison. Partir de
 * l'entier de centimes enlève la dérive avant qu'elle commence.
 *
 * @returns le nouveau prix, ou `null` si l'article n'a pas de prix utilisable.
 */
export function prixAjuste(prix, pourcent) {
  const base = Number(prix)
  const p = Number(pourcent)
  if (!Number.isFinite(base) || base <= 0) return null
  if (!Number.isFinite(p) || p === 0) return null
  const centimes = Math.round(base * 100)
  return Math.round(centimes * (1 + p / 100)) / 100
}

// ─── LES PRIX EN LOT, PLUS RICHES (22/10, Alex, tableau de l'audit) ─────────
//
// « Mettre à 12 € » (un prix fixe) et « +0,50 € » (un montant), en plus du
// pourcentage. Une valeur simple (nombre ou texte) reste un pourcentage : c'est
// la forme d'avant, gardée telle quelle.
//
// 🟠 ET LES VARIANTES SUIVENT (audit O4) : des soldes à -20 % laissaient au
// plein tarif les robes qui ont un prix par taille, alors que le résumé
// annonçait la baisse. Un prix FIXE, lui, ne touche pas les prix propres des
// variantes (« le XXL à +5 € » reste un choix du commerçant) : on le dit.
export const MODES_PRIX_LOT = [
  { mode: 'pourcent', titre: 'En %', exemple: '-10' },
  { mode: 'fixe', titre: 'Mettre à', exemple: '12,50' },
  { mode: 'ecart', titre: 'Ajouter ou retirer', exemple: '+0,50' },
]

/** { mode, n } depuis la saisie du lot : un nombre seul est un pourcentage. */
export function lirePrixLot(valeur) {
  if (valeur && typeof valeur === 'object') {
    const mode = ['fixe', 'ecart'].includes(valeur.mode) ? valeur.mode : 'pourcent'
    const s = String(valeur.saisie ?? '').trim().replace(',', '.').replace(/^\+/, '').replace(/\s*€$/, '')
    return { mode, n: s === '' || !/^-?\d+(\.\d+)?$/.test(s) ? NaN : Number(s) }
  }
  return { mode: 'pourcent', n: Number(valeur) }
}

const centimes = (x) => Math.round(Number(x) * 100)

/** Le prix après l'action du lot, arrondi au centime, ou `null` s'il ne change pas. */
export function nouveauPrix(prix, valeur) {
  const { mode, n } = lirePrixLot(valeur)
  if (mode === 'pourcent') return prixAjuste(prix, n)
  if (!Number.isFinite(n)) return null
  if (mode === 'fixe') return n > 0 ? centimes(n) / 100 : null
  const base = Number(prix)
  if (!Number.isFinite(base) || base <= 0 || n === 0) return null
  return (centimes(base) + centimes(n)) / 100
}

/**
 * Les prix propres des variantes des articles visés : [{ id, article_id, prix }].
 * `variantesParArticle` : { [articleId]: [{ id, prix }] }. Un prix vide suit
 * déjà l'article ; un prix fixe ne les touche pas.
 */
export function prixDesVariantesDuLot({ articles = [], variantesParArticle = {}, valeur = null } = {}) {
  const { mode } = lirePrixLot(valeur)
  if (mode === 'fixe') return []
  const sortie = []
  for (const a of Array.isArray(articles) ? articles : []) {
    for (const v of variantesParArticle?.[a?.id] || variantesParArticle?.[String(a?.id)] || []) {
      if (v?.prix === null || v?.prix === undefined || v?.prix === '') continue
      const p = nouveauPrix(v.prix, valeur)
      if (p === null || p === Number(v.prix)) continue
      sortie.push({ id: v.id, article_id: a.id, prix: p })
    }
  }
  return sortie
}

/** Les variantes qui gardent leur propre prix sous un prix fixe (pour le dire). */
export function variantesAPrixPropre({ articles = [], variantesParArticle = {} } = {}) {
  let n = 0
  for (const a of Array.isArray(articles) ? articles : []) {
    for (const v of variantesParArticle?.[a?.id] || variantesParArticle?.[String(a?.id)] || []) {
      if (v?.prix !== null && v?.prix !== undefined && v?.prix !== '') n++
    }
  }
  return n
}

/**
 * Ce qui empêche un ajustement de prix de partir.
 *
 * 🔴 UN PRIX À ZÉRO EST UN ARTICLE OFFERT, pas une promotion. `-100 %` ou
 * au-delà mettrait des articles à 0 € ou en négatif sur la fiche publique, et
 * personne ne le verrait avant la première commande. On refuse, on ne borne
 * pas en silence : borner donnerait un résultat que le commerçant n'a pas
 * demandé et qu'il croirait juste.
 *
 * @param prixVariantes  les prix propres des variantes visées (nombres), qui
 *                       ne doivent pas tomber à 0 non plus.
 * @returns un message, ou `null` si l'ajustement peut partir.
 */
export function refusDAjustement(articles = [], valeur, prixVariantes = []) {
  const { mode, n } = lirePrixLot(valeur)
  if (mode === 'pourcent') {
    if (!Number.isFinite(n) || n === 0) return 'Indique un pourcentage, en plus ou en moins.'
    if (n <= -100) return 'Un article ne peut pas tomber à 0 €. Choisis une baisse plus petite.'
  }
  if (mode === 'fixe') {
    if (!Number.isFinite(n) || n <= 0) return 'Indique le nouveau prix, comme 12 ou 12,50.'
    if (n > 100000) return 'Ce prix n’est pas valable.'
  }
  if (mode === 'ecart' && (!Number.isFinite(n) || n === 0)) return 'Indique un montant, comme +0,50 ou -1.'
  const liste = Array.isArray(articles) ? articles : []
  if (liste.length === 0) return 'Choisis au moins un article.'
  const sansPrix = liste.filter(a => !(Number(a?.prix) > 0))
  // ⚠️ UN ARTICLE SANS PRIX N'EST PAS UNE ERREUR : en vitrine, le prix est
  // parfois vide exprès. On ne bloque pas pour lui, on préviendra.
  if (mode !== 'fixe' && sansPrix.length === liste.length) return 'Aucun de ces articles n’a de prix à ajuster.'
  const tropBas = [...liste.map(a => a?.prix), ...(Array.isArray(prixVariantes) ? prixVariantes : [])].some(prix => {
    const nouveau = nouveauPrix(prix, valeur)
    return nouveau !== null && nouveau < 0.01
  })
  if (tropBas) {
    return mode === 'ecart'
      ? 'Ce retrait ferait tomber un prix à 0 € ou moins. Choisis un montant plus petit.'
      : 'Cette baisse ferait tomber un article sous 1 centime. Choisis-en une plus petite.'
  }
  return null
}

/**
 * Les écritures à faire, une par article.
 *
 * ⚠️ UN PATCH VIDE NE PART PAS. Remettre `actif: true` sur un article déjà
 * disponible ferait une écriture pour rien, réveillerait le temps réel de la
 * fiche publique et compterait dans le total annoncé au commerçant : il lirait
 * « 12 articles modifiés » alors que trois seulement ont bougé.
 *
 * @returns [{ id, patch }]
 */
export function patchsDuLot({ action, articles = [], valeur = null, maintenant = new Date(), deuxCircuits = true, catalogue = null } = {}) {
  const liste = Array.isArray(articles) ? articles : []
  const sortie = []
  // (22/10, J10) Le prochain rang libre de chaque catégorie de destination.
  const prochainRang = {}
  for (const a of liste) {
    if (!a || a.id == null) continue
    // ✅ 15/10 : la façon de vendre. Un article qu'une règle refuse n'est PAS
    // écrit (`ecartDuLot`) : il est nommé à l'écran, avec sa raison.
    if (action === 'vente' || ACTIONS_DEUX_CIRCUITS.includes(action)) {
      if (ecartDuLot({ action, article: a, valeur, deuxCircuits })) continue
      if (action === 'vente') {
        // ⚠️ SEUL `est_vitrine` CHANGE. Le stock, le délai et le temps de
        // préparation restent : inertes en vitrine (rien ne s'y commande), ils
        // reviennent tels quels quand l'article repasse en ligne. La fiche
        // article, elle, les remet à zéro parce qu'elle les cache.
        if (![VENTE_EN_LIGNE, VENTE_VITRINE].includes(valeur)) continue
        const cible = valeur === VENTE_VITRINE
        if ((a.est_vitrine === true) === cible) continue
        sortie.push({ id: a.id, patch: { est_vitrine: cible } })
        continue
      }
      if (action === 'jour_meme') {
        if (valeur !== true && valeur !== false) continue
        if ((a.vente_jour !== false) === valeur) continue
        sortie.push({ id: a.id, patch: { vente_jour: valeur } })
        continue
      }
      // sur_commande : les colonnes de la fiche article (`champsCircuits`).
      if (valeur?.actif === false) {
        if (a.commande_active !== true) continue
        sortie.push({ id: a.id, patch: champsCircuits(circuitsDe(a, { commande_active: false })) })
        continue
      }
      if (valeur?.actif !== true || refusDuLot({ action, articles: [a], valeur })) continue
      const patch = champsCircuits(circuitsDe(a, {
        commande_active: true,
        delai_minutes: delaiEnMinutes(valeur),
        commande_max_jour: String(valeur?.max ?? '').trim(),
      }))
      const inchange = a.commande_active === true
        && Number(a.delai_minutes || 0) === patch.delai_minutes
        && (a.commande_max_jour ?? null) === patch.commande_max_jour
      if (!inchange) sortie.push({ id: a.id, patch })
      continue
    }
    if (action === 'plage') {
      // ⚠️ MÊMES RÈGLES QUE LA FICHE ARTICLE : hors alimentaire ou en vitrine,
      // l'article est laissé de côté et nommé ; une saisie refusée n'écrit rien.
      if (ecartDuLot({ action, article: a, valeur, deuxCircuits })) continue
      if (refusDeSaisiePlage(valeur?.de, valeur?.a)) continue
      const patch = { retrait_des: heureDePlage(valeur?.de), retrait_jusqua: heureDePlage(valeur?.a) }
      if (heureDePlage(a.retrait_des) === patch.retrait_des && heureDePlage(a.retrait_jusqua) === patch.retrait_jusqua) continue
      sortie.push({ id: a.id, patch })
      continue
    }
    if (action === 'disponible' || action === 'indisponible') {
      const cible = action === 'disponible'
      if (a.actif === cible) continue
      sortie.push({ id: a.id, patch: { actif: cible } })
      continue
    }
    if (action === 'categorie') {
      // ⚠️ « Sans catégorie » EXISTE, et c'est `null` en base. Une chaîne vide
      // fabriquerait une catégorie fantôme portant un nom invisible.
      const cible = typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null
      if ((a.categorie || null) === cible) continue
      // 🟡 (22/10, audit J10) L'ARTICLE ARRIVE EN FIN DE SA NOUVELLE
      // CATÉGORIE, dans l'ordre du lot : il gardait son ancien rang et
      // s'intercalait au hasard. Sans le catalogue, l'ordre ne bouge pas.
      if (Array.isArray(catalogue)) {
        if (prochainRang[cible ?? ''] === undefined) {
          // Tout ce qui est DÉJÀ dans la catégorie compte, articles du lot
          // compris : celui qui y est déjà ne bouge pas, les nouveaux viennent
          // après lui.
          prochainRang[cible ?? ''] = catalogue
            .filter(x => x && (x.categorie || null) === cible)
            .reduce((m, x) => Math.max(m, Number(x.ordre) || 0), 0) + 1
        }
        sortie.push({ id: a.id, patch: { categorie: cible, ordre: prochainRang[cible ?? '']++ } })
        continue
      }
      sortie.push({ id: a.id, patch: { categorie: cible } })
      continue
    }
    if (action === 'prix') {
      // (22/10) Pourcentage, prix fixe ou montant (`nouveauPrix`).
      const nouveau = nouveauPrix(a.prix, valeur)
      if (nouveau === null || nouveau === Number(a.prix)) continue
      sortie.push({ id: a.id, patch: { prix: nouveau } })
      continue
    }
    if (action === 'stock') {
      // ⚠️ LA RÈGLE D'UN SEUL ARTICLE : elle date un stock en magasin quand il
      // change (et seulement là), comme le formulaire.
      if (refusQuantite(valeur?.mode, valeur?.quantite)) continue
      const champs = champsStock({ mode: valeur.mode, saisie: valeur.quantite, avant: a, maintenant })
      // 🟠 (22/10, audit O5) UN STOCK QUI BAISSE ÉTEINT « SUR COMMANDE »,
      // comme dans la fiche article : laissé allumé, le formulaire refusait
      // ensuite tout enregistrement de l'article, et son interrupteur était
      // caché derrière la phrase « il n'a pas besoin de sur commande ».
      const coupeB = deuxCircuits && champs.stock_mode === 'magasin' && a.commande_active === true && a.vente_jour !== false
      if (!coupeB && modeStockDe(a) === champs.stock_mode && Number(a.stock_jour || 0) === champs.stock_jour && !champs.stock_maj_le) continue
      sortie.push({ id: a.id, patch: coupeB ? { ...champs, ...champsCircuits(circuitsDe(a, { commande_active: false })) } : champs })
      continue
    }
    if (action === 'tva') {
      const patch = {}
      const e = valeur?.emporter ?? TVA_INCHANGEE
      const s = valeur?.surPlace ?? TVA_INCHANGEE
      if (e !== TVA_INCHANGEE && !memeTaux(a.tva_taux, tauxOuNull(e))) patch.tva_taux = tauxOuNull(e)
      if (s !== TVA_INCHANGEE && !memeTaux(a.tva_taux_sur_place, tauxOuNull(s))) patch.tva_taux_sur_place = tauxOuNull(s)
      if (Object.keys(patch).length > 0) sortie.push({ id: a.id, patch })
      continue
    }
    if (action === 'temps_prepa') {
      const brut = String(valeur ?? '').trim()
      if (!/^\d+$/.test(brut)) continue
      const n = Number(brut)
      if (a.temps_prepa !== null && a.temps_prepa !== undefined && Number(a.temps_prepa) === n) continue
      sortie.push({ id: a.id, patch: { temps_prepa: n } })
    }
  }
  return sortie
}

/**
 * « 15 par jour » EN LOT REMPLACE AUSSI LA GRILLE JOUR PAR JOUR (Alex, 10/10).
 *
 * 🔴 « Deux sur trois sont modifiés » : le Croissant avait une grille à 30 du
 * lundi au dimanche, et la grille passe AVANT la quantité générale. Le lot
 * changeait la quantité générale, la fiche continuait de vendre 30, et rien à
 * l'écran ne bougeait. Décision d'Alex : la grille est remplacée.
 *
 * ⚠️ LE MÊME GESTE QUE « Revenir à la quantité par défaut » (07/10) : on efface
 * les quantités jour par jour (`actif` vrai) et on GARDE les jours fermés
 * (`actif` faux), qui disent « pas vendu ce jour-là ».
 *
 * @param grilles { [articleId]: { [jour]: { stock, actif } } }
 * @returns { articleIds, details: ['Croissant (30 par jour)'], joursFermes }
 *          vide hors « par jour » ou sur une quantité refusée.
 */
export function grillesARemplacer({ articles = [], valeur = null, grilles = {} } = {}) {
  const vide = { articleIds: [], details: [], joursFermes: false }
  if (valeur?.mode !== 'jour' || refusQuantite('jour', valeur?.quantite)) return vide
  const sortie = { ...vide, articleIds: [], details: [] }
  for (const a of Array.isArray(articles) ? articles : []) {
    if (!a || a.id == null) continue
    const jours = Object.values(grilles?.[a.id] || grilles?.[String(a.id)] || {})
    if (jours.some(e => e?.actif === false)) sortie.joursFermes = true
    const actifs = jours.filter(e => e && e.actif !== false)
    if (actifs.length === 0) continue
    sortie.articleIds.push(a.id)
    const chiffres = [...new Set(actifs.map(e => Math.max(0, Number(e.stock) || 0)))].sort((x, y) => x - y)
    sortie.details.push(chiffres.length === 1
      ? `${a.nom} (${chiffres[0]} par jour)`
      : `${a.nom} (de ${chiffres[0]} à ${chiffres[chiffres.length - 1]} selon le jour)`)
  }
  return sortie
}

// ─── « STOCK N » SUR LES ARTICLES À TAILLES (21/10, Alex, Caprice de Magali) ─
// L'action groupée ne touchait que le stock GÉNÉRAL, que la fiche et le
// serveur ignorent pour un article à variantes. Sur eux, « Stock N » met
// maintenant CHAQUE taille à N. « Sans limite » n'a pas de sens pour une
// taille : ils sont laissés tels quels.

/** Les articles à tailles visés et la quantité à poser : { ids, quantite } (ids vide = rien). */
export function variantesDuLot({ action, articles = [], valeur = null } = {}) {
  const rien = { ids: [], quantite: null }
  if (action !== 'stock' || valeur?.mode === 'illimite') return rien
  if (refusQuantite(valeur?.mode, valeur?.quantite)) return rien
  const q = parseInt(String(valeur?.quantite ?? '').trim(), 10)
  if (!Number.isInteger(q) || q < 0) return rien
  const ids = (Array.isArray(articles) ? articles : []).filter(a => a?.gere_variantes === true).map(a => a.id)
  return { ids, quantite: q }
}

/** « Sur les 3 articles à tailles, chaque taille passera à 2. », ou ''. */
export function phraseVariantesDuLot(v) {
  const n = v?.ids?.length || 0
  if (n === 0) return ''
  // (22/10, Alex : « penser large ») Une variante n'est pas qu'une taille.
  return `${n === 1 ? 'Sur l’article à variantes' : `Sur les ${n} articles à variantes`}, chaque variante passera à ${v.quantite}.`
}

/**
 * Ce que le commerçant lit avant de valider.
 *
 * ⚠️ IL DOIT LIRE CE QUI VA CHANGER, PAS CE QU'IL A COCHÉ. Douze articles
 * cochés dont trois seulement vont bouger, c'est « 3 » qu'il faut annoncer,
 * sinon il croira que neuf écritures ont échoué.
 */
// `variantes` (prix, 22/10) : { changees, gardees }, les prix propres des variantes.
export function resumeDuLot({ action, patchs = [], coches = 0, valeur = null, grilles = null, ecarts = [], variantes = null } = {}) {
  // ✅ 15/10 : les articles LAISSÉS DE CÔTÉ se lisent après ce qui change, avec
  // leur raison. Sans eux, « 3 articles » sur cinq cochés ferait croire à deux
  // échecs silencieux.
  const liste = Array.isArray(ecarts) ? ecarts : []
  const ecartes = liste.length === 0 ? ''
    : ` ${liste.length === 1 ? '1 article laissé' : `${liste.length} articles laissés`} de côté : ${liste.map(e => `${e.nom} (${e.raison})`).join(' ; ')}.`
  const phrase = resumeSansEcarts({ action, patchs, coches, valeur, grilles, variantes })
  return coches === 0 ? phrase : `${phrase}${ecartes}`
}

function resumeSansEcarts({ action, patchs = [], coches = 0, valeur = null, grilles = null, variantes = null } = {}) {
  // Un article dont seule la grille change compte aussi (`grillesARemplacer`).
  const touches = new Set([
    ...(Array.isArray(patchs) ? patchs : []).map(p => String(p.id)),
    ...(action === 'stock' ? (grilles?.articleIds || []).map(String) : []),
  ])
  const n = touches.size
  if (coches === 0) return 'Coche des articles pour agir sur plusieurs d’un coup.'
  // L'accord du verbe : « 1 article sera », « 3 articles seront ».
  const selon = (un, plusieurs) => (n === 1 ? un : plusieurs)
  if (action === 'vente' || ACTIONS_DEUX_CIRCUITS.includes(action)) {
    if (n === 0) {
      if (action === 'vente') return valeur === VENTE_VITRINE ? 'Aucun article à passer en vitrine.' : 'Aucun article à passer en vente en ligne.'
      if (action === 'jour_meme') return 'Aucun article à changer pour le jour même.'
      return 'Aucun article à changer pour la commande à l’avance.'
    }
    const quoi = selon('1 article', `${n} articles`)
    if (action === 'vente') {
      return valeur === VENTE_VITRINE
        ? `${quoi} ${selon('passera', 'passeront')} en vitrine : ${selon('visible', 'visibles')} avec leur prix, plus ${selon('commandable', 'commandables')} en ligne.`
        : `${quoi} ${selon('sera vendu', 'seront vendus')} en ligne : le client les commande et les paie dans l’app.`
    }
    if (action === 'jour_meme') {
      return valeur === true
        ? `${quoi} se ${selon('vendra', 'vendront')} le jour même.`
        : `${quoi} ne se ${selon('commandera', 'commanderont')} plus qu’à l’avance, sur commande.`
    }
    if (valeur?.actif === false) return `${quoi} ne se ${selon('commandera', 'commanderont')} plus à l’avance : le jour même seulement.`
    const j = Number(String(valeur?.delaiJours ?? '').trim())
    const max = String(valeur?.max ?? '').trim()
    return `${quoi} se ${selon('commandera', 'commanderont')} à l’avance, ${j === 1 ? 'à partir du lendemain' : `${j} jours avant au moins`}${max ? `, ${max} au maximum par jour` : ', sans maximum par jour'}.`
  }
  if (n === 0) {
    if (action === 'disponible') return 'Ces articles sont déjà sur ta fiche.'
    if (action === 'indisponible') return 'Ces articles sont déjà masqués.'
    if (action === 'categorie') return 'Ces articles sont déjà dans cette catégorie.'
    if (action === 'stock') return 'Ces articles ont déjà ce stock.'
    if (action === 'tva') return 'Ces articles ont déjà ces taux.'
    if (action === 'temps_prepa') return 'Ces articles ont déjà ce temps de préparation.'
    if (action === 'plage') return 'Ces articles ont déjà ces heures de retrait.'
    return 'Aucun prix à changer ici.'
  }
  const quoi = n === 1 ? '1 article' : `${n} articles`
  if (action === 'stock') {
    const mode = valeur?.mode
    const q = String(valeur?.quantite ?? '').trim()
    // (22/10) L'accord : « 1 article passera », « 3 articles passeront ».
    if (mode === 'illimite') return `${quoi} ${selon('passera', 'passeront')} sans limite de stock.`
    if (mode === 'jour') {
      // 🔴 (10/10) « Les quantités réglées jour par jour restent prioritaires »
      // n'était pas clair (Alex) : on dit ce qui SE PASSE, article par article.
      const morceaux = [`${quoi} ${selon('passera', 'passeront')} à ${q} par jour, tous les jours où ${selon('il se vend', 'ils se vendent')}.`]
      if (grilles?.details?.length) morceaux.push(`Quantités jour par jour remplacées : ${grilles.details.join(', ')}.`)
      if (grilles?.joursFermes) morceaux.push('Les jours où ils ne se vendent pas restent fermés.')
      return morceaux.join(' ')
    }
    // (22/10, audit O5) « Sur commande » éteint, et c'est dit.
    const coupes = (Array.isArray(patchs) ? patchs : []).filter(p => p?.patch?.commande_active === false).length
    const surCommande = coupes > 0 ? ` « Sur commande » s’éteint pour ${coupes === 1 ? '1 article' : `${coupes} articles`} : un stock qui baisse se commande déjà pour n’importe quel jour.` : ''
    return `${quoi} ${selon('passera', 'passeront')} à ${q} en magasin, à partir de maintenant.${surCommande}`
  }
  if (action === 'tva') return `La TVA de ${quoi} changera.`
  if (action === 'temps_prepa') return `${quoi} ${selon('passera', 'passeront')} à ${String(valeur).trim()} min de préparation.`
  if (action === 'plage') {
    const p = { de: heureDePlage(valeur?.de), a: heureDePlage(valeur?.a) }
    const texte = libellePlage(p)
    return texte
      ? `${quoi} : « ${texte} ». Seuls les créneaux qui tiennent dans cette plage seront proposés pour ${n === 1 ? 'lui' : 'eux'}.`
      : `${quoi} ${n === 1 ? 'se retirera' : 'se retireront'} à nouveau sur tous tes créneaux.`
  }
  // ✅ 15/10 : les mots de la fiche article, « Sur ta fiche » / « Masqué ».
  if (action === 'disponible') return `${quoi} ${n === 1 ? 'réapparaîtra' : 'réapparaîtront'} sur ta fiche.`
  if (action === 'indisponible') return n === 1
    ? `${quoi} sera masqué : il disparaîtra de ta fiche, et reste ici, prêt à revenir.`
    : `${quoi} seront masqués : ils disparaîtront de ta fiche, et restent ici, prêts à revenir.`
  if (action === 'categorie') {
    const cat = typeof valeur === 'string' && valeur.trim() ? `« ${valeur.trim()} »` : 'Sans catégorie'
    return `${quoi} ${selon('passera', 'passeront')} dans ${cat}.`
  }
  // 🔴 ON RAPPELLE QUE ÇA NE SE DÉFAIT PAS, à l'endroit et au moment où ça
  // compte. L'ancien prix n'est gardé nulle part.
  // (22/10) Trois façons (`lirePrixLot`), l'accord du verbe, et les variantes.
  const { mode, n: p } = lirePrixLot(valeur)
  const sujet = n === 1 ? 'Le prix de 1 article' : `Les prix de ${n} articles`
  const vc = variantes?.changees || 0
  const vg = variantes?.gardees || 0
  const suiteVariantes = vc > 0
    ? ` ${vc === 1 ? '1 variante à son propre prix suit' : `${vc} variantes à leur propre prix suivent`} aussi.`
    : vg > 0 ? ` ${vg === 1 ? '1 variante garde son propre prix' : `${vg} variantes gardent leur propre prix`}.` : ''
  const fin = `${suiteVariantes} Les anciens prix ne sont pas conservés.`
  if (mode === 'fixe') return `${sujet} ${selon('passera', 'passeront')} à ${eurosLot(p)}.${fin}`
  const sens = p > 0 ? selon('augmentera', 'augmenteront') : selon('baissera', 'baisseront')
  if (mode === 'ecart') return `${sujet} ${sens} de ${eurosLot(Math.abs(p))}.${fin}`
  return `${sujet} ${sens} de ${Math.abs(p)} %.${fin}`
}

/** « 12,50 € » : un montant du lot, en mots du comptoir. */
function eurosLot(x) {
  return `${(centimes(x) / 100).toFixed(2).replace('.', ',')} €`
}
