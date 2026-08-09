// Banc de la FIDÉLITÉ et de la CAPACITÉ DES CRÉNEAUX.
//
// Deux compteurs qu'un client surveille de près : sa carte de fidélité, où une
// récompense oubliée se remarque tout de suite, et la disponibilité des
// créneaux, où une capacité mal calculée fait soit refuser des clients qu'on
// pouvait servir, soit en accepter plus qu'on ne peut préparer.

import { normaliserTelephone, afficherTelephone, appliquerCredit, libelleRecompense, presetFidelite } from '../lib/fidelite.js'
import { calculerCapaciteCreneau, STATUTS_OCCUPENT_CRENEAU } from '../lib/creneaux.js'
import { readFileSync } from 'node:fs'

const lireBrut = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// ═══════════════════════════════════════════════════════════════════════════
// 1. TÉLÉPHONES BELGES — la clé d'identification au comptoir
// ═══════════════════════════════════════════════════════════════════════════
// Le numéro sert de clé de carte : deux écritures du même numéro qui ne se
// normalisent pas pareil, ce sont deux cartes pour un seul client.
egal('mobile national', normaliserTelephone('0470 12 34 56'), '+32470123456')
egal('avec points', normaliserTelephone('0470.12.34.56'), '+32470123456')
egal('avec tirets', normaliserTelephone('0470-12-34-56'), '+32470123456')
egal('déjà international', normaliserTelephone('+32470123456'), '+32470123456')
egal('préfixe 00', normaliserTelephone('0032470123456'), '+32470123456')
egal('sans préfixe', normaliserTelephone('470123456'), '+32470123456')
egal('fixe belge', normaliserTelephone('081 22 33 44'), '+3281223344')
// Toutes ces écritures doivent tomber sur LA MÊME carte.
const variantes = ['0470 12 34 56', '0470.12.34.56', '+32 470 12 34 56', '0032470123456', '0470123456']
verifier('toutes les écritures donnent la même clé',
  new Set(variantes.map(normaliserTelephone)).size === 1,
  JSON.stringify(variantes.map(normaliserTelephone)))

egal('numéro trop court refusé', normaliserTelephone('0470'), null)
egal('numéro trop long refusé', normaliserTelephone('04701234567890'), null)
egal('vide refusé', normaliserTelephone(''), null)
egal('lettres refusées', normaliserTelephone('bonjour'), null)

egal('affichage lisible', afficherTelephone('+32470123456'), '0470 12 34 56')
verifier('aller-retour stable', normaliserTelephone(afficherTelephone('+32470123456')) === '+32470123456')

// ═══════════════════════════════════════════════════════════════════════════
// 2. FIDÉLITÉ PAR PASSAGES — la carte à tamponner
// ═══════════════════════════════════════════════════════════════════════════
const cfgPassages = { fidelite_mecanique: 'passages', fidelite_seuil_passages: 10 }
let r = appliquerCredit(cfgPassages, { passages: 0, cagnotte: 0, recompenses_disponibles: 0 }, { passages: 1 })
egal('premier passage', r.patch.passages, 1)
egal('aucune récompense', r.debloquees, 0)

r = appliquerCredit(cfgPassages, { passages: 9, recompenses_disponibles: 0 }, { passages: 1 })
egal('carte pleine : compteur remis à zéro', r.patch.passages, 0)
egal('carte pleine : une récompense', r.debloquees, 1)
egal('récompense disponible', r.patch.recompenses_disponibles, 1)

// Crédit massif : plusieurs cartes d'un coup, le reste est conservé.
r = appliquerCredit(cfgPassages, { passages: 5, recompenses_disponibles: 0 }, { passages: 26 })
egal('trois cartes débloquées', r.debloquees, 3)
egal('le reste est reporté', r.patch.passages, 1)

// Les récompenses déjà acquises ne sont jamais écrasées.
r = appliquerCredit(cfgPassages, { passages: 9, recompenses_disponibles: 2 }, { passages: 1 })
egal('récompenses cumulées', r.patch.recompenses_disponibles, 3)

// Un seuil aberrant ne doit pas provoquer de boucle infinie ni de carte gratuite.
r = appliquerCredit({ fidelite_mecanique: 'passages', fidelite_seuil_passages: 0 }, { passages: 0 }, { passages: 3 })
verifier('seuil zéro ramené à un minimum sûr', r.debloquees <= 2, JSON.stringify(r))

// ═══════════════════════════════════════════════════════════════════════════
// 3. FIDÉLITÉ PAR CAGNOTTE — un pourcentage du montant dépensé
// ═══════════════════════════════════════════════════════════════════════════
const cfgCagnotte = { fidelite_mecanique: 'cagnotte', fidelite_taux_cagnotte: 5, fidelite_seuil_cagnotte: 10 }
r = appliquerCredit(cfgCagnotte, { cagnotte: 0, recompenses_disponibles: 0 }, { montant: 20 })
egal('5% de 20 € = 1 €', r.patch.cagnotte, 1)
egal('pas encore de récompense', r.debloquees, 0)

r = appliquerCredit(cfgCagnotte, { cagnotte: 9.5, recompenses_disponibles: 0 }, { montant: 20 })
egal('seuil franchi', r.debloquees, 1)
egal('reste conservé après la récompense', r.patch.cagnotte, 0.5)

// Les centimes ne doivent jamais dériver.
r = appliquerCredit(cfgCagnotte, { cagnotte: 0, recompenses_disponibles: 0 }, { montant: 21.9 })
egal('arrondi au cent', r.patch.cagnotte, 1.1)
let cumul = { cagnotte: 0, recompenses_disponibles: 0 }
for (let i = 0; i < 10; i++) cumul = appliquerCredit(cfgCagnotte, cumul, { montant: 3.33 }).patch
verifier('pas de dérive sur dix crédits', Math.abs(cumul.cagnotte - 1.7) < 0.02, String(cumul.cagnotte))

// Un montant nul ne crédite rien.
r = appliquerCredit(cfgCagnotte, { cagnotte: 2 }, { montant: 0 })
egal('montant nul = pas de gain', r.patch.cagnotte, 2)

// ─── Le cas exact d'Alex (09/08) : bon cadeau de 75 € à 1 % ───────────────
// Il attendait 0,75 € et a vu davantage. Le calcul lui-même est juste : si
// l'écart persiste, il vient d'ailleurs (taux réel en base, ou cumul avec les
// crédits précédents), pas de cette formule.
const cfg1pct = { fidelite_mecanique: 'cagnotte', fidelite_taux_cagnotte: 1, fidelite_seuil_cagnotte: 10 }
r = appliquerCredit(cfg1pct, { cagnotte: 0, recompenses_disponibles: 0 }, { montant: 75 })
egal('1 % de 75 € = 0,75 €', r.patch.cagnotte, 0.75)
egal('aucune récompense à 0,75 €', r.debloquees, 0)
// Le cumul avec un solde antérieur ne doit pas surprendre : c'est une addition.
r = appliquerCredit(cfg1pct, { cagnotte: 0.55, recompenses_disponibles: 0 }, { montant: 75 })
egal('0,55 € + 1 % de 75 € = 1,30 €', r.patch.cagnotte, 1.30)

// Le taux par défaut est 5 % : un commerçant qui n'a jamais réglé le sien
// crédite donc cinq fois plus. C'est la première chose à vérifier quand un
// montant paraît trop élevé.
r = appliquerCredit({ fidelite_mecanique: 'cagnotte', fidelite_seuil_cagnotte: 10 }, { cagnotte: 0 }, { montant: 75 })
egal('sans taux réglé, le défaut de 5 % s\'applique', r.patch.cagnotte, 3.75)
// Un taux à zéro est un vrai réglage, pas une absence : il ne doit PAS
// basculer sur 5 %.
r = appliquerCredit({ fidelite_mecanique: 'cagnotte', fidelite_taux_cagnotte: 0, fidelite_seuil_cagnotte: 10 }, { cagnotte: 0 }, { montant: 75 })
egal('taux à zéro = aucun gain', r.patch.cagnotte, 0)

// Quelques taux courants, pour que la formule reste juste hors des cas ronds.
egal('2 % de 75 €', appliquerCredit({ ...cfg1pct, fidelite_taux_cagnotte: 2 }, { cagnotte: 0 }, { montant: 75 }).patch.cagnotte, 1.5)
egal('1 % de 24,90 €', appliquerCredit(cfg1pct, { cagnotte: 0 }, { montant: 24.90 }).patch.cagnotte, 0.25)
egal('3 % de 19,99 €', appliquerCredit({ ...cfg1pct, fidelite_taux_cagnotte: 3 }, { cagnotte: 0 }, { montant: 19.99 }).patch.cagnotte, 0.6)

// Libellés de récompense
egal('libellé personnalisé prioritaire', libelleRecompense({ fidelite_recompense_libelle: 'Un café offert' }), 'Un café offert')
verifier('libellé déduit du pourcentage', libelleRecompense({ fidelite_recompense_type: 'remise_pct', fidelite_recompense_valeur: 50 }).includes('50'))
verifier('un libellé est toujours produit', typeof libelleRecompense({}) === 'string' && libelleRecompense({}).length > 0)
verifier('preset utilisable', typeof presetFidelite === 'function' && !!presetFidelite('alimentaire'))

// ═══════════════════════════════════════════════════════════════════════════
// 4. CAPACITÉ DES CRÉNEAUX — ni refuser à tort, ni promettre l'impossible
// ═══════════════════════════════════════════════════════════════════════════
// Mode COMMANDES : un plafond en nombre.
let c = calculerCapaciteCreneau({ max_commandes: 10, count: 3 })
egal('places restantes', c.places, 7)
verifier('pas complet', !c.complet)
verifier('ni presque ni bientôt', !c.presque && !c.bientot)

c = calculerCapaciteCreneau({ max_commandes: 10, count: 8 })
verifier('presque plein à 2 places', c.presque, JSON.stringify(c))
c = calculerCapaciteCreneau({ max_commandes: 10, count: 9 })
verifier('bientôt plein à 1 place', c.bientot, JSON.stringify(c))
c = calculerCapaciteCreneau({ max_commandes: 10, count: 10 })
verifier('complet à ras bord', c.complet)
c = calculerCapaciteCreneau({ max_commandes: 10, count: 12 })
verifier('complet en dépassement', c.complet)
verifier('places négatives assumées', c.places < 0, String(c.places))

// Mode TEMPS : un plafond en minutes de préparation.
c = calculerCapaciteCreneau({ mode_capacite: 'temps', capacite_temps: 60, temps_cumul: 30 })
verifier('mode temps reconnu', c.modeTemps)
egal('minutes restantes', c.places, 30)
verifier('pas complet à mi-charge', !c.complet)

c = calculerCapaciteCreneau({ mode_capacite: 'temps', capacite_temps: 60, temps_cumul: 60 })
verifier('complet quand le temps est saturé', c.complet)

// DÉBORDEMENT : une préparation trop longue empiète sur le créneau suivant.
c = calculerCapaciteCreneau(
  { mode_capacite: 'temps', capacite_temps: 60, temps_cumul: 20 },
  { creneauPrecedent: { capacite_temps: 60, temps_cumul: 80 } },
)
egal('le surplus du créneau précédent déborde', c.utiliseEff, 40)
egal('la charge propre reste distincte', c.utilise, 20)
verifier('le débordement réduit les places', c.places === 20, String(c.places))

// Un créneau précédent qui n'a PAS débordé ne change rien.
c = calculerCapaciteCreneau(
  { mode_capacite: 'temps', capacite_temps: 60, temps_cumul: 20 },
  { creneauPrecedent: { capacite_temps: 60, temps_cumul: 50 } },
)
egal('pas de débordement si le précédent tenait', c.utiliseEff, 20)

// Le mode du commerçant sert de repli quand le créneau n'en porte pas.
c = calculerCapaciteCreneau({ capacite_temps: 60, temps_cumul: 30 }, { modeCapaciteDefaut: 'temps' })
verifier('repli sur le réglage commerçant', c.modeTemps)

// Créneau vierge : on ne doit pas planter ni annoncer complet à tort.
c = calculerCapaciteCreneau({ max_commandes: 5 })
egal('sans consommation connue', c.utilise, 0)
verifier('créneau vide non complet', !c.complet)

// ═══════════════════════════════════════════════════════════════════════════
// LA CAPACITÉ EST-ELLE VRAIMENT TENUE ? (09/08)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ `calculerCapaciteCreneau` était juste, et ne servait qu'à GRISER les
// créneaux pleins dans le navigateur. Aucun contrôle côté serveur : deux
// clients qui payaient en même temps faisaient passer un créneau de cinq
// commandes à sept, et une requête fabriquée visait un créneau affiché complet.
// Le stock, lui, était protégé. Pas les créneaux.

// Quelles commandes occupent un créneau. Confronté à la SOURCE, la contrainte
// CHECK de la base, et pas à une liste écrite de mémoire.
const migrationStatuts = lireBrut('migrations/MIGRATION_COMMANDES_STATUT_CHECK.sql')
const blocCheck = migrationStatuts.slice(migrationStatuts.indexOf('CHECK (statut IN ('))
const statutsEnBase = [...blocCheck.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
for (const s of STATUTS_OCCUPENT_CRENEAU) {
  verifier(`« ${s} » existe vraiment en base`, statutsEnBase.includes(s))
}
// Une commande en cours de paiement garde sa place : elle est sur Stripe, le
// cron d'expiration la libère si le paiement n'aboutit pas.
verifier('une commande en cours de paiement occupe le créneau',
  STATUTS_OCCUPENT_CRENEAU.includes('paiement_en_attente'))
// ⚠️ CE QUI N'OCCUPE RIEN. La fonction en base charge_preparation_par_creneau
// n'exclut que `recupere` et `non_retire` : elle compte donc les paniers
// abandonnés et les commandes remboursées, qui saturent un créneau pour
// toujours. Le commerçant lit « complet » alors que personne n'a réservé.
for (const mort of ['annulee_client_refund', 'annulee_paiement_ko', 'recupere', 'non_retire']) {
  verifier(`« ${mort} » n'occupe plus le créneau`, !STATUTS_OCCUPENT_CRENEAU.includes(mort))
}

// ⚠️ LE PIÈGE QUI AURAIT TOUT CASSÉ, et qui se joue sur `null` contre
// `undefined`. La base renvoie `max_commandes: null` quand le commerçant n'a
// jamais rempli le champ. Or `1 >= null` vaut `1 >= 0`, donc VRAI : toutes ses
// commandes auraient été refusées. Avec `undefined`, la comparaison serait
// fausse et rien n'aurait bloqué. Deux absences, deux comportements opposés :
// c'est exactement pour ça que la route porte la garde `capaciteFixee`.
verifier('capacité NULL : le calcul déclare complet à tort',
  calculerCapaciteCreneau({ count: 1, max_commandes: null }).complet)
verifier('capacité absente : le calcul ne bloque rien',
  !calculerCapaciteCreneau({ count: 1 }).complet)
// Et quand la capacité EST fixée, il compte juste.
verifier('4 commandes sur 5 : il reste de la place',
  !calculerCapaciteCreneau({ count: 4, max_commandes: 5 }).complet)
verifier('5 commandes sur 5 : complet',
  calculerCapaciteCreneau({ count: 5, max_commandes: 5 }).complet)

// La route doit donc vérifier la capacité, ET ne le faire que si elle est fixée.
const route = lireBrut('app/api/stripe/checkout/create-commande/route.js')
const routeCode = route.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
verifier('la route contrôle la capacité côté serveur', /calculerCapaciteCreneau\(/.test(routeCode))
verifier('elle ne contrôle que si une capacité est fixée', /capaciteFixee/.test(routeCode))
verifier('elle compte la commande en cours de création', /count: occupantes\.length \+ 1/.test(routeCode))
verifier('elle se limite au même jour', /\.eq\('date_commande', date_commande\)/.test(routeCode))
verifier('elle exclut les annulées via la liste partagée', /STATUTS_OCCUPENT_CRENEAU/.test(routeCode))
verifier('elle traite aussi la livraison', /creneau_livraison_id.*creneau_id|colonneCreneau/.test(routeCode))
verifier('elle répond 409 et non 400', /creneau_complet: true[\s\S]{0,80}status: 409/.test(routeCode))

// ⚠️ LE FAUX VERT ÉVITÉ DE JUSTESSE : la requête des créneaux ne lisait PAS les
// colonnes de capacité. Le contrôle aurait calculé sur `undefined`, n'aurait
// jamais rien bloqué, et aurait eu l'air parfaitement correct.
for (const table of ['creneaux', 'livraison_creneaux']) {
  const req = new RegExp(`from\\('${table}'\\)[\\s\\S]{0,200}?\\.select\\('([^']*)'\\)`).exec(routeCode)
  verifier(`la requête ${table} est identifiable`, !!req)
  for (const col of ['max_commandes', 'capacite_temps', 'mode_capacite']) {
    verifier(`${table} lit bien ${col}`, !!req && req[1].includes(col), req?.[1])
  }
}
verifier('le repli commerçant est chargé', /mode_capacite/.test(
  /\.from\('commercants'\)[\s\S]{0,400}?\.select\('([^']*)'\)/.exec(routeCode)?.[1] || ''))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Fidélité et créneaux verts.')
