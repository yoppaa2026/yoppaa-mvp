// GET /api/cron/non-retire-daily
//
// Cron Vercel quotidien a 00:30 UTC (~ 01:30/02:30 Bruxelles) : bascule les
// commandes 'pret' dont la date_commande est anterieure a aujourd'hui vers
// le statut 'non_retire'.
//
// Logique : si une commande etait 'prete a retirer' la veille (ou avant) et
// que le client n'est pas venu la chercher, on considere qu'elle ne sera plus
// recuperee. Le commercant voit alors le badge "Non retire" dans son dashboard
// (utile pour stats no-show + decision retour stock le cas echeant).
//
// Pas d'effet sur Stripe (refund manuel reste a la discretion du commercant).
//
// Securite : header Authorization: Bearer <CRON_SECRET>.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || ''
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // Date d'aujourd'hui au format YYYY-MM-DD (en UTC suffit, le cron tourne
    // a 00:30 UTC donc la basculement est largement apres minuit Europe)
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const todayStr = `${yyyy}-${mm}-${dd}`

    const { data, error } = await supabase
      .from('commandes')
      .update({ statut: 'non_retire' })
      .eq('statut', 'pret')
      .lt('date_commande', todayStr)
      .select('id, commercant_id, numero_commande')

    if (error) {
      console.error('[cron/non-retire-daily] UPDATE KO', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    console.info('[cron/non-retire-daily] bascule effectuee', { nb: data?.length || 0 })
    return NextResponse.json({ ok: true, updated: data?.length || 0 })
  } catch (e) {
    console.error('[cron/non-retire-daily] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
