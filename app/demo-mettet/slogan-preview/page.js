'use client'
// ════════════════════════════════════════════════════════════════════
// PREVIEW — Spec définitive du slogan Yoppaa
//
// URL : yoppaa.app/demo-mettet/slogan-preview
//
// Slogan : "Ton quartier, dans ta poche."
// À valider :
//   - Police : Jakarta (cohérence) ou alternative ?
//   - Weight : 400, 500, 600 ?
//   - Capitalisation : sentence case, minuscules, caps ?
//   - Position : sous dots, entre wordmark et dots, à droite ?
//   - Couleur : light, main, muted ?
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

// ────────── COMPOSANT 5 DOTS V2-B ──────────
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

// ────────── WORDMARK ──────────
function Wordmark({ fontSize = 56, colors }) {
  return (
    <p style={{ margin: 0, fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1 }}>
      <span style={{ color: colors[0] }}>yo</span>
      <span style={{ color: colors[1] }}>pp</span>
      <span style={{ color: colors[2] }}>aa</span>
    </p>
  )
}

// ────────── SLOGAN PARAMÉTRABLE ──────────
function Slogan({ fontFamily = '"Plus Jakarta Sans", sans-serif', fontSize = 14, fontWeight = 500, color, text = 'Ton quartier, dans ta poche.', letterSpacing = '0.02em', italic = false }) {
  return (
    <p style={{ margin: 0, fontFamily, fontSize, fontWeight, color, letterSpacing, fontStyle: italic ? 'italic' : 'normal', lineHeight: 1.3 }}>{text}</p>
  )
}

export default function SloganPreview() {
  const darkColors = ['#FFFFFF', T.light, T.mid]
  const lightColors = [T.ink, T.main, T.mid]
  const dotsDark = { left: '#FFFFFF', midLeft: T.light, center: T.light, midRight: T.mid, right: T.mid }
  const dotsLight = { left: T.ink, midLeft: T.main, center: T.main, midRight: T.mid, right: T.mid }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '40px 20px 80px', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500&family=Manrope:wght@400;500&display=swap');
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Brand · Slogan</p>
          <h1 style={{ margin: '6px 0 8px', fontSize: 32, fontWeight: 900, color: T.ink, letterSpacing: '-1px' }}>
            Ton quartier, dans ta poche.
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
            Reste à valider : police, weight, capitalisation, position, couleur.
          </p>
        </div>

        {/* ① POLICE DU SLOGAN */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ① Police du slogan
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.deep, lineHeight: 1.55 }}>
          Ma reco : <strong>Jakarta même</strong> (cohérence). Mais on teste 2 alternatives au cas où.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 32 }}>
          {[
            { name: 'Plus Jakarta Sans 500', family: '"Plus Jakarta Sans", sans-serif', weight: 500, vibe: 'cohérence parfaite' },
            { name: 'Inter 500',              family: '"Inter", sans-serif',              weight: 500, vibe: 'plus neutre, plus tech' },
            { name: 'Manrope 500',            family: '"Manrope", sans-serif',            weight: 500, vibe: 'plus rond, plus chaleureux' },
          ].map((f, i) => (
            <div key={i} style={{ background: T.ink, borderRadius: 14, padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Wordmark fontSize={56} colors={darkColors}/>
              <YoppaaDotsV2B base={16} colors={dotsDark}/>
              <Slogan fontFamily={f.family} fontSize={15} fontWeight={f.weight} color={T.light}/>
              <p style={{ margin: '8px 0 0', fontSize: 10, fontWeight: 800, color: T.light, letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'center' }}>{f.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{f.vibe}</p>
            </div>
          ))}
        </div>

        {/* ② WEIGHT JAKARTA */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ② Weight Jakarta — contraste avec wordmark 800
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 32 }}>
          {[
            { w: 400, label: 'Regular 400', sub: 'discret, élégant, fragile' },
            { w: 500, label: 'Medium 500', sub: 'équilibré, ma reco' },
            { w: 600, label: 'SemiBold 600', sub: 'plus de présence, plus assertif' },
          ].map((w, i) => (
            <div key={i} style={{ background: T.ink, borderRadius: 14, padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Wordmark fontSize={56} colors={darkColors}/>
              <YoppaaDotsV2B base={16} colors={dotsDark}/>
              <Slogan fontSize={15} fontWeight={w.w} color={T.light}/>
              <p style={{ margin: '8px 0 0', fontSize: 10, fontWeight: 800, color: T.light, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{w.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{w.sub}</p>
            </div>
          ))}
        </div>

        {/* ③ CAPITALISATION */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ③ Capitalisation du slogan
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 32 }}>
          {[
            { text: 'Ton quartier, dans ta poche.', label: 'Sentence case',  sub: 'classique, propre, lisible · ma reco' },
            { text: 'ton quartier, dans ta poche.', label: 'Tout minuscules', sub: 'cohérent avec yoppaa, mais perd l\'autorité' },
            { text: 'TON QUARTIER, DANS TA POCHE',  label: 'CAPS', sub: 'fort, urgent, peut paraître crié' },
          ].map((c, i) => (
            <div key={i} style={{ background: T.ink, borderRadius: 14, padding: '40px 20px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Wordmark fontSize={48} colors={darkColors}/>
              <YoppaaDotsV2B base={14} colors={dotsDark}/>
              <Slogan fontSize={c.label === 'CAPS' ? 12 : 14} fontWeight={500} color={T.light} text={c.text} letterSpacing={c.label === 'CAPS' ? '0.15em' : '0.02em'}/>
              <p style={{ margin: '8px 0 0', fontSize: 10, fontWeight: 800, color: T.light, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{c.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', textAlign: 'center' }}>{c.sub}</p>
            </div>
          ))}
        </div>

        {/* ④ POSITION DU SLOGAN */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ④ Position du slogan
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginBottom: 18 }}>
          {/* A — Sous les dots */}
          <div style={{ background: T.ink, borderRadius: 14, padding: '50px 30px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <Wordmark fontSize={64} colors={darkColors}/>
            <YoppaaDotsV2B base={18} colors={dotsDark}/>
            <Slogan fontSize={15} fontWeight={500} color={T.light}/>
            <p style={{ margin: '10px 0 0', fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>A · Sous les dots ✨</p>
            <p style={{ margin: '2px 0 0', fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>ma reco · l&rsquo;identité reste lisible en premier</p>
          </div>
          {/* B — Entre wordmark et dots */}
          <div style={{ background: T.ink, borderRadius: 14, padding: '50px 30px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Wordmark fontSize={64} colors={darkColors}/>
            <Slogan fontSize={15} fontWeight={500} color={T.light}/>
            <YoppaaDotsV2B base={18} colors={dotsDark}/>
            <p style={{ margin: '10px 0 0', fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>B · Entre wordmark et dots</p>
            <p style={{ margin: '2px 0 0', fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>casse l&rsquo;identité, les dots perdent leur rôle</p>
          </div>
        </div>

        {/* C — Slogan à droite (horizontal compact) */}
        <div style={{ background: T.ink, borderRadius: 14, padding: '50px 40px', marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Wordmark fontSize={56} colors={darkColors}/>
              <YoppaaDotsV2B base={16} colors={dotsDark}/>
            </div>
            <div style={{ borderLeft: `1px solid rgba(196,160,244,0.4)`, paddingLeft: 24, maxWidth: 200 }}>
              <Slogan fontSize={15} fontWeight={500} color={T.light}/>
            </div>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>C · Slogan à droite (compact horizontal)</p>
          <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>idéal pour signature email, footer bandeau</p>
        </div>

        {/* ⑤ COULEUR DU SLOGAN */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑤ Couleur du slogan
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.deep, lineHeight: 1.55 }}>
          Sur fond foncé : 3 options. Sur fond clair : 3 options.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 18 }}>
          {[
            { color: T.light, label: 'light', sub: 'cohérent palette · ma reco' },
            { color: T.mid,   label: 'mid',   sub: 'plus saturé, plus présent' },
            { color: 'rgba(255,255,255,0.7)', label: 'blanc 70%', sub: 'neutre, technique' },
          ].map((c, i) => (
            <div key={i} style={{ background: T.ink, borderRadius: 14, padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Wordmark fontSize={48} colors={darkColors}/>
              <YoppaaDotsV2B base={14} colors={dotsDark}/>
              <Slogan fontSize={14} fontWeight={500} color={c.color}/>
              <p style={{ margin: '8px 0 0', fontSize: 10, fontWeight: 800, color: T.light, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Fond foncé · {c.label}</p>
              <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{c.sub}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 32 }}>
          {[
            { color: T.main, label: 'main', sub: 'cohérent palette · ma reco' },
            { color: T.mid,  label: 'mid',  sub: 'plus doux, plus modeste' },
            { color: T.muted, label: 'gris muted', sub: 'neutre, hiérarchie subtile' },
          ].map((c, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '40px 24px 28px', border: `1px solid ${T.pale}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Wordmark fontSize={48} colors={lightColors}/>
              <YoppaaDotsV2B base={14} colors={dotsLight}/>
              <Slogan fontSize={14} fontWeight={500} color={c.color}/>
              <p style={{ margin: '8px 0 0', fontSize: 10, fontWeight: 800, color: T.deep, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Fond clair · {c.label}</p>
              <p style={{ margin: 0, fontSize: 9, color: T.muted, fontFamily: 'monospace' }}>{c.sub}</p>
            </div>
          ))}
        </div>

        {/* ⑥ COMBO FINAL — ma reco appliquée */}
        <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑥ Ma reco appliquée — Jakarta 500 · sentence case · sous dots · light/main
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginBottom: 32 }}>
          <div style={{ background: `linear-gradient(135deg, ${T.ink} 0%, ${T.deep} 100%)`, borderRadius: 18, padding: '70px 40px 50px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <Wordmark fontSize={88} colors={darkColors}/>
            <YoppaaDotsV2B base={24} colors={dotsDark}/>
            <Slogan fontSize={18} fontWeight={500} color={T.light}/>
            <p style={{ margin: '14px 0 0', fontSize: 10, fontWeight: 700, color: T.light, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Identité complète, fond foncé</p>
          </div>
          <div style={{ background: '#fff', borderRadius: 18, padding: '70px 40px 50px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, border: `1px solid ${T.pale}` }}>
            <Wordmark fontSize={88} colors={lightColors}/>
            <YoppaaDotsV2B base={24} colors={dotsLight}/>
            <Slogan fontSize={18} fontWeight={500} color={T.main}/>
            <p style={{ margin: '14px 0 0', fontSize: 10, fontWeight: 700, color: T.deep, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Identité complète, fond clair</p>
          </div>
        </div>

        {/* Footer décisionnel */}
        <div style={{ marginTop: 32, padding: '20px 24px', background: T.pale, borderRadius: 12, borderLeft: `4px solid ${T.main}` }}>
          <p style={{ margin: 0, fontSize: 13, color: T.deep, lineHeight: 1.6, fontWeight: 500 }}>
            💡 Décisions à valider :
          </p>
          <ol style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 13, color: T.deep, lineHeight: 1.7 }}>
            <li><strong>Police</strong> : <strong>Plus Jakarta Sans</strong> (cohérence) ?</li>
            <li><strong>Weight</strong> : 400 · <strong>500</strong> · 600 ?</li>
            <li><strong>Capitalisation</strong> : <strong>Ton quartier, dans ta poche.</strong> · ton quartier... · TON QUARTIER... ?</li>
            <li><strong>Position</strong> : <strong>A · sous les dots</strong> · B · entre · C · à droite ?</li>
            <li><strong>Couleur fond foncé</strong> : <strong>light</strong> · mid · blanc 70 % ?</li>
            <li><strong>Couleur fond clair</strong> : <strong>main</strong> · mid · gris muted ?</li>
          </ol>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: T.muted, fontStyle: 'italic' }}>Une fois validé, j&rsquo;ajoute les variantes &laquo;&nbsp;avec slogan&nbsp;&raquo; dans le brand-kit (logos officiels + réseaux sociaux).</p>
        </div>

      </div>
    </div>
  )
}
