// La disponibilité d'un commerce, telle qu'elle s'affiche sur sa carte.
//
// ⚠️ CET ÉCRAN REFAISAIT SON PROPRE CALCUL, ET IL SE TROMPAIT DE TROIS FAÇONS.
// La page d'accueil recomptait les créneaux dans son coin, avec des règles qui
// n'étaient celles de personne d'autre :
//
//   1. Elle chargeait les créneaux SANS `jour_semaine`. Une grille hebdomadaire
//      arrivait en bloc et tout était pris pour aujourd'hui : les créneaux du
//      mardi bouchaient le lundi, et un créneau du samedi soir s'annonçait
//      « disponible » un lundi matin.
//   2. Elle comptait les commandes SANS filtre de date. Un créneau « mardi
//      11h15 » revient chaque semaine : sans la date, on ne sait pas de quel
//      mardi on parle, et les commandes de toutes les semaines passées
//      s'empilaient sur la même case.
//   3. Elle prenait pour occupante toute commande qui n'était pas `recupere`.
//      Les ANNULÉES comptaient donc pour toujours. C'est exactement le défaut
//      corrigé en base le 09/08, jamais reporté ici.
//
// Résultat cumulé : « Résa dès 21:00 » sur un commerce parfaitement libre.
//
// ⚠️ ET LA PASTILLE S'AFFICHAIT SUR DES COMMERCES SANS AUCUN CRÉNEAU. Une
// boutique de détail vend en retrait libre ou en colis, un salon vend pendant
// le rendez-vous : ni l'un ni l'autre n'a de grille. Zéro créneau se lisait
// « fermé », et on leur collait une pastille de réservation de créneau.
//
// Les règles appliquées ici sont celles de `lib/creneaux.js` et de la fonction
// SQL `charge_creneaux_par_jour`, à la lettre. Un seul endroit décide.

import { STATUTS_OCCUPENT_CRENEAU, jourSemaineDe, JOURS_SEMAINE_FR } from './creneaux.js'

// Les catégories qui vendent SANS grille de créneaux. La même liste que
// `lib/commandes-vue.js` côté commerçant : les deux écrans doivent être
// d'accord sur qui a des créneaux et qui n'en a pas.
export const CATEGORIES_SANS_CRENEAU = ['detail', 'vitrine']

export function aDesCreneaux(categorie) {
  return !CATEGORIES_SANS_CRENEAU.includes(String(categorie || 'alimentaire'))
}

// 'YYYY-MM-DD' + n jours. Ancrage à midi UTC : aucun basculement d'heure d'été
// à cette heure-là, le jour rendu est toujours celui qu'on croit.
export function jourPlus(jour, n) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour || ''))) return null
  const d = new Date(`${jour}T12:00:00Z`)
  if (isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + Number(n || 0))
  return d.toISOString().slice(0, 10)
}

export function heureEnMinutes(h) {
  const s = String(h || '')
  const hh = parseInt(s.slice(0, 2), 10)
  const mm = parseInt(s.slice(3, 5), 10)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return hh * 60 + mm
}

// Les créneaux d'un jour donné. `jour_semaine` vide = créneau de tous les jours
// (grilles d'avant le découpage par jour, encore en base chez les premiers
// commerces).
export function creneauxDuJour(creneaux, jour) {
  const nomJour = jourSemaineDe(jour)
  if (!nomJour) return []
  return (creneaux || [])
    .filter(cr => cr && cr.actif !== false)
    .filter(cr => cr.jour_semaine === nomJour || !cr.jour_semaine)
}

// La charge d'un jour, par créneau. Mêmes statuts occupants que partout
// ailleurs, et la date de RETRAIT, jamais celle de la prise de commande.
export function chargeDuJour(commandes, jour, champCreneau = 'creneau_id') {
  const charge = new Map()
  for (const cmd of (commandes || [])) {
    if (!cmd || !STATUTS_OCCUPENT_CRENEAU.includes(cmd.statut)) continue
    const id = cmd[champCreneau]
    if (!id) continue
    if (String(cmd.date_commande || '').slice(0, 10) !== jour) continue
    charge.set(id, (charge.get(id) || 0) + 1)
  }
  return charge
}

// L'état d'un commerce pour un jour donné.
//
// Rend `null` quand la question ne se pose pas : commerce sans grille, ou jour
// illisible. Un null ne s'affiche pas, et c'est voulu : mieux vaut pas de
// pastille qu'une pastille qui ment.
//
// @returns null | { etat: 'ouvert'|'urgent'|'complet'|'ferme', places }
export function statutCreneaux({ creneaux = [], commandes = [], jour, nowMin, categorie } = {}) {
  if (!aDesCreneaux(categorie)) return null
  const duJour = creneauxDuJour(creneaux, jour)
  if (duJour.length === 0) return { etat: 'ferme', places: 0 }

  const charge = chargeDuJour(commandes, jour)
  const minutes = Number(nowMin)
  const maintenant = Number.isFinite(minutes) ? minutes : -1

  // ⚠️ UNE CAPACITÉ ABSENTE N'EST PAS UNE CAPACITÉ DE ZÉRO. `0 < null` vaut
  // false : un créneau sans `max_commandes` (le commerçant travaille au temps
  // de préparation) se déclarait COMPLET en permanence. On ne connaît pas son
  // plafond, on ne prétend donc pas qu'il est plein ; la fiche, elle, fait le
  // calcul exact avec les temps de préparation.
  const aVenir = duJour.filter(cr => {
    const debut = heureEnMinutes(cr.heure_debut)
    return debut !== null && debut > maintenant
  })
  const dispos = aVenir.filter(cr => {
    const plafond = Number(cr.max_commandes)
    if (!Number.isFinite(plafond) || plafond <= 0) return true  // plafond inconnu
    return (charge.get(cr.id) || 0) < plafond
  })
  if (dispos.length === 0) return { etat: 'complet', places: 0 }

  // Les places ne se comptent que là où le plafond est connu.
  let places = 0
  let plafondConnu = false
  for (const cr of dispos) {
    const plafond = Number(cr.max_commandes)
    if (!Number.isFinite(plafond) || plafond <= 0) continue
    plafondConnu = true
    places += plafond - (charge.get(cr.id) || 0)
  }
  if (plafondConnu && places <= 2) return { etat: 'urgent', places }
  return { etat: 'ouvert', places }
}

// Le prochain jour qui a des créneaux, dans la limite de l'horizon du
// commerçant. `horizon` = nombre de jours réservables AU TOTAL, aujourd'hui
// compris : un horizon de 2 permet aujourd'hui et demain.
//
// @returns null | { jour, offset }
export function prochainJourAvecCreneaux({ creneaux = [], depuis, horizon = 2 } = {}) {
  const total = Number(horizon)
  const jours = Number.isFinite(total) && total >= 1 ? Math.floor(total) : 2
  for (let i = 1; i < jours; i++) {
    const jour = jourPlus(depuis, i)
    if (!jour) return null
    if (creneauxDuJour(creneaux, jour).length > 0) return { jour, offset: i }
  }
  return null
}

// Ce que la pastille écrit.
//
// ⚠️ PLUS AUCUNE HEURE MAGIQUE. On affichait « Résa dès 21:00 » dès que la
// journée était finie : une boulangerie dont le dernier créneau tombe à 11h
// passait DIX HEURES à dire au client de revenir plus tard, alors qu'elle
// aurait très bien pu prendre la commande. C'était la seule phrase de
// l'application qui demandait au Yopper de partir.
//
// On dit maintenant QUAND, pas À PARTIR DE QUELLE HEURE.
export function pastilleCreneaux({ statut, creneaux = [], jour, horizon = 2, fermeAujourdhui = false, quandOuvre = null } = {}) {
  if (!statut) return null

  if (statut.etat === 'ouvert' || statut.etat === 'urgent') {
    // Des créneaux existent, mais la boutique est fermée aujourd'hui : annoncer
    // un vert sous un « Fermé » gris se lit comme une contradiction.
    if (fermeAujourdhui && quandOuvre) {
      return { cle: 'plus_tard', label: `Créneaux dès ${quandOuvre}` }
    }
    if (statut.etat === 'urgent') return { cle: 'urgent', label: 'Réserve vite !' }
    return { cle: 'ouvert', label: 'Créneaux disponibles' }
  }

  // Plus rien aujourd'hui : on regarde le premier jour qui en a, dans l'horizon.
  const suivant = prochainJourAvecCreneaux({ creneaux, depuis: jour, horizon })
  if (suivant) {
    const quand = suivant.offset === 1
      ? 'demain'
      : JOURS_SEMAINE_FR[new Date(`${suivant.jour}T12:00:00Z`).getUTCDay()]
    return { cle: 'plus_tard', label: `Créneaux dès ${quand}` }
  }
  // Rien dans l'horizon : on le dit sans renvoyer le client à une heure.
  return { cle: 'complet', label: 'Plus de créneaux aujourd\'hui' }
}
