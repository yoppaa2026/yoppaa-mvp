// GET /api/adresse/localites → toutes les localités wallonnes (référentiel BeSt)
//
// Remplace l'appel à Nominatim qui partait du téléphone avec le texte tapé par
// le Yopper pour se situer (06/10). La liste est chargée UNE fois, puis filtrée
// sur l'appareil (`filtrerLocalites`, lib/localiser.js) : ce que le Yopper tape
// ne sort pas de son téléphone.
//
// ⚠️ DONNÉES PUBLIQUES (BeSt Address, SPF BOSA, CC BY 4.0) : des noms de
// localités et une position moyenne, aucune donnée personnelle. ~1 900 lignes,
// mises en cache par le CDN un jour.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adressesLimiter, checkLimit, clientIp } from '@/lib/ratelimit'
import { toutesLesLocalites } from '@/lib/best-adresse-serveur'
import { arrondirPosition } from '@/lib/localiser'

export async function GET(request) {
  const rl = await checkLimit(adressesLimiter, clientIp(request), { cle: 'adr', max: 60, fenetreMs: 60_000 })
  if (!rl.success) {
    return NextResponse.json({ ok: false, error: 'Trop de recherches en peu de temps. Réessaie dans un instant.' }, { status: 429 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  const lignes = await toutesLesLocalites(supabase)
  if (lignes === null) {
    return NextResponse.json({ ok: false, error: 'La recherche de localité ne répond pas. Réessaie dans un instant.' }, { status: 503 })
  }

  const res = NextResponse.json({
    ok: true,
    // Clés courtes : la liste entière part vers chaque téléphone qui l'ouvre.
    localites: lignes.map(l => {
      const p = arrondirPosition({ lat: l.lat, lng: l.lng })
      return { cp: l.code_postal, nom: l.localite, commune: l.commune, lat: p?.lat ?? null, lng: p?.lng ?? null, n: l.nb_maisons }
    }).filter(l => l.lat != null && l.lng != null),
  })
  // Une liste vide (avant le premier remplissage) ne doit pas survivre une
  // journée dans le CDN.
  res.headers.set('Cache-Control', lignes.length > 0
    ? 'public, s-maxage=86400, stale-while-revalidate=3600'
    : 'public, s-maxage=60')
  return res
}
