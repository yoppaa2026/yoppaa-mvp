// DEUX GESTES D'APRÈS LA REMISE, CÔTÉ SERVEUR (équipe, 01/10).
//
// Le patron les écrivait depuis son navigateur ; l'équipe n'a aucun accès en
// écriture aux commandes. Une seule fonction pour les deux, appelée par
// `/api/commande/encaisser` et `/api/commande/retour-arriere`.
//
//   • `encaisserApresCoup` : une commande déjà remise sans que l'encaissement
//     ait été noté. Sans ce geste, un montant réellement encaissé restait à
//     jamais absent du journal comptable.
//   • `retourArriere` : la remise cliquée par erreur. La règle et ses raisons
//     vivent dans `retourArriereAutorise` (lib/tableau-de-bord) : on la RELIT,
//     on ne la recopie pas.
//
// 🔴 CHAQUE ÉCRITURE N'A LIEU QUE SI LA COMMANDE EST ENCORE CELLE QU'ON A LUE :
// deux appareils qui touchent ensemble n'encaissent pas deux fois, et ne
// défont pas deux fois.

import { resteAEncaisserCommande } from './rdv-paiement'
import { champsEncaissement } from './encaissement'
import { retourArriereAutorise } from './tableau-de-bord'

export const COLONNES_GESTE_COMMANDE = 'id, commercant_id, statut, statut_livraison, mode_retrait, total, paye_en_ligne, bon_cadeau_montant, fidelite_remise, encaisse_mode'

export const REFUS_GESTE = { introuvable: 404, refuse: 409, encaissement: 400, deja_fait: 409 }

async function lire(admin, commandeId, commercantId) {
  const { data, error } = await admin.from('commandes').select(COLONNES_GESTE_COMMANDE)
    .eq('id', commandeId).eq('commercant_id', commercantId).maybeSingle()
  if (error) throw new Error(`lecture de la commande : ${error.message}`)
  return data
}

/** Noter comment une commande DÉJÀ REMISE a été payée. */
export async function encaisserApresCoup(admin, { commandeId, commercantId, choix, maintenant = new Date() }) {
  const c = await lire(admin, commandeId, commercantId)
  if (!c) return { ok: false, code: 'introuvable', message: 'Commande introuvable.' }
  if (c.statut !== 'recupere' || c.encaisse_mode) {
    return { ok: false, code: 'refuse', message: 'Cette commande n’attend plus d’encaissement.' }
  }
  const r = champsEncaissement({ choix, reste: resteAEncaisserCommande(c), maintenant })
  if (r.refus) return { ok: false, code: 'encaissement', message: r.refus }
  if (!r.champs) return { ok: false, code: 'refuse', message: 'Il n’y a rien à encaisser sur cette commande.' }

  const { data: ecrit, error } = await admin.from('commandes').update(r.champs)
    .eq('id', c.id).eq('commercant_id', commercantId).eq('statut', 'recupere').is('encaisse_mode', null)
    .select('id').maybeSingle()
  if (error) throw new Error(`encaissement non écrit : ${error.message}`)
  if (!ecrit) return { ok: false, code: 'deja_fait', message: 'L’encaissement vient d’être noté par quelqu’un d’autre.' }
  return { ok: true, champs: r.champs }
}

/** Défaire une remise cliquée par erreur. */
export async function retourArriere(admin, { commandeId, commercantId }) {
  const c = await lire(admin, commandeId, commercantId)
  if (!c) return { ok: false, code: 'introuvable', message: 'Commande introuvable.' }
  const regle = retourArriereAutorise(c)
  if (!regle) return { ok: false, code: 'refuse', message: 'Cette commande ne peut pas revenir en arrière.' }

  const patch = { statut: regle.versStatut }
  if (regle.effaceStatutLivraison) patch.statut_livraison = null
  // ⚠️ LES TROIS COLONNES DU RELEVÉ PARTENT ENSEMBLE, et `paye_en_ligne`
  // n'en fait jamais partie (même règle que le tableau de bord).
  if (regle.effaceEncaissement) Object.assign(patch, { encaisse_mode: null, encaisse_montant: null, encaisse_le: null })

  const { data: ecrit, error } = await admin.from('commandes').update(patch)
    .eq('id', c.id).eq('commercant_id', commercantId).eq('statut', 'recupere')
    .select('id').maybeSingle()
  if (error) throw new Error(`retour arrière non écrit : ${error.message}`)
  if (!ecrit) return { ok: false, code: 'deja_fait', message: 'Cette commande vient d’être modifiée par quelqu’un d’autre.' }
  return { ok: true, champs: patch }
}
