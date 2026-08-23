// LES NUMÉROS DE TÉLÉPHONE **PROUVÉS** D'UN YOPPER.
//
// ⚠️ CE FICHIER PORTE UNE RÈGLE DE SÉCURITÉ, PAS UN CONFORT. Il vivait dans
// `/api/fidelite/mes-cartes` et allait être recopié dans le tunnel de commande
// le 24/08. Une règle de sécurité recopiée, c'est une règle qui divergera : le
// jour où l'une se durcit, l'autre reste ouverte et personne ne le voit.
//
// ── CE QU'ELLE EMPÊCHE ────────────────────────────────────────────────────
//
// La carte de fidélité a pour clé un NUMÉRO DE GSM. Si l'on acceptait un
// numéro saisi librement, il suffirait de taper celui de son voisin pour lire
// sa cagnotte, la liste des commerces qu'il fréquente, et le JETON de chacune
// de ses cartes — jeton qui ouvre `/carte/<token>` sans aucune connexion et
// n'expire jamais.
//
// ⚠️ ET `clients.telephone` N'EN FAIT PAS PARTIE, C'ÉTAIT LA FAILLE D'ORIGINE.
// C'est une saisie libre : l'action `update-own` laisse y écrire n'importe
// quoi, et AUCUN flux de vérification par SMS n'existe dans le projet. On
// s'inscrivait comme Yopper ordinaire, on posait le numéro de quelqu'un
// d'autre dans son profil, et on demandait ses cartes.
//
// ⚠️ `identiteProuvee` NE PROTÈGE RIEN À ELLE SEULE ICI : l'identité de
// l'attaquant est parfaitement prouvée. C'est le NUMÉRO qui sélectionne les
// lignes, et c'est lui qui doit être prouvé.
//
// Un numéro est PROUVÉ quand il a servi à une commande ou à un rendez-vous
// passé sous cet email : quelqu'un l'a réellement utilisé pour être rappelé.

import { normaliserTelephone } from '@/lib/fidelite'

/**
 * @param {object} supabase client service_role
 * @param {string} email email du Yopper, déjà prouvé par le cookie signé
 * @returns {Promise<string[]>} numéros normalisés (+32…), sans doublon
 */
export async function telephonesProuves(supabase, email) {
  const propre = String(email || '').toLowerCase().trim()
  if (!propre) return []

  const tels = new Set()

  const { data: cmds } = await supabase
    .from('commandes').select('client_telephone')
    .eq('client_email', propre)
    .not('client_telephone', 'is', null)
    .limit(200)
  ;(cmds || []).forEach(c => {
    const t = normaliserTelephone(c.client_telephone)
    if (t) tels.add(t)
  })

  const { data: rdvs } = await supabase
    .from('rdv_reservations').select('client_telephone')
    .ilike('client_email', propre)
    .not('client_telephone', 'is', null)
    .limit(200)
  ;(rdvs || []).forEach(r => {
    const t = normaliserTelephone(r.client_telephone)
    if (t) tels.add(t)
  })

  return [...tels]
}
