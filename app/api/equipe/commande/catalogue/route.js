// POST /api/equipe/commande/catalogue
// Body : { commercant_id, date }
//
// CE QU'IL FAUT À LA FENÊTRE « ENCODER UNE COMMANDE » (10/10) : le catalogue
// vendable, les créneaux de retrait et de tournée, et les commandes du jour
// choisi (pour montrer le remplissage réel de chaque créneau).
//
// ⚠️ UN SEUL CHEMIN POUR LE PATRON ET POUR L'ÉQUIPE. Le membre au téléphone ne
// lit pas la base directement (son poste passe par le serveur) : la fenêtre
// passe donc par ici dans les deux cas, avec la même garde que l'écriture
// (`gardeEquipe`, case « Commandes »). Deux chemins de lecture auraient pu
// montrer deux remplissages différents.
//
// ⚠️ RIEN DE PERSONNEL : des commandes du jour, seuls le statut, le créneau, la
// date et les quantités sortent (c'est ce que compte le remplissage).

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe } from '@/lib/equipe-server'
import { SELECT_ARTICLES, SELECT_DEALS } from '@/lib/lignes-commande'
import { trierArticles } from '@/lib/ordre-articles'
import { modeStockDe, dejaCommandePourStock } from '@/lib/stock-article'
import { calendrierDuCommerce } from '@/lib/calendrier-commande-server'

export const dynamic = 'force-dynamic'

// Ce que lisent `remplissageCreneaux` et `calculerCapaciteCreneau`, et rien d'autre.
const COLONNES_CRENEAU = 'id, heure_debut, heure_fin, jour_semaine, actif, commercant_id, max_commandes, capacite_temps, mode_capacite, cutoff_minutes'

export async function POST(request) {
  try {
    const { commercant_id, date } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardeEquipe(request, admin, commercant_id, 'commandes')
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return NextResponse.json({ ok: false, error: 'Date invalide.' }, { status: 400 })

    const [commerce, articles, deals, retrait, livraison, jour, configLivraison] = await Promise.all([
      // ⚠️ `commande_veille_avant` (20/10) : l'heure limite de la veille (tuiles et calendrier).
      admin.from('commercants').select('id, nom, categorie, mode_capacite, tva_taux_defaut, ordre_categories, horizon_commande, horaires_detail, commande_veille_avant').eq('id', commercant_id).maybeSingle(),
      // ⚠️ Les colonnes du stock : celles que `etatStock` lit (comptoir, maximum
      // sur commande, stock qui baisse), comme `verifierStockDisponible`.
      admin.from('articles').select(`${SELECT_ARTICLES}, gere_variantes, ordre, stock_jour, stock_comptoir, stock_comptoir_le, commande_max_jour, stock_maj_le`).eq('commercant_id', commercant_id).eq('actif', true).order('categorie').order('nom'),
      admin.from('yoppaa_deals').select(SELECT_DEALS).eq('commercant_id', commercant_id).eq('actif', true),
      admin.from('creneaux').select(COLONNES_CRENEAU).eq('commercant_id', commercant_id).eq('actif', true).order('heure_debut'),
      admin.from('livraison_creneaux').select(COLONNES_CRENEAU).eq('commercant_id', commercant_id).eq('actif', true).order('heure_debut'),
      admin.from('commandes')
        .select('statut, date_commande, creneau_id, creneau_livraison_id, commande_articles(quantite, article:articles!commande_articles_article_id_fkey(temps_prepa))')
        .eq('commercant_id', commercant_id).eq('date_commande', date),
      // Les frais de livraison, dits au téléphone (Alex, 11/10) : les colonnes
      // que la route d'encodage lit pour les calculer.
      admin.from('livraison_config').select('frais_fixe, gratuit_des, minimum_commande').eq('commercant_id', commercant_id).maybeSingle(),
    ])
    for (const r of [commerce, articles, deals, retrait, livraison, jour, configLivraison]) {
      if (r.error) {
        console.error('[equipe/commande/catalogue] lecture KO', r.error.message)
        return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })
      }
    }
    // Le calendrier de la fiche (longueur, fermetures) : les pastilles de jours.
    const calendrier = commerce.data ? await calendrierDuCommerce({ supabase: admin, commercant: commerce.data }) : { ok: false }
    if (!calendrier.ok) return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })

    // Ni prix indicatif, ni versions (taille, couleur) : la boutique de détail.
    // L'ordre choisi par le commerçant (10/10), la règle de la fiche.
    const vendables = trierArticles((articles.data || []).filter(a => !a.est_vitrine && !a.gere_variantes))
    const ids = vendables.map(a => a.id)
    let groupes = []
    // ── Ce que la fiche lit pour dire « pas ce jour-là », « épuisé », « reste 3 »
    // 🔴 LA GRILLE NE SAVAIT RIEN DES JOURS DE VENTE NI DU STOCK (Alex, 10/10) :
    // mêmes sources que la fiche (`article_stock_jour`, `stock_commande_par_article`,
    // `ventes_stock_magasin`), même calcul (`etatTuile` → `etatStock`).
    const stocksJour = {}
    let dejaCommande = null
    if (ids.length > 0) {
      const aMagasin = vendables.some(a => modeStockDe(a) === 'magasin')
      const [opts, grille, vendu, magasin] = await Promise.all([
        admin.from('article_options_groupes')
          // (13/10) Le nombre de choix et le prix selon la taille, lien NOMMÉ
          // (la table des prix pointe deux fois vers les valeurs). (21/10) Le
          // lien groupe → valeurs aussi : un groupe peut dépendre d'une option.
          .select('id, article_id, nom, type, obligatoire, choix_min, choix_max, depend_de_valeur_id, created_at, valeurs:article_options_valeurs!article_options_valeurs_groupe_id_fkey(id, nom, prix_supplement, groupe_id, prix_taille:article_options_prix_taille!article_options_prix_taille_valeur_id_fkey(taille_valeur_id, prix))')
          .in('article_id', ids).order('created_at'),
        admin.from('article_stock_jour').select('article_id, jour_semaine, stock, actif').in('article_id', ids),
        admin.rpc('stock_commande_par_article', { p_commercant_id: commercant_id, p_date: date }),
        aMagasin ? admin.rpc('ventes_stock_magasin', { p_commercant_id: commercant_id }) : Promise.resolve({ data: [], error: null }),
      ])
      if (opts.error || grille.error) return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })
      groupes = opts.data || []
      for (const s of grille.data || []) (stocksJour[s.article_id] ||= {})[s.jour_semaine] = { stock: s.stock, actif: s.actif }
      // ⚠️ UN VENDU ILLISIBLE N'EST PAS « RIEN VENDU » : `null`, et la grille
      // ne dit rien du stock (le serveur vérifie de toute façon à l'encodage).
      if (vendu.error || magasin.error) {
        console.error('[equipe/commande/catalogue] vendu illisible', vendu.error?.message || magasin.error?.message)
      } else {
        const duJour = Object.fromEntries((vendu.data || []).map(r => [r.article_id, Number(r.quantite) || 0]))
        const ventesMagasin = Object.fromEntries((magasin.data || []).map(r => [r.article_id, Number(r.quantite) || 0]))
        dejaCommande = Object.fromEntries(vendables.map(a => [a.id, dejaCommandePourStock({ article: a, duJour, ventesMagasin })]))
      }
    }
    return NextResponse.json({
      ok: true,
      commercant: commerce.data,
      articles: vendables,
      groupes,
      stocksJour,
      dejaCommande,
      calendrier: { longueur: calendrier.longueur, fermetures: calendrier.fermetures },
      deals: deals.data || [],
      creneauxRetrait: retrait.data || [],
      creneauxLivraison: livraison.data || [],
      configLivraison: configLivraison.data || null,
      commandesDuJour: jour.data || [],
    })
  } catch (e) {
    console.error('[equipe/commande/catalogue] erreur', e?.message || e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur, réessaie.' }, { status: 500 })
  }
}
