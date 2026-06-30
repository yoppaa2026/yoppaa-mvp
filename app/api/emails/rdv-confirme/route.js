// POST /api/emails/rdv-confirme
//
// Envoie 2 emails apres confirmation d'un RDV :
//   1. emailRdvConfirme  → au Yopper (avec iCal joint)
//   2. emailNouveauRdvCommercant → au commercant si notif_mode='chaque'
//
// Appele par :
//   • Frontend /commander/rdv/[slug] apres insert direct RDV (sans acompte)
//   • Frontend /dashboard ModalNouveauRdv apres insert RDV manuel
//   (Le webhook Stripe envoie les emails directement, pas via cette route)
//
// Body : { rdv_id: UUID }
// Non-bloquant : si email fail, on log mais on retourne ok=true
// (la creation du RDV est deja faite, l'email est un nice-to-have).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailRdvConfirme, emailNouveauRdvCommercant } from '@/lib/resend'
import { generateRdvIcs, icsToBase64Attachment } from '@/lib/ical'

export async function POST(request) {
  try {
    const { rdv_id } = await request.json()
    if (!rdv_id) {
      return NextResponse.json({ ok: false, error: 'rdv_id requis' }, { status: 400 })
    }

    // Service role pour bypass RLS (la route est publique car appelee post-insert anonyme)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // Fetch RDV + jointures
    const { data: rdv, error: errRdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, numero_rdv, date_rdv, heure_debut, heure_fin, duree_minutes,
        prix_estime, acompte_paye, acompte_paye_en_ligne, acompte_montant,
        client_email, client_prenom, client_nom, client_telephone, notes_client,
        annulation_token,
        commercant:commercants(id, nom, slug, adresse, telephone, email, rdv_delai_annulation_heures, notif_mode),
        prestation:rdv_prestations(nom, duree_minutes)
      `)
      .eq('id', rdv_id)
      .single()

    if (errRdv || !rdv) {
      console.error('[emails/rdv-confirme] RDV introuvable', { rdv_id, errRdv })
      return NextResponse.json({ ok: false, error: 'RDV introuvable' }, { status: 404 })
    }

    // 1) Email Yopper avec iCal joint
    if (rdv.client_email) {
      try {
        const ics = generateRdvIcs({
          id: rdv.id,
          date_rdv: rdv.date_rdv,
          heure_debut: rdv.heure_debut,
          heure_fin: rdv.heure_fin,
          prestation_nom: rdv.prestation?.nom || 'Prestation',
          commercant_nom: rdv.commercant?.nom || '',
          commercant_adresse: rdv.commercant?.adresse || '',
          commercant_telephone: rdv.commercant?.telephone,
          commercant_email: rdv.commercant?.email,
          prix_estime: rdv.prix_estime,
          rappel_24h: true,
          status: 'CONFIRMED',
          method: 'REQUEST',
          sequence: 0,
        })
        const attachment = icsToBase64Attachment(ics, `rdv-${rdv.id}.ics`)

        const html = emailRdvConfirme({
          yopper_prenom:           rdv.client_prenom || 'Yopper',
          commercant_nom:          rdv.commercant?.nom || '',
          commercant_adresse:      rdv.commercant?.adresse || '',
          commercant_slug:         rdv.commercant?.slug || '',
          prestation_nom:          rdv.prestation?.nom || '',
          date_rdv:                rdv.date_rdv,
          heure_debut:             rdv.heure_debut,
          heure_fin:               rdv.heure_fin,
          duree_minutes:           rdv.duree_minutes,
          prix_estime:             rdv.prix_estime,
          acompte_paye:            !!(rdv.acompte_paye_en_ligne && rdv.acompte_montant),
          acompte_montant:         rdv.acompte_montant,
          delai_annulation_heures: rdv.commercant?.rdv_delai_annulation_heures || 24,
          annulation_token:        rdv.annulation_token,
        })

        await envoyerAuCommercant({   // helper reutilise, accepte n'importe quel 'to'
          to: rdv.client_email,
          subject: `Ton RDV chez ${rdv.commercant?.nom || 'le commerçant'} est confirmé`,
          html,
          attachments: [attachment],
        })
      } catch (e) {
        console.error('[emails/rdv-confirme] envoi Yopper KO', e)
      }
    }

    // 2) Email Commercant si notif_mode='chaque'
    if (rdv.commercant?.notif_mode === 'chaque' && rdv.commercant?.email) {
      try {
        const html = emailNouveauRdvCommercant({
          nom_commercant:  rdv.commercant.nom,
          yopper_prenom:   rdv.client_prenom,
          yopper_nom:      rdv.client_nom,
          yopper_email:    rdv.client_email,
          yopper_telephone:rdv.client_telephone,
          prestation_nom:  rdv.prestation?.nom,
          date_rdv:        rdv.date_rdv,
          heure_debut:     rdv.heure_debut,
          heure_fin:       rdv.heure_fin,
          duree_minutes:   rdv.duree_minutes,
          prix_estime:     rdv.prix_estime,
          acompte_paye:    !!(rdv.acompte_paye_en_ligne && rdv.acompte_montant),
          acompte_montant: rdv.acompte_montant,
          notes_client:    rdv.notes_client,
        })

        await envoyerAuCommercant({
          to: rdv.commercant.email,
          subject: `Nouveau RDV — ${rdv.client_prenom || 'Yopper'} ${formatDateCourte(rdv.date_rdv)} à ${rdv.heure_debut?.slice(0,5)}`,
          html,
        })
      } catch (e) {
        console.error('[emails/rdv-confirme] envoi Commercant KO', e)
      }
    }

    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error('[emails/rdv-confirme] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

// Format date court pour subject email : '13 juin'
function formatDateCourte(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })
}
