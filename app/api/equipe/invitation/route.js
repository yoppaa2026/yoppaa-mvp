// POST /api/equipe/invitation
// Body : { invitation }
//
// CE QUE LA PAGE « REJOINDRE » PEUT DIRE AVANT LA CONNEXION (29/09) : qui
// invite, le prénom invité, l'adresse attendue (masquée), et si l'invitation
// est encore ouverte.
//
// ⚠️ SANS SESSION, ET C'EST VOULU : la personne n'a peut-être pas encore de
// compte. On ne rend donc que le strict nécessaire. Jamais l'adresse en
// entier, jamais les cases, jamais l'identifiant du commerce.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { empreinteJeton, adresseMasquee } from '@/lib/equipe-server'
import { invitationOuverte } from '@/lib/equipe'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { invitation } = await request.json().catch(() => ({}))
    if (!invitation || typeof invitation !== 'string' || invitation.length > 200) {
      return NextResponse.json({ ok: false, error: 'invitation inconnue' }, { status: 404 })
    }
    const admin = clientAdmin()
    const { data: membre, error } = await admin.from('equipe_membres')
      .select('prenom, email, statut, invitation_expire_le, commercant:commercants(nom)')
      .eq('invitation_jeton_hash', empreinteJeton(invitation)).maybeSingle()
    if (error) throw new Error(`lecture de l'invitation : ${error.message}`)
    if (!membre) return NextResponse.json({ ok: false, error: 'Cette invitation n’existe pas, ou a déjà servi.' }, { status: 404 })

    return NextResponse.json({
      ok: true,
      prenom: membre.prenom,
      commerce: membre.commercant?.nom || '',
      adresse: adresseMasquee(membre.email),
      ouverte: invitationOuverte(membre),
    })
  } catch (e) {
    console.error('[equipe/invitation] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
