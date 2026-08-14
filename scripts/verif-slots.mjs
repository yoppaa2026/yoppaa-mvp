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
// Le chevauchement ne doit plus refuser un CO-INSCRIT du même cours.
verifier('un co-inscrit du même cours n’est plus vu comme un conflit',
  /memeSeance/.test(srcModale) && /capacite > 1 && memeSeance/.test(srcModale))

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
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Moteur de créneaux vert.')
