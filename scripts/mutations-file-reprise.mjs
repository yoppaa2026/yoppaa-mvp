// HARNAIS DE MUTATION — LA FILE D'ATTENTE APPREND CE QUE L'AGENDA FAIT (04/10)
//
// 🔴 CE QU'ON MESURE : LA-02 (une place reprise au comptoir, par un
// déplacement ou une remise en confirmé ne sortait personne de la file, et les
// notifications d'une place libérée partaient vers une séance de nouveau
// complète) et l'oubli du même jour (un cours annulé ou un jour fermé gardait
// sa file jusqu'à la date). Chaque mutation remet un de ces silences et nomme
// la garde qui doit rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE À CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
//
//   node scripts/mutations-file-reprise.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const BANC = 'verif:attente'
const REGLE = 'lib/attente-rdv.js'
const SRV = 'lib/attente-rdv-server.js'
const PP = 'app/api/rdv/place-prise/route.js'
const FF = 'app/api/rdv/fermeture-file/route.js'

const MUTATIONS = [
  { nom: '🔴 la route « place reprise » perd sa garde',
    banc: BANC, fichier: PP,
    de: "    const verdict = await gardeLigneEquipe(request, supabase, 'rdv_reservations', ids[0], 'agenda')",
    vers: '    const verdict = { ok: true }',
    garde: '🔴 la route « place reprise » est gardée « Agenda »' },

  { nom: '🔴 un identifiant d’un autre commerce passe',
    banc: BANC, fichier: PP,
    de: "      .eq('commercant_id', premier.commercant_id)",
    vers: '',
    garde: '🔴 et bornée au commerce du premier rendez-vous' },

  { nom: '🔴 la saisie au comptoir ne prévient plus la file',
    banc: BANC, fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: "        postPro('/api/rdv/place-prise', { rdv_ids: idsPoses })",
    vers: '        Promise.resolve()',
    garde: '🔴 la saisie au comptoir prévient la file' },

  { nom: '🔴 le déplacement du patron ne prévient plus la file',
    banc: BANC, fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: "      postPro('/api/rdv/place-prise', { rdv_ids: [rdv.id] })",
    vers: '      Promise.resolve()',
    garde: '🔴 le déplacement du patron aussi' },

  { nom: '🔴 le déplacement de l’équipe prévient l’ANCIENNE séance',
    banc: BANC, fichier: 'lib/rdv-deplacement-server.js',
    de: '    dateRdv: date,',
    vers: '    dateRdv: rdv.date_rdv,',
    garde: '🔴 le déplacement de l’équipe aussi, à la NOUVELLE séance' },

  { nom: '🔴 le déplacement de l’équipe ne prévient plus la file',
    banc: BANC, fichier: 'lib/rdv-deplacement-server.js',
    de: '  const suite = await placePrise(db, {',
    vers: '  const suite = await (async () => ({ ok: true }))({',
    garde: '🔴 le déplacement de l’équipe aussi, à la NOUVELLE séance' },

  { nom: '🔴 la remise en confirmé ne prévient plus la file',
    banc: BANC, fichier: 'app/api/rdv/reconfirmer/route.js',
    de: '    const suite = await placePrise(supabase, {',
    vers: '    const suite = await (async () => ({ ok: true }))({',
    garde: '🔴 la remise en confirmé aussi, après l’écriture' },

  { nom: '🔴 la route qui vide les files perd sa garde',
    banc: BANC, fichier: FF,
    de: "    const verdict = await gardeLigneEquipe(request, supabase, 'rdv_fermetures', fermeture_id, 'agenda')",
    vers: '    const verdict = { ok: true }',
    garde: '🔴 la route qui vide les files est gardée par la fermeture' },

  { nom: '🔴 annuler un cours laisse sa file en place',
    banc: BANC, fichier: 'app/dashboard/page.js',
    de: "      postPro('/api/rdv/fermeture-file', { fermeture_id: fermetureCreee.id })",
    vers: '      Promise.resolve()',
    garde: '🔴 annuler un cours vide sa file' },

  { nom: '🔴 poser une fermeture laisse les files en place',
    banc: BANC, fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      postPro('/api/rdv/fermeture-file', { fermeture_id: ecrite.id })",
    vers: '      Promise.resolve()',
    garde: '🔴 poser une fermeture vide les files du jour' },

  { nom: '🔴 un jour fermé emporte aussi les attentes « fenêtre »',
    banc: BANC, fichier: REGLE,
    de: '    && l.portee === PORTEE_SEANCE',
    vers: '    && true',
    garde: 'une attente « fenêtre » survit à un jour fermé' },

  { nom: '⚠️ l’absence d’une praticienne vide les files',
    banc: BANC, fichier: REGLE,
    de: '  if (!fermeture || fermeture.praticien_id != null || fermeture.deleted_at) return []',
    vers: '  if (!fermeture || fermeture.deleted_at) return []',
    garde: '⚠️ l’absence d’une praticienne ne ferme aucune file' },

  { nom: '🔴 un cours annulé vide toutes les séances du jour',
    banc: BANC, fichier: REGLE,
    de: '  const seance = fermeture.prestation_id != null && hhmmAttente(fermeture.heure_debut).length === 5',
    vers: '  const seance = false',
    garde: '🔴 un cours annulé vide la file de CETTE séance seulement' },

  { nom: '🔴 la fermeture d’un commerce vide les files d’un autre',
    banc: BANC, fichier: SRV,
    de: "      .eq('commercant_id', fermeture.commercant_id)",
    vers: '',
    garde: '🔴 la fermeture d’un autre commerce ne touche à rien' },

  { nom: '🔴 la notification programmée part quand même',
    banc: BANC, fichier: SRV,
    de: '        const r = await annulerPush(l.push_id)',
    vers: '        const r = { ok: true }',
    garde: '🔴 la notification programmée tombe avec la ligne' },

  { nom: '🔴 la ligne reste dans la file',
    banc: BANC, fichier: SRV,
    de: "    const { error: errD } = await supabase.from('rdv_attente').delete().in('id', visees.map(l => l.id))",
    vers: '    const errD = null',
    garde: '🔴 fermerLesFiles retire la ligne de la séance annulée' },
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
