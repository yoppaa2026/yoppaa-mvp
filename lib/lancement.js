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
import { getRevealDateISO } from './landing-mode'

export const LAUNCH_DATE_ISO = process.env.NEXT_PUBLIC_LAUNCH_DATE
  || '2026-10-01T10:00:00+02:00'

// Fin de la gratuité de lancement, exprimée comme l'INSTANT DE FACTURATION.
//
// ⚠️ CETTE DATE N'EST PAS CHOISIE, ELLE EST CALCULÉE : c'est le 1er octobre
// plus 100 jours. Le 1er octobre est le jour 1, le 8 janvier le jour 100, et
// la première facture tombe le 9 au matin. Octobre 31 + novembre 30 +
// décembre 31 + janvier 8 = 100 tout rond.
//
// Le banc refait cette addition à chaque exécution : si quelqu'un déplace la
// date d'ouverture sans déplacer celle-ci, les 100 jours promis deviennent
// autre chose, et il le dira.
export const FIN_ESSAI_LANCEMENT_ISO = process.env.NEXT_PUBLIC_FIN_ESSAI_LANCEMENT
  || '2027-01-09T00:00:00+01:00'

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

// ⚠️ LES 100 JOURS. C'est la promesse publique, et elle n'est écrite NULLE
// PART : elle est calculée depuis les deux dates. Si l'une bouge sans l'autre,
// ce nombre change et le banc rougit, plutôt que de laisser un « 100 jours »
// figé dans un texte devenir faux en silence.
export function joursOffertsAuLancement() {
  return joursOfferts(new Date(LAUNCH_DATE_ISO))
}

// Les jours d'AVANCE : ceux qui séparent aujourd'hui de l'ouverture publique.
//
// ⚠️ C'est la moitié du message qui manquait, et son absence rendait l'offre
// suspecte. Dire « 142 jours » quand la promesse publique est « 100 jours »
// ressemble à une exagération. Dire « 100 jours garantis à partir du
// 1er octobre, PLUS tes 42 jours d'avance » est la même chose, en vrai, et
// vérifiable par n'importe qui sur un calendrier.
//
// Rend 0 une fois l'ouverture passée : il n'y a plus d'avance à prendre.
export function joursAvance(maintenant = new Date()) {
  const depart = new Date(maintenant)
  if (Number.isNaN(depart.getTime())) return 0
  const lancement = new Date(LAUNCH_DATE_ISO)
  if (depart.getTime() >= lancement.getTime()) return 0
  const jourDebut = jourBruxelles(depart)
  const jourLancement = jourBruxelles(lancement)
  if (!jourDebut || !jourLancement) return 0
  const ms = Date.parse(`${jourLancement}T12:00:00Z`) - Date.parse(`${jourDebut}T12:00:00Z`)
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)))
}

// Le chemin parcouru entre l'annonce publique et l'ouverture, en pourcentage.
//
// ⚠️ POURQUOI CET INDICATEUR ET PAS UN AUTRE (décision Alex, 20/08).
// La landing affichait des COMPTES : « 3 commerçants, 11 curieux ». Des petits
// nombres découragent au lieu d'entraîner, et ils exposent une réalité de
// démarrage que personne n'a envie de lire.
//
// Il fallait donc quelque chose qui AVANCE, sans mentir. Un pourcentage de
// « préparation » inventé aurait été un mensonge déguisé en jauge. Le temps
// qui sépare l'annonce de l'ouverture, lui, est une quantité RÉELLE, publique,
// et vérifiable par n'importe qui sur un calendrier : elle progresse chaque
// jour toute seule, et elle dit exactement ce qu'elle mesure.
//
// Rend 0 avant l'annonce, 100 une fois l'ouverture passée.
export function progressionVersLancement(maintenant = new Date()) {
  const debut = new Date(getRevealDateISO()).getTime()
  const fin = new Date(LAUNCH_DATE_ISO).getTime()
  const t = new Date(maintenant).getTime()
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || !Number.isFinite(t)) return 0
  if (fin <= debut) return 100
  const pct = ((t - debut) / (fin - debut)) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

// Jours restants avant l'ouverture publique, pour le « J-42 » qui accompagne
// la barre. C'est `joursAvance` vu depuis aujourd'hui, nommé pour ce qu'il dit.
export function joursAvantLancement(maintenant = new Date()) {
  return joursAvance(maintenant)
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

// ⚠️ DEUX DATES VOISINES, ET IL NE FAUT JAMAIS LES CONFONDRE :
//
//   • `libelleFinEssaiLancement()`  → le 9 janvier 2027, jour de la PREMIÈRE
//     FACTURE. C'est la date technique, celle envoyée à Stripe.
//   • `libelleDernierJourGratuit()` → le 8 janvier 2027, DERNIER JOUR OFFERT.
//     C'est la seule des deux qu'un commerçant doit lire.
//
// Écrire « offert jusqu'au 9 janvier » serait faux d'une journée, et une
// journée fausse sur une promesse de gratuité, c'est une réclamation.
export function libelleFinEssaiLancement({ avecAnnee = true } = {}) {
  return libelleDate(new Date(FIN_ESSAI_LANCEMENT_ISO), { avecAnnee })
}

export function libelleDernierJourGratuit({ avecAnnee = true } = {}) {
  const veille = new Date(new Date(FIN_ESSAI_LANCEMENT_ISO).getTime() - 24 * 60 * 60 * 1000)
  return libelleDate(veille, { avecAnnee })
}

// La phrase de l'offre, en une ligne, pour qui s'inscrit MAINTENANT.
// Ex. « 141 jours offerts, jusqu'au 8 janvier 2027 » — ou, hors régime de
// lancement, « 30 jours d'essai gratuit ».
export function phraseEssai(inscriptionLe = new Date()) {
  if (!estRegimeLancement(inscriptionLe)) return `${ESSAI_JOURS_MINIMUM} jours d'essai gratuit`
  return `${joursOffertsAuLancement()} jours offerts à partir du ${libelleLancement()}`
}
