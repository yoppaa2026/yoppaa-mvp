// GET /api/cron/expire-reservations
//
// Cron Vercel toutes les 5 minutes. Double garbage collection :
//
//   1. Réservations stock expirées (table commande_stock_reservation).
//      create-commande INSERT une réservation TTL 5 min avant le redirect Stripe
//      Checkout. Paiement OK -> webhook DELETE. Abandon/timeout -> webhook
//      payment_intent.canceled DELETE. Si webhook KO, les réservations
//      s'accumulent : on les nettoie ici. Pas critique business (le stock check
//      de create-commande filtre déjà .gt('expires_at', NOW())), juste pour
//      éviter la croissance illimitée de la table.
//
//   2. Commandes bloquées en 'paiement_en_attente' > 15 min. Si le webhook Stripe
//      n'arrive JAMAIS (endpoint KO durablement, PI jamais finalisé), la commande
//      reste indéfiniment en attente de paiement. On la bascule sur le statut
//      terminal 'annulee_paiement_ko' (le même que le webhook payment_intent.
//      canceled). Le stock a déjà été libéré par le point 1.
//      Sûr vs webhook tardif : si un paiement réussi arrive après coup, le handler
//      webhook revive la commande (sa garde d'idempotence ne skippe que si
//      paye_en_ligne=true, or ici il est resté false). Pas de "argent pris mais
//      commande annulée".
//
// Sécurité : header Authorization: Bearer <CRON_SECRET>.

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

    // 1) Réservations stock expirées
    const { data: reservations, error: errRes } = await supabase
      .from('commande_stock_reservation')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id')

    if (errRes) {
      console.error('[cron/expire-reservations] DELETE réservations KO', errRes)
      return NextResponse.json({ ok: false, error: errRes.message }, { status: 500 })
    }

    // 2) Commandes bloquées en paiement_en_attente > 15 min
    const cutoff15 = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: commandes, error: errCmd } = await supabase
      .from('commandes')
      .update({ statut: 'annulee_paiement_ko' })
      .eq('statut', 'paiement_en_attente')
      .lt('created_at', cutoff15)
      .select('id')

    if (errCmd) {
      console.error('[cron/expire-reservations] UPDATE commandes paiement_en_attente KO', errCmd)
      return NextResponse.json({ ok: false, error: errCmd.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      deleted: reservations?.length || 0,
      commandes_expirees: commandes?.length || 0,
    })
  } catch (e) {
    console.error('[cron/expire-reservations] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
