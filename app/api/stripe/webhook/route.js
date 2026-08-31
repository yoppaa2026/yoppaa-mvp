// POST /api/stripe/webhook
//
// Handler central des webhooks Stripe. Reçoit TOUS les événements (paiements,
// refunds, account updates) et dispatche selon event.type.
//
// Sécurité : on vérifie OBLIGATOIREMENT la signature Stripe (header stripe-signature)
// pour éviter qu'un attaquant POST des events forgés. Sans signature valide → 401.
//
// Idempotency : Stripe peut renvoyer le même event plusieurs fois (retries). On
// stocke chaque event_id dans stripe_webhook_events avant traitement, et on
// skip si déjà vu. Évite de créer 2 RDV pour 1 paiement.
//
// Events gérés (Phase 1 MVP) :
//   • payment_intent.succeeded   → si kind=rdv_acompte : crée le RDV en DB
//   • payment_intent.payment_failed → log + alerte (pas de RDV créé)
//   • charge.refunded             → met à jour rdv_reservations.stripe_refund_id
//   • account.updated             → met à jour commercants.stripe_account_charges_enabled
//
// IMPORTANT : Next.js App Router POST a besoin du body RAW pour vérifier la
// signature (signature calculée sur le body byte-par-byte, pas après JSON.parse).

import { NextResponse } from 'next/server'
import { eurosNus } from '@/lib/montants'
import { createClient } from '@supabase/supabase-js'
import { stripe, STRIPE_CONFIG, PAYMENT_KIND } from '@/lib/stripe'
import { envoyerAuCommercant, emailRdvConfirme, emailNouveauRdvCommercant, emailBonCadeauBeneficiaire, emailBonCadeauAcheteur, emailBonCadeauVenduCommercant, emailAbonnementConfirme, emailAbonnementVenduCommercant } from '@/lib/resend'
import { envoyerEmailsCommande } from '@/lib/commande-notifs'
import { debiterBon, recrediterBon } from '@/lib/bons-cadeaux-server'
import { libelleBon } from '@/lib/bons-cadeaux'
import { consommerRecompense, rendreRecompense } from '@/lib/fidelite-recompense-server'
import { generateRdvIcs, icsToBase64Attachment } from '@/lib/ical'
import { referenceRdv } from '@/lib/numero-commande'
import { programmerRappelRdv } from '@/lib/rappels'
import { recupererFraisStripe, ventilerFrais } from '@/lib/stripe-frais'
import { crediterFidelite } from '@/lib/fidelite-server'
import { canDo } from '@/lib/plans'
import { jourBruxelles } from '@/lib/timezone'
import { contratDepuisFormule, resumeContratAchete } from '@/lib/abonnements'
import { adresseRendezVous } from '@/lib/lieu-fige'
import { restaurerStockVariantes } from '@/lib/stock-variantes-server'
import { normaliserEmail } from '@/lib/email-normalise'
import { creerReservationRdv, appliquerAvantagesRdv } from '@/lib/rdv-creation-server'

// Service role (bypass RLS pour les UPDATE depuis webhook)
// Note : en App Router Next.js, pas besoin de `export const config = {api:{bodyParser:false}}`
// (vestige du Pages Router). request.text() ci-dessous retourne déjà le raw body intact.
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function POST(request) {
  if (!stripe || !STRIPE_CONFIG.webhookSecret) {
    return NextResponse.json({ ok: false, error: 'Stripe non configuré' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ ok: false, error: 'signature manquante' }, { status: 401 })
  }

  const rawBody = await request.text()

  // 1. Vérification signature (anti-forge)
  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_CONFIG.webhookSecret)
  } catch (e) {
    console.error('[stripe/webhook] invalid signature', e.message)
    return NextResponse.json({ ok: false, error: 'signature invalide' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // 2. Idempotency : skip si event_id déjà traité
  const { data: existing } = await supabase
    .from('stripe_webhook_events')
    .select('event_id, status')
    .eq('event_id', event.id)
    .maybeSingle()

  if (existing) {
    console.info('[stripe/webhook] event déjà traité, skip', { id: event.id, type: event.type })
    return NextResponse.json({ ok: true, skipped: true })
  }

  // 3. Insert l'event AVANT le traitement (lock idempotency). En cas d'échec on
  //    met à jour status='error', sinon on laisse 'ok'.
  await supabase.from('stripe_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    account_id: event.account || null,
    payload: event,                         // full event pour debug
  })

  // 4. Dispatch selon event.type
  try {
    switch (event.type) {

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object, supabase, event.account)
        break

      case 'checkout.session.completed':
        // Backup : stocke session_id direct depuis l'event (sans aller chercher
        // la session via Stripe API qui peut echouer en mode test).
        await handleCheckoutSessionCompleted(event.data.object, supabase)
        break

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        console.warn('[stripe/webhook] payment failed/canceled', { id: event.data.object.id, type: event.type })
        await handlePaymentIntentFailed(event.data.object, supabase)
        break

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object, supabase)
        break

      case 'account.updated':
        await handleAccountUpdated(event.data.object, supabase)
        break

      default:
        // On log mais on ne fail pas (events qu'on n'écoute pas, c'est normal)
        console.info('[stripe/webhook] event non géré', event.type)
    }

    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error('[stripe/webhook] error processing', event.type, e)
    await supabase
      .from('stripe_webhook_events')
      .update({ status: 'error', error_msg: e?.message || String(e) })
      .eq('event_id', event.id)
    // On retourne 500 pour que Stripe retry. Sauf si erreur business non-recoverable.
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}


// ─── Handlers spécifiques par event.type ────────────────────────────────────

// payment_intent.succeeded : crée le RDV en DB depuis les metadata
async function handlePaymentIntentSucceeded(paymentIntent, supabase, eventAccount = null) {
  const meta = paymentIntent.metadata || {}
  const kind = meta.yoppaa_kind

  // Le tunnel unique (rendez-vous + produits) suit exactement le même chemin
  // que l'acompte seul : le rendez-vous naît du paiement, jamais avant, sinon
  // un abandon de paiement bloquerait un créneau réel dans l'agenda du salon.
  // Seule différence : une commande existe déjà, il faut la confirmer et la
  // lier au rendez-vous.
  if (kind === PAYMENT_KIND.RDV_ACOMPTE || kind === PAYMENT_KIND.RDV_COMMANDE) {
    const avecProduits = kind === PAYMENT_KIND.RDV_COMMANDE
    // Vérif anti-double-création (au cas où l'idempotency aurait failli)
    if (meta.yoppaa_rdv_id) {
      const { data: existing } = await supabase
        .from('rdv_reservations')
        .select('id')
        .eq('id', meta.yoppaa_rdv_id)
        .maybeSingle()
      if (existing) return  // RDV déjà créé, skip
    }

    // Crée le RDV avec acompte_paye_en_ligne=true
    //
    // ⚠️ LE LIEU, LA CAPACITÉ, LA PLACE ET LA TVA NE SONT PLUS CONSTRUITS ICI :
    // ils viennent de `creerReservationRdv`, comme pour les trois autres écrans
    // qui créent un rendez-vous. Ce bloc ne porte plus que ce qui est PROPRE au
    // paiement Stripe.
    const rdvId = meta.yoppaa_rdv_id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null)
    const champs = {
      praticien_id: meta.praticien_id || null,
      // ⚠️ Normalisé : le rendez-vous naît ICI, à partir des métadonnées Stripe.
      // Enregistré tel que tapé, il disparaissait de l'écran du client dès qu'il
      // se connectait, `identiteYopper` relisant l'email en minuscules.
      client_email: normaliserEmail(meta.client_email),
      client_prenom: meta.client_prenom,
      client_nom: meta.client_nom,
      client_telephone: meta.client_telephone,
      heure_fin: meta.heure_fin,
      duree_minutes: Number(meta.duree_minutes) || null,
      prix_estime: Number(meta.prix_estime) || null,
      // ⚠️ LA REMISE EST FIGÉE SUR LE RENDEZ-VOUS, comme sur une commande.
      // `prix_estime` garde le tarif de la prestation ; c'est `fidelite_remise`
      // qui dit ce que le commerçant a offert, et tous les calculs de solde et
      // de chiffre d'affaires la retranchent (voir lib/rdv-paiement.js).
      fidelite_recompense_id: meta.fidelite_recompense_id || null,
      fidelite_remise: Number(meta.fidelite_remise) || 0,
      // ⚠️ ET LE BON CADEAU, DE LA MÊME FAÇON (28/08). Sans ces deux lignes, le
      // rendez-vous naîtrait au tarif plein alors que le client a payé un
      // acompte réduit : le comptoir lui réclamerait la différence, et le bon
      // ne serait jamais débité. Le débit lui-même se fait plus bas, APRÈS
      // l'insertion, pour que le mouvement puisse désigner le rendez-vous.
      bon_cadeau_id: meta.bon_cadeau_id || null,
      bon_cadeau_montant: Number(meta.bon_cadeau_montant) || 0,
      acompte_montant: Number(meta.acompte_montant) || null,
      // ⚠️ L'ACOMPTE *DÛ*, figé comme la TVA et le lieu. `null` s'il n'a pas
      // voyagé : « on ne sait pas » n'est pas « zéro », et le no-show le lit
      // ainsi pour ne garder que l'argent réellement encaissé.
      acompte_du: meta.acompte_du === undefined || meta.acompte_du === ''
        ? null
        : (Number.isFinite(Number(meta.acompte_du)) ? Number(meta.acompte_du) : null),
      // Une prestation sans acompte reste confirmée : le client a payé ses
      // produits, le salon a une réservation ferme (décision Alex 04/08).
      acompte_paye: Number(meta.acompte_montant) > 0,
      commande_id: meta.yoppaa_commande_id || null,
      statut: 'confirme',
      notes_client: meta.notes_client || null,
      rgpd_marketing: meta.rgpd_marketing === '1',
      source: 'yopper',
      stripe_payment_intent_id: paymentIntent.id,
      acompte_paye_en_ligne: Number(meta.acompte_montant) > 0,
      acompte_paye_date: Number(meta.acompte_montant) > 0 ? new Date().toISOString() : null,
    }

    // ─── Frais Stripe ──────────────────────────────────────────────────────
    //
    // ⚠️ DOUBLE COMPTAGE CORRIGÉ LE 05/08. L'export comptable additionne
    // `stripe_frais` des commandes ET des rendez-vous. Dans le tunnel unique,
    // un SEUL paiement porte l'acompte et les produits : écrire les frais
    // complets des deux côtés faisait apparaître deux fois la même dépense
    // dans la comptabilité du commerçant.
    //
    // Les frais sont donc VENTILÉS au prorata de ce que chaque objet
    // représente dans le paiement. C'est le traitement comptable juste :
    // chaque vente porte sa part du coût d'encaissement.
    const montantAcompte = Number(meta.acompte_montant) || 0
    const montantProduits = avecProduits ? (Number(meta.produits_montant) || 0) : 0
    let fraisPourCommande = null
    try {
      const frais = await recupererFraisStripe(paymentIntent.id, eventAccount || paymentIntent.on_behalf_of || null)
      if (frais) {
        const parts = avecProduits ? ventilerFrais(frais.frais, montantAcompte, montantProduits) : null
        if (parts) {
          champs.stripe_frais = parts.rdv.frais
          champs.stripe_net = parts.rdv.net
          fraisPourCommande = parts.commande
        } else {
          champs.stripe_frais = frais.frais
          champs.stripe_net = frais.net
        }
      }
    } catch (e) {
      console.warn('[webhook] frais Stripe RDV non enregistrés (non bloquant)', e?.message)
    }

    // ⚠️ LE LIEU GRAVÉ, LA CAPACITÉ GRAVÉE, LA PREMIÈRE PLACE LIBRE ET LA TVA
    // FIGÉE VIENNENT DU MODULE. Ces quatre gestes vivaient en quatre copies :
    // ici, dans la route d'abonnement, dans la modale du tableau de bord, et
    // dans l'écran du tunnel qui écrivait depuis le navigateur. La place, en
    // particulier, se calcule AU MOMENT DE L'ÉCRITURE : entre le clic du client
    // et l'arrivée de ce webhook, d'autres personnes ont pu s'inscrire.
    const resa = await creerReservationRdv(supabase, {
      rdvId,
      commercantId: meta.yoppaa_commercant_id,
      prestationId: meta.prestation_id,
      dateRdv: meta.date_rdv,
      heureDebut: meta.heure_debut,
      champs,
    })
    // ⚠️ ON RELANCE, comme avant : Stripe rejouera le webhook, et le garde
    // anti-double-création en tête de ce handler absorbe le rejeu. Le client a
    // payé, un rendez-vous manquant ne doit pas se perdre en silence.
    if (!resa.ok) throw new Error(`création RDV impossible (${resa.code}) : ${resa.error?.message || resa.code}`)
    const payload = resa.payload
    console.info('[stripe/webhook] RDV créé via paiement Stripe', { rdvId, pi: paymentIntent.id })

    // ─── LES DEUX AVANTAGES, APRÈS L'INSERT ────────────────────────────────
    //
    // ⚠️ APRÈS, JAMAIS AVANT : les deux mouvements DÉSIGNENT le rendez-vous, et
    // consommer d'abord brûlerait la récompense d'un rendez-vous qui n'existe
    // pas. Le rejeu est absorbé des deux côtés (`utilisee_at IS NULL` pour la
    // récompense, index unique partiel pour le bon).
    //
    // ⚠️ ET LE MODULE LIT LE RÉSULTAT du débit. Un `await` dont on ignore le
    // retour est un espoir, pas une action, et ici l'espoir coûte de l'argent
    // réel : le bon resterait crédité alors qu'il vient de payer.
    await appliquerAvantagesRdv(supabase, {
      rdvId: rdvId || meta.yoppaa_rdv_id || null,
      recompenseId: meta.fidelite_recompense_id || null,
      bonCadeauId: meta.bon_cadeau_id || null,
      bonMontant: Number(meta.bon_cadeau_montant) || 0,
    })

    // Tunnel unique : la commande de produits existe déjà en
    // 'paiement_en_attente'. On la confirme SANS ses propres emails, et on
    // écrit le lien des deux côtés. Sans ce lien, une annulation ne saurait
    // pas quelle part du paiement rembourser.
    if (avecProduits && meta.yoppaa_commande_id) {
      try {
        // `fraisVentiles` : la part des frais qui revient aux produits, déjà
        // calculée ci-dessus. Sans elle, la commande réécrirait les frais
        // COMPLETS du paiement et l'export les compterait deux fois.
        await handleCommandeSucceeded(paymentIntent, supabase, eventAccount, {
          sansEmails: true,
          fraisVentiles: fraisPourCommande,
        })
        await supabase
          .from('commandes')
          .update({ rdv_reservation_id: rdvId || meta.yoppaa_rdv_id })
          .eq('id', meta.yoppaa_commande_id)
      } catch (e) {
        // Le rendez-vous est créé et le client a payé : on ne relance pas
        // l'erreur, sinon Stripe rejouerait tout le webhook et créerait un
        // second rendez-vous. On alerte, la commande se rattrape à la main.
        console.error('[stripe/webhook] confirmation de la commande liée KO', { commandeId: meta.yoppaa_commande_id, rdvId, err: e?.message })
      }
    }

    // Tentative de stockage du session_id via Stripe API.
    // En mode test Direct Charge ca peut echouer (bug Stripe sandbox).
    // Le backup checkout.session.completed handler le stockera plus tard si echec ici.
    try {
      // Utilise eventAccount (= event.account passe depuis le webhook) qui est plus
      // fiable que paymentIntent.on_behalf_of (parfois null en Direct Charge).
      const stripeAccountId = eventAccount || paymentIntent.on_behalf_of || null
      const listOpts = stripeAccountId ? { stripeAccount: stripeAccountId } : {}
      console.info('[webhook/PI succeeded] tentative list sessions', { pi: paymentIntent.id, stripeAccountId })
      const sessions = await stripe.checkout.sessions.list(
        { payment_intent: paymentIntent.id, limit: 1 },
        listOpts
      )
      const sessionId = sessions?.data?.[0]?.id || null
      if (sessionId) {
        await supabase
          .from('rdv_reservations')
          .update({ stripe_checkout_session_id: sessionId })
          .eq('id', rdvId || meta.yoppaa_rdv_id)
        console.info('[stripe/webhook] session_id stocke OK', { rdvId, sessionId })
      } else {
        console.warn('[stripe/webhook] session_id non trouve via list, fallback sur checkout.session.completed', paymentIntent.id)
      }
    } catch (e) {
      console.error('[stripe/webhook] list+stockage session_id KO (non-bloquant)', e?.message)
    }

    // Envoi des emails (non-bloquant : si l'envoi plante, on garde le RDV cree)
    try {
      await envoyerEmailsRdvConfirme(supabase, rdvId || meta.yoppaa_rdv_id, payload)
    } catch (e) {
      console.error('[stripe/webhook] envoi emails RDV KO (non-bloquant)', e)
    }
    return
  }

  if (kind === PAYMENT_KIND.COMMANDE_TOTAL) {
    await handleCommandeSucceeded(paymentIntent, supabase, eventAccount)
    return
  }

  if (kind === PAYMENT_KIND.BON_CADEAU) {
    await handleBonCadeauSucceeded(paymentIntent, supabase)
    return
  }

  if (kind === PAYMENT_KIND.ABONNEMENT) {
    // ⚠️ `eventAccount` VOYAGE JUSQU'ICI, comme pour les commandes et les
    // rendez-vous : en Direct Charge, le relevé des frais Stripe vit sur le
    // COMPTE CONNECTÉ du commerçant, et le chercher sur le compte de la
    // plateforme ne rend rien, sans la moindre erreur.
    await handleAbonnementSucceeded(paymentIntent, supabase, eventAccount)
    return
  }

  console.warn('[stripe/webhook] kind non reconnu dans payment_intent.succeeded', { kind, meta })
}

// ─── Abonnement acheté en ligne : paiement OK → le contrat naît ────────────
//
// ⚠️ LE CONTRAT NAÎT ICI ET NULLE PART AILLEURS. Le créer au moment du clic
// aurait produit un abonnement à chaque panier abandonné, et un solde de
// séances offert à qui ferme l'onglet. Même règle que l'acompte d'un
// rendez-vous depuis le 04/08.
//
// ⚠️ ET C'EST IDEMPOTENT. Stripe rejoue ses webhooks, c'est normal et
// documenté. Sans ce garde-fou, une cliente qui paie une fois se retrouverait
// avec deux contrats, donc le double de séances, et personne ne saurait
// lequel est le bon. On reconnaît un rejeu à la référence du paiement.
async function handleAbonnementSucceeded(paymentIntent, supabase, eventAccount = null) {
  const meta = paymentIntent.metadata || {}
  const formuleId = meta.formule_id
  if (!formuleId) {
    console.warn('[stripe/webhook] abonnement sans formule_id', paymentIntent.id)
    return
  }

  const { data: dejaLa } = await supabase
    .from('abonnements')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .maybeSingle()
  if (dejaLa) {
    console.info('[stripe/webhook] abonnement déjà créé, rejeu ignoré', { id: dejaLa.id })
    return
  }

  const { data: formule } = await supabase
    .from('abonnement_formules')
    .select('*')
    .eq('id', formuleId)
    .maybeSingle()
  if (!formule) {
    console.error('[stripe/webhook] formule introuvable', formuleId)
    return
  }

  // ⚠️ LA DATE D'ACHAT VIENT DE STRIPE, pas de notre horloge. Un webhook rejoué
  // trois jours plus tard fabriquerait sinon une fenêtre de validité décalée de
  // trois jours, et un carnet de six mois n'aurait pas la durée vendue.
  //
  // ⚠️ ET EN HEURE BELGE, PAS EN TEMPS UNIVERSEL. Découper l'instant en UTC
  // rend le jour de Greenwich : un abonnement acheté à 00h30 chez nous serait
  // daté de la VEILLE, et une année de yoga commencerait un jour trop tôt.
  // Même défaut que celui trouvé par Alex le 19/08 sur le journal comptable.
  const achatLe = jourBruxelles(new Date((paymentIntent.created || Math.floor(Date.now() / 1000)) * 1000))

  const contrat = contratDepuisFormule(formule, {
    achatLe,
    // ⚠️ L'INSTANT, en plus du jour : c'est lui qui donne son heure à la ligne
    // comptable. Sans lui, `paye_le` recevait un jour nu, rangé à minuit
    // universel, et l'export affichait « 02:00 » pour toutes les ventes.
    payeA: new Date((paymentIntent.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    commercantId: formule.commercant_id,
    client: {
      email: meta.client_email,
      prenom: meta.client_prenom,
      nom: meta.client_nom,
      telephone: meta.client_telephone,
    },
  })
  if (!contrat) {
    console.error('[stripe/webhook] contrat incalculable', { formuleId, achatLe })
    return
  }

  // ⚠️ LE NOMBRE DE SÉANCES VIENT DU PAIEMENT, pas d'un recalcul. Un commerçant
  // qui modifie ses congés entre le clic et l'encaissement livrerait sinon
  // autre chose que ce qui a été payé, et c'est le client qui aurait raison.
  const seancesPayees = Number.parseInt(meta.seances_total, 10)
  if (Number.isFinite(seancesPayees) && seancesPayees > 0) {
    contrat.seances_total = seancesPayees
  }

  // ⚠️ LA VENTE D'UN ABONNEMENT N'EXISTAIT DANS AUCUN DOCUMENT COMPTABLE (Alex,
  // 17/08). Elle n'écrit que dans `abonnements`, jamais une commande, et
  // l'export ne lisait que les commandes et les rendez-vous. Deux colonnes
  // manquaient donc à l'appel, et ce sont exactement celles d'un rendez-vous.
  //
  // TVA FIGÉE À LA VENTE, reprise de la prestation que l'abonnement paie. Le
  // taux est lu maintenant et ne sera plus jamais recalculé : un changement de
  // taux l'an prochain ne doit pas réécrire un contrat déjà vendu.
  let tvaTaux = null
  if (formule.prestation_id) {
    const { data: presta } = await supabase
      .from('rdv_prestations')
      .select('tva_taux')
      .eq('id', formule.prestation_id)
      .maybeSingle()
    tvaTaux = presta?.tva_taux ?? null
  }

  // FRAIS STRIPE : ils n'étaient nulle part. La commission d'un abonnement à
  // trois chiffres n'est pas une broutille, et le commerçant la découvrait sur
  // son relevé Stripe sans jamais la voir dans sa Comptabilité.
  //
  // ⚠️ Aucune ventilation ici, contrairement au tunnel unique : un abonnement
  // se paie SEUL, son paiement ne porte ni produits ni acompte. La totalité des
  // frais lui revient donc, et il n'y a aucun double comptage possible.
  let fraisAbo = null
  try {
    fraisAbo = await recupererFraisStripe(paymentIntent.id, eventAccount || paymentIntent.on_behalf_of || null)
  } catch (e) {
    console.warn('[stripe/webhook] frais Stripe abonnement non enregistrés (non bloquant)', e?.message)
  }

  const { data: cree, error } = await supabase
    .from('abonnements')
    .insert({
      ...contrat,
      stripe_payment_intent_id: paymentIntent.id,
      tva_taux: tvaTaux,
      stripe_frais: fraisAbo ? fraisAbo.frais : null,
      stripe_net: fraisAbo ? fraisAbo.net : null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[stripe/webhook] insert abonnement KO', error)
    return
  }
  console.info('[stripe/webhook] abonnement créé', { id: cree?.id, formuleId, seances: contrat.seances_total })

  // ⚠️ L'EMAIL MANQUAIT, ET C'ÉTAIT LE PLUS GRAVE DES TROIS SILENCES trouvés
  // par Alex le 16/08 en payant réellement 400 €. Le contrat se créait, le
  // commerçant le voyait dans ses Abonnés, et l'acheteur ne recevait RIEN.
  //
  // ⚠️ POUR UN MONTANT À TROIS CHIFFRES, UNE PREUVE D'ACHAT N'EST PAS UN
  // CONFORT. C'est la première chose qu'on cherche quand ça se passe mal.
  //
  // ⚠️ ET L'ENVOI NE DOIT JAMAIS FAIRE ÉCHOUER LE WEBHOOK. Une erreur d'envoi
  // remontée ferait répondre 500 à Stripe, qui rejouerait l'événement : le
  // contrat est déjà créé, on fabriquerait donc des doublons pour un email qui
  // n'est pas parti. L'abonnement existe, c'est ce qui compte ; l'email se
  // rattrape, un contrat en double se paie.
  try {
    const { data: com } = await supabase
      .from('commercants').select('nom, slug').eq('id', formule.commercant_id).maybeSingle()
    const resume = resumeContratAchete(
      { ...contrat, prix_paye: formule.prix },
      { nomCommerce: com?.nom || '', nomFormule: formule.libelle || '' },
    )
    if (contrat.client_email) {
      await envoyerAuCommercant({
        to: contrat.client_email,
        subject: `Ton abonnement chez ${com?.nom || 'ton commerçant'} est actif`,
        html: emailAbonnementConfirme({
          yopper_prenom: contrat.client_prenom || '',
          commercant_nom: com?.nom || '',
          resume,
          mes_abonnements_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.yoppaa.app'}/commander`,
        }),
      })
    }
    // Le commerçant est prévenu comme pour un bon cadeau vendu : c'est une
    // rentrée d'argent, et la plus grosse de son catalogue.
    if (com?.nom) {
      const { data: comEmail } = await supabase
        .from('commercants').select('email, notif_mode').eq('id', formule.commercant_id).maybeSingle()
      if (comEmail?.notif_mode === 'chaque' && comEmail?.email) {
        await envoyerAuCommercant({
          to: comEmail.email,
          subject: `Abonnement vendu · ${eurosNus(Number(formule.prix))} €`,
          html: emailAbonnementVenduCommercant({
            nom_commercant: com.nom,
            client_prenom: contrat.client_prenom || '',
            client_nom: contrat.client_nom || '',
            resume,
          }),
        })
      }
    }
  } catch (e) {
    console.error('[stripe/webhook] emails abonnement KO', e?.message)
  }
}

// ─── Bon cadeau : paiement OK → activation + emails ─────────────────────────
//
// Le bon EXISTE déjà (créé par /api/bons-cadeaux/checkout en
// statut='paiement_en_attente'). Idempotent : si déjà actif, on ne renvoie
// pas les emails (webhook rejoué).
async function handleBonCadeauSucceeded(paymentIntent, supabase) {
  const bonId = paymentIntent.metadata?.yoppaa_bon_id
  if (!bonId) {
    console.warn('[stripe/webhook] bon_cadeau sans yoppaa_bon_id', paymentIntent.id)
    return
  }
  const { data: bon } = await supabase
    .from('bons_cadeaux')
    .select('*, commercant:commercants(id, nom, slug, categorie, email, notif_mode)')
    .eq('id', bonId)
    .maybeSingle()
  if (!bon) {
    console.error('[stripe/webhook] bon cadeau introuvable', bonId)
    return
  }
  if (bon.statut === 'actif') return  // rejeu : déjà activé, emails déjà partis

  const { error: errUp } = await supabase
    .from('bons_cadeaux')
    .update({ statut: 'actif', updated_at: new Date().toISOString() })
    .eq('id', bonId)
    .eq('statut', 'paiement_en_attente')
  if (errUp) throw errUp
  console.info('[stripe/webhook] bon cadeau activé', { bonId, montant: bon.montant_initial })

  // ─── Fidélité de l'ACHETEUR ───────────────────────────────────────────────
  // Acheter un bon cadeau ne remplissait pas la carte (signalé par Alex le
  // 07/08). C'est pourtant de l'argent réellement dépensé chez ce commerçant,
  // et l'achat le plus engageant qui soit.
  //
  // C'est bien l'ACHETEUR qui est crédité, pas le bénéficiaire : c'est lui qui
  // a payé. Le bénéficiaire, lui, sera crédité de ce qu'il ajoutera de sa
  // poche le jour où il utilisera le bon (la part couverte par le bon est
  // déduite dans lib/lignes-commande, sans quoi la même dépense compterait
  // deux fois).
  //
  // Mécanique « passages » : on ne compte RIEN. Un bon s'achète en ligne, il
  // n'y a pas eu de visite, et un tampon sans passage fausse le programme.
  //
  // Le téléphone vient de la fiche client rattachée à l'email d'achat : le
  // formulaire de bon cadeau ne le demande pas, et l'ajouter alourdirait un
  // tunnel de paiement pour un cas qui se résout tout seul. Sans fiche, pas de
  // crédit, et c'est sans gravité.
  try {
    const com = bon.commercant
    if (com?.id && bon.acheteur_email) {
      const { data: complet } = await supabase
        .from('commercants').select('*').eq('id', com.id).maybeSingle()
      if (complet?.fidelite_actif
          && canDo(complet.plan, 'fidelite_auto')
          && complet.fidelite_mecanique === 'cagnotte') {
        const { data: client } = await supabase
          .from('clients').select('telephone')
          .eq('email', String(bon.acheteur_email).toLowerCase())
          .maybeSingle()
        if (client?.telephone) {
          await crediterFidelite(supabase, complet, client.telephone,
            { montant: Number(bon.montant_initial || 0) },
            { source: 'bon_cadeau', bon_cadeau_id: bon.id, client_email: bon.acheteur_email })
        }
      }
    }
  } catch (e) {
    console.error('[stripe/webhook] fidelite bon cadeau KO (non bloquant)', e?.message)
  }

  // Emails (non-bloquants) : bénéficiaire OU acheteur selon le mode, + reçu
  // acheteur, + notification commerçant (mode 'chaque').
  const pourMoi = bon.destinataire_mode !== 'offrir'
  // Le nom du bon suit le metier du commerce, jusque dans l objet de l email.
  const nomBon = libelleBon(bon.commercant?.categorie)
  try {
    if (!pourMoi) {
      await envoyerAuCommercant({
        to: bon.beneficiaire_email,
        subject: `${bon.acheteur_prenom ? bon.acheteur_prenom + ' t\'offre' : 'On t\'offre'} un ${nomBon} chez ${bon.commercant?.nom || 'un commerçant'}`,
        html: emailBonCadeauBeneficiaire({
          beneficiaire_prenom: bon.beneficiaire_prenom,
          acheteur_prenom: bon.acheteur_prenom,
          commercant_nom: bon.commercant?.nom || '',
          montant: bon.montant_initial,
          code: bon.code,
          token: bon.token,
          message: bon.message,
          expires_at: bon.expires_at,
          commercant_categorie: bon.commercant?.categorie || null,
        }),
      })
    }
    await envoyerAuCommercant({
      to: bon.acheteur_email,
      subject: pourMoi
        ? `Ton ${nomBon} chez ${bon.commercant?.nom || 'le commerçant'} est prêt`
        : `Ton cadeau chez ${bon.commercant?.nom || 'le commerçant'} est envoyé`,
      html: emailBonCadeauAcheteur({
        acheteur_prenom: bon.acheteur_prenom,
        commercant_nom: bon.commercant?.nom || '',
        montant: bon.montant_initial,
        code: pourMoi ? bon.code : null,
        token: pourMoi ? bon.token : null,
        beneficiaire_email: bon.beneficiaire_email,
        beneficiaire_prenom: bon.beneficiaire_prenom,
        expires_at: bon.expires_at,
        pour_moi: pourMoi,
        commercant_categorie: bon.commercant?.categorie || null,
      }),
    })
    if (bon.commercant?.notif_mode === 'chaque' && bon.commercant?.email) {
      await envoyerAuCommercant({
        to: bon.commercant.email,
        subject: `${libelleBon(bon.commercant?.categorie, { majuscule: true })} vendu · ${eurosNus(Number(bon.montant_initial))} €`,
        html: emailBonCadeauVenduCommercant({
          nom_commercant: bon.commercant.nom,
          montant: bon.montant_initial,
          acheteur_email: bon.acheteur_email,
          pour_moi: pourMoi,
          commercant_categorie: bon.commercant?.categorie || null,
        }),
      })
    }
  } catch (e) {
    console.error('[stripe/webhook] emails bon cadeau KO (non-bloquant)', e?.message)
  }
}

// ─── Commande C&C : paiement OK → bascule paiement_en_attente -> en_attente ─
//
// La commande EXISTE déjà en DB (créée par /api/stripe/checkout/create-commande
// avec statut='paiement_en_attente'). Le webhook fait juste la transition
// d'état + envoie les emails de confirmation.
// `sansEmails` : la commande est celle d'un tunnel unique, ses produits sont
// déjà annoncés dans l'email du rendez-vous. Deux confirmations pour un seul
// paiement font douter le client d'avoir payé deux fois.
async function handleCommandeSucceeded(paymentIntent, supabase, eventAccount = null, { sansEmails = false, fraisVentiles = null } = {}) {
  const meta = paymentIntent.metadata || {}
  const commandeId = meta.yoppaa_commande_id
  if (!commandeId) {
    console.warn('[webhook/commande] yoppaa_commande_id absent dans metadata', { pi: paymentIntent.id })
    return
  }

  // Idempotence : si commande déjà confirmée (statut autre que paiement_en_attente
  // ET paye_en_ligne déjà true), on skip.
  const { data: existing } = await supabase
    .from('commandes')
    .select('id, statut, paye_en_ligne, commercant_id, bon_cadeau_id, bon_cadeau_montant, fidelite_recompense_id')
    .eq('id', commandeId)
    .maybeSingle()
  if (!existing) {
    console.warn('[webhook/commande] commande introuvable', { commandeId, pi: paymentIntent.id })
    return
  }
  if (existing.statut !== 'paiement_en_attente' && existing.paye_en_ligne === true) {
    console.info('[webhook/commande] commande déjà confirmée, skip', { commandeId, statut: existing.statut })
    return
  }

  // Bascule paiement_en_attente → en_attente + paye_en_ligne=true
  const { error: errUpd } = await supabase
    .from('commandes')
    .update({
      statut: 'en_attente',
      paye_en_ligne: true,
      paye_en_ligne_date: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntent.id,
    })
    .eq('id', commandeId)
  if (errUpd) throw errUpd

  // Frais Stripe réels et net versé au commerçant. Non bloquant : si la
  // transaction de solde n'est pas encore constituée, on ne touche à rien et
  // le cron nocturne complétera. Écrire un zéro serait pire que ne rien écrire.
  //
  // `fraisVentiles` : dans le tunnel unique, le rendez-vous a déjà pris sa part
  // des frais du paiement commun. On écrit ici le complément, jamais le total,
  // sinon l'export comptable compterait deux fois la même dépense.
  try {
    const compte = eventAccount || paymentIntent.on_behalf_of || null
    const frais = fraisVentiles || await recupererFraisStripe(paymentIntent.id, compte)
    if (frais) {
      await supabase.from('commandes')
        .update({ stripe_frais: frais.frais, stripe_net: frais.net })
        .eq('id', commandeId)
    }
  } catch (e) {
    console.warn('[webhook] frais Stripe non enregistrés (non bloquant)', e?.message)
  }

  // Tentative stockage session_id (peut échouer en sandbox Stripe → backup
  // par handleCheckoutSessionCompleted)
  try {
    const stripeAccountId = eventAccount || paymentIntent.on_behalf_of || null
    const listOpts = stripeAccountId ? { stripeAccount: stripeAccountId } : {}
    const sessions = await stripe.checkout.sessions.list(
      { payment_intent: paymentIntent.id, limit: 1 },
      listOpts
    )
    const sessionId = sessions?.data?.[0]?.id || null
    if (sessionId) {
      await supabase
        .from('commandes')
        .update({ stripe_checkout_session_id: sessionId })
        .eq('id', commandeId)
    }
  } catch (e) {
    console.error('[webhook/commande] list session_id KO (non-bloquant)', e?.message)
  }

  // Bon cadeau utilisé sur la commande : débit du solde MAINTENANT (le
  // paiement du reste est confirmé). Idempotent via l'index unique
  // (bon_id, commande_id) : un webhook rejoué ne débite pas deux fois.
  if (existing.bon_cadeau_id && Number(existing.bon_cadeau_montant) > 0) {
    const deb = await debiterBon(supabase, existing.bon_cadeau_id, existing.bon_cadeau_montant, {
      source: 'commande',
      commande_id: commandeId,
    })
    if (!deb.ok) console.error('[webhook/commande] débit bon cadeau KO', deb.error, { commandeId })
  }

  // ─── RÉCOMPENSE DE FIDÉLITÉ : consommée ICI, et nulle part avant ─────────
  //
  // ⚠️ C'EST LE SEUL MOMENT OÙ ELLE EST RÉELLEMENT DÉPENSÉE sur le chemin en
  // ligne. `create-commande` l'a seulement RÉSERVÉE en l'inscrivant sur la
  // commande : un Yopper qui ouvre Stripe et ferme son onglet ne perd rien,
  // exactement comme pour le bon cadeau.
  //
  // ⚠️ ET UN WEBHOOK REJOUÉ NE PEUT PAS LA DÉPENSER DEUX FOIS :
  // `consommerRecompense` écrit sous `utilisee_at IS NULL`. Le second passage
  // ne trouve plus de ligne, rend `false`, et se contente d'une trace. Stripe
  // rejoue ses événements, ce n'est pas une hypothèse d'école.
  if (existing.fidelite_recompense_id) {
    const { data: rec } = await supabase
      .from('fidelite_recompenses')
      .select('id, carte_id, utilisee_at')
      .eq('id', existing.fidelite_recompense_id)
      .maybeSingle()
    if (rec && !rec.utilisee_at) {
      const prise = await consommerRecompense(supabase, {
        recompense: rec,
        source: 'commande',
        commandeId,
      })
      if (!prise) console.warn('[webhook/commande] récompense déjà consommée', { commandeId })
    }
  }

  // Libération des réservations stock : la commande EST désormais le stock
  // consommé, plus besoin de la garde TTL 5 min.
  await supabase
    .from('commande_stock_reservation')
    .delete()
    .eq('commande_id', commandeId)

  // Email confirmation Yopper + commerçant
  // NB : appel DIRECT des helpers (pas de fetch HTTP interne vers /api/emails/...)
  // Évite le 307 yoppaa.app → www.yoppaa.app qui peut casser le POST côté Node fetch.
  // Pattern aligné sur les RDV qui marchent déjà comme ça.
  if (!sansEmails) await envoyerEmailsCommande(commandeId, supabase)

  console.info('[webhook/commande] confirmée OK', { commandeId, pi: paymentIntent.id, sansEmails })
}

// ─── (envoyerEmailsCommande : déplacé dans lib/commande-notifs.js le 23/07,
// ─── partagé avec le chemin « paiement sur place » de create-commande.)

// ─── Paiement KO (failed/canceled) : commande -> annulee_paiement_ko ────────
//
// Couvre :
//   - payment_intent.payment_failed : 3DS refusé, carte refusée, etc.
//   - payment_intent.canceled : client a fermé Stripe Checkout (cancel_url)
//                                ou timeout session (24h Stripe default)
//
// Effet : libère immédiatement le stock réservé pour ne pas bloquer d'autres
// clients (au lieu d'attendre l'expiration TTL 5 min).
async function handlePaymentIntentFailed(paymentIntent, supabase) {
  const meta = paymentIntent.metadata || {}
  // Un acompte seul qui échoue ne laisse rien derrière lui : le rendez-vous
  // n'était pas encore créé. Le tunnel unique, lui, a déjà posé une commande
  // et réservé du stock : sans ce passage, la marchandise resterait bloquée
  // jusqu'à l'expiration, pour un paiement qu'on sait déjà perdu.
  if (meta.yoppaa_kind !== PAYMENT_KIND.COMMANDE_TOTAL && meta.yoppaa_kind !== PAYMENT_KIND.RDV_COMMANDE) {
    return
  }
  const commandeId = meta.yoppaa_commande_id
  if (!commandeId) return

  const { data: existing } = await supabase
    .from('commandes')
    .select('id, statut')
    .eq('id', commandeId)
    .maybeSingle()
  if (!existing) {
    console.warn('[webhook/PI failed] commande introuvable', { commandeId })
    return
  }
  if (existing.statut !== 'paiement_en_attente') {
    console.info('[webhook/PI failed] commande déjà traitée, skip', { commandeId, statut: existing.statut })
    return
  }

  // ⚠️ LE FILTRE SUR L'ANCIEN STATUT EST DANS L'UPDATE, pas seulement dans la
  // lecture au-dessus. Deux livraisons du même événement en parallèle passent
  // toutes les deux la lecture ; une seule fait basculer la ligne. C'est cette
  // bascule, et elle seule, qui autorise à rendre le stock plus bas.
  const { data: basculees } = await supabase
    .from('commandes')
    .update({ statut: 'annulee_paiement_ko' })
    .eq('id', commandeId)
    .eq('statut', 'paiement_en_attente')
    .select('id')

  // Libère immédiatement les réservations stock (alimentaire)
  await supabase
    .from('commande_stock_reservation')
    .delete()
    .eq('commande_id', commandeId)

  // ⚠️ ET LE STOCK DES VERSIONS (boutique détail), que RIEN ne rendait. Il est
  // décrémenté en dur avant le paiement : un client qui ferme Stripe Checkout
  // emportait donc sa pièce définitivement hors des rayons de Yoppaa, alors
  // qu'elle n'avait jamais quitté l'étagère du magasin. L'abandon de panier
  // étant le cas le plus courant du commerce en ligne, le stock d'une boutique
  // se vidait tout seul jusqu'à afficher « épuisé » sur des articles
  // parfaitement disponibles.
  if ((basculees || []).length > 0) {
    const restitution = await restaurerStockVariantes(supabase, [commandeId])
    if (!restitution.ok) {
      console.error('[webhook/PI failed] restitution stock versions KO', restitution.error, { commandeId })
    }
  }

  console.info('[webhook/PI failed] commande annulée KO + stock libéré', { commandeId, pi: paymentIntent.id })
}

// charge.refunded : met à jour le RDV/commande avec l'info de refund
async function handleChargeRefunded(charge, supabase) {
  const paymentIntentId = charge.payment_intent
  if (!paymentIntentId) return

  const refund = charge.refunds?.data?.[0]
  if (!refund) return

  const updateData = {
    stripe_refund_id: refund.id,
    stripe_refund_amount: refund.amount / 100,
    stripe_refund_date: new Date().toISOString(),
  }

  // ─── Le rendez-vous ────────────────────────────────────────────────────
  //
  // 🔴 CE BLOC S'ARRÊTAIT ICI SUR UN `return`, ET IL COÛTAIT DEUX CHOSES.
  //
  // 1) Il ne rendait NI le bon cadeau NI la récompense du rendez-vous, alors
  //    que la branche « commande » juste en dessous le fait depuis le 28/08.
  //    Stripe ne rembourse que la part carte : le reste n'existe pas pour lui.
  // 2) Surtout, dans le tunnel RDV + produits, LE RENDEZ-VOUS ET LA COMMANDE
  //    PARTAGENT LE MÊME `payment_intent`. Trouver le rendez-vous et sortir
  //    empêchait donc la commande liée de recevoir son identifiant de
  //    remboursement, son passage en « annulée », son propre re-crédit et sa
  //    propre récompense. Un remboursement lancé depuis le tableau de bord
  //    Stripe ne faisait rien du tout.
  //
  // On traite maintenant les deux, dans l'ordre, et on ne sort plus.
  const { data: rdv } = await supabase
    .from('rdv_reservations')
    .select('id, bon_cadeau_id, bon_cadeau_montant, fidelite_recompense_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (rdv) {
    await supabase.from('rdv_reservations').update(updateData).eq('id', rdv.id)
    if (rdv.bon_cadeau_id && Number(rdv.bon_cadeau_montant) > 0) {
      // Idempotent via l'index unique (bon_id, rdv_id) sur source='annulation' :
      // déjà fait si /api/rdv/cancel est passée avant ce webhook.
      const rec = await recrediterBon(supabase, rdv.bon_cadeau_id, rdv.bon_cadeau_montant, { rdv_id: rdv.id })
      if (!rec.ok) console.error('[webhook/refund] re-crédit bon cadeau RDV KO', rec.error, { rdvId: rdv.id })
    }
    if (rdv.fidelite_recompense_id) {
      const { data: recFid } = await supabase
        .from('fidelite_recompenses')
        .select('id, carte_id, utilisee_at')
        .eq('id', rdv.fidelite_recompense_id)
        .maybeSingle()
      if (recFid?.utilisee_at) await rendreRecompense(supabase, recFid)
    }
    console.info('[stripe/webhook] refund enregistré sur RDV', { rdvId: rdv.id, refund: refund.id })
  }

  // ─── Et la commande, qui peut porter le MÊME paiement ──────────────────
  const { data: cmd } = await supabase
    .from('commandes')
    .select('id, statut, bon_cadeau_id, bon_cadeau_montant, fidelite_recompense_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (cmd) {
    // Si refund total (montant = total commande), on bascule en annulée.
    // Si refund partiel, on garde le statut courant (commande honorée + remboursement partiel).
    const isRefundTotal = Math.abs((refund.amount / 100) - Number(charge.amount) / 100) < 0.01
    const updates = { ...updateData }
    if (isRefundTotal && !['annulee_client_refund', 'annulee_paiement_ko'].includes(cmd.statut)) {
      updates.statut = 'annulee_client_refund'
    }
    await supabase.from('commandes').update(updates).eq('id', cmd.id)
    // Refund total d'une commande partiellement payée par bon cadeau : le
    // Stripe ne rembourse que la part carte, la part bon revient SUR le bon.
    // Idempotent (index unique source='annulation'), déjà fait si la route
    // /api/commande/cancel est passée avant ce webhook.
    if (isRefundTotal && cmd.bon_cadeau_id && Number(cmd.bon_cadeau_montant) > 0) {
      const rec = await recrediterBon(supabase, cmd.bon_cadeau_id, cmd.bon_cadeau_montant, { commande_id: cmd.id })
      if (!rec.ok) console.error('[webhook/refund] re-crédit bon cadeau KO', rec.error, { cmdId: cmd.id })
    }
    // ⚠️ MÊME RAISONNEMENT POUR LA RÉCOMPENSE, et c'est le frère du correctif
    // ci-dessus : une commande intégralement remboursée n'a jamais eu lieu. La
    // laisser consommée ferait perdre au Yopper une carte entière alors que le
    // commerçant lui a tout rendu. `rendreRecompense` ne rend que ce qui est
    // effectivement pris, donc un rejeu ne gonfle pas le compteur.
    if (isRefundTotal && cmd.fidelite_recompense_id) {
      const { data: recFid } = await supabase
        .from('fidelite_recompenses')
        .select('id, carte_id, utilisee_at')
        .eq('id', cmd.fidelite_recompense_id)
        .maybeSingle()
      if (recFid?.utilisee_at) await rendreRecompense(supabase, recFid)
    }
    console.info('[stripe/webhook] refund enregistré sur commande', {
      cmdId: cmd.id, refund: refund.id, isRefundTotal, newStatut: updates.statut || cmd.statut,
    })
  }
}

// checkout.session.completed : stocke le session_id sur le RDV qui correspond
// au payment_intent associe. Sert de BACKUP au cas ou la list dans
// handlePaymentIntentSucceeded a echoue (mode test Stripe peut etre capricieux).
//
// Cet event a TOUTES les infos directement (session.id + session.payment_intent).
// Pas besoin d'appel Stripe API → fiable a 100%.
//
// Ordre des events Stripe :
//   1. checkout.session.completed (juste apres paiement)
//   2. payment_intent.succeeded (juste apres aussi, parfois avant)
// Si #2 arrive en premier, #1 fait juste l'UPDATE post-creation.
// Si #1 arrive en premier, le RDV n'existe pas encore → on retry plus tard
// (mais ce cas est rare car les 2 events sont quasi-simultanes).
async function handleCheckoutSessionCompleted(session, supabase) {
  const sessionId = session.id
  const paymentIntentId = session.payment_intent
  if (!sessionId || !paymentIntentId) {
    console.warn('[webhook/session.completed] session ou PI manquant', { sessionId, paymentIntentId })
    return
  }

  // Cherche d'abord un RDV créé par payment_intent.succeeded
  const { data: rdv } = await supabase
    .from('rdv_reservations')
    .select('id, stripe_checkout_session_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (rdv) {
    if (rdv.stripe_checkout_session_id !== sessionId) {
      await supabase
        .from('rdv_reservations')
        .update({ stripe_checkout_session_id: sessionId })
        .eq('id', rdv.id)
      console.info('[webhook/session.completed] session_id RDV stocké via backup', { rdvId: rdv.id, sessionId })
    }
    return
  }

  // Sinon cherche une commande (créée AVANT le paiement par create-commande,
  // puis confirmée par handleCommandeSucceeded au payment_intent.succeeded)
  const { data: commande } = await supabase
    .from('commandes')
    .select('id, stripe_checkout_session_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (commande && commande.stripe_checkout_session_id !== sessionId) {
    await supabase
      .from('commandes')
      .update({ stripe_checkout_session_id: sessionId })
      .eq('id', commande.id)
    console.info('[webhook/session.completed] session_id commande stocké via backup', { commandeId: commande.id, sessionId })
  }
}

// Helper : envoie emailRdvConfirme (Yopper + iCal) + emailNouveauRdvCommercant
// (si notif_mode='chaque'). Appelé depuis handlePaymentIntentSucceeded apres
// insert RDV. Non-bloquant : erreurs loguees mais ne font pas planter le webhook.
async function envoyerEmailsRdvConfirme(supabase, rdvId, _fallbackPayload) {
  // Fetch les jointures fraiches pour avoir nom commercant + presta + email
  const { data: rdv } = await supabase
    .from('rdv_reservations')
    .select(`
      id, date_rdv, heure_debut, heure_fin, duree_minutes, prix_estime,
      numero_rdv, numero_prefixe,
      acompte_paye_en_ligne, acompte_montant, fidelite_remise, bon_cadeau_montant,
      client_email, client_prenom, client_nom, client_telephone, notes_client,
      annulation_token, commande_id,
      lieu_id, lieu_libelle, lieu_adresse,
      commercant:commercants(id, nom, slug, adresse, telephone, email, rdv_delai_annulation_heures, notif_mode, infos_pratiques),
      prestation:rdv_prestations(nom),
      praticien:rdv_praticiens(prenom, nom, couleur_hex)
    `)
    .eq('id', rdvId)
    .maybeSingle()

  // Tunnel unique : les produits achetés avec le rendez-vous vivent dans CET
  // email. Le client ne reçoit pas de confirmation de commande séparée, et le
  // commerçant lit dans le même message ce qu'il doit préparer.
  let produits = null
  if (rdv?.commande_id) {
    const { data: lignes } = await supabase
      .from('commande_articles')
      .select('quantite, prix_unitaire, article:articles(nom)')
      .eq('commande_id', rdv.commande_id)
    if (lignes && lignes.length > 0) {
      produits = {
        lignes: lignes.map(l => ({
          nom: l.article?.nom || 'Article',
          quantite: l.quantite,
          total: Number(l.prix_unitaire) * l.quantite,
        })),
        total: lignes.reduce((s, l) => s + Number(l.prix_unitaire) * l.quantite, 0),
      }
    }
  }

  // Fallback : si le RDV n'est pas (encore) findable, on construit depuis le payload.
  // Mais sans nom commercant ni presta, on ne peut pas envoyer un email decent → skip.
  if (!rdv?.commercant?.nom || !rdv?.prestation?.nom) {
    console.warn('[webhook/emails] RDV jointures incompletes, skip emails', { rdvId })
    return
  }

  // 1) Email Yopper + iCal
  if (rdv.client_email) {
    const ics = generateRdvIcs({
      id: rdv.id,
      date_rdv: rdv.date_rdv,
      heure_debut: rdv.heure_debut,
      heure_fin: rdv.heure_fin,
      prestation_nom: rdv.prestation.nom,
      commercant_nom: rdv.commercant.nom,
      commercant_adresse: adresseRendezVous(rdv),
      commercant_telephone: rdv.commercant.telephone,
      commercant_email: rdv.commercant.email,
      // ATTENDEE : sans lui, iOS ne propose pas le calendrier.
      client_email: rdv.client_email,
      client_nom: [rdv.client_prenom, rdv.client_nom].filter(Boolean).join(' '),
      prix_estime: rdv.prix_estime,
      rappel_24h: true,
      status: 'CONFIRMED',
      method: 'REQUEST',
      sequence: 0,
    })
    const attachment = icsToBase64Attachment(ics, `rdv-${rdv.id}.ics`)

    const html = emailRdvConfirme({
      yopper_prenom:           rdv.client_prenom || 'Yopper',
      commercant_nom:          rdv.commercant.nom,
      commercant_adresse:      adresseRendezVous(rdv),
      commercant_slug:         rdv.commercant.slug || '',
      prestation_nom:          rdv.prestation.nom,
      date_rdv:                rdv.date_rdv,
      heure_debut:             rdv.heure_debut,
      heure_fin:               rdv.heure_fin,
      duree_minutes:           rdv.duree_minutes,
      prix_estime:             rdv.prix_estime,
      // La MÊME référence qu'à l'écran et qu'à l'agenda du commerçant : « RV12 ».
      numero_rdv:              referenceRdv(rdv),
      acompte_paye:            !!(rdv.acompte_paye_en_ligne && rdv.acompte_montant),
      acompte_montant:         rdv.acompte_montant,
      // ⚠️ SANS ELLE, LE SOLDE ANNONCÉ IGNORE LA RÉCOMPENSE et le comptoir
      // réclame le tarif plein. Le gabarit la retranche via `soldeRdv`.
      fidelite_remise:         rdv.fidelite_remise || 0,
      bon_cadeau_montant:      rdv.bon_cadeau_montant || 0,
      delai_annulation_heures: rdv.commercant.rdv_delai_annulation_heures || 24,
      annulation_token:        rdv.annulation_token,
      praticien_prenom:        rdv.praticien?.prenom || null,
      praticien_nom:           rdv.praticien?.nom || null,
      praticien_couleur:       rdv.praticien?.couleur_hex || null,
      infos_pratiques:         rdv.commercant?.infos_pratiques || null,
      produits,
    })

    await envoyerAuCommercant({
      to: rdv.client_email,
      subject: `Ton RDV chez ${rdv.commercant.nom} est confirmé`,
      html,
      attachments: [attachment],
    })
  }

  // 2) Email Commercant si notif_mode='chaque'
  if (rdv.commercant.notif_mode === 'chaque' && rdv.commercant.email) {
    const html = emailNouveauRdvCommercant({
      nom_commercant:  rdv.commercant.nom,
      yopper_prenom:   rdv.client_prenom,
      yopper_nom:      rdv.client_nom,
      yopper_email:    rdv.client_email,
      yopper_telephone:rdv.client_telephone,
      prestation_nom:  rdv.prestation.nom,
      date_rdv:        rdv.date_rdv,
      heure_debut:     rdv.heure_debut,
      heure_fin:       rdv.heure_fin,
      duree_minutes:   rdv.duree_minutes,
      prix_estime:     rdv.prix_estime,
      acompte_paye:    !!(rdv.acompte_paye_en_ligne && rdv.acompte_montant),
      // Le commercant voit ce qui a fait baisser son acompte (27/08).
      fidelite_remise: rdv.fidelite_remise || 0,
      bon_cadeau_montant: rdv.bon_cadeau_montant || 0,
      acompte_montant: rdv.acompte_montant,
      notes_client:    rdv.notes_client,
      produits,
    })

    await envoyerAuCommercant({
      to: rdv.commercant.email,
      subject: `Nouveau RDV — ${rdv.client_prenom || 'Yopper'} ${rdv.date_rdv}`,
      html,
    })
  }

  // 3) Rappel push programmé 1h avant le RDV (best-effort, non bloquant).
  await programmerRappelRdv(rdvId, supabase)
}

// account.updated : met à jour les flags charges_enabled / payouts_enabled / details_submitted
async function handleAccountUpdated(account, supabase) {
  const updates = {
    stripe_account_charges_enabled:   !!account.charges_enabled,
    stripe_account_details_submitted: !!account.details_submitted,
    stripe_account_payouts_enabled:   !!account.payouts_enabled,
  }
  // Si premier passage 'charges_enabled=true', stamp onboarding_done_at
  if (account.charges_enabled) {
    const { data: c } = await supabase
      .from('commercants')
      .select('stripe_onboarding_done_at')
      .eq('stripe_account_id', account.id)
      .maybeSingle()
    if (c && !c.stripe_onboarding_done_at) {
      updates.stripe_onboarding_done_at = new Date().toISOString()
    }
  }
  const { error } = await supabase
    .from('commercants')
    .update(updates)
    .eq('stripe_account_id', account.id)
  if (error) throw error
  console.info('[stripe/webhook] commercant Stripe account updated', { acct: account.id, charges_enabled: account.charges_enabled })
}
