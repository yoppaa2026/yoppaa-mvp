// GET  /api/dashboard/signaux   → les envies des habitants, en NOMBRES
// POST /api/dashboard/signaux   → réglages (seuil, pause) et marquage « vu »
//
// ⚠️ RGPD, contrainte structurante. Le commerçant ne doit JAMAIS savoir QUI a
// envoyé une envie. C'est la promesse faite sur la page d'accueil : « tu ne
// vois pas leurs coordonnées, mais tu leur parles par des notifications
// ciblées ». Cette route ne renvoie donc que des agrégats, lus dans la vue
// signaux_envies_stats, et ne touche jamais aux lignes de upgrade_requests.
//
// C'est aussi pour ça qu'elle existe : la table porte un client_id, donc elle
// ne doit pas être lisible depuis le navigateur du commerçant.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Le commerçant est-il bien propriétaire de cette fiche ? Sans cette
// vérification, n'importe qui lirait les signaux de n'importe quel commerce en
// changeant un identifiant dans l'URL.
//
// ⚠️ La colonne s'appelle `auth_user_id`, pas `user_id` : même schéma de
// vérification que l'export comptable, dont on ne s'écarte pas.
async function commercantDuProprietaire(supabase, request, commercantId) {
  const jeton = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!jeton || !commercantId) return null
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${jeton}` } } }
  )
  const { data: { user } = {} } = await authClient.auth.getUser()
  if (!user) return null
  const { data: c } = await supabase
    .from('commercants')
    .select('id, auth_user_id, plan, categorie, signaux_seuil_alerte, signaux_vus_le, signaux_email_actif, signaux_email_pause_jusqu')
    .eq('id', commercantId)
    .maybeSingle()
  if (!c || c.auth_user_id !== user.id) return null
  return c
}

export async function GET(request) {
  try {
    const commercantId = new URL(request.url).searchParams.get('commercant_id')
    const supabase = admin()
    const commercant = await commercantDuProprietaire(supabase, request, commercantId)
    if (!commercant) {
      return NextResponse.json({ ok: false, error: 'acces_refuse' }, { status: 403 })
    }

    const { data: stats, error } = await supabase
      .from('signaux_envies_stats')
      .select('type, total, trente_jours, sept_jours, soir_30j, weekend_30j, derniere')
      .eq('commercant_id', commercantId)
    if (error) throw error

    // « Nouveau depuis ta dernière visite » : un seul horodatage sur le
    // commerçant suffit, plutôt qu'un drapeau par ligne dans une table de
    // données personnelles.
    const vusLe = commercant.signaux_vus_le ? new Date(commercant.signaux_vus_le) : null
    const nouvelles = (stats || []).filter(s => vusLe === null || new Date(s.derniere) > vusLe).length

    return NextResponse.json({
      ok: true,
      envies: (stats || []).sort((a, b) => Number(b.trente_jours) - Number(a.trente_jours)),
      nouvelles,
      reglages: {
        seuil: commercant.signaux_seuil_alerte ?? 5,
        email_actif: commercant.signaux_email_actif !== false,
        pause_jusqu: commercant.signaux_email_pause_jusqu || null,
      },
    })
  } catch (e) {
    console.error('[dashboard/signaux] GET', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { commercant_id, action } = body
    const supabase = admin()
    const commercant = await commercantDuProprietaire(supabase, request, commercant_id)
    if (!commercant) {
      return NextResponse.json({ ok: false, error: 'acces_refuse' }, { status: 403 })
    }

    if (action === 'marquer-vu') {
      await supabase.from('commercants')
        .update({ signaux_vus_le: new Date().toISOString() })
        .eq('id', commercant_id)
      return NextResponse.json({ ok: true })
    }

    if (action === 'reglages') {
      const patch = {}
      if (body.seuil != null) {
        // Un seuil sous 3 ferait parler le bruit : une ou deux demandes ne sont
        // pas un argument, et un email faible abîme les suivants.
        const seuil = parseInt(body.seuil, 10)
        if (!Number.isFinite(seuil) || seuil < 0 || seuil > 100) {
          return NextResponse.json({ ok: false, error: 'Seuil invalide.' }, { status: 400 })
        }
        patch.signaux_seuil_alerte = seuil === 0 ? 0 : Math.max(3, seuil)
      }
      if (body.email_actif != null) patch.signaux_email_actif = !!body.email_actif
      if (body.pause_mois != null) {
        // Le droit de dire non, sans avoir à le redire chaque semaine.
        const mois = parseInt(body.pause_mois, 10)
        patch.signaux_email_pause_jusqu = mois > 0
          ? new Date(Date.now() + mois * 30 * 24 * 3600 * 1000).toISOString()
          : null
      }
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ ok: false, error: 'Rien à modifier.' }, { status: 400 })
      }
      const { error } = await supabase.from('commercants').update(patch).eq('id', commercant_id)
      if (error) throw error
      return NextResponse.json({ ok: true, reglages: patch })
    }

    return NextResponse.json({ ok: false, error: 'action inconnue' }, { status: 400 })
  } catch (e) {
    console.error('[dashboard/signaux] POST', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
