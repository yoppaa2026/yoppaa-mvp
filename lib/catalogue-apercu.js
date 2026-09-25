// CE QU'UN ARTICLE CONTIENT, LU SANS L'OUVRIR.
//
// 🔴 POURQUOI (Alex, 25/09, capture à l'appui). « Quand un article contient un
// groupe, une variante… cela doit se voir depuis sa vignette. Pour le moment
// il faut l'ouvrir pour le voir, ce n'est pas user friendly du tout. »
//
// ⚠️ ET CE N'EST PAS QU'UN CONFORT. Sur l'écran de personnalisation, la
// question qu'on se pose est « lesquels n'ont pas encore leurs options ? ».
// Sans réponse sur la vignette, il faut ouvrir les quarante articles un par
// un ; avec, elle se lit en descendant la page. C'est la différence entre un
// écran qu'on consulte et un écran qu'on fouille.
//
// ⚠️ MODULE PUR : il compose des phrases, il ne lit aucune base. Les comptes
// lui sont donnés par l'écran, qui les charge une seule fois pour tout le
// catalogue.

// Au-delà, les noms débordent de la vignette sur un téléphone. On garde les
// deux premiers et on compte le reste : « +2 » dit qu'il y en a d'autres sans
// forcer à tout lire.
const NOMS_MONTRES = 2

/**
 * Ce que les groupes d'options d'un article donnent à lire.
 *
 * 🔴 ON DIT LE NOM, PAS LE NOMBRE (Alex, 25/09) : « il faut que le nom du
 * groupe soit affiché, pas le nombre de groupes, il faut toujours cliquer pour
 * savoir lequel ». « 1 groupe · 13 options » obligeait à ouvrir l'article pour
 * apprendre s'il s'agissait des sauces ou de la cuisson — c'est-à-dire
 * exactement ce que la vignette devait éviter.
 *
 * ⚠️ ET ON GARDE LE TOTAL D'OPTIONS, parce qu'il dit autre chose : le nom dit
 * DE QUOI il s'agit, le compte dit COMBIEN de choix le client aura.
 *
 * @param groupes [{ nom, valeurs: [...] }] les groupes de CET article
 * @returns une phrase, ou `null` quand il n'y a rien à dire.
 */
export function apercuOptions(groupes = []) {
  const liste = Array.isArray(groupes) ? groupes : []
  if (liste.length === 0) return null

  const options = liste.reduce((t, g) => t + (Array.isArray(g?.valeurs) ? g.valeurs.length : 0), 0)
  // ⚠️ UN GROUPE SANS NOM NE LAISSE PAS UN BLANC : mieux vaut un mot générique
  // qu'une phrase qui commence par « · ».
  const noms = liste.map(g => String(g?.nom || '').trim() || 'Sans nom')
  const montres = noms.slice(0, NOMS_MONTRES).join(', ')
  const reste = noms.length - NOMS_MONTRES
  const partNoms = reste > 0 ? `${montres} +${reste}` : montres

  // ⚠️ UN GROUPE VIDE EXISTE : créé puis jamais rempli. Annoncer « 0 option »
  // serait exact mais illisible ; on dit ce qui manque.
  if (options === 0) return `${partNoms} · aucune option`
  const partOptions = options === 1 ? '1 option' : `${options} options`
  return `${partNoms} · ${partOptions}`
}

/**
 * Ce que la matrice de variantes d'un article donne à lire.
 *
 * 🔴 ON NE PROMET PAS UN NOMBRE DE COMBINAISONS. Il se déduirait des axes
 * (3 tailles × 2 couleurs = 6), mais le commerçant a pu en supprimer : afficher
 * un chiffre calculé qui ne correspond pas à ce qu'il verra en ouvrant serait
 * pire que de ne rien dire. On nomme les axes et on compte leurs valeurs, deux
 * choses qu'on lit vraiment sur l'article.
 */
export function apercuVariantes(article) {
  if (!article || article.gere_variantes !== true) return null
  const axes = []
  const ajouter = (nom, valeurs) => {
    const liste = Array.isArray(valeurs) ? valeurs : []
    if (liste.length === 0) return
    axes.push(`${String(nom || 'Axe').trim()} (${liste.length})`)
  }
  ajouter(article.axe1_nom || 'Taille', article.axe1_valeurs)
  ajouter(article.axe2_nom, article.axe2_valeurs)
  // ⚠️ LA CASE COCHÉE SANS AUCUNE VALEUR EST UN ÉTAT RÉEL, et c'est justement
  // celui qu'il faut voir : le commerçant a commencé et n'a pas fini.
  if (axes.length === 0) return 'Variantes à compléter'
  return axes.join(' · ')
}

/**
 * La ligne complète d'une vignette : ce qu'il y a, ou ce qui manque.
 *
 * ⚠️ « RIEN » EST UNE INFORMATION SUR CET ÉCRAN-LÀ, pas un vide à masquer.
 * C'est même celle qu'on vient chercher : quels articles n'ont pas encore été
 * réglés. On la rend donc explicitement, et l'écran la peint en gris.
 *
 * @returns { texte, vide } — `vide` dit à l'écran de la montrer en retrait.
 */
export function apercuContenu({ groupes = [], article = null, variantes = false } = {}) {
  if (variantes) {
    const v = apercuVariantes(article)
    return v ? { texte: v, vide: false } : { texte: 'Pas de variantes', vide: true }
  }
  const o = apercuOptions(groupes)
  return o ? { texte: o, vide: false } : { texte: 'Pas d’options', vide: true }
}
