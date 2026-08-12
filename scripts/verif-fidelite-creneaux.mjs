// Banc de la FIDÉLITÉ et de la CAPACITÉ DES CRÉNEAUX.
//
// Deux compteurs qu'un client surveille de près : sa carte de fidélité, où une
// récompense oubliée se remarque tout de suite, et la disponibilité des
// créneaux, où une capacité mal calculée fait soit refuser des clients qu'on
// pouvait servir, soit en accepter plus qu'on ne peut préparer.

import { normaliserTelephone, afficherTelephone, appliquerCredit, libelleRecompense, presetFidelite } from '../lib/fidelite.js'
import { calculerCapaciteCreneau, creneauCommandable, jourSemaineDe, remplissageCreneaux, STATUTS_OCCUPENT_CRENEAU } from '../lib/creneaux.js'
import { brusselsInstant, jourLocalISO, jourSemaineLocal } from '../lib/timezone.js'
import { estFoodTruck } from '../lib/types-commerce.js'
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
// UN CRÉNEAU EST-IL ENCORE COMMANDABLE ? (09/08)
// ═══════════════════════════════════════════════════════════════════════════
// Deux contrôles qui n'existaient nulle part.

// ⚠️ LE JOUR. Un créneau porte « mardi 18h-19h ». Rien ne vérifiait que la date
// commandée était bien un mardi : un onglet resté ouvert depuis la veille
// réservait un créneau du mardi pour une livraison du jeudi.
// Le 11/08/2026 est un MARDI — vérifié contre le calendrier, pas de tête.
egal('le 11/08/2026 est un mardi', jourSemaineDe('2026-08-11'), 'mardi')
egal('le 13/08/2026 est un jeudi', jourSemaineDe('2026-08-13'), 'jeudi')
egal('une date invalide ne rend aucun jour', jourSemaineDe('pas une date'), null)

const creneauMardi = { jour_semaine: 'mardi', heure_debut: '18:00', cutoff_heures: 2 }
verifier('un créneau du mardi accepte un mardi',
  creneauCommandable(creneauMardi, {
    dateStr: '2026-08-11', maintenant: new Date('2026-08-11T08:00:00Z'), instantDebut: brusselsInstant,
  }).ok)
egal('un créneau du mardi refuse un jeudi',
  creneauCommandable(creneauMardi, {
    dateStr: '2026-08-13', maintenant: new Date('2026-08-11T08:00:00Z'), instantDebut: brusselsInstant,
  }).raison, 'jour')
// Un créneau sans jour déclaré ne bloque rien : tous les commerçants n'en
// mettent pas, et un contrôle trop zélé refuserait des commandes légitimes.
verifier('un créneau sans jour ne bloque pas',
  creneauCommandable({ heure_debut: '18:00' }, { dateStr: '2026-08-13' }).ok)

// ⚠️ LE DÉLAI LIMITE. `cutoff_heures` est réglé par le commerçant et n'était
// lu NULLE PART : le réglage était parfaitement inerte, on pouvait commander
// une livraison pour un créneau démarrant dans dix minutes.
//
// Le créneau démarre à 18h00 heure belge, soit 16h00 UTC en août (heure d'été).
// Avec 2 h de délai, la limite tombe à 14h00 UTC.
verifier('trois heures avant : on peut encore commander',
  creneauCommandable(creneauMardi, {
    dateStr: '2026-08-11', maintenant: new Date('2026-08-11T13:00:00Z'), instantDebut: brusselsInstant,
  }).ok)
egal('une heure avant : trop tard',
  creneauCommandable(creneauMardi, {
    dateStr: '2026-08-11', maintenant: new Date('2026-08-11T15:00:00Z'), instantDebut: brusselsInstant,
  }).raison, 'cutoff')
// Pile sur la limite : on laisse passer. Refuser à la seconde près donnerait
// un « trop tard » incompréhensible à qui voit encore le créneau affiché.
verifier('pile à la limite, ça passe',
  creneauCommandable(creneauMardi, {
    dateStr: '2026-08-11', maintenant: new Date('2026-08-11T14:00:00Z'), instantDebut: brusselsInstant,
  }).ok)
// ⚠️ HIVER : 18h belge = 17h UTC, la limite tombe à 15h UTC et non 14h. Sans
// `brusselsInstant`, le délai serait faux d'une heure la moitié de l'année.
verifier('en hiver, le délai suit l\'heure belge',
  creneauCommandable({ ...creneauMardi, jour_semaine: null }, {
    dateStr: '2026-01-13', maintenant: new Date('2026-01-13T14:30:00Z'), instantDebut: brusselsInstant,
  }).ok)
egal('en hiver aussi, trop tard reste trop tard',
  creneauCommandable({ ...creneauMardi, jour_semaine: null }, {
    dateStr: '2026-01-13', maintenant: new Date('2026-01-13T16:00:00Z'), instantDebut: brusselsInstant,
  }).raison, 'cutoff')
// ⚠️ UN CRÉNEAU DÉJÀ COMMENCÉ N'EST PLUS COMMANDABLE, avec ou sans délai.
// Ce filtre n'existait QUE dans le navigateur : la fiche masquait les créneaux
// passés du jour, et le serveur les acceptait sans broncher. Un onglet ouvert
// depuis le matin faisait tomber à 15h une commande pour le créneau de 11h15,
// que le commerçant découvrait déjà en retard.
//
// Les créneaux C&C n'ont pas de colonne `cutoff_heures` : c'est donc le début
// du créneau lui-même qui fait limite. 18h belge = 16h UTC en août.
const creneauSansDelai = { jour_semaine: 'mardi', heure_debut: '18:00' }
verifier('sans délai réglé, on peut commander avant le début',
  creneauCommandable(creneauSansDelai, {
    dateStr: '2026-08-11', maintenant: new Date('2026-08-11T15:59:00Z'), instantDebut: brusselsInstant,
  }).ok)
egal('une minute APRÈS le début, c\'est refusé',
  creneauCommandable(creneauSansDelai, {
    dateStr: '2026-08-11', maintenant: new Date('2026-08-11T16:01:00Z'), instantDebut: brusselsInstant,
  }).raison, 'passe')
egal('un créneau du matin ne se commande plus l\'après-midi',
  creneauCommandable({ jour_semaine: 'mardi', heure_debut: '11:15' }, {
    dateStr: '2026-08-11', maintenant: new Date('2026-08-11T13:00:00Z'), instantDebut: brusselsInstant,
  }).raison, 'passe')
// Le motif distingue les deux cas : « passé » et « trop tard » n'appellent pas
// le même message, et le client doit comprendre lequel le concerne.
egal('avec un délai, le motif reste « cutoff »',
  creneauCommandable(creneauMardi, {
    dateStr: '2026-08-11', maintenant: new Date('2026-08-11T15:00:00Z'), instantDebut: brusselsInstant,
  }).raison, 'cutoff')
// Un créneau d'un jour FUTUR reste évidemment commandable.
verifier('un créneau de la semaine prochaine passe',
  creneauCommandable(creneauSansDelai, {
    dateStr: '2026-08-18', maintenant: new Date('2026-08-11T20:00:00Z'), instantDebut: brusselsInstant,
  }).ok)
verifier('la route sait dire « déjà passé »',
  /Ce créneau est déjà passé/.test(lireBrut('app/api/stripe/checkout/create-commande/route.js')))

// La route doit appeler ce contrôle.
const routeCreneau = lireBrut('app/api/stripe/checkout/create-commande/route.js')
verifier('la route vérifie que le créneau est commandable', /creneauCommandable\(/.test(routeCreneau))
verifier('elle passe l\'heure belge au calcul', /instantDebut: brusselsInstant/.test(routeCreneau))

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
// LA CHARGE SE COMPTE PAR JOUR (10/08)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ L'ANCIENNE FONCTION AGRÉGEAIT TOUTES DATES CONFONDUES, et l'affichage se
// trompait dans LES DEUX SENS :
//   • pour AUJOURD'HUI, le total complet s'appliquait, donc une commande passée
//     pour jeudi remplissait le créneau de ce matin ;
//   • pour les jours SUIVANTS, le compteur était forcé à ZÉRO, donc un créneau
//     déjà complet jeudi s'affichait libre et le client ne l'apprenait qu'au
//     paiement.
// Un créneau « mardi 11h15 » revient chaque semaine : sans la date, impossible
// de savoir de quel mardi on parle.
const boutique = lireBrut('app/commander/[slug]/page.js')
verifier('le navigateur appelle la fonction par jour',
  /charge_creneaux_par_jour/.test(boutique))
verifier('il n\'appelle plus l\'ancienne fonction agrégée',
  !/rpc\('charge_preparation_par_creneau'/.test(boutique))
verifier('la charge est indexée par jour puis par créneau',
  /chargeParJour\[jour\]\[r\.creneau_id\]/.test(boutique))
verifier('les créneaux d\'un jour reçoivent la charge de CE jour',
  /const duJour = chargeParJour\[jourISO\]/.test(boutique))
// Le drapeau « avecCount », qui mettait tout à zéro pour les jours suivants,
// ne doit pas revenir : c'était le contournement du défaut, pas sa correction.
// On vise la SIGNATURE et les APPELS, pas le mot : le commentaire du fichier a
// le droit d'expliquer d'où l'on vient, c'est même son travail.
verifier('le contournement « avecCount » a disparu de la signature',
  !/creneauxPourDate\(date, avecCount/.test(boutique))
verifier('plus aucun appel ne force la charge à zéro',
  !/creneauxPourDate\([^)]*,\s*(true|false)\)/.test(boutique))
// La livraison souffrait du même défaut, côté vue publique.
verifier('la livraison compte aussi par jour',
  /chargeLivraisonParJour\[jour\]/.test(boutique))
verifier('la requête livraison ramène la date',
  /select\('creneau_livraison_id, date_commande'\)/.test(boutique))

// ⚠️ LE PIÈGE DU FUSEAU, et il aurait été invisible en journée. La Belgique est
// en avance sur UTC : minuit heure belge, c'est 22h ou 23h la VEILLE en temps
// universel. Avec `toISOString()`, la clé du jour aurait basculé sur la veille
// toute la soirée, et la charge serait allée se ranger sous la mauvaise date.
//
// ⚠️ ON EXÉCUTE LA FORMULE, on ne la lit plus. Elle vivait en double, ici et au
// tableau de bord ; elle est maintenant dans `lib/timezone.js`, et ce test
// l'appelle sur un instant de nuit belge, celui exactement où `toISOString()`
// bascule sur la veille.
{
  // 11 août 2026, 00h30 heure belge. En temps universel, c'est encore le 10 à
  // 22h30 : `toISOString()` rendrait « 2026-08-10 ».
  const nuitBelge = new Date('2026-08-10T22:30:00Z')
  const parUTC = nuitBelge.toISOString().slice(0, 10)
  // Le test n'a de sens que si la machine tourne bien à l'heure belge : sur un
  // serveur en UTC les deux valeurs coïncident et il ne prouverait rien.
  const decalage = -nuitBelge.getTimezoneOffset()
  if (decalage > 0) {
    egal('la clé du jour est celle qu\'on lit sur son horloge', jourLocalISO(nuitBelge), '2026-08-11')
    verifier('elle ne vaut pas ce que rendrait toISOString', jourLocalISO(nuitBelge) !== parUTC, parUTC)
    egal('et le jour de la semaine suit la même horloge', jourSemaineLocal(nuitBelge), 'mardi')
  } else {
    verifier('la formule reste cohérente hors fuseau belge', jourLocalISO(nuitBelge) === parUTC)
  }
}
egal('un midi ordinaire tombe juste', jourLocalISO(new Date('2026-08-11T12:00:00Z')), '2026-08-11')
egal('une date invalide ne rend pas « NaN-NaN-NaN »', jourLocalISO(new Date('n\'importe quoi')), '')
verifier('la formule ne vit plus en double dans la fiche',
  !/function jourLocalISO/.test(boutique))
// La même formule doit servir à l'affichage ET à l'envoi de la commande,
// sinon la charge affichée ne retrouverait jamais les commandes enregistrées.
// ⚠️ CE TEST VERROUILLAIT UNE LIGNE, PAS UNE RÈGLE. Il exigeait le littéral
// `const dateStr = jourLocalISO(d)` : dès que le calcul du jour a dû distinguer
// la boutique de l'alimentaire, il est passé au rouge alors que la règle, elle,
// était respectée. Ce qui compte est qu'AUCUNE date de jour ne se fabrique par
// conversion en temps universel — c'est ça, le défaut qu'on interdit.
verifier('la date envoyée au serveur utilise la même formule',
  /jourLocalISO\(/.test(boutique))
verifier('et aucune clé de jour ne passe par le temps universel',
  !/toISOString\(\)\.slice\(0, ?10\)/.test(boutique),
  (boutique.match(/.*toISOString\(\)\.slice\(0, ?10\).*/) || [])[0])

// ═══════════════════════════════════════════════════════════════════════════
// LE FOOD TRUCK — une seule façon de reconnaître un camion
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA QUESTION ÉTAIT POSÉE DE TROIS FAÇONS QUI NE RÉPONDAIENT PAS PAREIL. La
// fiche client, le tableau de bord et l'inscription exigeaient l'espace exact
// de « food truck » ; le guide photos acceptait aussi « foodtruck ». Or le
// métier n'est pas toujours pris dans la liste : le commerçant peut le saisir
// librement, et deux métiers cohabitent dans un même champ.
//
// Celui qui tapait « Foodtruck » recevait les conseils photo de son métier,
// mais restait privé de l'onglet Emplacements, et sa fiche affichait l'adresse
// de son DÉPÔT au lieu du marché où il se trouvait. Le client se déplaçait au
// mauvais endroit.
verifier('« Food truck », la valeur de la liste', estFoodTruck('Food truck'))
verifier('« Foodtruck » en un mot compte aussi', estFoodTruck('Foodtruck'))
verifier('« food-truck » avec un tiret également', estFoodTruck('food-truck'))
verifier('un double métier est reconnu', estFoodTruck('Snack & Food truck'))
verifier('une boulangerie n\'est pas un camion', !estFoodTruck('Boulangerie'))
verifier('un métier vide non plus', !estFoodTruck('') && !estFoodTruck(null) && !estFoodTruck(undefined))
// Et les quatre écrans doivent APPELER cette fonction, pas la réécrire.
for (const [chemin, ecran] of [
  ['app/commander/[slug]/page.js', 'la fiche client'],
  ['app/dashboard/ConfigDashboard.js', 'le tableau de bord'],
  ['app/signup/page.js', 'l\'inscription'],
  ['lib/guide-photos.js', 'le guide photos'],
]) {
  // ⚠️ ON RETIRE LES COMMENTAIRES D'ABORD. La première version de ce test
  // rougissait sur la fiche… à cause du commentaire qui EXPLIQUE le défaut
  // corrigé et cite donc l'ancienne ligne. Un test doit juger le code, pas ce
  // qu'on raconte à côté. (`.` ne franchit pas un `\r`, d'où le découpage.)
  const src = lireBrut(chemin).split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, '$1')).join('\n')
  verifier(`${ecran} n'a plus sa propre détection`,
    !/includes\('[Ff]ood [Tt]ruck'\)/.test(src) && !/\/food\.\?truck\/i\.test/.test(src), chemin)
  verifier(`${ecran} appelle la fonction partagée`, /estFoodTruck(Type)?\(/.test(src), chemin)
}

// ⚠️ ET L'EMPLACEMENT NE DOIT PLUS ÊTRE DÉTRUIT AVANT D'ÊTRE REMPLACÉ. Les trois
// enregistrements effaçaient l'ancienne ligne AVANT d'insérer la nouvelle : une
// insertion qui échoue au marché, réseau coupé, et le commerçant se retrouvait
// sans aucun emplacement pendant que sa fiche annonçait « bientôt ».
// ⚠️ CE TEST DÉCOUPAIT LE FICHIER ENTRE DEUX NOMS DE FONCTION, et il a rougi le
// 12/08 au renommage de `SectionEmplacementsFoodtruck` en `SectionLieux` : la
// section n'était plus réservée aux food trucks, une professeure de yoga ayant
// exactement le même besoin. Le test verrouillait donc un NOM, pas un défaut, et
// il aurait interdit la correction en restant rouge.
//
// Il juge maintenant le fichier entier sur ce qui compte : nulle part on ne
// détruit avant d'avoir réussi à écrire, et le chemin de sauvegarde est partagé.
const dashFT = lireBrut('app/dashboard/ConfigDashboard.js')
verifier('aucun emplacement n\'est supprimé avant d\'être réécrit',
  !/delete\(\)[\s\S]{0,120}?insert\(\{/.test(dashFT))
verifier('l\'enregistrement passe par une modification quand la ligne existe',
  /if \(existant\) \{[\s\S]{0,160}?\.update\(valeurs\)/.test(dashFT))
verifier('les trois formulaires partagent ce chemin',
  (dashFT.match(/enregistrerEmplacement\(/g) || []).length >= 4)

const migJour = lireBrut('migrations/MIGRATION_CHARGE_CRENEAU_PAR_JOUR.sql')
verifier('la fonction groupe par créneau ET par jour',
  /GROUP BY c\.creneau_id, c\.date_commande::date/.test(migJour))
verifier('elle exclut les annulées et les terminées',
  /statut IN \('paiement_en_attente', 'en_attente', 'en_preparation', 'pret'\)/.test(migJour))
// ⚠️ L'ancienne fonction est CONSERVÉE le temps du déploiement : passer la
// migration avant ou après le déploiement ne casse rien dans les deux cas.
verifier('l\'ancienne fonction n\'est pas supprimée', !/DROP FUNCTION/.test(migJour))
verifier('les droits sont posés explicitement',
  /GRANT EXECUTE ON FUNCTION charge_creneaux_par_jour/.test(migJour))
verifier('sa vérification interroge la base', /FROM pg_proc/.test(migJour))

// ═══════════════════════════════════════════════════════════════════════════
// LE REMPLISSAGE VU DU COMMERÇANT
// ═══════════════════════════════════════════════════════════════════════════
// Le commerçant règle « max 5 commandes » ou « 30 minutes » et son client lit
// « presque plein » sur la fiche. Lui ne voyait RIEN : le tableau de bord
// n'affichait ce remplissage nulle part, il fallait compter à la main.
//
// Ces tests EXÉCUTENT la fonction et lisent ce qui en sort. Le danger n'est pas
// qu'elle rende un chiffre, c'est qu'elle rende un chiffre DIFFÉRENT de celui
// que voit le client : le commerçant jurerait avoir de la place là où sa fiche
// affiche « complet ».

const JOUR = '2026-08-11'
const NOM_JOUR = jourSemaineDe(JOUR)
const AUTRE_JOUR = '2026-08-12'
verifier('les deux dates de test tombent bien sur deux jours différents',
  NOM_JOUR && jourSemaineDe(AUTRE_JOUR) && NOM_JOUR !== jourSemaineDe(AUTRE_JOUR))

const CRENEAUX = [
  { id: 'c11', jour_semaine: NOM_JOUR, heure_debut: '11:00', heure_fin: '11:15', max_commandes: 5, capacite_temps: 30, actif: true },
  { id: 'c09', jour_semaine: NOM_JOUR, heure_debut: '09:00', heure_fin: '09:15', max_commandes: 5, capacite_temps: 30, actif: true },
  { id: 'cAutre', jour_semaine: jourSemaineDe(AUTRE_JOUR), heure_debut: '10:00', heure_fin: '10:15', max_commandes: 5, actif: true },
  { id: 'cOff', jour_semaine: NOM_JOUR, heure_debut: '08:00', heure_fin: '08:15', max_commandes: 5, actif: false },
]
const cmd = (statut, creneau_id, date_commande, articles = []) =>
  ({ statut, creneau_id, date_commande, commande_articles: articles })
const ligne = (quantite, temps_prepa) => ({ quantite, article: { temps_prepa } })

const parId = (liste) => Object.fromEntries(liste.map(r => [r.creneau.id, r]))

// ─── Mode « commandes » ────────────────────────────────────────────────────
const vue = parId(remplissageCreneaux({
  creneaux: CRENEAUX,
  jour: JOUR,
  modeCapaciteDefaut: 'commandes',
  commandes: [
    cmd('en_attente',          'c11', JOUR),
    cmd('en_preparation',      'c11', JOUR),
    cmd('paiement_en_attente', 'c11', JOUR),   // sa place est réservée le temps du paiement
    cmd('annulee_client_refund', 'c11', JOUR), // ⚠️ ne doit RIEN occuper
    cmd('recupere',            'c11', JOUR),   // terminée, elle libère la place
    cmd('en_attente',          'c11', AUTRE_JOUR), // ⚠️ un autre jour, un autre créneau
  ],
}))
egal('trois commandes actives remplissent le créneau', vue.c11?.utiliseEff, 3)
egal('la capacité affichée est celle du créneau', vue.c11?.capacite, 5)
verifier('le créneau n\'est pas annoncé complet', vue.c11?.complet === false)
egal('un créneau sans commande reste à zéro', vue.c09?.utiliseEff, 0)
verifier('un créneau vide est bien signalé libre', vue.c09?.complet === false && vue.c09?.bientot === false)
verifier('le créneau d\'un autre jour de la semaine n\'est pas listé', vue.cAutre === undefined)
verifier('un créneau désactivé n\'est pas listé', vue.cOff === undefined)

// La ligne du haut ne doit pas être une liste dans le désordre : le commerçant
// lit sa journée de gauche à droite.
const ordre = remplissageCreneaux({ creneaux: CRENEAUX, jour: JOUR, modeCapaciteDefaut: 'commandes', commandes: [] })
egal('les créneaux sortent triés par heure', ordre.map(r => r.creneau.id), ['c09', 'c11'])

// Le seuil « complet » doit tomber au même endroit que sur la fiche client.
const plein = parId(remplissageCreneaux({
  creneaux: CRENEAUX, jour: JOUR, modeCapaciteDefaut: 'commandes',
  commandes: Array.from({ length: 5 }, () => cmd('en_attente', 'c11', JOUR)),
}))
verifier('cinq commandes sur cinq : le créneau est complet', plein.c11?.complet === true)

// ─── Mode « temps », celui des boulangeries ────────────────────────────────
const enTemps = parId(remplissageCreneaux({
  creneaux: CRENEAUX, jour: JOUR, modeCapaciteDefaut: 'temps',
  commandes: [
    cmd('en_attente', 'c11', JOUR, [ligne(2, 5), ligne(1, 3)]),   // 13 minutes
    cmd('en_preparation', 'c11', JOUR, [ligne(3, 2)]),            // 6 minutes
  ],
}))
egal('le temps de préparation est cumulé, quantités comprises', enTemps.c11?.utiliseEff, 19)
egal('la capacité lue est celle en minutes', enTemps.c11?.capacite, 30)

// ⚠️ LE PIÈGE QUI FERAIT DIVERGER LES DEUX ÉCRANS. La fonction SQL écrit
// COALESCE(temps_prepa, 1) : un article sans temps réglé pèse UNE minute. Si le
// tableau de bord comptait zéro, le commerçant verrait un créneau vide pendant
// que son client le lit comme presque plein.
const sansTemps = parId(remplissageCreneaux({
  creneaux: CRENEAUX, jour: JOUR, modeCapaciteDefaut: 'temps',
  commandes: [cmd('en_attente', 'c11', JOUR, [ligne(4, null), ligne(2, undefined)])],
}))
egal('un article sans temps de préparation vaut une minute, jamais zéro', sansTemps.c11?.utiliseEff, 6)
// Les deux formes d'absence doivent donner le MÊME chiffre : `Number(null)`
// vaut 0 et passe pour un nombre valide, `Number(undefined)` vaut NaN.
const absenceNull = remplissageCreneaux({ creneaux: CRENEAUX, jour: JOUR, modeCapaciteDefaut: 'temps', commandes: [cmd('en_attente', 'c11', JOUR, [ligne(3, null)])] })
const absenceUndef = remplissageCreneaux({ creneaux: CRENEAUX, jour: JOUR, modeCapaciteDefaut: 'temps', commandes: [cmd('en_attente', 'c11', JOUR, [ligne(3, undefined)])] })
egal('colonne vide ou champ absent comptent pareil',
  parId(absenceNull).c11?.utiliseEff, parId(absenceUndef).c11?.utiliseEff)
// Mais un zéro écrit exprès reste zéro, comme le COALESCE qui ne remplace que
// le NULL : sinon un article servi d'avance se mettrait à peser une minute.
const zeroVoulu = parId(remplissageCreneaux({
  creneaux: CRENEAUX, jour: JOUR, modeCapaciteDefaut: 'temps',
  commandes: [cmd('en_attente', 'c11', JOUR, [ligne(5, 0)])],
}))
egal('un temps réglé à zéro reste zéro', zeroVoulu.c11?.utiliseEff, 0)

// Même règle que la jointure LEFT de la fonction SQL : une commande sans ligne
// compte tout de même pour une commande, sinon la capacité paraîtrait libre.
const sansLigne = parId(remplissageCreneaux({
  creneaux: CRENEAUX, jour: JOUR, modeCapaciteDefaut: 'commandes',
  commandes: [cmd('en_attente', 'c11', JOUR, [])],
}))
egal('une commande sans ligne occupe quand même une place', sansLigne.c11?.utiliseEff, 1)

// Le débordement du mode temps : une prépa trop longue à 9h empiète sur 11h, et
// le commerçant doit le voir venir plutôt que le découvrir dans son fournil.
const deborde = parId(remplissageCreneaux({
  creneaux: CRENEAUX, jour: JOUR, modeCapaciteDefaut: 'temps',
  commandes: [
    cmd('en_attente', 'c09', JOUR, [ligne(1, 40)]),  // 40 min pour 30 de capacité
    cmd('en_attente', 'c11', JOUR, [ligne(1, 5)]),
  ],
}))
egal('le surplus du créneau précédent déborde sur le suivant', deborde.c11?.utiliseEff, 15)

// ─── La séparation Click & Collect / Livraison ─────────────────────────────
// Une commande à emporter ne doit pas remplir une tournée, et inversement.
const TOURNEES = [{ id: 't18', jour_semaine: NOM_JOUR, heure_debut: '18:00', heure_fin: '19:00', max_commandes: 4, mode_capacite: 'commandes', actif: true }]
const melange = [
  { statut: 'en_attente', creneau_id: 'c11', creneau_livraison_id: null, date_commande: JOUR, commande_articles: [] },
  { statut: 'en_attente', creneau_id: null, creneau_livraison_id: 't18', date_commande: JOUR, commande_articles: [] },
  { statut: 'en_attente', creneau_id: null, creneau_livraison_id: 't18', date_commande: JOUR, commande_articles: [] },
]
const vueTournee = parId(remplissageCreneaux({
  creneaux: TOURNEES, jour: JOUR, modeCapaciteDefaut: 'commandes',
  commandes: melange, champCreneau: 'creneau_livraison_id',
}))
egal('la tournée ne compte que ses propres livraisons', vueTournee.t18?.utiliseEff, 2)
const vueRetrait = parId(remplissageCreneaux({
  creneaux: CRENEAUX, jour: JOUR, modeCapaciteDefaut: 'commandes', commandes: melange,
}))
egal('le créneau de retrait ne compte pas les livraisons', vueRetrait.c11?.utiliseEff, 1)

// ⚠️ LA SOURCE EXTÉRIEURE. Les statuts occupants sont écrits DEUX fois : ici en
// JavaScript et là-bas en SQL. S'ils divergent, le commerçant et le client
// comptent deux choses différentes sans qu'aucune erreur ne se déclenche.
const statutsSQL = (migJour.match(/statut IN \(([^)]+)\)/) || [])[1]
egal('les statuts occupants sont les mêmes en SQL et en JavaScript',
  statutsSQL ? statutsSQL.split(',').map(s => s.trim().replace(/'/g, '')) : null,
  STATUTS_OCCUPENT_CRENEAU)

// Et le tableau de bord doit APPELER cette fonction, pas seulement l'importer :
// un calcul juste que personne ne branche n'affiche rien du tout.
const dash = lireBrut('app/dashboard/page.js')
verifier('le tableau de bord appelle le calcul de remplissage',
  /const creneauxRemplis = [\s\S]{0,80}?remplissageCreneaux\(\{/.test(dash))
verifier('il l\'affiche vraiment', /creneauxRemplis\.map\(/.test(dash))
verifier('il bascule sur les créneaux de livraison dans la vue Livraison',
  /vueMode === 'livraison' \? creneauxLivraison : creneauxRetrait/.test(dash))
verifier('et il compte alors les commandes par leur créneau de livraison',
  /vueMode === 'livraison' \? 'creneau_livraison_id' : 'creneau_id'/.test(dash))
// La charge se lit sur TOUTES les commandes : `commandesDuJour` est déjà filtrée
// par statut et par vue, elle donnerait un créneau faussement vide.
//
// ⚠️ On isole l'APPEL et on regarde ce qu'on lui passe, plutôt que de dessiner
// la mise en forme du fichier. Une première version de ce test exigeait un
// retour à la ligne Unix : `git` a restauré le fichier en fins de ligne
// Windows et le test est tombé sans qu'une seule ligne de code ait changé.
const appelRemplissage = (dash.match(/remplissageCreneaux\(\{[\s\S]{0,320}?\}\)/) || [''])[0]
verifier('la charge se lit sur toutes les commandes',
  /(^|[\s{,])commandes\s*,/.test(appelRemplissage), appelRemplissage.slice(0, 60))
verifier('elle ne se lit surtout pas sur la liste déjà filtrée',
  appelRemplissage.length > 0 && !/commandesDuJour/.test(appelRemplissage))

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Fidélité et créneaux verts.')
