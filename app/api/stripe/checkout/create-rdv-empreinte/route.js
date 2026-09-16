// L'EMPREINTE BANCAIRE SUR UNE TABLE : ON ENREGISTRE LA CARTE, ON NE PREND RIEN.
//
// Route PUBLIQUE, appelée par n'importe quel Yopper, invité compris. Elle ouvre
// un Stripe Checkout en `mode: 'setup'` : le client donne sa carte, Stripe la
// rattache à un client du compte DU RESTAURATEUR, et **rien n'est débité**. Le
// rendez-vous est créé ensuite par le webhook, comme pour un acompte.
//
// 🔴 POURQUOI UN `SetupIntent` ET PAS UNE AUTORISATION. Une autorisation de
// fonds expire en SEPT JOURS (Visa en transaction commerçant : 4 j 18 h). Une
// table réservée pour le mois prochain ne peut donc pas être « bloquée ». Le
// SetupIntent, lui, ne périme pas : il enregistre la carte avec
// l'authentification forte, laquelle donne le mandat qui exemptera le débit
// hors session du jour du no-show.
//
// ⚠️ ET RIEN N'EST RETENU SUR LE COMPTE DU CLIENT. Aucun texte, ici ou ailleurs,
// ne doit dire le contraire : il chercherait la retenue sur son relevé.
//
// ⚠️ DIRECT CHARGE, comme `create-rdv-acompte` : `{ stripeAccount }` en second
// argument. Le Customer, la carte et le futur débit vivent sur le compte du
// restaurateur. Conséquence assumée : un Yopper qui réserve chez deux
// restaurants donne sa carte deux fois, les clients Stripe n'étant pas partagés
// entre comptes connectés.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, PAYMENT_KIND, buildPaymentMetadata } from '@/lib/stripe'
import { verdictForfait } from '@/lib/garde-forfait'
import { creneauDejaCommence } from '@/lib/timezone'
import { normaliserEmail } from '@/lib/email-normalise'
import { empreinteRequise, montantEmpreinte } from '@/lib/empreinte-table'
import { estParCouverts, couvertsValides, COLONNES_COUVERTS } from '@/lib/cours-collectifs'

export async function POST(request) {
  try {
    requireStripe()

    const body = await request.json()
    const {
      commercant_id, prestation_id, praticien_id, date_rdv, heure_debut, heure_fin, duree_minutes,
      couverts,
      client_email, client_prenom, client_nom, client_telephone,
      notes_client, rgpd_marketing,
    } = body

    if (!commercant_id || !prestation_id || !date_rdv || !heure_debut || !heure_fin) {
      return NextResponse.json({ ok: false, error: 'données de réservation incomplètes' }, { status: 400 })
    }
    if (!client_email || !client_prenom || !client_nom || !client_telephone) {
      return NextResponse.json({ ok: false, error: 'coordonnées client incomplètes' }, { status: 400 })
    }
    // ⚠️ UN CRÉNEAU DÉJÀ COMMENCÉ SE REFUSE AVANT D'OUVRIR QUOI QUE CE SOIT,
    // comme chez le frère : sinon le client donne sa carte pour une table dont
    // le service a commencé.
    if (creneauDejaCommence(date_rdv, String(heure_debut))) {
      return NextResponse.json({ ok: false, error: 'Ce créneau est déjà passé. Choisis-en un autre.', creneau_refuse: true }, { status: 409 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const [{ data: commercant }, { data: prestation }] = await Promise.all([
      // ⚠️ `plan`, `essai_plan` et `created_at` : la garde de forfait en dépend.
      // Les trois colonnes d'empreinte : la règle en dépend.
      supabase.from('commercants').select(
        'id, nom, slug, categorie, stripe_account_id, stripe_account_charges_enabled, rdv_actif, plan, essai_plan, created_at, rdv_empreinte_actif, rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne'
      ).eq('id', commercant_id).single(),
      // 🔴 `COLONNES_COUVERTS` ET PAS UNE LISTE RECOPIÉE (16/09) : `capacite`
      // manquait, donc la capacité valait 1, donc les bornes valaient { 1, 1 },
      // donc TOUTE table se voyait répondre « ce nombre de personnes n'est pas
      // accepté ». Aucune empreinte n'a jamais pu être posée depuis la fiche.
      supabase.from('rdv_prestations').select(
        `id, nom, duree_minutes, commercant_id, ${COLONNES_COUVERTS}`
      ).eq('id', prestation_id).single(),
    ])

    if (!commercant) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (!prestation) return NextResponse.json({ ok: false, error: 'prestation introuvable' }, { status: 404 })
    // ⚠️ LA PRESTATION APPARTIENT-ELLE À CE COMMERCE ? Deux identifiants
    // arrivant du même écran ne prouvent pas qu'ils vont ensemble.
    if (prestation.commercant_id !== commercant.id) {
      return NextResponse.json({ ok: false, error: 'prestation introuvable' }, { status: 404 })
    }

    // ⚠️ MÊMES GARDES QUE L'ACOMPTE : le forfait ouvre l'agenda, l'interrupteur
    // l'allume. Cette route tourne avec la clé de service et n'a donc aucune
    // RLS devant elle.
    for (const feature of ['rdv', 'paiement_ligne']) {
      const verdict = verdictForfait(commercant, feature)
      if (!verdict.ok) {
        return NextResponse.json(
          { ok: false, error: 'Ce commerçant ne prend pas encore de réservations en ligne.', code: verdict.code },
          { status: verdict.statut }
        )
      }
    }
    if (!commercant.rdv_actif) {
      return NextResponse.json({ ok: false, error: 'Ce commerçant ne prend pas encore de réservations en ligne.' }, { status: 400 })
    }
    if (!commercant.stripe_account_id || !commercant.stripe_account_charges_enabled) {
      return NextResponse.json({ ok: false, error: 'le commerçant n\'a pas activé les paiements en ligne' }, { status: 400 })
    }

    // 🔴 LE NOMBRE DE PERSONNES EST REVÉRIFIÉ ICI, PAS CRU. C'est lui qui décide
    // si une carte est demandée ET de combien elle répond : un écran qui
    // annoncerait douze couverts sur une table qui en accepte quatre
    // multiplierait la garantie par trois.
    if (!estParCouverts(prestation)) {
      return NextResponse.json({ ok: false, error: 'cette prestation ne demande pas d\'empreinte' }, { status: 400 })
    }
    const couvertsRetenus = couvertsValides(prestation, couverts)
    if (couvertsRetenus === null) {
      return NextResponse.json({ ok: false, error: 'Ce nombre de personnes n\'est pas accepté pour cette réservation.' }, { status: 400 })
    }

    // ⚠️ LA RÈGLE VIENT DU MODULE, et elle est rejouée SERVEUR : l'écran décide
    // d'afficher, le serveur décide de demander.
    if (!empreinteRequise(commercant, prestation, couvertsRetenus)) {
      return NextResponse.json({ ok: false, error: 'cette réservation ne demande pas d\'empreinte', pas_d_empreinte: true }, { status: 400 })
    }
    const montant = montantEmpreinte(commercant, prestation, couvertsRetenus)
    // 🔴 LE PIÈGE DU ZÉRO : une garantie de zéro euro n'est pas une garantie.
    // Si le calcul rendait zéro, il vaut mieux ne pas demander de carte du tout
    // que d'en demander une pour rien.
    if (!(montant > 0)) {
      return NextResponse.json({ ok: false, error: 'cette réservation ne demande pas d\'empreinte', pas_d_empreinte: true }, { status: 400 })
    }

    const rdvId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yoppaa.app'

    // ⚠️ LE CLIENT STRIPE EST CRÉÉ SUR LE COMPTE DU RESTAURATEUR, sans quoi la
    // carte enregistrée ne serait pas débitable par lui le jour du no-show.
    const client = await stripe.customers.create({
      email: normaliserEmail(client_email),
      name: `${client_prenom} ${client_nom}`.trim(),
      phone: client_telephone,
      metadata: { yoppaa_rdv_id: String(rdvId || ''), yoppaa_commercant_id: String(commercant.id) },
    }, { stripeAccount: commercant.stripe_account_id })

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: client.id,
      // ⚠️ CARTE UNIQUEMENT, et c'est une décision, pas une limite technique.
      // Une empreinte suppose une autorisation gardée puis capturée : Bancontact
      // passerait par une domiciliation contestable huit semaines.
      payment_method_types: ['card'],
      // 🔴 `usage: 'off_session'` A ÉTÉ RETIRÉ D'ICI (16/09, essai E2 d'Alex).
      // Stripe refusait l'appel ENTIER : « Received unknown parameter:
      // setup_intent_data[usage] ». Ce paramètre n'existe pas sur
      // `setup_intent_data` d'une session Checkout, qui n'accepte que
      // `description`, `metadata` et `on_behalf_of` (types de la bibliothèque
      // installée, stripe 22.0.2). Aucune carte n'a donc jamais pu être
      // enregistrée depuis la fiche, et DEUX GARDES EXIGEAIENT ce paramètre :
      // elles décrivaient ce que je croyais, pas ce que Stripe accepte.
      //
      // ⚠️ ET RIEN N'EST PERDU : un SetupIntent sans `usage` vaut `off_session`
      // par défaut (« If not provided, this value defaults to off_session »,
      // node_modules/stripe/cjs/resources/SetupIntents.d.ts). C'est ce qui
      // demande l'authentification forte maintenant et donne le mandat, sans
      // quoi le débit du no-show serait refusé avec `authentication_required`,
      // au moment précis où plus personne n'est devant l'écran.
      setup_intent_data: {
        metadata: buildPaymentMetadata({
          kind: PAYMENT_KIND.RDV_EMPREINTE,
          commercantId: commercant.id,
          extra: {
            yoppaa_rdv_id: String(rdvId || ''),
            prestation_id: String(prestation_id),
            ...(praticien_id ? { praticien_id: String(praticien_id) } : {}),
            date_rdv,
            heure_debut: String(heure_debut).slice(0, 5),
            heure_fin: String(heure_fin).slice(0, 5),
            duree_minutes: String(duree_minutes || prestation.duree_minutes || ''),
            couverts: String(couvertsRetenus),
            // 🔴 LE MONTANT GARANTI VOYAGE PAR STRIPE, ET C'EST VOLONTAIRE.
            // Le commerçant ne peut pas modifier les métadonnées d'un
            // SetupIntent depuis son tableau de bord Stripe : c'est donc la
            // trace de ce que le client a accepté, hors de sa portée.
            empreinte_montant: String(montant),
            client_email: normaliserEmail(client_email),
            client_prenom,
            client_nom,
            client_telephone,
            notes_client: (notes_client || '').slice(0, 480),
            rgpd_marketing: rgpd_marketing ? '1' : '0',
          },
        }),
      },
      metadata: buildPaymentMetadata({
        kind: PAYMENT_KIND.RDV_EMPREINTE,
        commercantId: commercant.id,
        extra: { yoppaa_rdv_id: String(rdvId || '') },
      }),
      success_url: `${base}/commander/rdv/${commercant.slug}?empreinte=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/commander/rdv/${commercant.slug}?empreinte=annule`,
    }, {
      stripeAccount: commercant.stripe_account_id,
    })

    return NextResponse.json({ ok: true, url: session.url, session_id: session.id, montant })
  } catch (e) {
    console.error('[create-rdv-empreinte] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || 'erreur serveur' }, { status: 500 })
  }
}
