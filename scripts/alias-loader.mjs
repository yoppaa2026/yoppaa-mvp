// Résout l'alias `@/...` de Next quand on exécute la logique métier en Node nu.
// Sans lui, impossible de tester lib/ hors du bundler.
import { pathToFileURL } from 'node:url'
import { resolve as resoudreChemin } from 'node:path'

const racine = process.cwd()

// Next autorise deux choses que Node refuse : l'alias `@/` et l'import sans
// extension, y compris relatif (`./tva`). On rétablit les deux, sinon la moitié
// de lib/ reste intestable.
const sansExtension = (chemin) => !/\.[a-z]+$/i.test(chemin)

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    let chemin = resoudreChemin(racine, specifier.slice(2))
    if (sansExtension(chemin)) chemin += '.js'
    return nextResolve(pathToFileURL(chemin).href, context)
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && sansExtension(specifier)) {
    return nextResolve(specifier + '.js', context)
  }
  return nextResolve(specifier, context)
}
