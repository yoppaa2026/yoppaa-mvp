// POST /api/stripe/checkout/create-rdv-commande
//
// TUNNEL UNIQUE des commerces de services : un rendez-vous ET des produits,
// dans UNE seule transaction Stripe.
//
// LE PROBLÈME QUE CETTE ROUTE RÈGLE. Un client qui réservait une coupe et
// voulait repartir avec son shampoing devait faire deux parcours et deux
// paiements, sur deux pages différentes. Décision Alex du 03/08 : un seul
// tunnel, un seul paiement, un seul email.
//
// CE QUI EST ENCAISSÉ. L'acompte du rendez-vous, quand la prestation en
// demande un, PLUS le prix complet des produits. Les produits sont payés en
// entier parce qu'ils sont vendus, pas réservés : ils sont mis de côté et
// retirés le jour du rendez-vous.
//
// PRESTATION SANS ACOMPTE (décision Alex du 04/08) : on encaisse quand même
// les produits et on confirme le rendez-vous. Le client paie ce qu'il achète,
// et le salon garde une réservation ferme, ce qui est exactement ce que
// l'acompte cherchait à obtenir.
//
// DEUX OBJETS, UN PAIEMENT. La commande est créée AVANT le paiement, en
// 'paiement_en_attente', avec sa réservation de stock : c'est le seul moyen de
// garder la marchandise pendant que le client est sur Stripe. Le rendez-vous,
// lui, reste dans les metadata et n'est créé qu'au succès du paiement, comme
// dans le tunnel d'acompte : un rendez-vous fantôme bloquerait un créneau réel
// dans l'agenda du salon. Le webhook crée le rendez-vous, bascule la commande
// et écrit le lien des deux côtés.
//
// LE LIEN EST OBLIGATOIRE. À l'annulation, le client choisit s'il garde ses
// produits. S'il les garde, seul l'acompte est remboursé : c'est un
// remboursement partiel, et sans le lien on ne saurait pas quelle part
// rembourser.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG, PAYMENT_KIND, buildPaymentMetadata, calculApplicationFee } from '@/lib/stripe'
import { ordersLimiter, checkLimit, clientIp } from '@/lib/ratelimit'
import { REGIME_EMPORTER } from '@/lib/tva'
import { construireLignesCommande, verifierStockDisponible, SELECT_ARTICLES, SELECT_DEALS } from '@/lib/lignes-commande'
import { normaliserEmail } from '@/lib/email-normalise'
import { identiteProuvee } from '@/lib/yopper-auth'
import { appliquerRecompenseAvantBon } from '@/lib/fidelite-recompense'
import { chargerRecompensePourYopper, consommerRecompense, rendreRecompense } from '@/lib/fidelite-recompense-server'
import { chargerBonValide, debiterBon, recrediterBon } from '@/lib/bons-cadeaux-server'
import { creerReservationRdv } from '@/lib/rdv-creation-server'
import { normaliserCodeBon } from '@/lib/bons-cadeaux'
import { ventilerTunnelRdv } from '@/lib/tunnel-rdv-montants'
import { euros } from '@/lib/montants'

const arrondiEuros = (n) => Math.round(Number(n || 0) * 100) / 100

export async function POST(request) {
  try {
    requireStripe()

    const limite = await checkLimit(ordersLimiter, clientIp(request))
    if (!limite.success) {
      return NextResponse.json({ ok: false, error: 'Trop de tentatives, réessaie dans un instant.' }, { status: 429 })
    }

    const body = await request.json()
    const {
      commercant_id, prestation_id, praticien_id, date_rdv, heure_debut, heure_fin, duree_minutes,
      client_email, client_prenom, client_nom, client_telephone,
      notes_client, rgpd_marketing,
      articles = [],
      // 🔴 CE CHAMP N'EXISTAIT NI ICI NI CHEZ L'APPELANT. Les deux côtés étaient
      // muets, ce qui explique qu'aucune erreur ne soit jamais remontée : il n'y
      // avait rien à refuser, juste une remise qui n'arrivait pas.
      fidelite_recompense_id,
      // Revalide plus bas : un code envoye n autorise rien.
      bon_cadeau_code,
    } = body

    if (!commercant_id || !prestation_id || !date_rdv || !heure_debut || !heure_fin) {
      return NextResponse.json({ ok: false, error: 'Données du rendez-vous incomplètes.' }, { status: 400 })
    }
    if (!client_email || !client_prenom || !client_nom || !client_telephone) {
      return NextResponse.json({ ok: false, error: 'Coordonnées incomplètes.' }, { status: 400 })
    }
    if (!Array.isArray(articles) || articles.length === 0) {
      // Sans produit, c'est le tunnel d'acompte classique qui s'applique : il a
      // sa propre route et ne crée aucune commande.
      return NextResponse.json({ ok: false, error: 'Aucun produit dans ce panier.' }, { status: 400 })
    }

    // service_role : cette route est appelée publiquement, y compris par un
    // visiteur qui n'a pas de compte.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const [{ data: commercant }, { data: prestation }] = await Promise.all([
      supabase.from('commercants')
        .select('id, nom, slug, categorie, plan, stripe_account_id, stripe_account_charges_enabled, rdv_acompte_en_ligne_actif, rdv_acompte_global, tva_taux_defaut')
        .eq('id', commercant_id).single(),
      supabase.from('rdv_prestations')
        .select('id, nom, prix, acompte_pourcent, duree_minutes, commercant_id')
        .eq('id', prestation_id).single(),
    ])

    if (!commercant) return NextResponse.json({ ok: false, error: 'Commerçant introuvable.' }, { status: 404 })
    if (!prestation || prestation.commercant_id !== commercant.id) {
      return NextResponse.json({ ok: false, error: 'Prestation introuvable.' }, { status: 404 })
    }
    if (!commercant.stripe_account_id || !commercant.stripe_account_charges_enabled) {
      return NextResponse.json({ ok: false, error: 'Le paiement en ligne n\'est pas encore activé chez ce commerçant.' }, { status: 400 })
    }

    // ─── Acompte du rendez-vous ────────────────────────────────────────────
    // Peut valoir zéro : la prestation n'en demande pas, ou le commerçant n'a
    // pas activé l'acompte en ligne. Dans ce cas seuls les produits sont
    // encaissés, et le rendez-vous est confirmé quand même.
    // Plus de repli sur une fourchette : les colonnes n'existent plus (27/08).
    const prixBase = prestation.prix != null ? Number(prestation.prix) : null
    const acomptePct = prestation.acompte_pourcent || commercant.rdv_acompte_global || 0

    // ─── RÉCOMPENSE DE FIDÉLITÉ ────────────────────────────────────────────
    //
    // 🔴 CETTE ROUTE NE CONNAISSAIT PAS LA FIDÉLITÉ. Trouvé par Alex le 27/08,
    // en production. Son frère `create-rdv-acompte` chargeait la récompense,
    // calculait l'acompte sur le net et transmettait la remise au webhook.
    // Celle-ci ne faisait rien de tout ça : dès qu'un PRODUIT accompagnait le
    // rendez-vous, l'écran annonçait « Payer 30,90 € » après déduction des
    // 10 €, et le serveur encaissait 33,90 €. La récompense n'était pas
    // consommée, `fidelite_remise` restait à zéro, et l'email de confirmation
    // décrivait fidèlement un paiement plein tarif.
    //
    // ⚠️ L'ÉCRAN CALCULE, LE SERVEUR DÉCIDE. Le montant affiché venait du
    // navigateur ; il était juste, mais il n'engageait personne. Une remise qui
    // n'existe que côté client est une promesse sans débiteur.
    //
    // ⚠️ MÊME RÈGLE QUE LE TUNNEL VOISIN, et c'est le but : identité PROUVÉE
    // par le jeton (jamais `client_email`, envoyé par le client), remise
    // appliquée AVANT le bon cadeau, et acompte calculé sur le prix NET, sans
    // quoi le Yopper avancerait un acompte assis sur un prix qu'il ne paie pas.
    let recompense = null
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
        return NextResponse.json({
          ok: false,
          error: 'Récompense inutilisable.',
          recompense_refusee: resRec.raison,
        }, { status: 400 })
      }
      recompense = resRec.recompense
      // ⚠️ L'ASSIETTE EST LE PANIER ENTIER DEPUIS LE 30/08, et pas la seule
      // prestation. Elle ne peut donc plus se calculer ici : le total des
      // produits n'est connu qu'une fois les articles relus en base. Le calcul
      // descend plus bas, avec la ventilation.
      // (Décision d'Alex : la même récompense payait le pain chez le boulanger
      // et refusait le shampoing chez le coiffeur.)
    }

    // ⚠️ 🔴 LE BON CADEAU AUSSI, ET C'EST EXACTEMENT LE DÉFAUT DU 27/08.
    // Ce jour-là, DEUX tunnels de paiement pour un rendez-vous, un seul
    // connaissait la fidélité : l'écran annonçait 30,90 €, le serveur
    // encaissait 33,90 €. Le bon cadeau vient d'entrer dans le tunnel
    // d'acompte seul ; l'oublier ici recréerait la même promesse sans
    // débiteur, dès qu'un produit accompagne le rendez-vous.
    //
    // ⚠️ LE BON PAIE MAINTENANT LES PRODUITS AUSSI (décision d'Alex, 29/08).
    // Il ne mordait que sur la prestation : le client voyait son bon fondre de
    // 35 € sans que le montant à payer bouge d'un centime. C'est de l'argent
    // déjà versé chez ce commerçant, il paie ce qu'il y a dans le panier.
    let bonCadeau = null
    if (bon_cadeau_code) {
      const codeBon = normaliserCodeBon(bon_cadeau_code)
      if (!codeBon) {
        return NextResponse.json({ ok: false, error: 'Code de bon cadeau invalide.' }, { status: 400 })
      }
      const resBon = await chargerBonValide(supabase, { code: codeBon, commercant_id: commercant.id })
      if (!resBon.ok) {
        return NextResponse.json({ ok: false, error: resBon.error, bon_refuse: true }, { status: 400 })
      }
      bonCadeau = resBon.bon
    }

    // ─── Produits : prix, remises et TVA calculés SERVEUR ──────────────────
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
      supabase.from('article_variantes').select('id, article_id, axe1_valeur, axe2_valeur, prix, stock, actif').in('article_id', articleIds),
      supabase.from('yoppaa_deals').select(SELECT_DEALS).eq('commercant_id', commercant.id).eq('actif', true),
    ])

    if (!articlesData || articlesData.length !== articleIds.length) {
      return NextResponse.json({ ok: false, error: 'Un ou plusieurs articles introuvables.' }, { status: 400 })
    }
    for (const a of articlesData) {
      if (a.commercant_id !== commercant.id) {
        return NextResponse.json({ ok: false, error: `Article "${a.nom}" n'appartient pas à ce commerçant.` }, { status: 400 })
      }
      if (!a.actif) {
        return NextResponse.json({ ok: false, error: `Article "${a.nom}" n'est plus disponible.` }, { status: 400 })
      }
      if (a.est_vitrine) {
        return NextResponse.json({ ok: false, error: `"${a.nom}" n'est pas commandable en ligne.` }, { status: 400 })
      }
    }

    // Les produits d'un salon sont des biens emportés : régime « à emporter ».
    const calcul = construireLignesCommande({
      panier: articles,
      articlesData, optionsValeurs, variantesData, dealsData,
      commercant,
      regime: REGIME_EMPORTER,
      dateCommande: date_rdv,
    })
    if (!calcul.ok) {
      return NextResponse.json({ ok: false, error: calcul.error }, { status: calcul.status })
    }
    const { lignes, totalCents: produitsCents } = calcul
    if (produitsCents <= 0) {
      return NextResponse.json({ ok: false, error: 'Total des produits invalide.' }, { status: 400 })
    }

    // ─── LA VENTILATION, ET ELLE VIT DANS UN SEUL MODULE ───────────────────
    //
    // ⚠️ ELLE ARRIVE APRÈS LES PRODUITS, ET C'EST OBLIGATOIRE : le bon cadeau
    // paie désormais le panier entier, donc il faut connaître le total des
    // produits pour savoir ce qu'il reste du bon après la prestation.
    //
    // ⚠️ MÊME FONCTION QUE L'ÉCRAN. C'est tout l'objet du module : les deux
    // calculs séparés avaient divergé, et l'écran de confirmation annonçait un
    // acompte de 8,75 € sur un rendez-vous où le serveur en encaissait zéro.
    //
    // ⚠️ L'ASSIETTE DE LA RÉCOMPENSE EST LE PANIER ENTIER, prestation plus
    // produits (Alex, 30/08). `appliquerRecompenseAvantBon` plafonne la remise
    // à cette assiette : une récompense de 10 € sur un panier de 6 € ne peut
    // pas en déduire 10.
    const assietteRecompense = arrondiEuros((prixBase || 0) + produitsCents / 100)
    const remiseRecompenseEUR = recompense
      ? appliquerRecompenseAvantBon(recompense, assietteRecompense).remiseRecompense
      : 0

    const vent = ventilerTunnelRdv({
      prixPrestation: prixBase,
      acomptePourcent: acomptePct,
      acompteEnLigne: !!commercant.rdv_acompte_en_ligne_actif,
      totalProduits: produitsCents / 100,
      remiseRecompense: remiseRecompenseEUR,
      soldeBon: bonCadeau ? Number(bonCadeau.solde) : 0,
    })
    const acompteMontant = vent.acompte
    const acompteCents = Math.round(acompteMontant * 100)
    const produitsAPayerCents = Math.round(vent.produitsAPayer * 100)

    // ⚠️ ICI, PAS DE REFUS SI L'ACOMPTE TOMBE SOUS LE MINIMUM STRIPE, contrairement
    // au tunnel d'acompte seul : le panier porte AUSSI des produits, donc le
    // paiement total dépasse largement les 0,50 €. Un acompte réduit à zéro par
    // la récompense laisse simplement les produits à encaisser, et le
    // rendez-vous reste confirmé (règle déjà en place plus haut).
    //
    // ⚠️ EN REVANCHE, UN BON QUI COUVRE TOUT NE LAISSE RIEN À ENCAISSER, et ce
    // cas n'existait pas avant que le bon paie les produits.
    //
    // 🔴 IL ÉTAIT REFUSÉ. « Ton bon cadeau couvre la totalité : réserve sans
    // produits, ou présente ton bon au comptoir. » Le cas le plus favorable au
    // client était le seul qu'on renvoyait au comptoir, parce que Stripe refuse
    // un paiement sous 0,50 €.
    //
    // ✅ IL EST MAINTENANT CONFIRMÉ SANS STRIPE, comme la boutique le fait
    // depuis toujours avec `couvertSansPaiement` : le rendez-vous se crée, la
    // commande se confirme, le bon se débite et la récompense se consomme, tout
    // en bas de cette route.
    //
    // ⚠️ ET LE SERVEUR LE CALCULE, il ne le reçoit pas : sinon il suffirait
    // d'annoncer « c'est couvert » pour réserver sans payer. Le bon et la
    // récompense viennent d'être rechargés en base, c'est leur solde qui décide.
    const totalCents = acompteCents + produitsAPayerCents
    const couvertSansPaiement = totalCents === 0 && (!!bonCadeau || !!recompense)
    if (totalCents < 50 && !couvertSansPaiement) {
      return NextResponse.json({ ok: false, error: 'Total trop faible (minimum 0,50 € Stripe).' }, { status: 400 })
    }

    // Stock du jour du rendez-vous : les produits sont mis de côté pour ce
    // jour-là, puisque c'est là qu'ils seront retirés.
    const verifStock = await verifierStockDisponible({
      supabase, lignes, commercantId: commercant.id, dateCommande: date_rdv,
    })
    if (!verifStock.ok) {
      return NextResponse.json({
        ok: false,
        error: verifStock.error,
        ...(verifStock.article_id ? { article_id: verifStock.article_id, stock_disponible: verifStock.stock_disponible } : {}),
      }, { status: verifStock.status })
    }
    const nomParArticle = verifStock.nomParArticle || {}

    // ─── Commande créée AVANT le paiement ──────────────────────────────────
    // Statut intermédiaire, comme dans le tunnel boutique : le webhook la
    // retrouvera par son identifiant, et le cron d'expiration la libérera si
    // le paiement n'arrive jamais.
    const nomComplet = `${client_prenom} ${client_nom}`.trim()
    const { data: commande, error: errInsert } = await supabase
      .from('commandes')
      .insert({
        commercant_id: commercant.id,
        creneau_id: null,
        creneau_livraison_id: null,
        // Le rendez-vous EST le moment du retrait : pas de créneau de retrait
        // séparé, le client repart avec ses produits en sortant du fauteuil.
        mode_retrait: 'retrait',
        regime_tva: REGIME_EMPORTER,
        client_nom: nomComplet,
        // ⚠️ Normalisé : sans ça le client perd ses commandes en se connectant,
        // l'email étant relu en minuscules par `identiteYopper`.
        client_email: normaliserEmail(client_email),
        client_telephone,
        rgpd_commande: true,
        rgpd_marketing: !!rgpd_marketing,
        total: produitsCents / 100,
        statut: 'paiement_en_attente',
        date_commande: date_rdv,
        paye_en_ligne: false,
        // ⚠️ LA PART DU BON QUI PAIE LES PRODUITS VIT SUR LA COMMANDE, pas sur
        // le rendez-vous, et ce n'est pas un détail de rangement : à
        // l'annulation, le client peut GARDER ses produits. Cette part-là ne
        // lui revient alors pas, alors que la part prestation revient toujours.
        // Le webhook la débite tout seul depuis ces deux colonnes, avec
        // `source:'commande'`, comme pour n'importe quelle commande.
        ...(bonCadeau && vent.bonSurProduits > 0 ? {
          bon_cadeau_id: bonCadeau.id,
          bon_cadeau_montant: vent.bonSurProduits,
        } : {}),
        // ⚠️ ET LA PART DE RÉCOMPENSE QUI TOMBE SUR LES PRODUITS, depuis
        // qu'elle paie le panier entier (30/08). Sans elle, `commandes.total`
        // resterait le brut : le reste à encaisser au comptoir et le journal
        // comptable réclameraient une remise que le client a déjà eue.
        //
        // ⚠️ PAS DE `fidelite_recompense_id` ICI : la récompense est UNE ligne,
        // consommée UNE fois, et c'est le rendez-vous qui la porte. La poser
        // aussi sur la commande ferait croire à deux consommations.
        ...(vent.recompenseSurProduits > 0 ? { fidelite_remise: vent.recompenseSurProduits } : {}),
      })
      .select()
      .single()

    if (errInsert || !commande) {
      console.error('[create-rdv-commande] insert commande KO', errInsert)
      return NextResponse.json({ ok: false, error: 'Impossible d\'enregistrer la commande.' }, { status: 500 })
    }

    // Réservation atomique du stock, mêmes règles que la boutique : sans elle,
    // deux clients simultanés achètent le dernier flacon. Les quantités sont
    // celles agrégées par la vérification, pas un recomptage : un second
    // comptage du même panier finirait par diverger du premier.
    const { error: errStock } = await supabase.rpc('reserver_stock_atomique', {
      p_commande_id: commande.id,
      p_commercant_id: commercant.id,
      p_date: date_rdv,
      p_jour_semaine: verifStock.jourSemaine,
      p_items: Object.entries(verifStock.consoParArticle || {}).map(([article_id, quantite]) => ({ article_id, quantite })),
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
      console.error('[create-rdv-commande] reserver_stock_atomique KO', errStock)
      return NextResponse.json({ ok: false, error: 'Impossible de réserver le stock, réessaie dans un instant.' }, { status: 500 })
    }

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
      await supabase.from('commandes').delete().eq('id', commande.id)
      console.error('[create-rdv-commande] insert lignes KO', errLignes)
      return NextResponse.json({ ok: false, error: 'Impossible d\'enregistrer le détail de la commande.' }, { status: 500 })
    }

    // ─── RIEN À ENCAISSER : ON CONFIRME ICI, SANS STRIPE ───────────────────
    //
    // Miroir exact de `couvertSansPaiement` dans le tunnel boutique, et miroir
    // exact du webhook « paiement OK » de ce tunnel-ci : le rendez-vous naît, la
    // commande bascule, les deux avantages se consomment, le lien s'écrit des
    // deux côtés.
    //
    // ⚠️ L'ORDRE N'EST PAS ESTHÉTIQUE, IL EST DICTÉ PAR LE DÉGÂT EN CAS
    // D'ÉCHEC. Le rendez-vous d'abord, parce que c'est le seul geste qui peut
    // être refusé par la base (créneau pris entre-temps) et qu'il se supprime
    // proprement. La récompense ensuite, parce qu'elle se rend d'un revers de
    // main. Le bon en dernier, parce qu'un bon débité coûte de l'argent réel à
    // son porteur.
    if (couvertSansPaiement) {
      const rdvId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null
      // Tout défaire : le stock revient, la commande disparaît. Sans ça, un
      // créneau pris entre-temps laisserait une commande fantôme qui garde de
      // la marchandise réservée jusqu'à l'expiration.
      const toutDefaire = async () => {
        await supabase.from('commande_stock_reservation').delete().eq('commande_id', commande.id)
        await supabase.from('commande_articles').delete().eq('commande_id', commande.id)
        await supabase.from('commandes').delete().eq('id', commande.id)
      }

      const resa = await creerReservationRdv(supabase, {
        rdvId,
        commercantId: commercant.id,
        prestationId: prestation.id,
        dateRdv: date_rdv,
        heureDebut: heure_debut,
        champs: {
          praticien_id: praticien_id || null,
          client_email: normaliserEmail(client_email),
          client_prenom, client_nom, client_telephone,
          heure_fin: String(heure_fin).slice(0, 5),
          duree_minutes: Number(duree_minutes || prestation.duree_minutes) || null,
          prix_estime: prixBase,
          // Aucun acompte n'a été encaissé : il n'y avait rien à encaisser.
          acompte_montant: null,
          // ⚠️ MAIS QUELQUE CHOSE ÉTAIT DÛ, et c'est le bon qui l'a couvert. Sans
          // ce nombre, un no-show ne saurait pas quelle part du bon était la
          // garantie du commerçant, et la lui laisserait tout entière.
          acompte_du: vent.acompteDu,
          acompte_paye: false,
          statut: 'confirme',
          source: 'yopper',
          commande_id: commande.id,
          notes_client: (notes_client || '').slice(0, 480) || null,
          rgpd_marketing: !!rgpd_marketing,
          // ⚠️ SEULE LA PART PRESTATION EST FIGÉE ICI. La part produits vit sur
          // la commande, avec ses propres colonnes : à l'annulation, le client
          // peut GARDER ses produits, et cette part-là ne lui revient pas.
          ...(recompense ? {
            fidelite_recompense_id: recompense.id,
            fidelite_remise: vent.recompenseSurPresta,
          } : {}),
          ...(bonCadeau && vent.bonSurPresta > 0 ? {
            bon_cadeau_id: bonCadeau.id,
            bon_cadeau_montant: vent.bonSurPresta,
          } : {}),
        },
      })
      if (!resa.ok) {
        await toutDefaire()
        if (resa.code === 'place_prise') {
          return NextResponse.json({ ok: false, error: 'place_prise', collectif: !!resa.collectif }, { status: 409 })
        }
        console.error('[create-rdv-commande] création RDV sans paiement KO', resa.code, resa.error)
        return NextResponse.json({ ok: false, error: 'Ta réservation n\'a pas pu être enregistrée. Réessaie.' }, { status: 500 })
      }
      const idRdv = resa.rdv.id

      // ⚠️ ÉCRITE SOUS `utilisee_at IS NULL` : si elle vient d'être dépensée
      // ailleurs, on ne l'offre pas deux fois, on annule proprement.
      if (recompense) {
        const prise = await consommerRecompense(supabase, { recompense, source: 'rdv', rdvId: idRdv })
        if (!prise) {
          await supabase.from('rdv_reservations').delete().eq('id', idRdv)
          await toutDefaire()
          return NextResponse.json({ ok: false, error: 'Ta récompense vient d\'être utilisée ailleurs. Recharge la page et réessaie.' }, { status: 409 })
        }
      }

      // ⚠️ DEUX MOUVEMENTS, PAS UN. La contrainte `bons_cadeaux_mouvements_une_cible`
      // interdit un mouvement qui désignerait à la fois un rendez-vous et une
      // commande, et les index uniques partiels sont posés par cible : c'est ce
      // qui garde l'idempotence des deux côtés.
      if (bonCadeau && vent.bonSurPresta > 0) {
        const deb = await debiterBon(supabase, bonCadeau.id, vent.bonSurPresta, { source: 'rdv', rdv_id: idRdv })
        if (!deb?.ok) {
          if (recompense) await rendreRecompense(supabase, recompense)
          await supabase.from('rdv_reservations').delete().eq('id', idRdv)
          await toutDefaire()
          console.error('[create-rdv-commande] débit bon (prestation) KO', deb?.error)
          return NextResponse.json({ ok: false, error: 'Ce bon cadeau vient d\'être utilisé, vérifie son solde et réessaie.' }, { status: 409 })
        }
      }
      if (bonCadeau && vent.bonSurProduits > 0) {
        const deb = await debiterBon(supabase, bonCadeau.id, vent.bonSurProduits, { source: 'commande', commande_id: commande.id })
        if (!deb?.ok) {
          // ⚠️ ON REND CE QU'ON VIENT DE PRENDRE. La part prestation a été
          // débitée trois lignes plus haut pour un rendez-vous qui n'aura pas
          // lieu : la laisser dépensée ferait perdre de l'argent au porteur du
          // bon à cause d'une course qu'il n'a pas provoquée.
          if (vent.bonSurPresta > 0) await recrediterBon(supabase, bonCadeau.id, vent.bonSurPresta, { rdv_id: idRdv })
          if (recompense) await rendreRecompense(supabase, recompense)
          await supabase.from('rdv_reservations').delete().eq('id', idRdv)
          await toutDefaire()
          console.error('[create-rdv-commande] débit bon (produits) KO', deb?.error)
          return NextResponse.json({ ok: false, error: 'Ce bon cadeau vient d\'être utilisé, vérifie son solde et réessaie.' }, { status: 409 })
        }
      }

      // La commande bascule comme au webhook : payée intégralement par les
      // avantages, donc équivalente à un paiement en ligne. Le lien s'écrit des
      // deux côtés, sans quoi une annulation ne saurait pas quoi rembourser.
      const { error: errConfirm } = await supabase
        .from('commandes')
        .update({
          statut: 'en_attente',
          paye_en_ligne: true,
          paye_en_ligne_date: new Date().toISOString(),
          rdv_reservation_id: idRdv,
        })
        .eq('id', commande.id)
      if (errConfirm) console.error('[create-rdv-commande] confirmation commande couverte KO', errConfirm)
      // La commande EST le stock consommé : la réservation temporaire n'a plus
      // lieu d'être.
      await supabase.from('commande_stock_reservation').delete().eq('commande_id', commande.id)

      // ⚠️ PAS D'EMAIL DE COMMANDE ICI, exactement comme le webhook du tunnel
      // unique (`sansEmails: true`) : les produits sont retirés le jour du
      // rendez-vous, c'est l'email du rendez-vous qui les annonce. Deux emails
      // pour un seul geste feraient croire à deux ventes.
      return NextResponse.json({
        ok: true,
        bon_total: true,
        rdv_id: idRdv,
        commande_id: commande.id,
        numero_rdv: resa.rdv.numero_rdv,
        avantages: {
          recompense: vent.remiseRecompense,
          bon: vent.bonTotal,
          solde_sur_place: vent.soldeSurPlace,
        },
      })
    }

    // ─── Checkout Session : le détail est visible, pas un montant global ────
    // Le client doit reconnaître ce qu'il paie, ligne par ligne. Un total
    // unique de 47,80 € sans explication est le meilleur moyen de faire
    // abandonner un panier, ou de déclencher une contestation bancaire.
    const lineItems = []
    if (acompteCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: acompteCents,
          product_data: {
            name: `Acompte — ${prestation.nom}`,
            description: `${commercant.nom} · ${date_rdv} à ${String(heure_debut).slice(0, 5)}`,
          },
        },
      })
    }
    // ⚠️ QUAND LE BON MORD SUR LES PRODUITS, LE DÉTAIL LAISSE LA PLACE À UNE
    // LIGNE UNIQUE, et c'est une contrainte de Stripe, pas un choix de confort :
    // une session Checkout n'accepte AUCUN montant négatif, donc il n'existe
    // pas de « ligne de déduction ». Garder le détail au prix plein ferait
    // encaisser au client l'argent que son bon vient de payer.
    // Le détail ligne à ligne, lui, reste sous ses yeux à l'écran précédent et
    // dans l'email de confirmation.
    // ⚠️ LA RÉCOMPENSE PEUT MORDRE SUR LES PRODUITS ELLE AUSSI depuis le
    // 30/08 : la condition porte donc sur les DEUX avantages. Ne tester que le
    // bon aurait laissé passer des lignes au prix plein alors que le total
    // encaissé, lui, était déjà réduit — un écart que Stripe aurait refusé.
    const deduitSurProduits = (vent.bonSurProduits + vent.recompenseSurProduits) > 0
    if (deduitSurProduits) {
      const nbArticles = lignes.reduce((s, l) => s + l.quantite, 0)
      const parts = []
      if (vent.recompenseSurProduits > 0) parts.push(`${euros(vent.recompenseSurProduits)} de récompense`)
      if (vent.bonSurProduits > 0) parts.push(`${euros(vent.bonSurProduits)} de bon cadeau`)
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: produitsAPayerCents,
          product_data: {
            name: `Tes produits (${nbArticles}) — remises déduites`,
            description: `${parts.join(' et ')} · à retirer le jour de ton rendez-vous`,
          },
        },
      })
    } else for (const l of lignes) {
      lineItems.push({
        quantity: l.quantite,
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(l.prix_unitaire * 100),
          product_data: {
            name: l.article_nom,
            description: 'À retirer le jour de ton rendez-vous',
          },
        },
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'bancontact'],
      line_items: lineItems,
      customer_email: client_email,
      success_url: `${STRIPE_CONFIG.appUrl}/commander/rdv/${commercant.slug}?paiement=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:   `${STRIPE_CONFIG.appUrl}/commander/rdv/${commercant.slug}?paiement=annule`,
      payment_intent_data: {
        application_fee_amount: calculApplicationFee(totalCents, commercant),   // 0, zéro commission Yoppaa
        metadata: buildPaymentMetadata({
          kind: PAYMENT_KIND.RDV_COMMANDE,
          commercantId: commercant.id,
          extra: {
            // La commande existe déjà : le webhook la retrouve par cet
            // identifiant, il n'a pas à reconstruire le panier.
            yoppaa_commande_id: String(commande.id),
            prestation_id: String(prestation_id),
            ...(praticien_id ? { praticien_id: String(praticien_id) } : {}),
            date_rdv,
            heure_debut: String(heure_debut).slice(0, 5),
            heure_fin: String(heure_fin).slice(0, 5),
            duree_minutes: String(duree_minutes || prestation.duree_minutes),
            prix_estime: String(prixBase ?? ''),
            acompte_montant: String(acompteMontant),
            // ⚠️ ET CE QUI ÉTAIT DÛ VOYAGE AVEC. Le webhook crée le rendez-vous
            // depuis ces métadonnées : absent ici, l'acompte dû serait perdu
            // pour toujours, et le no-show garderait le bon en entier.
            acompte_du: String(vent.acompteDu),
            // ⚠️ SANS CES DEUX LIGNES, LE WEBHOOK NE SAIT RIEN. Il lit
            // `meta.fidelite_remise` et `meta.fidelite_recompense_id` pour figer
            // la remise sur le rendez-vous et consommer la récompense. Absentes,
            // il écrivait `fidelite_remise: 0` et la récompense restait
            // disponible : le client la voyait toujours sur sa carte après
            // l'avoir « utilisée ».
            // ⚠️ SEULE LA PART PRESTATION VOYAGE VERS LE RENDEZ-VOUS, comme
            // pour le bon : la part produits vit sur la commande. Envoyer la
            // remise totale ici la compterait deux fois, une fois de chaque
            // côté du lien.
            ...(recompense ? {
              fidelite_recompense_id: String(recompense.id),
              fidelite_remise: String(vent.recompenseSurPresta),
            } : {}),
            // ⚠️ MÊME RAISON POUR LE BON : le webhook fige le montant sur le
            // rendez-vous et débite le bon depuis ces deux clés. Absentes, il
            // créerait le rendez-vous au tarif plein et laisserait le bon
            // crédité, alors que le client a payé un acompte réduit.
            // ⚠️ SEULE LA PART PRESTATION PART DANS LES MÉTADONNÉES DU
            // RENDEZ-VOUS. La part produits vit sur la commande, qui a ses
            // propres colonnes et son propre débit : deux mouvements, deux
            // cibles, comme l'impose `bons_cadeaux_mouvements_une_cible`.
            ...(bonCadeau && vent.bonSurPresta > 0 ? {
              bon_cadeau_id: String(bonCadeau.id),
              bon_cadeau_montant: String(vent.bonSurPresta),
            } : {}),
            produits_montant: String(produitsCents / 100),
            // Le rendez-vous naît de ces métadonnées au webhook : sans
            // normalisation ici, il repartirait avec l'email tel que tapé.
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
        kind: PAYMENT_KIND.RDV_COMMANDE,
        commercantId: commercant.id,
        extra: { yoppaa_commande_id: String(commande.id) },
      }),
    }, {
      stripeAccount: commercant.stripe_account_id,
    })

    await supabase
      .from('commandes')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', commande.id)

    return NextResponse.json({ ok: true, url: session.url, session_id: session.id, commande_id: commande.id })

  } catch (e) {
    console.error('[stripe/checkout/create-rdv-commande]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: e?.status || 500 })
  }
}
