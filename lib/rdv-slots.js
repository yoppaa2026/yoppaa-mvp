// Moteur de créneaux de rendez-vous : quels horaires proposer un jour donné.
//
// POURQUOI CE FICHIER EXISTE. Cette logique vivait DANS la page, donc
// intestable : il fallait un navigateur, un commerçant et une base pour
// savoir si un créneau était juste. C'est pourtant le code le plus critique
// du module rendez-vous : quand il se trompe, un client ne peut pas
// réserver, et personne ne le sait. Le bug des pauses du 05/08, où la pause
// d'un praticien bloquait ses collègues, a vécu là.
//
// Aucune ligne de logique n'a été modifiée en le déplaçant : le comportement
// est identique, il est seulement devenu vérifiable (scripts/verif-slots.mjs).

// ⚠️ « Ce créneau s'applique-t-il ce jour-là » vit dans `deplacement-rdv`, et
// on l'importe. Ce n'est pas sa place idéale, mais une seule écriture juste
// vaut mieux que deux bien rangées.
import { creneauxDuJour } from './deplacement-rdv'
const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']

// ─── Helpers calcul slots ────────────────────────────────────────────────────
export const JOURS_LONGS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
export const JOURS_COURTS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
export const MOIS_COURTS = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc']
export const MOIS_LONGS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export function timeToMinutes(t) {
  // "09:30" ou "09:30:00" → 570
  if (!t) return 0
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
export function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
export function jourSemaineDate(d) {
  return JOURS[d.getDay()]
}
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function isToday(d) {
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

// Bug 6.1 : filtre les reservations "busy" avant de generer les slots, selon le
// praticien choisi et la logique Yoppaa multi-praticiens :
//
//   - Praticien X specifique choisi : seules les reservations de X et celles sans
//     praticien assigne (rdvs legacy pre-multi-prat, ou pris en "Sans preference")
//     bloquent les slots. Les rdvs des autres praticiens n'ont aucun impact sur X.
//
//   - "Sans preference" (praticienChoisi null) : un slot est bloque UNIQUEMENT si
//     TOUS les praticiens eligibles a cette prestation sont occupes a cette heure.
//     Si au moins un praticien eligible est libre, le slot reste dispo (il lui sera
//     assigne). Pattern aligne sur Treatwell/Planity/Fresha. Les RDV avec praticien_id
//     null (legacy) bloquent tout par safety (on ne peut pas savoir qui les fait).
//
// Retourne un tableau { heure_debut, heure_fin } pour genererSlots.
export function filtrerReservationsPourSlots(reservations, praticienChoisi, praticiensEligibles) {
  const list = reservations || []
  if (praticienChoisi) {
    return list.filter(r => r.praticien_id === praticienChoisi.id || r.praticien_id === null)
  }
  // Sans preference : grouper par intervalle (heure_debut, heure_fin) et compter les
  // praticiens eligibles uniques qui occupent chaque slot. Bloque si TOUS pris.
  const eligibleIds = new Set((praticiensEligibles || []).map(p => p.id))
  const nbEligibles = eligibleIds.size
  if (nbEligibles === 0) return list  // aucun praticien configure : safe fallback
  const slotMap = new Map()  // key "HH:MM:SS-HH:MM:SS" -> { praticiens: Set, hasNull: bool, resas: [] }
  list.forEach(r => {
    const key = `${r.heure_debut}-${r.heure_fin}`
    if (!slotMap.has(key)) slotMap.set(key, { praticiens: new Set(), hasNull: false, resas: [] })
    const entry = slotMap.get(key)
    entry.resas.push(r)
    if (!r.praticien_id) entry.hasNull = true
    else if (eligibleIds.has(r.praticien_id)) entry.praticiens.add(r.praticien_id)
    // rdvs des praticiens non eligibles a cette prestation : ignores (ils n'occupent
    // pas les praticiens qui pourraient faire cette prestation)
  })
  const bloquants = []
  slotMap.forEach(entry => {
    if (entry.hasNull || entry.praticiens.size >= nbEligibles) {
      // ⚠️ ON REND LES RÉSERVATIONS D'ORIGINE, PAS UN OBJET RECONSTRUIT à partir
      // de la clé. L'objet reconstruit ne portait que les deux heures : il
      // perdait `prestation_id` et `place_no`, et sans eux le comptage des
      // places d'un cours collectif est aveugle. Deux inscrites sur deux
      // praticiennes différentes fermaient alors un cours de douze.
      //
      // Pour un rendez-vous individuel, rendre trois objets de même intervalle
      // au lieu d'un seul ne change strictement rien : le chevauchement se
      // mesure sur les bornes, et elles sont identiques.
      bloquants.push(...entry.resas)
    }
  })
  return bloquants
}

// ─── CE QU'UN CRÉNEAU ACCEPTE (07/09) ───────────────────────────────────────
//
// 🔴 LE DÉFAUT QUE ÇA CORRIGE, TROUVÉ PAR ALEX. Un créneau ne disait rien des
// prestations : celui de Centre Respire, lundi 08:00-18:00, acceptait aussi
// bien une Séance de Reiki (une personne) qu'un Cours de Yoga (douze). Deux
// conséquences, et la seconde est la pire :
//   • le premier arrivé décidait de la nature du créneau : un Reiki pris à 10h
//     annulait DE FAIT le cours de yoga de 10h, pour tout le monde ;
//   • et le cours de yoga était proposé à TOUTES les heures, cinq jours sur
//     sept. Cinquante cours par semaine, dont un le mardi à 13h pour une
//     personne seule.
//
// ⚠️ VIDE VEUT DIRE « TOUTES » (arbitrage d'Alex, 07/09). C'est ce qui fait
// qu'aucun agenda existant ne change : un créneau sans aucune liaison continue
// d'accepter tout le catalogue, comme avant.
export function creneauAccepte(creneauId, prestationId, liaisons) {
  // 🔴 UNE LIAISON NON CHARGÉE OUVRE, ELLE NE FERME PAS. Le jour où un appelant
  // oublie de charger la table, le pire serait un agenda VIDE partout, sans une
  // seule erreur : plus personne ne pourrait réserver et rien ne le dirait. On
  // retombe sur le comportement d'avant, qui est imparfait mais vivant.
  if (!Array.isArray(liaisons)) return true
  if (!creneauId) return false

  const duCreneau = liaisons.filter(l => String(l.creneau_id) === String(creneauId))
  if (duCreneau.length > 0) {
    // ⚠️ ICI ON FERME. Un créneau RESTREINT et une prestation inconnue, c'est
    // exactement le cas qu'on refuse : cette fonction est celle du serveur, et
    // le serveur tranche. L'écran, lui, passe par `creneauxPourPrestation`.
    if (!prestationId) return false
    return duCreneau.some(l => String(l.prestation_id) === String(prestationId))
  }

  // 🔴 UN CRÉNEAU SANS RIEN DE COCHÉ ACCEPTE TOUT, SAUF CE QUI EST RATTACHÉ
  // AILLEURS. C'est la moitié de la règle que j'avais oubliée, et le banc l'a
  // dite : sans elle, cocher « Yoga » sur le créneau du lundi 10h ne changeait
  // RIEN, parce que le grand créneau 08:00-18:00, lui, n'avait rien de coché et
  // continuait donc d'accepter le yoga à toute heure. Le commerçant aurait fait
  // le réglage, constaté qu'il ne servait à rien, et n'aurait eu aucune façon
  // de comprendre pourquoi.
  //
  // ⚠️ Un seul geste suffit désormais : rattacher une prestation à un créneau
  // la retire de tous les autres. Et ça reste sans effet sur tout le reste du
  // catalogue, qui n'est visé nulle part et garde l'agenda entier.
  if (!prestationId) return true
  return !liaisons.some(l => String(l.prestation_id) === String(prestationId))
}

// 🔴 UNE PLAGE DÉDIÉE RÉSERVE SON HEURE (Alex, 07/09, correction du jour même).
//
// J'avais fait la MOITIÉ du travail : empêcher le yoga d'aller ailleurs, sans
// empêcher les autres de venir sur l'heure du yoga. Lundi 10h, un client
// réservait un Reiki par la grande plage 08:00-18:00 qui accepte tout, le
// créneau devenait occupé, et PLUS PERSONNE ne pouvait s'inscrire au cours.
// C'est le défaut d'origine, dans l'autre sens : le client décidait encore ce
// que devenait le créneau.
//
// ⚠️ ET J'AVAIS ÉCRIT UNE GARDE QUI L'ENTÉRINAIT, en la justifiant : « les
// liaisons disent qui peut être proposé, pas quand c'est occupé ». C'est faux.
// Une plage dédiée à un cours n'est pas libre : elle est RÉSERVÉE à ce cours.
// La salle est prise par le cours de 10h, même vide.
//
// Rend les intervalles [début, fin] qu'une autre prestation ne peut pas
// occuper. ⚠️ Le praticien est déjà tranché en amont : les créneaux reçus sont
// ceux du praticien choisi, ou tous quand il n'y a pas de préférence.
export function tranchesReservees(creneauxJour, prestationId, liaisons) {
  if (!Array.isArray(liaisons) || liaisons.length === 0) return []
  const out = []
  for (const c of creneauxJour || []) {
    const duCreneau = liaisons.filter(l => String(l.creneau_id) === String(c.id))
    // Une plage sans rien de coché ne réserve rien : c'est l'agenda ordinaire.
    if (duCreneau.length === 0) continue
    // Une plage qui M'accepte ne me réserve rien non plus.
    if (prestationId && duCreneau.some(l => String(l.prestation_id) === String(prestationId))) continue
    out.push([timeToMinutes(c.heure_debut), timeToMinutes(c.heure_fin)])
  }
  return out
}

export function tombeDansUneTrancheReservee(debut, fin, tranches) {
  return (tranches || []).some(([a, b]) => debut < b && fin > a)
}

// La version de l'écran : elle ne juge que si elle sait de quoi elle parle.
// Sans prestation choisie, on ne cache rien, on montre l'agenda tel qu'il est.
export function creneauxPourPrestation(creneaux, prestationId, liaisons) {
  if (!Array.isArray(liaisons) || !prestationId) return creneaux || []
  return (creneaux || []).filter(c => creneauAccepte(c.id, prestationId, liaisons))
}

// ⚠️ « QUELS CRÉNEAUX S'APPLIQUENT CE JOUR-LÀ » NE S'ÉCRIT PAS ICI. Je l'avais
// écrite, et le banc a refusé de démarrer : `creneauxDuJour` existait déjà dans
// `deplacement-rdv.js`, mot pour mot. C'était une deuxième copie de la règle
// que ce fichier passe son temps à dénoncer, ajoutée par celui qui l'a écrite.
// On importe, on ne recopie pas.

// LA GARDE DU SERVEUR. L'écran filtre déjà, mais un écran ne décide de rien :
// sans elle, une requête forgée réserve un yoga le mardi à 13h alors que le
// cours n'existe que le lundi à 10h.
//
// 🔴 ET ELLE NE DOIT RIEN CASSER. Deux sorties anticipées, dans cet ordre :
//   • aucune liaison dans ce commerce → il n'a rien réglé, on ne juge pas ;
//   • aucun créneau ce jour-là → le commerçant saisit hors de ses horaires,
//     c'est son agenda et ça a toujours été permis.
// Sans ces deux sorties, cette garde refuserait des rendez-vous que le parc
// entier accepte aujourd'hui.
export function prestationAutoriseeSurCreneaux({
  creneaux, liaisons, prestationId, dateStr, jour, debutMin, finMin,
}) {
  if (!Array.isArray(liaisons) || liaisons.length === 0) return true
  const duJour = creneauxDuJour(creneaux, { dateStr, jour })
  if (duJour.length === 0) return true

  const retenus = duJour.filter(c => creneauAccepte(c.id, prestationId, liaisons))
  if (retenus.length === 0) return false

  const d0 = Number(debutMin), f0 = Number(finMin)
  // 🔴 ET L'HEURE RÉSERVÉE À UN COURS SE REFUSE ICI AUSSI. L'écran ne la
  // propose plus, mais un écran ne décide de rien : sans cette ligne, une
  // requête forgée pose encore un soin à l'heure du cours et le ferme.
  if (Number.isFinite(d0) && Number.isFinite(f0)
      && tombeDansUneTrancheReservee(d0, f0, tranchesReservees(duJour, prestationId, liaisons))) {
    return false
  }

  // ⚠️ ET L'HEURE COMPTE, SINON LA GARDE EST DÉCORATIVE. Le lundi, le créneau
  // du yoga (10h-11h) et celui du Reiki (8h-18h) existent tous les deux : sans
  // vérifier que l'heure demandée tient dans un créneau QUI ACCEPTE, un yoga à
  // 13h passerait, puisqu'un créneau du lundi l'accepte bien... à 10h.
  const d = Number(debutMin), f = Number(finMin)
  if (!Number.isFinite(d) || !Number.isFinite(f)) return false
  return retenus.some(c => {
    const cd = timeToMinutes(c.heure_debut)
    const cf = timeToMinutes(c.heure_fin)
    if (d < cd || f > cf) return false
    const pd = c.pause_debut ? timeToMinutes(c.pause_debut) : null
    const pf = c.pause_fin   ? timeToMinutes(c.pause_fin)   : null
    if (pd !== null && pf !== null && d < pf && f > pd) return false
    return true
  })
}

// ─── JUSQU'À QUAND ON PEUT RÉSERVER (Alex, 07/09) ───────────────────────────
//
// 🔴 SOIXANTE JOURS ÉTAIENT ÉCRITS EN DUR à trois endroits de la fiche, et
// personne ne les avait jamais choisis. Ça bloquait déjà les abonnements : un
// carnet de dix séances à raison d'une par semaine couvre SOIXANTE-DIX jours,
// donc l'abonné ne pouvait pas poser ses deux dernières, alors qu'il les a
// payées.
//
// ⚠️ 60 RESTE LE DÉFAUT. Un coiffeur n'a aucune raison d'ouvrir son agenda sur
// un an, et un horizon long coûte cher : la fiche charge toutes les
// réservations de la période d'un coup pour colorer le mini-calendrier.
export const HORIZON_RDV_DEFAUT = 60
export const HORIZON_RDV_MIN = 7
export const HORIZON_RDV_MAX = 365

export const HORIZONS_RDV = [
  { jours: 30,  libelle: 'Un mois' },
  { jours: 60,  libelle: 'Deux mois' },
  { jours: 90,  libelle: 'Trois mois' },
  { jours: 180, libelle: 'Six mois' },
  { jours: 365, libelle: 'Un an' },
]

// ⚠️ TOUT PASSE PAR ICI, y compris la fiche publique tant que la vue n'expose
// pas la colonne : une valeur absente se replie sur 60, c'est-à-dire sur le
// comportement d'avant. Le piège du zéro est traité : `Number(null)` vaut 0, et
// 0 est hors bornes, donc il retombe sur le défaut au lieu de fermer l'agenda.
export function horizonRdv(commercant) {
  const n = Number(commercant?.rdv_horizon_jours)
  if (!Number.isFinite(n)) return HORIZON_RDV_DEFAUT
  if (n < HORIZON_RDV_MIN || n > HORIZON_RDV_MAX) return HORIZON_RDV_DEFAUT
  return Math.floor(n)
}

// ─── UNE PLAGE DE RENDEZ-VOUS HORS DES HEURES D'OUVERTURE (Alex, 07/09) ─────
//
// 🔴 LE DÉFAUT LE PLUS SILENCIEUX DE CET ÉCRAN. Rien n'empêchait de créer une
// plage 20:00-22:00 dans un commerce qui ferme à 19h. Elle s'enregistrait,
// s'affichait dans la liste, et NE PROPOSAIT JAMAIS RIEN : le moteur écrête
// aux horaires réels (filtre 2). Le commerçant croyait avoir ouvert ses
// soirées, aucun client ne voyait un seul créneau, et personne ne pouvait le
// deviner.
//
// ⚠️ ON AVERTIT, ON NE REFUSE PAS, par cohérence avec le jour fermé : préparer
// ses plages avant d'ouvrir ses horaires est un geste légitime.
//
// Rend `null` si tout va bien, sinon la raison ET les heures d'ouverture, pour
// que le message puisse les citer. Un message qui dit « c'est hors horaires »
// sans dire lesquels oblige à aller chercher ailleurs.
export function creneauHorsOuverture({ jour, heureDebut, heureFin, horairesDetail }) {
  const h = horairesDetail?.[jour]
  // ⚠️ PAS D'HORAIRES CONNUS : ON NE JUGE PAS. Avertir sur une ignorance
  // apprendrait à cliquer « continuer » sans lire, et l'alerte ne vaudrait
  // plus rien le jour où elle aurait raison.
  if (!h) return null
  if (h.ouvert === false) return { raison: 'jour_ferme', plages: [] }

  const plages = []
  if (h.debut && h.fin) plages.push([timeToMinutes(h.debut), timeToMinutes(h.fin)])
  if (h.debut2 && h.fin2) plages.push([timeToMinutes(h.debut2), timeToMinutes(h.fin2)])
  if (plages.length === 0) return null

  const d = timeToMinutes(heureDebut)
  const f = timeToMinutes(heureFin)
  if (!(f > d)) return null   // incohérence de saisie : une autre garde la dit

  const lisible = plages.map(([a, b]) => `${minutesToTime(a)}–${minutesToTime(b)}`)
  // Entièrement en dehors : pas une minute de cette plage ne servira.
  if (!plages.some(([a, b]) => d < b && f > a)) {
    return { raison: 'hors_ouverture', plages: lisible }
  }
  // À cheval : une partie servira, l'autre sera écrêtée en silence.
  if (!plages.some(([a, b]) => d >= a && f <= b)) {
    return { raison: 'deborde', plages: lisible }
  }
  return null
}

// ─── COPIER UNE PLAGE VERS UN AUTRE JOUR (Alex, 07/09) ──────────────────────
//
// 🔴 LE FRÈRE NON TRAITÉ. L'alerte des horaires était posée sur la CRÉATION
// d'une plage, pas sur la COPIE. Centre Respire est à Mettet le lundi jusqu'à
// 17:00 et à Nalinnes le mercredi jusqu'à 12:00 : copier le lundi vers le
// mercredi y a posé une plage 08:00-17:00, cinq heures au-delà de la
// fermeture, sans un mot.
//
// ⚠️ ON AJUSTE PLUTÔT QUE DE REFUSER. « Copie mon lundi » veut dire « les
// mêmes moments, dans la mesure du possible » : raccourcir à l'ouverture réelle
// donne ce qu'il voulait, refuser lui donne un écran d'erreur et du travail.
// Ce qui ne tient pas du tout est écarté, et TOUT est dit avant de le faire.
//
// Rend { debut, fin, statut } où statut vaut 'inchangee', 'raccourcie' ou
// 'ignoree'. Les heures sont au format court, prêtes à réécrire.
// ⚠️ ET LA RAISON DU REFUS VOYAGE AVEC LUI (Alex, 07/09). Une plage écartée
// peut l'être pour DEUX motifs très différents : le jour est fermé, ou elle
// tombe hors des heures d'un jour bien ouvert. Mon premier message disait
// « tu es fermé » dans les deux cas, et Alex a répondu « je ne comprends pas,
// je ne suis pas fermé le mercredi ». Il avait raison : le mercredi ferme à
// 12:00, ce n'est pas la même chose que d'être fermé.
// 🔴 ET ELLE REND UN MORCEAU PAR SERVICE (Alex, 08/09, capture à l'appui).
// Elle ne gardait que le recouvrement LE PLUS LONG : chez La Table d'Essai,
// ouverte 11:00-13:00 puis 18:00-22:00, copier une plage 08:00-23:00 donnait
// « devient 18:00–22:00 » et LE SERVICE DU MIDI DISPARAISSAIT EN SILENCE. Un
// restaurant qui copie sa journée veut ses deux services, pas le plus long.
export function ajusterPlagePourJour(plage, horaireJour) {
  const d = timeToMinutes(plage?.heure_debut)
  const f = timeToMinutes(plage?.heure_fin)
  if (!(f > d)) return { statut: 'ignoree', raison: 'heures_invalides', debut: null, fin: null, morceaux: [] }

  const tel = () => ({
    statut: 'inchangee', raison: null,
    debut: minutesToTime(d), fin: minutesToTime(f),
    morceaux: [{ debut: minutesToTime(d), fin: minutesToTime(f) }],
  })
  // ⚠️ HORAIRES INCONNUS : ON NE TOUCHE À RIEN. Ajuster sur une ignorance
  // raccourcirait des plages parfaitement valables.
  if (!horaireJour) return tel()
  if (horaireJour.ouvert === false) return { statut: 'ignoree', raison: 'jour_ferme', debut: null, fin: null, morceaux: [] }

  const plages = []
  if (horaireJour.debut && horaireJour.fin) plages.push([timeToMinutes(horaireJour.debut), timeToMinutes(horaireJour.fin)])
  if (horaireJour.debut2 && horaireJour.fin2) plages.push([timeToMinutes(horaireJour.debut2), timeToMinutes(horaireJour.fin2)])
  if (plages.length === 0) return tel()

  // Un morceau par service touché, dans l'ordre de la journée. Le trou entre
  // les deux services n'en fait pas partie : personne ne commande à 15h.
  const morceaux = []
  for (const [a, b] of plages) {
    const debut = Math.max(d, a)
    const fin = Math.min(f, b)
    if (fin > debut) morceaux.push([debut, fin])
  }
  morceaux.sort((x, y) => x[0] - y[0])

  // Le jour est OUVERT, mais pas à cette heure-là : ce n'est pas la même
  // nouvelle, et le message ne doit pas les confondre.
  if (morceaux.length === 0) {
    return {
      statut: 'ignoree',
      raison: 'hors_ouverture',
      heures: plages.map(([a, b]) => `${minutesToTime(a)}–${minutesToTime(b)}`),
      debut: null,
      fin: null,
      morceaux: [],
    }
  }

  const [debut, fin] = morceaux[0]
  return {
    statut: (morceaux.length === 1 && debut === d && fin === f) ? 'inchangee' : 'raccourcie',
    raison: null,
    // ⚠️ `debut` et `fin` restent le PREMIER morceau : un appelant qui n'en
    // lisait qu'un continue de poser une plage valable, jamais une plage
    // inventée. Ceux qui veulent la journée entière lisent `morceaux`.
    debut: minutesToTime(debut),
    fin: minutesToTime(fin),
    morceaux: morceaux.map(([a, b]) => ({ debut: minutesToTime(a), fin: minutesToTime(b) })),
  }
}

// 🔴 UNE PLAGE NE DONNE QU'UN SEUL COURS (Alex, 07/09). À 10h il y a un cours,
// pas deux : si une plage en acceptait plusieurs, le premier client déciderait
// lequel a lieu, et ce serait le défaut du 07/09 reproduit À L'INTÉRIEUR du
// réglage censé le corriger.
//
// ⚠️ ET CE N'EST VRAI QUE DES COURS. Une plage 08:00-18:00 qui accepte coupe,
// couleur et head spa est parfaitement normale : le client choisit son heure,
// et une seule prestation s'y donne à la fois. Deux cours EN MÊME TEMPS sont
// deux plages — deux praticiens, ou deux lieux, que le créneau porte déjà.
//
// Rend le cours déjà coché, ou `null`.
export function coursDejaCoche(idsCoches, prestations) {
  const parId = new Map((prestations || []).map(p => [String(p.id), p]))
  for (const id of idsCoches || []) {
    const p = parId.get(String(id))
    if (p && Number(p.capacite) > 1) return p
  }
  return null
}

// Un cours collectif qu'AUCUN créneau ne vise nommément reste proposé partout :
// c'est le défaut d'origine, intact. On ne bloque pas (arbitrage d'Alex), on
// l'affiche au commerçant, qui seul sait si c'est ce qu'il veut.
export function prestationSansCreneauDedie(prestationId, liaisons) {
  if (!prestationId) return false
  if (!Array.isArray(liaisons)) return true
  return !liaisons.some(l => String(l.prestation_id) === String(prestationId))
}

// CE QUI EMPÊCHE UNE RÉSERVATION D'EXISTER À CET HORAIRE, OU RIEN.
//
// ⚠️ CETTE RÈGLE VIVAIT EN DEUX EXEMPLAIRES, ET LE SECOND N'AVAIT JAMAIS APPRIS
// LES COURS COLLECTIFS (défaut trouvé par Alex le 16/08). La grille de créneaux
// comptait bien les places et annonçait « 10 places restantes » ; le contrôle
// posé juste avant l'insertion refaisait le calcul à sa façon, sans la
// capacité, et refusait la troisième inscrite devant un cours à moitié vide.
//
// C'est la même famille que la colonne absente d'un `select` : le code était
// correct, il ne connaissait simplement pas toute l'information. La sortie est
// la même à chaque fois, UNE seule écriture de la règle, appelée par tous.
//
// `reservations` accepte les deux formes qui circulent : des minutes
// (`start`/`end`, ce que manipule le moteur) ou des heures (`heure_debut`/
// `heure_fin`, ce que rend la base). Les mélanger était le plus court chemin
// vers une troisième copie.
export function conflitReservation({ debut, fin, prestationId = null, capacite = 1, reservations = [] }) {
  const places = Number.isFinite(Number(capacite)) && Number(capacite) >= 1
    ? Math.floor(Number(capacite)) : 1

  const plages = (reservations || []).map(r => ({
    start: typeof r.start === 'number' ? r.start : timeToMinutes(r.heure_debut),
    end:   typeof r.end   === 'number' ? r.end   : timeToMinutes(r.heure_fin),
    prestation_id: r.prestation_id ?? null,
    place_no: Number(r.place_no) || 1,
  }))

  // ⚠️ Un cours collectif est, par définition, plusieurs réservations qui se
  // chevauchent. On sépare donc celles qui SONT cette séance de celles qui
  // occupent le praticien à côté : les premières se comptent, les secondes
  // bloquent, exactement comme avant les cours collectifs.
  const memeSeance = places > 1
    ? plages.filter(p => p.start === debut && p.end === fin
        && (prestationId === null || p.prestation_id === prestationId))
    : []
  const autres = places > 1 ? plages.filter(p => !memeSeance.includes(p)) : plages

  const base = {
    inscrits: places > 1 ? memeSeance.length : null,
    places: places > 1 ? places : null,
    placesOccupees: places > 1 ? memeSeance.map(p => p.place_no) : [],
  }

  if (autres.some(p => debut < p.end && fin > p.start)) {
    return { ...base, conflit: true, raison: 'occupe' }
  }
  if (places > 1 && memeSeance.length >= places) {
    return { ...base, conflit: true, raison: 'complet' }
  }
  return { ...base, conflit: false, raison: null }
}

// Calcule les slots pour une date donnée, durée prestation, créneaux du commerçant,
// horaires d'ouverture du shop, et reservations existantes.
//
// Triple filtre applique :
//   1. rdv_creneaux (heure_debut..heure_fin, pause_debut..pause_fin, pas_minutes, actif)
//   2. horaires_detail du shop ce jour-la (clip a l'heure d'ouverture/fermeture reelle).
//      Sans ce 2eme filtre, un merchant qui aurait mis rdv_creneaux 9h-23h mais shop
//      ferme a 19h proposerait des RDV jusqu'a 23h -> bug. Defense en profondeur.
//   3. Slot end ne peut pas depasser le min(creneau.fin, shop.fin) ni chevaucher pause.
//
// Retourne un array de { heure: "HH:MM", pris: bool, motif: 'reserve'|'incompatible'|null }
//   - pris=false                   : slot cliquable libre
//   - pris=true,  motif='reserve'  : RDV commence pile a cette heure
//   - pris=true,  motif='incompatible' : la duree de la prestation deborderait sur un
//                                        RDV qui suit (slot lui-meme libre mais inutilisable)
// ⚠️ `capacite` et `prestationId` sont OPTIONNELS, et leur absence rend
// exactement le comportement d'avant les cours collectifs : une personne par
// créneau. C'est ce qui protège tous les métiers à rendez-vous individuel,
// c'est-à-dire l'immense majorité, et les 103 vérifications de ce moteur.
//
// Avec une capacité supérieure à 1, un créneau cesse d'être « pris » dès la
// première réservation : il compte ses inscrits, et ne se ferme qu'une fois
// plein. Un chevauchement à HEURE DIFFÉRENTE reste bloquant dans tous les cas,
// personne ne pouvant être à deux endroits à la fois.
export function genererSlots({ dateChoisie, dureeMinutes, creneaux, reservations, horairesDetail, capacite = 1, prestationId = null, liaisonsCreneaux = null }) {
  if (!dateChoisie || !dureeMinutes || !creneaux?.length) return []
  const dateStr = isoDate(dateChoisie)
  const jour    = jourSemaineDate(dateChoisie)
  const nowMin  = isToday(dateChoisie) ? new Date().getHours() * 60 + new Date().getMinutes() : -1

  // ── Filtre 2 : horaires shop ce jour-la ────────────────────────────────────
  // Si shop ferme (ouvert:false) => aucun slot (meme si rdv_creneaux dit ouvert).
  // Sinon on memorise les bornes shop pour clipper plus bas.
  const horaireJour = horairesDetail?.[jour]
  if (horaireJour && horaireJour.ouvert === false) {
    console.info('[rdv-slots] shop ferme', { jour })
    return []
  }
  const shopOpen  = horaireJour?.debut ? timeToMinutes(horaireJour.debut) : null
  const shopClose = horaireJour?.fin   ? timeToMinutes(horaireJour.fin)   : null
  // Horaires à pause : le RDV doit tenir ENTIÈREMENT dans une des plages du
  // shop (ex. 11:00-14:00 puis 18:00-22:00 → pas de RDV 13:30-14:30).
  const shopRanges = []
  if (shopOpen !== null && shopClose !== null) shopRanges.push([shopOpen, shopClose])
  if (horaireJour?.debut2 && horaireJour?.fin2) shopRanges.push([timeToMinutes(horaireJour.debut2), timeToMinutes(horaireJour.fin2)])
  const shopCloseMax = shopRanges.length > 0 ? Math.max(...shopRanges.map(r => r[1])) : shopClose

  // ── Filtre 1 : rdv_creneaux applicables ce jour ────────────────────────────
  const creneauxJour = creneauxDuJour(creneaux, { dateStr, jour })
  if (creneauxJour.length === 0) return []

  // ── Filtre 1 bis : ce créneau accepte-t-il CETTE prestation ? (07/09) ──────
  // ⚠️ POSÉ ICI, DANS LE MOTEUR, ET PAS CHEZ LES APPELANTS. Filtré en amont, ce
  // geste serait oublié par le prochain écran qui demande des créneaux, et
  // l'oubli serait muet : le cours de yoga redeviendrait réservable à toutes
  // les heures sans que rien ne rougisse.
  const creneauxRetenus = creneauxPourPrestation(creneauxJour, prestationId, liaisonsCreneaux)
  if (creneauxRetenus.length === 0) return []

  // 🔴 ET LES HEURES QUE LES PLAGES DÉDIÉES RÉSERVENT AUX AUTRES. Sans ça, la
  // grande plage 08:00-18:00 proposait encore un soin à 10h, à l'heure du cours
  // de yoga : le premier client qui le prenait fermait le cours pour tout le
  // monde. Corriger dans un seul sens ne corrigeait rien.
  const reservees = tranchesReservees(creneauxJour, prestationId, liaisonsCreneaux)

  // ── Reservations existantes (en minutes depuis minuit) ─────────────────────
  const plagesReservees = (reservations || []).map(r => ({
    start: timeToMinutes(r.heure_debut),
    end:   timeToMinutes(r.heure_fin),
    prestation_id: r.prestation_id ?? null,
    place_no: Number(r.place_no) || 1,
  }))
  // Une capacité absente ou aberrante vaut 1 : le comportement d'avant.
  const places = Number.isFinite(Number(capacite)) && Number(capacite) >= 1
    ? Math.floor(Number(capacite)) : 1
  const startTimes = new Set(plagesReservees.map(p => minutesToTime(p.start)))
  console.info('[rdv-slots] genererSlots', {
    jour, dureeMinutes, nbCreneaux: creneauxRetenus.length, shopOpen, shopClose,
    nbResas: plagesReservees.length,
    resas: plagesReservees.map(p => `${minutesToTime(p.start)}-${minutesToTime(p.end)}`),
  })

  const slotsMap = new Map()
  for (const cr of creneauxRetenus) {
    // Clip aux bornes du shop : RDV impossible si le shop est ferme a ce moment.
    let debut = timeToMinutes(cr.heure_debut)
    let fin   = timeToMinutes(cr.heure_fin)
    if (shopOpen     !== null) debut = Math.max(debut, shopOpen)
    if (shopCloseMax !== null) fin   = Math.min(fin,   shopCloseMax)
    if (fin - debut < dureeMinutes) continue  // creneau trop court apres clip

    const pauseDebut = cr.pause_debut ? timeToMinutes(cr.pause_debut) : null
    const pauseFin   = cr.pause_fin   ? timeToMinutes(cr.pause_fin)   : null
    const pas        = cr.pas_minutes || 15

    for (let t = debut; t + dureeMinutes <= fin; t += pas) {
      const slotEnd = t + dureeMinutes
      if (nowMin >= 0 && t <= nowMin) continue  // passe (today)
      // Pause : la prestation chevauche la pause -> skip
      if (pauseDebut != null && pauseFin != null && t < pauseFin && slotEnd > pauseDebut) continue
      // Pause SHOP (horaires_detail debut2/fin2) : le RDV doit tenir dans une plage
      if (shopRanges.length > 1 && !shopRanges.some(([a, b]) => t >= a && slotEnd <= b)) continue
      // 🔴 L'heure d'un cours est à ce cours, même quand la salle est vide.
      if (tombeDansUneTrancheReservee(t, slotEnd, reservees)) continue
      const heure = minutesToTime(t)
      if (slotsMap.has(heure) && !slotsMap.get(heure).pris) continue

      // ─── LA MÊME SÉANCE, ET LE RESTE ───────────────────────────────────
      // ⚠️ La règle vit dans `conflitReservation`, et elle y vit SEULE. Elle
      // était recopiée ici et dans le contrôle d'avant insertion du tunnel,
      // où la capacité manquait : un cours à moitié vide refusait la troisième
      // inscrite alors que cette grille lui annonçait dix places libres.
      const c = conflitReservation({
        debut: t, fin: slotEnd, prestationId, capacite: places,
        reservations: plagesReservees,
      })

      const motif = !c.conflit ? null
        : c.raison === 'complet' ? 'complet'
        : (startTimes.has(heure) ? 'reserve' : 'incompatible')

      slotsMap.set(heure, {
        heure, pris: c.conflit, motif,
        // Ce que l'écran affiche sous un cours : « 4 places restantes ». Reste
        // à null pour un rendez-vous individuel, où la mention n'a aucun sens.
        placesTotal: c.places,
        placesPrises: c.inscrits,
        // Les places DÉJÀ OCCUPÉES, pour que l'inscription prenne la première
        // libre. ⚠️ Ce n'est pas « nombre d'inscrits + 1 » : quand quelqu'un
        // annule, sa place se libère AU MILIEU.
        placesOccupees: c.placesOccupees,
      })
    }
  }
  return [...slotsMap.values()].sort((a, b) => a.heure.localeCompare(b.heure))
}

// Génère N jours à partir d'aujourd'hui, en marquant lesquels sont ouverts (au moins 1 créneau).
export function genererJoursDispos({ nbJours, horairesDetail, creneaux }) {
  const out = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (let i = 0; i < nbJours; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    const jour = jourSemaineDate(d)
    const horaireJour = horairesDetail?.[jour]
    const aCreneau = (creneaux || []).some(c =>
      c.actif !== false
      && (c.date_specifique === isoDate(d) || (!c.date_specifique && c.jour_semaine === jour))
    )
    out.push({
      date: d,
      iso: isoDate(d),
      jour,
      ouvert: !!(horaireJour?.ouvert && aCreneau),
      isToday: i === 0,
    })
  }
  return out
}
