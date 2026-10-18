// LA FRÉQUENCE D'UN CRÉNEAU DE RENDEZ-VOUS (18/10).
//
// ✅ ALEX, 18/10 (tableau, demande d'Emily, Centre Respire) : « Le yinyoga ou
// la méditation guidée ne sont disponibles qu'une fois par mois, actuellement
// un créneau sur un jour se répète chaque semaine. » Quatre fréquences, pour
// les cours ET les rendez-vous de service (même table `rdv_creneaux`) :
//   • 'hebdo'          chaque semaine (défaut, le comportement d'avant) ;
//   • 'deux_semaines'  une semaine sur deux, à partir de la semaine de `date_depart` ;
//   • 'mensuel'        le 1er, 2e, 3e, 4e ou dernier (-1) jour du mois (`rang_mois`) ;
//   • 'dates'          seulement les dates de `dates_choisies`.
// Le créneau GARDE son jour (`jour_semaine`) : la fréquence dit seulement
// quelles semaines il tombe. Une date précise (`date_specifique`) l'emporte
// toujours, comme avant.
//
// 🔴 UNE SEULE RÈGLE. « Ce créneau tombe-t-il ce jour-là ? » était recopiée à
// une quinzaine d'endroits (fiche, serveur, agenda, fermetures, absences,
// déplacements). Une copie oubliée, et un yinyoga mensuel redevient
// réservable chaque dimanche dans un coin de l'application. Toutes passent
// désormais par `frequenceAccepte`.
//
// ⚠️ UNE FRÉQUENCE INCOMPLÈTE OU INCONNUE NE TOMBE JAMAIS. La base l'interdit
// déjà (`rdv_creneaux_frequence_complete_check`), et si elle passait quand
// même, mieux vaut un créneau qui ne s'ouvre pas qu'un cours fantôme.
//
// Fichier PUR, sans dépendance : le serveur, l'écran et le banc le lisent.

export const FREQUENCES_CRENEAU = ['hebdo', 'deux_semaines', 'mensuel', 'dates']
export const RANGS_MOIS = [1, 2, 3, 4, -1]

// ⚠️ À METTRE DANS CHAQUE `select` DE `rdv_creneaux` qui décide d'un jour.
// Une colonne absente du select rend `frequence` indéfinie, donc « chaque
// semaine » : le défaut le plus fréquent du dépôt, et ici il rouvrirait tout.
export const COLONNES_FREQUENCE = 'frequence, date_depart, rang_mois, dates_choisies'

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const JOUR_MS = 86400000

function dateISO(v) {
  const s = String(v ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// Midi UTC : jamais de bascule d'heure d'été, le jour rendu est celui écrit.
function instantMidi(iso) {
  const t = Date.parse(`${iso}T12:00:00Z`)
  return Number.isFinite(t) ? t : null
}

function lundiDeLaSemaine(iso) {
  const t = instantMidi(iso)
  if (t === null) return null
  const jour = new Date(t).getUTCDay() // 0 = dimanche
  return t - ((jour + 6) % 7) * JOUR_MS
}

/** Le nom du jour d'une date « AAAA-MM-JJ », ou null. */
export function jourDeLaDate(dateStr) {
  const iso = dateISO(dateStr)
  const t = iso && instantMidi(iso)
  return t ? JOURS[new Date(t).getUTCDay()] : null
}

/**
 * La fréquence du créneau accepte-t-elle cette date ? Le JOUR de la semaine
 * est vérifié par l'appelant, comme avant : on ne regarde ici que la semaine.
 * Sans date, seul « chaque semaine » répond oui (les écrans qui raisonnent
 * sur un jour de la semaine sans date précise).
 */
export function frequenceAccepte(creneau, dateStr) {
  const frequence = creneau?.frequence || 'hebdo'
  if (frequence === 'hebdo') return true
  const iso = dateISO(dateStr)
  if (!iso) return false

  if (frequence === 'deux_semaines') {
    const depart = dateISO(creneau.date_depart)
    if (!depart) return false
    const a = lundiDeLaSemaine(depart), b = lundiDeLaSemaine(iso)
    if (a === null || b === null) return false
    const semaines = Math.round((b - a) / (7 * JOUR_MS))
    return semaines >= 0 && semaines % 2 === 0
  }

  if (frequence === 'mensuel') {
    const rang = Number(creneau.rang_mois)
    if (!RANGS_MOIS.includes(rang)) return false
    const [an, mois, jour] = iso.split('-').map(Number)
    if (rang === -1) {
      const joursDuMois = new Date(Date.UTC(an, mois, 0)).getUTCDate()
      return jour + 7 > joursDuMois
    }
    return Math.ceil(jour / 7) === rang
  }

  if (frequence === 'dates') {
    return (creneau.dates_choisies || []).some(d => dateISO(d) === iso)
  }

  return false
}

/**
 * La règle complète : ce créneau tombe-t-il ce jour-là ? Date précise,
 * sinon jour de la semaine ET fréquence. `jour` est facultatif (déduit de la
 * date) ; les appelants qui le connaissent déjà le passent.
 */
export function creneauTombeLe(creneau, dateStr, jour = null) {
  if (!creneau) return false
  const iso = dateISO(dateStr)
  if (creneau.date_specifique) return !!iso && dateISO(creneau.date_specifique) === iso
  const cle = jour || jourDeLaDate(iso)
  return !!cle && creneau.jour_semaine === cle && frequenceAccepte(creneau, iso)
}

// ⚠️ ARITHMÉTIQUE DE CALENDRIER, PAS D'INSTANT : on avance la date écrite,
// sans jamais relire un jour civil depuis une heure en temps universel.
function plusJours(iso, n) {
  const d = dateISO(iso)
  if (!d) return null
  const [a, m, j] = d.split('-').map(Number)
  const x = new Date(Date.UTC(a, m - 1, j + n))
  const p = (v) => String(v).padStart(2, '0')
  return `${x.getUTCFullYear()}-${p(x.getUTCMonth() + 1)}-${p(x.getUTCDate())}`
}

/**
 * Les `nombre` prochaines dates où ce créneau tombe, à partir de `depuis`
 * inclus, sur au plus `horizonJours`. Sert à l'aperçu de l'éditeur : le
 * commerçant lit « dim. 2 nov., dim. 7 déc. » avant d'enregistrer.
 */
export function prochainesDates(creneau, depuis, { nombre = 4, horizonJours = 400 } = {}) {
  const debut = dateISO(depuis)
  if (!debut || !creneau) return []
  const out = []
  for (let i = 0; i < horizonJours && out.length < nombre; i++) {
    const d = plusJours(debut, i)
    if (d && creneauTombeLe(creneau, d)) out.push(d)
  }
  return out
}

/** Les dates d'un jour de la semaine à venir, pour cocher des dates choisies. */
export function datesDuJourAVenir(jour, depuis, { semaines = 26 } = {}) {
  const debut = dateISO(depuis)
  if (!debut || !JOURS.includes(jour)) return []
  let premier = null
  for (let i = 0; i < 7; i++) {
    const d = plusJours(debut, i)
    if (jourDeLaDate(d) === jour) { premier = d; break }
  }
  if (!premier) return []
  return Array.from({ length: semaines }, (_, k) => plusJours(premier, 7 * k)).filter(Boolean)
}

/**
 * Ce que dit la fréquence, en clair, pour l'éditeur et l'agenda :
 * « chaque semaine », « une semaine sur deux », « le 1er dimanche du mois »,
 * « 3 dates ».
 */
export function libelleFrequence(creneau) {
  const frequence = creneau?.frequence || 'hebdo'
  const jour = creneau?.jour_semaine || ''
  if (frequence === 'deux_semaines') return 'Une semaine sur deux'
  if (frequence === 'mensuel') {
    const rang = Number(creneau?.rang_mois)
    const ordinal = rang === -1 ? 'dernier' : rang === 1 ? '1er' : `${rang}e`
    return `Le ${ordinal} ${jour} du mois`.replace(/\s+/g, ' ').trim()
  }
  if (frequence === 'dates') {
    const n = (creneau?.dates_choisies || []).length
    return n === 1 ? '1 date' : `${n} dates`
  }
  return 'Chaque semaine'
}

/**
 * Les champs de fréquence à écrire, nettoyés : chaque fréquence ne garde que
 * ce qui lui sert, et les dates choisies ne gardent que le jour du créneau.
 * Rend `{ ok:false, erreur }` si la fréquence est incomplète.
 */
export function champsFrequence({ frequence = 'hebdo', date_depart = null, rang_mois = null, dates_choisies = [] } = {}, jour_semaine = null) {
  const vide = { frequence: 'hebdo', date_depart: null, rang_mois: null, dates_choisies: null }
  if (!FREQUENCES_CRENEAU.includes(frequence) || frequence === 'hebdo') return { ok: true, champs: vide }
  if (!jour_semaine) return { ok: false, erreur: 'Choisis d’abord le jour du créneau.' }
  if (frequence === 'deux_semaines') {
    const d = dateISO(date_depart)
    if (!d) return { ok: false, erreur: 'Indique la première semaine où le créneau a lieu.' }
    return { ok: true, champs: { ...vide, frequence, date_depart: d } }
  }
  if (frequence === 'mensuel') {
    const r = Number(rang_mois)
    if (!RANGS_MOIS.includes(r)) return { ok: false, erreur: 'Choisis quel jour du mois.' }
    return { ok: true, champs: { ...vide, frequence, rang_mois: r } }
  }
  const dates = [...new Set((dates_choisies || []).map(dateISO).filter(Boolean))]
    .filter(d => jourDeLaDate(d) === jour_semaine)
    .sort()
  if (dates.length === 0) return { ok: false, erreur: `Coche au moins une date (un ${jour_semaine}).` }
  return { ok: true, champs: { ...vide, frequence, dates_choisies: dates } }
}
