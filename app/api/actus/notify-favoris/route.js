// POST /api/actus/notify-favoris
//
// Envoie une notification push OneSignal aux Yoppers qui ont favori le
// commerçant, à la publication (création) d'une actualité. Appelée en
// fire-and-forget depuis le dashboard TabActus côté commerçant.
//
// V1 pragmatique : pas d'anti-doublon serveur. Le côté client (TabActus) ne
// declenche l'appel QU'à la création (editId === null), pas à l'édition, pour
// éviter le spam favoris à chaque modification.
//
// Body attendu : { actu_id: UUID }
//
// Gating : le push n'est envoyé que si :
//   - l'actu existe et est active
//   - le commerçant est publié
//   - le plan permet les actus visibles côté client :
//     * Exister uniquement si actu.inclus_gmy=true (portail Good Morning)
//     * Communiquer + Vendre : toujours (actus_illimitees)
//
// Priorité push :
//   - type=alerte  → priorité MAX (10) + heading "Alerte" + heading en majuscule
//                    (l'utilisateur doit être notifié immédiatement)
//   - type=actu    → priorité normale (5) + heading standard

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
  const { actu_id } = body || {}
  if (!actu_id || typeof actu_id !== 'string') {
    return NextResponse.json({ error: 'actu_id requis' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: actu, error: actuErr } = await supabase
    .from('actualites')
    .select(`
      id, titre, contenu, type, actif, inclus_gmy,
      commercant:commercants(id, nom, slug, plan, statut_publication)
    `)
    .eq('id', actu_id)
    .single()

  if (actuErr || !actu) {
    return NextResponse.json({ error: 'actu introuvable' }, { status: 404 })
  }

  if (!actu.actif) {
    return NextResponse.json({ status: 'skipped', reason: 'actu_inactive' })
  }

  const c = actu.commercant
  if (!c || c.statut_publication !== 'publie') {
    return NextResponse.json({ status: 'skipped', reason: 'commercant_non_publie' })
  }

  // Gating par plan : Communiquer/Vendre peuvent envoyer librement.
  // Exister peut envoyer UNIQUEMENT si inclus_gmy=true (portail GMY 1/semaine).
  const peutActusIllimitees = canDo(c.plan, 'actus_illimitees')
  const peutActuGmy = canDo(c.plan, 'actu_gmy') && actu.inclus_gmy
  if (!peutActusIllimitees && !peutActuGmy) {
    return NextResponse.json({ status: 'skipped', reason: 'plan_sans_push' })
  }

  const isAlerte = actu.type === 'alerte'
  const headings = isAlerte ? 'Alerte' : 'Nouvelle actu'
  const teaser = actu.contenu ? ` — ${actu.contenu}` : ''
  const contents = `${c.nom} : ${actu.titre}${teaser}`

  // Ciblage DB-driven (table favoris → external_id), robuste multi-appareils.
  const { data: favs } = await supabase
    .from('favoris').select('client_id').eq('commercant_id', c.id)
  const clientIds = (favs || []).map(f => f.client_id).filter(Boolean)

  const res = await envoyerPushParExternalIds(clientIds, {
    headings,
    contents,
    url: `/commander/${c.slug}`,
    data: { kind: 'actu_publish', actu_id: actu.id, commercant_id: c.id, type: actu.type },
    high_priority: isAlerte,
  })

  return NextResponse.json({
    status: res.ok ? 'ok' : 'push_failed',
    priority: isAlerte ? 'high' : 'normal',
    favoris: clientIds.length,
    recipients: res.recipients,
    error: res.error,
  })
}
