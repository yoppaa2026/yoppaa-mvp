// HARNAIS DE MUTATION — L'OUVERTURE À CONFIRMER (30/09 au soir)
//
// Chaque mutation remet une date que personne n'a décidée quelque part, et le
// banc `verif:lancement` doit rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:ouverture

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:lancement'
const LIB = 'lib/lancement.js'
const REVEAL = 'app/components/LandingReveal.js'

const MUTATIONS = [
  { nom: '🔴 l ouverture redevient datée en silence',
    fichier: LIB, de: 'export const OUVERTURE_A_CONFIRMER = true', vers: 'export const OUVERTURE_A_CONFIRMER = false' },
  { nom: '🔴 sans date, la date du 1er octobre reprend la main',
    fichier: LIB, de: '  if (!datee) return true', vers: '' },
  { nom: '🔴 les phrases ignorent le drapeau',
    fichier: LIB, de: 'const dateeOuDrapeau = (datee) => datee === undefined ? ouvertureDatee() : datee', vers: 'const dateeOuDrapeau = (datee) => true' },
  { nom: '🔴 « très bientôt » redevient une date',
    fichier: LIB, de: "  return dateeOuDrapeau(datee) ? `le ${libelleLancement({ avecAnnee })}` : 'très bientôt'", vers: '  return `le ${libelleLancement({ avecAnnee })}`' },
  { nom: '⚠️ « jusqu à l ouverture » disparaît',
    fichier: LIB, de: "  return dateeOuDrapeau(datee) ? `jusqu’au ${libelleLancement()}` : 'jusqu’à l’ouverture'", vers: "  return dateeOuDrapeau(datee) ? `jusqu’au ${libelleLancement()}` : ''" },
  { nom: '🔴 l email de publication promet le 1er octobre',
    fichier: 'lib/resend.js', de: '  const jusqua       = jusquALOuverture()', vers: "  const jusqua       = 'jusqu’au 1er octobre'" },
  { nom: '🔴 l email du kit promet le 1er octobre',
    fichier: 'lib/resend.js', de: '          ${leJourJ()}, ce sont autant de gens', vers: '          le 1er octobre, ce sont autant de gens' },
  { nom: '🔴 le merci de préinscription promet le 1er octobre',
    fichier: 'lib/resend-landing.js', de: '  const quandOuvre = quandOuverture({ avecAnnee: true })', vers: "  const quandOuvre = 'le 1er octobre 2026'" },
  { nom: '🔴 Google lit une publication au 1er octobre',
    fichier: 'lib/seo-landing.js', de: '        ...(ouvertureDatee() ? { datePublished: LAUNCH_DATE_ISO.slice(0, 10) } : {}),', vers: '        datePublished: LAUNCH_DATE_ISO.slice(0, 10),' },
  { nom: '🔴 le compte à rebours revient sans date',
    fichier: REVEAL, de: '          {ouvertureDatee() && <CompteurLancement/>}', vers: '          <CompteurLancement/>' },
  { nom: '🔴 la barre « J-N » revient sans date',
    fichier: REVEAL, de: '  const barreLancement = restant > 0 && ouvertureDatee() ? (', vers: '  const barreLancement = restant > 0 ? (' },
  { nom: '⚠️ « Lancement officiel » garde une date',
    fichier: REVEAL, de: ': <>Lancement officiel très bientôt</>}', vers: ': <>Lancement officiel le {libelleLancement()}</>}' },
  { nom: '⚠️ le merci du formulaire redonne rendez-vous au 1er octobre',
    fichier: REVEAL, de: "'Bien reçu 🟣 On te prévient dès l’ouverture. À très vite !'", vers: '`Bien reçu 🟣 Rendez-vous le ${libelleLancement()}. À très vite !`' },
  { nom: '🔴 la meta description donne une date',
    fichier: 'app/page.tsx', de: "0% de commission Yoppaa pour les commerçants. Lancement ${quandOuverture({ avecAnnee: true })}.`,", vers: '0% de commission Yoppaa pour les commerçants. Lancement le 1er octobre 2026.`,' },
  { nom: '🔴 l affichette relit la date brute',
    fichier: 'app/affichette/[slug]/page.js', de: '? `Ouverture ${quandOuverture()} : ton compteur', vers: '? `Ouverture le ${libelleLancement()} : ton compteur' },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications passées/.test(sortie), extrait: sortie.slice(-400) }
  }
}

const depart = lancer(BANC)
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log(`Banc vert au départ : ${BANC}.\n`)

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const de = m.de.split('\n').join(eol)
  const vers = m.vers.split('\n').join(eol)
  if (!original.includes(de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(de, vers))
  const res = lancer(m.banc || BANC)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉE VERTE`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const finalRouge = lancer(BANC).rouge
if (finalRouge) console.log(`🔴 ${BANC} EST ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
