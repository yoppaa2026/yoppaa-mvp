// POST /api/admin/valider
// Body : { commercant_id }
// Auth : JWT user dans header Authorization (vérification email admin côté serveur)
//
// Effets en chaîne :
// 1) UPDATE commercants : statut='valide', motif_rejet=null
// 2) UPDATE onboarding_commercants : statut='valide'
// 3) INSERT admin_validations (log)
// 4) Email Resend au commerçant : "Ton espace est ouvert", avec ce qui manque
//
// 🔴 VALIDER N'EST PLUS PUBLIER (28/09, décision d'Alex). Cette route
// publiait la fiche d'un même geste, alors que le catalogue, les photos et
// l'encaissement ne se remplissent QUE depuis le tableau de bord qu'elle
// ouvrait : toute fiche partait donc en ligne à moitié vide. Elle ouvre
// désormais l'espace et rien d'autre ; la publication est le clic « Publier »
// (/api/admin/publier), sur une fiche complète (lib/fiche-complete.js).
// Les emails « ta page est en ligne » et « ton kit » sont partis avec elle.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailEspaceOuvert } from '@/lib/resend'
import { clientAdmin, adminVerifie } from '@/lib/api-auth'
import { bilanDeLaFiche } from '@/lib/fiche-complete-server'
import { fichePubliee } from '@/lib/statut-commercant'


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
    if (!(await adminVerifie(request, user))) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // Fetch préalable : on a besoin du nom pour générer un slug si manquant
    const { data: existant } = await supabase
      .from('commercants')
      .select('id, nom, slug, statut_publication')
      .eq('id', commercant_id)
      .single()
    if (!existant) {
      return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    }

    // ⚠️ UNE FICHE DÉJÀ EN LIGNE LE RESTE. Cette route sert aussi à revalider
    // un compte (après un rejet levé, par exemple) : la remettre en attente
    // retirerait sans prévenir une fiche que ses clients voient.
    const dejaEnLigne = fichePubliee(existant)
    // Si pas de slug, on en génère un automatique unique (basé sur le nom)
    const updates = {
      statut: 'valide',
      statut_publication: dejaEnLigne ? 'publie' : 'en_attente',
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

    // 4) Email au commerçant (non bloquant) : l'espace est ouvert, et voici ce
    // qu'il faut pour que la fiche soit visible. La liste est CALCULÉE sur sa
    // fiche réelle : ce qu'il a déjà fait à l'inscription s'y lit coché.
    //
    // ⚠️ PAS POUR UNE FICHE DÉJÀ EN LIGNE : lui annoncer qu'elle n'est pas
    // visible serait faux.
    let emailResult = { ok: false, error: 'pas d\'email destinataire' }
    if (commercant.email && !dejaEnLigne) {
      let criteres = []
      try {
        const { bilan } = await bilanDeLaFiche(clientAdmin(), commercant_id)
        criteres = bilan?.criteres || []
      } catch (e) {
        // Sans la liste, l'email reste juste : il dit que l'espace est ouvert
        // et que la fiche est à préparer. On ne le bloque pas pour ça.
        console.error('[admin/valider] bilan de la fiche impossible', e?.message)
      }
      emailResult = await envoyerAuCommercant({
        to: commercant.email,
        subject: `Ton espace Yoppaa est ouvert, ${commercant.nom}`,
        html: emailEspaceOuvert({ nom: commercant.nom, criteres }),
      })
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
