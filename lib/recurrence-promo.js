// LA RÉCURRENCE D'UNE PROMO (28/10, lot 2 du module promo).
//
// Idée d'Alex (21/10) : « 1+1 chaque mercredi, telle promo le premier samedi du
// mois, une actu qui revient tous les X jours, pour automatiser légèrement la
// comm des commerçants ». Le commerçant crée sa promo UNE fois, elle revient
// toute seule.
//
// LE MODÈLE (colonnes de `yoppaa_deals`, MIGRATION_RECURRENCE_PROMOS_28_10) :
//   • `recurrence`         : null (dates seules, comme avant) | 'hebdo' |
//                            'mensuel' | 'intervalle'
//   • `jours_semaine`      : hebdo, les jours (0 = dimanche … 6 = samedi,
//                            la convention de `Date.getDay()`)
//   • `rang_mois`          : mensuel, 1 à 4, ou -1 pour « le dernier »
//   • `jour_semaine_mois`  : mensuel, le jour de la semaine (0 … 6)
//   • `intervalle_jours`   : intervalle, tous les N jours depuis `date_debut`
//   • `plage_debut`, `plage_fin` : la plage horaire (« 11:00 », « 14:00 »),
//                            jugée à l'heure du RETRAIT ou du RENDEZ-VOUS
//                            (même esprit que la décision d'Alex du 28/10 :
//                            c'est le jour du rendez-vous qui compte).
// La série vit entre `date_debut` et `date_fin` (fin facultative : sans fin,
// la promo revient jusqu'à ce que le commerçant l'éteigne).
//
// ⚠️ PAS `heure_debut` / `heure_fin` : ces deux colonnes FONT l'invendu du soir
// (lib/anti-gaspi.js, `porteUneFenetre`). Les réutiliser transformerait une
// promo du midi en invendu.
//
// ⚠️ Module PUR, sans horloge cachée : le jour et l'heure sont toujours passés.

export const RECURRENCES = ['hebdo', 'mensuel', 'intervalle']

// 🔴 LES COLONNES À DEMANDER partout où un deal se lit colonne par colonne.
// Une colonne absente d'un select ne lève AUCUNE erreur : la promo serait
// jugée « sans récurrence » et disparaîtrait en silence (le défaut le plus
// fréquent du projet).
export const COLONNES_RECURRENCE = 'recurrence, jours_semaine, rang_mois, jour_semaine_mois, intervalle_jours, plage_debut, plage_fin'
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const RANGS = { 1: '1er', 2: '2e', 3: '3e', 4: '4e', [-1]: 'dernier' }

function versDate(iso) {
  return new Date(`${String(iso).slice(0, 10)}T12:00:00Z`)
}
function ecartJours(de, a) {
  return Math.round((versDate(a) - versDate(de)) / 86400000)
}
function ajouterJours(iso, n) {
  const d = versDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  const deux = (x) => String(x).padStart(2, '0')
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`
}

export function estRecurrente(deal) {
  return RECURRENCES.includes(deal?.recurrence)
}

// Les bornes de la série : début obligatoire, fin facultative.
function bornes(deal) {
  const debut = deal?.date_debut ? String(deal.date_debut).slice(0, 10) : (deal?.date_deal ? String(deal.date_deal).slice(0, 10) : null)
  const fin = deal?.date_fin ? String(deal.date_fin).slice(0, 10) : null
  return { debut, fin }
}

// Le Nième jour de la semaine du mois tombe-t-il ce jour-là ?
function estLeRangDuMois(jourISO, rang, jourSemaine) {
  const d = versDate(jourISO)
  if (d.getUTCDay() !== Number(jourSemaine)) return false
  const quantieme = d.getUTCDate()
  if (Number(rang) === -1) {
    // Le dernier : dans 7 jours, on a changé de mois.
    return versDate(ajouterJours(jourISO, 7)).getUTCMonth() !== d.getUTCMonth()
  }
  return Math.ceil(quantieme / 7) === Number(rang)
}

// La promo récurrente revient-elle CE jour-là ? (`false` pour une promo non
// récurrente : la règle des dates seules vit dans `dealActifCeJour`.)
export function recurrenceAccepte(deal, jourISO) {
  if (!estRecurrente(deal) || !jourISO) return false
  const jour = String(jourISO).slice(0, 10)
  const { debut, fin } = bornes(deal)
  if (!debut || jour < debut) return false
  if (fin && jour > fin) return false
  const jourSemaine = versDate(jour).getUTCDay()
  if (deal.recurrence === 'hebdo') {
    const jours = (deal.jours_semaine || []).map(Number)
    return jours.includes(jourSemaine)
  }
  if (deal.recurrence === 'mensuel') {
    if (deal.rang_mois == null || deal.jour_semaine_mois == null) return false
    return estLeRangDuMois(jour, deal.rang_mois, deal.jour_semaine_mois)
  }
  if (deal.recurrence === 'intervalle') {
    const n = Number(deal.intervalle_jours)
    if (!Number.isInteger(n) || n < 1) return false
    return ecartJours(debut, jour) % n === 0
  }
  return false
}

// La plage horaire accepte-t-elle cette heure ? Sans plage, ou sans heure
// connue (un jour pas encore précisé), oui : c'est le JOUR qui décide.
export function plageAccepte(deal, heure) {
  const d = deal?.plage_debut ? String(deal.plage_debut).slice(0, 5) : null
  const f = deal?.plage_fin ? String(deal.plage_fin).slice(0, 5) : null
  if (!d || !f || !heure) return true
  const h = String(heure).slice(0, 5)
  return d <= h && h < f
}

// « 11 h à 14 h », « 11 h 30 à 14 h ».
export function libellePlage(deal) {
  const d = deal?.plage_debut ? String(deal.plage_debut).slice(0, 5) : null
  const f = deal?.plage_fin ? String(deal.plage_fin).slice(0, 5) : null
  if (!d || !f) return ''
  const dire = (hm) => {
    const [h, m] = hm.split(':').map(Number)
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
  }
  return `${dire(d)} à ${dire(f)}`
}

// Le rythme, dit comme au comptoir : « Chaque mercredi », « Chaque mercredi
// et samedi », « Le 1er samedi du mois », « Le dernier vendredi du mois »,
// « Tous les 3 jours ».
export function libelleRecurrence(deal) {
  if (!estRecurrente(deal)) return ''
  if (deal.recurrence === 'hebdo') {
    const jours = [...new Set((deal.jours_semaine || []).map(Number))]
      .filter(j => j >= 0 && j <= 6)
      // Lundi d'abord, dimanche à la fin, comme un agenda belge.
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
      .map(j => JOURS[j])
    if (jours.length === 0) return ''
    if (jours.length === 7) return 'Tous les jours'
    const liste = jours.length === 1 ? jours[0] : `${jours.slice(0, -1).join(', ')} et ${jours[jours.length - 1]}`
    return `Chaque ${liste}`
  }
  if (deal.recurrence === 'mensuel') {
    const rang = RANGS[Number(deal.rang_mois)]
    const jour = JOURS[Number(deal.jour_semaine_mois)]
    return rang && jour ? `Le ${rang} ${jour} du mois` : ''
  }
  const n = Number(deal.intervalle_jours)
  if (n === 1) return 'Tous les jours'
  return Number.isInteger(n) && n > 1 ? `Tous les ${n} jours` : ''
}

// Les prochains jours où la promo revient, à partir de `depuis` (compris),
// sur `horizon` jours au plus. Sert à la section « Promos » et au tableau de
// bord (« prochaine fois : mercredi 4 nov. »).
export function prochainsJours(deal, depuis, { horizon = 62, nombre = 3 } = {}) {
  const sortie = []
  if (!estRecurrente(deal) || !depuis) return sortie
  for (let i = 0; i <= horizon && sortie.length < nombre; i++) {
    const j = ajouterJours(depuis, i)
    if (recurrenceAccepte(deal, j)) sortie.push(j)
  }
  return sortie
}

// Ce que le formulaire du commerçant envoie, contrôlé avant d'écrire : rend
// un message clair, ou `null` si tout va bien.
export function refusRecurrence(r) {
  if (!r || !r.recurrence) return null
  if (!RECURRENCES.includes(r.recurrence)) return 'Choisis comment la promo revient.'
  if (r.recurrence === 'hebdo') {
    const jours = (r.jours_semaine || []).map(Number).filter(j => Number.isInteger(j) && j >= 0 && j <= 6)
    if (jours.length === 0) return 'Coche au moins un jour de la semaine.'
  }
  if (r.recurrence === 'mensuel') {
    if (![1, 2, 3, 4, -1].includes(Number(r.rang_mois))) return 'Choisis le 1er, 2e, 3e, 4e ou dernier jour du mois.'
    const j = Number(r.jour_semaine_mois)
    if (!Number.isInteger(j) || j < 0 || j > 6) return 'Choisis le jour de la semaine.'
  }
  if (r.recurrence === 'intervalle') {
    const n = Number(r.intervalle_jours)
    if (!Number.isInteger(n) || n < 1 || n > 365) return 'Indique tous les combien de jours (1 à 365).'
  }
  if ((r.plage_debut && !r.plage_fin) || (!r.plage_debut && r.plage_fin)) return 'Indique l’heure de début ET l’heure de fin, ou aucune des deux.'
  if (r.plage_debut && r.plage_fin && String(r.plage_debut).slice(0, 5) >= String(r.plage_fin).slice(0, 5)) return 'L’heure de fin doit venir après l’heure de début.'
  return null
}
