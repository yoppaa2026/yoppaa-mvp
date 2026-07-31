// POST /api/bons-cadeaux/verifier
//
// Vérifie un code de bon cadeau pour un commerçant donné (champ « J'ai un
// bon cadeau » du tunnel de commande). Service_role : la table n'a aucune
// lecture publique (le code = de l'argent). Rate-limité contre le brute force.
//
// Body : { commercant_id, code }
// → { ok: true, solde, expires_at } ou { ok: false, error }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normaliserCodeBon } from '@/lib/bons-cadeaux'
import { chargerBonValide } from '@/lib/bons-cadeaux-server'
import { bonsLimiter, checkLimit, clientIp } from '@/lib/ratelimit'

export async function POST(request) {
  try {
    const rl = await checkLimit(bonsLimiter, clientIp(request))
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Trop de tentatives, réessaie dans une minute.' }, { status: 429 })
    }

    const { commercant_id, code: codeBrut } = await request.json()
    const code = normaliserCodeBon(codeBrut)
    if (!commercant_id || !code) {
      return NextResponse.json({ ok: false, error: 'Code invalide (format attendu : BC-XXXX-XXXX).' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const res = await chargerBonValide(supabase, { code, commercant_id })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

    return NextResponse.json({
      ok: true,
      code,
      solde: Number(res.bon.solde),
      expires_at: res.bon.expires_at,
    })
  } catch (e) {
    console.error('[bons-cadeaux/verifier]', e)
    return NextResponse.json({ ok: false, error: 'Vérification impossible, réessaie.' }, { status: 500 })
  }
}
