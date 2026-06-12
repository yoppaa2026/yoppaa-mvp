'use client'
// ════════════════════════════════════════════════════════════════════
// PREVIEW — Spec définitive du wordmark Yoppaa
//
// URL : yoppaa.app/demo-mettet/wordmark-preview
//
// Permet à Alex de valider visuellement :
//   - Police : Plus Jakarta Sans, Manrope, Outfit, DM Sans
//   - Capitalisation : yoppaa (minuscules) vs Yoppaa (cap initiale)
//   - Letter-spacing : -2%, -4%, -6%
//   - Mono-couleurs pour usages spéciaux (impression NB, gravure, broderie)
//   - Identité complète wordmark + dots V2-B aux 4 échelles
// ════════════════════════════════════════════════════════════════════

const T = {
  ink:    '#1A0840',
  panel:  '#160636',
  deep:   '#2D0F6B',
  main:   '#6B35C4',
  mid:    '#9660E0',
  light:  '#C4A0F4',
  pale:   '#EDE0FF',
  bg:     '#F8F6FF',
  muted:  '#6B7280',
}

// ────────── COMPOSANT 5 DOTS V2-B (validé 2026-06-12) ──────────
function YoppaaDotsV2B({ base = 16, colors }) {
  const mini = base * 0.55
  const gap = base * 0.55
  const offset = base * 0.4
  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap, height: base + offset }}>
      <span style={{ width: base, height: base, borderRadius: '50%', background: colors.left }}/>
      <span style={{ width: mini, height: mini, borderRadius: '50%', background: colors.midLeft, marginTop: offset }}/>
      <span style={{ width: base, height: base, borderRadius: '50%', background: colors.center, marginTop: offset }}/>
      <span style={{ width: mini, height: mini, borderRadius: '50%', background: colors.midRight, marginTop: offset }}/>
      <span style={{ width: base, height: base, borderRadius: '50%', background: colors.right }}/>
    </div>
  )
}

// ────────── WORDMARK PARAMÉTRABLE ──────────
function Wordmark({ fontFamily, fontSize = 56, letterSpacing = '-0.05em', capitalize = false, colors, fontWeight = 900 }) {
  const text = capitalize ? 'Yoppaa' : 'yoppaa'
  // Coupes : "yo" + "pp" + "aa" → 2 + 2 + 2 caractères (ou Y/o + p/p + a/a si capitalisé)
  const seg1 = text.slice(0, 2)
  const seg2 = text.slice(2, 4)
  const seg3 = text.slice(4, 6)
  return (
    <p style={{ margin: 0, fontFamily, fontSize, fontWeight, letterSpacing, lineHeight: 1 }}>
      <span style={{ color: colors[0] }}>{seg1}</span>
      <span style={{ color: colors[1] }}>{seg2}</span>
      <span style={{ color: colors[2] }}>{seg3}</span>
    </p>
  )
}

export default function WordmarkPreview() {
  // Palettes
  const darkColors = ['#FFFFFF', T.light, T.mid]
  const lightColorsA = [T.ink, T.light, T.mid]
  const lightColorsB = [T.ink, T.main, T.mid]

  // Dots V2-B couleurs sur fond foncé
  const dotsDark = {
    left: '#FFFFFF',
    midLeft: T.light,
    center: T.light,
    midRight: T.mid,
    right: T.mid,
  }
  const dotsLight = {
    left: T.ink,
    midLeft: T.main,
    center: T.main,
    midRight: T.mid,
    right: T.mid,
  }

  // Polices candidates
  const fonts = [
    { name: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif', vibe: 'moderne, friendly, équilibré' },
    { name: 'Manrope',           family: '"Manrope", sans-serif',           vibe: 'rond, sympathique, accueillant' },
    { name: 'Outfit',            family: '"Outfit", sans-serif',            vibe: 'géométrique, jeune, énergique' },
    { name: 'DM Sans',           family: '"DM Sans", sans-serif',           vibe: 'classique friendly, lisible' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '40px 20px 80px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Import Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800;900&family=Manrope:wght@700;800&family=Outfit:wght@700;800;900&family=DM+Sans:wght@700;900&display=swap');
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* HEADER */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Brand · 2026-06-12</p>
          <h1 style={{ margin: '6px 0 8px', fontSize: 32, fontWeight: 900, color: T.ink, letterSpacing: '-1px' }}>
            Wordmark Yoppaa, spec
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
            Dots <strong>V2-B</strong> validés. Reste : police, capitalisation, letter-spacing, mono-couleurs, identité complète.
          </p>
        </div>

        {/* HERO — identité complète mise en avant */}
        <div style={{ background: `linear-gradient(135deg, ${T.ink} 0%, ${T.deep} 100%)`, borderRadius: 22, padding: '80px 40px 60px', marginBottom: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, boxShadow: '0 10px 40px rgba(26, 8, 64, 0.2)' }}>
          <Wordmark fontFamily='"Plus Jakarta Sans", sans-serif' fontSize={140} colors={darkColors}/>
          <YoppaaDotsV2B base={36} colors={dotsDark}/>
          <div style={{ marginTop: 16, padding: '6px 14px', background: 'rgba(255,255,255,0.08)', borderRadius: 999, border: '1px solid rgba(196,160,244,0.3)' }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: T.light, letterSpacing: '2px', textTransform: 'uppercase' }}>Identité complète · wordmark + 5 dots V2-B</p>
          </div>
        </div>

        {/* ① POLICES CANDIDATES */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ① Police — 4 candidates côte à côte
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginBottom: 32 }}>
          {fonts.map((f, i) => (
            <div key={i} style={{ background: T.ink, borderRadius: 14, padding: '40px 30px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <Wordmark fontFamily={f.family} fontSize={64} colors={darkColors}/>
              <YoppaaDotsV2B base={18} colors={dotsDark}/>
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>{f.name}</p>
                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>{f.vibe}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ② CAPITALISATION */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ② Capitalisation — minuscules vs cap initiale
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.deep, lineHeight: 1.55 }}>
          Test avec Plus Jakarta Sans (à ajuster selon ta police favorite à l&rsquo;étape ①).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginBottom: 32 }}>
          {[
            { cap: false, label: 'yoppaa · minuscules', sub: 'décontracté, accessible, esprit tech moderne' },
            { cap: true,  label: 'Yoppaa · cap initiale ', sub: 'institutionnel, plus formel' },
          ].map((c, i) => (
            <div key={i} style={{ background: T.ink, borderRadius: 14, padding: '48px 30px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
              <Wordmark fontFamily='"Plus Jakarta Sans", sans-serif' fontSize={72} capitalize={c.cap} colors={darkColors}/>
              <YoppaaDotsV2B base={20} colors={dotsDark}/>
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>{c.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>{c.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ③ LETTER-SPACING */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ③ Letter-spacing — chasse des lettres
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 32 }}>
          {[
            { ls: '-0.02em', label: 'Normal', sub: '-2 % · classique' },
            { ls: '-0.05em', label: 'Serré',  sub: '-5 % · plus compact, plus iconique' },
            { ls: '-0.07em', label: 'Très serré', sub: '-7 % · risque de lettres collées' },
          ].map((s, i) => (
            <div key={i} style={{ background: T.ink, borderRadius: 14, padding: '40px 20px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Wordmark fontFamily='"Plus Jakarta Sans", sans-serif' fontSize={56} letterSpacing={s.ls} colors={darkColors}/>
              <YoppaaDotsV2B base={16} colors={dotsDark}/>
              <div style={{ textAlign: 'center', marginTop: 6 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>{s.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>{s.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ④ COULEURS — fond clair, option A vs B */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ④ Couleurs fond clair — palette à finaliser
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginBottom: 32 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '48px 30px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, border: `1px solid ${T.pale}` }}>
            <Wordmark fontFamily='"Plus Jakarta Sans", sans-serif' fontSize={72} colors={lightColorsA}/>
            <YoppaaDotsV2B base={20} colors={{ left: T.ink, midLeft: T.light, center: T.light, midRight: T.mid, right: T.mid }}/>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: T.deep, letterSpacing: '1px', textTransform: 'uppercase' }}>Option A · Fidèle au fond foncé</p>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: T.muted, fontFamily: 'monospace' }}>ink · light · mid · light pâle au centre</p>
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: 14, padding: '48px 30px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, border: `1px solid ${T.pale}` }}>
            <Wordmark fontFamily='"Plus Jakarta Sans", sans-serif' fontSize={72} colors={lightColorsB}/>
            <YoppaaDotsV2B base={20} colors={dotsLight}/>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: T.deep, letterSpacing: '1px', textTransform: 'uppercase' }}>Option B · Centre saturé ✨</p>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: T.muted, fontFamily: 'monospace' }}>ink · main · mid · plus de contraste</p>
            </div>
          </div>
        </div>

        {/* ⑤ MONO-COULEURS — pour cas spéciaux */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑤ Mono-couleurs — impression NB, gravure, broderie 1 fil
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.deep, lineHeight: 1.55 }}>
          Pour les cas où la tricolore n&rsquo;est pas possible (fax, papier en-tête noir, gravure laser, broderie monofil), prévoir une déclinaison.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 32 }}>
          {/* Mono noir */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, border: `1px solid ${T.pale}` }}>
            <Wordmark fontFamily='"Plus Jakarta Sans", sans-serif' fontSize={56} colors={['#000', '#000', '#000']}/>
            <YoppaaDotsV2B base={16} colors={{ left: '#000', midLeft: '#000', center: '#000', midRight: '#000', right: '#000' }}/>
            <p style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '1px', textTransform: 'uppercase' }}>Mono noir</p>
            <p style={{ margin: 0, fontSize: 10, color: T.muted, fontFamily: 'monospace' }}>impression NB, fax, gravure</p>
          </div>
          {/* Mono blanc */}
          <div style={{ background: T.ink, borderRadius: 14, padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <Wordmark fontFamily='"Plus Jakarta Sans", sans-serif' fontSize={56} colors={['#fff', '#fff', '#fff']}/>
            <YoppaaDotsV2B base={16} colors={{ left: '#fff', midLeft: '#fff', center: '#fff', midRight: '#fff', right: '#fff' }}/>
            <p style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>Mono blanc</p>
            <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>sur photo, sur dos sombre</p>
          </div>
          {/* Mono violet main */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, border: `1px solid ${T.pale}` }}>
            <Wordmark fontFamily='"Plus Jakarta Sans", sans-serif' fontSize={56} colors={[T.main, T.main, T.main]}/>
            <YoppaaDotsV2B base={16} colors={{ left: T.main, midLeft: T.main, center: T.main, midRight: T.main, right: T.main }}/>
            <p style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '1px', textTransform: 'uppercase' }}>Mono violet · main</p>
            <p style={{ margin: 0, fontSize: 10, color: T.muted, fontFamily: 'monospace' }}>signature couleur unique</p>
          </div>
        </div>

        {/* ⑥ IDENTITÉ COMPLÈTE — 4 échelles */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑥ Identité complète — wordmark + dots V2-B aux 4 échelles
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
          {[
            { fontSize: 96, dotsBase: 28, label: 'XL · publicité, OG image' },
            { fontSize: 56, dotsBase: 16, label: 'L · slides, header marketing' },
            { fontSize: 32, dotsBase: 9,  label: 'M · header app, signature' },
            { fontSize: 16, dotsBase: 4,  label: 'S · favicon, badge' },
          ].map((s, i) => (
            <div key={i} style={{ background: T.ink, borderRadius: 14, padding: '30px 16px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: s.dotsBase * 0.6, minHeight: 170 }}>
              <Wordmark fontFamily='"Plus Jakarta Sans", sans-serif' fontSize={s.fontSize} colors={darkColors}/>
              <YoppaaDotsV2B base={s.dotsBase} colors={dotsDark}/>
              <p style={{ margin: '10px 0 0', fontSize: 9, fontWeight: 700, color: T.light, letterSpacing: '0.5px', textAlign: 'center' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ⑦ ANATOMIE — proportions et espace */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑦ Anatomie — proportions et espace de respiration
        </p>
        <div style={{ background: T.ink, borderRadius: 14, padding: '50px 40px', position: 'relative', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <Wordmark fontFamily='"Plus Jakarta Sans", sans-serif' fontSize={84} colors={darkColors}/>
            <YoppaaDotsV2B base={24} colors={dotsDark}/>
          </div>
          {/* Lignes guides — espace de respiration = hauteur d'un dot */}
          <div style={{ position: 'absolute', top: 22, left: 22, fontSize: 9, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', letterSpacing: '0.5px' }}>← marge minimale = 1 grand dot →</div>
        </div>

        {/* Footer décisionnel */}
        <div style={{ marginTop: 32, padding: '20px 24px', background: T.pale, borderRadius: 12, borderLeft: `4px solid ${T.main}` }}>
          <p style={{ margin: 0, fontSize: 13, color: T.deep, lineHeight: 1.6, fontWeight: 500 }}>
            💡 Décisions à valider :
          </p>
          <ol style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 13, color: T.deep, lineHeight: 1.7 }}>
            <li><strong>Police</strong> : Plus Jakarta Sans · Manrope · Outfit · DM Sans ?</li>
            <li><strong>Capitalisation</strong> : <code>yoppaa</code> minuscules ou <code>Yoppaa</code> cap initiale ?</li>
            <li><strong>Letter-spacing</strong> : -2 %, -5 %, -7 % ?</li>
            <li><strong>Palette fond clair</strong> : Option A (light pâle au centre) ou <strong>Option B (main saturé au centre)</strong> ?</li>
            <li><strong>Mono-couleurs</strong> : on adopte les 3 déclinaisons noir / blanc / violet main ?</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
