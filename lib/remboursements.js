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

/**
 * Regroupe les re-crédits de bons par cible, triés par date.
 *
 * 🔴 AUCUNE COLONNE NE DIT CE QU'UN BON A RENDU. `rendreAvantagesRdv` recrédite
 * le bon sans toucher `bon_cadeau_montant` : cette colonne dit ce que le bon a
 * PAYÉ, jamais ce qu'il a fini par payer. Les mouvements `source =
 * 'annulation'` sont la seule vérité, et ils portent leur date, ce qui règle
 * aussi le no-show où seule une PART du bon revient.
 *
 * ⚠️ CETTE FONCTION VIT ICI, ET PLUS DANS L'EXPORT COMPTABLE (03/09) : le
 * tableau de bord en a besoin du mot pour mot pour savoir ce qu'un no-show a
 * laissé au commerçant. Une règle d'argent recopiée est une règle qui divergera.
 */
export function indexerRetoursBons(mouvements = []) {
  const parCommande = new Map()
  const parRdv = new Map()
  const ranges = [...(mouvements || [])]
    .filter(m => m && Number(m.montant) > 0)
    .sort((a, b) => String(a.created_at || '') < String(b.created_at || '') ? -1 : 1)
  for (const m of ranges) {
    const cible = m.commande_id ? parCommande : m.rdv_id ? parRdv : null
    if (!cible) continue
    const cle = m.commande_id || m.rdv_id
    if (!cible.has(cle)) cible.set(cle, [])
    cible.get(cle).push(m)
  }
  return { parCommande, parRdv }
}

// Ce qu'un bon a FINI par payer : ce qu'il portait, moins ce qui est reparti.
export function bonReste(montantPorte, mouvements) {
  const porte = arrondi(montantPorte)
  if (!(porte > 0)) return 0
  const rendu = (mouvements || []).reduce((s, m) => s + (Number(m?.montant) || 0), 0)
  return arrondi(Math.max(0, porte - rendu))
}
