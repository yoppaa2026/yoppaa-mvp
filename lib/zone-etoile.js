// LA ZONE DE LIVRAISON EN ÉTOILE (décidée par Alex le 25/09, précisée le 05/10).
//
// POURQUOI UNE ÉTOILE. La pizzeria de Biesme compte en MINUTES de route, pas en
// kilomètres : Châtelet est proche, mais le bout de Châtelet, de l'autre côté
// de la Sambre, lui coûte quinze minutes. Aucun cercle ne le dit. Elle dessine
// donc sa zone : douze poignées autour de son commerce, une tous les 30°,
// chacune tirée à la distance qu'elle accepte dans cette direction.
//
// Ce que la zone stocke : 12 distances en MÈTRES (`livraison_config.zone_rayons_m`),
// la première vers le nord, puis dans le sens des aiguilles d'une montre. Le
// centre est la position de la fiche (`commercants.latitude/longitude`) : la
// zone suit le commerce s'il déménage, et elle est toujours valide (impossible
// à croiser avec elle-même).
//
// Entre deux poignées, la limite varie RÉGULIÈREMENT avec l'angle. La carte du
// tableau de bord trace la même fonction, point par point : ce que le
// commerçant voit est exactement ce que le serveur applique.
//
// Décisions d'Alex (05/10) : l'étoile REMPLACE la liste de codes postaux pour
// le commerce qui la dessine ; départ = un cercle de 5 km ; poignées plafonnées
// à 30 km.
//
// Tout est PUR : des nombres entrent, une décision sort. L'écran informe (la
// fiche client), le serveur décide (`create-commande`).

import { lieuPrincipal } from './lieux-activite.js'

export const NB_POIGNEES = 12
export const PAS_DEGRES = 360 / NB_POIGNEES
export const RAYON_DEFAUT_M = 5000
export const RAYON_MIN_M = 300
export const RAYON_MAX_M = 30000

const RAYON_TERRE_M = 6371008.8
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

/** Distance à vol d'oiseau entre deux points, en mètres (haversine). */
export function distanceMetres(a, b) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RAYON_TERRE_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** La direction de `b` vue depuis `a`, en degrés : 0 = nord, 90 = est. */
export function capDegres(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** Le point situé à `metres` de `a`, dans la direction `cap`. Sert à dessiner. */
export function pointA(a, cap, metres) {
  const d = metres / RAYON_TERRE_M
  const c = rad(cap)
  const lat1 = rad(a.lat)
  const lng1 = rad(a.lng)
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(c))
  const lng2 = lng1 + Math.atan2(Math.sin(c) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 }
}

/**
 * Une zone utilisable : exactement 12 distances entières, chacune entre le
 * minimum et le maximum. Tout le reste vaut « pas d'étoile », et le commerce
 * retombe sur ses codes postaux. Même règle que la contrainte en base.
 */
export function zoneValide(rayons) {
  return Array.isArray(rayons)
    && rayons.length === NB_POIGNEES
    && rayons.every(r => Number.isInteger(r) && r >= RAYON_MIN_M && r <= RAYON_MAX_M)
}

/** Un centre utilisable : deux nombres, en Belgique (même encadrement que l'import). */
export function centreValide(c) {
  const lat = Number(c?.lat)
  const lng = Number(c?.lng)
  return lat >= 49.4 && lat <= 51.6 && lng >= 2.5 && lng <= 6.5
}

/**
 * LE POINT DE DÉPART DES LIVRAISONS, centre de l'étoile : le lieu PERMANENT
 * principal de « Où me trouver », celui d'où part déjà la tournée (Alex,
 * 15/08), et RIEN D'AUTRE.
 *
 * 🔴 PLUS DE REPLI SUR LA FICHE (Alex, 05/10 au soir : « celle de
 * l'inscription ne sert pas à localiser le commerce, jamais »). La position de
 * la fiche vient de l'adresse saisie à l'inscription, souvent le domicile :
 * l'étoile se serait centrée chez le commerçant, pas à son commerce. Sans lieu
 * permanent situé, il n'y a donc PAS de centre : l'écran bloque le dessin et
 * le serveur refuse la livraison (`zone_indisponible`).
 *
 * @param {{ lieux?: Array }} p `lieux` : les lignes de `commercant_lieux`
 *        (type, principal, actif, latitude, longitude, adresse).
 * @returns {{ lat, lng, adresse } | null}
 */
export function centreDeLaZone({ lieux = [] } = {}) {
  // La MÊME règle que la tournée et les plages : `lieuPrincipal`, jamais recopiée.
  const lieu = lieuPrincipal({ lieux })
  if (lieu && centreValide({ lat: lieu.latitude, lng: lieu.longitude })) {
    return { lat: Number(lieu.latitude), lng: Number(lieu.longitude), adresse: lieu.adresse || '' }
  }
  return null
}

/** La limite de la zone dans une direction donnée, en mètres. */
export function limiteDansDirection(rayons, cap) {
  const c = ((Number(cap) % 360) + 360) % 360
  const i = Math.floor(c / PAS_DEGRES) % NB_POIGNEES
  const j = (i + 1) % NB_POIGNEES
  const t = (c - i * PAS_DEGRES) / PAS_DEGRES
  return rayons[i] + (rayons[j] - rayons[i]) * t
}

/**
 * LA DÉCISION. `{ dedans, distance_m, limite_m }`, ou `null` si la zone ou le
 * centre ne sont pas utilisables : l'appelant ne doit JAMAIS lire `null` comme
 * « dedans ».
 */
export function dansEtoile({ centre, rayons, point }) {
  if (!zoneValide(rayons) || !centreValide(centre) || !centreValide(point)) return null
  const a = { lat: Number(centre.lat), lng: Number(centre.lng) }
  const b = { lat: Number(point.lat), lng: Number(point.lng) }
  const distance = distanceMetres(a, b)
  const limite = limiteDansDirection(rayons, capDegres(a, b))
  return { dedans: distance <= limite, distance_m: Math.round(distance), limite_m: Math.round(limite) }
}

/** Le contour à tracer sur la carte : un point tous les `pas` degrés. */
export function contourEtoile(centre, rayons, pas = 3) {
  const points = []
  for (let cap = 0; cap < 360; cap += pas) points.push(pointA(centre, cap, limiteDansDirection(rayons, cap)))
  return points
}

/** Les 12 distances de départ : un cercle. */
export function cercle(rayon = RAYON_DEFAUT_M) {
  const r = Math.round(Math.min(RAYON_MAX_M, Math.max(RAYON_MIN_M, Number(rayon) || RAYON_DEFAUT_M)))
  return Array(NB_POIGNEES).fill(r)
}

/** « 8,2 km », à la belge. */
export function libelleKm(metres) {
  const km = Math.round(Number(metres) / 100) / 10
  return `${km.toLocaleString('fr-BE', { minimumFractionDigits: km < 10 ? 1 : 0, maximumFractionDigits: 1 })} km`
}

/**
 * Le refus, en clair : la distance, la limite, et l'issue. Jamais « zone non
 * desservie », qui ne dit ni de combien ni quoi faire (décision du 25/09).
 */
export function phraseHorsZone({ distance_m, limite_m }) {
  return `Tu es à ${libelleKm(distance_m)} du commerce, et il livre jusqu'à ${libelleKm(limite_m)} dans ta direction. Tu peux choisir le retrait.`
}
