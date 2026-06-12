'use client'
// ════════════════════════════════════════════════════════════════════
// PREVIEW — Spec définitive des 3 points Yoppaa
//
// URL : yoppaa.app/demo-mettet/dots-preview
//
// Permet à Alex de valider visuellement :
//   - Ratios de taille (centre × 1.30, 1.35, 1.40)
//   - Décalage vertical du centre (effet sourire)
//   - Palette fond clair : Option A (fidèle wordmark) vs Option B (centre main)
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

// ────────── COMPOSANT DOTS PARAMÉTRABLE ──────────
//
// Props :
//   base         : taille du dot extrême (16 par défaut)
//   centerRatio  : ratio taille centre / base (1.35 par défaut)
//   yOffsetRatio : ratio décalage vertical centre / base (0.25 = effet sourire)
//   gapRatio     : ratio gap horizontal / base (0.55)
//   colors       : { left, center, right } — couleurs
//   leftOpacity  : opacité du dot gauche (utile pour blanc translucide)
function YoppaaDots({ base = 16, centerRatio = 1.35, yOffsetRatio = 0.25, gapRatio = 0.55, colors, leftOpacity = 1 }) {
  const centerSize = base * centerRatio
  const yOffset = base * yOffsetRatio
  const gap = base * gapRatio
  // Hauteur du conteneur = max(taille centre + offset, base) pour aligner verticalement
  const containerH = Math.max(centerSize + yOffset, base)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap, height: containerH }}>
      <span style={{ width: base, height: base, borderRadius: '50%', background: colors.left, opacity: leftOpacity, alignSelf: 'flex-start' }}/>
      <span style={{ width: centerSize, height: centerSize, borderRadius: '50%', background: colors.center, marginTop: yOffset, flexShrink: 0 }}/>
      <span style={{ width: base, height: base, borderRadius: '50%', background: colors.right, alignSelf: 'flex-start' }}/>
    </div>
  )
}

// ────────── COMPARATEUR : 3 variantes côte à côte ──────────
function Comparateur({ titre, base = 28, palettes, sous }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>{titre}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
        {palettes.map((p, i) => (
          <div key={i} style={{ background: p.bg, borderRadius: 14, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, border: `1px solid ${p.bg === '#fff' ? T.pale : 'transparent'}` }}>
            <YoppaaDots base={base} centerRatio={p.centerRatio || 1.35} yOffsetRatio={p.yOffsetRatio || 0.25} colors={p.colors} leftOpacity={p.leftOpacity}/>
            <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 800, color: p.textColor, letterSpacing: '0.5px' }}>{p.label}</p>
            {sous && <p style={{ margin: 0, fontSize: 10, color: p.subColor || T.muted, fontFamily: 'monospace' }}>{p.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DotsPreview() {
  // Palette fond foncé (définitive proposée)
  const dark = {
    left: '#FFFFFF',
    center: T.light,
    right: T.mid,
  }
  // Option A : fidèle wordmark
  const lightA = {
    left: T.ink,
    center: T.light,
    right: T.mid,
  }
  // Option B : centre saturé
  const lightB = {
    left: T.ink,
    center: T.main,
    right: T.mid,
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '60px 80px', fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif', color: T.ink }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Preview</p>
          <h1 style={{ margin: '8px 0 8px', fontSize: 36, fontWeight: 900, color: T.ink, letterSpacing: '-1.5px' }}>
            Spec des 3 points Yoppaa
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: T.muted, lineHeight: 1.6 }}>
            Aperçu visuel des variantes pour validation. Spec proposée : centre × 1,35, décalé de 25 % vers le bas, gap × 0,55. <strong style={{ color: T.deep }}>Compare puis dis-moi laquelle tu valides.</strong>
          </p>
        </div>

        {/* 1. SPEC FINALE PROPOSÉE — petite, moyenne, grande */}
        <Comparateur
          titre="① Spec proposée — 3 tailles"
          base={28}
          sous
          palettes={[
            { bg: T.ink,  colors: dark,   label: 'Fond foncé · T=20',         sub: 'centre 27 · y +5',  textColor: '#fff',  subColor: 'rgba(255,255,255,0.5)', centerRatio: 1.35, yOffsetRatio: 0.25 },
            { bg: T.ink,  colors: dark,   label: 'Fond foncé · T=28',         sub: 'centre 38 · y +7',  textColor: '#fff',  subColor: 'rgba(255,255,255,0.5)', centerRatio: 1.35, yOffsetRatio: 0.25 },
            { bg: T.ink,  colors: dark,   label: 'Fond foncé · T=40',         sub: 'centre 54 · y +10', textColor: '#fff',  subColor: 'rgba(255,255,255,0.5)', centerRatio: 1.35, yOffsetRatio: 0.25 },
          ]}
        />

        {/* Affichage spécifique à 3 tailles côte à côte sur fond foncé */}
        <div style={{ background: T.ink, borderRadius: 14, padding: '50px 40px', marginBottom: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 40 }}>
          <div style={{ textAlign: 'center' }}>
            <YoppaaDots base={20} colors={dark}/>
            <p style={{ margin: '14px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '0.5px' }}>S · base 20</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <YoppaaDots base={32} colors={dark}/>
            <p style={{ margin: '14px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '0.5px' }}>M · base 32</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <YoppaaDots base={48} colors={dark}/>
            <p style={{ margin: '14px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '0.5px' }}>L · base 48</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <YoppaaDots base={72} colors={dark}/>
            <p style={{ margin: '14px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '0.5px' }}>XL · base 72</p>
          </div>
        </div>

        {/* 2. FOND CLAIR — Option A vs Option B */}
        <Comparateur
          titre="② Fond clair — option A (fidèle wordmark) vs option B (centre saturé)"
          base={48}
          sous
          palettes={[
            { bg: '#fff', colors: lightA, label: 'Option A · fidèle',          sub: 'ink / light / mid', textColor: T.ink,  centerRatio: 1.35, yOffsetRatio: 0.25 },
            { bg: '#fff', colors: lightB, label: 'Option B · centre saturé',   sub: 'ink / main / mid',  textColor: T.ink,  centerRatio: 1.35, yOffsetRatio: 0.25 },
            { bg: T.bg,   colors: lightB, label: 'Option B · sur bg violet pâle', sub: 'ink / main / mid', textColor: T.ink, centerRatio: 1.35, yOffsetRatio: 0.25 },
          ]}
        />

        {/* 3. VARIATIONS DE GÉOMÉTRIE — pour ajustement fin */}
        <Comparateur
          titre="③ Ajustement géométrie — centre plus ou moins grand ?"
          base={36}
          sous
          palettes={[
            { bg: T.ink, colors: dark, label: 'centre × 1,25',  sub: 'centre 45px',      textColor: '#fff', subColor: 'rgba(255,255,255,0.5)', centerRatio: 1.25, yOffsetRatio: 0.25 },
            { bg: T.ink, colors: dark, label: 'centre × 1,35 ✨', sub: 'centre 49px (proposé)', textColor: '#fff', subColor: 'rgba(255,255,255,0.5)', centerRatio: 1.35, yOffsetRatio: 0.25 },
            { bg: T.ink, colors: dark, label: 'centre × 1,50',  sub: 'centre 54px',      textColor: '#fff', subColor: 'rgba(255,255,255,0.5)', centerRatio: 1.50, yOffsetRatio: 0.25 },
          ]}
        />

        {/* 4. VARIATIONS DÉCALAGE — sourire plus ou moins prononcé */}
        <Comparateur
          titre="④ Ajustement décalage vertical — sourire plus ou moins prononcé ?"
          base={36}
          sous
          palettes={[
            { bg: T.ink, colors: dark, label: 'Pas de décalage',        sub: 'y +0',           textColor: '#fff', subColor: 'rgba(255,255,255,0.5)', centerRatio: 1.35, yOffsetRatio: 0 },
            { bg: T.ink, colors: dark, label: 'Décalage léger ✨',       sub: 'y +25% (proposé)', textColor: '#fff', subColor: 'rgba(255,255,255,0.5)', centerRatio: 1.35, yOffsetRatio: 0.25 },
            { bg: T.ink, colors: dark, label: 'Décalage prononcé',      sub: 'y +40%',         textColor: '#fff', subColor: 'rgba(255,255,255,0.5)', centerRatio: 1.35, yOffsetRatio: 0.40 },
          ]}
        />

        {/* 5. CONTEXTE RÉEL — à côté du wordmark */}
        <p style={{ margin: '40px 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑤ En contexte — combinés au wordmark
        </p>
        <div style={{ background: T.ink, borderRadius: 14, padding: '40px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <YoppaaDots base={20} colors={dark}/>
          <p style={{ margin: 0, fontSize: 64, fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1 }}>
            <span style={{ color: '#fff' }}>yo</span>
            <span style={{ color: T.light }}>pp</span>
            <span style={{ color: T.mid }}>aa</span>
          </p>
        </div>
        <div style={{ background: '#fff', borderRadius: 14, padding: '40px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, border: `1px solid ${T.pale}` }}>
          <YoppaaDots base={20} colors={lightB}/>
          <p style={{ margin: 0, fontSize: 64, fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1 }}>
            <span style={{ color: T.ink }}>yo</span>
            <span style={{ color: T.main }}>pp</span>
            <span style={{ color: T.mid }}>aa</span>
          </p>
        </div>

        {/* Footer décisionnel */}
        <div style={{ marginTop: 40, padding: '20px 24px', background: T.pale, borderRadius: 12, borderLeft: `4px solid ${T.main}` }}>
          <p style={{ margin: 0, fontSize: 13, color: T.deep, lineHeight: 1.6, fontWeight: 500 }}>
            💡 Décisions à valider : <strong>(1)</strong> ratio centre — 1,25, 1,35 ou 1,50 ? · <strong>(2)</strong> décalage vertical — 0, 25 % ou 40 % ? · <strong>(3)</strong> palette fond clair — option A (fidèle wordmark) ou option B (centre saturé) ? · <strong>(4)</strong> on garde aussi le wordmark adapté sur fond clair (yo ink, pp main, aa mid) ou tu préfères revoir ?
          </p>
        </div>

      </div>
    </div>
  )
}
