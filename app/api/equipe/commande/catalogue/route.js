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

export const dynamic = 'force-dynamic'

// Ce que lisent `remplissageCreneaux` et `calculerCapaciteCreneau`, et rien d'autre.
const COLONNES_CRENEAU = 'id, heure_debut, heure_fin, jour_semaine, actif, commercant_id, max_commandes, capacite_temps, mode_capacite, cutoff_heures'

export async function POST(request) {
  try {
    const { commercant_id, date } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardeEquipe(request, admin, commercant_id, 'commandes')
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return NextResponse.json({ ok: false, error: 'Date invalide.' }, { status: 400 })

    const [commerce, articles, deals, retrait, livraison, jour] = await Promise.all([
      admin.from('commercants').select('id, nom, categorie, mode_capacite, tva_taux_defaut').eq('id', commercant_id).maybeSingle(),
      admin.from('articles').select(`${SELECT_ARTICLES}, gere_variantes`).eq('commercant_id', commercant_id).eq('actif', true).order('categorie').order('nom'),
      admin.from('yoppaa_deals').select(SELECT_DEALS).eq('commercant_id', commercant_id).eq('actif', true),
      admin.from('creneaux').select(COLONNES_CRENEAU).eq('commercant_id', commercant_id).eq('actif', true).order('heure_debut'),
      admin.from('livraison_creneaux').select(COLONNES_CRENEAU).eq('commercant_id', commercant_id).eq('actif', true).order('heure_debut'),
      admin.from('commandes')
        .select('statut, date_commande, creneau_id, creneau_livraison_id, commande_articles(quantite, article:articles(temps_prepa))')
        .eq('commercant_id', commercant_id).eq('date_commande', date),
    ])
    for (const r of [commerce, articles, deals, retrait, livraison, jour]) {
      if (r.error) {
        console.error('[equipe/commande/catalogue] lecture KO', r.error.message)
        return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })
      }
    }
    // Ni prix indicatif, ni versions (taille, couleur) : la boutique de détail.
    const vendables = (articles.data || []).filter(a => !a.est_vitrine && !a.gere_variantes)
    const ids = vendables.map(a => a.id)
    let groupes = []
    if (ids.length > 0) {
      const { data, error } = await admin.from('article_options_groupes')
        .select('id, article_id, nom, type, obligatoire, created_at, valeurs:article_options_valeurs(id, nom, prix_supplement, groupe_id)')
        .in('article_id', ids).order('created_at')
      if (error) return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })
      groupes = data || []
    }
    return NextResponse.json({
      ok: true,
      commercant: commerce.data,
      articles: vendables,
      groupes,
      deals: deals.data || [],
      creneauxRetrait: retrait.data || [],
      creneauxLivraison: livraison.data || [],
      commandesDuJour: jour.data || [],
    })
  } catch (e) {
    console.error('[equipe/commande/catalogue] erreur', e?.message || e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur, réessaie.' }, { status: 500 })
  }
}
