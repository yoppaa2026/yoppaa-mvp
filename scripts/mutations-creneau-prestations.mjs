// HARNAIS DE MUTATION — CE QU'UN CRENEAU ACCEPTE (07/09).
//
// 🔴 CE QU'ON MESURE : qu'un cours collectif cesse d etre propose a toutes les
// heures de tous les jours. Le defaut d origine ne levait rien, ne se voyait
// nulle part, et se decouvrait le jour ou une personne seule reservait un cours
// de yoga un mardi a 13h. C est Alex qui l a trouve, pas un banc.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, verifie par npm run verif:ancres.
//
//   node scripts/mutations-creneau-prestations.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:slots'
const MODULE = 'lib/rdv-slots.js'

const MUTATIONS = [
  // 🔴 LA MOITIE DE LA REGLE QUE LE BANC M A FAIT TROUVER. Sans elle, cocher
  // « Yoga » sur la plage de 10h ne change RIEN : la plage large n a rien de
  // coche, donc elle accepte le yoga a toute heure. Le commercant aurait fait
  // le reglage et constate qu il ne sert a rien.
  { nom: '🔴 une plage libre reaccepte ce qui est rattache ailleurs',
    de: '  return !liaisons.some(l => String(l.prestation_id) === String(prestationId))',
    vers: '  return true' },

  // 🔴 FERMER SUR UNE IGNORANCE VIDERAIT TOUS LES AGENDAS, sans une erreur.
  { nom: '🔴 des liaisons non chargees FERMENT au lieu d ouvrir',
    de: '  if (!Array.isArray(liaisons)) return true\n  if (!creneauId) return false',
    vers: '  if (!Array.isArray(liaisons)) return false\n  if (!creneauId) return false' },

  { nom: '🔴 un creneau restreint accepte n importe quelle prestation',
    de: '    return duCreneau.some(l => String(l.prestation_id) === String(prestationId))',
    vers: '    return true' },

  // 🔴 SANS LE CONTROLE DE L HEURE, LA GARDE SERVEUR EST DECORATIVE : un
  // creneau du lundi accepte bien le yoga... a 10h, pas a 13h.
  { nom: '🔴 la garde serveur cesse de regarder l heure',
    de: '    if (d < cd || f > cf) return false',
    vers: '    if (false) return false' },

  { nom: '🔴 la garde serveur ignore la pause',
    de: '    if (pd !== null && pf !== null && d < pf && f > pd) return false',
    vers: '    if (false) return false' },

  // ⚠️ LES DEUX SORTIES QUI PROTEGENT L EXISTANT. Les casser refuserait des
  // rendez-vous que le parc entier accepte aujourd hui.
  { nom: '⚠️ un commerce sans aucune liaison se met a etre juge',
    de: '  if (!Array.isArray(liaisons) || liaisons.length === 0) return true',
    vers: '  if (false) return true' },

  { nom: '⚠️ un jour sans aucune plage se met a etre juge',
    de: '  const duJour = creneauxDuJour(creneaux, { dateStr, jour })\n  if (duJour.length === 0) return true',
    vers: '  const duJour = creneauxDuJour(creneaux, { dateStr, jour })\n  if (duJour.length === 0) return false' },

  // 🔴 LE MOTEUR CESSE DE FILTRER : on revient au 06/09 exactement.
  { nom: '🔴 le moteur ne filtre plus les creneaux par prestation',
    de: '  const creneauxRetenus = creneauxPourPrestation(creneauxJour, prestationId, liaisonsCreneaux)',
    vers: '  const creneauxRetenus = creneauxJour' },

  { nom: '🔴 l ecran cache des plages alors qu aucune prestation n est choisie',
    de: '  if (!Array.isArray(liaisons) || !prestationId) return creneaux || []',
    vers: '  if (!Array.isArray(liaisons)) return creneaux || []' },


  // 🔴 UN SEUL COURS PAR PLAGE (Alex, 07/09).
  { nom: '🔴 deux cours redeviennent possibles sur la meme plage',
    de: '    if (p && Number(p.capacite) > 1) return p',
    vers: '    if (false) return p' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
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
console.log('Banc vert au départ.\n')

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
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
