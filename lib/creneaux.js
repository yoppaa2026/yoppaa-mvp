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
