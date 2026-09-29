// POST /api/equipe/membres
// Body : { commercant_id }
//
// L'ÉQUIPE D'UN COMMERCE, VUE PAR SON PATRON (29/09).
//
// ⚠️ POST ET NON GET : le jeton de session voyage dans l'en-tête, comme pour
// toutes les routes du tableau de bord (`postPro`).

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardePatronEquipe, membresEnPlace } from '@/lib/equipe-server'
import { membrePourLePatron, commerceAUneEquipe, EQUIPE_MAX, DROITS } from '@/lib/equipe'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commercant_id } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardePatronEquipe(request, admin, commercant_id)
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })

    const maintenant = new Date()
    const membres = (await membresEnPlace(admin, commercant_id)).map(m => membrePourLePatron(m, maintenant))
    return NextResponse.json({
      ok: true,
      membres,
      max: EQUIPE_MAX,
      droits: DROITS,
      disponible: commerceAUneEquipe(garde.commercant),
    })
  } catch (e) {
    console.error('[equipe/membres] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
