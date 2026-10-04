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
 * Ce que la carte doit ENCORE rendre, une fois déduit ce que Stripe a déjà rendu.
 *
 * 🔴 « UN REMBOURSEMENT EXISTE » NE VEUT PAS DIRE « TOUT EST RENDU » (Annul-I7,
 * 04/10). Les trois routes qui remboursent sautaient Stripe dès que
 * `stripe_refund_id` était posé. Un geste de 10 € fait depuis le tableau de bord
 * Stripe, puis le studio qui annule : les 20 € restants ne partaient jamais.
 *
 * ⚠️ UN IDENTIFIANT SANS MONTANT CONNU VAUT « DÉJÀ RENDU ». On ne sait pas
 * combien est parti : rembourser à l'aveugle, c'est risquer de rendre deux fois
 * l'argent du commerçant. Le cas ne se produit pas (chaque écriture pose les
 * deux colonnes), la prudence ne coûte rien.
 *
 * @param du ce que cette route doit rendre sur la carte
 * @param ligne la réservation, avec `stripe_refund_id` et `stripe_refund_amount`
 */
export function resteARembourser(du, ligne = {}) {
  const base = arrondi(du)
  if (!(base > 0)) return 0
  const brut = ligne?.stripe_refund_amount
  // ⚠️ `Number(null)` vaut 0 : sans ce test, l'absence passerait pour « rien rendu ».
  const deja = brut === null || brut === undefined || brut === '' ? NaN : Number(brut)
  if (!Number.isFinite(deja)) return ligne?.stripe_refund_id ? 0 : base
  return arrondi(Math.max(0, base - Math.max(0, deja)))
}

/**
 * Ce que dit un événement `charge.refunded`, lu sur ce qui est TOUJOURS là.
 *
 * 🔴 LE WEBHOOK LISAIT `charge.refunds.data[0]`. Depuis la version d'API
 * 2022-11-15, Stripe n'inclut plus cette liste dans l'objet par défaut : le
 * webhook sortait sans rien écrire. Et quand elle était là, il ne lisait que
 * le dernier remboursement, jamais le cumul. `amount_refunded` (le cumul, en
 * centimes) et `refunded` (vrai SEULEMENT quand tout est rendu) sont toujours
 * présents.
 */
export function lireRemboursementCharge(charge) {
  const centimes = Number(charge?.amount_refunded)
  return {
    montant: Number.isFinite(centimes) && centimes > 0 ? arrondi(centimes / 100) : 0,
    total: charge?.refunded === true,
    refundId: charge?.refunds?.data?.[0]?.id || null,
  }
}

/**
 * Le webhook rend-il les bons et la récompense d'un rendez-vous ?
 *
 * 🔴 IL LES RENDAIT SUR TOUT REMBOURSEMENT, PARTIEL COMPRIS, QUEL QUE SOIT LE
 * STATUT (Annul-I7). Un absent : la route rembourse ce qui dépasse la garantie
 * et GARDE le bon qui la couvre ; le webhook arrivait derrière et rendait le bon
 * entier, garantie comprise. Un geste commercial de 5 € rendait 40 € de bon.
 *
 * ⚠️ IL NE LES REND QUE SUR UN RENDEZ-VOUS ANNULÉ ET INTÉGRALEMENT REMBOURSÉ.
 * C'est un SECOURS : les routes d'annulation rendent tout elles-mêmes, avant de
 * rembourser. Un rendez-vous encore debout garde ses avantages : remboursé
 * depuis Stripe sans être annulé dans Yoppaa, il serait sinon gratuit ET
 * remboursé. Le studio l'annule, et l'annulation rend tout.
 */
export const STATUTS_RDV_ANNULES = ['annule_client', 'annule_commercant']
export function webhookRendLesAvantagesRdv({ total, statut }) {
  return total === true && STATUTS_RDV_ANNULES.includes(statut)
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
