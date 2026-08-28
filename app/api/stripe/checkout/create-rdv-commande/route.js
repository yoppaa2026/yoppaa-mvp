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
import { chargerRecompensePourYopper } from '@/lib/fidelite-recompense-server'
import { chargerBonValide } from '@/lib/bons-cadeaux-server'
import { normaliserCodeBon, calculerRemiseBon } from '@/lib/bons-cadeaux'

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
        return NextResponse.json({
          ok: false,
          error: 'Récompense inutilisable.',
          recompense_refusee: resRec.raison,
        }, { status: 400 })
      }
      recompense = resRec.recompense
      remiseRecompenseEUR = appliquerRecompenseAvantBon(recompense, prixBase).remiseRecompense
    }

    // ⚠️ 🔴 LE BON CADEAU AUSSI, ET C'EST EXACTEMENT LE DÉFAUT DU 27/08.
    // Ce jour-là, DEUX tunnels de paiement pour un rendez-vous, un seul
    // connaissait la fidélité : l'écran annonçait 30,90 €, le serveur
    // encaissait 33,90 €. Le bon cadeau vient d'entrer dans le tunnel
    // d'acompte seul ; l'oublier ici recréerait la même promesse sans
    // débiteur, dès qu'un produit accompagne le rendez-vous.
    //
    // Le bon s'applique sur la part PRESTATION uniquement : les produits sont
    // payés en entier, comme partout dans ce tunnel.
    let bonCadeau = null
    let remiseBonEUR = 0
    const baseApresRecompense = prixBase != null
      ? Math.round((prixBase - remiseRecompenseEUR) * 100) / 100
      : null
    if (bon_cadeau_code && baseApresRecompense != null) {
      const codeBon = normaliserCodeBon(bon_cadeau_code)
      if (!codeBon) {
        return NextResponse.json({ ok: false, error: 'Code de bon cadeau invalide.' }, { status: 400 })
      }
      const resBon = await chargerBonValide(supabase, { code: codeBon, commercant_id: commercant.id })
      if (!resBon.ok) {
        return NextResponse.json({ ok: false, error: resBon.error, bon_refuse: true }, { status: 400 })
      }
      bonCadeau = resBon.bon
      remiseBonEUR = calculerRemiseBon(bonCadeau.solde, baseApresRecompense)
    }

    const prixNet = baseApresRecompense != null
      ? Math.round((baseApresRecompense - remiseBonEUR) * 100) / 100
      : null

    const acompteMontant = (commercant.rdv_acompte_en_ligne_actif && prixNet && acomptePct > 0)
      ? Math.round(prixNet * acomptePct) / 100
      : 0
    const acompteCents = Math.round(acompteMontant * 100)

    // ⚠️ ICI, PAS DE REFUS SI L'ACOMPTE TOMBE SOUS LE MINIMUM STRIPE, contrairement
    // au tunnel d'acompte seul : le panier porte AUSSI des produits, donc le
    // paiement total dépasse largement les 0,50 €. Un acompte réduit à zéro par
    // la récompense laisse simplement les produits à encaisser, et le
    // rendez-vous reste confirmé (règle déjà en place au-dessus).

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

    const totalCents = acompteCents + produitsCents
    if (totalCents < 50) {
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
    for (const l of lignes) {
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
            // ⚠️ SANS CES DEUX LIGNES, LE WEBHOOK NE SAIT RIEN. Il lit
            // `meta.fidelite_remise` et `meta.fidelite_recompense_id` pour figer
            // la remise sur le rendez-vous et consommer la récompense. Absentes,
            // il écrivait `fidelite_remise: 0` et la récompense restait
            // disponible : le client la voyait toujours sur sa carte après
            // l'avoir « utilisée ».
            ...(recompense ? {
              fidelite_recompense_id: String(recompense.id),
              fidelite_remise: String(remiseRecompenseEUR),
            } : {}),
            // ⚠️ MÊME RAISON POUR LE BON : le webhook fige le montant sur le
            // rendez-vous et débite le bon depuis ces deux clés. Absentes, il
            // créerait le rendez-vous au tarif plein et laisserait le bon
            // crédité, alors que le client a payé un acompte réduit.
            ...(bonCadeau ? {
              bon_cadeau_id: String(bonCadeau.id),
              bon_cadeau_montant: String(remiseBonEUR),
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
