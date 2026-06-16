// POST /api/stripe/billing/checkout
//
// Crée une Stripe Checkout Session pour upgrader un commerçant vers
// Communiquer ou Vendre. Renvoie l'URL Stripe à laquelle rediriger.
//
// Body attendu : { commercantId: string, targetPlan: 'communiquer' | 'vendre' }
// Retour 200    : { url: string, session_id: string }
// Retour 4xx    : { error: string, code?: string }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCheckoutSession } from '@/lib/stripe-billing'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Config Supabase admin manquante')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { commercantId, targetPlan } = body || {}

    // Validation des inputs
    if (!commercantId || typeof commercantId !== 'string') {
      return NextResponse.json({ error: 'commercantId requis' }, { status: 400 })
    }
    if (!['communiquer', 'vendre'].includes(targetPlan)) {
      return NextResponse.json({
        error: 'targetPlan invalide (attendu communiquer ou vendre)',
      }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Charger le commerçant
    const { data: commercant, error: errFetch } = await supabase
      .from('commercants')
      .select('*')
      .eq('id', commercantId)
      .maybeSingle()

    if (errFetch) {
      console.error('[checkout] erreur fetch commercant', errFetch)
      return NextResponse.json({ error: 'Erreur lecture commerçant' }, { status: 500 })
    }
    if (!commercant) {
      return NextResponse.json({ error: 'Commerçant introuvable' }, { status: 404 })
    }

    // Bloquer si subscription active existante : il doit passer par le portail
    if (commercant.subscription_status && ['active', 'trialing', 'past_due'].includes(commercant.subscription_status)) {
      return NextResponse.json({
        error: 'Vous avez déjà un abonnement actif. Utilisez le portail client pour changer de plan ou résilier.',
        code: 'already_subscribed',
      }, { status: 409 })
    }

    // Construire les URLs de retour
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.yoppaa.app'
    const returnUrl = `${appUrl}/dashboard/abonnement`
    const cancelUrl = `${appUrl}/dashboard/abonnement`

    // Créer la session Stripe
    const session = await createCheckoutSession({
      commercant,
      targetPlan,
      returnUrl,
      cancelUrl,
      trialDays: 30,
      supabaseAdmin: supabase,
    })

    return NextResponse.json({ url: session.url, session_id: session.id })

  } catch (e) {
    console.error('[api/stripe/billing/checkout]', e)
    return NextResponse.json({
      error: e?.message || 'Erreur lors de la création de la session de paiement',
    }, { status: 500 })
  }
}
