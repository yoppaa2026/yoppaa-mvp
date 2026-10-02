// BANC : BANCONTACT RETIRÉ DANS L'APP NATIVE, ET SEULEMENT LÀ (02/10).
//
// 🔴 CE QUI SE CASSAIT. Dans l'app installée depuis un store, Bancontact
// renvoie vers la banque ; au retour, la WebView restait figée sur un écran
// mort, alors que la commande était payée (22/09). Depuis la bascule du 02/10,
// ce sont de vrais euros.
//
// ⚠️ LA RÈGLE A DEUX MOITIÉS, ET IL FAUT LES DEUX. L'écran dit « je suis
// l'app » (`app_native`), le serveur choisit les moyens. Un écran qui oublie
// le drapeau rend Bancontact à l'app ; une route qui garde sa liste en dur
// l'ignore. Ce banc vérifie les cinq paires, une par une, et le comportement
// de la règle elle-même.

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  MOYENS_WEB, MOYENS_APP_NATIVE, CHAMP_APP_NATIVE, depuisAppNative, moyensPaiementCheckout,
} from '../lib/moyens-paiement.js'

const lire = (chemin) =>
  readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const code = (chemin) => sansProse(lire(chemin))

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ═══ 1) LA RÈGLE ════════════════════════════════════════════════════════════
v('🔴 dans l’app native : la carte seule (Apple Pay et Google Pay passent par elle)',
  egal(moyensPaiementCheckout({ app_native: true }), ['card']), JSON.stringify(moyensPaiementCheckout({ app_native: true })))
v('🔴 sur le web : la carte ET Bancontact (le moyen préféré des Belges)',
  egal(moyensPaiementCheckout({ app_native: false }), ['card', 'bancontact']))
v('🔴 sans drapeau : le web, qui marche partout', egal(moyensPaiementCheckout({}), ['card', 'bancontact']))
v('corps absent : le web', egal(moyensPaiementCheckout(undefined), ['card', 'bancontact']) && egal(moyensPaiementCheckout(null), ['card', 'bancontact']))
v('⚠️ seul un vrai `true` retire Bancontact (« true », 1, « oui » ne comptent pas)',
  ['true', 1, 'oui', {}].every((x) => egal(moyensPaiementCheckout({ app_native: x }), ['card', 'bancontact'])))
v('le champ s’appelle app_native', CHAMP_APP_NATIVE === 'app_native' && depuisAppNative({ app_native: true }) === true)
const copie = moyensPaiementCheckout({})
copie.push('ideal')
v('chaque appel rend une copie (une route ne peut pas abîmer la liste des autres)',
  egal(MOYENS_WEB, ['card', 'bancontact']) && egal(MOYENS_APP_NATIVE, ['card']) && egal(moyensPaiementCheckout({}), ['card', 'bancontact']))

// ═══ 2) LES CINQ ROUTES : PLUS AUCUNE LISTE EN DUR ═════════════════════════
const ROUTES = [
  ['app/api/stripe/checkout/create-commande/route.js', 'body'],
  ['app/api/stripe/checkout/create-rdv-acompte/route.js', 'body'],
  ['app/api/stripe/checkout/create-rdv-commande/route.js', 'body'],
  ['app/api/stripe/checkout/create-abonnement/route.js', 'corps'],
  ['app/api/bons-cadeaux/checkout/route.js', 'body'],
]
for (const [chemin, corps] of ROUTES) {
  const c = code(chemin)
  v(`🔴 ${chemin} : les moyens viennent de la règle, avec le corps de la requête`,
    c.includes(`payment_method_types: moyensPaiementCheckout(${corps}),`)
    && new RegExp(`const ${corps} = await request\\.json\\(\\)`).test(c))
  v(`🔴 ${chemin} : plus aucun Bancontact écrit en dur`, !/'bancontact'/.test(c))
  v(`${chemin} : la règle est importée`, c.includes("import { moyensPaiementCheckout } from '@/lib/moyens-paiement'"))
}
// Les deux empreintes de carte restent à la carte seule : elles n'ont jamais
// proposé Bancontact (une empreinte se pose sur une carte).
for (const chemin of ['app/api/stripe/checkout/create-rdv-empreinte/route.js', 'app/api/stripe/checkout/empreinte-lien/route.js']) {
  v(`${chemin} : empreinte, la carte seule`, code(chemin).includes("payment_method_types: ['card'],"))
}

// ═══ 3) LES CINQ ÉCRANS : LE DRAPEAU PART AVEC LA DEMANDE ══════════════════
const ECRANS = [
  ['app/commander/[slug]/page.js', '/api/stripe/checkout/create-commande'],
  ['app/commander/rdv/[slug]/page.js', '/api/stripe/checkout/create-rdv-commande'],
  ['app/commander/rdv/[slug]/page.js', '/api/stripe/checkout/create-rdv-acompte'],
  ['app/commander/rdv/[slug]/BlocAbonnements.js', '/api/stripe/checkout/create-abonnement'],
  ['app/commander/BonCadeauModal.js', '/api/bons-cadeaux/checkout'],
]
for (const [chemin, route] of ECRANS) {
  const c = code(chemin)
  const i = c.indexOf(`'${route}'`)
  // Le corps envoyé à CETTE route : du nom de la route au premier `})` qui
  // ferme le JSON.stringify.
  const appel = i >= 0 ? c.slice(i, c.indexOf('}),', i) + 3) : ''
  v(`🔴 ${chemin} → ${route} : l’écran dit s’il est dans l’app`,
    /body: JSON\.stringify\(\{\s*app_native: estAppNative\(window\),/.test(appel), appel.slice(0, 160))
  v(`${chemin} : estAppNative est importée`, c.includes("import { estAppNative } from '@/lib/push-natif'"))
}

console.log(`\nMoyens de paiement (app native / web) : ${ok} vérifications`)
if (echecs.length) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
