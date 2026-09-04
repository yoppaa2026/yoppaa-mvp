// HARNAIS DE MUTATION — AUCUNE CASE DE CONSENTEMENT PRÉ-COCHÉE (04/09).
//
// 🔴 CE QU'ON MESURE : qu'aucun consentement ne soit donné à la place du
// Yopper. Les deux tunnels pré-cochaient le consentement marketing, avec ce
// commentaire : « maximise le taux d'opt-in ».
//
// Il maximisait un chiffre sans valeur juridique. Un consentement suppose un
// ACTE POSITIF, et ni le silence ni l'inaction n'en sont un : arrêt Planet49,
// Cour de justice de l'Union européenne, C-673/17, 2019. Tout ce qui a été
// récolté case pré-cochée est INEXPLOITABLE.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES : le dépôt est en CRLF.
//
//   node scripts/mutations-consentement.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:formulaires'

const MUTATIONS = [
  { nom: '🔴 la fiche boutique pre-coche a nouveau le consentement',
    fichier: 'app/commander/[slug]/page.js',
    de: 'const [rgpdMarketing, setRgpdMarketing] = useState(false)',
    vers: 'const [rgpdMarketing, setRgpdMarketing] = useState(true)' },

  { nom: '🔴 la fiche des services pre-coche a nouveau le consentement',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: 'const [rgpdMarketing, setRgpdMarketing] = useState(false)',
    vers: 'const [rgpdMarketing, setRgpdMarketing] = useState(true)' },

  { nom: '🔴 la landing pre-coche son consentement de preinscription',
    fichier: 'app/components/LandingReveal.js',
    de: 'consentement_marketing: false,',
    vers: 'consentement_marketing: true,' },

  // ⚠️ ET LE NOM NE DOIT PAS SUFFIRE À S'ÉCHAPPER. Renommer la variable ne doit
  // pas faire taire la garde : elle vise TOUT état dont le nom parle de
  // consentement, de RGPD ou de marketing.
  { nom: '🔴 un consentement renomme echappe a la garde',
    fichier: 'app/commander/[slug]/page.js',
    de: 'const [rgpdMarketing, setRgpdMarketing] = useState(false)',
    vers: 'const [optinOffres, setRgpdMarketing] = useState(true)' },
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
  writeFileSync(f, original.replace(m.de, m.vers), 'utf8')
  const res = lancer()
  writeFileSync(f, original, 'utf8')

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
