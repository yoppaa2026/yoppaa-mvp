// Harnais de mutation de la plage de retrait (19/10) : `npm run mutations:plage`.
//
// Chaque mutation casse UNE règle ; `verif:plage` doit rougir. Écrite,
// mesurée, restaurée par `ecrireSur`, restauration vérifiée. Jamais de
// `git checkout`.

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:plage'

const REGLE = 'lib/plage-retrait.js'
const FICHE = 'app/commander/[slug]/page.js'
const ROUTE = 'app/api/stripe/checkout/create-commande/route.js'
const ECRAN = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  { nom: '🔴 une plage vide filtre (l’app change pour tout le monde)', fichier: REGLE,
    de: '  if (plageVide(plage)) return true\n', vers: '' },
  { nom: '🔴 un créneau qui déborde passe (on ne juge que le début)', fichier: REGLE,
    de: '  if (plage.a && fin > minutesDeLHeure(plage.a)) return false', vers: '  if (plage.a && debut > minutesDeLHeure(plage.a)) return false' },
  { nom: '« à partir de » oublié', fichier: REGLE,
    de: '  if (plage.de && debut < minutesDeLHeure(plage.de)) return false', vers: '' },
  { nom: 'le créneau de nuit ne finit plus le lendemain', fichier: REGLE,
    de: '  if (fin <= debut) fin += 1440', vers: '' },
  { nom: '🔴 l’invendu prend la plage de son article', fichier: REGLE,
    de: '  if (porteUneFenetre(ligne?.offre)) return { de: null, a: null }', vers: '' },
  { nom: '🔴 le duo oublie son second article', fichier: REGLE,
    de: "    ...(second ? [{ plage: plageDeLArticle(second) }] : []),", vers: '' },
  { nom: 'l’intersection prend le plus TÔT « de »', fichier: REGLE,
    de: 'if (p.de && (de === null || minutesDeLHeure(p.de) > minutesDeLHeure(de)))', vers: 'if (p.de && (de === null || minutesDeLHeure(p.de) < minutesDeLHeure(de)))' },
  { nom: '🔴 aucun refus à l’ajout même sans moment commun', fichier: REGLE,
    de: '  if (!plageImpossible(tout)) return null', vers: '  return null' },
  { nom: 'une saisie à l’envers passe', fichier: REGLE,
    de: "  if (plageImpossible(p)) return 'L’heure « à partir de » doit venir avant l’heure « jusqu’à ».'", vers: '' },
  { nom: '🔴 le serveur ne lit plus la plage en base', fichier: 'lib/lignes-commande.js',
    // ⚠️ ANCRE REPOINTÉE LE 22/10 (`gere_variantes` ferme le select, audit R1).
    de: 'commande_active, stock_mode, retrait_des, retrait_jusqua, gere_variantes\'', vers: 'commande_active, stock_mode, gere_variantes\'' },
  { nom: '🔴 le serveur ne refuse plus un créneau hors plage', fichier: ROUTE,
    de: '        if (refusPlage) {\n          return NextResponse.json({ ok: false, error: refusPlage, creneau_indisponible: true }, { status: 409 })\n        }',
    vers: '' },
  { nom: '🔴 le duo du serveur oublie son second article', fichier: ROUTE,
    de: "stock_mode, retrait_des, retrait_jusqua')\n          .in('id', seconds)", vers: "stock_mode')\n          .in('id', seconds)" },
  { nom: 'l’encodage ne prévient plus', fichier: 'app/api/equipe/commande/creer/route.js',
    de: '    avertissements.push(...avertissementsPlage(lignes, creneau))', vers: '' },
  { nom: '🔴 la fiche ne filtre plus les créneaux de retrait', fichier: FICHE,
    de: '.ok && creneauDansPlage(cr, plage))', vers: '.ok)' },
  { nom: '🔴 la fiche ne filtre plus les tournées', fichier: FICHE,
    de: '      if (!creneauDansPlage(slot, plagePanierCourante())) return false\n', vers: '' },
  { nom: 'la fiche ne refuse plus à l’ajout', fichier: FICHE,
    de: '    if (refuseParPlage(article)) return\n', vers: '' },
  { nom: '⚠️ le créneau choisi avant le sandwich compte encore', fichier: FICHE,
    de: "(!!creneauChoisi && creneauChoisiDansPlage())", vers: '!!creneauChoisi' },
  { nom: 'la carte ne dit plus la plage', fichier: FICHE,
    de: 'return [mentionDisponibilite(regleArticle(a)), libellePlage(plageDeLArticle(a))].filter(Boolean)', vers: 'return [mentionDisponibilite(regleArticle(a))].filter(Boolean)' },
  { nom: '🔴 l’éditeur écrit une plage hors alimentaire', fichier: ECRAN,
    de: 'const avecPlage = estAlimentaire && form.vendable', vers: 'const avecPlage = form.vendable' },
  { nom: 'l’éditeur ne prévient plus d’une plage sans créneau', fichier: ECRAN,
    de: 'if (plageSansCreneau(plageReglee, crs || [])) {', vers: 'if (false) {' },
  { nom: 'le lot écrit sans contrôler la saisie', fichier: ECRAN,
    de: "'sur_commande', 'plage']", vers: "'sur_commande']" },
  { nom: 'la copie oublie la plage', fichier: 'lib/catalogue-copie.js',
    de: "  'retrait_des', 'retrait_jusqua',\n", vers: '' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/en échec/.test(sortie)
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
  const n = original.split(m.de).length - 1
  if (n !== 1) {
    manquees.push(`${m.nom} — ANCRE ${n === 0 ? 'INTROUVABLE' : `PRÉSENTE ${n} FOIS`}`)
    console.log(`  ? ancre ${n === 0 ? 'introuvable' : 'non unique'} : ${m.nom}`)
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
if (manquees.length) {
  console.log('\nÀ reprendre :')
  for (const m of manquees) console.log(`  - ${m}`)
  process.exit(1)
}
