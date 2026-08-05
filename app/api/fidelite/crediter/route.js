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
import { crediterFidelite } from '@/lib/fidelite-server'
import { canDo } from '@/lib/plans'

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

    const { data: cmd, error: errCmd } = await supabase
      .from('commandes')
      .select('id, commercant_id, client_telephone, client_email, total, statut')
      .eq('id', commandeId).maybeSingle()
    if (errCmd) throw new Error(errCmd.message)
    if (!cmd) return NextResponse.json({ ok: false, error: 'Commande introuvable' }, { status: 404 })
    if (cmd.statut !== 'recupere') {
      return NextResponse.json({ ok: false, error: 'Commande non finalisée' }, { status: 400 })
    }

    const { data: commercant, error: errCom } = await supabase
      .from('commercants').select('*').eq('id', cmd.commercant_id).maybeSingle()
    if (errCom) throw new Error(errCom.message)
    if (!commercant?.fidelite_actif || !canDo(commercant.plan, 'fidelite_auto')) {
      return NextResponse.json({ ok: true, skipped: 'fidelite_inactive' })
    }

    const credit = commercant.fidelite_mecanique === 'cagnotte'
      ? { montant: Number(cmd.total || 0) }
      : { passages: 1 }
    const res = await crediterFidelite(supabase, commercant, cmd.client_telephone, credit, {
      source: 'commande', commande_id: cmd.id, client_email: cmd.client_email || null,
    })
    return NextResponse.json(res)
  } catch (e) {
    console.error('[fidelite/crediter] KO', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
