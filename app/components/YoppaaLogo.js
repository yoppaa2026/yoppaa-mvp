// ════════════════════════════════════════════════════════════════════
// <YoppaaLogo /> — composant unique du logo Yoppaa
//
// Spec définitive validée 2026-06-12 :
//   - Wordmark : Plus Jakarta Sans 800, letter-spacing -0.05em, minuscules
//   - Dots : V2-B maillon (5 dots, mini 0.55, décalage 0.4 = sourire)
//   - Slogan : "Ton quartier dans ta poche" (Jakarta 600, sans ponctuation)
//
// Props :
//   - size       : font-size du wordmark en px (défaut 48). Tout le reste
//                  se calcule proportionnellement.
//   - mode       : 'dark' | 'light' | 'monoBlack' | 'monoWhite' | 'monoMain'
//   - withSlogan : true pour afficher le slogan sous les dots
//   - style      : styles inline supplémentaires sur le conteneur
//
// La police Plus Jakarta Sans est chargée globalement dans app/layout.tsx
// via next/font/google (variable CSS --font-jakarta).
// ════════════════════════════════════════════════════════════════════

const T = {
  ink:   '#1A0840',
  main:  '#6B35C4',
  mid:   '#9660E0',
  light: '#C4A0F4',
}

const PALETTES = {
  dark:      { yo: '#FFFFFF', pp: T.light, aa: T.mid,  d1: '#FFFFFF', d2: T.light, d3: T.light, d4: T.mid,   d5: T.mid,   slogan: T.light },
  light:     { yo: T.ink,     pp: T.main,  aa: T.mid,  d1: T.ink,     d2: T.main,  d3: T.main,  d4: T.mid,   d5: T.mid,   slogan: T.main },
  monoBlack: { yo: '#000',    pp: '#000',  aa: '#000', d1: '#000',    d2: '#000',  d3: '#000',  d4: '#000',  d5: '#000',  slogan: '#000' },
  monoWhite: { yo: '#FFFFFF', pp: '#fff',  aa: '#fff', d1: '#fff',    d2: '#fff',  d3: '#fff',  d4: '#fff',  d5: '#fff',  slogan: '#fff' },
  monoMain:  { yo: T.main,    pp: T.main,  aa: T.main, d1: T.main,    d2: T.main,  d3: T.main,  d4: T.main,  d5: T.main,  slogan: T.main },
}

// Police : variable CSS chargée dans layout.tsx + fallback robuste
const FONT_STACK = 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif'

export default function YoppaaLogo({ size = 48, mode = 'dark', withSlogan = false, style = {} }) {
  const palette = PALETTES[mode] || PALETTES.dark

  // Calculs proportionnels au font-size du wordmark (110 unités dans la spec SVG)
  const dotBase = size * 0.254       // 28/110 dans la spec
  const dotMini = dotBase * 0.55
  const dotGap = dotBase * 0.55
  const dotOffset = dotBase * 0.4
  // Jakarta 800 a des descenders importants (y/p ~22% de l'em).
  // wordmarkToDots doit donc être ≥ 0.25*size pour éviter le chevauchement.
  const wordmarkToDots = size * 0.28
  const dotsToSlogan = size * 0.25
  const sloganSize = size * 0.236     // 26/110 dans la spec

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', ...style }}>
      {/* WORDMARK */}
      <span style={{
        fontFamily: FONT_STACK,
        fontSize: size,
        fontWeight: 800,
        letterSpacing: '-0.05em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        <span style={{ color: palette.yo }}>yo</span>
        <span style={{ color: palette.pp }}>pp</span>
        <span style={{ color: palette.aa }}>aa</span>
      </span>

      {/* DOTS V2-B */}
      <div style={{
        marginTop: wordmarkToDots,
        display: 'inline-flex',
        alignItems: 'flex-start',
        gap: dotGap,
        height: dotBase + dotOffset,
      }}>
        <span style={{ width: dotBase, height: dotBase, borderRadius: '50%', background: palette.d1, display: 'block' }}/>
        <span style={{ width: dotMini, height: dotMini, borderRadius: '50%', background: palette.d2, marginTop: dotOffset, display: 'block' }}/>
        <span style={{ width: dotBase, height: dotBase, borderRadius: '50%', background: palette.d3, marginTop: dotOffset, display: 'block' }}/>
        <span style={{ width: dotMini, height: dotMini, borderRadius: '50%', background: palette.d4, marginTop: dotOffset, display: 'block' }}/>
        <span style={{ width: dotBase, height: dotBase, borderRadius: '50%', background: palette.d5, display: 'block' }}/>
      </div>

      {/* SLOGAN */}
      {withSlogan && (
        <p style={{
          margin: `${dotsToSlogan}px 0 0`,
          fontFamily: FONT_STACK,
          fontSize: sloganSize,
          fontWeight: 600,
          letterSpacing: '0.012em',
          color: palette.slogan,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}>Ton quartier dans ta poche</p>
      )}
    </div>
  )
}

// Composant complémentaire : juste les dots, sans wordmark
// Pour favicon, watermark, signature email compact
export function YoppaaDots({ size = 16, mode = 'dark', style = {} }) {
  const palette = PALETTES[mode] || PALETTES.dark
  const mini = size * 0.55
  const gap = size * 0.55
  const offset = size * 0.4
  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap, height: size + offset, ...style }}>
      <span style={{ width: size, height: size, borderRadius: '50%', background: palette.d1, display: 'block' }}/>
      <span style={{ width: mini, height: mini, borderRadius: '50%', background: palette.d2, marginTop: offset, display: 'block' }}/>
      <span style={{ width: size, height: size, borderRadius: '50%', background: palette.d3, marginTop: offset, display: 'block' }}/>
      <span style={{ width: mini, height: mini, borderRadius: '50%', background: palette.d4, marginTop: offset, display: 'block' }}/>
      <span style={{ width: size, height: size, borderRadius: '50%', background: palette.d5, display: 'block' }}/>
    </div>
  )
}
