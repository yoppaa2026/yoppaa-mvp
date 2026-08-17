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

    // Bornes inclusives : `au` doit couvrir toute la journée.
    const auFin = `${au}T23:59:59.999Z`

    const { data: commandes } = await admin
      .from('commandes')
      .select('id, numero_commande, statut, total, frais_livraison, tva_taux_livraison, mode_retrait, regime_tva, paye_en_ligne, bon_cadeau_montant, stripe_frais, stripe_net, date_commande, created_at, commande_articles(article_id, quantite, prix_unitaire, tva_taux)')
      .eq('commercant_id', commercantId)
      .gte('created_at', `${du}T00:00:00.000Z`)
      .lte('created_at', auFin)

    const { data: rdvs } = await admin
      .from('rdv_reservations')
      // ⚠️ `encaisse_*` EST INDISPENSABLE, et son absence serait SILENCIEUSE :
      // le journal perdrait tout ce qui a été encaissé au comptoir sans la
      // moindre erreur, et le commerçant relirait « 0,00 € au comptoir » sur un
      // document destiné à son comptable. C'est LE défaut le plus fréquent de
      // ce projet : une colonne oubliée dans un select.
      .select('id, numero_rdv, statut, acompte_montant, acompte_paye, acompte_paye_en_ligne, tva_taux, stripe_frais, stripe_net, date_rdv, encaisse_mode, encaisse_montant, encaisse_le')
      .eq('commercant_id', commercantId)
      .gte('date_rdv', du)
      .lte('date_rdv', au)
      .is('deleted_at', null)

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
    // Aucune coordonnée client n'est lue : ce sont des colonnes comptables.
    const { data: abonnementsTous } = await admin
      .from('abonnements')
      .select('id, statut, prix, paye, paye_le, mode_paiement, tva_taux, stripe_frais, stripe_net')
      .eq('commercant_id', commercantId)
    const abonnements = (abonnementsTous || []).filter(a => {
      const jour = String(a?.paye_le || '').slice(0, 10)
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
      commandes: commandes || [],
      rdvs: rdvs || [],
      abonnements,
      tauxDefaut,
      articlesParId,
    })

    // Signale honnêtement que certaines lignes reposent sur le taux actuel.
    const avertissementTaux = (commandes || []).some(c =>
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
