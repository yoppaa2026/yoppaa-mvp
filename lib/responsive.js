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

// La largeur maximale du contenu. 760 px aujourd'hui, hérité du mobile ; la
// phase 2 la portera à 1200 px au-delà de SEUIL_BUREAU.
export const LARGEUR_CONTENU = 760

// Un champ de saisie ne doit jamais s'étirer sur toute la largeur d'un écran
// de bureau. Au-delà d'environ 560 px, l'œil perd le début de la ligne en
// arrivant à la fin, et un champ « Nom du commerce » de 1 600 px de large pour
// vingt caractères donne l'impression d'un formulaire cassé.
export const LARGEUR_CHAMP = 560
export const LARGEUR_TEXTE_LONG = 760
