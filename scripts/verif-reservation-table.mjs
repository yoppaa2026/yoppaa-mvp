// Banc de la RÉSERVATION DE TABLE : deux métiers, un seul moteur.
//
// 🔴 CE QUE CE BANC PROTÈGE. `reservation_table` dormait dans `lib/plans.js`
// depuis longtemps, déclarée dans VENDRE et dans `FEATURES_ALIMENTAIRE_ONLY`,
// et lue NULLE PART. Un drapeau écrit, jamais branché. Le risque, en le
// branchant, n'est pas le restaurant : c'est le salon de coiffure qui
// fonctionne aujourd'hui et qui ne doit pas bouger d'un pouce.
//
// ⚠️ D'où la moitié des vérifications ci-dessous : elles disent ce qui ne
// change PAS.

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  fonctionReservation, peutReserver, reservationActive,
  motsReservation, motReservation, ficheDuCommerce, pageReservation,
} from '../lib/reservation-metier.js'
import { getPillsStatut, peut } from '../lib/plans.js'
import { couvertsDe, occupationDe, bornesCouverts, couvertsValides } from '../lib/cours-collectifs.js'
import {
  conflitReservation, genererSlots, finApresMinuit, franchitMinuit,
  creneauHorsOuverture, ajusterPlagePourJour,
} from '../lib/rdv-slots.js'
// ⚠️ DEPUIS `lib/ouverture.js`, PAS DEPUIS LE COMPOSANT : la règle a déménagé
// le 09/09 précisément pour être exécutable ici. Node ne sait pas lire un
// fichier qui contient du JSX, et c'est ainsi qu'elle n'a jamais été mesurée.
import { calculerStatutOuverture, limiteRetraitCeJour } from '../lib/ouverture.js'
// ⚠️ ET DEPUIS LE MODULE BAS pour la règle de minuit : `rdv-slots` la republie,
// mais c'est `deplacement-rdv` qui l'écrit, et c'est là qu'il faut la mesurer.
import { plagesOuverture } from '../lib/deplacement-rdv.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

const RESTO   = { slug: 'chez-test', categorie: 'alimentaire', plan: 'vendre', rdv_actif: true }
const SNACK   = { slug: 'snack',     categorie: 'alimentaire', plan: 'communiquer', rdv_actif: true }
const SALON   = { slug: 'salon',     categorie: 'vitrine',     plan: 'vendre', rdv_actif: true }
const BOUTIQUE = { slug: 'boutique', categorie: 'detail',      plan: 'vendre', rdv_actif: true }

// ═══════════════════════════════════════════════════════════════════════════
// LA FONCTION QUI PORTE LA RÉSERVATION SUIT LE MÉTIER
// ═══════════════════════════════════════════════════════════════════════════
egal('un restaurant réserve des TABLES', fonctionReservation(RESTO), 'reservation_table')
egal('un salon prend des RENDEZ-VOUS', fonctionReservation(SALON), 'rdv')
// ⚠️ Sans catégorie, on est alimentaire : c'est le défaut de `isAlimentaire`,
// et le contraire ferait basculer tout un parc non renseigné sur `rdv`, une
// fonction qui lui serait refusée juste après.
egal('sans catégorie, c’est alimentaire', fonctionReservation({}), 'reservation_table')

// ═══════════════════════════════════════════════════════════════════════════
// LE DROIT : LA MATRICE, PAS UNE RÈGLE RECOPIÉE
// ═══════════════════════════════════════════════════════════════════════════
verifier('🔴 un restaurant en Vendre PEUT réserver ses tables', peutReserver(RESTO))
verifier('🔴 et la matrice le dit aussi directement', peut(RESTO, 'reservation_table'))
verifier('un alimentaire en Communiquer ne peut pas', !peutReserver(SNACK))
verifier('un salon en Vendre le peut toujours', peutReserver(SALON))
// ⚠️ LE DÉTAIL N'A NI L'UN NI L'AUTRE, et c'est voulu : la réservation de
// produit n'existe pas, et on ne promet pas ce qui n'existe pas.
verifier('🔴 une boutique de détail ne réserve rien', !peutReserver(BOUTIQUE))

// ═══════════════════════════════════════════════════════════════════════════
// L'INTERRUPTEUR : LES DEUX CONDITIONS, TOUJOURS
// ═══════════════════════════════════════════════════════════════════════════
verifier('un restaurant qui a allumé réserve', reservationActive(RESTO))
// 🔴 LE DROIT SANS L'INTERRUPTEUR afficherait une réservation chez quelqu'un
// qui n'a jamais ouvert une seule plage.
verifier('🔴 le droit sans l’interrupteur ne suffit pas',
  !reservationActive({ ...RESTO, rdv_actif: false }))
// 🔴 L'INTERRUPTEUR SANS LE DROIT laisserait la réservation allumée après un
// changement de forfait, et le client réserverait dans le vide.
verifier('🔴 l’interrupteur sans le droit non plus',
  !reservationActive({ ...RESTO, plan: 'communiquer' }))
verifier('ni chez un détail qui aurait le drapeau', !reservationActive(BOUTIQUE))

// ═══════════════════════════════════════════════════════════════════════════
// LES MOTS DU MÉTIER
// ═══════════════════════════════════════════════════════════════════════════
egal('un restaurant réserve une table', motReservation(RESTO, 'action'), 'Réserver une table')
egal('un salon prend rendez-vous', motReservation(SALON, 'action'), 'Prendre rendez-vous')
egal('et l’onglet suit', motReservation(RESTO, 'onglet'), 'Réservations')
egal('l’onglet du salon ne bouge pas', motReservation(SALON, 'onglet'), 'Rendez-vous')
// ⚠️ Une clé inconnue rend une chaîne vide, jamais `undefined` : un
// `undefined` s'affiche tel quel dans du JSX et se voit à l'écran.
egal('une clé inconnue ne s’affiche pas', motReservation(RESTO, 'nexistepas'), '')
verifier('les deux jeux de mots ont les mêmes clés',
  JSON.stringify(Object.keys(motsReservation(RESTO)).sort())
  === JSON.stringify(Object.keys(motsReservation(SALON)).sort()))

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 UN RESTAURANT N'A PAS DEUX FICHES, IL EN A UNE
// ═══════════════════════════════════════════════════════════════════════════
egal('la fiche d’un restaurant reste celle des commandes',
  ficheDuCommerce(RESTO), '/commander/chez-test')
egal('celle d’un salon reste son agenda',
  ficheDuCommerce(SALON), '/commander/rdv/salon')
egal('celle d’une boutique est sa boutique',
  ficheDuCommerce(BOUTIQUE), '/commander/boutique')
egal('la réservation d’un restaurant s’atteint quand même',
  pageReservation(RESTO), '/commander/rdv/chez-test')

// ═══════════════════════════════════════════════════════════════════════════
// LES PASTILLES : LA TABLE S'AJOUTE, ELLE NE REMPLACE PAS
// ═══════════════════════════════════════════════════════════════════════════
{
  const cles = (c, opts = {}) => getPillsStatut(c, opts).map(p => p.key)
  const duResto = cles({ ...RESTO, fidelite_actif: false, bons_cadeaux_actif: false })
  verifier('🔴 un restaurant garde sa carte à emporter', duResto.includes('commande'))
  verifier('🔴 et gagne la réservation de table', duResto.includes('table'))
  // ⚠️ CE QUI NE CHANGE PAS : un alimentaire sans le drapeau n'a pas la
  // pastille, et un salon n'a jamais celle de la table.
  verifier('un restaurant qui n’a pas allumé ne l’affiche pas',
    !cles({ ...RESTO, rdv_actif: false }).includes('table'))
  verifier('un alimentaire en Communiquer non plus',
    !cles(SNACK).includes('table'))
  verifier('🔴 et un salon n’a jamais la pastille « table »',
    !cles({ ...SALON, fidelite_actif: false }).includes('table'))
}

// ═══════════════════════════════════════════════════════════════════════════
// LE CÂBLAGE : CE QUI EST BRANCHÉ, ET OÙ
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CES GARDES DISENT QUE LA RÈGLE EST APPELÉE, pas qu'elle est juste : ce
// sont les blocs du dessus qui l'exécutent. Les deux ensemble, jamais l'une
// sans l'autre.
{
  const lire = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
  const FICHE_RDV = lire('app/commander/rdv/[slug]/page.js')
  const FICHE     = lire('app/commander/[slug]/page.js')
  const BORD      = lire('app/dashboard/page.js')
  const CONFIG    = lire('app/dashboard/ConfigDashboard.js')

  verifier('🔴 la page de réservation accepte un restaurant',
    /if \(!isVitrine\(c\) && !reservationActive\(c\)\) \{/.test(FICHE_RDV))
  verifier('⚠️ et renvoie les autres vers leur fiche, pas vers une erreur',
    /router\.replace\(`\/commander\/\$\{slug\}`\)/.test(FICHE_RDV))

  // ── EMPORTER OU S'ASSEOIR : DEUX PARCOURS, PAS UN MÉLANGE (09/09) ───────
  //
  // 🔴 Chez un restaurant qui fait les deux, le client venu réserver une table
  // arrivait sur une carte couverte de boutons « ajouter » : il croyait devoir
  // composer son repas pour obtenir une table.
  verifier('🔴 un restaurant qui fait les deux demande ce qu’on vient faire',
    /const choisitSonParcours = commerceAccepteCommandes && peutPrendreRdv && isAlimentaire\(commercant\)/.test(FICHE)
    && /Que veux-tu faire/.test(FICHE))
  // 🔴 ET LA CARTE NE SE REMPLIT PAS TANT QU'IL N'A PAS DIT. C'est le cœur de
  // la correction : sans ça, le choix ne serait qu'un bandeau de plus.
  verifier('🔴 et la carte se lit sans se remplir avant le choix',
    /const peutCommander = commerceAccepteCommandes && \(!choisitSonParcours \|\| intentionResto === 'emporter'\)/.test(FICHE))
  // ⚠️ CE QUI DÉCRIT LE COMMERCE NE DOIT PAS SUIVRE L'INTENTION DU CLIENT :
  // réclamer l'activation de la commande à qui vient de l'activer ferait douter
  // de tout le reste de l'écran.
  verifier('⚠️ le message « demandez-lui d’activer » lit le COMMERCE',
    /\{!commerceAccepteCommandes && !vitrine && \(/.test(FICHE))
  verifier('⚠️ et le signal Yopper aussi',
    /peutCommander: commerceAccepteCommandes,/.test(FICHE))
  // ⚠️ CHEZ UN SALON, RIEN NE CHANGE : le panier voyage avec le client vers son
  // rendez-vous, et c'est le geste le plus naturel qui soit.
  verifier('⚠️ le bouton qui transporte le panier reste, hors restaurant',
    /\{peutPrendreRdv && !choisitSonParcours && \(\(\) => \{/.test(FICHE)
    && /deposerPanierPourRdv\(commercant\.slug, panier\)/.test(FICHE))
  // 🔴 ET LE CHOIX DISPARAIT DES QU'IL EST FAIT : une question déjà répondue
  // qui reste affichée donne l'impression de n'avoir pas été entendue.
  verifier('🔴 le choix s’efface une fois posé',
    /\{choisitSonParcours && intentionResto === null && \(/.test(FICHE)
    && /Je préfère réserver une table/.test(FICHE))

  verifier('🔴 la fiche du restaurant mène à sa réservation',
    /const peutPrendreRdv = reservationActive\(commercant\)/.test(FICHE))
  verifier('et le bouton porte le mot du métier',
    /motReservation\(commercant, 'action'\)/.test(FICHE))

  verifier('🔴 l’onglet du tableau de bord s’ouvre au restaurant',
    (BORD.match(/visible: !!commercant\?\.rdv_actif \|\| peutReserver\(commercant\)/g) || []).length === 2)
  verifier('et il porte le mot du métier',
    /label: motReservation\(commercant, 'onglet'\)/.test(BORD))
  verifier('🔴 la vitrine en dur a bien disparu des deux onglets',
    !/categorie === 'vitrine' && canDo\(planEffectif\(commercant\), 'rdv'\)/.test(BORD))

  // ⚠️ ON VISE LA DÉFINITION, PAS LA CONDITION D'AFFICHAGE (09/09). Les
  // interrupteurs ont été regroupés dans un bloc unique et la condition a migré
  // dans une variable : une garde qui décrit la forme d'hier interdit celle de
  // demain, et rougit sur un code juste.
  // 🔴 ET L'ONGLET OÙ IL DÉCLARE SES TABLES (09/09). Son `feature` valait
  // `rdv`, que la matrice réserve à la vitrine : un restaurant pouvait allumer
  // sa réservation dans le Profil et n'avait ensuite AUCUN écran pour déclarer
  // ses services. Le réglage existait, la porte était fermée.
  verifier('🔴 l’onglet de réglage s’ouvre au restaurant',
    /\{ id: 'rdv', label: motReservation\(commercant, 'onglet'\), icon: 'calendar', feature: fonctionReservation\(commercant\) \}/.test(CONFIG))
  verifier('⚠️ et le libellé « Prise de RDV » en dur a disparu',
    !/label: 'Prise de RDV'/.test(CONFIG))
  // 🔴 ET SON CONTENU AUSSI. Deux gardes pour une seule porte, et elles
  // disaient le contraire : la barre s'ouvrait, l'écran restait blanc. Le
  // restaurateur cliquait sur « Réservations » et ne trouvait rien, sans un mot
  // pour dire pourquoi.
  verifier('🔴 le CONTENU de l’onglet s’ouvre au restaurant',
    /const peutRdv\s+= peutReserver\(commercant\)/.test(CONFIG))
  // ⚠️ CE QUI RESTE FERMÉ, ET C'EST VOULU : remiser une « table » dans les
  // deals ou vendre un carnet de tables n'a aucun sens. Ces deux contrôles-là
  // gardent `rdv`, et les toucher aurait été « corriger » ce qui marche.
  verifier('⚠️ les deals ne proposent pas de remiser une table',
    /if \(!peut\(commercant, 'rdv'\)\) \{ setPrestations\(\[\]\); return \}/.test(CONFIG))
  verifier('⚠️ et on ne vend pas de carnet de tables',
    /const peutAbonnements = peut\(commercant, 'rdv'\)/.test(CONFIG))

  verifier('🔴 l’interrupteur s’ouvre au restaurant',
    /const aResa\s+= peutReserver\(form\)/.test(CONFIG)
    && /\{aResa && \(/.test(CONFIG))

  // ── LE COMMERÇANT DÉCLARE SA SALLE ──────────────────────────────────────
  //
  // Sans cet écran, `par_couverts` n'était réglable qu'en SQL : la colonne
  // existait, le client pouvait choisir ses couverts, et personne ne pouvait
  // dire à Yoppaa que la prestation était une table.
  verifier('la case « c’est une table » existe',
    /C&rsquo;est une table, pas une place/.test(CONFIG))
  // ⚠️ SEULEMENT CHEZ UN ALIMENTAIRE QUI Y A DROIT : ailleurs, elle n'aurait
  // aucun sens et ferait douter le commerçant de ce qu'il lit.
  verifier('⚠️ et seulement chez un alimentaire qui y a droit',
    /const estTable = isAlimentaire\(commercant\) && peutReserver\(commercant\)/.test(CONFIG)
    && /\{estTable && \(/.test(CONFIG))
  // 🔴 LE SERVEUR DE CET ÉCRAN, C'EST LA SAUVEGARDE : décocher la catégorie ne
  // doit pas laisser une prestation en mode table dans un salon de coiffure.
  verifier('🔴 le drapeau ne se pose jamais hors de l’alimentaire',
    /par_couverts: estTable \? !!form\.par_couverts : false,/.test(CONFIG))
  // ⚠️ VIDE VAUT NULL, PAS ZÉRO. Une borne à zéro passe la contrainte de base
  // et proposerait « 0 personne » au client.
  verifier('⚠️ une borne vide vaut null, jamais zéro',
    /couverts_min: estTable && form\.par_couverts && form\.couverts_min !== '' \? Number\(form\.couverts_min\) : null,/.test(CONFIG)
    && /couverts_max: estTable && form\.par_couverts && form\.couverts_max !== '' \? Number\(form\.couverts_max\) : null,/.test(CONFIG))
  verifier('et le libellé de la capacité suit le métier',
    /form\.par_couverts \? 'Couverts en salle sur un service' : 'Personnes par créneau'/.test(CONFIG))
  // ⚠️ SANS L'APOSTROPHE : le texte est passé en propriété JavaScript depuis le
  // regroupement des interrupteurs, donc il porte une vraie apostrophe et non
  // l'entité `&rsquo;` du JSX. Viser la phrase, pas son encodage.
  verifier('et il rassure sur la carte à emporter',
    /ajoute à ta fiche, elle ne la remplace pas/.test(CONFIG))
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 COMPTER DES COUVERTS, PAS DES LIGNES
// ═══════════════════════════════════════════════════════════════════════════
//
// Une table, c'est UNE réservation pour QUATRE personnes. Le moteur comptait
// des lignes : une salle de vingt couverts aurait accepté vingt tables.
//
// ⚠️ ET LA MOITIÉ DE CE BLOC DIT CE QUI NE CHANGE PAS. `couverts` vaut 1 par
// défaut et `par_couverts` vaut faux partout : pour un cours, la somme des
// couverts EST le compte des lignes.
{
  const TABLE = { id: 'p-table', capacite: 20, par_couverts: true, couverts_min: 1, couverts_max: 8, duree_minutes: 120 }
  const COURS = { id: 'p-yoga', capacite: 12, duree_minutes: 60 }

  egal('une réservation sans couverts en vaut un', couvertsDe({}), 1)
  egal('une valeur absurde en vaut un aussi', couvertsDe({ couverts: -3 }), 1)
  egal('quatre couverts en valent quatre', couvertsDe({ couverts: 4 }), 4)

  // 🔴 LE CŒUR : deux modes de comptage sur le même moteur.
  const trois = [{ couverts: 4 }, { couverts: 2 }, { couverts: 6 }]
  egal('🔴 une salle compte ses COUVERTS', occupationDe(TABLE, trois), 12)
  egal('🔴 un cours compte ses LIGNES', occupationDe(COURS, trois), 3)
  // ⚠️ LA GARANTIE DE NON-RÉGRESSION, dite en une ligne : sans le drapeau, un
  // enregistrement portant des couverts compte quand même pour un.
  egal('⚠️ sans le drapeau, rien ne change', occupationDe({ capacite: 12 }, trois), 3)

  // Les bornes du « pour combien de personnes ? »
  egal('les bornes déclarées sont respectées', bornesCouverts(TABLE), { min: 1, max: 8 })
  // 🔴 JAMAIS AU-DELÀ DE LA CAPACITÉ : proposer des tables de douze dans une
  // salle de huit, c'est laisser le client aller au bout pour lire « complet ».
  egal('🔴 le maximum ne dépasse jamais la salle',
    bornesCouverts({ capacite: 6, par_couverts: true, couverts_max: 12 }), { min: 1, max: 6 })
  egal('sans maximum déclaré, c’est la salle', bornesCouverts({ capacite: 30, par_couverts: true }), { min: 1, max: 30 })
  egal('un minimum de deux est tenu',
    bornesCouverts({ capacite: 20, par_couverts: true, couverts_min: 2, couverts_max: 8 }), { min: 2, max: 8 })

  egal('un nombre dans les bornes passe', couvertsValides(TABLE, 4), 4)
  egal('🔴 au-delà du maximum, refusé', couvertsValides(TABLE, 9), null)
  egal('🔴 en dessous du minimum, refusé',
    couvertsValides({ ...TABLE, couverts_min: 2 }, 1), null)
  egal('une saisie qui n’est pas un nombre est refusée', couvertsValides(TABLE, 'quatre'), null)
  // ⚠️ Un cours ne demande jamais de couverts : il en vaut toujours un.
  egal('⚠️ un cours vaut toujours un', couvertsValides(COURS, 8), 1)

  // ── LE COMPTAGE DANS LE MOTEUR ─────────────────────────────────────────
  const conflit = (opts) => conflitReservation({
    debut: 1200, fin: 1320, prestationId: 'p-table', capacite: 20, parCouverts: true, ...opts,
  })

  // 🔴 DEUX TABLES NE SONT PAS DEUX SÉANCES. Une à 20h00, une à 20h30 : elles
  // coexistent. Avec l'égalité stricte des bornes, la seconde était refusée
  // pour « occupation » et un restaurant n'aurait pris qu'une table par heure.
  const chevauche = conflit({
    couvertsDemandes: 4,
    reservations: [{ start: 1230, end: 1350, prestation_id: 'p-table', couverts: 4, place_no: 1 }],
  })
  verifier('🔴 une table qui chevauche une autre n’est PAS un conflit', !chevauche.conflit)
  egal('et la salle compte bien quatre couverts pris', chevauche.inscrits, 4)

  // La jauge, en couverts.
  const presque = [
    { start: 1200, end: 1320, prestation_id: 'p-table', couverts: 8, place_no: 1 },
    { start: 1230, end: 1350, prestation_id: 'p-table', couverts: 10, place_no: 1 },
  ]
  verifier('une table de deux entre dans les deux qui restent',
    !conflit({ couvertsDemandes: 2, reservations: presque }).conflit)
  // 🔴 CE QU'ON DEMANDE COMPTE AUSSI : une salle où il reste deux couverts
  // n'est pas « libre », elle l'est pour deux personnes.
  verifier('🔴 une table de six ne rentre pas dans deux places',
    conflit({ couvertsDemandes: 6, reservations: presque }).conflit)
  egal('et le refus dit « complet »',
    conflit({ couvertsDemandes: 6, reservations: presque }).raison, 'complet')

  // ⚠️ ET LE COURS NE BOUGE PAS D'UN POUCE.
  const seance = (n) => Array.from({ length: n }, (_, i) => ({
    start: 600, end: 660, prestation_id: 'p-yoga', couverts: 1, place_no: i + 1,
  }))
  const coursConflit = (opts) => conflitReservation({
    debut: 600, fin: 660, prestationId: 'p-yoga', capacite: 12, ...opts,
  })
  verifier('⚠️ un cours à onze inscrits accepte la douzième',
    !coursConflit({ reservations: seance(11) }).conflit)
  verifier('⚠️ et refuse la treizième', coursConflit({ reservations: seance(12) }).conflit)
  egal('⚠️ et il compte toujours ses inscrits',
    coursConflit({ reservations: seance(5) }).inscrits, 5)
  // 🔴 UN COURS DÉCALÉ RESTE BLOQUANT : c'est la règle d'origine, et elle ne
  // doit surtout pas hériter de la tolérance des tables.
  verifier('🔴 un cours qui chevauche sans coïncider bloque toujours',
    coursConflit({ reservations: [{ start: 630, end: 690, prestation_id: 'p-yoga', place_no: 1 }] }).conflit)
}

// ═══════════════════════════════════════════════════════════════════════════
// LE SERVEUR COMPTE LA SALLE, L'ÉCRAN NE FAIT QUE PROPOSER
// ═══════════════════════════════════════════════════════════════════════════
{
  const SRV = sansProse(readFileSync(new URL('../lib/rdv-creation-server.js', import.meta.url), 'utf8'))
  verifier('🔴 le serveur valide le nombre de couverts',
    /couvertsRetenus = couvertsValides\(prestation, champs\?\.couverts\)/.test(SRV)
    && /if \(couvertsRetenus === null\) return \{ ok: false, code: 'couverts_invalides' \}/.test(SRV))
  verifier('🔴 et il compte la salle lui-même',
    /if \(occupes \+ couvertsRetenus > capacite\)/.test(SRV))
  // ⚠️ LES CHEVAUCHEMENTS, PAS L'ÉGALITÉ D'HEURE : sinon un service entier
  // décalé d'une demi-heure passe à travers.
  verifier('🔴 en comptant les chevauchements, pas les heures identiques',
    /debutMin < timeToMinutes\(r\.heure_fin\) && finMin > timeToMinutes\(r\.heure_debut\)/.test(SRV))
  // 🔴 APRÈS `champs`, sinon un appelant impose son propre nombre et contourne
  // toute la validation qu'on vient de faire.
  verifier('🔴 le module impose sa valeur, l’appelant ne l’écrase pas',
    /place_no: placeNo,\s*couverts: couvertsRetenus,/.test(SRV))

  const ROUTE = sansProse(readFileSync(new URL('../app/api/rdv/reserver/route.js', import.meta.url), 'utf8'))
  verifier('la route lit le nombre de personnes', /couverts = 1,/.test(ROUTE))
  verifier('🔴 et une salle pleine dit COMBIEN il reste',
    /Il ne reste que \$\{res\.restants\}/.test(ROUTE))

  // ── LE TUNNEL ──────────────────────────────────────────────────────────
  const TUNNEL = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('le tunnel demande pour combien de personnes',
    /\{estParCouverts\(prestationChoisie\) && \(\(\) => \{/.test(TUNNEL)
    && /Nous serons/.test(TUNNEL))
  // 🔴 AVANT LE CHOIX DU JOUR, et ce n'est pas cosmétique : la taille de la
  // table décide de ce qui reste ouvert. Demander l'heure d'abord ferait
  // proposer 20h à une table de six dans une salle où il reste deux couverts.
  verifier('🔴 et il le demande AVANT le choix du jour',
    TUNNEL.indexOf('Nous serons') < TUNNEL.indexOf('Je viens le'))
  // ⚠️ ON DIT QUOI FAIRE, pas seulement la borne.
  verifier('⚠️ au-delà du maximum, on donne une sortie',
    /les grandes tablées se réservent de vive voix/.test(TUNNEL))
  verifier('🔴 les deux grilles comptent en couverts',
    (TUNNEL.match(/parCouverts: estParCouverts\(prestationChoisie\)/g) || []).length === 2
    && (TUNNEL.match(/couvertsDemandes: couverts/g) || []).length === 2)
  // 🔴 LES TROIS ENVOIS, pas deux : le paiement d'acompte, le bon cadeau et la
  // réservation directe passent par des chemins différents, et un seul oublié
  // écrirait une table d'une personne pour un groupe de six.
  //
  // ⚠️ `[^\n]*` ET NON `\s*` : `sansProse` ne retire QUE les commentaires en
  // début de ligne, jamais ceux de fin, parce qu'une URL porte deux barres
  // obliques et qu'un dépouilleur trop zélé mangerait le code. Un de ces trois
  // envois traîne un « // null = Sans préférence » qui a fait rougir cette
  // garde alors que le code était juste.
  verifier('🔴 les trois envois portent le nombre de personnes',
    (TUNNEL.match(/praticien_id: praticienChoisi\?\.id \|\| null,[^\n]*\s*couverts,/g) || []).length === 3)
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 UNE JOURNÉE QUI FINIT APRÈS MINUIT (09/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// Trouvé sur les VRAIES heures du restaurant qu'Alex démarche : une brasserie
// ouverte de 09:00 à 00:00, et jusqu'à 02:00 le vendredi et le samedi.
//
// 🔴 EN MINUTES, LA FERMETURE TOMBAIT AVANT L'OUVERTURE. `02:00` vaut 120,
// `14:00` en vaut 840 : le clip ramenait la fin de journée à deux heures du
// matin, et la boucle des créneaux ne tournait pas une fois. SIX JOURS SUR SEPT
// étaient muets, sans une seule erreur pour le dire. Et `00:00` est le pire des
// cas parce que c'est le plus fréquent : il vaut ZÉRO.
{
  egal('une journée ordinaire ne bouge pas', finApresMinuit(540, 1080), 1080)
  egal('🔴 une fermeture à 02:00 se compte après l’ouverture', finApresMinuit(840, 120), 1560)
  egal('🔴 et « minuit » aussi, qui vaut zéro', finApresMinuit(540, 0), 1440)
  // ⚠️ ÉGALITÉ COMPRISE : 09:00-09:00 veut dire vingt-quatre heures, pas zéro.
  egal('⚠️ une fermeture à l’heure d’ouverture fait le tour', finApresMinuit(540, 540), 1980)
  verifier('franchitMinuit ne juge pas ce qu’il ne sait pas',
    !franchitMinuit(null, 120) && !franchitMinuit(540, null))

  // Les VRAIES heures du Bistrologue, et ses deux services de cuisine.
  const BAR = {
    mardi:    { ouvert: true, debut: '09:00', fin: '00:00' },
    vendredi: { ouvert: true, debut: '09:00', fin: '02:00' },
    samedi:   { ouvert: true, debut: '14:00', fin: '02:00' },
    dimanche: { ouvert: true, debut: '10:00', fin: '23:00' },
    lundi:    { ouvert: false },
  }
  const TABLE_SOIR = { id: 'p-soir', capacite: 40, par_couverts: true, duree_minutes: 120 }
  const PLAGE_SOIR = [{ id: 'k-soir', jour_semaine: 'mardi', date_specifique: null, heure_debut: '18:00', heure_fin: '23:00', actif: true, pas_minutes: 30 }]

  const slotsMardi = genererSlots({
    dateChoisie: new Date('2026-09-15T12:00:00'), // un mardi
    dureeMinutes: 120, creneaux: PLAGE_SOIR, reservations: [],
    horairesDetail: BAR, capacite: 40, prestationId: 'p-soir',
    parCouverts: true, couvertsDemandes: 2,
  })
  verifier('🔴 un bar qui ferme à minuit propose enfin ses créneaux', slotsMardi.length > 0)
  egal('et la dernière arrivée tombe à 21:00',
    slotsMardi.filter(s => !s.pris).map(s => s.heure).pop(), '21:00')

  const PLAGE_SAM = [{ ...PLAGE_SOIR[0], id: 'k-sam', jour_semaine: 'samedi', heure_fin: '23:30' }]
  const slotsSamedi = genererSlots({
    dateChoisie: new Date('2026-09-19T12:00:00'), // un samedi
    dureeMinutes: 120, creneaux: PLAGE_SAM, reservations: [],
    horairesDetail: BAR, capacite: 40, prestationId: 'p-soir',
    parCouverts: true, couvertsDemandes: 2,
  })
  verifier('🔴 un bar qui ferme à 02:00 aussi', slotsSamedi.length > 0)

  // ⚠️ ET LE JOUR FERMÉ RESTE FERMÉ : la correction ne doit pas ouvrir ce qui
  // était clos.
  const PLAGE_LUN = [{ ...PLAGE_SOIR[0], id: 'k-lun', jour_semaine: 'lundi' }]
  egal('⚠️ le lundi fermé n’a toujours aucun créneau',
    genererSlots({
      dateChoisie: new Date('2026-09-14T12:00:00'), // un lundi
      dureeMinutes: 120, creneaux: PLAGE_LUN, reservations: [],
      horairesDetail: BAR, capacite: 40, prestationId: 'p-soir',
    }).length, 0)

  // L'alerte du tableau de bord, et la copie de plages : mêmes horaires, même
  // piège. Une alerte qui se déclenche sur TOUT ne protège plus rien.
  verifier('🔴 une plage du soir n’est plus « hors horaires » chez un bar de nuit',
    creneauHorsOuverture({ jour: 'samedi', heureDebut: '18:00', heureFin: '23:30', horairesDetail: BAR }) === null)
  egal('🔴 et la copie vers ce jour-là ne la rabote plus',
    ajusterPlagePourJour({ heure_debut: '18:00', heure_fin: '23:30' }, BAR.samedi).statut, 'inchangee')
  // ⚠️ CE QUI RESTE REFUSÉ : un créneau vraiment hors des heures.
  verifier('⚠️ un créneau du matin reste refusé un samedi qui ouvre à 14:00',
    creneauHorsOuverture({ jour: 'samedi', heureDebut: '09:00', heureFin: '10:00', horairesDetail: BAR })?.raison === 'hors_ouverture')

  // 🔴 « OUVERT OU FERMÉ » SE CALCULAIT ENCORE À TROIS AUTRES ENDROITS.
  //
  // Alex, capture à l'appui : « Fermé · ouvre demain à 09:00 » à 11h20, sur un
  // commerce ouvert de 09:00 à 00:00. J'avais corrigé CINQ endroits le matin
  // même, tous dans le moteur de rendez-vous et ses écrans, et j'ai cherché les
  // frères là où je venais de travailler. Ceux-ci vivent dans le statut de la
  // liste, la pastille de la fiche et la limite de commande du jour : trois
  // modules que la réservation ne touche jamais.
  //
  // ⚠️ CHERCHER LES FRÈRES, C'EST BALAYER LE DÉPÔT, PAS LE DOSSIER OÙ L'ON EST.
  {
    const BRASSERIE = {
      mercredi: { ouvert: true, debut: '09:00', fin: '00:00' },
      vendredi: { ouvert: true, debut: '09:00', fin: '02:00' },
      samedi:   { ouvert: true, debut: '14:00', fin: '02:00' },
    }
    // 🔴 LE FUSEAU EST ÉCRIT, ET C'EST OBLIGATOIRE. Une date sans décalage vaut
    // l'heure LOCALE de la machine : sur mon poste elle disait 01:00 belge, sur
    // l'intégration continue elle disait 01:00 UTC, c'est-à-dire 03:00 à
    // Bruxelles, après la fermeture. La garde passait ici et rougissait
    // là-bas, sur un code identique. En septembre la Belgique est à UTC+2.
    const belge = (iso) => new Date(`${iso}+02:00`)

    // Mercredi 11h20, exactement la capture d'Alex.
    egal('🔴 à 11h20, une brasserie ouverte jusqu’à minuit est OUVERTE',
      calculerStatutOuverture(BRASSERIE, belge('2026-09-16T11:20:00'))?.etat, 'ouvert')
    // ⚠️ ET LA NUIT D'AVANT COMPTE : samedi 01h00, c'est le vendredi qui court.
    egal('🔴 à une heure du matin, c’est la veille qui est encore ouverte',
      calculerStatutOuverture(BRASSERIE, belge('2026-09-19T01:00:00'))?.etat, 'ouvert')
    // ⚠️ CE QUI RESTE FERMÉ : mercredi 03h00, la nuit de mardi n'existe pas.
    verifier('⚠️ à trois heures du matin un mercredi, c’est bien fermé',
      calculerStatutOuverture(BRASSERIE, belge('2026-09-16T03:00:00'))?.etat !== 'ouvert')

    // La limite de commande du jour : elle triait des CHAÎNES.
    egal('🔴 la limite de commande ne retombe plus à zéro à minuit',
      limiteRetraitCeJour(BRASSERIE, 'mercredi', 0), 1440)
    egal('🔴 ni avant l’ouverture chez un bar de nuit',
      limiteRetraitCeJour(BRASSERIE, 'vendredi', 0), 1560)
    // 🔴 ET AVEC DEUX SERVICES, C'EST LA FIN LA PLUS TARDIVE. Sans ce cas, une
    // garde ne distingue pas « la plus grande » de « la plus petite » : ma
    // première version avait trois commerces à une seule plage, et la mutation
    // qui remplaçait le maximum par le minimum passait sans être vue.
    const DEUX_SERVICES = {
      jeudi: { ouvert: true, debut: '12:00', fin: '14:30', debut2: '18:00', fin2: '00:00' },
    }
    egal('🔴 avec deux services, la limite est celle du SOIR',
      limiteRetraitCeJour(DEUX_SERVICES, 'jeudi', 0), 1440)
    egal('⚠️ et sans minuit, elle reste la fin du second service',
      limiteRetraitCeJour({ jeudi: { ouvert: true, debut: '12:00', fin: '14:30', debut2: '18:00', fin2: '22:00' } }, 'jeudi', 0), 1320)

    // ⚠️ UNE JOURNÉE ORDINAIRE NE BOUGE PAS, et c'est la moitié qui compte.
    egal('⚠️ une boulangerie 07:00-18:00 garde sa limite',
      limiteRetraitCeJour({ lundi: { ouvert: true, debut: '07:00', fin: '18:00' } }, 'lundi', 0), 1080)
    egal('⚠️ et la marge de préparation se retranche toujours',
      limiteRetraitCeJour({ lundi: { ouvert: true, debut: '07:00', fin: '18:00' } }, 'lundi', 2), 960)

    const LISTE = sansProse(readFileSync(new URL('../app/commander/page.js', import.meta.url), 'utf8'))
    verifier('🔴 le statut de la liste connaît minuit',
      /const finMin = \(d, f\) => finApresMinuit\(heureEnMinutes\(d\), heureEnMinutes\(f\)\)/.test(LISTE)
      && /nowMin >= heureEnMinutes\(d\) && nowMin < finMin\(d, f\)/.test(LISTE))
  }

  // Les trois écrans qui refaisaient ce calcul à la main.
  const TUNNEL2 = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  const AGENDA = sansProse(readFileSync(new URL('../app/dashboard/AgendaRdv.js', import.meta.url), 'utf8'))
  verifier('🔴 le contrôle final du tunnel connaît minuit',
    /plagesShop\.push\(\[a1, finApresMinuit\(a1, timeToMinutes\(horaireJour\.fin\)\)\]\)/.test(TUNNEL2))
  verifier('🔴 et la grille de l’agenda aussi',
    (AGENDA.match(/finApresMinuit\(/g) || []).length >= 3)

  // 🔴 LE DERNIER MAILLON, ET LE SEUL QUI BLOQUAIT VRAIMENT (Alex, 09/09,
  // en production, une heure avant sa démonstration : « Bug, impossible de
  // finaliser une résa »).
  //
  // La grille proposait 19:30, le client le choisissait, remplissait tout le
  // formulaire, et LE SERVEUR le refusait. Cinq écrans savaient lire une
  // fermeture à minuit ; la route qui décide, non. Le message ne portait même
  // pas les mêmes mots que celui de l'écran, et c'est ce qui l'a trahi.
  //
  // ⚠️ ON EXÉCUTE, on ne cherche pas le nom de la fonction : c'est le
  // RÉSULTAT qui compte, et une garde qui lirait `finApresMinuit` dans le
  // fichier resterait verte devant un `>` inversé.
  const ROUTE = sansProse(readFileSync(new URL('../app/api/rdv/reserver/route.js', import.meta.url), 'utf8'))
  verifier('🔴 le serveur qui pose le rendez-vous connaît minuit lui aussi',
    /finMin <= finApresMinuit\(ouvre, timeToMinutes\(f\)\)/.test(ROUTE))

  // Et la règle elle-même, exécutée sur le cas d'Alex : Le Bistrologue ouvre
  // à 09:00 et ferme à 00:00 ; une table à 19:30 pour 90 minutes finit à 21:00.
  const soir = plagesOuverture({ debut: '09:00', fin: '00:00' })
  verifier('🔴 une brasserie 09:00-00:00 rend UNE plage, pas zéro',
    soir.length === 1 && soir[0][0] === 540 && soir[0][1] === 1440)
  verifier('🔴 et une table à 19:30 pour 90 min y tient',
    soir.some(([a, b]) => 1170 >= a && 1260 <= b))
  // ⚠️ CE QUI DOIT ENCORE ÊTRE REFUSÉ : la garde ne sert à rien si elle accepte
  // tout. Une table à 08:00 tombe avant l'ouverture.
  verifier('⚠️ mais une table à 08:00 reste refusée',
    !soir.some(([a, b]) => 480 >= a && 570 <= b))
  // ⚠️ ET LA GARDE ÉTAIT MUETTE, pas seulement fausse : `b > a` JETAIT la plage,
  // la liste rendue était vide, et l'appelant qui teste `length > 0` ne
  // vérifiait plus rien du tout chez toute brasserie.
  verifier('🔴 une fermeture à 02:00 ne vide pas la liste non plus',
    plagesOuverture({ debut: '18:00', fin: '02:00' }).length === 1)
  verifier('⚠️ et un jour fermé rend toujours zéro plage',
    plagesOuverture({ ouvert: false, debut: '09:00', fin: '00:00' }).length === 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// LE VOCABULAIRE DES EMAILS ET DES NOTIFICATIONS (09/09, le soir)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 UN ÉCRAN SE REFERME, UN EMAIL RESTE. L'après-midi avait corrigé l'écran de
// confirmation ; le client d'un restaurant recevait toujours « Ton RDV est
// confirmé » dans sa boîte, et le relisait la veille du repas.
//
// ⚠️ ON EXÉCUTE LES GABARITS, on ne cherche pas un mot dans le fichier. Un
// gabarit qui compose son HTML par concaténation peut porter le bon libellé
// dans une branche jamais atteinte : seule la sortie fait foi.
{
  const {
    emailRdvConfirme, emailRdvAnnule, emailRdvNoShow, emailRdvReminder,
    emailNouveauRdvCommercant, emailRecapRdvJour,
  } = await import('../lib/resend.js')
  const { texteAlerteRdv } = await import('../lib/alerte-rdv.js')
  const { libelleRetrait } = await import('../lib/libelle-retrait.js')
  const { libelleAutresRecompenses } = await import('../lib/fidelite-recompense.js')

  const socle = {
    yopper_prenom: 'Camille', commercant_nom: 'Le Bistrologue', commercant_slug: 'bistrologue',
    nom_commercant: 'Le Bistrologue',
    prestation_nom: 'Table de 4', date_rdv: '2026-09-12', heure_debut: '19:30:00',
    heure_fin: '21:30:00', duree_minutes: 120, numero_rdv: 'RV42',
    date_jour: '2026-09-12', rdvs: [],
  }
  const GABARITS = [
    ['confirmation', emailRdvConfirme],
    ['annulation', emailRdvAnnule],
    ['non honoré', emailRdvNoShow],
    ['rappel de la veille', emailRdvReminder],
    ['alerte au commerçant', emailNouveauRdvCommercant],
    ['récapitulatif du matin', emailRecapRdvJour],
  ]

  // ⚠️ « rendez-vous » ET « RDV » : le second est celui qu'on oublie, parce
  // qu'il ne ressemble pas au premier.
  //
  // 🔴 ET ON NE LIT QUE LE TEXTE, JAMAIS LE BALISAGE. Ma première version a
  // rougi sur `href="/commander/rdv/bistrologue"` : une URL technique, que
  // personne ne lit, et que personne ne doit renommer. Une garde qui mesure la
  // FORME du fichier au lieu du texte VU accuse du code juste, et on finit par
  // l'éteindre. On retire donc les balises avant de chercher.
  const texteVu = (html) => String(html || '').replace(/<[^>]*>/g, ' ')
  const parleRdv = (html) => /rendez-vous|\bRDV\b/i.test(texteVu(html))

  for (const [nom, gabarit] of GABARITS) {
    const chezResto = gabarit({ ...socle, commercant_categorie: 'alimentaire' })
    verifier(`🔴 l’email « ${nom} » ne parle plus de rendez-vous à un restaurant`,
      !parleRdv(chezResto),
      (texteVu(chezResto).match(/.{0,45}(rendez-vous|\bRDV\b).{0,45}/i) || [''])[0].replace(/\s+/g, ' ').trim())

    // ⚠️ ET LE SALON NE BOUGE PAS D'UN MOT. C'est la moitié qui compte : le parc
    // existant reçoit ces emails tous les jours.
    const chezSalon = gabarit({ ...socle, commercant_categorie: 'vitrine' })
    verifier(`⚠️ et « ${nom} » dit toujours rendez-vous à un salon`, parleRdv(chezSalon))

    // 🔴 SANS CATÉGORIE, RIEN NE CHANGE. Un email qui part avant que la colonne
    // soit jointe doit rendre EXACTEMENT ce qu'il rendait avant.
    verifier(`🔴 « ${nom} » sans catégorie reste identique au salon`,
      String(gabarit({ ...socle })) === String(chezSalon))
  }

  // 🔴 ET LE CÂBLAGE, PAS SEULEMENT LES GABARITS. Mesuré par mutation : couper
  // `commercant_categorie` dans la route du rappel laissait TOUT vert, parce
  // que les gardes du dessus appellent les gabarits directement. Un gabarit
  // juste qu'aucune route n'alimente rend exactement le texte d'avant, en
  // silence — c'est le défaut du 09/09 en plus petit.
  //
  // ⚠️ LES DEUX BOUTS : la colonne doit être CHARGÉE (sinon elle vaut
  // `undefined`) et PASSÉE (sinon le gabarit ne la voit pas). En manquer un
  // suffit à rendre l'autre inutile.
  for (const [chemin, quoi] of [
    ['app/api/emails/rdv-confirme/route.js', 'la confirmation'],
    ['app/api/emails/rdv-annule/route.js', 'l’annulation'],
    ['app/api/emails/rdv-no-show/route.js', 'le non-honoré'],
    ['app/api/cron/rdv-reminder-9h/route.js', 'le rappel de la veille'],
    ['app/api/cron/recap-jour-8h/route.js', 'le récapitulatif du matin'],
  ]) {
    const src = sansProse(readFileSync(new URL('../' + chemin, import.meta.url), 'utf8'))
    verifier(`🔴 ${quoi} CHARGE la catégorie du commerçant`,
      /commercants\([^)]*\bcategorie\b[^)]*\)/.test(src) || /select\([^)]*\bcategorie\b/.test(src), chemin)
    // ⚠️ ON CAPTURE LA VALEUR, ON NE LA NIE PAS. Ma première écriture disait
    // `commercant_categorie\s*:\s*(?!null\b)` et se faisait CONTOURNER PAR LE
    // RETOUR ARRIÈRE : devant `commercant_categorie:    null`, le moteur cède
    // un espace au `\s*`, l'anticipation négative tombe alors sur une espace au
    // lieu de « null », et la garde verdissait sur exactement ce qu'elle
    // interdisait. Mesuré par mutation, pas deviné.
    const valeurs = [...src.matchAll(/commercant_categorie\s*:\s*([^,\n]+)/g)].map(m => m[1].trim())
    verifier(`🔴 et ${quoi} la PASSE au gabarit`,
      valeurs.length > 0 && valeurs.some(v => v !== 'null' && v !== 'undefined'),
      `${chemin} → ${valeurs.join(' | ') || 'aucune'}`)
  }

  // ─── LE RÉCAPITULATIF DU MATIN, COMBINÉ (arbitrage d'Alex, 09/09) ────────
  //
  // 🔴 UN RESTAURANT A UNE SALLE ET UN COMPTOIR, et le cron n'en voyait qu'un :
  // il aiguillait sur la seule CATÉGORIE. Le Bistrologue aurait lu « Aucune
  // commande aujourd'hui » un matin où trente couverts l'attendaient le soir.
  const { emailRecapCommandesJour } = await import('../lib/resend.js')
  const journee = {
    nom_commercant: 'Le Bistrologue', date_jour: '2026-09-12',
    commandes: [], bons_vendus: [], commercant_categorie: 'alimentaire',
  }
  const tablesDuSoir = [
    { heure_debut: '19:30:00', couverts: 4, yopper_prenom: 'Camille', prestation_nom: 'Table de 4' },
    { heure_debut: '20:00:00', couverts: 2, yopper_prenom: 'Sacha', prestation_nom: 'Table de 2' },
  ]

  // ⚠️ ON COMPTE LES COUVERTS, PAS LES LIGNES. « 2 réservations » ne dit rien à
  // un restaurateur ; « 6 couverts » lui dit s'il sort quelqu'un en cuisine.
  const avecSalle = emailRecapCommandesJour({ ...journee, rdvs: tablesDuSoir })
  verifier('🔴 le récapitulatif du matin annonce les COUVERTS, pas les lignes',
    /6 couverts/.test(texteVu(avecSalle)), (texteVu(avecSalle).match(/.{0,30}couvert.{0,30}/) || [''])[0])
  verifier('⚠️ et il nomme les deux tables du soir',
    /19:30/.test(avecSalle) && /20:00/.test(avecSalle) && /Camille/.test(avecSalle))

  // 🔴 `null` ET `[]` NE DISENT PAS LA MÊME CHOSE. Une boulangerie qui n'a
  // jamais eu de salle ne doit pas lire « Aucune table réservée » : la section
  // n'existe pas chez elle. Un restaurant sans réservation du jour, si.
  const sansSalle = emailRecapCommandesJour({ ...journee, rdvs: null })
  verifier('🔴 une boulangerie ne voit AUCUNE section « tables »',
    !/couvert|table réservée/i.test(texteVu(sansSalle)))
  const salleVide = emailRecapCommandesJour({ ...journee, rdvs: [] })
  verifier('⚠️ mais un restaurant sans réservation le lit noir sur blanc',
    /Aucune table réservée/i.test(texteVu(salleVide)))

  // ⚠️ ET LA JOURNÉE SANS COMMANDE N'EST PLUS UNE JOURNÉE VIDE. C'est le cas du
  // Bistrologue : il ne fait presque que des tables.
  verifier('🔴 zéro commande mais six couverts ne se dit pas « journée vide »',
    /6 couverts/.test(texteVu(avecSalle)) && !/Bonne journée/.test(texteVu(avecSalle)))

  // Le cron doit vraiment charger la salle, et `couverts` avec.
  const CRON = sansProse(readFileSync(new URL('../app/api/cron/recap-jour-8h/route.js', import.meta.url), 'utf8'))
  verifier('🔴 le cron ouvre la salle aux commerces qui en ont une',
    /const aUneSalle = !estVitrine && reservationActive\(c\)/.test(CRON))
  verifier('🔴 et il lit la colonne « couverts »', /numero_prefixe, couverts,/.test(CRON))
  verifier('⚠️ une seule lecture des tables, partagée par les deux emails',
    (CRON.match(/from\('rdv_reservations'\)/g) || []).length === 1)
  verifier('⚠️ et `null` quand il n’y a pas de salle, jamais un tableau vide',
    /const tablesFlat = aUneSalle \? await lireTablesDuJour\(\) : null/.test(CRON))

  // La notification du tableau de bord, celle que le restaurateur entend.
  verifier('🔴 l’alerte du tableau de bord suit le métier',
    texteAlerteRdv({ client_prenom: 'Camille', date_rdv: '2026-09-12', heure_debut: '19:30' },
      { commercant: { categorie: 'alimentaire' } }).titre === 'Nouvelle réservation 🟣')
  verifier('⚠️ et reste « Nouveau rendez-vous » ailleurs',
    texteAlerteRdv({ client_prenom: 'Camille' }, { commercant: { categorie: 'vitrine' } }).titre === 'Nouveau rendez-vous 🟣'
    && texteAlerteRdv({ client_prenom: 'Camille' }).titre === 'Nouveau rendez-vous 🟣')

  // Les produits emportés avec la table, dans le fil du Yopper.
  const cmdResto = { rdv_reservation_id: 'r1', date_commande: '2026-09-12', mode_retrait: 'retrait', commercant: { categorie: 'alimentaire' } }
  verifier('🔴 les produits s’emportent « avec ta réservation »',
    /avec ta réservation/.test(libelleRetrait(cmdResto)))
  verifier('⚠️ et « avec ton rendez-vous » chez une vitrine',
    /avec ton rendez-vous/.test(libelleRetrait({ ...cmdResto, commercant: { categorie: 'vitrine' } })))

  // La fidélité, qui promet la fois d'après.
  verifier('🔴 la récompense suivante se promet pour une réservation',
    /ta prochaine réservation/.test(libelleAutresRecompenses(2, 'rdv', { categorie: 'alimentaire' })))
  verifier('⚠️ et pour un rendez-vous ailleurs',
    /ton prochain rendez-vous/.test(libelleAutresRecompenses(2, 'rdv', { categorie: 'vitrine' }))
    && /ton prochain rendez-vous/.test(libelleAutresRecompenses(2, 'rdv')))
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Réservation de table verte.')
