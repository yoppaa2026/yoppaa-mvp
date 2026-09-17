// HARNAIS DE MUTATION — LE SOCLE DU DEPOT (17/09)
//
// 🔴 CE QU ON MESURE. Dependabot a propose DIX-SEPT paquets d un coup, sous le
// titre « montees mineures », et `next` y etait : 16.3.4 vers 16.3.5, entre
// `lucide-react` et `@types/node`. Personne ne l aurait vu en survolant.
//
// Chaque mutation ci-dessous remet une forme qui a l air innocente et qui fait
// mentir le depot sur ce qui s execute reellement.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-socle.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:socle'
const MODULE = 'package.json'

const DEP = '.github/dependabot.yml'

const MUTATIONS = [
  // ─── LA PLAGE DE VERSIONS, LE VRAI DANGER ───────────────────────────────
  { nom: '🔴 next passe en plage ^ : npm choisit tout seul, le depot ne dit plus la verite',
    de: '"next": "16.3.4"',
    vers: '"next": "^16.3.4"' },

  { nom: '🔴 react passe en plage ~ : deux machines, deux versions',
    de: '"react": "19.2.4"',
    vers: '"react": "~19.2.4"' },

  { nom: '🔴 react-dom accepte n importe quelle 19.x',
    de: '"react-dom": "19.2.4"',
    vers: '"react-dom": ">=19.2.4"' },

  // ─── LE DESACCORD ENTRE REACT ET REACT-DOM ──────────────────────────────
  { nom: '🔴 react-dom avance seul : defauts de rendu que rien ne relie a leur cause',
    de: '"react-dom": "19.2.4"',
    vers: '"react-dom": "19.3.0"' },

  // ─── LE VERROU QUI DIT AUTRE CHOSE QUE LA DECLARATION ───────────────────
  // ⚠️ C EST LE VERROU QUI GAGNE A L INSTALLATION, et personne ne lit un lock.
  // ⚠️ LA CLE AJOUTEE PASSE APRES L ORIGINALE, ET C EST TOUT L ENJEU. Placee
  // avant, JSON garde la DERNIERE : la mutation ne changeait rien et le banc
  // restait vert a juste titre. Une mutation doit changer le RESULTAT.
  { nom: '🔴 le verrou porte une autre version que package.json',
    fichier: 'package-lock.json',
    de: '"resolved": "https://registry.npmjs.org/next/-/next-16.3.4.tgz",',
    vers: '"resolved": "https://registry.npmjs.org/next/-/next-16.3.4.tgz", "version": "16.9.9",' },

  // ─── LA POLITIQUE DE PROPOSITION ────────────────────────────────────────
  { nom: '🔴 les montees MAJEURES redeviennent automatiques : Next 17 se clique',
    fichier: DEP,
    de: '          - version-update:semver-major',
    vers: '          - version-update:semver-premajor' },

  { nom: '⚠️ plusieurs propositions en parallele : impossible de savoir laquelle a casse quoi',
    fichier: DEP,
    de: '    open-pull-requests-limit: 1',
    vers: '    open-pull-requests-limit: 10' },

  { nom: '🔴 la securite se melange aux montees ordinaires : l urgent se noie',
    fichier: DEP,
    de: '        applies-to: security-updates',
    vers: '        applies-to: version-updates' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
