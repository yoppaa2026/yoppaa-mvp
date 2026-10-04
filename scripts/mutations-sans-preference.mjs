// HARNAIS DE MUTATION — « SANS PRÉFÉRENCE » DÉSIGNE QUELQU'UN (04/10)
//
// 🔴 CE QU'ON MESURE (trouvé par Alex) : le Reiki, donné par Carole seule, se
// réservait deux fois au même créneau, « avec Carole » puis « sans
// préférence ». Le vide ne heurtait rien en base. Le serveur désigne
// maintenant une personne libre, et la fiche ne compte que celles qui ont une
// plage de la prestation. Chaque mutation rouvre une porte et nomme sa garde.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE À CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
//
//   node scripts/mutations-sans-preference.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const REGLE = 'lib/rdv-slots.js'
const SERVEUR = 'lib/rdv-creation-server.js'
const FICHE = 'app/commander/rdv/[slug]/page.js'
const BANC = 'verif:slots'

const MUTATIONS = [
  { nom: '🔴 la fiche compte toute l’équipe, une plage nommée ou pas',
    banc: BANC, fichier: REGLE,
    de: '  if (plages.some(c => c && c.praticien_id == null)) return base',
    vers: '  return base',
    garde: '🔴 Reiki : la fiche ne compte que Carole' },

  { nom: '🔴 une praticienne « assure » sur la plage d’une autre',
    banc: BANC, fichier: REGLE,
    de: '    && (c.praticien_id == null || String(c.praticien_id) === String(id))',
    vers: '    && true',
    garde: '🔴 Carole prise à 10 h : « sans préférence » est refusé' },

  { nom: '⚠️ un ancien rendez-vous sans personne ne compte plus contre les libres',
    banc: BANC, fichier: REGLE,
    de: "  if (libres.length - sansPersonne <= 0) return { refus: 'place_prise' }",
    vers: "  if (libres.length <= 0) return { refus: 'place_prise' }",
    garde: '⚠️ deux possibles, une prise et un ancien vide : complet' },

  { nom: '🔴 « avec Carole » passe par-dessus un ancien « sans préférence »',
    banc: BANC, fichier: REGLE,
    de: "    return libres.length - sansPersonne > 0 ? { praticienId: choisi } : { refus: 'place_prise' }",
    vers: '    return { praticienId: choisi }',
    garde: '🔴 un ancien « sans préférence » à 10 h bloque aussi un « avec Carole »' },

  { nom: '⚠️ les rendez-vous sans personne ne sont plus comptés',
    banc: BANC, fichier: REGLE,
    de: '    if (r.praticien_id == null) sansPersonne++',
    vers: '    if (false) sansPersonne++',
    garde: '🔴 un ancien « sans préférence » à 10 h bloque aussi un « avec Carole »' },

  { nom: '⚠️ un rendez-vous annulé occupe encore la praticienne',
    banc: BANC, fichier: REGLE,
    de: "  const chevauche = (r) => r && ['confirme', 'honore'].includes(r.statut)",
    vers: '  const chevauche = (r) => r',
    garde: '⚠️ un rendez-vous annulé ne bloque rien' },

  { nom: '⚠️ une praticienne absente est désignée quand même',
    banc: BANC, fichier: REGLE,
    de: '  const possibles = (candidats || []).filter(p => p && accueille(p.id) && !absente(p.id))',
    vers: '  const possibles = (candidats || []).filter(p => p && accueille(p.id))',
    garde: '⚠️ Carole absente ce jour-là' },

  { nom: '🔴 le serveur ignore le refus et écrit le doublon',
    banc: BANC, fichier: SERVEUR,
    de: '      if (quiPour.refus) return { ok: false, code: quiPour.refus }',
    vers: '',
    garde: '🔴 le serveur désigne quelqu’un pour « sans préférence »' },

  { nom: '🔴 le serveur garde le vide au lieu de désigner',
    banc: BANC, fichier: SERVEUR,
    de: '      if (!champs?.praticien_id && quiPour.praticienId) champs = { ...champs, praticien_id: quiPour.praticienId }',
    vers: '',
    garde: '🔴 le serveur désigne quelqu’un pour « sans préférence »' },

  { nom: '⚠️ un rejeu du webhook se heurte à sa propre place',
    banc: BANC, fichier: SERVEUR,
    de: '        reservations: (duJour.data || []).filter(r => (!rdvId || String(r.id) !== String(rdvId))',
    vers: '        reservations: (duJour.data || []).filter(r => (true)',
    garde: '⚠️ il lit les rendez-vous du jour sans le rendez-vous lui-même' },

  { nom: '🔴 le yoga de 10 h sans praticienne ferme tous les Reiki de 10 h',
    banc: BANC, fichier: SERVEUR,
    de: "          && (r.praticien_id != null || (r.prestation?.par_couverts !== true && (r.capacite_creneau == null || Number(r.capacite_creneau) <= 1)))),",
    vers: '          && true),',
    garde: '🔴 un cours collectif ou une table sans praticienne n’occupe personne' },

  { nom: '🔴 la fiche ne regarde plus les plages',
    banc: BANC, fichier: FICHE,
    de: '    creneaux: creneauxConfig,',
    vers: '    creneaux: null,',
    garde: '🔴 la fiche compte les praticiennes qui ont une plage de la prestation' },

  { nom: '⚠️ le choix automatique ne se refait plus quand les données arrivent',
    banc: BANC, fichier: FICHE,
    de: '  }, [prestationChoisie, praticiens, junctionMap, creneauxConfig, liaisonsCreneaux])',
    vers: '  }, [prestationChoisie, praticiens])',
    garde: '⚠️ et choisit la seule possible quand les données arrivent' },
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
