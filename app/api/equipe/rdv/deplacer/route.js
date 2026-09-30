// POST /api/equipe/rdv/deplacer
// Body : { rdv_id, date, heure, vu: { table: { format_id, forcer, raison } | null, cadence_depassee } }
//
// UN MEMBRE DE L'ÉQUIPE DÉPLACE UNE RÉSERVATION (30/09, étape 3b). Il le fait
// dans la fenêtre du patron (`ModalDeplacerRdv`, réglage `serveur`), qui
// propose les heures libres avec le même code ; la fenêtre envoie ici au lieu
// d'écrire. Le serveur refait tout : `deplacerReservationRdv`.
//
// ⚠️ LA SUITE EST CELLE DU PATRON, ET C'EST LA FENÊTRE QUI LA DÉROULE : le
// rappel replanifié (`/api/rdv/replanifier-rappel`), puis l'email « ton
// rendez-vous est déplacé » (`/api/emails/rdv-confirme`, `deplace`). Les deux
// routes acceptent le membre qui a la case agenda. Cette route rend seulement
// SI le client a laissé une adresse, jamais l'adresse.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { deplacerReservationRdv } from '@/lib/rdv-deplacement-server'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { rdv_id, date, heure, vu = null } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    // ⚠️ LE COMMERCE SE DÉDUIT DE LA LIGNE, jamais du corps de la requête.
    const garde = await gardeLigneEquipe(request, admin, 'rdv_reservations', rdv_id, 'agenda')
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return NextResponse.json({ ok: false, error: 'Date invalide.' }, { status: 400 })
    if (!/^\d{2}:\d{2}$/.test(String(heure || ''))) return NextResponse.json({ ok: false, error: 'Heure invalide.' }, { status: 400 })

    const res = await deplacerReservationRdv(admin, { commercantId: garde.commercant.id, rdvId: rdv_id, date, heure, vu })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.message, code: res.code }, { status: 409 })

    await journaliserGeste(admin, garde, {
      action: 'rdv_deplace', cible_type: 'rdv', cible_id: rdv_id,
      details: {
        de: { date: res.ancienne_date, heure: String(res.ancienne_heure || '').slice(0, 5) },
        vers: { date, heure },
      },
    })
    return NextResponse.json({
      ok: true,
      ancienne_date: res.ancienne_date,
      ancienne_heure: res.ancienne_heure,
      client_a_email: res.client_a_email,
    })
  } catch (e) {
    console.error('[equipe/rdv/deplacer] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
