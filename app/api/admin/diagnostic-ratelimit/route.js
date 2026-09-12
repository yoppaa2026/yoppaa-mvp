// GET /api/admin/diagnostic-ratelimit
//
// Le compteur d'essais répond-il vraiment ?
//
// POURQUOI CETTE ROUTE. Les variables Upstash peuvent être déclarées sur Vercel
// et pourtant inopérantes : token régénéré, base supprimée, URL mal recopiée.
// Le code est fail-open par construction, donc rien ne se voit : l'application
// répond normalement, simplement plus personne n'est limité. Sur la route qui
// vérifie les codes de bons cadeaux, ça veut dire brute-force libre.
//
// Ce diagnostic tranche : il tire onze fois de suite sur une clé de test, ce
// qu'un humain ne peut pas faire à la main dans la fenêtre d'une minute. Si le
// onzième passe encore, le compteur ne compte pas.
//
// La clé de test est horodatée et préfixée : elle ne touche jamais le compteur
// d'un vrai visiteur.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bonsLimiter } from '@/lib/ratelimit'
import { sonderCompteur, verdictCompteur, SONDE_TIRAGES } from '@/lib/sonde-compteur'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

async function requireAdmin(request) {
  const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!accessToken) return { error: 'non authentifié', status: 401 }
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'session expirée, reconnecte-toi', status: 401 }
  if (user.email !== ADMIN_EMAIL) return { error: 'accès refusé', status: 403 }
  return { ok: true }
}

export async function GET(request) {
  try {
    const { error, status } = await requireAdmin(request)
    if (error) return NextResponse.json({ ok: false, error }, { status })

    // Ce que la configuration DIT, avant même d'appeler qui que ce soit.
    const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/^["']|["']$/g, '')
    const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim().replace(/^["']|["']$/g, '')
    const config = {
      url_presente: !!url,
      url_https: url.startsWith('https://'),
      token_present: !!token,
      // Jamais la valeur, seulement de quoi reconnaître la bonne base.
      hote: url ? url.replace(/^https?:\/\//, '').split('.')[0] : null,
      limiteur_instancie: !!bonsLimiter,
    }

    // ⚠️ LA MÊME SONDE QUE LE CRON DU MATIN, et surtout pas une seconde copie.
    // Ce fichier tirait ses onze essais lui-même ; la surveillance quotidienne
    // ajoutée le 12/09 aurait fait une deuxième boucle disant la même chose,
    // jusqu'au jour où l'une des deux aurait changé de plafond sans l'autre.
    // La règle vit désormais dans lib/sonde-compteur.js, et elle s'exécute au
    // banc.
    const constat = await sonderCompteur(bonsLimiter)
    const jugement = verdictCompteur(constat)

    const essais = constat.essais.map(e => ({
      n: e.n, autorise: e.autorise, repli_local: e.repliLocal, ignore: e.ignore,
    }))
    const duree = constat.dureeMs
    const compteReellement = constat.compte
    const viaRepliLocal = constat.viaRepliLocal

    return NextResponse.json({
      ok: true,
      config,
      compte_reellement: compteReellement,
      via_repli_local: viaRepliLocal,
      duree_ms: duree,
      essais,
      // Le même jugement que celui qui déclenche, ou non, l'email du matin :
      // l'écran d'administration et l'alerte automatique ne peuvent pas se
      // contredire, puisqu'ils lisent la même règle.
      verdict: `${jugement.titre} ${jugement.detail}`,
      cause: jugement.cause,
      tirages: SONDE_TIRAGES,
    })
  } catch (e) {
    console.error('[admin/diagnostic-ratelimit]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
