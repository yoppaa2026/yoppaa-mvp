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

export const COULEUR_ANTI_GASPI = '#B45309'
export const FOND_ANTI_GASPI = '#FFFBEB'
export const BORD_ANTI_GASPI = '#FCD34D'

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
