// POST /api/emails/commande-prete
//
// Envoie 1 email : emailCommandePrete au Yopper quand le commercant
// passe le statut de la commande a 'pret'.
//
// Body : { commande_id: UUID }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailCommandePrete } from '@/lib/resend'
import { envoyerPushParExternalId } from '@/lib/onesignal'

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
        id, numero_commande, client_email, client_prenom, mode_retrait,
        commercant:commercants(nom, slug, adresse),
        creneau:creneaux(heure_debut, heure_fin)
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

    // Push « ta commande est prête » — retrait uniquement. En livraison, le Yopper
    // reçoit déjà « en route » puis « livrée » (un push « prête » serait redondant).
    // Best-effort, non bloquant. Ciblage par external_id = clients.id (via email).
    if (cmd.mode_retrait !== 'livraison') {
      try {
        const { data: client } = await supabase
          .from('clients').select('id').eq('email', cmd.client_email).single()
        if (client?.id) {
          const heure = cmd.creneau?.heure_debut ? ` (créneau ${cmd.creneau.heure_debut.slice(0,5)})` : ''
          await envoyerPushParExternalId(client.id, {
            headings: '🎉 Ta commande est prête',
            contents: `Ta commande #${cmd.numero_commande || ''} t'attend chez ${cmd.commercant?.nom || 'le commerçant'}${heure}.`,
            url: cmd.commercant?.slug ? `/commander/${cmd.commercant.slug}` : '/commander',
            data: { kind: 'commande_prete', commande_id: cmd.id },
          })
        }
      } catch (e) {
        console.warn('[emails/commande-prete] push KO', e?.message)
      }
    }

    try {
      const html = emailCommandePrete({
        yopper_prenom:     cmd.client_prenom || 'Yopper',
        commercant_nom:    cmd.commercant?.nom || '',
        commercant_adresse:cmd.commercant?.adresse || '',
        commercant_slug:   cmd.commercant?.slug || '',
        numero_commande:   cmd.numero_commande,
        heure_debut:       cmd.creneau?.heure_debut,
        heure_fin:         cmd.creneau?.heure_fin,
      })

      await envoyerAuCommercant({
        to: cmd.client_email,
        subject: `🎉 Ta commande #${cmd.numero_commande || ''} est prête chez ${cmd.commercant?.nom || ''}`,
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
