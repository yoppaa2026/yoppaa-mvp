// HARNAIS DE MUTATION — LA PORTE DE L'ADMINISTRATION (30/08 au soir).
//
// 🔴 CE QU'ON MESURE : qu'un clic de l'admin ne peut plus effacer son propre
// accès. Ce défaut n'était pas une perte de session, c'était une PORTE QUI
// S'OUVRE : être admin, c'est détenir une adresse, pas être un compte. Le
// compte supprimé, l'adresse redevient libre et la première inscription reprend
// tous les droits.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
//
//   node scripts/mutations-admin.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:acces'

const MUTATIONS = [
  { nom: '🔴 la suppression ne sait plus QUI la demande',
    fichier: 'app/api/admin/commercants/route.js',
    de: '  return { admin, user }',
    vers: '  return { admin }' },

  { nom: '🔴 l’admin peut de nouveau effacer son propre compte',
    fichier: 'app/api/admin/commercants/route.js',
    de: '    if (c.auth_user_id && user?.id && c.auth_user_id === user.id) {',
    vers: '    if (false) {' },

  // ⚠️ LE SECOND CHEMIN COMPTE AUTANT : il tiendra le jour où l'admin sera une
  // liste et non une constante.
  { nom: '🔴 le second chemin, par l’adresse du compte visé, disparaît',
    fichier: 'app/api/admin/commercants/route.js',
    de: '      const { data: vise } = await admin.auth.admin.getUserById(c.auth_user_id)',
    vers: '      const vise = null' },

  { nom: '🔴 le refus ne dit plus ce qu’il évite',
    fichier: 'app/api/admin/commercants/route.js',
    de: 'libérerait ton adresse',
    vers: 'poserait un souci' },

  // 🔴 L'ORDRE : le garde-fou des paiements ne couvre PAS un commerce de test,
  // qui n'a aucune transaction. Si le refus admin passe après, il ne protège
  // plus le seul cas où il servait.
  { nom: '🔴 le refus admin repasse APRÈS le garde-fou des paiements',
    fichier: 'app/api/admin/commercants/route.js',
    de: "        error: 'compte_admin',",
    vers: "        error: 'zz_compte_admin',", toutes: true },

  // 🔴 L'ESPOIR À LA PLACE DE L'ACTION. C'est ce silence-là qui a sauvé l'accès
  // d'Alex : « Dermaé » était rattaché à son compte, l'effacement a échoué, et
  // rien ne l'a signalé. La chance a fait le travail d'une garde.
  { nom: '🔴 l’effacement du compte lié redevient un espoir',
    fichier: 'app/api/admin/commercants/route.js',
    de: '      const { error: errAuth } = await admin.auth.admin.deleteUser(c.auth_user_id)\n        .catch((e) => ({ error: e }))',
    vers: '      const errAuth = null\n      await admin.auth.admin.deleteUser(c.auth_user_id).catch((e) => console.warn(e?.message))' },

  { nom: '🔴 l’échec ne remonte plus jusqu’à l’écran',
    fichier: 'app/api/admin/commercants/route.js',
    de: '      compte_supprime: compteSupprime,',
    vers: '' },

  // ⚠️ `null` N'EST PAS `false` : « aucun compte à supprimer » et « le compte
  // n'a pas pu l'être » ne se disent pas de la même façon.
  { nom: '🔴 « aucun compte » se confond avec « échec »',
    fichier: 'app/api/admin/commercants/route.js',
    de: '    let compteSupprime = null',
    vers: '    let compteSupprime = false' },

  // ─── LE PIÈGE QUI N'EXISTE PAS ENCORE ──────────────────────────────────
  //
  // 🔴 CANONISER LES ADRESSES GMAIL est une idée qui revient dès qu'on veut
  // dédoublonner des clients, et elle est même juste du point de vue de Gmail.
  // Ici elle transformerait les DOUZE comptes de test en douze administrateurs.
  // ⚠️ ÉCRITES SANS LA MOINDRE BARRE OBLIQUE INVERSE, ET C'EST DÉLIBÉRÉ. Ma
  // première version passait par une expression régulière : l'échappement s'est
  // perdu en route, le fichier muté ne compilait plus, et le banc a PLANTÉ au
  // lieu de rougir. Une mutation change le RÉSULTAT, jamais la TERMINAISON —
  // un banc qui explose ne mesure rien, il constate un accident.
  { nom: '🔴 la normalisation se met à retirer le +alias (12 admins d’un coup)',
    fichier: 'lib/email-normalise.js',
    de: '  return s || null',
    vers: "  if (!s) return null\n  const [av, ap] = s.split('@')\n  return ap ? av.split('+')[0] + '@' + ap : s" },

  { nom: '🔴 et elle se met aussi à retirer les points',
    fichier: 'lib/email-normalise.js',
    de: '  return s || null',
    vers: "  if (!s) return null\n  const [av, ap] = s.split('@')\n  return ap ? av.split('.').join('') + '@' + ap : s" },

  // ⚠️ ET DANS L'AUTRE SENS : une normalisation qui ne fait plus RIEN casserait
  // la reconnaissance d'un email tapé avec une majuscule.
  { nom: '🔴 la normalisation cesse d’uniformiser la casse',
    fichier: 'lib/email-normalise.js',
    de: "  const s = String(valeur ?? '').trim().toLowerCase()",
    vers: "  const s = String(valeur ?? '')" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-400) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications passées/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-500) }
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
  ecrireSur(f, m.toutes ? original.split(m.de).join(m.vers) : original.replace(m.de, m.vers))
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
