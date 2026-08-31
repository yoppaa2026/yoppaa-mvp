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
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { envoyerAuCommercant, emailRdvAnnule } from '@/lib/resend'
import { generateRdvIcs, icsToBase64Attachment } from '@/lib/ical'
import { annulerPush } from '@/lib/onesignal'
import { adresseRendezVous } from '@/lib/lieu-fige'

export async function POST(request) {
  try {
    const body = await request.json()
    // ⚠️ LES MONTANTS VIENNENT DE L'APPELANT, ET C'EST VOULU : seule la route
    // qui a remboursé sait ce que Stripe a repris et ce qui est retourné sur le
    // bon. Ils sont purement DESCRIPTIFS, aucune écriture n'en dépend, donc
    // rien ne se joue si un appelant les oublie : l'email se rabat alors sur
    // l'acompte, comme avant.
    const {
      rdv_id, raison_annulation = 'commercant', refund_en_cours = false,
      refund_montant = null, bon_rendu = 0, recompense_rendue = 0, produits_montant = 0,
    } = body
    if (!rdv_id) return NextResponse.json({ ok: false, error: 'rdv_id requis' }, { status: 400 })

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

    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, date_rdv, heure_debut, heure_fin, acompte_paye_en_ligne, acompte_montant,
        client_email, client_prenom, rappel_push_id,
        lieu_id, lieu_libelle, lieu_adresse,
        commercant:commercants(nom, slug, adresse, telephone, email, categorie),
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
      commercant_categorie: rdv.commercant?.categorie || null,
      prestation_nom:    rdv.prestation?.nom || '',
      date_rdv:          rdv.date_rdv,
      heure_debut:       rdv.heure_debut,
      acompte_paye:      !!(rdv.acompte_paye_en_ligne && rdv.acompte_montant),
      acompte_montant:   rdv.acompte_montant,
      refund_en_cours,
      raison_annulation,
      refund_montant,
      bon_rendu,
      // 🔴 AJOUTÉE LE 30/08 : la récompense revenait sans que rien ne le dise.
      // Frère exact du bon cadeau, corrigé la veille et jamais porté à côté.
      recompense_rendue,
      produits_montant,
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
