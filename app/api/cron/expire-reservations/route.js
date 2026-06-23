// GET /api/cron/expire-reservations
//
// Cron Vercel toutes les 5 minutes : garbage collection des reservations stock
// expirees dans la table commande_stock_reservation.
//
// Contexte : create-commande INSERT une reservation TTL 5 min avant le redirect
// Stripe Checkout. Si le user paie -> webhook DELETE. Si le user abandonne ou
// timeout Stripe -> webhook payment_intent.canceled DELETE aussi. Mais en cas
// de webhook KO ou paiement bloque indefiniment, les reservations s'accumulent.
//
// Ce cron nettoie. Pas critique business car le stock check de create-commande
// filtre deja .gt('expires_at', NOW()), donc une reservation expiree n'occupe
// pas le stock. C'est juste pour eviter la croissance illimitee de la table.
//
// Securite : header Authorization: Bearer <CRON_SECRET>.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || ''
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data, error } = await supabase
      .from('commande_stock_reservation')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id')

    if (error) {
      console.error('[cron/expire-reservations] DELETE KO', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, deleted: data?.length || 0 })
  } catch (e) {
    console.error('[cron/expire-reservations] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
