// POST /api/livraison/statut
//
// Notifie le Yopper (push OneSignal) quand le commerçant fait avancer le statut
// de livraison de sa commande : « en route » puis « livrée ».
//
// Best-effort et non bloquant : l'UI commerçant a déjà mis à jour le statut en DB
// (voir changerStatutLivraison dans app/dashboard/page.js). Cette route ne fait
// QUE le push ; un échec push ne doit jamais casser le flux.
//
// Body : { commande_id: UUID, statut_livraison: 'en_livraison' | 'livree' }
//
// Ciblage : par external_id OneSignal = clients.id, résolu depuis client_email de
// la commande (les commandes ne stockent pas de client_id).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerPushParExternalId } from '@/lib/onesignal'
import { envoyerAuCommercant, emailCommandeEnLivraison } from '@/lib/resend'

export async function POST(request) {
  try {
    const { commande_id, statut_livraison } = await request.json()
    if (!commande_id || !['en_livraison', 'livree'].includes(statut_livraison)) {
      return NextResponse.json({ ok: false, error: 'commande_id + statut_livraison valide requis' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: cmd, error } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, client_email, client_nom, client_prenom,
        adresse_livraison,
        commercant:commercants(nom, slug),
        creneau_livraison:livraison_creneaux(heure_debut, heure_fin)
      `)
      .eq('id', commande_id)
      .single()

    if (error || !cmd) {
      console.error('[livraison/statut] commande introuvable', { commande_id, error })
      return NextResponse.json({ ok: false, error: 'Commande introuvable' }, { status: 404 })
    }

    // ⚠️ L'EMAIL PART AVANT LE PUSH, ET INDÉPENDAMMENT DE LUI.
    // Ce changement de statut n'était notifié QUE par push. Or le push web ne
    // fonctionne pas partout — Chrome sur iPhone ne le supporte pas — et un
    // Yopper qui n'a jamais accepté les notifications n'était prévenu de RIEN.
    // C'est pourtant le message qu'il ne faut pas rater : celui qui dit de
    // rester joignable parce que le commerçant est parti.
    //
    // « Livrée » ne déclenche pas d'email : le client vient de recevoir sa
    // commande en main propre, lui écrire pour le lui apprendre n'apporte rien.
    if (statut_livraison === 'en_livraison' && cmd.client_email) {
      try {
        await envoyerAuCommercant({
          to: cmd.client_email,
          subject: `🛵 Ta commande #${cmd.numero_commande || ''} arrive`,
          html: emailCommandeEnLivraison({
            yopper_prenom: cmd.client_prenom || 'Yopper',
            commercant_nom: cmd.commercant?.nom || 'ton commerçant',
            numero_commande: cmd.numero_commande,
            adresse_livraison: cmd.adresse_livraison,
            heure_debut: cmd.creneau_livraison?.heure_debut,
            heure_fin: cmd.creneau_livraison?.heure_fin,
          }),
        })
      } catch (e) {
        console.error('[livraison/statut] email en route KO', e?.message)
      }
    }

    // Résolution external_id = clients.id via l'email de la commande.
    if (!cmd.client_email) {
      return NextResponse.json({ ok: true, skipped: 'no_email' })
    }
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('email', cmd.client_email)
      .single()

    if (!client?.id) {
      return NextResponse.json({ ok: true, skipped: 'no_client' })
    }

    const nomCommerce = cmd.commercant?.nom || 'ton commerçant'
    // Clic → onglet Commandes de l'app (où le Yopper confirme la réception).
    const url = '/commander?onglet=commandes'

    const contenu = statut_livraison === 'en_livraison'
      ? {
          headings: '🛵 Ta commande arrive',
          contents: `${nomCommerce} est parti te livrer ta commande #${cmd.numero_commande || ''}. Prépare-toi à la réceptionner et confirme la réception dans l’app.`,
          data: { kind: 'livraison_en_route', commande_id: cmd.id },
        }
      : {
          headings: '✅ Commande livrée',
          contents: `Ta commande #${cmd.numero_commande || ''} de chez ${nomCommerce} a été livrée. Bon appétit !`,
          data: { kind: 'livraison_livree', commande_id: cmd.id },
        }

    const res = await envoyerPushParExternalId(client.id, { ...contenu, url, high_priority: true })

    // On renvoie toujours 200 : le push est best-effort, le statut est déjà en DB.
    return NextResponse.json({ ok: true, push: res })

  } catch (e) {
    console.error('[livraison/statut] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
