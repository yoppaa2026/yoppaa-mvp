// POST /api/admin/impersonate-start
//
// Log le début d'une session d'impersonation admin → commerçant.
// Trace requise pour conformité RGPD : tout accès admin à un compte commerçant
// est consigné (qui, quel commerçant, quand, raison optionnelle).
//
// Le FE appelle cette route AVANT de naviguer vers /dashboard. Elle retourne un
// impersonation_id que l'écran range DANS L'ONGLET (sessionStorage, 15/09), et
// que le tableau de bord fait confirmer par /api/admin/impersonate-verifier à
// chaque chargement.
//
// 🔴 ET ELLE FERME LES LIGNES RESTÉES OUVERTES AU-DELÀ DE LEUR DURÉE (15/09).
// Avant, une ligne dont personne n'avait cliqué « Quitter » restait ouverte à
// vie : le journal disait qu'un accès durait depuis des jours. ⚠️ Seulement
// celles qui ont DÉPASSÉ deux heures : un autre onglet peut légitimement
// travailler sur un autre commerce en même temps.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { finAInscrire, ligneExpiree } from '@/lib/impersonation'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    const { commercant_id, raison } = await request.json()
    if (!commercant_id) {
      return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    }

    // Auth check
    const authHeader = request.headers.get('authorization') || ''
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })
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

    // Vérif que le commerçant existe
    const { data: c } = await supabase
      .from('commercants')
      .select('id, nom')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!c) {
      return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    }

    // Les lignes restées ouvertes au-delà de leur durée se ferment, à la fin de
    // cette durée et pas à « maintenant ».
    const maintenant = new Date()
    const { data: ouvertes, error: errOuvertes } = await supabase
      .from('admin_impersonations')
      .select('id, started_at')
      .eq('admin_email', user.email)
      .is('ended_at', null)
    // ⚠️ NON BLOQUANT, MAIS DIT : ouvrir la nouvelle ligne compte plus que ranger
    // les anciennes, et l'échec se lit dans les journaux du serveur.
    if (errOuvertes) console.error('[admin/impersonate-start] lignes ouvertes illisibles', errOuvertes.message)
    for (const l of (ouvertes || []).filter(l => ligneExpiree(l, maintenant))) {
      const { error: errFin } = await supabase
        .from('admin_impersonations')
        .update({ ended_at: finAInscrire(l, maintenant).toISOString() })
        .eq('id', l.id)
        .is('ended_at', null)
      if (errFin) console.error('[admin/impersonate-start] ligne expirée non fermée', { id: l.id, erreur: errFin.message })
    }

    // Log : insert dans admin_impersonations
    const userAgent = request.headers.get('user-agent') || null
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null

    const { data: imp, error: errImp } = await supabase
      .from('admin_impersonations')
      .insert({
        admin_email: user.email,
        commercant_id,
        raison: raison?.slice(0, 480) || null,
        ip_address: ipAddress,
        user_agent: userAgent?.slice(0, 480) || null,
      })
      .select('id, started_at')
      .single()

    if (errImp) {
      console.error('[admin/impersonate-start]', errImp)
      return NextResponse.json({ ok: false, error: errImp.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      impersonation_id: imp.id,
      commercant_nom: c.nom,
      started_at: imp.started_at,
    })

  } catch (e) {
    console.error('[admin/impersonate-start]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
