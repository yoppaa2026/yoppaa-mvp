// AGIR SUR PLUSIEURS ARTICLES D'UN COUP.
//
// 🔴 POURQUOI (Alex, 25/09). Tout se fait article par article : rendre
// indisponible, changer de catégorie, ajuster un prix. Un soir de rupture,
// c'est un clic par pizza ; une carte qui change de saison, c'est une heure.
//
// ⚠️ LES TROIS ACTIONS NE SE VALENT PAS, ET LE MODULE LE DIT.
//   • DISPONIBILITÉ : se défait d'un clic, aucun regret possible.
//   • CATÉGORIE : se refait, mais il faut se souvenir d'où venait chaque
//     article, et ça, personne ne s'en souvient.
//   • PRIX : 🔴 NE SE DÉFAIT PAS. L'ancien prix n'est écrit nulle part, aucune
//     colonne ne le garde. Un « -10 % » appliqué deux fois par erreur ne se
//     rattrape qu'à la main, article par article, de mémoire. C'est pour ça
//     que cette action-là exige une confirmation qui montre le résultat.
//
// ⚠️ MODULE PUR. Il calcule des patchs, il n'écrit rien : c'est ce qui permet
// de mesurer chaque règle sans toucher à une base.

export const ACTIONS_LOT = ['disponible', 'indisponible', 'categorie', 'prix']

/**
 * Les articles visés, retrouvés depuis leurs identifiants.
 *
 * ⚠️ LES IDENTIFIANTS ARRIVENT EN TEXTE depuis les cases à cocher, et en
 * nombre depuis la base. Comparer sans convertir laisse une sélection vide
 * alors que l'écran montre douze articles cochés.
 */
export function articlesDuLot(articles = [], ids = []) {
  const vises = new Set((Array.isArray(ids) ? ids : []).map(String))
  return (Array.isArray(articles) ? articles : []).filter(a => a && vises.has(String(a.id)))
}

/**
 * Le prix d'un article après un ajustement en pourcentage.
 *
 * ⚠️ ON ARRONDIT AU CENTIME, ET ON LE FAIT ICI. Laisser courir les décimales
 * donnerait des 9,405 € en base, que chaque écran arrondirait à sa façon : le
 * panier, la facture et le ticket finiraient par ne plus dire la même chose.
 *
 * 🔴 ET ON CALCULE EN CENTIMES, PAS EN EUROS. Défaut trouvé par le banc le
 * 25/09 : `9.5 * 0.99` vaut 9,404999999999999 en binaire, pas 9,405. L'arrondi
 * rendait donc 9,40 € là où le commerçant attend 9,41 €. Un centime par
 * article, sur un catalogue entier, sur chaque changement de saison. Partir de
 * l'entier de centimes enlève la dérive avant qu'elle commence.
 *
 * @returns le nouveau prix, ou `null` si l'article n'a pas de prix utilisable.
 */
export function prixAjuste(prix, pourcent) {
  const base = Number(prix)
  const p = Number(pourcent)
  if (!Number.isFinite(base) || base <= 0) return null
  if (!Number.isFinite(p) || p === 0) return null
  const centimes = Math.round(base * 100)
  return Math.round(centimes * (1 + p / 100)) / 100
}

/**
 * Ce qui empêche un ajustement de prix de partir.
 *
 * 🔴 UN PRIX À ZÉRO EST UN ARTICLE OFFERT, pas une promotion. `-100 %` ou
 * au-delà mettrait des articles à 0 € ou en négatif sur la fiche publique, et
 * personne ne le verrait avant la première commande. On refuse, on ne borne
 * pas en silence : borner donnerait un résultat que le commerçant n'a pas
 * demandé et qu'il croirait juste.
 *
 * @returns un message, ou `null` si l'ajustement peut partir.
 */
export function refusDAjustement(articles = [], pourcent) {
  const p = Number(pourcent)
  if (!Number.isFinite(p) || p === 0) return 'Indique un pourcentage, en plus ou en moins.'
  if (p <= -100) return 'Un article ne peut pas tomber à 0 €. Choisis une baisse plus petite.'
  const liste = Array.isArray(articles) ? articles : []
  if (liste.length === 0) return 'Choisis au moins un article.'
  const sansPrix = liste.filter(a => !(Number(a?.prix) > 0))
  // ⚠️ UN ARTICLE SANS PRIX N'EST PAS UNE ERREUR : en vitrine, le prix est
  // parfois vide exprès. On ne bloque pas pour lui, on préviendra.
  if (sansPrix.length === liste.length) return 'Aucun de ces articles n’a de prix à ajuster.'
  const tropBas = liste.some(a => {
    const nouveau = prixAjuste(a?.prix, p)
    return nouveau !== null && nouveau < 0.01
  })
  if (tropBas) return 'Cette baisse ferait tomber un article sous 1 centime. Choisis-en une plus petite.'
  return null
}

/**
 * Les écritures à faire, une par article.
 *
 * ⚠️ UN PATCH VIDE NE PART PAS. Remettre `actif: true` sur un article déjà
 * disponible ferait une écriture pour rien, réveillerait le temps réel de la
 * fiche publique et compterait dans le total annoncé au commerçant : il lirait
 * « 12 articles modifiés » alors que trois seulement ont bougé.
 *
 * @returns [{ id, patch }]
 */
export function patchsDuLot({ action, articles = [], valeur = null } = {}) {
  const liste = Array.isArray(articles) ? articles : []
  const sortie = []
  for (const a of liste) {
    if (!a || a.id == null) continue
    if (action === 'disponible' || action === 'indisponible') {
      const cible = action === 'disponible'
      if (a.actif === cible) continue
      sortie.push({ id: a.id, patch: { actif: cible } })
      continue
    }
    if (action === 'categorie') {
      // ⚠️ « Sans catégorie » EXISTE, et c'est `null` en base. Une chaîne vide
      // fabriquerait une catégorie fantôme portant un nom invisible.
      const cible = typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null
      if ((a.categorie || null) === cible) continue
      sortie.push({ id: a.id, patch: { categorie: cible } })
      continue
    }
    if (action === 'prix') {
      const nouveau = prixAjuste(a.prix, valeur)
      if (nouveau === null || nouveau === Number(a.prix)) continue
      sortie.push({ id: a.id, patch: { prix: nouveau } })
    }
  }
  return sortie
}

/**
 * Ce que le commerçant lit avant de valider.
 *
 * ⚠️ IL DOIT LIRE CE QUI VA CHANGER, PAS CE QU'IL A COCHÉ. Douze articles
 * cochés dont trois seulement vont bouger, c'est « 3 » qu'il faut annoncer,
 * sinon il croira que neuf écritures ont échoué.
 */
export function resumeDuLot({ action, patchs = [], coches = 0, valeur = null } = {}) {
  const n = Array.isArray(patchs) ? patchs.length : 0
  if (coches === 0) return 'Coche des articles pour agir sur plusieurs d’un coup.'
  if (n === 0) {
    if (action === 'disponible') return 'Ces articles sont déjà disponibles.'
    if (action === 'indisponible') return 'Ces articles sont déjà indisponibles.'
    if (action === 'categorie') return 'Ces articles sont déjà dans cette catégorie.'
    return 'Aucun prix à changer ici.'
  }
  const quoi = n === 1 ? '1 article' : `${n} articles`
  if (action === 'disponible') return `${quoi} deviendront disponibles.`
  if (action === 'indisponible') return `${quoi} deviendront indisponibles, et disparaîtront de ta fiche.`
  if (action === 'categorie') {
    const cat = typeof valeur === 'string' && valeur.trim() ? `« ${valeur.trim()} »` : 'Sans catégorie'
    return `${quoi} passeront dans ${cat}.`
  }
  const p = Number(valeur)
  const sens = p > 0 ? 'augmenteront' : 'baisseront'
  // 🔴 ON RAPPELLE QUE ÇA NE SE DÉFAIT PAS, à l'endroit et au moment où ça
  // compte. L'ancien prix n'est gardé nulle part.
  return `Le prix de ${quoi} ${sens} de ${Math.abs(p)} %. Les anciens prix ne sont pas conservés.`
}
