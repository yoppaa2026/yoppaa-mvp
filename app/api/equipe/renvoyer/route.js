// POST /api/equipe/renvoyer
// Body : { commercant_id, membre_id }
//
// LE PATRON RENVOIE UNE INVITATION (perdue, expirée, ou partie dans les
// indésirables) (29/09).
//
// ⚠️ UN NOUVEAU JETON À CHAQUE ENVOI : l'ancien lien meurt. Un lien qui traîne
// dans une boîte qu'on ne surveille plus ne doit pas rester valable.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardePatronEquipe, nouveauJeton, empreinteJeton, lienInvitation, journaliser, COLONNES_MEMBRE } from '@/lib/equipe-server'
import { finInvitation, membrePourLePatron, commerceAUneEquipe, libelleFinAcces, DROITS, colonneDroit } from '@/lib/equipe'
import { envoyerAuCommercant, emailInvitationEquipe } from '@/lib/resend'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commercant_id, membre_id } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardePatronEquipe(request, admin, commercant_id)
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    if (!commerceAUneEquipe(garde.commercant)) return NextResponse.json({ ok: false, error: 'L’équipe fait partie de la formule Vendre.' }, { status: 409 })
    if (!membre_id) return NextResponse.json({ ok: false, error: 'personne inconnue' }, { status: 400 })

    const maintenant = new Date()
    const jeton = nouveauJeton()
    // ⚠️ SEULE UNE INVITATION EN ATTENTE SE RENVOIE : une personne active n'a
    // plus rien à accepter, une personne retirée doit être réinvitée.
    const { data: membre, error } = await admin.from('equipe_membres')
      .update({ invitation_jeton_hash: empreinteJeton(jeton), invitation_expire_le: finInvitation(maintenant), updated_at: maintenant.toISOString() })
      .eq('id', membre_id).eq('commercant_id', commercant_id).eq('statut', 'invite')
      .select(COLONNES_MEMBRE).maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: `invitation non renouvelée : ${error.message}` }, { status: 500 })
    if (!membre) return NextResponse.json({ ok: false, error: 'aucune invitation en attente pour cette personne' }, { status: 404 })

    const envoi = await envoyerAuCommercant({
      to: membre.email,
      subject: `${garde.commercant.nom} t'ouvre un accès à son équipe sur Yoppaa`,
      html: emailInvitationEquipe({
        prenom: membre.prenom,
        commercantNom: garde.commercant.nom,
        droits: DROITS.filter(d => membre[colonneDroit(d.cle)] === true),
        lien: lienInvitation(jeton),
        expireLe: libelleFinAcces(membre.expire_le),
      }),
    })

    await journaliser(admin, {
      commercant_id, auth_user_id: garde.user.id, action: 'invitation_renvoyee', cible_type: 'membre', cible_id: membre_id,
      details: { email: membre.email, email_parti: !!envoi?.ok },
    })
    return NextResponse.json({ ok: true, membre: membrePourLePatron(membre, maintenant), email_parti: !!envoi?.ok })
  } catch (e) {
    console.error('[equipe/renvoyer] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
