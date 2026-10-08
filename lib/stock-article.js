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
// ✅ 08/10 (temps 3) : LES MOTS DU MODÈLE VALIDÉ PAR ALEX. Ces trois cartes
// disent maintenant comment se compte ce qui se vend LE JOUR MÊME (circuit A) :
// « Se renouvelle chaque jour » (et plus « se refait », Alex), « Stock qui
// baisse », « Sans limite ». Ce qui se prend sur commande a sa propre section.
const CHOIX_STOCK_ALIMENTAIRE = {
  illimite: {
    titre: 'Sans limite',
    phrase: 'Aucune quantité à suivre : tu le prépares quand on le commande.',
    exemples: 'pizza, sandwich, croque-monsieur, plat préparé à la minute',
  },
  jour: {
    titre: 'Se renouvelle chaque jour',
    phrase: 'La quantité que tu vends en ligne chaque jour. Le compteur repart chaque matin. Le jour même, tu peux la remplacer par ce qu’il reste au comptoir (onglet « Comptoir du jour »).',
    exemples: 'croissants, pains, plat du jour, poulets rôtis, fromages à la coupe',
  },
  magasin: {
    titre: 'Stock qui baisse',
    phrase: 'Pour les produits emballés : le stock baisse à chaque vente et ne se renouvelle pas tout seul. Une annulation le fait remonter.',
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
 *
 * @param circuit       'A' (aujourd'hui), 'B' (un autre jour) ou `null`
 *                      (boutique, service) : voir `circuitDuJour`
 * @param invendu       la ligne est une offre de fin de journée
 */
export function etatStock({ article, entreeJour = null, dejaCommande = 0, jour = null, circuit = null, invendu = false }) {
  const deja = Math.max(0, Number(dejaCommande) || 0)
  if (entreeJour && entreeJour.actif === false) return { actif: false, gere: true, brut: 0, dispo: 0 }
  // 🔴 LE STOCK QUI BAISSE, PARTAGÉ ENTRE TOUS LES JOURS (08/10), AVANT LES
  // CIRCUITS ET LE COMPTOIR : `dejaCommande` doit être ce qui est vendu depuis
  // la saisie, tous jours confondus (`ventes_stock_magasin`, voir
  // `dejaCommandePourStock`). MÊME RÈGLE que `reserver_stock_atomique`.
  if (modeStockDe(article) === 'magasin') {
    const brut = Math.max(0, Number(article?.stock_jour) || 0)
    return { actif: true, gere: true, brut, dispo: Math.max(0, brut - deja) }
  }
  // 🔴 B, SUR COMMANDE POUR UN AUTRE JOUR (temps 3) : seul son maximum par
  // jour compte. Ni la quantité du jour, ni le comptoir, ni le stock qui
  // baisse : ils appartiennent à A. `dejaCommande` y compte TOUTES les
  // commandes de ce jour (`stock_commande_par_article` le sait).
  if (circuit === 'B') {
    if (article?.commande_active !== true) return { actif: false, gere: true, brut: 0, dispo: 0, raison: 'pas_sur_commande' }
    const max = maximumSurCommande(article)
    if (max === null) return { actif: true, gere: false, brut: 0, dispo: Infinity }
    return { actif: true, gere: true, brut: max, dispo: Math.max(0, max - deja) }
  }
  // A, VENDU AUJOURD'HUI : refusé si l'article ne se vend que sur commande.
  // ⚠️ SAUF L'INVENDU : déjà fait, plafonné par son offre (comme au SQL).
  if (circuit === 'A' && article?.vente_jour === false) {
    if (invendu) return { actif: true, gere: false, brut: 0, dispo: Infinity }
    return { actif: false, gere: true, brut: 0, dispo: 0, raison: 'pas_aujourdhui' }
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// LES DEUX CIRCUITS DE L'ALIMENTAIRE (temps 3, modèle validé par Alex le 08/10)
// ═══════════════════════════════════════════════════════════════════════════
//
//   A « VENDU AUJOURD'HUI » (`vente_jour`) : ce qui se retire LE JOUR MÊME.
//     Il se compte comme avant (quantité par jour, comptoir, stock qui baisse,
//     sans limite).
//   B « SUR COMMANDE » (`commande_active`) : ce qui se retire UN AUTRE JOUR.
//     Délai en jours, maximum par jour (`commande_max_jour`, vide = sans
//     limite).
//
// 🔴 UN CROISSANT POUR SAMEDI PREND DANS LES 40 DE B, JAMAIS DANS LES 5 DE A.
// Le jour J, une commande passée un jour d'avant compte dans B, une commande
// passée le jour même compte dans A.
//
// ⚠️ MÊME RÈGLE QUE `reserver_stock_atomique` ET `stock_commande_par_article`
// (MIGRATION_TEMPS3_DEUX_CIRCUITS) : le circuit se lit au JOUR DE RETRAIT,
// aujourd'hui = A, plus tard = B. Une boutique et un service n'ont pas de
// circuit (`null`) : leur stock reste partagé entre les jours.
//
// ⚠️ L'INVENDU DE FIN DE JOURNÉE IGNORE LE CIRCUIT : la tarte à J+2 restée sur
// le comptoir à 17 h est faite, et son offre la plafonne (règle du 04/09).

/**
 * Ce qui est déjà pris sur le stock de cet article, pour `etatStock`.
 * Stock qui baisse : vendu depuis la saisie, TOUS jours (`ventesMagasin`).
 * Les autres : ce qui est commandé pour le jour affiché (`duJour`).
 */
export function dejaCommandePourStock({ article, duJour = {}, ventesMagasin = {} }) {
  const id = article?.id
  return modeStockDe(article) === 'magasin' ? (ventesMagasin?.[id] || 0) : (duJour?.[id] || 0)
}

/** Le commerce vend-il en deux circuits ? L'alimentaire seulement. */
export function aDeuxCircuits(commercant) {
  return !['detail', 'vitrine'].includes(commercant?.categorie)
}

/**
 * Les circuits ouverts pour cet article : `{ aujourdhui, surCommande }`, ou
 * `null` hors alimentaire.
 *
 * ⚠️ `vente_jour` ABSENT VAUT VRAI (le défaut en base) ; `commande_active`
 * ABSENT VAUT FAUX, comme `IS NOT TRUE` au SQL. Une ligne lue sans ses
 * colonnes refuse donc les autres jours : un défaut qui se voit, plutôt
 * qu'une commande que la réservation refuserait au paiement.
 */
export function circuitsDeLArticle(article, commercant) {
  if (!aDeuxCircuits(commercant)) return null
  // 🔴 LE STOCK QUI BAISSE N'A PAS DE CIRCUIT (Alex, 08/10) : le pot de
  // confiture est sur l'étagère, il part avec une commande de n'importe quel
  // jour, tant qu'il en reste (`stockPartage`).
  if (modeStockDe(article) === 'magasin') return null
  return {
    aujourdhui: article?.vente_jour !== false,
    surCommande: article?.commande_active === true,
  }
}

/** Un duo n'a que les circuits que ses DEUX articles ont en commun. */
export function circuitsCommuns(a, b) {
  if (!a || !b) return a || b || null
  return { aujourdhui: a.aujourdhui && b.aujourdhui, surCommande: a.surCommande && b.surCommande }
}

/** 'A' pour aujourd'hui, 'B' pour un autre jour, `null` hors alimentaire. */
export function circuitDuJour({ commercant, jour, aujourdhui }) {
  if (!aDeuxCircuits(commercant)) return null
  if (!jour || !aujourdhui) return 'A'
  return jour > aujourdhui ? 'B' : 'A'
}

/**
 * Le maximum par jour de B : un entier ≥ 1, ou `null` (sans limite).
 * ⚠️ Zéro n'existe pas en base (`articles_commande_max_jour_borne`) : lu ici,
 * il vaudrait « sans limite » par erreur. On le lit comme « rien » (0).
 */
export function maximumSurCommande(article) {
  const v = article?.commande_max_jour
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null
}

// ─── LES DEUX SECTIONS DE LA FICHE ARTICLE (tableau de bord) ────────────────
//
// ✅ DEUX CHOIX EN CARTES, CHACUN AVEC SA PHRASE (règle du 30/09 : un
// interrupteur éteint oblige à deviner ce que devient l'article).
export const CHOIX_JOUR_MEME = [
  { vente_jour: true, titre: 'Oui, le jour même', phrase: 'Ton client le commande pour aujourd’hui : ta fournée du jour, ton comptoir, ton frigo.' },
  { vente_jour: false, titre: 'Non', phrase: 'Il ne se commande qu’à l’avance, pour un autre jour.' },
]
export const CHOIX_SUR_COMMANDE = [
  { commande_active: true, titre: 'Oui, sur commande', phrase: 'Ton client le réserve pour demain ou plus tard. Tu le prépares exprès, à part.' },
  { commande_active: false, titre: 'Non', phrase: 'Il se vend le jour même seulement.' },
]

/**
 * Pourquoi ce réglage des deux circuits ne s'enregistre pas. `null` s'il est bon.
 * @param form { vente_jour, commande_active, delai_minutes, commande_max_jour, stock_mode }
 */
export function refusCircuits(form) {
  const a = form?.vente_jour !== false
  const b = form?.commande_active === true
  if (!a && !b) return 'Choisis au moins une façon de le vendre : le jour même, ou sur commande.'
  if (!b) return null
  // ⚠️ UN STOCK QUI BAISSE NE SE RÉSERVE PAS DANS UNE FOURNÉE : B compte son
  // propre maximum, il vendrait des bocaux qui n'existent pas. Et il n'en a
  // pas besoin : son stock sert déjà tous les jours (08/10).
  if (a && form?.stock_mode === 'magasin') return 'Un produit au stock qui baisse se commande déjà pour n’importe quel jour, sur son stock : il n’a pas besoin de « sur commande ».'
  if (!(Number(form?.delai_minutes) >= 1440)) return 'Sur commande, le délai commence à 1 jour : commandé aujourd’hui, retiré demain.'
  const max = String(form?.commande_max_jour ?? '').trim()
  if (max !== '' && !(/^\d+$/.test(max) && Number(max) >= 1)) return 'Le maximum par jour commence à 1. Laisse vide pour « sans limite ».'
  return null
}

/**
 * Les colonnes que le tableau de bord écrit pour les deux circuits.
 * ⚠️ HORS DE B, NI DÉLAI, NI MAXIMUM, NI « RÉSERVABLE JUSQU'À » : ils ne
 * servent qu'aux autres jours, et un délai resté là continuerait d'allonger
 * le calendrier pour rien.
 */
export function champsCircuits(form) {
  const b = form?.commande_active === true
  const max = String(form?.commande_max_jour ?? '').trim()
  const horizon = form?.horizon_jours
  return {
    vente_jour: form?.vente_jour !== false,
    commande_active: b,
    delai_minutes: b ? Math.max(1440, parseInt(form?.delai_minutes, 10) || 0) : 0,
    commande_max_jour: b && max !== '' ? Math.max(1, parseInt(max, 10) || 1) : null,
    horizon_jours: b && horizon !== '' && horizon != null ? (parseInt(horizon, 10) || null) : null,
  }
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
