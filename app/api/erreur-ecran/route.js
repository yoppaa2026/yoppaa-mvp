// POST /api/erreur-ecran
// Body : { message, pile, digest, chemin, ou }
//
// Les écrans d'erreur (app/error.js, app/global-error.js) signalent ici le
// plantage qu'ils remplacent. On l'écrit dans les journaux du serveur
// (Vercel), sous l'étiquette `[erreur-ecran]`, pour pouvoir le retrouver.
//
// ⚠️ OUVERTE SANS IDENTITÉ, ET C'EST VOULU : un écran qui plante n'a souvent
// plus de session. Elle ne renvoie rien ; tout est borné en longueur, et le
// limiteur global du proxy s'applique.
//
// ✅ DEPUIS LE 19/10, ELLE ÉCRIT AUSSI AU JOURNAL TECHNIQUE, pour que le
// pilotage compte les plantages sans qu'on aille lire Vercel. Trois bornes,
// parce que la route est publique : le chemin SANS ses paramètres, le message
// tronqué, et au plus 20 écritures par adresse IP et par 10 minutes (au-delà,
// la ligne Vercel reste, le journal se tait). Une écriture qui échoue ne
// change rien à la réponse.

import { NextResponse } from 'next/server'
import { noterErreurEcran } from '@/lib/journal-technique'
import { checkLocal, clientIp } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

const borne = (v, n) => (v == null ? null : String(v).slice(0, n))

const ERREURS_JOURNAL_PAR_IP = 20
const FENETRE_JOURNAL_MS = 10 * 60 * 1000

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
  const quota = checkLocal(`erreur-ecran:${clientIp(request)}`, ERREURS_JOURNAL_PAR_IP, FENETRE_JOURNAL_MS)
  if (quota.success) {
    await noterErreurEcran({ chemin: corps.chemin, message: corps.message, ou: corps.ou })
  }
  return NextResponse.json({ ok: true })
}
