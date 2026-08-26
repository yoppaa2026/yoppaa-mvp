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
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { envoyerPushParExternalId } from '@/lib/onesignal'
import { referenceCommande } from '@/lib/numero-commande'
import { nomTransporteur } from '@/lib/transporteurs'

const URL_COMMANDES = '/commander?onglet=commandes'

export async function POST(request) {
  try {
    const { commande_id, statut } = await request.json()
    // 🔴 `expediee` AJOUTÉ LE 26/08. Ce n'est pas un statut de la table : c'est
    // le moment où le colis part vraiment, et il n'envoyait AUCUN push. Voir le
    // détail plus bas, avec le message de retrait qu'un client d'expédition
    // recevait à sa place.
    if (!commande_id || !['en_preparation', 'pret', 'expediee'].includes(statut)) {
      return NextResponse.json({ ok: false, error: 'commande_id + statut valide requis' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ GARDE D AUTORISATION, POSEE LE 21/08 avec les dix autres. Cette route
    // n est appelee que par le tableau de bord : les trois mentions trouvees
    // ailleurs dans le code sont des COMMENTAIRES, pas des appels. Elle peut
    // donc exiger le jeton du commercant sans rien casser.
    const verdict = await gardeSurLigne(request, supabase, 'commandes', commande_id)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: cmd, error } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, numero_prefixe, client_email, mode_retrait,
        expedition_suivi, expedition_transporteur,
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
    // ⚠️ La MÊME référence qu'à l'écran, dans l'email et au tableau de bord.
    // Le numéro nu obligeait le client à deviner que son « #12 » et le « CC12 »
    // du commerçant désignaient la même commande.
    const num = referenceCommande(cmd) || ''
    const estLivraison = cmd.mode_retrait === 'livraison'
    // 🔴 L'EXPÉDITION N'ÉTAIT PAS DISTINGUÉE, ET C'EST TOUT LE DÉFAUT (Alex,
    // 26/08 : « les pushs d'expédition sont empruntés au tunnel de retrait »).
    // Le test portait sur `livraison` OU le reste, et un colis tombait donc
    // dans « le reste » : celui qui avait payé un envoi à domicile recevait
    // « Va récupérer ta commande chez X ». Il pouvait faire la route.
    const estExpedition = cmd.mode_retrait === 'expedition'
    const creneauTxt = cmd.creneau?.heure_debut
      ? `${cmd.creneau.heure_debut.slice(0, 5)}${cmd.creneau.heure_fin ? ` – ${cmd.creneau.heure_fin.slice(0, 5)}` : ''}`
      : null

    let contenu
    if (statut === 'en_preparation') {
      contenu = {
        headings: '👨‍🍳 Ta commande est en préparation',
        contents: estExpedition
          ? `${nom} prépare ton colis #${num}. On te prévient dès qu’il part.`
          : `${nom} prépare ta commande #${num}. On te prévient dès qu’elle est prête.`,
        data: { kind: 'commande_en_preparation', commande_id: cmd.id },
      }
    } else if (statut === 'expediee') {
      // 🔴 CE MESSAGE N'EXISTAIT PAS. Le colis partait, le numéro de suivi
      // était saisi, et le client n'en savait rien : il recevait un email et
      // c'est tout, alors que le push est justement ce qui se lit tout de
      // suite. ⚠️ Et on dit CHEZ QUI : un numéro de suivi seul ne se suit
      // nulle part.
      const porteur = nomTransporteur(cmd.expedition_transporteur)
      const suivi = String(cmd.expedition_suivi || '').trim()
      const precision = porteur && suivi ? ` ${porteur} · ${suivi}`
        : porteur ? ` par ${porteur}`
        : suivi ? ` Suivi : ${suivi}` : ''
      contenu = {
        headings: '📦 Ton colis est parti',
        contents: `${nom} vient d’expédier ta commande #${num}.${precision}`,
        data: { kind: 'commande_expediee', commande_id: cmd.id },
      }
    } else {
      // statut === 'pret'
      contenu = estExpedition
        ? {
            headings: '📦 Ton colis est prêt',
            contents: `${nom} a emballé ta commande #${num}. On te prévient dès qu’elle part.`,
            data: { kind: 'commande_prete_expedition', commande_id: cmd.id },
          }
        : estLivraison
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
