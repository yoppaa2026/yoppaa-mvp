// POST /api/ia/generer-post
//
// Générateur de textes marchand (Ch3bis). Le commerçant décrit ce qu'il veut annoncer,
// l'IA renvoie des variantes prêtes à copier (post réseau, accroche deal/actu). TEXTE
// uniquement. Modèle + quota mensuel selon le palier (lib/plans getIaConfig).
//
// Sécurité / coûts :
//   - kill-switch global (IA_TEXTE_ENABLED != 'false') + clé requise
//   - auth marchand (JWT session) + vérif d'appartenance du commercant_id
//   - le plan est lu côté SERVEUR (jamais depuis le client)
//   - rate-limit par marchand + quota mensuel compté depuis ia_generations
//   - cap global optionnel (IA_QUOTA_GLOBAL_MOIS) = filet anti-dérive
//   - chaque génération est loguée (tokens) pour le suivi de conso
//
// Body : { commercant_id, surface?, occasion?, brief?, ton?, infos? }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIaConfig, IA_MODELES } from '@/lib/plans'
import { genererTexte, iaDisponible } from '@/lib/anthropic'
import { aiLimiter, checkLimit } from '@/lib/ratelimit'

function construireSysteme(nbVariantes) {
  return `Tu es l'assistant de rédaction de Yoppaa, l'application belge qui met en avant les commerces de quartier. Tu écris pour un commerçant qui veut communiquer avec ses clients.

Règles absolues :
1. Français, orthographe et grammaire impeccables.
2. Ton chaleureux, local et authentique. Jamais racoleur, jamais "corporate".
3. N'invente jamais un fait. Prix, dates, horaires, stock, promotions n'apparaissent QUE s'ils sont fournis. Si une info manque, reste général plutôt que d'inventer.
4. N'utilise jamais le tiret cadratin. Utilise la virgule, les deux-points, les parenthèses ou le point.
5. Un ou deux emojis maximum, pertinents. Jamais de surcharge.
6. Texte uniquement. Ne décris aucune image à créer.

Tu proposes ${nbVariantes} variantes distinctes (angles différents). Pour chaque variante :
- "court" : 1 à 2 phrases (story, notification).
- "long" : 2 à 4 phrases (post réseau social).
- "hashtags" : 2 à 4 hashtags pertinents et locaux.

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ni après :
{"variantes":[{"court":"...","long":"...","hashtags":["#..."]}]}`
}

// Surface 'article' : description de fiche produit du catalogue, pas un post.
// Le commerçant fournit ses caractéristiques brutes (ex : "pur beurre, pâte
// feuilletée, beurre du producteur local"), l'IA les tourne en description
// appétissante SANS rien inventer (règle anti pub trompeuse du 14/07).
function construireSystemeArticle(nbVariantes) {
  return `Tu es l'assistant de rédaction de Yoppaa, l'application belge qui met en avant les commerces de quartier. Tu rédiges la description d'un article du catalogue d'un commerçant, à partir des caractéristiques brutes qu'il fournit (ingrédients, matières, atouts).

Règles absolues :
1. Français, orthographe et grammaire impeccables.
2. Donne envie, mais reste authentique et fidèle aux caractéristiques fournies. Jamais racoleur, jamais "corporate".
3. N'invente jamais un fait : n'ajoute aucun ingrédient, aucune origine, aucun label, aucune promesse qui ne soit pas fourni. Pas de prix, pas de dates.
4. N'utilise jamais le tiret cadratin. Utilise la virgule, les deux-points, les parenthèses ou le point.
5. Pas d'emoji, pas de hashtag : c'est une description de produit affichée sur la carte de l'article.

Tu proposes ${nbVariantes} variantes distinctes (angles différents). Pour chaque variante :
- "court" : 1 à 2 phrases courtes (la description affichée sur la carte).
- "long" : 2 à 3 phrases un peu plus développées.
- "hashtags" : toujours un tableau vide [].

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ni après :
{"variantes":[{"court":"...","long":"...","hashtags":[]}]}`
}

function construirePrompt({ com, surface, occasion, brief, ton, infos }) {
  const lieu = com.adresse ? ` situé ${com.adresse}` : ''
  if (surface === 'article') {
    return `Commerce : ${com.nom} (${com.type || 'commerce'}${lieu}).
Article du catalogue : ${brief || '(sans nom)'}.
${infos ? `Caractéristiques fournies par le commerçant (ne rien ajouter au-delà) : ${infos}.\n` : ''}Rédige la description en français.`
  }
  const typeMsg = surface === 'deal'
    ? 'accroche pour une offre/deal'
    : surface === 'actu' ? 'actualité' : 'post pour les réseaux sociaux'
  return `Commerce : ${com.nom} (${com.type || 'commerce'}${lieu}).
Type de message : ${typeMsg}.
${occasion ? `Occasion : ${occasion}.\n` : ''}Ce que le commerçant veut annoncer : ${brief || '(non précisé)'}.
${infos ? `Informations exactes à respecter (ne rien ajouter au-delà) : ${infos}.\n` : ''}${ton ? `Ton souhaité : ${ton}.\n` : ''}Rédige en français.`
}

// Parse la réponse JSON du modèle. Robuste aux clôtures markdown + fallback texte brut.
function parserVariantes(texte) {
  let t = (texte || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const obj = JSON.parse(t)
    if (Array.isArray(obj?.variantes) && obj.variantes.length) {
      return obj.variantes.slice(0, 3).map(v => ({
        court: String(v.court || '').trim(),
        long: String(v.long || '').trim(),
        hashtags: Array.isArray(v.hashtags) ? v.hashtags.map(h => String(h).trim()).filter(Boolean).slice(0, 6) : [],
      })).filter(v => v.court || v.long)
    }
  } catch { /* pas du JSON : fallback */ }
  return [{ court: '', long: (texte || '').trim(), hashtags: [] }]
}

export async function POST(request) {
  try {
    if (!iaDisponible()) {
      return NextResponse.json({ ok: false, error: 'Le générateur est momentanément indisponible.' }, { status: 503 })
    }

    // 1) Auth marchand via le token appelant.
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const body = await request.json()
    const {
      commercant_id,
      surface = 'post',
      occasion = '',
      brief = '',
      ton = '',
      infos = '',
    } = body || {}
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    if (!String(brief).trim() && !String(occasion).trim()) {
      return NextResponse.json({ ok: false, error: 'Décris ce que tu veux annoncer.' }, { status: 400 })
    }

    // 2) Service_role pour lire le commerçant + vérifier l'appartenance.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    const { data: com } = await admin
      .from('commercants')
      .select('id, nom, type, plan, categorie, adresse, auth_user_id')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!com || com.auth_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // 3) Palier -> config IA (lue côté serveur, jamais depuis le client).
    const cfg = getIaConfig(com.plan)
    if (!cfg.actif) {
      return NextResponse.json({ ok: false, error: 'plan_sans_ia', message: 'Le générateur est réservé aux paliers Communiquer et Vendre.' }, { status: 403 })
    }

    // 4) Rate-limit par marchand.
    const rl = await checkLimit(aiLimiter, `ia:${commercant_id}`)
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Trop de générations en peu de temps. Réessaie dans un instant.' }, { status: 429 })
    }

    // 5) Quota mensuel (compté depuis ia_generations, mois calendaire UTC).
    const debutMois = new Date()
    debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0)
    const debutMoisISO = debutMois.toISOString()
    const { count } = await admin
      .from('ia_generations')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercant_id)
      .gte('created_at', debutMoisISO)
    const utilise = count || 0
    if (utilise >= cfg.quota_mois) {
      return NextResponse.json({ ok: false, error: 'quota_atteint', quota: { utilise, total: cfg.quota_mois, restant: 0 } }, { status: 429 })
    }

    // 6) Cap global optionnel (filet anti-dérive de coûts).
    const capGlobal = parseInt(process.env.IA_QUOTA_GLOBAL_MOIS || '', 10)
    if (Number.isInteger(capGlobal) && capGlobal > 0) {
      const { count: totalMois } = await admin
        .from('ia_generations')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', debutMoisISO)
      if ((totalMois || 0) >= capGlobal) {
        return NextResponse.json({ ok: false, error: 'Service momentanément saturé, réessaie plus tard.' }, { status: 503 })
      }
    }

    // 7) Génération.
    // Articles : toujours 3 propositions au choix (demande Alex 23/07), les
    // autres surfaces gardent le barème par modèle (Sonnet 3 / Haiku 2).
    const nbVariantes = surface === 'article' ? 3 : (cfg.modele === 'sonnet' ? 3 : 2)
    const modelId = IA_MODELES[cfg.modele]
    const maxTokens = cfg.modele === 'sonnet' ? 1500 : 900
    let out
    try {
      out = await genererTexte({
        model: modelId,
        systeme: surface === 'article' ? construireSystemeArticle(nbVariantes) : construireSysteme(nbVariantes),
        prompt: construirePrompt({ com, surface, occasion, brief, ton, infos }),
        maxTokens,
      })
    } catch (e) {
      console.error('[ia/generer-post] anthropic KO', e?.message)
      return NextResponse.json({ ok: false, error: 'La génération a échoué, réessaie.' }, { status: 502 })
    }

    const variantes = parserVariantes(out.texte)

    // 8) Log usage (awaité pour que le quota du prochain appel soit exact).
    try {
      await admin.from('ia_generations').insert({
        commercant_id,
        type: String(surface).slice(0, 20),
        occasion: String(occasion || '').slice(0, 60),
        modele: cfg.modele,
        tokens_in: out.usage.in,
        tokens_out: out.usage.out,
      })
    } catch (e) {
      console.error('[ia/generer-post] log KO (non-bloquant)', e?.message)
    }

    return NextResponse.json({
      ok: true,
      variantes,
      modele: cfg.modele,
      quota: { utilise: utilise + 1, total: cfg.quota_mois, restant: Math.max(0, cfg.quota_mois - utilise - 1) },
    })
  } catch (e) {
    console.error('[ia/generer-post]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
