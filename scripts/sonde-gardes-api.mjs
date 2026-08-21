// SONDE : quelles routes API tournent en CLÉ DE SERVICE sans aucune garde ?
//
// ⚠️ POURQUOI. La clé de service IGNORE LA RLS. Une route qui l'utilise porte
// donc seule sa propre autorisation : s'il n'y en a pas, il n'y a rien du tout.
// L'audit du 21/08 a trouvé cinq routes dans ce cas, dont un relais de courrier
// ouvert et une fuite de données de clients. Elles avaient chacune leur petite
// différence, et c'est ce qui les avait fait oublier une par une.
//
// ⚠️ IL A COMMENCÉ SA VIE SANS ÊTRE UN BANC, ET C'EST LA PARTIE IMPORTANTE.
// Onze routes restaient à examiner : les ranger d'office dans la liste des
// « assumées » aurait produit un vert instantané et parfaitement mensonger.
// Il n'a compté et nommé que le temps de les lire une par une. Il est devenu
// un banc quand la liste est tombée à zéro, pas avant.
//
// ⚠️ LA RÈGLE QU'IL PORTE : toute route en clé de service a soit une GARDE,
// soit une RAISON ÉCRITE dans PUBLIQUES_ASSUMEES. Jamais rien entre les deux.
// Une route ajoutée demain sans l'une ni l'autre fait rougir la chaîne.
//
//   npm run verif:api

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
// ⚠️ ON EXIGE L'IMPORT **ET** L'APPEL, et cette exigence vient d'une mutation.
// La première version cherchait le mot `gardeSurLigne` : en retirant l'IMPORT
// et en laissant l'appel, la sonde restait verte sur une route devenue
// cassée — un `ReferenceError` invisible au lint, `no-undef` étant éteint ici,
// et invisible au build. Chercher un mot ne suffit jamais.
const IMPORT_GARDE = /from '@\/lib\/api-auth'/
const APPEL_GARDE = /(gardeSurLigne|gardeCommercant|utilisateurAppelant)\s*\(/

const MARQUEURS = [
  ['garde partagée',      (s) => IMPORT_GARDE.test(s) && APPEL_GARDE.test(s)],
  ['identité prouvée',    (s) => /identiteProuvee/.test(s)],
  ['jeton Supabase',      (s) => /getUser\s*\(/.test(s)],
  ['signature Stripe',    (s) => /stripe-signature/.test(s)],
  ['secret de cron',      (s) => /CRON_SECRET/.test(s)],
  ['identité déclarée',   (s) => /identiteYopper|lireIdentiteYopper/.test(s)],
  ['anti-robot',          (s) => /turnstile/i.test(s)],
  ['jeton d\'annulation', (s) => /annulation_token/.test(s)],
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

  // ─── Triées le 21/08, une par une, avec leur raison ──────────────────────
  // ⚠️ TROIS ROUTES DE CETTE LISTE N'Y SONT PAS RESTÉES : `commande/push-statut`,
  // `livraison/statut` et `fidelite/crediter` n'étaient appelées que par le
  // tableau de bord — les mentions trouvées ailleurs étaient des COMMENTAIRES,
  // pas des appels. Elles ont reçu la garde du commerçant.
  //
  // Les cinq ci-dessous sont des ACHATS ou des CONFIRMATIONS que quelqu'un fait
  // SANS COMPTE : exiger un jeton couperait la vente. Ce qui les garde, c'est
  // que l'argent ne se décide jamais côté client.
  'app/api/bons-cadeaux/checkout/route.js':
    'achat public d\'un bon ; le montant est relu en base, jamais pris dans le corps de la requête',
  'app/api/stripe/checkout/create-abonnement/route.js':
    'achat public ; le prix vient de `abonnement_formules.prix`, et l\'éligibilité à la vente est revérifiée',
  'app/api/stripe/checkout/create-rdv-acompte/route.js':
    'acompte public ; le montant vient de la prestation en base',
  'app/api/rdv/from-session/route.js':
    'écran de confirmation après Stripe, appelé par le client qui vient de payer ; clé = l\'identifiant de session Stripe',
  'app/api/rdv/schedule-rappel/route.js':
    'programmation du rappel juste après la réservation ; clé = l\'UUID du rendez-vous, que seul son auteur possède',
}

const routes = parcourir('app/api')
const service = routes.filter(r => /SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(r, 'utf8')))

const aTrier = []
for (const r of service) {
  const src = readFileSync(r, 'utf8')
  if (MARQUEURS.some(([, teste]) => teste(src))) continue
  if (PUBLIQUES_ASSUMEES[r]) continue
  aTrier.push(r)
}

console.log(`\nRoutes API           : ${routes.length}`)
console.log(`Dont clé de service  : ${service.length}`)
console.log(`Publiques assumées   : ${Object.keys(PUBLIQUES_ASSUMEES).length}`)
console.log(`\n⚠️  À TRIER, aucune garde reconnue : ${aTrier.length}`)
for (const r of aTrier) console.log('   • ' + r)
if (aTrier.length > 0) {
  console.log(
    '\nChacune se lit et se range : soit elle reçoit une garde, soit elle rejoint\n' +
    'PUBLIQUES_ASSUMEES AVEC SA RAISON. Aucune ne reste sans décision.'
  )
  process.exit(1)
}
console.log('\nToutes les routes en clé de service portent une garde ou une raison.')
