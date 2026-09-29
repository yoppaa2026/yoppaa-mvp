// POST /api/commande/non-retire
//
// Le commerçant déclare qu'un client n'est jamais venu chercher sa commande.
//
// ⚠️ CETTE ROUTE EXISTE POUR RENDRE LE STOCK, et c'est tout son intérêt.
// Jusqu'ici, le tableau de bord posait le statut directement depuis le
// navigateur. Or les articles à VERSIONS (tailles, couleurs) sont décrémentés
// en dur à la commande : sans restitution, chaque commande déclarée non
// retirée retirait définitivement une pièce des rayons. Trois chemins
// d'annulation appellent `restaurerStockVariantes` ; celui-ci n'existait pas.
//
// ⚠️ ET C'EST LE COMMERÇANT QUI DÉCIDE, JAMAIS L'AUTOMATE. Le cron
// `non-retire-daily` basculait chaque nuit toute commande prête dont le jour de
// retrait était passé, en silence et sans rendre le stock. Il a été supprimé le
// 11/08 (décision d'Alex) et remplacé par `rappels-retrait`, qui rappelle mais
// ne tranche pas.
//
// ⚠️ L'IDEMPOTENCE VIENT D'ICI. L'`UPDATE` est filtré sur l'ANCIEN statut : le
// stock n'est rendu que si la ligne a réellement basculé. Deux clics, ou deux
// appels concurrents, ne rendent le stock qu'une fois. C'est la règle posée le
// 10/08, et le seul rempart contre un stock qui gonfle tout seul.

import { NextResponse } from 'next/server'
import { refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { createClient } from '@supabase/supabase-js'
import { restaurerStockVariantes } from '@/lib/stock-variantes-server'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Qui peut déclarer une commande non retirée ? Le patron, l'admin vérifié, ou
// un membre de l'équipe qui a la case « Commandes » (`gardeLigneEquipe`, 29/09).
// Sans cette vérification, n'importe qui déclarerait non retirée la commande de
// n'importe quel commerce en changeant un identifiant.

export async function POST(request) {
  try {
    let body
    try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'body JSON requis' }, { status: 400 }) }
    const commandeId = body?.commande_id
    if (!commandeId) return NextResponse.json({ ok: false, error: 'commande_id requis' }, { status: 400 })

    const supabase = admin()
    // 🔴 LE PATRON, L'ADMIN ET L'ÉQUIPE PAR LA MÊME GARDE (29/09, étape 3).
    // Le commerce se déduit de la commande, jamais du corps de la requête.
    const verdict = await gardeLigneEquipe(request, supabase, 'commandes', commandeId, 'commandes')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    // ⚠️ FILTRÉ SUR L'ANCIEN STATUT. C'est cette clause qui rend l'opération
    // idempotente : si la commande n'est plus « prête », aucune ligne ne
    // bascule, et le stock n'est pas rendu une seconde fois.
    const { data: basculee } = await supabase
      .from('commandes')
      .update({ statut: 'non_retire' })
      .eq('id', commandeId)
      .eq('statut', 'pret')
      .select('id')
      .maybeSingle()

    if (!basculee) {
      // Déjà traitée, ou plus au bon statut : on ne touche à rien.
      return NextResponse.json({ ok: true, deja_traitee: true, stock_rendu: 0 })
    }

    const restitution = await restaurerStockVariantes(supabase, [commandeId])
    await journaliserGeste(supabase, verdict, { action: 'commande_non_retiree', cible_type: 'commande', cible_id: commandeId })
    console.info('[commande/non-retire]', { commandeId, restitution })

    // Le champ s'appelle `rendues`. Se tromper de nom aurait rendu zéro en
    // silence, sans que rien ne signale que le stock n'était pas revenu.
    return NextResponse.json({ ok: true, stock_rendu: restitution?.rendues ?? 0 })

  } catch (e) {
    console.error('[commande/non-retire] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
