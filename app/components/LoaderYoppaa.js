'use client'
// LoaderYoppaa — signature visuelle Yoppaa pendant les chargements.
// 3 points tricolores horizontaux qui pulsent en cascade (wordmark Yoppaa anime).
//
// Usage :
//   import LoaderYoppaa from '@/app/components/LoaderYoppaa'
//   <LoaderYoppaa />
//
// Variants :
//   <LoaderYoppaa fullscreen />      → couvre l'ecran entier sur fond clair
//   <LoaderYoppaa size="small" />    → version compacte inline
//   <LoaderYoppaa message="Texte" /> → ajoute un message sous les points
//
// Pour Next.js App Router : creer un fichier `loading.js` dans le dossier
// de la route avec `export default function Loading() { return <LoaderYoppaa fullscreen /> }`.
// Next.js l'affichera automatiquement pendant les navigations entre pages.

const T = {
  ink:   '#1A0840',
  main:  '#6B35C4',
  mid:   '#9660E0',
  light: '#C4A0F4',
  bg:    '#F8F6FF',
  muted: '#6B7280',
}

export default function LoaderYoppaa({ fullscreen = false, size = 'normal', message = null }) {
  const dotSize = size === 'small' ? 8 : 14
  const gap = size === 'small' ? 6 : 10

  const wrapStyle = fullscreen ? {
    position: 'fixed', inset: 0,
    background: T.bg,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
    fontFamily: '"DM Sans", sans-serif',
  } : {
    display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: size === 'small' ? '8px' : '20px',
    fontFamily: '"DM Sans", sans-serif',
  }

  // 3 dots tricolores qui pulsent en cascade avec délais décalés.
  const colors = [
    { color: T.ink,   opacity: 0.9 },
    { color: T.main,  opacity: 1 },
    { color: T.mid,   opacity: 0.9 },
  ]

  return (
    <div style={wrapStyle} aria-label="Chargement…">
      <style>{`
        @keyframes yoppa-dot-pulse {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
          40%           { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
      <div style={{ display: 'flex', gap, alignItems: 'center' }}>
        {colors.map((c, i) => (
          <span key={i} style={{
            display: 'inline-block',
            width: dotSize, height: dotSize, borderRadius: '50%',
            background: c.color,
            animation: 'yoppa-dot-pulse 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}/>
        ))}
      </div>
      {message && (
        <p style={{ marginTop: 14, fontSize: 13, color: T.muted, fontWeight: 600, letterSpacing: '-0.1px', textAlign: 'center' }}>
          {message}
        </p>
      )}
    </div>
  )
}
