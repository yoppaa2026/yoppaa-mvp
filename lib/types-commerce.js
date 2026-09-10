// Source unique des types de commerce par catégorie (signup, dashboard
// commerçant, admin, bandeau accueil). Décisions Alex 23/07 :
//   - listes étendues au commerce de proximité belge (santé exclue V1)
//   - double métier natif : 2 types max, stockés "Boulangerie & Pâtisserie"
//   - type hors liste : champ libre « Autre… », normalisable à la validation KYB
//
// ⚠️ Libellés SANS « & », « / » ni « , » : parseTypes côté app découpe sur ces
// caractères pour lire les doubles métiers. Tiret et parenthèses autorisés.

// ⚠️ AVEC SON EXTENSION, comme `recherche-commune` : ce fichier est aussi lu par
// des bancs, et un import sans extension ne se résout pas hors de Next.
import { sansAccents } from './texte-normalise.js'

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

// ─── LA CARTE, OU LES PRODUITS (décision d'Alex, 10/09 au soir) ─────────────
//
// L'étape de commande s'appelait « Menu » chez TOUT commerce alimentaire,
// pendant que la fiche d'un restaurant disait « la carte est juste en
// dessous ». En Belgique, le menu, c'est souvent la formule du jour ; la carte,
// c'est la liste des plats. Et chez un boulanger ou un boucher, ni l'un ni
// l'autre ne va : on y achète des produits.
//
// ⚠️ LES MÉTIERS QUI SERVENT À MANGER, et seulement eux. La liste est celle
// qu'Alex a validée, prise dans `TYPES_ALIMENTAIRE` : un libellé qui s'y écarte
// d'une lettre ne compterait plus, d'où la garde du banc.
export const TYPES_QUI_SERVENT_A_MANGER = [
  'Restaurant', 'Snack', 'Friterie', 'Pizzeria', 'Bar - café', 'Traiteur',
  'Sandwicherie', 'Coffee shop', 'Food truck',
]

// ⚠️ ET LE TYPE N'EST PAS TOUJOURS UNE VALEUR DE LA LISTE (voir juste au-dessus) :
// un restaurant qui a tapé « Brasserie » ou « Taverne » dans « Autre… » sert à
// manger lui aussi. On compare des MOTS entiers, sans accents : « Barbier » ne
// contient pas le mot « bar », et « café » s'écrit souvent sans accent.
const MOTS_QUI_SERVENT_A_MANGER = new Set([
  'restaurant', 'resto', 'brasserie', 'taverne', 'bistro', 'bistrot',
  'friterie', 'friture', 'fritkot', 'snack', 'pizzeria', 'pizza', 'traiteur',
  'sandwicherie', 'sandwich', 'sandwichs', 'bar', 'cafe', 'coffee',
])

export function sertAManger(type) {
  return splitTypes(type).some(t => {
    if (TYPES_QUI_SERVENT_A_MANGER.includes(t) || estFoodTruck(t)) return true
    const mots = sansAccents(t).split(/[^a-z]+/).filter(Boolean)
    // Une brasserie ARTISANALE brasse de la bière, elle ne sert pas à table.
    if (mots.includes('brasserie') && mots.includes('artisanale')) return false
    return mots.some(m => MOTS_QUI_SERVENT_A_MANGER.has(m))
  })
}

// Le nom de ce qu'un commerce ALIMENTAIRE propose à la commande. Le détail et
// les services gardent leurs propres mots (« Catalogue », « Boutique ») : ce
// n'est pas cette fonction qui les décide.
export function nomDeLaCarte(commercant) {
  return sertAManger(commercant?.type) ? 'La carte' : 'Produits'
}
