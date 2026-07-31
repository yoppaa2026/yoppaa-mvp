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

// ─── REGLE D'OR retroplanning 21/06/2026 : trial differe ─────────────────────
// Strategie : devoilement 21/07 + lancement app 01/09. L'essai 30j commercant
// doit demarrer au lancement client (01/09), JAMAIS a l'onboarding estival.
// Sinon le commercant paie avant d'avoir vu un seul client -> churn massif.
//
// Configurable via NEXT_PUBLIC_LAUNCH_DATE (sync avec landing). Fallback hard
// 2026-09-01T10:00:00+02:00 (CEST belge, rentree).
const LAUNCH_DATE = new Date(
  process.env.NEXT_PUBLIC_LAUNCH_DATE
  || '2026-09-01T10:00:00+02:00'
)

// Retourne le timestamp Unix Stripe (secondes) auquel le trial doit se TERMINER.
// - Si maintenant < LAUNCH_DATE : trial_end = LAUNCH_DATE + trialDays
//   (le commercant ne paie qu'apres avoir eu son mois d'essai gratuit + l'ete
//   d'onboarding off)
// - Si maintenant >= LAUNCH_DATE : trial_end = now + trialDays (cas standard)
//
// Returns: timestamp Unix en secondes (Stripe).
export function calculerTrialEnd(trialDays = 30) {
  const nowMs = Date.now()
  const trialMs = trialDays * 24 * 60 * 60 * 1000
  const launchMs = LAUNCH_DATE.getTime()
  const finMs = nowMs < launchMs ? launchMs + trialMs : nowMs + trialMs
  return Math.floor(finMs / 1000)
}

// Retourne true si on est en periode "trial differe" (avant le lancement).
// Utile pour afficher des messages contextuels cote dashboard.
export function isTrialDiffereActif() {
  return Date.now() < LAUNCH_DATE.getTime()
}

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

// ─── Packs SMS de fidélité (B.6 étape 6) ────────────────────────────────────
// Achat ponctuel, sur le compte PLATEFORME (c'est Yoppaa qui revend les SMS au
// commerçant, contrairement aux commandes qui vont en Direct Charge chez lui).
// Les montants vivent dans lib/packs-sms.js (fichier pur, partagé avec le
// dashboard) ; ici on ne résout que le Price Stripe correspondant.
export function getStripePriceIdSmsPack(pack) {
  const suffix = isStripeTestMode() ? 'TEST' : 'LIVE'
  const envKey = `STRIPE_PRICE_SMS${pack}_${suffix}`
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

  // Trial differe : trial_end calcule selon LAUNCH_DATE (regle retroplanning).
  // On utilise trial_end (timestamp absolu) au lieu de trial_period_days pour
  // qu'un commercant qui s'inscrit en juillet ait son essai jusqu'au 01/10/2026,
  // pas 30 jours apres son inscription.
  const subData = {
    metadata: {
      yoppaa_commercant_id: commercant.id,
      yoppaa_target_plan: targetPlan,
    },
  }
  if (trialDays > 0) {
    subData.trial_end = calculerTrialEnd(trialDays)
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: subData,
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

// Cree une Stripe Subscription en API (sans Checkout interactif) au moment
// ou Yoppaa VALIDE le KYB d'un commercant payant.
//
// Logique : le commercant ne peut pas payer tant qu'il n'a pas saisi de carte,
// donc on cree la Subscription avec collection_method='charge_automatically' et
// trial_end = LAUNCH_DATE + 30j (regle d'or retroplanning). Stripe accepte des
// trials longs (plusieurs mois). Le commercant peut ajouter sa carte plus tard
// via le Customer Portal, ou ignorer : a la fin du trial, Stripe tente le
// paiement -> si echec, le cron billing-relances bascule sur Exister.
//
// Returns: { subscription, customer, deferred (bool) }
//
// Side-effects DB (noms de colonnes existants, cf. webhook stripe/billing) :
// - commercants.stripe_customer_id (via getOrCreateStripeCustomer)
// - commercants.stripe_subscription_id (mis a jour ici)
// - commercants.subscription_status (ici, miroir Stripe.status)
// - commercants.subscription_trial_end (ici, miroir Stripe.trial_end ISO)
export async function creerSubscriptionAutomatique({
  commercant,
  targetPlan,
  trialDays = 30,
  supabaseAdmin,
}) {
  if (!['communiquer', 'vendre'].includes(targetPlan)) {
    throw new Error(`targetPlan invalide : ${targetPlan} (attendu communiquer ou vendre)`)
  }
  const stripe = requireStripe()
  const priceId = getStripePriceId(targetPlan)
  const customer = await getOrCreateStripeCustomer(commercant, supabaseAdmin)

  const trialEndUnix = calculerTrialEnd(trialDays)
  const deferred = isTrialDiffereActif()

  // Cree la Subscription. payment_behavior='default_incomplete' permet d'attendre
  // que le commercant ajoute sa carte sans bloquer la creation (le trial gere
  // l'absence de payment method pendant la periode d'essai).
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    trial_end: trialEndUnix,
    // Si pas de carte a la fin du trial -> Stripe tente paiement -> echec ->
    // webhook customer.subscription.updated avec status=past_due -> cron
    // billing-relances prend le relais (J+1, J+4, J+7 puis bascule Exister).
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    expand: ['latest_invoice.payment_intent'],
    metadata: {
      yoppaa_commercant_id: commercant.id,
      yoppaa_target_plan: targetPlan,
      yoppaa_trial_deferred: deferred ? 'true' : 'false',
    },
    collection_method: 'charge_automatically',
  })

  // Persiste les ids et le trial_end miroir en DB (evite des appels Stripe en
  // lecture, permet aux requetes SQL d'afficher la date directement). Noms de
  // colonnes alignes avec ceux du webhook stripe/billing existant.
  const updates = {
    stripe_customer_id: customer.id,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_trial_end: new Date(trialEndUnix * 1000).toISOString(),
  }
  const { error: errUpdate } = await supabaseAdmin
    .from('commercants')
    .update(updates)
    .eq('id', commercant.id)

  if (errUpdate) {
    console.error('[stripe-billing] echec persistance subscription apres KYB valide', {
      commercantId: commercant.id,
      subscriptionId: subscription.id,
      errUpdate,
    })
  }

  return { subscription, customer, deferred }
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
