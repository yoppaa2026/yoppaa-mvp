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
import { bonsLimiter, checkLimit } from '@/lib/ratelimit'

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
  if (!user || user.email !== ADMIN_EMAIL) return { error: 'accès refusé', status: 403 }
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

    // Onze tirages d'affilée sur une clé qui n'appartient à personne.
    const cle = `diagnostic-${Date.now()}`
    const essais = []
    const depart = Date.now()
    for (let i = 0; i < 11; i++) {
      const r = await checkLimit(bonsLimiter, cle, { cle: 'diag', max: 10, fenetreMs: 60_000 })
      essais.push({ n: i + 1, autorise: !!r.success, repli_local: !!r.local, ignore: !!r.skipped })
    }
    const duree = Date.now() - depart

    const onzieme = essais[10]
    const compteReellement = !onzieme.autorise
    const viaRepliLocal = essais.some(e => e.repli_local)

    return NextResponse.json({
      ok: true,
      config,
      compte_reellement: compteReellement,
      via_repli_local: viaRepliLocal,
      duree_ms: duree,
      essais,
      verdict: compteReellement
        ? (viaRepliLocal
            ? 'Le compteur partagé ne répond pas : c\'est le filet local qui bloque. Vérifie la base Upstash.'
            : 'Tout va bien : le compteur partagé bloque au onzième essai.')
        : 'AUCUNE limite : ni Upstash ni le filet local ne bloquent. Les codes de bons cadeaux sont exposés au brute-force.',
    })
  } catch (e) {
    console.error('[admin/diagnostic-ratelimit]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
