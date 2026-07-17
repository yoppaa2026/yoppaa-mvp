// /api/admin/communes
//   GET   -> liste des communes + stats (seuil, active, nb commerçants, nb curieux)
//   PATCH -> met à jour seuil_preinscrits et/ou active d'une commune
//
// Auth : JWT admin dans le header Authorization (même schéma que les autres routes
// admin). Lecture/écriture en service_role (la table `communes` est verrouillée par
// RLS ; l'accès est protégé par le check admin ci-dessous).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

// Vérifie le token appelant et renvoie un client service_role si admin, sinon null.
async function requireAdmin(request) {
  const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!accessToken) return { error: 'non authentifié', status: 401 }

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) return { error: 'accès refusé', status: 403 }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  return { admin }
}

export async function GET(request) {
  try {
    const { admin, error, status } = await requireAdmin(request)
    if (error) return NextResponse.json({ ok: false, error }, { status })

    // La vue commune_stats agrège tout ce qu'il faut (aucun PII).
    const { data: rows } = await admin
      .from('commune_stats')
      .select('commune_id, nom, nb_commercants, nb_yoppers, seuil_preinscrits, active')
      .order('nom', { ascending: true })

    return NextResponse.json({ ok: true, communes: rows || [] })
  } catch (e) {
    console.error('[admin/communes GET]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const { admin, error, status } = await requireAdmin(request)
    if (error) return NextResponse.json({ ok: false, error }, { status })

    const body = await request.json()
    const { commune_id } = body || {}
    if (!commune_id) return NextResponse.json({ ok: false, error: 'commune_id requis' }, { status: 400 })

    // On ne met à jour que les champs fournis, chacun validé.
    const patch = {}
    if (body.seuil_preinscrits !== undefined) {
      const s = Number(body.seuil_preinscrits)
      if (!Number.isInteger(s) || s < 1 || s > 999) {
        return NextResponse.json({ ok: false, error: 'Seuil invalide (entier 1 à 999)' }, { status: 400 })
      }
      patch.seuil_preinscrits = s
    }
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') {
        return NextResponse.json({ ok: false, error: 'active doit être un booléen' }, { status: 400 })
      }
      patch.active = body.active
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: 'Rien à mettre à jour' }, { status: 400 })
    }

    const { error: errUpd } = await admin.from('communes').update(patch).eq('id', commune_id)
    if (errUpd) {
      console.error('[admin/communes PATCH] update KO', errUpd)
      return NextResponse.json({ ok: false, error: 'Erreur mise à jour' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, commune_id, ...patch })
  } catch (e) {
    console.error('[admin/communes PATCH]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
