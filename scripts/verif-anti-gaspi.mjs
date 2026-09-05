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
  prixCasse, remisePourcent, offreValable, REMISE_MINIMALE, REMISE_CONSEILLEE, CONSEIL_REMISE,
  TITRE_YOPPER, SOUS_TITRE_YOPPER, NOM_FONCTION_COMMERCANT, LIBELLE_BOUTON,
  creneauxUtilisables, creneauxDansLaFenetre, margeDeCloture, refusDePublication, offrePubliable, dansFenetre,
  offresOuvertes,
  fermetureDuJour, fenetreParDefaut, enHeure, prixConseille, lignePublication,
  MINUTES_UTILES_MINIMUM,
  plafondDeLOffre, resteSurOffre, refusDeQuantite, libelleReste,
  offresProches, RAYON_INVENDU_M, INVENDUS_AFFICHES, texteDePartage, lienVersOffre, PARAM_OFFRE,
} from '../lib/anti-gaspi.js'
import { readFileSync } from 'node:fs'
import { verifierQuantiteOffres, SELECT_DEALS } from '../lib/lignes-commande.js'
import { sansProse } from './lire-code.mjs'

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
// 6bis. LE PRIX EST-IL VRAIMENT CASSÉ ?
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 SANS CETTE RÈGLE, LE SOUS-TITRE MENT. « Les derniers du jour » laisse
// entendre une affaire, et rien n'empêchait de publier un invendu au prix plein.
verifier('3 € au lieu de 6 €, c’est cassé', prixCasse({ prix_deal: 3, prix_original: 6 }) === true)
verifier('🔴 6 € au lieu de 6 €, ce n’est pas une affaire',
  prixCasse({ prix_deal: 6, prix_original: 6 }) === false)
verifier('plus cher que le prix plein non plus',
  prixCasse({ prix_deal: 7, prix_original: 6 }) === false)
// ⚠️ ZÉRO N'EST PAS UN PRIX, sixième fois dans ce projet. Un prix plein absent
// vaudrait 0 après conversion, et l'offre passerait pour valable.
verifier('🔴 un prix plein ABSENT ne rend pas l’offre valable',
  prixCasse({ prix_deal: 3, prix_original: null }) === false)
verifier('un prix cassé absent non plus',
  prixCasse({ prix_deal: null, prix_original: 6 }) === false)
verifier('un prix à zéro non plus', prixCasse({ prix_deal: 0, prix_original: 6 }) === false)
verifier('une offre vide non plus', prixCasse({}) === false)

egal('la remise se dit en pourcentage', remisePourcent({ prix_deal: 3, prix_original: 6 }), 50)
egal('elle s’arrondit', remisePourcent({ prix_deal: 2, prix_original: 3 }), 33)
verifier('🔴 pas de remise sans prix cassé',
  remisePourcent({ prix_deal: 6, prix_original: 6 }) === null)

// ⚠️ LA FENÊTRE **ET** LE PRIX. L'écran du commerçant refusera d'enregistrer
// sans prix cassé, mais une garde d'écran n'est jamais une réponse : des lignes
// écrites avant cette règle peuvent exister.
verifier('une offre complète est valable',
  offreValable({ heure_debut: '17:00:00', heure_fin: '19:00:00', prix_deal: 3, prix_original: 6 }) === true)
verifier('🔴 la fenêtre seule ne suffit pas',
  offreValable({ heure_debut: '17:00:00', heure_fin: '19:00:00', prix_deal: 6, prix_original: 6 }) === false)
verifier('🔴 le prix cassé seul ne suffit pas',
  offreValable({ prix_deal: 3, prix_original: 6 }) === false)

// ⚠️ « LE COMMERÇANT QUI VEUT Y FIGURER DOIT JOUER LE JEU » (Alex, 04/09).
// Sans plancher, une remise de 10 % occuperait l'écran, et celui qui ouvre
// « Rien ne se perd » n'y trouverait pas d'affaire. Il n'ouvrirait plus, et il
// n'ouvrirait plus pour personne.
// ⚠️ 30 ET NON 50, ET C'EST UNE QUESTION DE MARGE : une boucherie ou une
// poissonnerie tournent autour de 25 à 35 % de marge brute, donc à moitié prix
// elles VENDENT À PERTE. Or ce sont elles qui ont le plus d'invendus
// périssables. Un plancher à 50 excluait ceux qui en ont le plus besoin.
egal('le plancher est à trente pour cent', REMISE_MINIMALE, 30)
verifier('🔴 une remise de 25 % ne suffit PAS',
  offreValable({ heure_debut: '17:00:00', heure_fin: '19:00:00', prix_deal: 75, prix_original: 100 }) === false)
verifier('🔴 exactement 30 %, ça passe',
  offreValable({ heure_debut: '17:00:00', heure_fin: '19:00:00', prix_deal: 70, prix_original: 100 }) === true)
verifier('40 % passe désormais',
  offreValable({ heure_debut: '17:00:00', heure_fin: '19:00:00', prix_deal: 6, prix_original: 10 }) === true)
verifier('70 %, évidemment',
  offreValable({ heure_debut: '17:00:00', heure_fin: '19:00:00', prix_deal: 3, prix_original: 10 }) === true)

// ⚠️ LE CONSEIL EST AU-DESSUS DU PLANCHER, sinon il ne conseille rien.
verifier('🔴 le conseil vise plus haut que l’obligation', REMISE_CONSEILLEE > REMISE_MINIMALE)
// ⚠️ ET IL SE CONSTRUIT À PARTIR DU CHIFFRE. Un « -30 % » écrit à la main
// survivrait au changement du plancher et mentirait au commerçant.
verifier('🔴 le conseil cite le plancher réel', CONSEIL_REMISE.includes(`-${REMISE_MINIMALE} %`))
// ⚠️ AUCUNE INJONCTION, ET AUCUNE STATISTIQUE INVENTÉE : aucune offre de fin de
// journée n'a jamais tourné, on dit le mécanisme, pas un chiffre mesuré.
for (const mot of ['!', 'dépêche', 'vite !', 'fois plus']) {
  verifier(`le conseil n’écrit pas « ${mot} »`, !CONSEIL_REMISE.toLowerCase().includes(mot), CONSEIL_REMISE)
}
// ⚠️ Et une remise faible reste une VRAIE remise pour `prixCasse` : les deux
// questions sont distinctes. Confondre « c'est moins cher » et « ça joue le
// jeu » ferait passer l'une pour l'autre au premier remaniement.
verifier('40 % reste un prix cassé, ce n’est pas la même question',
  prixCasse({ prix_deal: 6, prix_original: 10 }) === true)

// ═══════════════════════════════════════════════════════════════════════════
// 6ter. CE QUE ÇA S'APPELLE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ DEUX NOMS, ET C'EST VOULU. Le titre côté Yopper porte le sens et se
// retient ; le nom de la fonction côté commerçant doit être limpide pour celui
// qui l'achète. Ils vivent dans le module, jamais recopiés dans un écran.
egal('le titre côté Yopper', TITRE_YOPPER, 'Rien ne se perd')
egal('le sous-titre', SOUS_TITRE_YOPPER, 'Les derniers du jour, avant la fermeture.')
egal('le nom de la fonction côté commerçant', NOM_FONCTION_COMMERCANT, 'Avant la fermeture')
// ⚠️ ON PREND CE QUI RESTE, ON RÉSERVE CE QUI ATTEND.
egal('le bouton dit le geste', LIBELLE_BOUTON, 'Je le prends')
// 🔴 LE VOCABULAIRE DE TOO GOOD TO GO EST INTERDIT ICI. Aucun risque juridique,
// mais ça ferait passer Yoppaa pour un clone de ce qu'elle refuse d'être.
{
  const tousLesTextes = [TITRE_YOPPER, SOUS_TITRE_YOPPER, NOM_FONCTION_COMMERCANT, LIBELLE_BOUTON]
    .join(' ').toLowerCase()
  for (const mot of ['sauver', 'sauve', 'panier surprise', 'magic', 'too good']) {
    verifier(`🔴 aucun texte n’emprunte « ${mot} »`, !tousLesTextes.includes(mot), tousLesTextes)
  }
  // ⚠️ ET AUCUNE INJONCTION : « dépêche-toi » affiché tous les soirs se
  // démonétise en trois jours. L'urgence vient des FAITS, pas du ton.
  for (const mot of ['dépêche', 'vite', 'urgent', '!']) {
    verifier(`aucune injonction : « ${mot} »`, !tousLesTextes.includes(mot), tousLesTextes)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6quater. LE RETRAIT PASSE PAR LES CRÉNEAUX
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ DÉCISION D'ALEX, 04/09 : « le Yopper connaît, il ne doit pas chercher ses
// repères ». Une commande d'invendu reste une commande ordinaire, avec son
// numéro et son créneau. La fenêtre dit jusqu'à quand l'offre est VISIBLE, le
// créneau dit quand il vient CHERCHER.
{
  const F = { heure_debut: '17:00:00', heure_fin: '19:00:00', prix_deal: 3, prix_original: 6 }
  const c = (id, d, f) => ({ id, heure_debut: d, heure_fin: f })
  const ids = (l) => l.map(x => x.id)

  egal('un créneau qui commence dans la fenêtre convient',
    ids(creneauxUtilisables(F, [c('a', '18:00:00', '18:30:00')])), ['a'])
  egal('un créneau du matin ne convient pas',
    ids(creneauxUtilisables(F, [c('matin', '08:00:00', '09:00:00')])), [])
  // 🔴 CES DEUX ATTENTES ONT ÉTÉ INVERSÉES LE 04/09, ET ELLES ENCODAIENT UN
  // DÉFAUT. On testait le CHEVAUCHEMENT, c'est-à-dire une forme ; la vraie
  // règle est « peut-on encore le réserver », c'est-à-dire un comportement.
  //
  // Un créneau de 16 h à 20 h chevauche bien la fenêtre de 17 h à 19 h. Mais à
  // 17 h, quand l'offre s'affiche, il a démarré depuis une heure, et
  // `creneauCommandable` le refuse côté serveur. L'écran de publication
  // annonçait donc au commerçant un retrait que le serveur n'accepterait
  // jamais : l'offre partait, et personne ne pouvait la prendre.
  //
  // ⚠️ LE CHEVAUCHEMENT RESTE MESURÉ, sous son vrai nom, parce que le message
  // de refus s'en sert pour distinguer « ajoute un créneau » de « baisse ta
  // clôture ». Deux causes, deux gestes.
  egal('🔴 un créneau DÉJÀ COMMENCÉ à l’ouverture ne convient plus',
    ids(creneauxUtilisables(F, [c('large', '16:00:00', '20:00:00')])), [])
  egal('mais il chevauche bien la fenêtre, et on sait le dire',
    ids(creneauxDansLaFenetre(F, [c('large', '16:00:00', '20:00:00')])), ['large'])
  egal('🔴 un créneau qui finit juste après le début a commencé avant : non',
    ids(creneauxUtilisables(F, [c('chevauche', '16:30:00', '17:30:00')])), [])
  egal('un créneau qui finit AVANT le début ne convient pas',
    ids(creneauxUtilisables(F, [c('avant', '15:00:00', '17:00:00')])), [])
  egal('un créneau qui commence PILE à l’ouverture convient',
    ids(creneauxUtilisables(F, [c('pile', '17:00:00', '17:30:00')])), ['pile'])
  egal('un créneau qui commence PILE à la fermeture, non',
    ids(creneauxUtilisables(F, [c('fin', '19:00:00', '19:30:00')])), [])

  // ─── LA CLÔTURE DU CRÉNEAU ─────────────────────────────────────────────
  //
  // 🔴 LE DÉFAUT TROUVÉ EN RELISANT CETTE FONCTION. Elle ne regardait QUE
  // l'heure du créneau, jamais sa clôture. Une offre publiée à 17 h pour un
  // créneau de 18 h dont la clôture est réglée à 48 h passait toutes les
  // vérifications, s'affichait, et n'était réservable par personne : sa porte
  // s'était fermée l'avant-veille.
  egal('🔴 une clôture de 48 h rend le créneau inutilisable',
    ids(creneauxUtilisables(F, [{ id: 'ferme', heure_debut: '18:00:00', heure_fin: '18:30:00', cutoff_heures: 48 }])), [])
  egal('une clôture d’une heure laisse commander dès l’ouverture',
    ids(creneauxUtilisables(F, [{ id: 'ok1h', heure_debut: '18:00:00', heure_fin: '18:30:00', cutoff_heures: 1 }])), ['ok1h'])
  // La borne exacte : le créneau ferme à l'instant où l'offre ouvre. Il reste
  // un moment pour commander, et `creneauCommandable` accepte l'égalité.
  egal('la clôture qui tombe PILE à l’ouverture laisse passer',
    ids(creneauxUtilisables(F, [{ id: 'pile', heure_debut: '18:00:00', heure_fin: '18:30:00', cutoff_heures: 1 }])), ['pile'])
  egal('une minute de plus, et c’est fermé',
    ids(creneauxUtilisables(F, [{ id: 'trop', heure_debut: '17:59:00', heure_fin: '18:30:00', cutoff_heures: 1 }])), [])
  // ⚠️ ZÉRO N'EST PAS UNE CLÔTURE, et une valeur absurde non plus.
  egal('une clôture à zéro ne change rien',
    ids(creneauxUtilisables(F, [{ id: 'z', heure_debut: '18:00:00', heure_fin: '18:30:00', cutoff_heures: 0 }])), ['z'])
  egal('une clôture illisible ne ferme rien',
    ids(creneauxUtilisables(F, [{ id: 'n', heure_debut: '18:00:00', heure_fin: '18:30:00', cutoff_heures: 'deux' }])), ['n'])
  egal('un créneau sans heure de fin ne sert à rien',
    ids(creneauxUtilisables(F, [{ id: 'moitie', heure_debut: '18:00:00' }])), [])
  // ⚠️ ET LE PASSAGE DE MINUIT VAUT AUSSI ICI. La friterie de 22 h à 1 h.
  {
    const NUIT = { heure_debut: '22:00:00', heure_fin: '01:00:00', prix_deal: 3, prix_original: 6 }
    egal('🔴 un créneau après minuit convient à une fenêtre de nuit',
      ids(creneauxUtilisables(NUIT, [c('minuit', '00:15:00', '00:45:00')])), ['minuit'])
    egal('un créneau de l’après-midi, non',
      ids(creneauxUtilisables(NUIT, [c('aprem', '14:00:00', '15:00:00')])), [])
  }
  egal('sans fenêtre, aucun créneau ne convient',
    creneauxUtilisables({}, [c('a', '18:00:00', '18:30:00')]), [])
  egal('une liste de créneaux absente ne fait pas tomber', creneauxUtilisables(F, undefined), [])

  // ─── LE REFUS, ET IL DIT POURQUOI ──────────────────────────────────────
  //
  // 🔴 UNE OFFRE QU'ON LAISSE ENREGISTRER ET QUI NE S'AFFICHE JAMAIS EST LE
  // PIRE DES DEUX MONDES : le commerçant croit avoir travaillé, personne ne
  // voit rien, et rien ne le signale.
  const CRENEAU_OK = [c('a', '18:00:00', '18:30:00')]
  verifier('une offre complète passe', refusDePublication(F, CRENEAU_OK) === null)
  verifier('offrePubliable dit la même chose', offrePubliable(F, CRENEAU_OK) === true)

  const refusFenetre = refusDePublication({ prix_deal: 3, prix_original: 6 }, CRENEAU_OK)
  verifier('🔴 sans heure de fin, on refuse', refusFenetre !== null)
  verifier('et le message nomme ce qui manque', /heure/i.test(refusFenetre || ''), refusFenetre)

  const refusPrix = refusDePublication({ ...F, prix_deal: 6 }, CRENEAU_OK)
  verifier('🔴 sans remise, on refuse', refusPrix !== null)
  verifier('et le message parle du prix', /prix/i.test(refusPrix || ''), refusPrix)

  const refusPlancher = refusDePublication({ ...F, prix_deal: 5, prix_original: 6 }, CRENEAU_OK)
  verifier('🔴 sous le plancher, on refuse', refusPlancher !== null)
  // ⚠️ ET IL DONNE LES DEUX CHIFFRES : le sien et celui qu'il faut atteindre.
  // « Remise insuffisante » n'aide personne à 17 h, les mains dans la farine.
  verifier('et le message donne la remise obtenue', /17 %/.test(refusPlancher || ''), refusPlancher)
  verifier('et celle qu’il faut atteindre',
    refusPlancher?.includes(`${REMISE_MINIMALE} %`), refusPlancher)

  const refusCreneau = refusDePublication(F, [c('matin', '08:00:00', '09:00:00')])
  verifier('🔴 sans créneau dans la plage, on refuse', refusCreneau !== null)
  // ⚠️ LE MESSAGE NOMME LE GESTE QUI RÉPARE.
  verifier('et le message dit d’ajouter un créneau',
    /ajoute un créneau/i.test(refusCreneau || ''), refusCreneau)
  verifier('et dit la conséquence, pas seulement la règle',
    /venir chercher/i.test(refusCreneau || ''), refusCreneau)

  // 🔴 DEUX CAUSES, DEUX GESTES. « Ajoute un créneau » est un mauvais conseil
  // quand le créneau existe et que c'est sa CLÔTURE qui ferme la porte : le
  // commerçant en créerait un second, aussi inutilisable que le premier, et
  // conclurait que la fonction ne marche pas.
  const refusCloture = refusDePublication(F,
    [{ id: 'x', heure_debut: '18:00:00', heure_fin: '18:30:00', cutoff_heures: 48 }])
  verifier('🔴 un créneau dont la clôture est passée fait refuser aussi',
    refusCloture !== null, String(refusCloture))
  verifier('🔴 et le message parle de la CLÔTURE',
    /clôture/i.test(refusCloture || ''), String(refusCloture))
  verifier('🔴 il ne demande PAS d’ajouter un créneau, il y en a un',
    !/ajoute un créneau/i.test(refusCloture || ''), String(refusCloture))
  verifier('et il nomme les deux gestes qui réparent',
    /baisse/i.test(refusCloture || '') && /plus tôt/i.test(refusCloture || ''), String(refusCloture))

  // ⚠️ L'ORDRE DES REFUS COMPTE : on ne reproche pas le créneau à quelqu'un qui
  // n'a pas encore mis d'heure. On lui dit UNE chose à la fois, dans l'ordre où
  // il remplit.
  verifier('🔴 sans heure NI créneau, on parle d’abord de l’heure',
    /heure/i.test(refusDePublication({ prix_deal: 3, prix_original: 6 }, []) || ''))
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. L'ORDRE DE LECTURE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CE QUI SE RÉSERVE PASSE DEVANT. Une offre qu'on peut prendre tout de suite
// vaut mieux, pour celui qui lit, qu'une offre où il faut tenter sa chance. S'il
// se déplace deux fois pour rien, il n'ouvre plus cet écran, et il ne l'ouvre
// plus pour personne.
{
  const P = { prix_deal: 3, prix_original: 6 }   // toutes cassées de moitié
  const OFFRES = [
    { id: 'tard', ...P, heure_debut: '17:00:00', heure_fin: '20:00:00' },  // ferme tard
    { id: 'tot',  ...P, heure_debut: '17:00:00', heure_fin: '18:45:00' },  // ferme tôt
    { id: 'resa', ...P, heure_debut: '17:00:00', heure_fin: '20:00:00' },  // ferme tard, RÉSERVABLE
    { id: 'close', ...P, heure_debut: '08:00:00', heure_fin: '09:00:00' }, // hors fenêtre
    // 🔴 Ouverte, mais AU PRIX PLEIN : elle ne doit jamais apparaître.
    { id: 'plein', prix_deal: 6, prix_original: 6, heure_debut: '17:00:00', heure_fin: '20:00:00' },
  ]
  const rendu = offresOuvertes(OFFRES, a(18, 30), { reservable: o => o.id === 'resa' })
  egal('🔴 le réservable passe devant, puis le plus pressé',
    rendu.map(r => r.offre.id), ['resa', 'tot', 'tard'])
  verifier('l’offre hors fenêtre est écartée', !rendu.some(r => r.offre.id === 'close'))
  // 🔴 SANS CETTE GARDE, LE SOUS-TITRE MENT. « Les derniers du jour » laisse
  // entendre une affaire ; une offre au prix plein ne doit jamais s'afficher.
  verifier('🔴 l’offre au PRIX PLEIN est écartée', !rendu.some(r => r.offre.id === 'plein'))
  egal('le temps restant accompagne chaque offre',
    rendu.map(r => r.restant), [90, 15, 90])
  egal('et la remise aussi', rendu.map(r => r.remise), [50, 50, 50])
  // Sans indication de réservabilité, on ne PRÉTEND pas qu'elles le sont.
  const nu = offresOuvertes(OFFRES, a(18, 30))
  verifier('🔴 sans règle de réservation, rien n’est réservable',
    nu.every(r => r.reservable === false))
  egal('et l’ordre retombe sur le plus pressé',
    nu.map(r => r.offre.id), ['tot', 'tard', 'resa'])
  egal('une liste absente rend une liste vide', offresOuvertes(undefined, a(18, 30)), [])
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LE GESTE DU COMMERÇANT, ET L'ÉCRAN DU YOPPER
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 IL EST 17 H ET IL A LES MAINS DANS LA FARINE. Tout ce qui suit existe pour
// que publier un invendu tienne en trois gestes. Une fonction qui demande cinq
// minutes à ce moment-là n'est pas une fonction, c'est une ligne de
// documentation.
{
  const HORAIRES = {
    mardi: { ouvert: true, debut: '07:00', fin: '18:00' },
    // Une boulangerie qui ferme le midi : c'est la FIN DE LA DERNIÈRE plage qui
    // compte, jamais celle de la première.
    mercredi: { ouvert: true, debut: '07:00', fin: '12:00', debut2: '15:00', fin2: '18:30' },
    jeudi: { ouvert: false },
  }
  const le = (h, m = 0) => instant(`2026-09-08T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`, ETE)

  egal('la fermeture du jour se lit en minutes', fermetureDuJour(HORAIRES, 'mardi'), 18 * 60)
  // 🔴 UNE JOURNÉE COUPÉE FERME LE SOIR, PAS À MIDI. Se tromper ici publierait
  // un invendu déjà terminé au moment où il s'affiche.
  egal('🔴 un horaire à pause ferme à la FIN de la dernière plage',
    fermetureDuJour(HORAIRES, 'mercredi'), 18 * 60 + 30)
  verifier('un jour fermé n’a pas d’heure de fermeture', fermetureDuJour(HORAIRES, 'jeudi') === null)
  verifier('sans horaires du tout, on ne devine pas', fermetureDuJour(undefined, 'mardi') === null)

  // ─── LA FENÊTRE PROPOSÉE ────────────────────────────────────────────────
  egal('de maintenant à la fermeture',
    fenetreParDefaut(HORAIRES, 'mardi', le(15, 0)), { heure_debut: '15:00', heure_fin: '18:00' })
  egal('et l’heure de la pendule est respectée à la minute',
    fenetreParDefaut(HORAIRES, 'mardi', le(16, 45)), { heure_debut: '16:45', heure_fin: '18:00' })
  // 🔴 PUBLIER À 17 H 58 POUR 18 H N'ENVOIE PERSONNE : le Yopper n'a pas le
  // temps de traverser le village, et le commerçant croit avoir publié.
  verifier('🔴 à moins d’un quart d’heure de la fermeture, on ne propose plus',
    fenetreParDefaut(HORAIRES, 'mardi', le(17, 55)) === null)
  egal('mais pile à la limite, ça passe encore',
    fenetreParDefaut(HORAIRES, 'mardi', le(17, 45)), { heure_debut: '17:45', heure_fin: '18:00' })
  verifier('après la fermeture, rien', fenetreParDefaut(HORAIRES, 'mardi', le(19, 0)) === null)
  verifier('un jour de fermeture, rien', fenetreParDefaut(HORAIRES, 'jeudi', le(15, 0)) === null)
  egal('le seuil est nommé, pas écrit en dur', MINUTES_UTILES_MINIMUM, 15)

  // ─── ÉCRIRE UNE HEURE ───────────────────────────────────────────────────
  egal('minuit s’écrit 00:00', enHeure(0), '00:00')
  egal('18 h s’écrit 18:00', enHeure(1080), '18:00')
  egal('9 h 05 garde son zéro', enHeure(545), '09:05')
  verifier('1440 n’est pas une heure du jour', enHeure(1440) === null)
  verifier('un négatif non plus', enHeure(-1) === null)
  verifier('un illisible non plus', enHeure('midi') === null)

  // ─── LE PRIX SUGGÉRÉ ────────────────────────────────────────────────────
  //
  // ⚠️ ON SUGGÈRE, ON N'IMPOSE PAS. Le plancher est une règle, le conseil un
  // avis : à 40 % il publie, à 20 % non.
  egal('le conseil applique la remise conseillée', prixConseille(6), 3)
  egal('et il arrondit au centime', prixConseille(4.99), 2.5)
  verifier('sans prix, aucun conseil', prixConseille(null) === null)
  verifier('un prix nul n’est pas un prix', prixConseille(0) === null)
  verifier('🔴 le conseil SUIT la constante, il ne la recopie pas',
    prixConseille(100) === Math.round(100 * (100 - REMISE_CONSEILLEE)) / 100)

  // ─── LA LIGNE PUBLIÉE ───────────────────────────────────────────────────
  const TARTE = { id: 'a2', nom: 'Tarte aux pommes', prix: 18 }
  const publier = (patch = {}) => lignePublication({
    article: TARTE, reste: 2, prix: 9, heureDebut: '15:00', heureFin: '18:00',
    jour: '2026-09-08', commercantId: 'c1', ...patch,
  })

  {
    const l = publier()
    egal('🔴 le titre est le NOM de l’article', l.titre, 'Tarte aux pommes')
    egal('la quantité déclarée est écrite', l.quantite, 2)
    egal('le prix cassé et le prix plein voyagent ensemble', [l.prix_deal, l.prix_original], [9, 18])
    egal('la fenêtre est celle qu’il a choisie', [l.heure_debut, l.heure_fin], ['15:00', '18:00'])
    // 🔴 UN INVENDU NE SURVIT PAS À SA JOURNÉE, et la lecture des deals du jour
    // passe par ces colonnes : sans elles, l'offre existerait sans s'afficher.
    egal('🔴 les trois dates valent le jour même',
      [l.date_deal, l.date_debut, l.date_fin], ['2026-09-08', '2026-09-08', '2026-09-08'])
    // 🔴 « lot » AVEC UNE SEULE UNITÉ : c'est le type qui produit une ligne de
    // panier À PART. Un « remise_pct » aurait remisé TOUT le stock du jour.
    egal('🔴 c’est une offre séparée, pas une remise sur le catalogue',
      [l.deal_type, l.unites_par_deal], ['lot', 1])
    // ⚠️ LE GOOD MORNING PART À 7 H, L'INVENDU VIT À 17 H. L'y pousser
    // annoncerait la veille ce qui n'existe pas encore.
    verifier('🔴 jamais dans le Good Morning', l.inclus_morning === false)
    verifier('et ce n’est pas une bonne affaire préparée', l.est_bonne_affaire === false)
    verifier('l’offre est publiée active', l.actif === true)
    // Et elle doit passer les règles du module, sinon elle ne s'affichera pas.
    verifier('🔴 la ligne publiée est une offre VALABLE', offreValable(l) === true)
    egal('sa remise est bien celle qu’on annonce', remisePourcent(l), 50)
  }

  // ⚠️ TOUT CE QUI EST BANCAL SE REFUSE, ET EN SILENCE PLUTÔT QU'EN BASE. La
  // contrainte de la base dirait la même chose, mais un message d'erreur
  // Postgres à 17 h n'aide personne.
  verifier('sans article, aucune ligne', publier({ article: null }) === null)
  verifier('sans commerce, aucune ligne', publier({ commercantId: null }) === null)
  verifier('🔴 une quantité nulle ne se publie pas', publier({ reste: 0 }) === null)
  verifier('une quantité négative non plus', publier({ reste: -3 }) === null)
  verifier('une quantité illisible non plus', publier({ reste: 'trois' }) === null)
  verifier('🔴 un prix nul ne se publie pas', publier({ prix: 0 }) === null)
  verifier('un article sans prix habituel non plus',
    publier({ article: { id: 'x', nom: 'Sans prix' } }) === null)
  verifier('une demi-fenêtre non plus', publier({ heureFin: null }) === null)
  verifier('un jour mal formé non plus', publier({ jour: 'mardi' }) === null)
  egal('les demi-unités se rabotent', publier({ reste: 2.9 }).quantite, 2)
  egal('et les centimes s’arrondissent', publier({ prix: 8.999 }).prix_deal, 9)
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. LE CÂBLAGE DES DEUX ÉCRANS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CES GARDES LISENT DU CODE, faute de pouvoir monter un rendu. Elles sont
// mesurées par le harnais : une garde textuelle que personne ne fait rougir ne
// prouve rien.
{
  const BORD = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  const ACCUEIL = sansProse(readFileSync(new URL('../app/commander/page.js', import.meta.url), 'utf8'))

  // ─── LE GESTE DU COMMERÇANT ─────────────────────────────────────────────
  verifier('🔴 le geste de l’invendu existe dans le tableau de bord',
    /<AvantLaFermeture /.test(BORD))
  // 🔴 `peut` APPLIQUE LA CATÉGORIE, et c'est indispensable : en détail le stock
  // se décrémente en dur, la même offre le compterait deux fois.
  verifier('🔴 il est réservé au forfait ET à la catégorie',
    /if \(!peut\(commercant, 'anti_gaspi'\)\) return null/.test(BORD))
  verifier('la ligne écrite vient du module, pas de l’écran',
    /lignePublication\(\{/.test(BORD))
  verifier('🔴 le refus de publication est opposé avant l’envoi',
    /refusDePublication\(offre, creneaux\)/.test(BORD))
  // ⚠️ ON LIT LE RÉSULTAT DE L'ÉCRITURE. Un `await` qu'on n'écoute pas est un
  // espoir, et ici l'espoir vaut une tarte qui finit à la poubelle.
  verifier('🔴 le résultat de la publication est lu',
    /const \{ error \} = await supabase\.from\('yoppaa_deals'\)\.insert\(ligne\)/.test(BORD))
  verifier('la fenêtre par défaut vient du module',
    /fenetreParDefaut\(commercant\?\.horaires_detail, nomJour\)/.test(BORD))
  // ⚠️ UN ARTICLE VITRINE N'EST PAS UN INVENDU : rien ne s'y commande.
  verifier('🔴 la vitrine ne se brade pas',
    /!a\.est_vitrine && Number\(a\.prix\) > 0/.test(BORD))

  // ─── L'ÉCRAN DU YOPPER ──────────────────────────────────────────────────
  verifier('🔴 l’accueil affiche « Rien ne se perd »',
    /\{TITRE_YOPPER\}/.test(ACCUEIL) && /\{SOUS_TITRE_YOPPER\}/.test(ACCUEIL))
  // ⚠️ LE TITRE VIENT DU MODULE. Recopié dans l'écran, il aurait divergé au
  // premier changement de formulation, comme le libellé du bon avant le 31/08.
  verifier('🔴 et il ne le recopie pas en dur',
    !/Rien ne se perd/.test(ACCUEIL), 'le titre est écrit en dur dans l’écran')
  // 🔴 LE TRI ET LE FILTRE APPARTIENNENT AU MODULE. Refaits dans l'écran, ils
  // auraient divergé au premier changement d'heure.
  verifier('🔴 le filtre et le tri viennent du module',
    /const ouvertes = offresOuvertes\(invendus \|\| \[\]\)/.test(ACCUEIL))
  // 🔴 `quantite` EST LE TOTAL PUBLIÉ, PAS CE QUI RESTE. L'afficher tel quel
  // dirait « il en reste 3 » quand deux sont déjà partis, et l'écran ne peut pas
  // le calculer lui-même : un Yopper n'a pas le droit de lire les lignes de
  // commande des autres. Une fonction qui rend un AGRÉGAT le peut.
  verifier('🔴 le reste affiché tient compte de ce qui est déjà vendu',
    /supabase\.rpc\('vendu_par_offre'/.test(ACCUEIL)
    && /resteSurOffre\(o\.offre, vendus\[o\.offre\.id\] \|\| 0\)/.test(ACCUEIL))
  // ⚠️ ET TANT QU'ON NE SAIT PAS, ON N'AFFICHE PAS DE CHIFFRE plutôt que d'en
  // afficher un faux : le compteur apparaît tout seul quand le relevé revient.
  verifier('🔴 sans relevé, aucun chiffre inventé',
    /if \(Array\.isArray\(comptes\)\) \{/.test(ACCUEIL))
  // ⚠️ LA PRÉSENCE DE LA FENÊTRE FAIT L'OFFRE, et le relevé ne demande que ça.
  verifier('🔴 seules les offres qui portent une fenêtre sont relevées',
    /\.not\('heure_fin', 'is', null\)/.test(ACCUEIL))
  verifier('et seulement celles du jour',
    /\.eq\('date_deal', aujourdhui\)/.test(ACCUEIL))
  // ⚠️ UNE SECTION VIDE OCCUPERAIT LE HAUT DE L'ÉCRAN POUR NE RIEN ANNONCER.
  // ⚠️ ELLE SE JUGE SUR CE QUI EST DANS LE PÉRIMÈTRE, PAS SUR CE QUI EST OUVERT.
  // Rester sur `invendusOuverts` aurait affiché le titre « Rien ne se perd »
  // au-dessus d'une liste vide le jour où la seule offre du pays est à 60 km.
  verifier('🔴 la section n’existe que s’il y a quelque chose',
    /\{invendusProches\.length > 0 && \(/.test(ACCUEIL))
  // ⚠️ ON ANNONCE L'ÉTAT, PAS UNE ALARME.
  verifier('le temps restant se dit avec les mots du module',
    /libelleTempsRestant\(restant\)/.test(ACCUEIL))
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. LE PLAFOND DE L'OFFRE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 LE DÉFAUT VU PAR ALEX LE 04/09 AU SOIR. Il publie TROIS assiettes à moitié
// prix, la fiche en proposait QUINZE : elle lisait le stock du jour de
// l'ARTICLE, pas la quantité de l'OFFRE. Soixante et onze euros de manque à
// gagner sur une offre censée écouler trois restes, sans qu'aucune erreur ne
// s'affiche nulle part.
{
  const OFFRE = { titre: 'Assiette kebab', quantite: 3, heure_debut: '15:00:00', heure_fin: '18:00:00', prix_deal: 4.75, prix_original: 9.5 }

  // ⚠️ `null` VEUT DIRE « SANS OBJET », PAS « ZÉRO ». Un lot ou un duo ordinaire
  // n'a pas de quantité propre : il s'arrête au stock de son article. Confondre
  // les deux les rendrait tous invendables.
  egal('une offre plafonnée rend son plafond', plafondDeLOffre(OFFRE), 3)
  verifier('🔴 un lot ordinaire n’a PAS de plafond', plafondDeLOffre({ titre: 'Lot 3+1' }) === null)
  verifier('un plafond nul n’est pas un plafond', plafondDeLOffre({ quantite: 0 }) === null)
  verifier('un plafond négatif non plus', plafondDeLOffre({ quantite: -2 }) === null)
  egal('les demi-unités se rabotent', plafondDeLOffre({ quantite: 3.9 }), 3)

  egal('sans vente, il reste tout', resteSurOffre(OFFRE, 0), 3)
  egal('deux vendues, il en reste une', resteSurOffre(OFFRE, 2), 1)
  egal('tout vendu, il ne reste rien', resteSurOffre(OFFRE, 3), 0)
  // ⚠️ JAMAIS NÉGATIF. Deux paniers partis en même temps peuvent dépasser le
  // plafond, et l'écran ne doit pas annoncer « -1 restant » à celui d'après.
  egal('🔴 un dépassement ne rend jamais un négatif', resteSurOffre(OFFRE, 5), 0)
  verifier('sans plafond, aucun reste à annoncer', resteSurOffre({ titre: 'Lot' }, 2) === null)

  // ─── LE REFUS, ET IL DIT COMBIEN IL EN RESTE ────────────────────────────
  //
  // ⚠️ SANS LE CHIFFRE, le Yopper retire un article au hasard et réessaie
  // jusqu'à tomber juste, ou abandonne.
  verifier('trois demandées sur trois, ça passe',
    refusDeQuantite({ titre: 'Assiette kebab', offre: OFFRE, dejaVendu: 0, demande: 3 }) === null)
  verifier('une offre sans plafond ne refuse jamais',
    refusDeQuantite({ titre: 'Lot', offre: { titre: 'Lot' }, dejaVendu: 0, demande: 99 }) === null)
  {
    const refus = refusDeQuantite({ titre: 'Assiette kebab', offre: OFFRE, dejaVendu: 1, demande: 5 })
    verifier('🔴 cinq demandées quand il en reste deux : refus', refus !== null, String(refus))
    verifier('🔴 et le message dit COMBIEN il en reste', /il n'en reste que 2/.test(refus), String(refus))
    verifier('et il nomme l’article', /Assiette kebab/.test(refus), String(refus))
  }
  {
    const refus = refusDeQuantite({ titre: 'Assiette kebab', offre: OFFRE, dejaVendu: 3, demande: 1 })
    verifier('🔴 quand tout est parti, on le dit autrement', /tout est parti/i.test(refus || ''), String(refus))
  }
  // ⚠️ ON DIT LA RARETÉ, PAS L'URGENCE. « Il en reste 3 » informe ; « plus que
  // 3 ! » presse, et ce n'est pas notre rôle.
  egal('la carte annonce ce qu’il reste', libelleReste(3), 'il en reste 3')
  egal('et se tait quand il n’y a plus rien', libelleReste(0), '')
  egal('comme sur une offre sans plafond', libelleReste(null), '')
  {
    const textes = [
      refusDeQuantite({ titre: 'X', offre: OFFRE, dejaVendu: 1, demande: 5 }),
      refusDeQuantite({ titre: 'X', offre: OFFRE, dejaVendu: 3, demande: 1 }),
      libelleReste(3),
    ].join(' ')
    verifier('aucun tiret cadratin', !textes.includes('—'), textes)
    verifier('aucune injonction', !textes.includes('!'), textes)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. LE SERVEUR REFUSE VRAIMENT LE DÉPASSEMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 C'EST LA SEULE PROTECTION RÉELLE. La fiche empêche d'en mettre quinze au
// panier ; un onglet resté ouvert, un panier restauré au retour de Stripe ou
// une requête fabriquée ne passent par aucune de ses lignes.
{
  const OFFRE = { id: 'd1', titre: 'Assiette kebab', quantite: 3, prix_deal: 4.75, prix_original: 9.5 }
  const LOT = { id: 'd2', titre: 'Lot 3+1' }

  // Une base qui rend ce qu'on lui dit, et qui retient ce qu'on lui demande.
  const base = (vendues, { plante = false } = {}) => {
    const vu = {}
    const chaine = {
      select: () => chaine,
      in: (col, ids) => { vu.ids = ids; return chaine },
      eq: () => chaine,
      // ⚠️ ELLE RETIENT LE FILTRE, sinon la règle « quels statuts comptent »
      // n'est mesurable par aucune mutation : la fausse base l'ignorerait.
      not: (col, op, val) => { vu.exclus = val; return Promise.resolve(plante ? { data: null, error: { message: 'boum' } } : { data: vendues, error: null }) },
    }
    return { from: () => chaine, _vu: vu }
  }
  const lignes = (q) => [{ article_id: 'a1', article_nom: 'Assiette kebab', deal_id: 'd1', quantite: q }]

  {
    const r = await verifierQuantiteOffres({
      supabase: base([{ deal_id: 'd1', quantite: 1 }]), lignes: lignes(2),
      dealsData: [OFFRE], commercantId: 'c1',
    })
    verifier('deux demandées quand une est vendue : ça passe', r.ok === true, JSON.stringify(r))
  }
  {
    const r = await verifierQuantiteOffres({
      supabase: base([{ deal_id: 'd1', quantite: 1 }]), lignes: lignes(3),
      dealsData: [OFFRE], commercantId: 'c1',
    })
    verifier('🔴 trois demandées quand une est vendue : REFUS', r.ok === false, JSON.stringify(r))
    egal('et le refus est un conflit, pas une panne', r.status, 409)
    verifier('le message dit combien il en reste', /il n'en reste que 2/.test(r.error), String(r.error))
  }
  // ⚠️ UN LOT ORDINAIRE N'A PAS DE PLAFOND, et on ne va même pas interroger la
  // base pour lui : c'est `verifierStockDisponible` qui s'en charge.
  {
    const b = base([])
    const r = await verifierQuantiteOffres({
      supabase: b, lignes: [{ article_id: 'a1', deal_id: 'd2', quantite: 99 }],
      dealsData: [LOT], commercantId: 'c1',
    })
    verifier('🔴 un lot ordinaire n’est pas plafonné', r.ok === true, JSON.stringify(r))
    verifier('et la base n’est même pas interrogée', b._vu.ids === undefined)
  }
  // ⚠️ UNE MÊME OFFRE PEUT ÊTRE SUR PLUSIEURS LIGNES DU MÊME PANIER, et il faut
  // les additionner : deux lignes de deux dépassent un plafond de trois.
  {
    const r = await verifierQuantiteOffres({
      supabase: base([]), dealsData: [OFFRE], commercantId: 'c1',
      lignes: [
        { article_id: 'a1', deal_id: 'd1', quantite: 2 },
        { article_id: 'a1', deal_id: 'd1', quantite: 2 },
      ],
    })
    verifier('🔴 les lignes d’un même panier s’additionnent', r.ok === false, JSON.stringify(r))
  }
  // 🔴 UN RELEVÉ QUI ÉCHOUE NE VAUT PAS ZÉRO VENTE. Le traiter ainsi ouvrirait
  // le plafond en grand exactement le jour où la base tousse.
  {
    const r = await verifierQuantiteOffres({
      supabase: base([], { plante: true }), lignes: lignes(1),
      dealsData: [OFFRE], commercantId: 'c1',
    })
    verifier('🔴 un relevé en échec REFUSE, il ne laisse pas passer', r.ok === false, JSON.stringify(r))
    egal('et il le dit comme une panne, pas comme un refus', r.status, 503)
  }
  // Sans aucune ligne d'offre, rien à vérifier.
  {
    const r = await verifierQuantiteOffres({
      supabase: base([]), lignes: [{ article_id: 'a1', quantite: 2 }],
      dealsData: [OFFRE], commercantId: 'c1',
    })
    verifier('un panier sans offre passe sans requête', r.ok === true)
  }
  // ⚠️ MÊMES STATUTS QUE LE STOCK, MOT POUR MOT. Une commande non retirée rend
  // sa marchandise, donc elle ne consomme pas l'offre ; une commande en attente
  // de paiement, si, le temps du passage sur Stripe. Deux règles différentes
  // pour « qu'est-ce qui est vendu » auraient divergé au premier changement.
  {
    const b = base([])
    await verifierQuantiteOffres({ supabase: b, lignes: lignes(1), dealsData: [OFFRE], commercantId: 'c1' })
    verifier('🔴 les commandes rendues ou annulées ne consomment pas l’offre',
      /non_retire/.test(b._vu.exclus || '')
      && /annulee_paiement_ko/.test(b._vu.exclus || '')
      && /annulee_client_refund/.test(b._vu.exclus || ''), String(b._vu.exclus))
    // ⚠️ ET « paiement_en_attente » N'EST PAS EXCLU : le panier parti sur Stripe
    // tient sa place, sinon deux Yoppers prendraient la même dernière assiette.
    verifier('🔴 mais un panier en cours de paiement tient sa place',
      !/paiement_en_attente/.test(b._vu.exclus || ''), String(b._vu.exclus))
  }

  // ⚠️ ET LA LIGNE DE COMMANDE DOIT PORTER L'OFFRE, sans quoi plus rien ne peut
  // compter ce qui a été vendu. C'est le maillon qui manquait.
  verifier('🔴 le select des deals demande la quantité',
    /\bquantite\b/.test(SELECT_DEALS), SELECT_DEALS)
  const ROUTE = sansProse(readFileSync(new URL('../app/api/stripe/checkout/create-commande/route.js', import.meta.url), 'utf8'))
  verifier('🔴 la route oppose le plafond de l’offre',
    /verifierQuantiteOffres\(\{/.test(ROUTE))
  verifier('🔴 et elle écrit l’offre sur la ligne de commande',
    /deal_id: l\.deal_id \|\| null,/.test(ROUTE))
  // ⚠️ ET ELLE REFUSE VRAIMENT. La garde du dessus ne dit que si la
  // vérification est APPELÉE ; neutraliser son refus laisserait l'appel en
  // place et la garde au vert. C'est la mesure par mutation qui l'a dit.
  verifier('🔴 et le refus est réellement opposé',
    /if \(!verifOffres\.ok\) \{/.test(ROUTE))

  // ─── LES DEUX ÉCRANS DE L'INVENDU ───────────────────────────────────────
  const FICHE = sansProse(readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8'))

  // 🔴 ALEX, 04/09 : « ça devient un deal affiché à deux endroits, ça ne doit
  // pas être confondu avec un deal classique ». Une bonne affaire se PRÉPARE et
  // dure la semaine ; un invendu, c'est ce qui reste ce soir.
  verifier('🔴 le bandeau « deal du jour » écarte les invendus',
    /const ordinaires = dealsActifs\.filter\(d => !porteUneFenetre\(d\)\)/.test(FICHE))
  verifier('🔴 et la carte les habille autrement',
    /const invendu = porteUneFenetre\(deal\)/.test(FICHE))

  // 🔴 TROIS PUBLIÉES, QUINZE PROPOSÉES. La fiche lisait le stock du jour de
  // l'ARTICLE, pas la quantité de l'OFFRE.
  verifier('🔴 le panier oppose le plafond de l’offre',
    /if \(plafond !== null && \(panier\[key\]\?\.quantite \|\| 0\) \+ 1 > plafond\) return/.test(FICHE))
  // ⚠️ ET LE BOUTON NE MENT PAS quand tout est parti : le laisser cliquable
  // enverrait le Yopper se faire refuser au paiement, panier rempli.
  verifier('🔴 le bouton disparaît quand tout est parti',
    /\{reste === 0 \? \(/.test(FICHE))
  // ⚠️ LE RESTE VIENT DU RELEVÉ, pas de la quantité publiée.
  verifier('🔴 la fiche compte ce qui a déjà été vendu',
    /supabase\.rpc\('vendu_par_offre'/.test(FICHE)
    && /resteSurOffre\(deal, ventesParOffre\[deal\.id\] \|\| 0\)/.test(FICHE))
  verifier('🔴 et sans relevé, elle n’annonce aucun chiffre',
    /if \(!ventesParOffre\) return null/.test(FICHE))
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. LE PÉRIMÈTRE : QUI S'AFFICHE, DANS QUEL ORDRE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 ALEX, 05/09 : « la card anti gaspi s'affiche sur quels critères ? Distance ?
// Code postal ? S'il y a 100 commerçants avec des deals jusqu'à 50 km, lesquels
// s'affichent ? »
//
// La réponse était AUCUN CRITÈRE : toute la Belgique publiée, triée par temps
// restant. Un Yopper de Mettet voyait donc en premier l'offre d'Arlon qui ferme
// dans dix minutes.
//
// ⚠️ TOUT S'EXÉCUTE ICI. Ces gardes appellent `offresProches` avec des distances
// précises et regardent l'ORDRE qu'elle rend, pas les mots qu'elle contient.
{
  // On fabrique la forme que rend `offresOuvertes`, sans passer par elle : ce
  // qu'on mesure ici est le classement, pas l'ouverture (section 6 s'en charge).
  const ligne = (id, distance, restant) => ({
    offre: { id, commercant_id: `c-${id}`, titre: id, prix_deal: 4, prix_original: 10 },
    reservable: false, restant, remise: 60, reste: null, __distance: distance,
  })
  const parDistance = lignes => offresProches(lignes, {
    distanceDe: o => (lignes.find(l => l.offre.id === o.id) || {}).__distance,
  })

  const troisVilles = [ligne('loin', 20000, 15), ligne('proche', 1000, 240), ligne('moyen', 8000, 60)]
  egal('🔴 le plus proche passe en premier, pas le plus urgent',
    parDistance(troisVilles).map(o => o.offre.id), ['proche', 'moyen', 'loin'])

  // ⚠️ LE PLAFOND EXISTE : personne ne traverse la province pour une tarte.
  egal('🔴 au-delà du rayon, l’offre ne s’affiche pas',
    parDistance([ligne('proche', 1000, 60), ligne('tres_loin', RAYON_INVENDU_M + 1, 5)]).map(o => o.offre.id),
    ['proche'])
  egal('et la borne exacte du rayon passe encore',
    parDistance([ligne('pile', RAYON_INVENDU_M, 60)]).map(o => o.offre.id), ['pile'])

  // 🔴 LE PIÈGE DU ZÉRO, SEPTIÈME FOIS. `Number(null)` vaut 0 : une offre sans
  // distance connue serait passée DEVANT la boulangerie d'en face.
  egal('🔴 une distance inconnue ne vaut pas zéro mètre',
    parDistance([ligne('inconnue', null, 5), ligne('a_500m', 500, 240)]).map(o => o.offre.id),
    ['a_500m', 'inconnue'])
  egal('et elle passe aussi après la plus lointaine du rayon',
    parDistance([ligne('inconnue', null, 5), ligne('a_24km', 24000, 240)]).map(o => o.offre.id),
    ['a_24km', 'inconnue'])
  // 🔴 IL FAUT TROIS OFFRES POUR MESURER LES DEUX BRANCHES, et c'est le harnais
  // qui l'a dit le 05/09 : sur une liste de DEUX, le tri de V8 n'appelle le
  // comparateur que dans un sens, si bien que casser « une distance inconnue
  // passe après » laissait les deux cas ci-dessus VERTS. Une garde qui ne
  // couvre qu'une moitié d'une fonction symétrique n'en couvre aucune.
  egal('🔴 et dans les deux sens de comparaison',
    parDistance([ligne('a_500m', 500, 60), ligne('inconnue', null, 5), ligne('a_2km', 2000, 240)])
      .map(o => o.offre.id),
    ['a_500m', 'a_2km', 'inconnue'])

  // ⚠️ SANS POSITION, ON NE MASQUE RIEN. Un Yopper qui a refusé la
  // géolocalisation n'a aucune distance : lui cacher la section le priverait de
  // tout au nom d'un périmètre qu'on est incapable de mesurer.
  const sansPosition = [ligne('a', null, 200), ligne('b', null, 20), ligne('c', null, 90)]
  egal('🔴 sans aucune position, tout reste affiché',
    offresProches(sansPosition, {}).length, 3)
  egal('et l’ordre retombe sur le temps restant',
    offresProches(sansPosition, {}).map(o => o.offre.id), ['b', 'c', 'a'])

  // ⚠️ CE QUI SE RÉSERVE PASSE TOUJOURS DEVANT, distance ou pas : c'est la seule
  // offre sur laquelle le Yopper peut agir tout de suite.
  const avecReservable = [
    { ...ligne('loin_reservable', 20000, 15), reservable: true },
    ligne('proche', 300, 240),
  ]
  egal('le réservable garde la priorité sur la proximité',
    offresProches(avecReservable, { distanceDe: o => (avecReservable.find(l => l.offre.id === o.id) || {}).__distance })
      .map(o => o.offre.id),
    ['loin_reservable', 'proche'])

  // ⚠️ ROBUSTESSE : une entrée qui n'est pas une liste ne doit pas faire tomber
  // l'accueil entier.
  egal('une entrée qui n’est pas une liste rend une liste vide', offresProches(null, {}).length, 0)
  egal('et un relais de distance qui lève n’est pas ce qu’on attend',
    offresProches([ligne('x', 100, 10)], { distanceDe: () => 'abc' })[0].distance, null)

  // ⚠️ LE PLAFOND D'AFFICHAGE EST UN NOMBRE, PAS UNE IMPRESSION.
  verifier('🔴 quatre cartes avant de déplier', INVENDUS_AFFICHES === 4)
  verifier('et le rayon vaut 25 km', RAYON_INVENDU_M === 25000)
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. PARTAGER UNE OFFRE, ET ARRIVER DESSUS
// ═══════════════════════════════════════════════════════════════════════════
{
  const offre = { id: 'abc-123', titre: '3 pains surprise', prix_deal: 4, prix_original: 10 }
  const texte = texteDePartage(offre, 'Boulangerie Dupont')
  verifier('le partage dit ce que c’est', texte.includes('3 pains surprise'))
  verifier('et chez qui', texte.includes('Boulangerie Dupont'))
  verifier('et la remise', texte.includes('-60 %'))
  verifier('et il porte le titre du module', texte.includes(TITRE_YOPPER))
  // 🔴 UN CHIFFRE GRAVÉ DANS UN MESSAGE DEVIENT FAUX TOUT SEUL. Entre l'envoi et
  // la lecture, tout peut être parti.
  verifier('🔴 le partage ne promet AUCUNE quantité', !/il en reste/.test(texte))
  verifier('un commerce sans nom ne fabrique pas « chez undefined »',
    !/undefined|null/.test(texteDePartage(offre, null)))
  verifier('une offre sans titre reste lisible',
    texteDePartage({ prix_deal: 4, prix_original: 10 }, 'Chez Nous').includes('Chez Nous'))
  // ⚠️ AU PRIX PLEIN, PAS DE « -0 % » : le module n'annonce que ce qui existe.
  verifier('pas de remise annoncée quand il n’y en a pas',
    !/-0 %/.test(texteDePartage({ titre: 'x', prix_deal: 10, prix_original: 10 }, 'Chez Nous')))

  egal('le lien vise la fiche ET l’offre', lienVersOffre('boulangerie-dupont', 'abc-123'),
    `/commander/boulangerie-dupont?${PARAM_OFFRE}=abc-123`)
  egal('sans offre, il vise la fiche', lienVersOffre('boulangerie-dupont', null),
    '/commander/boulangerie-dupont')
  egal('sans slug, il ne fabrique pas d’adresse', lienVersOffre(null, 'abc-123'), null)
  // ⚠️ UN `href` EST UNE CHAÎNE, et une chaîne se compose. Un slug non encodé
  // fabriquerait un lien mort à la première apostrophe.
  verifier('le slug est encodé', lienVersOffre('chez l ami', 'x').includes('chez%20l%20ami'))
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. LA CARTE, TELLE QU'ALEX L'A DEMANDÉE
// ═══════════════════════════════════════════════════════════════════════════
{
  const ACCUEIL = sansProse(readFileSync(new URL('../app/commander/page.js', import.meta.url), 'utf8'))
  const FICHE = sansProse(readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8'))
  const ICONE = sansProse(readFileSync(new URL('../app/components/IconeAntiGaspi.js', import.meta.url), 'utf8'))

  // 🔴 « LE NOM DU COMMERÇANT DOIT ÊTRE MIEUX MIS EN AVANT ». Il est ce qui
  // déclenche le déplacement : on connaît sa boulangerie, pas son invendu.
  verifier('🔴 le nom du commerçant a sa propre ligne, en tête',
    /textTransform: 'uppercase'[^}]*\}\}>\s*\{commerce\?\.nom \|\| 'Chez un commerçant'\}/.test(ACCUEIL))
  // 🔴 « LE TITRE NE DONNE PAS ENVIE, IL DOIT ATTIRER L'ŒIL ». Il était tronqué
  // à une ligne : « Assortiment de pâtisseries » devenait « Assortiment de pâ… ».
  // 🔴 CETTE GARDE ÉTAIT VERTE GRÂCE À UN JUMEAU, attrapé par le harnais le
  // 05/09 : `WebkitLineClamp: 2` existe aussi sur la description d'une carte de
  // commerce, ligne 787. Chercher le mot seul restait donc vert même une fois
  // le clamp de l'invendu ramené à une ligne. On vise la ligne de CETTE carte.
  verifier('🔴 le titre tient sur deux lignes, il ne se coupe plus à un mot',
    /lineHeight: 1\.25, display: '-webkit-box', WebkitLineClamp: 2/.test(ACCUEIL))
  // 🔴 LES TROIS PASTILLES DEMANDÉES.
  verifier('🔴 pastille temps restant', /\{tempsRestant && \(/.test(ACCUEIL))
  verifier('🔴 pastille quantité', /\{quantite && \(/.test(ACCUEIL))
  verifier('🔴 pastille distance', /\{distance != null && \(/.test(ACCUEIL))
  // ⚠️ ET AUCUNE PASTILLE VIDE : une offre sans plafond n'affiche pas « il en
  // reste » à blanc, un Yopper sans position n'affiche pas de distance.
  verifier('les pastilles se taisent quand elles n’ont rien à dire',
    /const quantite = libelleReste\(reste\)/.test(ACCUEIL)
    && /const tempsRestant = libelleTempsRestant\(restant\)/.test(ACCUEIL))
  // 🔴 « IL FAUT UNE PASTILLE DE PARTAGE ».
  verifier('🔴 la carte se partage', /onClick=\{onPartager\}/.test(ACCUEIL)
    && /async function partagerInvendu\(offre, commerce, e\)/.test(ACCUEIL))
  // ⚠️ UN BOUTON DANS UN BOUTON EST DU HTML INVALIDE, et Safari y répond en
  // avalant le clic intérieur : la carte est un `div`, comme `CarteCommerce`.
  verifier('🔴 la carte n’est pas un bouton, sinon le partage ne clique plus',
    /<div onClick=\{onOuvrir\}/.test(ACCUEIL))
  // ⚠️ `sansProse` NE DÉPOUILLE QUE LES LIGNES ENTIÈREMENT COMMENTÉES : un
  // commentaire de fin de ligne survit au dépouillage, et cette garde rougissait
  // pour ça alors que le code était juste. `[^\n]*` le laisse passer.
  verifier('et le partage n’ouvre pas la fiche sous le doigt',
    /e\?\.stopPropagation\?\.\(\)[^\n]*\s*const chemin = lienVersOffre/.test(ACCUEIL))
  // ⚠️ LE TEXTE ET LE LIEN VIENNENT DU MODULE, jamais recomposés sur l'écran.
  verifier('le partage prend ses mots dans le module',
    /texteDePartage\(offre, commerce\?\.nom\)/.test(ACCUEIL))
  // ⚠️ ET IL PARTAGE L'OFFRE, PAS LA FICHE. Un lien vers le haut du catalogue
  // ferait chercher à celui qui le reçoit ce qu'on vient de lui promettre.
  verifier('🔴 le lien partagé porte l’offre',
    /const chemin = lienVersOffre\(commerce\?\.slug, offre\?\.id\)/.test(ACCUEIL))

  // 🔴 LE PÉRIMÈTRE EST APPLIQUÉ PAR L'ÉCRAN, et depuis le module.
  verifier('🔴 l’accueil passe la distance du commerçant au module',
    /offresProches\(invendusOuverts, \{[\s\S]{0,200}distanceDe: offre => commercants\.find\(c => c\.id === offre\?\.commercant_id\)\?\.distance/.test(ACCUEIL))
  // ⚠️ LE CLASSEMENT SE CALCULE AU RENDU, PAS AU RELEVÉ. La position arrive
  // presque toujours APRÈS les offres : figer l'ordre au moment du relevé
  // l'aurait gelé sur « distance inconnue » pour toute la session.
  verifier('🔴 le classement n’est pas figé dans l’état',
    !/setInvendusOuverts\(offresProches/.test(ACCUEIL))
  // 🔴 ET IL NE SUIT PAS LES ONGLETS DE LA LISTE. Un Yopper qui tape « coiffeur »
  // ne doit pas voir disparaître les tartes de sa boulangerie.
  verifier('🔴 le périmètre lit la liste entière, pas la liste filtrée',
    !/offresProches\(invendusOuverts[\s\S]{0,200}commercantsFiltres/.test(ACCUEIL))

  // 🔴 « VOIR PLUS » DÉPLIE SUR PLACE (arbitrage Alex) : pas de route de plus.
  verifier('🔴 le bouton dit le geste ET le nombre',
    /invendusDeplies \? 'Réduire' : `Voir les \$\{invendusProches\.length\}`/.test(ACCUEIL))
  verifier('et il n’apparaît que s’il y a de quoi déplier',
    /\{invendusCaches > 0 && \(/.test(ACCUEIL))
  verifier('le plafond vient du module, pas d’un chiffre écrit sur l’écran',
    /invendusProches\.slice\(0, INVENDUS_AFFICHES\)/.test(ACCUEIL))

  // 🔴 « ÇA DOIT ENVOYER DIRECTEMENT À HAUTEUR DU DEAL ».
  verifier('🔴 le clic emporte l’identifiant de l’offre',
    /selectionnerCommercant\(commerce, offre\.id\)/.test(ACCUEIL))
  verifier('et l’adresse se compose dans le module',
    /lienVersOffre\(c\.slug, offreId\)/.test(ACCUEIL))
  // ⚠️ UN COMMERCE VITRINE PART SUR LE MODULE RENDEZ-VOUS, qui n'a ni catalogue
  // ni offre à viser : lui coller le paramètre écrirait une adresse morte.
  verifier('le paramètre ne part pas sur une fiche rendez-vous',
    /categorie === 'vitrine'\s*\?\s*`\/commander\/rdv\/\$\{c\.slug\}`/.test(ACCUEIL))

  // 🔴 LA FICHE VA CHERCHER L'OFFRE, et ne se contente pas de charger.
  verifier('🔴 la fiche lit le paramètre',
    /new URLSearchParams\(window\.location\.search\)\.get\(PARAM_OFFRE\)/.test(FICHE))
  // 🔴 ON NE GUETTE PAS L'ÉLÉMENT, C'EST LUI QUI SE SIGNALE. Un `setInterval` de
  // 140 ms a été refusé par le banc de la fiche le 05/09 : « aucun relevé plus
  // rapide que quinze secondes ne doit tourner sans regarder si quelqu'un est
  // là ». La fonction de référence est appelée à l'instant exact où la carte
  // entre dans le document, ce qui supprime le minuteur au lieu de le déguiser.
  verifier('🔴 aucun minuteur ne guette la carte',
    !/setInterval\([\s\S]{0,300}viserOffre/.test(FICHE)
    && /function viserOffre\(id, el\)/.test(FICHE))
  // 🔴 ET ÇA SUPPRIME LA QUESTION DE SÉCURITÉ. Le paramètre n'est plus une CLÉ
  // d'objet — `__proto__` aurait rendu un objet JavaScript au lieu d'un élément
  // — mais une valeur COMPARÉE à l'identifiant d'un deal réellement affiché.
  verifier('🔴 la cible est comparée, jamais utilisée comme clé',
    /String\(offreAttendue\.current\) !== String\(id\)/.test(FICHE)
    && !/offreRefs/.test(FICHE))
  // ⚠️ ET UNE SEULE FOIS : le catalogue se redessine au changement de jour, et
  // la carte se re-signalerait en renvoyant le Yopper en bas de page.
  verifier('🔴 le saut ne se rejoue pas au redessin',
    /offreAttendue\.current = null/.test(FICHE))
  // ⚠️ ON MESURE AVEC `getBoundingClientRect`, PAS `offsetTop` : celui-ci se
  // compte depuis le premier ancêtre POSITIONNÉ, et deviendrait faux le jour où
  // quelqu'un pose un `position: relative` au-dessus, sans que rien ne le dise.
  verifier('🔴 la mesure ne dépend pas d’un ancêtre positionné',
    /el\.getBoundingClientRect\(\)\.top - scroll\.getBoundingClientRect\(\)\.top/.test(FICHE))
  verifier('et la carte du deal porte bien l’ancre',
    /ancre=\{el => viserOffre\(dl\.id, el\)\}/.test(FICHE)
    && /<div ref=\{ancre\}/.test(FICHE))
  // ⚠️ LES DEUX RENDUS DE `DealOfferCard` DOIVENT PORTER L'ANCRE. Les articles
  // sans catégorie sont un second bloc, copié : n'en équiper qu'un aurait rendu
  // le défilement muet pour la moitié des catalogues.
  egal('🔴 les DEUX rendus de la carte portent l’ancre',
    (FICHE.match(/ancre=\{el => viserOffre\(dl\.id, el\)\}/g) || []).length, 2)

  // 🔴 « UNE ICÔNE QUI DEVIENDRAIT UN VISUEL CONNU ANTI GASPI YOPPAA ».
  verifier('🔴 l’icône a UNE seule définition',
    /export default function IconeAntiGaspi/.test(ICONE))
  verifier('et l’accueil comme la fiche la lisent là',
    /import IconeAntiGaspi/.test(ACCUEIL) && /import IconeAntiGaspi/.test(FICHE))
  // ⚠️ ELLE NE SERT QUE L'INVENDU : un deal ordinaire garde sa flamme, sinon les
  // deux redeviennent le même objet, ce qu'Alex a fait corriger le 04/09.
  verifier('🔴 la marque ne coiffe QUE l’invendu',
    /\{invendu \? \([\s\S]{0,600}?<IconeAntiGaspi[\s\S]{0,400}?\) : \([\s\S]{0,500}?Deal du jour/.test(FICHE))
  // ⚠️ LES COULEURS AUSSI VIENNENT DE LÀ : des codes hexadécimaux recopiés sur
  // deux écrans auraient divergé au premier ajustement.
  verifier('les couleurs du module ne sont pas recopiées',
    /COULEUR_ANTI_GASPI, FOND_ANTI_GASPI, BORD_ANTI_GASPI/.test(ACCUEIL))

  // ═══ BANDEAU NUIT, CARTES PAPIER (Alex, 05/09) ══════════════════════════
  //
  // 🔴 CHOISI APRÈS COMPARAISON DE SIX HABITS RENDUS À QUATRE CARTES. C'est la
  // densité réelle qui a tranché : quatre cartes sombres fusionnent en un bloc,
  // quatre cartes claires se fondent dans la page. Le poids va donc sur le
  // TITRE DE SECTION, une seule fois.
  verifier('🔴 le titre de section porte la nuit',
    /background: NUIT_ANTI_GASPI, borderRadius: 12/.test(ACCUEIL))
  // ⚠️ ET LA MARQUE PASSE À L'OR DESSUS : l'ambre de la carte n'y tiendrait pas
  // le contraste.
  verifier('🔴 et la marque passe à l’or sur la nuit',
    /<IconeAntiGaspi taille=\{20\} epaisseur=\{2\.2\} couleur=\{OR_ANTI_GASPI\}\/>/.test(ACCUEIL))
  // ⚠️ LES CARTES, ELLES, RESTENT EN PAPIER. Une seule masse sombre, pas quatre.
  verifier('🔴 la carte reste en papier',
    /background: FOND_ANTI_GASPI, border: `1\.5px solid \$\{BORD_ANTI_GASPI\}`/.test(ACCUEIL))
  egal('🔴 UNE seule masse sombre dans la section, pas une par carte',
    (ACCUEIL.match(/background: NUIT_ANTI_GASPI/g) || []).length, 1)
  // ⚠️ LA MÊME IDÉE À DEUX ÉCHELLES. Sur la fiche il n'y a pas de titre de
  // section : la masse sombre s'y réduit à une pastille, sans quoi le papier se
  // perdrait sur le fond `#F8F6FF` au milieu d'articles blancs.
  verifier('🔴 sur la fiche, la nuit se réduit à une pastille',
    /color: '#fff', background: NUIT_ANTI_GASPI/.test(FICHE))
  verifier('et la carte de la fiche est en papier elle aussi',
    /\? \{ background: FOND_ANTI_GASPI, border: `1\.5px solid \$\{BORD_ANTI_GASPI\}`/.test(FICHE))
  // ⚠️ « TOUT EST PARTI » PRENAIT UNE COULEUR EN DUR. Un deal ordinaire peut
  // porter une quantité : le brun de l'invendu s'affichait alors en sombre sur
  // le violet sombre de sa carte, illisible.
  verifier('🔴 « tout est parti » se lit sur les DEUX habits',
    /color: encreDouce, whiteSpace: 'nowrap' \}\}>Tout est parti/.test(FICHE))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Offre de fin de journée verte.')
