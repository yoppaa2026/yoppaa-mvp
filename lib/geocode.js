// Géocodage forward via Nominatim (OpenStreetMap) : adresse texte -> lat/lng.
//
// SERVER-SIDE uniquement : Nominatim exige un User-Agent identifiant et impose
// une politique d'usage (~1 req/s, pas de bulk). Gratuit, sans clé.
//
// Partagé : livraison (géocode l'adresse de commande pour la tournée optimisée)
// ET foodtrucks (Sprint 5 : géocode une position/adresse ponctuelle).
//
// Limité à la Belgique (countrycodes=be) pour la précision et la conformité
// périmètre Yoppaa.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'Yoppaa/1.0 (https://www.yoppaa.app)'

// Géocode une adresse belge. Retourne { lat, lng } ou null si introuvable/erreur.
// L'appelant doit tolérer null : le géocodage n'est jamais bloquant (une commande
// livraison reste valide même sans coordonnées, la tournée optimisée l'ignorera).
export async function geocoderAdresse(adresse, codePostal, ville) {
  if (!adresse) return null
  const q = [adresse, codePostal, ville, 'Belgique'].filter(Boolean).join(', ')
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=be`
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    const lat = parseFloat(data[0].lat)
    const lng = parseFloat(data[0].lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null
    return { lat, lng }
  } catch (e) {
    console.error('[geocode] erreur', e?.message)
    return null
  }
}
