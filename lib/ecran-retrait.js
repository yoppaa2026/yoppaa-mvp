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
export const RETRAIT_EXPEDITION = 'expedition'

// Quel écran pour cette commande ?
export function contexteRetrait(commande) {
  if (commande?.mode_retrait === 'livraison') return RETRAIT_LIVRAISON
  // Un colis ne se retire nulle part : il arrive. Sans ce cas, l'expédition
  // héritait des étapes du retrait et demandait au client de se déplacer.
  if (commande?.mode_retrait === 'expedition') return RETRAIT_EXPEDITION
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

// ─── L'écran de confirmation, juste après la commande ───────────────────────
//
// MÊME LOGIQUE, MÊME PIÈGE. La confirmation n'avait que deux variantes,
// livraison et « le reste ». Résultat, elle mentait deux fois : une commande
// en boutique lisait « tu te rends chez X À TON CRÉNEAU » alors qu'aucun
// créneau n'existe, et un COLIS EXPÉDIÉ recevait les mêmes étapes, donc on
// demandait au client d'aller chercher un paquet qui arrive par la poste.
//
// Le titre « Yoppé ! 🟣 » ne bouge pas : c'est la signature de la marque, et
// c'est le seul moment où elle a le droit de faire la fête.
//
// Les `**` encadrent ce qui doit ressortir en gras. Le rendu vit dans la page,
// la formulation vit ici, testable.
export function textesConfirmation(contexte, { commercantNom = 'ton commerçant', avecProduits = false } = {}) {
  const chez = `**${commercantNom}**`
  switch (contexte) {
    case RETRAIT_LIVRAISON:
      return {
        titre: 'Yoppé ! 🟣',
        sousTitre: 'On te prévient quand ta commande part en livraison.',
        etapes: [
          `On te prévient quand ${chez} part te livrer.`,
          'On te livre à **ton adresse**, sur ton créneau.',
          'Tu reçois ta commande et tu confirmes la **livraison**. C\'est tout !',
        ],
      }
    case RETRAIT_EXPEDITION:
      return {
        titre: 'Yoppé ! 🟣',
        sousTitre: 'On te prévient dès que ton colis part.',
        etapes: [
          `${chez} prépare ton colis.`,
          'Tu reçois ton **numéro de suivi** au moment de l\'envoi.',
          'Le colis arrive **chez toi**. Rien à faire de plus.',
        ],
      }
    case RETRAIT_RDV:
      return {
        titre: 'Yoppé ! 🟣',
        sousTitre: avecProduits
          ? 'Ton rendez-vous est réservé et tes produits sont mis de côté.'
          : 'Ton rendez-vous est réservé.',
        etapes: avecProduits
          ? [
            'Ton rendez-vous est **confirmé**, tu reçois l\'email et le fichier pour ton calendrier.',
            `Tes produits t\'attendent chez ${chez}, **déjà payés**.`,
            'On te les remet **le jour de ton rendez-vous**. Rien à repayer sur place.',
          ]
          : [
            'Ton rendez-vous est **confirmé**, tu reçois l\'email et le fichier pour ton calendrier.',
            'On te rappelle **la veille**, pour que tu n\'y penses plus.',
            `Tu te présentes chez ${chez} à l\'heure prévue.`,
          ],
      }
    case RETRAIT_BOUTIQUE:
      return {
        titre: 'Yoppé ! 🟣',
        // Pas d'horaire annoncé : c'est le commerçant qui donne le signal, et
        // promettre une heure qu'il n'a pas confirmée enverrait le client
        // devant une commande pas prête.
        sousTitre: 'On te prévient dès qu\'elle t\'attend en boutique.',
        etapes: [
          `${chez} prépare ta commande.`,
          'On te prévient **dès qu\'elle t\'attend**. Tu passes quand ça t\'arrange, pendant les heures d\'ouverture.',
          'Tu montres **ton numéro** et tu **fais glisser** pour confirmer.',
        ],
      }
    default:
      return {
        titre: 'Yoppé ! 🟣',
        sousTitre: 'On te prévient quand c\'est prêt à retirer.',
        etapes: [
          'On te prévient quand ta commande est **prête à retirer**.',
          `Tu te rends chez ${chez} **à ton créneau**.`,
          'Tu **fais glisser** pour confirmer, et tu passes devant tout le monde.',
        ],
      }
  }
}
