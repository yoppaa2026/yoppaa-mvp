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

/**
 * LA PASTILLE AU-DESSUS D'UN GROUPE, SEULEMENT SI ELLE DIT UNE VRAIE LIMITE
 * (13/10, Alex : « pas de choisis-en un, il se sent obligé »).
 *   - un seul choix : rien, le rond le dit ;
 *   - autant qu'on veut : rien, les cases le disent ;
 *   - une limite (« Jusqu'à 3 », « Entre 1 et 3 », « Choisis-en 3 ») : oui,
 *     le serveur refuserait au-delà, le client doit le savoir.
 * « Obligatoire » se dit à part, par sa propre pastille.
 */
export function pastilleBornes(groupe) {
  const { min, max } = bornesChoix(groupe)
  if (max === 1) return null
  if (!Number.isFinite(max) && min <= 1) return null
  return libelleBornes(groupe)
}

/**
 * Un rond ou une case ? Le rond pour un choix parmi plusieurs (ou un choix
 * imposé). ⚠️ UNE OPTION SEULE ET FACULTATIVE (« Fromage +1,50 € ») prend une
 * CASE : un rond seul se lit mal, on ne sait pas qu'on peut le décocher.
 */
export function afficheEnRond(groupe) {
  const { min, max } = bornesChoix(groupe)
  return max === 1 && ((groupe?.valeurs || []).length > 1 || min >= 1)
}

/** Le refus d'un groupe pour `n` choix, en mots, ou null s'il est respecté. */
export function refusDuGroupe(groupe, n) {
  const { min, max } = bornesChoix(groupe)
  if (n < min) return min <= 1 ? 'Choix obligatoire' : `Choisis-en ${min} (${n} pour l’instant)`
  if (n > max) return `${max} au maximum`
  return null
}

// ─── LE RÉGLAGE DU COMMERÇANT (13/10) ──────────────────────────────────────

const entier = (txt) => {
  const s = String(txt ?? '').trim()
  if (s === '') return null
  return /^\d+$/.test(s) ? Number(s) : NaN
}

/**
 * Le nombre de choix saisi (« au moins », « au plus »), contrôlé avec les
 * MÊMES bornes que la base (0 à 30, minimum ≤ maximum, maximum ≥ 1).
 * Vide = pas de limite. Rend { ok, choix_min, choix_max } ou { ok: false, error }.
 */
export function bornesDepuisSaisie(minTxt, maxTxt) {
  const min = entier(minTxt)
  const max = entier(maxTxt)
  if (Number.isNaN(min) || Number.isNaN(max)) return { ok: false, error: 'Indique un nombre entier, ou laisse vide.' }
  if (min !== null && min > 30) return { ok: false, error: '30 au maximum.' }
  if (max !== null && (max < 1 || max > 30)) return { ok: false, error: 'Le maximum va de 1 à 30.' }
  if (min !== null && max !== null && min > max) return { ok: false, error: 'Le minimum dépasse le maximum.' }
  return { ok: true, choix_min: min === 0 ? null : min, choix_max: max }
}

/**
 * Le groupe des TAILLES d'un article, pour les prix par taille d'un autre
 * groupe : un choix unique (on ne prend qu'une taille), autre que le groupe
 * réglé, de préférence nommé comme une taille. `null` s'il n'y en a pas.
 */
const NOM_DE_TAILLE = /taille|format|grandeur|\bcm\b|portion/i

export function groupeDesTailles(groupes = [], groupeIdExclu = null) {
  const candidats = (Array.isArray(groupes) ? groupes : [])
    .filter(g => g && g.id !== groupeIdExclu && bornesChoix(g).max === 1 && (g.valeurs || []).length > 1)
  return candidats.find(g => NOM_DE_TAILLE.test(g.nom || '')) || candidats[0] || null
}

/**
 * L'ORDRE D'AFFICHAGE DES GROUPES (13/10, Alex) :
 *   1. le groupe des tailles, puisqu'il décide du prix des suppléments ;
 *   2. les autres groupes OBLIGATOIRES (la boisson d'un menu) : ce qu'on doit
 *      choisir avant ce qu'on peut ajouter ;
 *   3. les facultatifs.
 * Chaque bloc garde l'ordre de création. Une copie, rien n'est modifié.
 *
 * ⚠️ Le « groupe des tailles » de repli (un choix unique quelconque, sans nom
 * de taille) ne passe en tête que s'il est obligatoire : une « Cuisson »
 * facultative ne doit pas passer devant la boisson imposée.
 */
export function ordonnerGroupes(groupes = []) {
  const liste = Array.isArray(groupes) ? groupes : []
  const tailles = groupeDesTailles(liste)
  const enTete = tailles && (bornesChoix(tailles).min >= 1 || NOM_DE_TAILLE.test(tailles.nom || '')) ? tailles : null
  const reste = liste.filter(g => g !== enTete)
  return [
    ...(enTete ? [enTete] : []),
    ...reste.filter(g => bornesChoix(g).min >= 1),
    ...reste.filter(g => bornesChoix(g).min < 1),
  ]
}

/**
 * Les prix par taille saisis pour une valeur : { taille_valeur_id: '2,00' }.
 * Rend { ok, lignes: [{ valeur_id, taille_valeur_id, prix }] } (vide = prix
 * unique pour cette taille), ou { ok: false, error }.
 */
export function lignesPrixTaille(valeurId, saisies = {}) {
  const lignes = []
  for (const [tailleId, brut] of Object.entries(saisies || {})) {
    const s = String(brut ?? '').replace(',', '.').trim()
    if (s === '') continue
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, error: 'Un prix s’écrit comme 1,50.' }
    const prix = Number(s)
    if (prix > 500) return { ok: false, error: '500 € au maximum.' }
    lignes.push({ valeur_id: valeurId, taille_valeur_id: tailleId, prix })
  }
  return { ok: true, lignes }
}

/** « 1,50 · 2,00 · 3,00 € » : les prix par taille d'une valeur, en court. */
export function resumePrixTaille(valeur, tailles = []) {
  const parTaille = Array.isArray(valeur?.prix_taille) ? valeur.prix_taille : []
  if (parTaille.length === 0) return null
  const fmt = (n) => Number(n).toFixed(2).replace('.', ',')
  return tailles.map(t => {
    const p = parTaille.find(x => x.taille_valeur_id === t.id)
    return `${t.nom} ${fmt(p ? p.prix : valeur.prix_supplement || 0)}`
  }).join(' · ') + ' €'
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
