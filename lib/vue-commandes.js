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
  }))
}

/**
 * CE QU'IL RESTE À PRÉPARER : les commandes nouvelles et en préparation,
 * article par article, pour le jour, et heure par heure.
 * ⚠️ LES PRÊTES N'Y SONT PAS : elles sont faites. Les annulées non plus.
 * @returns { total, articles: [{ nom, quantite }], parHeure: [{ heure, articles }] }
 */
export function aPreparer(commandes = []) {
  const actives = (Array.isArray(commandes) ? commandes : []).filter(c => c?.statut === 'en_attente' || c?.statut === 'en_preparation')
  const compter = (liste) => {
    const m = new Map()
    for (const c of liste) for (const l of c?.commande_articles || []) {
      const nom = nomLigne(l)
      m.set(nom, (m.get(nom) || 0) + (Number(l?.quantite) || 0))
    }
    return [...m.entries()].map(([nom, quantite]) => ({ nom, quantite }))
      .sort((a, b) => b.quantite - a.quantite || a.nom.localeCompare(b.nom, 'fr'))
  }
  const heures = new Map()
  for (const c of actives) {
    const h = heureDeRetrait(c) || 'Sans heure'
    if (!heures.has(h)) heures.set(h, [])
    heures.get(h).push(c)
  }
  const articles = compter(actives)
  return {
    total: articles.reduce((s, a) => s + a.quantite, 0),
    articles,
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
