// ─── CRÉER LES PRODUITS STRIPE D'AVCOTECH (packs SMS et boutique) ───────────
//
// ⚠️ POURQUOI CE SCRIPT EXISTE. Un audit du 20/09 a montré que les HUIT Price
// des packs SMS et de la boutique n'existaient sur Vercel ni en test ni en
// réel : acheter un pack de SMS ou un kit rendait déjà 500 en production. Les
// créer à la main, c'est huit occasions de se tromper d'un centime, de choisir
// « récurrent » au lieu de « unique », ou d'oublier le huitième.
//
// 🔴 UN SEUL PRICE MANQUANT FAIT TOMBER TOUT LE PANIER.
// `app/api/accompagnement/checkout/route.js` résout ses Price dans un `.map()`
// synchrone : sept produits sur huit laissent la boutique morte, et rien ne dit
// lequel manque. C'est la raison d'être de ce script : les huit, d'un coup.
//
// ⚠️ LES MONTANTS VIENNENT DU CODE, JAMAIS D'UNE SAISIE. `lib/packs-sms.js` et
// `lib/produits-boutique.js` sont la source, et ce sont les mêmes fichiers que
// lit le tableau de bord pour afficher ses prix. Recopier les montants à la
// main dans Stripe, c'est ouvrir la porte à une divergence entre le prix
// annoncé au commerçant et celui qui sera débité.
//
// ⚠️ LES PRIX SONT HTVA, et c'est voulu : la TVA belge s'ajoute désormais par
// le TaxRate posé sur la ligne de commande (`getStripeTaxRateId`). Un Price qui
// porterait déjà la TVA la ferait compter deux fois.
//
// 🔴 TARIF UNIQUE, JAMAIS RÉCURRENT. Les deux routes créent leur session en
// `mode: 'payment'`, et Stripe refuse un tarif récurrent dans ce mode.
//
// ⚠️ IDEMPOTENT. Chaque produit porte `metadata.yoppaa_env_key`. Relancé, le
// script retrouve ce qui existe et ne recrée rien. Un produit dont le prix
// aurait changé est SIGNALÉ, jamais corrigé en silence : un Price Stripe est
// immuable, il faudrait en créer un nouveau et archiver l'ancien, et cette
// décision-là ne se prend pas dans un script.
//
// AUCUNE DONNÉE PERSONNELLE N'EST LUE : seulement le catalogue d'Avcotech.
//
// UTILISATION (à lancer par Alex, jamais par l'assistant) :
//
//   node --env-file=.env.local --experimental-loader ./scripts/alias-loader.mjs \
//        scripts/creer-produits-stripe.mjs
//
// Sans drapeau, il DIT ce qu'il ferait et n'écrit rien. Ajouter `--ecrire`
// pour créer vraiment. On regarde d'abord, on écrit ensuite.

import { requireStripe } from '@/lib/stripe'
import { modePlateforme, MODE_TEST } from '@/lib/stripe-mode'
import { PACKS_SMS } from '@/lib/packs-sms'
import { SHOP_PRODUCTS } from '@/lib/produits-boutique'
import { euros } from '@/lib/montants'

const ECRIRE = process.argv.includes('--ecrire')

const mode = modePlateforme()
if (!mode) {
  console.error('Clé Stripe absente ou non reconnue. Lance le script avec --env-file=.env.local')
  process.exit(1)
}
const suffixe = mode === MODE_TEST ? 'TEST' : 'LIVE'

// ─── LE CATALOGUE, LU DANS LE CODE ──────────────────────────────────────────
// ⚠️ Les deux familles se rejoignent ici sous la même forme. `envKey` est ce
// qui relie un produit Stripe à sa variable d'environnement, et c'est lui que
// `getStripePriceIdSmsPack` et `getStripePriceIdProduitBoutique` reconstruisent.
const CATALOGUE = [
  ...Object.entries(PACKS_SMS).map(([pack, cfg]) => ({
    envKey: `SMS${pack}`,
    label: `${cfg.label} de fidélité`,
    prixHtva: cfg.prix_htva,
  })),
  ...SHOP_PRODUCTS.map(p => ({
    envKey: p.envKey,
    label: p.label,
    prixHtva: p.prix,
  })),
]

const stripe = requireStripe()

console.log(`\nMonde de la clé : ${mode.toUpperCase()}. Les variables porteront le suffixe ${suffixe}.`)
console.log(ECRIRE ? '✍️  Mode ÉCRITURE : les produits manquants vont être créés.\n'
                   : '👀 Mode lecture : rien ne sera créé. Ajoute --ecrire pour agir.\n')

// ─── CE QUI EXISTE DÉJÀ ─────────────────────────────────────────────────────
// ⚠️ ON PAGINE PLUTÔT QUE DE SUPPOSER. Un `limit: 100` qui tronque ferait
// recréer des produits déjà là, en double, sans le moindre message.
const existants = []
for await (const p of stripe.products.list({ limit: 100, active: true })) {
  existants.push(p)
}
const parEnvKey = new Map()
for (const p of existants) {
  const k = p.metadata?.yoppaa_env_key
  if (k) parEnvKey.set(k, p)
}
console.log(`${existants.length} produit(s) actif(s) chez Stripe, dont ${parEnvKey.size} posé(s) par ce script.\n`)

// ─── LE TRAVAIL ─────────────────────────────────────────────────────────────
const lignes = []
const alertes = []

for (const item of CATALOGUE) {
  const nomVar = `STRIPE_PRICE_${item.envKey}_${suffixe}`
  const cents = Math.round(item.prixHtva * 100)
  let produit = parEnvKey.get(item.envKey)

  if (!produit) {
    if (!ECRIRE) {
      lignes.push({ nomVar, valeur: '(à créer)', quoi: `${item.label} — ${euros(item.prixHtva)} HTVA` })
      continue
    }
    produit = await stripe.products.create({
      name: item.label,
      metadata: { yoppaa_env_key: item.envKey },
    })
    console.log(`  + produit créé : ${item.label}`)
  }

  // Un tarif unique, en euros, au montant HTVA. On cherche d'abord s'il existe.
  const prix = await stripe.prices.list({ product: produit.id, active: true, limit: 100 })
  const dejaBon = prix.data.find(p =>
    p.unit_amount === cents && p.currency === 'eur' && !p.recurring)

  if (dejaBon) {
    lignes.push({ nomVar, valeur: dejaBon.id, quoi: `${item.label} — ${euros(item.prixHtva)} HTVA` })
    // 🔴 UN TARIF RÉCURRENT SUR CE PRODUIT EST UN PIÈGE SILENCIEUX : le code
    // l'utiliserait en `mode: 'payment'` et Stripe refuserait la session.
    const recurrents = prix.data.filter(p => p.recurring)
    if (recurrents.length) {
      alertes.push(`${item.label} porte ${recurrents.length} tarif(s) RÉCURRENT(S) : à archiver, ils ne peuvent pas servir ici.`)
    }
    continue
  }

  // ⚠️ UN AUTRE MONTANT EXISTE : ON LE DIT, ON NE LE CORRIGE PAS. Un Price est
  // immuable chez Stripe ; le remplacer veut dire en créer un et archiver
  // l'ancien, ce qui touche les achats déjà passés.
  const autres = prix.data.filter(p => !p.recurring && p.currency === 'eur')
  if (autres.length) {
    alertes.push(
      `${item.label} a déjà un tarif à ${euros((autres[0].unit_amount || 0) / 100)} `
      + `alors que le code annonce ${euros(item.prixHtva)}. Rien n'a été touché : tranche d'abord lequel fait foi.`)
    lignes.push({ nomVar, valeur: autres[0].id, quoi: `${item.label} — ⚠️ MONTANT DIVERGENT` })
    continue
  }

  if (!ECRIRE) {
    lignes.push({ nomVar, valeur: '(tarif à créer)', quoi: `${item.label} — ${euros(item.prixHtva)} HTVA` })
    continue
  }

  const cree = await stripe.prices.create({
    product: produit.id,
    unit_amount: cents,
    currency: 'eur',
    metadata: { yoppaa_env_key: item.envKey },
  })
  console.log(`  + tarif créé : ${item.label} à ${euros(item.prixHtva)} HTVA`)
  lignes.push({ nomVar, valeur: cree.id, quoi: `${item.label} — ${euros(item.prixHtva)} HTVA` })
}

// ─── CE QU'IL RESTE À COLLER ────────────────────────────────────────────────
const largeur = Math.max(...lignes.map(l => l.nomVar.length))
console.log('\n─── À poser dans Vercel (Production ET Preview) et dans .env.local ───\n')
for (const l of lignes) {
  console.log(`${l.nomVar.padEnd(largeur)} = ${l.valeur}`)
}
console.log('')
for (const l of lignes) console.log(`   ${l.nomVar.padEnd(largeur)}  ${l.quoi}`)

if (alertes.length) {
  console.log(`\n⚠️ ${alertes.length} point(s) à regarder :`)
  for (const a of alertes) console.log('   • ' + a)
}

console.log(ECRIRE
  ? `\n${lignes.length} variables à poser. Puis relance \`npm run controle:tva\`.`
  : '\nRien n\'a été créé. Relance avec --ecrire quand la liste ci-dessus te convient.')
