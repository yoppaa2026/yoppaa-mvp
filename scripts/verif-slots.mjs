// Vérifie le MOTEUR DE CRÉNEAUX : quels horaires sont proposés un jour donné.
//
// C'est le code le plus critique du module rendez-vous. Quand il se trompe, un
// client ne peut pas réserver et personne ne l'apprend : il s'en va, sans rien
// dire. Le bug du 05/08, où la pause d'une praticienne bloquait ses collègues,
// a vécu ici pendant des semaines.

import { readFileSync, readdirSync } from 'node:fs'
import {
  timeToMinutes, minutesToTime, jourSemaineDate, isoDate,
  filtrerReservationsPourSlots, genererSlots, genererJoursDispos, conflitReservation,
  creneauAccepte, creneauxPourPrestation, prestationSansCreneauDedie,
  prestationAutoriseeSurCreneaux, coursDejaCoche, creneauHorsOuverture,
  horizonRdv, HORIZON_RDV_DEFAUT, HORIZONS_RDV, ajusterPlagePourJour,
} from '../lib/rdv-slots.js'
import { horairesDepuisLieux } from '../lib/lieux-activite.js'
import { peutActiverRdv, messageActivationRdv, etatActivationRdv } from '../lib/activation-rdv.js'
import { nomClient, quandRdv, questionRdv, confirmationRdv, statutDepuisChoix } from '../lib/confirmation-rdv.js'
import { capacitePrestation, blocsAgenda, regrouperEnSeances } from '../lib/cours-collectifs.js'
import {
  creneauAcceptable, creneauxDuJour, deplacementUtile, champsDuDeplacement,
  heureDeFin, minutesDeLHeure,
} from '../lib/deplacement-rdv.js'

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

// ═══════════════════════════════════════════════════════════════════════════
// LES COURS COLLECTIFS — un créneau qui accueille plusieurs personnes
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA GARANTIE QUI COMPTE D'ABORD : sans capacité, RIEN NE CHANGE. Tous les
// tests précédents s'exécutent sans ce paramètre, et ils sont verts. Les lignes
// ci-dessous vérifient la même chose explicitement, parce que l'immense
// majorité des métiers à rendez-vous reste individuelle et qu'une régression
// ici ne se verrait qu'au moment où un client renoncerait à réserver.
const RESA_10H = { heure_debut: '10:00', heure_fin: '10:30', prestation_id: 'cours', place_no: 1 }

slots = genererSlots({
  dateChoisie: mercredi, dureeMinutes: 30,
  creneaux: [creneauCarole], reservations: [RESA_10H], horairesDetail: horaires,
})
verifier('sans capacité, une réservation ferme le créneau',
  slots.find(s => s.heure === '10:00')?.pris === true)
egal('et aucune jauge n’est calculée',
  slots.find(s => s.heure === '10:00')?.placesTotal, null)

// Avec une capacité de 3, la même réservation ne ferme plus rien.
slots = genererSlots({
  dateChoisie: mercredi, dureeMinutes: 30,
  creneaux: [creneauCarole], reservations: [RESA_10H], horairesDetail: horaires,
  capacite: 3, prestationId: 'cours',
})
let cours10h = slots.find(s => s.heure === '10:00')
verifier('un cours de 3 reste ouvert avec un inscrit', cours10h?.pris === false, JSON.stringify(cours10h))
egal('et il annonce sa jauge', [cours10h?.placesPrises, cours10h?.placesTotal], [1, 3])
egal('en disant quelles places sont prises', cours10h?.placesOccupees, [1])

// Plein : le créneau se ferme, avec un motif qui lui est propre.
slots = genererSlots({
  dateChoisie: mercredi, dureeMinutes: 30,
  creneaux: [creneauCarole], horairesDetail: horaires,
  reservations: [
    { ...RESA_10H, place_no: 1 }, { ...RESA_10H, place_no: 2 }, { ...RESA_10H, place_no: 3 },
  ],
  capacite: 3, prestationId: 'cours',
})
cours10h = slots.find(s => s.heure === '10:00')
verifier('un cours plein est pris', cours10h?.pris === true)
egal('avec le motif « complet »', cours10h?.motif, 'complet')
// ⚠️ Le motif compte : « réservé » ferait disparaître le créneau, alors que la
// décision d'Alex est de l'AFFICHER grisé. Un cours qui disparaît laisse croire
// qu'il n'y a pas cours ce jour-là.
egal('et les 3 places sont connues', cours10h?.placesOccupees, [1, 2, 3])

// ⚠️ LA PLACE LIBÉRÉE AU MILIEU. Les places 1 et 3 sont prises, la 2 est libre :
// l'écran doit la connaître, sans quoi l'inscription redemanderait la 4, qui
// n'existe pas, ou la 3, déjà occupée.
slots = genererSlots({
  dateChoisie: mercredi, dureeMinutes: 30,
  creneaux: [creneauCarole], horairesDetail: horaires,
  reservations: [{ ...RESA_10H, place_no: 1 }, { ...RESA_10H, place_no: 3 }],
  capacite: 3, prestationId: 'cours',
})
egal('les places prises remontent telles quelles',
  slots.find(s => s.heure === '10:00')?.placesOccupees, [1, 3])

// ⚠️ UN CHEVAUCHEMENT À HEURE DIFFÉRENTE RESTE BLOQUANT, capacité ou pas :
// personne ne peut être à deux endroits. C'est la garde qui empêche un cours
// d'ouvrir un trou dans l'agenda d'un praticien.
slots = genererSlots({
  dateChoisie: mercredi, dureeMinutes: 30,
  creneaux: [creneauCarole], horairesDetail: horaires,
  reservations: [{ heure_debut: '10:15', heure_fin: '10:45', prestation_id: 'autre', place_no: 1 }],
  capacite: 3, prestationId: 'cours',
})
verifier('un rendez-vous qui déborde bloque le cours',
  slots.find(s => s.heure === '10:00')?.pris === true)
egal('et le motif dit bien pourquoi',
  slots.find(s => s.heure === '10:00')?.motif, 'incompatible')

// ⚠️ UNE AUTRE PRESTATION AU MÊME HORAIRE N'EST PAS LA MÊME SÉANCE. Sans ce
// filtre, un rendez-vous individuel de 10h à 10h30 compterait comme un inscrit
// au cours de yoga de 10h, et la jauge mentirait dans les deux sens.
slots = genererSlots({
  dateChoisie: mercredi, dureeMinutes: 30,
  creneaux: [creneauCarole], horairesDetail: horaires,
  reservations: [{ heure_debut: '10:00', heure_fin: '10:30', prestation_id: 'coupe', place_no: 1 }],
  capacite: 3, prestationId: 'cours',
})
verifier('une autre prestation au même horaire bloque, sans compter dans la jauge',
  slots.find(s => s.heure === '10:00')?.pris === true)
egal('la jauge du cours reste vide',
  slots.find(s => s.heure === '10:00')?.placesPrises, 0)

// ═══════════════════════════════════════════════════════════════════════════
// LES HORAIRES DÉDUITS DES EMPLACEMENTS ARRIVENT-ILS JUSQU'ICI ?
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA DÉDUCTION SERAIT JUSTE ET INUTILE si le moteur ne savait pas la lire.
// Les horaires ne servent pas qu'à l'affichage : ce moteur les CROISE avec les
// plages de rendez-vous et écarte tout créneau tombant hors ouverture. C'est
// pour ça qu'on ne pouvait pas se contenter de supprimer la grille chez un
// commerçant itinérant, il serait passé pour fermé toute la semaine.
//
// On vérifie donc le bout de la chaîne, en EXÉCUTANT les deux fonctions à la
// suite : des emplacements en entrée, des créneaux en sortie.
const MARDI = new Date(mercredi); MARDI.setDate(mercredi.getDate() - 1)
const horairesDuTruck = horairesDepuisLieux([
  { type: 'hebdo', jour_semaine: 'mardi', libelle: 'Place', heure_debut: '11:00:00', heure_fin: '14:00:00', actif: true },
  { type: 'hebdo', jour_semaine: 'mardi', libelle: 'Zoning', heure_debut: '18:00', heure_fin: '21:00', actif: true },
])
const slotsTruck = genererSlots({
  dateChoisie: MARDI, dureeMinutes: 30,
  creneaux: [{ jour_semaine: 'mardi', heure_debut: '08:00', heure_fin: '23:00', pas_minutes: 60, actif: true }],
  reservations: [], horairesDetail: horairesDuTruck,
})
const heuresTruck = slotsTruck.map(s => s.heure)
verifier('le moteur propose le service du midi', heuresTruck.includes('12:00'), heuresTruck.join(' '))
verifier('et celui du soir', heuresTruck.includes('19:00'), heuresTruck.join(' '))
// ⚠️ LE CAS QUI JUSTIFIE TOUT LE RESTE. En prenant simplement le minimum et le
// maximum des deux services, la journée aurait couru de 11h à 21h : le client
// se serait vu proposer un créneau à 16h devant un camion absent.
verifier('mais rien pendant la coupure', !heuresTruck.includes('16:00'), heuresTruck.join(' '))
verifier('ni avant le premier service', !heuresTruck.includes('09:00'), heuresTruck.join(' '))
// Un jour sans emplacement ferme le commerce : aucun créneau, comme il se doit.
egal('un jour sans emplacement ne propose rien',
  genererSlots({
    dateChoisie: mercredi, dureeMinutes: 30,
    creneaux: [{ jour_semaine: 'mercredi', heure_debut: '08:00', heure_fin: '20:00', pas_minutes: 60, actif: true }],
    reservations: [], horairesDetail: horairesDuTruck,
  }).length, 0)

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
// TOUS LES CHEMINS QUI CRÉENT UNE RÉSERVATION GRAVENT LA PLACE ET LA CAPACITÉ
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ DÉFAUT TROUVÉ LE 15/08 DANS DU CODE DÉJÀ LIVRÉ. Le module des cours
// collectifs du 13/08 avait équipé la réservation en ligne et le webhook
// Stripe, mais PAS la création manuelle depuis le tableau de bord. Résultat :
//
//   • sans `place_no`, deux inscrits d'un même cours se disputaient la place 1
//     et l'index unique renvoyait « ce créneau vient d'être pris » devant un
//     cours à moitié vide ;
//   • sans `capacite_creneau`, la valeur par défaut 1 activait la contrainte
//     d'exclusion, qui bloque le deuxième inscrit dès qu'un praticien est nommé.
//
// Et le contrôle de chevauchement de la modale refusait de toute façon TOUT
// rendez-vous superposé : la commerçante ne pouvait pas inscrire la deuxième
// personne de son cours de dix.
//
// ⚠️ ON COMPTE, ON NE CHERCHE PAS. Vérifier les trois fichiers connus laisserait
// passer le quatrième chemin, écrit dans six mois par quelqu'un qui n'aura pas
// lu ce commentaire. Le banc compte les écritures existantes et exige qu'elles
// soient toutes déclarées ici : un chemin de plus rougit tant qu'il n'est pas
// équipé.
// ⚠️ CETTE LISTE A DÉJÀ SERVI. Le 15/08, la génération de série des
// abonnements a ajouté un quatrième chemin d'écriture dans ConfigDashboard, et
// le banc a rougi AVANT que quiconque teste l'écran : « aucun chemin d'écriture
// n'échappe à la liste ». C'est exactement le rôle qu'on lui demande.
// ⚠️ ET ELLE A RESERVI LE 16/08 : la route qui pose une séance sur un
// abonnement est le cinquième chemin d'écriture, et le banc a rougi AVANT
// qu'Alex ait pu tester quoi que ce soit. Deuxième fois que cette liste attrape
// un chemin le jour même où il est écrit.
// ⚠️ `ConfigDashboard.js` A QUITTÉ CETTE LISTE LE 18/08, et c'est un rétrécissement
// VOULU : l'inscription d'un abonné générait toute la série de ses séances sur
// un jour fixe de la semaine. Le jour fixe supprimé, elle n'écrit plus une seule
// réservation, elle crée le contrat et rien d'autre.
// ⚠️ Poser les séances redevient un geste d'agenda, donc `ModalNouveauRdv.js`,
// qui est déjà dans la liste et déjà surveillé. Rien n'est sorti du filet.
//
// ⚠️ LA LISTE EST TOMBÉE DE QUATRE À DEUX LE 30/08, et c'est le contraire d'un
// relâchement : trois des quatre chemins passent désormais par
// `lib/rdv-creation-server.js`, qui grave le lieu, la capacité et la place une
// fois pour tous. Le webhook Stripe, la route d'abonnement et le tunnel client
// n'insèrent plus rien eux-mêmes.
//
// 🔴 ET LE FILET NE REGARDAIT QUE `app/`. Le module vit dans `lib/` : sans
// l'étendre, le SEUL endroit qui écrit vraiment dans la table aurait échappé au
// comptage, et la garde serait devenue verte en ne surveillant plus rien.
const CHEMINS_ECRITURE = [
  'lib/rdv-creation-server.js',
  'app/dashboard/ModalNouveauRdv.js',
]

const CHAINE_INSERT = /from\('rdv_reservations'\)\s*\n?\s*\.insert\(/g

function fichiersQuiInserent(dossier) {
  const trouves = []
  const parcourir = (url) => {
    for (const e of readdirSync(url, { withFileTypes: true })) {
      const enfant = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, url)
      if (e.isDirectory()) { parcourir(enfant); continue }
      if (!/\.jsx?$/.test(e.name)) continue
      const src = readFileSync(enfant, 'utf8')
      if (CHAINE_INSERT.test(src)) trouves.push(`${url.pathname.split('/yoppaa-mvp/')[1] || ''}${e.name}`)
      CHAINE_INSERT.lastIndex = 0
    }
  }
  parcourir(new URL(`../${dossier}/`, import.meta.url))
  return trouves
}

// ⚠️ `lib` AUTANT QUE `app` : la création de réservation vit dans un module
// depuis le 30/08, et un filet qui ne balaie que les écrans laisserait passer
// exactement l'endroit où l'écriture a lieu.
const ecrivains = [...fichiersQuiInserent('app'), ...fichiersQuiInserent('lib')]
verifier('aucun chemin d’écriture n’échappe à la liste',
  ecrivains.length === CHEMINS_ECRITURE.length,
  `trouvés : ${ecrivains.join(' · ')}`)
for (const f of ecrivains) {
  verifier(`${f} est un chemin déclaré`, CHEMINS_ECRITURE.some(c => f.endsWith(c.split('/').pop())))
}

// ⚠️ RETIRER LES COMMENTAIRES, ET EXIGER UNE AFFECTATION. Ce test est né
// FAUSSEMENT VERT : la mutation qui retirait les deux colonnes du payload ne
// le faisait pas rougir, parce que les commentaires ci-dessus CITENT
// `place_no` et `capacite_creneau` pour expliquer le défaut. Chercher un mot
// dans un fichier qui parle de ce mot ne prouve rien. On cherche donc la forme
// `place_no:`, qui est une écriture et pas une explication.
const sansCommentaires = (src) =>
  src.split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

for (const chemin of CHEMINS_ECRITURE) {
  const src = sansCommentaires(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'))
  // Les deux chemins n'écrivent pas de la même façon : la modale déclare la
  // propriété dans son payload, le module la pose sur le sien après avoir lu
  // les places prises. Les deux formes sont des ÉCRITURES, et c'est tout ce qui
  // compte ici.
  verifier(`${chemin} grave la place occupée`, /place_no\s*[:=][^=]/.test(src))
  verifier(`${chemin} grave la capacité du créneau`, /capacite_creneau\s*[:=][^=]/.test(src))
}

// ⚠️ ET LA PLACE SE CALCULE, elle ne se devine pas. Un chemin qui écrirait
// `place_no: 1` en dur retomberait exactement dans le défaut d'origine.
const srcModale = readFileSync(new URL('../app/dashboard/ModalNouveauRdv.js', import.meta.url), 'utf8')
verifier('la création manuelle demande la première place LIBRE',
  /premierePlaceLibre\(/.test(srcModale))
verifier('et lit les places en base, pas dans l’état de l’écran',
  /\.eq\('heure_debut', heureInit\)/.test(srcModale))
// ⚠️ LE CHEVAUCHEMENT NE DOIT PLUS REFUSER UN CO-INSCRIT du même cours. Ce
// test cherchait `memeSeance` dans la modale ; la règle a déménagé le 15/08
// dans `lib/deplacement-rdv.js` pour être partagée avec le déplacement, et elle
// y est désormais EXÉCUTÉE plus bas (« un co-inscrit du même cours passe »),
// ce qui vaut mieux que de chercher un mot. Ne reste ici que la délégation.

// ─── LA GÉNÉRATION DE SÉRIE DES ABONNEMENTS ────────────────────────────────
// ⚠️ LE STATUT D'ANNULATION S'ÉCRIT `annule_commercant`. « annule » tout court
// N'EXISTE PAS en base : le projet distingue qui a annulé, et trois statuts
// inventés de mémoire ont déjà faussé des statistiques entières. Ce test
// existe parce que je l'ai écrit de mémoire avant de le vérifier.
const srcConfig = sansCommentaires(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
verifier('résilier un abonnement écrit un statut qui existe',
  /statut: 'annule_commercant'/.test(srcConfig))
verifier('et jamais « annule » tout court',
  !/statut: 'annule'/.test(srcConfig))
// ⚠️ Seules les séances À VENIR se libèrent : les passées ont eu lieu et
// comptent dans l'historique comme dans les statistiques.
verifier('la résiliation ne touche que les séances à venir',
  /\.gte\('date_rdv', aujourdhui\)/.test(srcConfig))
// ⚠️ LE PRIX VIT SUR LE CONTRAT, PAS SUR CHAQUE SÉANCE. Le recopier trente-six
// fois multiplierait le chiffre d'affaires par trente-six.
//
// ⚠️ CETTE GARDE A CHANGÉ DE FICHIER LE 18/08, ELLE N'A PAS DISPARU. Elle
// surveillait `ConfigDashboard`, qui générait la série des séances d'un
// abonnement ; ce chemin n'existe plus depuis la suppression du jour fixe. La
// séance d'abonnement naît désormais dans la route de réservation, et le zéro
// doit y être. Retirer la garde avec le code aurait rouvert le défaut le jour
// où quelqu'un recopie le prix par réflexe.
const srcReserverAbo = sansCommentaires(
  readFileSync(new URL('../app/api/rdv/reserver-abonnement/route.js', import.meta.url), 'utf8'))
verifier('une séance d’abonnement ne porte pas le prix du contrat',
  /prix_estime: 0,/.test(srcReserverAbo))
// ⚠️ ON COMPTE : cette route pose une séance ET, sur un autre chemin, la
// remplace. Chercher le mot laissait l'un des deux satisfaire le test.
egal('et aucune de ses deux écritures ne le recopie',
  (srcReserverAbo.match(/prix_estime: 0,/g) || []).length, 2)

// ─── L'ABONNÉE SE RECONNAÎT DANS L'AGENDA ──────────────────────────────────
// Sur une liste de douze noms, rien ne disait qui avait déjà réglé son année et
// qui devait payer en arrivant. Le lien existait dans la réservation depuis la
// migration, il ne manquait qu'à l'afficher.
// ⚠️ LA PASTILLE « ABONNÉE » A ÉTÉ REMPLACÉE, PAS SUPPRIMÉE (17/08). Elle ne
// disait qu'une chose sur deux : qui est abonnée, jamais combien doit payer
// l'autre. Alex : « il faut distinguer du premier coup d'œil qui est en abo et
// qui doit payer, idem pour un coiffeur : payé, à payer ou partiellement payé.
// Ça doit lui prendre 1 seconde. » C'est le même module qui répond aux deux, et
// il est EXÉCUTÉ ici plutôt que cherché dans le JSX.
const srcAgenda = sansCommentaires(readFileSync(new URL('../app/dashboard/AgendaRdv.js', import.meta.url), 'utf8'))
const { etatPaiementRdv: etatPaiementAgenda } = await import('../lib/rdv-paiement.js')
verifier('l’agenda distingue une abonnée d’une séance à l’unité',
  etatPaiementAgenda({ abonnement_id: 'abo-1', prix_estime: 0 }).cle === 'abonnement'
  && etatPaiementAgenda({ prix_estime: 15 }).cle === 'du')
verifier('et la ligne d’un inscrit porte bien cet état',
  /const pai = etatPaiementRdv\(i\)/.test(srcAgenda))

// ⚠️ ET LA COLONNE DOIT ARRIVER JUSQU'À L'ÉCRAN. Un badge conditionné à un
// champ absent du `select` ne s'affiche JAMAIS, sans la moindre erreur : c'est
// exactement ce qui avait vidé la galerie photos d'une des deux fiches. Le
// select part de `*` aujourd'hui ; le jour où quelqu'un le resserre pour gagner
// quelques octets, ce test le rattrape.
const srcTableau = sansCommentaires(readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'))
const selectRdvs = /const SELECT_RDVS = `([^`]*)`/.exec(srcTableau)?.[1] || ''
verifier('le select de l’agenda est bien lu', selectRdvs.length > 0)
verifier('il ramène de quoi reconnaître une abonnée',
  selectRdvs.trimStart().startsWith('*') || /abonnement_id/.test(selectRdvs),
  selectRdvs.slice(0, 60))

// ═══════════════════════════════════════════════════════════════════════════
// DÉPLACER UN RENDEZ-VOUS (15/08)
//
// ⚠️ CE GESTE N'EXISTAIT PAS, et son absence forçait un contresens : décaler
// une cliente d'une heure obligeait à ANNULER puis recréer. Le client lisait
// « ton rendez-vous est annulé », le numéro changeait, et l'historique gardait
// la trace d'une annulation qui n'avait jamais eu lieu.
//
// ⚠️ ET LA RÈGLE EST EXÉCUTÉE, PAS LUE. Chercher `creneauAcceptable` dans un
// fichier ne prouve rien du tout : ce banc a déjà été faussement vert cinq fois
// pour cette raison exacte. On lui donne des horaires, des rendez-vous et une
// pause, et on lit ce qui en sort.
// ═══════════════════════════════════════════════════════════════════════════
const HORAIRE_AVEC_PAUSE = { ouvert: true, debut: '09:00', fin: '12:00', debut2: '13:00', fin2: '18:00' }
const CRENEAU_JOUR = [{ jour_semaine: 'lundi', heure_debut: '09:00', heure_fin: '18:00', pause_debut: '12:00', pause_fin: '13:00' }]
const BASE = {
  dateStr: '2026-09-07',
  dureeMinutes: 60,
  horaireJour: HORAIRE_AVEC_PAUSE,
  creneauxJour: CRENEAU_JOUR,
  rdvsExistants: [],
  capacite: 1,
  prestationId: 'p1',
}
const juger = (extra) => creneauAcceptable({ ...BASE, ...extra })

egal('un créneau ordinaire est accepté', juger({ heureDebut: '10:00' }).ok, true)
egal('sans durée, on refuse au lieu d’inventer', juger({ heureDebut: '10:00', dureeMinutes: 0 }).raison, 'duree_inconnue')
egal('un jour de fermeture est nommé', juger({ heureDebut: '10:00', horaireJour: { ouvert: false } }).raison, 'ferme')
egal('un horaire absent vaut fermé', juger({ heureDebut: '10:00', horaireJour: null }).raison, 'ferme')
egal('avant l’ouverture', juger({ heureDebut: '08:00' }).raison, 'hors_horaires')
egal('après la fermeture', juger({ heureDebut: '17:30', dureeMinutes: 60 }).raison, 'hors_horaires')
egal('en plein dans la pause', juger({ heureDebut: '12:00' }).raison, 'hors_horaires')
egal('à cheval sur la pause', juger({ heureDebut: '11:30' }).raison, 'hors_horaires')
egal('l’après-midi rouvre', juger({ heureDebut: '13:00' }).ok, true)
// ⚠️ Le message d'un refus d'horaires NOMME les plages. Un « impossible » nu
// oblige le commerçant à aller relire ses horaires dans un autre onglet.
verifier('le refus d’horaires nomme les plages',
  /09:00-12:00 et 13:00-18:00/.test(juger({ heureDebut: '08:00' }).message),
  juger({ heureDebut: '08:00' }).message)

// La pause déclarée sur le CRÉNEAU, sans coupure dans les horaires du commerce.
egal('la pause du créneau bloque aussi',
  creneauAcceptable({ ...BASE, heureDebut: '12:00', horaireJour: { ouvert: true, debut: '09:00', fin: '18:00' } }).raison,
  'pause')
// Un rendez-vous qui commence dans le créneau mais le dépasse.
egal('deux heures à 17h débordent la fermeture',
  creneauAcceptable({ ...BASE, heureDebut: '17:00', dureeMinutes: 120, horaireJour: { ouvert: true, debut: '09:00', fin: '20:00' } }).raison,
  'depasse_creneau')

// ─── LE CHEVAUCHEMENT, ET SON EXCEPTION ────────────────────────────────────
const DEJA_LA = [
  { id: 'r1', prestation_id: 'p1', date_rdv: '2026-09-07', heure_debut: '10:00', heure_fin: '11:00', statut: 'confirme' },
]
egal('un rendez-vous déjà pris bloque', juger({ heureDebut: '10:30', rdvsExistants: DEJA_LA }).raison, 'conflit')
egal('un rendez-vous annulé ne bloque rien',
  juger({ heureDebut: '10:30', rdvsExistants: [{ ...DEJA_LA[0], statut: 'annule_commercant' }] }).ok, true)
egal('un autre jour ne bloque rien',
  juger({ heureDebut: '10:30', rdvsExistants: [{ ...DEJA_LA[0], date_rdv: '2026-09-08' }] }).ok, true)
// ⚠️ LES CO-INSCRITS D'UN MÊME COURS NE SONT PAS UN CONFLIT. C'est le défaut du
// 15/08 : la commerçante ne pouvait inscrire qu'UNE personne par cours.
egal('un co-inscrit du même cours passe',
  juger({ heureDebut: '10:00', rdvsExistants: DEJA_LA, capacite: 12 }).ok, true)
egal('mais une AUTRE prestation à la même heure reste un conflit',
  juger({ heureDebut: '10:00', rdvsExistants: DEJA_LA, capacite: 12, prestationId: 'p2' }).raison, 'conflit')
egal('et sur un rendez-vous individuel, la même heure reste un conflit',
  juger({ heureDebut: '10:00', rdvsExistants: DEJA_LA }).raison, 'conflit')

// ⚠️ LE TEST QUI JUSTIFIE TOUT LE MODULE : UN RENDEZ-VOUS NE SE CHEVAUCHE PAS
// LUI-MÊME. Sans `exclureId`, décaler un rendez-vous d'une heure à l'intérieur
// de sa propre durée serait refusé, c'est-à-dire précisément le décalage qu'on
// demande le plus souvent. Le déplacement serait livré mort-né.
egal('sans exclusion, le rendez-vous se bloque lui-même',
  juger({ heureDebut: '10:30', rdvsExistants: DEJA_LA }).raison, 'conflit')
egal('en s’excluant, il se déplace de trente minutes',
  juger({ heureDebut: '10:30', rdvsExistants: DEJA_LA, exclureId: 'r1' }).ok, true)
egal('mais il bute toujours sur le rendez-vous du VOISIN',
  juger({
    heureDebut: '10:30', exclureId: 'r1',
    rdvsExistants: [...DEJA_LA, { id: 'r2', prestation_id: 'p1', date_rdv: '2026-09-07', heure_debut: '11:00', heure_fin: '12:00', statut: 'confirme' }],
  }).raison, 'conflit')

// ─── LES HEURES, ET LES DEUX FORMES DE L'ABSENCE ───────────────────────────
// ⚠️ `Number(null)` vaut 0 et `Number(undefined)` vaut NaN : ce projet s'y est
// fait prendre deux fois. Une heure absente ne doit JAMAIS valoir minuit.
egal('une heure absente n’est pas minuit', minutesDeLHeure(null), null)
egal('une heure vide non plus', minutesDeLHeure(''), null)
egal('09:30 se lit', minutesDeLHeure('09:30'), 570)
egal('09:30:00 aussi', minutesDeLHeure('09:30:00'), 570)
egal('25:00 n’existe pas', minutesDeLHeure('25:00'), null)
egal('une fin se déduit', heureDeFin('10:00', 90), '11:30')
egal('sans durée, pas de fin', heureDeFin('10:00', null), null)
egal('sans heure, pas de fin', heureDeFin(null, 60), null)

// ─── LE DÉPLACEMENT QUI N'EN EST PAS UN ────────────────────────────────────
const RDV_TEST = { id: 'r1', date_rdv: '2026-09-07', heure_debut: '10:00:00' }
egal('replacer au même endroit n’est pas un déplacement',
  deplacementUtile(RDV_TEST, { date: '2026-09-07', heure: '10:00' }), false)
egal('changer l’heure en est un', deplacementUtile(RDV_TEST, { date: '2026-09-07', heure: '11:00' }), true)
egal('changer le jour aussi', deplacementUtile(RDV_TEST, { date: '2026-09-14', heure: '10:00' }), true)

// ─── ⚠️ LA PLACE FAIT PARTIE DU DÉPLACEMENT ────────────────────────────────
// C'est le piège de ce module, et c'est le défaut du 13/08 qui ressort par une
// autre porte : celle de la MISE À JOUR au lieu de l'insertion. Un rendez-vous
// déplacé qui garderait sa place d'origine se retrouve sur la même place qu'un
// inscrit du cours d'arrivée, et l'index unique rejette l'écriture avec « ce
// créneau vient d'être pris » devant un cours à moitié vide.
const majDeplacement = champsDuDeplacement({
  date: '2026-09-14', heure: '11:00', dureeMinutes: 60,
  placeNo: 3, capacite: 12,
  champsLieu: { lieu_id: 'L1', lieu_libelle: 'Salle communale', lieu_adresse: 'Rue du Centre 1' },
})
egal('le déplacement réécrit la date', majDeplacement.date_rdv, '2026-09-14')
egal('et l’heure de début', majDeplacement.heure_debut, '11:00')
egal('et l’heure de fin, déduite de la durée figée', majDeplacement.heure_fin, '12:00')
egal('ET LA PLACE SUR LE COURS D’ARRIVÉE', majDeplacement.place_no, 3)
egal('et la capacité du créneau', majDeplacement.capacite_creneau, 12)
egal('et le lieu regravé', majDeplacement.lieu_libelle, 'Salle communale')
// ⚠️ UN RENDEZ-VOUS INDIVIDUEL GARDE UNE CAPACITÉ DE 1. La contrainte
// d'exclusion s'active à cette valeur : écrire 0 ou null la désarmerait et
// laisserait deux clients sur le même fauteuil.
egal('une capacité absente vaut 1, jamais 0',
  champsDuDeplacement({ date: '2026-09-14', heure: '11:00', dureeMinutes: 30, placeNo: 1, capacite: null }).capacite_creneau, 1)
// Sans lieu résolu, on n'écrase pas ce qu'on ne sait pas.
verifier('sans lieu connu, aucune colonne de lieu n’est écrasée',
  !('lieu_libelle' in champsDuDeplacement({ date: '2026-09-14', heure: '11:00', dureeMinutes: 30, placeNo: 1, capacite: 1 })))

// ─── LES CRÉNEAUX DU JOUR ──────────────────────────────────────────────────
const TOUS_CRENEAUX = [
  { jour_semaine: 'lundi', heure_debut: '09:00', heure_fin: '12:00' },
  { jour_semaine: 'mardi', heure_debut: '09:00', heure_fin: '12:00' },
  { date_specifique: '2026-09-07', heure_debut: '14:00', heure_fin: '18:00' },
  { jour_semaine: 'lundi', heure_debut: '18:00', heure_fin: '20:00', actif: false },
]
const duLundi = creneauxDuJour(TOUS_CRENEAUX, { dateStr: '2026-09-07', jour: 'lundi' })
egal('le jour retient sa règle hebdo et sa date précise, jamais l’inactif', duLundi.length, 2)
egal('un créneau désactivé ne compte pas', duLundi.filter(c => c.actif === false).length, 0)

// ─── LA MISE À JOUR PASSE PAR LA RÈGLE, ELLE NE LA RECOPIE PAS ─────────────
// ⚠️ CE QUI EST TESTÉ ICI EST LE SEUL POINT QUE L'EXÉCUTION NE PEUT PAS
// ATTEINDRE : que l'écran appelle bien la fonction, et ne rebâtisse pas son
// objet à la main. Commentaires retirés, parce qu'un commentaire qui cite le
// nom cherché rend le test vert alors que le code a disparu.
const srcDeplacer = sansCommentaires(readFileSync(new URL('../app/dashboard/ModalDeplacerRdv.js', import.meta.url), 'utf8'))
verifier('l’écran de déplacement bâtit sa mise à jour avec la règle',
  /champsDuDeplacement\(/.test(srcDeplacer))
verifier('il s’exclut lui-même du chevauchement', /exclureId: rdv\?\.id/.test(srcDeplacer))
verifier('il relit les places EN BASE', /\.eq\('heure_debut', heure\)/.test(srcDeplacer))
verifier('et il s’exclut aussi de cette lecture',
  /filter\(r => String\(r\.id\) !== String\(rdv\.id\)\)/.test(srcDeplacer))
verifier('il regrave le lieu au nouveau jour', /champsLieuPour\(/.test(srcDeplacer))
verifier('il prévient le client du changement', /deplace: true/.test(srcDeplacer))

// ⚠️ ET LA CRÉATION MANUELLE JUGE AVEC LA MÊME RÈGLE. Deux copies de cinq
// contrôles auraient divergé au premier correctif, et le commerçant aurait
// obtenu un créneau par une porte et un refus par l'autre.
verifier('la création manuelle juge avec la même règle',
  /creneauAcceptable\(/.test(sansCommentaires(srcModale)))

// ⚠️ ET AUCUN AUTRE ÉCRAN NE DÉPLACE UN RENDEZ-VOUS DANS SON COIN. Un chemin
// qui réécrirait `date_rdv` sans repasser par la règle retomberait exactement
// dans le défaut de la place dupliquée. On regarde le contenu de chaque appel
// à `.update(` sur les réservations.
// ⚠️ ON LIT L'ARGUMENT DE `.update(`, PAS LES 400 CARACTÈRES QUI SUIVENT. Ma
// première version prenait une fenêtre de taille fixe, et elle a rougi sur la
// résiliation d'un abonnement : `.update({ statut: … }).gte('date_rdv', …)`.
// Ce code FILTRE sur la date, il ne l'écrit pas. Un test qui confond les deux
// finit par être désactivé, et c'est ainsi qu'on perd une garde.
const CHEMINS_DEPLACEMENT = ['app/dashboard/ModalDeplacerRdv.js']
const CHAINE_UPDATE = /from\('rdv_reservations'\)\s*\n?\s*\.update\(/g
function argumentDeLAppel(src, depuis) {
  let profondeur = 0
  for (let i = depuis; i < src.length; i++) {
    if (src[i] === '(') profondeur++
    else if (src[i] === ')') {
      profondeur--
      if (profondeur === 0) return src.slice(depuis, i)
    }
  }
  return src.slice(depuis)
}
const deplaceurs = []
const parcourirMaj = (url) => {
  for (const e of readdirSync(url, { withFileTypes: true })) {
    const enfant = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, url)
    if (e.isDirectory()) { parcourirMaj(enfant); continue }
    if (!/\.jsx?$/.test(e.name)) continue
    const src = sansCommentaires(readFileSync(enfant, 'utf8'))
    const chemin = `${url.pathname.split('/yoppaa-mvp/')[1] || ''}${e.name}`
    let m
    while ((m = CHAINE_UPDATE.exec(src)) !== null) {
      const arg = argumentDeLAppel(src, m.index + m[0].length - 1)
      if (/date_rdv|heure_debut|champsDuDeplacement|\bmaj\b/.test(arg)) { deplaceurs.push(chemin); break }
    }
    CHAINE_UPDATE.lastIndex = 0
  }
}
parcourirMaj(new URL('../app/', import.meta.url))
verifier('aucun autre écran ne réécrit le créneau d’un rendez-vous',
  deplaceurs.length === CHEMINS_DEPLACEMENT.length
  && deplaceurs.every(f => CHEMINS_DEPLACEMENT.some(c => f.endsWith(c.split('/').pop()))),
  `trouvés : ${deplaceurs.join(' · ') || 'aucun'}`)

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA CAPACITÉ DOIT ARRIVER JUSQU'AUX MODALES (défaut trouvé par Alex, 15/08)
//
// Le module des cours collectifs était juste, la modale de création aussi. Mais
// le tableau de bord chargeait les prestations SANS la colonne `capacite`, et
// `capacitePrestation` d'une prestation qui n'en a pas rend **1**, son repli.
// Un cours de douze redevenait donc un rendez-vous individuel, et la deuxième
// inscrite lisait « ce créneau chevauche un RDV déjà existant ».
//
// ⚠️ RIEN NE L'A SIGNALÉ : une colonne absente d'un `select` ne lève aucune
// erreur, elle vaut `undefined`, et le repli silencieux fait le reste. Ni le
// lint, ni le build, ni ce banc ne l'ont vu. Troisième défaut de cette forme
// après la galerie photos d'une fiche et le lien vers l'abonnement.
//
// On ne vérifie donc pas une colonne, on vérifie LE CONTRAT ENTIER : tout champ
// de prestation que les modales lisent doit être demandé par la requête.
// ═══════════════════════════════════════════════════════════════════════════
const CHAMPS_PRESTATION_LUS = [
  'id',               // clé de rapprochement avec la réservation
  'nom',              // affiché dans le sélecteur
  'duree_minutes',    // borne la fin du rendez-vous
  'prix',             // prix estimé
  'acompte_pourcent', // acompte figé
  'tva_taux',         // TVA figée à la réservation
  'capacite',         // ⚠️ celui qui manquait
]
const selectPrestations = /from\('rdv_prestations'\)\s*\n?[\s\S]{0,900}?\.select\('([^']+)'\)/.exec(srcTableau)?.[1] || ''
verifier('le select des prestations du tableau de bord est bien lu',
  selectPrestations.length > 0, selectPrestations)
for (const champ of CHAMPS_PRESTATION_LUS) {
  verifier(`la requête demande « ${champ} »`,
    new RegExp(`(^|,\\s*)${champ}(\\s*,|$)`).test(selectPrestations),
    selectPrestations)
}

// ⚠️ ET LA CONSÉQUENCE, EXÉCUTÉE, parce que c'est elle qui explique le défaut :
// une prestation sans capacité n'est pas « de capacité inconnue », elle vaut 1.
// Le repli est volontaire et protège tout le parc de coiffeurs ; c'est justement
// pour ça qu'une colonne oubliée passe inaperçue.
egal('une prestation sans capacité vaut 1, silencieusement',
  capacitePrestation({ id: 'p1', nom: 'Hatha yoga', duree_minutes: 60 }), 1)
egal('et avec sa capacité, elle vaut ce qu’elle dit',
  capacitePrestation({ id: 'p1', nom: 'Hatha yoga', duree_minutes: 60, capacite: 12 }), 12)
// La démonstration complète du défaut d'Alex : même cours, même heure, deuxième
// personne. Refusée sans la colonne, acceptée avec.
const DEUXIEME = {
  ...BASE, heureDebut: '10:00', prestationId: 'p1',
  rdvsExistants: [{ id: 'r1', prestation_id: 'p1', date_rdv: '2026-09-07', heure_debut: '10:00', heure_fin: '11:00', statut: 'confirme' }],
}
egal('sans la capacité, la deuxième inscrite est refusée',
  creneauAcceptable({ ...DEUXIEME, capacite: capacitePrestation({ nom: 'Hatha yoga' }) }).raison, 'conflit')
egal('avec la capacité, elle passe',
  creneauAcceptable({ ...DEUXIEME, capacite: capacitePrestation({ nom: 'Hatha yoga', capacite: 12 }) }).ok, true)

// ⚠️ ET LE CALENDRIER DU CLIENT DOIT SUIVRE. Apple, Google et Outlook
// reconnaissent l'événement à son identifiant et n'acceptent de le déplacer que
// si le numéro de séquence a GRANDI. À séquence égale, le fichier est reçu,
// ouvert, et sans effet : le client garde l'ancienne heure dans son agenda et
// se présente à ce moment-là. Le défaut serait invisible de notre côté.
const srcRouteConfirme = sansCommentaires(readFileSync(new URL('../app/api/emails/rdv-confirme/route.js', import.meta.url), 'utf8'))
verifier('un déplacement incrémente la séquence du fichier calendrier',
  /sequence: deplace \?/.test(srcRouteConfirme))
verifier('et le sujet de l’email dit « déplacé », pas « confirmé »',
  /deplace[\s\S]{0,120}déplacé/.test(srcRouteConfirme))
verifier('le commerçant ne s’auto-notifie pas de son propre déplacement',
  /!deplace && rdv\.commercant\?\.notif_mode/.test(srcRouteConfirme))

// ═══════════════════════════════════════════════════════════════════════════
// OUVRIR LA PRISE DE RENDEZ-VOUS : L'INTERRUPTEUR QUI N'EXISTAIT NULLE PART
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ DÉFAUT TROUVÉ PAR ALEX LE 15/08, sur Centre Respire. `rdv_actif` n'était
// écrit QUE depuis /admin. Prestations, praticiens et créneaux encodés jusqu'au
// bout, et la fiche continuait d'annoncer aux clients qu'il fallait téléphoner.
// C'est le défaut le plus coûteux de ce module : personne ne peut réserver, et
// le commerçant ne l'apprend jamais.

verifier('le module d’activation existe et s’exécute', typeof peutActiverRdv === 'function')

// La règle, exécutée. Une page de réservation VIDE est pire qu'une page fermée :
// fermée, le client téléphone ; vide, il croit qu'il n'y a jamais de place.
egal('rien d’encodé, on n’ouvre pas',
  peutActiverRdv({ prestationsActives: 0, creneaux: 0 }).manque, ['prestation', 'creneau'])
egal('une prestation sans créneau, on n’ouvre pas',
  peutActiverRdv({ prestationsActives: 1, creneaux: 0 }).manque, ['creneau'])
egal('un créneau sans prestation, on n’ouvre pas',
  peutActiverRdv({ prestationsActives: 0, creneaux: 3 }).manque, ['prestation'])
verifier('une prestation ET un créneau, on ouvre',
  peutActiverRdv({ prestationsActives: 1, creneaux: 1 }).ok === true)

// ⚠️ LE COMPTE ABSENT DOIT BLOQUER. `undefined` et `null` ne sont pas zéro, et
// un test écrit avec `!n` les confondrait avec un compte à zéro par chance
// plutôt que par raisonnement. Ici la question est « sait-on qu'il y en a ? ».
verifier('un inventaire pas encore chargé n’ouvre rien',
  peutActiverRdv({}).ok === false
  && peutActiverRdv({ prestationsActives: null, creneaux: null }).ok === false
  && peutActiverRdv({ prestationsActives: undefined, creneaux: 2 }).ok === false)

// Le message NOMME ce qui manque. « Configuration incomplète » fait refermer
// l'écran, « ajoute une prestation » fait agir.
verifier('le message nomme la prestation manquante',
  /prestation/.test(peutActiverRdv({ prestationsActives: 0, creneaux: 2 }).message))
verifier('le message nomme la plage manquante',
  /plage de rendez-vous/.test(peutActiverRdv({ prestationsActives: 2, creneaux: 0 }).message))
egal('rien à dire quand tout est prêt',
  peutActiverRdv({ prestationsActives: 1, creneaux: 1 }).message, '')
verifier('aucun tiret cadratin dans les messages d’activation',
  !messageActivationRdv(['prestation', 'creneau']).includes('—'))

// Trois états et pas deux : « prêt à ouvrir » et « il te manque encore quelque
// chose » n'appellent pas du tout le même geste.
egal('déjà ouvert, plus rien à annoncer',
  etatActivationRdv({ rdvActif: true, prestationsActives: 0, creneaux: 0 }).etat, 'ouvert')
verifier('déjà ouvert, aucun bouton d’ouverture',
  etatActivationRdv({ rdvActif: true }).peutOuvrir === false)
egal('fermé mais tout est prêt',
  etatActivationRdv({ rdvActif: false, prestationsActives: 2, creneaux: 4 }).etat, 'pret')
verifier('et le bouton s’affiche',
  etatActivationRdv({ rdvActif: false, prestationsActives: 2, creneaux: 4 }).peutOuvrir === true)
egal('fermé et incomplet',
  etatActivationRdv({ rdvActif: false, prestationsActives: 0, creneaux: 4 }).etat, 'incomplet')
verifier('et le bouton NE s’affiche PAS',
  etatActivationRdv({ rdvActif: false, prestationsActives: 0, creneaux: 4 }).peutOuvrir === false)
verifier('l’état fermé dit toujours que les clients ne peuvent pas réserver',
  /ne peuvent pas encore réserver/.test(etatActivationRdv({ rdvActif: false, prestationsActives: 0, creneaux: 0 }).titre))

// ⚠️ LE TEST QUI TIENT LE DÉFAUT D'ORIGINE : le commerçant doit pouvoir écrire
// `rdv_actif` LUI-MÊME. Tant que seul /admin le pose, il est dans une impasse.
verifier('le tableau de bord sait ouvrir la prise de RDV',
  /update\(\{ rdv_actif: true \}\)/.test(srcConfig))
verifier('et le profil sait la refermer',
  /rdv_actif: !!form\.rdv_actif/.test(srcConfig))
verifier('l’interrupteur est bien à l’écran, pas seulement dans le payload',
  /setForm\(p => \(\{ \.\.\.p, rdv_actif: e\.target\.checked \}\)\)/.test(srcConfig))

// La bannière vit dans l'onglet Prise de RDV, là où le commerçant encode, et
// pas trois onglets plus loin : une aide qu'il faut aller chercher ne l'est pas.
verifier('la bannière d’ouverture est dans l’onglet Prise de RDV',
  /etatActivationRdv\(\{[\s\S]{0,200}rdvActif/.test(srcConfig))
verifier('le bouton d’ouverture ne s’affiche que quand c’est possible',
  /etatRdv\.peutOuvrir && \(/.test(srcConfig))

// ⚠️ ET LE GARDE-FOU EST REVÉRIFIÉ AU CLIC. Entre l'affichage de la bannière et
// l'appui sur le bouton, une prestation a pu être désactivée dans un autre
// onglet : juger sur l'état affiché ouvrirait une fiche vide.
const debutOuvrir = srcConfig.indexOf('async function ouvrirLesReservations(')
const corpsOuvrir = srcConfig.slice(debutOuvrir, srcConfig.indexOf('\n  }', debutOuvrir))
verifier('l’ouverture revérifie la règle au moment du clic',
  /peutActiverRdv\(\{/.test(corpsOuvrir) && /if \(!verdict\.ok\)/.test(corpsOuvrir))
verifier('et elle rafraîchit le commerçant pour que la bannière disparaisse',
  /onSaved\?\.\(\)/.test(corpsOuvrir))

// ═══════════════════════════════════════════════════════════════════════════
// INSCRIRE UNE DEUXIÈME PERSONNE SUR UN COURS
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ IMPASSE TROUVÉE PAR ALEX LE 15/08, en testant Centre Respire. Une fois le
// cours créé, la case de l'agenda cesse d'être cliquable (elle porte déjà un
// rendez-vous), et cliquer sur le cours n'ouvrait que la LISTE des inscrits.
// La commerçante lisait « 1/12 » et n'avait AUCUN moyen d'ajouter la deuxième
// personne. Un cours de douze places où l'on ne peut en inscrire qu'une seule
// ne sert à rien : c'est tout le module qui tombait.

verifier('le panneau des inscrits sait ajouter quelqu’un',
  /Inscrire quelqu&rsquo;un/.test(srcAgenda))
// Le bouton appelle le MÊME chemin que la création depuis une case libre : une
// seconde façon de créer un rendez-vous finirait par diverger de la première.
verifier('et il passe par la création de rendez-vous existante',
  /onNouveauRdv\(jour, heure\)/.test(srcAgenda))
// ⚠️ SANS LE JOUR, RIEN N'EST POSSIBLE : le bloc de cours ne porte que des
// heures, la date vit sur la colonne de l'agenda.
verifier('le jour voyage avec le cours ouvert',
  /setSeanceOuverte\(\{ \.\.\.seance, jourDate: j\.date \}\)/.test(srcAgenda))
verifier('et le bouton ne s’affiche pas sans lui',
  /onNouveauRdv && seanceOuverte\.jourDate &&/.test(srcAgenda))

// Complet : on ne propose pas un geste impossible, on dit quoi faire à la
// place. Un bouton grisé sans explication renvoie le commerçant à ses
// suppositions.
// ⚠️ ANCRÉ SUR LE GARDE-FOU, PAS SUR LA COMPARAISON. Écrit
// `inscrits.length >= capacite ?` tout seul, ce test restait VERT sans une
// ligne du correctif : la même comparaison existe vingt lignes plus haut, dans
// l'en-tête du panneau qui affiche « · complet ». Mesuré par mutation, il était
// muet. C'est le piège du test qui CHERCHE au lieu de situer.
verifier('un cours complet n’offre pas le bouton mais une explication',
  /jourDate && \(\s*seanceOuverte\.inscrits\.length >= seanceOuverte\.capacite \?/.test(srcAgenda))
verifier('et l’explication dit comment libérer une place',
  /Libère une place en annulant une inscription/.test(srcAgenda))

// Le nombre de places libres est annoncé : c'est ce qui dit à la commerçante
// combien de personnes elle peut encore prendre au téléphone.
// ⚠️ Le `} place` fait tout le travail : sans lui, le test tombait sur les deux
// ternaires de pluriel du même bouton et restait vert.
verifier('le bouton annonce les places restantes',
  /seanceOuverte\.capacite - seanceOuverte\.inscrits\.length\} place/.test(srcAgenda))

// ═══════════════════════════════════════════════════════════════════════════
// DEMANDER AVANT D'AGIR, PUIS CONFIRMER CE QUI A ÉTÉ FAIT
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CE QUI EXISTAIT AVANT LE 15/08. Annuler un rendez-vous enchaînait DEUX
// `window.confirm()`. Le second demandait « Est-ce parce que tu déplaces cet
// endroit ? » avec pour seules réponses OK et Annuler, où « Annuler » voulait
// dire « annulation ordinaire », donc CONTINUER. Alex l'a résumé en une
// phrase : « ok pour déplacer, annuler pour annuler ». Un bouton dont le mot
// dit le contraire de ce qu'il fait est une fausse manœuvre qui attend son tour.

const RDV_CONFIRM = {
  id: 'r1', client_prenom: 'Sophie', client_nom: 'Martin',
  date_rdv: '2026-08-17', heure_debut: '10:00:00',
}

egal('le client se nomme', nomClient(RDV_CONFIRM), 'Sophie Martin')
egal('et sans nom on ne dit pas « undefined »', nomClient({}), 'ce client')
egal('le moment se lit en clair', quandRdv(RDV_CONFIRM), 'lundi 17 août à 10:00')
// ⚠️ Le midi en dur de la conversion est une CONVENTION du projet, pas une
// protection mesurable ici : joué en mutation, le passer à minuit UTC ne casse
// rien sous nos fuseaux, qui sont en avance sur UTC. On garde la convention pour
// que toutes les dates du projet se lisent pareil, et ce test ne juge donc que
// la mise en forme, ce qu'il fait vraiment.
egal('un jour d’hiver se lit correctement', quandRdv({ date_rdv: '2026-01-05', heure_debut: '09:00:00' }),
  'lundi 5 janvier à 09:00')
egal('sans date, on n’invente rien', quandRdv({ heure_debut: '10:00:00' }), '10:00')

// L'annulation propose les DEUX annulations sur le même écran, nommées.
const qAnnule = questionRdv('annule_commercant', RDV_CONFIRM)
// ⚠️ LA PORTE DE SORTIE VERS LE DÉPLACEMENT, EN PREMIER. Relevé par Alex le
// 15/08 : il cherchait à DÉCALER un rendez-vous et se retrouvait dans la
// fenêtre d'annulation. Neuf fois sur dix, un commerçant qui annule veut en
// réalité déplacer. Quand quelqu'un se trompe de porte, on ne lui répond pas
// qu'il s'est trompé : on ouvre la bonne.
egal('annuler propose d’abord de déplacer',
  qAnnule.actions.map(a => a.valeur), ['deplacer', 'annuler', 'lieu', 'rien'])
verifier('et cette sortie est offerte comme le bon geste, pas comme un danger',
  qAnnule.actions[0].ton === 'principal')
// ⚠️ ET ELLE N'ÉCRIT RIEN. Rendre un statut ici annulerait le rendez-vous au
// moment précis où le commerçant demande à le garder.
egal('déplacer depuis la fenêtre d’annulation n’annule rien',
  statutDepuisChoix('annule_commercant', 'deplacer'), null)
// ⚠️ LES DEUX ANNULATIONS COMMENCENT PAR LE VERBE DU GESTE. Ma première version
// écrivait « Je change d'endroit, invite-le à reprendre sa place » : Alex l'a lu
// comme un déplacement de rendez-vous, et il avait raison de le lire ainsi. Le
// verbe qui ouvre la phrase doit être celui du geste, jamais celui de la raison.
for (const valeur of ['annuler', 'lieu']) {
  verifier(`« ${valeur} » annonce d’abord qu’on annule`,
    /^Annuler/.test(qAnnule.actions.find(a => a.valeur === valeur).label),
    qAnnule.actions.find(a => a.valeur === valeur).label)
}
verifier('le rendez-vous concerné est rappelé', /Sophie Martin/.test(qAnnule.details))
verifier('et son moment aussi', /17 août/.test(qAnnule.details))
verifier('le changement d’adresse est proposé EN CLAIR, pas dans une seconde fenêtre',
  /change d’adresse/.test(qAnnule.actions.find(a => a.valeur === 'lieu').label))

// ⚠️ LA GARDE QUI TIENT LE DÉFAUT D'ORIGINE. Aucun bouton ne s'appelle « OK »
// ni « Annuler » tout court : sur un écran d'annulation, « Annuler » ne veut
// plus rien dire, on ne sait pas si l'on annule le rendez-vous ou la question.
for (const action of ['annule_commercant', 'no_show', 'confirme']) {
  const q = questionRdv(action, RDV_CONFIRM)
  verifier(`« ${action} » pose une vraie question`, !!q?.titre)
  for (const bouton of q.actions) {
    verifier(`aucun bouton ambigu sur « ${action} »`,
      !['ok', 'annuler', 'oui', 'non', 'confirmer'].includes(bouton.label.trim().toLowerCase()),
      bouton.label)
    verifier(`le bouton porte une phrase sur « ${action} »`, bouton.label.length > 8, bouton.label)
  }
  // Le geste qui ne touche à rien est TOUJOURS le dernier, et il existe
  // toujours : une fenêtre sans sortie force la main.
  egal(`« ${action} » laisse toujours repartir sans rien faire`,
    q.actions[q.actions.length - 1].valeur, 'rien')
}

// « Honoré » ne demande rien : le faire confirmer douze fois par jour à une
// professeure de yoga en ferait un réflexe, donc rien du tout.
egal('marquer honoré ne pose aucune question', questionRdv('honore', RDV_CONFIRM), null)

// ⚠️ « NE RIEN FAIRE » N'ÉCRIT JAMAIS RIEN. C'est la sortie de secours : si elle
// produisait un statut, la fenêtre serait pire que le `window.confirm` qu'elle
// remplace.
egal('ne rien faire n’écrit rien', statutDepuisChoix('annule_commercant', 'rien'), null)
egal('ne rien faire n’écrit rien non plus sur un absent', statutDepuisChoix('no_show', 'rien'), null)
egal('annuler ordinairement', statutDepuisChoix('annule_commercant', 'annuler'),
  { statut: 'annule_commercant', raison: 'commercant' })
egal('annuler pour cause de lieu', statutDepuisChoix('annule_commercant', 'lieu'),
  { statut: 'annule_commercant', raison: 'lieu' })
egal('marquer absent', statutDepuisChoix('no_show', 'no_show'),
  { statut: 'no_show', raison: 'commercant' })
// Un choix qui ne correspond pas à l'action n'écrit rien : mieux vaut ne rien
// faire que deviner.
egal('un choix incohérent n’écrit rien', statutDepuisChoix('no_show', 'lieu'), null)

// Ce qu'on lit APRÈS. Les deux annulations ne racontent PAS la même histoire.
verifier('la confirmation d’annulation nomme le client',
  /Sophie Martin/.test(confirmationRdv('annule_commercant', { rdv: RDV_CONFIRM, raison: 'commercant' })))
verifier('l’annulation ordinaire dit que le client est prévenu',
  /prévenu/.test(confirmationRdv('annule_commercant', { rdv: RDV_CONFIRM, raison: 'commercant' })))
verifier('l’annulation pour changement de lieu l’invite à reprendre sa place',
  /reprendre sa place/.test(confirmationRdv('annule_commercant', { rdv: RDV_CONFIRM, raison: 'lieu' })))
verifier('les deux annulations ne disent PAS la même chose',
  confirmationRdv('annule_commercant', { rdv: RDV_CONFIRM, raison: 'lieu' })
  !== confirmationRdv('annule_commercant', { rdv: RDV_CONFIRM, raison: 'commercant' }))
verifier('le déplacement se confirme aussi',
  /déplacé/.test(confirmationRdv('deplace', { rdv: RDV_CONFIRM })))
verifier('aucun tiret cadratin dans ces fenêtres',
  !confirmationRdv('annule_commercant', { rdv: RDV_CONFIRM }).includes('—')
  && !qAnnule.message.includes('—'))

// ⚠️ ET PLUS AUCUN `window.confirm` SUR LES ACTIONS D'UN RENDEZ-VOUS. C'est la
// garde qui empêche le défaut de revenir par la petite porte.
const srcTableauBrut = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
verifier('les actions d’un rendez-vous ne passent plus par window.confirm',
  !/Est-ce parce que tu déplaces cet endroit/.test(srcTableauBrut)
  && !/ANNULER ce RDV/.test(srcTableauBrut))
// ⚠️ ANCRÉ SUR CE QUI L'OUVRE, PAS SUR LE NOM DE LA BALISE. Écrit
// `<ModaleConfirmation` tout seul, ce test restait vert quand on désactivait la
// fenêtre d'un `{false && …}` : le nom était toujours là, plus rien ne
// s'affichait. Mesuré par mutation, il était muet.
verifier('la fenêtre de confirmation est montée dans le tableau de bord',
  /<ModaleConfirmation\s+ouverte=\{!!actionRdv\}/.test(srcTableau))
verifier('et le déplacement d’un rendez-vous la déclenche aussi',
  /confirmationRdv\('deplace'/.test(srcTableau))
// On ne confirme que ce qui a eu lieu : annoncer « c'est annulé » après un
// échec ferait croire que le client est prévenu alors que rien n'a bougé.
verifier('rien n’est confirmé si l’écriture a échoué',
  /if \(!ok\) \{ setActionRdv\(null\); return \}/.test(srcTableau))
verifier('la phrase de confirmation arrive bien jusqu’à la fenêtre',
  /confirmation=\{confirmationRdvTexte\}/.test(srcTableau))

// ⚠️ CE QUE CE BANC NE TIENT PAS, ET IL VAUT MIEUX L'ÉCRIRE QUE LE LAISSER
// CROIRE. Mesuré en mutation : neutraliser l'ÉTAT qui porte la phrase de
// confirmation, en le remplaçant par une constante, ne fait rougir aucun test.
// Un banc qui lit du texte ne voit pas un recâblage de mémoire d'écran. Seule
// une vérification à la main, ou un jour un test de parcours, l'attraperait.

// La fiche publique garde son message de repli : fermée, elle invite à
// téléphoner plutôt que de laisser croire à une panne.
const srcFicheRdv = sansCommentaires(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
verifier('fiche fermée : le client est invité à téléphoner',
  /pas encore activé la prise de RDV/.test(srcFicheRdv))

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA RÈGLE DU CONFLIT, EXÉCUTÉE (défaut trouvé par Alex le 16/08)
//
// Elle vivait en DEUX exemplaires : celui du moteur, qui comptait les places
// d'un cours collectif, et celui du contrôle d'avant insertion dans le tunnel
// client, qui les ignorait. La grille annonçait « 10 places restantes » et le
// bouton « Confirmer mon RDV » répondait « ce créneau chevauche un RDV déjà
// pris ». Le code était correct des deux côtés, l'un ne savait simplement pas
// tout ce que l'autre savait.
//
// ⚠️ CE N'EST PAS UN CALCUL FAUX, C'EST UNE COPIE QUI N'A PAS SUIVI. Aucun
// outil ne l'attrape : ni le lint, ni le build, ni ce banc tant qu'il ne
// vérifiait que le moteur. On EXÉCUTE donc la règle, et on exige que les deux
// appelants passent par elle.
// ═══════════════════════════════════════════════════════════════════════════

const COURS = 'p-yoga'
const AUTRE = 'p-massage'
// Deux inscrites à 10:00 sur un cours de douze. C'est le cas exact d'Alex.
const DEUX_INSCRITES = [
  { heure_debut: '10:00', heure_fin: '11:00', prestation_id: COURS, place_no: 1 },
  { heure_debut: '10:00', heure_fin: '11:00', prestation_id: COURS, place_no: 2 },
]

let c = conflitReservation({ debut: 600, fin: 660, prestationId: COURS, capacite: 12, reservations: DEUX_INSCRITES })
verifier('la troisième inscrite d’un cours de douze passe', !c.conflit, JSON.stringify(c))
egal('et le compte des inscrites est juste', c.inscrits, 2)
egal('les places déjà tenues sont rendues', c.placesOccupees, [1, 2])

// ⚠️ LE COMPORTEMENT D'AVANT LES COURS COLLECTIFS, INTACT. Sans capacité, un
// chevauchement reste un refus : c'est le cas de l'immense majorité des
// métiers, et c'est ce que ce banc protège depuis le premier jour.
c = conflitReservation({ debut: 600, fin: 660, reservations: DEUX_INSCRITES })
verifier('chez un coiffeur, le même horaire reste refusé', c.conflit)
egal('et le motif est l’occupation', c.raison, 'occupe')
egal('un rendez-vous individuel ne parle pas de places', c.inscrits, null)

// Un cours PLEIN se ferme, et il le dit avec son propre mot : « ce créneau
// chevauche un RDV » devant un cours complet enverrait chercher un problème
// qui n'existe pas.
const DOUZE = Array.from({ length: 12 }, (_, i) => ({
  heure_debut: '10:00', heure_fin: '11:00', prestation_id: COURS, place_no: i + 1,
}))
c = conflitReservation({ debut: 600, fin: 660, prestationId: COURS, capacite: 12, reservations: DOUZE })
verifier('un cours plein refuse la treizième', c.conflit)
egal('et le motif le nomme', c.raison, 'complet')

// ⚠️ UNE AUTRE PRESTATION AU MÊME HORAIRE BLOQUE TOUJOURS. Un massage de 10h à
// 11h occupe la praticienne : le cours de yoga ne peut pas se tenir en même
// temps, quel que soit le nombre de places qu'il reste.
c = conflitReservation({
  debut: 600, fin: 660, prestationId: COURS, capacite: 12,
  reservations: [{ heure_debut: '10:00', heure_fin: '11:00', prestation_id: AUTRE, place_no: 1 }],
})
verifier('une autre prestation au même horaire bloque le cours', c.conflit)
egal('et ce n’est pas « complet »', c.raison, 'occupe')

// Un chevauchement PARTIEL n'est pas la même séance : personne ne peut être à
// deux endroits à la fois, même dans un cours à moitié vide.
c = conflitReservation({
  debut: 600, fin: 660, prestationId: COURS, capacite: 12,
  reservations: [{ heure_debut: '10:30', heure_fin: '11:30', prestation_id: COURS, place_no: 1 }],
})
verifier('un cours qui déborde sur un autre est refusé', c.conflit)

// Les deux formes d'entrée qui circulent vraiment : des minutes côté moteur,
// des heures côté base. Les mélanger était le plus court chemin vers une
// troisième copie de la règle.
const enMinutes = conflitReservation({
  debut: 600, fin: 660, prestationId: COURS, capacite: 12,
  reservations: [{ start: 600, end: 660, prestation_id: COURS, place_no: 1 }],
})
egal('minutes et heures donnent le même verdict', enMinutes.inscrits, 1)

// Rien à côté : on ne refuse personne.
c = conflitReservation({ debut: 600, fin: 660, prestationId: COURS, capacite: 12, reservations: [] })
verifier('un agenda vide n’empêche rien', !c.conflit)
c = conflitReservation({ debut: 600, fin: 660 })
verifier('et l’absence de réservations ne casse rien', !c.conflit)

// ⚠️ LE FILTRE PAR PRATICIEN PERDAIT LES COLONNES DES COURS. Sa branche « sans
// préférence » reconstruisait un objet à partir de la clé `heure_debut-heure_fin`,
// donc sans `prestation_id` ni `place_no`. Deux inscrites sur deux praticiennes
// différentes fermaient alors un cours de douze, la règle ne pouvant plus
// reconnaître qu'elles étaient à la MÊME séance.
const DEUX_PRATICIENNES = [
  { heure_debut: '10:00:00', heure_fin: '11:00:00', praticien_id: 'pr-1', prestation_id: COURS, place_no: 1 },
  { heure_debut: '10:00:00', heure_fin: '11:00:00', praticien_id: 'pr-2', prestation_id: COURS, place_no: 2 },
]
const bloquantesCours = filtrerReservationsPourSlots(DEUX_PRATICIENNES, null, [{ id: 'pr-1' }, { id: 'pr-2' }])
verifier('le filtre garde la prestation de chaque réservation',
  bloquantesCours.length > 0 && bloquantesCours.every(r => r.prestation_id === COURS),
  JSON.stringify(bloquantesCours))
verifier('et il garde le numéro de place',
  bloquantesCours.every(r => r.place_no > 0), JSON.stringify(bloquantesCours))
c = conflitReservation({ debut: 600, fin: 660, prestationId: COURS, capacite: 12, reservations: bloquantesCours })
verifier('un cours reste ouvert malgré deux praticiennes occupées', !c.conflit, JSON.stringify(c))

// ─── LES DEUX APPELANTS PASSENT PAR LA RÈGLE ──────────────────────────────
// ⚠️ Ancré sur l'APPEL, pas sur le nom importé : importer sans appeler
// laisserait le test vert avec la vieille boucle toujours en place.
const srcTunnel = sansCommentaires(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
verifier('le tunnel client interroge la règle commune',
  /conflitReservation\(\{[\s\S]{0,220}?capacite: capacitePrestation\(prestationChoisie\)/.test(srcTunnel))
verifier('et il ne refait plus le calcul à la main',
  !/const overlap = busyFiltres\.some/.test(srcTunnel))
verifier('un cours complet reçoit sa propre phrase',
  /conflit\.raison === 'complet'/.test(srcTunnel))

const srcMoteur = readFileSync(new URL('../lib/rdv-slots.js', import.meta.url), 'utf8')
verifier('le moteur de créneaux l’interroge aussi',
  /const c = conflitReservation\(\{/.test(srcMoteur))

// ⚠️ « DÉJÀ PRIS CE JOUR-LÀ » EST MUET SUR UN COURS (décision d'Alex, 16/08).
// Il affichait « 10:00 – 11:00 » autant de fois qu'il y avait d'inscrites,
// juste au-dessus d'une grille annonçant dix places libres à cette heure : il
// disait donc le contraire de la vérité.
verifier('le bloc des heures prises se tait sur un cours collectif',
  /if \(estCoursCollectif\(prestationChoisie\)\) return null/.test(srcTunnel))

// ⚠️ CHEZ QUI BOUGE, LA GRILLE D'HORAIRES DISPARAÎT DES DEUX FICHES. Le bloc
// « Où me trouver cette semaine » porte déjà le jour, l'endroit et l'heure :
// afficher les deux, c'était se contredire dès que la déduction avait pris du
// retard, ce qu'Alex a lu sur sa propre fiche (mardi annoncé en salle, et
// « Fermé » dans la grille, le même jour).
verifier('la fiche rendez-vous cache la grille pour un commerce itinérant',
  /\{!commerceItinerant && \([\s\S]{0,220}?<HorairesSection/.test(srcTunnel))
const srcFicheBoutique = sansCommentaires(readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8'))
verifier('la fiche boutique aussi',
  /!commerceItinerant && <HorairesSection/.test(srcFicheBoutique))

// ⚠️ ET LA BASCULE DE MODE RECALCULE LES HORAIRES. Sans cela, répondre « je
// change d'endroit » laissait la vieille grille en place : une journée entière
// restait grisée côté client, parce que `genererJoursDispos` lit ces horaires
// pour savoir quels jours proposer. Aucune erreur, aucun avertissement.
const srcConfigLieux = sansCommentaires(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
verifier('répondre « je change d’endroit » déduit les horaires sur-le-champ',
  /if \(!memeEndroit\) \{[\s\S]{0,320}?patch\.horaires_detail = horairesDepuisLieux\(lieux \|\| \[\]\)/.test(srcConfigLieux))
verifier('et la réponse inverse ne touche pas à la grille saisie à la main',
  /const patch = \{ siege_social_est_lieu_activite: memeEndroit \}/.test(srcConfigLieux))

// ═══════════════════════════════════════════════════════════════════════════
// DUPLIQUER UN JOUR DU PLANNING (demande d'Alex, 16/08)
//
// Une professeure qui donne cours dans la même salle du lundi au vendredi
// saisissait le nom, l'adresse complète et deux horaires CINQ FOIS. La grille
// des horaires fixes savait déjà recopier un jour ; le planning par
// emplacements, non, alors que c'est là que la saisie est la plus longue.
// ═══════════════════════════════════════════════════════════════════════════
verifier('un jour du planning se recopie sur d’autres',
  /async function dupliquerJour\(\)/.test(srcConfigLieux))
// ⚠️ TOUS LES MOMENTS DU JOUR, pas seulement le premier. Un food truck qui sert
// le midi sur une place et le soir dans un zoning perdrait la moitié de son
// service, et rien ne le lui dirait.
verifier('et il emporte TOUS les moments du jour',
  /copieVers\.flatMap\(cible => source\.map\(/.test(srcConfigLieux))

// ⚠️ ON LIT LE CORPS DE LA FONCTION, PAS LE FICHIER. Chercher « charger() »
// quelque part après l'insertion le trouvait DIX LIGNES PLUS LOIN, dans une
// autre fonction : le test restait vert alors que la copie ne rechargeait plus
// rien. Mesuré par mutation, il était muet. Le comptage d'accolades borne la
// lecture à la fonction visée.
function corpsDeLaFonction(src, nom) {
  const debut = src.indexOf(`async function ${nom}(`)
  if (debut < 0) return ''
  const ouvrante = src.indexOf('{', src.indexOf(')', debut))
  if (ouvrante < 0) return ''
  let profondeur = 0
  for (let i = ouvrante; i < src.length; i++) {
    if (src[i] === '{') profondeur++
    else if (src[i] === '}') {
      profondeur--
      if (profondeur === 0) return src.slice(ouvrante, i + 1)
    }
  }
  return ''
}
const corpsCopie = corpsDeLaFonction(srcConfigLieux, 'dupliquerJour')
verifier('la fonction de copie est bien retrouvée', corpsCopie.length > 200, `${corpsCopie.length} caractères`)

// ⚠️ L'ORDRE EST LA GARANTIE : tout est vérifié AVANT la moindre écriture.
// Écrire au fil de l'eau laisserait trois jours copiés et un refus au milieu,
// sans que le commerçant sache ce qui est passé.
const iControle = corpsCopie.indexOf('posesVirtuels.push(')
const iEcriture = corpsCopie.indexOf('.insert(lignes)')
verifier('rien n’est écrit avant que tout soit vérifié',
  iControle > 0 && iEcriture > 0 && iControle < iEcriture,
  `contrôle ${iControle}, écriture ${iEcriture}`)
// ⚠️ ET LE RECHARGEMENT SUIT L'ÉCRITURE, sans quoi les jours copiés resteraient
// FERMÉS aux yeux du moteur : c'est `charger()` qui redéduit les horaires
// d'ouverture depuis les emplacements. Copier un jour sans cela donnerait un
// planning juste et des créneaux introuvables, exactement le défaut du matin.
verifier('et les horaires se redéduisent après la copie',
  iEcriture > 0 && corpsCopie.indexOf('charger()', iEcriture) > iEcriture)
// ⚠️ CE QUE CE BANC NE TIENT PAS, ET IL VAUT MIEUX L'ÉCRIRE. Mesuré en
// mutation : glisser un `return` juste avant `charger()` ne fait rougir aucun
// test. Le texte est toujours là, la ligne ne s'exécute plus. Un banc qui LIT
// du code ne voit pas du code mort ; seul un test de parcours l'attraperait.
// La sortie n'est pas de complexifier le filtre, c'est de le savoir.

// ─── L'ADRESSE SOUS LE NOM DE LA SALLE (demande d'Alex, 16/08) ────────────
// « Salle Respire 1 » dit à une habituée où aller, et absolument rien à qui
// vient pour la première fois. Le nom garde la tête, il est plus parlant, mais
// il ne peut pas tenir lieu d'adresse.
verifier('la fiche rendez-vous donne l’adresse sous le nom de l’endroit',
  /\{l\.libelle && l\.adresse && \(/.test(srcTunnel))
verifier('la fiche boutique aussi',
  /\{lieu\.libelle && lieu\.adresse && \(/.test(srcFicheBoutique))

// ⚠️ L'ÉCRAN DE CONFIRMATION NE PORTE PLUS LA FICHE AU-DESSUS (Alex, 16/08).
// Une fois le rendez-vous pris, la description du commerce, sa pastille
// d'ouverture et son planning n'ont plus rien à faire au-dessus du numéro.
// ⚠️ DEUX BLOCS, PAS UN : la carte d'identité ET le bandeau du haut. Le premier
// correctif n'avait retiré que la carte, et le bandeau restait seul, grand aplat
// mauve portant le nom d'un commerce que le client vient de choisir.
//
// ⚠️ ET LA CONDITION DIT « AVANT LA CONFIRMATION », PAS « SAUF L'ÉTAPE 4 ».
// Ce test exigeait `etape !== 4` : le jour où l'étape 5 est arrivée (l'écran de
// confirmation d'un abonnement, 16/08), cette forme a fait RÉAPPARAÎTRE le
// bandeau et la carte sur le nouvel écran, sans que rien ne prévienne. Une
// exception nommée ne protège que les étapes qu'on connaissait au moment de
// l'écrire ; un seuil couvre aussi celles d'après.
egal('l’écran de confirmation n’affiche ni la carte ni le bandeau',
  (srcTunnel.match(/\{etape < 4 && \(/g) || []).length, 2)
verifier('et la règle vaut pour TOUT écran de confirmation, pas pour la seule étape 4',
  !/etape !== 4/.test(srcTunnel))

// ⚠️ LE BOUTON RETOUR NE FAISAIT RIEN À L'ÉTAPE 4 (trouvé par Alex, 16/08) :
// une suite de `else if` sans sortie finale, donc une impasse qui s'ouvre toute
// seule dès qu'une étape s'ajoute. On exige une sortie par DÉFAUT, pas une
// branche de plus, sans quoi l'étape 5 rouvrirait le trou.
verifier('le bouton Retour a une sortie par défaut',
  /else \{ router\.push\('\/commander'\) \}/.test(srcTunnel))
verifier('et plus de branche sur la seule étape 1',
  !/if \(etape === 1\) \{ router\.push/.test(srcTunnel))

// ⚠️ PAS DE FLOU SUR CE QUI DÉFILE, ET PLUS NULLE PART. `backdrop-filter`
// oblige le compositeur iOS à relire et refloutrer le fond À CHAQUE IMAGE tant
// que l'élément est à l'écran : c'est l'une des trois causes confirmées du
// défilement qui gèle sur iPhone (diagnostic du 16/07, consigné en mémoire).
//
// ⚠️ ET LA GARDE POSÉE EN JUILLET NE CONNAISSAIT QUE DEUX BOUTONS. Elle testait
// la chaîne exacte `rgba(255,255,255,0.95)', backdropFilter`, c'est-à-dire les
// deux endroits corrigés ce jour-là. Trente-huit autres flous ont donc pu vivre
// sous son nez, dont DEUX EN PERMANENCE sur la fiche dont Alex se plaignait le
// 17/08 : le bouton Retour du bandeau, et la pastille d'ouverture, qui vit dans
// un COMPOSANT et échappait à toute lecture de la page.
//
// C'est la troisième fois sur ce projet qu'une garde nommée d'après un défaut
// ne surveille en réalité qu'un seul de ses exemplaires. On interdit donc la
// PROPRIÉTÉ, partout, en comptant les fichiers plutôt qu'en cherchant un mot.
{
  const flous = []
  const parcourir = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      // `app/demo-mettet` est un jeu de diapositives projeté, jamais défilé au
      // doigt : le flou y est un effet assumé, et il est DIT ici plutôt que
      // toléré en silence.
      if (e.isDirectory()) { if (e.name !== 'demo-mettet') parcourir(`${dir}/${e.name}`); continue }
      if (!e.name.endsWith('.js')) continue
      const chemin = `${dir}/${e.name}`
      // ⚠️ ON LIT LE CODE SANS SA PROSE, et c'est la SEPTIÈME fois en trois
      // jours que ce piège se referme sur moi : le commentaire qui explique
      // POURQUOI le flou a été retiré contient forcément le mot « flou ».
      // Cette garde a rougi sur un correctif qui la respectait. Retirer le
      // commentaire serait perdre l'explication, la seule chose qui empêche
      // quelqu'un de remettre le flou dans six mois.
      const code = readFileSync(chemin, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^[ \t]*\/\/.*$/gm, ' ')
      const n = (code.match(/backdropFilter|backdrop-filter/g) || []).length
      if (n > 0) flous.push(`${chemin} (${n})`)
    }
  }
  parcourir('app')
  verifier('aucun flou de fond dans les écrans', flous.length === 0, flous.join(', '))
}

// ⚠️ AUCUNE IMAGE NE SE DÉCODE SUR LE FIL PRINCIPAL (Alex, 18/08 : « j'ai
// toujours des blocages d'écran côté Yopper, surtout quand je vais plus vite,
// 1 ou 2 sec d'attente et ça débloque. J'ai fait des démos chez des commerçants
// et c'était dérangeant et pas très pro »).
//
// ⚠️ ET CE N'ÉTAIT PAS LE FLOU. Le matin même j'avais retiré 40 `backdrop-filter`
// en croyant tenir la cause : un flou fait SACCADER le défilement, il ne fait
// jamais attendre deux secondes. Je m'étais arrêté au premier suspect
// documenté, et Alex a dû redire trois fois que ça bloquait encore.
//
// Par défaut, un navigateur décode une image SUR LE FIL PRINCIPAL au moment de
// la peindre. Une photo de 1200×675 coûte plusieurs dizaines de millisecondes ;
// sur iPhone, plusieurs qui entrent à l'écran en même temps se décodent à la
// suite et gèlent tout, y compris les touchers. Puis ça repart tout seul : le
// symptôme exact. `decoding="async"` sort ce travail du fil principal,
// `loading="lazy"` évite de décoder ce qui n'est pas encore à l'écran.
//
// ⚠️ ON COMPTE LES BALISES NUES, on ne cherche pas un mot. Une seule image
// oubliée sur la fiche suffit à rendre le gel, et c'est la fiche qui portait
// onze des quarante-cinq.
{
  const nues = []
  const parcourir = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { parcourir(`${dir}/${e.name}`); continue }
      if (!e.name.endsWith('.js')) continue
      const src = readFileSync(`${dir}/${e.name}`, 'utf8')
      let n = 0
      for (const m of src.matchAll(/<img\s[^>]*>/g)) {
        if (!/\bdecoding=/.test(m[0]) || !/\bloading=/.test(m[0])) n++
      }
      if (n > 0) nues.push(`${dir}/${e.name} (${n})`)
    }
  }
  parcourir('app')
  verifier('aucune image ne bloque le fil principal', nues.length === 0, nues.join(', '))
}

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE NOM NE DOIT JAMAIS REPASSER DERRIÈRE LA CARTE BLANCHE
//
// Ce défaut est revenu DEUX FOIS, en mai puis le 09/08, par deux portes
// différentes : d'abord un retrait en pourcentage calculé sur la largeur, puis
// le passage du bureau à 1200 px. Les deux fois, Alex l'a vu avant le banc.
//
// On ne vérifie donc plus qu'une valeur « a l'air raisonnable » : on REFAIT LE
// CALCUL avec les mesures lues dans le code, et on exige que le bloc du nom
// tienne entièrement dans la bande que la carte ne recouvre pas.
// ═══════════════════════════════════════════════════════════════════════════
const srcBanniere = readFileSync(new URL('../lib/../app/components/BanniereCommerce.js', import.meta.url), 'utf8')
const srcCss = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

const retraitMobile = Number(/const RETRAIT_HAUT = (\d+)/.exec(srcBanniere)?.[1])
const retraitBureau = Number(/\.banniere-commerce \{[\s\S]{0,600}?padding-top: (\d+)px !important/.exec(srcCss)?.[1])
const hauteurMobile = Number(/\.fiche-hero \{ height: (\d+)px; \}/.exec(srcTunnel)?.[1])
const hauteurBureau = Number(/\.fiche-hero \{\s*height: (\d+)px !important/.exec(srcCss)?.[1])
const recouvrement = Number(/margin: '-(\d+)px 12px 0'/.exec(srcTunnel)?.[1])

verifier('les mesures du bandeau sont bien relues dans le code',
  [retraitMobile, retraitBureau, hauteurMobile, hauteurBureau, recouvrement].every(n => Number.isFinite(n) && n > 0),
  `${retraitMobile} · ${retraitBureau} · ${hauteurMobile} · ${hauteurBureau} · ${recouvrement}`)

// Le bloc du nom : une ligne de texte plus l'écart et la signature à points.
// Deux lignes sur les noms longs, et c'est le cas qu'il faut tenir.
const blocMobile = 29 * 2 + 10 + 11        // nom 1,5 rem sur deux lignes
const blocBureau = 50 * 2 + 10 + 11        // nom 2,6 rem sur deux lignes
verifier('sur téléphone, un nom sur deux lignes reste au-dessus de la carte',
  retraitMobile + blocMobile <= hauteurMobile - recouvrement,
  `${retraitMobile} + ${blocMobile} contre ${hauteurMobile - recouvrement}`)
verifier('sur ordinateur aussi',
  retraitBureau + blocBureau <= hauteurBureau - recouvrement,
  `${retraitBureau} + ${blocBureau} contre ${hauteurBureau - recouvrement}`)
// ⚠️ ET IL NE DOIT PAS NON PLUS COLLER AU HAUT : c'est la demande d'Alex du
// 16/08. Le nom se place dans la moitié basse de la bande visible.
verifier('et il n’est plus collé en haut du bandeau',
  retraitMobile >= (hauteurMobile - recouvrement) * 0.3
  && retraitBureau >= (hauteurBureau - recouvrement) * 0.3,
  `${retraitMobile} · ${retraitBureau}`)

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ DEUX BLOCS À LA MÊME HEURE NE DOIVENT PAS SE CACHER (Alex, 16/08)
//
// Le regroupement des cours réglait le cas de DOUZE INSCRITS AU MÊME COURS. Il
// ne réglait ni celui de deux SÉANCES différentes au même horaire, ni celui
// d'un cours et d'un rendez-vous individuel : chaque bloc était posé en
// `left: 2, right: 2`, donc au même endroit au pixel près.
//
// ⚠️ CE DÉFAUT NE RESSEMBLE PAS À UN DÉFAUT. La journée a l'air correcte, il
// manque simplement des gens. Alex l'a trouvé sur un cours annoncé « 2/12 »
// alors qu'il l'avait rempli.
// ═══════════════════════════════════════════════════════════════════════════
const srcAgendaBlocs = sansCommentaires(readFileSync(new URL('../app/dashboard/AgendaRdv.js', import.meta.url), 'utf8'))

// La liste est calculée UNE fois : c'est elle qui donne l'indice de colonne, et
// deux appels séparés à `blocsAgenda` rendraient des indices incomparables.
verifier('les blocs d’une cellule sont calculés une seule fois',
  /const blocsIci = blocsAgenda\(rdvsCommencantIci\)/.test(srcAgendaBlocs))
egal('et plus aucun appel séparé ne subsiste',
  (srcAgendaBlocs.match(/blocsAgenda\(/g) || []).length, 1)

// ⚠️ ANCRÉ SUR L'ABSENCE DE `right`, PAS SUR LA PRÉSENCE DE `left`. Une largeur
// calculée qui cohabiterait avec `right: 2` serait ignorée en silence.
verifier('aucun bloc ne s’étale plus sur toute la cellule',
  !/top: 1, left: 2, right: 2/.test(srcAgendaBlocs))
verifier('les séances prennent leur colonne',
  /top: 1, \.\.\.colonneSeance/.test(srcAgendaBlocs))
verifier('les rendez-vous individuels aussi',
  /top: 1, \.\.\.colonneRdv/.test(srcAgendaBlocs))

// La largeur se partage entre TOUS les blocs de la cellule, séances et
// rendez-vous confondus : compter les séances seules laisserait un cours et une
// coupe l'un sur l'autre.
verifier('la largeur se partage entre tous les blocs de la cellule',
  /const nbColonnes = Math\.max\(1, blocsIci\.length\)/.test(srcAgendaBlocs))

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ UN COURS EST UN COURS, QUEL QUE SOIT LE PRATICIEN (Alex, 16/08)
//
// Son cours de douze s'affichait « 2/12 » alors qu'il était PLEIN : dix
// inscrites portaient la praticienne, deux avaient réservé « sans préférence »,
// et l'agenda en faisait deux séances.
//
// ⚠️ CE N'ÉTAIT PAS UN DÉFAUT D'AFFICHAGE, C'ÉTAIT DEUX DÉFINITIONS DE LA MÊME
// CHOSE. La capacité est portée par la PRESTATION, et le garde-fou de
// réservation compte donc sur date + heure + prestation : c'est lui qui a
// correctement refusé la treizième. L'agenda ajoutait le praticien, il ne
// pouvait pas tomber sur le même nombre.
//
// On EXÉCUTE la règle sur le cas réel, relevé en base ce jour-là.
// ═══════════════════════════════════════════════════════════════════════════
const COURS_D_ALEX = [
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `p${i}`, date_rdv: '2026-08-17', heure_debut: '10:00', heure_fin: '11:00',
    prestation_id: 'yoga', praticien_id: 'pr-emily', capacite_creneau: 12, place_no: i + 1,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `n${i}`, date_rdv: '2026-08-17', heure_debut: '10:00', heure_fin: '11:00',
    prestation_id: 'yoga', praticien_id: null, capacite_creneau: 12, place_no: 11 + i,
  })),
]
const blocsDuCours = blocsAgenda(COURS_D_ALEX)
egal('les douze inscrites tiennent en UNE seule séance', blocsDuCours.length, 1)
egal('et le cours s’annonce plein', blocsDuCours[0]?.inscrits.length, 12)
egal('la capacité reste celle de la prestation', blocsDuCours[0]?.capacite, 12)

// ⚠️ CE QUI NE DOIT PAS AVOIR CHANGÉ. Deux prestations différentes au même
// horaire restent deux séances : c'est le seul découpage qui ait un sens, la
// capacité étant portée par la prestation.
egal('deux cours différents au même horaire font toujours deux séances',
  blocsAgenda([
    { id: 'a', date_rdv: '2026-08-17', heure_debut: '10:00', prestation_id: 'yoga', capacite_creneau: 12, place_no: 1 },
    { id: 'b', date_rdv: '2026-08-17', heure_debut: '10:00', prestation_id: 'pilates', capacite_creneau: 8, place_no: 1 },
  ]).length, 2)
// Et un rendez-vous individuel ne devient jamais une séance, quel que soit le
// praticien : c'est ce qui protège tous les métiers en tête-à-tête.
egal('une coupe reste un rendez-vous',
  blocsAgenda([{ id: 'c', date_rdv: '2026-08-17', heure_debut: '10:00', prestation_id: 'coupe', capacite_creneau: 1, place_no: 1 }])[0]?.type,
  'rdv')

// ⚠️ LES DEUX REGROUPEMENTS DOIVENT DIRE LA MÊME CHOSE. `regrouperEnSeances`
// portait la même clé, praticien compris : la laisser diverger, c'est rouvrir
// le défaut qu'on vient de fermer, avec deux définitions dans un seul fichier.
egal('l’autre regroupement suit la même règle',
  regrouperEnSeances(COURS_D_ALEX).length, 1)
egal('et compte les mêmes inscrites',
  regrouperEnSeances(COURS_D_ALEX)[0]?.inscrits.length, 12)

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LES COMPTEURS NOMMENT LEUR JOUR (Alex, 16/08)
//
// Il annule un rendez-vous, en honore un autre, et « À venir » comme
// « Honorés » restent à zéro. Le calcul était JUSTE, et c'est bien ça le
// problème : les quatre cartes ne décrivent qu'UN SEUL JOUR, celui du
// sélecteur, alors que l'agenda juste dessous montre la SEMAINE ENTIÈRE. Il
// agissait sur lundi pendant que les compteurs parlaient de samedi.
//
// ⚠️ Un compteur qui ne nomme pas sa période ment par omission, et c'est la
// pire forme : il a l'autorité d'un chiffre.
// ═══════════════════════════════════════════════════════════════════════════
const { libellePeriodeStats } = await import('../lib/agenda-bloc.js')

// Le cas exact d'Alex : on est samedi, ses rendez-vous sont lundi.
egal('le jour du jour se nomme, ET porte sa date',
  libellePeriodeStats({ jour: '2026-08-16', aujourdhui: '2026-08-16' }),
  'Aujourd’hui · dimanche 16 août')
// ⚠️ La date DERRIÈRE « Aujourd'hui » n'est pas décorative : elle permet au
// commerçant qui revient après une nuit de vérifier d'un regard que l'écran ne
// lui montre pas la veille.
verifier('« Aujourd’hui » ne reste jamais seul',
  /\d/.test(libellePeriodeStats({ jour: '2026-08-16', aujourdhui: '2026-08-16' })))

egal('demain se nomme aussi',
  libellePeriodeStats({ jour: '2026-08-17', aujourdhui: '2026-08-16' }),
  'Demain · lundi 17 août')
// ⚠️ Le passage d'un mois à l'autre est le cas où un calcul de « demain » se
// trompe le plus souvent, et il n'arrive qu'une fois par mois : personne ne le
// verrait avant longtemps.
egal('demain traverse la fin du mois',
  libellePeriodeStats({ jour: '2026-09-01', aujourdhui: '2026-08-31' }),
  'Demain · mardi 1 septembre')

egal('un autre jour porte son nom en toutes lettres',
  libellePeriodeStats({ jour: '2026-08-20', aujourdhui: '2026-08-16' }),
  'Jeudi 20 août')
egal('l’historique le dit',
  libellePeriodeStats({ jour: '2026-08-16', aujourdhui: '2026-08-16', historique: true }),
  'Historique')

// Rendre une chaîne vide permet à l'écran de masquer la ligne entière plutôt
// que d'afficher un intitulé qui pend.
egal('sans jour, aucun intitulé', libellePeriodeStats({ jour: null, aujourdhui: '2026-08-16' }), '')
egal('et rien du tout ne casse rien', libellePeriodeStats(), '')

// ⚠️ AUCUNE HORLOGE DANS CETTE FONCTION. Un banc qui dépend du calendrier finit
// toujours par mentir : celui-ci a déjà pourri une fois, le 05/08.
const srcBloc = readFileSync(new URL('../lib/agenda-bloc.js', import.meta.url), 'utf8')
verifier('le libellé ne lit jamais l’heure de la machine',
  !/new Date\(\)/.test(srcBloc))

// Les deux onglets l'affichent : ils ont le même schéma, un compteur d'un jour
// au-dessus d'une vue plus large.
const srcTableauStats = sansCommentaires(readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'))
egal('les deux onglets nomment leur période',
  (srcTableauStats.match(/\{periodeStats && \(/g) || []).length, 2)
verifier('et l’intitulé vient bien du jour actif',
  /libellePeriodeStats\(\{ jour: jourActif, aujourdhui: todayKey, historique: modeHistorique \}\)/.test(srcTableauStats))

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ L'AGENDA DOIT POUVOIR SE DÉROULER JUSQU'AU BOUT (Alex, 16/08)
//
// « L'agenda accroche au scroll, pas moyen d'aller jusqu'au bout. » Deux
// causes, toutes deux consignées après le diagnostic iPhone du 16/07 :
//
//   • `vh` vaut le GRAND viewport, celui du téléphone barre d'adresse
//     RÉTRACTÉE. Tant que la barre est visible, 70vh dépasse le bas de l'écran,
//     et comme c'est un conteneur INTERNE qui défile, la page ne peut pas
//     descendre pour révéler la fin. On ne peut littéralement pas l'atteindre.
//     `vh` se recalcule en plus quand la barre se rétracte : reflow au milieu
//     du geste, donc accrochage. `svh` est stable.
//
//   • `-webkit-overflow-scrolling: touch` était nécessaire avant iOS 13 pour
//     l'inertie, native depuis. Il PIÈGE `position: fixed` à l'intérieur du
//     conteneur, défaut déjà corrigé le 12/08 sur la modale de détail.
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ ET FINALEMENT, PLUS AUCUNE HAUTEUR (demande d'Alex, 16/08). `svh` avait
// supprimé le débordement sous la barre d'adresse, mais la cause de fond
// restait : DEUX ZONES DE DÉFILEMENT IMBRIQUÉES, la page et la grille. Le doigt
// ne sait jamais laquelle il pilote, et à la frontière le geste se perd. Un
// agenda se déroule d'un seul geste.
const srcAgendaScroll = readFileSync(new URL('../app/dashboard/AgendaRdv.js', import.meta.url), 'utf8')
verifier('la grille et l’historique n’ont plus de hauteur maximale',
  !/maxHeight: '70s?vh'/.test(srcAgendaScroll))
// ⚠️ LA MODALE GARDE SON PROPRE DÉFILEMENT, ET C'EST NORMAL. C'est une couche
// en `position: fixed` par-dessus la page, pas un morceau de son flux : la
// règle du défilement unique vaut pour ce qui vit DANS la page. Mes deux
// premiers tests l'avaient oublié et rougissaient sur du code correct.
egal('une seule zone garde un défilement interne',
  (srcAgendaScroll.match(/overflowY: 'auto'/g) || []).length, 1)
verifier('et c’est la modale, pas la grille',
  /maxHeight: '80svh', overflowY: 'auto'/.test(srcAgendaScroll))
verifier('plus de défilement tactile hérité d’avant iOS 13',
  !/WebkitOverflowScrolling/.test(srcAgendaScroll))
// ⚠️ LE DÉFILEMENT HORIZONTAL RESTE : sept colonnes ne tiennent pas dans 375 px.
// Il ne recrée pas de zone imbriquée, le conteneur mesurant exactement son
// contenu en hauteur — il n'a rien à faire défiler verticalement.
verifier('mais la semaine défile toujours horizontalement sur petit écran',
  /overflowX: scrollH \? 'auto' : undefined/.test(srcAgendaScroll))
// ⚠️ `overflow: hidden` SUR LA CARTE PIÉGEAIT `position: sticky`. Une boîte dont
// l'`overflow` n'est pas `visible` devient le conteneur de référence d'un enfant
// collant : l'en-tête des jours aurait cessé de coller, sans erreur ni
// avertissement, et les noms de jours auraient disparu dès qu'on descend.
verifier('la carte ne piège plus l’en-tête collant',
  !/borderRadius: 12, border: `1px solid \$\{T\.pale\}`, overflow: 'hidden'/.test(srcAgendaScroll))
verifier('et l’en-tête des jours colle toujours',
  /position: 'sticky', top: 0/.test(srcAgendaScroll))

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LES COMPTEURS SUIVENT CE QUE L'AGENDA MONTRE (Alex, 16/08)
//
// L'intitulé posé le matin même a révélé pire que ce qu'il corrigeait : dans
// l'onglet Rendez-vous, la date des compteurs NE POUVAIT PAS CHANGER. Le
// sélecteur de jours n'y est pas affiché, l'agenda a sa propre navigation, et
// les deux ne se parlaient pas. Les compteurs étaient bloqués sur aujourd'hui
// à vie, et personne ne pouvait s'en apercevoir avant qu'ils nomment leur jour.
// ═══════════════════════════════════════════════════════════════════════════
verifier('l’agenda annonce la fenêtre qu’il affiche',
  /onFenetreChange\(\{[\s\S]{0,160}?debut: joursAffiches\[0\]\.iso/.test(srcAgendaScroll))
// ⚠️ ANCRÉ SUR LA GARDE, ET PAS SEULEMENT SUR L'APPEL. Mesuré par mutation :
// remplacer la condition de sortie par un `return` inconditionnel rendait
// l'appel INATTEIGNABLE sans le supprimer, et le test restait vert. Un banc qui
// lit du code ne voit pas du code mort ; on vérifie donc que la seule raison de
// ne rien annoncer reste « il n'y a rien à annoncer ».
verifier('et il ne se tait que s’il n’a rien à dire',
  /if \(!onFenetreChange \|\| joursAffiches\.length === 0\) return/.test(srcAgendaScroll))
verifier('et il annonce sa FIN, pas seulement son premier jour',
  /fin: joursAffiches\[joursAffiches\.length - 1\]\.iso/.test(srcAgendaScroll))
verifier('les compteurs des rendez-vous lisent cette fenêtre',
  /r\.date_rdv >= fenetreRdv\.debut && r\.date_rdv <= fenetreRdv\.fin/.test(srcTableauStats))
// ⚠️ LA FONCTION QUI REÇOIT LA FENÊTRE DOIT ÊTRE STABLE ET NE RIEN RÉÉCRIRE À
// VALEUR ÉGALE. L'agenda l'annonce dans un effet qui en dépend : une fonction
// recréée à chaque rendu relancerait l'effet à chaque rendu, et poser un objet
// neuf à valeur identique provoquerait un rendu de plus. Boucle infinie, écran
// figé, et rien dans le code ne ressemblerait à une erreur.
verifier('la page reçoit la fenêtre par une fonction stable',
  /const majFenetreAgenda = useCallback\(/.test(srcTableauStats))
verifier('et ne réécrit pas la fenêtre à valeur égale',
  /prev\.debut === f\.debut && prev\.fin === f\.fin/.test(srcTableauStats))

// Une fenêtre de plusieurs jours se nomme comme telle : au singulier, on
// recréerait le malentendu qu'on vient de corriger.
egal('une semaine se nomme comme une semaine',
  libellePeriodeStats({ jour: '2026-08-17', fin: '2026-08-23', aujourdhui: '2026-08-16' }),
  'Semaine du 17 au 23 août')
// ⚠️ Le mois qui tourne au milieu de la semaine : il faut alors les DEUX mois,
// et ce cas ne se présente qu'une fois par mois.
egal('et une semaine à cheval sur deux mois porte les deux',
  libellePeriodeStats({ jour: '2026-08-30', fin: '2026-09-05', aujourdhui: '2026-08-16' }),
  'Semaine du 30 août au 5 septembre')
// Une fenêtre d'un seul jour reste un jour : c'est la vue Jour de l'agenda.
egal('une fenêtre d’un seul jour garde son nom de jour',
  libellePeriodeStats({ jour: '2026-08-16', fin: '2026-08-16', aujourdhui: '2026-08-16' }),
  'Aujourd’hui · dimanche 16 août')

// ═══════════════════════════════════════════════════════════════════════════
// CE QU'UN CRÉNEAU ACCEPTE (07/09, défaut trouvé par Alex)
//
// 🔴 UN CRÉNEAU NE DISAIT RIEN DES PRESTATIONS. Chez Centre Respire, la plage
// du lundi 08:00-18:00 acceptait aussi bien une Séance de Reiki (une personne)
// qu'un Cours de Yoga (douze) : le premier client décidait de la nature du
// créneau, et le cours de yoga était proposé cinquante fois par semaine.
// ═══════════════════════════════════════════════════════════════════════════
{
  const K_YOGA  = { id: 'k-yoga',  jour_semaine: 'lundi', date_specifique: null, heure_debut: '10:00:00', heure_fin: '11:00:00', actif: true }
  const K_LARGE = { id: 'k-large', jour_semaine: 'lundi', date_specifique: null, heure_debut: '08:00:00', heure_fin: '18:00:00', actif: true }
  const CRENEAUX = [K_YOGA, K_LARGE]
  const LIAISONS = [{ creneau_id: 'k-yoga', prestation_id: 'yoga' }]

  // ── La règle de base ────────────────────────────────────────────────────
  verifier('le créneau du yoga accepte le yoga', creneauAccepte('k-yoga', 'yoga', LIAISONS))
  verifier('il n’accepte pas le reiki', !creneauAccepte('k-yoga', 'reiki', LIAISONS))

  // 🔴 LA MOITIÉ DE LA RÈGLE QUE J'AVAIS OUBLIÉE, ET QUE LE BANC A DITE. Sans
  // elle, cocher « Yoga » sur la plage de 10h ne changeait RIEN : la plage
  // large n'avait rien de coché, donc elle acceptait le yoga à toute heure. Le
  // commerçant aurait fait le réglage et constaté qu'il ne servait à rien.
  verifier('🔴 une plage libre n’accepte PAS ce qui est rattaché ailleurs',
    !creneauAccepte('k-large', 'yoga', LIAISONS))
  verifier('mais elle accepte tout le reste', creneauAccepte('k-large', 'reiki', LIAISONS))

  // ⚠️ SANS AUCUNE LIAISON, RIEN NE CHANGE. La garantie de non-régression pour
  // tout le parc : douze créneaux actifs le jour de la migration.
  verifier('⚠️ sans liaison, la plage accepte tout', creneauAccepte('k-large', 'yoga', []))
  // 🔴 ET UNE LIAISON NON CHARGÉE OUVRE, ELLE NE FERME PAS. Fermer sur une
  // ignorance viderait tous les agendas sans une seule erreur.
  verifier('🔴 liaisons non chargées : on ouvre, on ne ferme pas',
    creneauAccepte('k-large', 'yoga', null) && creneauAccepte('k-yoga', 'reiki', undefined))

  // ── Le filtre de l'écran ────────────────────────────────────────────────
  egal('la fiche ne propose le yoga que sur sa plage',
    creneauxPourPrestation(CRENEAUX, 'yoga', LIAISONS).map(c => c.id), ['k-yoga'])
  egal('et le reiki que sur la plage libre',
    creneauxPourPrestation(CRENEAUX, 'reiki', LIAISONS).map(c => c.id), ['k-large'])
  // ⚠️ L'écran ne juge pas ce qu'il ne connaît pas : sans prestation choisie,
  // il montre l'agenda tel quel plutôt que de cacher des plages au hasard.
  egal('sans prestation choisie, on ne cache rien',
    creneauxPourPrestation(CRENEAUX, null, LIAISONS).map(c => c.id), ['k-yoga', 'k-large'])

  // ── UNE PRESTATION VIT SUR PLUSIEURS PLAGES, PLUSIEURS JOURS, PLUSIEURS
  //    PRATICIENS (question d'Alex, 07/09) ─────────────────────────────────
  // Rien ne limite une prestation à une seule plage : la liaison est un couple
  // (plage, prestation), et une plage porte son jour et son praticien.
  {
    const LUNDI  = { id: 'k-lun', jour_semaine: 'lundi',    date_specifique: null, heure_debut: '10:00:00', heure_fin: '11:00:00', actif: true, praticien_id: 'sophie' }
    const MERCRE = { id: 'k-mer', jour_semaine: 'mercredi', date_specifique: null, heure_debut: '19:00:00', heure_fin: '20:00:00', actif: true, praticien_id: 'marc' }
    const DEUX = [
      { creneau_id: 'k-lun', prestation_id: 'yoga' },
      { creneau_id: 'k-mer', prestation_id: 'yoga' },
    ]
    verifier('le même cours vit sur deux plages', creneauAccepte('k-lun', 'yoga', DEUX) && creneauAccepte('k-mer', 'yoga', DEUX))
    egal('et la fiche propose les deux',
      creneauxPourPrestation([LUNDI, MERCRE], 'yoga', DEUX).map(c => c.id), ['k-lun', 'k-mer'])
    // Deux jours, deux praticiens : c'est la plage qui les porte, la liaison ne
    // fait que dire ce qui s'y donne.
    egal('deux jours différents', [LUNDI.jour_semaine, MERCRE.jour_semaine], ['lundi', 'mercredi'])
    egal('deux praticiens différents', [LUNDI.praticien_id, MERCRE.praticien_id], ['sophie', 'marc'])
    // ⚠️ ET UNE PLAGE ACCEPTE PLUSIEURS PRESTATIONS INDIVIDUELLES : un salon
    // propose coupe, couleur et head spa toute la journée, et le client choisit
    // son heure. Une seule s'y donne à la fois, `conflitReservation` s'en charge.
    const MULTI_SOLO = [
      { creneau_id: 'k-lun', prestation_id: 'coupe' },
      { creneau_id: 'k-lun', prestation_id: 'couleur' },
    ]
    verifier('une plage accepte plusieurs prestations individuelles',
      creneauAccepte('k-lun', 'coupe', MULTI_SOLO) && creneauAccepte('k-lun', 'couleur', MULTI_SOLO))
    verifier('et refuse le reste', !creneauAccepte('k-lun', 'reiki', MULTI_SOLO))
  }

  // ── 🔴 JUSQU'À QUAND ON PEUT RÉSERVER (Alex, 07/09) ─────────────────────
  // Soixante jours étaient écrits en dur, et ça bloquait déjà les abonnements :
  // un carnet de dix séances hebdomadaires couvre soixante-dix jours.
  {
    egal('le défaut reste soixante jours', horizonRdv({}), 60)
    egal('et vaut soixante pour tout le parc', HORIZON_RDV_DEFAUT, 60)
    egal('un horizon choisi est respecté', horizonRdv({ rdv_horizon_jours: 180 }), 180)
    egal('le maximum passe', horizonRdv({ rdv_horizon_jours: 365 }), 365)
    egal('le minimum aussi', horizonRdv({ rdv_horizon_jours: 7 }), 7)
    // 🔴 LE PIÈGE DU ZÉRO. `Number(null)` vaut 0 : sans le contrôle des bornes,
    // un horizon absent fermerait l'agenda au lieu de le laisser à soixante
    // jours, et plus personne ne pourrait réserver nulle part.
    egal('🔴 un horizon absent ne ferme pas l’agenda', horizonRdv({ rdv_horizon_jours: null }), 60)
    egal('🔴 zéro non plus', horizonRdv({ rdv_horizon_jours: 0 }), 60)
    egal('un horizon négatif retombe sur le défaut', horizonRdv({ rdv_horizon_jours: -30 }), 60)
    egal('un horizon délirant aussi', horizonRdv({ rdv_horizon_jours: 5000 }), 60)
    egal('un texte aussi', horizonRdv({ rdv_horizon_jours: 'six mois' }), 60)
    // ⚠️ ET UN COMMERÇANT ABSENT NE FERME RIEN : c'est exactement l'état de la
    // fiche pendant le chargement, et entre l'étape 1 et l'étape 2 de la
    // migration, où la vue publique ne porte pas encore la colonne.
    egal('⚠️ un commerçant absent garde le défaut', horizonRdv(null), 60)
    egal('une colonne absente de la vue garde le défaut', horizonRdv({ nom: 'Ciseaux' }), 60)
    // Un carnet de dix séances hebdomadaires : c'est le cas qui a motivé le
    // réglage, il doit tenir dans au moins un des choix proposés.
    verifier('🔴 un carnet de dix séances hebdomadaires tient dans un choix proposé',
      HORIZONS_RDV.some(h => h.jours >= 70))
    verifier('chaque choix porte un libellé lisible',
      HORIZONS_RDV.length >= 3 && HORIZONS_RDV.every(h => typeof h.libelle === 'string' && h.libelle.length > 2))
    verifier('et tous tiennent dans les bornes de la base',
      HORIZONS_RDV.every(h => h.jours >= 7 && h.jours <= 365))
  }

  // ── 🔴 UNE PLAGE HORS DES HEURES D'OUVERTURE (Alex, 07/09) ──────────────
  // Le défaut le plus silencieux de l'écran : une plage 20:00-22:00 dans un
  // commerce qui ferme à 19h s'enregistrait sans un mot et ne proposait JAMAIS
  // rien, parce que le moteur écrête aux horaires réels.
  {
    const H = { lundi: { ouvert: true, debut: '09:00', fin: '19:00' } }
    const dehors = (heureDebut, heureFin, horairesDetail = H, jour = 'lundi') =>
      creneauHorsOuverture({ jour, heureDebut, heureFin, horairesDetail })

    egal('une plage dans les heures ne dit rien', dehors('09:00', '18:00'), null)
    egal('une plage exactement aux heures ne dit rien', dehors('09:00', '19:00'), null)
    egal('🔴 une plage du soir est signalée', dehors('20:00', '22:00')?.raison, 'hors_ouverture')
    egal('🔴 une plage du petit matin aussi', dehors('06:00', '08:00')?.raison, 'hors_ouverture')
    egal('⚠️ une plage à cheval est signalée autrement', dehors('17:00', '21:00')?.raison, 'deborde')
    egal('à cheval au début aussi', dehors('07:00', '12:00')?.raison, 'deborde')
    // ⚠️ LE MESSAGE CITE LES HEURES. Dire « c'est hors horaires » sans dire
    // lesquels oblige le commerçant à aller chercher ailleurs.
    egal('et il dit lesquelles', dehors('20:00', '22:00')?.plages, ['09:00–19:00'])

    // Un jour fermé se signale à part : l'écran a déjà son propre message.
    egal('un jour fermé se dit à part',
      dehors('10:00', '12:00', { lundi: { ouvert: false } })?.raison, 'jour_ferme')

    // ⚠️ SANS HORAIRES CONNUS, ON NE JUGE PAS. Avertir sur une ignorance
    // apprendrait à cliquer « continuer » sans lire.
    egal('sans horaires, aucun avertissement', dehors('20:00', '22:00', {}), null)
    egal('sans horaires du tout non plus', dehors('20:00', '22:00', null), null)
    egal('un jour absent des horaires ne dit rien', dehors('20:00', '22:00', H, 'dimanche'), null)

    // Les commerces à deux services : la plage doit tenir dans l'un OU l'autre.
    const DEUX = { lundi: { ouvert: true, debut: '11:00', fin: '14:00', debut2: '18:00', fin2: '22:00' } }
    egal('le service du midi passe', dehors('11:00', '14:00', DEUX), null)
    egal('celui du soir aussi', dehors('18:00', '22:00', DEUX), null)
    egal('🔴 une plage à cheval sur la coupure est signalée',
      dehors('13:00', '19:00', DEUX)?.raison, 'deborde')
    egal('et l’après-midi fermé est entièrement dehors',
      dehors('15:00', '17:00', DEUX)?.raison, 'hors_ouverture')
    egal('les deux services sont cités', dehors('15:00', '17:00', DEUX)?.plages,
      ['11:00–14:00', '18:00–22:00'])

    // Une saisie incohérente est déjà refusée par une autre garde : celle-ci
    // ne doit pas s'en mêler et ajouter un second message.
    egal('une fin avant le début ne dit rien ici', dehors('18:00', '10:00'), null)

    // ── COPIER UNE PLAGE VERS UN AUTRE JOUR (Alex, 07/09) ─────────────────
    // 🔴 Centre Respire est à Mettet le lundi jusqu'à 17:00 et à Nalinnes le
    // mercredi jusqu'à 12:00 : copier le lundi vers le mercredi y posait une
    // plage 08:00-17:00, cinq heures au-delà de la fermeture, SANS UN MOT.
    // L'alerte existait sur la CRÉATION, pas sur la COPIE : le frère non traité.
    {
      const MERCREDI = { ouvert: true, debut: '08:00', fin: '12:00' }
      const plage = (a, b) => ({ heure_debut: a, heure_fin: b })

      egal('🔴 une plage trop longue est raccourcie',
        ajusterPlagePourJour(plage('08:00:00', '17:00:00'), MERCREDI),
        { statut: 'raccourcie', raison: null, debut: '08:00', fin: '12:00', morceaux: [{ debut: '08:00', fin: '12:00' }] })
      egal('une plage qui tient ne bouge pas',
        ajusterPlagePourJour(plage('09:00:00', '11:00:00'), MERCREDI),
        { statut: 'inchangee', raison: null, debut: '09:00', fin: '11:00', morceaux: [{ debut: '09:00', fin: '11:00' }] })

      // 🔴 DEUX MOTIFS DE REFUS QUI NE SE CONFONDENT PAS (Alex, 07/09). Mon
      // premier message disait « tu es fermé » dans les deux cas, et il a
      // répondu « je ne comprends pas, je ne suis pas fermé le mercredi ». Il
      // avait raison : le mercredi ferme à 12:00, ce n'est pas être fermé.
      const apresFermeture = ajusterPlagePourJour(plage('14:00:00', '17:00:00'), MERCREDI)
      egal('🔴 une plage après la fermeture est écartée', apresFermeture.statut, 'ignoree')
      egal('🔴 et le motif n’est PAS « jour fermé »', apresFermeture.raison, 'hors_ouverture')
      egal('⚠️ le message peut citer les heures réelles', apresFermeture.heures, ['08:00–12:00'])

      const jourFerme = ajusterPlagePourJour(plage('09:00:00', '11:00:00'), { ouvert: false })
      egal('un jour fermé n’en reçoit aucune', jourFerme.statut, 'ignoree')
      egal('et là, le motif est bien « jour fermé »', jourFerme.raison, 'jour_ferme')

      // ⚠️ HORAIRES INCONNUS : ON NE TOUCHE À RIEN. Ajuster sur une ignorance
      // raccourcirait des plages parfaitement valables.
      egal('⚠️ sans horaires, la plage est copiée telle quelle',
        ajusterPlagePourJour(plage('08:00:00', '17:00:00'), null),
        { statut: 'inchangee', raison: null, debut: '08:00', fin: '17:00', morceaux: [{ debut: '08:00', fin: '17:00' }] })
      // Un commerce à deux services : chaque service touché donne un morceau.
      const DEUX = { ouvert: true, debut: '11:00', fin: '14:00', debut2: '18:00', fin2: '22:00' }
      egal('⚠️ une plage du soir suit le service du soir',
        ajusterPlagePourJour(plage('17:00:00', '23:00:00'), DEUX),
        { statut: 'raccourcie', raison: null, debut: '18:00', fin: '22:00', morceaux: [{ debut: '18:00', fin: '22:00' }] })
      egal('et une plage du midi le service du midi',
        ajusterPlagePourJour(plage('10:00:00', '13:00:00'), DEUX),
        { statut: 'raccourcie', raison: null, debut: '11:00', fin: '13:00', morceaux: [{ debut: '11:00', fin: '13:00' }] })

      // 🔴 LE DÉFAUT VU PAR ALEX LE 08/09, CAPTURE À L'APPUI. La Table d'Essai
      // ouvre 11:00-13:00 puis 18:00-22:00. Copier un créneau 08:00-23:00 y
      // annonçait « devient 18:00–22:00 » : le service du MIDI disparaissait,
      // parce que la fonction ne gardait que le recouvrement le plus long.
      const journee = ajusterPlagePourJour(plage('08:00:00', '23:00:00'), DEUX)
      egal('🔴 une plage sur la journée entière donne UN MORCEAU PAR SERVICE',
        journee.morceaux,
        [{ debut: '11:00', fin: '14:00' }, { debut: '18:00', fin: '22:00' }])
      egal('⚠️ et elle est annoncée comme raccourcie', journee.statut, 'raccourcie')
      // ⚠️ ET LES MORCEAUX SONT DANS L'ORDRE DE LA JOURNÉE, quel que soit
      // l'ordre des services : le message se lit de gauche à droite.
      egal('⚠️ le premier morceau est le plus matinal',
        ajusterPlagePourJour(plage('08:00:00', '23:00:00'),
          { ouvert: true, debut: '18:00', fin: '22:00', debut2: '11:00', fin2: '14:00' }).morceaux[0],
        { debut: '11:00', fin: '14:00' })
      // ⚠️ Le creux entre deux services n'est PAS un morceau : personne ne
      // commande à 15h chez un restaurant fermé l'après-midi.
      egal('⚠️ le creux entre les services n’en est pas un',
        journee.morceaux.some(m => m.debut === '14:00' || m.fin === '18:00'), false)
      const entreDeux = ajusterPlagePourJour(plage('15:00:00', '17:00:00'), DEUX)
      egal('l’après-midi fermé n’en reçoit aucune', entreDeux.statut, 'ignoree')
      egal('⚠️ et les DEUX services sont cités', entreDeux.heures, ['11:00–14:00', '18:00–22:00'])
      egal('une plage incohérente est écartée',
        ajusterPlagePourJour(plage('17:00:00', '09:00:00'), MERCREDI).raison,
        'heures_invalides')
    }

    // 🔴 LE CAS DE CENTRE RESPIRE, TROUVÉ PAR ALEX EN TESTANT (07/09). Ce
    // commerce a répondu « je change d'endroit » : ses horaires vivent dans ses
    // EMPLACEMENTS, et `horaires_detail` n'en est qu'un dérivé qui peut avoir
    // vieilli. Il ouvrait le mardi jusqu'à 20:00 sur sa salle, et l'alerte
    // annonçait 17:00 en lisant la grille.
    //
    // ⚠️ UNE ALERTE QUI CITE UN CHIFFRE FAUX EST PIRE QU'UNE ALERTE ABSENTE :
    // on la croit, et on va « corriger » un horaire qui était bon.
    {
      const LIEUX = [
        { type: 'hebdo', actif: true, jour_semaine: 'lundi', heure_debut: '08:00:00', heure_fin: '17:00:00' },
        { type: 'hebdo', actif: true, jour_semaine: 'mardi', heure_debut: '08:00:00', heure_fin: '20:00:00' },
      ]
      const depuisLieux = horairesDepuisLieux(LIEUX)
      egal('le mardi des emplacements va bien jusqu’à 20:00', depuisLieux.mardi?.fin, '20:00')
      // Le cours de pilates de 18:00 à 19:00, celui qu'Alex créait.
      egal('🔴 un cours de 18h à 19h le mardi ne déclenche RIEN',
        creneauHorsOuverture({ jour: 'mardi', heureDebut: '18:00', heureFin: '19:00', horairesDetail: depuisLieux }),
        null)
      // Et le lundi, qui ferme à 17:00, la même plage est bien signalée.
      egal('mais le lundi, qui ferme à 17h, elle l’est',
        creneauHorsOuverture({ jour: 'lundi', heureDebut: '18:00', heureFin: '19:00', horairesDetail: depuisLieux })?.raison,
        'hors_ouverture')
      // ⚠️ Un emplacement présent SANS heures déclarées ne permet de juger de
      // rien : mieux vaut se taire que d'inventer des bornes.
      const SANS_HEURES = [{ type: 'hebdo', actif: true, jour_semaine: 'jeudi' }]
      egal('⚠️ un emplacement sans heures ne fait juger de rien',
        creneauHorsOuverture({ jour: 'jeudi', heureDebut: '22:00', heureFin: '23:00', horairesDetail: horairesDepuisLieux(SANS_HEURES) }),
        null)
    }
  }

  // ── 🔴 UN SEUL COURS PAR PLAGE (Alex, 07/09) ────────────────────────────
  // À 10h il y a UN cours, pas deux. En accepter deux ferait décider le premier
  // client lequel a lieu : le défaut du 07/09 reproduit à l'intérieur du
  // réglage censé le corriger.
  {
    const CATALOGUE = [
      { id: 'yoga',    nom: 'Cours de Yoga',    capacite: 12 },
      { id: 'pilates', nom: 'Cours de pilates', capacite: 10 },
      { id: 'reiki',   nom: 'Séance de Reiki',  capacite: 1 },
      { id: 'coupe',   nom: 'Coupe',            capacite: 1 },
    ]
    egal('aucun cours coché', coursDejaCoche([], CATALOGUE), null)
    egal('que des soins individuels : aucun cours',
      coursDejaCoche(['reiki', 'coupe'], CATALOGUE), null)
    egal('🔴 un cours coché est reconnu',
      coursDejaCoche(['reiki', 'yoga'], CATALOGUE)?.id, 'yoga')
    // ⚠️ Le piège du zéro : une capacité absente n'est pas un cours.
    egal('une capacité absente n’est pas un cours',
      coursDejaCoche(['inconnu'], CATALOGUE), null)
    egal('une liste absente ne dit rien', coursDejaCoche(null, CATALOGUE), null)
    egal('un catalogue absent ne dit rien', coursDejaCoche(['yoga'], null), null)
  }

  // ── L'avertissement du commerçant ───────────────────────────────────────
  verifier('un cours rattaché nulle part est signalé', prestationSansCreneauDedie('pilates', LIAISONS))
  verifier('un cours rattaché ne l’est pas', !prestationSansCreneauDedie('yoga', LIAISONS))

  // ── La garde du serveur ─────────────────────────────────────────────────
  const garde = (prestationId, debutMin, finMin, liaisons = LIAISONS) =>
    prestationAutoriseeSurCreneaux({
      creneaux: CRENEAUX, liaisons, prestationId,
      dateStr: '2026-09-07', jour: 'lundi', debutMin, finMin,
    })

  verifier('le yoga passe à 10h', garde('yoga', 600, 660))
  // 🔴 ET LE SERVEUR REFUSE UN SOIN À L'HEURE DU COURS. L'écran ne le propose
  // plus, mais un écran ne décide de rien.
  verifier('🔴 le serveur refuse un soin à l’heure du cours', !garde('reiki', 600, 660))
  verifier('même à cheval sur le début du cours', !garde('reiki', 570, 630))
  verifier('même à cheval sur la fin', !garde('reiki', 630, 690))
  verifier('juste avant le cours, ça passe', garde('reiki', 540, 600))
  verifier('juste après aussi', garde('reiki', 660, 720))
  // ⚠️ ET SANS AUCUNE LIAISON, PERSONNE NE RÉSERVE RIEN À PERSONNE : le parc
  // entier continue comme avant.
  verifier('⚠️ sans liaison, aucune heure n’est réservée', garde('reiki', 600, 660, []))
  // 🔴 LA GARDE QUI COMPTE. 13h est bien dans une plage du lundi, mais pas dans
  // une plage QUI ACCEPTE le yoga. Sans le contrôle de l'heure, elle serait
  // décorative : un créneau du lundi accepte bien le yoga... à 10h.
  verifier('🔴 le yoga est refusé à 13h', !garde('yoga', 780, 840))
  verifier('le yoga est refusé s’il déborde de sa plage', !garde('yoga', 630, 690))
  verifier('le reiki passe à 13h', garde('reiki', 780, 840))
  verifier('le reiki est refusé avant l’ouverture', !garde('reiki', 420, 480))
  // ⚠️ DEUX SORTIES QUI PROTÈGENT L'EXISTANT.
  verifier('⚠️ un commerce sans aucune liaison n’est pas jugé', garde('yoga', 780, 840, []))
  // 🔴 ET C'EST BIEN LA SORTIE ANTICIPÉE QUI LE PROTÈGE, pas le hasard. Sans
  // elle, ce rendez-vous à 7h — hors de TOUTE plage — serait refusé, alors
  // qu'aujourd'hui le parc entier l'accepte. La mutation l'a montré : mon
  // premier test passait aussi bien avec la sortie que sans, il ne mesurait
  // donc rien.
  verifier('🔴 sans liaison, même un horaire hors plage reste accepté',
    garde('yoga', 420, 480, []))

  // ⚠️ ET LA PAUSE COMPTE. Une plage 08:00-18:00 qui déjeune de 12h à 13h ne
  // doit pas accepter un rendez-vous à 12h30, liaisons ou pas.
  const AVEC_PAUSE = [{ ...K_LARGE, pause_debut: '12:00:00', pause_fin: '13:00:00' }]
  const gardePause = (debutMin, finMin) => prestationAutoriseeSurCreneaux({
    creneaux: AVEC_PAUSE, liaisons: LIAISONS, prestationId: 'reiki',
    dateStr: '2026-09-07', jour: 'lundi', debutMin, finMin,
  })
  verifier('🔴 un rendez-vous pendant la pause est refusé', !gardePause(750, 810))
  verifier('un rendez-vous qui mord sur la pause est refusé', !gardePause(690, 750))
  verifier('un rendez-vous juste avant la pause passe', gardePause(660, 720))
  verifier('un rendez-vous juste après la pause passe', gardePause(780, 840))
  verifier('⚠️ ni un commerce dont les liaisons n’ont pas été lues', garde('yoga', 780, 840, null))
  verifier('un jour sans aucune plage n’est pas jugé non plus',
    prestationAutoriseeSurCreneaux({ creneaux: CRENEAUX, liaisons: LIAISONS, prestationId: 'yoga',
      dateStr: '2026-09-08', jour: 'mardi', debutMin: 600, finMin: 660 }))
  // ⚠️ Des minutes absentes ne doivent pas ouvrir la porte en grand.
  verifier('des heures illisibles sont refusées', !garde('yoga', null, undefined))

  // ── Et le moteur lui-même ───────────────────────────────────────────────
  const slotsYoga = genererSlots({
    dateChoisie: new Date('2027-09-13T12:00:00'), dureeMinutes: 60,
    creneaux: CRENEAUX, reservations: [], horairesDetail: null,
    capacite: 12, prestationId: 'yoga', liaisonsCreneaux: LIAISONS,
  })
  egal('🔴 le cours n’est plus proposé qu’à son heure',
    slotsYoga.map(s => s.heure), ['10:00'])
  const slotsReiki = genererSlots({
    dateChoisie: new Date('2027-09-13T12:00:00'), dureeMinutes: 60,
    creneaux: CRENEAUX, reservations: [], horairesDetail: null,
    capacite: 1, prestationId: 'reiki', liaisonsCreneaux: LIAISONS,
  })
  verifier('le soin individuel garde la journée', slotsReiki.length >= 8)
  // 🔴 LA GARDE QUE J'AVAIS ÉCRITE À L'ENVERS, ET QU'ALEX A CORRIGÉE. Elle
  // affirmait que l'heure du cours restait ouverte au soin, « parce que les
  // liaisons disent qui peut être proposé, pas quand c'est occupé ». C'était
  // faux : une plage dédiée à un cours n'est pas libre, elle est RÉSERVÉE. Un
  // client qui prenait un Reiki à 10h fermait le cours de yoga pour tout le
  // monde, et c'est exactement le défaut qu'on prétendait corriger.
  //
  // ⚠️ Une garde qui décrit le comportement observé au lieu du comportement
  // VOULU ne garde rien : elle grave le défaut.
  verifier('🔴 l’heure du cours est réservée au cours, salle vide ou non',
    !slotsReiki.some(s => s.heure === '10:00'))
  verifier('mais l’heure d’avant reste au soin', slotsReiki.some(s => s.heure === '09:00'))
  verifier('et celle d’après aussi', slotsReiki.some(s => s.heure === '11:00'))
  // ⚠️ SANS LIAISONS, LE MOTEUR REND EXACTEMENT CE QU'IL RENDAIT AVANT.
  const slotsAvant = genererSlots({
    dateChoisie: new Date('2027-09-13T12:00:00'), dureeMinutes: 60,
    creneaux: CRENEAUX, reservations: [], horairesDetail: null,
    capacite: 12, prestationId: 'yoga',
  })
  verifier('⚠️ sans liaisons, le moteur ne change rien', slotsAvant.length >= 10)
}

// ═══════════════════════════════════════════════════════════════════════════
// LES TROIS CORRECTIONS DE PARCOURS DU 07/09 (demandes d'Alex)
//
// ⚠️ CE SONT DES GARDES D'ÉCRAN, et elles le disent : la règle qu'elles
// protègent n'est pas calculable ici, elle est dans du JSX. Ce qu'elles
// mesurent, c'est qu'une décision prise avec Alex n'a pas été défaite.
// ═══════════════════════════════════════════════════════════════════════════
{
  const lire = (f) => sansCommentaires(readFileSync(new URL('../' + f, import.meta.url), 'utf8'))
  const CONFIG = lire('app/dashboard/ConfigDashboard.js')
  const FICHE = lire('app/commander/rdv/[slug]/page.js')

  // 🔴 « Rien de coché = toutes » était un état IMPLICITE : le commerçant ne
  // pouvait pas savoir s'il avait choisi ou oublié.
  verifier('🔴 le choix « toutes mes prestations » est explicite',
    /toutesPrestations: true/.test(CONFIG) && /Toutes mes prestations/.test(CONFIG))
  verifier('et « seulement celles que je choisis » aussi',
    /Seulement celles que je choisis/.test(CONFIG))
  // ⚠️ Un mode restreint sans rien de coché serait une plage « toutes » qu'on
  // croit restreinte. On refuse au lieu d'interpréter.
  verifier('⚠️ restreindre sans rien choisir est refusé',
    /!form\.toutesPrestations && \(form\.prestations \|\| \[\]\)\.length === 0/.test(CONFIG))
  // ⚠️ Et « toutes » s'écrit ZÉRO ligne : le même état en base qu'avant.
  verifier('« toutes » n’écrit aucune liaison',
    /form\.toutesPrestations \? \[\] : \(form\.prestations \|\| \[\]\)\.filter\(Boolean\)/.test(CONFIG))

  // ⚠️ LA REMARQUE QU'ALEX A DEMANDÉE : un cours sur une plage ouverte à tout
  // serait réservable à n'importe quelle heure.
  // 🔴 ET IL NE NOMME QUE LES COURS SANS PLAGE À EUX. La première version
  // nommait tout le catalogue : elle annonçait que le Yoga serait réservable à
  // n'importe quelle heure alors qu'il avait déjà sa plage de 10h, et que son
  // heure lui est même réservée. Un avertissement qui nomme le mauvais coupable
  // envoie corriger ce qui était juste.
  // ⚠️ ON VISE `exposes`, PAS L'EXPRESSION SEULE. La mutation a montré que la
  // garde restait verte : la même expression vit AUSSI dans le bandeau des
  // cours orphelins, deux cents lignes plus bas. C'est le piège du JUMEAU, déjà
  // rencontré le 06/09 sur `cible_tout`. Un nom unique le désamorce.
  verifier('⚠️ « toutes » avertit sur les cours restés sans plage',
    /const exposes = prestationsRdv\.filter\(p =>\s*Number\(p\.capacite\) > 1 && prestationSansCreneauDedie\(p\.id, liaisons\)\)/.test(CONFIG))
  verifier('🔴 et plus sur tout le catalogue de cours',
    !/prestationsRdv\.filter\(p => Number\(p\.capacite\) > 1\)\.map\(p => p\.nom\)/.test(CONFIG))

  // 🔴 Le bloc se cachait quand il n'y avait pas de prestation : le commerçant
  // qui crée ses plages en premier ne le voyait jamais.
  verifier('🔴 sans prestation, le réglage se montre quand même',
    /prestationsRdv\.length === 0 && \(/.test(CONFIG))

  // 🔴 Les plages d'un praticien parti ne proposent plus rien.
  verifier('🔴 les plages d’un praticien parti sont écartées',
    /creneauxVivants[\s\S]{0,200}praticiens\.some\(p => p\.id === c\.praticien_id\)/.test(FICHE))
  // ⚠️ Sauf si la liste des praticiens n'a pas pu être lue : fermer sur une
  // ignorance viderait tous les agendas nommés d'un coup.
  verifier('⚠️ une liste de praticiens vide ne ferme rien',
    /praticiens\.length === 0\s*\n?\s*\? creneauxConfig/.test(FICHE))

  // ─── « COMMENT ÇA MARCHE » (Alex, 07/09) ────────────────────────────────
  // L'autonomie du commerçant est le canal d'acquisition : celui qui s'en sort
  // seul en parle autour de lui.
  const AIDE = lire('app/dashboard/BlocAide.js')
  verifier('l’onglet rendez-vous porte son mode d’emploi',
    /<BlocAide id="rdv"/.test(CONFIG))
  // ⚠️ LA GARDE COMPTE DANS SON PROPRE BLOC. Elle comptait les `EtapeAide` du
  // fichier entier : le jour où un second onglet a reçu son mode d'emploi
  // (08/09), elle a rougi sans qu'aucune règle n'ait bougé. Une garde qui
  // mesure le fichier au lieu du bloc mesure le voisin.
  const blocAide = (id) => {
    const i = CONFIG.indexOf(`<BlocAide id="${id}"`)
    if (i < 0) return ''
    const j = CONFIG.indexOf('</BlocAide>', i)
    return j < 0 ? '' : CONFIG.slice(i, j)
  }
  verifier('et il décrit les quatre étapes dans l’ordre',
    (blocAide('rdv').match(/<EtapeAide n=\{[1-4]\}/g) || []).length === 4)
  // ⚠️ LES DEUX PIÈGES SONT NOMMÉS, parce que ce sont eux qui coûtent une
  // journée de compréhension : une plage hors horaires ne propose rien, et un
  // cours resté sur une plage ouverte se donne à n'importe quelle heure.
  verifier('⚠️ le mode d’emploi nomme le piège des horaires',
    /déborder de tes horaires/.test(CONFIG))
  verifier('⚠️ et celui du cours laissé sur une plage ouverte',
    /réservable à n’importe quelle heure/.test(CONFIG))

  // 🔴 UN BLOC DÉPLIABLE, PAS UNE MODALE. Une fenêtre qui s'ouvre seule à
  // chaque visite est la friction que ce produit combat partout ailleurs.
  verifier('🔴 l’aide se replie et se rouvre, elle ne bloque rien',
    /setOuvert\(!dejaVu\)/.test(AIDE) && !/createPortal/.test(AIDE))
  // ⚠️ ON NE MÉMORISE QUE LA FERMETURE : rouvrir pour relire ne doit pas
  // reprogrammer une ouverture automatique au prochain passage.
  verifier('⚠️ seule la fermeture se mémorise',
    /if \(!suivant\) \{ try \{ localStorage\.setItem/.test(AIDE))
  // ⚠️ UN STOCKAGE INDISPONIBLE NE CASSE RIEN. Navigation privée, quota plein :
  // on retombe sur « ouvert », le pire cas acceptable.
  verifier('⚠️ un stockage inaccessible ne casse pas l’écran',
    (AIDE.match(/catch/g) || []).length >= 2)

  // 🔴 ET L'ÉCRAN LIT LA BONNE SOURCE D'HORAIRES (Alex, 07/09). Un commerce
  // « je change d'endroit » tient ses horaires dans ses emplacements.
  verifier('🔴 l’alerte lit les emplacements quand le planning en dépend',
    /const horairesReference = parLieuRdv\s*\n?\s*\? horairesDepuisLieux\(lieuxDispo\)/.test(CONFIG))
  verifier('🔴 et l’alerte des heures s’appuie dessus',
    /horairesDetail: horairesReference/.test(CONFIG))
  verifier('⚠️ comme la détection des jours fermés',
    /joursFermesProfil = JOURS_SEMAINE\.filter\(j => horairesReference/.test(CONFIG))
  // ⚠️ Plus aucune lecture directe de la grille dans ce composant : c'est elle
  // qui mentait.
  verifier('⚠️ la grille n’est plus lue en direct pour juger une plage',
    !/horairesDetail: commercant\?\.horaires_detail/.test(CONFIG))

  // ─── L'ONGLET SURVIT AU RECHARGEMENT (Alex, 07/09) ──────────────────────
  // Un rechargement ou un retour en arrière repartait TOUJOURS sur
  // « Commandes » : trois clics à refaire à chaque fois pendant une session de
  // réglages.
  const PAGE = lire('app/dashboard/page.js')
  verifier('l’onglet s’écrit dans l’adresse',
    /url\.searchParams\.set\('onglet', ongletPrincipal\)/.test(PAGE))
  verifier('et le sous-onglet des paramètres aussi',
    /url\.searchParams\.set\('config', configTabUrl\)/.test(PAGE))
  // 🔴 UNE ENTRÉE D'HISTORIQUE PAR ONGLET VISITÉ (corrigé le 07/09, testé par
  // Alex). Ma première version employait `replaceState` partout : aucun onglet
  // n'entrait dans l'historique, donc « Précédent » sautait à l'entrée
  // d'origine et ramenait à « Commandes ». La toute première écriture, elle,
  // REMPLACE : elle ne fait que compléter l'adresse d'arrivée.
  verifier('🔴 chaque onglet visité entre dans l’historique',
    /const methode = premiereEcriture\.current \? 'replaceState' : 'pushState'/.test(PAGE))
  verifier('⚠️ et un retour en arrière n’empile rien',
    /if \(viensDeLHistorique\.current\) \{ viensDeLHistorique\.current = false; return \}/.test(PAGE))
  // ⚠️ L'entrée d'origine n'a aucun paramètre : sans repli, « Précédent »
  // n'aurait l'air de rien faire.
  verifier('⚠️ une adresse sans onglet ramène au défaut',
    /ONGLETS_VALIDES\.includes\(o\) \? o : 'commandes'\)/.test(PAGE))
  // ⚠️ UNE ADRESSE SE BRICOLE À LA MAIN : un onglet inconnu afficherait un
  // écran vide sans rien dire.
  verifier('⚠️ un onglet inconnu dans l’adresse est ignoré',
    /ONGLETS_VALIDES\.includes\(o\)/.test(PAGE) && /CONFIG_VALIDES\.includes\(c\)/.test(PAGE))
  // ⚠️ Le bouton « Précédent » change l'adresse sans que React le sache.
  verifier('⚠️ le retour en arrière est écouté',
    /window\.addEventListener\('popstate', auRetour\)/.test(PAGE)
    && /window\.removeEventListener\('popstate', auRetour\)/.test(PAGE))
  // 🔴 L'ÉTAT DE L'ADRESSE EST SÉPARÉ DE LA CLÉ DU COMPOSANT. `configTab` sert
  // de `key` à ConfigDashboard : le modifier REMONTE le composant et perd la
  // saisie en cours.
  verifier('🔴 l’adresse ne remonte pas le composant des réglages',
    /const \[configTabUrl, setConfigTabUrl\] = useState/.test(PAGE)
    && /onOngletChange=\{setConfigTabUrl\}/.test(PAGE))
  verifier('⚠️ et on n’écrit pas avant d’avoir lu',
    /if \(!pretUrl\) return/.test(PAGE))

  // ─── LES DEUX COPIES AJUSTENT, ET LES FRÈRES AUSSI (Alex, 07/09) ────────
  // 🔴 « Check chez les frères en alimentaire et détail aussi » : le module des
  // commandes avait le MÊME trou sur sa copie, et son alerte de création
  // mentait en plus aux commerces à DEUX SERVICES.
  verifier('🔴 la copie des plages de rendez-vous ajuste',
    /const ajuste = ajusterPlagePourJour\(c, horairesReference\?\.\[j\]\)/.test(CONFIG))
  verifier('🔴 et celle des créneaux de commande aussi',
    /const ajuste = ajusterPlagePourJour\(c, horaires\?\.\[cible\]\)/.test(CONFIG))
  // ⚠️ ON DIT CE QU'ON A AJUSTÉ, DES DEUX CÔTÉS. Un créneau raccourci en
  // silence, c'est un commerçant qui cherchera pourquoi son agenda ne propose
  // pas ce qu'il a écrit.
  // ⚠️ LA GARDE COMPTE DEUX EXEMPLAIRES, elle ne cherche plus deux libellés
  // différents : les deux copies disent maintenant LA MÊME PHRASE, et une
  // garde qui pointait le libellé de l'une aurait laissé l'autre partir.
  verifier('⚠️ les deux copies annoncent ce qu’elles ont ajusté',
    (CONFIG.match(/Copier en ajustant/g) || []).length >= 2
    && (CONFIG.match(/Tes horaires ne sont pas les mêmes ces jours-là/g) || []).length >= 2)
  // 🔴 « TU ES FERMÉ » NE SE DIT QUE SI C'EST VRAI (Alex, 07/09). Un jour bien
  // ouvert qui ferme plus tôt n'est pas un jour fermé, et il l'a contesté dans
  // la minute.
  verifier('🔴 le refus dit lequel des deux motifs',
    /ajuste\.raison === 'jour_ferme'\s*\n?\s*\? `\$\{j\} \$\{heure\} : tu es fermé ce jour-là`/.test(CONFIG))
  verifier('⚠️ et cite les heures réelles quand le jour est ouvert',
    /tu es ouvert \$\{\(ajuste\.heures \|\| \[\]\)\.join\(' et '\)\}/.test(CONFIG))
  // 🔴 L'EMPLACEMENT EST UNE QUESTION, PAS UNE NOTE (Alex, 07/09 : « il doit
  // spécifier que l'emplacement ne correspond pas au jour, et demander ce que
  // tu veux faire »). Il y a un vrai choix derrière, et c'est lui qui sait.
  verifier('🔴 un emplacement qui ne colle pas au jour pose une question',
    /confirmationDeuxGestes\(\{[\s\S]{0,400}?Tu n’es pas au même endroit ces jours-là/.test(CONFIG))
  verifier('⚠️ avec ses deux gestes nommés',
    /premier: 'Copier sur l’emplacement du jour'/.test(CONFIG)
    && /second: 'Ne pas copier ces plages'/.test(CONFIG))
  // ⚠️ ET LE CONFLIT NE SE DÉCLENCHE QUE S'IL Y EN A UN.
  //
  // 🔴 « LE MESSAGE S'AFFICHE POUR UN EMPLACEMENT IDENTIQUE » (Alex, 08/09).
  // Un commerce qui change d'endroit a UNE LIGNE PAR JOUR : la salle du mardi
  // et celle du jeudi portent le même nom et deux identifiants différents. La
  // garde d'avant mesurait la comparaison par identifiant, c'est-à-dire
  // exactement le défaut, et elle est restée verte pendant qu'il se produisait.
  verifier('⚠️ aucune question quand c’est le même endroit ce jour-là',
    /if \(memeLieuCeJour\(c\.lieu_id, duJour\)\) continue/.test(CONFIG))
  verifier('⚠️ et « même endroit » se juge sur le nom, pas sur l’identifiant',
    /function memeEndroit\(a, b\) \{[\s\S]{0,220}?return n\(a\) !== '' && n\(a\) === n\(b\)/.test(CONFIG))
  verifier('⚠️ la copie vise la ligne de CE jour-là',
    /const jumeau = memeLieuCeJour\(c\.lieu_id, duJour\)/.test(CONFIG)
    && /lieuCopie = jumeau\.id/.test(CONFIG))
  // 🔴 ET L'EMPLACEMENT EST DÉSORMAIS COPIÉ, là où il disparaissait.
  verifier('🔴 la copie emporte un emplacement',
    /lieu_id: parLieuRdv \? lieuCopie : null,/.test(CONFIG))

  // 🔴 UN PAVÉ NE SE LIT PAS (Alex : « plus clair et plus aéré »). Les détails
  // arrivaient collés : le HTML ignore les retours à la ligne d'une chaîne.
  const MODALE = lire('app/dashboard/ModaleConfirmation.js')
  // ⚠️ ON VISE LE TERNAIRE ENTIER, PAS LE MOT. La mutation l'a montré :
  // `Array.isArray(details)` reste présent même quand on le neutralise d'un
  // `false &&` devant. Une garde qui cherche un mot mesure une PRÉSENCE, pas
  // un comportement.
  verifier('🔴 les détails s’affichent ligne par ligne',
    /\{Array\.isArray\(details\)\s*\n?\s*\? details\.map\(\(ligne, i\) =>/.test(MODALE))
  verifier('⚠️ et une chaîne continue de marcher',
    /\)\)\s*\n?\s*: details\}/.test(MODALE))
  // 🔴 L'ALERTE DE CRÉATION DES COMMANDES PASSE PAR LA MÊME RÈGLE. L'ancienne
  // comparait à `horaireJour`, qui ne rend que la PREMIÈRE plage : une friterie
  // ouverte 11:00-14:00 puis 18:00-22:00 était alertée sur un créneau de 19h.
  verifier('🔴 l’alerte des créneaux de commande connaît les deux services',
    /const dehorsCmd = creneauHorsOuverture\(\{/.test(CONFIG))
  verifier('⚠️ et ne compare plus à la première plage seule',
    !/form\.heure_debut < h\.debut \|\| form\.heure_fin > h\.fin/.test(CONFIG))

  // ═════════════════════════════════════════════════════════════════════════
  // Eb4, ET LES QUATRE FRÈRES TROUVÉS AVEC LUI (Alex, 07/09 : « copie
  // impossible sur jour fermé, pas de message, le jour fermé n'est pas
  // cliquable »).
  // ═════════════════════════════════════════════════════════════════════════

  // 🔴 LE BANDEAU ORANGE MENTAIT AUX COMMERCES À DEUX SERVICES, exactement
  // comme l'alerte de création avant Eb2 : il comptait « hors des horaires »
  // tous les créneaux du soir d'une friterie et ne s'éteignait jamais.
  verifier('🔴 le bandeau hors horaires connaît les deux services',
    /function creneauxHorsHoraires\(jour, cren\) \{[\s\S]{0,300}?creneauHorsOuverture\(\{/.test(CONFIG))
  verifier('⚠️ et il ne compare plus à la première plage seule',
    !/c\.heure_debut\.slice\(0,5\) < h\.debut \|\| c\.heure_fin\.slice\(0,5\) > h\.fin/.test(CONFIG))
  verifier('⚠️ et il cite les heures des deux services',
    /hors des horaires d'ouverture\{heuresLisibles\(jourActif\)/.test(CONFIG))

  // 🔴 UN BOUTON QUI NE FAIT RIEN ET NE DIT RIEN est le pire des deux. Le jour
  // fermé se choisit, et c'est la copie qui répond.
  verifier('🔴 un jour fermé se choisit dans la copie des commandes',
    /onClick=\{\(\) => setJoursCibles\(prev => selec/.test(CONFIG))
  verifier('⚠️ le clic n’est plus avalé par une garde muette',
    !/onClick=\{\(\) => ouvert && setJoursCibles/.test(CONFIG))
  verifier('⚠️ et la puce dit « fermé » AVANT le clic',
    /\{!ouvert && <span[^>]*>fermé<\/span>\}/.test(CONFIG))

  // ⚠️ ET LE REFUS DIT LEQUEL DES DEUX MOTIFS, comme en rendez-vous.
  //
  // ⚠️ LA GARDE VISE `${cible}`, LE NOM DE VARIABLE DE CE MODULE-CI. Le module
  // rendez-vous écrit exactement les mêmes phrases avec `${j}` : une garde qui
  // n'aurait cherché que les phrases serait restée VERTE grâce au jumeau, en
  // ne mesurant plus rien. C'est le piège du 07/09, deuxième fois.
  verifier('⚠️ la copie des commandes dit fermé OU hors des heures',
    /\? `\$\{cible\} \$\{heure\} : tu es fermé ce jour-là`[\s\S]{0,140}?: `\$\{cible\} \$\{heure\} : tu es ouvert \$\{\(ajuste\.heures \|\| \[\]\)\.join\(' et '\)\}`/.test(CONFIG))

  // 🔴 LE PAVÉ COLLÉ, le frère non traité du 07/09 : le HTML ignore les
  // retours à la ligne d'une chaîne.
  const iCmdCalcul = CONFIG.indexOf('const parJour = new Map()')
  const iCmdSuppression = CONFIG.indexOf("supabase.from('creneaux').delete()", iCmdCalcul)
  const blocCopieCmd = iCmdCalcul > 0 && iCmdSuppression > iCmdCalcul
    ? CONFIG.slice(iCmdCalcul, iCmdSuppression) : ''
  verifier('🔴 les détails de la copie des commandes sont un tableau',
    blocCopieCmd.length > 0 && !/\]\.join\('\\n'\)/.test(blocCopieCmd))

  // 🔴 RIEN N'EST DÉTRUIT AVANT QUE TOUT SOIT DEMANDÉ. La suppression vivait
  // avant les questions : répondre « non » vidait les jours cibles et rendait
  // la main. Un geste d'annulation qui détruit est le pire de tous.
  verifier('🔴 la copie des commandes ne supprime qu’après les questions',
    /confirmationSimple/.test(blocCopieCmd) && /vont être remplacés/.test(blocCopieCmd))

  // 🔴 ET ELLE NE REMPLACE QUE CE QUI OCCUPE LA MÊME HEURE (Alex, 08/09 :
  // « j'essaie de copier de mardi à jeudi sur des créneaux libres et il me dit
  // qu'il remplace... et effectivement il supprime les anciens »). Copier un
  // service du midi emportait celui du soir, qui ne le gênait en rien.
  verifier('🔴 la copie des commandes ne remplace que le même sillon',
    /const memeSillon = \(ex, neuf\) =>[\s\S]{0,600}?String\(ex\.heure_debut\)\.slice\(0,5\) < String\(neuf\.heure_fin\)\.slice\(0,5\)/.test(blocCopieCmd)
    && /const aRemplacer = creneaux\.filter\(ex => toutesCopies\.some\(n => memeSillon\(ex, n\)\)\)/.test(CONFIG))
  // ⚠️ ET UN CRÉNEAU QUI PORTE DES COMMANDES SE GARDE. La suppression à
  // l'unité le refuse depuis longtemps ; la copie effaçait sans regarder.
  verifier('🔴 un créneau qui porte des commandes n’est pas écrasé par une copie',
    /\.select\('creneau_id'\)\.in\('creneau_id', aRemplacer\.map\(c => c\.id\)\)/.test(CONFIG)
    && /const remplacables = aRemplacer\.filter\(c => !occupes\.includes\(c\)\)/.test(CONFIG))
  verifier('⚠️ et le message dit ce qui est gardé et pourquoi',
    /Gardé · \$\{c\.jour_semaine\}[^`]*: des clients y ont commandé/.test(CONFIG))
  verifier('⚠️ et elle lit le résultat de chaque écriture',
    /const \{ error \} = await supabase\.from\('creneaux'\)\.insert\(copies\)[\s\S]{0,160}?if \(error\)/.test(CONFIG))

  // Le même défaut vivait dans la copie des plages de rendez-vous, et il y
  // était pire : la suppression précédait DEUX questions.
  const iRdvQuestion = CONFIG.indexOf('Certaines plages ne peuvent pas être copiées')
  // ⚠️ L'ANCRE VISE LA SUPPRESSION DU MODULE RENDEZ-VOUS, pas celle des
  // commandes : `aRemplacer.map(c => c.id)` existe des DEUX côtés, et
  // `indexOf` rendait la première, c'est-à-dire le voisin. La garde mesurait
  // donc l'autre module. Le piège du jumeau, troisième fois en deux jours.
  const iRdvSuppression = CONFIG.indexOf(".in('id', aRemplacer.map(c => c.id))")
  verifier('🔴 la copie des rendez-vous ne supprime qu’après les questions',
    iRdvQuestion > 0 && iRdvSuppression > iRdvQuestion)
  verifier('⚠️ et plus juste après setCopieLoading',
    !/setCopieLoading\(true\)\s*const idsARemplacer/.test(CONFIG))
  // 🔴 ET SEULEMENT CE QUI OCCUPE LA MÊME PLACE : même jour, même praticien,
  // même endroit, et une heure qui se chevauche. Deux praticiens à la même
  // heure ne se gênent pas, c'est ainsi qu'on donne deux cours en même temps.
  verifier('🔴 la copie des rendez-vous ne remplace que le même sillon',
    /String\(ex\.praticien_id \|\| ''\) === String\(neuf\.praticien_id \|\| ''\)/.test(CONFIG)
    && /String\(ex\.lieu_id \|\| ''\) === String\(neuf\.lieu_id \|\| ''\)/.test(CONFIG)
    && /const aRemplacer = creneaux\.filter\(ex => lignes\.some\(n => memeSillon\(ex, n\)\)\)/.test(CONFIG))
  verifier('⚠️ et la question NOMME les plages remplacées',
    /titre: aRemplacer\.length === 1 \? 'Une plage va être remplacée'/.test(CONFIG)
    && /Le reste de ces journées ne bouge pas\./.test(CONFIG))
  // ⚠️ DEUX PLAGES QUI SE TOUCHENT NE SE CHEVAUCHENT PAS. La base rend
  // « 11:00:00 » et les lignes écrites « 11:00 » : comparées entières, la
  // première serait supprimée par la seconde.
  verifier('⚠️ deux plages qui se touchent ne s’écrasent pas',
    (CONFIG.match(/String\(ex\.heure_fin\)\.slice\(0,5\) > String\(neuf\.heure_debut\)\.slice\(0,5\)/g) || []).length === 2)

  // ═════════════════════════════════════════════════════════════════════════
  // LES CINQ ANOMALIES DE LA CAPTURE DU 08/09 (La Table d'Essai, 11:00-13:00
  // puis 18:00-22:00). La MÊME lecture fausse vivait dans QUATRE endroits de
  // cet écran, et la copie perdait un service.
  // ═════════════════════════════════════════════════════════════════════════

  // ⚠️ UNE SEULE LECTURE DES HEURES, et tout en descend.
  verifier('⚠️ les heures du jour se lisent en un seul endroit',
    /function plagesDuJour\(jour\) \{[\s\S]{0,400}?h\.debut2 && h\.fin2/.test(CONFIG)
    && /function heuresLisibles\(jour\) \{\s*return plagesDuJour\(jour\)/.test(CONFIG))

  // 🔴 LA PASTILLE DE LA CARTE : un créneau 18:00-22:00 en plein service du
  // soir portait « Hors horaires ».
  verifier('🔴 la pastille d’un créneau connaît les deux services',
    /const horsH = horaires\?\.\[jourActif\]\?\.ouvert && Boolean\(creneauHorsOuverture\(\{/.test(CONFIG))
  verifier('⚠️ et elle ne compare plus à la première plage seule',
    !/c\.heure_debut\.slice\(0,5\) < horaireJour\(jourActif\)\.debut/.test(CONFIG))

  // 🔴 LE SOUS-TITRE DU JOUR annonçait « 11:00 – 13:00 » à un restaurant qui
  // sert aussi le soir.
  verifier('🔴 le sous-titre du jour cite tous les services',
    /\/> \{heuresLisibles\(jourActif\) \|\| `\$\{horaireJour\(jourActif\)\.debut\} – \$\{horaireJour\(jourActif\)\.fin\}`\}/.test(CONFIG))

  // 🔴 LA GÉNÉRATION AUTOMATIQUE refusait tout créneau du soir.
  verifier('🔴 la génération couvre la journée entière',
    /const ouvertureJour = services\.length > 0 \? services\[0\]\[0\] : h\.debut/.test(CONFIG)
    && /const fermetureJour = services\.length > 0 \? services\[services\.length - 1\]\[1\] : h\.fin/.test(CONFIG))
  verifier('⚠️ elle ne refuse que si RIEN ne tombe dans un service',
    /if \(services\.length > 0 && !services\.some\(\(\[a, b\]\) => debut < b && fin > a\)\)/.test(CONFIG))
  verifier('⚠️ et elle saute le creux entre deux services',
    /if \(services\.length === 0 \|\| services\.some\(\(\[a, b\]\) => current >= a && next <= b\)\)/.test(CONFIG))
  verifier('⚠️ le refus de génération cite tous les services',
    /génération annulée`, 'error'\); return/.test(CONFIG)
    && /Hors horaires d'ouverture \(\$\{heuresLisibles\(jourActif\)\}\)/.test(CONFIG))

  // 🔴 LA COPIE PERDAIT UN SERVICE. Les DEUX copies posent un créneau par
  // morceau, et les deux l'annoncent.
  verifier('🔴 la copie des commandes pose un créneau par service',
    /for \(const m of morceaux\) \{\s*copies\.push\(\{/.test(CONFIG))
  verifier('🔴 la copie des rendez-vous pose une plage par service',
    /for \(const m of morceaux\) \{\s*const ligne = \{/.test(CONFIG))
  verifier('⚠️ et les deux annoncent tous les morceaux',
    (CONFIG.match(/devient \$\{morceaux\.map\(m => `\$\{m\.debut\}–\$\{m\.fin\}`\)\.join\(' et '\)\}/g) || []).length >= 2)

  // 🔴 ET LES PRESTATIONS SUIVENT LA PLAGE ÉCRITE, PAS LA PLAGE SOURCE. Dès
  // qu'une plage était raccourcie, l'appariement par l'heure de la source ne
  // trouvait plus rien et la copie perdait ce qu'elle accepte, EN SILENCE.
  verifier('🔴 l’appariement des prestations se fait sur la plage écrite',
    /const cleLigne = \(l\) => `\$\{l\.jour_semaine\}\|\$\{String\(l\.heure_debut\)\.slice\(0,5\)\}/.test(CONFIG)
    && /prestasParCle\.get\(cleLigne\(neuf\)\)/.test(CONFIG))
  verifier('⚠️ et plus sur l’heure de la plage source',
    !/const cle = \(c\) => `\$\{c\.heure_debut\}\|\$\{c\.heure_fin\}\|\$\{c\.praticien_id \|\| ''\}`/.test(CONFIG))

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 « CE QUI DÉPASSE NE SERA PAS PROPOSÉ » ÉTAIT FAUX CÔTÉ COMMANDES
  // (Alex, 08/09). En rendez-vous, le moteur écrête aux heures d'ouverture,
  // donc la phrase y est vraie. Côté commandes, RIEN n'écrête : la fiche
  // propose le créneau tel quel, et un client peut choisir 15h chez un
  // restaurant fermé l'après-midi. J'avais recopié la phrase du module d'à
  // côté sans vérifier qu'elle y était encore vraie.
  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 « SUPPRIMER AUSSI LE TEL QUEL : PAS DE CRÉNEAUX QUAND LE COMMERCE EST
  // FERMÉ » (Alex, 08/09). Sa règle, et elle vaut pour les COMMANDES : rien
  // n'écrête ici, donc un créneau hors horaires envoie un client devant une
  // porte close. Avertir ne suffit pas quand le geste n'a aucun usage.
  verifier('🔴 la création d’un créneau de commande ramène à tes heures',
    /titre: 'Ce créneau déborde de tes heures d’ouverture',/.test(CONFIG)
    && /action: `Créer \$\{propose\}`,/.test(CONFIG))
  verifier('🔴 et « le créer tel quel » n’existe plus',
    !/'Le créer tel quel'/.test(CONFIG)
    && !/Tel quel, tes clients pourront choisir une heure où tu es fermé/.test(CONFIG))
  verifier('🔴 un créneau entièrement dehors est REFUSÉ, pas créé',
    /await confirme\(confirmationInfo\(\{\s*titre: dehorsCmd\.raison === 'jour_ferme'/.test(CONFIG)
    && /\}\)\)\s*return\s*\}\s*\}/.test(CONFIG))
  verifier('⚠️ et un jour fermé aussi, ce qui ne se disait pas du tout',
    /if \(dehorsCmd\) \{/.test(CONFIG)
    && !/if \(dehorsCmd && dehorsCmd\.raison !== 'jour_ferme'\) \{\s*const heures/.test(CONFIG))
  verifier('⚠️ le refus dit où élargir les horaires',
    /Élargis tes horaires dans Paramètres → Profil/.test(CONFIG)
    && /Ouvre d’abord ce jour dans Paramètres → Profil/.test(CONFIG))
  verifier('🔴 elle ne promet plus que le dépassement sera écarté',
    !/Le \$\{jourActif\}, tu es ouvert \$\{heures\}\. Ce qui dépasse ne sera pas proposé/.test(CONFIG))
  verifier('🔴 ni qu’aucune commande ne pourra s’y poser',
    !/aucune commande ne pourra s’y poser/.test(CONFIG)
    && /Un créneau en dehors serait proposé à tes clients, qui viendraient devant une porte fermée/.test(CONFIG))

  // ═════════════════════════════════════════════════════════════════════════
  // LE MODE D'EMPLOI DES CRÉNEAUX DE COMMANDE (Alex, 08/09 : « très
  // important »). L'ordre y porte une information vraie : sans horaires
  // d'ouverture, tout le reste se fait refuser ou ajuster.
  // ═════════════════════════════════════════════════════════════════════════
  verifier('l’onglet créneaux porte son mode d’emploi',
    /<BlocAide id="creneaux"/.test(CONFIG))
  // 🔴 UNE AIDE QU'ON NE VOIT PAS NE SERT PERSONNE (Alex, 08/09 : « ça se fond
  // trop avec le reste »). Le bloc se voit maintenant fermé, et il dit ce
  // qu'il contient : « ouvrir pour voir » n'est pas une raison d'ouvrir.
  const AIDE_COMPOSANT = lire('app/dashboard/BlocAide.js')
  verifier('🔴 le bloc d’aide se voit quand il est fermé',
    /background: ouvert \? '#fff' : 'linear-gradient\(135deg, #F5EEFF, #FBF8FF\)'/.test(AIDE_COMPOSANT)
    && /boxShadow: ouvert \? 'none' : `0 2px 10px \$\{T\.main\}1F`/.test(AIDE_COMPOSANT))
  verifier('⚠️ et il porte un geste nommé, pas un simple chevron',
    /\{ouvert \? 'Replier' : 'Lire'\}/.test(AIDE_COMPOSANT))
  verifier('⚠️ fermé, il dit ce qu’il contient',
    /\{!ouvert && resume && \(/.test(AIDE_COMPOSANT)
    && (CONFIG.match(/\s+resume="/g) || []).length >= 2)
  verifier('⚠️ et il commence par les heures d’ouverture',
    /<EtapeAide n=\{1\} titre="Tes horaires d’ouverture, d’abord"/.test(blocAide('creneaux')))
  verifier('⚠️ ses cinq étapes sont dans l’ordre',
    (blocAide('creneaux').match(/<EtapeAide n=\{[1-5]\}/g) || []).length === 5)
  verifier('🔴 les deux façons de compter sont expliquées AVEC un exemple',
    /Commandes max ou Temps de préparation \?/.test(CONFIG)
    && (blocAide('creneaux').match(/<strong>Exemple :<\/strong>/g) || []).length === 2)
  verifier('🔴 et l’ambiguïté du « max » est levée',
    /le réglage vaut pour UN créneau,\s*\n?\s*jamais pour la journée/.test(CONFIG)
    && /Pour ce créneau entier\. Un 11:00–22:00 à 5/.test(CONFIG)
    && /Commandes max par créneau\$\{duree_lisible\}/.test(CONFIG))
  // 🔴 UN SEUL MOT POUR UNE SEULE CHOSE (Alex, 08/09 : « tranche équivaut à
  // créneau, on utilise créneau partout mais tu parles de tranche dans tes
  // explications »). Deux mots pour la même chose, c'est une chose de plus à
  // comprendre, et l'aide était censée en retirer.
  //
  // ⚠️ ET LA GARDE NE REGARDE QUE CE QUE LE COMMERÇANT LIT : le bloc d'aide et
  // les questions posées. Écrite sur le fichier entier, elle rougissait sur un
  // COMMENTAIRE qui cite la question d'Alex — le dépouilleur du banc ne coupe
  // pas les commentaires JSX. Une garde qui rougit sans qu'aucune règle n'ait
  // bougé finit par être désarmée.
  {
    const questions = (CONFIG.match(/prompt\(`[^`]*`\)/g) || []).join(' ')
    verifier('🔴 l’écran ne dit jamais « tranche » là où il dit « créneau »',
      !/tranche/i.test(blocAide('creneaux') + questions))
  }
  verifier('⚠️ la copie est expliquée, remplacement compris',
    /sur les jours reçus sont <strong>remplacés<\/strong>/.test(blocAide('creneaux')))
  verifier('⚠️ l’horizon aussi, avec le piège du « 1 jour »',
    /dès ton dernier créneau\s*\n?\s*passé, tu n’as plus rien à vendre/.test(blocAide('creneaux')))
  // ⚠️ L'EXEMPLE DU TEMPS DE PRÉPARATION DOIT SE SUIVRE DE BOUT EN BOUT : le
  // premier était un calcul mental sans énoncé, et Alex l'a dit tel quel.
  verifier('⚠️ l’exemple du temps de préparation se suit de bout en bout',
    /tes pizzas demandent 10 minutes chacune et vous êtes\s*\n?\s*deux en cuisine/.test(CONFIG)
    && /tu\s*\n?\s*règles le créneau à <strong>60 minutes<\/strong>/.test(CONFIG)
    && /commande 4 pizzas\s*\n?\s*en prend 40, il en reste 20/.test(CONFIG))

  // 🔴 « CLÔTURE : 0 H AVANT » NE SE DEVINE PAS. Et le sens change à zéro :
  // ce n'est pas « rien de réglé », c'est « jusqu'à la dernière minute ».
  verifier('🔴 la clôture d’un créneau se lit en clair sous le champ',
    /Commandes acceptées jusqu’à \$\{String\(c\.heure_debut\)\.slice\(0,5\)\}/.test(CONFIG)
    && /Commandes fermées \$\{c\.cutoff_heures\} h avant, soit \$\{heureCloture\(c\.heure_debut, c\.cutoff_heures\)\}/.test(CONFIG))
  verifier('⚠️ et une clôture plus longue que la matinée renvoie à la veille',
    /if \(total < 0\) return `la veille à \$\{minutesToTime\(\(\(total % 1440\) \+ 1440\) % 1440\)\}`/.test(CONFIG))
  verifier('🔴 le découpage crée un créneau par morceau',
    /await supabase\.from\('creneaux'\)\.insert\(aCreer\.map\(n => \(\{/.test(CONFIG))
  verifier('⚠️ et chaque morceau est vérifié contre les créneaux existants',
    /if \(aCreer\.some\(n => n\.debut < e\.heure_fin\.slice\(0,5\) && n\.fin > e\.heure_debut\.slice\(0,5\)\)\)/.test(CONFIG))
  // ⚠️ ET LA PHRASE RESTE, LÀ OÙ ELLE EST VRAIE : le moteur de rendez-vous
  // écrête vraiment. La retirer des deux modules aurait été aussi faux.
  verifier('⚠️ le rendez-vous garde sa phrase, qui y est vraie',
    /Le \$\{form\.jour_semaine\}, tu es ouvert \$\{heures\}\. Ce qui dépasse ne sera pas proposé/.test(CONFIG))
  const MOTEUR = lire('lib/rdv-slots.js')
  verifier('⚠️ et c’est vrai parce que le moteur écrête',
    /if \(shopOpen     !== null\) debut = Math\.max\(debut, shopOpen\)/.test(MOTEUR)
    && /if \(shopRanges\.length > 1 && !shopRanges\.some\(\(\[a, b\]\) => t >= a && slotEnd <= b\)\) continue/.test(MOTEUR))

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 UN ONGLET VIDE N'EST PAS UNE RÉPONSE (Alex, 08/09 : « onglet livraison
  // vide quand elle n'est pas activée depuis l'onglet profil, il faut diriger
  // vers l'onglet profil À L'ENDROIT où il faut activer la livraison »).
  // Une page blanche se lit comme une panne, sur un produit dont l'argument
  // est l'autonomie.
  // ═════════════════════════════════════════════════════════════════════════
  verifier('🔴 l’onglet livraison inactif explique au lieu de rester vide',
    /tab === 'livraison' && peut\(commercant, 'livraison'\) && !commercant\?\.livraison_actif && \(/.test(CONFIG)
    && /titre="La livraison n’est pas encore activée"/.test(CONFIG))
  verifier('🔴 et son bouton emmène à l’interrupteur, pas seulement à l’onglet',
    /setAncreProfil\('activer-livraison'\); changerOnglet\('profil'\)/.test(CONFIG)
    && /<label id="activer-livraison"/.test(CONFIG))
  // ⚠️ LA CASE VIT DANS LE SOUS-ONGLET « RÉGLAGES ». Sans ce geste, le bouton
  // ouvrait le bon onglet sur une section où la case n'est même pas rendue.
  verifier('⚠️ et il ouvre le sous-onglet où la case existe vraiment',
    /if \(ancre === 'activer-livraison'\) setSousOnglet\('reglages'\)/.test(CONFIG))
  verifier('⚠️ le frère hors forfait ne laisse pas non plus de page blanche',
    /titre=\{`« \$\{cible\.label\} » ne fait pas partie de ta formule`\}/.test(CONFIG))
  // ⚠️ « CONFIGURATION COMPLÈTE À VENIR » n'était plus vrai depuis longtemps.
  verifier('⚠️ et la case ne promet plus une configuration « à venir »',
    !/Configuration complète \(zone, frais, créneaux\) à venir/.test(CONFIG))

  // ═════════════════════════════════════════════════════════════════════════
  // LES TOURNÉES DE LIVRAISON, contrôlées avec le reste (Alex, 08/09).
  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 UNE TOURNÉE PARTAIT SANS RIEN DEMANDER ET SANS REGARDER LES COMMANDES,
  // là où les créneaux de retrait refusent depuis longtemps.
  verifier('🔴 une tournée avec des commandes actives ne se supprime pas',
    /\.eq\('creneau_livraison_id', c\.id\)/.test(CONFIG)
    && /Impossible : \$\{liees\.length\} commande\(s\) active\(s\) sur cette tournée/.test(CONFIG))
  verifier('⚠️ et la suppression se confirme',
    /titre: 'Supprimer cette tournée \?',/.test(CONFIG))
  // ⚠️ TROIS ÉCRITURES NE LISAIENT PAS LEUR RÉSULTAT : la ligne disparaissait
  // de l'écran et revenait au chargement suivant.
  verifier('🔴 les écritures des tournées lisent leur résultat',
    /const \{ error \} = await supabase\.from\('livraison_creneaux'\)\.delete\(\)/.test(CONFIG)
    && /const \{ error \} = await supabase\.from\('livraison_creneaux'\)\.update\(\{ actif: !c\.actif \}\)/.test(CONFIG)
    && /const \{ error \} = await supabase\.from\('livraison_creneaux'\)\.update\(\{ max_commandes: n \}\)/.test(CONFIG))
  // 🔴 LA LIMITE SE RÉGLAIT À LA CRÉATION ET PLUS JAMAIS.
  verifier('🔴 la limite d’une tournée se corrige après coup',
    /async function majCutoff\(id, val\) \{/.test(CONFIG)
    && /onChange=\{e => majCutoff\(c\.id, e\.target\.value\)\}/.test(CONFIG))
  verifier('⚠️ et elle se lit en clair, comme celle des créneaux de retrait',
    /Commandes fermées \$\{c\.cutoff_heures\} h avant le départ, soit \$\{heureCloture\(c\.heure_debut, c\.cutoff_heures\)\}/.test(CONFIG))
  // ⚠️ UNE SEULE ÉCRITURE DE LA PHRASE, AU NIVEAU DU MODULE. Deux copies
  // auraient divergé, comme les heures d'ouverture lues à quatre endroits.
  verifier('⚠️ la phrase de clôture n’existe qu’en un exemplaire',
    (CONFIG.match(/function heureCloture\(heureDebut, heures\)/g) || []).length === 1)

  // 🔴 QUAND IL N'Y A RIEN À DÉCIDER, UN SEUL BOUTON. « J'ai compris » et
  // « Ne rien faire » côte à côte pour le même effet, vus sur la capture.
  const CONFIRMATIONS = lire('lib/confirmations.js')
  verifier('🔴 une annonce sans décision n’a qu’un bouton',
    /export function confirmationInfo\(\{[\s\S]{0,400}?actions: \[\s*\{ valeur: 'oui', ton: 'principal', label: action \},\s*\],/.test(CONFIRMATIONS))
  verifier('⚠️ et les deux copies s’en servent quand rien ne passe',
    (CONFIG.match(/confirmationInfo\(\{/g) || []).length >= 2
    && (CONFIG.match(/titre: 'Rien ne peut être copié sur ces jours',/g) || []).length >= 2)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Moteur de créneaux vert.')
