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
  commandeEncaissee, messageVide, topPrestations, serieJournaliere, seancesNonDeclarees,
  momentsDePointe, rdvHonore,
} from '@/lib/statistiques'
import { canDo } from '@/lib/plans'
import { jourBruxelles } from '@/lib/timezone'

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
    const [{ data: commandes }, { data: rdvs }, { data: avis }, { data: deals }, { count: nbArticles }, { data: abonnements }] =
      await Promise.all([
        supabase.from('commandes')
          // ⚠️ `fidelite_remise` EST INDISPENSABLE : `valeurCommande` la retranche
          // du chiffre d'affaires. Absente du select, elle vaut `undefined`,
          // donc zéro, et la correction du 27/08 serait restée sans effet SANS
          // la moindre erreur. C'est le défaut le plus fréquent du projet.
          .select('id, total, fidelite_remise, statut, created_at')
          .eq('commercant_id', commercantId)
          .gte('created_at', depuis),
        // ⚠️ `prix_estime` est INDISPENSABLE : depuis le 09/08 un rendez-vous
        // compte au tableau de bord pour son prix complet, pas pour son
        // acompte. L'oublier ramènerait le chiffre à ce qui est encaissé en
        // ligne, ce qui était justement le reproche d'Alex.
        // ⚠️ `encaisse_mode`, `acompte_paye` ET `abonnement_id` SONT LÀ POUR
        // `seancesNonDeclarees`, et leur absence ne produisait AUCUNE erreur.
        // La garde « cette séance est déjà déclarée » lisait `undefined`, qui
        // ne figure dans aucun moyen d'encaissement : les séances déjà
        // encaissées au comptoir étaient recomptées comme non déclarées, et la
        // ligne sous le chiffre d'affaires annonçait 300 € sur 20 séances là où
        // la réalité était 270 € sur 18 (Alex, 19/08). Septième fois que ce
        // défaut se présente sur ce projet.
        supabase.from('rdv_reservations')
          // Même raison : `valeurRdv` retranche la récompense du prix.
          .select('id, statut, acompte_montant, acompte_paye, prix_estime, fidelite_remise, prestation_id, encaisse_mode, abonnement_id, created_at')
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
        // ⚠️ LES ABONNEMENTS NE COMPTAIENT NULLE PART (Alex, 17/08). Leur vente
        // n'écrit que dans `abonnements`, jamais une commande : une professeure
        // de yoga qui vend surtout des abonnements voyait un tableau de bord à
        // zéro. Aucune coordonnée client n'est lue.
        //
        // ⚠️ ON DÉCOUPE SUR `paye_le`, LE JOUR DE L'ENCAISSEMENT, et non sur
        // `created_at` : c'est la date retenue en Comptabilité (décision
        // d'Alex, 17/08), et les deux écrans doivent raconter la même histoire.
        supabase.from('abonnements')
          .select('id, prix, paye, paye_le, mode_paiement')
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
        .select('article_nom, quantite, prix_unitaire')
        .in('commande_id', idsEncaissees)
      lignes = data || []
    }

    // Les noms des prestations : le rendez-vous ne porte qu'un identifiant.
    // On les charge toujours, y compris les supprimées (`deleted_at`), sinon
    // une prestation retirée du catalogue ferait disparaître du chiffre
    // d'affaires les rendez-vous déjà honorés.
    const idsPrestations = [...new Set(rdvActuels.filter(rdvHonore).map(r => r.prestation_id).filter(Boolean))]
    const nomsPrestations = {}
    if (idsPrestations.length > 0) {
      const { data } = await supabase
        .from('rdv_prestations')
        .select('id, nom')
        .in('id', idsPrestations)
      for (const p of data || []) nomsPrestations[String(p.id)] = p.nom
    }

    // ⚠️ LA FENÊTRE SE LIT SUR `paye_le`, jamais sur `created_at` : un contrat
    // inscrit à la main lundi et payé vendredi appartient au vendredi, sinon la
    // Comptabilité et le tableau de bord tomberaient sur deux semaines
    // différentes pour le même argent.
    //
    // ⚠️ ET LA PÉRIODE PRÉCÉDENTE EST BORNÉE DES DEUX CÔTÉS. Les autres tables
    // sont déjà coupées à `debutPrecedent` par leur requête ; celle-ci ne l'est
    // pas, parce qu'on filtre en mémoire sur `paye_le`. Sans la borne basse, la
    // comparaison opposerait trente jours à TOUT L'HISTORIQUE, et l'évolution
    // afficherait une chute vertigineuse sur un commerce en pleine forme.
    const abosPayes = (abonnements || []).filter(a => a?.paye && a?.paye_le)
    const jourDebut = jourBruxelles(f.debut)
    const jourDebutPrecedent = jourBruxelles(f.debutPrecedent)
    // ⚠️ EN HEURE BELGE. Ces deux bornes decoupaient encore l instant en temps
    // universel, DEUX LIGNES sous celles corrigees le matin meme : ma garde ne
    // cherchait que `toISOString()` et n a pas vu cette ecriture-ci. Un contrat
    // encaisse a 00h28 basculait donc dans la periode precedente.
    const aboActuels = abosPayes.filter(a => jourBruxelles(a.paye_le) >= jourDebut)
    const aboPrecedents = abosPayes.filter(a => {
      const jour = jourBruxelles(a.paye_le)
      return jour >= jourDebutPrecedent && jour < jourDebut
    })

    const caActuel = chiffreAffaires(cmdActuelles, rdvActuels, aboActuels)
    const caPrecedent = chiffreAffaires(cmdPrecedentes, rdvPrecedents, aboPrecedents)
    const ventesActuelles = cmdActuelles.filter(commandeEncaissee).length
    const ventesPrecedentes = cmdPrecedentes.filter(commandeEncaissee).length

    // Les favoris se comptent sans jamais lire QUI a mis le cœur.
    const { count: favoris } = await supabase
      .from('favoris')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId)

    // Les vues de fiche : une ligne par jour, aucune donnée sur les visiteurs.
    // La table peut ne pas exister encore (migration non passée) : dans ce cas
    // on renvoie null et l'écran dit simplement que le compteur démarre.
    let vues = null
    let vuesParJour = []
    {
      const { data, error } = await supabase
        .from('fiche_vues')
        .select('jour, vues')
        .eq('commercant_id', commercantId)
        .gte('jour', jourBruxelles(f.debutPrecedent))
      if (!error) {
        vuesParJour = data || []
        const debutJour = jourBruxelles(f.debut)
        const actuelles = vuesParJour.filter(v => v.jour >= debutJour)
        const precedentes = vuesParJour.filter(v => v.jour < debutJour)
        const somme = (l) => l.reduce((s, v) => s + Number(v.vues || 0), 0)
        vues = {
          nombre: somme(actuelles),
          evolution: evolution(somme(actuelles), somme(precedentes)),
        }
      }
    }

    const rien = caActuel.total === 0 && ventesActuelles === 0 && rdvActuels.length === 0

    return NextResponse.json({
      ok: true,
      periode: { jours, debut: f.debut.toISOString(), fin: f.fin.toISOString() },
      argent: {
        // Le total inclut le prix COMPLET des prestations réservées
        // (décision d'Alex, 09/08). `encaisse_en_ligne` est la clé de
        // rapprochement avec l'onglet Comptabilité.
        chiffre_affaires: caActuel.total,
        ca_produits: caActuel.produits,
        ca_prestations: caActuel.prestations,
        ca_abonnements: caActuel.abonnements,
        // ⚠️ DE QUOI EXPLIQUER L ECART avec la Comptabilite, plutot que de
        // laisser deux chiffres se contredire en silence (Alex, 19/08).
        seances_non_declarees: seancesNonDeclarees(rdvActuels),
        abonnements_vendus: caActuel.nb_abonnements,
        encaisse_en_ligne: caActuel.encaisse_en_ligne,
        au_comptoir: caActuel.au_comptoir,
        evolution_ca: evolution(caActuel.total, caPrecedent.total),
        panier_moyen: panierMoyen(cmdActuelles),
        ventes: ventesActuelles,
        evolution_ventes: evolution(ventesActuelles, ventesPrecedentes),
        rendez_vous: caActuel.nb_rdv,
      },
      attention: {
        non_recuperees: nonRecuperees(cmdActuelles),
        annulations: tauxAnnulation(cmdActuelles, rdvActuels),
      },
      catalogue: {
        top: topArticles(lignes, 5),
        prestations: topPrestations(rdvActuels, nomsPrestations, 5),
      },
      // La courbe : un point par jour, journées vides comprises, sinon deux
      // ventes espacées de trois semaines donnent un trait plat mensonger.
      courbe: serieJournaliere(cmdActuelles, rdvActuels, aboActuels, { debut: f.debut, fin: f.fin, jours }),
      // Quand les gens commandent et réservent — le moment de la DEMANDE, en
      // heure belge. Le moment du retrait vit déjà dans l'agenda.
      moments: momentsDePointe(cmdActuelles, rdvActuels),
      audience: {
        favoris: favoris || 0,
        vues,
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
