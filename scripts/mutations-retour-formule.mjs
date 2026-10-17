// HARNAIS DE MUTATION — REVENIR À SA FORMULE PENDANT L'ESSAI (17/10).
//
// ✅ ALEX, 17/10, sur le compte d'ICONIC : « il faut que le commerçant puisse
// retourner vers sa formule d'origine », « supprimer dégustation en cours »,
// et deux dates pour une même fin d'essai (8 et 9 janvier). Ce harnais casse
// chaque règle une par une et exige que `verif:plans` rougisse.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-retour-formule.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:plans']
const MODULE = 'lib/plans.js'
const LANCEMENT = 'lib/lancement.js'
const BORD = 'app/dashboard/ConfigDashboard.js'
const ABO = 'app/dashboard/abonnement/page.js'

const MUTATIONS = [
  // ─── LA RÈGLE ───────────────────────────────────────────────────────────
  { nom: '🔴 le retour mène au forfait le plus haut',
    de: "  return resolvePlan(commercant?.plan) || 'exister'",
    vers: "  return 'vendre'" },
  { nom: '🔴 on peut « revenir » sans essai en cours',
    de: '  return planEnEssai(commercant, maintenant) !== null',
    vers: '  return !!commercant' },
  // ─── LA DATE ────────────────────────────────────────────────────────────
  { nom: '🔴 la date de Stripe redevient l instant de facture',
    fichier: LANCEMENT,
    de: '  return new Date(d.getTime() - 1)',
    vers: '  return d' },
  { nom: '🔴 une date illisible s invente',
    fichier: LANCEMENT,
    de: '  if (Number.isNaN(d.getTime())) return null',
    vers: '' },
  { nom: '🔴 la ligne Stripe affiche encore le 9 janvier « inclus »',
    fichier: BORD,
    de: '  const finEssai = dateLongue(dernierJourAvant(commercant?.subscription_trial_end))',
    vers: '  const finEssai = dateLongue(commercant?.subscription_trial_end)' },
  { nom: '🔴 la page d abonnement affiche encore le 9 janvier',
    fichier: ABO,
    de: '<strong>{libelleFinEssaiReelle(dernierJourAvant(commercant.subscription_trial_end))}</strong> inclus.',
    vers: '<strong>{libelleFinEssaiReelle(commercant.subscription_trial_end)}</strong> inclus.' },
  // ─── LES PASTILLES ──────────────────────────────────────────────────────
  { nom: '🔴 « Dégustation en cours » revient',
    fichier: BORD,
    de: "          {!exempt && (enEssai || degustation) && <span style={{ ...s.tag, background: T.pale, color: T.deep }}>Essai en cours</span>}",
    vers: "          {!exempt && enEssai && <span style={{ ...s.tag, background: T.pale, color: T.deep }}>Essai en cours</span>}{!exempt && degustation && <span style={{ ...s.tag, background: T.pale, color: T.deep }}>Dégustation en cours</span>}" },
  { nom: '🔴 la pastille oublie l essai de la formule au-dessus',
    fichier: BORD,
    de: "          {!exempt && (enEssai || degustation) && <span style={{ ...s.tag, background: T.pale, color: T.deep }}>Essai en cours</span>}",
    vers: "          {!exempt && enEssai && <span style={{ ...s.tag, background: T.pale, color: T.deep }}>Essai en cours</span>}" },
  // ─── L'ACTION ───────────────────────────────────────────────────────────
  { nom: '🔴 le retour part sans confirmation',
    fichier: BORD,
    de: "    if (choix !== 'revenir') return",
    vers: '' },
  { nom: '🔴 le retour touche le forfait facturé',
    fichier: BORD,
    de: '      .update({ essai_plan: null })',
    vers: "      .update({ essai_plan: null, plan: 'exister' })" },
  { nom: '🔴 le retour avale son échec',
    fichier: BORD,
    de: "    if (error) { showToast(`Le retour à ${origine} n'a pas pu se faire : ${error.message}`, 'error'); return }",
    vers: '' },
  { nom: '🔴 le retour ne lit plus sa garde',
    fichier: BORD,
    de: '    if (!peutRevenirASaFormule(commercant)) return',
    vers: '' },
  { nom: '🔴 le bandeau perd sa porte de retour',
    fichier: BORD,
    de: '      <BandeauEssai commercant={commercant} onEssayer={demarrerEssai} onRevenir={revenirASaFormule} />',
    vers: '      <BandeauEssai commercant={commercant} onEssayer={demarrerEssai} />' },
  { nom: '🔴 « Mon compte » perd sa porte de retour',
    fichier: BORD,
    de: 'illisible={commercantIllisible} onRevenir={revenirASaFormule} />}',
    vers: 'illisible={commercantIllisible} />}' },
]

const lancer = () => {
  try {
    const sortie = execSync(BANCS.map(b => `npm run ${b}`).join(' && '), { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ».
    const plante = !/problème\(s\)/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANCS.join(' + ')} DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Bancs verts au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!m.de || !original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log('🔴 BANCS ROUGES APRÈS RESTAURATION.')
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
