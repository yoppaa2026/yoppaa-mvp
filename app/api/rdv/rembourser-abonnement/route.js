// POST /api/rdv/rembourser-abonnement   { abonnement_id, montant, moyen? }
//
// 🔴 AUCUNE ROUTE NE REMBOURSAIT UN ABONNEMENT (Abo-I1, audit du 03/10). La
// commerçante rendait l'argent depuis son tableau Stripe ou de la main à la
// main, Yoppaa n'en savait rien : le contrat restait actif, la cliente
// gardait ses séances, et l'export comptable comptait la vente entière.
//
// ✅ DÉCISIONS D'ALEX (04/10) :
//   • montant libre, plafonné au prix payé ; la part non utilisée est proposée ;
//   • rembourser RÉSILIE toujours (mêmes séances annulées que « Résilier ») ;
//   • payé au comptoir : le remboursement est NOTÉ (montant, moyen, date),
//     l'argent se rend de la main à la main ;
//   • le patron, ou un membre avec la case Argent ;
//   • un email à la cliente, et une contrepassation à l'export comptable.
//
// ⚠️ L'ORDRE : l'argent D'ABORD, la résiliation ENSUITE. Un remboursement
// refusé par Stripe ne laisse rien derrière lui (ni contrat résilié, ni
// séances annulées) : la commerçante réessaie. Une résiliation ratée après un
// remboursement réussi se DIT, et « Résilier » reste là pour la terminer.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe } from '@/lib/stripe'
import { refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { verdictRemboursementAbonnement, messageRefusRemboursement } from '@/lib/abonnements'
import { annulerLesSeancesDuContrat } from '@/lib/abonnement-resiliation-server'
import { seanceLisible } from '@/lib/attente-rdv'
import { emailAbonnementResilie, envoyerAuYopper } from '@/lib/resend'
import { lienFicheRdv } from '@/lib/lien-fiche'

export async function POST(request) {
  try {
    const { abonnement_id, montant, moyen } = await request.json().catch(() => ({}))
    if (!abonnement_id) return NextResponse.json({ ok: false, error: 'abonnement_id requis.' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ LA CASE ARGENT, comme la résiliation : rendre de l'argent est une
    // décision d'argent. Le patron et l'admin passent toujours.
    const verdict = await gardeLigneEquipe(request, supabase, 'abonnements', abonnement_id, 'argent')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: contrat, error: errC } = await supabase
      .from('abonnements')
      .select('id, statut, prix, paye, mode_paiement, stripe_payment_intent_id, rembourse_montant, client_prenom, client_email, formule:abonnement_formules(libelle), commercant:commercants(nom, slug, stripe_account_id)')
      .eq('id', abonnement_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (errC) return NextResponse.json({ ok: false, error: 'Lecture du contrat impossible.' }, { status: 500 })

    // La règle vit dans `lib/abonnements`, et le banc l'exécute.
    const regle = verdictRemboursementAbonnement(contrat, { montant, moyen })
    if (!regle.ok) {
      const status = regle.code === 'introuvable' ? 404 : regle.code === 'deja_rembourse' ? 409 : 400
      return NextResponse.json({ ok: false, code: regle.code, error: messageRefusRemboursement(regle.code, regle) }, { status })
    }

    // ⚠️ UN SEUL GAGNANT : le remboursement ne s'inscrit que sur un contrat
    // payé qui n'en porte encore aucun. Deux clics, deux onglets, ou le patron
    // et un membre à la même minute : un seul remboursement, un seul email.
    const { data: verrou, error: errV } = await supabase
      .from('abonnements')
      .update({ rembourse_montant: regle.montant, rembourse_le: new Date().toISOString(), rembourse_moyen: regle.moyen })
      .eq('id', abonnement_id)
      .eq('paye', true)
      .is('rembourse_montant', null)
      .select('id')
    if (errV) return NextResponse.json({ ok: false, error: 'Le remboursement n’a pas pu être enregistré. Rien n’a été rendu.' }, { status: 500 })
    if (!verrou || verrou.length === 0) {
      return NextResponse.json({ ok: false, code: 'deja_rembourse', error: messageRefusRemboursement('deja_rembourse') }, { status: 409 })
    }

    // ─── L'argent ─────────────────────────────────────────────────────────
    // Payé en ligne : Stripe rend sur la carte, sur le compte du commerce
    // (charge directe). ⚠️ UNE CLÉ PAR CONTRAT ET PAR MONTANT : Stripe ne rend
    // ce montant qu'une fois, même si la requête part deux fois.
    if (regle.enLigne) {
      let refundId = null
      try {
        requireStripe()
        if (!contrat.commercant?.stripe_account_id) throw new Error('compte Stripe du commerce absent')
        const refund = await stripe.refunds.create({
          payment_intent: contrat.stripe_payment_intent_id,
          amount: Math.round(regle.montant * 100),
          reason: 'requested_by_customer',
          metadata: { yoppaa_abonnement_id: contrat.id },
        }, { stripeAccount: contrat.commercant.stripe_account_id, idempotencyKey: `abo-remb-${contrat.id}-${Math.round(regle.montant * 100)}` })
        refundId = refund.id
      } catch (e) {
        console.error('[rembourser-abonnement] refund KO', e?.message, { abonnementId: contrat.id })
        // ⚠️ RIEN N'EST PARTI : on lève le verrou, le contrat redevient
        // remboursable et rien n'est résilié.
        await supabase.from('abonnements')
          .update({ rembourse_montant: null, rembourse_le: null, rembourse_moyen: null })
          .eq('id', abonnement_id)
          .is('stripe_refund_id', null)
        return NextResponse.json({ ok: false, code: 'stripe', error: messageRefusRemboursement('stripe') }, { status: 502 })
      }
      const { error: errId } = await supabase.from('abonnements').update({ stripe_refund_id: refundId }).eq('id', abonnement_id)
      // La trace seulement : le webhook `charge.refunded` la réécrira.
      if (errId) console.warn('[rembourser-abonnement] identifiant du remboursement non écrit', errId.message)
    }

    // ─── La résiliation, qui suit toujours ────────────────────────────────
    let annulees = []
    let filePrevenue = 0
    let partiel = false
    if (contrat.statut !== 'resilie') {
      const { data: bascule, error: errU } = await supabase
        .from('abonnements')
        .update({ statut: 'resilie' })
        .eq('id', abonnement_id)
        .eq('statut', contrat.statut)
        .select('id')
      if (errU) partiel = true
      // Une bascule perdue : une résiliation simultanée s'occupe des séances.
      else if (bascule && bascule.length > 0) {
        const seances = await annulerLesSeancesDuContrat(supabase, abonnement_id)
        if (!seances.ok) partiel = true
        annulees = seances.annulees
        filePrevenue = seances.filePrevenue
      }
    }

    // ⚠️ L'EMAIL DIT LE MONTANT ET LE MOYEN, et ce qui est réellement annulé.
    let email = 'sans_email'
    if (contrat.client_email) {
      const html = emailAbonnementResilie({
        yopper_prenom: contrat.client_prenom,
        commercant_nom: contrat.commercant?.nom || 'Le commerce',
        formule: contrat.formule?.libelle || null,
        seances: annulees.map(s => seanceLisible(s.date_rdv, s.heure_debut)).filter(Boolean),
        fiche_url: contrat.commercant?.slug ? lienFicheRdv(contrat.commercant.slug) : null,
        remboursement: { montant: regle.montant, moyen: regle.moyen },
      })
      const envoi = await envoyerAuYopper({ to: contrat.client_email, subject: `Ton abonnement chez ${contrat.commercant?.nom || 'ton commerce'} est remboursé`, html })
      email = envoi?.ok ? 'envoye' : 'echec'
      if (!envoi?.ok) console.error('[rembourser-abonnement] email KO', envoi?.error)
    }

    await journaliserGeste(supabase, verdict, {
      action: 'abonnement_rembourse', cible_type: 'abonnement', cible_id: abonnement_id,
      details: { montant: regle.montant, moyen: regle.moyen, seances_annulees: annulees.length },
    })

    return NextResponse.json({
      ok: true, montant: regle.montant, moyen: regle.moyen,
      seances_annulees: annulees.length, file_prevenue: filePrevenue, email,
      ...(partiel ? { partiel: true, error: 'L’argent est rendu, mais la résiliation n’a pas abouti : appuie sur « Résilier » pour la terminer.' } : {}),
    })
  } catch (e) {
    console.error('[rembourser-abonnement]', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 })
  }
}
