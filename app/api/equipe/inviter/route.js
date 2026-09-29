// POST /api/equipe/inviter
// Body : { commercant_id, email, prenom, droits: { agenda, commandes, livraisons, argent, comptoir }, expire_le }
//
// LE PATRON INVITE UNE PERSONNE DANS SON ÉQUIPE (29/09).
//
// 🔴 TOUT SE REVÉRIFIE ICI : le forfait, le plafond, l'adresse, les cases. Le
// formulaire les contrôle aussi, mais un formulaire se contourne.
//
// ⚠️ L'INVITATION EXISTE MÊME SI L'EMAIL RATE. Elle est enregistrée, visible
// dans « Mon équipe », et se renvoie d'un clic : on le dit au patron au lieu
// de défaire ce qui a marché.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardePatronEquipe, membresEnPlace, nouveauJeton, empreinteJeton, lienInvitation, journaliser, COLONNES_MEMBRE } from '@/lib/equipe-server'
import { refusInvitation, droitsDepuis, adresseNormalisee, finInvitation, membrePourLePatron, libelleFinAcces, DROITS, colonneDroit } from '@/lib/equipe'
import { envoyerAuCommercant, emailInvitationEquipe } from '@/lib/resend'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const corps = await request.json().catch(() => ({}))
    const { commercant_id } = corps
    const admin = clientAdmin()
    const garde = await gardePatronEquipe(request, admin, commercant_id)
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    const { commercant, user } = garde

    const maintenant = new Date()
    const droits = droitsDepuis(corps.droits)
    const expireLe = corps.expire_le ? new Date(corps.expire_le).toISOString() : null
    const membres = await membresEnPlace(admin, commercant_id)
    const refus = refusInvitation({
      commercant, membres, email: corps.email, prenom: corps.prenom, droits,
      expireLe: corps.expire_le || null, emailPatron: commercant.email, maintenant,
    })
    if (refus) return NextResponse.json({ ok: false, error: refus }, { status: 409 })

    const jeton = nouveauJeton()
    const { data: membre, error } = await admin.from('equipe_membres').insert({
      commercant_id,
      email: adresseNormalisee(corps.email),
      prenom: String(corps.prenom).trim(),
      ...droits,
      statut: 'invite',
      expire_le: expireLe,
      invitation_jeton_hash: empreinteJeton(jeton),
      invitation_expire_le: finInvitation(maintenant),
      invite_par: user.id,
    }).select(COLONNES_MEMBRE).single()
    if (error) {
      // Deux clics simultanés : l'index unique a tranché, l'autre est passé.
      if (error.code === '23505') return NextResponse.json({ ok: false, error: 'Cette personne vient d’être invitée.' }, { status: 409 })
      return NextResponse.json({ ok: false, error: `invitation non enregistrée : ${error.message}` }, { status: 500 })
    }

    const envoi = await envoyerAuCommercant({
      to: membre.email,
      subject: `${commercant.nom} t'ouvre un accès à son équipe sur Yoppaa`,
      html: emailInvitationEquipe({
        prenom: membre.prenom,
        commercantNom: commercant.nom,
        droits: DROITS.filter(d => membre[colonneDroit(d.cle)] === true),
        lien: lienInvitation(jeton),
        expireLe: libelleFinAcces(expireLe),
      }),
    })

    await journaliser(admin, {
      commercant_id, auth_user_id: user.id, action: 'invitation_envoyee', cible_type: 'membre', cible_id: membre.id,
      details: { email: membre.email, droits, expire_le: expireLe, email_parti: !!envoi?.ok },
    })

    return NextResponse.json({ ok: true, membre: membrePourLePatron(membre, maintenant), email_parti: !!envoi?.ok })
  } catch (e) {
    console.error('[equipe/inviter] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
