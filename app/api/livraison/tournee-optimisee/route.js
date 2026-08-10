// POST /api/livraison/tournee-optimisee
//
// L'ordre de passage optimal d'UNE tournée, et le lien d'itinéraire à ouvrir
// dans Maps. Une tournée = un CRÉNEAU d'un JOUR (« mardi 18h-19h »), pas
// « toutes les livraisons de la journée » : un commerçant qui livre à midi et
// le soir fait deux tournées, et mélanger les deux donne un itinéraire absurde.
//
// Body : { commercant_id, date, creneau_livraison_id }
// Réponse : { ok, ordre, itineraires: [{url, de, a}], depart, sans_coords, methode }
//
// ⚠️ LA ROUTE CHOISIT ELLE-MÊME LES COMMANDES. Elle ne reçoit AUCUN identifiant
// de commande. C'est délibéré : la version précédente acceptait une liste
// d'identifiants venue du navigateur, sans authentification, et renvoyait pour
// chacun l'ADRESSE DE LIVRAISON. N'importe qui pouvant présenter des
// identifiants obtenait les adresses des clients, y compris en mélangeant
// plusieurs commerçants dans un même appel.
//
// Optimisation :
//   • ORS_API_KEY présent → OpenRouteService Optimization (VROOM), vraie
//     optimisation routière.
//   • Sinon → plus-proche-voisin (Haversine). Toujours fonctionnel, qualité
//     correcte en dessous d'une quinzaine d'arrêts.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { geocoderAdresse } from '@/lib/geocode'
import { STATUTS_OCCUPENT_CRENEAU } from '@/lib/creneaux'

const ORS_OPTIM = 'https://api.openrouteservice.org/optimization'

// ⚠️ GOOGLE MAPS N'ACCEPTE QUE 9 ÉTAPES INTERMÉDIAIRES dans une URL `dir/`.
// Au-delà, il les IGNORE SILENCIEUSEMENT : un commerçant avec quinze
// livraisons croirait avoir son itinéraire complet et en oublierait cinq sur
// la route. On découpe donc en segments de dix arrêts, annoncés comme tels.
const ARRETS_PAR_LIEN = 10

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Même schéma de propriété que l'export comptable, les signaux et les
// statistiques : la colonne s'appelle `auth_user_id`, jamais `user_id`.
async function commercantDuProprietaire(supabase, request, commercantId) {
  const jeton = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!jeton || !commercantId) return null
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${jeton}` } } }
  )
  const { data: { user } = {} } = await authClient.auth.getUser()
  if (!user) return null
  const { data: c } = await supabase
    .from('commercants')
    .select('id, nom, adresse, latitude, longitude, auth_user_id')
    .eq('id', commercantId)
    .maybeSingle()
  if (!c || c.auth_user_id !== user.id) return null
  return c
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

// Ordonne les arrêts par plus-proche-voisin depuis le départ.
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

// Optimisation via ORS (VROOM). Renvoie la liste réordonnée, ou null si
// indisponible : l'appelant retombe alors sur le plus-proche-voisin.
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

// Les liens d'itinéraire, découpés pour tenir dans la limite de Maps.
// Chaque segment repart du dernier arrêt du précédent : la tournée reste
// continue même sur plusieurs liens.
function liensItineraire(depart, ordre) {
  const pt = p => `${p.lat},${p.lng}`
  const liens = []
  let origine = depart
  for (let i = 0; i < ordre.length; i += ARRETS_PAR_LIEN) {
    const segment = ordre.slice(i, i + ARRETS_PAR_LIEN)
    const destination = segment[segment.length - 1]
    const etapes = segment.slice(0, -1).map(pt).join('|')
    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pt(origine))}&destination=${encodeURIComponent(pt(destination))}&travelmode=driving`
    if (etapes) url += `&waypoints=${encodeURIComponent(etapes)}`
    liens.push({
      url,
      de: segment[0].numero,
      a: destination.numero,
      arrets: segment.length,
    })
    origine = destination
  }
  return liens
}

export async function POST(request) {
  try {
    const { commercant_id, date, creneau_livraison_id } = await request.json()
    if (!commercant_id || !date || !creneau_livraison_id) {
      return NextResponse.json({ ok: false, error: 'commercant_id, date et creneau_livraison_id requis' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return NextResponse.json({ ok: false, error: 'Date invalide (format attendu YYYY-MM-DD).' }, { status: 400 })
    }

    const supabase = admin()
    const commercant = await commercantDuProprietaire(supabase, request, commercant_id)
    if (!commercant) {
      return NextResponse.json({ ok: false, error: 'acces_refuse' }, { status: 403 })
    }

    // Les commandes de CE créneau, CE jour, chez CE commerçant. Les statuts
    // retenus sont ceux d'une commande encore à livrer : les livrées et les
    // annulées n'ont rien à faire dans une tournée.
    const { data: commandes, error } = await supabase
      .from('commandes')
      .select('id, numero_commande, adresse_livraison, livraison_lat, livraison_lng')
      .eq('commercant_id', commercant.id)
      .eq('mode_retrait', 'livraison')
      .eq('creneau_livraison_id', creneau_livraison_id)
      .eq('date_commande', date)
      .in('statut', STATUTS_OCCUPENT_CRENEAU)
      .neq('statut_livraison', 'livree')

    if (error) {
      console.error('[tournee] lecture commandes KO', error)
      return NextResponse.json({ ok: false, error: 'Lecture des commandes impossible.' }, { status: 500 })
    }
    if (!commandes || commandes.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucune livraison à faire sur ce créneau.' }, { status: 404 })
    }

    // Les commandes sans coordonnées sont écartées de l'itinéraire, mais
    // ANNONCÉES : le commerçant doit savoir qu'il lui reste ces arrêts à faire
    // à la main, sinon il croit sa tournée complète.
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
      return NextResponse.json({ ok: false, error: 'Aucune adresse géolocalisée dans cette tournée.', sans_coords: sansCoords }, { status: 422 })
    }

    // ⚠️ LE DÉPART VIENT DE LA FICHE, PAS D'UN GÉOCODAGE À CHAQUE CLIC.
    // `commercants.latitude/longitude` existe déjà et sert au calcul des
    // distances sur l'accueil. L'ancienne version interrogeait Nominatim à
    // chaque optimisation : gaspillage, lenteur, et un service public dont la
    // règle d'usage est d'une requête par seconde. Le géocodage ne reste qu'en
    // dernier recours, pour un commerce dont la fiche n'a pas de coordonnées.
    let depart = null
    if (Number.isFinite(Number(commercant.latitude)) && Number.isFinite(Number(commercant.longitude))) {
      depart = { lat: Number(commercant.latitude), lng: Number(commercant.longitude) }
    } else {
      depart = await geocoderAdresse(commercant.adresse)
    }
    if (!depart) {
      return NextResponse.json({ ok: false, error: 'Adresse du commerce non géolocalisable. Vérifie-la dans Profil.' }, { status: 422 })
    }

    const apiKey = process.env.ORS_API_KEY || process.env.NEXT_PUBLIC_ORS_API_KEY
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
      depart: { nom: commercant.nom, adresse: commercant.adresse },
      ordre,
      itineraires: liensItineraire(depart, ordreArrets),
      sans_coords: sansCoords,
    })

  } catch (e) {
    console.error('[tournee-optimisee] exception', e)
    return NextResponse.json({ ok: false, error: 'Optimisation impossible.' }, { status: 500 })
  }
}
