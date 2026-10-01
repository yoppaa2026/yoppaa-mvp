// POST /api/livraison/livrer
// Body : { commande_id, statut_livraison: 'en_livraison' | 'livree', encaissement }
//
// LIVRER UNE COMMANDE (équipe, étape 4, 01/10), pour le PATRON comme pour le
// LIVREUR : une seule route, une seule règle (`lib/livraison-geste.js`). Le
// tableau de bord écrivait ce statut depuis le navigateur ; il passe ici.
//
// ⚠️ LA CASE « LIVRAISONS ». Le patron et l'admin vérifié passent toujours
// (`gardeLigneEquipe`), un membre seulement s'il a la case. Le commerce se
// déduit de la commande, jamais du corps de la requête.
//
// ⚠️ LA SUITE EST CELLE DU TABLEAU DE BORD : l'écran appelle ensuite
// `/api/livraison/statut` (le message au client) et, à « livrée »,
// `/api/fidelite/crediter`, les mêmes routes pour tous.

import { NextResponse } from 'next/server'
import { clientAdmin, refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { livrerCommande, REFUS_LIVRAISON } from '@/lib/livraison-serveur'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commande_id, statut_livraison, encaissement = null } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const verdict = await gardeLigneEquipe(request, admin, 'commandes', commande_id, 'livraisons')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const r = await livrerCommande(admin, {
      commandeId: commande_id,
      commercantId: verdict.commercant.id,
      vers: statut_livraison,
      encaissement,
    })
    if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.message }, { status: REFUS_LIVRAISON[r.code] || 400 })

    await journaliserGeste(admin, verdict, {
      action: 'livraison_statut', cible_type: 'commande', cible_id: commande_id,
      details: { de: r.avant.statut_livraison, vers: statut_livraison, encaissement: r.champs.encaisse_mode || null, montant: r.champs.encaisse_montant ?? null },
    })
    return NextResponse.json({ ok: true, commande_id, champs: r.champs })
  } catch (e) {
    console.error('[livraison/livrer] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
