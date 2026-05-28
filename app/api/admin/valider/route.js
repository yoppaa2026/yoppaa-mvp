// POST /api/admin/valider
// Body : { commercant_id }
// Auth : JWT user dans header Authorization (vérification email admin côté serveur)
//
// Effets en chaîne :
// 1) UPDATE commercants : statut='valide', statut_publication='publie', motif_rejet=null
// 2) UPDATE onboarding_commercants : statut='valide'
// 3) INSERT admin_validations (log)
// 4) Email Resend au commerçant : "Ta page est en ligne"

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailValidationCommercant } from '@/lib/resend'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    const { commercant_id } = await request.json()
    if (!commercant_id) {
      return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    }

    // Auth : crée un client Supabase qui passe le token de l'utilisateur appelant
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
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // 1) Update commerçant
    const { data: commercant, error: errC } = await supabase
      .from('commercants')
      .update({
        statut: 'valide',
        statut_publication: 'publie',
        motif_rejet: null,
      })
      .eq('id', commercant_id)
      .select('id, nom, email, slug')
      .single()
    if (errC || !commercant) {
      return NextResponse.json({ ok: false, error: `update commerçant échoué : ${errC?.message}` }, { status: 500 })
    }

    // 2) Update onboarding (peut ne pas exister → on log mais on continue)
    const { error: errOb } = await supabase
      .from('onboarding_commercants')
      .update({ statut: 'valide' })
      .eq('commercant_id', commercant_id)
    if (errOb) console.warn('[admin/valider] onboarding update warn', errOb.message)

    // 3) Log de l'action
    await supabase.from('admin_validations').insert({
      commercant_id,
      action: 'valide',
      motif: null,
      validated_by_email: user.email,
    })

    // 4) Email au commerçant (non bloquant)
    let emailResult = { ok: false, error: 'pas d\'email destinataire' }
    if (commercant.email) {
      emailResult = await envoyerAuCommercant({
        to: commercant.email,
        subject: `Ta page Yoppaa est en ligne, ${commercant.nom} 🎉`,
        html: emailValidationCommercant({ nom: commercant.nom, slug: commercant.slug }),
      })
    }

    return NextResponse.json({
      ok: true,
      commercant_id,
      email: emailResult.ok ? 'envoyé' : `échec : ${emailResult.error}`,
    })
  } catch (e) {
    console.error('[admin/valider] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
