// HARNAIS DE MUTATION — L ORDRE DES CATEGORIES (17/09)
//
// 🔴 CE QU ON MESURE. Alex, apres le defaut de la barre decalee : « il faut
// qu on puisse modifier l ordre des categories ». L ordre affiche etait celui
// d apparition des articles ; un restaurateur ne pouvait pas mettre ses plats
// avant ses boissons.
//
// ⚠️ LE PIRE CAS DE CE MODULE N EST PAS UN MAUVAIS ORDRE, C EST UNE CATEGORIE
// QUI DISPARAIT : ce sont des articles que plus personne ne voit. Plusieurs
// mutations visent exactement ca.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-ordre-categories.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:boutique'

const REGLE = 'lib/categories-catalogue.js'
const ECRAN = 'app/dashboard/OrdreCategories.js'
const FICHE = 'app/commander/[slug]/page.js'

const MUTATIONS = [
  // ─── LA REGLE ────────────────────────────────────────────────────────────
  { nom: '🔴 les categories non rangees sont PERDUES : des articles invisibles',
    fichier: REGLE,
    de: '  const reste = presentes.filter(nom => !vues.has(nom))',
    vers: '  const reste = []' },

  { nom: '🔴 une categorie rangee mais vide fabrique un onglet sans section',
    fichier: REGLE,
    de: '    if (!disponibles.has(nom) || vues.has(nom)) continue',
    vers: '    if (vues.has(nom)) continue' },

  { nom: '⚠️ un doublon dans l ordre voulu duplique la categorie',
    fichier: REGLE,
    de: '    if (!disponibles.has(nom) || vues.has(nom)) continue',
    vers: '    if (!disponibles.has(nom)) continue' },

  // ⚠️ NE RIEN RANGER EST LE CAS NORMAL : un commercant qui n a jamais ouvert
  // cet ecran doit voir EXACTEMENT ce qu il voyait avant.
  { nom: '🔴 sans ordre voulu, la liste est quand meme remaniee',
    fichier: REGLE,
    de: '  if (!Array.isArray(ordreVoulu) || ordreVoulu.length === 0) return [...presentes]',
    vers: '  if (!Array.isArray(ordreVoulu)) return [...presentes].reverse()' },

  { nom: '⚠️ on enregistre des categories qui n existent plus',
    fichier: REGLE,
    de: '    if (!existent.has(nom) || vues.has(nom)) continue',
    vers: '    if (vues.has(nom)) continue' },

  // ⚠️ `null` VEUT DIRE « RIEN RANGE », un tableau vide voudrait dire « zero
  // categorie devant ». Les deux doivent rester distincts en base.
  { nom: '⚠️ plus rien a ranger rend un tableau vide au lieu de null',
    fichier: REGLE,
    de: '  return propre.length > 0 ? propre : null',
    vers: '  return propre' },

  // ─── LA FICHE PUBLIQUE ───────────────────────────────────────────────────
  { nom: '🔴 la fiche cesse de lire l ordre voulu par le commercant',
    fichier: FICHE,
    de: '    commercant?.ordre_categories,',
    vers: '    null,' },

  // ─── L ECRAN DU COMMERCANT ───────────────────────────────────────────────
  { nom: '🔴 l enregistrement ne lit plus son erreur : le classement se perd en silence',
    fichier: ECRAN,
    de: '    const { error } = await supabase',
    vers: '    const { error: _ignore } = await supabase; const error = null; void _ignore; await (async () => supabase' },

  // 🔴 LE DEFAUT DU 25/09, REJOUE TEL QUEL. Alex : « page blanche, back et
  // reload ». Un objet passe a `toast` arrive dans `toastMsg`, `<Toast>` le
  // rend tel quel, React refuse un objet comme enfant et l arbre se demonte.
  // ⚠️ SA GARDE VIT DANS UN AUTRE BANC que les six ci-dessus, d ou le champ
  // `banc` : une mutation NOMME la garde qui doit la faire rougir.
  { nom: '🔴 toast recoit un objet : page blanche a l enregistrement',
    fichier: ECRAN,
    banc: 'verif:bord',
    de: "    toast?.('Ordre des catégories enregistré. Tes clients le voient tout de suite.')",
    vers: "    toast?.({ type: 'success', msg: 'Ordre des catégories enregistré. Tes clients le voient tout de suite.' })" },
]

const lancer = (banc = BANC) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

// ⚠️ CHAQUE BANC UTILISE DOIT ETRE VERT AVANT DE COMMENCER. Mesurer une
// mutation sur un banc deja rouge ne prouve rien : il serait rouge de toute
// facon, et on compterait une garde qui n a rien vu.
const BANCS = [...new Set(MUTATIONS.map((m) => m.banc || BANC))]
for (const banc of BANCS) {
  const depart = lancer(banc)
  if (depart.rouge) {
    console.log(`🔴 ${banc} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${BANCS.join(', ')}.\n`)

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

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = BANCS.some((banc) => lancer(banc).rouge)
if (finalRouge) console.log(`🔴 UN BANC EST ROUGE APRÈS RESTAURATION (${BANCS.join(', ')}).`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
