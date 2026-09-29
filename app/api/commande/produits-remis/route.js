// POST /api/commande/produits-remis
//
// Le commerçant déclare qu'il a remis à son client les produits achetés dans le
// même paiement qu'un rendez-vous.
//
// ⚠️ CETTE COMMANDE NE POUVAIT ÊTRE CLÔTURÉE PAR PERSONNE. Le client n'avait
// qu'un bouton « J'ai compris » sur son écran de retrait, décidé le 05/08 au
// motif qu'il a les mains prises en sortant du fauteuil. L'intention était
// bonne, le résultat non : la commande restait « prête » indéfiniment, pesait
// sur les compteurs du tableau de bord, déclenchait des rappels de retrait, et
// finissait par être marquée « client non venu » alors qu'il était venu.
//
// D'où cette route, appelée par DEUX chemins :
//   • automatiquement quand le commerçant marque le rendez-vous HONORÉ. C'est
//     le moment exact où il tend le sachet : un geste, pas deux ;
//   • à la main, depuis la vignette de commande, pour les cas où le rendez-vous
//     s'est passé sans que les produits soient remis, ou l'inverse.
//
// ⚠️ L'IDEMPOTENCE VIENT DE L'`UPDATE`, filtré sur les anciens statuts. Deux
// clics, ou l'automatique suivi du manuel, ne créditent la fidélité qu'une fois.
// Même règle que `non-retire`, posée le 10/08.
//
// ⚠️ ET LA FIDÉLITÉ SUIT. Une commande récupérée remplit la carte de son client.
// Jusqu'ici cela n'arrivait que par le geste du Yopper : sans ce rappel ici, un
// client perdrait son passage selon la façon dont sa commande a été clôturée,
// et ne le saurait jamais.

import { NextResponse } from 'next/server'
import { refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { createClient } from '@supabase/supabase-js'
import { crediterFideliteCommande } from '@/lib/fidelite-server'

// Les statuts depuis lesquels une commande peut encore être remise. Une
// commande annulée ou déjà récupérée n'a rien à faire ici.
const STATUTS_REMISABLES = ['en_attente', 'en_preparation', 'pret']

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Qui peut remettre les produits ? Le patron, l'admin vérifié, ou un membre de
// l'équipe qui a « Agenda » (le client venu à son rendez-vous) ou « Commandes »
// (`gardeLigneEquipe`, 29/09). Sans cette vérification, changer un identifiant
// suffirait à clôturer la commande de n'importe quel commerce.

export async function POST(request) {
  try {
    let body
    try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'body JSON requis' }, { status: 400 }) }
    const commandeId = body?.commande_id
    if (!commandeId) return NextResponse.json({ ok: false, error: 'commande_id requis' }, { status: 400 })

    const supabase = admin()
    // 🔴 LE PATRON, L'ADMIN ET L'ÉQUIPE PAR LA MÊME GARDE (29/09, étape 3).
    // Le commerce se déduit de la commande, jamais du corps de la requête.
    const verdict = await gardeLigneEquipe(request, supabase, 'commandes', commandeId, ['agenda', 'commandes'])
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: basculee } = await supabase
      .from('commandes')
      .update({ statut: 'recupere' })
      .eq('id', commandeId)
      .in('statut', STATUTS_REMISABLES)
      .select('id')
      .maybeSingle()

    if (!basculee) {
      // Déjà remise, ou annulée entre-temps : on ne touche à rien et on ne
      // crédite pas une seconde fois.
      return NextResponse.json({ ok: true, deja_remise: true })
    }

    await crediterFideliteCommande(supabase, commandeId, '[commande/produits-remis]')
    await journaliserGeste(supabase, verdict, { action: 'produits_remis', cible_type: 'commande', cible_id: commandeId })
    console.info('[commande/produits-remis]', { commandeId })

    return NextResponse.json({ ok: true, remise: true })

  } catch (e) {
    console.error('[commande/produits-remis] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
