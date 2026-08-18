'use client'
// ════════════════════════════════════════════════════════════════════
// VERSION IMPRIMABLE — Slides Collège Communal Mettet (15 juin 2026)
//
// URL : yoppaa.app/demo-mettet/slides/print
//
// Format : A4 paysage, 1 slide par page avec page-break.
// + Page de garde au début
// + Page récapitulative finale avec QR code + coordonnées
//
// Usage : ouvrir l'URL, Ctrl+P → enregistrer en PDF → imprimer 5-7
// exemplaires couleur pour distribution au collège communal.
//
// Les iframes des démos (slides 8, 9, 10) sont remplacés par des
// placeholders élégants pointant vers le QR code de la version live.
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
  muted:  '#9B8FB8',
}

const URL_LIVE = 'https://www.yoppaa.app/demo-mettet/slides'
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(URL_LIVE)}&size=400x400&margin=0&color=1A0840&bgcolor=FFFFFF`

// Container A4 paysage : 297mm × 210mm
// La className 'a4-page' permet au CSS print de gerer le page-break
// uniformement (et exclure la derniere page via :last-child).
const A4 = {
  width: '297mm',
  height: '210mm',
  position: 'relative',
  overflow: 'hidden',
  boxSizing: 'border-box',
  fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
  color: T.ink,
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
}

// ────────── UTILITAIRES ──────────


// Wordmark seul (pour usages sans dots)
function Wordmark({ size = 56, white = false }) {
  return (
    <p style={{
      margin: 0,
      fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
      fontSize: size,
      fontWeight: 800,
      letterSpacing: '-0.05em',
      lineHeight: 1,
    }}>
      <span style={{ color: white ? '#FFFFFF' : T.ink }}>yo</span>
      <span style={{ color: white ? T.light : T.main }}>pp</span>
      <span style={{ color: T.mid }}>aa</span>
    </p>
  )
}

function Footer({ n, total = 12 }) {
  return (
    <div style={{ position: 'absolute', bottom: 18, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 28px', fontSize: 9, color: T.muted, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
      <span>Yoppaa · Collège communal Mettet · 15 juin 2026</span>
      <span>{String(n).padStart(2, '0')} · {total}</span>
    </div>
  )
}

// ────────── SLIDES ──────────

// ─── 1 ─────────────────────────────────────────────────────────────
function Slide1() {
  return (
    <div className="a4-page" style={{ ...A4, background: `linear-gradient(135deg, ${T.panel} 0%, ${T.deep} 50%, ${T.ink} 100%)`, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50mm' }}>
      <div style={{ position: 'absolute', top: '20%', right: '15%', width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${T.mid}55 0%, transparent 70%)`, filter: 'blur(50px)' }}/>

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <Wordmark size={120} white/>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.light, lineHeight: 1.35 }}>
          Pour la commune de Mettet,<br/>ses commerçants et ses habitants
        </p>
        <div style={{ height: 1, width: 200, background: 'rgba(255,255,255,0.3)', margin: '4px 0' }}/>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '2px', textTransform: 'uppercase' }}>
          Collège communal · 15 juin 2026 · 14 h
        </p>
      </div>
      <Footer n={1}/>
    </div>
  )
}

// ─── 2 ─────────────────────────────────────────────────────────────
function Slide2() {
  return (
    <div className="a4-page" style={{ ...A4, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30mm 40mm', gap: '20mm' }}>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 180, height: 180, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 64, color: '#fff', fontWeight: 900, letterSpacing: '-3px' }}>AV</span>
        </div>
        <span style={{ background: T.pale, color: T.deep, padding: '4px 10px', borderRadius: 100, fontSize: 9, fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
          🏠 Votre voisin
        </span>
      </div>
      <div style={{ textAlign: 'left', maxWidth: 380 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Qui je suis</p>
        <h1 style={{ margin: '8px 0 4px', fontSize: 44, fontWeight: 900, color: T.ink, letterSpacing: '-2px', lineHeight: 1 }}>Alexandre<br/>Verstappen</h1>
        <p style={{ margin: '20px 0 6px', fontSize: 16, color: T.deep, lineHeight: 1.5 }}><strong>Djobin depuis 9 ans</strong></p>
        <p style={{ margin: '6px 0', fontSize: 14, color: T.deep }}>📍 Rue de Prée 9G — 5640 Mettet</p>
        <p style={{ margin: '24px 0 0', fontSize: 12, color: T.muted, fontStyle: 'italic', lineHeight: 1.6 }}>
          Yoppaa est née d&rsquo;une intuition simple : le commerce de quartier mérite mieux qu&rsquo;une page Facebook oubliée.
        </p>
      </div>
      <Footer n={2}/>
    </div>
  )
}

// ─── 3 ─────────────────────────────────────────────────────────────
function Slide3() {
  return (
    <div className="a4-page" style={{ ...A4, background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30mm 40mm', textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Le constat</p>
      <h2 style={{ margin: '14px 0 24px', fontSize: 34, fontWeight: 900, color: T.ink, letterSpacing: '-1.2px', lineHeight: 1.2, maxWidth: 800 }}>
        Qui, maintenant, sait ce que les commerces<br/>de l&rsquo;entité <span style={{ color: T.main }}>proposeront demain matin&nbsp;?</span>
      </h2>
      <p style={{ margin: '0 0 24px', fontSize: 17, color: T.deep, fontWeight: 500, maxWidth: 700, lineHeight: 1.5 }}>
        Vos habitants ouvrent leur téléphone cent fois par jour.<br/>
        Ils y trouvent toutes les grandes plateformes mondiales.
      </p>
      <div style={{ background: '#FEE2E2', padding: '14px 28px', borderRadius: 100, border: '2px solid #FCA5A5' }}>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#991B1B' }}>... mais presque jamais les commerces de proximité.</p>
      </div>
      <Footer n={3}/>
    </div>
  )
}

// ─── 4 ─────────────────────────────────────────────────────────────
function Slide4() {
  const items = [
    { emoji: '📅', label: 'Bulletin',         detail: 'Bimestriel, jusqu\'à deux mois de délai' },
    { emoji: '🌐', label: 'Site internet',    detail: 'Statique, l\'habitant doit venir' },
    { emoji: '📣', label: 'Facebook',         detail: 'L\'algorithme décide qui voit quoi' },
    { emoji: '🐢', label: 'Pas instantané',   detail: 'Aucune alerte en temps réel' },
  ]
  return (
    <div className="a4-page" style={{ ...A4, background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '25mm 35mm', textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Vous aussi, vous voulez communiquer</p>
      <h2 style={{ margin: '12px 0 8px', fontSize: 28, fontWeight: 900, color: T.ink, letterSpacing: '-1px', lineHeight: 1.2 }}>
        Votre <span style={{ color: T.main }}>bulletin</span>, votre <span style={{ color: T.main }}>site</span>, votre <span style={{ color: T.main }}>page Facebook</span> sont précieux...
      </h2>
      <p style={{ margin: '0 0 22px', fontSize: 16, color: T.muted, fontStyle: 'italic' }}>... mais peuvent-ils tout faire&nbsp;?</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, maxWidth: 900, width: '100%' }}>
        {items.map((b, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '14px 12px', border: `1px solid ${T.pale}` }}>
            <p style={{ margin: 0, fontSize: 28 }}>{b.emoji}</p>
            <p style={{ margin: '8px 0 4px', fontSize: 14, fontWeight: 900, color: T.ink }}>{b.label}</p>
            <p style={{ margin: 0, fontSize: 10, color: T.muted, fontWeight: 600, lineHeight: 1.4 }}>{b.detail}</p>
          </div>
        ))}
      </div>
      <p style={{ margin: '28px 0 0', fontSize: 13, color: T.deep, fontWeight: 600, maxWidth: 700, lineHeight: 1.5 }}>
        Il faut <strong style={{ color: T.main }}>compléter</strong>, pas remplacer.<br/>
        Un canal numérique instantané, interactif, que vous contrôlez.
      </p>
      <Footer n={4}/>
    </div>
  )
}

// ─── 5 ─────────────────────────────────────────────────────────────
function Slide5() {
  return (
    <div className="a4-page" style={{ ...A4, background: `linear-gradient(135deg, ${T.panel} 0%, ${T.deep} 60%, ${T.ink} 100%)`, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30mm 40mm', textAlign: 'center' }}>
      <Wordmark size={100} white/>
      <p style={{ margin: '20px 0 0', fontSize: 20, fontWeight: 700, color: T.light, lineHeight: 1.3, textAlign: 'center' }}>
        L&rsquo;application belge<br/>des commerces de quartier
      </p>
      <div style={{ display: 'flex', gap: 18, marginTop: 36 }}>
        {[
          { icon: '🏪', label: 'Commerçants' },
          { icon: '👥', label: 'Citoyens' },
          { icon: '🏛️', label: 'Services publics' },
        ].map((p, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(196,160,244,0.3)', borderRadius: 12, padding: '18px 24px', textAlign: 'center', minWidth: 140 }}>
            <p style={{ margin: 0, fontSize: 32 }}>{p.icon}</p>
            <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 800, color: '#fff' }}>{p.label}</p>
          </div>
        ))}
      </div>
      <p style={{ margin: '40px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600, maxWidth: 700, lineHeight: 1.5 }}>
        Créé à Mettet, autofinancé pour préserver notre indépendance stratégique.
      </p>
      <Footer n={5}/>
    </div>
  )
}

// ─── 6 ─────────────────────────────────────────────────────────────
function Slide6() {
  const types = [
    { emoji: '🥖', titre: 'Commerce alimentaire', sub: 'Boulangerie, pizzeria, friterie, traiteur, épicerie, chocolatier...', color: '#F59E0B' },
    { emoji: '💄', titre: 'Commerces de service', sub: 'Institut de beauté, coiffeur, salle de fitness, garagiste...', color: '#10B981' },
    { emoji: '🛍️', titre: 'Commerce de détail',   sub: 'Fleuriste, magasin de vêtements, déco, informatique...', color: '#6B35C4' },
  ]
  const possibilites = [
    { emoji: '🛒', label: 'Click & Collect' },
    { emoji: '🚲', label: 'Livraison locale' },
    { emoji: '🔔', label: 'Bons plans par notification' },
    { emoji: '☀️', label: 'Good Morning Yoppers' },
    { emoji: '📦', label: 'Stocks en temps réel' },
    { emoji: '📅', label: 'Rendez-vous en ligne' },
    { emoji: '🔒', label: 'Paiements sécurisés' },
    { emoji: '👥', label: 'Multi-praticiens' },
    { emoji: '🪟', label: 'Vitrine numérique' },
    { emoji: '⭐', label: 'Système de fidélité' },
    { emoji: '📸', label: 'Accompagnement visibilité' },
  ]
  return (
    <div className="a4-page" style={{ ...A4, background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18mm 30mm', textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Une seule application, trois expériences</p>
      <h2 style={{ margin: '10px 0 18px', fontSize: 26, fontWeight: 900, color: T.ink, letterSpacing: '-1px', lineHeight: 1.1 }}>
        Pensée pour <span style={{ color: T.main }}>chaque type</span> de commerce
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: '100%', marginBottom: 18 }}>
        {types.map((t, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', textAlign: 'left', border: `1px solid ${T.pale}`, borderTop: `3px solid ${t.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{t.emoji}</span>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: T.ink }}>{t.titre}</p>
            </div>
            <p style={{ margin: 0, fontSize: 9.5, color: T.muted, fontWeight: 500, lineHeight: 1.4 }}>{t.sub}</p>
          </div>
        ))}
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 800, color: T.deep, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Et pour chacun, ces possibilités</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, width: '100%' }}>
        {possibilites.map((p, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', border: `1px solid ${T.pale}`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>{p.emoji}</span>
            <span style={{ fontSize: 9, color: T.deep, fontWeight: 600, lineHeight: 1.3, textAlign: 'left' }}>{p.label}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: '16px 0 0', fontSize: 12, color: T.deep, fontWeight: 600, fontStyle: 'italic' }}>
        Un boulanger n&rsquo;a pas les mêmes besoins qu&rsquo;un coiffeur. Nous l&rsquo;avons compris.
      </p>
      <Footer n={6}/>
    </div>
  )
}

// ─── 7 ─────────────────────────────────────────────────────────────
function Slide7() {
  const items = [
    { icon: '💰', label: '0 % de commission Yoppaa', detail: 'Nous ne prélevons rien sur les ventes. Seuls les frais du prestataire de paiement s\'appliquent, comme pour un terminal de carte en magasin.' },
    { icon: '🆓', label: 'Plan gratuit à vie',       detail: 'Présence, actualités, favoris, signaux citoyens. Zéro euro, à vie.' },
    { icon: '🚪', label: 'Sortie libre',             detail: 'Vous résiliez, vous basculez vers le plan gratuit. Vos données restent les vôtres.' },
    { icon: '🇧🇪', label: 'Données hébergées en UE', detail: 'Conformité RGPD intégrale. Aucun transfert hors d\'Europe.' },
  ]
  return (
    <div className="a4-page" style={{ ...A4, background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '25mm 35mm', textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Pas de petits caractères</p>
      <h2 style={{ margin: '12px 0 24px', fontSize: 32, fontWeight: 900, color: T.ink, letterSpacing: '-1.2px' }}>
        Notre <span style={{ color: T.main }}>transparence</span>
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, maxWidth: 800, width: '100%' }}>
        {items.map((it, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', border: `1px solid ${T.pale}`, textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <p style={{ margin: 0, fontSize: 24, flexShrink: 0 }}>{it.icon}</p>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: T.ink }}>{it.label}</p>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: T.muted, lineHeight: 1.5, fontWeight: 500 }}>{it.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: '24px 0 0', fontSize: 12, color: T.deep, fontWeight: 700, fontStyle: 'italic', maxWidth: 700, lineHeight: 1.5 }}>
        Si vous trouvez un piège dans nos conditions générales, l&rsquo;abonnement complet<br/>est offert à vie au commerçant qui le repère. 🟣
      </p>
      <Footer n={7}/>
    </div>
  )
}

// ─── 8, 9, 10 (DÉMOS) ──────────────────────────────────────────────
function SlideDemo({ n, label, titre, commentaire, ecran }) {
  return (
    <div className="a4-page" style={{ ...A4, background: `linear-gradient(135deg, ${T.bg} 0%, ${T.pale} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20mm 30mm', gap: '20mm' }}>
      <div style={{ flex: 1, maxWidth: 400, textAlign: 'left' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>{label}</p>
        <h2 style={{ margin: '12px 0 20px', fontSize: 26, fontWeight: 900, color: T.ink, letterSpacing: '-1px', lineHeight: 1.15 }}>{titre}</h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.deep, lineHeight: 1.55, fontWeight: 500 }}>{commentaire}</p>
        <div style={{ background: T.pale, border: `1px dashed ${T.main}`, borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: T.main, letterSpacing: '1px', textTransform: 'uppercase' }}>📱 Démo live</p>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>
            Pour voir cet écran en direct : scannez le QR code à la fin du document.
          </p>
        </div>
      </div>
      {/* Représentation simplifiée d'un téléphone (pas d'iframe en print) */}
      <div style={{ width: 220, height: 460, background: '#1a1a1a', borderRadius: 32, padding: 8, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)', width: 70, height: 14, background: '#0a0a0a', borderRadius: '0 0 12px 12px' }}/>
        <div style={{ background: '#fff', height: '100%', borderRadius: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 30 }}>{ecran.emoji}</p>
          <p style={{ margin: '12px 0 4px', fontSize: 12, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>{ecran.titre}</p>
          <p style={{ margin: 0, fontSize: 9, color: T.muted, lineHeight: 1.4 }}>{ecran.sub}</p>
        </div>
      </div>
      <Footer n={n}/>
    </div>
  )
}

function Slide8() {
  return (
    <SlideDemo n={8}
      label="Démonstration ①"
      titre="Vos habitants trouvent vos commerces"
      commentaire="Plusieurs commerçants de l'entité de Mettet nous accompagnent déjà dans le développement et le lancement de ce projet. Fiches locales, statuts en temps réel, favoris, actus, bons plans et fidélité."
      ecran={{ emoji: '🏪', titre: 'Liste des commerces', sub: 'Cards locales, statuts en temps réel, favoris, bons plans' }}
    />
  )
}

function Slide9() {
  return (
    <SlideDemo n={9}
      label="Démonstration ②"
      titre="Vous publiez, ils reçoivent instantanément"
      commentaire="Votre fiche de l'administration communale de Mettet est déjà construite. Une alerte, une coupure d'eau, des travaux, cela apparaît instantanément dans les téléphones des habitants de l'entité dès l'enregistrement par vos services. Et chaque matin, le Good Morning Yoppers rassemble alertes, actualités et bons plans, comme le journal quotidien."
      ecran={{ emoji: '🏛️', titre: 'Fiche commune Mettet', sub: 'Alerte AIEM + Good Morning Yoppers' }}
    />
  )
}

function Slide10() {
  return (
    <SlideDemo n={10}
      label="Démonstration ③"
      titre="Les signalements citoyens"
      commentaire="14 h 00 : un habitant de Mettet, un Yopper, utilisateur de Yoppaa aperçoit un nid-de-poule. 14 h 05 : le signalement est dans la messagerie et le tableau de bord du service concerné, accompagné d'une photo géolocalisée et d'un descriptif."
      ecran={{ emoji: '🕳️', titre: 'Signalement citoyen', sub: 'Photo + géoloc + descriptif → service voirie' }}
    />
  )
}

// ─── 11 ────────────────────────────────────────────────────────────
function Slide11() {
  const items = [
    { label: '5 fiches officielles',         detail: 'Administration communale, CPAS, police, médecin de garde, 112' },
    { label: '23 numéros internes',          detail: 'Tous les services, cliquables' },
    { label: '5 agents de quartier',         detail: 'Dirigés automatiquement par village' },
    { label: '3 publications saisies',       detail: 'Coupure d\'eau · Travaux · Marché du terroir' },
    { label: 'Signalements opérationnels',   detail: 'Nid-de-poule, dépôt sauvage, égout' },
    { label: 'Tableau de bord communal',     detail: 'Prêt à vous être attribué' },
  ]
  return (
    <div className="a4-page" style={{ ...A4, background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18mm 30mm', textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Déjà construit pour Mettet</p>
      <h2 style={{ margin: '10px 0 20px', fontSize: 24, fontWeight: 900, color: T.ink, letterSpacing: '-1px', lineHeight: 1.1, maxWidth: 800 }}>
        Nous n&rsquo;avons pas attendu votre validation pour préparer le terrain
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, width: '100%', marginBottom: 18 }}>
        {items.map((it, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', border: `1px solid ${T.pale}`, display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 900, color: T.ink }}>{it.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 9, color: T.muted, fontWeight: 500, lineHeight: 1.4 }}>{it.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', borderRadius: 14, padding: '16px 28px', maxWidth: 700, width: '100%', textAlign: 'left' }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: T.light, letterSpacing: '2px', textTransform: 'uppercase' }}>Notre proposition</p>
        <p style={{ margin: '4px 0', fontSize: 20, fontWeight: 900 }}>Le plan public, gratuit à vie.</p>
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 500, lineHeight: 1.5 }}>
          Aucun frais, aucun engagement. Vous gardez la main éditoriale, la publication est instantanée.
        </p>
      </div>
      <p style={{ margin: '16px 0 0', fontSize: 12, color: T.deep, fontWeight: 700, fontStyle: 'italic' }}>Vous décidez du moment où nous l&rsquo;activons.</p>
      <Footer n={11}/>
    </div>
  )
}

// ─── 12 ────────────────────────────────────────────────────────────
function Slide12() {
  return (
    <div className="a4-page" style={{ ...A4, background: `linear-gradient(135deg, ${T.panel} 0%, ${T.deep} 60%, ${T.ink} 100%)`, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '22mm 35mm', textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '2.5px', textTransform: 'uppercase' }}>Si vous y croyez</p>
      <h2 style={{ margin: '14px 0 12px', fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-1.2px', lineHeight: 1.15, maxWidth: 900 }}>
        Trois manières simples<br/>de nous soutenir, à votre rythme
      </h2>
      <p style={{ margin: '0 0 22px', fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500, maxWidth: 800, lineHeight: 1.55 }}>
        Nous vous offrons une infrastructure numérique gratuite, sans contrepartie financière.<br/>
        Si le projet vous convainc, voici comment lui donner un coup de pouce. Rien d&rsquo;engageant, rien de daté.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: '100%' }}>
        {[
          { titre: 'Un partenariat officiel',          detail: 'Un document de la commune reconnaissant Yoppaa comme « Partenaire officiel ». Un appui institutionnel pour accélérer le développement.' },
          { titre: 'Une introduction',                  detail: 'Une mise en relation avec l\'association des commerçants de Mettet, pour leur présenter l\'outil.' },
          { titre: 'Un relais, le moment venu',         detail: 'Une parution dans le Mettet Z\'infos, un partage sur vos canaux (site internet, page Facebook), le jour où vous l\'estimez pertinent.' },
        ].map((d, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid rgba(196,160,244,0.3)`, borderRadius: 12, padding: '14px 16px', textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#fff', lineHeight: 1.3 }}>{d.titre}</p>
            <p style={{ margin: '8px 0 0', fontSize: 9.5, color: T.light, lineHeight: 1.55, fontWeight: 500 }}>{d.detail}</p>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 28, padding: '14px 32px', borderTop: '1px solid rgba(255,255,255,0.15)', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.55, maxWidth: 700 }}>
          Dans les prochains mois, lorsque nous présenterons Yoppaa<br/>
          à d&rsquo;autres communes, nous dirons :<br/>
          <strong style={{ color: T.light, fontWeight: 800 }}>« Mettet a été la première. »</strong>
        </p>
      </div>
      <Footer n={12}/>
    </div>
  )
}

// ────────── PAGE RÉCAPITULATIVE FINALE AVEC QR CODE ──────────

function PageRecap() {
  return (
    <div className="a4-page" style={{ ...A4, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '25mm 35mm', gap: '25mm' }}>
      {/* Colonne gauche : récap */}
      <div style={{ flex: 1, maxWidth: 460 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Pour aller plus loin</p>
        <h2 style={{ margin: '12px 0 20px', fontSize: 32, fontWeight: 900, color: T.ink, letterSpacing: '-1.3px', lineHeight: 1.1 }}>
          Voir la <span style={{ color: T.main }}>démonstration live</span>
        </h2>

        <p style={{ margin: '0 0 22px', fontSize: 13, color: T.deep, lineHeight: 1.6 }}>
          Cette présentation imprimée résume notre proposition. Pour voir les écrans de l&rsquo;application en direct (démonstrations interactives, navigation réelle), scannez le QR code ci-contre ou rendez-vous à l&rsquo;adresse&nbsp;:
        </p>

        <div style={{ background: T.pale, borderLeft: `4px solid ${T.main}`, borderRadius: 10, padding: '12px 16px', marginBottom: 22 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: T.deep, letterSpacing: '-0.3px', wordBreak: 'break-all' }}>
            yoppaa.app/demo-mettet/slides
          </p>
        </div>

        <div style={{ borderTop: `1px solid ${T.pale}`, paddingTop: 18 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Vos contacts</p>
          <p style={{ margin: '10px 0 4px', fontSize: 16, fontWeight: 800, color: T.ink }}>Alexandre Verstappen</p>
          <p style={{ margin: '4px 0', fontSize: 12, color: T.deep }}>Avcotech SRL · BCE 0731.637.148</p>
          <p style={{ margin: '4px 0', fontSize: 12, color: T.deep }}>📍 Rue de Prée 9G — 5640 Mettet</p>
          <p style={{ margin: '4px 0', fontSize: 12, color: T.main, fontWeight: 700 }}>✉️ hello@yoppaa.app</p>
        </div>
      </div>

      {/* Colonne droite : QR code */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ padding: 12, background: '#fff', borderRadius: 18, boxShadow: '0 8px 28px rgba(26,8,64,0.18)', border: `2px solid ${T.main}` }}>
          { }
          <img decoding="async" loading="lazy" src={QR_URL} alt="QR code vers la présentation en ligne" style={{ display: 'block', width: 220, height: 220 }}/>
        </div>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Scannez avec votre téléphone
        </p>
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <Wordmark size={40}/>
          <p style={{ margin: '4px 0 0', fontSize: 9, color: T.muted, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            L&rsquo;application des commerces de quartier
          </p>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL — RENDU CONTINU DE TOUTES LES PAGES
// ════════════════════════════════════════════════════════════════════

export default function PrintSlides() {
  return (
    <div style={{ background: '#f0f0f0', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Playfair+Display:wght@400;700;800&display=swap" rel="stylesheet"/>

      {/* Encart d'aide en haut (caché à l'impression) */}
      <div className="print-help" style={{ position: 'sticky', top: 0, zIndex: 100, background: T.ink, color: '#fff', padding: '14px 24px', textAlign: 'center', fontFamily: '"DM Sans", sans-serif', fontSize: 13 }}>
        <strong>Version imprimable</strong> · Pour générer le PDF : <kbd style={{ background: 'rgba(255,255,255,0.15)', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>Ctrl + P</kbd> · Format A4 paysage · Marges 0 · Activer « graphiques d&rsquo;arrière-plan » dans les options
      </div>

      <div className="a4-container" style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {/* PageGarde supprimee : Slide1 fait deja office de couverture (contenu identique) */}
        <Slide1/>
        <Slide2/>
        <Slide3/>
        <Slide4/>
        <Slide5/>
        <Slide6/>
        <Slide7/>
        <Slide8/>
        <Slide9/>
        <Slide10/>
        <Slide11/>
        <Slide12/>
        <PageRecap/>
      </div>

      <style jsx global>{`
        body { margin: 0; padding: 0; background: #f0f0f0; }
        html, body { margin: 0; padding: 0; }
        @page { size: A4 landscape; margin: 0; }
        @media print {
          .print-help { display: none !important; }
          body { background: #fff !important; }
          html, body { width: 297mm; margin: 0 !important; padding: 0 !important; }
          .a4-container {
            padding: 0 !important;
            gap: 0 !important;
            display: block !important;
          }
          .a4-page {
            width: 297mm !important;
            height: 210mm !important;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
            margin: 0 !important;
            overflow: hidden;
            box-shadow: none !important;
          }
          .a4-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>
    </div>
  )
}
