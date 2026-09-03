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

// Ventile les frais d'UN paiement entre les DEUX objets qu'il finance.
//
// LE PROBLÈME QUE CETTE FONCTION RÈGLE. Dans le tunnel unique, un seul
// paiement Stripe porte l'acompte du rendez-vous ET le prix des produits.
// L'export comptable additionne `stripe_frais` des commandes et des
// rendez-vous : écrire les frais complets des deux côtés faisait apparaître
// DEUX FOIS la même dépense dans la comptabilité du commerçant.
//
// Chaque objet porte donc sa part du coût d'encaissement, au prorata de ce
// qu'il représente dans le paiement. C'est le traitement comptable juste, et
// la somme des deux parts redonne exactement les frais réels.
//
// Renvoie { rdv: { frais, net }, commande: { frais, net } } ou null.
export function ventilerFrais(fraisTotal, montantAcompte, montantProduits) {
  if (fraisTotal == null) return null
  const acompte = Number(montantAcompte) || 0
  const produits = Number(montantProduits) || 0
  const total = acompte + produits
  if (total <= 0) return null
  const arrondi = (n) => Math.round(n * 100) / 100
  // On calcule la part du rendez-vous puis on donne le RESTE aux produits :
  // ainsi la somme des deux vaut toujours le total, sans centime perdu par un
  // double arrondi.
  const fraisRdv = arrondi(Number(fraisTotal) * (acompte / total))
  const fraisCommande = arrondi(Number(fraisTotal) - fraisRdv)
  return {
    rdv:      { frais: fraisRdv,      net: arrondi(acompte - fraisRdv) },
    commande: { frais: fraisCommande, net: arrondi(produits - fraisCommande) },
  }
}

// L'instant du paiement, tel que Stripe le connaît.
//
// ⚠️ JAMAIS L'HORLOGE DU SERVEUR. Un webhook rejoué des heures plus tard, ou un
// rattrapage lancé des semaines après, daterait la vente du jour du traitement.
// Dans un journal comptable, une vente qui change de mois pour cette raison est
// un défaut : le jour d'une écriture est celui où l'argent a bougé.
//
// Sans horodatage lisible on retombe sur maintenant, faute de mieux, et c'est
// dit ici plutôt que caché : une date approchée vaut mieux qu'une ligne sans
// jour, qui serait purement et simplement perdue.
export function instantPaiement(paymentIntent) {
  const cree = Number(paymentIntent?.created)
  return Number.isFinite(cree) && cree > 0
    ? new Date(cree * 1000).toISOString()
    : new Date().toISOString()
}

// La session de paiement d'un bon cadeau, pour retrouver ce qu'il ne porte pas.
//
// 🔴 LES BONS VENDUS AVANT LE 03/09 N'ONT QU'UN `stripe_session_id`. Ni
// identifiant de paiement, ni date d'encaissement : sans ce détour, le
// rattrapage ne pourrait rien lire du tout et quinze ventes resteraient
// invisibles pour toujours dans la comptabilité.
//
// La session porte les deux : `payment_intent` et `created`. On la lit sur le
// compte du commerçant, comme tout le reste ici.
export async function sessionBonCadeau(sessionId, stripeAccountId) {
  if (!sessionId || !stripeAccountId) return null
  if (!requireStripe()) return null
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: stripeAccountId })
    if (!s) return null
    const pi = typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id || null)
    return { paymentIntentId: pi, created: Number(s.created) || null }
  } catch (e) {
    console.warn('[stripe-frais] session bon illisible', { sessionId, msg: e?.message })
    return null
  }
}
