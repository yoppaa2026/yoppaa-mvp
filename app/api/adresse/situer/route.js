// GET /api/adresse/situer?rue=7752850&cp=5640&numero=6A → cette maison existe-t-elle ?
//
// Seconde moitié de la saisie d'adresse en livraison (chantier zone, 05/10).
// Le client a choisi sa rue dans la liste, il tape son numéro : l'écran demande
// si la maison est dans le référentiel officiel, pour le lui dire AVANT le
// paiement.
//
// ⚠️ L'ÉCRAN INFORME, LE SERVEUR DÉCIDE. La création de commande refait cette
// recherche elle-même (`situerMaison`) et n'utilise jamais une position venue
// du navigateur.
//
// Décision d'Alex (05/10, règle B) : une maison absente du référentiel ne se
// livre pas ; l'écran propose le retrait et d'appeler le commerce.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adressesLimiter, checkLimit, clientIp } from '@/lib/ratelimit'
import { situerMaison } from '@/lib/best-adresse-serveur'

export async function GET(request) {
  const rl = await checkLimit(adressesLimiter, clientIp(request), { cle: 'adr', max: 60, fenetreMs: 60_000 })
  if (!rl.success) {
    return NextResponse.json({ ok: false, error: 'Trop de recherches en peu de temps. Réessaie dans un instant.' }, { status: 429 })
  }

  const p = new URL(request.url).searchParams
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  const r = await situerMaison(supabase, {
    rueId: p.get('rue'),
    codePostal: p.get('cp'),
    numero: p.get('numero'),
  })
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: 'La recherche d\'adresse ne répond pas. Réessaie dans un instant.' }, { status: 503 })
  }
  if (!r.trouvee) return NextResponse.json({ ok: true, trouvee: false })
  return NextResponse.json({
    ok: true,
    trouvee: true,
    rue: r.rue,
    numero: r.numero,
    localite: r.localite,
    lat: r.lat,
    lng: r.lng,
    estimee: r.estimee,
  })
}
