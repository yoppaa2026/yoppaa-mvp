// ─── LES RELEVÉS DE FOND, ET CE QU'ILS COÛTENT À L'ÉCRAN ────────────────────
//
// ⚠️ LE DÉFAUT QUI A VÉCU ICI, RACONTÉ PAR ALEX LE 18/08 :
// « des blocages d'écran, surtout quand je vais plus vite, 1 ou 2 secondes
// d'attente et ça débloque », et surtout « la fiche peut déjà être ouverte
// depuis un certain temps, ça ne change rien au problème ».
//
// La fiche commerçant relevait ses articles, ses stocks, ses groupes d'options
// et les commandes du jour TOUTES LES CINQ SECONDES, sans jamais regarder si
// quelqu'un avait les yeux dessus. Chaque relevé reposait quatre états avec des
// objets NEUFS, donc le plus gros composant de l'application se redessinait en
// entier, pour rien, huit cents fois par heure.
//
// ⚠️ DEUX REMÈDES, ET IL FAUT LES DEUX.
// Ne pas relever quand l'écran est caché ne suffit pas : la personne qui
// défile REGARDE l'écran. Ce qui tue le blocage, c'est de ne rien reposer
// quand rien n'a changé. Un relevé qui rend les mêmes données doit être
// silencieux de bout en bout.
//
// ⚠️ POURQUOI UNE SIGNATURE TRIÉE, ET PAS UN `JSON.stringify` NU.
// Une requête sans `ORDER BY` ne promet aucun ordre, et les états comparés ici
// sont des dictionnaires construits à partir de ces lignes. Deux relevés
// identiques peuvent donc produire deux textes différents, et la comparaison
// naïve ne serait jamais silencieuse : le remède n'aurait servi à rien, en
// silence. On trie donc les CLÉS, jamais les tableaux, dont l'ordre est porteur
// de sens (l'ordre des articles est celui de l'affichage).

function trierLesCles(valeur) {
  if (Array.isArray(valeur)) return valeur.map(trierLesCles)
  if (valeur && typeof valeur === 'object') {
    const sortie = {}
    for (const cle of Object.keys(valeur).sort()) sortie[cle] = trierLesCles(valeur[cle])
    return sortie
  }
  return valeur
}

// Rend un texte stable pour une valeur, ou `null` si elle ne peut pas se
// sérialiser (référence circulaire, valeur exotique). ⚠️ `null` veut dire
// « je ne sais pas comparer », JAMAIS « vide » : l'appelant doit alors reposer
// l'état plutôt que de risquer un écran figé sur des données périmées.
export function signature(valeur) {
  try {
    const texte = JSON.stringify(trierLesCles(valeur))
    return texte === undefined ? null : texte
  } catch {
    return null
  }
}

// Ne repose l'état que si le contenu a bougé. Rend `true` quand elle a posé,
// `false` quand elle s'est tue, pour que le banc puisse mesurer le silence.
//
// `memoire` est un `useRef` : on y garde la signature du dernier contenu posé.
export function poserSiChange(memoire, valeur, poser) {
  if (!memoire || typeof poser !== 'function') return false
  const sig = signature(valeur)
  // Incomparable : on pose, et on oublie la mémoire pour ne pas se taire au
  // relevé suivant sur la foi d'une signature qu'on n'a pas su calculer.
  if (sig === null) {
    memoire.current = null
    poser(valeur)
    return true
  }
  if (memoire.current === sig) return false
  memoire.current = sig
  poser(valeur)
  return true
}

// Un relevé de fond n'a de sens que devant quelqu'un. ⚠️ Ce n'est PAS un
// confort : sur l'accueil client, un relevé non conditionné à la visibilité
// avait fabriqué une course au renouvellement du jeton qui EFFAÇAIT la session
// (11/08). Ici, il fabrique des blocages d'écran. Même geste, deux dégâts.
export function ecranRegarde(document_ = typeof document !== 'undefined' ? document : null) {
  if (!document_ || typeof document_.visibilityState !== 'string') return true
  return document_.visibilityState === 'visible'
}
