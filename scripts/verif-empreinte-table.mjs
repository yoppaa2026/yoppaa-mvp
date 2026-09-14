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
  echeanceLien, lienValide, peutDemander, raisonDemandeImpossible,
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

// ─── 8) LE PARCOURS : LA CARTE, PUIS LA TABLE ───────────────────────────────
//
// Trois maillons, et chacun peut trahir seul : l'écran qui part vers Stripe, la
// route qui ouvre la session, le webhook qui crée la table au retour.
{
  const ROUTE = sansProse(lire('app/api/stripe/checkout/create-rdv-empreinte/route.js'))
  const WEBHOOK = sansProse(lire('app/api/stripe/webhook/route.js'))
  const TUNNEL = sansProse(lire('app/commander/rdv/[slug]/page.js'))

  // ⚠️ `mode: 'setup'` : c'est ce mot qui fait que RIEN n'est débité.
  verifie('🔴 la route ouvre une session qui n’encaisse rien', /mode: 'setup'/.test(ROUTE))
  // 🔴 `off_session` DEMANDE L'AUTHENTIFICATION FORTE MAINTENANT. Sans lui, le
  // débit du no-show serait refusé par la banque avec `authentication_required`,
  // au moment précis où plus personne n'est devant l'écran.
  verifie('🔴 elle demande le mandat qui permettra le débit plus tard',
    /setup_intent_data: \{\s*usage: 'off_session'/.test(ROUTE))
  // ⚠️ CARTE UNIQUEMENT : une empreinte suppose une autorisation gardée puis
  // capturée. Bancontact passerait par une domiciliation contestable.
  verifie('🔴 carte uniquement, jamais Bancontact', /payment_method_types: \['card'\]/.test(ROUTE))
  // ⚠️ SUR LE COMPTE DU RESTAURATEUR : en direct charge, une carte enregistrée
  // sur la plateforme ne serait pas débitable par lui.
  verifie('🔴 le client Stripe naît sur le compte du restaurateur',
    /stripe\.customers\.create\([\s\S]{0,400}?\{ stripeAccount: commercant\.stripe_account_id \}\)/.test(ROUTE))
  verifie('🔴 et la session aussi',
    /stripeAccount: commercant\.stripe_account_id,\s*\}\)/.test(ROUTE))
  // 🔴 LE SERVEUR REJOUE LA RÈGLE, il ne croit pas l'écran.
  verifie('🔴 la route revérifie que l’empreinte est due',
    /empreinteRequise\(commercant, prestation, couvertsRetenus\)/.test(ROUTE))
  verifie('🔴 et revérifie le nombre de personnes contre la prestation',
    /couvertsValides\(prestation, couverts\)/.test(ROUTE))
  // ⚠️ LE PIÈGE DU ZÉRO : une garantie de zéro euro n'est pas une garantie.
  verifie('🔴 une garantie nulle ne demande pas de carte', /if \(!\(montant > 0\)\)/.test(ROUTE))
  verifie('⚠️ les gardes de forfait sont les mêmes que sur l’acompte',
    /for \(const feature of \['rdv', 'paiement_ligne'\]\)/.test(ROUTE))
  verifie('⚠️ un créneau déjà commencé est refusé avant d’ouvrir la session',
    /creneauDejaCommence\(date_rdv/.test(ROUTE))
  // ⚠️ LA PRESTATION APPARTIENT-ELLE À CE COMMERCE ? Deux identifiants venus du
  // même écran ne prouvent pas qu'ils vont ensemble.
  verifie('🔴 la prestation est vérifiée comme appartenant au commerce',
    /prestation\.commercant_id !== commercant\.id/.test(ROUTE))

  // 🔴 LE HANDLER SORTAIT EN SILENCE SUR UNE SESSION SANS PAIEMENT. En
  // `mode: 'setup'`, `session.payment_intent` est vide : le garde écrit pour
  // les paiements aurait ignoré chaque table garantie.
  verifie('🔴 le webhook traite l’empreinte AVANT le garde qui exige un paiement',
    WEBHOOK.indexOf("session.mode === 'setup'") !== -1
    && WEBHOOK.indexOf("session.mode === 'setup'") < WEBHOOK.indexOf('if (!sessionId || !paymentIntentId)'))
  // ⚠️ ON RELIT LE SetupIntent CHEZ STRIPE : la carte n'est renseignée que là.
  verifie('🔴 il relit le SetupIntent sur le compte du restaurateur',
    /stripe\.setupIntents\.retrieve\(setupIntentId,\s*compteConnecte \? \{ stripeAccount: compteConnecte \}/.test(WEBHOOK))
  // 🔴 LE MONTANT VIENT DES MÉTADONNÉES STRIPE, hors de portée du commerçant,
  // et pas d'un calcul refait aujourd'hui avec un réglage qui a pu changer.
  verifie('🔴 le montant garanti vient des métadonnées du SetupIntent',
    /const montant = Number\(meta\.empreinte_montant\)/.test(WEBHOOK))
  verifie('🔴 sans carte ni client Stripe, aucune table n’est créée',
    /if \(!paymentMethodId \|\| !customerId\)/.test(WEBHOOK))
  verifie('🔴 un montant nul fait échouer la création plutôt que de garantir zéro',
    /if \(!\(montant > 0\)\) \{[\s\S]{0,300}?throw new Error/.test(WEBHOOK))
  verifie('⚠️ le rejeu de Stripe est absorbé',
    /table déjà créée, rejeu absorbé/.test(WEBHOOK))
  verifie('🔴 la table naît avec sa garantie posée',
    /empreinte_statut: 'posee'/.test(WEBHOOK) && /empreinte_setup_intent_id: setupIntentId/.test(WEBHOOK))
  verifie('⚠️ et l’échec de création relance Stripe plutôt que de perdre la table',
    /création table impossible/.test(WEBHOOK))

  // ⚠️ L'ÉCRAN PART VERS STRIPE AVANT L'ACOMPTE : une table n'a pas de prix,
  // donc pas d'acompte, mais l'ordre est écrit pour que ça reste vrai.
  verifie('🔴 le tunnel envoie vers l’empreinte quand elle est due',
    /if \(empreinteRequise\(commercant, prestationChoisie, couverts\)\)/.test(TUNNEL))
  verifie('⚠️ et il le fait avant la branche de l’acompte',
    TUNNEL.indexOf('empreinteRequise(commercant, prestationChoisie, couverts)') < TUNNEL.indexOf('if (acompteEnLigneRequis)'))
  verifie('⚠️ il appelle la bonne route',
    /create-rdv-empreinte/.test(TUNNEL))
}

// ─── 9) LE DÉBIT, LE SEUL MOMENT OÙ DE L'ARGENT SORT ────────────────────────
{
  const DEBIT = sansProse(lire('app/api/rdv/empreinte-debiter/route.js'))
  const DASH = sansProse(lire('app/dashboard/page.js'))

  // ⚠️ LA MÊME GARDE QUE LE NO-SHOW : elle prouve que celui qui appelle est le
  // commerçant de CETTE ligne. Sans elle, un identifiant suffirait à débiter la
  // table d'un autre.
  verifie('🔴 la route prouve qui appelle, sur la ligne visée',
    /gardeSurLigne\(request, supabase, 'rdv_reservations', rdv_id\)/.test(DEBIT))
  // 🔴 LA FENÊTRE VIENT DU MODULE, pas d'un test réécrit ici.
  verifie('🔴 elle rejoue la fenêtre du module plutôt que d’en réécrire une',
    /raisonDebitImpossible\(rdv, new Date\(\)\)/.test(DEBIT))
  // 🔴 DEUX SOURCES POUR UN MONTANT. La base est verrouillée par un trigger,
  // mais on ne prélève pas sur la foi d'une seule source : le montant doit être
  // celui que Stripe garde, c'est-à-dire celui que le client a lu.
  verifie('🔴 le montant est comparé à celui que Stripe a gardé',
    /stripe\.setupIntents\.retrieve\(rdv\.empreinte_setup_intent_id, \{ stripeAccount: compte \}\)/.test(DEBIT)
    && /Math\.abs\(montantStripe - montant\) > 0\.009/.test(DEBIT))
  verifie('🔴 et une divergence ne débite RIEN',
    /montant divergent[\s\S]{0,400}?Rien n’a été facturé/.test(DEBIT))
  // ⚠️ LE CLIENT N'EST PAS LÀ : c'est le mandat obtenu à l'enregistrement qui
  // rend ce débit possible.
  verifie('🔴 le débit se fait hors session, confirmé, sur le compte du commerçant',
    /off_session: true/.test(DEBIT) && /confirm: true/.test(DEBIT)
    && /stripeAccount: compte,/.test(DEBIT))
  // 🔴 DEUX CLICS NE DÉBITENT QU'UNE FOIS.
  verifie('🔴 une clé d’idempotence empêche le double débit',
    /idempotencyKey: `empreinte-\$\{rdv\.id\}`/.test(DEBIT))
  // 🔴 UN DÉBIT HORS SESSION PEUT ÊTRE REFUSÉ, et le taire laisserait le
  // restaurateur croire qu'il a été payé.
  verifie('🔴 un refus de la banque est écrit et dit',
    /empreinte_statut: 'echouee'/.test(DEBIT) && /La banque a refusé/.test(DEBIT))
  verifie('⚠️ la base n’est écrite qu’APRÈS Stripe',
    DEBIT.indexOf('stripe.paymentIntents.create') < DEBIT.indexOf("empreinte_statut: 'debitee'"))
  // 🔴 L'ARGENT PARTI SANS TRACE NE SE TAIT PAS.
  verifie('🔴 un débit réussi mais non enregistré est crié dans les journaux',
    /DÉBIT RÉUSSI MAIS NON ENREGISTRÉ/.test(DEBIT))
  verifie('⚠️ sans compte Stripe prêt, la route refuse',
    /stripe_account_charges_enabled === false/.test(DEBIT))

  // ─── CÔTÉ TABLEAU DE BORD ─────────────────────────────────────────────────
  verifie('🔴 marquer un no-show ne facture rien',
    !/empreinte-debiter/.test(DASH.slice(DASH.indexOf("if (statut === 'no_show')"), DASH.indexOf("if (statut === 'no_show')") + 1200)))
  // ⚠️ LA GARDE VISE LE MESSAGE D'ÉCHEC, PAS « UNE ALERTE QUELQUE PART ». Un
  // motif large attrapait l'alerte de SUCCÈS qui suit, et laissait passer un
  // échec avalé en silence : le restaurateur aurait cru avoir été payé. Trouvé
  // par mutation le 14/09.
  verifie('🔴 le geste de facturation est séparé, et il DIT l’échec',
    /postPro\('\/api\/rdv\/empreinte-debiter', \{ rdv_id: rdvId \}\)/.test(DASH)
    && /alert\(j\?\.error \|\|/.test(DASH))
  // ⚠️ UN BOUTON QUI DÉBITE AU PREMIER CLIC DEVIENT UN RÉFLEXE, et un réflexe
  // ne décide rien. La question porte le montant.
  // 🔴 ET PAS UN `window.confirm` : une garde du dépôt l'interdit dans cet
  // écran depuis le 15/08, parce que « OK » et « Annuler » ne disent pas ce
  // qu'ils déclenchent. Chaque bouton porte la phrase de ce qu'il fait.
  verifie('🔴 une question porte le montant avant de prendre l’argent',
    /confirme\(confirmationSimple\(\{\s*titre: `Facturer \$\{euros\(montant\)\}/.test(DASH))
  // ⚠️ ET LE MONTANT S'ÉCRIT AVEC LA FONCTION DU DÉPÔT, jamais à la main : une
  // garde du tableau de bord l'exige depuis le 28/08, parce que l'écran
  // affichait « 52.00€ » quand l'email du client disait « 52,00 € ».
  verifie('⚠️ les montants de l’empreinte passent par euros()',
    /Garantie&nbsp;: \{euros\(montant\)\}/.test(DASH))
  verifie('⚠️ et son bouton de sortie ne fait rien',
    /retour: 'Ne rien facturer'/.test(DASH))
  // 🔴 L'INFORMATION QUI MANQUAIT AU RESTAURATEUR : quelles tables sont
  // couvertes, lesquelles ne le sont pas.
  verifie('🔴 une table sans empreinte le dit',
    /Sans empreinte bancaire/.test(DASH))
  verifie('⚠️ et une table garantie dit que rien n’est débité si elle vient',
    /Rien n&rsquo;est débité si la table vient/.test(DASH))
  verifie('⚠️ le bouton suit la fenêtre du module',
    /raisonDebitImpossible\(rdv, new Date\(\)\)/.test(DASH))
  verifie('🔴 aucune somme annoncée comme bloquée dans l’agenda',
    !/(bloqu|retenu|g[eé]l[eé])\w*\s+(sur\s+)?(ta|ton|sa|son|le|la)\s+(carte|compte)/i.test(DASH))
}

// ─── 10) LE LIEN « CONFIRME TA TABLE » (réservations par téléphone) ─────────
//
// ⚠️ CE N'EST PAS LA TABLE QUI ATTEND, C'EST LE LIEN QUI EXPIRE. Le restaurateur
// au téléphone confirme la réservation ; elle ne dépend pas du clic du client.
{
  const DEMANDE = sansProse(lire('app/api/rdv/empreinte-demander/route.js'))
  const LIEN = sansProse(lire('app/api/stripe/checkout/empreinte-lien/route.js'))
  const WEBHOOK2 = sansProse(lire('app/api/stripe/webhook/route.js'))
  const PAGE = sansProse(lire('app/empreinte/[jeton]/page.js'))
  const DASH2 = sansProse(lire('app/dashboard/page.js'))
  const MAIL = sansProse(lire('lib/resend.js'))

  // ── Les règles, EXÉCUTÉES ──────────────────────────────────────────────
  const demain = { statut: 'confirme', date_rdv: '2026-09-19', heure_debut: '20:00' }
  egal('une table déjà garantie ne se redemande pas',
    raisonDemandeImpossible({ ...demain, empreinte_statut: 'posee' }, new Date('2026-09-18T10:00:00+02:00')), 'deja_garantie')
  egal('une table déjà facturée non plus',
    raisonDemandeImpossible({ ...demain, empreinte_statut: 'debitee' }, new Date('2026-09-18T10:00:00+02:00')), 'deja_debitee')
  egal('une réservation annulée non plus',
    raisonDemandeImpossible({ ...demain, statut: 'annule_client' }, new Date('2026-09-18T10:00:00+02:00')), 'pas_confirmee')
  // 🔴 APRÈS LE DÉBUT DU SERVICE, RÉCLAMER UNE CARTE NE PROTÈGE PLUS RIEN : le
  // client est là, ou il ne viendra pas.
  egal('une fois le service commencé, on ne demande plus rien',
    raisonDemandeImpossible(demain, new Date('2026-09-19T20:30:00+02:00')), 'service_commence')
  verifie('mais la veille, on peut demander',
    peutDemander(demain, new Date('2026-09-18T10:00:00+02:00')) === true)

  // 🔴 L'ÉCHÉANCE S'ARRÊTE AU PLUS TÔT DE SEPT JOURS ET DE LA LIMITE
  // D'ANNULATION. Au-delà, le client donnerait sa carte alors qu'il ne peut
  // déjà plus annuler sans être débité.
  {
    const resto = { categorie: 'alimentaire' }   // 3 h avant le service
    const tot = echeanceLien(demain, resto, new Date('2026-09-18T10:00:00+02:00'))
    egal('🔴 le lien meurt à la limite d’annulation, pas sept jours plus tard',
      tot.toISOString(), '2026-09-19T15:00:00.000Z')
    const loin = { ...demain, date_rdv: '2026-12-25' }
    const sept = echeanceLien(loin, resto, new Date('2026-09-18T10:00:00+02:00'))
    egal('et sur une table lointaine, il vaut sept jours',
      sept.toISOString(), '2026-09-25T08:00:00.000Z')
  }
  verifie('un lien sans échéance est mort, jamais éternel',
    lienValide({}, new Date()) === false)
  verifie('un lien à échéance illisible est mort aussi',
    lienValide({ empreinte_demande_expire_at: 'bientôt' }, new Date()) === false)
  verifie('un lien encore valable est vivant',
    lienValide({ empreinte_demande_expire_at: '2026-09-19T15:00:00Z' }, new Date('2026-09-18T10:00:00Z')) === true)

  // ── La route qui envoie ────────────────────────────────────────────────
  verifie('🔴 la demande prouve qui appelle, sur la ligne visée',
    /gardeSurLigne\(request, supabase, 'rdv_reservations', rdv_id\)/.test(DEMANDE))
  // 🔴 LE JETON EN CLAIR NE VA QU'AU CLIENT : une fuite de la base ne doit pas
  // rendre les liens utilisables.
  verifie('🔴 le jeton est tiré au sort et gardé HACHÉ',
    /randomBytes\(24\)/.test(DEMANDE) && /createHash\('sha256'\)\.update\(jeton\)/.test(DEMANDE))
  verifie('🔴 la base ne reçoit jamais le jeton en clair',
    !/empreinte_demande_jeton_hash: jeton/.test(DEMANDE))
  verifie('🔴 la règle de l’empreinte est rejouée avant d’envoyer',
    /empreinteRequise\(commercant, rdv\.prestation, rdv\.couverts\)/.test(DEMANDE))
  // ⚠️ L'APPEL, PAS L'IMPORT. `envoyerAvecCredit` apparaît d'abord en haut du
  // fichier, dans la liste des imports : comparer les positions du seul nom
  // rendait cette garde FAUSSEMENT ROUGE. Le piège de l'import, déjà nommé.
  verifie('⚠️ le lien est posé AVANT d’être envoyé',
    DEMANDE.indexOf('empreinte_demande_jeton_hash: hash') < DEMANDE.indexOf('await envoyerAvecCredit('))
  // 🔴 UN SMS N'A NI ACCENT NI EMOJI : un caractère hors GSM-7 double le coût,
  // et c'est le commerçant qui paie.
  verifie('🔴 le SMS du lien n’a ni accent ni emoji',
    !/const contenu = `Yoppaa[^`]*[àâäéèêëîïôöùûüç\u{1F300}-\u{1FAFF}]/u.test(DEMANDE))
  verifie('🔴 et il part jusqu’à 23 h, sans exiger la fidélité',
    /exigerFidelite: false, plageHoraire: \{ min: 8, max: 23 \}/.test(DEMANDE))
  // ⚠️ UN ÉCHEC D'ENVOI N'EFFACE PAS LE LIEN : le restaurateur peut le renvoyer
  // par l'autre canal.
  verifie('⚠️ un échec d’envoi laisse le lien valable',
    /LE LIEN RESTE VALABLE|le restaurateur peut le/.test(lire('app/api/rdv/empreinte-demander/route.js')))

  // ── La route que le client ouvre ───────────────────────────────────────
  verifie('🔴 elle retrouve la table par l’EMPREINTE du jeton',
    /createHash\('sha256'\)\.update\(String\(jeton\)\)/.test(LIEN)
    && /\.eq\('empreinte_demande_jeton_hash', hash\)/.test(LIEN))
  verifie('🔴 un lien expiré est refusé', /lienValide\(rdv, new Date\(\)\)/.test(LIEN))
  verifie('🔴 elle rejoue la règle : un réglage a pu changer depuis l’envoi',
    /empreinteRequise\(commercant, rdv\.prestation, rdv\.couverts\)/.test(LIEN))
  verifie('⚠️ elle n’encaisse rien non plus', /mode: 'setup'/.test(LIEN) && /usage: 'off_session'/.test(LIEN))
  // 🔴 LE DRAPEAU QUI EMPÊCHE LE WEBHOOK DE CRÉER UNE TABLE QUI EXISTE, ET IL
  // DOIT ÊTRE DANS `setup_intent_data`. Le webhook lit les métadonnées du
  // SetupIntent (`si.metadata`), jamais celles de la session : un drapeau posé
  // seulement sur la session laisserait créer une table EN DOUBLE, avec la
  // carte du client rattachée à la mauvaise.
  // ⚠️ La garde cherchait le mot n'importe où dans le fichier ; il y figure
  // DEUX fois, et elle restait verte quand on retirait celui qui compte. Le
  // jumeau, deuxième fois aujourd'hui. Trouvé par mutation.
  {
    const iSetup = LIEN.indexOf('setup_intent_data:')
    const iSession = LIEN.indexOf('metadata: buildPaymentMetadata(', LIEN.indexOf('}),', iSetup))
    const zoneSetup = iSetup === -1 ? '' : LIEN.slice(iSetup, iSession === -1 ? undefined : iSession)
    verifie('🔴 elle dit au webhook que la table existe déjà, DANS le SetupIntent',
      /empreinte_sur_existante: '1'/.test(zoneSetup), `zone de ${zoneSetup.length} caractères`)
  }
  verifie('🔴 le webhook pose alors la garantie au lieu de créer',
    /if \(meta\.empreinte_sur_existante === '1'\)/.test(WEBHOOK2)
    && /table prise au téléphone désormais garantie/.test(WEBHOOK2))
  // ⚠️ UNE TABLE DÉJÀ FACTURÉE NE REDEVIENT PAS « GARANTIE » sur un rejeu.
  verifie('🔴 un rejeu n’efface pas un débit qui a eu lieu',
    /if \(cible\.empreinte_statut === 'debitee'\)/.test(WEBHOOK2))
  // ⚠️ LE LIEN EST BRÛLÉ APRÈS USAGE.
  verifie('🔴 le lien est brûlé une fois la carte posée',
    /empreinte_demande_jeton_hash: null/.test(WEBHOOK2))

  // ── Ce que le client lit ───────────────────────────────────────────────
  // 🔴 SA TABLE EST DÉJÀ RÉSERVÉE, et le lui cacher ferait passer Yoppaa pour
  // un service qui prend les tables en otage.
  verifie('🔴 la page dit que la table est DÉJÀ réservée',
    /déjà réservée/.test(PAGE))
  verifie('🔴 et que rien n’est débité s’il vient',
    /Rien n’est débité si tu viens/.test(PAGE))
  verifie('🔴 aucune somme annoncée comme bloquée sur sa carte',
    !/(bloqu|retenu|g[eé]l[eé])\w*\s+(sur\s+)?(ta|ton|sa|son|le|la)\s+(carte|compte)/i.test(PAGE))
  verifie('⚠️ un abandon laisse la table réservée, et le dit',
    /Ta table reste réservée, simplement sans garantie/.test(PAGE))
  verifie('⚠️ l’email dit la même chose que la page',
    /Rien n&rsquo;est débité si tu viens/.test(MAIL) && /Ta table reste réservée même sans ce geste/.test(MAIL))
  verifie('🔴 et l’email n’annonce aucune somme bloquée',
    !/(bloqu|retenu)\w*\s+(sur\s+)?(ta|ton|sa|son)\s+(carte|compte)/i.test(MAIL))

  // ── Le bouton du restaurateur ──────────────────────────────────────────
  verifie('🔴 il peut demander la carte par SMS et par email',
    /onDemanderEmpreinte\(rdv\.id, 'sms'\)/.test(DASH2) && /onDemanderEmpreinte\(rdv\.id, 'email'\)/.test(DASH2))
  verifie('⚠️ le bouton suit la règle du module',
    /peutDemander\(rdv, new Date\(\)\)/.test(DASH2))
  verifie('⚠️ un lien déjà envoyé se voit, et se relance',
    /Lien déjà envoyé par/.test(DASH2) && /Relancer par SMS/.test(DASH2))
  // 🔴 ON LIT VRAIMENT LA RÉPONSE : plus de crédits, heure trop tardive, email
  // absent. Le taire laisserait le restaurateur croire son client relancé.
  verifie('🔴 un envoi raté est DIT au restaurateur',
    /alert\(j\?\.error \|\| 'Le lien n’a pas pu partir/.test(DASH2))
  verifie('⚠️ et le message rappelle que la table reste réservée',
    /Ta table reste réservée tant qu’il n’a pas confirmé/.test(DASH2))
}

// ═══ RÉSULTAT ═══════════════════════════════════════════════════════════════
console.log(`\nEmpreinte de table : ${ok + echecs.length} vérifications`)
if (echecs.length) {
  console.log(`\n🔴 ${echecs.length} en échec :`)
  echecs.forEach(e => console.log('   ✕ ' + e))
  process.exit(1)
}
console.log('Tout passe.')
