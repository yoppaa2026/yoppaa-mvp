// CE QUE L'ÉCRAN DIT DES OPTIONS : LE PRIX SELON LA TAILLE ET LE NOMBRE DE
// CHOIX (13/10, menu d'une pizzeria lu par l'IA : « charcuterie 1,50 € en M,
// 2 € en L, 3 € en XL » ; « Calzone : base + 3 ingrédients au choix »).
//
// ⚠️ L'ÉCRAN ANNONCE, LE SERVEUR DÉCIDE. Les bornes viennent de `bornesChoix`
// (`lib/lignes-commande.js`), la même fonction que celle qui refuse une
// commande : l'écran ne peut pas promettre ce que le serveur refuserait.
//
// ⚠️ MODULE PUR : le banc l'exécute.

import { bornesChoix } from './lignes-commande.js'

// Les groupes d'options, leurs valeurs, et le prix de chaque valeur selon la
// taille. ⚠️ LE LIEN EST NOMMÉ : la table des prix par taille pointe DEUX FOIS
// vers les valeurs (le supplément et la taille), un lien anonyme serait
// ambigu et l'API refuserait toute la lecture (PGRST201, vécu le 12/10).
export const SELECT_GROUPES_AVEC_VALEURS = '*, valeurs:article_options_valeurs(*, prix_taille:article_options_prix_taille!article_options_prix_taille_valeur_id_fkey(taille_valeur_id, prix))'

/** Les prix par taille lus avec les valeurs (`valeurs.prix_taille`), à plat. */
export function prixTailleDesGroupes(groupes = []) {
  const rows = []
  for (const g of Array.isArray(groupes) ? groupes : []) {
    for (const v of g?.valeurs || []) {
      for (const p of v?.prix_taille || []) {
        if (p?.taille_valeur_id) rows.push({ valeur_id: v.id, taille_valeur_id: p.taille_valeur_id, prix: Number(p.prix) })
      }
    }
  }
  return rows
}

/**
 * Le prix d'une valeur, compte tenu de ce qui est déjà choisi dans la ligne.
 * @param {object} valeur        { id, prix_supplement, prix_taille? }
 * @param {string[]} idsChoisis  les valeurs choisies dans TOUTE la ligne
 */
export function prixDeValeur(valeur, idsChoisis = []) {
  const parTaille = Array.isArray(valeur?.prix_taille) ? valeur.prix_taille : []
  const p = parTaille.find(x => idsChoisis.includes(x.taille_valeur_id))
  return p ? Number(p.prix) : Number(valeur?.prix_supplement || 0)
}

/** Le supplément total d'une sélection { groupeId: [valeurs] }. */
export function supplementDeSelection(selections = {}) {
  const toutes = Object.values(selections || {}).flat().filter(Boolean)
  const ids = toutes.map(v => v.id)
  return Math.round(toutes.reduce((s, v) => s + prixDeValeur(v, ids), 0) * 100) / 100
}

/**
 * La pastille d'un groupe, en mots : ce que le client doit faire.
 * « Choisis-en un », « Choisis-en 3 », « Jusqu'à 2 », « Entre 1 et 3 »,
 * « Cumulables ».
 */
export function libelleBornes(groupe) {
  const { min, max } = bornesChoix(groupe)
  if (max === 1) return 'Choisis-en un'
  if (Number.isFinite(max) && min === max) return `Choisis-en ${max}`
  if (Number.isFinite(max) && min > 0) return `Entre ${min} et ${max}`
  if (Number.isFinite(max)) return `Jusqu’à ${max}`
  if (min > 1) return `Au moins ${min}`
  return 'Cumulables'
}

/** Le refus d'un groupe pour `n` choix, en mots, ou null s'il est respecté. */
export function refusDuGroupe(groupe, n) {
  const { min, max } = bornesChoix(groupe)
  if (n < min) return min <= 1 ? 'Choix obligatoire' : `Choisis-en ${min} (${n} pour l’instant)`
  if (n > max) return `${max} au maximum`
  return null
}

/**
 * Cocher ou décocher une valeur. Un groupe à choix unique remplace ; un
 * groupe plein refuse un choix de plus (rend la sélection inchangée et
 * `plein: true`, pour que l'écran le dise).
 */
export function basculerValeur(selections, groupe, valeur) {
  const actuelles = (selections || {})[groupe.id] || []
  const dejaLa = actuelles.some(v => v.id === valeur.id)
  const { max } = bornesChoix(groupe)
  if (dejaLa) return { selections: { ...selections, [groupe.id]: actuelles.filter(v => v.id !== valeur.id) }, plein: false }
  if (max === 1) return { selections: { ...selections, [groupe.id]: [valeur] }, plein: false }
  if (actuelles.length >= max) return { selections, plein: true }
  return { selections: { ...selections, [groupe.id]: [...actuelles, valeur] }, plein: false }
}
