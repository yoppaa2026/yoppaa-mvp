// Signaux envoyés par les habitants : signalement d'un problème, suggestion
// d'un commerce absent, envie d'une fonctionnalité chez un commerçant.
//
// POURQUOI CETTE ROUTE. Les trois tables acceptaient l'insertion libre depuis
// le navigateur. Sans compte, aucune policy SQL ne peut distinguer un habitant
// d'un robot : la seule protection possible est côté serveur, avec une
// limitation de débit et une validation du contenu.
//
// POST { type: 'signalement' | 'suggestion' | 'envie', ...champs }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { lireIdentiteYopper } from '@/lib/yopper-session'
import { globalLimiter, checkLimit, clientIp } from '@/lib/ratelimit'
import { envieConnue } from '@/lib/signaux'

const TYPES = ['signalement', 'suggestion', 'envie']

function texte(v, max) {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

export async function POST(request) {
  try {
    // Limitation par adresse : ces formulaires sont ouverts aux visiteurs sans
    // compte, ils sont donc la porte d'entrée naturelle du spam.
    const limite = await checkLimit(globalLimiter, clientIp(request))
    if (!limite.success) {
      return NextResponse.json({ ok: false, error: 'Trop de requêtes, réessaie dans un instant.' }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const { type } = body
    if (!TYPES.includes(type)) {
      return NextResponse.json({ ok: false, error: 'type invalide' }, { status: 400 })
    }

    const identite = await lireIdentiteYopper()
    const clientId = identite?.client_id || null

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    if (type === 'signalement') {
      if (!body.commercant_id && !body.service_id) {
        return NextResponse.json({ ok: false, error: 'cible manquante' }, { status: 400 })
      }
      const { error } = await supabase.from('signalements').insert({
        type: texte(body.motif, 60) || 'autre',
        description: texte(body.description, 1000),
        yopper_id: clientId,
        commercant_id: body.commercant_id || null,
        service_id: body.service_id || null,
      })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (type === 'suggestion') {
      const nom = texte(body.nom_commerce, 120)
      if (!nom) return NextResponse.json({ ok: false, error: 'nom du commerce requis' }, { status: 400 })
      const { error } = await supabase.from('suggestions_commercants').insert({
        client_id: clientId,
        nom_commerce: nom,
        adresse: texte(body.adresse, 200),
        type_commerce: texte(body.type_commerce, 80),
        commentaire: texte(body.commentaire, 500),
      })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // type === 'envie' : demande d'activation d'une fonctionnalité.
    // Anti-spam métier : une seule envie par personne, par commerce et par
    // type sur sept jours. C'était fait dans le navigateur, donc contournable.
    const feature = texte(body.feature, 40)
    if (!body.commercant_id || !feature) {
      return NextResponse.json({ ok: false, error: 'paramètres manquants' }, { status: 400 })
    }
    // ⚠️ LISTE BLANCHE, posée le 26/08. Cette route acceptait N'IMPORTE QUELLE
    // chaîne de 40 caractères comme type de signal : un appelant pouvait donc
    // inventer autant de catégories qu'il voulait dans `upgrade_requests`, et
    // le commerçant lisait des statistiques polluées pour décider s'il change
    // de formule. La liste vit dans `lib/signaux.js`, avec les libellés qu'elle
    // sert : une seule source, jamais deux.
    if (!envieConnue(feature)) {
      return NextResponse.json({ ok: false, error: 'envie inconnue' }, { status: 400 })
    }
    if (clientId) {
      const ilYa7Jours = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const { data: deja } = await supabase
        .from('upgrade_requests')
        .select('id')
        .eq('client_id', clientId)
        .eq('commercant_id', body.commercant_id)
        .eq('type', feature)
        .gte('created_at', ilYa7Jours)
        .maybeSingle()
      if (deja) return NextResponse.json({ ok: true, deja: true })
    }
    const { error } = await supabase.from('upgrade_requests').insert({
      client_id: clientId,
      commercant_id: body.commercant_id,
      type: feature,
    })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[signaux]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
