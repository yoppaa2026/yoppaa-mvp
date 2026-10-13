// HARNAIS DE MUTATION — L ADMIN REDIGE POUR LE COMMERCANT (13/10)
//
// 🔴 CE QU ON MESURE : Alex, en mode admin sur une fiche, recevait « acces
// refuse » sur « Rediger avec l IA ». Les deux routes de redaction passent
// desormais par `gardeCommercant`, l admin ecrit hors du quota du commerce, et
// le quota des posts ne compte plus que ses propres lignes. Chaque mutation
// casse UNE de ces regles, et le banc `verif:redaction` doit rougir.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:redaction-admin

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:redaction'

const FICHE = 'app/api/ia/presentation/route.js'
const POSTS = 'app/api/ia/generer-post/route.js'

const MUTATIONS = [
  // ─── LA GARDE ────────────────────────────────────────────────────────────
  { nom: '🔴 la presentation n appelle plus la garde',
    fichier: FICHE, de: '    const garde = await gardeCommercant(request, admin, commercantId)', vers: '    const garde = { ok: true, user: {} }' },
  { nom: '🔴 la presentation ignore le refus de la garde',
    fichier: FICHE, de: '    if (refusGarde) return refusGarde', vers: '' },
  { nom: '🔴 le generateur n appelle plus la garde',
    fichier: POSTS, de: '    const garde = await gardeCommercant(request, admin, commercant_id)', vers: '    const garde = { ok: true, user: {} }' },
  { nom: '🔴 le generateur ignore le refus de la garde',
    fichier: POSTS, de: '    if (refusGarde) return refusGarde', vers: '' },
  { nom: '⚠️ la presentation refuse de nouveau l admin a la main',
    fichier: FICHE, de: '    const parAdmin = com.auth_user_id !== garde.user.id', vers: "    if (com.auth_user_id !== user.id) return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 }); const parAdmin = com.auth_user_id !== garde.user.id" },

  // ─── LE QUOTA ────────────────────────────────────────────────────────────
  { nom: '🔴 le proprietaire echappe au quota de la presentation',
    fichier: FICHE, de: '    if (!parAdmin && (count || 0) >= quotaMois) {', vers: '    if (false) {' },
  { nom: '🔴 le proprietaire echappe au quota des posts',
    fichier: POSTS, de: '    if (!parAdmin && utilise >= cfg.quota_mois) {', vers: '    if (false) {' },
  { nom: '🔴 tout appelant passe pour l admin (presentation)',
    fichier: FICHE, de: '    const parAdmin = com.auth_user_id !== garde.user.id', vers: '    const parAdmin = true' },
  { nom: '🔴 tout appelant passe pour l admin (posts)',
    fichier: POSTS, de: '    const parAdmin = com.auth_user_id !== garde.user.id', vers: '    const parAdmin = true' },
  { nom: '⚠️ un compte illisible de la presentation passe pour zero',
    fichier: FICHE, de: "    if (errCount) return NextResponse.json({ ok: false, error: 'Vérification du quota impossible, réessaie.' }, { status: 500 })", vers: '' },
  { nom: '⚠️ un compte illisible des posts passe pour zero',
    fichier: POSTS, de: "    if (errCount) return NextResponse.json({ ok: false, error: 'Vérification du quota impossible, réessaie.' }, { status: 500 })", vers: '' },

  // ─── LE JOURNAL ──────────────────────────────────────────────────────────
  { nom: '⚠️ la redaction de l admin mange le quota du commerce',
    fichier: FICHE, de: '        type: parAdmin ? `${CHAMPS[champ].log}_admin` : CHAMPS[champ].log,', vers: '        type: CHAMPS[champ].log,' },
  { nom: '⚠️ la generation de l admin mange le quota du commerce',
    fichier: POSTS, de: '        type: parAdmin ? `${surface}_admin` : surface,', vers: '        type: surface,' },

  // ─── LES SURFACES ────────────────────────────────────────────────────────
  { nom: '🔴 une surface inventee passe sans controle',
    fichier: POSTS, de: "    const surface = SURFACES.includes(body?.surface) ? body.surface : 'post'", vers: "    const surface = body?.surface || 'post'" },
  { nom: '🔴 la liste des surfaces s ouvre a la presentation',
    fichier: POSTS, de: "const SURFACES = ['post', 'deal', 'actu', 'article', 'prestation']", vers: "const SURFACES = ['post', 'deal', 'actu', 'article', 'prestation', 'presentation']" },
  { nom: '⚠️ le quota des posts recompte tout le journal',
    fichier: POSTS, de: "      .in('type', SURFACES)", vers: '' },
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
