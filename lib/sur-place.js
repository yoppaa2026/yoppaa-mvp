// LES COMMANDES PAYÉES SUR PLACE ONT DES LIMITES (audit livraison, mineur ;
// décision d'Alex le 06/10 : « oui parfait comme règle »).
//
// 🔴 LE RISQUE N'EST PAS LE GROS PANIER, C'EST LA FAUSSE COMMANDE. Payer sur
// place ne demande rien : quelqu'un pouvait passer dix commandes « sur place »
// avec un faux email, et bloquer ainsi les créneaux et le stock d'un commerce.
// Deux règles :
//   • au plus MAX_SUR_PLACE_EN_COURS commandes « sur place » EN COURS par email
//     ET par téléphone, chez un même commerce ; au-delà, on paie en ligne ;
//   • un plafond par commande, réglé par le commerçant
//     (`commercants.paiement_sur_place_max`). Vide : pas de plafond, rien ne
//     change pour qui ne le règle pas.
//
// Fichier PUR : le serveur décide, le banc l'exécute.

import { normaliserEmail } from './email-normalise.js'

export const MAX_SUR_PLACE_EN_COURS = 2

/** Les chiffres d'un numéro : « 0470 12 34 56 » et « 0470/123456 » sont égaux. */
export function chiffresTelephone(t) {
  return String(t ?? '').replace(/\D/g, '')
}

/**
 * Combien des commandes « sur place » en cours du commerce sont à ce client,
 * reconnu par son email OU par son téléphone (l'un des deux suffit : changer
 * d'email ne remet pas le compteur à zéro).
 */
export function compterSurPlaceDuClient(commandes, { email, telephone } = {}) {
  const e = normaliserEmail(email)
  const t = chiffresTelephone(telephone)
  return (commandes || []).filter(c =>
    (e && normaliserEmail(c?.client_email) === e)
    || (t.length >= 8 && chiffresTelephone(c?.client_telephone) === t)
  ).length
}

/**
 * La phrase de refus, ou `null` si la commande sur place est acceptée.
 * `enLigneAutorise` : le commerce propose-t-il aussi le paiement en ligne ?
 * Sans lui, on ne renvoie pas vers une porte fermée.
 */
export function refusSurPlace({ duEUR, plafond, enCours = 0, enLigneAutorise = false } = {}) {
  const issue = enLigneAutorise
    ? 'choisis le paiement en ligne'
    : 'appelle le commerce'
  if (enCours >= MAX_SUR_PLACE_EN_COURS) {
    return `Tu as déjà ${enCours} commandes à payer sur place en cours chez ce commerce. Pour en passer une autre, ${issue}, ou retire d’abord les précédentes.`
  }
  const max = plafond == null || plafond === '' ? null : Number(plafond)
  if (max != null && Number.isFinite(max) && max > 0 && Number(duEUR) > max) {
    const montant = max.toFixed(2).replace('.', ',').replace(/,00$/, '')
    return `Chez ce commerce, le paiement sur place est limité à ${montant} € par commande. Pour ce panier, ${issue}.`
  }
  return null
}
