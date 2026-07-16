// GET /api/communes/stats            -> totaux globaux de mobilisation (permanent)
// GET /api/communes/stats?cp=5640     -> stats de la commune du code postal
//
// Route publique : n'expose QUE des agrégats (via la vue commune_stats, aucun PII).
// Jauge de déblocage = commerçants (l'offre). Curieux (yoppers) = non plafonnés.
// Cachée en CDN.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// service_role : route serveur, n'expose que des agrégats. Indispensable car la table
// `communes` a une RLS qui masque à anon les communes non actives (active=false) ;
// sans ça la résolution du code postal échouerait pour toute commune en mobilisation.
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function cache(res) {
  res.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  return res
}

export async function GET(request) {
  const cp = (new URL(request.url).searchParams.get('cp') || '').trim()
  const supabase = admin()
  if (!supabase) return NextResponse.json({ ok: true, found: false })

  // ── Mode global (pas de code postal) : totaux pour l'affichage permanent. ──
  if (!cp) {
    const { data } = await supabase.from('commune_stats').select('nb_commercants, nb_yoppers')
    const rows = data || []
    return cache(NextResponse.json({
      ok: true,
      global: true,
      total_commercants: rows.reduce((n, c) => n + (c.nb_commercants || 0), 0),
      total_yoppers: rows.reduce((n, c) => n + (c.nb_yoppers || 0), 0),
    }))
  }

  if (!/^\d{4}$/.test(cp)) {
    return NextResponse.json({ ok: false, error: 'Code postal invalide' }, { status: 400 })
  }

  // ── Mode commune : CP -> commune -> stats agrégées. ──
  const { data: com } = await supabase
    .from('communes')
    .select('id')
    .contains('codes_postaux', [cp])
    .limit(1)
    .maybeSingle()

  if (!com?.id) return cache(NextResponse.json({ ok: true, found: false }))

  const { data: stat } = await supabase
    .from('commune_stats')
    .select('nom, nb_preinscrits, nb_commercants, nb_yoppers, seuil_preinscrits, active')
    .eq('commune_id', com.id)
    .maybeSingle()

  return cache(NextResponse.json({ ok: true, found: !!stat, ...(stat || {}) }))
}
