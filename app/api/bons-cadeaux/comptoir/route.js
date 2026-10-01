// POST /api/bons-cadeaux/comptoir
// Body : { action: 'chercher', commercant_id, code }
//      | { action: 'debiter', commercant_id, bon_id, montant }
//
// ENCAISSER UN BON CADEAU AU COMPTOIR (équipe, étape 5, 01/10), pour le PATRON
// comme pour la case « Comptoir ». La règle et ses raisons vivent dans
// `lib/bons-comptoir-serveur.js` : le patron écrivait depuis son navigateur,
// en deux écritures qui pouvaient débiter deux fois.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe, journaliserGeste } from '@/lib/equipe-server'
import { chercherBonComptoir, debiterBonComptoir, REFUS_BON } from '@/lib/bons-comptoir-serveur'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { action, commercant_id, code, bon_id, montant } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    // Le patron et l'admin vérifié passent toujours, un membre s'il a la case.
    const garde = await gardeEquipe(request, admin, commercant_id, 'comptoir')
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    const commercantId = garde.commercant.id

    let r
    if (action === 'chercher') r = await chercherBonComptoir(admin, { commercantId, code })
    else if (action === 'debiter') r = await debiterBonComptoir(admin, { commercantId, bonId: bon_id, montant })
    else return NextResponse.json({ ok: false, error: 'action inconnue' }, { status: 400 })

    if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.message }, { status: REFUS_BON[r.code] || 400 })
    if (action === 'debiter') {
      await journaliserGeste(admin, garde, {
        action: 'bon_debite', cible_type: 'bon_cadeau', cible_id: r.bon.id,
        details: { montant: r.debite, reste: r.bon.solde },
      })
    }
    return NextResponse.json({ ok: true, bon: r.bon, debite: r.debite ?? null })
  } catch (e) {
    console.error('[bons-cadeaux/comptoir] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
