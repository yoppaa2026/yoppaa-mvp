// POST /api/rdv/schedule-rappel
//
// Programme le rappel push 1h avant un RDV / une résa. Appelé fire-and-forget
// depuis le tunnel RDV après un booking SANS acompte (insert direct côté client,
// pas de passage par le webhook Stripe). Le chemin AVEC acompte programme le
// rappel directement dans le webhook (envoyerEmailsRdvConfirme).
//
// Best-effort : la programmation est idempotente (skip si rappel déjà posé) et
// ne programme que pour un RDV confirmé. Voir lib/rappels.js.
//
// Body : { rdv_id: UUID }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { programmerRappelRdv } from '@/lib/rappels'

export async function POST(request) {
  try {
    const { rdv_id } = await request.json()
    if (!rdv_id) {
      return NextResponse.json({ ok: false, error: 'rdv_id requis' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const res = await programmerRappelRdv(rdv_id, supabase)
    return NextResponse.json({ ok: true, rappel: res })
  } catch (e) {
    console.error('[rdv/schedule-rappel] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
