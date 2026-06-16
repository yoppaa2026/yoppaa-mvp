// POST /api/stripe/billing/portal
//
// Crée une Stripe Customer Portal Session pour qu'un commerçant gère son
// abonnement (changer CB, switch plan, résilier, télécharger ses factures).
//
// Body attendu : { commercantId: string }
// Header requis : Authorization: Bearer <supabase_access_token>
// Retour 200    : { url: string }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCustomerPortalSession } from '@/lib/stripe-billing'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Config Supabase admin manquante')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // Vérifie le JWT Supabase
    const { data: { user }, error: errAuth } = await supabase.auth.getUser(token)
    if (errAuth || !user) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    }

    const body = await req.json()
    const { commercantId } = body || {}
    if (!commercantId || typeof commercantId !== 'string') {
      return NextResponse.json({ error: 'commercantId requis' }, { status: 400 })
    }

    // Charger le commerçant
    const { data: commercant, error: errFetch } = await supabase
      .from('commercants')
      .select('id, auth_user_id, stripe_customer_id, nom')
      .eq('id', commercantId)
      .maybeSingle()
    if (errFetch || !commercant) {
      return NextResponse.json({ error: 'Commerçant introuvable' }, { status: 404 })
    }

    // Vérifie ownership (sauf admin)
    const isAdmin = user.email === ADMIN_EMAIL
    if (!isAdmin && commercant.auth_user_id !== user.id) {
      return NextResponse.json({ error: 'Accès non autorisé à ce commerçant' }, { status: 403 })
    }

    if (!commercant.stripe_customer_id) {
      return NextResponse.json({
        error: 'Aucun abonnement Stripe lié. Souscrivez d\'abord à un plan.',
      }, { status: 409 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.yoppaa.app'
    const returnUrl = `${appUrl}/dashboard/abonnement`

    const session = await createCustomerPortalSession({ commercant, returnUrl })

    return NextResponse.json({ url: session.url })

  } catch (e) {
    console.error('[api/stripe/billing/portal]', e)
    return NextResponse.json({
      error: e?.message || 'Erreur lors de la création de la session portail',
    }, { status: 500 })
  }
}
