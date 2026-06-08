// lib/landing-mode.js — Determine si la landing est en mode Teasing ou Reveal.
//
// La bascule est controlee par la variable d'env LANDING_REVEAL_DATE (ISO 8601
// avec timezone). Avant cette date → 'teasing'. A partir de cette date → 'reveal'.
//
// Date par defaut : 2026-07-07T09:00:00+02:00 (lundi 7 juillet 9h Bruxelles ete).
//
// Override possible via LANDING_MODE_FORCE (utile en local pour tester) :
//   LANDING_MODE_FORCE=teasing
//   LANDING_MODE_FORCE=reveal

const DEFAULT_REVEAL_DATE = '2026-07-07T09:00:00+02:00'

export function getLandingMode() {
  // Override force (dev/staging)
  const forced = process.env.LANDING_MODE_FORCE
  if (forced === 'teasing' || forced === 'reveal') return forced

  const revealDate = new Date(process.env.LANDING_REVEAL_DATE || DEFAULT_REVEAL_DATE)
  const now = new Date()
  return now >= revealDate ? 'reveal' : 'teasing'
}

export function getRevealDate() {
  return new Date(process.env.LANDING_REVEAL_DATE || DEFAULT_REVEAL_DATE)
}

// Retourne les secondes restantes jusqu'au reveal (pour le compteur cote client).
export function secondsUntilReveal() {
  const revealDate = getRevealDate()
  const now = new Date()
  return Math.max(0, Math.floor((revealDate.getTime() - now.getTime()) / 1000))
}
