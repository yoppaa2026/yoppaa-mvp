// ─── LES EXEMPLES DE TAUX, DANS LE MÉTIER DE CELUI QUI LES LIT ───────────────
//
// ⚠️ « ILS PARLENT DE BOISSONS, BOISSONS ALCOOLISÉES, SUR PLACE, EMPORTÉ. Pas
// top quand on choisit un taux et qu'on est coiffeur, prof de yoga ou boutique
// de vêtements » (Alex, 17/08). Les exemples de `tva_taux_reference` ont été
// écrits pour une friterie, et ils sont restés tels quels pour tout le monde :
// un salon de coiffure lisait « 6 % · Denrées alimentaires et boissons non
// alcoolisées » et devait deviner que ça ne le concernait pas.
//
// ⚠️ AUCUN TAUX N'EST ÉCRIT ICI, et c'est la règle de `lib/tva.js` : les
// valeurs vivent en base, parce que la matière est fédérale et mouvante. Ce
// module ne fabrique que des PHRASES, indexées sur des taux qui existent déjà.
// Un taux nouveau ou inconnu retombe sur l'exemple générique de la base, jamais
// sur rien.
//
// ⚠️ ON NE CACHE AUCUN TAUX, JAMAIS. Une boutique de vêtements vend surtout à
// 21 %, mais elle peut vendre un livre à 6 %, et une prof de yoga peut être
// exonérée. Masquer un taux, ce serait décider de la fiscalité de quelqu'un à
// sa place. On se contente de dire, pour chaque taux, ce qu'il recouvre DANS
// SON MÉTIER, et de nommer celui qui est le plus courant chez lui.
//
// Ces phrases sont informatives et ne valent pas avis fiscal : c'est écrit sous
// le sélecteur, et la responsabilité du taux reste celle du commerçant.

export const CAT_SERVICE = 'vitrine'
export const CAT_DETAIL = 'detail'
export const CAT_ALIMENTAIRE = 'alimentaire'

// La catégorie telle que la porte le commerçant, ramenée à l'une des trois.
// Tout ce qui n'est ni vitrine ni détail est alimentaire, exactement comme le
// fait le tableau de bord depuis le premier jour.
export function familleCommerce(categorie) {
  const c = String(categorie || '')
  if (c === CAT_SERVICE) return CAT_SERVICE
  if (c === CAT_DETAIL) return CAT_DETAIL
  return CAT_ALIMENTAIRE
}

// Les exemples, par famille puis par taux. Volontairement courts : ils
// s'affichent dans une liste déroulante, à la suite du libellé.
const EXEMPLES = {
  [CAT_SERVICE]: {
    0: 'Activités exonérées (soins, enseignement) ou franchise de TVA.',
    6: 'Cas particuliers : petites réparations, certains travaux immobiliers.',
    12: 'Rare pour un service : restauration servie, certains travaux immobiliers.',
    21: 'Le taux courant des prestations de services.',
  },
  [CAT_DETAIL]: {
    0: 'Ventes exonérées ou franchise de TVA.',
    6: 'Livres, journaux, plantes, médicaments et quelques produits de base.',
    12: 'Rare en boutique : margarine, charbon, certains travaux immobiliers.',
    21: 'Le taux courant : vêtements, décoration, cosmétiques, la plupart des produits.',
  },
  [CAT_ALIMENTAIRE]: {
    0: 'Ventes exonérées ou franchise de TVA.',
    6: 'Denrées alimentaires et boissons non alcoolisées, à emporter ou livrées.',
    12: 'Nourriture servie et consommée sur place (restauration).',
    21: 'Boissons alcoolisées, boissons servies sur place, produits non alimentaires.',
  },
}

// Le taux le plus courant du métier. Sert à le SIGNALER, jamais à le
// présélectionner : un taux choisi par défaut serait un taux qu'on n'a pas
// choisi, et il se retrouverait dans une déclaration.
const COURANT = { [CAT_SERVICE]: 21, [CAT_DETAIL]: 21, [CAT_ALIMENTAIRE]: 6 }

export function tauxLePlusCourant(categorie) {
  return COURANT[familleCommerce(categorie)] ?? null
}

// ⚠️ REPLI SUR L'EXEMPLE DE LA BASE, ET PAS SUR RIEN. Le jour où un taux
// apparaît dans `tva_taux_reference` sans passer par ce fichier, le commerçant
// doit continuer à lire quelque chose : ne rien afficher est la pire des
// sorties, il choisirait un taux à l'aveugle.
export function aideTaux(taux, categorie, aideParDefaut = null) {
  const n = Number(taux)
  if (!Number.isFinite(n)) return aideParDefaut || null
  const table = EXEMPLES[familleCommerce(categorie)] || {}
  return table[n] || aideParDefaut || null
}

// Ce que le sélecteur affiche vraiment, prêt à rendre. L'ordre de la base est
// conservé : c'est un référentiel légal, on ne le réordonne pas selon le métier.
export function optionsTaux(refs = [], categorie = null) {
  const courant = tauxLePlusCourant(categorie)
  return (refs || []).filter(Boolean).map(r => {
    const aide = aideTaux(r.taux, categorie, r.aide)
    const estCourant = Number(r.taux) === courant
    return {
      taux: r.taux,
      libelle: r.libelle,
      aide,
      courant: estCourant,
      // Une seule chaîne, parce qu'une <option> ne sait afficher que du texte.
      texte: [
        r.libelle,
        estCourant ? 'le plus courant chez toi' : null,
        aide,
      ].filter(Boolean).join(' · '),
    }
  })
}
