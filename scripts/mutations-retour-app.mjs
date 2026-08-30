// HARNAIS DE MUTATION — LE RETOUR PAR UN LIEN D'EMAIL (30/08).
//
// 🔴 CE QU'ON MESURE. Alex annule un rendez-vous depuis le lien reçu par email.
// iOS ouvre ce lien dans le NAVIGATEUR, pas dans l'application installée. Il
// annule, clique « Retour à Yoppaa », et se retrouve dans une application qui ne
// le reconnaît pas, lui redemande sa position, et lui annonce « SESSION
// EXPIRÉE » alors qu'il ne s'est jamais connecté sur ce navigateur.
//
// ⚠️ CE HARNAIS EXISTE PARCE QUE DEUX DES TROIS CORRECTIFS SONT DES PHRASES.
// Une phrase se vérifie par recherche de mot, et une recherche de mot est le
// piège de ce projet : elle reste verte quand la phrase change de sens. On
// remet donc chaque défaut sous le nez du banc, un par un.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
//
//   node scripts/mutations-retour-app.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:session'

const MUTATIONS = [
  // ─── 1) « SESSION EXPIRÉE » DIT À QUELQU'UN QUI N'A JAMAIS EU DE SESSION ─
  { nom: '🔴 une absence de session redevient une « expiration »',
    fichier: 'lib/retour-app.js',
    de: '    titre: \'Pas encore connecté ici\',',
    vers: '    titre: \'Session expirée\',' },

  { nom: '🔴 on dit « RECONNECTE-toi » à qui ne s’est jamais connecté ici',
    fichier: 'lib/retour-app.js',
    de: '    texte: \'Connecte-toi sur ce navigateur pour retrouver tes commandes et tes rendez-vous. Rien n’est perdu 🟣\',',
    vers: '    texte: \'Reconnecte-toi pour retrouver tes commandes et tes rendez-vous. Rien n’est perdu 🟣\',' },

  { nom: '🔴 le bouton promet une RE-connexion qui n’a jamais eu lieu',
    fichier: 'lib/retour-app.js',
    de: '    bouton: \'Se connecter\',',
    vers: '    bouton: \'Se reconnecter\',' },

  // ⚠️ LE DÉFAUT PAR DÉFAUT DOIT ÊTRE LE PRUDENT : sans preuve qu'une session
  // ait existé, on ne parle pas d'une expiration qu'on n'a pas constatée.
  { nom: '🔴 sans preuve, on parle quand même d’expiration',
    fichier: 'lib/retour-app.js',
    de: 'export function libelleAccesPerdu({ dejaConnecte = false } = {}) {',
    vers: 'export function libelleAccesPerdu({ dejaConnecte = true } = {}) {' },

  { nom: '🔴 le message cesse de rassurer sur ce qui n’est pas perdu',
    fichier: 'lib/retour-app.js',
    de: '    texte: \'Connecte-toi sur ce navigateur pour retrouver tes commandes et tes rendez-vous. Rien n’est perdu 🟣\',',
    vers: '    texte: \'Connecte-toi sur ce navigateur.\',' },

  // ─── 2) LA MARQUE QUI PORTE LA DISTINCTION ──────────────────────────────
  { nom: '🔴 la marque « déjà connecté ici » n’est plus posée',
    fichier: 'lib/session-permanente.js',
    de: "  ecrire(CLE_DEJA_CONNECTE, '1')",
    vers: '  void CLE_DEJA_CONNECTE' },

  // 🔴 SI ELLE S'EFFACE, quelqu'un qui se déconnecte puis revient redevient un
  // inconnu, et le bandeau lui parle comme à un nouveau venu.
  { nom: '🔴 la marque s’efface à la déconnexion volontaire',
    fichier: 'lib/session-permanente.js',
    de: "  ecrire(CLE_VOLONTAIRE, '1')\n  effacer(CLE_COPIE)",
    vers: "  ecrire(CLE_VOLONTAIRE, '1')\n  effacer(CLE_COPIE)\n  effacer(CLE_DEJA_CONNECTE)" },

  // ─── 3) L'ÉCRAN QUI DEVRAIT LIRE LA RÈGLE ───────────────────────────────
  //
  // 🔴 UNE RÈGLE SANS APPELANT EST DU CODE MORT, et c'est le motif qui revient
  // le plus souvent sur ce projet : la fonction existe, elle est juste, et
  // personne ne l'appelle.
  { nom: '🔴 le bandeau réécrit sa phrase au lieu de lire la règle',
    fichier: 'app/commander/page.js',
    de: '                  {libelleAccesPerdu({ dejaConnecte: dejaVenuIci }).titre}',
    vers: '                  Session expirée' },

  { nom: '🔴 la marque n’est plus relue au moment de la perte',
    fichier: 'app/commander/page.js',
    de: '      if (perdue) setDejaVenuIci(dejaConnecteIci())',
    vers: '      if (perdue) setDejaVenuIci(true)' },

  // ─── 4) DIRE OÙ ON EST, SANS RIEN PROMETTRE ─────────────────────────────
  { nom: '🔴 on ne dit plus au Yopper qu’il est dans son navigateur',
    fichier: 'lib/retour-app.js',
    de: "  return 'Tu es dans ton navigateur : les liens d’email s’y ouvrent toujours. '\n    + 'Ouvre Yoppaa depuis ton écran d’accueil pour retrouver tes commandes, '\n    + 'tes rendez-vous et ta position.'",
    vers: "  return 'Reconnecte-toi.'" },

  // 🔴 LA PHRASE S'AFFICHE DANS L'APPLICATION ELLE-MÊME : elle y serait fausse,
  // et elle enverrait quelqu'un chercher une application qu'il a déjà ouverte.
  { nom: '🔴 la phrase s’affiche même dans l’application',
    fichier: 'lib/retour-app.js',
    de: '  if (dansLApp !== false) return null',
    vers: '  if (dansLApp === true && false) return null' },

  // ⚠️ IPHONE N'A QUE `navigator.standalone` : Safari n'a jamais implémenté
  // `display-mode: standalone` pour les applications de l'écran d'accueil.
  // Sans lui, on dit « tu es dans un navigateur » à quelqu'un qui est dans
  // l'application.
  { nom: '🔴 la détection oublie le seul signal disponible sur iPhone',
    fichier: 'lib/retour-app.js',
    de: '    if (window.navigator?.standalone === true) return true',
    vers: '    if (false) return true' },

  // ─── 5) LES DEUX ÉCRANS DE RETOUR SONT FRÈRES ───────────────────────────
  //
  // ⚠️ LA COMMANDE ET LE RENDEZ-VOUS S'ANNULENT TOUS LES DEUX par un lien
  // d'email. N'en corriger qu'un, c'est le défaut qui revient le plus souvent
  // sur ce projet.
  { nom: '🔴 l’écran d’annulation de commande redevient muet',
    fichier: 'app/commander/cancel/page.js',
    de: '            <NoteHorsApp/>',
    vers: '' },

  { nom: '🔴 l’écran d’annulation de rendez-vous redevient muet',
    fichier: 'app/commander/rdv/cancel/page.js',
    de: '            <NoteHorsApp/>',
    vers: '' },
]

function lancer() {
  try {
    execSync(`npm run ${BANC}`, { cwd: RACINE, stdio: 'pipe', encoding: 'utf8' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ROUGIR N'EST PAS PLANTER. Un banc qui explose sur une exception ne
    // mesure rien : il faut qu'il ait COMPTÉ ses échecs.
    const aRougiProprement = /ÉCHEC\(S\)/.test(sortie)
    return { rouge: true, plante: !aRougiProprement, extrait: sortie.slice(-500) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`✕ ${BANC} DÉJÀ rouge avant toute mutation.`)
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
  writeFileSync(f, original.replace(m.de, m.vers))
  const r = lancer()
  // ⚠️ RESTAURATION PAR LE CONTENU MÉMORISÉ, et vérifiée : un `git checkout`
  // effacerait le travail non commité du dépôt.
  writeFileSync(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. Arrêt.`)
    process.exit(1)
  }

  if (r.plante) {
    manquees.push(`${m.nom} — le banc a PLANTÉ au lieu de rougir`)
    console.log(`  ⚠ plantage : ${m.nom}`)
  } else if (r.rouge) {
    attrapees++
    console.log(`  ✓ attrapée : ${m.nom}`)
  } else {
    manquees.push(`${m.nom} — RESTÉ VERT`)
    console.log(`  ✕ MANQUÉE  : ${m.nom}`)
  }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) {
  console.log('\nNON ATTRAPÉES :')
  manquees.forEach(m => console.log(`   • ${m}`))
}

const fin = lancer()
console.log(fin.rouge ? '\n🔴 Banc ROUGE après restauration.' : '\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || fin.rouge ? 1 : 0)
