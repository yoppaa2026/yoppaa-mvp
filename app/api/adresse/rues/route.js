// GET /api/adresse/rues?cp=5640 → les rues de ce code postal (référentiel BeSt)
//
// Première moitié de la saisie d'adresse en livraison (chantier zone, 05/10) :
// le client tape son code postal, l'écran reçoit la liste de ses rues et la
// filtre sur place pendant qu'il tape. Une seule requête par code postal, au
// lieu d'une requête par lettre chez Nominatim.
//
// ⚠️ DONNÉES PUBLIQUES (BeSt Address, SPF BOSA, CC BY 4.0), aucune donnée
// personnelle : des noms de rues. Mise en cache par le CDN un jour.
//
// ⚠️ PAS DE NUMÉROS ICI. La liste des maisons ne sort jamais en bloc : un
// numéro se vérifie un par un (`/api/adresse/situer`), limité en débit.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adressesLimiter, checkLimit, clientIp } from '@/lib/ratelimit'
import { ruesDuCodePostal } from '@/lib/best-adresse-serveur'

export async function GET(request) {
  const rl = await checkLimit(adressesLimiter, clientIp(request), { cle: 'adr', max: 60, fenetreMs: 60_000 })
  if (!rl.success) {
    return NextResponse.json({ ok: false, error: 'Trop de recherches en peu de temps. Réessaie dans un instant.' }, { status: 429 })
  }

  const cp = (new URL(request.url).searchParams.get('cp') || '').trim()
  if (!/^\d{4}$/.test(cp)) {
    return NextResponse.json({ ok: false, error: 'Code postal invalide.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  const rues = await ruesDuCodePostal(supabase, cp)
  if (rues === null) {
    return NextResponse.json({ ok: false, error: 'La recherche d\'adresse ne répond pas. Réessaie dans un instant.' }, { status: 503 })
  }

  const res = NextResponse.json({
    ok: true,
    // Le centre de la rue sert aux lieux d'activité sans numéro (une place, un
    // parking). Donnée publique, comme le nom.
    rues: rues.map(r => ({ id: r.rue_id, nom: r.nom, localite: r.localite, lat: r.lat, lng: r.lng })),
  })
  // Une liste vide n'est pas mise en cache longtemps : c'est aussi ce qu'on
  // rend avant le premier import, et elle ne doit pas survivre à l'import.
  res.headers.set('Cache-Control', rues.length > 0
    ? 'public, s-maxage=86400, stale-while-revalidate=3600'
    : 'public, s-maxage=60')
  return res
}
