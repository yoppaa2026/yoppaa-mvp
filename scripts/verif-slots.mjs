// Vérifie le MOTEUR DE CRÉNEAUX : quels horaires sont proposés un jour donné.
//
// C'est le code le plus critique du module rendez-vous. Quand il se trompe, un
// client ne peut pas réserver et personne ne l'apprend : il s'en va, sans rien
// dire. Le bug du 05/08, où la pause d'une praticienne bloquait ses collègues,
// a vécu ici pendant des semaines.

import {
  timeToMinutes, minutesToTime, jourSemaineDate, isoDate,
  filtrerReservationsPourSlots, genererSlots, genererJoursDispos,
} from '../lib/rdv-slots.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// ─── Conversions ───────────────────────────────────────────────────────────
egal('09:30 → minutes', timeToMinutes('09:30'), 570)
egal('09:30:00 → minutes', timeToMinutes('09:30:00'), 570)
egal('minutes → 09:30', minutesToTime(570), '09:30')
egal('minuit', minutesToTime(0), '00:00')
egal('vide = 0', timeToMinutes(null), 0)
egal('aller-retour stable', minutesToTime(timeToMinutes('13:45')), '13:45')

// ⚠️ CE BANC A POURRI TOUT SEUL. Il travaillait sur le 05/08/2026 en dur, un
// mercredi : le jour venu, le moteur a masqué les créneaux du matin (déjà
// passés) et sept vérifications sont tombées en rouge sans qu'une seule ligne
// de code ait bougé. Un banc qui dépend du calendrier finit toujours par
// mentir, et un rouge qu'on sait faux est pire qu'un test manquant.
//
// On travaille donc sur un mercredi TOUJOURS futur. Les dates fixes restent
// réservées aux conversions pures, qui elles ne vieillissent pas.
function mercrediFutur() {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + 7)
  while (d.getDay() !== 3) d.setDate(d.getDate() + 1)   // 3 = mercredi
  return d
}
const mercredi = mercrediFutur()
egal('jour de semaine', jourSemaineDate(mercredi), 'mercredi')
verifier('le mercredi de test est bien dans le futur', mercredi > new Date())
// Conversion pure : une date fixe est ici sans danger, elle ne dépend d'aucun
// « aujourd'hui ».
egal('date ISO locale', isoDate(new Date('2026-08-05T12:00:00')), '2026-08-05')

// ─── Le bug d'Alex : une pause ne doit bloquer QUE son praticien ───────────
// Carole est en pause de 12h à 13h. Un rendez-vous de 13h00 à 13h30 ne
// chevauche PAS sa pause : la borne de fin est exclusive.
const horaires = { mercredi: { ouvert: true, debut: '09:00', fin: '18:00' } }
const creneauCarole = { jour_semaine: 'mercredi', heure_debut: '09:00', heure_fin: '18:00', pas_minutes: 30, pause_debut: '12:00', pause_fin: '13:00', actif: true, praticien_id: 'carole' }

let slots = genererSlots({
  dateChoisie: mercredi, dureeMinutes: 30,
  creneaux: [creneauCarole], reservations: [], horairesDetail: horaires,
})
const heures = slots.map(s => s.heure)
verifier('13h00 proposé juste après la pause', heures.includes('13:00'), heures.join(' '))
verifier('12h00 exclu (début de pause)', !heures.includes('12:00'))
verifier('12h30 exclu (dans la pause)', !heures.includes('12:30'))
// Bornes EXCLUSIVES des deux côtés : un rendez-vous qui finit à 12h00 pile ne
// chevauche pas une pause qui commence à 12h00. Première écriture de ce test,
// je l'attendais exclu à tort : c'est le moteur qui avait raison.
verifier('11h30 proposé (finit pile au début de la pause)', heures.includes('11:30'), heures.join(' '))
verifier('11h00 proposé (finit à 11h30)', heures.includes('11:00'))

// Une prestation LONGUE ne doit pas enjamber la pause.
slots = genererSlots({
  dateChoisie: mercredi, dureeMinutes: 90,
  creneaux: [creneauCarole], reservations: [], horairesDetail: horaires,
})
const heures90 = slots.map(s => s.heure)
verifier('90 min : 11h00 exclu (finirait à 12h30)', !heures90.includes('11:00'), heures90.join(' '))
verifier('90 min : 13h00 proposé', heures90.includes('13:00'))
verifier('90 min : rien après 16h30', !heures90.includes('17:00'))

// ─── Chevauchement avec les réservations existantes ────────────────────────
slots = genererSlots({
  dateChoisie: mercredi, dureeMinutes: 30,
  creneaux: [creneauCarole],
  reservations: [{ heure_debut: '10:00', heure_fin: '10:30' }],
  horairesDetail: horaires,
})
const pris = slots.find(s => s.heure === '10:00')
verifier('créneau réservé marqué pris', pris?.pris === true, JSON.stringify(pris))
egal('motif = réservé', pris?.motif, 'reserve')
verifier('10h30 reste libre', slots.find(s => s.heure === '10:30')?.pris === false)
verifier('09h30 libre (finit à 10h00)', slots.find(s => s.heure === '09:30')?.pris === false)

// ─── Multi-praticiens : la règle « Sans préférence » ───────────────────────
const resas = [
  { heure_debut: '10:00', heure_fin: '10:30', praticien_id: 'carole' },
  { heure_debut: '14:00', heure_fin: '14:30', praticien_id: 'sophie' },
  { heure_debut: '16:00', heure_fin: '16:30', praticien_id: null },
]
const carole = { id: 'carole' }
const eligibles = [{ id: 'carole' }, { id: 'sophie' }]

// Praticien choisi : seules SES réservations et les rdv sans praticien bloquent.
let filtrees = filtrerReservationsPourSlots(resas, carole, eligibles)
egal('Carole : 2 blocages (le sien + le legacy)', filtrees.length, 2)
verifier('le rdv de Sophie ne bloque pas Carole', !filtrees.some(r => r.heure_debut === '14:00'), JSON.stringify(filtrees))

// Sans préférence : un créneau n'est bloqué que si TOUS les praticiens sont pris.
filtrees = filtrerReservationsPourSlots(resas, null, eligibles)
verifier('sans préférence : 10h reste ouvert (Sophie est libre)', !filtrees.some(r => r.heure_debut === '10:00'), JSON.stringify(filtrees))
verifier('sans préférence : le rdv sans praticien bloque tout', filtrees.some(r => r.heure_debut === '16:00'))

const resasCompletes = [
  { heure_debut: '10:00', heure_fin: '10:30', praticien_id: 'carole' },
  { heure_debut: '10:00', heure_fin: '10:30', praticien_id: 'sophie' },
]
filtrees = filtrerReservationsPourSlots(resasCompletes, null, eligibles)
verifier('sans préférence : bloqué si TOUS occupés', filtrees.some(r => r.heure_debut === '10:00'), JSON.stringify(filtrees))

// ─── Horaires de la boutique : le RDV ne déborde jamais ────────────────────
slots = genererSlots({
  dateChoisie: mercredi, dureeMinutes: 30,
  creneaux: [{ jour_semaine: 'mercredi', heure_debut: '08:00', heure_fin: '20:00', pas_minutes: 30, actif: true }],
  reservations: [], horairesDetail: horaires,
})
const h = slots.map(s => s.heure)
verifier('rien avant l’ouverture', !h.includes('08:00'), h.slice(0, 3).join(' '))
verifier('premier créneau à 09h00', h[0] === '09:00', h[0])
verifier('rien qui déborde la fermeture', !h.includes('18:00'))
verifier('dernier créneau à 17h30', h[h.length - 1] === '17:30', h[h.length - 1])

// Journée fermée : aucun créneau.
egal('jour fermé = aucun créneau',
  genererSlots({ dateChoisie: mercredi, dureeMinutes: 30, creneaux: [creneauCarole], reservations: [], horairesDetail: { mercredi: { ouvert: false } } }).length, 0)

// Créneau d'un autre jour : ignoré.
egal('créneau d’un autre jour ignoré',
  genererSlots({ dateChoisie: mercredi, dureeMinutes: 30, creneaux: [{ ...creneauCarole, jour_semaine: 'lundi' }], reservations: [], horairesDetail: horaires }).length, 0)

// Créneau trop court pour la prestation.
egal('créneau trop court',
  genererSlots({ dateChoisie: mercredi, dureeMinutes: 120, creneaux: [{ jour_semaine: 'mercredi', heure_debut: '09:00', heure_fin: '10:00', pas_minutes: 30, actif: true }], reservations: [], horairesDetail: horaires }).length, 0)

// Créneau inactif.
egal('créneau inactif ignoré',
  genererSlots({ dateChoisie: mercredi, dureeMinutes: 30, creneaux: [{ ...creneauCarole, actif: false }], reservations: [], horairesDetail: horaires }).length, 0)

// ─── Jours disponibles ─────────────────────────────────────────────────────
const jours = genererJoursDispos({ nbJours: 14, horairesDetail: horaires, creneaux: [creneauCarole] })
egal('14 jours générés', jours.length, 14)
verifier('les mercredis sont ouverts', jours.filter(j => j.ouvert).every(j => jourSemaineDate(j.date) === 'mercredi'), JSON.stringify(jours.filter(j => j.ouvert).map(j => isoDate(j.date))))
verifier('au moins un mercredi ouvert sur 14 jours', jours.some(j => j.ouvert))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Moteur de créneaux vert.')
