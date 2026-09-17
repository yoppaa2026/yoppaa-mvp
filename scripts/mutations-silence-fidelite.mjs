// HARNAIS DE MUTATION — LE REFUS QUI NE SE VOYAIT PAS (17/09)
//
// 🔴 CE QU ON MESURE. Alex : « deux commandes passees chez Momo, la fidelite est
// activee mais elle ne fonctionne pas ». Le diagnostic a montre 134 commandes
// finalisees et ZERO mouvement de fidelite, jamais, depuis le premier jour.
//
// Le defaut n est pas qu un credit echoue : c est que PERSONNE NE PEUT LE
// SAVOIR. Deux silences en serie :
//
//   1. le tableau de bord appelait `postPro(...).catch(...)`, et un `.catch()`
//      ne se declenche JAMAIS sur un code HTTP ;
//   2. `prevenirClient`, ecrit expres pour corriger ce motif, ne testait que
//      `res.ok`. Or la route repond `NextResponse.json({ ok: false, … })`,
//      c est-a-dire un 200. Un 200 qui dit non.
//
// ⚠️ ET POUR UNE COMMANDE, IL N Y A AUCUN FILET : le cron `fidelite-rdv` ne
// repasse que sur `rdv_reservations`. Un credit manque est de la cagnotte que le
// client ne reverra jamais.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-silence-fidelite.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:livraison'

const FETCH = 'lib/fetch-pro.js'
const DASH = 'app/dashboard/page.js'
const VERDICT = 'lib/verdict-reponse.js'

const MUTATIONS = [
  // ─── LE 200 QUI DIT NON ──────────────────────────────────────────────────
  // 🔴 CES TROIS MUTATIONS-CI ONT D ABORD MESURE UNE COPIE. La regle vivait au
  // milieu de `prevenirClient`, dans un fichier `'use client'` qu aucun banc ne
  // peut importer : j avais donc REJOUE la logique dans le banc, et la
  // troisieme mutation est restee verte en le prouvant. La regle a ete extraite
  // dans `lib/verdict-reponse.js`, pur et executable.
  { nom: '🔴 le corps n est plus lu sur un 200 : le refus passe pour un succes',
    fichier: VERDICT,
    de: '  return corps?.ok === false',
    vers: '  return false' },

  // ⚠️ LE SYMETRIQUE, ET IL COMPTE AUTANT. `!corps?.ok` declarerait en echec
  // toute route qui rend autre chose que `{ ok: true }` — par exemple
  // `{ sent: true }` — et la ligne d alerte s afficherait chez le commercant
  // sans qu il se soit rien passe. Une alarme qui sonne tout le temps ne
  // protege plus rien.
  { nom: '⚠️ `!corps?.ok` au lieu de `=== false` : fausse alarme sur les routes sans champ ok',
    fichier: VERDICT,
    de: '  return corps?.ok === false',
    vers: '  return !corps?.ok' },

  { nom: '🔴 un code HTTP en erreur cesse d etre un refus',
    fichier: VERDICT,
    de: '  if (!estOk) return true',
    vers: '  if (!estOk) return false' },

  { nom: '⚠️ le motif technique passe devant la phrase lisible',
    fichier: VERDICT,
    de: '  return corps?.error || corps?.message || corps?.reason || \'\'',
    vers: '  return corps?.reason || corps?.error || corps?.message || \'\'' },

  { nom: '🔴 la lecture du corps saute : on ne connait plus la raison',
    fichier: FETCH,
    de: '  try { corpsRecu = await res.json() } catch (e) { /* vide ou non JSON : le code suffira */ }',
    vers: '  corpsRecu = null' },

  // ─── LE TABLEAU DE BORD REDEVIENT MUET ───────────────────────────────────
  { nom: '🔴 le credit de fidelite repasse en fire-and-forget',
    fichier: DASH,
    de: "    signalerEnvoi('/api/fidelite/crediter', { commande_id: commandeId },",
    vers: "    postPro('/api/fidelite/crediter', { commande_id: commandeId }) || signalerEnvoi('/api/x', { commande_id: commandeId }," },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident — et ca vient d arriver
    // pour de vrai, sur une zone morte temporelle dans ce meme banc.
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
