// HARNAIS DE MUTATION — UNE FAILLE N'EST PAS UNE PANNE (04/09).
//
// 🔴 CE QU'ON MESURE : que l'étape « Aucune faille en production » distingue
// « je n'ai rien trouvé » de « je n'ai rien pu regarder ».
//
// `npm audit` rend 1 dans les deux cas. Le service d'avis de sécurité de npm
// répondait 503, et cette étape rougissait à CHAQUE poussée depuis des
// semaines : Alex recevait un courriel d'échec systématique et avait appris à
// l'ignorer, ce qui est parfaitement rationnel.
//
// ⚠️ UNE ALARME QUI SONNE TOUT LE TEMPS NE PROTÈGE PLUS RIEN. Le jour où une
// faille réelle apparaîtrait, le signal serait identique à celui de la veille.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON : c'est pourquoi on
//    ne SUPPRIME pas la garde des compteurs absents, qui ferait LEVER la boucle
//    au lieu de faire rougir le banc. On la fait MENTIR à la place.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES : le dépôt est en CRLF.
//
//   node scripts/mutations-audit-securite.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:logique'

const JUGE = 'scripts/lire-audit.mjs'
const FLUX = '.github/workflows/verification.yml'

const MUTATIONS = [
  // ─── LE CŒUR : LA PANNE LUE COMME UNE ABSENCE DE FAILLE ─────────────────
  { nom: '🔴 un service muet passe pour « aucune faille » (le defaut d origine)',
    fichier: JUGE,
    de: '    return { lisible: false, compte: 0, total: 0, detail: {} }',
    vers: '    return { lisible: true, compte: 0, total: 0, detail: {} }' },

  // ─── LE SEUIL ───────────────────────────────────────────────────────────
  { nom: '🔴 les failles MODEREES cessent d etre comptees',
    fichier: JUGE,
    de: "const SEUIL = ['moderate', 'high', 'critical']",
    vers: "const SEUIL = ['high', 'critical']" },

  { nom: '🔴 les avis « low » se mettent a faire rougir',
    fichier: JUGE,
    de: "const SEUIL = ['moderate', 'high', 'critical']",
    vers: "const SEUIL = ['low', 'moderate', 'high', 'critical']" },

  { nom: '🔴 plus rien ne s additionne (tout audit passe pour propre)',
    fichier: JUGE,
    de: '    if (n > 0) { detail[niveau] = n; compte += n }',
    vers: '    if (false) { detail[niveau] = n; compte += n }' },

  // ─── ET L'ÉTAPE DOIT PASSER PAR LE JUGE ─────────────────────────────────
  { nom: '🔴 le workflow revient au code de sortie brut de npm audit',
    fichier: FLUX,
    de: '          node scripts/lire-audit.mjs audit.json',
    vers: '          echo "audit lu"' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
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
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
