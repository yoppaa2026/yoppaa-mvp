'use client'
// ════════════════════════════════════════════════════════════════════
// SLIDES PRÉSENTATION CONSEIL COMMUNAL METTET — 15 JUIN 2026
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

// Style commun à toutes les slides
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

// ────────── COMPOSANTS UTILITAIRES ──────────

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

// ────────── LES 13 SLIDES ──────────

// ─── 1. COUVERTURE ────────────────────────────────────────────────
function Slide1() {
  return (
    <div style={{ ...slideBase, background: `linear-gradient(135deg, ${T.panel} 0%, ${T.deep} 50%, ${T.ink} 100%)`, color: '#fff' }}>
      {/* Glow décoratifs */}
      <div style={{ position: 'absolute', top: '15%', right: '12%', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${T.mid}55 0%, transparent 70%)`, filter: 'blur(80px)' }}/>
      <div style={{ position: 'absolute', bottom: '15%', left: '12%', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${T.light}33 0%, transparent 70%)`, filter: 'blur(80px)' }}/>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
        <Dots/>
        <Wordmark size={180} white/>
        <p style={{ margin: 0, fontSize: 32, fontWeight: 700, color: T.light, letterSpacing: '-0.5px' }}>
          Pour Mettet
        </p>
        <div style={{ height: 1, width: 200, background: 'rgba(255,255,255,0.3)', margin: '8px 0' }}/>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '3px', textTransform: 'uppercase' }}>
          Conseil communal · 15 juin 2026
        </p>
      </div>
    </div>
  )
}

// ─── 2. ALEXANDRE ──────────────────────────────────────────────────
function Slide2() {
  return (
    <div style={{ ...slideBase, background: T.bg, justifyContent: 'center', flexDirection: 'row', gap: 80 }}>
      {/* Visuel à gauche */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 280, height: 280, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 30px 80px ${T.main}40` }}>
          <span style={{ fontSize: 100, color: '#fff', fontWeight: 900, letterSpacing: '-4px' }}>AV</span>
        </div>
        <span style={{ background: T.pale, color: T.deep, padding: '6px 14px', borderRadius: 100, fontSize: 11, fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
          🏠 Votre voisin
        </span>
      </div>

      {/* Texte à droite */}
      <div style={{ textAlign: 'left', maxWidth: 520 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
          Qui je suis
        </p>
        <h1 style={{ margin: '12px 0 6px', fontSize: 60, fontWeight: 900, color: T.ink, letterSpacing: '-2.5px', lineHeight: 1 }}>
          Alexandre<br/>Verstappen
        </h1>
        <p style={{ margin: '24px 0 8px', fontSize: 20, color: T.deep, lineHeight: 1.5 }}>
          Mettetois <strong>depuis toujours</strong>
        </p>
        <p style={{ margin: '8px 0', fontSize: 18, color: T.deep }}>
          📍 Rue de Prée 9G — 5640 Mettet
        </p>
        <p style={{ margin: '8px 0', fontSize: 18, color: T.deep }}>
          🏢 <strong>Avcotech SRL</strong> · BCE 0731.637.148
        </p>
        <p style={{ margin: '24px 0 0', fontSize: 16, color: T.muted, fontStyle: 'italic', lineHeight: 1.6 }}>
          Yoppaa est née d&rsquo;une intuition simple :<br/>
          le commerce de quartier mérite mieux qu&rsquo;une page Facebook poussiéreuse.
        </p>
      </div>
      <MiniWordmark white={false}/>
      <SlideNumber n={2} total={13}/>
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
      <h2 style={{ margin: '16px 0 0', fontSize: 56, fontWeight: 900, color: T.ink, letterSpacing: '-2px', lineHeight: 1.1, maxWidth: 1000 }}>
        Vos citoyens ouvrent leur téléphone<br/>
        <span style={{ color: T.main }}>100 fois par jour</span>
      </h2>
      <p style={{ margin: '40px 0 12px', fontSize: 22, color: T.deep, fontWeight: 600 }}>
        Ils voient TGTG · Uber Eats · Deliveroo · Booking · Just Eat · Amazon...
      </p>
      <div style={{ background: '#FEE2E2', padding: '20px 36px', borderRadius: 100, marginTop: 24, border: '2px solid #FCA5A5' }}>
        <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color: '#991B1B', letterSpacing: '-1px' }}>
          0 % de leurs commerces de Mettet
        </p>
      </div>
      <MiniWordmark white={false}/>
      <SlideNumber n={3} total={13}/>
    </div>
  )
}

// ─── 4. METTET Z'INFOS ─────────────────────────────────────────────
function Slide4() {
  return (
    <div style={{ ...slideBase, background: T.bg }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
        Vous aussi, vous voulez communiquer
      </p>
      <h2 style={{ margin: '16px 0 32px', fontSize: 52, fontWeight: 900, color: T.ink, letterSpacing: '-1.8px', lineHeight: 1.1, maxWidth: 1100 }}>
        Mettet Z&rsquo;infos est <span style={{ color: T.main }}>excellent</span>...
      </h2>
      <p style={{ margin: '0 0 36px', fontSize: 22, color: T.muted, fontStyle: 'italic' }}>
        ... mais peut-il TOUT faire ?
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, maxWidth: 1100, width: '100%' }}>
        {[
          { emoji: '📅', label: 'Trimestriel', detail: '3 mois pour annoncer' },
          { emoji: '📄', label: 'Papier', detail: 'Perdu, jeté, oublié' },
          { emoji: '🐢', label: 'Pas instantané', detail: 'Pas d\'alerte temps réel' },
          { emoji: '👀', label: 'Lecture passive', detail: 'Pas de retour citoyen' },
        ].map((b, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '24px 18px', boxShadow: '0 4px 16px rgba(26,8,64,0.06)', border: `1px solid ${T.pale}` }}>
            <p style={{ margin: 0, fontSize: 36, lineHeight: 1 }}>{b.emoji}</p>
            <p style={{ margin: '12px 0 6px', fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px' }}>{b.label}</p>
            <p style={{ margin: 0, fontSize: 13, color: T.muted, fontWeight: 600, lineHeight: 1.4 }}>{b.detail}</p>
          </div>
        ))}
      </div>

      <p style={{ margin: '40px 0 0', fontSize: 18, color: T.deep, fontWeight: 600, maxWidth: 800, lineHeight: 1.5 }}>
        Il faut <strong style={{ color: T.main }}>compléter</strong>, pas remplacer.<br/>
        Un canal numérique instantané, gratuit, contrôlé par vous.
      </p>

      <MiniWordmark white={false}/>
      <SlideNumber n={4} total={13}/>
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
          L&rsquo;app belge<br/>des commerces de quartier
        </p>

        <div style={{ display: 'flex', gap: 32, marginTop: 60 }}>
          {[
            { icon: '🏪', label: 'Commerçants', sub: 'Vitrine + commande' },
            { icon: '👥', label: 'Citoyens', sub: 'Découverte + RDV' },
            { icon: '🏛️', label: 'Services publics', sub: 'Alertes + signalements' },
          ].map((p, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(196,160,244,0.3)', borderRadius: 16, padding: '24px 32px', textAlign: 'center', minWidth: 180 }}>
              <p style={{ margin: 0, fontSize: 36 }}>{p.icon}</p>
              <p style={{ margin: '12px 0 4px', fontSize: 18, fontWeight: 800, color: '#fff' }}>{p.label}</p>
              <p style={{ margin: 0, fontSize: 12, color: T.light, fontWeight: 600 }}>{p.sub}</p>
            </div>
          ))}
        </div>

        <p style={{ margin: '60px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 700 }}>
          🇧🇪 Bootstrap · Ancré Mettet · Sans levée de fonds
        </p>
      </div>
      <SlideNumber n={5} total={13}/>
    </div>
  )
}

// ─── DÉMO LIVE (Slides 6, 7, 8, 9) ─────────────────────────────────
// Template commun pour les slides démo : titre + iframe à droite + commentaire à gauche
function SlideDemo({ num, label, titre, url, commentaire, focus, n }) {
  return (
    <div style={{ ...slideBase, background: `linear-gradient(135deg, ${T.bg} 0%, ${T.pale} 100%)`, justifyContent: 'center', flexDirection: 'row', gap: 60, alignItems: 'center' }}>
      <div style={{ flex: 1, maxWidth: 520, textAlign: 'left' }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
          {label}
        </p>
        <h2 style={{ margin: '16px 0 32px', fontSize: 48, fontWeight: 900, color: T.ink, letterSpacing: '-2px', lineHeight: 1.1 }}>
          {titre}
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 20, color: T.deep, lineHeight: 1.5, fontWeight: 500 }}>
          {commentaire}
        </p>
        {focus && (
          <div style={{ background: '#fff', border: `2px solid ${T.main}`, borderRadius: 14, padding: '16px 20px' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>
              💡 À montrer en live
            </p>
            <p style={{ margin: 0, fontSize: 15, color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>
              {focus}
            </p>
          </div>
        )}
      </div>

      {/* iPhone frame avec iframe */}
      <div style={{ position: 'relative', width: 320, height: 670, background: '#1a1a1a', borderRadius: 48, padding: 10, boxShadow: '0 30px 80px rgba(26,8,64,0.4), 0 0 0 1px rgba(196,160,244,0.3)', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', width: 100, height: 22, background: '#0a0a0a', borderRadius: '0 0 18px 18px', zIndex: 10 }}/>
        <iframe src={url} title={titre} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 38, background: '#fff', display: 'block' }}/>
      </div>

      <MiniWordmark white={false}/>
      <SlideNumber n={n} total={13}/>
    </div>
  )
}

function Slide6() {
  return (
    <SlideDemo
      num="①" label="DÉMO LIVE ①" n={6}
      titre="Vos citoyens trouvent vos commerces"
      url="/commander?frame=1"
      commentaire="Plus de 10 commerçants Mettetois sont déjà actifs. Cards locales, statuts en temps réel, favoris, deals."
      focus="Tape sur n'importe quelle card pour montrer une fiche commerce complète. Bouton ♡ favoris + bouton partage = viralité."
    />
  )
}

function Slide7() {
  return (
    <SlideDemo
      num="②" label="DÉMO LIVE ②" n={7}
      titre="Vous publiez, ils reçoivent"
      url="/commander/services/commune-mettet?frame=1"
      commentaire="Votre fiche Administration communale de Mettet — déjà construite. Alertes, actus, horaires, tous les numéros internes."
      focus="L'alerte rouge 'Coupure d'eau AIEM' apparaît automatiquement dans tous les téléphones des Mettetois dès l'enregistrement."
    />
  )
}

function Slide8() {
  return (
    <SlideDemo
      num="③" label="DÉMO LIVE ③ · LA PÉPITE" n={8}
      titre="Les signalements citoyens"
      url="/commander/services/commune-mettet?frame=1"
      commentaire="14h00, un Mettetois voit un nid de poule. 14h05, c'est dans la boîte mail de votre service voirie. Avec photo géolocalisée."
      focus="Scroll jusqu'à 'Signaler un problème'. Choisis 'Nid de poule' → flow 3 étapes → email formaté arrive chez vous."
    />
  )
}

// ─── 9. GOOD MORNING YOPPERS ───────────────────────────────────────
function Slide9() {
  return (
    <SlideDemo
      num="✨" label="LE RITUEL DU MATIN" n={9}
      titre="Good Morning Yoppers"
      url="/commander/morning?frame=1"
      commentaire="Chaque matin à 7h30, vos alertes et actus arrivent dans le téléphone de chaque Mettetois. Comme un journal local du jour."
      focus="L'alerte AIEM en rouge en tête. Puis le marché du terroir. Puis les deals des commerçants. Tout dans le même flux."
    />
  )
}

// ─── 10. CE QU'ON A DÉJÀ CONSTRUIT ─────────────────────────────────
function Slide10() {
  const items = [
    { label: '5 fiches officielles', detail: 'Mairie, CPAS, Police, CEGENO (médecin), 112' },
    { label: '23 numéros internes', detail: 'Tous les services communaux, cliquables direct' },
    { label: '5 agents de quartier', detail: 'Auto-routés par village (Pierens, Meuter, Lerot...)' },
    { label: '3 publications saisies', detail: 'Coupure d\'eau · Travaux 22/06 · Marché terroir' },
    { label: 'Système signalements', detail: 'Opérationnel (nid de poule, dépôt, égout)' },
    { label: 'Dashboard commune', detail: 'Prêt à vous être attribué' },
  ]
  return (
    <div style={{ ...slideBase, background: T.bg, justifyContent: 'flex-start', paddingTop: 80 }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
        Déjà construit pour Mettet
      </p>
      <h2 style={{ margin: '16px 0 40px', fontSize: 52, fontWeight: 900, color: T.ink, letterSpacing: '-2px', lineHeight: 1.1 }}>
        On n&rsquo;attendait pas <span style={{ color: T.main }}>votre validation</span>...
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 1100, width: '100%' }}>
        {items.map((it, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: `1px solid ${T.pale}`, display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: '-0.3px' }}>{it.label}</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: T.muted, fontWeight: 500, lineHeight: 1.4 }}>{it.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: '40px 0 0', fontSize: 18, color: T.deep, fontWeight: 600, fontStyle: 'italic' }}>
        Vous décidez quand on enclenche.
      </p>
      <MiniWordmark white={false}/>
      <SlideNumber n={10} total={13}/>
    </div>
  )
}

// ─── 11. NOTRE PROPOSITION ─────────────────────────────────────────
function Slide11() {
  return (
    <div style={{ ...slideBase, background: `linear-gradient(135deg, ${T.panel} 0%, ${T.deep} 50%, ${T.ink} 100%)`, color: '#fff' }}>
      <div style={{ position: 'absolute', top: '30%', left: '20%', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${T.mid}55 0%, transparent 70%)`, filter: 'blur(80px)' }}/>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.light, letterSpacing: '3px', textTransform: 'uppercase' }}>
          Notre proposition
        </p>
        <h2 style={{ margin: '24px 0 16px', fontSize: 56, fontWeight: 900, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>
          Plan PUBLIC
        </h2>
        <p style={{ margin: '0 0 60px', fontSize: 90, fontWeight: 900, color: T.light, letterSpacing: '-4px', lineHeight: 1 }}>
          Gratuit. À vie.
        </p>

        <div style={{ display: 'flex', gap: 24 }}>
          {[
            { word: 'GRATUIT', detail: 'Aucun frais. Aucun engagement.' },
            { word: 'CONTRÔLE', detail: 'Vous gardez la main éditoriale.' },
            { word: 'IMMÉDIAT', detail: 'Publication instantanée.' },
          ].map((w, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: `1px solid ${T.light}55`, borderRadius: 14, padding: '20px 32px', textAlign: 'center', minWidth: 200 }}>
              <p style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '1px' }}>{w.word}</p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: T.light, fontWeight: 600 }}>{w.detail}</p>
            </div>
          ))}
        </div>
      </div>
      <SlideNumber n={11} total={13}/>
    </div>
  )
}

// ─── 12. CE QU'ON DEMANDE ──────────────────────────────────────────
function Slide12() {
  return (
    <div style={{ ...slideBase, background: T.bg }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>
        En contrepartie
      </p>
      <h2 style={{ margin: '16px 0 12px', fontSize: 52, fontWeight: 900, color: T.ink, letterSpacing: '-2px', lineHeight: 1.1 }}>
        Notre <span style={{ color: T.main }}>carburant</span>
      </h2>
      <p style={{ margin: '0 0 48px', fontSize: 20, color: T.deep, fontWeight: 500, fontStyle: 'italic', maxWidth: 760, lineHeight: 1.5 }}>
        Pas d&rsquo;argent. De la <strong style={{ color: T.main }}>visibilité</strong>.<br/>
        En échange de l&rsquo;infrastructure, on vous demande 3 choses.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 1100, width: '100%' }}>
        {[
          { num: '01', titre: 'Mention officielle', detail: 'Une page dans le prochain Mettet Z\'infos avec mention "Partenaire officiel Yoppaa".' },
          { num: '02', titre: 'Relais Facebook', detail: 'Un post sur la page Facebook officielle de la commune au lancement (7 juillet).' },
          { num: '03', titre: 'Mise en relation', detail: 'Une introduction à l\'Union des commerçants de Mettet pour qu\'on les onboarde.' },
        ].map((d, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '24px 22px', textAlign: 'left', border: `1px solid ${T.pale}`, boxShadow: '0 4px 16px rgba(26,8,64,0.06)' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: T.main, letterSpacing: '2px' }}>{d.num}</p>
            <p style={{ margin: '10px 0 8px', fontSize: 22, fontWeight: 900, color: T.ink, letterSpacing: '-0.6px' }}>{d.titre}</p>
            <p style={{ margin: 0, fontSize: 14, color: T.muted, lineHeight: 1.55, fontWeight: 500 }}>{d.detail}</p>
          </div>
        ))}
      </div>

      <p style={{ margin: '40px 0 0', fontSize: 18, color: T.deep, fontWeight: 700, maxWidth: 800, lineHeight: 1.5 }}>
        Vous nous offrez de la <span style={{ color: T.main }}>crédibilité</span>.<br/>
        On vous offre <span style={{ color: T.main }}>une infrastructure pro</span> sans coût.
      </p>

      <MiniWordmark white={false}/>
      <SlideNumber n={12} total={13}/>
    </div>
  )
}

// ─── 13. POURQUOI MAINTENANT + VISION ──────────────────────────────
function Slide13() {
  return (
    <div style={{ ...slideBase, background: `linear-gradient(135deg, ${T.panel} 0%, ${T.deep} 60%, ${T.ink} 100%)`, color: '#fff' }}>
      <div style={{ position: 'absolute', top: '10%', right: '10%', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${T.mid}44 0%, transparent 70%)`, filter: 'blur(80px)' }}/>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.light, letterSpacing: '3px', textTransform: 'uppercase' }}>
          Pourquoi maintenant
        </p>
        <h2 style={{ margin: '20px 0 50px', fontSize: 60, fontWeight: 900, color: '#fff', letterSpacing: '-2.5px', lineHeight: 1, textAlign: 'center' }}>
          Mettet sera<br/>
          <span style={{ color: T.light }}>la commune pionnière</span>
        </h2>

        {/* Timeline */}
        <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
          {[
            { date: '12 juin', evt: 'Campagne FB démarre', emoji: '🚀' },
            { date: '30 juin', evt: '100 Yoppers Mettetois', emoji: '🎯' },
            { date: '7 juillet', evt: 'Lancement officiel', emoji: '🎉' },
            { date: 'Été 2026', evt: '3 autres communes wallonnes', emoji: '🇧🇪' },
          ].map((m, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', minWidth: 180 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(196,160,244,0.2)', border: `2px solid ${T.light}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 24 }}>
                  {m.emoji}
                </div>
                <p style={{ margin: '12px 0 4px', fontSize: 14, color: T.light, fontWeight: 800, letterSpacing: '1px' }}>{m.date}</p>
                <p style={{ margin: 0, fontSize: 14, color: '#fff', fontWeight: 700 }}>{m.evt}</p>
              </div>
              {i < arr.length - 1 && (
                <div style={{ width: 40, height: 2, background: `linear-gradient(90deg, ${T.light}, ${T.mid})` }}/>
              )}
            </div>
          ))}
        </div>

        <p style={{ margin: '70px 0 0', fontSize: 22, fontWeight: 600, color: '#fff', fontStyle: 'italic', maxWidth: 800, textAlign: 'center', lineHeight: 1.5 }}>
          Dans 2 ans, quand on présentera Yoppaa à 30 communes,<br/>
          on dira : <strong style={{ color: T.light }}>« Mettet a été la première. »</strong>
        </p>
      </div>
      <SlideNumber n={13} total={13}/>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL — NAVIGATION + RENDU
// ════════════════════════════════════════════════════════════════════

const SLIDES = [Slide1, Slide2, Slide3, Slide4, Slide5, Slide6, Slide7, Slide8, Slide9, Slide10, Slide11, Slide12, Slide13]

export default function PresentationSlides() {
  const [current, setCurrent] = useState(0)

  // Navigation clavier
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

      {/* Slide actuelle avec fade transition */}
      <div key={current} style={{ animation: 'slideFade 0.4s ease' }}>
        <SlideComponent/>
      </div>

      {/* Contrôles bas (discrets) */}
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
