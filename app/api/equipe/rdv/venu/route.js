// POST /api/equipe/rdv/venu
// Body : { rdv_id, encaissement: 'terminal' | 'especes' | 'sans_paiement' | null }
//
// LE CLIENT EST VENU (29/09, étape 3). Le geste « honoré » du tableau de bord,
// que le patron écrit depuis son navigateur, passe ici par le serveur pour
// l'équipe.
//
// 🔴 LE MONTANT ENCAISSÉ SE CALCULE ICI, sur la réservation relue en base
// (`resteAEncaisser`), jamais sur un nombre venu de l'écran. Et l'écriture ne
// passe que si la réservation est ENCORE « confirmée » : deux clics, ou le
// patron et un serveur en même temps, ne l'honorent qu'une fois.
//
// ⚠️ LA SUITE EST CELLE DU TABLEAU DE BORD : l'écran appelle ensuite
// `/api/fidelite/rdv-honore` et, si une commande est liée,
// `/api/commande/produits-remis`, les mêmes routes que le patron.

import { NextResponse } from 'next/server'
import { clientAdmin, refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { resteAEncaisser } from '@/lib/rdv-paiement'
import { champsEncaissement } from '@/lib/encaissement'

export const dynamic = 'force-dynamic'

// Ce que lit `resteAEncaisser`, et rien d'autre.
const COLONNES = 'id, statut, commande_id, prix_estime, acompte_montant, acompte_paye, acompte_paye_en_ligne, fidelite_remise, bon_cadeau_montant, abonnement_id, prestation:rdv_prestations(par_couverts)'

export async function POST(request) {
  try {
    const { rdv_id, encaissement = null } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const verdict = await gardeLigneEquipe(request, admin, 'rdv_reservations', rdv_id, 'agenda')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: rdv, error } = await admin.from('rdv_reservations').select(COLONNES).eq('id', rdv_id).maybeSingle()
    if (error) throw new Error(`lecture de la réservation : ${error.message}`)
    if (!rdv) return NextResponse.json({ ok: false, error: 'réservation introuvable' }, { status: 404 })
    if (rdv.statut !== 'confirme') return NextResponse.json({ ok: false, error: 'Cette réservation n’est plus en attente : elle a déjà été traitée.' }, { status: 409 })

    const { champs, refus: refusEncaissement } = champsEncaissement({ choix: encaissement, reste: resteAEncaisser(rdv) })
    if (refusEncaissement) return NextResponse.json({ ok: false, error: refusEncaissement }, { status: 400 })

    const { data: ecrit, error: errMaj } = await admin.from('rdv_reservations')
      .update({ statut: 'honore', ...(champs || {}) })
      .eq('id', rdv_id).eq('statut', 'confirme')
      .select('id, commande_id').maybeSingle()
    if (errMaj) return NextResponse.json({ ok: false, error: `réservation non mise à jour : ${errMaj.message}` }, { status: 500 })
    if (!ecrit) return NextResponse.json({ ok: false, error: 'Cette réservation vient d’être traitée par quelqu’un d’autre.' }, { status: 409 })

    await journaliserGeste(admin, verdict, {
      action: 'rdv_venu', cible_type: 'rdv', cible_id: rdv_id,
      details: { encaissement: champs?.encaisse_mode || null, montant: champs?.encaisse_montant ?? null },
    })
    return NextResponse.json({ ok: true, rdv_id, commande_id: ecrit.commande_id || null, encaisse: champs })
  } catch (e) {
    console.error('[equipe/rdv/venu] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
