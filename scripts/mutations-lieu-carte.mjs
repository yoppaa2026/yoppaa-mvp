// HARNAIS DE MUTATION — LE LIEU AFFICHÉ SUR UNE CARTE DE COMMERCE (17/09)
//
// 🔴 CE QU ON MESURE. Sous le titre « Le Dressing de Sophie », la ligne censée
// dire OU se trouve ce commerce annonçait « Le Dressing de Sophie · 43 m ».
// Trois commerces sur trois, sur une capture destinee aux stores.
//
// La garde qui aurait du l empecher existait : l accueil masquait le libelle du
// lieu quand `source === 'siege'`. Mais le siege a cesse d etre un lieu le
// 15/08, `normaliser()` pose `source: lieu.type`, et cette comparaison ne
// pouvait plus jamais etre vraie. Verte, commentee d une regle juste, et
// complice depuis un mois.
//
// Chaque mutation ci-dessous remet une forme de ce defaut : soit elle rend le
// masquage inoperant, soit elle le rend trop large et fait disparaitre un lieu
// que le client a besoin de lire.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-lieu-carte.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const LIB = 'lib/adresse-localite.js'
const ECRAN = 'app/commander/page.js'

const MUTATIONS = [
  // ─── LE MASQUAGE NE MASQUE PLUS RIEN ────────────────────────────────────
  { nom: '🔴 tout libelle apporte un lieu : le nom du commerce revient en double',
    banc: 'verif:yopper', fichier: LIB,
    de: "  return !libelle.split(' ').every((mot) => motsDuNom.has(mot))",
    vers: '  return true' },

  { nom: '🔴 seule l egalite exacte masque : « Chez Momo » survit sous « Chez Momo - Friterie »',
    banc: 'verif:yopper', fichier: LIB,
    de: "  return !libelle.split(' ').every((mot) => motsDuNom.has(mot))",
    vers: '  return libelle !== nom' },

  { nom: '🔴 la casse et les accents ne sont plus neutralises',
    banc: 'verif:yopper', fichier: LIB,
    de: "  return sansAccents(valeur).replace(/[^a-z0-9]+/g, ' ').trim()",
    vers: "  return String(valeur ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()" },

  // ─── LE MASQUAGE MASQUE TROP ────────────────────────────────────────────
  // ⚠️ LE SYMETRIQUE COMPTE AUTANT. Une regle trop large efface « Salle
  // Saint-Roch » et rend une professeure de yoga introuvable : le defaut que le
  // module LIEUX avait justement corrige.
  { nom: '⚠️ sans nom a comparer on se tait : un libelle utile disparait',
    banc: 'verif:yopper', fichier: LIB,
    de: '  if (!nom) return true',
    vers: '  if (!nom) return false' },

  // ─── LA REGLE OUBLIE LE REPLI PAR COMMUNE ───────────────────────────────
  // ⚠️ SANS GEOLOCALISATION, LA CARTE PASSE SUR LA COMMUNE. Une regle posee sur
  // la seule branche « distance » laisse le doublon revenir des qu un Yopper
  // refuse le mouchard, c est-a-dire pour une bonne part des visiteurs.
  //
  // 🔴 MA PREMIERE VERSION DE CETTE MUTATION NE MESURAIT RIEN. Elle remplacait
  // `${libelle}` par `${libelleLieu}` DANS le ternaire en laissant sa condition
  // intacte : `libelle` valant null, le chemin partait sur l autre branche et le
  // texte mute n etait jamais evalue. Le banc restait vert a juste titre.
  // Une mutation doit changer le RESULTAT : on vise donc la CONDITION.
  { nom: '🔴 le repli par commune reaffiche le libelle brut',
    banc: 'verif:yopper', fichier: LIB,
    de: '  return libelle ? `${libelle} · ${localite}` : localite',
    vers: '  return libelleLieu ? `${libelleLieu} · ${localite}` : localite' },

  // ─── L ECRAN CESSE DE DONNER DE QUOI DECIDER ────────────────────────────
  { nom: '🔴 l ecran ne passe plus le nom : la regle n a plus rien a retrancher',
    banc: 'verif:logique', fichier: ECRAN,
    de: '    nomCommerce: c.nom,',
    vers: '    nomCommerce: null,' },

  // ─── LA GARDE MORTE REVIENT ─────────────────────────────────────────────
  { nom: '🔴 la comparaison au siege revient, verte et sans effet',
    banc: 'verif:logique', fichier: ECRAN,
    de: '      return { ...c, distance, lieu_proche: lieuProche }',
    vers: "      return { ...c, distance, lieu_proche: lieuProche?.source === 'siege' ? null : lieuProche }" },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const BANCS = [...new Set(MUTATIONS.map((m) => m.banc))]
for (const banc of BANCS) {
  if (lancer(banc).rouge) {
    console.log(`🔴 ${banc} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${BANCS.join(', ')}\n`)

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
  const res = lancer(m.banc)
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée par ${m.banc} : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = BANCS.filter((b) => lancer(b).rouge)
if (finalRouge.length) console.log(`🔴 ROUGE APRÈS RESTAURATION : ${finalRouge.join(', ')}`)
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge.length ? 1 : 0)
