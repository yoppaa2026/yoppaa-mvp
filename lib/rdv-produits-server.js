// LES PRODUITS ACHETÉS AVEC UN RENDEZ-VOUS, POUR SON EMAIL DE CONFIRMATION.
//
// 🔴 POURQUOI CE MODULE EXISTE (Alex, 01/09).
//
// Alex réserve un Head Spa à 60 € ET un shampoing à 21,90 €, le tout couvert
// par ses bons. Son email de confirmation annonce le rendez-vous… et **pas un
// mot du shampoing**. Il ne le retrouve que dans l'onglet Commandes.
//
// ⚠️ ET LE GABARIT SAVAIT DÉJÀ LE FAIRE. `emailRdvConfirme` porte un bloc
// « Tes produits, prêts pour ce jour-là » depuis le tunnel unique. Le webhook
// Stripe le remplit ; `/api/emails/rdv-confirme`, non. Deux chemins pour le
// même email, un seul renseigné : le frère non traité, encore.
//
// 🔴 ET CE CHEMIN-LÀ EST JUSTEMENT CELUI DES BONS. Quand les bons couvrent
// tout, le rendez-vous naît dans `create-rdv-commande` SANS passer par Stripe :
// le webhook ne s'exécute jamais, et c'est l'écran qui appelle
// `/api/emails/rdv-confirme`. Le seul chemin muet est donc exactement celui que
// le cumul des bons vient d'ouvrir.
//
// ⚠️ LE CHARGEMENT VIT ICI, ET NULLE PART AILLEURS. Le recopier dans les deux
// routes garantissait qu'une correction n'en toucherait qu'une : c'est
// littéralement le défaut qu'on est en train de réparer.

/**
 * Les produits d'un rendez-vous, et surtout COMMENT ils ont été payés.
 *
 * 🔴 « PAYÉ EN LIGNE » N'EST PAS TOUJOURS VRAI. Le bloc l'affirmait pour le
 * total brut des produits. Quand un bon les couvre, la carte n'a rien
 * encaissé : annoncer « Payé en ligne ✓ 21,90 € » ferait chercher un débit
 * bancaire qui n'existe pas, et douter du reste de l'email.
 *
 * @returns {Promise<null|{lignes: Array, total: number, bon: number, recompense: number, paye_en_ligne: number}>}
 */
export async function chargerProduitsDuRdv(db, commandeId) {
  if (!commandeId) return null

  // ⚠️ LES DEUX LECTURES SONT NÉCESSAIRES : les lignes disent CE QUI a été
  // acheté, la commande dit AVEC QUOI il a été payé. Sans la seconde, le bloc
  // ne peut que mentir sur le moyen de paiement.
  const [{ data: lignes }, { data: commande }] = await Promise.all([
    db.from('commande_articles')
      .select('quantite, prix_unitaire, article:articles(nom)')
      .eq('commande_id', commandeId),
    db.from('commandes')
      .select('total, bon_cadeau_montant, fidelite_remise, bons_utilises')
      .eq('id', commandeId)
      .maybeSingle(),
  ])
  if (!lignes || lignes.length === 0) return null

  const arr = (n) => Math.round((Number(n) || 0) * 100) / 100
  const total = arr(lignes.reduce((s, l) => s + Number(l.prix_unitaire) * l.quantite, 0))
  const bon = arr(commande?.bon_cadeau_montant)
  const recompense = arr(commande?.fidelite_remise)
  return {
    lignes: lignes.map(l => ({
      nom: l.article?.nom || 'Article',
      quantite: l.quantite,
      total: arr(Number(l.prix_unitaire) * l.quantite),
    })),
    total,
    bon,
    recompense,
    // ⚠️ CE QUI EST RÉELLEMENT PASSÉ PAR LA CARTE, jamais moins que zéro : sur
    // un panier entièrement couvert, c'est zéro, et le bloc doit se taire.
    paye_en_ligne: Math.max(0, arr(total - bon - recompense)),
    // Le pluriel du mot « bon » suit le nombre de bons, pas le montant.
    nb_bons: Array.isArray(commande?.bons_utilises) ? commande.bons_utilises.length : 0,
  }
}
