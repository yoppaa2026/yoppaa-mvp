// L'HORAIRE D'UN JOUR PRÉCIS : LA SEMAINE, SAUF EXCEPTION (16/10).
//
// ✅ ALEX, 16/10 (tableau, suite au rendez-vous d'Aux Délices des 7 Abbayes) :
// UNE SEULE LISTE « Fermetures et horaires exceptionnels » pour tout le
// commerce. Une ligne dit soit « fermé du … au … », soit « horaires adaptés du
// … au … » avec une ou deux plages. Elle REMPLACE les horaires d'ouverture de
// ces jours-là, et tout ce qui lit les horaires suit : créneaux de retrait et
// tournées, boutique, agenda des rendez-vous et des tables, Ouvert / Fermé.
//
// 🔴 AVANT : deux listes qui ne se parlaient pas. Un restaurant fermé dans
// « Créneaux » restait réservable en table, et aucune des deux ne savait dire
// « ouvert de 8 h à 13 h le 24 décembre ».
//
// ⚠️ UNE FERMETURE COMPLÈTE GAGNE. Si une fermeture et un horaire adapté
// couvrent le même jour, le commerce est fermé : c'est la consigne la plus
// prudente, et la seule qui ne fait pas venir un client devant une porte close.
// Entre deux horaires adaptés, le plus récent l'emporte.
//
// Format d'une ligne (`fermetures_exceptionnelles`) :
//   { date_debut, date_fin, motif, plage1_debut, plage1_fin, plage2_debut, plage2_fin }
// Sans `plage1_debut` : fermé toute la journée. Une plage qui finit avant de
// commencer passe minuit, comme les horaires d'ouverture.
//
// ⚠️ MODULE PUR : aucune base, aucune horloge.

import { jourSemaineDe } from './creneaux.js'
import { jourCivilPlus } from './timezone.js'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// ⚠️ LES COLONNES À LIRE, ÉCRITES UNE FOIS. Une lecture qui oublie les plages
// prend chaque « horaires adaptés » pour une fermeture complète, sans erreur.
export const COLONNES_EXCEPTIONS = 'id, commercant_id, date_debut, date_fin, motif, created_at, plage1_debut, plage1_fin, plage2_debut, plage2_fin'
const hhmm = (t) => String(t || '').slice(0, 5)
const heureValide = (t) => /^\d{2}:\d{2}$/.test(hhmm(t))

// Les plages d'une exception, ['HH:MM', 'HH:MM'] ; [] pour une fermeture.
export function plagesException(e) {
  if (!e) return []
  const out = []
  if (heureValide(e.plage1_debut) && heureValide(e.plage1_fin)) out.push([hhmm(e.plage1_debut), hhmm(e.plage1_fin)])
  if (out.length && heureValide(e.plage2_debut) && heureValide(e.plage2_fin)) out.push([hhmm(e.plage2_debut), hhmm(e.plage2_fin)])
  return out
}

// Fermé toute la journée (et non « horaires adaptés »).
export function estFermetureComplete(e) {
  return Boolean(e) && plagesException(e).length === 0
}

// Cette ligne couvre-t-elle ce jour ? Bornes comprises.
export function couvreLeJour(e, dateStr) {
  if (!e || !DATE.test(String(dateStr || ''))) return false
  const debut = String(e.date_debut || '').slice(0, 10)
  const fin = String(e.date_fin || e.date_debut || '').slice(0, 10)
  if (!DATE.test(debut)) return false
  return debut <= dateStr && dateStr <= (DATE.test(fin) ? fin : debut)
}

// L'exception qui s'applique ce jour-là, ou null.
export function exceptionDuJour(exceptions, dateStr) {
  const couvrantes = (Array.isArray(exceptions) ? exceptions : []).filter(e => couvreLeJour(e, dateStr))
  if (couvrantes.length === 0) return null
  const fermeture = couvrantes.find(estFermetureComplete)
  if (fermeture) return fermeture
  // Le plus récent des horaires adaptés.
  return [...couvrantes].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]
}

/**
 * L'horaire de ce jour, au format d'un jour de `horaires_detail` :
 * { ouvert, debut, fin, debut2?, fin2? }. Avec une exception, le jour porte
 * aussi `exceptionnel: true` et `motif`.
 *
 * ⚠️ SANS EXCEPTION, ON REND LE JOUR TEL QUEL, `undefined` compris : les
 * lecteurs gardent leur prudence actuelle (« pas d'horaires renseignés, on ne
 * bloque pas »).
 */
export function horaireDuJour(horairesDetail, dateStr, exceptions) {
  const e = exceptionDuJour(exceptions, dateStr)
  if (!e) {
    const jour = jourSemaineDe(dateStr)
    return jour ? horairesDetail?.[jour] : undefined
  }
  const motif = e.motif || null
  if (estFermetureComplete(e)) return { ouvert: false, exceptionnel: true, motif }
  const [p1, p2] = plagesException(e)
  return {
    ouvert: true, debut: p1[0], fin: p1[1],
    ...(p2 ? { debut2: p2[0], fin2: p2[1] } : {}),
    exceptionnel: true, motif,
  }
}

/**
 * La grille de la semaine dont le jour de `dateStr` est remplacé par son
 * horaire exceptionnel. Pour les fonctions qui reçoivent une grille entière et
 * une date (le moteur des rendez-vous, l'agenda).
 *
 * ⚠️ SANS EXCEPTION, LA MÊME GRILLE (même objet) : rien ne change.
 * ⚠️ « Ouvert 24 h/24 » cède devant une exception : un service public fermé un
 * jour férié est fermé ce jour-là.
 */
export function horairesPourDate(horairesDetail, dateStr, exceptions) {
  const e = exceptionDuJour(exceptions, dateStr)
  const jour = jourSemaineDe(dateStr)
  if (!e || !jour) return horairesDetail
  const { always_open: _toujours, ...reste } = horairesDetail && typeof horairesDetail === 'object' ? horairesDetail : {}
  return { ...reste, [jour]: horaireDuJour(horairesDetail, dateStr, exceptions) }
}

// ─── UN RENDEZ-VOUS HORS DE L'HORAIRE ADAPTÉ ? ─────────────────────────────
//
// Pour les serveurs qui ne lisent pas la grille de la semaine (la création des
// rendez-vous, tous canaux confondus) : un jour d'horaires adaptés, le
// rendez-vous doit tenir dans une plage ; une TABLE n'est jugée qu'à son
// arrivée, comme partout ailleurs (« le service = fenêtre d'arrivée », 15/10).
// Un jour sans horaire adapté, la réponse est toujours non.
//
// @returns true si le jour a un horaire adapté ET que le rendez-vous en sort
export function horsHoraireAdapte({ exceptions, dateStr, debutMin, finMin, parCouverts = false } = {}) {
  const e = exceptionDuJour(exceptions, dateStr)
  if (!e || estFermetureComplete(e)) return false
  const enMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
  const debut = Number(debutMin)
  const fin = Number(finMin)
  if (!Number.isFinite(debut)) return false
  return !plagesException(e).some(([a, b]) => {
    const d = enMin(a)
    let f = enMin(b)
    if (f <= d) f += 1440
    return parCouverts
      ? debut >= d && debut <= f
      : debut >= d && (Number.isFinite(fin) ? fin : debut) <= f
  })
}

// ─── L'AGENDA PARLE SA PROPRE LANGUE ────────────────────────────────────────
//
// Le moteur des rendez-vous lit `rdv_fermetures` : fermeture du commerce
// (`praticien_id` nul), absence d'une praticienne, cours annulé. Depuis le
// 16/10, la fermeture DU COMMERCE vit dans la liste unique. On la lui traduit
// dans sa langue, sans toucher à ses règles, testées depuis des semaines.
//
// ⚠️ LES ANCIENNES FERMETURES « TOUT LE COMMERCE » DE L'AGENDA SONT IGNORÉES :
// la migration du 16/10 les a recopiées dans la liste unique. Les relire ici
// empêcherait de les rouvrir depuis la liste.
// ⚠️ SEULES LES FERMETURES COMPLÈTES SE TRADUISENT : un horaire adapté ne
// ferme pas la journée, il passe par `horairesPourDate`.
export function fermeturesAgenda(fermeturesRdv, exceptions) {
  const propres = (Array.isArray(fermeturesRdv) ? fermeturesRdv : [])
    .filter(f => f && (f.praticien_id != null || (f.prestation_id != null && f.heure_debut != null)))
  const duCommerce = (Array.isArray(exceptions) ? exceptions : [])
    .filter(estFermetureComplete)
    .map(e => ({
      id: `exception-${e.id ?? `${e.date_debut}-${e.date_fin}`}`,
      date_debut: String(e.date_debut || '').slice(0, 10),
      date_fin: String(e.date_fin || e.date_debut || '').slice(0, 10),
      motif: e.motif || null,
      praticien_id: null, prestation_id: null, heure_debut: null,
      exception: true,
    }))
  return [...propres, ...duCommerce]
}

// ─── CE QUE LE CLIENT LIT (Alex, 16/10 : les exceptions sont ANNONCÉES) ────
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export function dateLisible(dateStr) {
  if (!DATE.test(String(dateStr || ''))) return ''
  const [, m, j] = dateStr.split('-').map(Number)
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]}`
}

function periode(e) {
  const debut = String(e.date_debut || '').slice(0, 10)
  const fin = String(e.date_fin || e.date_debut || '').slice(0, 10)
  return debut === fin || !DATE.test(fin) ? `le ${dateLisible(debut)}` : `du ${dateLisible(debut)} au ${dateLisible(fin)}`
}

// « Fermé exceptionnellement le 1er novembre. »
// « Horaires adaptés du 24 au 31 décembre : 08:00–13:00. »
export function phraseException(e) {
  if (!e) return ''
  const plages = plagesException(e)
  if (plages.length === 0) return `Fermé exceptionnellement ${periode(e)}.`
  return `Horaires adaptés ${periode(e)} : ${plages.map(([d, f]) => `${d}–${f}`).join(' et ')}.`
}

// Les exceptions à annoncer : en cours ou à venir dans l'horizon, par date.
export function exceptionsAAnnoncer(exceptions, aujourdhui, horizonJours = 30) {
  if (!DATE.test(String(aujourdhui || ''))) return []
  const borne = jourCivilPlus(aujourdhui, horizonJours)
  return (Array.isArray(exceptions) ? exceptions : [])
    .filter(e => {
      const debut = String(e?.date_debut || '').slice(0, 10)
      const fin = String(e?.date_fin || e?.date_debut || '').slice(0, 10)
      return DATE.test(debut) && fin >= aujourdhui && debut <= borne
    })
    .sort((a, b) => String(a.date_debut).localeCompare(String(b.date_debut)))
}
