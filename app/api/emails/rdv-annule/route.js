// POST /api/emails/rdv-annule
//
// Envoie emailRdvAnnule au Yopper + iCal CANCEL (supprime l'event du calendrier).
//
// Body : { rdv_id: UUID, raison_annulation: 'yopper' | 'commercant' | 'auto', refund_en_cours?: bool }
//
// Note : le refund Stripe sera implemente en STRIPE-8. Pour MVP, refund_en_cours=false
// par defaut, le Yopper sera contacte manuellement si acompte paye.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailRdvAnnule } from '@/lib/resend'
import { generateRdvIcs, icsToBase64Attachment } from '@/lib/ical'
import { annulerPush } from '@/lib/onesignal'
import { adresseRendezVous } from '@/lib/lieu-fige'

export async function POST(request) {
  try {
    const body = await request.json()
    const { rdv_id, raison_annulation = 'commercant', refund_en_cours = false } = body
    if (!rdv_id) return NextResponse.json({ ok: false, error: 'rdv_id requis' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, date_rdv, heure_debut, heure_fin, acompte_paye_en_ligne, acompte_montant,
        client_email, client_prenom, rappel_push_id,
        lieu_id, lieu_libelle, lieu_adresse,
        commercant:commercants(nom, slug, adresse, telephone, email),
        prestation:rdv_prestations(nom)
      `)
      .eq('id', rdv_id)
      .single()

    // Annule le rappel push programmé (1h avant) quel que soit le motif. Best-effort.
    if (rdv?.rappel_push_id) {
      annulerPush(rdv.rappel_push_id).catch(() => {})
    }

    if (!rdv || !rdv.client_email) {
      return NextResponse.json({ ok: true, skipped: 'no_email' })
    }

    // iCal CANCEL : meme UID que la creation, METHOD:CANCEL → calendrier supprime l'event
    const ics = generateRdvIcs({
      id: rdv.id,
      date_rdv: rdv.date_rdv,
      heure_debut: rdv.heure_debut,
      heure_fin: rdv.heure_fin,
      prestation_nom: rdv.prestation?.nom || 'Prestation',
      commercant_nom: rdv.commercant?.nom || '',
      commercant_adresse: adresseRendezVous(rdv),
      commercant_telephone: rdv.commercant?.telephone,
      commercant_email: rdv.commercant?.email,
      // ATTENDEE : sans lui, iOS ne propose pas le calendrier.
      client_email: rdv.client_email,
      client_nom: [rdv.client_prenom, rdv.client_nom].filter(Boolean).join(' '),
      rappel_24h: false,
      status: 'CANCELLED',
      method: 'CANCEL',
      sequence: 1,
    })
    const attachment = icsToBase64Attachment(ics, `rdv-${rdv.id}-cancel.ics`)

    const html = emailRdvAnnule({
      yopper_prenom:     rdv.client_prenom || 'Yopper',
      commercant_nom:    rdv.commercant?.nom || '',
      commercant_slug:   rdv.commercant?.slug || '',
      prestation_nom:    rdv.prestation?.nom || '',
      date_rdv:          rdv.date_rdv,
      heure_debut:       rdv.heure_debut,
      acompte_paye:      !!(rdv.acompte_paye_en_ligne && rdv.acompte_montant),
      acompte_montant:   rdv.acompte_montant,
      refund_en_cours,
      raison_annulation,
    })

    await envoyerAuCommercant({
      to: rdv.client_email,
      subject: `Ton RDV chez ${rdv.commercant?.nom || ''} a été annulé`,
      html,
      attachments: [attachment],
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/emails/rdv-annule]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
