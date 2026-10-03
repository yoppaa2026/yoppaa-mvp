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
//
// 🔴 ET L'APP DES STORES NE PASSE PLUS PAR LA LANDING (03/10, vu par Alex :
// « on voit la landing pendant 1 à 2 s, c'est moche et pas sérieux »).
// `server.url` ouvre l'app sur la racine. `RedirectionAppNative` l'en sortait,
// mais APRÈS le chargement du JavaScript : la landing était déjà peinte, et
// c'était le tout premier écran d'un nouveau client, avant les 4 écrans
// d'accueil. Ici, la requête est renvoyée vers `/commander` AVANT qu'une
// seule ligne de HTML ne parte. Le premier écran devient le dégradé du splash
// de `/commander`, celui que l'image native vient de peindre.
// ⚠️ AUCUN NOUVEAU BUILD : l'app 1.0.1 signe déjà chaque requête de sa marque
// (`appendUserAgent`, voir lib/retour-vers-app.js). L'ancienne app, sans
// marque, garde `RedirectionAppNative` comme filet.
// ⚠️ LE WEB ET LA PWA NE SONT PAS TOUCHÉS : sans la marque, la racine passe.

import { NextResponse } from 'next/server'
import { globalLimiter, checkLimit, clientIp } from './lib/ratelimit'
import { estUaApp } from './lib/retour-vers-app'

export const config = {
  // ⚠️ `'/'` NE VISE QUE LA RACINE (et ses formes de transport), Next la
  // traite à part : `/commander` ou `/legal` n'arrivent jamais ici.
  matcher: ['/api/:path*', '/'],
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

  // ⚠️ HORS DE L'API, AUCUN COMPTEUR : une page n'entre jamais dans la limite.
  // 🔴 ET SEULE LA RACINE EXACTE EST RENVOYÉE. Renvoyer toute page de l'app
  // vers `/commander` bouclerait sur `/commander` lui-même.
  if (!pathname.startsWith('/api')) {
    return pathname === '/' && estUaApp(request.headers.get('user-agent'))
      ? NextResponse.redirect(new URL('/commander', request.url))
      : NextResponse.next()
  }

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
