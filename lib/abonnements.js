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
// ⚠️ `place_fixe` N'EST PLUS ÉCRIT NULLE PART depuis le 18/08, mais il reste
// listé ici : la contrainte de la base l'accepte toujours, pour ne pas rendre
// illisibles les contrats vendus avant la suppression du jour fixe. Le banc
// compare cette liste à la contrainte dans les deux sens, et il rougirait si
// l'une des deux bougeait sans l'autre.
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

// ⚠️ LES SEMAINES D'UNE PÉRIODE, ET C'EST CE QUI COMPTE LES SÉANCES DEPUIS LE
// 18/08 (décision d'Alex : « on supprime le jour fixe par semaine, chaque
// semaine peut avoir un jour différent »).
//
// Le compte se faisait en comptant les mardis. Il se fait maintenant en
// comptant les SEMAINES, ce que le commentaire de la colonne `seances_total`
// décrivait pourtant depuis le premier jour : c'est le code qui s'en écartait.
//
// ⚠️ UNE SEMAINE COMPTE DÈS QU'ELLE A UN SEUL JOUR LIBRE, et ce n'est pas un
// détail : un mardi tombant dans un congé faisait perdre la séance à
// l'abonnée, alors que la semaine était encore largement ouverte. Elle garde
// désormais la sienne, posée un autre jour. Le défaut disparaît sans avoir
// jamais été signalé.
//
// La clé est le LUNDI de la semaine, celle qui sert déjà au plafond
// hebdomadaire : une seule définition de « la même semaine » dans tout le
// projet, sinon le compte et le plafond finiraient par se contredire.
export function semainesDeLaPeriode({ dateDebut, dateFin, periodesExclues = [] } = {}) {
  if (!estDate(dateDebut) || !estDate(dateFin)) return []
  if (dateFin < dateDebut) return []
  const vues = new Set()
  const semaines = []
  let curseur = dateDebut
  // Garde-fou, comme sur le parcours des séances : une période saisie de
  // travers ne doit pas faire tourner la boucle indéfiniment. Onze ans de
  // jours, c'est déjà absurde pour un abonnement.
  for (let garde = 0; garde < 4000 && curseur && curseur <= dateFin; garde++) {
    if (!dateEcartee(curseur, periodesExclues)) {
      const cle = cleSemaine(curseur)
      if (cle && !vues.has(cle)) { vues.add(cle); semaines.push(cle) }
    }
    curseur = ajouterJours(curseur, 1)
  }
  return semaines
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
//
// ⚠️ IL Y AVAIT DEUX COMPTES POUR UNE SEULE QUESTION, ET ILS NE DONNAIENT PAS
// LE MÊME CHIFFRE. Celui-ci comptait les jours d'un jour de semaine choisi ;
// celui de la vente en ligne prenait le jour le moins favorable ET multipliait
// par le plafond hebdomadaire. Sur une formule « période, jusqu'à 2 par
// semaine », le commerçant lisait 36 dans son aperçu pendant que la boutique
// en vendait 72. Personne ne l'avait vu parce que les deux chemins ne se
// croisaient jamais.
//
// Il n'en reste qu'un : les SEMAINES de la période, multipliées par le nombre
// de séances hebdomadaires. Le jour de la semaine ne joue plus aucun rôle.
export function seancesDeLaFormule(formule) {
  if (!formule) return 0
  if (formule.type === 'carnet') {
    return Math.max(0, entierOuNull(formule.seances_carnet) ?? 0)
  }
  const parSemaine = Math.max(1, entierOuNull(formule.seances_par_semaine) ?? 1)
  return semainesDeLaPeriode({
    dateDebut: formule.date_debut,
    dateFin: formule.date_fin,
    periodesExclues: formule.periodes_exclues,
  }).length * parSemaine
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

// ═══════════════════════════════════════════════════════════════════════════
// POSER UNE SÉANCE SUR SON ABONNEMENT, DEPUIS LA FICHE (Alex, 16/08)
//
// « Il est impossible de procéder à une réservation d'une séance de
// l'abonnement côté Yopper. Ça doit être hyper fluide. »
//
// ⚠️ C'ÉTAIT LE MAILLON MANQUANT DU MODULE. `peutReserverSurAbonnement` existe
// depuis le premier jour, elle est vérifiée sous toutes les coutures, et
// PERSONNE NE L'APPELAIT : une cliente pouvait acheter trente-six séances et
// n'avait aucun moyen d'en poser une seule. Elle payait, et devait ensuite
// téléphoner.
//
// ⚠️ LE CHOIX SE FAIT À L'ÉTAPE 3, PAS AU CHOIX DU COURS. Il a besoin de LA
// DATE : la période de validité, le plafond de la semaine et le solde en
// dépendent tous les trois. Un bouton « payer avec mon abonnement » posé à
// l'étape 1, qui se ferait refuser deux écrans plus loin, serait pire que pas
// de bouton du tout. À l'étape 1 on INFORME (« couvert par ton abonnement »),
// à l'étape 3 on DÉCIDE.
// ═══════════════════════════════════════════════════════════════════════════

// L'écran du client reçoit des ÉTATS (ce que rend /api/yopper/abonnements),
// pas des lignes de la table. Cette traduction existe pour que la règle de
// réservation, elle, n'ait jamais à connaître deux formes du même contrat.
//
// ⚠️ ELLE VIT ICI ET NULLE PART AILLEURS. Recopier ces correspondances dans
// l'écran, c'était s'assurer qu'un jour l'un des deux apprenne une colonne que
// l'autre ignore : c'est exactement ce qui a fait afficher « 2/12 » sur un
// cours complet le 16/08.
export function contratDepuisEtat(etat) {
  if (!etat) return null
  return {
    id: etat.id ?? null,
    statut: etat.statut ?? null,
    mode: etat.mode ?? null,
    date_debut: etat.debut ?? null,
    date_fin: etat.fin ?? null,
    seances_total: etat.total ?? null,
    seances_par_semaine: etat.seancesParSemaine ?? 1,
  }
}

// La question de l'étape 3 : « cette séance-là, je peux la poser sur mon
// abonnement ? » Le décompte et les dates déjà prises viennent de l'état, qui
// les a comptés en base ; on ne les redemande pas au client.
export function peutPoserSeance(etat, { date } = {}) {
  return peutReserverSurAbonnement(contratDepuisEtat(etat), {
    date,
    seancesUtilisees: Number(etat?.consommees) || 0,
    datesDejaPrises: etat?.dates || [],
  })
}

// Les abonnements de ce client qui couvrent CE cours chez CE commerçant.
//
// ⚠️ UN ABONNEMENT COUVRE UN COURS, celui de sa formule. Le yoga du lundi ne
// paie pas la séance de pilates, et proposer l'inverse ferait promettre au
// client une gratuité que le commerçant n'a jamais vendue.
//
// ⚠️ Pas de garde « si aucun cours demandé, rien » en tête : la comparaison
// ci-dessous s'en charge déjà, aucun contrat ne portant `null` comme cours. Ce
// garde avait été écrit par prudence, la mutation l'a montré muet, et une ligne
// qu'aucun test ne peut faire rougir est une ligne que personne ne maintiendra.
export function abonnementsPourPrestation(abonnements = [], { commercantId = null, prestationId = null } = {}) {
  return (abonnements || []).filter(a => a
    && a.statut === 'actif'
    && String(a.prestationId ?? '') === String(prestationId)
    && (!commercantId || String(a.commercant?.id ?? '') === String(commercantId)))
}

// ⚠️ PLUSIEURS ABONNEMENTS SUR LE MÊME COURS, ET C'EST LE CAS NORMAL.
//
// Alex, 17/08 : il a souscrit un DEUXIÈME abonnement, les deux s'affichent
// partout, et il ne pouvait toujours pas poser deux séances la même semaine.
// L'écran ne regardait que le PREMIER contrat, dont le plafond hebdomadaire
// disait non, et n'ouvrait jamais le second.
//
// ⚠️ CE MODÈLE ÉTAIT ÉCRIT DEPUIS LE PREMIER JOUR : chez Emily, « deux séances
// par semaine, c'est un SECOND ABONNEMENT avec réduction ». Le plafond hebdo
// appartient au CONTRAT, pas au client : deux contrats donnent deux séances.
// C'est l'écran qui n'avait pas suivi, pas la règle.
//
// ⚠️ ON CONSOMME CE QUI PÉRIME LE PLUS TÔT. Entre deux contrats utilisables, en
// entamer un qui court jusqu'en juillet pendant qu'un autre expire en mars,
// c'est laisser des séances payées mourir.
export function trierAbonnementsPourSeance(abonnements = [], { date } = {}) {
  const juges = (abonnements || [])
    .filter(Boolean)
    .map(a => ({ abonnement: a, verdict: peutPoserSeance(a, { date }) }))

  const parFinLaPlusProche = (x, y) => String(x.abonnement.fin || '').localeCompare(String(y.abonnement.fin || ''))

  // ⚠️ ET QUAND AUCUN NE PASSE, ON MONTRE LE REFUS LE PLUS ACTIONNABLE. « Tu as
  // déjà ta séance cette semaine » se règle en changeant de date ; « cet
  // abonnement est résilié » n'appelle aucun geste. Afficher le second devant
  // quelqu'un qui pouvait agir, c'est le renvoyer au téléphone pour rien.
  const RANG_RAISON = ['plafond_semaine', 'hors_periode', 'solde_epuise', 'solde_inconnu', 'termine', 'resilie']
  const parRaisonUtile = (x, y) => {
    const rx = RANG_RAISON.indexOf(x.verdict.raison), ry = RANG_RAISON.indexOf(y.verdict.raison)
    return (rx < 0 ? 99 : rx) - (ry < 0 ? 99 : ry)
  }

  return {
    utilisables: juges.filter(j => j.verdict.ok).sort(parFinLaPlusProche),
    refuses: juges.filter(j => !j.verdict.ok).sort(parRaisonUtile),
  }
}

// Ce qui distingue deux contrats à l'écran quand il faut choisir. ⚠️ Le nom de
// la formule ne suffit pas : deux abonnements annuels identiques portent le même
// libellé, et le client ne saurait pas lequel il désigne. Le solde et la date de
// fin, eux, les séparent toujours.
export function libelleChoixAbonnement(etat) {
  if (!etat) return ''
  const nom = etat.formule?.libelle || 'Abonnement'
  const solde = Number.isFinite(Number(etat.solde)) ? Number(etat.solde) : null
  const reste = solde === null ? '' : ` · ${solde} séance${solde > 1 ? 's' : ''}`
  const fin = estDate(etat.fin) ? ` · jusqu’au ${formatDateCourte(etat.fin)}` : ''
  return `${nom}${reste}${fin}`
}

// ⚠️ RÉPÉTER UNE SÉANCE SUR LES SEMAINES SUIVANTES (idée d'Alex, 18/08 :
// « ajouter un bouton pour copier un rdv d'une semaine sur d'autres semaines,
// pour faciliter les choses »).
//
// ⚠️ CE N'EST PAS UN CONFORT, C'EST CE QUI REMPLACE LE JOUR FIXE. La série des
// trente-six séances se générait toute seule sur un mardi ; le jour fixe parti,
// la commerçante pose la première où elle veut et la répète, puis corrige les
// semaines qui ne vont pas. Le même résultat, mais rattrapable.
//
// ⚠️ TROIS BORNES, ET AUCUNE N'EST FACULTATIVE : la fin du contrat, le solde
// restant, et les semaines où la personne a déjà sa séance. Sans la deuxième on
// pose plus de séances que le contrat n'en accorde ; sans la troisième on
// fabrique des refus que le plafond hebdomadaire rejettera une à une.
export function semainesSuivantes(depuis, {
  nombre = 1,
  jusqua = null,
  datesDejaPrises = [],
  soldeRestant = null,
} = {}) {
  if (!estDate(depuis)) return []
  const voulues = entierOuNull(nombre)
  if (voulues === null || voulues <= 0) return []
  // ⚠️ ON TESTE L'ABSENCE : un solde inconnu ne vaut pas zéro, il ne borne rien.
  const plafondSolde = soldeRestant === null || soldeRestant === undefined
    ? Infinity : Math.max(0, Number(soldeRestant) || 0)
  const semainesPrises = new Set(
    (datesDejaPrises || []).filter(estDate).map(cleSemaine))

  const dates = []
  let curseur = depuis
  for (let i = 0; i < voulues && dates.length < plafondSolde; i++) {
    curseur = ajouterJours(curseur, 7)
    if (!curseur) break
    if (estDate(jusqua) && curseur > jusqua) break
    // Une semaine où la personne a déjà sa séance est SAUTÉE, pas refusée : la
    // commerçante a demandé « les huit semaines suivantes », pas « huit lignes
    // quoi qu'il arrive ».
    if (semainesPrises.has(cleSemaine(curseur))) continue
    dates.push(curseur)
  }
  return dates
}

// ⚠️ LE MÊME REFUS, DIT AU COMMERÇANT. `expliquerRefusSeance` tutoie la cliente
// (« tu as déjà ta séance ») : servi tel quel à Emily, il lui parle d'elle alors
// qu'il parle de Sophie. Deux publics, deux voix, une seule règle.
export function expliquerRefusCommercant(raison, etat = null, { plafond = null, prenom = '' } = {}) {
  const qui = String(prenom || '').trim() || 'Cette personne'
  const n = plafond ?? etat?.seances_par_semaine ?? etat?.seancesParSemaine ?? 1
  switch (raison) {
    case 'plafond_semaine':
      return n > 1
        ? `${qui} a déjà ses ${n} séances de cette semaine-là. Choisis une autre semaine, ou pose la séance hors abonnement.`
        : `${qui} a déjà sa séance de cette semaine-là. Choisis une autre semaine, ou pose la séance hors abonnement.`
    case 'solde_epuise':
      return `${qui} a utilisé toutes les séances de son abonnement. Tu peux lui en vendre un nouveau, ou poser cette séance hors abonnement.`
    case 'hors_periode':
      return (estDate(etat?.date_debut) && estDate(etat?.date_fin))
        ? `Son abonnement couvre du ${formatDateCourte(etat.date_debut, { avecAnnee: true })} au ${formatDateCourte(etat.date_fin, { avecAnnee: true })}, cette date est en dehors.`
        : 'Cette date n’est pas couverte par son abonnement.'
    case 'resilie':
      return `L’abonnement de ${qui} est résilié.`
    case 'termine':
      return `L’abonnement de ${qui} n’est plus actif.`
    case 'solde_inconnu':
      return 'Ce contrat ne dit pas combien de séances il accordait : impossible d’en décompter une.'
    default:
      return 'Cette séance ne peut pas être posée sur cet abonnement.'
  }
}

// ⚠️ ON DIT POURQUOI, JAMAIS « INDISPONIBLE ». Les cinq refus n'appellent pas
// la même réaction : une semaine déjà prise se règle en choisissant une autre
// date, un solde épuisé en rachetant, une période finie en renouvelant. Un
// refus muet, lui, envoie tout le monde au téléphone.
export function expliquerRefusSeance(raison, etat = null, { plafond = null } = {}) {
  const n = plafond ?? etat?.seancesParSemaine ?? 1
  switch (raison) {
    case 'plafond_semaine':
      return n > 1
        ? `Tu as déjà tes ${n} séances de cette semaine-là. Choisis une date sur une autre semaine.`
        : 'Tu as déjà ta séance de cette semaine-là. Choisis une date sur une autre semaine.'
    case 'solde_epuise':
      return 'Tu as utilisé toutes les séances de ton abonnement.'
    case 'hors_periode':
      return (estDate(etat?.debut) && estDate(etat?.fin))
        ? `Ton abonnement couvre du ${formatDateCourte(etat.debut, { avecAnnee: true })} au ${formatDateCourte(etat.fin, { avecAnnee: true })}, cette date est en dehors.`
        : 'Cette date n’est pas couverte par ton abonnement.'
    case 'resilie':
      return 'Cet abonnement a été résilié.'
    case 'termine':
      return 'Cet abonnement n’est plus actif.'
    // Le solde ne se calcule pas quand le contrat ne porte pas de nombre de
    // séances. On le dit tel quel : c'est au commerçant de le corriger, et le
    // client ne doit pas rester devant un refus qu'il ne peut pas comprendre.
    case 'solde_inconnu':
      return 'Le nombre de séances de ton abonnement n’est pas lisible. Préviens ton commerçant.'
    case 'date_invalide':
      return 'Choisis d’abord une date.'
    default:
      return 'Cette séance ne peut pas être posée sur ton abonnement.'
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LA VENTE EN LIGNE (décision d'Alex du 15/08)
//
// Un Yopper achète son abonnement depuis un bloc « Abonnements » sur la fiche
// du commerçant, et le paie EN UNE FOIS. Le mensuel a été écarté : échec de
// prélèvement, carte expirée, résiliation en cours d'année et séances déjà
// réservées à reprendre, pour des cas pénibles à vie.
//
// ⚠️ ACHETÉ EN LIGNE VEUT DIRE MODE CRÉDIT, et ça tombe tout seul. En
// `place_fixe`, c'est le COMMERÇANT qui choisit le jour et l'heure des séances ;
// une cliente qui achète à 23h un dimanche ne peut pas décider à sa place. Le
// plafond hebdomadaire fait le reste : même une formule PÉRIODE s'achète en
// ligne, la cliente pose ses créneaux quand elle veut, une fois par semaine.
// ═══════════════════════════════════════════════════════════════════════════

// Cette formule peut-elle être mise en vitrine ?
//
// ⚠️ `vente_en_ligne` est à `false` PAR DÉFAUT en base, et le reste ici : une
// formule qu'on n'a pas explicitement mise en vente ne s'affiche nulle part.
// Un brouillon ou un tarif négocié pour une cliente en particulier ne doit pas
// se retrouver en vitrine parce qu'une migration est passée.
//
// Et un prix à zéro est refusé : « acheter » quelque chose de gratuit n'a aucun
// sens, et Stripe refuse de toute façon sous 0,50 €.
export function formuleVendableEnLigne(formule) {
  if (!formule) return false
  if (formule.vente_en_ligne !== true) return false
  if (formule.actif === false) return false
  if (formule.deleted_at) return false
  if (!(Number(formule.prix) > 0)) return false
  return seancesDeLaFormule(formule) > 0
}

// ⚠️ `seancesVenduesEnLigne` A DISPARU LE 18/08, et son raisonnement avec elle.
//
// Elle existait pour une seule raison : le compte d'une période dépendait du
// jour de la semaine, et la cliente qui achetait en ligne n'en choisissait
// aucun. Elle retenait donc le jour le MOINS favorable, pour ne jamais vendre
// une séance de plus que ce que la commerçante avait prévu.
//
// Le jour fixe n'existe plus : la question « quel jour » ne se pose à personne,
// et il ne reste qu'un compte, celui de `seancesDeLaFormule`. Garder deux noms
// pour une seule question, c'est fabriquer l'écart de demain, et celui d'hier
// avait déjà fait vendre 72 séances là où l'aperçu en annonçait 36.

// Une durée en jours, dite comme un humain la dit.
// 180 jours se lisent « 6 mois », pas « 180 jours ».
export function libelleValidite(jours) {
  const n = entierOuNull(jours)
  if (n === null || n <= 0) return null
  if (n % 365 === 0) { const a = n / 365; return a === 1 ? '1 an' : `${a} ans` }
  if (n >= 60 && n % 30 === 0) return `${n / 30} mois`
  if (n === 30) return '1 mois'
  return n === 1 ? '1 jour' : `${n} jours`
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

// 'YYYY-MM-DD' → '1er septembre'. Midi en dur : une date lue à minuit UTC
// recule d'un jour chez nous en hiver.
// ⚠️ L'ANNÉE SE DEMANDE, ET IL FAUT LA DEMANDER SUR UN REFUS. « Ton abonnement
// couvre du 1er septembre au 30 juin » est parfaitement clair sur une preuve
// d'achat, et parfaitement trompeur pour expliquer pourquoi le 1er septembre
// SUIVANT est refusé : le client relit la phrase, y voit sa date, et ne
// comprend pas. Un abonnement scolaire traverse deux années, c'est le cas
// normal et non l'exception.
export function formatDateCourte(dateStr, { avecAnnee = false } = {}) {
  if (!estDate(dateStr)) return ''
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const jour = d.getDate()
  return `${jour === 1 ? '1er' : jour} ${MOIS_FR[d.getMonth()]}${avecAnnee ? ` ${d.getFullYear()}` : ''}`
}

// CE QUE LA VITRINE ANNONCE, en français, sans jargon.
//
// ⚠️ LE CLIENT DOIT LIRE CE QU'IL ACHÈTE AVANT DE PAYER : combien de séances,
// jusqu'à quand, et à quel rythme. Un bouton « 150 € » tout seul se conteste,
// et se conteste avec raison.
export function resumeFormulePublique(formule, { achatLe = null } = {}) {
  if (!formule) return null
  const seances = seancesDeLaFormule(formule)
  const parSemaine = Math.max(1, entierOuNull(formule.seances_par_semaine) ?? 1)
  const fenetre = fenetreDeValidite(formule, { achatLe })

  const validite = formule.type === 'carnet'
    ? (libelleValidite(formule.validite_jours) ? `Valable ${libelleValidite(formule.validite_jours)}` : null)
    : (estDate(formule.date_debut) && estDate(formule.date_fin)
        ? `Du ${formatDateCourte(formule.date_debut)} au ${formatDateCourte(formule.date_fin)}`
        : null)

  return {
    libelle: formule.libelle || 'Abonnement',
    type: formule.type ?? null,
    seances,
    seancesLibelle: seances === 1 ? '1 séance' : `${seances} séances`,
    prix: Number(formule.prix) || 0,
    validite,
    fenetre,
    rythme: parSemaine === 1
      ? 'Une séance par semaine'
      : `Jusqu'à ${parSemaine} séances par semaine`,
    // ⚠️ Ce que le client doit comprendre AVANT de payer : il achète un droit
    // à réserver, pas des créneaux déjà posés. Sinon il attend un planning qui
    // n'arrivera jamais.
    reservation: 'Tu réserves tes séances toi-même, quand tu veux.',
  }
}

// ⚠️ LE CONTRAT, FIGÉ AU MOMENT DE L'ACHAT.
//
// Tout ce qui pourrait bouger dans la formule est recopié ici : la période, le
// prix, le nombre de séances et le plafond hebdomadaire. Le commerçant reste
// libre de modifier son catalogue sans réécrire l'histoire des contrats déjà
// vendus, exactement comme le prix et la TVA d'une commande.
//
// `achatLe` est fourni par l'appelant : cette fonction n'a pas d'horloge, ce
// qui est la seule façon de la tester sur des dates qui ne vieillissent pas.
export function contratDepuisFormule(formule, { achatLe, commercantId = null, client = {} } = {}) {
  if (!formule || !estDate(achatLe)) return null
  const fenetre = fenetreDeValidite(formule, { achatLe })
  if (!fenetre) return null
  return {
    commercant_id: commercantId ?? formule.commercant_id ?? null,
    formule_id: formule.id ?? null,
    // ⚠️ QUEL COURS CE CONTRAT COUVRE. Il manquait, et l'inscription à la main
    // le posait pourtant depuis le premier jour : deux chemins vers la même
    // table, un seul des deux renseignait la colonne. Sans elle, rien ne relie
    // un abonnement au cours de yoga qu'il paie, donc la fiche ne peut pas
    // proposer d'y poser une séance.
    //
    // ⚠️ Il est FIGÉ ICI, à la signature. Le commerçant peut demain rattacher
    // sa formule à un autre cours ; les contrats déjà vendus doivent garder
    // celui qui a été acheté.
    prestation_id: formule.prestation_id ?? null,
    // ⚠️ `mode` EST DE L'HISTOIRE DEPUIS LE 18/08. Il ne pilote plus rien : ce
    // qui distingue une abonnée dont les séances sont posées d'une autre n'est
    // plus une valeur stockée, c'est un fait qui se lit sur ses réservations.
    // La colonne survit pour les contrats vendus avant, et on continue d'y
    // écrire `credit` pour qu'elle reste cohérente.
    mode: 'credit',
    type: formule.type ?? 'periode',
    date_debut: fenetre.debut,
    date_fin: fenetre.fin,
    prix: Number(formule.prix) || 0,
    seances_total: seancesDeLaFormule(formule),
    seances_par_semaine: Math.max(1, entierOuNull(formule.seances_par_semaine) ?? 1),
    statut: 'actif',
    paye: true,
    paye_le: achatLe,
    mode_paiement: 'en_ligne',
    client_email: (client.email || '').trim().toLowerCase() || null,
    client_prenom: (client.prenom || '').trim() || null,
    client_nom: (client.nom || '').trim() || null,
    client_telephone: (client.telephone || '').trim() || null,
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LA CLIENTE LIT SUR SON ABONNEMENT (15/08)
//
// ⚠️ IL N'EXISTAIT AUCUN ÉCRAN. Depuis la vente en ligne, une cliente pouvait
// payer 150 €, recevoir un email, et l'application ne lui en reparlait plus
// jamais : ni le solde, ni la validité, ni les séances déjà posées. Signalé par
// Alex, qui demandait « l'endroit où le Yopper voit ses abonnements ».
//
// Cette fonction ne fait qu'une chose : traduire un état en une phrase. Elle
// est pure, donc le banc peut la juger sur ce qu'elle DIT, pas sur ce qu'elle
// contient.
// ═══════════════════════════════════════════════════════════════════════════

// L'ordre des questions n'est pas négociable et c'est tout l'intérêt de la
// fonction : résilié d'abord, périmé ensuite, solde inconnu, épuisé, puis le
// cas normal. Annoncer « il te reste 12 séances » sur un abonnement résilié
// serait un mensonge, et c'est exactement ce qu'un enchaînement écrit dans le
// désordre produirait.
// ⚠️ AUCUNE DATE EN PARAMÈTRE, ET C'EST VOLONTAIRE. J'en avais posé une par
// réflexe : `etatAbonnement` a DÉJÀ fait le travail de calendrier, elle rend
// `valable` et `joursRestants`. Une seconde date ici serait une deuxième source
// de vérité, donc un jour une divergence.
export function resumeAbonnementClient(etat) {
  if (!etat) return null

  if (etat.statut === 'resilie') {
    return { ton: 'termine', titre: 'Abonnement résilié', detail: detailValidite(etat), utilisable: false }
  }
  // `valable` est calculé par etatAbonnement : hors fenêtre, on ne promet rien.
  if (etat.valable === false) {
    return {
      ton: 'termine',
      titre: etat.fin ? `Terminé le ${formatDateCourte(etat.fin)}` : 'Terminé',
      detail: detailUtilisation(etat),
      utilisable: false,
    }
  }
  // ⚠️ UN SOLDE INCONNU N'EST PAS UN SOLDE ÉPUISÉ. L'écran doit dire qu'il ne
  // sait pas, jamais refuser : une formule enregistrée sans nombre de séances
  // existe, et sa cliente a payé.
  if (etat.soldeInconnu) {
    return {
      ton: 'inconnu',
      titre: 'Abonnement en cours',
      detail: detailValidite(etat),
      utilisable: true,
    }
  }
  if (etat.epuise) {
    return {
      ton: 'epuise',
      titre: 'Toutes tes séances sont utilisées',
      detail: detailValidite(etat),
      utilisable: false,
    }
  }
  return {
    ton: 'actif',
    titre: etat.libelle || '',
    detail: detailValidite(etat),
    utilisable: true,
  }
}

// « Valable jusqu'au 3 juillet », et l'urgence seulement quand elle est vraie.
// ⚠️ Le seuil est à 30 jours : rappeler « plus que 200 jours » toute l'année
// use l'avertissement, et le jour où il compte vraiment plus personne ne le lit.
export function detailValidite(etat) {
  if (!etat?.fin) return ''
  const base = `Valable jusqu’au ${formatDateCourte(etat.fin)}`
  const jours = etat.joursRestants
  if (jours === null || jours === undefined || jours > 30) return base
  if (jours === 0) return `${base}, dernier jour`
  return jours === 1 ? `${base}, plus qu’un jour` : `${base}, plus que ${jours} jours`
}

// Sur un abonnement fini, la validité n'intéresse plus personne : ce qui reste
// utile, c'est ce qui en a été fait.
export function detailUtilisation(etat) {
  const faites = Number(etat?.consommees) || 0
  if (!(etat?.total > 0)) return faites === 1 ? '1 séance suivie' : `${faites} séances suivies`
  return `${faites} séance${faites > 1 ? 's' : ''} sur ${etat.total}`
}

// La part consommée, entre 0 et 1, pour la barre de progression. `null` quand
// on ne sait pas : une barre pleine par défaut ferait croire à un abonnement
// épuisé.
export function partConsommee(etat) {
  if (!etat || !(etat.total > 0)) return null
  const faites = Number(etat.consommees) || 0
  return Math.max(0, Math.min(1, faites / etat.total))
}

// ═══════════════════════════════════════════════════════════════════════════
// L'APERÇU D'UNE FORMULE, SANS JOUR IMPOSÉ (décision d'Alex, 15/08 au soir)
//
// ⚠️ « Il faut aussi supprimer le jour pour lequel l'abonnement est valable,
// le client choisit lui-même. » C'est la suite directe de sa correction du
// matin : le jour fixe pour 36 semaines était une erreur de conception, une
// cliente décale et échange.
//
// ⚠️ ET LE 18/08, ALEX A CONSTATÉ QUE JE N'AVAIS FAIT QUE LA MOITIÉ. Le jour
// avait disparu de l'APERÇU de la formule, jamais du CONTRAT : l'inscription à
// la main réclamait toujours « son jour » et « son heure », et générait
// trente-six séances sur un mardi. Corriger l'endroit signalé n'est pas
// corriger le défaut, pour la quatrième fois sur ce projet.
//
// ⚠️ LE NOMBRE ANNONCÉ CHANGE DONC UNE SECONDE FOIS, ET IL DEVIENT EXACT. On
// annonçait le jour le MOINS favorable, le seul qu'on pouvait tenir quel que
// soit le choix de la cliente. Ce détour n'a plus lieu d'être : une séance par
// semaine, ce sont les SEMAINES de la période. Plus de minimum, plus de
// prudence à expliquer, le compte tombe juste.
// ═══════════════════════════════════════════════════════════════════════════

export function phraseApercuFormule(formule) {
  if (!formule) return null

  if (formule.type === 'carnet') {
    const n = entierOuNull(formule.seances_carnet)
    const jours = entierOuNull(formule.validite_jours)
    if (!(n > 0) || !(jours > 0)) return null
    return `${n} séance${n > 1 ? 's' : ''}, valables ${libelleValidite(jours)} à partir de l’achat.`
  }

  if (!estDate(formule.date_debut) || !estDate(formule.date_fin)) return null
  const n = seancesDeLaFormule(formule)
  if (!(n > 0)) return null
  return `${n} séance${n > 1 ? 's' : ''}, du ${formatDateCourte(formule.date_debut)} au ${formatDateCourte(formule.date_fin)}.`
}

// L'explication qui accompagne le nombre.
//
// ⚠️ ELLE DISAIT POURQUOI C'ÉTAIT UN MINIMUM, et ce n'en est plus un. Le compte
// se fait en semaines : il ne dépend plus du jour, donc il n'y a plus de
// prudence à justifier. Reste à dire ce que le commerçant a besoin de savoir,
// c'est-à-dire que le jour n'est pas figé et que le plafond hebdomadaire est
// ce qui tient le rythme.
export function expliquerApercuFormule(formule) {
  if (!formule || formule.type === 'carnet') return ''
  const parSemaine = Math.max(1, entierOuNull(formule.seances_par_semaine) ?? 1)
  return parSemaine > 1
    ? `Une semaine de la période, ${parSemaine} séances. Ton client choisit ses jours, sans jamais dépasser ${parSemaine} sur la même semaine.`
    : 'Une semaine de la période, une séance. Ton client choisit son jour, et il peut en changer d’une semaine à l’autre.'
}

// ═══════════════════════════════════════════════════════════════════════════
// APRÈS LE PAIEMENT : CE QUE LE CLIENT LIT, ET CE QU'IL REÇOIT
//
// ⚠️ TROIS SILENCES SUR LE MÊME PARCOURS, trouvés par Alex le 16/08 en payant
// réellement 400 € : aucun écran de confirmation, aucun email, et l'abonnement
// invisible dans son espace. Le contrat existait bien en base, le commerçant le
// voyait, et l'acheteur n'avait RIEN.
//
// ⚠️ C'EST LE PIRE ENDROIT POSSIBLE POUR UN SILENCE. Sans email, il n'a même
// aucune preuve d'achat, ce qui pour un abonnement à trois chiffres n'est pas
// une commodité mais une obligation.
//
// Les textes vivent ici, purs, pour que le banc les EXÉCUTE et relise ce qui en
// sort : un écran de confirmation qui se tait ne se voit pas dans un test qui
// cherche un nom de composant.
// ═══════════════════════════════════════════════════════════════════════════

// Ce que la fiche affiche au retour de Stripe. `retour` vaut 'ok' ou 'annule',
// et TOUT AUTRE VALEUR NE DIT RIEN : un paramètre inconnu ne doit pas fabriquer
// une confirmation, sinon n'importe qui la déclenche depuis la barre d'adresse.
export function messageRetourAbonnement(retour, { nomCommerce = '' } = {}) {
  if (retour === 'ok') {
    return {
      ton: 'ok',
      titre: 'Ton abonnement est Yoppé ! 🟣',
      message: nomCommerce
        ? `C'est bon, ton abonnement chez ${nomCommerce} est actif. Tu reçois l'email de confirmation d'ici quelques instants, avec le détail de ce que tu as pris.`
        : 'C’est bon, ton abonnement est actif. Tu reçois l’email de confirmation d’ici quelques instants.',
      // ⚠️ ON DIT LA SUITE, parce que c'est la question qu'il se pose. Un
      // abonnement en mode crédit ne pose aucune séance à l'agenda : sans cette
      // phrase, il attend un planning qui n'arrivera jamais.
      suite: 'Tes séances ne sont pas encore réservées : tu choisis toi-même tes dates, quand tu veux.',
    }
  }
  if (retour === 'annule') {
    return {
      ton: 'annule',
      titre: 'Paiement annulé',
      message: 'Aucun montant n’a été débité, et aucun abonnement n’a été créé. Tu peux réessayer quand tu veux.',
      suite: null,
    }
  }
  return null
}

// Le résumé d'un contrat, pour l'email comme pour l'écran. Une seule écriture,
// parce qu'un email qui annonce autre chose que l'écran est pire que pas
// d'email du tout.
export function resumeContratAchete(abonnement, { nomCommerce = '', nomFormule = '' } = {}) {
  if (!abonnement) return null
  const n = entierOuNull(abonnement.seances_total)
  return {
    formule: nomFormule || null,
    commerce: nomCommerce || null,
    seances: n > 0 ? `${n} séance${n > 1 ? 's' : ''}` : null,
    validite: (estDate(abonnement.date_debut) && estDate(abonnement.date_fin))
      ? `Du ${formatDateCourte(abonnement.date_debut)} au ${formatDateCourte(abonnement.date_fin)}`
      : null,
    prix: Number.isFinite(Number(abonnement.prix_paye))
      ? `${Number(abonnement.prix_paye).toFixed(2)} €`
      : null,
    // ⚠️ CE QU'IL A À FAIRE, et c'est l'information la plus utile des cinq :
    // sans elle, il attend un planning qui n'arrivera jamais.
    //
    // Cette phrase se lisait autrefois sur `mode`. Elle ne le peut plus depuis
    // le 18/08, et elle n'en a plus besoin : ce résumé ne parle que d'un
    // contrat ACHETÉ EN LIGNE, et un achat en ligne ne pose aucune séance. Le
    // commerçant n'est pas devant son écran au moment du paiement.
    aFaire: 'Tu réserves tes séances toi-même, quand tu veux.',
  }
}

// ⚠️ RETROUVER LE CONTRAT QU'ON VIENT DE PAYER, ET SURTOUT PAS UN AUTRE.
//
// Le contrat naît dans le webhook Stripe, quelques secondes après le retour du
// client sur la fiche. L'écran de confirmation interroge donc ses abonnements
// en boucle jusqu'à le voir apparaître.
//
// ⚠️ « LE PLUS RÉCENT CHEZ CE COMMERÇANT » NE SUFFIT PAS. Une cliente qui
// RENOUVELLE son abonnement en a déjà un : tant que le webhook n'a pas écrit le
// nouveau, l'ancien serait le plus récent, et l'écran annoncerait fièrement des
// dates et un solde périmés. Comme rien ne le contredirait ensuite, l'erreur
// resterait affichée jusqu'à ce qu'elle quitte la page.
//
// Deux repères sont donc posés AVANT le départ vers Stripe : la formule
// choisie, et l'instant du clic.
//
// ⚠️ ET SANS REPÈRE, ON NE DEVINE PAS. Si l'onglet a perdu sa mémoire, on rend
// `null` : l'écran dit alors qu'il attend, ce qui est vrai, plutôt que
// d'afficher un contrat dont on ne sait pas s'il est le bon.
const MARGE_HORLOGE_MS = 5 * 60 * 1000
const enMs = (v) => { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? t : null }

export function cleAchatAbonnement(slug) {
  return `yoppaa.abo.achat.${slug || ''}`
}

export function contratQuiVientDEtreAchete(abonnements = [], { formuleId = null, partiA = null, commercantId = null } = {}) {
  if (!formuleId && !partiA) return null
  // ⚠️ La marge absorbe l'écart entre l'horloge du téléphone et celle de la
  // base : cinq minutes de retard sur un mobile n'ont rien d'exceptionnel, et
  // sans elle le contrat tout juste écrit passerait pour un vieux contrat.
  const depart = enMs(partiA)
  const seuil = depart === null ? null : depart - MARGE_HORLOGE_MS
  const candidats = (abonnements || []).filter(a => {
    if (!a) return false
    if (commercantId && String(a.commercant?.id ?? '') !== String(commercantId)) return false
    if (formuleId && String(a.formule?.id ?? '') !== String(formuleId)) return false
    if (seuil !== null) {
      const t = enMs(a.acheteLe)
      if (t === null || t < seuil) return false
    }
    return true
  })
  if (!candidats.length) return null
  return candidats.slice().sort((a, b) => (enMs(b.acheteLe) ?? -Infinity) - (enMs(a.acheteLe) ?? -Infinity))[0]
}

// ⚠️ CE QUI SE PASSE ENSUITE, EN TROIS LIGNES, comme sur toute autre
// transaction de Yoppaa.
//
// Alex, 16/08 : l'achat d'un abonnement se concluait par un ENCADRÉ posé sur la
// fiche, quand une commande et un rendez-vous ouvrent tous deux un ÉCRAN. Sur
// le montant le plus élevé du catalogue, c'était la confirmation la plus
// discrète des trois. « Le client doit garder ses repères. »
//
// ⚠️ ET CES TROIS LIGNES SONT CELLES QUI MANQUAIENT VRAIMENT. Un abonnement ne
// pose AUCUNE séance à l'agenda au moment de l'achat : sans qu'on le dise,
// l'acheteur attend un planning qui n'arrivera jamais.
//
// ⚠️ LA BRANCHE `place_fixe` A DISPARU LE 18/08 avec le jour fixe. Elle
// annonçait « tes séances sont déjà réservées », ce qui n'a jamais pu être vrai
// ici : cet écran suit un PAIEMENT EN LIGNE, et le commerçant n'est pas devant
// son clavier à cet instant pour les poser.
export function etapesApresAbonnement({ nomCommerce = '' } = {}) {
  const chezQui = nomCommerce ? ` de ${nomCommerce}` : ''
  return [
    'Tu reçois ta **preuve d’achat** par email, avec le détail de ce que tu as pris.',
    `Tes séances ne sont **pas encore réservées** : tu choisis tes dates depuis la fiche${chezQui}, quand tu veux.`,
    'Ton solde et ta date de fin restent visibles dans **Commandes et rendez-vous**.',
  ]
}

// ─── COMMENT UN ABONNEMENT SE PAIE AU COMPTOIR ──────────────────────────────
//
// ⚠️ LE LIEN DE PAIEMENT STRIPE A ÉTÉ ÉCARTÉ PAR ALEX le 18/08 : espèces,
// Bancontact et virement suffisent, et on ne le repropose pas sans qu'un
// commerçant le réclame. Ces trois moyens sont donc la liste complète.
//
// ⚠️ ILS VIVENT ICI, EN UN SEUL ENDROIT, parce qu'ils s'écrivaient à deux :
// dans le formulaire d'inscription, et nulle part ailleurs, faute d'un second
// écran. Le jour où l'encaissement s'est ajouté à la liste des abonnés (19/08),
// la liste déroulante allait être recopiée à l'identique, et deux copies
// divergent toujours.
//
// ⚠️ « VIREMENT » RESTE, contrairement aux rendez-vous : un contrat à trois
// chiffres se règle couramment ainsi.
export const MOYENS_ENCAISSEMENT = [
  { cle: 'terminal', libelle: 'Terminal', detail: 'Bancontact, carte' },
  { cle: 'especes', libelle: 'Espèces', detail: 'dans le tiroir' },
  { cle: 'virement', libelle: 'Virement', detail: 'sur le compte' },
]

// Le moyen tel qu'on le dit à l'écran. ⚠️ Un moyen inconnu se NOMME plutôt que
// de disparaître : un contrat payé par un moyen qu'on ne sait plus lire reste
// un contrat payé, et le taire ferait croire à un impayé.
export function libelleMoyenEncaissement(cle) {
  if (!cle) return null
  const connu = MOYENS_ENCAISSEMENT.find(m => m.cle === cle)
  if (connu) return connu.libelle.toLowerCase()
  // `sur_place` a été écrit par les inscriptions d'avant le 17/08, quand le
  // moyen n'était pas demandé. Il dit « au comptoir », sans plus de détail.
  if (cle === 'sur_place') return 'au comptoir'
  if (cle === 'en_ligne') return 'en ligne'
  return String(cle).replace(/_/g, ' ')
}
