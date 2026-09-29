// CE QUE LE POSTE ÉQUIPE LIT, COLONNE PAR COLONNE (29/09).
//
// 🔴 LES COLONNES SONT NOMMÉES, JAMAIS `*`. Le tableau de bord du patron lit
// `select('*')`, et ramène ainsi le jeton d'annulation de chaque client (de
// quoi annuler « comme lui », remboursement compris), les identifiants Stripe
// et l'email des clients. Ici, chaque colonne est choisie :
//   • ce qu'il faut pour travailler : qui, quand, quoi, combien de couverts,
//     les notes du client, le téléphone pour le rappeler ;
//   • ce que les calculs de paiement lisent (`etatPaiementRdv`,
//     `etatPaiementCommande`) : le personnel encaisse, il doit savoir ce qui
//     reste à payer ;
//   • et rien d'autre. Jamais `annulation_token`, `stripe_*`, `empreinte_*`
//     (sauf ce qui se lit), `client_email`, `notes_commercant` (la note privée
//     du patron), `bons_utilises`.
//
// ⚠️ UNE COLONNE ABSENTE FAIT ÉCHOUER TOUTE LA LECTURE. Chaque nom ci-dessous
// existe (relevé `scripts/schema-supabase.txt` et migrations ultérieures), et
// le banc refuse ceux qui n'existent pas sur `commandes` : `client_prenom`,
// `updated_at`, `note`, `date_retrait`.

import { jourCivilPlus } from './timezone.js'
import { resteAEncaisserCommande } from './rdv-paiement.js'
import { referenceCommande } from './numero-commande.js'
import { STATUTS_COMMANDE_EN_COURS } from './statuts-commande.js'

export const COLONNES_RDV_EQUIPE = [
  'id', 'numero_rdv', 'numero_prefixe', 'numero_semaine', 'date_rdv', 'heure_debut', 'heure_fin', 'duree_minutes',
  'statut', 'client_prenom', 'client_nom', 'client_telephone', 'notes_client', 'couverts', 'place_no',
  'capacite_creneau', 'prestation_id', 'praticien_id', 'source', 'abonnement_id', 'lieu_libelle', 'lieu_adresse',
  'commande_id', 'motif_annulation',
  // Ce que lit le calcul du paiement.
  'prix_estime', 'acompte_montant', 'acompte_paye', 'acompte_paye_en_ligne', 'fidelite_remise', 'bon_cadeau_montant',
  'encaisse_mode', 'encaisse_montant',
].join(', ') + ', prestation:rdv_prestations(nom, duree_minutes, par_couverts), praticien:rdv_praticiens(id, prenom, nom, couleur_hex, photo_url)'

export const COLONNES_CRENEAU_RDV_EQUIPE = 'id, praticien_id, jour_semaine, date_specifique, heure_debut, heure_fin, pause_debut, pause_fin, pas_minutes, actif, lieu_id'
export const COLONNES_PRATICIEN_EQUIPE = 'id, prenom, nom, couleur_hex, photo_url, actif, ordre'

export const COLONNES_COMMANDE_EQUIPE = [
  'id', 'numero_commande', 'numero_prefixe', 'numero_semaine', 'statut', 'mode_retrait', 'date_commande', 'created_at',
  'creneau_id', 'creneau_livraison_id', 'client_nom', 'client_telephone', 'adresse_livraison', 'note_livraison',
  'statut_livraison', 'expedition_transporteur', 'expedition_suivi', 'lieu_libelle', 'lieu_adresse',
  'rdv_reservation_id', 'pret_at', 'recupere_at', 'annulee_at', 'annulation_motif',
  // Ce que lit le calcul du paiement.
  'total', 'frais_livraison', 'paye_en_ligne', 'encaisse_mode', 'encaisse_montant', 'bon_cadeau_montant', 'fidelite_remise',
].join(', ') + ', creneau:creneaux(heure_debut, heure_fin), creneau_livraison:livraison_creneaux(heure_debut, heure_fin), commande_articles(quantite, article_nom, options)'

// Ce qui doit arriver jusqu'à l'écran de l'équipe pour décrire le commerce.
export const COLONNES_COMMERCE_POSTE = 'id, nom, type, categorie, horaires_detail, livraison_actif, horizon_commande, rdv_actif'

/**
 * Les jours que le Poste charge, en heure belge.
 *
 * L'agenda : la semaine passée (un « venu » à noter, une réservation à
 * retrouver) et deux mois devant. Les commandes : deux jours derrière, et
 * l'horizon du commerce devant, une semaine au moins.
 */
export function fenetres(aujourdhui, { horizonCommande = 1 } = {}) {
  const horizon = Math.max(7, Number(horizonCommande) || 1)
  return {
    agenda: { debut: jourCivilPlus(aujourdhui, -7), fin: jourCivilPlus(aujourdhui, 60) },
    commandes: { debut: jourCivilPlus(aujourdhui, -2), fin: jourCivilPlus(aujourdhui, horizon) },
  }
}

/**
 * CE QUE VOIT LE LIVREUR, et rien d'autre (brief du 10/09) : le nom pour la
 * sonnette, l'adresse, le téléphone, le créneau, le commentaire (code de
 * porte, étage), le statut, et le montant à encaisser SEULEMENT si le client
 * paie à la porte.
 *
 * ⚠️ PAS le contenu de la commande, PAS le total d'une commande déjà payée,
 * PAS l'email. Le serveur retire tout le reste avant l'envoi : ce que l'écran
 * n'a pas reçu, il ne peut pas le montrer.
 */
export function livraisonPourLeLivreur(c) {
  const reste = resteAEncaisserCommande(c)
  return {
    id: c.id,
    reference: referenceCommande(c),
    client_nom: c.client_nom || null,
    client_telephone: c.client_telephone || null,
    adresse: c.adresse_livraison || null,
    note: c.note_livraison || null,
    date: c.date_commande || null,
    creneau: c.creneau_livraison ? { heure_debut: c.creneau_livraison.heure_debut, heure_fin: c.creneau_livraison.heure_fin } : null,
    creneau_livraison_id: c.creneau_livraison_id || null,
    statut: c.statut,
    statut_livraison: c.statut_livraison || null,
    a_encaisser: reste > 0 ? reste : null,
  }
}

// ⚠️ UNE DATE « AAAA-MM-JJ » EST UN JOUR, PAS UN INSTANT. Lue comme un
// instant, elle serait minuit à Greenwich, donc la veille au soir chez nous
// pour un navigateur mal réglé. On la pose à midi, en temps universel, et on
// la formate en temps universel : le jour ne peut plus glisser.
const JOUR_LONG = new Intl.DateTimeFormat('fr-BE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })

/** « Aujourd'hui », « Demain », « Hier », sinon « jeudi 2 octobre ». */
export function libelleJourPoste(dateStr, aujourdhui = null) {
  const s = String(dateStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  if (aujourdhui) {
    if (s === aujourdhui) return 'Aujourd’hui'
    if (s === jourCivilPlus(aujourdhui, 1)) return 'Demain'
    if (s === jourCivilPlus(aujourdhui, -1)) return 'Hier'
  }
  return JOUR_LONG.format(new Date(`${s}T12:00:00Z`))
}

/** Une livraison du jour est-elle encore à faire, ou faite aujourd'hui ? */
export function livraisonDuJour(c, aujourdhui) {
  if (c.mode_retrait !== 'livraison' || c.date_commande !== aujourdhui) return false
  return STATUTS_COMMANDE_EN_COURS.includes(c.statut) || c.statut === 'recupere'
}

/** L'ordre de la tournée tant qu'elle n'est pas optimisée : créneau, puis numéro. */
export function trierLivraisons(liste = []) {
  const heure = (l) => l.creneau?.heure_debut || '99:99'
  return [...liste].sort((a, b) => heure(a).localeCompare(heure(b)) || String(a.reference || '').localeCompare(String(b.reference || ''), 'fr', { numeric: true }))
}
