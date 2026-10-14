// ════════════════════════════════════════════════════════════════════
// LA PASTILLE DU RECTO DU KIT : « Tu tiens [ … ] ? »
//
// ✅ DÉCISION D'ALEX (14/10, option 1). Un métier pris en EXEMPLE vexe ses
// voisins : « Tu tiens une friterie ? » laissait la sandwicherie et la
// boulangerie dehors, alors qu'elles ont presque les mêmes besoins. Chaque
// segment a donc une pastille GÉNÉRALISTE, où tout le monde se reconnaît :
//   alimentaire → « Tu tiens un commerce de bouche ? »
//   restaurant  → « Tu tiens un restaurant ? »
//   services    → « Tu travailles sur rendez-vous ? »
//   détail      → « Tu tiens une boutique ? »
//
// Et pour une tournée ciblée, on TAPE le métier dans l'atelier avant
// d'imprimer : « Tu tiens une poissonnerie ? ». « On n'a jamais tous les
// métiers » : une liste figée en oublierait toujours un, la saisie libre non.
//
// ⚠️ POURQUOI ICI ET PAS DANS LA PAGE : c'est ce qui s'imprime en gros en haut
// d'un papier qui ne se corrige plus. `verif:kit` exécute cette fonction.
// ════════════════════════════════════════════════════════════════════

// Au-delà, la pastille passe sur deux lignes et pousse le titre : la jauge le
// verrait, mais autant ne pas laisser taper un roman.
export const METIER_LIBRE_MAX = 40

// Rend `{ verbe, pastille }`. Sans métier tapé (ou fait d'espaces), c'est la
// pastille généraliste du segment qui reste : jamais une pastille vide.
export function accrocheKit(accroche, metierLibre) {
  const libre = String(metierLibre ?? '').replace(/\s+/g, ' ').trim().slice(0, METIER_LIBRE_MAX).trim()
  if (libre) return { verbe: 'Tu tiens', pastille: libre }
  return { verbe: accroche.verbe, pastille: accroche.pastille }
}
