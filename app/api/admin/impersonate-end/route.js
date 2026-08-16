// POST /api/admin/impersonate-end
//
// Ferme une session d'impersonation admin → commerçant. Set ended_at sur le row
// admin_impersonations correspondant.
//
// Appelé :
//   • Quand l'admin clique "Quitter mode admin" depuis le banner sticky
//   • Au unload de la page dashboard (best-effort via navigator.sendBeacon)
//
// Si l'impersonation_id n'est pas fourni ou introuvable, on no-op (pas d'erreur).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    const { impersonation_id } = await request.json()
    if (!impersonation_id) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const authHeader = request.headers.get('authorization') || ''
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) {
      // Best-effort : on accept un fin de session sans auth (cas navigator.sendBeacon)
      // mais on log juste. Le filtre admin_email = ADMIN_EMAIL ci-dessous limite quand meme.
      return NextResponse.json({ ok: true, no_auth: true })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })
    }
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // Update ended_at (idempotent : si déjà fermée, on ne re-update pas)
    await supabase
      .from('admin_impersonations')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', impersonation_id)
      .is('ended_at', null)

    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error('[admin/impersonate-end]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
