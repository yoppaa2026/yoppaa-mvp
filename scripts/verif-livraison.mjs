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
verifier('la tournée exige un jeton', /authorization/i.test(tourneeCode))
verifier('le contrôle de propriété existe', /auth_user_id !== user\.id/.test(tourneeCode))
verifier('et il est réellement APPELÉ',
  /const commercant = await commercantDuProprietaire\(supabase, request, commercant_id\)/.test(tourneeCode))
verifier('son échec coupe la requête',
  /if \(!commercant\) \{[\s\S]{0,120}?status: 403/.test(tourneeCode))
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
verifier('le départ vient du lieu d’activité du jour',
  /lieuxDuJour\(\{ lieux: lieuxCom/.test(tourneeCode))
verifier('et de ses coordonnées', /departLieu\?\.latitude/.test(tourneeCode))
// ⚠️ Et pas d'un géocodage à chaque clic. Nominatim est un service public dont
// la règle d'usage est d'une requête par seconde : le rappeler à chaque
// optimisation est un gaspillage et un risque de blocage.
verifier('le géocodage n\'est qu\'un dernier recours',
  tourneeCode.indexOf('departLieu?.latitude') < tourneeCode.indexOf('geocoderAdresse(departLieu'))
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
verifier('les statuts occupants viennent du module partagé',
  /\.in\('statut', STATUTS_OCCUPENT_CRENEAU\)/.test(tourneeCode),
  'une liste écrite à la main divergerait du reste de l\'application')

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
verifier('la livraison client exige activation ET configuration',
  /livraison_actif && livraisonConfig && livraisonConfig\.codes_postaux\?\.length > 0/.test(fiche))
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
  verifier('l\'adresse de livraison se choisit dans des suggestions',
    /<ChampAdresse\s/.test(blocLiv))
  verifier('et la note est juste en dessous', /<NoteLivraison\s/.test(blocLiv))

  const debutExp = fiche.indexOf('Adresse d&rsquo;expédition</p>')
  const blocExp = debutExp === -1 ? '' : fiche.slice(debutExp, debutExp + 2200)
  verifier('le bloc d\'adresse d\'expédition se découpe', blocExp.length > 500)
  // ⚠️ LA MÊME SAISIE DES DEUX CÔTÉS. Deux champs d'adresse différents dans le
  // même tunnel finiraient par diverger (feedback_appliquer_partout).
  verifier('l\'expédition a la MÊME saisie d\'adresse', /<ChampAdresse\s/.test(blocExp))
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
  verifier('le serveur préfère les coordonnées du navigateur',
    /coordonneesPlausibles\(livraison_lat, livraison_lng\)/.test(route))
  verifier('et se rabat sur une requête PROPRE',
    /geocoderAdresse\(adresse_geocodage/.test(route))
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
  verifier('la réponse d\'encaissement sait clore une LIVRAISON',
    /_viaLivraison/.test(dash) && /changerStatutLivraison\(commandeAEncaisser\.id, 'livree', \{ champs \}\)/.test(dash))
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
  verifier('la commande est marquée avec son transporteur',
    /expedition_transporteur: transporteur \|\| null/.test(dash))
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
  const routeAnn = lire('app/api/emails/commande-annulee/route.js')
  verifier('la route d\'annulation charge la remise et le bon',
    /fidelite_remise, bon_cadeau_montant/.test(routeAnn))
  verifier('🔴 et la LISTE des bons, pour compter combien il y en a',
    /bon_cadeau_montant, bons_utilises/.test(routeAnn))
  // 🔴 LES DEUX ROUTES D'ANNULATION PASSENT LE COMPTE. Elles composent chacune
  // leurs appels : le 30/08, une correction n'en avait touché qu'une, et le
  // gabarit se taisait en silence de l'autre côté.
  for (const f of ['app/api/emails/commande-annulee/route.js', 'app/api/commande/cancel/route.js']) {
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
  verifier('il rapporte la raison, pas juste le code', /j\?\.error \|\| j\?\.message/.test(fetchPro))

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
  for (const [nom, chemin] of [
    ['/api/emails/commande-annulee', 'app/api/emails/commande-annulee/route.js'],
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
    'app/api/emails/commande-annulee/route.js',
    'app/api/emails/commande-confirmee/route.js',
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

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Livraison verte.')
