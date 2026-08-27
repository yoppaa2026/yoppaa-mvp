// POST /api/fidelite/rdv-honore  body { rdv_id }
//
// Crédit de la fidélité au moment où le commerçant CLÔTURE un rendez-vous.
//
// ⚠️ POURQUOI CETTE ROUTE EXISTE. Jusqu'au 27/08, un rendez-vous n'était crédité
// que par le cron quotidien de 9h, le LENDEMAIN. Le client repartait du salon
// sans rien, et sa carte se remplissait pendant la nuit. Le commerçant, lui, ne
// pouvait rien lui montrer sur le moment.
//
// ⚠️ LE CRON RESTE, ET C'EST VOULU : il repasse derrière en filet pour les
// rendez-vous que personne n'a clôturés. L'index unique (carte_id, rdv_id) de
// `fidelite_mouvements` fait que le second passage ne crédite jamais deux fois.
//
// ⚠️ LA RÈGLE N'EST PAS ICI, elle vit dans `lib/fidelite-server.js`, partagée
// avec le cron. Deux copies auraient divergé, comme les deux systèmes de
// fidélité supprimés le même jour.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { crediterFideliteRdv } from '@/lib/fidelite-server'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null)
    const rdvId = body?.rdv_id
    if (!rdvId || !RE_UUID.test(String(rdvId))) {
      return NextResponse.json({ ok: false, error: 'rdv_id invalide' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ LA GARDE D'ABORD. Cette route tourne avec la clé de service, qui ignore
    // la RLS : sans elle, connaître l'identifiant d'un rendez-vous suffirait à
    // déclencher un crédit chez n'importe quel commerçant. `gardeSurLigne`
    // vérifie que le jeton présenté est bien celui du propriétaire de la ligne.
    const verdict = await gardeSurLigne(request, supabase, 'rdv_reservations', rdvId)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const res = await crediterFideliteRdv(supabase, rdvId, '[fidelite/rdv-honore]')
    // ⚠️ UN REFUS MÉTIER N'EST PAS UNE ERREUR. Une fidélité éteinte, un rendez-vous
    // annulé, une prestation sans prix : le tableau de bord ne doit PAS afficher
    // d'avertissement pour ça, sinon le commerçant en voit un à chaque clôture et
    // cesse de les lire. Seul un échec technique mérite un 500.
    if (!res.ok && res.reason === 'exception') {
      return NextResponse.json({ ok: false, error: 'Crédit de fidélité impossible' }, { status: 500 })
    }
    return NextResponse.json(res)
  } catch (e) {
    console.error('[fidelite/rdv-honore] KO', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
