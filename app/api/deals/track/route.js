// POST /api/deals/track
//
// Route de tracking stats deals utilisée côté Yopper pour incrémenter les
// compteurs vues / clics / cta_clics sur yoppaa_deals. Appelée par la fiche
// commerçant /commander/[slug] à l'ouverture d'une modale deal et au clic
// des CTA.
//
// Body attendu :
//   { deal_id: UUID, event: 'view' | 'cta_click' | 'click' }
//
// Anti-spam basique : le client dédoublonne côté navigateur via un Set en
// mémoire par session (chaque deal compté 1x par session utilisateur).
// Rate limiting IP à ajouter en Sprint 3 Sécurité MVP.
//
// L'increment atomique est délégué à la RPC increment_deal_stat (SECURITY
// DEFINER, MIGRATION_DEAL_STATS_RPC.sql) pour éviter les race conditions.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const EVENT_TO_COLONNE = {
  view: 'vues',
  click: 'clics',
  cta_click: 'cta_clics',
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function POST(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body JSON requis' }, { status: 400 })
  }

  const { deal_id, event } = body || {}
  if (!deal_id || typeof deal_id !== 'string') {
    return NextResponse.json({ error: 'deal_id requis' }, { status: 400 })
  }
  const colonne = EVENT_TO_COLONNE[event]
  if (!colonne) {
    return NextResponse.json({ error: 'event invalide (view|click|cta_click)' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.rpc('increment_deal_stat', {
    p_deal_id: deal_id,
    p_column: colonne,
  })

  if (error) {
    console.error('[deals/track] increment échoué', { deal_id, event, error })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, event })
}
