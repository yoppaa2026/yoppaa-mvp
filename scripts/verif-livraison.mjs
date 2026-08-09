// Banc de la LIVRAISON.
//
// C'était le module le plus complexe de Yoppaa et le MOINS vérifié : le banc
// n'en couvrait que la TVA des frais et les libellés. Ni la zone desservie, ni
// le calcul des frais, ni le suivi, ni le minimum de commande.
//
// Ce sont pourtant des décisions qui touchent directement à l'argent du
// commerçant : une zone trop large et il roule à perte, des frais mal calculés
// et il les paie de sa poche, un seuil de gratuité mal lu et il travaille
// gratuitement.

import { readFileSync } from 'node:fs'
import {
  normaliserCodePostal, zoneCouverte, fraisLivraison, minimumAtteint,
  STATUTS_LIVRAISON, prochainStatutLivraison, transitionLivraisonValide,
  libelleSuiviLivraison,
} from '../lib/livraison.js'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA ZONE DESSERVIE
// ═══════════════════════════════════════════════════════════════════════════
const zone = ['5640', '5060', '5070']
verifier('un code de la zone est accepté', zoneCouverte(zone, '5640'))
verifier('un code hors zone est refusé', !zoneCouverte(zone, '1000'))
verifier('zone vide : personne n\'est livré', !zoneCouverte([], '5640'))
verifier('code postal absent : refusé', !zoneCouverte(zone, ''))
verifier('appel sans argument', !zoneCouverte())

// ⚠️ LE PIÈGE DES ESPACES. Un code saisi « 5640 » au tableau de bord et
// « 5640 » avec une espace insécable dans le formulaire client, ce sont deux
// chaînes différentes pour JavaScript. La livraison serait refusée sans que
// personne ne comprenne pourquoi.
verifier('une espace avant ou après ne change rien', zoneCouverte(zone, ' 5640 '))
verifier('une espace insécable non plus', zoneCouverte(zone, '5640 '))
verifier('la normalisation vaut des deux côtés', zoneCouverte([' 5640 '], '5640'))
egal('normalisation d\'un code', normaliserCodePostal(' 56 40 '), '5640')
// Un code numérique venu de la base ne doit pas casser la comparaison.
verifier('un code stocké en nombre est reconnu', zoneCouverte([5640], '5640'))

// ═══════════════════════════════════════════════════════════════════════════
// 2. LES FRAIS DE LIVRAISON
// ═══════════════════════════════════════════════════════════════════════════
const cfg = { frais_fixe: 3.5, gratuit_des: 25 }
egal('frais appliqués sous le seuil', fraisLivraison({ total: 20, ...cfg }).montant, 3.5)
egal('offerts au seuil exact', fraisLivraison({ total: 25, ...cfg }).montant, 0)
egal('offerts au-dessus', fraisLivraison({ total: 40, ...cfg }).offert, true)
egal('ce qui manque pour la gratuité', fraisLivraison({ total: 20.8, ...cfg }).manquePourGratuit, 4.2)
egal('plus rien à annoncer une fois offert', fraisLivraison({ total: 30, ...cfg }).manquePourGratuit, null)

// ⚠️ `gratuit_des` à NULL veut dire « JAMAIS offert », pas « offert dès 0 € ».
// Confondre les deux ferait travailler le commerçant gratuitement sur toutes
// ses livraisons, sans qu'il s'en aperçoive avant de compter ses recettes.
egal('sans seuil, les frais restent dus', fraisLivraison({ total: 500, frais_fixe: 3.5, gratuit_des: null }).montant, 3.5)
egal('sans seuil, rien n\'est offert', fraisLivraison({ total: 500, frais_fixe: 3.5 }).offert, false)
egal('chaîne vide traitée comme absence', fraisLivraison({ total: 500, frais_fixe: 3.5, gratuit_des: '' }).offert, false)
// Un seuil à ZÉRO, lui, est un vrai réglage : tout est offert.
egal('seuil à zéro : toujours offert', fraisLivraison({ total: 0, frais_fixe: 3.5, gratuit_des: 0 }).offert, true)

egal('frais nuls', fraisLivraison({ total: 10, frais_fixe: 0 }).montant, 0)
egal('frais négatifs ramenés à zéro', fraisLivraison({ total: 10, frais_fixe: -5 }).montant, 0)
egal('appel sans argument', fraisLivraison().montant, 0)
// Les centimes ne doivent pas dériver : c'est ce qui part chez Stripe.
egal('centimes justes', fraisLivraison({ total: 10, frais_fixe: 2.999 }).montant, 3)

// ═══════════════════════════════════════════════════════════════════════════
// 3. LE MINIMUM DE COMMANDE (09/08)
// ═══════════════════════════════════════════════════════════════════════════
// Un commerçant qui prend sa voiture pour trois euros de marchandise y perd.
verifier('au-dessus du minimum, ça passe', minimumAtteint({ total: 20, minimum: 15 }).ok)
verifier('pile au minimum, ça passe', minimumAtteint({ total: 15, minimum: 15 }).ok)
verifier('en dessous, c\'est refusé', !minimumAtteint({ total: 12, minimum: 15 }).ok)
egal('ce qui manque est annoncé', minimumAtteint({ total: 12.5, minimum: 15 }).manque, 2.5)
egal('rien ne manque au-dessus', minimumAtteint({ total: 20, minimum: 15 }).manque, 0)

// Aucun minimum réglé : c'est le comportement d'avant, rien ne doit bloquer.
verifier('sans minimum, tout passe', minimumAtteint({ total: 1, minimum: null }).ok)
verifier('minimum à zéro = aucun minimum', minimumAtteint({ total: 1, minimum: 0 }).ok)
verifier('chaîne vide = aucun minimum', minimumAtteint({ total: 1, minimum: '' }).ok)
verifier('appel sans argument', minimumAtteint().ok)
egal('sans minimum, aucun seuil annoncé', minimumAtteint({ total: 1 }).seuil, null)

// ═══════════════════════════════════════════════════════════════════════════
// 4. LE SUIVI DE LA LIVRAISON
// ═══════════════════════════════════════════════════════════════════════════
egal('deux états seulement', STATUTS_LIVRAISON, ['en_livraison', 'livree'])
egal('au départ, la commande part en livraison', prochainStatutLivraison(null), 'en_livraison')
egal('ensuite elle est livrée', prochainStatutLivraison('en_livraison'), 'livree')
egal('après, plus rien', prochainStatutLivraison('livree'), null)

// ⚠️ ON NE REVIENT JAMAIS EN ARRIÈRE. Une commande livrée qui repasserait « en
// livraison » réapparaîtrait dans la tournée du jour, et le client recevrait
// une seconde notification « ta commande arrive ».
verifier('départ en livraison valide', transitionLivraisonValide(null, 'en_livraison'))
verifier('livraison puis livrée valide', transitionLivraisonValide('en_livraison', 'livree'))
verifier('on ne repart pas en livraison après livraison',
  !transitionLivraisonValide('livree', 'en_livraison'))
verifier('on ne saute pas l\'étape du départ',
  !transitionLivraisonValide(null, 'livree'))
verifier('un statut inventé est refusé', !transitionLivraisonValide(null, 'preparee'))

// Le vocabulaire compte : « prête » ne veut rien dire pour une livraison,
// personne ne vient la chercher.
egal('avant le départ', libelleSuiviLivraison(null), 'En préparation')
egal('en route', libelleSuiviLivraison('en_livraison'), 'En route vers toi')
egal('arrivée', libelleSuiviLivraison('livree'), 'Livrée')
verifier('aucun libellé ne parle de retrait',
  ![null, 'en_livraison', 'livree'].some(s => /retir|prête|comptoir/i.test(libelleSuiviLivraison(s))))

// ═══════════════════════════════════════════════════════════════════════════
// 5. LA ROUTE APPLIQUE BIEN CES RÈGLES
// ═══════════════════════════════════════════════════════════════════════════
// Un module pur et juste ne sert à rien si la route recalcule à sa façon :
// c'est exactement ce qui s'est passé pendant des semaines.
const route = lire('app/api/stripe/checkout/create-commande/route.js')
const routeCode = route.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
verifier('la route vérifie la zone avec le module', /zoneCouverte\(/.test(routeCode))
verifier('la route calcule les frais avec le module', /fraisLivraison\(\{/.test(routeCode))
verifier('la route applique le minimum', /minimumAtteint\(/.test(routeCode))
// ⚠️ Le minimum se mesure sur les ARTICLES : ni les frais, ni le bon cadeau.
verifier('le minimum porte sur le total des articles',
  /minimumAtteint\(\{ total: totalEUR/.test(routeCode))
// Et il doit être vérifié AVANT que le bon cadeau ne réduise le montant.
verifier('le minimum est vérifié avant le bon cadeau',
  routeCode.indexOf('minimumAtteint(') < routeCode.indexOf('chargerBonValide('))

// La route des statuts n'accepte que les deux états connus.
const routeStatut = lire('app/api/livraison/statut/route.js')
for (const s of STATUTS_LIVRAISON) {
  verifier(`la route de suivi connaît « ${s} »`, routeStatut.includes(s))
}
verifier('elle refuse un statut inconnu', /!\['en_livraison', 'livree'\]\.includes/.test(routeStatut))

// Le réglage du minimum existe côté commerçant, sinon la colonne ne sert à rien.
const dash = lire('app/dashboard/ConfigDashboard.js')
verifier('le commerçant peut régler son minimum', /minimum_commande: mini/.test(dash))
verifier('le champ est proposé dans l\'écran', /Minimum de commande/.test(dash))
verifier('l\'aperçu annonce le minimum au commerçant', /à partir de \$\{m\.toFixed\(2\)\}/.test(dash))

// La migration existe et vérifie l'état réel de la base.
const mig = lire('migrations/MIGRATION_LIVRAISON_MINIMUM.sql')
verifier('la migration ajoute la colonne', /ADD COLUMN IF NOT EXISTS minimum_commande/.test(mig))
verifier('sa vérification interroge la base', /information_schema\.columns/.test(mig))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Livraison verte.')
