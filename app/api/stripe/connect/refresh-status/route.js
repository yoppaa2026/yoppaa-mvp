// POST /api/stripe/connect/refresh-status
//
// Récupère l'état actuel d'un compte Connect Express et met à jour les flags
// stripe_account_charges_enabled / details_submitted / payouts_enabled sur le row
// commercants. Appelé :
//   • À chaque retour sur le dashboard (return_url de l'Account Link)
//   • Optionnel : polling par le FE après ouverture du lien onboarding
//   • En backup du webhook account.updated (au cas où le webhook n'arrive pas)
//
// Auth : commerçant connecté + ownership.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe } from '@/lib/stripe'

export async function POST(request) {
  try {
    requireStripe()

    const { commercant_id } = await request.json()
    if (!commercant_id) {
      return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const { data: commercant } = await supabase
      .from('commercants')
      .select('id, stripe_account_id, auth_user_id')
      .eq('id', commercant_id)
      .single()

    if (!commercant) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (commercant.auth_user_id !== user.id) return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    if (!commercant.stripe_account_id) {
      return NextResponse.json({ ok: false, error: 'aucun compte Stripe lié' }, { status: 400 })
    }

    // Fetch le compte Stripe + extraire les flags
    const account = await stripe.accounts.retrieve(commercant.stripe_account_id)

    const updates = {
      stripe_account_charges_enabled:   !!account.charges_enabled,
      stripe_account_details_submitted: !!account.details_submitted,
      stripe_account_payouts_enabled:   !!account.payouts_enabled,
    }
    if (account.charges_enabled && !commercant.stripe_onboarding_done_at) {
      updates.stripe_onboarding_done_at = new Date().toISOString()
    }

    await supabase
      .from('commercants')
      .update(updates)
      .eq('id', commercant_id)

    return NextResponse.json({
      ok: true,
      account_id: account.id,
      charges_enabled:   account.charges_enabled,
      details_submitted: account.details_submitted,
      payouts_enabled:   account.payouts_enabled,
      requirements:      account.requirements,  // utile pour debug (champs manquants)
    })

  } catch (e) {
    console.error('[stripe/connect/refresh-status]', e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: e?.status || 500 }
    )
  }
}
