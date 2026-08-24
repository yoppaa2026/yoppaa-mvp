// Banc de la phrase des frais Stripe (24/08).
//
// POURQUOI CE BANC EXISTE : cette phrase était ÉCRITE TROIS FOIS, dans les
// CGU, dans les arguments de l'inscription et dans l'email de la landing.
// Trois copies d'un tarif que Stripe change quand il veut, et rien pour
// signaler qu'elles avaient divergé. Le jour où l'une bougeait, c'est le
// document CONTRACTUEL qui finissait par avoir tort face à l'écran de vente.
//
// ⚠️ Il vérifie aussi une règle de MARQUE, pas seulement de technique :
// « Yoppaa ne prend aucune commission » ne se dit JAMAIS sans son sujet, et
// on n'écrit jamais que le commerçant garde 100 % de ses ventes.

import { readFileSync } from 'node:fs'
import { FRAIS_STRIPE_TEXTE } from '../lib/frais-paiement.js'

let ok = 0
const echecs = []
const v = (nom, cond) => { if (cond) ok++; else echecs.push(nom) }

// Commentaires retirés : une garde verte grâce au commentaire qui explique la
// règle est le piège le plus fréquent de ce dépôt.
function lireCode(chemin) {
  return readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
}

const SURFACES = [
  ['CGU', 'app/legal/page.js'],
  ['inscription', 'app/signup/page.js'],
  ['email de la landing', 'lib/resend-landing.js'],
]

// ─── La phrase elle-même ───────────────────────────────────────────────────

// ⚠️ BANCONTACT EN PREMIER, ET C'EST VOULU : c'est le moyen de paiement
// majoritaire des clients belges, et le MOINS CHER des trois. La phrase disait
// « à partir de 1,5 % », ce qui était à la fois moins vendeur et INEXACT.
v('la phrase nomme Bancontact', /Bancontact/.test(FRAIS_STRIPE_TEXTE))
v('Bancontact est cité avant la carte',
  FRAIS_STRIPE_TEXTE.indexOf('Bancontact') < FRAIS_STRIPE_TEXTE.indexOf('carte'))
v('le tarif Bancontact est 1,4 % + 0,25 €', /1,4 % \+ 0,25 €/.test(FRAIS_STRIPE_TEXTE))
v('le tarif carte européenne est 1,5 % + 0,25 €', /1,5 % \+ 0,25 €/.test(FRAIS_STRIPE_TEXTE))
v('la phrase prévient pour les cartes premium et étrangères',
  /premium/.test(FRAIS_STRIPE_TEXTE) && /étrangère/.test(FRAIS_STRIPE_TEXTE))
// ⚠️ « À PARTIR DE 1,5 % » EST MORT : Bancontact est en dessous, donc le
// plancher annoncé était faux.
v('la phrase n\'annonce plus un plancher à 1,5 %', !/à partir de 1,5/.test(FRAIS_STRIPE_TEXTE))
// Vocabulaire belge : jamais « CB », qui est un réseau français.
v('la phrase n\'emploie pas « CB »', !/\bCB\b/.test(FRAIS_STRIPE_TEXTE))

// ─── Les trois surfaces la LISENT, elles ne la recopient pas ───────────────

for (const [nom, chemin] of SURFACES) {
  const src = lireCode(chemin)
  v(`${nom} importe la phrase des frais`, /FRAIS_STRIPE_TEXTE/.test(src))
  // ⚠️ Et surtout : plus aucun taux tapé à la main dans le texte. C'est CETTE
  // garde qui empêche la divergence de revenir, pas l'import.
  v(`${nom} ne retape aucun taux de transaction`,
    !/à partir de 1,5\s*%/.test(src) && !/1,4\s*% \+ 0,25/.test(src))
}

// ─── La règle de marque, qui ne se négocie pas ─────────────────────────────

for (const [nom, chemin] of SURFACES) {
  const src = lireCode(chemin)
  // 🔴 « aucune commission » sans sujet laisse croire qu'AUCUN acteur ne se
  // sert, alors que Stripe prélève ses frais. Le sujet est obligatoire.
  const occurrences = [...src.matchAll(/[^.!?]*aucune commission[^.!?]*/g)].map(m => m[0])
  v(`${nom} : « aucune commission » porte toujours le sujet Yoppaa`,
    occurrences.every(p => /Yoppaa/.test(p)))
  // 🔴 On n'écrit JAMAIS que le commerçant garde 100 % de ses ventes : les
  // frais du prestataire existent, et la promesse serait fausse.
  v(`${nom} ne promet pas 100 % des ventes`,
    !/100\s*%[^.]{0,40}(te revient|revient|ventes)/i.test(src))
}

// ─────────────────────────────────────────────────────────────────────────

console.log('')
if (echecs.length) {
  console.log(`${ok} vérifications passées, ${echecs.length} en ÉCHEC :`)
  for (const e of echecs) console.log(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`${ok} vérifications passées, 0 en échec.`)
console.log('Frais de paiement verts.')
