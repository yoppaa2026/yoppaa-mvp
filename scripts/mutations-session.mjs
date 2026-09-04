// HARNAIS DE MUTATION — LE RAPPEL D'AUTH QUI FERMAIT L'APPLICATION (31/08).
//
// 🔴 CE QU'ON MESURE : que le rappel `onAuthStateChange` RENDE LA MAIN avant de
// rappeler l'authentification, et que le délai de chargement garde TOUTE
// l'opération et pas sa seule moitié HTTP.
//
// Le défaut ne se voyait pas : « On réveille ton quartier » pour toujours, sur
// iPhone comme sur Android, une ouverture sur deux. La bibliothèque attend le
// rappel en tenant son verrou ; le rappel attendait la bibliothèque. La branche
// ré-entrante du verrou n'a AUCUN délai, donc l'attente était éternelle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON. C'est pourquoi on
//    ne SUPPRIME pas le `.catch` : sans lui, la promesse rejetée ferait TOMBER
//    node au lieu de faire rougir le banc, et un banc qui explose ne mesure
//    rien. On le fait MENTIR à la place.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES : le dépôt est en CRLF, un `\n` nu ne
//    correspondrait jamais et la mutation serait « introuvable » en silence.
//
//   node scripts/mutations-session.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:session'

const SESSION = 'lib/session-permanente.js'
const ACCUEIL = 'app/commander/page.js'

const MUTATIONS = [
  // ─── LE CŒUR : LE RAPPEL REDEVIENT BLOQUANT ─────────────────────────────
  { nom: '🔴 le rappel redevient `async` (la bibliothèque l’attendrait)',
    fichier: SESSION,
    de: '  return (event, session) => {',
    vers: '  return async (event, session) => {' },

  { nom: '🔴 la restauration repart PENDANT le rappel, verrou tenu',
    fichier: SESSION,
    de: '      differer(() => {',
    vers: '      ((f) => f())(() => {' },

  { nom: '🔴 une restauration qui lève ne dit plus la perte',
    fichier: SESSION,
    de: '          .catch(() => surSessionPerdue?.(true))',
    vers: '          .catch(() => surSessionPerdue?.(false))' },

  { nom: '🔴 une restauration ratée se tait',
    fichier: SESSION,
    de: '          .then(revenue => surSessionPerdue?.(!revenue))',
    vers: '          .then(() => surSessionPerdue?.(false))' },

  { nom: '🔴 une déconnexion VOULUE déclenche quand même une restauration',
    fichier: SESSION,
    de: '      if (voulue()) { surSessionPerdue?.(false); return }',
    vers: '      if (false) { surSessionPerdue?.(false); return }' },

  { nom: '🔴 les évènements heureux ne mémorisent plus la session',
    fichier: SESSION,
    de: '      if (session) memoriser(session)',
    vers: '      if (false) memoriser(session)' },

  { nom: '🔴 le rappel de la session cesse de passer par la fabrique mesurée',
    fichier: SESSION,
    de: '    construireRappelAuth({ surSessionPerdue })',
    vers: '    (e) => { if (e === "SIGNED_OUT") surSessionPerdue?.(true) }' },

  // ─── LA PORTE DE SORTIE DE L'ACCUEIL ────────────────────────────────────
  //
  // 🔴 C'est le défaut du 25/08 : l'abandon coupe le `fetch`, mais le blocage
  // se produit AVANT que la requête ne parte, à la résolution du jeton.
  { nom: '🔴 le délai redevient un simple abandon, sans rejet',
    fichier: ACCUEIL,
    de: "        rejeter(new Error('delai_depasse'))",
    vers: '        void 0' },

  { nom: '🔴 l’échéance existe mais plus personne ne l’attend',
    fichier: ACCUEIL,
    de: '        echeance,',
    vers: '' },

  { nom: '🔴 le drapeau de chargement ne retombe plus',
    fichier: ACCUEIL,
    de: '      setCommercesEnChargement(false)',
    vers: '      void 0' },

  // ─── ET LA RÈGLE VAUT POUR LES FRÈRES ───────────────────────────────────
  //
  // ⚠️ Deux autres rappels d'auth existent dans l'application. Ils sont sains
  // aujourd'hui ; la garde doit les tenir DEMAIN.
  { nom: '🔴 un AUTRE rappel d’auth devient `async` (le frère non gardé)',
    fichier: ACCUEIL,
    de: '    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {',
    vers: '    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {' },
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
