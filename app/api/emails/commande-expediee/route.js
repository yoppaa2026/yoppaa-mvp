// POST /api/emails/commande-expediee
//
// Prévient le Yopper que son colis est parti, avec le numéro de suivi si le
// commerçant en a saisi un. Boutique détail, mode expédition.
//
// ⚠️ POURQUOI CETTE ROUTE EXISTE. L'expédition était le SEUL mode sans aucune
// nouvelle. Un client en retrait reçoit « ta commande est prête », un client en
// livraison reçoit « le commerçant vient de partir ». Celui qui avait payé un
// colis n'était prévenu de rien : le commerçant marquait la commande expédiée,
// saisissait un numéro de suivi, et ce numéro ne quittait jamais le tableau de
// bord. Le client ne pouvait le découvrir qu'en revenant de lui-même sur le
// site ouvrir sa liste de commandes.
//
// Body : { commande_id: UUID }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailCommandeExpediee } from '@/lib/resend'
import { referenceCommande } from '@/lib/numero-commande'

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

    const { data: cmd, error } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, numero_prefixe, client_email, client_prenom, mode_retrait,
        adresse_livraison, expedition_suivi,
        commercant:commercants(nom, slug)
      `)
      .eq('id', commande_id)
      .single()

    if (error || !cmd) {
      console.error('[emails/commande-expediee] Commande introuvable', { commande_id, error })
      return NextResponse.json({ ok: false, error: 'Commande introuvable' }, { status: 404 })
    }

    // Un client peut commander sans compte ni adresse mail : on ne fabrique pas
    // d'erreur pour autant, la commande reste parfaitement valide.
    if (!cmd.client_email) {
      return NextResponse.json({ ok: true, skipped: 'no_email' })
    }

    // ⚠️ On ne dit « ton colis est parti » qu'à une commande RÉELLEMENT expédiée.
    // Le tableau de bord n'appelle cette route que dans ce cas, mais une route
    // qui croit son appelant sur parole finit par envoyer le mauvais message au
    // mauvais client.
    if (cmd.mode_retrait !== 'expedition') {
      return NextResponse.json({ ok: true, skipped: 'pas_une_expedition' })
    }

    try {
      const html = emailCommandeExpediee({
        yopper_prenom:     cmd.client_prenom || 'Yopper',
        commercant_nom:    cmd.commercant?.nom || '',
        numero_commande:   referenceCommande(cmd),
        expedition_suivi:  cmd.expedition_suivi,
        adresse_livraison: cmd.adresse_livraison,
      })

      await envoyerAuCommercant({
        to: cmd.client_email,
        subject: `📦 Ton colis #${cmd.numero_commande || ''} est parti de chez ${cmd.commercant?.nom || ''}`,
        html,
      })
    } catch (e) {
      console.error('[emails/commande-expediee] envoi KO', e)
    }

    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error('[emails/commande-expediee] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
