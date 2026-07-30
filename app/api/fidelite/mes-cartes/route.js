// POST /api/fidelite/mes-cartes
//
// Cartes de fidélité du Yopper connecté. LE GSM = LA CARTE : le rattachement
// se fait par les numéros de téléphone que le Yopper a UTILISÉS dans ses
// commandes (et celui de sa fiche client), jamais par saisie libre d'un
// numéro (sinon n'importe qui pourrait espionner les cartes d'autrui).
//
// Sécurité : identité depuis le cookie HTTP-only yoppaa_yopper (même pattern
// que /api/yopper/commandes), service_role côté serveur, la table
// fidelite_cartes n'étant pas lisible par anon.
//
// Body : { action, ...params }
//   - 'list' : {} → { cartes: [...] } toutes les cartes du Yopper
//   - 'une'  : { commercant_id } → { carte } la carte chez CE commerçant
//              (jauge de la fiche commerçant)

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { normaliserTelephone } from '@/lib/fidelite'

const COOKIE_NAME = 'yoppaa_yopper'
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

async function cookieYopper() {
  const raw = (await cookies()).get(COOKIE_NAME)?.value
  if (!raw) return null
  try {
    const identity = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    return identity?.email ? { email: String(identity.email).toLowerCase(), client_id: identity.client_id || null } : null
  } catch {
    return null
  }
}

// Numéros de téléphone prouvés du Yopper : ceux de ses commandes + sa fiche client
async function telephonesDuYopper(supabase, yopper) {
  const tels = new Set()
  const { data: cmds } = await supabase
    .from('commandes').select('client_telephone')
    .eq('client_email', yopper.email)
    .not('client_telephone', 'is', null)
    .limit(200)
  ;(cmds || []).forEach(c => {
    const t = normaliserTelephone(c.client_telephone)
    if (t) tels.add(t)
  })
  const { data: rdvs } = await supabase
    .from('rdv_reservations').select('client_telephone')
    .ilike('client_email', yopper.email)
    .not('client_telephone', 'is', null)
    .limit(200)
  ;(rdvs || []).forEach(r => {
    const t = normaliserTelephone(r.client_telephone)
    if (t) tels.add(t)
  })
  if (yopper.client_id && RE_UUID.test(String(yopper.client_id))) {
    const { data: cli } = await supabase.from('clients').select('telephone').eq('id', yopper.client_id).maybeSingle()
    const t = normaliserTelephone(cli?.telephone)
    if (t) tels.add(t)
  }
  return [...tels]
}

// Champs SÛRS exposés au Yopper (jamais le token d'une carte d'autrui : ici ce
// sont SES cartes, le token permet le lien de partage vers /carte/[token])
const CHAMPS_CARTE = 'id, commercant_id, telephone, passages, cagnotte, recompenses_disponibles, token, updated_at'
const CHAMPS_COMMERCANT = 'id, nom, slug, logo_url, categorie, type, fidelite_actif, fidelite_mecanique, fidelite_seuil_passages, fidelite_taux_cagnotte, fidelite_seuil_cagnotte, fidelite_recompense_type, fidelite_recompense_valeur, fidelite_recompense_libelle'

export async function POST(request) {
  try {
    const yopper = await cookieYopper()
    if (!yopper) return NextResponse.json({ ok: false, error: 'Non connecté' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const action = body?.action || 'list'
    const supabase = admin()

    const tels = await telephonesDuYopper(supabase, yopper)
    if (tels.length === 0) return NextResponse.json({ ok: true, cartes: [], carte: null })

    if (action === 'une') {
      const commercantId = body?.commercant_id
      if (!commercantId || !RE_UUID.test(String(commercantId))) {
        return NextResponse.json({ ok: false, error: 'commercant_id invalide' }, { status: 400 })
      }
      const { data: carte, error } = await supabase
        .from('fidelite_cartes')
        .select(`${CHAMPS_CARTE}, commercant:commercants(${CHAMPS_COMMERCANT})`)
        .eq('commercant_id', commercantId)
        .in('telephone', tels)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, carte: carte || null })
    }

    // list : toutes les cartes, chez des commerçants à la fidélité active
    const { data: cartes, error } = await supabase
      .from('fidelite_cartes')
      .select(`${CHAMPS_CARTE}, commercant:commercants(${CHAMPS_COMMERCANT})`)
      .in('telephone', tels)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (error) throw new Error(error.message)
    const actives = (cartes || []).filter(c => c.commercant?.fidelite_actif)
    return NextResponse.json({ ok: true, cartes: actives })
  } catch (e) {
    console.error('[fidelite/mes-cartes] KO', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
