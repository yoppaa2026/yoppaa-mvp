// LA MARQUE DE « RIEN NE SE PERD ».
//
// 🔴 ALEX, 05/09 : « peut-être ajouter une icône qui deviendrait un visuel connu
// anti gaspi Yoppaa ».
//
// LE DESSIN : un cercle presque entier, et le quartier qui manque, posé juste à
// côté. C'est délibérément deux lectures d'un seul trait :
//   • le TEMPS, parce que c'est un cadran auquel il reste un quart d'heure ;
//   • LA PART, parce que c'est une tarte dont il reste une portion.
//
// ⚠️ IL N'Y A PAS DE MAIN, PAS DE CŒUR, PAS DE FEUILLE. L'écologie se dit par
// le geste, pas par le pictogramme : une feuille verte aurait rangé Yoppaa dans
// le rayon des applications qui font la leçon, et Alex n'en veut pas.
//
// ⚠️ UNE SEULE DÉFINITION, ET C'EST LA RAISON D'ÊTRE DE CE FICHIER. Elle est
// destinée à sept endroits de communication en plus des écrans : recopiée, elle
// aurait divergé au premier ajustement, comme le libellé du bon cadeau avant le
// 31/08.
//
// ⚠️ ELLE DOIT TENIR À 16 PIXELS. C'est sa taille sur une pastille de carte, et
// c'est la contrainte qui a écarté les dessins plus riches : à cette taille, un
// cadran avec des aiguilles n'est plus qu'une tache. Le quartier détaché, lui,
// se lit encore parce que c'est une forme pleine sur un contour vide.

// ─── LA PALETTE, ET POURQUOI ELLE A CHANGÉ LE 05/09 ─────────────────────────
//
// 🔴 ALEX A COMPARÉ SIX HABITS, ET EN A CHOISI UN SEPTIÈME.
//
// La carte était crème sur bord paille. Deux reproches, tous les deux justes :
// elle appartenait à la même famille que l'orange du « deal du jour », et elle
// n'attrapait pas l'œil.
//
// Les deux directions qu'il préférait s'opposaient : la NUIT attrape l'œil par
// la masse, le PAPIER par la typographie. C'est en les rendant à QUATRE CARTES,
// la densité réelle de l'accueil, que l'arbitrage est apparu :
//   • quatre cartes sombres FUSIONNENT en un bloc, et les offres cessent de se
//     distinguer entre elles ;
//   • quatre cartes claires se fondent dans la page blanche, c'est-à-dire le
//     reproche du départ.
//
// ✅ « BANDEAU NUIT, CARTES PAPIER ». Le poids va sur le TITRE DE SECTION, une
// seule fois, pas sur chacune des quatre cartes. Une masse sombre attrape l'œil,
// puis les cartes se lisent au calme et restent distinctes.
//
// ⚠️ ET LE VIOLET RESTE LA COULEUR DE LA MAISON. C'était le seul risque de la
// carte entièrement violette : faire du violet la couleur d'une FONCTION alors
// qu'il est celle de la MARQUE. En bandeau, il signe la section sans se
// substituer à elle.
//
// ⚠️ LA MÊME IDÉE SE DÉCLINE À DEUX ÉCHELLES. Sur la fiche du commerçant, la
// carte n'a pas de titre de section au-dessus d'elle : la masse sombre s'y
// réduit à une PASTILLE, celle qui porte « Rien ne se perd ». Sans elle, le
// papier se perdrait sur le fond `#F8F6FF` de la fiche, au milieu d'articles
// blancs.
//
// ⚠️ AUCUN VERT NULLE PART. C'est la couleur de Too Good To Go, et celle de la
// leçon d'écologie. Yoppaa dit l'anti-gaspi par le geste.

/** La marque elle-même : la seule touche chaude, et elle signe la fonction. */
export const COULEUR_ANTI_GASPI = '#B45309'
/** Le papier de la carte. */
export const FOND_ANTI_GASPI = '#FBF8F2'
export const BORD_ANTI_GASPI = '#E6DECF'
/** Le titre de l'offre : l'encre de la maison. */
export const ENCRE_ANTI_GASPI = '#1A0840'
/** Ce qui accompagne sans crier : prix barré, secondaire. */
export const ENCRE_DOUCE_ANTI_GASPI = '#6B5949'
/** Le prix et l'enseigne du commerçant. */
export const ACCENT_ANTI_GASPI = '#6B3FA0'
/** La nuit : le bandeau de section, et la pastille sur la fiche. */
export const NUIT_ANTI_GASPI = '#241058'
/** La marque POSÉE SUR la nuit : l'ambre n'y tiendrait pas le contraste. */
export const OR_ANTI_GASPI = '#FCD34D'

export default function IconeAntiGaspi({ taille = 16, couleur = COULEUR_ANTI_GASPI, epaisseur = 2 }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Les trois quarts qui sont déjà partis : un contour, rien de plein. */}
      <path d="M20 12A8 8 0 1 1 12 4"
        stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round"/>
      {/* Le quartier qui reste, détaché et PLEIN : c'est lui qu'on regarde. */}
      <path d="M13.7 10.3V4.2A6.1 6.1 0 0 1 19.8 10.3Z" fill={couleur}/>
    </svg>
  )
}
