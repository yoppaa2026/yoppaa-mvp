// GET / POST /api/cron/reveal-21juillet
//
// Cron quotidien Vercel qui envoie emailRevealLaunch() aux pré-inscrits en mode
// 'teasing' qui ne l'ont pas encore reçu, une fois la date de dévoilement passée.
//
// Comportement :
//   - Avant NEXT_PUBLIC_REVEAL_DATE (défaut 2026-08-01T10:00:00+02:00, annonce
//     déplacée du 21/07 au 1er août le 14/07) : no-op
//   - À partir du jour J : envoie aux pré-inscrits teasing avec
//     notification_reveal_envoyee = false
//   - Anti-doublon : notification_reveal_envoyee + notification_reveal_envoyee_at
//     (colonnes déjà présentes dans MIGRATION_PRE_INSCRIPTIONS.sql)
//
// Le cron tourne 1×/jour à 07:00 UTC (= 09:00 Brussels été). S'il y a plus de
// pré-inscrits que BATCH_SIZE, un batch de plus est envoyé le lendemain (ou
// on peut trigger manuellement via curl).
//
// Sécurité : Bearer CRON_SECRET (même pattern que billing-relances).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant } from '@/lib/resend'
import { emailRevealLaunch } from '@/lib/resend-landing'

const BATCH_SIZE = 100
const DELAY_MS_BETWEEN_SENDS = 120  // Resend rate-limit friendly

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.warn('[cron/reveal-21juillet] CRON_SECRET non configurée, endpoint NON protégé')
    return true
  }
  const authHeader = req.headers.get('authorization') || ''
  return authHeader === `Bearer ${cronSecret}`
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function handle(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const revealDate = new Date(process.env.NEXT_PUBLIC_REVEAL_DATE || '2026-08-01T10:00:00+02:00')
  const now = new Date()

  if (now < revealDate) {
    return NextResponse.json({
      status: 'skipped',
      reason: 'reveal_date_not_reached',
      reveal_date: revealDate.toISOString(),
      now: now.toISOString(),
    })
  }

  const supabase = getSupabaseAdmin()

  const { data: preinscrits, error } = await supabase
    .from('pre_inscriptions')
    .select('id, email, type_utilisateur')
    .eq('mode_landing', 'teasing')
    .eq('notification_reveal_envoyee', false)
    .eq('consentement_marketing', true)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[cron/reveal-21juillet] fetch pré-inscriptions échoué', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!preinscrits || preinscrits.length === 0) {
    return NextResponse.json({
      status: 'ok',
      stats: { total: 0, sent: 0, failed: 0 },
      reveal_date: revealDate.toISOString(),
      note: 'aucun pré-inscrit teasing en attente',
    })
  }

  const html = emailRevealLaunch()
  const subject = "Yoppaa, c'est parti"

  const stats = { total: preinscrits.length, sent: 0, failed: 0, errors: [] }

  for (const p of preinscrits) {
    const res = await envoyerAuCommercant({ to: p.email, subject, html })
    if (res.ok) {
      const { error: upErr } = await supabase
        .from('pre_inscriptions')
        .update({
          notification_reveal_envoyee: true,
          notification_reveal_envoyee_at: new Date().toISOString(),
        })
        .eq('id', p.id)
      if (upErr) {
        console.error('[cron/reveal-21juillet] update flag échoué', { email: p.email, upErr })
        stats.failed++
        stats.errors.push({ email: p.email, error: upErr.message })
      } else {
        stats.sent++
      }
    } else {
      stats.failed++
      stats.errors.push({ email: p.email, error: res.error?.message || String(res.error) })
    }
    await sleep(DELAY_MS_BETWEEN_SENDS)
  }

  return NextResponse.json({
    status: 'ok',
    stats,
    reveal_date: revealDate.toISOString(),
    hint: preinscrits.length === BATCH_SIZE
      ? 'Batch plein, relance manuelle possible pour vider la file plus vite.'
      : 'Batch complet traité.',
  })
}

export async function GET(req) { return handle(req) }
export async function POST(req) { return handle(req) }
