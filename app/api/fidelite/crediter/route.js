// POST /api/fidelite/crediter  body { commande_id }
//
// Crédit AUTOMATIQUE de la fidélité (Vendre uniquement, feature fidelite_auto)
// quand une commande atteint son statut final 'recupere' (retrait récupéré,
// livraison livrée, colis expédié : tous convergent sur ce statut).
// Appelé en fire-and-forget par le dashboard commerçant après la transition.
//
// LE GSM = LA CARTE : le téléphone du checkout (obligatoire) est la clé.
// Idempotent (index unique carte_id + commande_id sur fidelite_mouvements).
// Les RDV honorés sont crédités par le cron quotidien /api/cron/fidelite-rdv.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { crediterFideliteCommande } from '@/lib/fidelite-server'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null)
    const commandeId = body?.commande_id
    if (!commandeId || !RE_UUID.test(String(commandeId))) {
      return NextResponse.json({ ok: false, error: 'commande_id invalide' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ GARDE D AUTORISATION, POSEE LE 21/08 avec les dix autres. Cette route
    // n est appelee que par le tableau de bord : les trois mentions trouvees
    // ailleurs dans le code sont des COMMENTAIRES, pas des appels. Elle peut
    // donc exiger le jeton du commercant sans rien casser.
    const verdict = await gardeSurLigne(request, supabase, 'commandes', commandeId)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    // Le seul contrôle propre à cette route : on ne crédite que du définitif.
    const { data: cmd, error: errCmd } = await supabase
      .from('commandes').select('id, statut').eq('id', commandeId).maybeSingle()
    if (errCmd) throw new Error(errCmd.message)
    if (!cmd) return NextResponse.json({ ok: false, error: 'Commande introuvable' }, { status: 404 })
    if (cmd.statut !== 'recupere') {
      return NextResponse.json({ ok: false, error: 'Commande non finalisée' }, { status: 400 })
    }

    // ⚠️ LA RÈGLE DU BON CADEAU VIT DANS `lib/fidelite-server.js`, ET NULLE PART
    // AILLEURS. Elle était recopiée dans trois routes, et il suffisait d'en
    // oublier une pour que le double comptage revienne par celle-là : s'offrir
    // un bon à soi-même remplissait alors la cagnotte deux fois.
    const res = await crediterFideliteCommande(supabase, commandeId, '[fidelite/crediter]')
    return NextResponse.json(res)
  } catch (e) {
    console.error('[fidelite/crediter] KO', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
