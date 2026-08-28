// Les règles de la langue qui reviennent partout, écrites une fois.
//
// ⚠️ « LE MOT DE ALEXANDRE » (Alex, 28/08, vu dans un vrai email reçu). Le
// gabarit collait « de » puis le prénom, et cette faute part chez quelqu'un
// qui reçoit un cadeau : c'est la première phrase qu'il lit de Yoppaa.
//
// La règle n'est pas « ça sonne mal », c'est une élision obligatoire devant
// une voyelle ou un h muet. Le h aspiré (« de Henri ») est l'exception qu'on
// n'essaie PAS de deviner : aucune liste ne la couvre, et se tromper dans ce
// sens-là (« d'Henri ») est la faute la plus discrète des deux.

// Les voyelles, accents compris, plus le h.
const VOYELLES = 'aàâäeéèêëiîïoôöuùûüyAÀÂÄEÉÈÊËIÎÏOÔÖUÙÛÜYhH'

// « de Alexandre » → « d'Alexandre », « de Carole » → « de Carole ».
//
// ⚠️ REND AUSSI LA PRÉPOSITION, jamais seulement le prénom : c'est ce qui
// empêche d'écrire `de ${elisionDe(x)}` et de recréer la faute en croyant
// l'avoir corrigée.
export function elisionDe(mot) {
  const m = String(mot ?? '').trim()
  if (!m) return 'de'
  return VOYELLES.includes(m[0]) ? `d’${m}` : `de ${m}`
}
