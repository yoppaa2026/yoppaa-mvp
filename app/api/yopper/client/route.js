// POST /api/yopper/client
//
// Accès serveur (service_role) à la table `clients`, pour fermer la fuite RLS :
// avant, le navigateur lisait/écrivait `clients` en clé anon avec une policy
// SELECT USING(true) → n'importe qui pouvait dumper tous les Yoppers (PII).
// Désormais ces opérations passent ici et les policies SELECT ouvertes sont
// retirées (voir MIGRATION_RLS_CLIENTS.sql).
//
// Sécurité :
//   • get-or-create : par email (le Yopper le saisit au checkout = il le revendique).
//     Décision Alex 06/07 : on renvoie le pré-remplissage nom/tél pour cet email.
//     Résidu accepté (qui connaît un email exact voit nom/tél ; plus de dump bulk).
//   • get-own / update-own / set-commune : autorisés UNIQUEMENT via le cookie
//     Yopper (yoppaa_yopper, HTTP-only) → pas d'énumération par id.
//
// Body : { action, ...params }
//   - 'get-or-create' : { email, prenom?, nom?, telephone? } → { id, prenom, nom, telephone }
//   - 'get-own'       : {} (cookie) → { id, prenom, nom, telephone, commune_id, commune }
//   - 'update-own'    : { prenom?, nom?, telephone? } (cookie) → { ok }
//   - 'set-commune'   : { commune_id } (cookie) → { ok }

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const COOKIE_NAME = 'yoppaa_yopper'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// client_id du Yopper depuis le cookie HTTP-only (jamais depuis le body pour les
// opérations "own", afin d'éviter l'énumération par id).
async function cookieClientId() {
  const raw = (await cookies()).get(COOKIE_NAME)?.value
  if (!raw) return null
  try {
    const identity = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    return identity?.client_id || null
  } catch {
    return null
  }
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'body JSON requis' }, { status: 400 }) }
  const action = body?.action

  const supabase = admin()

  try {
    // ─── get-or-create (checkout, par email revendiqué) ────────────────────
    if (action === 'get-or-create') {
      const email = (body.email || '').trim().toLowerCase()
      if (!email) return NextResponse.json({ ok: false, error: 'email requis' }, { status: 400 })
      const prenom = body.prenom ?? null
      const nom = body.nom ?? null
      const telephone = body.telephone ?? null

      const { data: ex } = await supabase
        .from('clients').select('id, prenom, nom, telephone').eq('email', email).maybeSingle()

      if (!ex) {
        const { data: inserted, error: errIns } = await supabase
          .from('clients').insert({ email, prenom, nom, telephone }).select('id, prenom, nom, telephone').single()
        if (errIns || !inserted) {
          return NextResponse.json({ ok: false, error: errIns?.message || 'création échouée' }, { status: 500 })
        }
        return NextResponse.json({ ok: true, client: inserted })
      }

      // Existant : update uniquement si des champs non vides ont changé (comme
      // l'ancien getOuCreerClient). On ne renvoie jamais les autres colonnes.
      const patch = {}
      if (telephone && ex.telephone !== telephone) patch.telephone = telephone
      if (prenom && ex.prenom !== prenom) patch.prenom = prenom
      if (nom && ex.nom !== nom) patch.nom = nom
      if (Object.keys(patch).length > 0) {
        await supabase.from('clients').update(patch).eq('id', ex.id)
      }
      return NextResponse.json({ ok: true, client: { ...ex, ...patch } })
    }

    // ─── opérations "own" : autorisées par le cookie uniquement ────────────
    const clientId = await cookieClientId()
    if (!clientId) return NextResponse.json({ ok: false, error: 'session_yopper_manquante' }, { status: 401 })

    if (action === 'get-own') {
      const { data } = await supabase
        .from('clients')
        .select('id, prenom, nom, telephone, commune_id, commune:communes(id, nom, codes_postaux, province)')
        .eq('id', clientId).maybeSingle()
      return NextResponse.json({ ok: true, client: data || null })
    }

    if (action === 'update-own') {
      const patch = {}
      if (body.prenom !== undefined) patch.prenom = body.prenom
      if (body.nom !== undefined) patch.nom = body.nom
      if (body.telephone !== undefined) patch.telephone = body.telephone
      if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })
      const { error } = await supabase.from('clients').update(patch).eq('id', clientId)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'set-commune') {
      const communeId = body.commune_id
      if (!communeId) return NextResponse.json({ ok: false, error: 'commune_id requis' }, { status: 400 })
      const { error } = await supabase.from('clients').update({ commune_id: communeId }).eq('id', clientId)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'action inconnue' }, { status: 400 })
  } catch (e) {
    console.error('[yopper/client] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
