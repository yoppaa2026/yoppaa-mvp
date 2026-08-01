// POST /api/stripe/billing/webhook
//
// Handler des webhooks Stripe Billing (Subscriptions). Endpoint SÉPARÉ du
// webhook Connect Direct Charge (/api/stripe/webhook) pour isoler les 2
// produits Stripe (Billing vs Connect).
//
// Sécurité : signature obligatoire (STRIPE_BILLING_WEBHOOK_SECRET, distinct
// du secret du webhook Connect).
//
// Events gérés :
//   • customer.subscription.created     → set stripe_subscription_id + status + plan
//   • customer.subscription.updated     → MAJ status + plan + dates
//   • customer.subscription.deleted     → bascule en plan='exister'
//   • invoice.payment_failed            → marque subscription_status='past_due'
//   • invoice.payment_succeeded         → repasse en active si past_due

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { isStripeTestMode } from '@/lib/stripe-billing'
import { produitParType } from '@/lib/produits-boutique'
import { envoyerAuAdmin, envoyerAuCommercant, emailAccompagnementPayeAdmin, emailAccompagnementPayeCommercant } from '@/lib/resend'

// Récupère les 2 secrets webhook Billing (Test + Live) avec priorité sur celui
// du mode détecté dans STRIPE_SECRET_KEY. On tente quand même l'autre en
// fallback pour supporter les bascules ponctuelles Test/Live sans recompiler.
function getWebhookSecretsOrdered() {
  const test = process.env.STRIPE_BILLING_WEBHOOK_SECRET_TEST
  const live = process.env.STRIPE_BILLING_WEBHOOK_SECRET_LIVE
  return (isStripeTestMode() ? [test, live] : [live, test]).filter(Boolean)
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Mapping price_id Stripe → plan Yoppaa. Compare aux 4 env vars configurées
// (Test + Live × Communiquer + Vendre).
function planFromPriceId(priceId) {
  if (!priceId) return null
  const matches = {
    [process.env.STRIPE_PRICE_COMMUNIQUER_TEST || '']: 'communiquer',
    [process.env.STRIPE_PRICE_COMMUNIQUER_LIVE || '']: 'communiquer',
    [process.env.STRIPE_PRICE_VENDRE_TEST      || '']: 'vendre',
    [process.env.STRIPE_PRICE_VENDRE_LIVE      || '']: 'vendre',
  }
  // Supprime la clé '' si une env var manque (évite faux match)
  delete matches['']
  return matches[priceId] || null
}

function tsToIso(ts) {
  if (!ts) return null
  return new Date(ts * 1000).toISOString()
}

export async function POST(request) {
  const secrets = getWebhookSecretsOrdered()
  if (!stripe || secrets.length === 0) {
    return NextResponse.json({ ok: false, error: 'Stripe Billing non configuré (aucun STRIPE_BILLING_WEBHOOK_SECRET_TEST/LIVE)' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ ok: false, error: 'signature manquante' }, { status: 401 })
  }

  const rawBody = await request.text()

  // Tente les 2 secrets (Test + Live) dans l'ordre. Le 1er qui valide gagne.
  // Stripe envoie chaque event signé avec le secret du webhook dans son mode.
  let event, lastError
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret)
      lastError = null
      break
    } catch (e) {
      lastError = e
    }
  }
  if (!event) {
    console.error('[stripe/billing/webhook] invalid signature (aucun secret n\'a validé)', lastError?.message)
    return NextResponse.json({ ok: false, error: 'signature invalide' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // Idempotency : on partage la table stripe_webhook_events avec le webhook Connect
  const { data: existing } = await supabase
    .from('stripe_webhook_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle()
  if (existing) {
    console.info('[billing/webhook] event déjà traité, skip', { id: event.id, type: event.type })
    return NextResponse.json({ ok: true, skipped: true })
  }

  await supabase.from('stripe_webhook_events').insert({
    event_id:   event.id,
    event_type: event.type,
    account_id: event.account || null,
    payload:    event,
  })

  try {
    switch (event.type) {

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object, supabase)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, supabase)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object, supabase)
        break

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object, supabase)
        break

      // Achats ponctuels sur le compte plateforme : packs de SMS de fidélité,
      // accompagnement sur place et matériel de comptoir.
      case 'checkout.session.completed':
        if (event.data.object?.metadata?.yoppaa_kind === 'sms_pack') {
          await handleSmsPackPaye(event.data.object, supabase)
        } else if (event.data.object?.metadata?.yoppaa_kind === 'accompagnement') {
          await handleAccompagnementPaye(event.data.object, supabase)
        }
        break

      default:
        console.info('[billing/webhook] event non géré', event.type)
    }

    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error('[billing/webhook] error processing', event.type, e)
    await supabase
      .from('stripe_webhook_events')
      .update({ status: 'error', error_msg: e?.message || String(e) })
      .eq('event_id', event.id)
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}


// ─── Handlers ─────────────────────────────────────────────────────────────

// checkout.session.completed (kind = sms_pack) : le commerçant a payé son
// pack de SMS de fidélité → on crédite son compteur.
// Idempotent à deux niveaux : la table stripe_webhook_events filtre déjà les
// rejeux d'events, et on ne crédite que si l'achat est encore en attente.
async function handleSmsPackPaye(session, supabase) {
  const achatId = session.metadata?.yoppaa_achat_id
  if (!achatId) {
    console.warn('[billing/webhook] sms_pack sans yoppaa_achat_id', session.id)
    return
  }

  const { data: achat } = await supabase
    .from('fidelite_sms_achats')
    .select('id, commercant_id, nb_sms, statut')
    .eq('id', achatId)
    .maybeSingle()
  if (!achat) {
    console.error('[billing/webhook] achat SMS introuvable', achatId)
    return
  }
  if (achat.statut === 'paye') return   // déjà crédité

  const { error: errUp } = await supabase
    .from('fidelite_sms_achats')
    .update({ statut: 'paye', updated_at: new Date().toISOString() })
    .eq('id', achat.id)
    .eq('statut', 'paiement_en_attente')
  if (errUp) throw errUp

  const { data: solde, error: errRpc } = await supabase
    .rpc('crediter_sms_pack', { p_commercant_id: achat.commercant_id, p_nb: achat.nb_sms })
  if (errRpc) throw errRpc

  console.info('[billing/webhook] pack SMS crédité', {
    achat: achat.id, nb: achat.nb_sms, nouveau_solde: solde,
  })
}

// checkout.session.completed (kind = accompagnement) : le commerçant a payé son
// Success Pack on-site et/ou son matériel de comptoir → on bascule les lignes
// success_packs en 'paye' et on prévient Yoppaa (à planifier) et le commerçant.
// Idempotent : la table stripe_webhook_events filtre les rejeux, et le passage
// en 'paye' est conditionné au statut 'paiement_en_attente'.
async function handleAccompagnementPaye(session, supabase) {
  const ids = String(session.metadata?.yoppaa_lignes || '').split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) {
    console.warn('[billing/webhook] accompagnement sans yoppaa_lignes', session.id)
    return
  }

  const { data: lignesMaj, error: errUp } = await supabase
    .from('success_packs')
    .update({ statut: 'paye' })
    .in('id', ids)
    .eq('statut', 'paiement_en_attente')
    .select('id, type, montant_ht, notes, commercant_id')
  if (errUp) throw errUp
  if (!lignesMaj?.length) return   // déjà traité

  const { data: com } = await supabase
    .from('commercants')
    .select('id, nom, email, telephone, adresse, categorie, plan')
    .eq('id', lignesMaj[0].commercant_id)
    .maybeSingle()

  const lignes = lignesMaj.map(l => ({
    label: produitParType(l.type)?.label || l.type,
    prix: Number(l.montant_ht || 0),
  }))
  const total = Math.round(lignes.reduce((t, l) => t + l.prix, 0) * 100) / 100
  // La note du commerçant est identique sur toutes les lignes d'une commande.
  const note = String(lignesMaj[0].notes || '').split('—').slice(1).join('—').trim()

  await envoyerAuAdmin({
    subject: `Accompagnement payé — ${com?.nom || 'Commerçant'}`,
    html: emailAccompagnementPayeAdmin({
      commercant_id: com?.id,
      nom: com?.nom || 'Commerçant',
      email: com?.email,
      telephone: com?.telephone,
      adresse: com?.adresse,
      categorie: com?.categorie,
      plan: com?.plan,
      lignes, total, message: note,
    }),
  }).catch(e => console.error('[billing/webhook] email admin accompagnement KO', e?.message))

  if (com?.email) {
    await envoyerAuCommercant({
      to: com.email,
      subject: 'Ta commande Yoppaa est confirmée 🟣',
      html: emailAccompagnementPayeCommercant({ nom: com.nom, lignes, total }),
    }).catch(e => console.error('[billing/webhook] accusé accompagnement KO', e?.message))
  }

  console.info('[billing/webhook] accompagnement payé', { lignes: lignesMaj.length, total })
}

// customer.subscription.created + customer.subscription.updated
// On stocke les infos et on bascule le plan si la sub est active ou en trial.
async function handleSubscriptionUpsert(subscription, supabase) {
  const customerId = subscription.customer
  if (!customerId) {
    console.warn('[billing/webhook] subscription sans customer', subscription.id)
    return
  }

  const { data: commercant, error: errFetch } = await supabase
    .from('commercants')
    .select('id, plan, stripe_subscription_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (errFetch || !commercant) {
    console.warn('[billing/webhook] commerçant introuvable pour customer', customerId, errFetch)
    return
  }

  // Détermine le plan cible : priorité au metadata yoppaa_target_plan
  // (set par createCheckoutSession), fallback sur price_id.
  const priceId = subscription.items?.data?.[0]?.price?.id
  const targetPlan =
    subscription.metadata?.yoppaa_target_plan ||
    planFromPriceId(priceId)

  const updates = {
    stripe_subscription_id: subscription.id,
    subscription_status:    subscription.status,
    subscription_trial_end:           tsToIso(subscription.trial_end),
    subscription_current_period_end:  tsToIso(subscription.current_period_end),
    subscription_canceled_at:         tsToIso(subscription.canceled_at),
  }

  // Bascule plan si subscription active ou en trial
  if (['active', 'trialing'].includes(subscription.status) && targetPlan) {
    updates.plan = targetPlan
  }

  // Sub annulée/expirée → rebascule vers exister
  if (['canceled', 'incomplete_expired'].includes(subscription.status)) {
    updates.plan = 'exister'
  }

  const { error } = await supabase
    .from('commercants')
    .update(updates)
    .eq('id', commercant.id)

  if (error) throw error
  console.info('[billing/webhook] subscription upsert OK', {
    commercantId: commercant.id,
    subId: subscription.id,
    status: subscription.status,
    plan: updates.plan,
  })
}

// customer.subscription.deleted → bascule en exister
async function handleSubscriptionDeleted(subscription, supabase) {
  const customerId = subscription.customer
  const { data: commercant } = await supabase
    .from('commercants')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (!commercant) {
    console.warn('[billing/webhook] commerçant introuvable pour customer (deleted)', customerId)
    return
  }

  const { error } = await supabase
    .from('commercants')
    .update({
      plan: 'exister',
      subscription_status: 'canceled',
      subscription_canceled_at: tsToIso(subscription.canceled_at) || new Date().toISOString(),
    })
    .eq('id', commercant.id)

  if (error) throw error
  console.info('[billing/webhook] subscription deleted, plan reset to exister', {
    commercantId: commercant.id,
    subId: subscription.id,
  })
}

// invoice.payment_failed → marque past_due + stamp subscription_past_due_since
// (Stripe Smart Retries va relancer automatiquement selon la config du dunning,
// et notre cron /api/cron/billing-relances calcule J+1, J+4, J+7 depuis ce
// timestamp).
async function handleInvoicePaymentFailed(invoice, supabase) {
  const customerId = invoice.customer
  if (!customerId) return

  const { data: commercant } = await supabase
    .from('commercants')
    .select('id, subscription_status, subscription_past_due_since')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (!commercant?.id) {
    console.warn('[billing/webhook] commerçant introuvable pour invoice.payment_failed', customerId)
    return
  }

  // Stamp UNIQUEMENT si pas déjà set (= premier échec du cycle). Si on stampait
  // à chaque payment_failed, on reset le compteur J+1/J+4/J+7 à chaque retry
  // Stripe → relances jamais envoyées.
  const updates = { subscription_status: 'past_due' }
  if (!commercant.subscription_past_due_since) {
    updates.subscription_past_due_since = new Date().toISOString()
  }

  const { error } = await supabase
    .from('commercants')
    .update(updates)
    .eq('id', commercant.id)

  if (error) throw error
  console.warn('[billing/webhook] invoice payment_failed → past_due', {
    commercantId: commercant.id,
    invoiceId: invoice.id,
    amount: invoice.amount_due,
    pastDueStamped: !commercant.subscription_past_due_since,
  })
}

// invoice.payment_succeeded → repasse en active + reset subscription_past_due_since
// si on était past_due (Smart Retry a réussi à débiter la nouvelle carte). Sans
// reset, le prochain cycle past_due hériterait du vieux timestamp et déclencherait
// la bascule en exister immédiatement.
async function handleInvoicePaymentSucceeded(invoice, supabase) {
  const customerId = invoice.customer
  if (!customerId) return

  const { data: commercant } = await supabase
    .from('commercants')
    .select('id, subscription_status, subscription_past_due_since')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (!commercant?.id) return

  // Si pas past_due et pas de timestamp, rien à faire (paiement régulier).
  const wasPastDue = commercant.subscription_status === 'past_due' || commercant.subscription_past_due_since

  if (!wasPastDue) return

  const { error } = await supabase
    .from('commercants')
    .update({
      subscription_status: 'active',
      subscription_past_due_since: null,
    })
    .eq('id', commercant.id)

  if (error) throw error
  console.info('[billing/webhook] past_due → active après retry réussi (reset du compteur)', {
    commercantId: commercant.id,
    invoiceId: invoice.id,
  })
}
