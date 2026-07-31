// POST /api/kit/envoyer
//
// Envoie au commerçant son kit de démarrage par email (« Bienvenue dans la
// tribu Yoppaa »). Deux usages :
//   • à la demande, depuis son dashboard (bouton « Recevoir mon kit »)
//   • automatiquement à la validation de son inscription (appel interne)
//
// Le contenu s'adapte à la phase : avant le 1er septembre, le kit sert à
// recruter des préinscrits (lien ?ref= attribué au commerçant) ; après, il
// envoie commander sur la fiche.
//
// Body : { commercant_id }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailKitBienvenue } from '@/lib/resend'
import { avantLancement } from '@/lib/lancement'

export async function POST(request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const { commercant_id } = await request.json()
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    const { data: com } = await admin
      .from('commercants')
      .select('id, nom, slug, email, auth_user_id')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!com) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (com.auth_user_id !== user.id && user.email !== 'verstappenalexandre@gmail.com') {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }
    // On envoie à l'adresse du compte connecté si le commerce n'a pas d'email
    const destinataire = com.email || user.email
    if (!destinataire) return NextResponse.json({ ok: false, error: 'aucune adresse email connue' }, { status: 400 })

    await envoyerAuCommercant({
      to: destinataire,
      subject: 'Ton kit Yoppaa 🟣',
      html: emailKitBienvenue({
        nom_commercant: com.nom,
        slug: com.slug,
        avant_lancement: avantLancement(),
      }),
    })

    return NextResponse.json({ ok: true, envoye_a: destinataire })
  } catch (e) {
    console.error('[kit/envoyer]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
