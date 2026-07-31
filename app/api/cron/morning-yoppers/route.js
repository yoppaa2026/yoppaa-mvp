// GET / POST /api/cron/morning-yoppers
//
// Cron Vercel quotidien à 05:30 UTC = 07:30 Brussels (été). Modèle 23/07 :
//   1. SÉLECTION ÉDITORIALE : retient les deals du jour (inclus_morning=true,
//      actif, date_deal=today, plan Communiquer/Vendre → statut_morning='envoye')
//      et les actus GMY (inclus_gmy=true, actif, fenêtre en cours →
//      push_envoye_at). Ce contenu retenu EST l'édition du jour : l'écran
//      /commander/morning n'affiche que lui. Deadline de facto : ce qui existe
//      au passage du cron (règle commerçant : avant 23 h la veille).
//   2. PUSH PAR COMMUNE : un push OneSignal par commune ayant du contenu,
//      envoyé à TOUS les Yoppers de la commune (l'ensemble de ses codes
//      postaux, ex. Mettet = 5640 Mettet + Biesme + …). Décision Alex 23/07.
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
import { canDo } from '@/lib/plans'

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

  // 3. Communes actives = les zones GMY. Une édition/push par commune ayant du
  //    contenu ; la zone = L'ENSEMBLE des codes postaux de la commune.
  const { data: communesActives } = await supabase
    .from('communes')
    .select('id, nom, codes_postaux')
    .eq('active', true)
  const communes = (communesActives || []).filter(c => Array.isArray(c.codes_postaux) && c.codes_postaux.length > 0)
  const communeDuCp = (cp) => (cp ? communes.find(c => c.codes_postaux.includes(cp)) || null : null)

  // 4. Filtrage éligibilité + regroupement PAR COMMUNE. Le contenu retenu ici
  //    EST l'édition du jour ; l'écran client ne montre que ce contenu
  //    (statut_morning='envoye' / push_envoye_at).
  const parCommune = new Map() // communeId → { commune, dealIds, actuIds, commercantIds }
  const tousDealIds = []
  const tousActuIds = []

  function ajouter(commune, type, id, commercantId) {
    if (!parCommune.has(commune.id)) {
      parCommune.set(commune.id, { commune, dealIds: [], actuIds: [], commercantIds: new Set() })
    }
    const z = parCommune.get(commune.id)
    z[type].push(id)
    z.commercantIds.add(commercantId)
  }

  for (const d of dealsPending || []) {
    const c = d.commercant
    if (!c || c.statut_publication !== 'publie') continue
    // Deals réservés à Communiquer + Vendre (gating canDo)
    if (!canDo(c.plan, 'deals')) continue
    if (!canDo(c.plan, 'morning')) continue
    const commune = communeDuCp(extraireCodePostal(c.adresse))
    if (!commune) continue
    ajouter(commune, 'dealIds', d.id, c.id)
    tousDealIds.push(d.id)
  }

  for (const a of actusGmy || []) {
    const c = a.commercant
    if (!c || c.statut_publication !== 'publie') continue
    // Actus GMY autorisées à tous les plans commerçant (Exister limité à
    // 1/semaine mais c'est déjà validé côté saveActu, pas ici)
    if (!canDo(c.plan, 'actu_gmy')) continue
    const commune = communeDuCp(extraireCodePostal(c.adresse))
    if (!commune) continue
    ajouter(commune, 'actuIds', a.id, c.id)
    tousActuIds.push(a.id)
  }

  if (tousDealIds.length === 0 && tousActuIds.length === 0) {
    return NextResponse.json({
      status: 'ok',
      date: today,
      stats: { communes: 0, deals: 0, actus: 0, push_sent: 0, push_failed: 0 },
      note: 'aucun deal ni actu éligible aujourd\'hui',
    })
  }

  const stats = { communes: 0, deals: 0, actus: 0, push_sent: 0, push_failed: 0, communes_sans_yoppers: 0, errors: [] }

  // 5. Sélection éditoriale : on marque le contenu comme retenu pour l'édition
  //    du jour AVANT les pushs (l'édition doit être correcte même si OneSignal
  //    est indisponible ou qu'une commune n'a pas encore de Yoppers).
  if (tousDealIds.length > 0) {
    const { error: upDealsErr } = await supabase
      .from('yoppaa_deals')
      .update({ statut_morning: 'envoye' })
      .in('id', tousDealIds)
    if (upDealsErr) {
      console.error('[cron/morning-yoppers] update deals statut échoué', upDealsErr)
      stats.errors.push({ step: 'deals_update', error: upDealsErr.message })
    } else {
      stats.deals = tousDealIds.length
    }
  }
  if (tousActuIds.length > 0) {
    const { error: upActusErr } = await supabase
      .from('actualites')
      .update({ push_envoye_at: new Date().toISOString() })
      .in('id', tousActuIds)
    if (upActusErr) {
      console.error('[cron/morning-yoppers] update actus push_envoye_at échoué', upActusErr)
      stats.errors.push({ step: 'actus_update', error: upActusErr.message })
    } else {
      stats.actus = tousActuIds.length
    }
  }

  // 6. Un push PAR COMMUNE, envoyé à TOUS les Yoppers de la commune (tous ses
  //    codes postaux confondus), ciblage par external_id.
  for (const { commune, dealIds, actuIds, commercantIds } of parCommune.values()) {
    stats.communes++

    const { data: clientsZone } = await supabase
      .from('clients')
      .select('id')
      .in('code_postal', commune.codes_postaux)
    const clientIds = [...new Set((clientsZone || []).map(cl => cl.id).filter(Boolean))]

    if (clientIds.length === 0) {
      stats.communes_sans_yoppers++
      continue
    }

    const parts = []
    if (dealIds.length > 0) parts.push(`${dealIds.length} deal${dealIds.length > 1 ? 's' : ''}`)
    if (actuIds.length > 0) parts.push(`${actuIds.length} actu${actuIds.length > 1 ? 's' : ''}`)
    const contents = `${parts.join(' · ')} près de chez toi (${commercantIds.size} commerce${commercantIds.size > 1 ? 's' : ''}) ☀️`

    const res = await envoyerPushParExternalIds(clientIds, {
      headings: 'Good Morning Yoppers',
      contents,
      url: '/commander/morning',
      data: { kind: 'gmy', commune: commune.nom, date: today },
      high_priority: false,
    })
    if (res.ok) {
      stats.push_sent++
    } else {
      stats.push_failed++
      stats.errors.push({ commune: commune.nom, error: res.error })
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
