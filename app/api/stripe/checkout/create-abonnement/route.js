// POST /api/stripe/checkout/create-abonnement
//
// UN CLIENT ACHÈTE UN ABONNEMENT depuis la fiche du commerçant.
//
// ⚠️ CE N'EST PAS L'ABONNEMENT DU COMMERÇANT À SON PALIER YOPPAA, qui vit dans
// /api/stripe/billing. Ici l'argent va AU COMMERÇANT, là il vient chez nous.
// Deux fois le même mot, deux flux opposés, et les confondre serait un
// virement dans le mauvais sens.
//
// Décisions d'Alex du 15/08 :
//   • paiement EN UNE FOIS, jamais de prélèvement mensuel ;
//   • Direct Charge sur le compte connecté, comme tout le reste : les frais
//     Stripe sont prélevés chez le commerçant, Yoppaa ne prend rien.
//
// ⚠️ LE CONTRAT N'EST PAS CRÉÉ ICI. Il l'est au webhook, quand le paiement a
// RÉUSSI. Le créer avant produirait des abonnements fantômes à chaque panier
// abandonné, et un solde de séances offert à qui ferme l'onglet. Même règle que
// l'acompte d'un rendez-vous depuis le 04/08.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG, PAYMENT_KIND, buildPaymentMetadata, calculApplicationFee } from '@/lib/stripe'
import { formuleVendableEnLigne, resumeFormulePublique, seancesDeLaFormule } from '@/lib/abonnements'

export async function POST(request) {
  try {
    requireStripe()

    const { formule_id, client_email, client_prenom, client_nom, client_telephone } = await request.json()

    if (!formule_id) {
      return NextResponse.json({ ok: false, error: 'formule_id requis' }, { status: 400 })
    }
    if (!client_email || !client_prenom || !client_nom) {
      return NextResponse.json({ ok: false, error: 'coordonnées incomplètes' }, { status: 400 })
    }

    // service_role : la route est publique, un visiteur sans compte doit
    // pouvoir acheter. La formule est de toute façon lisible publiquement quand
    // elle est en vente, mais on ne veut pas dépendre de la session appelante.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: formule } = await supabase
      .from('abonnement_formules')
      .select('*')
      .eq('id', formule_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!formule) {
      return NextResponse.json({ ok: false, error: 'formule introuvable' }, { status: 404 })
    }

    // ⚠️ ON REVALIDE LA MISE EN VENTE ICI, côté serveur. L'écran ne montre que
    // ce qui est vendable, mais une requête forgée n'a pas d'écran : sans ce
    // contrôle, n'importe qui achèterait un brouillon ou un tarif négocié en
    // devinant son identifiant.
    if (!formuleVendableEnLigne(formule)) {
      return NextResponse.json({ ok: false, error: 'cette formule n\'est pas en vente en ligne' }, { status: 400 })
    }

    const { data: commercant } = await supabase
      .from('commercants')
      .select('id, nom, slug, stripe_account_id, stripe_account_charges_enabled')
      .eq('id', formule.commercant_id)
      .maybeSingle()

    if (!commercant) {
      return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    }
    if (!commercant.stripe_account_id || !commercant.stripe_account_charges_enabled) {
      return NextResponse.json({ ok: false, error: 'ce commerçant n\'a pas encore activé les paiements en ligne' }, { status: 400 })
    }

    const prixCents = Math.round(Number(formule.prix) * 100)
    if (!Number.isFinite(prixCents) || prixCents < 50) {
      return NextResponse.json({ ok: false, error: 'montant trop faible (minimum 0,50 € chez Stripe)' }, { status: 400 })
    }

    const resume = resumeFormulePublique(formule)
    const seances = seancesDeLaFormule(formule)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'bancontact'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: prixCents,
          product_data: {
            name: `${formule.libelle} — ${commercant.nom}`,
            // ⚠️ CE QUE LE CLIENT LIT SUR LA PAGE DE PAIEMENT ET SUR SON RELEVÉ.
            // Un intitulé nu se conteste, et une contestation coûte au
            // commerçant bien plus que la ligne de description.
            description: [resume?.seancesLibelle, resume?.validite, resume?.rythme]
              .filter(Boolean).join(' · ').slice(0, 380),
          },
        },
      }],
      customer_email: client_email,
      success_url: `${STRIPE_CONFIG.appUrl}/commander/rdv/${commercant.slug}?abonnement=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:   `${STRIPE_CONFIG.appUrl}/commander/rdv/${commercant.slug}?abonnement=annule`,
      payment_intent_data: {
        application_fee_amount: calculApplicationFee(prixCents, commercant),   // 0 : Yoppaa ne prend rien
        metadata: buildPaymentMetadata({
          kind: PAYMENT_KIND.ABONNEMENT,
          commercantId: commercant.id,
          extra: {
            formule_id: String(formule.id),
            // ⚠️ LE NOMBRE DE SÉANCES VOYAGE AVEC LE PAIEMENT. Le recalculer au
            // webhook depuis la formule laisserait un commerçant qui modifie
            // ses congés entre le clic et l'encaissement livrer autre chose que
            // ce qui a été payé.
            seances_total: String(seances),
            prix: String(Number(formule.prix)),
            client_email: String(client_email).trim().toLowerCase(),
            client_prenom: String(client_prenom).trim().slice(0, 80),
            client_nom: String(client_nom).trim().slice(0, 80),
            client_telephone: String(client_telephone || '').trim().slice(0, 40),
          },
        }),
      },
      metadata: buildPaymentMetadata({
        kind: PAYMENT_KIND.ABONNEMENT,
        commercantId: commercant.id,
      }),
    }, {
      stripeAccount: commercant.stripe_account_id,
    })

    return NextResponse.json({ ok: true, url: session.url, session_id: session.id })

  } catch (e) {
    console.error('[stripe/checkout/create-abonnement]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: e?.status || 500 })
  }
}
