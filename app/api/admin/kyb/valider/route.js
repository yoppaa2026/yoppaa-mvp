// POST /api/admin/kyb/valider
// Body : { commercant_id }
// Auth : JWT user dans header Authorization (verification email admin cote serveur)
//
// Effets en chaine :
// 1) UPDATE commercants : kyb_statut='valide', kyb_valide_at=now(), kyb_valide_par=admin.id, kyb_motif_rejet=null
// 2) INSERT admin_validations (log avec action='kyb_valide')
// 3) Email Resend au commercant (non bloquant)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailKYBValide } from '@/lib/resend'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    const { commercant_id } = await request.json()
    if (!commercant_id) {
      return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
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
    const { data: commercant, error: errC } = await supabase
      .from('commercants')
      .update({
        kyb_statut: 'valide',
        kyb_valide_at: new Date().toISOString(),
        kyb_valide_par: user.id,
        kyb_motif_rejet: null,
      })
      .eq('id', commercant_id)
      .select('id, nom, email')
      .single()
    if (errC || !commercant) {
      return NextResponse.json({ ok: false, error: `update echoue : ${errC?.message}` }, { status: 500 })
    }

    // 2) Log de l'action (table admin_validations existante, action='kyb_valide')
    await supabase.from('admin_validations').insert({
      commercant_id,
      action: 'kyb_valide',
      motif: null,
      validated_by_email: user.email,
    })

    // 3) Email au commercant (non bloquant)
    let emailResult = { ok: false, error: 'pas d\'email destinataire' }
    if (commercant.email) {
      emailResult = await envoyerAuCommercant({
        to: commercant.email,
        subject: `Verification entreprise validee, ${commercant.nom}`,
        html: emailKYBValide({ nom: commercant.nom }),
      })
    }

    return NextResponse.json({
      ok: true,
      commercant_id,
      email: emailResult.ok ? 'envoye' : `echec : ${emailResult.error}`,
    })
  } catch (e) {
    console.error('[admin/kyb/valider] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
