// HARNAIS DE MUTATION — SUPPRIMER UN COMPTE QUI A DES ABONNEMENTS (Abo-I10, 04/10)
//
// 🔴 CE QU'ON MESURE : le compte partait, le contrat restait avec son email et
// ses séances payées. Décision d'Alex : suppression BLOQUÉE tant qu'un
// abonnement court, contrats finis ANONYMISÉS. Chaque mutation rouvre une de
// ces portes et nomme la garde qui doit rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE À CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
//
//   node scripts/mutations-abo-suppression.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const REGLE = 'lib/abonnements.js'
const ROUTE = 'app/api/yopper/supprimer-compte/route.js'
const BANC = 'verif:abonnements'

const MUTATIONS = [
  { nom: '🔴 un contrat en cours ne bloque plus rien',
    banc: BANC, fichier: REGLE,
    de: '    return Boolean(etat) && !etat.termine',
    vers: '    return false',
    garde: '🔴 seuls les contrats qui courent bloquent la suppression' },

  { nom: '🔴 un contrat fini bloque à vie',
    banc: BANC, fichier: REGLE,
    de: '    return Boolean(etat) && !etat.termine',
    vers: '    return Boolean(etat)',
    garde: '🔴 seuls les contrats qui courent bloquent la suppression' },

  { nom: '⚠️ un contrat effacé bloque encore',
    banc: BANC, fichier: REGLE,
    de: '    if (!a || a.deleted_at) return false',
    vers: '    if (!a) return false',
    garde: '🔴 seuls les contrats qui courent bloquent la suppression' },

  { nom: '🔴 la route ne pose pas le blocage',
    banc: BANC, fichier: ROUTE,
    de: '      if (enCours.length > 0) {',
    vers: '      if (false) {',
    garde: '🔴 la route bloque sur la règle' },

  { nom: '⚠️ la route compte sans les séances : un contrat épuisé bloque',
    banc: BANC, fichier: ROUTE,
    de: '      const enCours = abonnementsQuiBloquentLaSuppression(contrats, seancesAbo, { aujourdhui })',
    vers: '      const enCours = abonnementsQuiBloquentLaSuppression(contrats, [], { aujourdhui })',
    garde: '🔴 la route bloque sur la règle' },

  { nom: '⚠️ une lecture ratée laisse partir le compte',
    banc: BANC, fichier: ROUTE,
    de: '      if (errAbo || errSeances) {',
    vers: '      if (false) {',
    garde: '⚠️ une lecture ratée bloque' },

  { nom: '⚠️ les séances sont lues sans leur statut',
    banc: BANC, fichier: ROUTE,
    de: "        ? await admin.from('rdv_reservations').select('abonnement_id, statut')",
    vers: "        ? await admin.from('rdv_reservations').select('abonnement_id')",
    garde: '⚠️ le solde se compte sur les séances du contrat' },

  { nom: '🔴 les contrats finis gardent le nom et l’email',
    banc: BANC, fichier: ROUTE,
    // ⚠️ RÉINDENTÉE LE 05/10 : l'écriture vit désormais dans la liste
    // `anonymisations`, dont chaque erreur est lue.
    de: "          .update({ client_prenom: 'Compte', client_nom: 'supprimé', client_email: EMAIL_ANONYME, client_telephone: null, notes: null })",
    vers: "          .update({ client_telephone: null })",
    garde: '🔴 les contrats finis sont anonymisés' },
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
