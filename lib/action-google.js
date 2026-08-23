// LE GESTE QUE GOOGLE PEUT PROPOSER SUR UNE FICHE.
//
// ⚠️ DEMANDE D'ALEX (24/08) : « est-ce qu'on sait connecter les fiches des
// commerçants Vendre vers le bouton Commander ou Réserver de Google ? »
//
// Il y a DEUX chemins, et ce fichier sert aux deux :
//
//   1) LE LIEN D'ACTION que le commerçant colle lui-même dans sa fiche
//      d'établissement Google (« Commander en ligne », « Prendre rendez-vous »).
//      Gratuit, immédiat, aucun développement — mais encore faut-il lui DIRE
//      quoi coller et où. C'est le kit média qui s'en charge.
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

import { canDo } from './plans.js'

const BASE = 'https://www.yoppaa.app'

/**
 * Le geste transactionnel d'un commerçant, ou `null` s'il n'en a aucun.
 *
 * @param {{plan?:string, categorie?:string, slug?:string}} commercant
 * @returns {{type:'commander'|'reserver', schemaType:string, url:string,
 *            libelle:string, champGoogle:string}|null}
 */
export function actionCommerce(commercant) {
  const slug = commercant?.slug
  if (!slug) return null

  // ⚠️ UN COMMERCE VITRINE (coiffeur, kiné, club de yoga) NE SE COMMANDE PAS,
  // il se réserve — et sa fiche vit sur une AUTRE route. Se tromper ici, c'est
  // envoyer le client de Google sur une page qui le redirige aussitôt.
  if (commercant.categorie === 'vitrine') {
    if (!canDo(commercant.plan, 'rdv')) return null
    return {
      type: 'reserver',
      schemaType: 'ReserveAction',
      url: `${BASE}/commander/rdv/${encodeURIComponent(slug)}`,
      libelle: 'Prendre rendez-vous',
      champGoogle: 'Prendre rendez-vous',
    }
  }

  // Alimentaire et détail : on commande. ⚠️ `canDo` sans catégorie, EXACTEMENT
  // comme la fiche et les cartes d'accueil (`peutCommander`) : une boutique de
  // détail vend en ligne elle aussi. Deux règles pour la même question, ce
  // serait deux vérités qui finissent par diverger.
  if (!canDo(commercant.plan, 'commande')) return null
  return {
    type: 'commander',
    schemaType: 'OrderAction',
    url: `${BASE}/commander/${encodeURIComponent(slug)}`,
    libelle: 'Commander en ligne',
    champGoogle: 'Commander en ligne',
  }
}

/**
 * Le bloc `potentialAction` à greffer dans le JSON-LD de la fiche.
 * Rend `{}` quand il n'y a rien à déclarer, pour un étalement direct.
 */
export function potentialActionJsonLd(commercant) {
  const action = actionCommerce(commercant)
  if (!action) return {}
  return {
    potentialAction: {
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
    },
  }
}

/**
 * Les instructions du kit média : ce que le commerçant colle dans SA fiche
 * Google, et dans quel champ.
 *
 * ⚠️ ON NE PROMET PAS UN BOUTON. Google décide de ce qu'il affiche, et ce que
 * l'on maîtrise s'arrête au lien. Le texte le dit.
 */
export function consigneGoogle(commercant) {
  const action = actionCommerce(commercant)
  if (!action) return null
  return {
    titre: 'Ajoute ce lien à ta fiche Google',
    champ: action.champGoogle,
    url: action.url,
    etapes: [
      'Ouvre ta fiche d’établissement Google (Google Business Profile).',
      `Va dans « Modifier le profil », puis dans le champ « ${action.champGoogle} ».`,
      'Colle le lien ci-dessous et enregistre.',
    ],
    note: action.type === 'reserver'
      ? 'Les clients qui te trouvent sur Google ou Maps arrivent alors directement sur ta prise de rendez-vous.'
      : 'Les clients qui te trouvent sur Google ou Maps arrivent alors directement sur ta page de commande.',
  }
}
