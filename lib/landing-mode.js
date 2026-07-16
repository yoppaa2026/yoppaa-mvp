// lib/landing-mode.js — Determine si la landing est en mode Teasing ou Reveal.
//
// La bascule est controlee par la date d'annonce. SOURCE DE VERITE UNIQUE =
// NEXT_PUBLIC_REVEAL_DATE (meme variable que la landing visible). LANDING_REVEAL_DATE
// est conservee en fallback legacy. Avant la date → 'teasing', a partir → 'reveal'.
//
// Date par defaut : 2026-08-01T10:00:00+02:00 (annonce deplacee du 21/07 au 1er aout,
// decision 14/07).
//
// Override possible via LANDING_MODE_FORCE (utile en local pour tester) :
//   LANDING_MODE_FORCE=teasing
//   LANDING_MODE_FORCE=reveal

const DEFAULT_REVEAL_DATE = '2026-08-01T10:00:00+02:00'

// Resolution unifiee : NEXT_PUBLIC_REVEAL_DATE prime (aligne sur LandingTeasing),
// puis LANDING_REVEAL_DATE (legacy), puis le defaut.
function revealDateStr() {
  return process.env.NEXT_PUBLIC_REVEAL_DATE
    || process.env.LANDING_REVEAL_DATE
    || DEFAULT_REVEAL_DATE
}

export function getLandingMode() {
  // Override force (dev/staging)
  const forced = process.env.LANDING_MODE_FORCE
  if (forced === 'teasing' || forced === 'reveal') return forced

  const revealDate = new Date(revealDateStr())
  const now = new Date()
  return now >= revealDate ? 'reveal' : 'teasing'
}

export function getRevealDate() {
  return new Date(revealDateStr())
}

// Libellé français de la date de reveal (ex. « 1er août 2026 »). Source unique
// pour tout texte user-facing (emails, landing) afin d'éviter les dates en dur qui
// dérivent. Le « 1er » (premier) est géré à part, le reste en cardinal.
export function getRevealLabel() {
  const d = getRevealDate()
  const opts = { timeZone: 'Europe/Brussels' }
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', ...opts }).format(d)
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long', ...opts }).format(d)
  const annee = new Intl.DateTimeFormat('fr-FR', { year: 'numeric', ...opts }).format(d)
  return `${jour === '1' ? '1er' : jour} ${mois} ${annee}`
}

// Retourne les secondes restantes jusqu'au reveal (pour le compteur cote client).
export function secondsUntilReveal() {
  const revealDate = getRevealDate()
  const now = new Date()
  return Math.max(0, Math.floor((revealDate.getTime() - now.getTime()) / 1000))
}
