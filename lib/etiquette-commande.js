// L'ÉTIQUETTE D'UNE COMMANDE : ce qui sort de la Brother quand la commande
// passe en « prête », et qu'on colle sur le sac (Alex, août : « quand le
// commerçant clique sur commande prête, l'étiquette sort. Simple, basic et
// suffisant »).
//
// Ce fichier dit CE QUE PORTE l'étiquette, rien d'autre. Il ne sait pas
// imprimer : l'impression depuis le navigateur vit dans
// `lib/impression-etiquette.js`, et l'app de comptoir qui imprimera sans
// fenêtre lira la même règle. Deux machines, une seule étiquette.
//
// ⚠️ LE SAC EST VU PAR LES AUTRES CLIENTS. Il attend sur une étagère derrière
// le comptoir : on n'y met que ce qui sert à le retrouver et à le remettre. Le
// prénom et l'initiale du nom, jamais le nom complet, ni le téléphone, ni
// l'adresse email.
//
// ⚠️ PÉRIMÈTRE DÉCIDÉ PAR ALEX : C&C, produits liés à un rendez-vous, boutique,
// et depuis le 01/10 LES LIVRAISONS (« surtout en alimentaire »). Une livraison
// porte en plus sa rue : c'est elle qui range les sacs dans l'ordre de la
// tournée. L'expédition n'imprime pas : son étiquette est celle du transporteur.
//
// ⚠️ PLUSIEURS SACS, PLUSIEURS ÉTIQUETTES NUMÉROTÉES (Alex, 01/10). « Sac 2/3 »
// dit au client et au livreur qu'il en manque un : c'est le sac de boissons
// oublié qu'on évite, pas seulement une étiquette en plus.

import { referenceCommande } from './numero-commande'
import { etatPaiementCommande } from './rdv-paiement'

// Le rouleau de la QL-820NWBc : 62 mm de large, en continu (DK-22205). La
// hauteur est un choix, pas une contrainte : le rouleau continu se coupe où on
// lui dit. ⚠️ À RÉGLER APRÈS LE PREMIER ESSAI SUR LA MACHINE, ici et nulle part
// ailleurs.
export const FORMAT_ETIQUETTE = { largeurMm: 62, hauteurMm: 40, margeMm: 3 }
// Ce que la rue ajoute à une étiquette de livraison (deux lignes au plus).
export const SUPPLEMENT_ADRESSE_MM = 8
// Plus de vingt sacs pour une commande, c'est une faute de frappe.
export const SACS_MAX = 20

/** La commande est-elle de celles qui reçoivent une étiquette ? */
export function etiquetteConcernee(commande) {
  return ['retrait', 'livraison'].includes(commande?.mode_retrait)
}

/** La hauteur d'une étiquette : la rue d'une livraison demande de la place. */
export function hauteurEtiquetteMm(contenu, format = FORMAT_ETIQUETTE) {
  return format.hauteurMm + (contenu?.adresse ? SUPPLEMENT_ADRESSE_MM : 0)
}

/**
 * Une étiquette par sac. Au-delà d'un sac, chacune porte « Sac 2/3 ».
 * Un nombre illisible vaut un sac : on n'imprime jamais zéro étiquette.
 */
export function etiquettesPourSacs(contenu, sacs = 1) {
  const n = Math.min(SACS_MAX, Math.max(1, Math.floor(Number(sacs)) || 1))
  if (n === 1) return [{ ...contenu, sac: null }]
  return Array.from({ length: n }, (_, i) => ({ ...contenu, sac: `Sac ${i + 1}/${n}` }))
}

/**
 * Le nom tel qu'il s'imprime : « Marie Dupont » → « Marie D. ».
 * « Jean-Pierre Van Damme » → « Jean-Pierre V. ». Un seul mot reste tel quel.
 */
export function nomEtiquette(nomComplet) {
  const mots = String(nomComplet || '').trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return 'Client'
  if (mots.length === 1) return mots[0]
  return `${mots[0]} ${mots[1].charAt(0).toUpperCase()}.`
}

const heure = (h) => (h ? String(h).slice(0, 5) : null)

function jourCourt(dateISO) {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}/.test(String(dateISO))) return null
  try {
    return new Date(String(dateISO).slice(0, 10) + 'T12:00:00')
      .toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
  } catch {
    return null
  }
}

/**
 * Quand le client vient la chercher, en une ligne.
 *
 * ⚠️ UNE COMMANDE LIÉE À UN RENDEZ-VOUS NE SE RETIRE PAS AU COMPTOIR : on la
 * remet pendant la prestation. Le dire sur le sac évite qu'elle attende sur
 * l'étagère un client qui ne passera jamais la chercher.
 */
export function quandEtiquette(commande = {}) {
  if (commande.rdv_reservation_id || commande.rdv) {
    const h = heure(commande.rdv?.heure_debut)
    return h ? `À remettre au rendez-vous de ${h}` : 'À remettre au rendez-vous'
  }
  const livraison = commande.mode_retrait === 'livraison'
  // ⚠️ LA LIVRAISON A SON PROPRE CRÉNEAU, dans une autre table : lire
  // `creneau` seul donnait une étiquette de livraison sans heure.
  const cren = livraison ? (commande.creneau_livraison || commande.creneau) : commande.creneau
  const jour = jourCourt(commande.date_commande)
  if (cren?.heure_debut) {
    const plage = cren.heure_fin ? `${heure(cren.heure_debut)} – ${heure(cren.heure_fin)}` : heure(cren.heure_debut)
    const quand = jour ? `${jour} · ${plage}` : plage
    return livraison ? `Livraison ${quand}` : quand
  }
  if (livraison) return jour ? `Livraison ${jour}` : 'Livraison'
  return 'Retrait en boutique'
}

/** « 3 articles », ou null si la commande n'en dit rien. */
export function articlesEtiquette(commande = {}) {
  const lignes = Array.isArray(commande.commande_articles) ? commande.commande_articles : []
  const n = lignes.reduce((s, l) => s + (Number(l?.quantite) > 0 ? Number(l.quantite) : 0), 0)
  if (n <= 0) return null
  return `${n} article${n > 1 ? 's' : ''}`
}

/**
 * Tout ce que porte l'étiquette.
 *
 * ⚠️ LE PAIEMENT VIENT DE `etatPaiementCommande`, la règle de la carte du
 * tableau de bord et du Poste. Une étiquette qui dirait « Payé » quand la carte
 * dit « À payer 12,50 € » ferait remettre un sac sans encaisser.
 */
export function contenuEtiquette(commande = {}, { categorie = null } = {}) {
  const paiement = etatPaiementCommande(commande, { categorie })
  const adresse = commande.mode_retrait === 'livraison'
    ? (String(commande.adresse_livraison || '').trim() || null)
    : null
  return {
    reference: referenceCommande(commande),
    client: nomEtiquette(commande.client_nom),
    // ⚠️ La rue, sur une livraison SEULEMENT : sur un sac de retrait elle
    // n'aide personne et s'expose à tous les clients du comptoir.
    adresse,
    quand: quandEtiquette(commande),
    articles: articlesEtiquette(commande),
    paiement: paiement?.libelle || null,
    aEncaisser: paiement?.cle === 'du',
  }
}

// L'étiquette d'essai : de quoi régler la machine sans attendre une commande.
export const ETIQUETTE_ESSAI = {
  reference: 'ESSAI',
  client: 'Marie D.',
  quand: 'Aujourd’hui · 11:15 – 11:30',
  articles: '3 articles',
  paiement: 'À payer 12,50 €',
  aEncaisser: true,
}
