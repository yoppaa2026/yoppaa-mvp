// POST /api/equipe/rdv/salle
// Body : { commercant_id, date }
//
// LA SALLE D'UN JOUR, POUR LA FENÊTRE DE SAISIE DU POSTE ÉQUIPE (29/09, 3b).
//
// La fenêtre « Nouvelle réservation » est celle du patron : elle compte les
// tables et la cuisine avec `lireSalleDuJour`, qu'elle appelle d'habitude avec
// le client du navigateur. Un membre n'a pas accès à la base : il passe ici,
// et reçoit EXACTEMENT ce que la fonction rend au patron (horaires, statuts,
// couverts, prestation : aucune donnée personnelle).

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe } from '@/lib/equipe-server'
import { lireSalleDuJour } from '@/lib/inventaire-salle'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commercant_id, date } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardeEquipe(request, admin, commercant_id, 'agenda')
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return NextResponse.json({ ok: false, error: 'date invalide' }, { status: 400 })

    const { reservations, plafond, error } = await lireSalleDuJour(admin, { commercantId: commercant_id, dateStr: date })
    if (error) throw new Error(`lecture de la salle : ${error.message}`)
    return NextResponse.json({ ok: true, reservations: reservations || [], plafond: plafond ?? null })
  } catch (e) {
    console.error('[equipe/rdv/salle] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
