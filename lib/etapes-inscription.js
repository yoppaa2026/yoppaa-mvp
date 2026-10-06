// Les étapes de l'inscription commerçant, à UN endroit : l'inscription les
// affiche, l'admin compte qui s'y arrête, la relance dit où l'on en était.
//
// 🔴 TROIS ÉTAPES, PLUS CINQ (Alex, 06/10, tableau : « alléger le signup »).
// Visuels, Horaires et présentation se redemandaient ensuite au tableau de
// bord, et le score de 60 les exigeait AVANT l'ouverture du compte. Ils vivent
// désormais au tableau de bord, où « fiche complète » les exige avant la
// PUBLICATION. L'inscription ne garde que ce qui sert à OUVRIR le compte.

export const ETAPES_INSCRIPTION = [
  { n: 1, label: 'Compte' },
  { n: 2, label: 'L’essentiel' },
  { n: 3, label: 'Vérification' },
]
export const DERNIERE_ETAPE = ETAPES_INSCRIPTION.length

// ⚠️ UNE INSCRIPTION COMMENCÉE AVANT LE 06/10 reprend à son étape enregistrée
// (`etape_actuelle`, de 2 à 5 dans l'ancien parcours). Les anciennes étapes
// 3 (Visuels), 4 (Horaires) et 5 (Validation) mènent toutes à la vérification.
export function etapeReprise(enregistree) {
  const n = Number(enregistree) || 2
  if (n < 2) return 2
  return Math.min(n, DERNIERE_ETAPE)
}

/**
 * Combien d'inscriptions arrêtées à chaque étape. Une fiche sans ligne
 * d'onboarding compte à « L'essentiel » (étape 2, la reprise par défaut).
 */
export function decompteParEtape(fiches = [], etapeParCommerce = {}) {
  const compte = Object.fromEntries(ETAPES_INSCRIPTION.map(e => [e.n, 0]))
  for (const f of fiches || []) compte[etapeReprise(etapeParCommerce?.[f.id])]++
  return ETAPES_INSCRIPTION.filter(e => e.n > 1).map(e => ({ n: e.n, label: e.label, nb: compte[e.n] }))
}

/** Le nom de l'étape où une inscription s'est arrêtée (admin, relance). */
export function libelleEtape(enregistree) {
  const n = etapeReprise(enregistree)
  return ETAPES_INSCRIPTION.find(e => e.n === n)?.label || ETAPES_INSCRIPTION[1].label
}
