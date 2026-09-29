// POST /api/equipe/rejoindre
// Body : { invitation }
//
// LA PERSONNE INVITÉE ACCEPTE (29/09). Elle est connectée ; son compte devient
// membre actif du commerce.
//
// 🔴 LE COMPTE DOIT PORTER L'ADRESSE INVITÉE (`refusAcceptation`). Le jeton
// seul ne fait entrer personne : un lien transféré, ou lu par-dessus une
// épaule, ne sert à rien à un autre compte.
//
// ⚠️ LE JETON MEURT À L'ACCEPTATION : son empreinte est effacée dans la même
// écriture, et l'écriture ne passe que si l'invitation est ENCORE en attente
// avec CE jeton. Deux clics, ou deux appareils, n'acceptent qu'une fois.

import { NextResponse } from 'next/server'
import { clientAdmin, utilisateurAppelant } from '@/lib/api-auth'
import { empreinteJeton, commerceDeLEquipe, journaliser, COLONNES_MEMBRE } from '@/lib/equipe-server'
import { refusAcceptation } from '@/lib/equipe'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { invitation } = await request.json().catch(() => ({}))
    const user = await utilisateurAppelant(request)
    if (!user) return NextResponse.json({ ok: false, error: 'Connecte-toi d’abord.' }, { status: 401 })
    if (!invitation || typeof invitation !== 'string' || invitation.length > 200) {
      return NextResponse.json({ ok: false, error: 'invitation inconnue' }, { status: 404 })
    }

    const admin = clientAdmin()
    const empreinte = empreinteJeton(invitation)
    const { data: membre, error } = await admin.from('equipe_membres').select(COLONNES_MEMBRE)
      .eq('invitation_jeton_hash', empreinte).maybeSingle()
    if (error) throw new Error(`lecture de l'invitation : ${error.message}`)
    const commercant = membre ? await commerceDeLEquipe(admin, membre.commercant_id) : null

    const maintenant = new Date()
    const refus = refusAcceptation({ membre, commercant, user, maintenant })
    if (refus) return NextResponse.json({ ok: false, error: refus }, { status: 409 })

    const { data: accepte, error: errMaj } = await admin.from('equipe_membres')
      .update({
        statut: 'actif', auth_user_id: user.id, accepte_le: maintenant.toISOString(), updated_at: maintenant.toISOString(),
        invitation_jeton_hash: null, invitation_expire_le: null,
      })
      .eq('id', membre.id).eq('statut', 'invite').eq('invitation_jeton_hash', empreinte)
      .select('id, commercant_id').maybeSingle()
    if (errMaj) return NextResponse.json({ ok: false, error: `acceptation non enregistrée : ${errMaj.message}` }, { status: 500 })
    if (!accepte) return NextResponse.json({ ok: false, error: 'Cette invitation vient d’être utilisée.' }, { status: 409 })

    await journaliser(admin, {
      commercant_id: accepte.commercant_id, membre_id: accepte.id, auth_user_id: user.id,
      action: 'invitation_acceptee', cible_type: 'membre', cible_id: accepte.id,
    })
    return NextResponse.json({ ok: true, commercant_id: accepte.commercant_id, commerce: commercant.nom })
  } catch (e) {
    console.error('[equipe/rejoindre] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
