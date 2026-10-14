// POST /api/contact-pro : « On te rappelle » depuis la landing (Alex, 14/10 :
// « un contact s'ils ont des questions, tu veux une démo ? »).
//
// Un commerçant qui hésite laisse le nom de son commerce, son GSM et ce qu'il
// veut (une démo, une question, qu'on encode sa carte). Yoppaa reçoit un email
// et le rappelle. RIEN N'EST STOCKÉ : la demande vit dans la boîte de Yoppaa,
// pas dans une table de plus remplie de numéros de GSM.
//
// 🔴 CE N'EST PAS UN RELAIS DE COURRIER (leçon de `notify-yoppaa`, 21/08) :
//   • le DESTINATAIRE est fixe, `envoyerAuAdmin`, jamais une adresse du corps ;
//   • tout ce que l'appelant écrit est ÉCHAPPÉ avant d'entrer dans le HTML, et
//     borné en longueur ;
//   • le motif vient d'une liste fermée (`MOTIFS_RAPPEL`).
//
// 🔴 SANS SECRET, ON REFUSE (reference_fail_open_secret_absent). Turnstile
// « saute » quand sa clé manque ; c'est voulu en local, jamais sur un site
// déployé : là, un formulaire public sans anti-robot devient un canon à
// emails vers la boîte d'Alex.

import { NextResponse } from 'next/server'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { envoyerAuAdmin, echapperHtml } from '@/lib/resend'
import { telephoneValide } from '@/lib/coordonnees-client'
import { motifsActifs } from '@/lib/contact'

const COMMERCE_MAX = 120
const PRENOM_MAX = 60
const MESSAGE_MAX = 600

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null)
    const { commerce, prenom, gsm, motif, message, turnstile_token } = body || {}

    const nomCommerce = String(commerce ?? '').trim()
    const prenomPropre = String(prenom ?? '').trim()
    const texte = String(message ?? '').trim()
    if (!nomCommerce || nomCommerce.length > COMMERCE_MAX) {
      return NextResponse.json({ ok: false, error: 'Dis-nous le nom de ton commerce.' }, { status: 400 })
    }
    if (prenomPropre.length > PRENOM_MAX || texte.length > MESSAGE_MAX) {
      return NextResponse.json({ ok: false, error: 'Ton message est trop long.' }, { status: 400 })
    }
    if (!telephoneValide(gsm)) {
      return NextResponse.json({ ok: false, error: 'Ton numéro de GSM ne semble pas complet.' }, { status: 400 })
    }
    const motifRetenu = motifsActifs().find(m => m.cle === motif)
    if (!motifRetenu) {
      return NextResponse.json({ ok: false, error: 'Dis-nous ce que tu veux : une démo, une question…' }, { status: 400 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const verdict = await verifyTurnstileToken(turnstile_token, ip)
    const deploye = !!process.env.VERCEL_ENV
    if (verdict.skipped && deploye) {
      console.error('[contact-pro] TURNSTILE_SECRET_KEY absente sur un site déployé : demande refusée')
      return NextResponse.json({ ok: false, error: 'Le formulaire est indisponible, écris-nous sur WhatsApp.' }, { status: 503 })
    }
    if (!verdict.success && !verdict.skipped) {
      return NextResponse.json({ ok: false, error: 'La vérification anti-robot a échoué, réessaie.' }, { status: 401 })
    }

    const lignes = [
      ['Commerce', nomCommerce],
      ['Prénom', prenomPropre || '(non donné)'],
      ['GSM', String(gsm).trim()],
      ['Demande', motifRetenu.libelle],
      ['Message', texte || '(aucun)'],
    ]
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#1A0840;line-height:1.5">
        <p style="margin:0 0 12px;font-size:17px;font-weight:700">📞 Un commerçant veut qu’on le rappelle</p>
        <table style="border-collapse:collapse">
          ${lignes.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6B7280;vertical-align:top">${k}</td><td style="padding:4px 0;font-weight:600;white-space:pre-wrap">${echapperHtml(v)}</td></tr>`).join('')}
        </table>
        <p style="margin:16px 0 0;color:#6B7280;font-size:13px">Envoyé depuis la landing (« On te rappelle »). Rien n’est stocké : cet email est la seule trace.</p>
      </div>`

    const envoi = await envoyerAuAdmin({
      subject: `📞 À rappeler : ${nomCommerce.slice(0, 60)} · ${motifRetenu.libelle}`,
      html,
    })
    // ⚠️ UN ENVOI QUI ÉCHOUE SE DIT : sinon le commerçant attend un appel que
    // personne ne passera, et c'est pire que pas de formulaire.
    if (envoi && envoi.ok === false) {
      console.error('[contact-pro] envoi échoué', envoi.error)
      return NextResponse.json({ ok: false, error: 'L’envoi a échoué. Écris-nous sur WhatsApp, on répond vite.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[contact-pro]', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur, réessaie ou écris-nous sur WhatsApp.' }, { status: 500 })
  }
}
