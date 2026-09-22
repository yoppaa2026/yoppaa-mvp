// HARNAIS DE MUTATION — LE CATALOGUE QUI DOIT AVOIR UN PRICE (22/09)
//
// 🔴 POURQUOI CE HARNAIS EXISTE. Le banc qu il mesure est ne d un defaut reel :
// le 20/09, les HUIT Price des packs SMS et de la boutique n existaient sur
// Vercel ni en test ni en reel, et la boutique rendait 500 EN PRODUCTION sans
// que rien ne le signale. Un banc ecrit APRES un defaut de ce genre doit etre
// mesure, sinon on remplace un trou par la CROYANCE qu il est bouche.
//
// ⚠️ CHAQUE MUTATION NOMME LA GARDE QU ELLE DOIT FAIRE ROUGIR, et le harnais
// verifie que c est bien celle-la qui rougit. Un banc peut reagir par accident,
// via une garde voisine, et laisser la vraie garde non eprouvee.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-catalogue-prices.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:catalogue-prices'

const BOUTIQUE = 'lib/produits-boutique.js'
const SMS = 'lib/packs-sms.js'
const CREER = 'scripts/creer-produits-stripe.mjs'
const CONTROLE = 'scripts/controle-prices-stripe.mjs'

const MUTATIONS = [
  // ─── LA SENTINELLE ───────────────────────────────────────────────────────
  //
  // 🔴 LE DEFAUT DE DEMAIN, PAS CELUI D HIER. Les huit Price seront crees ; le
  // danger se deplace au NEUVIEME produit, ajoute sans son Price, qui fait
  // tomber TOUT le panier a cause du `.map()` synchrone de la route.
  {
    nom: '🔴 un neuvieme produit arrive sans que personne ne cree son Price',
    fichier: SMS,
    de: "  '500': { nb: 500, prix_htva: 59.90, label: '500 SMS' },",
    vers: "  '500': { nb: 500, prix_htva: 59.90, label: '500 SMS' },\n  '1000': { nb: 1000, prix_htva: 99.90, label: '1000 SMS' },",
    garde: 'le catalogue compte 8 produits à vendre',
  },

  // ─── LA CLE EST LA MOITIE D UN NOM DE VARIABLE ───────────────────────────
  {
    nom: '🔴 une cle avec un tiret : Vercel ne peut pas porter ce nom de variable',
    fichier: BOUTIQUE,
    de: "envKey: 'KIT_PRO',",
    vers: "envKey: 'KIT-PRO',",
    garde: 'boutique « Kit Yoppaa Pro » : la clé tient dans un nom de variable',
  },
  {
    nom: '🔴 deux produits sous la MEME cle : un seul Price pour deux prix',
    fichier: BOUTIQUE,
    de: "envKey: 'KIT_LIGHT',",
    vers: "envKey: 'KIT_PRO',",
    garde: 'boutique « Kit Yoppaa Light » : la clé n’est pas déjà prise',
  },

  // ─── LE PIEGE DU ZERO, ET CELUI DU CENT ──────────────────────────────────
  {
    nom: '🔴 un produit a 0 € : un tarif gratuit serait cree chez Stripe sans rien casser',
    fichier: BOUTIQUE,
    de: '    prix: 469,',
    vers: '    prix: 0,',
    garde: 'boutique « Kit Yoppaa Pro » : le prix est un montant réel',
  },
  {
    nom: '🔴 un prix a trois decimales : l arrondi au cent se ferait en silence',
    fichier: BOUTIQUE,
    de: '    prix: 47.90,',
    vers: '    prix: 47.905,',
    garde: 'le prix tombe juste au cent',
  },

  // ─── LES DEUX SCRIPTS DOIVENT LIRE LE MEME CATALOGUE ─────────────────────
  //
  // 🔴 UN CONTROLE QUI NE REGARDE PAS TOUT DIT « TOUT VA BIEN » AVEC LA MEME
  // ASSURANCE QU UN CONTROLE COMPLET.
  {
    nom: '🔴 le script de creation cesse de lire les prix du code',
    fichier: CREER,
    de: "import { PACKS_SMS } from '@/lib/packs-sms'",
    vers: "const PACKS_SMS = { '100': { prix_htva: 12.9, label: '100 SMS' } }",
    garde: 'le script de création lit les packs SMS du code',
  },
  {
    nom: '🔴 le controle part du compte Stripe au lieu des variables du site',
    fichier: CONTROLE,
    de: '  const priceId = process.env[nomVar]',
    vers: '  const priceId = (await stripe.prices.list({ limit: 1 })).data[0]?.id',
    garde: 'le contrôle part des variables d’environnement',
  },
  {
    nom: '🔴 le controle ne verifie plus le montant contre le code',
    fichier: CONTROLE,
    de: '    price.unit_amount === attenduCents,',
    vers: '    typeof price.unit_amount === \'number\',',
    garde: 'le contrôle vérifie le montant contre le code',
  },
  {
    nom: '🔴 le controle accepte un tarif recurrent, que Stripe refusera au paiement',
    fichier: CONTROLE,
    de: "  noter(`${item.envKey} : tarif unique`, !price.recurring,",
    vers: "  noter(`${item.envKey} : tarif unique`, true,",
    garde: 'le contrôle refuse un tarif récurrent',
  },
  {
    nom: '🔴 un montant recopie en dur dans le script de creation',
    fichier: CREER,
    de: '    unit_amount: cents,',
    vers: '    unit_amount: 46900,',
    garde: 'le script de création ne recopie aucun montant en dur',
  },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, echecs: [] }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications passées/.test(sortie)
    const echecs = [...sortie.matchAll(/✕ ([^\n]+)/g)].map(m => m[1].split(' → ')[0].trim())
    return { rouge: true, plante, echecs, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  if (res.plante) {
    manquees.push(`${m.nom} — le banc a PLANTÉ`)
    console.log(`  ⚠ plantage : ${m.nom}`)
  } else if (!res.rouge) {
    manquees.push(`${m.nom} — RESTÉ VERT`)
    console.log(`  ✕ MANQUÉE : ${m.nom}`)
  } else if (!res.echecs.some(e => e.includes(m.garde))) {
    manquees.push(`${m.nom} — rouge sur une AUTRE garde : ${res.echecs.slice(0, 3).join(' / ')}`)
    console.log(`  ⚠ mauvaise garde : ${m.nom}`)
  } else {
    attrapees++
    console.log(`  ✓ attrapée : ${m.nom}`)
  }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées par la garde visée.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
