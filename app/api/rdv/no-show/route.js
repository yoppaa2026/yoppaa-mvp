// POST /api/rdv/no-show
//
// 🔴 CETTE ROUTE N'EXISTAIT PAS, ET LE NO-SHOW S'ÉCRIVAIT DEPUIS LE NAVIGATEUR.
//
// Le tableau de bord faisait un simple `update` du statut, puis envoyait un
// email. Tant que le geste ne touchait à aucun argent, ça passait. Il en touche
// maintenant : décision d'Alex du 30/08 au soir, **la garantie du commerçant ne
// porte que sur l'acompte dû, le reste est restitué**.
//
// ⚠️ ET UNE RESTITUTION EST UNE ÉCRITURE D'ARGENT : elle ne peut pas partir du
// navigateur d'un commerçant, où rien ne prouve qui appelle. C'est exactement
// le trou fermé le 29/08 sur l'annulation par le commerçant, et le no-show en
// était le dernier frère.
//
// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE COMMERÇANT GARDE, ET POURQUOI
//
// Un client qui posait 40 € de bon cadeau sur une prestation à 60 € avec 50 %
// d'acompte perdait les 40 € s'il ne venait pas. La garantie ne valait pourtant
// que 25 € : quinze euros de trop, et personne ne les lui rendait.
//
//   • L'ARGENT COMPTANT s'impute en premier : il est déjà chez le commerçant.
//   • LE BON ne comble que ce qui manque pour atteindre la garantie.
//   • LE RESTE DU BON revient sur le bon, utilisable tout de suite.
//   • LA RÉCOMPENSE revient toujours : ce n'est pas une garantie, c'est une
//     remise que le commerçant a consentie et qui ne lui a rien coûté.
//   • LES PRODUITS NE BOUGENT PAS. Un no-show n'annule pas la commande : la
//     marchandise est vendue, payée, et attend son client au comptoir.
//
// ⚠️ ET L'ACOMPTE ENCAISSÉ N'EST JAMAIS REMBOURSÉ. Le créneau a été bloqué pour
// quelqu'un qui n'est pas venu : c'est précisément ce que l'acompte garantit.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { restitutionNoShow } from '@/lib/rdv-paiement'
import { rendreAvantagesRdv } from '@/lib/rdv-annulation-server'
import { annulerPush } from '@/lib/onesignal'

export async function POST(request) {
  try {
    const { rdv_id } = await request.json()
    if (!rdv_id) {
      return NextResponse.json({ ok: false, error: 'rdv_id requis.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const verdict = await gardeSurLigne(request, supabase, 'rdv_reservations', rdv_id)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    // ⚠️ LES SEPT COLONNES SONT OBLIGATOIRES. Absente d'un `select`, chacune
    // vaut `undefined`, `Number(undefined || 0)` vaut zéro, et la restitution
    // se ferait au mauvais montant SANS QU'AUCUNE ERREUR NE SE LÈVE. C'est le
    // défaut le plus fréquent de ce projet.
    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, statut, acompte_paye, acompte_paye_en_ligne, acompte_montant, acompte_du,
        bon_cadeau_id, bon_cadeau_montant, fidelite_recompense_id, fidelite_remise,
        rappel_push_id, commercant_id
      `)
      .eq('id', rdv_id)
      .is('deleted_at', null)
      .single()

    if (!rdv) return NextResponse.json({ ok: false, error: 'RDV introuvable.' }, { status: 404 })

    // ⚠️ ON NE MARQUE ABSENT QUE CE QUI POUVAIT L'ÊTRE. Un rendez-vous annulé
    // n'a pas été manqué, il n'a pas eu lieu : y appliquer la règle de garantie
    // ferait garder au commerçant un acompte qu'il vient de rembourser.
    if (rdv.statut === 'annule_client' || rdv.statut === 'annule_commercant') {
      return NextResponse.json({
        ok: false,
        error: 'Ce rendez-vous est annulé : il ne peut pas être marqué absent.',
      }, { status: 400 })
    }

    // Idempotence : rejouer un no-show ne restitue pas deux fois. Les deux
    // gestes le sont aussi par construction, mais la garde de statut évite même
    // d'y toucher, et surtout de renvoyer des montants une seconde fois.
    if (rdv.statut === 'no_show') {
      return NextResponse.json({ ok: true, deja_note: true, rdv_id: rdv.id })
    }

    // ─── LE PARTAGE, calculé par le module qui porte les règles d'argent ────
    const part = restitutionNoShow(rdv)

    // ⚠️ ON ÉCRIT LE STATUT AVANT DE RESTITUER, et c'est l'inverse de
    // l'annulation. Là-bas on rendait d'abord parce qu'un remboursement Stripe
    // réveille un webhook concurrent ; ici il n'y a aucun remboursement, donc
    // aucune course, et le statut sert de verrou contre un double clic.
    const { data: basculees, error: errUpd } = await supabase
      .from('rdv_reservations')
      .update({ statut: 'no_show', motif_annulation: 'commercant' })
      .eq('id', rdv.id)
      .neq('statut', 'no_show')
      .select('id')
    if (errUpd) {
      console.error('[rdv/no-show] UPDATE KO', errUpd)
      return NextResponse.json({ ok: false, error: 'Erreur mise à jour du rendez-vous.' }, { status: 500 })
    }
    // La bascule n'a rien changé : quelqu'un est passé entre-temps.
    if ((basculees || []).length === 0) {
      return NextResponse.json({ ok: true, deja_note: true, rdv_id: rdv.id })
    }

    // ─── CE QUI DÉPASSE LA GARANTIE REVIENT ────────────────────────────────
    //
    // ⚠️ LE MONTANT PASSÉ EST LA PART RESTITUÉE, PAS LE BON ENTIER. Le module
    // recrédite ce qu'on lui donne : lui passer `bon_cadeau_montant` rendrait
    // au client une garantie que le commerçant a le droit de garder.
    const rendu = await rendreAvantagesRdv(supabase, {
      ou: 'rdv/no-show',
      bonId: part.bonRestitue > 0 ? rdv.bon_cadeau_id : null,
      bonMontant: part.bonRestitue,
      recompenseId: rdv.fidelite_recompense_id,
      recompenseMontant: part.recompenseRendue,
      refs: { rdv_id: rdv.id },
    })

    // Le rappel de la veille n'a plus lieu d'être.
    if (rdv.rappel_push_id) annulerPush(rdv.rappel_push_id).catch(() => {})

    return NextResponse.json({
      ok: true,
      rdv_id: rdv.id,
      garantie: part.garantie,
      garantie_connue: part.connu,
      garde_en_caisse: part.gardeEnCaisse,
      garde_sur_bon: part.gardeSurBon,
      bon_restitue: rendu.bon,
      recompense_rendue: rendu.recompense,
    })
  } catch (e) {
    console.error('[rdv/no-show]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
