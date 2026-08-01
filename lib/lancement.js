// lib/lancement.js
//
// Une seule vérité pour « sommes-nous avant ou après l'ouverture publique de
// l'app ? ». Utilisé par les contenus qui changent de discours à cette date
// (kit commerçant, emails de bienvenue) : avant le 1er septembre on recrute
// des préinscrits, après on envoie commander.
//
// Fichier PUR (aucune dépendance serveur) : importable côté client comme côté
// API. La date est pilotée par NEXT_PUBLIC_LAUNCH_DATE, comme le trial différé
// de Stripe Billing, pour que tout bascule ensemble.

export const LAUNCH_DATE_ISO = process.env.NEXT_PUBLIC_LAUNCH_DATE
  || '2026-09-01T10:00:00+02:00'

// true tant que l'app n'est pas ouverte au public (phase de recrutement).
export function avantLancement(now = new Date()) {
  return now.getTime() < new Date(LAUNCH_DATE_ISO).getTime()
}

// Libellé français de la date d'ouverture (ex. « 1er septembre »). Source
// unique pour tout texte user-facing, afin qu'aucune date ne soit écrite en
// dur et ne dérive le jour où NEXT_PUBLIC_LAUNCH_DATE bouge.
export function libelleLancement({ avecAnnee = false } = {}) {
  const d = new Date(LAUNCH_DATE_ISO)
  const opts = { timeZone: 'Europe/Brussels' }
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', ...opts }).format(d)
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long', ...opts }).format(d)
  const annee = new Intl.DateTimeFormat('fr-FR', { year: 'numeric', ...opts }).format(d)
  return `${jour === '1' ? '1er' : jour} ${mois}${avecAnnee ? ` ${annee}` : ''}`
}
