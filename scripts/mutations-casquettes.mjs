// HARNAIS DE MUTATION — UNE CONNEXION, PLUSIEURS CASQUETTES
//
// Chaque mutation ouvre une porte précise, et le banc qu'elle nomme doit
// rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:casquettes

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:casquettes'

const MUTATIONS = [
  { nom: '🔴 un patron perd sa connexion en supprimant son profil Yopper',
    fichier: 'lib/casquettes.js', de: '  return casquettesRestantes(casquettes, quiPart).length === 0', vers: '  return true' },
  { nom: '🔴 l admin perd sa connexion',
    fichier: 'lib/casquettes.js', de: "  if ((casquettes || []).includes('admin')) return false", vers: '' },
  { nom: '🔴 l admin n est plus reconnu comme casquette',
    fichier: 'lib/casquettes.js', de: "  if (estAdresseAdmin(user?.email)) liste.push('admin')", vers: '' },
  { nom: '🔴 un membre d équipe n est plus une casquette',
    fichier: 'lib/casquettes.js', de: "  if ((equipes || []).length) liste.push('equipe')", vers: '' },
  { nom: '🔴 un patron perd sa préinscription de commerçant',
    fichier: 'lib/casquettes.js', de: "  return (casquettes || []).includes('commerce') ? ['yopper'] : null", vers: '  return null' },
  { nom: '⚠️ la phrase oublie le « à »',
    fichier: 'lib/casquettes.js', de: '  const avecA = noms.map(n => `à ${n}`)', vers: '  const avecA = noms' },
  { nom: '🔴 une panne vaut « aucun commerce »',
    fichier: 'lib/casquettes-server.js', de: '    if (r.error) throw new Error(', vers: '    if (false) throw new Error(' },
  { nom: '🔴 la route Yopper lit les casquettes APRÈS avoir effacé',
    fichier: 'app/api/yopper/supprimer-compte/route.js', de: '    const casquettes = await casquettesDuCompte(admin, user)', vers: '    const casquettes = []' },
  { nom: '🔴 la route Yopper efface la connexion sans regarder',
    fichier: 'app/api/yopper/supprimer-compte/route.js', de: "    if (!connexionEffacable(casquettes, 'yopper')) {", vers: '    if (false) {' },
  { nom: '🔴 la route Yopper efface toutes les préinscriptions',
    fichier: 'app/api/yopper/supprimer-compte/route.js', de: '    const types = preinscriptionsAEffacer(casquettes)', vers: '    const types = null' },
  { nom: '🔴 l admin efface la connexion d un patron aussi Yopper',
    fichier: 'app/api/admin/commercants/route.js', de: '        if (!connexionEffacable(casquettes, null)) {', vers: '        if (false) {' },
  { nom: '🔴 l admin efface la connexion d un patron de deux commerces',
    fichier: 'app/api/admin/commercants/route.js', de: '        if (!connexionEffacable(casquettes, null)) {', vers: "        if (!connexionEffacable(casquettes, 'commerce')) {" },
  { nom: '⚠️ l écran de l admin ignore l avertissement',
    fichier: 'app/admin/ModalEditCommercant.js', de: "        if (j.avertissement) toast(j.avertissement, 'error')", vers: '        if (false) toast(j.avertissement)' },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications/.test(sortie), extrait: sortie.slice(-400) }
  }
}

const depart = lancer(BANC)
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log(`Banc vert au départ : ${BANC}.\n`)

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  // ⚠️ Les fichiers peuvent être en CRLF : la cible suit la fin de ligne du fichier.
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const de = m.de.split('\n').join(eol)
  const vers = m.vers.split('\n').join(eol)
  if (!original.includes(de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(de, vers))
  const res = lancer(m.banc || BANC)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉE VERTE`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const finalRouge = lancer(BANC).rouge
if (finalRouge) console.log(`🔴 ${BANC} EST ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
