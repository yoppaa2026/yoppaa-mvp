// lib/lancement.js
//
// LA source unique de l'offre de lancement. Deux dates, et rien d'autre :
//
//   1) LAUNCH_DATE  = 1er octobre 2026, l'ouverture publique de l'app.
//      Elle ne pilote QUE du discours (kit commerçant, emails de bienvenue,
//      compteur de la landing) : avant, on recrute des préinscrits ; après, on
//      envoie commander.
//
//   2) FIN_ESSAI_LANCEMENT = 8 janvier 2027, la fin de la gratuité de
//      lancement. Elle pilote la FACTURATION.
//
// ⚠️ LA RÈGLE DE L'ESSAI, ARRÊTÉE PAR ALEX LE 20/08, ET IL N'Y EN A QU'UNE :
//
//     L'essai se termine au plus tard entre le 8 janvier 2027 et 30 jours
//     après l'inscription.
//
// Autrement dit : une CONSTANTE et un PLANCHER. Surtout pas un compteur par
// commerçant, dont le défaut ne se verrait qu'au premier prélèvement, donc
// trop tard. Et cette règle se périme toute seule : passé le 9 décembre 2026,
// le plancher des 30 jours l'emporte et le régime de lancement devient le
// régime normal, sans qu'une seule ligne ne bouge.
//
// | Inscription   | Fin de l'essai | Journées offertes |
// |---------------|----------------|-------------------|
// | 20 août 2026  | 8 janvier 2027 | 141               |
// | 1er nov 2026  | 8 janvier 2027 | 68                |
// | 20 déc 2026   | 19 janvier 2027| 30                |
// | 15 mars 2027  | 14 avril 2027  | 30                |
//
// Fichier PUR (aucune dépendance serveur) : importable côté client comme côté
// API. `lib/stripe-billing.js` en dérive le `trial_end` envoyé à Stripe, pour
// que le texte affiché et l'argent prélevé ne puissent pas diverger.

import { jourBruxelles } from './timezone'

export const LAUNCH_DATE_ISO = process.env.NEXT_PUBLIC_LAUNCH_DATE
  || '2026-10-01T10:00:00+02:00'

// Fin de la gratuité de lancement. Minuit heure belge : la journée du 7 janvier
// est encore gratuite, la première facture tombe le 8.
export const FIN_ESSAI_LANCEMENT_ISO = process.env.NEXT_PUBLIC_FIN_ESSAI_LANCEMENT
  || '2027-01-08T00:00:00+01:00'

// Le plancher. Personne n'a jamais moins que ça, même inscrit le 5 janvier.
export const ESSAI_JOURS_MINIMUM = 30

// true tant que l'app n'est pas ouverte au public (phase de recrutement).
export function avantLancement(now = new Date()) {
  return now.getTime() < new Date(LAUNCH_DATE_ISO).getTime()
}

// LA règle. Rend la Date à laquelle l'essai se termine, et donc celle où la
// première facture est émise.
export function finEssai(inscriptionLe = new Date(), joursMinimum = ESSAI_JOURS_MINIMUM) {
  const depart = new Date(inscriptionLe)
  if (Number.isNaN(depart.getTime())) return new Date(FIN_ESSAI_LANCEMENT_ISO)
  const plancher = new Date(depart.getTime() + joursMinimum * 24 * 60 * 60 * 1000)
  const constante = new Date(FIN_ESSAI_LANCEMENT_ISO)
  return plancher.getTime() > constante.getTime() ? plancher : constante
}

// true quand c'est la constante du 8 janvier qui gagne, donc quand la personne
// touche PLUS que l'essai normal. C'est l'argument de vente.
export function estRegimeLancement(inscriptionLe = new Date(), joursMinimum = ESSAI_JOURS_MINIMUM) {
  const depart = new Date(inscriptionLe)
  if (Number.isNaN(depart.getTime())) return false
  const plancher = depart.getTime() + joursMinimum * 24 * 60 * 60 * 1000
  return plancher <= new Date(FIN_ESSAI_LANCEMENT_ISO).getTime()
}

// Nombre de JOURNÉES gratuites, en jours civils belges : de la journée de
// l'inscription à la veille de la fin d'essai, incluses.
//
// ⚠️ Compté en jours civils de Bruxelles, jamais en millisecondes divisées :
// un changement d'heure entre octobre et janvier rendrait 68,04 jours et un
// arrondi de travers. Voir reference_jour_civil_fuseau.
export function joursOfferts(inscriptionLe = new Date(), joursMinimum = ESSAI_JOURS_MINIMUM) {
  const depart = new Date(inscriptionLe)
  if (Number.isNaN(depart.getTime())) return joursMinimum
  const jourDebut = jourBruxelles(depart)
  const jourFin = jourBruxelles(finEssai(depart, joursMinimum))
  if (!jourDebut || !jourFin) return joursMinimum
  const ms = Date.parse(`${jourFin}T12:00:00Z`) - Date.parse(`${jourDebut}T12:00:00Z`)
  return Math.max(joursMinimum, Math.round(ms / (24 * 60 * 60 * 1000)))
}

// ─── Libellés français, dérivés des dates ────────────────────────────────────
// Aucune date n'est écrite en dur dans un texte : le jour où une constante
// bouge, les phrases suivent.

function libelleDate(d, { avecAnnee = false } = {}) {
  const opts = { timeZone: 'Europe/Brussels' }
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', ...opts }).format(d)
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long', ...opts }).format(d)
  const annee = new Intl.DateTimeFormat('fr-FR', { year: 'numeric', ...opts }).format(d)
  return `${jour === '1' ? '1er' : jour} ${mois}${avecAnnee ? ` ${annee}` : ''}`
}

// Ex. « 1er octobre » / « 1er octobre 2026 ».
export function libelleLancement({ avecAnnee = false } = {}) {
  return libelleDate(new Date(LAUNCH_DATE_ISO), { avecAnnee })
}

// Ex. « 8 janvier 2027 ». Toujours avec l'année : c'est une date contractuelle,
// et elle tombe sur l'année suivante.
export function libelleFinEssaiLancement({ avecAnnee = true } = {}) {
  return libelleDate(new Date(FIN_ESSAI_LANCEMENT_ISO), { avecAnnee })
}

// La phrase de l'offre, en une ligne, pour qui s'inscrit MAINTENANT.
// Ex. « 141 jours offerts, jusqu'au 8 janvier 2027 » — ou, hors régime de
// lancement, « 30 jours d'essai gratuit ».
export function phraseEssai(inscriptionLe = new Date()) {
  const jours = joursOfferts(inscriptionLe)
  if (!estRegimeLancement(inscriptionLe)) return `${ESSAI_JOURS_MINIMUM} jours d'essai gratuit`
  return `${jours} jours offerts, jusqu'au ${libelleFinEssaiLancement()}`
}
