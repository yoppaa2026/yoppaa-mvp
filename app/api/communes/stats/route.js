// GET /api/communes/stats?cp=5640
//
// Route publique : renvoie le compteur de préinscriptions de la commune
// correspondant au code postal (incitant landing « X personnes attendent déjà »).
// Ne renvoie QUE des agrégats (via la vue commune_stats, aucun PII). Cachée en CDN.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request) {
  const cp = (new URL(request.url).searchParams.get('cp') || '').trim()
  if (!/^\d{4}$/.test(cp)) {
    return NextResponse.json({ ok: false, error: 'Code postal invalide' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ ok: true, found: false })

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // 1) CP -> commune (array codes_postaux). 2) stats agrégées de cette commune.
  const { data: com } = await supabase
    .from('communes')
    .select('id')
    .contains('codes_postaux', [cp])
    .limit(1)
    .maybeSingle()

  if (!com?.id) return NextResponse.json({ ok: true, found: false })

  const { data: stat } = await supabase
    .from('commune_stats')
    .select('nom, nb_preinscrits, seuil_preinscrits, active')
    .eq('commune_id', com.id)
    .maybeSingle()

  const res = NextResponse.json({ ok: true, found: !!stat, ...(stat || {}) })
  res.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  return res
}
