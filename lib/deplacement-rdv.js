// DÉPLACER UN RENDEZ-VOUS, ET LA RÈGLE QUI DIT SI UN CRÉNEAU ACCEPTE.
//
// ⚠️ RIEN NE PERMETTAIT DE DÉCALER UN RENDEZ-VOUS. Le tableau de bord savait
// en créer un, le marquer honoré, le passer en no-show et l'annuler. Décaler
// une cliente d'une heure obligeait donc à ANNULER puis RECRÉER : le client
// recevait « ton rendez-vous est annulé », le numéro changeait, l'acompte payé
// se perdait en route, et l'historique gardait la trace d'une annulation qui
// n'a jamais eu lieu. C'est le geste le plus banal d'un agenda, et c'était le
// seul qui manquait.
//
// Origine : décision d'Alex du 15/08 sur les abonnements. Il a écarté le
// déplacement d'une série en bloc et corrigé le modèle au passage : une cliente
// qui achète 36 séances ne vient pas religieusement tous les lundis, elle
// décale, elle échange, elle rattrape. Le jour choisi à la souscription n'est
// donc qu'un RYTHME DE DÉPART, et la vérité vit dans chaque réservation.
//
// ⚠️ MAIS CE N'EST PAS UN MODULE D'ABONNEMENTS. Un coiffeur qui décale son
// rendez-vous de 14h à 15h a exactement le même besoin, et rien ne le lui
// offrait. C'est pour ça que la règle vit ici et pas dans `abonnements.js`.
//
// Fonctions PURES : aucune lecture de base, aucune horloge. Ce qui dépend du
// monde extérieur, les places déjà prises et le lieu à gravier, est fourni par
// l'appelant qui, lui, sait interroger la base.

// Les jours en français minuscule, la forme utilisée partout dans ce projet :
// `horaires_detail`, `rdv_creneaux.jour_semaine` et `commercant_lieux` parlent
// tous cette langue-là. Lundi est en tête, comme un agenda belge.
export const JOURS_CLE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

// ⚠️ `getDay()` COMMENCE LE DIMANCHE, et notre semaine commence le lundi. Le
// décalage de 6 modulo 7 est ce qui évite qu'un dimanche aille chercher les
// horaires du lundi. Le module des abonnements a déjà eu à trancher la même
// question pour ses semaines.
export function jourCle(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  return JOURS_CLE[(date.getDay() + 6) % 7]
}

// 'HH:MM' ou 'HH:MM:SS' → minutes depuis minuit. Rend null quand l'heure est
// absente ou illisible.
//
// ⚠️ RENDRE `null` ET NON `0`. Une heure manquante n'est pas minuit, et ce
// projet s'est déjà fait prendre deux fois par `Number(null)` qui vaut zéro :
// une valeur absente passait alors tous les gardes-fous en se faisant passer
// pour une valeur basse.
export function minutesDeLHeure(heure) {
  if (typeof heure !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})/.exec(heure.trim())
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function heureDeMinutes(minutes) {
  const n = Number(minutes)
  if (!Number.isFinite(n) || n < 0) return null
  const h = Math.floor(n / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(Math.round(n) % 60).padStart(2, '0')}`
}

// L'heure de fin d'un rendez-vous, déduite de sa durée.
// Rend null si l'une des deux manque : mieux vaut refuser que d'inventer.
export function heureDeFin(heureDebut, dureeMinutes) {
  const debut = minutesDeLHeure(heureDebut)
  const duree = Number(dureeMinutes)
  if (debut === null || !Number.isFinite(duree) || duree <= 0) return null
  return heureDeMinutes(debut + duree)
}

// Les plages d'ouverture d'un jour, y compris la coupure de midi.
export function plagesOuverture(horaireJour) {
  if (!horaireJour || horaireJour.ouvert === false) return []
  const plages = []
  const paire = (d, f) => {
    const a = minutesDeLHeure(d), b = minutesDeLHeure(f)
    if (a !== null && b !== null && b > a) plages.push([a, b])
  }
  paire(horaireJour.debut, horaireJour.fin)
  paire(horaireJour.debut2, horaireJour.fin2)
  return plages
}

// Les créneaux de rendez-vous qui s'appliquent un jour donné.
// Une date précise l'emporte sur la règle hebdomadaire, comme partout ailleurs.
export function creneauxDuJour(creneaux, { dateStr, jour }) {
  const cle = jour || null
  return (creneaux || []).filter(c => c
    && c.actif !== false
    && (c.date_specifique === dateStr || (!c.date_specifique && c.jour_semaine === cle)))
}

// ─── LA RÈGLE ────────────────────────────────────────────────────────────────
//
// Ce créneau accepte-t-il ce rendez-vous ? Rend `{ ok: true }` ou un refus qui
// porte SA RAISON et SON TEXTE.
//
// ⚠️ UN REFUS SANS RAISON OBLIGE L'ÉCRAN À DEVINER, et il devine mal. Même
// principe que `peutReserverSurAbonnement` : le code appelant peut réagir
// différemment selon `raison`, et l'humain lit `message`.
//
// ⚠️ ET SURTOUT : `exclureId`. C'est TOUTE la différence entre créer et
// déplacer. Un rendez-vous qu'on décale de 14h à 14h30 se chevauche lui-même :
// sans cette exclusion, l'agenda refuserait tout déplacement de moins d'une
// durée de prestation, c'est-à-dire précisément les petits décalages qu'on
// demande le plus souvent.
export function creneauAcceptable({
  dateStr,
  heureDebut,
  dureeMinutes,
  horaireJour = null,
  creneauxJour = [],
  rdvsExistants = [],
  capacite = 1,
  prestationId = null,
  exclureId = null,
} = {}) {
  const debut = minutesDeLHeure(heureDebut)
  const duree = Number(dureeMinutes)
  if (debut === null || !Number.isFinite(duree) || duree <= 0) {
    return { ok: false, raison: 'duree_inconnue', message: 'Choisis une prestation et une heure valables.' }
  }
  const fin = debut + duree
  const places = Math.max(1, Number(capacite) || 1)

  // 1) Chevauchement avec un rendez-vous déjà pris.
  //
  // ⚠️ DEUX NATURES DE SUPERPOSITION, et les confondre a coûté cher le 15/08 :
  // les CO-INSCRITS d'un même cours se superposent par construction, ce n'est
  // pas un conflit tant qu'il reste de la place. Tout le reste en est un :
  // personne ne fait deux choses différentes à la même heure.
  const memeSeance = (r) => places > 1
    && prestationId != null
    && String(r.prestation_id) === String(prestationId)
    && r.date_rdv === dateStr
    && String(r.heure_debut || '').slice(0, 5) === String(heureDebut).slice(0, 5)

  const conflit = (rdvsExistants || []).some(r => {
    if (!r) return false
    if (exclureId != null && String(r.id) === String(exclureId)) return false
    if (r.date_rdv !== dateStr) return false
    if (!['confirme', 'honore'].includes(r.statut)) return false
    if (memeSeance(r)) return false
    const rDebut = minutesDeLHeure(r.heure_debut)
    const rFin = minutesDeLHeure(r.heure_fin)
    if (rDebut === null || rFin === null) return false
    return debut < rFin && fin > rDebut
  })
  if (conflit) {
    return { ok: false, raison: 'conflit', message: 'Ce créneau chevauche un RDV déjà existant. Choisis un autre horaire.' }
  }

  // 2) Le commerce est-il seulement ouvert ce jour-là ?
  if (!horaireJour || horaireJour.ouvert === false) {
    return { ok: false, raison: 'ferme', message: 'Ton commerce est fermé ce jour-là.' }
  }

  // 3) Le rendez-vous doit tenir ENTIÈREMENT dans une plage d'ouverture.
  const plages = plagesOuverture(horaireJour)
  if (plages.length > 0 && !plages.some(([a, b]) => debut >= a && fin <= b)) {
    const txt = plages.map(([a, b]) => `${heureDeMinutes(a)}-${heureDeMinutes(b)}`).join(' et ')
    return { ok: false, raison: 'hors_horaires', message: `Ce RDV tombe en dehors de tes heures d'ouverture (${txt}).` }
  }

  // 4) La pause.
  const pause = (creneauxJour || []).some(c => {
    const pDebut = minutesDeLHeure(c?.pause_debut)
    const pFin = minutesDeLHeure(c?.pause_fin)
    if (pDebut === null || pFin === null) return false
    return debut < pFin && fin > pDebut
  })
  if (pause) {
    return { ok: false, raison: 'pause', message: 'Ce RDV chevauche ta pause.' }
  }

  // 5) Le débordement de créneau.
  //
  // ⚠️ COMMENCER DANS LE CRÉNEAU NE SUFFIT PAS. Une prestation de deux heures
  // lancée à 11h sur un créneau 9h-12h finit à 13h, portes closes.
  const deborde = (creneauxJour || []).some(c => {
    const cDebut = minutesDeLHeure(c?.heure_debut)
    const cFin = minutesDeLHeure(c?.heure_fin)
    if (cDebut === null || cFin === null) return false
    if (debut < cDebut || debut >= cFin) return false
    return fin > cFin
  })
  if (deborde) {
    return { ok: false, raison: 'depasse_creneau', message: 'Ce RDV dépasse la fin du créneau d\'ouverture (déborde sur pause ou fermeture).' }
  }

  return { ok: true, raison: null, message: null }
}

// ─── LE DÉPLACEMENT LUI-MÊME ─────────────────────────────────────────────────

// Ce déplacement change-t-il seulement quelque chose ?
//
// ⚠️ Confirmer un déplacement vers le créneau ACTUEL ferait relire les places,
// réécrire la ligne et repartir un email au client pour lui annoncer que rien
// ne bouge. On le refuse avant d'y toucher.
export function deplacementUtile(rdv, { date, heure } = {}) {
  if (!rdv || !date || !heure) return false
  const memeJour = String(rdv.date_rdv || '') === String(date)
  const memeHeure = String(rdv.heure_debut || '').slice(0, 5) === String(heure).slice(0, 5)
  return !(memeJour && memeHeure)
}

// Les colonnes à réécrire pour poser un rendez-vous à son nouveau créneau.
//
// ⚠️ LA PLACE FAIT PARTIE DU DÉPLACEMENT, et c'est le piège de ce module. Un
// rendez-vous déplacé garde sinon le numéro de place qu'il occupait à son
// ancienne heure : deux inscrits d'un même cours se retrouvent sur la place 3,
// et l'index unique rejette l'écriture avec « ce créneau vient d'être pris »
// devant un cours à moitié vide. C'est exactement le défaut du 13/08, ressorti
// par une autre porte, celle de la mise à jour au lieu de l'insertion.
//
// ⚠️ ET LE LIEU SE REGRAVE. Une commerçante itinérante n'est pas au même
// endroit le lundi et le jeudi : déplacer un rendez-vous sans toucher au lieu
// enverrait la cliente à l'adresse de l'ancien jour. Le lieu est fourni par
// l'appelant, qui seul sait lire `commercant_lieux`.
export function champsDuDeplacement({ date, heure, dureeMinutes, placeNo, capacite, champsLieu = {} } = {}) {
  const fin = heureDeFin(heure, dureeMinutes)
  return {
    date_rdv: date,
    heure_debut: heure,
    heure_fin: fin,
    place_no: placeNo,
    capacite_creneau: Math.max(1, Number(capacite) || 1),
    ...champsLieu,
  }
}

// Ce qu'on écrit à l'écran une fois le déplacement fait, et ce qu'on écrit au
// client. Les deux disent d'où À OÙ, jamais seulement où.
//
// ⚠️ « Ton RDV est à 15h » ne se distingue pas d'une confirmation ordinaire. Le
// client doit LIRE le changement, sinon il vient à l'ancienne heure.
export function libelleDeplacement(rdv, { date, heure } = {}) {
  const avant = `${formatJour(rdv?.date_rdv)} à ${String(rdv?.heure_debut || '').slice(0, 5)}`
  const apres = `${formatJour(date)} à ${String(heure || '').slice(0, 5)}`
  return `${avant} → ${apres}`
}

// 'YYYY-MM-DD' → 'lundi 7 septembre'. Midi en dur pour ne pas basculer de jour
// selon le fuseau : une date sans heure lue à minuit UTC recule d'un jour chez
// nous en hiver.
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export function formatJour(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return ''
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const jour = jourCle(d)
  return `${jour} ${d.getDate()} ${MOIS[d.getMonth()]}`
}
