// Banc du FILET DE SÉCURITÉ DES HARNAIS.
//
// 🔴 CE QU'IL GARDE : qu'un harnais qui meurt en pleine série ne laisse JAMAIS
// un fichier muté dans le dépôt.
//
// Le 04/09, `writeFileSync` a levé `UNKNOWN` sur un verrou Windows au milieu
// d'une série de 56 mutations. Le dépôt s'en est tiré par chance : l'écriture
// ratée était celle qui POSE la mutation. Si ç'avait été la restauration, le
// harnais serait mort en laissant du code cassé, et son propre contrôle de
// restauration n'aurait jamais tourné — il vient après l'écriture.
//
// ⚠️ ET CE BANC S'EXÉCUTE VRAIMENT. Il fabrique un fichier, lance un VRAI
// processus fils qui le mute puis meurt de trois façons différentes, et relit
// le fichier. Chercher `process.on('exit')` dans le code ne prouverait rien :
// c'est le comportement à la mort qu'on veut, pas la présence d'une ligne.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}

const ICI = dirname(fileURLToPath(import.meta.url))
const BAC = join(ICI, '..', '.harnais-test')
const CIBLE = join(BAC, 'cible.txt')
const ORIGINE = 'contenu d origine\n'
const MUTE = 'CONTENU MUTE\n'

mkdirSync(BAC, { recursive: true })

// Un fils qui mute le fichier puis meurt de la façon demandée. Le filet doit
// restaurer dans les trois cas.
function fils(façonDeMourir) {
  writeFileSync(CIBLE, ORIGINE, 'utf8')
  // ⚠️ UNE URL DE FICHIER, PAS UN CHEMIN WINDOWS. « c:/... » se lit comme un
  // schéma d'URL inconnu et l'import échoue — c'est ce qui a rendu ce banc
  // faussement vert à sa première exécution.
  const script = `
    import { ecrireSur } from ${JSON.stringify(pathToFileURL(join(ICI, 'harnais-mutation.mjs')).href)}
    ecrireSur(${JSON.stringify(CIBLE)}, ${JSON.stringify(MUTE)})
    // 🔴 LA PREUVE QUE LA MUTATION A EU LIEU. Sans elle, un fils qui meurt
    // AVANT d'écrire laisse le fichier intact et le banc verdit sans avoir
    // rien mesuré.
    console.log('MUTATION POSEE')
    ${façonDeMourir}
  `
  let sortie = ''
  try {
    sortie = execFileSync(process.execPath, ['--input-type=module', '--eval', script],
      { encoding: 'utf8', stdio: 'pipe' })
  } catch (e) {
    sortie = `${e.stdout || ''}${e.stderr || ''}`
  }
  return { contenu: readFileSync(CIBLE, 'utf8'), sortie, posee: /MUTATION POSEE/.test(sortie) }
}

// 🔴 ON REFUSE DE CONCLURE SI LA MUTATION N'A PAS EU LIEU. C'est le piège des
// tests faussement verts, et il s'est présenté à la première exécution : le
// fils plantait à l'import, le fichier restait intact, et tout passait au vert.
const mutationPosee = (nom, r) =>
  verifier(`${nom} — la mutation a bien ete posee`, r.posee, r.sortie.slice(0, 220))

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA MORT PAR EXCEPTION
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 C'EST LE CAS RÉEL DU 04/09. Le harnais lève au milieu de sa série ; sans
// filet, le fichier reste muté et personne ne le sait.
{
  const r = fils('throw new Error("le harnais explose")')
  mutationPosee('exception', r)
  verifier('🔴 une exception ne laisse pas le fichier mute',
    r.contenu === ORIGINE, JSON.stringify(r.contenu))
  // ⚠️ ET ON DIT POURQUOI. Sans ce message, on croirait le harnais menteur.
  verifier('et le filet dit qu il a plante',
    /LE HARNAIS A PLANTÉ/.test(r.sortie), r.sortie.slice(0, 200))
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LA MORT PAR `process.exit`
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ TOUS LES HARNAIS SORTENT AINSI, y compris sur leur propre garde
// « RESTAURATION RATÉE ». Le filet doit passer avant.
{
  const r = fils('process.exit(2)')
  mutationPosee('process.exit', r)
  verifier('🔴 un process.exit ne laisse pas le fichier mute',
    r.contenu === ORIGINE, JSON.stringify(r.contenu))
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LA SORTIE NORMALE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ UN FILET QUI RESTAURE TOUJOURS SERAIT INUTILISABLE : le harnais mute
// EXPRÈS, et doit pouvoir lancer son banc sur la version mutée. Ce qu'on veut,
// c'est qu'il restaure ce qui reste muté À LA FIN.
{
  const r = fils('')
  mutationPosee('sortie normale', r)
  verifier('🔴 la sortie normale restaure aussi', r.contenu === ORIGINE, JSON.stringify(r.contenu))
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LE FICHIER DÉJÀ RESTAURÉ PAR LE HARNAIS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ LE FILET NE DOIT RIEN RÉÉCRIRE quand le harnais a fait son travail : une
// réécriture inutile changerait la date du fichier et relancerait des
// veilleurs pour rien.
{
  const r = fils(`
    ecrireSur(${JSON.stringify(CIBLE.replace(/\\/g, '/'))}, ${JSON.stringify(ORIGINE)})
    console.log('RESTAURE PAR LE HARNAIS')
  `)
  verifier('🔴 deux orthographes du meme chemin ne font qu une entree',
    r.contenu === ORIGINE && /RESTAURE PAR LE HARNAIS/.test(r.sortie), r.sortie.slice(0, 200))
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LA PREMIÈRE ÉCRITURE FAIT FOI
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 UNE BOUCLE MUTE LE MÊME FICHIER DIX FOIS. Si le filet relevait l'origine à
// CHAQUE écriture, la deuxième mutation deviendrait « l'origine » et le dépôt
// finirait avec la dernière mutation en place. C'est le défaut qui rendrait le
// filet pire que rien.
{
  const r = fils(`
    ecrireSur(${JSON.stringify(CIBLE.replace(/\\/g, '/'))}, 'DEUXIEME MUTATION\\n')
    ecrireSur(${JSON.stringify(CIBLE.replace(/\\/g, '/'))}, 'TROISIEME MUTATION\\n')
    throw new Error('mort apres trois mutations')
  `)
  verifier('🔴 trois mutations de suite reviennent au VRAI original',
    r.contenu === ORIGINE, JSON.stringify(r.contenu))
}

rmSync(BAC, { recursive: true, force: true })

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Filet des harnais vert.')
