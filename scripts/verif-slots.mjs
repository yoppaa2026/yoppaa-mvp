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
const CHEMINS_ECRITURE = [
  'app/api/stripe/webhook/route.js',
  'app/api/rdv/reserver-abonnement/route.js',
  'app/commander/rdv/[slug]/page.js',
  'app/dashboard/ModalNouveauRdv.js',
  'app/dashboard/ConfigDashboard.js',
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

const ecrivains = fichiersQuiInserent('app')
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
  // Les trois chemins n'écrivent pas de la même façon : le webhook complète un
  // payload déjà construit (`payload.place_no = …`), les deux autres déclarent
  // la propriété (`place_no: …`). Les deux formes sont des ÉCRITURES, et c'est
  // tout ce qui compte ici.
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
verifier('une séance d’abonnement ne porte pas le prix du contrat',
  /prix_estime: 0,/.test(srcConfig))

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
      const n = (readFileSync(chemin, 'utf8').match(/backdropFilter|backdrop-filter/g) || []).length
      if (n > 0) flous.push(`${chemin} (${n})`)
    }
  }
  parcourir('app')
  verifier('aucun flou de fond dans les écrans', flous.length === 0, flous.join(', '))
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
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Moteur de créneaux vert.')
