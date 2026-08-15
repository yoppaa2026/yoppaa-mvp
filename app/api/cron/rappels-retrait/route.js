// GET /api/cron/rappels-retrait
//
// ⚠️ CETTE ROUTE REMPLACE `non-retire-daily`, QUI ANNULAIT EN SILENCE.
//
// L'ancien travail nocturne basculait en « non retiré » TOUTE commande prête
// dont le jour de retrait était passé. Sans rappel, sans prévenir personne, et
// SANS RENDRE LE STOCK — trois chemins d'annulation appellent
// `restaurerStockVariantes`, celui-là n'en faisait pas partie. Chaque bascule
// retirait donc définitivement une pièce des rayons.
//
// Concrètement : un client à qui l'on disait « on te prévient dès qu'elle
// t'attend » voyait sa commande annulée à 2h30 du matin le lendemain. Il avait
// eu jusqu'à minuit.
//
// Décision d'Alex (11/08) : **aucune annulation automatique**. Le commerçant
// décide, et lui seul. Le rôle de ce cron est de RAPPELER :
//   • au client, à 24, 48 et 72 h en détail et en services, à 24 h en
//     alimentaire (un pain n'attend pas trois jours) ;
//   • au commerçant, par le vieillissement visible de la commande dans son
//     tableau de bord, qui ne dépend pas de ce cron.
//
// Les règles vivent dans `lib/rappels-retrait.js`, pures et testées.
//
// Sécurité : header Authorization: Bearer <CRON_SECRET>.
//
// ⚠️ HORAIRE : 09h00 UTC, soit 11h00 à Bruxelles. L'ancien cron tournait à
// 00h30 ; un rappel de retrait ne se lit pas à deux heures du matin. Même
// famille que le SMS de fidélité envoyé à 3h, corrigé le 05/08.
//
// ⚠️ ET L'EXPLICATION VIT ICI, PAS DANS `vercel.json`. Ce fichier suit un
// schéma STRICT : toute clé inconnue fait échouer le déploiement entier
// (« `crons[4]` should NOT have additional property »). On n'y commente rien.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailRappelRetrait } from '@/lib/resend'
import { envoyerPushParExternalId } from '@/lib/onesignal'
import { referenceCommande } from '@/lib/numero-commande'
import { rappelAEnvoyer, texteRappelRetrait, RAPPEL_TROP_TARD_HEURES } from '@/lib/rappels-retrait'
import { rdvPorteLesProduits } from '@/lib/ecran-retrait'
import { adresseRendezVous } from '@/lib/lieu-fige'

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || ''
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const maintenant = new Date()
    // On ne remonte pas plus loin que le plafond : au-delà, l'automate se tait,
    // inutile de rapatrier des commandes qu'on ne relancera pas.
    const depuis = new Date(maintenant.getTime() - (RAPPEL_TROP_TARD_HEURES + 1) * 3600 * 1000)

    const { data: commandes, error } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, numero_prefixe, pret_at, rappel_retrait_nb,
        client_email, client_prenom, client_nom, mode_retrait, rdv_reservation_id,
        lieu_id, lieu_libelle, lieu_adresse,
        commercant:commercants(nom, adresse, categorie),
        rdv:rdv_reservations!commandes_rdv_reservation_id_fkey(id, statut)
      `)
      .eq('statut', 'pret')
      .not('pret_at', 'is', null)
      .gte('pret_at', depuis.toISOString())
      // ⚠️ Une LIVRAISON ne se retire pas : le commerçant l'apporte. Lui
      // rappeler de « passer la chercher » n'aurait aucun sens.
      .neq('mode_retrait', 'livraison')

    if (error) {
      console.error('[cron/rappels-retrait] fetch KO', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    let envoyes = 0
    let ignores = 0
    const details = []

    for (const cmd of (commandes || [])) {
      // ⚠️ NE JAMAIS RÉCLAMER LE RETRAIT DE PRODUITS ATTENDUS AU FAUTEUIL.
      // Une commande passée dans le tunnel de rendez-vous se remet PENDANT la
      // prestation : « ta commande t'attend, viens la chercher » envoyé la
      // veille du rendez-vous est un contresens, et il enverrait le client
      // faire un déplacement pour rien.
      //
      // Le rappel redevient juste dès que le rendez-vous tombe : annulé avec
      // produits gardés, ou no-show. Les produits attendent alors vraiment en
      // boutique, et la commande a rejoint le chemin du retrait ordinaire.
      if (cmd.rdv_reservation_id && rdvPorteLesProduits(cmd.rdv)) { ignores++; continue }

      const decision = rappelAEnvoyer(cmd, maintenant)
      if (!decision) { ignores++; continue }

      const estAlimentaire = (cmd.commercant?.categorie || 'alimentaire') === 'alimentaire'
      const reference = referenceCommande(cmd)
      const texte = texteRappelRetrait({
        commercantNom: cmd.commercant?.nom,
        reference,
        palier: decision.palier,
        estAlimentaire,
      })

      // ⚠️ LE COMPTEUR EST POSÉ AVANT L'ENVOI, ET C'EST VOLONTAIRE. Si un email
      // part et que la mise à jour échoue ensuite, le client reçoit le même
      // rappel à chaque passage du cron, tous les jours. Dans l'autre sens, au
      // pire, il rate un rappel : c'est infiniment moins grave.
      const { error: errMaj } = await supabase
        .from('commandes')
        .update({
          rappel_retrait_nb: decision.rang,
          rappel_retrait_dernier_at: maintenant.toISOString(),
        })
        .eq('id', cmd.id)
        // Verrou : on ne pose le compteur que s'il n'a pas bougé entre-temps.
        // Deux exécutions concurrentes ne peuvent pas envoyer deux fois.
        .eq('rappel_retrait_nb', decision.rang - 1)
        .select('id')
        .maybeSingle()
      if (errMaj) {
        console.warn('[cron/rappels-retrait] compteur KO, rappel sauté', { id: cmd.id, error: errMaj.message })
        ignores++
        continue
      }

      if (cmd.client_email) {
        try {
          await envoyerAuCommercant({
            to: cmd.client_email,
            subject: `${texte.titre}${reference ? ` — #${reference}` : ''}`,
            html: emailRappelRetrait({
              yopper_prenom: cmd.client_prenom || 'Yopper',
              commercant_nom: cmd.commercant?.nom,
              commercant_adresse: adresseRendezVous({ ...cmd, commercant: cmd.commercant }),
              numero_commande: reference,
              palier: decision.palier,
              texte: texte.corps,
            }),
          })
        } catch (e) {
          console.error('[cron/rappels-retrait] email KO', { id: cmd.id, error: e?.message })
        }

        // Le push suit, en best-effort : le client n'a pas forcément accepté
        // les notifications, et Chrome sur iPhone ne les supporte pas.
        try {
          const { data: client } = await supabase
            .from('clients').select('id').eq('email', cmd.client_email).maybeSingle()
          if (client?.id) {
            await envoyerPushParExternalId(client.id, {
              headings: texte.titre,
              contents: texte.corps,
              url: '/commander?onglet=commandes',
              data: { kind: 'rappel_retrait', commande_id: cmd.id },
            })
          }
        } catch (e) {
          console.warn('[cron/rappels-retrait] push KO', { id: cmd.id, error: e?.message })
        }
      }

      envoyes++
      details.push({ commande: reference, palier: decision.palier })
    }

    console.info('[cron/rappels-retrait]', { examinees: commandes?.length || 0, envoyes, ignores, details })
    return NextResponse.json({ ok: true, examinees: commandes?.length || 0, envoyes, ignores, details })

  } catch (e) {
    console.error('[cron/rappels-retrait] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
