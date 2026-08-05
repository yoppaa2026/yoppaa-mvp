// POST /api/commande/ignore-avis
//
// Marque une commande comme "avis ignoré" via avis_ignore_at = NOW(). Permet
// au Yopper de ne plus recevoir la sollicitation d'évaluation sur cette
// commande, y compris depuis un autre appareil (persistence serveur, remplace
// l'ancien localStorage 'yoppaa_avis_proposes' qui ne franchissait pas les
// appareils).
//
// Body attendu : { commande_id: UUID }
//
// Auth : cookie HTTP-only yopper session. Le client_email du cookie doit
// matcher le client_email de la commande (sécurité minimale, un autre
// Yopper ne peut pas dismiss les avis d'un tiers).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { identiteYopper } from '@/lib/yopper-auth'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// ⚠️ Lisait encore l'ANCIEN cookie non signé (durcissement du 03/08) : masquer
// une demande d'avis échouait donc toujours en silence.
//
// Ici l'identité DÉCLARÉE suffit, et c'est délibéré : le geste consiste à
// masquer une invitation sur SA propre commande, souvent passée en invité juste
// avant. Exiger la connexion casserait le geste pour protéger une donnée qui
// n'en est pas une. La commande est de toute façon revérifiée par l'email.
async function getYopperEmail(request) {
  const id = await identiteYopper(request)
  return id?.email || null
}

export async function POST(req) {
  const email = await getYopperEmail(req)
  if (!email) {
    return NextResponse.json({ ok: false, error: 'session_yopper_manquante' }, { status: 401 })
  }

  let body
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'body JSON requis' }, { status: 400 }) }
  const { commande_id } = body || {}
  if (!commande_id || typeof commande_id !== 'string') {
    return NextResponse.json({ ok: false, error: 'commande_id requis' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('commandes')
    .update({ avis_ignore_at: new Date().toISOString() })
    .eq('id', commande_id)
    .eq('client_email', email)   // sécurité : uniquement les siennes
    .select('id, avis_ignore_at')

  if (error) {
    console.error('[api/commande/ignore-avis] update erreur', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: 'commande introuvable ou non autorisée' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, commande: data[0] })
}
