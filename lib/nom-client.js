// LE PRÉNOM D'UN CLIENT, SELON LA TABLE OÙ IL EST ÉCRIT.
//
// 🔴 DEUX TABLES, DEUX FORMES, ET ON S'EST FAIT AVOIR DEUX FOIS.
//
//   • `rdv_reservations` et `abonnements` ont `client_prenom` ET `client_nom`,
//     séparés, parce qu'on demande les deux au moment de réserver.
//   • `commandes` n'a QUE `client_nom`, qui contient le nom COMPLET.
//
// ⚠️ CE N'EST PAS UNE COLONNE OUBLIÉE DANS UN SELECT, C'EST UNE COLONNE QUI
// N'EXISTE PAS. Et la différence compte : une colonne existante qu'on oublie de
// demander vaut `undefined` en silence. Une colonne INEXISTANTE fait échouer
// TOUTE la requête — PostgREST rend un 400, `data` vaut null, et la route croit
// que la commande n'existe pas.
//
// 🔴 LE MÊME DÉFAUT, DEUX FOIS, À UN MOIS D'INTERVALLE :
//
//   • 28/07 — le récapitulatif du matin annonçait « 0 commande » à des
//     commerçants qui en avaient. Corrigé DANS CETTE ROUTE-LÀ, avec un
//     commentaire qui expliquait tout.
//   • 27/08 — le mail « ton colis est prêt » ne partait pas. CINQ autres
//     routes demandaient encore `commandes.client_prenom`, et disaient toutes
//     « Commande introuvable ».
//
// ⚠️ LA CONNAISSANCE N'AVAIT PAS VOYAGÉ. Un commentaire dans un fichier ne
// protège que ce fichier. Une fonction partagée protège tous ceux qui
// l'appellent, et le banc protège ceux qui ne l'appellent pas encore.
//
// Ces deux fonctions acceptent les DEUX formes : on ne se demande plus, au
// moment d'écrire un email, de quelle table vient la ligne qu'on tient.

// Le prénom seul. `null` quand on ne sait pas, jamais une chaîne vide qui
// donnerait un « Bonjour  , » avec un trou au milieu.
export function prenomClient(ligne) {
  if (!ligne) return null
  const prenom = String(ligne.client_prenom || '').trim()
  if (prenom) return prenom
  // ⚠️ LE PREMIER MOT, PAS LE DERNIER. « Alexandre Verstappen » donne
  // « Alexandre ». C'est ce que fait déjà `/api/commande/cancel` depuis
  // toujours, et c'est pour ça que ses emails, eux, sont partis.
  const complet = String(ligne.client_nom || '').trim()
  if (!complet) return null
  return complet.split(/\s+/)[0] || null
}

// Le nom complet, pour les en-têtes et les tableaux du commerçant.
export function nomCompletClient(ligne) {
  if (!ligne) return null
  const prenom = String(ligne.client_prenom || '').trim()
  const nom = String(ligne.client_nom || '').trim()
  // ⚠️ SUR UNE COMMANDE, `client_nom` EST DÉJÀ LE NOM COMPLET : le recoller à
  // un prénom absent donnerait le bon résultat, mais le recoller à un prénom
  // présent le doublerait. On ne concatène que si les deux existent ET que le
  // nom ne contient pas déjà le prénom.
  if (prenom && nom && !nom.toLowerCase().startsWith(prenom.toLowerCase())) {
    return `${prenom} ${nom}`
  }
  return nom || prenom || null
}
