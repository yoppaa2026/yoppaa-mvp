// POST /api/deals/notify-favoris
//
// Envoie une notification push OneSignal aux Yoppers qui ont favori le
// commerçant, à la publication (création) d'un deal. Appelée en fire-and-forget
// depuis le dashboard TabDeals côté commerçant.
//
// V1 pragmatique : pas d'anti-doublon serveur. Le côté client (TabDeals) ne
// declenche l'appel QU'à la création (editId === null), pas à l'édition, pour
// éviter le spam favoris à chaque modification du deal.
//
// Body attendu : { deal_id: UUID }
//
// Gating : le push n'est envoyé que si :
//   - le deal existe et est actif
//   - le commerçant est publié
//   - le plan permet les deals (Communiquer ou Vendre uniquement)

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

export async function POST(req) {
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body JSON requis' }, { status: 400 }) }
  const { deal_id } = body || {}
  if (!deal_id || typeof deal_id !== 'string') {
    return NextResponse.json({ error: 'deal_id requis' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: deal, error: dealErr } = await supabase
    .from('yoppaa_deals')
    .select(`
      id, titre, prix_deal, prix_original, actif, est_bonne_affaire,
      commercant:commercants(id, nom, slug, plan, statut_publication)
    `)
    .eq('id', deal_id)
    .single()

  if (dealErr || !deal) {
    return NextResponse.json({ error: 'deal introuvable' }, { status: 404 })
  }

  if (!deal.actif) {
    return NextResponse.json({ status: 'skipped', reason: 'deal_inactif' })
  }

  const c = deal.commercant
  if (!c || c.statut_publication !== 'publie') {
    return NextResponse.json({ status: 'skipped', reason: 'commercant_non_publie' })
  }
  if (!canDo(c.plan, 'deals')) {
    return NextResponse.json({ status: 'skipped', reason: 'plan_sans_deals' })
  }

  // Message push : distingue bonne affaire (accroche forte) vs deal classique
  const prixStr = deal.prix_deal ? ` · ${Number(deal.prix_deal).toFixed(2).replace('.', ',')}€` : ''
  const headings = deal.est_bonne_affaire ? 'Bonne affaire' : 'Nouveau deal'
  const contents = `${c.nom} : ${deal.titre}${prixStr}`

  // Route de destination : fiche commerçant. Le tri vitrine/RDV se fait
  // côté [slug]/page.js (vitrine = redirect vers /commander/rdv/[slug])
  const url = `/commander/${c.slug}`

  // Ciblage DB-driven : on lit qui a favori ce commerçant, puis on pousse par
  // external_id (= clients.id). Robuste au multi-appareils, immunisé au 409 des
  // tags OneSignal (voir envoyerPushParExternalIds).
  const { data: favs } = await supabase
    .from('favoris').select('client_id').eq('commercant_id', c.id)
  const clientIds = (favs || []).map(f => f.client_id).filter(Boolean)

  const res = await envoyerPushParExternalIds(clientIds, {
    headings,
    contents,
    url,
    data: { kind: 'deal_publish', deal_id: deal.id, commercant_id: c.id },
    high_priority: !!deal.est_bonne_affaire,
  })

  return NextResponse.json({
    status: res.ok ? 'ok' : 'push_failed',
    favoris: clientIds.length,
    recipients: res.recipients,
    error: res.error,
  })
}
