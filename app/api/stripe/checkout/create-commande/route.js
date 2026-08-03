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
import { tauxPourArticle, tauxFraisLivraison, REGIME_EMPORTER } from '@/lib/tva'

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
      .select('id, nom, slug, stripe_account_id, stripe_account_charges_enabled, statut_publication, accepte_paiement_cash, categorie, boutique_mode_vente, boutique_retrait_paiement, boutique_frais_port, boutique_gratuit_des, boutique_expedition_cp, tva_taux_defaut')
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
      supabase.from('articles').select('id, nom, prix, actif, commercant_id, temps_prepa, est_vitrine, tva_taux, tva_taux_sur_place').in('id', articleIds),
      supabase.from('article_options_valeurs').select('id, nom, prix_supplement, groupe_id, article_options_groupes!inner(article_id, nom)'),
      // Variantes (Module 2 boutique) : revalidation server-side prix + stock
      supabase.from('article_variantes').select('id, article_id, axe1_valeur, axe2_valeur, prix, stock, actif').in('article_id', articleIds),
      // Deals (« article temporaire ») : revalidation server-side du prix selon
      // le type (lot / remise_pct / prix_fixe / bundle) + fenêtre de dates
      supabase.from('yoppaa_deals').select('id, titre, prix_deal, actif, commercant_id, deal_type, remise_pct, unites_par_deal, article2_id, date_deal, date_debut, date_fin').eq('commercant_id', commercant_id).eq('actif', true),
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

    // Construction lignes commande avec prix server-side
    const articleParId = Object.fromEntries(articlesData.map(a => [a.id, a]))
    const valeurParId = Object.fromEntries((optionsValeurs || []).map(v => [v.id, v]))
    const varianteParId = Object.fromEntries((variantesData || []).map(v => [v.id, v]))
    const dealParId = Object.fromEntries((dealsData || []).map(d => [d.id, d]))

    // Régime de TVA de l'opération. Tous les modes servis par cette route sont
    // des livraisons de biens : retrait, livraison et expédition sont de la
    // vente à emporter. La consommation sur place, qui bascule la nourriture à
    // 12 % et toutes les boissons à 21 %, arrivera avec la réservation de table
    // et la commande à table, et passera ce régime à REGIME_SUR_PLACE.
    const regimeTva = REGIME_EMPORTER

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
      // Variante (Module 2 boutique) : prix = override variante (sinon prix
      // article), stock de LA variante contrôlé, libellé stocké dans options
      // (jsonb) pour s'afficher partout (dashboard, emails) sans migration.
      let variante = null
      if (item.variante_id) {
        variante = varianteParId[item.variante_id]
        if (!variante || variante.article_id !== article.id || variante.actif === false) {
          return NextResponse.json({ ok: false, error: `Version introuvable pour "${article.nom}".` }, { status: 400 })
        }
        if ((variante.stock ?? 0) < quantite) {
          return NextResponse.json({ ok: false, error: `Stock insuffisant pour "${article.nom}" (${[variante.axe1_valeur, variante.axe2_valeur].filter(Boolean).join(' · ')}).` }, { status: 400 })
        }
        optionsFlat.unshift({
          groupe_nom: 'Version',
          valeur_nom: [variante.axe1_valeur, variante.axe2_valeur].filter(Boolean).join(' · '),
          prix_supplement: 0,
        })
      }
      // Deal lot (« article temporaire », décision Alex 23/07) : prix = prix_deal
      // du deal revalidé server-side, libellé = titre du deal. L'article unitaire
      // reste commandable à son prix normal en parallèle.
      let deal = null
      if (item.deal_id) {
        deal = dealParId[item.deal_id]
        if (!deal) {
          return NextResponse.json({ ok: false, error: 'Ce deal n\'est plus disponible.' }, { status: 400 })
        }
        // Fenêtre de dates ENFIN vérifiée server-side (audit deals n°3) : le
        // deal doit couvrir la date de la commande (date_deal ponctuelle OU plage)
        const dd = deal.date_deal ? String(deal.date_deal).slice(0, 10) : null
        const ds = deal.date_debut ? String(deal.date_debut).slice(0, 10) : null
        const df = deal.date_fin ? String(deal.date_fin).slice(0, 10) : null
        const dansFenetre = (dd && dd === date_commande) || (ds && df && ds <= date_commande && date_commande <= df)
        if (!dansFenetre) {
          return NextResponse.json({ ok: false, error: `Le deal « ${deal.titre} » n'est plus valable pour cette date.` }, { status: 400 })
        }
        if (deal.deal_type === 'remise_pct' ? !deal.remise_pct : deal.prix_deal == null) {
          return NextResponse.json({ ok: false, error: 'Ce deal n\'est plus disponible.' }, { status: 400 })
        }
      }
      // Prix par type de deal : remise % calculée en direct sur le prix article
      // (jamais figée), sinon prix_deal (lot / prix fixe / bundle)
      const prixBase = deal
        ? (deal.deal_type === 'remise_pct'
            ? Math.round(Number(article.prix) * (100 - deal.remise_pct)) / 100
            : Number(deal.prix_deal))
        : variante && variante.prix != null ? Number(variante.prix)
        : Number(article.prix)
      const prixUnitaire = prixBase + supplement
      const ligneCents = Math.round(prixUnitaire * 100) * quantite
      totalCents += ligneCents
      lignes.push({
        article_id: article.id,
        article_nom: deal ? deal.titre : article.nom,
        quantite,
        // TVA FIGÉE À LA VENTE. Le taux est recopié ici et ne sera plus jamais
        // recalculé : sans cela, changer le taux d'un article réécrirait
        // rétroactivement toutes les commandes passées, et les exports comme
        // les déclarations deviendraient incohérents. Un deal suit le taux de
        // son article sous-jacent, c'est la même marchandise.
        tva_taux: tauxPourArticle({
          article,
          regime: regimeTva,
          tauxDefautCommerce: commercant.tva_taux_defaut,
        }),
        // Consommation stock RÉELLE : un lot « 3+1 » consomme unites_par_deal
        // unités physiques par lot commandé (audit deals n°1)
        quantite_stock: quantite * (deal?.unites_par_deal || 1),
        // Duo : le second article du deal consomme aussi son stock (1 par duo)
        deal_article2_id: (deal?.deal_type === 'bundle' && deal.article2_id) ? deal.article2_id : null,
        prix_unitaire: prixUnitaire,
        options: optionsFlat.length > 0 ? optionsFlat : null,
        temps_prepa: article.temps_prepa || 1,
      })
    }

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

    // ─── 5) Vérif stock atomic : commandes payées du jour + réservations actives ──
    // Stock disponible = stock_jour - (qte des commandes du jour non annulées)
    //                              - (qte des réservations non expirées)
    // Les seconds articles des duos consomment aussi leur stock : on les inclut
    const stockArticleIds = [...new Set([...articleIds, ...lignes.map(l => l.deal_article2_id).filter(Boolean)])]
    const { data: stocksJour } = await supabase
      .from('article_stock_jour')
      .select('article_id, jour_semaine, stock, actif')
      .in('article_id', stockArticleIds)

    const { data: commandesDejaJour } = await supabase
      .from('commande_articles')
      .select('article_id, quantite, commande:commandes!inner(date_commande, statut, commercant_id)')
      .in('article_id', stockArticleIds)
      .eq('commande.date_commande', date_commande)
      .eq('commande.commercant_id', commercant.id)
      .not('commande.statut', 'in', '("non_retire","annulee_paiement_ko","annulee_client_refund")')

    const { data: reservationsActives } = await supabase
      .from('commande_stock_reservation')
      .select('article_id, quantite')
      .in('article_id', stockArticleIds)
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

    // Consommation AGRÉGÉE par article : une même commande peut cumuler l'unité,
    // un ou plusieurs deals du même article, et le second article d'un duo
    const consoParArticle = {}
    const nomParArticle = {}
    for (const ligne of lignes) {
      consoParArticle[ligne.article_id] = (consoParArticle[ligne.article_id] || 0) + (ligne.quantite_stock || ligne.quantite)
      if (!nomParArticle[ligne.article_id]) nomParArticle[ligne.article_id] = ligne.article_nom
      if (ligne.deal_article2_id) {
        consoParArticle[ligne.deal_article2_id] = (consoParArticle[ligne.deal_article2_id] || 0) + ligne.quantite
        if (!nomParArticle[ligne.deal_article2_id]) nomParArticle[ligne.deal_article2_id] = ligne.article_nom
      }
    }

    for (const [artId, conso] of Object.entries(consoParArticle)) {
      const stockEntry = (stocksJour || []).find(s => s.article_id === artId && s.jour_semaine === jourSemaine)
      if (!stockEntry) continue // article sans stock géré : pas de limite
      if (stockEntry.actif === false) {
        return NextResponse.json({ ok: false, error: `Article "${nomParArticle[artId]}" non disponible ce jour-là.` }, { status: 400 })
      }
      const dispo = (stockEntry.stock || 0) - (qteDejaParArticle[artId] || 0) - (qteReserveeParArticle[artId] || 0)
      if (conso > dispo) {
        return NextResponse.json({
          ok: false,
          error: `Stock insuffisant pour "${nomParArticle[artId]}" : ${Math.max(0, dispo)} disponible(s) (quelqu'un vient de commander).`,
          article_id: artId,
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
