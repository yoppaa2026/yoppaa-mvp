// L'habit commun des pages `/commerces` (27/10) : le logo vers l'accueil, un
// titre, une phrase, le contenu, et le chemin vers l'app. Composant SERVEUR.

import Link from 'next/link'

export const T = {
  main: '#6B35C4',
  pale: '#EDE0FF',
  ink: '#1A0840',
  muted: '#6B7280',
  bg: '#F8F6FF',
}

export function PageCommerces({ titre, intro, children }) {
  return (
    <main style={{ minHeight: '100dvh', background: T.bg, color: T.ink, fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 40px' }}>
        <Link href="/" style={{ fontWeight: 900, fontSize: '1.1rem', color: T.main, textDecoration: 'none', letterSpacing: '-0.3px' }}>Yoppaa</Link>
        <h1 style={{ margin: '18px 0 6px', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.2, textWrap: 'balance' }}>{titre}</h1>
        {intro && <p style={{ margin: '0 0 18px', fontSize: '0.95rem', lineHeight: 1.55, color: T.muted, maxWidth: '62ch' }}>{intro}</p>}
        {children}
        <p style={{ margin: '24px 0 0' }}>
          <Link href="/commander"
            style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 100, background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: '0.92rem', textDecoration: 'none' }}>
            Voir les commerces autour de moi
          </Link>
        </p>
      </div>
    </main>
  )
}
