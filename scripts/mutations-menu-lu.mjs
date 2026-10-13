// HARNAIS DE MUTATION — LE MENU LU PAR L'IA (13/10)
//
// Chaque mutation casse UNE règle ; `verif:menu` doit rougir. Une mutation qui
// reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:menu

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:menu'
const REGLE = 'lib/menu-lu.js'
const ROUTE = 'app/api/ia/menu/route.js'

const MUTATIONS = [
  { nom: '🔴 la virgule belge n est plus lue (12,50 devient illisible)', fichier: REGLE,
    de: "  else s = s.replace(',', '.')", vers: '' },
  { nom: '🔴 le prix des tailles prend la plus GRANDE', fichier: REGLE,
    de: '    const base = Math.min(...tailles.map(t => t.prix))', vers: '    const base = Math.max(...tailles.map(t => t.prix))' },
  { nom: '🔴 un prix introuvable devient 0 € sans le dire', fichier: REGLE,
    de: "    doutes.push('Prix introuvable sur le menu : indique-le.')", vers: '' },
  { nom: '🔴 un prix absurde passe sans alerte', fichier: REGLE,
    de: '  } else if (prix > PRIX_MAX) {', vers: '  } else if (false) {' },
  { nom: '🔴 un supplément négatif reste négatif', fichier: REGLE,
    de: '    if (supplement === null || supplement < 0 || supplement > PRIX_MAX) {', vers: '    if (supplement === null || supplement > PRIX_MAX) {' },
  { nom: '🔴 un doublon disparaît en silence', fichier: REGLE,
    de: "      if (nomsVus.has(cle)) art.doutes.push(`Même nom qu'un article de « ${nomsVus.get(cle)} » : doublon ?`)", vers: '      if (nomsVus.has(cle)) continue' },
  { nom: '🔴 « lisible » sans article reste lisible', fichier: REGLE,
    de: '    lisible: brut?.lisible !== false && total > 0,', vers: '    lisible: brut?.lisible !== false,' },
  { nom: '🔴 la limite d articles saute', fichier: REGLE,
    de: '      if (total >= MENU_MAX.articles) { tronque = true; break }', vers: '' },
  { nom: '🔴 un type de fichier inconnu passe', fichier: REGLE,
    de: "    if (!TYPES_DOCUMENT.includes(type)) return { ok: false, error: 'Envoie une photo (JPEG, PNG, WebP) ou un PDF.' }", vers: '' },
  { nom: '🔴 le poids n est plus borné au serveur', fichier: REGLE,
    de: '  if (total > TAILLE_MAX_BASE64) return', vers: '  if (false) return' },
  { nom: '🔴 la consigne n interdit plus d inventer', fichier: REGLE,
    de: "1. Recopie ce qui est ÉCRIT. N'invente jamais un article", vers: '1. Recopie ce qui est ÉCRIT. Complète au besoin un article' },
  { nom: '🔴 la route ne vérifie plus qui appelle', fichier: ROUTE,
    de: '    if (refusGarde) return refusGarde', vers: '' },
  { nom: '🔴 l admin consomme le quota du commerçant', fichier: ROUTE,
    de: '    if (!parAdmin && (count || 0) >= quotaMois) {', vers: '    if ((count || 0) >= quotaMois) {' },
  { nom: '🔴 un quota illisible vaut zéro', fichier: ROUTE,
    de: "    if (errCount) return NextResponse.json({ ok: false, error: 'Vérification du quota impossible, réessaie.' }, { status: 500 })", vers: '' },
  { nom: '🔴 les fichiers ne sont plus contrôlés', fichier: ROUTE,
    de: '    if (!docs.ok) return NextResponse.json({ ok: false, error: docs.error }, { status: 400 })', vers: '' },
  { nom: '⚠️ la réponse brute du modèle part à l écran', fichier: ROUTE,
    de: '    const proposition = normaliserLecture(out.entree)', vers: '    const proposition = out.entree || { lisible: false }' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
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
