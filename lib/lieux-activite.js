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

// Le siège social présenté comme un lieu, quand le commerçant a coché que son
// activité s'y passe. C'est le cas de l'immense majorité, et le défaut de la
// colonne est `true` : rien ne bouge pour les commerçants déjà inscrits.
function siegeCommeLieu(commercant) {
  if (!commercant?.adresse) return null
  return {
    id: null,
    source: 'siege',
    type: LIEU_PERMANENT,
    libelle: commercant.nom || null,
    adresse: commercant.adresse,
    latitude: commercant.latitude ?? null,
    longitude: commercant.longitude ?? null,
    commune_id: commercant.commune_id ?? null,
    heure_debut: null,
    heure_fin: null,
  }
}

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
// à une date, et il vaut mieux montrer le siège que rien.
export function lieuxDuJour({ commercant, lieux = [], jour = null } = {}) {
  const actifs = (lieux || []).filter(l => l && l.actif !== false)

  const permanents = actifs.filter(l => l.type === LIEU_PERMANENT).map(normaliser)
  if (commercant?.siege_social_est_lieu_activite !== false) {
    const siege = siegeCommeLieu(commercant)
    if (siege) permanents.unshift(siege)
  }

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
export function communesDuCommercant({ commercant, lieux = [] } = {}) {
  const vues = new Set()
  if (commercant?.siege_social_est_lieu_activite !== false && commercant?.commune_id) {
    vues.add(commercant.commune_id)
  }
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

// Un commerçant est-il ITINÉRANT ? La question sert à décider ce qu'on écrit sur
// sa fiche : « Rue de Prée 9G » pour un salon, « où me trouver cette semaine »
// pour une professeure de yoga. Elle se lit sur ses lieux, jamais sur sa
// catégorie : un food truck et une prof de yoga n'ont pas le même métier mais
// le même besoin.
export function estItinerant(lieux = []) {
  return (lieux || []).some(l => l && l.actif !== false
    && (l.type === LIEU_HEBDO || l.type === LIEU_PONCTUEL))
}
