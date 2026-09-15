// POST /api/admin/impersonate-verifier
//
// L'ONGLET PEUT-IL ENCORE AGIR EN TANT QUE CE COMMERCE ?
//
// 🔴 POSÉE LE 15/09 TARD, après qu'Alex est tombé sur Ciseaux et Soins en MODE
// ADMIN en revenant sur l'onglet où il testait La Table d'Essai. « Voir
// Dashboard » vivait dans le localStorage, commun à tous les onglets et jamais
// effacé par une déconnexion. Le tableau de bord pose maintenant la question à
// CHAQUE chargement, et seul le journal répond : ligne ouverte, au nom de
// l'admin, pour ce commerce, depuis moins de deux heures (décision d'Alex).
//
// ⚠️ UNE LIGNE EXPIRÉE ENCORE OUVERTE EST FERMÉE ICI, à la fin de sa durée : le
// journal ne doit pas dire qu'un accès a duré trois jours.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { raisonImpersonationRefusee, finImpersonation, finAInscrire } from '@/lib/impersonation'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    let body = {}
    try { body = await request.json() } catch { /* traité juste en dessous */ }
    const { impersonation_id, commercant_id } = body || {}
    if (!impersonation_id || !commercant_id) {
      return NextResponse.json({ ok: false, raison: 'incomplet' }, { status: 400 })
    }

    const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })
    }

    // ⚠️ AVEC LE JETON DE L'ADMIN, JAMAIS LA CLÉ DE SERVICE : c'est la base qui
    // dit ce qu'il a le droit de lire dans le journal.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })
    }
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    const { data: ligne, error } = await supabase
      .from('admin_impersonations')
      .select('id, admin_email, commercant_id, started_at, ended_at')
      .eq('id', impersonation_id)
      .maybeSingle()
    // 🔴 « JE N'AI PAS PU LIRE » N'EST PAS « ELLE EST VALABLE ».
    if (error) {
      console.error('[admin/impersonate-verifier] journal illisible', error.message)
      return NextResponse.json({ ok: false, raison: 'journal_illisible' }, { status: 500 })
    }

    const maintenant = new Date()
    const raison = raisonImpersonationRefusee(ligne, { adminEmail: user.email, commercantId: commercant_id, maintenant })
    if (raison) {
      if (raison === 'expiree') {
        const { data: fermees, error: errFin } = await supabase
          .from('admin_impersonations')
          .update({ ended_at: finAInscrire(ligne, maintenant).toISOString() })
          .eq('id', ligne.id)
          .is('ended_at', null)
          .select('id')
        // ⚠️ LU, PAS ESPÉRÉ : une base qui refuse la fermeture laisse la ligne
        // ouverte sans le dire. Le refus d'accès, lui, tient quand même.
        if (errFin || !fermees?.length) {
          console.error('[admin/impersonate-verifier] ligne expirée non fermée', { id: ligne.id, erreur: errFin?.message || 'aucune ligne mise à jour' })
        }
      }
      return NextResponse.json({ ok: false, raison }, { status: 409 })
    }

    return NextResponse.json({ ok: true, expire_at: finImpersonation(ligne).toISOString() })
  } catch (e) {
    console.error('[admin/impersonate-verifier]', e)
    return NextResponse.json({ ok: false, raison: 'erreur_serveur' }, { status: 500 })
  }
}
