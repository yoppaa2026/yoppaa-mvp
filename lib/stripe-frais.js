// Frais Stripe réels et montant net d'une transaction.
//
// LE PIÈGE DU DIRECT CHARGE. Les paiements Yoppaa sont créés sur le compte
// Stripe DU COMMERÇANT, pas sur celui de la plateforme. Les frais sont donc
// supportés par son compte, et la transaction de solde qui les porte vit chez
// lui. Interroger l'API sans se placer sur son compte ne renvoie pas une
// erreur : ça renvoie un vide, et on écrirait des zéros qui passeraient pour
// des frais nuls. D'où le `stripeAccount` systématique.
//
// La commission de plateforme est à zéro (cf. calculApplicationFee), le net
// rendu par Stripe est donc bien ce que le commerçant reçoit.

import { stripe, requireStripe } from '@/lib/stripe'

// Renvoie { frais, net } en euros, ou null si l'information n'est pas encore
// disponible. On préfère TOUJOURS null à zéro : un zéro écrit en base
// ressemble à une transaction sans frais, ce qui est faux et invérifiable
// après coup. Le cron de reprise complétera plus tard.
export async function recupererFraisStripe(paymentIntentId, stripeAccountId) {
  if (!paymentIntentId || !stripeAccountId) return null
  if (!requireStripe()) return null
  try {
    const pi = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ['latest_charge.balance_transaction'] },
      { stripeAccount: stripeAccountId },
    )
    const bt = pi?.latest_charge?.balance_transaction
    // La transaction de solde peut être encore en cours de constitution juste
    // après le paiement. Dans ce cas elle existe mais sans frais exploitables.
    if (!bt || typeof bt.fee !== 'number' || typeof bt.net !== 'number') return null
    return {
      frais: Math.round(bt.fee) / 100,
      net: Math.round(bt.net) / 100,
    }
  } catch (e) {
    console.warn('[stripe-frais] lecture impossible', { paymentIntentId, stripeAccountId, msg: e?.message })
    return null
  }
}

// Après un remboursement, Stripe ne restitue PAS la totalité des frais : le
// net doit être recalculé, sinon il reste celui d'avant et devient faux.
// Le remboursement crée sa propre transaction de solde, dont le net est
// négatif : l'additionner au net initial donne le net réel.
export async function netApresRemboursement(refundId, stripeAccountId, netInitial) {
  if (!refundId || !stripeAccountId || netInitial == null) return null
  if (!requireStripe()) return null
  try {
    const refund = await stripe.refunds.retrieve(
      refundId,
      { expand: ['balance_transaction'] },
      { stripeAccount: stripeAccountId },
    )
    const bt = refund?.balance_transaction
    if (!bt || typeof bt.net !== 'number') return null
    return Math.round((Number(netInitial) + bt.net / 100) * 100) / 100
  } catch (e) {
    console.warn('[stripe-frais] lecture remboursement impossible', { refundId, msg: e?.message })
    return null
  }
}
