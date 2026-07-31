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
