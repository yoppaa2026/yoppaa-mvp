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

export async function POST(request) {
  try {
    requireStripe()

    const body = await request.json()
    const {
      commercant_id, prestation_id, date_rdv, heure_debut, heure_fin, duree_minutes,
      client_email, client_prenom, client_nom, client_telephone,
      notes_client, rgpd_marketing,
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
      supabase.from('commercants').select('id, nom, slug, stripe_account_id, stripe_account_charges_enabled, rdv_acompte_en_ligne_actif, rdv_acompte_global').eq('id', commercant_id).single(),
      supabase.from('rdv_prestations').select('id, nom, prix, prix_min, acompte_pourcent, duree_minutes').eq('id', prestation_id).single(),
    ])

    if (!commercant) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (!prestation) return NextResponse.json({ ok: false, error: 'prestation introuvable' }, { status: 404 })

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
    const prixBase = prestation.prix != null ? Number(prestation.prix) : (prestation.prix_min != null ? Number(prestation.prix_min) : null)
    const acomptePct = prestation.acompte_pourcent || commercant.rdv_acompte_global || 0
    if (!prixBase || acomptePct <= 0) {
      return NextResponse.json({ ok: false, error: 'cette prestation ne demande pas d\'acompte en ligne' }, { status: 400 })
    }
    const acompteMontant = Math.round(prixBase * acomptePct) / 100         // EUR, 2 décimales
    const acompteCents = Math.round(acompteMontant * 100)                    // centimes pour Stripe

    if (acompteCents < 50) {
      return NextResponse.json({ ok: false, error: 'acompte trop faible (min 0,50€ Stripe)' }, { status: 400 })
    }

    // TODO : valider l'overlap/horaires/pause ici (réutiliser logique existante).
    // Pour l'instant, le FE valide. Mais on devrait re-vérifier server-side pour sécurité.

    // Crée la Checkout Session avec Direct Charge (transfer_data.destination = commercant)
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
        transfer_data: { destination: commercant.stripe_account_id },               // l'argent va direct au commerçant
        metadata: buildPaymentMetadata({
          kind: PAYMENT_KIND.RDV_ACOMPTE,
          commercantId: commercant.id,
          extra: {
            prestation_id: String(prestation_id),
            date_rdv,
            heure_debut: heure_debut.slice(0,5),
            heure_fin: heure_fin.slice(0,5),
            duree_minutes: String(duree_minutes || prestation.duree_minutes),
            prix_estime: String(prixBase),
            acompte_montant: String(acompteMontant),
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
