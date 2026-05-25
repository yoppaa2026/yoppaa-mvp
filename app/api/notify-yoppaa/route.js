// Notifie l'équipe Yoppaa qu'un nouveau commerçant attend validation.
// Pour l'instant : log console + retour 200. Quand Resend sera branché
// (npm install resend + variable RESEND_API_KEY dans .env), remplacer le
// contenu par un vrai envoi d'email à alexandre@avcotech.be.

import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const body = await request.json()
    const { commercant_id, nom, plan, score, success_pack } = body || {}

    // TODO Resend : remplacer ce log par un envoi d'email réel.
    // import { Resend } from 'resend'
    // const resend = new Resend(process.env.RESEND_API_KEY)
    // await resend.emails.send({
    //   from: 'Yoppaa <noreply@yoppaa.app>',
    //   to: 'alexandre@avcotech.be',
    //   subject: `Nouveau commerçant à valider — ${nom}`,
    //   html: `...`,
    // })
    console.log('[notify-yoppaa] Nouveau commerçant à valider :', {
      commercant_id, nom, plan, score, success_pack,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[notify-yoppaa] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
