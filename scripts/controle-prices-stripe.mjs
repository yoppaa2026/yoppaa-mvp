// ─── CONTRÔLE DES HUIT PRICE DE LA BOUTIQUE ET DES PACKS SMS ────────────────
//
// ⚠️ POURQUOI CE SCRIPT EXISTE. `creer-produits-stripe.mjs` CRÉE les objets
// chez Stripe et imprime huit lignes à recopier dans Vercel. Entre cette
// impression et le site qui tourne, il y a un copier-coller à la main, seize
// fois (huit en test, huit en réel), dans une interface web. Rien, jusqu'ici,
// ne vérifiait que ce qui a été collé correspond à ce qui a été créé.
//
// 🔴 ET UN SEUL PRICE MANQUANT FAIT TOMBER TOUT LE PANIER.
// `app/api/accompagnement/checkout/route.js` résout ses Price dans un `.map()`
// synchrone : sept variables sur huit laissent la boutique morte, et le
// commerçant ne voit qu'un message technique. Le défaut du 20/09, c'était
// exactement ça, sauf que les huit manquaient.
//
// 🔴 CE SCRIPT VÉRIFIE CE QUE LE SITE LIRA VRAIMENT, pas ce qui existe chez
// Stripe. Il part des variables d'environnement, une par une, et va demander à
// Stripe ce qu'elles désignent. Un identifiant recopié de travers, un Price
// d'un autre montant, un tarif récurrent glissé là : tout ça existe chez
// Stripe et ferait passer un contrôle qui se contenterait de lister le compte.
//
// ⚠️ LECTURE SEULE, ET STRICTEMENT. Aucun `create`, aucun `update`.
//
// ⚠️ IL NE CONTRÔLE QUE LE MONDE DE LA CLÉ. Une clé de test ne peut pas voir
// les Price réels, et inversement : c'est Stripe qui sépare les deux mondes,
// pas ce script. Pour contrôler les deux, on le lance deux fois, la seconde en
// posant la clé réelle DEVANT la commande plutôt qu'en modifiant un fichier :
//
//     STRIPE_SECRET_KEY=sk_live_xxx npm run controle:prices
//
// Une variable posée dans le shell l'emporte sur celle de `--env-file`
// (vérifié sur cette version de Node), donc `.env.local` n'est pas touché et
// il n'y a rien à remettre en place après coup. C'est ce qu'on veut : le seul
// geste dangereux de ce dossier serait de laisser une clé réelle traîner dans
// un fichier que `npm run dev` relit.
//
// AUCUNE DONNÉE PERSONNELLE N'EST LUE : seulement le catalogue d'Avcotech.
// La clé secrète n'est jamais affichée, seulement son monde (test ou réel).
//
// UTILISATION (à lancer par Alex, jamais par l'assistant) :
//
//   npm run controle:prices

import { requireStripe } from '@/lib/stripe'
import { modePlateforme, MODE_TEST } from '@/lib/stripe-mode'
import { PACKS_SMS } from '@/lib/packs-sms'
import { SHOP_PRODUCTS } from '@/lib/produits-boutique'
import { euros } from '@/lib/montants'

const mode = modePlateforme()
if (!mode) {
  console.error('Clé Stripe absente ou non reconnue. Lance le script avec --env-file=.env.local')
  process.exit(1)
}
const suffixe = mode === MODE_TEST ? 'TEST' : 'LIVE'

// ⚠️ LE CATALOGUE EST CELUI DU CODE, et c'est le même assemblage que le script
// de création. Deux listes écrites séparément finiraient par diverger, et c'est
// précisément la divergence qu'on cherche à mesurer.
const CATALOGUE = [
  ...Object.entries(PACKS_SMS).map(([pack, cfg]) => ({
    envKey: `SMS${pack}`,
    label: `${cfg.label} de fidélité`,
    prixHtva: cfg.prix_htva,
  })),
  ...SHOP_PRODUCTS.map(p => ({ envKey: p.envKey, label: p.label, prixHtva: p.prix })),
]

const stripe = requireStripe()

console.log(`\nMonde de la clé : ${mode.toUpperCase()}. Les variables lues portent le suffixe ${suffixe}.`)
console.log(`${CATALOGUE.length} produits au catalogue du code.\n`)

const lignes = []
let rouges = 0

const noter = (quoi, ok, obtenu, attendu) => {
  lignes.push({ quoi, ok, obtenu: String(obtenu), attendu: String(attendu) })
  if (!ok) rouges++
}

for (const item of CATALOGUE) {
  const nomVar = `STRIPE_PRICE_${item.envKey}_${suffixe}`
  const priceId = process.env[nomVar]

  // 1. La variable existe-t-elle seulement ?
  if (!priceId) {
    noter(`${nomVar} posée`, false, 'ABSENTE', 'un id price_…')
    continue
  }
  noter(`${nomVar} posée`, true, priceId.slice(0, 14) + '…', 'un id price_…')

  // 2. Désigne-t-elle quelque chose chez Stripe ?
  //
  // ⚠️ ON ATTRAPE L'ERREUR PLUTÔT QUE DE LAISSER LE SCRIPT MOURIR. Un
  // identifiant recopié de travers sur le premier produit ferait échouer la
  // commande entière, et les sept autres ne seraient jamais contrôlés : on
  // saurait qu'il y a un problème sans savoir combien.
  let price
  try {
    price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
  } catch (e) {
    const cause = e?.raw?.message || e?.message || 'erreur inconnue'
    noter(`${item.envKey} : le Price existe chez Stripe`, false, cause.slice(0, 60), 'trouvé')
    continue
  }
  noter(`${item.envKey} : le Price existe chez Stripe`, true, 'trouvé', 'trouvé')

  // 3. Le montant, qui est le seul chiffre que personne ne peut deviner.
  const attenduCents = Math.round(item.prixHtva * 100)
  noter(`${item.envKey} : montant HTVA`,
    price.unit_amount === attenduCents,
    euros((price.unit_amount || 0) / 100),
    euros(item.prixHtva))

  noter(`${item.envKey} : devise`, price.currency === 'eur', price.currency, 'eur')

  // 4. 🔴 TARIF UNIQUE, JAMAIS RÉCURRENT. Les deux routes créent leur session
  //    en `mode: 'payment'`, et Stripe REFUSE un tarif récurrent dans ce mode.
  //    Le commerçant verrait une erreur au moment de payer, pas avant.
  noter(`${item.envKey} : tarif unique`, !price.recurring,
    price.recurring ? `récurrent (${price.recurring.interval})` : 'unique', 'unique')

  // 5. Un Price archivé reste lisible par l'API mais refuse toute session.
  noter(`${item.envKey} : Price actif`, price.active === true, String(price.active), 'true')

  const produit = typeof price.product === 'object' ? price.product : null
  noter(`${item.envKey} : produit actif`, produit ? produit.active === true : false,
    produit ? String(produit.active) : 'illisible', 'true')
}

// ─── LE VERDICT ─────────────────────────────────────────────────────────────
// ⚠️ UNE LIGNE PAR CONTRÔLE, AVEC LA VALEUR ET L'ATTENDU. Un « tout est vert »
// ne dit pas ce qui a été regardé, et c'est ce qui permet à un contrôle de
// rétrécir sans que personne ne s'en aperçoive.
const largeur = Math.max(...lignes.map(l => l.quoi.length))
console.log('')
for (const l of lignes) {
  console.log(`  ${l.ok ? '✓' : '✕'} ${l.quoi.padEnd(largeur)}  ${l.obtenu.padEnd(18)} attendu ${l.attendu}`)
}

console.log('')
if (rouges > 0) {
  console.log(`🔴 ${rouges} contrôle(s) en échec sur ${lignes.length}, en monde ${suffixe}.`)
  console.log('   La boutique et les packs SMS ne fonctionneront pas tant que ce n’est pas vert :')
  console.log('   un seul Price manquant fait échouer la résolution de TOUT le panier.')
  process.exit(1)
}
console.log(`${lignes.length} contrôles conformes en monde ${suffixe}. Les ${CATALOGUE.length} produits sont achetables.`)
console.log('⚠️ Ceci ne vaut QUE pour ce monde. Relance avec la clé de l’autre monde pour le clore aussi.')
