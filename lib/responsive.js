// Les seuils d'affichage de Yoppaa, en un seul endroit.
//
// POURQUOI UN FICHIER POUR TROIS NOMBRES. Le chantier bureau se fait en trois
// temps, et il s'étalera sur des semaines. Sans un endroit unique, le seuil
// finira écrit à la main dans quinze feuilles de style, avec trois valeurs
// différentes selon le jour où le morceau a été écrit. C'est exactement ce qui
// est arrivé aux deux fiches commerçant, qui ont divergé jusqu'à ce qu'une
// d'elles perde ses photos.
//
// ⚠️ LA RÈGLE QUI GOUVERNE TOUT LE CHANTIER : l'application est née mobile et
// le reste. Le bureau s'AJOUTE par-dessus, uniquement en `min-width`, et ne
// réécrit jamais le rendu du téléphone.
//
// Ce n'est pas une préférence esthétique, c'est une contrainte de production.
// Apple refuse les PWA emballées (règle 4.2) : il y aura un shell natif, et ce
// shell affichera la branche mobile. Google Play de même. La branche mobile
// est donc la version canonique, celle qui part dans les stores. Si le bureau
// la modifiait, chaque fonctionnalité future devrait être écrite deux fois, et
// chaque correctif appliqué deux fois.
//
// Corollaire pratique : PAS de `isBureau ? <VersionPC/> : <VersionMobile/>` en
// JavaScript. Une media query, et une seule branche de code.

// En dessous, on est sur un téléphone ou une petite tablette : le rendu ne
// change pas d'un pixel par rapport à ce qui existait avant le chantier.
export const SEUIL_BUREAU = 1024

// Phase 2 : la colonne s'élargit et la navigation remonte en haut.
export const SEUIL_LARGE = 1280

// La largeur maximale du contenu.
//
// 760 px est une largeur de téléphone tenue à bout de bras : sur un écran de
// 1920 elle occupait 40 % de la surface. Au-delà du seuil bureau, la colonne
// passe à 1200 px, assez pour trois cartes de commerce côte à côte sans
// qu'aucune paraisse vide.
export const LARGEUR_CONTENU = 760
export const LARGEUR_CONTENU_BUREAU = 1200

// Un champ de saisie ne doit jamais s'étirer sur toute la largeur d'un écran
// de bureau. Au-delà d'environ 560 px, l'œil perd le début de la ligne en
// arrivant à la fin, et un champ « Nom du commerce » de 1 600 px de large pour
// vingt caractères donne l'impression d'un formulaire cassé.
export const LARGEUR_CHAMP = 560
export const LARGEUR_TEXTE_LONG = 760

// ─── LES FLÈCHES DE DÉFILEMENT ─────────────────────────────────────────────
//
// ⚠️ LE PROBLÈME NE SE VOIT QUE SUR PC. Le tableau de bord est né sur
// téléphone : ses barres d'onglets, ses jours, ses filtres et ses raccourcis
// défilent au doigt et masquent leur barre pour rester propres. À la souris, il
// ne restait NI barre, NI flèche, NI le moindre indice qu'il y avait huit
// onglets de plus à droite. Le commerçant ne les trouvait pas.
//
// La décision « reste-t-il quelque chose de ce côté ? » vit ici, en fonction
// pure, plutôt que noyée dans le composant : c'est elle qui allume ou éteint
// une flèche, et une flèche éteinte au mauvais moment cache du contenu.

// ⚠️ UN PIXEL DE TOLÉRANCE, ET IL EST INDISPENSABLE. Les navigateurs rendent
// des largeurs fractionnaires : arrivé au bout, `scrollWidth - clientWidth -
// scrollLeft` ne vaut pas 0 mais 0,4 px. Sans tolérance, la flèche droite
// resterait allumée en permanence sur une bande entièrement visible, et le
// commerçant cliquerait sur une flèche qui ne fait rien.
export const TOLERANCE_DEFILEMENT = 1

export function bordsDefilement({ scrollLeft = 0, scrollWidth = 0, clientWidth = 0 } = {}) {
  const restant = scrollWidth - clientWidth - scrollLeft
  return {
    gauche: scrollLeft > TOLERANCE_DEFILEMENT,
    droite: restant > TOLERANCE_DEFILEMENT,
  }
}

// 70 % de la largeur visible : on avance franchement sans jamais sauter
// par-dessus un élément, ce qui donnerait l'impression d'en perdre au passage.
// Le plancher de 160 px évite l'immobilité sur une bande étroite.
export const PAS_MINIMUM = 160
export function pasDefilement(clientWidth = 0, pasImpose) {
  if (Number.isFinite(pasImpose) && pasImpose > 0) return pasImpose
  return Math.max(PAS_MINIMUM, (Number(clientWidth) || 0) * 0.7)
}

// ─── LE NOM DANS LE BANDEAU DE FICHE ───────────────────────────────────────
// ⚠️ DÉFAUT VU PAR ALEX LE 15/08, capture à l'appui : « Centre Respire - Yoga
// et Pilates » débordait du bandeau, le mot « Pilates » coupé net par le bas,
// et la signature en points passée sous la ligne de flottaison. Or c'est elle
// qui fait qu'on reconnaît une fiche Yoppaa avant même de lire.
//
// Deux causes qui s'additionnaient, et la première est la vraie :
//
//   1. L'APERÇU DU SIGNUP HÉRITAIT DES MESURES DU VRAI BANDEAU. Au-delà de
//      1024 px, `globals.css` impose 2,6 rem et 84 px de retrait, taillés pour
//      un hero de 360 px. L'aperçu, lui, fait 150 px. Aucun nom, même court,
//      ne pouvait tenir : 84 + 50 + 21 dépassent déjà les 150. Une miniature
//      n'est pas une petite version du grand écran, c'est un autre objet.
//
//   2. AUCUNE ADAPTATION À LA LONGUEUR DU NOM. « Chez Nini » et « Centre
//      Respire - Yoga et Pilates » recevaient la même taille de police.
//
// L'échelle ci-dessous traite la seconde. Elle est volontairement grossière :
// quatre paliers valent mieux qu'une formule continue, parce qu'un commerçant
// qui ajoute un mot ne doit pas voir toute sa bannière frémir.
export const PALIERS_NOM_BANNIERE = [
  { jusqua: 20, echelle: 1 },
  { jusqua: 30, echelle: 0.82 },
  { jusqua: 42, echelle: 0.68 },
]
export const ECHELLE_NOM_MINIMALE = 0.56

export function echelleNomBanniere(nom) {
  const longueur = String(nom || '').trim().length
  // ⚠️ Un nom vide n'est pas un nom très long : sans ce cas, la chaîne vide
  // tomberait sur le premier palier par hasard plutôt que par décision.
  if (longueur === 0) return 1
  for (const palier of PALIERS_NOM_BANNIERE) {
    if (longueur <= palier.jusqua) return palier.echelle
  }
  return ECHELLE_NOM_MINIMALE
}
