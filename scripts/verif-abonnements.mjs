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
  formuleVendableEnLigne, resumeFormulePublique,
  contratDepuisFormule, libelleValidite, formatDateCourte,
  etapesApresAbonnement, contratQuiVientDEtreAchete,
  contratDepuisEtat, peutPoserSeance, abonnementsPourPrestation, expliquerRefusSeance,
  trierAbonnementsPourSeance, libelleChoixAbonnement,
  resumeAbonnementClient, detailValidite, detailUtilisation, partConsommee,
  phraseApercuFormule, expliquerApercuFormule,
} from '../lib/abonnements.js'
import { jourSemaineDe, JOURS_SEMAINE_FR } from '../lib/creneaux.js'
import { sansProse } from './lire-code.mjs'
import { euros } from '../lib/montants.js'

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

// ⚠️ LA PÉRIODE COMPTE SES SEMAINES DEPUIS LE 18/08, plus ses lundis.
//
// ⚠️ ET LES CHIFFRES VIENNENT DU CALENDRIER, PAS DU CODE. Du 01/09/2026 (mardi)
// au 03/07/2027 (samedi), le premier lundi concerné est le 31/08 et le dernier
// le 28/06 : 44 semaines sont touchées. Les congés d'Emily ferment quatre
// blocs ENTIERS, du lundi au dimanche — automne 1, hiver 2, détente 1,
// printemps 2 — soit 6 semaines. La Pentecôte ne ferme qu'un lundi et laisse
// sa semaine ouverte. Reste 38.
//
// ⚠️ ET C'EST DEUX SÉANCES DE PLUS QU'AVANT, gagnées sur un vrai défaut. Le
// compte par lundis en donnait 36 : il perdait le lundi de la Pentecôte, dont
// la semaine était pourtant grande ouverte, et la première semaine, entamée un
// mardi. L'abonnée les garde maintenant, posées un autre jour.
egal('la période compte ses semaines', seancesDeLaFormule(FORMULE_ANNEE), 38)
egal('et sans congés, elle en compte 44',
  seancesDeLaFormule({ ...FORMULE_ANNEE, periodes_exclues: [] }), 44)
// ⚠️ SEULES LES SEMAINES ENTIÈREMENT FERMÉES DISPARAISSENT. La Pentecôte, un
// lundi isolé, ne doit rien retirer : mesuré en retirant ce congé seul.
egal('un congé d’un seul jour ne retire aucune semaine',
  seancesDeLaFormule({ ...FORMULE_ANNEE, periodes_exclues: CONGES_TEST.filter(c => c.libelle !== 'Pentecôte') }), 38)
// ⚠️ LE PLAFOND HEBDOMADAIRE MULTIPLIE, et c'est la correction d'un écart réel :
// l'aperçu du commerçant l'ignorait quand la vente en ligne le comptait. Une
// même formule annonçait 36 d'un côté et en vendait 72 de l'autre.
egal('deux séances par semaine doublent le contrat',
  seancesDeLaFormule({ ...FORMULE_ANNEE, seances_par_semaine: 2 }), 76)
verifier('le carnet annonce simplement son nombre',
  seancesDeLaFormule(FORMULE_CARNET) === 10)
// ⚠️ UNE SEMAINE COMPTE DÈS QU'ELLE A UN JOUR LIBRE. Une période d'un seul jour
// vaut une semaine, et une période entièrement en congé n'en vaut aucune.
egal('un seul jour ouvre une semaine',
  seancesDeLaFormule({ type: 'periode', date_debut: '2026-09-08', date_fin: '2026-09-08' }), 1)
egal('une période entièrement en congé n’accorde rien',
  seancesDeLaFormule({
    type: 'periode', date_debut: '2026-09-07', date_fin: '2026-09-13',
    periodes_exclues: [{ debut: '2026-09-01', fin: '2026-09-30' }],
  }), 0)
// ⚠️ ON TESTE L'ABSENCE : sans dates, on n'accorde rien plutôt que d'inventer.
egal('une période sans dates n’accorde rien',
  seancesDeLaFormule({ type: 'periode', date_debut: null, date_fin: '2027-07-03' }), 0)
// ⚠️ MESURÉ, ET LA MESURE A D'ABORD SEMBLÉ DIRE QUE CE TEST ÉTAIT MUET : retirer
// le `if (dateFin < dateDebut) return []` de `semainesDeLaPeriode` ne fait rien
// rougir. Ce n'est pas la garde qui est faible, c'est la protection qui est
// DOUBLE : la condition de la boucle refuse déjà d'avancer. Cassée, elle, huit
// vérifications tombent. Le test protège donc bien le comportement, et la
// ceinture reste en plus des bretelles.
egal('et des bornes à l’envers non plus',
  seancesDeLaFormule({ type: 'periode', date_debut: '2027-07-03', date_fin: '2026-09-01' }), 0)

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
//
// ⚠️ ELLE EST PASSÉE DU MOT À LA RÈGLE LE 15/09, ET ELLE EST PLUS STRICTE. Les
// TABLES peuvent désormais s'annuler hors délai (elles n'ont ni prix ni
// séance, et le refus ne faisait que laisser une table vide). La garde
// exigeait deux bouts de texte dans la route : elle aurait laissé passer une
// séance d'abonnement ouverte par erreur, pourvu que les deux mots restent.
// Elle EXÉCUTE maintenant la décision, sur les cas qui comptent ici.
const srcCancel = readFileSync(new URL('../app/api/rdv/cancel/route.js', import.meta.url), 'utf8')
{
  const { decisionAnnulation } = await import('../lib/rdv-delai-annulation.js')
  const salon = { categorie: 'vitrine', rdv_delai_annulation_heures: 24 }
  const seanceDu5 = { date_rdv: '2026-10-05', heure_debut: '10:00' }
  const uneHeureAvant = new Date('2026-10-05T09:00:00+02:00')
  const seance = decisionAnnulation({ ...seanceDu5, abonnement_id: 'ab1', prestation: { par_couverts: false } }, salon, uneHeureAvant)
  verifier('🔴 une séance d’abonnement annulée une heure avant est REFUSÉE',
    seance.refus === true && seance.tardive === false)
  verifier('un rendez-vous de salon hors délai l’est aussi',
    decisionAnnulation({ ...seanceDu5, prestation: { par_couverts: false } }, salon, uneHeureAvant).refus === true)
  verifier('🔴 même une table, dès qu’elle est posée sur un abonnement',
    decisionAnnulation({ ...seanceDu5, abonnement_id: 'ab1', prestation: { par_couverts: true } }, salon, uneHeureAvant).refus === true)
  verifier('une séance annulée à temps passe, et n’est pas tardive',
    (() => { const d = decisionAnnulation({ ...seanceDu5, abonnement_id: 'ab1', prestation: {} }, salon, new Date('2026-10-03T09:00:00+02:00')); return !d.refus && !d.tardive })())
  verifier('et la route applique CETTE décision, avec son refus',
    /decisionAnnulation\(rdv, commercant/.test(srcCancel) && /cutoff_expired: true/.test(srcCancel))
}

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

// ⚠️ LA RÈGLE DU JOUR LE MOINS FAVORABLE A DISPARU LE 18/08, avec le jour fixe.
//
// Elle existait parce que le compte dépendait du jour : l'année commence un
// mardi et finit un vendredi, donc un lundi n'y tombe pas autant de fois qu'un
// mardi. La cliente qui achetait en ligne n'en choisissait aucun, on lui vendait
// donc le minimum pour ne jamais promettre une séance de trop.
//
// Le jour ne joue plus aucun rôle : le compte est celui des SEMAINES, et il est
// exact. Il n'y a plus deux fonctions, plus de minimum, plus de prudence à
// expliquer au commerçant.
//
// ⚠️ ET IL N'Y A PLUS QU'UN SEUL CHIFFRE PARTOUT. C'est ce que ce test vérifie,
// parce que l'écart d'hier n'était visible nulle part : les deux chemins ne se
// croisaient jamais à l'écran.
egal('la vitrine et l’aperçu du commerçant comptent pareil',
  seancesDeLaFormule(ANNEE_VITRINE), 38)
egal('un carnet vend simplement son nombre', seancesDeLaFormule(CARNET_VITRINE), 20)
egal('le rythme multiplie ce qui est vendu',
  seancesDeLaFormule({ ...ANNEE_VITRINE, seances_par_semaine: 2 }), 76)
egal('une période sans dates ne vend rien',
  seancesDeLaFormule({ ...ANNEE_VITRINE, date_debut: null }), 0)

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
// ⚠️ REPOINTÉE LE 03/10 : la revalidation passe désormais le jour de Bruxelles,
// pour refuser aussi une période finie.
verifier('le serveur revalide qu’une formule est bien en vente',
  /formuleVendableEnLigne\(formule, \{ aujourdhui \}\)/.test(srcCheckout))
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
  /\.insert\(\{\s*\.\.\.contrat,\s*stripe_payment_intent_id: paymentIntent\.id,/.test(srcWebhook))

// ═══════════════════════════════════════════════════════════════════════════
// LA VENTE D'UN ABONNEMENT EST UNE LIGNE COMPTABLE COMME UNE AUTRE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ ELLE N'EXISTAIT DANS AUCUN DOCUMENT (Alex, 17/08). L'achat n'écrit que
// dans `abonnements`, jamais une commande, et l'export ne lisait que les
// commandes et les rendez-vous. Un contrat de 540 € encaissé par Stripe ne
// figurait ni au journal du comptable, ni au chiffre d'affaires, et ses frais
// Stripe n'étaient même pas enregistrés.

// TVA FIGÉE À LA VENTE, reprise de la prestation payée : un changement de taux
// l'an prochain ne doit pas réécrire un contrat déjà vendu.
verifier('le contrat fige son taux de TVA à la vente',
  /tva_taux: tvaTaux/.test(srcWebhook))
verifier('et ce taux vient de la prestation que l’abonnement paie',
  /\.eq\('id', formule\.prestation_id\)/.test(srcWebhook))
// ⚠️ AUCUNE VENTILATION DES FRAIS ICI, contrairement au tunnel unique : un
// abonnement se paie SEUL, la totalité des frais lui revient.
verifier('les frais Stripe de l’abonnement sont enregistrés',
  /stripe_frais: fraisAbo \? fraisAbo\.frais : null/.test(srcWebhook))
// ⚠️ EN DIRECT CHARGE, LE RELEVÉ VIT SUR LE COMPTE CONNECTÉ. Le chercher sur
// celui de la plateforme ne rend rien, sans la moindre erreur.
verifier('et ils sont cherchés sur le compte du commerçant',
  /recupererFraisStripe\(paymentIntent\.id, eventAccount \|\| paymentIntent\.on_behalf_of \|\| null\)/.test(srcWebhook)
  && /handleAbonnementSucceeded\(paymentIntent, supabase, eventAccount\)/.test(srcWebhook))

// L'inscription À LA MAIN fige le même taux : deux chemins vers la même table,
// et c'est en n'en traitant qu'un seul qu'on a laissé `prestation_id` vide
// pendant des semaines.
// ⚠️ `sansComm` ET NON `sansCommentaires` : le second est déclaré 480 lignes
// plus bas dans ce même fichier, et un `const` ne remonte pas. C'est la ZONE
// MORTE TEMPORELLE, le défaut qui a mis l'accueil en écran blanc le 12/08 ;
// ici elle fait simplement exploser le banc, ce qui est la bonne nouvelle.
const srcConfigAbo = sansComm(
  readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
// ⚠️ ON COMPTE, ET C'EST LA NEUVIÈME FOIS QUE L'HOMONYME VOISIN REND UNE GARDE
// MUETTE. Chercher `tva_taux: presta.tva_taux` était satisfait par la création
// de rendez-vous juste en dessous, qui fige le sien depuis toujours : supprimer
// celui du CONTRAT ne faisait donc rien rougir. Deux endroits, deux gestes,
// et le compte le dit.
// ⚠️ UNE SEULE ÉCRITURE DEPUIS LE 18/08, et le compte le dit toujours. La
// seconde figeait le taux sur chaque SÉANCE générée d'avance : cette génération
// a disparu avec le jour fixe. Le contrat, lui, doit continuer de figer le sien,
// et c'est exactement ce que ce compte protège.
egal('le contrat fige son taux à la signature',
  (srcConfigAbo.match(/tva_taux: presta\.tva_taux \?\? null/g) || []).length, 1)
// ⚠️ ELLE FIGEAIT LE SELECT ENTIER, ET PAS SEULEMENT CE QU'ELLE PROTÈGE (10/09).
// Son intention est la TVA ; `par_couverts` s'y est ajouté pour qu'une table ne
// passe plus pour un cours, et elle a rougi sur une colonne qui ne la concerne
// pas. Une garde qui fige la phrase au lieu de la colonne rougit à chaque ajout
// légitime, et on finit par l'éteindre. On vise la colonne.
verifier('et la colonne arrive bien jusqu’à l’écran',
  /from\('rdv_prestations'\)\.select\('[^']*\btva_taux\b[^']*'\)/.test(srcConfigAbo))

// ─── L'EXPORT COMPTABLE ───────────────────────────────────────────────────
const { construireLignes } = await import('../lib/export-comptable.js')

const ABO_EN_LIGNE = {
  id: 'abo-1111-2222', statut: 'actif', prix: 540, paye: true,
  paye_le: '2026-08-15', mode_paiement: 'en_ligne', tva_taux: 21,
  stripe_frais: 8.1, stripe_net: 531.9,
}
const [ligneAbo] = construireLignes({ abonnements: [ABO_EN_LIGNE] })
egal('un abonnement payé devient une ligne', ligneAbo?.type, 'Abonnement')
// ⚠️ LA DATE EST CELLE DE L'ENCAISSEMENT (décision d'Alex, 17/08), jamais celle
// de la première séance ni un étalement sur la durée du contrat.
egal('datée du jour de l’encaissement', ligneAbo.date, '2026-08-15')
egal('pour le prix payé', ligneAbo.total, 540)
egal('ventilée au taux figé', ligneAbo.parTaux['21'] ?? ligneAbo.parTaux[21], 540)
egal('encaissée en ligne', ligneAbo.enLigne, 540)
egal('donc rien au comptoir', ligneAbo.comptoir, 0)
egal('et ses frais Stripe suivent', ligneAbo.fraisStripe, 8.1)

// Inscrit à la main et réglé sur place : le même contrat, l'autre colonne.
const [ligneComptoir] = construireLignes({
  abonnements: [{ ...ABO_EN_LIGNE, mode_paiement: 'sur_place', stripe_frais: null, stripe_net: null }],
})
egal('un abonnement réglé sur place va au comptoir', ligneComptoir.comptoir, 540)
egal('et rien en ligne', ligneComptoir.enLigne, 0)
// ⚠️ LA CONVENTION A CHANGÉ LE 19/08, ET CETTE GARDE DÉFENDAIT L'ANCIENNE.
// `null` voulait dire « aucun frais » ; il veut désormais dire « frais jamais
// relevé », parce que le journal annonçait « 0,00 € de frais Stripe » sur
// 1600 € encaissés en ligne. Un abonnement réglé sur place n'a pas un frais
// INCONNU : il en a ZÉRO, et l'écrire est une information, pas une invention.
egal('un règlement sur place ne coûte rien à Stripe, et le dit', ligneComptoir.netStripe, 0)
egal('frais compris', ligneComptoir.fraisStripe, 0)

// ⚠️ ON N'ÉCRIT QUE CE QUI A ÉTÉ ENCAISSÉ. Un contrat non payé est une
// promesse, pas une recette, et une ligne sans date d'encaissement se
// rattacherait au mauvais mois.
egal('un contrat non payé n’entre pas au journal',
  construireLignes({ abonnements: [{ ...ABO_EN_LIGNE, paye: false }] }).length, 0)
egal('ni un contrat sans date d’encaissement',
  construireLignes({ abonnements: [{ ...ABO_EN_LIGNE, paye_le: null }] }).length, 0)
egal('ni un contrat à prix nul',
  construireLignes({ abonnements: [{ ...ABO_EN_LIGNE, prix: 0 }] }).length, 0)

// ⚠️ SANS TAUX FIGÉ, ON RETOMBE SUR CELUI DU COMMERCE, PUIS SUR « NON
// RENSEIGNÉ ». Jamais sur un taux inventé, qui passerait inaperçu dans une
// déclaration : c'est la règle de tout le module fiscal.
const [ligneRepli] = construireLignes({
  abonnements: [{ ...ABO_EN_LIGNE, tva_taux: null }], tauxDefaut: 6,
})
egal('sans taux figé, le taux du commerce s’applique', ligneRepli.parTaux[6], 540)
const [ligneNR] = construireLignes({ abonnements: [{ ...ABO_EN_LIGNE, tva_taux: null }] })
egal('et sans taux du tout, la colonne « non renseigné »', ligneNR.parTaux.NR, 540)

// La route doit les charger, et les découper sur la date d'ENCAISSEMENT.
const srcExportRoute = sansComm(
  readFileSync(new URL('../app/api/dashboard/export-comptable/route.js', import.meta.url), 'utf8'))
verifier('l’export charge les abonnements', /from\('abonnements'\)/.test(srcExportRoute))
verifier('et les passe au calcul', /abonnements,/.test(srcExportRoute))
// ⚠️ CETTE GARDE VERROUILLAIT LE DÉFAUT. Elle exigeait la présence EXACTE de
// `paye_le || '').slice(0, 10)`, c'est-à-dire du découpage en temps universel :
// corriger le bug la faisait rougir. Une garde doit dire ce qu'on veut obtenir,
// jamais comment c'était écrit hier. Réécrite le 19/08 sur l'intention.
verifier('en les découpant sur paye_le', /jourBruxelles\(a\?\.paye_le\)/.test(srcExportRoute))
verifier('et en heure belge, pas en temps universel',
  !/paye_le[^)]*\)\.slice\(0, 10\)/.test(srcExportRoute))
// ⚠️ GARDE NÉE MUETTE, MESURÉE EN MUTATION : la ligne ci-dessus lit bien
// `paye_le`, mais rien ne vérifiait qu'on s'en SERVAIT pour borner la période.
// Un filtre qui rend toujours vrai livrerait au comptable un journal contenant
// TOUT L'HISTORIQUE des abonnements, sur un document qu'il signe.
verifier('et en les bornant vraiment aux deux dates demandées',
  /jour >= du && jour <= au/.test(srcExportRoute))

// La même borne côté tableau de bord, et des DEUX côtés pour la période
// précédente : sans borne basse, la comparaison opposerait trente jours à tout
// l'historique et annoncerait un effondrement à un commerce en pleine forme.
const srcStatsRoute = sansComm(
  readFileSync(new URL('../app/api/dashboard/statistiques/route.js', import.meta.url), 'utf8'))
// ⚠️ ENCORE UNE GARDE QUI VERROUILLAIT LE DÉFAUT, la troisième du 19/08. Elle
// exigeait `String(a.paye_le).slice(0, 10)`, c'est-à-dire le découpage en temps
// universel : corriger le fuseau la faisait rougir. On demande maintenant ce
// qu'on veut obtenir, pas la façon dont c'était écrit hier.
verifier('le tableau de bord découpe lui aussi sur la date d’encaissement',
  /jourBruxelles\(a\.paye_le\) >= jourDebut/.test(srcStatsRoute))
verifier('… et en heure belge, pas en temps universel',
  !/paye_le\)\.slice\(0, 10\)/.test(srcStatsRoute))
verifier('et sa période précédente est bornée des deux côtés',
  /jour >= jourDebutPrecedent && jour < jourDebut/.test(srcStatsRoute))

// ─── LE CHIFFRE D'AFFAIRES DU TABLEAU DE BORD ─────────────────────────────
const { chiffreAffaires: caStats } = await import('../lib/statistiques.js')

const CA_ABO = caStats([], [], [
  { prix: 540, paye: true, mode_paiement: 'en_ligne' },
  { prix: 300, paye: true, mode_paiement: 'sur_place' },
  { prix: 200, paye: false, mode_paiement: 'en_ligne' },
])
egal('les abonnements payés entrent au chiffre d’affaires', CA_ABO.abonnements, 840)
egal('et pas ceux qui ne le sont pas', CA_ABO.nb_abonnements, 2)
egal('la vente en ligne se retrouve dans l’encaissé en ligne', CA_ABO.encaisse_en_ligne, 540)
egal('et celle réglée sur place au comptoir', CA_ABO.au_comptoir, 300)
egal('le total les additionne au reste', CA_ABO.total, 840)
// ⚠️ ET UN ABONNEMENT NE COMPTE QU'UNE FOIS. Les séances posées dessus portent
// `prix_estime: 0` précisément pour ça : sans quoi un contrat de trente-six
// séances entrerait trente-sept fois au chiffre d'affaires.
const CA_DOUBLE = caStats([], [
  { statut: 'honore', prix_estime: 0, abonnement_id: 'abo-1' },
  { statut: 'honore', prix_estime: 0, abonnement_id: 'abo-1' },
], [{ prix: 540, paye: true, mode_paiement: 'en_ligne' }])
egal('les séances d’un abonnement ne le recomptent pas', CA_DOUBLE.total, 540)
// Les appelants d'avant continuent de fonctionner : le paramètre est ajouté.
egal('sans abonnements, rien ne change', caStats([], []).abonnements, 0)

// ═══════════════════════════════════════════════════════════════════════════
// LES EXEMPLES DE TVA PARLENT LE MÉTIER DE CELUI QUI LES LIT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ « ILS PARLENT DE BOISSONS, BOISSONS ALCOOLISÉES, SUR PLACE, EMPORTÉ. Pas
// top quand on est coiffeur, prof de yoga ou boutique de vêtements » (Alex).

const { aideTaux, optionsTaux, familleCommerce, tauxLePlusCourant, CAT_SERVICE: SERVICE, CAT_DETAIL: DETAIL } =
  await import('../lib/tva-aide.js')

egal('une vitrine est un service', familleCommerce('vitrine'), 'vitrine')
egal('une boutique est du détail', familleCommerce('detail'), 'detail')
egal('tout le reste est alimentaire', familleCommerce('boulangerie'), 'alimentaire')
egal('et une catégorie absente aussi', familleCommerce(null), 'alimentaire')

// ⚠️ AUCUNE MENTION DE NOURRITURE CHEZ UN COIFFEUR OU UNE PROF DE YOGA.
const REFS = [
  { taux: 0, libelle: 'Exonéré', aide: 'texte générique de la base' },
  { taux: 6, libelle: '6 %', aide: 'Denrées alimentaires et boissons non alcoolisées.' },
  { taux: 12, libelle: '12 %', aide: 'Nourriture servie et consommée sur place.' },
  { taux: 21, libelle: '21 %', aide: 'Boissons alcoolisées, boissons servies sur place.' },
]
const POUR_SERVICE = optionsTaux(REFS, SERVICE).map(o => o.texte).join(' | ')
verifier('un service ne lit plus un mot de nourriture ni de boisson',
  !/boisson|alcool|denrée|nourriture/i.test(POUR_SERVICE))
const POUR_DETAIL = optionsTaux(REFS, DETAIL).map(o => o.texte).join(' | ')
verifier('une boutique non plus',
  !/boisson|alcool|denrée|nourriture/i.test(POUR_DETAIL))
verifier('mais une friterie garde ses exemples',
  /boissons non alcoolisées/i.test(optionsTaux(REFS, 'alimentaire').map(o => o.texte).join(' ')))

// ⚠️ ON NE CACHE AUCUN TAUX : ce serait décider de la fiscalité de quelqu'un à
// sa place. Une boutique de vêtements peut vendre un livre à 6 %.
egal('tous les taux restent proposés à un service', optionsTaux(REFS, SERVICE).length, 4)
egal('et à une boutique', optionsTaux(REFS, DETAIL).length, 4)
// On se contente de NOMMER le plus courant, sans jamais le présélectionner.
egal('le taux courant d’un service est le taux normal', tauxLePlusCourant('vitrine'), 21)
egal('celui d’un commerce alimentaire est le réduit', tauxLePlusCourant('boulangerie'), 6)
verifier('et il est signalé dans la liste',
  optionsTaux(REFS, SERVICE).filter(o => o.courant).length === 1
  && /le plus courant chez toi/.test(optionsTaux(REFS, SERVICE).find(o => o.courant).texte))

// ⚠️ NE RIEN AFFICHER EST LA PIRE DES SORTIES : le jour où un taux apparaît en
// base sans passer par ce fichier, le commerçant doit continuer à lire quelque
// chose, sinon il choisit à l'aveugle.
egal('un taux inconnu retombe sur l’exemple de la base',
  aideTaux(9, SERVICE, 'exemple venu de la base'), 'exemple venu de la base')
egal('et sans rien du tout, on ne fabrique pas de phrase',
  aideTaux(9, SERVICE, null), null)

// Les deux écrans de saisie passent par le module.
verifier('la fiche article prend les exemples du métier du commerce',
  (srcConfigAbo.match(/optionsTaux\(tvaRefs, commercant\?\.categorie\)/g) || []).length === 2)
// ⚠️ UNE PRESTATION EST UNE PRESTATION DE SERVICES, quelle que soit la
// catégorie du commerce : en Belgique c'est la NATURE DE L'OPÉRATION qui
// commande le taux, jamais le rayon du magasin.
verifier('et la fiche prestation prend toujours celles du service',
  /optionsTaux\(tvaRefs, CAT_SERVICE\)/.test(srcConfigAbo))

// ⚠️ LA DATE D'ACHAT VIENT DE STRIPE, pas de notre horloge : un webhook rejoué
// trois jours plus tard fabriquerait une fenêtre de validité décalée d'autant.
verifier('la date d’achat vient du paiement, pas de l’horloge du serveur',
  /paymentIntent\.created/.test(srcWebhook))

// ⚠️ LE NOMBRE DE SÉANCES VOYAGE AVEC LE PAIEMENT. Un commerçant qui modifie
// ses congés entre le clic et l'encaissement livrerait sinon autre chose que ce
// qui a été payé, et c'est le client qui aurait raison.
// ⚠️ REPOINTÉE LE 03/10 : ce sont les séances de l'OFFRE DU JOUR qui voyagent.
verifier('le nombre de séances payées voyage dans le paiement',
  /seances_total: String\(offre\.seances\)/.test(srcCheckout))
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
// ⚠️ `formule_id`, `prestation_id` et `created_at` sont arrivés le 16/08 pour
// l'écran de confirmation d'achat : le cours couvert, le nom de la formule et
// la date d'achat. Ils vivent DANS CETTE LISTE et pas dans un test à part,
// parce qu'une deuxième vérification écrite plus bas s'était laissée tromper
// par le select VOISIN, celui des formules, qui porte le même nom de colonne.
for (const champ of ['id', 'commercant_id', 'formule_id', 'prestation_id', 'type', 'mode', 'statut', 'prix', 'seances_total', 'date_debut', 'date_fin', 'created_at']) {
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
// ⚠️ « AU MINIMUM » A DISPARU LE 18/08, et c'est un progrès : le nombre n'est
// plus une prudence, c'est le compte exact des semaines. Promettre moins que ce
// qu'on donne était le prix à payer pour un jour figé qui n'existe plus.
verifier('et il ne se couvre plus derrière un minimum', !/minimum/.test(phrase), phrase)
verifier('la période est rappelée en clair',
  /du 7 septembre au 21 décembre/.test(phrase), phrase)

// ⚠️ LE NOMBRE ANNONCÉ EST CELUI DES SEMAINES, et il est SUPÉRIEUR au compte
// par jour le moins favorable qu'on annonçait avant. C'est bien le sens du
// changement : l'abonnée récupère les semaines qu'un jour malchanceux lui
// faisait perdre. Le test compare aux DEUX anciens repères, sinon il ne
// prouverait rien sur une formule où tous les jours se valent.
const parJour = JOURS_SEMAINE_FR.map(j => datesDeSeances({
  dateDebut: FORMULE_APERCU.date_debut, dateFin: FORMULE_APERCU.date_fin,
  jourSemaine: j, periodesExclues: FORMULE_APERCU.periodes_exclues,
}).length)
const minimum = Math.min(...parJour)
const maximum = Math.max(...parJour)
const annonce = seancesDeLaFormule(FORMULE_APERCU)
verifier('le nombre annoncé est celui des semaines',
  phrase.startsWith(`${annonce} séance`), `${phrase} / semaines ${annonce}`)
verifier('et il ne lèse plus le client du jour malchanceux', annonce >= maximum,
  `annoncé ${annonce}, meilleur jour ${maximum}, pire jour ${minimum}`)
// ⚠️ ET LE CAS DE TEST PORTE BIEN UN ÉCART ENTRE LES JOURS, sans quoi la ligne
// au-dessus passerait sur n'importe quoi. Mesuré sur une vraie semaine de congé.
verifier('et le cas de test porte bien un écart entre les jours', maximum > minimum,
  `min ${minimum}, max ${maximum}`)

// L'explication accompagne toujours le nombre : sans elle, le commerçant se
// demande quel jour Yoppaa a bien pu choisir à sa place.
verifier('l’explication dit que le client choisit son jour',
  /choisit son jour/.test(expliquerApercuFormule(FORMULE_APERCU)))
verifier('et qu’il peut en changer d’une semaine à l’autre',
  /changer d’une semaine à l’autre/.test(expliquerApercuFormule(FORMULE_APERCU)))
// ⚠️ ET LE PLAFOND SE DIT QUAND IL VAUT PLUS DE UN, sinon le commerçant ne sait
// pas ce qui empêche une abonnée de tout consommer en trois semaines.
verifier('au-delà d’une par semaine, le plafond est nommé',
  /sans jamais dépasser 2 sur la même semaine/.test(
    expliquerApercuFormule({ ...FORMULE_APERCU, seances_par_semaine: 2 })))

// Deux séances par semaine doublent le compte annoncé.
verifier('le rythme hebdomadaire multiplie le nombre annoncé',
  phraseApercuFormule({ ...FORMULE_APERCU, seances_par_semaine: 2 })
    .startsWith(`${annonce * 2} séance`))

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
// ⚠️ REPOSÉE SUR LA RÈGLE LE 26/08, ET C'EST LE CINQUIÈME VERROUILLAGE DE
// FORME DU PROJET. Elle exigeait l'expression LITTÉRALE
// `estVitrine && canDo(commercant?.plan, 'rdv')` et refusait donc une
// évolution juste : `peut(commercant, 'rdv')` porte exactement la même règle,
// puisque la matrice réserve déjà `rdv` aux commerces de service, et sait en
// plus lire un essai en cours.
//
// Ce qui doit rester vrai, et que cette garde mesure :
//   • le droit se déduit de la fonctionnalité `rdv`, pas d'un booléen posé à
//     la main ;
//   • il ne se calcule JAMAIS sur un `.plan` détaché, parce que c'est en le
//     détachant qu'on perd la catégorie en route et qu'on ouvre le module aux
//     boulangeries.
// Que `rdv` soit bien refusé hors commerce de service est prouvé par
// EXÉCUTION dans scripts/verif-plans.mjs, jamais par lecture de source.
const calculPeutAbonnements = /const peutAbonnements = ([^\n]+)/.exec(srcAbo)?.[1] || ''
verifier('le catalogue ne propose les abonnements qu’aux commerces de service',
  /'rdv'/.test(calculPeutAbonnements) && !/\.plan\b/.test(calculPeutAbonnements),
  calculPeutAbonnements || 'ligne introuvable')
verifier('et sans eux, aucune barre de sous-onglets ne s’affiche',
  /if \(!peutAbonnements\) \{[\s\S]{0,160}return <TabMenu/.test(srcAbo))
// La formule reste attachée à une prestation : c'est ce qui rend le module
// inapplicable à un métier sans agenda, et c'est volontaire.
verifier('une formule exige toujours une prestation',
  /if \(!form\.prestation_id\) return toast/.test(srcAbo))

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ APRÈS LE PAIEMENT, L'APPLICATION SE TAISAIT SUR TOUTE LA LIGNE
//
// Trouvé par Alex le 16/08 en payant réellement 400 € : aucun écran de
// confirmation, aucun email, et l'abonnement invisible dans son espace. Le
// contrat existait en base, le commerçant le voyait dans ses Abonnés, et
// l'acheteur n'avait RIEN. « 400 € dans le vent », selon ses mots.
//
// ⚠️ POUR UN MONTANT À TROIS CHIFFRES, UNE PREUVE D'ACHAT N'EST PAS UN CONFORT.
// C'est la première chose qu'on cherche quand ça se passe mal, et son absence
// est indéfendable devant un client comme devant un juge.
// ═══════════════════════════════════════════════════════════════════════════
const { messageRetourAbonnement, resumeContratAchete } = await import('../lib/abonnements.js')

// ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE LECTURE DE SOURCE, et ce n'est
// pas un raffinement : les commentaires que je viens d'écrire CITENT les noms
// de fonctions qu'on vérifie ici. Sans ce nettoyage, retirer l'appel réel
// laisserait le test vert, le nom survivant dans l'explication d'à côté. Ce
// piège s'est présenté trois fois sur ce projet.
const sansCommentaires = (src) => String(src)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const retourOk = messageRetourAbonnement('ok', { nomCommerce: 'Centre Respire' })
verifier('le retour de paiement se félicite', /Yopp/.test(retourOk?.titre || ''), retourOk?.titre)
verifier('et il nomme le commerce', /Centre Respire/.test(retourOk?.message || ''))
verifier('il annonce l’email qui arrive', /email/.test(retourOk?.message || ''))
// ⚠️ LA PHRASE QUI ÉVITE UNE ATTENTE VAINE. Un abonnement en mode crédit ne
// pose AUCUNE séance à l'agenda : sans elle, le client attend un planning qui
// n'arrivera jamais, et il appellera le commerçant pour le lui demander.
verifier('et il dit que les séances ne sont pas encore réservées',
  /pas encore réservées/.test(retourOk?.suite || ''), retourOk?.suite)

const retourAnnule = messageRetourAbonnement('annule')
verifier('un paiement annulé le dit', /annulé/i.test(retourAnnule?.titre || ''))
verifier('et rassure sur le débit', /débité/.test(retourAnnule?.message || ''))

// ⚠️ UN PARAMÈTRE INCONNU NE FABRIQUE PAS DE CONFIRMATION. Sans cette garde,
// n'importe qui déclencherait « ton abonnement est actif » depuis la barre
// d'adresse, sans avoir rien payé.
egal('un paramètre inconnu ne dit rien', messageRetourAbonnement('bidon'), null)
egal('et rien du tout non plus', messageRetourAbonnement(), null)

// Le résumé, celui que lisent L'ÉCRAN ET L'EMAIL. Une seule écriture : un email
// qui annonce autre chose que l'écran est pire que pas d'email du tout.
const resumeAchat = resumeContratAchete(
  { seances_total: 45, date_debut: '2026-08-15', date_fin: '2027-07-01', prix_paye: 400, mode: 'credit' },
  { nomCommerce: 'Centre Respire', nomFormule: 'Abonnement annuel Yoga' },
)
egal('le résumé compte les séances', resumeAchat.seances, '45 séances')
egal('il borne la validité', resumeAchat.validite, 'Du 15 août au 1er juillet')
// 🔴 CETTE GARDE ATTENDAIT « 400.00 € », AVEC LE POINT ANGLAIS (corrigé le
// 17/09). Elle avait recopié ce que le code produisait au lieu de dire ce qu'il
// devait produire : verte, et complice d'un montant illisible en français sur
// un récapitulatif d'abonnement à 400 €.
//
// ⚠️ ON COMPARE AVEC `euros()`, JAMAIS AVEC UNE CHAÎNE ÉCRITE À LA MAIN. Une
// garde qui recopie le format teste sa propre copie, et rougit le jour où le
// format s'améliore : c'est la règle déjà posée en tête de `verif:logique`,
// après qu'un passage à l'espace insécable en eut fait tomber cinq d'un coup.
egal('il porte le montant payé, à la française', resumeAchat.prix, euros(400))
// ⚠️ CE QUE LE CLIENT A À FAIRE dépend du MODE, et c'est l'information la plus
// utile des cinq : en crédit il doit réserver, personne ne le lui dira sinon.
verifier('en crédit, il dit qu’il faut réserver soi-même',
  /réserves tes séances toi-même/.test(resumeAchat.aFaire), resumeAchat.aFaire)
// ⚠️ ET IL LE DIT MÊME SUR UN VIEUX CONTRAT À PLACE FIXE. Cette phrase se lisait
// autrefois sur `mode` ; elle n'en dépend plus depuis le 18/08, et elle n'aurait
// jamais dû : ce résumé ne suit qu'un ACHAT EN LIGNE, où personne n'a posé la
// moindre séance, le commerçant n'étant pas devant son écran à cet instant.
verifier('et il le dit aussi sur un contrat d’avant la suppression du jour fixe',
  /réserves tes séances toi-même/.test(
    resumeContratAchete({ seances_total: 10, mode: 'place_fixe' }).aFaire))
egal('sans contrat, aucun résumé', resumeContratAchete(null), null)

// ─── LES TROIS SURFACES SONT BRANCHÉES ────────────────────────────────────
const srcFicheAbo = sansCommentaires(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
// ⚠️ Stripe renvoie sur `?abonnement=ok` et AUCUNE ligne de cette page ne lisait
// ce paramètre : le client atterrissait sur la fiche ordinaire, comme s'il
// n'avait rien fait.
verifier('la fiche lit le retour de paiement',
  /new URLSearchParams\(window\.location\.search\)\.get\('abonnement'\)/.test(srcFicheAbo))
verifier('et elle affiche le message qui va avec',
  /messageRetourAbonnement\(abonnementRetour, \{ nomCommerce: commercant\.nom \}\)/.test(srcFicheAbo))
// Le paramètre est nettoyé, sans quoi un rafraîchissement rejouerait la
// confirmation d'un achat déjà fait.
verifier('le paramètre est retiré de l’adresse',
  /url\.searchParams\.delete\('abonnement'\)/.test(srcFicheAbo))

const srcWebhookAbo = sansCommentaires(readFileSync(new URL('../app/api/stripe/webhook/route.js', import.meta.url), 'utf8'))
verifier('le webhook envoie la confirmation au client',
  /emailAbonnementConfirme\(\{/.test(srcWebhookAbo))
verifier('et prévient le commerçant de la vente',
  /emailAbonnementVenduCommercant\(\{/.test(srcWebhookAbo))
// 🔴 CE QUE LE CLIENT A TAPÉ PARTAIT TEL QUEL DANS L'EMAIL DU COMMERÇANT (03/10).
// Exécuté : un nom ou une formule qui contiennent du HTML ressortent échappés.
{
  const { emailAbonnementVenduCommercant, emailAbonnementConfirme } = await import('../lib/resend.js')
  const resume = { formule: 'Annuel <i>yoga</i>', seances: '36 séances', validite: 'Du 1/10 au 30/6', prix: '450,00 €', aFaire: 'Tu réserves tes séances toi-même, quand tu veux.' }
  const pro = emailAbonnementVenduCommercant({ nom_commercant: 'Centre Respire', client_prenom: '<b>Sophie</b>', client_nom: 'Martin', resume })
  verifier('🔴 l’email du commerçant échappe le nom du client', !/<b>Sophie<\/b>/.test(pro) && /&lt;b&gt;Sophie/.test(pro))
  verifier('🔴 et la formule', !/<i>yoga<\/i>/.test(pro))
  // ⚠️ REPOINTÉE LE 04/10 (D2) : « lui-même » devient « en autonomie ».
  verifier('⚠️ et ne lui dit plus « tu réserves tes séances toi-même », phrase écrite pour le client',
    !/réserves tes séances toi-même/.test(pro) && /Ton client réserve ses séances en autonomie/.test(pro))
  const client = emailAbonnementConfirme({ yopper_prenom: 'Sophie', commercant_nom: 'Centre Respire', resume, mes_abonnements_url: 'https://www.yoppaa.app/x' })
  verifier('🔴 l’email du client échappe aussi la formule', !/<i>yoga<\/i>/.test(client) && /Annuel &lt;i&gt;yoga/.test(client))
}
// ⚠️ L'ENVOI NE DOIT JAMAIS FAIRE ÉCHOUER LE WEBHOOK. Une erreur remontée ferait
// répondre 500 à Stripe, qui rejouerait l'événement : le contrat étant déjà
// créé, on fabriquerait des doublons pour un email qui n'est pas parti.
verifier('un email en échec ne rejoue pas le paiement',
  /catch \(e\) \{\s*console\.error\('\[stripe\/webhook\] emails abonnement KO'/.test(srcWebhookAbo))

const srcResendAbo = readFileSync(new URL('../lib/resend.js', import.meta.url), 'utf8')
verifier('l’email dit qu’il est la preuve d’achat',
  /preuve d'achat/.test(srcResendAbo))

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ L'EMAIL D'ACHAT NE SE RETAPE PAS QUAND ON LE CONNAÎT DÉJÀ
//
// Le formulaire d'achat démarrait ENTIÈREMENT VIDE, même pour un Yopper
// connecté. Il devait retaper son email, et la moindre différence — une faute,
// une autre adresse, une autocomplétion du navigateur — rattachait le contrat
// à CET email-là.
//
// ⚠️ ET LE CONTRAT DISPARAÎT ALORS POUR TOUJOURS de son espace : c'est l'email
// qui le relie à son propriétaire. Alex l'a vécu sur un abonnement de 400 €,
// et la requête l'a prouvé, « email_correspond » valait false.
//
// ⚠️ Le commentaire posé sous ce champ disait DÉJÀ que cet email était la clé.
// Savoir qu'une saisie est critique et la laisser vide, c'est la même faute
// que de ne pas le savoir.
// ═══════════════════════════════════════════════════════════════════════════
const srcBlocAbo = sansCommentaires(readFileSync(new URL('../app/commander/rdv/[slug]/BlocAbonnements.js', import.meta.url), 'utf8'))
// ⚠️ RÉORIENTÉE LE 04/10 (Abo-I7) : la signature reçoit aussi `sansCompte`.
verifier('le bloc d’achat reçoit l’identité du client',
  /client = null, sansCompte = false \}\) \{/.test(srcBlocAbo))
verifier('et il préremplit ce qu’on connaît déjà',
  /email: p\.email \|\| client\.email \|\| ''/.test(srcBlocAbo))
// ⚠️ ON NE PIÉTINE PAS UNE SAISIE EN COURS. Garder ce que le client a commencé
// à taper est le point délicat : préremplir par écrasement effacerait sa
// correction dès que l'identité arrive, un instant plus tard.
verifier('sans jamais écraser ce que le client a déjà tapé',
  /prenom: p\.prenom \|\| client\.prenom/.test(srcBlocAbo))
const srcFicheBloc = sansCommentaires(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
verifier('et la fiche la lui passe vraiment',
  /<BlocAbonnements[^>]*client=\{client\}/.test(srcFicheBloc))

// ⚠️ ACHETER SOUS UNE AUTRE ADRESSE QUE CELLE DE SON COMPTE : ON AVERTIT.
//
// Alex l'a fait volontairement pour tester, avec une adresse en « +abotest »,
// et RIEN ne le lui a dit. Son abonnement était donc introuvable dans son
// espace, et le système avait pourtant raison : le contrat portait bien
// l'adresse saisie.
//
// ⚠️ Un vrai client qui met son adresse professionnelle par réflexe perdrait
// l'accès à son abonnement sans jamais comprendre pourquoi : le contrat
// existerait, le commerçant le verrait, et son espace resterait vide.
//
// ⚠️ ON AVERTIT, ON NE BLOQUE PAS. Offrir un abonnement est légitime, et
// refuser une adresse au moment de payer ferait perdre la vente pour un cas
// qui se règle par une phrase.
verifier('un email différent de celui du compte est signalé',
  /const emailDifferent = !!emailCompte && emailSaisi\.includes/.test(srcBlocAbo))
// La comparaison se fait en minuscules et sans espaces, comme partout où cet
// email sert de clé : sinon une majuscule de trop crierait sur deux adresses
// identiques.
verifier('et la comparaison ignore la casse et les espaces',
  /const emailCompte = String\(client\?\.email \|\| ''\)\.trim\(\)\.toLowerCase\(\)/.test(srcBlocAbo))
// ⚠️ On ne dit rien tant que l’email n’est pas complet : signaler une
// différence pendant la frappe reviendrait à crier à chaque lettre.
verifier('rien n’est dit pendant la frappe',
  /emailSaisi\.includes\('@'\) && emailSaisi !== emailCompte/.test(srcBlocAbo))
verifier('l’avertissement nomme l’adresse qui recevra l’abonnement',
  /Ton abonnement sera rattaché à <strong>\{form\.email\.trim\(\)\}<\/strong>/.test(srcBlocAbo))


// ═══════════════════════════════════════════════════════════════════════════
// L'ÉCRAN DE CONFIRMATION D'UN ABONNEMENT (Alex, 16/08)
//
// « C'est une fenêtre qui s'ouvre sur la fiche et pas un écran de confirmation
// comme pour toutes les autres transactions, il faut modifier et faire comme
// pour le reste, le client doit garder ses repères. »
//
// ⚠️ UNE COMMANDE OUVRE UN ÉCRAN, UN RENDEZ-VOUS OUVRE UN ÉCRAN, et
// l'abonnement — le montant le plus élevé du catalogue — se contentait d'un
// cadre vert posé entre les deals et les horaires.
// ═══════════════════════════════════════════════════════════════════════════

const etapesCredit = etapesApresAbonnement({ mode: 'credit', nomCommerce: 'Centre Respire' })
egal('trois lignes disent la suite, ni plus ni moins', etapesCredit.length, 3)
// ⚠️ CE QU'IL DOIT SAVOIR EN PREMIER : il a une preuve d'achat. Pour un montant
// à trois chiffres, c'est la première chose qu'on cherche quand ça se passe mal.
verifier('la preuve d’achat vient en premier', /preuve d’achat/.test(etapesCredit[0]))
// ⚠️ DANS LES DEUX MODES. Le premier test ne lisait que la branche « crédit » :
// la même ligne existe en « place fixe », et la casser ne faisait rougir
// personne. Une règle qui vaut des deux côtés se vérifie des deux côtés.
verifier('dans les deux modes, y compris place fixe',
  /preuve d’achat/.test(etapesApresAbonnement({ mode: 'place_fixe' })[0]))
// ⚠️ ET LA PHRASE QUI MANQUAIT VRAIMENT : en mode crédit, AUCUNE séance n'est
// posée à l'agenda. Sans qu'on le dise, l'acheteur attend un planning qui
// n'arrivera jamais.
verifier('en crédit, on dit que rien n’est encore réservé',
  /pas encore réservées/.test(etapesCredit[1]))
verifier('et on dit où il choisira ses dates',
  /Centre Respire/.test(etapesCredit[1]))
// ⚠️ LA BRANCHE « PLACE FIXE » A DISPARU LE 18/08. Elle annonçait « tes séances
// sont déjà réservées », ce qui n'a jamais pu être vrai ici : ces trois lignes
// suivent un PAIEMENT EN LIGNE. Un mode oublié dans l'appel ne doit donc plus
// changer un seul mot, et c'est ce que ce test mesure.
const etapesFixe = etapesApresAbonnement({ mode: 'place_fixe', nomCommerce: 'Centre Respire' })
verifier('un vieux mode passé par erreur ne change plus rien',
  JSON.stringify(etapesFixe) === JSON.stringify(etapesCredit))
// Sans nom de commerce, la phrase reste une phrase française.
verifier('sans nom de commerce, la phrase tient debout',
  !/ de ,|depuis la fiche de\./.test(etapesApresAbonnement({ mode: 'credit' })[1]))

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 ABO-I7 (04/10) : L'INVITÉ PAYAIT UN ABONNEMENT QU'IL NE POUVAIT PAS UTILISER
//
// Le contrat ne se lit qu'avec une identité PROUVÉE. Un invité payait, la fiche
// relisait quinze fois un refus, puis disait « tu le retrouveras dans Commandes
// et rendez-vous », ce qui était faux ; « Réserver ma première séance » le
// menait vers une séance au prix normal ; et l'email ne disait pas de se
// connecter avec CETTE adresse. Et le bouton « Payer » annonçait le prix plein
// d'une période entamée que Stripe encaissait au prix réduit.
// ═══════════════════════════════════════════════════════════════════════════
{
  const { PHRASE_CONNEXION_ABONNEMENT } = await import('../lib/abonnements.js')
  const invite = etapesApresAbonnement({ nomCommerce: 'Centre Respire', sansCompte: true, email: 'sophie@exemple.be' })
  egal('sans compte : toujours trois lignes', invite.length, 3)
  verifier('🔴 sans compte : la troisième dit avec quelle adresse se connecter',
    /connecte-toi avec sophie@exemple\.be/.test(invite[2]) && !/Commandes et rendez-vous/.test(invite[2]), invite[2])
  verifier('et qu’aucun mot de passe n’est demandé', /sans mot de passe/.test(invite[2]))
  verifier('sans adresse connue, la phrase tient debout',
    /l’adresse de ton achat/.test(etapesApresAbonnement({ sansCompte: true })[2]))
  verifier('connecté : la troisième ligne ne change pas',
    /Commandes et rendez-vous/.test(etapesApresAbonnement({ nomCommerce: 'Centre Respire' })[2]))

  const retourInvite = messageRetourAbonnement('ok', { nomCommerce: 'Centre Respire', sansCompte: true })
  verifier('🔴 sans compte : on n’annonce pas « actif » sans l’avoir relu',
    !/actif/.test(`${retourInvite?.titre} ${retourInvite?.message}`), retourInvite?.message)
  verifier('et la suite dit de se connecter', /connecte-toi/.test(retourInvite?.suite || ''))
  egal('un paramètre inconnu reste muet, même sans compte', messageRetourAbonnement('bidon', { sansCompte: true }), null)

  verifier('la phrase de l’email dit « cette adresse » et « sans mot de passe »',
    /connecte-toi/.test(PHRASE_CONNEXION_ABONNEMENT) && /cette adresse/.test(PHRASE_CONNEXION_ABONNEMENT)
    && /sans mot de passe/.test(PHRASE_CONNEXION_ABONNEMENT))
  const { emailAbonnementConfirme } = await import('../lib/resend.js')
  const mail = emailAbonnementConfirme({ yopper_prenom: 'Sophie', commercant_nom: 'Centre Respire', resume: { aFaire: 'x' }, mes_abonnements_url: 'https://www.yoppaa.app/commander/auth?redirect=%2Fcommander%2Frdv%2Fcentre', connexion: PHRASE_CONNEXION_ABONNEMENT, cta_label: 'Réserver mes séances' })
  verifier('🔴 l’email porte la phrase de connexion', mail.includes('connecte-toi sur Yoppaa avec cette adresse'))
  verifier('et son bouton dit le geste', /Réserver mes séances/.test(mail))

  // ─── Les branchements ─────────────────────────────────────────────────────
  const poll = (srcFicheAbo.match(/const timer = setInterval\(async \(\) => \{[\s\S]*?\}, 1000\)/) || [''])[0]
  verifier('🔴 la relecture s’arrête au premier refus « pas connecté »',
    /if \(res\.status === 401\) \{[\s\S]{0,120}setAboSansCompte\(true\)[\s\S]{0,60}setAboEnAttente\(false\)[\s\S]{0,40}clearInterval\(timer\)/.test(poll)
    && poll.indexOf('res.status === 401') < poll.indexOf('await res.json()'), poll.slice(0, 200))
  verifier('l’écran de confirmation reçoit « sans compte » et l’adresse',
    /sansCompte=\{aboSansCompte\}/.test(srcFicheAbo) && /emailAchat=\{aboEmailAchat\}/.test(srcFicheAbo))
  verifier('🔴 « Me connecter » mène à la connexion, puis revient sur la fiche',
    /onConnecter=\{\(\) => \{[\s\S]{0,400}router\.push\(`\/commander\/auth\?redirect=\$\{encodeURIComponent\(`\/commander\/rdv\/\$\{slug\}`\)\}`\)/.test(srcFicheAbo))
  verifier('et l’adresse passe par la mémoire de l’onglet, pas par l’URL',
    /sessionStorage\.setItem\(CLE_EMAIL_CONNEXION, aboEmailAchat\)/.test(srcFicheAbo) && !/[?&]email=/.test(srcFicheAbo))
  verifier('le bloc d’achat sait si la personne est connectée',
    /sansCompte=\{sessionProuvee === false\}/.test(srcFicheAbo) && /setSessionProuvee\(r\.status !== 401\)/.test(srcFicheAbo))

  const srcConfAbo = sansCommentaires(readFileSync(new URL('../app/commander/rdv/[slug]/ConfirmationAbonnement.js', import.meta.url), 'utf8'))
  verifier('🔴 sans compte, le bouton principal connecte au lieu de réserver au prix normal',
    /onClick=\{sansCompte \? onConnecter : onReserver\}/.test(srcConfAbo))
  verifier('et les textes de l’écran suivent « sans compte »',
    /etapesApresAbonnement\(\{ nomCommerce: commercant\?\.nom \|\| '', sansCompte, email: emailAchat \}\)/.test(srcConfAbo)
    && /messageRetourAbonnement\('ok', \{ nomCommerce: commercant\?\.nom \|\| '', sansCompte \}\)/.test(srcConfAbo))

  verifier('le bloc d’achat garde l’adresse pour l’écran de retour',
    /email: form\.email\.trim\(\)\.toLowerCase\(\),/.test(srcBlocAbo))
  verifier('🔴 le bouton « Payer » annonce le prix du jour, celui que Stripe encaisse',
    /Payer \$\{euros\(offreChoisie\?\.prix \?\? choisie\.prix\)\}/.test(srcBlocAbo)
    && /const offreChoisie = choisie \? resumeFormulePublique\(choisie, \{ achatLe: jourBruxelles\(\) \}\) : null/.test(srcBlocAbo)
    && !/euros\(choisie\.prix\)/.test(srcBlocAbo))
  verifier('l’invité est prévenu avant de payer', /\{sansCompte && \(/.test(srcBlocAbo))

  verifier('🔴 le webhook passe la phrase de connexion à l’email',
    /connexion: PHRASE_CONNEXION_ABONNEMENT,/.test(srcWebhookAbo)
    && /\/commander\/auth\?redirect=\$\{encodeURIComponent\(`\/commander\/rdv\/\$\{com\.slug\}`\)\}/.test(srcWebhookAbo))

  // L'écran de connexion propose l'adresse, une fois, et ne suit qu'un chemin interne.
  const srcAuth = sansCommentaires(readFileSync(new URL('../app/commander/auth/page.js', import.meta.url), 'utf8'))
  const srcConfirm = sansCommentaires(readFileSync(new URL('../app/commander/auth/confirm/page.js', import.meta.url), 'utf8'))
  verifier('la connexion préremplit l’adresse proposée', /const proposee = prendreEmailConnexion\(\)/.test(srcAuth))
  verifier('🔴 la connexion ne suit qu’un chemin interne',
    /const redirect = cheminInterne\(searchParams\.get\('redirect'\), '\/commander'\)/.test(srcAuth))
  verifier('🔴 le lien reçu par email non plus',
    /const next = cheminInterne\(searchParams\.get\('next'\), '\/commander'\)/.test(srcConfirm))

  // `prendreEmailConnexion`, exécuté sur une fausse mémoire d'onglet.
  const memoire = new Map()
  const avaitWindow = 'window' in globalThis
  if (!avaitWindow) globalThis.window = {}
  globalThis.sessionStorage = { getItem: k => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, String(v)), removeItem: k => memoire.delete(k) }
  const { prendreEmailConnexion, CLE_EMAIL_CONNEXION } = await import('../lib/identite-locale.js')
  memoire.set(CLE_EMAIL_CONNEXION, ' Sophie@Exemple.be ')
  verifier('l’adresse proposée sort normalisée', prendreEmailConnexion() === 'sophie@exemple.be')
  verifier('🔴 et une seule fois', prendreEmailConnexion() === '' && !memoire.has(CLE_EMAIL_CONNEXION))
  memoire.set(CLE_EMAIL_CONNEXION, 'pas-une-adresse')
  verifier('ce qui n’est pas une adresse n’est pas proposé', prendreEmailConnexion() === '')
  delete globalThis.sessionStorage
  if (!avaitWindow) delete globalThis.window
}

// ─── RETROUVER LE CONTRAT QU'ON VIENT DE PAYER ────────────────────────────
//
// ⚠️ « LE PLUS RÉCENT CHEZ CE COMMERÇANT » NE SUFFIT PAS, et c'est tout le
// sujet. Une cliente qui RENOUVELLE en a déjà un : tant que le webhook Stripe
// n'a pas écrit le nouveau contrat, l'ancien est le plus récent, et l'écran
// annoncerait des dates et un solde périmés. Comme plus rien ne le
// contredirait ensuite, l'erreur resterait affichée.
const ANCIEN = { commercant: { id: 'c1' }, formule: { id: 'f1' }, acheteLe: '2026-01-10T09:00:00Z', total: 12 }
const NOUVEAU = { commercant: { id: 'c1' }, formule: { id: 'f1' }, acheteLe: '2026-08-17T14:32:00Z', total: 36 }
const AUTRE_COMMERCE = { commercant: { id: 'c2' }, formule: { id: 'f9' }, acheteLe: '2026-08-17T14:33:00Z', total: 5 }
const clic = '2026-08-17T14:30:00Z'

egal('le contrat tout juste écrit est reconnu',
  contratQuiVientDEtreAchete([ANCIEN, NOUVEAU], { formuleId: 'f1', partiA: clic, commercantId: 'c1' })?.total, 36)
egal('et l’ancien contrat de la même formule est écarté',
  contratQuiVientDEtreAchete([ANCIEN], { formuleId: 'f1', partiA: clic, commercantId: 'c1' }), null)
egal('un contrat d’un autre commerce n’est jamais pris',
  contratQuiVientDEtreAchete([AUTRE_COMMERCE], { formuleId: 'f9', partiA: clic, commercantId: 'c1' }), null)
egal('ni celui d’une autre formule',
  contratQuiVientDEtreAchete([NOUVEAU], { formuleId: 'f2', partiA: clic, commercantId: 'c1' }), null)
// ⚠️ SANS REPÈRE, ON NE DEVINE PAS. Un onglet qui a perdu sa mémoire doit faire
// dire à l'écran qu'il attend, ce qui est vrai, plutôt qu'afficher un contrat
// dont personne ne sait s'il est le bon.
egal('sans repère, on ne rend rien plutôt que de se tromper',
  contratQuiVientDEtreAchete([ANCIEN, NOUVEAU], { commercantId: 'c1' }), null)
egal('et une liste vide ne rend rien non plus',
  contratQuiVientDEtreAchete([], { formuleId: 'f1', partiA: clic }), null)
// ⚠️ L'HORLOGE DU TÉLÉPHONE N'EST PAS CELLE DE LA BASE. Cinq minutes d'écart sur
// un mobile n'ont rien d'exceptionnel : sans marge, le contrat tout juste écrit
// passerait pour un vieux contrat et l'écran resterait muet.
egal('quatre minutes d’écart d’horloge ne font pas perdre le contrat',
  contratQuiVientDEtreAchete([{ ...NOUVEAU, acheteLe: '2026-08-17T14:26:00Z' }],
    { formuleId: 'f1', partiA: clic, commercantId: 'c1' })?.total, 36)
egal('mais une heure d’écart, si',
  contratQuiVientDEtreAchete([{ ...NOUVEAU, acheteLe: '2026-08-17T13:20:00Z' }],
    { formuleId: 'f1', partiA: clic, commercantId: 'c1' }), null)
// Une date d'achat absente ne doit pas se faire passer pour récente : sinon un
// contrat sans horodatage l'emporterait sur celui qu'on cherche.
// ⚠️ ET QUAND DEUX CONTRATS PASSENT, C'EST LE PLUS RÉCENT. Le premier jeu de
// données ne le vérifiait pas : le filtre de temps écartait l'ancien, il ne
// restait qu'un candidat, et inverser le tri ne faisait rougir personne. Le cas
// arrive dès qu'on cherche sur la seule formule, sans instant de départ.
const RENOUVELLE = { commercant: { id: 'c1' }, formule: { id: 'f1' }, acheteLe: '2026-09-01T10:00:00Z', total: 48 }
egal('entre deux contrats recevables, le plus récent l’emporte',
  contratQuiVientDEtreAchete([NOUVEAU, RENOUVELLE], { formuleId: 'f1', commercantId: 'c1' })?.total, 48)
egal('et l’ordre de la liste n’y change rien',
  contratQuiVientDEtreAchete([RENOUVELLE, NOUVEAU], { formuleId: 'f1', commercantId: 'c1' })?.total, 48)
egal('un contrat sans date d’achat n’est pas retenu',
  contratQuiVientDEtreAchete([{ commercant: { id: 'c1' }, formule: { id: 'f1' }, total: 99 }],
    { formuleId: 'f1', partiA: clic, commercantId: 'c1' }), null)

// ─── LE COURS COUVERT, FIGÉ À LA SIGNATURE ────────────────────────────────
//
// ⚠️ IL MANQUAIT, et l'inscription à la main le posait pourtant depuis le
// premier jour : deux chemins vers la même table, un seul des deux renseignait
// la colonne. Sans elle, rien ne relie un abonnement au cours de yoga qu'il
// paie, donc la fiche ne peut pas proposer d'y poser une séance.
const CONTRAT_LIGNE = contratDepuisFormule(
  { id: 'f1', commercant_id: 'c1', prestation_id: 'presta-yoga', type: 'carnet',
    seances_carnet: 10, validite_jours: 180, prix: 180, seances_par_semaine: 1 },
  { achatLe: '2026-08-17', client: { email: 'A@B.be', prenom: 'Alex' } },
)
egal('un contrat acheté en ligne sait quel cours il couvre',
  CONTRAT_LIGNE.prestation_id, 'presta-yoga')
egal('une formule sans cours ne fabrique pas de rattachement',
  contratDepuisFormule(
    { id: 'f2', commercant_id: 'c1', type: 'carnet', seances_carnet: 5, validite_jours: 90, prix: 90 },
    { achatLe: '2026-08-17', client: { email: 'a@b.be' } },
  ).prestation_id, null)

// ─── LE BRANCHEMENT, CÔTÉ ÉCRAN ───────────────────────────────────────────
const srcConfAbo = sansCommentSrc(lire('app/commander/rdv/[slug]/ConfirmationAbonnement.js'))
const srcFicheRdv = sansCommentSrc(lire('app/commander/rdv/[slug]/page.js'))
const srcBloc = sansCommentSrc(lire('app/commander/rdv/[slug]/BlocAbonnements.js'))

// ⚠️ UN ÉCRAN, PAS UN ENCADRÉ. C'est la demande exacte d'Alex.
verifier('le retour d’un paiement réussi ouvre un écran',
  /if \(p === 'ok'\) \{ setAboEnAttente\(true\); setEtape\(5\) \}/.test(srcFicheRdv))
verifier('et cet écran est bien monté',
  /etape === 5 && \(\s*<ConfirmationAbonnement/.test(srcFicheRdv))
// ⚠️ « ANNULÉ » RESTE SUR LA FICHE : rien n'a été acheté, il n'y a rien à
// confirmer, et l'écran plein l'éloignerait du bouton pour réessayer.
verifier('un paiement annulé ne quitte pas la fiche',
  !/if \(p === 'annule'\).*setEtape/.test(srcFicheRdv))
// ⚠️ LE CONTRAT SE RELIT EN BASE. Reconstituer l'affichage depuis ce qu'on
// croyait vendre serait faux précisément le jour où le webhook échoue,
// c'est-à-dire le seul jour où ça compte.
verifier('le contrat affiché est relu en base',
  /fetchYopper\('\/api\/yopper\/abonnements'\)/.test(srcFicheRdv))
verifier('et on attend le webhook au lieu d’inventer',
  /contratQuiVientDEtreAchete\(/.test(srcFicheRdv))
// Les deux repères, posés avant de partir chez Stripe.
verifier('la formule choisie est mémorisée avant le paiement',
  /formuleId: choisie\.id/.test(srcBloc))
verifier('et l’instant du clic aussi',
  /partiA: new Date\(\)\.toISOString\(\)/.test(srcBloc))

// ⚠️ LE TEXTE VIENT DES MÊMES FONCTIONS QUE L'EMAIL. Un email qui annonce autre
// chose que l'écran est pire que pas d'email du tout.
verifier('l’écran reprend les textes du module partagé',
  /messageRetourAbonnement, resumeContratAchete, etapesApresAbonnement/.test(srcConfAbo))
// ⚠️ ET IL NE MONTRE AUCUN CHIFFRE TANT QUE LE CONTRAT N'EST PAS LÀ. Un
// « 0 séances » le temps que le webhook réponde serait un mensonge de trois
// secondes sur un achat à trois chiffres.
verifier('aucun chiffre affiché avant que le contrat existe',
  /seances !== null && \(/.test(srcConfAbo))
// ⚠️ RÉORIENTÉE LE 04/10 (Abo-I7) : deux encadrés, avec et sans compte. Chacun
// dit quelque chose, aucun blanc.
verifier('et l’attente se dit au lieu de laisser un blanc',
  /!contrat && !sansCompte && \(/.test(srcConfAbo) && /On enregistre ton abonnement/.test(srcConfAbo)
  && /!contrat && sansCompte && \(/.test(srcConfAbo))

// ─── CE QUE LA ROUTE DOIT RENDRE ──────────────────────────────────────────
//
// ⚠️ LE PIÈGE LE PLUS FRÉQUENT DE CE PROJET : une colonne absente du select
// vaut undefined, ne lève aucune erreur, et la fonctionnalité meurt en silence.
// L'écran a besoin du cours couvert, du nom de la formule et de la date d'achat.
// ⚠️ LES COLONNES SE VÉRIFIENT PLUS HAUT, dans la liste du select des
// abonnements. Elles avaient d'abord été testées ici, par un motif qui
// cherchait le nom de colonne dans N'IMPORTE QUEL select du fichier : la
// requête voisine, celle des formules, porte `prestation_id` elle aussi, et
// retirer la colonne du contrat laissait donc le banc vert. Mesuré en mutation.
verifier('la route rend le cours couvert', /prestationId:/.test(srcRouteAbo))
verifier('le nom de la formule', /libelle: formule\.libelle/.test(srcRouteAbo))
verifier('et la date d’achat', /acheteLe: contrat\.created_at/.test(srcRouteAbo))
// ⚠️ LES CONTRATS VENDUS AVANT LE 16/08 N'ONT PAS DE prestation_id : leur
// formule, elle, l'a toujours eu. Sans ce repli, ils resteraient muets.
verifier('un contrat ancien retrouve son cours via sa formule',
  /contrat\.prestation_id \?\? formule\?\.prestation_id/.test(srcRouteAbo))


// ═══════════════════════════════════════════════════════════════════════════
// POSER UNE SÉANCE SUR SON ABONNEMENT (Alex, 16/08)
//
// « Il est impossible de procéder à une réservation d'une séance de
// l'abonnement côté Yopper. Ça doit être hyper fluide. »
//
// ⚠️ C'ÉTAIT LE MAILLON MANQUANT DU MODULE. La règle de réservation existe
// depuis le premier jour, vérifiée sous toutes les coutures juste au-dessus
// dans ce banc, et PERSONNE NE L'APPELAIT. Une cliente pouvait acheter
// trente-six séances sans avoir aucun moyen d'en poser une seule : elle payait,
// puis devait téléphoner.
// ═══════════════════════════════════════════════════════════════════════════

// L'écran reçoit des ÉTATS (ce que rend /api/yopper/abonnements), la règle de
// réservation attend un CONTRAT. La traduction vit dans le module et pas dans
// l'écran, sinon l'un des deux finit par apprendre une colonne que l'autre
// ignore : c'est ce qui a fait afficher « 2/12 » sur un cours complet le 16/08.
const ETAT_YOGA = {
  id: 'abo-1', statut: 'actif', mode: 'credit',
  debut: '2026-09-01', fin: '2027-06-30',
  total: 36, consommees: 4, solde: 32, seancesParSemaine: 1,
  dates: ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'],
  prestationId: 'presta-yoga', commercant: { id: 'c1' }, formule: { id: 'f1' },
}

const traduit = contratDepuisEtat(ETAT_YOGA)
egal('la période traverse la traduction', [traduit.date_debut, traduit.date_fin], ['2026-09-01', '2027-06-30'])
egal('le nombre de séances aussi', traduit.seances_total, 36)
// ⚠️ LE PLAFOND HEBDOMADAIRE EST LE PLUS FACILE À PERDRE : il change de nom en
// route (seancesParSemaine côté écran, seances_par_semaine en base). Perdu, il
// retombe à 1 et refuse une cliente qui a payé deux séances par semaine.
egal('et le plafond hebdomadaire, qui change de nom en route', traduit.seances_par_semaine, 1)
egal('un plafond de 2 traverse aussi',
  contratDepuisEtat({ ...ETAT_YOGA, seancesParSemaine: 2 }).seances_par_semaine, 2)
egal('sans état, aucun contrat', contratDepuisEtat(null), null)

// La question de l'étape 3, posée sur un état complet.
egal('une date libre sur une semaine libre est acceptée',
  peutPoserSeance(ETAT_YOGA, { date: '2026-10-05' }).ok, true)
// ⚠️ ET LE DÉCOMPTE VIENT DE L'ÉTAT, pas d'un compteur que l'écran tiendrait
// lui-même : c'est la base qui a compté les séances déjà posées.
egal('le solde annoncé est celui du contrat',
  peutPoserSeance(ETAT_YOGA, { date: '2026-10-05' }).solde, 32)
// Le 14 septembre est déjà pris et le plafond vaut 1 : toute la semaine est
// fermée, pas seulement ce jour-là.
egal('une semaine déjà servie est refusée, en le nommant',
  peutPoserSeance(ETAT_YOGA, { date: '2026-09-16' }).raison, 'plafond_semaine')
egal('hors période, on le dit',
  peutPoserSeance(ETAT_YOGA, { date: '2027-08-01' }).raison, 'hors_periode')
egal('un contrat résilié ne pose plus rien',
  peutPoserSeance({ ...ETAT_YOGA, statut: 'resilie' }, { date: '2026-10-05' }).raison, 'resilie')
egal('et un solde épuisé non plus',
  peutPoserSeance({ ...ETAT_YOGA, consommees: 36, dates: [] }, { date: '2026-10-05' }).raison, 'solde_epuise')

// ⚠️ UN ABONNEMENT COUVRE UN COURS, celui de sa formule. Le yoga du lundi ne
// paie pas la séance de pilates : proposer l'inverse promettrait une gratuité
// que le commerçant n'a jamais vendue.
egal('l’abonnement se propose sur SON cours',
  abonnementsPourPrestation([ETAT_YOGA], { commercantId: 'c1', prestationId: 'presta-yoga' }).length, 1)
egal('et sur aucun autre',
  abonnementsPourPrestation([ETAT_YOGA], { commercantId: 'c1', prestationId: 'presta-pilates' }).length, 0)
egal('ni chez un autre commerçant',
  abonnementsPourPrestation([ETAT_YOGA], { commercantId: 'c2', prestationId: 'presta-yoga' }).length, 0)
// Un contrat résilié ne se propose pas : le refus doit venir AVANT que le
// client ait choisi sa date, pas après.
egal('un contrat résilié ne se propose pas',
  abonnementsPourPrestation([{ ...ETAT_YOGA, statut: 'resilie' }], { commercantId: 'c1', prestationId: 'presta-yoga' }).length, 0)
// Sans cours identifié, on ne propose rien plutôt que de proposer au hasard.
egal('sans cours demandé, rien n’est proposé',
  abonnementsPourPrestation([ETAT_YOGA], { commercantId: 'c1' }).length, 0)

// ⚠️ ON DIT POURQUOI, JAMAIS « INDISPONIBLE ». Les cinq refus n'appellent pas
// la même réaction : une semaine prise se règle en changeant de date, un solde
// épuisé en rachetant, une période finie en renouvelant. Un refus muet, lui,
// envoie tout le monde au téléphone.
verifier('le refus hebdomadaire dit quoi faire',
  /autre semaine/.test(expliquerRefusSeance('plafond_semaine', ETAT_YOGA)))
verifier('et il s’accorde quand la formule donne deux séances',
  /2 séances/.test(expliquerRefusSeance('plafond_semaine', ETAT_YOGA, { plafond: 2 })))
// Hors période, on NOMME les bornes : « cette date n'est pas couverte » laisse
// chercher laquelle conviendrait.
//
// ⚠️ AVEC L'ANNÉE, ET C'EST TOUT LE SUJET ICI. Le format court du module dit
// « du 1er septembre au 30 juin », ce qui est parfait sur une preuve d'achat et
// trompeur sur un refus : un abonnement scolaire traverse deux années, et
// quelqu'un qui essaie le 1er septembre SUIVANT relirait la phrase, y verrait
// sa date, et ne comprendrait pas le refus. Trouvé en écrivant ce test.
verifier('hors période, les deux bornes sont nommées',
  /1er septembre 2026/.test(expliquerRefusSeance('hors_periode', ETAT_YOGA))
  && /30 juin 2027/.test(expliquerRefusSeance('hors_periode', ETAT_YOGA)))
// Et le format court reste court partout ailleurs : l'année est une option
// qu'on demande, pas un changement imposé aux quatre autres écrans.
egal('le format court reste sans année par défaut', formatDateCourte('2026-09-01'), '1er septembre')
verifier('sans dates connues, la phrase tient quand même',
  expliquerRefusSeance('hors_periode', { debut: null, fin: null }).length > 10)
verifier('le solde épuisé se dit', /toutes les séances/i.test(expliquerRefusSeance('solde_epuise')))
verifier('la résiliation aussi', /résilié/.test(expliquerRefusSeance('resilie')))
// ⚠️ ET UNE RAISON INCONNUE NE REND PAS UNE PHRASE VIDE : un écran muet devant
// un refus est exactement ce qu'on cherche à éviter.
verifier('une raison inconnue rend tout de même une phrase',
  expliquerRefusSeance('quelque_chose_de_neuf').length > 10)

// ─── LA ROUTE, PARCE QU'ELLE ACCORDE UN DROIT ─────────────────────────────
//
// ⚠️ POURQUOI UNE ROUTE, ALORS QUE LE TUNNEL ORDINAIRE ÉCRIT DIRECTEMENT EN
// BASE : le solde vit dans des tables fermées, l'écran a pu rester ouvert vingt
// minutes, et sans contrôle serveur il suffirait d'envoyer l'identifiant d'un
// contrat pour consommer les séances de quelqu'un d'autre.
const srcReserverAbo = sansCommentSrc(lire('app/api/rdv/reserver-abonnement/route.js'))

verifier('l’identité doit être PROUVÉE, le cookie ne suffit pas',
  /identiteProuvee\(request\)/.test(srcReserverAbo))
verifier('et sans elle, 401', /error: 'non_authentifie' \}, \{ status: 401 \}/.test(srcReserverAbo))
// ⚠️ LE CONTRAT DOIT ÊTRE LE SIEN. Sans cette comparaison, l'identifiant d'un
// contrat suffirait à consommer l'abonnement d'une autre cliente.
verifier('le contrat doit porter l’email de l’appelant',
  /client_email \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== yopper\.email/.test(srcReserverAbo))
// ⚠️ « Pas à toi » et « n'existe pas » rendent la MÊME réponse : les distinguer
// permettrait d'apprendre quels identifiants de contrats existent.
verifier('un contrat étranger et un contrat absent se répondent pareil',
  (srcReserverAbo.match(/error: 'abonnement_introuvable'/g) || []).length === 1)
// ⚠️ LA PRESTATION VIENT DU CONTRAT, JAMAIS DU CORPS DE LA REQUÊTE. Sinon un
// abonnement de yoga paierait la séance de pilates.
verifier('le cours vient du contrat, pas de la requête',
  /let prestationId = contrat\.prestation_id/.test(srcReserverAbo))
verifier('et le corps de la requête ne porte aucune prestation',
  !/prestation_id:\s*(corps|body)/.test(srcReserverAbo))
// Le repli sur la formule couvre les contrats vendus avant le 16/08.
verifier('un contrat ancien retrouve son cours par sa formule',
  /from\('abonnement_formules'\)[\s\S]{0,120}prestation_id/.test(srcReserverAbo))

// ⚠️ LE DROIT SE REVÉRIFIE ICI, ET AVANT D'ÉCRIRE. L'écran a pu rester ouvert
// vingt minutes : le solde qu'il affichait n'engage personne.
verifier('la règle du module est appelée, pas réécrite',
  /peutReserverSurAbonnement\(contrat, \{/.test(srcReserverAbo))
const iVerdictAbo = srcReserverAbo.indexOf('peutReserverSurAbonnement(contrat')
const iRefusAbo = srcReserverAbo.indexOf("error: 'refus'")
// ⚠️ L'ÉCRITURE A CHANGÉ DE NOM LE 30/08 : la route ne bâtit plus son payload,
// elle délègue à `creerReservationRdv`. Ce qui compte n'a pas bougé d'un pouce,
// c'est le MOMENT : rien ne doit être écrit avant que le droit soit vérifié.
const iInsertAbo = srcReserverAbo.indexOf('creerReservationRdv(db, {')
verifier('rien n’est écrit avant que le droit soit vérifié',
  iVerdictAbo > 0 && iInsertAbo > 0 && iVerdictAbo < iInsertAbo,
  `verdict ${iVerdictAbo}, insert ${iInsertAbo}`)
verifier('et le refus sort AVANT l’écriture',
  iRefusAbo > 0 && iRefusAbo < iInsertAbo, `refus ${iRefusAbo}, insert ${iInsertAbo}`)
// ⚠️ ON REND LA RAISON, pas un refus muet : l'écran ne doit pas avoir à deviner
// laquelle des cinq afficher.
verifier('la raison du refus remonte à l’écran',
  /raison: verdict\.raison/.test(srcReserverAbo))

// ⚠️ LE DÉCOMPTE SE COMPTE, il ne se décrémente pas : un compteur stocké dérive
// au premier accident et plus personne ne sait quel chiffre est bon.
verifier('les séances consommées sont comptées en base',
  /seancesConsommees\(posees \|\| \[\]/.test(srcReserverAbo))
verifier('et les dates déjà prises aussi, pour le plafond',
  /datesConsommees\(posees \|\| \[\]/.test(srcReserverAbo))

// Ce que la séance porte, et c'est tout le sujet du module.
//
// ⚠️ ON LIT LE PAYLOAD, PAS LE FICHIER. Ces deux champs figurent aussi dans la
// RÉPONSE rendue à l'écran : chercher leur nom n'importe où laissait le banc
// vert alors que la ligne écrite en base avait disparu. Mesuré en mutation, et
// c'est la même leçon que le select voisin de ce matin.
const payloadSeance = (() => {
  const i = srcReserverAbo.indexOf('champs: {')
  return i < 0 ? '' : srcReserverAbo.slice(i, srcReserverAbo.indexOf('\n    }', i))
})()
verifier('la séance écrite en base porte le contrat qui la paie',
  /abonnement_id: contrat\.id/.test(payloadSeance), payloadSeance ? '' : 'payload introuvable')
// ⚠️ ZÉRO PARCE QUE C'EST DÉJÀ PAYÉ. Le prix vit sur le CONTRAT : compter le
// tarif plein ici multiplierait le chiffre d'affaires du commerçant par 36.
verifier('et un prix nul, le prix vivant sur le contrat', /prix_estime: 0/.test(payloadSeance))
verifier('aucun acompte n’est réclamé', /acompte_montant: null/.test(payloadSeance))
// ⚠️ LA PLACE, LA CAPACITÉ ET LE LIEU ONT QUITTÉ CETTE ROUTE LE 30/08, et c'est
// le but : ils vivaient en quatre copies, ils vivent dans un module. Ce qui se
// vérifie ici, c'est la DÉLÉGATION ; le contenu, lui, est mesuré en EXÉCUTANT
// `creerReservationRdv` dans `scripts/verif-tunnel-rdv.mjs`.
verifier('la place, la capacité et le lieu viennent du module',
  /creerReservationRdv\(db, \{/.test(srcReserverAbo))
verifier('et la route ne les recopie plus elle-même',
  !/capacite_creneau\s*:/.test(srcReserverAbo)
  && !/place_no\s*:/.test(srcReserverAbo)
  && !/champsLieuPour\(/.test(srcReserverAbo))
// Le double-booking reste rattrapé par la base, atomiquement, et son code
// remonte jusqu'à l'écran pour qu'il dise « la dernière place vient d'être
// prise » plutôt qu'une erreur technique.
verifier('le double-booking est rattrapé par la base',
  /res\.code === 'place_prise'/.test(srcReserverAbo))

// ─── L'ÉCRAN ──────────────────────────────────────────────────────────────
const srcTunnelAbo = sansCommentSrc(lire('app/commander/rdv/[slug]/page.js'))

// ⚠️ LE CHOIX EST À L'ÉTAPE 3 ET PAS AU CHOIX DU COURS : il a besoin de LA
// DATE, dont dépendent la période, le plafond de la semaine et le solde.
// ⚠️ Ancré sur la CONDITION, pas sur la forme exacte de l'expression : la
// première écriture exigeait `(aboDuCours && dateChoisie)`, et passer d'un
// contrat à une LISTE de contrats l'a fait rougir sur du code juste. Ce qui
// compte est qu'aucun verdict ne se calcule sans date.
verifier('le verdict n’est calculé qu’une fois la date connue',
  /const triAbos = dateChoisie/.test(srcTunnelAbo))
verifier('la fiche propose l’abonnement du cours choisi',
  /abonnementsPourPrestation\(mesAbos/.test(srcTunnelAbo))
// ⚠️ COCHÉ PAR DÉFAUT : il a payé son abonnement, lui faire payer deux fois la
// même séance parce qu'il n'a pas vu une case serait indéfendable.
verifier('la case est cochée par défaut',
  /setPayerAvecAbo\] = useState\(true\)/.test(srcTunnelAbo))
verifier('la séance part par la route serveur, pas par un insert direct',
  /fetchYopper\('\/api\/rdv\/reserver-abonnement'/.test(srcTunnelAbo))
// ⚠️ LE PRIX SUIT LE MOYEN DE PAIEMENT. Annoncer le tarif plein sur une séance
// déjà payée est un mensonge, et « 0 € » en est un autre : ce n'est pas
// gratuit, c'est compris.
//
// ⚠️ AUX DEUX ENDROITS OÙ LE PRIX S'ÉCRIT : le rendez-vous verrouillé en tête
// d'étape 3, ET la ligne du récapitulatif juste avant le bouton. Le premier
// test n'en exigeait qu'un, et casser l'autre ne faisait rougir personne.
egal('le prix dit « compris » aux DEUX endroits de l’étape 3',
  (srcTunnelAbo.match(/seanceSurAbo \? 'Compris dans ton abonnement'/g) || []).length, 2)
verifier('l’écran de confirmation le dit aussi, via le module',
  /libellePrixSeance\(rdvCree\)/.test(srcTunnelAbo))
// ⚠️ ET AUCUN ACOMPTE N'EST RÉCLAMÉ : sans ce garde-fou le bouton annonçait
// « Payer 12,50 € et confirmer » devant une séance qui ne coûte rien.
verifier('aucun acompte n’est réclamé sur une séance d’abonnement',
  /const acompteEnLigne = !seanceSurAbo/.test(srcTunnelAbo))
verifier('et la ligne d’acompte du récapitulatif disparaît',
  /acompte_pourcent > 0 && !seanceSurAbo/.test(srcTunnelAbo))
// ⚠️ LIMITE ASSUMÉE, ET DITE. Une séance d'abonnement ne passe par aucun
// paiement, les produits en exigent un : poser la séance aurait PERDU LE PANIER
// EN SILENCE, ce qui est la pire des sorties. Une friction nommée vaut mieux.
//
// ⚠️ ET ON VÉRIFIE CE QU'IL CALCULE, pas seulement qu'il existe : le premier
// test se contentait du nom de la variable, donc la mettre à `false` ne faisait
// rougir personne, et le panier repartait se perdre en silence.
verifier('un panier de produits suspend le choix au lieu de le perdre',
  /const aboBloqueParPanier = !!\(lignesPanier\.length > 0 && produitsAchetables\)/.test(srcTunnelAbo)
  && /payerAvecAbo && !aboBloqueParPanier/.test(srcTunnelAbo))
// Le solde a bougé : sans relecture, la fiche continuerait d'annoncer le
// nombre de séances d'avant la réservation.
verifier('le solde est relu après la réservation',
  /setMesAbos\(a\.abonnements/.test(srcTunnelAbo))


// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ PLUSIEURS ABONNEMENTS SUR LE MÊME COURS (Alex, 17/08)
//
// Il a souscrit un DEUXIÈME abonnement, les deux s'affichaient partout, et il
// ne pouvait toujours pas poser deux séances la même semaine : l'écran ne
// consultait que le PREMIER contrat, dont le plafond hebdomadaire disait non,
// et n'ouvrait jamais le second.
//
// ⚠️ CE CAS ÉTAIT ÉCRIT DANS LE MODÈLE DEPUIS LE PREMIER JOUR : chez Emily,
// « deux séances par semaine, c'est un SECOND ABONNEMENT avec réduction ». Le
// plafond appartient au CONTRAT, pas au client. C'est l'écran qui n'avait pas
// suivi, pas la règle.
// ═══════════════════════════════════════════════════════════════════════════

const ABO_A = {
  id: 'a', statut: 'actif', mode: 'credit', debut: '2026-09-01', fin: '2027-06-30',
  total: 45, consommees: 1, solde: 44, seancesParSemaine: 1, dates: ['2026-10-05'],
  prestationId: 'p-yoga', commercant: { id: 'c1' }, formule: { id: 'f1', libelle: 'Abonnement annuel Yoga' },
}
const ABO_B = {
  ...ABO_A, id: 'b', consommees: 0, solde: 45, dates: [],
  formule: { id: 'f1', libelle: 'Abonnement annuel Yoga' },
}

// Le 5 octobre est déjà pris sur A, dont le plafond vaut 1 : A refuse cette
// semaine-là. B, lui, n'a rien posé.
const triLundi = trierAbonnementsPourSeance([ABO_A, ABO_B], { date: '2026-10-07' })
egal('un second contrat rend la semaine à nouveau réservable',
  triLundi.utilisables.map(u => u.abonnement.id), ['b'])
egal('et le premier est refusé pour la bonne raison',
  triLundi.refuses.map(r => r.verdict.raison), ['plafond_semaine'])

// Une autre semaine : les deux passent, et il doit pouvoir choisir.
const triLibre = trierAbonnementsPourSeance([ABO_A, ABO_B], { date: '2026-10-12' })
egal('sur une semaine libre, les deux sont utilisables', triLibre.utilisables.length, 2)

// ⚠️ ON PROPOSE CELUI QUI PÉRIME LE PLUS TÔT. Entamer une année qui court
// jusqu'en juillet pendant qu'un carnet expire en mars, c'est laisser mourir
// des séances payées.
const CARNET_COURT = { ...ABO_B, id: 'court', fin: '2027-03-01' }
egal('le contrat qui périme le plus tôt est proposé en premier',
  trierAbonnementsPourSeance([ABO_B, CARNET_COURT], { date: '2026-10-12' })
    .utilisables[0].abonnement.id, 'court')
egal('et l’ordre de la liste n’y change rien',
  trierAbonnementsPourSeance([CARNET_COURT, ABO_B], { date: '2026-10-12' })
    .utilisables[0].abonnement.id, 'court')

// ⚠️ QUAND AUCUN NE PASSE, ON MONTRE LE REFUS LE PLUS ACTIONNABLE. « Tu as déjà
// ta séance cette semaine » se règle en changeant de date ; « cet abonnement est
// résilié » n'appelle aucun geste. Afficher le second devant quelqu'un qui
// pouvait agir, c'est le renvoyer au téléphone pour rien.
const RESILIE = { ...ABO_A, id: 'r', statut: 'resilie' }
egal('le refus actionnable passe devant le refus définitif',
  trierAbonnementsPourSeance([RESILIE, ABO_A], { date: '2026-10-07' })
    .refuses[0].verdict.raison, 'plafond_semaine')

egal('sans contrat, rien des deux côtés',
  trierAbonnementsPourSeance([], { date: '2026-10-12' }),
  { utilisables: [], refuses: [] })

// ⚠️ LE LIBELLÉ DOIT LES DISTINGUER. Deux abonnements annuels portent le MÊME
// nom de formule : le nom seul ne dit pas lequel on désigne. Le solde et la
// date de fin, eux, les séparent toujours.
verifier('le choix affiche le solde', /44 séances/.test(libelleChoixAbonnement(ABO_A)))
verifier('et la date de fin', /30 juin/.test(libelleChoixAbonnement(ABO_A)))
verifier('deux contrats de même formule ne portent pas le même libellé',
  libelleChoixAbonnement(ABO_A) !== libelleChoixAbonnement(ABO_B))
egal('sans contrat, aucun libellé', libelleChoixAbonnement(null), '')

// ─── L'ÉCRAN ──────────────────────────────────────────────────────────────
const srcMultiAbo = sansCommentSrc(lire('app/commander/rdv/[slug]/page.js'))
verifier('la fiche consulte TOUS les contrats, pas le premier',
  /const abosDuCours = abonnementsPourPrestation/.test(srcMultiAbo)
  && !/abonnementsPourPrestation\([^)]*\)\[0\]/.test(srcMultiAbo))
verifier('elle les trie par la règle du module',
  /trierAbonnementsPourSeance\(abosDuCours/.test(srcMultiAbo))
verifier('et propose un choix quand plusieurs passent',
  /triAbos\.utilisables\.length > 1 && \(/.test(srcMultiAbo))
// ⚠️ Le contrat envoyé au serveur est CELUI QU'IL A CHOISI. Poser la séance sur
// un autre que celui affiché serait le pire des silences : il verrait son solde
// baisser au mauvais endroit.
verifier('le contrat retenu suit son choix explicite',
  /triAbos\.utilisables\.find\(u => u\.abonnement\.id === aboChoisiId\)/.test(srcMultiAbo))
// ⚠️ LA PASTILLE DE L'ÉTAPE 1 CUMULE LES SOLDES : n'afficher que le premier
// annonçait 44 séances à quelqu'un qui en a 89.
verifier('la pastille du cours cumule les soldes',
  /soldes\.reduce\(\(s, n\) => s \+ n, 0\)/.test(srcMultiAbo))

// Le titre de l'onglet nomme les trois choses qu'on y trouve : un abonnement de
// 400 € rangé sous un titre qui ne le mentionne pas, c'est demander à quelqu'un
// de deviner où est son argent.
verifier('l’onglet nomme aussi les abonnements',
  /Commandes, rendez-vous et abonnements/.test(sansCommentSrc(lire('app/commander/page.js'))))


// ⚠️ LES CONTRATS ÉCARTÉS SE DISENT AUSSI (Alex, 17/08).
//
// L'écran ne montrait que le contrat RETENU et se taisait sur les autres. Alex,
// qui savait avoir deux abonnements, ne pouvait qu'en conclure que le second
// était cassé. Or il fonctionnait : son plafond d'une séance par semaine était
// simplement atteint, il avait servi la veille.
//
// ⚠️ CE REFUS N'ÉTAIT PAS MUET, IL ÉTAIT INVISIBLE, et c'est pire : un refus
// muet laisse au moins voir qu'il y a un refus. Ici il n'y avait rien à lire,
// donc rien à comprendre, et la seule explication possible était la panne.
verifier('les contrats écartés sont nommés avec leur raison',
  /triAbos\.refuses\.map\(\(\{ abonnement, verdict \}\)/.test(srcMultiAbo))
// ⚠️ ON COMPTE, ON NE CHERCHE PAS : ce libellé sert AUSSI dans le sélecteur
// juste au-dessus, et chercher son nom laissait ce second usage satisfaire le
// test. Septième fois cette semaine que l'homonyme voisin rend une garde muette.
egal('le libellé nomme le contrat AUX DEUX endroits, sélecteur et refus',
  (srcMultiAbo.match(/libelleChoixAbonnement\(abonnement\)/g) || []).length, 2)

// ═══════════════════════════════════════════════════════════════════════════
// POSER UNE SÉANCE DEPUIS L'ABONNEMENT, ET LA RÉPÉTER (18/08)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CE GESTE N'EXISTAIT PAS, ET SON ABSENCE ÉTAIT UN TROU : un abonnement
// obligeait la CLIENTE à réserver depuis l'application. Une abonnée sans
// téléphone intelligent ne pouvait pas être inscrite du tout. Depuis que le jour
// fixe a disparu, plus aucune séance ne se pose toute seule : sans ce geste, un
// contrat de 38 séances reste à 38 au compteur et à zéro dans l'agenda.
//
// ⚠️ ET LE BOUTON D'ALEX EST CE QUI REMPLACE LE JOUR FIXE, pas un confort :
// « ajouter un bouton pour copier un rdv d'une semaine sur d'autres semaines,
// pour faciliter les choses ».
const { semainesSuivantes, expliquerRefusCommercant } = await import('../lib/abonnements.js')

// Le cas simple : huit semaines à partir d'un lundi.
const huit = semainesSuivantes('2026-09-07', { nombre: 8 })
egal('huit semaines donnent huit dates', huit.length, 8)
egal('la première est la semaine SUIVANTE, pas le jour même', huit[0], '2026-09-14')
egal('et elles sont espacées de sept jours', huit[7], '2026-11-02')

// ⚠️ TROIS BORNES, ET CHACUNE EST MESURÉE SÉPARÉMENT. Ensemble elles passeraient
// pour une seule règle, et retirer l'une des trois ne ferait rien rougir.
egal('la fin du contrat arrête la série',
  semainesSuivantes('2026-09-07', { nombre: 8, jusqua: '2026-10-05' }).length, 4)
egal('le solde restant l’arrête aussi',
  semainesSuivantes('2026-09-07', { nombre: 8, soldeRestant: 3 }).length, 3)
// ⚠️ ON TESTE L'ABSENCE : un solde INCONNU ne vaut pas zéro, il ne borne rien.
// Le piège du zéro, cinquième fois sur ce projet.
egal('un solde inconnu ne borne rien',
  semainesSuivantes('2026-09-07', { nombre: 8, soldeRestant: null }).length, 8)
egal('un solde à zéro, lui, arrête tout',
  semainesSuivantes('2026-09-07', { nombre: 8, soldeRestant: 0 }).length, 0)

// ⚠️ UNE SEMAINE DÉJÀ PRISE EST SAUTÉE, PAS REFUSÉE. La commerçante a demandé
// « les quatre semaines suivantes », pas « quatre lignes quoi qu'il arrive » :
// s'arrêter à la première collision lui ferait poser une seule séance sur quatre.
const avecTrou = semainesSuivantes('2026-09-07', {
  nombre: 4, datesDejaPrises: ['2026-09-21'],
})
egal('une semaine déjà prise est sautée', avecTrou.length, 3)
verifier('et c’est bien celle-là qui manque', !avecTrou.includes('2026-09-21'), avecTrou.join(' '))
// ⚠️ MESURÉ : le saut se fait sur la SEMAINE, pas sur la date. Une séance posée
// le mercredi bloque le lundi de la même semaine, sinon le plafond hebdomadaire
// refuserait une à une les séances qu'on vient de poser.
egal('un autre jour de la même semaine bloque aussi',
  semainesSuivantes('2026-09-07', { nombre: 2, datesDejaPrises: ['2026-09-16'] }).length, 1)

// Les saisies impossibles ne fabriquent rien plutôt que d'inventer.
egal('sans date de départ, aucune série', semainesSuivantes(null, { nombre: 4 }).length, 0)
egal('un nombre nul ne pose rien', semainesSuivantes('2026-09-07', { nombre: 0 }).length, 0)
egal('un nombre négatif non plus', semainesSuivantes('2026-09-07', { nombre: -3 }).length, 0)

// ─── 🔴 LA SÉRIE SAUTE ET NOMME LES CONGÉS ET LES FERMETURES (03/10) ───────
//
// L'audit avant Centre Respire, sur ses vraies dates : « + 4 » depuis le 5
// octobre posait le 26 en plein congé d'automne, et « Tout le contrat » posait
// sept séances sur des dates que la FORMULE écartait. Le contrat ne connaît pas
// ses congés ; seule la formule les porte, et la série ne les lisait pas.
{
  const { serieDeSeances, raisonSemaineEcartee } = await import('../lib/abonnements.js')
  const AUTOMNE = [{ debut: '2026-10-26', fin: '2026-10-30' }]
  const plus4 = serieDeSeances('2026-10-05', { nombre: 4, periodesExclues: AUTOMNE })
  egal('🔴 « + 4 » depuis le 5 octobre saute le congé d’automne', plus4.dates, ['2026-10-12', '2026-10-19', '2026-11-02'])
  egal('🔴 et le nomme', plus4.ecartees, [{ date: '2026-10-26', raison: 'conge' }])
  const fermee = serieDeSeances('2026-10-05', { nombre: 4, estFermee: (d) => d === '2026-10-19' })
  egal('🔴 un jour où l’agenda est fermé est sauté, et nommé',
    [fermee.dates.includes('2026-10-19'), fermee.ecartees], [false, [{ date: '2026-10-19', raison: 'fermeture' }]])
  const prise = serieDeSeances('2026-10-05', { nombre: 2, datesDejaPrises: ['2026-10-14'] })
  egal('une semaine déjà prise est nommée aussi', prise.ecartees, [{ date: '2026-10-12', raison: 'deja_prise' }])
  // ⚠️ UN CONGÉ NE CONSOMME PAS LE SOLDE : trois séances restantes donnent trois
  // séances, posées autour du congé.
  egal('⚠️ un congé ne consomme pas le solde',
    serieDeSeances('2026-10-05', { nombre: 8, soldeRestant: 3, periodesExclues: AUTOMNE }).dates,
    ['2026-10-12', '2026-10-19', '2026-11-02'])
  egal('les seules dates restent celles de la série',
    semainesSuivantes('2026-10-05', { nombre: 4, periodesExclues: AUTOMNE }), plus4.dates)
  verifier('chaque raison se dit en mots',
    ['deja_prise', 'conge', 'fermeture', 'complet', 'creneau'].every(r => raisonSemaineEcartee(r) !== 'non posée'))
}

// ─── 🔴 LA VENTE EN COURS DE PÉRIODE (décision d'Alex, 03/10) ─────────────
//
// Une formule de période se vendait au compte PLEIN après son début, et même
// après sa fin. Compté à la main : du lundi 7 septembre au dimanche 29 novembre,
// douze semaines, 120 €, une séance par semaine.
{
  const { offreAuJour, phraseOffreEnCours, resumeFormulePublique: resume, formuleVendableEnLigne: vendable } = await import('../lib/abonnements.js')
  const F = { type: 'periode', date_debut: '2026-09-07', date_fin: '2026-11-29', prix: 120, seances_par_semaine: 1,
    vente_en_ligne: true, actif: true, deleted_at: null, periodes_exclues: [] }

  const avant = offreAuJour(F, { aujourdhui: '2026-09-01' })
  egal('avant le début, tout au prix plein', [avant.enCours, avant.seances, avant.prix], [false, 12, 120])

  // Mercredi 7 octobre : la semaine du 5 compte encore, il en reste huit.
  const octobre = offreAuJour(F, { aujourdhui: '2026-10-07' })
  egal('🔴 achetée le 7 octobre, elle accorde les huit semaines restantes', [octobre.enCours, octobre.semainesRestantes, octobre.seances], [true, 8, 8])
  egal('🔴 et coûte huit douzièmes, au prorata par défaut', [octobre.mode, octobre.prix], ['prorata', 80])
  egal('🔴 au prix fixe, le prix ne bouge pas, les séances si',
    (o => [o.prix, o.seances])(offreAuJour({ ...F, prix_en_cours: 'fixe' }, { aujourdhui: '2026-10-07' })), [120, 8])
  egal('⚠️ un congé ne se paie pas : sept semaines sur onze, au centime',
    (o => [o.semainesRestantes, o.semainesTotal, o.prix])(offreAuJour({ ...F, periodes_exclues: [{ debut: '2026-10-26', fin: '2026-11-01' }] }, { aujourdhui: '2026-10-07' })),
    [7, 11, 76.36])
  egal('⚠️ deux séances par semaine, le double de séances',
    offreAuJour({ ...F, seances_par_semaine: 2 }, { aujourdhui: '2026-10-07' }).seances, 16)
  egal('le dernier jour, la dernière semaine se vend encore', (o => [o.vendable, o.seances, o.prix])(offreAuJour(F, { aujourdhui: '2026-11-29' })), [true, 1, 10])
  verifier('🔴 le lendemain de la fin, plus rien ne se vend', offreAuJour(F, { aujourdhui: '2026-11-30' }).vendable === false
    && vendable(F, { aujourdhui: '2026-11-30' }) === false && vendable(F, { aujourdhui: '2026-11-29' }) === true)
  verifier('⚠️ jamais sous 0,50 € : Stripe refuse, et trois centimes n’ont de sens pour personne',
    offreAuJour({ ...F, prix: 3 }, { aujourdhui: '2026-11-29' }).vendable === false)
  egal('un carnet ne s’entame pas', (o => [o.enCours, o.prix, o.seances])(offreAuJour({ type: 'carnet', seances_carnet: 10, validite_jours: 180, prix: 90 }, { aujourdhui: '2026-10-07' })), [false, 90, 10])

  // ── Ce que la cliente lit AVANT de payer ──
  const r = resume(F, { achatLe: '2026-10-07' })
  egal('🔴 la vitrine annonce le prix et les séances du jour', [r.prix, r.seancesLibelle], [80, '8 séances'])
  verifier('🔴 et dit pourquoi', /il reste 8 semaines, soit 8 séances/.test(r.enCours) && /au prorata \(8 semaines sur 12\)/.test(r.enCours), r.enCours)
  verifier('⚠️ sa période part du jour de l’achat', /^Du 7 octobre au 29 novembre$/.test(r.validite), r.validite)
  verifier('⚠️ au prix fixe, elle ne parle pas de prorata',
    !/prorata/.test(phraseOffreEnCours(offreAuJour({ ...F, prix_en_cours: 'fixe' }, { aujourdhui: '2026-10-07' }))))
  verifier('avant le début, rien à expliquer', resume(F, { achatLe: '2026-09-01' }).enCours === null)
  const { jourExempleEnCours } = await import('../lib/abonnements.js')
  egal('l’exemple de la commerçante se fait aujourd’hui si sa période est en cours',
    jourExempleEnCours({ dateDebut: '2026-09-07', dateFin: '2026-11-29', aujourdhui: '2026-10-07' }), '2026-10-07')
  egal('sinon au milieu de la période', jourExempleEnCours({ dateDebut: '2026-09-07', dateFin: '2026-11-29', aujourdhui: '2026-12-15' }), '2026-10-18')

  // ── La route de paiement et le webhook appliquent la MÊME offre ──
  const ROUTE = sansProse(readFileSync(new URL('../app/api/stripe/checkout/create-abonnement/route.js', import.meta.url), 'utf8'))
  verifier('🔴 la route refuse une formule qui ne se vend plus ce jour-là',
    /if \(!formuleVendableEnLigne\(formule, \{ aujourdhui \}\)\)/.test(ROUTE))
  verifier('🔴 elle encaisse le prix du jour', /const prixCents = Math\.round\(Number\(offre\.prix\) \* 100\)/.test(ROUTE))
  verifier('🔴 et transmet séances, prix et début du jour au webhook',
    /seances_total: String\(offre\.seances\),/.test(ROUTE) && /prix: String\(offre\.prix\),/.test(ROUTE) && /date_debut: String\(offre\.debut \|\| ''\),/.test(ROUTE))
  const WH = sansProse(readFileSync(new URL('../app/api/stripe/webhook/route.js', import.meta.url), 'utf8'))
  verifier('🔴 le contrat garde le prix payé, pas celui du catalogue',
    /if \(Number\.isFinite\(prixPaye\) && prixPaye > 0\) contrat\.prix = prixPaye/.test(WH))
  verifier('🔴 et commence le jour de l’achat quand la période était entamée',
    /contrat\.date_debut = meta\.date_debut/.test(WH))
  verifier('⚠️ la preuve d’achat dit ce qui a été payé', /prix_paye: contrat\.prix/.test(WH))

  // ── La fiche annonce ce que la route encaissera ──
  const FICHE = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('🔴 la fiche lit le choix de la commerçante',
    /\.from\('abonnement_formules'\)\s*\.select\('[^']*\bprix_en_cours\b[^']*'\)/.test(FICHE))
  verifier('🔴 et n’affiche plus une période finie',
    /\.filter\(f => formuleVendableEnLigne\(f, \{ aujourdhui: auj \}\)\)/.test(FICHE))
  const BLOC = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/BlocAbonnements.js', import.meta.url), 'utf8'))
  verifier('🔴 la vitrine de la fiche annonce l’offre du jour',
    (BLOC.match(/resumeFormulePublique\((f|choisie), \{ achatLe: jourBruxelles\(\) \}\)/g) || []).length === 2
    && !/resumeFormulePublique\((f|choisie)\)/.test(BLOC))
  verifier('⚠️ au centime, avec la raison d’une période entamée', /\{euros\(r\.prix\)\}/.test(BLOC) && /\{r\.enCours\}/.test(BLOC))

  // ── La commerçante choisit, et le choix s'écrit ──
  const DASH = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  verifier('🔴 la commerçante choisit prorata ou prix fixe',
    /name="prix_en_cours"/.test(DASH)
    && /prix_en_cours: form\.type === 'periode' && form\.prix_en_cours === PRIX_EN_COURS_FIXE \? PRIX_EN_COURS_FIXE : PRIX_EN_COURS_PRORATA,/.test(DASH))
  verifier('⚠️ et retrouve son choix en rouvrant la formule',
    /prix_en_cours: f\.prix_en_cours === PRIX_EN_COURS_FIXE \? PRIX_EN_COURS_FIXE : PRIX_EN_COURS_PRORATA,/.test(DASH))
  // 🔴 QUI PEUT PRENDRE CETTE FORMULE (Alex, 03/10) : une question, trois
  // réponses, à la place de deux interrupteurs qui pouvaient se contredire.
  verifier('🔴 une seule question, trois réponses',
    /name="disponibilite_formule"/.test(DASH)
    && ['En vente sur ta fiche', 'Seulement par toi', 'Plus proposée'].every(t => DASH.includes(`'${t}'`)))
  verifier('🔴 chaque réponse écrit les deux colonnes ensemble',
    /const choisir = \(v\) => setForm\(\{ \.\.\.form, actif: v !== 'retiree', vente_en_ligne: v === 'en_ligne' \}\)/.test(DASH)
    && /const dispo = !form\.actif \? 'retiree' : form\.vente_en_ligne \? 'en_ligne' : 'a_la_main'/.test(DASH))
  verifier('🔴 une formule plus proposée ne s’enregistre jamais « en vente »',
    /vente_en_ligne: !!form\.actif && !!form\.vente_en_ligne,/.test(DASH))
  verifier('⚠️ la carte de la liste dit le même état',
    /const etiquette = f\.actif === false\s*\? \{ texte: 'Plus proposée'/.test(DASH)
    && /offreAuJour\(f, \{ aujourdhui: jourBruxelles\(\) \}\)\?\.vendable === false\s*\? \{ texte: 'Période terminée'/.test(DASH))
  verifier('⚠️ l’exemple se calcule sur ses chiffres, avec la règle de la vente',
    /offreAuJour\(\{ \.\.\.brouillon, prix_en_cours: PRIX_EN_COURS_PRORATA \}, \{ aujourdhui: jour \}\)/.test(DASH))

  // ── La colonne, posée par une migration qui se contrôle ──
  const SQL = readFileSync(new URL('../migrations/MIGRATION_ABONNEMENT_EN_COURS.sql', import.meta.url), 'utf8')
  verifier('🔴 la migration pose la colonne, au prorata par défaut',
    /ADD COLUMN IF NOT EXISTS prix_en_cours text NOT NULL DEFAULT 'prorata'/.test(SQL)
    && /CHECK \(prix_en_cours IN \('prorata', 'fixe'\)\)/.test(SQL))
  verifier('⚠️ et redit les droits de la colonne',
    /GRANT SELECT \(prix_en_cours\) ON public\.abonnement_formules TO anon, authenticated;/.test(SQL)
    && /GRANT INSERT \(prix_en_cours\), UPDATE \(prix_en_cours\) ON public\.abonnement_formules TO authenticated;/.test(SQL))
}

// ─── LE REFUS, DIT AU COMMERÇANT ──────────────────────────────────────────
//
// ⚠️ DEUX PUBLICS, DEUX VOIX, UNE SEULE RÈGLE. `expliquerRefusSeance` tutoie la
// cliente : servi tel quel à Emily, il lui parle d'elle alors qu'il parle de
// Sophie. C'est le même défaut que le vocabulaire de caisse servi au client.
const refusPlafond = expliquerRefusCommercant('plafond_semaine',
  { seances_par_semaine: 1 }, { prenom: 'Sophie' })
verifier('le refus nomme la personne', /Sophie/.test(refusPlafond), refusPlafond)
verifier('et il ne tutoie pas la commerçante', !/\btu as déjà\b/i.test(refusPlafond), refusPlafond)
// ⚠️ ET IL OFFRE LA SORTIE, sans quoi la commerçante est bloquée par son propre
// plafond et rappelle Alex.
verifier('il propose de poser la séance hors abonnement',
  /hors abonnement/.test(refusPlafond), refusPlafond)
verifier('un solde épuisé propose aussi une suite',
  /hors abonnement/.test(expliquerRefusCommercant('solde_epuise', null, { prenom: 'Sophie' })))
// Sans prénom, la phrase reste une phrase française.
verifier('sans prénom, la phrase tient debout',
  /^Cette personne a déjà sa séance/.test(expliquerRefusCommercant('plafond_semaine', null, {})))
// ⚠️ AUCUN REFUS MUET : une raison inconnue dit quand même quelque chose.
verifier('une raison inconnue ne rend jamais une phrase vide',
  expliquerRefusCommercant('nimporte_quoi', null, {}).length > 10)

// ─── ET L'ÉCRAN APPELLE BIEN LES RÈGLES ───────────────────────────────────
const srcModale = readFileSync(new URL('../app/dashboard/ModalNouveauRdv.js', import.meta.url), 'utf8')
verifier('la modale interroge la règle de l’abonnement',
  /peutReserverSurAbonnement\(/.test(srcModale))
verifier('elle lie la séance au contrat',
  /abonnement_id: surAbonnement \? aboChoisi\.contrat\.id : null/.test(srcModale))
// ⚠️ LE PRIX NE SE RECOPIE PAS SUR UNE SÉANCE D'ABONNEMENT : trente-six séances
// à 15 € multiplieraient le chiffre d'affaires par trente-six.
verifier('une séance d’abonnement part à zéro',
  /prix_estime: surAbonnement \? 0 : prixEstime/.test(srcModale))
verifier('et elle ne réclame aucun acompte',
  /acompte_montant: surAbonnement \? null : acompteMontant/.test(srcModale))
// ⚠️ LA PLACE SE CALCULE POUR CHAQUE DATE. Recopier celle du premier jour ferait
// rejeter la moitié de la série par l'index unique, sur un cours à plusieurs.
verifier('chaque date de la série a SA place',
  /place_no: placeParDate\[d\]/.test(srcModale))
// ⚠️ ET SON LIEU : le module LIEUX autorise un endroit différent d'une semaine à
// l'autre. Recopier le lieu du premier jour enverrait l'abonnée au mauvais
// endroit six semaines plus tard.
egal('et le lieu est résolu date par date',
  (srcModale.match(/champsLieuPour\(supabase, commercant/g) || []).length, 2)
verifier('la sortie « hors abonnement » existe et est écrite',
  /hors abonnement/.test(srcModale))
// 🔴 « RÉPÉTER » LIT LES CONGÉS DE LA FORMULE ET LES FERMETURES (03/10), juge
// chaque semaine au clic, liste les dates avant, et dit ce qui n'a pas été posé.
{
  const modale = sansProse(srcModale)
  verifier('🔴 la modale charge les congés de la formule',
    /formule:abonnement_formules\(libelle, periodes_exclues\)/.test(modale))
  verifier('🔴 la série saute les congés et les fermetures',
    /periodesExclues: aboChoisi\.contrat\.formule\?\.periodes_exclues \|\| \[\],/.test(modale)
    && /estFermee: \(d\) => !!fermetureQuiBloque\(fermeturesAgenda \|\| \[\], \{ dateStr: d,/.test(modale))
  verifier('🔴 chaque semaine répétée est jugée au clic, sur l’agenda relu',
    /repeteesJugees = datesRepetees\.filter\(d => \{\s*const v = creneauAcceptable\(\{/.test(modale)
    && /if \(!v\.ok\) nonPosees\.push\(/.test(modale) && /return v\.ok/.test(modale))
  verifier('⚠️ les dates se lisent avant d’enregistrer',
    /\[dateChoisie, \.\.\.datesRepetees\]\.map\(d => formatDateCourte\(d\)\)\.join\(' · '\)/.test(modale))
  verifier('🔴 la fenêtre reste ouverte pour dire ce qui n’a pas été posé',
    /if \(nonPosees\.length > 0\) \{[\s\S]{0,160}setBilanSerie\(/.test(modale))
}

// ═══════════════════════════════════════════════════════════════════════════
// L'ARGENT DU COMPTOIR ET LE SOLDE, DEUX TROUS TROUVÉS PAR ALEX LE 19/08
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ LE CUL-DE-SAC : une inscription enregistrée sans paiement affichait
// « Paiement en attente », et la carte ne proposait que « Résilier ». La
// commerçante encaissait les 400 € le lendemain et n'avait AUCUN geste pour le
// dire. Résilier le contrat d'une cliente qui vient de payer était la seule
// porte ouverte. C'est exactement « quand quelqu'un se trompe de porte, on
// OUVRE LA BONNE », sauf qu'ici il n'y avait pas de bonne porte.
//
// ⚠️ LE SECOND : cet écran affichait `seances_total` et rien d'autre. Une
// abonnée ayant consommé douze de ses trente-huit séances lisait « 38 séances »
// à vie. Alex : « il ne décompte pas les séances ». Côté Yopper le solde était
// juste depuis le début : les deux chemins ne se croisaient jamais à l'écran,
// exactement comme les deux comptes du 18/08.
{
  const { MOYENS_ENCAISSEMENT, libelleMoyenEncaissement } = await import('../lib/abonnements.js')

  egal('trois moyens d’encaissement, pas un de plus',
    MOYENS_ENCAISSEMENT.map(m => m.cle), ['terminal', 'especes', 'virement'])
  // ⚠️ ALEX A ÉCARTÉ LE LIEN DE PAIEMENT STRIPE le 18/08. Le banc le retient,
  // pour qu'il ne revienne pas par la petite porte d'un écran voisin.
  verifier('le lien de paiement Stripe reste écarté',
    !MOYENS_ENCAISSEMENT.some(m => /stripe|lien/i.test(m.cle + m.libelle)))
  verifier('chaque moyen dit AUSSI où retrouver l’argent',
    MOYENS_ENCAISSEMENT.every(m => typeof m.detail === 'string' && m.detail.length > 0))

  egal('terminal se dit en toutes lettres', libelleMoyenEncaissement('terminal'), 'terminal')
  egal('especes se dit avec son accent', libelleMoyenEncaissement('especes'), 'espèces')
  egal('virement se dit', libelleMoyenEncaissement('virement'), 'virement')
  // ⚠️ UN MOYEN INCONNU SE NOMME plutôt que de disparaître : un contrat payé
  // par un moyen qu'on ne sait plus lire reste payé, et le taire ferait croire
  // à un impayé. `sur_place` vient des inscriptions d'avant le 17/08.
  egal('l’ancien « sur_place » reste lisible', libelleMoyenEncaissement('sur_place'), 'au comptoir')
  egal('l’achat en ligne se dit aussi', libelleMoyenEncaissement('en_ligne'), 'en ligne')
  egal('un moyen inattendu se dit quand même', libelleMoyenEncaissement('cheque_barre'), 'cheque barre')
  egal('aucun moyen ne rend rien du tout', libelleMoyenEncaissement(null), null)
  egal('une chaîne vide non plus', libelleMoyenEncaissement(''), null)
}

{
  const srcConfig = lire('app/dashboard/ConfigDashboard.js')

  // ── Le geste d'encaissement existe et écrit les TROIS champs ─────────────
  // ⚠️ LES TROIS, PAS UN. `paye` seul laisse la Comptabilité sans date et sans
  // moyen : le montant devient introuvable au moment de rapprocher la caisse.
  verifier('l’encaissement au comptoir existe', /async function encaisser\(/.test(srcConfig))
  const majEncaisse = srcConfig.match(/\.update\(\{ paye: true[^}]*\}\)/)
  verifier('il marque le contrat payé', !!majEncaisse)
  verifier('… en horodatant', !!majEncaisse && /paye_le:/.test(majEncaisse[0]))
  verifier('… et en disant par quel moyen', !!majEncaisse && /mode_paiement: mode/.test(majEncaisse[0]))
  // Le bouton bascule entre « Encaisser » et « Fermer » : on cherche donc le
  // libellé, pas une balise qui le suivrait.
  verifier('le bouton dit le GESTE, pas l’état', /'Encaisser'/.test(srcConfig))
  verifier('les trois moyens viennent de la source unique',
    /MOYENS_ENCAISSEMENT\.map/.test(srcConfig))

  // ── Le solde se compte, il ne se lit pas ─────────────────────────────────
  // ⚠️ LA GARDE PORTE SUR LE CONTENU DU `select`, PAS SUR SON VOISINAGE.
  // Première écriture, elle cherchait `abonnement_id` dans les 160 caractères
  // qui suivent la table : le `.not('abonnement_id', 'is', null)` de la ligne
  // suivante la satisfaisait, et retirer la colonne du `select` ne rougissait
  // pas. C'est LE défaut le plus fréquent du projet, la colonne absente d'un
  // select : aucune erreur, un repli silencieux, et chaque abonnée réaffiche
  // son solde plein. Mesuré muet, puis resserré.
  // ⚠️ RÉORIENTÉE LE 04/10 : le PREMIER `select` de `rdv_reservations` du
  // fichier n'est plus celui des abonnés (l'avertissement d'un cours modifié,
  // Audit 1 I7, lit les inscriptions à venir plus haut). Piège du jumeau : on
  // vise la lecture des abonnés, qui passe par `toutesLesLignes`.
  const selectResa = srcConfig.match(/toutesLesLignes\(\(\) => supabase\.from\('rdv_reservations'\)\.select\('([^']*)'\)/)
  verifier('la liste des abonnés charge les séances déjà posées', !!selectResa)
  verifier('… avec le contrat auquel chaque séance appartient',
    !!selectResa && /\babonnement_id\b/.test(selectResa[1]), selectResa ? selectResa[1] : '')
  verifier('… et le statut, sans lequel rien ne se compte',
    !!selectResa && /\bstatut\b/.test(selectResa[1]), selectResa ? selectResa[1] : '')
  verifier('elle compte les réservations', /seancesConsommees\(reservationsAbo/.test(srcConfig))
  verifier('et en tire un solde', /soldeAbonnement\(a, posees\)/.test(srcConfig))
  // ⚠️ LE PIÈGE DU ZÉRO, déjà vécu deux fois : `restantes` vaut null quand le
  // contrat ne dit pas combien il accordait. Afficher « 0 restantes » serait un
  // mensonge, et ferait croire à un abonnement épuisé.
  verifier('un solde inconnu n’est pas affiché comme zéro',
    /restantes === null/.test(srcConfig))
  verifier('le total reste dit, sinon le solde ne se situe pas',
    /sur \$\{a\.seances_total\}/.test(srcConfig))
}

// ═══════════════════════════════════════════════════════════════════════════
// UN MODULE FINI QUE PERSONNE NE VOIT N'EXISTE PAS
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 TROISIÈME FOIS EN TROIS JOURS, APRÈS LE RESTAURANT ET LES INVENDUS.
// Le module était complet, testé, visible dans l'application, et pourtant :
// absent des vingt-neuf fonctions listées au signup, et nommé UNE SEULE FOIS
// sur la landing, au milieu d'une énumération du détail des tarifs. Un centre
// de yoga pouvait lire la page entière et l'inscription entière sans jamais
// apprendre qu'il pouvait vendre sa carte de séances.
//
// ⚠️ CE QUI REND CE DÉFAUT INVISIBLE, c'est qu'il ne casse rien : aucun écran
// ne plante, aucun test ne rougit, le module marche parfaitement pour ceux qui
// le trouvent. Seul un banc qui regarde les pages de DÉCISION peut le dire.
{
  // 🔴 `sansProse`, ET C'EST LA RAISON MÊME DE CE BLOC. Les commentaires qui
  // expliquent pourquoi ces libellés comptent CITENT ces libellés : lus avec la
  // prose, ces gardes resteraient vertes alors que l'écran aurait tout perdu.
  // Quatrième mode de faux vert du projet, et le mieux documenté.
  const SIGNUP = sansProse(lire('app/signup/page.js'))
  const LANDING = sansProse(lire('app/components/LandingReveal.js'))

  verifier('le signup annonce la vente d’abonnements',
    /titre: 'Abonnements et cartes de séances'/.test(SIGNUP))
  // ⚠️ ET IL DIT CE QUE ÇA FAIT, pas seulement son nom. Une ligne de liste sans
  // description ne décide personne : c'est le solde qui se décompte tout seul
  // qui distingue un abonnement d'une suite de rendez-vous payés à l'unité.
  verifier('et explique que le solde se décompte seul',
    /son solde se décompte tout seul/.test(SIGNUP))
  verifier('la vente d’abonnements est rattachée à la formule Vendre',
    /titre: 'Abonnements et cartes de séances',[\s\S]{0,600}?plan: 'vendre'/.test(SIGNUP))

  verifier('la landing le liste dans la formule Vendre',
    /'Abonnements et cartes de séances : /.test(LANDING))
  verifier('et le nomme côté habitant',
    /'Abonnements et séances'/.test(LANDING))

  // ⚠️ « ABONNEMENTS » TOUT SEUL EST AMBIGU SUR CETTE PAGE : elle emploie déjà
  // le mot pour NOS formules (« pas d'abonnement contraignant »). Dans une
  // liste destinée aux habitants, le mot nu ferait lire « je dois m'abonner à
  // Yoppaa ». Le second mot n'est pas un ornement, il lève la confusion.
  verifier('la pastille habitant ne dit jamais « Abonnements » seul',
    !/'Abonnements',/.test(LANDING))
}

// ─── UN ABONNEMENT PAYÉ QUI NE NAÎT PAS SE DIT, OU SE REJOUE (Audit 3 I9) ──
{
  const WH_A = sansProse(readFileSync(new URL('../app/api/stripe/webhook/route.js', import.meta.url), 'utf8'))
  const fonctionAbo = (/async function handleAbonnementSucceeded\(([\s\S]*?)\n}\n/.exec(WH_A) || [])[1] || ''
  verifier('la fonction du contrat payé a été trouvée', fonctionAbo.length > 1500, `${fonctionAbo.length} caractères`)
  verifier('🔴 une panne d’écriture du contrat se rejoue : la route lève, Stripe recommence',
    /throw new Error\(`insert abonnement KO : /.test(fonctionAbo) && /String\(error\.code\) === '23505'/.test(fonctionAbo))
  verifier('🔴 et chaque contrat qui ne peut pas naître alerte l’administration',
    (fonctionAbo.match(/await alerterAbonnementPerdu\(paymentIntent, /g) || []).length === 4)
  verifier('⚠️ l’alerte porte de quoi régulariser, échappé',
    /async function alerterAbonnementPerdu\(paymentIntent, raison\)/.test(WH_A) && /echapperHtml\(meta\.client_email/.test(WH_A) && /await envoyerAuAdmin\(\{/.test(WH_A))
}

// ─── CHAQUE REFUS D'UNE SÉANCE SUR ABONNEMENT A SA PHRASE (Audit 2 I10) ────
{
  const { messageRefusAbonnement: mra } = await import('../lib/abonnements.js')
  verifier('🔴 une session expirée dit de se reconnecter, pas de réessayer',
    /reconnecte-toi/.test(mra('session_perdue').texte) && !/Réessaie/.test(mra('session_perdue').texte))
  verifier('🔴 un cours qui n’a pas lieu renvoie choisir une autre heure',
    mra('cours_introuvable').retourGrille === true && /autre horaire/.test(mra('cours_introuvable').texte))
  verifier('⚠️ un contrat qui ne couvre pas le cours le dit', /ne couvre pas ce cours/.test(mra('abonnement_sans_cours').texte))
  verifier('⚠️ un contrat inactif nomme le commerce à contacter', /contacte Centre Respire/.test(mra('abonnement_introuvable', { nomCommerce: 'Centre Respire' }).texte))
  const FICHE_R = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('🔴 la fiche reconnaît la session perdue et passe par la règle',
    /messageRefusAbonnement\(j\?\.error === 'session_perdue' \|\| res\.status === 401 \? 'session_perdue' : j\?\.error,/.test(FICHE_R)
    && /if \(m\.retourGrille\) \{/.test(FICHE_R))
}

// ─── PAS DE VENTE EN LIGNE SANS COMPTE QUI ENCAISSE (Audit 3 I8, 03/10) ────
{
  const FICHE_V = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  const ROUTE_V = sansProse(readFileSync(new URL('../app/api/stripe/checkout/create-abonnement/route.js', import.meta.url), 'utf8'))
  verifier('🔴 la fiche ne propose l’achat que si le compte encaisse, comme le serveur l’exige',
    /formulesAbo\.length > 0 && commercant\?\.stripe_account_charges_enabled === true && \(/.test(FICHE_V)
    && /!commercant\.stripe_account_charges_enabled/.test(ROUTE_V))
}

// ─── « DÉJÀ PAYÉ » DIT PAR QUEL MOYEN (Audit 1 I4, 03/10) ──────────────────
{
  const CONF_P = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  verifier('🔴 un contrat « déjà payé » exige son moyen de paiement',
    /if \(insc\.paye && !insc\.mode_paiement\) return toast\(/.test(CONF_P)
    && /mode_paiement: insc\.paye \? insc\.mode_paiement : null,/.test(CONF_P))
  verifier('⚠️ et « sur place » ne s’invente plus jamais', !/insc\.mode_paiement \|\| 'sur_place'/.test(CONF_P))
}

// ─── UN ABONNEMENT À VENIR N'EST PAS « TERMINÉ » (Audit 3 I4, 03/10) ───────
{
  const { etatAbonnement: etatA, resumeAbonnementClient: resumeA } = await import('../lib/abonnements.js')
  const CONTRAT = { id: 'k1', statut: 'actif', date_debut: '2026-11-02', date_fin: '2027-06-30', seances_total: 30 }
  const etat = etatA(CONTRAT, [], { aujourdhui: '2026-10-04' })
  const r = resumeA(etat)
  verifier('🔴 acheté ce matin pour le mois prochain : la carte dit quand il commence',
    etat.aVenir === true && etat.termine === false && /^Commence le /.test(r.titre) && r.ton !== 'termine', JSON.stringify({ aVenir: etat.aVenir, r }))
  verifier('⚠️ et le premier jour, il est en cours',
    etatA(CONTRAT, [], { aujourdhui: '2026-11-02' }).aVenir === false && resumeA(etatA(CONTRAT, [], { aujourdhui: '2026-11-02' })).ton !== 'termine')
  verifier('⚠️ un contrat résilié avant son début reste résilié',
    resumeA(etatA({ ...CONTRAT, statut: 'resilie' }, [], { aujourdhui: '2026-10-04' })).titre === 'Abonnement résilié')
}

// ─── UNE SÉANCE D'ABONNEMENT EST DÉJÀ PAYÉE, ET LE DIT (Audit 2 I2-I3, 03/10)
//
// 🔴 LE RÉCAP DISAIT « TU RÈGLES SUR PLACE », L'EMAIL « PRIX 0,00 € », LE
// CALENDRIER AUSSI. L'abonnée venait avec son portefeuille, ou croyait à une
// erreur de prix.
{
  const { emailRdvConfirme } = await import('../lib/resend.js')
  const base = { yopper_prenom: 'Sophie', commercant_nom: 'Centre Respire', prestation_nom: 'Hatha', date_rdv: '2026-10-05', heure_debut: '18:00', heure_fin: '19:00', duree_minutes: 60, acompte_paye: false, acompte_montant: 0 }
  const abo = emailRdvConfirme({ ...base, prix_estime: 0, seance_abonnement: true })
  const htmlAbo = typeof abo === 'string' ? abo : (abo?.html || JSON.stringify(abo))
  verifier('🔴 l’email d’une séance d’abonnement dit « compris dans ton abonnement », jamais « 0,00 € »',
    /Compris dans ton abonnement/.test(htmlAbo) && !/>Prix</.test(htmlAbo) && !/0,00/.test(htmlAbo))
  const unite = emailRdvConfirme({ ...base, prix_estime: 15 })
  const htmlUnite = typeof unite === 'string' ? unite : (unite?.html || JSON.stringify(unite))
  verifier('⚠️ une séance à l’unité garde son prix', />Prix</.test(htmlUnite) && /15,00/.test(htmlUnite) && !/Compris dans ton abonnement/.test(htmlUnite))

  const ROUTE_C = sansProse(readFileSync(new URL('../app/api/emails/rdv-confirme/route.js', import.meta.url), 'utf8'))
  verifier('🔴 la route lit le contrat et le passe à l’email comme au calendrier',
    /^\s*abonnement_id,\s*$/m.test(ROUTE_C) && /seance_abonnement:\s*!!rdv\.abonnement_id,/.test(ROUTE_C)
    && /prix_estime: rdv\.abonnement_id \? null : rdv\.prix_estime,/.test(ROUTE_C))
  const FICHE_A = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('🔴 le récap de la fiche ne dit plus « tu règles sur place » à une abonnée',
    /\{seanceSurAbo\s*\? 'Séance comprise dans ton abonnement : rien à régler, ni maintenant ni sur place\.'/.test(FICHE_A))
  verifier('🔴 et l’écran de confirmation ne parle d’acompte que payé en ligne',
    /\{Number\(rdvCree\.acompte_montant\) > 0 && rdvCree\._viaStripe && \(/.test(FICHE_A) && !/'sur place'\}/.test(FICHE_A))
}

// ─── LA RÉSILIATION PASSE PAR LE SERVEUR (Abo-I2, 03/10) ──────────────────
//
// 🔴 ELLE S'ÉCRIVAIT DEPUIS LE NAVIGATEUR : cliente jamais prévenue, rappels
// qui partaient quand même, séance déjà donnée le matin annulée, et « places
// libérées » affiché sans avoir lu la réponse.
{
  const { seancesAnnuleesParResiliation } = await import('../lib/abonnements.js')
  const SEANCES = [
    { id: 'matin', statut: 'confirme', date_rdv: '2026-10-05', heure_debut: '09:00:00' },
    { id: 'soir', statut: 'confirme', date_rdv: '2026-10-05', heure_debut: '18:00:00' },
    { id: 'demain', statut: 'confirme', date_rdv: '2026-10-06', heure_debut: '09:00:00' },
    { id: 'annulee', statut: 'annule_client', date_rdv: '2026-10-06', heure_debut: '10:00:00' },
    { id: 'effacee', statut: 'confirme', date_rdv: '2026-10-07', heure_debut: '10:00:00', deleted_at: '2026-10-01T00:00:00Z' },
  ]
  // Il est 11 h le 5 : la séance de 9 h a eu lieu, celle de 18 h pas encore.
  const commencee = (d, h) => d < '2026-10-05' || (d === '2026-10-05' && h <= '11:00')
  egal('🔴 la résiliation n’annule que les séances qui n’ont pas commencé',
    seancesAnnuleesParResiliation(SEANCES, { dejaCommencee: commencee }).map(s => s.id), ['soir', 'demain'])
  verifier('⚠️ l’heure arrive sans ses secondes à la règle du temps',
    seancesAnnuleesParResiliation([{ id: 'x', statut: 'confirme', date_rdv: '2026-10-05', heure_debut: '09:00:00' }],
      { dejaCommencee: (d, h) => h === '09:00' }).length === 0)

  const { emailAbonnementResilie } = await import('../lib/resend.js')
  const html = emailAbonnementResilie({ yopper_prenom: '<b>Sophie</b>', commercant_nom: 'Centre Respire', formule: 'Yoga <année>', seances: ['lundi 5 octobre à 18:00', 'mardi 6 octobre à 09:00'], fiche_url: 'https://www.yoppaa.app/commander/rdv/centre-respire' })
  verifier('🔴 la cliente lit ses séances annulées, une par une',
    /Tes 2 séances à venir sont annulées/.test(html) && /lundi 5 octobre à 18:00/.test(html) && /mardi 6 octobre à 09:00/.test(html))
  verifier('🔴 ce qu’elle a tapé ne devient jamais du HTML', !/<b>Sophie<\/b>/.test(html) && !/Yoga <année>/.test(html))
  verifier('⚠️ l’email ne promet aucun remboursement : il renvoie vers le commerce',
    !/sera remboursé|est remboursé|te rembourse/.test(html) && /Contacte directement Centre Respire/.test(html))

  const ROUTE_R = sansProse(readFileSync(new URL('../app/api/rdv/resilier-abonnement/route.js', import.meta.url), 'utf8'))
  verifier('🔴 la route garde le geste derrière la case Argent',
    /gardeLigneEquipe\(request, supabase, 'abonnements', abonnement_id, 'argent'\)/.test(ROUTE_R) && /if \(nonAutorise\) return nonAutorise/.test(ROUTE_R))
  verifier('🔴 un seul gagnant : deux clics ne font qu’une résiliation et qu’un email',
    /\.update\(\{ statut: 'resilie' \}\)\s*\.eq\('id', abonnement_id\)\s*\.eq\('statut', contrat\.statut\)\s*\.select\('id'\)/.test(ROUTE_R)
    && /if \(!bascule \|\| bascule\.length === 0\) return/.test(ROUTE_R))
  // ⚠️ REPOINTÉES LE 04/10 (Abo-I1) : les séances, leurs rappels et leurs
  // files vivent dans `lib/abonnement-resiliation-server`, que « Résilier »
  // et « Rembourser » appellent tous les deux. On vérifie la règle là-bas, et
  // l'appel ici.
  const RESIL_R = sansProse(readFileSync(new URL('../lib/abonnement-resiliation-server.js', import.meta.url), 'utf8'))
  verifier('🔴 les séances annulées sont celles que la règle choisit, à l’heure de Bruxelles',
    /seancesAnnuleesParResiliation\(seances, \{\s*dejaCommencee: \(d, h\) => creneauDejaCommence\(d, h, maintenant\),/.test(RESIL_R)
    && /const seances = await annulerLesSeancesDuContrat\(supabase, abonnement_id\)/.test(ROUTE_R))
  verifier('🔴 leurs rappels de la veille sont coupés', /if \(s\.rappel_push_id\) \{\s*const r = await annulerPush\(s\.rappel_push_id\)/.test(RESIL_R))
  verifier('🔴 « recommence » termine une résiliation restée à moitié',
    /const dejaResilie = contrat\.statut === 'resilie'\s*if \(!dejaResilie\) \{/.test(ROUTE_R)
    && /if \(dejaResilie && annulees\.length === 0\) return NextResponse\.json\(\{ ok: true, deja: true/.test(ROUTE_R))
  verifier('🔴 la cliente est prévenue de ce qui est RÉELLEMENT annulé',
    /seances: annulees\.map\(s => seanceLisible\(s\.date_rdv, s\.heure_debut\)\)/.test(ROUTE_R) && /envoyerAuYopper\(/.test(ROUTE_R))

  const DASH_R = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  verifier('🔴 le tableau de bord ne résilie plus lui-même',
    /postPro\('\/api\/rdv\/resilier-abonnement', \{ abonnement_id: a\.id \}\)/.test(DASH_R)
    && !/from\('abonnements'\)\s*\.update\(\{ statut: 'resilie' \}\)/.test(DASH_R))
  // ⚠️ REPOINTÉE LE 04/10 (Abo-I1) : la question renvoie vers « Rembourser ».
  verifier('⚠️ et lit la réponse avant d’annoncer quoi que ce soit',
    /if \(!j\?\.ok\) return toast\(/.test(DASH_R) && /Résilier ne rembourse rien\. Pour rendre une partie du prix, utilise plutôt « Rembourser » : il résilie aussi\./.test(DASH_R))
}

// ── 🔴 Abo-I10 (04/10) : UN COMPTE NE PART PAS AVEC UN ABONNEMENT EN COURS ──
// Décision d'Alex : suppression BLOQUÉE tant qu'un contrat court ; les contrats
// finis sont gardés sept ans, ANONYMISÉS.
{
  const { abonnementsQuiBloquentLaSuppression: bloquent } = await import('../lib/abonnements.js')
  const AUJ = '2026-10-05'
  const base = { type: 'carnet', date_debut: '2026-09-01', date_fin: '2027-03-01', seances_total: 10, statut: 'actif' }
  const CONTRATS = [
    { ...base, id: 'en-cours' },
    { ...base, id: 'resilie', statut: 'resilie' },
    { ...base, id: 'fini', date_fin: '2026-10-01' },
    { ...base, id: 'epuise', seances_total: 2 },
    { ...base, id: 'a-venir', date_debut: '2026-11-01' },
    { ...base, id: 'efface', deleted_at: '2026-10-01T10:00:00Z' },
  ]
  const SEANCES = [
    { abonnement_id: 'epuise', statut: 'honore' }, { abonnement_id: 'epuise', statut: 'no_show' },
    { abonnement_id: 'en-cours', statut: 'honore' },
  ]
  egal('🔴 seuls les contrats qui courent bloquent la suppression (celui du mois prochain aussi)',
    bloquent(CONTRATS, SEANCES, { aujourdhui: AUJ }).map(a => a.id), ['en-cours', 'a-venir'])
  egal('⚠️ le même contrat sans ses séances bloque : le solde se compte sur les réservations',
    bloquent([CONTRATS[3]], [], { aujourdhui: AUJ }).map(a => a.id), ['epuise'])

  const SUPPR = sansProse(readFileSync(new URL('../app/api/yopper/supprimer-compte/route.js', import.meta.url), 'utf8'))
  const debutBlocage = SUPPR.indexOf('abonnementsQuiBloquentLaSuppression(contrats')
  verifier('🔴 la route bloque sur la règle, AVANT le verdict des blocages',
    debutBlocage > 0 && debutBlocage < SUPPR.indexOf('if (blocages.length > 0)')
    && /const enCours = abonnementsQuiBloquentLaSuppression\(contrats, seancesAbo, \{ aujourdhui \}\)\s*if \(enCours\.length > 0\) \{\s*blocages\.push\(/.test(SUPPR))
  verifier('⚠️ le solde se compte sur les séances du contrat, lues avec leur statut',
    /\.select\('abonnement_id, statut'\)\s*\.in\('abonnement_id', idsContrats\)/.test(SUPPR)
    && /\.select\('id, statut, type, date_debut, date_fin, seances_total, deleted_at'\)\s*\.eq\('client_email', email\)/.test(SUPPR))
  verifier('⚠️ une lecture ratée bloque au lieu de laisser partir le compte',
    /if \(errAbo \|\| errSeances\) \{\s*return NextResponse\.json\(\{ ok: false,/.test(SUPPR))
  verifier('🔴 les contrats finis sont anonymisés, notes comprises',
    /from\('abonnements'\)\s*\.update\(\{ client_prenom: 'Compte', client_nom: 'supprimé', client_email: EMAIL_ANONYME, client_telephone: null, notes: null \}\)\s*\.eq\('client_email', email\)/.test(SUPPR))
}

// ── 🔴 Abo-I1 (04/10) : RENDRE L'ARGENT D'UN ABONNEMENT ─────────────────────
// Décisions d'Alex : montant libre plafonné au prix, part non utilisée
// proposée, rembourser RÉSILIE toujours, comptoir = remboursement NOTÉ, case
// Argent, email à la cliente, contrepassation à l'export.
{
  const {
    MOYENS_REMBOURSEMENT, partNonUtilisee, verdictRemboursementAbonnement: verdictR,
    messageRefusRemboursement: msgR, libelleRemboursement,
  } = await import('../lib/abonnements.js')

  // Les moyens, confrontés à la MIGRATION, pas à la constante.
  const MIG_R = readFileSync(new URL('../migrations/MIGRATION_ABONNEMENT_REMBOURSEMENT_REPRISE.sql', import.meta.url), 'utf8')
  const checkMoyens = (MIG_R.match(/rembourse_moyen IN \(([^)]*)\)/) || [])[1] || ''
  egal('⚠️ les moyens de remboursement sont ceux de la contrainte de la base',
    [...checkMoyens.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort(), [...MOYENS_REMBOURSEMENT].sort())

  // Un carnet de 10 séances à 150 € : 3 données, 1 absence, 2 à venir.
  const CARNET = { id: 'c1', prix: 150, seances_total: 10, statut: 'actif', paye: true }
  const S = [
    { id: 'a', abonnement_id: 'c1', statut: 'honore', date_rdv: '2026-09-01', heure_debut: '10:00' },
    { id: 'b', abonnement_id: 'c1', statut: 'honore', date_rdv: '2026-09-08', heure_debut: '10:00' },
    { id: 'c', abonnement_id: 'c1', statut: 'confirme', date_rdv: '2026-09-15', heure_debut: '10:00' },
    { id: 'd', abonnement_id: 'c1', statut: 'no_show', date_rdv: '2026-09-22', heure_debut: '10:00' },
    { id: 'e', abonnement_id: 'c1', statut: 'confirme', date_rdv: '2026-10-20', heure_debut: '10:00' },
    { id: 'f', abonnement_id: 'c1', statut: 'confirme', date_rdv: '2026-10-27', heure_debut: '10:00:00' },
    { id: 'g', abonnement_id: 'c1', statut: 'annule_client', date_rdv: '2026-09-29', heure_debut: '10:00' },
    { id: 'x', abonnement_id: 'autre', statut: 'honore', date_rdv: '2026-09-01', heure_debut: '10:00' },
  ]
  const commencee = (d) => d < '2026-10-05'
  const part = partNonUtilisee(CARNET, S, { dejaCommencee: commencee })
  egal('🔴 la part non utilisée rend les séances à venir que la résiliation annule',
    part, { restantes: 6, total: 10, montant: 90 })
  verifier('⚠️ les séances d’un autre contrat ne comptent pas',
    partNonUtilisee(CARNET, S.filter(s => s.id === 'x'), { dejaCommencee: commencee })?.montant === 150)
  verifier('⚠️ un contrat sans nombre de séances ne propose rien (et surtout pas 0)',
    partNonUtilisee({ ...CARNET, seances_total: null }, S, { dejaCommencee: commencee }) === null
    && partNonUtilisee({ ...CARNET, prix: 0 }, S, { dejaCommencee: commencee }) === null)
  egal('⚠️ au centime, sans dépasser le prix',
    partNonUtilisee({ id: 'c2', prix: 100, seances_total: 3 }, [], {})?.montant, 100)
  egal('⚠️ un tiers de 100 € se propose au centime',
    partNonUtilisee({ id: 'c2', prix: 100, seances_total: 3 }, [{ id: 'z', abonnement_id: 'c2', statut: 'honore' }], {})?.montant, 66.67)

  const EN_LIGNE = { ...CARNET, mode_paiement: 'en_ligne', stripe_payment_intent_id: 'pi_1' }
  const COMPTOIR = { ...CARNET, mode_paiement: 'especes' }
  egal('🔴 en ligne : le montant libre part chez Stripe', verdictR(EN_LIGNE, { montant: '90,50' }),
    { ok: true, montant: 90.5, moyen: 'en_ligne', enLigne: true })
  egal('🔴 au comptoir : le moyen est exigé, et retenu', verdictR(COMPTOIR, { montant: 40, moyen: 'virement' }),
    { ok: true, montant: 40, moyen: 'virement', enLigne: false })
  verifier('🔴 au comptoir sans moyen : refusé', verdictR(COMPTOIR, { montant: 40 }).code === 'moyen_requis')
  verifier('⚠️ en ligne, un moyen envoyé par le navigateur ne détourne pas Stripe',
    verdictR(EN_LIGNE, { montant: 40, moyen: 'especes' }).moyen === 'en_ligne')
  verifier('🔴 jamais plus que le prix payé',
    verdictR(EN_LIGNE, { montant: 150.01 }).code === 'montant_trop_eleve' && verdictR(EN_LIGNE, { montant: 150.01 }).plafond === 150
    && verdictR(EN_LIGNE, { montant: 150 }).ok === true)
  verifier('🔴 zéro, vide, null ou du texte ne sont pas des montants (piège du zéro)',
    ['0', 0, '', null, undefined, 'abc', -5, true].every(m => verdictR(EN_LIGNE, { montant: m }).code === 'montant_invalide'))
  verifier('🔴 un contrat non payé ne se rembourse pas', verdictR({ ...EN_LIGNE, paye: false }, { montant: 10 }).code === 'non_paye')
  verifier('🔴 un contrat déjà remboursé ne se rembourse pas deux fois',
    verdictR({ ...EN_LIGNE, rembourse_montant: 20 }, { montant: 10 }).code === 'deja_rembourse')
  verifier('⚠️ un paiement en ligne sans trace Stripe se dit',
    verdictR({ ...EN_LIGNE, stripe_payment_intent_id: null }, { montant: 10 }).code === 'paiement_introuvable')
  verifier('⚠️ chaque refus a sa phrase, et le plafond se dit en euros',
    ['introuvable', 'non_paye', 'deja_rembourse', 'montant_invalide', 'paiement_introuvable', 'moyen_requis', 'stripe']
      .every(c => msgR(c) && msgR(c) !== msgR('inconnu'))
    && msgR('montant_trop_eleve', { plafond: 150 }).includes(euros(150)))
  verifier('⚠️ la carte dit ce qui a été rendu, et comment',
    libelleRemboursement({ rembourse_montant: 90, rembourse_moyen: 'en_ligne' }) === `Remboursé ${euros(90)} · sur la carte`
    && libelleRemboursement({ rembourse_montant: 40, rembourse_moyen: 'especes' }) === `Remboursé ${euros(40)} · espèces`
    && libelleRemboursement({ rembourse_montant: null }) === null)

  const { emailAbonnementResilie: mailR } = await import('../lib/resend.js')
  const htmlCarte = mailR({ yopper_prenom: 'Sophie', commercant_nom: 'Centre Respire', formule: 'Yoga', seances: ['mardi 20 octobre à 10:00'], fiche_url: null, remboursement: { montant: 90, moyen: 'en_ligne' } })
  const htmlComptoir = mailR({ yopper_prenom: 'Sophie', commercant_nom: 'Centre Respire', formule: 'Yoga', seances: [], fiche_url: null, remboursement: { montant: 40, moyen: 'especes' } })
  verifier('🔴 l’email du remboursement dit le montant et la carte',
    htmlCarte.includes(euros(90)) && /sur la carte utilisée pour l’achat/.test(htmlCarte) && /mardi 20 octobre à 10:00/.test(htmlCarte))
  verifier('🔴 au comptoir, il dit le moyen et ne parle pas de carte',
    htmlComptoir.includes(euros(40)) && /en espèces/.test(htmlComptoir) && !/carte utilisée/.test(htmlComptoir))

  // ── La route : garde, règle, verrou, ordre ─────────────────────────────────
  const REMB = sansProse(readFileSync(new URL('../app/api/rdv/rembourser-abonnement/route.js', import.meta.url), 'utf8'))
  verifier('🔴 rembourser passe par la case Argent',
    /gardeLigneEquipe\(request, supabase, 'abonnements', abonnement_id, 'argent'\)/.test(REMB) && /if \(nonAutorise\) return nonAutorise/.test(REMB))
  verifier('🔴 la route applique la règle exécutée par ce banc, sur le contrat relu',
    /const regle = verdictRemboursementAbonnement\(contrat, \{ montant, moyen \}\)\s*if \(!regle\.ok\) \{/.test(REMB)
    && /\.select\('id, statut, prix, paye, mode_paiement, stripe_payment_intent_id, rembourse_montant,/.test(REMB))
  verifier('🔴 un seul gagnant : le montant ne s’inscrit que sur un contrat payé jamais remboursé',
    /\.update\(\{ rembourse_montant: regle\.montant, rembourse_le: new Date\(\)\.toISOString\(\), rembourse_moyen: regle\.moyen \}\)\s*\.eq\('id', abonnement_id\)\s*\.eq\('paye', true\)\s*\.is\('rembourse_montant', null\)\s*\.select\('id'\)/.test(REMB)
    && /if \(!verrou \|\| verrou\.length === 0\) \{/.test(REMB))
  verifier('🔴 Stripe rend le MONTANT choisi, sur le compte du commerce, une seule fois',
    /amount: Math\.round\(regle\.montant \* 100\),/.test(REMB)
    && /stripeAccount: contrat\.commercant\.stripe_account_id, idempotencyKey: `abo-remb-\$\{contrat\.id\}-\$\{Math\.round\(regle\.montant \* 100\)\}`/.test(REMB))
  verifier('🔴 un refus de Stripe lève le verrou et ne résilie rien',
    /\.update\(\{ rembourse_montant: null, rembourse_le: null, rembourse_moyen: null \}\)\s*\.eq\('id', abonnement_id\)\s*\.is\('stripe_refund_id', null\)\s*return NextResponse\.json\(\{ ok: false, code: 'stripe',/.test(REMB)
    && REMB.indexOf("code: 'stripe'") < REMB.indexOf("update({ statut: 'resilie' })"))
  verifier('🔴 rembourser résilie toujours, par la règle commune des séances',
    /\.update\(\{ statut: 'resilie' \}\)\s*\.eq\('id', abonnement_id\)\s*\.eq\('statut', contrat\.statut\)/.test(REMB)
    && /const seances = await annulerLesSeancesDuContrat\(supabase, abonnement_id\)/.test(REMB))
  verifier('⚠️ l’email dit le montant et le moyen',
    /remboursement: \{ montant: regle\.montant, moyen: regle\.moyen \},/.test(REMB) && /envoyerAuYopper\(/.test(REMB))

  // ── L'écran ────────────────────────────────────────────────────────────────
  const DASH_I1 = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  verifier('🔴 l’écran pose la même question que la route, avant d’envoyer',
    /const regle = verdictRemboursementAbonnement\(a, \{ montant: rembMontant, moyen: rembMoyen \}\)\s*if \(!regle\.ok\) return toast\(messageRefusRemboursement\(regle\.code, regle\), 'error'\)/.test(DASH_I1)
    && /postPro\('\/api\/rdv\/rembourser-abonnement', \{ abonnement_id: a\.id, montant: regle\.montant, moyen: regle\.moyen \}\)/.test(DASH_I1))
  verifier('🔴 la part proposée se calcule sur les séances avec leur heure',
    /select\('id, abonnement_id, statut, date_rdv, heure_debut'\)/.test(DASH_I1)
    && /partNonUtilisee\(a, reservationsAbo, \{\s*dejaCommencee: \(d, h\) => creneauDejaCommence\(d, h, Date\.now\(\)\),/.test(DASH_I1))
  verifier('⚠️ « Rembourser » reste offert sur un contrat résilié, jamais deux fois',
    /const peutRembourser = a\.paye && !rembourse/.test(DASH_I1) && /\{\(!resilie \|\| peutRembourser\) && \(/.test(DASH_I1))
}

// ── 🔴 Abo-I1 : LE WEBHOOK APPREND UN REMBOURSEMENT FAIT DANS STRIPE ─────────
{
  const WH = sansProse(readFileSync(new URL('../app/api/stripe/webhook/route.js', import.meta.url), 'utf8'))
  const debut = WH.indexOf('async function handleChargeRefunded(')
  const corps = WH.slice(debut, WH.indexOf('\n}\n', debut))
  verifier('🔴 charge.refunded cherche aussi l’abonnement du paiement',
    /\.from\('abonnements'\)\s*\.select\('id, rembourse_montant, stripe_refund_id'\)\s*\.eq\('stripe_payment_intent_id', paymentIntentId\)/.test(corps))
  verifier('🔴 un montant différent s’écrit (le cumul Stripe), en ligne, daté',
    /: \{ rembourse_montant: montant, rembourse_le: new Date\(\)\.toISOString\(\), rembourse_moyen: 'en_ligne',/.test(corps))
  verifier('⚠️ le même montant ne réécrit que la trace manquante',
    /const memeMontant = Number\(abo\.rembourse_montant\) === montant/.test(corps)
    && /\? \(!abo\.stripe_refund_id && refundId \? \{ stripe_refund_id: refundId \} : null\)/.test(corps))
  verifier('🔴 une écriture ratée se rejoue au lieu de se taire',
    /if \(errAbo\) throw new Error\(/.test(corps) && /if \(errAboLu\) throw new Error\(/.test(corps))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Abonnements verts.')
