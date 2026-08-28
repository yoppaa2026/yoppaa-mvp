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

// Taux applicable aux FRAIS DE LIVRAISON d'une commande.
//
// Les frais de livraison ne sont pas une prestation autonome : ce sont des
// frais accessoires à la vente. L'article 26 du Code de la TVA range dans la
// base d'imposition tout ce que le fournisseur obtient en contrepartie, y
// compris le transport, la commission et l'emballage, et ce même lorsque ces
// frais sont facturés séparément. L'accessoire suit donc le principal.
//
// Quand la commande mélange plusieurs taux, cas courant d'une friterie qui
// livre un plat à 6 % et une bière à 21 %, l'administration admet que les
// frais de transport subissent LE TAUX LE PLUS BAS de la commande. C'est cette
// tolérance qu'on applique : elle est plus simple qu'un prorata et plus
// favorable au client.
//
// Sans aucune ligne exploitable, cas théorique d'une commande vide, on retombe
// sur le taux par défaut du commerce plutôt que de planter.
//
// ⚠️ Hors périmètre : si un jour un transporteur tiers facture directement le
// client, ce n'est plus un accessoire mais une prestation de transport
// autonome à 21 %. Aujourd'hui c'est le commerçant qui facture la livraison.
export function tauxFraisLivraison(tauxDesLignes = [], tauxDefautCommerce = null) {
  const valides = tauxDesLignes.map(normaliser).filter(t => t !== null)
  if (valides.length === 0) return normaliser(tauxDefautCommerce)
  return Math.min(...valides)
}

// LA RÉCOMPENSE DE FIDÉLITÉ SORT DE LA BASE IMPOSABLE. LE BON CADEAU, NON.
//
// 🔴 Alex, 28/08 : un ticket annonçait « Plus rien à payer 0,00 € » et, deux
// lignes plus bas, « TVA 21 % · base 6,61 € · 1,39 € ». Le document se
// contredisait tout seul, et il porte la mention « justificatif de commande ».
//
// La distinction est celle de tout le projet, appliquée ici à la TVA :
//   - la RÉCOMPENSE est une remise commerciale accordée au moment de la vente.
//     Le prix convenu devient le prix remisé, et l'article 26 du Code de la TVA
//     range dans la base d'imposition ce que le fournisseur OBTIENT en
//     contrepartie. Il n'obtient pas la remise : elle sort de la base ;
//   - le BON CADEAU est un MOYEN DE PAIEMENT, encaissé le jour où quelqu'un
//     l'a acheté. Le prix convenu ne bouge pas d'un centime, donc la base non
//     plus. Le retrancher ferait disparaître de la TVA réellement due.
//
// ⚠️ LA REMISE S'IMPUTE SUR LE TAUX LE PLUS LOURD D'ABORD, et déborde sur les
// suivants si elle l'épuise. C'est la règle que l'export comptable applique
// déjà en rattachant son écart au taux dominant : les deux documents doivent
// dire la même chose de la même commande, sinon on recrée deux vérités.
//
// Ces règles sont informatives et ne valent pas avis fiscal.
export function imputerRemise(parTaux = {}, remise = 0) {
  const sortie = {}
  for (const [cle, ttc] of Object.entries(parTaux || {})) sortie[cle] = arrondi(ttc)
  let reste = arrondi(remise)
  if (!(reste > 0)) return sortie
  // Du plus gros montant au plus petit : la remise mord d'abord là où il y a
  // le plus à prendre, ce qui la fait tenir sur un seul taux dans la quasi-
  // totalité des cas et garde le ticket lisible.
  const ordre = Object.keys(sortie).sort((a, b) => sortie[b] - sortie[a])
  for (const cle of ordre) {
    if (reste <= 0) break
    const pris = Math.min(sortie[cle], reste)
    sortie[cle] = arrondi(sortie[cle] - pris)
    reste = arrondi(reste - pris)
  }
  return sortie
}

export function libelleRegime(regime) {
  return regime === REGIME_SUR_PLACE ? 'Sur place' : 'À emporter'
}
