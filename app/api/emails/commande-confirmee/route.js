// POST /api/emails/commande-confirmee
//
// Envoie 2 emails apres confirmation d'une commande C&C alim :
//   1. emailCommandeConfirmee → au Yopper
//   2. emailNouvelleCommandeCommercant → au commercant si notif_mode='chaque'
//
// Body : { commande_id: UUID }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { envoyerAuCommercant, emailCommandeConfirmee, emailNouvelleCommandeCommercant } from '@/lib/resend'
import { referenceCommande } from '@/lib/numero-commande'
import { adresseRendezVous } from '@/lib/lieu-fige'
// ⚠️ `commandes` N'A PAS DE COLONNE `client_prenom` : le nom complet vit
// dans `client_nom`. La demander faisait échouer TOUTE la requête, et la
// route annonçait « Commande introuvable » sur une commande bien présente.
import { prenomClient } from '@/lib/nom-client'

export async function POST(request) {
  try {
    const { commande_id } = await request.json()
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

    // Fetch commande + articles + commercant + creneau
    const { data: cmd, error: errCmd } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, numero_prefixe, total, date_commande,
        client_email, client_nom, client_telephone,
        annulation_token,
        lieu_id, lieu_libelle, lieu_adresse,
        commercant:commercants(id, nom, slug, adresse, email, notif_mode, delai_annulation_heures),
        creneau:creneaux(heure_debut, heure_fin),
        articles:commande_articles(quantite, prix_unitaire, prix_total, option_libelle, article:articles(nom))
      `)
      .eq('id', commande_id)
      .single()

    if (errCmd || !cmd) {
      console.error('[emails/commande-confirmee] Commande introuvable', { commande_id, errCmd })
      return NextResponse.json({ ok: false, error: 'Commande introuvable' }, { status: 404 })
    }

    // Mise a plat des articles pour le template
    const articlesFlat = (cmd.articles || []).map(a => ({
      nom:            a.article?.nom || '—',
      quantite:       a.quantite,
      option_libelle: a.option_libelle,
      prix_total:     a.prix_total,
    }))

    // Le CTA "crée un mot de passe" n'est offert qu'aux clients SANS compte Supabase
    // Auth (clients.auth_user_id NULL = pas de mot de passe possible aujourd'hui).
    let offrirMdp = false
    if (cmd.client_email) {
      const { data: cli } = await supabase.from('clients').select('auth_user_id').eq('email', cmd.client_email).maybeSingle()
      offrirMdp = !cli?.auth_user_id
    }

    // 1) Email Yopper
    if (cmd.client_email) {
      try {
        const html = emailCommandeConfirmee({
          yopper_prenom:           prenomClient(cmd) || 'Yopper',
          commercant_nom:          cmd.commercant?.nom || '',
          commercant_adresse:      adresseRendezVous({ ...cmd, commercant: cmd.commercant }),
          commercant_slug:         cmd.commercant?.slug || '',
          numero_commande:         referenceCommande(cmd),
          articles:                articlesFlat,
          total:                   cmd.total,
          date_retrait:            cmd.date_commande,
          heure_debut:             cmd.creneau?.heure_debut,
          heure_fin:               cmd.creneau?.heure_fin,
          annulation_token:        cmd.annulation_token,
          delai_annulation_heures: cmd.commercant?.delai_annulation_heures ?? 2,
          offrir_mdp:              offrirMdp,
        })

        await envoyerAuCommercant({
          to: cmd.client_email,
          subject: `Ta commande chez ${cmd.commercant?.nom || 'le commerçant'} est confirmée`,
          html,
        })
      } catch (e) {
        console.error('[emails/commande-confirmee] envoi Yopper KO', e)
      }
    }

    // 2) Email Commercant si notif_mode='chaque'
    if (cmd.commercant?.notif_mode === 'chaque' && cmd.commercant?.email) {
      try {
        const html = emailNouvelleCommandeCommercant({
          nom_commercant:  cmd.commercant.nom,
          yopper_prenom:   prenomClient(cmd),
          yopper_nom:      cmd.client_nom,
          yopper_email:    cmd.client_email,
          yopper_telephone:cmd.client_telephone,
          numero_commande: referenceCommande(cmd),
          articles:        articlesFlat,
          total:           cmd.total,
          date_retrait:    cmd.date_commande,
          heure_debut:     cmd.creneau?.heure_debut,
          heure_fin:       cmd.creneau?.heure_fin,
          // commandes n a PAS de colonne notes_client : la demander cassait TOUT le select.
          notes_client:    null,
        })

        await envoyerAuCommercant({
          to: cmd.commercant.email,
          subject: `Nouvelle commande #${referenceCommande(cmd) || ''} — ${prenomClient(cmd) || 'Yopper'}`,
          html,
        })
      } catch (e) {
        console.error('[emails/commande-confirmee] envoi Commercant KO', e)
      }
    }

    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error('[emails/commande-confirmee] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
