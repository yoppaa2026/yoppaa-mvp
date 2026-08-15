// Vérifie le MOTEUR DE CRÉNEAUX : quels horaires sont proposés un jour donné.
//
// C'est le code le plus critique du module rendez-vous. Quand il se trompe, un
// client ne peut pas réserver et personne ne l'apprend : il s'en va, sans rien
// dire. Le bug du 05/08, où la pause d'une praticienne bloquait ses collègues,
// a vécu ici pendant des semaines.

import { readFileSync, readdirSync } from 'node:fs'
import {
  timeToMinutes, minutesToTime, jourSemaineDate, isoDate,
  filtrerReservationsPourSlots, genererSlots, genererJoursDispos,
} from '../lib/rdv-slots.js'
import { horairesDepuisLieux } from '../lib/lieux-activite.js'
import { peutActiverRdv, messageActivationRdv, etatActivationRdv } from '../lib/activation-rdv.js'
import { capacitePrestation } from '../lib/cours-collectifs.js'
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
const CHEMINS_ECRITURE = [
  'app/api/stripe/webhook/route.js',
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
const srcAgenda = sansCommentaires(readFileSync(new URL('../app/dashboard/AgendaRdv.js', import.meta.url), 'utf8'))
verifier('l’agenda distingue une abonnée d’une séance à l’unité',
  /i\.abonnement_id &&/.test(srcAgenda))

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

// La fiche publique garde son message de repli : fermée, elle invite à
// téléphoner plutôt que de laisser croire à une panne.
const srcFicheRdv = sansCommentaires(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
verifier('fiche fermée : le client est invité à téléphoner',
  /pas encore activé la prise de RDV/.test(srcFicheRdv))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Moteur de créneaux vert.')
