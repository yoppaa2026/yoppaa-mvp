// GET /api/fidelite/ma-recompense?commercant_id=…
//
// « Est-ce que j'ai une récompense à dépenser chez ce commerçant ? »
//
// ⚠️ CETTE ROUTE EXIGE UNE IDENTITÉ PROUVÉE, et c'est l'arbitrage d'Alex du
// 24/08 (option A). La carte de fidélité a pour clé un NUMÉRO DE GSM, et aucun
// flux de vérification par SMS n'existe dans le projet. Si elle acceptait un
// numéro simplement TAPÉ, il suffirait d'essayer celui de son voisin pour
// apprendre qu'il a une carte pleine chez ce commerçant, combien elle vaut, et
// donc où il va. C'est la faille déjà fermée dans `/api/fidelite/mes-cartes`.
//
// ⚠️ ELLE NE REND JAMAIS DE NUMÉRO DE TÉLÉPHONE, ni de jeton de carte. Le
// tunnel n'a besoin que de l'identifiant de la récompense et de son libellé :
// tout le reste serait une donnée personnelle recopiée pour rien.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { identiteProuvee } from '@/lib/yopper-auth'
import { recompenseDisponible } from '@/lib/fidelite-recompense-server'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const commercantId = searchParams.get('commercant_id')
    if (!commercantId) {
      return NextResponse.json({ ok: false, error: 'Commerçant manquant.' }, { status: 400 })
    }

    const identite = await identiteProuvee(request)
    // ⚠️ PAS UNE ERREUR : un visiteur non connecté est un cas NORMAL du tunnel.
    // On répond « rien à proposer », l'écran n'affiche simplement pas le bloc.
    // Répondre 401 ferait clignoter une alerte à chaque commande d'invité.
    if (!identite?.email) {
      return NextResponse.json({ ok: true, connecte: false, recompense: null })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const recompense = await recompenseDisponible(supabase, {
      email: identite.email,
      commercantId,
    })

    return NextResponse.json({
      ok: true,
      connecte: true,
      recompense: recompense
        ? {
            id: recompense.id,
            type: recompense.type,
            valeur: Number(recompense.valeur),
            libelle: recompense.libelle || null,
          }
        : null,
    })
  } catch (e) {
    console.error('[fidelite/ma-recompense]', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 })
  }
}
