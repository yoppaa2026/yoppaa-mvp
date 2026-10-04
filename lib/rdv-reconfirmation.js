// REMETTRE UN RENDEZ-VOUS EN CONFIRMÉ (Annul-I2, 04/10)
//
// 🔴 C'ÉTAIT UNE SIMPLE ÉCRITURE DEPUIS LE NAVIGATEUR. Après une annulation par
// le studio ou une absence, l'argent a souvent déjà bougé : l'acompte est
// remboursé, les bons et la récompense sont revenus au client, les produits
// liés sont annulés et remis en rayon, l'absence a pu être facturée. Remettre
// « confirmé » par-dessus laissait un rendez-vous gratuit, des bons
// réutilisables, et un client qui avait reçu « annulé » sans plus rien savoir.
//
// ⚠️ ON NE REFAIT PAS L'ARGENT À L'ENVERS. Re-débiter une carte ou reprendre un
// bon sans le client n'est ni possible ni honnête. Dès qu'un geste d'argent a eu
// lieu, le rendez-vous ne revient pas : on en crée un nouveau, que le client
// paie ou non selon ce que le commerce décide. Il revient seulement quand rien
// n'a bougé, c'est-à-dire le cas de l'erreur de clic qu'on veut défaire.
//
// La règle vit ici, pure, pour que le banc l'EXÉCUTE.

import { euros } from './montants.js'

export const STATUTS_RECONFIRMABLES = ['annule_commercant', 'no_show']

const SUITE = 'Crée-lui plutôt un nouveau rendez-vous.'

/**
 * Pourquoi ce rendez-vous ne peut pas revenir en confirmé, ou `null` s'il le peut.
 *
 * @param etat.statut            statut actuel du rendez-vous
 * @param etat.rembourse         ce que Stripe a déjà rendu sur la carte (€)
 * @param etat.bonsRendus        ce qui est revenu sur ses bons (€)
 * @param etat.recompenseRendue  la récompense de fidélité lui a été rendue
 * @param etat.produitsAnnules   la commande de produits liée est annulée
 * @param etat.absenceFacturee   l'absence a été débitée sur sa carte
 * @param etat.abonnementResilie la séance venait d'un abonnement résilié
 * @param etat.fermeture         'seance' | 'jour' | null : ce qui bloque ce créneau
 */
export function refusRemiseEnConfirme(etat = {}) {
  if (!STATUTS_RECONFIRMABLES.includes(etat.statut)) {
    return { code: 'statut', message: 'Seul un rendez-vous que tu as annulé, ou noté absent, peut revenir en confirmé.' }
  }
  const rembourse = Number(etat.rembourse) || 0
  if (rembourse > 0) {
    return { code: 'rembourse', message: `Cette personne a déjà été remboursée de ${euros(rembourse)} : ce rendez-vous ne peut pas revenir tel quel. ${SUITE}` }
  }
  const bons = Number(etat.bonsRendus) || 0
  if (bons > 0) {
    return { code: 'bon_rendu', message: `${euros(bons)} sont déjà revenus sur son bon : ce rendez-vous ne peut pas revenir tel quel. ${SUITE}` }
  }
  if (etat.recompenseRendue) {
    return { code: 'recompense_rendue', message: `Sa récompense de fidélité lui a été rendue : ce rendez-vous ne peut pas revenir tel quel. ${SUITE}` }
  }
  if (etat.produitsAnnules) {
    return { code: 'produits_annules', message: `Les produits liés ont été annulés et remis en vente : ce rendez-vous ne peut pas revenir tel quel. ${SUITE}` }
  }
  if (etat.absenceFacturee) {
    return { code: 'absence_facturee', message: 'Son absence a déjà été facturée sur sa carte : ce rendez-vous ne peut pas revenir en confirmé.' }
  }
  if (etat.abonnementResilie) {
    return { code: 'abonnement_resilie', message: `Cette séance venait d’un abonnement résilié : elle ne peut pas revenir. ${SUITE}` }
  }
  if (etat.fermeture === 'seance') {
    return { code: 'seance_fermee', message: 'Ce cours est annulé pour tout le monde : rouvre-le d’abord dans Réglages, Fermetures.' }
  }
  if (etat.fermeture === 'jour') {
    return { code: 'jour_ferme', message: 'Ce jour est fermé : rouvre-le d’abord dans Réglages, Fermetures.' }
  }
  return null
}
