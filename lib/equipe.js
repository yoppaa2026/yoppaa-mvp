// L'ÉQUIPE D'UN COMMERCE : QUI PEUT QUOI (29/09).
//
// « En restauration et dans les salons, ils aimeraient un accès limité pour le
// personnel : l'agenda, les rendez-vous, les réservations de table, pas le
// reste. » (Alex). Et le livreur passe par le même système, avec sa seule case
// « Livraisons » : Alex voulait UN mécanisme, pas deux.
//
// 🔴 LE PRINCIPE : UN MEMBRE NE TOUCHE JAMAIS LA BASE. Les tables de l'équipe
// n'ont aucune règle d'accès (MIGRATION_EQUIPE_MEMBRES.sql) et tout passe par
// les routes `/api/equipe/…`, qui appliquent CE module. L'écran peut cacher un
// bouton ; c'est ici que se décide s'il avait le droit d'exister.
//
// ⚠️ FONCTIONS PURES, sans base ni réseau : c'est ce qui permet de les
// mesurer. Le serveur (`lib/equipe-server.js`) lit la base, puis demande ici.

import { canDo, planEffectif } from './plans.js'

// Le plafond de personnes par commerce. Alex, 29/09 : 5 d'abord, puis « il
// faut supprimer la limite de 5, 10 actifs me semble une bonne limite ». Une
// invitation en attente compte : sinon on en enverrait trente, et les trente
// pourraient accepter.
export const EQUIPE_MAX = 10

// ⚠️ L'ONGLET « MON ÉQUIPE » N'EST PAS ENCORE DANS LA BARRE (29/09). Tant que
// le Poste équipe n'existe pas, une personne invitée n'aurait nulle part où
// travailler : l'onglet s'ouvre par son adresse (`?onglet=config&config=equipe`)
// pour les essais d'Alex, et entre dans la barre quand tout est prêt.
export const EQUIPE_DANS_LA_BARRE = false

// Une invitation se perd dans une boîte mail ; au-delà d'une semaine, on la
// renvoie plutôt que de laisser traîner un lien valable.
export const INVITATION_JOURS = 7

// ⚠️ L'ORDRE EST CELUI DE L'ÉCRAN, et les libellés sont ceux qu'Alex a validés.
export const DROITS = [
  { cle: 'agenda',     label: 'Agenda',     aide: 'Rendez-vous et réservations : voir, créer, déplacer, annuler, marquer « venu ».' },
  { cle: 'commandes',  label: 'Commandes',  aide: 'Toutes les commandes et leurs statuts.' },
  { cle: 'livraisons', label: 'Livraisons', aide: 'Seulement les commandes à livrer du jour, et la tournée.' },
  { cle: 'argent',     label: 'Argent',     aide: 'Marquer « absent », débiter une garantie, demander une garantie par SMS (tes crédits).' },
  { cle: 'comptoir',   label: 'Comptoir',   aide: 'Encaisser un bon cadeau, tamponner une carte de fidélité.' },
]
export const CLES_DROITS = DROITS.map(d => d.cle)

/** La colonne qui porte un droit. Lève sur un droit inconnu : une faute de
 *  frappe ne doit jamais se lire « non » en silence, ni « oui ». */
export function colonneDroit(cle) {
  if (!CLES_DROITS.includes(cle)) throw new Error(`droit d'équipe inconnu : ${cle}`)
  return `droit_${cle}`
}

/**
 * Les cases cochées, lues depuis n'importe quelle entrée, en colonnes.
 *
 * ⚠️ SEUL `true` COCHE. `"false"` est une chaîne non vide, donc vraie pour
 * JavaScript : un formulaire mal sérialisé donnerait l'argent à un livreur.
 */
export function droitsDepuis(entree = {}) {
  const droits = {}
  for (const cle of CLES_DROITS) droits[colonneDroit(cle)] = entree?.[cle] === true || entree?.[colonneDroit(cle)] === true
  return droits
}

/** Ce qui cloche dans des cases cochées, ou `null`. Les mêmes règles que la base. */
export function refusDroits(droits) {
  const d = droits || {}
  if (!d.droit_agenda && !d.droit_commandes && !d.droit_livraisons && !d.droit_comptoir) {
    return 'Coche au moins une case : sans elle, cette personne n’aurait rien à faire.'
  }
  if (d.droit_argent && !d.droit_agenda) {
    return '« Argent » agit sur les rendez-vous : coche aussi « Agenda ».'
  }
  return null
}

/** Une adresse telle qu'on la compare : sans espaces, en minuscules. */
export function adresseNormalisee(email) {
  return String(email || '').trim().toLowerCase()
}

export function adresseValable(email) {
  const e = adresseNormalisee(email)
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

/** Le commerce a-t-il droit à une équipe, aujourd'hui ? (forfait EFFECTIF, essai compris) */
export function commerceAUneEquipe(commercant, maintenant = new Date()) {
  if (!commercant) return false
  if (!['valide', 'actif'].includes(commercant.statut)) return false
  return canDo(planEffectif(commercant, maintenant), 'equipe')
}

/**
 * Pourquoi cette invitation est refusée, ou `null`.
 *
 * @param {object} o
 * @param {object} o.commercant          plan, essai_plan, created_at, statut, email
 * @param {object[]} o.membres           les membres NON retirés du commerce
 * @param {string} o.email
 * @param {string} o.prenom
 * @param {object} o.droits              en colonnes (`droitsDepuis`)
 * @param {string|null} [o.expireLe]    ISO, ou null
 * @param {string|null} [o.emailPatron]  l'adresse du compte du patron
 * @param {Date} [o.maintenant]
 */
export function refusInvitation({ commercant, membres = [], email, prenom, droits, expireLe = null, emailPatron = null, maintenant = new Date() }) {
  if (!commerceAUneEquipe(commercant, maintenant)) return 'L’équipe fait partie de la formule Vendre.'
  const adresse = adresseNormalisee(email)
  if (!adresseValable(adresse)) return 'Cette adresse email n’est pas valable.'
  const nom = String(prenom || '').trim()
  if (nom.length < 1 || nom.length > 60) return 'Indique un prénom (60 caractères au plus).'
  // ⚠️ Le patron a déjà tout : s'inviter lui-même ne lui donnerait qu'un
  // second accès, plus petit, à son propre commerce.
  if (emailPatron && adresse === adresseNormalisee(emailPatron)) return 'C’est ton adresse : tu as déjà accès à tout.'
  const refus = refusDroits(droits)
  if (refus) return refus
  const enPlace = (membres || []).filter(m => m.statut !== 'retire')
  if (enPlace.some(m => adresseNormalisee(m.email) === adresse)) return 'Cette personne fait déjà partie de ton équipe, ou son invitation est en cours.'
  if (enPlace.length >= EQUIPE_MAX) return `Ton équipe compte déjà ${EQUIPE_MAX} personnes : retire quelqu’un avant d’en inviter une autre.`
  const refusFin = refusExpiration(expireLe, maintenant)
  if (refusFin) return refusFin
  return null
}

/** Une date de fin, si elle est donnée, doit être à venir. */
export function refusExpiration(expireLe, maintenant = new Date()) {
  if (expireLe === null || expireLe === undefined || expireLe === '') return null
  const t = new Date(expireLe).getTime()
  if (!Number.isFinite(t)) return 'Cette date de fin n’est pas lisible.'
  if (t <= maintenant.getTime()) return 'La date de fin doit être dans le futur.'
  return null
}

/**
 * Le membre peut-il agir, MAINTENANT ?
 *
 * ⚠️ LA DATE DE FIN SE VÉRIFIE À CHAQUE APPEL, pas par un nettoyage de nuit :
 * le livreur de samedi ne doit plus rien voir dimanche matin, même si aucune
 * tâche n'est passée entre-temps.
 */
export function membreEnActivite(membre, maintenant = new Date()) {
  if (!membre || membre.statut !== 'actif' || !membre.auth_user_id) return false
  if (membre.expire_le && new Date(membre.expire_le).getTime() <= maintenant.getTime()) return false
  return true
}

/**
 * LA question : ce membre, pour ce commerce, a-t-il ce droit, maintenant ?
 *
 * ⚠️ LE FORFAIT AUSSI SE VÉRIFIE À CHAQUE APPEL : un commerce qui quitte Vendre
 * (ou dont l'essai se termine) coupe l'accès de toute son équipe, sans que
 * personne ait à y penser.
 */
export function peutAgir({ membre, commercant, droit, maintenant = new Date() }) {
  if (!membreEnActivite(membre, maintenant)) return false
  if (!commercant || membre.commercant_id !== commercant.id) return false
  if (!commerceAUneEquipe(commercant, maintenant)) return false
  return membre[colonneDroit(droit)] === true
}

/** L'invitation peut-elle encore être acceptée ? */
export function invitationOuverte(membre, maintenant = new Date()) {
  if (!membre || membre.statut !== 'invite' || !membre.invitation_expire_le) return false
  return new Date(membre.invitation_expire_le).getTime() > maintenant.getTime()
}

/**
 * Pourquoi ce compte ne peut pas accepter cette invitation, ou `null`.
 *
 * 🔴 LE COMPTE DOIT PORTER L'ADRESSE INVITÉE. Un lien transféré, ou lu par
 * quelqu'un d'autre, ne fait entrer personne.
 */
export function refusAcceptation({ membre, commercant, user, maintenant = new Date() }) {
  if (!membre) return 'Cette invitation n’existe pas, ou a déjà servi.'
  if (!invitationOuverte(membre, maintenant)) return 'Cette invitation a expiré. Demande à ton responsable de te la renvoyer.'
  if (!user?.email) return 'Connecte-toi d’abord.'
  if (adresseNormalisee(user.email) !== adresseNormalisee(membre.email)) {
    return `Cette invitation a été envoyée à une autre adresse. Connecte-toi avec l’adresse qui l’a reçue.`
  }
  if (commercant?.auth_user_id && commercant.auth_user_id === user.id) return 'C’est ton propre commerce : tu y as déjà accès à tout.'
  if (!commerceAUneEquipe(commercant, maintenant)) return 'Ce commerce n’a plus accès à l’équipe.'
  if (membre.expire_le && new Date(membre.expire_le).getTime() <= maintenant.getTime()) return 'Cet accès est déjà terminé.'
  return null
}

// ⚠️ EN HEURE BELGE : un serveur à Greenwich écrirait 22:00 pour un accès qui
// se termine à minuit chez nous.
const FIN_ACCES = new Intl.DateTimeFormat('fr-BE', {
  timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
})

/** « samedi 4 octobre à 23:00 », ou `null` sans date de fin. */
export function libelleFinAcces(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return FIN_ACCES.format(d)
}

/** La date d'expiration d'une invitation envoyée maintenant. */
export function finInvitation(maintenant = new Date()) {
  return new Date(maintenant.getTime() + INVITATION_JOURS * 24 * 3600 * 1000).toISOString()
}

/**
 * Ce que le patron voit d'un membre. Jamais l'empreinte du jeton.
 * @returns {object}
 */
export function membrePourLePatron(m, maintenant = new Date()) {
  const cases = {}
  for (const cle of CLES_DROITS) cases[cle] = m[colonneDroit(cle)] === true
  let etat = m.statut
  if (m.statut === 'invite' && !invitationOuverte(m, maintenant)) etat = 'invitation_expiree'
  if (m.statut === 'actif' && !membreEnActivite(m, maintenant)) etat = 'termine'
  return {
    id: m.id, prenom: m.prenom, email: m.email, droits: cases, etat,
    expire_le: m.expire_le || null, invite_le: m.created_at, accepte_le: m.accepte_le || null,
  }
}

/** Le libellé d'un état, pour l'écran du patron. */
export const LIBELLES_ETAT = {
  invite: 'Invitation envoyée',
  invitation_expiree: 'Invitation expirée',
  actif: 'Actif',
  termine: 'Accès terminé',
  retire: 'Retiré',
}
