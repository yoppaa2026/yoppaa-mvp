// GET / POST /api/cron/morning-yoppers
//
// Cron Vercel quotidien à 05:30 UTC = 07:30 Brussels (été). Modèle 23/07 :
//   1. SÉLECTION ÉDITORIALE : retient les deals du jour (inclus_morning=true,
//      actif, date_deal=today, plan Communiquer/Vendre → statut_morning='envoye')
//      et les actus GMY (inclus_gmy=true, actif, fenêtre en cours →
//      push_envoye_at). Ce contenu retenu EST l'édition du jour : l'écran
//      /commander/morning n'affiche que lui. Deadline de facto : ce qui existe
//      au passage du cron (règle commerçant : avant 23 h la veille).
//   2. PUSH AUX FAVORIS : un seul push OneSignal, envoyé uniquement aux Yoppers
//      qui ont au moins un des commerçants de l'édition en favori.
//
// Le push renvoie vers /commander/morning côté client.
//
// Décisions Alex 15/06 + 01/07 :
//   - GMY = push global géré par Yoppaa, pas par le commerçant
//   - Exister apparaît via GMY (1 actu/semaine calendaire lundi-dim max)
//   - Communiquer + Vendre : deals illimités visibles dans GMY
//
// Sécurité : Bearer CRON_SECRET (même pattern que billing-relances).
// Fallback OneSignal non configuré : le wrapper lib/onesignal.js renvoie un
// warning sans crasher. Les deals restent 'pending' pour envoi le lendemain.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerPushParExternalIds } from '@/lib/onesignal'
import { canDo, resolvePlan } from '@/lib/plans'

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
    console.warn('[cron/morning-yoppers] CRON_SECRET non configurée, endpoint NON protégé')
    return true
  }
  const authHeader = req.headers.get('authorization') || ''
  return authHeader === `Bearer ${cronSecret}`
}

async function handle(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  // 1. Deals du jour pending
  const { data: dealsPending, error: dealsErr } = await supabase
    .from('yoppaa_deals')
    .select(`
      id, titre, commercant_id,
      commercant:commercants (id, nom, adresse, plan, statut_publication)
    `)
    .eq('actif', true)
    .eq('inclus_morning', true)
    .eq('date_deal', today)
    .eq('statut_morning', 'pending')

  if (dealsErr) {
    console.error('[cron/morning-yoppers] fetch deals échoué', dealsErr)
    return NextResponse.json({ error: dealsErr.message }, { status: 500 })
  }

  // 2. Actus GMY actives dans la fenêtre du jour
  const { data: actusGmy, error: actusErr } = await supabase
    .from('actualites')
    .select(`
      id, titre, commercant_id,
      commercant:commercants (id, nom, adresse, plan, statut_publication)
    `)
    .not('commercant_id', 'is', null)
    .eq('actif', true)
    .eq('inclus_gmy', true)
    .lte('date_debut', today)
    .gte('date_fin', today)
    .is('push_envoye_at', null)

  if (actusErr) {
    console.error('[cron/morning-yoppers] fetch actus échoué', actusErr)
    return NextResponse.json({ error: actusErr.message }, { status: 500 })
  }

  // 3. Filtrage éligibilité (modèle 23/07 : le GMY est UNE édition, pas une par
  //    zone). Le contenu retenu ici EST l'édition du jour ; l'écran client ne
  //    montre que ce contenu (statut_morning='envoye' / push_envoye_at).
  const dealIds = []
  const actuIds = []
  const commercantIds = new Set()

  for (const d of dealsPending || []) {
    const c = d.commercant
    if (!c || c.statut_publication !== 'publie') continue
    // Deals réservés à Communiquer + Vendre (gating canDo)
    if (!canDo(c.plan, 'deals')) continue
    if (!canDo(c.plan, 'morning')) continue
    dealIds.push(d.id)
    commercantIds.add(c.id)
  }

  for (const a of actusGmy || []) {
    const c = a.commercant
    if (!c || c.statut_publication !== 'publie') continue
    // Actus GMY autorisées à tous les plans commerçant (Exister limité à
    // 1/semaine mais c'est déjà validé côté saveActu, pas ici)
    if (!canDo(c.plan, 'actu_gmy')) continue
    actuIds.push(a.id)
    commercantIds.add(c.id)
  }

  if (dealIds.length === 0 && actuIds.length === 0) {
    return NextResponse.json({
      status: 'ok',
      date: today,
      stats: { deals: 0, actus: 0, favoris_cibles: 0, push_sent: 0, push_failed: 0 },
      note: 'aucun deal ni actu éligible aujourd\'hui',
    })
  }

  const stats = { deals: 0, actus: 0, favoris_cibles: 0, push_sent: 0, push_failed: 0, errors: [] }

  // 4. Sélection éditoriale : on marque le contenu comme retenu pour l'édition
  //    du jour AVANT le push (l'édition doit être correcte même si OneSignal
  //    est indisponible ou qu'aucun favori n'existe encore).
  if (dealIds.length > 0) {
    const { error: upDealsErr } = await supabase
      .from('yoppaa_deals')
      .update({ statut_morning: 'envoye' })
      .in('id', dealIds)
    if (upDealsErr) {
      console.error('[cron/morning-yoppers] update deals statut échoué', upDealsErr)
      stats.errors.push({ step: 'deals_update', error: upDealsErr.message })
    } else {
      stats.deals = dealIds.length
    }
  }
  if (actuIds.length > 0) {
    const { error: upActusErr } = await supabase
      .from('actualites')
      .update({ push_envoye_at: new Date().toISOString() })
      .in('id', actuIds)
    if (upActusErr) {
      console.error('[cron/morning-yoppers] update actus push_envoye_at échoué', upActusErr)
      stats.errors.push({ step: 'actus_update', error: upActusErr.message })
    } else {
      stats.actus = actuIds.length
    }
  }

  // 5. Push aux FAVORIS (décision Alex 23/07) : le push GMY part uniquement aux
  //    Yoppers qui ont AU MOINS UN des commerçants de l'édition en favori.
  //    Un seul push par Yopper (dédupliqué), ciblage par external_id.
  const { data: favorisRows } = await supabase
    .from('favoris')
    .select('client_id')
    .in('commercant_id', [...commercantIds])
  const clientIds = [...new Set((favorisRows || []).map(f => f.client_id).filter(Boolean))]
  stats.favoris_cibles = clientIds.length

  if (clientIds.length > 0) {
    const parts = []
    if (dealIds.length > 0) parts.push(`${dealIds.length} deal${dealIds.length > 1 ? 's' : ''}`)
    if (actuIds.length > 0) parts.push(`${actuIds.length} actu${actuIds.length > 1 ? 's' : ''}`)
    const contents = `${parts.join(' · ')} de tes commerces favoris t'attendent ☀️`

    const res = await envoyerPushParExternalIds(clientIds, {
      headings: 'Good Morning Yoppers',
      contents,
      url: '/commander/morning',
      data: { kind: 'gmy', date: today },
      high_priority: false,
    })
    if (res.ok) {
      stats.push_sent = 1
    } else {
      stats.push_failed = 1
      stats.errors.push({ step: 'push', error: res.error })
    }
  }

  return NextResponse.json({
    status: 'ok',
    date: today,
    stats,
  })
}

export async function GET(req) { return handle(req) }
export async function POST(req) { return handle(req) }
