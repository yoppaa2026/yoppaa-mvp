// BANC DE L'EMPREINTE BANCAIRE SUR UNE TABLE (lot 4, 14/09/2026)
//
// Il EXÉCUTE les règles plutôt que de chercher des mots : qui doit donner sa
// carte, pour quel montant, et jusqu'à quand le restaurateur peut débiter.
//
// 🔴 CE QUE CE BANC SURVEILLE EN PRIORITÉ, C'EST L'ARGENT QUI PART TOUT SEUL.
// Une empreinte mal bornée débite un client qui était là, et un débit de bonne
// foi revient en contestation de carte que Stripe tranche contre nous.

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  seuilEmpreinte, montantParPersonne, empreinteRequise, montantEmpreinte,
  fenetreDebit, peutDebiter, raisonDebitImpossible,
  EMPREINTE_SEUIL_DEFAUT, EMPREINTE_MONTANT_DEFAUT,
  EMPREINTE_SEUIL_MAX, EMPREINTE_MONTANT_MAX,
} from '../lib/empreinte-table.js'

let ok = 0
const echecs = []
function verifie(nom, condition, detail = '') {
  if (condition) { ok++; return }
  echecs.push(nom + (detail ? ` (${detail})` : ''))
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, obtenu === attendu, `obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`)

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// Un restaurateur réglé, avec un compte Stripe en ordre.
const RESTO = {
  rdv_empreinte_actif: true,
  rdv_empreinte_seuil_couverts: 6,
  rdv_empreinte_par_personne: 20,
  stripe_account_id: 'acct_1',
  stripe_account_charges_enabled: true,
  categorie: 'alimentaire',
}
const TABLE = { id: 'p1', par_couverts: true, couverts_min: 1, couverts_max: 12 }
const COUPE = { id: 'p2', par_couverts: false }

// ─── 1) QUI DOIT DONNER SA CARTE ────────────────────────────────────────────
verifie('une table de 6 : la carte est demandée', empreinteRequise(RESTO, TABLE, 6) === true)
verifie('une table de 12 aussi', empreinteRequise(RESTO, TABLE, 12) === true)
// ⚠️ LE SEUIL EST UN « À PARTIR DE », PAS UN « AU-DELÀ ».
verifie('🔴 une table de 5 : on ne demande RIEN', empreinteRequise(RESTO, TABLE, 5) === false)
verifie('un couple non plus', empreinteRequise(RESTO, TABLE, 2) === false)
verifie('l’empreinte éteinte ne demande jamais rien',
  empreinteRequise({ ...RESTO, rdv_empreinte_actif: false }, TABLE, 10) === false)
// 🔴 LA RÈGLE SUIT LA PRESTATION, PAS LA CATÉGORIE : une coupe n'est pas une
// table, et une friterie qui prend des commandes n'a pas à réclamer de carte.
verifie('🔴 une prestation qui n’est pas une table : jamais d’empreinte',
  empreinteRequise(RESTO, COUPE, 10) === false)
// ⚠️ SANS COMPTE STRIPE, LA DEMANDE ÉCHOUERAIT AU PIRE MOMENT : quand le client
// a déjà sorti sa carte.
verifie('🔴 sans compte Stripe, on ne demande pas de carte',
  empreinteRequise({ ...RESTO, stripe_account_id: null }, TABLE, 8) === false)
verifie('🔴 avec un compte Stripe qui n’encaisse pas encore, non plus',
  empreinteRequise({ ...RESTO, stripe_account_charges_enabled: false }, TABLE, 8) === false)
verifie('un nombre de personnes absurde ne déclenche rien',
  empreinteRequise(RESTO, TABLE, 0) === false && empreinteRequise(RESTO, TABLE, -3) === false
  && empreinteRequise(RESTO, TABLE, 'six') === false)

// ─── 2) COMBIEN LA TABLE GARANTIT ───────────────────────────────────────────
egal('six couverts à 20 € garantissent 120 €', montantEmpreinte(RESTO, TABLE, 6), 120)
egal('huit couverts à 25 € garantissent 200 €',
  montantEmpreinte({ ...RESTO, rdv_empreinte_par_personne: 25 }, TABLE, 8), 200)
// 🔴 LE PIÈGE DU ZÉRO : une table sous le seuil ne garantit RIEN, et surtout
// pas « zéro euro garanti », qui laisserait croire à une empreinte posée.
egal('🔴 une table sous le seuil garantit zéro', montantEmpreinte(RESTO, TABLE, 4), 0)
egal('une empreinte éteinte garantit zéro',
  montantEmpreinte({ ...RESTO, rdv_empreinte_actif: false }, TABLE, 9), 0)
egal('les centimes ne dérivent pas',
  montantEmpreinte({ ...RESTO, rdv_empreinte_par_personne: 12.35 }, TABLE, 7), 86.45)

// ─── 3) LES RÉGLAGES SE LISENT SANS PIÉGER ──────────────────────────────────
egal('un réglage absent retombe sur la valeur proposée', seuilEmpreinte({}), EMPREINTE_SEUIL_DEFAUT)
egal('et le montant aussi', montantParPersonne({}), EMPREINTE_MONTANT_DEFAUT)
// ⚠️ UN MONTANT DÉLIBÉRÉMENT BAS NE DOIT PAS ÊTRE REMONTÉ EN SILENCE : c'est ce
// qu'aurait fait un `|| 20`.
egal('un montant de 1 € reste 1 €', montantParPersonne({ rdv_empreinte_par_personne: 1 }), 1)
egal('un montant hors borne est ramené dans les clous',
  montantParPersonne({ rdv_empreinte_par_personne: 9999 }), EMPREINTE_MONTANT_MAX)
egal('un seuil hors borne aussi',
  seuilEmpreinte({ rdv_empreinte_seuil_couverts: 9999 }), EMPREINTE_SEUIL_MAX)
egal('un seuil illisible retombe sur la valeur proposée',
  seuilEmpreinte({ rdv_empreinte_seuil_couverts: 'six' }), EMPREINTE_SEUIL_DEFAUT)
// 🔴 LES DEUX FORMES DE L'ABSENCE, ET LE ZÉRO QUI N'EN EST PAS UNE.
// `Number(null)` vaut 0 : sans distinction, une colonne à `null` était ramenée
// au MINIMUM et une table de huit n'aurait garanti que 8 €.
egal('🔴 un montant à null retombe sur la valeur proposée, pas sur le minimum',
  montantParPersonne({ rdv_empreinte_par_personne: null }), EMPREINTE_MONTANT_DEFAUT)
egal('🔴 un seuil à null aussi',
  seuilEmpreinte({ rdv_empreinte_seuil_couverts: null }), EMPREINTE_SEUIL_DEFAUT)
egal('une colonne vide est une absence, pas un zéro',
  montantParPersonne({ rdv_empreinte_par_personne: '' }), EMPREINTE_MONTANT_DEFAUT)
// ⚠️ MAIS UN ZÉRO EXPLICITE EST BORNÉ AU MINIMUM, JAMAIS REMONTÉ AU DÉFAUT :
// inventer vingt euros que le client n'a pas acceptés serait pire.
egal('🔴 un montant à zéro est borné au minimum, pas remonté à vingt',
  montantParPersonne({ rdv_empreinte_par_personne: 0 }), 1)
egal('et un seuil à zéro vaut une personne', seuilEmpreinte({ rdv_empreinte_seuil_couverts: 0 }), 1)

// ─── 4) LA FENÊTRE DE DÉBIT ─────────────────────────────────────────────────
//
// Elle s'ouvre à l'heure du service et se ferme à la fin du LENDEMAIN. Un
// client ne doit pas découvrir un prélèvement trois semaines après son dîner.
const POSEE = {
  date_rdv: '2026-09-19', heure_debut: '20:00',
  empreinte_statut: 'posee', empreinte_montant: 120,
  empreinte_payment_method_id: 'pm_1', empreinte_customer_id: 'cus_1',
}
{
  const f = fenetreDebit(POSEE)
  egal('la fenêtre s’ouvre à l’heure du service', f.ouvre.toISOString(), '2026-09-19T18:00:00.000Z')
  egal('et se ferme à la fin du lendemain', f.ferme.toISOString(), '2026-09-20T22:00:00.000Z')
}
egal('🔴 avant le service, on ne débite pas',
  raisonDebitImpossible(POSEE, new Date('2026-09-19T19:59:00+02:00')), 'service_pas_commence')
verifie('pendant le service, on peut',
  peutDebiter(POSEE, new Date('2026-09-19T21:30:00+02:00')) === true)
verifie('le lendemain soir, on peut encore',
  peutDebiter(POSEE, new Date('2026-09-20T23:30:00+02:00')) === true)
egal('🔴 le surlendemain, la fenêtre est FERMÉE',
  raisonDebitImpossible(POSEE, new Date('2026-09-21T00:30:00+02:00')), 'fenetre_fermee')
egal('sans empreinte posée, il n’y a rien à débiter',
  raisonDebitImpossible({ ...POSEE, empreinte_statut: null }, new Date('2026-09-19T21:30:00+02:00')), 'aucune_empreinte')
egal('🔴 une empreinte déjà débitée ne se débite pas deux fois',
  raisonDebitImpossible({ ...POSEE, empreinte_debit_pi_id: 'pi_1' }, new Date('2026-09-19T21:30:00+02:00')), 'deja_debitee')
egal('une réservation sans date ne se débite pas',
  raisonDebitImpossible({ empreinte_statut: 'posee' }, new Date()), 'date_illisible')

// ─── 5) LE CHANGEMENT D'HEURE ───────────────────────────────────────────────
//
// ⚠️ UN SERVICE D'HIVER N'EST PAS UN SERVICE D'ÉTÉ. Sans fuseau, la fenêtre
// s'ouvrait une heure trop tôt en hiver, et le restaurateur pouvait débiter un
// client encore attendu.
{
  const hiver = { ...POSEE, date_rdv: '2026-12-19' }
  const f = fenetreDebit(hiver)
  egal('en décembre, le service de 20:00 s’ouvre bien à 19:00 UTC',
    f.ouvre.toISOString(), '2026-12-19T19:00:00.000Z')
  egal('et la fenêtre se ferme à minuit belge du surlendemain',
    f.ferme.toISOString(), '2026-12-20T23:00:00.000Z')
}

// ─── 6) LE DISCOURS : RIEN N'EST BLOQUÉ ─────────────────────────────────────
//
// 🔴 AUCUN TEXTE NE DOIT DIRE QU'UNE SOMME EST RETENUE SUR LE COMPTE DU CLIENT.
// Avec un SetupIntent, rien ne l'est, et une autorisation expirerait de toute
// façon en sept jours.
for (const chemin of ['lib/empreinte-table.js', 'lib/rdv-delai-annulation.js']) {
  const src = sansProse(lire(chemin))
  verifie(`${chemin} : aucune somme annoncée comme bloquée`,
    !/(bloqu|retenu|g[eé]l[eé])\w*\s+(sur\s+)?(ta|ton|sa|son|le|la)\s+(carte|compte)/i.test(src))
}

// ─── 7) L'ÉCRAN DE RÉGLAGE ──────────────────────────────────────────────────
//
// ⚠️ L'ÉCRAN NE DÉCIDE DE RIEN : il écrit ces colonnes directement en base, donc
// la validation doit venir du module, sinon elle ne vaut que pour celui qui
// passe par le formulaire.
{
  const CONFIG = sansProse(lire('app/dashboard/ConfigDashboard.js'))
  const i = CONFIG.indexOf('function ReglageEmpreinte(')
  const ECRAN = i === -1 ? '' : CONFIG.slice(i, CONFIG.indexOf('\nfunction ', i + 10))
  verifie('le réglage de l’empreinte se découpe', ECRAN.length > 2000, String(ECRAN.length))
  // ⚠️ LA GARDE VISE LA LECTURE, PAS LE MOT. Le même select existe DEUX fois
  // dans ce composant, à l'ouverture et en relecture après écriture : un motif
  // qui ne nommait que les colonnes restait vert quand on cassait la première,
  // parce qu'il trouvait la seconde. Le jumeau, encore. Trouvé par mutation le
  // 14/09.
  verifie('🔴 il lit les réglages EN BASE à l’ouverture, pas dans la fiche du démarrage',
    /supabase\.from\('commercants'\)\s*\.select\('rdv_empreinte_actif, rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne, rdv_delai_annulation_heures'\)/.test(ECRAN))
  verifie('🔴 il valide avec les règles du module',
    /validerSeuil\(seuil\)/.test(ECRAN) && /validerMontant\(montant\)/.test(ECRAN) && /validerDelai\(delai\)/.test(ECRAN))
  verifie('🔴 et n’écrit que ce qu’elles rendent',
    /rdv_empreinte_seuil_couverts: vSeuil\.valeur/.test(ECRAN)
    && /rdv_empreinte_par_personne: vMontant\.valeur/.test(ECRAN)
    && /rdv_delai_annulation_heures: vDelai\.valeur/.test(ECRAN))
  // ⚠️ UN RÉGLAGE QUI N'A PAS PRIS ET UN ÉCRAN QUI L'AFFICHE QUAND MÊME, c'est
  // un restaurateur qui croit ses tables garanties.
  verifie('🔴 il lit le résultat de l’écriture avant de dire « enregistrée »',
    /\.select\('rdv_empreinte_actif, rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne, rdv_delai_annulation_heures'\)\s*\.maybeSingle\(\)/.test(ECRAN)
    && /if \(error \|\| !data\) return toast\(/.test(ECRAN))
  // ⚠️ SANS COMPTE STRIPE, LE RÉGLAGE SERAIT SANS EFFET, et le restaurateur
  // doit l'apprendre AVANT d'allumer une protection qui ne se déclenchera pas.
  verifie('🔴 il prévient quand le compte Stripe n’est pas prêt',
    /stripePret/.test(ECRAN) && /Connecte d&rsquo;abord ton compte Stripe/.test(ECRAN))
  // ⚠️ UN MONTANT N'EST PAS UNE INFORMATION : « 20 € » ne dit rien, « une table
  // de 6 garantit 120 € » dit ce que le client va lire.
  verifie('🔴 il montre le TOTAL garanti, pas seulement le montant par personne',
    /Une table de \{vSeuil\.valeur\} garantit \{total/.test(ECRAN))
  verifie('⚠️ ses bornes sont celles du module',
    /min=\{EMPREINTE_SEUIL_MIN\} max=\{EMPREINTE_SEUIL_MAX\}/.test(ECRAN)
    && /min=\{EMPREINTE_MONTANT_MIN\} max=\{EMPREINTE_MONTANT_MAX\}/.test(ECRAN)
    && /min=\{DELAI_MIN\} max=\{DELAI_MAX\}/.test(ECRAN))
  // 🔴 ET IL DIT CE QUI SE PASSE APRÈS LE DÉLAI. Un restaurateur qui ne
  // comprend pas quand l'empreinte devient facturable ne l'allumera pas.
  verifie('🔴 il dit que rien n’est débité si le client vient',
    /Rien n&rsquo;est débité s&rsquo;il vient/.test(ECRAN))
  verifie('🔴 et que passé le délai, le client peut encore annuler',
    /ton client peut encore annuler/.test(ECRAN))
  verifie('⚠️ il est monté sous la même condition que la cadence',
    /<ReglageEmpreinte commercantId=\{commercantId\} commercant=\{commercant\} toast=\{toast\} \/>/.test(CONFIG))
  // 🔴 ET AUCUNE SOMME BLOQUÉE DANS CET ÉCRAN NON PLUS.
  verifie('🔴 aucune somme annoncée comme bloquée sur la carte du client',
    !/(bloqu|retenu|g[eé]l[eé])\w*\s+(sur\s+)?(ta|ton|sa|son|le|la)\s+(carte|compte)/i.test(ECRAN))
}

// ═══ RÉSULTAT ═══════════════════════════════════════════════════════════════
console.log(`\nEmpreinte de table : ${ok + echecs.length} vérifications`)
if (echecs.length) {
  console.log(`\n🔴 ${echecs.length} en échec :`)
  echecs.forEach(e => console.log('   ✕ ' + e))
  process.exit(1)
}
console.log('Tout passe.')
