// ═══════════════════════════════════════════════════════════════════════════
// lib/stripe-billing.js
//
// Helpers Stripe Billing pour les 4 paliers Yoppaa :
//   - exister     (gratuit, pas de Stripe)
//   - communiquer (19,90€/mois, Stripe Subscription)
//   - vendre      (49,90€/mois, Stripe Subscription)
//   - public      (gratuit à vie, pas de Stripe)
//
// Modes Test/Live :
//   La clé STRIPE_SECRET_KEY commence par 'sk_test_' → mode Test → utilise STRIPE_PRICE_*_TEST
//   Sinon → mode Live → utilise STRIPE_PRICE_*_LIVE
//
// Pattern utilisé : helpers lazy-init côté server-side uniquement. À ne JAMAIS
// importer côté client (besoin de la STRIPE_SECRET_KEY).
// ═══════════════════════════════════════════════════════════════════════════

import { requireStripe } from './stripe'

// Détecte le mode (Test/Live) depuis la clé Stripe.
export function isStripeTestMode() {
  const key = process.env.STRIPE_SECRET_KEY || ''
  return key.startsWith('sk_test_')
}

// Retourne le price_id Stripe pour un plan donné, en sélectionnant
// automatiquement la version Test ou Live selon la clé.
// Throw si la variable d'env correspondante manque (config incomplète).
export function getStripePriceId(plan) {
  const suffix = isStripeTestMode() ? 'TEST' : 'LIVE'
  const map = {
    communiquer: `STRIPE_PRICE_COMMUNIQUER_${suffix}`,
    vendre:      `STRIPE_PRICE_VENDRE_${suffix}`,
  }
  const envKey = map[plan]
  if (!envKey) return null  // exister et public n'ont pas de price (gratuits)
  const priceId = process.env[envKey]
  if (!priceId) {
    throw new Error(`Configuration Stripe incomplète : variable d'environnement ${envKey} manquante`)
  }
  return priceId
}

// Crée ou récupère le Stripe Customer lié au commerçant.
// Met à jour commercants.stripe_customer_id en DB si nouveau customer créé.
export async function getOrCreateStripeCustomer(commercant, supabaseAdmin) {
  if (!commercant?.id) throw new Error('Commercant valide requis')
  if (!supabaseAdmin) throw new Error('Client Supabase admin requis')
  const stripe = requireStripe()

  // Customer déjà lié : on essaye de le récupérer
  if (commercant.stripe_customer_id) {
    try {
      const customer = await stripe.customers.retrieve(commercant.stripe_customer_id)
      if (customer && !customer.deleted) return customer
    } catch (e) {
      console.warn('[stripe-billing] Customer Stripe introuvable, on en crée un nouveau', {
        commercantId: commercant.id,
        oldCustomerId: commercant.stripe_customer_id,
      })
    }
  }

  // Création du Customer Stripe
  const customer = await stripe.customers.create({
    email: commercant.email || undefined,
    name: commercant.nom || undefined,
    phone: commercant.telephone || undefined,
    metadata: {
      yoppaa_commercant_id: commercant.id,
      ...(commercant.bce ? { yoppaa_bce: commercant.bce } : {}),
    },
    address: commercant.adresse ? {
      line1: commercant.adresse,
      country: 'BE',
    } : undefined,
    preferred_locales: ['fr'],
  })

  // Persiste l'id dans la DB
  const { error: errUpdate } = await supabaseAdmin
    .from('commercants')
    .update({ stripe_customer_id: customer.id })
    .eq('id', commercant.id)

  if (errUpdate) {
    console.error('[stripe-billing] échec persistance stripe_customer_id', { commercantId: commercant.id, errUpdate })
    // On laisse passer : on a quand même un customer Stripe utilisable
  }

  return customer
}

// Crée une Stripe Checkout Session pour upgrader vers Communiquer ou Vendre.
// L'essai gratuit est ajouté ici (configurable par appel, défaut 30j).
//
// Returns: la Checkout Session Stripe (utiliser .url pour redirect côté client).
export async function createCheckoutSession({
  commercant,
  targetPlan,
  returnUrl,
  cancelUrl,
  trialDays = 30,
  supabaseAdmin,
}) {
  if (!['communiquer', 'vendre'].includes(targetPlan)) {
    throw new Error(`targetPlan invalide : ${targetPlan} (attendu communiquer ou vendre)`)
  }
  const stripe = requireStripe()
  const priceId = getStripePriceId(targetPlan)
  const customer = await getOrCreateStripeCustomer(commercant, supabaseAdmin)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      metadata: {
        yoppaa_commercant_id: commercant.id,
        yoppaa_target_plan: targetPlan,
      },
    },
    success_url: `${returnUrl}?stripe_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${cancelUrl}?stripe_checkout=canceled`,
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true }, // permet au commerçant B2B de saisir son n° TVA
    // Requis par Stripe quand on active tax_id_collection sur un Customer existant :
    // autorise Checkout à mettre à jour name + address sur le Customer en fonction
    // de ce que le commerçant saisit dans le formulaire.
    customer_update: { name: 'auto', address: 'auto' },
    locale: 'fr',
    metadata: {
      yoppaa_commercant_id: commercant.id,
      yoppaa_target_plan: targetPlan,
    },
  })

  return session
}

// Crée une Stripe Customer Portal Session pour que le commerçant gère son
// abonnement (changer plan, mettre à jour CB, résilier).
export async function createCustomerPortalSession({ commercant, returnUrl }) {
  if (!commercant?.stripe_customer_id) {
    throw new Error('Le commerçant n\'a pas de Stripe Customer (aucun abonnement passé)')
  }
  const stripe = requireStripe()

  const session = await stripe.billingPortal.sessions.create({
    customer: commercant.stripe_customer_id,
    return_url: returnUrl,
    locale: 'fr',
  })

  return session
}
