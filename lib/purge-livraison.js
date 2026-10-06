// L'ADRESSE DE LIVRAISON NE VIT PAS SEPT ANS (audit livraison, mineur ;
// décision d'Alex le 06/10 : « si tu penses que 6 mois sont suffisants et
// légal, go pour 6 »).
//
// 🔴 POURQUOI. Une commande se garde 7 ans (pièce comptable du commerçant),
// mais rien n'oblige à garder l'adresse, la position de la maison et la note
// de livraison : un ticket B2C n'en a pas besoin. Elles restaient pourtant
// indéfiniment, et ne s'effaçaient qu'à la suppression du compte. Le RGPD
// demande de ne garder une donnée que le temps nécessaire : 6 mois couvrent
// largement les litiges et les contestations de paiement (120 jours chez
// Stripe). Le reste de la commande est gardé.
//
// Fichier PUR : la tâche mensuelle l'applique, le banc l'exécute.

import { jourBruxelles } from './timezone.js'

export const DUREE_ADRESSE_LIVRAISON_MOIS = 6

// Les colonnes effacées, et SEULEMENT elles : le mode, les frais, le total et
// la TVA restent (comptabilité).
export const COLONNES_PURGEES = ['adresse_livraison', 'livraison_lat', 'livraison_lng', 'note_livraison']

/**
 * La date (AAAA-MM-JJ, jour belge) avant laquelle une commande perd son
 * adresse. Le 31 août moins 6 mois donne le 28 février (ou le 29), jamais le
 * 3 mars : un mois trop court ne fait pas déborder le compte.
 */
export function dateLimitePurge(maintenant = new Date(), mois = DUREE_ADRESSE_LIVRAISON_MOIS) {
  const jour = jourBruxelles(maintenant)
  const [a, m, j] = jour.split('-').map(Number)
  if (!a || !m || !j) return null
  let annee = a, moisCible = m - mois
  while (moisCible <= 0) { moisCible += 12; annee -= 1 }
  const dernierJour = new Date(Date.UTC(annee, moisCible, 0)).getUTCDate()
  const jj = Math.min(j, dernierJour)
  return `${annee}-${String(moisCible).padStart(2, '0')}-${String(jj).padStart(2, '0')}`
}

/** Ce que la tâche écrit : chaque colonne purgée à `null`. */
export function effacement() {
  return Object.fromEntries(COLONNES_PURGEES.map(c => [c, null]))
}
