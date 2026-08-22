// LES RÈGLES DU TABLEAU DE BORD : ce qui réclame un geste, et ce qui se défait.


// ═══ 1) LE RETOUR ARRIÈRE, ET IL N'Y EN A QU'UN ═══════════════════════════
//
// ⚠️ ALEX A DEMANDÉ « pouvoir revenir en arrière au cas où il clique par
// erreur », PUIS il a demandé si c'était nécessaire AVANT que je code. Bien lui
// en a pris : en regardant cas par cas ce qu'un clic raté coûte VRAIMENT, trois
// des quatre retours ne servent à rien ou nuisent.
//
//   • `en attente` → `en préparation` : le clic raté ne coûte rien. Le commerce
//     va préparer la commande de toute façon.
//   • `en préparation` → `prête` : l'email et la notification SONT DÉJÀ PARTIS.
//     Revenir en arrière ne les rappelle pas, le client est peut-être en route.
//     ⚠️ Ce bouton donnerait l'illusion d'avoir réparé ce qui ne l'est pas.
//   • `non retirée` → : 🔴 la route serveur a RENDU LE STOCK des versions,
//     « filtrée sur l'ancien statut pour ne le rendre qu'une fois ». Après un
//     aller-retour, l'ancien statut redevient `pret`, le filtre passe, et le
//     stock est rendu UNE SECONDE FOIS. Un article verrait ses pièces se
//     multiplier. Tant que la restitution symétrique n'existe pas, pas de
//     retour depuis ce statut.
//   • `récupérée` → `prête` : LE SEUL QUI FAIT MAL. La commande quitte la liste
//     active, le commerçant ne la voit plus, et le client se présente.
//
// ⚠️ ET L'EXPÉDITION N'EN EST PAS : un colis parti ne revient pas, et son
// numéro de suivi a déjà été communiqué.
//
// ⚠️ `encaisse_mode` N'EST JAMAIS EFFACÉ par un retour arrière. Si le
// commerçant a encaissé, l'argent est réellement entré : effacer la trace
// serait supprimer une écriture comptable pour réparer un clic. Conséquence
// voulue : en repassant la commande en récupérée, la question du moyen ne se
// repose pas, puisqu'elle a déjà sa réponse.

export function retourArriereAutorise(commande) {
  if (!commande) return null
  if (commande.statut !== 'recupere') return null
  if (commande.mode_retrait === 'expedition') return null
  return {
    versStatut: 'pret',
    // Une livraison « livrée » doit aussi redevenir non partie, sans quoi elle
    // resterait hors de la tournée tout en étant active.
    effaceStatutLivraison: commande.mode_retrait === 'livraison',
    libelle: commande.mode_retrait === 'livraison'
      ? 'Annuler la livraison'
      : 'Annuler le retrait',
    // ⚠️ Le geste, pas l'action technique : personne ne pense « repasser en
    // statut prêt » (feedback_boutons_qui_disent_le_geste).
    aide: 'La commande revient dans ta liste, comme si elle n’avait pas été remise.',
  }
}


// ═══ 2) « ATTENTION, TU AS DU TAF CÔTÉ LIVRAISON » ════════════════════════
//
// ⚠️ DEMANDE D'ALEX, 22/08 : un commerçant posté sur son onglet Retrait ne voit
// RIEN arriver côté Livraison. Le compteur existe déjà sur l'onglet, mais un
// compteur n'est pas une alerte : il affiche le TOTAL du jour, y compris les
// commandes déjà traitées, et il ne bouge pas d'un pixel quand une nouvelle
// tombe. Une pastille qui affiche « 4 » toute la journée finit par ne plus être
// lue du tout.
//
// ⚠️ CE QUI COMPTE N'EST PAS LE NOMBRE DE COMMANDES, C'EST LE NOMBRE DE GESTES
// QUI L'ATTENDENT. Une commande récupérée, livrée ou annulée ne réclame plus
// rien : la faire entrer dans l'alerte, c'est demander au commerçant d'aller
// voir pour ne rien trouver, et il cessera d'y aller.
//
// ⚠️ ET LES DEUX CÔTÉS NE DEMANDENT PAS LE MÊME TRAVAIL. Une commande de
// RETRAIT passée à « prête » attend LE CLIENT : le commerçant n'a plus rien à
// faire. La même en LIVRAISON attend qu'il charge sa voiture et parte. Compter
// pareil des deux côtés ferait clignoter le retrait pour rien, et taire la
// livraison au moment précis où il faut y aller.

// Ce qui réclame encore un geste du commerçant, des deux côtés.
const A_PREPARER = ['en_attente', 'en_preparation']

/**
 * Combien de gestes attendent le commerçant dans un mode donné.
 *
 * @param {Array} commandes  les commandes du jour affiché, tous modes confondus
 * @param {'retrait'|'livraison'} mode
 * @returns {number}
 */
export function travailEnAttente(commandes, mode) {
  if (!Array.isArray(commandes)) return 0
  const estLivraison = mode === 'livraison'
  let n = 0
  for (const c of commandes) {
    if (!c) continue
    const cLivraison = c.mode_retrait === 'livraison'
    if (cLivraison !== estLivraison) continue
    if (A_PREPARER.includes(c.statut)) { n++; continue }
    // ⚠️ LA SEULE ASYMÉTRIE, ET ELLE EST VOULUE. Une livraison « prête » n'est
    // pas terminée : le sac est sur le comptoir et personne ne viendra le
    // chercher. Tant qu'elle n'est pas partie, c'est du travail.
    if (estLivraison && c.statut === 'pret' && !c.statut_livraison) n++
  }
  return n
}

/**
 * Faut-il alerter sur l'onglet que le commerçant NE REGARDE PAS ?
 *
 * ⚠️ ON N'ALERTE JAMAIS SUR L'ONGLET OUVERT : ce qu'il a sous les yeux n'a pas
 * besoin d'une pastille pour se faire remarquer, et une alerte sur la vue
 * courante apprend à ignorer les alertes.
 */
export function alerteAutreOnglet(commandes, vueCourante) {
  const autre = vueCourante === 'livraison' ? 'retrait' : 'livraison'
  const n = travailEnAttente(commandes, autre)
  if (n === 0) return null
  return {
    mode: autre,
    nb: n,
    // ⚠️ LE TEXTE DIT LE CÔTÉ ET LE NOMBRE. « Tu as du travail ailleurs » ferait
    // chercher ; on nomme l'onglet et on chiffre, pour qu'il décide d'y aller
    // ou non sans avoir à basculer (feedback_information_complete).
    texte: autre === 'livraison'
      ? (n === 1 ? '1 livraison t’attend' : `${n} livraisons t’attendent`)
      : (n === 1 ? '1 commande à retirer t’attend' : `${n} commandes à retirer t’attendent`),
  }
}
