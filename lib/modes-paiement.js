// QUELS MOYENS DE PAIEMENT SONT OUVERTS SUR CETTE COMMANDE.
//
// 🔴 CETTE RÈGLE ÉTAIT ÉCRITE DEUX FOIS DANS LE MÊME FICHIER, et les deux
// copies ne disaient pas la même chose. Trouvé par Alex le 26/08 sur La
// Boutique Témoin :
//
//   • le RENDU calculait `stripeOK = stripe_account_charges_enabled`, sans la
//     règle propre à la boutique. Il affichait donc les DEUX cartes de
//     paiement, surlignait « Payer en ligne » par défaut, et le bouton disait
//     « Payer & confirmer » ;
//   • la SOUMISSION, elle, appliquait la règle : chez un commerçant qui a
//     choisi le paiement au comptoir, `stripeOK` vaut false. Sans clic
//     explicite du Yopper, elle envoyait donc `sur_place`.
//
// Résultat : un écran qui promet un paiement par carte, et une commande
// confirmée sans qu'aucun paiement n'ait lieu. Le Yopper croyait avoir payé.
//
// ⚠️ ET LE BANDEAU DU HAUT DISAIT VRAI. « Tu paies au comptoir, au retrait »
// était la seule phrase juste de l'écran : c'est le sélecteur qui mentait. Le
// réflexe de corriger la phrase visible aurait aggravé le défaut.
//
// ⚠️ LE SERVEUR LIT LA MÊME FONCTION. Une règle de paiement qui ne vit que
// dans le navigateur n'est pas une règle : elle se contourne en changeant une
// ligne du corps de la requête.

/**
 * @param {object} commercant  ligne `commercants` (stripe_account_charges_enabled,
 *                             accepte_paiement_cash, boutique_retrait_paiement)
 * @param {boolean} estDetail  commerce de détail (boutique) plutôt qu'alimentaire
 * @param {string} modeBoutique 'retrait' | 'expedition' (détail uniquement)
 * @returns {{stripeOK: boolean, cashOK: boolean}}
 */
export function modesPaiementOuverts({ commercant, estDetail = false, modeBoutique = 'retrait' } = {}) {
  let stripeOK = !!commercant?.stripe_account_charges_enabled
  let cashOK = !!commercant?.accepte_paiement_cash

  if (estDetail) {
    if (modeBoutique === 'expedition') {
      // ⚠️ UN COLIS NE SE PAIE PAS AU COMPTOIR : il part avant toute
      // rencontre. Le paiement en ligne est donc la seule issue.
      cashOK = false
    } else {
      // Retrait en boutique : le commerçant tranche, et c'est EXCLUSIF. Il a
      // dit soit « on encaisse au comptoir », soit « payé d'avance en ligne ».
      // Lui envoyer l'autre, c'est lui imposer une commission qu'il a refusée
      // ou une caisse qu'il n'a pas prévue.
      const choix = commercant?.boutique_retrait_paiement || 'en_ligne'
      cashOK = choix === 'magasin'
      stripeOK = stripeOK && choix === 'en_ligne'
    }
  }

  return { stripeOK, cashOK }
}

/**
 * Le mode retenu quand le Yopper n'a rien choisi, ou son choix s'il est ouvert.
 *
 * ⚠️ UN CHOIX FERMÉ NE SE RESPECTE PAS. Si l'écran a gardé « en ligne » d'un
 * état précédent et que le commerçant ne l'accepte plus, on retombe sur ce qui
 * est réellement possible plutôt que d'envoyer une commande qui sera refusée.
 */
export function modePaiementEffectif({ choix, stripeOK, cashOK, couvert = false }) {
  // Plus rien à payer : aucun moyen à demander, le serveur confirme seul.
  if (couvert) return 'en_ligne'
  if (choix === 'en_ligne' && stripeOK) return 'en_ligne'
  if (choix === 'sur_place' && cashOK) return 'sur_place'
  if (stripeOK) return 'en_ligne'
  if (cashOK) return 'sur_place'
  return null
}
