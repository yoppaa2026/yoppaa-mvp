// POST /api/fidelite/sms-packs/checkout
//
// Achat d'un pack de SMS de fidélité par un commerçant.
// Contrairement aux commandes et bons cadeaux (Direct Charge chez le
// commerçant), c'est ici Yoppaa qui VEND : le paiement va donc sur le compte
// PLATEFORME, comme les abonnements. Le Price est configuré dans Stripe
// (STRIPE_PRICE_SMS100_TEST/LIVE, STRIPE_PRICE_SMS500_TEST/LIVE) pour que la
// TVA soit traitée exactement comme celle des abonnements.
//
// Body : { commercant_id, pack: '100' | '500' }
// Le crédit des SMS est fait par le webhook billing (paiement confirmé).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG, PAYMENT_KIND } from '@/lib/stripe'
import { getStripePriceIdSmsPack, getOrCreateStripeCustomer } from '@/lib/stripe-billing'
import { PACKS_SMS } from '@/lib/packs-sms'
import { canDo } from '@/lib/plans'

export async function POST(request) {
  try {
    requireStripe()

    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const { commercant_id, pack } = await request.json()
    const cfg = PACKS_SMS[String(pack)]
    if (!commercant_id || !cfg) {
      return NextResponse.json({ ok: false, error: 'Pack inconnu.' }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: com } = await admin
      .from('commercants')
      .select('id, nom, email, plan, auth_user_id, stripe_customer_id')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!com) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (com.auth_user_id !== user.id && user.email !== 'verstappenalexandre@gmail.com') {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }
    // Les SMS ne servent qu'au programme de fidélité (Communiquer et Vendre)
    if (!canDo(com.plan, 'fidelite')) {
      return NextResponse.json({ ok: false, error: 'Les SMS de fidélité sont inclus à partir de la formule Communiquer.' }, { status: 400 })
    }

    const priceId = getStripePriceIdSmsPack(String(pack))
    const customer = await getOrCreateStripeCustomer(com, admin)

    // Trace de l'achat AVANT le paiement : le webhook s'en sert pour créditer
    // une seule fois (idempotence par stripe_session_id unique).
    const { data: achat, error: errAchat } = await admin
      .from('fidelite_sms_achats')
      .insert({
        commercant_id: com.id,
        pack: String(pack),
        nb_sms: cfg.nb,
        montant_htva: cfg.prix_htva,
      })
      .select()
      .single()
    if (errAchat) {
      console.error('[sms-packs/checkout] insert achat KO', errAchat)
      return NextResponse.json({ ok: false, error: 'Création de la commande échouée, réessaie.' }, { status: 500 })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${STRIPE_CONFIG.appUrl}/dashboard?sms=ok`,
      cancel_url:  `${STRIPE_CONFIG.appUrl}/dashboard?sms=annule`,
      metadata: {
        yoppaa_kind: PAYMENT_KIND.SMS_PACK,
        yoppaa_commercant_id: com.id,
        yoppaa_achat_id: achat.id,
        yoppaa_nb_sms: String(cfg.nb),
      },
    })

    await admin.from('fidelite_sms_achats')
      .update({ stripe_session_id: session.id })
      .eq('id', achat.id)

    return NextResponse.json({ ok: true, url: session.url })
  } catch (e) {
    console.error('[fidelite/sms-packs/checkout]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
