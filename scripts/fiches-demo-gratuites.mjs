// ─── LES FICHES DE DÉMONSTRATION PASSENT EN « VENDRE, GRATUIT À VIE » ───────
//
// ⚠️ DÉCISION D'ALEX, 22/09 : « Les 6 à moi peuvent rester en vendre gratuit à
// vie, elles servent de test. » Elles portent un abonnement Stripe d'essai qui
// se termine le 1er octobre 2026, posé avant que `finEssai()` n'applique le
// régime de lancement.
//
// 🔴 CE QUI SE PASSERAIT SANS CE SCRIPT. Aucun euro n'est prélevé sur un
// abonnement de test, mais le reste de la mécanique ne le sait pas : Stripe
// tente le paiement, échoue, le webhook pose `past_due`, et sept jours plus
// tard `cron/billing-relances` ANNULE l'abonnement et écrit `plan = 'exister'`.
// Ce sont les fiches que les relecteurs des stores regardent : elles perdraient
// les fonctions de Vendre le 8 octobre, en pleine revue Google.
//
// 🔴 L'ORDRE EST L'INVERSE DE L'HABITUDE, ET C'EST TOUT LE SUJET. Partout
// ailleurs on écrit chez Stripe puis en base, parce que Stripe décide du
// prélèvement. ICI ON EXEMPTE D'ABORD : annuler l'abonnement déclenche
// `customer.subscription.deleted`, et ce webhook remet `plan = 'exister'` sur
// toute fiche qui n'est pas exemptée. Exempter après l'annulation, c'est
// laisser le webhook retirer Vendre entre les deux instructions.
//
// ⚠️ ET LE MIROIR SE REMPLIT TOUT SEUL. On n'écrit pas `subscription_status` :
// le webhook posera `canceled` de lui-même. Deux écritures pour la même vérité
// se contrediraient tôt ou tard.
//
// ⚠️ IL NE TOUCHE QUE LES FICHES NOMMÉES CI-DESSOUS. Un script de masse qui
// part d'un critère (« tous les essais avant janvier ») emporterait un vrai
// commerçant le jour où il en existe un dans le même cas. On nomme, on compte,
// et on refuse le reste.
//
// AUCUNE DONNÉE PERSONNELLE N'EST LUE : un identifiant, un nom de commerce,
// des dates.
//
// UTILISATION (à lancer par Alex, jamais par l'assistant) :
//
//   node --env-file=.env.local --experimental-loader ./scripts/alias-loader.mjs \
//        scripts/fiches-demo-gratuites.mjs
//
// Ajouter `--ecrire` pour appliquer. Sans ce drapeau, le script se contente de
// DIRE ce qu'il ferait : on regarde d'abord, on écrit ensuite.

import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const ECRIRE = process.argv.includes('--ecrire')

// Les six fiches de démonstration, relevées le 22/09 : toutes rattachées à un
// alias de l'adresse d'Alex, vérifié en base avant d'écrire cette liste.
const FICHES_DEMO = [
  'Boulangerie Dupuis',
  'Chez Mathilde',
  'Le Dressing de Sophie',
  'Le Food Trick',
  'Salon Nathalie',
  'Studio Amandine',
]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY
const cleStripe = process.env.STRIPE_SECRET_KEY
if (!url || !cleService) {
  console.log('🔴 NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante.')
  process.exit(1)
}
if (!cleStripe) {
  console.log('🔴 STRIPE_SECRET_KEY manquante : sans clé, on ne devine pas le monde.')
  process.exit(1)
}

// 🔴 LE MONDE SE DIT EN TÊTE, ET IL SE LIT DANS LA CLÉ. Annuler des abonnements
// en croyant toucher le monde de test alors qu'on est en production est
// exactement le genre d'erreur qu'on ne voit qu'après.
const MONDE = cleStripe.startsWith('sk_live_') ? 'RÉEL (live)'
  : cleStripe.startsWith('sk_test_') ? 'TEST' : 'INCONNU'
if (MONDE === 'INCONNU') {
  console.log('🔴 La clé Stripe ne commence ni par sk_test_ ni par sk_live_.')
  process.exit(1)
}

const stripe = new Stripe(cleStripe)
const db = createClient(url, cleService, { auth: { persistSession: false } })

console.log('')
console.log(`Monde Stripe : ${MONDE}`)
console.log(ECRIRE ? 'Mode : ÉCRITURE' : 'Mode : relevé seul (ajouter --ecrire pour appliquer)')
console.log('')

// ─── 1. LES FICHES, PAR LEUR NOM ────────────────────────────────────────────
const { data: fiches, error } = await db
  .from('commercants')
  .select('id, nom, plan, billing_exempt, subscription_status, stripe_subscription_id')
  .in('nom', FICHES_DEMO)

if (error) {
  console.log(`🔴 Lecture impossible : ${error.message}`)
  process.exit(1)
}

// ⚠️ ON COMPTE AVANT D'AGIR. Une fiche renommée depuis le relevé ne serait pas
// trouvée, et le script terminerait en silence sur un travail à moitié fait.
const manquantes = FICHES_DEMO.filter(n => !(fiches || []).some(f => f.nom === n))
if (manquantes.length > 0) {
  console.log(`🔴 ${manquantes.length} fiche(s) introuvable(s) par leur nom :`)
  manquantes.forEach(n => console.log('   • ' + n))
  console.log('   Renommées depuis le relevé du 22/09 ? On s’arrête plutôt que d’en faire la moitié.')
  process.exit(1)
}

console.log(`${fiches.length} fiche(s) trouvée(s) :`)
for (const f of fiches) {
  const deja = f.billing_exempt === true ? ' — déjà exemptée' : ''
  console.log(`  • ${f.nom} : ${f.plan}, ${f.subscription_status || 'aucun abonnement'}${deja}`)
}
console.log('')

const aFaire = fiches.filter(f => f.billing_exempt !== true || f.stripe_subscription_id)
if (aFaire.length === 0) {
  console.log('Rien à faire : toutes sont déjà gratuites à vie, sans abonnement ouvert.')
  process.exit(0)
}

console.log(`${aFaire.length} à traiter : exemption de facturation, puis annulation de l’essai Stripe.`)
console.log('')

if (!ECRIRE) {
  console.log('Relevé seul : rien n’a été modifié.')
  console.log('Pour appliquer, relancer la même commande avec --ecrire.')
  process.exit(0)
}

// ─── 2. L'EXEMPTION D'ABORD, L'ANNULATION ENSUITE ───────────────────────────
const rates = []
let faits = 0
for (const f of aFaire) {
  // a) Le droit : gratuit à vie, quoi qu'il arrive ensuite chez Stripe.
  const { error: errExempt } = await db
    .from('commercants')
    .update({ billing_exempt: true })
    .eq('id', f.id)
  if (errExempt) {
    // 🔴 ON N'ANNULE PAS SI L'EXEMPTION A ÉCHOUÉ. Sans elle, le webhook de
    // l'annulation retirerait Vendre à la fiche : le demi-geste serait pire
    // que pas de geste du tout.
    rates.push(`${f.nom} : exemption refusée (${errExempt.message}), abonnement laissé intact`)
    continue
  }

  // b) L'essai qui se terminait le 1er octobre n'a plus lieu d'être.
  if (f.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(f.stripe_subscription_id)
    } catch (e) {
      // Déjà annulé chez Stripe : l'exemption, elle, est posée. On le dit sans
      // en faire un échec.
      const message = e?.message || String(e)
      if (/No such subscription|canceled/i.test(message)) {
        console.log(`  ✓ ${f.nom} (abonnement déjà clos chez Stripe)`)
        faits++
        continue
      }
      rates.push(`${f.nom} : exemptée, mais l’annulation Stripe a échoué (${message})`)
      continue
    }
  }
  faits++
  console.log(`  ✓ ${f.nom}`)
}

console.log('')
console.log(`${faits} fiche(s) en Vendre, gratuit à vie.`)
console.log('Le miroir (`subscription_status`) se remplira seul au passage du webhook.')
if (rates.length > 0) {
  console.log('')
  console.log(`🔴 ${rates.length} problème(s) :`)
  rates.forEach(r => console.log('   • ' + r))
  process.exit(1)
}
