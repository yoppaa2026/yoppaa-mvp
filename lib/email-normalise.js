// L'adresse mail, écrite d'UNE seule façon.
//
// ⚠️ LE DÉFAUT, ET IL FAISAIT DISPARAÎTRE LES COMMANDES DES GENS.
//
// L'email du client était enregistré TEL QU'IL L'AVAIT TAPÉ, majuscules
// comprises, et relu systématiquement EN MINUSCULES (`identiteYopper` fait un
// `toLowerCase()`). La comparaison `client_email = <email du compte>` ne
// retrouvait donc rien dès que le client avait saisi « Jean.Dupont@Gmail.com ».
//
// Ce que ça donnait pour lui :
//   • il commandait, tout se passait bien ;
//   • il se connectait, et ses commandes ET ses rendez-vous DISPARAISSAIENT de
//     son écran, comme s'il n'avait jamais rien acheté.
//
// Et ça ne se voyait pas chez tout le monde : celui qui tape son adresse en
// minuscules, comme la plupart des gens sur téléphone, ne rencontre jamais le
// problème. C'est le pire des défauts, celui qui épargne son auteur.
//
// ⚠️ EN THÉORIE, la partie gauche d'une adresse est sensible à la casse (RFC
// 5321). EN PRATIQUE, aucun fournisseur grand public ne l'applique : Gmail,
// Outlook, Proton traitent Jean@ et jean@ comme la même boîte. Normaliser est
// donc la seule façon de retrouver quelqu'un de façon fiable, et c'est ce que
// fait tout le monde.

export function normaliserEmail(valeur) {
  const s = String(valeur ?? '').trim().toLowerCase()
  return s || null
}

// Deux adresses désignent-elles la même personne ?
export function memeEmail(a, b) {
  const na = normaliserEmail(a)
  const nb = normaliserEmail(b)
  return !!na && na === nb
}
