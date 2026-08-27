// GET /api/cron/fidelite-rdv
//
// Cron Vercel quotidien (07:00 UTC = 9h belge) : crédite la fidélité pour
// les RDV HONORÉS de la veille (statut 'confirme', non annulés, non
// supprimés) des commerçants Vendre avec fidélité active.
//
// Un RDV honoré n'a pas d'événement explicite dans l'app (le commerçant ne
// « clôture » pas ses RDV) : la veille entière est donc la fenêtre fiable.
// Idempotent : index unique (carte_id, rdv_id) sur fidelite_mouvements, un
// re-run ne crédite jamais deux fois.
//
// Mécanique cagnotte : montant = prix de la prestation (si renseigné).
// Sécurité : Authorization: Bearer <CRON_SECRET> (même pattern que les autres).
//
// ⚠️ Tournait à 01:00 UTC, soit 3h du matin en Belgique : ce cron a réveillé
// Alex avec un SMS de fidélité (05/08). Le crédit peut attendre le matin, et
// lib/fidelite-sms refuse désormais d'écrire hors de la plage 8h-21h.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { crediterFideliteRdv } from '@/lib/fidelite-server'

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

    // La veille en date locale belge (le cron tourne la nuit : hier = J-1)
    const hier = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const dateHier = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(hier)

    // ⚠️ CE CRON N'EST PLUS LE SEUL CHEMIN, ET IL N'EST PLUS CELUI QUI DÉCIDE.
    // Depuis le 27/08, le tableau de bord crédite au moment où le commerçant
    // clôture, via /api/fidelite/rdv-honore. Le cron reste EN FILET pour les
    // rendez-vous que personne n'a clôturés, et il ne rattrape rien deux fois :
    // l'index unique (carte_id, rdv_id) absorbe le second passage.
    //
    // ⚠️ ET IL NE PORTE PLUS SA PROPRE RÈGLE. Il lisait `commercant.plan` au
    // lieu de `planEffectif` : un commerçant EN ESSAI de Vendre voyait son
    // tableau de bord lui ouvrir la fidélité automatique et ce cron la lui
    // refuser en silence, chaque nuit. Deux copies d'une même règle finissent
    // toujours par diverger ; celle-ci vit désormais dans
    // `crediterFideliteRdv`, avec l'autre appelant.
    //
    // 🔴 LE FILTRE NE VOYAIT QUE `confirme`, ET IL PUNISSAIT LE BON ÉLÈVE.
    // Clôturer un rendez-vous le faisait sortir du filtre : le commerçant qui
    // marquait ses rendez-vous honorés était le seul dont les clients
    // n'étaient jamais crédités. Celui qui ne touchait à rien, si.
    const { data: rdvs, error: errRdvs } = await supabase
      .from('rdv_reservations')
      .select('id')
      .eq('date_rdv', dateHier)
      .in('statut', ['confirme', 'honore'])
      .is('deleted_at', null)
    if (errRdvs) throw new Error(errRdvs.message)

    let credites = 0
    let deja = 0
    let ignores = 0

    for (const rdv of (rdvs || [])) {
      const res = await crediterFideliteRdv(supabase, rdv.id, '[cron/fidelite-rdv]')
      if (res.deja_credite) deja++
      else if (res.ok) credites++
      else ignores++
    }

    console.info('[cron/fidelite-rdv]', { dateHier, rdvs: (rdvs || []).length, credites, deja, ignores })
    return NextResponse.json({ ok: true, date: dateHier, rdvs: (rdvs || []).length, credites, deja, ignores })
  } catch (e) {
    console.error('[cron/fidelite-rdv] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
