// POST /api/emails/rdv-no-show
//
// Notifie le Yopper qu'il a ete marque NO-SHOW par le commercant.
// Mentionne que l'acompte (si paye en ligne) est conserve par le commercant
// car le creneau a ete bloque pour rien (decision Alex 30/06/2026 :
// acompte garde par defaut, geste commercial manuel possible cote commercant).
//
// Body : { rdv_id }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { envoyerAuCommercant, emailRdvNoShow } from '@/lib/resend'

export async function POST(request) {
  try {
    const { rdv_id } = await request.json()
    if (!rdv_id) {
      return NextResponse.json({ ok: false, error: 'rdv_id requis' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ GARDE D'AUTORISATION, POSÉE LE 21/08. Cette route n'en avait AUCUNE :
    // ni jeton, ni cookie, ni secret. Elle prenait un identifiant dans le corps
    // de la requête, chargeait la ligne avec la CLÉ DE SERVICE — qui ignore la
    // RLS — et faisait partir l'email. Le client qui possède le numéro de sa
    // propre commande pouvait donc déclencher n'importe lequel de ces envois,
    // vers le commerçant comme vers lui-même, autant de fois qu'il voulait.
    // La règle vit dans lib/api-auth.js, pour les dix routes à la fois.
    const verdict = await gardeSurLigne(request, supabase, 'rdv_reservations', rdv_id)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: rdv, error } = await supabase
      .from('rdv_reservations')
      .select(`
        id, date_rdv, heure_debut, acompte_paye_en_ligne, acompte_montant,
        client_email, client_prenom,
        bon_cadeau_montant,
        commercant:commercants(nom, slug),
        prestation:rdv_prestations(nom)
      `)
      .eq('id', rdv_id)
      .single()

    if (error || !rdv) {
      console.error('[emails/rdv-no-show] RDV introuvable', { rdv_id, error })
      return NextResponse.json({ ok: false, error: 'RDV introuvable' }, { status: 404 })
    }

    if (!rdv.client_email) {
      return NextResponse.json({ ok: true, skipped: 'no_email' })
    }

    try {
      const html = emailRdvNoShow({
        yopper_prenom:    rdv.client_prenom || 'Yopper',
        commercant_nom:   rdv.commercant?.nom || '',
        commercant_slug:  rdv.commercant?.slug || '',
        prestation_nom:   rdv.prestation?.nom || '',
        date_rdv:         rdv.date_rdv,
        heure_debut:      rdv.heure_debut,
        acompte_paye:     !!(rdv.acompte_paye_en_ligne && rdv.acompte_montant),
        acompte_montant:  rdv.acompte_montant,
        // 🔴 LE BON CADEAU RESTE CHEZ LE COMMERÇANT LUI AUSSI, et rien ne le
        // disait. Sur un rendez-vous dont l'acompte vaut zéro parce qu'un bon
        // de 40 € a payé la prestation, le bloc entier disparaissait : le
        // Yopper perdait 40 € sans qu'un seul écran ni un seul email ne le
        // mentionne. Frère du défaut de l'annulation, trouvé le 30/08 au soir.
        bon_cadeau_montant: rdv.bon_cadeau_montant,
      })
      await envoyerAuCommercant({
        to: rdv.client_email,
        subject: `Ton RDV chez ${rdv.commercant?.nom || 'le commerçant'} a été marqué non honoré`,
        html,
      })
    } catch (e) {
      console.error('[emails/rdv-no-show] envoi KO', e?.message)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/emails/rdv-no-show]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
