// Favoris d'un Yopper, côté serveur.
//
// POURQUOI CETTE ROUTE. La table `favoris` était lisible, insérable ET
// supprimable par n'importe qui avec la clé publique : on pouvait lire les
// favoris de tout le monde, et surtout effacer ceux des autres. Le navigateur
// n'ayant pas d'identité Supabase Auth pour un Yopper, aucune policy SQL ne
// pouvait distinguer le propriétaire. On sort donc l'écriture de la base.
//
// L'identité vient du COOKIE serveur, jamais du corps de la requête : sans
// cela, il suffirait d'envoyer l'identifiant d'un autre pour agir en son nom.
//
// GET    → { ok, favoris: [commercant_id] }
// POST   { commercant_id, action: 'ajouter' | 'retirer' }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { lireIdentiteYopper } from '@/lib/yopper-session'
import { globalLimiter, checkLimit, clientIp } from '@/lib/ratelimit'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function GET() {
  const identite = await lireIdentiteYopper()
  if (!identite?.client_id) return NextResponse.json({ ok: true, favoris: [] })
  const { data } = await admin()
    .from('favoris')
    .select('commercant_id')
    .eq('client_id', identite.client_id)
  return NextResponse.json({ ok: true, favoris: (data || []).map(f => f.commercant_id) })
}

export async function POST(request) {
  try {
    const limite = await checkLimit(globalLimiter, clientIp(request))
    if (!limite.success) {
      return NextResponse.json({ ok: false, error: 'Trop de requêtes, réessaie dans un instant.' }, { status: 429 })
    }

    const identite = await lireIdentiteYopper()
    if (!identite?.client_id) {
      return NextResponse.json({ ok: false, error: 'Connecte-toi pour garder tes favoris.' }, { status: 401 })
    }

    const { commercant_id, action } = await request.json().catch(() => ({}))
    if (!commercant_id || !['ajouter', 'retirer'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'paramètres invalides' }, { status: 400 })
    }

    const supabase = admin()
    if (action === 'retirer') {
      await supabase.from('favoris').delete()
        .eq('client_id', identite.client_id)
        .eq('commercant_id', commercant_id)
      return NextResponse.json({ ok: true, favori: false })
    }

    // Idempotent : un double clic ne doit pas créer deux lignes.
    const { data: existant } = await supabase.from('favoris')
      .select('id')
      .eq('client_id', identite.client_id)
      .eq('commercant_id', commercant_id)
      .maybeSingle()
    if (!existant) {
      await supabase.from('favoris').insert({ client_id: identite.client_id, commercant_id })
    }
    return NextResponse.json({ ok: true, favori: true })
  } catch (e) {
    console.error('[yopper/favoris]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
