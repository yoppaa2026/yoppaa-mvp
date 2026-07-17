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
import { createClient } from '@supabase/supabase-js'
import { stripe, STRIPE_CONFIG, PAYMENT_KIND } from '@/lib/stripe'
import { envoyerAuCommercant, emailRdvConfirme, emailNouveauRdvCommercant, emailCommandeConfirmee, emailNouvelleCommandeCommercant } from '@/lib/resend'
import { generateRdvIcs, icsToBase64Attachment } from '@/lib/ical'
import { programmerRappelCommande, programmerRappelRdv } from '@/lib/rappels'

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

  if (kind === PAYMENT_KIND.RDV_ACOMPTE) {
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
    const rdvId = meta.yoppaa_rdv_id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null)
    const payload = {
      ...(rdvId ? { id: rdvId } : {}),
      commercant_id: meta.yoppaa_commercant_id,
      prestation_id: meta.prestation_id,
      praticien_id: meta.praticien_id || null,
      client_email: meta.client_email,
      client_prenom: meta.client_prenom,
      client_nom: meta.client_nom,
      client_telephone: meta.client_telephone,
      date_rdv: meta.date_rdv,
      heure_debut: meta.heure_debut,
      heure_fin: meta.heure_fin,
      duree_minutes: Number(meta.duree_minutes) || null,
      prix_estime: Number(meta.prix_estime) || null,
      acompte_montant: Number(meta.acompte_montant) || null,
      acompte_paye: true,
      statut: 'confirme',
      notes_client: meta.notes_client || null,
      rgpd_marketing: meta.rgpd_marketing === '1',
      source: 'yopper',
      stripe_payment_intent_id: paymentIntent.id,
      acompte_paye_en_ligne: true,
      acompte_paye_date: new Date().toISOString(),
    }
    const { error } = await supabase.from('rdv_reservations').insert(payload)
    if (error) throw error
    console.info('[stripe/webhook] RDV créé via paiement Stripe', { rdvId, pi: paymentIntent.id })

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

  console.warn('[stripe/webhook] kind non reconnu dans payment_intent.succeeded', { kind, meta })
}

// ─── Commande C&C : paiement OK → bascule paiement_en_attente -> en_attente ─
//
// La commande EXISTE déjà en DB (créée par /api/stripe/checkout/create-commande
// avec statut='paiement_en_attente'). Le webhook fait juste la transition
// d'état + envoie les emails de confirmation.
async function handleCommandeSucceeded(paymentIntent, supabase, eventAccount = null) {
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
    .select('id, statut, paye_en_ligne, commercant_id')
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
  await envoyerEmailsCommande(commandeId, supabase)

  console.info('[webhook/commande] confirmée OK', { commandeId, pi: paymentIntent.id })
}

// ─── Helper : envoie emailCommandeConfirmee (Yopper) + emailNouvelleCommandeCommercant
// ─── (commerçant si notif_mode='chaque'). Fire-and-forget : try/catch par email
// ─── pour qu'une erreur Resend n'interrompe pas l'autre envoi.
async function envoyerEmailsCommande(commandeId, supabase) {
  // NB : la table commandes a client_email/client_nom/client_telephone.
  // commande_articles a quantite/prix_unitaire/options (jsonb). PAS de
  // prix_total ni option_libelle (calculés ici côté JS pour les templates).
  // PAS de notes_client non plus (la table commandes ne l'a pas).
  const { data: cmd, error: errCmd } = await supabase
    .from('commandes')
    .select(`
      id, numero_commande, total, date_commande,
      client_email, client_nom, client_telephone,
      annulation_token, mode_retrait, adresse_livraison, frais_livraison,
      commercant:commercants(id, nom, slug, adresse, email, notif_mode, delai_annulation_heures),
      creneau:creneaux(heure_debut, heure_fin),
      creneau_livraison:livraison_creneaux(heure_debut, heure_fin),
      articles:commande_articles(quantite, prix_unitaire, options, article:articles(nom))
    `)
    .eq('id', commandeId)
    .single()
  if (errCmd || !cmd) {
    console.error('[webhook/commande] email helper KO : commande introuvable', { commandeId, errCmd })
    return
  }

  // Split client_nom (= "Alexandre Verstappen") → prenom + nom pour l'email
  const parts = (cmd.client_nom || '').trim().split(/\s+/)
  const prenom = parts[0] || 'Yopper'
  const nom = parts.slice(1).join(' ')

  // Format les options jsonb [{groupe_nom, valeur_nom, prix_supplement}] en libellé
  function formatOptions(opts) {
    if (!Array.isArray(opts) || opts.length === 0) return null
    return opts.map(o => `${o.groupe_nom ? o.groupe_nom + ': ' : ''}${o.valeur_nom || ''}`).join(' · ')
  }

  const articlesFlat = (cmd.articles || []).map(a => ({
    nom:            a.article?.nom || '—',
    quantite:       a.quantite,
    option_libelle: formatOptions(a.options),
    prix_total:     Number(a.prix_unitaire || 0) * Number(a.quantite || 0),
  }))

  // 1) Email Yopper
  if (cmd.client_email) {
    try {
      const cren = cmd.mode_retrait === 'livraison' ? cmd.creneau_livraison : cmd.creneau
      // CTA "crée un mot de passe" : offert aux Yoppers sans mot de passe utilisable —
      // invité pur (auth_user_id NULL) OU compte magic-link (has_password absent). Pas
      // d'offre si le compte a déjà un mot de passe (has_password === true). Le flag est
      // fiabilisé par un auto-repair au login par mot de passe (cf. commander/auth +
      // login) : les comptes anciens (créés avant le flag) cessent d'être sollicités dès
      // leur prochaine connexion par mot de passe. En cas de doute (lookup KO) on ne nag pas.
      const { data: cli } = await supabase.from('clients').select('auth_user_id').eq('email', cmd.client_email).maybeSingle()
      let offrirMdp = !cli?.auth_user_id
      if (cli?.auth_user_id) {
        try {
          const { data: au } = await supabase.auth.admin.getUserById(cli.auth_user_id)
          offrirMdp = au?.user?.user_metadata?.has_password !== true
        } catch {
          offrirMdp = false
        }
      }
      const html = emailCommandeConfirmee({
        yopper_prenom:           prenom,
        commercant_nom:          cmd.commercant?.nom || '',
        commercant_adresse:      cmd.commercant?.adresse || '',
        commercant_slug:         cmd.commercant?.slug || '',
        numero_commande:         cmd.numero_commande,
        articles:                articlesFlat,
        total:                   cmd.total,
        date_retrait:            cmd.date_commande,
        heure_debut:             cren?.heure_debut,
        heure_fin:               cren?.heure_fin,
        mode_retrait:            cmd.mode_retrait,
        adresse_livraison:       cmd.adresse_livraison,
        frais_livraison:         cmd.frais_livraison,
        annulation_token:        cmd.annulation_token,
        delai_annulation_heures: cmd.commercant?.delai_annulation_heures ?? 2,
        offrir_mdp:              offrirMdp,
        offrir_mdp_email:        cmd.client_email,
      })
      await envoyerAuCommercant({
        to: cmd.client_email,
        subject: `Ta commande chez ${cmd.commercant?.nom || 'le commerçant'} est confirmée`,
        html,
      })
    } catch (e) {
      console.error('[webhook/commande] envoi email Yopper KO', e?.message)
    }
  }

  // 2) Email commerçant (si notif_mode='chaque')
  if (cmd.commercant?.notif_mode === 'chaque' && cmd.commercant?.email) {
    try {
      const html = emailNouvelleCommandeCommercant({
        nom_commercant:   cmd.commercant.nom,
        yopper_prenom:    prenom,
        yopper_nom:       nom,
        yopper_email:     cmd.client_email,
        yopper_telephone: cmd.client_telephone,
        numero_commande:  cmd.numero_commande,
        articles:         articlesFlat,
        total:            cmd.total,
        date_retrait:     cmd.date_commande,
        heure_debut:      cmd.creneau?.heure_debut,
        heure_fin:        cmd.creneau?.heure_fin,
        notes_client:     cmd.notes_client,
      })
      await envoyerAuCommercant({
        to: cmd.commercant.email,
        subject: `Nouvelle commande #${cmd.numero_commande || ''} — ${prenom}`,
        html,
      })
    } catch (e) {
      console.error('[webhook/commande] envoi email commerçant KO', e?.message)
    }
  }

  // 3) Rappel push programmé 30 min avant le créneau (retrait uniquement).
  //    Best-effort, non bloquant. Voir lib/rappels.js.
  await programmerRappelCommande(commandeId, supabase)
}

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
  if (meta.yoppaa_kind !== PAYMENT_KIND.COMMANDE_TOTAL) {
    return  // RDV failed = pas de RDV créé, rien à faire
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

  await supabase
    .from('commandes')
    .update({ statut: 'annulee_paiement_ko' })
    .eq('id', commandeId)

  // Libère immédiatement les réservations stock
  await supabase
    .from('commande_stock_reservation')
    .delete()
    .eq('commande_id', commandeId)

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

  // Update RDV si trouvé
  const { data: rdv } = await supabase
    .from('rdv_reservations')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (rdv) {
    await supabase.from('rdv_reservations').update(updateData).eq('id', rdv.id)
    console.info('[stripe/webhook] refund enregistré sur RDV', { rdvId: rdv.id, refund: refund.id })
    return
  }

  // Sinon update commande si trouvée + transition statut → 'annulee_client_refund'
  const { data: cmd } = await supabase
    .from('commandes')
    .select('id, statut')
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
async function envoyerEmailsRdvConfirme(supabase, rdvId, fallbackPayload) {
  // Fetch les jointures fraiches pour avoir nom commercant + presta + email
  const { data: rdv } = await supabase
    .from('rdv_reservations')
    .select(`
      id, date_rdv, heure_debut, heure_fin, duree_minutes, prix_estime,
      acompte_paye_en_ligne, acompte_montant,
      client_email, client_prenom, client_nom, client_telephone, notes_client,
      annulation_token,
      commercant:commercants(id, nom, slug, adresse, telephone, email, rdv_delai_annulation_heures, notif_mode),
      prestation:rdv_prestations(nom),
      praticien:rdv_praticiens(prenom, nom, couleur_hex)
    `)
    .eq('id', rdvId)
    .maybeSingle()

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
      commercant_adresse: rdv.commercant.adresse || '',
      commercant_telephone: rdv.commercant.telephone,
      commercant_email: rdv.commercant.email,
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
      commercant_adresse:      rdv.commercant.adresse || '',
      commercant_slug:         rdv.commercant.slug || '',
      prestation_nom:          rdv.prestation.nom,
      date_rdv:                rdv.date_rdv,
      heure_debut:             rdv.heure_debut,
      heure_fin:               rdv.heure_fin,
      duree_minutes:           rdv.duree_minutes,
      prix_estime:             rdv.prix_estime,
      acompte_paye:            !!(rdv.acompte_paye_en_ligne && rdv.acompte_montant),
      acompte_montant:         rdv.acompte_montant,
      delai_annulation_heures: rdv.commercant.rdv_delai_annulation_heures || 24,
      annulation_token:        rdv.annulation_token,
      praticien_prenom:        rdv.praticien?.prenom || null,
      praticien_nom:           rdv.praticien?.nom || null,
      praticien_couleur:       rdv.praticien?.couleur_hex || null,
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
      acompte_montant: rdv.acompte_montant,
      notes_client:    rdv.notes_client,
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
