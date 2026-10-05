// POST /api/commande/annuler-commercant
// Body : { commande_id, motif? }
//
// « Annuler et rembourser » : le COMMERCE annule une commande (rupture,
// fermeture imprévue, livreur indisponible, client injoignable après une
// livraison manquée). Audit livraison I5, décision d'Alex du 05/10.
//
// 🔴 CE GESTE N'EXISTAIT PAS. Le commerçant n'avait que le tableau Stripe pour
// rembourser : la commande devenait alors « Annulée par client » par le
// webhook, sans email, sans stock rendu, et l'historique du client mentait.
//
// ✅ MÊME ORDRE QUE L'ANNULATION PAR LE CLIENT (lib/commande-annulation-server) :
//   1. la commande bascule en `annulee_commercant`, SEULEMENT si elle est
//      encore en cours ; zéro ligne = quelqu'un est passé avant, on s'arrête ;
//   2. la carte est remboursée de ce qu'elle a payé (montant lu chez Stripe,
//      clé d'idempotence) ; si Stripe refuse, la bascule est DÉFAITE ;
//   3. stock, bons, récompense, rappel et place retenue reviennent ;
//   4. le client reçoit l'email « le commerce a dû annuler », avec le mot du
//      commerce s'il en a écrit un.
//
// ⚠️ LA CASE « ARGENT » : rembourser est une décision d'argent, comme débiter
// une garantie. Le patron et l'admin passent toujours.

import { NextResponse } from 'next/server'
import { clientAdmin, refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { requireStripe } from '@/lib/stripe'
import { rembourserCarteCommande, effetsAnnulationCommande, prevenirClientAnnulationCommerce } from '@/lib/commande-annulation-server'

export const dynamic = 'force-dynamic'

// Ce que le commerce peut encore annuler : une commande payée (ou à payer sur
// place) qui n'est ni remise, ni déjà close.
const ANNULABLES = ['en_attente', 'en_preparation', 'pret']
const MOTIF_MAX = 300

export async function POST(request) {
  try {
    const { commande_id, motif = null } = await request.json().catch(() => ({}))
    if (!commande_id) return NextResponse.json({ ok: false, error: 'commande_id requis' }, { status: 400 })
    const motifPropre = motif ? String(motif).trim().slice(0, MOTIF_MAX) || null : null

    const admin = clientAdmin()
    const verdict = await gardeLigneEquipe(request, admin, 'commandes', commande_id, 'argent')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: cmd, error: errLu } = await admin.from('commandes')
      .select(`
        id, statut, mode_retrait, paye_en_ligne, total, stripe_payment_intent_id,
        client_email, client_nom, numero_commande, numero_prefixe, rappel_push_id,
        bon_cadeau_montant, bons_utilises, fidelite_recompense_id, fidelite_remise,
        rdv_reservation_id,
        commercant:commercants(id, nom, stripe_account_id, categorie)
      `)
      .eq('id', commande_id).maybeSingle()
    if (errLu) throw new Error(`lecture de la commande : ${errLu.message}`)
    if (!cmd) return NextResponse.json({ ok: false, error: 'Commande introuvable.' }, { status: 404 })

    if (!ANNULABLES.includes(cmd.statut)) {
      return NextResponse.json({ ok: false, code: 'refuse', error: 'Cette commande est déjà remise ou close : elle ne peut plus être annulée ici.' }, { status: 409 })
    }
    // Elle partage le paiement d'un rendez-vous : rembourser ce paiement
    // rendrait aussi l'acompte. Elle suit l'annulation du rendez-vous.
    if (cmd.rdv_reservation_id) {
      return NextResponse.json({ ok: false, code: 'refuse', error: 'Ces produits sont liés à un rendez-vous : annule le rendez-vous, ils seront annulés avec lui.' }, { status: 409 })
    }
    const remboursable = !!(cmd.paye_en_ligne && cmd.stripe_payment_intent_id)
    if (remboursable) {
      requireStripe()
      if (!cmd.commercant?.stripe_account_id) {
        return NextResponse.json({ ok: false, error: 'Ton compte Stripe est indisponible : le remboursement ne peut pas partir. Rien n’a été annulé.' }, { status: 500 })
      }
    }

    // ─── 1. La bascule, un seul gagnant ─────────────────────────────────────
    const { data: basculees, error: errB } = await admin.from('commandes')
      .update({ statut: 'annulee_commercant', annulee_at: new Date().toISOString(), annulation_motif: 'commercant' })
      .eq('id', cmd.id)
      .in('statut', ANNULABLES)
      .select('id')
    if (errB) return NextResponse.json({ ok: false, error: `Annulation non enregistrée : ${errB.message}` }, { status: 500 })
    if (!basculees || basculees.length === 0) {
      return NextResponse.json({ ok: false, code: 'deja_fait', error: 'Cette commande vient de changer de statut. Recharge, puis recommence si besoin.' }, { status: 409 })
    }

    // ─── 2. L'argent ────────────────────────────────────────────────────────
    let rembourse = 0
    if (remboursable) {
      try {
        const r = await rembourserCarteCommande({ commande: cmd, compteStripe: cmd.commercant.stripe_account_id, origine: 'commercant' })
        rembourse = r.montantCentimes / 100
      } catch (e) {
        console.error('[commande/annuler-commercant] refund Stripe KO, annulation défaite', e?.message, { commande_id: cmd.id })
        const { error: errRetour } = await admin.from('commandes')
          .update({ statut: cmd.statut, annulee_at: null, annulation_motif: null })
          .eq('id', cmd.id).eq('statut', 'annulee_commercant')
        if (errRetour) console.error('[commande/annuler-commercant] 🔴 annulation NON défaite après refus Stripe', errRetour.message, { commande_id: cmd.id })
        return NextResponse.json({ ok: false, error: 'Stripe n’a pas pu lancer le remboursement : la commande n’est PAS annulée. Réessaie dans un instant.' }, { status: 502 })
      }
    }

    // ─── 3. Ce que l'annulation rend ────────────────────────────────────────
    await effetsAnnulationCommande(admin, cmd, '[commande/annuler-commercant]')

    // ─── 4. Le client est prévenu ───────────────────────────────────────────
    const emailEnvoye = await prevenirClientAnnulationCommerce(admin, cmd.id, { motif: motifPropre })

    await journaliserGeste(admin, verdict, {
      action: 'commande_annulee_commerce', cible_type: 'commande', cible_id: cmd.id,
      details: { de: cmd.statut, rembourse, motif: motifPropre },
    })

    return NextResponse.json({
      ok: true,
      champs: { statut: 'annulee_commercant', annulation_motif: 'commercant' },
      rembourse,
      email_client: emailEnvoye,
    })
  } catch (e) {
    console.error('[commande/annuler-commercant] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
