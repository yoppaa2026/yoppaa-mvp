// POST /api/commande/retour-arriere
// Body : { commande_id }
//
// DÉFAIRE UNE REMISE CLIQUÉE PAR ERREUR (01/10), pour le patron comme pour la
// case « Commandes », et depuis le 06/10 pour la case « Livraisons » (une
// livraison du jour seulement). La fidélité de la commande repart avec. La règle : `retourArriereAutorise` (lib/tableau-de-bord),
// appliquée par `lib/commande-gestes-serveur.js`. Le patron l'écrivait depuis
// son navigateur.

import { NextResponse } from 'next/server'
import { clientAdmin, refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { retourArriere, REFUS_GESTE } from '@/lib/commande-gestes-serveur'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commande_id } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    // ⚠️ OUVERTE À LA CASE « LIVRAISONS » (décision d'Alex, 06/10), mais pour
    // une livraison du jour seulement : le livreur qui s'est trompé de commande
    // corrige lui-même. La case « Commandes » garde le geste entier.
    const verdict = await gardeLigneEquipe(request, admin, 'commandes', commande_id, ['commandes', 'livraisons'])
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise
    const livraisonDuJourSeulement = verdict.role === 'membre' && !verdict.permis?.commandes

    const r = await retourArriere(admin, { commandeId: commande_id, commercantId: verdict.commercant.id, livraisonDuJourSeulement })
    if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.message }, { status: REFUS_GESTE[r.code] || 400 })
    await journaliserGeste(admin, verdict, { action: 'commande_retour_arriere', cible_type: 'commande', cible_id: commande_id, details: { patch: r.champs } })
    return NextResponse.json({ ok: true, commande_id, champs: r.champs })
  } catch (e) {
    console.error('[commande/retour-arriere] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
