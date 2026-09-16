// CE QU'UN SMS PEUT PORTER SANS COÛTER LE DOUBLE.
//
// 🔴 UN SEUL CARACTÈRE HORS GSM-7 FAIT BASCULER LE MESSAGE ENTIER EN UCS-2,
// donc 70 caractères par segment au lieu de 160. Un SMS de 150 caractères passe
// de 1 segment à 3. C'est Yoppaa qui paie les segments chez Brevo.
//
// ⚠️ LA RÈGLE N'EST PAS « PAS D'ACCENT ». Elle l'était dans ce dépôt, par
// prudence, et elle coûtait la langue : « Rien n est debite si tu viens » se lit
// comme un télégramme. L'alphabet GSM-7 accepte parfaitement les accents de
// `agrave`, `eacute`, `egrave`, `ugrave`, l'apostrophe DROITE, et les capitales
// accentuées courantes. Ce qu'il refuse, ce sont les accents circonflexes, le
// tréma sur `e` et `i`, la cédille minuscule, l'apostrophe TYPOGRAPHIQUE, les
// guillemets français et les tirets longs.
//
// 🔴 ET LE PIÈGE N'EST PAS DANS LE TEXTE QU'ON ÉCRIT, IL EST DANS CE QU'ON
// INTERPOLE. Une garde peut interdire les accents dans un gabarit ; elle ne
// verra jamais qu'une « Crêperie », un « Goût du Jour » ou un « Ça Roule »
// double le coût de chacun de ses SMS. D'où une TRANSLITTÉRATION appliquée au
// message COMPLET, à la porte unique des envois.

// L'alphabet de base (GSM 03.38), un septet par caractère.
const BASE = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
// L'extension : DEUX septets chacun, mais toujours du GSM-7.
const EXTENSION = '^{}\\[~]|€'

export function estGsm7(caractere) {
  return BASE.includes(caractere) || EXTENSION.includes(caractere)
}

// Ce qu'on remplace sciemment, parce que retirer serait pire que traduire.
// ⚠️ L'APOSTROPHE TYPOGRAPHIQUE EN TÊTE : c'est elle qu'on tape sans y penser,
// et c'est elle qui coûte le plus cher.
const REMPLACEMENTS = {
  '’': "'", '‘': "'", '‚': ',', '‛': "'",
  '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
  '–': '-', '—': '-', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ',
  '…': '...', '•': '-', '·': '-',
  'œ': 'oe', 'Œ': 'OE', '™': 'TM', '°': 'o', '‰': '%',
}

// ⚠️ LES MARQUES DIACRITIQUES SE DÉCRIVENT, ELLES NE SE COLLENT PAS DANS UN
// FICHIER SOURCE : ce sont des caractères INVISIBLES, et une classe écrite à la
// main les y ferait entrer sans que personne ne les voie. `\p{M}` dit la même
// chose, et se relit.
const MARQUES = /\p{M}/gu

// Rend un texte entièrement représentable en GSM-7.
//
// ⚠️ TROIS ÉTAPES, DANS CET ORDRE : la traduction volontaire, puis le retrait
// des accents que l'alphabet refuse (un `e` circonflexe devient un `e`), puis
// l'abandon de ce qui reste — un emoji n'a pas d'équivalent, et le laisser
// coûterait le double.
export function versGsm7(texte) {
  const brut = String(texte ?? '')
  let sortie = ''
  for (const caractere of brut) {
    if (estGsm7(caractere)) { sortie += caractere; continue }
    const traduit = REMPLACEMENTS[caractere]
    if (traduit !== undefined) { sortie += traduit; continue }
    const sansAccent = caractere.normalize('NFD').replace(MARQUES, '')
    for (const lettre of sansAccent) if (estGsm7(lettre)) sortie += lettre
  }
  return sortie
}

// Le nombre de septets réellement consommés : les caractères de l'extension en
// coûtent DEUX. Sert à savoir en combien de segments un message part.
export function septets(texte) {
  let n = 0
  for (const c of versGsm7(texte)) n += EXTENSION.includes(c) ? 2 : 1
  return n
}

// ⚠️ 160 SEPTETS POUR UN SMS SEUL, MAIS 153 DÈS QU'IL Y EN A PLUSIEURS : les
// sept septets manquants portent l'en-tête qui recolle les morceaux.
export function segments(texte) {
  const n = septets(texte)
  if (n === 0) return 0
  return n <= 160 ? 1 : Math.ceil(n / 153)
}
