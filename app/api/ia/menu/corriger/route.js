// POST /api/ia/menu/corriger
//
// LA CORRECTION D'UN MENU LU (13/10, demande d'Alex au premier essai : « il
// faudrait que je puisse lui dire pour qu'il adapte »). Le commerçant écrit
// une remarque sur un article ou sur tout le menu ; Claude RELIT LES PAGES
// avec cette remarque et rend seulement ce qui change. Rien n'est créé ici.
//
// Body : { commercant_id, lecture_id, documents, remarque, contexte: { cible?, carte } }
//
// ✅ ALEX (tableau, 13/10) : la correction relit les pages, ne compte PAS
// dans le quota des lectures, et se limite à 10 par lecture.
//
// 🔴 ELLE N'EST ACCEPTÉE QUE POUR UNE VRAIE LECTURE, AVEC LES MÊMES PAGES : le
// journal de la lecture porte son identifiant et l'empreinte de ses pages
// (`lib/menu-lu-server.js`). Sans ce lien, « corriger » serait une lecture
// gratuite de n'importe quel menu.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { IA_MODELES, isAlimentaire } from '@/lib/plans'
import { lireDocuments, iaDisponible } from '@/lib/anthropic'
import { aiLimiter, checkLimit } from '@/lib/ratelimit'
import { gardeCommercant, refus } from '@/lib/api-auth'
import {
  documentsValides, remarqueValide, contexteValide, normaliserCorrection, consigneDeCorrection,
  OUTIL_CORRECTION, CONSIGNE_LECTURE, CONSIGNE_CORRECTION, CORRECTIONS_PAR_LECTURE, DUREE_LECTURE_HEURES,
} from '@/lib/menu-lu'
import { empreinteDocuments, occasionDeLecture, UUID } from '@/lib/menu-lu-server'

export async function POST(request) {
  try {
    if (!iaDisponible()) {
      return NextResponse.json({ ok: false, error: 'La correction est momentanément indisponible.' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const commercantId = body?.commercant_id
    if (!commercantId) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    // Le commerçant lui-même, ou l'admin vérifié : la garde de la lecture.
    const garde = await gardeCommercant(request, admin, commercantId)
    const refusGarde = refus(garde, NextResponse)
    if (refusGarde) return refusGarde

    const { data: com, error: errCom } = await admin
      .from('commercants')
      .select('id, nom, type, categorie')
      .eq('id', commercantId)
      .maybeSingle()
    if (errCom) return NextResponse.json({ ok: false, error: 'Lecture du commerce impossible, réessaie.' }, { status: 500 })
    if (!com) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (!isAlimentaire(com)) {
      return NextResponse.json({ ok: false, error: 'La lecture du menu est réservée aux commerces alimentaires pour l’instant.' }, { status: 403 })
    }

    const lectureId = String(body?.lecture_id || '')
    if (!UUID.test(lectureId)) return NextResponse.json({ ok: false, error: 'Lecture inconnue : relis le menu.' }, { status: 400 })
    const rem = remarqueValide(body?.remarque)
    if (!rem.ok) return NextResponse.json({ ok: false, error: rem.error }, { status: 400 })
    const ctx = contexteValide(body?.contexte)
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: 400 })
    const docs = documentsValides(body?.documents)
    if (!docs.ok) return NextResponse.json({ ok: false, error: docs.error }, { status: 400 })

    const rl = await checkLimit(aiLimiter, `ia-menu:${commercantId}`)
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Trop de demandes en peu de temps. Réessaie dans un instant.' }, { status: 429 })
    }

    // 🔴 LA LECTURE D'ORIGINE, POUR CE COMMERCE, AVEC CES PAGES, DU JOUR.
    const occasion = occasionDeLecture(lectureId, empreinteDocuments(docs.documents))
    const depuis = new Date(Date.now() - DUREE_LECTURE_HEURES * 3600 * 1000).toISOString()
    const { data: lectures, error: errLecture } = await admin
      .from('ia_generations')
      .select('id')
      .eq('commercant_id', commercantId)
      .in('type', ['menu', 'menu_admin'])
      .eq('occasion', occasion)
      .gte('created_at', depuis)
      .limit(1)
    if (errLecture) return NextResponse.json({ ok: false, error: 'Vérification de la lecture impossible, réessaie.' }, { status: 500 })
    if (!lectures?.length) {
      return NextResponse.json({ ok: false, error: 'lecture_inconnue', message: 'Cette lecture n’est plus disponible pour une correction : relis le menu.' }, { status: 409 })
    }

    // ⚠️ DIX CORRECTIONS PAR LECTURE. Un compte illisible n'est pas zéro.
    const { count, error: errCount } = await admin
      .from('ia_generations')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId)
      .eq('type', 'menu_correction')
      .eq('occasion', occasion)
    if (errCount) return NextResponse.json({ ok: false, error: 'Vérification des corrections impossible, réessaie.' }, { status: 500 })
    if ((count || 0) >= CORRECTIONS_PAR_LECTURE) {
      return NextResponse.json({
        ok: false,
        error: 'corrections_epuisees',
        message: `Tu as fait les ${CORRECTIONS_PAR_LECTURE} corrections de cette lecture. Corrige le reste à la main dans la relecture : tout reste modifiable.`,
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

    let out
    try {
      out = await lireDocuments({
        model: IA_MODELES.sonnet,
        systeme: `${CONSIGNE_LECTURE}\n\n${CONSIGNE_CORRECTION}`,
        consigne: consigneDeCorrection({ com, remarque: rem.remarque, contexte: ctx.contexte }),
        documents: docs.documents,
        outil: OUTIL_CORRECTION,
      })
    } catch (e) {
      console.error('[ia/menu/corriger] anthropic KO', e?.message)
      return NextResponse.json({ ok: false, error: 'La correction a échoué, réessaie.' }, { status: 502 })
    }

    // Une correction faite est une correction comptée (elle a coûté), hors
    // quota des lectures (type distinct), dans le cap global.
    try {
      await admin.from('ia_generations').insert({
        commercant_id: commercantId,
        type: 'menu_correction',
        occasion,
        modele: 'sonnet',
        tokens_in: out.usage.in,
        tokens_out: out.usage.out,
      })
    } catch (e) {
      console.error('[ia/menu/corriger] log KO (non bloquant)', e?.message)
    }

    const correction = normaliserCorrection(out.entree)
    if (correction.vide) {
      return NextResponse.json({
        ok: false,
        error: 'rien_change',
        message: 'L’IA n’a rien trouvé à changer avec cette remarque. Précise-la, ou corrige à la main.',
        restant: Math.max(0, CORRECTIONS_PAR_LECTURE - (count || 0) - 1),
      }, { status: 422 })
    }
    return NextResponse.json({ ok: true, correction, restant: Math.max(0, CORRECTIONS_PAR_LECTURE - (count || 0) - 1) })
  } catch (e) {
    console.error('[ia/menu/corriger]', e?.message)
    return NextResponse.json({ ok: false, error: 'La correction a échoué, réessaie.' }, { status: 500 })
  }
}
