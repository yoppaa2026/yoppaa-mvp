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
  formuleVendableEnLigne, seancesVenduesEnLigne, resumeFormulePublique,
  contratDepuisFormule, libelleValidite, formatDateCourte,
  resumeAbonnementClient, detailValidite, detailUtilisation, partConsommee,
  phraseApercuFormule, expliquerApercuFormule,
} from '../lib/abonnements.js'
import { jourSemaineDe, JOURS_SEMAINE_FR } from '../lib/creneaux.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
// Un commentaire qui cite le terme cherché rend un test faussement vert, et
// celui qui l'explique le rend faussement rouge. On retire les deux.
const sansCommentSrc = (src) =>
  src.split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')


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
// LA VENTE EN LIGNE (décision d'Alex du 15/08)
// ═══════════════════════════════════════════════════════════════════════════
const ANNEE_VITRINE = {
  id: 'f1', commercant_id: 'c1', type: 'periode', libelle: 'Année 2026-2027',
  prix: 400, seances_par_semaine: 1, vente_en_ligne: true, actif: true,
  date_debut: '2026-09-01', date_fin: '2027-07-03', periodes_exclues: CONGES_TEST,
}
const CARNET_VITRINE = {
  id: 'f2', commercant_id: 'c1', type: 'carnet', libelle: 'Carnet 20 séances',
  prix: 150, seances_carnet: 20, validite_jours: 180, seances_par_semaine: 3,
  vente_en_ligne: true, actif: true,
}

// ⚠️ RIEN NE SE MET EN VITRINE TOUT SEUL. La colonne vaut `false` par défaut en
// base ; une formule qu'on n'a pas explicitement mise en vente ne s'affiche
// nulle part, brouillon ou tarif négocié compris.
egal('une formule mise en vente est vendable', formuleVendableEnLigne(CARNET_VITRINE), true)
egal('sans la case cochée, rien ne s’affiche',
  formuleVendableEnLigne({ ...CARNET_VITRINE, vente_en_ligne: false }), false)
egal('une case absente vaut non', formuleVendableEnLigne({ ...CARNET_VITRINE, vente_en_ligne: undefined }), false)
egal('une formule désactivée ne se vend pas',
  formuleVendableEnLigne({ ...CARNET_VITRINE, actif: false }), false)
egal('une formule supprimée non plus',
  formuleVendableEnLigne({ ...CARNET_VITRINE, deleted_at: '2026-08-01T10:00:00Z' }), false)
// « Acheter » quelque chose de gratuit n'a aucun sens, et Stripe refuse sous 0,50 €.
egal('un prix à zéro n’est pas une vente', formuleVendableEnLigne({ ...CARNET_VITRINE, prix: 0 }), false)
egal('un carnet vide non plus', formuleVendableEnLigne({ ...CARNET_VITRINE, seances_carnet: 0 }), false)

// ⚠️ LE TEST QUI VALIDE LA RÈGLE DU JOUR LE MOINS FAVORABLE.
//
// Le compte d'une période dépend du jour choisi : l'année commence un mardi et
// finit un vendredi. La cliente qui achète en ligne n'en choisit aucun, donc on
// vend le minimum : lui vendre le maximum lui laisserait réclamer une séance de
// plus que ce que la commerçante avait prévu.
//
// Et ce minimum tombe sur **36**, le chiffre qu'Emily annonce elle-même. Ce
// n'est pas le code qui se confirme tout seul, c'est une source extérieure.
egal('le lundi est le jour le moins favorable', seancesDeLaFormule(ANNEE_VITRINE, { jourSemaine: 'lundi' }), 36)
egal('le mardi en offrirait 38', seancesDeLaFormule(ANNEE_VITRINE, { jourSemaine: 'mardi' }), 38)
egal('EN LIGNE, ON VEND LE MINIMUM : 36', seancesVenduesEnLigne(ANNEE_VITRINE), 36)
egal('un carnet vend simplement son nombre', seancesVenduesEnLigne(CARNET_VITRINE), 20)
// Deux séances par semaine doublent ce qui est vendu sur une période.
egal('le rythme multiplie ce qui est vendu',
  seancesVenduesEnLigne({ ...ANNEE_VITRINE, seances_par_semaine: 2 }), 72)
egal('une période sans dates ne vend rien',
  seancesVenduesEnLigne({ ...ANNEE_VITRINE, date_debut: null }), 0)

// ─── CE QUE LA VITRINE ANNONCE ─────────────────────────────────────────────
const vitrineCarnet = resumeFormulePublique(CARNET_VITRINE, { achatLe: '2026-09-15' })
egal('le carnet dit combien de séances', vitrineCarnet.seancesLibelle, '20 séances')
egal('et jusqu’à quand, en français', vitrineCarnet.validite, 'Valable 6 mois')
egal('la fenêtre part du jour de l’achat', vitrineCarnet.fenetre.debut, '2026-09-15')
egal('et court sur 180 jours', vitrineCarnet.fenetre.fin, '2027-03-14')
egal('le rythme est annoncé', vitrineCarnet.rythme, 'Jusqu’à 3 séances par semaine'.replace('’', "'"))
const vitrineAnnee = resumeFormulePublique(ANNEE_VITRINE)
egal('la période annonce ses bornes', vitrineAnnee.validite, 'Du 1er septembre au 3 juillet')
egal('et son rythme au singulier', vitrineAnnee.rythme, 'Une séance par semaine')
// ⚠️ Le client doit comprendre qu'il achète un DROIT À RÉSERVER, pas un
// planning déjà posé, sinon il attend un agenda qui n'arrivera jamais.
verifier('la vitrine dit que le client réserve lui-même',
  /réserves tes séances toi-même/.test(vitrineAnnee.reservation))

// Les durées se disent comme un humain les dit.
egal('180 jours', libelleValidite(180), '6 mois')
egal('365 jours', libelleValidite(365), '1 an')
egal('730 jours', libelleValidite(730), '2 ans')
egal('30 jours', libelleValidite(30), '1 mois')
egal('45 jours restent des jours', libelleValidite(45), '45 jours')
egal('zéro ne se dit pas', libelleValidite(0), null)
egal('le premier du mois s’écrit 1er', formatDateCourte('2026-09-01'), '1er septembre')
egal('les autres non', formatDateCourte('2026-09-03'), '3 septembre')

// ─── LE CONTRAT FIGÉ À L'ACHAT ─────────────────────────────────────────────
const contrat = contratDepuisFormule(CARNET_VITRINE, {
  achatLe: '2026-09-15', commercantId: 'c1',
  client: { email: '  Marie.Dupont@Mail.BE ', prenom: 'Marie', nom: 'Dupont', telephone: '0472 11 22 33' },
})
// ⚠️ ACHETÉ EN LIGNE = MODE CRÉDIT. Personne d'autre que le commerçant ne peut
// poser les séances de quelqu'un, et il n'est pas là au moment de l'achat.
egal('un achat en ligne crée toujours un contrat en mode crédit', contrat.mode, 'credit')
egal('et il est payé', contrat.paye, true)
egal('par le mode qui n’avait jusqu’ici aucun moteur', contrat.mode_paiement, 'en_ligne')
egal('le prix est figé', contrat.prix, 150)
egal('le nombre de séances aussi', contrat.seances_total, 20)
egal('le plafond hebdomadaire aussi', contrat.seances_par_semaine, 3)
egal('la période est figée, début', contrat.date_debut, '2026-09-15')
egal('et fin', contrat.date_fin, '2027-03-14')
// ⚠️ L'EMAIL EST NORMALISÉ. Un email non normalisé a déjà fait DISPARAÎTRE des
// commandes sur ce projet, et c'est lui qui relie le contrat à ses séances.
egal('l’email est normalisé', contrat.client_email, 'marie.dupont@mail.be')
egal('un contrat sans date d’achat n’existe pas', contratDepuisFormule(CARNET_VITRINE, {}), null)
egal('une formule absente non plus', contratDepuisFormule(null, { achatLe: '2026-09-15' }), null)

// Le contrat issu de l'achat se relit tout de suite avec le reste du module.
const etatAchat = etatAbonnement({ ...contrat, id: 'ab9' }, [], { aujourdhui: '2026-09-15' })
egal('à l’achat, tout le solde est disponible', etatAchat.solde, 20)
egal('et le contrat est valable le jour même', etatAchat.valable, true)
egal('il reste 180 jours', etatAchat.joursRestants, 180)

// ⚠️ ET LA COLONNE DOIT ARRIVER JUSQU'À LA VITRINE. Une formule vendable dont
// `vente_en_ligne` n'est pas demandé au `select` ne s'affiche JAMAIS. C'est le
// défaut qui a coûté les cours collectifs quelques heures plus tôt.
const srcFiche = readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8')
verifier('la fiche demande la colonne de mise en vente', /vente_en_ligne/.test(srcFiche))
verifier('et ne charge que ce qui est réellement en vente',
  /\.eq\('vente_en_ligne', true\)/.test(srcFiche))

// ═══════════════════════════════════════════════════════════════════════════
// LE CHEMIN DE PAIEMENT — le seul endroit où un défaut se paie en euros
// ═══════════════════════════════════════════════════════════════════════════
const sansComm = (src) => src.split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const srcCheckout = sansComm(readFileSync(new URL('../app/api/stripe/checkout/create-abonnement/route.js', import.meta.url), 'utf8'))
const srcWebhook = sansComm(readFileSync(new URL('../app/api/stripe/webhook/route.js', import.meta.url), 'utf8'))

// ⚠️ L'ÉCRAN NE PROTÈGE RIEN. Il ne montre que ce qui est vendable, mais une
// requête forgée n'a pas d'écran : sans revalidation serveur, n'importe qui
// achèterait un brouillon ou un tarif négocié en devinant son identifiant.
verifier('le serveur revalide qu’une formule est bien en vente',
  /formuleVendableEnLigne\(formule\)/.test(srcCheckout))
// L'argent va au commerçant, jamais à la plateforme.
verifier('le paiement part sur le compte du commerçant',
  /stripeAccount: commercant\.stripe_account_id/.test(srcCheckout))
verifier('et Yoppaa ne prélève rien', /calculApplicationFee\(/.test(srcCheckout))
verifier('un commerçant sans compte Stripe ne peut pas vendre',
  /stripe_account_charges_enabled/.test(srcCheckout))
// Stripe refuse sous 0,50 € : mieux vaut le dire que de laisser échouer.
verifier('un montant sous le minimum Stripe est refusé', /prixCents < 50/.test(srcCheckout))

// ⚠️ LE CONTRAT NAÎT AU WEBHOOK, PAS AU CLIC. Le créer avant produirait un
// abonnement à chaque panier abandonné, et un solde offert à qui ferme l'onglet.
verifier('le clic ne crée aucun contrat',
  !/from\('abonnements'\)\s*\n?\s*\.insert/.test(srcCheckout))
verifier('le webhook, lui, le crée',
  /from\('abonnements'\)\s*\n?\s*\.insert/.test(srcWebhook))

// ⚠️ STRIPE REJOUE SES WEBHOOKS. Sans garde, une cliente qui paie une fois a
// deux contrats, donc le double de séances.
verifier('un rejeu de webhook est reconnu',
  /\.eq\('stripe_payment_intent_id', paymentIntent\.id\)/.test(srcWebhook))
// ⚠️ CE TEST EST NÉ MUET, et la mutation l'a démontré. Il cherchait
// `stripe_payment_intent_id: paymentIntent.id` n'importe où dans le webhook :
// or ce fragment existe DÉJÀ deux fois, pour le rendez-vous et pour la
// commande. Retirer la trace du contrat d'abonnement ne le faisait donc pas
// rougir. On ancre sur l'insertion du contrat elle-même.
verifier('et la trace du paiement est écrite SUR LE CONTRAT',
  /\.insert\(\{ \.\.\.contrat, stripe_payment_intent_id: paymentIntent\.id \}\)/.test(srcWebhook))

// ⚠️ LA DATE D'ACHAT VIENT DE STRIPE, pas de notre horloge : un webhook rejoué
// trois jours plus tard fabriquerait une fenêtre de validité décalée d'autant.
verifier('la date d’achat vient du paiement, pas de l’horloge du serveur',
  /paymentIntent\.created/.test(srcWebhook))

// ⚠️ LE NOMBRE DE SÉANCES VOYAGE AVEC LE PAIEMENT. Un commerçant qui modifie
// ses congés entre le clic et l'encaissement livrerait sinon autre chose que ce
// qui a été payé, et c'est le client qui aurait raison.
verifier('le nombre de séances payées voyage dans le paiement',
  /seances_total: String\(seances\)/.test(srcCheckout))
verifier('et le webhook le respecte plutôt que de recalculer',
  /meta\.seances_total/.test(srcWebhook))

// La migration déclare la colonne et l'index qui rendent tout ça vrai.
const srcMigPaiement = readFileSync(new URL('../migrations/MIGRATION_ABONNEMENTS_PAIEMENT.sql', import.meta.url), 'utf8')
verifier('la migration crée la colonne du paiement',
  /ADD COLUMN IF NOT EXISTS stripe_payment_intent_id/.test(srcMigPaiement))
// ⚠️ L'unicité vit EN BASE : deux rejeux simultanés passent tous les deux la
// lecture du code avant que l'un ait écrit. Même leçon que le double-booking.
verifier('et l’index unique qui rend deux contrats impossibles',
  /CREATE UNIQUE INDEX IF NOT EXISTS abonnements_paiement_unique/.test(srcMigPaiement))
verifier('index partiel : les ventes à la main ne se gênent pas',
  /WHERE stripe_payment_intent_id IS NOT NULL/.test(srcMigPaiement))

// Et la migration d'ouverture publique n'ouvre que ce qui est en vente.
// ⚠️ ON RETIRE LES COMMENTAIRES SQL AVANT DE JUGER. Ce test est né FAUSSEMENT
// ROUGE : la migration EXPLIQUE, en toutes lettres, qu'il ne faut jamais poser
// un « USING (true) », et le test lisait sa propre mise en garde comme une
// infraction. Même piège que le 15/08 sur `place_no`, retourné : là un
// commentaire rendait un test vert à tort, ici il le rend rouge à tort. Dans
// les deux cas, chercher un mot dans un fichier qui parle de ce mot ne prouve
// rien. On juge le CODE.
const sansCommSql = (src) => src
  .split(/\r?\n/)
  .filter(l => !/^\s*--/.test(l))
  .join('\n')
const srcMigVente = sansCommSql(readFileSync(new URL('../migrations/MIGRATION_ABONNEMENTS_VENTE_LIGNE.sql', import.meta.url), 'utf8'))
verifier('la lecture publique exige les trois conditions',
  /vente_en_ligne IS TRUE AND actif IS TRUE AND deleted_at IS NULL/.test(srcMigVente))
// ⚠️ JAMAIS un USING (true) : c'est ce qui avait fuité à l'audit du 03/08.
verifier('aucun USING (true) sur les formules', !/USING \(true\)/.test(srcMigVente))
verifier('la colonne est fausse par défaut', /DEFAULT false/.test(srcMigVente))
verifier('et le GRANT anon est explicite', /GRANT SELECT ON abonnement_formules TO anon/.test(srcMigVente))
// ⚠️ `abonnements` porte des noms et des téléphones : elle RESTE fermée.
verifier('la table des contrats n’est jamais ouverte à l’anonyme',
  !/GRANT[^\n]*ON abonnements TO anon/.test(srcMigVente))

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
// L'ÉCRAN DE LA CLIENTE : « combien me reste-t-il, et jusqu'à quand ? »
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CET ÉCRAN N'EXISTAIT PAS. Depuis le 15/08 une cliente peut acheter en
// ligne : elle payait 150 €, recevait un email, et l'application ne lui en
// reparlait plus jamais. Question d'Alex, restée sans réponse jusqu'ici.

const etatDe = (abo, resas = [], jour = '2026-10-01') =>
  etatAbonnement(abo, resas, { aujourdhui: jour })

const CONTRAT_CLIENTE = {
  id: 'a1', type: 'periode', mode: 'credit', statut: 'actif', prix: 150,
  seances_total: 36, date_debut: '2026-09-01', date_fin: '2027-07-03',
}
const resaSur = (n, statut = 'confirme') =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, abonnement_id: 'a1', statut }))

// ⚠️ L'ORDRE DES QUESTIONS EST LA FONCTION. Annoncer « il te reste 12 séances »
// sur un abonnement résilié serait un mensonge, et c'est exactement ce qu'un
// enchaînement écrit dans le désordre produirait.
egal('un abonnement vivant annonce son solde',
  resumeAbonnementClient(etatDe(CONTRAT_CLIENTE, resaSur(24))).titre, 'Il te reste 12 séances')
egal('et une seule séance se dit au singulier',
  resumeAbonnementClient(etatDe(CONTRAT_CLIENTE, resaSur(35))).titre, 'Il te reste 1 séance')
egal('un abonnement résilié le dit AVANT de parler solde',
  resumeAbonnementClient(etatDe({ ...CONTRAT_CLIENTE, statut: 'resilie' }, resaSur(24))).titre,
  'Abonnement résilié')
verifier('et il n’est plus utilisable',
  resumeAbonnementClient(etatDe({ ...CONTRAT_CLIENTE, statut: 'resilie' })).utilisable === false)

// Hors fenêtre : on ne promet plus rien, et on dit ce qui a été fait.
const finiCliente = resumeAbonnementClient(etatDe(CONTRAT_CLIENTE, resaSur(30), '2027-09-01'))
egal('un abonnement périmé annonce sa fin', finiCliente.titre, 'Terminé le 3 juillet')
egal('et raconte ce qui en a été fait', finiCliente.detail, '30 séances sur 36')
verifier('un abonnement périmé n’est plus utilisable', finiCliente.utilisable === false)

// ⚠️ UN SOLDE INCONNU N'EST PAS UN SOLDE ÉPUISÉ. L'écran doit dire qu'il ne
// sait pas, jamais refuser : une cliente a payé.
const inconnuCliente = resumeAbonnementClient(etatDe({ ...CONTRAT_CLIENTE, seances_total: null }))
egal('sans nombre de séances, on n’invente pas de solde', inconnuCliente.ton, 'inconnu')
verifier('et l’abonnement reste utilisable', inconnuCliente.utilisable === true)
verifier('la barre de progression ne s’affiche pas sans total',
  partConsommee(etatDe({ ...CONTRAT_CLIENTE, seances_total: null })) === null)

// Épuisé se dit d'un solde CONNU tombé à zéro.
const epuiseCliente = resumeAbonnementClient(etatDe(CONTRAT_CLIENTE, resaSur(36)))
egal('toutes les séances utilisées', epuiseCliente.ton, 'epuise')
verifier('et on ne peut plus réserver dessus', epuiseCliente.utilisable === false)

// La barre, en clair.
egal('aucune séance prise, barre à zéro', partConsommee(etatDe(CONTRAT_CLIENTE, [])), 0)
egal('la moitié prise, barre à la moitié', partConsommee(etatDe(CONTRAT_CLIENTE, resaSur(18))), 0.5)
egal('tout pris, barre pleine', partConsommee(etatDe(CONTRAT_CLIENTE, resaSur(36))), 1)
verifier('et jamais au-delà de 1', partConsommee(etatDe(CONTRAT_CLIENTE, resaSur(50))) === 1)

// ⚠️ L'URGENCE SEULEMENT QUAND ELLE EST VRAIE. Rappeler « plus que 200 jours »
// toute l'année use l'avertissement, et le jour où il compte vraiment plus
// personne ne le lit. Seuil à 30 jours.
egal('loin de la fin, on annonce juste la date',
  detailValidite(etatDe(CONTRAT_CLIENTE, [], '2026-10-01')), 'Valable jusqu’au 3 juillet')
egal('à douze jours de la fin, on le dit',
  detailValidite(etatDe(CONTRAT_CLIENTE, [], '2027-06-21')),
  'Valable jusqu’au 3 juillet, plus que 12 jours')
egal('le dernier jour se nomme',
  detailValidite(etatDe(CONTRAT_CLIENTE, [], '2027-07-03')),
  'Valable jusqu’au 3 juillet, dernier jour')
egal('sans date de fin, aucune promesse', detailValidite({ fin: null, joursRestants: null }), '')
egal('zéro séance suivie se dit au pluriel',
  detailUtilisation({ consommees: 0, total: 0 }), '0 séances suivies')

verifier('aucun tiret cadratin dans ce que lit la cliente',
  !resumeAbonnementClient(etatDe(CONTRAT_CLIENTE, resaSur(2))).titre.includes('—')
  && !detailValidite(etatDe(CONTRAT_CLIENTE, [], '2027-06-21')).includes('—'))

// ─── LA ROUTE : c'est elle qui décide qui voit quoi ────────────────────────
const srcRouteAbo = sansCommentSrc(lire('app/api/yopper/abonnements/route.js'))

verifier('la route exige une identité PROUVÉE, le cookie ne suffit pas',
  /identiteProuvee\(request\)/.test(srcRouteAbo))
verifier('et rend 401 sans elle', /status: 401/.test(srcRouteAbo))
// ⚠️ L'EMAIL VIENT DE L'IDENTITÉ, JAMAIS DU CORPS DE LA REQUÊTE. Sinon
// n'importe qui énumère les clientes d'un commerce.
verifier('le filtre se fait sur l’email de l’identité',
  /\.eq\('client_email', yopper\.email\)/.test(srcRouteAbo))
verifier('et rien ne vient du corps de la requête', !/request\.json\(\)/.test(srcRouteAbo))

// ⚠️ LE CONTRAT ENTIER, PAS UNE COLONNE. Une colonne absente d'un select vaut
// `undefined`, ne lève aucune erreur, et le repli bien conçu finit le travail
// en silence : sans `seances_total`, la route annoncerait « solde inconnu » à
// une cliente qui a pourtant payé 36 séances. Cinq occurrences sur ce projet.
const selectAbo = /from\('abonnements'\)[\s\S]{0,400}?\.select\('([^']+)'\)/.exec(srcRouteAbo)?.[1] || ''
for (const champ of ['id', 'commercant_id', 'type', 'mode', 'statut', 'prix', 'seances_total', 'date_debut', 'date_fin']) {
  verifier(`la requête demande « ${champ} »`,
    new RegExp(`(^|,\\s*)${champ}(\\s*,|$)`).test(selectAbo), selectAbo || 'select introuvable')
}
const selectResas = /from\('rdv_reservations'\)[\s\S]{0,300}?\.select\('([^']+)'\)/.exec(srcRouteAbo)?.[1] || ''
for (const champ of ['abonnement_id', 'statut']) {
  verifier(`le décompte demande « ${champ} »`,
    new RegExp(`(^|,\\s*)${champ}(\\s*,|$)`).test(selectResas), selectResas || 'select introuvable')
}

// ─── L'ÉCRAN ───────────────────────────────────────────────────────────────
const srcClientAbo = sansCommentSrc(lire('app/commander/page.js'))
verifier('la cliente charge ses abonnements avec fetchYopper, pas un fetch nu',
  /fetchYopper\('\/api\/yopper\/abonnements'\)/.test(srcClientAbo))
verifier('la carte est montée dans l’onglet des rendez-vous',
  /<CarteAbonnement /.test(srcClientAbo))
// ⚠️ Une session perdue n'est pas une absence d'abonnement : effacer ici
// dirait à une cliente qu'elle n'a rien acheté.
const debutCharge = srcClientAbo.indexOf('async function chargerAbonnementsClient(')
const corpsCharge = srcClientAbo.slice(debutCharge, debutCharge + 900)
verifier('une session perdue n’efface pas les abonnements',
  /estSessionPerdue\(res, body\)/.test(corpsCharge)
  && !/setClientAbonnements\(\[\]\)/.test(corpsCharge))
// Une séance annulée à temps est RENDUE : le solde affiché doit suivre.
verifier('annuler un rendez-vous recharge le solde',
  /chargerRdvsClient\(rdv\.client_email\)[\s\S]{0,200}chargerAbonnementsClient\(\)/.test(srcClientAbo))

// ═══════════════════════════════════════════════════════════════════════════
// L'APERÇU D'UNE FORMULE, SANS JOUR IMPOSÉ (Alex, 15/08 au soir)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ « Il faut aussi supprimer le jour pour lequel l'abonnement est valable, le
// client choisit lui-même. » Suite directe de sa correction du matin : le jour
// fixe pour 36 semaines était une erreur de conception.
//
// ⚠️ ET ÇA CHANGE LE NOMBRE ANNONCÉ, c'est tout l'enjeu. L'aperçu disait « 46
// séances » pour le jour du menu déroulant. Sans jour, on ne peut plus promettre
// 46 : selon le jour choisi il y en aura 43, 44 ou 46, parce que les congés ne
// tombent pas également sur la semaine. On annonce donc le MINIMUM.

// Une année scolaire avec un congé qui tombe un lundi et pas les autres jours :
// le lundi perd une séance que le mardi garde. C'est exactement le cas qui
// interdit d'annoncer le nombre d'un jour choisi au hasard.
const FORMULE_APERCU = {
  type: 'periode',
  date_debut: '2026-09-07',   // un lundi
  date_fin: '2026-12-21',
  seances_par_semaine: 1,
  periodes_exclues: [{ debut: '2026-11-02', fin: '2026-11-08' }],   // une semaine entière
}

const phrase = phraseApercuFormule(FORMULE_APERCU)
verifier('l’aperçu d’une période annonce un nombre', /\d+ séances/.test(phrase), phrase)
// ⚠️ LE MOT QUI ENGAGE. « 46 séances » se lit comme une promesse ferme ;
// « au minimum » dit la vérité, et c'est la vérité qu'on tiendra.
verifier('et il dit que c’est un MINIMUM', /au minimum/.test(phrase), phrase)
verifier('la période est rappelée en clair',
  /du 7 septembre au 21 décembre/.test(phrase), phrase)

// Le nombre annoncé est celui du jour le MOINS favorable, celui que la vente en
// ligne utilise déjà. Aucun client ne peut donc recevoir moins que promis.
const minimum = Math.min(...JOURS_SEMAINE_FR.map(j => datesDeSeances({
  dateDebut: FORMULE_APERCU.date_debut, dateFin: FORMULE_APERCU.date_fin,
  jourSemaine: j, periodesExclues: FORMULE_APERCU.periodes_exclues,
}).length))
verifier('le nombre annoncé est celui du jour le moins favorable',
  phrase.startsWith(`${minimum} séance`), `${phrase} / minimum calculé ${minimum}`)
// ⚠️ ET IL EST BIEN INFÉRIEUR AU MEILLEUR JOUR : sans cet écart, le test ne
// prouverait rien, il pourrait passer sur une formule où tous les jours sont
// équivalents. Mesuré ici, sur une vraie semaine de congé.
const maximum = Math.max(...JOURS_SEMAINE_FR.map(j => datesDeSeances({
  dateDebut: FORMULE_APERCU.date_debut, dateFin: FORMULE_APERCU.date_fin,
  jourSemaine: j, periodesExclues: FORMULE_APERCU.periodes_exclues,
}).length))
verifier('et le cas de test porte bien un écart entre les jours', maximum > minimum,
  `min ${minimum}, max ${maximum}`)

// L'explication accompagne toujours le nombre : sans elle, le commerçant croit
// à une erreur de calcul et va chercher son jour manquant.
verifier('l’explication dit que le client choisit son jour',
  /choisit lui-même son jour/.test(expliquerApercuFormule(FORMULE_APERCU)))
verifier('et pourquoi le nombre est un minimum',
  /moins favorable/.test(expliquerApercuFormule(FORMULE_APERCU)))

// Deux séances par semaine doublent le compte annoncé.
verifier('le rythme hebdomadaire multiplie le minimum',
  phraseApercuFormule({ ...FORMULE_APERCU, seances_par_semaine: 2 })
    .startsWith(`${minimum * 2} séance`))

// Le carnet ne parle pas de jour du tout : il n'en a jamais eu.
const carnet = phraseApercuFormule({ type: 'carnet', seances_carnet: 10, validite_jours: 180 })
egal('un carnet annonce ses séances et sa validité', carnet, '10 séances, valables 6 mois à partir de l’achat.')
egal('et il ne parle d’aucun minimum', /minimum/.test(carnet), false)
egal('ni d’aucun jour', expliquerApercuFormule({ type: 'carnet' }), '')

// Une saisie incomplète ne raconte rien plutôt que d'inventer un nombre.
egal('sans dates, aucun aperçu', phraseApercuFormule({ type: 'periode' }), null)
egal('sans nombre de séances, aucun aperçu de carnet',
  phraseApercuFormule({ type: 'carnet', validite_jours: 180 }), null)
egal('sans validité non plus',
  phraseApercuFormule({ type: 'carnet', seances_carnet: 10 }), null)
egal('et rien du tout ne casse rien', phraseApercuFormule(null), null)

verifier('aucun tiret cadratin dans l’aperçu',
  !phrase.includes('—') && !expliquerApercuFormule(FORMULE_APERCU).includes('—'))

// ⚠️ ET LE SÉLECTEUR A BIEN DISPARU DE L'ÉCRAN. C'est la garde qui tient la
// demande d'Alex : le laisser reviendrait à réimposer un jour.
const srcAbo = sansCommentSrc(lire('app/dashboard/ConfigDashboard.js'))
verifier('plus aucun « Pour un cours du » dans l’éditeur de formule',
  !/Pour un cours du/.test(srcAbo))
verifier('et plus aucun jour d’aperçu à choisir',
  !/jourApercu/.test(srcAbo))
verifier('l’aperçu vient de la lib, exécutée par ce banc',
  /phraseApercuFormule\(formulePourApercu\)/.test(srcAbo))

// ─── LES ABONNEMENTS ONT DÉMÉNAGÉ DANS LE CATALOGUE (Alex, 15/08) ──────────
// ⚠️ « L'onglet abonnement devrait aller dans le catalogue à côté des
// produits. » Un abonnement est une chose qu'on VEND, pas un réglage de la
// façon dont on travaille : il n'avait rien à faire entre les praticiens et les
// créneaux.
verifier('les abonnements vivent désormais dans le catalogue',
  /sousOnglet === 'abonnements' && <TabRdvAbonnements/.test(srcAbo))
verifier('et ils ont quitté la barre de la prise de rendez-vous',
  !/subTab === 'abonnements'/.test(srcAbo))

// ⚠️ ET LE DÉPLACEMENT N'OUVRE RIEN À PERSONNE. Une séance d'abonnement EST un
// rendez-vous, avec sa ligne d'agenda et son rappel, et une formule pointe
// obligatoirement vers une prestation. Ouvrir ce module à une boulangerie
// demanderait à sa cliente de réserver un créneau pour chacun de ses dix pains.
// Les autres métiers ont les cartes cadeaux, qui pointent déjà au comptoir sans
// agenda. Décision d'Alex le même soir.
verifier('le catalogue ne propose les abonnements qu’aux commerces de service',
  /const peutAbonnements = estVitrine && canDo\(commercant\?\.plan, 'rdv'\)/.test(srcAbo))
verifier('et sans eux, aucune barre de sous-onglets ne s’affiche',
  /if \(!peutAbonnements\) \{[\s\S]{0,160}return <TabMenu/.test(srcAbo))
// La formule reste attachée à une prestation : c'est ce qui rend le module
// inapplicable à un métier sans agenda, et c'est volontaire.
verifier('une formule exige toujours une prestation',
  /if \(!form\.prestation_id\) return toast/.test(srcAbo))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Abonnements verts.')
