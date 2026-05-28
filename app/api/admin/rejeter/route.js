// POST /api/admin/rejeter
// Body : { commercant_id, motif }
// Auth : JWT user dans header Authorization (vérification email admin côté serveur)
//
// Effets en chaîne :
// 1) UPDATE commercants : motif_rejet, statut_publication reste 'brouillon'
// 2) UPDATE onboarding_commercants : statut='rejete', etape_actuelle ramenée à 5
//    (pour que le commerçant puisse re-soumettre depuis l'étape validation)
// 3) INSERT admin_validations (log avec motif)
// 4) Email Resend au commerçant : "Demande à compléter" + motif

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailRejetCommercant } from '@/lib/resend'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    const { commercant_id, motif } = await request.json()
    if (!commercant_id) {
      return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    }
    if (!motif || !motif.trim()) {
      return NextResponse.json({ ok: false, error: 'motif obligatoire' }, { status: 400 })
    }

    // Auth admin
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

    const motifClean = motif.trim()

    // 1) Update commerçant : on stocke le motif et on garde la fiche en brouillon
    const { data: commercant, error: errC } = await supabase
      .from('commercants')
      .update({
        motif_rejet: motifClean,
        statut_publication: 'brouillon',
      })
      .eq('id', commercant_id)
      .select('id, nom, email')
      .single()
    if (errC || !commercant) {
      return NextResponse.json({ ok: false, error: `update commerçant échoué : ${errC?.message}` }, { status: 500 })
    }

    // 2) Update onboarding : statut rejete + revient à l'étape 5 pour re-soumettre
    const { error: errOb } = await supabase
      .from('onboarding_commercants')
      .update({ statut: 'rejete', etape_actuelle: 5 })
      .eq('commercant_id', commercant_id)
    if (errOb) console.warn('[admin/rejeter] onboarding update warn', errOb.message)

    // 3) Log
    await supabase.from('admin_validations').insert({
      commercant_id,
      action: 'rejete',
      motif: motifClean,
      validated_by_email: user.email,
    })

    // 4) Email au commerçant avec motif
    let emailResult = { ok: false, error: 'pas d\'email destinataire' }
    if (commercant.email) {
      emailResult = await envoyerAuCommercant({
        to: commercant.email,
        subject: `Demande Yoppaa à compléter — ${commercant.nom}`,
        html: emailRejetCommercant({ nom: commercant.nom, motif: motifClean }),
      })
    }

    return NextResponse.json({
      ok: true,
      commercant_id,
      email: emailResult.ok ? 'envoyé' : `échec : ${emailResult.error}`,
    })
  } catch (e) {
    console.error('[admin/rejeter] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
