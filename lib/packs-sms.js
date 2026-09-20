// lib/packs-sms.js
//
// Définition PURE des packs de SMS de fidélité (aucune dépendance serveur) :
// ce fichier est importé par le dashboard commerçant ET par les routes Stripe.
// Il ne doit JAMAIS importer lib/stripe (clé secrète) sous peine d'embarquer
// le SDK Stripe dans le bundle client.
//
// Prix HTVA validés le 31/07 après relevé du coût réel Brevo en Belgique
// (0,095 €/SMS) : la règle est un prix de vente >= 1,3 x le coût.
// 🔴 CE COMMENTAIRE DISAIT « la TVA est portée par le Price Stripe », ET C'ÉTAIT
// FAUX (corrigé le 20/09). Un Price ne porte aucune taxe tout seul : il faut un
// `tax_rates` sur la ligne de commande, sinon Stripe prélève le montant nu et
// une facture sans TVA est réputée TVA comprise. Le taux est posé dans
// `app/api/fidelite/sms-packs/checkout`, et il vient de `getStripeTaxRateId()`.

export const PACKS_SMS = {
  '100': { nb: 100, prix_htva: 12.90, label: '100 SMS' },
  '500': { nb: 500, prix_htva: 59.90, label: '500 SMS' },
}
