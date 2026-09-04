// LE FILET DE SÉCURITÉ DES HARNAIS DE MUTATION.
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 LE DÉFAUT DU 04/09 : UN HARNAIS QUI MEURT EN LAISSANT UN FICHIER MUTÉ.
//
// `writeFileSync` a levé `UNKNOWN: unknown error, open` en pleine série, sur
// Windows : un verrou passager, posé par un antivirus ou par le veilleur de
// fichiers d'un build qui tourne à côté. Rien à voir avec le code mesuré.
//
// Le dépôt s'en est tiré cette fois-là parce que l'écriture ratée était celle
// qui POSE la mutation : le fichier n'avait pas encore bougé.
//
// ⚠️ MAIS SI C'ÉTAIT LA RESTAURATION QUI AVAIT ÉCHOUÉ, le harnais serait mort
// en laissant un fichier MUTÉ dans le dépôt. Et son contrôle de restauration
// n'aurait jamais tourné : il vient APRÈS l'écriture, donc après l'exception.
// **Un outil qui vérifie la restauration mais qui meurt avant de la vérifier
// ne protège de rien.**
//
// Le pire n'est pas le fichier cassé, c'est le SILENCE : on aurait poussé une
// garde désarmée en croyant la mesurer.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ POURQUOI UN MODULE PARTAGÉ, ET PAS QUINZE CORRECTIFS. Le dépôt compte
// seize harnais, en quatre variantes du même code recopié. C'est exactement
// l'histoire de `lire-code.mjs` : il vivait recopié dans huit bancs, en trois
// variantes, et son défaut aurait dû être corrigé huit fois. Il l'aurait été
// une ou deux.
//
// ⚠️ ET LE REMÈDE N'EST PAS UN ORDRE, C'EST UN DÉSARMEMENT DU PIÈGE. On ne
// demande pas aux harnais de « penser à restaurer » : le filet restaure tout
// seul, sur TOUTES les sorties, y compris celles qu'on n'a pas prévues.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Chemin → contenu d'origine, relevé à la PREMIÈRE écriture sur ce fichier.
// C'est bien le premier qui compte : les suivantes sont des mutations.
const originaux = new Map()
let filetPose = false

// ⚠️ UNE ATTENTE BLOQUANTE, ET C'EST VOULU. Ces scripts sont synchrones de bout
// en bout, et un `await` ici rendrait la main à la boucle avant que l'écriture
// ait eu lieu. Un verrou de fichier se relâche en quelques dizaines de
// millisecondes ; on ne cherche pas à être élégant, on cherche à ne pas laisser
// un dépôt cassé derrière soi.
function patienter(ms) {
  const fin = Date.now() + ms
  while (Date.now() < fin) { /* on laisse le verrou se relâcher */ }
}

function ecrireAvecInsistance(fichier, contenu, essais = 5) {
  let derniere = null
  for (let i = 0; i < essais; i++) {
    try { writeFileSync(fichier, contenu, 'utf8'); return null }
    catch (e) { derniere = e; patienter(120) }
  }
  return derniere
}

/**
 * Restaure tout ce qui a été touché et qui diffère encore de son origine.
 *
 * ⚠️ ELLE NE SUPPOSE RIEN. Elle relit chaque fichier et ne réécrit que ceux qui
 * ont vraiment changé : appelée sur une sortie normale, elle ne fait rien, et
 * son passage ne coûte donc jamais rien.
 */
export function restaurerTout() {
  let casses = []
  for (const [fichier, origine] of originaux) {
    let actuel
    try { actuel = readFileSync(fichier, 'utf8') } catch { actuel = null }
    if (actuel === origine) continue
    const echec = ecrireAvecInsistance(fichier, origine)
    if (echec) casses.push(`${fichier} (${echec.message})`)
  }
  if (casses.length) {
    // ⚠️ ON HURLE. Un dépôt muté qui se tait est le pire des deux mondes.
    console.log('\n🔴 FICHIERS LAISSÉS MUTÉS, À CORRIGER À LA MAIN :')
    casses.forEach(c => console.log('   • ' + c))
    console.log('   git status, puis git checkout -- <fichier> si le contenu d origine est committé.')
  }
  return casses.length === 0
}

function poserLeFilet() {
  if (filetPose) return
  filetPose = true
  // ⚠️ `exit` COUVRE TOUT : la fin normale, `process.exit()` appelé par le
  // harnais lui-même, et la remontée d'une exception. Son gestionnaire doit
  // être SYNCHRONE, ce que `writeFileSync` est.
  process.on('exit', () => { restaurerTout() })
  // ⚠️ ET CELUI-CI SERT À DIRE POURQUOI. Sans lui, une exception s'affiche
  // après la restauration et on croit que le harnais a menti.
  process.on('uncaughtException', (e) => {
    console.log(`\n🔴 LE HARNAIS A PLANTÉ : ${e?.message}`)
    console.log('   Le filet restaure les fichiers touchés avant de sortir.')
    process.exit(3)
  })
  // Ctrl+C au mauvais moment laisse une mutation en place, sinon.
  process.on('SIGINT', () => { console.log('\n⚠️ Interrompu. Restauration.'); process.exit(130) })
}

/**
 * Écrit un fichier en retenant son contenu d'origine, et en insistant.
 *
 * @returns true si l'écriture a eu lieu, false sinon (et le dit à l'écran).
 */
export function ecrireSur(fichier, contenu) {
  poserLeFilet()
  // 🔴 LA CLÉ EST LE CHEMIN NORMALISÉ, ET SON BANC L'A EXIGÉ.
  //
  // Les harnais écrivent « c:/Users/... » avec des barres droites, Node et le
  // système rendent « c:\Users\... ». Deux orthographes du MÊME fichier
  // fabriquaient deux entrées : la seconde relevait comme « origine » ce que la
  // première venait de muter, et le filet aurait restauré... la mutation.
  //
  // ⚠️ UN FILET QUI RESTAURE LA MUTATION EST PIRE QU'AUCUN FILET : il donne la
  // certitude d'un dépôt propre, et laisse le code cassé.
  const cle = resolve(fichier)
  if (!originaux.has(cle)) {
    originaux.set(cle, readFileSync(cle, 'utf8'))
  }
  const echec = ecrireAvecInsistance(cle, contenu)
  if (echec) {
    console.log(`\n⚠️ ÉCRITURE IMPOSSIBLE sur ${fichier} après 5 essais : ${echec.message}`)
    return false
  }
  return true
}

/** Le contenu d'origine retenu pour ce fichier, s'il en existe un. */
export function origineDe(fichier) {
  return originaux.get(resolve(fichier)) ?? null
}
