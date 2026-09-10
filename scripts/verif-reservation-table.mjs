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
  // ⚠️ CETTE GARDE SURVEILLAIT UN LIBELLÉ QUI N'EXISTE PLUS (09/09). Le champ
  // disait « Couverts en salle sur un service » pour une table ; il ne s'affiche
  // plus du tout, puisque la capacité se déduit de l'inventaire. L'intention
  // n'a pas changé — le commerçant ne doit pas se voir poser une question qui
  // ne le concerne pas — mais la façon de la tenir, si.
  verifier('la capacité de salle ne se demande plus sur une table',
    !/'Couverts en salle sur un service'/.test(CONFIG)
    && /\{!form\.par_couverts && \(/.test(CONFIG))
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
  // ⚠️ LA QUESTION EST TOUJOURS POSÉE, À DEUX ENDROITS SELON LE MODE (2b). Avec
  // un inventaire complet, elle ouvre le tunnel et désigne la table ; sans lui,
  // elle reste à l'étape du jour, après le choix du format. Ce qui ne doit
  // jamais arriver, c'est qu'elle disparaisse.
  verifier('le tunnel demande pour combien de personnes',
    /\{estParCouverts\(prestationChoisie\) && !salleParInventaire && \(\(\) => \{/.test(TUNNEL)
    && /etape === 1 && salleParInventaire && \(/.test(TUNNEL)
    && /Nous serons/.test(TUNNEL))
  // 🔴 AVANT LE CHOIX DU JOUR, et ce n'est pas cosmétique : la taille de la
  // table décide de ce qui reste ouvert. Demander l'heure d'abord ferait
  // proposer 20h à une table de six dans une salle où il reste deux couverts.
  verifier('🔴 et il le demande AVANT le choix du jour',
    TUNNEL.indexOf('Nous serons') < TUNNEL.indexOf('Je viens le'))
  // ⚠️ ON DIT QUOI FAIRE, pas seulement la borne.
  verifier('⚠️ au-delà du maximum, on donne une sortie',
    /les grandes tablées se réservent de vive voix/.test(TUNNEL))
  // 🔴 LES TROIS QUESTIONS, PAS DEUX (10/09). Cette garde comptait deux grilles ;
  // le contrôle d'avant envoi posait la même question sans les couverts, et
  // refusait à l'envoi ce que la grille venait de proposer. Elle compte
  // désormais les trois, et la règle unique qu'elles partagent.
  const defRegle = (TUNNEL.match(/const regleOccupation = \(reservationsDuJour\) => \(\{[\s\S]*?\}\)/) || [''])[0]
  verifier('🔴 la règle d’occupation porte les couverts ET la salle',
    /parCouverts: estParCouverts\(prestationChoisie\)/.test(defRegle)
    && /couvertsDemandes: couverts/.test(defRegle)
    && /salle: salleParInventaire \? \{ formats: prestations, reservations: reservationsDuJour \|\| \[\] \} : null/.test(defRegle),
    defRegle.slice(0, 200))
  verifier('🔴 et les trois questions la lisent : la grille, le calendrier, le contrôle d’avant envoi',
    (TUNNEL.match(/\.\.\.regleOccupation\(/g) || []).length === 3)
  // ⚠️ AVEC LES RÉSERVATIONS BRUTES. Le filtre de praticien sert un salon ; il
  // masquerait ici les tables d'une autre salle, et la grille verrait une
  // salle plus vide que celle que le serveur compte.
  verifier('⚠️ et la salle reçoit les réservations brutes, jamais celles filtrées par praticien',
    /\.\.\.regleOccupation\(reservations\)/.test(TUNNEL)
    && /\.\.\.regleOccupation\(resaDuJour\)/.test(TUNNEL)
    && /\.\.\.regleOccupation\(busy\)/.test(TUNNEL))
  verifier('⚠️ et plus aucune question ne recopie ses arguments à la main',
    (TUNNEL.match(/parCouverts: estParCouverts\(prestationChoisie\)/g) || []).length === 1
    && (TUNNEL.match(/couvertsDemandes: couverts/g) || []).length === 1)
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

  const { motsReservation } = await import('../lib/reservation-metier.js')
  const MOTS_TABLE_TEST = motsReservation({ categorie: 'alimentaire' })
  const MOTS_SALON_TEST = motsReservation({ categorie: 'vitrine' })

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

  // ═══════════════════════════════════════════════════════════════════════
  // LA JAUGE DE LA SALLE : DES COUVERTS, PAS DES LIGNES
  // ═══════════════════════════════════════════════════════════════════════
  //
  // 🔴 L'AGENDA COMPTAIT LES RÉSERVATIONS ET LES COMPARAIT À UNE CAPACITÉ EN
  // COUVERTS. Une table de quatre pesait UN dans une salle de quarante :
  // l'agenda affichait « 1/40 » avec quatre personnes assises, et le
  // restaurateur aurait accepté dix fois trop de monde. Trouvé en relisant les
  // captures d'Alex, pas par un banc.
  //
  // ⚠️ ET LES ANNULÉS COMPTAIENT COMME OCCUPANTS. Une place annulée restait
  // bloquée jusqu'à la fin des temps.
  const { resumeSeance, texteResumeSeance } = await import('../lib/rdv-statut.js')
  const table4 = [{ id: 'a', statut: 'confirme', couverts: 4 }]
  const table4et2 = [...table4, { id: 'b', statut: 'confirme', couverts: 2 }]
  verifier('🔴 une table de quatre pèse quatre, pas une',
    resumeSeance(table4).couverts === 4 && resumeSeance(table4).presents === 1)
  verifier('🔴 deux tables font six couverts',
    resumeSeance(table4et2).couverts === 6)
  verifier('⚠️ une réservation annulée ne pèse plus rien',
    resumeSeance([...table4, { id: 'c', statut: 'annule_client', couverts: 8 }]).couverts === 4)

  // 🔴 LA MOITIÉ QUI COMPTE AUTANT : LE PARC EXISTANT NE BOUGE PAS.
  // Sans `couverts`, chaque ligne vaut un, exactement comme avant.
  const coursDouze = Array.from({ length: 3 }, (_, i) => ({ id: `x${i}`, statut: 'confirme' }))
  verifier('⚠️ un cours sans couverts compte ligne pour ligne, comme avant',
    resumeSeance(coursDouze).couverts === 3 && resumeSeance(coursDouze).presents === 3)
  verifier('⚠️ et le texte du salon est identique au mot près',
    texteResumeSeance(coursDouze, 12) === '3 inscrits sur 12')
  verifier('🔴 tandis que la salle parle en couverts',
    texteResumeSeance(table4et2, 40, { mots: MOTS_TABLE_TEST, parCouverts: true }) === '6 couverts sur 40')
  verifier('⚠️ et « complet » se déclenche sur les COUVERTS',
    /complet/.test(texteResumeSeance(table4et2, 6, { mots: MOTS_TABLE_TEST, parCouverts: true }))
    && !/complet/.test(texteResumeSeance(table4et2, 6)))

  // ═══════════════════════════════════════════════════════════════════════
  // LOT 2a : COMPTER LA SALLE EN TABLES, PAS EN COUVERTS
  // ═══════════════════════════════════════════════════════════════════════
  //
  // La salle du Bistrologue, telle qu'il la décrit : six tables de quatre, deux
  // de deux, deux de six. Quarante couverts, dix tables.
  const {
    enModeInventaire, formatsSansQuantite, formatsPourGroupe, occupationParFormat,
    formatLibrePour, couvertsTotaux, tablesTotales, quantiteDe,
  } = await import('../lib/inventaire-salle.js')
  const { timeToMinutes } = await import('../lib/rdv-slots.js')

  const T2 = { id: 't2', nom: 'Table de 2', par_couverts: true, actif: true, couverts_min: 1, couverts_max: 2, quantite: 2 }
  const T4 = { id: 't4', nom: 'Table de 4', par_couverts: true, actif: true, couverts_min: 1, couverts_max: 4, quantite: 6 }
  const T6 = { id: 't6', nom: 'Table de 6', par_couverts: true, actif: true, couverts_min: 1, couverts_max: 6, quantite: 2 }
  const SALLE = [T4, T2, T6]   // ⚠️ volontairement dans le désordre

  verifier('🔴 la salle du Bistrologue fait 40 couverts sur 10 tables',
    couvertsTotaux(SALLE) === 40 && tablesTotales(SALLE) === 10,
    `${couvertsTotaux(SALLE)} couverts / ${tablesTotales(SALLE)} tables`)

  // 🔴 LA PLUS PETITE TABLE QUI CONVIENT, la règle qui garde les grandes tables
  // pour les grands groupes. Sans elle, un couple prend la table de six à 19h et
  // le groupe de six s'entend dire non à 20h.
  verifier('🔴 un couple prend la table de deux, pas celle de six',
    formatsPourGroupe(SALLE, 2)[0].id === 't2')
  verifier('🔴 trois personnes prennent la table de quatre',
    formatsPourGroupe(SALLE, 3)[0].id === 't4')
  verifier('🔴 six personnes prennent la table de six',
    formatsPourGroupe(SALLE, 6)[0].id === 't6')
  verifier('⚠️ et l’ordre ne dépend pas de celui de la base',
    JSON.stringify(formatsPourGroupe(SALLE, 2).map(f => f.id))
    === JSON.stringify(formatsPourGroupe([T6, T4, T2], 2).map(f => f.id)),
    formatsPourGroupe(SALLE, 2).map(f => f.id).join(','))
  verifier('⚠️ une table trop petite n’est jamais proposée',
    formatsPourGroupe(SALLE, 5).every(f => f.couverts_max >= 5))
  verifier('🔴 un groupe de dix ne trouve aucune table seule',
    formatsPourGroupe(SALLE, 10).length === 0)

  // L'occupation compte des TABLES : six personnes sur une table de six, c'est
  // UN exemplaire immobilisé, pas six.
  const resas = [
    { prestation_id: 't6', heure_debut: '19:30', heure_fin: '22:00', couverts: 6 },
    { prestation_id: 't4', heure_debut: '20:00', heure_fin: '22:00', couverts: 4 },
  ]
  const pris = occupationParFormat(resas, timeToMinutes('20:30'), timeToMinutes('22:30'))
  verifier('🔴 une réservation prend UNE table, quel que soit le nombre de convives',
    pris.get('t6') === 1 && pris.get('t4') === 1)
  verifier('⚠️ on compte les chevauchements, pas les heures égales',
    occupationParFormat(resas, timeToMinutes('22:00'), timeToMinutes('23:30')).size === 0)

  // Le choix complet, sur une salle qui se remplit.
  const deuxSix = [
    { prestation_id: 't6', heure_debut: '19:30', heure_fin: '22:00' },
    { prestation_id: 't6', heure_debut: '19:45', heure_fin: '22:15' },
  ]
  const choix = formatLibrePour({ formats: SALLE, couverts: 5, reservations: deuxSix, debutMin: timeToMinutes('20:00'), finMin: timeToMinutes('22:30') })
  verifier('🔴 les deux tables de six prises, un groupe de cinq n’a plus rien',
    choix.format === null && choix.raison === 'complet', JSON.stringify(choix.raison))
  const choix4 = formatLibrePour({ formats: SALLE, couverts: 4, reservations: deuxSix, debutMin: timeToMinutes('20:00'), finMin: timeToMinutes('22:30') })
  verifier('⚠️ mais un groupe de quatre a toujours ses six tables de quatre',
    choix4.format?.id === 't4')

  // 🔴 « AUCUNE TABLE À CETTE TAILLE » N'EST PAS « COMPLET », et l'écran doit
  // pouvoir le dire autrement : c'est le lot 3 qui répondra par le couplage.
  const dix = formatLibrePour({ formats: SALLE, couverts: 10, reservations: [], debutMin: 0, finMin: 90 })
  verifier('🔴 un groupe de dix n’est pas « complet », il est trop grand',
    dix.format === null && dix.raison === 'aucune_table_a_cette_taille', dix.raison)

  // ─── LE MODE, ET IL SE DIT ───────────────────────────────────────────────
  //
  // ⚠️ TOUS LES FORMATS, PAS AU MOINS UN. Un inventaire à moitié rempli
  // compterait les uns en tables et les autres en couverts, dans la même salle
  // et pour le même service.
  verifier('🔴 le mode inventaire demande TOUS les formats renseignés',
    enModeInventaire(SALLE) === true
    && enModeInventaire([T4, { ...T2, quantite: null }]) === false)
  verifier('⚠️ et il nomme ce qui manque au commerçant',
    JSON.stringify(formatsSansQuantite([T4, { ...T2, quantite: null }])) === JSON.stringify(['Table de 2']))
  verifier('⚠️ un format désactivé ne bloque pas la bascule',
    enModeInventaire([T4, { ...T2, quantite: null, actif: false }]) === true)
  verifier('⚠️ un commerce sans aucune table n’est pas « en inventaire »',
    enModeInventaire([]) === false && enModeInventaire([{ par_couverts: false, actif: true }]) === false)
  verifier('⚠️ zéro exemplaire ne compte pas comme une quantité',
    quantiteDe({ quantite: 0 }) === null && quantiteDe({ quantite: 3 }) === 3)

  // ═══════════════════════════════════════════════════════════════════════
  // 🔴 UNE TABLE N'EST PAS UN COURS (Alex, 10/09 : « c'est un peu confus »)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // `capacite > 1` confondait deux notions : plusieurs places par créneau (vrai
  // pour un cours ET une table) et cours à heure fixe (vrai pour le yoga, faux
  // pour une table). Depuis que la capacité d'une table vaut son inventaire, six
  // tables de quatre étaient « un cours de vingt-quatre », et le moteur ne leur
  // offrait AUCUN horaire hors des plages qui les nomment.
  const { estCoursCollectif } = await import('../lib/cours-collectifs.js')
  const { coursSansHoraire, genererSlots } = await import('../lib/rdv-slots.js')
  const TABLE24 = { id: 't4', par_couverts: true, capacite: 24, couverts_max: 4, quantite: 6 }
  const YOGA12 = { id: 'y', par_couverts: false, capacite: 12 }
  verifier('🔴 une table de six exemplaires n’est pas un cours',
    estCoursCollectif(TABLE24) === false)
  verifier('🔴 mais le yoga de douze places reste un cours, lui',
    estCoursCollectif(YOGA12) === true)
  verifier('⚠️ et un rendez-vous individuel n’en est pas un non plus',
    estCoursCollectif({ par_couverts: false, capacite: 1 }) === false)
  // Une plage « toutes mes prestations » : aucune liaison ne nomme la table.
  verifier('🔴 une table sans plage dédiée n’est jamais « dates à venir »',
    coursSansHoraire(TABLE24, []) === false)
  verifier('⚠️ tandis que le yoga sans plage dédiée l’est toujours',
    coursSansHoraire(YOGA12, []) === true)

  // 🔴 LE COMPORTEMENT, PAS SEULEMENT LA FONCTION : le moteur de créneaux doit
  // offrir des horaires à une table sur une plage qui ne la nomme pas.
  const mardi = new Date('2026-09-15T12:00:00+02:00')
  const plageToutes = [{ id: 'c1', jour_semaine: 'mardi', heure_debut: '18:00', heure_fin: '23:00', pas_minutes: 30, actif: true }]
  const horairesOuverts = { mardi: { ouvert: true, debut: '09:00', fin: '00:00' } }
  const slotsTable = genererSlots({
    dateChoisie: mardi, dureeMinutes: 120, creneaux: plageToutes, reservations: [],
    horairesDetail: horairesOuverts, capacite: 24, prestationId: 't4',
    liaisonsCreneaux: [], parCouverts: true, couvertsDemandes: 4,
  })
  verifier('🔴 un groupe de quatre trouve des horaires sur un service ouvert à toutes les tables',
    slotsTable.some(s => !s.pris), `${slotsTable.filter(s => !s.pris).length} horaires libres`)
  const slotsYoga = genererSlots({
    dateChoisie: mardi, dureeMinutes: 60, creneaux: plageToutes, reservations: [],
    horairesDetail: horairesOuverts, capacite: 12, prestationId: 'y',
    liaisonsCreneaux: [], parCouverts: false,
  })
  verifier('⚠️ et le yoga, lui, reste sans horaire sur une plage qui ne le nomme pas',
    !slotsYoga.some(s => !s.pris), `${slotsYoga.filter(s => !s.pris).length} horaires libres`)

  // 🔴 ET LA RÈGLE ÉTAIT JUSTE, MAIS INOPÉRANTE (Alex, 10/09 : « encore un truc
  // qui bug quand je coche toutes les prestations »).
  //
  // `estCoursCollectif` lit `par_couverts` pour savoir qu'une table n'est pas un
  // cours. L'onglet Services chargeait ses prestations avec
  // `select('id, nom, capacite, duree_minutes')` : sans `par_couverts`. La
  // colonne valait `undefined`, `!== true` était vrai, et chaque table redevenait
  // un cours — les deux bandeaux revenaient, identiques, après le correctif.
  //
  // ⚠️ MON BANC NE POUVAIT PAS LE VOIR : il testait la règle sur un objet que je
  // construisais à la main, qui portait la colonne. Il vérifiait la FONCTION,
  // jamais ce que l'ÉCRAN lui donne. La colonne absente d'un select, neuvième
  // fois — le lendemain du jour où je l'avais notée comme LA leçon.
  //
  // 🔴 LA RÈGLE STRUCTURELLE : `capacite` ET `par_couverts` VOYAGENT ENSEMBLE.
  // Une capacité lue sans son drapeau est exactement l'ambiguïté qui fait passer
  // une table pour un cours. On balaie TOUT le dépôt, pas le fichier touché :
  // chercher les frères, c'est balayer le dépôt.
  {
    const { readdirSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const racine = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    const fichiers = []
    const parcourir = (d) => {
      for (const e of readdirSync(d)) {
        if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
        const p = join(d, e)
        if (statSync(p).isDirectory()) parcourir(p)
        else if (/\.jsx?$/.test(e)) fichiers.push(p)
      }
    }
    parcourir(join(racine, 'app'))
    parcourir(join(racine, 'lib'))
    const fautifs = []
    const vus = []
    for (const f of fichiers) {
      // 🔴 SANS SA PROSE (10/09). Cette garde lisait le fichier brut, et le
      // select du tableau de bord se tenait à dix-sept lignes de commentaire de
      // son `from` : hors de la fenêtre de 160 caractères, donc jamais vu. Il
      // chargeait `capacite` sans `par_couverts`, et la garde restait verte —
      // la saisie au téléphone ne savait pas qu'une table en était une. Une
      // garde peut être verte et complice ; celle-ci l'était par sa fenêtre.
      const src = sansProse(readFileSync(f, 'utf8'))
      for (const m of src.matchAll(/from\(\s*['"]rdv_prestations['"]\s*\)[\s\S]{0,160}?\.select\(\s*(['"`])([^'"`]*)\1/g)) {
        const cols = m[2]
        const nom = f.split(/[\\/]/).slice(-2).join('/')
        vus.push(`${nom} → ${cols}`)
        if (/\bcapacite\b/.test(cols) && !/\bpar_couverts\b/.test(cols)) {
          fautifs.push(`${nom} → ${cols}`)
        }
      }
    }
    verifier('🔴 aucun select ne charge « capacite » sans « par_couverts », dans tout le dépôt',
      fautifs.length === 0, fautifs.join(' | '))
    verifier('⚠️ et la garde a bien parcouru le dépôt',
      fichiers.length > 100, `${fichiers.length} fichiers`)
    // ⚠️ ET ELLE VOIT CELUI QUI LUI AVAIT ÉCHAPPÉ. Compter les fichiers ne prouve
    // pas qu'elle lit les selects : un témoin nommé, si.
    verifier('⚠️ et elle voit le select du tableau de bord, celui qui lui échappait',
      vus.some(v => /^dashboard\/page\.js → .*\bcapacite\b/.test(v)), `${vus.length} selects vus`)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOT 2b : LE CLIENT DIT COMBIEN ILS SONT, LE SERVEUR TROUVE LA TABLE
  // ═══════════════════════════════════════════════════════════════════════
  //
  // 🔴 PERSONNE NE RÉSERVE « UNE TABLE DE QUATRE ». On réserve pour quatre, et
  // c'est au restaurant de savoir quelle table sortir. Demander le format au
  // client, c'est lui demander de connaître un inventaire qu'il n'a jamais vu.
  const { formatPourAffichage, plusGrandeTable } = await import('../lib/inventaire-salle.js')
  verifier('🔴 le format montré est le plus petit qui convient',
    formatPourAffichage(SALLE, 2)?.id === 't2' && formatPourAffichage(SALLE, 5)?.id === 't6')
  verifier('⚠️ et rien n’est montré au-delà de la plus grande table',
    formatPourAffichage(SALLE, 12) === null && plusGrandeTable(SALLE) === 6)

  const FICHE2B = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('🔴 le tunnel demande le nombre de personnes AVANT tout',
    /etape === 1 && salleParInventaire && \(/.test(FICHE2B)
    && /Nous serons/.test(FICHE2B))
  verifier('🔴 et le choix du nombre désigne la table tout seul',
    /setCouverts\(n\); const f = formatPourAffichage\(prestations, n\); if \(f\) choisirPrestation\(f\)/.test(FICHE2B))
  verifier('⚠️ au-delà de la plus grande table, on invite à téléphoner',
    /Plus de \{plusGrandeTable\(prestations\)\} personnes \?/.test(FICHE2B))
  verifier('⚠️ et la question n’est plus reposée à l’étape suivante',
    /estParCouverts\(prestationChoisie\) && !salleParInventaire && \(\(\) => \{/.test(FICHE2B))

  // 🔴 LA MOITIÉ QUI COMPTE : LE PARCOURS D'UNE VITRINE NE BOUGE PAS D'UN ÉCRAN.
  // Un salon vend des prestations distinctes — une coupe n'est pas un balayage —
  // et c'est bien au client de choisir. La bascule tient à l'inventaire de
  // salle, que seul un restaurant remplit, et la liste doit rester la voie par
  // défaut de tout le parc.
  verifier('🔴 la liste des prestations reste le parcours par défaut',
    /etape === 1 && !salleParInventaire && \(/.test(FICHE2B))
  verifier('🔴 et un salon n’est JAMAIS en mode inventaire',
    enModeInventaire([{ par_couverts: false, actif: true, quantite: 4 }]) === false)
  verifier('🔴 ni un restaurant dont l’inventaire est incomplet',
    enModeInventaire([T4, { ...T2, quantite: null }]) === false)

  // Le serveur applique enfin la règle, et distingue les deux refus.
  const SRV = sansProse(readFileSync(new URL('../lib/rdv-creation-server.js', import.meta.url), 'utf8'))
  verifier('🔴 le serveur choisit la table, il ne se contente plus de vérifier',
    /const choix = formatLibrePour\(\{/.test(SRV) && /prestationRetenue = choix\.format/.test(SRV))
  // ⚠️ LA DISTINCTION DOIT ÊTRE FAITE SUR LA RAISON, pas seulement écrite
  // quelque part. Mesuré par mutation : chercher les deux codes dans le fichier
  // laissait passer un ternaire qui rendait toujours le même, l'autre branche
  // restant morte. On vise le test qui choisit.
  verifier('🔴 « trop grand » et « complet » sont deux refus distincts',
    /choix\.raison === 'aucune_table_a_cette_taille'\s*\n?\s*\? \{ ok: false, code: 'groupe_trop_grand'/.test(SRV)
    && /: \{ ok: false, code: 'salle_complete', restants: 0 \}/.test(SRV))
  // ⚠️ LA DURÉE, ELLE, EST CELLE DU GROUPE DEPUIS LE 10/09 (`dureeRetenue`) :
  // la garde qui exigeait celle de la table retenue figeait un défaut, un
  // couple enregistré sur cent vingt minutes après un contrôle sur quatre-vingt-
  // dix. La valeur est désormais mesurée en exécutant le module, plus bas.
  verifier('🔴 et c’est la table RETENUE qui s’écrit, pas celle qu’on a reçue',
    /prestation_id: prestationRetenue\.id,/.test(SRV)
    && /duree_minutes: dureeRetenue,/.test(SRV)
    && /capacite_creneau: capacitePrestation\(prestationRetenue\),/.test(SRV))
  // 🔴 LE RANG D'UNE TABLE N'A PAS DE SENS À L'INTÉRIEUR D'UN FORMAT (10/09).
  // Cette garde exigeait l'inverse, et c'était le défaut qu'Alex a touché :
  // l'index `rdv_no_double_book` ne connaît pas la prestation, et un rang
  // cherché dans le seul format retenu redonnait le 1 de la table voisine. Le
  // rang se cherche parmi TOUTES les réservations de l'heure ; la mesure qui
  // compte est exécutée plus bas, sur une fausse base qui reproduit l'index.
  verifier('🔴 le rang d’une table se cherche parmi toutes les réservations de l’heure',
    /const \{ data: memeHeure \} = await db\s*\.from\('rdv_reservations'\)\s*\.select\('place_no'\)\s*\.eq\('commercant_id', commercantId\)\s*\.eq\('date_rdv', dateRdv\)\s*\.eq\('heure_debut', heure\)\s*\.in\('statut', STATUTS_OCCUPENT\)/.test(SRV)
    && /placeNo = rangLibre\(\(memeHeure \|\| \[\]\)\.map\(r => r\.place_no\)\)/.test(SRV))
  verifier('⚠️ et plus aucun rang ne se cherche dans le seul format retenu',
    !/premierePlaceLibre\(prestationRetenue,/.test(SRV))

  // 🔴 LA CAPACITÉ DE SALLE NE SE DEMANDE PLUS DEUX FOIS (Alex, 09/09 : « à quoi
  // sert ce champ ? »). Elle était la jauge de l'ancien modèle ; elle se déduit
  // désormais de l'inventaire. La laisser à l'écran, c'est poser deux fois la
  // même question et obtenir deux réponses : Alex y a mis sa quantité, et la
  // carte annonçait « Table de 4 · jusqu'à 6 couverts ».
  const CFG = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  verifier('🔴 le champ « personnes par créneau » disparaît sur une table',
    /\{!form\.par_couverts && \([\s\S]{0,200}?Personnes par créneau/.test(CFG))
  verifier('🔴 et la capacité d’une table se DÉDUIT de son inventaire',
    /return Number\.isFinite\(q\) && q >= 1 && Number\.isFinite\(t\) && t >= 1\s*\n?\s*\? q \* t/.test(CFG))
  verifier('⚠️ le cours garde sa question à lui',
    /Cours collectif : \$\{capacitePrestation/.test(CFG))
  // ⚠️ DEPUIS LE 10/09, « jusqu'à » ou « de 3 à » selon le minimum : on exige
  // toujours que le nombre affiché soit la TAILLE de la table, `couverts_max`.
  verifier('🔴 la carte annonce la taille de la table, pas la jauge de salle',
    /<>jusqu&rsquo;à <\/>\}\s*<strong style=\{\{ color: T\.ink \}\}>\{p\.couverts_max \|\| '\?'\}<\/strong> personne/.test(CFG))
  verifier('⚠️ et elle dit combien il y en a',
    /<strong style=\{\{ color: T\.ink \}\}>\{p\.quantite\}<\/strong> table/.test(CFG))
  verifier('⚠️ l’exemple de description parle du métier du commerce',
    MOTS_TABLE_TEST.descriptionExemple === 'Près de la fenêtre, banquette confortable'
    && MOTS_SALON_TEST.descriptionExemple === 'Shampoing, coupe, brushing')

  // Le branchement serveur : le mode se décide sur la SALLE, et le calcul en
  // couverts reste intact tant que l'inventaire n'est pas complet.
  const CREA = sansProse(readFileSync(new URL('../lib/rdv-creation-server.js', import.meta.url), 'utf8'))
  verifier('🔴 le serveur bascule en tables quand l’inventaire est complet',
    /if \(enModeInventaire\(formatsTable\)\) \{/.test(CREA))
  // ⚠️ CES DEUX GARDES VISAIENT LE COMPTAGE DE 2a, où le serveur se contentait
  // de vérifier le format reçu. Depuis 2b il CHOISIT la table, et c'est
  // `formatLibrePour` qui compte les exemplaires : le refus est tenu par les
  // gardes du lot 2b, plus haut. Compter ne suffit pas, il faut refuser — la
  // leçon reste, l'endroit où elle s'applique a bougé.
  verifier('🔴 et le comptage des exemplaires vit dans le module, pas ici',
    /formatLibrePour\(\{/.test(CREA) && !/occupationParFormat\(/.test(CREA))

  // 🔴 LA TABLE RETENUE PORTE TOUT CE QU'ELLE DÉCIDE. C'est le défaut du 09/09
  // au soir : le select des formats ne rapportait ni la durée, ni la TVA, ni la
  // capacité, et le serveur écrivait une réservation de soixante minutes sur une
  // table réglée à quatre-vingt-dix.
  verifier('🔴 les deux requêtes de prestation lisent la MÊME liste de colonnes',
    (CREA.match(/\.select\(COLONNES_PRESTATION_DECIDE\)/g) || []).length === 2
    && !/\.select\('id, nom, actif, par_couverts/.test(CREA))
  for (const colonne of ['duree_minutes', 'duree_paliers', 'tva_taux', 'capacite', 'par_couverts', 'quantite']) {
    verifier(`⚠️ la liste porte « ${colonne} », dont dépend la table retenue`,
      new RegExp(`COLONNES_PRESTATION_DECIDE =[\\s\\S]{0,300}?\\b${colonne}\\b`).test(CREA))
  }
  verifier('⚠️ le calcul en couverts survit dans la branche « sinon »',
    /\} else \{[\s\S]{0,400}?occupes \+ couvertsRetenus > capacite/.test(CREA))
  // ⚠️ CETTE GARDE FIGEAIT LE SELECT MINIMAL QUI A CAUSÉ LE DÉFAUT : elle
  // vérifiait qu'il portait bien les colonnes du MODE, sans voir qu'il lui
  // manquait celles de la DÉCISION. Une garde peut être verte et complice.
  verifier('⚠️ et il charge la liste complète, pas un extrait',
    /\.select\(COLONNES_PRESTATION_DECIDE\)[\s\S]{0,200}?\.eq\('par_couverts', true\)/.test(CREA))
  verifier('⚠️ la liste des réservations porte son format, sinon on ne peut rien compter',
    /\.select\('prestation_id, heure_debut, heure_fin, couverts'\)/.test(CREA))

  // ═══════════════════════════════════════════════════════════════════════
  // LOT 1 : LA DURÉE SUIT LA TAILLE DU GROUPE
  // ═══════════════════════════════════════════════════════════════════════
  const { dureeSelonCouverts, palierNettoyes } = await import('../lib/cours-collectifs.js')
  const TABLE = {
    par_couverts: true, duree_minutes: 90, capacite: 40, couverts_min: 1, couverts_max: 8,
    duree_paliers: [{ des: 3, minutes: 120 }, { des: 5, minutes: 150 }],
  }
  verifier('🔴 deux personnes prennent la durée de base', dureeSelonCouverts(TABLE, 2) === 90)
  verifier('🔴 quatre personnes passent au palier de 120', dureeSelonCouverts(TABLE, 4) === 120)
  verifier('🔴 six personnes passent au palier de 150', dureeSelonCouverts(TABLE, 6) === 150)
  verifier('⚠️ le palier s’applique DÈS son seuil, pas après',
    dureeSelonCouverts(TABLE, 3) === 120 && dureeSelonCouverts(TABLE, 5) === 150)
  verifier('⚠️ au-delà du dernier palier, on garde le dernier',
    dureeSelonCouverts(TABLE, 20) === 150)

  // 🔴 LA MOITIÉ QUI COMPTE : LE PARC EXISTANT NE BOUGE PAS. La colonne est
  // nulle sur les neuf prestations en base, donc chaque agenda calcule
  // aujourd'hui exactement ce qu'il calculait hier.
  const SANS = { par_couverts: true, duree_minutes: 90, duree_paliers: null }
  const COURS = { par_couverts: false, duree_minutes: 60, duree_paliers: [{ des: 2, minutes: 999 }] }
  verifier('🔴 sans palier, la durée de base pour tout le monde',
    dureeSelonCouverts(SANS, 1) === 90 && dureeSelonCouverts(SANS, 8) === 90)
  verifier('🔴 un cours ignore les paliers, même s’il en porte',
    dureeSelonCouverts(COURS, 12) === 60)
  verifier('⚠️ une prestation sans durée retombe sur soixante minutes',
    dureeSelonCouverts({ par_couverts: true }, 4) === 60)

  // ⚠️ UN PALIER ILLISIBLE EST IGNORÉ, JAMAIS INTERPRÉTÉ : mieux vaut la durée
  // de base qu'une table bloquée trois heures par un `NaN`.
  verifier('⚠️ un palier abîmé ne bloque pas la table',
    dureeSelonCouverts({ ...TABLE, duree_paliers: [{ des: 'x', minutes: 150 }, { des: 3, minutes: null }] }, 6) === 90)
  // 🔴 LE CAS QUE SEULE `Number.isFinite` ATTRAPE, et que mon premier banc
  // ratait : une DURÉE illisible sur un seuil valable. `Number('bientôt')` vaut
  // NaN, `NaN <= 0` est faux, donc le contrôle des bornes le laisse passer et la
  // durée retenue devient NaN. Une table dont la fin ne se calcule plus n'est
  // pas une table longue, c'est une table qui disparaît de l'agenda.
  // Mesuré par mutation : sans cette ligne, la mutation passait inaperçue.
  verifier('🔴 une durée illisible ne devient jamais la durée retenue',
    dureeSelonCouverts({ ...TABLE, duree_paliers: [{ des: 1, minutes: 'bientôt' }] }, 6) === 90)
  verifier('⚠️ et le nettoyage à l’écriture la refuse aussi',
    palierNettoyes([{ des: 1, minutes: 'bientôt' }]).length === 0)
  verifier('⚠️ un jsonb qui n’est pas un tableau ne fait pas tomber l’écran',
    dureeSelonCouverts({ ...TABLE, duree_paliers: { des: 3, minutes: 120 } }, 6) === 90)

  // La normalisation à l'écriture : trié, dédoublonné, nettoyé.
  const propres = palierNettoyes([{ des: '5', minutes: '150' }, { des: 3, minutes: 120 }, { des: 3, minutes: 130 }, { des: 0, minutes: 90 }, { des: 4, minutes: -1 }])
  verifier('⚠️ les paliers sont triés et dédoublonnés à l’écriture',
    JSON.stringify(propres) === JSON.stringify([{ des: 3, minutes: 130 }, { des: 5, minutes: 150 }]),
    JSON.stringify(propres))

  // 🔴 ET LE SERVEUR RECALCULE, il ne reçoit pas. Une table de huit contrôlée
  // sur 150 minutes puis ENREGISTRÉE sur 90 libérerait une table encore occupée.
  const CREATION = sansProse(readFileSync(new URL('../lib/rdv-creation-server.js', import.meta.url), 'utf8'))
  verifier('🔴 le module écrit LUI-MÊME la durée et la fin',
    // 🔴 `dureeRetenue` DEPUIS LE 10/09, ET PLUS LA TABLE RETENUE. Cette garde
    // exigeait la durée de la table donnée ; or le contrôle de la salle, lui,
    // lisait celle de la table demandée. Dès que le serveur montait d'un
    // format, il écrivait une durée que personne n'avait contrôlée : la garde
    // gravait l'écart qu'elle prétendait interdire.
    /duree_minutes: dureeRetenue,/.test(CREATION)
    && /heure_fin: minutesToTime\(timeToMinutes\(heure\) \+ dureeRetenue\)/.test(CREATION))
  // 🔴 ET SES GARDES MESURENT LA MÊME DURÉE : le créneau, la salle en tables, la
  // salle en couverts. Les trois lisent la variable qui s'écrit.
  verifier('🔴 et ses trois contrôles mesurent la MÊME durée, celle qui s’écrit',
    /finMin: timeToMinutes\(heure\) \+ dureeRetenue,/.test(CREATION)
    && /finMin: debutMin \+ dureeRetenue,/.test(CREATION)
    && /const finMin = debutMin \+ dureeRetenue/.test(CREATION))
  verifier('⚠️ et aucune autre durée ne se calcule après la décision',
    !/dureeSelonCouverts\(prestationRetenue/.test(CREATION)
    && !/dureeSelonCouverts\(prestation, champs/.test(CREATION))

  // 🔴 LE DÉFAUT QUI RENDAIT TOUT LE MODULE MUET (09/09 au soir).
  //
  // Le bloc entier des couverts est gardé par `estParCouverts(prestation)`, et
  // `par_couverts` ne figurait pas dans le select : la garde rendait faux, la
  // jauge de salle ne tournait JAMAIS, et chaque table s'écrivait à un couvert.
  // Une liste de colonnes désarmait une garde de sécurité, sans une erreur.
  for (const [chemin, nom] of [
    ['lib/rdv-creation-server.js', 'le module de création'],
    ['app/api/rdv/reserver/route.js', 'la route de réservation'],
  ]) {
    const src = sansProse(readFileSync(new URL('../' + chemin, import.meta.url), 'utf8'))
    // 🔴 J'AI DÉSARMÉ CETTE GARDE, ET LE DÉFAUT EST PASSÉ PAR LÀ (Alex, 09/09 :
    // « 60 min alors que la table est sur 90 »).
    //
    // Elle exigeait ces colonnes de TOUS les selects de prestations. Un select
    // d'inventaire l'a fait rougir, et plutôt que de compléter le select, j'ai
    // ajouté un filtre pour l'exempter : « il ne sert qu'à compter ». Il servait
    // à DÉCIDER — c'est lui qui alimente la table retenue — et sans
    // `duree_minutes`, la durée retombait sur son défaut de soixante minutes.
    //
    // ⚠️ ON NE DÉSARME PAS UNE GARDE POUR FAIRE PASSER DU CODE. Si elle rougit
    // sur quelque chose de légitime, c'est la garde qu'on précise, jamais son
    // périmètre qu'on rogne — sinon on retire exactement le filet qui tenait.
    // Les deux selects lisent désormais la MÊME constante, et c'est ce que la
    // garde vérifie : une liste, un seul endroit où elle est écrite.
    // ⚠️ ET LA GARDE SUIT LA CONSTANTE, sinon elle ne lit plus qu'un nom de
    // variable et se croit satisfaite. Un select nommé se résout avant d'être
    // mesuré : c'est ce que fait un lecteur humain, la garde doit faire pareil.
    const constante = (src.match(/COLONNES_PRESTATION_DECIDE\s*=\s*\n?\s*'([^']+)'/) || [])[1] || ''
    const selects = [
      ...[...src.matchAll(/from\(\s*['"]rdv_prestations['"]\s*\)[\s\S]{0,200}?\.select\(\s*(['"`])([\s\S]*?)\1/g)].map(m => m[2]),
      ...[...src.matchAll(/from\(\s*['"]rdv_prestations['"]\s*\)[\s\S]{0,300}?\.select\(COLONNES_PRESTATION_DECIDE\)/g)].map(() => constante),
    ]
    verifier(`🔴 ${nom} charge « par_couverts »`,
      selects.length > 0 && selects.every(s => /\bpar_couverts\b/.test(s)), selects.join(' | '))
    verifier(`🔴 et ${nom} charge « duree_paliers »`,
      selects.length > 0 && selects.every(s => /\bduree_paliers\b/.test(s)), selects.join(' | '))
    verifier(`⚠️ et ${nom} charge les bornes de couverts`,
      selects.length > 0 && selects.every(s => /\bcouverts_min\b/.test(s) && /\bcouverts_max\b/.test(s)), selects.join(' | '))
  }

  // 🔴 UNE SALLE EST UNE SALLE, PAS UNE PAR FORMAT DE TABLE. La jauge filtrait
  // sur `prestation_id` : juste pour un cours, faux pour une salle. Deux formats
  // de table se voyaient accorder QUARANTE couverts CHACUN, et la grille du
  // client, elle, comptait déjà toute la salle. L'écran refusait, le serveur
  // acceptait : c'est le sens inverse du défaut habituel, et le pire des deux.
  verifier('🔴 la jauge de salle compte TOUS les formats de table',
    /\.eq\('par_couverts', true\)/.test(CREATION)
    && /\.in\('prestation_id', idsSalle\.length > 0 \? idsSalle : \[prestation\.id\]\)/.test(CREATION))
  verifier('⚠️ et un `in\\(\\)` vide ne vide pas la jauge',
    /idsSalle\.length > 0 \? idsSalle : \[prestation\.id\]/.test(CREATION))
  verifier('⚠️ le cours garde sa capacité à lui : la requête vit sous « estParCouverts »',
    /if \(estParCouverts\(prestation\)\) \{[\s\S]*?from\('rdv_reservations'\)/.test(CREATION))

  // L'écran, lui, lit la durée UNE fois et jamais la colonne en direct.
  const TUNNEL = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('🔴 le tunnel dérive la durée du nombre de personnes',
    /const dureeRetenue = dureeSelonCouverts\(prestationChoisie, couverts\)/.test(TUNNEL))
  verifier('⚠️ et plus aucun endroit ne lit la durée brute de la prestation choisie',
    !/prestationChoisie\.duree_minutes/.test(TUNNEL),
    (TUNNEL.match(/.{0,40}prestationChoisie\.duree_minutes.{0,20}/) || [''])[0])

  // ⚠️ ET LE COMPTEUR DU BLOC, celui qu'on lit d'un coup d'œil sur la grille
  // sans rien ouvrir : « 1/2 » sur une table de deux personnes déjà pleine.
  // C'est le chiffre le plus regardé de l'agenda, et il n'était gardé par rien.
  const AGENDA = sansProse(readFileSync(new URL('../app/dashboard/AgendaRdv.js', import.meta.url), 'utf8'))
  verifier('🔴 le compteur du bloc compte des couverts',
    /const occupationBloc = resumeSeance\(seance\.inscrits\)\.couverts/.test(AGENDA)
    && /\{occupationBloc\}\/\{seance\.capacite\}/.test(AGENDA))
  verifier('⚠️ et « complet » sur le bloc suit la même occupation',
    /const complet = occupationBloc >= seance\.capacite/.test(AGENDA))
  verifier('⚠️ plus aucun compteur ne lit « inscrits.length » face à une capacité',
    !/inscrits\.length >= seance\w*\.capacite/.test(AGENDA),
    (AGENDA.match(/.{0,50}inscrits\.length >= .{0,30}/) || [''])[0])

  // La réservation prise au téléphone doit demander le nombre de personnes.
  const MODALE = sansProse(readFileSync(new URL('../app/dashboard/ModalNouveauRdv.js', import.meta.url), 'utf8'))
  verifier('🔴 la réservation manuelle demande combien de personnes',
    /Combien de personnes \?/.test(MODALE))
  verifier('🔴 et elle ÉCRIT le nombre en base',
    /couverts: couvertsRetenus,/.test(MODALE))
  verifier('🔴 le nombre est validé avant d’être écrit',
    /couvertsValides\(presta,/.test(MODALE) && /couvertsRetenus === null/.test(MODALE))
  verifier('⚠️ et le champ ne s’affiche que sur une table',
    /presta && estParCouverts\(presta\) && \(/.test(MODALE))

  // ═══════════════════════════════════════════════════════════════════════
  // 🔴 LE PARC EXISTANT NE BOUGE PAS D'UN MOT (demande d'Alex, 09/09)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // « Attention de ne rien casser côté VITRINE ou ailleurs s'il y a des liens. »
  //
  // Trente-deux libellés passent désormais par le module du métier. Chacun a un
  // jumeau côté vitrine, et c'est ce jumeau qui doit rester LETTRE POUR LETTRE
  // ce qu'il était : Centre Respire et Ciseaux et Soins lisent ces phrases tous
  // les jours. Un dictionnaire est exactement le genre d'endroit où une
  // reformulation « au passage » se glisse sans que personne la voie.
  //
  // ⚠️ ON FIGE LES CHAÎNES, PAS LEUR PRÉSENCE. Vérifier qu'une clé existe
  // laisserait passer un texte réécrit.
  const HISTORIQUE_VITRINE = {
    prestations: 'Prestations', praticiens: 'Praticiens', creneaux: 'Créneaux',
    choisir: 'Choisis ta prestation', ajouter: 'Ajouter une prestation',
    prestationAucune: 'Aucune prestation', prestationNouvelle: 'Nouvelle prestation',
    prestationModifier: 'Modifier la prestation', prestationActive: 'Prestation active (visible côté client)',
    praticienAucun: 'Aucun praticien', praticienNouveau: 'Nouveau praticien',
    praticienModifier: 'Modifier le praticien', praticienCreer: 'Créer le praticien',
    praticienActifLabel: 'Praticien actif (visible côté client)',
    praticiensAutorises: 'Praticiens autorisés',
    tousPraticiens: 'Tous les praticiens', creneauCommun: 'Tous les praticiens (créneau commun)',
    creneauxTitre: 'Créneaux RDV', creneauAucun: 'Aucun créneau ce jour',
    creneauNouveau: 'Nouveau créneau', creneauModifier: 'Modifier le créneau',
    reglages: 'Comment régler ta prise de rendez-vous',
    confirmer: 'Confirmer mon RDV', traitement: 'Traitement de mon RDV', avant: 'avant le RDV',
    yoppe: 'Ton RDV est Yoppé ! 🟣',
    emailConfirme: 'Ton RDV est confirmé', emailAnnule: 'Ton RDV a été annulé',
    emailDeplace: 'Ton RDV a été déplacé', emailLieuChange: 'Ton RDV change d’endroit',
    emailNoShow: 'Ton RDV a été marqué non honoré', emailRappelDemain: 'Rappel — RDV demain',
    ctaVoir: 'Voir mon RDV', ctaVoirTout: 'Voir mes RDV', ctaReprendre: 'Reprendre un RDV',
    numeroLabel: 'Rendez-vous', prestationLigne: 'Prestation',
    manuelTitre: 'Nouveau RDV manuel', manuelConfirmer: 'Confirmer le RDV',
    agendaLegende: 'Chaque couleur, une praticienne',
    agendaAjouter: 'Tap sur une case blanche pour ajouter un RDV',
    agendaOccupe: 'inscrit', agendaOccupes: 'inscrits',
    agendaTousLa: 'Tout le monde était là', agendaInscrire: 'Inscrire quelqu’un',
    blocSansNom: 'Cours',
    recapLesTiennes: 'tes RDV', sujetRecapAucun: 'Aucun RDV',
    alerteNouvelle: 'Nouveau rendez-vous 🟣', alerteNouvelleTitre: 'Nouveau RDV reçu',
    avecLaSienne: 'avec ton rendez-vous', prochaineFois: 'ton prochain rendez-vous',
    laSienne: 'ton rendez-vous', laMienne: 'mon rendez-vous', uneSienne: 'un rendez-vous',
    participeConfirme: 'confirmé', participeAnnule: 'annulé', participeHonore: 'honoré',
    descriptionExemple: 'Shampoing, coupe, brushing',
  }
  let derives = 0
  for (const [cle, attendu] of Object.entries(HISTORIQUE_VITRINE)) {
    if (MOTS_SALON_TEST[cle] !== attendu) {
      derives++
      verifier(`🔴 le salon a DÉRIVÉ sur « ${cle} »`, false,
        `attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(MOTS_SALON_TEST[cle])}`)
    }
  }
  verifier(`🔴 les ${Object.keys(HISTORIQUE_VITRINE).length} libellés de la vitrine sont intacts`, derives === 0)

  // ⚠️ ET AUCUNE CLÉ DE LA TABLE NE DOIT ÊTRE ÉGALE À CELLE DU SALON sur ce qui
  // fait la différence : une clé oubliée dans MOTS_TABLE hériterait en silence
  // du vocabulaire du rendez-vous, et le restaurateur lirait « RDV » sans que
  // rien ne rougisse.
  const DOIVENT_DIFFERER = ['prestations', 'praticiens', 'creneaux', 'choisir', 'yoppe',
    'emailConfirme', 'ctaVoir', 'manuelTitre', 'agendaOccupe', 'agendaLegende', 'blocSansNom']
  const identiques = DOIVENT_DIFFERER.filter(c => MOTS_TABLE_TEST[c] === MOTS_SALON_TEST[c])
  verifier('🔴 chaque mot du restaurant diffère vraiment de celui du salon',
    identiques.length === 0, identiques.join(', '))

  // ⚠️ ET AUCUN MOT DE LA TABLE NE PARLE DE RENDEZ-VOUS. Une clé recopiée du
  // salon par distraction se lirait ici.
  const fuites = Object.entries(MOTS_TABLE_TEST)
    .filter(([, v]) => typeof v === 'string' && /rendez-vous|\bRDV\b/i.test(v))
  verifier('🔴 aucun libellé du restaurant ne dit « rendez-vous »',
    fuites.length === 0, fuites.map(([k, v]) => `${k}: ${v}`).join(' | '))

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
// 🔴 « POURQUOI ÇA BLOQUE APRÈS DEUX RÉSAS ? » (Alex, 10/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// Deux tables de deux à 19h, une troisième demande pour deux : le serveur
// trouvait bien la table de quatre, et la base refusait l'écriture. L'index
// `rdv_no_double_book` porte sur (commerce, praticien, date, heure, place) —
// sans la prestation — et le rang était cherché dans le seul format retenu.
//
// En cherchant les frères, trois autres portes : la grille de la fiche tenait
// une table d'un autre format pour un conflit, le contrôle d'avant envoi
// oubliait les couverts, et le tableau de bord refusait au téléphone deux
// tables qui se chevauchent. Tout est EXÉCUTÉ ici, sur la salle du test d'Alex.
{
  const { rangLibre } = await import('../lib/cours-collectifs.js')
  const { conflitReservation, genererSlots } = await import('../lib/rdv-slots.js')
  const { conflitSalle, occupationParFormat } = await import('../lib/inventaire-salle.js')
  const { creneauAcceptable } = await import('../lib/deplacement-rdv.js')
  const { creerReservationRdv } = await import('../lib/rdv-creation-server.js')

  // ─── Le rang ─────────────────────────────────────────────────────────────
  egal('🔴 le rang d’une table prend le premier libre parmi TOUS', rangLibre([1, 2]), 3)
  egal('⚠️ et comble le trou laissé par une annulation', rangLibre([1, 3]), 2)
  egal('⚠️ une heure vide commence au rang 1', rangLibre([]), 1)
  // 🔴 SANS PLAFOND : pour une table, ce n'est pas le rang qui dit « complet ».
  egal('🔴 et il n’a pas de plafond', rangLibre(Array.from({ length: 30 }, (_, i) => i + 1)), 31)

  // ─── La salle du test d'Alex, avec ses durées ─────────────────────────────
  const A2 = { id: 'a2', nom: 'Table pour 2 personnes', par_couverts: true, actif: true, couverts_min: 1, couverts_max: 2, quantite: 2, capacite: 4, duree_minutes: 90, tva_taux: 12, commercant_id: 'c1' }
  const A4 = { id: 'a4', nom: 'Table de 4 personnes', par_couverts: true, actif: true, couverts_min: 1, couverts_max: 4, quantite: 6, capacite: 24, duree_minutes: 120, tva_taux: 12, commercant_id: 'c1' }
  const A6 = { id: 'a6', nom: 'Table de 6 personnes', par_couverts: true, actif: true, couverts_min: 1, couverts_max: 6, quantite: 2, capacite: 12, duree_minutes: 150, tva_taux: 12, commercant_id: 'c1' }
  const SALLE_ALEX = [A4, A2, A6]
  const deuxCouples = [
    { id: 'r1', prestation_id: 'a2', heure_debut: '19:00:00', heure_fin: '20:30:00', place_no: 1, praticien_id: null, statut: 'confirme', date_rdv: '2026-09-15' },
    { id: 'r2', prestation_id: 'a2', heure_debut: '19:00:00', heure_fin: '20:30:00', place_no: 2, praticien_id: null, statut: 'confirme', date_rdv: '2026-09-15' },
  ]
  const H19 = 19 * 60

  // ─── La question de la grille, posée comme le serveur ─────────────────────
  const troisieme = conflitSalle({ formats: SALLE_ALEX, couverts: 2, reservations: deuxCouples, debut: H19, fin: H19 + 90 })
  verifier('🔴 la troisième demande pour deux trouve la table de quatre',
    troisieme.conflit === false && troisieme.format?.id === 'a4', JSON.stringify(troisieme))
  const salleAlex = { formats: SALLE_ALEX, reservations: deuxCouples }
  verifier('🔴 et `conflitReservation` rend la même réponse dès qu’on lui donne la salle',
    conflitReservation({ debut: H19, fin: H19 + 90, prestationId: 'a2', capacite: 4, reservations: deuxCouples,
      parCouverts: true, couvertsDemandes: 2, salle: salleAlex }).conflit === false)
  const pourQuatre = conflitReservation({ debut: H19, fin: H19 + 120, prestationId: 'a4', capacite: 24,
    reservations: deuxCouples, parCouverts: true, couvertsDemandes: 4, salle: salleAlex })
  verifier('🔴 deux tables de deux à 19h ne ferment pas 19h au groupe de quatre',
    pourQuatre.conflit === false, JSON.stringify(pourQuatre))
  // ⚠️ LE TÉMOIN DU DÉFAUT : sans la salle, l'ancien calcul tourne toujours, et
  // tient la table voisine pour un rendez-vous qui occupe la maison.
  const sansSalle = conflitReservation({ debut: H19, fin: H19 + 120, prestationId: 'a4', capacite: 24,
    reservations: deuxCouples, parCouverts: true, couvertsDemandes: 4 })
  verifier('⚠️ témoin : sans la salle, la table voisine était un conflit',
    sansSalle.conflit === true && sansSalle.raison === 'occupe', JSON.stringify(sansSalle))

  // ⚠️ LA SALLE PLEINE RESTE PLEINE : la correction n'ouvre rien de plus.
  const petite = [{ ...A2 }, { ...A4, quantite: 1 }]
  const pleine = [...deuxCouples, { prestation_id: 'a4', heure_debut: '19:00:00', heure_fin: '21:00:00' }]
  const refus = conflitSalle({ formats: petite, couverts: 2, reservations: pleine, debut: H19, fin: H19 + 90 })
  verifier('🔴 quand toutes les tables sont prises, c’est complet',
    refus.conflit === true && refus.raison === 'complet', JSON.stringify(refus))
  const huit = conflitSalle({ formats: SALLE_ALEX, couverts: 8, reservations: [], debut: H19, fin: H19 + 150 })
  verifier('⚠️ et un groupe de huit est « trop grand », pas « complet »',
    huit.conflit === true && huit.raison === 'trop_grand', JSON.stringify(huit))

  // 🔴 LE PIÈGE DU ZÉRO : le moteur manipule des minutes, la base rend des
  // heures. Une lecture qui n'attend que des heures voyait la salle VIDE.
  const enMinutes = deuxCouples.map(r => ({ prestation_id: r.prestation_id, start: H19, end: H19 + 90 }))
  verifier('🔴 une réservation en minutes compte autant qu’une réservation en heures',
    occupationParFormat(enMinutes, H19, H19 + 60).get('a2') === 2,
    JSON.stringify([...occupationParFormat(enMinutes, H19, H19 + 60)]))
  // ⚠️ ET ELLE NE DÉBORDE PAS AVANT SON HEURE. Mesuré par mutation : un début
  // lu comme une heure absente vaut 0, et une réservation « de minuit à 20h30 »
  // chevauche encore 19h — le test ci-dessus restait vert. Seule une fenêtre
  // AVANT la réservation voit la différence.
  verifier('⚠️ et une table de 19h n’occupe pas 17h',
    occupationParFormat(enMinutes, 17 * 60, 18 * 60).size === 0,
    JSON.stringify([...occupationParFormat(enMinutes, 17 * 60, 18 * 60)]))

  // ─── La grille elle-même, un mardi soir ───────────────────────────────────
  const mardiSoir = new Date('2026-09-15T12:00:00+02:00')
  const service = [{ id: 's1', jour_semaine: 'mardi', heure_debut: '18:00', heure_fin: '23:00', pas_minutes: 30, actif: true }]
  const ouvert = { mardi: { ouvert: true, debut: '09:00', fin: '00:00' } }
  const grille = (couverts, format, avecSalle) => genererSlots({
    dateChoisie: mardiSoir, dureeMinutes: format.duree_minutes, creneaux: service,
    reservations: deuxCouples, horairesDetail: ouvert, capacite: format.capacite, prestationId: format.id,
    liaisonsCreneaux: [], parCouverts: true, couvertsDemandes: couverts,
    salle: avecSalle ? salleAlex : null,
  })
  const a19 = (slots) => slots.find(s => s.heure === '19:00')
  verifier('🔴 la grille propose 19:00 à un troisième couple', a19(grille(2, A2, true))?.pris === false,
    JSON.stringify(a19(grille(2, A2, true))))
  verifier('🔴 et au groupe de quatre', a19(grille(4, A4, true))?.pris === false,
    JSON.stringify(a19(grille(4, A4, true))))
  verifier('⚠️ témoin : sans la salle, la grille fermait 19:00 au groupe de quatre',
    a19(grille(4, A4, false))?.pris === true)

  // 🔴 ET LA GRILLE EN COUVERTS REÇOIT LES COUVERTS. Une salle sans inventaire
  // se compte encore en couverts ; la copie des réservations dans le moteur
  // perdait leur nombre, et une table de quatre y pesait UN couvert.
  const tableDeQuatre = [{ prestation_id: 's6', heure_debut: '19:00:00', heure_fin: '21:00:00', couverts: 4 }]
  const enCouverts = (couverts) => genererSlots({
    dateChoisie: mardiSoir, dureeMinutes: 120, creneaux: service, reservations: tableDeQuatre,
    horairesDetail: ouvert, capacite: 6, prestationId: 's6', liaisonsCreneaux: [],
    parCouverts: true, couvertsDemandes: couverts,
  })
  verifier('🔴 dans une salle de six où quatre sont assis, un autre groupe de quatre ne passe pas',
    a19(enCouverts(4))?.pris === true && a19(enCouverts(4))?.motif === 'complet', JSON.stringify(a19(enCouverts(4))))
  verifier('⚠️ mais un couple, si', a19(enCouverts(2))?.pris === false, JSON.stringify(a19(enCouverts(2))))

  // ─── Le serveur, sur une fausse base qui REPRODUIT L'INDEX ────────────────
  //
  // ⚠️ SANS L'INDEX, CE TEST NE PROUVERAIT RIEN : une base qui accepte tout
  // aurait laissé passer le rang 1 comme avant. Elle refuse ici exactement ce
  // que refuse `rdv_no_double_book`, et un témoin le vérifie.
  function salleSimulee({ demandee, formats, existantes }) {
    const vu = { payload: null, lecturesRang: [] }
    const table = (nom) => {
      const filtres = {}
      let colonnes = ''
      const chaine = {
        select: (c) => { colonnes = String(c || ''); return chaine },
        eq: (col, val) => { filtres[col] = val; return chaine },
        in: (col, val) => { filtres[col] = val; return chaine },
        is: () => chaine,
        neq: () => chaine,
        order: () => chaine,
        maybeSingle: async () => ({
          data: nom === 'rdv_prestations' ? demandee
            : nom === 'commercants' ? { id: 'c1', nom: 'La Table d’Essai', adresse: 'Rue du Test 1' }
            : null,
        }),
        insert: (p) => { vu.payload = p; return chaine },
        single: async () => {
          const p = vu.payload
          const doublon = existantes.some(r =>
            String(r.praticien_id ?? '') === String(p?.praticien_id ?? '')
            && r.date_rdv === p?.date_rdv
            && String(r.heure_debut).slice(0, 5) === String(p?.heure_debut).slice(0, 5)
            && Number(r.place_no) === Number(p?.place_no))
          return doublon
            ? { data: null, error: { code: '23505' } }
            : { data: { id: 'rdv-3', numero_rdv: 3, numero_prefixe: 'RE', place_no: p?.place_no }, error: null }
        },
        then: (resoudre) => {
          if (nom === 'rdv_prestations') return resoudre({ data: formats })
          if (nom !== 'rdv_reservations') return resoudre({ data: [] })
          let lignes = existantes.filter(r => !filtres.date_rdv || r.date_rdv === filtres.date_rdv)
          if (filtres.prestation_id !== undefined) {
            const ids = [].concat(filtres.prestation_id).map(String)
            lignes = lignes.filter(r => ids.includes(String(r.prestation_id)))
          }
          if (filtres.heure_debut !== undefined) {
            lignes = lignes.filter(r => String(r.heure_debut).slice(0, 5) === String(filtres.heure_debut).slice(0, 5))
          }
          if (colonnes.trim() === 'place_no') vu.lecturesRang.push({ ...filtres })
          return resoudre({ data: lignes })
        },
      }
      return chaine
    }
    return { from: table, _vu: vu }
  }

  {
    const db = salleSimulee({ demandee: A2, formats: SALLE_ALEX, existantes: deuxCouples })
    const r = await db.from('rdv_reservations').insert({ praticien_id: null, date_rdv: '2026-09-15', heure_debut: '19:00', place_no: 1 }).select('id').single()
    verifier('⚠️ témoin : la fausse base refuse bien le rang 1 déjà pris à 19h', r.error?.code === '23505')
  }
  {
    const db = salleSimulee({ demandee: A2, formats: SALLE_ALEX, existantes: deuxCouples })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'a2', dateRdv: '2026-09-15', heureDebut: '19:00',
      champs: { couverts: 2, client_email: 'essai@yoppaa.app' },
    })
    verifier('🔴 la troisième réservation pour deux passe enfin', res.ok === true, JSON.stringify({ ok: res.ok, code: res.code }))
    egal('🔴 sur une table de quatre', db._vu.payload?.prestation_id, 'a4')
    egal('🔴 au premier rang libre de l’HEURE, pas du format', db._vu.payload?.place_no, 3)
    egal('🔴 pour la durée du couple, pas celle d’une tablée de quatre', db._vu.payload?.duree_minutes, 90)
    egal('⚠️ et l’heure de fin le répète', db._vu.payload?.heure_fin, '20:30')
    egal('⚠️ la TVA et la capacité suivent la table retenue', [db._vu.payload?.tva_taux, db._vu.payload?.capacite_creneau], [12, 24])
    const lecture = db._vu.lecturesRang.at(-1) || {}
    verifier('🔴 le rang se lit sur toute l’heure, sans filtre de format',
      lecture.heure_debut === '19:00' && lecture.date_rdv === '2026-09-15' && lecture.prestation_id === undefined,
      JSON.stringify(lecture))
  }
  {
    // ⚠️ UNE REQUÊTE QUI DÉSIGNE LA TABLE DE QUATRE POUR DEUX ne décide pas de
    // la durée : le serveur prend sa référence dans la salle.
    const db = salleSimulee({ demandee: A4, formats: SALLE_ALEX, existantes: [] })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'a4', dateRdv: '2026-09-15', heureDebut: '19:00', champs: { couverts: 2 },
    })
    verifier('⚠️ une requête qui désigne une grande table pour deux passe', res.ok === true)
    egal('⚠️ sur la table de deux, la plus petite qui convient', db._vu.payload?.prestation_id, 'a2')
    egal('🔴 et pour la durée du groupe, pas celle de la table désignée', db._vu.payload?.duree_minutes, 90)
  }
  {
    const db = salleSimulee({ demandee: A4, formats: SALLE_ALEX, existantes: deuxCouples })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'a4', dateRdv: '2026-09-15', heureDebut: '19:00', champs: { couverts: 4 },
    })
    verifier('🔴 un groupe de quatre à 19h passe à côté des deux couples', res.ok === true, JSON.stringify({ code: res.code }))
    egal('⚠️ sur une table de quatre, au rang 3, pour deux heures',
      [db._vu.payload?.prestation_id, db._vu.payload?.place_no, db._vu.payload?.duree_minutes], ['a4', 3, 120])
  }
  {
    const pleineEnBase = [...deuxCouples, { id: 'r3', prestation_id: 'a4', heure_debut: '19:00:00', heure_fin: '21:00:00', place_no: 3, praticien_id: null, statut: 'confirme', date_rdv: '2026-09-15' }]
    const db = salleSimulee({ demandee: A2, formats: [A2, { ...A4, quantite: 1 }], existantes: pleineEnBase })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'a2', dateRdv: '2026-09-15', heureDebut: '19:00', champs: { couverts: 2 },
    })
    verifier('🔴 et une salle vraiment pleine reste refusée, sans rien écrire',
      res.ok === false && res.code === 'salle_complete' && db._vu.payload === null, JSON.stringify({ code: res.code }))
  }

  // ─── Le tableau de bord : la saisie au téléphone et le déplacement ────────
  const soir = { ouvert: true, debut: '09:00', fin: '00:00' }
  const assis = [{ id: 'x1', prestation_id: 'a2', date_rdv: '2026-09-15', heure_debut: '19:00:00', heure_fin: '20:30:00', statut: 'confirme' }]
  const appel = { dateStr: '2026-09-15', heureDebut: '19:30', dureeMinutes: 120, horaireJour: soir,
    creneauxJour: service, rdvsExistants: assis, capacite: 24, prestationId: 'a4' }
  const verdictAppel = creneauAcceptable({ ...appel, prestations: SALLE_ALEX })
  verifier('🔴 au téléphone, une table de quatre à 19h30 passe à côté d’un couple assis à 19h',
    verdictAppel.ok === true, JSON.stringify(verdictAppel))
  verifier('⚠️ témoin : sans le catalogue, c’était « ce créneau chevauche un RDV »',
    creneauAcceptable(appel).raison === 'conflit')
  const COUPE = { id: 'coupe', par_couverts: false, capacite: 1 }
  verifier('⚠️ un rendez-vous qui n’est pas une table reste un conflit',
    creneauAcceptable({ ...appel, prestationId: 'coupe', capacite: 1, dureeMinutes: 45,
      prestations: [...SALLE_ALEX, COUPE] }).raison === 'conflit')
  verifier('⚠️ et une table ne passe pas sur ce qui n’en est pas une',
    creneauAcceptable({ ...appel, rdvsExistants: [{ ...assis[0], prestation_id: 'coupe' }],
      prestations: [...SALLE_ALEX, COUPE] }).raison === 'conflit')

  // Les deux modales : elles ne s'exécutent pas hors navigateur, on vérifie
  // qu'elles donnent à la règle ce dont elle a besoin, et le rang de l'heure.
  const MODALE_N = sansProse(readFileSync(new URL('../app/dashboard/ModalNouveauRdv.js', import.meta.url), 'utf8'))
  const MODALE_D = sansProse(readFileSync(new URL('../app/dashboard/ModalDeplacerRdv.js', import.meta.url), 'utf8'))
  verifier('🔴 la saisie au téléphone donne le catalogue à la règle',
    /const verdict = creneauAcceptable\(\{[\s\S]{0,600}?prestationId: presta\.id,\s*prestations,\s*\}\)/.test(MODALE_N))
  verifier('🔴 et le déplacement aussi',
    /exclureId: rdv\?\.id \?\? null,\s*prestations,\s*\}/.test(MODALE_D))
  verifier('🔴 la saisie cherche le rang d’une table sur toute l’heure',
    /if \(estParCouverts\(presta\)\) \{[\s\S]{0,300}?\.from\('rdv_reservations'\)\s*\.select\('date_rdv, place_no'\)\s*\.eq\('commercant_id', commercant\.id\)\s*\.in\('date_rdv', toutesLesDates\)\s*\.eq\('heure_debut', heureInit\)[\s\S]{0,700}?rangLibre\(/.test(MODALE_N))
  verifier('🔴 et le déplacement aussi, en s’excluant lui-même',
    /if \(estTable\) \{[\s\S]{0,300}?\.from\('rdv_reservations'\)\s*\.select\('id, place_no'\)\s*\.eq\('commercant_id', commercant\.id\)\s*\.eq\('date_rdv', date\)\s*\.eq\('heure_debut', heure\)[\s\S]{0,500}?rangLibre\(\(memeHeure \|\| \[\]\)\.filter\(r => String\(r\.id\) !== String\(rdv\.id\)\)/.test(MODALE_D))
  verifier('🔴 et une table déplacée n’est plus un « cours de 24 places »',
    /const estTable = presta \? estParCouverts\(presta\) : false/.test(MODALE_D)
    && /const estCours = !estTable && capacite > 1/.test(MODALE_D))

  // 🔴 ET LES COLONNES QUE CES RÈGLES LISENT ARRIVENT JUSQU'AUX MODALES. La
  // dixième colonne absente d'un select était celle-ci.
  const BORD = sansProse(readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'))
  const selBord = (BORD.match(/from\('rdv_prestations'\)[\s\S]{0,160}?\.select\('([^']*)'\)/) || [])[1] || ''
  const manquantes = ['capacite', 'par_couverts', 'couverts_min', 'couverts_max', 'duree_minutes', 'duree_paliers']
    .filter(c => !new RegExp(`\\b${c}\\b`).test(selBord))
  verifier('🔴 le tableau de bord charge tout ce que lisent les modales d’une table',
    selBord !== '' && manquantes.length === 0, `manque : ${manquantes.join(', ')} · select : ${selBord}`)

  // ⚠️ LES MOTS DU REFUS. Depuis que le rang d'une table se cherche sur toute
  // l'heure, « place prise » ne veut plus dire « complet » mais « une autre
  // réservation est arrivée à la même seconde ». « La dernière place vient
  // d'être prise » serait faux devant une salle qui a encore dix tables.
  const FICHE_T = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('⚠️ une table « prise » le dit juste, sur les trois chemins d’envoi',
    (FICHE_T.match(/setSubmitError\(estParCouverts\(prestationChoisie\) \? phraseTablePrise : j\.collectif/g) || []).length === 3)
  verifier('⚠️ et le contrôle d’avant envoi parle de table, pas de cours',
    /conflit\.raison === 'complet' \|\| conflit\.raison === 'trop_grand'\s*\?\s*\(estParCouverts\(prestationChoisie\)\s*\?\s*'La dernière table libre/.test(FICHE_T))

  // ─── LE MINIMUM D'UNE TABLE EST UNE RÈGLE (décision d'Alex, 10/09) ────────
  //
  // Son test : table de 4 réglée « à partir de 3 », deux tables de 2 prises à
  // 18h, le troisième couple refusé. Ce n'était pas le moteur : c'était son
  // réglage. Décision : le minimum RESTE STRICT — c'est le levier du
  // restaurateur pour garder ses grandes tables aux groupes — mais l'écran le
  // dit. Ce test fige la décision : quiconque « corrigerait » le moteur en
  // ignorant le minimum le verra rougir.
  const A4min3 = { ...A4, couverts_min: 3 }
  const A6min5 = { ...A6, couverts_min: 5 }
  const strict = conflitSalle({ formats: [A2, A4min3, A6min5], couverts: 2, reservations: deuxCouples, debut: H19, fin: H19 + 90 })
  verifier('🔴 une table de 4 « à partir de 3 » ne se donne jamais à un couple, même salle pleine',
    strict.conflit === true && strict.raison === 'complet', JSON.stringify(strict))
  const souple = conflitSalle({ formats: [A2, { ...A4, couverts_min: 1 }, A6min5], couverts: 2, reservations: deuxCouples, debut: H19, fin: H19 + 90 })
  verifier('⚠️ et « à partir de 1 » la lui ouvre quand les tables de 2 sont prises',
    souple.conflit === false && souple.format?.id === 'a4', JSON.stringify(souple))
  verifier('⚠️ un groupe de 3 reste le bienvenu à cette table de 4',
    conflitSalle({ formats: [A2, A4min3, A6min5], couverts: 3, reservations: deuxCouples, debut: H19, fin: H19 + 120 }).format?.id === 'a4')

  // Et l'écran le dit, à deux endroits : là où on le règle, et sur la carte.
  const CFG_MIN = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  verifier('🔴 le formulaire dit ce que fait « À partir de », selon la valeur saisie',
    /\{form\.par_couverts && \(\s*<p[^>]*>\s*Yoppaa installe toujours un groupe à la plus petite table libre qui lui convient\.\{' '\}\s*\{Number\(form\.couverts_min\) > 1\s*\?\s*`Réglée à partir de \$\{Number\(form\.couverts_min\)\}, cette table ne sera jamais donnée à moins de/.test(CFG_MIN))
  verifier('⚠️ et sans minimum, il dit qu’un couple peut y être installé',
    /: 'Quand les plus petites sont prises, elle peut accueillir un groupe plus petit, un couple par exemple\./.test(CFG_MIN))
  // ═══ L'AGENDA D'UNE SALLE (Alex, 10/09) ═══════════════════════════════════
  //
  // « L'agenda n'est pas correct / complet, et quand je clique il ne me donne
  // pas le résumé complet. » Un bloc par FORMAT et par heure de départ, comme
  // un cours : les blocs de 18h00 et de 18h30 se recouvraient, chacun n'ouvrait
  // que son format. Et un rendez-vous à 18h15 ne se dessinait nulle part.
  const { servicesDeSalle, estReservationDeTable, caseDeDepart } = await import('../lib/cours-collectifs.js')
  const jointT2 = { nom: 'Table pour 2 personnes', par_couverts: true }
  const jointT4 = { nom: 'Table de 4 personnes', par_couverts: true }
  const jointT6 = { nom: 'Table de 6 personnes', par_couverts: true }
  const soiree = [
    { id: 'a', date_rdv: '2026-09-10', heure_debut: '18:00:00', heure_fin: '19:30:00', couverts: 2, place_no: 1, statut: 'confirme', prestation: jointT2 },
    { id: 'b', date_rdv: '2026-09-10', heure_debut: '18:00:00', heure_fin: '19:30:00', couverts: 2, place_no: 2, statut: 'confirme', prestation: jointT2 },
    { id: 'c', date_rdv: '2026-09-10', heure_debut: '18:00:00', heure_fin: '19:30:00', couverts: 2, place_no: 3, statut: 'confirme', prestation: jointT4 },
    { id: 'd', date_rdv: '2026-09-10', heure_debut: '18:30:00', heure_fin: '21:00:00', couverts: 6, place_no: 1, statut: 'confirme', prestation: jointT6 },
    { id: 'e', date_rdv: '2026-09-10', heure_debut: '21:00:00', heure_fin: '22:30:00', couverts: 2, place_no: 1, statut: 'confirme', prestation: jointT2 },
    { id: 'coupe', date_rdv: '2026-09-10', heure_debut: '18:00:00', heure_fin: '18:45:00', statut: 'confirme', prestation: { nom: 'Coupe', par_couverts: false } },
  ]
  const services = servicesDeSalle(soiree)
  verifier('🔴 les tables qui se chevauchent forment UN service, tous formats confondus',
    services.length === 2 && services[0].tables.map(t => t.id).join(',') === 'a,b,c,d',
    JSON.stringify(services.map(s => s.tables.map(t => t.id))))
  egal('⚠️ de la première arrivée au dernier départ', [services[0].heure_debut, services[0].heure_fin], ['18:00', '21:00'])
  egal('🔴 et le bloc dit qui arrive à quelle heure',
    services[0].arrivees, [{ heure: '18:00', tables: 3, couverts: 6 }, { heure: '18:30', tables: 1, couverts: 6 }])
  verifier('⚠️ une table qui arrive quand la dernière part ouvre un autre service',
    services[1].tables.map(t => t.id).join(',') === 'e' && services[1].heure_debut === '21:00')
  verifier('⚠️ ce qui n’est pas une table reste hors des services', !services.some(s => s.tables.some(t => t.id === 'coupe')))
  // 🔴 LE TÉMOIN DE LA JOINTURE : sans `par_couverts` dans la prestation jointe,
  // aucune réservation n'est une table, et l'agenda retombe sur celui d'un cours.
  verifier('🔴 sans `par_couverts` dans la jointure, une table n’est pas reconnue',
    !estReservationDeTable({ prestation: { nom: 'Table de 4 personnes' } }) && estReservationDeTable({ prestation: jointT4 }))
  const minuit = servicesDeSalle([{ id: 'n', date_rdv: '2026-09-12', heure_debut: '23:00', heure_fin: '00:30', couverts: 4, prestation: jointT4 }])
  egal('⚠️ une table qui finit après minuit dure une heure et demie', minuit[0].finMin - minuit[0].debutMin, 90)

  // 🔴 LE RENDEZ-VOUS DE 18h15 SE DESSINE ENFIN, dans la case de 18h00.
  egal('🔴 un rendez-vous à 18h15 se pose dans la case de 18h00, décalé de 15 minutes',
    caseDeDepart(18 * 60 + 15, 12 * 60, 30), { caseMin: 18 * 60, decalage: 15 })
  egal('⚠️ et un rendez-vous pile à 18h00, sans décalage', caseDeDepart(18 * 60, 12 * 60, 30), { caseMin: 18 * 60, decalage: 0 })
  egal('⚠️ 18h45 tombe dans la case de 18h30', caseDeDepart(18 * 60 + 45, 12 * 60, 30).caseMin, 18 * 60 + 30)

  // L'agenda lui-même : il ne s'exécute pas hors navigateur, on vérifie qu'il
  // pose les blocs par la règle et qu'il range les tables dans leur service.
  const AGENDA_S = sansProse(readFileSync(new URL('../app/dashboard/AgendaRdv.js', import.meta.url), 'utf8'))
  verifier('🔴 l’agenda pose chaque bloc dans la case qui CONTIENT son heure',
    /const commenceIci = \(debutMin\) => caseDeDepart\(debutMin, heureMin, PAS_MINUTES\)\.caseMin === slotMin/.test(AGENDA_S)
    && !/timeToMinutes\(r\.heure_debut\) === slotMin/.test(AGENDA_S))
  verifier('🔴 les tables sortent des blocs de cours et entrent dans leur service',
    /const rdvsCommencantIci = debutsIci\.filter\(r => !estReservationDeTable\(r\)\)/.test(AGENDA_S)
    && /const blocsIci = \[\.\.\.servicesIci, \.\.\.blocsAgenda\(rdvsCommencantIci\)\]/.test(AGENDA_S))
  verifier('🔴 le service s’ouvre sur la liste de TOUTES ses tables',
    /setServiceOuvert\(\{ \.\.\.service, jourDate: j\.date \}\)/.test(AGENDA_S)
    && /const tables = serviceOuvert\.tables \|\| \[\]/.test(AGENDA_S) && /\{tables\.map\(i => \{/.test(AGENDA_S))
  verifier('⚠️ et seules les tables déjà parties se clôturent d’un geste',
    /const aClore = tables\.filter\(estAClore\)/.test(AGENDA_S) && /onHonorerSeance\(aClore\)/.test(AGENDA_S))
  verifier('⚠️ une table s’ajoute depuis le service, avec l’heure d’arrivée au choix',
    /onNouveauRdv\(jour, h\)/.test(AGENDA_S))

  // Et le tableau de bord donne à l'agenda ce qu'il lui faut.
  const BORD_S = sansProse(readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'))
  verifier('🔴 la prestation jointe aux réservations porte `par_couverts`',
    /const SELECT_RDVS = `\*, prestation:rdv_prestations\(nom, duree_minutes, prix, par_couverts\)/.test(BORD_S))
  verifier('🔴 la clôture d’un service parle en tables',
    (BORD_S.match(/table: seanceAHonorer\.length > 0 && seanceAHonorer\.every\(estReservationDeTable\)/g) || []).length === 2)
  const { questionSeanceHonoree: qCloture } = await import('../lib/confirmation-rdv.js')
  verifier('🔴 et la question dit « ces 4 tables », pas « ces 4 personnes »',
    qCloture(4, { table: true }).titre === 'Marquer ces 4 tables comme venues ?')
  verifier('🔴 sans promettre un email qui ne part plus',
    !/email/i.test(qCloture(1, { table: true }).message) && !/email/i.test(qCloture(4, { table: true }).message))

  verifier('🔴 la carte de la table montre le minimum : « de 3 à 4 personnes »',
    /\{Number\(p\.couverts_min\) > 1\s*\?\s*<>de <strong[^>]*>\{p\.couverts_min\}<\/strong> à <\/>\s*:\s*<>jusqu&rsquo;à <\/>\}/.test(CFG_MIN))
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Réservation de table verte.')
