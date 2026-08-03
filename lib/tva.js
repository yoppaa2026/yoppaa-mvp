// Cœur fiscal : régime de vente, choix du taux, ventilation d'un montant.
//
// RÈGLE STRUCTURANTE (Belgique) : ce n'est pas le produit qui détermine le
// taux, c'est la NATURE DE L'OPÉRATION. Vendre de la nourriture est une
// livraison de biens ; servir un client qui consomme sur place est une
// prestation de services. La même assiette n'a donc pas le même taux selon
// qu'elle est emportée ou mangée en salle, et une limonade passe de 6 % à
// 21 % en s'asseyant.
//
// AUCUN TAUX N'EST ÉCRIT DANS CE FICHIER. Les valeurs vivent dans la table
// `tva_taux_reference` et sur les articles. La matière est fédérale et
// mouvante : en 2026 une hausse de l'à-emporter de 6 à 12 % a été votée puis
// annulée. Un changement doit se régler par une ligne en base, jamais par un
// déploiement.
//
// Ces règles sont informatives et ne valent pas avis fiscal : le commerçant
// et son comptable restent responsables des taux qu'ils appliquent.

export const REGIME_EMPORTER = 'emporter'
export const REGIME_SUR_PLACE = 'sur_place'

// Marqueur des lignes dont le taux n'est pas renseigné. On ne devine JAMAIS
// un taux à la place du commerçant : une valeur inventée passerait inaperçue
// dans une déclaration, alors qu'une colonne « non renseigné » se voit.
export const TAUX_NON_RENSEIGNE = 'NR'

// Le régime se déduit de la façon dont la commande est servie. Tous les modes
// actuels sont de l'à-emporter ; la consommation sur place arrivera avec la
// réservation de table et la commande à table.
export function regimeDepuisModeRetrait(modeRetrait) {
  const m = String(modeRetrait || '').toLowerCase()
  if (m.includes('sur_place') || m.includes('table')) return REGIME_SUR_PLACE
  return REGIME_EMPORTER
}

// Taux applicable à un article pour un régime donné.
// Ordre de priorité : le taux « sur place » de l'article quand on est en
// salle, sinon son taux normal, sinon le taux par défaut du commerce.
// Renvoie null si rien n'est renseigné : à l'appelant de le signaler.
export function tauxPourArticle({ article, regime = REGIME_EMPORTER, tauxDefautCommerce = null } = {}) {
  if (!article) return normaliser(tauxDefautCommerce)
  if (regime === REGIME_SUR_PLACE) {
    const surPlace = normaliser(article.tva_taux_sur_place)
    if (surPlace !== null) return surPlace
  }
  const normal = normaliser(article.tva_taux)
  if (normal !== null) return normal
  return normaliser(tauxDefautCommerce)
}

// Accepte 0 comme un taux valide (exonération) : un simple `|| null` le
// transformerait en « non renseigné », ce qui est faux.
export function normaliser(taux) {
  if (taux === null || taux === undefined || taux === '') return null
  const n = Number(taux)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function arrondi(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// Un montant TTC et un taux donnent la base hors taxe et la TVA. On arrondit
// au centime À CHAQUE LIGNE, comme le fait une facture : arrondir seulement à
// la fin ferait diverger le total de la somme des lignes, et un comptable le
// verrait immédiatement.
export function ventiler(ttc, taux) {
  const montant = arrondi(ttc)
  const t = normaliser(taux)
  if (t === null || t <= 0) return { base: montant, tva: 0 }
  const base = arrondi(montant / (1 + t / 100))
  return { base, tva: arrondi(montant - base) }
}

// Clé de regroupement d'une ligne : un nombre, ou le marqueur « non renseigné ».
export function cleTaux(taux) {
  const t = normaliser(taux)
  return t === null ? TAUX_NON_RENSEIGNE : t
}

export function libelleTaux(cle) {
  return cle === TAUX_NON_RENSEIGNE ? 'Taux non renseigne' : `${cle}%`
}

export function libelleRegime(regime) {
  return regime === REGIME_SUR_PLACE ? 'Sur place' : 'À emporter'
}
