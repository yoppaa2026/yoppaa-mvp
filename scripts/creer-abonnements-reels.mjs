// ─── CRÉER LES VRAIS ABONNEMENTS APRÈS LA BASCULE STRIPE EN RÉEL (02/10) ────
//
// 🔴 POURQUOI CE SCRIPT EXISTE. La plateforme a toujours tourné en mode test :
// les abonnements des commerçants n'existaient que dans le monde de test.
// `BASCULE_STRIPE_LIVE.sql` (bloc 1 bis) les archive et les détache. Ce script
// recrée, EN RÉEL, l'abonnement des VRAIS commerçants, par la même fonction que
// la validation KYB (`creerSubscriptionAutomatique`) : même tarif, même TVA,
// même fin d'essai (`finEssai()`, le 9 janvier 2027 pour tous, décision
// d'Alex du 02/10).
//
// ⚠️ LA LISTE EST CELLE D'ALEX, ET ELLE EST ÉCRITE ICI. Classement du 02/10 :
// vrais commerçants = les six ci-dessous. Les fiches de test n'en reçoivent
// pas. La Table du Stock (vraie, mais inscription inachevée) recevra le sien
// à sa validation, par la route KYB.
//
// 🔴 UN NOM QUI NE TROUVE PAS EXACTEMENT UNE FICHE ARRÊTE TOUT, AVANT LA
// MOINDRE ÉCRITURE. Un SQL qui nommait les commerces par leur nom échouait EN
// SILENCE sur une faute de frappe (17/09) : ici, on compte, et on refuse.
// Même chose pour une fiche qui ne devrait pas être facturée (forfait gratuit,
// partenaire exempté, non validée) : on s'arrête et on dit laquelle.
//
// ⚠️ SEULEMENT EN RÉEL. Lancé avec une clé de test, il créerait des
// abonnements qui disparaîtront : il refuse.
//
// ⚠️ RELANÇABLE. Une fiche qui a déjà son abonnement est signalée et sautée,
// jamais doublée.
//
// UTILISATION (à lancer par Alex, jamais par l'assistant), APRÈS la bascule :
//
//   node --env-file=.env.local --experimental-loader ./scripts/alias-loader.mjs \
//        scripts/creer-abonnements-reels.mjs
//
// Sans drapeau, il DIT ce qu'il ferait et n'écrit rien. Ajouter `--ecrire`
// pour créer vraiment. On regarde d'abord, on écrit ensuite.

import { createClient } from '@supabase/supabase-js'
import { modePlateforme, MODE_LIVE } from '@/lib/stripe-mode'
import { creerSubscriptionAutomatique, calculerTrialEnd } from '@/lib/stripe-billing'

const ECRIRE = process.argv.includes('--ecrire')

// Les vrais commerçants à abonner, classés par Alex le 02/10.
const VRAIS = ["L'Arrosoir", 'Centre Respire', "Mozz'Art", 'ICONIC', 'Le Bistrologue', 'Miss Bouboune']

// Comparés sans casse, sans espaces en bord, et l'apostrophe typographique
// (’) ramenée à la droite (') : « Mozz’Art » est écrit avec la première en base.
const normaliser = (s) => String(s || '').replace(/[’‘`´]/g, "'").trim().toLowerCase()

const PAYANTS = ['communiquer', 'vendre']
const VALIDES = ['valide', 'actif']

const mode = modePlateforme()
if (mode !== MODE_LIVE) {
  console.error(`🔴 La clé Stripe n'est pas une clé RÉELLE (monde : ${mode || 'inconnu'}).`)
  console.error('   Un abonnement créé en test disparaîtrait. Rien n\'a été fait.')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !cle) {
  console.error('Variables Supabase absentes. Lance le script avec --env-file=.env.local.')
  process.exit(1)
}
const db = createClient(url, cle, { auth: { persistSession: false } })

// ⚠️ SEULEMENT LES COLONNES QU'IL FAUT. L'email, le téléphone, l'adresse et le
// BCE servent à créer le client Stripe (`getOrCreateStripeCustomer`), comme à
// la validation KYB ; ils ne sont jamais affichés.
const { data: fiches, error } = await db
  .from('commercants')
  .select('id, nom, plan, statut, billing_exempt, email, telephone, adresse, bce, stripe_customer_id, stripe_subscription_id')
  .in('plan', PAYANTS)

if (error) {
  console.error('Lecture impossible :', error.message)
  process.exit(1)
}

// ─── 1. CHAQUE NOM DOIT DÉSIGNER EXACTEMENT UNE FICHE, SANS DÉFAUT ──────────
const problemes = []
const a_creer = []
const deja = []
for (const nom of VRAIS) {
  const trouvees = fiches.filter((f) => normaliser(f.nom) === normaliser(nom))
  if (trouvees.length !== 1) {
    problemes.push(`« ${nom} » : ${trouvees.length} fiche(s) en forfait payant (il en faut exactement 1)`)
    continue
  }
  const f = trouvees[0]
  if (f.billing_exempt === true) { problemes.push(`« ${f.nom} » est un partenaire exempté : pas d'abonnement`); continue }
  if (!VALIDES.includes(f.statut)) { problemes.push(`« ${f.nom} » n'est pas validé (statut ${f.statut}) : son abonnement se créera à la validation`); continue }
  if (!f.email) { problemes.push(`« ${f.nom} » n'a pas d'email : Stripe ne peut pas lui envoyer ses factures`); continue }
  if (f.stripe_subscription_id) { deja.push(f); continue }
  a_creer.push(f)
}

const fin = new Date(calculerTrialEnd(30) * 1000)
console.log('\n─── VRAIS ABONNEMENTS À CRÉER (monde RÉEL) ─────────────────────\n')
console.log(`Fin d'essai qui sera posée : ${fin.toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels' })}`)
for (const f of a_creer) console.log(`   • ${f.nom} · forfait ${f.plan.toUpperCase()}`)
for (const f of deja) console.log(`   = ${f.nom} : a déjà son abonnement, ignoré`)

if (problemes.length) {
  console.log(`\n🔴 ${problemes.length} problème(s), RIEN n'est créé :`)
  for (const p of problemes) console.log('   ✕ ' + p)
  process.exit(1)
}
if (a_creer.length === 0) {
  console.log('\nRien à créer.')
  process.exit(0)
}
if (!ECRIRE) {
  console.log(`\nPassage à blanc : rien n'a été écrit. Relance avec --ecrire pour créer ces ${a_creer.length} abonnement(s).`)
  process.exit(0)
}

// ─── 2. CRÉATION, UNE FICHE APRÈS L'AUTRE ──────────────────────────────────
// Une erreur sur l'une n'empêche pas les autres ; le script, relancé, ne
// recrée que ce qui manque.
let crees = 0
const rates = []
for (const f of a_creer) {
  try {
    const { subscription } = await creerSubscriptionAutomatique({
      commercant: f,
      targetPlan: f.plan,
      trialDays: 30,
      supabaseAdmin: db,
    })
    crees++
    const finEssai = new Date(subscription.trial_end * 1000).toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels' })
    console.log(`   ✓ ${f.nom} : abonnement ${subscription.status}, fin d'essai ${finEssai}`)
  } catch (e) {
    rates.push(`${f.nom} : ${e?.message || e}`)
    console.log(`   ✕ ${f.nom} : ${e?.message || e}`)
  }
}

console.log(`\n${crees}/${a_creer.length} abonnement(s) créé(s).`)
if (rates.length) {
  console.log('Relance le script : il ne recréera que ceux qui manquent.')
  process.exit(1)
}
