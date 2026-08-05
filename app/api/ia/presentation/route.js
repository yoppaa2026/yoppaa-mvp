// POST /api/ia/presentation
//
// Rédige la présentation d'un commerce, à l'inscription. Trois propositions,
// modifiables, à partir de ce que le commerçant tape et, s'il l'a renseigné,
// de son site web.
//
// POURQUOI UNE ROUTE À PART, et pas /api/ia/generer-post. Celle-ci refuse les
// paliers sans IA, ce qui est juste pour le générateur de posts mais absurde
// ici : au moment de l'inscription, le commerçant n'a PAS ENCORE de formule, et
// l'intention d'Alex est précisément qu'il « y goûte déjà ». C'est le seul
// appel où l'IA sert à convaincre plutôt qu'à produire.
//
// Le coût reste tenu : quelques générations par commerce, une seule fois dans
// sa vie de fiche, plus le rate-limit et le cap global existants.
//
// Body : { commercant_id, mots?, site_web? }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { IA_MODELES } from '@/lib/plans'
import { genererTexte, iaDisponible } from '@/lib/anthropic'
import { aiLimiter, checkLimit } from '@/lib/ratelimit'
import { lireSiteWeb } from '@/lib/site-web'

// TROIS DEMANDES PAR COMMERCE, tous paliers confondus, à vie. Chacune rend
// trois propositions, soit neuf textes : personne n'a besoin de plus pour se
// présenter, et au-delà on paie une boucle, pas un besoin. Le compteur est
// affiché au commerçant plutôt que subi : on ne coupe jamais sans prévenir.
//
// Trois garde-fous se cumulent : ce plafond à vie, le rate-limit par commerce,
// et le cap global mensuel (IA_QUOTA_GLOBAL_MOIS) qui protège la facture.
const MAX_PAR_COMMERCE = 3
const TYPE_LOG = 'presentation'

const SYSTEME = `Tu es l'assistant de rédaction de Yoppaa, l'application belge qui met en avant les commerces de quartier. Tu rédiges la présentation d'un commerce, celle que les habitants liront en haut de sa fiche.

Règles absolues :
1. Français de Belgique, orthographe et grammaire impeccables.
2. Ton chaleureux et concret. Le commerçant parle de son commerce à ses voisins, pas à des investisseurs. Jamais "corporate", jamais racoleur.
3. N'invente JAMAIS un fait. Aucune date de création, aucune récompense, aucun label, aucune spécialité qui ne soit pas fourni. Si tu manques d'information, reste général plutôt que d'inventer : une présentation fausse se retourne contre le commerçant.
4. N'utilise jamais le tiret cadratin. Utilise la virgule, les deux-points, les parenthèses ou le point.
5. Pas de hashtag. Un emoji maximum, et seulement s'il apporte quelque chose.
6. Ne mentionne ni Yoppaa, ni l'application, ni aucune formule d'abonnement.
7. Entre 2 et 4 phrases. C'est un texte qu'on lit en entier ou qu'on ne lit pas.

Tu proposes 3 variantes VRAIMENT distinctes, avec des angles différents : par exemple le savoir-faire, l'accueil et l'ambiance, ou ce qu'on y trouve.

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ni après :
{"variantes":[{"texte":"..."}]}`

function construirePrompt({ com, mots, extraitSite }) {
  const morceaux = [
    `Commerce : ${com.nom}`,
    com.type ? `Type : ${com.type}` : null,
    com.adresse ? `Adresse : ${com.adresse}` : null,
    mots ? `Ce que le commerçant en dit, dans ses mots : ${mots}` : null,
  ].filter(Boolean)

  if (extraitSite) {
    morceaux.push(
      `Extrait de son site web (source à utiliser avec prudence : n'en retiens que ce qui décrit clairement CE commerce, ignore les menus de navigation, mentions légales et textes de cookies) :\n${extraitSite}`
    )
  }

  morceaux.push('Rédige 3 présentations distinctes de ce commerce.')
  return morceaux.join('\n')
}

function parserVariantes(texte) {
  try {
    const brut = String(texte || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    const json = JSON.parse(brut)
    if (Array.isArray(json?.variantes)) {
      return json.variantes
        .map(v => String(v?.texte || v?.long || v?.court || '').trim())
        .filter(Boolean)
        .slice(0, 3)
    }
  } catch { /* pas du JSON : on retombe sur le texte brut */ }
  const nu = String(texte || '').trim()
  return nu ? [nu] : []
}

export async function POST(request) {
  try {
    if (!iaDisponible()) {
      return NextResponse.json({ ok: false, error: 'La rédaction assistée est momentanément indisponible.' }, { status: 503 })
    }

    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const commercantId = body?.commercant_id
    const mots = String(body?.mots || '').trim().slice(0, 600)
    if (!commercantId) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    const { data: com } = await admin
      .from('commercants')
      .select('id, nom, type, categorie, adresse, site_web, auth_user_id')
      .eq('id', commercantId)
      .maybeSingle()
    if (!com || com.auth_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    const rl = await checkLimit(aiLimiter, `ia-presentation:${commercantId}`)
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Trop de propositions en peu de temps. Réessaie dans un instant.' }, { status: 429 })
    }

    const { count } = await admin
      .from('ia_generations')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId)
      .eq('type', TYPE_LOG)
    if ((count || 0) >= MAX_PAR_COMMERCE) {
      return NextResponse.json({
        ok: false,
        error: 'assez_de_propositions',
        message: `Tu as utilisé tes ${MAX_PAR_COMMERCE} propositions. Reprends celle qui te plaît le plus et arrange-la à ta façon : c'est la tienne, et personne ne connaît ton commerce mieux que toi.`,
      }, { status: 429 })
    }

    const capGlobal = parseInt(process.env.IA_QUOTA_GLOBAL_MOIS || '', 10)
    if (Number.isInteger(capGlobal) && capGlobal > 0) {
      const debutMois = new Date()
      debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0)
      const { count: totalMois } = await admin
        .from('ia_generations')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', debutMois.toISOString())
      if ((totalMois || 0) >= capGlobal) {
        return NextResponse.json({ ok: false, error: 'Service momentanément saturé, réessaie plus tard.' }, { status: 503 })
      }
    }

    // Le site déclaré au formulaire prime sur celui déjà enregistré : le
    // commerçant vient peut-être de le taper, sans avoir encore sauvegardé.
    const extraitSite = await lireSiteWeb(body?.site_web || com.site_web)

    let out
    try {
      out = await genererTexte({
        model: IA_MODELES.sonnet,
        systeme: SYSTEME,
        prompt: construirePrompt({ com, mots, extraitSite }),
        maxTokens: 1200,
      })
    } catch (e) {
      console.error('[ia/presentation] anthropic KO', e?.message)
      return NextResponse.json({ ok: false, error: 'La rédaction a échoué, réessaie.' }, { status: 502 })
    }

    const variantes = parserVariantes(out.texte)
    if (variantes.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucune proposition exploitable, réessaie.' }, { status: 502 })
    }

    try {
      await admin.from('ia_generations').insert({
        commercant_id: commercantId,
        type: TYPE_LOG,
        occasion: extraitSite ? 'avec site' : 'sans site',
        modele: 'sonnet',
        tokens_in: out.usage.in,
        tokens_out: out.usage.out,
      })
    } catch (e) {
      console.error('[ia/presentation] log KO (non bloquant)', e?.message)
    }

    return NextResponse.json({
      ok: true,
      variantes,
      site_lu: !!extraitSite,
      restant: Math.max(0, MAX_PAR_COMMERCE - (count || 0) - 1),
    })
  } catch (e) {
    console.error('[ia/presentation]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
