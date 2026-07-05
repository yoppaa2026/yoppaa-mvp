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
