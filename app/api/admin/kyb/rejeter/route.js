// POST /api/admin/kyb/rejeter
// Body : { commercant_id, motif }
// Auth : JWT user dans header Authorization (verification email admin cote serveur)
//
// Effets en chaine :
// 1) UPDATE commercants : kyb_statut='rejete', kyb_motif_rejet=motif
// 2) INSERT admin_validations (log avec action='kyb_rejete')
// 3) Email Resend au commercant (non bloquant)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailKYBRejete } from '@/lib/resend'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    const { commercant_id, motif } = await request.json()
    if (!commercant_id) {
      return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    }
    if (!motif || motif.trim().length < 10) {
      return NextResponse.json({ ok: false, error: 'motif min 10 caracteres' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'non authentifie' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'acces refuse' }, { status: 403 })
    }

    // 1) Update commercant
    const motifClean = motif.trim()
    const { data: commercant, error: errC } = await supabase
      .from('commercants')
      .update({
        kyb_statut: 'rejete',
        kyb_motif_rejet: motifClean,
      })
      .eq('id', commercant_id)
      .select('id, nom, email')
      .single()
    if (errC || !commercant) {
      return NextResponse.json({ ok: false, error: `update echoue : ${errC?.message}` }, { status: 500 })
    }

    // 2) Log
    await supabase.from('admin_validations').insert({
      commercant_id,
      action: 'kyb_rejete',
      motif: motifClean,
      validated_by_email: user.email,
    })

    // 3) Email au commercant (non bloquant)
    let emailResult = { ok: false, error: 'pas d\'email destinataire' }
    if (commercant.email) {
      emailResult = await envoyerAuCommercant({
        to: commercant.email,
        subject: `Verification entreprise a corriger, ${commercant.nom}`,
        html: emailKYBRejete({ nom: commercant.nom, motif: motifClean }),
      })
    }

    return NextResponse.json({
      ok: true,
      commercant_id,
      email: emailResult.ok ? 'envoye' : `echec : ${emailResult.error}`,
    })
  } catch (e) {
    console.error('[admin/kyb/rejeter] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
