'use client'
// ════════════════════════════════════════════════════════════════════
// CHEAT SHEET PITCH — 1 page A4 portrait, à imprimer et glisser dans
// le dossier de séance avant l'entrée au collège communal.
//
// URL : yoppaa.app/demo-mettet/cheat-sheet
//
// 6 sections :
//   1. Pitch en 3 phrases (elevator absolu)
//   2. 3 chiffres clés à retenir
//   3. Bouclier (la phrase qui désarme toute objection)
//   4. 9 objections probables avec réponses prêtes
//   5. Close en 3 demandes
//   6. Ressources sous la main (URL + QR code)
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

const URL_LIVE = 'https://www.yoppaa.app/demo-mettet/slides'
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(URL_LIVE)}&size=200x200&margin=0&color=1A0840&bgcolor=FFFFFF`

// Wordmark canonique : Jakarta 800, letter-spacing -5%, minuscules
function Wordmark({ size = 24 }) {
  return (
    <p style={{
      margin: 0,
      fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
      fontSize: size,
      fontWeight: 800,
      letterSpacing: '-0.05em',
      lineHeight: 1,
    }}>
      <span style={{ color: T.ink }}>yo</span>
      <span style={{ color: T.main }}>pp</span>
      <span style={{ color: T.mid }}>aa</span>
    </p>
  )
}

function Eyebrow({ children, color = T.main }) {
  return (
    <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color, letterSpacing: '1.8px', textTransform: 'uppercase' }}>
      {children}
    </p>
  )
}

// ────────── LES OBJECTIONS ──────────

const OBJECTIONS = [
  {
    q: 'Quel est le piège ?',
    r: 'Aucun. Plan public gratuit à vie, écrit dans nos conditions. Nos revenus viennent des commerçants en plan complet, jamais de la commune.',
  },
  {
    q: 'Vous êtes une nouvelle structure. Et si vous disparaissiez ?',
    r: 'Autofinancés. Pas de pression d\'investisseur. Pas de date de péremption imposée. Le plan public reste accessible même en cas d\'arrêt.',
  },
  {
    q: 'Notre site et notre page Facebook suffisent.',
    r: 'Ils n\'envoient pas d\'alerte instantanée. Une coupure d\'eau publiée vendredi à 16 h sur Facebook ? L\'algorithme la diffuse à 30 % des habitants au mieux. Yoppaa complète, ne remplace pas.',
  },
  {
    q: 'Et la concurrence ? TGTG, Uber Eats sont déjà là.',
    r: 'Ils ciblent les chaînes et les grandes villes. Yoppaa cible le commerce de proximité belge. 0 % de commission Yoppaa contre 25 à 30 % chez eux : le commerçant ne paie que les frais de son prestataire de paiement, comme sur son terminal de carte. Pas le même terrain de jeu.',
  },
  {
    q: 'Les commerçants mettetois vont-ils suivre ?',
    r: 'Plusieurs nous accompagnent déjà. Avec votre mention « Partenaire officiel », nous accélérons significativement le bouche-à-oreille local.',
  },
  {
    q: 'Et la RGPD ? Et les données ?',
    r: 'Données hébergées en UE (Francfort). Conformité intégrale. Aucun transfert hors d\'Europe. Pas de cookies tiers Meta ou Google sur nos signalements citoyens.',
  },
  {
    q: 'Combien ça nous coûte ?',
    r: 'Zéro euro. La seule contrepartie : un mot dans le Mettet Z\'infos et une introduction à l\'association des commerçants. Pas de facture, jamais.',
  },
  {
    q: 'Si vous décidez demain de nous facturer ?',
    r: 'Le plan public est gratuit à vie, c\'est inscrit dans nos conditions. Sortie libre à tout moment, sans pénalité. Vos données restent les vôtres.',
  },
  {
    q: 'Pourquoi Mettet en premier ?',
    r: 'Parce que j\'y vis depuis 9 ans. Parce que la dynamique locale s\'y prête. Et parce que la commune qui dit oui en premier reste citée dans tous nos pitchs futurs.',
  },
]

export default function CheatSheet() {
  return (
    <div style={{ background: '#f0f0f0', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* Bandeau d'aide (caché à l'impression) */}
      <div className="print-help" style={{ position: 'sticky', top: 0, zIndex: 100, background: T.ink, color: '#fff', padding: '14px 24px', textAlign: 'center', fontFamily: '"DM Sans", sans-serif', fontSize: 13 }}>
        <strong>Cheat sheet pitch — 1 page A4 portrait</strong> · <kbd style={{ background: 'rgba(255,255,255,0.15)', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>Ctrl + P</kbd> · Format A4 portrait · Marges minimales · Graphiques d&rsquo;arrière-plan activés
      </div>

      <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>

        {/* Le A4 portrait */}
        <div style={{
          width: '210mm',
          height: '297mm',
          background: '#fff',
          boxSizing: 'border-box',
          padding: '14mm 16mm',
          fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
          color: T.ink,
          position: 'relative',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
          boxShadow: '0 0 30px rgba(0,0,0,0.1)',
        }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 10, borderBottom: `2px solid ${T.ink}`, marginBottom: 14 }}>
            <div>
              <Wordmark size={28}/>
              <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 800, color: T.deep, letterSpacing: '-0.2px' }}>
                Aide-mémoire pitch · Collège communal Mettet
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 9, color: T.muted, fontWeight: 600, letterSpacing: '0.5px' }}>
                Lundi 15 juin 2026 · 14 h · Salle du collège
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 8, fontWeight: 800, color: T.main, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Durée</p>
              <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px' }}>8-10 min</p>
            </div>
          </div>

          {/* 1. PITCH EN 3 PHRASES */}
          <div style={{ background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <Eyebrow color={T.light}>Si on me coupe au bout de 30 secondes</Eyebrow>
            <p style={{ margin: '6px 0 0', fontSize: 11, lineHeight: 1.55, fontWeight: 500 }}>
              <strong>1.</strong> Yoppaa est l&rsquo;application belge des commerces de quartier, créée à Mettet et autofinancée.<br/>
              <strong>2.</strong> Plan public <strong style={{ color: T.light }}>gratuit à vie</strong> pour la commune : alertes instantanées, actualités, signalements citoyens géolocalisés.<br/>
              <strong>3.</strong> En échange, nous demandons un <strong style={{ color: T.light }}>mot dans le Mettet Z&rsquo;infos</strong>, une introduction à l&rsquo;association des commerçants, un relais le moment venu.
            </p>
          </div>

          {/* 2. CHIFFRES CLÉS */}
          <div style={{ marginBottom: 12 }}>
            <Eyebrow>3 chiffres à marteler</Eyebrow>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6 }}>
              {[
                { n: '0 %', l: 'de commission Yoppaa sur les ventes' },
                { n: '0 €', l: 'pour la commune, à vie' },
                { n: '5', l: 'fiches officielles déjà construites' },
              ].map((c, i) => (
                <div key={i} style={{ background: T.pale, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.main, letterSpacing: '-1px', lineHeight: 1 }}>{c.n}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 9, color: T.deep, fontWeight: 700, lineHeight: 1.3 }}>{c.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 3. LE BOUCLIER */}
          <div style={{ background: '#FEF3C7', borderLeft: `3px solid #D97706`, borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
            <Eyebrow color="#D97706">Le bouclier (à dire si attaqué)</Eyebrow>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#78350F', fontWeight: 700, lineHeight: 1.4 }}>
              « Vous résiliez quand vous voulez. Le plan public reste gratuit à vie. Vos données restent les vôtres. Aucun engagement, jamais. »
            </p>
          </div>

          {/* 4. OBJECTIONS */}
          <div style={{ marginBottom: 12 }}>
            <Eyebrow>9 objections probables · réponses prêtes</Eyebrow>
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {OBJECTIONS.map((o, i) => (
                <div key={i} style={{ background: T.bg, border: `1px solid ${T.pale}`, borderRadius: 6, padding: '7px 9px' }}>
                  <p style={{ margin: 0, fontSize: 9, fontWeight: 900, color: T.main, lineHeight: 1.3 }}>
                    « {o.q} »
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 8.5, color: T.deep, lineHeight: 1.45, fontWeight: 500 }}>
                    → {o.r}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 5. CLOSE — 3 demandes */}
          <div style={{ marginBottom: 12 }}>
            <Eyebrow>Le close en 3 demandes (à laisser flotter)</Eyebrow>
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { n: '01', t: 'Un partenariat officiel', d: 'Document de la commune reconnaissant Yoppaa comme « Partenaire officiel ».' },
                { n: '02', t: 'Une introduction', d: 'Mise en relation avec l\'association des commerçants de Mettet.' },
                { n: '03', t: 'Un relais, le moment venu', d: 'Parution dans Mettet Z\'infos + partage sur vos canaux.' },
              ].map((d, i) => (
                <div key={i} style={{ background: '#fff', border: `1.5px solid ${T.main}`, borderRadius: 8, padding: '8px 10px' }}>
                  <p style={{ margin: 0, fontSize: 9, fontWeight: 900, color: T.main, letterSpacing: '1.5px' }}>{d.n}</p>
                  <p style={{ margin: '4px 0 3px', fontSize: 11, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px', lineHeight: 1.2 }}>{d.t}</p>
                  <p style={{ margin: 0, fontSize: 8.5, color: T.muted, fontWeight: 500, lineHeight: 1.4 }}>{d.d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 6. RESSOURCES + QR */}
          <div style={{ display: 'flex', gap: 12, paddingTop: 10, borderTop: `1px solid ${T.pale}`, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <Eyebrow>Ressources sous la main</Eyebrow>
              <p style={{ margin: '4px 0 2px', fontSize: 10, color: T.deep, fontWeight: 600 }}>
                <strong>Slides live</strong> · yoppaa.app/demo-mettet/slides
              </p>
              <p style={{ margin: '2px 0', fontSize: 10, color: T.deep, fontWeight: 600 }}>
                <strong>Slides imprimables</strong> · /demo-mettet/slides/print
              </p>
              <p style={{ margin: '2px 0', fontSize: 10, color: T.deep, fontWeight: 600 }}>
                <strong>Mock dashboard commune</strong> · /demo-mettet/dashboard
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: T.main, fontWeight: 700 }}>
                Contact · hello@yoppaa.app
              </p>
            </div>
            <div style={{ flexShrink: 0, padding: 6, background: '#fff', border: `2px solid ${T.main}`, borderRadius: 8 }}>
              { }
              <img src={QR_URL} alt="QR code slides live" style={{ display: 'block', width: 80, height: 80 }}/>
            </div>
          </div>

          {/* Footer pied de page */}
          <div style={{ position: 'absolute', bottom: 6, left: '16mm', right: '16mm', display: 'flex', justifyContent: 'space-between', fontSize: 7.5, color: T.muted, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            <span>Yoppaa · Avcotech SRL · BCE 0731.637.148</span>
            <span>Aide-mémoire confidentiel · ne pas distribuer</span>
          </div>

        </div>
      </div>

      <style jsx global>{`
        body { margin: 0; background: #f0f0f0; }
        @page { size: A4 portrait; margin: 0; }
        @media print {
          .print-help { display: none !important; }
          body { background: #fff !important; }
          html, body { width: 210mm; height: 297mm; }
        }
      `}</style>
    </div>
  )
}
