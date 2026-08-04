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
  const slotMap = new Map()  // key "HH:MM:SS-HH:MM:SS" -> { praticiens: Set, hasNull: bool }
  list.forEach(r => {
    const key = `${r.heure_debut}-${r.heure_fin}`
    if (!slotMap.has(key)) slotMap.set(key, { praticiens: new Set(), hasNull: false })
    const entry = slotMap.get(key)
    if (!r.praticien_id) entry.hasNull = true
    else if (eligibleIds.has(r.praticien_id)) entry.praticiens.add(r.praticien_id)
    // rdvs des praticiens non eligibles a cette prestation : ignores (ils n'occupent
    // pas les praticiens qui pourraient faire cette prestation)
  })
  const bloquants = []
  slotMap.forEach((entry, key) => {
    if (entry.hasNull || entry.praticiens.size >= nbEligibles) {
      const [heure_debut, heure_fin] = key.split('-')
      bloquants.push({ heure_debut, heure_fin })
    }
  })
  return bloquants
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
export function genererSlots({ dateChoisie, dureeMinutes, creneaux, reservations, horairesDetail }) {
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
  const creneauxJour = creneaux.filter(c =>
    c.actif !== false
    && (c.date_specifique === dateStr || (!c.date_specifique && c.jour_semaine === jour))
  )
  if (creneauxJour.length === 0) return []

  // ── Reservations existantes (en minutes depuis minuit) ─────────────────────
  const plagesReservees = (reservations || []).map(r => ({
    start: timeToMinutes(r.heure_debut),
    end:   timeToMinutes(r.heure_fin),
  }))
  const startTimes = new Set(plagesReservees.map(p => minutesToTime(p.start)))
  console.info('[rdv-slots] genererSlots', {
    jour, dureeMinutes, nbCreneaux: creneauxJour.length, shopOpen, shopClose,
    nbResas: plagesReservees.length,
    resas: plagesReservees.map(p => `${minutesToTime(p.start)}-${minutesToTime(p.end)}`),
  })

  const slotsMap = new Map()
  for (const cr of creneauxJour) {
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
      const heure = minutesToTime(t)
      if (slotsMap.has(heure) && !slotsMap.get(heure).pris) continue
      const overlap = plagesReservees.some(p => t < p.end && slotEnd > p.start)
      const motif = !overlap ? null : (startTimes.has(heure) ? 'reserve' : 'incompatible')
      slotsMap.set(heure, { heure, pris: overlap, motif })
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
