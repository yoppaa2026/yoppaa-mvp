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
// Body : { commercant_id, mots?, site_web?, champ? }
//
// ⚠️ DEUX CHAMPS DEPUIS LE 26/08 (demande d'Alex) : la PRÉSENTATION, qui doit
// donner envie, et les INFOS PRATIQUES, qui doivent être limpides. Deux
// exercices opposés, donc deux consignes séparées, mais la même mécanique
// d'authentification, de quota et de journal : la dupliquer aurait donné deux
// garde-fous qui divergent au premier durcissement.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { IA_MODELES, getIaFicheConfig } from '@/lib/plans'
import { genererTexte, iaDisponible } from '@/lib/anthropic'
import { aiLimiter, checkLimit } from '@/lib/ratelimit'
import { lireSiteWeb } from '@/lib/site-web'

// LE QUOTA EST MENSUEL ET DÉPEND DU PALIER (`IA_FICHE_CONFIG`), depuis le
// 26/08. Il était de 3 À VIE : pensé pour la seule inscription, il rendait le
// bouton du tableau de bord mort d'avance pour qui les avait déjà utilisées.
//
// Chaque demande rend trois propositions, et CHAQUE CHAMP a son compteur : la
// présentation et les infos pratiques ne se rédigent pas le même jour, et
// épuiser l'un ne doit pas fermer l'autre.
//
// Trois garde-fous se cumulent : ce quota, le rate-limit par commerce, et le
// cap global mensuel (IA_QUOTA_GLOBAL_MOIS) qui protège la facture.
const CHAMPS = {
  presentation: { log: 'presentation' },
  infos_pratiques: { log: 'infos_pratiques' },
}

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

// ⚠️ EXERCICE OPPOSÉ AU PRÉCÉDENT, ET LE PLUS RISQUÉ DES DEUX. Ce texte
// s'affiche sur la fiche ET dans l'email de confirmation de rendez-vous :
// inventer « annulation gratuite jusqu'à 24 h » engagerait le commerçant sur
// une politique qu'il n'a jamais décidée, face à un client qui l'a lue. On
// REFORMULE ce qu'il a écrit, on n'ajoute RIEN.
const SYSTEME_INFOS = `Tu es l'assistant de rédaction de Yoppaa, l'application belge qui met en avant les commerces de quartier. Tu mets au propre les INFORMATIONS PRATIQUES d'un commerce : moyens de paiement, politique d'annulation, consignes avant la visite, accès, stationnement.

Règles absolues :
1. Français de Belgique, orthographe et grammaire impeccables. En Belgique on dit Bancontact, jamais "CB".
2. 🔴 N'AJOUTE AUCUNE RÈGLE QUI N'EST PAS DANS CE QUE LE COMMERÇANT A ÉCRIT. Pas de délai d'annulation, pas de moyen de paiement, pas de pénalité, pas d'horaire que tu aurais supposé. Ce texte est lu par ses clients comme un engagement : une règle inventée est une promesse qu'il devra tenir, ou un conflit au comptoir.
3. Tu CLARIFIES et tu STRUCTURES : une ligne par information, chacune courte, à l'impératif ou à l'indicatif présent. Pas de paragraphe qui noie l'essentiel.
4. Ton neutre et courtois. Ce n'est pas un texte de vente : c'est un texte qu'on relit la veille d'un rendez-vous.
5. N'utilise jamais le tiret cadratin. Utilise la virgule, les deux-points ou le point.
6. Pas de hashtag, pas d'emoji.
7. Ne mentionne ni Yoppaa, ni l'application, ni aucune formule d'abonnement.
8. Six lignes maximum. Si le commerçant a donné moins d'informations, rends moins de lignes : mieux vaut trois lignes vraies que six lignes remplies.

Tu proposes 3 variantes distinctes par l'ORDRE et la FORMULATION, jamais par le contenu : les mêmes règles, dites autrement.

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ni après :
{"variantes":[{"texte":"..."}]}`

function construirePrompt({ com, mots, extraitSite, champ }) {
  const morceaux = [
    `Commerce : ${com.nom}`,
    com.type ? `Type : ${com.type}` : null,
    com.adresse ? `Adresse : ${com.adresse}` : null,
  ].filter(Boolean)

  if (champ === 'infos_pratiques') {
    // ⚠️ PAS DE SITE WEB ICI, et c'est délibéré. Une page « conditions
    // générales » trouvée en ligne ferait entrer dans la fiche des règles que
    // le commerçant n'a pas relues, avec la même conséquence qu'une invention.
    morceaux.push(mots
      ? `Ce que le commerçant a noté, dans ses mots :\n${mots}`
      : 'Le commerçant n\'a rien noté.')
    morceaux.push('Mets au propre ces informations pratiques, en 3 variantes. N\'ajoute aucune règle qui ne soit pas ci-dessus.')
    return morceaux.join('\n')
  }

  if (mots) morceaux.push(`Ce que le commerçant en dit, dans ses mots : ${mots}`)

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
    // ⚠️ LE CHAMP VIENT DU CLIENT : on ne garde que ce qu'on connaît, sinon un
    // appelant choisirait librement le compteur qu'il consomme.
    const champ = CHAMPS[body?.champ] ? body.champ : 'presentation'

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    const { data: com } = await admin
      .from('commercants')
      // ⚠️ `plan` EST INDISPENSABLE : c'est lui qui fixe le quota mensuel. Sans
      // cette colonne, `getIaFicheConfig` retomberait sur le palier le plus
      // bas pour tout le monde, et un commerçant qui paie se verrait refuser
      // sa quatrième demande sans comprendre pourquoi.
      .select('id, nom, type, categorie, adresse, site_web, auth_user_id, plan')
      .eq('id', commercantId)
      .maybeSingle()
    if (!com || com.auth_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    const rl = await checkLimit(aiLimiter, `ia-presentation:${commercantId}`)
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Trop de propositions en peu de temps. Réessaie dans un instant.' }, { status: 429 })
    }

    // Début du mois EN COURS : le quota repart le 1er, comme celui du
    // générateur de posts. Deux compteurs qui ne se remettent pas à zéro le
    // même jour seraient impossibles à expliquer au commerçant.
    const debutMois = new Date()
    debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0)

    const quotaMois = getIaFicheConfig(com.plan).quota_mois
    const { count } = await admin
      .from('ia_generations')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId)
      .eq('type', CHAMPS[champ].log)
      .gte('created_at', debutMois.toISOString())
    if ((count || 0) >= quotaMois) {
      return NextResponse.json({
        ok: false,
        error: 'assez_de_propositions',
        message: `Tu as utilisé tes ${quotaMois} propositions du mois. Reprends celle qui te plaît le plus et arrange-la à ta façon : c'est la tienne, et personne ne connaît ton commerce mieux que toi. Le compteur repart le 1er.`,
      }, { status: 429 })
    }

    const capGlobal = parseInt(process.env.IA_QUOTA_GLOBAL_MOIS || '', 10)
    if (Number.isInteger(capGlobal) && capGlobal > 0) {
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
    //
    // ⚠️ JAMAIS POUR LES INFOS PRATIQUES : une page de conditions générales
    // trouvée en ligne ferait entrer dans la fiche des règles que le commerçant
    // n'a pas relues. Voir `construirePrompt`.
    const extraitSite = champ === 'infos_pratiques'
      ? null
      : await lireSiteWeb(body?.site_web || com.site_web)

    let out
    try {
      out = await genererTexte({
        model: IA_MODELES.sonnet,
        systeme: champ === 'infos_pratiques' ? SYSTEME_INFOS : SYSTEME,
        prompt: construirePrompt({ com, mots, extraitSite, champ }),
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
        type: CHAMPS[champ].log,
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
      // `restant` reste le nom rendu depuis le premier jour : `/signup` le lit
      // pour dire au commerçant combien de demandes il lui reste.
      restant: Math.max(0, quotaMois - (count || 0) - 1),
    })
  } catch (e) {
    console.error('[ia/presentation]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
