// HARNAIS DE MUTATION — LE GABARIT « BOÎTE DE LA TAILLE DE L'ÉCRAN » (04/09).
//
// 🔴 CE QU'ON MESURE : qu'on ne puisse plus tomber dans le vide sous la page.
// Alex, sur iPhone, en revenant par le lien de validation d'email : une bande
// BLANCHE en bas de l'écran, et un défilement sans fin dans ce vide. Un
// rechargement effaçait le symptôme.
//
// Trois pages partagent le gabarit (bandeau figé, zone qui défile, barre de
// navigation) et ne le déclaraient pas pareil : la fiche boutique en
// `height` + `overflow: hidden`, les deux autres en `min-height`. Et aucune
// des trois ne mettait `min-height: 0` sur la zone qui défile, sans quoi son
// `overflow-y: auto` ne peut pas jouer : elle POUSSE son parent.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES. Le dépôt est stocké en LF, mais le
// disque peut porter du CRLF là où git n a pas encore normalisé : une ancre à
// cheval sur deux lignes ne vaut alors que sur une machine. Vérifié par
// npm run verif:ancres.
//
//   node scripts/mutations-gabarit-ecran.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:responsive'

const ACCUEIL = 'app/commander/page.js'
const BOUTIQUE = 'app/commander/[slug]/page.js'
const SERVICES = 'app/commander/rdv/[slug]/page.js'

const MUTATIONS = [
  // ─── LA HAUTEUR REDEVIENT MINIMALE : LA BOÎTE PEUT GRANDIR ──────────────
  { nom: '🔴 l’accueil repasse en hauteur MINIMALE (le defaut d’origine)',
    fichier: ACCUEIL,
    de: '          height: 100dvh; max-width: 760px; margin: 0 auto;',
    vers: '          min-height: 100dvh; max-width: 760px; margin: 0 auto;' },

  { nom: '🔴 la fiche des services repasse en hauteur MINIMALE',
    fichier: SERVICES,
    de: 'column; height: 100dvh; max-width',
    vers: 'column; min-height: 100dvh; max-width' },

  { nom: '🔴 la boite de l’accueil peut a nouveau deborder',
    fichier: ACCUEIL,
    de: '          overflow: hidden;',
    vers: '          overflow-x: hidden;' },

  // ─── LE PIÈGE DE FLEXBOX ────────────────────────────────────────────────
  //
  // `min-height: auto` est la valeur PAR DÉFAUT : la remettre, c'est
  // exactement reproduire le défaut, sans rien casser d'autre.
  { nom: '🔴 la zone qui defile de l’accueil ne peut plus retrecir',
    fichier: ACCUEIL,
    de: '          min-height: 0;',
    vers: '          min-height: auto;' },

  { nom: '🔴 idem sur la fiche boutique',
    fichier: BOUTIQUE,
    de: 'flex: 1; min-height: 0; overflow-y: auto;',
    vers: 'flex: 1; min-height: auto; overflow-y: auto;' },

  { nom: '🔴 idem sur la fiche des services',
    fichier: SERVICES,
    de: 'flex: 1; min-height: 0; overflow-y: auto;',
    vers: 'flex: 1; min-height: auto; overflow-y: auto;' },

  // ─── LA RACINE REDEVIENT BLANCHE ────────────────────────────────────────
  { nom: '🔴 l’accueil cesse de peindre la racine (le trou redevient BLANC)',
    fichier: ACCUEIL,
    de: '        html { background: ${T.bg}; }',
    vers: '        html { color: inherit; }' },

  { nom: '🔴 la fiche boutique cesse de peindre la racine',
    fichier: BOUTIQUE,
    de: '        html { background: ${T.bg}; }',
    vers: '        html { color: inherit; }' },

  { nom: '🔴 la fiche des services cesse de peindre la racine',
    fichier: SERVICES,
    de: '        html { background: ${T.bg}; }',
    vers: '        html { color: inherit; }' },
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
