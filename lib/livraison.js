// Les règles de la livraison locale.
//
// POURQUOI CE FICHIER. Tout vivait à l'intérieur de la route de création de
// commande, mêlé au reste : la zone desservie, le calcul des frais, le seuil
// de gratuité. Du code qu'on ne peut pas exécuter sans une base et une clé
// Stripe, donc du code que le banc ne pouvait pas juger. C'était le module le
// plus complexe de Yoppaa, et le moins vérifié.
//
// Tout ce qui est ici est PUR : des nombres et des chaînes entrent, un
// résultat sort. La route garde les accès à la base et applique ces décisions.

// ─── LA ZONE DESSERVIE ────────────────────────────────────────────────────
//
// Le commerçant liste les codes postaux qu'il livre. Rien d'autre : pas de
// rayon, pas de polygone (décision Alex, 05/07). Un code postal, ça se vérifie
// à l'œil et ça ne se discute pas au moment de la livraison.
//
// ⚠️ LES DEUX CÔTÉS SONT NORMALISÉS. Un code saisi « 5640 » dans le tableau de
// bord et « 5640 » avec une espace insécable dans le formulaire client, ce
// sont deux chaînes différentes pour JavaScript, et une livraison refusée sans
// que personne ne comprenne pourquoi.
export function normaliserCodePostal(cp) {
  return String(cp ?? '').replace(/\s| /g, '').trim()
}

export function zoneCouverte(codesPostaux, cp) {
  const cible = normaliserCodePostal(cp)
  if (!cible) return false
  return (codesPostaux || []).some(c => normaliserCodePostal(c) === cible)
}

// ─── LES FRAIS DE LIVRAISON ───────────────────────────────────────────────
//
// Montant fixe, offert au-delà d'un seuil. Calculé côté serveur, toujours :
// c'est un montant que le navigateur ne doit jamais pouvoir décider.
//
// ⚠️ `gratuit_des` à NULL signifie « jamais offert », pas « offert dès 0 € ».
// Confondre les deux ferait travailler le commerçant gratuitement.
export function fraisLivraison({ total = 0, frais_fixe = 0, gratuit_des = null } = {}) {
  const montantPanier = Number(total) || 0
  const frais = Math.max(0, Number(frais_fixe) || 0)
  const seuil = (gratuit_des === null || gratuit_des === undefined || gratuit_des === '')
    ? null
    : Number(gratuit_des)
  const offert = seuil !== null && Number.isFinite(seuil) && montantPanier >= seuil
  return {
    montant: offert ? 0 : Math.round(frais * 100) / 100,
    offert,
    seuil,
    // Ce qui manque pour que la livraison devienne gratuite. Sert à la phrase
    // « Plus que 4,20 € pour la livraison offerte », qui fait monter les paniers.
    manquePourGratuit: (seuil !== null && Number.isFinite(seuil) && !offert)
      ? Math.round((seuil - montantPanier) * 100) / 100
      : null,
  }
}

// ─── LE MINIMUM DE COMMANDE ───────────────────────────────────────────────
//
// Demandé par Alex le 09/08. Un commerçant qui prend sa voiture pour trois
// euros de marchandise y perd, et c'est le premier réglage que réclame
// quiconque livre.
//
// ⚠️ LE MINIMUM SE MESURE SUR LES ARTICLES, PAS SUR CE QUI EST PAYÉ. Ni les
// frais de livraison ni un bon cadeau ne doivent entrer dans le calcul :
// ajouter les frais ferait franchir le seuil sans que le panier grossisse, et
// un bon cadeau ferait passer sous le minimum une commande qui l'atteignait.
export function minimumAtteint({ total = 0, minimum = null } = {}) {
  const montant = Number(total) || 0
  const seuil = (minimum === null || minimum === undefined || minimum === '')
    ? null
    : Number(minimum)
  if (seuil === null || !Number.isFinite(seuil) || seuil <= 0) {
    return { ok: true, seuil: null, manque: 0 }
  }
  const manque = Math.round((seuil - montant) * 100) / 100
  return { ok: montant >= seuil, seuil, manque: manque > 0 ? manque : 0 }
}

// ─── LE SUIVI DE LA LIVRAISON ─────────────────────────────────────────────
//
// Trois états, dans cet ordre, et jamais en arrière : la commande est prête,
// le commerçant part, le client reçoit.
//
// `null` est l'état de départ : la commande existe mais n'est pas encore
// partie. On ne stocke pas « preparee », qui ferait doublon avec `statut`.
export const STATUTS_LIVRAISON = ['en_livraison', 'livree']

export function prochainStatutLivraison(actuel) {
  const a = actuel || null
  if (a === null) return 'en_livraison'
  if (a === 'en_livraison') return 'livree'
  return null   // déjà livrée : plus rien après
}

export function transitionLivraisonValide(actuel, cible) {
  if (!STATUTS_LIVRAISON.includes(cible)) return false
  return prochainStatutLivraison(actuel) === cible
}

// Ce que le Yopper doit lire à chaque étape. Le vocabulaire compte : « prête »
// ne veut rien dire pour une livraison, personne ne vient la chercher.
export function libelleSuiviLivraison(statutLivraison) {
  if (statutLivraison === 'livree') return 'Livrée'
  if (statutLivraison === 'en_livraison') return 'En route vers toi'
  return 'En préparation'
}
