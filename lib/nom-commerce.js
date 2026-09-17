// DIRE « CHEZ » SANS LE DIRE DEUX FOIS.
//
// 🔴 CE QUE LE YOPPER LISAIT (trouvé par Alex le 17/09, sur une capture destinée
// aux stores). L'écran de confirmation d'une commande annonçait :
//
//     Ta commande est Yoppée !
//     Chez Chez Momo
//     Tu te rends chez Chez Momo à ton créneau.
//     [ Continuer chez Chez Momo ]
//
// Trois fois sur le même écran, et sur DEUX des sept fiches publiées : « Chez
// Momo » et « Chez Mathilde ». Un nom de commerce porte souvent sa préposition,
// et y coller la nôtre la répète.
//
// ⚠️ C'EST LE MÊME DÉFAUT QUE LE LIBELLÉ DE LIEU CORRIGÉ LE MATIN MÊME : un
// préfixe ajouté à un texte qui le contient déjà. J'avais cherché les frères du
// LIEU, pas les frères du MOTIF, et ils étaient quarante-sept.
//
// ⚠️ ET ON NE TRONQUE JAMAIS LE NOM. Rendre « chez Momo » à partir de « Chez
// Momo » serait grammaticalement joli et faux : l'enseigne s'appelle « Chez
// Momo », c'est ce nom-là qui est peint sur la vitrine et que le client cherche.
// On retire notre préposition, jamais la sienne.

import { sansAccents } from './texte-normalise.js'

// Le nom porte-t-il déjà sa préposition ? On borne sur un MOT entier : sans le
// `\b`, « Chezal » ou une enseigne nommée « Chezona » passeraient pour des
// « chez ».
const PORTE_LA_PREPOSITION = /^chez\b/

export function nomPorteChez(nom) {
  return PORTE_LA_PREPOSITION.test(sansAccents(String(nom || '').trim()))
}

// La locution à glisser dans une phrase : « chez Boulangerie Dupuis », mais
// « Chez Momo » tout court quand le nom porte déjà le mot.
//
// `majuscule` sert les titres et les débuts de phrase. Il ne change rien quand
// le nom porte sa préposition : c'est SA majuscule qui gagne, pas la nôtre.
//
// ⚠️ SANS NOM, ON RESTE UNE PHRASE. Rendre une chaîne vide laisserait « Ta
// commande  a été annulée », avec ses deux espaces et son trou au milieu.
export function chezLeCommerce(nom, { majuscule = false } = {}) {
  const propre = String(nom || '').trim()
  if (!propre) return majuscule ? 'Chez le commerçant' : 'chez le commerçant'
  if (nomPorteChez(propre)) return propre
  return `${majuscule ? 'Chez' : 'chez'} ${propre}`
}
