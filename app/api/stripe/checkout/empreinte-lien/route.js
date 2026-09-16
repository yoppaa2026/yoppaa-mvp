// POST /api/stripe/checkout/empreinte-lien
//
// LE CLIENT A CLIQUÉ SUR SON LIEN : ON OUVRE LA SAISIE DE CARTE.
//
// Différence avec `create-rdv-empreinte`, et c'est toute la différence : ICI LA
// TABLE EXISTE DÉJÀ. Elle a été prise au téléphone par le restaurateur. On ne
// crée donc rien, on ajoute une garantie à une réservation qui tient debout
// toute seule.
//
// 🔴 ROUTE PUBLIQUE, ET SA SEULE CLÉ EST LE JETON. Il est tiré au sort par le
// serveur, gardé HACHÉ en base, et comparé par son empreinte dans
// `lib/empreinte-lien-serveur` : la base ne contient donc rien qui permette de
// fabriquer un lien.
//
// ⚠️ ET RIEN N'EST DÉBITÉ. Comme sur la fiche publique : Checkout `mode: setup`,
// la carte est enregistrée avec l'authentification forte, le débit éventuel
// vient plus tard et hors session.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, PAYMENT_KIND, buildPaymentMetadata } from '@/lib/stripe'
import { chargerLienEmpreinte } from '@/lib/empreinte-lien-serveur'
import { normaliserEmail } from '@/lib/email-normalise'

export async function POST(request) {
  try {
    requireStripe()
    const { jeton } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // 🔴 LA LECTURE, LA RÈGLE ET LE MONTANT VIENNENT DU MODULE PARTAGÉ (16/09),
    // le même qui a servi à AFFICHER la somme au client une seconde plus tôt.
    // Deux copies de ce calcul, c'est le jour où l'écran annonce 120 € et où le
    // mandat part sur 160. `avecClient` charge en plus les coordonnées, dont
    // cette route a besoin pour créer le client Stripe et elle seule.
    const lien = await chargerLienEmpreinte(supabase, jeton, { avecClient: true })
    if (!lien.ok) {
      return NextResponse.json({ ok: false, code: lien.code, error: lien.error }, { status: lien.status })
    }
    const { rdv, commercant, montant } = lien

    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yoppaa.app'

    const client = await stripe.customers.create({
      email: normaliserEmail(rdv.client_email) || undefined,
      name: `${rdv.client_prenom || ''} ${rdv.client_nom || ''}`.trim() || undefined,
      phone: rdv.client_telephone || undefined,
      metadata: { yoppaa_rdv_id: String(rdv.id), yoppaa_commercant_id: String(commercant.id) },
    }, { stripeAccount: commercant.stripe_account_id })

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: client.id,
      payment_method_types: ['card'],
      setup_intent_data: {
        usage: 'off_session',
        metadata: buildPaymentMetadata({
          kind: PAYMENT_KIND.RDV_EMPREINTE,
          commercantId: commercant.id,
          extra: {
            yoppaa_rdv_id: String(rdv.id),
            // 🔴 CE DRAPEAU DIT AU WEBHOOK DE NE PAS CRÉER DE TABLE. Sans lui,
            // il chercherait à en insérer une qui existe déjà, et son garde de
            // rejeu la prendrait pour un doublon Stripe : la carte serait
            // enregistrée chez Stripe et jamais posée sur la réservation.
            empreinte_sur_existante: '1',
            empreinte_montant: String(montant),
          },
        }),
      },
      metadata: buildPaymentMetadata({
        kind: PAYMENT_KIND.RDV_EMPREINTE,
        commercantId: commercant.id,
        extra: { yoppaa_rdv_id: String(rdv.id), empreinte_sur_existante: '1' },
      }),
      success_url: `${base}/empreinte/${jeton}?etat=ok`,
      cancel_url: `${base}/empreinte/${jeton}?etat=annule`,
    }, {
      stripeAccount: commercant.stripe_account_id,
    })

    return NextResponse.json({ ok: true, url: session.url, montant })
  } catch (e) {
    console.error('[empreinte-lien] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || 'erreur serveur' }, { status: 500 })
  }
}
