// Banc de L'OFFRE DE FIN DE JOURNÉE.
//
// 🔴 CE QU'IL GARDE : qu'une offre s'affiche pendant sa fenêtre, et JAMAIS en
// dehors. Un invendu ne vit que quelques heures ; se tromper d'une heure, c'est
// envoyer quelqu'un devant une porte fermée, ou cacher l'offre pendant qu'elle
// existe.
//
// ⚠️ LE PIÈGE DU FUSEAU EST LE CŒUR DE CE BANC. Les heures sont belges, le
// temps machine est universel : l'écart est d'UNE heure en hiver et de DEUX en
// été. Ce banc teste donc les deux saisons, à la minute près, et les bornes.
//
// ⚠️ TOUT S'EXÉCUTE. Aucune garde ne cherche un mot dans un fichier ici : on
// appelle la fonction avec un instant précis et on regarde ce qu'elle rend.

import {
  heureNormalisee, minutesLocales, minutesDeLHeure, porteUneFenetre, fenetreOuverte,
  minutesAvantFermeture, libelleHeure, libelleFenetre, libelleTempsRestant,
  offresOuvertes,
} from '../lib/anti-gaspi.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// Un instant donné en heure BELGE, converti en instant absolu. C'est ainsi
// qu'on écrit les cas : « le 15 juillet à 18 h 30 chez nous ».
// ⚠️ On passe par l'offset explicite pour ne PAS dépendre du fuseau de la
// machine qui fait tourner le banc.
const ETE = '+02:00'   // heure d'été belge
const HIVER = '+01:00' // heure d'hiver belge
const instant = (iso, offset) => new Date(`${iso}${offset}`)

// ═══════════════════════════════════════════════════════════════════════════
// 1. L'HEURE LOCALE, LES DEUX SAISONS
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 C'EST ICI QUE TOUT SE JOUE. Une machine en temps universel qui lit
// « 16:30 » là où le commerçant lit « 18:30 » ferme l'offre deux heures trop
// tôt, chaque jour d'été, sans qu'aucune erreur ne s'affiche.
egal('été : 18 h 30 chez nous se lit 18 h 30',
  minutesLocales(instant('2026-07-15T18:30:00', ETE)), 18 * 60 + 30)
egal('hiver : 18 h 30 chez nous se lit 18 h 30',
  minutesLocales(instant('2026-01-15T18:30:00', HIVER)), 18 * 60 + 30)
// Le même instant absolu, lu depuis deux saisons : c'est la preuve que le
// décalage est bien appliqué, et qu'il n'est pas le même toute l'année.
egal('🔴 en été, 16 h 30 UNIVERSEL fait 18 h 30 chez nous',
  minutesLocales(new Date('2026-07-15T16:30:00Z')), 18 * 60 + 30)
egal('🔴 en hiver, 16 h 30 UNIVERSEL fait 17 h 30 chez nous',
  minutesLocales(new Date('2026-01-15T16:30:00Z')), 17 * 60 + 30)
// ⚠️ MINUIT PEUT SE DIRE « 24 » selon la version d'ICU. Non gardé, il vaudrait
// 1440 et tomberait hors de toutes les fenêtres.
//
// 🔴 ET CETTE GARDE NE POUVAIT PAS ROUGIR, la mesure par mutation l'a dit : le
// Node de cette machine rend « 00 », donc passer par `minutesLocales` ne prouve
// rien. On teste la RÈGLE elle-même, sans dépendre de ce que l'environnement
// veut bien produire. C'est la deuxième fois en deux jours qu'une garde
// s'appuyait sur un cas qui ne se présente jamais.
egal('🔴 la règle : 24 h se ramène à zéro', heureNormalisee(24), 0)
egal('et une heure ordinaire ne bouge pas', heureNormalisee(18), 18)
egal('minuit vaut ZÉRO, jamais 1440',
  minutesLocales(instant('2026-07-15T00:00:00', ETE)), 0)
egal('23 h 59 vaut bien 1439',
  minutesLocales(instant('2026-07-15T23:59:00', ETE)), 23 * 60 + 59)
// ⚠️ 23 h chez nous, c'est DÉJÀ le lendemain à Greenwich. La date ne doit pas
// entrer en ligne de compte pour l'heure du jour.
egal('🔴 23 h chez nous reste 23 h, même si Greenwich a changé de jour',
  minutesLocales(instant('2026-07-15T23:00:00', ETE)), 23 * 60)
verifier('une date invalide ne rend pas zéro', minutesLocales(new Date('n\'importe quoi')) === null)

// ═══════════════════════════════════════════════════════════════════════════
// 2. LIRE UNE HEURE DE BASE
// ═══════════════════════════════════════════════════════════════════════════
egal('« 17:00:00 » vaut 1020', minutesDeLHeure('17:00:00'), 17 * 60)
egal('« 9:30 » vaut 570', minutesDeLHeure('9:30'), 9 * 60 + 30)
egal('minuit vaut zéro', minutesDeLHeure('00:00:00'), 0)
// ⚠️ UNE ABSENCE N'EST PAS ZÉRO, sixième fois dans ce projet. Rendre 0 sur
// `null` ouvrirait toutes les offres sans fenêtre à partir de minuit.
verifier('🔴 une heure absente rend null, pas zéro', minutesDeLHeure(null) === null)
verifier('une chaîne vide aussi', minutesDeLHeure('') === null)
verifier('« 25:00 » n’est pas une heure', minutesDeLHeure('25:00') === null)
verifier('« 17:70 » non plus', minutesDeLHeure('17:70') === null)

// ═══════════════════════════════════════════════════════════════════════════
// 3. CE QUI FAIT UNE OFFRE DE FIN DE JOURNÉE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ IL N'Y A PAS DE DRAPEAU. La présence des DEUX heures fait l'offre, et une
// demi-fenêtre ne compte pas : elle ne s'afficherait jamais sans le dire.
verifier('deux heures font une offre de fin de journée',
  porteUneFenetre({ heure_debut: '17:00:00', heure_fin: '19:00:00' }) === true)
verifier('🔴 une demi-fenêtre n’en est pas une',
  porteUneFenetre({ heure_debut: '17:00:00', heure_fin: null }) === false)
verifier('l’autre moitié non plus',
  porteUneFenetre({ heure_debut: null, heure_fin: '19:00:00' }) === false)
verifier('un deal ordinaire n’en est pas une', porteUneFenetre({}) === false)

// ═══════════════════════════════════════════════════════════════════════════
// 4. LA FENÊTRE EST-ELLE OUVERTE ?
// ═══════════════════════════════════════════════════════════════════════════
const SOIR = { heure_debut: '17:00:00', heure_fin: '19:00:00' }
const a = (h, m = 0, offset = ETE) =>
  instant(`2026-07-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`, offset)

verifier('à 16 h 59, c’est fermé', fenetreOuverte(SOIR, a(16, 59)) === false)
verifier('🔴 à 17 h 00 pile, ça ouvre', fenetreOuverte(SOIR, a(17, 0)) === true)
verifier('à 18 h 30, c’est ouvert', fenetreOuverte(SOIR, a(18, 30)) === true)
verifier('à 18 h 59, encore ouvert', fenetreOuverte(SOIR, a(18, 59)) === true)
// ⚠️ LA FIN EST EXCLUE. « Jusqu'à 19 h » veut dire qu'à 19 h c'est fini.
// L'afficher à l'heure pile enverrait quelqu'un devant une porte qui se ferme.
verifier('🔴 à 19 h 00 pile, c’est FINI', fenetreOuverte(SOIR, a(19, 0)) === false)
verifier('à 20 h, fini depuis longtemps', fenetreOuverte(SOIR, a(20, 0)) === false)
verifier('à 3 h du matin, fermé', fenetreOuverte(SOIR, a(3, 0)) === false)

// La même fenêtre, en hiver : le décalage change, le résultat ne doit pas.
const hiver = (h, m = 0) =>
  instant(`2026-01-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`, HIVER)
verifier('🔴 en hiver aussi, 18 h 30 est dans la fenêtre',
  fenetreOuverte(SOIR, hiver(18, 30)) === true)
verifier('🔴 et en hiver aussi, 19 h 00 est fini',
  fenetreOuverte(SOIR, hiver(19, 0)) === false)

// ⚠️ UNE FRITERIE OUVERTE DE 22 H À 1 H DU MATIN N'A RIEN D'EXOTIQUE. Sans ce
// cas, elle n'aurait jamais rien affiché.
const NUIT = { heure_debut: '22:00:00', heure_fin: '01:00:00' }
verifier('à 21 h 59, la friterie n’a pas commencé', fenetreOuverte(NUIT, a(21, 59)) === false)
verifier('🔴 à 23 h, elle est ouverte', fenetreOuverte(NUIT, a(23, 0)) === true)
verifier('🔴 à minuit, elle est ENCORE ouverte', fenetreOuverte(NUIT, a(0, 0)) === true)
verifier('à 00 h 59, toujours', fenetreOuverte(NUIT, a(0, 59)) === true)
verifier('à 1 h pile, c’est fini', fenetreOuverte(NUIT, a(1, 0)) === false)
verifier('à 12 h, évidemment fermé', fenetreOuverte(NUIT, a(12, 0)) === false)

// Une fenêtre de durée nulle afficherait l'offre une minute par jour, sans que
// personne comprenne pourquoi elle disparaît.
verifier('🔴 une fenêtre de durée nulle ne s’ouvre jamais',
  fenetreOuverte({ heure_debut: '18:00:00', heure_fin: '18:00:00' }, a(18, 0)) === false)
verifier('une offre sans fenêtre ne s’ouvre jamais', fenetreOuverte({}, a(18, 0)) === false)
verifier('ni une offre absente', fenetreOuverte(null, a(18, 0)) === false)

// ═══════════════════════════════════════════════════════════════════════════
// 5. COMBIEN DE TEMPS RESTE-T-IL ?
// ═══════════════════════════════════════════════════════════════════════════
egal('à 18 h 20, il reste 40 minutes', minutesAvantFermeture(SOIR, a(18, 20)), 40)
egal('à 17 h, il reste deux heures', minutesAvantFermeture(SOIR, a(17, 0)), 120)
egal('à 18 h 59, il reste une minute', minutesAvantFermeture(SOIR, a(18, 59)), 1)
// ⚠️ FERMÉ N'EST PAS ZÉRO : rendre 0 ferait écrire « encore 0 minute ».
verifier('🔴 fermé rend null, pas zéro', minutesAvantFermeture(SOIR, a(20, 0)) === null)
// La fenêtre de nuit compte à travers minuit.
egal('🔴 à 23 h 30, la friterie ferme dans 90 minutes',
  minutesAvantFermeture(NUIT, a(23, 30)), 90)
egal('à 00 h 30, il lui reste 30 minutes', minutesAvantFermeture(NUIT, a(0, 30)), 30)

// ═══════════════════════════════════════════════════════════════════════════
// 6. CE QUE L'ÉCRAN ÉCRIT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ TYPOGRAPHIE FRANÇAISE : une espace avant le « h », et pas de zéro inutile.
// « 19h00 » se lit comme une référence technique, pas comme une heure.
egal('19 h s’écrit avec une espace', libelleHeure('19:00:00'), '19 h')
egal('19 h 30 garde ses minutes', libelleHeure('19:30:00'), '19 h 30')
egal('9 h 05 garde son zéro de minutes', libelleHeure('09:05:00'), '9 h 05')
egal('minuit s’écrit 0 h', libelleHeure('00:00:00'), '0 h')
egal('une heure absente n’écrit rien', libelleHeure(null), '')

// ⚠️ ON DIT « JUSQU'À », PAS LA FENÊTRE ENTIÈRE. L'heure de début n'apprend
// rien à celui qui voit l'offre : s'il la voit, c'est qu'elle a commencé.
egal('le libellé dit la fin', libelleFenetre(SOIR), 'jusqu\'à 19 h')
egal('sans fenêtre, rien', libelleFenetre({}), '')

// ⚠️ ON ANNONCE L'ÉTAT, PAS UNE ALARME.
egal('40 minutes se disent', libelleTempsRestant(40), 'encore 40 minutes')
egal('une minute reste au singulier', libelleTempsRestant(1), 'encore 1 minute')
egal('90 minutes se disent en heures', libelleTempsRestant(90), 'encore 1 h 30')
egal('120 minutes tout rond', libelleTempsRestant(120), 'encore 2 h')
egal('zéro n’écrit rien', libelleTempsRestant(0), '')
egal('null n’écrit rien', libelleTempsRestant(null), '')

// ═══════════════════════════════════════════════════════════════════════════
// 7. L'ORDRE DE LECTURE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CE QUI SE RÉSERVE PASSE DEVANT. Une offre qu'on peut prendre tout de suite
// vaut mieux, pour celui qui lit, qu'une offre où il faut tenter sa chance. S'il
// se déplace deux fois pour rien, il n'ouvre plus cet écran, et il ne l'ouvre
// plus pour personne.
{
  const OFFRES = [
    { id: 'tard', heure_debut: '17:00:00', heure_fin: '20:00:00' },   // ferme tard, non réservable
    { id: 'tot',  heure_debut: '17:00:00', heure_fin: '18:45:00' },   // ferme tôt, non réservable
    { id: 'resa', heure_debut: '17:00:00', heure_fin: '20:00:00' },   // ferme tard, RÉSERVABLE
    { id: 'close', heure_debut: '08:00:00', heure_fin: '09:00:00' },  // pas dans sa fenêtre
  ]
  const rendu = offresOuvertes(OFFRES, a(18, 30), { reservable: o => o.id === 'resa' })
  egal('🔴 le réservable passe devant, puis le plus pressé',
    rendu.map(r => r.offre.id), ['resa', 'tot', 'tard'])
  verifier('l’offre hors fenêtre est écartée', !rendu.some(r => r.offre.id === 'close'))
  egal('le temps restant accompagne chaque offre',
    rendu.map(r => r.restant), [90, 15, 90])
  // Sans indication de réservabilité, on ne PRÉTEND pas qu'elles le sont.
  const nu = offresOuvertes(OFFRES, a(18, 30))
  verifier('🔴 sans règle de réservation, rien n’est réservable',
    nu.every(r => r.reservable === false))
  egal('et l’ordre retombe sur le plus pressé',
    nu.map(r => r.offre.id), ['tot', 'tard', 'resa'])
  egal('une liste absente rend une liste vide', offresOuvertes(undefined, a(18, 30)), [])
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Offre de fin de journée verte.')
