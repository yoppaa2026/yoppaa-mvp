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
import {
  emailCommandePrete, emailCommandeEnLivraison, emailCommandeExpediee,
  emailCommandeAnnuleeCommercant, emailCommandeAnnuleeYopper,
} from '../lib/resend.js'
import {
  composerAdresseLivraison, requeteGeocodage, coordonneesPlausibles,
  champsAdressePourAPI, NOTE_MAX,
} from '../lib/adresse-livraison.js'
import {
  etatPaiementClient, etatPaiementCommande, etatPaiementRdv, phraseAvantages,
} from '../lib/rdv-paiement.js'
import { nomTransporteur, suiviUrl, libelleExpedition } from '../lib/transporteurs.js'
// On compare avec `euros()`, jamais avec une copie du format écrite à la main.
import { euros } from '../lib/montants.js'
import { prenomClient, nomCompletClient } from '../lib/nom-client.js'
import { reponseRefuse, motifDuRefus } from '../lib/verdict-reponse.js'
import { estFermeExceptionnellement } from '../lib/ouverture.js'
import {
  distanceMetres, capDegres, pointA, cercle, limiteDansDirection, dansEtoile, zoneValide,
  contourEtoile, phraseHorsZone, NB_POIGNEES, PAS_DEGRES, RAYON_DEFAUT_M, RAYON_MAX_M,
  centreDeLaZone,
} from '../lib/zone-etoile.js'
import {
  COLONNES_BEST, decouperLigneCsv, indexColonnes, adresseDeLigne,
  normaliserRecherche, baseNumero, estimerPositions, filtrerRues, composerAdresseOfficielle,
} from '../lib/best-adresse.js'

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
//
// ⚠️ LES DEUX ANCRES DOIVENT EXISTER, et c'est la moitié de la garde. Écrite
// en comparant deux `indexOf` nus, elle passait au VERT dès que le premier
// disparaissait : `-1 < n` est vrai. Une garde qui verdit quand la règle
// s'évapore ne garde rien.
//
// ⚠️ Et elle a rougi le 01/09 pour la bonne raison : `chargerBonValide` est
// devenu `chargerBonsValides` quand le rendez-vous s'est mis à cumuler. Une
// garde qui vise un NOM survit mal ; celle-ci vise en plus un ORDRE, qui est la
// vraie règle, donc on la garde en la réancrant.
{
  const posMinimum = routeCode.indexOf('minimumAtteint(')
  const posBons = routeCode.indexOf('chargerBonsValides(')
  verifier('la route charge les bons par le module partagé', posBons !== -1)
  verifier('le minimum est vérifié avant les bons cadeaux',
    posMinimum !== -1 && posBons !== -1 && posMinimum < posBons)
}

// 🔴 I7 (05/10) : LE CONGÉ ÉTAIT IGNORÉ PAR LE SERVEUR pour le retrait et la
// livraison de l'alimentaire. Les fermetures n'étaient relues que pour la
// boutique ; seule la fiche cachait le jour.
{
  const posLecture = routeCode.indexOf(".from('fermetures_exceptionnelles')")
  const posBoutique = routeCode.indexOf('if (estBoutique) {')
  verifier('🔴 I7 les fermetures sont relues AVANT le bloc boutique (donc pour tous)',
    posLecture !== -1 && posBoutique !== -1 && posLecture < posBoutique)
  verifier('I7 relues une seule fois', routeCode.split(".from('fermetures_exceptionnelles')").length - 1 === 1)
  verifier('I7 sauf pour le colis, qui n\'a pas de jour', /if \(!estExpedition\) \{\s*const \{ data: lues, error: errFerm \}/.test(routeCode))
  verifier('I7 une erreur de lecture refuse au lieu de parier', /if \(errFerm\) \{/.test(routeCode))
  verifier('🔴 I7 le congé refuse le retrait ET la livraison',
    /if \(estFermeExceptionnellement\(fermeturesCommercant, date_commande\)\) \{/.test(routeCode)
      && /if \(creneau && !estBoutique\) \{\s*const etatCreneau = creneauCommandable/.test(routeCode))
  // Et la règle elle-même, exécutée : le dernier jour du congé est fermé.
  const conge = [{ date_debut: '2026-10-10', date_fin: '2026-10-12' }]
  verifier('I7 premier jour du congé fermé', estFermeExceptionnellement(conge, '2026-10-10'))
  verifier('I7 dernier jour du congé fermé', estFermeExceptionnellement(conge, '2026-10-12'))
  verifier('I7 le lendemain ouvert', !estFermeExceptionnellement(conge, '2026-10-13'))
  verifier('I7 un congé d\'un jour sans fin', estFermeExceptionnellement([{ date_debut: '2026-10-10T00:00:00' }], '2026-10-10'))
}

// ═══ LE RÉFÉRENTIEL BeSt ADDRESS (chantier zone, 05/10) ═══════════════════
{
  // Le découpage CSV : 4 172 lignes du vrai fichier ont une virgule entre
  // guillemets ; un découpage naïf décale toutes les colonnes.
  const champs = decouperLigneCsv('1,2,"Weiherstraße,Recht",,"dit ""x""",fin')
  egal('BeSt une virgule entre guillemets reste dans le champ', champs, ['1', '2', 'Weiherstraße,Recht', '', 'dit "x"', 'fin'])
  egal('BeSt une fin de ligne Windows est retirée', decouperLigneCsv('a,b\r'), ['a', 'b'])

  const entete = COLONNES_BEST.join(',')
  const idx = indexColonnes(entete)
  let formatChange = false
  try { indexColonnes(entete.replace('house_number', 'numero_maison')) } catch { formatChange = true }
  verifier('🔴 BeSt un fichier dont une colonne a changé n\'écrit rien', formatChange)
  // ⚠️ REPOINTÉE LE 06/10 : `EPSG:31370_x` n'est plus exigée (BOSA la remplace
  // le 11/10) ; la première colonne de la liste est désormais la latitude.
  verifier('BeSt l\'en-tête avec BOM est lu', indexColonnes('﻿' + entete)['EPSG:4326_lat'] === 0)
  // 🔴 L'AVIS BOSA DU 11/10 : les deux formats d'en-tête doivent passer.
  const TOUTES = ['EPSG:31370_x', 'EPSG:31370_y', 'EPSG:4326_lat', 'EPSG:4326_lon', 'address_id',
    'box_number', 'house_number', 'municipality_id', 'municipality_name_de', 'municipality_name_fr',
    'municipality_name_nl', 'postcode', 'postname_fr', 'postname_nl', 'street_id', 'streetname_de',
    'streetname_fr', 'streetname_nl', 'region_code', 'status']
  let ancienOk = true, nouveauOk = true
  try { indexColonnes(TOUTES.join(',')) } catch { ancienOk = false }
  try { indexColonnes(TOUTES.join(',').replace('EPSG:31370_x', 'EPSG:3812_x').replace('EPSG:31370_y', 'EPSG:3812_y')) } catch { nouveauOk = false }
  verifier('🔴 BeSt l\'en-tête d\'avant le 11/10 (Lambert 72) est accepté', ancienOk)
  verifier('🔴 BeSt l\'en-tête d\'après le 11/10 (Lambert 2008, EPSG:3812) est accepté', nouveauOk)
  verifier('BeSt aucune colonne Lambert n\'est exigée (on ne les lit pas)', !COLONNES_BEST.some(c => /31370|3812/.test(c)))

  const ligne = (o) => COLONNES_BEST.map(c => o[c] ?? '').join(',')
  const base = {
    'EPSG:4326_lat': '50.31175', 'EPSG:4326_lon': '4.60552',
    house_number: '6 a', postcode: '5640', postname_fr: 'Biesme', municipality_name_fr: 'Mettet',
    street_id: '7752850', streetname_fr: 'Rue de la Belle Haie', status: 'current',
  }
  const a = adresseDeLigne(decouperLigneCsv(ligne(base)), idx)
  verifier('BeSt une adresse complète est lue', a && a.rue_id === 7752850 && a.code_postal === '5640' && a.localite === 'Biesme')
  verifier('BeSt le numéro est normalisé (« 6 a » = « 6A »)', a?.numero === '6A')
  // 🔴 LE PIÈGE DU FICHIER : 104 304 maisons ont 0,0, converti en un point en France.
  const sansPos = adresseDeLigne(decouperLigneCsv(ligne({ ...base, 'EPSG:4326_lat': '49.29392', 'EPSG:4326_lon': '2.30551' })), idx)
  verifier('🔴 BeSt le faux point en France n\'est JAMAIS gardé comme position', sansPos && sansPos.lat === null && sansPos.lng === null)
  verifier('BeSt une adresse retirée est écartée', adresseDeLigne(decouperLigneCsv(ligne({ ...base, status: 'retired' })), idx) === null)
  verifier('BeSt rue germanophone : le nom allemand prend le relais',
    adresseDeLigne(decouperLigneCsv(ligne({ ...base, streetname_fr: '', streetname_de: 'Hauptstraße' })), idx)?.nom === 'Hauptstraße')

  egal('BeSt recherche sans accents ni apostrophes', normaliserRecherche("Rue de l'Église"), 'rue de l eglise')
  egal('BeSt recherche : ß devient ss', normaliserRecherche('Weiherstraße,Recht'), 'weiherstrasse recht')
  egal('BeSt base d\'un numéro', [baseNumero('15A'), baseNumero('2/1'), baseNumero('B3')], [15, 2, null])

  // L'estimation par les voisins (décision d'Alex, 05/10).
  const rue = [
    { numero: '13', lat: 50.0, lng: 4.0 },
    { numero: '17', lat: 50.4, lng: 4.4 },
    { numero: '14', lat: 51.0, lng: 5.0 },
    { numero: '15', lat: null, lng: null },
    { numero: '13A', lat: null, lng: null },
    { numero: '1', lat: null, lng: null },
    { numero: 'B', lat: null, lng: null },
  ]
  const res = estimerPositions(rue)
  const de = (n) => res.find(m => m.numero === n)
  verifier('BeSt le 15 tombe entre le 13 et le 17, du même côté (pas vers le 14)',
    Math.abs(de('15')?.lat - 50.2) < 1e-9 && Math.abs(de('15')?.lng - 4.2) < 1e-9, JSON.stringify(de('15')))
  verifier('BeSt une maison estimée le dit', de('15')?.origine_position === 'voisins' && de('13')?.origine_position === 'officielle')
  verifier('BeSt le 13A reprend la position du 13', de('13A')?.lat === 50.0 && de('13A')?.lng === 4.0)
  verifier('BeSt un seul voisin du même côté : on prend le plus proche', de('1')?.lat === 50.0)
  verifier('BeSt un numéro sans chiffre reste sans position', !de('B'))
  verifier('🔴 BeSt une rue sans aucune maison située ne range rien',
    estimerPositions([{ numero: '1', lat: null, lng: null }, { numero: '3', lat: null, lng: null }]).length === 0)
  verifier('BeSt l\'entrée n\'est pas modifiée', rue[3].lat === null)

  // La recherche de rues, PARTAGÉE par les deux champs (livraison, commerçant).
  const ruesTest = [
    { nom: 'Rue de la Belle Haie' }, { nom: 'Place du Marché' }, { nom: 'Rue Haute' }, { nom: 'Chemin de la Haie' },
  ]
  egal('rues : chaque mot tapé doit se retrouver', filtrerRues(ruesTest, 'belle haie').map(r => r.nom), ['Rue de la Belle Haie'])
  egal('rues : sans accents', filtrerRues(ruesTest, 'marche').map(r => r.nom), ['Place du Marché'])
  egal('rues : un début de mot passe devant', filtrerRues(ruesTest, 'haie').map(r => r.nom)[0], 'Chemin de la Haie')
  egal('rues : rien tapé, rien proposé', filtrerRues(ruesTest, '  '), [])
  egal('rues : plafond de suggestions', filtrerRues(ruesTest, 'r', 2).length, 2)
  egal('adresse lisible avec numéro', composerAdresseOfficielle({ rue: 'Rue du Mont', numero: '9A', code_postal: '5640', localite: 'Biesme' }), 'Rue du Mont 9A, 5640 Biesme')
  egal('adresse lisible sans numéro (une place)', composerAdresseOfficielle({ rue: 'Place du Marché', code_postal: '5070', localite: 'Fosses-la-Ville' }), 'Place du Marché, 5070 Fosses-la-Ville')
  {
    const champLiv = lire('app/components/ChampAdresseLivraison.js')
    const champOff = lire('app/components/ChampAdresseOfficielle.js')
    verifier('rues : les deux champs passent par le même filtre et le même chargement',
      /filtrerRues\(rues\.liste, texteRue, MAX_SUGGESTIONS\)/.test(champLiv) && /filtrerRues\(rues\.liste, texteRue, MAX_SUGGESTIONS\)/.test(champOff)
        && /useRuesBest\(cp\)/.test(champLiv) && /useRuesBest\(cp\)/.test(champOff))
    verifier('🔴 commerçant (A) : sans numéro, le centre de la rue, et c\'est dit',
      /if \(lat === null && Number\.isFinite\(rue\.lat\) && Number\.isFinite\(rue\.lng\)\) \{\s*lat = rue\.lat; lng = rue\.lng; approximative = true/.test(champOff)
        && /Position approximative : le centre de la rue\./.test(champOff))
    verifier('🔴 commerçant (B) : saisie libre hors Wallonie, SANS position',
      /onChoisir\?\.\(\{ adresse, latitude: null, longitude: null, approximative: false \}\)/.test(champOff))
    verifier('🔴 commerçant : rien n\'est envoyé avant le geste « Utiliser »', (champOff.match(/onChoisir\?\.\(/g) || []).length === 2)
    verifier('🔴 plus aucun appel à Nominatim dans les champs d\'adresse', !/nominatim/i.test(champOff.replace(/^\s*\/\/.*$/gm, '')))
    const inscription = lire('app/signup/page.js')
    verifier('🔴 inscription : le siège passe par le référentiel, libre hors Wallonie',
      /<ChampAdresseOfficielle\s[\s\S]{0,200}libreHorsWallonie/.test(inscription) && !/<ChampAdresse\s/.test(inscription))
    verifier('🔴 inscription : un siège sans position n\'est admis que choisi exprès',
      /\(\(form\.latitude && form\.longitude\) \|\| sansPositionAssumee\)/.test(inscription)
        && /setSansPositionAssumee\(latitude === null \|\| longitude === null\)/.test(inscription))
    const dashLieux = lire('app/dashboard/ConfigDashboard.js')
    egal('🔴 lieux : les 4 champs passent par le référentiel', (dashLieux.match(/<ChampAdresseOfficielle style=\{field\}/g) || []).length, 4)
    verifier('lieux : pas de saisie libre hors Wallonie (un lieu doit être situé)',
      !/<ChampAdresseOfficielle style=\{field\}[^>]*libreHorsWallonie/.test(dashLieux))
    verifier('🔴 l\'ancien champ n\'est plus importé nulle part',
      ![inscription, dashLieux, lire('app/commander/[slug]/page.js')].some(s => /components\/ChampAdresse'/.test(s)))
  }

  // Le script d'import : les garde-fous qui empêchent d'abîmer une base.
  const imp = lire('scripts/import-best-adresses.mjs')
  const impCode = imp.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  verifier('🔴 BeSt import : le projet annoncé doit être celui de l\'adresse',
    /if \(!hote\.startsWith\(`\$\{PROJETS\[projet\]\}\.`\)\)/.test(impCode))
  verifier('🔴 BeSt import : sans --ecrire, rien n\'est écrit',
    impCode.indexOf('if (!ECRIRE) {') !== -1 && impCode.indexOf('if (!ECRIRE) {') < impCode.indexOf('createClient(url, cle'))
  verifier('🔴 BeSt import : un fichier trop petit n\'écrit rien', /if \(lignesMaisons\.length < MINIMUM_MAISONS\) stop\(/.test(impCode))
  verifier('🔴 BeSt import : on n\'efface qu\'APRÈS avoir tout écrit',
    impCode.indexOf(".delete().lt('import_le', importLe)") > impCode.indexOf("await ecrireTout('best_adresses'"))
  verifier('BeSt import : une écriture ratée sort avant l\'effacement',
    /catch \(e\) \{[\s\S]{0,300}process\.exit\(1\)/.test(impCode))
}

// ═══ LA ZONE EN ÉTOILE (Alex 25/09 et 05/10) ═══════════════════════════════
{
  const ficheEtoile = lire('app/commander/[slug]/page.js')
  // Un centre réel : la Rue de la Belle Haie à Biesme (référentiel BeSt).
  const biesme = { lat: 50.31155, lng: 4.60511 }
  const nord5km = pointA(biesme, 0, 5000)
  verifier('étoile : un point posé à 5 km est mesuré à 5 km',
    Math.abs(distanceMetres(biesme, nord5km) - 5000) < 2, String(distanceMetres(biesme, nord5km)))
  verifier('étoile : il est bien au nord (cap 0°)', Math.abs(capDegres(biesme, nord5km)) < 0.01 || Math.abs(capDegres(biesme, nord5km) - 360) < 0.01)
  verifier('étoile : l\'est est à 90°', Math.abs(capDegres(biesme, pointA(biesme, 90, 3000)) - 90) < 0.01)

  const rond = cercle()
  verifier('étoile : le départ est un cercle de 5 km (Alex)', rond.length === NB_POIGNEES && rond.every(r => r === RAYON_DEFAUT_M) && RAYON_DEFAUT_M === 5000)
  verifier('étoile : 12 poignées, une tous les 30°', NB_POIGNEES === 12 && PAS_DEGRES === 30)
  verifier('étoile : poignées plafonnées à 30 km (Alex)', RAYON_MAX_M === 30000 && cercle(99999)[0] === 30000)

  // La forme : 8 km au nord, 3 km à l'est, 5 km ailleurs.
  const forme = cercle(5000); forme[0] = 8000; forme[3] = 3000
  egal('étoile : sur une poignée, la limite est la poignée', Math.round(limiteDansDirection(forme, 0)), 8000)
  egal('étoile : à mi-chemin entre deux poignées, la limite est la moyenne', Math.round(limiteDansDirection(forme, 15)), 6500)
  egal('étoile : à 345°, entre la 12e et la 1re poignée', Math.round(limiteDansDirection(forme, 345)), 6500)
  egal('étoile : un cap négatif ou au-delà de 360 se ramène', Math.round(limiteDansDirection(forme, 360 + 90)), 3000)

  const v1 = dansEtoile({ centre: biesme, rayons: forme, point: pointA(biesme, 0, 7500) })
  verifier('🔴 étoile : 7,5 km au nord est DEDANS (limite 8 km)', v1?.dedans === true, JSON.stringify(v1))
  const v2 = dansEtoile({ centre: biesme, rayons: forme, point: pointA(biesme, 90, 3500) })
  verifier('🔴 étoile : 3,5 km à l\'est est DEHORS (limite 3 km)', v2?.dedans === false && v2.limite_m === 3000, JSON.stringify(v2))
  verifier('étoile : le refus dit la distance, la limite et l\'issue',
    phraseHorsZone(v2) === 'Tu es à 3,5 km du commerce, et il livre jusqu\'à 3,0 km dans ta direction. Tu peux choisir le retrait.', phraseHorsZone(v2))

  // 🔴 L'ABSENCE NE VAUT JAMAIS « DEDANS ».
  verifier('🔴 étoile : sans centre, aucune décision (null)', dansEtoile({ centre: { lat: null, lng: null }, rayons: forme, point: biesme }) === null)
  verifier('🔴 étoile : centre 0,0 refusé', dansEtoile({ centre: { lat: 0, lng: 0 }, rayons: forme, point: biesme }) === null)
  verifier('étoile : une zone de 11 poignées n\'est pas une zone', !zoneValide(forme.slice(0, 11)) && dansEtoile({ centre: biesme, rayons: forme.slice(0, 11), point: biesme }) === null)
  verifier('étoile : une poignée sous 300 m est refusée', !zoneValide([...cercle().slice(0, 11), 200]))
  verifier('étoile : une poignée à virgule est refusée (entiers comme en base)', !zoneValide([...cercle().slice(0, 11), 5000.5]))
  verifier('étoile : `null` = pas d\'étoile', !zoneValide(null))

  // Le contour tracé est la MÊME fonction : chaque point est à la limite.
  const contour = contourEtoile(biesme, forme, 30)
  verifier('étoile : la carte trace la limite, point par point',
    contour.length === 12 && contour.every((p, i) => Math.abs(distanceMetres(biesme, p) - limiteDansDirection(forme, i * 30)) < 2))

  // La contrainte en base reprend la règle.
  const migZone = lire('migrations/MIGRATION_ZONE_ETOILE.sql')
  verifier('étoile : la base exige 12 valeurs entre 300 m et 30 km',
    /cardinality\(zone_rayons_m\) = 12/.test(migZone) && /300 <= ALL \(zone_rayons_m\)/.test(migZone) && /30000 >= ALL \(zone_rayons_m\)/.test(migZone)
      && /array_position\(zone_rayons_m, NULL\) IS NULL/.test(migZone))

  // Le serveur : une seule règle à la fois, sur la position de la maison.
  // ⚠️ REPOINTÉE LE 06/10 : la position de la FICHE n'est plus lue par le
  // serveur (plus de repli, Alex 05/10 au soir). Le centre vient des lieux,
  // garde suivante ; ici on vérifie qu'elle n'est plus chargée du tout.
  verifier('🔴 étoile : le serveur lit l\'étoile, et plus la position de la fiche',
    /\.select\('codes_postaux, frais_fixe, gratuit_des, minimum_commande, actif, zone_rayons_m'\)/.test(routeCode)
      && /horizon_commande, plan, essai_plan, created_at, livraison_actif'\)/.test(routeCode)
      && !/commercant\.(latitude|longitude)\b/.test(routeCode))
  verifier('🔴 étoile : avec une étoile, le code postal ne décide plus',
    /const avecEtoile = zoneValide\(cfg\.zone_rayons_m\)/.test(routeCode) && /if \(!avecEtoile && !zoneCouverte\(cfg\.codes_postaux, code_postal_livraison\)\)/.test(routeCode))
  // ⚠️ REPOINTÉE LE 05/10 (décision C d'Alex) : le centre n'est plus la fiche
  // (= le SIÈGE saisi à l'inscription), mais le lieu permanent principal.
  verifier('🔴 étoile : jugée sur la position de la MAISON du référentiel',
    /point: \{ lat: maison\.lat, lng: maison\.lng \}/.test(routeCode))
  // ⚠️ REPOINTÉE LE 06/10 : « sinon la fiche » est retiré (Alex : l'adresse
  // d'inscription ne localise JAMAIS le commerce). La fiche n'est plus passée.
  verifier('🔴 étoile (C) : le serveur centre sur le lieu principal, jamais la fiche',
    /\.from\('commercant_lieux'\)\s*\.select\('type, principal, actif, latitude, longitude, adresse'\)/.test(routeCode)
      && /const centre = centreDeLaZone\(\{ lieux: lieuxEtoile \|\| \[\] \}\)/.test(routeCode)
      && /dansEtoile\(\{\s*centre,/.test(routeCode)
      && /if \(errLieux\) \{/.test(routeCode))
  {
    const fiche3 = lire('app/commander/[slug]/page.js')
    const dash3 = lire('app/dashboard/ConfigDashboard.js')
    // ⚠️ REPOINTÉES LE 06/10 : plus de fiche passée en repli, ni côté client
    // ni côté réglage (qui ne lit même plus `commercants`).
    verifier('🔴 étoile (C) : la fiche client centre comme le serveur',
      /centre: centreDeLaZone\(\{ lieux: foodtruckEmps \}\)/.test(fiche3))
    verifier('🔴 étoile (C) : le réglage centre comme le serveur',
      /setPointDepart\(centreDeLaZone\(\{ lieux: lieux \|\| \[\] \}\)\)/.test(dash3))
    verifier('🔴 aucun appelant ne repasse la fiche au centre',
      ![routeCode, fiche3, dash3].some(src => /centreDeLaZone\(\{[^}]*commercant/.test(src)))
    // Le libellé demandé par Alex (05/10) et l'issue quand le départ manque.
    verifier('le réglage dit « Ton point de départ des livraisons »',
      /Ton point de départ des livraisons : <strong/.test(dash3) && !/Le centre est \{/.test(dash3))
    verifier('🔴 étoile sans départ : l écran dit que les livraisons sont suspendues, avec le chemin',
      /Tes livraisons sont suspendues : ton point de départ n&rsquo;est plus défini\./.test(dash3)
        && /function allerOuMeTrouver\(\) \{ setAncreProfil\('ou-me-trouver'\); changerOnglet\('profil'\) \}/.test(dash3)
        && /<TabLivraison [^>]*onAllerOuMeTrouver=\{allerOuMeTrouver\}/.test(dash3)
        && /if \(ancre === 'ou-me-trouver'\) setSousOnglet\('lieux'\)/.test(dash3)
        && /<div id="ou-me-trouver"/.test(dash3))
    verifier('🔴 sans départ, le dessin reste bloqué', /onClick=\{\(\) => setZoneRayons\(cercle\(\)\)\} disabled=\{!pointDepart\}/.test(dash3))
  }
  // La règle du centre, exécutée.
  {
    const fiche = { latitude: 50.32, longitude: 4.65, adresse: 'Siège' }
    const lieuP = { type: 'permanent', principal: true, actif: true, latitude: 50.31, longitude: 4.60, adresse: 'Lieu' }
    const lieu2 = { type: 'permanent', principal: false, actif: true, latitude: 50.40, longitude: 4.70, adresse: 'Autre' }
    egal('🔴 centre : le lieu principal gagne', centreDeLaZone({ lieux: [lieu2, lieuP] })?.adresse, 'Lieu')
    egal('centre : sans principal, le premier lieu permanent', centreDeLaZone({ lieux: [{ ...lieu2 }] })?.adresse, 'Autre')
    // ⚠️ REPOINTÉES LE 06/10 : ces trois cas cédaient à la fiche. Ils rendent
    // désormais `null`, MÊME quand on passe une fiche située : c'est la règle
    // d'Alex, et la fiche passée ici prouve qu'elle est ignorée.
    egal('🔴 centre : un lieu sans position ne cède PLUS à la fiche',
      centreDeLaZone({ lieux: [{ ...lieuP, latitude: null, longitude: null }], commercant: fiche }), null)
    egal('🔴 centre : un lieu hebdomadaire ne compte pas, et la fiche non plus',
      centreDeLaZone({ lieux: [{ ...lieuP, type: 'hebdo' }], commercant: fiche }), null)
    egal('🔴 centre : un lieu inactif ne compte pas, et la fiche non plus',
      centreDeLaZone({ lieux: [{ ...lieuP, actif: false }], commercant: fiche }), null)
    egal('🔴 centre : aucun lieu, une fiche située ne suffit pas', centreDeLaZone({ lieux: [], commercant: fiche }), null)
    verifier('🔴 centre : rien de situé, aucun centre (jamais 0,0)',
      centreDeLaZone({ lieux: [] }) === null)
  }
  // L'encart du tableau de bord : les deux cas, exécutés.
  {
    const { etatOuMeTrouver } = await import('../lib/ou-me-trouver.js')
    {
      const situe = { type: 'permanent', principal: true, actif: true, latitude: 50.3, longitude: 4.6, adresse: 'x' }
      const hebdo = { ...situe, type: 'hebdo', principal: false }
      const forme = cercle()
      const e1 = etatOuMeTrouver({ publiee: true, lieux: [] })
      verifier('🔴 encart : fiche en ligne sans lieu situé, on le dit', e1.aucunLieu === true)
      verifier('encart : fiche en ligne avec un emplacement de food truck, rien à dire',
        etatOuMeTrouver({ publiee: true, lieux: [hebdo] }).aucunLieu === false)
      verifier('encart : un lieu sans position ne compte pas',
        etatOuMeTrouver({ publiee: true, lieux: [{ ...situe, latitude: null }] }).aucunLieu === true)
      verifier('encart : fiche pas encore publiée, c est l autre encart qui parle',
        etatOuMeTrouver({ publiee: false, lieux: [] }).aucunLieu === false)
      verifier('🔴 encart : étoile + livraison active sans lieu permanent, livraisons suspendues',
        etatOuMeTrouver({ publiee: true, livraisonActive: true, lieux: [hebdo], zoneRayons: forme }).etoileSansDepart === true)
      verifier('encart : étoile avec lieu permanent situé, rien à dire',
        etatOuMeTrouver({ publiee: true, livraisonActive: true, lieux: [situe], zoneRayons: forme }).etoileSansDepart === false)
      verifier('encart : sans étoile (codes postaux), pas de point de départ exigé',
        etatOuMeTrouver({ publiee: true, livraisonActive: true, lieux: [hebdo], zoneRayons: null }).etoileSansDepart === false)
      verifier('encart : livraison coupée, l étoile ne compte pas',
        etatOuMeTrouver({ publiee: true, livraisonActive: false, lieux: [], zoneRayons: forme }).etoileSansDepart === false)
    }
    const bandeau = lire('app/dashboard/BandeauOuMeTrouver.js')
    verifier('encart : il lit la règle exécutée ci-dessus, jamais une copie',
      /import \{ etatOuMeTrouver \} from '@\/lib\/ou-me-trouver'/.test(bandeau) && /setEtat\(etatOuMeTrouver\(\{/.test(bandeau))
    verifier('🔴 encart : une lecture en échec n affiche rien', /if \(errLieux \|\| cfg\.error\) \{ setEtat\(null\); return \}/.test(bandeau))
    verifier('encart : il ouvre « Où me trouver », pas « Ma fiche »', /ecrireSousOnglet\('lieux'\)\s*onAllerA\?\.\('profil'\)/.test(bandeau))
    verifier('encart : il est affiché dans le tableau de bord',
      /<BandeauOuMeTrouver commercant=\{commercant\} onAllerA=\{ouvrirConfig\}/.test(lire('app/dashboard/page.js')))
  }
  verifier('🔴 étoile : sans centre, le serveur refuse (ne parie pas)', /if \(!verdict\) \{[\s\S]{0,200}code: 'zone_indisponible'/.test(routeCode))
  verifier('🔴 étoile : hors zone, refus avec la phrase', /if \(!verdict\.dedans\) \{[\s\S]{0,120}code: 'hors_zone',\s*error: phraseHorsZone\(verdict\)/.test(routeCode))
  verifier('étoile : la maison est jugée AVANT l\'insertion',
    routeCode.indexOf('dansEtoile({') !== -1 && routeCode.indexOf('dansEtoile({') < routeCode.indexOf(".from('commandes')\n      .insert("))

  // L'écran : même règle, il informe.
  verifier('étoile : la fiche juge comme le serveur',
    /const cpDansZone = avecEtoile\s*\?\s*verdictEtoile\?\.dedans === true\s*:\s*zoneCouverte\(livraisonConfig\?\.codes_postaux, adresseLivraison\.code_postal\)/.test(ficheEtoile))
  verifier('étoile : la fiche ne juge qu\'une maison TROUVÉE', /const verdictEtoile = avecEtoile && adresseLivraison\.situee === true/.test(ficheEtoile))
  verifier('🔴 étoile : une étoile dessinée suffit à proposer la livraison',
    /livraisonConfig\.codes_postaux\?\.length > 0 \|\| zoneValide\(livraisonConfig\.zone_rayons_m\)/.test(ficheEtoile))
  verifier('🔴 étoile : AUCUNE carte dans la fiche client (décision du 25/09)',
    !/CarteZoneEtoile|from 'leaflet'|import\('leaflet'\)|tile\.openstreetmap/.test(ficheEtoile))

  // Le réglage : la carte, chargée à la demande, trace la même fonction.
  const carteSrc = lire('app/dashboard/CarteZoneEtoile.js')
  verifier('étoile : la carte trace `contourEtoile`', /contourEtoile\(centre, r\)/.test(carteSrc))
  verifier('étoile : Leaflet n\'est chargé que dans le navigateur', /import\('leaflet'\)/.test(carteSrc) && !/^import L from 'leaflet'/m.test(carteSrc))
  const cfgDash = lire('app/dashboard/ConfigDashboard.js')
  verifier('étoile : la carte est chargée à la demande', /dynamic\(\(\) => import\('\.\/CarteZoneEtoile'\), \{\s*ssr: false/.test(cfgDash))
  verifier('étoile : le réglage enregistre l\'étoile (ou null)', /zone_rayons_m: zoneRayons,/.test(cfgDash))
  verifier('étoile : une étoile dessinée dispense des codes postaux',
    /if \(zoneRayons === null && codesPostaux\.length === 0\)/.test(cfgDash))
  // ⚠️ REPOINTÉE LE 06/10 : le centre ne vient plus de la fiche mais des lieux
  // (« Où me trouver ») ; il reste relu, jamais saisi.
  verifier('étoile : le point de départ vient des lieux, jamais saisi',
    /from\('commercant_lieux'\)\.select\('type, principal, actif, latitude, longitude, adresse'\)\.eq\('commercant_id', commercantId\)\.eq\('actif', true\)/.test(cfgDash)
      && !/from\('commercants'\)\.select\('latitude, longitude, adresse'\)\.eq\('id', commercantId\)/.test(cfgDash))
}

// ═══ SITUER LE YOPPER SANS NOMINATIM (06/10) ═══════════════════════════════
//
// 🔴 La position GPS précise et le texte tapé partaient du téléphone vers
// OpenStreetMap. Ils passent sur notre référentiel. On EXÉCUTE les règles.
{
  const L = await import('../lib/localiser.js')
  const { localitesDesRues } = await import('../lib/best-adresse.js')
  const mettet = { lat: 50.3200455, lng: 4.6580641 }

  egal('position : arrondie à ~11 m (4 décimales)', L.arrondirPosition({ lat: 50.123456, lng: 4.987654 }), { lat: 50.1235, lng: 4.9877 })
  verifier('position : un texte n\'est pas une position', L.arrondirPosition({ lat: 'x', lng: 4 }) === null)
  verifier('position : Mettet et Bruxelles sont plausibles', L.positionPlausible(mettet) && L.positionPlausible({ lat: 50.8467, lng: 4.3525 }))
  verifier('🔴 position : 0,0 refusé (le piège du zéro)', !L.positionPlausible({ lat: 0, lng: 0 }))
  verifier('position : absente refusée', !L.positionPlausible({ lat: null, lng: null }) && !L.positionPlausible({}))
  verifier('position : Paris est hors du cadre (on ne lit même pas la base)', !L.positionPlausible({ lat: 48.8566, lng: 2.3522 }))

  const r = L.rectangleAutour(mettet, 150)
  const bordNord = distanceMetres(mettet, { lat: r.latMax, lng: mettet.lng })
  const bordEst = distanceMetres(mettet, { lat: mettet.lat, lng: r.lngMax })
  verifier('rectangle : ses bords sont au rayon demandé (le cercle y tient)',
    Math.abs(bordNord - 150) < 1 && Math.abs(bordEst - 150) < 1, `${bordNord.toFixed(1)} / ${bordEst.toFixed(1)}`)
  egal('recherche : deux passes, 60 m puis 150 m', L.RAYONS_RECHERCHE_M, [60, 150])

  const pres = { ...pointA(mettet, 0, 40), numero: '2' }
  const loin = { ...pointA(mettet, 90, 120), numero: '9' }
  egal('maison proche : la plus proche gagne', L.plusProche(mettet, [loin, pres], 150)?.maison?.numero, '2')
  verifier('🔴 maison proche : au-delà du rayon, rien (pas une rue fausse)', L.plusProche(mettet, [loin], 60) === null)
  verifier('maison proche : aucune candidate, rien', L.plusProche(mettet, [], 150) === null)
  egal('pastille : rue et numéro', L.libellePastille({ rue: 'Rue Reine Elisabeth', numero: '2' }), 'Rue Reine Elisabeth 2')
  egal('pastille : sans rue, rien (l\'écran dit « Près de toi »)', L.libellePastille({ rue: '', numero: '2' }), null)

  // La liste des localités, filtrée sur l'appareil.
  const liste = [
    { cp: '5640', nom: 'Mettet', commune: 'Mettet', lat: 50.32, lng: 4.66, n: 3000 },
    { cp: '5640', nom: 'Biesme', commune: 'Mettet', lat: 50.33, lng: 4.61, n: 600 },
    { cp: '5640', nom: 'Saint-Gérard', commune: 'Mettet', lat: 50.35, lng: 4.73, n: 900 },
    { cp: '5070', nom: 'Fosses-la-Ville', commune: 'Fosses-la-Ville', lat: 50.39, lng: 4.69, n: 2500 },
    { cp: '6200', nom: 'Châtelet', commune: 'Châtelet', lat: 50.40, lng: 4.52, n: 9000 },
  ]
  const noms = (t, max) => L.filtrerLocalites(liste, t, max).map(x => x.nom).join(',')
  verifier('🔴 « Mettet » rend Mettet en premier (note de revue Apple)', noms('Mettet').startsWith('Mettet'), noms('Mettet'))
  egal('🔴 « 5640 » rend les localités de 5640, les plus grandes d\'abord (note de revue Apple)', noms('5640'), 'Mettet,Saint-Gérard,Biesme')
  egal('« 56 » : le début du code postal suffit', noms('56'), 'Mettet,Saint-Gérard,Biesme')
  egal('les accents ne comptent pas : « saint gerard »', noms('saint gerard'), 'Saint-Gérard')
  egal('« chatelet » trouve Châtelet', noms('chatelet'), 'Châtelet')
  egal('le nom de la commune trouve ses localités : « mettet » montre aussi Biesme', noms('mettet', 8).split(',').includes('Biesme'), true)
  egal('🔴 hors Wallonie : rien (l\'écran le dit, il n\'invente pas)', noms('Bruxelles'), '')
  egal('rien tapé, rien proposé', noms('   '), '')

  // Le calcul des localités, identique au premier remplissage SQL.
  const loc = localitesDesRues([
    { code_postal: '5640', localite: 'Biesme', commune: 'Mettet', lat: 50.0, lng: 4.0, nb_maisons: 1 },
    { code_postal: '5640', localite: 'Biesme', commune: 'Mettet', lat: 51.0, lng: 5.0, nb_maisons: 3 },
    { code_postal: '4780', localite: null, commune: 'Sankt Vith', lat: 50.28, lng: 6.12, nb_maisons: 10 },
    { code_postal: '5640', localite: 'Oret', commune: 'Mettet', lat: null, lng: null, nb_maisons: 5 },
  ])
  const biesme = loc.find(l => l.localite === 'Biesme')
  verifier('localités : la position est pondérée par le nombre de maisons',
    biesme && biesme.lat === 50.75 && biesme.lng === 4.75 && biesme.nb_maisons === 4, JSON.stringify(biesme))
  verifier('localités : sans nom de localité, celui de la commune', loc.some(l => l.localite === 'Sankt Vith' && l.code_postal === '4780'))
  verifier('localités : une rue non située ne compte pas', !loc.some(l => l.localite === 'Oret'))
  const migLoc = lire('migrations/MIGRATION_BEST_LOCALITES_PROCHE.sql')
  verifier('🔴 le SQL et le script appliquent la MÊME règle (nom de repli, min(commune), pondération)',
    /COALESCE\(NULLIF\(localite, ''\), commune\)/.test(migLoc) && /min\(commune\)/.test(migLoc)
      && /sum\(lat \* nb_maisons\) \/ sum\(nb_maisons\)/.test(migLoc) && /WHERE lat IS NOT NULL AND lng IS NOT NULL AND nb_maisons > 0/.test(migLoc))
  verifier('la table des localités est fermée aux navigateurs comme les autres',
    /REVOKE ALL ON public\.best_localites FROM PUBLIC, anon, authenticated/.test(migLoc) && /permissive/.test(migLoc))
  const script = lire('scripts/import-best-adresses.mjs')
  verifier('l\'import recalcule les localités et nettoie les anciennes',
    /const lignesLocalites = localitesDesRues\(lignesRues\)/.test(script)
      && /ecrireTout\('best_localites', 'code_postal,localite'/.test(script)
      && /for \(const table of \['best_adresses', 'best_rues', 'best_localites'\]\)/.test(script))

  // 🔴 LA POSITION D'UN YOPPER EST UNE DONNÉE PERSONNELLE.
  const proche = lire('app/api/adresse/proche/route.js')
  const procheCode = proche.replace(/^\s*\/\/.*$/gm, '')
  verifier('🔴 /proche : POST seulement (jamais la position dans l\'adresse, journalisée)',
    /export async function POST\(/.test(procheCode) && !/export async function GET\(/.test(procheCode))
  verifier('🔴 /proche : jamais mis en cache', /res\.headers\.set\('Cache-Control', 'no-store'\)/.test(procheCode))
  verifier('🔴 /proche : aucune écriture de journal dans la route', !/console\./.test(procheCode))
  verifier('/proche : limité en débit', /checkLimit\(adressesLimiter, clientIp\(request\)/.test(procheCode))
  verifier('/proche : la position est arrondie AVANT toute lecture', procheCode.indexOf('arrondirPosition(corps)') > 0
    && procheCode.indexOf('arrondirPosition(corps)') < procheCode.indexOf('maisonLaPlusProche('))
  const serveur = lire('lib/best-adresse-serveur.js')
  const fn = serveur.slice(serveur.indexOf('export async function maisonLaPlusProche'), serveur.indexOf('export async function toutesLesLocalites'))
  verifier('🔴 maisonLaPlusProche ne journalise jamais la position',
    fn.length > 100 && !/console\.[a-z]+\([^)]*\b(p|position|lat|lng|r)\b[,)]/.test(fn) && !/console\.[a-z]+\([^)]*\$\{p/.test(fn))
  const accueil = lire('app/commander/page.js')
  const commune = lire('app/commander/ConfirmCommune.js')
  verifier('accueil : la position part arrondie, en POST, vers notre route',
    /const arrondie = arrondirPosition\(\{ lat, lng \}\)\s*const res = await fetch\('\/api\/adresse\/proche', \{\s*method: 'POST'/.test(accueil))
  verifier('commune : même route, position arrondie',
    /fetch\('\/api\/adresse\/proche', \{\s*method: 'POST'[\s\S]{0,120}arrondirPosition\(\{ lat: pos\.coords\.latitude, lng: pos\.coords\.longitude \}\)/.test(commune))
  verifier('accueil : la localité tapée est filtrée sur l\'appareil',
    /const localitesBest = useLocalitesBest\(showLocManuelle\)/.test(accueil) && /filtrerLocalites\(localitesBest\.liste, t, 6\)/.test(accueil))
  verifier('accueil : hors Wallonie, on le dit',
    /Aucune localité wallonne ne correspond\. Yoppaa couvre la Wallonie : choisis une localité wallonne\./.test(accueil))
  verifier('🔴 la CSP n\'autorise plus Nominatim : un appel oublié serait BLOQUÉ',
    !/nominatim\.openstreetmap\.org/.test(lire('next.config.ts').replace(/^\s*\/\/.*$/gm, '')))
}

// ═══ MINEURS DE L'AUDIT (06/10) : SUR PLACE LIMITÉ, ADRESSES PURGÉES ════════
{
  const SP = await import('../lib/sur-place.js')
  const PL = await import('../lib/purge-livraison.js')
  const { sansProse } = await import('./lire-code.mjs')

  // Le « sur place » : 2 en cours au plus, et le plafond du commerçant.
  egal('sur place : au plus 2 en cours (décision d\'Alex)', SP.MAX_SUR_PLACE_EN_COURS, 2)
  const enCours = [
    { client_email: 'Jean@Exemple.be', client_telephone: '0470 12 34 56' },
    { client_email: 'autre@x.be', client_telephone: '0470/123456' },
    { client_email: 'tiers@x.be', client_telephone: '0499000000' },
  ]
  egal('🔴 sur place : reconnu par l\'email (casse ignorée) OU le téléphone (séparateurs ignorés)',
    SP.compterSurPlaceDuClient(enCours, { email: 'jean@exemple.be', telephone: '0470123456' }), 2)
  egal('sur place : changer d\'email ne remet pas le compteur à zéro',
    SP.compterSurPlaceDuClient(enCours, { email: 'nouveau@x.be', telephone: '+32 0470 12 34 56'.replace('+32 ', '') }), 2)
  egal('sur place : un inconnu n\'a rien en cours', SP.compterSurPlaceDuClient(enCours, { email: 'n@x.be', telephone: '0488112233' }), 0)
  verifier('🔴 sur place : la 3e commande en cours est refusée, avec l\'issue en ligne',
    /déjà 2 commandes[\s\S]*choisis le paiement en ligne/.test(SP.refusSurPlace({ duEUR: 10, enCours: 2, enLigneAutorise: true }) || ''))
  verifier('sur place : sans paiement en ligne, on ne renvoie pas vers une porte fermée',
    /appelle le commerce/.test(SP.refusSurPlace({ duEUR: 10, enCours: 2, enLigneAutorise: false }) || ''))
  verifier('sur place : la 2e passe', SP.refusSurPlace({ duEUR: 10, enCours: 1 }) === null)
  verifier('🔴 sur place : au-dessus du plafond, refus qui dit le montant',
    /limité à 40 € par commande/.test(SP.refusSurPlace({ duEUR: 40.01, plafond: 40, enLigneAutorise: true }) || ''))
  verifier('sur place : pile au plafond, ça passe', SP.refusSurPlace({ duEUR: 40, plafond: 40 }) === null)
  verifier('sur place : plafond vide = aucune limite (le comportement d\'avant)',
    SP.refusSurPlace({ duEUR: 9999, plafond: null }) === null && SP.refusSurPlace({ duEUR: 9999, plafond: '' }) === null)
  verifier('sur place : un plafond à virgule se lit', /limité à 12,50 €/.test(SP.refusSurPlace({ duEUR: 13, plafond: 12.5 }) || ''))

  const cc = sansProse(lire('app/api/stripe/checkout/create-commande/route.js'))
  const iGarde = cc.indexOf('const refus = refusSurPlace({')
  const iInsert = cc.indexOf(".from('commandes')\n      .insert(")
  verifier('🔴 sur place : la règle s\'applique AVANT la création de la commande', iGarde > 0 && iInsert > iGarde)
  verifier('sur place : seulement pour un paiement sur place, après le calcul du dû',
    /if \(surPlace\) \{\s*const \{ data: enCoursSurPlace, error: errSurPlace \}/.test(cc) && cc.indexOf('const duEUR =') < iGarde)
  verifier('🔴 sur place : une lecture en échec REFUSE (pas un zéro)', /if \(errSurPlace\) \{[\s\S]{0,400}status: 500/.test(cc))
  verifier('sur place : on compte les commandes EN COURS non payées en ligne du commerce',
    /\.eq\('commercant_id', commercant\.id\)\s*\.eq\('paye_en_ligne', false\)\s*\.in\('statut', STATUTS_COMMANDE_EN_COURS\)/.test(cc))
  verifier('sur place : le plafond est lu avec le commerçant', /accepte_paiement_cash, paiement_sur_place_max, categorie/.test(cc))
  const migSP = lire('migrations/MIGRATION_PLAFOND_SUR_PLACE.sql')
  verifier('sur place : la colonne a son droit de mise à jour et sa contrainte',
    /GRANT UPDATE \(paiement_sur_place_max\) ON public\.commercants TO authenticated/.test(migSP)
      && /paiement_sur_place_max > 0 AND paiement_sur_place_max <= 10000/.test(migSP))
  const tp = sansProse(lire('app/dashboard/TabPaiements.js'))
  // 🔴 TROUVÉ PAR ALEX LE 06/10 : « je ne sais rien taper dans le champ ».
  // Le filtre avait perdu sa barre oblique inverse (`/[^d,.]/g`) : il effaçait
  // tous les chiffres. La garde EXÉCUTE le filtre du fichier sur une saisie.
  {
    const m = tp.match(/setPlafondSurPlace\(e\.target\.value\.replace\((\/[^/]+\/g), ''\)\.slice\(0, 8\)\)/)
    const filtre = m ? new Function(`return ${m[1]}`)() : null
    verifier('🔴 sur place : le champ du plafond accepte les chiffres (« 12,50 » reste « 12,50 »)',
      !!filtre && '12,50'.replace(filtre, '') === '12,50' && 'a1b2'.replace(filtre, '') === '12', m ? m[1] : 'filtre introuvable')
  }
  verifier('sur place : le commerçant règle son plafond (vide = pas de limite)',
    /\.update\(\{ paiement_sur_place_max: valeur === null \? null :/.test(tp) && /Paiement sur place jusqu’à/.test(tp))

  // L'adresse de livraison : effacée 6 mois après.
  egal('purge : 6 mois (décision d\'Alex)', PL.DUREE_ADRESSE_LIVRAISON_MOIS, 6)
  egal('purge : le 6 octobre → le 6 avril', PL.dateLimitePurge(new Date('2026-10-06T10:00:00Z')), '2026-04-06')
  egal('🔴 purge : le 31 août → le 28 février, jamais le 3 mars', PL.dateLimitePurge(new Date('2026-08-31T10:00:00Z')), '2026-02-28')
  egal('purge : on traverse l\'année', PL.dateLimitePurge(new Date('2026-03-15T10:00:00Z')), '2025-09-15')
  egal('purge : la date est celle de Bruxelles (23 h 30 UTC le 31/12 = 1er janvier)',
    PL.dateLimitePurge(new Date('2026-12-31T23:30:00Z')), '2026-07-01')
  egal('🔴 purge : seules l\'adresse, la position et la note partent (le total et la TVA restent)',
    PL.COLONNES_PURGEES, ['adresse_livraison', 'livraison_lat', 'livraison_lng', 'note_livraison'])
  const purge = sansProse(lire('app/api/cron/purge-adresses-livraison/route.js'))
  verifier('🔴 purge : sans secret, la tâche refuse', /refusCron\(gardeCron\(req, 'cron\/purge-adresses-livraison'\), NextResponse\)/.test(purge))
  verifier('purge : seulement avant la date limite', /\.update\(effacement\(\)\)\s*\.lt\('date_commande', limite\)/.test(purge))
  verifier('purge : aucune adresse dans le journal', !/console\.[a-z]+\([^)]*adresse_livraison/.test(purge))
  verifier('purge : la tâche est programmée chaque mois',
    (JSON.parse(lire('vercel.json')).crons || []).some(c => c.path === '/api/cron/purge-adresses-livraison' && c.schedule === '0 3 1 * *'))
  verifier('purge : /legal le dit', /Adresse, position et note de livraison d’une commande : effacées 6 mois après la commande/.test(lire('app/legal/page.js')))
}

// ═══ MINEURS DE L'AUDIT (06/10) : ANNONCES VRAIES, COORDONNÉES, MOT AU CLIENT ═
{
  const { annonceConforme } = await import('../lib/notif-statut.js')
  const { sansProse } = await import('./lire-code.mjs')
  const cmd = (o) => ({ statut: 'pret', statut_livraison: null, mode_retrait: 'retrait', ...o })
  verifier('annonce : « prête » pour une commande prête', annonceConforme(cmd({}), 'pret'))
  verifier('🔴 annonce : jamais « prête » pour une commande annulée',
    !annonceConforme(cmd({ statut: 'annulee_commercant' }), 'pret') && !annonceConforme(cmd({ statut: 'annulee_client_refund' }), 'pret'))
  verifier('annonce : « en préparation » seulement si elle l\'est', annonceConforme(cmd({ statut: 'en_preparation' }), 'en_preparation') && !annonceConforme(cmd({}), 'en_preparation'))
  verifier('annonce : « colis parti » seulement pour une expédition passée en récupérée',
    annonceConforme(cmd({ statut: 'recupere', mode_retrait: 'expedition' }), 'expediee') && !annonceConforme(cmd({ statut: 'recupere' }), 'expediee'))
  verifier('🔴 annonce : « ta commande arrive » jamais pour une commande annulée en tournée',
    annonceConforme(cmd({ mode_retrait: 'livraison', statut_livraison: 'en_livraison' }), 'en_livraison')
      && !annonceConforme(cmd({ mode_retrait: 'livraison', statut_livraison: 'en_livraison', statut: 'annulee_commercant' }), 'en_livraison'))
  verifier('annonce : « livrée » seulement si livrée et terminée',
    annonceConforme(cmd({ mode_retrait: 'livraison', statut_livraison: 'livree', statut: 'recupere' }), 'livree')
      && !annonceConforme(cmd({ mode_retrait: 'livraison', statut_livraison: 'livree', statut: 'pret' }), 'livree'))
  verifier('annonce : un statut inconnu ne part jamais', !annonceConforme(cmd({}), 'nimporte'))
  for (const [chemin, appel, cols] of [
    ['app/api/commande/push-statut/route.js', 'if (!annonceConforme(cmd, statut)) {', 'mode_retrait, statut, statut_livraison,'],
    ['app/api/emails/commande-prete/route.js', "if (!annonceConforme(cmd, 'pret')) {", 'mode_retrait, statut, statut_livraison,'],
  ]) {
    const src = sansProse(lire(chemin))
    const iGarde = src.indexOf(appel)
    const iEnvoi = Math.max(src.indexOf('envoyerPushParExternalId('), src.indexOf('envoyerAuCommercant('))
    verifier(`🔴 ${chemin} : relit le statut et refuse AVANT d'envoyer`, src.includes(cols) && iGarde > 0 && iGarde < iEnvoi, `${iGarde} / ${iEnvoi}`)
  }

  // Les coordonnées, vérifiées partout où un client les tape.
  for (const chemin of ['app/api/stripe/checkout/create-rdv-acompte/route.js', 'app/api/stripe/checkout/create-rdv-commande/route.js',
    'app/api/stripe/checkout/create-rdv-empreinte/route.js', 'app/api/rdv/reserver/route.js']) {
    verifier(`🔴 coordonnées vérifiées (forme + longueur) : ${chemin}`,
      /refusCoordonnees\(\{ email: client_email, telephone: client_telephone, prenom: client_prenom, nom: client_nom \}\)/.test(sansProse(lire(chemin))))
  }
  verifier('coordonnées : l\'abonnement garde son téléphone facultatif',
    /refusCoordonnees\(\{[^}]*telephoneFacultatif: true \}\)/.test(sansProse(lire('app/api/stripe/checkout/create-abonnement/route.js'))))
  verifier('coordonnées : bons cadeaux et préinscription suivent la même règle d\'email',
    /emailValide\(v\)/.test(sansProse(lire('app/api/bons-cadeaux/checkout/route.js'))) && /emailValide\(v\)/.test(sansProse(lire('app/api/pre-inscription/route.js'))))
  const { refusCoordonnees } = await import('../lib/coordonnees-client.js')
  verifier('téléphone facultatif : absent, ça passe ; fourni et faux, refusé',
    refusCoordonnees({ email: 'a@b.be', telephone: '', telephoneFacultatif: true }) === null
      && /téléphone/.test(refusCoordonnees({ email: 'a@b.be', telephone: 'abc', telephoneFacultatif: true }) || ''))

  // Un mot pour le client à l'annulation.
  const bord = sansProse(lire('app/dashboard/page.js'))
  verifier('🔴 mot au client : la fenêtre d\'annulation a son champ, et le mot part au serveur',
    /champ: \{ label: 'Un mot pour ton client \(facultatif\)'/.test(bord)
      && /postPro\('\/api\/commande\/annuler-commercant', \{ commande_id: commande\.id, \.\.\.\(motif \? \{ motif \} : \{\}\) \}\)/.test(bord))
  const poste = sansProse(lire('app/dashboard/PosteConfirmation.js'))
  verifier('mot au client : la fenêtre rend le texte seulement quand elle a un champ (rien ne change ailleurs)',
    /avecChamp && valeur != null \? \{ valeur, texte \} : \(valeur \?\? null\)/.test(poste))

  // Les suppressions de créneau lisent leur erreur.
  const cfg = sansProse(lire('app/dashboard/ConfigDashboard.js'))
  verifier('créneaux : une lecture ratée ne vaut pas « aucune commande »',
    /const \{ data: cmdLiees, error: errLiees \}[\s\S]{0,200}if \(errLiees\)/.test(cfg) && /const \{ data, error: errLect \}[\s\S]{0,200}if \(errLect\)/.test(cfg))
  verifier('fidélité : plus de second appel écran après « livrer »',
    !/statutLivraison === 'livree' \|\| statutLivraison === 'retiree_magasin'\) crediterFideliteCommande/.test(bord)
      // Le Poste : seulement dans la séquence « livrée » (le retrait au
      // comptoir, lui, garde son crédit).
      && !/dire\('Commande livrée'\)\s*await prevenir\('\/api\/fidelite\/crediter'/.test(sansProse(lire('app/equipe/PosteEquipe.js')))
      && /dire\('Commande livrée'\)\s*await prevenir\('\/api\/livraison\/statut'/.test(sansProse(lire('app/equipe/PosteEquipe.js'))))
}

// ═══ DÉCISIONS D'ALEX DU 06/10 : FIDÉLITÉ RETIRÉE, PAS DE LIVRAISON AU FUTUR ═
{
  const { retirerCredit, appliquerCredit } = await import('../lib/fidelite.js')
  const { livraisonAuFutur, champsLivraison } = await import('../lib/livraison-geste.js')
  const { sansProse } = await import('./lire-code.mjs')
  const passages = { fidelite_mecanique: 'passages', fidelite_seuil_passages: 5 }
  const cagnotte = { fidelite_mecanique: 'cagnotte', fidelite_taux_cagnotte: 10, fidelite_seuil_cagnotte: 10 }

  // Un aller-retour exact : créditer puis retirer rend la carte d'avant.
  {
    const avant = { passages: 2, cagnotte: 0, recompenses_disponibles: 0 }
    const { patch } = appliquerCredit(passages, avant, { passages: 1 })
    const r = retirerCredit(passages, patch, { type: 'passage', valeur: 1 })
    verifier('🔴 fidélité : créditer puis retirer un passage rend la carte d\'avant',
      r.patch.passages === 2 && r.patch.recompenses_disponibles === 0 && r.aRetirer === 0 && r.manque === 0, JSON.stringify(r))
  }
  {
    // Le 5e passage débloque une récompense : la retirer la reprend.
    const { patch, debloquees } = appliquerCredit(passages, { passages: 4, recompenses_disponibles: 0 }, { passages: 1 })
    const r = retirerCredit(passages, patch, { type: 'passage', valeur: 1 })
    verifier('🔴 fidélité : la récompense débloquée par ce passage repart avec lui',
      debloquees === 1 && r.patch.passages === 4 && r.patch.recompenses_disponibles === 0 && r.aRetirer === 1, JSON.stringify(r))
  }
  {
    // Récompense déjà utilisée : jamais de carte négative, et on le dit.
    const r = retirerCredit(passages, { passages: 0, recompenses_disponibles: 0 }, { type: 'passage', valeur: 1 })
    verifier('🔴 fidélité : récompense déjà utilisée, la carte reste à zéro (jamais négative), et c\'est dit',
      r.patch.passages === 0 && r.patch.recompenses_disponibles === 0 && r.manque === 1 && r.aRetirer === 0, JSON.stringify(r))
  }
  {
    // Cagnotte : 10 % de 30 € = 3 €, retirés au même taux.
    const { patch } = appliquerCredit(cagnotte, { cagnotte: 4, recompenses_disponibles: 0 }, { montant: 30 })
    const r = retirerCredit(cagnotte, patch, { type: 'cagnotte', valeur: 30 })
    verifier('🔴 fidélité : la cagnotte rend exactement ce qu\'elle avait reçu', patch.cagnotte === 7 && r.patch.cagnotte === 4 && r.retire === 3, JSON.stringify(r))
    const { patch: p2, debloquees } = appliquerCredit(cagnotte, { cagnotte: 8, recompenses_disponibles: 0 }, { montant: 30 })
    const r2 = retirerCredit(cagnotte, p2, { type: 'cagnotte', valeur: 30 })
    verifier('fidélité : cagnotte qui avait débloqué une récompense : elle repart, la cagnotte revient',
      debloquees === 1 && r2.patch.cagnotte === 8 && r2.patch.recompenses_disponibles === 0 && r2.aRetirer === 1, JSON.stringify(r2))
  }
  verifier('fidélité : un mouvement inconnu ne touche à rien',
    retirerCredit(passages, { passages: 3, recompenses_disponibles: 1 }, { type: 'ajustement' }).patch.passages === 3)

  // ⚠️ DANS LA FONCTION DE RETRAIT SEULEMENT : `crediterFidelite`, plus haut,
  // porte la même mise à jour de carte (le mot présent AILLEURS).
  const fsTout = sansProse(lire('lib/fidelite-server.js'))
  const iRetrait = fsTout.indexOf('export async function retirerFideliteCommande(')
  const fs = iRetrait >= 0 ? fsTout.slice(iRetrait, fsTout.indexOf('export async function crediterFideliteRdv(', iRetrait)) : ''
  verifier('🔴 fidélité : la ligne de crédit est supprimée AVANT de toucher la carte (deux retraits ne retirent qu\'une fois)',
    fs.indexOf(".from('fidelite_mouvements').delete().eq('id', mvt.id)") > 0
      && fs.indexOf(".from('fidelite_mouvements').delete().eq('id', mvt.id)") < fs.indexOf(".from('fidelite_cartes').update(patch).eq('id', carte.id)"))
  verifier('fidélité : une récompense réservée par une commande ou un RDV en cours n\'est jamais retirée',
    /const aSupprimer = ids\.filter\(id => !reservees\.has\(id\)\)\.slice\(0, aRetirer\)/.test(fs))
  verifier('🔴 fidélité : retirée au retour arrière ET à l\'annulation',
    /const fidelite = await retirerFideliteCommande\(admin, c\.id, '\[commande\/retour-arriere\]'\)/.test(sansProse(lire('lib/commande-gestes-serveur.js')))
      && /await retirerFideliteCommande\(supabase, commande\.id, journal\)/.test(sansProse(lire('lib/commande-annulation-server.js'))))

  // Pas de livraison au futur.
  const maintenant = new Date('2026-10-06T10:00:00Z')
  const cmd = (o) => ({ mode_retrait: 'livraison', statut: 'pret', statut_livraison: null, total: 0, paye_en_ligne: true, ...o })
  verifier('🔴 livraison : demain ne part pas aujourd\'hui', livraisonAuFutur(cmd({ date_commande: '2026-10-07' }), maintenant)
    && /prévue le 07\/10/.test(champsLivraison(cmd({ date_commande: '2026-10-07' }), 'en_livraison', { maintenant }).refus || ''))
  verifier('livraison : aujourd\'hui passe', champsLivraison(cmd({ date_commande: '2026-10-06' }), 'livree', { maintenant }).refus === null)
  verifier('livraison : hier se clôture encore (oubli)', champsLivraison(cmd({ date_commande: '2026-10-05' }), 'livree', { maintenant }).refus === null)
  verifier('livraison : sans date connue, on ne bloque pas', !livraisonAuFutur(cmd({}), maintenant))
  verifier('livraison : le serveur lit la date', /mode_retrait, date_commande, total/.test(lire('lib/livraison-serveur.js')))
}

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
// ⚠️ CETTE GARDE S'ANCRAIT SUR LE FORMAT, PAS SUR LA RÈGLE. Elle exigeait
// littéralement `m.toFixed(2)` : le jour où les montants du commerçant sont
// passés à la virgule (28/08), elle a rougi alors que la phrase disait
// toujours ce qu'elle doit dire. Ce qu'elle protège, c'est que le commerçant
// LISE son minimum dans l'aperçu, pas la façon de l'écrire.
verifier('l\'aperçu annonce le minimum au commerçant', /à partir de \$\{euros\(m\)\} de commande/.test(dash))

// La migration existe et vérifie l'état réel de la base.
const mig = lire('migrations/MIGRATION_LIVRAISON_MINIMUM.sql')
verifier('la migration ajoute la colonne', /ADD COLUMN IF NOT EXISTS minimum_commande/.test(mig))
verifier('sa vérification interroge la base', /information_schema\.columns/.test(mig))

// ═══════════════════════════════════════════════════════════════════════════
// 6. LA TOURNÉE (10/08)
// ═══════════════════════════════════════════════════════════════════════════
const tournee = lire('app/api/livraison/tournee-optimisee/route.js')
const tourneeCode = tournee.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

// ⚠️ LA FUITE D'ADRESSES. La première version acceptait une liste
// d'identifiants de commande venue du navigateur, SANS AUCUNE
// AUTHENTIFICATION, lisait en service_role et renvoyait pour chacun
// l'ADRESSE DE LIVRAISON. Quiconque présentait des identifiants obtenait les
// adresses des clients, et pouvait même mélanger plusieurs commerçants dans un
// seul appel : le premier servait de point de départ, tous les autres
// livraient leurs adresses.
// ⚠️ ON VÉRIFIE L'APPEL, PAS L'EXISTENCE DU CONTRÔLE. Mes premiers tests
// cherchaient `auth_user_id !== user.id` n'importe où dans le fichier : ils
// restaient verts quand on supprimait l'APPEL en gardant la fonction. Un
// garde-fou jamais appelé ne garde rien.
// ⚠️ REPOINTÉES LE 06/10 : la route est ouverte au livreur (décision d'Alex).
// Le contrôle n'est plus « propriétaire seulement » mais la garde d'équipe
// (`gardeEquipe`, case « Livraisons »), qui authentifie et refuse elle-même :
// patron et admin passent, un membre seulement avec la case.
verifier('le contrôle passe par la garde d\'équipe, case « Livraisons »',
  /const verdict = await gardeEquipe\(request, supabase, commercant_id, 'livraisons'\)/.test(tourneeCode))
verifier('et son refus coupe la requête AVANT toute lecture',
  /const nonAutorise = refus\(verdict, NextResponse\)\s*if \(nonAutorise\) return nonAutorise/.test(tourneeCode)
    && tourneeCode.indexOf('if (nonAutorise) return nonAutorise') < tourneeCode.indexOf(".from('commandes')"))
verifier('le commerce vient de la garde, jamais du corps de la requête seul',
  /const commercant = verdict\.commercant/.test(tourneeCode))
verifier('l\'ancienne garde « propriétaire seulement » a disparu', !/async function commercantDuProprietaire/.test(tourneeCode))
// LE TEST QUI COMPTE : la route ne doit accepter AUCUN identifiant de commande.
// C'est elle qui choisit les commandes, à partir du commerce authentifié.
verifier('la route n\'accepte plus de liste de commandes', !/commande_ids/.test(tourneeCode))
verifier('elle sélectionne les commandes elle-même',
  /\.eq\('commercant_id', commercant\.id\)/.test(tourneeCode))
verifier('le tableau de bord envoie son jeton',
  /Authorization: `Bearer \$\{session\.access_token\}`/.test(lire('app/dashboard/page.js')))

// ⚠️ UNE TOURNÉE = UN CRÉNEAU. Avant, toutes les livraisons du jour partaient
// dans un seul itinéraire : un commerçant livrant à midi ET le soir recevait
// un trajet mélangeant les deux, donc inutilisable.
verifier('la tournée porte sur un créneau', /creneau_livraison_id/.test(tourneeCode))
verifier('et sur un jour précis', /\.eq\('date_commande', date\)/.test(tourneeCode))
const dashLiv = lire('app/dashboard/page.js')
// Là aussi, on vise la DÉCLARATION exacte : chercher le mot laissait passer un
// simple renommage, et le regroupement disparaissait sans faire rougir.
verifier('le tableau de bord groupe les livraisons par créneau',
  /const tourneesDuJour = /.test(dashLiv) && /tourneesDuJour\.map\(t =>/.test(dashLiv))
verifier('il annonce la plage horaire de chaque tournée', /Tournée \{plage\}/.test(dashLiv))
// Une livraison sans créneau n'entre dans aucune tournée : le dire plutôt que
// de la laisser disparaître de l'écran d'organisation.
verifier('les livraisons sans créneau sont signalées', /livraisonsSansCreneau/.test(dashLiv))

// ⚠️ GOOGLE MAPS N'ACCEPTE QUE NEUF ÉTAPES par lien, et IGNORE le reste SANS
// RIEN DIRE. Un commerçant avec quinze livraisons croirait avoir son
// itinéraire complet et en oublierait cinq sur la route.
verifier('les arrêts sont découpés par lien', /ARRETS_PAR_LIEN/.test(tourneeCode))
verifier('la limite reste sous celle de Maps',
  Number(/const ARRETS_PAR_LIEN = (\d+)/.exec(tourneeCode)?.[1]) <= 10)
verifier('plusieurs liens sont renvoyés', /itineraires: liensItineraire/.test(tourneeCode))
verifier('le découpage est annoncé au commerçant', /Maps limite un itinéraire à dix arrêts/.test(dashLiv))
// Chaque segment repart du dernier arrêt du précédent, sinon la tournée
// recommencerait au commerce à chaque lien.
verifier('les segments s\'enchaînent', /origine = destination/.test(tourneeCode))

// ⚠️ LE DÉPART EST LE LIEU D'ACTIVITÉ, PAS LE SIÈGE (Alex, 15/08).
//
// Il partait de `commercants.latitude/longitude`, c'est-à-dire de l'adresse
// d'inscription. Celle-ci ne sert plus qu'à valider le dossier : faire partir
// une tournée de là enverrait le livreur au DOMICILE d'un commerçant inscrit
// chez lui, et lui ferait recalculer tout son trajet depuis le mauvais point.
// ⚠️ REPOINTÉE LE 06/10 (Alex, tableau) : plus le « lieu du jour » (calculé à
// la date d'AUJOURD'HUI, drapeau `principal` ignoré), mais le lieu principal
// permanent, le MÊME point que le centre de la zone. On EXÉCUTE la règle.
verifier('🔴 le départ est le centre de la zone, une seule règle',
  /const depart = centreDeLaZone\(\{ lieux: lieuxCom \|\| \[\] \}\)/.test(tourneeCode)
  && !/lieuxDuJour/.test(tourneeCode))
{
  const { centreDeLaZone } = await import('../lib/zone-etoile.js')
  const p = (o) => ({ actif: true, adresse: 'x', ...o })
  const lieux = [
    p({ type: 'permanent', principal: false, latitude: 50.40, longitude: 4.60 }),
    p({ type: 'hebdo', jour_semaine: 1, latitude: 50.50, longitude: 4.70 }),
    p({ type: 'permanent', principal: true, latitude: 50.32, longitude: 4.65 }),
  ]
  const d = centreDeLaZone({ lieux })
  verifier('🔴 deux lieux permanents : on part du PRINCIPAL, pas du premier', d?.lat === 50.32 && d?.lng === 4.65, JSON.stringify(d))
  verifier('🔴 un lieu principal sans position : pas de départ inventé',
    centreDeLaZone({ lieux: [p({ type: 'permanent', principal: true, latitude: null, longitude: null })] }) === null)
  verifier('un marché de la semaine seul ne fait pas un départ',
    centreDeLaZone({ lieux: [p({ type: 'hebdo', jour_semaine: 1, latitude: 50.5, longitude: 4.7 })] }) === null)
}
// ⚠️ Et pas d'un géocodage à chaque clic. Nominatim est un service public dont
// la règle d'usage est d'une requête par seconde : le rappeler à chaque
// optimisation est un gaspillage et un risque de blocage.
// ⚠️ REPOINTÉE LE 05/10 (Alex : « supprimer Nominatim ») : le dernier recours
// a disparu avec `lib/geocode.js`. Un lieu sans position est signalé, pas deviné.
verifier('🔴 plus aucun géocodage dans la tournée', !/geocoderAdresse\(|lib\/geocode/.test(tourneeCode))
// ⚠️ REPOINTÉE LE 06/10 : le test d'absence vit dans `centreValide`, et le
// banc l'EXÉCUTE plus haut (« un lieu principal sans position »). Ici, on
// vérifie que la tournée refuse bien quand il n'y a pas de départ.
verifier('un départ sans position n\'est pas lu comme 0,0',
  /const depart = centreDeLaZone\([^)]*\)\s*\n(?:\s*const lieuDepart = [^\n]*\n)?\s*if \(!depart\) \{/.test(tourneeCode))
// Et le message d'erreur envoie au bon endroit : « Profil », section des lieux,
// et non plus vers une adresse que le commerçant ne peut pas corriger là.
verifier('un lieu non géolocalisable renvoie vers la bonne section',
  /Où me trouver/.test(tourneeCode))

// Une commande déjà livrée n'a rien à faire dans une tournée.
//
// ⚠️ CETTE GARDE VERROUILLAIT LE DÉFAUT, et c'est la quatrième fois sur ce
// projet. Elle exigeait la présence LITTÉRALE de `.neq('statut_livraison',
// 'livree')`, c'est-à-dire l'écriture exacte qui vidait la tournée : corriger
// le bug la faisait rougir. Elle dit maintenant l'INTENTION — les livrées
// sortent — sans imposer la façon (reference_tests_faussement_verts).
verifier('les livrées sont exclues', /statut_livraison\.neq\.livree/.test(tourneeCode))
// ⚠️ ANCRÉE SUR L'USAGE, PAS SUR LE MOT. Écrite `/STATUTS_OCCUPENT_CRENEAU/`,
// elle trouvait la constante dans la LIGNE D'IMPORT : remplacer le filtre par
// une liste écrite à la main la laissait parfaitement verte, et la tournée
// aurait oublié les commandes en préparation. Mesurée par mutation le 23/08.
// ⚠️ REPOINTÉE LE 05/10 (audit I6) : la tournée lit les commandes EN COURS,
// plus celles qui OCCUPENT un créneau (qui comptent les paniers en paiement).
// Toujours le module partagé, jamais une liste à la main.
verifier('les statuts de la tournée viennent du module partagé',
  /\.in\('statut', STATUTS_COMMANDE_EN_COURS\)/.test(tourneeCode),
  'une liste écrite à la main divergerait du reste de l\'application')
{
  const { STATUTS_COMMANDE_EN_COURS } = await import('../lib/statuts-commande.js')
  verifier('🔴 I6 un panier pas encore payé n’entre pas dans la tournée',
    !STATUTS_COMMANDE_EN_COURS.includes('paiement_en_attente'))
  verifier('I6 une commande prête y entre', STATUTS_COMMANDE_EN_COURS.includes('pret'))
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 bis. LES MESSAGES AU YOPPER, SELON LE MODE
// ═══════════════════════════════════════════════════════════════════════════
const routePrete = lire('app/api/emails/commande-prete/route.js')

// ⚠️ « PRÊTE À RETIRER » N'A AUCUN SENS POUR UNE LIVRAISON. Le message était
// écrit pour le retrait : un client en livraison recevait « Prête à retirer »,
// l'adresse du COMMERCE et un lien d'itinéraire vers la boutique, alors qu'il
// attend chez lui.
// ⚠️ ON REND LES EMAILS POUR DE VRAI et on lit ce qui en sort. Chercher un mot
// dans le fichier source ne prouve rien : le message peut contenir la bonne
// phrase dans une branche jamais atteinte. Ici, le HTML jugé est exactement
// celui que le Yopper recevra.
const COMMUN = {
  yopper_prenom: 'Alex', commercant_nom: 'La Mie de Test',
  commercant_adresse: 'Rue Albert Premier 10, 5640 Mettet', commercant_slug: 'la-mie',
  numero_commande: 42, heure_debut: '11:15:00', heure_fin: '11:30:00',
}
const mailRetrait = emailCommandePrete({ ...COMMUN })
const mailLivraison = emailCommandePrete({
  ...COMMUN, est_livraison: true, adresse_livraison: 'Rue de Prée 9G, 5640 Mettet',
})

// Le message de retrait, lui, ne doit pas bouger.
verifier('retrait : on dit de venir retirer', mailRetrait.includes('Prête à retirer'))
verifier('retrait : l\'adresse du commerce est donnée', mailRetrait.includes('Rue Albert Premier 10'))
verifier('retrait : l\'itinéraire vers la boutique est proposé', mailRetrait.includes('Itinéraire Google Maps'))
verifier('retrait : la plage horaire s\'affiche', mailRetrait.includes('11:15') && mailRetrait.includes('11:30'))

// ⚠️ LE DÉFAUT CORRIGÉ : un client en LIVRAISON recevait ce message-là.
verifier('livraison : on ne lui dit pas de venir retirer', !mailLivraison.includes('Prête à retirer'))
verifier('livraison : aucun itinéraire vers la boutique', !mailLivraison.includes('Itinéraire Google Maps'))
verifier('livraison : c\'est SON adresse qui est rappelée',
  mailLivraison.includes('Rue de Prée 9G') && !mailLivraison.includes('Rue Albert Premier 10'))
verifier('livraison : on lui dit de rester joignable', mailLivraison.includes('rester joignable'))
verifier('livraison : la plage horaire s\'affiche aussi', mailLivraison.includes('11:15'))
verifier('livraison : le numéro de commande est là', mailLivraison.includes('42'))

// Sans horaire connu, aucune ligne d'heure ne doit s'imprimer. Avant, le
// gabarit écrivait toujours la ligne et affichait « ? → ? ».
const mailSansHeure = emailCommandePrete({ ...COMMUN, heure_debut: null, heure_fin: null })
verifier('sans horaire, pas de « ? → ? »', !mailSansHeure.includes('?'))

verifier('la route passe bien le mode', /est_livraison:\s+estLivraison/.test(routePrete))
verifier('et l\'adresse de livraison', /adresse_livraison: cmd\.adresse_livraison/.test(routePrete))

// ⚠️ L'HEURE VENAIT DE LA MAUVAISE TABLE. Une livraison a `creneau_id` à null
// et son horaire dans `livraison_creneaux` : le message affichait « ? → ? ».
verifier('la route lit les deux tables de créneaux',
  /creneau:creneaux\(/.test(routePrete) && /creneau_livraison:livraison_creneaux\(/.test(routePrete))
verifier('et choisit la bonne selon le mode',
  /const creneau = estLivraison \? cmd\.creneau_livraison : cmd\.creneau/.test(routePrete))
// ⚠️ Une plage inconnue ne doit plus s'imprimer « ? → ? » dans l'email. Elle
// ne s'affiche QUE si elle est connue. Le test vise les emails de commande,
// pas tout le fichier : les emails de rendez-vous ont leur propre logique.
// ⚠️ AUCUN EMAIL N'EXISTAIT SUR « EN ROUTE », uniquement un push. Le push web
// ne marche pas partout — Chrome sur iPhone ne le supporte pas — et c'est le
// message qu'il ne faut surtout pas rater. Rendu pour de vrai, lui aussi.
const mailEnRoute = emailCommandeEnLivraison({
  yopper_prenom: 'Alex', commercant_nom: 'La Mie de Test', numero_commande: 42,
  adresse_livraison: 'Rue de Prée 9G, 5640 Mettet',
  heure_debut: '18:00:00', heure_fin: '19:00:00',
})
verifier('en route : le client sait que c\'est parti', /en route|arrive/i.test(mailEnRoute))
verifier('en route : son adresse est rappelée', mailEnRoute.includes('Rue de Prée 9G'))
verifier('en route : le créneau est rappelé', mailEnRoute.includes('18:00') && mailEnRoute.includes('19:00'))
verifier('en route : on lui demande de confirmer la réception', /confirme la réception/i.test(mailEnRoute))
verifier('en route : le lien mène au suivi', mailEnRoute.includes('onglet=commandes'))
// Il ne doit surtout pas parler de retrait : personne ne se déplace.
verifier('en route : aucun vocabulaire de retrait',
  !/retirer|comptoir|viens le chercher/i.test(mailEnRoute))
const routeStatutLiv = lire('app/api/livraison/statut/route.js')
verifier('il est réellement envoyé', /emailCommandeEnLivraison\(\{/.test(routeStatutLiv))
verifier('uniquement au départ, pas à l\'arrivée',
  /statut_livraison === 'en_livraison' && cmd\.client_email/.test(routeStatutLiv))
// L'email ne doit pas dépendre du push : un push qui échoue ne doit pas
// emporter l'email avec lui.
verifier('l\'email part avant le push',
  routeStatutLiv.indexOf('emailCommandeEnLivraison(') < routeStatutLiv.indexOf('envoyerPushParExternalId('))
verifier('son échec ne casse pas la suite',
  /catch \(e\) \{[\s\S]{0,120}?email en route KO/.test(routeStatutLiv))

// ═══════════════════════════════════════════════════════════════════════════
// 7. LA SÉPARATION CLICK & COLLECT / LIVRAISON
// ═══════════════════════════════════════════════════════════════════════════
// Deux métiers, deux écrans. Un commerçant au comptoir ne doit pas voir les
// livraisons dans sa file de retraits, et inversement.
verifier('le tableau de bord sépare les deux vues',
  /vueMode === 'livraison' \? c\.mode_retrait === 'livraison' : c\.mode_retrait !== 'livraison'/.test(dashLiv))
verifier('la bascule n\'apparaît que si le commerce livre', /const livraisonActive = !!commercant\?\.livraison_actif/.test(dashLiv))

const fiche = lire('app/commander/[slug]/page.js')
// Côté client : le mode livraison n'existe que si le commerçant l'a activé ET
// configuré. Un commerce sans zone ne doit pas proposer un choix qui échouera.
// ⚠️ REPOINTÉE LE 05/10 (étoile) : la configuration, c'est des codes postaux
// OU une étoile dessinée. La règle reste : activation ET une zone.
verifier('la livraison client exige activation ET configuration',
  /livraison_actif && livraisonConfig\s*&& \(livraisonConfig\.codes_postaux\?\.length > 0 \|\| zoneValide\(livraisonConfig\.zone_rayons_m\)\)/.test(fiche))
// Les créneaux ne se mélangent jamais : deux tables, deux états, deux
// calendriers.
verifier('les créneaux de livraison sont un état séparé', /joursDisposLivraison/.test(fiche))
verifier('le créneau choisi est distinct de celui du retrait', /creneauLivraisonChoisi/.test(fiche))
verifier('la commande envoie l\'un OU l\'autre', /creneau_livraison_id: creneauLivraisonChoisi\?\.id/.test(fiche))
// Le serveur ne doit jamais accepter un créneau de retrait pour une livraison.
verifier('le serveur lit le créneau dans la bonne table',
  /estLivraison[\s\S]{0,300}?from\('livraison_creneaux'\)/.test(route))
verifier('et range la commande du bon côté',
  /creneau_id: \(estLivraison \|\| estBoutique\) \? null : creneau\.id/.test(route)
  && /creneau_livraison_id: estLivraison \? creneau\.id : null/.test(route))

// ═══ 22/08 — L'ADRESSE QUI RAPPORTE ENFIN SES COORDONNÉES ═════════════════
//
// ⚠️ LE DÉFAUT : « Aucune adresse géolocalisée dans cette tournée » sur des
// adresses parfaitement valides. Ni le géocodeur ni les colonnes n'étaient en
// cause. C'est CE QU'ON LUI DONNAIT qui ne pouvait pas marcher : la chaîne
// d'AFFICHAGE, complément compris, avec le code postal recollé par-dessus.
{
  // ─── Les deux chaînes, EXÉCUTÉES ────────────────────────────────────────
  const a = { rue: 'Rue de Prée 9', complement: 'Boîte 3', code_postal: '5640', ville: 'Biesme', note: 'Portail bleu' }

  verifier('l\'adresse affichée porte le complément',
    composerAdresseLivraison(a) === 'Rue de Prée 9, Boîte 3, 5640 Biesme',
    composerAdresseLivraison(a))

  // ⚠️ LE CŒUR DU CORRECTIF. Le complément est une information de PORTE, pas de
  // RUE : aucun géocodeur ne sait quoi en faire, et avec `limit=1` il ne rend
  // rien du tout. Il ne doit JAMAIS entrer dans la requête.
  verifier('la requête de géocodage EXCLUT le complément',
    !requeteGeocodage(a).includes('Boîte'), requeteGeocodage(a))
  verifier('et ne répète pas le code postal',
    (requeteGeocodage(a).match(/5640/g) || []).length === 1, requeteGeocodage(a))
  verifier('la requête de géocodage est bien formée',
    requeteGeocodage(a) === 'Rue de Prée 9, 5640, Biesme', requeteGeocodage(a))

  // ⚠️ SANS RUE, AUCUNE REQUÊTE. Géocoder « 5640 Biesme » rendrait le centre du
  // village : une coordonnée fausse mais plausible, sur laquelle une tournée
  // entière se construirait sans que rien ne le dise.
  verifier('sans rue, on ne géocode pas du tout',
    requeteGeocodage({ code_postal: '5640', ville: 'Biesme' }) === '')
  verifier('une rue faite d\'espaces ne compte pas',
    requeteGeocodage({ rue: '   ', code_postal: '5640' }) === '')

  // ─── Les coordonnées venues du navigateur ───────────────────────────────
  verifier('une coordonnée belge passe', coordonneesPlausibles(50.33, 4.55) === true)
  verifier('Paris est refusé', coordonneesPlausibles(48.85, 2.35) === false)
  // ⚠️ `Number(null)` VAUT 0, et le point 0/0 tombe au large du golfe de Guinée :
  // un test écrit à l'envers l'accepterait comme une coordonnée valide.
  verifier('null est refusé', coordonneesPlausibles(null, null) === false)
  verifier('undefined est refusé', coordonneesPlausibles(undefined, undefined) === false)
  verifier('le point zéro est refusé', coordonneesPlausibles(0, 0) === false)
  verifier('une chaîne vide est refusée', coordonneesPlausibles('', '') === false)
  verifier('NaN est refusé', coordonneesPlausibles(NaN, NaN) === false)

  // ─── Le paquet envoyé à l'API ───────────────────────────────────────────
  const payload = champsAdressePourAPI({ ...a, lat: 50.33, lng: 4.55 })
  verifier('le paquet porte des coordonnées quand elles sont plausibles',
    payload.livraison_lat === 50.33 && payload.livraison_lng === 4.55)
  verifier('et rien quand elles ne le sont pas',
    champsAdressePourAPI({ ...a, lat: 48.85, lng: 2.35 }).livraison_lat === null)
  verifier('le paquet porte la requête propre',
    payload.adresse_geocodage === 'Rue de Prée 9, 5640, Biesme')
  verifier('la note voyage', payload.note_livraison === 'Portail bleu')
  verifier('une note vide devient null',
    champsAdressePourAPI({ ...a, note: '   ' }).note_livraison === null)
  // ⚠️ TRONQUÉE, et pas seulement à l'écran : rien n'oblige un appelant à
  // passer par le champ du navigateur.
  verifier('une note trop longue est tronquée',
    champsAdressePourAPI({ ...a, note: 'x'.repeat(500) }).note_livraison.length === NOTE_MAX)

  // ─── « Sur place » ne veut rien dire quand on se fait livrer ────────────
  const duLivraison = etatPaiementClient({ mode_retrait: 'livraison', total: 20, paye_en_ligne: false })
  const duRetrait = etatPaiementClient({ mode_retrait: 'retrait', total: 20, paye_en_ligne: false })
  verifier('en livraison, le Yopper règle AU LIVREUR',
    /livreur/.test(duLivraison?.libelle || ''), duLivraison?.libelle)
  verifier('et il sait qu\'il doit préparer de quoi payer',
    /Prépare de quoi payer/.test(duLivraison?.detail || ''), duLivraison?.detail)
  verifier('en retrait, le texte ne parle PAS de livreur',
    !/livreur/.test(`${duRetrait?.libelle} ${duRetrait?.detail}`), duRetrait?.libelle)

  // ─── Le branchement des écrans ──────────────────────────────────────────
  // ⚠️ ON DÉCOUPE LE BLOC D'ADRESSE, jamais le fichier entier : la fiche fait
  // plus de 4000 lignes et le mot « adresse » y vit à vingt endroits.
  const debutLiv = fiche.indexOf('Adresse de livraison</p>')
  const blocLiv = debutLiv === -1 ? '' : fiche.slice(debutLiv, debutLiv + 2200)
  verifier('le bloc d\'adresse de livraison se découpe', blocLiv.length > 500)
  // ⚠️ LA BALISE EN ENTIER, PAS SON DÉBUT. Mesuré par mutation : renommer le
  // composant en `<NoteLivraisonRetiree` laissait la garde VERTE, parce que
  // `<NoteLivraison` en est un préfixe. Un motif qui n'exige pas la fin d'un
  // nom accepte tous ses homonymes plus longs.
  // ⚠️ REPOINTÉE LE 05/10 (chantier zone) : la livraison passe par le
  // référentiel officiel (`ChampAdresseLivraison`), plus par Nominatim.
  verifier('l\'adresse de livraison se choisit dans le référentiel officiel',
    /<ChampAdresseLivraison\s/.test(blocLiv) && !/<ChampAdresse\s/.test(blocLiv))
  verifier('🔴 BeSt le paiement exige une maison TROUVÉE (règle B)',
    /const livraisonFormOk = !!\(adresseLivraison\.situee === true && adresseLivraison\.rue_id && cpDansZone && choixLivraisonValable\)/.test(fiche))
  // ⚠️ REPOINTÉE LE 05/10 (étoile) : sans étoile, la comparaison normalisée
  // reste celle du serveur ; avec, c'est l'étoile (gardée dans le bloc étoile).
  verifier('BeSt l\'écran compare la zone comme le serveur',
    /:\s*zoneCouverte\(livraisonConfig\?\.codes_postaux, adresseLivraison\.code_postal\)/.test(fiche))
  verifier('BeSt une adresse mémorisée est REVÉRIFIÉE au retour',
    /setAdresseLivraison\(prev => \(\{ \.\.\.prev, \.\.\.p, situee: null, lat: null, lng: null \}\)\)/.test(fiche))
  // Visée sur le CODE (l'adresse du service, l'import de l'ancien champ), pas
  // sur le mot : les commentaires qui racontent pourquoi on l'a retiré le citent.
  verifier('🔴 BeSt plus aucun appel à Nominatim dans la fiche',
    !/nominatim\.openstreetmap\.org/.test(fiche) && !/from '@\/app\/components\/ChampAdresse'/.test(fiche))
  verifier('🔴 BeSt ni dans le nouveau champ', !/nominatim\.openstreetmap\.org/.test(lire('app/components/ChampAdresseLivraison.js')))
  verifier('et la note est juste en dessous', /<NoteLivraison\s/.test(blocLiv))

  const debutExp = fiche.indexOf('Adresse d&rsquo;expédition</p>')
  const blocExp = debutExp === -1 ? '' : fiche.slice(debutExp, debutExp + 2200)
  verifier('le bloc d\'adresse d\'expédition se découpe', blocExp.length > 500)
  // ⚠️ REPOINTÉE LE 05/10 : DEUX SAISIES DIFFÉRENTES, PAR DÉCISION D'ALEX. Un
  // colis peut partir hors de Wallonie, que le référentiel ne couvre pas, et
  // il n'a pas besoin de position : saisie libre, sans Nominatim.
  verifier('l\'expédition garde une saisie LIBRE, sans suggestions',
    /<input value=\{adresseLivraison\.rue\} onChange=\{e => majAdresse\(\{ rue: e\.target\.value \}\)\}/.test(blocExp)
      && !/<ChampAdresse/.test(blocExp))
  // ⚠️ ON COMPTE LES DEUX, ON N'EN VÉRIFIE PAS UN. Mesuré : la note est posée
  // à DEUX endroits, et l'expédition vient AVANT la livraison dans le fichier.
  // Une garde qui n'inspectait que le bloc livraison restait verte quand celle
  // de l'expédition disparaissait. C'est le défaut « chercher au lieu de
  // compter » (reference_tests_faussement_verts).
  verifier('et sa propre note', /<NoteLivraison\s/.test(blocExp))
  verifier('la note est posée aux DEUX endroits, pas un',
    (fiche.match(/<NoteLivraison\s/g) || []).length === 2,
    `trouvé ${(fiche.match(/<NoteLivraison\s/g) || []).length}`)

  // ⚠️ UNE RETOUCHE À LA MAIN INVALIDE LES COORDONNÉES. Sans ça, éditer la rue
  // après avoir choisi une suggestion enverrait le livreur à l'adresse d'avant,
  // en silence. Mieux vaut aucune coordonnée qu'une fausse.
  verifier('toute saisie manuelle efface les coordonnées',
    /function majAdresse\(champs\) \{\s*\n\s*setAdresseLivraison\(p => \(\{ \.\.\.p, \.\.\.champs, lat: null, lng: null \}\)\)/.test(fiche))

  // ─── Le serveur ─────────────────────────────────────────────────────────
  // 🔴 REPOINTÉES LE 05/10 (chantier zone, I1). Elles exigeaient que le serveur
  // CROIE les coordonnées du navigateur, puis géocode chez Nominatim. Les deux
  // sont désormais interdites : la position vient de la maison du référentiel.
  verifier('🔴 I1 le serveur ne lit plus les coordonnées du navigateur',
    !/livraison_lat\)|Number\(livraison_lat\)|coordonneesPlausibles\(/.test(routeCode))
  verifier('🔴 I1 et n\'appelle plus aucun géocodeur', !/geocoderAdresse\(/.test(routeCode) && !/lib\/geocode/.test(routeCode))
  verifier('🔴 I1 la maison est cherchée PAR le code postal de la commande',
    /situerMaison\(supabase, \{\s*rueId: best_rue_id,\s*codePostal: code_postal_livraison,\s*numero: numero_livraison,\s*\}\)/.test(routeCode))
  verifier('🔴 règle B une maison absente refuse la livraison',
    /if \(!maison\.trouvee\) \{[\s\S]{0,120}code: 'adresse_introuvable'/.test(routeCode))
  verifier('BeSt une base muette refuse aussi (pas de pari)', /if \(!maison\.ok\) \{/.test(routeCode))
  verifier('BeSt la position enregistrée est celle de la maison',
    /const coordsLivraison = estLivraison && maisonLivraison\s*\?\s*\{ lat: maisonLivraison\.lat, lng: maisonLivraison\.lng \}/.test(routeCode))
  verifier('BeSt l\'adresse enregistrée porte le nom OFFICIEL de la rue',
    /rue: `\$\{maisonLivraison\.rue\} \$\{maisonLivraison\.numero\}`/.test(routeCode)
      && /adresse_livraison: \(estLivraison \|\| estExpedition\) \? adresseEnregistree : null/.test(routeCode))
  verifier('BeSt la maison est cherchée APRÈS la zone et AVANT l\'insertion',
    routeCode.indexOf('zoneCouverte(cfg.codes_postaux') < routeCode.indexOf('situerMaison(supabase')
      && routeCode.indexOf('situerMaison(supabase') < routeCode.indexOf(".from('commandes')\n      .insert("))
  // ⚠️ IL NE DOIT PLUS JAMAIS GÉOCODER LA CHAÎNE D'AFFICHAGE : c'est la forme
  // exacte du défaut du 22/08.
  verifier('il ne géocode plus la chaîne d\'affichage',
    !/geocoderAdresse\(adresse_livraison, code_postal_livraison\)/.test(route))
  verifier('la note est enregistrée', /note_livraison: \(estLivraison \|\| estExpedition\)/.test(route))

  // ─── L'ARGENT DE LA LIVRAISON, LE SEUL QUI N'ÉTAIT PAS RELEVÉ ───────────
  //
  // ⚠️ `changerStatutLivraison` posait `statut: 'recupere'` EN DUR, sautant la
  // question que `changerStatut` pose depuis le 17/08. Une livraison réglée au
  // livreur devenait une commande récupérée sans moyen de paiement, invisible
  // dans le journal. Et c'est le cas où la trace manque le plus : le livreur
  // encaisse loin du comptoir, souvent en liquide.
  const dash = lire('app/dashboard/page.js')
  const debutCSL = dash.indexOf('async function changerStatutLivraison')
  const corpsCSL = debutCSL === -1 ? '' : dash.slice(debutCSL, dash.indexOf('\n  }', debutCSL))
  verifier('le corps de changerStatutLivraison se découpe', corpsCSL.length > 200)
  verifier('une livraison demande son encaissement avant de se clore',
    /resteAEncaisserCommande\(c\) > 0/.test(corpsCSL) && /setCommandeAEncaisser\(/.test(corpsCSL))
  // ⚠️ ET LA RÈGLE EST RÉUTILISÉE, PAS RECOPIÉE : deux copies finiraient par
  // diverger, et l'une des deux mentirait sur l'argent.
  // ⚠️ REPOINTÉE LE 05/10 (I5) : la réponse reprend LE geste qui l'a
  // demandée, « livrée » ou « retirée au magasin ».
  verifier('la réponse d\'encaissement sait clore une LIVRAISON',
    /_viaLivraison/.test(dash)
    && /changerStatutLivraison\(commandeAEncaisser\.id, commandeAEncaisser\._viaLivraison === 'retiree_magasin' \? 'retiree_magasin' : 'livree', \{ champs \}\)/.test(dash))
  verifier('la note du Yopper s\'affiche sur la carte du commerçant',
    /commande\.note_livraison && \(/.test(dash))
  verifier('et une adresse non localisée est annoncée', /non localisée/.test(dash))
}

// ═══ 🔴 LA TOURNÉE QUI NE TROUVAIT AUCUNE LIVRAISON ═══════════════════════
//
// ⚠️ Alex, 23/08 : deux livraisons à l'écran, « Tournée 18:00–19:00 ·
// 2 livraisons », et le calcul répondait « Aucune livraison à faire sur ce
// créneau ». La cause n'était pas dans les statuts : NULL N'EST NI ÉGAL NI
// DIFFÉRENT. Un `.neq('statut_livraison', 'livree')` s'évalue à NULL pour toute
// commande dont la livraison n'a pas commencé, et un prédicat NULL n'est pas
// vrai : la requête les écartait TOUTES.
//
// ⚠️ ET L'ÉCRAN DISAIT VRAI : il écrit la même règle en JavaScript, où
// `null !== 'livree'` vaut bien true. Deux règles recopiées dans deux langages,
// et l'absence ne s'y comporte pas pareil (reference_deux_formes_absence).
{
  const route = lire('app/api/livraison/tournee-optimisee/route.js')
  verifier('🔴 la tournée garde les livraisons pas encore parties',
    /statut_livraison\.is\.null/.test(route),
    'les commandes fraîches seraient toutes écartées')
  verifier('et elle écarte bien celles déjà livrées',
    /statut_livraison\.neq\.livree/.test(route))

  // ⚠️ LA GARDE QUI EMPÊCHE LA RÉCIDIVE, ET ELLE VAUT POUR PLUSIEURS FICHIERS.
  // `statut_livraison` est nullable (MIGRATION_LIVRAISON), donc aucun `.neq()`
  // ne peut l'interroger sans perdre les lignes vides. `mode_retrait`, lui, est
  // `NOT NULL DEFAULT 'retrait'`, d'où sa présence légitime ailleurs.
  //
  // ⚠️ ET ELLE LIT LE CODE SANS SES COMMENTAIRES — CINQUIÈME FOIS EN TROIS
  // JOURS que je cherche un mot et que je le trouve dans MA PROPRE PROSE : le
  // commentaire qui explique ce piège contient forcément l'écriture fautive.
  // Retirer le commentaire serait perdre l'explication ; on dépouille donc le
  // texte avant de chercher, une fois pour toutes.
  const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
  for (const chemin of ['app/api/livraison/tournee-optimisee/route.js', 'app/dashboard/page.js',
    'app/api/livraison/statut/route.js', 'app/api/cron/rappels-retrait/route.js']) {
    verifier(`${chemin} n'interroge pas statut_livraison avec .neq()`,
      !/\.neq\(\s*['"]statut_livraison['"]/.test(sansCommentaires(lire(chemin))),
      'NULL n\'est ni égal ni différent : les lignes vides disparaîtraient')
  }

  // ⚠️ LE REFUS DIT CE QUI RESTE POSSIBLE. Sans coordonnées, seul le CALCUL de
  // l'itinéraire est impossible : les adresses sont sur les cartes et la
  // tournée se fait à la main. Répondre « aucune adresse géolocalisée » posait
  // un mur au moment précis où le commerçant doit partir livrer.
  verifier('le refus sans coordonnées dit que la tournée reste faisable',
    /à faire à la main/.test(route))
  verifier('et il nomme les commandes concernées',
    /sansCoords\.map\(s => `#\$\{s\.numero\}`\)/.test(route))
  // ⚠️ ET IL NE FAIT PAS SORTIR LES ADRESSES DANS LE MESSAGE : elles voyagent
  // déjà dans `sans_coords`, réservé au propriétaire authentifié.
  verifier('le message de refus ne recopie aucune adresse',
    !/\$\{s\.adresse/.test(route))
}


// ═══ L'EXPÉDITION N'EST PAS UN RETRAIT ══════════════════════════════════════
//
// 🔴 « LES PUSHS D'EXPÉDITION SONT EMPRUNTÉS AU TUNNEL DE RETRAIT » (Alex,
// 26/08). Le mode de retrait était testé en BINAIRE — livraison, ou « le
// reste » — et un colis tombait dans « le reste ». Le client qui avait payé un
// envoi à domicile recevait « Ta commande est prête 🎉 … t'attend », l'adresse
// DU MAGASIN, un bouton « Itinéraire Google Maps » et « À tout de suite ». Il
// pouvait faire la route pour rien.
//
// ⚠️ « LE RESTE » N'EST PAS UNE CATÉGORIE, C'EST UN OUBLI. Chaque fois qu'un
// écran teste UN mode et met tous les autres dans un `else`, le mode ajouté
// ensuite hérite de messages écrits pour un autre métier, en silence.
{
  const COMMUN_EXP = {
    yopper_prenom: 'Alexandre', commercant_nom: 'La Boutique Témoin',
    commercant_adresse: 'Rue de Prée 9G, 5640 Mettet', commercant_slug: 'boutique-temoin',
    numero_commande: 'EX2',
  }
  const pretColis = emailCommandePrete({ ...COMMUN_EXP, est_expedition: true })
  verifier('« prête » pour un colis ne propose pas d\'itinéraire',
    !pretColis.includes('Itinéraire Google Maps'))
  verifier('« prête » pour un colis ne dit pas « à tout de suite »',
    !pretColis.includes('À tout de suite'))
  verifier('« prête » pour un colis ne donne pas l\'adresse du magasin',
    !pretColis.includes('Rue de Prée'))
  verifier('« prête » pour un colis annonce le suivi à venir',
    pretColis.includes('numéro de suivi dès que le colis'))
  // ⚠️ ET LE RETRAIT GARDE LE SIEN. Une correction qui casse le cas d'origine
  // n'est pas une correction.
  const pretRetrait = emailCommandePrete({ ...COMMUN_EXP })
  verifier('le retrait, lui, garde son itinéraire',
    pretRetrait.includes('Itinéraire Google Maps'))

  // Le push suit la même règle, et c'est le même fichier qui les portait tous.
  const routePush = lire('app/api/commande/push-statut/route.js')
  verifier('le push distingue l\'expédition du retrait',
    /const estExpedition = cmd\.mode_retrait === 'expedition'/.test(routePush))
  verifier('le push d\'un colis parti existe',
    /statut === 'expediee'/.test(routePush))
  verifier('et la route l\'accepte en entrée',
    /'en_preparation', 'pret', 'expediee'/.test(routePush))
  // ⚠️ ET IL RELIT LE TRANSPORTEUR EN BASE. Sans la colonne dans le select, le
  // message repart sans nom, sans erreur, en silence.
  verifier('le push relit le transporteur',
    /expedition_suivi, expedition_transporteur/.test(routePush))
}

// ═══ UN NUMÉRO DE SUIVI SEUL NE SE SUIT NULLE PART ══════════════════════════
//
// 🔴 « IL FAUT POUVOIR AJOUTER LE NOM DU TRANSPORTEUR AVEC LE NUMÉRO
// D'EXPÉDITION. LE NOM DOIT AUSSI S'AFFICHER CÔTÉ YOPPER » (Alex, 26/08).
// Avant ça, les deux écrans affichaient « Suivi : 0072638628362826 » : ce n'est
// pas une information, c'est une chaîne de caractères.
{
  verifier('un transporteur connu se nomme', nomTransporteur('bpost') === 'bpost')
  // ⚠️ AUCUN REPLI SUR « INCONNU » : une commande partie avant le 26/08 n'a pas
  // de transporteur, ce n'est pas la même chose qu'un transporteur illisible.
  verifier('un transporteur absent ne s\'invente pas', nomTransporteur(null) === null)
  verifier('un transporteur inconnu non plus', nomTransporteur('chronopost') === null)

  verifier('le lien de suivi se fabrique',
    (suiviUrl('bpost', '0072638628362826') || '').includes('0072638628362826'))
  // ⚠️ IL FAUT LES DEUX. L'un sans l'autre ne mène nulle part, et un lien mort
  // est pire qu'un numéro nu : il donne l'impression d'avoir été suivi.
  verifier('pas de lien sans numéro', suiviUrl('bpost', '') === null)
  verifier('pas de lien sans transporteur', suiviUrl(null, '123') === null)
  verifier('pas de lien pour « autre transporteur »', suiviUrl('autre', '123') === null)
  // Le numéro voyage échappé : il finit dans une URL.
  verifier('un numéro douteux ne s\'injecte pas dans l\'URL',
    !(suiviUrl('bpost', 'a b&c=1') || '').includes('&c=1'))

  verifier('la ligne dit le transporteur ET le numéro',
    libelleExpedition('bpost', '00726') === 'bpost · 00726')
  verifier('le transporteur seul suffit', libelleExpedition('bpost', null) === 'bpost')
  verifier('le numéro seul aussi', libelleExpedition(null, '00726') === '00726')
  // ⚠️ RIEN À DIRE → RIEN D'AFFICHÉ. Un « Suivi : » suivi du vide est pire que
  // pas de ligne du tout.
  verifier('rien des deux ne rend rien', libelleExpedition(null, null) === null)

  // L'email
  const mailBpost = emailCommandeExpediee({
    yopper_prenom: 'Alexandre', commercant_nom: 'X', numero_commande: 'EX2',
    expedition_suivi: '0072638628362826', expedition_transporteur: 'bpost',
  })
  // ⚠️ ON CHERCHE LA PHRASE, PAS LE MOT. « bpost » figure aussi dans
  // `track.bpost.cloud` : une garde qui cherche le mot reste VERTE alors que le
  // nom a disparu de l'email. Mesuré par mutation le 26/08, et la première
  // écriture de cette garde était justement muette.
  verifier('l\'email nomme le transporteur', mailBpost.includes('Par bpost'))
  verifier('l\'email propose le lien de suivi', mailBpost.includes('Suivre mon colis chez'))
  verifier('le numéro garde ses zéros de tête', mailBpost.includes('0072638628362826'))
  const mailNu = emailCommandeExpediee({ yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'EX3' })
  verifier('sans transporteur ni numéro, aucun cadre vide',
    !mailNu.includes('Numéro de suivi') && !mailNu.includes('Transporteur'))

  // Les deux écrans, et la colonne qui doit arriver jusqu'à eux.
  const dash = lire('app/dashboard/page.js')
  verifier('le tableau de bord affiche le transporteur',
    /libelleExpedition\(commande\.expedition_transporteur, commande\.expedition_suivi\)/.test(dash))
  // 🔴 LE `window.prompt()` A DISPARU : boîte grise du système, un seul champ,
  // pas de transporteur, et un clavier alphabétique devant seize chiffres.
  //
  // ⚠️ ON DÉPOUILLE LES COMMENTAIRES AVANT DE CHERCHER, et c'est la TROISIÈME
  // fois de la journée : les deux commentaires qui expliquent ce qu'on a
  // retiré contiennent forcément l'écriture fautive, et faisaient rougir la
  // garde. Retirer l'explication serait perdre la mémoire du défaut ; on
  // cherche donc dans le CODE, pas dans la prose.
  const codeSeul = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
  verifier('le tableau de bord n\'ouvre plus de prompt système',
    !/window\.prompt/.test(codeSeul(dash)))
  // ⚠️ REPOINTÉE LE 05/10 (audit I3) : l'écriture vit dans la route serveur.
  // L'écran envoie le transporteur, la route l'écrit.
  verifier('la commande est marquée avec son transporteur',
    /postPro\('\/api\/commande\/expedier', \{ commande_id: commandeId, transporteur: transporteur \|\| null/.test(dash)
    && /expedition_transporteur: cle,/.test(lire('app/api/commande/expedier/route.js')))
  const appli = lire('app/commander/page.js')
  verifier('le Yopper voit le transporteur dans ses commandes',
    /libelleExpedition\(c\.expedition_transporteur, c\.expedition_suivi\)/.test(appli))
  const routeMail = lire('app/api/emails/commande-expediee/route.js')
  verifier('la route d\'email relit le transporteur en base',
    /expedition_suivi, expedition_transporteur/.test(routeMail))
}

// ═══ CE QUI A FAIT BAISSER LE PRIX SE DIT, PARTOUT ══════════════════════════
//
// 🔴 « IL FAUT AUSSI MENTIONNER QUAND UN MONTANT DE LA FIDÉLITÉ OU BC A ÉTÉ
// UTILISÉ » (Alex, 26/08, capture à l'appui : une commande à 36,00 € portant
// « À payer 26,00 € », et rien pour expliquer les dix euros manquants).
//
// ⚠️ LE BON CADEAU ÉTAIT DIT, LA RÉCOMPENSE NON. Elle avait été branchée dans
// les CALCULS le matin même ; les PHRASES étaient restées au bon cadeau seul.
// Un montant juste que personne ne peut expliquer se lit comme une erreur.
{
  const cmd = { total: 36, fidelite_remise: 10 }
  verifier('le commerçant lit d\'où vient l\'écart',
    /10,00[\s ]€ de récompense fidélité/.test(etatPaiementCommande(cmd)?.detail || ''))
  verifier('et le montant réclamé reste le bon',
    etatPaiementCommande(cmd)?.libelle === `À payer ${euros(26)}`)
  // ⚠️ ORDRE D'APPLICATION, jamais alphabétique : la récompense d'abord (une
  // remise), le bon cadeau ensuite (de l'argent déjà payé).
  const deux = etatPaiementCommande({ total: 30, fidelite_remise: 5, bon_cadeau_montant: 20 })
  verifier('les deux avantages se disent dans l\'ordre où ils s\'appliquent',
    (deux?.detail || '').indexOf('récompense') < (deux?.detail || '').indexOf('bon cadeau'))
  // ⚠️ RIEN À DIRE → PAS DE PHRASE. Jamais « dont 0,00 € de récompense ».
  verifier('sans avantage, aucune phrase inventée',
    etatPaiementCommande({ total: 36 })?.detail === null)
  verifier('phraseAvantages se tait sur zéro',
    phraseAvantages({ fidelite_remise: 0, bon_cadeau_montant: 0 }) === null)

  // Côté client, ses mots à lui.
  verifier('le Yopper voit sa récompense déduite',
    (etatPaiementClient(cmd)?.detail || '').includes('ta récompense'))
  // ⚠️ TOUT COUVERT N'EST PAS « GRATUIT » : c'est gagné. Et le confondre avec
  // le bon cadeau ferait croire à un bon dépensé qui ne l'a pas été.
  const couvert = etatPaiementClient({ total: 5, fidelite_remise: 5 })
  verifier('une commande couverte par la récompense le dit',
    couvert?.libelle === 'Offert par ta récompense')
  verifier('et ne parle pas de bon cadeau',
    !(couvert?.detail || '').includes('bon cadeau'))

  // Le rendez-vous partage la règle et la colonne.
  const rdv = { statut: 'confirme', prix_estime: 30, fidelite_remise: 5, acompte_montant: 6.25, acompte_paye: true }
  verifier('le RDV dit sa récompense au comptoir',
    /5,00[\s ]€ de récompense fidélité/.test(etatPaiementRdv(rdv)?.detail || ''))
  // 🔴 F24 : le solde et la phrase doivent dire le MÊME montant.
  verifier('et le solde reste 18,75 € (F24)',
    etatPaiementRdv(rdv)?.libelle === `Partiel · ${euros(18.75)} à payer`)

  // Les emails d'annulation.
  const mailPro = emailCommandeAnnuleeCommercant({
    nom_commercant: 'X', yopper_prenom: 'A', numero_commande: 'RE6', total: 36,
    date_retrait: '2026-08-27', heure_debut: null, heure_fin: null, fidelite_remise: 10,
  })
  // 🔴 « IL Y A UN ? - ?, C'EST UN BUG » (Alex, 26/08). Une commande de boutique
  // de détail n'a PAS de créneau : une valeur de repli n'est pas une réponse à
  // une donnée SANS OBJET. Pas d'heure, pas de ligne.
  verifier('l\'email d\'annulation n\'écrit plus « ? → ? »', !/\?\s*→\s*\?/.test(mailPro))
  verifier('l\'email d\'annulation dit la récompense', mailPro.includes('de récompense fidélité'))
  const mailAvecHeure = emailCommandeAnnuleeCommercant({
    nom_commercant: 'X', yopper_prenom: 'A', numero_commande: 'CC1', total: 20,
    date_retrait: '2026-08-27', heure_debut: '17:00:00', heure_fin: '17:30:00',
  })
  verifier('mais il garde la plage quand elle existe', mailAvecHeure.includes('17:00 → 17:30'))
  const mailYop = emailCommandeAnnuleeYopper({
    yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'RE6', total: 36, fidelite_remise: 10,
  })
  // ⚠️ SA SEULE QUESTION : « et ma récompense ? » Une récompense se rend en
  // récompense, jamais en argent, et le taire la ferait croire perdue.
  verifier('le Yopper apprend que sa récompense lui revient', mailYop.includes('t’est rendue'))

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 ET SES BONS ? L'EMAIL SE TAISAIT SUR 145 € (Alex, 01/09)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Sur sa commande #CC2 : 156 €, dont 5 € de récompense et 145 € sur TROIS
  // bons. L'email annonçait « ta récompense de 5,00 € t'est rendue » et **pas
  // un mot des 145 €**. L'argent était bel et bien recrédité : c'est l'email
  // qui se taisait, et un Yopper qui ne voit pas revenir 145 € appelle.
  //
  // ⚠️ C'ÉTAIT LE FRÈRE NON TRAITÉ. L'email d'annulation d'un RENDEZ-VOUS dit
  // cette phrase depuis le 29/08 ; celui de la commande ne l'a jamais reçue.
  const cas = emailCommandeAnnuleeYopper({
    yopper_prenom: 'Alexandre', commercant_nom: 'Kebabistro', numero_commande: 'CC2',
    total: 156, fidelite_remise: 5, bon_cadeau_montant: 145, nb_bons: 3,
    commercant_categorie: 'alimentaire',
  })
  verifier('🔴 le Yopper apprend que ses bons lui reviennent', /145,00\s*€<\/strong> sont recrédités/.test(cas), cas.slice(0, 0))
  verifier('🔴 et la phrase se met au PLURIEL sur trois bons',
    /sur tes bons gourmands/.test(cas))
  verifier('le montant récapitulé se met au pluriel lui aussi',
    /avec tes bons gourmands/.test(cas))
  verifier('la récompense reste annoncée à côté', cas.includes('t’est rendue'))
  verifier('et le bloc s\'intitule « ce qui te revient »', /Ce qui te revient/.test(cas))
  // ⚠️ ET IL RESTE JUSTE AU SINGULIER : un seul bon ne doit pas devenir « tes ».
  const seul = emailCommandeAnnuleeYopper({
    yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'CC3',
    total: 50, bon_cadeau_montant: 20, nb_bons: 1, commercant_categorie: 'alimentaire',
  })
  verifier('un seul bon reste au singulier',
    /sur ton bon gourmand/.test(seul) && !/tes bons/.test(seul))
  // ⚠️ ET LE MÉTIER DÉCIDE DU MOT : « bon cadeau » hors alimentaire.
  const coiffeur = emailCommandeAnnuleeYopper({
    yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'CC4',
    total: 50, bon_cadeau_montant: 20, nb_bons: 2, commercant_categorie: 'coiffeur',
  })
  verifier('le métier décide du mot, au pluriel aussi', /sur tes bons cadeaux/.test(coiffeur))
  // ⚠️ SANS BON, AUCUNE LIGNE : « 0,00 € recrédités » se lirait comme une perte.
  const sansBon = emailCommandeAnnuleeYopper({
    yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'CC5', total: 50, fidelite_remise: 5,
  })
  verifier('sans bon, aucune ligne de bon', !/recrédités/.test(sansBon))
  const sansRien = emailCommandeAnnuleeYopper({
    yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'CC6', total: 50,
  })
  verifier('sans avantage, pas de bloc « ce qui te revient »', !/Ce qui te revient/.test(sansRien))

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 « LE REMBOURSEMENT EST LANCÉ » SUR UNE CARTE JAMAIS DÉBITÉE (01/09)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Commande #RE4 d'Alex : 21,90 €, couverts EN ENTIER par ses bons. L'email
  // promettait « le montant revient sur ton moyen de paiement dans 5 à 10
  // jours ». Stripe n'avait rien encaissé : il aurait guetté un virement qui
  // ne serait jamais venu.
  //
  // 🔴 LA CAUSE : `paye_en_ligne` vaut `true` sur une commande couverte par des
  // avantages, exprès. Ce drapeau répond à « le client doit-il encore payer »,
  // PAS à « la carte a-t-elle été débitée ». On lui demandait la mauvaise
  // question depuis le début.
  const toutBon = emailCommandeAnnuleeYopper({
    yopper_prenom: 'Alexandre', commercant_nom: 'Ciseaux et Soins', numero_commande: 'RE4',
    total: 21.90, bon_cadeau_montant: 21.90, nb_bons: 2, paye_en_ligne: true,
    commercant_categorie: 'coiffeur',
  })
  verifier('🔴 rien sur la carte : aucune promesse de remboursement',
    !/Le remboursement est lancé/.test(toutBon))
  verifier('mais le retour des bons reste annoncé', /sur tes bons cadeaux/.test(toutBon))
  // ⚠️ ET LA RÉCOMPENSE COMPTE DANS LA DÉDUCTION ELLE AUSSI : une commande
  // qu'elle couvre entièrement n'a rien laissé sur la carte non plus.
  const toutRecompense = emailCommandeAnnuleeYopper({
    yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'CC11',
    total: 10, fidelite_remise: 10, paye_en_ligne: true,
  })
  verifier('🔴 une commande couverte par la récompense non plus',
    !/Le remboursement est lancé/.test(toutRecompense))
  // ⚠️ ET LE CAS OÙ LA CARTE A VRAIMENT PAYÉ NE DOIT PAS SE CASSER.
  const mixte = emailCommandeAnnuleeYopper({
    yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'CC7',
    total: 50, bon_cadeau_montant: 20, nb_bons: 1, paye_en_ligne: true,
  })
  verifier('une part payée par carte garde sa promesse de remboursement',
    /Le remboursement est lancé/.test(mixte))
  const sansAvantage = emailCommandeAnnuleeYopper({
    yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'CC8', total: 50, paye_en_ligne: true,
  })
  verifier('et une commande payée entièrement par carte aussi',
    /Le remboursement est lancé/.test(sansAvantage))
  // ⚠️ LE PIÈGE DU ZÉRO : sans `total`, on ne SAIT pas, et « on ne sait pas »
  // n'est pas « rien ». On garde l'ancien comportement plutôt que de taire un
  // vrai virement.
  const sansTotal = emailCommandeAnnuleeYopper({
    yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'CC9', paye_en_ligne: true,
  })
  verifier('sans total connu, la promesse reste affichée',
    /Le remboursement est lancé/.test(sansTotal))
  // ⚠️ ET UNE COMMANDE PAYÉE SUR PLACE N'EN PARLE TOUJOURS PAS.
  const surPlace = emailCommandeAnnuleeYopper({
    yopper_prenom: 'A', commercant_nom: 'X', numero_commande: 'CC10', total: 50, paye_en_ligne: false,
  })
  verifier('une commande payée sur place n’annonce aucun remboursement',
    !/Le remboursement est lancé/.test(surPlace))

  // 🔴 LE FRÈRE CÔTÉ COMMERÇANT, ET IL EST PIRE : le même bloc lui disait
  // « rembourse manuellement depuis ton Stripe Dashboard » sur un paiement que
  // Stripe n'a jamais vu. Il chercherait une transaction inexistante.
  const proToutBon = emailCommandeAnnuleeCommercant({
    nom_commercant: 'Ciseaux et Soins', yopper_prenom: 'Alexandre', numero_commande: 'RE4',
    total: 21.90, bon_cadeau_montant: 21.90, nb_bons: 2, paye_en_ligne: true, refund_manuel: true,
  })
  verifier('🔴 le commerçant n’est pas envoyé rembourser un paiement inexistant',
    !/Stripe Dashboard/.test(proToutBon))
  const proMixte = emailCommandeAnnuleeCommercant({
    nom_commercant: 'X', yopper_prenom: 'A', numero_commande: 'CC7',
    total: 50, bon_cadeau_montant: 20, paye_en_ligne: true,
  })
  verifier('mais il reste informé quand la carte a vraiment payé',
    /remboursement automatique/.test(proMixte))

  // ⚠️ ET LA ROUTE DOIT CHARGER LES COLONNES, sinon les gabarits se taisent
  // sans lever la moindre erreur. C'est LE défaut le plus fréquent du projet.
  // ⚠️ REPOINTÉES LE 06/10 : `app/api/emails/commande-annulee` est SUPPRIMÉE
  // (mineur de l'audit). Elle demandait `prix_total` et `option_libelle`, qui
  // n'existent pas sur `commande_articles` : chaque appel échouait (« Commande
  // introuvable »), et plus rien ne l'appelait. Reste la route qui tourne.
  verifier('🔴 la route morte commande-annulee reste supprimée',
    (() => { try { lire('app/api/emails/commande-annulee/route.js'); return false } catch { return true } })())
  // 🔴 LA ROUTE D'ANNULATION PASSE LE COMPTE aux deux gabarits.
  for (const f of ['app/api/commande/cancel/route.js']) {
    const src = lire(f)
    verifier(`${f} : passe le nombre de bons aux DEUX gabarits`,
      (src.match(/nb_bons:\s+\(cmd\.bons_utilises \|\| \[\]\)\.length/g) || []).length === 2,
      `${(src.match(/nb_bons:/g) || []).length} occurrences`)
  }
}


// ═══ « RIEN À SORTIR AU COMPTOIR » SUR UN COLIS ═════════════════════════════
//
// 🔴 Alex, 27/08 : l'email de confirmation d'une commande EXPÉDIÉE annonçait
// « Payé en ligne · Rien à sortir au comptoir ». Il n'y a pas de comptoir.
//
// ⚠️ LA FONCTION CONNAISSAIT DÉJÀ LE MODE, mais seulement dans sa branche
// IMPAYÉE (`auLivreur`). La branche PAYÉE disait « comptoir » à tout le monde,
// et c'est elle qui part dans l'email qu'on lit en premier. **Un cas traité à
// moitié est un cas non traité : il attend juste l'autre chemin.**
{
  const paye = (mode) => etatPaiementClient({ total: 43, paye_en_ligne: true, mode_retrait: mode })
  verifier('un colis payé ne parle pas de comptoir',
    !/comptoir/i.test(paye('expedition')?.detail || ''))
  verifier('et il dit ce qui se passe vraiment',
    /colis part/i.test(paye('expedition')?.detail || ''))
  verifier('une livraison payée ne parle pas de comptoir non plus',
    !/comptoir/i.test(paye('livraison')?.detail || ''))
  // ⚠️ ET LE RETRAIT GARDE SON MOT. Une correction qui casse le cas d'origine
  // n'est pas une correction.
  verifier('le retrait, lui, garde son comptoir',
    /comptoir/i.test(paye('retrait')?.detail || ''))
  // ⚠️ LE REPLI EST LE RETRAIT, et c'est le bon : une commande sans
  // `mode_retrait` est un Click and Collect, le mode historique.
  verifier('sans mode connu, on retombe sur le comptoir',
    /comptoir/i.test(paye(null)?.detail || ''))
  // ⚠️ LE FRÈRE : une commande ENTIÈREMENT couverte par une récompense ne passe
  // PAS par Stripe, donc `paye_en_ligne` est faux et elle atterrit dans une
  // AUTRE branche, qui disait « comptoir » elle aussi.
  const colisOffert = etatPaiementClient({ total: 5, fidelite_remise: 5, mode_retrait: 'expedition' })
  verifier('un colis offert par la récompense ne parle pas de comptoir',
    !/comptoir/i.test(colisOffert?.detail || ''))
  verifier('et il dit d\'où vient la gratuité', /récompense/i.test(colisOffert?.detail || ''))
}

// ═══ QUATRE COUCHES SE PASSAIENT LE SILENCE ═════════════════════════════════
//
// 🔴 « LE MAIL COLIS PRÊT N'ARRIVE PAS » (Alex, 27/08). Le vrai défaut n'était
// pas qu'il ne partait pas : c'est que PERSONNE NE POUVAIT LE SAVOIR.
//
//   1. `envoyer()` NE LÈVE JAMAIS : il attrape l'erreur Resend et rend
//      `{ ok: false, error }` ;
//   2. la route ne lisait pas ce retour, donc son `try/catch` n'attrapait rien ;
//   3. elle rendait `{ ok: true }` quoi qu'il arrive ;
//   4. et le navigateur écrivait `postPro(...).catch(...)`, qui ne se déclenche
//      JAMAIS sur un code HTTP — c'est le comportement normal de `fetch`.
//
// ⚠️ UN `await` DONT ON NE LIT PAS LE RÉSULTAT N'EST PAS UN ENVOI, C'EST UN
// ESPOIR. La même phrase que pour l'écriture du forfait le 26/08.
{
  for (const [nom, chemin] of [
    ['« c\'est prêt »',   'app/api/emails/commande-prete/route.js'],
    ['« colis parti »',   'app/api/emails/commande-expediee/route.js'],
  ]) {
    const src = lire(chemin)
    verifier(`la route ${nom} lit le résultat de l'envoi`,
      /const envoi = await envoyerAuCommercant\(/.test(src))
    verifier(`la route ${nom} refuse de mentir quand l'envoi échoue`,
      /if \(!envoi\?\.ok\)/.test(src) && /status: 502/.test(src))
  }

  const fetchPro = lire('lib/fetch-pro.js')
  verifier('`prevenirClient` existe', /export async function prevenirClient/.test(fetchPro))
  // ⚠️ IL LIT `res.ok`, PAS SEULEMENT LE `catch`. C'est toute la différence.
  verifier('et il lit vraiment la réponse', /if \(res\.ok\)/.test(fetchPro))
  // ⚠️ ET IL LIT LE CORPS : une raison vaut dix codes. « forfait insuffisant »
  // et « commande introuvable » sont tous deux des 4xx et n'appellent pas le
  // même geste.
  // ⚠️ CETTE GARDE VISAIT `j?.error || j?.message`, c'est-à-dire une FORME et
  // même un nom de variable. Elle a rougi le 17/09 quand la règle a déménagé
  // dans `lib/verdict-reponse.js`, alors que `prevenirClient` rapportait
  // toujours la raison. Elle vise désormais la règle elle-même, dont le
  // comportement est mesuré quelques lignes plus bas.
  verifier('il rapporte la raison, pas juste le code', /motifDuRefus\(corpsRecu\)/.test(fetchPro))

  // 🔴 LE 200 QUI DIT NON (17/09). `if (res.ok)` suffisait, et laissait passer le
  // cas le plus courant de nos routes : `NextResponse.json({ ok: false, … })`
  // part avec un code 200. `/api/fidelite/crediter` répond ainsi, et cette
  // fonction — écrite EXPRÈS pour ne plus rien laisser passer — annonçait un
  // succès sur un refus.
  //
  // ⚠️ ON MESURE LE COMPORTEMENT, PAS LE TEXTE. Six réponses, jouées pour de
  // vrai contre la logique de la fonction : c'est la seule façon de prouver
  // qu'une route sans champ `ok` reste un succès, ce qu'une garde de texte ne
  // peut pas dire.
  // 🔴 CES CAS ONT D'ABORD MESURÉ UNE COPIE, ET UNE MUTATION L'A DÉMASQUÉ. Je
  // les avais écrits en REJOUANT la logique dans le banc, parce que
  // `lib/fetch-pro.js` porte `'use client'` et importe Supabase. Ils restaient
  // donc verts pendant qu'on cassait le vrai code. La règle a été extraite dans
  // `lib/verdict-reponse.js`, qui est pur : on exécute désormais CE QUI TOURNE.
  {
    const cas = [
      ['un 200 qui dit ok:false est un ÉCHEC', [true, { ok: false, error: 'pas de GSM' }], true],
      ['un 200 qui dit ok:true est un succès', [true, { ok: true }], false],
      // ⚠️ `corps?.ok === false`, JAMAIS `!corps?.ok` : une route qui rend
      // `{ sent: true }` serait déclarée en échec par la seconde forme, et
      // l'alerte s'afficherait chez le commerçant sans qu'il se soit rien passé.
      ['une route sans champ ok reste un succès', [true, { sent: true }], false],
      ['un corps illisible reste un succès', [true, null], false],
      ['un 403 est un échec', [false, { error: 'interdit' }], true],
      ['un 500 est un échec', [false, { error: 'boum' }], true],
      ['un 500 sans corps est un échec', [false, null], true],
    ]
    for (const [nom, [estOk, corps], attendu] of cas) {
      verifier(nom, reponseRefuse(estOk, corps) === attendu)
    }
    // Le motif : une phrase d'abord, le mot technique en dernier recours.
    verifier('le motif préfère la phrase au mot technique',
      motifDuRefus({ error: 'pas de GSM', reason: 'telephone_invalide' }) === 'pas de GSM')
    verifier('et se rabat sur le mot technique quand il n’y a rien d’autre',
      motifDuRefus({ reason: 'telephone_invalide' }) === 'telephone_invalide')
    verifier('sans corps, il ne rend pas « undefined »', motifDuRefus(null) === '')

    // Et la garde de texte qui empêche le retour en arrière dans la vraie source.
    verifier('`prevenirClient` confie son verdict à la règle partagée',
      /reponseRefuse\(res\.ok, corpsRecu\)/.test(fetchPro))
    // 🔴 `indexOf` REND -1, ET -1 EST PLUS PETIT QUE TOUT. Écrite
    // `indexOf(lecture) < indexOf(verdict)`, cette garde restait VERTE quand on
    // supprimait la lecture du corps : une mutation l'a montré. On exige donc
    // que les deux EXISTENT avant de comparer leur ordre.
    {
      const iLecture = fetchPro.indexOf('corpsRecu = await res.json()')
      const iVerdict = fetchPro.indexOf('reponseRefuse(res.ok, corpsRecu)')
      verifier('il lit vraiment le corps de la réponse', iLecture >= 0, `index ${iLecture}`)
      verifier('et il le lit AVANT de juger', iLecture >= 0 && iVerdict > iLecture,
        `lecture ${iLecture}, verdict ${iVerdict}`)
    }
  }


  const dash = lire('app/dashboard/page.js')
  const dashCode = dash.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
  // Les envois qui engagent le CLIENT passent par le chemin bavard.
  // ⚠️ `rdv-honore` A QUITTÉ CETTE LISTE LE 27/08, avec sa route : il servait
  // l'ancienne fidélité des rendez-vous, retirée le même jour. La fidélité
  // unifiée annonce depuis `crediterFidelite`, côté serveur, donc hors du
  // tableau de bord et hors de ce chemin-ci.
  for (const url of ['commande-prete', 'commande-expediee', 'rdv-annule', 'rdv-no-show']) {
    verifier(`le tableau de bord signale l'échec de « ${url} »`,
      new RegExp(`signalerEnvoi\\('/api/emails/${url}`).test(dashCode))
  }
  // ⚠️ ET LE COMMERÇANT LE VOIT SANS LE CHERCHER, avec CE QUI MARCHE ENCORE :
  // un avertissement qui n'indique pas la suite est une inquiétude, pas une
  // information.
  verifier('et il l\'affiche au commerçant', /envoiRate && \(/.test(dashCode))
  verifier('en lui disant ce qui marche encore',
    /ton client la voit dans son application/.test(dash))

  // ⚠️ LA FIDÉLITÉ PASSE PAR LE CHEMIN BAVARD ELLE AUSSI (17/09). Elle s'écrivait
  // `postPro(...).catch(...)` : aucun des cinq motifs de refus n'atteignait le
  // commerçant. Et pour une COMMANDE il n'existe aucun filet — le cron
  // `fidelite-rdv` ne repasse que sur `rdv_reservations` — donc un crédit manqué
  // est de la cagnotte perdue pour de bon.
  //
  // ⚠️ CES DEUX GARDES VIVENT ICI, APRÈS `dashCode`, ET PAS PLUS HAUT. Écrites
  // au-dessus de sa déclaration, elles ont fait PLANTER le banc sur une zone
  // morte temporelle : un `const` n'est pas remonté comme une `function`. Le
  // banc a dit « Cannot access before initialization » au lieu de rougir, et un
  // banc qui explose n'est pas une mesure, c'est un accident.
  verifier('le crédit de fidélité d\'une commande signale son échec',
    /signalerEnvoi\('\/api\/fidelite\/crediter'/.test(dashCode))
  // ⚠️ ET IL NE PROMET PAS UN FILET QUI N'EXISTE PAS. Le commentaire voisin du
  // tableau de bord annonce que « le cron du lendemain rattrape » : c'est vrai
  // pour un rendez-vous, faux pour une commande. Servir cette phrase-là ici
  // ferait attendre un rattrapage qui ne viendra jamais.
  verifier('et il ne promet PAS un rattrapage qui n\'existe pas',
    !/crediterFideliteCommande\(commandeId\)[\s\S]{0,400}?sera rattrapé/.test(dashCode))
}

// ═══ DEUX ROUTES D'ANNULATION, UN SEUL DISCOURS ═════════════════════════════
//
// 🔴 « RIEN NE DIT QUE LES 10 € DE FIDÉLITÉ ONT ÉTÉ REMIS » (Alex, 27/08).
//
// ⚠️ LE CRÉDIT, LUI, FONCTIONNE : `rendreRecompense` remet `utilisee_at` à
// null, incrémente le compteur de la carte et écrit un mouvement. C'est
// l'EMAIL qui se taisait.
//
// ⚠️ ET C'EST LE FRÈRE NON TRAITÉ. Il existe DEUX chemins d'annulation, et les
// gabarits n'ont été corrigés que pour l'un des deux le 26/08. Celui qui tourne
// vraiment, `/api/commande/cancel`, compose ses propres appels : personne n'est
// allé voir. Les deux doivent passer LES MÊMES COLONNES, sinon ils divergeront
// encore.
{
  // ⚠️ REPOINTÉE LE 06/10 : `emails/commande-annulee` supprimée (route morte).
  for (const [nom, chemin] of [
    ['/api/commande/cancel',         'app/api/commande/cancel/route.js'],
  ]) {
    const src = lire(chemin)
    // ⚠️ ON CHERCHE DANS LE SELECT, PAS DANS LE FICHIER. Première écriture de
    // cette garde : `/\bfidelite_remise\b/.test(src)`. Elle restait VERTE
    // quand on retirait la colonne du select, parce que le mot survit dans les
    // appels de gabarit deux cents lignes plus bas. **Le mot présent AILLEURS
    // dans le fichier**, pour la troisième fois en deux jours — mesuré par
    // mutation, jamais vu à la relecture.
    const listeSelect = (src.match(/(?:\.select\(|selectCols\s*=\s*)`([\s\S]*?)`/g) || []).join(' ')
    verifier(`${nom} a bien un select repérable`, listeSelect.length > 0)
    verifier(`${nom} charge la remise de fidélité DANS SON SELECT`,
      /\bfidelite_remise\b/.test(listeSelect))
    verifier(`${nom} charge aussi le bon cadeau dans son select`,
      /\bbon_cadeau_montant\b/.test(listeSelect))
    // Deux gabarits chacun : le Yopper ET le commerçant.
    verifier(`${nom} la passe aux DEUX gabarits`,
      (src.match(/fidelite_remise:\s+cmd\.fidelite_remise/g) || []).length >= 2)
    verifier(`${nom} passe aussi le bon cadeau`,
      (src.match(/bon_cadeau_montant:\s+cmd\.bon_cadeau_montant/g) || []).length >= 2)
  }
}

// ═══ `commandes.client_prenom` N'EXISTE PAS ═════════════════════════════════
//
// 🔴 CE DÉFAUT A ÉTÉ TROUVÉ DEUX FOIS, À UN MOIS D'INTERVALLE.
//
//   • 28/07 — le récapitulatif du matin annonçait « 0 commande » à des
//     commerçants qui en avaient. Corrigé DANS CETTE ROUTE-LÀ, avec un
//     commentaire de six lignes qui expliquait tout.
//   • 27/08 — le mail « ton colis est prêt » ne partait pas. CINQ autres
//     routes demandaient encore `commandes.client_prenom`.
//
// ⚠️ LA CONNAISSANCE N'AVAIT PAS VOYAGÉ. Un commentaire dans un fichier ne
// protège que ce fichier. C'est exactement ce que cette garde répare : elle
// protège aussi les routes qui n'existent pas encore.
//
// ⚠️ ET CE N'EST PAS « LA COLONNE ABSENTE D'UN SELECT », C'EST SON CONTRAIRE.
// Une colonne qui EXISTE mais qu'on oublie de demander vaut `undefined` en
// silence. Une colonne qui N'EXISTE PAS fait échouer TOUTE la requête :
// PostgREST rend un 400, `data` vaut null, et la route en conclut que la
// commande n'existe pas. Le silence est le même, la cause est l'inverse.
{
  const ROUTES_COMMANDES = [
    'app/api/emails/commande-prete/route.js',
    'app/api/emails/commande-expediee/route.js',
    // `emails/commande-annulee` : supprimée le 06/10 (route morte).
    'app/api/livraison/statut/route.js',
    'app/api/cron/rappels-retrait/route.js',
    'app/api/commande/cancel/route.js',
    'app/api/commande/push-statut/route.js',
    'app/api/cron/recap-jour-8h/route.js',
  ]
  for (const chemin of ROUTES_COMMANDES) {
    const src = lire(chemin)
    // ⚠️ ON CHERCHE DANS LE SELECT, pas dans le fichier : les commentaires qui
    // expliquent le piège contiennent forcément le mot fautif, et les routes
    // qui lisent AUSSI `rdv_reservations` ont le droit de le demander là.
    const selects = (src.match(/(?:\.select\(|selectCols\s*=\s*)`([\s\S]*?)`/g) || [])
    const surCommandes = selects.filter(s => {
      const i = src.indexOf(s)
      // Le `.from('...')` qui précède immédiatement ce select.
      const avant = src.slice(Math.max(0, i - 400), i)
      const dernierFrom = [...avant.matchAll(/\.from\('([a-z_]+)'\)/g)].pop()
      return dernierFrom?.[1] === 'commandes'
    })
    for (const s of surCommandes) {
      verifier(`${chemin} ne demande pas commandes.client_prenom`,
        !/\bclient_prenom\b/.test(s), s.slice(0, 120))
    }
  }

  // Et le prénom se dérive, une fois, pour tout le monde.
  verifier('un prénom seul reste tel quel', prenomClient({ client_prenom: 'Alex' }) === 'Alex')
  // ⚠️ LE PREMIER MOT, PAS LE DERNIER.
  verifier('un nom complet donne son premier mot',
    prenomClient({ client_nom: 'Alexandre Verstappen' }) === 'Alexandre')
  verifier('les espaces multiples ne cassent rien',
    prenomClient({ client_nom: '  Jean-Luc   Dupont ' }) === 'Jean-Luc')
  // ⚠️ `null`, JAMAIS UNE CHAÎNE VIDE : elle donnerait « Bonjour  , » avec un
  // trou au milieu, et les appelants écrivent tous `|| 'Yopper'`.
  verifier('rien du tout rend null', prenomClient({}) === null)
  verifier('une ligne absente aussi', prenomClient(null) === null)
  // Le nom complet ne se double pas quand `client_nom` le contient déjà.
  verifier('le nom complet ne se double pas',
    nomCompletClient({ client_prenom: 'Alexandre', client_nom: 'Alexandre Verstappen' }) === 'Alexandre Verstappen')
  verifier('mais il se recolle quand les deux sont séparés',
    nomCompletClient({ client_prenom: 'Alexandre', client_nom: 'Verstappen' }) === 'Alexandre Verstappen')
}

// ═══ AUDIT LIVRAISON, LES CINQ CRITIQUES (05/10) ════════════════════════════
//
// Chacun était une règle que l'écran respectait et que le serveur ignorait, ou
// une donnée personnelle qui sortait ou restait. Les contrôles de code lisent
// le code SANS SA PROSE : un mot trouvé dans un commentaire ne prouve rien.
{
  const { receptionConfirmableParClient } = await import('../lib/statuts-commande.js')
  const { sansProse } = await import('./lire-code.mjs')

  // C2 : la règle, en comportement.
  verifier('C2 un retrait prêt se confirme',
    receptionConfirmableParClient({ statut: 'pret', mode_retrait: 'retrait' }) === true)
  verifier('🔴 C2 un retrait en préparation ne se confirme pas',
    receptionConfirmableParClient({ statut: 'en_preparation', mode_retrait: 'retrait' }) === false)
  verifier('🔴 C2 une commande annulée et remboursée ne se confirme pas',
    receptionConfirmableParClient({ statut: 'annulee_client_refund', mode_retrait: 'retrait' }) === false)
  verifier('🔴 C2 une commande déjà récupérée ne se confirme pas deux fois',
    receptionConfirmableParClient({ statut: 'recupere', mode_retrait: 'retrait' }) === false)
  verifier('C2 une livraison en route se confirme',
    receptionConfirmableParClient({ statut: 'pret', mode_retrait: 'livraison', statut_livraison: 'en_livraison' }) === true)
  verifier('🔴 C2 une livraison prête mais pas partie ne se confirme pas',
    receptionConfirmableParClient({ statut: 'pret', mode_retrait: 'livraison', statut_livraison: null }) === false)
  verifier('🔴 C2 une expédition ne se confirme jamais chez le client',
    receptionConfirmableParClient({ statut: 'pret', mode_retrait: 'expedition' }) === false)
  verifier('C2 une commande absente ne passe pas', receptionConfirmableParClient(null) === false)

  const routeYopper = sansProse(lire('app/api/yopper/commandes/route.js'))
  const blocReception = routeYopper.slice(routeYopper.indexOf("action === 'confirmer-reception'"))
  verifier('🔴 C2 la route applique la règle avant d’écrire',
    blocReception.indexOf('receptionConfirmableParClient(cmd)') > -1
    && blocReception.indexOf('receptionConfirmableParClient(cmd)') < blocReception.indexOf('.update(patch)'))
  verifier('🔴 C2 l’écriture est filtrée sur le statut lu, et le nombre de lignes est lu',
    /\.update\(patch\)\.eq\('id', id\)\.eq\('statut', 'pret'\)/.test(blocReception)
    && /ecriture\.eq\('statut_livraison', 'en_livraison'\)/.test(blocReception)
    && /if \(!ecrit \|\| ecrit\.length === 0\)/.test(blocReception))
  verifier('🔴 C2 le select rapporte statut et statut_livraison',
    /\.select\('id, statut, statut_livraison, mode_retrait,/.test(blocReception))

  // C2 (suite) : la fidélité refuse ce qui n'est pas récupéré, à la source.
  const fidServeur = sansProse(lire('lib/fidelite-server.js'))
  const blocCredit = fidServeur.slice(fidServeur.indexOf('export async function crediterFideliteCommande'))
  verifier('🔴 C2 le crédit d’une commande exige « récupérée »',
    /\.select\('id, statut, commercant_id,/.test(blocCredit)
    && /if \(cmd\.statut !== 'recupere'\) return \{ ok: false, reason: 'commande_non_finalisee' \}/.test(blocCredit))

  // C1 : la relecture sans identité ne rend rien de personnel.
  const blocGetOne = routeYopper.slice(routeYopper.indexOf("action === 'get-one'"), routeYopper.indexOf('session_yopper_manquante'))
  const selectGetOne = (blocGetOne.match(/\.select\('([^']*)'\)/) || [])[1] || ''
  verifier('🔴 C1 la relecture par UUID a bien un select', selectGetOne.length > 0, blocGetOne.slice(0, 200))
  for (const col of ['client_nom', 'client_email', 'client_telephone', 'total', 'adresse_livraison', 'note_livraison', 'livraison_lat']) {
    verifier(`🔴 C1 la relecture par UUID ne rend pas ${col}`, !new RegExp(`\\b${col}\\b`).test(selectGetOne), selectGetOne)
  }
  // C1 (suite) : plus aucun code ne lit la vue publique par l'identifiant
  // d'une commande. C'est la condition pour retirer `id` de la vue en SQL sans
  // rien casser : une colonne absente fait échouer TOUTE la requête.
  {
    const { readdirSync } = await import('node:fs')
    const lecteurs = []
    for (const racine of ['app', 'lib']) {
      const fichiers = readdirSync(new URL(`../${racine}`, import.meta.url), { recursive: true })
        .filter(f => /\.js$/.test(String(f)))
      for (const f of fichiers) {
        const chemin = `${racine}/${String(f).replace(/\\/g, '/')}`
        const code = sansProse(lire(chemin))
        let i = code.indexOf("from('commandes_stats')")
        while (i > -1) {
          const requete = code.slice(i, code.indexOf(')', code.indexOf('.select(', i) + 8) + 400)
          const finInstruction = requete.search(/\n\s*\n|;\s*\n/)
          const corps = finInstruction > -1 ? requete.slice(0, finInstruction) : requete
          if (/\.(eq|in)\('id'/.test(corps) || /\.select\('[^']*\bid\b[^']*'\)/.test(corps)) lecteurs.push(chemin)
          i = code.indexOf("from('commandes_stats')", i + 1)
        }
      }
    }
    verifier('🔴 C1 aucun code ne lit commandes_stats par son id', lecteurs.length === 0, lecteurs.join(', '))
  }

  // C3 : l'effacement du compte efface l'adresse, et lit ses erreurs.
  const suppr = sansProse(lire('app/api/yopper/supprimer-compte/route.js'))
  const blocCmd = suppr.slice(suppr.indexOf("admin.from('commandes')"), suppr.indexOf("admin.from('commandes')") + 400)
  for (const col of ['adresse_livraison', 'livraison_lat', 'livraison_lng', 'note_livraison']) {
    verifier(`🔴 C3 la suppression du compte efface ${col}`, new RegExp(`${col}: null`).test(blocCmd), blocCmd)
  }
  verifier('🔴 C3 l’erreur d’anonymisation des commandes est lue',
    /const \{ error: errCmd \} = await admin\.from\('commandes'\)/.test(suppr) && /if \(errCmd\)/.test(suppr))
  verifier('C3 les frères aussi : chaque anonymisation est lue',
    /for \(const \[quoi, requete\] of anonymisations\)/.test(suppr) && /if \(errAnon\)/.test(suppr))

  // C4 et C5 : la création de commande.
  const cc = sansProse(lire('app/api/stripe/checkout/create-commande/route.js'))
  verifier('🔴 C4 le commerçant est lu avec son interrupteur de livraison',
    /\.from\('commercants'\)\s*\.select\('[^']*\blivraison_actif\b[^']*'\)/.test(cc))
  const iInter = cc.indexOf("if (commercant.livraison_actif !== true)")
  verifier('🔴 C4 une livraison éteinte est refusée, dans le bloc livraison',
    iInter > cc.indexOf("verdictForfait(commercant, 'livraison')") && iInter < cc.indexOf('fermeturesCommercant = []'))
  verifier('🔴 C5 le créneau de livraison est lu avec son délai',
    /\.from\('livraison_creneaux'\)\s*\.select\('[^']*\bcutoff_heures\b[^']*'\)/.test(cc))
  verifier('🔴 C5 le créneau de retrait est lu avec son délai',
    /\.from\('creneaux'\)\s*\.select\('[^']*\bcutoff_heures\b[^']*'\)/.test(cc))

  // C5 (écran) : les tournées passent par la même règle que le serveur.
  const fiche = sansProse(lire('app/commander/[slug]/page.js'))
  const blocSlots = fiche.slice(fiche.indexOf('const slotsLivraison ='), fiche.indexOf('const cpDansZone'))
  verifier('🔴 C5 les tournées affichées passent par creneauCommandable',
    /creneauCommandable\(slot, \{ dateStr, instantDebut: brusselsInstant \}\)/.test(blocSlots))
  verifier('C5 et par le délai du panier',
    /debut\.getTime\(\) >= pretLivraison\.getTime\(\)/.test(blocSlots))
  verifier('🔴 C5 un choix de tournée qui n’est plus proposée n’allume pas le paiement',
    /cpDansZone && choixLivraisonValable\)/.test(fiche) && !/cpDansZone && creneauLivraisonChoisi\)/.test(fiche))
}

// ═══ AUDIT LIVRAISON I3 : PLUS AUCUNE COMMANDE ÉCRITE PAR LE NAVIGATEUR ═════
{
  const { sansProse } = await import('./lire-code.mjs')
  const { reprendreStockVariantes } = await import('../lib/stock-variantes-server.js')

  // Le tableau de bord, et tout ce que le navigateur charge, n'écrit plus
  // `commandes`. La condition du déclencheur de colonnes réservées (I2).
  const dash = sansProse(lire('app/dashboard/page.js'))
  verifier('🔴 I3 le tableau de bord n’écrit plus aucune commande',
    !/from\('commandes'\)\s*\.(update|insert|delete|upsert)\(/.test(dash))
  const config = sansProse(lire('app/dashboard/ConfigDashboard.js'))
  verifier('🔴 I3 la configuration non plus',
    !/from\('commandes'\)\s*\.(update|insert|delete|upsert)\(/.test(config))
  verifier('I3 un pas en avant passe par la route du Poste',
    /postPro\('\/api\/equipe\/commande\/statut'/.test(dash))
  verifier('I3 « remettre en Prête » passe par sa route',
    /postPro\('\/api\/commande\/remettre-prete'/.test(dash))
  verifier('I3 « Marquer expédiée » passe par sa route',
    /postPro\('\/api\/commande\/expedier'/.test(dash))
  verifier('🔴 I3 un refus du serveur ne passe pas l’écran au vert',
    (dash.match(/if \(!j\?\.ok\) \{\s*alert\(`Erreur : \$\{j\?\.error/g) || []).length >= 3)

  const remettre = sansProse(lire('app/api/commande/remettre-prete/route.js'))
  verifier('🔴 I3 remettre en Prête n’écrit que depuis « non retirée »',
    /\.update\(\{ statut: 'pret' \}\)\s*\.eq\('id', commande_id\)\s*\.eq\('statut', 'non_retire'\)/.test(remettre))
  verifier('🔴 I3 et reprend le stock APRÈS la bascule seulement',
    remettre.indexOf('if (!basculee)') > -1
    && remettre.indexOf('if (!basculee)') < remettre.indexOf('reprendreStockVariantes(admin'))
  verifier('I3 remettre en Prête passe la garde de l’équipe',
    /gardeLigneEquipe\(request, admin, 'commandes', commande_id, 'commandes'\)/.test(remettre))

  const expedier = sansProse(lire('app/api/commande/expedier/route.js'))
  verifier('🔴 I3 seul un colis prêt s’expédie',
    /c\.mode_retrait !== 'expedition' \|\| c\.statut !== 'pret'/.test(expedier)
    && /\.eq\('statut', 'pret'\)\.eq\('mode_retrait', 'expedition'\)/.test(expedier))
  verifier('🔴 I3 le transporteur est une clé connue',
    /!CLES_TRANSPORTEUR\.includes\(cle\)/.test(expedier))
  verifier('🔴 I3 le numéro de suivi est borné',
    /RE_SUIVI = \/\^\[A-Za-z0-9 -\]\{1,60\}\$\//.test(expedier) && /!RE_SUIVI\.test\(numero\)/.test(expedier))
  verifier('I3 expédier passe la garde de l’équipe',
    /gardeLigneEquipe\(request, admin, 'commandes', commande_id, 'commandes'\)/.test(expedier))

  // La reprise du stock, en comportement, sur une base simulée.
  const baseSimulee = (lignes, versions) => {
    const ecrits = {}
    const db = {
      from: (table) => {
        const q = { _t: table, _set: null, _id: null }
        q.select = () => q
        q.in = () => q
        q.not = () => q
        q.update = (v) => { q._set = v; return q }
        q.eq = (_c, val) => { q._id = val; return q }
        q.then = (ok) => {
          if (q._set) { ecrits[q._id] = q._set.stock; return Promise.resolve({ error: null }).then(ok) }
          const data = table === 'commande_articles' ? lignes : versions
          return Promise.resolve({ data, error: null }).then(ok)
        }
        return q
      },
    }
    return { db, ecrits }
  }
  {
    const { db, ecrits } = baseSimulee(
      [{ variante_id: 'a', quantite: 2 }, { variante_id: 'a', quantite: 1 }, { variante_id: 'b', quantite: 1 }],
      [{ id: 'a', stock: 5 }, { id: 'b', stock: 0 }])
    const r = await reprendreStockVariantes(db, ['c1'])
    verifier('I3 la reprise additionne les lignes d’une même version', ecrits.a === 2, JSON.stringify(ecrits))
    verifier('🔴 I3 la reprise ne descend jamais sous zéro', ecrits.b === 0, JSON.stringify(ecrits))
    verifier('🔴 I3 et elle compte ce qui manque', r.manquantes === 1 && r.reprises === 2, JSON.stringify(r))
  }
  {
    const { db } = baseSimulee([], [])
    const r = await reprendreStockVariantes(db, [])
    verifier('I3 rien à reprendre, rien d’écrit', r.ok && r.reprises === 0)
  }
}

// ═══ AUDIT LIVRAISON I4 : L'ANNULATION PAR LE CLIENT ════════════════════════
{
  const { sansProse } = await import('./lire-code.mjs')
  const annul = sansProse(lire('app/api/commande/cancel/route.js'))
  // ⚠️ REPOINTÉES LE 05/10 (I5) : le remboursement vit dans
  // `rembourserCarteCommande` (lib/commande-annulation-server), partagé avec
  // l'annulation par le commerce. La route l'appelle APRÈS la bascule.
  const iBascule = annul.indexOf(".in('statut', statutsAnnulables)")
  const iRefund = annul.indexOf('rembourserCarteCommande({')
  verifier('🔴 I4 la commande bascule AVANT le remboursement, sur un statut encore annulable',
    iBascule > -1 && iRefund > -1 && iBascule < iRefund)
  verifier('🔴 I4 zéro ligne basculée = ni argent ni email',
    /if \(!basculees \|\| basculees\.length === 0\) \{\s*return NextResponse\.json/.test(annul)
    && annul.indexOf('if (!basculees || basculees.length === 0)') < iRefund)
  const partage = sansProse(lire('lib/commande-annulation-server.js'))
  verifier('🔴 I4 le remboursement porte un montant et une clé d’idempotence',
    /amount: reste,/.test(partage) && /idempotencyKey: `cmd-annul-\$\{origine\}-\$\{commande\.id\}-\$\{reste\}`/.test(partage)
    && /origine: 'client'/.test(annul))
  verifier('🔴 I4 un refus de Stripe défait l’annulation',
    /\.update\(\{ statut: cmd\.statut, annulee_at: null, annulation_motif: null \}\)\s*\.eq\('id', cmd\.id\)\s*\.eq\('statut', 'annulee_client_refund'\)/.test(annul))
  verifier('🔴 I4 le délai lit aussi la tournée de livraison',
    /cmd\.creneau\?\.heure_debut \|\| cmd\.creneau_livraison\?\.heure_debut \|\| '23:59:59'/.test(annul)
    && /creneau_livraison:livraison_creneaux!creneau_livraison_id \(heure_debut\)/.test(annul))
  verifier('🔴 I4 une commande liée à un rendez-vous ne rembourse pas son paiement ici',
    /if \(cmd\.rdv_reservation_id\) \{/.test(annul) && annul.indexOf('if (cmd.rdv_reservation_id)') < iBascule)
  verifier('I4 le refus d’une commande prête ne parle plus de retrait',
    !/prête à retirer/.test(annul))
}

// ═══ AUDIT LIVRAISON I5 : ANNULÉE PAR LE COMMERCE, RETIRÉE AU MAGASIN ═══════
{
  const { sansProse } = await import('./lire-code.mjs')
  const sc = await import('../lib/statuts-commande.js')
  const { gesteLivraisonPermis, champsLivraison, GESTES_LIVRAISON } = await import('../lib/livraison-geste.js')
  const { emailCommandeAnnuleeYopper, emailLivraisonRetireeMagasin } = await import('../lib/resend.js')

  // Le statut, en comportement.
  verifier('I5 le statut a son libellé', sc.LIBELLES_STATUT_COMMANDE.annulee_commercant === 'Annulée par le commerce')
  verifier('🔴 I5 les trois annulations sont des annulations',
    ['annulee_client_refund', 'annulee_commercant', 'annulee_paiement_ko'].every(s => sc.estCommandeAnnulee({ statut: s }))
    && !sc.estCommandeAnnulee({ statut: 'pret' }) && !sc.estCommandeAnnulee(null))
  verifier('🔴 I5 les filtres PostgREST excluent l’annulation par le commerce',
    sc.FILTRE_STATUTS_INACTIFS.includes('annulee_commercant') && sc.FILTRE_STATUTS_TERMINES.includes('annulee_commercant')
    && sc.FILTRE_STATUTS_TERMINES.includes('recupere') && !sc.FILTRE_STATUTS_INACTIFS.includes('recupere'))

  // 🔴 LE BALAYAGE : toute liste qui nomme deux annulations sans la troisième
  // l'a oubliée. C'est ainsi que naissent les commandes annulées qui pèsent
  // encore sur le stock (5 listes concernées le 05/10).
  {
    const { readdirSync } = await import('node:fs')
    const oublis = []
    for (const racine of ['app', 'lib']) {
      for (const f of readdirSync(new URL(`../${racine}`, import.meta.url), { recursive: true })) {
        if (!/\.js$/.test(String(f))) continue
        const chemin = `${racine}/${String(f).replace(/\\/g, '/')}`
        const code = sansProse(lire(chemin))
        for (const ligne of code.split('\n')) {
          if (/annulee_client_refund/.test(ligne) && /annulee_paiement_ko/.test(ligne) && !/annulee_commercant/.test(ligne)) {
            oublis.push(`${chemin} : ${ligne.trim().slice(0, 90)}`)
          }
        }
      }
    }
    verifier('🔴 I5 aucune liste d’annulations n’oublie « annulee_commercant »', oublis.length === 0, oublis.join(' | '))
  }

  // Le geste « retirée au magasin », en comportement.
  const prete = { statut: 'pret', mode_retrait: 'livraison', statut_livraison: null, total: 20, paye_en_ligne: true, bon_cadeau_montant: 0, fidelite_remise: 0 }
  verifier('I5 « retirée au magasin » est un geste de livraison', GESTES_LIVRAISON.includes('retiree_magasin'))
  verifier('I5 il se fait depuis « prête, pas en route »', gesteLivraisonPermis(prete, 'retiree_magasin'))
  verifier('🔴 I5 jamais depuis la route : la commande est dans la camionnette',
    !gesteLivraisonPermis({ ...prete, statut_livraison: 'en_livraison' }, 'retiree_magasin'))
  verifier('I5 ni sur un retrait', !gesteLivraisonPermis({ ...prete, mode_retrait: 'retrait' }, 'retiree_magasin'))
  {
    const r = champsLivraison(prete, 'retiree_magasin')
    verifier('🔴 I5 il termine la commande, suivi « retiree_magasin »',
      r.champs?.statut === 'recupere' && r.champs?.statut_livraison === 'retiree_magasin', JSON.stringify(r))
    const aPayer = champsLivraison({ ...prete, paye_en_ligne: false }, 'retiree_magasin')
    verifier('🔴 I5 s’il reste à payer (frais compris), il demande le moyen',
      aPayer.champs === null && /Dis comment le client a payé/.test(aPayer.refus || ''))
    const auTerminal = champsLivraison({ ...prete, paye_en_ligne: false }, 'retiree_magasin', { encaissement: 'terminal' })
    verifier('I5 et il encaisse le tout, frais de livraison compris',
      auTerminal.champs?.encaisse_mode === 'terminal' && auTerminal.champs?.encaisse_montant === 20, JSON.stringify(auTerminal))
  }
  verifier('I5 le libellé dit « Retirée au magasin »',
    sc.libelleStatutCommande({ mode_retrait: 'livraison', statut: 'recupere', statut_livraison: 'retiree_magasin' }) === 'Retirée au magasin')
  verifier('I5 et une livrée reste « Livrée »',
    sc.libelleStatutCommande({ mode_retrait: 'livraison', statut: 'recupere', statut_livraison: 'livree' }) === 'Livrée')

  // Les emails, EXÉCUTÉS.
  const annulee = emailCommandeAnnuleeYopper({
    yopper_prenom: 'Alex', commercant_nom: 'Chez Momo', numero_commande: 'LI3', total: 20,
    paye_en_ligne: true, par_commerce: true, motif: '<b>Rupture</b> de pâte',
  })
  verifier('🔴 I5 l’email dit que c’est le commerce qui annule', /a dû annuler ta commande/.test(annulee))
  verifier('🔴 I5 le mot du commerce sort échappé', /&lt;b&gt;Rupture&lt;\/b&gt; de pâte/.test(annulee) && !/<b>Rupture/.test(annulee))
  const parClient = emailCommandeAnnuleeYopper({ yopper_prenom: 'Alex', commercant_nom: 'Chez Momo', total: 20 })
  verifier('I5 l’annulation par le client garde ses mots', /a bien été annulée/.test(parClient) && !/a dû annuler/.test(parClient))
  const recu = emailLivraisonRetireeMagasin({ yopper_prenom: 'Alex', commercant_nom: 'Chez Momo', numero_commande: 'LI3', frais_livraison: 3.5 })
  verifier('🔴 I5 le reçu dit que les frais restent dus, et combien', /restent dus/.test(recu) && /3,50/.test(recu))
  verifier('I5 sans frais, le reçu n’en parle pas',
    !/restent dus/.test(emailLivraisonRetireeMagasin({ yopper_prenom: 'A', commercant_nom: 'B', frais_livraison: 0 })))

  // La route du commerce, dans l'ordre qui protège l'argent.
  const route = sansProse(lire('app/api/commande/annuler-commercant/route.js'))
  verifier('🔴 I5 rembourser est un geste de la case « argent »',
    /gardeLigneEquipe\(request, admin, 'commandes', commande_id, 'argent'\)/.test(route))
  const iB = route.indexOf(".in('statut', ANNULABLES)")
  const iR = route.indexOf('rembourserCarteCommande({')
  const iE = route.indexOf('effetsAnnulationCommande(admin')
  verifier('🔴 I5 bascule, PUIS remboursement, PUIS effets', iB > -1 && iB < iR && iR < iE)
  verifier('🔴 I5 zéro ligne basculée = on s’arrête',
    /if \(!basculees \|\| basculees\.length === 0\) \{\s*return /.test(route) && route.indexOf('if (!basculees') < iR)
  verifier('🔴 I5 un refus de Stripe défait l’annulation',
    /\.update\(\{ statut: cmd\.statut, annulee_at: null, annulation_motif: null \}\)\s*\.eq\('id', cmd\.id\)\.eq\('statut', 'annulee_commercant'\)/.test(route))
  verifier('I5 une commande liée à un rendez-vous suit le rendez-vous',
    /if \(cmd\.rdv_reservation_id\) \{/.test(route) && route.indexOf('if (cmd.rdv_reservation_id)') < iB)
  verifier('I5 le remboursement du commerce a sa propre clé', /origine: 'commercant'/.test(route))

  // Le webhook : un remboursement fait dans Stripe.
  const wh = sansProse(lire('app/api/stripe/webhook/route.js'))
  verifier('🔴 I5 un remboursement total fait dans Stripe = « annulée par le commerce »',
    /statut: 'annulee_commercant', annulee_at: new Date\(\)\.toISOString\(\), annulation_motif: 'commercant'/.test(wh))
  // 🔴 CETTE GARDE EXIGEAIT « stripe », UNE VALEUR QUE LA BASE REFUSE (test 3
  // d'Alex, 05/10) : verte et complice. La contrainte
  // `commandes_annulation_motif_check`, lue en base ce jour-là, n'accepte que
  // ces quatre valeurs ; chaque motif écrit par le code doit en faire partie.
  {
    const MOTIFS_EN_BASE = ['client', 'commercant', 'paiement_ko', 'cutoff_expire']
    const { readdirSync } = await import('node:fs')
    const horsListe = []
    for (const racine of ['app', 'lib']) {
      for (const f of readdirSync(new URL(`../${racine}`, import.meta.url), { recursive: true })) {
        if (!/\.js$/.test(String(f))) continue
        const chemin = `${racine}/${String(f).replace(/\\/g, '/')}`
        for (const m of sansProse(lire(chemin)).matchAll(/annulation_motif: '([^']*)'/g)) {
          if (!MOTIFS_EN_BASE.includes(m[1])) horsListe.push(`${chemin} : ${m[1]}`)
        }
      }
    }
    verifier('🔴 I5 chaque motif d’annulation écrit est accepté par la base', horsListe.length === 0, horsListe.join(' | '))
  }
  verifier('🔴 I5 et ses effets ne partent qu’une fois, sur une bascule lue',
    /basculeeIci = \(b \|\| \[\]\)\.length > 0/.test(wh) && /if \(basculeeIci\) \{\s*await effetsAnnulationCommande\(supabase, cmd/.test(wh))
  // ⚠️ REPOINTÉE LE 06/10 : ni pour une commande liée à un rendez-vous, ni
  // pour un remboursement que NOTRE route marque « client » (la course).
  verifier('I5 pas d’email « commerce » pour une commande liée à un rendez-vous',
    /if \(!cmd\.rdv_reservation_id && !parLeClient\) await prevenirClientAnnulationCommerce\(supabase, cmd\.id\)/.test(wh))
  verifier('🔴 course rdv+produits : un remboursement marqué « client » reste une annulation du client',
    /let refundMotif = charge\?\.refunds\?\.data\?\.\[0\]\?\.metadata\?\.yoppaa_motif \|\| null/.test(wh)
      && /const parLeClient = refundMotif === 'client'/.test(wh)
      && /\.update\(parLeClient\s*\? \{ statut: 'annulee_client_refund'[^}]*annulation_motif: 'client' \}/.test(wh))
  {
    const rc = sansProse(lire('app/api/rdv/cancel/route.js'))
    const iBascule = rc.indexOf(".update({ statut: 'annulee_client_refund' })")
    const iRefund = rc.indexOf('stripe.refunds.create(')
    verifier('🔴 course rdv+produits : la route bascule la commande AVANT de rembourser',
      iBascule > 0 && iRefund > 0 && iBascule < iRefund, `bascule ${iBascule}, remboursement ${iRefund}`)
    verifier('course rdv+produits : le remboursement porte le motif « client »', /yoppaa_motif: 'client'/.test(rc))
  }

  // La fin de livraison crédite la fidélité côté serveur, et prévient.
  const livrer = sansProse(lire('app/api/livraison/livrer/route.js'))
  verifier('🔴 I5 livrée ou retirée : la fidélité se crédite côté serveur',
    /if \(statut_livraison === 'livree' \|\| statut_livraison === 'retiree_magasin'\) \{\s*await crediterFideliteCommande\(admin, commande_id/.test(livrer))
  verifier('I5 retirée : le client reçoit son reçu', /prevenirClientRetireeMagasin\(admin, commande_id\)/.test(livrer))

  // Les boutons, et la migration.
  const dashI5 = sansProse(lire('app/dashboard/page.js'))
  verifier('I5 le bouton « Retirée au magasin » existe, hors de la route',
    /estLivraison && commande\.statut === 'pret' && !statutLiv && \(/.test(dashI5) && /onLivraisonStatut\(commande\.id, 'retiree_magasin'\)/.test(dashI5))
  verifier('I5 le bouton « Annuler et rembourser » passe par la route',
    /postPro\('\/api\/commande\/annuler-commercant'/.test(dashI5) && /onAnnulerCommerce=\{annulerParLeCommerce\}/.test(dashI5))
  const sqlI5 = lire('migrations/MIGRATION_I5_ANNULEE_COMMERCE_RETIREE_MAGASIN.sql')
  verifier('🔴 I5 la migration élargit les deux contraintes',
    /'annulee_commercant'\s*\)\);/.test(sqlI5) && /'retiree_magasin'\)\);/.test(sqlI5))
  verifier('🔴 I5 la migration apprend le statut aux trois fonctions de stock',
    /p\.proname IN \('reserver_stock_atomique', 'vendu_par_offre', 'stock_commande_par_article'\)/.test(sqlI5)
    && /RAISE EXCEPTION 'Fonction % : filtre de statut non reconnu/.test(sqlI5))
}

// ═══ AUDIT LIVRAISON I9 : LES COORDONNÉES DU CLIENT ═════════════════════════
{
  const { emailValide, telephoneValide, refusCoordonnees } = await import('../lib/coordonnees-client.js')
  const { emailNouvelleCommandeCommercant } = await import('../lib/resend.js')
  const { sansProse } = await import('./lire-code.mjs')

  verifier('I9 une adresse ordinaire passe', emailValide('jean.dupont+test@gmail.com'))
  verifier('🔴 I9 du HTML dans l’email est refusé', !emailValide('<b>x</b>@a.be'))
  verifier('🔴 I9 une adresse sans domaine est refusée', !emailValide('jean@'))
  verifier('I9 une adresse trop longue est refusée', !emailValide(`${'a'.repeat(250)}@a.be`))
  verifier('I9 un GSM belge passe, avec ses séparateurs', telephoneValide('0470 12 34 56') && telephoneValide('0470/12.34.56'))
  verifier('I9 un numéro français passe aussi', telephoneValide('+33 6 12 34 56 78'))
  verifier('🔴 I9 du texte n’est pas un numéro', !telephoneValide('<script>') && !telephoneValide('appelez-moi'))
  verifier('I9 un numéro trop court est refusé', !telephoneValide('1234'))
  verifier('I9 la phrase dit quoi corriger', /email/.test(refusCoordonnees({ email: 'x', telephone: '0470123456' }) || '')
    && /téléphone/.test(refusCoordonnees({ email: 'a@b.be', telephone: 'x' }) || '')
    && refusCoordonnees({ email: 'a@b.be', telephone: '0470123456' }) === null)

  // Le gabarit, EXÉCUTÉ avec des valeurs piégées : rien ne doit ressortir brut.
  const html = emailNouvelleCommandeCommercant({
    nom_commercant: 'Chez Momo', yopper_prenom: 'A', yopper_nom: 'B',
    yopper_email: '<img src=x onerror=alert(1)>@a.be', yopper_telephone: '<script>alert(2)</script>',
    numero_commande: 'LI1', articles: [], total: 10, date_retrait: '2026-10-05', heure_debut: '18:00', heure_fin: '19:00',
  })
  verifier('🔴 I9 l’email du client sort échappé dans l’email du commerçant',
    !/<img src=x/.test(html) && /&lt;img src=x/.test(html))
  verifier('🔴 I9 le téléphone aussi', !/<script>alert\(2\)/.test(html) && /&lt;script&gt;alert\(2\)/.test(html))

  // Et plus aucun gabarit n'insère un email ou un téléphone brut.
  const resend = sansProse(lire('lib/resend.js'))
  // Une INSERTION directe (`${x}` ou `${x || '—'}`), pas une condition
  // (`${x ? … : ''}`), dont la branche échappe elle-même la valeur.
  const bruts = resend.match(/\$\{\s*(yopper_email|yopper_telephone|client_email|client_telephone|telephone|email|acheteur_email|beneficiaire_email)\s*(\}|\|\|)/g) || []
  verifier('🔴 I9 aucun email ni téléphone inséré sans échappement', bruts.length === 0, bruts.join(' | '))

  // ⚠️ REPOINTÉE LE 06/10 : l'appel porte aussi les longueurs (prénom, nom,
  // adresse d'expédition), mineur de l'audit.
  const cc = sansProse(lire('app/api/stripe/checkout/create-commande/route.js'))
  verifier('🔴 I9 la commande refuse des coordonnées mal formées ou trop longues',
    /refusCoordonnees\(\{\s*email: client_email, telephone: client_telephone,\s*prenom: client_prenom, nom: client_nom,\s*\.\.\.\(estExpedition \? \{ adresse: adresse_livraison \} : \{\}\),\s*\}\)/.test(cc))

  // Les longueurs maximales, exécutées.
  const { NOM_MAX, ADRESSE_MAX } = await import('../lib/coordonnees-client.js')
  const ok2 = { email: 'a@b.be', telephone: '0470123456' }
  verifier('longueurs : un nom normal passe', refusCoordonnees({ ...ok2, prenom: 'Marie-Christine', nom: 'Van den Bossche' }) === null)
  verifier('🔴 longueurs : un nom démesuré est refusé, et la phrase le dit',
    /nom est trop long/.test(refusCoordonnees({ ...ok2, nom: 'x'.repeat(NOM_MAX + 1) }) || ''))
  verifier('longueurs : un prénom démesuré aussi', /prénom est trop long/.test(refusCoordonnees({ ...ok2, prenom: 'x'.repeat(NOM_MAX + 1) }) || ''))
  verifier('🔴 longueurs : une adresse démesurée est refusée', /adresse est trop longue/.test(refusCoordonnees({ ...ok2, adresse: 'x'.repeat(ADRESSE_MAX + 1) }) || ''))
  verifier('longueurs : pile à la borne, ça passe', refusCoordonnees({ ...ok2, nom: 'x'.repeat(NOM_MAX), adresse: 'x'.repeat(ADRESSE_MAX) }) === null)
  verifier('longueurs : sans champ fourni, rien n\'est exigé (les autres tunnels)', refusCoordonnees(ok2) === null)
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Livraison verte.')
