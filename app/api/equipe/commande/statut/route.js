// POST /api/equipe/commande/statut
// Body : { commande_id, statut: 'en_preparation' | 'pret' | 'recupere', encaissement }
//
// UNE COMMANDE AVANCE D'UN PAS (29/09, étape 3). Le geste que le patron écrit
// depuis son navigateur passe ici par le serveur pour l'équipe.
//
// 🔴 UN SEUL PAS EN AVANT (`transitionPermise`), et l'écriture ne passe que si
// la commande est ENCORE dans le statut lu : un serveur et le patron qui
// cliquent ensemble ne la font pas avancer deux fois.
//
// 🔴 LA REMISE D'UNE COMMANDE PAS ENCORE PAYÉE DEMANDE COMMENT ELLE L'A ÉTÉ,
// comme sur le tableau de bord. Le montant vient de `resteAEncaisserCommande`
// sur la commande relue en base.
//
// ⚠️ LA SUITE EST CELLE DU TABLEAU DE BORD : l'écran appelle ensuite
// `/api/commande/push-statut`, `/api/emails/commande-prete` ou
// `/api/fidelite/crediter`, les mêmes routes que le patron.

import { NextResponse } from 'next/server'
import { clientAdmin, refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { resteAEncaisserCommande } from '@/lib/rdv-paiement'
import { champsEncaissement } from '@/lib/encaissement'
import { transitionPermise } from '@/lib/statuts-commande'

export const dynamic = 'force-dynamic'

// Ce que lisent la transition et `resteAEncaisserCommande`, et rien d'autre.
const COLONNES = 'id, statut, mode_retrait, total, paye_en_ligne, bon_cadeau_montant, fidelite_remise, encaisse_mode'

export async function POST(request) {
  try {
    const { commande_id, statut, encaissement = null } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const verdict = await gardeLigneEquipe(request, admin, 'commandes', commande_id, 'commandes')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: c, error } = await admin.from('commandes').select(COLONNES).eq('id', commande_id).maybeSingle()
    if (error) throw new Error(`lecture de la commande : ${error.message}`)
    if (!c) return NextResponse.json({ ok: false, error: 'commande introuvable' }, { status: 404 })
    if (!transitionPermise(c, statut)) {
      return NextResponse.json({ ok: false, error: 'Cette commande ne peut pas passer à ce statut maintenant.' }, { status: 409 })
    }

    let champs = null
    if (statut === 'recupere' && !c.encaisse_mode) {
      const r = champsEncaissement({ choix: encaissement, reste: resteAEncaisserCommande(c) })
      if (r.refus) return NextResponse.json({ ok: false, error: r.refus }, { status: 400 })
      champs = r.champs
    }

    const { data: ecrit, error: errMaj } = await admin.from('commandes')
      .update({ statut, ...(champs || {}) })
      .eq('id', commande_id).eq('statut', c.statut)
      .select('id').maybeSingle()
    if (errMaj) return NextResponse.json({ ok: false, error: `commande non mise à jour : ${errMaj.message}` }, { status: 500 })
    if (!ecrit) return NextResponse.json({ ok: false, error: 'Cette commande vient d’être traitée par quelqu’un d’autre.' }, { status: 409 })

    await journaliserGeste(admin, verdict, {
      action: 'commande_statut', cible_type: 'commande', cible_id: commande_id,
      details: { de: c.statut, vers: statut, encaissement: champs?.encaisse_mode || null, montant: champs?.encaisse_montant ?? null },
    })
    return NextResponse.json({ ok: true, commande_id, statut, encaisse: champs })
  } catch (e) {
    console.error('[equipe/commande/statut] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
