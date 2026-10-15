// LE GESTE QUE GOOGLE PEUT PROPOSER SUR UNE FICHE.
//
// ⚠️ DEMANDE D'ALEX (24/08) : « est-ce qu'on sait connecter les fiches des
// commerçants Vendre vers le bouton Commander ou Réserver de Google ? »
//
// Il y a DEUX chemins, et ce fichier sert aux deux :
//
//   1) LE LIEN D'ACTION que le commerçant colle lui-même dans sa fiche
//      d'établissement Google (« Commander en ligne », « Réservations »,
//      « Prendre rendez-vous »). Gratuit, immédiat, aucun développement — mais
//      encore faut-il lui DIRE quoi coller et où. C'est le kit média qui s'en
//      charge.
//
//   2) LE BALISAGE `potentialAction` du JSON-LD de sa fiche, qui déclare aux
//      moteurs où l'on commande chez lui. Ça ne garantit aucun bouton, Google
//      reste souverain, mais c'est le signal standard et il est gratuit.
//
// ⚠️ ET LA RÈGLE QUI COMPTE : ON NE DÉCLARE QUE CE QUE LE COMMERÇANT PEUT
// RÉELLEMENT HONORER. Annoncer « on commande ici » pour un commerce du palier
// Exister enverrait le client sur une fiche sans panier. Une promesse tenue par
// personne coûte plus cher qu'une absence de promesse, et c'est Google qui la
// répète.
//
// 🔴 15/10 (Alex, le Bistrologue) : LA RÈGLE NE REGARDAIT QUE LE FORFAIT. Un
// restaurant qui ne prend QUE des tables annonçait « Commander en ligne » à
// Google, et le kit ne lui donnait AUCUN lien de réservation, alors que c'est
// tout ce qu'il fait. Un commerce peut maintenant déclarer DEUX gestes, et
// chacun n'est déclaré que s'il est vraiment ouvert :
//   • réserver : l'interrupteur des réservations est allumé ET le forfait le
//     permet (`reservationActive`, la règle de la fiche) ;
//   • commander : le forfait le permet, l'interrupteur des commandes est
//     allumé, ET une commande peut aller jusqu'au bout aujourd'hui
//     (`commandeRealisable`, lue par l'appelant : un article vendu en ligne et
//     une façon de le recevoir). Sans cette preuve, on se tait.

import { canDo, planEffectif, commandeAllumee, isAlimentaire } from './plans.js'
import { reservationActive, motsReservation } from './reservation-metier.js'
// 🔴 `BASE` VIVAIT ICI, TROISIÈME COPIE DU MÊME DOMAINE. Il est parti le 06/09
// avec celui de la page kit : une adresse écrite plusieurs fois est une adresse
// qui finit par ne plus dire la même chose, et celle-ci part chez Google.
//
// ⚠️ ET LE BRANCHEMENT PAR GESTE RESTE, LUI. Ce n'est pas de la dette,
// c'est la raison d'être de ce fichier : une `ReserveAction` doit mener à
// l'agenda et une `OrderAction` à la boutique. C'est le seul endroit du projet
// où viser l'agenda est délibéré ET annoncé à un tiers.
import { lienFiche, lienFicheRdv } from './lien-fiche.js'

/**
 * Les gestes transactionnels d'un commerçant : zéro, un ou deux.
 *
 * @param {{plan?:string, categorie?:string, slug?:string, rdv_actif?:boolean,
 *          commande_actif?:boolean}} commercant
 * @param {{commandeRealisable?:boolean, maintenant?:Date}} options
 *        `commandeRealisable` : `true` seulement si l'appelant a VÉRIFIÉ qu'une
 *        commande peut aller jusqu'au bout. Absent, on ne déclare pas la commande.
 * @returns {Array<{type:'commander'|'reserver', schemaType:string, url:string,
 *            libelle:string, champGoogle:string}>}
 */
export function actionsCommerce(commercant, { commandeRealisable = false, maintenant = new Date() } = {}) {
  const slug = commercant?.slug
  if (!slug) return []

  // 🔴 LE FORFAIT EFFECTIF (15/09). La fiche accepte déjà les commandes d'un
  // commerçant en essai de Vendre : le taire à Google, c'est taire ce qu'elle
  // tient. ⚠️ Le select appelant doit charger `essai_plan` et `created_at`,
  // sinon on retombe en silence sur le forfait choisi.
  const plan = planEffectif(commercant, maintenant)
  const actions = []

  // ⚠️ UN COMMERCE VITRINE (coiffeur, kiné, club de yoga) NE SE COMMANDE PAS,
  // il se réserve — et sa fiche vit sur une AUTRE route. Se tromper ici, c'est
  // envoyer le client de Google sur une page qui le redirige aussitôt.
  // Alimentaire et détail : on commande. ⚠️ `canDo` sans catégorie, EXACTEMENT
  // comme la fiche et les cartes d'accueil (`peutCommander`).
  if (commercant.categorie !== 'vitrine'
      && canDo(plan, 'commande') && commandeAllumee(commercant) && commandeRealisable === true) {
    actions.push({
      type: 'commander',
      schemaType: 'OrderAction',
      url: lienFiche(slug),
      libelle: 'Commander en ligne',
      champGoogle: 'Commander en ligne',
    })
  }

  // La réservation, sous le nom de son métier : « Réserver une table » chez un
  // restaurant, « Prendre rendez-vous » ailleurs. Même règle que la fiche.
  if (reservationActive(commercant, maintenant)) {
    const table = isAlimentaire(commercant)
    actions.push({
      type: 'reserver',
      schemaType: 'ReserveAction',
      url: lienFicheRdv(slug),
      libelle: motsReservation(commercant).action,
      champGoogle: table ? 'Réservations' : 'Prendre rendez-vous',
    })
  }

  return actions
}

/** Le premier geste, ou `null` (les bancs et les écrans qui n'en montrent qu'un). */
export function actionCommerce(commercant, options) {
  return actionsCommerce(commercant, options)[0] || null
}

/**
 * Le bloc `potentialAction` à greffer dans le JSON-LD de la fiche.
 * Rend `{}` quand il n'y a rien à déclarer, pour un étalement direct ; une
 * liste quand le commerce fait les deux.
 */
export function potentialActionJsonLd(commercant, options) {
  const blocs = actionsCommerce(commercant, options).map(action => ({
    '@type': action.schemaType,
    name: action.libelle,
    target: {
      '@type': 'EntryPoint',
      urlTemplate: action.url,
      // Les trois plateformes de schema.org : sans elles, l'action est
      // considérée comme valable nulle part.
      actionPlatform: [
        'http://schema.org/DesktopWebPlatform',
        'http://schema.org/MobileWebPlatform',
        'http://schema.org/IOSPlatform',
      ],
    },
  }))
  if (blocs.length === 0) return {}
  return { potentialAction: blocs.length === 1 ? blocs[0] : blocs }
}

// Où arrive le client de Google, dit comme le commerçant le pense.
function destination(action, commercant) {
  if (action.type === 'commander') return 'ta page de commande'
  return isAlimentaire(commercant) ? 'ta réservation de table' : 'ta prise de rendez-vous'
}

/**
 * Les instructions du kit média : ce que le commerçant colle dans SA fiche
 * Google, et dans quel champ. Un lien par geste ouvert.
 *
 * ⚠️ ON NE PROMET PAS UN BOUTON. Google décide de ce qu'il affiche, et ce que
 * l'on maîtrise s'arrête au lien. Le texte le dit.
 */
export function consigneGoogle(commercant, options) {
  const actions = actionsCommerce(commercant, options)
  if (actions.length === 0) return null
  const plusieurs = actions.length > 1
  return {
    titre: plusieurs ? 'Ajoute ces liens à ta fiche Google' : 'Ajoute ce lien à ta fiche Google',
    liens: actions.map(a => ({ champ: a.champGoogle, url: a.url, libelle: a.libelle })),
    etapes: [
      'Ouvre ta fiche d’établissement Google (Google Business Profile).',
      'Va dans « Modifier le profil ».',
      plusieurs
        ? 'Colle chaque lien ci-dessous dans le champ indiqué, puis enregistre.'
        : `Colle le lien ci-dessous dans le champ « ${actions[0].champGoogle} », puis enregistre.`,
    ],
    note: `Les clients qui te trouvent sur Google ou Maps arrivent alors directement sur ${actions.map(a => destination(a, commercant)).join(' ou ')}.`,
  }
}
