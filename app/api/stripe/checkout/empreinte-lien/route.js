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
// serveur, gardé HACHÉ en base, et comparé ici par son empreinte : la base ne
// contient donc rien qui permette de fabriquer un lien.
//
// ⚠️ ET RIEN N'EST DÉBITÉ. Comme sur la fiche publique : Checkout `mode: setup`,
// la carte est enregistrée avec l'authentification forte, le débit éventuel
// vient plus tard et hors session.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { stripe, requireStripe, PAYMENT_KIND, buildPaymentMetadata } from '@/lib/stripe'
import { empreinteRequise, montantEmpreinte, lienValide, raisonDemandeImpossible } from '@/lib/empreinte-table'
import { normaliserEmail } from '@/lib/email-normalise'

export async function POST(request) {
  try {
    requireStripe()
    const { jeton } = await request.json()
    if (!jeton || String(jeton).length < 16) {
      return NextResponse.json({ ok: false, error: 'Lien invalide.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const hash = createHash('sha256').update(String(jeton)).digest('hex')
    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, statut, date_rdv, heure_debut, couverts,
        client_prenom, client_nom, client_email, client_telephone,
        empreinte_statut, empreinte_demande_expire_at, prestation_id, commercant_id,
        prestation:rdv_prestations(id, nom, par_couverts, couverts_min, couverts_max),
        commercant:commercants(id, nom, slug, stripe_account_id, stripe_account_charges_enabled,
          rdv_empreinte_actif, rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne)
      `)
      .eq('empreinte_demande_jeton_hash', hash)
      .is('deleted_at', null)
      .maybeSingle()

    // ⚠️ UN SEUL MESSAGE POUR « JETON INCONNU » ET « JETON PÉRIMÉ » NE VAUT
    // RIEN POUR LE CLIENT : il ne sait pas s'il doit rappeler ou attendre. Mais
    // on ne dit jamais qu'une table existe à qui n'a pas le bon jeton.
    if (!rdv) return NextResponse.json({ ok: false, code: 'inconnu', error: 'Ce lien n’est pas valable.' }, { status: 404 })
    if (!lienValide(rdv, new Date())) {
      return NextResponse.json({
        ok: false, code: 'expire',
        error: 'Ce lien a expiré. Ta table reste réservée : appelle le restaurant si tu veux la garantir.',
      }, { status: 410 })
    }

    const raison = raisonDemandeImpossible(rdv, new Date())
    if (raison === 'deja_garantie') {
      return NextResponse.json({ ok: false, code: 'deja_garantie', error: 'Ta carte est déjà enregistrée pour cette table.' }, { status: 409 })
    }
    if (raison) {
      return NextResponse.json({ ok: false, code: raison, error: 'Cette table ne peut plus être garantie.' }, { status: 409 })
    }

    const commercant = rdv.commercant
    if (!commercant?.stripe_account_id || !commercant.stripe_account_charges_enabled) {
      return NextResponse.json({ ok: false, error: 'Le restaurant ne peut pas enregistrer de carte pour le moment.' }, { status: 400 })
    }
    // 🔴 LA RÈGLE EST REJOUÉE ICI AUSSI. Le réglage du restaurateur a pu changer
    // entre l'envoi du lien et le clic : demander une carte sur une table qui
    // n'en demande plus serait une prise de garantie sans base.
    if (!empreinteRequise(commercant, rdv.prestation, rdv.couverts)) {
      return NextResponse.json({ ok: false, error: 'Cette table ne demande plus d’empreinte.' }, { status: 409 })
    }
    const montant = montantEmpreinte(commercant, rdv.prestation, rdv.couverts)
    if (!(montant > 0)) {
      return NextResponse.json({ ok: false, error: 'Cette table ne demande plus d’empreinte.' }, { status: 409 })
    }

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
