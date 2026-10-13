// POST /api/ia/menu
//
// LE MENU LU PAR L'IA (13/10, demande d'Alex : « essentiel pour accélérer les
// onboarding des commerçants qui n'ont jamais le temps »).
//
// Le commerçant envoie la photo ou le PDF de son menu ; Claude le lit et rend
// une PROPOSITION de catalogue, remise en ordre par `lib/menu-lu.js`. Cette
// route ne crée RIEN : la création se fait après la relecture du commerçant.
//
// Body : { commercant_id, documents: [{ type, data (base64) }] }
//
// DÉCIDÉ AU TABLEAU (13/10) : toutes les formules avec un quota mensuel
// (`IA_MENU_CONFIG`) ; AUCUNE page gardée (elles passent en mémoire puis
// disparaissent) ; l'alimentaire d'abord.
//
// Même mécanique que /api/ia/presentation : session, appartenance, rate-limit,
// quota du mois, cap global, journal `ia_generations` (type « menu »).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { IA_MODELES, getIaMenuConfig, planIa, isAlimentaire } from '@/lib/plans'
import { lireDocuments, iaDisponible } from '@/lib/anthropic'
import { aiLimiter, checkLimit } from '@/lib/ratelimit'
import { gardeCommercant, refus } from '@/lib/api-auth'
import { normaliserLecture, documentsValides, OUTIL_CATALOGUE, CONSIGNE_LECTURE } from '@/lib/menu-lu'
import { empreinteDocuments, occasionDeLecture, nouvelleLecture } from '@/lib/menu-lu-server'

export async function POST(request) {
  try {
    if (!iaDisponible()) {
      return NextResponse.json({ ok: false, error: 'La lecture du menu est momentanément indisponible.' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const commercantId = body?.commercant_id
    if (!commercantId) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    // 🔴 LE COMMERÇANT LUI-MÊME, OU L'ADMIN (Alex, 13/10 : « il me faut l'accès
    // aussi depuis le DB admin », pour encoder le menu à la place du
    // commerçant, comme Carole le fait pour les fiches). `gardeCommercant`
    // laisse passer l'admin vérifié (double authentification) et personne
    // d'autre que le propriétaire.
    const garde = await gardeCommercant(request, admin, commercantId)
    const refusGarde = refus(garde, NextResponse)
    if (refusGarde) return refusGarde

    // ⚠️ `plan`, `essai_plan`, `created_at` : ils fixent le quota (voir
    // /api/ia/presentation). `categorie` : l'alimentaire d'abord.
    const { data: com, error: errCom } = await admin
      .from('commercants')
      .select('id, nom, type, categorie, auth_user_id, plan, essai_plan, created_at')
      .eq('id', commercantId)
      .maybeSingle()
    if (errCom) return NextResponse.json({ ok: false, error: 'Lecture du commerce impossible, réessaie.' }, { status: 500 })
    if (!com) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    // La garde est passée : si l'appelant n'est pas le propriétaire, c'est
    // l'admin vérifié.
    const parAdmin = com.auth_user_id !== garde.user.id
    if (!isAlimentaire(com)) {
      return NextResponse.json({ ok: false, error: 'La lecture du menu est réservée aux commerces alimentaires pour l’instant.' }, { status: 403 })
    }

    const docs = documentsValides(body?.documents)
    if (!docs.ok) return NextResponse.json({ ok: false, error: docs.error }, { status: 400 })

    const rl = await checkLimit(aiLimiter, `ia-menu:${commercantId}`)
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Trop de lectures en peu de temps. Réessaie dans un instant.' }, { status: 429 })
    }

    const debutMois = new Date()
    debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0)
    const quotaMois = getIaMenuConfig(planIa(com)).quota_mois
    const { count, error: errCount } = await admin
      .from('ia_generations')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId)
      .eq('type', 'menu')
      .gte('created_at', debutMois.toISOString())
    // ⚠️ UN COMPTE ILLISIBLE N'EST PAS ZÉRO : il ouvrirait le quota.
    if (errCount) return NextResponse.json({ ok: false, error: 'Vérification du quota impossible, réessaie.' }, { status: 500 })
    // ⚠️ L'ADMIN N'EST PAS BORNÉ PAR LE QUOTA DU COMMERCE : c'est Yoppaa qui
    // fait l'onboarding, et ses essais ne doivent pas vider les lectures du
    // commerçant. Il reste borné par le rate-limit et le cap global.
    if (!parAdmin && (count || 0) >= quotaMois) {
      return NextResponse.json({
        ok: false,
        error: 'quota_atteint',
        message: `Tu as utilisé tes ${quotaMois} lectures de menu du mois. Tu peux compléter ton catalogue à la main en attendant : le compteur repart le 1er.`,
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

    let out
    try {
      out = await lireDocuments({
        model: IA_MODELES.sonnet,
        systeme: CONSIGNE_LECTURE,
        consigne: `Commerce : ${com.nom}${com.type ? ` (${com.type})` : ''}. Lis ce menu et remplis proposer_catalogue.`,
        documents: docs.documents,
        outil: OUTIL_CATALOGUE,
      })
    } catch (e) {
      console.error('[ia/menu] anthropic KO', e?.message)
      return NextResponse.json({ ok: false, error: 'La lecture a échoué, réessaie.' }, { status: 502 })
    }

    // Le journal d'abord : une lecture faite est une lecture comptée, même si
    // elle ne donne rien d'exploitable (elle a coûté).
    //
    // 🔴 L'OCCASION PORTE L'IDENTIFIANT DE LA LECTURE ET L'EMPREINTE DE SES
    // PAGES : c'est elle qui autorise ensuite les corrections (voir
    // `lib/menu-lu-server.js`), pour CES pages seulement.
    const lectureId = nouvelleLecture()
    try {
      await admin.from('ia_generations').insert({
        commercant_id: commercantId,
        // ⚠️ UNE LECTURE DE L'ADMIN NE COMPTE PAS DANS LE QUOTA DU COMMERCE :
        // type distinct, « menu_admin ». Elle reste comptée dans le cap global.
        type: parAdmin ? 'menu_admin' : 'menu',
        occasion: occasionDeLecture(lectureId, empreinteDocuments(docs.documents)),
        modele: 'sonnet',
        tokens_in: out.usage.in,
        tokens_out: out.usage.out,
      })
    } catch (e) {
      console.error('[ia/menu] log KO (non bloquant)', e?.message)
    }

    const proposition = normaliserLecture(out.entree)
    if (!proposition.lisible) {
      return NextResponse.json({
        ok: false,
        error: 'illisible',
        message: 'Ce document ne ressemble pas à un menu lisible. Reprends la photo bien à plat, avec plus de lumière, ou envoie le PDF.',
        restant: Math.max(0, quotaMois - (count || 0) - 1),
      }, { status: 422 })
    }
    if (out.tronque) proposition.resume.tronque = true

    return NextResponse.json({ ok: true, proposition, lecture_id: lectureId, restant: Math.max(0, quotaMois - (count || 0) - 1) })
  } catch (e) {
    console.error('[ia/menu]', e?.message)
    return NextResponse.json({ ok: false, error: 'La lecture a échoué, réessaie.' }, { status: 500 })
  }
}
