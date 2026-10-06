// POST /api/adresse/proche  { lat, lng } → la rue de la maison la plus proche
//
// Remplace l'appel à Nominatim qui partait du téléphone du Yopper avec sa
// position GPS précise (pastille de l'accueil, commune proposée), 06/10.
//
// 🔴 LA POSITION D'UN YOPPER EST UNE DONNÉE PERSONNELLE. Donc :
//   • POST, JAMAIS dans l'adresse : l'hébergeur journalise les adresses des
//     requêtes, pas leur contenu ;
//   • arrondie à ~11 m (ici ET avant l'envoi) ;
//   • ni journalisée ni gardée : aucun `console.*` ne l'écrit, aucune table ne
//     la reçoit, et la réponse n'est jamais mise en cache.
//
// ✅ Alex, 06/10 : hors Wallonie, pas de rue (`trouvee: false` → « Près de
// toi »).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adressesLimiter, checkLimit, clientIp } from '@/lib/ratelimit'
import { maisonLaPlusProche } from '@/lib/best-adresse-serveur'
import { arrondirPosition, positionPlausible } from '@/lib/localiser'

function reponse(corps, status = 200) {
  const res = NextResponse.json(corps, { status })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function POST(request) {
  const rl = await checkLimit(adressesLimiter, clientIp(request), { cle: 'adr', max: 60, fenetreMs: 60_000 })
  if (!rl.success) return reponse({ ok: false, error: 'Trop de recherches en peu de temps. Réessaie dans un instant.' }, 429)

  const corps = await request.json().catch(() => null)
  const p = arrondirPosition(corps)
  if (!p) return reponse({ ok: false, error: 'Position invalide.' }, 400)
  // Hors du cadre belge, rien à chercher : on ne lit même pas la base.
  if (!positionPlausible(p)) return reponse({ ok: true, trouvee: false })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  const r = await maisonLaPlusProche(supabase, p)
  if (!r.ok) return reponse({ ok: false, error: 'La recherche d\'adresse ne répond pas.' }, 503)
  if (!r.trouvee) return reponse({ ok: true, trouvee: false })
  return reponse({
    ok: true,
    trouvee: true,
    rue: r.rue,
    numero: r.numero,
    localite: r.localite,
    code_postal: r.code_postal,
  })
}
