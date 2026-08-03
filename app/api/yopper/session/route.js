// Yopper session persistante côté serveur via cookie HTTP-only.
//
// Contexte : Safari iOS ITP (Intelligent Tracking Prevention) purge le
// localStorage des sites peu visités (~7j sans visite). Bug signalé par Alex
// le 30/06 : les RDV et commandes disparaissent côté Yopper sur iPhone.
//
// Fix : en plus du localStorage (fallback), on sauvegarde l'identité Yopper
// (client_id + email + prénom) dans un cookie HTTP-only same-site avec
// Max-Age 365j. Les cookies same-site HTTP-only avec user activation sont
// exemptés de la purge ITP. Survit à un refresh, une réouverture, une
// installation PWA, etc.
//
// GET  : retourne { ok, identity: { client_id, email, prenom, nom, telephone } | null }
// POST : sauvegarde l'identité passée en body dans le cookie
// DELETE : efface le cookie (déconnexion Yopper)

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { encoderIdentite, lireIdentiteYopper } from '@/lib/yopper-session'

const COOKIE_NAME = 'yoppaa_yopper'
const MAX_AGE_SEC = 365 * 24 * 3600  // 365 jours

export async function GET() {
  try {
    // La vérification de signature vit dans lib/yopper-session : un cookie
    // altéré, ou posé avant la mise en place de la signature, est traité comme
    // absent. L'application en repose alors un valide depuis le localStorage.
    const identity = await lireIdentiteYopper()
    return NextResponse.json({ ok: true, identity: identity || null })
  } catch (e) {
    console.error('[yopper/session GET]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { client_id, email, prenom, nom, telephone } = body
    if (!email) {
      return NextResponse.json({ ok: false, error: 'email requis' }, { status: 400 })
    }
    const identity = { client_id, email, prenom, nom, telephone }
    // Cookie SIGNÉ : sans signature, il suffisait de réencoder le sien avec
    // l'identifiant d'un autre pour agir en son nom. Voir lib/yopper-session.
    const encoded = encoderIdentite(identity)
    const jar = await cookies()
    jar.set(COOKIE_NAME, encoded, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: MAX_AGE_SEC,
      path: '/',
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[yopper/session POST]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const jar = await cookies()
    jar.delete(COOKIE_NAME)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[yopper/session DELETE]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
