// Helper Stripe server-side : instance Stripe partagée + constants Yoppaa.
// Côté client : utiliser @stripe/stripe-js (loadStripe) avec NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
//
// Architecture Yoppaa :
//   • Plateforme Yoppaa = compte Stripe principal (sk_test_/sk_live_, ca_test_/ca_live_)
//   • Commerçants = Connect Express accounts liés (acct_xxx, charges_enabled quand KYC OK)
//   • Direct Charge : le client paie directement le commerçant (application_fee = 0, Yoppaa
//     ne touche jamais l'argent transitionnel — gain = subscriptions plans uniquement)

import Stripe from 'stripe'

// API version : on fige la version Stripe pour éviter les breaking changes silencieux.
// À chaque mise à jour Stripe, vérifier changelog et bumper cette constante manuellement.
const STRIPE_API_VERSION = '2025-09-30.acacia'

// Instance Stripe SERVER ONLY (sk_test_/sk_live_). Ne JAMAIS importer ce fichier côté client.
// Si la clé est absente (env de dev sans config), on retourne null → les API routes
// renvoient 503 "Stripe non configuré" plutôt que de crasher.
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION,
      typescript: false,
      appInfo: { name: 'Yoppaa', version: '1.0.0', url: 'https://yoppaa.app' },
    })
  : null

// Config globale lue côté server (sauf publishableKey qui est NEXT_PUBLIC_).
export const STRIPE_CONFIG = {
  isEnabled:        !!process.env.STRIPE_SECRET_KEY,
  webhookSecret:    process.env.STRIPE_WEBHOOK_SECRET,                // whsec_xxx — vérifie signature webhook
  publishableKey:   process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,   // pk_test_/pk_live_ — utilisé côté client
  connectClientId:  process.env.STRIPE_CONNECT_CLIENT_ID,             // ca_test_/ca_live_ — pour OAuth Standard (pas utilisé en Express)
  appUrl:           process.env.NEXT_PUBLIC_APP_URL || 'https://yoppaa.app',
}

// Types de paiement Yoppaa (utilisé dans metadata Stripe Checkout pour dispatcher
// le bon traitement côté webhook handler : créer RDV vs créer Commande).
export const PAYMENT_KIND = {
  RDV_ACOMPTE:     'rdv_acompte',      // acompte vitrine (PRO/PRO+), partiel
  COMMANDE_TOTAL:  'commande_total',   // paiement complet commande C&C (BOOST/MAX)
}

// Helper : guard qu'on retourne dans toutes les API routes si Stripe pas configuré.
// Évite de crasher en local dev sans .env.local, redirige user vers config admin.
export function requireStripe() {
  if (!stripe) {
    const err = new Error('Stripe non configuré (STRIPE_SECRET_KEY manquante)')
    err.status = 503
    throw err
  }
  return stripe
}

// Helper : calcule l'application_fee_amount en centimes selon politique Yoppaa.
// Memory `project-paiement-stripe` : 'Zéro commission, jamais'. Donc 0.
// Si politique change un jour, on adapte ici un seul endroit.
export function calculApplicationFee(/* amountCents, commercant */) {
  return 0
}

// Helper : retourne l'objet metadata Stripe à attacher aux Checkout Sessions / PaymentIntents
// pour que le webhook handler sache quoi faire à la confirmation paiement.
// Stripe limite metadata à 50 clés × 500 chars max chacune. On garde minimaliste.
export function buildPaymentMetadata({ kind, commercantId, rdvId = null, commandeId = null, extra = {} }) {
  return {
    yoppaa_kind: kind,                         // 'rdv_acompte' | 'commande_total'
    yoppaa_commercant_id: commercantId,
    ...(rdvId      ? { yoppaa_rdv_id: rdvId } : {}),
    ...(commandeId ? { yoppaa_commande_id: commandeId } : {}),
    ...extra,
  }
}
