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
import { emailCommandePrete, emailCommandeEnLivraison } from '../lib/resend.js'

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
verifier('les livrées sont exclues', /\.neq\('statut_livraison', 'livree'\)/.test(tourneeCode))
verifier('les statuts occupants viennent du module partagé',
  /STATUTS_OCCUPENT_CRENEAU/.test(tourneeCode))

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

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Livraison verte.')
