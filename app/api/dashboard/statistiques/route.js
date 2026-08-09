// GET /api/dashboard/statistiques?commercant_id=…&jours=30
//
// Les chiffres du commerçant, calculés côté serveur.
//
// POURQUOI UNE ROUTE ET PAS DES REQUÊTES DEPUIS LE NAVIGATEUR. Les commandes
// portent l'email, le nom et le téléphone du client : la table n'est pas
// lisible depuis le navigateur, et c'est très bien ainsi. On lit en
// service_role, on agrège, et on ne renvoie que des NOMBRES. Aucun nom de
// client ne sort d'ici, pas même dans le détail des articles vendus.
//
// La période précédente est chargée en même temps : sans elle, impossible de
// dire si ça monte ou si ça descend, et c'est la seule chose qu'un commerçant
// regarde vraiment.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  fenetres, chiffreAffaires, panierMoyen, evolution, topArticles,
  nonRecuperees, tauxAnnulation, noteMoyenne, performanceDeals,
  commandeEncaissee, messageVide,
} from '@/lib/statistiques'
import { canDo } from '@/lib/plans'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Même schéma de propriété que l'export comptable et les signaux : la colonne
// s'appelle `auth_user_id`, jamais `user_id`.
async function commercantDuProprietaire(supabase, request, commercantId) {
  const jeton = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!jeton || !commercantId) return null
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${jeton}` } } }
  )
  const { data: { user } = {} } = await authClient.auth.getUser()
  if (!user) return null
  const { data: c } = await supabase
    .from('commercants')
    .select('id, auth_user_id, plan, categorie')
    .eq('id', commercantId)
    .maybeSingle()
  if (!c || c.auth_user_id !== user.id) return null
  return c
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const commercantId = url.searchParams.get('commercant_id')
    const jours = Math.min(365, Math.max(7, parseInt(url.searchParams.get('jours') || '30', 10) || 30))

    const supabase = admin()
    const commercant = await commercantDuProprietaire(supabase, request, commercantId)
    if (!commercant) {
      return NextResponse.json({ ok: false, error: 'acces_refuse' }, { status: 403 })
    }

    const f = fenetres(jours)
    const depuis = f.debutPrecedent.toISOString()

    // Une seule passe sur chaque table, on découpe ensuite en mémoire : deux
    // requêtes par table doubleraient le temps de réponse pour rien.
    // ⚠️ Le dernier appel est un COUNT : son résultat vit dans `count`, pas
    // dans `data`, qui vaut null avec head:true. Se tromper ici ferait croire
    // qu'un commerçant n'a aucun article, et lui servirait le mauvais message
    // d'accueil.
    const [{ data: commandes }, { data: rdvs }, { data: avis }, { data: deals }, { count: nbArticles }] =
      await Promise.all([
        supabase.from('commandes')
          .select('id, total, statut, created_at')
          .eq('commercant_id', commercantId)
          .gte('created_at', depuis),
        supabase.from('rdv_reservations')
          .select('id, statut, acompte_montant, created_at')
          .eq('commercant_id', commercantId)
          .gte('created_at', depuis),
        supabase.from('avis')
          .select('note, created_at')
          .eq('commercant_id', commercantId),
        supabase.from('yoppaa_deals')
          .select('vues, clics, cta_clics, created_at')
          .eq('commercant_id', commercantId)
          .gte('created_at', depuis),
        supabase.from('articles')
          .select('id', { count: 'exact', head: true })
          .eq('commercant_id', commercantId),
      ])

    const dansPeriode = (l) => new Date(l.created_at) >= f.debut
    const dansPrecedente = (l) => new Date(l.created_at) < f.debut

    const cmdActuelles = (commandes || []).filter(dansPeriode)
    const cmdPrecedentes = (commandes || []).filter(dansPrecedente)
    const rdvActuels = (rdvs || []).filter(dansPeriode)
    const rdvPrecedents = (rdvs || []).filter(dansPrecedente)

    // Le détail des articles vendus : chargé seulement pour les commandes
    // encaissées de la période, et sans jamais toucher aux coordonnées client.
    const idsEncaissees = cmdActuelles.filter(commandeEncaissee).map(c => c.id)
    let lignes = []
    if (idsEncaissees.length > 0) {
      const { data } = await supabase
        .from('commande_articles')
        .select('nom, quantite, prix_unitaire')
        .in('commande_id', idsEncaissees)
      lignes = data || []
    }

    const caActuel = chiffreAffaires(cmdActuelles, rdvActuels)
    const caPrecedent = chiffreAffaires(cmdPrecedentes, rdvPrecedents)
    const ventesActuelles = cmdActuelles.filter(commandeEncaissee).length
    const ventesPrecedentes = cmdPrecedentes.filter(commandeEncaissee).length

    // Les favoris se comptent sans jamais lire QUI a mis le cœur.
    const { count: favoris } = await supabase
      .from('favoris')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId)

    const rien = caActuel === 0 && ventesActuelles === 0 && rdvActuels.length === 0

    return NextResponse.json({
      ok: true,
      periode: { jours, debut: f.debut.toISOString(), fin: f.fin.toISOString() },
      argent: {
        chiffre_affaires: caActuel,
        evolution_ca: evolution(caActuel, caPrecedent),
        panier_moyen: panierMoyen(cmdActuelles),
        ventes: ventesActuelles,
        evolution_ventes: evolution(ventesActuelles, ventesPrecedentes),
        rendez_vous: rdvActuels.filter(r => r.statut === 'confirme').length,
      },
      attention: {
        non_recuperees: nonRecuperees(cmdActuelles),
        annulations: tauxAnnulation(cmdActuelles, rdvActuels),
      },
      catalogue: {
        top: topArticles(lignes, 5),
      },
      audience: {
        favoris: favoris || 0,
        note: noteMoyenne(avis || []),
        deals: performanceDeals(deals || []),
      },
      vide: rien
        ? messageVide({
            aDesArticles: (nbArticles || 0) > 0,
            aDesDeals: (deals || []).length > 0,
            peutVendre: canDo(commercant.plan, 'deals'),
          })
        : null,
    })
  } catch (e) {
    console.error('[dashboard/statistiques]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
