// Notifie l'équipe Yoppaa (alexandre@avcotech.be) qu'un nouveau commerçant
// vient de soumettre son onboarding et attend validation depuis /admin.
// Branché sur Resend via lib/resend.js. Non bloquant pour la soumission :
// si l'email échoue, on retourne 500 mais le commerçant a quand même son
// statut 'en_attente_validation' enregistré côté DB.

import { NextResponse } from 'next/server'
import { envoyerAuAdmin, envoyerAuCommercant, emailNouveauCommercantAValider, emailDemandeRecue } from '@/lib/resend'

export async function POST(request) {
  try {
    const body = await request.json()
    const { commercant_id, nom, type, plan, score, success_pack, email } = body || {}

    // Accusé de réception AU COMMERÇANT (rassure pendant l'attente de validation).
    // Best effort : un échec ici ne bloque pas la notification admin.
    if (email) {
      const r = await envoyerAuCommercant({
        to: email,
        subject: 'Ta demande Yoppaa est bien reçue 🟣',
        html: emailDemandeRecue({ nom: nom || 'Commerçant', plan: plan || 'exister' }),
      }).catch(e => ({ ok: false, error: e?.message }))
      if (!r.ok) console.error('[notify-yoppaa] accusé réception commerçant échoué', r.error)
    }

    const html = emailNouveauCommercantAValider({
      commercant_id,
      nom: nom || 'Commerçant sans nom',
      type: type || '—',
      plan: plan || 'exister',
      score: typeof score === 'number' ? score : 0,
      success_pack: success_pack || null,
    })

    const result = await envoyerAuAdmin({
      subject: `Nouveau commerçant à valider — ${nom || 'Sans nom'}`,
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
