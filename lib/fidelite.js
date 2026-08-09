// lib/fidelite.js — helpers du module Fidélité (B.6, brief 31/07).
//
// LE GSM = LA CARTE : la clé d'identité d'une carte de fidélité est le numéro
// de téléphone normalisé (format +32...). Tout converge dessus : pointage
// comptoir (le commerçant tape le numéro), crédit automatique (le téléphone
// est obligatoire dans les checkouts C&C / RDV / livraison), rattachement au
// compte Yopper. Partagé client (dashboard) et serveur (API).

// Normalise un numéro belge vers +32XXXXXXXXX. Retourne null si invalide.
// Accepte : 0470 12 34 56 · 0470/12.34.56 · +32 470 123 456 · 0032470123456.
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
// Ce qui compte, c'est ce que le client sort de sa poche ce jour-là.
export function montantFidelisable(commande = {}) {
  const total = Number(commande.total || 0)
  const bon = Number(commande.bon_cadeau_montant || 0)
  const reste = total - (bon > 0 ? bon : 0)
  return reste > 0 ? Math.round(reste * 100) / 100 : 0
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
export function libelleRecompense(config) {
  if (config?.fidelite_recompense_libelle?.trim()) return config.fidelite_recompense_libelle.trim()
  if (config?.fidelite_recompense_type === 'remise_pct' && config?.fidelite_recompense_valeur) {
    return `-${Number(config.fidelite_recompense_valeur)}% sur ta prochaine commande`
  }
  if (config?.fidelite_recompense_valeur) {
    return `${Number(config.fidelite_recompense_valeur).toFixed(2).replace('.', ',')}€ offerts`
  }
  return 'Récompense fidélité'
}

// Préréglages par segment (proposés à l'activation, modifiables)
export function presetFidelite(categorie) {
  if (categorie === 'detail') {
    return { fidelite_mecanique: 'cagnotte', fidelite_taux_cagnotte: 5, fidelite_seuil_cagnotte: 10, fidelite_recompense_type: 'remise_montant', fidelite_recompense_valeur: 10, fidelite_recompense_libelle: '10€ offerts sur ton prochain achat' }
  }
  if (categorie === 'vitrine') {
    return { fidelite_mecanique: 'passages', fidelite_seuil_passages: 10, fidelite_recompense_type: 'remise_pct', fidelite_recompense_valeur: 50, fidelite_recompense_libelle: '-50% sur ton prochain rendez-vous' }
  }
  return { fidelite_mecanique: 'passages', fidelite_seuil_passages: 10, fidelite_recompense_type: 'remise_montant', fidelite_recompense_valeur: 5, fidelite_recompense_libelle: 'Le 11e passage te fait gagner 5€' }
}
