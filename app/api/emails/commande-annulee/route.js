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
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { envoyerAuCommercant, emailCommandeAnnuleeYopper, emailCommandeAnnuleeCommercant } from '@/lib/resend'
import { referenceCommande } from '@/lib/numero-commande'
// ⚠️ `commandes` N'A PAS DE COLONNE `client_prenom` : le nom complet vit
// dans `client_nom`. La demander faisait échouer TOUTE la requête, et la
// route annonçait « Commande introuvable » sur une commande bien présente.
import { prenomClient } from '@/lib/nom-client'

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

    // ⚠️ GARDE D'AUTORISATION, POSÉE LE 21/08. Cette route n'en avait AUCUNE :
    // ni jeton, ni cookie, ni secret. Elle prenait un identifiant dans le corps
    // de la requête, chargeait la ligne avec la CLÉ DE SERVICE — qui ignore la
    // RLS — et faisait partir l'email. Le client qui possède le numéro de sa
    // propre commande pouvait donc déclencher n'importe lequel de ces envois,
    // vers le commerçant comme vers lui-même, autant de fois qu'il voulait.
    // La règle vit dans lib/api-auth.js, pour les dix routes à la fois.
    const verdict = await gardeSurLigne(request, supabase, 'commandes', commande_id)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: cmd, error: errCmd } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, numero_prefixe, total, date_commande, paye_en_ligne,
        client_email, client_nom,
        fidelite_remise, bon_cadeau_montant, bons_utilises,
        commercant:commercants(id, nom, email, notif_mode, categorie),
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
          yopper_prenom:   prenomClient(cmd) || 'Yopper',
          commercant_nom:  cmd.commercant?.nom || '',
          commercant_categorie: cmd.commercant?.categorie || null,
          numero_commande: referenceCommande(cmd),
          total:           cmd.total,
          // ⚠️ SANS CES DEUX COLONNES LE GABARIT SE TAIT EN SILENCE :
          // `Number(undefined)` n'est pas fini, la ligne ne sort pas, et
          // personne ne voit d'erreur. Le select ci-dessus les charge.
          fidelite_remise:    cmd.fidelite_remise,
          bon_cadeau_montant: cmd.bon_cadeau_montant,
          // 🔴 COMBIEN DE BONS, pour que la phrase se mette au pluriel. Sans ce
          // nombre, une commande payée par trois bons annonce « ton bon » : le
          // Yopper en cherche un seul et croit avoir perdu les deux autres.
          nb_bons:            (cmd.bons_utilises || []).length,
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
          commercant_categorie: cmd.commercant?.categorie || null,
          yopper_prenom:   prenomClient(cmd),
          yopper_nom:      cmd.client_nom,
          numero_commande: referenceCommande(cmd),
          articles:        articlesFlat,
          total:           cmd.total,
          date_retrait:    cmd.date_commande,
          // ⚠️ UNE COMMANDE DE BOUTIQUE DE DÉTAIL N'A PAS DE CRÉNEAU : ces deux
          // valeurs sont `undefined`, et le gabarit ne rend plus la ligne
          // plutôt que d'écrire « ? → ? » (Alex, 26/08).
          heure_debut:     cmd.creneau?.heure_debut,
          heure_fin:       cmd.creneau?.heure_fin,
          fidelite_remise:    cmd.fidelite_remise,
          bon_cadeau_montant: cmd.bon_cadeau_montant,
          nb_bons:            (cmd.bons_utilises || []).length,
          refund_manuel:   refundManuel,
          paye_en_ligne:   !!cmd.paye_en_ligne,
        })
        await envoyerAuCommercant({
          to: cmd.commercant.email,
          subject: `Commande #${referenceCommande(cmd) || ''} annulée — ${prenomClient(cmd) || 'Yopper'}`,
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
