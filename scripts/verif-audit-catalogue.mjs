// BANC — L'AUDIT ARTICLES + PERSONNALISATION, SUITE (22/10, tableau d'Alex)
//
// Le bandeau « À corriger », les prix en lot (« Mettre à 12 € », « +0,50 € »,
// variantes comprises), « Enregistrer et personnaliser », la fiabilité des
// écritures et le confort. Les graves (R1 à R4) vivent dans `verif:lots-options`,
// `verif:stock-article` et `verif:copie`.
//
// ⚠️ LE BANC EXÉCUTE LES RÈGLES ET LIT LE CODE QUI LES BRANCHE.
//
//   npm run verif:audit-catalogue

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { articlesACorriger, titreACorriger } from '../lib/catalogue-a-corriger.js'

const RACINE = new URL('../', import.meta.url)
const code = (f) => sansProse(readFileSync(new URL(f, RACINE), 'utf8'))

let ok = 0
const echecs = []
function v(nom, condition, detail = '') {
  if (condition) ok++
  else echecs.push(detail ? `${nom} — ${detail}` : nom)
}

// ═══ 1. LE BANDEAU « À CORRIGER » ══════════════════════════════════════════
{
  const articles = [
    { id: 1, nom: 'Bralette', gere_variantes: true, stock_mode: 'magasin', actif: true },
    { id: 2, nom: 'Robe', gere_variantes: true, stock_mode: 'magasin', actif: true },
    { id: 3, nom: 'Body', gere_variantes: true, stock_mode: 'magasin', actif: true },
    { id: 4, nom: 'Bague', gere_variantes: true, stock_mode: 'illimite', actif: true },
    { id: 5, nom: 'Pizza', actif: true },
    { id: 6, nom: 'Masquée', gere_variantes: true, actif: false },
    { id: 7, nom: 'En vitrine', gere_variantes: true, est_vitrine: true, actif: true },
    { id: 8, nom: 'Jupe', gere_variantes: true, stock_mode: 'jour', actif: true },
    { id: 9, nom: 'Top', gere_variantes: true, stock_mode: 'magasin', actif: true },
  ]
  const variantesParArticle = {
    2: [{ actif: false, stock: 4 }],
    3: [{ actif: true, stock: 0 }, { actif: true, stock: 0 }],
    4: [{ actif: true, stock: 0 }],
    8: [{ actif: true, stock: 3 }],
    9: [{ actif: true, stock: 0 }, { actif: true, stock: 2 }],
  }
  const groupesParArticle = {
    5: [{ nom: 'Sauces', obligatoire: true, valeurs: [] }, { nom: 'Taille', obligatoire: true, valeurs: [{}, {}] }],
  }
  const liste = articlesACorriger({ articles, variantesParArticle, groupesParArticle })
  const par = Object.fromEntries(liste.map(x => [x.id, x]))
  v('🔴 des variantes sans aucune combinaison : signalé', /n’en a aucune/.test(par[1]?.raisons?.[0] || ''), JSON.stringify(par[1]))
  v('🔴 toutes les variantes éteintes : signalé', /toutes ses variantes sont éteintes/.test(par[2]?.raisons?.[0] || ''))
  v('🔴 toutes les variantes à 0 : signalé', /toutes ses variantes sont à 0/.test(par[3]?.raisons?.[0] || ''))
  v('« fabriqué à la demande » à 0 : rien à corriger', !par[4])
  v('🔴 un groupe obligatoire sans option : signalé, le bon groupe ne l’est pas',
    par[5]?.raisons?.length === 1 && /« Sauces » : obligatoire, mais sans option/.test(par[5].raisons[0]), JSON.stringify(par[5]))
  v('un article masqué ou en vitrine n’est jamais signalé', !par[6] && !par[7])
  v('🔴 l’ancien « par jour » sur des variantes : signalé, geste « modifier »', /par jour/.test(par[8]?.raisons?.[0] || '') && par[8].geste === 'modifier')
  v('une variante en stock suffit', !par[9])
  v('l’ordre de la liste suit le catalogue', liste.map(x => x.id).join() === '1,2,3,5,8', liste.map(x => x.id).join())
  v('le titre compte, au singulier comme au pluriel',
    titreACorriger(liste) === '5 articles ne se vendent pas comme prévu' && titreACorriger([{}]) === '1 article ne se vend pas comme prévu' && titreACorriger([]) === '')
}

console.log(`\nAudit du catalogue, suite : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
