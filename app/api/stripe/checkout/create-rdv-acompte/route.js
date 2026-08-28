// POST /api/stripe/checkout/create-rdv-acompte
//
// Crée une Stripe Checkout Session pour le paiement d'un acompte RDV par un Yopper.
//
// Flow attendu (Yopper côté /commander/rdv/[slug] étape 4) :
//   1. Yopper a rempli ses coords + RGPD + cliqué "Confirmer mon RDV"
//   2. Si commercant.rdv_acompte_en_ligne_actif && prestation.acompte_pourcent > 0 :
//      - FE POST sur cette route avec les données RDV (commercant, prestation, créneau, client)
//      - Backend valide (overlap, horaires, etc.) puis crée une Checkout Session :
//        * payment_intent_data.application_fee_amount: 0 (memory: zéro commission)
//        * payment_intent_data.transfer_data.destination: commercant.stripe_account_id
//        * metadata: yoppaa_kind=rdv_acompte + payload RDV complet (pour webhook)
//      - Returns: { url: session.url }
//   3. FE redirect window.location = session.url → Stripe Checkout
//   4. Yopper paie → success_url retour → webhook payment_intent.succeeded
//   5. Webhook handler crée le RDV en DB avec acompte_paye_en_ligne=true
//
// IMPORTANT : le RDV n'est PAS encore créé à ce moment. Il est créé uniquement
// quand le paiement réussit (côté webhook). Ça évite les RDV fantômes en cas
// d'abandon de paiement. Tradeoff : si webhook fail, RDV non créé → on doit
// retry côté webhook handler.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG, PAYMENT_KIND, buildPaymentMetadata, calculApplicationFee } from '@/lib/stripe'
import { appliquerRecompenseAvantBon } from '@/lib/fidelite-recompense'
import { chargerRecompensePourYopper } from '@/lib/fidelite-recompense-server'
import { chargerBonValide } from '@/lib/bons-cadeaux-server'
import { normaliserCodeBon, calculerRemiseBon } from '@/lib/bons-cadeaux'
import { identiteProuvee } from '@/lib/yopper-auth'
import { verdictForfait } from '@/lib/garde-forfait'

export async function POST(request) {
  try {
    requireStripe()

    const body = await request.json()
    const {
      commercant_id, prestation_id, praticien_id, date_rdv, heure_debut, heure_fin, duree_minutes,
      client_email, client_prenom, client_nom, client_telephone,
      notes_client, rgpd_marketing,
      // ⚠️ DÉSIGNÉ PAR LE CLIENT, DONC REVÉRIFIÉ INTÉGRALEMENT plus bas contre
      // son identité PROUVÉE. Un identifiant envoyé n'autorise rien.
      fidelite_recompense_id,
      // ⚠️ MÊME RÈGLE : un code envoyé n'autorise rien, il est revalidé plus bas
      // contre le commerçant, le statut, l'expiration et le solde.
      bon_cadeau_code,
    } = body

    // Validations basiques
    if (!commercant_id || !prestation_id || !date_rdv || !heure_debut || !heure_fin) {
      return NextResponse.json({ ok: false, error: 'données RDV incomplètes' }, { status: 400 })
    }
    if (!client_email || !client_prenom || !client_nom || !client_telephone) {
      return NextResponse.json({ ok: false, error: 'coordonnées client incomplètes' }, { status: 400 })
    }

    // Supabase service_role (cette route est appelée publiquement par les Yoppers, y compris invités)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // Récupère commerçant + prestation pour calculer montants
    const [{ data: commercant }, { data: prestation }] = await Promise.all([
      // ⚠️ `plan`, `essai_plan` ET `created_at` : la garde de forfait en dépend.
      supabase.from('commercants').select('id, nom, slug, stripe_account_id, stripe_account_charges_enabled, rdv_acompte_en_ligne_actif, rdv_acompte_global, rdv_actif, plan, essai_plan, created_at').eq('id', commercant_id).single(),
      supabase.from('rdv_prestations').select('id, nom, prix, acompte_pourcent, duree_minutes').eq('id', prestation_id).single(),
    ])

    if (!commercant) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (!prestation) return NextResponse.json({ ok: false, error: 'prestation introuvable' }, { status: 404 })

    // 🔴 LE FORFAIT N'ÉTAIT PAS VÉRIFIÉ ICI NON PLUS. Cette route est appelée
    // PUBLIQUEMENT, par n'importe quel Yopper, y compris un invité : elle
    // tourne avec la clé de service et ne demandait au commerçant que d'avoir
    // Stripe branché. Un rendez-vous payant pouvait donc se poser chez un
    // commerçant qui n'a pas l'agenda dans sa formule.
    //
    // ⚠️ DEUX FONCTIONS, DEUX GARDES : `rdv` ouvre l'agenda, `paiement_ligne`
    // ouvre l'encaissement. Une seule des deux laisserait passer la moitié du
    // geste.
    //
    // ⚠️ CRÉER, PAS CONSOMMER : on refuse un rendez-vous NEUF. Rien ici ne
    // touche à un rendez-vous déjà pris, ni à son remboursement.
    for (const feature of ['rdv', 'paiement_ligne']) {
      const verdict = verdictForfait(commercant, feature)
      if (!verdict.ok) {
        return NextResponse.json(
          { ok: false, error: 'Ce commerçant ne prend pas encore de rendez-vous en ligne.', code: verdict.code },
          { status: verdict.statut }
        )
      }
    }
    // ⚠️ ET L'INTERRUPTEUR, séparément du forfait : l'avoir dans sa formule ne
    // veut pas dire l'avoir allumé.
    if (!commercant.rdv_actif) {
      return NextResponse.json({ ok: false, error: 'Ce commerçant ne prend pas encore de rendez-vous en ligne.' }, { status: 400 })
    }
    if (!commercant.stripe_account_id || !commercant.stripe_account_charges_enabled) {
      return NextResponse.json({ ok: false, error: 'le commerçant n\'a pas activé les paiements en ligne' }, { status: 400 })
    }
    if (!commercant.rdv_acompte_en_ligne_actif) {
      return NextResponse.json({ ok: false, error: 'paiement en ligne désactivé pour ce commerçant' }, { status: 400 })
    }

    // Prix estimé + acompte.
    // acompte_pourcent est stocké en DB comme un entier (20 = 20%, PAS 0.20),
    // donc la formule est prix * pct / 100. Bug initial : *100 au lieu de /100
    // → un acompte de 20% sur 60€ donnait 1200€ au lieu de 12€ (testé en mode test, fix avant prod).
    // Plus de repli sur une fourchette : les colonnes n'existent plus (27/08).
    const prixBase = prestation.prix != null ? Number(prestation.prix) : null
    const acomptePct = prestation.acompte_pourcent || commercant.rdv_acompte_global || 0
    if (!prixBase || acomptePct <= 0) {
      return NextResponse.json({ ok: false, error: 'cette prestation ne demande pas d\'acompte en ligne' }, { status: 400 })
    }
    // ─── RÉCOMPENSE DE FIDÉLITÉ (bloc 2, 24/08) ───────────────────────────
    //
    // ⚠️ ARBITRAGE D'ALEX : ELLE BAISSE LE TOTAL, ET L'ACOMPTE SE CALCULE SUR
    // CE TOTAL RÉDUIT. Le rendez-vous ne prend qu'un acompte en ligne, le solde
    // se règle au comptoir : si la remise ne portait que sur le solde, le
    // Yopper avancerait un acompte calculé sur un prix qu'il ne paie pas. En
    // baissant le total, tout suit — l'acompte, le solde, et le chiffre
    // d'affaires du commerçant.
    //
    // ⚠️ MÊME RÈGLE QUE PARTOUT : identité PROUVÉE par le jeton, jamais
    // `client_email`, qui est envoyé par le client et ne prouve rien.
    let recompense = null
    let remiseRecompenseEUR = 0
    if (fidelite_recompense_id) {
      const identite = await identiteProuvee(request)
      if (!identite?.email) {
        return NextResponse.json({
          ok: false,
          error: 'Connecte-toi pour utiliser ta récompense fidélité.',
          recompense_refusee: 'non_connecte',
        }, { status: 401 })
      }
      const resRec = await chargerRecompensePourYopper(supabase, {
        email: identite.email,
        commercantId: commercant.id,
        recompenseId: fidelite_recompense_id,
      })
      if (!resRec.ok) {
        return NextResponse.json({
          ok: false,
          error: 'Récompense inutilisable.',
          recompense_refusee: resRec.raison,
        }, { status: 400 })
      }
      recompense = resRec.recompense
      remiseRecompenseEUR = appliquerRecompenseAvantBon(recompense, prixBase).remiseRecompense
    }

    // ⚠️ LE BON CADEAU, APRÈS LA RÉCOMPENSE ET JAMAIS AVANT (28/08). Un
    // commerce de service peut vendre des bons ; son bénéficiaire arrivait
    // pourtant dans un cul-de-sac, cette route n'en connaissant aucun.
    //
    // ⚠️ LE CODE ENVOYÉ N'AUTORISE RIEN : il est revalidé ici contre le
    // commerçant, le statut, l'expiration et le solde. Le montant réellement
    // déduit est recalculé, jamais celui que l'écran a annoncé.
    // « L'écran calcule, le serveur décide. »
    let bonCadeau = null
    let remiseBonEUR = 0
    const baseApresRecompense = Math.round((prixBase - remiseRecompenseEUR) * 100) / 100
    if (bon_cadeau_code) {
      const codeBon = normaliserCodeBon(bon_cadeau_code)
      if (!codeBon) {
        return NextResponse.json({ ok: false, error: 'Code de bon cadeau invalide.' }, { status: 400 })
      }
      const resBon = await chargerBonValide(supabase, { code: codeBon, commercant_id: commercant.id })
      if (!resBon.ok) {
        return NextResponse.json({ ok: false, error: resBon.error }, { status: 400 })
      }
      bonCadeau = resBon.bon
      remiseBonEUR = calculerRemiseBon(bonCadeau.solde, baseApresRecompense)
    }

    const prixNet = Math.round((baseApresRecompense - remiseBonEUR) * 100) / 100

    const acompteMontant = Math.round(prixNet * acomptePct) / 100          // EUR, 2 décimales
    const acompteCents = Math.round(acompteMontant * 100)                    // centimes pour Stripe

    // ⚠️ LA RÉCOMPENSE PEUT RENDRE L'ACOMPTE INENCAISSABLE, et il ne faut pas
    // que ça se termine par un refus sec de Stripe. 20 % d'un solde de 2 €
    // valent 0,40 €, sous le minimum. On le DIT, avec le geste à faire.
    if (acompteCents < 50) {
      return NextResponse.json({
        ok: false,
        // ⚠️ ON NOMME CE QUI A FAIT BAISSER L'ACOMPTE, sinon le message accuse
        // la récompense alors que c'est le bon cadeau qui l'a rendu trop petit.
        error: (remiseRecompenseEUR > 0 || remiseBonEUR > 0)
          ? `Avec ${remiseBonEUR > 0 && remiseRecompenseEUR > 0 ? 'ta récompense et ton bon cadeau' : remiseBonEUR > 0 ? 'ton bon cadeau' : 'ta récompense'}, l'acompte descend sous le minimum encaissable. Réserve sans, tu pourras t'en servir au comptoir.`
          : 'acompte trop faible (min 0,50€ Stripe)',
        recompense_refusee: remiseRecompenseEUR > 0 ? 'acompte_trop_faible' : undefined,
        bon_refuse: remiseBonEUR > 0 ? 'acompte_trop_faible' : undefined,
      }, { status: 400 })
    }

    // TODO : valider l'overlap/horaires/pause ici (réutiliser logique existante).
    // Pour l'instant, le FE valide. Mais on devrait re-vérifier server-side pour sécurité.

    // Crée la Checkout Session en DIRECT CHARGE (cf. memory project-paiement-stripe).
    // Le paiement est cree DANS le compte du connected account (pas la plateforme),
    // donc les frais Stripe sont preleves sur le commercant (1.5% + 0.25€ sur
    // une carte europeenne standard, 2.8% sur une premium) et le
    // montant net arrive direct sur son IBAN. Yoppaa = zero commission, zero frais.
    //
    // Difference vs Destination Charge : on passe { stripeAccount } comme 2eme arg
    // de create(), au lieu de transfer_data.destination dans payment_intent_data.
    // Le success_url/cancel_url restent sur la plateforme (chemin standard).
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'bancontact'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: acompteCents,
          product_data: {
            name: `Acompte — ${prestation.nom}`,
            description: `${commercant.nom} · ${date_rdv} à ${heure_debut.slice(0,5)} · ${duree_minutes} min`,
          },
        },
      }],
      customer_email: client_email,
      success_url: `${STRIPE_CONFIG.appUrl}/commander/rdv/${commercant.slug}?paiement=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:   `${STRIPE_CONFIG.appUrl}/commander/rdv/${commercant.slug}?paiement=annule`,
      payment_intent_data: {
        application_fee_amount: calculApplicationFee(acompteCents, commercant),    // 0 (zéro commission Yoppaa)
        metadata: buildPaymentMetadata({
          kind: PAYMENT_KIND.RDV_ACOMPTE,
          commercantId: commercant.id,
          extra: {
            prestation_id: String(prestation_id),
            ...(praticien_id ? { praticien_id: String(praticien_id) } : {}),
            date_rdv,
            heure_debut: heure_debut.slice(0,5),
            heure_fin: heure_fin.slice(0,5),
            duree_minutes: String(duree_minutes || prestation.duree_minutes),
            // ⚠️ LE TARIF DE LA PRESTATION RESTE LE BRUT. C'est ce qui a été
            // affiché, et une remise ne réécrit pas un tarif. La remise voyage
            // à côté, et tous les calculs de solde la retranchent.
            prix_estime: String(prixBase),
            acompte_montant: String(acompteMontant),
            ...(recompense ? {
              fidelite_recompense_id: String(recompense.id),
              fidelite_remise: String(remiseRecompenseEUR),
            } : {}),
            // ⚠️ LE BON VOYAGE PAR LES MÉTADONNÉES, comme la récompense. Sans
            // ça le webhook créerait le rendez-vous au tarif plein et ne
            // débiterait jamais le bon : le client aurait payé un acompte
            // réduit, et le comptoir lui réclamerait la différence.
            ...(bonCadeau ? {
              bon_cadeau_id: String(bonCadeau.id),
              bon_cadeau_montant: String(remiseBonEUR),
            } : {}),
            client_email,
            client_prenom,
            client_nom,
            client_telephone,
            notes_client: (notes_client || '').slice(0, 480),  // limite Stripe metadata 500 char
            rgpd_marketing: rgpd_marketing ? '1' : '0',
          },
        }),
      },
      metadata: buildPaymentMetadata({
        kind: PAYMENT_KIND.RDV_ACOMPTE,
        commercantId: commercant.id,
      }),
    }, {
      stripeAccount: commercant.stripe_account_id,
    })

    return NextResponse.json({ ok: true, url: session.url, session_id: session.id })

  } catch (e) {
    console.error('[stripe/checkout/create-rdv-acompte]', e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: e?.status || 500 }
    )
  }
}
