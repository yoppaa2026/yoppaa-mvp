// POST /api/emails/commande-prete
//
// Envoie 1 email : emailCommandePrete au Yopper quand le commercant
// passe le statut de la commande a 'pret'.
//
// Body : { commande_id: UUID }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { envoyerAuCommercant, emailCommandePrete } from '@/lib/resend'
import { referenceCommande } from '@/lib/numero-commande'
import { adresseRendezVous } from '@/lib/lieu-fige'

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

    // ⚠️ LES CINQ COLONNES DE L'ARGENT SONT DANS CE SELECT, et elles doivent y
    // rester. Sans elles, `blocPaiementYopper` ne sait rien et se tait : l'email
    // « ta commande est prête », celui qu'on lit en enfilant sa veste,
    // repartirait muet sur le paiement. La colonne absente d'un select est LE
    // défaut le plus fréquent de ce projet, et il ne lève aucune erreur.
    const { data: cmd, error } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, numero_prefixe, client_email, client_prenom, mode_retrait,
        lieu_id, lieu_libelle, lieu_adresse,
        adresse_livraison,
        total, paye_en_ligne, bon_cadeau_montant, encaisse_mode, encaisse_montant,
        commercant:commercants(nom, slug, adresse),
        creneau:creneaux(heure_debut, heure_fin),
        creneau_livraison:livraison_creneaux(heure_debut, heure_fin)
      `)
      .eq('id', commande_id)
      .single()

    if (error || !cmd) {
      console.error('[emails/commande-prete] Commande introuvable', { commande_id, error })
      return NextResponse.json({ ok: false, error: 'Commande introuvable' }, { status: 404 })
    }

    if (!cmd.client_email) {
      return NextResponse.json({ ok: true, skipped: 'no_email' })
    }
    // NB : le push « prête » est envoyé par /api/commande/push-statut (mode-aware,
    // clic vers l'onglet Commandes). Cette route ne gère que l'email.

    // ⚠️ L'HEURE VIENT DE LA BONNE TABLE. Une livraison a `creneau_id` à null
    // et son horaire dans `livraison_creneaux` : en lisant `creneaux`, le
    // message affichait « ? → ? » à tous les clients en livraison.
    const estLivraison = cmd.mode_retrait === 'livraison'
    const creneau = estLivraison ? cmd.creneau_livraison : cmd.creneau

    try {
      const html = emailCommandePrete({
        yopper_prenom:     cmd.client_prenom || 'Yopper',
        commercant_nom:    cmd.commercant?.nom || '',
        commercant_adresse:adresseRendezVous({ ...cmd, commercant: cmd.commercant }),
        commercant_slug:   cmd.commercant?.slug || '',
        numero_commande:   referenceCommande(cmd),
        heure_debut:       creneau?.heure_debut,
        heure_fin:         creneau?.heure_fin,
        est_livraison:     estLivraison,
        adresse_livraison: cmd.adresse_livraison,
        paiement:          cmd,
      })

      await envoyerAuCommercant({
        to: cmd.client_email,
        // Dire « prête » à quelqu'un qui ne se déplace pas ne veut rien dire :
        // ce qu'il attend, c'est de savoir que ça part.
        subject: estLivraison
          ? `🛵 Ta commande #${referenceCommande(cmd) || ''} est prête, livraison en préparation`
          : `🎉 Ta commande #${referenceCommande(cmd) || ''} est prête chez ${cmd.commercant?.nom || ''}`,
        html,
      })
    } catch (e) {
      console.error('[emails/commande-prete] envoi KO', e)
    }

    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error('[emails/commande-prete] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
