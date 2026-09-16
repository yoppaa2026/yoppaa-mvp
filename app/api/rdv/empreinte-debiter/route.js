// POST /api/rdv/empreinte-debiter
//
// LE RESTAURATEUR FACTURE UNE TABLE QUI N'EST PAS VENUE.
//
// 🔴 UN GESTE SÉPARÉ DE « NO-SHOW », ET C'EST DÉLIBÉRÉ. Marquer une table
// absente est un geste d'agenda ; débiter une carte est un geste d'argent. Les
// confondre, c'est prélever chez un client en rangeant son agenda le lendemain
// matin. Le restaurateur dit donc deux fois oui, et la seconde fois il voit le
// montant.
//
// ⚠️ ET C'EST LUI QUI DÉCIDE, JAMAIS UN AUTOMATISME (Alex, 14/09) : il suffirait
// d'oublier de pointer une table présente pour débiter quelqu'un qui était là.
//
// ⚠️ LA FENÊTRE SE FERME À LA FIN DU LENDEMAIN. Un prélèvement découvert trois
// semaines après un dîner est une contestation de carte quasi certaine, et
// c'est le nom du restaurant qui apparaît dessus.
//
// 🔴 ET LE MONTANT EST VÉRIFIÉ DEUX FOIS, CONTRE DEUX SOURCES. La base est
// verrouillée par un trigger depuis MIGRATION_EMPREINTE_VERROU, mais on ne
// prélève pas sur la foi d'une seule source : le montant enregistré doit être
// celui que Stripe a gardé dans les métadonnées du SetupIntent, c'est-à-dire
// celui que le client a lu au moment de donner sa carte. Si les deux divergent,
// on ne débite RIEN et on le dit.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { stripe, requireStripe, calculApplicationFee } from '@/lib/stripe'
import { raisonDebitImpossible } from '@/lib/empreinte-table'

// Ce qu'on répond au commerçant selon ce qui bloque. Le message dit ce qu'il
// peut faire, pas ce que le code a constaté.
const MESSAGES = {
  aucune_empreinte: 'Cette réservation n’a pas d’empreinte bancaire : il n’y a rien à facturer.',
  deja_debitee: 'Cette table a déjà été facturée.',
  date_illisible: 'La date de cette réservation est illisible, impossible de facturer.',
  service_pas_commence: 'Le service n’a pas encore commencé : tu ne peux pas facturer une table qui peut encore arriver.',
  fenetre_fermee: 'Le délai est passé : une empreinte ne se facture plus au-delà de la fin du lendemain.',
  // 🔴 G7, 15/09 : une table honorée, annulée à temps ou pas encore pointée
  // n'est jamais facturable.
  pas_absente: 'Cette table n’est pas déclarée absente : passe-la d’abord en « No-show ». On ne facture jamais une table venue ou annulée à temps.',
}

export async function POST(request) {
  try {
    requireStripe()
    const { rdv_id } = await request.json()
    if (!rdv_id) return NextResponse.json({ ok: false, error: 'rdv_id requis.' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ LA MÊME GARDE QUE LE NO-SHOW : elle prouve que celui qui appelle est
    // bien le commerçant de CETTE ligne. Sans elle, un identifiant suffirait à
    // débiter la table d'un autre.
    const verdict = await gardeSurLigne(request, supabase, 'rdv_reservations', rdv_id)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    // ⚠️ CHACUNE DE CES COLONNES EST OBLIGATOIRE : absente du select, elle vaut
    // `undefined`, et le débit partirait au mauvais montant sans qu'aucune
    // erreur ne se lève. Le défaut le plus fréquent de ce projet.
    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, statut, annulation_tardive, date_rdv, heure_debut, couverts, client_prenom, client_nom,
        empreinte_statut, empreinte_montant, empreinte_setup_intent_id,
        empreinte_payment_method_id, empreinte_customer_id, empreinte_debit_pi_id,
        commercant_id,
        commercant:commercants(id, nom, stripe_account_id, stripe_account_charges_enabled)
      `)
      .eq('id', rdv_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!rdv) return NextResponse.json({ ok: false, error: 'Réservation introuvable.' }, { status: 404 })

    const raison = raisonDebitImpossible(rdv, new Date())
    if (raison) {
      return NextResponse.json({ ok: false, code: raison, error: MESSAGES[raison] || 'Facturation impossible.' }, { status: 409 })
    }

    const compte = rdv.commercant?.stripe_account_id
    if (!compte || rdv.commercant?.stripe_account_charges_enabled === false) {
      return NextResponse.json({ ok: false, error: 'Ton compte Stripe n’est pas prêt : la facturation est impossible pour le moment.' }, { status: 400 })
    }

    // 🔴 LA DEUXIÈME SOURCE. On relit le SetupIntent chez Stripe et on compare
    // ce qu'il garde au montant enregistré. Les métadonnées d'un SetupIntent ne
    // sont pas modifiables depuis le tableau de bord du commerçant : c'est donc
    // la trace du montant que le client a accepté.
    let montantStripe = null
    try {
      // 🔴 LE COMPTE EN TROISIÈME ARGUMENT (16/09) : `retrieve(id, params,
      // options)` est positionnel. En deuxième, `{ stripeAccount }` part comme
      // paramètre de requête et Stripe refuse. Cette route aurait donc répondu
      // « la garantie est introuvable chez Stripe » sur CHAQUE no-show, alors
      // que la garantie existait. Frère exact du défaut du webhook, trouvé en
      // cherchant les autres appels du même genre.
      const si = await stripe.setupIntents.retrieve(rdv.empreinte_setup_intent_id, undefined,
        { stripeAccount: compte })
      montantStripe = Number(si?.metadata?.empreinte_montant)
    } catch (e) {
      console.error('[empreinte-debiter] SetupIntent illisible', { rdvId: rdv.id, message: e?.message })
      return NextResponse.json({ ok: false, error: 'La garantie de cette table est introuvable chez Stripe. Rien n’a été facturé.' }, { status: 502 })
    }
    const montant = Number(rdv.empreinte_montant)
    if (!(montantStripe > 0) || Math.abs(montantStripe - montant) > 0.009) {
      console.error('[empreinte-debiter] montant divergent', { rdvId: rdv.id, base: montant, stripe: montantStripe })
      return NextResponse.json({
        ok: false,
        error: 'Le montant garanti ne correspond pas à ce qui a été accepté par le client. Rien n’a été facturé.',
      }, { status: 409 })
    }

    const cents = Math.round(montant * 100)

    let pi = null
    try {
      // ⚠️ `off_session: true` ET `confirm: true` : le client n'est pas là. Le
      // mandat obtenu à l'enregistrement de la carte est ce qui rend ce débit
      // possible sans nouvelle authentification.
      // ⚠️ ET UNE CLÉ D'IDEMPOTENCE ASSISE SUR LA RÉSERVATION : deux clics sur
      // le bouton, ou un rejeu réseau, ne débitent qu'une fois.
      pi = await stripe.paymentIntents.create({
        amount: cents,
        currency: 'eur',
        customer: rdv.empreinte_customer_id,
        payment_method: rdv.empreinte_payment_method_id,
        off_session: true,
        confirm: true,
        application_fee_amount: calculApplicationFee(cents, rdv.commercant),
        description: `Table non honorée du ${rdv.date_rdv} à ${String(rdv.heure_debut).slice(0, 5)}`,
        metadata: { yoppaa_rdv_id: rdv.id, yoppaa_motif: 'empreinte_no_show' },
      }, {
        stripeAccount: compte,
        idempotencyKey: `empreinte-${rdv.id}`,
      })
    } catch (e) {
      // 🔴 UN DÉBIT HORS SESSION PEUT ÊTRE REFUSÉ : carte expirée, fonds
      // insuffisants, ou banque qui redemande une authentification que
      // personne ne peut donner puisque le client n'est pas là. On l'écrit, on
      // le dit, et on ne prétend pas avoir encaissé.
      const message = e?.message || 'refus de la banque'
      await supabase.from('rdv_reservations')
        .update({ empreinte_statut: 'echouee', empreinte_debit_erreur: message.slice(0, 480) })
        .eq('id', rdv.id)
      console.error('[empreinte-debiter] débit refusé', { rdvId: rdv.id, message })
      return NextResponse.json({
        ok: false,
        code: 'debit_refuse',
        error: `La banque a refusé : ${message}. Rien n’a été facturé, et la table reste marquée comme non honorée.`,
      }, { status: 402 })
    }

    // ⚠️ ON ÉCRIT APRÈS STRIPE, JAMAIS AVANT : une ligne qui dit « débitée »
    // alors que rien n'est parti, c'est un restaurateur qui attend un virement
    // qui n'arrivera pas.
    const { error: erreurEcriture } = await supabase.from('rdv_reservations')
      .update({
        empreinte_statut: 'debitee',
        empreinte_debit_pi_id: pi.id,
        empreinte_debit_montant: montant,
        empreinte_debit_at: new Date().toISOString(),
        empreinte_debit_erreur: null,
      })
      .eq('id', rdv.id)

    if (erreurEcriture) {
      // 🔴 L'ARGENT EST PARTI ET LA LIGNE NE LE SAIT PAS. Ça ne se tait pas :
      // sans cette trace, un second clic reprendrait de l'argent, et seule la
      // clé d'idempotence l'en empêcherait.
      console.error('[empreinte-debiter] DÉBIT RÉUSSI MAIS NON ENREGISTRÉ', { rdvId: rdv.id, pi: pi.id, message: erreurEcriture.message })
    }

    console.info('[empreinte-debiter] table facturée', { rdvId: rdv.id, pi: pi.id, montant })
    return NextResponse.json({ ok: true, montant, payment_intent_id: pi.id, enregistre: !erreurEcriture })
  } catch (e) {
    console.error('[empreinte-debiter] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || 'erreur serveur' }, { status: 500 })
  }
}
