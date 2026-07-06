// POST /api/livraison/tournee-optimisee
//
// Calcule l'ordre de passage optimal d'une tournée de livraison pour un commerçant,
// et renvoie un lien d'itinéraire (Google Maps) dans cet ordre.
//
// Point de départ = adresse du commerçant (géocodée au vol via Nominatim).
// Arrêts = commandes livraison passées en body, avec leurs coords (livraison_lat/lng
// déjà géocodées à la commande). Les commandes sans coords sont ignorées et listées.
//
// Optimisation :
//   • Si ORS_API_KEY est présent → OpenRouteService Optimization (VROOM), vraie
//     optimisation de tournée (distances routières).
//   • Sinon → heuristique plus-proche-voisin (Haversine) depuis le commerçant.
//     Toujours fonctionnel en prod sans clé ; qualité correcte pour < ~15 arrêts.
//
// Body : { commande_ids: UUID[] }
// Réponse : { ok, ordre: [{commande_id, numero, adresse, position}], itineraire_url,
//             depart, sans_coords: [{commande_id, numero}], methode }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { geocoderAdresse } from '@/lib/geocode'

const ORS_OPTIM = 'https://api.openrouteservice.org/optimization'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Distance à vol d'oiseau (km) entre deux points {lat,lng}.
function haversineKm(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Ordonne les arrêts par plus-proche-voisin depuis le départ. Renvoie la liste
// des arrêts réordonnés.
function ordreePlusProcheVoisin(depart, arrets) {
  const reste = [...arrets]
  const ordre = []
  let courant = depart
  while (reste.length) {
    let idxMin = 0
    let dMin = Infinity
    for (let i = 0; i < reste.length; i++) {
      const d = haversineKm(courant, reste[i])
      if (d < dMin) { dMin = d; idxMin = i }
    }
    courant = reste[idxMin]
    ordre.push(reste.splice(idxMin, 1)[0])
  }
  return ordre
}

// Optimisation via ORS (VROOM). Renvoie la liste d'arrêts réordonnée, ou null si
// indisponible/erreur (l'appelant retombe sur le plus-proche-voisin).
async function ordreeORS(depart, arrets, apiKey) {
  try {
    const jobs = arrets.map((a, i) => ({ id: i, location: [a.lng, a.lat] }))
    const vehicles = [{ id: 1, profile: 'driving-car', start: [depart.lng, depart.lat] }]
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    let res
    try {
      res = await fetch(ORS_OPTIM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': apiKey },
        body: JSON.stringify({ jobs, vehicles }),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) { console.warn('[tournee] ORS HTTP', res.status); return null }
    const data = await res.json()
    const steps = data?.routes?.[0]?.steps || []
    const ordreIdx = steps.filter(s => s.type === 'job').map(s => s.id)
    if (ordreIdx.length !== arrets.length) return null
    return ordreIdx.map(i => arrets[i])
  } catch (e) {
    console.warn('[tournee] ORS exception', e?.message)
    return null
  }
}

// Construit l'URL Google Maps directions (départ commerçant → arrêts dans l'ordre).
function urlItineraire(depart, ordre) {
  const pt = p => `${p.lat},${p.lng}`
  const origin = pt(depart)
  const destination = pt(ordre[ordre.length - 1])
  const waypoints = ordre.slice(0, -1).map(pt).join('|')
  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`
  if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`
  return url
}

export async function POST(request) {
  try {
    const { commande_ids } = await request.json()
    if (!Array.isArray(commande_ids) || commande_ids.length === 0) {
      return NextResponse.json({ ok: false, error: 'commande_ids requis' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: commandes, error } = await supabase
      .from('commandes')
      .select('id, numero_commande, adresse_livraison, livraison_lat, livraison_lng, mode_retrait, commercant:commercants(id, nom, adresse)')
      .in('id', commande_ids)
      .eq('mode_retrait', 'livraison')

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    if (!commandes || commandes.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucune commande livraison trouvée' }, { status: 404 })
    }

    // Sépare les commandes géocodées de celles sans coords (ignorées de la tournée).
    const avecCoords = []
    const sansCoords = []
    for (const c of commandes) {
      if (typeof c.livraison_lat === 'number' && typeof c.livraison_lng === 'number') {
        avecCoords.push({ commande_id: c.id, numero: c.numero_commande, adresse: c.adresse_livraison, lat: c.livraison_lat, lng: c.livraison_lng })
      } else {
        sansCoords.push({ commande_id: c.id, numero: c.numero_commande, adresse: c.adresse_livraison })
      }
    }

    if (avecCoords.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucune adresse géolocalisée dans cette tournée', sans_coords: sansCoords }, { status: 422 })
    }

    // Point de départ = commerçant, géocodé au vol depuis son adresse.
    const commercant = commandes[0].commercant
    const depart = await geocoderAdresse(commercant?.adresse)
    if (!depart) {
      return NextResponse.json({ ok: false, error: 'Adresse du commerçant non géolocalisable (vérifie l’adresse dans Profil)' }, { status: 422 })
    }

    // Optimisation : ORS si clé dispo, sinon plus-proche-voisin.
    const apiKey = process.env.ORS_API_KEY
    let ordreArrets = null
    let methode = 'plus_proche_voisin'
    if (apiKey && avecCoords.length > 1) {
      const ors = await ordreeORS(depart, avecCoords, apiKey)
      if (ors) { ordreArrets = ors; methode = 'ors' }
    }
    if (!ordreArrets) ordreArrets = ordreePlusProcheVoisin(depart, avecCoords)

    const ordre = ordreArrets.map((a, i) => ({
      commande_id: a.commande_id,
      numero: a.numero,
      adresse: a.adresse,
      position: i + 1,
    }))

    return NextResponse.json({
      ok: true,
      methode,
      depart: { nom: commercant?.nom, adresse: commercant?.adresse },
      ordre,
      itineraire_url: urlItineraire(depart, ordreArrets),
      sans_coords: sansCoords,
    })

  } catch (e) {
    console.error('[tournee-optimisee] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
