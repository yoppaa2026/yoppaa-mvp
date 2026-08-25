// LES DEUX TEXTES DE LA FICHE, ET CE QU'ON EN ATTEND.
//
// ⚠️ DEMANDE D'ALEX, 26/08 : « la description doit être vendeuse, c'est pour ça
// qu'on y met l'aide IA », et « j'aimerais un contenu de qualité ».
//
// Ces règles vivent ici, pas dans l'écran : le même texte est réclamé au
// tableau de bord et à l'inscription, et deux copies auraient fini par exiger
// deux longueurs différentes.

// En dessous, ce n'est pas une présentation, c'est une étiquette. Une fiche
// vendeuse fait deux à quatre phrases, soit 150 à 350 caractères : 120 est un
// plancher, pas un objectif.
export const MIN_DESCRIPTION = 120

/**
 * ⚠️ LE BLOCAGE NE PORTE QUE SUR CE QUI VIENT D'ÊTRE ÉCRIT.
 *
 * Alex m'a laissé trancher entre bloquer et inciter, en demandant de la
 * qualité. Bloquer l'enregistrement de TOUTE fiche trop courte punirait le
 * commerçant venu corriger son numéro de téléphone, pour un champ qu'il n'a pas
 * touché et qui date d'avant la règle. Ne rien bloquer laisserait passer
 * n'importe quoi.
 *
 * On refuse donc la description qu'il vient de MODIFIER si elle reste trop
 * courte, et seulement celle-là. La qualité est garantie sur tout ce qui
 * s'écrit à partir de maintenant, sans effet rétroactif punitif, et sans
 * jamais transformer le formulaire en parcours du combattant.
 *
 * Un champ VIDÉ n'est pas bloqué : effacer sa description est un choix, même
 * s'il est mauvais. Ce qu'on refuse, c'est le texte bâclé, pas l'absence.
 *
 * @param {string} avant  la description telle qu'elle était au chargement
 * @param {string} apres  celle qui va être enregistrée
 */
export function descriptionRefusee(avant, apres) {
  const a = String(avant ?? '').trim()
  const b = String(apres ?? '').trim()
  if (b === a) return false        // pas touchée : jamais bloquée
  if (b.length === 0) return false // vidée volontairement
  return b.length < MIN_DESCRIPTION
}

/**
 * Ce qu'on affiche sous le champ pendant qu'il tape.
 * @returns {{longueur:number, atteint:boolean, texte:string, ton:'ok'|'encours'}}
 */
export function jaugeDescription(valeur) {
  const t = String(valeur ?? '').trim()
  const n = t.length
  if (n === 0) {
    return { longueur: 0, atteint: false, ton: 'encours', texte: `Vise ${MIN_DESCRIPTION} caractères minimum : c'est ce texte qui donne envie de pousser ta porte.` }
  }
  if (n >= MIN_DESCRIPTION) {
    return { longueur: n, atteint: true, ton: 'ok', texte: `${n} caractères. Ta présentation tient la route 🟣` }
  }
  const manque = MIN_DESCRIPTION - n
  // ⚠️ ON DIT CE QU'IL RESTE À FAIRE, pas ce qui manque à une règle. « Encore
  // 40 caractères » se comprend et s'exécute ; « minimum non atteint » ne dit
  // ni combien, ni pourquoi.
  return {
    longueur: n,
    atteint: false,
    ton: 'encours',
    texte: `Encore ${manque} caractère${manque > 1 ? 's' : ''} pour une présentation qui donne envie.`,
  }
}

// ─── Les mots qui inspirent l'IA ────────────────────────────────────────────
//
// ⚠️ CE N'EST PAS DE LA DÉCORATION. L'IA ne sait rien du commerce : sans
// matière, elle produit du vide poli. Trois mots en vrac tapés par le
// commerçant valent mieux qu'un paragraphe inventé, et c'est exactement ce
// qu'il faut lui dire, avec des exemples qu'il peut copier.

export function motsInspirationDescription(categorie) {
  if (categorie === 'vitrine') {
    return ['ton savoir-faire', 'tes techniques ou marques', 'l\'ambiance du salon', 'depuis quand tu exerces', 'ce qui fait revenir tes clients']
  }
  if (categorie === 'detail') {
    return ['ce que tu vends', 'tes marques ou créateurs', 'l\'esprit de la boutique', 'depuis quand tu es là', 'ce qu\'on ne trouve que chez toi']
  }
  return ['tes spécialités', 'tes producteurs ou ingrédients', 'ce que tu fais maison', 'depuis quand tu es là', 'ton coup de cœur du moment']
}

export const MOTS_INSPIRATION_INFOS = [
  'moyens de paiement (Bancontact, espèces)',
  'délai d\'annulation',
  'stationnement ou accès',
  'ce qu\'il faut apporter',
  'consignes avant la visite',
]

/** La phrase d'aide affichée sous un champ, à partir de ses mots d'exemple. */
export function astuceRedaction(mots) {
  const liste = (mots || []).filter(Boolean)
  if (liste.length === 0) return ''
  return `Astuce : note en vrac ${liste.join(', ')}, puis clique sur Rédiger avec l’IA. Elle part de TES mots et n’invente rien.`
}
