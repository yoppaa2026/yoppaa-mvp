// POST /api/rdv/replanifier-rappel
//
// Le rappel push d'une heure avant suit le rendez-vous que le commerçant vient
// de déplacer. Appelé par le tableau de bord (ModalDeplacerRdv) après chaque
// déplacement, que le client ait été prévenu par email ou non : l'ancien
// rappel est faux dans les deux cas.
//
// 🔴 POURQUOI (trouvé le 11/09). Le rappel est programmé chez OneSignal au
// moment de la réservation, avec l'heure dans son texte. Déplacer le
// rendez-vous ne le touchait pas : le client recevait « dans 1h, à 19:00 » à
// 18:00 pour une table passée à 20:30. La règle vit dans lib/rappels.js.
//
// Body : { rdv_id }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { replanifierRappelRdv } from '@/lib/rappels'

export async function POST(request) {
  try {
    const { rdv_id } = await request.json()
    if (!rdv_id) return NextResponse.json({ ok: false, error: 'rdv_id requis' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ SEUL LE COMMERÇANT DE CE RENDEZ-VOUS : c'est lui qui déplace. Sans
    // garde, quiconque connaît l'identifiant pourrait annuler le rappel d'un
    // client, ou le faire programmer à nouveau.
    const verdict = await gardeSurLigne(request, supabase, 'rdv_reservations', rdv_id)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    // ⚠️ ON LIT LE RÉSULTAT : un rappel non replanifié se dit, il ne se tait pas.
    const res = await replanifierRappelRdv(rdv_id, supabase)
    if (!res?.ok) {
      console.error('[rdv/replanifier-rappel] KO', { rdv_id, error: res?.error })
      return NextResponse.json({ ok: false, error: res?.error || 'rappel non replanifié' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, rappel: res })
  } catch (e) {
    console.error('[rdv/replanifier-rappel] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
