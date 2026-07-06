// POST /api/yopper/sync-tags
//
// Pose des tags OneSignal sur le user Yopper (identifié par external_id =
// clients.id) via l'API REST serveur. Remplace la pose de tags côté navigateur
// (OneSignal.User.addTags) qui provoquait un 409 Conflict "set-property" en
// entrant en course avec login() sur un user fraîchement créé (constaté 03/07,
// tags favori:* jamais synchronisés, ciblage push par favori cassé).
//
// Auth : cookie HTTP-only yoppaa_yopper. Le Yopper ne tague que son propre user
// (l'external_id est dérivé du cookie, jamais du body).
//
// Body : { tags: { "favori:UUID": "1" | "", "code_postal": "5640", ... } }
//   - valeur "1" pour poser un tag, "" (chaîne vide) pour le retirer.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { setYopperTags } from '@/lib/onesignal'

const COOKIE_NAME = 'yoppaa_yopper'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// external_id OneSignal = clients.id. Le cookie contient client_id la plupart du
// temps, mais on retombe sur une résolution par email si absent (le cookie a pu
// être posé avant que le client_id soit connu).
async function getYopperClientId() {
  const jar = await cookies()
  const raw = jar.get(COOKIE_NAME)?.value
  if (!raw) return null
  let identity
  try {
    identity = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    return null
  }
  if (identity?.client_id) return identity.client_id
  if (!identity?.email) return null
  const { data } = await getSupabaseAdmin()
    .from('clients')
    .select('id')
    .eq('email', identity.email)
    .single()
  return data?.id || null
}

export async function POST(req) {
  const clientId = await getYopperClientId()
  if (!clientId) {
    return NextResponse.json({ ok: false, error: 'session_yopper_manquante' }, { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'body JSON requis' }, { status: 400 })
  }

  const tags = body?.tags
  if (!tags || typeof tags !== 'object' || Object.keys(tags).length === 0) {
    return NextResponse.json({ ok: false, error: 'tags requis' }, { status: 400 })
  }

  const result = await setYopperTags(clientId, tags)
  if (!result.ok) {
    // 404 = user OneSignal pas encore créé (login() pas encore propagé). SEUL cas
    // où l'on renvoie un statut retryable : le client réessaie avec backoff.
    if (result.status === 404) {
      return NextResponse.json(result, { status: 404 })
    }
    // Autres échecs (auth, rate limit, timeout OneSignal...) : NON retryables et
    // NON bloquants (la pose de tags est best-effort). On renvoie 200 pour ne pas
    // polluer la console d'un 502 rouge ni déclencher la tempête de retries. La
    // cause exacte reste tracée côté serveur (console.error dans setYopperTags,
    // visible dans les logs Vercel).
    return NextResponse.json({ ok: false, handled: true, error: result.error }, { status: 200 })
  }

  return NextResponse.json({ ok: true })
}
