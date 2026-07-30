// GET  /api/articles/like?article_id=<uuid>&device_id=<id>
//   → { ok, count, liked } : compteur de cœurs + état pour CE device.
// POST /api/articles/like  body { article_id, device_id }
//   → toggle (like/unlike) puis { ok, count, liked }.
//
// Fiches articles « façon post » (décision Alex 30/07) : cœur + partage, pas
// de commentaires. Les cœurs sont anonymes par appareil (device_id généré en
// localStorage côté client) : aucun compte requis, un cœur par appareil et
// par article (UNIQUE en base). Tout passe par le service_role : la table
// article_likes n'a AUCUNE policy anon (pas d'écriture directe possible).
//
// Sécurité : rate limit dédié par IP (likesLimiter, fail-open) en plus du
// limiteur global du proxy. device_id borné à 64 caractères.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { likesLimiter, checkLimit } from '@/lib/ratelimit'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function paramsValides(articleId, deviceId) {
  if (!articleId || !RE_UUID.test(String(articleId))) return false
  if (!deviceId || typeof deviceId !== 'string' || deviceId.length < 8 || deviceId.length > 64) return false
  return true
}

async function etatLikes(supabase, articleId, deviceId) {
  const [{ count, error: errCount }, { data: mien, error: errMien }] = await Promise.all([
    supabase.from('article_likes').select('id', { count: 'exact', head: true }).eq('article_id', articleId),
    supabase.from('article_likes').select('id').eq('article_id', articleId).eq('device_id', deviceId).maybeSingle(),
  ])
  if (errCount) throw new Error(errCount.message)
  if (errMien) throw new Error(errMien.message)
  return { count: count || 0, liked: !!mien }
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const articleId = url.searchParams.get('article_id')
    const deviceId = url.searchParams.get('device_id')
    if (!paramsValides(articleId, deviceId)) {
      return NextResponse.json({ ok: false, error: 'Paramètres invalides' }, { status: 400 })
    }
    const { count, liked } = await etatLikes(admin(), articleId, deviceId)
    return NextResponse.json({ ok: true, count, liked })
  } catch (e) {
    console.error('[articles/like] GET KO', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await checkLimit(likesLimiter, ip)
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Doucement sur les cœurs, réessaie dans une minute' }, { status: 429 })
    }

    const body = await request.json().catch(() => null)
    const articleId = body?.article_id
    const deviceId = body?.device_id
    if (!paramsValides(articleId, deviceId)) {
      return NextResponse.json({ ok: false, error: 'Paramètres invalides' }, { status: 400 })
    }

    const supabase = admin()

    // L'article doit exister et être actif (pas de cœurs orphelins)
    const { data: article, error: errArt } = await supabase
      .from('articles').select('id').eq('id', articleId).maybeSingle()
    if (errArt) throw new Error(errArt.message)
    if (!article) {
      return NextResponse.json({ ok: false, error: 'Article introuvable' }, { status: 404 })
    }

    // Toggle : déjà liké → retirer, sinon ajouter (l'UNIQUE absorbe les courses)
    const { data: existant, error: errExist } = await supabase
      .from('article_likes').select('id').eq('article_id', articleId).eq('device_id', deviceId).maybeSingle()
    if (errExist) throw new Error(errExist.message)

    if (existant) {
      const { error: errDel } = await supabase.from('article_likes').delete().eq('id', existant.id)
      if (errDel) throw new Error(errDel.message)
    } else {
      const { error: errIns } = await supabase.from('article_likes').insert({ article_id: articleId, device_id: deviceId })
      // 23505 = doublon (double tap simultané) : on l'ignore, l'état final est correct
      if (errIns && errIns.code !== '23505') throw new Error(errIns.message)
    }

    const { count, liked } = await etatLikes(supabase, articleId, deviceId)
    return NextResponse.json({ ok: true, count, liked })
  } catch (e) {
    console.error('[articles/like] POST KO', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
