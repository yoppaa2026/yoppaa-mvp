// SONDE : quelles routes API tournent en CLÉ DE SERVICE sans aucune garde ?
//
// ⚠️ POURQUOI. La clé de service IGNORE LA RLS. Une route qui l'utilise porte
// donc seule sa propre autorisation : s'il n'y en a pas, il n'y a rien du tout.
// L'audit du 21/08 a trouvé cinq routes dans ce cas, dont un relais de courrier
// ouvert et une fuite de données de clients. Elles avaient chacune leur petite
// différence, et c'est ce qui les avait fait oublier une par une.
//
// ⚠️ CE FICHIER N'EST PAS UN BANC, ET C'EST DÉLIBÉRÉ. Il ne rend pas « vert » :
// il COMPTE et il NOMME. Un banc vert sur une liste que je n'ai pas encore
// triée dirait le contraire de la vérité, et c'est exactement le défaut que
// j'ai commis aujourd'hui en écrivant une attente sans l'avoir mesurée.
//
// Il deviendra un banc le jour où les routes restantes auront été examinées une
// par une et rangées dans PUBLIQUES_ASSUMEES avec leur raison écrite.
//
//   node scripts/sonde-gardes-api.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function parcourir(dossier, acc = []) {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name).replace(/\\/g, '/')
    if (e.isDirectory()) parcourir(p, acc)
    else if (e.name === 'route.js') acc.push(p)
  }
  return acc
}

// Toutes les formes d'autorisation reconnues dans ce projet.
// ⚠️ Une forme oubliée ici produit un FAUX POSITIF, et un faux positif répété
// finit par faire ignorer la sonde entière. La liste se complète, elle ne se
// devine pas : `getUser` sans le `auth.` devant a déjà manqué deux routes
// parfaitement protégées.
const MARQUEURS = [
  ['garde partagée',    /gardeSurLigne|gardeCommercant|utilisateurAppelant/],
  ['identité prouvée',  /identiteProuvee/],
  ['jeton Supabase',    /getUser\s*\(/],
  ['signature Stripe',  /stripe-signature/],
  ['secret de cron',    /CRON_SECRET/],
  ['identité déclarée', /identiteYopper/],
  ['anti-robot',        /turnstile/i],
]

// Routes publiques PAR NATURE, examinées et assumées. Chacune doit porter sa
// raison : sans raison écrite, elle n'a rien à faire dans cette liste.
const PUBLIQUES_ASSUMEES = {
  'app/api/pre-inscription/route.js': 'formulaire public de la landing, protégé par Turnstile',
  'app/api/communes/stats/route.js': 'compteurs publics de communes, aucune donnée personnelle',
  'app/api/fiche/vue/route.js': 'incrément d\'un compteur de vues, aucune lecture',
  'app/api/deals/track/route.js': 'incrément d\'un compteur, colonne choisie dans une liste blanche',
  'app/api/articles/like/route.js': 'compteur public de likes',
  'app/api/bons-cadeaux/config/route.js': 'affichage des montants proposés sur une fiche publique',
  'app/api/bons-cadeaux/verifier/route.js': 'vérification d\'un code au comptoir, le code EST le secret',
}

const routes = parcourir('app/api')
const service = routes.filter(r => /SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(r, 'utf8')))

const aTrier = []
for (const r of service) {
  const src = readFileSync(r, 'utf8')
  if (MARQUEURS.some(([, re]) => re.test(src))) continue
  if (PUBLIQUES_ASSUMEES[r]) continue
  aTrier.push(r)
}

console.log(`\nRoutes API           : ${routes.length}`)
console.log(`Dont clé de service  : ${service.length}`)
console.log(`Publiques assumées   : ${Object.keys(PUBLIQUES_ASSUMEES).length}`)
console.log(`\n⚠️  À TRIER, aucune garde reconnue : ${aTrier.length}`)
for (const r of aTrier) console.log('   • ' + r)
console.log(
  aTrier.length === 0
    ? '\nToutes les routes en clé de service portent une garde ou une raison.'
    : '\nChacune se lit et se range : soit elle reçoit une garde, soit elle rejoint\n' +
      'PUBLIQUES_ASSUMEES AVEC SA RAISON. Aucune ne reste sans décision.'
)
