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

// On nettoie d'eventuels guillemets ou espaces colles a la valeur (erreur de copie
// classique : Upstash affiche UPSTASH_REDIS_REST_URL="https://..." avec les quotes).
const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/^["']|["']$/g, '')
const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim().replace(/^["']|["']$/g, '')

// Client Redis unique reutilise. null => fail-open partout. On instancie dans un
// try/catch car new Redis() JETTE si l'URL est invalide (ex. ne commence pas par
// https). Ca ne doit jamais casser le build ni une requete : on retombe sur null.
let redis = null
try {
  if (url.startsWith('https://') && token) redis = new Redis({ url, token })
  else if (url || token) console.warn('[ratelimit] config Upstash invalide (url doit etre https://...), fail-open')
} catch (e) {
  console.warn('[ratelimit] init Redis KO, fail-open', e?.message)
  redis = null
}

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

// IA texte : 10 générations / 60 s PAR MARCHAND (clé = commercant_id, pas IP). Large
// pour un humain, coupe une boucle accidentelle. Le vrai plafond coût = quota mensuel.
export const aiLimiter = makeLimiter(Ratelimit.slidingWindow(10, '60 s'), 'rl:ia')

// Cœurs articles : 30 toggles / 60 s par IP. Un humain enthousiaste passe, un
// script qui gonfle les compteurs est coupé (en plus de l'UNIQUE en base).
export const likesLimiter = makeLimiter(Ratelimit.slidingWindow(30, '60 s'), 'rl:like')

// Bons cadeaux : 10 vérifications de code / 60 s par IP. Un client qui tape son
// code passe large, un brute-forceur de codes est coupé net (le code = de l'argent).
export const bonsLimiter = makeLimiter(Ratelimit.slidingWindow(10, '60 s'), 'rl:bon')

// ─── Filet local, pour quand le compteur distribué manque ───────────────────
//
// `checkLimit` est fail-open : sans Upstash configuré, ou pendant une panne,
// TOUT passe. C'est le bon choix pour une page de recherche, dont on préfère
// qu'elle réponde. C'en est un mauvais pour la vérification d'un code de bon
// cadeau : là, l'absence de limite ouvre le brute-force sur de l'argent, et le
// jour où Upstash n'est pas configuré rien ne le signale.
//
// Ce filet compte en mémoire du processus. Il ne vaut pas un compteur partagé
// (chaque instance serverless a la sienne), mais il transforme « aucune
// limite » en « quelques milliers d'essais par instance et par minute » au lieu
// d'un robinet ouvert. Il ne sert QUE de repli.
const compteursLocaux = new Map()

export function checkLocal(cle, maximum, fenetreMs, maintenant = Date.now()) {
  const debutFenetre = maintenant - fenetreMs
  const essais = (compteursLocaux.get(cle) || []).filter(t => t > debutFenetre)
  // Garde-fou mémoire : une clé ne retient jamais plus que le maximum utile.
  if (essais.length >= maximum) {
    compteursLocaux.set(cle, essais.slice(-maximum))
    return { success: false, local: true }
  }
  essais.push(maintenant)
  compteursLocaux.set(cle, essais)
  // Ménage occasionnel : sans lui, la table grossit à chaque IP vue.
  if (compteursLocaux.size > 5000) {
    for (const [k, v] of compteursLocaux) {
      if (!v.some(t => t > debutFenetre)) compteursLocaux.delete(k)
    }
  }
  return { success: true, local: true }
}

// Verifie une limite pour un identifiant (IP). Renvoie { success, ... }.
//
// `replisi` : quand le compteur distribué est indisponible, applique le filet
// local avec ces bornes. À réserver aux routes où laisser tout passer coûte de
// l'argent (codes de bons cadeaux). Ailleurs, le fail-open reste préférable.
export async function checkLimit(limiter, identifier, repli = null) {
  const filet = () => (repli && identifier)
    ? checkLocal(`${repli.cle || 'rl'}:${identifier}`, repli.max, repli.fenetreMs)
    : { success: true, skipped: true }

  if (!limiter || !identifier) return filet()
  try {
    return await limiter.limit(identifier)  // { success, limit, remaining, reset }
  } catch (e) {
    console.warn('[ratelimit] Upstash injoignable, repli local', e?.message)
    return filet()
  }
}

// IP client depuis les headers (Vercel met x-forwarded-for). Fonctionne pour un
// NextRequest (proxy) comme pour une Request de route handler (.headers.get).
export function clientIp(req) {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}
