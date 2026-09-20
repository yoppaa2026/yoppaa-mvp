// HARNAIS DE MUTATION — LA TVA DE L ABONNEMENT (20/09)
//
// 🔴 CE QU ON MESURE. La page d abonnement promettait « la TVA applicable sera
// ajoutee au moment du paiement » alors que NI `automatic_tax` NI
// `default_tax_rates` n existaient dans le depot. Stripe prelevait le montant
// nu ; une facture sans TVA est reputee TVA comprise, donc 16,45 € seraient
// restes sur 19,90 €. Personne ne l aurait vu avant la premiere declaration
// trimestrielle, et pour tout le monde en meme temps.
//
// Chacune des mutations ci-dessous remet une des formes fausses possibles. Si
// le banc reste vert sur l une d elles, ce lot ne protege pas ce qu il pretend.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-tva-abonnement.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:lancement'
const MODULE = 'lib/plans.js'

const BILLING = 'lib/stripe-billing.js'
const PAGE    = 'app/dashboard/abonnement/page.js'

const MUTATIONS = [
  // ─── LE CALCUL ──────────────────────────────────────────────────────────
  // ⚠️ MUTER LA CONSTANTE MESURE DEUX CHOSES A LA FOIS : que les montants en
  // descendent vraiment, et que personne n a recopie 121 en dur dans le calcul
  // (auquel cas la garde anti-divergence rougirait, elle, et pas les montants).
  { nom: '🔴 le taux belge passe a 6 % : les montants doivent suivre, ou c est qu ils sont recopies',
    de: 'export const TVA_ABONNEMENT_POURCENT = 21',
    vers: 'export const TVA_ABONNEMENT_POURCENT = 6' },

  { nom: '🔴 LE DEFAUT D ORIGINE : plus aucune TVA, le montant nu redevient le montant facture',
    de: 'export const TVA_ABONNEMENT_POURCENT = 21',
    vers: 'export const TVA_ABONNEMENT_POURCENT = 0' },

  // 🔴 LE PIEGE DU ZERO, HUITIEME FOIS. `!htva` est faux pour 0 comme pour
  // `null` : Exister, gratuit, n aurait plus de prix du tout.
  { nom: '🔴 le piege du zero : Exister perd son prix parce que 0 est falsy',
    de: '  if (!Number.isFinite(htva)) return null',
    vers: '  if (!htva) return null' },

  // ⚠️ ET L INVERSE : `!= null` laisse passer NaN, l infini et les chaines.
  // `Number(null)` vaut 0, et une absence afficherait « gratuit » sur un
  // forfait payant.
  { nom: '🔴 une absence redevient un zero : « gratuit » s affiche sur un forfait payant',
    de: '  if (!Number.isFinite(htva)) return null',
    vers: '  if (htva === undefined) return null' },

  { nom: '⚠️ l arrondi disparait : l ecran affiche 24,078999999999997 €',
    de: '  return Math.round(htva * (100 + TVA_ABONNEMENT_POURCENT)) / 100',
    vers: '  return htva * (100 + TVA_ABONNEMENT_POURCENT) / 100' },

  { nom: '⚠️ l arrondi tombe a l euro : 24,08 € devient 24,00 €',
    de: '  return Math.round(htva * (100 + TVA_ABONNEMENT_POURCENT)) / 100',
    vers: '  return Math.round(htva * (100 + TVA_ABONNEMENT_POURCENT) / 100)' },

  // ─── LE TAXRATE : LE BON MONDE, OU RIEN ─────────────────────────────────
  { nom: '🔴 LE DEFAUT QUI COUTE : le taux de l autre monde sert de repli, et il ne taxe rien',
    fichier: BILLING,
    de: '  const taxRateId = process.env[envKey]',
    vers: '  const taxRateId = process.env[envKey] || process.env.STRIPE_TAX_RATE_BE_LIVE' },

  { nom: '🔴 le taux manquant n arrete plus rien : on encaisse sans TVA',
    fichier: BILLING,
    de: '  if (!taxRateId) {',
    vers: '  if (false) {' },

  // ⚠️ LA LECON DU 17/09, REMISE : `isStripeTestMode()` repond « live » sans
  // cle. Le brancher ici choisirait le taux de production sur une installation
  // qui n a pas de Stripe du tout.
  { nom: '🔴 le monde se decide par isStripeTestMode : pas de cle, donc « live »',
    fichier: BILLING,
    de: '  const mode = modePlateforme()',
    vers: "  const mode = isStripeTestMode() ? MODE_TEST : 'live'" },

  { nom: '🔴 pas de cle, on devine « live » au lieu de refuser',
    fichier: BILLING,
    de: "    throw new Error('Configuration Stripe incomplète : STRIPE_SECRET_KEY manquante ou non reconnue')",
    vers: "    return 'LIVE'" },

  // ─── LES DEUX VOIES ─────────────────────────────────────────────────────
  { nom: '🔴 la voie Checkout ne taxe plus : qui souscrit depuis son tableau de bord passe au travers',
    fichier: BILLING,
    de: '    default_tax_rates: [getStripeTaxRateId()],',
    vers: '' },

  { nom: '🔴 la voie du KYB ne taxe plus : ce sont les cinq premiers commercants',
    fichier: BILLING,
    de: '    default_tax_rates: [tvaBelge],',
    vers: '' },

  // ⚠️ DEUX POSES DANS LA MEME VOIE FONT UN COMPTE JUSTE ET LAISSENT L AUTRE
  // NUE : c est exactement ce qu un compteur seul ne verrait pas.
  { nom: '🔴 le compte est bon mais une voie est nue : deux poses du meme cote',
    fichier: BILLING,
    de: '    default_tax_rates: [tvaBelge],',
    vers: '    metadata_tva_posee: true,' },

  // ─── L ECRAN ────────────────────────────────────────────────────────────
  { nom: '🔴 LA PROMESSE D ORIGINE REVIENT : une TVA « selon votre pays » que rien ne calcule',
    fichier: PAGE,
    de: 'Les prix sont HTVA : la TVA belge de {TVA_ABONNEMENT_POURCENT} % s&rsquo;ajoute au moment du paiement.',
    vers: 'Tous les prix sont HTVA. La TVA applicable sera ajoutée au moment du paiement selon votre pays et votre statut TVA.' },

  // ⚠️ LE TAUX RECOPIE. La garde doit resister au fait que le nom de la
  // constante reste dans l import : c est le piege du mot trouve ailleurs.
  { nom: '🔴 le taux est recopie en dur dans la page, et il cessera de suivre la facture',
    fichier: PAGE,
    de: 'la TVA belge de {TVA_ABONNEMENT_POURCENT} % s&rsquo;ajoute',
    vers: 'la TVA belge de 21 % s&rsquo;ajoute' },

  { nom: '⚠️ le montant reellement debite disparait de la carte',
    fichier: PAGE,
    de: '          soit {euros(ttc)} TVA comprise',
    vers: '          soit {euros(ttc)} hors taxes' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
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
  const f = chemin(m.fichier || MODULE)
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
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
