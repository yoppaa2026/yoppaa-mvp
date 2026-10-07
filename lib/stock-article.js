// LE STOCK D'UN ARTICLE, EN TROIS CHOIX, ET CE QU'UN ARTICLE EN VITRINE DIT
// (30/09, décisions d'Alex).
//
//   illimite  préparé à la commande (pizzeria, traiteur) : aucune quantité ;
//   jour      une quantité par jour, le compteur repart chaque matin
//             (boulangerie) ;
//   magasin   un vrai stock (boutique).
//
// 🔴 POURQUOI UNE RÈGLE ICI, ET UNE SEULE. La fiche calculait le stock DEUX
// FOIS (la carte de l'article et la limite du panier), le tableau de bord une
// troisième, et le même chiffre 0 y voulait dire « sans limite » pour un
// article et « épuisé » pour une variante : l'écran de la boutique affichait
// « Épuisé » sur un article que la fiche vendait sans limite. Le mode vit
// maintenant dans sa colonne (`articles.stock_mode`, MIGRATION_STOCK_MODE), et
// tout le monde le lit par ces fonctions.
//
// ⚠️ LE SERVEUR NE LIT PAS ENCORE LE MODE (revue Google Play en cours : la
// route de paiement ne bouge pas). Ce que le tableau de bord ÉCRIT reste donc
// compris par le serveur d'aujourd'hui :
//   • « sans limite » écrit une quantité 0 et retire les quantités par jour,
//     que le serveur lit déjà comme « sans limite » ;
//   • « par jour » et « en magasin » écrivent leur quantité, comme avant.
// Seul écart connu jusqu'à la bascule du serveur : un stock EN MAGASIN à 0 est
// « épuisé » pour la fiche, mais une requête écrite à la main passerait encore
// au serveur. Et le stock en magasin se compte encore sur la JOURNÉE au serveur.

import { sertAManger } from './types-commerce.js'

export const MODES_STOCK = ['illimite', 'jour', 'magasin']

export const LIBELLES_MODE_STOCK = {
  illimite: { titre: 'Sans limite', aide: 'Préparé à la commande : aucune quantité à suivre.' },
  // ⚠️ 07/10 : l'aide dit aussi le comptoir, sinon les deux chiffres se
  // confondent (Alex : « Quantité par jour = comptoir ou pas ? »).
  jour: { titre: 'Quantité par jour', aide: 'Ce que tu vends en ligne chaque jour ; le compteur repart chaque matin. Le jour même, tu peux la remplacer par ce qu’il reste au comptoir, sur la carte de l’article.' },
  magasin: { titre: 'Stock en magasin', aide: 'Chaque vente le fait baisser, une annulation le fait remonter.' },
}

// ─── LES TROIS CHOIX, DITS AVEC LES MOTS DU COMMERCE (Alex, 07/10) ──────────
//
// « Une explication sous chaque choix, avec des exemples qui touchent les
// différents métiers ; trop compliqué de scinder par métier dans une
// catégorie. Simple et visible. » Deux jeux seulement : l'alimentaire, et le
// reste (boutiques et services). Les VALEURS en base ne changent pas.
//
// ⚠️ « STOCK EN MAGASIN » HABILLAIT LE CROISSANT COMME UN VÊTEMENT : en
// alimentaire, ce mode ne sert qu'aux produits emballés, et il le dit.
const CHOIX_STOCK_ALIMENTAIRE = {
  illimite: {
    titre: 'Préparé à la commande',
    phrase: 'Aucune quantité à suivre : tu le prépares quand on le commande.',
    exemples: 'pizza, sandwich, plateau du traiteur, gâteau d’anniversaire, colis de viande sur commande',
  },
  jour: {
    titre: 'Quantité par jour',
    phrase: 'Ce que tu peux vendre en ligne chaque jour. Le compteur repart chaque matin. Le jour même, tu peux le remplacer par ce qu’il reste au comptoir.',
    exemples: 'croissants, pains, plat du jour, poulets rôtis du dimanche, fromages à la coupe',
  },
  magasin: {
    titre: 'Produit emballé',
    phrase: 'Un stock qui baisse à chaque vente et ne se refait pas tout seul. Une annulation le fait remonter.',
    exemples: 'confitures, bouteilles de vin, sachets de café, canettes, bocaux',
  },
}
const CHOIX_STOCK_AUTRES = {
  illimite: {
    titre: 'Fabriqué à la demande',
    phrase: 'Aucune quantité à suivre : tu le fabriques ou le commandes quand on te l’achète.',
    exemples: 'bouquet sur mesure, gravure, pièce commandée chez ton fournisseur',
  },
  jour: {
    titre: 'Quantité par jour',
    phrase: 'Une quantité qui repart chaque matin.',
    exemples: 'bouquets du jour, pièces préparées chaque matin',
  },
  magasin: {
    titre: 'Stock en magasin',
    phrase: 'Chaque vente le fait baisser, une annulation le fait remonter.',
    exemples: 'vêtements, livres, accessoires, produits de soin',
  },
}

/** Les trois choix du stock pour ce commerce : [{ mode, titre, phrase, exemples }]. */
export function choixDeStock(commercant) {
  const alimentaire = !['detail', 'vitrine'].includes(commercant?.categorie)
  const jeu = alimentaire ? CHOIX_STOCK_ALIMENTAIRE : CHOIX_STOCK_AUTRES
  return MODES_STOCK.map(mode => ({ mode, ...jeu[mode] }))
}

// Le mode d'un article. ⚠️ Une valeur inconnue (ou une ligne lue sans la
// colonne) se lit « par jour » : c'est ce que tout article faisait avant le
// réglage, donc le comportement que le serveur applique encore.
export function modeStockDe(article) {
  return MODES_STOCK.includes(article?.stock_mode) ? article.stock_mode : 'jour'
}

// Le choix proposé pour un NOUVEL article, selon le métier (Alex, 30/09).
// Boutique et services : un vrai stock. Un commerce qui sert à manger prépare
// à la commande. Les autres commerces alimentaires (boulangerie, boucherie)
// comptent par jour.
export function modeStockParDefaut(commercant) {
  if (['detail', 'vitrine'].includes(commercant?.categorie)) return 'magasin'
  return sertAManger(commercant?.type) ? 'illimite' : 'jour'
}

// La quantité saisie est-elle valable pour ce mode ? Rend le message à
// afficher, ou `null`.
// ⚠️ « Par jour » exige au moins 1 : une quantité par jour de 0 voudrait dire
// « jamais », et le serveur d'aujourd'hui la lirait « sans limite ». Pour
// retirer un article un jour, il y a « indisponible ce jour ».
export function refusQuantite(mode, saisie) {
  if (mode === 'illimite') return null
  const brut = String(saisie ?? '').trim()
  if (!/^\d+$/.test(brut)) {
    return mode === 'jour'
      ? 'Indique combien tu en prépares par jour, ou choisis « Sans limite ».'
      : 'Indique combien tu en as en magasin (0 si épuisé).'
  }
  if (mode === 'jour' && Number(brut) < 1) {
    return 'Une quantité par jour commence à 1. Pour ne pas le vendre un jour, rends-le indisponible ce jour-là.'
  }
  return null
}

// Les colonnes que le tableau de bord écrit pour ce choix.
// ⚠️ `stock_maj_le` ne bouge que si le stock EN MAGASIN change (nouveau
// chiffre, ou passage à ce mode) : c'est la date à partir de laquelle les
// ventes se comptent. La reposer à chaque enregistrement d'une description
// effacerait les ventes déjà faites.
export function champsStock({ mode, saisie, avant = null, maintenant = new Date() }) {
  const m = MODES_STOCK.includes(mode) ? mode : 'jour'
  const quantite = m === 'illimite' ? 0 : Math.max(0, parseInt(String(saisie ?? ''), 10) || 0)
  const champs = { stock_mode: m, stock_jour: quantite }
  const changeEnMagasin = m === 'magasin'
    && (!avant || modeStockDe(avant) !== 'magasin' || Number(avant.stock_jour || 0) !== quantite)
  if (changeEnMagasin) champs.stock_maj_le = maintenant.toISOString()
  return champs
}

/**
 * Ce qui reste d'un article ce jour-là, pour la fiche.
 *
 * @param article       la ligne de l'article (`stock_mode`, `stock_jour`)
 * @param entreeJour    son réglage du jour (`article_stock_jour`), ou rien
 * @param dejaCommande  ce qui est déjà commandé pour ce jour
 *
 * Rend { actif, gere, brut, dispo } : `dispo` vaut `Infinity` quand rien ne
 * limite l'article.
 *
 * ⚠️ « INDISPONIBLE CE JOUR » VAUT POUR LES TROIS MODES : c'est le seul moyen
 * de retirer un plat certains jours (le lunch du jour), y compris sans limite.
 * ⚠️ « SANS LIMITE » IGNORE UNE QUANTITÉ PAR JOUR qui traînerait.
 * ⚠️ « EN MAGASIN » : à 0, c'est épuisé, et PAS « sans limite ».
 */
export function etatStock({ article, entreeJour = null, dejaCommande = 0, jour = null }) {
  const deja = Math.max(0, Number(dejaCommande) || 0)
  if (entreeJour && entreeJour.actif === false) return { actif: false, gere: true, brut: 0, dispo: 0 }
  // 🔴 LE COMPTOIR DU JOUR (Alex, 07/10) : saisi pour CE jour, il fait foi à la
  // place de la quantité par jour, quel que soit le mode. Un autre jour, il ne
  // dit rien : un chiffre de mardi ne plafonne jamais mercredi. MÊME RÈGLE que
  // `reserver_stock_atomique` et `verifierStockDisponible`.
  const comptoir = comptoirDuJour(article, jour)
  if (comptoir !== null) return { actif: true, gere: true, brut: comptoir, dispo: Math.max(0, comptoir - deja) }
  const mode = modeStockDe(article)
  if (mode === 'illimite') return { actif: true, gere: false, brut: 0, dispo: Infinity }
  if (mode === 'magasin') {
    const brut = Math.max(0, Number(article?.stock_jour) || 0)
    return { actif: true, gere: true, brut, dispo: Math.max(0, brut - deja) }
  }
  // Par jour : le réglage du jour, sinon la quantité de l'article.
  // ⚠️ Une quantité 0 sans réglage du jour reste « sans limite », comme au
  // serveur d'aujourd'hui (les articles d'avant le réglage).
  const brut = entreeJour ? Math.max(0, Number(entreeJour.stock) || 0) : Math.max(0, Number(article?.stock_jour) || 0)
  const gere = !!entreeJour || brut > 0
  return { actif: true, gere, brut, dispo: gere ? Math.max(0, brut - deja) : Infinity }
}

/**
 * La quantité au comptoir si elle a été saisie pour `jour` ('YYYY-MM-DD'),
 * sinon `null`. ⚠️ `null` et zéro diffèrent : 0 au comptoir, c'est épuisé.
 */
export function comptoirDuJour(article, jour) {
  if (!article || !jour || article.stock_comptoir_le !== jour) return null
  if (article.stock_comptoir === null || article.stock_comptoir === undefined || article.stock_comptoir === '') return null
  const n = Number(article.stock_comptoir)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

// Un stock EN MAGASIN ne revient pas demain : un article épuisé n'a pas de
// « prochain jour ». Les deux autres modes, si.
export function revientUnAutreJour(article) {
  return modeStockDe(article) !== 'magasin'
}

// ─── EN VITRINE : AFFICHÉ, PAS VENDU EN LIGNE ─────────────────────────────────
//
// ✅ « LE PRIX EST TOUJOURS UN PRIX FERME » (Alex, 30/09, services compris).
// L'ancien mode vitrine affichait « dès 290 € » ou « Prix sur demande » :
// c'était la fourchette retirée des prestations le 27/08, restée ici. Un
// article en vitrine a son prix, sa description, ses variantes : il ne se
// commande pas en ligne, c'est tout.
//
// Le mot suit le métier : une boutique, un restaurant, un salon.
export function mentionVitrine(commercant) {
  if (commercant?.categorie === 'detail') return 'Disponible en boutique'
  if (sertAManger(commercant?.type)) return 'Sur place uniquement'
  return 'Disponible sur place'
}

// ─── LE CHOIX DU COMMERÇANT, DIT SANS QU'IL AIT À CHERCHER (Alex, 30/09) ─────
//
// 🔴 UN INTERRUPTEUR « VENDU EN LIGNE » NE DISAIT QU'UNE MOITIÉ : éteint, le
// commerçant devait deviner ce que devenait l'article. Les deux possibilités
// sont donc deux choix visibles, chacune avec sa phrase, dans les mots du métier.
export function choixDeVente(commercant) {
  const surPlace = commercant?.categorie === 'detail'
    ? 'Le client le voit avec son prix, et vient l’acheter en boutique.'
    : sertAManger(commercant?.type)
      ? 'Le client le voit avec son prix, et le commande sur place.'
      : 'Le client le voit avec son prix, et vient l’acheter sur place.'
  return [
    { vendable: true, titre: 'Vendu en ligne', phrase: 'Le client le commande et le paie dans l’app.' },
    { vendable: false, titre: 'En vitrine seulement', phrase: surPlace },
  ]
}

// Même logique pour « l'article est-il sur la fiche ? » (Alex, 30/09 : « idem
// pour article disponible, même logique »). Masqué, il disparaît de la fiche
// et de la carte du QR de table, mais reste ici, prêt à revenir.
export const CHOIX_VISIBILITE = [
  { actif: true, titre: 'Sur ta fiche', phrase: 'Tes clients le voient.' },
  { actif: false, titre: 'Masqué', phrase: 'Tes clients ne le voient plus. Il reste ici, prêt à revenir.' },
]
