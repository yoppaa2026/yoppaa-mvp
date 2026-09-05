// L'ADRESSE PUBLIQUE D'UN COMMERÇANT, ÉCRITE UNE SEULE FOIS.
//
// 🔴 ELLE ÉTAIT CONSTRUITE À LA MAIN DANS SEPT ENDROITS AU MOINS : les emails
// transactionnels, la fiche Google, le kit papier, l'affichette, le partage de
// l'accueil. Sept chaînes qui disent la même chose, donc sept occasions de
// diverger le jour où une route bouge.
//
// ⚠️ AUCUN BRANCHEMENT PAR CATÉGORIE, ET C'EST VÉRIFIÉ. On pourrait croire qu'un
// commerce de services doit pointer vers `/commander/rdv/<slug>` : c'est ce que
// fait la navigation interne. Mais `/commander/<slug>` REDIRIGE lui-même un
// commerce vitrine vers sa fiche rendez-vous quand il n'a aucun produit actif,
// et lui montre sa boutique quand il en a. C'est donc la SEULE adresse qui
// convient dans tous les cas, et la seule qu'on puisse coller sur une affiche
// sans se demander ce que vend le commerçant.
//
// ⚠️ ET C'EST ELLE QUI PORTE L'APERÇU DE PARTAGE. Le titre, la description et
// l'image que Facebook affiche viennent de `app/commander/[slug]/layout.js` :
// une adresse qui contournerait cette page perdrait la vignette.

/** Le domaine public, celui qui se colle sur un papier. */
export const BASE_YOPPAA = 'https://www.yoppaa.app'

/**
 * L'adresse publique de la fiche d'un commerçant.
 *
 * ⚠️ LE SLUG EST ENCODÉ. Un `href` est une chaîne : un slug non encodé fabrique
 * un lien mort à la première apostrophe ou au premier espace, et un lien mort
 * dans un post ne se rattrape pas une fois publié.
 *
 * @param {string} slug le slug du commerçant
 * @returns {string|null} l'adresse absolue, ou `null` si le slug manque
 */
export function lienFiche(slug) {
  const s = String(slug || '').trim()
  if (!s) return null
  return `${BASE_YOPPAA}/commander/${encodeURIComponent(s)}`
}

/**
 * La phrase qui accompagne un post publié hors de Yoppaa.
 *
 * 🔴 ELLE EST AJOUTÉE PAR LE CODE, JAMAIS ÉCRITE PAR L'IA. Trois raisons, et
 * chacune suffirait :
 *   • un modèle qui « écrit » une adresse peut en déformer un caractère, et un
 *     lien mort dans une publication ne se corrige plus ;
 *   • une consigne de prompt est une SUGGESTION, une concaténation est une
 *     GARANTIE : le lien doit être là à tous les coups, pas quand le modèle y
 *     pense ;
 *   • ça ne coûte pas un jeton.
 *
 * ⚠️ ET C'EST TOUTE LA RAISON D'ÊTRE DE CETTE FONCTION. Sans elle, Yoppaa payait
 * la génération, le commerçant collait le texte sur Facebook, et personne
 * n'arrivait chez nous : l'outil travaillait pour un autre.
 */
// ⚠️ ELLE PREND L'ADRESSE, PAS LE SLUG, et c'est délibéré. `lienFiche` tourne
// côté SERVEUR, là où le slug est lu en base ; l'écran ne reçoit que l'adresse
// finie. Lui faire recomposer l'adresse à partir d'un slug aurait remis une
// seconde fabrique dans le navigateur, c'est-à-dire le défaut qu'on corrige.
export function signatureYoppaa(lien, nomCommerce) {
  const url = String(lien || '').trim()
  if (!url) return ''
  const chez = nomCommerce ? `${nomCommerce}` : 'nous'
  return `Retrouve ${chez} sur Yoppaa : ${url}`
}

/**
 * Le texte du post, prêt à coller, signature comprise.
 *
 * ⚠️ SI LA SIGNATURE Y EST DÉJÀ, ON NE LA REMET PAS. Le modèle a pour consigne
 * de ne pas écrire d'adresse, mais une consigne n'est pas une garantie : sans ce
 * garde-fou, un post pourrait porter deux fois le même lien.
 */
export function postAvecSignature(texte, lien, nomCommerce) {
  const corps = String(texte || '').trim()
  const url = String(lien || '').trim()
  const signature = signatureYoppaa(url, nomCommerce)
  if (!signature) return corps
  if (corps.includes(url)) return corps
  return corps ? `${corps}\n\n${signature}` : signature
}
