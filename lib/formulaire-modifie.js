// ─── Détecter qu'un formulaire a changé, sans se tromper ─────────────────────
//
// Le tableau de bord perd du travail de deux façons : un bouton d'enregistrement
// qu'on ne trouve pas, et rien qui prévienne quand on quitte. La barre collante
// répond aux deux, mais elle ne vaut que si la comparaison est JUSTE : une barre
// qui s'affiche alors que rien n'a bougé devient un décor qu'on n'écoute plus, et
// une barre qui reste muette alors que tout a changé est pire que rien.
//
// ⚠️ TOUTE LA DIFFICULTÉ EST DANS LES FORMES DE L'ABSENCE. La base rend `null`,
// un champ de saisie rend `''`, une case jamais cochée rend `false`, et un
// nombre revient en texte du DOM. Comparer bêtement `initial !== courant`
// annoncerait « 14 modifications » sur un écran auquel personne n'a touché.
// C'est le piège déjà vécu deux fois sur ce projet : `null` et `undefined` ne se
// comportent pas pareil, et `Number(null)` vaut 0.

// Ramène une valeur à sa forme comparable.
//
// ⚠️ `v === false` ET SURTOUT PAS `!v` : `0` et `''` sont faux eux aussi, et un
// délai de retrait remis à 0 est une VRAIE modification qu'il ne faut pas
// avaler. Seul le booléen faux rejoint l'absence, parce qu'une case décochée et
// une case jamais renseignée sont la même chose pour le commerçant.
export function normaliserValeur(v) {
  if (v === null || v === undefined || v === '' || v === false) return ''
  if (Array.isArray(v) || (typeof v === 'object' && !(v instanceof Date))) {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  if (v instanceof Date) return v.toISOString()
  // Le nombre 50 rendu par la base et le texte '50' rendu par le champ de
  // saisie sont la même valeur : sans ça, ouvrir un écran suffirait à le
  // déclarer modifié.
  return String(v)
}

// Les clés dont la valeur a changé, initial et courant confondus : un champ
// ajouté et un champ retiré comptent tous les deux.
export function champsModifies(initial, courant, { ignorer = [] } = {}) {
  // ⚠️ Tant que le formulaire n'est pas chargé, il n'y a RIEN à comparer. Sans
  // ce garde-fou, l'écran s'annoncerait modifié pendant sa propre ouverture.
  if (!initial || !courant) return []
  const exclus = new Set(ignorer)
  const cles = new Set([...Object.keys(initial), ...Object.keys(courant)])
  const modifies = []
  for (const cle of cles) {
    if (exclus.has(cle)) continue
    if (normaliserValeur(initial[cle]) !== normaliserValeur(courant[cle])) modifies.push(cle)
  }
  return modifies.sort()
}

export function estModifie(initial, courant, options) {
  return champsModifies(initial, courant, options).length > 0
}

// « 1 modification non enregistrée » / « 3 modifications non enregistrées ».
// Le nombre est là pour rassurer : il dit qu'on a bien vu ce qu'il a touché.
export function libelleModifications(nb) {
  const n = Number(nb) || 0
  if (n <= 0) return ''
  return n === 1 ? '1 modification non enregistrée' : `${n} modifications non enregistrées`
}

// Le message du navigateur avant fermeture. Chrome et Safari affichent leur
// propre texte depuis des années, mais Firefox et les anciens navigateurs
// utilisent encore celui-ci, et il sert aussi à notre propre fenêtre.
export const MESSAGE_QUITTER =
  'Tes modifications ne sont pas enregistrées. Si tu quittes maintenant, elles seront perdues.'
