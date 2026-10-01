// PRÉVENIR LE CLIENT ABSENT À LA LIVRAISON (01/10).
//
// ⚠️ ICI, ET PAS DANS UNE ROUTE À PART QUE L'ÉCRAN APPELLERAIT ENSUITE. Le
// message « personne n'a ouvert » ne part que de `/api/livraison/livrer`,
// juste après que l'écriture a réussi. Une route séparée ne pourrait pas
// vérifier qu'un livreur a vraiment sonné (une commande « prête, pas encore
// partie » ressemble trait pour trait à une commande revenue) : n'importe quel
// membre pourrait l'envoyer à volonté à n'importe quel client.
//
// Email ET notification : la notification ne marche pas partout (Chrome sur
// iPhone), et c'est le message qui demande au client d'agir.

import { envoyerAuYopper, emailLivraisonClientAbsent } from './resend'
import { envoyerPushParExternalId } from './onesignal'
import { referenceCommande } from './numero-commande'
import { prenomClient } from './nom-client'

/**
 * @param {object} [envois]  les envois réels par défaut ; le banc les remplace
 * @returns {Promise<{ email: boolean, push: boolean }>} ce qui est parti
 */
export async function prevenirClientAbsent(admin, commandeId, {
  envoyerEmail = envoyerAuYopper,
  envoyerPush = envoyerPushParExternalId,
} = {}) {
  const { data: cmd, error } = await admin.from('commandes')
    .select('id, numero_commande, numero_prefixe, client_email, client_nom, adresse_livraison, commercant:commercants(nom, telephone)')
    .eq('id', commandeId).maybeSingle()
  if (error || !cmd) {
    console.error('[livraison/absent] commande illisible', { commandeId, error: error?.message })
    return { email: false, push: false }
  }
  if (!cmd.client_email) return { email: false, push: false }

  const ref = referenceCommande(cmd) || ''
  const nomCommerce = cmd.commercant?.nom || 'ton commerçant'
  const telephone = cmd.commercant?.telephone || null

  const envoi = await envoyerEmail({
    to: cmd.client_email,
    subject: `Ta commande #${ref} n’a pas pu t’être remise`,
    html: emailLivraisonClientAbsent({
      yopper_prenom: prenomClient(cmd) || 'Yopper',
      commercant_nom: nomCommerce,
      numero_commande: ref,
      adresse_livraison: cmd.adresse_livraison,
      telephone,
    }),
  }).catch(e => ({ ok: false, error: e?.message }))
  if (!envoi?.ok) console.error('[livraison/absent] email KO', envoi?.error)

  let push = false
  try {
    const { data: client } = await admin.from('clients').select('id').eq('email', cmd.client_email).maybeSingle()
    if (client?.id) {
      const r = await envoyerPush(client.id, {
        headings: 'Personne à la porte',
        contents: `Ta commande #${ref} n’a pas pu t’être remise. Appelle ${nomCommerce}${telephone ? ` au ${telephone}` : ''} pour convenir de la suite.`,
        data: { kind: 'livraison_absent', commande_id: cmd.id },
        url: '/commander?onglet=commandes',
        high_priority: true,
      })
      push = !!r?.ok
    }
  } catch (e) {
    console.error('[livraison/absent] push KO', e?.message)
  }
  return { email: !!envoi?.ok, push }
}
