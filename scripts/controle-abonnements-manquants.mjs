// ─── LES FORFAITS PAYANTS QUE PERSONNE NE FACTURE ───────────────────────────
//
// 🔴 POURQUOI CE SCRIPT EXISTE, ET CE QU'IL AURAIT ÉVITÉ. Le 21/09, Alex a
// monté trois commerçants réels d'Exister vers Vendre depuis l'écran
// d'administration (Le Bistrologue, Iconic, Mozz'Art) : ils s'étaient inscrits
// en Exister « de peur que ça ne soit pas gratuit », alors qu'ils voulaient du
// transactionnel. Le geste est le bon. Mais `ModalEditCommercant` écrit UNE
// colonne, `plan`, et rien de plus :
//
//   - les fonctions s'ouvrent, parce que `planEffectif()` lit cette colonne ;
//   - aucun abonnement n'est créé chez Stripe ;
//   - la route `admin/kyb/valider`, qui est la seule à en créer un, ne repasse
//     jamais : le dossier est déjà validé ;
//   - et `cron/billing-relances` ne les verra JAMAIS, parce qu'il filtre sur
//     `subscription_status in ('trialing','past_due')` et que le leur est
//     `null`.
//
// Le résultat n'est pas une erreur visible, c'est un silence : un forfait
// payant, gratuit à vie, qu'aucune garde ne signale et que personne ne compte.
// C'est exactement le genre de défaut qui se découvre à la première
// déclaration trimestrielle, c'est-à-dire trop tard.
//
// ⚠️ CE N'EST PAS URGENT TANT QUE LA PLATEFORME EST EN MODE TEST. Un abonnement
// créé aujourd'hui est un abonnement de test : il disparaît à la bascule, et
// ce serait du travail à refaire. Le remède n'est donc PAS de créer les
// abonnements maintenant, c'est de ne jamais oublier ceux qui en attendent un.
// Voir [[reference-stripe-mode-test-bascule]] et `PROCEDURE_BASCULE_STRIPE.md`.
//
// 🔴 ET ILS NE PERDENT PAS UN JOUR D'ESSAI À ATTENDRE. `finEssai()` rend le
// plus tardif entre « création + 30 jours » et le 9 janvier 2027 : tant que
// l'abonnement est créé avant le 10 décembre, la date de fin est la même que
// s'ils avaient choisi Vendre dès l'inscription.
//
// ⚠️ LECTURE SEULE, ET STRICTEMENT. Aucun `insert`, aucun `update`, aucun appel
// Stripe : ce script compte et nomme, il ne répare rien. La réparation se fait
// à la bascule, à la main, dossier par dossier.
//
// ⚠️ AUCUNE DONNÉE PERSONNELLE N'EST LUE. Le `select` ne demande ni email, ni
// téléphone, ni adresse : le nom du commerce, son forfait et l'état de son
// abonnement suffisent à décider. C'est la règle de la clé de service.
//
// UTILISATION (à lancer par Alex, jamais par l'assistant) :
//
//   npm run controle:abonnements

import { createClient } from '@supabase/supabase-js'
import { resolvePlan } from '@/lib/plans'
import { modePlateforme, MODE_TEST } from '@/lib/stripe-mode'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !cle) {
  console.error('Variables Supabase absentes. Lance le script avec npm run controle:abonnements.')
  process.exit(1)
}
const db = createClient(url, cle, { auth: { persistSession: false } })

// ⚠️ LE MONDE SE DIT, PARCE QU'IL CHANGE LA CONCLUSION. En test, la liste
// ci-dessous est une liste de RAPPEL ; en réel, c'est une liste d'URGENCE.
const mode = modePlateforme()
const enTest = mode === MODE_TEST

// Les forfaits qui doivent porter un abonnement Stripe. `exister` est gratuit à
// vie : il n'en a jamais eu et n'en aura jamais.
const PAYANTS = ['communiquer', 'vendre']

// ⚠️ PAS DE `select('*')`. Une table de commerçants porte des coordonnées, et
// la règle de la clé de service est de ne jamais en lire quand on n'en a pas
// besoin. Ici, aucune décision ne dépend d'un email.
const { data: commercants, error } = await db
  .from('commercants')
  .select('id, nom, plan, statut_publication, billing_exempt, stripe_subscription_id, subscription_status, subscription_trial_end, created_at')
  .order('created_at', { ascending: true })

if (error) {
  console.error('Lecture impossible :', error.message)
  process.exit(1)
}

const lignes = []
let exemptes = 0
let gratuits = 0
let enRegle = 0

for (const c of (commercants || [])) {
  const plan = resolvePlan(c.plan) || 'exister'

  if (!PAYANTS.includes(plan)) { gratuits++; continue }

  // ⚠️ UN PARTENAIRE N'EST PAS UN OUBLI, c'est une décision. `billing_exempt`
  // dit « gratuit au titre du partenariat de lancement » : il ne doit PAS
  // apparaître dans cette liste, sinon l'alarme sonne tout le temps et plus
  // personne ne la lit.
  if (c.billing_exempt === true) { exemptes++; continue }

  if (c.stripe_subscription_id) { enRegle++; continue }

  lignes.push({
    nom: c.nom || '(sans nom)',
    plan,
    statut: c.subscription_status || 'aucun',
    fiche: c.statut_publication || '(inconnu)',
    inscrit: (c.created_at || '').slice(0, 10),
  })
}

console.log('')
console.log('─── FORFAITS PAYANTS SANS ABONNEMENT STRIPE ───────────────────────')
console.log('')
console.log(`Plateforme Stripe : ${enTest ? 'MODE TEST' : mode ? 'MODE RÉEL' : 'INDÉTERMINÉ'}`)
console.log(`Commerçants lus   : ${(commercants || []).length}`)
console.log(`  dont gratuits (Exister)     : ${gratuits}`)
console.log(`  dont partenaires (exemptés) : ${exemptes}`)
console.log(`  dont payants en règle       : ${enRegle}`)
console.log('')

if (!lignes.length) {
  console.log('✅ Aucun forfait payant sans abonnement. Rien à rattraper.')
  console.log('')
  process.exit(0)
}

console.log(`🔴 ${lignes.length} commerçant(s) ont un forfait payant que rien ne facture :`)
console.log('')
for (const l of lignes) {
  console.log(`   • ${l.nom}`)
  console.log(`       forfait ${l.plan.toUpperCase()} · abonnement ${l.statut} · fiche ${l.fiche} · inscrit le ${l.inscrit}`)
}
console.log('')

if (enTest) {
  console.log('⚠️  LA PLATEFORME EST EN MODE TEST : ne crée RIEN maintenant.')
  console.log('   Un abonnement créé aujourd\'hui disparaîtra à la bascule en réel.')
  console.log('   Ces comptes ne coûtent rien et ne perdent aucun jour d\'essai :')
  console.log('   tant que leur abonnement est créé avant le 10 décembre, leur')
  console.log('   essai se termine le 9 janvier 2027, comme tout le monde.')
  console.log('')
  console.log('   ➜ Reporte cette liste à l\'étape « créer les abonnements » de')
  console.log('     PROCEDURE_BASCULE_STRIPE.md, et relance ce contrôle ce jour-là.')
} else {
  console.log('🔴 LA PLATEFORME EST EN MODE RÉEL : ces comptes ne seront JAMAIS facturés.')
  console.log('   Crée leur abonnement un par un, puis relance ce contrôle jusqu\'à zéro.')
}
console.log('')

// ⚠️ LE CODE DE SORTIE DIT CE QU'IL A TROUVÉ, pour qu'un enchaînement le lise.
// 0 = rien à faire, 1 = des comptes attendent, sans que ce soit une panne.
process.exit(1)
