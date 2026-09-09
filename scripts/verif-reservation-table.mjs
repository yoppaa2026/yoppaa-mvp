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

  verifier('🔴 l’interrupteur s’ouvre au restaurant',
    /\{peutReserver\(form\) && \(/.test(CONFIG))
  verifier('et il rassure sur la carte à emporter',
    /la réservation s&rsquo;ajoute à ta fiche, elle ne la remplace pas/.test(CONFIG))
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Réservation de table verte.')
