// BANC DE L'EMPREINTE BANCAIRE SUR UNE TABLE (lot 4, 14/09/2026)
//
// Il EXÉCUTE les règles plutôt que de chercher des mots : qui doit donner sa
// carte, pour quel montant, et jusqu'à quand le restaurateur peut débiter.
//
// 🔴 CE QUE CE BANC SURVEILLE EN PRIORITÉ, C'EST L'ARGENT QUI PART TOUT SEUL.
// Une empreinte mal bornée débite un client qui était là, et un débit de bonne
// foi revient en contestation de carte que Stripe tranche contre nous.

import { readFileSync, readdirSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  seuilEmpreinte, montantParPersonne, empreinteRequise, montantEmpreinte,
  fenetreDebit, peutDebiter, raisonDebitImpossible,
  EMPREINTE_SEUIL_DEFAUT, EMPREINTE_MONTANT_DEFAUT,
  EMPREINTE_SEUIL_MAX, EMPREINTE_MONTANT_MAX,
  echeanceLien, lienValide, peutDemander, raisonDemandeImpossible,
  estAbsenceFacturable, montantAnnulationFacturable, compteEncaisse, libelleRelance,
  raisonLienImpossible, messageLienImpossible,
} from '../lib/empreinte-table.js'
// 🔴 LA RÈGLE DES COUVERTS, ET LES COLONNES QU'ELLE DÉCLARE LIRE : `capacite`
// manquait dans deux selects, et toute table devenait invalide.
import { couvertsValides, COLONNES_COUVERTS } from '../lib/cours-collectifs.js'
// 🔴 CE QUE LE JETON OUVRE, EXÉCUTÉ CONTRE UNE BASE SIMULÉE : c'est de là que
// sortent le montant affiché au client ET le montant signé chez Stripe.
import { chargerLienEmpreinte } from '../lib/empreinte-lien-serveur.js'

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
// ⚠️ SANS COMPTE STRIPE QUI ENCAISSE, LA DEMANDE ÉCHOUERAIT AU PIRE MOMENT :
// quand le client a déjà sorti sa carte.
verifie('🔴 sans compte Stripe qui encaisse, on ne demande pas de carte',
  empreinteRequise({ ...RESTO, stripe_account_id: null, stripe_account_charges_enabled: null }, TABLE, 8) === false)
// 🔴 LA FICHE PUBLIQUE NE CONNAÎT PAS `stripe_account_id` (15/09, essai E2
// d'Alex). La règle le testait : sur la fiche, elle rendait toujours faux, et
// ce banc restait vert parce que RESTO portait la colonne. Ici, le restaurant
// tel que `commercants_public` le rend, et rien de plus.
const RESTO_VUE = { ...RESTO }
delete RESTO_VUE.stripe_account_id
verifie('🔴 sur la fiche publique, une table de 6 demande bien la carte',
  empreinteRequise(RESTO_VUE, TABLE, 6) === true)
egal('🔴 et la fiche annonce le bon montant', montantEmpreinte(RESTO_VUE, TABLE, 6), 120)
// ⚠️ UNE COLONNE ABSENTE D'UN SELECT NE VAUT PAS UN COMPTE EN ORDRE.
verifie('⚠️ un encaissement inconnu ne déclenche rien',
  empreinteRequise({ ...RESTO_VUE, stripe_account_charges_enabled: undefined }, TABLE, 8) === false)
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
// ⚠️ `statut: 'no_show'` DEPUIS LE 15/09 : on ne facture qu'une absence
// déclarée. Sans lui, tous les essais de fenêtre ci-dessous rendraient
// « pas absente » et ne mesureraient plus la fenêtre.
const POSEE = {
  statut: 'no_show',
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
// 🔴 ET ELLE LE DIT AVEC LE BON MOT (Alex, 16/09, essai G6). Une table facturée
// passe en `debitee`, donc son statut n'est plus `posee` : le test de l'absence
// d'empreinte l'attrapait d'abord et répondait « cette réservation n'a pas
// d'empreinte bancaire », juste sous une carte affichant « Garantie :
// 120,00 € ». Deux phrases contraires sur le même écran, et un restaurateur qui
// pouvait croire sa garantie perdue.
egal('🔴 une table facturée dit « déjà facturée », pas « pas d’empreinte »',
  raisonDebitImpossible({ ...POSEE, empreinte_statut: 'debitee' }, new Date('2026-09-19T21:30:00+02:00')), 'deja_debitee')
egal('⚠️ et un débit refusé reste débitable : la carte peut être remplacée',
  raisonDebitImpossible({ ...POSEE, empreinte_statut: 'echouee' }, new Date('2026-09-19T21:30:00+02:00')), 'aucune_empreinte')
egal('une réservation sans date ne se débite pas',
  raisonDebitImpossible({ empreinte_statut: 'posee' }, new Date()), 'date_illisible')

// ─── 4 bis) ON NE FACTURE QU'UNE ABSENCE (G7, 15/09) ────────────────────────
//
// 🔴 LA RÈGLE NE REGARDAIT PAS LE STATUT : une table honorée ou annulée à temps
// restait facturable jusqu'au lendemain soir. Trouvé en écrivant la liste des
// essais, avant qu'un seul client ne soit débité.
{
  const pendant = new Date('2026-09-19T21:30:00+02:00')
  egal('🔴 une table HONORÉE ne se facture pas',
    raisonDebitImpossible({ ...POSEE, statut: 'honore' }, pendant), 'pas_absente')
  egal('🔴 une table pas encore pointée non plus',
    raisonDebitImpossible({ ...POSEE, statut: 'confirme' }, pendant), 'pas_absente')
  egal('🔴 ni une table annulée À TEMPS par le client',
    raisonDebitImpossible({ ...POSEE, statut: 'annule_client', annulation_tardive: false }, pendant), 'pas_absente')
  egal('ni une table annulée par le restaurateur',
    raisonDebitImpossible({ ...POSEE, statut: 'annule_commercant' }, pendant), 'pas_absente')
  verifie('un no-show déclaré se facture', peutDebiter({ ...POSEE, statut: 'no_show' }, pendant) === true)
  verifie('🔴 une annulation TARDIVE se facture',
    peutDebiter({ ...POSEE, statut: 'annule_client', annulation_tardive: true }, pendant) === true)
  verifie('⚠️ un drapeau tardif absent vaut « à temps », jamais « tardif »',
    estAbsenceFacturable({ statut: 'annule_client' }) === false)
  egal('⚠️ avant le service, on dit « pas commencé », pas « pas absente »',
    raisonDebitImpossible({ ...POSEE, statut: 'confirme' }, new Date('2026-09-19T19:00:00+02:00')), 'service_pas_commence')
}

// ─── 4 ter) L'ANNULATION TARDIVE D'UNE TABLE (H2, 15/09) ────────────────────
//
// 🔴 ELLE ÉTAIT ANNONCÉE ET PAS CONSTRUITE : le réglage, l'email et la page du
// lien disaient « passé ce délai, ton client peut encore annuler », et la route
// refusait. Promettre ce qui n'existe pas, deuxième fois en deux jours.
{
  const { decisionAnnulation } = await import('../lib/rdv-delai-annulation.js')
  const resto = { categorie: 'alimentaire' }
  const table = { date_rdv: '2026-09-19', heure_debut: '20:00', prestation: { par_couverts: true } }
  const aTemps = decisionAnnulation(table, resto, new Date('2026-09-19T15:00:00+02:00'))
  verifie('une table annulée à temps : ni refus, ni retard', !aTemps.refus && !aTemps.tardive)
  const tard = decisionAnnulation(table, resto, new Date('2026-09-19T18:30:00+02:00'))
  verifie('🔴 une table annulée hors délai PASSE, et devient tardive', tard.refus === false && tard.tardive === true)
  egal('et le délai annoncé est celui du restaurant', tard.delaiH, 3)
  verifie('🔴 un salon hors délai reste REFUSÉ',
    decisionAnnulation({ ...table, prestation: { par_couverts: false } }, { categorie: 'vitrine' }, new Date('2026-09-19T18:30:00+02:00')).refus === true)
  verifie('⚠️ une prestation inconnue n’ouvre pas la porte',
    decisionAnnulation({ date_rdv: table.date_rdv, heure_debut: table.heure_debut }, resto, new Date('2026-09-19T18:30:00+02:00')).refus === true)

  const ANNUL = sansProse(lire('app/api/rdv/cancel/route.js'))
  verifie('🔴 la route applique la décision du module',
    /const decision = decisionAnnulation\(rdv, commercant, new Date\(\)\)/.test(ANNUL))
  // ⚠️ DANS L'ÉCRITURE, PAS DANS LA RÉPONSE : `annulation_tardive: tardive`
  // figure deux fois dans la route. Un motif libre resterait vert si l'écriture
  // disparaissait, parce qu'il trouverait la réponse. Le jumeau, vu avant la
  // mutation cette fois.
  {
    const iMaj = ANNUL.indexOf('const updateData = {')
    const zoneMaj = iMaj === -1 ? '' : ANNUL.slice(iMaj, ANNUL.indexOf('}', iMaj))
    verifie('🔴 elle ÉCRIT le retard, sans quoi rien ne serait jamais facturable',
      /annulation_tardive: tardive,/.test(zoneMaj), `zone de ${zoneMaj.length} caractères`)
  }
  verifie('🔴 elle charge ce qu’elle lit (abonnement et empreinte)',
    /abonnement_id, empreinte_statut, empreinte_montant, empreinte_payment_method_id/.test(ANNUL))
  verifie('🔴 l’aperçu répond AVANT toute écriture',
    ANNUL.indexOf('apercu === true') !== -1
    && ANNUL.indexOf('apercu === true') < ANNUL.indexOf('rendreAvantagesRdv(supabase')
    && ANNUL.indexOf('apercu === true') < ANNUL.indexOf('.update(updateData)'))
  // ⚠️ EXÉCUTÉ, PLUS CHERCHÉ (15/09). Le motif `tardive && rdv.empreinte_statut
  // === 'posee'` était aussi CONTENU dans la condition de détachement voisine
  // (`!tardive && …`) : casser le calcul du montant laissait la garde verte.
  // Trouvé par mutation. Le calcul vit maintenant dans le module.
  const garantie = { empreinte_statut: 'posee', empreinte_montant: 120 }
  egal('🔴 une table TARDIVE et garantie annonce son montant',
    montantAnnulationFacturable(garantie, true), 120)
  egal('🔴 une table annulée À TEMPS n’annonce rien', montantAnnulationFacturable(garantie, false), 0)
  egal('🔴 une table tardive SANS carte n’annonce rien',
    montantAnnulationFacturable({ empreinte_statut: null, empreinte_montant: 120 }, true), 0)
  egal('une carte déjà libérée n’annonce rien',
    montantAnnulationFacturable({ empreinte_statut: 'liberee', empreinte_montant: 120 }, true), 0)
  egal('les centimes ne dérivent pas',
    montantAnnulationFacturable({ empreinte_statut: 'posee', empreinte_montant: 86.449999 }, true), 86.45)
  verifie('🔴 et la route appelle CE calcul, sans le refaire',
    /const montantFacturable = montantAnnulationFacturable\(rdv, tardive\)/.test(ANNUL))
  verifie('⚠️ une carte annulée à temps se détache, jamais une carte tardive',
    /if \(!tardive && rdv\.empreinte_statut === 'posee'/.test(ANNUL) && /paymentMethods\.detach\(/.test(ANNUL))
  verifie('🔴 le client lit ce qu’il peut encore payer, sur l’écran de fin',
    /peut facturer \$\{euros\(montantFacturable\)\}/.test(ANNUL))
  verifie('🔴 et dans l’email',
    /tardive_facturable: montantFacturable/.test(ANNUL) && /Annulation tardive/.test(sansProse(lire('lib/resend.js'))))
  const LIENANNUL = sansProse(lire('app/commander/rdv/cancel/page.js'))
  verifie('🔴 l’écran du lien d’email prévient AVANT de confirmer',
    /apercu: true/.test(LIENANNUL) && /apercu\.montant_facturable/.test(LIENANNUL))
  const ESPACE = sansProse(lire('app/commander/page.js'))
  verifie('🔴 l’espace client prévient AVANT de confirmer',
    /client_email: rdv\.client_email, apercu: true/.test(ESPACE)
    && /peut facturer \$\{euros\(Number\(a\.montant_facturable\)\)\}/.test(ESPACE))
  const DEB = sansProse(lire('app/api/rdv/empreinte-debiter/route.js'))
  verifie('🔴 la route de débit CHARGE le retard qu’elle doit lire',
    /id, statut, annulation_tardive,/.test(DEB))
  const DASH3 = sansProse(lire('app/dashboard/page.js'))
  verifie('⚠️ l’agenda dit pourquoi le bouton manque',
    /raison === 'pas_absente' && rdv\.statut === 'confirme'/.test(DASH3))
}

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
  // ⚠️ GARDE RÉORIENTÉE LE 16/09, PAS DÉSARMÉE : elle visait « Connecte
  // d'abord ton compte Stripe », une phrase qui ne parlait pas à celui qui a
  // commencé son inscription sans la finir, et c'était justement lui qui se
  // faisait avoir. Elle exige maintenant la phrase qui couvre les deux cas ET
  // sa conséquence, « aucune carte n'est demandée ».
  verifie('🔴 il prévient quand le compte Stripe n’est pas prêt',
    /stripePret/.test(ECRAN) && /Ton compte Stripe n&rsquo;encaisse pas encore/.test(ECRAN)
    && /aucune carte n&rsquo;est demandée/.test(ECRAN))
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

  // ─── 🔴 CE QUE STRIPE ACCEPTE SE LIT DANS LA BIBLIOTHÈQUE INSTALLÉE ───────
  //
  // Essai E2 d'Alex, 16/09 : « Received unknown parameter:
  // setup_intent_data[usage] ». Stripe refusait l'appel ENTIER, donc aucune
  // carte n'a jamais pu être enregistrée depuis la fiche.
  //
  // 🔴 ET DEUX GARDES EXIGEAIENT CE PARAMÈTRE. Elles décrivaient ce que je
  // croyais de l'API, pas ce que l'API accepte : une garde écrite de mémoire
  // ne vérifie que ma mémoire. Elles lisent maintenant les types de la version
  // installée, comme on lit la doc de Next dans `node_modules`.
  //
  // ⚠️ RIEN N'EST PERDU : un SetupIntent sans `usage` vaut `off_session` par
  // défaut, et c'est lui qui donne le mandat hors session.
  {
    const TYPES = readFileSync(
      new URL('../node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts', import.meta.url), 'utf8')
    const i = TYPES.indexOf('        interface SetupIntentData {')
    const bloc = i === -1 ? '' : TYPES.slice(i, TYPES.indexOf('\n        }', i))
    const permis = [...bloc.matchAll(/^ {12}(\w+)\??:/gm)].map(m => m[1])
    verifie('🔴 les paramètres acceptés sont lus dans stripe installé',
      permis.length >= 3 && permis.includes('metadata'), `lus : ${permis.join(', ') || 'AUCUN'}`)
    verifie('🔴 et `usage` n’en fait PAS partie, contrairement à ce que je croyais',
      !permis.includes('usage'), permis.join(', '))

    // Les clés de premier niveau réellement écrites dans chaque route.
    const clesDe = (src) => {
      const debut = src.indexOf('setup_intent_data: {')
      if (debut === -1) return null
      const cles = []
      let profondeur = 0
      for (let j = debut + 'setup_intent_data:'.length; j < src.length; j++) {
        const c = src[j]
        if (c === '{') { profondeur++; continue }
        if (c === '}') { profondeur--; if (profondeur === 0) break; continue }
        if (profondeur !== 1) continue
        if (!/[\s{,]/.test(src[j - 1] || '')) continue
        // ⚠️ UNE CLÉ COMMENCE PAR UNE LETTRE. Sans cette précision, un ternaire
        // `? 0 : x` était lu comme une clé nommée « 0 » et la garde criait sur
        // du code parfaitement valable. Une alarme qui sonne pour rien ne
        // protège plus rien.
        const m = src.slice(j).match(/^([A-Za-z_]\w*)\s*:/)
        if (m) cles.push(m[1])
      }
      return cles
    }
    for (const [nom, src] of [
      ['la fiche', ROUTE],
      ['le lien « confirme ta table »', sansProse(lire('app/api/stripe/checkout/empreinte-lien/route.js'))],
    ]) {
      const cles = clesDe(src)
      // ⚠️ UNE LISTE VIDE DIRAIT « TOUT VA BIEN » SANS AVOIR RIEN LU : le piège
      // du `every()` sur un tableau vide, déjà nommé dans ce dépôt.
      verifie(`🔴 ${nom} : les clés de setup_intent_data sont lues`,
        Array.isArray(cles) && cles.length > 0, `clés : ${(cles || []).join(', ') || 'AUCUNE'}`)
      for (const cle of cles || []) {
        verifie(`🔴 ${nom} : « ${cle} » est un paramètre que Stripe accepte`,
          permis.includes(cle), `acceptés : ${permis.join(', ')}`)
      }
    }
  }
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
  // 🔴 ET LE COMPTE EN TROISIÈME ARGUMENT (16/09). Cette garde figeait la
  // FORME FAUSSE : `retrieve(id, params, options)` est positionnel, et le
  // compte passé en deuxième partait comme paramètre de requête. Stripe
  // refusait, le webhook levait, la table garantie ne naissait jamais. La garde
  // exigeait exactement l'appel qui ne pouvait pas marcher.
  verifie('🔴 il relit le SetupIntent sur le compte du restaurateur',
    /stripe\.setupIntents\.retrieve\(setupIntentId, undefined,\s*compteConnecte \? \{ stripeAccount: compteConnecte \}/.test(WEBHOOK))
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
  // ⚠️ MÊME CORRECTION QUE SUR LE WEBHOOK : le compte en troisième argument.
  // Cette garde-ci figeait aussi la forme fausse, donc cette route aurait
  // répondu « garantie introuvable chez Stripe » sur CHAQUE no-show.
  verifie('🔴 le montant est comparé à celui que Stripe a gardé',
    /stripe\.setupIntents\.retrieve\(rdv\.empreinte_setup_intent_id, undefined,\s*\{ stripeAccount: compte \}\)/.test(DEBIT)
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
  // 🔴 ET LE BOUTON NO-SHOW N'EXISTE PAS AVANT L'HEURE (Alex, 16/09). Le débit
  // était déjà tenu par sa propre fenêtre, mais un restaurateur qui voit
  // « Facturer » apparaître croit légitimement pouvoir le faire.
  verifie('🔴 l’agenda ne propose pas d’absence avant l’heure du service',
    /const actionsVisibles = statut\.actions\.filter\(a => a !== 'no_show' \|\| noShowPossible\(rdv, new Date\(\)\)\)/.test(DASH)
    && !/\{statut\.actions\.map\(/.test(DASH))
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
  // 🔴 UNE ERREUR DE LECTURE N'EST PAS UNE RÉSERVATION INTROUVABLE (16/09 :
  // « SMS et email ne partent plus »). Une seule colonne invisible pour
  // PostgREST fait échouer TOUTE la requête : `rdv` vaut `null`, et la route
  // annonçait une table disparue alors qu'elle est là. C'est le cas juste après
  // une migration, tant que le cache de schéma n'est pas rechargé.
  for (const [quoi, src] of [
    ['la demande', DEMANDE],
    ['le débit', sansProse(lire('app/api/rdv/empreinte-debiter/route.js'))],
  ]) {
    verifie(`🔴 ${quoi} LIT l’erreur de lecture au lieu de la jeter`,
      /const \{ data: rdv, error: erreurLecture \} = await supabase/.test(src)
      && /if \(erreurLecture\) \{/.test(src))
    verifie(`⚠️ et ${quoi} distingue « illisible » de « introuvable »`,
      src.indexOf('if (erreurLecture) {') < src.indexOf("if (!rdv) return NextResponse.json({ ok: false, error: 'Réservation introuvable.' }"))
  }
  // ⚠️ ET LE DÉBIT DIT QUE RIEN N'A ÉTÉ PRIS : sur une route qui touche à
  // l'argent, le silence sur ce point est une inquiétude de plus.
  verifie('🔴 un débit illisible dit que RIEN n’a été facturé',
    /n’a pas pu être lue[^`]*Rien n’a été facturé/.test(sansProse(lire('app/api/rdv/empreinte-debiter/route.js'))))
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
  // ── 🔴 LE NUMÉRO PART AU FORMAT INTERNATIONAL (16/09, essai F2 d'Alex) ──
  //
  // Brevo n'accepte que `+32470123456`. Le lien « confirme ta table » envoyait
  // le numéro TEL QUE LE RESTAURATEUR L'AVAIT TAPÉ (`0472634325`), donc chaque
  // SMS partait vers un destinataire rejeté. La fidélité ne s'en apercevait pas :
  // ses numéros sont déjà normalisés en base au moment du pointage.
  {
    const { envoyerAvecCredit } = await import('../lib/fidelite-sms.js')
    const SMS = sansProse(lire('lib/fidelite-sms.js'))

    // La normalisation vit dans la PORTE UNIQUE des SMS, avant tout le reste :
    // corriger l'appelant du jour aurait laissé le piège armé pour le suivant.
    const iNormalise = SMS.indexOf('const destinataire = normaliserTelephone(telephone)')
    verifie('🔴 la porte unique des SMS normalise le numéro',
      iNormalise !== -1 && iNormalise < SMS.indexOf("rpc('consommer_sms_credit'"))
    verifie('🔴 et c’est CE numéro qui part chez Brevo',
      /envoyerSms\(\{ to: destinataire, contenu: versGsm7\(contenu\) \}\)/.test(SMS))

    // 🔴 UN NUMÉRO INVALIDE NE COÛTE PAS UN CRÉDIT : le refus vient avant la
    // consommation. Exécuté, avec une base simulée qui compte les appels.
    let appelsRpc = 0
    const baseSms = { rpc: (nom) => { appelsRpc++; return Promise.resolve({ data: 1, error: null, nom }) } }
    const refus = await envoyerAvecCredit(baseSms, { id: 'c1', fidelite_sms_actif: true }, '12345', 'coucou',
      { exigerFidelite: false, plageHoraire: { min: 0, max: 24 } })
    egal('🔴 un numéro invalide est refusé', refus.raison, 'telephone_invalide')
    egal('🔴 et il n’a coûté AUCUN crédit', appelsRpc, 0)
    // ⚠️ ET LE RESTAURATEUR APPREND QUOI CORRIGER : sans ce message, il lisait
    // « le SMS n'a pas pu partir » sans savoir quoi faire.
    verifie('🔴 la route nomme cette cause',
      /telephone_invalide: 'Ce numéro n’est pas un numéro belge valable/.test(DEMANDE))
  }

  // ── 🔴 LE SMS TIENT EN GSM-7, QUOI QU'ON Y METTE (16/09) ────────────────
  //
  // ⚠️ GARDE REMPLACÉE, PAS RETIRÉE. Elle interdisait TOUT accent dans le
  // gabarit : prudent, mais faux (l'alphabet accepte `à é è ù`) et surtout
  // AVEUGLE à ce qui coûte vraiment — le nom du commerce, qui est interpolé.
  // Une « Crêperie » doublait le coût de chacun de ses SMS sans que rien ne le
  // voie. La porte unique traduit désormais le message COMPLET, et le banc
  // EXÉCUTE cette traduction.
  {
    const { versGsm7, estGsm7, segments } = await import('../lib/gsm7.js')
    egal('🔴 l’apostrophe typographique devient la droite', versGsm7('n’est'), "n'est")
    egal('🔴 un accent hors alphabet perd sa marque, pas sa lettre', versGsm7('Crêperie du Goût'), 'Creperie du Gout')
    egal('⚠️ mais les accents ADMIS sont gardés', versGsm7('débité à 20:00 où ça'), 'débité à 20:00 où ca')
    egal('⚠️ un emoji disparaît au lieu de doubler le coût', versGsm7('Bravo 🎉'), 'Bravo ')
    egal('⚠️ l’espace insécable devient une espace ordinaire', versGsm7('120,00 EUR'), '120,00 EUR')
    verifie('🔴 tout ce qui sort est représentable en GSM-7',
      [...versGsm7('Crêperie « Le Goût » – 5 € 🎉 n’est')].every(estGsm7))
    // ⚠️ ET LE MESSAGE DU LIEN TIENT EN DEUX SEGMENTS, comme avant : écrire en
    // français correct ne coûte pas un segment de plus.
    const exemple = `Yoppaa - La Table d'Essai : confirme ta table du 19/09 à 20:00 en enregistrant ta carte. Rien n'est débité si tu viens, 120,00 EUR seulement en cas d'absence ou d'annulation tardive. https://www.yoppaa.app/empreinte/${'a'.repeat(32)}`
    verifie('🔴 le SMS du lien tient en deux segments', segments(exemple) <= 2, `${segments(exemple)} segments`)
  }
  verifie('🔴 la porte unique met le message en GSM-7 avant l’envoi',
    /await envoyerSms\(\{ to: destinataire, contenu: versGsm7\(contenu\) \}\)/.test(sansProse(lire('lib/fidelite-sms.js'))))
  verifie('🔴 et il part jusqu’à 23 h, sans exiger la fidélité',
    /exigerFidelite: false, plageHoraire: \{ min: 8, max: 23 \}/.test(DEMANDE))
  // 🔴 LE SMS NE DISAIT PAS LE MONTANT (16/09) : prévenu par SMS, le client
  // arrivait sur la page sans avoir jamais lu ce qu'il garantissait.
  verifie('🔴 le SMS dit le montant garanti', /\$\{eurosNus\(montant\)\} EUR/.test(DEMANDE))
  // ⚠️ AVEC `eurosNus` ET JAMAIS `euros` : celui-ci pose une espace insécable,
  // hors GSM-7, qui ferait basculer le message entier en UCS-2.
  verifie('⚠️ et il ne passe pas par euros(), dont l’espace est insécable',
    !/euros\(montant\)\} EUR/.test(DEMANDE))
  // 🔴 « TA TABLE DU 2026-09-19 » : la date brute de la base partait au client,
  // par SMS ET par email. Le SMS a la sienne, en chiffres, sans accent.
  verifie('🔴 le SMS a sa propre date, en chiffres',
    /confirme ta table du \$\{quandSms\}/.test(DEMANDE))
  verifie('🔴 et l’email lit une date en toutes lettres',
    /toLocaleDateString\('fr-BE', \{ weekday: 'long'/.test(DEMANDE))
  // ⚠️ UN ÉCHEC D'ENVOI N'EFFACE PAS LE LIEN : le restaurateur peut le renvoyer
  // par l'autre canal.
  verifie('⚠️ un échec d’envoi laisse le lien valable',
    /LE LIEN RESTE VALABLE|le restaurateur peut le/.test(lire('app/api/rdv/empreinte-demander/route.js')))
  // 🔴 MAIS IL N'ANNONCE PLUS QU'IL EST PARTI (16/09, essai F2 bis d'Alex :
  // numéro erroné, le SMS ne part pas, et l'agenda affiche « Relancer par
  // SMS »). L'agenda lit `empreinte_demande_at` pour dire « lien déjà envoyé,
  // pas encore confirmé » : posé AVANT l'envoi, ce champ ment dès que l'envoi
  // échoue, et le restaurateur croit son client prévenu.
  {
    const effacements = [...DEMANDE.matchAll(/empreinte_demande_at: null, empreinte_demande_canal: null/g)].length
    egal('🔴 un envoi raté efface la trace de l’ENVOI, dans les DEUX canaux', effacements, 2)
    // ⚠️ LE JETON ET L'ÉCHÉANCE SURVIVENT : le lien reste utilisable s'il a
    // malgré tout atteint le client, et le restaurateur peut le renvoyer.
    verifie('⚠️ mais ni le jeton ni l’échéance ne sont effacés',
      !/empreinte_demande_at: null[^}]*empreinte_demande_jeton_hash: null/.test(DEMANDE)
      && !/empreinte_demande_expire_at: null/.test(DEMANDE))
  }

  // ── CE QUE LE JETON OUVRE, EXÉCUTÉ ─────────────────────────────────────
  //
  // 🔴 LE MONTANT LU ET LE MONTANT SIGNÉ SORTENT DU MÊME MODULE (16/09). Deux
  // copies de ce calcul, c'est le jour où la page annonce 120 € et où le mandat
  // part sur 160 : le client conteste, et il gagne.
  {
    const QUAND = new Date('2026-09-18T10:00:00+02:00')
    const JETON = 'a'.repeat(32)
    const RDV_LIEN = {
      id: 'r1', statut: 'confirme', date_rdv: '2026-09-19', heure_debut: '20:00:00', couverts: 8,
      empreinte_statut: null, empreinte_demande_expire_at: '2026-09-19T15:00:00Z',
      prestation: TABLE, commercant: { ...RESTO, id: 'c1', nom: 'Kebabistro' },
    }
    // ⚠️ LA BASE EST SIMULÉE, MAIS LA RÈGLE EST LA VRAIE : on retient le SELECT
    // pour vérifier ce que la lecture demande vraiment.
    let selectVu = ''
    const base = (data, error = null) => ({
      from: () => ({
        select: (s) => {
          selectVu = s
          return { eq: () => ({ is: () => ({ maybeSingle: async () => ({ data, error }) }) }) }
        },
      }),
    })

    const ouvert = await chargerLienEmpreinte(base(RDV_LIEN), JETON, {}, QUAND)
    egal('🔴 le lien ouvert rend le montant garanti', ouvert.montant, 160)
    egal('et le nom du restaurant qui l’a demandé', ouvert.commercant?.nom, 'Kebabistro')
    // 🔴 LE JETON EST UNE CLÉ, PAS UNE PREUVE D'IDENTITÉ : il se transfère, se
    // lit par-dessus une épaule et reste dans un historique. Les coordonnées du
    // client ne sont donc même pas DEMANDÉES à la base pour l'affichage.
    verifie('🔴 pour afficher, les coordonnées ne sont même pas lues',
      !/client_email|client_telephone|client_nom|client_prenom/.test(selectVu), `select de ${selectVu.length} caractères`)
    await chargerLienEmpreinte(base(RDV_LIEN), JETON, { avecClient: true }, QUAND)
    verifie('⚠️ et seule la création du client Stripe les demande',
      /client_email/.test(selectVu))

    const code = async (data, erreur = null, quand = QUAND) =>
      (await chargerLienEmpreinte(base(data, erreur), JETON, {}, quand)).code
    egal('un jeton trop court n’atteint même pas la base',
      (await chargerLienEmpreinte(base(RDV_LIEN), 'court', {}, QUAND)).code, 'invalide')
    egal('un jeton inconnu est refusé', await code(null), 'inconnu')
    // 🔴 UNE LECTURE EN ERREUR N'EST PAS UN JETON INCONNU : l'ancienne route
    // jetait l'erreur, et une base indisponible envoyait le client rappeler son
    // restaurant pour un lien parfaitement bon.
    egal('🔴 une lecture en erreur ne se lit pas « lien invalide »',
      await code(null, { message: 'boum' }), 'lecture')
    egal('un lien périmé est refusé',
      await code({ ...RDV_LIEN, empreinte_demande_expire_at: '2026-09-17T10:00:00Z' }), 'expire')
    egal('une table déjà garantie ne redemande pas de carte',
      await code({ ...RDV_LIEN, empreinte_statut: 'posee' }), 'deja_garantie')
    // 🔴 MÊME QUAND LE LIEN A EXPIRÉ DEPUIS (16/09, essai F5). Le client qui
    // rouvre son lien veut savoir que sa carte est posée, pas que son lien est
    // périmé : l'échéance ne l'intéresse plus une fois qu'elle a servi.
    egal('🔴 et elle le dit même si le lien a expiré entre-temps',
      await code({ ...RDV_LIEN, empreinte_statut: 'posee', empreinte_demande_expire_at: '2026-09-17T10:00:00Z' }),
      'deja_garantie')
    egal('un restaurant qui n’encaisse pas ne demande pas de carte',
      await code({ ...RDV_LIEN, commercant: { ...RESTO, stripe_account_charges_enabled: false } }), 'stripe_absent')
    // 🔴 LE RÉGLAGE A PU CHANGER DEPUIS L'ENVOI : la règle est rejouée à chaque
    // ouverture, sinon on prendrait une garantie qui n'a plus de base.
    egal('🔴 une table repassée sous le seuil ne demande plus rien',
      await code({ ...RDV_LIEN, couverts: 4 }), 'plus_demandee')
  }

  // ── Les deux routes partent du même module ─────────────────────────────
  const MODULE = sansProse(lire('lib/empreinte-lien-serveur.js'))
  const DETAILS = sansProse(lire('app/api/rdv/empreinte-details/route.js'))

  verifie('🔴 il retrouve la table par l’EMPREINTE du jeton',
    /createHash\('sha256'\)\.update\(String\(jeton\)\)/.test(MODULE)
    && /\.eq\('empreinte_demande_jeton_hash', hash\)/.test(MODULE))
  verifie('🔴 un lien expiré est refusé', /lienValide\(rdv, maintenant\)/.test(MODULE))
  verifie('🔴 il rejoue la règle : un réglage a pu changer depuis l’envoi',
    /empreinteRequise\(commercant, rdv\.prestation, rdv\.couverts\)/.test(MODULE))
  // 🔴 C'EST LA DIVERGENCE ELLE-MÊME QU'ON INTERDIT, PAS SON SYMPTÔME : aucune
  // des deux routes ne recalcule le montant dans son coin.
  for (const [quoi, src] of [['la saisie de carte', LIEN], ['l’affichage', DETAILS]]) {
    verifie(`🔴 ${quoi} prend son montant dans le module partagé`,
      /chargerLienEmpreinte\(supabase, jeton/.test(src) && !/montantEmpreinte\(/.test(src))
  }
  verifie('🔴 la route qui affiche ne rend aucune donnée personnelle',
    !/client_email|client_nom|client_prenom|client_telephone/.test(DETAILS))
  verifie('⚠️ et elle ne les demande pas non plus à la base',
    /avecClient: false/.test(DETAILS))
  verifie('⚠️ elle n’ouvre rien chez Stripe', !/stripe\./.test(DETAILS))
  // ⚠️ `mode: 'setup'` EST CE QUI GARANTIT QU'ON N'ENCAISSE RIEN, et c'est la
  // seule chose à exiger ici. Cette garde réclamait aussi `usage: 'off_session'`,
  // un paramètre que Stripe REFUSE : elle a tenu deux jours un appel qui ne
  // pouvait pas aboutir. Les clés sont désormais confrontées aux types installés,
  // plus haut dans ce banc.
  verifie('⚠️ elle n’encaisse rien non plus', /mode: 'setup'/.test(LIEN))
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
  // ⚠️ GARDE RÉORIENTÉE LE 16/09, PAS DÉSARMÉE. Elle exigeait l'effacement du
  // jeton après usage, « pour que le lien ne serve pas deux fois ». Mais ce
  // n'était PAS lui qui protégeait : la règle refuse « déjà garantie » avant
  // d'ouvrir la moindre session Stripe, jeton ou pas. L'effacement, lui,
  // coûtait la vérité au client : rouvrant son lien, il ne tombait sur aucune
  // ligne, donc sur « ce lien n'est pas valable », et pouvait croire sa table
  // non garantie. La garde vise maintenant ce qui protège VRAIMENT.
  verifie('🔴 une table déjà garantie ne rouvre AUCUNE saisie de carte',
    /if \(raison === 'deja_garantie'\)/.test(MODULE)
    && MODULE.indexOf("raison === 'deja_garantie'") < MODULE.indexOf('return { ok: true, rdv, commercant, montant }'))
  // 🔴 ET ELLE LE DIT AVANT DE PARLER D'ÉCHÉANCE : une carte posée rend
  // l'expiration du lien sans intérêt pour le client.
  verifie('🔴 « déjà garantie » se dit AVANT « expiré »',
    MODULE.indexOf("raison === 'deja_garantie'") < MODULE.indexOf('!lienValide(rdv, maintenant)'))
  verifie('⚠️ et le jeton n’est plus effacé, sinon la ligne serait introuvable',
    !/empreinte_demande_jeton_hash: null/.test(WEBHOOK2))

  // ── Ce que le client lit ───────────────────────────────────────────────
  // 🔴 SA TABLE EST DÉJÀ RÉSERVÉE, et le lui cacher ferait passer Yoppaa pour
  // un service qui prend les tables en otage.
  verifie('🔴 la page dit que la table est DÉJÀ réservée',
    /déjà réservée/.test(PAGE))
  verifie('🔴 et que rien n’est débité s’il vient',
    /Rien n’est débité si tu viens/.test(PAGE))
  // 🔴 ELLE NE DISAIT PAS LE MONTANT (16/09) : le client donnait sa carte sans
  // savoir ce qu'il engageait. L'email le disait, le SMS non, la page jamais.
  verifie('🔴 la page dit le montant garanti',
    /Le restaurant ne peut facturer \$\{euros\(details\.montant\)\}/.test(PAGE))
  verifie('🔴 et elle le demande au serveur, jamais au client',
    /fetch\('\/api\/rdv\/empreinte-details'/.test(PAGE))
  // 🔴 UN BOUTON AFFICHÉ AVANT LA SOMME, C'EST UNE SIGNATURE AVANT LECTURE.
  // Tout le reste de la page peut attendre ; le geste, non.
  {
    const iAttente = PAGE.indexOf('if (!details) {')
    verifie('🔴 aucun bouton tant que le montant n’est pas connu',
      iAttente !== -1 && iAttente < PAGE.indexOf('Enregistrer ma carte'),
      `attente en ${iAttente}, bouton en ${PAGE.indexOf('Enregistrer ma carte')}`)
  }
  // ⚠️ ET UN LIEN MORT SE DIT AVANT LE CLIC, pas après : le client cliquait,
  // puis apprenait que son lien avait expiré.
  verifie('⚠️ un lien qui ne peut plus servir le dit avant le clic',
    /if \(refus\) \{/.test(PAGE) && /TITRES\[refus\.code\]/.test(PAGE))
  verifie('🔴 aucune somme annoncée comme bloquée sur sa carte',
    !/(bloqu|retenu|g[eé]l[eé])\w*\s+(sur\s+)?(ta|ton|sa|son|le|la)\s+(carte|compte)/i.test(PAGE))
  verifie('⚠️ un abandon laisse la table réservée, et le dit',
    /Ta table reste réservée, simplement sans garantie/.test(PAGE))
  verifie('⚠️ l’email dit la même chose que la page',
    /Rien n&rsquo;est débité si tu viens/.test(MAIL) && /Ta table reste réservée même sans ce geste/.test(MAIL))

  // ── 🔴 L'EMAIL DE CONFIRMATION, EXÉCUTÉ (16/09, essai E6 d'Alex) ────────
  //
  // Le client venait d'enregistrer sa carte, la fiche lui avait annoncé 120 €,
  // et sa confirmation n'en disait pas un mot. C'est pourtant l'écrit qu'il
  // garde, et celui qu'il ressortira le jour d'un débit.
  //
  // 🔴 ET ELLE LUI PROMETTAIT « REMBOURSEMENT AUTOMATIQUE DE L'ACOMPTE EN 5 À
  // 10 JOURS » sur une table qui n'a jamais rien payé. Un client qui attend un
  // virement qui ne viendra pas rappelle son restaurant, puis conteste.
  {
    const { emailRdvConfirme } = await import('../lib/resend.js')
    const base = {
      yopper_prenom: 'Alexandre', commercant_nom: 'La Table d’Essai',
      commercant_adresse: 'Place Joseph Meunier 18, 5640 Mettet',
      prestation_nom: 'Table de 6 personnes', date_rdv: '2026-09-19',
      heure_debut: '20:00', heure_fin: '22:30', duree_minutes: 150,
      delai_annulation_heures: 3, annulation_token: 'jeton-essai',
      commercant_categorie: 'alimentaire', table: true, couverts: 6,
    }
    // ⚠️ LE MONTANT ATTENDU VIENT DE `euros()`, jamais écrit à la main : son
    // espace est INSÉCABLE (U+00A0), et une garde qui tape une espace normale
    // rougit sur un email parfaitement correct. Elle m'a eu tout de suite.
    const { euros } = await import('../lib/montants.js')
    const garantie = emailRdvConfirme({ ...base, empreinte_montant: 120 })
    verifie('🔴 l’email de confirmation DIT le montant garanti',
      /Garantie/.test(garantie) && garantie.includes(euros(120)))
    verifie('🔴 et qu’il n’est pas débité si le client vient',
      /Rien n&rsquo;est débité si tu viens/.test(garantie))
    verifie('🔴 le bloc d’annulation redit ce que le restaurant peut facturer',
      /ne peut facturer [^<]*120,00/.test(garantie))
    // 🔴 LE DÉFAUT EXACT VU PAR ALEX.
    verifie('🔴 et il ne promet AUCUN remboursement d’acompte',
      !/Remboursement automatique de l'acompte/.test(garantie))

    // Une table sans garantie et sans acompte ne promet rien non plus.
    const nue = emailRdvConfirme({ ...base })
    verifie('🔴 une table sans acompte ne promet pas de remboursement',
      !/Remboursement automatique de l'acompte/.test(nue) && !/acompte revient/.test(nue))
    verifie('⚠️ et elle n’affiche aucune garantie', !/Garantie/.test(nue))
    // ⚠️ MAIS UN VRAI ACOMPTE SE DIT TOUJOURS : la phrase n'a pas disparu, elle
    // ne s'écrit plus que quand elle est vraie.
    const avecAcompte = emailRdvConfirme({ ...base, acompte_paye: true, acompte_montant: 15, prix_estime: 60 })
    verifie('⚠️ un acompte réellement payé annonce son remboursement',
      /acompte revient sur ton moyen de paiement/.test(avecAcompte))
  }

  // ── Les DEUX expéditeurs du même email chargent et passent la garantie ──
  //
  // ⚠️ CES DEUX-LÀ ONT DÉJÀ DIVERGÉ : le webhook s'est tu sur les produits, puis
  // sur la catégorie. Même email, deux chemins : ce qui n'est pas comparé dérive.
  for (const [quoi, chemin] of [
    ['le webhook', 'app/api/stripe/webhook/route.js'],
    ['la route d’emails', 'app/api/emails/rdv-confirme/route.js'],
  ]) {
    const src = sansProse(lire(chemin))
    verifie(`🔴 ${quoi} CHARGE l’empreinte de la réservation`,
      /empreinte_statut, empreinte_montant/.test(src), chemin)
    verifie(`🔴 ${quoi} PASSE le montant garanti au gabarit`,
      /empreinte_montant:\s*rdv\.empreinte_statut === 'posee' \? Number\(rdv\.empreinte_montant\) \|\| 0 : 0/.test(src), chemin)
  }
  verifie('🔴 et l’email n’annonce aucune somme bloquée',
    !/(bloqu|retenu)\w*\s+(sur\s+)?(ta|ton|sa|son)\s+(carte|compte)/i.test(MAIL))

  // ── Le bouton du restaurateur ──────────────────────────────────────────
  verifie('🔴 il peut demander la carte par SMS et par email',
    /onDemanderEmpreinte\(rdv\.id, 'sms'\)/.test(DASH2) && /onDemanderEmpreinte\(rdv\.id, 'email'\)/.test(DASH2))
  // ⚠️ GARDE SUIVIE, PAS DÉSARMÉE (16/09) : elle visait `peutDemander`, qui ne
  // connaît que l'heure du SERVICE. Le lien, lui, meurt à la limite
  // d'annulation, plus tôt. Entre les deux, l'écran offrait un bouton que le
  // serveur refusait à tous les coups. La règle complète est
  // `raisonLienImpossible`, et l'écran pose désormais la MÊME question.
  verifie('⚠️ le bouton suit la règle du module',
    /const raisonLien = raisonLienImpossible\(rdv, commercant, new Date\(\)\)/.test(DASH2))
  // ── 🔴 COMBIEN DE FOIS LE LIEN EST PARTI (demande d'Alex, 16/09) ────────
  //
  // « Lien déjà envoyé » ne disait pas COMBIEN DE FOIS : le restaurateur ne
  // savait pas s'il relançait pour la première ou la quatrième, et au bout d'un
  // moment on décroche son téléphone au lieu de renvoyer un lien.
  verifie('⚠️ un lien déjà envoyé se voit, et se relance',
    /libelleRelance\(\{ envois: rdv\.empreinte_demande_envois, canal: rdv\.empreinte_demande_canal \}\)/.test(DASH2)
    && /Relancer par SMS/.test(DASH2))
  egal('la première fois se dit sans chiffre',
    libelleRelance({ envois: 1, canal: 'sms' }), 'Lien envoyé par SMS, pas encore confirmé.')
  egal('🔴 les suivantes portent le compte',
    libelleRelance({ envois: 3, canal: 'sms' }), 'Lien envoyé 3 fois, le dernier par SMS, pas encore confirmé.')
  egal('et le canal suit le dernier envoi',
    libelleRelance({ envois: 2, canal: 'email' }), 'Lien envoyé 2 fois, le dernier par email, pas encore confirmé.')
  // ⚠️ UN COMPTEUR ABSENT OU NUL NE DOIT PAS ÉCRIRE « 0 fois » : les deux formes
  // de l'absence, comme partout.
  egal('⚠️ un compteur absent se lit comme un premier envoi',
    libelleRelance({ canal: 'sms' }), 'Lien envoyé par SMS, pas encore confirmé.')
  egal('⚠️ et un compteur illisible aussi',
    libelleRelance({ envois: 'trois', canal: 'sms' }), 'Lien envoyé par SMS, pas encore confirmé.')
  // 🔴 MAIS UN NOMBRE RENDU EN TEXTE COMPTE QUAND MÊME. Une colonne `integer`
  // peut revenir en chaîne selon le chemin de lecture, et « 3 » n'est pas une
  // absence : le lire comme tel afficherait « envoyé par SMS » sur une table
  // relancée trois fois. Trouvé par mutation, mon jeu d'essais ne le couvrait pas.
  egal('🔴 un compte rendu en texte compte quand même',
    libelleRelance({ envois: '3', canal: 'sms' }), 'Lien envoyé 3 fois, le dernier par SMS, pas encore confirmé.')
  // 🔴 ON NE COMPTE QUE CE QUI EST PARTI : l'incrément vient APRÈS l'envoi, dans
  // les deux canaux, et jamais sur un échec.
  {
    const iEchecSms = DEMANDE.indexOf('code: res.raison, error: pourquoi')
    const iCompteSms = DEMANDE.indexOf('const envois = await compterEnvoi(supabase, rdv)')
    verifie('🔴 un envoi raté ne compte pas comme une relance',
      iCompteSms !== -1 && iEchecSms !== -1 && iEchecSms < iCompteSms)
    egal('🔴 les DEUX canaux comptent leur envoi',
      [...DEMANDE.matchAll(/await compterEnvoi\(supabase, rdv\)/g)].length, 2)
    // ⚠️ ET L'ÉCRAN SUIT SANS RECHARGEMENT : sans l'incrément local, le
    // restaurateur relance et relit « envoyé par SMS » comme si rien n'avait
    // changé. Il relancerait une troisième fois.
    verifie('⚠️ le compte suit l’écran dès la relance',
      /empreinte_demande_envois: \(Number\(r\.empreinte_demande_envois\) \|\| 0\) \+ 1,/.test(DASH2))
    verifie('⚠️ et un compteur non écrit ne fait pas échouer l’envoi',
      /compteur non incrémenté/.test(DEMANDE) && !/throw/.test(
        DEMANDE.slice(DEMANDE.indexOf('async function compterEnvoi'), DEMANDE.indexOf('export async function POST'))))
  }
  // 🔴 ON LIT VRAIMENT LA RÉPONSE : plus de crédits, heure trop tardive, email
  // absent. Le taire laisserait le restaurateur croire son client relancé.
  // ⚠️ GARDE SUIVIE, PAS DÉSARMÉE (16/09) : le message n'a pas disparu, il a
  // changé de fenêtre. Un `alert()` du navigateur porte l'adresse du site et un
  // bouton « OK » qui ne dit rien ; `confirmationInfo` annonce dans les couleurs
  // du produit, avec un seul bouton qui EST la sortie.
  verifie('🔴 un envoi raté est DIT au restaurateur',
    /message: j\?\.error \|\| 'Le lien n’a pas pu partir/.test(DASH2)
    && /titre: canal === 'sms' \? 'Le SMS n’est pas parti'/.test(DASH2))
  // ⚠️ ET IL PARLE AU RESTAURATEUR, DE LA TABLE DE SON CLIENT (Alex, 16/09 :
  // « le message n'est pas clair pour moi »). Il disait « TA table » à celui
  // qui tient le restaurant, et expliquait un mécanisme — « le lien la garantit,
  // il ne la crée pas » — au lieu de dire ce qui va se passer.
  verifie('⚠️ et le message rappelle que la table reste réservée',
    /S’il ne clique pas, elle le reste, simplement sans garantie/.test(DASH2)
    && /La table reste réservée\. Tu peux corriger le numéro/.test(DASH2))
  verifie('🔴 et il ne tutoie plus le restaurateur sur la table de son client',
    !/Ta table reste réservée/.test(DASH2))
  // 🔴 PLUS AUCUN `alert()` SUR CE GESTE : c'est celui que le restaurateur voit
  // le plus souvent, et c'était le plus laid.
  verifie('🔴 la demande d’empreinte ne passe plus par une fenêtre du navigateur',
    !/alert\(/.test(DASH2.slice(DASH2.indexOf('async function demanderEmpreinte'),
      DASH2.indexOf('async function facturerEmpreinte'))))

  // ── « CE COMPTE ENCAISSE-T-IL ? », UNE SEULE DÉFINITION ────────────────
  //
  // 🔴 L'ÉCRAN DE RÉGLAGE LE DEMANDAIT PLUS LARGEMENT QUE LA RÈGLE (16/09) :
  // « un identifiant posé et l'encaissement pas FAUX » contre « l'encaissement
  // VRAI ». Entre les deux vit l'inscription Stripe commencée et non terminée.
  // Le restaurateur cochait « demander une empreinte », lisait une confirmation
  // chiffrée, et aucune carte n'était jamais demandée.
  const CONFIG = sansProse(lire('app/dashboard/ConfigDashboard.js'))

  verifie('un compte qui encaisse est prêt', compteEncaisse({ stripe_account_charges_enabled: true }) === true)
  verifie('un compte refusé ne l’est pas', compteEncaisse({ stripe_account_charges_enabled: false }) === false)
  // 🔴 LES DEUX FORMES DE L'ABSENCE, ENCORE : `null` est une inscription
  // commencée, une colonne manquante est un select incomplet. Ni l'une ni
  // l'autre n'est un compte en ordre.
  verifie('🔴 une inscription commencée n’est PAS un compte en ordre',
    compteEncaisse({ stripe_account_id: 'acct_1', stripe_account_charges_enabled: null }) === false)
  verifie('🔴 une colonne absente non plus', compteEncaisse({ stripe_account_id: 'acct_1' }) === false)
  verifie('et pas de commerçant du tout non plus', compteEncaisse(undefined) === false)
  // La règle de la fiche publique pose la même question, par la même fonction.
  verifie('🔴 la règle pose la question par cette fonction',
    empreinteRequise({ ...RESTO, stripe_account_charges_enabled: null }, TABLE, 8) === false
    && /if \(!compteEncaisse\(commercant\)\) return false/.test(sansProse(lire('lib/empreinte-table.js'))))

  verifie('🔴 l’écran de réglage pose la MÊME question que la règle',
    /const stripePret = compteEncaisse\(commercant\)/.test(CONFIG))
  verifie('🔴 et plus jamais la version large qui laissait passer l’inscription en cours',
    !/stripe_account_charges_enabled !== false/.test(CONFIG))
  // 🔴 LA PHRASE QU'IL LIT ET QU'IL CROIT : elle annonçait « dès 6 personnes,
  // 20 € par personne » là où aucune carte ne serait demandée.
  verifie('🔴 la confirmation ne promet pas une protection qui n’existe pas',
    /Réglage enregistré, mais aucune carte ne sera demandée/.test(CONFIG))
  verifie('⚠️ et l’avertissement parle aussi à qui a commencé son inscription',
    /Ton compte Stripe n&rsquo;encaisse pas encore/.test(CONFIG))

  // 🔴 LE REFUS NOMME LA BONNE CAUSE. Le message envoyait le restaurateur
  // vérifier son réglage et ses couverts, tous deux parfaits.
  {
    const iStripe = DEMANDE.indexOf('if (!compteEncaisse(commercant)) {')
    verifie('🔴 la demande refuse d’abord sur le compte, et le DIT',
      iStripe !== -1 && iStripe < DEMANDE.indexOf('if (!empreinteRequise(commercant')
      && /Ton compte Stripe n’encaisse pas encore/.test(DEMANDE))
  }
  // ⚠️ L'AGENDA EXPLIQUE AU LIEU D'OFFRIR UN BOUTON QUI SERA REFUSÉ. La route
  // refuse de toute façon : cette ligne informe, elle ne protège pas.
  verifie('⚠️ l’agenda ne propose plus un lien qui ne partirait pas',
    /\{onDemanderEmpreinte && stripePret && !raisonLien && \(/.test(DASH2))
  // 🔴 ET IL DIT POURQUOI À LA PLACE DU BOUTON : un bouton qui disparaît sans
  // raison laisse croire à une panne, et le restaurateur recharge pour rien.
  verifie('🔴 et la raison remplace le bouton',
    /\{onDemanderEmpreinte && messageLienImpossible\(raisonLien\) && \(/.test(DASH2))
  // ⚠️ LE COMMERÇANT DOIT ARRIVER JUSQUE-LÀ : sans lui, le délai d'annulation
  // retombe sur son défaut de 24 h, et les boutons disparaîtraient un jour trop
  // tôt sur toutes les tables.
  verifie('🔴 et le commerçant est passé jusqu’à la carte',
    /<EmpreinteRdv rdv=\{rdv\}[^>]*commercant=\{commercant\}/.test(DASH2)
    && /stripePret=\{compteEncaisse\(commercant\)\} commercant=\{commercant\}/.test(DASH2))
  // La règle, EXÉCUTÉE : c'est le cas exact qu'Alex a rencontré.
  {
    const resto3h = { categorie: 'alimentaire' }   // 3 h de délai
    const tableCeSoir = { statut: 'confirme', date_rdv: '2026-09-16', heure_debut: '19:00' }
    egal('🔴 à 16 h 01 pour une table de 19 h, le lien piégerait le client',
      raisonLienImpossible(tableCeSoir, resto3h, new Date('2026-09-16T16:01:00+02:00')), 'delai_passe')
    egal('⚠️ mais à 15 h 59, il part encore',
      raisonLienImpossible(tableCeSoir, resto3h, new Date('2026-09-16T15:59:00+02:00')), null)
    egal('🔴 et une fois le service commencé, c’est l’autre raison',
      raisonLienImpossible(tableCeSoir, resto3h, new Date('2026-09-16T19:30:00+02:00')), 'service_commence')
    verifie('⚠️ chaque raison a sa phrase, et « delai_passe » dit le piège',
      /piégerait ton client/.test(messageLienImpossible('delai_passe'))
      && messageLienImpossible(null) === null)
  }
  verifie('⚠️ et il dit pourquoi, à la place du bouton',
    /stripePret={compteEncaisse\(commercant\)}/.test(DASH2)
    && /pour pouvoir demander une carte/.test(DASH2))
}

// ─── LA FICHE, LA PORTE GRATUITE ET LE RETOUR (15/09, essai E2 d'Alex) ──────
//
// 🔴 UNE TABLE DE SIX SE RÉSERVAIT SANS QU'AUCUNE CARTE SOIT DEMANDÉE. Quatre
// maillons manquaient : la règle lisait une colonne que la fiche n'a pas, la
// route gratuite ne rejouait pas la règle, et ni l'annonce avant le clic ni le
// retour de Stripe n'existaient. Aucun banc ne regardait la route gratuite.
{
  const RESERVER = sansProse(lire('app/api/rdv/reserver/route.js'))
  const TUNNEL = sansProse(lire('app/commander/rdv/[slug]/page.js'))
  const PAIEMENTS = sansProse(lire('app/dashboard/TabPaiements.js'))

  // ── La porte gratuite ──────────────────────────────────────────────────
  // ⚠️ LA RÈGLE REND « PAS DE CARTE » SUR UNE COLONNE ABSENTE : sur cette route,
  // ça veut dire laisser passer la table. Chaque colonne est donc exigée.
  const mSelect = RESERVER.match(/db\.from\('commercants'\)\s*\.select\('([^']*)'\)/)
  const colonnes = mSelect ? mSelect[1].split(',').map(s => s.trim()) : []
  for (const col of ['rdv_empreinte_actif', 'rdv_empreinte_seuil_couverts', 'rdv_empreinte_par_personne', 'stripe_account_charges_enabled']) {
    verifie(`🔴 la route gratuite charge ${col}`, colonnes.includes(col), `${colonnes.length} colonnes lues`)
  }
  verifie('🔴 la route gratuite rejoue la règle de la carte',
    /if \(couvertsTable !== null && empreinteRequise\(commercant, prestation, couvertsTable\)\) \{/.test(RESERVER))

  // ── 🔴 LA GARDE CI-DESSUS ÉTAIT DÉSARMÉE PAR UNE COLONNE ABSENTE (16/09) ──
  //
  // Essai E2 d'Alex, deuxième fois : « Ce nombre de personnes n'est pas
  // accepté ». `capacite` manquait dans le select de la prestation, ici et sur
  // la route de l'empreinte. Sans elle la capacité vaut 1, les bornes valent
  // { 1, 1 }, et `couvertsValides` rend `null` sur TOUTE table :
  //   • la route de l'empreinte bloquait le client devant sa carte ;
  //   • et la garde juste au-dessus ne se déclenchait JAMAIS, puisqu'elle
  //     commence par `couvertsTable !== null`. Une table de six se réservait
  //     donc sans carte, exactement comme avant le correctif du 15/09.
  //
  // ⚠️ LE BANC REGARDAIT LES COLONNES DU COMMERÇANT, PAS CELLES DE LA
  // PRESTATION. C'est pour ça qu'il est resté vert sur les deux.
  {
    // La règle EXÉCUTÉE, avec et sans la colonne : c'est le piège lui-même.
    const table12 = { par_couverts: true, couverts_min: 1, couverts_max: 12 }
    egal('🔴 sans `capacite`, une table de six est refusée',
      couvertsValides(table12, 6), null)
    egal('⚠️ et même une table de deux', couvertsValides(table12, 2), null)
    egal('avec la capacité, six passe', couvertsValides({ ...table12, capacite: 24 }, 6), 6)

    // Et la liste vient de la règle, pas d'une recopie par appelant.
    const colonnes = COLONNES_COUVERTS.split(',').map(s => s.trim())
    egal('🔴 la règle déclare les quatre colonnes qu’elle lit', colonnes.length, 4)
    verifie('dont `capacite`, celle qui manquait', colonnes.includes('capacite'))
    // 🔴 ET LA GARDE GÉNÉRALE, celle qui empêchera la huitième fois : QUI
    // APPLIQUE LA RÈGLE CHARGE SES COLONNES. Aucune liste recopiée à la main,
    // sinon il en manquera une, et elle manquera en silence.
    const sources = []
    const parcourir = (dossier) => {
      for (const e of readdirSync(new URL(`../${dossier}`, import.meta.url), { withFileTypes: true })) {
        if (e.isDirectory()) parcourir(`${dossier}/${e.name}`)
        else if (e.name.endsWith('.js')) sources.push(`${dossier}/${e.name}`)
      }
    }
    parcourir('app/api')
    parcourir('lib')
    const appliquent = sources.filter(f => /couvertsValides\s*\(|bornesCouverts\s*\(/.test(sansProse(lire(f))))
      // La règle elle-même se définit, elle ne se charge pas.
      .filter(f => f !== 'lib/cours-collectifs.js')
    verifie('la règle des couverts est appliquée par au moins trois fichiers',
      appliquent.length >= 3, `${appliquent.length} trouvés`)
    // ⚠️ ON VISE L'INTERPOLATION, PAS LE NOM. Chercher `COLONNES_COUVERTS` tout
    // court, c'est trouver la ligne d'import et rester vert alors que le select
    // a été recopié à la main juste en dessous. Le piège de l'import, encore.
    for (const f of appliquent) {
      verifie(`🔴 ${f} charge les colonnes DÉCLARÉES par la règle`,
        /\$\{COLONNES_COUVERTS\}/.test(sansProse(lire(f))), 'liste recopiée à la main')
    }
  }
  const iGarde = RESERVER.indexOf('empreinteRequise(commercant, prestation, couvertsTable)')
  verifie('🔴 et le fait AVANT de créer la table',
    iGarde !== -1 && iGarde < RESERVER.indexOf('creerReservationRdv(db,'))
  verifie('⚠️ avec la même lecture du nombre que le module de création',
    /const couvertsTable = couvertsValides\(prestation, couverts\)/.test(RESERVER))
  verifie('🔴 elle refuse, et le dit', /empreinte_requise: true,\s*\}, \{ status: 409 \}\)/.test(RESERVER))

  // ── L'annonce avant le clic ────────────────────────────────────────────
  verifie('🔴 la fiche annonce la carte et le montant AVANT le clic',
    /\{montantEmpreinte\(commercant, prestationChoisie, couverts\) > 0 && \(/.test(TUNNEL))
  verifie('🔴 elle dit que rien n’est débité si le client vient',
    /demande d’enregistrer ta carte\. Rien n’est débité si tu viens\./.test(TUNNEL))
  // 🔴 UNE TABLE GARANTIE N'A QU'UN SEUL MESSAGE (Alex, 16/09). « Rien à payer
  // maintenant, tu règles sur place », juste au-dessus de « enregistre ta
  // carte », laissait croire à un débit ; et le délai d'annulation était donné
  // deux fois sur le même écran, à quatre lignes d'intervalle.
  verifie('🔴 le récapitulatif se tait quand une carte est demandée',
    /\) : montantEmpreinte\(commercant, prestationChoisie, couverts\) > 0 \? \(/.test(TUNNEL))
  verifie('🔴 et le rappel sous le bouton aussi',
    /\{montantEmpreinte\(commercant, prestationChoisie, couverts\) === 0 && \(/.test(TUNNEL))
  // ⚠️ DONC LE SEUL MESSAGE RESTANT PORTE TOUT : le montant, le délai sans
  // frais, et le fait qu'on peut aussi REPORTER. Le délai suit le réglage du
  // commerçant, et zéro heure est une valeur qu'on écrit au lieu de se taire.
  verifie('🔴 le message de l’empreinte porte le délai d’annulation sans frais',
    /Tu peux annuler ou reporter sans frais jusqu’à \$\{delaiAnnulationHeures\(commercant\)\} h avant\./.test(TUNNEL))
  verifie('⚠️ et il le dit encore quand ce délai vaut zéro',
    /Tu peux annuler ou reporter sans frais jusqu’au dernier moment\./.test(TUNNEL))
  verifie('⚠️ le bouton dit le geste', /'Enregistrer ma carte et réserver'/.test(TUNNEL))
  verifie('🔴 aucune somme annoncée comme bloquée sur la fiche',
    !/(bloqu|retenu|g[eé]l[eé])\w*\s+(sur\s+)?(ta|ton|sa|son|le|la)\s+(carte|compte)/i.test(TUNNEL))

  // ── Le retour de Stripe ────────────────────────────────────────────────
  const iBranche = TUNNEL.indexOf("'/api/stripe/checkout/create-rdv-empreinte'")
  const iDepart = TUNNEL.indexOf('window.location.href = data.url', iBranche)
  const iCliche = TUNNEL.indexOf('empreinteMontant: data.montant', iBranche)
  verifie('🔴 le cliché est posé AVANT de partir chez Stripe',
    iBranche !== -1 && iCliche !== -1 && iCliche < iDepart)
  verifie('🔴 le retour `?empreinte=` est lu',
    /const empreinte = params\.get\('empreinte'\)/.test(TUNNEL) && /if \(!paiement && !empreinte\) return/.test(TUNNEL))
  verifie('🔴 une empreinte ne s’affiche pas comme un acompte payé',
    /\{rdvCree\._viaStripe && !rdvCree\._empreinte && \(/.test(TUNNEL) && /acompte_montant: viaEmpreinte \? null :/.test(TUNNEL))
  verifie('⚠️ l’abandon chez Stripe dit que rien n’a été réservé ni débité',
    /Carte non enregistrée\. Rien n\\'a été réservé ni débité/.test(TUNNEL))

  // ── Le délai annoncé ───────────────────────────────────────────────────
  // 🔴 LE PIÈGE DU ZÉRO, ET UN RESTAURANT À 24 H AU LIEU DE 3 : la fiche et le
  // réglage de l'acompte gardaient les deux dernières copies de `|| 24`.
  verifie('🔴 plus aucun délai en `|| 24` sur la fiche', !/rdv_delai_annulation_heures \|\| 24/.test(TUNNEL))
  verifie('🔴 ni dans le réglage de l’acompte', !/rdv_delai_annulation_heures \|\| 24/.test(PAIEMENTS))
}

// ═══ RÉSULTAT ═══════════════════════════════════════════════════════════════
console.log(`\nEmpreinte de table : ${ok + echecs.length} vérifications`)
if (echecs.length) {
  console.log(`\n🔴 ${echecs.length} en échec :`)
  echecs.forEach(e => console.log('   ✕ ' + e))
  process.exit(1)
}
console.log('Tout passe.')
