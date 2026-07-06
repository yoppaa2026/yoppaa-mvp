// Programmation des rappels push (OneSignal `send_after`) avant retrait / RDV.
//
// Décision Alex 05/07/2026 :
//   • C&C (retrait) : rappel 30 min avant le début du créneau.
//   • RDV / résa    : rappel 1h avant le début du RDV.
//   • Mécanisme     : OneSignal programmé (pas de cron), annulable si annulation
//                     (l'id renvoyé est stocké dans <table>.rappel_push_id).
//
// Ciblage : external_id OneSignal = clients.id, résolu depuis l'email (les
// commandes / RDV ne stockent pas de client_id). Best-effort : tout échec est
// non bloquant (le rappel n'est pas critique au point de casser un flux paiement).
//
// Chaque fonction reçoit un client Supabase admin (service_role) déjà construit
// par l'appelant (webhook, route dédiée).

import { envoyerPushParExternalId } from '@/lib/onesignal'
import { brusselsInstant } from '@/lib/timezone'

const RAPPEL_COMMANDE_MIN = 30   // minutes avant le créneau de retrait
const RAPPEL_RDV_MIN = 60        // minutes avant le RDV / la résa

// Résout clients.id (external_id OneSignal) depuis un email.
async function resoudreClientId(supabase, email) {
  if (!email) return null
  const { data } = await supabase.from('clients').select('id').eq('email', email).single()
  return data?.id || null
}

/**
 * Programme le rappel de retrait C&C (30 min avant le créneau). RETRAIT uniquement :
 * en livraison le Yopper reçoit « en route » / « livrée ». Stocke rappel_push_id.
 */
export async function programmerRappelCommande(commandeId, supabase) {
  try {
    const { data: cmd, error } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, client_email, mode_retrait, date_commande, rappel_push_id,
        commercant:commercants(nom, slug),
        creneau:creneaux(heure_debut)
      `)
      .eq('id', commandeId)
      .single()
    if (error || !cmd) return { ok: false, error: 'commande introuvable' }
    if (cmd.mode_retrait === 'livraison') return { ok: true, skipped: 'livraison' }
    if (cmd.rappel_push_id) return { ok: true, skipped: 'deja_programme' }
    if (!cmd.client_email || !cmd.creneau?.heure_debut || !cmd.date_commande) {
      return { ok: true, skipped: 'donnees_incompletes' }
    }

    const debut = brusselsInstant(cmd.date_commande, cmd.creneau.heure_debut)
    const sendAfter = new Date(debut.getTime() - RAPPEL_COMMANDE_MIN * 60000)
    if (isNaN(sendAfter.getTime()) || sendAfter.getTime() <= Date.now()) {
      return { ok: true, skipped: 'trop_tard' }
    }

    const clientId = await resoudreClientId(supabase, cmd.client_email)
    if (!clientId) return { ok: true, skipped: 'no_client' }

    const res = await envoyerPushParExternalId(clientId, {
      headings: '⏰ Retrait dans 30 min',
      contents: `N’oublie pas : retire ta commande #${cmd.numero_commande || ''} chez ${cmd.commercant?.nom || 'le commerçant'} vers ${cmd.creneau.heure_debut.slice(0,5)}.`,
      url: '/commander?onglet=commandes',
      data: { kind: 'commande_rappel', commande_id: cmd.id },
      send_after: sendAfter.toISOString(),
    })
    if (res?.ok && res.id) {
      await supabase.from('commandes').update({ rappel_push_id: res.id }).eq('id', cmd.id)
    }
    return res
  } catch (e) {
    console.warn('[rappels] programmerRappelCommande KO', e?.message)
    return { ok: false, error: e?.message || String(e) }
  }
}

/**
 * Programme le rappel de RDV / résa (1h avant). Ne programme que pour un RDV
 * confirmé et pas déjà programmé. Stocke rappel_push_id.
 */
export async function programmerRappelRdv(rdvId, supabase) {
  try {
    const { data: rdv, error } = await supabase
      .from('rdv_reservations')
      .select(`
        id, statut, date_rdv, heure_debut, client_email, rappel_push_id,
        commercant:commercants(nom, slug),
        prestation:rdv_prestations(nom)
      `)
      .eq('id', rdvId)
      .single()
    if (error || !rdv) return { ok: false, error: 'rdv introuvable' }
    if (rdv.statut !== 'confirme') return { ok: true, skipped: 'non_confirme' }
    if (rdv.rappel_push_id) return { ok: true, skipped: 'deja_programme' }
    if (!rdv.client_email || !rdv.heure_debut || !rdv.date_rdv) {
      return { ok: true, skipped: 'donnees_incompletes' }
    }

    const debut = brusselsInstant(rdv.date_rdv, rdv.heure_debut)
    const sendAfter = new Date(debut.getTime() - RAPPEL_RDV_MIN * 60000)
    if (isNaN(sendAfter.getTime()) || sendAfter.getTime() <= Date.now()) {
      return { ok: true, skipped: 'trop_tard' }
    }

    const clientId = await resoudreClientId(supabase, rdv.client_email)
    if (!clientId) return { ok: true, skipped: 'no_client' }

    const presta = rdv.prestation?.nom ? ` (${rdv.prestation.nom})` : ''
    const res = await envoyerPushParExternalId(clientId, {
      headings: '⏰ Ton rendez-vous dans 1h',
      contents: `Rappel : rendez-vous chez ${rdv.commercant?.nom || 'ton commerçant'} à ${rdv.heure_debut.slice(0,5)}${presta}. À tout à l’heure !`,
      url: '/commander?onglet=commandes&tab=rdvs',
      data: { kind: 'rdv_rappel', rdv_id: rdv.id },
      send_after: sendAfter.toISOString(),
    })
    if (res?.ok && res.id) {
      await supabase.from('rdv_reservations').update({ rappel_push_id: res.id }).eq('id', rdv.id)
    }
    return res
  } catch (e) {
    console.warn('[rappels] programmerRappelRdv KO', e?.message)
    return { ok: false, error: e?.message || String(e) }
  }
}
