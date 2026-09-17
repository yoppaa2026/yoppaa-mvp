// lib/fidelite.js — helpers du module Fidélité (B.6, brief 31/07).
//
// LE GSM = LA CARTE : la clé d'identité d'une carte de fidélité est le numéro
// de téléphone normalisé (format +32...). Tout converge dessus : pointage
// comptoir (le commerçant tape le numéro), crédit automatique (le téléphone
// est obligatoire dans les checkouts C&C / RDV / livraison), rattachement au
// compte Yopper. Partagé client (dashboard) et serveur (API).

// Normalise un numéro belge vers +32XXXXXXXXX. Retourne null si invalide.
// Accepte : 0470 12 34 56 · 0470/12.34.56 · +32 470 123 456 · 0032470123456.
import { euros, pourcent } from './montants'

export function normaliserTelephone(brut) {
  if (!brut) return null
  let t = String(brut).replace(/[\s./\-()]/g, '')
  if (t.startsWith('00')) t = `+${t.slice(2)}`
  if (t.startsWith('0') && !t.startsWith('+')) t = `+32${t.slice(1)}`
  if (!t.startsWith('+')) t = `+32${t}`
  // Belgique : +32 suivi de 8 (fixe) ou 9 (mobile) chiffres
  if (!/^\+32[1-9]\d{7,8}$/.test(t)) return null
  return t
}

// Affichage lisible d'un numéro normalisé (+32470123456 → 0470 12 34 56)
export function afficherTelephone(normalise) {
  if (!normalise?.startsWith('+32')) return normalise || ''
  const local = `0${normalise.slice(3)}`
  if (local.length === 10) return `${local.slice(0, 4)} ${local.slice(4, 6)} ${local.slice(6, 8)} ${local.slice(8)}`
  if (local.length === 9)  return `${local.slice(0, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7)}`
  return local
}

// Applique un crédit (passage ou montant €) à l'état d'une carte et calcule
// les débloquages de récompense. PURE : retourne le patch à persister + le
// nombre de récompenses débloquées par CE crédit (pour le SMS carte pleine).
//
// config = le commerçant (fidelite_mecanique, fidelite_seuil_passages,
//          fidelite_taux_cagnotte, fidelite_seuil_cagnotte)
// carte  = { passages, cagnotte, recompenses_disponibles }
// credit = { passages?: 1, montant?: 12.50 }
// Ce qu'une commande fait réellement gagner en cagnotte.
//
// ⚠️ LA PART PAYÉE PAR UN BON CADEAU NE COMPTE PAS. Elle a déjà été créditée à
// l'ACHAT du bon : la compter une seconde fois à son utilisation ferait gagner
// deux fois la même dépense, et un client qui s'offre un bon à lui-même
// doublerait sa cagnotte sans dépenser un centime de plus.
//
// ⚠️ NI LA REMISE DE FIDÉLITÉ, POUR UNE RAISON ENCORE PLUS DIRECTE : elle
// n'est pas payée du tout. Si elle comptait, dépenser sa récompense
// REMPLIRAIT la carte suivante, et le programme s'auto-alimenterait : à chaque
// tour, le commerçant offrirait une part de plus sans qu'un euro entre en
// caisse. C'est la boucle qu'il faut fermer AVANT le premier client.
//
// Ce qui compte, c'est ce que le client sort de sa poche ce jour-là.
export function montantFidelisable(commande = {}) {
  const total = Number(commande.total || 0)
  const bon = Number(commande.bon_cadeau_montant || 0)
  const recompense = Number(commande.fidelite_remise || 0)
  const reste = total - (bon > 0 ? bon : 0) - (recompense > 0 ? recompense : 0)
  return reste > 0 ? Math.round(reste * 100) / 100 : 0
}

// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LA RÉCOMPENSE VAUT, ET LA MÉCANIQUE LE DÉCIDE SEULE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 DÉCISION D'ALEX, 16/09, APRÈS AVOIR VU L'INCOHÉRENCE. Le type et la valeur
// de la récompense étaient réglés SÉPARÉMENT de la mécanique, et rien ne les
// reliait. Deux dérives en sortaient :
//
//   • PASSAGES + MONTANT EN EUROS : « 10 passages → 5 € » coûtait 25 % à un
//     café à 2 € le panier, et 1,4 % à un traiteur à 35 €. Le même réglage,
//     le même écran, et personne ne savait ce qu'il donnait.
//   • CAGNOTTE + VALEUR LIBRE : le client voyait « ta cagnotte : 10,00 € » et
//     pouvait recevoir 5 €. Compter en euros ce qui ne se rend pas en euros,
//     c'est promettre autre chose que ce qu'on tient.
//
// Désormais CHAQUE MÉCANIQUE GARDE SON UNITÉ, et la récompense en découle :
//
//   • CAGNOTTE, logique d'argent → la récompense EST la cagnotte. Seuil
//     atteint à 10 €, ce sont 10 € de remise. Le commerçant ne règle que son
//     taux et son seuil, et son taux EST ce qu'il donne.
//   • PASSAGES, logique de comptage → un POURCENTAGE de remise. Il suit le
//     prix pratiqué, donc il ne peut plus valoir un quart du panier chez l'un
//     et un centième chez l'autre.
//
// Le montant fixe en euros n'existe plus. C'était lui, le défaut.

export const MECANIQUE_CAGNOTTE = 'cagnotte'
export const MECANIQUE_PASSAGES = 'passages'

// ⚠️ LE PIÈGE DU ZÉRO, HUITIÈME FOIS. `|| 10` transforme un seuil réglé à zéro
// en dix. On distingue donc « jamais renseigné » (null, undefined, '') d'une
// valeur posée, et on borne au lieu de remplacer.
function nombreRegle(brut, defaut) {
  if (brut === null || brut === undefined || brut === '') return defaut
  const n = Number(brut)
  return Number.isFinite(n) ? n : defaut
}

export const SEUIL_CAGNOTTE_MIN = 1
export const PASSAGES_MIN = 2
export const PASSAGES_MAX = 50
export const POURCENT_MIN = 1
export const POURCENT_MAX = 100

export function seuilCagnotte(config) {
  return Math.max(SEUIL_CAGNOTTE_MIN, nombreRegle(config?.fidelite_seuil_cagnotte, 10))
}

export function seuilPassages(config) {
  return Math.min(PASSAGES_MAX, Math.max(PASSAGES_MIN, Math.round(nombreRegle(config?.fidelite_seuil_passages, 10))))
}

export function pourcentPassages(config) {
  return Math.min(POURCENT_MAX, Math.max(POURCENT_MIN, nombreRegle(config?.fidelite_recompense_valeur, 10)))
}

export function estCagnotte(config) {
  return config?.fidelite_mecanique === MECANIQUE_CAGNOTTE
}

// ⚠️ ZÉRO EST UN RÉGLAGE, PAS UNE ABSENCE DE RÉGLAGE. Un commerçant qui coupe
// sa cagnotte à 0 % distribuait 5 % avant le 01/09, sans jamais comprendre
// pourquoi. Seul ce qui n'a JAMAIS été renseigné retombe sur le défaut.
export function tauxCagnotte(config) {
  return Math.max(0, nombreRegle(config?.fidelite_taux_cagnotte, 5))
}

// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE PROGRAMME COÛTE VRAIMENT, EN PART DU CHIFFRE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 « 10 % » NE VEUT PAS DIRE LA MÊME CHOSE DANS LES DEUX MÉCANIQUES, et c'est
// le dernier piège de cette famille (16/09) :
//
//   • CAGNOTTE à 10 % : le taux EST ce qui est rendu, puisque la récompense est
//     la cagnotte. Le commerçant rend 10 % de tout son chiffre.
//   • PASSAGES, 10 passages → 10 % : la remise tombe sur UN achat tous les
//     onze, donc elle coûte 10/11, soit 0,9 % du chiffre.
//
// Onze fois d'écart pour le même chiffre saisi à l'écran. Un commerçant qui
// règle « 10 % » en cagnotte en pensant à sa carte à tampons rend onze fois
// plus que ce qu'il croit, et rien ne le lui disait.
//
// ⚠️ C'EST UNE ESTIMATION, ET ELLE LE DIT. Elle suppose des paniers du même
// ordre : en passages, un client qui garde sa remise pour son plus gros achat
// coûte davantage. Annoncer un chiffre exact serait mentir ; ne rien annoncer
// serait pire.
export function coutEnPourcent(config) {
  if (estCagnotte(config)) return tauxCagnotte(config)
  // La remise s'applique une fois tous les (passages + 1) achats : les N
  // passages qui remplissent la carte, puis celui qui la dépense.
  const part = pourcentPassages(config) / (seuilPassages(config) + 1)
  return Math.round(part * 10) / 10
}

// La phrase qu'on met sous le réglage. Elle nomme le chiffre ET ce qu'il
// signifie, parce qu'un pourcentage seul ne dit pas de quoi il est le
// pourcentage.
export function phraseCout(config) {
  const cout = coutEnPourcent(config)
  if (estCagnotte(config)) {
    return cout === 0
      ? 'À 0 %, la cagnotte ne monte jamais : personne ne débloquera de récompense.'
      : `Tu rends ${cout} % de tout ton chiffre à tes clients fidèles.`
  }
  return `Environ ${cout} % de ton chiffre, si tes paniers se ressemblent. Un client qui garde sa remise pour un gros achat te coûtera davantage.`
}

// Rend `{ type, valeur }`, la forme exacte que `fidelite_recompenses` fige le
// jour où le client gagne. UNE SEULE DÉFINITION : l'écran du commerçant, celui
// du client et le serveur qui crée la récompense lisent tous cette fonction.
export function recompenseDue(config) {
  if (estCagnotte(config)) {
    return { type: 'remise_montant', valeur: seuilCagnotte(config) }
  }
  return { type: 'remise_pct', valeur: pourcentPassages(config) }
}

export function appliquerCredit(config, carte, credit) {
  let passages = carte.passages || 0
  let cagnotte = Number(carte.cagnotte || 0)
  let recompenses = carte.recompenses_disponibles || 0
  let debloquees = 0

  if (config.fidelite_mecanique === 'passages') {
    passages += credit.passages || 0
    const seuil = Math.max(2, config.fidelite_seuil_passages || 10)
    while (passages >= seuil) {
      passages -= seuil
      recompenses += 1
      debloquees += 1
    }
  } else {
    // ⚠️ `|| 5` transformait un taux réglé À ZÉRO en 5 %, parce que zéro est
    // falsy. Un commerçant qui coupe délibérément sa cagnotte se retrouvait
    // donc à distribuer cinq fois plus que le taux par défaut, sans jamais
    // comprendre pourquoi. Zéro est un réglage, pas une absence de réglage.
    //
    // Le repli à 5 % reste pour ce qui n'a JAMAIS été renseigné : null,
    // undefined, ou la chaîne vide que rend un formulaire laissé blanc.
    const brut = config.fidelite_taux_cagnotte
    const taux = (brut === null || brut === undefined || brut === '') ? 5 : Number(brut) || 0
    const gain = Math.round((Number(credit.montant || 0) * taux)) / 100  // en €, arrondi au cent
    cagnotte = Math.round((cagnotte + gain) * 100) / 100
    const seuil = Number(config.fidelite_seuil_cagnotte || 10)
    while (seuil > 0 && cagnotte >= seuil) {
      cagnotte = Math.round((cagnotte - seuil) * 100) / 100
      recompenses += 1
      debloquees += 1
    }
  }

  return {
    patch: { passages, cagnotte, recompenses_disponibles: recompenses, updated_at: new Date().toISOString() },
    debloquees,
  }
}

// Libellé de la récompense configurée (fallback si le commerçant n'en a pas mis)
// ⚠️ LE LIBELLÉ SE DÉDUIT DE LA RÈGLE, il ne se recopie plus. Avant le 16/09 il
// lisait `fidelite_recompense_type` et `fidelite_recompense_valeur`
// directement : un commerçant qui changeait son seuil de cagnotte gardait donc
// un texte qui annonçait l'ancien montant, et c'est ce texte-là que le client
// lisait. Désormais tout part de `recompenseDue`, comme le reste.
export function libelleRecompense(config) {
  if (config?.fidelite_recompense_libelle?.trim()) return config.fidelite_recompense_libelle.trim()
  const due = recompenseDue(config)
  // ⚠️ `euros()` ET `pourcent()`, PAS UN FORMAT RECOPIÉ À LA MAIN. Cette ligne
  // écrivait « 10,00€ offerts » sans espace, et « -10% » sans espace non plus.
  // Le résultat se lisait à côté d'un « 10,00 € » correct, dans la MÊME phrase
  // de la carte de fidélité : « Dès qu'elle atteint 10,00 €, tu reçois :
  // 10,00€ offerts. » Deux typographies dans une phrase, c'est ce que le
  // relecteur d'un store voit avant le reste.
  if (due.type === 'remise_pct') return `-${pourcent(due.valeur)} sur ta prochaine commande`
  return `${euros(due.valeur)} offerts`
}

// Préréglages par segment (proposés à l'activation, modifiables)
export function presetFidelite(categorie) {
  // ⚠️ PLUS AUCUN PRÉRÉGLAGE NE FIGE UN LIBELLÉ CHIFFRÉ. « 10€ offerts » écrit
  // en dur devenait faux dès que le commerçant changeait son seuil, et il ne
  // s'en apercevait jamais. Le libellé se DÉDUIT de la règle (`libelleRecompense`)
  // et reste personnalisable.
  //
  // ⚠️ NI TYPE NI VALEUR EN CAGNOTTE : la récompense EST la cagnotte, elle se
  // déduit du seuil. Un préréglage qui les poserait recréerait l'écart que
  // cette refonte supprime.
  if (categorie === 'detail') {
    return { fidelite_mecanique: MECANIQUE_CAGNOTTE, fidelite_taux_cagnotte: 5, fidelite_seuil_cagnotte: 10, fidelite_recompense_libelle: '' }
  }
  // Un rendez-vous se répète moins souvent qu'un pain : la remise est forte
  // pour peser dans la décision, et elle ne coûte qu'un rendez-vous sur onze.
  if (categorie === 'vitrine') {
    return { fidelite_mecanique: MECANIQUE_PASSAGES, fidelite_seuil_passages: 10, fidelite_recompense_valeur: 50, fidelite_recompense_libelle: '' }
  }
  return { fidelite_mecanique: MECANIQUE_PASSAGES, fidelite_seuil_passages: 10, fidelite_recompense_valeur: 10, fidelite_recompense_libelle: '' }
}
