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
import { libelleBon } from '@/lib/bons-cadeaux'
import { eurosNus } from '@/lib/montants'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG, PAYMENT_KIND, buildPaymentMetadata, calculApplicationFee } from '@/lib/stripe'
import { geocoderAdresse } from '@/lib/geocode'
import { coordonneesPlausibles, requeteGeocodage, NOTE_MAX } from '@/lib/adresse-livraison'
import { ordersLimiter, checkLimit, clientIp } from '@/lib/ratelimit'
import { envoyerEmailsCommande } from '@/lib/commande-notifs'
import { normaliserCodeBon, calculerRemiseBon } from '@/lib/bons-cadeaux'
import { chargerBonValide, debiterBon } from '@/lib/bons-cadeaux-server'
import { appliquerRecompenseAvantBon } from '@/lib/fidelite-recompense'
import { modesPaiementOuverts } from '@/lib/modes-paiement'
import { chargerRecompensePourYopper, consommerRecompense, rendreRecompense } from '@/lib/fidelite-recompense-server'
import { identiteProuvee } from '@/lib/yopper-auth'
import { tauxFraisLivraison, REGIME_EMPORTER } from '@/lib/tva'
import { calculerCapaciteCreneau, creneauCommandable, STATUTS_OCCUPENT_CRENEAU } from '@/lib/creneaux'
import { brusselsInstant, jourBruxelles, minutesBruxelles } from '@/lib/timezone'
import { joursRetraitBoutique } from '@/lib/ouverture'
import { zoneCouverte, fraisLivraison, minimumAtteint } from '@/lib/livraison'
import { construireLignesCommande, verifierStockDisponible, SELECT_ARTICLES, SELECT_DEALS } from '@/lib/lignes-commande'
import { normaliserEmail } from '@/lib/email-normalise'
import { verdictForfait } from '@/lib/garde-forfait'

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
      // Envoyés depuis le 22/08 : la requête de géocodage PROPRE (sans le
      // complément), les coordonnées quand le Yopper a choisi son adresse dans
      // les suggestions, et son mot au livreur.
      adresse_geocodage, livraison_lat, livraison_lng, note_livraison,
      paiement_mode, bon_cadeau_code,
      // ⚠️ UN IDENTIFIANT ENVOYÉ PAR LE CLIENT N'EST JAMAIS UNE AUTORISATION.
      // Il désigne seulement CE QU'IL DEMANDE ; tout est revérifié plus bas
      // contre son identité PROUVÉE (voir 4.4).
      fidelite_recompense_id,
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
      // `horaires_detail` et `boutique_delai_heures` : la date de retrait d'une
      // boutique n'était vérifiée NULLE PART côté serveur (voir plus bas).
      // ⚠️ `plan`, `essai_plan` ET `created_at` : la garde de forfait juste en
      // dessous en dépend, et sans elles elle se trompe EN SILENCE.
      .select('id, nom, slug, stripe_account_id, stripe_account_charges_enabled, statut_publication, accepte_paiement_cash, categorie, boutique_mode_vente, boutique_retrait_paiement, boutique_frais_port, boutique_gratuit_des, boutique_expedition_cp, tva_taux_defaut, mode_capacite, horaires_detail, boutique_delai_heures, plan, essai_plan, created_at')
      .eq('id', commercant_id)
      .single()
    if (errC || !commercant) {
      return NextResponse.json({ ok: false, error: 'Commerçant introuvable.' }, { status: 404 })
    }
    if (commercant.statut_publication !== 'publie') {
      return NextResponse.json({ ok: false, error: 'Ce commerçant n\'accepte pas encore de commandes.' }, { status: 400 })
    }

    // 🔴 LE FORFAIT N'ÉTAIT PAS VÉRIFIÉ ICI, et c'est le cœur transactionnel.
    // Un commerçant en Exister ne voit pas le bouton « commander » sur sa
    // fiche, mais rien n'empêchait un `fetch` bien formé de créer la commande
    // et de lancer le paiement. **Une garde d'écran n'est jamais une réponse.**
    //
    // ⚠️ ET ON NE PASSE PAS PAR `peut()` ICI. `peut()` applique la CATÉGORIE,
    // et la matrice réserve `commande` à l'alimentaire alors que toute
    // l'application l'accorde aussi au DÉTAIL : cette route sert justement les
    // deux mondes. Y appliquer la catégorie couperait la boutique de tous les
    // commerces de détail en Vendre. C'est passé à deux doigts le 26/08 ;
    // `verdictForfait` travaille donc au forfait seul.
    //
    // ⚠️ CRÉER, PAS CONSOMMER : cette route ouvre une commande NEUVE. Elle ne
    // touche à rien de ce qui a déjà été vendu.
    {
      const verdict = verdictForfait(commercant, 'commande')
      if (!verdict.ok) {
        return NextResponse.json(
          { ok: false, error: 'Ce commerçant n\'accepte pas encore de commandes.', code: verdict.code },
          { status: verdict.statut }
        )
      }
    }
    // ⚠️ LA LIVRAISON EST UNE AUTRE FONCTION, et elle a son propre palier. Une
    // seule garde sur `commande` laisserait passer une tournée chez un
    // commerçant qui n'y a pas droit.
    if (estLivraison) {
      const verdictLiv = verdictForfait(commercant, 'livraison')
      if (!verdictLiv.ok) {
        return NextResponse.json(
          { ok: false, error: 'La livraison n\'est pas proposée chez ce commerçant.', code: verdictLiv.code },
          { status: verdictLiv.statut }
        )
      }
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

      // ⚠️ LA DATE DE RETRAIT N'ÉTAIT VÉRIFIÉE NULLE PART CÔTÉ SERVEUR. Seul
      // son FORMAT l'était. Cette route ne relisait ni les horaires ni les
      // fermetures : le serveur faisait confiance à l'écran. Un onglet resté
      // ouvert depuis la veille, ou une requête fabriquée, faisait tomber une
      // commande à retirer un dimanche ou en plein congé.
      //
      // C'est exactement le trou que `creneauCommandable` bouche pour
      // l'alimentaire depuis le 10/08. La boutique n'a pas de créneau, donc
      // rien ne la protégeait.
      //
      // ⚠️ Un COLIS n'a pas de jour de retrait : il part quand le commerçant
      // l'emballe. On ne lui applique aucune de ces règles.
      if (estRetraitBoutique) {
        const { data: fermeturesCommercant } = await supabase
          .from('fermetures_exceptionnelles')
          .select('date_debut, date_fin')
          .eq('commercant_id', commercant.id)
        // ⚠️ HEURE BELGE, PAS CELLE DU SERVEUR. Vercel tourne en temps
        // universel : `jourLocalISO(new Date())` y rendrait la veille entre
        // minuit et 2h du matin, et refuserait une commande parfaitement
        // valable. C'est le défaut du food truck, transposé au serveur.
        const joursOk = joursRetraitBoutique({
          horairesDetail: commercant.horaires_detail,
          fermetures: fermeturesCommercant || [],
          depuis: jourBruxelles(),
          maintenant: minutesBruxelles(),
          delaiHeures: commercant.boutique_delai_heures,
          horizon: 14,
        })
        if (!joursOk.some(j => j.jour === date_commande)) {
          return NextResponse.json({
            ok: false,
            error: `${commercant.nom} ne peut pas préparer ta commande pour cette date. Choisis un autre jour de retrait.`,
          }, { status: 400 })
        }
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
    //
    // ⚠️ MÊME RÈGLE QUE L'ÉCRAN, LUE AU MÊME ENDROIT (`lib/modes-paiement.js`).
    // Elle était réécrite ici dans d'autres mots, et une TROISIÈME fois dans le
    // tunnel : trois copies d'une règle qui décide qui encaisse.
    const { stripeOK: enLigneAutorise, cashOK: cashAutorise } = modesPaiementOuverts({
      commercant,
      estDetail: estBoutique,
      modeBoutique: estExpedition ? 'expedition' : 'retrait',
    })
    // 🔴 LES TROIS GARDES DE MOYEN DE PAIEMENT ONT DÉMÉNAGÉ PLUS BAS (28/08).
    //
    // Elles tombaient ICI, plus de deux cents lignes AVANT que le serveur sache
    // ce qu'il reste à payer. Trouvé par Alex : une récompense de 10 € sur un
    // panier à 8 € couvre tout, l'écran envoie alors `en_ligne` par défaut, et
    // chez un commerçant qui encaisse AU COMPTOIR la commande était refusée
    // avec « Le paiement en ligne n'est pas proposé chez ce commerçant ».
    //
    // ⚠️ ON NE REFUSE PAS UN MOYEN DE PAIEMENT POUR UN PAIEMENT QUI N'EXISTE
    // PAS. Le contrôle n'a de sens qu'une fois le dû connu, donc APRÈS que la
    // récompense et le bon cadeau ont été chargés et revalidés.

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
        .select('codes_postaux, frais_fixe, gratuit_des, minimum_commande, actif')
        .eq('commercant_id', commercant.id)
        .maybeSingle()
      if (!cfg || cfg.actif === false) {
        return NextResponse.json({ ok: false, error: 'La livraison n\'est pas configurée chez ce commerçant.' }, { status: 400 })
      }
      // Comparaison normalisée des deux côtés : un code saisi avec une espace
      // insécable ne doit pas faire refuser une livraison sans raison lisible.
      if (!zoneCouverte(cfg.codes_postaux, code_postal_livraison)) {
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
      // ⚠️ LE MINIMUM SE MESURE SUR LES ARTICLES, avant les frais et avant tout
      // bon cadeau. Ajouter les frais ferait franchir le seuil sans que le
      // panier grossisse, et un bon cadeau ferait passer sous le minimum une
      // commande qui l'atteignait : dans les deux cas, le commerçant roulerait
      // pour moins que ce qu'il a fixé.
      const seuilMini = minimumAtteint({ total: totalEUR, minimum: livraisonConfig.minimum_commande })
      if (!seuilMini.ok) {
        return NextResponse.json({
          ok: false,
          error: `La livraison démarre à ${eurosNus(seuilMini.seuil)} € chez ${commercant.nom}. Il te manque ${eurosNus(seuilMini.manque)} €, ou choisis le retrait en magasin.`,
          minimum_livraison: seuilMini.seuil,
          manque: seuilMini.manque,
        }, { status: 400 })
      }
      const calculFrais = fraisLivraison({
        total: totalEUR,
        frais_fixe: livraisonConfig.frais_fixe,
        gratuit_des: livraisonConfig.gratuit_des,
      })
      fraisLivraisonCents = Math.round(calculFrais.montant * 100)
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

    // ─── 4.4) RÉCOMPENSE DE FIDÉLITÉ (bloc 2, 24/08) ──────────────────────
    //
    // ⚠️ ELLE PASSE AVANT LE BON CADEAU, et l'ordre n'est pas cosmétique. La
    // récompense est une REMISE consentie par le commerçant : elle abaisse le
    // prix. Le bon cadeau est de l'ARGENT DÉJÀ PAYÉ par quelqu'un : il paie ce
    // qui reste. Dans l'autre sens, le bon serait consommé sur une part que le
    // commerçant offrait de toute façon, et son porteur perdrait du solde pour
    // rien. Voir `lib/fidelite-recompense.js`.
    //
    // ⚠️ ARBITRAGE D'ALEX (option A) : RÉSERVÉE AU YOPPER CONNECTÉ. La carte a
    // pour clé un numéro de GSM et aucun flux de vérification par SMS n'existe.
    // Sans identité prouvée, il suffirait d'essayer le numéro du voisin, de
    // voir le prix baisser de 5 €, et d'apprendre qu'il a une carte pleine chez
    // ce commerçant. `client_email` vient du CORPS de la requête : il ne prouve
    // rien du tout, c'est `identiteProuvee` qui tranche.
    //
    // ⚠️ ET LA RESTRICTION PORTE SUR L'ÉTAT DU CLIENT, JAMAIS SUR LE CANAL : le
    // Click and Collect, la boutique de détail, le retrait et l'expédition
    // passent tous par ici et sont couverts de la même façon.
    let recompense = null
    let remiseRecompenseEUR = 0
    if (fidelite_recompense_id) {
      const identite = await identiteProuvee(request)
      if (!identite?.email) {
        return NextResponse.json({
          ok: false,
          error: 'Connecte-toi pour utiliser ta récompense fidélité.',
          recompense_refusee: 'non_connecte',
        }, { status: 401 })
      }
      const resRec = await chargerRecompensePourYopper(supabase, {
        email: identite.email,
        commercantId: commercant.id,
        recompenseId: fidelite_recompense_id,
      })
      if (!resRec.ok) {
        const messages = {
          introuvable: 'Cette récompense n\'existe pas.',
          deja_utilisee: 'Cette récompense a déjà été utilisée.',
          autre_commercant: 'Cette récompense appartient à un autre commerce.',
          pas_la_sienne: 'Cette récompense n\'est pas la tienne.',
          absente: 'Récompense introuvable.',
          non_connecte: 'Connecte-toi pour utiliser ta récompense fidélité.',
        }
        return NextResponse.json({
          ok: false,
          error: messages[resRec.raison] || 'Récompense inutilisable.',
          recompense_refusee: resRec.raison,
        }, { status: 400 })
      }
      recompense = resRec.recompense
      remiseRecompenseEUR = appliquerRecompenseAvantBon(recompense, totalEUR + fraisLivraisonEUR).remiseRecompense
    }
    // Ce qu'il reste à couvrir après la récompense : la base du bon cadeau.
    const baseApresRecompense = Math.round((totalEUR + fraisLivraisonEUR - remiseRecompenseEUR) * 100) / 100

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
        return NextResponse.json({ ok: false, error: `Code de ${libelleBon(commercant.categorie)} invalide.` }, { status: 400 })
      }
      const resBon = await chargerBonValide(supabase, { code: codeBon, commercant_id: commercant.id, categorie: commercant.categorie })
      if (!resBon.ok) {
        return NextResponse.json({ ok: false, error: resBon.error }, { status: 400 })
      }
      bonCadeau = resBon.bon
      remiseBonEUR = calculerRemiseBon(bonCadeau.solde, baseApresRecompense)
    }
    const duEUR = Math.round((baseApresRecompense - remiseBonEUR) * 100) / 100
    const duCents = Math.round(duEUR * 100)
    // Dû entièrement couvert sans paiement : confirmation directe, pas de
    // Stripe. ⚠️ LA RÉCOMPENSE SEULE PEUT Y SUFFIRE (5 € sur un panier à 4 €),
    // et ce chemin n'existait que pour le bon cadeau : sans cet ajout, on
    // envoyait le Yopper vers un paiement de 0 €, que Stripe refuse.
    const couvertSansPaiement = duCents === 0 && (!!bonCadeau || !!recompense)

    // ─── 4.55) LE MOYEN DE PAIEMENT, MAINTENANT QUE LE DÛ EST CONNU ────────
    //
    // ⚠️ CES TROIS GARDES ÉTAIENT DEUX CENTS LIGNES PLUS HAUT, et elles
    // refusaient une commande entièrement couverte. Le dû se calcule ici, pas
    // avant : la récompense et le bon viennent d'être revalidés en base.
    //
    // ⚠️ ET LE `couvertSansPaiement` EST CALCULÉ PAR LE SERVEUR, jamais reçu de
    // l'écran : sinon il suffirait d'annoncer « c'est couvert » pour esquiver
    // le choix du commerçant et commander sans payer.
    if (!couvertSansPaiement) {
      if (surPlace && !cashAutorise) {
        return NextResponse.json({ ok: false, error: 'Le paiement sur place n\'est pas proposé chez ce commerçant.' }, { status: 400 })
      }
      // ⚠️ ET LE PAIEMENT EN LIGNE SE REFUSE AUSSI. Le serveur ne vérifiait que
      // le compte Stripe : un commerçant de détail qui a choisi d'encaisser AU
      // COMPTOIR pouvait quand même recevoir un paiement en ligne, et donc une
      // commission qu'il avait refusée. Son choix n'était tenu que par l'écran.
      if (!surPlace && !enLigneAutorise) {
        return NextResponse.json({ ok: false, error: 'Le paiement en ligne n\'est pas proposé chez ce commerçant.' }, { status: 400 })
      }
      if (!surPlace && !commercant.stripe_account_id) {
        return NextResponse.json({ ok: false, error: 'Le paiement en ligne n\'est pas encore activé chez ce commerçant.' }, { status: 400 })
      }
    }

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
          : etatCreneau.raison === 'passe'
            ? 'Ce créneau est déjà passé. Choisis-en un autre.'
            : `Il est trop tard pour ce créneau : ${commercant.nom} demande de commander au moins ${etatCreneau.heures} h à l'avance. Choisis un créneau plus tardif.`
        return NextResponse.json({ ok: false, error: message, creneau_indisponible: true }, { status: 409 })
      }
    }

    // ─── 4.6) LE CRÉNEAU FERMÉ À LA VOLÉE, CÔTÉ SERVEUR ────────────────────
    //
    // ⚠️ CETTE GARDE EST LA RAISON D'ÊTRE DE LA FONCTIONNALITÉ, PAS SON
    // ACCESSOIRE. Le commerçant ferme un créneau parce qu'il est débordé au
    // comptoir. Si seule la fiche cachait le créneau, un onglet resté ouvert
    // depuis dix minutes, ou une requête fabriquée, ferait tomber exactement la
    // commande qu'il vient de refuser — et il l'apprendrait en la découvrant.
    // Une garde d'écran n'est jamais une réponse (feedback_securite_dabord).
    //
    // ⚠️ ELLE NE TOUCHE PAS AUX COMMANDES DÉJÀ PRISES : elle ne s'applique qu'à
    // celle qu'on est en train de créer. C'est la règle d'Alex, « ce qui est
    // vendu reste vendu ».
    //
    // ⚠️ ELLE NE VAUT QUE POUR LE RETRAIT. `creneaux_blocages.creneau_id` pointe
    // `creneaux` ; les tournées de livraison vivent dans `livraison_creneaux` et
    // ne sont donc PAS couvertes. Ce n'est pas un oubli, c'est nommé : fermer
    // une tournée demande une colonne de plus dans la table de blocage, donc
    // une seconde migration. Inscrit dans la todo.
    if (creneau && !estBoutique && !estLivraison) {
      const { data: blocage } = await supabase
        .from('creneaux_blocages')
        .select('id')
        .eq('creneau_id', creneau.id)
        .eq('date_blocage', date_commande)
        .maybeSingle()
      if (blocage) {
        return NextResponse.json({
          ok: false,
          // Le commerçant n'a pas à se justifier auprès du client, et son motif
          // est une note interne : on dit le fait, pas la raison.
          error: `${commercant.nom} ne prend plus de commande sur ce créneau. Choisis-en un autre.`,
          creneau_indisponible: true,
        }, { status: 409 })
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

    // ─── Coordonnées de livraison, pour la tournée optimisée ───────────────
    //
    // ⚠️ CE BLOC NE TROUVAIT JAMAIS RIEN, ET C'EST LE DÉFAUT DU 22/08. Il
    // géocodait la chaîne D'AFFICHAGE, celle qui contient déjà le complément
    // (« Boîte 3 ») ET la ligne du code postal, en lui rajoutant le code postal
    // une seconde fois. Nominatim, avec `limit=1`, ne rendait rien.
    //
    // ⚠️ CE COMMENTAIRE NE RECOPIE PLUS L'APPEL FAUTIF, ET C'EST VOLONTAIRE :
    // le banc interdit cette forme d'écriture et la trouvait ici, dans le texte
    // qui l'explique. Un commentaire n'a pas besoin de citer ce qu'il proscrit.
    //
    // Deux changements, dans cet ordre de préférence :
    //   1. le navigateur envoie des coordonnées quand le Yopper a CHOISI son
    //      adresse dans les suggestions. C'est la source la plus sûre : elle
    //      vient du même moteur, mais avec un humain qui a validé le résultat.
    //   2. sinon, on géocode une requête PROPRE (`adresse_geocodage`), sans
    //      complément et sans répétition.
    //
    // ⚠️ LES COORDONNÉES DU NAVIGATEUR SONT REVALIDÉES ICI. Elles viennent de
    // l'extérieur : un Yopper ne peut fausser que sa propre livraison, mais une
    // coordonnée absurde ferait diverger l'itinéraire de toute la tournée.
    //
    // ⚠️ ET RIEN DE TOUT CECI NE BLOQUE LA VENTE. Une rue neuve que le moteur
    // ne connaît pas ne doit pas coûter une commande : la tournée annonce déjà
    // les arrêts sans coordonnées au lieu de les taire.
    let coordsLivraison = null
    if (estLivraison) {
      coordsLivraison = coordonneesPlausibles(livraison_lat, livraison_lng)
        ? { lat: Number(livraison_lat), lng: Number(livraison_lng) }
        : await geocoderAdresse(adresse_geocodage || requeteGeocodage({ rue: adresse_livraison, code_postal: code_postal_livraison }))
    }

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
        // ⚠️ TRONQUÉE ICI AUSSI, pas seulement à l'écran. Le champ du navigateur
        // limite déjà, mais rien n'oblige un appelant à passer par lui.
        note_livraison: (estLivraison || estExpedition)
          ? (String(note_livraison ?? '').trim().slice(0, NOTE_MAX) || null)
          : null,
        frais_livraison: fraisLivraisonEUR,
        client_nom: nomComplet,
        // ⚠️ NORMALISÉ, sans quoi le client perd ses commandes en se connectant.
        // L'email était enregistré TEL QUE TAPÉ et relu EN MINUSCULES par
        // `identiteYopper` : celui qui avait saisi « Jean.Dupont@Gmail.com » ne
        // retrouvait plus rien après connexion, comme s'il n'avait jamais
        // commandé. Le défaut épargnait quiconque tape en minuscules, donc son
        // auteur, ce qui est la pire des configurations.
        client_email: normaliserEmail(client_email),
        client_telephone,
        rgpd_commande: true,
        rgpd_marketing: !!rgpd_marketing,
        total: totalEUR + fraisLivraisonEUR,
        bon_cadeau_id: bonCadeau?.id || null,
        bon_cadeau_montant: remiseBonEUR,
        // ⚠️ LA REMISE EST FIGÉE SUR LA COMMANDE, pas recalculée à la lecture.
        // C'est ce qui permet à la comptabilité de montrer, des années plus
        // tard, ce que le commerçant a réellement offert ce jour-là. La
        // récompense, elle, n'est CONSOMMÉE qu'à la confirmation (plus bas).
        fidelite_recompense_id: recompense?.id || null,
        fidelite_remise: remiseRecompenseEUR,
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
        // ⚠️ LE NOM EST FIGÉ À LA VENTE, comme le taux de TVA juste en dessous
        // et pour la même raison : ce qui a été vendu ne doit pas changer parce
        // que le catalogue a bougé. Il était CALCULÉ puis JETÉ, et le tableau de
        // bord le retrouvait par jointure sur `articles`. Deux dégâts : un deal
        // perdait son titre (« Lot de 3 » s'affichait sous le nom de l'article
        // de base), et un article retiré du catalogue, ce qui arrive à chaque
        // fin de collection en boutique de détail, rendait la commande illisible
        // POUR TOUJOURS — y compris en comptabilité, où un justificatif doit
        // tenir des années.
        article_nom: l.article_nom,
        // ⚠️ LA VERSION VENDUE, et sans elle le stock ne peut PAS être rendu.
        // Elle n'existait que sous forme de libellé dans `options` (« Version :
        // M · Bleu »), et un libellé n'est pas une clé : deux versions peuvent
        // porter le même nom après un renommage. Le stock d'une commande
        // abandonnée était donc perdu pour toujours.
        variante_id: l.variante_id || null,
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
    // ⚠️ LA RÉCOMPENSE SE PREND AVANT LE BON, ET CE N'EST PAS L'ORDRE DU
    // CALCUL QUI L'IMPOSE, C'EST LE DÉGÂT EN CAS D'ÉCHEC. Le bon cadeau
    // débité ne se rend pas d'un revers de main ; la récompense, si. En
    // prenant la récompense d'abord, un refus du bon peut être défait
    // entièrement. Dans l'autre sens, le bon serait brûlé sur une commande
    // annulée, et son porteur aurait perdu de l'argent pour rien.
    const confirmeSansStripe = surPlace || couvertSansPaiement

    // ─── 8.35) RÉCOMPENSE DE FIDÉLITÉ ──────────────────────────────────────
    //
    // ⚠️ ON NE CONSOMME QU'À LA CONFIRMATION. Un Yopper qui ouvre Stripe puis
    // ferme son onglet ne doit rien perdre : le chemin en ligne consomme au
    // webhook « paiement OK », jamais ici. C'est la règle du bon cadeau, et
    // c'est aussi ce qui rend le double clic inoffensif.
    //
    // ⚠️ ET SI ELLE VIENT D'ÊTRE DÉPENSÉE AILLEURS, ON ANNULE PROPREMENT plutôt
    // que d'offrir la remise deux fois : `consommerRecompense` écrit sous
    // `utilisee_at IS NULL`, donc le second passage ne trouve plus de ligne et
    // rend `false`. Sans ce contrôle, la même récompense paierait deux
    // commandes et le commerçant en ferait les frais.
    if (recompense && confirmeSansStripe) {
      const prise = await consommerRecompense(supabase, {
        recompense,
        source: 'commande',
        commandeId: commande.id,
      })
      if (!prise) {
        await supabase.from('commandes').update({ statut: 'annulee_paiement_ko' }).eq('id', commande.id)
        await supabase.from('commande_stock_reservation').delete().eq('commande_id', commande.id)
        return NextResponse.json({ ok: false, error: 'Ta récompense vient d\'être utilisée ailleurs. Recharge la page et réessaie.' }, { status: 409 })
      }
    }

    if (bonCadeau && remiseBonEUR > 0 && confirmeSansStripe) {
      const deb = await debiterBon(supabase, bonCadeau.id, remiseBonEUR, { source: 'commande', commande_id: commande.id })
      if (!deb.ok) {
        // ⚠️ ON REND LA RÉCOMPENSE. Elle vient d'être prise trois lignes plus
        // haut pour une commande qui n'aura pas lieu : la laisser dépensée
        // ferait perdre au Yopper une carte entière à cause d'un bon cadeau
        // qui ne le concerne même pas.
        if (recompense) await rendreRecompense(supabase, recompense)
        await supabase.from('commandes').update({ statut: 'annulee_paiement_ko' }).eq('id', commande.id)
        await supabase.from('commande_stock_reservation').delete().eq('commande_id', commande.id)
        console.error('[create-commande] débit bon cadeau KO', deb.error)
        return NextResponse.json({ ok: false, error: `Ce ${libelleBon(commercant.categorie)} vient d’être utilisé, vérifie son solde et réessaie.` }, { status: 409 })
      }
    }

    // ─── 8.5) PAIEMENT SUR PLACE ou DÛ 0 (bon cadeau) : confirmation
    // immédiate, pas de Stripe. Miroir exact du webhook paiement OK : bascule
    // en_attente, libération de la réservation TTL (la commande EST le stock
    // consommé), puis emails + rappel push via lib/commande-notifs.
    if (confirmeSansStripe) {
      const { error: errConfirm } = await supabase
        .from('commandes')
        .update(couvertSansPaiement && !surPlace
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
      // `bon_total` garde son nom pour l'écran, mais son sens s'élargit : « dû
      // à zéro, confirmé sans passer par Stripe ». Ce peut désormais être la
      // récompense de fidélité seule.
      return NextResponse.json({ ok: true, cash: surPlace, bon_total: couvertSansPaiement && !surPlace, commande_id: commande.id })
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
      // Avec une remise : une seule ligne au montant restant dû (Stripe ne
      // gère pas de ligne négative en Checkout), la déduction est explicitée
      // dans le descriptif. Sans remise : lignes commande + frais classiques.
      //
      // ⚠️ LA CONDITION PORTE SUR TOUTE REMISE, PAS SUR LE SEUL BON CADEAU.
      // Tant qu'elle ne regardait que `remiseBonEUR`, une récompense de
      // fidélité utilisée SANS bon cadeau retombait dans la branche du bas et
      // facturait `totalCents` : **le Yopper payait le prix plein pendant que
      // sa commande enregistrait la remise, et sa récompense était consommée
      // pour rien.**
      line_items: (remiseBonEUR > 0 || remiseRecompenseEUR > 0) ? [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: duCents,
            product_data: {
              name: `Commande Yoppaa · ${commercant.nom}`,
              description: [
                descCommande,
                remiseRecompenseEUR > 0 ? `récompense fidélité (−${eurosNus(remiseRecompenseEUR)} €)` : null,
                remiseBonEUR > 0 ? `${libelleBon(commercant.categorie)} déduit (−${eurosNus(remiseBonEUR)} €)` : null,
              ].filter(Boolean).join(' · '),
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
