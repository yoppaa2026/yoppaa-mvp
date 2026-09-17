// HARNAIS DE MUTATION — L ONGLET QUI S ALLUME (17/09)
//
// 🔴 CE QU ON MESURE. Alex : « les onglets du menu ne correspondent pas aux
// categories du menu... TT est decale ». L onglet « Frites » s allumait au
// dessus des desserts, et pas sur une seule categorie : toute la barre etait
// decalee par rapport aux sections.
//
// La regle prenait « la derniere ancre franchie », c est-a-dire la derniere DU
// TABLEAU. Or il vient d un `Object.entries(catRefs.current)`, et un objet
// JavaScript garde l ordre de la PREMIERE insertion de chaque cle : les refs se
// posent au premier rendu, quand les articles arrivent encore, et cet ordre-la
// se fige pendant que les sections, elles, se reordonnent.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-barre-categories.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:responsive'
const RESP = 'lib/responsive.js'

const MUTATIONS = [
  { nom: '🔴 le tri par position saute : l ordre d insertion redecide, tout se decale',
    fichier: RESP,
    de: '    .sort((a, b) => a.offsetTop - b.offsetTop)',
    vers: '    .slice()' },

  { nom: '🔴 le tri part a l envers : le bas de page allume le premier onglet',
    fichier: RESP,
    de: '    .sort((a, b) => a.offsetTop - b.offsetTop)',
    vers: '    .sort((a, b) => b.offsetTop - a.offsetTop)' },

  // ⚠️ LE PIEGE DU ZERO, encore. Une ancre pas encore montee comptee a zero se
  // placerait en tete de page et allumerait le mauvais onglet des le premier
  // pixel. Et sur un tri, elle deregle en plus tout ce qui suit.
  { nom: '🔴 une ancre sans position compte comme zero',
    fichier: RESP,
    de: '    .filter(a => a && Number.isFinite(a.offsetTop))',
    vers: '    .map(a => (a && Number.isFinite(a.offsetTop) ? a : { cat: a?.cat, offsetTop: 0 }))' },

  { nom: '⚠️ la premiere de la liste triee n est plus le repli en haut de page',
    fichier: RESP,
    de: '  let courante = placees[0].cat',
    vers: '  let courante = placees[placees.length - 1].cat' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
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
  const f = chemin(m.fichier)
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
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
