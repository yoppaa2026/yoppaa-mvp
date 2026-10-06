// LIVRER UNE COMMANDE, CÔTÉ SERVEUR (équipe, étape 4, 01/10).
//
// La règle est dans `lib/livraison-geste.js` ; ici, on relit la commande en
// base, on l'applique, et on écrit. Appelé par `/api/livraison/livrer`, pour
// le patron comme pour le livreur.
//
// 🔴 L'ÉCRITURE NE PASSE QUE SI LA COMMANDE EST ENCORE CELLE QU'ON A LUE :
// même statut, même étape de livraison, même commerce. Le patron et le livreur
// qui touchent « Livrée » ensemble ne l'encaissent pas deux fois.

import { champsLivraison, GESTES_LIVRAISON } from './livraison-geste'

// Ce que lisent la règle et `resteAEncaisserCommande`, et rien d'autre.
// `date_commande` (06/10) : la règle refuse une livraison d'un jour futur.
export const COLONNES_LIVRAISON = 'id, commercant_id, statut, statut_livraison, mode_retrait, date_commande, total, paye_en_ligne, bon_cadeau_montant, fidelite_remise, encaisse_mode'

export const REFUS_LIVRAISON = {
  invalide: 400,
  introuvable: 404,
  refuse: 409,
  encaissement: 400,
  deja_fait: 409,
}

/**
 * @param {object} admin   client Supabase (clé de service), filtré ici par commerce
 * @param {object} o
 * @param {string} o.commandeId
 * @param {string} o.commercantId  le commerce de l'appelant (garde de la route)
 * @param {string} o.vers          'en_livraison' | 'livree'
 * @param {string|null} o.encaissement  'terminal' | 'especes' | 'sans_paiement'
 * @returns {Promise<{ ok: boolean, code?: string, message?: string, champs?: object, avant?: object }>}
 */
export async function livrerCommande(admin, { commandeId, commercantId, vers, encaissement = null, maintenant = new Date() }) {
  if (!commandeId || !commercantId || !GESTES_LIVRAISON.includes(vers)) {
    return { ok: false, code: 'invalide', message: 'Commande et étape de livraison requises.' }
  }
  const { data: c, error } = await admin.from('commandes').select(COLONNES_LIVRAISON)
    .eq('id', commandeId).eq('commercant_id', commercantId).maybeSingle()
  if (error) throw new Error(`lecture de la commande : ${error.message}`)
  if (!c) return { ok: false, code: 'introuvable', message: 'Commande introuvable.' }

  const { champs, refus } = champsLivraison(c, vers, { encaissement, maintenant })
  if (refus) {
    const code = /Dis comment le client a payé/.test(refus) ? 'encaissement' : 'refuse'
    return { ok: false, code, message: refus }
  }

  let ecriture = admin.from('commandes').update(champs)
    .eq('id', commandeId).eq('commercant_id', commercantId).eq('statut', c.statut)
  ecriture = c.statut_livraison
    ? ecriture.eq('statut_livraison', c.statut_livraison)
    : ecriture.is('statut_livraison', null)
  const { data: ecrit, error: errMaj } = await ecriture.select('id').maybeSingle()
  if (errMaj) throw new Error(`commande non mise à jour : ${errMaj.message}`)
  if (!ecrit) return { ok: false, code: 'deja_fait', message: 'Cette livraison vient d’être traitée par quelqu’un d’autre.' }

  return { ok: true, champs, avant: { statut: c.statut, statut_livraison: c.statut_livraison || null } }
}
