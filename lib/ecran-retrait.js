// Ce que raconte l'écran de retrait, selon ce qu'on vient chercher et où.
//
// LE PROBLÈME QUE CE FICHIER RÈGLE. Un seul écran servait toutes les
// situations, et il avait été dessiné pour UNE seule : la file de la
// boulangerie. « Tu skip la file » et « priorité Yoppers » promettaient d'éviter
// une attente qui n'existe pas dans une boutique de vêtements ni dans un salon.
// Et la ligne d'horaire, absente hors alimentaire, laissait un trou.
//
// LE NUMÉRO NE BOUGE JAMAIS. C'est la clé de la commande, celle par laquelle le
// tableau de bord du commerçant trie et retrouve : le remplacer par un nom
// casserait le seul langage commun entre le client et le commerçant. Le prénom
// l'accompagne, pour la convivialité.
//
// Ce qui change d'un commerce à l'autre, c'est ce qui ENTOURE le numéro.
//
// Textes validés par Alex le 05/08, avec une contrainte explicite : ils doivent
// se comprendre de 6 à 96 ans. Donc pas d'anglicisme (« skip » est parti), pas
// de vocabulaire de facture (« réception » est parti), et le geste est nommé en
// entier (« Fais glisser », pas « Glisse » : c'est le seul geste de l'app qu'on
// n'apprend nulle part ailleurs).

export const RETRAIT_ALIMENTAIRE = 'alimentaire'
export const RETRAIT_BOUTIQUE = 'boutique'
export const RETRAIT_RDV = 'rdv'
export const RETRAIT_LIVRAISON = 'livraison'

// Quel écran pour cette commande ?
export function contexteRetrait(commande) {
  if (commande?.mode_retrait === 'livraison') return RETRAIT_LIVRAISON
  // Produits achetés en même temps qu'un rendez-vous : ils se remettent PENDANT
  // le rendez-vous, il n'y a rien à récupérer à un comptoir.
  if (commande?.rdv_reservation_id) return RETRAIT_RDV
  const categorie = commande?.commercant?.categorie
  if (['detail', 'vitrine'].includes(categorie)) return RETRAIT_BOUTIQUE
  // Un retrait sans créneau ne peut pas être du click and collect à l'heure.
  if (!commande?.creneau && !commande?.creneau_id) return RETRAIT_BOUTIQUE
  return RETRAIT_ALIMENTAIRE
}

// Les textes de l'écran. `contexte` vient de contexteRetrait().
export function textesRetrait(contexte) {
  switch (contexte) {
    case RETRAIT_LIVRAISON:
      return {
        surtitre: 'Ta commande est arrivée',
        badge: 'C\'EST BIEN ARRIVÉ ?',
        libelleGeste: 'Fais glisser pour confirmer',
        sousTexteSucces: 'Bon appétit ! 🟣',
        avecGeste: true,
        // La livraison n'existe qu'en alimentaire aujourd'hui : « bon appétit »
        // est donc juste. Le jour où elle s'ouvre à d'autres commerces, ce texte
        // devra redevenir neutre.
      }
    case RETRAIT_RDV:
      return {
        surtitre: 'Tes produits t\'attendent',
        badge: 'ON TE LES REMET À TON RENDEZ-VOUS',
        libelleGeste: null,
        sousTexteSucces: null,
        // Pas de geste : c'est le commerçant qui remet les produits en fin de
        // prestation, le client a les mains prises.
        avecGeste: false,
      }
    case RETRAIT_BOUTIQUE:
      return {
        surtitre: 'Ta commande t\'attend',
        badge: 'MONTRE CE NUMÉRO',
        libelleGeste: 'Fais glisser pour confirmer',
        sousTexteSucces: 'C\'est récupéré, merci 🟣',
        avecGeste: true,
      }
    default:
      return {
        surtitre: 'Ta commande est prête',
        // Le bénéfice réel, dit avec des mots que tout le monde a. Remplace
        // « PRIORITÉ YOPPERS », qui demandait de connaître la marque pour
        // comprendre l'avantage.
        badge: 'PAS BESOIN DE FAIRE LA FILE',
        libelleGeste: 'Fais glisser pour récupérer',
        sousTexteSucces: 'Pas besoin d\'attendre 🟣',
        avecGeste: true,
      }
  }
}
