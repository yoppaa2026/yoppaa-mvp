// POST /api/livraison/livrer
// Body : { commande_id, statut_livraison: 'en_livraison' | 'livree' | 'absent', encaissement }
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
// `/api/livraison/statut` (le message au client). La fidélité, elle, est
// créditée ICI, à « livrée » ou « retirée au magasin » (plus d'appel écran
// depuis le 06/10).

import { NextResponse } from 'next/server'
import { clientAdmin, refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { livrerCommande, REFUS_LIVRAISON } from '@/lib/livraison-serveur'
import { prevenirClientAbsent, prevenirClientRetireeMagasin } from '@/lib/livraison-absent-serveur'
import { crediterFideliteCommande } from '@/lib/fidelite-server'

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
    // ⚠️ « ABSENT » PRÉVIENT ICI, et seulement ici (voir lib/livraison-absent-serveur).
    // L'écran dit au livreur si le client a été prévenu : sinon il l'appelle.
    let client_prevenu = null
    if (statut_livraison === 'absent') {
      const p = await prevenirClientAbsent(admin, commande_id)
      client_prevenu = p.email || p.push
    }
    // « RETIRÉE AU MAGASIN » (I5, 05/10) : le reçu, qui dit pourquoi les frais
    // restent dus.
    if (statut_livraison === 'retiree_magasin') {
      const p = await prevenirClientRetireeMagasin(admin, commande_id)
      client_prevenu = p.email
    }
    // ⚠️ LA FIDÉLITÉ SE CRÉDITE ICI, CÔTÉ SERVEUR, pour les deux fins de
    // livraison. Elle ne dépendait que d'un second appel de l'écran, que le
    // Poste du livreur ne faisait pas. Idempotent : l'appel que fait encore le
    // tableau de bord ne compte pas deux fois.
    if (statut_livraison === 'livree' || statut_livraison === 'retiree_magasin') {
      await crediterFideliteCommande(admin, commande_id, '[livraison/livrer]')
    }
    return NextResponse.json({ ok: true, commande_id, champs: r.champs, client_prevenu })
  } catch (e) {
    console.error('[livraison/livrer] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
