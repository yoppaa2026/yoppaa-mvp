import { euros } from './montants'

// Les bons cadeaux vendus, vus du commerçant.
//
// ⚠️ IL N'EN SAVAIT RIEN. Quelqu'un achetait un bon cadeau, l'argent arrivait
// sur son compte, et son tableau de bord n'en disait pas un mot. Un email
// partait, mais UNIQUEMENT s'il était réglé sur « à chaque commande » : réglé
// sur le récapitulatif du matin ou sur rien du tout, il découvrait la vente en
// regardant ses chiffres, des jours plus tard.
//
// Il n'a rien à préparer, c'est vrai. Mais quelqu'un vient d'offrir SON commerce
// à quelqu'un d'autre, et il doit le savoir : c'est une vente, et c'est un
// client qui viendra.

// Le montant, c'est `montant_initial` : le solde, lui, baisse à mesure que le
// bénéficiaire dépense. Confondre les deux ferait afficher « 0 € » sur un bon
// entièrement utilisé, alors qu'il a bel et bien été vendu à son prix.
export function resumeBonsVendus(bons = []) {
  const liste = (bons || []).filter(Boolean)
  const total = liste.reduce((s, b) => s + (Number(b.montant_initial) || 0), 0)
  return { nombre: liste.length, total }
}

// Ceux vendus un jour donné. La date de VENTE (`created_at`), pas l'expiration :
// c'est le jour où l'argent est entré.
//
// @param jourDe  (bon) => 'YYYY-MM-DD' — injecté pour que ce module reste pur,
//                la construction de la clé de jour vivant ailleurs.
export function bonsDuJour(bons = [], jour, jourDe) {
  if (typeof jourDe !== 'function' || !jour) return []
  return (bons || []).filter(b => b && jourDe(b) === jour)
}

// Ce qu'on lui annonce. Une phrase, pas un tableau : il n'a rien à faire, il a
// juste à savoir.
export function texteBonVendu(bon) {
  const montant = Number(bon?.montant_initial)
  // ⚠️ La garde `isFinite` RESTE : sans montant lisible on ne dit pas
  // « 0,00 € », on ne dit rien. `euros()` ne fait que la mise en forme.
  const somme = Number.isFinite(montant) ? euros(montant) : null
  return {
    titre: 'Bon cadeau vendu 🟣',
    corps: somme
      ? `${somme} · l'argent est déjà sur ton compte, rien à préparer`
      : "L'argent est déjà sur ton compte, rien à préparer",
  }
}
