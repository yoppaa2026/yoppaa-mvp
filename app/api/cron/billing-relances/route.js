// GET / POST /api/cron/billing-relances
//
// Cron quotidien Vercel (08:00 UTC = 09:00 Brussels en hiver, 10:00 en été)
// qui orchestre les 5 relances Stripe Billing :
//
//   • trial_j_minus_7 / trial_j_minus_3            → rappels avant fin d'essai
//   • payment_failed_j_plus_1 / j_plus_4           → relances après échec
//   • payment_failed_j_plus_7_bascule              → annule la sub Stripe +
//                                                    bascule plan='exister'
//                                                    + envoie l'email final
//
// Idempotency : table billing_relances_log avec UNIQUE(commercant_id, type),
// donc même si le cron tourne plusieurs fois dans la journée (ou retry après
// erreur), aucune relance n'est envoyée 2 fois.
//
// Sécurité : header Authorization: Bearer ${CRON_SECRET}. En prod Vercel,
// le cron Vercel ajoute automatiquement ce header. En appel manuel (debug),
// utiliser la même valeur que la variable d'env CRON_SECRET.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { sendBillingRelance } from '@/lib/billing-emails'
import { getPrixPlan } from '@/lib/plans'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Vérifie l'authentification : on accepte le header Vercel Cron ou un Bearer
// avec la valeur de CRON_SECRET (pour debug manuel).
function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.warn('[cron/billing-relances] CRON_SECRET non configurée, endpoint NON protégé')
    return true  // permissif en dev si pas de secret config (à reactiver en prod)
  }
  const authHeader = req.headers.get('authorization') || ''
  return authHeader === `Bearer ${cronSecret}`
}

// Différence en jours entiers entre deux dates (positif si futur, négatif si passé).
function daysBetween(future, now) {
  const ms = new Date(future).getTime() - new Date(now).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

// Détermine le type de relance trial à envoyer en fonction des jours restants.
function trialRelanceType(daysRemaining) {
  if (daysRemaining >= 6 && daysRemaining <= 8) return 'trial_j_minus_7'
  if (daysRemaining >= 2 && daysRemaining <= 4) return 'trial_j_minus_3'
  return null
}

// Détermine le type de relance past_due à envoyer en fonction des jours écoulés.
function pastDueRelanceType(daysElapsed) {
  if (daysElapsed >= 7) return 'payment_failed_j_plus_7_bascule'
  if (daysElapsed >= 4) return 'payment_failed_j_plus_4'
  if (daysElapsed >= 1) return 'payment_failed_j_plus_1'
  return null
}

async function processCommercant(commercant, supabase, stats) {
  const now = new Date()

  // 1. TRIALING : calculer les jours restants jusqu'à fin de trial
  if (commercant.subscription_status === 'trialing' && commercant.subscription_trial_end) {
    const daysRemaining = daysBetween(commercant.subscription_trial_end, now)
    const type = trialRelanceType(daysRemaining)
    if (!type) return  // pas dans une fenêtre J-7 ou J-3

    // Anti-doublon : vérifier qu'on n'a pas déjà envoyé cette relance
    const { data: existingLog } = await supabase
      .from('billing_relances_log')
      .select('id')
      .eq('commercant_id', commercant.id)
      .eq('type', type)
      .maybeSingle()
    if (existingLog) { stats.skippedAlreadySent++; return }

    // getPrixPlan renvoie un objet { mensuel, label_mensuel } : on passe le NOMBRE
    // mensuel au template (sinon Number(objet) = NaN -> « NaN € »).
    const tarif = getPrixPlan(commercant.plan)?.mensuel ?? null
    const result = await sendBillingRelance({
      commercant,
      type,
      context: {
        plan: commercant.plan,
        tarif,
        date_fin_essai: commercant.subscription_trial_end,
      },
    })

    if (result.ok) {
      await supabase.from('billing_relances_log').insert({
        commercant_id: commercant.id,
        type,
        metadata: { trial_end: commercant.subscription_trial_end, days_remaining: daysRemaining },
      })
      stats.sent.push({ commercantId: commercant.id, type })
    } else {
      stats.errors.push({ commercantId: commercant.id, type, error: result.error })
    }
    return
  }

  // 2. PAST_DUE : calculer les jours écoulés depuis l'échec
  if (commercant.subscription_status === 'past_due' && commercant.subscription_past_due_since) {
    const daysElapsed = -daysBetween(commercant.subscription_past_due_since, now)
    const type = pastDueRelanceType(daysElapsed)
    if (!type) return

    const { data: existingLog } = await supabase
      .from('billing_relances_log')
      .select('id')
      .eq('commercant_id', commercant.id)
      .eq('type', type)
      .maybeSingle()
    if (existingLog) { stats.skippedAlreadySent++; return }

    // Action spéciale pour J+7 : annule la sub Stripe + bascule plan='exister'
    if (type === 'payment_failed_j_plus_7_bascule') {
      try {
        if (commercant.stripe_subscription_id) {
          await stripe.subscriptions.cancel(commercant.stripe_subscription_id)
        }
      } catch (e) {
        // Si la sub est déjà annulée côté Stripe, on continue quand même
        console.warn('[cron] annulation sub Stripe a échoué (peut être déjà annulée)', {
          commercantId: commercant.id,
          subId: commercant.stripe_subscription_id,
          error: e?.message,
        })
      }

      const ancien_plan = commercant.plan
      await supabase
        .from('commercants')
        .update({
          plan: 'exister',
          subscription_status: 'canceled',
          subscription_canceled_at: new Date().toISOString(),
          subscription_past_due_since: null,
        })
        .eq('id', commercant.id)

      const result = await sendBillingRelance({
        commercant,
        type,
        context: { ancien_plan },
      })

      if (result.ok) {
        await supabase.from('billing_relances_log').insert({
          commercant_id: commercant.id,
          type,
          metadata: { ancien_plan, past_due_since: commercant.subscription_past_due_since, days_elapsed: daysElapsed },
        })
        stats.basculesExister.push({ commercantId: commercant.id, ancien_plan })
      } else {
        stats.errors.push({ commercantId: commercant.id, type, error: result.error })
      }
      return
    }

    // J+1 ou J+4 : relance email simple
    // getPrixPlan renvoie un objet { mensuel, label_mensuel } : on passe le NOMBRE
    // mensuel au template (sinon Number(objet) = NaN -> « NaN € »).
    const tarif = getPrixPlan(commercant.plan)?.mensuel ?? null
    const result = await sendBillingRelance({
      commercant,
      type,
      context: {
        plan: commercant.plan,
        tarif,
        date_facture: commercant.subscription_past_due_since,
      },
    })

    if (result.ok) {
      await supabase.from('billing_relances_log').insert({
        commercant_id: commercant.id,
        type,
        metadata: { past_due_since: commercant.subscription_past_due_since, days_elapsed: daysElapsed },
      })
      stats.sent.push({ commercantId: commercant.id, type })
    } else {
      stats.errors.push({ commercantId: commercant.id, type, error: result.error })
    }
  }
}

async function handler(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // Fetch les commerçants concernés : trialing OU past_due, et non exemptés
  const { data: commercants, error } = await supabase
    .from('commercants')
    .select('id, nom, email, plan, subscription_status, subscription_trial_end, subscription_past_due_since, stripe_subscription_id, billing_exempt')
    .in('subscription_status', ['trialing', 'past_due'])
    .or('billing_exempt.is.null,billing_exempt.eq.false')

  if (error) {
    console.error('[cron/billing-relances] erreur fetch commercants', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const stats = {
    fetched: commercants?.length || 0,
    sent: [],
    basculesExister: [],
    skippedAlreadySent: 0,
    errors: [],
  }

  // Process séquentiel pour éviter de hammer Resend ET garder l'ordre des logs
  // lisible. Avec ~50 commerçants on est largement sous les limites Resend
  // (100 emails/seconde en plan payant).
  for (const c of (commercants || [])) {
    try {
      await processCommercant(c, supabase, stats)
    } catch (e) {
      console.error('[cron/billing-relances] erreur process commercant', { id: c.id, error: e })
      stats.errors.push({ commercantId: c.id, error: e?.message || String(e) })
    }
  }

  console.info('[cron/billing-relances] terminé', stats)
  return NextResponse.json({ ok: true, ...stats })
}

// Vercel Cron envoie un GET (pas un POST), donc on expose les 2 verbes par
// précaution (GET pour Vercel Cron, POST pour debug manuel via curl).
export async function GET(req)  { return handler(req) }
export async function POST(req) { return handler(req) }
