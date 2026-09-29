// POST /api/equipe/retirer
// Body : { commercant_id, membre_id }
//
// LE PATRON RETIRE UNE PERSONNE DE SON ÉQUIPE (29/09). L'accès se coupe à
// l'appel suivant : chaque route de l'équipe relit le membre à chaque fois.
//
// ⚠️ RETIRER N'EST PAS EFFACER. La ligne reste, au statut `retire`, parce que
// le journal y renvoie : « qui a déplacé ce rendez-vous le mois passé » doit
// encore avoir une réponse. Une invitation en attente est retirée de même, et
// son lien meurt avec son empreinte.
//
// ⚠️ ET LE PATRON PEUT RÉINVITER LA MÊME ADRESSE ENSUITE : l'unicité ne porte
// que sur les membres non retirés.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardePatronEquipe, journaliser } from '@/lib/equipe-server'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commercant_id, membre_id } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    // ⚠️ PAS DE CONDITION DE FORFAIT ICI : un commerce qui a quitté Vendre doit
    // toujours pouvoir faire le ménage dans son équipe.
    const garde = await gardePatronEquipe(request, admin, commercant_id)
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    if (!membre_id) return NextResponse.json({ ok: false, error: 'personne inconnue' }, { status: 400 })

    const maintenant = new Date().toISOString()
    const { data, error } = await admin.from('equipe_membres')
      .update({ statut: 'retire', retire_le: maintenant, updated_at: maintenant, invitation_jeton_hash: null, invitation_expire_le: null })
      .eq('id', membre_id).eq('commercant_id', commercant_id).neq('statut', 'retire')
      .select('id, email').maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: `retrait non enregistré : ${error.message}` }, { status: 500 })
    if (!data) return NextResponse.json({ ok: false, error: 'personne introuvable dans ton équipe' }, { status: 404 })

    await journaliser(admin, {
      commercant_id, auth_user_id: garde.user.id, action: 'membre_retire', cible_type: 'membre', cible_id: membre_id,
      details: { email: data.email },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[equipe/retirer] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
