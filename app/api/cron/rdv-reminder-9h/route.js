// GET /api/cron/rdv-reminder-9h
//
// Cron Vercel quotidien a 9h00 : envoie le rappel emailRdvReminder a tous
// les Yoppers ayant un RDV confirme le LENDEMAIN (J+1).
//
// Securite : verifie le header Authorization: Bearer <CRON_SECRET>
// (Vercel ajoute automatiquement ce header pour les crons configures
// dans vercel.json, en utilisant la valeur de la variable CRON_SECRET).
//
// Configuration cote vercel.json :
//   { "path": "/api/cron/rdv-reminder-9h", "schedule": "0 9 * * *" }
//
// Format reponse : { ok: true, sent: N, failed: M }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailRdvReminder } from '@/lib/resend'

export async function GET(request) {
  // 1) Securite : verifie Bearer token
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

    // 2) Calcule date J+1 (au format YYYY-MM-DD)
    const demain = new Date()
    demain.setDate(demain.getDate() + 1)
    const yyyy = demain.getFullYear()
    const mm = String(demain.getMonth() + 1).padStart(2, '0')
    const dd = String(demain.getDate()).padStart(2, '0')
    const dateRdv = `${yyyy}-${mm}-${dd}`

    // 3) Fetch les RDV confirmes pour cette date
    const { data: rdvs, error } = await supabase
      .from('rdv_reservations')
      .select(`
        id, date_rdv, heure_debut, heure_fin, duree_minutes,
        prix_estime, acompte_paye_en_ligne, acompte_montant,
        client_email, client_prenom,
        commercant:commercants(nom, slug, adresse, rdv_delai_annulation_heures),
        prestation:rdv_prestations(nom)
      `)
      .eq('date_rdv', dateRdv)
      .eq('statut', 'confirme')
      .is('deleted_at', null)

    if (error) {
      console.error('[cron/rdv-reminder-9h] fetch error', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    let sent = 0
    let failed = 0

    // 4) Envoi sequentiel (volume faible MVP)
    for (const r of (rdvs || [])) {
      if (!r.client_email || !r.commercant?.nom || !r.prestation?.nom) {
        failed++
        continue
      }
      try {
        const solde = (r.prix_estime != null && r.acompte_paye_en_ligne && r.acompte_montant)
          ? Number(r.prix_estime) - Number(r.acompte_montant)
          : (r.prix_estime != null ? Number(r.prix_estime) : null)

        const html = emailRdvReminder({
          yopper_prenom:           r.client_prenom || 'Yopper',
          commercant_nom:          r.commercant.nom,
          commercant_adresse:      r.commercant.adresse || '',
          commercant_slug:         r.commercant.slug || '',
          prestation_nom:          r.prestation.nom,
          date_rdv:                r.date_rdv,
          heure_debut:             r.heure_debut,
          heure_fin:               r.heure_fin,
          duree_minutes:           r.duree_minutes,
          solde_a_prevoir:         solde,
          delai_annulation_heures: r.commercant.rdv_delai_annulation_heures || 24,
        })

        await envoyerAuCommercant({
          to: r.client_email,
          subject: `Rappel — RDV demain chez ${r.commercant.nom} à ${r.heure_debut?.slice(0,5)}`,
          html,
        })
        sent++
      } catch (e) {
        console.error('[cron/rdv-reminder-9h] envoi KO', { rdvId: r.id, error: e?.message })
        failed++
      }
    }

    console.info('[cron/rdv-reminder-9h]', { dateRdv, total: rdvs?.length || 0, sent, failed })
    return NextResponse.json({ ok: true, date_rdv: dateRdv, total: rdvs?.length || 0, sent, failed })

  } catch (e) {
    console.error('[cron/rdv-reminder-9h] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
