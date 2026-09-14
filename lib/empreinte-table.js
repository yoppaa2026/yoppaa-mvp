// L'EMPREINTE BANCAIRE SUR UNE TABLE : QUI DONNE SA CARTE, POUR COMBIEN,
// ET JUSQU'À QUAND ELLE PEUT ÊTRE DÉBITÉE.
//
// 🔴 CE QU'UNE EMPREINTE EST, ET CE QU'ELLE N'EST PAS. Ce n'est PAS un acompte :
// rien n'est encaissé, donc il n'y a ni produit à déclarer, ni TVA, ni caisse
// certifiée belge dans le chemin. Et ce n'est PAS un blocage de fonds : Stripe
// ne garde une autorisation que SEPT JOURS (Visa en transaction commerçant :
// 4 j 18 h), ce qui exclut toute table réservée plus d'une semaine à l'avance.
// La carte est ENREGISTRÉE avec l'authentification forte, qui donne le mandat,
// et le débit se fait plus tard, hors session, s'il a lieu.
//
// ⚠️ CONSÉQUENCE DE VOCABULAIRE, NON NÉGOCIABLE : on n'écrit JAMAIS qu'une
// somme est bloquée ou retenue sur le compte du client. Rien ne l'est. Un
// client qui lirait « 120 € bloqués » chercherait la retenue sur son relevé et
// ne la trouverait pas. On écrit : sa carte est enregistrée, rien n'est débité
// s'il vient.
//
// ⚠️ LA RÈGLE SUIT LA PRESTATION, PAS LA CATÉGORIE. Une empreinte se demande
// sur une TABLE (`par_couverts`), jamais sur une commande de pain ni sur une
// coupe. Passer par la catégorie aurait demandé sa carte à une friterie qui
// prend des commandes.

import { estParCouverts } from './cours-collectifs'
// ⚠️ IMPORTÉ, PAS REÇU EN PARAMÈTRE. Une première version faisait passer
// `brusselsInstant` par l'appelant : le jour où l'un d'eux l'oublie, la fenêtre
// de débit lève au lieu de refuser, et c'est dans une route qui touche à
// l'argent. Le module voisin `rdv-delai-annulation` l'importe de la même façon.
import { brusselsInstant, jourCivilPlus } from './timezone'
// ⚠️ IMPORTÉ, PAS REÇU : l'échéance du lien s'arrête au moment où la table
// n'est plus annulable sans frais, et cette limite n'a qu'une définition.
import { limiteAnnulation } from './rdv-delai-annulation'

// Les valeurs proposées au restaurateur, décidées le 14/09. Le seuil vise les
// GRANDES tables : c'est là qu'un no-show coûte cher et que le client trouve la
// demande légitime. Un couple à qui on réclame une carte pour deux couverts se
// sent suspecté et va ailleurs.
export const EMPREINTE_SEUIL_DEFAUT = 6
// 20 € par personne : le haut de la fourchette relevée en brasserie (10 à 20 €
// par couvert pour un ticket de 30 à 50 €), donc dissuasif sans ressembler à un
// prépaiement. Une table de six garantit 120 €, ce qui couvre largement le coût
// matière d'un service perdu.
export const EMPREINTE_MONTANT_DEFAUT = 20

// Les bornes, les mêmes qu'en base (commercants_rdv_empreinte_*_check).
export const EMPREINTE_SEUIL_MIN = 1
export const EMPREINTE_SEUIL_MAX = 200
export const EMPREINTE_MONTANT_MIN = 1
export const EMPREINTE_MONTANT_MAX = 200

// ⚠️ `??` ET JAMAIS `||` ICI NON PLUS : les colonnes sont NOT NULL en base, mais
// un objet partiel venant d'un select incomplet rendrait `undefined`, et un
// `|| 20` sur un montant délibérément bas le remonterait en silence.
function nombre(valeur, defaut, min, max) {
  // 🔴 `null` ET `''` SONT DES ABSENCES, PAS DES ZÉROS, et `Number(null)` vaut
  // 0. Sans cette ligne, un objet partiel (`rdv_empreinte_par_personne: null`,
  // parfaitement possible après un select incomplet) ne retombait pas sur la
  // valeur proposée : il était ramené au MINIMUM, et une table de huit
  // n'aurait garanti que 8 €. Les deux formes de l'absence, encore elles.
  if (valeur === null || valeur === undefined || valeur === '') return defaut
  const n = Number(valeur)
  if (!Number.isFinite(n)) return defaut
  // ⚠️ ET UN ZÉRO EXPLICITE EST BORNÉ AU MINIMUM, PAS REMONTÉ AU DÉFAUT : la
  // base l'interdit déjà, mais s'il arrivait, garantir 1 € par personne est
  // moins grave que d'en inventer vingt que le client n'a jamais acceptés.
  return Math.min(max, Math.max(min, n))
}

export function seuilEmpreinte(commercant) {
  return Math.floor(nombre(commercant?.rdv_empreinte_seuil_couverts, EMPREINTE_SEUIL_DEFAUT,
    EMPREINTE_SEUIL_MIN, EMPREINTE_SEUIL_MAX))
}

export function montantParPersonne(commercant) {
  return nombre(commercant?.rdv_empreinte_par_personne, EMPREINTE_MONTANT_DEFAUT,
    EMPREINTE_MONTANT_MIN, EMPREINTE_MONTANT_MAX)
}

// La carte est-elle demandée pour CETTE réservation ?
export function empreinteRequise(commercant, prestation, couverts) {
  if (!commercant?.rdv_empreinte_actif) return false
  // ⚠️ SANS COMPTE STRIPE, PAS D'EMPREINTE. Le SetupIntent naît sur le compte
  // du restaurateur : sans lui, la demande échouerait au moment précis où le
  // client donne sa carte, c'est-à-dire au pire moment possible.
  if (!commercant?.stripe_account_id || commercant?.stripe_account_charges_enabled === false) return false
  if (!estParCouverts(prestation)) return false
  const n = Math.floor(Number(couverts))
  if (!Number.isFinite(n) || n < 1) return false
  return n >= seuilEmpreinte(commercant)
}

// Ce que la table garantit. 🔴 FIGÉ À LA RÉSERVATION, comme la TVA et le lieu :
// le restaurateur peut changer son réglage demain, la table déjà prise ne bouge
// pas. Débiter plus que ce que le client a lu au moment de donner sa carte,
// c'est la contestation assurée, et elle se gagne contre nous.
export function montantEmpreinte(commercant, prestation, couverts) {
  if (!empreinteRequise(commercant, prestation, couverts)) return 0
  const n = Math.floor(Number(couverts))
  return Math.round(n * montantParPersonne(commercant) * 100) / 100
}

// ─── CE QUE L'ÉCRAN DE RÉGLAGE A LE DROIT D'ENREGISTRER ─────────────────────
//
// ⚠️ LA VALIDATION VIT ICI, PAS DANS L'ÉCRAN. Le tableau de bord écrit ces
// colonnes directement en base : si la règle vivait dans le formulaire, elle ne
// vaudrait que pour celui qui passe par le formulaire.
export function validerSeuil(saisie) {
  const n = Math.floor(Number(String(saisie ?? '').replace(',', '.')))
  if (!Number.isFinite(n)) return { ok: false, message: 'Écris un nombre de personnes.' }
  if (n < EMPREINTE_SEUIL_MIN || n > EMPREINTE_SEUIL_MAX) {
    return { ok: false, message: `Entre ${EMPREINTE_SEUIL_MIN} et ${EMPREINTE_SEUIL_MAX} personnes.` }
  }
  return { ok: true, valeur: n }
}

export function validerMontant(saisie) {
  const n = Number(String(saisie ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return { ok: false, message: 'Écris un montant en euros.' }
  if (n < EMPREINTE_MONTANT_MIN || n > EMPREINTE_MONTANT_MAX) {
    return { ok: false, message: `Entre ${EMPREINTE_MONTANT_MIN} et ${EMPREINTE_MONTANT_MAX} € par personne.` }
  }
  return { ok: true, valeur: Math.round(n * 100) / 100 }
}

// ─── LE LIEN « CONFIRME TA TABLE » (téléphone) ──────────────────────────────
//
// Une réservation prise au téléphone n'a pas de carte au bout du fil. Le
// restaurateur envoie un lien, le client pose sa carte lui-même, et la table
// passe de « sans empreinte » à « garantie ».
//
// ⚠️ CE N'EST PAS LA TABLE QUI ATTEND, C'EST LE LIEN QUI EXPIRE. Le restaurateur
// au téléphone confirme la table ; il ne dit pas « je vous confirme si vous
// cliquez ». Rien ne se libère tout seul, et c'est ce qui rend ce lien simple.
//
// Le lien meurt au plus tôt de deux échéances : sept jours, ou le moment où la
// table n'est plus annulable sans frais. 🔴 AU-DELÀ, LE POSER SERAIT UN PIÈGE :
// le client donnerait sa carte à un instant où il ne peut déjà plus annuler
// sans être débité, sans que rien ne le lui ait dit.
export const LIEN_VALIDITE_JOURS = 7

export function echeanceLien(rdv, commercant, maintenant = new Date()) {
  const septJours = new Date(maintenant.getTime() + LIEN_VALIDITE_JOURS * 24 * 3600 * 1000)
  const limite = limiteAnnulation(rdv, commercant)
  if (!limite) return septJours
  return limite < septJours ? limite : septJours
}

// Peut-on encore DEMANDER une carte sur cette table ?
export function raisonDemandeImpossible(rdv, maintenant = new Date()) {
  if (rdv?.empreinte_statut === 'posee') return 'deja_garantie'
  if (rdv?.empreinte_statut === 'debitee') return 'deja_debitee'
  if (!['confirme', undefined, null].includes(rdv?.statut)) return 'pas_confirmee'
  const fenetre = fenetreDebit(rdv)
  if (!fenetre) return 'date_illisible'
  // 🔴 UNE TABLE DONT LE SERVICE A COMMENCÉ N'A PLUS BESOIN DE GARANTIE : le
  // client est là ou il ne viendra pas, et lui réclamer sa carte à ce
  // moment-là ne protège plus rien.
  if (maintenant >= fenetre.ouvre) return 'service_commence'
  return null
}

export function peutDemander(rdv, maintenant = new Date()) {
  return raisonDemandeImpossible(rdv, maintenant) === null
}

// Le lien encore vivant ? ⚠️ `expire` est une chaîne venue de la base : une
// date illisible vaut « expiré », jamais « valable pour toujours ».
export function lienValide(rdv, maintenant = new Date()) {
  const expire = rdv?.empreinte_demande_expire_at ? new Date(rdv.empreinte_demande_expire_at) : null
  if (!expire || isNaN(expire.getTime())) return false
  return maintenant < expire
}

// ─── QUAND LE RESTAURATEUR PEUT DÉBITER ─────────────────────────────────────
//
// Décision d'Alex du 14/09 : LUI, jamais automatiquement. Il suffirait d'oublier
// de pointer une table présente pour débiter quelqu'un qui était là. Et la
// fenêtre se FERME : un client ne doit pas découvrir un prélèvement trois
// semaines après son dîner. Un prélèvement tardif est une contestation de carte
// quasi certaine, et c'est le nom du restaurant qui apparaît dessus.
//
// Elle s'ouvre à l'heure du service et se ferme à la fin du LENDEMAIN, heure de
// Bruxelles.
export const DEBIT_FERME_FIN_DU_LENDEMAIN = true

export function fenetreDebit(rdv) {
  if (!rdv?.date_rdv || !rdv?.heure_debut) return null
  const ouvre = brusselsInstant(rdv.date_rdv, rdv.heure_debut)
  // Le surlendemain à 00:00 de Bruxelles : tout le lendemain est donc compris.
  // ⚠️ PAR `jourCivilPlus`, JAMAIS PAR UN INSTANT. Une première version relisait
  // un `Date` avec `toISOString().slice(0, 10)` : ça rend le jour de Greenwich,
  // pas celui de Bruxelles, et un banc du dépôt interdit ce motif depuis
  // longtemps. Il m'a attrapé, et il avait raison.
  const ferme = brusselsInstant(jourCivilPlus(rdv.date_rdv, 2), '00:00')
  return { ouvre, ferme }
}

// 🔴 SEUL LE NO-SHOW TOTAL SE DÉBITE, et « 6 annoncés, 4 venus » ne retient
// rien (décision d'Alex). Quatre personnes attablées ont laissé une addition ;
// leur réclamer deux couverts de plus, c'est perdre le client et déclencher une
// contestation que Stripe tranche en leur faveur, faute de preuve de ce qui a
// été annoncé au téléphone.
export function raisonDebitImpossible(rdv, maintenant = new Date()) {
  if (rdv?.empreinte_statut !== 'posee') return 'aucune_empreinte'
  if (rdv?.empreinte_debit_pi_id) return 'deja_debitee'
  const fenetre = fenetreDebit(rdv)
  if (!fenetre) return 'date_illisible'
  if (maintenant < fenetre.ouvre) return 'service_pas_commence'
  if (maintenant > fenetre.ferme) return 'fenetre_fermee'
  return null
}

export function peutDebiter(rdv, maintenant = new Date()) {
  return raisonDebitImpossible(rdv, maintenant) === null
}
