// HARNAIS DE MUTATION — BANCONTACT RETIRÉ DANS L'APP NATIVE (02/10)
//
// Chaque mutation remet une forme fausse possible : la règle qui se trompe,
// une route qui reprend sa liste en dur, un écran qui oublie de dire qu'il est
// dans l'app. Si `verif:moyens-paiement` reste vert sur l'une d'elles, il ne
// protège pas ce qu'il prétend.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-moyens-paiement.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:moyens-paiement'
const REGLE = 'lib/moyens-paiement.js'

const MUTATIONS = [
  // ═══ La règle ═══
  { nom: '🔴 Bancontact revient dans l app native',
    fichier: REGLE, de: "export const MOYENS_APP_NATIVE = ['card']", vers: "export const MOYENS_APP_NATIVE = ['card', 'bancontact']" },
  { nom: '🔴 Bancontact disparaît aussi du web',
    fichier: REGLE, de: "export const MOYENS_WEB = ['card', 'bancontact']", vers: "export const MOYENS_WEB = ['card']" },
  { nom: '⚠️ n importe quelle valeur vaut « app native »',
    fichier: REGLE, de: '  return corps?.[CHAMP_APP_NATIVE] === true', vers: '  return Boolean(corps?.[CHAMP_APP_NATIVE])' },
  { nom: '🔴 la règle est inversée',
    fichier: REGLE, de: '  return depuisAppNative(corps) ? [...MOYENS_APP_NATIVE] : [...MOYENS_WEB]', vers: '  return depuisAppNative(corps) ? [...MOYENS_WEB] : [...MOYENS_APP_NATIVE]' },
  { nom: '⚠️ la liste partagée est rendue telle quelle (une route peut l abîmer)',
    fichier: REGLE, de: '  return depuisAppNative(corps) ? [...MOYENS_APP_NATIVE] : [...MOYENS_WEB]', vers: '  return depuisAppNative(corps) ? MOYENS_APP_NATIVE : MOYENS_WEB' },
  // ═══ Les routes ═══
  { nom: '🔴 commande : la liste en dur revient',
    fichier: 'app/api/stripe/checkout/create-commande/route.js', de: '      payment_method_types: moyensPaiementCheckout(body),', vers: "      payment_method_types: ['card', 'bancontact']," },
  { nom: '🔴 acompte de rdv : la liste en dur revient',
    fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js', de: '      payment_method_types: moyensPaiementCheckout(body),', vers: "      payment_method_types: ['card', 'bancontact']," },
  { nom: '🔴 produits d un rdv : la règle reçoit un corps vide',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js', de: '      payment_method_types: moyensPaiementCheckout(body),', vers: '      payment_method_types: moyensPaiementCheckout({}),' },
  { nom: '🔴 abonnement : la liste en dur revient',
    fichier: 'app/api/stripe/checkout/create-abonnement/route.js', de: '      payment_method_types: moyensPaiementCheckout(corps),', vers: "      payment_method_types: ['card', 'bancontact']," },
  { nom: '🔴 bon cadeau : la liste en dur revient',
    fichier: 'app/api/bons-cadeaux/checkout/route.js', de: '      payment_method_types: moyensPaiementCheckout(body),', vers: "      payment_method_types: ['card', 'bancontact']," },
  // ═══ Les écrans ═══
  { nom: '🔴 la commande oublie de dire « app »',
    fichier: 'app/commander/[slug]/page.js', de: '          app_native: estAppNative(window),', vers: '' },
  { nom: '🔴 le rdv oublie de dire « app » (la première des deux demandes)',
    fichier: 'app/commander/rdv/[slug]/page.js', de: '              app_native: estAppNative(window),', vers: '' },
  { nom: '🔴 l abonnement oublie de dire « app »',
    fichier: 'app/commander/rdv/[slug]/BlocAbonnements.js', de: '          app_native: estAppNative(window),', vers: '' },
  { nom: '🔴 le bon cadeau dit toujours « web »',
    fichier: 'app/commander/BonCadeauModal.js', de: '          app_native: estAppNative(window),', vers: '          app_native: false,' },
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
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
