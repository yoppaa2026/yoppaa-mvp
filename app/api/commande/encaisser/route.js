// POST /api/commande/encaisser
// Body : { commande_id, encaissement: 'terminal' | 'especes' | 'sans_paiement' }
//
// NOTER L'ENCAISSEMENT D'UNE COMMANDE DÉJÀ REMISE (01/10), pour le patron
// comme pour la case « Commandes ». La règle : `lib/commande-gestes-serveur.js`.

import { NextResponse } from 'next/server'
import { clientAdmin, refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { encaisserApresCoup, REFUS_GESTE } from '@/lib/commande-gestes-serveur'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commande_id, encaissement = null } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const verdict = await gardeLigneEquipe(request, admin, 'commandes', commande_id, 'commandes')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const r = await encaisserApresCoup(admin, { commandeId: commande_id, commercantId: verdict.commercant.id, choix: encaissement })
    if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.message }, { status: REFUS_GESTE[r.code] || 400 })
    await journaliserGeste(admin, verdict, {
      action: 'commande_encaissee_apres', cible_type: 'commande', cible_id: commande_id,
      details: { encaissement: r.champs.encaisse_mode, montant: r.champs.encaisse_montant },
    })
    return NextResponse.json({ ok: true, commande_id, champs: r.champs })
  } catch (e) {
    console.error('[commande/encaisser] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
