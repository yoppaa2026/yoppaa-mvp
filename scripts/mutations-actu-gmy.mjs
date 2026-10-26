// HARNAIS DE MUTATION — L'ACTU D'EXISTER DANS LE GOOD MORNING (17/10).
//
// ✅ ALEX, 17/10 : Exister publie une actu par semaine dans le Good Morning.
// Ce harnais casse la règle et ses trois gardiens (l'écran, l'envoi aux
// favoris, le cron) un par un, et exige que `verif:actu-gmy` rougisse.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-actu-gmy.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:actu-gmy']
const MODULE = 'lib/actu-gmy.js'
const BORD = 'app/dashboard/ConfigDashboard.js'
const ROUTE = 'app/api/actus/notify-favoris/route.js'
const CRON = 'app/api/cron/morning-yoppers/route.js'
const FENETRE = 'lib/actus-fiche.js'
const FICHE_RDV = 'app/commander/rdv/[slug]/page.js'
const ACTUS_FICHE = 'app/commander/ActusFiche.js'

const MUTATIONS = [
  { nom: '🔴 la semaine commence le dimanche',
    de: '  return jourCivilPlus(j, dow === 0 ? -6 : 1 - dow)',
    vers: '  return jourCivilPlus(j, -dow)' },
  { nom: '🔴 la seconde actu de la semaine passe aussi',
    de: '    && (neuve || avant(a, actu))) || null',
    vers: '    && neuve) || null' },
  { nom: '🔴 une nouvelle actu passe malgré celle de la semaine',
    de: '  const neuve = !actu.id',
    vers: '  const neuve = false' },
  { nom: '🔴 le cron ne limite plus Exister',
    de: '    if (!limite(a.commercant_id)) return true',
    vers: '    return true' },
  { nom: '🔴 une actu GMY sans date de fin est acceptée',
    de: "  if (!DATE.test(String(date_fin || ''))) return 'Indique jusqu’à quand ton actu reste en ligne : sans date de fin, elle n’entre pas dans le Good Morning.'",
    vers: '' },
  { nom: '🔴 l’onglet reste fermé à Exister', fichier: BORD,
    de: "    { id: 'actus', label: 'Actus', icon: 'sliders', feature: 'actu_gmy' },",
    vers: "    { id: 'actus', label: 'Actus', icon: 'sliders', feature: 'actus_illimitees' }," },
  { nom: '🔴 l’actu d’Exister ne paraît nulle part (case non forcée)', fichier: BORD,
    de: '    const inclusGmy = estExister ? true : !!form.inclus_gmy',
    vers: '    const inclusGmy = !!form.inclus_gmy' },
  { nom: '🔴 l’envoi aux favoris ignore la semaine', fichier: ROUTE,
    de: '    if (conflitSemaineGmy(actu, gmy || [])) {',
    vers: '    if (false) {' },
  { nom: '🔴 l’envoi aux favoris part sur une lecture ratée', fichier: ROUTE,
    de: "    if (errGmy) return NextResponse.json({ status: 'skipped', reason: 'lecture_ko' }, { status: 500 })",
    vers: '' },
  { nom: '🔴 le cron diffuse toutes les actus d’Exister', fichier: CRON,
    de: '    if (!retenues.has(a.id)) continue',
    vers: '' },
  // ─── 26/10 : la fiche RDV montre ses actus (Centre Respire) ───
  { nom: '🔴 une actu pas encore commencée s’affiche', fichier: FENETRE,
    de: '  if (debut && jour < debut) return false',
    vers: '' },
  { nom: '🔴 une actu disparaît le jour de sa fin', fichier: FENETRE,
    de: '  if (fin && fin < jour) return false',
    vers: '  if (fin && fin <= jour) return false' },
  { nom: '🔴 la fiche RDV ne lit plus les actus', fichier: FICHE_RDV,
    de: "      if (canDo(planEffectif(c), 'actus_illimitees')) {",
    vers: '      if (false) {' },
  { nom: '🔴 la fiche RDV affiche les actus hors de leur fenêtre', fichier: FICHE_RDV,
    de: '        setActualites((actusData || []).filter(a => actuActiveCeJour(a, auj)))',
    vers: '        setActualites(actusData || [])' },
  { nom: '🔴 la fiche RDV ne montre pas le bandeau', fichier: FICHE_RDV,
    de: '                {etape === 1 && actualites.length > 0 && (',
    vers: '                {false && actualites.length > 0 && (' },
  { nom: '🔴 le bouton article paraît sans article chargé', fichier: ACTUS_FICHE,
    de: '          {article && lienArticle && (',
    vers: '          {(article || lienArticle) && (' },
]

const lancer = () => {
  try {
    const sortie = execSync(BANCS.map(b => `npm run ${b}`).join(' && '), { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ».
    const plante = !/vérifications/.test(sortie)
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
  if (!original.includes(m.de)) {
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
