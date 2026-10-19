// Harnais de mutation : le droit au paiement en ligne dans create-commande
// (19/10).
//
// La garde `verif:gardes` doit rougir si l'on retire le droit, si on le
// remplace par un autre, ou si la route cesse d'utiliser le drapeau qui le
// porte. Chaque mutation est écrite, mesurée, puis le fichier est restauré
// par `ecrireSur`, et la restauration est vérifiée avant de continuer.

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:gardes'

const ROUTE = 'app/api/stripe/checkout/create-commande/route.js'

const MUTATIONS = [
  { nom: '🔴 LE DÉFAUT D ORIGINE : un compte Connect suffit à encaisser en ligne',
    fichier: ROUTE,
    de: `const enLigneAutorise = modesOuverts.stripeOK && forfaitOuvre(commercant, 'paiement_ligne')`,
    vers: `const enLigneAutorise = modesOuverts.stripeOK` },
  { nom: 'le droit lu est le mauvais (commande au lieu de paiement_ligne)',
    fichier: ROUTE,
    de: `forfaitOuvre(commercant, 'paiement_ligne')`,
    vers: `forfaitOuvre(commercant, 'commande')` },
  { nom: 'le refus du paiement en ligne lit le drapeau brut de Stripe',
    fichier: ROUTE,
    de: `if (!surPlace && !enLigneAutorise)`,
    vers: `if (!surPlace && !modesOuverts.stripeOK)` },
  { nom: 'la décision Stripe lit le drapeau brut de Stripe',
    fichier: ROUTE,
    de: `enLigneAutorise: enLigneAutorise && !!commercant.stripe_account_id`,
    vers: `enLigneAutorise: modesOuverts.stripeOK && !!commercant.stripe_account_id` },
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
