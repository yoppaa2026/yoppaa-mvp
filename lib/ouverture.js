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
// ✅ 16/10 : la liste unique « Fermetures et horaires exceptionnels » remplace
// les horaires des jours qu'elle couvre (lib/horaires-du-jour.js).
import { horaireDuJour, horairesPourDate, estFermetureComplete, couvreLeJour } from './horaires-du-jour.js'
import { jourBruxelles, jourCivilPlus } from './timezone.js'

export const JOURS_ORDRE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

// ⚠️ La règle de minuit vit dans le moteur de créneaux, en un exemplaire :
// une fermeture à 00:00 ou 02:00 se compte APRÈS l'ouverture, jamais avant.
import { finApresMinuit } from './rdv-slots'

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
// ─── OUVERT, EN PAUSE OU FERMÉ, MAINTENANT ──────────────────────────────────
//
// ⚠️ CETTE RÈGLE VIVAIT DANS UN COMPOSANT REACT, donc dans un fichier que les
// bancs ne peuvent pas lire : Node bute sur le premier `<span>`. Elle décidait
// pourtant de ce que chaque visiteur lit en tête de fiche, et rien ne
// l'exécutait jamais. Elle est ici, testable, et le composant l'importe.
const JOURS_SEMAINE = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']

export function getDayBrussels(date) {
  const en = date.toLocaleString('en-US', { weekday: 'long', timeZone: 'Europe/Brussels' }).toLowerCase()
  const map = { monday: 'lundi', tuesday: 'mardi', wednesday: 'mercredi', thursday: 'jeudi', friday: 'vendredi', saturday: 'samedi', sunday: 'dimanche' }
  return map[en] || 'lundi'
}

export function getMinutesBrussels(date) {
  const t = date.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Brussels' })
  const [h, m] = t.split(':').map(n => parseInt(n, 10))
  return h * 60 + m
}

function parseHHMM(s) {
  const [h, m] = String(s || '').split(':').map(n => parseInt(n, 10))
  return h * 60 + m
}

// ⚠️ `fermetures` (16/10) : la liste unique « Fermetures et horaires
// exceptionnels ». Le jour d'aujourd'hui, la nuit d'hier et les jours suivants
// se lisent par `horaireDuJour` : fermé le 1er novembre, la pastille le dit ;
// ouvert de 8 h à 13 h le 24 décembre, elle dit « Ferme à 13:00 ».
export function calculerStatutOuverture(horaires, now, fermetures = []) {
  const avecExceptions = Array.isArray(fermetures) && fermetures.length > 0
  const dateAuj = avecExceptions ? jourBruxelles(now) : ''
  const jourDe = (offset, nom) => (avecExceptions && dateAuj)
    ? horaireDuJour(horaires, jourCivilPlus(dateAuj, offset), fermetures)
    : horaires?.[nom]
  const exceptionAuj = (avecExceptions && dateAuj) ? horaireDuJour(horaires, dateAuj, fermetures) : null
  const aujExceptionnel = Boolean(exceptionAuj?.exceptionnel)

  if ((!horaires || Object.keys(horaires).length === 0) && !aujExceptionnel) return null

  // Cas 24/24 (numéros nationaux d'urgence, garde, distributeurs, ...)
  if (horaires?.always_open === true && !aujExceptionnel) {
    return { etat: 'always', label: '24h/24', sousTitre: null, is24: true }
  }

  const jour = getDayBrussels(now)
  const minNow = getMinutesBrussels(now)
  const creneauxAuj = creneauxDuJour(jourDe(0, jour))

  // 🔴 UNE FERMETURE APRÈS MINUIT SE COMPTE APRÈS L'OUVERTURE (09/09). En
  // minutes, `00:00` vaut ZÉRO et `02:00` en vaut 120 : la fin tombait avant le
  // début, la comparaison était fausse à toute heure, et une brasserie ouverte
  // jusqu'à minuit portait « Fermé » en pleine journée. Alex l'a vu à 11h20.
  const finDe = (d, f) => finApresMinuit(parseHHMM(d), parseHHMM(f))

  // 1) Dans un créneau → OUVERT (ou « Ferme bientôt » à moins de 30 min)
  for (const [d, f] of creneauxAuj) {
    const fin = finDe(d, f)
    if (minNow >= parseHHMM(d) && minNow < fin) {
      if (fin - minNow <= 30) return { etat: 'pause', label: 'Ferme bientôt', sousTitre: `à ${f}` }
      return { etat: 'ouvert', label: 'Ouvert', sousTitre: `Ferme à ${f}` }
    }
  }

  // ⚠️ ET LA NUIT D'AVANT COMPTE. À une heure du matin un samedi, c'est le
  // VENDREDI qui court encore jusqu'à 02:00 : ne lire que le samedi afficherait
  // « fermé » au moment précis où quelqu'un cherche où finir sa soirée.
  const iHier = (JOURS_SEMAINE.indexOf(jour) + 6) % 7
  for (const [d, f] of creneauxDuJour(jourDe(-1, JOURS_SEMAINE[iHier]))) {
    const fin = finDe(d, f)
    if (fin > 1440 && minNow + 1440 < fin) {
      return { etat: 'ouvert', label: 'Ouvert', sousTitre: `Ferme à ${f}` }
    }
  }

  // 2) Entre 2 créneaux du jour → PAUSE
  for (let i = 0; i < creneauxAuj.length - 1; i++) {
    if (minNow >= parseHHMM(creneauxAuj[i][1]) && minNow < parseHHMM(creneauxAuj[i + 1][0])) {
      return { etat: 'pause', label: 'En pause', sousTitre: `Réouvre à ${creneauxAuj[i + 1][0]}` }
    }
  }
  // 3) Avant l'ouverture du jour (« Ouvre bientôt » à moins de 30 min)
  if (creneauxAuj.length > 0 && minNow < parseHHMM(creneauxAuj[0][0])) {
    if (parseHHMM(creneauxAuj[0][0]) - minNow <= 30) {
      return { etat: 'pause', label: 'Ouvre bientôt', sousTitre: `à ${creneauxAuj[0][0]}` }
    }
    return { etat: 'ferme', label: 'Fermé', sousTitre: `Ouvre aujourd'hui à ${creneauxAuj[0][0]}` }
  }
  // 4) Fermé maintenant : on cherche le prochain jour ouvert
  // ⚠️ UNE FERMETURE EXCEPTIONNELLE SE DIT (16/10) : « Fermé » tout court
  // laisserait croire au client que c'est le jour habituel de fermeture.
  const label = (aujExceptionnel && exceptionAuj?.ouvert === false) ? 'Fermé exceptionnellement' : 'Fermé'
  const idx = JOURS_SEMAINE.indexOf(jour)
  // ⚠️ 14 JOURS AVEC DES EXCEPTIONS : une semaine de congés ne doit pas faire
  // disparaître la date de réouverture.
  const horizon = avecExceptions ? 14 : 7
  for (let i = 1; i <= horizon; i++) {
    const next = JOURS_SEMAINE[(idx + i) % 7]
    const c = creneauxDuJour(jourDe(i, next))
    if (c.length > 0) {
      const labelJour = i === 1 ? 'demain' : i < 7 ? next : i < 14 ? `${next} prochain` : `${next} dans deux semaines`
      return { etat: 'ferme', label, sousTitre: `Ouvre ${labelJour} à ${c[0][0]}` }
    }
  }
  return { etat: 'ferme', label, sousTitre: null }
}

export function estOuvertCeJour(horairesDetail, nomJour) {
  if (!horairesDetail || Object.keys(horairesDetail).length === 0) return true
  if (horairesDetail.always_open === true) return true
  const jour = horairesDetail[nomJour]
  // Un jour absent de la grille est traité comme ouvert, même raison.
  if (jour === undefined || jour === null) return true
  return creneauxDuJour(jour).length > 0
}

// Les congés et fermetures ponctuelles, qui priment sur la grille hebdomadaire.
//
// ⚠️ FERMÉ TOUTE LA JOURNÉE SEULEMENT (16/10). Une ligne « horaires adaptés »
// de la liste unique n'est PAS une fermeture : le commerce est ouvert, sur
// d'autres heures, et c'est `horaireDuJour` qui le dit.
export function estFermeExceptionnellement(fermetures, dateStr) {
  if (!dateStr) return false
  return (fermetures || []).some(f => estFermetureComplete(f) && couvreLeJour(f, dateStr))
}

// ─── UN CRÉNEAU DE RETRAIT HORS DES HORAIRES (Alex, 11/10) ─────────────────
//
// 🔴 LE MARDI FERMÉ ÉTAIT PROPOSÉ PARTOUT. Les créneaux de retrait sont
// enregistrés jour par jour, et RIEN ne les croisait avec les horaires : la
// fiche proposait le mardi « Fermé », le serveur l'acceptait, l'encodage aussi,
// et un créneau 15:00-18:00 passait un jour qui ferme à 15:00. Les rendez-vous,
// eux, écrêtent aux horaires depuis le 07/09 : décision d'Alex, LA MÊME RÈGLE.
//
// ⚠️ LES DEUX ÉCRITURES DE `horaires_detail` (`debut`/`fin` et `creneaux`),
// par `creneauxDuJour`, et la fermeture après minuit (`finApresMinuit`).
// ⚠️ SANS HORAIRES CONNUS POUR CE JOUR, ON NE JUGE PAS (même prudence que
// `estOuvertCeJour`) : un commerce qui n'a rien rempli ne perd pas ses ventes.
// ⚠️ LES TOURNÉES DE LIVRAISON N'Y PASSENT PAS : une tournée du soir roule
// boutique fermée.
//
// @returns null si le créneau tient dans une plage d'ouverture, sinon
//          { raison: 'jour_ferme' | 'hors_ouverture', plages: ['07:00–18:00'] }
const enMinutes = (t) => {
  const [h, m] = String(t || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN
}
const enHeure = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// ⚠️ `fermetures` (16/10) : la liste unique. Un jour d'horaires adaptés, le
// créneau doit tenir ENTIER dans l'horaire du jour, sinon il est masqué (Alex,
// tableau : « Masqué »).
// ⚠️ `seulementException` : pour les TOURNÉES DE LIVRAISON. Les jours normaux
// elles ne dépendent pas des horaires (une tournée du soir roule boutique
// fermée) ; un jour d'horaires adaptés, elles les suivent (Alex, 16/10).
export function creneauRetraitHorsHoraires({ creneau, dateStr, horairesDetail, fermetures = [], seulementException = false } = {}) {
  const jour = jourSemaineDe(dateStr)
  if (!jour) return null
  const h = horaireDuJour(horairesDetail, dateStr, fermetures)
  if (seulementException && !h?.exceptionnel) return null
  if (!h?.exceptionnel && (!horairesDetail || typeof horairesDetail !== 'object' || horairesDetail.always_open === true)) return null
  if (h === undefined || h === null) return null
  if (h.ouvert === false) return { raison: 'jour_ferme', plages: [] }
  const plages = creneauxDuJour(h)
    .map(([a, b]) => { const d = enMinutes(a); return [d, finApresMinuit(d, enMinutes(b))] })
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  if (plages.length === 0) return null
  const d = enMinutes(creneau?.heure_debut)
  let f = enMinutes(creneau?.heure_fin)
  if (!Number.isFinite(d) || !Number.isFinite(f)) return null
  if (f <= d) f += 1440
  if (plages.some(([a, b]) => d >= a && f <= b)) return null
  return { raison: 'hors_ouverture', plages: plages.map(([a, b]) => `${enHeure(a)}–${enHeure(b)}`) }
}

/** La phrase, pour le client (`pourCommercant` faux) ou le commerçant. */
export function messageHorsHoraires(hors, dateStr, { pourCommercant = false } = {}) {
  if (!hors) return null
  const jour = jourSemaineDe(dateStr) || 'ce jour-là'
  if (hors.raison === 'jour_ferme') {
    return pourCommercant ? `Tes horaires disent que tu es fermé le ${jour}.` : `Le commerce est fermé le ${jour}. Choisis un autre jour.`
  }
  const quand = hors.plages.length ? ` (${hors.plages.join(', ')})` : ''
  return pourCommercant
    ? `Ce créneau dépasse tes heures d’ouverture du ${jour}${quand}.`
    : `Ce créneau est en dehors des heures d’ouverture du ${jour}${quand}. Choisis-en un autre.`
}

// Le commerce accueille-t-il du monde ce jour-là ?
export function ouvertLe({ horairesDetail, fermetures, dateStr } = {}) {
  const nomJour = jourSemaineDe(dateStr)
  if (!nomJour) return false
  if (estFermeExceptionnellement(fermetures, dateStr)) return false
  // Un jour d'horaires adaptés est ouvert, même si la semaine dit « fermé ».
  const h = horaireDuJour(horairesDetail, dateStr, fermetures)
  if (h?.exceptionnel) return creneauxDuJour(h).length > 0
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
  //
  // 🔴 ET ELLE SE COMPARE EN MINUTES, PAS EN TEXTE (09/09). Le tri portait sur
  // des chaînes : entre « 00:00 » et « 14:00 », il rendait « 14:00 », et chez
  // un bar qui n'a qu'une plage 09:00-00:00 il rendait « 00:00 », c'est-à-dire
  // une limite de commande à zéro minute. Plus aucune commande n'était
  // acceptée le jour même, et rien ne le disait.
  const enMinutes = (t) => {
    const h = parseInt(String(t || '').slice(0, 2), 10)
    const m = parseInt(String(t || '').slice(3, 5), 10)
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
  }
  const fins = plages
    .map(([d, f]) => {
      const debut = enMinutes(d)
      const fin = enMinutes(f)
      return debut === null || fin === null ? null : finApresMinuit(debut, fin)
    })
    .filter(v => v !== null)
  if (fins.length === 0) return null
  const derniere = Math.max(...fins)
  const marge = Number(delaiHeures)
  return derniere - (Number.isFinite(marge) ? marge : 0) * 60
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
      // ⚠️ L'HORAIRE DU JOUR (16/10) : fermer à 13 h le 24 décembre avance
      // aussi l'heure limite des commandes du jour même.
      const limite = limiteRetraitCeJour(horairesPourDate(horairesDetail, jour, fermetures), jourSemaineDe(jour), delaiHeures)
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
