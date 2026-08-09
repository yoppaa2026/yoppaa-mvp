// Le guide de prise de vue d'une fiche commerçant.
//
// POURQUOI. Un commerçant à qui l'on dit « ajoute des photos » en met une, de
// travers, ou aucune. À qui l'on dit « la première, c'est ta devanture, celle
// qu'on cherche du regard en arrivant », il sait quoi photographier et il le
// fait. La demande d'Alex (05/08) est exactement celle-là : un guide, pas un
// bouton.
//
// L'ordre compte : les photos défilent dans cet ordre sur la fiche, et le
// Yopper regarde rarement plus loin que la troisième.

// Dix places, dix conseils. Les trois premières sont celles qui décident, les
// suivantes enrichissent. On ne réclame jamais les dix : c'est une invitation.
//
// ⚠️ CES CONSEILS SONT LE SOCLE, PAS LE TEXTE FINAL. « Recule-toi, prends
// l'enseigne et la porte » ne veut rien dire pour un food truck, qui n'a ni
// l'une ni l'autre, et « ton produit phare » sonne creux chez un coiffeur. Les
// variantes par métier sont plus bas ; conseilPhoto() choisit la bonne.
export const CONSEILS_PHOTOS = [
  { position: 1,  titre: 'Ton commerce vu de la rue',  aide: 'Celle qu\'on cherche du regard en arrivant. Recule-toi, prends l\'enseigne et la porte.' },
  { position: 2,  titre: 'L\'intérieur',                aide: 'Ce qu\'on voit en poussant la porte. En journée, sans flash, la lumière du jour suffit.' },
  { position: 3,  titre: 'Ce que tu fais de mieux',     aide: 'Ton produit phare, ton plat signature, une coupe réussie. La photo qui donne envie.' },
  { position: 4,  titre: 'Toi, ou ton équipe',          aide: 'Un commerce, ce sont des visages. C\'est ce qui vous distingue d\'une chaîne.' },
  { position: 5,  titre: 'Un autre produit',            aide: 'Montre la variété : ce que les gens ne savent peut-être pas que tu vends.' },
  { position: 6,  titre: 'Un détail qui te ressemble',  aide: 'Une vitrine soignée, un coin lecture, ta machine à café. Ce qui fait ton ambiance.' },
  { position: 7,  titre: 'Le moment fort de ta journée', aide: 'La fournée du matin, le marché, le coup de feu de midi.' },
  { position: 8,  titre: 'Une nouveauté',               aide: 'La dernière collection, la carte de saison, le nouveau service.' },
  { position: 9,  titre: 'Ce qu\'on emporte',           aide: 'Un paquet, un sac, une commande prête. On se projette mieux.' },
  { position: 10, titre: 'Ce que tu veux montrer',      aide: 'Celle-ci est libre. Ta plus belle, tout simplement.' },
]

export const MAX_PHOTOS = 10

// ─── Ce qui change d'un métier à l'autre ────────────────────────────────────
//
// Seules les places où le conseil générique tombe à côté sont réécrites : le
// reste hérite du socle. Mieux vaut trois phrases justes que dix reformulées
// pour le plaisir.
//
// Les clés correspondent à la catégorie du commerce, sauf « foodtruck » qui se
// déduit du type : un camion n'est pas une catégorie en base, c'est un
// alimentaire qui roule, et c'est pourtant le cas où le guide générique est le
// plus faux.
const CONSEILS_PAR_METIER = {
  foodtruck: {
    1: { titre: 'Ton camion, ouvert',        aide: 'Volet levé, sur un emplacement. C\'est ta devanture : c\'est elle qu\'on cherche des yeux sur la place.' },
    2: { titre: 'Le comptoir',               aide: 'Ce qu\'on voit en s\'approchant. La file d\'attente ne fait pas peur, elle rassure.' },
    3: { titre: 'Ta spécialité en main',     aide: 'Le cornet, le burger, la barquette. Tenu, pas posé : on se projette tout de suite.' },
    6: { titre: 'Ton emplacement habituel',  aide: 'La place du marché, le parking, le coin de rue. Ça aide à te situer.' },
  },
  vitrine: {
    1: { titre: 'Ton salon vu de la rue',    aide: 'Recule-toi, prends l\'enseigne et la porte. C\'est ce qu\'on cherche du regard en arrivant.' },
    3: { titre: 'Ton plus beau résultat',    aide: 'Une coupe, un soin, un ongle réussi. Demande son accord à la personne avant de publier.' },
    4: { titre: 'Toi, ou ton équipe',        aide: 'On choisit un salon pour les mains qui travaillent. Un visage vaut dix arguments.' },
    5: { titre: 'Ton poste de travail',      aide: 'Le fauteuil, la cabine, le matériel. Propre et rangé, ça se voit sur une photo.' },
    9: { titre: 'Les produits que tu vends', aide: 'Shampoings, soins, accessoires. Beaucoup ignorent qu\'on peut en acheter chez toi.' },
  },
  detail: {
    3: { titre: 'Ton rayon le plus beau',    aide: 'Celui que tu réarranges toujours en premier. Bien rempli, bien éclairé.' },
    5: { titre: 'Une pièce dont tu es fier', aide: 'Un article seul, en gros plan. C\'est ce qui fait entrer quelqu\'un qui passait devant.' },
    9: { titre: 'Un paquet prêt à emporter', aide: 'Ton emballage, ton sac. Ça dit le soin que tu mets à la fin.' },
  },
  alimentaire: {
    3: { titre: 'Ta spécialité',             aide: 'Ce qu\'on vient chercher chez toi et nulle part ailleurs. En gros plan, à la lumière du jour.' },
    7: { titre: 'La fournée du matin',       aide: 'Le moment où tout sort du four, ou l\'étal au plus plein. Tôt, quand rien n\'est entamé.' },
  },
}

// Le métier d'un commerce, tel que le guide le comprend.
// `type` est le libellé libre saisi par le commerçant (« Food truck », « Snack
// & Food-truck »…), `categorie` la valeur en base.
export function metierPhotos({ categorie, type } = {}) {
  if (/food.?truck/i.test(String(type || ''))) return 'foodtruck'
  if (['vitrine', 'detail', 'alimentaire'].includes(categorie)) return categorie
  return 'generique'
}

// Le conseil pour une place donnée (1 = photo principale), adapté au métier.
export function conseilPhoto(position, commerce = null) {
  const socle = CONSEILS_PHOTOS.find(c => c.position === position)
    || CONSEILS_PHOTOS[CONSEILS_PHOTOS.length - 1]
  const metier = typeof commerce === 'string' ? commerce : metierPhotos(commerce || {})
  const variante = CONSEILS_PAR_METIER[metier]?.[socle.position]
  return variante ? { ...socle, ...variante } : socle
}

// Un mot d'encouragement honnête, calé sur le nombre de photos déjà en ligne.
// Ni culpabilisant à zéro, ni faussement enthousiaste à une seule.
export function etatGalerie(nombre) {
  if (nombre <= 0) return { ton: 'vide', message: 'Une fiche sans photo se regarde deux secondes. Commence par ta devanture.' }
  if (nombre === 1) return { ton: 'debut', message: 'Bien joué. Ajoute l\'intérieur : c\'est la deuxième photo que les gens cherchent.' }
  if (nombre < 4) return { ton: 'route', message: 'Ta fiche prend vie. Trois ou quatre photos, c\'est déjà très bien.' }
  if (nombre < MAX_PHOTOS) return { ton: 'bien', message: 'Belle série. Tu peux t\'arrêter là ou aller jusqu\'à dix.' }
  return { ton: 'complet', message: 'Ta fiche est complète. Remplace une photo quand tu en as une meilleure.' }
}

// Déplace une photo d'un cran. Renvoie une NOUVELLE liste : l'appelant ne doit
// jamais muter son état en place.
//
// Les positions renvoyées sont recalculées de 0 à n-1 : c'est ce qui part en
// base dans la colonne `ordre`. Sans cette renumérotation, deux photos
// pouvaient porter le même ordre et l'affichage devenait imprévisible.
export function deplacerPhoto(photos = [], index, direction) {
  const cible = index + (direction === 'avant' ? -1 : 1)
  if (index < 0 || index >= photos.length) return photos
  if (cible < 0 || cible >= photos.length) return photos
  const suivant = [...photos]
  ;[suivant[index], suivant[cible]] = [suivant[cible], suivant[index]]
  return suivant.map((p, i) => ({ ...p, ordre: i }))
}
