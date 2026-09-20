// ─── CONTRÔLE DE LA TVA DE L'ABONNEMENT, CHEZ STRIPE ────────────────────────
//
// ⚠️ POURQUOI CE SCRIPT EXISTE. Le taux affiché au commerçant vit dans le code
// (`TVA_ABONNEMENT_POURCENT`, lib/plans.js) et le taux prélevé vit chez Stripe,
// dans un objet TaxRate. Rien, mécaniquement, n'oblige ces deux-là à dire la
// même chose. C'est exactement le piège de la date d'essai, où le texte
// promettait une durée que Stripe ne prélevait pas, et on ne s'en aperçoit
// qu'au premier prélèvement réel, c'est-à-dire trop tard et pour tout le monde
// en même temps. Le banc mesure le code ; ce script va voir l'autre moitié.
//
// 🔴 `inclusive` EST LE CHIFFRE QUI DÉCIDE DE LA MARGE. Un TaxRate « inclusif »
// ne rajoute rien : il déclare que les 19,90 € contenaient déjà la TVA, donc
// Avcotech en reverse 3,45 € et il reste 16,45 €. Un TaxRate « exclusif »
// facture 24,08 € et les 19,90 € restent entiers. Le même taux de 21 %, deux
// résultats qui diffèrent de 17,4 % de la recette d'abonnement.
//
// ⚠️ LECTURE SEULE, ET STRICTEMENT. Aucun `create`, aucun `update` : ce script
// regarde et compare, il ne configure rien. C'est volontaire tant qu'un store
// est en revue, et de toute façon la création du TaxRate se fait à la main dans
// le tableau de bord Stripe, où la case « inclusif » se voit.
//
// AUCUNE DONNÉE PERSONNELLE N'EST LUE : seulement des objets de configuration.
// La clé secrète n'est jamais affichée, seulement son monde (test ou réel).
//
// UTILISATION (à lancer par Alex, jamais par l'assistant) :
//
//   node --env-file=.env.local --experimental-loader ./scripts/alias-loader.mjs \
//        scripts/controle-tva-stripe.mjs

import { requireStripe } from '@/lib/stripe'
import { modePlateforme, MODE_TEST } from '@/lib/stripe-mode'
import { getPrixPlan, TVA_ABONNEMENT_POURCENT } from '@/lib/plans'

const mode = modePlateforme()
if (!mode) {
  console.error('Clé Stripe absente ou non reconnue. Lance le script avec --env-file=.env.local')
  process.exit(1)
}
const suffixe = mode === MODE_TEST ? 'TEST' : 'LIVE'

// Une ligne de contrôle : ce qu'on a trouvé, ce qu'on attendait, et le verdict.
// ⚠️ LES DEUX COLONNES SONT TOUJOURS REMPLIES. Un contrôle qui n'affiche que sa
// valeur oblige à se souvenir de l'attendu, et on finit par valider de tête.
const lignes = []
let rouges = 0
const controle = (quoi, obtenu, attendu) => {
  const ok = String(obtenu) === String(attendu)
  if (!ok) rouges++
  lignes.push({ quoi, obtenu: String(obtenu), attendu: String(attendu), ok })
}

const stripe = requireStripe()

console.log(`\nMonde de la clé : ${mode.toUpperCase()}. On lit donc les objets ${suffixe}.\n`)

// ─── LE TAXRATE ─────────────────────────────────────────────────────────────
const idTaxRate = process.env[`STRIPE_TAX_RATE_BE_${suffixe}`]
if (!idTaxRate) {
  console.error(`🔴 STRIPE_TAX_RATE_BE_${suffixe} n'est pas définie.`)
  console.error('')
  console.error('   À faire chez Stripe (Produits → Taux de taxe → Créer) :')
  console.error('     • Nom affiché      : TVA')
  console.error(`     • Pourcentage      : ${TVA_ABONNEMENT_POURCENT} %`)
  console.error('     • Inclus dans le prix : NON (le taux s’ajoute)')
  console.error('     • Pays             : Belgique')
  console.error('     • Description      : TVA belge')
  console.error('')
  console.error(`   Puis coller l’identifiant (txr_…) dans STRIPE_TAX_RATE_BE_${suffixe},`)
  console.error('   sur Vercel et dans .env.local.')
  process.exit(1)
}

let taxRate
try {
  taxRate = await stripe.taxRates.retrieve(idTaxRate)
} catch (e) {
  console.error(`\n🔴 STRIPE_TAX_RATE_BE_${suffixe} : Stripe ne reconnaît pas cet identifiant.`)
  console.error(`   ${e?.message || 'erreur inconnue'}`)
  console.error('   Un taux de taxe commence par txr_, et il appartient à un monde :')
  console.error(`   celui-ci doit venir du mode ${suffixe === 'TEST' ? 'test' : 'réel'}.`)
  process.exit(1)
}
controle('le taux appliqué', taxRate.percentage, TVA_ABONNEMENT_POURCENT)
// 🔴 LE CONTRÔLE QUI DÉCIDE DE LA MARGE.
controle('le taux s’AJOUTE au prix (inclusive = false)', taxRate.inclusive, false)
controle('le pays du taux', taxRate.country, 'BE')
controle('le taux est actif', taxRate.active, true)

// ─── LES PRICE ──────────────────────────────────────────────────────────────
// ⚠️ LE PRICE DOIT PORTER LE MONTANT HTVA, pas le montant TVA comprise. Un
// Price à 24,08 € doublerait la taxe : 24,08 + 21 % = 29,14 €.
for (const [plan, envKey] of [
  ['communiquer', `STRIPE_PRICE_COMMUNIQUER_${suffixe}`],
  ['vendre',      `STRIPE_PRICE_VENDRE_${suffixe}`],
]) {
  const idPrice = process.env[envKey]
  if (!idPrice) {
    controle(`${plan} : ${envKey}`, 'absente', 'un identifiant price_…')
    continue
  }
  // ⚠️ LA CONFUSION QUI SE PRODUIT VRAIMENT : `prod_…` EST LE PRODUIT, `price_…`
  // EST SON TARIF. L'écran de Stripe montre l'identifiant du produit en premier,
  // et il faut ouvrir la ligne de tarification pour trouver celui du tarif. Le
  // message brut de Stripe (« No such price ») ne dit pas lequel des deux on a
  // collé, ni où aller chercher l'autre.
  let price
  try {
    price = await stripe.prices.retrieve(idPrice)
  } catch (e) {
    if (String(idPrice).startsWith('prod_')) {
      console.error(`\n🔴 ${envKey} contient un identifiant de PRODUIT (prod_…), pas de TARIF (price_…).`)
      console.error('   Chez Stripe : Catalogue de produits → ouvre le produit → section Tarification →')
      console.error('   clique la ligne du tarif, et copie l’ID qui commence par price_.')
    } else {
      console.error(`\n🔴 ${envKey} : Stripe ne reconnaît pas cet identifiant (${e?.message || 'erreur inconnue'}).`)
      console.error(`   Vérifie qu’il vient bien du monde ${suffixe} : un tarif de test n’existe pas en réel, et l’inverse non plus.`)
    }
    process.exit(1)
  }
  const attenduCents = Math.round(getPrixPlan(plan).mensuel * 100)
  controle(`${plan} : le montant du Price, en cents HTVA`, price.unit_amount, attenduCents)
  controle(`${plan} : la devise`, price.currency, 'eur')
  controle(`${plan} : la périodicité`, price.recurring?.interval, 'month')
  controle(`${plan} : le Price est actif`, price.active, true)
  // ⚠️ POUR INFORMATION, PAS POUR VERDICT. Avec un taux manuel, c'est
  // `inclusive` du TaxRate qui décide si la TVA s'ajoute ; `tax_behavior` du
  // Price sert à Stripe Tax, qu'on n'utilise pas. On l'affiche parce qu'un
  // `inclusive` sur le Price serait le signe d'une configuration à moitié
  // partie vers Stripe Tax, et ça se regarde.
  console.log(`   (info) ${plan} : tax_behavior du Price = ${price.tax_behavior}`)
}

// ─── LE VERDICT ─────────────────────────────────────────────────────────────
const largeur = Math.max(...lignes.map(l => l.quoi.length))
console.log('')
for (const l of lignes) {
  const marque = l.ok ? '✓' : '✕'
  console.log(`  ${marque} ${l.quoi.padEnd(largeur)}  ${l.obtenu.padEnd(14)} attendu ${l.attendu}`)
}

console.log('')
if (rouges > 0) {
  console.log(`🔴 ${rouges} contrôle(s) en échec. Ne crée pas les Price de production tant que ce n'est pas vert.`)
  process.exit(1)
}
console.log(`La TVA de ${TVA_ABONNEMENT_POURCENT} % s'ajoutera bien aux prix HTVA. ${lignes.length} contrôles conformes.`)
console.log(`Communiquer sera facturé ${(getPrixPlan('communiquer').mensuel * (100 + TVA_ABONNEMENT_POURCENT) / 100).toFixed(2)} € TVA comprise.`)
