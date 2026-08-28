// Un raccourci vers quelque chose qui est déjà à l'écran n'est plus un
// raccourci.
//
// ⚠️ ALEX, 28/08 : « le bouton "Voir ma commande" permet de descendre jusqu'en
// bas, est-ce qu'il ne devrait pas disparaître une fois que le bouton recherché
// est visible ? Sinon ça fait un peu doublon. »
//
// Il a raison sur trois plans, et le troisième est le plus coûteux :
//   1. sa RAISON D'ÊTRE s'éteint. Il existe depuis le 16/07 parce que « le
//      récap panier est en bas de la page, peu découvrable sur mobile ». Une
//      fois le récap à l'écran, il n'a plus rien à faire découvrir ;
//   2. il CACHE. En position fixe, il mange le bas de l'écran au moment précis
//      où le client lit son panier et décide ;
//   3. DEUX BOUTONS VIOLETS À TROIS CENTIMÈTRES FONT HÉSITER. « Voir ma
//      commande » et « Continuer : retrait ou expédition » ne font pas la même
//      chose, et rien ne le dit. Le flottant devient un pas en arrière alors
//      que l'autre avance.
//
// ⚠️ LE VRAI RISQUE N'EST PAS DE LE CACHER, C'EST QU'IL CLIGNOTE. À la
// frontière exacte, un doigt qui bouge d'un millimètre le ferait apparaître et
// disparaître en boucle. D'où DEUX seuils et non un seul : il s'efface quand la
// cible est FRANCHEMENT visible, il ne revient que quand elle est FRANCHEMENT
// sortie. Entre les deux, on ne change rien.
//
// ⚠️ ET SURTOUT PAS UN ÉCOUTEUR DE DÉFILEMENT. C'est la leçon de la zone morte
// au doigt (3 jours perdus en août) : sur iOS, tout ce qui se greffe sur le
// scroll finit par le gêner. `IntersectionObserver` observe sans écouter.

// Les deux seuils, en proportion de la cible visible.
export const SEUIL_CACHER = 0.35   // franchement visible → on s'efface
export const SEUIL_MONTRER = 0.05  // franchement sortie  → on revient

// La décision, pure et donc mesurable : faut-il montrer le bouton ?
//
// `visible` est la proportion de la cible actuellement à l'écran (0 à 1), et
// `montreAvant` ce que le bouton faisait juste avant. C'est ce second argument
// qui crée l'hystérésis : sans lui, un seul seuil suffirait, et il clignoterait.
export function doitMontrerFlottant(visible, montreAvant = true) {
  // ⚠️ LE PIÈGE DU ZÉRO, SIXIÈME FOIS DANS CE PROJET, et c'est mon propre banc
  // qui l'a attrapé. `Number(null)` vaut 0 et EST fini : un ratio absent
  // passait donc pour « cible complètement sortie » et faisait réapparaître le
  // bouton d'autorité, au lieu de laisser l'affichage tranquille.
  if (visible === null || visible === undefined || visible === '') return montreAvant
  const v = Number(visible)
  if (!Number.isFinite(v)) return montreAvant
  if (v >= SEUIL_CACHER) return false
  if (v <= SEUIL_MONTRER) return true
  return montreAvant
}
