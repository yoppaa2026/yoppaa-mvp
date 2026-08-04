// Vérifie que TOUTE clé passée à canDo() existe vraiment dans la matrice des
// formules, et que la matrice est cohérente d'un palier à l'autre.
//
// POURQUOI CE FICHIER. `canDo(plan, 'feature')` renvoie `false` quand la clé
// n'existe pas, exactement comme quand la formule ne l'ouvre pas. Une faute de
// frappe ne casse donc RIEN de visible : elle ferme silencieusement une
// fonctionnalité, ou en ouvre une par un chemin détourné. On a déjà été mordus
// par `canDo(plan, 'prix')` au lieu de `prix_affiches`, qui affichait à tort
// une bannière « demande les prix » chez des commerçants qui les affichent.
//
// Aucun test unitaire classique n'attrape ça : il faut confronter le CODE à la
// matrice. C'est ce que fait ce fichier, en lisant les sources.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { PLAN_FEATURES, canDo, canDoAvecCategorie, resolvePlan } from '../lib/plans.js'

const racine = process.cwd()
const DOSSIERS = ['app', 'lib']

function fichiersJs(dossier, acc = []) {
  for (const entree of readdirSync(dossier)) {
    if (entree === 'node_modules' || entree === '.next') continue
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) fichiersJs(chemin, acc)
    // plans.js est le site de DÉFINITION : ses propres appels à canDo portent
    // une variable, pas une clé, et n'ont rien à vérifier.
    else if (extname(chemin) === '.js' && !chemin.endsWith('plans.js')) acc.push(chemin)
  }
  return acc
}

// Découpe les arguments d'un appel en respectant les parenthèses et les
// chaînes : une découpe naïve sur la virgule casserait sur canDo(f(a,b), 'x').
function argumentsDe(source, debut) {
  let profondeur = 0, courant = '', args = [], guillemet = null
  for (let i = debut; i < source.length; i++) {
    const c = source[i]
    if (guillemet) {
      courant += c
      if (c === guillemet && source[i - 1] !== '\\') guillemet = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { guillemet = c; courant += c; continue }
    if (c === '(' || c === '[' || c === '{') profondeur++
    if (c === ')' && profondeur === 0) { args.push(courant.trim()); return args }
    if (c === ')' || c === ']' || c === '}') profondeur--
    if (c === ',' && profondeur === 0) { args.push(courant.trim()); courant = ''; continue }
    courant += c
  }
  return args
}

const clesTrouvees = new Map()   // cle -> [fichier:ligne]
const clesDynamiques = []

for (const dossier of DOSSIERS) {
  for (const fichier of fichiersJs(join(racine, dossier))) {
    const source = readFileSync(fichier, 'utf8')
    const regex = /\bcanDo(?:AvecCategorie)?\s*\(/g
    let m
    while ((m = regex.exec(source)) !== null) {
      // On ignore la DÉFINITION de la fonction elle-même.
      const avant = source.slice(Math.max(0, m.index - 20), m.index)
      if (/function\s+$/.test(avant) || /export function\s+$/.test(avant)) continue
      const args = argumentsDe(source, m.index + m[0].length)
      const second = args[1]
      if (!second) continue
      const ligne = source.slice(0, m.index).split('\n').length
      const ref = `${fichier.replace(racine + '\\', '').replace(racine + '/', '')}:${ligne}`
      const litteral = /^'([^']+)'$|^"([^"]+)"$/.exec(second)
      if (litteral) {
        const cle = litteral[1] || litteral[2]
        if (!clesTrouvees.has(cle)) clesTrouvees.set(cle, [])
        clesTrouvees.get(cle).push(ref)
      } else {
        clesDynamiques.push(`${ref} → ${second}`)
      }
    }
  }
}

let ko = 0
const cheminsMatrice = Object.keys(PLAN_FEATURES)
const toutesLesCles = new Set(cheminsMatrice.flatMap(p => Object.keys(PLAN_FEATURES[p])))

console.log(`${clesTrouvees.size} clés distinctes utilisées dans le code, ${toutesLesCles.size} déclarées dans la matrice.\n`)

// ─── 1. Toute clé utilisée doit exister ───────────────────────────────────
for (const [cle, refs] of [...clesTrouvees].sort()) {
  if (!toutesLesCles.has(cle)) {
    ko++
    console.log(`  ✕ clé INCONNUE « ${cle} » → ${refs.join(', ')}`)
  }
}

// ─── 2. Toute clé doit être déclarée dans TOUS les paliers ────────────────
// Une clé absente d'un palier y vaut `undefined`, donc false : la formule
// ferme la fonctionnalité sans que personne ne l'ait décidé.
for (const cle of toutesLesCles) {
  const manquants = cheminsMatrice.filter(p => !(cle in PLAN_FEATURES[p]))
  if (manquants.length > 0) {
    ko++
    console.log(`  ✕ « ${cle} » n'est pas déclarée dans : ${manquants.join(', ')}`)
  }
}

// ─── 3. Cohérence des paliers : Vendre ⊇ Communiquer ⊇ Exister ────────────
// Un palier supérieur ne doit jamais RETIRER ce qu'un palier inférieur ouvre.
const ORDRE = ['exister', 'communiquer', 'vendre']
for (let i = 1; i < ORDRE.length; i++) {
  const bas = PLAN_FEATURES[ORDRE[i - 1]], haut = PLAN_FEATURES[ORDRE[i]]
  if (!bas || !haut) continue
  for (const cle of Object.keys(bas)) {
    if (bas[cle] === true && haut[cle] !== true) {
      ko++
      console.log(`  ✕ régression de palier : « ${cle} » est ouverte en ${ORDRE[i - 1]} mais fermée en ${ORDRE[i]}`)
    }
  }
}

// ─── 4. Garde-fous de comportement ────────────────────────────────────────
function verifier(nom, condition) {
  if (condition) return
  ko++
  console.log(`  ✕ ${nom}`)
}
verifier('une clé inexistante renvoie false', canDo('vendre', 'cette_cle_nexiste_pas') === false)
verifier('un plan inconnu renvoie false', canDo('plan_bidon', 'commande') === false)
verifier('un plan null renvoie false', canDo(null, 'commande') === false)
verifier('les alias legacy sont résolus', resolvePlan('full') != null && resolvePlan('on') != null)
verifier('la commande reste alimentaire', canDoAvecCategorie('vendre', 'commande', 'vitrine') === false)
verifier('le RDV reste vitrine', canDoAvecCategorie('vendre', 'rdv', 'alimentaire') === false)
verifier('le RDV passe chez une vitrine', canDoAvecCategorie('vendre', 'rdv', 'vitrine') === true)

if (clesDynamiques.length > 0) {
  console.log(`\n⚠️  ${clesDynamiques.length} appel(s) à clé calculée, non vérifiables ici :`)
  clesDynamiques.forEach(d => console.log('     ' + d))
}

console.log(ko === 0 ? '\nMatrice des formules cohérente.' : `\n${ko} problème(s).`)
if (ko > 0) process.exit(1)
