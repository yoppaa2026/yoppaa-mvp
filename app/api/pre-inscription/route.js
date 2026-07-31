// POST /api/pre-inscription
//
// Endpoint public pour capturer les inscriptions de la landing page.
// Mode Teasing : capture minimaliste (email + code postal + type + message libre).
// Mode Reveal : meme structure (le type discrimine la liste Brevo cible).
//
// Workflow :
//   1. Verification Cloudflare Turnstile (anti-bot)
//   2. Validation format email + code postal belge (4 chiffres)
//   3. Insert dans Supabase (table pre_inscriptions, UNIQUE email+type → upsert)
//   4. Sync avec Brevo (liste Teasing / Yoppers / Commercants selon mode+type)
//   5. Envoi email Resend "Merci, tu seras prevenu"
//
// Body :
//   {
//     email: string,
//     code_postal: string,            // 4 chiffres belges
//     type_utilisateur: 'yopper' | 'commercant' | 'curieux',
//     message?: string,
//     turnstile_token: string,
//     consentement_marketing: boolean,
//     utm_source?, utm_medium?, utm_campaign?
//   }
//
// Le mode_landing est determine par le serveur via la date courante vs
// LANDING_REVEAL_DATE (pas par le client). Plus fiable.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { syncContactToBrevo, pickBrevoListId } from '@/lib/brevo'
import { envoyerAuCommercant } from '@/lib/resend'
import { emailMerciPreinscription } from '@/lib/resend-landing'
import { getLandingMode } from '@/lib/landing-mode'

const TYPES_AUTORISES = ['yopper', 'commercant', 'curieux']
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RE_CP_BE = /^\d{4}$/

// Slug de partage perso du commerçant (Kit Ch3). Dérivé du nom du commerce, unique.
function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
async function genererSlugKit(supabase, nom) {
  const base = slugify(nom) || 'commerce'
  let slug = base
  let i = 1
  while (i < 60) {
    const { data } = await supabase.from('pre_inscriptions').select('id').eq('slug_kit', slug).maybeSingle()
    if (!data) return slug
    i++
    slug = `${base}-${i}`
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function POST(request) {
  try {
    const body = await request.json()
    const {
      email, code_postal, type_utilisateur, message,
      turnstile_token, consentement_marketing,
      utm_source, utm_medium, utm_campaign,
      ref_commercant, commercant_nom,
    } = body || {}

    // Nom de commerce saisi par l'inscrit (texte libre) : son enseigne s'il est
    // commerçant, ou un commerce qu'il aimerait voir s'il est curieux. Distinct de
    // ref_commercant (slug d'attribution via ?ref).
    const commercantNom = commercant_nom ? String(commercant_nom).trim().slice(0, 160) : null

    // Slug d'attribution (?ref=) : nettoyé au format slug, borné en longueur.
    // On ne valide pas l'existence du commerçant ici (le lien peut pointer un
    // commerçant préinscrit pas encore en base) ; l'attribution est exploitée au
    // reporting. Nettoyage strict pour éviter tout contenu parasite.
    const refCommercant = ref_commercant
      ? String(ref_commercant).trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 120) || null
      : null

    // 1) Validations basiques
    if (!email || !RE_EMAIL.test(email.trim().toLowerCase())) {
      return NextResponse.json({ ok: false, error: 'Email invalide' }, { status: 400 })
    }
    if (!code_postal || !RE_CP_BE.test(String(code_postal).trim())) {
      return NextResponse.json({ ok: false, error: 'Code postal belge requis (4 chiffres)' }, { status: 400 })
    }
    if (!TYPES_AUTORISES.includes(type_utilisateur)) {
      return NextResponse.json({ ok: false, error: 'Type utilisateur invalide' }, { status: 400 })
    }
    // RGPD (décision Alex 31/07 soir) : le consentement est OBLIGATOIRE. La
    // case décrit la finalité même du formulaire (être prévenu du lancement +
    // actualités) : sans elle, pas d'inscription. Jamais pré-cochée côté reveal.
    const consentOk = consentement_marketing === true
    if (!consentOk) {
      return NextResponse.json({ ok: false, error: 'Coche la case de consentement pour qu\'on puisse te prévenir.' }, { status: 400 })
    }
    // Le nom du commerce est requis pour un commerçant (on veut toujours l'enseigne).
    if (type_utilisateur === 'commercant' && (!commercant_nom || !String(commercant_nom).trim())) {
      return NextResponse.json({ ok: false, error: 'Le nom de ton commerce est requis' }, { status: 400 })
    }

    // 2) Verification Turnstile
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const turnstileResult = await verifyTurnstileToken(turnstile_token, ip)
    if (!turnstileResult.success && !turnstileResult.skipped) {
      return NextResponse.json({ ok: false, error: 'Verification Turnstile echouee', codes: turnstileResult.errorCodes }, { status: 401 })
    }

    // 3) Determine le mode landing actuel (cote serveur, pas confiance au client)
    const mode_landing = getLandingMode()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const emailNormalise = String(email).trim().toLowerCase()
    const codePostalNormalise = String(code_postal).trim()
    const messageNormalise = message ? String(message).trim().slice(0, 1000) : null

    // Résolution commune via le code postal (array codes_postaux sur communes).
    // Best-effort : si aucune commune ne matche (CP hors périmètre), commune_id
    // reste null et la préinscription est quand même enregistrée.
    let communeId = null
    try {
      const { data: com } = await supabase
        .from('communes')
        .select('id')
        .contains('codes_postaux', [codePostalNormalise])
        .limit(1)
        .maybeSingle()
      communeId = com?.id || null
    } catch (e) {
      console.warn('[pre-inscription] résolution commune KO (non-bloquant)', e?.message)
    }

    // 4) Upsert dans Supabase (UNIQUE email+type → on update si existe deja)
    const { data: rowExistant } = await supabase
      .from('pre_inscriptions')
      .select('id, slug_kit')
      .eq('type_utilisateur', type_utilisateur)
      .ilike('email', emailNormalise)
      .maybeSingle()

    let preInscriptionId = rowExistant?.id || null

    // Slug de partage perso : uniquement pour les commerçants. On le génère une fois
    // (garde celui déjà attribué si l'inscrit revient), pour la page /kit/<slug>.
    let slugKit = rowExistant?.slug_kit || null
    if (type_utilisateur === 'commercant' && !slugKit) {
      slugKit = await genererSlugKit(supabase, commercantNom)
    }

    if (preInscriptionId) {
      // Update : on rafraichit le code postal et le message au cas ou
      await supabase
        .from('pre_inscriptions')
        .update({
          code_postal: codePostalNormalise,
          commune_id: communeId,
          commercant_nom: commercantNom,
          message: messageNormalise,
          mode_landing,
          source: mode_landing === 'teasing' ? 'teasing' : (utm_source || 'direct'),
          utm_source, utm_medium, utm_campaign,
          // On ne réécrit ref_commercant que s'il est fourni : ne pas effacer une
          // attribution déjà posée si l'inscrit revient via un lien direct sans ?ref.
          ...(refCommercant ? { ref_commercant: refCommercant } : {}),
          // slug_kit : seulement si nouvellement généré (ne pas écraser un slug existant).
          ...(slugKit && !rowExistant?.slug_kit ? { slug_kit: slugKit } : {}),
          // Consentement : on ne peut que le MONTER (une resoumission sans case
          // cochée ne retire pas un consentement déjà donné ; le retrait passe
          // par la désinscription email).
          ...(consentOk ? { consentement_marketing: true } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', preInscriptionId)
    } else {
      const userAgent = request.headers.get('user-agent') || null
      const { data: nouvelle, error: errIns } = await supabase
        .from('pre_inscriptions')
        .insert({
          email: emailNormalise,
          code_postal: codePostalNormalise,
          commune_id: communeId,
          commercant_nom: commercantNom,
          type_utilisateur,
          message: messageNormalise,
          mode_landing,
          source: mode_landing === 'teasing' ? 'teasing' : (utm_source || 'direct'),
          utm_source, utm_medium, utm_campaign,
          ref_commercant: refCommercant,
          slug_kit: slugKit,
          user_agent: userAgent,
          consentement_marketing: consentOk,
        })
        .select('id')
        .single()
      if (errIns) {
        console.error('[pre-inscription] insert KO', errIns)
        return NextResponse.json({ ok: false, error: 'Erreur enregistrement' }, { status: 500 })
      }
      preInscriptionId = nouvelle.id
    }

    // 5) Sync Brevo (non-bloquant : si Brevo down, on garde la pre-inscription).
    // Uniquement avec consentement marketing : les listes Brevo servent aux
    // campagnes, pas à la notification de lancement (gérée via Resend).
    try {
      const listId = consentOk ? pickBrevoListId({ mode_landing, type_utilisateur }) : null
      if (listId) {
        const brevoRes = await syncContactToBrevo({
          email: emailNormalise,
          listId,
          attributes: {
            CODE_POSTAL: codePostalNormalise,
            TYPE_UTILISATEUR: type_utilisateur,
            MODE_LANDING: mode_landing,
            SOURCE: mode_landing === 'teasing' ? 'teasing' : (utm_source || 'direct'),
            MESSAGE: messageNormalise || '',
          },
        })
        await supabase
          .from('pre_inscriptions')
          .update({
            brevo_contact_id: brevoRes.id ? String(brevoRes.id) : null,
            brevo_sync_at: new Date().toISOString(),
          })
          .eq('id', preInscriptionId)
      }
    } catch (e) {
      console.error('[pre-inscription] sync Brevo KO (non-bloquant)', e?.message)
    }

    // 6) Envoi email de remerciement (non-bloquant)
    try {
      const html = emailMerciPreinscription({
        mode_landing,
        type_utilisateur,
        slug_kit: slugKit,
      })
      await envoyerAuCommercant({
        to: emailNormalise,
        subject: mode_landing === 'teasing'
          ? 'Merci 🟣 Tu fais partie des premiers curieux'
          : 'Bienvenue dans la communauté Yoppaa 🟣',
        html,
      })
    } catch (e) {
      console.error('[pre-inscription] email remerciement KO (non-bloquant)', e?.message)
    }

    return NextResponse.json({ ok: true, mode_landing, slug_kit: slugKit })

  } catch (e) {
    console.error('[pre-inscription] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
