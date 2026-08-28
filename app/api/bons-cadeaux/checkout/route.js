// POST /api/bons-cadeaux/checkout
//
// Achat d'un bon cadeau digital (montant libre 5-250 €) chez un commerçant.
// Flow :
//   1. Le bon est inséré en statut 'paiement_en_attente' (code + token générés)
//   2. Stripe Checkout Session en DIRECT CHARGE sur le compte du commerçant
//      (l'argent du bon va chez lui, zéro commission Yoppaa)
//   3. Le webhook payment_intent.succeeded active le bon + envoie les emails
//      (au bénéficiaire si mode 'offrir', sinon à l'acheteur)
// Un bon jamais payé reste en 'paiement_en_attente' : inerte, invérifiable.
//
// Body : { commercant_id, montant, acheteur_email, acheteur_prenom,
//          destinataire_mode: 'moi'|'offrir', beneficiaire_email?,
//          beneficiaire_prenom?, message? }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG, PAYMENT_KIND, buildPaymentMetadata, calculApplicationFee } from '@/lib/stripe'
import { canDo } from '@/lib/plans'
import { genererCodeBon, BON_MONTANT_MIN, BON_MONTANT_MAX } from '@/lib/bons-cadeaux'
import { ordersLimiter, checkLimit, clientIp } from '@/lib/ratelimit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(request) {
  try {
    requireStripe()

    const rl = await checkLimit(ordersLimiter, clientIp(request))
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Trop de tentatives, réessaie dans une minute.' }, { status: 429 })
    }

    const body = await request.json()
    const {
      commercant_id, montant, acheteur_email, acheteur_prenom,
      destinataire_mode, beneficiaire_email, beneficiaire_prenom, message,
    } = body

    const montantEUR = Math.round(Number(montant) * 100) / 100
    if (!commercant_id || !montantEUR || montantEUR < BON_MONTANT_MIN || montantEUR > BON_MONTANT_MAX) {
      return NextResponse.json({ ok: false, error: `Montant entre ${BON_MONTANT_MIN} et ${BON_MONTANT_MAX} €.` }, { status: 400 })
    }
    if (!EMAIL_RE.test(acheteur_email || '')) {
      return NextResponse.json({ ok: false, error: 'Ton email est requis (le reçu et le bon y seront envoyés).' }, { status: 400 })
    }
    const modeDest = destinataire_mode === 'offrir' ? 'offrir' : 'moi'
    if (modeDest === 'offrir' && !EMAIL_RE.test(beneficiaire_email || '')) {
      return NextResponse.json({ ok: false, error: 'L\'email de la personne à qui tu offres le bon est requis.' }, { status: 400 })
    }
    // ⚠️ UN CADEAU DOIT DIRE DE QUI IL VIENT, et une garde d'écran n'est jamais
    // une réponse. Sans prénom, le bénéficiaire lisait « on t'offre un bon
    // cadeau », de la part de personne, et l'acheteur « envoyé à » suivi d'une
    // adresse email brute. Les gabarits se rabattaient poliment sur « Merci »
    // et « Hello » : un repli propre, mais un cadeau anonyme quand même.
    if (!String(acheteur_prenom || '').trim()) {
      return NextResponse.json({ ok: false, error: 'Ton prénom est requis : un cadeau doit dire de qui il vient.' }, { status: 400 })
    }
    if (modeDest === 'offrir' && !String(beneficiaire_prenom || '').trim()) {
      return NextResponse.json({ ok: false, error: 'Le prénom de la personne à qui tu offres le bon est requis.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: commercant } = await supabase
      .from('commercants')
      .select('id, nom, slug, plan, categorie, statut_publication, stripe_account_id, stripe_account_charges_enabled, bons_cadeaux_actif, bons_cadeaux_validite_mois')
      .eq('id', commercant_id)
      .single()
    if (!commercant || commercant.statut_publication !== 'publie') {
      return NextResponse.json({ ok: false, error: 'Commerçant introuvable.' }, { status: 404 })
    }
    if (!commercant.bons_cadeaux_actif || !canDo(commercant.plan, 'bons_cadeaux')) {
      return NextResponse.json({ ok: false, error: 'Les bons cadeaux ne sont pas proposés chez ce commerçant.' }, { status: 400 })
    }
    if (!commercant.stripe_account_id || !commercant.stripe_account_charges_enabled) {
      return NextResponse.json({ ok: false, error: 'Le paiement en ligne n\'est pas encore activé chez ce commerçant.' }, { status: 400 })
    }

    // Insert du bon en attente de paiement. Retry si collision de code (rarissime).
    const validiteMois = commercant.bons_cadeaux_validite_mois || 12
    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + validiteMois)

    let bon = null
    for (let i = 0; i < 3 && !bon; i++) {
      const { data, error } = await supabase.from('bons_cadeaux').insert({
        commercant_id: commercant.id,
        code: genererCodeBon(),
        montant_initial: montantEUR,
        solde: montantEUR,
        statut: 'paiement_en_attente',
        acheteur_email: acheteur_email.trim().toLowerCase(),
        acheteur_prenom: (acheteur_prenom || '').trim() || null,
        destinataire_mode: modeDest,
        beneficiaire_email: modeDest === 'offrir' ? beneficiaire_email.trim().toLowerCase() : null,
        beneficiaire_prenom: modeDest === 'offrir' ? ((beneficiaire_prenom || '').trim() || null) : null,
        message: (message || '').trim().slice(0, 300) || null,
        expires_at: expiresAt.toISOString(),
      }).select().single()
      if (!error) { bon = data; break }
      if (error.code !== '23505') {
        console.error('[bons-cadeaux/checkout] insert KO', error)
        return NextResponse.json({ ok: false, error: 'Création du bon échouée, réessaie.' }, { status: 500 })
      }
    }
    if (!bon) return NextResponse.json({ ok: false, error: 'Création du bon échouée, réessaie.' }, { status: 500 })

    const montantCents = Math.round(montantEUR * 100)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'bancontact'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: montantCents,
          product_data: {
            name: `Bon cadeau · ${commercant.nom}`,
            description: modeDest === 'offrir'
              ? `Offert à ${beneficiaire_prenom || beneficiaire_email} · valable ${validiteMois} mois`
              : `Valable ${validiteMois} mois`,
          },
        },
      }],
      customer_email: acheteur_email,
      // Retour sur la fiche principale : fiche RDV pour les services, fiche
      // commerce sinon (la fiche affiche le bandeau ?bon=ok / ?bon=annule).
      success_url: `${STRIPE_CONFIG.appUrl}${commercant.categorie === 'vitrine' ? `/commander/rdv/${commercant.slug}` : `/commander/${commercant.slug}`}?bon=ok`,
      cancel_url:   `${STRIPE_CONFIG.appUrl}${commercant.categorie === 'vitrine' ? `/commander/rdv/${commercant.slug}` : `/commander/${commercant.slug}`}?bon=annule`,
      payment_intent_data: {
        application_fee_amount: calculApplicationFee(montantCents, commercant),
        metadata: buildPaymentMetadata({
          kind: PAYMENT_KIND.BON_CADEAU,
          commercantId: commercant.id,
          extra: { yoppaa_bon_id: bon.id },
        }),
      },
      metadata: buildPaymentMetadata({
        kind: PAYMENT_KIND.BON_CADEAU,
        commercantId: commercant.id,
        extra: { yoppaa_bon_id: bon.id },
      }),
    }, {
      stripeAccount: commercant.stripe_account_id,
    })

    await supabase.from('bons_cadeaux').update({ stripe_session_id: session.id }).eq('id', bon.id)

    return NextResponse.json({ ok: true, url: session.url })
  } catch (e) {
    console.error('[bons-cadeaux/checkout]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
