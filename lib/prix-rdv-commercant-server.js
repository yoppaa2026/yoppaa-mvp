// LE PRIX D'UN RENDEZ-VOUS ENCODÉ PAR LE COMMERCE, CÔTÉ SERVEUR (03/11).
// La règle est celle de la réservation en ligne (`prixPrestationServeur`) ;
// la décision « garder / retirer » vit dans `lib/prix-rdv-commercant.js`.

import { prixPrestationServeur } from './prix-prestation-server'
import { reductionProposee } from './prix-rdv-commercant'
import { COLONNES_COUVERTS } from './cours-collectifs'

// ⚠️ LES COLONNES DONT LE CALCUL A BESOIN. `commercant_id` lit les promos du
// commerce, `par_couverts` écarte une table (qui n'a pas de prix),
// `prix_decouverte` ouvre le tarif découverte. Absente d'un select, une
// colonne vaut `undefined` sans erreur : la promo serait muette.
export const COLONNES_PRESTATION_PRIX = `id, nom, prix, prix_decouverte, acompte_pourcent, commercant_id, ${COLONNES_COUVERTS}`

/**
 * Ce que le serveur propose pour ce rendez-vous : `{ plein, reduction }`.
 * Le jour et l'heure sont ceux du RENDEZ-VOUS (décision du 28/10).
 */
export async function prixPourLeCommerce(db, prestation, { date, heure = null, email = null, telephone = null } = {}) {
  const plein = prestation?.prix != null ? Number(prestation.prix) : null
  const resultat = await prixPrestationServeur(db, prestation, String(date).slice(0, 10), {
    client: { email, telephone },
    heure: heure ? String(heure).slice(0, 5) : null,
  })
  return { plein, reduction: reductionProposee(plein, resultat) }
}
