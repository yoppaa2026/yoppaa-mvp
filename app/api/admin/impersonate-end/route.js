// POST /api/admin/impersonate-end
//
// Ferme au journal une connexion admin en tant que commerçant (`ended_at`).
//
// Appelé :
//   • par « Quitter » dans le bandeau, avec `impersonation_id` ;
//   • quand les deux heures sont écoulées, par le tableau de bord ;
//   • à la déconnexion, du tableau de bord ET de l'admin, avec `toutes: true` :
//     la connexion vit dans un onglet, et la déconnexion ne sait pas lequel.
//
// 🔴 15/09 : la mise à jour n'était pas lue, et un appel sans jeton répondait
// « ok ». Une fermeture refusée par la base laissait la ligne ouverte à vie,
// pendant que l'écran la croyait fermée. On lit, et on dit.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { finAInscrire } from '@/lib/impersonation'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    let body = {}
    try { body = await request.json() } catch { /* traité juste en dessous */ }
    const { impersonation_id = null, toutes = false } = body || {}
    if (!impersonation_id && toutes !== true) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })
    }
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    let requete = supabase
      .from('admin_impersonations')
      .select('id, started_at')
      .eq('admin_email', user.email)
      .is('ended_at', null)
    if (!toutes) requete = requete.eq('id', impersonation_id)
    const { data: ouvertes, error: errLecture } = await requete
    if (errLecture) {
      console.error('[admin/impersonate-end] journal illisible', errLecture.message)
      return NextResponse.json({ ok: false, error: 'journal illisible' }, { status: 500 })
    }

    // ⚠️ À LA FIN DE SA DURÉE pour une ligne oubliée, au moment réel sinon :
    // « maintenant » sur une ligne de trois jours ferait croire à trois jours
    // d'accès.
    const maintenant = new Date()
    let fermees = 0
    for (const l of ouvertes || []) {
      const { data: faite, error: errFin } = await supabase
        .from('admin_impersonations')
        .update({ ended_at: finAInscrire(l, maintenant).toISOString() })
        .eq('id', l.id)
        .is('ended_at', null)
        .select('id')
      if (errFin || !faite?.length) {
        console.error('[admin/impersonate-end] ligne non fermée', { id: l.id, erreur: errFin?.message || 'aucune ligne mise à jour' })
        return NextResponse.json({ ok: false, error: 'fermeture refusée par la base' }, { status: 500 })
      }
      fermees++
    }

    return NextResponse.json({ ok: true, fermees })

  } catch (e) {
    console.error('[admin/impersonate-end]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
