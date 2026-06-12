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

        {/* 5. POSITIONNEMENT — au-dessus vs en dessous (esprit Amazon) */}
        <p style={{ margin: '40px 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑤ Positionnement — au-dessus ou en dessous du wordmark&nbsp;?
        </p>

        {/* Comparatif sur fond foncé */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginBottom: 22 }}>
          {/* En haut */}
          <div style={{ background: T.ink, borderRadius: 14, padding: '50px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <YoppaaDots base={22} colors={dark}/>
            <p style={{ margin: 0, fontSize: 64, fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1.5px', textTransform: 'uppercase' }}>A · Points au-dessus</p>
            <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>style « intro classique »</p>
          </div>
          {/* En dessous (style Amazon) */}
          <div style={{ background: T.ink, borderRadius: 14, padding: '50px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <p style={{ margin: 0, fontSize: 64, fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <YoppaaDots base={22} colors={dark}/>
            <p style={{ margin: '10px 0 0', fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1.5px', textTransform: 'uppercase' }}>B · Points en dessous ✨</p>
            <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>esprit Amazon, sourire complet</p>
          </div>
        </div>

        {/* Comparatif sur fond clair */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginBottom: 22 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '50px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, border: `1px solid ${T.pale}` }}>
            <YoppaaDots base={22} colors={lightB}/>
            <p style={{ margin: 0, fontSize: 64, fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1 }}>
              <span style={{ color: T.ink }}>yo</span>
              <span style={{ color: T.main }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '1.5px', textTransform: 'uppercase' }}>A · Points au-dessus</p>
            <p style={{ margin: 0, fontSize: 10, color: T.muted, fontFamily: 'monospace' }}>fond clair</p>
          </div>
          <div style={{ background: '#fff', borderRadius: 14, padding: '50px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, border: `1px solid ${T.pale}` }}>
            <p style={{ margin: 0, fontSize: 64, fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1 }}>
              <span style={{ color: T.ink }}>yo</span>
              <span style={{ color: T.main }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <YoppaaDots base={22} colors={lightB}/>
            <p style={{ margin: '10px 0 0', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '1.5px', textTransform: 'uppercase' }}>B · Points en dessous ✨</p>
            <p style={{ margin: 0, fontSize: 10, color: T.muted, fontFamily: 'monospace' }}>fond clair</p>
          </div>
        </div>

        {/* ⑥ NOUVEAU — Centre plus gros (smiley) vs centre égal (sourire pur Amazon) */}
        <p style={{ margin: '30px 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑥ Centre plus gros ou même taille&nbsp;?
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.deep, lineHeight: 1.55 }}>
          Avec le centre plus gros : effet « smiley » (le centre devient comme un nez). Avec tous de même taille : sourire pur, plus proche de la flèche Amazon. La couleur tricolore suffit à différencier les 3 points sans avoir besoin de variation de taille.
        </p>

        {/* Sur fond foncé — 3 variantes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 18 }}>
          {[
            { ratio: 1.0,  label: 'Tous même taille',   sub: 'sourire pur · esprit Amazon' },
            { ratio: 1.15, label: 'Légèrement plus gros', sub: 'subtil, intermédiaire' },
            { ratio: 1.35, label: 'Plus gros (proposé initial)', sub: 'smiley · effet nez' },
          ].map((v, i) => (
            <div key={i} style={{ background: T.ink, borderRadius: 14, padding: '50px 30px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
              <p style={{ margin: 0, fontSize: 56, fontWeight: 900, letterSpacing: '-2.2px', lineHeight: 1 }}>
                <span style={{ color: '#fff' }}>yo</span>
                <span style={{ color: T.light }}>pp</span>
                <span style={{ color: T.mid }}>aa</span>
              </p>
              <YoppaaDots base={20} centerRatio={v.ratio} yOffsetRatio={0.25} colors={dark}/>
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>{v.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>{v.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Sur fond clair — 3 variantes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 26 }}>
          {[
            { ratio: 1.0,  label: 'Tous même taille' },
            { ratio: 1.15, label: 'Légèrement plus gros' },
            { ratio: 1.35, label: 'Plus gros' },
          ].map((v, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '50px 30px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, border: `1px solid ${T.pale}` }}>
              <p style={{ margin: 0, fontSize: 56, fontWeight: 900, letterSpacing: '-2.2px', lineHeight: 1 }}>
                <span style={{ color: T.ink }}>yo</span>
                <span style={{ color: T.main }}>pp</span>
                <span style={{ color: T.mid }}>aa</span>
              </p>
              <YoppaaDots base={20} centerRatio={v.ratio} yOffsetRatio={0.25} colors={lightB}/>
              <p style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '1px', textTransform: 'uppercase' }}>{v.label}</p>
            </div>
          ))}
        </div>

        {/* ⑦ NOUVEAU — Couleurs des minis sur V2 (maillon) */}
        <p style={{ margin: '30px 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑦ V2 (maillon) — quelle couleur pour les 2 minis ?
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.deep, lineHeight: 1.55 }}>
          Dot gauche corrigé en <strong>blanc pur</strong> (avant 0,55 opacité = gris). Minis en <strong>opacité 1</strong>. Reste à choisir leur couleur : 3 options.
        </p>

        {/* 3 variantes de couleurs minis sur fond foncé */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 26 }}>

          {/* V2-A — Mini gauche reprend le grand de gauche, mini droit reprend le grand de droite */}
          <div style={{ background: T.ink, borderRadius: 14, padding: '50px 24px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 50, fontWeight: 900, letterSpacing: '-2px', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 12, height: 30 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', marginTop: 0 }}/>
              <span style={{ width: 8,  height: 8,  borderRadius: '50%', background: '#fff', marginTop: 8 }}/>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: T.light, marginTop: 8 }}/>
              <span style={{ width: 8,  height: 8,  borderRadius: '50%', background: T.mid, marginTop: 8 }}/>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: T.mid, marginTop: 0 }}/>
            </div>
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>V2-A · Mini = couleur du grand à côté</p>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>blanc · blanc · light · mid · mid</p>
            </div>
          </div>

          {/* V2-B — Mini en transition : suit la couleur du grand suivant */}
          <div style={{ background: T.ink, borderRadius: 14, padding: '50px 24px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 50, fontWeight: 900, letterSpacing: '-2px', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 12, height: 30 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', marginTop: 0 }}/>
              <span style={{ width: 8,  height: 8,  borderRadius: '50%', background: T.light, marginTop: 8 }}/>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: T.light, marginTop: 8 }}/>
              <span style={{ width: 8,  height: 8,  borderRadius: '50%', background: T.mid, marginTop: 8 }}/>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: T.mid, marginTop: 0 }}/>
            </div>
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>V2-B · Mini = couleur du grand qu&rsquo;il rejoint ✨</p>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>blanc · light · light · mid · mid</p>
            </div>
          </div>

          {/* V2-C — Minis neutres (light pour les 2) */}
          <div style={{ background: T.ink, borderRadius: 14, padding: '50px 24px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 50, fontWeight: 900, letterSpacing: '-2px', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 12, height: 30 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', marginTop: 0 }}/>
              <span style={{ width: 8,  height: 8,  borderRadius: '50%', background: T.light, marginTop: 8 }}/>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: T.light, marginTop: 8 }}/>
              <span style={{ width: 8,  height: 8,  borderRadius: '50%', background: T.light, marginTop: 8 }}/>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: T.mid, marginTop: 0 }}/>
            </div>
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>V2-C · Minis neutres en light</p>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>blanc · light · light · light · mid</p>
            </div>
          </div>

        </div>

        {/* ⑧ COMPARATIF FINAL V1 vs V2 avec les bons réglages */}
        <p style={{ margin: '30px 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑧ Le match final — V1 (3 dots purs) vs V2-B (maillon)
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginBottom: 22 }}>
          {/* V1 final */}
          <div style={{ background: T.ink, borderRadius: 14, padding: '60px 40px 44px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
            <p style={{ margin: 0, fontSize: 72, fontWeight: 900, letterSpacing: '-3px', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 22, height: 32 }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#fff', marginTop: 0 }}/>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: T.light, marginTop: 10 }}/>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: T.mid, marginTop: 0 }}/>
            </div>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: T.light, letterSpacing: '1.5px', textTransform: 'uppercase' }}>V1 · Pur 3 dots</p>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>minimaliste, iconique</p>
            </div>
          </div>

          {/* V2-B final */}
          <div style={{ background: T.ink, borderRadius: 14, padding: '60px 40px 44px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
            <p style={{ margin: 0, fontSize: 72, fontWeight: 900, letterSpacing: '-3px', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 14, height: 32 }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#fff', marginTop: 0 }}/>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.light, marginTop: 10 }}/>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: T.light, marginTop: 10 }}/>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.mid, marginTop: 10 }}/>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: T.mid, marginTop: 0 }}/>
            </div>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: T.light, letterSpacing: '1.5px', textTransform: 'uppercase' }}>V2-B · Maillon</p>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>raconte la tribu</p>
            </div>
          </div>
        </div>

        {/* En favicon — V1 vs V2 */}
        <p style={{ margin: '14px 0 12px', fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: '0.5px' }}>
          En favicon 32×32 : la V2 simplifie ses minis quasi-invisibles. Test côte à côte :
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
          {[
            { label: 'V1 · favicon', big: false },
            { label: 'V2 · favicon (3 dots)', big: false, v2: true, smallOnly: true },
            { label: 'V1 · app icon', big: true },
            { label: 'V2 · app icon (5 dots)', big: true, v2: true },
          ].map((c, i) => (
            <div key={i} style={{ background: c.big ? `linear-gradient(135deg, ${T.ink}, ${T.main})` : T.ink, borderRadius: c.big ? 16 : 6, padding: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, aspectRatio: '1', minHeight: 110 }}>
              <p style={{ margin: 0, fontSize: c.big ? 22 : 18, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>
                <span style={{ color: '#fff' }}>yo</span>
                <span style={{ color: T.light }}>pp</span>
                <span style={{ color: T.mid }}>aa</span>
              </p>
              {!c.v2 ? (
                <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: c.big ? 5 : 3, height: c.big ? 10 : 7 }}>
                  <span style={{ width: c.big ? 6 : 4, height: c.big ? 6 : 4, borderRadius: '50%', background: '#fff' }}/>
                  <span style={{ width: c.big ? 6 : 4, height: c.big ? 6 : 4, borderRadius: '50%', background: T.light, marginTop: c.big ? 3 : 2 }}/>
                  <span style={{ width: c.big ? 6 : 4, height: c.big ? 6 : 4, borderRadius: '50%', background: T.mid }}/>
                </div>
              ) : c.smallOnly ? (
                <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 3, height: 7 }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }}/>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.light, marginTop: 2 }}/>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.mid }}/>
                </div>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 3, height: 10 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }}/>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.light, marginTop: 3 }}/>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.light, marginTop: 3 }}/>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.mid, marginTop: 3 }}/>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.mid }}/>
                </div>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 7, color: 'rgba(255,255,255,0.55)', fontWeight: 700, letterSpacing: '0.5px', textAlign: 'center' }}>{c.label}</p>
            </div>
          ))}
        </div>

        {/* Tailles compactes pour usages réels */}
        <p style={{ margin: '30px 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑧ En usage réel — favicon, app icon, signature de bas de page
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
          {/* Favicon 32px */}
          <div style={{ background: T.ink, borderRadius: 8, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, aspectRatio: '1', minHeight: 110 }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <YoppaaDots base={8} colors={dark}/>
            <p style={{ margin: '4px 0 0', fontSize: 8, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>favicon · base 8</p>
          </div>
          {/* Footer signature */}
          <div style={{ background: '#fff', borderRadius: 8, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1px solid ${T.pale}`, minHeight: 110 }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>
              <span style={{ color: T.ink }}>yo</span>
              <span style={{ color: T.main }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <YoppaaDots base={8} colors={lightB}/>
            <p style={{ margin: '4px 0 0', fontSize: 8, color: T.muted, fontFamily: 'monospace' }}>signature · base 8</p>
          </div>
          {/* App icon style */}
          <div style={{ background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, borderRadius: 18, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, aspectRatio: '1', minHeight: 110 }}>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-1.2px', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <YoppaaDots base={10} colors={dark}/>
            <p style={{ margin: '4px 0 0', fontSize: 8, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>app icon</p>
          </div>
          {/* OG image teaser */}
          <div style={{ background: T.ink, borderRadius: 8, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 110 }}>
            <p style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-1.4px', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <YoppaaDots base={12} colors={dark}/>
            <p style={{ margin: '4px 0 0', fontSize: 8, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>partage social</p>
          </div>
        </div>

        {/* ⑨ V2-B UNIFIÉE — preuve technique aux 4 tailles avec ratio mini généreux */}
        <p style={{ margin: '40px 0 14px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          ⑨ V2-B identité unique — viabilité aux 4 échelles
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.deep, lineHeight: 1.55 }}>
          Solution : passer les minis de <strong>ratio 0,4 à 0,55</strong> (plus charnus). Test aux 4 tailles canoniques. À 16 px, les minis tombent à 2,2 px, à la limite mais perceptibles avec un bon rendu pixel.
        </p>

        {/* MaillonDots : composant 5 dots avec ratio mini paramétrable */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
          {[
            { label: 'OG image · base 32', big: 32, fontSize: 80 },
            { label: 'App icon · base 16', big: 16, fontSize: 44 },
            { label: 'Header · base 10',   big: 10, fontSize: 28 },
            { label: 'Favicon · base 4',   big: 4,  fontSize: 14, isFavicon: true },
          ].map((c, i) => {
            const miniSize = Math.max(2.2, c.big * 0.55)
            const gap = c.big * 0.55
            return (
              <div key={i} style={{ background: T.ink, borderRadius: c.isFavicon ? 4 : 10, padding: '24px 12px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: c.big * 0.7, minHeight: 150 }}>
                <p style={{ margin: 0, fontSize: c.fontSize, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1 }}>
                  <span style={{ color: '#fff' }}>yo</span>
                  <span style={{ color: T.light }}>pp</span>
                  <span style={{ color: T.mid }}>aa</span>
                </p>
                <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap, height: c.big + (c.big * 0.4) }}>
                  <span style={{ width: c.big, height: c.big, borderRadius: '50%', background: '#fff', marginTop: 0 }}/>
                  <span style={{ width: miniSize, height: miniSize, borderRadius: '50%', background: T.light, marginTop: c.big * 0.4 }}/>
                  <span style={{ width: c.big, height: c.big, borderRadius: '50%', background: T.light, marginTop: c.big * 0.4 }}/>
                  <span style={{ width: miniSize, height: miniSize, borderRadius: '50%', background: T.mid, marginTop: c.big * 0.4 }}/>
                  <span style={{ width: c.big, height: c.big, borderRadius: '50%', background: T.mid, marginTop: 0 }}/>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 9, fontWeight: 700, color: T.light, letterSpacing: '0.5px', textAlign: 'center' }}>{c.label}</p>
                <p style={{ margin: 0, fontSize: 8, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>mini = {miniSize.toFixed(1)} px</p>
              </div>
            )
          })}
        </div>

        {/* Récap honnêteté technique */}
        <div style={{ background: T.bg, borderRadius: 10, padding: '14px 18px', marginBottom: 28, fontSize: 12, color: T.deep, lineHeight: 1.6 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>🔎 Vérité technique sur 5 dots partout :</p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li><strong>OG image, app icon, header, slides</strong> : aucun souci, c&rsquo;est superbe</li>
            <li><strong>Favicon 32 px</strong> : minis à 2-3 px, perceptibles, bien rendus en SVG</li>
            <li><strong>Favicon 16 px</strong> : minis à 2 px, à la limite (peuvent paraître flous selon le moteur de rendu). Acceptable.</li>
            <li><strong>Broderie textile</strong> : si tu fais des t-shirts/casquettes plus tard, les minis passent à partir de 2 cm de largeur de logo</li>
          </ul>
          <p style={{ margin: '8px 0 0' }}>Verdict : <strong>oui, 5 dots est faisable comme identité unique</strong>, à condition d&rsquo;adopter le ratio mini 0,55 (au lieu de 0,4 testé jusqu&rsquo;ici).</p>
        </div>

        {/* Footer décisionnel */}
        <div style={{ marginTop: 20, padding: '20px 24px', background: T.pale, borderRadius: 12, borderLeft: `4px solid ${T.main}` }}>
          <p style={{ margin: 0, fontSize: 13, color: T.deep, lineHeight: 1.6, fontWeight: 500 }}>
            💡 Décisions à valider :
          </p>
          <ol style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 13, color: T.deep, lineHeight: 1.7 }}>
            <li><strong>Format final unique</strong> : V1 (3 dots) ou <strong>V2-B (5 dots maillon)</strong> ?</li>
            <li><strong>Ratio mini</strong> (si V2-B) : 0,4 (élégant grandes tailles) ou <strong>0,55 (robuste à toutes les tailles)</strong> ?</li>
            <li><strong>Couleurs minis</strong> (si V2-B) : blanc·light·light·mid·mid (progression linéaire tricolore)</li>
            <li><strong>Décalage vertical (sourire)</strong> : 0 · <strong>+25 %</strong> · +40 % ?</li>
            <li><strong>Positionnement</strong> : <strong>en dessous du wordmark</strong> (esprit Amazon, validé)</li>
            <li><strong>Palette fond clair</strong> : Option A (fidèle wordmark) · <strong>Option B (centre saturé)</strong> ?</li>
          </ol>
        </div>

      </div>
    </div>
  )
}
