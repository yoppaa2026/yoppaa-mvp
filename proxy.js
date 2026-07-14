// proxy.js — rate limit global de l'API (Sprint 3 Securite #6).
//
// NB : dans ce Next (v16), le middleware s'appelle "proxy" (renomme depuis
// "middleware"). Le fichier vit a la racine, exporte une fonction `proxy`, et
// tourne en runtime Node.js par defaut (donc @upstash/redis fonctionne).
//
// Limite par IP toutes les routes /api/*, SAUF :
//   - les webhooks Stripe (Stripe retente en rafale, requetes signees legitimes)
//   - les crons Vercel (deja proteges par CRON_SECRET)
//
// Fail-open : si Upstash n'est pas configure/injoignable, checkLimit renvoie
// success:true et on laisse passer (voir lib/ratelimit.js).

import { NextResponse } from 'next/server'
import { globalLimiter, checkLimit, clientIp } from './lib/ratelimit'

export const config = {
  matcher: '/api/:path*',
}

function estExclu(pathname) {
  return (
    pathname.startsWith('/api/stripe/webhook') ||
    pathname.startsWith('/api/stripe/billing/webhook') ||
    pathname.startsWith('/api/cron/')
  )
}

export async function proxy(request) {
  const { pathname } = request.nextUrl
  if (estExclu(pathname)) return NextResponse.next()

  const { success } = await checkLimit(globalLimiter, clientIp(request))
  if (!success) {
    return NextResponse.json(
      { ok: false, error: 'Trop de requêtes, réessaie dans un instant.' },
      { status: 429 }
    )
  }
  return NextResponse.next()
}
