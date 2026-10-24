// LA VUE DE TRAVAIL DES COMMANDES (Alex, 11/10 : « l'écran principal du
// commerçant, hyper clair, ODOO MIND : les infos doivent apparaître en une
// seconde »).
//
// DÉCIDÉ AU TABLEAU (11/10) :
//   - trois COLONNES PAR STATUT : Nouvelles → En prépa → Prêtes, cartes
//     compactes triées par heure de retrait, UN bouton (l'étape suivante) ;
//   - les retards se signalent ;
//   - un résumé « À préparer » (quantités par article, pour le jour et par
//     heure) et l'EXPORT des commandes par jour ou par semaine, en PDF
//     (lib/export-commandes-pdf.js, Alex 11/10).
//
// ⚠️ AUCUNE RÈGLE D'ÉTAT N'EST RÉÉCRITE ICI. L'étape suivante et son libellé
// viennent de `lib/statuts-commande.js` (`STATUT_SUIVANT`,
// `LIBELLE_GESTE_SUIVANT`), les mêmes que la carte complète et le Poste équipe.
// Tout le reste (livraison, expédition, annuler, étiquettes…) passe par la
// carte complète, qui s'ouvre d'un clic.
//
// ⚠️ MODULE PUR : il range, compte et écrit du texte ; il ne lit pas la base.

import { STATUT_SUIVANT, LIBELLE_GESTE_SUIVANT } from './statuts-commande.js'
import { jourPlus } from './statut-commerce.js'
import { jourBelgeDeCreation } from './heure-belge.js'
import { mentionFournisseurLigne } from './stock-article.js'

export const COLONNES = [
  { statut: 'en_attente', titre: 'Nouvelles', couleur: '#DC2626', fond: '#FEF2F2' },
  { statut: 'en_preparation', titre: 'En prépa', couleur: '#EA580C', fond: '#FFF7ED' },
  { statut: 'pret', titre: 'Prêtes', couleur: '#059669', fond: '#ECFDF5' },
]

const hhmm = (h) => String(h || '').slice(0, 5)
const jourDe = (c) => String(c?.date_commande || c?.created_at || '').slice(0, 10)
const creneauDe = (c) => c?.creneau || c?.creneau_livraison || null

/** L'heure de retrait (ou de tournée) affichée : « 07:15 », ou null. */
export function heureDeRetrait(c) {
  const cr = creneauDe(c)
  return cr?.heure_debut ? hhmm(cr.heure_debut) : null
}

/** Le tri du travail : le jour, puis l'heure, puis le numéro. Une copie. */
export function trierParHeure(liste = []) {
  return [...(Array.isArray(liste) ? liste : [])].sort((a, b) =>
    jourDe(a).localeCompare(jourDe(b))
    || (heureDeRetrait(a) || '99:99').localeCompare(heureDeRetrait(b) || '99:99')
    || (Number(a?.numero_commande) || 0) - (Number(b?.numero_commande) || 0))
}

/** Les trois colonnes, chacune triée par heure. */
export function colonnesDeCommandes(commandes = []) {
  const liste = Array.isArray(commandes) ? commandes : []
  return COLONNES.map(col => ({ ...col, commandes: trierParHeure(liste.filter(c => c?.statut === col.statut)) }))
}

/**
 * L'étape suivante d'une carte compacte : { statut, libelle }, ou null.
 * ⚠️ LA MÊME EXCLUSION QUE LA CARTE COMPLÈTE : une livraison ou une expédition
 * « prête » a sa propre sortie (partir en livraison, marquer expédiée), qui
 * se fait depuis la carte complète.
 */
export function actionSuivante(c) {
  if (!c) return null
  const vers = STATUT_SUIVANT[c.statut]
  if (!vers) return null
  if (c.statut === 'pret' && (c.mode_retrait === 'livraison' || c.mode_retrait === 'expedition')) return null
  return { statut: vers, libelle: LIBELLE_GESTE_SUIVANT[c.statut] }
}

/**
 * La commande est-elle EN RETARD sur NOTRE travail ?
 *   - d'un jour passé et toujours en cours ;
 *   - d'aujourd'hui, son créneau terminé, et pas encore prête.
 * Une commande PRÊTE après son créneau n'est pas en retard de notre côté :
 * c'est le client qui ne vient pas (« Non retiré » s'en occupe).
 * @param maintenantMin minutes depuis minuit, heure de Bruxelles
 */
export function enRetard(c, { aujourdhui, maintenantMin } = {}) {
  if (!c || !['en_attente', 'en_preparation', 'pret'].includes(c.statut)) return false
  const jour = jourDe(c)
  if (!jour || !aujourdhui) return false
  if (jour < aujourdhui) return true
  if (jour > aujourdhui || c.statut === 'pret') return false
  const fin = creneauDe(c)?.heure_fin
  if (!fin || !Number.isFinite(maintenantMin)) return false
  const [h, m] = hhmm(fin).split(':').map(Number)
  return Number.isFinite(h) && h * 60 + (m || 0) <= maintenantMin
}

const nomLigne = (l) => l?.article_nom || l?.article?.nom || 'Article retiré du catalogue'

/** Les lignes d'une commande, en court : [{ texte: '2× Croissant', options: 'Ketchup, Mayo' }]. */
export function lignesCourtes(c) {
  return (c?.commande_articles || []).map(l => ({
    texte: `${Number(l?.quantite) || 0}× ${nomLigne(l)}`,
    options: (l?.options || []).map(o => o?.valeur_nom).filter(Boolean).join(', '),
    // ✅ (24/10, Alex au test) La carte compacte dit aussi ce qui est à
    // commander chez le fournisseur (`mentionFournisseurLigne`), ou `null`.
    fournisseur: mentionFournisseurLigne(l),
  }))
}

/**
 * CE QU'UNE LIGNE FAIT SORTIR DU FOUR, article par article :
 * [{ nom, quantite }]. 🔴 (Alex, 11/10 : « À préparer » disait « 3+1 offert :
 * 1 » là où le boulanger sort 4 croissants.) LA MÊME RÈGLE QUE LE STOCK
 * (vue `consommation_stock`) :
 *   - les unités réelles, `quantite_stock` (lot : lots × unités), sinon
 *     `quantite` (lignes d'avant le 11/10, ou simples) ;
 *   - le nom de l'ARTICLE, pas celui de l'offre (une ligne d'offre porte le
 *     titre de l'offre dans `article_nom`) ;
 *   - le second article d'un duo, `duo_article_id`, en plus. Il n'est pas
 *     joint (pas de clé étrangère) : son nom vient de `nomsArticles`.
 */
export function unitesDeLigne(l, nomsArticles = {}) {
  if (!l) return []
  const nom = l.deal_id ? (l.article?.nom || l.article_nom) : (l.article_nom || l.article?.nom)
  const unites = l.quantite_stock !== null && l.quantite_stock !== undefined ? Number(l.quantite_stock) : Number(l.quantite)
  const sortie = [{ nom: nom || 'Article retiré du catalogue', quantite: Number.isFinite(unites) ? unites : 0 }]
  if (l.duo_article_id) {
    sortie.push({ nom: nomsArticles[l.duo_article_id] || 'Second article d’un duo', quantite: Number(l.quantite) || 0 })
  }
  return sortie
}

/** Les seconds articles de duo dont il faut lire le nom. */
export function articlesDeDuo(commandes = []) {
  const ids = new Set()
  for (const c of Array.isArray(commandes) ? commandes : []) {
    for (const l of c?.commande_articles || []) if (l?.duo_article_id) ids.add(l.duo_article_id)
  }
  return [...ids]
}

/**
 * LA COMMANDE A-T-ELLE ÉTÉ PASSÉE À L'AVANCE ? (12/10, todo du 09/10 : « la
 * liste de préparation ne sépare pas A et B ».) Oui quand le jour BELGE de sa
 * création précède son jour de retrait : c'est le circuit « sur commande » (B)
 * du temps 3, à produire en plus. Même lecture du jour de création que le
 * serveur (`jourBelgeDeCreation`, UTC sans fuseau). Sans date lisible, on ne
 * l'affirme pas : elle reste « le jour même ».
 */
export function commandeALAvance(c) {
  const retrait = String(c?.date_commande || '').slice(0, 10)
  const passee = jourBelgeDeCreation(c?.created_at)
  return /^\d{4}-\d{2}-\d{2}$/.test(retrait) && !!passee && passee < retrait
}

/**
 * CE QU'IL RESTE À PRÉPARER : les commandes nouvelles et en préparation,
 * article par article, pour le jour, et heure par heure.
 * ⚠️ LES PRÊTES N'Y SONT PAS : elles sont faites. Les annulées non plus.
 * @returns { total, articles: [{ nom, quantite }], aLAvance, leJourMeme,
 *   totalALAvance, parHeure: [{ heure, articles }] }
 */
/**
 * Les unités par article d'une liste de commandes, de la plus grande quantité
 * à la plus petite : [{ nom, quantite }]. Le seul compteur d'« À préparer »,
 * du PDF et du récap de 8 h.
 */
export function quantitesParArticle(commandes = [], { nomsArticles = {} } = {}) {
  const m = new Map()
  for (const c of Array.isArray(commandes) ? commandes : []) for (const l of c?.commande_articles || []) {
    for (const { nom, quantite } of unitesDeLigne(l, nomsArticles)) m.set(nom, (m.get(nom) || 0) + quantite)
  }
  return [...m.entries()].map(([nom, quantite]) => ({ nom, quantite }))
    .sort((a, b) => b.quantite - a.quantite || a.nom.localeCompare(b.nom, 'fr'))
}

/** Les deux blocs (12/10) : { aLAvance, leJourMeme }, chacun [{ nom, quantite }]. */
export function productionSeparee(commandes = [], { nomsArticles = {} } = {}) {
  const liste = Array.isArray(commandes) ? commandes : []
  return {
    aLAvance: quantitesParArticle(liste.filter(commandeALAvance), { nomsArticles }),
    leJourMeme: quantitesParArticle(liste.filter(c => !commandeALAvance(c)), { nomsArticles }),
  }
}

export function aPreparer(commandes = [], { nomsArticles = {} } = {}) {
  const actives = (Array.isArray(commandes) ? commandes : []).filter(c => c?.statut === 'en_attente' || c?.statut === 'en_preparation')
  const compter = (liste) => quantitesParArticle(liste, { nomsArticles })
  const heures = new Map()
  for (const c of actives) {
    const h = heureDeRetrait(c) || 'Sans heure'
    if (!heures.has(h)) heures.set(h, [])
    heures.get(h).push(c)
  }
  const articles = compter(actives)
  // (12/10, décision d'Alex au tableau : « deux blocs, partout ») Ce qui a été
  // commandé À L'AVANCE se produit EN PLUS du comptoir ; ce qui a été commandé
  // le jour même est pris dans ce qui est déjà sorti.
  const { aLAvance, leJourMeme } = productionSeparee(actives, { nomsArticles })
  return {
    total: articles.reduce((s, a) => s + a.quantite, 0),
    articles,
    aLAvance,
    leJourMeme,
    totalALAvance: aLAvance.reduce((s, a) => s + a.quantite, 0),
    parHeure: [...heures.entries()]
      .sort(([a], [b]) => (a === 'Sans heure' ? '99' : a).localeCompare(b === 'Sans heure' ? '99' : b))
      .map(([heure, liste]) => ({ heure, articles: compter(liste) })),
  }
}

/**
 * La période d'un export : le jour affiché, ou SA semaine (lundi → dimanche).
 * @returns { debut, fin } en 'YYYY-MM-DD'
 */
export function periodeExport(jour, quoi = 'jour') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour || ''))) return null
  if (quoi !== 'semaine') return { debut: jour, fin: jour }
  const jds = new Date(`${jour}T12:00:00Z`).getUTCDay() // 0 = dimanche
  const debut = jourPlus(jour, -((jds + 6) % 7))
  return { debut, fin: jourPlus(debut, 6) }
}
