'use client'
// ════════════════════════════════════════════════════════════════════
// PREVIEW — Pills statut d'ouverture, harmonisation Yoppaa
//
// URL : yoppaa.app/demo-mettet/pills-preview
//
// Probleme : les pills actuelles (vert/rouge/indigo) tranchent visuellement
// sur le fond violet de l'onglet Officiel. Yoppaa = design violet, il faut
// integrer ces statuts SANS perdre la semantique universelle (vert=OK).
//
// 3 propositions :
//   A · Glass violet : translucide + dot semantique. Discret, integre.
//   B · Soft : couleurs semantiques desaturees, opacity faible
//   C · Yoppaa accent : palette violette + dot semantique + chip role
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

// Couleurs semantiques universelles (dots seulement)
const SEM = {
  ouvert: '#10B981',
  ferme:  '#DC2626',
  pause:  '#F59E0B',
  always: T.light,
}

// ────────── ACTUEL (pour comparaison) ──────────
function PillActuel({ etat, label, sousTitre }) {
  const couleurs = {
    ouvert: { bg: '#D1FAE5', fg: '#065F46', dot: '#10B981', border: '#10B98140' },
    always: { bg: '#E0E7FF', fg: '#3730A3', dot: '#6366F1', border: '#6366F140' },
    pause:  { bg: '#FEF3C7', fg: '#92400E', dot: '#F59E0B', border: '#F59E0B40' },
    ferme:  { bg: '#FEE2E2', fg: '#991B1B', dot: '#DC2626', border: '#DC262640' },
  }[etat]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px 4px 9px', borderRadius: 100, background: couleurs.bg, border: `1px solid ${couleurs.border}`, fontSize: 11, fontWeight: 700, color: couleurs.fg, letterSpacing: '0.2px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: couleurs.dot }}/>
      <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{label}</span>
      {sousTitre && <span style={{ fontWeight: 600, opacity: 0.9 }}>· {sousTitre}</span>}
    </span>
  )
}

// ────────── OPTION A · Glass violet ──────────
// Translucide blanc/violet + dot semantique. Tres discret, integre.
function PillGlass({ etat, label, sousTitre, dark = false }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px 4px 9px', borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(26,8,64,0.06)',
      border: `1px solid ${dark ? 'rgba(255,255,255,0.18)' : 'rgba(26,8,64,0.12)'}`,
      backdropFilter: 'blur(8px)',
      fontSize: 11, fontWeight: 700,
      color: dark ? 'rgba(255,255,255,0.92)' : T.deep,
      letterSpacing: '0.2px',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEM[etat], boxShadow: `0 0 8px ${SEM[etat]}99`, animation: etat === 'ouvert' ? 'pillPulse 2s ease-in-out infinite' : 'none' }}/>
      <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{label}</span>
      {sousTitre && <span style={{ fontWeight: 600, opacity: 0.85 }}>· {sousTitre}</span>}
    </span>
  )
}

// ────────── OPTION B · Soft semantique ──────────
// Couleurs semantiques mais desaturees, bg leger
function PillSoft({ etat, label, sousTitre, dark = false }) {
  const c = {
    ouvert: { hue: '52, 168, 110' },  // vert plus muted
    ferme:  { hue: '194, 64, 74' },   // rouge plus muted
    pause:  { hue: '194, 124, 50' },  // ambre plus muted
    always: { hue: '196, 160, 244' }, // light (Yoppaa)
  }[etat]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px 4px 9px', borderRadius: 100,
      background: dark ? `rgba(${c.hue}, 0.18)` : `rgba(${c.hue}, 0.14)`,
      border: `1px solid rgba(${c.hue}, ${dark ? 0.35 : 0.28})`,
      fontSize: 11, fontWeight: 700,
      color: dark ? `rgb(${c.hue})` : `rgb(${c.hue})`,
      letterSpacing: '0.2px',
      filter: dark ? 'brightness(1.4)' : 'none',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: `rgb(${c.hue})`, animation: etat === 'ouvert' ? 'pillPulse 2s ease-in-out infinite' : 'none' }}/>
      <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{label}</span>
      {sousTitre && <span style={{ fontWeight: 600, opacity: 0.85 }}>· {sousTitre}</span>}
    </span>
  )
}

// ────────── OPTION C · Yoppaa accent (full violet) ──────────
// Palette violette + dot semantique pour info universelle
function PillYoppaa({ etat, label, sousTitre, dark = false }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px 4px 9px', borderRadius: 100,
      background: dark ? `${T.light}22` : `${T.main}14`,
      border: `1px solid ${dark ? T.light + '44' : T.main + '22'}`,
      fontSize: 11, fontWeight: 700,
      color: dark ? T.light : T.deep,
      letterSpacing: '0.2px',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEM[etat], boxShadow: `0 0 6px ${SEM[etat]}88`, animation: etat === 'ouvert' ? 'pillPulse 2s ease-in-out infinite' : 'none' }}/>
      <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{label}</span>
      {sousTitre && <span style={{ fontWeight: 600, opacity: 0.85 }}>· {sousTitre}</span>}
    </span>
  )
}

function Row({ Pill, dark = false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <Pill etat="ouvert" label="Ouvert" sousTitre="Ferme à 18:00" dark={dark}/>
      <Pill etat="always" label="24h/24" dark={dark}/>
      <Pill etat="pause" label="Pause midi" sousTitre="Réouvre à 13:00" dark={dark}/>
      <Pill etat="ferme" label="Fermé" sousTitre="Ouvre demain à 08:00" dark={dark}/>
    </div>
  )
}

export default function PillsPreview() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '40px 20px 80px', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`@keyframes pillPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }`}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Brand · Pills</p>
          <h1 style={{ margin: '6px 0 8px', fontSize: 32, fontWeight: 900, color: T.ink, letterSpacing: '-1px' }}>
            Pills statut, harmonisation Yoppaa
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
            Probleme : vert/rouge/indigo tranchent sur fond violet onglet Officiel. 3 propositions.
          </p>
        </div>

        {/* ACTUEL */}
        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>0 · Actuel (référence)</p>
        <div style={{ marginBottom: 18 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 18, border: `1px solid ${T.pale}`, marginBottom: 10 }}>
            <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>Fond clair (home)</p>
            <Row Pill={PillActuel}/>
          </div>
          <div style={{ background: `linear-gradient(160deg, ${T.deep}, ${T.ink})`, borderRadius: 12, padding: 18 }}>
            <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>Fond foncé (onglet Officiel) — problème ici</p>
            <Row Pill={PillActuel}/>
          </div>
        </div>

        {/* OPTION A */}
        <p style={{ margin: '32px 0 12px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>A · Glass violet — discret, intégré ✨</p>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: T.deep }}>Fond translucide (blanc sur foncé, ink sur clair) + dot couleur sémantique. Le label s&rsquo;adapte au fond.</p>
        <div style={{ marginBottom: 18 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 18, border: `1px solid ${T.pale}`, marginBottom: 10 }}>
            <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>Fond clair</p>
            <Row Pill={PillGlass} dark={false}/>
          </div>
          <div style={{ background: `linear-gradient(160deg, ${T.deep}, ${T.ink})`, borderRadius: 12, padding: 18 }}>
            <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>Fond foncé</p>
            <Row Pill={PillGlass} dark={true}/>
          </div>
        </div>

        {/* OPTION B */}
        <p style={{ margin: '32px 0 12px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>B · Soft sémantique — couleurs désaturées</p>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: T.deep }}>Garde les codes couleur (vert/rouge/ambre) mais plus muted, opacity plus faible.</p>
        <div style={{ marginBottom: 18 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 18, border: `1px solid ${T.pale}`, marginBottom: 10 }}>
            <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>Fond clair</p>
            <Row Pill={PillSoft} dark={false}/>
          </div>
          <div style={{ background: `linear-gradient(160deg, ${T.deep}, ${T.ink})`, borderRadius: 12, padding: 18 }}>
            <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>Fond foncé</p>
            <Row Pill={PillSoft} dark={true}/>
          </div>
        </div>

        {/* OPTION C */}
        <p style={{ margin: '32px 0 12px', fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>C · Yoppaa accent — palette violette + dot sémantique</p>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: T.deep }}>Tout violet (background + texte) + dot couleur sémantique. Maximum d&rsquo;intégration brand.</p>
        <div style={{ marginBottom: 18 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 18, border: `1px solid ${T.pale}`, marginBottom: 10 }}>
            <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>Fond clair</p>
            <Row Pill={PillYoppaa} dark={false}/>
          </div>
          <div style={{ background: `linear-gradient(160deg, ${T.deep}, ${T.ink})`, borderRadius: 12, padding: 18 }}>
            <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: T.light, letterSpacing: '1px', textTransform: 'uppercase' }}>Fond foncé</p>
            <Row Pill={PillYoppaa} dark={true}/>
          </div>
        </div>

        {/* Decision footer */}
        <div style={{ marginTop: 32, padding: '20px 24px', background: T.pale, borderRadius: 12, borderLeft: `4px solid ${T.main}` }}>
          <p style={{ margin: 0, fontSize: 13, color: T.deep, lineHeight: 1.65, fontWeight: 500 }}>
            <strong>💡 Ma reco : Option A (Glass violet)</strong>
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 12.5, color: T.deep, lineHeight: 1.7 }}>
            <li><strong>Intégration brand</strong> : le label disparait dans le contexte, le dot porte l&rsquo;info sémantique. Plus discret = plus pro.</li>
            <li><strong>Lisibilité préservée</strong> : couleur sémantique sur le dot reste universelle (vert/rouge/ambre)</li>
            <li><strong>Cohérent sur les 2 fonds</strong> : translucide blanc sur foncé, translucide ink sur clair</li>
            <li><strong>Esprit Apple/Linear</strong> : badges minimalistes, signal mais pas bruit</li>
          </ul>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: T.muted, fontStyle: 'italic' }}>
            B garde les codes couleur mais reste un peu "vert/rouge". C est très Yoppaa mais perd la lecture "rouge = fermé" si on regarde vite.
          </p>
        </div>
      </div>
    </div>
  )
}
