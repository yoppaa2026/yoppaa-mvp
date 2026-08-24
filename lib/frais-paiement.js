// Les frais du prestataire de paiement, dits d'une seule voix.
//
// ⚠️ CETTE PHRASE ÉTAIT ÉCRITE TROIS FOIS : dans les CGU, dans les arguments
// de l'inscription et dans l'email de la landing. Trois copies d'un tarif qui
// change quand Stripe le décide, et rien pour signaler qu'elles ont divergé.
// C'est le document CONTRACTUEL qui aurait fini par avoir tort face à l'écran.
//
// Fichier PUR (aucun import) : importable côté client, côté serveur, et dans
// le HTML des emails.
//
// ⚠️ ON N'ÉCRIT PAS DE RÈGLE DE CALCUL ICI. Ce sont des mots destinés à un
// commerçant, jamais un barème dont le code se servirait : le montant réel des
// frais se lit dans la `balance_transaction` de Stripe (lib/stripe-frais.js),
// parce qu'un taux recopié dans du code finit par facturer un chiffre que
// personne n'a encaissé.

// Tarifs relevés chez Stripe le 24/08/2026 pour un compte belge.
// Bancontact vient EN PREMIER : c'est le moyen de paiement majoritaire des
// clients belges, et c'est le MOINS CHER des trois. La phrase disait
// « à partir de 1,5 % », ce qui était à la fois moins vendeur et inexact.
export const FRAIS_STRIPE_TEXTE =
  '1,4 % + 0,25 € par transaction en Bancontact, 1,5 % + 0,25 € pour une carte européenne standard, davantage pour une carte premium ou étrangère'
