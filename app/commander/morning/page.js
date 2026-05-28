'use client'
// ════════════════════════════════════════════════════════════════════
// GOOD MORNING YOPPERS — Écran 7h30 quotidien (Phase 1 — MVP visuel)
//
// Données encore mockées : on branche les vraies tables yoppaa_deals
// et actualites une fois le rendu validé visuellement.
//
// Référence canonique : lib/morning/_reference.jsx
// Spec : memory/project_good_morning_yoppers.md
// Design system : memory/feedback_visuel_yoppaa.md
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'

// ─── Tokens design system (canoniques) ─────────────────────────────
const T = {
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',  // JAMAIS en texte
  pale:     '#EDE0FF',  // JAMAIS en texte
  bgPage:   '#F5F3FA',
  bgCard:   '#FFFFFF',
  hairline: '#F0EBF8',
  urgentBg: '#FFF2F2',
  urgentFg: '#CC3333',
}

// ─── Données mockées (à remplacer par fetchMorning) ────────────────
const dealsMock = [
  {
    commerce: "P'tit Toqué", type: '🥐', categorie: 'Boulangerie',
    deal: 'Croissants butter édition limitée',
    prix: '1,20€', prixNormal: '1,80€', stock: 18,
    actu: 'On ouvre dès 6h30 ce mois-ci pour les lève-tôt 🌅',
  },
  {
    commerce: 'Kebabistro', type: '🌯', categorie: 'Snack',
    deal: 'Midi express — sandwich + boisson',
    prix: '7,50€', prixNormal: '10,50€', stock: 3,
    actu: "Nouvelle sauce maison à l'ail confit sur toutes les formules 🧄",
  },
  {
    commerce: "Mozz'Art", type: '🍕', categorie: 'Pizzeria',
    deal: 'Pizza du jour — 4 fromages',
    prix: '9€', prixNormal: '13€', stock: 8,
    actu: 'Soirée pizza vendredi — commande dès maintenant pour 19h–21h 🎉',
  },
]

// ─── Helpers dates (locale FR-BE) ──────────────────────────────────
const DAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const LAUNCH_DATE = new Date(2026, 0, 1) // 1er janvier 2026

function getMorningContext() {
  const now = new Date()
  const tom = new Date(now); tom.setDate(tom.getDate() + 1)
  return {
    dayShort:     DAYS[now.getDay()],
    dateRest:     `${now.getDate()} ${MONTHS[now.getMonth()]}`,
    tomorrowStr:  `${DAYS[tom.getDay()]} ${tom.getDate()} ${MONTHS[tom.getMonth()]}`,
    editionNb:    Math.floor((now - LAUNCH_DATE) / 86400000) + 1,
  }
}

// ─── Hook useMatchWidth : font-size dynamique pour "Good Morning" ──
// Binary search la font-size qui donne à "Good Morning" la même largeur que "Yoppers".
function useMatchWidth(targetRef, sourceText, fontWeight = '800') {
  const [fontSize, setFontSize] = useState(28)
  useLayoutEffect(() => {
    if (!targetRef.current) return
    const targetW = targetRef.current.offsetWidth
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    let lo = 8, hi = 80, best = 28
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      ctx.font = `${fontWeight} ${mid}px 'DM Sans', sans-serif`
      const w = ctx.measureText(sourceText).width
      if (Math.abs(w - targetW) < 0.5) { best = mid; break }
      if (w < targetW) lo = mid; else hi = mid
      best = mid
    }
    setFontSize(Math.round(best * 10) / 10)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRef.current?.offsetWidth])
  return fontSize
}

// ─── Icons SVG inline (design system : jamais d'emoji UI) ──────────
function IconLocation({ size = 14, color = T.deep }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function IconCalendar({ size = 18, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
}
function IconArrow({ size = 12, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M5 12h14M13 5l7 7-7 7"/>
    </svg>
  )
}
function IconFire({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  )
}
function IconNews({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z"/>
    </svg>
  )
}

// ─── Composants ─────────────────────────────────────────────────────

function MorningHeader({ ctx }) {
  const yoppersRef = useRef(null)
  const gmFontSize = useMatchWidth(yoppersRef, 'Good Morning')

  return (
    <div style={{ padding: '24px 24px 20px', borderBottom: `1px solid ${T.hairline}`, position: 'relative' }}>
      {/* Barre dégradée fine en haut — signature visuelle Yoppaa */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

      {/* Ligne date + numéro d'édition */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.ink, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          {ctx.dayShort}
        </span>
        <span style={{ fontSize: 11, fontWeight: 500, color: T.main, letterSpacing: '0.3px' }}>
          {ctx.dateRest}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: T.mid, letterSpacing: '0.5px' }}>
          <span style={{ opacity: 0.6, marginRight: 2 }}>N°</span>{ctx.editionNb}
        </span>
      </div>

      {/* Wordmark "Good Morning Yoppers" — tricolore */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: gmFontSize, fontWeight: 800, color: T.ink, lineHeight: 1, letterSpacing: '-0.5px', whiteSpace: 'nowrap' }}>
          Good Morning
        </div>
        <div ref={yoppersRef} style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span style={{ color: T.ink }}>Yo</span>
          <span style={{ color: T.main }}>pp</span>
          <span style={{ color: T.mid }}>ers</span>
        </div>
      </div>

      {/* Zone GPS */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconLocation size={13} color={T.main}/>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, letterSpacing: '0.5px' }}>Mettet</span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.ink }}/>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.main }}/>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.mid }}/>
        </div>
      </div>
    </div>
  )
}

function Tabs({ tab, setTab, dealsCount, actusCount }) {
  const tabBase = {
    padding: '13px 0', marginRight: 24,
    fontSize: 12, fontWeight: 700, letterSpacing: '0.3px',
    cursor: 'pointer', border: 'none', background: 'none', outline: 'none',
    borderBottom: '2px solid transparent', transition: 'all 0.2s ease',
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: '"DM Sans", sans-serif',
  }
  const pillBase = {
    fontSize: 9, fontWeight: 700,
    padding: '1px 6px', borderRadius: 10,
  }
  return (
    <div style={{ display: 'flex', gap: 0, padding: '0 24px', borderBottom: `1px solid ${T.hairline}` }}>
      <button onClick={() => setTab('deals')}
        style={{ ...tabBase, color: tab === 'deals' ? T.ink : T.main, borderBottomColor: tab === 'deals' ? T.ink : 'transparent' }}>
        <IconFire size={13} color="currentColor"/> Deals
        <span style={{ ...pillBase, background: tab === 'deals' ? T.ink : T.pale, color: tab === 'deals' ? '#fff' : T.deep }}>
          {dealsCount}
        </span>
      </button>
      <button onClick={() => setTab('actus')}
        style={{ ...tabBase, color: tab === 'actus' ? T.ink : T.main, borderBottomColor: tab === 'actus' ? T.ink : 'transparent' }}>
        <IconNews size={13} color="currentColor"/> Actus
        <span style={{ ...pillBase, background: tab === 'actus' ? T.ink : T.pale, color: tab === 'actus' ? '#fff' : T.deep }}>
          {actusCount}
        </span>
      </button>
    </div>
  )
}

function DealCard({ d, shown, delay }) {
  const isUrgent = d.stock <= 5
  return (
    <div className="gmy-anim" style={{ opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)', transitionDelay: `${delay}ms` }}>
      <div className="gmy-card-hover" style={{ border: `1px solid ${T.hairline}`, borderRadius: 16, padding: '14px 16px', cursor: 'pointer', background: '#fff', transition: 'all 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: T.bgPage, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            {d.type}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.deep, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 2 }}>
              {d.commerce}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, lineHeight: 1.3 }}>
              {d.deal}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.ink }}>{d.prix}</div>
          <div style={{ fontSize: 12, color: T.mid, textDecoration: 'line-through' }}>{d.prixNormal}</div>
          <div style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: isUrgent ? T.urgentBg : T.pale, color: isUrgent ? T.urgentFg : T.deep }}>
            {isUrgent ? '⚡ ' : ''}{d.stock} restants
          </div>
        </div>
      </div>
    </div>
  )
}

function ActuCard({ d, shown, delay }) {
  return (
    <div className="gmy-anim" style={{ opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)', transitionDelay: `${delay}ms` }}>
      <div className="gmy-card-hover" style={{ border: `1px solid ${T.hairline}`, borderRadius: 16, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s ease', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: T.bgPage, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
            {d.type}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.deep, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {d.commerce}
            </div>
            <div style={{ fontSize: 10, color: T.main }}>{d.categorie}</div>
          </div>
        </div>
        <div style={{ height: 1, background: T.hairline, marginBottom: 10 }}/>
        <div style={{ fontFamily: '"Playfair Display", serif', fontStyle: 'italic', fontSize: 13, color: T.deep, lineHeight: 1.55, marginBottom: 10 }}>
          &laquo;&nbsp;{d.actu}&nbsp;&raquo;
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: T.main, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          Lire <IconArrow size={11} color={T.main}/>
        </div>
      </div>
    </div>
  )
}

function MorningFooter({ tomorrowStr, onExplore }) {
  return (
    <>
      {/* Footer combiné dark : message + icône + CTA */}
      <div style={{ background: T.ink, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(196,160,244,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconCalendar size={18} color={T.light}/>
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
          Rendez-vous <strong style={{ color: '#fff', fontWeight: 700 }}>{tomorrowStr}</strong> à <strong style={{ color: '#fff', fontWeight: 700 }}>07h30</strong> pour de nouveaux deals.
        </div>
        <button onClick={onExplore} className="gmy-cta-hover"
          style={{ fontSize: 11, fontWeight: 700, color: T.ink, background: T.light, padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', transition: 'background 0.2s', letterSpacing: '0.3px', flexShrink: 0, fontFamily: '"DM Sans", sans-serif' }}>
          Explorer
        </button>
      </div>

      {/* Signature "propulsé par yoppaa" */}
      <div style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: T.ink, borderTop: '1px solid rgba(196,160,244,0.1)' }}>
        <span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(196,160,244,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          propulsé par
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.5px' }}>
          <span style={{ color: '#fff' }}>yo</span>
          <span style={{ color: T.light }}>pp</span>
          <span style={{ color: T.mid }}>aa</span>
        </span>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

export default function GoodMorningYoppersPage() {
  const router = useRouter()
  const [tab, setTab] = useState('deals')
  const [shown, setShown] = useState([false, false, false])
  const [visible, setVisible] = useState(false)
  const ctx = getMorningContext()

  // Animation entrée de la card
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 80)
    const timers = dealsMock.map((_, i) =>
      setTimeout(() => setShown(p => { const n = [...p]; n[i] = true; return n }), 400 + i * 150)
    )
    return () => { clearTimeout(t1); timers.forEach(clearTimeout) }
  }, [])

  // Animation re-cascade au changement d'onglet
  useEffect(() => {
    setShown([false, false, false])
    const timers = dealsMock.map((_, i) =>
      setTimeout(() => setShown(p => { const n = [...p]; n[i] = true; return n }), 60 + i * 120)
    )
    return () => timers.forEach(clearTimeout)
  }, [tab])

  // Marque le morning comme vu aujourd'hui (logique "1 fois/jour")
  useEffect(() => {
    if (typeof window === 'undefined') return
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem('morning_last_shown', today)
  }, [])

  function onExplore() {
    router.push('/commander')
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700;0,800;1,400&family=Playfair+Display:ital@1&display=swap" rel="stylesheet"/>

      {/* CSS local : hover des cards (pseudo-classes nécessitent du CSS, pas du inline) */}
      <style>{`
        .gmy-card-hover:hover {
          border-color: ${T.main} !important;
          box-shadow: 0 4px 16px rgba(107,53,196,0.08);
          transform: translateY(-1px);
        }
        .gmy-cta-hover:hover { background: ${T.pale} !important; }
      `}</style>

      <div style={{
        width: '100%', maxWidth: 400, background: T.bgCard,
        borderRadius: 24, overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(26,8,64,0.06), 0 12px 40px rgba(26,8,64,0.1)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <MorningHeader ctx={ctx}/>
        <Tabs tab={tab} setTab={setTab} dealsCount={dealsMock.length} actusCount={dealsMock.length}/>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tab === 'deals' && dealsMock.map((d, i) => (
            <DealCard key={i} d={d} shown={shown[i]} delay={i * 55}/>
          ))}
          {tab === 'actus' && dealsMock.map((d, i) => (
            <ActuCard key={i} d={d} shown={shown[i]} delay={i * 55}/>
          ))}
        </div>

        <MorningFooter tomorrowStr={ctx.tomorrowStr} onExplore={onExplore}/>
      </div>
    </div>
  )
}
