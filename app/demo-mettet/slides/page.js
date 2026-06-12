'use client'
// ════════════════════════════════════════════════════════════════════
// SLIDES PRÉSENTATION COLLÈGE COMMUNAL METTET — LUNDI 15 JUIN 2026 · 14H
//
// Refonte v2 — langue institutionnelle, ton soigné, ask adouci.
// 12 slides ciblées sur l'exécutif (Bourgmestre + échevins + DG).
// Durée cible : 8-10 minutes (séance de travail, dossiers enchaînés).
//
// Navigation :
//   → ou Espace        Slide suivante
//   ←                  Slide précédente
//   F                  Plein écran
//   Home / End         Première / Dernière slide
//   Chiffres 1-9       Aller directement à la slide N
//
// URL : yoppaa.app/demo-mettet/slides
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'

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

const slideBase = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '60px 80px',
  boxSizing: 'border-box',
  fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
  color: T.ink,
  textAlign: 'center',
}

// ────────── UTILITAIRES ──────────

function Wordmark({ size = 80, white = false }) {
  return (
    <p style={{ margin: 0, fontSize: size, fontWeight: 900, letterSpacing: '-3.5px', lineHeight: 0.95 }}>
      <span style={{ color: white ? '#fff' : T.ink }}>yo</span>
      <span style={{ color: T.light }}>pp</span>
      <span style={{ color: T.mid }}>aa</span>
    </p>
  )
}

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', opacity: 0.5 }}/>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: T.light }}/>
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: T.mid }}/>
    </div>
  )
}

function SlideNumber({ n, total }) {
  return (
    <div style={{ position: 'absolute', bottom: 24, right: 32, fontSize: 13, color: T.muted, fontWeight: 700, letterSpacing: '1px' }}>
      {String(n).padStart(2, '0')} · {total}
    </div>
  )
}

function MiniWordmark({ white = true }) {
  return (
    <div style={{ position: 'absolute', bottom: 24, left: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: '-0.8px' }}>
        <span style={{ color: white ? '#fff' : T.ink }}>yo</span>
        <span style={{ color: T.light }}>pp</span>
        <span style={{ color: T.mid }}>aa</span>
      </p>
      <span style={{ fontSize: 10, fontWeight: 700, color: white ? 'rgba(255,255,255,0.55)' : T.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>
        · Pour Mettet
      </span>
    </div>
  )
}

// ────────── LES 12 SLIDES ──────────

// ─── 1. COUVERTURE ────────────────────────────────────────────────
function Slide1() {
  return (
    <div style={{ ...slideBase, background: `linear-gradient(135deg, ${T.panel} 0%, ${T.deep} 50%, ${T.ink} 100%)`, color: '#fff' }}>
      <div style={{ position: 'absolute', top: '15%', right: '12%', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${T.mid}55 0%, transparent 70%)`, filter: 'blur(80px)' }}/>
      <div style={{ position: 'absolute', bottom: '15%', left: '12%', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${T.light}33 0%, transparent 70%)`, filter: 'blur(80px)' }}/>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        <Dots/>
        <Wordmark size={160} white/>
        <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.light, letterSpacing: '-0.4px', maxWidth: 900, textAlign: 'center', lineHeight: 1.35 }}>
          Pour la commune de Mettet,<br/>ses commerçants et ses habitants
        </p>
        <div style={{ height: 1, width: 240, background: 'rgba(255,255,255,0.3)', margin: '8px 0' }}/>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '2.5px', textTransform: 'uppercase' }}>
          Collège communal · 15 juin 2026 · 14 h
        </p>
      </div>
    </div>
  )
}

// ─── 2. QUI JE SUIS ────────────────────────────────────────────────
function Slide2() {
  return (
    <div style={{ ...slideBase, background: T.bg, justifyContent: 'center', flexDirection: 'row', gap: 80 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 280, height: 280, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 30px 80px ${T.main}40` }}>
          <span style={{ fontSize: 100, color: '#fff', fontWeight: 900, letterSpacing: '-4px' }}>AV</span>
        </div>
        <span style={{ background: T.pale, color: T.deep, padding: '6px 14px', borderRadius: 100, fontSize: 11, fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
          🏠 Votre voisin
        </span>
      </div>

      <div style={{ textAlign: 'left', maxWidth: 520 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
          Qui je suis
        </p>
        <h1 style={{ margin: '12px 0 6px', fontSize: 60, fontWeight: 900, color: T.ink, letterSpacing: '-2.5px', lineHeight: 1 }}>
          Alexandre<br/>Verstappen
        </h1>
        <p style={{ margin: '24px 0 8px', fontSize: 20, color: T.deep, lineHeight: 1.5 }}>
          <strong>Djobin depuis 9 ans</strong>
        </p>
        <p style={{ margin: '8px 0', fontSize: 18, color: T.deep }}>
          📍 Rue de Prée 9G — 5640 Mettet
        </p>
        <p style={{ margin: '32px 0 0', fontSize: 16, color: T.muted, fontStyle: 'italic', lineHeight: 1.6 }}>
          Yoppaa est née d&rsquo;une intuition simple :<br/>
          le commerce de quartier mérite mieux qu&rsquo;une page Facebook oubliée.
        </p>
      </div>
      <MiniWordmark white={false}/>
      <SlideNumber n={2} total={12}/>
    </div>
  )
}

// ─── 3. LE CONSTAT ─────────────────────────────────────────────────
function Slide3() {
  return (
    <div style={{ ...slideBase, background: T.bg, justifyContent: 'center' }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
        Le constat
      </p>
      <h2 style={{ margin: '20px 0 32px', fontSize: 44, fontWeight: 900, color: T.ink, letterSpacing: '-1.5px', lineHeight: 1.2, maxWidth: 1100 }}>
        Qui, maintenant, sait ce que les commerces<br/>
        de l&rsquo;entité <span style={{ color: T.main }}>proposeront demain matin&nbsp;?</span>
      </h2>
      <p style={{ margin: '0 0 32px', fontSize: 22, color: T.deep, fontWeight: 500, maxWidth: 900, lineHeight: 1.5 }}>
        Vos habitants ouvrent leur téléphone cent fois par jour.<br/>
        Ils y trouvent toutes les grandes plateformes mondiales.
      </p>
      <div style={{ background: '#FEE2E2', padding: '20px 36px', borderRadius: 100, border: '2px solid #FCA5A5' }}>
        <p style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#991B1B', letterSpacing: '-0.8px' }}>
          ... mais presque jamais les commerces de proximité.
        </p>
      </div>
      <MiniWordmark white={false}/>
      <SlideNumber n={3} total={12}/>
    </div>
  )
}

// ─── 4. LA COMMUNICATION DE LA COMMUNE ─────────────────────────────
function Slide4() {
  return (
    <div style={{ ...slideBase, background: T.bg }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
        Vous aussi, vous voulez communiquer
      </p>
      <h2 style={{ margin: '16px 0 12px', fontSize: 48, fontWeight: 900, color: T.ink, letterSpacing: '-1.8px', lineHeight: 1.15, maxWidth: 1100 }}>
        Votre <span style={{ color: T.main }}>bulletin</span>, votre <span style={{ color: T.main }}>site</span>, votre <span style={{ color: T.main }}>page Facebook</span> sont précieux...
      </h2>
      <p style={{ margin: '0 0 36px', fontSize: 22, color: T.muted, fontStyle: 'italic' }}>
        ... mais peuvent-ils tout faire&nbsp;?
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, maxWidth: 1100, width: '100%' }}>
        {[
          { emoji: '📅', label: 'Bulletin',         detail: 'Bimestriel, jusqu\'à deux mois de délai' },
          { emoji: '🌐', label: 'Site internet',    detail: 'Statique, l\'habitant doit venir' },
          { emoji: '📣', label: 'Facebook',         detail: 'L\'algorithme décide qui voit quoi' },
          { emoji: '🐢', label: 'Pas instantané',   detail: 'Aucune alerte en temps réel' },
        ].map((b, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '24px 18px', boxShadow: '0 4px 16px rgba(26,8,64,0.06)', border: `1px solid ${T.pale}` }}>
            <p style={{ margin: 0, fontSize: 36, lineHeight: 1 }}>{b.emoji}</p>
            <p style={{ margin: '12px 0 6px', fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px' }}>{b.label}</p>
            <p style={{ margin: 0, fontSize: 13, color: T.muted, fontWeight: 600, lineHeight: 1.4 }}>{b.detail}</p>
          </div>
        ))}
      </div>

      <p style={{ margin: '40px 0 0', fontSize: 18, color: T.deep, fontWeight: 600, maxWidth: 900, lineHeight: 1.5 }}>
        Il faut <strong style={{ color: T.main }}>compléter</strong>, pas remplacer.<br/>
        Un canal numérique instantané, interactif, que vous contrôlez.
      </p>

      <MiniWordmark white={false}/>
      <SlideNumber n={4} total={12}/>
    </div>
  )
}

// ─── 5. VOICI YOPPAA ───────────────────────────────────────────────
function Slide5() {
  return (
    <div style={{ ...slideBase, background: `linear-gradient(135deg, ${T.panel} 0%, ${T.deep} 60%, ${T.ink} 100%)`, color: '#fff' }}>
      <div style={{ position: 'absolute', top: '20%', right: '15%', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${T.mid}44 0%, transparent 70%)`, filter: 'blur(80px)' }}/>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Dots/>
        <Wordmark size={140} white/>
        <p style={{ margin: '24px 0 0', fontSize: 26, fontWeight: 700, color: T.light, letterSpacing: '-0.5px', maxWidth: 700, textAlign: 'center', lineHeight: 1.3 }}>
          L&rsquo;application belge<br/>des commerces de quartier
        </p>

        <div style={{ display: 'flex', gap: 32, marginTop: 60 }}>
          {[
            { icon: '🏪', label: 'Commerçants' },
            { icon: '👥', label: 'Citoyens' },
            { icon: '🏛️', label: 'Services publics' },
          ].map((p, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(196,160,244,0.3)', borderRadius: 16, padding: '28px 36px', textAlign: 'center', minWidth: 220 }}>
              <p style={{ margin: 0, fontSize: 42 }}>{p.icon}</p>
              <p style={{ margin: '14px 0 0', fontSize: 20, fontWeight: 800, color: '#fff' }}>{p.label}</p>
            </div>
          ))}
        </div>

        <p style={{ margin: '60px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.7)', letterSpacing: '1.5px', fontWeight: 600, maxWidth: 900, textAlign: 'center', lineHeight: 1.6 }}>
          Créé à Mettet, autofinancé pour préserver notre indépendance stratégique.
        </p>
      </div>
      <SlideNumber n={5} total={12}/>
    </div>
  )
}

// ─── 6. UNE APPLICATION, TROIS TYPES DE COMMERCE + LES POSSIBILITÉS ─
function Slide6() {
  const types = [
    { emoji: '🥖', titre: 'Commerce alimentaire',  sub: 'Boulangerie, pizzeria, friterie, traiteur, épicerie, chocolatier...',      color: '#F59E0B' },
    { emoji: '💄', titre: 'Commerces de service',  sub: 'Institut de beauté, coiffeur, salle de fitness, garagiste...',              color: '#10B981' },
    { emoji: '🛍️', titre: 'Commerce de détail',   sub: 'Fleuriste, magasin de vêtements, déco, informatique...',                    color: '#6B35C4' },
  ]
  const possibilites = [
    { emoji: '🛒', label: 'Click & Collect' },
    { emoji: '🚲', label: 'Livraison locale' },
    { emoji: '🔔', label: 'Bons plans quotidiens via notifications' },
    { emoji: '☀️', label: 'Good Morning Yoppers, le rendez-vous matinal du quartier' },
    { emoji: '📦', label: 'Disponibilité des stocks en temps réel' },
    { emoji: '📅', label: 'Prise de rendez-vous en ligne' },
    { emoji: '🔒', label: 'Paiements sécurisés' },
    { emoji: '👥', label: 'Gestion multi-praticiens' },
    { emoji: '🪟', label: 'Vitrine numérique' },
    { emoji: '⭐', label: 'Système de fidélité' },
    { emoji: '📸', label: 'Accompagnement visibilité (photos, vidéos courtes)' },
  ]
  return (
    <div style={{ ...slideBase, background: T.bg, justifyContent: 'flex-start', paddingTop: 50 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
        Une seule application, trois expériences
      </p>
      <h2 style={{ margin: '12px 0 24px', fontSize: 42, fontWeight: 900, color: T.ink, letterSpacing: '-1.6px', lineHeight: 1.1 }}>
        Pensée pour <span style={{ color: T.main }}>chaque type</span> de commerce
      </h2>

      {/* 3 cards de types — compactes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 1150, width: '100%', marginBottom: 32 }}>
        {types.map((t, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', textAlign: 'left', border: `1px solid ${T.pale}`, borderTop: `4px solid ${t.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 28 }}>{t.emoji}</span>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: T.ink, letterSpacing: '-0.4px' }}>{t.titre}</p>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: T.muted, fontWeight: 500, lineHeight: 1.45 }}>{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Section possibilités */}
      <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.deep, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
        Et pour chacun, ces possibilités
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, maxWidth: 1150, width: '100%' }}>
        {possibilites.map((p, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: `1px solid ${T.pale}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{p.emoji}</span>
            <span style={{ fontSize: 11.5, color: T.deep, fontWeight: 600, lineHeight: 1.3, textAlign: 'left' }}>{p.label}</span>
          </div>
        ))}
      </div>

      <p style={{ margin: '24px 0 0', fontSize: 16, color: T.deep, fontWeight: 600, fontStyle: 'italic' }}>
        Un boulanger n&rsquo;a pas les mêmes besoins qu&rsquo;un coiffeur. Nous l&rsquo;avons compris.
      </p>

      <MiniWordmark white={false}/>
      <SlideNumber n={6} total={12}/>
    </div>
  )
}

// ─── 7. NOTRE TRANSPARENCE ─────────────────────────────────────────
function Slide7() {
  const items = [
    { icon: '💰', label: '0 % de commission',        detail: 'La totalité du paiement revient au commerçant. Nous ne sommes pas un intermédiaire qui prélève.' },
    { icon: '🆓', label: 'Plan gratuit à vie',       detail: 'Présence, actualités, favoris, signaux citoyens. Zéro euro, à vie.' },
    { icon: '🚪', label: 'Sortie libre',             detail: 'Vous résiliez, vous basculez vers le plan gratuit. Vos données restent les vôtres. Aucun engagement.' },
    { icon: '🇧🇪', label: 'Données hébergées en UE', detail: 'Conformité RGPD intégrale. Aucun transfert hors d\'Europe.' },
  ]
  return (
    <div style={{ ...slideBase, background: T.bg, justifyContent: 'flex-start', paddingTop: 70 }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
        Pas de petits caractères
      </p>
      <h2 style={{ margin: '16px 0 36px', fontSize: 52, fontWeight: 900, color: T.ink, letterSpacing: '-2px', lineHeight: 1.1 }}>
        Notre <span style={{ color: T.main }}>transparence</span>
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, maxWidth: 1000, width: '100%' }}>
        {items.map((it, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '24px 26px', border: `1px solid ${T.pale}`, textAlign: 'left', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            <p style={{ margin: 0, fontSize: 36, lineHeight: 1, flexShrink: 0 }}>{it.icon}</p>
            <div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.4px' }}>{it.label}</p>
              <p style={{ margin: '6px 0 0', fontSize: 13.5, color: T.muted, lineHeight: 1.55, fontWeight: 500 }}>{it.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: '40px 0 0', fontSize: 17, color: T.deep, fontWeight: 700, fontStyle: 'italic', maxWidth: 900, lineHeight: 1.5 }}>
        Si vous trouvez un piège dans nos conditions générales, l&rsquo;abonnement complet<br/>est offert à vie au commerçant qui le repère. 🟣
      </p>

      <MiniWordmark white={false}/>
      <SlideNumber n={7} total={12}/>
    </div>
  )
}

// ─── DÉMO LIVE — Template commun pour slides 8, 9, 10 ──────────────
function SlideDemo({ label, titre, url, commentaire, note, n }) {
  return (
    <div style={{ ...slideBase, background: `linear-gradient(135deg, ${T.bg} 0%, ${T.pale} 100%)`, justifyContent: 'center', flexDirection: 'row', gap: 60, alignItems: 'center' }}>
      <div style={{ flex: 1, maxWidth: 520, textAlign: 'left' }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
          {label}
        </p>
        <h2 style={{ margin: '16px 0 28px', fontSize: 44, fontWeight: 900, color: T.ink, letterSpacing: '-1.8px', lineHeight: 1.15 }}>
          {titre}
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 19, color: T.deep, lineHeight: 1.55, fontWeight: 500 }}>
          {commentaire}
        </p>
        {note && (
          <div style={{ background: '#fff', border: `2px solid ${T.main}`, borderRadius: 14, padding: '16px 20px' }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: T.main, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
              💡 Note interne
            </p>
            <p style={{ margin: 0, fontSize: 14, color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>
              {note}
            </p>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', width: 400, height: 820, background: '#1a1a1a', borderRadius: 56, padding: 12, boxShadow: '0 30px 80px rgba(26,8,64,0.4), 0 0 0 1px rgba(196,160,244,0.3)', flexShrink: 0, boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', width: 110, height: 24, background: '#0a0a0a', borderRadius: '0 0 20px 20px', zIndex: 10 }}/>
        {/* sandbox isole l'historique iframe du parent : bouton "Retour" dans l'app ne fait plus reculer la page slides */}
        <iframe
          src={url}
          title={titre}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 44, background: '#fff', display: 'block' }}
        />
      </div>

      <MiniWordmark white={false}/>
      <SlideNumber n={n} total={12}/>
    </div>
  )
}

// ─── 8. DÉMONSTRATION ① — Commerces ────────────────────────────────
function Slide8() {
  return (
    <SlideDemo n={8}
      label="Démonstration ①"
      titre="Vos habitants trouvent vos commerces"
      url="/commander?frame=1&onglet=accueil"
      commentaire={
        <>
          Plusieurs commerçants de l&rsquo;entité de Mettet nous accompagnent déjà dans le développement et le lancement de ce projet. Fiches locales, statuts en temps réel, favoris, actus, bons plans et fidélité.
        </>
      }
    />
  )
}

// ─── 9. DÉMONSTRATION ② — Commune + Good Morning (fusionnée) ───────
function Slide9() {
  return (
    <SlideDemo n={9}
      label="Démonstration ②"
      titre="Vous publiez, ils reçoivent instantanément"
      url="/commander/services/commune-mettet?frame=1"
      commentaire={
        <>
          Votre fiche de l&rsquo;administration communale de Mettet est déjà construite. Une alerte, une coupure d&rsquo;eau, des travaux, cela apparaît instantanément dans les téléphones des habitants de l&rsquo;entité dès l&rsquo;enregistrement par vos services. Et chaque matin, le <strong>Good Morning Yoppers</strong> rassemble les alertes, les actualités et bons plans, comme le journal quotidien.
        </>
      }
    />
  )
}

// ─── 10. DÉMONSTRATION ③ — Signalements (LA PÉPITE) ────────────────
function Slide10() {
  return (
    <SlideDemo n={10}
      label="Démonstration ③"
      titre="Les signalements citoyens"
      url="/commander/services/commune-mettet?frame=1"
      commentaire={
        <>
          14 h 00 : un habitant de Mettet, un <strong>Yopper</strong>, utilisateur de Yoppaa aperçoit un nid-de-poule. 14 h 05 : le signalement est dans la messagerie et le tableau de bord du service concerné, accompagné d&rsquo;une photo géolocalisée et d&rsquo;un descriptif.
        </>
      }
    />
  )
}

// ─── 11. DÉJÀ CONSTRUIT POUR METTET + PLAN PUBLIC GRATUIT (fusion) ─
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
    <div style={{ ...slideBase, background: T.bg, justifyContent: 'flex-start', paddingTop: 60 }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
        Déjà construit pour Mettet
      </p>
      <h2 style={{ margin: '14px 0 28px', fontSize: 42, fontWeight: 900, color: T.ink, letterSpacing: '-1.6px', lineHeight: 1.1, maxWidth: 1100 }}>
        Nous n&rsquo;avons pas attendu votre validation<br/>pour préparer le terrain
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, maxWidth: 1100, width: '100%', marginBottom: 32 }}>
        {items.map((it, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: `1px solid ${T.pale}`, display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>{it.label}</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: T.muted, fontWeight: 500, lineHeight: 1.4 }}>{it.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bloc offre intégré */}
      <div style={{ background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', borderRadius: 18, padding: '22px 32px', maxWidth: 900, width: '100%', textAlign: 'left' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.light, letterSpacing: '2px', textTransform: 'uppercase' }}>
          Notre proposition
        </p>
        <p style={{ margin: '6px 0', fontSize: 26, fontWeight: 900, letterSpacing: '-0.8px' }}>
          Le plan public, gratuit à vie.
        </p>
        <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500, lineHeight: 1.6 }}>
          Aucun frais, aucun engagement. Vous gardez la main éditoriale, la publication est instantanée.
        </p>
      </div>

      <p style={{ margin: '24px 0 0', fontSize: 17, color: T.deep, fontWeight: 700, fontStyle: 'italic' }}>
        Vous décidez du moment où nous l&rsquo;activons.
      </p>
      <MiniWordmark white={false}/>
      <SlideNumber n={11} total={12}/>
    </div>
  )
}

// ─── 12. COMMENT NOUS SOUTENIR + VISION (fusion) ───────────────────
function Slide12() {
  return (
    <div style={{ ...slideBase, background: `linear-gradient(135deg, ${T.panel} 0%, ${T.deep} 60%, ${T.ink} 100%)`, color: '#fff' }}>
      <div style={{ position: 'absolute', top: '10%', right: '10%', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${T.mid}44 0%, transparent 70%)`, filter: 'blur(80px)' }}/>
      <div style={{ position: 'absolute', bottom: '15%', left: '10%', width: 400, height: 400, borderRadius: '50%', background: `radial-gradient(circle, ${T.light}33 0%, transparent 70%)`, filter: 'blur(80px)' }}/>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.light, letterSpacing: '2.5px', textTransform: 'uppercase' }}>
          Si vous y croyez
        </p>
        <h2 style={{ margin: '20px 0 16px', fontSize: 44, fontWeight: 900, color: '#fff', letterSpacing: '-1.8px', lineHeight: 1.1, textAlign: 'center', maxWidth: 1000 }}>
          Trois manières simples<br/>de nous soutenir, à votre rythme
        </h2>
        <p style={{ margin: '0 0 36px', fontSize: 17, color: 'rgba(255,255,255,0.8)', fontWeight: 500, maxWidth: 900, textAlign: 'center', lineHeight: 1.55 }}>
          Nous vous offrons une infrastructure numérique gratuite, sans contrepartie financière.<br/>
          Si le projet vous convainc, voici comment lui donner un coup de pouce. Rien d&rsquo;engageant, rien de daté.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, maxWidth: 1100, width: '100%' }}>
          {[
            { titre: 'Un partenariat officiel',          detail: 'Un document de la commune reconnaissant Yoppaa comme « Partenaire officiel ». Un appui institutionnel pour accélérer le développement.' },
            { titre: 'Une introduction',                  detail: 'Une mise en relation avec l\'association des commerçants de Mettet, pour leur présenter l\'outil.' },
            { titre: 'Un relais, le moment venu',         detail: 'Une parution dans le Mettet Z\'infos, un partage sur vos canaux (site internet, page Facebook), le jour où vous l\'estimez pertinent.' },
          ].map((d, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: `1px solid rgba(196,160,244,0.3)`, borderRadius: 16, padding: '22px 22px', textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.3 }}>{d.titre}</p>
              <p style={{ margin: '10px 0 0', fontSize: 13, color: T.light, lineHeight: 1.55, fontWeight: 500 }}>{d.detail}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 60, padding: '24px 40px', borderTop: '1px solid rgba(255,255,255,0.15)', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#fff', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.55, maxWidth: 900 }}>
            Dans les prochains mois, lorsque nous présenterons Yoppaa<br/>
            à d&rsquo;autres communes, nous dirons :<br/>
            <strong style={{ color: T.light, fontWeight: 800 }}>« Mettet a été la première. »</strong>
          </p>
        </div>
      </div>
      <SlideNumber n={12} total={12}/>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL — NAVIGATION + RENDU
// ════════════════════════════════════════════════════════════════════

const SLIDES = [
  Slide1, Slide2, Slide3, Slide4,
  Slide5, Slide6, Slide7,
  Slide8, Slide9, Slide10,
  Slide11, Slide12,
]

export default function PresentationSlides() {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    function handler(e) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        setCurrent(c => Math.min(SLIDES.length - 1, c + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setCurrent(c => Math.max(0, c - 1))
      } else if (e.key === 'Home') {
        setCurrent(0)
      } else if (e.key === 'End') {
        setCurrent(SLIDES.length - 1)
      } else if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {})
        else document.exitFullscreen().catch(() => {})
      } else if (/^[1-9]$/.test(e.key)) {
        setCurrent(Math.min(SLIDES.length - 1, parseInt(e.key, 10) - 1))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const SlideComponent = SLIDES[current]

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#000' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Playfair+Display:wght@400;700;800&display=swap" rel="stylesheet"/>

      <div key={current} style={{ animation: 'slideFade 0.4s ease' }}>
        <SlideComponent/>
      </div>

      <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 14, zIndex: 1000, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', borderRadius: 100, padding: '8px 18px', border: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 18, padding: 4, opacity: current === 0 ? 0.3 : 1 }}>
          ←
        </button>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontFamily: '"DM Sans", sans-serif', minWidth: 50, textAlign: 'center' }}>
          {current + 1} / {SLIDES.length}
        </span>
        <button onClick={() => setCurrent(c => Math.min(SLIDES.length - 1, c + 1))} disabled={current === SLIDES.length - 1}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 18, padding: 4, opacity: current === SLIDES.length - 1 ? 0.3 : 1 }}>
          →
        </button>
      </div>

      <style>{`
        @keyframes slideFade {
          from { opacity: 0; transform: scale(0.98); }
          to   { opacity: 1; transform: scale(1); }
        }
        body { margin: 0; overflow: hidden; }
      `}</style>
    </div>
  )
}
