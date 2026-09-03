// HARNAIS DE MUTATION — LE CHOIX DE LA COMMUNE (03/09).
//
// 🔴 CE QU'ON MESURE : qu'on retrouve sa commune en tapant, SANS perdre la
// liste. C'était un `<select>` de 260 entrées, toute la Wallonie dans un menu,
// et c'était le tout premier geste demandé à un Yopper qui venait de se
// connecter.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
//
//    C'est pourquoi la conversion des codes postaux en chaîne se mute en
//    « les nombres deviennent vides » et non en « on retire le String() » :
//    sans conversion, `cp.startsWith` sur un nombre LÈVE, et le banc
//    exploserait au lieu de rougir. Un banc qui explose ne mesure rien.
//
//    Et le classement se mute en s'INVERSANT plutôt qu'en disparaissant : le
//    retirer laisserait l'ordre alphabétique, qui donne le même résultat sur
//    ce jeu d'essai. Une mutation qui ne change rien ne prouve rien.
//
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES : le dépôt est en CRLF.
//
//   node scripts/mutations-choix-commune.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:yopper'

const RECHERCHE = 'lib/recherche-commune.js'
const NORMALISE = 'lib/texte-normalise.js'
const CHAMP = 'app/components/ChampCommune.js'
const MODALE = 'app/commander/ConfirmCommune.js'

const MUTATIONS = [
  // ─── LA GARDE PRINCIPALE : LA LISTE RESTE ───────────────────────────────
  { nom: '🔴 sans recherche, la liste devient VIDE (le geste échangé contre un autre)',
    fichier: RECHERCHE,
    de: 'if (tokens.length === 0) return liste',
    vers: 'if (tokens.length === 0) return []' },

  // ─── LA RÈGLE DE CORRESPONDANCE ─────────────────────────────────────────
  { nom: '🔴 le préfixe redevient un morceau (« amur » ramènerait Namur)',
    fichier: RECHERCHE,
    de: 'mots.some(m => m.startsWith(t))',
    vers: 'mots.some(m => m.includes(t))' },

  { nom: '🔴 un nom composé cesse de se découper (« alleud » ne trouve plus rien)',
    fichier: RECHERCHE,
    de: 'return sansAccents(valeur).split(/[^a-z0-9]+/).filter(Boolean)',
    vers: 'return sansAccents(valeur).split(/\\s+/).filter(Boolean)' },

  { nom: '🔴 tous les mots tapés ne doivent plus correspondre',
    fichier: RECHERCHE,
    de: 'return tokens.every(t =>',
    vers: 'return tokens.some(t =>' },

  { nom: '🔴 le code postal ne cherche plus',
    fichier: RECHERCHE,
    de: 'codes.some(cp => cp.startsWith(t))',
    vers: 'codes.some(cp => cp === null)' },

  { nom: '🔴 un code postal en NOMBRE cesse d’être lu',
    fichier: RECHERCHE,
    de: ".map(v => String(v ?? ''))",
    vers: ".map(v => (typeof v === 'string' ? v : ''))" },

  { nom: '🔴 le classement s’inverse (le nom qui commence passe derrière)',
    fichier: RECHERCHE,
    de: 'const rang = (c) => (sansAccents(c?.nom).startsWith(q) ? 0 : 1)',
    vers: 'const rang = (c) => (sansAccents(c?.nom).startsWith(q) ? 1 : 0)' },

  { nom: '🔴 les accents ne sont plus retirés',
    fichier: NORMALISE,
    de: ".normalize('NFD')",
    vers: ".normalize('NFC')" },

  // ─── L'ÉCRAN ────────────────────────────────────────────────────────────
  { nom: '🔴 le champ refait la règle au lieu de la demander à la lib',
    fichier: CHAMP,
    de: 'useMemo(() => filtrerCommunes(communes, requete), [communes, requete])',
    vers: 'useMemo(() => communes, [communes, requete])' },

  { nom: '🔴 la liste se remet à être coupée en silence',
    fichier: CHAMP,
    de: ') : resultats.map(c => {',
    vers: ') : resultats.slice(0, 8).map(c => {' },

  { nom: '🔴 ce qui est retenu cesse d’être affiché',
    fichier: CHAMP,
    de: 'Commune retenue : <strong>',
    vers: 'Ta zone : <strong>' },

  { nom: '🔴 la modale cesse de passer par le champ partagé',
    fichier: MODALE,
    de: '<ChampCommune',
    vers: '<span' },

  { nom: '🔴 la liste déroulante de 260 entrées revient',
    fichier: MODALE,
    de: '<div style={{ marginBottom: 16 }}>',
    vers: '<div style={{ marginBottom: 16 }}><select/>' },
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
