// HARNAIS DE MUTATION — LA DOUBLE AUTHENTIFICATION DE L ADMIN
//
// 🔐 Chaque mutation ouvre une breche precise, et `verif:double-auth` doit
// rougir.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:double-auth

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:double-auth'

const MUTATIONS = [
  { nom: '🔴 exige, le mot de passe seul suffit quand meme',
    fichier: 'lib/api-auth.js', de: "  return aal === 'aal2'", vers: '  return true' },
  { nom: '🔴 un autre compte est reconnu admin',
    fichier: 'lib/admin-identite.js', de: "  return String(email || '').trim().toLowerCase() === ADMIN_EMAIL", vers: "  return String(email || '').includes('@')" },
  { nom: '⚠️ le niveau se lit dans un jeton non verifie',
    fichier: 'lib/api-auth.js', de: '  const { data, error } = await client.auth.getClaims(token)', vers: "  const { data, error } = { data: { claims: JSON.parse(atob(token.split('.')[1])) }, error: null }" },
  { nom: '🔴 une route d administration recopie l adresse',
    fichier: 'app/api/admin/communes/route.js', de: '!(await adminVerifie(request, user))', vers: "user.email !== 'verstappenalexandre@gmail.com'" },
  { nom: '🔴 une route autorise avec la simple reconnaissance',
    fichier: 'app/api/admin/kyb/valider/route.js', de: '!(await adminVerifie(request, user))', vers: '!estAdminYoppaa(user)' },
  { nom: '🔴 la garde du commercant laisse passer l admin sans verification',
    fichier: 'lib/api-auth.js', de: '  if (await adminVerifie(request, user)) return { ok: true, user }', vers: '  if (estAdminYoppaa(user)) return { ok: true, user }' },
  { nom: '🔴 la porte de l admin disparait',
    fichier: 'app/admin/page.js', de: "  if (session.user.email === ADMIN_EMAIL && niveau === 'code') {", vers: '  if (false) {' },
  { nom: '⚠️ les donnees se chargent derriere la porte',
    fichier: 'app/admin/page.js', de: "    if (niveau === 'code' || niveau === null) return", vers: '    if (false) return' },
  { nom: '🔴 un appareil enrole passe pour un code deja donne',
    fichier: 'app/admin/DoubleAuth.js', de: "  if (data?.currentLevel === 'aal2') return 'ok'", vers: "  if (data?.nextLevel === 'aal2') return 'ok'" },
  { nom: '⚠️ une policy des pieces d identite recompare l adresse',
    fichier: 'migrations/MIGRATION_ADMIN_CENTRALISE.sql', de: "    AND ((storage.foldername(name))[1] = (auth.uid())::text OR public.is_yoppaa_admin())", vers: "    AND ((storage.foldername(name))[1] = (auth.uid())::text OR (auth.jwt() ->> 'email') = 'verstappenalexandre@gmail.com')" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications/.test(sortie), extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
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
if (finalRouge) console.log(`🔴 ${BANC} EST ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
