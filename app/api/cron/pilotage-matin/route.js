// GET /api/cron/pilotage-matin
//
// ✅ ALEX, 19/10 (tableau) : chaque matin à 7h00, l'essentiel de la veille par
// email, avec le lien vers la page « Pilotage » de l'admin. Avant le Good
// Morning des Yoppers (7h30).
//
// Même calcul que la page (`construirePilotage`). Profite du passage pour
// purger le journal technique au-delà de 90 jours.
//
// Sécurité : header Authorization: Bearer <CRON_SECRET>.
// 🔴 7H À BRUXELLES, ÉTÉ COMME HIVER : deux passages planifiés dans
// vercel.json, un seul travaille (`lib/heure-cron.js`).

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeCron, refusCron } from '@/lib/cron-auth'
import { horsDeSonHeure } from '@/lib/heure-cron'
import { noterPassageCron, purgerJournal } from '@/lib/journal-technique'
import { construirePilotage } from '@/lib/pilotage-server'
import { emailPilotage } from '@/lib/pilotage-email'
import { envoyerAuAdmin } from '@/lib/resend'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const refuse = refusCron(gardeCron(request, 'cron/pilotage-matin'), NextResponse)
  if (refuse) return refuse
  if (horsDeSonHeure(request, '/api/cron/pilotage-matin')) return NextResponse.json({ ok: true, ignore: 'pas_son_heure' })
  const admin = clientAdmin()
  await noterPassageCron('/api/cron/pilotage-matin', null, admin)

  try {
    const pilotage = await construirePilotage(admin, new Date())
    const mail = emailPilotage(pilotage)
    const res = await envoyerAuAdmin({ subject: mail.subject, html: mail.html })
    const purgees = await purgerJournal(admin)
    console.log('[cron] /api/cron/pilotage-matin : envoyé', JSON.stringify({ ok: !!res?.ok, alertes: pilotage.alertes.length, purgees }))
    if (!res?.ok) return NextResponse.json({ ok: false, error: res?.error || 'envoi refusé' }, { status: 502 })
    return NextResponse.json({ ok: true, alertes: pilotage.alertes.length, purgees })
  } catch (e) {
    console.error('[cron/pilotage-matin]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
