// HARNAIS DE MUTATION — LE DÉPLACEMENT, LA PRATICIENNE ET LES FERMETURES
// (Annul-I6, 04/10)
//
// 🔴 CE QU'ON MESURE : le déplacement refusait le rendez-vous d'Emily à 14h
// parce que Pierre y avait un client, l'acceptait dans une plage que seul
// Pierre assure, et ne lisait aucune fermeture (jour fermé, cours annulé,
// absence). Chaque mutation remet une de ces formes et nomme la garde qui doit
// rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE À CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
//
//   node scripts/mutations-deplacement-praticien.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const REGLE = 'lib/deplacement-rdv.js'
const SRV = 'lib/rdv-deplacement-server.js'
const BANC = 'verif:slots'

const MUTATIONS = [
  { nom: '🔴 la praticienne ne compte plus du tout',
    banc: BANC, fichier: REGLE,
    de: '  const memePraticien = (id) => praticienId == null || id == null || String(id) === String(praticienId)',
    vers: '  const memePraticien = () => true',
    garde: '🔴 Emily dans la plage de Pierre seulement : refusé' },

  { nom: '🔴 le client d’une collègue redevient un conflit',
    banc: BANC, fichier: REGLE,
    de: '    if (!memePraticien(r.praticien_id)) return false',
    vers: '',
    garde: '🔴 Emily à 14h sur une plage commune : le client de Pierre ne la gêne pas' },

  { nom: '⚠️ un rendez-vous sans praticienne connue ne gêne plus personne',
    banc: BANC, fichier: REGLE,
    de: '  const memePraticien = (id) => praticienId == null || id == null || String(id) === String(praticienId)',
    vers: '  const memePraticien = (id) => praticienId == null || String(id) === String(praticienId)',
    garde: '⚠️ un rendez-vous sans praticienne connue gêne tout le monde' },

  { nom: '🔴 la plage d’une collègue suffit de nouveau',
    banc: BANC, fichier: REGLE,
    de: '  if (praticienId != null && (creneauxJour || []).length > 0) {',
    vers: '  if (false) {',
    garde: '🔴 Emily dans la plage de Pierre seulement : refusé' },

  { nom: '🔴 les fermetures ne sont plus lues',
    banc: BANC, fichier: REGLE,
    de: '  if (Array.isArray(fermetures)) {',
    vers: '  if (false) {',
    garde: '🔴 un jour fermé refuse' },

  { nom: '🔴 le serveur ne passe plus la praticienne',
    banc: BANC, fichier: SRV,
    de: '    praticienId: rdv.praticien_id ?? null,',
    vers: '',
    garde: '🔴 le serveur du déplacement passe la praticienne et les fermetures' },

  { nom: '🔴 le serveur ne lit plus la praticienne des rendez-vous',
    banc: BANC, fichier: SRV,
    de: "    db.from('rdv_reservations').select('id, date_rdv, statut, prestation_id, praticien_id, heure_debut, heure_fin')",
    vers: "    db.from('rdv_reservations').select('id, date_rdv, statut, prestation_id, heure_debut, heure_fin')",
    garde: '🔴 et la praticienne des rendez-vous du jour' },

  { nom: '🔴 le serveur lit les fermetures sans la séance',
    banc: BANC, fichier: SRV,
    de: "    db.from('rdv_fermetures').select('date_debut, date_fin, praticien_id, prestation_id, heure_debut')",
    vers: "    db.from('rdv_fermetures').select('date_debut, date_fin, praticien_id')",
    garde: '🔴 et il lit les fermetures du jour, séance comprise' },

  { nom: '🔴 la fenêtre du patron ne reçoit plus les fermetures',
    banc: BANC, fichier: 'app/dashboard/page.js',
    de: '          rdvsExistants={rdvs} fermetures={fermeturesRdv}',
    vers: '          rdvsExistants={rdvs}',
    garde: '🔴 le tableau de bord donne ses fermetures à la fenêtre de déplacement' },

  { nom: '🔴 la fenêtre du patron oublie la praticienne',
    banc: BANC, fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '    praticienId: rdv?.praticien_id ?? null,',
    vers: '',
    garde: '🔴 le déplacement donne l’heure qu’il est à la règle' },
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
