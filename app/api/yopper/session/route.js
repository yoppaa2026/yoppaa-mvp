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

const COOKIE_NAME = 'yoppaa_yopper'
const MAX_AGE_SEC = 365 * 24 * 3600  // 365 jours

export async function GET() {
  try {
    const jar = await cookies()
    const raw = jar.get(COOKIE_NAME)?.value
    if (!raw) return NextResponse.json({ ok: true, identity: null })
    try {
      const identity = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
      return NextResponse.json({ ok: true, identity })
    } catch {
      return NextResponse.json({ ok: true, identity: null })
    }
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
    const encoded = Buffer.from(JSON.stringify(identity), 'utf8').toString('base64')
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
