// RETRAIT ET LIVRAISON, ET LEURS FILTRES, POUR LE TABLEAU DE BORD ET LE POSTE
// (01/10).
//
// 🔴 « LES COMMANDES DE LIVRAISON APPARAISSENT DANS COMMANDE ET DANS
// LIVRAISON. LE BOUTON COMMANDE DEVRAIT ÊTRE RETRAIT », « IL N'Y A PAS LES
// PASTILLES DE STATUT POUR LES LIVRAISONS », puis « ELLES SONT AUSSI SÉPARÉES
// DANS LE DB PATRON, IL FAUT REPRENDRE LA MÊME STRUCTURE » (Alex, 01/10).
//
// ⚠️ UNE SEULE STRUCTURE, LUE PAR LES DEUX ÉCRANS : deux vues (Retrait,
// Livraison), et les mêmes filtres, dans le même ordre, avec les mêmes mots et
// les mêmes couleurs. Le tableau de bord les avait en ligne ; le Poste en
// avait inventé d'autres. Deux listes finiraient par diverger, et un patron
// qui passe de l'un à l'autre chercherait ses « Nouvelles ».
//
// Fichier PUR : le banc exécute ces filtres sur de vraies formes de commande.

import { STATUTS_COMMANDE_EN_COURS, estCommandeAnnulee } from './statuts-commande'
import { COULEUR_PAR_STATUT } from './couleurs-statut-commande'

export const estLivraison = (c) => c?.mode_retrait === 'livraison'

export const FILTRE_PAR_DEFAUT = 'actives'

/**
 * Les filtres d'une vue, ceux du tableau de bord.
 * `couleur` : la teinte de la pastille active (null = la couleur de l'écran).
 * ⚠️ « Prêtes » comprend une livraison EN ROUTE, comme au tableau de bord :
 * elle est prête, elle est partie, elle n'est pas encore livrée.
 */
export function filtresCommandes(vue) {
  const livraison = vue === 'livraison'
  return [
    { cle: 'actives', label: 'Actives', couleur: null, garde: c => STATUTS_COMMANDE_EN_COURS.includes(c.statut) },
    { cle: 'en_attente', label: 'Nouvelles', couleur: COULEUR_PAR_STATUT.en_attente.badge, garde: c => c.statut === 'en_attente' },
    { cle: 'en_preparation', label: 'En prépa', couleur: COULEUR_PAR_STATUT.en_preparation.badge, garde: c => c.statut === 'en_preparation' },
    { cle: 'pret', label: 'Prêtes', couleur: COULEUR_PAR_STATUT.pret.badge, garde: c => c.statut === 'pret' },
    { cle: 'recupere', label: livraison ? 'Livrées' : 'Récupérées', couleur: COULEUR_PAR_STATUT.recupere.badge, garde: c => c.statut === 'recupere' },
    // Une livraison n'est jamais « non retirée » : le client ne vient pas.
    ...(livraison ? [] : [{ cle: 'non_retire', label: 'Non retirés', couleur: COULEUR_PAR_STATUT.non_retire.badge, garde: c => c.statut === 'non_retire' }]),
    { cle: 'annulees', label: 'Annulées', couleur: COULEUR_PAR_STATUT.annulee_client_refund.badge, garde: estCommandeAnnulee },
    { cle: 'tout', label: 'Tout', couleur: null, garde: () => true },
  ]
}

/** Le filtre retenu, s'il existe dans cette liste ; sinon « Actives ». */
export function filtreValide(filtres, voulu) {
  return filtres.some(f => f.cle === voulu) ? voulu : FILTRE_PAR_DEFAUT
}

/** Les commandes d'une vue : 'livraison', ou tout le reste. */
export function commandesDeLaVue(commandes = [], vue) {
  if (vue === 'livraison') return commandes.filter(estLivraison)
  return commandes.filter(c => !estLivraison(c))
}

/**
 * Les onglets du Poste : Agenda, Retrait, Livraison. « Livraison » paraît pour
 * le livreur (sa vue réduite), ou pour la cuisine dès que le commerce livre ou
 * qu'une livraison est là.
 */
export function ongletsDuPoste(etat = {}) {
  const commandes = Array.isArray(etat.commandes) ? etat.commandes : null
  const livraisons = !!etat.livraisons
    || (!!commandes && (etat.commerce?.livraison_actif === true || commandes.some(estLivraison)))
  return [
    etat.agenda && { cle: 'agenda', label: 'Agenda' },
    commandes && { cle: 'commandes', label: 'Retrait' },
    livraisons && { cle: 'livraisons', label: 'Livraison' },
    // Le comptoir (étape 5) : la carte de fidélité et le bon cadeau.
    etat.comptoir && { cle: 'comptoir', label: 'Comptoir' },
  ].filter(Boolean)
}
