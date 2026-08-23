// POST /api/fidelite/comptoir
//
// Pointage comptoir (dashboard commerçant) : à partir d'un numéro de
// téléphone, retourne la carte de fidélité existante ET/OU le client Yoppaa
// déjà inscrit avec ce numéro. Sans ça, le comptoir créait une carte
// orpheline alors que le client existait déjà (bug Alex 01/08).
//
// Deux actions :
//   { action: 'chercher', commercant_id, telephone }
//   { action: 'creer',    commercant_id, telephone }  → carte rattachée au
//                                                       client si on le trouve
//
// Auth : Bearer token du commerçant + vérification qu'il possède bien le
// commerce. La lecture de `clients` passe par une RPC SECURITY DEFINER qui
// ne renvoie que prénom et nom (RLS clients fermée depuis l'audit 13/07).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normaliserTelephone } from '@/lib/fidelite'
import { smsCarteCreee } from '@/lib/fidelite-sms'

export async function POST(request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const { action, commercant_id, telephone } = await request.json()
    const tel = normaliserTelephone(telephone)
    if (!commercant_id || !tel) {
      return NextResponse.json({ ok: false, error: 'Numéro invalide (ex : 0470 12 34 56)' }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // Le commerce appartient-il bien à l'utilisateur connecté ? (l'admin
    // Yoppaa en impersonation passe par son propre compte, donc même règle)
    const { data: com } = await admin
      .from('commercants')
      .select('id, nom, auth_user_id, fidelite_actif, fidelite_sms_actif, fidelite_sms_credits')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!com) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (com.auth_user_id !== user.id && user.email !== 'verstappenalexandre@gmail.com') {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // Client Yoppaa déjà inscrit avec ce numéro (comparaison chiffre à chiffre
    // via la RPC : les formats 0472..., +32472... et 0472 63 43 25 matchent).
    let client = null
    const { data: clients, error: errRpc } = await admin.rpc('chercher_client_par_telephone', { p_tel: tel })
    if (errRpc) console.error('[fidelite/comptoir] RPC client KO', errRpc.message)
    else if (Array.isArray(clients) && clients[0]) client = clients[0]

    const { data: carte } = await admin
      .from('fidelite_cartes')
      .select('*')
      .eq('commercant_id', commercant_id)
      .eq('telephone', tel)
      .maybeSingle()

    if (action === 'chercher') {
      // Carte existante : on la complète si on vient d'identifier le client
      if (carte && client && !carte.client_id) {
        await admin.from('fidelite_cartes').update({ client_id: client.id }).eq('id', carte.id)
        carte.client_id = client.id
      }
      return NextResponse.json({ ok: true, telephone: tel, carte: carte || null, client })
    }

    if (action === 'creer') {
      if (carte) return NextResponse.json({ ok: true, telephone: tel, carte, client, deja: true })
      const { data: nouvelle, error } = await admin
        .from('fidelite_cartes')
        .insert({ commercant_id, telephone: tel, client_id: client?.id || null })
        .select()
        .single()
      if (error) {
        // 23505 : une carte vient d'être créée en parallèle, on la relit
        if (error.code === '23505') {
          const { data: existante } = await admin.from('fidelite_cartes').select('*')
            .eq('commercant_id', commercant_id).eq('telephone', tel).maybeSingle()
          return NextResponse.json({ ok: true, telephone: tel, carte: existante, client, deja: true })
        }
        console.error('[fidelite/comptoir] insert carte KO', error)
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      }
      // SMS de bienvenue avec le lien de sa carte : sans lui, le client
      // repart du comptoir sans trace de sa carte. Best-effort.
      let sms = null
      // ⚠️ `client?.id` EST INDISPENSABLE ICI (24/08). Sans lui, le SMS partait
      // même à quelqu'un qui a l'application : le comptoir n'a pas d'email, et
      // la garde « a déjà un compte » ne pouvait donc vérifier personne. Le
      // client venait pourtant d'être identifié dix lignes plus haut.
      try { sms = await smsCarteCreee(admin, com, nouvelle, null, client?.id || null) } catch { /* non bloquant */ }
      return NextResponse.json({ ok: true, telephone: tel, carte: nouvelle, client, sms })
    }

    return NextResponse.json({ ok: false, error: 'action inconnue' }, { status: 400 })
  } catch (e) {
    console.error('[fidelite/comptoir]', e)
    return NextResponse.json({ ok: false, error: 'Erreur, réessaie.' }, { status: 500 })
  }
}
