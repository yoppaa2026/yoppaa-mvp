// ─── LE CATALOGUE QUI DOIT AVOIR UN PRICE CHEZ STRIPE ───────────────────────
//
// 🔴 POURQUOI CE BANC EXISTE. Le 20/09, un audit a trouvé que les HUIT Price
// des packs SMS et de la boutique n'existaient sur Vercel ni en test ni en
// réel. Conséquence : le bouton « 100 SMS » et chaque article de la boutique
// rendaient 500 EN PRODUCTION, et le bouton s'affichait sans condition. Personne
// ne l'avait vu, parce que rien ne reliait le catalogue écrit dans le code aux
// objets qui vivent chez Stripe.
//
// 🔴 ET LE DANGER NE DISPARAÎT PAS QUAND LES HUIT SONT CRÉÉS : il se déplace au
// NEUVIÈME. Le jour où quelqu'un ajoute un produit à `SHOP_PRODUCTS`, la
// boutique l'affichera, le client cliquera, et la résolution du Price échouera.
// Pire : `app/api/accompagnement/checkout/route.js` résout ses Price dans un
// `.map()` synchrone, donc **un seul produit sans Price fait tomber TOUT le
// panier**, y compris les huit qui marchaient.
//
// ⚠️ CE BANC NE PARLE PAS À STRIPE, ET C'EST VOULU. Un banc qui a besoin d'une
// clé secrète ne tourne pas en intégration continue, ne tourne pas chez un
// relecteur, et finit par être sauté. Celui-ci garde ce qu'on peut garder sans
// réseau : la FORME du catalogue, et le fait qu'on ne peut pas l'agrandir en
// silence. Ce qui vit chez Stripe se contrôle avec `npm run controle:prices`,
// qui lui demande une clé et se lance à la main.
//
//   node scripts/verif-catalogue-prices.mjs

import { PACKS_SMS } from '../lib/packs-sms.js'
import { SHOP_PRODUCTS } from '../lib/produits-boutique.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}

// Le catalogue, assemblé comme le font les deux scripts Stripe.
const CATALOGUE = [
  ...Object.entries(PACKS_SMS).map(([pack, cfg]) => ({
    envKey: `SMS${pack}`, label: cfg.label, prix: cfg.prix_htva, famille: 'pack SMS',
  })),
  ...SHOP_PRODUCTS.map(p => ({
    envKey: p.envKey, label: p.label, prix: p.prix, famille: 'boutique',
  })),
]

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA SENTINELLE : ON NE PEUT PAS AGRANDIR LE CATALOGUE EN SILENCE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CE CHIFFRE N'EST PAS UNE DÉCORATION, C'EST LE GESTE QU'ON FORCE. Ajouter
// un produit fait rougir ce banc, et le seul moyen de le reverdir est de venir
// ici, donc de lire ce commentaire, donc de savoir qu'il faut créer le Price
// chez Stripe et poser sa variable sur Vercel, EN TEST ET EN RÉEL.
//
// Pour ajouter un produit :
//   1. l'écrire dans `lib/produits-boutique.js` (ou `lib/packs-sms.js`) ;
//   2. `npm run produits:stripe` puis `-- --ecrire`, une fois par monde ;
//   3. poser les deux variables sur Vercel (Production ET Preview) ;
//   4. `npm run controle:prices`, une fois par monde ;
//   5. seulement alors, monter le compte ci-dessous.
const ATTENDUS = 8

verifier(`le catalogue compte ${ATTENDUS} produits à vendre`,
  CATALOGUE.length === ATTENDUS,
  `${CATALOGUE.length} trouvé(s) : ${CATALOGUE.map(c => c.envKey).join(', ')}`)

// ═══════════════════════════════════════════════════════════════════════════
// 2. CHAQUE PRODUIT PEUT DÉSIGNER SON PRICE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ `envKey` N'EST PAS UNE ÉTIQUETTE, C'EST LA MOITIÉ D'UN NOM DE VARIABLE
// D'ENVIRONNEMENT. `getStripePriceIdProduitBoutique` construit
// `STRIPE_PRICE_${envKey}_${suffixe}` et lit `process.env`. Un tiret, un espace
// ou un accent là-dedans produit un nom que Vercel ne peut pas porter, et
// l'erreur n'apparaîtrait qu'au premier clic d'un client.
const vus = new Set()
for (const item of CATALOGUE) {
  const nom = `${item.famille} « ${item.label || item.envKey} »`

  verifier(`${nom} porte une clé d’environnement`,
    typeof item.envKey === 'string' && item.envKey.length > 0, String(item.envKey))

  verifier(`${nom} : la clé tient dans un nom de variable`,
    /^[A-Z0-9_]+$/.test(item.envKey || ''), item.envKey)

  // 🔴 DEUX PRODUITS SOUS LA MÊME CLÉ, C'EST LE MÊME PRICE POUR DEUX PRIX. Le
  // client paierait l'un au tarif de l'autre, et le script de création ne
  // verrait qu'un seul produit à créer.
  verifier(`${nom} : la clé n’est pas déjà prise`, !vus.has(item.envKey), item.envKey)
  vus.add(item.envKey)

  // ⚠️ LE PIÈGE DU ZÉRO, ENCORE. Un prix à 0 passerait tous les contrôles de
  // présence et créerait chez Stripe un tarif gratuit, sans que rien ne casse.
  verifier(`${nom} : le prix est un montant réel`,
    Number.isFinite(item.prix) && item.prix > 0, String(item.prix))

  // Un montant avec trois décimales devient un nombre de cents non entier :
  // `Math.round` l'arrondirait en silence, et le Price ne vaudrait pas le prix
  // affiché au commerçant.
  const cents = (item.prix || 0) * 100
  verifier(`${nom} : le prix tombe juste au cent`,
    Math.abs(cents - Math.round(cents)) < 1e-9, `${item.prix} € → ${cents} cents`)

  verifier(`${nom} porte un libellé`,
    typeof item.label === 'string' && item.label.trim().length >= 3, String(item.label))
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LES DEUX SCRIPTS STRIPE LISENT LE MÊME CATALOGUE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CELUI QUI CRÉE ET CELUI QUI CONTRÔLE DOIVENT PARTIR DE LA MÊME LISTE.
// S'ils divergent, le contrôle peut être vert sur sept produits pendant que le
// huitième n'a jamais été créé : un contrôle qui ne regarde pas tout dit « tout
// va bien » avec la même assurance qu'un contrôle complet.
import { readFileSync } from 'node:fs'
const CREER = readFileSync(new URL('./creer-produits-stripe.mjs', import.meta.url), 'utf8')
const CONTROLE = readFileSync(new URL('./controle-prices-stripe.mjs', import.meta.url), 'utf8')

for (const [nom, source] of [['de création', CREER], ['de contrôle', CONTROLE]]) {
  verifier(`le script ${nom} lit les packs SMS du code`, /from '@\/lib\/packs-sms'/.test(source))
  verifier(`le script ${nom} lit la boutique du code`, /from '@\/lib\/produits-boutique'/.test(source))
  verifier(`le script ${nom} construit STRIPE_PRICE_…_<monde>`,
    /STRIPE_PRICE_\$\{item\.envKey\}_\$\{suffixe\}/.test(source))
  // ⚠️ AUCUN MONTANT RECOPIÉ À LA MAIN dans ces scripts : le prix vient du
  // code, toujours, sinon Stripe et le tableau de bord finissent par annoncer
  // deux chiffres différents au même commerçant.
  verifier(`le script ${nom} ne recopie aucun montant en dur`,
    !/unit_amount:\s*\d{3,}/.test(source))
}

// 🔴 ET LE CONTRÔLE DOIT PARTIR DES VARIABLES, PAS DU COMPTE STRIPE. Lister le
// compte dirait ce qui EXISTE ; seul `process.env` dit ce que le site LIRA.
// C'est là qu'un identifiant recopié de travers se voit, et nulle part ailleurs.
verifier('le contrôle part des variables d’environnement',
  /process\.env\[nomVar\]/.test(CONTROLE))
verifier('le contrôle vérifie le montant contre le code',
  /price\.unit_amount === attenduCents/.test(CONTROLE))
verifier('le contrôle refuse un tarif récurrent',
  /!price\.recurring/.test(CONTROLE))

console.log(`\nCatalogue des Price : ${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  console.log('\n⚠️ Si tu viens d’ajouter un produit : crée son Price chez Stripe')
  console.log('   (`npm run produits:stripe -- --ecrire`, une fois par monde), pose sa')
  console.log('   variable sur Vercel, puis monte ATTENDUS dans ce fichier.')
  process.exit(1)
}
console.log(`Les ${CATALOGUE.length} produits du code peuvent désigner leur Price.`)
console.log('⚠️ Ce banc ne parle pas à Stripe : `npm run controle:prices` vérifie l’autre moitié.')
