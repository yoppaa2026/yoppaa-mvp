// POST /api/admin/valider
// Body : { commercant_id }
// Auth : JWT user dans header Authorization (vérification email admin côté serveur)
//
// Effets en chaîne :
// 1) UPDATE commercants : statut='valide', statut_publication='publie', motif_rejet=null
// 2) UPDATE onboarding_commercants : statut='valide'
// 3) INSERT admin_validations (log)
// 4) Email Resend au commerçant : "Ta page est en ligne"

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailValidationCommercant, emailKitBienvenue } from '@/lib/resend'
import { avantLancement } from '@/lib/lancement'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

// Slugify : normalise un nom en slug URL-safe (sans accents, lowercase, tirets).
function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Génère un slug unique en DB (suffixe -2, -3, etc. si déjà pris).
async function genererSlugUnique(supabase, nom, excludeId) {
  const base = slugify(nom) || 'commerce'
  let slug = base
  let i = 1
  while (i < 50) {
    const { data } = await supabase.from('commercants').select('id').eq('slug', slug).maybeSingle()
    if (!data || data.id === excludeId) return slug
    i++
    slug = `${base}-${i}`
  }
  return `${base}-${Date.now()}`  // fallback ultime
}

export async function POST(request) {
  try {
    const { commercant_id } = await request.json()
    if (!commercant_id) {
      return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    }

    // Auth : crée un client Supabase qui passe le token de l'utilisateur appelant
    const authHeader = request.headers.get('authorization') || ''
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })
    }
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // Fetch préalable : on a besoin du nom pour générer un slug si manquant
    const { data: existant } = await supabase
      .from('commercants')
      .select('id, nom, slug')
      .eq('id', commercant_id)
      .single()
    if (!existant) {
      return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    }

    // Si pas de slug, on en génère un automatique unique (basé sur le nom)
    const updates = {
      statut: 'valide',
      statut_publication: 'publie',
      motif_rejet: null,
    }
    if (!existant.slug) {
      updates.slug = await genererSlugUnique(supabase, existant.nom, existant.id)
    }

    // 1) Update commerçant (slug inclus si nouvellement généré)
    const { data: commercant, error: errC } = await supabase
      .from('commercants')
      .update(updates)
      .eq('id', commercant_id)
      .select('id, nom, email, slug')
      .single()
    if (errC || !commercant) {
      return NextResponse.json({ ok: false, error: `update commerçant échoué : ${errC?.message}` }, { status: 500 })
    }

    // 2) Update onboarding (peut ne pas exister → on log mais on continue)
    const { error: errOb } = await supabase
      .from('onboarding_commercants')
      .update({ statut: 'valide' })
      .eq('commercant_id', commercant_id)
    if (errOb) console.warn('[admin/valider] onboarding update warn', errOb.message)

    // 3) Log de l'action
    await supabase.from('admin_validations').insert({
      commercant_id,
      action: 'valide',
      motif: null,
      validated_by_email: user.email,
    })

    // 4) Email au commerçant (non bloquant)
    //
    // ⚠️ CES DEUX ENVOIS ARRIVENT À LA SECONDE PRÈS dans la même boîte. Ils
    // doivent donc porter des objets DIFFÉRENTS et raconter la même histoire :
    // le premier ouvre la porte, le second donne les outils. La phase de
    // lancement leur est passée à TOUS LES DEUX, sinon l'un annonce une
    // ouverture à venir pendant que l'autre la déclare déjà faite.
    const phaseAvantLancement = avantLancement()
    let emailResult = { ok: false, error: 'pas d\'email destinataire' }
    if (commercant.email) {
      emailResult = await envoyerAuCommercant({
        to: commercant.email,
        subject: `Ta page Yoppaa est en ligne, ${commercant.nom} 🎉`,
        html: emailValidationCommercant({
          nom: commercant.nom,
          slug: commercant.slug,
          avant_lancement: phaseAvantLancement,
        }),
      })

      // 5) Kit de bienvenue dans la foulée : c'est le moment où le commerçant
      // est le plus motivé. Contenu adapté à la phase (recrutement de
      // préinscrits avant l'ouverture publique, commande après). Non bloquant.
      try {
        await envoyerAuCommercant({
          to: commercant.email,
          subject: 'Ton kit Yoppaa 🟣',
          html: emailKitBienvenue({
            nom_commercant: commercant.nom,
            slug: commercant.slug,
            avant_lancement: phaseAvantLancement,
          }),
        })
      } catch (e) {
        console.error('[admin/valider] envoi kit KO (non bloquant)', e?.message)
      }
    }

    return NextResponse.json({
      ok: true,
      commercant_id,
      email: emailResult.ok ? 'envoyé' : `échec : ${emailResult.error}`,
    })
  } catch (e) {
    console.error('[admin/valider] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
