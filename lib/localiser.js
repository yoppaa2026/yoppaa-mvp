// SITUER LE YOPPER SANS NOMINATIM (06/10).
//
// 🔴 POURQUOI (Alex, 05-06/10 : « supprimer Nominatim »). Trois appels partaient
// du TÉLÉPHONE du Yopper vers OpenStreetMap : sa position GPS précise (la rue
// de la pastille d'accueil, la commune proposée) et la localité qu'il tape.
// Ils passent sur notre référentiel (BeSt Address) :
//   • la position → la maison la plus proche, par notre serveur
//     (`/api/adresse/proche`), arrondie et jamais gardée ;
//   • le texte tapé → une liste de localités chargée une fois et filtrée ICI,
//     sur l'appareil : ce qu'il tape ne sort pas de son téléphone.
//
// ✅ Alex, 06/10 : hors Wallonie, pas de rue (« Près de toi ») ; le champ tapé
// cherche une localité ou un code postal, plus une rue.
//
// Fichier PUR : aucune base, aucun réseau, exécuté par le banc.

import { normaliserRecherche } from './best-adresse.js'
import { distanceMetres } from './zone-etoile.js'

// Au-delà, la maison « la plus proche » ne dit plus où l'on est : en pleine
// campagne ou hors Wallonie, mieux vaut « Près de toi » qu'une rue fausse.
export const RAYON_PROCHE_M = 150
// Deux passes : d'abord serré (une rue de ville compte des dizaines de
// maisons dans 60 m), puis le rayon complet si rien n'est trouvé.
export const RAYONS_RECHERCHE_M = [60, RAYON_PROCHE_M]
// ~11 m : assez pour trouver la bonne rue, pas assez pour désigner une porte.
export const DECIMALES_POSITION = 4

const M_PAR_DEGRE_LAT = 111320

/** Une position arrondie à ~11 m, ou `null` si elle n'en est pas une. */
export function arrondirPosition(p, decimales = DECIMALES_POSITION) {
  const lat = Number(p?.lat), lng = Number(p?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const f = 10 ** decimales
  return { lat: Math.round(lat * f) / f, lng: Math.round(lng * f) / f }
}

/**
 * La position est-elle en Belgique (au sens large) ? Hors de ce cadre, on ne
 * lit même pas la base : la réponse serait « rien » de toute façon.
 * ⚠️ `0,0` et les valeurs absentes sont refusées (le piège du zéro).
 */
export function positionPlausible(p) {
  const lat = Number(p?.lat), lng = Number(p?.lng)
  if (p?.lat == null || p?.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return lat >= 49.4 && lat <= 51.6 && lng >= 2.5 && lng <= 6.5
}

/** Le rectangle qui contient le cercle de `rayonM` autour du point. */
export function rectangleAutour(p, rayonM) {
  const dLat = rayonM / M_PAR_DEGRE_LAT
  const dLng = rayonM / (M_PAR_DEGRE_LAT * Math.cos((Number(p.lat) * Math.PI) / 180))
  return { latMin: p.lat - dLat, latMax: p.lat + dLat, lngMin: p.lng - dLng, lngMax: p.lng + dLng }
}

/**
 * La maison la plus proche parmi des candidates `{ lat, lng, ... }`, si elle
 * est à `rayonM` au plus. Rend `{ maison, distance_m }` ou `null`.
 */
export function plusProche(p, candidates, rayonM = RAYON_PROCHE_M) {
  let meilleure = null
  for (const c of candidates || []) {
    const d = distanceMetres(p, { lat: Number(c.lat), lng: Number(c.lng) })
    if (!Number.isFinite(d)) continue
    if (!meilleure || d < meilleure.distance_m) meilleure = { maison: c, distance_m: d }
  }
  return meilleure && meilleure.distance_m <= rayonM ? meilleure : null
}

/** Le texte de la pastille d'accueil : « Rue du Mont 9 ». */
export function libellePastille({ rue, numero } = {}) {
  const r = String(rue ?? '').trim()
  if (!r) return null
  const n = String(numero ?? '').trim()
  return n ? `${r} ${n}` : r
}

/**
 * Filtre la liste des localités sur ce que le Yopper tape.
 *
 * ⚠️ « Mettet » ET « 5640 » doivent marcher : c'est ce que la note de revue
 * d'Apple demande de taper au relecteur.
 *   • des chiffres → les localités dont le code postal COMMENCE par eux ;
 *   • des lettres  → nom de la localité OU de sa commune, chaque mot présent,
 *     les débuts de mot d'abord, puis les plus grandes localités.
 * Chaque élément : `{ cp, nom, commune, lat, lng, n }` (n = nombre de maisons).
 */
export function filtrerLocalites(liste, texte, max = 8) {
  const t = String(texte ?? '').trim()
  if (!t) return []
  const items = liste || []
  if (/^\d{1,4}$/.test(t)) {
    return items
      .filter(x => String(x.cp).startsWith(t))
      .sort((a, b) => String(a.cp).localeCompare(String(b.cp)) || (b.n || 0) - (a.n || 0))
      .slice(0, max)
  }
  const mots = normaliserRecherche(t).split(' ').filter(Boolean)
  if (mots.length === 0) return []
  const debutDeMot = (r, m) => (' ' + r).includes(' ' + m)
  const score = (x) => {
    const nom = normaliserRecherche(x.nom)
    const commune = normaliserRecherche(x.commune)
    const texteX = `${nom} ${commune}`
    if (!mots.every(m => texteX.includes(m))) return -1
    let s = 0
    if (nom === mots.join(' ')) s += 100
    s += mots.filter(m => debutDeMot(nom, m)).length * 10
    s += mots.filter(m => debutDeMot(commune, m)).length * 3
    return s
  }
  return items
    .map(x => ({ x, s: score(x) }))
    .filter(e => e.s >= 0)
    .sort((a, b) => b.s - a.s || (b.x.n || 0) - (a.x.n || 0) || String(a.x.nom).localeCompare(String(b.x.nom)))
    .slice(0, max)
    .map(e => e.x)
}
