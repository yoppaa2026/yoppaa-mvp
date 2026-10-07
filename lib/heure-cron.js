// L'heure BELGE de chaque envoi programmé, été comme hiver.
//
// 🔴 VERCEL PLANIFIE EN TEMPS UNIVERSEL (audit, 06/10). Un cron réglé sur
// « 0 7 * * * » part à 9 h en été (UTC+2) et à 8 h en HIVER (UTC+1) : chaque
// envoi pensé pour une heure belge partait une heure plus tôt d'octobre à
// mars. Le rappel de rendez-vous de 9 h devenait celui de 8 h, le Good Morning
// de 7 h 30 tombait à 6 h 30.
//
// ✅ LE REMÈDE, DÉCIDÉ PAR ALEX (tableau, 06/10) : chaque cron passe DEUX fois
// (l'heure d'été et l'heure d'hiver en UTC), et seul le passage qui tombe à
// son heure belge travaille. L'autre répond « pas l'heure » sans rien faire.
//
// ⚠️ LA TABLE EST LA RÉFÉRENCE : le banc vérifie que `vercel.json` planifie
// bien les deux passages de chaque ligne, et que chaque route lit SA ligne.

import { partiesBruxelles } from './timezone.js'

export const HEURES_CRON = {
  '/api/cron/recap-jour-8h':         { heure: 8 },
  '/api/cron/rdv-reminder-9h':       { heure: 9 },
  '/api/cron/fidelite-rdv':          { heure: 9 },
  '/api/cron/morning-yoppers':       { heure: 7, minute: 30 },
  '/api/cron/billing-relances':      { heure: 10 },
  '/api/cron/relance-inscriptions':  { heure: 10 },
  '/api/cron/rappels-retrait':       { heure: 11 },
  '/api/cron/signaux-hebdo':         { heure: 9, minute: 30 },
}

/** Est-il `heure` h à Bruxelles à cet instant ? */
export function estHeureBruxelles(heure, instant = new Date()) {
  return partiesBruxelles(instant)?.heure === heure
}

/**
 * Ce passage doit-il s'abstenir ? Vrai quand il n'est pas l'heure belge de ce
 * cron. Un appel manuel (le secret reste exigé par `gardeCron`) peut forcer
 * avec `?forcer=1`.
 *
 * ⚠️ CHAQUE VRAI PASSAGE LAISSE UNE LIGNE AU JOURNAL (07/10). Les deux passages
 * répondaient 200 sans rien écrire : le 07/10, impossible de dire lequel des
 * deux Good Morning avait envoyé. Un appel SANS `instant` est un vrai passage
 * et s'écrit ; un banc fournit son instant et reste silencieux.
 */
export function horsDeSonHeure(request, chemin, instant) {
  const quand = instant || new Date()
  const cible = HEURES_CRON[chemin]
  // Un cron absent de la table n'est pas contraint : mieux vaut un envoi à la
  // mauvaise heure qu'un envoi qui ne part jamais.
  if (!cible) return false
  let forcer = false
  try { forcer = new URL(request.url).searchParams.get('forcer') === '1' } catch { /* adresse illisible */ }
  const hors = !forcer && !estHeureBruxelles(cible.heure, quand)
  if (!instant) {
    const p = partiesBruxelles(quand)
    const ici = p ? `${p.heure} h ${String(p.minute ?? 0).padStart(2, '0')} à Bruxelles` : 'heure illisible'
    console.log(`[cron] ${chemin} : ${hors ? 'pas son heure, rien envoyé' : forcer ? 'forcé, il travaille' : 'à son heure, il travaille'} (${ici})`)
  }
  return hors
}

/** Les deux heures UTC (été, hiver) où ce cron doit passer. */
export function heuresUtcAttendues(heure) {
  return [heure - 2, heure - 1].map(h => (h + 24) % 24)
}
