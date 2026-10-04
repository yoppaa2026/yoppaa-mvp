// HARNAIS DE MUTATION — CHANGER UN COURS QUI A DES INSCRIPTIONS (Audit 1 I7, 04/10)
//
// 🔴 CE QU'ON MESURE : changer la durée d'un cours fermait en ligne toutes les
// séances déjà entamées (le moteur exigeait la même fin), l'agenda gardait la
// capacité gravée sur le premier inscrit (« complet », « Inscrire » caché), rien
// n'avertissait la professeure, et des places ajoutées ne prévenaient pas la
// file. Chaque mutation remet une de ces formes et nomme la garde qui doit
// rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE À CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
//
//   node scripts/mutations-cours-modifie.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const COURS = 'lib/cours-collectifs.js'
const CONF = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  { nom: '🔴 un inscrit se reconnaît de nouveau à sa fin',
    banc: 'verif:slots', fichier: 'lib/rdv-slots.js',
    de: '          && (prestationId !== null ? p.prestation_id === prestationId : p.end === fin))',
    vers: '          && p.end === fin && (prestationId === null || p.prestation_id === prestationId))',
    garde: '🔴 une durée changée : les inscrites restent la même séance' },

  { nom: '🔴 l’agenda reprend la capacité gravée',
    banc: 'verif:slots', fichier: COURS,
    de: '        capacite: capaciteActuelle(r.prestation_id) ?? gravee, inscrits: [],',
    vers: '        capacite: gravee, inscrits: [],',
    garde: '🔴 avec le catalogue, la capacité d’aujourd’hui : la séance n’est plus « complète »' },

  { nom: '🔴 l’agenda ne reçoit plus le catalogue',
    banc: 'verif:slots', fichier: 'app/dashboard/AgendaRdv.js',
    de: '                const blocsIci = [...servicesIci, ...blocsAgenda(rdvsCommencantIci, { prestations })]',
    vers: '                const blocsIci = [...servicesIci, ...blocsAgenda(rdvsCommencantIci)]',
    garde: 'les blocs d’une cellule sont calculés une seule fois' },

  { nom: '🔴 le tableau de bord ne donne plus le catalogue à l’agenda',
    banc: 'verif:slots', fichier: 'app/equipe/PosteEquipe.js',
    de: ' prestations={etat.agenda.prestations ?? null}',
    vers: '',
    garde: '🔴 l’agenda reçoit le catalogue du tableau de bord et du Poste équipe' },

  { nom: '🔴 changer un cours réservé ne prévient plus',
    banc: 'verif:slots', fichier: CONF,
    de: "        if (avis && !await confirme(confirmationSimple({ titre: avis.titre, message: avis.message, action: 'Oui, enregistrer', ton: 'principal' }))) return",
    vers: '',
    garde: '🔴 changer un cours réservé passe par l’avertissement' },

  { nom: '🔴 des places ajoutées ne préviennent plus la file',
    banc: 'verif:slots', fichier: CONF,
    de: "        postPro('/api/rdv/attente-commerce', { action: 'prevenir-cours', prestation_id: editId })",
    vers: '        Promise.resolve()',
    garde: '🔴 et des places ajoutées préviennent la file' },

  { nom: '🔴 l’avertissement se tait sur la durée',
    banc: 'verif:slots', fichier: COURS,
    de: '  if (Number.isFinite(dAv) && Number.isFinite(dAp) && dAv !== dAp) {',
    vers: '  if (false) {',
    garde: '🔴 une durée changée dit que les inscriptions gardent l’ancienne' },

  { nom: '🔴 l’avertissement se tait sur une séance trop remplie',
    banc: 'verif:slots', fichier: COURS,
    de: '    lignes.push(max > cAp',
    vers: '    lignes.push(false',
    garde: '🔴 moins de places qu’une séance n’a d’inscrits : personne n’est désinscrit' },

  { nom: '🔴 une séance passée est prévenue',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "    if (l.portee !== PORTEE_SEANCE || String(l.date_rdv || '') < auj) continue",
    vers: '    if (l.portee !== PORTEE_SEANCE) continue',
    garde: '🔴 une seule séance à venir est visée, comptée une fois' },

  { nom: '🔴 l’action « prevenir-cours » perd sa garde',
    banc: 'verif:attente', fichier: 'app/api/rdv/attente-commerce/route.js',
    de: "      const gardeCours = await gardeLigneEquipe(request, admin, 'rdv_prestations', corps?.prestation_id, 'agenda')",
    vers: '      const gardeCours = { ok: true }',
    garde: '🔴 l’action « prevenir-cours » est gardée par le cours' },
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
