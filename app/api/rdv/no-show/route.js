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
import { rendreAvantagesRdv, lignesBonsDe } from '@/lib/rdv-annulation-server'
import { repartirRestitution } from '@/lib/bons-cadeaux'
import { annulerPush } from '@/lib/onesignal'
import { stripe, requireStripe } from '@/lib/stripe'

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

    // ⚠️ CHACUNE DE CES COLONNES EST OBLIGATOIRE. Absente d'un `select`, elle
    // vaut `undefined`, `Number(undefined || 0)` vaut zéro, et la restitution
    // se ferait au mauvais montant SANS QU'AUCUNE ERREUR NE SE LÈVE. C'est le
    // défaut le plus fréquent de ce projet.
    //
    // 🔴 LES TROIS DERNIÈRES SONT ARRIVÉES AVEC LE REMBOURSEMENT (31/08).
    // `stripe_payment_intent_id` désigne le paiement à rembourser,
    // `stripe_refund_id` empêche de rembourser deux fois, et le compte connecté
    // du commerçant est l'endroit OÙ le remboursement se fait. Sans elles, la
    // route aurait calculé une restitution qu'elle n'aurait jamais versée.
    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, statut, acompte_paye, acompte_paye_en_ligne, acompte_montant, acompte_du,
        bon_cadeau_id, bon_cadeau_montant, bons_utilises, fidelite_recompense_id, fidelite_remise,
        rappel_push_id, commercant_id,
        stripe_payment_intent_id, stripe_refund_id,
        commercant:commercants(stripe_account_id)
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

    // ⚠️ ON ÉCRIT LE STATUT D'ABORD, ET IL SERT DE VERROU contre le double clic.
    // Le remboursement, lui, vient EN DERNIER : c'est la règle du 30/08 au soir,
    // on rend les avantages AVANT de rembourser, parce qu'un remboursement
    // Stripe réveille un webhook concurrent qui refait les mêmes gestes. Dans ce
    // sens-là, le webhook redevient un vrai secours ; dans l'autre, il passe
    // devant nous.
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
    //
    // ⚠️ ET LA PART SE RÉPARTIT SUR LES BONS QUI ONT PAYÉ, en commençant par le
    // dernier servi : c'est le miroir du débit, donc l'argent revient sur le bon
    // qui expire le plus tard. La reposer entière sur le premier créerait de
    // l'argent d'un côté et en détruirait de l'autre.
    const rendu = await rendreAvantagesRdv(supabase, {
      ou: 'rdv/no-show',
      bonsUtilises: repartirRestitution(lignesBonsDe(rdv), part.bonRestitue),
      recompenseId: rdv.fidelite_recompense_id,
      recompenseMontant: part.recompenseRendue,
      refs: { rdv_id: rdv.id },
    })

    // ─── ET CE QUI DÉPASSE LA GARANTIE SUR LA CARTE REPART AUSSI ───────────
    //
    // 🔴 CETTE ROUTE NE REMBOURSAIT RIEN, ET ÇA SUFFISAIT TANT QUE L'ENCAISSÉ
    // NE POUVAIT PAS DÉPASSER LA GARANTIE. Le paiement d'avance change ça : sans
    // acompte exigé, la garantie vaut zéro et le client a pourtant payé le prix
    // entier. Calculer une restitution sans la verser, ce serait annoncer un
    // geste qu'on ne fait pas.
    //
    // ⚠️ LE MONTANT EST OBLIGATOIRE ICI, contrairement aux deux annulations qui
    // remboursent la totalité du paiement. Un `refunds.create` sans `amount`
    // rend TOUT : le commerçant perdrait la garantie qu'il a le droit de garder.
    let refundId = null
    let refundError = null
    const aPayeEnLigne = Boolean(rdv.acompte_paye_en_ligne) && !!rdv.stripe_payment_intent_id

    if (part.carteRestituee > 0 && aPayeEnLigne && !rdv.stripe_refund_id) {
      if (!rdv.commercant?.stripe_account_id) {
        refundError = 'Compte Stripe indisponible'
      } else {
        try {
          requireStripe()
          const refund = await stripe.refunds.create({
            payment_intent: rdv.stripe_payment_intent_id,
            amount: Math.round(part.carteRestituee * 100),
            reason: 'requested_by_customer',
            metadata: { yoppaa_rdv_id: rdv.id, yoppaa_motif: 'no_show_au_dela_garantie' },
          }, { stripeAccount: rdv.commercant.stripe_account_id })
          refundId = refund.id
          await supabase.from('rdv_reservations').update({
            stripe_refund_id: refund.id,
            stripe_refund_amount: part.carteRestituee,
            stripe_refund_date: new Date().toISOString(),
          }).eq('id', rdv.id)
        } catch (e) {
          // ⚠️ ON LE DIT. Un remboursement raté qui se tait, c'est de l'argent
          // qui reste chez le commerçant pendant que l'écran annonce l'inverse.
          console.error('[rdv/no-show] remboursement KO', e?.message, { rdvId: rdv.id })
          refundError = e?.message || 'Remboursement Stripe échoué'
        }
      }
    }

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
      // ⚠️ ON REND CE QUI EST DÛ **ET** CE QUI EST RÉELLEMENT PARTI. Les deux
      // coïncident presque toujours ; le jour où ils divergent, c'est
      // exactement ce que l'écran doit pouvoir dire.
      carte_a_restituer: part.carteRestituee,
      carte_restituee: refundId ? part.carteRestituee : 0,
      remboursement_erreur: refundError,
    })
  } catch (e) {
    console.error('[rdv/no-show]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
