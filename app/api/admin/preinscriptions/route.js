// GET /api/admin/preinscriptions
// Auth : JWT admin dans header Authorization. Renvoie les agrégats + la liste des
// préinscriptions (contrôle de la croissance). Lecture en service_role (la table
// pre_inscriptions est verrouillée par RLS ; l'accès est protégé par le check admin).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function GET(request) {
  try {
    const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    // 1) Vérif admin via le token appelant (client anon).
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // 2) Lecture service_role (contourne la RLS ; accès déjà protégé ci-dessus).
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: rows } = await admin
      .from('pre_inscriptions')
      .select('email, code_postal, type_utilisateur, commercant_nom, ref_commercant, commune_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5000)

    const { data: communes } = await admin.from('communes').select('id, nom')
    const nomCommune = Object.fromEntries((communes || []).map(c => [c.id, c.nom]))

    const list = rows || []
    const total = list.length
    const nbCommercants = list.filter(r => r.type_utilisateur === 'commercant').length
    const nbCurieux = list.filter(r => r.type_utilisateur !== 'commercant').length

    // Croissance par jour (30 derniers jours), en YYYY-MM-DD.
    const parJour = {}
    for (const r of list) {
      const j = (r.created_at || '').slice(0, 10)
      if (j) parJour[j] = (parJour[j] || 0) + 1
    }
    const croissance = Object.entries(parJour).sort((a, b) => a[0].localeCompare(b[0])).map(([jour, n]) => ({ jour, n }))

    // Top communes.
    const parCommune = {}
    for (const r of list) {
      const nom = nomCommune[r.commune_id] || 'Hors zone'
      if (!parCommune[nom]) parCommune[nom] = { nom, total: 0, commercants: 0, curieux: 0 }
      parCommune[nom].total++
      if (r.type_utilisateur === 'commercant') parCommune[nom].commercants++
      else parCommune[nom].curieux++
    }
    const topCommunes = Object.values(parCommune).sort((a, b) => b.total - a.total)

    // Commerçants cités (prospection).
    const commercantsCites = list
      .filter(r => r.commercant_nom)
      .map(r => ({ nom: r.commercant_nom, code_postal: r.code_postal, type: r.type_utilisateur, created_at: r.created_at }))

    // Liste récente (40 dernières) enrichie du nom de commune.
    const recent = list.slice(0, 40).map(r => ({
      email: r.email,
      code_postal: r.code_postal,
      commune: nomCommune[r.commune_id] || null,
      type: r.type_utilisateur,
      commercant_nom: r.commercant_nom || null,
      ref_commercant: r.ref_commercant || null,
      created_at: r.created_at,
    }))

    return NextResponse.json({ ok: true, total, nbCurieux, nbCommercants, croissance, topCommunes, commercantsCites, recent })
  } catch (e) {
    console.error('[admin/preinscriptions]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
