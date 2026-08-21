// Notifie l'équipe Yoppaa qu'un nouveau commerçant vient de soumettre son
// onboarding et attend validation depuis /admin, et envoie au commerçant son
// accusé de réception.
//
// ⚠️ CETTE ROUTE ÉTAIT UN RELAIS DE COURRIER OUVERT, ET C'EST LE DÉFAUT LE PLUS
// GRAVE DE L'AUDIT DU 21/08.
//
// Elle n'avait AUCUNE authentification : ni jeton, ni cookie, ni captcha, ni
// contrôle d'origine. `proxy.js` couvre bien `/api/:path*` mais ne pose qu'une
// limite de débit, qui échoue ouverte. L'appelant choisissait donc à la fois le
// DESTINATAIRE (`email` → `to:`) et le TEXTE (`nom`), lequel était interpolé
// sans échappement dans le gabarit. N'importe qui sur Internet pouvait faire
// partir, depuis l'expéditeur @yoppaa.app signé DKIM et SPF, un courriel
// Yoppaa authentique contenant ses propres liens, vers n'importe quelle
// adresse. C'est de l'hameçonnage clés en main, offert par nous, et aligné
// DMARC.
//
// Deux verrous, et il faut les deux :
//   1. le JETON de l'appelant, et la fiche doit LUI appartenir ;
//   2. le destinataire et le nom viennent de la BASE, jamais du corps.
// Le premier seul ne suffirait pas : un commerçant authentifié pourrait encore
// écrire dans le champ `email` l'adresse de quelqu'un d'autre.
//
// Body : { commercant_id, type, score, success_pack }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuAdmin, envoyerAuCommercant, emailNouveauCommercantAValider, emailDemandeRecue } from '@/lib/resend'

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

    const body = await request.json()
    const { commercant_id, type, score, success_pack } = body || {}
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    // Clé de service pour relire la fiche : c'est elle qui fait autorité sur le
    // nom et l'adresse, pas ce que l'appelant raconte.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    const { data: com } = await admin
      .from('commercants')
      .select('id, nom, email, plan, auth_user_id')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!com) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (com.auth_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    const nom = com.nom || 'Commerçant sans nom'
    const plan = com.plan || 'exister'

    // Accusé de réception AU COMMERÇANT, à l'adresse de SA fiche.
    // Best effort : un échec ici ne bloque pas la notification admin.
    if (com.email) {
      const r = await envoyerAuCommercant({
        to: com.email,
        subject: 'Ta demande Yoppaa est bien reçue 🟣',
        html: emailDemandeRecue({ nom, plan }),
      }).catch(e => ({ ok: false, error: e?.message }))
      if (!r.ok) console.error('[notify-yoppaa] accusé réception commerçant échoué', r.error)
    }

    const html = emailNouveauCommercantAValider({
      commercant_id,
      nom,
      type: type || '—',
      plan,
      score: typeof score === 'number' ? score : 0,
      success_pack: success_pack || null,
    })

    const result = await envoyerAuAdmin({
      subject: `Nouveau commerçant à valider — ${nom}`,
      html,
    })

    if (!result.ok) {
      console.error('[notify-yoppaa] envoi Resend échoué', result.error)
      return NextResponse.json({ ok: false, error: 'email_failed', detail: result.error }, { status: 502 })
    }

    return NextResponse.json({ ok: true, id: result.id })
  } catch (e) {
    console.error('[notify-yoppaa] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
