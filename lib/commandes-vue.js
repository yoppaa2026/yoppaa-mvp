// Ce que le commerçant a sur son bureau aujourd'hui, et ce qui est de l'histoire.
//
// ⚠️ LE DÉFAUT QUE CE FICHIER RÈGLE. Le classement par jour a été pensé pour le
// Click & Collect alimentaire, où la commande est attachée à un CRÉNEAU : passé
// le jour dit, elle a été retirée ou elle ne le sera jamais, et l'historique est
// sa place naturelle.
//
// La boutique de détail ne fonctionne pas comme ça. Il n'y a AUCUN créneau : le
// client passe « dans la semaine », et un colis part quand il est emballé. Une
// commande passée lundi et pas encore expédiée basculait donc mardi dans
// l'Historique, un onglet qu'on ouvre pour chercher, pas pour travailler. Le
// commerçant devait deviner qu'il lui restait des colis à envoyer, et le client
// attendait un paquet que personne ne préparait.
//
// La règle tient en une phrase : **une commande qui n'est pas finie reste sur le
// bureau.** Elle ne vaut que là où le jour ne veut rien dire, c'est-à-dire dans
// le monde boutique. En alimentaire, une commande du samedi non retirée doit
// bien finir en « non retiré », pas remonter indéfiniment sur le jour courant.

// Les catégories sans créneau : on y vend, on n'y donne pas rendez-vous à
// l'heure. `vitrine` en fait partie depuis la vente de produits au salon.
export const CATEGORIES_SANS_CRENEAU = ['detail', 'vitrine']

// Ce qui attend encore un geste du commerçant. Mêmes statuts que partout
// ailleurs : ni les terminées, ni les annulées.
export const STATUTS_A_TRAITER = ['en_attente', 'en_preparation', 'pret']

export function commandeATraiter(commande) {
  return !!commande && STATUTS_A_TRAITER.includes(commande.statut)
}

// Une commande « en retard » : encore à traiter, dans un commerce sans créneau,
// et datée d'un jour qui n'est plus à l'écran.
//
// @param joursDispos  les jours que le sélecteur propose (aujourd'hui + horizon)
export function commandeEnRetard({ commande, categorie, joursDispos = [], jourDeLaCommande } = {}) {
  if (!CATEGORIES_SANS_CRENEAU.includes(categorie)) return false
  if (!commandeATraiter(commande)) return false
  if (!jourDeLaCommande) return false
  return !joursDispos.includes(jourDeLaCommande)
}

// Le partage complet, celui que l'écran applique.
//
// ⚠️ LES COMMANDES EN RETARD REMONTENT SUR AUJOURD'HUI, JAMAIS SUR UN AUTRE
// JOUR. Les afficher aussi sur demain les ferait compter deux fois, et le
// commerçant croirait avoir deux fois plus de travail qu'en réalité.
//
// @param jourDe  (commande) => 'YYYY-MM-DD' — injecté pour que ce module reste
//                pur : la construction de la clé de jour vit ailleurs.
export function partagerCommandes({
  commandes = [], categorie, joursDispos = [], jourActif, aujourdhui, jourDe,
} = {}) {
  if (typeof jourDe !== 'function') return { duJour: [], historique: [] }

  const retard = (c) => commandeEnRetard({
    commande: c, categorie, joursDispos, jourDeLaCommande: jourDe(c),
  })

  const historique = commandes.filter(c => !joursDispos.includes(jourDe(c)) && !retard(c))
  const duJour = commandes.filter(c =>
    jourDe(c) === jourActif || (jourActif === aujourdhui && retard(c)))

  return { duJour, historique }
}
