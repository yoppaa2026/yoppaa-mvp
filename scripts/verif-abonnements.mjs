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
  peutReserverSurAbonnement, libelleSolde,
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
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Abonnements verts.')
