// CE QU'UNE FERMETURE OU UN HORAIRE ADAPTÉ RATTRAPE (16/10).
//
// ✅ ALEX, 16/10 (tableau) : « Les montrer, annuler au choix ». Quand le
// commerçant ferme un jour ou réduit ses heures, les commandes et rendez-vous
// déjà pris ce jour-là ne disparaissent pas : on les lui MONTRE, et il décide
// de les annuler (le client est prévenu et remboursé) ou de les honorer.
//
// ⚠️ LA MÊME RÈGLE QUE LE REFUS : une commande est touchée si le client ne
// pourrait plus la passer aujourd'hui (fermé ; ou, un jour d'horaires adaptés,
// son créneau sort de l'horaire). Un rendez-vous, si le serveur le refuserait
// (`rdvsSousLaFermeture`, `horsHoraireAdapte`). Ce que le commerçant voit est
// exactement ce que sa fermeture aurait refusé.
//
// ⚠️ MODULE PUR : il reçoit les lignes déjà lues.

import { couvreLeJour, estFermetureComplete, horsHoraireAdapte } from './horaires-du-jour.js'
import { creneauRetraitHorsHoraires } from './ouverture.js'
import { rdvsSousLaFermeture } from './fermetures-rdv.js'
import { STATUTS_OCCUPENT_CRENEAU } from './creneaux.js'

const hhmm = (t) => String(t || '').slice(0, 5)
const enMin = (t) => { const [h, m] = hhmm(t).split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : NaN }

// Une commande qu'il faut encore servir (pas annulée, pas récupérée, et payée :
// une commande en attente de paiement n'existe pas encore pour le commerce).
const VIVANTE = STATUTS_OCCUPENT_CRENEAU.filter(s => s !== 'paiement_en_attente')

/**
 * @param commandes  [{ id, date_commande, statut, creneau: { heure_debut, heure_fin } | null }]
 *                   `creneau` : celui du retrait OU de la tournée ; null en boutique.
 * @param exception  la ligne de la liste unique
 */
export function commandesTouchees(commandes, exception) {
  if (!exception) return []
  const fermeture = estFermetureComplete(exception)
  return (Array.isArray(commandes) ? commandes : []).filter(c => {
    if (!c || !VIVANTE.includes(c.statut)) return false
    const jour = String(c.date_commande || '').slice(0, 10)
    if (!couvreLeJour(exception, jour)) return false
    if (fermeture) return true
    // Horaires adaptés : seule une commande à créneau peut en sortir. Une
    // commande de boutique (sans créneau) se retire dans l'horaire du jour.
    if (!c.creneau?.heure_debut) return false
    return Boolean(creneauRetraitHorsHoraires({ creneau: c.creneau, dateStr: jour, horairesDetail: null, fermetures: [exception] }))
  })
}

/**
 * @param rdvs  [{ id, date_rdv, heure_debut, heure_fin, statut, deleted_at, praticien_id,
 *                 prestation: { par_couverts } }]
 */
export function rdvsTouches(rdvs, exception) {
  if (!exception) return []
  if (estFermetureComplete(exception)) {
    return rdvsSousLaFermeture(rdvs, { date_debut: exception.date_debut, date_fin: exception.date_fin, praticien_id: null })
  }
  return (Array.isArray(rdvs) ? rdvs : []).filter(r => {
    if (!r || r.statut !== 'confirme' || r.deleted_at) return false
    const jour = String(r.date_rdv || '').slice(0, 10)
    if (!couvreLeJour(exception, jour)) return false
    const debut = enMin(r.heure_debut)
    let fin = enMin(r.heure_fin)
    if (Number.isFinite(debut) && Number.isFinite(fin) && fin <= debut) fin += 1440
    return horsHoraireAdapte({
      exceptions: [exception], dateStr: jour, debutMin: debut, finMin: fin,
      parCouverts: r.prestation?.par_couverts === true,
    })
  })
}

// ─── CE QUE LE COMMERÇANT LIT APRÈS AVOIR ANNULÉ ───────────────────────────
//
// ⚠️ UN REMBOURSEMENT QUI ÉCHOUE SE DIT ICI, au moment où il peut encore agir
// (même règle que l'annulation unitaire, 30/08).
export function bilanAnnulationFermeture({ commandes = {}, rdvs = {} } = {}) {
  const c = { faits: 0, echecs: 0, rembourse: 0, rates: 0, ...commandes }
  const r = { faits: 0, echecs: 0, rembourse: 0, rates: 0, ...rdvs }
  const faits = c.faits + r.faits
  if (faits === 0 && c.echecs + r.echecs > 0) return 'Rien n’a pu être annulé. Vérifie ta connexion et recommence.'
  const morceaux = []
  if (c.faits > 0) morceaux.push(c.faits === 1 ? '1 commande est annulée' : `${c.faits} commandes sont annulées`)
  if (r.faits > 0) morceaux.push(r.faits === 1 ? '1 rendez-vous est annulé' : `${r.faits} rendez-vous sont annulés`)
  let texte = morceaux.length ? `${morceaux.join(' et ')}, les clients sont prévenus par email.` : ''
  const rembourse = Number(c.rembourse) + Number(r.rembourse)
  if (rembourse > 0) texte += ` ${rembourse.toFixed(2).replace('.', ',')} € sont remboursés.`
  const rates = c.rates + r.rates
  if (rates > 0) texte += ` Attention : ${rates === 1 ? 'un remboursement a échoué' : `${rates} remboursements ont échoué`}, fais-le depuis ton tableau Stripe.`
  const echecs = c.echecs + r.echecs
  if (echecs > 0) texte += ` ${echecs === 1 ? '1 annulation n’a pas pu se faire' : `${echecs} annulations n’ont pas pu se faire`} : retrouve-les dans tes commandes ou ton agenda.`
  return texte.trim()
}

// ─── LE FORMULAIRE, VÉRIFIÉ AVANT D'ÉCRIRE ─────────────────────────────────
//
// Ce que la base refuserait de toute façon (contraintes du 16/10), dit en
// clair AVANT d'écrire, plus ce qu'elle ne sait pas juger (une plage vide).
// @returns null si tout va bien, sinon la phrase à afficher
export function erreurException({ date_debut, date_fin, adaptes, plage1_debut, plage1_fin, avecPlage2, plage2_debut, plage2_fin } = {}) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/
  if (!DATE.test(String(date_debut || '')) || !DATE.test(String(date_fin || ''))) return 'Indique les deux dates.'
  if (date_fin < date_debut) return 'La date de fin doit être le même jour ou après la date de début.'
  if (!adaptes) return null
  const HEURE = /^\d{2}:\d{2}$/
  if (!HEURE.test(hhmm(plage1_debut)) || !HEURE.test(hhmm(plage1_fin))) return 'Indique les heures d’ouverture de ce jour-là.'
  if (hhmm(plage1_debut) === hhmm(plage1_fin)) return 'Une plage doit durer au moins une minute.'
  if (avecPlage2) {
    if (!HEURE.test(hhmm(plage2_debut)) || !HEURE.test(hhmm(plage2_fin))) return 'Indique les heures de la deuxième plage, ou retire-la.'
    if (hhmm(plage2_debut) === hhmm(plage2_fin)) return 'Une plage doit durer au moins une minute.'
  }
  return null
}

// Ce qui s'écrit en base, à partir du formulaire.
export function ligneException({ commercantId, date_debut, date_fin, motif, adaptes, plage1_debut, plage1_fin, avecPlage2, plage2_debut, plage2_fin }) {
  const plage = (d, f, oui) => (oui ? { debut: hhmm(d), fin: hhmm(f) } : { debut: null, fin: null })
  const p1 = plage(plage1_debut, plage1_fin, adaptes)
  const p2 = plage(plage2_debut, plage2_fin, adaptes && avecPlage2)
  return {
    commercant_id: commercantId,
    date_debut, date_fin,
    motif: String(motif || '').trim() || null,
    plage1_debut: p1.debut, plage1_fin: p1.fin,
    plage2_debut: p2.debut, plage2_fin: p2.fin,
  }
}
