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

// ─── LE JOUR DE RETRAIT D'UNE BOUTIQUE ────────────────────────────────────
//
// ⚠️ LA BOUTIQUE AFFICHAIT LE SÉLECTEUR DE L'ALIMENTAIRE, et c'est le défaut
// qu'Alex a constaté le 11/08. Ce sélecteur se construit à partir des CRÉNEAUX.
// Une boutique de détail n'en a aucun : « Aujourd'hui » n'était donc jamais
// proposé, et la boucle d'horizon ne poussait qu'une seule entrée, « Demain ».
//
// Pendant ce temps, la date réellement envoyée venait d'un chemin totalement
// séparé et valait AUJOURD'HUI. L'écran annonçait donc le 12 août, et l'email,
// la fiche du client et le tableau de bord du commerçant disaient tous le 11.
// Le sélecteur ne pilotait rien — sauf, par accident, l'affichage des stocks,
// lus au mauvais jour.
//
// Décision d'Alex : le client indique un jour SOUHAITÉ, le commerçant confirme.
// La date n'est jamais une promesse tant que la notification n'est pas partie.
//
// La dernière heure à laquelle la boutique accepte encore une commande pour le
// jour même : sa fermeture, moins le temps qu'il lui faut pour préparer.
export function limiteRetraitCeJour(horairesDetail, nomJour, delaiHeures = 0) {
  const plages = creneauxDuJour(horairesDetail?.[nomJour])
  if (plages.length === 0) return null
  // La FIN de la dernière plage : une boutique qui ferme le midi rouvre
  // l'après-midi, c'est bien 18h30 qui compte, pas 12h00.
  const fins = plages.map(([, f]) => String(f || '')).filter(Boolean).sort()
  const derniere = fins[fins.length - 1]
  if (!derniere) return null
  const h = parseInt(derniere.slice(0, 2), 10)
  const m = parseInt(derniere.slice(3, 5), 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const marge = Number(delaiHeures)
  return h * 60 + m - (Number.isFinite(marge) ? marge : 0) * 60
}

// Les jours que le client peut indiquer comme souhaités.
//
// @param depuis        'YYYY-MM-DD', aujourd'hui
// @param maintenant    minutes depuis minuit, heure locale. ABSENT = on ne
//                      propose pas le jour même : mieux vaut rater une vente
//                      que promettre un retrait impossible.
// @param delaiHeures   `commercants.boutique_delai_heures`
// @param horizon       nombre de jours proposés, aujourd'hui compris
// @returns [{ jour, label, offset }]
export function joursRetraitBoutique({
  horairesDetail, fermetures, depuis, maintenant, delaiHeures = 0, horizon = 7,
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(depuis || ''))) return []
  const base = new Date(`${depuis}T12:00:00Z`)
  if (isNaN(base.getTime())) return []

  const total = Number(horizon)
  const jours = Number.isFinite(total) && total >= 1 ? Math.floor(total) : 7
  const out = []

  for (let i = 0; i < jours; i++) {
    const d = new Date(base.getTime() + i * 86400000)
    const jour = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    if (!ouvertLe({ horairesDetail, fermetures, dateStr: jour })) continue

    // ⚠️ LE JOUR MÊME NE SE PROPOSE QUE S'IL RESTE LE TEMPS DE PRÉPARER.
    // Sans cette règle, un commerçant recevait à 18h25 une commande à sortir
    // pour 18h30. C'est exactement le défaut corrigé le 10/08 sur les créneaux
    // de l'alimentaire, jamais reporté sur la boutique.
    if (i === 0) {
      const m = Number(maintenant)
      if (!Number.isFinite(m)) continue
      const limite = limiteRetraitCeJour(horairesDetail, jourSemaineDe(jour), delaiHeures)
      // Une limite inconnue signifie « pas d'horaires renseignés ». On ne
      // bloque pas la vente d'un commerçant qui n'a pas fini sa fiche : c'est
      // la même politique que `estOuvertCeJour`.
      if (limite !== null && m > limite) continue
    }

    out.push({
      jour,
      offset: i,
      label: i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : JOURS_ORDRE[(new Date(`${jour}T12:00:00Z`).getUTCDay() + 6) % 7],
    })
  }
  return out
}
