// POST /api/stripe/webhook
//
// Handler central des webhooks Stripe. Reçoit TOUS les événements (paiements,
// refunds, account updates) et dispatche selon event.type.
//
// Sécurité : on vérifie OBLIGATOIREMENT la signature Stripe (header stripe-signature)
// pour éviter qu'un attaquant POST des events forgés. Sans signature valide → 401.
//
// Idempotency : Stripe peut renvoyer le même event plusieurs fois (retries). On
// stocke chaque event_id dans stripe_webhook_events avant traitement, et on
// skip si déjà vu. Évite de créer 2 RDV pour 1 paiement.
//
// Events gérés (Phase 1 MVP) :
//   • payment_intent.succeeded   → si kind=rdv_acompte : crée le RDV en DB
//   • payment_intent.payment_failed → log + alerte (pas de RDV créé)
//   • charge.refunded             → met à jour rdv_reservations.stripe_refund_id
//   • account.updated             → met à jour commercants.stripe_account_charges_enabled
//
// IMPORTANT : Next.js App Router POST a besoin du body RAW pour vérifier la
// signature (signature calculée sur le body byte-par-byte, pas après JSON.parse).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, STRIPE_CONFIG, PAYMENT_KIND } from '@/lib/stripe'

// Désactive le body parsing automatique de Next pour récupérer le raw body
export const config = { api: { bodyParser: false } }

// Service role (bypass RLS pour les UPDATE depuis webhook)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function POST(request) {
  if (!stripe || !STRIPE_CONFIG.webhookSecret) {
    return NextResponse.json({ ok: false, error: 'Stripe non configuré' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ ok: false, error: 'signature manquante' }, { status: 401 })
  }

  const rawBody = await request.text()

  // 1. Vérification signature (anti-forge)
  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_CONFIG.webhookSecret)
  } catch (e) {
    console.error('[stripe/webhook] invalid signature', e.message)
    return NextResponse.json({ ok: false, error: 'signature invalide' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // 2. Idempotency : skip si event_id déjà traité
  const { data: existing } = await supabase
    .from('stripe_webhook_events')
    .select('event_id, status')
    .eq('event_id', event.id)
    .maybeSingle()

  if (existing) {
    console.info('[stripe/webhook] event déjà traité, skip', { id: event.id, type: event.type })
    return NextResponse.json({ ok: true, skipped: true })
  }

  // 3. Insert l'event AVANT le traitement (lock idempotency). En cas d'échec on
  //    met à jour status='error', sinon on laisse 'ok'.
  await supabase.from('stripe_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    account_id: event.account || null,
    payload: event,                         // full event pour debug
  })

  // 4. Dispatch selon event.type
  try {
    switch (event.type) {

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object, supabase)
        break

      case 'payment_intent.payment_failed':
        console.warn('[stripe/webhook] payment failed', { id: event.data.object.id, error: event.data.object.last_payment_error })
        // Pas de RDV créé. Pourrait envoyer un email "ton paiement a échoué" plus tard.
        break

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object, supabase)
        break

      case 'account.updated':
        await handleAccountUpdated(event.data.object, supabase)
        break

      default:
        // On log mais on ne fail pas (events qu'on n'écoute pas, c'est normal)
        console.info('[stripe/webhook] event non géré', event.type)
    }

    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error('[stripe/webhook] error processing', event.type, e)
    await supabase
      .from('stripe_webhook_events')
      .update({ status: 'error', error_msg: e?.message || String(e) })
      .eq('event_id', event.id)
    // On retourne 500 pour que Stripe retry. Sauf si erreur business non-recoverable.
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}


// ─── Handlers spécifiques par event.type ────────────────────────────────────

// payment_intent.succeeded : crée le RDV en DB depuis les metadata
async function handlePaymentIntentSucceeded(paymentIntent, supabase) {
  const meta = paymentIntent.metadata || {}
  const kind = meta.yoppaa_kind

  if (kind === PAYMENT_KIND.RDV_ACOMPTE) {
    // Vérif anti-double-création (au cas où l'idempotency aurait failli)
    if (meta.yoppaa_rdv_id) {
      const { data: existing } = await supabase
        .from('rdv_reservations')
        .select('id')
        .eq('id', meta.yoppaa_rdv_id)
        .maybeSingle()
      if (existing) return  // RDV déjà créé, skip
    }

    // Crée le RDV avec acompte_paye_en_ligne=true
    const rdvId = meta.yoppaa_rdv_id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null)
    const payload = {
      ...(rdvId ? { id: rdvId } : {}),
      commercant_id: meta.yoppaa_commercant_id,
      prestation_id: meta.prestation_id,
      client_email: meta.client_email,
      client_prenom: meta.client_prenom,
      client_nom: meta.client_nom,
      client_telephone: meta.client_telephone,
      date_rdv: meta.date_rdv,
      heure_debut: meta.heure_debut,
      heure_fin: meta.heure_fin,
      duree_minutes: Number(meta.duree_minutes) || null,
      prix_estime: Number(meta.prix_estime) || null,
      acompte_montant: Number(meta.acompte_montant) || null,
      acompte_paye: true,
      statut: 'confirme',
      notes_client: meta.notes_client || null,
      rgpd_marketing: meta.rgpd_marketing === '1',
      source: 'yopper',
      stripe_payment_intent_id: paymentIntent.id,
      acompte_paye_en_ligne: true,
      acompte_paye_date: new Date().toISOString(),
    }
    const { error } = await supabase.from('rdv_reservations').insert(payload)
    if (error) throw error
    console.info('[stripe/webhook] RDV créé via paiement Stripe', { rdvId, pi: paymentIntent.id })
    // TODO : envoyer email confirmation au client + alerte au commerçant (RDV-9)
    return
  }

  if (kind === PAYMENT_KIND.COMMANDE_TOTAL) {
    // TODO Phase 1.5 : créer la commande C&C pour BOOST/MAX
    console.info('[stripe/webhook] commande C&C à créer (pas encore implémenté)', { pi: paymentIntent.id })
    return
  }

  console.warn('[stripe/webhook] kind non reconnu dans payment_intent.succeeded', { kind, meta })
}

// charge.refunded : met à jour le RDV/commande avec l'info de refund
async function handleChargeRefunded(charge, supabase) {
  const paymentIntentId = charge.payment_intent
  if (!paymentIntentId) return

  const refund = charge.refunds?.data?.[0]
  if (!refund) return

  const updateData = {
    stripe_refund_id: refund.id,
    stripe_refund_amount: refund.amount / 100,
    stripe_refund_date: new Date().toISOString(),
  }

  // Update RDV si trouvé
  const { data: rdv } = await supabase
    .from('rdv_reservations')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (rdv) {
    await supabase.from('rdv_reservations').update(updateData).eq('id', rdv.id)
    console.info('[stripe/webhook] refund enregistré sur RDV', { rdvId: rdv.id, refund: refund.id })
    return
  }

  // Sinon update commande si trouvée
  const { data: cmd } = await supabase
    .from('commandes')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (cmd) {
    await supabase.from('commandes').update(updateData).eq('id', cmd.id)
    console.info('[stripe/webhook] refund enregistré sur commande', { cmdId: cmd.id, refund: refund.id })
  }
}

// account.updated : met à jour les flags charges_enabled / payouts_enabled / details_submitted
async function handleAccountUpdated(account, supabase) {
  const updates = {
    stripe_account_charges_enabled:   !!account.charges_enabled,
    stripe_account_details_submitted: !!account.details_submitted,
    stripe_account_payouts_enabled:   !!account.payouts_enabled,
  }
  // Si premier passage 'charges_enabled=true', stamp onboarding_done_at
  if (account.charges_enabled) {
    const { data: c } = await supabase
      .from('commercants')
      .select('stripe_onboarding_done_at')
      .eq('stripe_account_id', account.id)
      .maybeSingle()
    if (c && !c.stripe_onboarding_done_at) {
      updates.stripe_onboarding_done_at = new Date().toISOString()
    }
  }
  const { error } = await supabase
    .from('commercants')
    .update(updates)
    .eq('stripe_account_id', account.id)
  if (error) throw error
  console.info('[stripe/webhook] commercant Stripe account updated', { acct: account.id, charges_enabled: account.charges_enabled })
}
