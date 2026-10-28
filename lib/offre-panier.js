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
// ⚠️ PUR ET INERTE : ni base, ni écran ne l'appellent encore. Le branchement
// (création par le commerçant, panier, serveur, lignes à 0 €) attend la
// migration et les choix d'Alex au tableau.
//
// LA PROMO (forme proposée, MIGRATION à écrire avec le branchement) :
//   { id, deal_type: 'panier', mode: 'choisi' | 'moins_cher',
//     seuil: N, nombre_offerts: X,
//     declencheurs: [{ article_id } | { categorie }],
//     offerts:      [{ article_id } | { categorie }] }   (mode choisi)
// LES LIGNES DU PANIER (déjà calculées au prix du jour) :
//   [{ article_id, categorie, prix_unitaire, quantite, offert_par? }]
//   `offert_par` = l'id de la promo qui offre CETTE ligne (le cadeau choisi).

function vise(cibles, ligne) {
  return (cibles || []).some(c =>
    (c.article_id && c.article_id === ligne.article_id)
    || (c.categorie && c.categorie === ligne.categorie))
}

function entierPositif(v) {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 0
}

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
export function calculerOffrePanier(deal, lignes = []) {
  const seuil = entierPositif(deal?.seuil)
  const parPalier = entierPositif(deal?.nombre_offerts)
  const vide = { compte: 0, droits: 0, manque: seuil || 0, cadeaux: [], remises: [], refus: null }
  if (!deal || !seuil || !parPalier) return vide

  const liste = (lignes || []).map((l, index) => ({ ...l, index }))
  const participantes = liste.filter(l => l.offert_par !== deal.id && vise(deal.declencheurs, l))
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
    return { compte, droits, manque, cadeaux: [], remises: [...parLigne.values()].sort((a, b) => a.index - b.index), refus: null }
  }

  // Mode `choisi` : N articles achetés donnent X cadeaux choisis dans `offerts`.
  const droits = Math.floor(compte / seuil) * parPalier
  const manque = seuil - (compte % seuil)
  const demandes = liste.filter(l => l.offert_par === deal.id)
  let restant = droits
  const cadeaux = []
  let refus = null
  for (const l of demandes) {
    if (!vise(deal.offerts, l)) { refus = 'article_non_offert'; continue }
    const q = Number(l.quantite) || 0
    const garde = Math.min(q, restant)
    if (garde > 0) cadeaux.push({ index: l.index, unites: garde })
    if (q > garde) refus = 'trop_de_cadeaux'
    restant -= garde
  }
  return { compte, droits, manque, cadeaux, remises: [], refus }
}

// La phrase du panier, AVANT que l'offre soit atteinte ou quand un cadeau de
// plus est à portée : « Encore 1 pizza et ta boisson est offerte ».
// `objet` se met au pluriel avec un « s » ; `apres` est la fin de phrase,
// DÉJÀ ACCORDÉE par l'appelant (« ta boisson est offerte ») : le genre du
// cadeau ne se devine pas.
export function phraseEncore(deal, calcul, { objet = 'article', apres = null } = {}) {
  if (!deal || !calcul || !(calcul.manque > 0)) return null
  // Rien à dire tant que le client n'a encore rien pris qui participe.
  if (calcul.compte === 0) return null
  const n = calcul.manque
  const quoi = n > 1 ? `${objet}s` : objet
  const suite = apres || (deal.mode === 'moins_cher' ? 'le moins cher est offert' : 'ton cadeau est offert')
  return `Encore ${n} ${quoi} et ${suite}`
}

// Le mot qui annonce l'offre, pour la section « Promos » et la pastille.
export function accrocheOffrePanier(deal) {
  const n = entierPositif(deal?.seuil)
  const x = entierPositif(deal?.nombre_offerts)
  if (!n || !x) return ''
  if (deal.mode === 'moins_cher') return x === 1 ? `${n} achetés, le moins cher offert` : `${n} achetés, ${x} offerts`
  return `${n} achetés, ${x} offert${x > 1 ? 's' : ''}`
}
