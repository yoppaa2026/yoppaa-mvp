// L'ÉQUIPE, CÔTÉ SERVEUR : lire la base, vérifier, journaliser (29/09).
//
// Les règles vivent dans `lib/equipe.js` (pures, mesurées). Ce fichier ne fait
// que lire ce qu'il faut pour les appliquer.
//
// 🔴 TOUTES LES LECTURES LÈVENT EN CAS D'ERREUR. Une erreur lue comme « aucun
// membre » laisserait inviter un sixième ; lue comme « pas membre », elle
// fermerait la porte à quelqu'un qui y a droit sans dire pourquoi. Une panne
// se dit comme une panne.

import { createHash, randomBytes } from 'node:crypto'
import { utilisateurAppelant, adminVerifie } from './api-auth'
import { peutAgir, droitsDe } from './equipe'
import { BASE_YOPPAA } from './lien-fiche'

// ⚠️ JAMAIS `invitation_jeton_hash` : même l'empreinte ne sort pas du serveur.
export const COLONNES_MEMBRE = 'id, commercant_id, email, prenom, auth_user_id, droit_agenda, droit_commandes, droit_livraisons, droit_argent, droit_comptoir, statut, expire_le, invitation_expire_le, created_at, accepte_le, retire_le'

// Ce que les règles lisent du commerce. `email` : pour refuser que le patron
// s'invite lui-même ; il ne sort jamais vers un membre.
export const COLONNES_COMMERCE_EQUIPE = 'id, nom, slug, type, categorie, statut, plan, essai_plan, created_at, auth_user_id, email'

/** Un jeton d'invitation : 32 octets aléatoires, lisible dans une adresse. */
export function nouveauJeton() {
  return randomBytes(32).toString('base64url')
}

/** Ce qu'on garde en base : l'empreinte, jamais le jeton. */
export function empreinteJeton(jeton) {
  return createHash('sha256').update(String(jeton || '')).digest('hex')
}

/**
 * L'adresse du lien d'invitation.
 *
 * ⚠️ LE JETON SEUL NE FAIT ENTRER PERSONNE : le compte qui l'accepte doit
 * porter l'adresse invitée (`refusAcceptation`). C'est ce qui permet de le
 * laisser dans l'adresse, où il survit au détour par la connexion.
 */
export function lienInvitation(jeton) {
  return `${BASE_YOPPAA}/equipe/rejoindre?invitation=${encodeURIComponent(jeton)}`
}

export async function commerceDeLEquipe(admin, commercantId) {
  if (!commercantId) return null
  const { data, error } = await admin.from('commercants').select(COLONNES_COMMERCE_EQUIPE).eq('id', commercantId).maybeSingle()
  if (error) throw new Error(`lecture du commerce : ${error.message}`)
  return data
}

/** Les membres non retirés d'un commerce. */
export async function membresEnPlace(admin, commercantId) {
  const { data, error } = await admin.from('equipe_membres').select(COLONNES_MEMBRE)
    .eq('commercant_id', commercantId).neq('statut', 'retire').order('created_at')
  if (error) throw new Error(`lecture de l'équipe : ${error.message}`)
  return data || []
}

/**
 * LA garde des écrans du PATRON sur son équipe : inviter, modifier, retirer.
 *
 * Le patron du commerce, ou l'admin Yoppaa vérifié (double authentification).
 * Personne d'autre, et surtout pas un membre : un membre qui pourrait gérer
 * l'équipe pourrait se donner l'argent.
 *
 * @returns {Promise<{ok: true, user, commercant} | {ok: false, status, error}>}
 */
export async function gardePatronEquipe(request, admin, commercantId) {
  const user = await utilisateurAppelant(request)
  if (!user) return { ok: false, status: 401, error: 'non authentifié' }
  if (!commercantId) return { ok: false, status: 400, error: 'commerce inconnu' }
  const commercant = await commerceDeLEquipe(admin, commercantId)
  if (!commercant) return { ok: false, status: 404, error: 'commerce introuvable' }
  const patron = commercant.auth_user_id === user.id
  if (!patron && !(await adminVerifie(request, user))) return { ok: false, status: 403, error: 'accès refusé' }
  return { ok: true, user, commercant }
}

/**
 * LA garde des gestes de l'ÉQUIPE : ce compte, pour ce commerce, avec ce droit.
 *
 * Le patron et l'admin vérifié passent (ils ont tout). Un membre passe si
 * `peutAgir` le dit : actif, pas terminé, bon commerce, forfait Vendre, case
 * cochée. Tout le reste est refusé.
 *
 * `droit` peut être une LISTE : la garde passe si l'une des cases est cochée
 * (le Poste équipe s'ouvre pour quiconque a au moins une case), et elle rend
 * `permis`, les cases EFFECTIVEMENT ouvertes, pour que la route ne serve que
 * celles-là.
 *
 * @returns {Promise<{ok: true, user, commercant, membre: object|null, role: 'patron'|'admin'|'membre', permis: object} | {ok: false, status, error}>}
 */
export async function gardeEquipe(request, admin, commercantId, droit) {
  const user = await utilisateurAppelant(request)
  if (!user) return { ok: false, status: 401, error: 'non authentifié' }
  if (!commercantId) return { ok: false, status: 400, error: 'commerce inconnu' }
  const commercant = await commerceDeLEquipe(admin, commercantId)
  if (!commercant) return { ok: false, status: 404, error: 'commerce introuvable' }
  if (commercant.auth_user_id === user.id) return { ok: true, user, commercant, membre: null, role: 'patron', permis: droitsDe(null, 'patron') }
  if (await adminVerifie(request, user)) return { ok: true, user, commercant, membre: null, role: 'admin', permis: droitsDe(null, 'admin') }

  const { data: membre, error } = await admin.from('equipe_membres').select(COLONNES_MEMBRE)
    .eq('commercant_id', commercantId).eq('auth_user_id', user.id).eq('statut', 'actif').maybeSingle()
  if (error) throw new Error(`lecture du membre : ${error.message}`)
  const demandes = Array.isArray(droit) ? droit : [droit]
  const permis = {}
  for (const d of demandes) permis[d] = peutAgir({ membre, commercant, droit: d })
  if (!Object.values(permis).some(Boolean)) return { ok: false, status: 403, error: 'accès refusé' }
  return { ok: true, user, commercant, membre, role: 'membre', permis }
}

/**
 * LA garde des routes qui agissent sur UNE ligne (un rendez-vous, une
 * commande), pour le patron, l'admin ET l'équipe (étape 3, 29/09).
 *
 * ⚠️ ELLE REMPLACE `gardeSurLigne` SANS RIEN RETIRER : le patron et l'admin
 * vérifié passent exactement comme avant (`gardeEquipe` les laisse passer), et
 * un membre passe s'il a la case demandée. Même route, même règle pour tous :
 * aucun geste n'est recopié pour l'équipe.
 *
 * ⚠️ LE COMMERCE SE DÉDUIT DE LA LIGNE, jamais du corps de la requête : un
 * membre ne peut pas viser le rendez-vous d'un autre commerce en changeant un
 * identifiant.
 *
 * @param {string} table   'rdv_reservations' ou 'commandes' (fixé par la route)
 * @param {string|string[]} droit  la ou les cases qui ouvrent ce geste
 */
export async function gardeLigneEquipe(request, admin, table, id, droit) {
  if (!id) return { ok: false, status: 400, error: 'identifiant requis' }
  const { data, error } = await admin.from(table).select('commercant_id').eq('id', id).maybeSingle()
  if (error) throw new Error(`lecture de la ligne : ${error.message}`)
  if (!data) return { ok: false, status: 404, error: 'introuvable' }
  return gardeEquipe(request, admin, data.commercant_id, droit)
}

/**
 * Le geste d'un membre, au journal. Rien pour le patron ni pour l'admin : le
 * journal répond à « qui, dans l'équipe, a fait ça ? ».
 */
export async function journaliserGeste(admin, garde, { action, cible_type, cible_id, details = {} }) {
  if (!garde?.ok || garde.role !== 'membre') return true
  return journaliser(admin, {
    commercant_id: garde.commercant.id, membre_id: garde.membre.id, auth_user_id: garde.user.id,
    action, cible_type, cible_id, details,
  })
}

/**
 * Inscrit un geste au journal.
 *
 * ⚠️ UN JOURNAL RATÉ NE DÉFAIT PAS LE GESTE, MAIS IL SE DIT. Le geste a eu lieu
 * (l'invitation est partie, le rendez-vous est déplacé) : l'annuler parce que
 * sa trace a échoué serait pire. On le crie dans les journaux du serveur, et
 * l'appelant sait que la trace manque.
 *
 * @returns {Promise<boolean>} vrai si la trace est écrite
 */
export async function journaliser(admin, { commercant_id, membre_id = null, auth_user_id = null, action, cible_type = null, cible_id = null, details = {} }) {
  const { error } = await admin.from('equipe_journal').insert({ commercant_id, membre_id, auth_user_id, action, cible_type, cible_id, details })
  if (error) {
    console.error('[equipe] journal non écrit', { commercant_id, action, cible_id, error: error.message })
    return false
  }
  return true
}

/** « a***@exemple.be » : assez pour se reconnaître, pas assez pour être relevé. */
export function adresseMasquee(email) {
  const e = String(email || '')
  const i = e.indexOf('@')
  if (i < 1) return ''
  return `${e[0]}***${e.slice(i)}`
}
