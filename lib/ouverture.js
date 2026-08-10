// Quand le commerce est-il OUVERT ?
//
// ⚠️ LE DÉFAUT QUE CE FICHIER RÈGLE. En boutique de détail, le retrait n'était
// soumis à AUCUNE condition : la date était forcée à aujourd'hui, et l'écran
// annonçait « je récupère aujourd'hui » même un dimanche, même pendant les
// congés du commerçant. Le client se déplaçait devant une porte fermée.
//
// L'alimentaire, lui, s'appuie sur ses créneaux : impossible de choisir une
// heure un jour sans créneau. La boutique n'a pas de créneau, donc plus rien ne
// la protégeait.
//
// Ces fonctions sont PURES : aucune horloge cachée, la date est toujours
// injectée. C'est ce qui permet au banc de les exécuter sur un dimanche.

import { jourSemaineDe } from './creneaux.js'

export const JOURS_ORDRE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

// Les plages d'un jour, au format de `horaires_detail`.
// Deux écritures cohabitent en base : `{ debut, fin }` (plus une 2e plage
// optionnelle pour les horaires à pause) et `{ creneaux: [[d, f], …] }`.
export function creneauxDuJour(jourData) {
  if (!jourData || jourData.ouvert === false) return []
  if (Array.isArray(jourData.creneaux)) return jourData.creneaux
  const out = []
  if (jourData.debut && jourData.fin) out.push([jourData.debut, jourData.fin])
  // Horaires à pause (restauration, salons qui ferment le midi).
  if (jourData.debut2 && jourData.fin2) out.push([jourData.debut2, jourData.fin2])
  return out
}

// ⚠️ SANS HORAIRES DU TOUT, ON N'INTERDIT RIEN. Un commerçant qui n'a pas encore
// rempli sa fiche ne doit pas voir ses ventes bloquées par notre prudence : on
// le laisse passer, et c'est à lui de compléter. Fermer par défaut ferait perdre
// de l'argent à quelqu'un qui n'a rien demandé.
export function estOuvertCeJour(horairesDetail, nomJour) {
  if (!horairesDetail || Object.keys(horairesDetail).length === 0) return true
  if (horairesDetail.always_open === true) return true
  const jour = horairesDetail[nomJour]
  // Un jour absent de la grille est traité comme ouvert, même raison.
  if (jour === undefined || jour === null) return true
  return creneauxDuJour(jour).length > 0
}

// Les congés et fermetures ponctuelles, qui priment sur la grille hebdomadaire.
export function estFermeExceptionnellement(fermetures, dateStr) {
  if (!dateStr) return false
  return (fermetures || []).some(f => {
    const debut = String(f?.date_debut || '').slice(0, 10)
    const fin = String(f?.date_fin || f?.date_debut || '').slice(0, 10)
    if (!debut) return false
    return dateStr >= debut && dateStr <= (fin || debut)
  })
}

// Le commerce accueille-t-il du monde ce jour-là ?
export function ouvertLe({ horairesDetail, fermetures, dateStr } = {}) {
  const nomJour = jourSemaineDe(dateStr)
  if (!nomJour) return false
  if (estFermeExceptionnellement(fermetures, dateStr)) return false
  return estOuvertCeJour(horairesDetail, nomJour)
}

// Le premier jour où le client pourra vraiment venir chercher sa commande.
//
// @param depuis   'YYYY-MM-DD', le jour à partir duquel on cherche (inclus)
// @param horizon  nombre de jours explorés. 14 par défaut : au-delà, un commerce
//                 fermé deux semaines d'affilée est en congés, et lui annoncer
//                 une date dans trois semaines n'aiderait personne.
// @returns 'YYYY-MM-DD' ou null si rien n'est ouvert dans l'horizon
export function prochainJourOuvert({ horairesDetail, fermetures, depuis, horizon = 14 } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(depuis || ''))) return null
  // Midi en temps universel comme point d'ancrage : jamais de bascule d'heure
  // d'été à cette heure-là, le jour rendu est donc toujours celui de la date
  // écrite. (Et surtout, jamais de `toISOString()` sur une date locale.)
  const base = new Date(`${depuis}T12:00:00Z`)
  if (isNaN(base.getTime())) return null

  for (let i = 0; i <= horizon; i++) {
    const d = new Date(base.getTime() + i * 86400000)
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    if (ouvertLe({ horairesDetail, fermetures, dateStr })) return dateStr
  }
  return null
}
