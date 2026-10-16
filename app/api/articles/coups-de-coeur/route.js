// GET /api/articles/coups-de-coeur?commercant_id=<uuid>&device_id=<id>
//   → { ok, compteurs: { [articleId]: n }, aimes: [articleId] }
//
// ✅ ALEX, 16/10 soir (tableau) : le badge « Coup de cœur » sur la carte,
// « Tes coups de cœur » pour le Yopper, « Les plus aimés » pour le commerçant.
// Une seule lecture pour les trois.
//
// ⚠️ `article_likes` n'a AUCUNE policy anon : on lit par le service_role, et on
// ne rend que des NOMBRES par article (jamais un identifiant d'appareil), plus
// les articles aimés par l'appareil QUI DEMANDE (son propre identifiant).
// ⚠️ SEULEMENT LES ARTICLES ACTIFS D'UN COMMERCE PUBLIÉ (vue publique).
// `device_id` facultatif : sans lui, `aimes` est vide.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { likesLimiter, checkLimit } from '@/lib/ratelimit'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await checkLimit(likesLimiter, ip)
    if (!rl.success) return NextResponse.json({ ok: false, error: 'Trop de demandes, réessaie dans une minute' }, { status: 429 })

    const url = new URL(request.url)
    const commercantId = url.searchParams.get('commercant_id')
    const deviceBrut = url.searchParams.get('device_id')
    if (!commercantId || !RE_UUID.test(commercantId)) {
      return NextResponse.json({ ok: false, error: 'Paramètres invalides' }, { status: 400 })
    }
    const deviceId = typeof deviceBrut === 'string' && deviceBrut.length >= 8 && deviceBrut.length <= 64 ? deviceBrut : null

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data: publie, error: errC } = await admin.from('commercants_public').select('id').eq('id', commercantId).maybeSingle()
    if (errC) throw new Error(errC.message)
    if (!publie) return NextResponse.json({ ok: true, compteurs: {}, aimes: [] })

    const { data: articles, error: errA } = await admin.from('articles').select('id').eq('commercant_id', commercantId).eq('actif', true)
    if (errA) throw new Error(errA.message)
    const ids = (articles || []).map(a => a.id)
    if (ids.length === 0) return NextResponse.json({ ok: true, compteurs: {}, aimes: [] })

    const { data: likes, error: errL } = await admin.from('article_likes').select('article_id, device_id').in('article_id', ids)
    if (errL) throw new Error(errL.message)
    const compteurs = {}
    const aimes = []
    for (const l of likes || []) {
      compteurs[l.article_id] = (compteurs[l.article_id] || 0) + 1
      if (deviceId && l.device_id === deviceId) aimes.push(l.article_id)
    }
    return NextResponse.json({ ok: true, compteurs, aimes })
  } catch (e) {
    console.error('[articles/coups-de-coeur] KO', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
