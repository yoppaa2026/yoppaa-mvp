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
import { envoyerEmailsCommande } from '@/lib/commande-notifs'
import { normaliserCodeBon, calculerRemiseBon } from '@/lib/bons-cadeaux'
import { chargerBonValide, debiterBon } from '@/lib/bons-cadeaux-server'
import { tauxFraisLivraison, REGIME_EMPORTER } from '@/lib/tva'
import { calculerCapaciteCreneau, creneauCommandable, STATUTS_OCCUPENT_CRENEAU } from '@/lib/creneaux'
import { brusselsInstant } from '@/lib/timezone'
import { construireLignesCommande, verifierStockDisponible, SELECT_ARTICLES, SELECT_DEALS } from '@/lib/lignes-commande'

export async function POST(request) {
  try {
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
      paiement_mode, bon_cadeau_code,
    } = body
    const estLivraison = mode_retrait === 'livraison'
    // Boutique détail (Module 2 étape 5) : pas de créneau. Retrait en boutique
    // (paiement selon boutique_retrait_paiement) ou expédition (toujours en ligne,
    // frais de port server-side, suivi manuel).
    const estExpedition = mode_retrait === 'expedition'
    const estRetraitBoutique = mode_retrait === 'retrait_boutique'
    const estBoutique = estExpedition || estRetraitBoutique
    // Paiement sur place (cash/carte au comptoir) : la commande est confirmée
    // immédiatement, sans Stripe Checkout. Autorisé uniquement si le commerçant
    // a activé accepte_paiement_cash (vérifié plus bas, server-side).
    const surPlace = paiement_mode === 'sur_place'
    if (!surPlace) requireStripe()

    // ─── 1) Validations basiques ───────────────────────────────────────────
    if (!commercant_id || !date_commande) {
      return NextResponse.json({ ok: false, error: 'Données commande incomplètes (commerçant, date).' }, { status: 400 })
    }
    if (!estBoutique && (estLivraison ? !creneau_livraison_id : !creneau_id)) {
      return NextResponse.json({ ok: false, error: 'Créneau manquant.' }, { status: 400 })
    }
    if ((estLivraison || estExpedition) && (!adresse_livraison || !code_postal_livraison)) {
      return NextResponse.json({ ok: false, error: estExpedition ? 'Adresse d\'expédition incomplète.' : 'Adresse de livraison incomplète.' }, { status: 400 })
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
      .select('id, nom, slug, stripe_account_id, stripe_account_charges_enabled, statut_publication, accepte_paiement_cash, categorie, boutique_mode_vente, boutique_retrait_paiement, boutique_frais_port, boutique_gratuit_des, boutique_expedition_cp, tva_taux_defaut, mode_capacite')
      .eq('id', commercant_id)
      .single()
    if (errC || !commercant) {
      return NextResponse.json({ ok: false, error: 'Commerçant introuvable.' }, { status: 404 })
    }
    if (commercant.statut_publication !== 'publie') {
      return NextResponse.json({ ok: false, error: 'Ce commerçant n\'accepte pas encore de commandes.' }, { status: 400 })
    }
    if (estBoutique) {
      // Monde boutique : détail ET vitrine (vente de produits au salon, 31/07)
      if (!['detail', 'vitrine'].includes(commercant.categorie)) {
        return NextResponse.json({ ok: false, error: 'Commande boutique indisponible chez ce commerçant.' }, { status: 400 })
      }
      const mv = commercant.boutique_mode_vente || 'retrait'
      if (estExpedition && mv === 'retrait') {
        return NextResponse.json({ ok: false, error: 'L\'expédition n\'est pas proposée chez ce commerçant.' }, { status: 400 })
      }
      if (estRetraitBoutique && mv === 'expedition') {
        return NextResponse.json({ ok: false, error: 'Le retrait en boutique n\'est pas proposé chez ce commerçant.' }, { status: 400 })
      }
      if (estExpedition && surPlace) {
        return NextResponse.json({ ok: false, error: 'Une commande expédiée se paie en ligne.' }, { status: 400 })
      }
    }
    // Chemins C&C / livraison (créneaux) : réservés à la catégorie alimentaire.
    // Sans ce verrou, un commerçant vitrine/détail gardant des lignes creneaux
    // résiduelles (changement de catégorie) pourrait recevoir une commande
    // payée mais invisible dans son dashboard (onglet Commandes masqué).
    if (!estBoutique && commercant.categorie !== 'alimentaire') {
      return NextResponse.json({ ok: false, error: 'La commande en ligne n\'est pas disponible chez ce commerçant.' }, { status: 400 })
    }
    // Sur place : autorisé selon accepte_paiement_cash (alimentaire) ou selon
    // le choix boutique_retrait_paiement='magasin' (retrait boutique détail).
    const cashAutorise = estRetraitBoutique
      ? commercant.boutique_retrait_paiement === 'magasin'
      : commercant.accepte_paiement_cash
    if (surPlace && !cashAutorise) {
      return NextResponse.json({ ok: false, error: 'Le paiement sur place n\'est pas proposé chez ce commerçant.' }, { status: 400 })
    }
    if (!surPlace && (!commercant.stripe_account_id || !commercant.stripe_account_charges_enabled)) {
      return NextResponse.json({ ok: false, error: 'Le paiement en ligne n\'est pas encore activé chez ce commerçant.' }, { status: 400 })
    }

    // ─── 3) Récup créneau (retrait OU livraison) + check actif ──────────────
    // En livraison : créneau depuis livraison_creneaux + vérif zone (code postal).
    // livraisonConfig est stocké ici, les frais sont calculés plus bas (besoin du total).
    let creneau = null, livraisonConfig = null
    if (estBoutique) {
      // Pas de créneau pour la boutique détail (retrait libre / expédition)
    } else if (estLivraison) {
      const { data: cl, error: errCL } = await supabase
        .from('livraison_creneaux')
        // ⚠️ max_commandes / capacite_temps / mode_capacite sont INDISPENSABLES :
        // sans elles, le contrôle de capacité plus bas calcule sur `undefined`
        // et ne bloque jamais rien. Il aurait l'air correct et ne servirait à rien.
        .select('id, heure_debut, heure_fin, jour_semaine, actif, commercant_id, max_commandes, capacite_temps, mode_capacite')
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
        // Mêmes colonnes de capacité que la livraison : les deux partagent le
        // modèle de lib/creneaux.js, elles doivent se lire pareil.
        .select('id, heure_debut, heure_fin, jour_semaine, actif, commercant_id, max_commandes, capacite_temps, mode_capacite')
        .eq('id', creneau_id)
        .single()
      if (errCre || !cr || cr.commercant_id !== commercant.id || !cr.actif) {
        return NextResponse.json({ ok: false, error: 'Créneau introuvable ou inactif.' }, { status: 400 })
      }
      creneau = cr
    }

    // ─── 4) Récup articles + options + calcul total SERVER ─────────────────
    // Dédupliqué : le panier peut contenir 2 lignes du MÊME article (unité +
    // deal lot) → sans Set, le check length échouait en « articles introuvables »
    const articleIds = [...new Set(articles.map(a => a.id).filter(Boolean))]
    if (articleIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'Articles invalides.' }, { status: 400 })
    }

    const [
      { data: articlesData },
      { data: optionsValeurs },
      { data: variantesData },
      { data: dealsData },
    ] = await Promise.all([
      supabase.from('articles').select(SELECT_ARTICLES).in('id', articleIds),
      supabase.from('article_options_valeurs').select('id, nom, prix_supplement, groupe_id, article_options_groupes!inner(article_id, nom)'),
      // Variantes (Module 2 boutique) : revalidation server-side prix + stock
      supabase.from('article_variantes').select('id, article_id, axe1_valeur, axe2_valeur, prix, stock, actif').in('article_id', articleIds),
      // Deals : revalidation server-side du prix selon le type. Les lots et les
      // duos sont des offres séparées vendues telles quelles ; les remises, en
      // pourcentage ou en prix promo, s'appliquent au prix de l'article et sont
      // recalculées ici même quand le navigateur ne les a pas vues.
      supabase.from('yoppaa_deals').select(SELECT_DEALS).eq('commercant_id', commercant_id).eq('actif', true),
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
      // Article en mode « prix indicatif » (vitrine) : affiché sur la fiche
      // mais jamais commandable, le prix n'est pas un prix ferme.
      if (a.est_vitrine) {
        return NextResponse.json({ ok: false, error: `"${a.nom}" n'est pas commandable en ligne.` }, { status: 400 })
      }
    }

    // Régime de TVA de l'opération. Tous les modes servis par cette route sont
    // des livraisons de biens : retrait, livraison et expédition sont de la
    // vente à emporter. La consommation sur place, qui bascule la nourriture à
    // 12 % et toutes les boissons à 21 %, arrivera avec la réservation de table
    // et la commande à table, et passera ce régime à REGIME_SUR_PLACE.
    const regimeTva = REGIME_EMPORTER

    // Prix, remises et TVA : calcul SERVEUR, partagé avec le tunnel RDV pour
    // que les deux parcours ne puissent jamais annoncer deux prix différents.
    const calcul = construireLignesCommande({
      panier: articles,
      articlesData, optionsValeurs, variantesData, dealsData,
      commercant,
      regime: regimeTva,
      dateCommande: date_commande,
    })
    if (!calcul.ok) {
      return NextResponse.json({ ok: false, error: calcul.error }, { status: calcul.status })
    }
    const { lignes, totalCents } = calcul

    if (totalCents <= 0) {
      return NextResponse.json({ ok: false, error: 'Total invalide.' }, { status: 400 })
    }
    if (!surPlace && totalCents < 50) {
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
    // Frais d'expédition boutique (server-side) : montant fixe boutique_frais_port,
    // offert dès boutique_gratuit_des. Zone CP optionnelle (vide = toute la Belgique).
    if (estExpedition) {
      const cps = Array.isArray(commercant.boutique_expedition_cp) ? commercant.boutique_expedition_cp : []
      if (cps.length > 0 && !cps.includes(String(code_postal_livraison).trim())) {
        return NextResponse.json({ ok: false, error: 'Ce code postal n\'est pas desservi par l\'expédition.' }, { status: 400 })
      }
      const offert = commercant.boutique_gratuit_des != null && Number(commercant.boutique_gratuit_des) > 0 && totalEUR >= Number(commercant.boutique_gratuit_des)
      fraisLivraisonCents = offert ? 0 : Math.round(Number(commercant.boutique_frais_port || 0) * 100)
    }
    const fraisLivraisonEUR = fraisLivraisonCents / 100

    // ─── 4.5) Bon cadeau (module 3) : revalidation server-side du code ─────
    // La remise couvre articles + frais, plafonnée au solde du bon ET pour
    // laisser un reste à payer de 0 ou >= 0,50 € (minimum Stripe). Le DÉBIT
    // du bon n'a lieu qu'à la confirmation (sur place / dû 0 : tout de suite,
    // en ligne : au webhook paiement OK) — un checkout abandonné ne brûle rien.
    let bonCadeau = null
    let remiseBonEUR = 0
    if (bon_cadeau_code) {
      const codeBon = normaliserCodeBon(bon_cadeau_code)
      if (!codeBon) {
        return NextResponse.json({ ok: false, error: 'Code de bon cadeau invalide.' }, { status: 400 })
      }
      const resBon = await chargerBonValide(supabase, { code: codeBon, commercant_id: commercant.id })
      if (!resBon.ok) {
        return NextResponse.json({ ok: false, error: resBon.error }, { status: 400 })
      }
      bonCadeau = resBon.bon
      remiseBonEUR = calculerRemiseBon(bonCadeau.solde, totalEUR + fraisLivraisonEUR)
    }
    const duEUR = Math.round((totalEUR + fraisLivraisonEUR - remiseBonEUR) * 100) / 100
    const duCents = Math.round(duEUR * 100)
    // Dû entièrement couvert par le bon : confirmation directe, pas de Stripe.
    const couvertParBon = !!bonCadeau && duCents === 0

    // ─── 4.6) Le créneau est-il encore commandable ? ───────────────────────
    //
    // Deux contrôles qui n'existaient nulle part (09/08).
    //
    // ⚠️ LE JOUR. Un créneau porte « mardi 18h-19h ». Rien ne vérifiait que la
    // date commandée était bien un mardi : un onglet resté ouvert depuis la
    // veille réservait un créneau du mardi pour une livraison du jeudi, et le
    // commerçant voyait une tournée un jour où il ne livre pas.
    //
    // ⚠️ LE DÉLAI LIMITE. `cutoff_heures` est réglé par le commerçant dans son
    // tableau de bord (« commande jusqu'à 2h avant ») et AUCUNE ligne de code
    // ne le lisait. On pouvait commander une livraison pour un créneau
    // démarrant dans dix minutes.
    if (creneau && !estBoutique) {
      const etatCreneau = creneauCommandable(creneau, {
        dateStr: date_commande,
        instantDebut: brusselsInstant,
      })
      if (!etatCreneau.ok) {
        const message = etatCreneau.raison === 'jour'
          ? 'Ce créneau n\'est pas proposé ce jour-là. Choisis-en un autre.'
          : `Il est trop tard pour ce créneau : ${commercant.nom} demande de commander au moins ${etatCreneau.heures} h à l'avance. Choisis un créneau plus tardif.`
        return NextResponse.json({ ok: false, error: message, creneau_indisponible: true }, { status: 409 })
      }
    }

    // ─── 4.7) Vérif CAPACITÉ du créneau, côté SERVEUR ──────────────────────
    //
    // ⚠️ ELLE N'EXISTAIT NULLE PART AILLEURS QUE DANS LE NAVIGATEUR (trouvé le
    // 09/08). `calculerCapaciteCreneau` ne servait qu'à griser les créneaux
    // pleins à l'écran. Le stock, lui, était bien protégé côté serveur par une
    // réservation atomique — mais rien n'empêchait deux clients qui paient en
    // même temps de faire passer un créneau de cinq commandes à sept, ni une
    // requête fabriquée de viser un créneau affiché complet.
    //
    // Pour une boulangerie le samedi matin, un créneau qui déborde n'est pas un
    // détail : c'est une promesse faite au commerçant et tenue par personne.
    //
    // On compte les commandes du MÊME créneau et du MÊME JOUR. La fonction en
    // base utilisée par l'affichage, elle, agrège toutes dates confondues et
    // n'exclut pas les annulées : elle est donc plus pessimiste que ce contrôle,
    // ce qui est sans danger — l'écran cache un peu trop, le serveur tranche juste.
    //
    // ⚠️ ET SURTOUT : on ne contrôle QUE si une capacité est réellement fixée.
    // `calculerCapaciteCreneau` compare `utilise >= capacite` ; avec une
    // capacité nulle ou absente, `null` devient 0 et la comparaison est vraie
    // pour n'importe quelle commande. Sans cette garde, un commerçant qui n'a
    // jamais rempli le champ verrait TOUTES ses commandes refusées.
    const capaciteFixee = ((creneau?.mode_capacite || commercant.mode_capacite) === 'temps')
      ? Number(creneau?.capacite_temps) > 0
      : Number(creneau?.max_commandes) > 0
    if (creneau && !estBoutique && capaciteFixee) {
      const colonneCreneau = estLivraison ? 'creneau_livraison_id' : 'creneau_id'
      const { data: cmdMemeCreneau } = await supabase
        .from('commandes')
        .select('id')
        .eq('commercant_id', commercant.id)
        .eq(colonneCreneau, creneau.id)
        .eq('date_commande', date_commande)
        .in('statut', STATUTS_OCCUPENT_CRENEAU)
      const occupantes = cmdMemeCreneau || []

      // Mode « temps » : le plafond est une durée, pas un nombre de commandes.
      // Il faut donc la somme des temps de préparation déjà engagés, plus celui
      // de la commande en cours de création.
      const modeTemps = (creneau.mode_capacite || commercant.mode_capacite) === 'temps'
      let tempsCumul = 0
      if (modeTemps && occupantes.length > 0) {
        const { data: lignesExistantes } = await supabase
          .from('commande_articles')
          .select('quantite, article:articles(temps_prepa)')
          .in('commande_id', occupantes.map(c => c.id))
        for (const l of lignesExistantes || []) {
          tempsCumul += Number(l.quantite || 0) * Number(l.article?.temps_prepa ?? 1)
        }
      }
      // Ce que la commande en cours ajoute au créneau.
      const tempsDemande = modeTemps
        ? lignes.reduce((s, l) => {
            const art = (articlesData || []).find(a => String(a.id) === String(l.article_id))
            return s + Number(l.quantite || 0) * Number(art?.temps_prepa ?? 1)
          }, 0)
        : 0

      const etat = calculerCapaciteCreneau(
        {
          ...creneau,
          count: occupantes.length + 1,
          temps_cumul: tempsCumul + tempsDemande,
        },
        { modeCapaciteDefaut: commercant.mode_capacite }
      )
      // `complet` est calculé EN INCLUANT la commande en cours : s'il est vrai,
      // c'est que celle-ci ferait déborder le créneau.
      if (etat.complet) {
        return NextResponse.json({
          ok: false,
          error: estLivraison
            ? 'Ce créneau de livraison vient d\'être complet. Choisis-en un autre.'
            : 'Ce créneau vient d\'être complet. Choisis-en un autre.',
          creneau_complet: true,
        }, { status: 409 })
      }
    }

    // ─── 5) Vérif stock : commandes du jour + réservations en cours ────────
    const verifStock = await verifierStockDisponible({
      supabase, lignes, commercantId: commercant.id, dateCommande: date_commande,
    })
    if (!verifStock.ok) {
      return NextResponse.json({
        ok: false,
        error: verifStock.error,
        ...(verifStock.article_id ? { article_id: verifStock.article_id, stock_disponible: verifStock.stock_disponible } : {}),
      }, { status: verifStock.status })
    }
    const nomParArticle = verifStock.nomParArticle || {}
    const consoParArticle = verifStock.consoParArticle || {}
    const jourSemaine = verifStock.jourSemaine

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
        creneau_id: (estLivraison || estBoutique) ? null : creneau.id,
        creneau_livraison_id: estLivraison ? creneau.id : null,
        mode_retrait: estExpedition ? 'expedition' : estLivraison ? 'livraison' : 'retrait',
        regime_tva: regimeTva,
        // Frais de livraison : accessoires à la vente, donc au taux le plus bas
        // de la commande (tolérance admise sur les taux mixtes). Figé ici, pour
        // qu'un changement de taux ne réécrive jamais une commande passée.
        tva_taux_livraison: fraisLivraisonEUR > 0
          ? tauxFraisLivraison(lignes.map(l => l.tva_taux), commercant.tva_taux_defaut)
          : null,
        adresse_livraison: (estLivraison || estExpedition) ? adresse_livraison : null,
        livraison_lat: coordsLivraison?.lat ?? null,
        livraison_lng: coordsLivraison?.lng ?? null,
        frais_livraison: fraisLivraisonEUR,
        client_nom: nomComplet,
        client_email,
        client_telephone,
        rgpd_commande: true,
        rgpd_marketing: !!rgpd_marketing,
        total: totalEUR + fraisLivraisonEUR,
        bon_cadeau_id: bonCadeau?.id || null,
        bon_cadeau_montant: remiseBonEUR,
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
    if (!estBoutique) {
      // Items AGRÉGÉS par article (cf. consoParArticle étape 5) : inclut les
      // seconds articles des duos et évite les doublons article_id à la RPC
      const items = Object.entries(consoParArticle).map(([article_id, quantite]) => ({ article_id, quantite }))
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
          const nom = nomParArticle[mStock[1]] || 'un article'
          return NextResponse.json({ ok: false, error: `Stock insuffisant pour "${nom}" : ${mStock[2]} disponible(s) (quelqu'un vient de commander).`, article_id: mStock[1], stock_disponible: Number(mStock[2]) }, { status: 409 })
        }
        if (mInactif) {
          const nom = nomParArticle[mInactif[1]] || 'un article'
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
        tva_taux: l.tva_taux,
      })))
    if (errLignes) {
      // Rollback commande pour ne pas laisser de fantôme
      await supabase.from('commandes').delete().eq('id', commande.id)
      console.error('[create-commande] insert lignes KO', errLignes)
      return NextResponse.json({ ok: false, error: `Enregistrement articles échoué : ${errLignes.message}` }, { status: 500 })
    }

    // ─── 7.5) Décrément stock VARIANTES (modèle détail : stock permanent) ───
    // Décrément immédiat à la commande (cash ET en ligne). Conservateur : un
    // paiement Stripe abandonné laisse le stock décrémenté jusqu'à l'annulation
    // (pas de survente possible). Restauration à l'annulation = backlog.
    const varianteParId = Object.fromEntries((variantesData || []).map(v => [v.id, v]))
    for (const item of articles) {
      if (!item.variante_id) continue
      const v = varianteParId[item.variante_id]
      if (!v) continue
      const q = parseInt(item.quantite, 10) || 0
      const { error: errVar } = await supabase
        .from('article_variantes')
        .update({ stock: Math.max(0, (v.stock || 0) - q) })
        .eq('id', v.id)
      if (errVar) console.error('[create-commande] décrément variante KO (non-bloquant)', errVar.message)
    }

    // ─── 8) Réservations stock : déjà posées atomiquement à l'étape 6.5 ─────

    // ─── 8.4) BON CADEAU : débit immédiat quand la commande se confirme SANS
    // Stripe (paiement sur place ou dû entièrement couvert par le bon). Le
    // chemin Stripe, lui, débite au webhook paiement OK. Une course (bon vidé
    // entre la vérification et ici) annule proprement la commande.
    if (bonCadeau && remiseBonEUR > 0 && (surPlace || couvertParBon)) {
      const deb = await debiterBon(supabase, bonCadeau.id, remiseBonEUR, { source: 'commande', commande_id: commande.id })
      if (!deb.ok) {
        await supabase.from('commandes').update({ statut: 'annulee_paiement_ko' }).eq('id', commande.id)
        await supabase.from('commande_stock_reservation').delete().eq('commande_id', commande.id)
        console.error('[create-commande] débit bon cadeau KO', deb.error)
        return NextResponse.json({ ok: false, error: 'Ce bon cadeau vient d\'être utilisé, vérifie son solde et réessaie.' }, { status: 409 })
      }
    }

    // ─── 8.5) PAIEMENT SUR PLACE ou DÛ 0 (bon cadeau) : confirmation
    // immédiate, pas de Stripe. Miroir exact du webhook paiement OK : bascule
    // en_attente, libération de la réservation TTL (la commande EST le stock
    // consommé), puis emails + rappel push via lib/commande-notifs.
    if (surPlace || couvertParBon) {
      const { error: errConfirm } = await supabase
        .from('commandes')
        .update(couvertParBon && !surPlace
          // Payé intégralement par le bon : équivalent d'un paiement en ligne
          ? { statut: 'en_attente', paye_en_ligne: true, paye_en_ligne_date: new Date().toISOString() }
          : { statut: 'en_attente' })
        .eq('id', commande.id)
      if (errConfirm) {
        await supabase.from('commandes').delete().eq('id', commande.id)
        console.error('[create-commande] confirmation sur place KO', errConfirm)
        return NextResponse.json({ ok: false, error: 'Confirmation de la commande échouée, réessaie.' }, { status: 500 })
      }
      await supabase.from('commande_stock_reservation').delete().eq('commande_id', commande.id)
      try {
        await envoyerEmailsCommande(commande.id, supabase)
      } catch (e) {
        console.error('[create-commande] notifs sur place KO (non bloquant)', e?.message)
      }
      return NextResponse.json({ ok: true, cash: surPlace, bon_total: couvertParBon && !surPlace, commande_id: commande.id })
    }

    // ─── 9) Stripe Checkout Session (Direct Charge sur compte connecté) ────
    const heureCreneau = (creneau?.heure_debut || '').slice(0, 5)
    const dateHumain = new Date(date_commande + 'T12:00:00').toLocaleDateString('fr-BE', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    const nbArticles = lignes.reduce((s, l) => s + l.quantite, 0)
    const descCommande = estBoutique
      ? `${estExpedition ? 'Expédition' : commercant.categorie === 'vitrine' ? 'Retrait sur place' : 'Retrait en boutique'} · ${nbArticles} article${nbArticles > 1 ? 's' : ''}`
      : `${estLivraison ? 'Livraison' : 'Retrait'} ${dateHumain} à ${heureCreneau} · ${nbArticles} article${nbArticles > 1 ? 's' : ''}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'bancontact'],
      // Avec bon cadeau : une seule ligne au montant restant dû (Stripe ne
      // gère pas de ligne négative en Checkout), la déduction est explicitée
      // dans le descriptif. Sans bon : lignes commande + frais classiques.
      line_items: remiseBonEUR > 0 ? [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: duCents,
            product_data: {
              name: `Commande Yoppaa · ${commercant.nom}`,
              description: `${descCommande} · bon cadeau déduit (−${remiseBonEUR.toFixed(2)} €)`,
            },
          },
        },
      ] : [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: totalCents,
            product_data: {
              name: `Commande Yoppaa · ${commercant.nom}`,
              description: descCommande,
            },
          },
        },
        ...(fraisLivraisonCents > 0 ? [{
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: fraisLivraisonCents,
            product_data: { name: estExpedition ? 'Frais de port' : 'Frais de livraison' },
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
