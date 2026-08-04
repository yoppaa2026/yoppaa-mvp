// Résout l'alias `@/...` de Next quand on exécute la logique métier en Node nu.
// Sans lui, impossible de tester lib/ hors du bundler.
import { pathToFileURL } from 'node:url'
import { resolve as resoudreChemin } from 'node:path'

const racine = process.cwd()

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    // Next autorise l'import sans extension, pas Node : on l'ajoute.
    let chemin = resoudreChemin(racine, specifier.slice(2))
    if (!/\.[a-z]+$/i.test(chemin)) chemin += '.js'
    return nextResolve(pathToFileURL(chemin).href, context)
  }
  return nextResolve(specifier, context)
}
