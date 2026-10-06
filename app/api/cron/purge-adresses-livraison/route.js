// GET /api/cron/purge-adresses-livraison
//
// EFFACER L'ADRESSE D'UNE COMMANDE 6 MOIS APRÈS (décision d'Alex, 06/10).
// La règle et sa justification vivent dans lib/purge-livraison.js.
//
// Une fois par mois. L'adresse, la position et la note de livraison passent à
// `null` sur les commandes dont la date est antérieure à la limite ; la
// commande elle-même (articles, total, TVA, mode) reste, c'est une pièce
// comptable.
//
// Sécurité : header Authorization: Bearer <CRON_SECRET>. Sans secret, la route
// REFUSE ; elle ne s'ouvre pas.
//
// ⚠️ ON NE JOURNALISE AUCUNE ADRESSE, seulement un nombre.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeCron, refusCron } from '@/lib/cron-auth'
import { dateLimitePurge, effacement } from '@/lib/purge-livraison'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

async function handle(req) {
  const refuse = refusCron(gardeCron(req, 'cron/purge-adresses-livraison'), NextResponse)
  if (refuse) return refuse

  const limite = dateLimitePurge(new Date())
  if (!limite) return NextResponse.json({ ok: false, error: 'date limite incalculable' }, { status: 500 })

  const { data, error } = await admin()
    .from('commandes')
    .update(effacement())
    .lt('date_commande', limite)
    .or('adresse_livraison.not.is.null,note_livraison.not.is.null,livraison_lat.not.is.null,livraison_lng.not.is.null')
    .select('id')
  if (error) {
    console.error('[cron/purge-adresses-livraison] KO', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  console.info('[cron/purge-adresses-livraison] OK', { limite, effacees: data?.length || 0 })
  return NextResponse.json({ ok: true, limite, effacees: data?.length || 0 })
}

export async function GET(req) { return handle(req) }
export async function POST(req) { return handle(req) }
