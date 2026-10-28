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

import { prixEffectifPrestation, remiseSurPrestation, TOUT_PRESTATIONS } from './deals'
import { estParCouverts } from './cours-collectifs'
import { COLONNES_RECURRENCE, plageAccepte } from './recurrence-promo'
import { jourBruxelles } from './timezone'

/**
 * Le prix d'une prestation, remise du jour comprise.
 *
 * ⚠️ ON CHARGE CETTE PRESTATION ET LES REMISES GLOBALES, rien de plus. Une
 * remise « toutes mes prestations » ne porte AUCUN `prestation_id` : filtrer
 * uniquement dessus l'aurait rendue invisible, et le serveur aurait débité le
 * tarif plein sur une remise que la fiche affichait. Charger tout le catalogue
 * de deals, à l'inverse, serait payer une lecture large sur un chemin d'argent
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
// ✅ (28/10, lot 2) `heure` : l'heure du rendez-vous, pour la plage horaire
// d'une promo (« 11 h à 14 h »). Absente : c'est le jour qui décide.
export async function prixPrestationServeur(supabase, prestation, jourISO = jourBruxelles(), { client = null, heure = null } = {}) {
  // ✅ UNE TABLE N'A PAS DE PRIX (Alex, 10/09 au soir) : rien à lire, rien à
  // débiter, et donc aucun acompte en pourcentage, aucun bon, aucune récompense.
  // ⚠️ `par_couverts` DOIT ÊTRE DANS LE SELECT DE L'APPELANT, sinon cette ligne
  // se tait et le prix resté en base part sur Stripe. Deux des trois routes ne
  // le chargeaient pas : un banc exige désormais la colonne partout où cette
  // fonction est appelée.
  if (estParCouverts(prestation)) return { prix: null, remise: null, deals: [], decouverte: false }
  const plein = prestation?.prix != null ? Number(prestation.prix) : null
  if (!prestation?.id || !Number.isFinite(plein) || plein <= 0) {
    return { prix: plein, remise: null, deals: [], decouverte: false }
  }
  const base = await prixAvecDeals(supabase, prestation, plein, jourISO, heure)

  // ✅ LE TARIF DÉCOUVERTE (18/10, Alex au tableau, demande d'Emily) : une
  // première fois à ce cours, au prix découverte. Voir `tarifDecouverte`.
  const decouverte = await tarifDecouverte(supabase, prestation, client)
  if (decouverte !== null && decouverte < base.prix) {
    // La remise du deal ne s'applique plus : on ne la rapporte pas.
    return { ...base, prix: decouverte, remise: null, decouverte: true }
  }
  return { ...base, decouverte: false }
}

/**
 * Le prix découverte s'il s'applique à CE client, sinon `null`.
 *
 * ⚠️ UNE PAR COURS (décision d'Alex) : il n'a jamais suivi CETTE prestation
 * (reconnu par email OU téléphone, sans compte obligatoire). La question est
 * posée à la base par `rdv_cours_deja_suivi`, réservée au serveur : ouverte au
 * navigateur, elle dirait à n'importe qui si une adresse fréquente un centre.
 * ⚠️ PAS DE CUMUL AVEC UN DEAL : l'appelant garde le moins cher des deux.
 * 🔴 UNE LECTURE QUI ÉCHOUE NE BRADE RIEN, comme les deals : pas de réponse,
 * pas de découverte.
 * ⚠️ `prix_decouverte` DOIT ÊTRE DANS LE SELECT DE L'APPELANT : absente, la
 * colonne vaut `undefined` et le tarif ne s'applique jamais (le bon sens).
 */
export async function tarifDecouverte(supabase, prestation, client) {
  if (prestation?.prix_decouverte == null || estParCouverts(prestation)) return null
  const prix = Number(prestation.prix_decouverte)
  // ⚠️ STRICTEMENT POSITIF : une découverte « offerte » ferait tomber le dû à
  // zéro APRÈS que la fiche a choisi le chemin de l'acompte, et la route le
  // refuserait. L'éditeur exige donc un prix entre 0 et le prix normal.
  if (!Number.isFinite(prix) || prix <= 0) return null
  const email = String(client?.email ?? '').trim()
  const telephone = String(client?.telephone ?? '').trim()
  if (!email && !telephone) return null
  const { data, error } = await supabase.rpc('rdv_cours_deja_suivi', {
    p_prestation_id: prestation.id, p_email: email || null, p_telephone: telephone || null,
  })
  if (error || data !== false) {
    if (error) console.warn('[prix-prestation] tarif découverte : lecture KO, prix normal', error.message)
    return null
  }
  return prix
}

async function prixAvecDeals(supabase, prestation, plein, jourISO, heure = null) {

  const { data, error } = await supabase
    .from('yoppaa_deals')
    // 🔴 `cible_tout` A FAILLI MANQUER ICI, dans le module écrit le matin
    // même. Sans elle, une remise « toutes mes prestations » se serait affichée
    // sur la fiche et le serveur aurait débité le tarif plein : le défaut que
    // ce fichier existe précisément pour empêcher.
    // ⚠️ (28/10, lot 2) + la récurrence et la plage horaire.
    .select(`id, titre, deal_type, remise_pct, prix_deal, prestation_id, cible_tout, actif, date_deal, date_debut, date_fin, ${COLONNES_RECURRENCE}`)
    // ⚠️ ET LA REQUÊTE S'ÉLARGIT : une remise globale ne porte AUCUN
    // `prestation_id`. Filtrer dessus l'aurait rendue invisible.
    .or(`prestation_id.eq.${prestation.id},cible_tout.eq.${TOUT_PRESTATIONS}`)
    .eq('commercant_id', prestation.commercant_id)
    .eq('actif', true)

  if (error) {
    console.warn('[prix-prestation] lecture des deals KO, prix plein applique', error.message)
    return { prix: plein, remise: null, deals: [] }
  }

  // Hors de sa plage horaire, une promo ne compte pas pour CE rendez-vous.
  const deals = (data || []).filter(d => plageAccepte(d, heure))
  return {
    prix: prixEffectifPrestation(prestation, deals, jourISO),
    remise: remiseSurPrestation(prestation, deals, jourISO),
    deals,
  }
}

// ✅ LA TRACE DE LA PROMO SUR UN RENDEZ-VOUS (28/10, lot 1c du module promo),
// comme `tracePromo` sur une ligne de commande : le prix SANS la promo et la
// promo appliquée, nuls sans promo. Alex, 28/10, chez Salon Nathalie : la promo
// passait, mais rien ne la gardait sur le rendez-vous. `remise` est celle que
// `prixPrestationServeur` rend (nulle au tarif découverte, qui la remplace).
export function traceRdv(remise) {
  const plein = Number(remise?.prixBarre)
  const paye = Number(remise?.prix)
  if (!remise?.deal?.id || !Number.isFinite(plein) || !Number.isFinite(paye) || plein <= paye) {
    return { prix_plein: null, promo_deal_id: null }
  }
  return { prix_plein: plein, promo_deal_id: remise.deal.id }
}

// La même trace pour les métadonnées Stripe (des chaînes), relue par le
// webhook qui crée le rendez-vous après l'acompte. Aucune clé sans promo.
export function metaTraceRdv(remise) {
  const t = traceRdv(remise)
  return t.promo_deal_id ? { prix_plein: String(t.prix_plein), promo_deal_id: String(t.promo_deal_id) } : {}
}
