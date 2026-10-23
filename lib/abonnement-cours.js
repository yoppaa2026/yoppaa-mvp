// LES PLAGES DU COURS D'UNE FORMULE (23/10, audit N4, Centre Respire).
//
// 🔴 POURQUOI. Une formule « période » comptait ses séances en SEMAINES, et
// une semaine comptait dès qu'un seul de ses jours tombait dans la période :
// un cours du vendredi vendait la semaine d'un mardi, ou une semaine en cours
// dont le vendredi était passé. La règle (`semainesDeLaPeriode`) sait
// maintenant ne compter que les jours où le cours a lieu, à condition qu'on
// lui donne ses plages : c'est le rôle de ce petit module.
//
// ⚠️ LE MÊME CALCUL PARTOUT OÙ L'ON VEND OU AFFICHE : la route d'achat (le
// prix payé), la fiche (le prix montré), le tableau de bord (l'aperçu et
// l'inscription au comptoir). Trois copies finiraient par montrer un prix et
// en encaisser un autre.
//
// ⚠️ INERTE SANS DONNÉES : liaisons non lues (`null`), aucune plage pour ce
// cours, ou formule sans cours → la formule revient telle quelle, et le compte
// d'avant s'applique. L'app est en service : rien ne change pour celui qui n'a
// pas de plage.

import { creneauxPourPrestation } from './rdv-slots'
import { estCoursCollectif } from './cours-collectifs'
import { COLONNES_FREQUENCE } from './frequence-creneau.js'

// Ce que la règle lit d'une plage (`creneauTombeLe` : jour, date précise, fréquence).
export const COLONNES_PLAGE_COURS = `id, praticien_id, jour_semaine, date_specifique, heure_debut, heure_fin, actif, ${COLONNES_FREQUENCE}`

/**
 * Les plages, leurs liaisons et le catalogue d'un commerce, pour
 * `avecPlagesDuCours`. Sert au serveur (clé de service) comme à l'écran (RLS).
 * ⚠️ UNE LECTURE RATÉE REND `null` : la formule garde alors le compte d'avant,
 * jamais un compte à zéro qui fermerait la vente.
 */
export async function lirePlagesDuCommerce(db, commercantId) {
  const vide = { creneaux: null, liaisons: null, prestations: [] }
  if (!db || !commercantId) return vide
  const [cr, pr] = await Promise.all([
    db.from('rdv_creneaux').select(COLONNES_PLAGE_COURS).eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null),
    // ⚠️ `actif` comme la fiche : le même catalogue des deux côtés, donc le même compte.
    db.from('rdv_prestations').select('id, capacite, par_couverts').eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null),
  ])
  if (cr.error || pr.error) return vide
  const ids = (cr.data || []).map(c => c.id)
  if (ids.length === 0) return { creneaux: [], liaisons: [], prestations: pr.data || [] }
  const li = await db.from('rdv_creneau_prestations').select('creneau_id, prestation_id').in('creneau_id', ids)
  if (li.error) return vide
  return { creneaux: cr.data || [], liaisons: li.data || [], prestations: pr.data || [] }
}

/**
 * La formule, avec `plages_du_cours` : les plages actives qui accueillent sa
 * prestation (même règle que la fiche, `creneauxPourPrestation`).
 * @param creneaux    les plages du commerce (`rdv_creneaux`, fréquence comprise)
 * @param liaisons    `rdv_creneau_prestations` de ces plages, ou `null` si non lues
 * @param prestations le catalogue (pour savoir si c'est un cours)
 */
export function avecPlagesDuCours(formule, { creneaux = null, liaisons = null, prestations = [] } = {}) {
  if (!formule || !formule.prestation_id) return formule
  if (!Array.isArray(creneaux) || !Array.isArray(liaisons)) return formule
  const prestation = (prestations || []).find(p => p && String(p.id) === String(formule.prestation_id)) || null
  const actives = creneaux.filter(c => c && c.actif !== false && !c.deleted_at)
  const plages = creneauxPourPrestation(actives, formule.prestation_id, liaisons, { estCours: estCoursCollectif(prestation) })
  if (plages.length === 0) return formule
  return { ...formule, plages_du_cours: plages }
}
