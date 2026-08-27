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

    // ⚠️ LES CINQ COLONNES DE L'ARGENT SONT DANS CE SELECT, et elles doivent y
    // rester. Sans elles, `blocPaiementYopper` ne sait rien et se tait : l'email
    // « ta commande est prête », celui qu'on lit en enfilant sa veste,
    // repartirait muet sur le paiement. La colonne absente d'un select est LE
    // défaut le plus fréquent de ce projet, et il ne lève aucune erreur.
    const { data: cmd, error } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, numero_prefixe, client_email, client_nom, mode_retrait,
        lieu_id, lieu_libelle, lieu_adresse,
        adresse_livraison,
        total, paye_en_ligne, bon_cadeau_montant, fidelite_remise, encaisse_mode, encaisse_montant,
        commercant:commercants(nom, slug, adresse),
        creneau:creneaux(heure_debut, heure_fin),
        creneau_livraison:livraison_creneaux(heure_debut, heure_fin)
      `)
      .eq('id', commande_id)
      .single()

    // 🔴 UN SEUL MESSAGE POUR DEUX CAUSES OPPOSÉES (Alex, 27/08 : la ligne
    // d'avertissement disait « Commande introuvable » sur une commande qui
    // s'affichait à l'écran, dont le push venait de partir, et dont la garde
    // d'autorisation avait reconnu le propriétaire).
    //
    // ⚠️ `error` ET `!cmd` NE DISENT PAS LA MÊME CHOSE :
    //   • `!cmd`  → la ligne n'existe pas. C'est un 404, et c'est rare.
    //   • `error` → la REQUÊTE a échoué : une colonne absente, une relation que
    //     PostgREST ne sait pas résoudre. La commande, elle, est bien là.
    //
    // Les confondre envoie chercher au mauvais endroit : on regarde la
    // commande alors que c'est le `select` qui est fautif. C'est la même
    // famille que « la colonne absente d'un select », en plus sournois, parce
    // qu'ici l'erreur EXISTE et qu'on la remplace par une phrase inventée.
    // ⚠️ ET `.single()` BROUILLE LES DEUX : sur zéro ligne, il ne rend pas
    // `data: null`, il rend une ERREUR (`PGRST116`). Sans ce test, une commande
    // réellement absente serait annoncée comme un défaut de requête, et on
    // chercherait un bogue là où il n'y en a pas.
    if (error?.code === 'PGRST116' || (!error && !cmd)) {
      console.error('[emails/commande-prete] commande absente', { commande_id })
      return NextResponse.json({ ok: false, error: 'Commande introuvable' }, { status: 404 })
    }
    if (error) {
      console.error('[emails/commande-prete] requête refusée', { commande_id, error })
      return NextResponse.json(
        // ⚠️ SEULEMENT `message` : `details` et `hint` de PostgREST recopient
        // volontiers la requête, donc des noms de colonnes et des valeurs.
        { ok: false, error: `lecture impossible : ${error.message || error.code || 'erreur inconnue'}` },
        { status: 500 }
      )
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
    // 🔴 ET L'EXPÉDITION, QUI TOMBAIT DANS « LE RESTE » (Alex, 26/08). Le
    // client d'un colis recevait le message du RETRAIT : l'adresse du magasin,
    // un itinéraire, et « à tout de suite ».
    const estExpedition = cmd.mode_retrait === 'expedition'
    const creneau = estLivraison ? cmd.creneau_livraison : cmd.creneau

    try {
      const html = emailCommandePrete({
        yopper_prenom:     prenomClient(cmd) || 'Yopper',
        commercant_nom:    cmd.commercant?.nom || '',
        commercant_adresse:adresseRendezVous({ ...cmd, commercant: cmd.commercant }),
        commercant_slug:   cmd.commercant?.slug || '',
        numero_commande:   referenceCommande(cmd),
        heure_debut:       creneau?.heure_debut,
        heure_fin:         creneau?.heure_fin,
        est_livraison:     estLivraison,
        est_expedition:    estExpedition,
        adresse_livraison: cmd.adresse_livraison,
        paiement:          cmd,
      })

      // 🔴 ON LIT LE RÉSULTAT, ET C'EST TOUTE LA CORRECTION DU 27/08.
      //
      // Alex : « le mail colis prêt n'arrive pas ». Il avait raison, et
      // personne ne pouvait le savoir : QUATRE COUCHES SE PASSAIENT LE
      // SILENCE, chacune poliment.
      //
      //   1. `envoyer()` (lib/resend.js) NE LÈVE JAMAIS : il attrape l'erreur
      //      Resend et rend `{ ok: false, error }` ;
      //   2. cette route ne lisait pas ce retour, donc son `try/catch`
      //      n'attrapait rien — il n'y avait rien à attraper ;
      //   3. elle rendait `{ ok: true }` quoi qu'il arrive ;
      //   4. et le navigateur écrivait `postPro(...).catch(...)`, qui ne se
      //      déclenche pas sur un code HTTP.
      //
      // ⚠️ UN `await` DONT ON NE LIT PAS LE RÉSULTAT N'EST PAS UN ENVOI, C'EST
      // UN ESPOIR. La même phrase que pour l'écriture du forfait le 26/08 :
      // c'est le même défaut, dans l'autre sens.
      const envoi = await envoyerAuCommercant({
        to: cmd.client_email,
        // Dire « prête » à quelqu'un qui ne se déplace pas ne veut rien dire :
        // ce qu'il attend, c'est de savoir que ça part.
        subject: estExpedition
          ? `📦 Ton colis #${referenceCommande(cmd) || ''} est emballé chez ${cmd.commercant?.nom || ''}`
          : estLivraison
          ? `🛵 Ta commande #${referenceCommande(cmd) || ''} est prête, livraison en préparation`
          : `🎉 Ta commande #${referenceCommande(cmd) || ''} est prête chez ${cmd.commercant?.nom || ''}`,
        html,
      })
      if (!envoi?.ok) {
        // ⚠️ 502 ET PAS 500 : ce n'est pas nous qui avons échoué, c'est le
        // service d'envoi. Le distinguer évite de chercher le défaut ici.
        const detail = typeof envoi?.error === 'string'
          ? envoi.error
          : (envoi?.error?.message || envoi?.error?.name || 'refus du service d’envoi')
        console.error('[emails/commande-prete] envoi refusé', { to: cmd.client_email, detail })
        return NextResponse.json({ ok: false, error: detail }, { status: 502 })
      }
    } catch (e) {
      // Il reste le cas où c'est la COMPOSITION qui casse, pas l'envoi.
      console.error('[emails/commande-prete] exception de composition', e)
      return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error('[emails/commande-prete] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
