// HARNAIS DE MUTATION — LA PRATICIENNE À LA SAISIE AU COMPTOIR (D1, 04/10)
//
// 🔴 CE QU'ON MESURE : la saisie ne demandait personne, `praticien_id` restait
// vide, le rendez-vous chevauchait toute l'équipe et sortait des agendas
// filtrés. Décision d'Alex : choix OBLIGATOIRE dès que deux personnes peuvent
// l'assurer. Chaque mutation rouvre une porte et nomme la garde qui doit rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE À CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
//
//   node scripts/mutations-praticien-comptoir.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const REGLE = 'lib/rdv-slots.js'
const ROUTE = 'app/api/equipe/rdv/creer/route.js'
const MODALE = 'app/dashboard/ModalNouveauRdv.js'

const MUTATIONS = [
  { nom: '🔴 deux praticiennes possibles, la règle n’exige plus rien',
    banc: 'verif:slots', fichier: REGLE,
    de: '  if (liste.length === 1) return { requis: false, praticienId: liste[0].id, manque: false }',
    vers: '  if (liste.length >= 1) return { requis: false, praticienId: liste[0].id, manque: false }',
    garde: '🔴 D1 : deux personnes possibles, le choix est EXIGÉ' },

  { nom: '⚠️ un identifiant hors de la liste passe pour un choix',
    banc: 'verif:slots', fichier: REGLE,
    de: '  const retenu = choisi != null && liste.some(p => String(p.id) === String(choisi)) ? choisi : null',
    vers: '  const retenu = choisi ?? null',
    garde: '⚠️ D1 : une personne hors de la liste ne passe pas pour un choix' },

  { nom: '🔴 la prestation qui nomme ses praticiennes propose toute l’équipe',
    banc: 'verif:slots', fichier: REGLE,
    de: '  return actives.filter(p => nommees.includes(String(p.id)))',
    vers: '  return actives',
    garde: '🔴 D1 : la prestation qui nomme ses praticiennes ne propose qu’elles' },

  { nom: '⚠️ une praticienne inactive est proposée',
    banc: 'verif:slots', fichier: REGLE,
    de: '  const actives = (praticiens || []).filter(p => p && p.actif !== false && !p.deleted_at)',
    vers: '  const actives = (praticiens || []).filter(p => p)',
    garde: '⚠️ D1 : une prestation que personne ne réclame propose toute l’équipe ACTIVE' },

  { nom: '🔴 le serveur pose sans personne quand il en faut une',
    banc: 'verif:equipe', fichier: ROUTE,
    de: "      if (choix.manque) return NextResponse.json({ ok: false, error: 'Dis qui assure ce rendez-vous.' }, { status: 400 })",
    vers: '',
    garde: '🔴 D1 : créer exige la personne' },

  { nom: '🔴 le serveur accepte une personne qui ne fait pas ce rendez-vous',
    banc: 'verif:equipe', fichier: ROUTE,
    de: '      if (demande && !eligibles.some(p => String(p.id) === String(demande))) {',
    vers: '      if (false) {',
    garde: '🔴 D1 : une personne qui ne fait pas ce rendez-vous est refusée' },

  { nom: '🔴 le serveur n’écrit pas la personne retenue',
    banc: 'verif:equipe', fichier: ROUTE,
    de: '        praticien_id: praticienId,',
    vers: '',
    garde: '🔴 D1 : le chevauchement et l’écriture portent la personne retenue' },

  { nom: '🔴 la fenêtre valide sans la personne',
    banc: 'verif:equipe', fichier: MODALE,
    de: '  const formValide = !!(prestationId && presta && dateValide && heureValide && !choixPrat.manque && (',
    vers: '  const formValide = !!(prestationId && presta && dateValide && heureValide && (',
    garde: '🔴 D1 : la fenêtre ne valide pas sans la personne' },

  { nom: '🔴 la fenêtre du patron n’écrit pas la personne',
    banc: 'verif:equipe', fichier: MODALE,
    de: '        praticien_id: praticienRetenu ?? null,',
    vers: '',
    garde: '🔴 D1 : la fenêtre écrit la personne' },

  { nom: '🔴 la règle des créneaux ne voit plus la personne ni ses absences',
    banc: 'verif:equipe', fichier: MODALE,
    de: '  const chezLaPersonne = { praticienId: praticienRetenu, fermetures: absencesRetenue }',
    vers: '  const chezLaPersonne = {}',
    garde: '🔴 D1 : les heures libres, le clic et chaque semaine répétée se jugent chez elle' },

  { nom: '⚠️ le tableau de bord ne donne pas l’équipe à la fenêtre',
    banc: 'verif:equipe', fichier: 'app/dashboard/page.js',
    de: '                    rdvsExistants={rdvs} praticiens={praticiensRdv}',
    vers: '                    rdvsExistants={rdvs}',
    garde: '⚠️ D1 : les deux appelants donnent l’équipe à la fenêtre' },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, sortie }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, sortie }
  }
}

const bancs = [...new Set(MUTATIONS.map((m) => m.banc))]
for (const b of bancs) {
  const depart = lancer(b)
  if (depart.rouge) {
    console.log(`🔴 ${b} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.sortie.slice(-400))
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${bancs.join(', ')}.\n`)

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
  ecrireSur(f, original.replace(m.de, () => m.vers))
  const res = lancer(m.banc)
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  const nommee = res.sortie.includes(m.garde)
  if (res.rouge && !res.plante && nommee) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else if (res.rouge) { manquees.push(`${m.nom} — rouge, mais PAS sur « ${m.garde} »`); console.log(`  ✕ AUTRE GARDE : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = bancs.some((b) => lancer(b).rouge)
if (finalRouge) console.log('🔴 UN BANC EST ROUGE APRÈS RESTAURATION.')
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
