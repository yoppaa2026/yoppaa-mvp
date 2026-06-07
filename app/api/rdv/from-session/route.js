// GET /api/rdv/from-session?session_id=cs_xxx
//
// Recupere un RDV cree par le webhook Stripe a partir du session_id.
// Le webhook stocke directement le session_id dans rdv_reservations apres
// insert (cf MIGRATION_RDV_SESSION_ID.sql).
//
// Plus de retrieve Stripe API : query Supabase direct = plus rapide + fiable.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('session_id')
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'session_id requis' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select('id, numero_rdv, statut, acompte_montant, acompte_paye_en_ligne, date_rdv, heure_debut, heure_fin')
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle()

    if (!rdv) {
      // RDV pas encore cree par webhook OU session_id pas encore stocke
      return NextResponse.json({ ok: false, pending: true, error: 'RDV pas encore associe a cette session' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, rdv })

  } catch (e) {
    console.error('[api/rdv/from-session]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
