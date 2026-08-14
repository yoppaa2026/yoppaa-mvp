// lib/abonnements.js — LE CALCUL DES ABONNEMENTS, sans base de données.
//
// Un abonnement renverse le modèle habituel : la séance est déjà payée quand
// elle est réservée. Deux formes se vendent, et elles remplissent LE MÊME
// compteur :
//
//   'periode' ── du 1er septembre au 3 juillet, hors semaines écartées. Le
//                yoga, l'école de musique, le soutien scolaire.
//   'carnet'  ── 10 séances valables 6 mois. Le coach sportif, la cure de
//                soins, l'auto-école.
//
// ⚠️ UNE FOIS LE CONTRAT SIGNÉ, PLUS RIEN ICI NE DEMANDE CE QUI A ÉTÉ VENDU.
// Le contrat porte une fenêtre de validité et un nombre de séances ; toutes
// les questions qui suivent (« est-ce encore valable », « combien reste-t-il »,
// « peut-elle réserver ce jour-là ») se posent pareil dans les deux cas. C'est
// ce qui rend le carnet presque gratuit à côté de la période.
//
// Fonctions PURES : aucune horloge lue, aucune requête. La date du jour est
// toujours injectée, donc le banc peut jouer n'importe quel scénario.

import { jourSemaineDe, JOURS_SEMAINE_FR } from './creneaux'
// ⚠️ LA RÈGLE DE LA PLACE VIT DANS `cours-collectifs`, ON NE LA RECOPIE PAS.
// C'est elle qui sait qu'une place se libère AU MILIEU : sur un cours de dix où
// les places 1, 2 et 4 sont prises, la suivante est la 3. Une deuxième
// implémentation ici finirait par diverger, et le banc du bon cadeau a déjà
// enseigné qu'une règle recopiée est une règle qu'on oublie de corriger.
import { premierePlaceLibre } from './cours-collectifs'

// ⚠️ CES VALEURS SONT CELLES DE LA BASE, à la lettre. Les contraintes CHECK de
// MIGRATION_ABONNEMENTS.sql portent exactement les mêmes, et le banc compare
// les deux listes DANS LES DEUX SENS : toute valeur inventée ici serait
// refusée par PostgreSQL, toute valeur ajoutée en base doit apparaître ici.
export const TYPES_FORMULE = ['periode', 'carnet']
export const MODES_ABONNEMENT = ['place_fixe', 'credit']
export const STATUTS_ABONNEMENT = ['actif', 'resilie', 'termine']

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/
const estDate = (v) => FORMAT_DATE.test(String(v || ''))

// ⚠️ NOMBRE VRAIMENT PRÉSENT, et pas « ce que Number() veut bien en faire ».
// `Number(null)` vaut 0 et franchit tous les gardes-fous écrits à la va-vite :
// ce piège s'est déjà refermé deux fois sur ce projet. Un total absent n'est
// pas un total de zéro, c'est une donnée manquante, et les deux ne se
// traitent pas pareil.
function entierOuNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.floor(n) : null
}

// Midi UTC comme partout ailleurs dans le projet : à cette heure-là aucun
// changement d'heure ne peut faire basculer la date d'un jour.
function ajouterJours(dateStr, n) {
  if (!estDate(dateStr)) return null
  const t = new Date(`${dateStr}T12:00:00Z`).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t + n * 86400000).toISOString().slice(0, 10)
}

// Le lundi de la semaine d'une date. Sert de CLÉ DE SEMAINE pour le plafond
// hebdomadaire.
// ⚠️ On rend une date et non un numéro de semaine ISO : à cheval sur le nouvel
// an, deux dates voisines peuvent porter des numéros très différents, alors
// que leur lundi reste le même. La question posée est « est-ce la même
// semaine », pas « quelle est son numéro ».
export function cleSemaine(dateStr) {
  const jour = jourSemaineDe(dateStr)
  if (!jour) return null
  const index = JOURS_SEMAINE_FR.indexOf(jour)      // 0 = dimanche
  const recul = index === 0 ? 6 : index - 1          // le dimanche appartient à la semaine qui s'achève
  return ajouterJours(dateStr, -recul)
}

// Une des périodes écartées couvre-t-elle cette date ?
// Bornes INCLUSES des deux côtés : un commerçant qui écarte « du 27 au 31 »
// écarte le 27 et le 31.
export function dateEcartee(dateStr, periodesExclues = []) {
  if (!estDate(dateStr)) return false
  for (const p of periodesExclues || []) {
    const debut = p?.debut, fin = p?.fin
    if (!estDate(debut) || !estDate(fin)) continue
    if (dateStr >= debut && dateStr <= fin) return true
  }
  return false
}

// Deux périodes écartées qui se recouvrent : sans quoi le commerçant croit
// avoir retiré deux semaines et n'en a retiré qu'une.
export function exclusionsQuiSeChevauchent(periodesExclues = []) {
  const valides = (periodesExclues || []).filter(p => estDate(p?.debut) && estDate(p?.fin))
  for (let i = 0; i < valides.length; i++) {
    for (let j = i + 1; j < valides.length; j++) {
      const a = valides[i], b = valides[j]
      if (a.debut <= b.fin && b.debut <= a.fin) return [a, b]
    }
  }
  return null
}

// Les dates de toutes les séances d'une période, pour un jour de la semaine.
// ⚠️ C'EST CE QUE LE COMMERÇANT LIT AVANT DE CONFIRMER. Comme Yoppaa ne
// maintient aucun calendrier scolaire, la seule protection contre une saisie
// de travers est qu'il voie le résultat : Emily attend 36 séances, elle lit
// 36, ou elle voit tout de suite qu'elle s'est trompée.
export function datesDeSeances({ dateDebut, dateFin, jourSemaine, periodesExclues = [] } = {}) {
  if (!estDate(dateDebut) || !estDate(dateFin)) return []
  if (!JOURS_SEMAINE_FR.includes(jourSemaine)) return []
  if (dateFin < dateDebut) return []

  // Le premier jour voulu à partir du début de la période.
  let curseur = dateDebut
  for (let i = 0; i < 7 && jourSemaineDe(curseur) !== jourSemaine; i++) {
    curseur = ajouterJours(curseur, 1)
  }
  if (jourSemaineDe(curseur) !== jourSemaine) return []

  const dates = []
  // Garde-fou : une période saisie de travers ne doit pas faire tourner la
  // boucle indéfiniment. Dix ans de séances hebdomadaires, c'est déjà absurde.
  for (let garde = 0; garde < 520 && curseur && curseur <= dateFin; garde++) {
    if (!dateEcartee(curseur, periodesExclues)) dates.push(curseur)
    curseur = ajouterJours(curseur, 7)
  }
  return dates
}

// Combien de séances cette formule accorde-t-elle ?
// Les deux formes répondent à la même question, par deux chemins.
export function seancesDeLaFormule(formule, { jourSemaine = null } = {}) {
  if (!formule) return 0
  if (formule.type === 'carnet') {
    return Math.max(0, entierOuNull(formule.seances_carnet) ?? 0)
  }
  return datesDeSeances({
    dateDebut: formule.date_debut,
    dateFin: formule.date_fin,
    jourSemaine,
    periodesExclues: formule.periodes_exclues,
  }).length
}

// La fenêtre de validité d'un abonnement souscrit tel jour.
// ⚠️ Une période a des bornes ÉCRITES ; un carnet part du jour de l'achat.
// Après ce calcul les deux se ressemblent, et c'est tout l'intérêt : plus rien
// en aval n'a besoin de savoir ce qui a été vendu.
export function fenetreDeValidite(formule, { achatLe } = {}) {
  if (!formule) return null
  if (formule.type === 'carnet') {
    if (!estDate(achatLe)) return null
    const jours = entierOuNull(formule.validite_jours)
    if (jours === null || jours <= 0) return null
    return { debut: achatLe, fin: ajouterJours(achatLe, jours) }
  }
  if (!estDate(formule.date_debut) || !estDate(formule.date_fin)) return null
  return { debut: formule.date_debut, fin: formule.date_fin }
}

// Le solde restant, ou null si le contrat ne dit pas combien il accordait.
// ⚠️ null et 0 ne veulent pas dire la même chose : 0 signifie « tout
// consommé », null signifie « on ne sait pas », et on ne laisse jamais
// réserver sur un « on ne sait pas ».
export function soldeAbonnement(abonnement, seancesUtilisees = 0) {
  const total = entierOuNull(abonnement?.seances_total)
  if (total === null) return null
  const prises = Math.max(0, entierOuNull(seancesUtilisees) ?? 0)
  return Math.max(0, total - prises)
}

// ─── ⚠️ CE QUI CONSOMME UNE SÉANCE ────────────────────────────────────────
//
// DÉCISION D'ALEX DU 15/08 : **la séance est décomptée à la RÉSERVATION, et
// rendue si la cliente annule à temps.** Réserver bloque un créneau, donc ça
// coûte une place au commerçant ; mais prévenir à l'avance ne coûte rien à
// personne, et la séance revient au solde. Un no-show, lui, est perdu.
//
// ⚠️ ET « À TEMPS » N'A DEMANDÉ AUCUNE COLONNE. `/api/rdv/cancel` REFUSE déjà
// toute annulation passé le délai du commerçant (`rdv_delai_annulation_heures`,
// 24 h par défaut) : un rendez-vous au statut `annule_client` a donc forcément
// été annulé dans les temps, par construction. Rien à horodater, rien à
// migrer. Si un jour cette route accepte les annulations tardives, cette règle
// tombe et c'est ici qu'il faudra revenir.
//
// `annule_commercant` rend aussi la séance : la cliente n'y est pour rien.
// `reporte` n'est écrit nulle part dans le code, seulement lu ; il ne consomme
// pas, puisque le rendez-vous qui le remplace comptera pour lui.
export const STATUTS_CONSOMMENT_SEANCE = ['confirme', 'honore', 'no_show']

// ⚠️ ON COMPTE LES RÉSERVATIONS, ON NE DÉCRÉMENTE PAS UN COMPTEUR.
//
// Un compteur stocké dérive au premier accident : une annulation, une
// suppression, un déplacement, un webhook rejoué. Et le jour où il dérive,
// personne ne sait plus quel chiffre est le bon, celui du compteur ou celui de
// l'agenda. En comptant les réservations réelles, les deux NE PEUVENT PAS se
// contredire, parce qu'il n'y a qu'une source. Le résultat à l'écran est le
// même, la dette en moins.
export function seancesConsommees(reservations = [], { abonnementId = null } = {}) {
  return (reservations || []).filter(r => {
    if (!r) return false
    if (abonnementId != null && String(r.abonnement_id) !== String(abonnementId)) return false
    return STATUTS_CONSOMMENT_SEANCE.includes(r.statut)
  }).length
}

// Les dates déjà posées sur ce contrat, pour le plafond hebdomadaire.
export function datesConsommees(reservations = [], { abonnementId = null } = {}) {
  return (reservations || [])
    .filter(r => r
      && (abonnementId == null || String(r.abonnement_id) === String(abonnementId))
      && STATUTS_CONSOMMENT_SEANCE.includes(r.statut)
      && estDate(r.date_rdv))
    .map(r => r.date_rdv)
}

// Le contrat est-il vivant à cette date ?
export function abonnementValable(abonnement, { aujourdhui } = {}) {
  if (!abonnement) return false
  if (abonnement.statut !== 'actif') return false
  if (!estDate(aujourdhui)) return false
  if (!estDate(abonnement.date_debut) || !estDate(abonnement.date_fin)) return false
  return aujourdhui >= abonnement.date_debut && aujourdhui <= abonnement.date_fin
}

// La question que pose l'écran de réservation : cette cliente peut-elle poser
// une séance ce jour-là sur son abonnement ?
//
// ⚠️ ON REND UNE RAISON, JAMAIS UN SIMPLE FAUX. Un refus muet oblige l'écran à
// deviner quoi afficher, et il devine mal : « ton abonnement a expiré » et
// « tu as déjà ta séance cette semaine » n'appellent pas la même réaction.
export function peutReserverSurAbonnement(abonnement, {
  date,
  seancesUtilisees = 0,
  datesDejaPrises = [],
} = {}) {
  if (!abonnement) return { ok: false, raison: 'aucun_abonnement' }
  if (abonnement.statut === 'resilie') return { ok: false, raison: 'resilie' }
  if (abonnement.statut !== 'actif') return { ok: false, raison: 'termine' }
  if (!estDate(date)) return { ok: false, raison: 'date_invalide' }
  if (!abonnementValable(abonnement, { aujourdhui: date })) {
    return { ok: false, raison: 'hors_periode' }
  }

  const solde = soldeAbonnement(abonnement, seancesUtilisees)
  if (solde === null) return { ok: false, raison: 'solde_inconnu' }
  if (solde <= 0) return { ok: false, raison: 'solde_epuise' }

  // Le plafond hebdomadaire, sans lequel une cliente peut brûler ses 36
  // séances en deux mois alors qu'on lui en vend une par semaine.
  const plafond = entierOuNull(abonnement.seances_par_semaine) ?? 1
  const semaine = cleSemaine(date)
  const dejaCetteSemaine = (datesDejaPrises || [])
    .filter(d => estDate(d) && cleSemaine(d) === semaine).length
  if (dejaCetteSemaine >= plafond) {
    return { ok: false, raison: 'plafond_semaine', plafond }
  }

  return { ok: true, solde, plafond }
}

// ─── LA SÉRIE : QUELLE PLACE, QUELLE SEMAINE ──────────────────────────────
// Une souscription en mode `place_fixe` réserve toutes ses séances d'un coup.
// Cette fonction décide, pour chaque date, quelle place occuper.
//
// ⚠️ ELLE NE REFUSE JAMAIS TOUT PARCE QU'UNE SEMAINE EST PLEINE. Emily inscrit
// une cliente en novembre sur une année déjà bien remplie : deux ou trois
// semaines peuvent être complètes, et refuser les trente-trois autres serait
// absurde. On place ce qui se place et ON DIT LESQUELLES MANQUENT, parce qu'une
// cliente qui paie trente-six séances et n'en reçoit que trente-trois sans que
// personne ne le remarque, c'est le défaut le plus cher de tous.
//
// `occupeesParDate` porte, pour chaque date, les numéros de place DÉJÀ pris à
// cette heure-là : { '2026-09-07': [1, 2, 4] }.
export function placerLaSerie({ dates = [], capacite = 1, occupeesParDate = {} } = {}) {
  const placees = []
  const completes = []
  for (const date of dates || []) {
    const prises = occupeesParDate?.[date] || []
    const place = premierePlaceLibre({ capacite }, prises)
    if (place === null) completes.push(date)
    else placees.push({ date, place_no: place })
  }
  return { placees, completes }
}

// Ce qu'on dit au commerçant avant de créer la série.
// ⚠️ On NOMME les dates qui manquent. « 3 séances n'ont pas pu être placées »
// laisse le commerçant chercher lesquelles ; les dates lui permettent d'agir.
export function resumeDeLaSerie({ placees = [], completes = [] } = {}) {
  const total = placees.length + completes.length
  if (total === 0) return 'Aucune séance à placer sur cette période.'
  if (completes.length === 0) {
    return placees.length === 1
      ? '1 séance sera réservée.'
      : `${placees.length} séances seront réservées.`
  }
  const liste = completes.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)).join(', ')
  return `${placees.length} séance${placees.length > 1 ? 's' : ''} sur ${total}. `
    + `Complet le ${liste} : ${completes.length === 1 ? 'cette date ne sera pas réservée' : 'ces dates ne seront pas réservées'}.`
}

// Ce qu'on écrit à l'écran, côté commerçant comme côté cliente.
// ⚠️ CE QU'UNE SÉANCE D'ABONNEMENT COÛTE À L'ÉCRAN DU CLIENT : RIEN, elle est
// déjà payée. Et surtout PAS « 0 € ».
//
// Le prix vit sur le CONTRAT, et chaque séance porte `prix_estime: 0` pour ne
// pas multiplier le chiffre d'affaires du commerçant par trente-six. Le choix
// est bon côté commerçant, mais côté cliente il produisait un mensonge : la
// liste « Mes rendez-vous » affiche le prix dès qu'il n'est pas nul, et **zéro
// n'est pas nul**. Une cliente qui a payé son année à 400 € voyait donc
// trente-six lignes à « 0 € ».
//
// ⚠️ Troisième fois sur ce projet que `0` se fait passer pour une valeur
// légitime là où il fallait interroger l'ABSENCE. Ici on ne regarde même pas le
// nombre : on regarde s'il y a un contrat derrière, ce qui est la vraie
// question. Une prestation réellement offerte par le commerçant, elle, garde
// son « 0 € », et c'est juste.
//
// Rend null quand la séance n'appartient à aucun abonnement : l'écran affiche
// alors le prix comme il l'a toujours fait.
export function libellePrixSeance(rdv) {
  if (!rdv?.abonnement_id) return null
  return 'Compris dans ton abonnement'
}

export function libelleSolde(abonnement, seancesUtilisees = 0) {
  const solde = soldeAbonnement(abonnement, seancesUtilisees)
  if (solde === null) return null
  if (solde === 0) return 'Toutes tes séances sont utilisées'
  return solde === 1 ? 'Il te reste 1 séance' : `Il te reste ${solde} séances`
}

// ─── TOUT CE QU'UN ÉCRAN A BESOIN DE SAVOIR SUR UN ABONNEMENT ─────────────
//
// Une seule fonction pour l'écran de la cliente et pour celui du commerçant :
// « 150 €, 20 séances, il t'en reste 12, jusqu'au 14 février ». Deux calculs
// séparés auraient fini par afficher deux chiffres différents pour le même
// contrat, et c'est le genre d'écart qui fait perdre confiance dans l'outil
// entier.
//
// ⚠️ `null` reste distinct de `0` de bout en bout : un contrat qui ne dit pas
// combien de séances il accordait est ILLISIBLE, il n'en accorde pas zéro.
export function etatAbonnement(abonnement, reservations = [], { aujourdhui } = {}) {
  if (!abonnement) return null
  const id = abonnement.id ?? null
  const consommees = seancesConsommees(reservations, { abonnementId: id })
  const total = entierOuNull(abonnement.seances_total)
  const solde = soldeAbonnement(abonnement, consommees)
  const valable = abonnementValable(abonnement, { aujourdhui })
  return {
    id,
    type: abonnement.type ?? null,
    mode: abonnement.mode ?? null,
    statut: abonnement.statut ?? null,
    prix: abonnement.prix ?? null,
    total,
    consommees,
    solde,
    // Épuisé se dit d'un solde CONNU et tombé à zéro. Un solde inconnu n'est
    // pas un solde épuisé : l'écran doit dire qu'il ne sait pas, pas refuser.
    epuise: solde === 0,
    soldeInconnu: solde === null,
    debut: abonnement.date_debut ?? null,
    fin: abonnement.date_fin ?? null,
    valable,
    joursRestants: joursEntre(aujourdhui, abonnement.date_fin),
    libelle: libelleSolde(abonnement, consommees),
    dates: datesConsommees(reservations, { abonnementId: id }),
  }
}

// Combien de jours il reste avant une date, ou null si l'une des deux manque.
// Une date déjà passée rend 0, jamais un nombre négatif : « il te reste moins
// trois jours » ne veut rien dire à l'écran.
export function joursEntre(depuis, jusqua) {
  if (!estDate(depuis) || !estDate(jusqua)) return null
  const a = new Date(`${depuis}T12:00:00`)
  const b = new Date(`${jusqua}T12:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.max(0, Math.round((b - a) / 86400000))
}
