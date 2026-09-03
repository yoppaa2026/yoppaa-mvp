// GET /api/dashboard/export-comptable
//   ?commercant_id=...&du=YYYY-MM-DD&au=YYYY-MM-DD&vue=journal|detail&format=csv|json
//
// Journal des transactions Yoppaa d'un commerçant, ventilé par taux de TVA.
// Réservé à la formule Vendre (la page d'abonnement le promet à ce niveau).
//
// Auth : jeton de l'utilisateur + vérification que le commerce lui appartient
// (commercants.auth_user_id). On ne se contente JAMAIS du commercant_id passé
// en query : il suffirait de changer un chiffre pour lire la comptabilité du
// voisin.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canDo } from '@/lib/plans'
import { construireLignes, csvJournal, csvDetail, journalParJour } from '@/lib/export-comptable'
import { normaliser } from '@/lib/tva'
import { jourBruxelles } from '@/lib/timezone'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const commercantId = searchParams.get('commercant_id')
    const du = (searchParams.get('du') || '').slice(0, 10)
    const au = (searchParams.get('au') || '').slice(0, 10)
    const vue = searchParams.get('vue') === 'detail' ? 'detail' : 'journal'
    const format = searchParams.get('format') === 'json' ? 'json' : 'csv'

    if (!commercantId || !/^\d{4}-\d{2}-\d{2}$/.test(du) || !/^\d{4}-\d{2}-\d{2}$/.test(au)) {
      return NextResponse.json({ ok: false, error: 'paramètres manquants ou dates invalides' }, { status: 400 })
    }
    if (du > au) {
      return NextResponse.json({ ok: false, error: 'la date de début est postérieure à la date de fin' }, { status: 400 })
    }

    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: commercant } = await admin
      .from('commercants')
      .select('id, nom, plan, auth_user_id, tva_taux_defaut, tva_assujetti, bce')
      .eq('id', commercantId)
      .maybeSingle()

    if (!commercant || commercant.auth_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }
    if (!canDo(commercant.plan, 'export_comptable')) {
      return NextResponse.json({ ok: false, error: 'export réservé à la formule Vendre' }, { status: 402 })
    }

    // ⚠️ LES BORNES SUR LES INSTANTS SONT ÉLARGIES D'UN JOUR DE CHAQUE CÔTÉ, ET
    // C'EST VOLONTAIRE. Le jour comptable se décide en heure belge : minuit à
    // Bruxelles, c'est 22h ou 23h la VEILLE en temps universel. Une borne
    // stricte en UTC raterait tout mouvement des deux premières heures de la
    // nuit. `dansPeriode` tranche ensuite sur le vrai jour, comme le filtre des
    // abonnements le fait depuis le 19/08.
    //
    // ⚠️ ET LE JOUR SE RECOMPOSE À LA MAIN, PAS AVEC `toISOString()`. Ce
    // raccourci est ce qui a produit le défaut du 19/08, où une vente de 00h28
    // tombait la veille : il rend le jour de GREENWICH. Ici on part d'une date
    // NUE posée à midi universel, donc aucun fuseau ne peut la faire basculer,
    // mais l'écrire quand même normaliserait le geste juste à côté du code qui
    // en est mort.
    const decalerJour = (jour, delta) => {
      const d = new Date(`${jour}T12:00:00.000Z`)
      d.setUTCDate(d.getUTCDate() + delta)
      const mois = String(d.getUTCMonth() + 1).padStart(2, '0')
      const quantieme = String(d.getUTCDate()).padStart(2, '0')
      return `${d.getUTCFullYear()}-${mois}-${quantieme}`
    }
    const rembDu = `${decalerJour(du, -1)}T00:00:00.000Z`
    const rembAu = `${decalerJour(au, 1)}T23:59:59.999Z`

    // ⚠️ LES COLONNES VIVENT DANS UNE CONSTANTE, ET C'EST LA LEÇON DU PROJET :
    // ces `select` servent maintenant DEUX requêtes chacun (les ventes de la
    // période, puis celles remboursées pendant la période). Deux listes écrites
    // à la main auraient divergé à la première colonne ajoutée, et une colonne
    // absente d'un `select` est LE défaut le plus fréquent d'ici, toujours
    // SILENCIEUX.
    //
    // ⚠️ `encaisse_mode` EST INDISPENSABLE : le journal perdrait le moyen de
    // chaque commande payée sur place, et la réconciliation redeviendrait
    // impossible sans la moindre erreur.
    // ⚠️ `stripe_refund_amount` ET `stripe_refund_date` LE SONT DEPUIS LE
    // 02/09 : sans eux, une vente remboursée reste comptée en entier.
    const COLS_COMMANDE = 'id, numero_commande, numero_prefixe, numero_semaine, statut, total, frais_livraison, tva_taux_livraison, mode_retrait, creneau_id, regime_tva, paye_en_ligne, bon_cadeau_montant, fidelite_remise, stripe_frais, stripe_net, stripe_refund_amount, stripe_refund_date, date_commande, created_at, encaisse_mode, encaisse_montant, encaisse_le, client_nom, commande_articles(article_id, quantite, prix_unitaire, tva_taux)'

    // ⚠️ `encaisse_*` EST INDISPENSABLE : le journal perdrait tout ce qui a été
    // encaissé au comptoir sans la moindre erreur, et le commerçant relirait
    // « 0,00 € au comptoir » sur un document destiné à son comptable.
    // ⚠️ `bon_cadeau_montant` EST OBLIGATOIRE DEPUIS LE 29/08 : sans lui, la
    // ligne « Bon cadeau RDV » ne s'écrit jamais et une prestation payée par un
    // bon disparaît du journal.
    const COLS_RDV = 'id, numero_rdv, numero_prefixe, numero_semaine, statut, acompte_montant, acompte_paye, acompte_paye_en_ligne, bon_cadeau_montant, fidelite_remise, tva_taux, stripe_frais, stripe_net, stripe_refund_amount, stripe_refund_date, date_rdv, encaisse_mode, encaisse_montant, encaisse_le, acompte_paye_date, created_at, client_prenom, client_nom'

    // ─── ON CHARGE PAR TOUTES LES DATES OÙ DE L'ARGENT A PU BOUGER ─────────
    //
    // 🔴 CHAQUE LIGNE EST DATÉE DU JOUR OÙ L'ARGENT A ÉTÉ CONSTATÉ (03/09), et
    // plus du créneau de retrait ni du jour du rendez-vous. Charger sur une
    // seule colonne laisserait donc des mouvements dehors : un rendez-vous du
    // 15 septembre réservé le 30 août appartient à l'export d'AOÛT.
    //
    // ⚠️ ON CHARGE LARGE, ET C'EST `construireLignes` QUI TRANCHE, ligne par
    // ligne, sur la date d'écriture. Une vente qui n'appartient pas à la période
    // s'exclut ainsi toute seule, et il n'y a plus deux façons de répondre à la
    // même question.
    //
    // ⚠️ LES BORNES SONT ÉLARGIES D'UN JOUR sur les colonnes d'INSTANT, jamais
    // sur les colonnes de DATE nue : minuit à Bruxelles, c'est 22h ou 23h la
    // veille en temps universel.
    const plage = (col, debut, fin) => `and(${col}.gte.${debut},${col}.lte.${fin})`
    const instant = (col) => plage(col, rembDu, rembAu)
    const jour = (col) => plage(col, du, au)

    const { data: commandesPeriode } = await admin
      .from('commandes')
      .select(COLS_COMMANDE)
      .eq('commercant_id', commercantId)
      .or([
        instant('created_at'),      // payée en ligne : constatée à sa création
        instant('encaisse_le'),     // réglée au comptoir : au geste du commerçant
        jour('date_commande'),      // ni l'un ni l'autre : reste à encaisser
        instant('stripe_refund_date'),
      ].join(','))

    const { data: rdvsPeriode } = await admin
      .from('rdv_reservations')
      .select(COLS_RDV)
      .eq('commercant_id', commercantId)
      .or([
        instant('acompte_paye_date'),  // l'acompte et le bon, pris à la réservation
        instant('created_at'),         // réservation sans paiement en ligne
        instant('encaisse_le'),        // le solde, au comptoir
        jour('date_rdv'),              // filet : un rendez-vous sans aucune de ces dates
        instant('stripe_refund_date'),
      ].join(','))
      .is('deleted_at', null)

    // ─── ET LES BONS CADEAUX RENDUS, QUI NE SONT DANS AUCUNE COLONNE ───────
    //
    // 🔴 `rendreAvantagesRdv` RECRÉDITE LE BON SANS TOUCHER
    // `bon_cadeau_montant` : cette colonne dit ce que le bon a payé, jamais ce
    // qu'il a fini par payer. Le mouvement de re-crédit est la SEULE source de
    // vérité, et il porte sa date, ce qui règle aussi le no-show, où seule une
    // PART du bon revient.
    //
    // ⚠️ LA BORNE DE SÉCURITÉ EST LA JOINTURE, PAS UN FILTRE APRÈS COUP : la
    // table des mouvements ne porte pas de `commercant_id`, et un bon appartient
    // à un commerce. `!inner` sur `bons_cadeaux` limite la lecture aux bons de
    // CE commerce, en base, avant que la moindre ligne ne remonte.
    const { data: mouvementsBons } = await admin
      .from('bons_cadeaux_mouvements')
      .select('bon_id, montant, source, commande_id, rdv_id, created_at, bons_cadeaux!inner(commercant_id)')
      .eq('bons_cadeaux.commercant_id', commercantId)
      .eq('source', 'annulation')
      .gte('created_at', rembDu)
      .lte('created_at', rembAu)

    // Les ventes visées par un bon rendu, quand aucune de leurs dates ne tombe
    // dans la période : un rendez-vous réservé en juillet et annulé en septembre
    // n'est chargé par aucune plage ci-dessus, et son retour de bon serait perdu.
    const dejaLa = new Set([
      ...(commandesPeriode || []).map(c => c.id),
      ...(rdvsPeriode || []).map(r => r.id),
    ])
    const cmdManquantes = [...new Set((mouvementsBons || [])
      .map(m => m.commande_id).filter(id => id && !dejaLa.has(id)))]
    const rdvManquants = [...new Set((mouvementsBons || [])
      .map(m => m.rdv_id).filter(id => id && !dejaLa.has(id)))]

    const { data: commandesBon } = cmdManquantes.length > 0
      ? await admin.from('commandes').select(COLS_COMMANDE)
          .eq('commercant_id', commercantId).in('id', cmdManquantes)
      : { data: [] }
    const { data: rdvsBon } = rdvManquants.length > 0
      ? await admin.from('rdv_reservations').select(COLS_RDV)
          .eq('commercant_id', commercantId).in('id', rdvManquants).is('deleted_at', null)
      : { data: [] }

    // ⚠️ ON FUSIONNE SANS DOUBLER : les plages ci-dessus se recouvrent souvent,
    // et une même vente remontée deux fois s'écrirait deux fois.
    const fusionner = (...listes) => {
      const parId = new Map()
      for (const liste of listes) for (const o of (liste || [])) if (o?.id) parId.set(o.id, o)
      return [...parId.values()]
    }
    const commandes = fusionner(commandesPeriode, commandesBon)
    const rdvs = fusionner(rdvsPeriode, rdvsBon)

    // ⚠️ LES ABONNEMENTS, QUI NE FIGURAIENT DANS AUCUN DOCUMENT (Alex, 17/08).
    // Leur vente n'écrit que dans `abonnements`, jamais une commande.
    //
    // ⚠️ LE FILTRE DE DATES SE FAIT ICI, EN JAVASCRIPT, ET C'EST VOULU :
    // `paye_le` reçoit une date nue par la vente en ligne et un horodatage
    // complet par l'inscription à la main. Comparer ces deux formes en SQL
    // dépend du type exact de la colonne, et une borne qui échoue rendrait un
    // journal incomplet SANS erreur. On tronque à la journée, ce qui est vrai
    // dans les deux cas. Un commerce a des abonnements par dizaines, jamais par
    // milliers : le coût est nul.
    //
    // ⚠️ LE NOM DU CLIENT EST LU DEPUIS LE 19/08, et cette phrase disait le
    // contraire jusque-là. Alex : « il faut faire l'export le plus complet
    // possible ». Sans nom, un encaissement de 400 € au comptoir ne se
    // rapproche de rien. On lit le NOM SEUL : ni email, ni téléphone, ni
    // adresse, qui ne servent à rien en comptabilité et n'ont donc rien à faire
    // dans un fichier qui sort de l'application.
    const { data: abonnementsTous } = await admin
      .from('abonnements')
      .select('id, statut, prix, paye, paye_le, mode_paiement, tva_taux, stripe_frais, stripe_net, client_prenom, client_nom, numero_abonnement, numero_prefixe')
      .eq('commercant_id', commercantId)
    const abonnements = (abonnementsTous || []).filter(a => {
      // ⚠️ EN HEURE BELGE. Ce filtre decoupait l instant en temps universel :
      // un abonnement encaisse a 00h28 le 19 etait classe au 18, donc un export
      // du 19 au 19 ne le contenait PAS DU TOUT. Une ligne absente, et non
      // decalee. Ecriture differente du meme defaut, que la garde du banc ne
      // voyait pas : elle ne cherchait que `toISOString()`.
      const jour = jourBruxelles(a?.paye_le)
      return jour >= du && jour <= au
    })

    // Taux actuels du catalogue : filet pour les commandes antérieures à la
    // migration, dont les lignes n'ont pas de taux figé.
    const { data: articles } = await admin
      .from('articles')
      .select('id, tva_taux, tva_taux_sur_place')
      .eq('commercant_id', commercantId)
    const articlesParId = Object.fromEntries((articles || []).map(a => [a.id, a]))

    const assujetti = commercant.tva_assujetti !== false
    // Pas de repli codé en dur : si le commerce n'a pas de taux par défaut, les
    // montants concernés apparaissent en « taux non renseigné » plutôt que
    // d'être ventilés sur une valeur inventée qui passerait inaperçue.
    const tauxDefaut = normaliser(commercant.tva_taux_defaut)

    const lignes = construireLignes({
      commandes,
      rdvs,
      abonnements,
      tauxDefaut,
      articlesParId,
      retoursBons: mouvementsBons || [],
      periode: { du, au },
    })

    // Signale honnêtement que certaines lignes reposent sur le taux actuel.
    const avertissementTaux = commandes.some(c =>
      (c.commande_articles || []).some(la => la.tva_taux == null))

    if (format === 'json') {
      return NextResponse.json({
        ok: true,
        commercant: { nom: commercant.nom },
        periode: { du, au },
        assujetti,
        avertissement_taux: avertissementTaux,
        journal: journalParJour(lignes),
        lignes: vue === 'detail' ? lignes : undefined,
      })
    }

    const contenu = vue === 'detail'
      ? csvDetail({ lignes, commercant, du, au, assujetti, avertissementTaux })
      : csvJournal({ lignes, commercant, du, au, assujetti, avertissementTaux })

    const slug = String(commercant.nom || 'yoppaa').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const nomFichier = `yoppaa-${vue}-${slug}-${du}-au-${au}.csv`

    return new NextResponse(contenu, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomFichier}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[export-comptable]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
