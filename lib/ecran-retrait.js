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

// ─── Un rendez-vous porte-t-il ENCORE ses produits ? ─────────────────────────
//
// ⚠️ CETTE QUESTION MANQUAIT, ET L'ÉCRAN MENTAIT. Quand le client annule son
// rendez-vous, on lui demande le sort de ses produits : rendus, ou gardés. S'il
// les garde, il n'est remboursé que de son acompte et **la commande survit** en
// boutique. Or elle conservait son `rdv_reservation_id`, donc l'écran continuait
// d'annoncer « On te les remet à ton rendez-vous, mercredi 12 août » pour un
// rendez-vous qui n'existait plus. Sans numéro à montrer, sans geste, sans
// aucun moyen d'aller les chercher. Même impasse après un no-show.
//
// La règle : le rendez-vous ne porte les produits que tant qu'il tient debout.
// Dès qu'il tombe, la commande REDEVIENT un retrait en magasin ordinaire, et
// retrouve tout ce qui va avec : le numéro, le geste, les rappels, et le bouton
// « client non venu » côté commerçant.
export const RDV_PORTE_LES_PRODUITS = ['confirme', 'honore']

export function rdvPorteLesProduits(rdv) {
  // Rendez-vous non chargé : on ne présume pas sa mort. Une commande qui vient
  // d'être passée en a forcément un vivant, et c'est le cas de l'écran de
  // confirmation, qui n'a pas encore relu la jointure.
  if (!rdv) return true
  return RDV_PORTE_LES_PRODUITS.includes(rdv.statut)
}

// Quel écran pour cette commande ?
export function contexteRetrait(commande) {
  if (commande?.mode_retrait === 'livraison') return RETRAIT_LIVRAISON
  // Un colis ne se retire nulle part : il arrive. Sans ce cas, l'expédition
  // héritait des étapes du retrait et demandait au client de se déplacer.
  if (commande?.mode_retrait === 'expedition') return RETRAIT_EXPEDITION
  // Produits achetés en même temps qu'un rendez-vous : ils se remettent PENDANT
  // le rendez-vous, il n'y a rien à récupérer à un comptoir. Tant qu'il tient.
  if (commande?.rdv_reservation_id && rdvPorteLesProduits(commande.rdv)) return RETRAIT_RDV
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
// LE VERBE SE CONJUGUE (décision Alex, 05/08). « Yoppé » seul ne dit rien de
// ce qui vient de se passer : au moment précis où le client vient de payer,
// c'est le pic d'inquiétude, et un mot inventé sans contexte n'y répond pas.
//
// Attaché à son objet, il s'explique tout seul : dans « Ta commande est
// Yoppée », le mot occupe exactement la place de « confirmée », et même
// quelqu'un qui ne l'a jamais lu comprend. Le mot s'apprend à la première
// commande, et la marque devient un verbe — ce que presque aucune marque
// n'obtient.
//
// ⚠️ ACCORD : commande, table et réservation sont FÉMININS (Yoppée), rendez-vous
// et article sont MASCULINS (Yoppé). C'est la promesse faite aux commerçants sur
// la page d'inscription, il faut la tenir à la lettre.
//
// Les `**` encadrent ce qui doit ressortir en gras. Le rendu vit dans la page,
// la formulation vit ici, testable.
export function textesConfirmation(contexte, { commercantNom = 'ton commerçant', avecProduits = false } = {}) {
  const chez = `**${commercantNom}**`
  switch (contexte) {
    case RETRAIT_LIVRAISON:
      return {
        titre: 'Ta commande est Yoppée ! 🟣',
        sousTitre: 'On te prévient quand ta commande part en livraison.',
        etapes: [
          `On te prévient quand ${chez} part te livrer.`,
          'On te livre à **ton adresse**, sur ton créneau.',
          'Tu reçois ta commande et tu confirmes la **livraison**. C\'est tout !',
        ],
      }
    case RETRAIT_EXPEDITION:
      return {
        titre: 'Ta commande est Yoppée ! 🟣',
        sousTitre: 'On te prévient dès que ton colis part.',
        etapes: [
          `${chez} prépare ton colis.`,
          'Tu reçois ton **numéro de suivi** au moment de l\'envoi.',
          'Le colis arrive **chez toi**. Rien à faire de plus.',
        ],
      }
    case RETRAIT_RDV:
      return {
        titre: 'Ton RDV est Yoppé ! 🟣',
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
        titre: 'Ta commande est Yoppée ! 🟣',
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
        titre: 'Ta commande est Yoppée ! 🟣',
        sousTitre: 'On te prévient quand c\'est prêt à retirer.',
        etapes: [
          'On te prévient quand ta commande est **prête à retirer**.',
          `Tu te rends chez ${chez} **à ton créneau**.`,
          'Tu **fais glisser** pour confirmer, et tu passes devant tout le monde.',
        ],
      }
  }
}
