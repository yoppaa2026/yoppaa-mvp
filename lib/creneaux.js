// lib/creneaux.js
//
// Logique de capacité des créneaux, factorisée entre le Click & Collect
// (table `creneaux`) et la Livraison (table `livraison_creneaux`). Les deux
// partagent le MÊME modèle de capacité (décision Alex 05/07) :
//   - mode 'commandes' : plafond = max_commandes, consommé = count (nb commandes)
//   - mode 'temps'     : plafond = capacite_temps (min), consommé = temps_cumul
//                        (somme des temps_prepa des articles des commandes)
//
// Le mode est porté par le créneau (`mode_capacite`), avec repli sur le réglage
// commerçant (`commercants.mode_capacite`).
//
// Ce helper est PUR : il consomme des créneaux déjà enrichis de leur consommation
// (`count` ou `temps_cumul`), calculée en amont par l'appelant (fetch commandes
// actives du créneau). Il ne fait aucun accès DB.

// ─── QUELLES COMMANDES OCCUPENT UN CRÉNEAU ────────────────────────────────
//
// ⚠️ C'est la question qui décide si un créneau est plein, et elle n'avait
// jamais été posée au même endroit pour tout le monde.
//
// Occupent le créneau les commandes qui attendent encore d'être préparées ou
// remises. En sortent celles qui sont finies (`recupere`, `non_retire`) et
// celles qui n'existeront jamais (`annulee_*`).
//
// ⚠️ `paiement_en_attente` COMPTE, et c'est voulu : la commande est en cours de
// paiement, sa place est réservée le temps du passage sur Stripe. Le cron
// d'expiration libère celles qui n'aboutissent pas.
//
// ⚠️ LES ANNULÉES NE COMPTENT PAS. La fonction en base
// `charge_preparation_par_creneau` n'exclut aujourd'hui que `recupere` et
// `non_retire` : elle compte donc les paniers abandonnés et les commandes
// remboursées, qui saturent un créneau pour toujours. Un commerçant voit
// « complet » alors que personne n'a rien réservé.
export const STATUTS_OCCUPENT_CRENEAU = [
  'paiement_en_attente', 'en_attente', 'en_preparation', 'pret',
]

// ─── UN CRÉNEAU EST-IL ENCORE COMMANDABLE ? ───────────────────────────────
//
// Deux questions que personne ne posait, et qui coûtaient cher toutes les deux.
//
// ⚠️ 1. LE CRÉNEAU TOMBE-T-IL LE BON JOUR ? Un créneau porte un
// `jour_semaine` : « mardi 18h-19h ». Rien ne vérifiait que la date commandée
// était bien un mardi. Un onglet resté ouvert depuis la veille, ou une requête
// fabriquée, réservait un créneau du mardi pour une livraison du jeudi. Le
// commerçant voyait apparaître une tournée un jour où il ne livre pas.
//
// ⚠️ 2. LE DÉLAI LIMITE EST-IL RESPECTÉ ? `cutoff_heures` existe en base sur
// `livraison_creneaux`, le commerçant le règle dans son tableau de bord
// (« commande jusqu'à 2h avant »)… et **AUCUNE ligne de code ne le lisait**.
// Le réglage était parfaitement inerte : on pouvait commander une livraison
// pour un créneau démarrant dans dix minutes, sans laisser au commerçant le
// temps de préparer ni de rouler.
//
// Fonction PURE : l'heure courante est injectée, donc testable sans horloge.
export const JOURS_SEMAINE_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

// Midi en UTC comme point d'ancrage : jamais de bascule d'heure d'été à cette
// heure-là, le jour rendu est donc toujours celui de la date écrite.
export function jourSemaineDe(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null
  const d = new Date(`${dateStr}T12:00:00Z`)
  return isNaN(d.getTime()) ? null : JOURS_SEMAINE_FR[d.getUTCDay()]
}

// `instantDebut` reçoit (dateStr, heure) et rend l'instant réel du début de
// créneau. On l'injecte pour que ce module reste sans dépendance : l'appelant
// passe `brusselsInstant`, qui connaît l'heure d'été belge.
export function creneauCommandable(creneau, { dateStr, maintenant = new Date(), instantDebut } = {}) {
  if (!creneau) return { ok: false, raison: 'introuvable' }

  const jour = jourSemaineDe(dateStr)
  if (creneau.jour_semaine && jour && creneau.jour_semaine !== jour) {
    return { ok: false, raison: 'jour', attendu: creneau.jour_semaine, recu: jour }
  }

  // Pas de délai réglé (ou table sans la colonne) : rien à faire respecter.
  const heures = Number(creneau.cutoff_heures)
  if (!Number.isFinite(heures) || heures <= 0) return { ok: true }
  if (typeof instantDebut !== 'function' || !creneau.heure_debut) return { ok: true }

  const debut = instantDebut(dateStr, creneau.heure_debut)
  if (!debut || isNaN(debut.getTime())) return { ok: true }
  const limite = new Date(debut.getTime() - heures * 3600 * 1000)
  if (maintenant.getTime() > limite.getTime()) {
    return { ok: false, raison: 'cutoff', heures, limite }
  }
  return { ok: true }
}

// Calcule l'état de capacité d'un créneau donné.
//
// @param {Object} creneau              Créneau enrichi : { mode_capacite?, max_commandes,
//                                       capacite_temps?, count?, temps_cumul? }
// @param {Object} opts
// @param {string} [opts.modeCapaciteDefaut]  Repli commerçant si le créneau n'a pas de mode
// @param {Object} [opts.creneauPrecedent]    Créneau précédent (pour le débordement mode temps)
// @returns {{ modeTemps, capacite, utilise, utiliseEff, complet, places, bientot, presque }}
export function calculerCapaciteCreneau(creneau, { modeCapaciteDefaut, creneauPrecedent } = {}) {
  const modeTemps = (creneau.mode_capacite || modeCapaciteDefaut) === 'temps'
  const capacite = modeTemps ? (creneau.capacite_temps || 30) : creneau.max_commandes
  const utilise = modeTemps ? (creneau.temps_cumul || 0) : (creneau.count || 0)

  // Débordement mode temps : si le créneau précédent a dépassé sa capacité,
  // le surplus déborde sur le créneau courant (une prépa trop longue empiète).
  let debordement = 0
  if (modeTemps && creneauPrecedent) {
    const cap = creneauPrecedent.capacite_temps || 30
    const util = creneauPrecedent.temps_cumul || 0
    if (util > cap) debordement = util - cap
  }

  const utiliseEff = utilise + debordement
  const complet = utiliseEff >= capacite
  const places = capacite - utiliseEff
  // Seuils "presque plein" / "bientôt plein" : proportionnels en mode temps,
  // absolus (1-2 places) en mode commandes.
  const bientot = !complet && places <= (modeTemps ? capacite * 0.15 : 1)
  const presque = !complet && places <= (modeTemps ? capacite * 0.3 : 2) && !bientot

  return { modeTemps, capacite, utilise, utiliseEff, complet, places, bientot, presque }
}
