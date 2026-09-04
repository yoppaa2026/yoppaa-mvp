// HARNAIS DE MUTATION — LES SIGNAUX DU YOPPER (04/09).
//
// 🔴 CE QU'ON MESURE : qu'on ne demande jamais à un commerçant ce qu'il fait
// DÉJÀ, et qu'on ne lui propose jamais ce que son métier ne permet pas.
//
// Les deux erreurs se ressemblent de l'extérieur et coûtent la même chose : le
// commerçant conclut que Yoppaa ne le connaît pas. Aucune des deux ne lève
// d'erreur, aucune ne se voit dans un journal.
//
// ⚠️ CE HARNAIS N'EXISTAIT PAS. `verif:signaux` tournait depuis des semaines
// sans que personne n'ait jamais vérifié qu'une seule de ses gardes pouvait
// rougir. C'est ce qu'on a passé la soirée à corriger ailleurs.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES. Le dépôt est stocké en LF, mais le
//    disque peut porter du CRLF là où git n'a pas encore normalisé : une ancre
//    à cheval sur deux lignes ne vaut alors que sur UNE machine.
//    Vérifié par `npm run verif:ancres`.
//
//   node scripts/mutations-signaux.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:signaux'
const MODULE = 'lib/signaux.js'
const FICHE = 'app/commander/[slug]/page.js'

const MUTATIONS = [
  // ─── ON NE DEMANDE PAS CE QUI SE FAIT DÉJÀ ──────────────────────────────
  //
  // 🔴 `proposeDesInvendus` N'ÉTAIT PASSÉ PAR PERSONNE jusqu'au 04/09 : le
  // signal s'affichait chez TOUS les commerces alimentaires, y compris ceux qui
  // publient leurs restes tous les soirs.
  { nom: '🔴 on propose les invendus a celui qui en publie deja',
    de: '  if (isAlimentaire(commercant) && !proposeDesInvendus) sorties.push(\'invendus\')',
    vers: '  if (isAlimentaire(commercant)) sorties.push(\'invendus\')' },

  // ⚠️ ET JAMAIS HORS DE L'ALIMENTAIRE : en détail le stock se décrémente en
  // dur, la même offre le compterait deux fois.
  { nom: '🔴 on propose les invendus a un commerce de detail',
    de: '  if (isAlimentaire(commercant) && !proposeDesInvendus) sorties.push(\'invendus\')',
    vers: '  if (!proposeDesInvendus) sorties.push(\'invendus\')' },

  { nom: '🔴 la fiche cesse de dire s il publie deja ses invendus',
    fichier: FICHE,
    de: '                    proposeDesInvendus: (dealsActifs || []).some(porteUneFenetre),',
    vers: '                    proposeDesInvendus: false,' },

  // ⚠️ LE MOT DE L'HABITANT, PAS LE NÔTRE. Il ne réclame pas « l'anti-gaspi ».
  { nom: '🔴 le signal reprend notre vocabulaire au lieu de celui du Yopper',
    de: "  invendus:  'anti_gaspi',",
    vers: "  invendus:  'invendus'," },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
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
