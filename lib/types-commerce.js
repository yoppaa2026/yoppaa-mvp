// Source unique des types de commerce par catégorie (signup, dashboard
// commerçant, admin, bandeau accueil). Décisions Alex 23/07 :
//   - listes étendues au commerce de proximité belge (santé exclue V1)
//   - double métier natif : 2 types max, stockés "Boulangerie & Pâtisserie"
//   - type hors liste : champ libre « Autre… », normalisable à la validation KYB
//
// ⚠️ Libellés SANS « & », « / » ni « , » : parseTypes côté app découpe sur ces
// caractères pour lire les doubles métiers. Tiret et parenthèses autorisés.

export const MAX_TYPES_COMMERCE = 2

export const TYPES_ALIMENTAIRE = [
  'Boulangerie', 'Pâtisserie', 'Chocolatier', 'Glacier', 'Sandwicherie',
  'Snack', 'Friterie', 'Pizzeria', 'Restaurant', 'Bar - café', 'Traiteur',
  'Coffee shop', 'Épicerie - supérette', 'Boucherie', 'Poissonnerie',
  'Fromagerie', 'Primeur (fruits et légumes)', 'Caviste', 'Brasserie artisanale',
  'Torréfacteur', 'Ferme - producteur local', 'Food truck',
  'Station-service (shop)', 'Distributeur automatique',
]

// Services = catégorie 'vitrine' en base (RDV)
export const TYPES_SERVICE = [
  'Coiffeur', 'Barbier', 'Esthéticienne', 'Institut de beauté', 'Onglerie',
  'Massage - bien-être', 'Tatoueur', 'Opticien', 'Pharmacie',
  'Pressing - retouches', 'Cordonnier', 'Garagiste', 'Carwash',
  'Réparation vélos', 'Toiletteur', 'Studio photo', 'Salle de sport',
  // ⚠️ AJOUTÉ LE 15/08. Une professeure de yoga ne trouvait pas son métier :
  // le plus proche était « Cours - coaching », qui ne dit rien d'elle et dont
  // le logo provisoire proposait un HALTÈRE. Le yoga et le pilates sont des
  // commerces de proximité très courants en Belgique, ils méritent leur ligne.
  'Yoga - pilates',
  'Coach sportif', 'Cours - coaching', 'Auto-école',
]

export const TYPES_DETAIL = [
  'Vêtements', 'Chaussures', 'Bijouterie', 'Maroquinerie', 'Fleuriste',
  'Librairie - papeterie', 'Décoration - maison', 'Meubles', 'Électroménager',
  'Informatique - téléphonie', 'Sport - équipement', 'Vélos (vente)', 'Jouets',
  'Loisirs créatifs', 'Animalerie', 'Jardinerie', 'Bricolage - quincaillerie',
  'Puériculture', 'Seconde main - dépôt-vente', 'Cadeaux - artisanat',
]

export function typesPourCategorie(categorie) {
  if (categorie === 'vitrine') return TYPES_SERVICE
  if (categorie === 'detail') return TYPES_DETAIL
  return TYPES_ALIMENTAIRE
}

export const TOUS_TYPES = [...TYPES_ALIMENTAIRE, ...TYPES_SERVICE, ...TYPES_DETAIL]

// "Boulangerie & Pâtisserie" ⇄ ['Boulangerie', 'Pâtisserie']
// (même découpage que parseTypes côté app/commander)
export function splitTypes(type) {
  if (!type) return []
  return String(type).split(/\s*[&\/,]\s*/).map(t => t.trim()).filter(Boolean)
}

export function joinTypes(types) {
  return (types || []).map(t => String(t || '').trim()).filter(Boolean).slice(0, MAX_TYPES_COMMERCE).join(' & ')
}

// Un type libre ne doit pas contenir de séparateur (sinon il serait relu
// comme deux métiers par parseTypes).
export function nettoyerTypeLibre(val) {
  return String(val || '').replace(/[&\/,]/g, '-').replace(/\s+/g, ' ').trimStart()
}

// ─── EST-CE UN FOOD TRUCK ? ────────────────────────────────────────────────
//
// ⚠️ CETTE QUESTION ÉTAIT POSÉE DE TROIS FAÇONS DIFFÉRENTES, et elles ne
// répondaient pas la même chose. La fiche client et le tableau de bord
// exigeaient l'espace exact de « food truck » ; le guide photos, lui, acceptait
// « foodtruck » et « food-truck ».
//
// Le type n'est PAS toujours une valeur de la liste : le commerçant peut saisir
// un métier libre (« Autre… »), et deux métiers cohabitent dans un même champ
// (« Snack & Food truck »). Un patron qui tapait « Foodtruck » se voyait donc
// proposer les conseils photo de son métier, mais restait privé de l'onglet
// Emplacements, et sa fiche affichait l'adresse de son DÉPÔT au lieu du marché
// où il se trouvait ce jour-là. Le client se déplaçait au mauvais endroit.
//
// Une seule fonction, la plus tolérante des trois.
export function estFoodTruck(type) {
  return /food.?truck/i.test(String(type || ''))
}
