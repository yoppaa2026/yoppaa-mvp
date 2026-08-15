// OÙ SE PASSE L'ACTIVITÉ D'UN COMMERÇANT, ET QUAND.
//
// ⚠️ LE SIÈGE SOCIAL N'EST PAS LE LIEU DE L'ACTIVITÉ, et Yoppaa confondait les
// deux. Un commerçant n'avait qu'une adresse, et elle jouait quatre rôles à la
// fois : identifier l'entreprise, dire où aller, servir de point de calcul des
// distances, et rattacher la fiche à une commune. Tant qu'ils coïncident,
// personne ne voit le problème.
//
// Ils divergent dans deux cas bien réels :
//   • le commerçant inscrit à la BCE à son domicile mais qui travaille ailleurs.
//     Il saisit son domicile pour être en règle, et Yoppaa envoyait ses clients
//     chez lui ;
//   • le commerçant ITINÉRANT. Une professeure de yoga qui donne cours dans deux
//     ou trois salles, un food truck qui change de place chaque jour.
//
// Ce fichier existe pour qu'une SEULE fonction réponde à la question, partout.
// La fiche, l'accueil, le calcul des distances et le rattachement communal la
// posent tous, et une divergence entre deux d'entre eux enverrait un client au
// mauvais endroit sans que rien ne le signale.
//
// Fonctions PURES : aucune lecture de base, aucune horloge. Le jour est injecté.

import { jourSemaineDe } from './creneaux'

// La sorte de lieu, et ce qu'elle porte. La contrainte de la base dit la même
// chose, c'est volontaire : le code refuse ce que la base refuse.
export const LIEU_PERMANENT = 'permanent'   // le salon, la boutique, un second siège
export const LIEU_HEBDO = 'hebdo'           // mardi ici, jeudi là
export const LIEU_PONCTUEL = 'ponctuel'     // le marché de Noël

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE SIÈGE SOCIAL N'EST PLUS JAMAIS UN LIEU (décision d'Alex du 15/08)
//
// « L'adresse du signup ne doit servir qu'à la validation du dossier. Les
// adresses, fixes ou dynamiques, seront encodées dans le profil. »
//
// Ce fichier fabriquait un lieu à partir de `commercants.adresse` dès que le
// commerçant n'avait pas explicitement dit le contraire. C'était commode et
// c'était faux : une adresse saisie pour être en règle à la BCE devenait une
// invitation à venir sonner. Le domicile d'une commerçante était publié sans
// qu'elle ait jamais demandé qu'il le soit.
//
// La fonction `siegeCommeLieu` a donc été SUPPRIMÉE, pas neutralisée : laissée
// en place, elle serait revenue par une porte ou par une autre.
//
// ⚠️ CE QUI REND LA BASCULE SANS DANGER : la migration
// `MIGRATION_ADRESSE_SIEGE_DELIEE.sql` a recopié, une fois pour toutes, le
// siège dans un VRAI lieu permanent pour ceux dont l'activité s'y passait.
// Ce qui était implicite est devenu explicite, et l'affichage n'a pas bougé
// d'un pixel. Sans elle, huit commerces auraient perdu leur adresse d'un coup.
//
// ⚠️ ET `commercants.commune_id` N'EXISTE PAS. Cette fonction la lisait, donc
// elle valait `undefined` depuis toujours. C'est la base qui l'a appris à ce
// projet, en refusant une migration écrite sur cette supposition.
// ═══════════════════════════════════════════════════════════════════════════

function normaliser(lieu) {
  return {
    id: lieu.id ?? null,
    source: lieu.type,
    type: lieu.type,
    libelle: lieu.libelle || null,
    adresse: lieu.adresse || null,
    latitude: lieu.latitude ?? null,
    longitude: lieu.longitude ?? null,
    commune_id: lieu.commune_id ?? null,
    heure_debut: lieu.heure_debut ?? null,
    heure_fin: lieu.heure_fin ?? null,
  }
}

// Les lieux où l'on peut trouver ce commerçant CE JOUR-LÀ.
//
// La règle :
//   1. les lieux PERMANENTS sont toujours de la partie. Un salon à deux
//      adresses est ouvert aux deux, tous les jours ;
//   2. s'y ajoute le lieu ITINÉRANT du jour, s'il y en a un ;
//   3. et un PONCTUEL prime sur l'hebdomadaire : le marché de Noël remplace la
//      tournée habituelle ce jour-là, il ne s'y ajoute pas.
//
// ⚠️ L'ORDRE COMPTE, ET LE LIEU DU JOUR VIENT EN PREMIER. Les écrans prennent
// le premier de la liste pour répondre à « où es-tu aujourd'hui », et la réponse
// la plus précise doit gagner. Sans cela, un food truck qui n'a pas décoché la
// case du signup verrait sa fiche annoncer l'adresse de son DÉPÔT alors qu'il
// est au marché : exactement le défaut que le module M5 avait corrigé.
//
// `jour` est une date au format 'AAAA-MM-JJ'. Sans elle, on ne rend que les
// permanents : c'est le cas d'un écran qui présente le commerce sans se placer
// à une date.
//
// ⚠️ RENDRE UNE LISTE VIDE EST UNE RÉPONSE VALABLE, et c'est nouveau. Un
// commerçant qui n'a déclaré aucun lieu n'a pas d'adresse à annoncer, et son
// tableau de bord le lui dit en toutes lettres. Retomber sur son siège serait
// publier une adresse administrative qu'il n'a jamais offerte à ses clients.
// `commercant` reste accepté pour ne pas casser les appelants, mais plus rien
// n'en est lu.
export function lieuxDuJour({ lieux = [], jour = null } = {}) {
  const actifs = (lieux || []).filter(l => l && l.actif !== false)

  const permanents = actifs.filter(l => l.type === LIEU_PERMANENT).map(normaliser)

  if (!jour) return permanents

  const ponctuels = actifs.filter(l => l.type === LIEU_PONCTUEL && l.date_jour === jour).map(normaliser)
  if (ponctuels.length > 0) return [...ponctuels, ...permanents]

  const nomDuJour = jourSemaineDe(jour)
  const hebdo = actifs.filter(l => l.type === LIEU_HEBDO && l.jour_semaine === nomDuJour).map(normaliser)
  return [...hebdo, ...permanents]
}

// ⚠️ TOUTES SES COMMUNES, TOUT LE TEMPS. Décision d'Alex du 12/08 : une
// professeure de yoga qui intervient à Mettet et à Biesme apparaît dans les
// deux listes en permanence, sa fiche indiquant quel jour elle est où. L'autre
// option, ne la montrer que dans la commune du jour, l'aurait rendue invisible
// six jours sur sept à ceux qui la cherchent.
//
// Rend un tableau d'identifiants de commune, sans doublon et sans valeur vide.
//
// ⚠️ LA BRANCHE DU SIÈGE ÉTAIT DU CODE MORT, et personne ne le savait. Elle
// lisait `commercant.commune_id`, une colonne qui **n'existe pas** : la base a
// fini par le dire, en refusant une migration écrite sur cette supposition.
// Elle valait donc `undefined` depuis le premier jour, et cette fonction n'a
// jamais rendu que les communes des lieux.
//
// ⚠️ Et rien dans l'application ne l'appelle : seul le banc s'en sert. Le
// rattachement d'un commerce à une commune passe ailleurs, par la DISTANCE sur
// l'accueil et par le code postal pour le Good Morning Yoppers. Elle est
// conservée parce qu'elle décrit la bonne règle et servira le jour où
// `commune_id` sera enfin écrit sur les lieux.
export function communesDuCommercant({ lieux = [] } = {}) {
  const vues = new Set()
  for (const l of (lieux || [])) {
    if (l && l.actif !== false && l.commune_id) vues.add(l.commune_id)
  }
  return [...vues]
}

// Le jour de la semaine où l'on trouve ce commerçant à ce lieu, en toutes
// lettres, pour l'afficher sur la fiche. Rend null pour un permanent, qui n'a
// pas de jour : écrire « tous les jours » serait faux, ses horaires décident.
export function jourDuLieu(lieu) {
  if (!lieu) return null
  if (lieu.type === LIEU_HEBDO) return lieu.jour_semaine || null
  if (lieu.type === LIEU_PONCTUEL) return lieu.date_jour || null
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// LE LIEU À UNE HEURE DONNÉE
//
// Le food truck a DEUX emplacements le même jour, celui du midi et celui du
// soir. La question « où es-tu aujourd'hui » n'a alors plus de réponse unique,
// et il faut demander « où es-tu à telle heure ».
//
// ⚠️ C'EST AUSSI CE QUI RATTACHE UN RENDEZ-VOUS À UN LIEU SANS RIEN AJOUTER.
// Un créneau a une heure, un lieu a une plage : l'intersection donne la
// réponse. Il est donc inutile de rattacher un lieu à chaque créneau.
// ═══════════════════════════════════════════════════════════════════════════

// 'HH:MM:SS' et 'HH:MM' se comparent mal entre eux ('09:00' < '09:00:00').
// On ramène tout à 'HH:MM', où la comparaison de chaînes EST la comparaison
// chronologique, puisque le format est à largeur fixe et complété par des zéros.
function hhmm(valeur) {
  if (!valeur) return null
  const t = String(valeur).trim()
  return t.length >= 5 ? t.slice(0, 5) : null
}

// Une plage couvre-t-elle cette heure ?
//
// ⚠️ Le cas de la plage qui PASSE MINUIT est traité : un food truck de nuit
// annonce 22:00 → 02:00. Sans ce cas, sa plage serait vide et il n'aurait
// jamais de lieu, à aucune heure de son service.
function plageCouvre(lieu, heure) {
  const debut = hhmm(lieu?.heure_debut)
  const fin = hhmm(lieu?.heure_fin)
  const h = hhmm(heure)
  if (!debut || !fin || !h) return false
  return debut <= fin ? (h >= debut && h < fin) : (h >= debut || h < fin)
}

// LE lieu où se trouve le commerçant à cette heure-là.
//
// L'ordre des réponses, de la plus précise à la plus large :
//   1. la plage qui couvre l'heure demandée ;
//   2. à défaut, la PROCHAINE plage du jour. À 15h entre deux services, mieux
//      vaut lire « à 18h au Zoning » que rien du tout ;
//   3. à défaut, un lieu sans horaire, permanent ou siège : il vaut toute la
//      journée ;
//   4. à défaut, le premier lieu du jour, ce que répondait la règle avant.
//
// Sans heure, la réponse reste celle d'avant : le premier lieu du jour.
export function lieuALHeure({ commercant, lieux = [], jour = null, heure = null } = {}) {
  const duJour = lieuxDuJour({ commercant, lieux, jour })
  if (duJour.length === 0) return null

  const h = hhmm(heure)
  if (!h) return duJour[0]

  const couvrant = duJour.find(l => plageCouvre(l, h))
  if (couvrant) return couvrant

  const suivants = duJour
    .filter(l => hhmm(l.heure_debut) && hhmm(l.heure_debut) > h)
    .sort((a, b) => hhmm(a.heure_debut).localeCompare(hhmm(b.heure_debut)))
  if (suivants.length > 0) return suivants[0]

  const sansHoraire = duJour.find(l => !hhmm(l.heure_debut))
  return sansHoraire || duJour[0]
}

// Deux emplacements du même jour se marchent-ils dessus ?
//
// ⚠️ SANS CETTE GARDE, LA QUESTION « OÙ ES-TU À 12H30 » N'A PLUS DE RÉPONSE.
// Deux plages qui se recouvrent rendent le premier de la liste, c'est-à-dire
// l'ordre d'insertion en base : le client apprendrait où aller au hasard.
// L'éditeur refuse donc la saisie plutôt que de trancher à sa place.
export function plagesSeChevauchent(a, b) {
  const d1 = hhmm(a?.heure_debut), f1 = hhmm(a?.heure_fin)
  const d2 = hhmm(b?.heure_debut), f2 = hhmm(b?.heure_fin)
  // Un lieu sans horaire vaut toute la journée : il chevauche forcément l'autre.
  if (!d1 || !f1 || !d2 || !f2) return true
  return d1 < f2 && d2 < f1
}

// Le lieu déjà enregistré qui empêcherait celui-ci d'exister, ou null.
// `candidat` porte type, jour_semaine ou date_jour, heures, et son id s'il
// s'agit d'une modification (on ne se compare pas à soi-même).
export function lieuEnConflit(lieux = [], candidat = null) {
  if (!candidat) return null
  const memeJour = (lieux || []).filter(l => {
    if (!l || l.id === candidat.id) return false
    if (l.type !== candidat.type) return false
    if (candidat.type === LIEU_HEBDO) return l.jour_semaine === candidat.jour_semaine
    if (candidat.type === LIEU_PONCTUEL) return l.date_jour === candidat.date_jour
    return false   // deux permanents ne se chevauchent pas : ce sont deux adresses
  })
  return memeJour.find(l => plagesSeChevauchent(l, candidat)) || null
}

// ═══════════════════════════════════════════════════════════════════════════
// LE LIEU D'UNE PLAGE, ET CELUI D'UN RENDEZ-VOUS DÉJÀ PRIS
// ═══════════════════════════════════════════════════════════════════════════

// Le lieu de référence quand une plage n'en désigne aucun.
//
// ⚠️ C'EST LUI QUI PROTÈGE LE SYSTÈME CLASSIQUE. Une boulangerie n'activera
// jamais le planning par lieu : ses créneaux ont un `lieu_id` vide, et vide ne
// veut pas dire « nulle part », il veut dire « là où se passe l'activité ».
export function lieuPrincipal({ lieux = [] } = {}) {
  const actifs = (lieux || []).filter(l => l && l.actif !== false)
  const marque = actifs.find(l => l.type === LIEU_PERMANENT && l.principal)
  if (marque) return normaliser(marque)
  // ⚠️ PLUS DE REPLI SUR LE SIÈGE. Une plage sans lieu désigné vaut « là où se
  // passe l'activité », et l'activité se passe où le commerçant l'a DÉCLARÉE,
  // jamais à l'adresse qui a servi à valider son dossier.
  const permanent = actifs.find(l => l.type === LIEU_PERMANENT)
  return permanent ? normaliser(permanent) : null
}

// L'ADRESSE QU'UNE FICHE AFFICHE, ET LA SEULE QU'ELLE A LE DROIT D'AFFICHER.
//
// ⚠️ DÉFAUT TROUVÉ PAR ALEX LE 15/08 AU SOIR, SUR CENTRE RESPIRE. Les deux
// fiches calculaient `emplacementDuJour?.adresse || commercant?.adresse`. Le
// module LIEUX avait pourtant retiré le siège social de la lib le matin même :
// il restait en dur, dans l'écran, sous forme de repli.
//
// Un SAMEDI, une professeure qui ne donne cours que le lundi et le mardi n'a
// aucun lieu « du jour ». Le repli s'enclenchait donc, et sa fiche affichait
// l'adresse de son INSCRIPTION, à Mettet, alors que ses cours se donnent à
// Biesme. Un client s'y serait rendu.
//
// La règle est en DEUX temps, et le second est le vide : le premier lieu du
// jour, sinon RIEN. Rien vaut mieux qu'une fausse adresse, et le bloc « Où me
// trouver cette semaine » raconte déjà le reste.
//
// ⚠️ J'AVAIS ÉCRIT UN TROISIÈME TEMPS, UN REPLI SUR `lieuPrincipal`, ET LA
// MESURE PAR MUTATION L'A DÉMASQUÉ COMME INUTILE : `lieuxDuJour` inclut DÉJÀ
// les permanents tous les jours, un salon à deux adresses étant ouvert aux deux
// toute la semaine. Le retirer ne faisait rougir aucun test, ce qui est le
// signe qu'il ne protégeait de rien. Une ligne qui ne protège de rien ment sur
// le risque, donc elle part.
export function lieuAAfficher({ lieux = [], jour = null } = {}) {
  return lieuxDuJour({ lieux, jour })[0] || null
}

// Le lieu d'une plage de retrait ou de réservation.
//
// ⚠️ LE REPLI SUR LE JOUR N'EST PAS UN LUXE, il rattrape le cas du FOOD TRUCK
// TEL QU'IL EXISTE AUJOURD'HUI. Il a décoché la case du siège social, il n'a
// que des emplacements hebdomadaires, donc aucun lieu permanent : le lieu
// principal est alors introuvable, et ses créneaux de retrait actuels, qui ne
// désignent aucun lieu, se retrouveraient sans la moindre adresse. Trouvé en
// exécutant la règle, pas en la relisant.
//
// `jour` est la date concrète quand on l'a. Sans elle, la plage porte au moins
// son propre jour de semaine ou sa date, et ils suffisent à trancher.
export function lieuDeLaPlage(plage, { commercant, lieux = [], jour = null } = {}) {
  if (plage?.lieu_id) {
    const trouve = (lieux || []).find(l => l && l.id === plage.lieu_id)
    if (trouve) return normaliser(trouve)
  }

  // ⚠️ LE LIEU DU JOUR PASSE AVANT LE LIEU PRINCIPAL, et l'ordre inverse a été
  // mesuré au banc : un food truck qui n'a pas décoché la case du siège voyait
  // ses créneaux de retrait désigner son DÉPÔT alors qu'il était au marché.
  // C'est exactement le défaut que le module M5 avait corrigé, revenu par la
  // porte des plages horaires. `lieuxDuJour` place déjà le lieu du jour en
  // premier pour la même raison.
  const h = hhmm(plage?.heure_debut)

  const dateVisee = jour || plage?.date_jour || plage?.date_specifique || null
  if (dateVisee) {
    const duJour = lieuxDuJour({ commercant: null, lieux, jour: dateVisee })
    if (duJour.length > 0) {
      const couvrant = h ? duJour.find(l => plageCouvre(l, h)) : null
      return couvrant || duJour[0]
    }
  }

  // Une plage récurrente porte son jour de semaine, sans date : il suffit.
  if (plage?.jour_semaine) {
    const duJour = (lieux || [])
      .filter(l => l && l.actif !== false && l.type === LIEU_HEBDO && l.jour_semaine === plage.jour_semaine)
      .map(normaliser)
    if (duJour.length > 0) {
      const couvrant = h ? duJour.find(l => plageCouvre(l, h)) : null
      return couvrant || duJour[0]
    }
  }

  return lieuPrincipal({ commercant, lieux })
}

// Où a lieu ce rendez-vous, ou où se retire cette commande ?
//
// ⚠️ LES COLONNES FIGÉES GAGNENT TOUJOURS. Un rendez-vous fige son lieu à la
// réservation, comme il fige déjà le nom et le téléphone du client. C'est ce
// qui fait qu'un rendez-vous d'il y a six mois dit encore où il a eu lieu,
// même si l'emplacement a été supprimé depuis, et c'est ce qui rend vérifiable
// la règle d'Alex : un emplacement qui porte des rendez-vous ne se déplace pas.
//
// Le calcul ne sert donc qu'aux lignes ANTÉRIEURES à cette bascule, qui n'ont
// rien de figé. Il se fait à la date ET à l'heure, seule façon de distinguer le
// service du midi de celui du soir.
export function lieuDeLaReservation(reservation, { commercant, lieux = [] } = {}) {
  if (reservation?.lieu_libelle || reservation?.lieu_adresse) {
    return {
      id: reservation.lieu_id ?? null,
      source: 'fige',
      type: null,
      libelle: reservation.lieu_libelle || null,
      adresse: reservation.lieu_adresse || null,
      latitude: null, longitude: null, commune_id: null,
      heure_debut: null, heure_fin: null,
    }
  }
  return lieuALHeure({
    commercant,
    lieux,
    jour: reservation?.date_rdv || reservation?.date_retrait || null,
    heure: reservation?.heure_debut || null,
  })
}

// Ce qu'on montre au client : le nom du lieu quand il en a un, sinon l'adresse.
// Rend null plutôt qu'une chaîne vide, pour que l'appelant puisse masquer la
// ligne entière au lieu d'afficher un libellé qui pend.
export function libelleLieu(lieu) {
  if (!lieu) return null
  const nom = String(lieu.libelle || '').trim()
  const adresse = String(lieu.adresse || '').trim()
  if (nom && adresse) return `${nom}, ${adresse}`
  return nom || adresse || null
}

// ═══════════════════════════════════════════════════════════════════════════
// LES HORAIRES DÉDUITS DES EMPLACEMENTS
//
// ⚠️ DEUX ÉCRANS DISAIENT LA MÊME CHOSE SANS SE PARLER. Un food truck qui
// déclare « mardi, Place du Marché, 11h-14h » devait EN PLUS remplir « mardi
// 07:00 → 18:30 » dans ses horaires d'ouverture, et rien ne disait lequel des
// deux faisait foi. Relevé par Alex le 13/08 en regardant son propre écran.
//
// ⚠️ ET ON NE POUVAIT PAS SIMPLEMENT SUPPRIMER LA GRILLE : les horaires ne
// servent pas qu'à l'affichage, le moteur de créneaux les CROISE avec les
// plages de rendez-vous et écarte tout créneau tombant hors ouverture. Les
// retirer aurait fait passer le commerce pour fermé toute la semaine, et plus
// aucun créneau n'aurait été proposé à personne.
//
// On les déduit donc. Une seule saisie, aucune contradiction possible, et le
// moteur reçoit exactement ce qu'il attendait.
// ═══════════════════════════════════════════════════════════════════════════

const JOURS_SEMAINE_LIEUX = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

function hhmmCourt(v) {
  if (!v) return null
  const t = String(v).trim()
  return t.length >= 5 ? t.slice(0, 5) : null
}

// Rend un objet au format `commercants.horaires_detail`, celui que le moteur
// de créneaux sait déjà lire.
//
// ⚠️ LES DEUX SERVICES D'UN FOOD TRUCK NE SE FONDENT PAS EN UN SEUL. Midi
// 11h-14h et soir 18h-21h donneraient, en prenant le minimum et le maximum,
// une ouverture de 11h à 21h : le client se verrait proposer un créneau à 16h
// devant un camion absent. Le format porte déjà `debut2` et `fin2` pour les
// commerces à coupure, et c'est exactement ce cas.
//
// Au-delà de deux services dans la journée, le format ne sait pas les décrire :
// on couvre alors du premier début au dernier fin, en le signalant par
// `approximatif`, pour que l'écran puisse le dire au commerçant plutôt que de
// laisser croire à une précision qui n'existe pas.
export function horairesDepuisLieux(lieux = []) {
  const actifs = (lieux || []).filter(l => l && l.actif !== false && l.type === LIEU_HEBDO)
  const horaires = {}

  for (const jour of JOURS_SEMAINE_LIEUX) {
    const duJour = actifs
      .filter(l => l.jour_semaine === jour)
      .sort((a, b) => String(a.heure_debut || '').localeCompare(String(b.heure_debut || '')))

    if (duJour.length === 0) { horaires[jour] = { ouvert: false }; continue }

    const plages = duJour
      .map(l => ({ debut: hhmmCourt(l.heure_debut), fin: hhmmCourt(l.heure_fin) }))
      .filter(p => p.debut && p.fin)

    // Présent ce jour-là mais sans heures déclarées : on sait qu'il est ouvert,
    // on ne sait pas quand. Mieux vaut le dire que d'inventer des bornes.
    if (plages.length === 0) { horaires[jour] = { ouvert: true, sansHoraire: true }; continue }

    if (plages.length === 1) {
      horaires[jour] = { ouvert: true, debut: plages[0].debut, fin: plages[0].fin }
    } else if (plages.length === 2) {
      horaires[jour] = {
        ouvert: true,
        debut: plages[0].debut, fin: plages[0].fin,
        debut2: plages[1].debut, fin2: plages[1].fin,
      }
    } else {
      horaires[jour] = {
        ouvert: true,
        debut: plages[0].debut,
        fin: plages[plages.length - 1].fin,
        approximatif: true,
      }
    }
  }
  return horaires
}

// Un commerçant est-il ITINÉRANT ? La question sert à décider ce qu'on écrit sur
// sa fiche : « Rue de Prée 9G » pour un salon, « où me trouver cette semaine »
// pour une professeure de yoga. Elle se lit sur ses lieux, jamais sur sa
// catégorie : un food truck et une prof de yoga n'ont pas le même métier mais
// le même besoin.
export function estItinerant(lieux = []) {
  return (lieux || []).some(l => l && l.actif !== false
    && (l.type === LIEU_HEBDO || l.type === LIEU_PONCTUEL))
}
