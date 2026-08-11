// Conversion d'une heure "murale" Europe/Brussels vers l'instant UTC réel, en
// tenant compte du passage heure d'été / heure d'hiver (DST).
//
// Contexte : plusieurs vérifs de cutoff (annulation RDV, annulation commande)
// construisaient l'instant du créneau avec un offset "+02:00" codé en dur. Correct
// en été (CEST = UTC+2), FAUX de 1h en hiver (CET = UTC+1) : la deadline
// d'annulation tombait 1h trop tôt et pénalisait le client. Ce helper calcule le
// bon offset pour la date donnée, sans dépendance externe.

const BRUSSELS = 'Europe/Brussels'

// Offset (en minutes) du fuseau par rapport à UTC pour un instant donné.
// Positif à l'est de Greenwich (Bruxelles : +60 en hiver, +120 en été).
function offsetMinutes(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const map = {}
  for (const p of dtf.formatToParts(instant)) map[p.type] = p.value
  // Certaines implémentations rendent "24" pour minuit : on normalise en "00".
  const hour = map.hour === '24' ? '00' : map.hour
  const asUTC = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(hour), Number(map.minute), Number(map.second)
  )
  return (asUTC - instant.getTime()) / 60000
}

// Le trajet inverse : d'un instant vers l'heure murale belge.
//
// ⚠️ INDISPENSABLE POUR LES STATISTIQUES. Une commande passée à 00h30 heure
// belge est horodatée 22h30 UTC la VEILLE en hiver. Compter les heures de
// pointe sur l'heure UTC décalerait tout d'une à deux heures selon la saison,
// et rangerait certaines ventes dans le mauvais jour.
//
// ⚠️ `formatToParts` et jamais `format()` : en français, une heure seule est
// rendue « 08 h », et `Number()` en fait NaN (bug vécu le 05/08 sur la garde
// horaire des SMS de fidélité).
export function partiesBruxelles(instant) {
  const d = instant instanceof Date ? instant : new Date(instant)
  if (isNaN(d.getTime())) return null
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: BRUSSELS, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  const map = {}
  for (const p of dtf.formatToParts(d)) map[p.type] = p.value
  const heure = map.hour === '24' ? 0 : Number(map.hour)
  const minute = Number(map.minute)
  const jour = `${map.year}-${map.month}-${map.day}`
  // Le jour de la semaine se déduit de la date murale, à midi pour ne jamais
  // retomber sur une bascule d'heure d'été.
  const jourSemaine = new Date(`${jour}T12:00:00Z`).getUTCDay()
  // `minutes` = minutes depuis minuit, heure belge. C'est ce dont on a besoin
  // pour comparer à une heure de fermeture côté SERVEUR.
  return { jour, heure, minute, minutes: heure * 60 + minute, jourSemaine }
}

// ⚠️ CÔTÉ SERVEUR, `jourLocalISO` NE SUFFIT PAS. Elle lit l'horloge de la
// machine, et Vercel tourne en temps universel : à 00h30 heure belge, elle rend
// la veille, exactement le défaut que ce fichier existe pour éviter. Ces deux
// raccourcis lisent, eux, l'heure murale de Bruxelles quel que soit le fuseau
// du serveur. À utiliser dans toute route d'API qui compare une date ou une
// heure à ce qu'un commerçant belge a sous les yeux.
export function jourBruxelles(instant = new Date()) {
  return partiesBruxelles(instant)?.jour || ''
}

export function minutesBruxelles(instant = new Date()) {
  const p = partiesBruxelles(instant)
  return p ? p.minutes : null
}

// Interprète `dateStr` (YYYY-MM-DD) + `timeStr` (HH:MM ou HH:MM:SS) comme une
// heure murale Europe/Brussels et renvoie l'objet Date (instant UTC) correspondant,
// DST inclus. Renvoie une Date invalide si les entrées sont mal formées.
export function brusselsInstant(dateStr, timeStr) {
  if (!dateStr || !timeStr) return new Date(NaN)
  const t = timeStr.length === 5 ? `${timeStr}:00` : timeStr
  // 1re approximation : traiter la wall-clock comme si elle était en UTC.
  const guess = new Date(`${dateStr}T${t}Z`)
  if (isNaN(guess.getTime())) return guess
  // L'offset de Bruxelles à cet instant approché donne le vrai instant :
  // instant_réel = wall_clock_comme_UTC - offset.
  const off = offsetMinutes(guess, BRUSSELS)
  return new Date(guess.getTime() - off * 60000)
}

// ─── LE JOUR, EN DATE LOCALE ───────────────────────────────────────────────
//
// ⚠️ `toISOString()` NE DONNE PAS LA DATE DU JOUR EN BELGIQUE. Nous sommes en
// avance sur le temps universel : minuit heure belge, c'est 22h ou 23h LA VEILLE
// en UTC. Entre minuit et deux heures du matin, `new Date().toISOString()` rend
// donc la date d'HIER, et tout ce qui s'y range part sous la mauvaise journée.
//
// Le food truck en a fait les frais : le patron qui déclarait son emplacement à
// une heure du matin pour un marché de nuit l'enregistrait sous la veille, et sa
// fiche ne l'affichait jamais.
//
// La règle : une clé de jour se construit TOUJOURS à partir des composants
// locaux, jamais d'une conversion en temps universel.
export function jourLocalISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Le jour de la semaine en clair, à partir de l'horloge locale. Écrit ici pour
// qu'il n'existe qu'UNE façon de le calculer : la fiche et le tableau de bord
// en avaient chacun la leur, avec deux décalages d'index différents.
export const JOURS_SEMAINE_LOCAL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
export function jourSemaineLocal(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return isNaN(d.getTime()) ? '' : JOURS_SEMAINE_LOCAL[d.getDay()]
}
