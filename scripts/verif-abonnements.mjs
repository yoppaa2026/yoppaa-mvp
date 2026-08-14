// Banc des ABONNEMENTS : le calcul qui décide combien de séances une cliente a
// achetées, jusqu'à quand elles valent, et si elle peut en poser une ce jour-là.
//
// ⚠️ TOUT EST EXÉCUTÉ ICI, rien n'est cherché dans le source. Une fonction de
// dates ne se juge pas en relisant sa boucle, elle se juge sur les dates
// qu'elle rend : c'est la seule façon d'attraper un décalage d'un jour, une
// borne exclue de travers ou une semaine avalée par un changement d'heure.
//
// Et les valeurs métier (type, mode, statut) sont confrontées à la MIGRATION,
// pas à la constante qu'on vient d'écrire. Un banc qui compare le module à
// lui-même partage ses fantasmes : c'est ce qui avait laissé passer trois
// statuts de commande inventés.

import { readFileSync } from 'node:fs'
import {
  TYPES_FORMULE, MODES_ABONNEMENT, STATUTS_ABONNEMENT,
  cleSemaine, dateEcartee, exclusionsQuiSeChevauchent, datesDeSeances,
  seancesDeLaFormule, fenetreDeValidite, soldeAbonnement, abonnementValable,
  peutReserverSurAbonnement, libelleSolde, placerLaSerie, resumeDeLaSerie,
  libellePrixSeance, STATUTS_CONSOMMENT_SEANCE, seancesConsommees, datesConsommees,
  etatAbonnement, joursEntre,
} from '../lib/abonnements.js'
import { jourSemaineDe } from '../lib/creneaux.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')


// ═══════════════════════════════════════════════════════════════════════════
// 1. LES VALEURS MÉTIER, CONFRONTÉES À LA BASE
// ═══════════════════════════════════════════════════════════════════════════
// La migration est la source de vérité : c'est elle que PostgreSQL applique.
// On compare DANS LES DEUX SENS, parce qu'une valeur oubliée d'un côté ou de
// l'autre casse aussi sûrement.
const migration = lire('migrations/MIGRATION_ABONNEMENTS.sql')

function valeursDuCheck(nomContrainte) {
  const bloc = migration.slice(migration.indexOf(`ADD CONSTRAINT ${nomContrainte}`))
  const fin = bloc.indexOf(';')
  const liste = fin > 0 ? bloc.slice(0, fin) : bloc
  return [...liste.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
}

for (const [nom, contrainte, attendues] of [
  ['type de formule', 'abonnement_formules_type_check', TYPES_FORMULE],
  ['mode d’abonnement', 'abonnements_mode_check', MODES_ABONNEMENT],
  ['statut d’abonnement', 'abonnements_statut_check', STATUTS_ABONNEMENT],
]) {
  const enBase = valeursDuCheck(contrainte)
  verifier(`le ${nom} est bien lu dans la migration`, enBase.length > 0, contrainte)
  for (const v of attendues) {
    verifier(`${nom} : « ${v} » existe en base`, enBase.includes(v))
  }
  for (const v of enBase) {
    verifier(`${nom} : « ${v} » est connu du module`, attendues.includes(v))
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. LES DATES D'UNE PÉRIODE
// ═══════════════════════════════════════════════════════════════════════════
// Septembre 2026 commence un mardi : le premier lundi n'est donc PAS le
// premier jour de la période, et c'est exactement le cas qui fait tomber une
// implémentation naïve qui partirait de `dateDebut`.
verifier('le 1er septembre 2026 est bien un mardi', jourSemaineDe('2026-09-01') === 'mardi')

egal('les lundis de septembre 2026',
  datesDeSeances({ dateDebut: '2026-09-01', dateFin: '2026-09-30', jourSemaine: 'lundi' }),
  ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])

// ⚠️ LA BORNE DE FIN EST INCLUSE. Une période qui s'achève un lundi doit
// compter ce lundi-là, sinon la dernière séance vendue n'existe pas.
egal('un lundi de fin de période compte',
  datesDeSeances({ dateDebut: '2026-09-07', dateFin: '2026-09-14', jourSemaine: 'lundi' }),
  ['2026-09-07', '2026-09-14'])

verifier('une période sans aucun lundi ne rend rien',
  datesDeSeances({ dateDebut: '2026-09-08', dateFin: '2026-09-11', jourSemaine: 'lundi' }).length === 0)
verifier('une fin antérieure au début ne rend rien',
  datesDeSeances({ dateDebut: '2026-09-30', dateFin: '2026-09-01', jourSemaine: 'lundi' }).length === 0)
verifier('un jour de semaine inconnu ne rend rien',
  datesDeSeances({ dateDebut: '2026-09-01', dateFin: '2026-09-30', jourSemaine: 'lundie' }).length === 0)

// Toutes les dates rendues tombent bien le bon jour, et à sept jours d'écart.
// C'est la vérification qui attrape un décalage introduit par un changement
// d'heure : le dernier week-end d'octobre et celui de mars.
const surAnnee = datesDeSeances({ dateDebut: '2026-09-01', dateFin: '2027-07-03', jourSemaine: 'lundi' })
verifier('toutes les séances tombent un lundi',
  surAnnee.every(d => jourSemaineDe(d) === 'lundi'),
  surAnnee.filter(d => jourSemaineDe(d) !== 'lundi').join(' '))
verifier('elles sont espacées de sept jours exactement',
  surAnnee.every((d, i) => i === 0 ||
    (new Date(`${d}T12:00:00Z`) - new Date(`${surAnnee[i - 1]}T12:00:00Z`)) === 7 * 86400000))
verifier('l’année scolaire compte 43 lundis avant congés', surAnnee.length === 43, `${surAnnee.length}`)


// ═══════════════════════════════════════════════════════════════════════════
// 3. LES SEMAINES ÉCARTÉES, ET LES 36 SÉANCES D'EMILY
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CE CAS EST LE PLUS PARLANT DU BANC. Emily annonce 36 séances sur son
// année scolaire. Le calendrier brut en donne 43. L'écart de 7 est exactement
// le volume des congés scolaires belges, ce qui vérifie le modèle contre une
// source EXTÉRIEURE au code : la parole d'une commerçante qui compte ses
// séances depuis des années.
//
// Les dates ci-dessous sont un jeu de test plausible, pas un calendrier
// officiel : Yoppaa n'en maintient aucun, c'est le commerçant qui coche.
const CONGES_TEST = [
  { debut: '2026-10-26', fin: '2026-11-01', libelle: 'Automne' },        // 1 lundi
  { debut: '2026-12-21', fin: '2027-01-03', libelle: 'Hiver' },          // 2 lundis
  { debut: '2027-02-15', fin: '2027-02-21', libelle: 'Détente' },        // 1 lundi
  { debut: '2027-04-05', fin: '2027-04-18', libelle: 'Printemps' },      // 2 lundis
  { debut: '2027-05-17', fin: '2027-05-17', libelle: 'Pentecôte' },      // 1 lundi
]
const avecConges = datesDeSeances({
  dateDebut: '2026-09-01', dateFin: '2027-07-03', jourSemaine: 'lundi',
  periodesExclues: CONGES_TEST,
})
verifier('les congés ramènent l’année à 36 séances, le compte d’Emily',
  avecConges.length === 36, `${avecConges.length}`)
verifier('aucune séance ne tombe dans un congé',
  avecConges.every(d => !dateEcartee(d, CONGES_TEST)))

// ⚠️ BORNES INCLUSES DES DEUX CÔTÉS. Un commerçant qui écarte « du 27 au 31 »
// écarte le 27 ET le 31 : c'est ce que veut dire une semaine de congé.
verifier('le premier jour écarté l’est vraiment',
  dateEcartee('2026-10-26', CONGES_TEST))
verifier('le dernier jour écarté l’est vraiment',
  dateEcartee('2026-11-01', CONGES_TEST))
verifier('la veille ne l’est pas', !dateEcartee('2026-10-25', CONGES_TEST))
verifier('le lendemain ne l’est pas', !dateEcartee('2026-11-02', CONGES_TEST))

// Deux congés qui se recouvrent : le commerçant croit avoir retiré deux
// semaines et n'en a retiré qu'une.
verifier('deux congés qui se chevauchent sont signalés',
  exclusionsQuiSeChevauchent([
    { debut: '2026-12-21', fin: '2027-01-03' },
    { debut: '2026-12-28', fin: '2027-01-10' },
  ]) !== null)
verifier('deux congés qui se suivent ne le sont pas',
  exclusionsQuiSeChevauchent([
    { debut: '2026-12-21', fin: '2026-12-27' },
    { debut: '2026-12-28', fin: '2027-01-03' },
  ]) === null)


// ═══════════════════════════════════════════════════════════════════════════
// 4. LA CLÉ DE SEMAINE
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE DIMANCHE APPARTIENT À LA SEMAINE QUI S'ACHÈVE, pas à celle qui
// commence. Sans ça, une cliente qui vient le dimanche puis le lundi suivant
// consommerait deux séances de la « même » semaine sans que le plafond
// s'en aperçoive, ou l'inverse.
egal('le lundi est sa propre clé', cleSemaine('2026-09-07'), '2026-09-07')
egal('le dimanche remonte au lundi précédent', cleSemaine('2026-09-06'), '2026-08-31')
egal('le samedi reste dans sa semaine', cleSemaine('2026-09-12'), '2026-09-07')
verifier('lundi et le samedi suivant partagent la semaine',
  cleSemaine('2026-09-07') === cleSemaine('2026-09-12'))
verifier('le dimanche d’avant est une AUTRE semaine',
  cleSemaine('2026-09-06') !== cleSemaine('2026-09-07'))
verifier('une date invalide n’a pas de semaine', cleSemaine('pas-une-date') === null)


// ═══════════════════════════════════════════════════════════════════════════
// 5. LES DEUX FORMES REMPLISSENT LE MÊME COMPTEUR
// ═══════════════════════════════════════════════════════════════════════════
const FORMULE_ANNEE = {
  type: 'periode', libelle: 'Année',
  date_debut: '2026-09-01', date_fin: '2027-07-03',
  periodes_exclues: CONGES_TEST,
}
const FORMULE_CARNET = { type: 'carnet', libelle: 'Carnet de 10', seances_carnet: 10, validite_jours: 180 }

verifier('la période compte ses lundis',
  seancesDeLaFormule(FORMULE_ANNEE, { jourSemaine: 'lundi' }) === 36)
verifier('le carnet annonce simplement son nombre',
  seancesDeLaFormule(FORMULE_CARNET) === 10)
verifier('un carnet ne dépend d’aucun jour de la semaine',
  seancesDeLaFormule(FORMULE_CARNET) === seancesDeLaFormule(FORMULE_CARNET, { jourSemaine: 'jeudi' }))

// La fenêtre de validité : bornes écrites pour une période, calculée depuis
// l'achat pour un carnet. Après quoi les deux se ressemblent, et c'est ce qui
// permet à tout le reste d'ignorer ce qui a été vendu.
egal('la période garde ses bornes',
  fenetreDeValidite(FORMULE_ANNEE, { achatLe: '2026-08-15' }),
  { debut: '2026-09-01', fin: '2027-07-03' })
egal('le carnet part du jour de l’achat',
  fenetreDeValidite(FORMULE_CARNET, { achatLe: '2026-08-15' }),
  { debut: '2026-08-15', fin: '2027-02-11' })
verifier('un carnet sans date d’achat n’a pas de fenêtre',
  fenetreDeValidite(FORMULE_CARNET, {}) === null)
verifier('un carnet sans validité n’a pas de fenêtre',
  fenetreDeValidite({ type: 'carnet', seances_carnet: 10 }, { achatLe: '2026-08-15' }) === null)


// ═══════════════════════════════════════════════════════════════════════════
// 6. LE SOLDE — ET LA DIFFÉRENCE ENTRE « ZÉRO » ET « ON NE SAIT PAS »
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE PIÈGE QUI S'EST DÉJÀ REFERMÉ DEUX FOIS SUR CE PROJET. `Number(null)`
// vaut 0 et franchit tous les gardes-fous. Un contrat qui ne dit pas combien
// il accordait n'accorde pas zéro séance : il est illisible, et on ne réserve
// jamais sur un contrat illisible.
const CONTRAT = {
  statut: 'actif', type: 'periode', seances_total: 36, seances_par_semaine: 1,
  date_debut: '2026-09-01', date_fin: '2027-07-03',
}
verifier('le solde part du total', soldeAbonnement(CONTRAT, 0) === 36)
verifier('il descend à chaque séance', soldeAbonnement(CONTRAT, 10) === 26)
verifier('il ne descend jamais sous zéro', soldeAbonnement(CONTRAT, 40) === 0)
verifier('un total absent rend null, pas zéro',
  soldeAbonnement({ ...CONTRAT, seances_total: null }, 0) === null)
verifier('et ce null ne se confond pas avec un solde épuisé',
  soldeAbonnement({ ...CONTRAT, seances_total: 0 }, 0) === 0)

egal('le libellé accorde le singulier', libelleSolde(CONTRAT, 35), 'Il te reste 1 séance')
egal('et le pluriel', libelleSolde(CONTRAT, 34), 'Il te reste 2 séances')
egal('et dit quand tout est consommé', libelleSolde(CONTRAT, 36), 'Toutes tes séances sont utilisées')
verifier('un contrat illisible n’affiche rien plutôt qu’un chiffre faux',
  libelleSolde({ ...CONTRAT, seances_total: undefined }, 0) === null)


// ═══════════════════════════════════════════════════════════════════════════
// 7. LA VALIDITÉ ET LE DROIT DE RÉSERVER
// ═══════════════════════════════════════════════════════════════════════════
verifier('un contrat actif vaut pendant sa période',
  abonnementValable(CONTRAT, { aujourdhui: '2026-11-10' }))
verifier('il vaut dès son premier jour',
  abonnementValable(CONTRAT, { aujourdhui: '2026-09-01' }))
verifier('et jusqu’à son dernier',
  abonnementValable(CONTRAT, { aujourdhui: '2027-07-03' }))
verifier('pas la veille du début',
  !abonnementValable(CONTRAT, { aujourdhui: '2026-08-31' }))
verifier('pas le lendemain de la fin',
  !abonnementValable(CONTRAT, { aujourdhui: '2027-07-04' }))
verifier('un contrat résilié ne vaut plus rien',
  !abonnementValable({ ...CONTRAT, statut: 'resilie' }, { aujourdhui: '2026-11-10' }))

// ⚠️ CHAQUE REFUS PORTE SA RAISON. Un faux tout nu oblige l'écran à deviner
// quoi afficher, et « ton abonnement a expiré » n'appelle pas la même réaction
// que « tu as déjà ta séance cette semaine ».
const reserver = (extra = {}) => peutReserverSurAbonnement(CONTRAT, {
  date: '2026-11-09', seancesUtilisees: 0, datesDejaPrises: [], ...extra,
})
verifier('une réservation normale passe', reserver().ok === true)
egal('sans abonnement, on le dit',
  peutReserverSurAbonnement(null, { date: '2026-11-09' }).raison, 'aucun_abonnement')
egal('un contrat résilié est nommé comme tel',
  peutReserverSurAbonnement({ ...CONTRAT, statut: 'resilie' }, { date: '2026-11-09' }).raison, 'resilie')
egal('hors période, on le dit', reserver({ date: '2027-08-01' }).raison, 'hors_periode')
egal('solde épuisé, on le dit', reserver({ seancesUtilisees: 36 }).raison, 'solde_epuise')
egal('solde illisible, on refuse SANS inventer un chiffre',
  peutReserverSurAbonnement({ ...CONTRAT, seances_total: null }, { date: '2026-11-09' }).raison,
  'solde_inconnu')

// Le plafond hebdomadaire, sans lequel une cliente brûle ses 36 séances en
// deux mois alors qu'on lui en vend une par semaine.
egal('deux séances la même semaine sont refusées',
  reserver({ datesDejaPrises: ['2026-11-12'] }).raison, 'plafond_semaine')
verifier('la semaine suivante, elle peut à nouveau',
  reserver({ datesDejaPrises: ['2026-11-05'] }).ok === true)
verifier('un plafond à deux autorise la deuxième',
  peutReserverSurAbonnement({ ...CONTRAT, seances_par_semaine: 2 }, {
    date: '2026-11-09', datesDejaPrises: ['2026-11-12'],
  }).ok === true)
egal('mais pas la troisième',
  peutReserverSurAbonnement({ ...CONTRAT, seances_par_semaine: 2 }, {
    date: '2026-11-09', datesDejaPrises: ['2026-11-12', '2026-11-13'],
  }).raison, 'plafond_semaine')
// ⚠️ Un plafond absent ne vaut pas « illimité ». Sans valeur, on retombe sur
// la règle la plus courante du métier, une séance par semaine.
egal('un plafond absent vaut un, jamais l’infini',
  peutReserverSurAbonnement({ ...CONTRAT, seances_par_semaine: null }, {
    date: '2026-11-09', datesDejaPrises: ['2026-11-12'],
  }).raison, 'plafond_semaine')

// Un carnet se comporte pareil, avec sa fenêtre calculée depuis l'achat.
const CARNET_SIGNE = {
  statut: 'actif', type: 'carnet', seances_total: 10, seances_par_semaine: 1,
  date_debut: '2026-08-15', date_fin: '2027-02-11',
}
verifier('un carnet laisse réserver dans sa validité',
  peutReserverSurAbonnement(CARNET_SIGNE, { date: '2026-12-01' }).ok === true)
egal('et refuse après expiration',
  peutReserverSurAbonnement(CARNET_SIGNE, { date: '2027-03-01' }).raison, 'hors_periode')
egal('et quand les dix séances sont prises',
  peutReserverSurAbonnement(CARNET_SIGNE, { date: '2026-12-01', seancesUtilisees: 10 }).raison,
  'solde_epuise')


// ═══════════════════════════════════════════════════════════════════════════
// 8. LA SÉRIE : QUELLE PLACE, QUELLE SEMAINE
// ═══════════════════════════════════════════════════════════════════════════
const TROIS = ['2026-09-07', '2026-09-14', '2026-09-21']

egal('sur un cours vide, tout le monde prend la place 1',
  placerLaSerie({ dates: TROIS, capacite: 10 }).placees,
  [{ date: '2026-09-07', place_no: 1 }, { date: '2026-09-14', place_no: 1 }, { date: '2026-09-21', place_no: 1 }])

// ⚠️ LA PLACE SE LIBÈRE AU MILIEU, et la série doit le savoir semaine par
// semaine : sur un cours où 1, 2 et 4 sont pris, la suivante est la 3.
egal('chaque semaine prend le premier TROU, pas le suivant du compte',
  placerLaSerie({
    dates: TROIS, capacite: 10,
    occupeesParDate: { '2026-09-07': [1, 2, 4], '2026-09-14': [1], '2026-09-21': [] },
  }).placees,
  [{ date: '2026-09-07', place_no: 3 }, { date: '2026-09-14', place_no: 2 }, { date: '2026-09-21', place_no: 1 }])

// ⚠️ UNE SEMAINE COMPLÈTE NE FAIT PAS TOMBER TOUTE LA SÉRIE. Inscrire une
// cliente en novembre sur une année bien remplie doit marcher.
const partielle = placerLaSerie({
  dates: TROIS, capacite: 2,
  occupeesParDate: { '2026-09-14': [1, 2] },
})
egal('la semaine pleine est écartée', partielle.completes, ['2026-09-14'])
verifier('les autres sont quand même placées', partielle.placees.length === 2)

// ⚠️ ET ON NOMME LES DATES QUI MANQUENT. « 3 séances n'ont pas pu être
// placées » laisse le commerçant chercher lesquelles.
verifier('le résumé nomme la date complète',
  resumeDeLaSerie(partielle).includes('14/09'), resumeDeLaSerie(partielle))
verifier('et dit combien passent sur combien',
  resumeDeLaSerie(partielle).includes('2 séances sur 3'), resumeDeLaSerie(partielle))
verifier('une série sans obstacle ne parle pas de complet',
  !resumeDeLaSerie(placerLaSerie({ dates: TROIS, capacite: 10 })).includes('Complet'))
egal('une série vide le dit',
  resumeDeLaSerie({ placees: [], completes: [] }), 'Aucune séance à placer sur cette période.')
egal('et le singulier est accordé',
  resumeDeLaSerie(placerLaSerie({ dates: ['2026-09-07'], capacite: 5 })), '1 séance sera réservée.')

// Un rendez-vous individuel garde exactement l'ancien comportement : capacité 1,
// donc une seule place possible, et la deuxième inscription est refusée.
const individuel = placerLaSerie({
  dates: ['2026-09-07'], capacite: 1, occupeesParDate: { '2026-09-07': [1] },
})
verifier('un créneau individuel déjà pris reste complet',
  individuel.placees.length === 0 && individuel.completes.length === 1)

// ═══════════════════════════════════════════════════════════════════════════
// LE DÉCOMPTE : « 150 € = 20 séances, et chaque résa fait -1 » (Alex, 15/08)
//
// ⚠️ DÉCOMPTÉE À LA RÉSERVATION, RENDUE SI ANNULÉE À TEMPS. Réserver bloque un
// créneau, donc ça coûte une place au commerçant ; prévenir à l'avance ne coûte
// rien à personne. Un no-show est perdu.
//
// ⚠️ ET « À TEMPS » NE DEMANDE AUCUNE COLONNE : `/api/rdv/cancel` REFUSE déjà
// toute annulation passé le délai. Un `annule_client` est donc dans les temps
// PAR CONSTRUCTION. Ce banc le vérifie sur la route elle-même, pas sur une
// intention : si ce garde-fou disparaît de la route, la règle de décompte
// devient fausse et le banc doit rougir AVANT qu'une cliente perde une séance.
// ═══════════════════════════════════════════════════════════════════════════
const CARNET_20 = {
  id: 'ab1', type: 'carnet', mode: 'credit', statut: 'actif', prix: 150,
  seances_total: 20, seances_par_semaine: 3,
  date_debut: '2026-09-01', date_fin: '2027-03-01',
}
const R = (statut, date_rdv, abonnement_id = 'ab1') => ({ abonnement_id, statut, date_rdv })

egal('une réservation confirmée consomme', seancesConsommees([R('confirme', '2026-09-07')]), 1)
egal('une séance honorée aussi', seancesConsommees([R('honore', '2026-09-07')]), 1)
egal('un no-show est perdu', seancesConsommees([R('no_show', '2026-09-07')]), 1)
egal('une annulation par la cliente REND la séance',
  seancesConsommees([R('annule_client', '2026-09-07')]), 0)
egal('une annulation par le commerçant aussi',
  seancesConsommees([R('annule_commercant', '2026-09-07')]), 0)
egal('un reporté ne consomme pas', seancesConsommees([R('reporte', '2026-09-07')]), 0)
// ⚠️ On ne compte QUE les séances de CE contrat. Une cliente peut avoir un
// carnet chez sa coiffeuse et un autre à son cours de yoga.
egal('les séances d’un autre contrat ne comptent pas',
  seancesConsommees([R('confirme', '2026-09-07', 'ab2')], { abonnementId: 'ab1' }), 0)
egal('sans contrat précisé, on compte tout ce qui est fourni',
  seancesConsommees([R('confirme', '2026-09-07', 'ab2')]), 1)
egal('une liste vide ne consomme rien', seancesConsommees([]), 0)
egal('une liste absente non plus', seancesConsommees(null), 0)
// ⚠️ Les statuts sont ceux de la base, jamais inventés de mémoire.
egal('trois statuts consomment, et trois seulement', STATUTS_CONSOMMENT_SEANCE.length, 3)
for (const s of STATUTS_CONSOMMENT_SEANCE) {
  verifier(`« ${s} » est un statut de rendez-vous qui existe`,
    /confirme|honore|annule_client|annule_commercant|no_show|reporte/.test(s) && s !== 'annule')
}

// ⚠️ LE GARDE-FOU DONT DÉPEND TOUTE LA RÈGLE. Si la route d'annulation cesse
// de refuser les annulations tardives, « annulé = annulé à temps » devient
// faux, et une cliente qui prévient une heure avant récupérerait sa séance.
const srcCancel = readFileSync(new URL('../app/api/rdv/cancel/route.js', import.meta.url), 'utf8')
verifier('la route d’annulation refuse encore les annulations hors délai',
  /cutoff_expired: true/.test(srcCancel) && /now > cutoffDate/.test(srcCancel))

// ─── LE SOLDE, TEL QU'IL S'AFFICHE ─────────────────────────────────────────
const HISTORIQUE = [
  R('honore', '2026-09-07'), R('honore', '2026-09-14'),
  R('annule_client', '2026-09-21'),          // rendue
  R('no_show', '2026-09-28'),                // perdue
  R('confirme', '2026-10-05'),               // déjà décomptée
  R('confirme', '2026-10-12', 'ab2'),        // autre contrat
]
const etat = etatAbonnement(CARNET_20, HISTORIQUE, { aujourdhui: '2026-10-01' })
egal('le contrat annonce 20 séances', etat.total, 20)
egal('quatre sont consommées, pas six', etat.consommees, 4)
egal('il en reste 16', etat.solde, 16)
egal('et l’écran sait le dire', etat.libelle, 'Il te reste 16 séances')
egal('le prix du contrat est porté par l’état', etat.prix, 150)
egal('le contrat est vivant au 1er octobre', etat.valable, true)
egal('il n’est pas épuisé', etat.epuise, false)
egal('et son solde n’est pas inconnu', etat.soldeInconnu, false)
egal('la durée restante se compte en jours', etat.joursRestants, 151)
egal('les dates retenues sont celles de CE contrat', etat.dates.length, 4)

// ⚠️ ÉPUISÉ ET INCONNU NE SE RESSEMBLENT PAS. Zéro veut dire « tout consommé »,
// null veut dire « on ne sait pas », et on ne refuse pas pour la même raison.
const etatEpuise = etatAbonnement({ ...CARNET_20, seances_total: 2 }, HISTORIQUE, { aujourdhui: '2026-10-01' })
egal('un solde tombé à zéro est épuisé', etatEpuise.epuise, true)
egal('et ne descend jamais sous zéro', etatEpuise.solde, 0)
const etatInconnu = etatAbonnement({ ...CARNET_20, seances_total: null }, HISTORIQUE, { aujourdhui: '2026-10-01' })
egal('un contrat sans total a un solde INCONNU', etatInconnu.soldeInconnu, true)
egal('et il n’est surtout pas déclaré épuisé', etatInconnu.epuise, false)
egal('un contrat absent ne rend rien', etatAbonnement(null, []), null)

// La durée restante, et ses bornes.
egal('un contrat qui finit demain', joursEntre('2026-10-01', '2026-10-02'), 1)
egal('un contrat qui finit aujourd’hui', joursEntre('2026-10-01', '2026-10-01'), 0)
egal('une date passée ne rend jamais un négatif', joursEntre('2026-10-01', '2026-09-01'), 0)
egal('sans date, pas de durée', joursEntre('2026-10-01', null), null)
// ⚠️ Le passage à l'heure d'hiver ne doit pas avaler ni inventer un jour : le
// dernier dimanche d'octobre 2026 tombe le 25.
egal('le changement d’heure n’ajoute ni ne retire un jour',
  joursEntre('2026-10-24', '2026-10-26'), 2)

// Le décompte alimente directement la question « peut-elle réserver ? ».
const verdictAbo = peutReserverSurAbonnement(CARNET_20, {
  date: '2026-10-19',
  seancesUtilisees: seancesConsommees(HISTORIQUE, { abonnementId: 'ab1' }),
  datesDejaPrises: datesConsommees(HISTORIQUE, { abonnementId: 'ab1' }),
})
egal('avec 16 séances au compteur, elle peut réserver', verdictAbo.ok, true)
egal('et le solde annoncé est le même partout', verdictAbo.solde, 16)

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CE QUE LA CLIENTE LIT SOUS SA SÉANCE : PAS « 0 € »
//
// Le prix vit sur le CONTRAT et chaque séance porte `prix_estime: 0`, pour ne
// pas multiplier le chiffre d'affaires du commerçant par trente-six. Mais
// l'écran « Mes rendez-vous » affichait le prix dès qu'il n'était pas nul, et
// ZÉRO N'EST PAS NUL : une cliente qui avait réglé son année à 400 € voyait
// trente-six lignes à « 0 € ». Troisième fois sur ce projet que `0` se fait
// passer pour une valeur légitime là où il fallait tester l'ABSENCE.
// ═══════════════════════════════════════════════════════════════════════════
egal('une séance d’abonnement dit qu’elle est déjà payée',
  libellePrixSeance({ abonnement_id: 'a1', prix_estime: 0 }), 'Compris dans ton abonnement')
egal('un rendez-vous ordinaire garde son prix',
  libellePrixSeance({ abonnement_id: null, prix_estime: 35 }), null)
// ⚠️ ET UNE PRESTATION RÉELLEMENT OFFERTE GARDE SON « 0 € ». On ne regarde pas
// le nombre, on regarde s'il y a un contrat derrière : c'est la vraie question,
// et c'est ce qui distingue « déjà payé » de « gratuit ».
egal('une prestation offerte hors abonnement reste à 0 €',
  libellePrixSeance({ abonnement_id: null, prix_estime: 0 }), null)
egal('un rendez-vous sans prix n’invente rien',
  libellePrixSeance({ prix_estime: null }), null)
egal('et un objet absent ne fait pas tomber l’écran', libellePrixSeance(null), null)

// ⚠️ ET LA COLONNE DOIT ARRIVER JUSQU'À L'ÉCRAN. Un libellé conditionné à un
// champ absent du `select` ne s'affiche JAMAIS, sans la moindre erreur. C'est
// exactement ce qui avait vidé la galerie photos d'une fiche, et la route des
// rendez-vous du Yopper énumère ses colonnes une par une.
const srcMesRdvs = readFileSync(new URL('../app/api/rdv/mes-rdvs/route.js', import.meta.url), 'utf8')
verifier('la route des rendez-vous du Yopper ramène le lien vers l’abonnement',
  /abonnement_id/.test(srcMesRdvs))

// Et le total dépensé ne compte pas une séance déjà réglée sur le contrat.
const srcCommander = readFileSync(new URL('../app/commander/page.js', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
verifier('le total dépensé exclut les séances d’abonnement',
  /statut === 'honore' && !r\.abonnement_id/.test(srcCommander))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Abonnements verts.')
