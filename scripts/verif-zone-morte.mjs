// BANC : LA ZONE MORTE TEMPORELLE DANS LES TABLEAUX DE DÉPENDANCES.
//
//   npm run verif:zone-morte
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 POURQUOI CE BANC EXISTE : TROIS ÉCRANS BLANCS EN PRODUCTION, ET AUCUN
//    FILET.
//
// 12/08 : un `const` inséré trop haut, lu pendant le rendu. Accueil cassé.
// 17/08 : un `useEffect` écrit cent lignes au-dessus du `useState` dont son
//         tableau de dépendances dépendait.
// 29/08 : le même, en pire. Mon effet du bouton flottant lisait `peutCommander`
//         dans ses dépendances, 428 lignes AVANT sa déclaration. Résultat :
//         AUCUNE FICHE COMMERÇANT NE S'OUVRAIT. Page blanche, reload, retry.
//
// ⚠️ NI LE LINT NI LE BUILD NE VOIENT CE DÉFAUT. `no-undef` est satisfait, le
// nom existe bien dans la portée : ce n'est ni un import manquant ni une faute
// de frappe, c'est un ORDRE. Et `no-use-before-define` a été essayée le 17/08
// puis retirée : elle rendait 21 erreurs, TOUTES sur du code juste, parce
// qu'elle ne distingue pas le CORPS d'un composant, exécuté tout de suite,
// d'un CALLBACK appelé plus tard, où lire une variable déclarée plus bas est
// parfaitement légal.
//
// ✅ D'OÙ LA PORTÉE DE CE BANC : LES SEULS TABLEAUX DE DÉPENDANCES. Là, et
// seulement là, la règle est nette et sans exception : le tableau est évalué
// PENDANT LE RENDU, donc lire un `const` ou un `let` déclaré plus bas dans le
// même composant lève à coup sûr. Pas d'heuristique, pas de faux positif
// possible sur du code correct : c'est ce qui rend la garde tenable.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { sansProse } from './lire-code.mjs'

const RACINE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const fichiers = []
const parcourir = (d) => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.next' || e === '.git') continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) parcourir(p)
    else if (/\.(js|jsx)$/.test(e)) fichiers.push(p)
  }
}
parcourir(join(RACINE, 'app'))

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}

// Une frontière de composant : une déclaration de premier niveau, sans
// indentation. Deux lignes qui partagent la même frontière sont dans la même
// fonction ; c'est ce qui évite de confondre deux composants d'un même fichier.
const estFrontiere = (l) =>
  /^(export\s+)?(default\s+)?(async\s+)?function\s/.test(l)
  || /^export\s+default\s/.test(l)
  || /^(const|let)\s+[A-Za-z_$][\w$]*\s*=\s*(async\s*)?(\(|function)/.test(l)

// Les déclarations `const`/`let` d'une ligne, y compris les déstructurations
// `const [x, setX] = useState()` et `const { a, b } = ...`.
function declareesSur(ligne) {
  const noms = []
  let m = /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/.exec(ligne)
  if (m) noms.push(m[1])
  m = /^\s*(?:const|let)\s*\[([^\]]*)\]\s*=/.exec(ligne)
  if (m) for (const b of m[1].split(',')) {
    const n = b.trim().match(/^[A-Za-z_$][\w$]*/)
    if (n) noms.push(n[0])
  }
  m = /^\s*(?:const|let)\s*\{([^}]*)\}\s*=/.exec(ligne)
  if (m) for (const b of m[1].split(',')) {
    const n = b.trim().replace(/^.*:\s*/, '').match(/^[A-Za-z_$][\w$]*/)
    if (n) noms.push(n[0])
  }
  return noms
}

// ⚠️ ON IGNORE LES DÉCLARATIONS DE PREMIER NIVEAU (indentation nulle) : un
// `const` de module est initialisé au chargement du fichier, donc bien AVANT
// le premier rendu. Le poser après le composant est parfaitement légal.
const estIndentee = (l) => /^\s+\S/.test(l)

let arraysExamines = 0
const coupables = []

for (const chemin of fichiers) {
  const lignes = sansProse(readFileSync(chemin, 'utf8')).split('\n')

  // La frontière de composant de chaque ligne.
  const frontiere = []
  let courante = -1
  for (let i = 0; i < lignes.length; i++) {
    if (estFrontiere(lignes[i])) courante = i
    frontiere[i] = courante
  }

  // Toutes les déclarations indentées, par nom, avec leur ligne.
  const decls = new Map()
  for (let i = 0; i < lignes.length; i++) {
    if (!estIndentee(lignes[i])) continue
    for (const n of declareesSur(lignes[i])) {
      if (!decls.has(n)) decls.set(n, [])
      decls.get(n).push(i)
    }
  }

  // Les tableaux de dépendances : la fermeture `}, [ ... ])` d'un hook.
  for (let i = 0; i < lignes.length; i++) {
    const m = /\}\s*,\s*\[([^\]]*)\]\s*\)/.exec(lignes[i])
    if (!m) continue
    arraysExamines++
    const identifiants = m[1].split(',')
      .map(x => x.trim().match(/^[A-Za-z_$][\w$]*/)?.[0])
      .filter(Boolean)

    for (const nom of identifiants) {
      const lieux = decls.get(nom)
      if (!lieux) continue
      // Déclarée AVANT, dans le même composant ? Alors tout va bien.
      const avant = lieux.some(l => l < i && frontiere[l] === frontiere[i])
      if (avant) continue
      // Déclarée APRÈS, dans le même composant ? Alors c'est la zone morte.
      const apres = lieux.find(l => l > i && frontiere[l] === frontiere[i])
      if (apres === undefined) continue
      coupables.push({
        fichier: relative(RACINE, chemin).replace(/\\/g, '/'),
        nom, ligneDep: i + 1, ligneDecl: apres + 1,
      })
    }
  }
}

verifie(`${arraysExamines} tableaux de dépendances examinés`, arraysExamines > 50, String(arraysExamines))
verifie('🔴 aucun tableau de dépendances ne lit un const déclaré PLUS BAS',
  coupables.length === 0,
  coupables.map(c => `${c.fichier} : \`${c.nom}\` lu ligne ${c.ligneDep}, déclaré ligne ${c.ligneDecl}`).join(' · '))

console.log(`\nZone morte temporelle : ${ok} vérifications, ${arraysExamines} tableaux de dépendances`)
if (coupables.length > 0) {
  console.log(`\n✕ ${coupables.length} ÉCHEC(S) :`)
  for (const c of coupables) {
    console.log(`   • ${c.fichier}`)
    console.log(`     \`${c.nom}\` est lu ligne ${c.ligneDep} et déclaré ligne ${c.ligneDecl}.`)
    console.log('     Un tableau de dépendances est évalué PENDANT LE RENDU : écran blanc.')
  }
  process.exit(1)
}
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
