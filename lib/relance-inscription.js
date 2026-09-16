// QUI RELANCER, ET SURTOUT QUI NE PAS RELANCER.
//
// Demande d'Alex, 16/09 : relancer le commerçant qui a commencé son inscription
// et s'est arrêté avant le dernier clic. « La Table du Stock » avait rempli son
// adresse, son téléphone et jusqu'à la description de sa salle de réception :
// il ne s'est pas découragé, il a été interrompu.
//
// ⚠️ FICHIER PUR : aucune base, aucun réseau, testable en l'exécutant. Les
// conditions d'envoi d'un email se vérifient au banc, pas en production sur de
// vraies personnes.
//
// 🔴 CE QU'ON PROTÈGE ICI N'EST PAS LE SERVEUR, C'EST LA RELATION. Une relance
// rend service, sept font fuir, et la même personne n'a pas à recevoir deux
// fois le même rappel. Chaque refus porte donc un nom : un envoi qui n'a pas
// lieu doit pouvoir s'expliquer, sinon personne ne saura jamais pourquoi la
// tâche « n'a rien fait ».

import { inscriptionNonTerminee } from './statut-commercant'

// 48 h : le temps de finir tranquillement le lendemain sans se sentir poursuivi.
export const DELAI_RELANCE_HEURES = 48
// Au-delà d'un mois, on laisse tranquille : un rappel arrivé cinq semaines plus
// tard ne relance rien, il surprend.
export const LIMITE_RELANCE_JOURS = 30

// ⚠️ LA RÈGLE DÉCLARE LES COLONNES QU'ELLE LIT. Une seule absente du select et
// elle se tromperait en silence : sans `relance_inscription_envoyee_at`, la
// tâche réexpédierait le même email à chaque passage.
export const COLONNES_RELANCE =
  'id, nom, email, statut_publication, created_at, relance_inscription_envoyee_at'

function heuresDepuis(date, maintenant) {
  const t = new Date(date)
  if (!date || Number.isNaN(t.getTime())) return null
  return (maintenant.getTime() - t.getTime()) / 3600000
}

// Rend la RAISON de ne pas relancer, ou `null` quand il faut relancer.
// Une raison nommée vaut mieux qu'un faux vide : c'est elle qu'on lira dans le
// journal de la tâche le jour où l'on se demandera pourquoi personne n'a rien
// reçu.
export function raisonPasDeRelance(commercant, maintenant = new Date()) {
  if (!commercant) return 'fiche_absente'
  // ⚠️ L'ÉTAT VIENT DE LA RÈGLE PARTAGÉE, jamais d'une comparaison recopiée :
  // c'est exactement ainsi que `brouillon` avait fini par exister dans le code
  // sans exister dans l'admin.
  if (!inscriptionNonTerminee(commercant)) return 'inscription_pas_en_brouillon'
  // 🔴 LE GARDE-FOU QUI JUSTIFIE LA MIGRATION : sans lui, le même email repart
  // à chaque passage de la tâche, tous les jours.
  if (commercant.relance_inscription_envoyee_at) return 'deja_relance'
  if (!commercant.email) return 'pas_d_email'

  const heures = heuresDepuis(commercant.created_at, maintenant)
  // ⚠️ UNE DATE ILLISIBLE NE DÉCLENCHE PAS UN ENVOI. Dans le doute on
  // s'abstient : l'erreur coûte moins cher que l'email de trop.
  if (heures === null) return 'date_inconnue'
  if (heures < DELAI_RELANCE_HEURES) return 'trop_tot'
  if (heures > LIMITE_RELANCE_JOURS * 24) return 'trop_vieux'
  return null
}

export function aRelancer(commercant, maintenant = new Date()) {
  return raisonPasDeRelance(commercant, maintenant) === null
}

// Le tri d'une fournée, avec le détail de ce qui a été écarté et pourquoi.
// ⚠️ ON REND LES ÉCARTÉS, PAS SEULEMENT LES RETENUS : une tâche qui annonce
// « 0 envoi » sans dire lesquels elle a sautés est une tâche qu'on ne peut pas
// déboguer, et c'est ainsi qu'on laisse une relance muette pendant des mois.
export function trierPourRelance(lignes, maintenant = new Date()) {
  const retenus = []
  const ecartes = {}
  for (const c of lignes || []) {
    const raison = raisonPasDeRelance(c, maintenant)
    if (raison === null) { retenus.push(c); continue }
    ecartes[raison] = (ecartes[raison] || 0) + 1
  }
  return { retenus, ecartes }
}
