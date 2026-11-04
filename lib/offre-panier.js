// « ACHETEZ N, RECEVEZ X » : LE MOTEUR (28/10, lot 3 du module promo).
//
// Les deux cas d'Alex (28/10) :
//   • « à l'achat de 2 pizzas, une boisson offerte (avec sélection d'articles
//     participants) » : mode `choisi`. Le client CHOISIT son cadeau parmi les
//     articles offerts (« Ta boisson est offerte, choisis-la »).
//   • « idem pour une boutique de fringues » : mode `moins_cher`. Le 3e article
//     est offert, et c'est le MOINS CHER des articles qui participent, toutes
//     tailles confondues.
// ✅ Décisions d'Alex au tableau (28/10) : l'offre se déclenche TOUTE SEULE dans
// le panier ; elle se cumule avec la fidélité et les bons ; elle se voit aux 5
// endroits (fiche, articles participants, panier « encore 1 », panier
// « choisis ta boisson », liste / Good Morning / notification).
//
// ⚠️ PUR. (04/11) Branché par `construireLignesCommande` (lignes à 0 €) et
// par le panier ; la promo vient de MIGRATION_OFFRE_PANIER_04_11.
// ✅ Décisions d'Alex (04/11) : le cadeau est une LIGNE À 0 € (la TVA reste sur
// les articles payés) ; un cadeau en trop est PAYÉ ; le supplément d'un cadeau
// est payant ; les articles à tailles participent (le moins cher se juge sur le
// prix de chaque taille).
//
// LA PROMO (forme proposée, MIGRATION à écrire avec le branchement) :
//   { id, deal_type: 'panier', mode: 'choisi' | 'moins_cher',
//     seuil: N, nombre_offerts: X,
//     declencheurs: [{ article_id } | { categorie }],
//     offerts:      [{ article_id } | { categorie }] }   (mode choisi)
// LES LIGNES DU PANIER (déjà calculées au prix du jour) :
//   [{ article_id, categorie, prix_unitaire, quantite, offert_par? }]
//   `offert_par` = l'id de la promo qui offre CETTE ligne (le cadeau choisi).

// ✅ (04/11) LA PROMO TELLE QU'ELLE EST EN BASE (MIGRATION_OFFRE_PANIER_04_11) :
// `deal_type = 'panier'`, `offre_mode`, `offre_seuil`, `offre_nombre`,
// `offre_declencheurs`, `offre_offerts`. Le moteur lit les deux formes.
export const TYPE_PANIER = 'panier'
export const COLONNES_OFFRE_PANIER = 'offre_mode, offre_seuil, offre_nombre, offre_declencheurs, offre_offerts'

export function estOffrePanier(deal) {
  return deal?.deal_type === TYPE_PANIER
}

export function offreDuDeal(deal) {
  if (!deal) return null
  if (deal.mode || deal.seuil) return deal
  return {
    ...deal,
    mode: deal.offre_mode,
    seuil: deal.offre_seuil,
    nombre_offerts: deal.offre_nombre,
    declencheurs: Array.isArray(deal.offre_declencheurs) ? deal.offre_declencheurs : [],
    offerts: Array.isArray(deal.offre_offerts) ? deal.offre_offerts : [],
  }
}

// L'article (ou sa catégorie) est-il visé par ces cibles ?
export function vise(cibles, ligne) {
  return (cibles || []).some(c =>
    (c?.article_id && c.article_id === ligne?.article_id)
    || (c?.categorie && c.categorie === ligne?.categorie))
}

function entierPositif(v) {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 0
}

// ⚠️ (04/11) UN LOT OU UN DUO NE PARTICIPE PAS : c'est déjà une offre, avec
// son prix à lui (choix d'Alex : pas de cumul de deux offres sur la même
// marchandise).
const participe = (l) => !l?.deal_id

// Ce que la promo donne pour ce panier :
//   • `compte`  : unités qui participent (les cadeaux ne comptent pas) ;
//   • `droits`  : unités offertes auxquelles le panier a droit ;
//   • `manque`  : combien il en faut encore pour le prochain cadeau
//                 (« Encore 1 pizza et ta boisson est offerte ») ;
//   • mode choisi     : `cadeaux` = [{ index, unites }] gardés, et `refus` si
//                       le panier en réclame plus que ses droits ou un
//                       article qui n'est pas offert ;
//   • mode moins_cher : `remises` = [{ index, unites, montant }] sur les
//                       lignes les moins chères.
export function calculerOffrePanier(dealBrut, lignes = [], { exclues = null } = {}) {
  const deal = offreDuDeal(dealBrut)
  const seuil = entierPositif(deal?.seuil)
  const parPalier = entierPositif(deal?.nombre_offerts)
  const vide = { compte: 0, droits: 0, manque: seuil || 0, cadeaux: [], remises: [], refus: null, aChoisir: 0, utilisees: [] }
  if (!deal || !seuil || !parPalier) return vide

  // `exclues` : les lignes déjà prises par une autre offre (une ligne sert UNE offre).
  const liste = (lignes || []).map((l, index) => ({ ...l, index })).filter(l => !exclues || !exclues.has(l.index))
  const participantes = liste.filter(l => participe(l) && l.offert_par !== deal.id && vise(deal.declencheurs, l))
  const compte = participantes.reduce((s, l) => s + (Number(l.quantite) || 0), 0)

  if (deal.mode === 'moins_cher') {
    // Un palier = `seuil` articles dont `nombre_offerts` gratuits PARMI eux
    // (« 3 achetés, le moins cher offert » : seuil 3, nombre_offerts 1).
    const paliers = Math.floor(compte / seuil)
    const droits = paliers * parPalier
    const manque = seuil - (compte % seuil)
    // Les unités les moins chères d'abord, une par une.
    const unites = participantes
      .flatMap(l => Array.from({ length: Number(l.quantite) || 0 }, () => ({ index: l.index, prix: Number(l.prix_unitaire) || 0 })))
      .sort((a, b) => a.prix - b.prix || a.index - b.index)
      .slice(0, droits)
    const parLigne = new Map()
    for (const u of unites) {
      const r = parLigne.get(u.index) || { index: u.index, unites: 0, montant: 0 }
      r.unites += 1
      r.montant = Math.round((r.montant + u.prix) * 100) / 100
      parLigne.set(u.index, r)
    }
    const remises = [...parLigne.values()].sort((a, b) => a.index - b.index)
    return { compte, droits, manque, cadeaux: [], remises, refus: null, aChoisir: 0, utilisees: participantes.map(l => l.index) }
  }

  // Mode `choisi` : N articles achetés donnent X cadeaux choisis dans `offerts`.
  const droits = Math.floor(compte / seuil) * parPalier
  const manque = seuil - (compte % seuil)
  let restant = droits
  const cadeaux = []
  let refus = null
  const prendre = (l) => {
    const q = Number(l.quantite) || 0
    const garde = Math.min(q, restant)
    if (garde > 0) cadeaux.push({ index: l.index, unites: garde })
    // ✅ (04/11, Alex) Un cadeau en trop n'est pas refusé : il est payé.
    if (q > garde && l.offert_par === deal.id) refus = 'trop_de_cadeaux'
    restant -= garde
  }
  // 1) Les cadeaux CHOISIS (le sélecteur du panier les marque `offert_par`).
  for (const l of liste.filter(l => l.offert_par === deal.id)) {
    if (!participe(l) || !vise(deal.offerts, l)) { refus = 'article_non_offert'; continue }
    prendre(l)
  }
  // 2) ✅ (04/11) Puis, s'il reste un droit, un article offert DÉJÀ dans le
  // panier (la boisson ajoutée depuis la carte) : il devient le cadeau, dans
  // l'ordre du panier. Jamais un article qui compte déjà comme déclencheur
  // (« 2 pizzas = 1 pizza » se choisit dans le sélecteur).
  for (const l of liste) {
    if (restant <= 0) break
    if (l.offert_par || !participe(l) || !vise(deal.offerts, l) || vise(deal.declencheurs, l)) continue
    prendre(l)
  }
  const indexCadeaux = cadeaux.map(c => c.index)
  return {
    compte, droits, manque, cadeaux, remises: [], refus,
    // Ce que le client a encore à choisir (« Choisis ta boisson offerte »).
    aChoisir: Math.max(0, restant),
    utilisees: [...new Set([...participantes.map(l => l.index), ...indexCadeaux])],
  }
}

/**
 * ✅ (04/11) TOUTES LES OFFRES DU PANIER, chacune sur des lignes à elle : une
 * ligne qui sert une offre (déclencheur ou cadeau) ne sert pas la suivante.
 * Ordre déterministe : par identifiant.
 * Rend `{ offres: [{ deal, calcul }], unitesOffertes: { [index]: [{ deal_id, unites }] } }`.
 */
export function appliquerOffresPanier(deals = [], lignes = []) {
  const offres = (deals || []).filter(estOffrePanier).map(offreDuDeal)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const exclues = new Set()
  const sortie = []
  const unitesOffertes = {}
  for (const deal of offres) {
    const calcul = calculerOffrePanier(deal, lignes, { exclues })
    const dons = deal.mode === 'moins_cher' ? calcul.remises : calcul.cadeaux
    for (const d of dons) (unitesOffertes[d.index] ||= []).push({ deal_id: deal.id, unites: d.unites })
    // Seules les lignes qui ont VRAIMENT servi sont retenues : un déclencheur
    // d'une offre pas encore atteinte reste libre pour une autre.
    if (calcul.droits > 0) for (const i of calcul.utilisees) exclues.add(i)
    sortie.push({ deal, calcul })
  }
  return { offres: sortie, unitesOffertes }
}

// La phrase du panier, AVANT que l'offre soit atteinte ou quand un cadeau de
// plus est à portée : « Encore 1 pizza et ta boisson est offerte ».
// `objet` se met au pluriel avec un « s » ; `apres` est la fin de phrase,
// DÉJÀ ACCORDÉE par l'appelant (« ta boisson est offerte ») : le genre du
// cadeau ne se devine pas.
export function phraseEncore(dealBrut, calcul, { objet = 'article', apres = null } = {}) {
  const deal = offreDuDeal(dealBrut)
  if (!deal || !calcul || !(calcul.manque > 0)) return null
  // Rien à dire tant que le client n'a encore rien pris qui participe.
  if (calcul.compte === 0) return null
  const n = calcul.manque
  const quoi = n > 1 ? `${objet}s` : objet
  const suite = apres || (deal.mode === 'moins_cher' ? 'le moins cher est offert' : 'ton cadeau est offert')
  return `Encore ${n} ${quoi} et ${suite}`
}

// Le mot qui annonce l'offre, pour la section « Promos » et la pastille.
export function accrocheOffrePanier(dealBrut) {
  const deal = offreDuDeal(dealBrut)
  const n = entierPositif(deal?.seuil)
  const x = entierPositif(deal?.nombre_offerts)
  if (!n || !x) return ''
  if (deal.mode === 'moins_cher') return x === 1 ? `${n} achetés, le moins cher offert` : `${n} achetés, ${x} offerts`
  return `${n} achetés, ${x} offert${x > 1 ? 's' : ''}`
}
