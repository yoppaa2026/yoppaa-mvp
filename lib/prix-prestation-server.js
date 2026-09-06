// LE PRIX D'UNE PRESTATION QUAND LE SERVEUR DÉCIDE.
//
// 🔴 POURQUOI CE FICHIER EXISTE. Depuis le 06/09, un deal peut viser une
// prestation de rendez-vous. Trois routes serveur calculent ce que le client
// paie — `rdv/reserver`, `create-rdv-acompte`, `create-rdv-commande` — et
// toutes les trois lisaient `prestation.prix` en base, c'est-à-dire le prix
// PLEIN. Sans ce module, l'écran aurait affiché « -20 % » et la carte aurait
// été débitée du tarif complet.
//
// ⚠️ L'ÉCRAN CALCULE, LE SERVEUR DÉCIDE. Le prix affiché sur la fiche n'engage
// rien : il sert à ce que le client sache ce qu'il va payer avant d'arriver sur
// Stripe. Le montant qui compte se recalcule ici, à partir de la base.
//
// ⚠️ UN SEUL CHARGEMENT POUR LES TROIS ROUTES. Trois copies auraient divergé au
// premier ajustement — c'est précisément le défaut qui a fait naître
// `lib/deals.js` le 03/08, quand quatre écrans interprétaient chacun une remise
// à leur façon.
//
// ⚠️ ET IL NE LIT QUE `yoppaa_deals`, aucune table à données personnelles.

import { prixEffectifPrestation, remiseSurPrestation } from './deals'
import { jourBruxelles } from './timezone'

/**
 * Le prix d'une prestation, remise du jour comprise.
 *
 * ⚠️ ON NE CHARGE QUE LES DEALS DE CETTE PRESTATION. Charger tout le catalogue
 * pour n'en garder qu'un serait payer une lecture large sur un chemin d'argent
 * appelé à chaque réservation.
 *
 * 🔴 ET UNE LECTURE QUI ÉCHOUE NE BRADE RIEN. Si la base ne répond pas, on rend
 * le prix PLEIN : mieux vaut ne pas appliquer une remise que la deviner. Un
 * `error` non lu est un espoir, pas une action, et ici l'espoir vaut de
 * l'argent qui part du mauvais côté.
 *
 * @param {object} supabase le client déjà construit par la route
 * @param {object} prestation la ligne `rdv_prestations` (id, prix, commercant_id)
 * @param {string} [jourISO] le jour à considérer, belge par défaut
 * @returns {Promise<{prix:number|null, remise:object|null, deals:Array}>}
 */
export async function prixPrestationServeur(supabase, prestation, jourISO = jourBruxelles()) {
  const plein = prestation?.prix != null ? Number(prestation.prix) : null
  if (!prestation?.id || !Number.isFinite(plein) || plein <= 0) {
    return { prix: plein, remise: null, deals: [] }
  }

  const { data, error } = await supabase
    .from('yoppaa_deals')
    .select('id, titre, deal_type, remise_pct, prix_deal, prestation_id, actif, date_deal, date_debut, date_fin')
    .eq('prestation_id', prestation.id)
    .eq('actif', true)

  if (error) {
    console.warn('[prix-prestation] lecture des deals KO, prix plein applique', error.message)
    return { prix: plein, remise: null, deals: [] }
  }

  const deals = data || []
  return {
    prix: prixEffectifPrestation(prestation, deals, jourISO),
    remise: remiseSurPrestation(prestation, deals, jourISO),
    deals,
  }
}
