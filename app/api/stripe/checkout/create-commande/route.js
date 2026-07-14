// POST /api/stripe/checkout/create-commande
//
// Crée une Stripe Checkout Session pour le paiement TOTAL d'une commande C&C
// alimentaire par un Yopper (Direct Charge sur compte Connect du commerçant).
//
// Flow attendu (Yopper côté /commander/[slug] étape 3) :
//   1. Yopper a rempli panier + créneau + coords + RGPD + cliqué "Payer & confirmer"
//   2. FE POST sur cette route avec :
//      { commercant_id, creneau_id, date_commande, articles:[{id, quantite, options:[{groupe_id, valeur_ids:[]}]}],
//        client_email, client_prenom, client_nom, client_telephone, rgpd_marketing }
//   3. Backend (cette route) :
//      a. Valide commerçant a Stripe Connect actif
//      b. Recalcule TOTAL server-side (prix article + suppléments options)
//      c. Vérifie stock atomic : commandes existantes + réservations actives non expirées
//      d. Vérifie capacité créneau (existant) + horaires
//      e. INSERT commande statut='paiement_en_attente' (total figé server)
//      f. INSERT commande_articles avec prix/options
//      g. INSERT commande_stock_reservation (TTL 5 min, libéré par cron si paiement KO)
//      h. CREATE Stripe Checkout Session Direct Charge avec metadata commande_id
//      i. UPDATE commande avec stripe_checkout_session_id
//      j. Returns { url, session_id, commande_id }
//   4. FE redirect window.location = url → Stripe Checkout
//   5. Paiement OK   → success_url → webhook checkout.session.completed
//                     → commande.statut='en_attente' + paye_en_ligne=true + email
//   6. Paiement KO   → cancel_url  → cron expiration libère le stock 5 min après
//
// IMPORTANT : commande créée AVANT paiement (statut intermédiaire) pour que le
// webhook retrouve la commande par metadata. Cron daily libère les commandes
// 'paiement_en_attente' > 15 min (au cas où webhook ne vient jamais).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG, PAYMENT_KIND, buildPaymentMetadata, calculApplicationFee } from '@/lib/stripe'
import { geocoderAdresse } from '@/lib/geocode'
import { ordersLimiter, checkLimit, clientIp } from '@/lib/ratelimit'

export async function POST(request) {
  try {
    requireStripe()

    // Anti-spam commandes (#3) : 10 commandes / 60 s par IP. Fail-open si Upstash
    // absent/injoignable (voir lib/ratelimit.js).
    const rl = await checkLimit(ordersLimiter, clientIp(request))
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Trop de commandes en peu de temps. Réessaie dans un instant.' }, { status: 429 })
    }

    const body = await request.json()
    const {
      commercant_id, creneau_id, date_commande, articles,
      client_email, client_prenom, client_nom, client_telephone,
      rgpd_marketing,
      mode_retrait, creneau_livraison_id, adresse_livraison, code_postal_livraison,
    } = body
    const estLivraison = mode_retrait === 'livraison'

    // ─── 1) Validations basiques ───────────────────────────────────────────
    if (!commercant_id || !date_commande) {
      return NextResponse.json({ ok: false, error: 'Données commande incomplètes (commerçant, date).' }, { status: 400 })
    }
    if (estLivraison ? !creneau_livraison_id : !creneau_id) {
      return NextResponse.json({ ok: false, error: 'Créneau manquant.' }, { status: 400 })
    }
    if (estLivraison && (!adresse_livraison || !code_postal_livraison)) {
      return NextResponse.json({ ok: false, error: 'Adresse de livraison incomplète.' }, { status: 400 })
    }
    if (!Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ ok: false, error: 'Panier vide.' }, { status: 400 })
    }
    if (!client_email || !client_prenom || !client_nom || !client_telephone) {
      return NextResponse.json({ ok: false, error: 'Coordonnées client incomplètes.' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_commande)) {
      return NextResponse.json({ ok: false, error: 'Date commande invalide (format attendu YYYY-MM-DD).' }, { status: 400 })
    }

    // Supabase service_role : route appelée publiquement par les Yoppers (invités OK)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ─── 2) Récup commerçant + Stripe Connect prérequis ────────────────────
    const { data: commercant, error: errC } = await supabase
      .from('commercants')
      .select('id, nom, slug, stripe_account_id, stripe_account_charges_enabled, statut_publication')
      .eq('id', commercant_id)
      .single()
    if (errC || !commercant) {
      return NextResponse.json({ ok: false, error: 'Commerçant introuvable.' }, { status: 404 })
    }
    if (commercant.statut_publication !== 'publie') {
      return NextResponse.json({ ok: false, error: 'Ce commerçant n\'accepte pas encore de commandes.' }, { status: 400 })
    }
    if (!commercant.stripe_account_id || !commercant.stripe_account_charges_enabled) {
      return NextResponse.json({ ok: false, error: 'Le paiement en ligne n\'est pas encore activé chez ce commerçant.' }, { status: 400 })
    }

    // ─── 3) Récup créneau (retrait OU livraison) + check actif ──────────────
    // En livraison : créneau depuis livraison_creneaux + vérif zone (code postal).
    // livraisonConfig est stocké ici, les frais sont calculés plus bas (besoin du total).
    let creneau, livraisonConfig = null
    if (estLivraison) {
      const { data: cl, error: errCL } = await supabase
        .from('livraison_creneaux')
        .select('id, heure_debut, heure_fin, jour_semaine, actif, commercant_id')
        .eq('id', creneau_livraison_id)
        .single()
      if (errCL || !cl || cl.commercant_id !== commercant.id || !cl.actif) {
        return NextResponse.json({ ok: false, error: 'Créneau de livraison introuvable ou inactif.' }, { status: 400 })
      }
      creneau = cl
      const { data: cfg } = await supabase
        .from('livraison_config')
        .select('codes_postaux, frais_fixe, gratuit_des, actif')
        .eq('commercant_id', commercant.id)
        .maybeSingle()
      if (!cfg || cfg.actif === false) {
        return NextResponse.json({ ok: false, error: 'La livraison n\'est pas configurée chez ce commerçant.' }, { status: 400 })
      }
      if (!(cfg.codes_postaux || []).includes(String(code_postal_livraison).trim())) {
        return NextResponse.json({ ok: false, error: 'Ce code postal n\'est pas dans la zone de livraison.' }, { status: 400 })
      }
      livraisonConfig = cfg
    } else {
      const { data: cr, error: errCre } = await supabase
        .from('creneaux')
        .select('id, heure_debut, heure_fin, jour_semaine, actif, commercant_id')
        .eq('id', creneau_id)
        .single()
      if (errCre || !cr || cr.commercant_id !== commercant.id || !cr.actif) {
        return NextResponse.json({ ok: false, error: 'Créneau introuvable ou inactif.' }, { status: 400 })
      }
      creneau = cr
    }

    // ─── 4) Récup articles + options + calcul total SERVER ─────────────────
    const articleIds = articles.map(a => a.id).filter(Boolean)
    if (articleIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'Articles invalides.' }, { status: 400 })
    }

    const [
      { data: articlesData },
      { data: optionsValeurs },
    ] = await Promise.all([
      supabase.from('articles').select('id, nom, prix, actif, commercant_id, temps_prepa').in('id', articleIds),
      supabase.from('article_options_valeurs').select('id, nom, prix_supplement, groupe_id, article_options_groupes!inner(article_id, nom)'),
    ])

    if (!articlesData || articlesData.length !== articleIds.length) {
      return NextResponse.json({ ok: false, error: 'Un ou plusieurs articles introuvables.' }, { status: 400 })
    }
    // Tous les articles doivent appartenir au commerçant + être actifs
    for (const a of articlesData) {
      if (a.commercant_id !== commercant.id) {
        return NextResponse.json({ ok: false, error: `Article "${a.nom}" n'appartient pas à ce commerçant.` }, { status: 400 })
      }
      if (!a.actif) {
        return NextResponse.json({ ok: false, error: `Article "${a.nom}" n'est plus disponible.` }, { status: 400 })
      }
    }

    // Construction lignes commande avec prix server-side
    const articleParId = Object.fromEntries(articlesData.map(a => [a.id, a]))
    const valeurParId = Object.fromEntries((optionsValeurs || []).map(v => [v.id, v]))

    const lignes = []
    let totalCents = 0
    for (const item of articles) {
      const article = articleParId[item.id]
      const quantite = parseInt(item.quantite, 10)
      if (!quantite || quantite < 1 || quantite > 50) {
        return NextResponse.json({ ok: false, error: `Quantité invalide pour "${article.nom}".` }, { status: 400 })
      }
      // Calcul suppléments options (recalcul server pour empêcher tampering)
      const optionsFlat = []
      let supplement = 0
      if (Array.isArray(item.options)) {
        for (const opt of item.options) {
          const ids = Array.isArray(opt.valeur_ids) ? opt.valeur_ids : []
          for (const vid of ids) {
            const v = valeurParId[vid]
            if (!v) continue
            const grp = v.article_options_groupes
            if (!grp || grp.article_id !== article.id) continue
            optionsFlat.push({
              groupe_nom: grp.nom || '',
              valeur_nom: v.nom,
              prix_supplement: Number(v.prix_supplement || 0),
            })
            supplement += Number(v.prix_supplement || 0)
          }
        }
      }
      const prixUnitaire = Number(article.prix) + supplement
      const ligneCents = Math.round(prixUnitaire * 100) * quantite
      totalCents += ligneCents
      lignes.push({
        article_id: article.id,
        article_nom: article.nom,
        quantite,
        prix_unitaire: prixUnitaire,
        options: optionsFlat.length > 0 ? optionsFlat : null,
        temps_prepa: article.temps_prepa || 1,
      })
    }

    if (totalCents < 50) {
      return NextResponse.json({ ok: false, error: 'Total trop faible (minimum 0,50 € Stripe).' }, { status: 400 })
    }
    const totalEUR = totalCents / 100

    // Frais de livraison (server-side, anti-tampering) : montant fixe, offert si le
    // panier atteint le seuil gratuit_des. En retrait : toujours 0.
    let fraisLivraisonCents = 0
    if (estLivraison && livraisonConfig) {
      const offert = livraisonConfig.gratuit_des != null && totalEUR >= Number(livraisonConfig.gratuit_des)
      fraisLivraisonCents = offert ? 0 : Math.round(Number(livraisonConfig.frais_fixe || 0) * 100)
    }
    const fraisLivraisonEUR = fraisLivraisonCents / 100

    // ─── 5) Vérif stock atomic : commandes payées du jour + réservations actives ──
    // Stock disponible = stock_jour - (qte des commandes du jour non annulées)
    //                              - (qte des réservations non expirées)
    const { data: stocksJour } = await supabase
      .from('article_stock_jour')
      .select('article_id, jour_semaine, stock, actif')
      .in('article_id', articleIds)

    const { data: commandesDejaJour } = await supabase
      .from('commande_articles')
      .select('article_id, quantite, commande:commandes!inner(date_commande, statut, commercant_id)')
      .in('article_id', articleIds)
      .eq('commande.date_commande', date_commande)
      .eq('commande.commercant_id', commercant.id)
      .not('commande.statut', 'in', '("non_retire","annulee_paiement_ko","annulee_client_refund")')

    const { data: reservationsActives } = await supabase
      .from('commande_stock_reservation')
      .select('article_id, quantite')
      .in('article_id', articleIds)
      .eq('date_commande', date_commande)
      .gt('expires_at', new Date().toISOString())

    // Calcul jour de semaine en lower (lundi/mardi/...) pour article_stock_jour
    const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
    const jourDateObj = new Date(date_commande + 'T12:00:00')
    const jourSemaine = JOURS[jourDateObj.getDay()]

    const qteDejaParArticle = {}
    ;(commandesDejaJour || []).forEach(r => {
      qteDejaParArticle[r.article_id] = (qteDejaParArticle[r.article_id] || 0) + r.quantite
    })
    const qteReserveeParArticle = {}
    ;(reservationsActives || []).forEach(r => {
      qteReserveeParArticle[r.article_id] = (qteReserveeParArticle[r.article_id] || 0) + r.quantite
    })

    for (const ligne of lignes) {
      const stockEntry = (stocksJour || []).find(s => s.article_id === ligne.article_id && s.jour_semaine === jourSemaine)
      if (!stockEntry) continue // article sans stock géré : pas de limite
      if (stockEntry.actif === false) {
        return NextResponse.json({ ok: false, error: `Article "${ligne.article_nom}" non disponible ce jour-là.` }, { status: 400 })
      }
      const dispo = (stockEntry.stock || 0) - (qteDejaParArticle[ligne.article_id] || 0) - (qteReserveeParArticle[ligne.article_id] || 0)
      if (ligne.quantite > dispo) {
        return NextResponse.json({
          ok: false,
          error: `Stock insuffisant pour "${ligne.article_nom}" : ${Math.max(0, dispo)} disponible(s) (quelqu'un vient de commander).`,
          article_id: ligne.article_id,
          stock_disponible: Math.max(0, dispo),
        }, { status: 409 })
      }
    }

    // Géocodage adresse livraison (best-effort, non bloquant, timeout 4s) pour la
    // tournée optimisée. Retrait ou échec géocodage -> coords null.
    const coordsLivraison = estLivraison
      ? await geocoderAdresse(adresse_livraison, code_postal_livraison)
      : null

    // ─── 6) INSERT commande avec statut='paiement_en_attente' ──────────────
    const nomComplet = `${client_prenom} ${client_nom}`.trim()
    const { data: commande, error: errInsert } = await supabase
      .from('commandes')
      .insert({
        commercant_id: commercant.id,
        creneau_id: estLivraison ? null : creneau.id,
        creneau_livraison_id: estLivraison ? creneau.id : null,
        mode_retrait: estLivraison ? 'livraison' : 'retrait',
        adresse_livraison: estLivraison ? adresse_livraison : null,
        livraison_lat: coordsLivraison?.lat ?? null,
        livraison_lng: coordsLivraison?.lng ?? null,
        frais_livraison: fraisLivraisonEUR,
        client_nom: nomComplet,
        client_email,
        client_telephone,
        rgpd_commande: true,
        rgpd_marketing: !!rgpd_marketing,
        total: totalEUR + fraisLivraisonEUR,
        statut: 'paiement_en_attente',
        date_commande,
        paye_en_ligne: false,
      })
      .select()
      .single()
    if (errInsert || !commande) {
      console.error('[create-commande] insert commande KO', errInsert)
      return NextResponse.json({ ok: false, error: `Création commande échouée : ${errInsert?.message || 'erreur inconnue'}` }, { status: 500 })
    }

    // ─── 6.5) Réservation stock ATOMIQUE (anti-survente en concurrence) ─────
    // Autorité finale sur le stock : verrou + recompte + réservation dans UNE
    // transaction (voir MIGRATION_STOCK_RACE.sql). Le check JS (étape 5) reste un
    // pré-filtre rapide ; ici on rattrape la race (dernier article pris entre les
    // deux). Avant l'insert des lignes → un échec ne laisse qu'une commande à supprimer.
    {
      const items = lignes.map(l => ({ article_id: l.article_id, quantite: l.quantite }))
      const { error: errStock } = await supabase.rpc('reserver_stock_atomique', {
        p_commande_id: commande.id,
        p_commercant_id: commercant.id,
        p_date: date_commande,
        p_jour_semaine: jourSemaine,
        p_items: items,
      })
      if (errStock) {
        await supabase.from('commandes').delete().eq('id', commande.id)
        const msg = errStock.message || ''
        const mStock = msg.match(/STOCK_INSUFFISANT:([0-9a-fA-F-]+):(\d+)/)
        const mInactif = msg.match(/ARTICLE_INACTIF:([0-9a-fA-F-]+)/)
        if (mStock) {
          const nom = lignes.find(l => l.article_id === mStock[1])?.article_nom || 'un article'
          return NextResponse.json({ ok: false, error: `Stock insuffisant pour "${nom}" : ${mStock[2]} disponible(s) (quelqu'un vient de commander).`, article_id: mStock[1], stock_disponible: Number(mStock[2]) }, { status: 409 })
        }
        if (mInactif) {
          const nom = lignes.find(l => l.article_id === mInactif[1])?.article_nom || 'un article'
          return NextResponse.json({ ok: false, error: `Article "${nom}" non disponible ce jour-là.` }, { status: 400 })
        }
        console.error('[create-commande] reserver_stock_atomique KO', errStock)
        return NextResponse.json({ ok: false, error: 'Impossible de réserver le stock, réessaie dans un instant.' }, { status: 500 })
      }
    }

    // ─── 7) INSERT lignes commande_articles ────────────────────────────────
    const { error: errLignes } = await supabase
      .from('commande_articles')
      .insert(lignes.map(l => ({
        commande_id: commande.id,
        article_id: l.article_id,
        quantite: l.quantite,
        prix_unitaire: l.prix_unitaire,
        options: l.options,
      })))
    if (errLignes) {
      // Rollback commande pour ne pas laisser de fantôme
      await supabase.from('commandes').delete().eq('id', commande.id)
      console.error('[create-commande] insert lignes KO', errLignes)
      return NextResponse.json({ ok: false, error: `Enregistrement articles échoué : ${errLignes.message}` }, { status: 500 })
    }

    // ─── 8) Réservations stock : déjà posées atomiquement à l'étape 6.5 ─────

    // ─── 9) Stripe Checkout Session (Direct Charge sur compte connecté) ────
    const heureCreneau = (creneau.heure_debut || '').slice(0, 5)
    const dateHumain = new Date(date_commande + 'T12:00:00').toLocaleDateString('fr-BE', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    const nbArticles = lignes.reduce((s, l) => s + l.quantite, 0)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'bancontact'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: totalCents,
            product_data: {
              name: `Commande Yoppaa · ${commercant.nom}`,
              description: `${estLivraison ? 'Livraison' : 'Retrait'} ${dateHumain} à ${heureCreneau} · ${nbArticles} article${nbArticles > 1 ? 's' : ''}`,
            },
          },
        },
        ...(fraisLivraisonCents > 0 ? [{
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: fraisLivraisonCents,
            product_data: { name: 'Frais de livraison' },
          },
        }] : []),
      ],
      customer_email: client_email,
      success_url: `${STRIPE_CONFIG.appUrl}/commander/${commercant.slug}?paiement=ok&commande_id=${commande.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:   `${STRIPE_CONFIG.appUrl}/commander/${commercant.slug}?paiement=annule&commande_id=${commande.id}`,
      payment_intent_data: {
        application_fee_amount: calculApplicationFee(totalCents, commercant), // 0 (zéro commission)
        metadata: buildPaymentMetadata({
          kind: PAYMENT_KIND.COMMANDE_TOTAL,
          commercantId: commercant.id,
          commandeId: commande.id,
        }),
      },
      metadata: buildPaymentMetadata({
        kind: PAYMENT_KIND.COMMANDE_TOTAL,
        commercantId: commercant.id,
        commandeId: commande.id,
      }),
      locale: 'fr',
    }, {
      stripeAccount: commercant.stripe_account_id,
    })

    // ─── 10) UPDATE commande avec session_id pour pouvoir retrouver côté webhook ──
    await supabase
      .from('commandes')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', commande.id)

    return NextResponse.json({
      ok: true,
      url: session.url,
      session_id: session.id,
      commande_id: commande.id,
    })

  } catch (e) {
    console.error('[stripe/checkout/create-commande]', e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: e?.status || 500 }
    )
  }
}
