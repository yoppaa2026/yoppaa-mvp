// HARNAIS DE MUTATION — LE GOOD MORNING LIT LE COMMERCE DANS LA VUE (03/10)
//
// 🔴 CE QU'ON MESURE : que le Good Morning trouve ses commerces pour un Yopper
// ordinaire. La page et la pastille « Nouveau » les demandaient dans la TABLE
// `commercants`, qu'un Yopper ne peut pas lire. Le commerce revenait `null`,
// la règle l'écartait, et l'édition restait vide pour tout le monde, sauf
// pour Alex, administrateur. Pendant ce temps, le cron de 7 h 30 annonçait
// « N deals ce matin » à toute la commune.
//
// Ces mutations remettent les formes fausses : la table au lieu de la vue,
// l'embarquement dans la page, les colonnes de l'essai oubliées par la
// pastille, la lecture répétée, la lecture sans objet.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
// ⚠️ CHAQUE MUTATION NOMME LA GARDE QU'ELLE DOIT FAIRE ROUGIR : rougir sur
//    une autre garde ne prouve pas que la sienne travaille.
//
//   node scripts/mutations-good-morning.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:yopper'

const CONTENU = 'lib/morning-contenu.js'
const PAGE = 'app/commander/morning/page.js'

const MUTATIONS = [
  { nom: '🔴 le commerce se relit dans la table, que le Yopper ne peut pas lire',
    fichier: CONTENU,
    de: ".from('commercants_public')",
    vers: ".from('commercants')",
    garde: 'le commerce se lit dans la vue publique, jamais dans la table' },

  { nom: '🔴 la pastille ne rattache plus le commerce de ses deals',
    fichier: CONTENU,
    de: '    rattacherCommerces(supabase, dealsBruts),',
    vers: '    dealsBruts,',
    garde: 'un deal d’un commerce publié allume la pastille' },

  { nom: '🔴 les colonnes de l essai disparaissent : un commerce en essai est juge sur son forfait gratuit',
    fichier: CONTENU,
    de: "'id, nom, type, adresse, plan, essai_plan, created_at, statut_publication, logo_url, slug, telephone'",
    vers: "'id, nom, type, adresse, plan, statut_publication, logo_url, slug, telephone'",
    garde: 'un commerce en essai de Vendre allume la pastille avec son deal' },

  { nom: '⚠️ chaque deal redemande son commerce',
    fichier: CONTENU,
    de: 'const ids = [...new Set(liste.map((l) => l?.commercant_id).filter(Boolean))]',
    vers: 'const ids = liste.map((l) => l?.commercant_id).filter(Boolean)',
    garde: 'une seule lecture, chaque commerce demandé une fois' },

  { nom: '⚠️ une edition sans deal interroge quand meme la base',
    fichier: CONTENU,
    de: 'if (ids.length === 0) return liste.map((l) => ({ ...l, commercant: null }))',
    vers: 'if (ids.length === -1) return liste.map((l) => ({ ...l, commercant: null }))',
    garde: 'sans deal, aucune lecture' },

  { nom: '🔴 la page embarque de nouveau le commerce depuis la table',
    fichier: PAGE,
    de: '        deal_type, remise_pct, commercant_id',
    vers: '        deal_type, remise_pct, commercant_id, commercant:commercants ( id, nom )',
    garde: 'aucun écran Yopper ne lit le commerce dans la table' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, sortie }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, sortie }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.sortie.slice(-400))
  process.exit(1)
}
console.log('Banc vert au départ.\n')

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

  const nommee = res.sortie.includes(`✕ ${m.garde}`) || res.sortie.includes(m.garde)
  if (res.rouge && !res.plante && nommee) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else if (res.rouge) { manquees.push(`${m.nom} — rouge, mais PAS sur « ${m.garde} »`); console.log(`  ✕ AUTRE GARDE : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
