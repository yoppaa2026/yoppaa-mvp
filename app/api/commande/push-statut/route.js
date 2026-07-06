// POST /api/commande/push-statut
//
// Push OneSignal au Yopper à chaque changement de statut « commerçant » d'une
// commande C&C : en préparation, puis prête. Contenu auto-suffisant et actionnable,
// clic → onglet Commandes de l'app (pas la page du commerçant).
//
// Les transitions livraison (en route / livrée) ont leur propre route
// (/api/livraison/statut) car elles suivent statut_livraison. Le rappel avant
// retrait est géré par lib/rappels.js (send_after).
//
// Best-effort, non bloquant : l'UI commerçant a déjà écrit le statut en DB.
//
// Body : { commande_id: UUID, statut: 'en_preparation' | 'pret' }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerPushParExternalId } from '@/lib/onesignal'

const URL_COMMANDES = '/commander?onglet=commandes'

export async function POST(request) {
  try {
    const { commande_id, statut } = await request.json()
    if (!commande_id || !['en_preparation', 'pret'].includes(statut)) {
      return NextResponse.json({ ok: false, error: 'commande_id + statut valide requis' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: cmd, error } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, client_email, mode_retrait,
        commercant:commercants(nom),
        creneau:creneaux(heure_debut, heure_fin)
      `)
      .eq('id', commande_id)
      .single()

    if (error || !cmd) {
      return NextResponse.json({ ok: false, error: 'Commande introuvable' }, { status: 404 })
    }
    if (!cmd.client_email) {
      return NextResponse.json({ ok: true, skipped: 'no_email' })
    }

    const { data: client } = await supabase
      .from('clients').select('id').eq('email', cmd.client_email).single()
    if (!client?.id) {
      return NextResponse.json({ ok: true, skipped: 'no_client' })
    }

    const nom = cmd.commercant?.nom || 'le commerçant'
    const num = cmd.numero_commande || ''
    const estLivraison = cmd.mode_retrait === 'livraison'
    const creneauTxt = cmd.creneau?.heure_debut
      ? `${cmd.creneau.heure_debut.slice(0, 5)}${cmd.creneau.heure_fin ? ` – ${cmd.creneau.heure_fin.slice(0, 5)}` : ''}`
      : null

    let contenu
    if (statut === 'en_preparation') {
      contenu = {
        headings: '👨‍🍳 Ta commande est en préparation',
        contents: `${nom} prépare ta commande #${num}. On te prévient dès qu’elle est prête.`,
        data: { kind: 'commande_en_preparation', commande_id: cmd.id },
      }
    } else {
      // statut === 'pret'
      contenu = estLivraison
        ? {
            headings: '📦 Ta commande est prête',
            contents: `${nom} a terminé ta commande #${num}, elle part bientôt en livraison.`,
            data: { kind: 'commande_prete_livraison', commande_id: cmd.id },
          }
        : {
            headings: '🎉 Ta commande est prête à retirer',
            contents: `Va récupérer ta commande #${num} chez ${nom}${creneauTxt ? ` (créneau ${creneauTxt})` : ''}.`,
            data: { kind: 'commande_prete_retrait', commande_id: cmd.id },
          }
    }

    const res = await envoyerPushParExternalId(client.id, { ...contenu, url: URL_COMMANDES })
    return NextResponse.json({ ok: true, push: res })

  } catch (e) {
    console.error('[commande/push-statut] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
