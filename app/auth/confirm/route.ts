import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/dashboard'

  if (token_hash && type) {
    // On passe le token à la page client qui gère la session dans le navigateur
    const redirectUrl = new URL(`${origin}/auth/session`)
    redirectUrl.searchParams.set('token_hash', token_hash)
    redirectUrl.searchParams.set('type', type)
    redirectUrl.searchParams.set('next', next)
    return NextResponse.redirect(redirectUrl.toString())
  }

  return NextResponse.redirect(`${origin}/login?error=lien-invalide`)
}