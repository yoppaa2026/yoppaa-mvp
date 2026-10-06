// ANNULER UNE COMMANDE : CE QUI SUIT LA BASCULE, UNE SEULE FOIS (I5, 05/10).
//
// Deux routes annulent une commande payée : le client (`/api/commande/cancel`)
// et, depuis le 05/10, le commerce (`/api/commande/annuler-commercant`). Elles
// partagent ici le remboursement et les effets ; seule la DÉCISION (qui, quand,
// avec quel statut) reste dans chaque route.
//
// ⚠️ À N'APPELER QU'APRÈS UNE BASCULE RÉELLE : un `update(...).in('statut',
// <annulables>).select('id')` qui a rendu une ligne. Rien ici ne se demande si
// c'est déjà fait ; c'est la bascule qui garantit qu'on ne le fait qu'une fois.

import { stripe } from './stripe'
import { recrediterBons } from './bons-cadeaux-server'
import { rendreRecompense } from './fidelite-recompense-server'
import { retirerFideliteCommande } from './fidelite-server'
import { restaurerStockVariantes } from './stock-variantes-server'
import { annulerPush } from './onesignal'
import { envoyerAuYopper, emailCommandeAnnuleeYopper } from './resend'
import { referenceCommande } from './numero-commande'
import { prenomClient } from './nom-client'
import { chezLeCommerce } from './nom-commerce'

/**
 * Rend à la carte ce qu'elle a payé, et seulement ça.
 *
 * ⚠️ LE MONTANT VIENT DE STRIPE : ce qui a été capturé, moins ce qui a déjà
 * été rendu. La part payée par bon ou par récompense n'est jamais passée par
 * la carte ; elle revient par `effetsAnnulationCommande`.
 * ⚠️ UNE CLÉ PAR COMMANDE, PAR ORIGINE ET PAR MONTANT : un rejeu rend la même
 * réponse de Stripe au lieu d'un second remboursement. (La clé du client garde
 * sa forme d'avant le 05/10, `cmd-annul-client-…`.)
 * ⚠️ LÈVE en cas d'échec : à l'appelant de défaire sa bascule.
 *
 * @returns {Promise<{ refundId: string|null, refundStatus: string|null, montantCentimes: number }>}
 */
export async function rembourserCarteCommande({ commande, compteStripe, origine }) {
  const options = { stripeAccount: compteStripe }
  const pi = await stripe.paymentIntents.retrieve(commande.stripe_payment_intent_id, { expand: ['latest_charge'] }, options)
  const charge = typeof pi?.latest_charge === 'object' ? pi.latest_charge : null
  const capture = Number(charge?.amount_captured ?? pi?.amount_received ?? 0)
  const dejaRendu = Number(charge?.amount_refunded ?? 0)
  const reste = Math.max(0, capture - dejaRendu)
  if (!(reste > 0)) return { refundId: null, refundStatus: null, montantCentimes: 0 }
  const refund = await stripe.refunds.create({
    payment_intent: commande.stripe_payment_intent_id,
    amount: reste,
    reason: 'requested_by_customer',
    metadata: { yoppaa_commande_id: commande.id, yoppaa_motif: origine },
  }, { ...options, idempotencyKey: `cmd-annul-${origine}-${commande.id}-${reste}` })
  return { refundId: refund.id, refundStatus: refund.status, montantCentimes: reste }
}

/**
 * Ce qu'une commande annulée rend : le stock des versions, les bons, la
 * récompense, la place retenue, et le rappel de retrait programmé.
 * Chaque effet est best-effort et JOURNALISÉ : un bon non rendu se rejoue à la
 * main, il ne doit pas empêcher les autres de revenir.
 *
 * @param {object} commande  avec id, bons_utilises, fidelite_recompense_id, rappel_push_id
 */
export async function effetsAnnulationCommande(supabase, commande, journal = '[commande/annulation]') {
  const restitution = await restaurerStockVariantes(supabase, [commande.id])
  if (!restitution.ok) console.error(`${journal} restitution stock versions KO`, restitution.error, { commande_id: commande.id })

  // 🔴 TOUS LES BONS : `bons_utilises` fait foi, `bon_cadeau_id` n'en rendrait
  // qu'un. Idempotent par l'index unique (source 'annulation').
  if (Array.isArray(commande.bons_utilises) && commande.bons_utilises.length > 0) {
    const rec = await recrediterBons(supabase, commande.bons_utilises, { commande_id: commande.id })
    if (!rec.ok) console.error(`${journal} re-crédit bons KO`, rec.echecs, { commande_id: commande.id })
  }

  // Une commande annulée n'a pas eu lieu : la récompense revient sur la carte.
  if (commande.fidelite_recompense_id) {
    const { data: recFid } = await supabase
      .from('fidelite_recompenses')
      .select('id, carte_id, utilisee_at')
      .eq('id', commande.fidelite_recompense_id)
      .maybeSingle()
    if (recFid?.utilisee_at) await rendreRecompense(supabase, recFid)
  }

  // 🔴 ET LE CRÉDIT QU'ELLE AVAIT DONNÉ REPART (décision d'Alex, 06/10) : une
  // commande annulée après avoir rempli la carte (remboursée depuis Stripe
  // une fois récupérée, par exemple) ne laisse ni passage ni cagnotte. Sans
  // crédit, rien ne se passe.
  await retirerFideliteCommande(supabase, commande.id, journal)

  // Sinon le client recevrait « bientôt l'heure de ton retrait ».
  if (commande.rappel_push_id) annulerPush(commande.rappel_push_id).catch(() => {})

  // La place retenue le temps du paiement, si elle traîne encore.
  const { error: errRes } = await supabase.from('commande_stock_reservation').delete().eq('commande_id', commande.id)
  if (errRes) console.error(`${journal} réservation de stock non libérée`, errRes.message, { commande_id: commande.id })
}

/**
 * Le client apprend que le COMMERCE a annulé sa commande, et ce qui lui
 * revient. Même email pour le geste « Annuler et rembourser » et pour un
 * remboursement total fait depuis le tableau Stripe.
 * Relit la commande : l'appelant n'a pas à connaître les colonnes du gabarit.
 *
 * @returns {Promise<boolean>} vrai si l'email est parti
 */
export async function prevenirClientAnnulationCommerce(supabase, commandeId, { motif = null } = {}) {
  const { data: cmd, error } = await supabase.from('commandes')
    .select('id, client_email, client_nom, numero_commande, numero_prefixe, total, paye_en_ligne, bon_cadeau_montant, bons_utilises, fidelite_remise, commercant:commercants(nom, categorie)')
    .eq('id', commandeId).maybeSingle()
  if (error || !cmd) {
    console.error('[commande/annulation] commande illisible pour l’email', { commandeId, error: error?.message })
    return false
  }
  if (!cmd.client_email) return false
  const html = emailCommandeAnnuleeYopper({
    yopper_prenom: prenomClient(cmd) || 'Yopper',
    commercant_nom: cmd.commercant?.nom || '',
    commercant_categorie: cmd.commercant?.categorie || null,
    numero_commande: referenceCommande(cmd),
    total: cmd.total,
    fidelite_remise: cmd.fidelite_remise,
    bon_cadeau_montant: cmd.bon_cadeau_montant,
    nb_bons: (cmd.bons_utilises || []).length,
    refund_manuel: false,
    paye_en_ligne: !!cmd.paye_en_ligne,
    par_commerce: true,
    motif,
  })
  const envoi = await envoyerAuYopper({
    to: cmd.client_email,
    subject: `Ta commande ${chezLeCommerce(cmd.commercant?.nom || 'le commerçant')} est annulée`,
    html,
  }).catch(e => ({ ok: false, error: e?.message }))
  if (!envoi?.ok) console.error('[commande/annulation] email client KO', envoi?.error)
  return !!envoi?.ok
}
