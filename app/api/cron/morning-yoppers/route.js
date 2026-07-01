// GET / POST /api/cron/morning-yoppers
//
// Cron Vercel quotidien à 05:30 UTC = 07:30 Brussels (été) qui envoie 1 push
// OneSignal par code postal aux Yoppers, référençant :
//   • les deals du jour (inclus_morning=true, actif, date_deal=today, plan
//     Communiquer/Vendre) → passe statut_morning à 'envoye'
//   • les actus GMY (inclus_gmy=true, actif, dans fenêtre date_debut/date_fin) →
//     marque push_envoye_at
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
import { envoyerPushParCodePostal } from '@/lib/onesignal'
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

// Codes postaux belges : 4 chiffres. Extrait depuis l'adresse libre du commerçant.
function extraireCodePostal(adresse) {
  if (!adresse) return null
  const m = String(adresse).match(/\b(\d{4})\b/)
  return m ? m[1] : null
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

  // 3. Filtrage éligibilité + regroupement par code postal
  const dealsParZone = new Map()  // cp → [dealIds]
  const actusParZone = new Map()  // cp → [actuIds]
  const commercantsParZone = new Map()  // cp → Set(commercantId) pour dédupliquer

  function ajouterZone(zoneMap, cp, id, commercantId) {
    if (!zoneMap.has(cp)) zoneMap.set(cp, [])
    zoneMap.get(cp).push(id)
    if (!commercantsParZone.has(cp)) commercantsParZone.set(cp, new Set())
    commercantsParZone.get(cp).add(commercantId)
  }

  for (const d of dealsPending || []) {
    const c = d.commercant
    if (!c || c.statut_publication !== 'publie') continue
    // Deals réservés à Communiquer + Vendre (gating canDo)
    if (!canDo(c.plan, 'deals')) continue
    if (!canDo(c.plan, 'morning')) continue
    const cp = extraireCodePostal(c.adresse)
    if (!cp) continue
    ajouterZone(dealsParZone, cp, d.id, c.id)
  }

  for (const a of actusGmy || []) {
    const c = a.commercant
    if (!c || c.statut_publication !== 'publie') continue
    // Actus GMY autorisées à tous les plans commerçant (Exister limité à
    // 1/semaine mais c'est déjà validé côté saveActu, pas ici)
    if (!canDo(c.plan, 'actu_gmy')) continue
    const cp = extraireCodePostal(c.adresse)
    if (!cp) continue
    ajouterZone(actusParZone, cp, a.id, c.id)
  }

  const zones = new Set([...dealsParZone.keys(), ...actusParZone.keys()])

  if (zones.size === 0) {
    return NextResponse.json({
      status: 'ok',
      date: today,
      stats: { zones: 0, deals: 0, actus: 0, push_sent: 0, push_failed: 0 },
      note: 'aucun deal ni actu éligible aujourd\'hui',
    })
  }

  const stats = { zones: 0, deals: 0, actus: 0, push_sent: 0, push_failed: 0, errors: [] }

  for (const cp of zones) {
    const dealIds = dealsParZone.get(cp) || []
    const actuIds = actusParZone.get(cp) || []
    const nbCommercants = commercantsParZone.get(cp)?.size || 0

    const parts = []
    if (dealIds.length > 0) parts.push(`${dealIds.length} deal${dealIds.length > 1 ? 's' : ''}`)
    if (actuIds.length > 0) parts.push(`${actuIds.length} actu${actuIds.length > 1 ? 's' : ''}`)
    const contents = `${parts.join(' · ')} près de chez toi (${nbCommercants} commerce${nbCommercants > 1 ? 's' : ''})`

    const res = await envoyerPushParCodePostal(cp, {
      headings: 'Good Morning Yoppers',
      contents,
      url: '/commander/morning',
      data: { kind: 'gmy', cp, date: today },
      high_priority: false,
    })

    stats.zones++

    if (!res.ok) {
      stats.push_failed++
      stats.errors.push({ cp, error: res.error })
      // On ne marque PAS les deals/actus comme envoyés si le push a échoué :
      // ils repartiront le lendemain (safety net si OneSignal down).
      continue
    }

    stats.push_sent++

    // Marquer les deals comme envoyés
    if (dealIds.length > 0) {
      const { error: upDealsErr } = await supabase
        .from('yoppaa_deals')
        .update({ statut_morning: 'envoye' })
        .in('id', dealIds)
      if (upDealsErr) {
        console.error('[cron/morning-yoppers] update deals statut échoué', { cp, upDealsErr })
      } else {
        stats.deals += dealIds.length
      }
    }

    // Marquer les actus avec push_envoye_at
    if (actuIds.length > 0) {
      const { error: upActusErr } = await supabase
        .from('actualites')
        .update({ push_envoye_at: new Date().toISOString() })
        .in('id', actuIds)
      if (upActusErr) {
        console.error('[cron/morning-yoppers] update actus push_envoye_at échoué', { cp, upActusErr })
      } else {
        stats.actus += actuIds.length
      }
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
