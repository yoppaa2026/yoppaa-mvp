// CE QUI EST REPARTI. Une seule règle, pour deux écrans qui la posaient
// différemment ou pas du tout.
//
// 🔴 POURQUOI CE MODULE EXISTE (02/09). Le journal comptable et le tableau de
// bord répondent tous les deux à « combien le commerçant a-t-il gagné », et
// tous les deux comptaient de l'argent rendu au client :
//
//   • le journal ne filtrait AUCUN statut de rendez-vous ;
//   • le tableau de bord filtre bien les annulations, mais un remboursement
//     PARTIEL garde volontairement son statut (webhook Stripe : « commande
//     honorée + remboursement partiel »). Une commande de 60 € remboursée de
//     20 € s'affichait 60 € des deux côtés.
//
// ⚠️ ET LA RÈGLE NE SE RECOPIE PAS. C'est le motif qui a produit le plus de
// défauts sur ce projet : `rendreAvantages` a vécu en deux copies, trois
// correctifs n'en ont touché qu'une. Une règle d'argent vit à un seul endroit.

const arrondi = (n) => Math.round(Number(n || 0) * 100) / 100

/**
 * Ce qui est réellement reparti sur une ligne, jamais plus qu'elle.
 *
 * ⚠️ LE PLAFOND N'EST PAS UNE PRÉCAUTION, IL EST INDISPENSABLE. Dans le tunnel
 * unique, le rendez-vous et sa commande partagent le MÊME paiement Stripe, et
 * le webhook `charge.refunded` écrit le même `stripe_refund_amount` sur les
 * deux. Un remboursement de 50 € imputé à un acompte de 20 € creuserait un
 * trou de 30 € dans le chiffre d'affaires : la part des produits appartient à
 * la commande, qui porte sa propre ligne ou qui n'en porte aucune si son
 * statut l'exclut déjà.
 *
 * @param montantRembourse la colonne `stripe_refund_amount`
 * @param plafond ce que CETTE ligne a réellement encaissé
 */
export function partRemboursee(montantRembourse, plafond) {
  const m = Number(montantRembourse)
  const p = Number(plafond)
  if (!Number.isFinite(m) || m <= 0) return 0
  if (!Number.isFinite(p) || p <= 0) return 0
  return arrondi(Math.min(m, p))
}

/**
 * Ce qui RESTE d'un montant encaissé, une fois le remboursement déduit.
 *
 * ⚠️ ON COMPTE CE QUI EST RESTÉ, PAS UNE LISTE DE STATUTS À EXCLURE. Une
 * annulation qui GARDE l'acompte en dédommagement reste comptée, et c'est
 * juste : le commerçant l'a gagné. Le no-show écrit sa garantie tout seul. Et
 * la règle ne devient pas fausse au prochain statut inventé.
 */
export function resteApresRemboursement(encaisse, montantRembourse) {
  const base = arrondi(encaisse)
  if (!(base > 0)) return arrondi(Math.max(0, base))
  return arrondi(base - partRemboursee(montantRembourse, base))
}
