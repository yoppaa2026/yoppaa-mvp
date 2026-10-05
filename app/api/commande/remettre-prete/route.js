// POST /api/commande/remettre-prete
// Body : { commande_id }
//
// « Annuler, remettre en Prête » : une commande déclarée non retirée par
// erreur (le client est finalement passé) revient « prête ».
//
// 🔴 LE TABLEAU DE BORD L'ÉCRIVAIT DEPUIS LE NAVIGATEUR (audit livraison I3,
// 05/10), sans statut lu ni stock repris. Or « non retiré » REND le stock des
// versions (`/api/commande/non-retire`) : revenir en arrière sans le reprendre
// laissait la pièce deux fois en vente, une dans le sac du client, une en
// ligne. Le geste vit ici, symétrique de « non retiré ».
//
// ⚠️ L'IDEMPOTENCE VIENT DE L'`UPDATE` filtré sur `non_retire` : deux clics ne
// reprennent le stock qu'une fois.

import { NextResponse } from 'next/server'
import { clientAdmin, refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { reprendreStockVariantes } from '@/lib/stock-variantes-server'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commande_id } = await request.json().catch(() => ({}))
    if (!commande_id) return NextResponse.json({ ok: false, error: 'commande_id requis' }, { status: 400 })

    const admin = clientAdmin()
    // Le commerce se déduit de la commande, jamais du corps de la requête.
    const verdict = await gardeLigneEquipe(request, admin, 'commandes', commande_id, 'commandes')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: basculee, error } = await admin.from('commandes')
      .update({ statut: 'pret' })
      .eq('id', commande_id)
      .eq('statut', 'non_retire')
      .select('id')
      .maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: `commande non mise à jour : ${error.message}` }, { status: 500 })
    if (!basculee) {
      return NextResponse.json({ ok: false, code: 'deja_fait', error: 'Cette commande n’est plus « non retirée ».' }, { status: 409 })
    }

    const reprise = await reprendreStockVariantes(admin, [commande_id])
    if (!reprise.ok) console.error('[commande/remettre-prete] stock non repris', reprise.error)
    await journaliserGeste(admin, verdict, {
      action: 'commande_remise_prete', cible_type: 'commande', cible_id: commande_id,
      details: { stock_repris: reprise.reprises, manquantes: reprise.manquantes },
    })

    return NextResponse.json({ ok: true, champs: { statut: 'pret' }, stock_manquant: reprise.manquantes || 0 })
  } catch (e) {
    console.error('[commande/remettre-prete] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
