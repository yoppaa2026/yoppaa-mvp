// GET /api/admin/suggestions
//
// Les commerces que les habitants réclament et qui ne sont pas encore sur
// Yoppaa, regroupés par enseigne et par commune. C'est la carte de prospection
// d'Alex, pas un écran commerçant.
//
// Auth : JWT admin, même schéma que /api/admin/communes. La table porte un
// client_id, elle ne doit donc jamais être lue depuis un navigateur : la route
// ne renvoie que des agrégats et des textes libres, jamais l'auteur.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { regrouperSuggestions, parCodePostal } from '@/lib/suggestions'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

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

    // client_id n'est volontairement PAS sélectionné : rien dans cet écran ne
    // doit permettre de remonter à une personne.
    const { data: rows, error: errRows } = await admin
      .from('suggestions_commercants')
      .select('nom_commerce, adresse, type_commerce, commentaire, created_at')
      .order('created_at', { ascending: false })
      .limit(2000)
    if (errRows) throw errRows

    const groupes = regrouperSuggestions(rows || [])

    return NextResponse.json({
      ok: true,
      total: (rows || []).length,
      commerces: groupes.map(g => ({
        cle: g.cle,
        nom: g.nom,
        code_postal: g.code_postal,
        type_commerce: g.type_commerce,
        adresse: g.adresse,
        demandes: g.demandes,
        derniere: g.derniere ? g.derniere.toISOString() : null,
        premiere: g.premiere ? g.premiere.toISOString() : null,
        commentaires: g.commentaires,
      })),
      communes: parCodePostal(groupes),
    })
  } catch (e) {
    console.error('[admin/suggestions GET]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
