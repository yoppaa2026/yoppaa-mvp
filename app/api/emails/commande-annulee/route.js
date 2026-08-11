// POST /api/emails/commande-annulee
//
// Envoie 2 emails apres annulation client d'une commande C&C :
//   1. emailCommandeAnnuleeYopper      → au Yopper (confirmation + statut refund)
//   2. emailCommandeAnnuleeCommercant  → au commerçant (info + flag refund manuel si KO)
//
// Body : { commande_id, refund_status?, refund_error? }
//   - refund_status : 'succeeded' | 'pending' | null si pas de refund (paye_en_ligne=false)
//   - refund_error  : message si refund Stripe KO → flag refund_manuel=true dans les emails

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailCommandeAnnuleeYopper, emailCommandeAnnuleeCommercant } from '@/lib/resend'
import { referenceCommande } from '@/lib/numero-commande'

export async function POST(request) {
  try {
    const { commande_id, refund_status, refund_error } = await request.json()
    if (!commande_id) {
      return NextResponse.json({ ok: false, error: 'commande_id requis' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: cmd, error: errCmd } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, numero_prefixe, total, date_commande, paye_en_ligne,
        client_email, client_prenom, client_nom,
        commercant:commercants(id, nom, email, notif_mode),
        creneau:creneaux(heure_debut, heure_fin),
        articles:commande_articles(quantite, prix_unitaire, prix_total, option_libelle, article:articles(nom))
      `)
      .eq('id', commande_id)
      .single()

    if (errCmd || !cmd) {
      console.error('[emails/commande-annulee] Commande introuvable', { commande_id, errCmd })
      return NextResponse.json({ ok: false, error: 'Commande introuvable' }, { status: 404 })
    }

    const refundManuel = !!refund_error
    const articlesFlat = (cmd.articles || []).map(a => ({
      nom:            a.article?.nom || '—',
      quantite:       a.quantite,
      option_libelle: a.option_libelle,
      prix_total:     a.prix_total,
    }))

    // 1) Email Yopper
    if (cmd.client_email) {
      try {
        const html = emailCommandeAnnuleeYopper({
          yopper_prenom:   cmd.client_prenom || 'Yopper',
          commercant_nom:  cmd.commercant?.nom || '',
          numero_commande: referenceCommande(cmd),
          total:           cmd.total,
          refund_ok:       refund_status === 'succeeded' || refund_status === 'pending',
          refund_manuel:   refundManuel,
          paye_en_ligne:   !!cmd.paye_en_ligne,
        })
        await envoyerAuCommercant({
          to: cmd.client_email,
          subject: `Ta commande chez ${cmd.commercant?.nom || 'le commerçant'} a été annulée`,
          html,
        })
      } catch (e) {
        console.error('[emails/commande-annulee] envoi Yopper KO', e)
      }
    }

    // 2) Email Commerçant (toujours envoyé pour qu'il soit informé, peu importe notif_mode)
    if (cmd.commercant?.email) {
      try {
        const html = emailCommandeAnnuleeCommercant({
          nom_commercant:  cmd.commercant.nom,
          yopper_prenom:   cmd.client_prenom,
          yopper_nom:      cmd.client_nom,
          numero_commande: referenceCommande(cmd),
          articles:        articlesFlat,
          total:           cmd.total,
          date_retrait:    cmd.date_commande,
          heure_debut:     cmd.creneau?.heure_debut,
          heure_fin:       cmd.creneau?.heure_fin,
          refund_manuel:   refundManuel,
          paye_en_ligne:   !!cmd.paye_en_ligne,
        })
        await envoyerAuCommercant({
          to: cmd.commercant.email,
          subject: `Commande #${cmd.numero_commande || ''} annulée — ${cmd.client_prenom || 'Yopper'}`,
          html,
        })
      } catch (e) {
        console.error('[emails/commande-annulee] envoi Commerçant KO', e)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[emails/commande-annulee] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
