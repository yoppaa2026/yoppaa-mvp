// POST /api/erreur-ecran
// Body : { message, pile, digest, chemin, ou }
//
// Les écrans d'erreur (app/error.js, app/global-error.js) signalent ici le
// plantage qu'ils remplacent. On l'écrit dans les journaux du serveur
// (Vercel), sous l'étiquette `[erreur-ecran]`, pour pouvoir le retrouver.
//
// ⚠️ OUVERTE SANS IDENTITÉ, ET C'EST VOULU : un écran qui plante n'a souvent
// plus de session. Elle n'écrit RIEN en base et ne renvoie rien ; tout est
// borné en longueur, et le limiteur global du proxy s'applique.

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const borne = (v, n) => (v == null ? null : String(v).slice(0, n))

export async function POST(request) {
  const corps = await request.json().catch(() => null)
  if (!corps || typeof corps !== 'object') return NextResponse.json({ ok: false }, { status: 400 })
  console.error('[erreur-ecran]', JSON.stringify({
    message: borne(corps.message, 500),
    chemin: borne(corps.chemin, 200),
    ou: borne(corps.ou, 20),
    digest: borne(corps.digest, 100),
    pile: borne(corps.pile, 1500),
  }))
  return NextResponse.json({ ok: true })
}
