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
// ⚠️ LES ANNULÉES NE COMPTENT PAS. Elles saturaient un créneau POUR TOUJOURS :
// un samedi matin se remplissait de paniers abandonnés jusqu'à afficher
// « complet » alors que personne n'avait réservé. Corrigé en base le 09/08.
//
// La fonction qui alimente l'affichage est `charge_creneaux_par_jour`, et elle
// compte PAR JOUR : un créneau « mardi 11h15 » revient chaque semaine, sans la
// date on ne sait pas de quel mardi on parle.
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

  if (typeof instantDebut !== 'function' || !creneau.heure_debut) return { ok: true }
  const debut = instantDebut(dateStr, creneau.heure_debut)
  if (!debut || isNaN(debut.getTime())) return { ok: true }

  // ⚠️ UN CRÉNEAU DÉJÀ COMMENCÉ N'EST PLUS COMMANDABLE, avec ou sans délai.
  // Ce filtre n'existait QUE dans le navigateur : la fiche masquait les
  // créneaux passés du jour, et le serveur, lui, les acceptait sans broncher.
  // Un onglet ouvert depuis le matin, ou une requête fabriquée, faisait donc
  // tomber à 15h une commande pour le créneau de 11h15. Le commerçant la
  // découvrait déjà en retard, sans jamais avoir eu la moindre chance.
  //
  // Le délai du commerçant vient s'ajouter PAR-DESSUS cette règle de base :
  // sans délai réglé, la limite est le début du créneau lui-même.
  const heures = Number(creneau.cutoff_heures)
  const marge = (Number.isFinite(heures) && heures > 0) ? heures * 3600 * 1000 : 0
  const limite = new Date(debut.getTime() - marge)
  if (maintenant.getTime() > limite.getTime()) {
    return { ok: false, raison: marge > 0 ? 'cutoff' : 'passe', heures: marge > 0 ? heures : 0, limite }
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
  // ⚠️ Le drapeau `bloque` est posé par l'appelant qui connaît le JOUR affiché
  // (un blocage vaut pour une date, pas pour la ligne hebdomadaire). Il est
  // traité tout à la fin, une fois le remplissage réel calculé.
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

  return appliquerBlocage(
    { modeTemps, capacite, utilise, utiliseEff, complet, places, bientot, presque },
    creneau.bloque === true,
  )
}

// ─── LE CRÉNEAU FERMÉ À LA VOLÉE PAR LE COMMERÇANT ────────────────────────
//
// ⚠️ ELLE NE RECALCULE PAS LA CAPACITÉ, ELLE L'AJUSTE. `calculerCapaciteCreneau`
// reste seul juge du remplissage réel : un blocage ne change pas le nombre de
// commandes déjà prises, il met à zéro ce qu'on peut encore accepter. C'est la
// règle d'Alex du 22/08 — les commandes déjà passées RESTENT.
//
// ⚠️ ELLE VIT ICI, ET PAS DANS LE TABLEAU DE BORD, depuis le 23/08 : la fiche
// client en a besoin elle aussi, et une règle de capacité recopiée dans deux
// fichiers finit toujours par diverger. `lib/tableau-de-bord.js` la réexporte
// pour ses propres appelants.
//
// @param {object} capacite le retour de `calculerCapaciteCreneau`
// @param {boolean} bloque
export function appliquerBlocage(capacite, bloque) {
  if (!capacite) return capacite
  if (!bloque) return { ...capacite, bloque: false }
  return {
    ...capacite,
    bloque: true,
    // Fermé pour la suite : plus une place, et l'état le dit en toutes lettres.
    complet: true,
    places: 0,
    bientot: false,
    presque: false,
  }
}

// ─── LE REMPLISSAGE, VU DU COMMERÇANT ─────────────────────────────────────
//
// ⚠️ LE COMMERÇANT NE VOYAIT RIEN. Il règle « max 5 commandes » ou « 30 minutes »
// dans sa configuration, le client lit « presque plein » sur la fiche… et le
// tableau de bord, lui, n'affichait ce remplissage NULLE PART. Le boulanger
// devait compter ses commandes à la main pour savoir s'il pouvait encore
// encaisser un client au comptoir sans faire sauter son créneau de 11h.
//
// Le calcul est REFAIT ICI plutôt que lu par la fonction serveur : le tableau
// de bord a déjà toutes les commandes du commerçant en mémoire, avec leurs
// lignes et leurs temps de préparation. Un appel de plus n'apprendrait rien.
//
// ⚠️ LES DEUX CÔTÉS DOIVENT DONNER LE MÊME CHIFFRE, sans quoi le commerçant
// jurerait avoir de la place là où son client lit « complet ». D'où trois
// règles copiées telles quelles sur `charge_creneaux_par_jour` :
//   • mêmes statuts occupants (STATUTS_OCCUPENT_CRENEAU) ;
//   • un article sans `temps_prepa` vaut 1 minute (le COALESCE de la fonction
//     SQL), et surtout PAS zéro ;
//   • une commande sans ligne compte quand même pour une commande.
//
// Fonction PURE : elle ne touche ni au réseau ni à l'horloge.
//
// @param champCreneau  'creneau_id' pour le Click & Collect, 'creneau_livraison_id'
//                      pour les tournées. Les deux tables partagent le modèle.
export function remplissageCreneaux({
  creneaux = [],
  commandes = [],
  jour,
  modeCapaciteDefaut,
  champCreneau = 'creneau_id',
} = {}) {
  const nomJour = jourSemaineDe(jour)
  if (!nomJour) return []

  const charge = new Map()
  for (const cmd of (commandes || [])) {
    if (!cmd || !STATUTS_OCCUPENT_CRENEAU.includes(cmd.statut)) continue
    const id = cmd[champCreneau]
    if (!id) continue
    // La date de RETRAIT, jamais celle de la prise de commande : un créneau
    // « mardi 11h15 » revient chaque semaine.
    if (String(cmd.date_commande || '').slice(0, 10) !== jour) continue

    const actuel = charge.get(id) || { count: 0, temps: 0 }
    actuel.count += 1
    for (const ligne of (cmd.commande_articles || [])) {
      const quantite = Number(ligne?.quantite) || 0
      // ⚠️ DEUX FORMES D'ABSENCE QUI SE COMPORTENT À L'OPPOSÉ. `Number(null)`
      // vaut 0 et passe pour un nombre parfaitement valide, là où
      // `Number(undefined)` vaut NaN. Une colonne vide arrivait donc à zéro
      // minute selon la façon dont elle avait voyagé, et le créneau paraissait
      // vide au commerçant pendant que son client le lisait presque plein.
      // Le test l'a pris sur le fait. On teste donc l'ABSENCE, pas le nombre.
      // Un zéro écrit exprès par le commerçant reste zéro : c'est aussi ce que
      // fait le COALESCE de la fonction SQL, qui ne remplace que le NULL.
      const brut = ligne?.article?.temps_prepa
      const prepa = (brut === null || brut === undefined || brut === '') ? 1 : Number(brut)
      actuel.temps += quantite * (Number.isFinite(prepa) ? prepa : 1)
    }
    charge.set(id, actuel)
  }

  // `jour_semaine` vide = créneau de tous les jours (grilles d'avant le
  // découpage par jour, encore en base chez les premiers commerces).
  const enrichis = (creneaux || [])
    .filter(cr => cr && cr.actif !== false)
    .filter(cr => cr.jour_semaine === nomJour || !cr.jour_semaine)
    .sort((a, b) => String(a.heure_debut || '').localeCompare(String(b.heure_debut || '')))
    .map(cr => ({
      ...cr,
      count: charge.get(cr.id)?.count || 0,
      temps_cumul: charge.get(cr.id)?.temps || 0,
    }))

  // Le débordement du mode temps a besoin du créneau précédent : une prépa trop
  // longue à 10h empiète sur 11h, et le commerçant doit le voir venir.
  return enrichis.map((cr, i) => ({
    creneau: cr,
    ...calculerCapaciteCreneau(cr, {
      modeCapaciteDefaut,
      creneauPrecedent: i > 0 ? enrichis[i - 1] : null,
    }),
  }))
}
