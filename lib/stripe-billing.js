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

// ─── L'OFFRE DE LANCEMENT (decision Alex du 20/08/2026) ──────────────────────
// La regle vit dans lib/lancement.js, et NULLE PART AILLEURS :
//
//     L'essai se termine au plus tard entre le 8 janvier 2027 et 30 jours
//     apres l'inscription.
//
// Ce fichier ne fait que la traduire en timestamp Stripe. Le texte affiche au
// commercant et l'argent preleve descendent ainsi de la MEME fonction : ils ne
// peuvent pas diverger.
//
// ⚠️ Remplace l'ancienne regle du retroplanning (trial differe au 01/09) : plus
// de « LAUNCH_DATE + 30j », plus de compteur par commercant.
import { finEssai, estRegimeLancement } from './lancement'
import { modePlateforme, MODE_TEST } from './stripe-mode'

// Retourne le timestamp Unix Stripe (secondes) auquel le trial doit se TERMINER.
// `trialDays` est le PLANCHER, pas la duree : c'est le minimum garanti a qui
// s'inscrit trop tard pour profiter de la gratuite de lancement.
//
// Returns: timestamp Unix en secondes (Stripe).
export function calculerTrialEnd(trialDays = 30, inscriptionLe = new Date()) {
  return Math.floor(finEssai(inscriptionLe, trialDays).getTime() / 1000)
}

// Retourne true si le commercant beneficie encore du regime de lancement,
// c'est-a-dire s'il touche PLUS que l'essai normal. Utile pour afficher des
// messages contextuels cote dashboard.
export function isTrialDiffereActif(inscriptionLe = new Date()) {
  return estRegimeLancement(inscriptionLe)
}

// Détecte le mode (Test/Live) depuis la clé Stripe.
//
// 🔴 SANS CLÉ, CETTE FONCTION RÉPOND « LIVE ». C'est une absence d'information
// déguisée en verdict, et `verif:mode-stripe` la nomme depuis le 17/09. Elle
// survit pour le webhook, qui s'en sert à choisir l'ORDRE d'essai de ses deux
// secrets : là, se tromper ne coûte rien puisqu'il essaie l'autre ensuite.
// ⚠️ TOUT CE QUI CHOISIT UN OBJET STRIPE PASSE PAR `suffixeMonde()`, jamais par
// elle : s'y tromper de monde choisirait un tarif de production.
export function isStripeTestMode() {
  const key = process.env.STRIPE_SECRET_KEY || ''
  return key.startsWith('sk_test_')
}

// Le suffixe des variables d'environnement qui nomment un objet Stripe (un
// Price, un TaxRate) : `TEST` ou `LIVE`, selon le monde de la clé.
//
// ⚠️ PAS DE CLÉ, PAS DE VERDICT. `modePlateforme()` rend `null` au lieu de
// deviner, et on lève plutôt que de choisir. Mieux vaut refuser une
// souscription que d'en encaisser une sur les objets du mauvais monde.
function suffixeMonde() {
  const mode = modePlateforme()
  if (!mode) {
    throw new Error('Configuration Stripe incomplète : STRIPE_SECRET_KEY manquante ou non reconnue')
  }
  return mode === MODE_TEST ? 'TEST' : 'LIVE'
}

// Retourne le price_id Stripe pour un plan donné, en sélectionnant
// automatiquement la version Test ou Live selon la clé.
// Throw si la variable d'env correspondante manque (config incomplète).
export function getStripePriceId(plan) {
  const suffix = suffixeMonde()
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

// ─── LA TVA BELGE SUR L'ABONNEMENT (décision d'Alex du 20/09) ───────────────
// 🔴 `tax_id_collection` NE FACTURE AUCUNE TVA. Il ne fait que NOTER le numéro
// du client sur la facture, et il était seul : Stripe prélevait le montant nu,
// alors que la page d'abonnement promettait noir sur blanc que « la TVA
// applicable sera ajoutée au moment du paiement ». Une promesse écrite que rien
// n'honorait, et 17,4 % de la recette d'abonnement perdus.
//
// C'est `default_tax_rates` qui la calcule. La doc Stripe le dit dans les mêmes
// termes pour les deux voies, Checkout et `subscriptions.create` : « Invoices
// created will have their default_tax_rates populated from the subscription. »
// Le taux se pose donc UNE fois, à la souscription, et les renouvellements en
// héritent tout seuls.
//
// ⚠️ UN TAXRATE EST UN OBJET STRIPE, avec son monde comme un Price : celui de
// test ne vaut rien en production. Son identifiant se lit dans l'environnement,
// exactement comme les Price, et on lève s'il manque. Encaisser un abonnement
// sans TVA coûte plus cher que de refuser une souscription.
//
// ⚠️ LE TAUX LUI-MÊME N'EST PAS ICI, il vit dans l'objet Stripe, et
// `TVA_ABONNEMENT_POURCENT` (lib/plans.js) n'en est que le miroir affiché.
// `npm run controle:tva`, lancé par Alex, confronte les deux.
export function getStripeTaxRateId() {
  const envKey = `STRIPE_TAX_RATE_BE_${suffixeMonde()}`
  const taxRateId = process.env[envKey]
  if (!taxRateId) {
    throw new Error(`Configuration Stripe incomplète : variable d'environnement ${envKey} manquante`)
  }
  return taxRateId
}

// ─── Packs SMS de fidélité (B.6 étape 6) ────────────────────────────────────
// Achat ponctuel, sur le compte PLATEFORME (c'est Yoppaa qui revend les SMS au
// commerçant, contrairement aux commandes qui vont en Direct Charge chez lui).
// Les montants vivent dans lib/packs-sms.js (fichier pur, partagé avec le
// dashboard) ; ici on ne résout que le Price Stripe correspondant.
export function getStripePriceIdSmsPack(pack) {
  const suffix = suffixeMonde()
  const envKey = `STRIPE_PRICE_SMS${pack}_${suffix}`
  const priceId = process.env[envKey]
  if (!priceId) {
    throw new Error(`Configuration Stripe incomplète : variable d'environnement ${envKey} manquante`)
  }
  return priceId
}

// ─── Boutique Yoppaa : accompagnement sur place et matériel ─────────────────
// Même logique que les packs SMS : c'est Yoppaa qui vend, donc compte
// PLATEFORME. Le suffixe vient de lib/produits-boutique.js (SUCCESS_PACK,
// KIT_PRO, KIT_LIGHT, ROULEAU).
//
// 🔴 CE COMMENTAIRE AFFIRMAIT QUE LA TVA ÉTAIT « portée par le Price Stripe ».
// C'était faux, et c'est ce qui a fait passer le défaut inaperçu des deux côtés
// (corrigé le 20/09). La TVA se pose en `tax_rates` sur la ligne de commande,
// dans la route de Checkout, jamais par le Price seul.
export function getStripePriceIdProduitBoutique(envKeySuffix) {
  const suffix = suffixeMonde()
  const envKey = `STRIPE_PRICE_${envKeySuffix}_${suffix}`
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

  // Offre de lancement : trial_end vient de finEssai(), donc au plus tard entre
  // le 8 janvier 2027 et 30 jours apres l'inscription. On envoie un trial_end
  // (timestamp ABSOLU) et non un trial_period_days, sinon Stripe recompterait
  // 30 jours a partir du paiement et la gratuite de lancement disparaitrait.
  const subData = {
    metadata: {
      yoppaa_commercant_id: commercant.id,
      yoppaa_target_plan: targetPlan,
    },
    // La TVA belge, posée sur l'abonnement lui-même : les factures de
    // renouvellement en héritent, sans que personne n'ait à y repenser.
    default_tax_rates: [getStripeTaxRateId()],
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
    // 🔴 AUCUNE CARTE DEMANDEE, DECISION D'ALEX DU 21/09. En mode abonnement,
    // Stripe collecte un moyen de paiement PAR DEFAUT, essai ou pas : monter en
    // Vendre depuis le tableau de bord demandait donc une carte, alors que la
    // meme montee a l'inscription n'en demande aucune (`creerSubscriptionAuto-
    // matique` pose `payment_behavior: 'default_incomplete'`). Les commercants
    // choisissaient Exister « par prudence », et c'est justement a eux qu'on
    // reclamait ensuite une carte. `if_required` supprime l'etape tant que
    // l'essai couvre toute la periode.
    //
    // ⚠️ LE REVERS EST ASSUME, ET IL SE PAIE LE 9 JANVIER : presque personne
    // n'aura de moyen de paiement enregistre, le premier prelevement echouera
    // en masse, et `cron/billing-relances` basculera ces comptes en Exister
    // apres ses trois relances. On echange de la conversion en janvier contre
    // de l'usage maintenant. Ce n'est PAS un defaut a corriger discretement :
    // le rappel de carte dans « Mon compte » et les relances sont ce qui tient
    // cette decision debout.
    //
    // ⚠️ L'ADRESSE, ELLE, RESTE EXIGEE : une facture belge doit porter
    // l'adresse du client. Ce n'est pas une carte, ca n'engage a rien.
    payment_method_collection: 'if_required',
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
// trial_end = finEssai() (offre de lancement). Stripe accepte des
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
  const tvaBelge = getStripeTaxRateId()
  const deferred = isTrialDiffereActif()

  // Cree la Subscription. payment_behavior='default_incomplete' permet d'attendre
  // que le commercant ajoute sa carte sans bloquer la creation (le trial gere
  // l'absence de payment method pendant la periode d'essai).
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    trial_end: trialEndUnix,
    // 🔴 CETTE VOIE-CI EST CELLE DES CINQ PREMIERS COMMERÇANTS. Elle ne passe
    // par aucun formulaire Checkout, donc rien n'y rattraperait une TVA
    // oubliée : c'est ici qu'elle manquait le plus.
    default_tax_rates: [tvaBelge],
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
