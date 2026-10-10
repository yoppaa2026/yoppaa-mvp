// CE QUI OCCUPE DÉJÀ UN CRÉNEAU, CE JOUR-LÀ (10/10).
//
// 🔴 UNE SEULE FAÇON DE COMPTER, POUR LES DEUX PORTES. La commande en ligne
// (`create-commande`) comptait en ligne dans sa route ; la commande encodée par
// le commerçant doit compter EXACTEMENT pareil, sinon l'écran du commerçant
// dirait « il reste de la place » là où le client en ligne lirait « complet ».
// Deux copies d'une règle finissent toujours par diverger.
//
// Ce module lit la base ; la décision (« déborderait-elle ? ») reste dans la
// règle pure `commandeDeborde` (lib/creneaux.js), comme le déclencheur SQL.

import { STATUTS_OCCUPENT_CRENEAU } from './creneaux'

/**
 * @param {object} o
 * @param {object} o.supabase       client serveur
 * @param {string} o.commercantId
 * @param {string} o.creneauId
 * @param {boolean} o.estLivraison  tournée (`creneau_livraison_id`) ou retrait (`creneau_id`)
 * @param {string} o.date           YYYY-MM-DD
 * @param {boolean} o.modeTemps     compter aussi le temps de préparation
 * @returns {Promise<{ok: true, existantes: number, tempsExistant: number} | {ok: false, error: string}>}
 *   ⚠️ Une lecture ratée rend `ok: false`, jamais « zéro commande » : une
 *   place qu'on n'a pas pu compter n'est pas une place libre.
 */
export async function occupationDuCreneau({ supabase, commercantId, creneauId, estLivraison, date, modeTemps }) {
  const colonneCreneau = estLivraison ? 'creneau_livraison_id' : 'creneau_id'
  const { data, error } = await supabase
    .from('commandes')
    .select('id, temps_prepa_minutes')
    .eq('commercant_id', commercantId)
    .eq(colonneCreneau, creneauId)
    .eq('date_commande', date)
    .in('statut', STATUTS_OCCUPENT_CRENEAU)
  if (error) return { ok: false, error: error.message }
  const occupantes = data || []

  // Mode « temps » : le plafond est une durée. Le temps figé sur la commande
  // d'abord ; les commandes d'avant I8 n'en ont pas, on le recalcule depuis
  // leurs lignes.
  let tempsExistant = 0
  if (modeTemps) {
    const sansTemps = []
    for (const c of occupantes) {
      if (c.temps_prepa_minutes === null || c.temps_prepa_minutes === undefined) sansTemps.push(c.id)
      else tempsExistant += Number(c.temps_prepa_minutes) || 0
    }
    if (sansTemps.length > 0) {
      const { data: lignes, error: errLignes } = await supabase
        .from('commande_articles')
        .select('quantite, article:articles(temps_prepa)')
        .in('commande_id', sansTemps)
      if (errLignes) return { ok: false, error: errLignes.message }
      for (const l of lignes || []) {
        tempsExistant += Number(l.quantite || 0) * Number(l.article?.temps_prepa ?? 1)
      }
    }
  }
  return { ok: true, existantes: occupantes.length, tempsExistant }
}
