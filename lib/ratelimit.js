// lib/ratelimit.js
//
// Rate limiting via Upstash Redis (@upstash/ratelimit, sliding window).
//
// PRINCIPE FAIL-OPEN : si Upstash n'est pas configure (variables d'env absentes)
// ou injoignable, on LAISSE PASSER la requete. On ne bloque JAMAIS l'app pour un
// souci d'infra de rate limiting. Meme philosophie que Turnstile.
//
// Deux limiteurs :
//   - globalLimiter : #6, protection large de /api/* (proxy.js), par IP.
//   - ordersLimiter : #3, anti-spam de commandes (create-commande), par IP.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

// Client Redis unique reutilise. null si non configure => fail-open partout.
const redis = url && token ? new Redis({ url, token }) : null

function makeLimiter(limiter, prefix) {
  if (!redis) return null
  // timeout: 1000ms => si Upstash ne repond pas en 1s, la verif fail-open (autorise).
  // Crucial pour le proxy global : un Upstash lent ne doit jamais ralentir l'API.
  return new Ratelimit({ redis, limiter, prefix, analytics: false, timeout: 1000 })
}

// #6 Global : 120 req / 10 s par IP. Tres genereux (l'app fait du polling toutes
// les 5 s cote Yopper + dashboard), ne gene aucun usage reel, coupe un scraper.
export const globalLimiter = makeLimiter(Ratelimit.slidingWindow(120, '10 s'), 'rl:api')

// #3 Commandes : 10 commandes / 60 s par IP. Large pour un vrai client, bloque le spam.
export const ordersLimiter = makeLimiter(Ratelimit.slidingWindow(10, '60 s'), 'rl:cmd')

// Verifie une limite pour un identifiant (IP). Renvoie { success, ... }.
// Fail-open : limiter absent OU Upstash en erreur => success:true (on laisse passer).
export async function checkLimit(limiter, identifier) {
  if (!limiter || !identifier) return { success: true, skipped: true }
  try {
    return await limiter.limit(identifier)  // { success, limit, remaining, reset }
  } catch (e) {
    console.warn('[ratelimit] Upstash injoignable, fail-open', e?.message)
    return { success: true, skipped: true }
  }
}

// IP client depuis les headers (Vercel met x-forwarded-for). Fonctionne pour un
// NextRequest (proxy) comme pour une Request de route handler (.headers.get).
export function clientIp(req) {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}
