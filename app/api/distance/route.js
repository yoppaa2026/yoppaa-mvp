// POST /api/distance
//
// Proxy serveur vers OpenRouteService (matrix driving-car). L'appel était fait
// depuis le navigateur (commander/page.js), ce qui provoquait :
//   - une erreur CORS (ORS ne renvoie pas Access-Control-Allow-Origin, son API
//     est prévue pour du serveur-à-serveur), donc un 403 systématique,
//   - l'exposition de la clé API en clair côté client (NEXT_PUBLIC_ORS_API_KEY).
//
// En passant par une route serveur : plus de CORS (requête same-origin), et la
// clé reste côté serveur.
//
// Clé lue depuis ORS_API_KEY en priorité, avec repli sur NEXT_PUBLIC_ORS_API_KEY
// pour ne pas casser tant que la variable Vercel n'est pas renommée (à faire pour
// retirer la clé du bundle client).
//
// Body : { locations: [[lng, lat], ...] }  (origine en premier, puis destinations)
// Réponse : { ok: true, distances: number[][] }  (matrice ORS, mètres)

import { NextResponse } from 'next/server'

const ORS_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car'

export async function POST(req) {
  const apiKey = process.env.ORS_API_KEY || process.env.NEXT_PUBLIC_ORS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'ORS_API_KEY non configurée' }, { status: 500 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'body JSON requis' }, { status: 400 })
  }

  const { locations } = body || {}
  if (!Array.isArray(locations) || locations.length < 2) {
    return NextResponse.json({ ok: false, error: 'locations (>= 2) requis' }, { status: 400 })
  }

  try {
    const res = await fetch(ORS_URL, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ locations, metrics: ['distance'], units: 'm' }),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error('[api/distance] ORS erreur', { status: res.status, txt: txt.slice(0, 300) })
      return NextResponse.json({ ok: false, error: `ORS HTTP ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, distances: data.distances })
  } catch (e) {
    console.error('[api/distance] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 502 })
  }
}
