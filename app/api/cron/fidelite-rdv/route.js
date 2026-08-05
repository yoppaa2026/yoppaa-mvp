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
import { crediterFidelite } from '@/lib/fidelite-server'
import { canDo } from '@/lib/plans'

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

    // Commerçants éligibles : fidélité active + Vendre (fidelite_auto)
    const { data: commercants, error: errCom } = await supabase
      .from('commercants')
      .select('*')
      .eq('fidelite_actif', true)
    if (errCom) throw new Error(errCom.message)
    const eligibles = (commercants || []).filter(c => canDo(c.plan, 'fidelite_auto'))

    let credites = 0
    let deja = 0
    let ignores = 0

    for (const commercant of eligibles) {
      const { data: rdvs, error: errRdvs } = await supabase
        .from('rdv_reservations')
        .select('id, client_telephone, client_email, prestation:rdv_prestations(prix)')
        .eq('commercant_id', commercant.id)
        .eq('date_rdv', dateHier)
        .eq('statut', 'confirme')
        .is('deleted_at', null)
      if (errRdvs) {
        console.error('[cron/fidelite-rdv] fetch rdvs KO', { commercant: commercant.id, error: errRdvs.message })
        continue
      }

      for (const rdv of (rdvs || [])) {
        try {
          const credit = commercant.fidelite_mecanique === 'cagnotte'
            ? { montant: Number(rdv.prestation?.prix || 0) }
            : { passages: 1 }
          // Cagnotte sans prix de prestation : rien à créditer
          if (commercant.fidelite_mecanique === 'cagnotte' && !credit.montant) { ignores++; continue }
          const res = await crediterFidelite(supabase, commercant, rdv.client_telephone, credit, {
            source: 'rdv', rdv_id: rdv.id, client_email: rdv.client_email || null,
          })
          if (res.deja_credite) deja++
          else if (res.ok) credites++
          else ignores++
        } catch (e) {
          console.error('[cron/fidelite-rdv] credit KO', { rdv: rdv.id, error: e?.message })
          ignores++
        }
      }
    }

    console.info('[cron/fidelite-rdv]', { dateHier, commercants: eligibles.length, credites, deja, ignores })
    return NextResponse.json({ ok: true, date: dateHier, commercants: eligibles.length, credites, deja, ignores })
  } catch (e) {
    console.error('[cron/fidelite-rdv] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
