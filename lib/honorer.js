// ─── CE QU'UN COMMERÇANT DOIT POUVOIR HONORER APRÈS AVOIR PERDU UNE FONCTION ─
//
// 🔴 RÈGLE DU PROJET (26/08) : LA GARDE PORTE SUR LA CRÉATION, JAMAIS SUR LA
// CONSOMMATION. Un commerçant redescendu de Vendre (essai arrêté, essai fini
// le 9 janvier, abonnement résilié) ne crée plus rien de neuf ; mais ses
// clients ont PAYÉ ce qu'il a déjà vendu, et c'est à eux qu'on ferait porter la
// sanction s'il ne pouvait plus l'honorer.
//
// 🔴 L'AUDIT DU 17/10 (le bouton « Revenir à ma formule », demandé par Alex
// pour ICONIC) : le serveur tenait la règle presque partout, l'ÉCRAN la
// trahissait. Sept choses déjà vendues devenaient inatteignables : commandes
// d'un salon, bons cadeaux, compte Stripe, cartes de séances, export
// comptable, récap de 8 h, cartes de fidélité.
//
// ✅ ALEX, 17/10 (tableau) : un onglet hors formule se rouvre S'IL Y A QUELQUE
// CHOSE À HONORER, avec la phrase « hors de ta formule », la création fermée.
// S'il n'y a rien, il garde la proposition d'essai d'aujourd'hui : une page
// vide se lit comme une panne.
//
// Ce module est PUR : il dit quoi ouvrir à partir de traces comptées ailleurs
// (`app/dashboard/useTracesAHonorer.js` côté écran). Le banc l'exécute.

// La fonction de la matrice → ce qui, s'il existe, oblige à rouvrir.
export const TRACES_PAR_FONCTION = {
  bons_cadeaux:     'bonsActifs',          // des bons vendus, pas épuisés
  paiement_ligne:   'compteStripe',        // un compte où dort son argent
  rdv:              'abonnementsActifs',   // des cartes de séances en cours
  export_comptable: 'ventes',              // des ventes à déclarer
  fidelite:         'cartesFidelite',      // des cartes remplies par ses clients
  commande:         'commandesEnCours',    // des commandes à préparer ou remettre
}

// Les fonctions à rouvrir pour honorer, parmi celles qu'il n'a plus.
// `aLui(feature)` dit si la fonction est déjà à lui (incluse ou en essai) :
// rien à rouvrir dans ce cas, elle est ouverte.
export function fonctionsAHonorer(traces = {}, aLui = () => false) {
  const ouvertes = new Set()
  for (const [feature, cle] of Object.entries(TRACES_PAR_FONCTION)) {
    if (aLui(feature)) continue
    const v = traces?.[cle]
    if (v === true || (Number.isFinite(v) && v > 0)) ouvertes.add(feature)
  }
  return ouvertes
}

// L'export comptable, côté SERVEUR. Le forfait l'ouvre ; à défaut, des lignes
// à déclarer l'ouvrent aussi : c'est son propre argent, et son comptable en a
// besoin pour les mois où il vendait. Sans aucune ligne, la fonction reste
// celle de Vendre (402), comme avant.
export function exportComptableAutorise({ forfaitLePermet = false, nbLignes = 0 } = {}) {
  return forfaitLePermet === true || (Number.isFinite(nbLignes) && nbLignes > 0)
}

// Le récap de 8 h d'un commerce à commandes. Le forfait l'ouvre ; à défaut,
// des commandes ou des tables DÉJÀ PRISES pour aujourd'hui l'ouvrent aussi :
// le boucher qui a pris ses commandes de Noël pendant l'essai doit les voir le
// matin du retrait. Rien à honorer, rien à envoyer : pas d'email « Aucune
// commande » à qui ne peut plus en recevoir.
export function recapDuJourAEnvoyer({ forfaitOuvert = false, nbCommandes = 0, nbTables = 0 } = {}) {
  return forfaitOuvert === true || nbCommandes > 0 || nbTables > 0
}

// La phrase en tête d'un onglet rouvert pour honorer. Une seule, partout.
export const PHRASE_HONORER =
  'Hors de ta formule : tu honores ici ce qui existe déjà, sans en créer de nouveau.'
