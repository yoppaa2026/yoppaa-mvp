'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canDo, isVitrine, PLAN_PUBLIC_ENABLED, bandeauCategorie } from '@/lib/plans'
import PillsStatut from './PillsStatut'
import ConfirmCommune from './ConfirmCommune'
import ModalAvis from './ModalAvis'
import OneSignalInit, { taggerFavoriOneSignal, syncYopperTags } from '@/app/components/OneSignalInit'
import PillStatutOuverture from '@/app/components/PillStatutOuverture'

const T = {
  bg:      '#F8F6FF',
  bgCard:  '#FFFFFF',
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

const TEMPS_PAR_TYPE = {
  'Boulangerie': 5, 'Boulangerie & Pâtisserie': 6, 'Coffee shop': 5,
  'Sandwicherie': 8, 'Snack': 8, 'Friterie': 10,
  'Pizzeria': 10, 'Épicerie': 6, 'Traiteur': 8, 'Pharmacie': 7,
}
function getTemps(type) { return TEMPS_PAR_TYPE[type] || 7 }

const CATEGORIES = ['Tous', 'Boulangerie', 'Pâtisserie', 'Chocolatier', 'Coffee shop', 'Sandwicherie', 'Snack', 'Friterie', 'Pizzeria', 'Épicerie', 'Traiteur', 'Boucherie', 'Fleuriste', 'Pharmacie', 'Food truck']

const TYPE_BADGE = {
  'Boulangerie':              { bg: '#FFF3CD', color: '#856404' },
  'Pâtisserie':               { bg: '#FEF3C7', color: '#92400E' },
  'Boulangerie & Pâtisserie': { bg: '#FEF3C7', color: '#92400E' },
  'Chocolatier':              { bg: '#F3E8DC', color: '#5C2E0E' },
  'Sandwicherie':             { bg: '#CCE5FF', color: '#004085' },
  'Snack':                    { bg: '#D4EDDA', color: '#155724' },
  'Friterie':                 { bg: '#FEF9C3', color: '#854D0E' },
  'Pizzeria':                 { bg: '#FEE2E2', color: '#991B1B' },
  'Coffee shop':              { bg: '#EDE0FF', color: '#2D0F6B' },
  'Épicerie':                 { bg: '#E0E7FF', color: '#3730A3' },
  'Traiteur':                 { bg: '#FCE7F3', color: '#9D174D' },
  'Boucherie':                { bg: '#FEE4E2', color: '#7F1D1D' },
  'Fleuriste':                { bg: '#FCE7F3', color: '#831843' },
  'Pharmacie':                { bg: '#D1FAE5', color: '#065F46' },
  'Food truck':               { bg: '#FFEDD5', color: '#7C2D12' },
}
function getBadge(type) { return TYPE_BADGE[type] || { bg: T.pale, color: T.deep } }
function parseTypes(type) {
  if (!type) return ['Commerce']
  const parts = type.split(/\s*[&\/,]\s*/).map(t => t.trim()).filter(Boolean)
  return parts.length >= 2 ? parts.slice(0, 2) : [type]
}
function Badges({ type }) {
  const types = parseTypes(type)
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {types.map((t, i) => {
        const badge = getBadge(t)
        return <span key={i} style={{ background: badge.bg, color: badge.color, fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap' }}>{t}</span>
      })}
    </div>
  )
}

const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOURS_COURTS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']

function resumeHoraires(h) {
  if (!h) return null
  const groupes = []
  let i = 0
  while (i < JOURS.length) {
    const jour = JOURS[i]; const info = h[jour]
    if (!info) { i++; continue }
    let j = i + 1
    while (j < JOURS.length) {
      const next = h[JOURS[j]]
      if (!next || next.ouvert !== info.ouvert || next.debut !== info.debut || next.fin !== info.fin) break
      j++
    }
    const label = j - i > 1 ? `${JOURS_COURTS[i]}–${JOURS_COURTS[j-1]}` : JOURS_COURTS[i]
    groupes.push(`${label} ${info.ouvert ? `${info.debut.slice(0,5)}–${info.fin.slice(0,5)}` : 'Fermé'}`)
    i = j
  }
  return groupes.join(' · ')
}

function distanceVolOiseau(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function formatDistance(m) {
  if (!m && m !== 0) return null
  return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`
}
function Etoiles({ note, taille = 13 }) {
  const n = note ? Math.round(note) : 0
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: taille, color: i<=n ? '#F59E0B' : '#D1D5DB' }}>★</span>)}</span>
}

// ─── Icônes SVG réutilisables (design system canonique) ─────────────────────
// Remplace les emojis UI : strokeWidth 2, round caps, palette stricte.
function IconBag({ size = 28, color = T.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>
    </svg>
  )
}
function IconBox({ size = 20, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <path d="m3.27 6.96 8.73 5.05 8.73-5.05M12 22.08V12"/>
    </svg>
  )
}
function IconEuro({ size = 20, color = T.mid }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M4 10h12M4 14h9"/>
      <path d="M19 5.6A8 8 0 0 0 13 3a9 9 0 0 0 0 18 8 8 0 0 0 6-2.6"/>
    </svg>
  )
}
function IconClock({ size = 16, color = T.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  )
}
function IconHeart({ size = 36, color = T.muted, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/>
    </svg>
  )
}
function IconSearch({ size = 36, color = T.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  )
}
function IconCheck({ size = 14, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M5 12l5 5L20 7"/>
    </svg>
  )
}
function IconGlobe({ size = 14, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
}
function IconWarning({ size = 12, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
      <path d="M12 9v4M12 17h.01"/>
    </svg>
  )
}
function IconHandshake({ size = 18, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m11 17 2 2a1 1 0 1 0 3-3"/>
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/>
      <path d="m21 3 1 11h-2"/>
      <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/>
      <path d="M3 4h8"/>
    </svg>
  )
}
function IconSparkle({ size = 18, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
      <path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>
    </svg>
  )
}
// Icône par type de service public (remplace les emojis SERVICE_TYPE_EMOJI).
function IconService({ type, size = 22, color = '#2D0F6B' }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { flexShrink: 0 } }
  switch (type) {
    case 'commune':
      return (
        <svg {...common}>
          <path d="M3 11 12 4 21 11"/>
          <path d="M5 11v9h14v-9"/>
          <path d="M8 20v-7M12 20v-7M16 20v-7M3 20h18"/>
        </svg>
      )
    case 'cpas':
      return (
        <svg {...common}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
      )
    case 'police':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      )
    case 'pompiers':
      return (
        <svg {...common}>
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
        </svg>
      )
    case 'ecole':
      return (
        <svg {...common}>
          <path d="M22 10 12 5 2 10l10 5 10-5Z"/>
          <path d="M6 12v5c0 1 3 2.5 6 2.5s6-1.5 6-2.5v-5"/>
        </svg>
      )
    case 'urgence':
      return (
        <svg {...common}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
          <path d="M12 9v4M12 17h.01"/>
        </svg>
      )
    case 'medecin_garde':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <path d="M12 8v8M8 12h8"/>
        </svg>
      )
    case 'pharmacie_garde':
      return (
        <svg {...common}>
          <path d="M10.5 4.5 4.5 10.5a3.5 3.5 0 0 0 5 5L15.5 9.5a3.5 3.5 0 1 0-5-5Z"/>
          <path d="m8 8 7 7"/>
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2"/>
          <path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M12 21v-3"/>
        </svg>
      )
  }
}

// Mini signature Yoppaa : 3 points tricolores inline (remplace les 🟣 décoratifs)
function PointsYoppaa({ size = 5, gap = 3 }) {
  const couleurs = ['#ffffff', T.light, T.mid]
  return (
    <span style={{ display: 'inline-flex', gap, alignItems: 'center', verticalAlign: 'middle', marginLeft: 4 }}>
      {couleurs.map((c, i) => (
        <span key={i} style={{ width: size, height: size, borderRadius: '50%', background: c, opacity: i === 0 ? 0.55 : 1, boxShadow: `0 0 4px ${c}55` }}/>
      ))}
    </span>
  )
}
function heureEnMinutes(heure) {
  const [h, m] = heure.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function maintenant() {
  const d = new Date(); return d.getHours() * 60 + d.getMinutes()
}

// ─── Splash Screen ────────────────────────────────────────────────────────────
// ─── FIX SWIPE : SwipeRetrait - YOP → SWIPE, instructions claires ────────────
function SwipeRetrait({ onConfirm, clientPrenom, libelle = 'Glisse pour récupérer', sousTexteSucces = 'Tu skip la file' }) {
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | swiping | success | done
  const [containerW, setContainerW] = useState(0)
  const startRef = useRef(0)
  const containerRef = useRef(null)
  const THUMB = 48
  const C = { main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF', ink: '#1A0840', deep: '#2D0F6B' }

  function getMaxX() { return (containerRef.current?.offsetWidth || 300) - THUMB - 8 }
  function getX(e) { return e.touches ? e.touches[0].clientX : e.clientX }

  const audioRef = useRef(null)
  const phaseRef = useRef('idle')

  function setPhaseSync(val) {
    phaseRef.current = val
    setPhase(val)
  }

  const onStart = e => {
    if (phaseRef.current !== 'idle') return
    setPhaseSync('swiping'); setSwiping(true)
    startRef.current = getX(e) - swipeX
    try {
      audioRef.current = new Audio('/sounds/yop.mp3')
      audioRef.current.volume = 0.8
      audioRef.current.load()
    } catch(e) {}
  }
  const onMove = e => {
    if (phaseRef.current !== 'swiping') return
    const x = Math.max(0, Math.min(getMaxX(), getX(e) - startRef.current))
    setSwipeX(x)
    if (x >= getMaxX()) {
      setSwiping(false)
      setPhaseSync('success')
      try {
        if (audioRef.current) {
          audioRef.current.play().catch(() => {})
        } else {
          new Audio('/sounds/yop.mp3').play().catch(() => {})
        }
      } catch(e) {}
      setTimeout(() => { setPhaseSync('done'); onConfirm() }, 3500)
    }
  }
  const onEnd = () => {
    if (phaseRef.current !== 'swiping') return
    setSwiping(false); setPhaseSync('idle'); setSwipeX(0)
  }

  // Largeur suivie en state (réactif) : pas de lecture de containerRef pendant le
  // render (interdit). Les handlers, eux, lisent le ref directement (autorisé).
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') { if (el) setContainerW(el.offsetWidth); return }
    setContainerW(el.offsetWidth)
    const ro = new ResizeObserver(() => setContainerW(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])
  const p = swipeX / (((containerW || 300) - THUMB - 8) || 1)
  const TRACK_H = THUMB + 16

  // ─── Phase succès - animation 3 points + wordmark ─────────────────────────
  if (phase === 'success' || phase === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '1rem 0' }}>
        <style>{`
          @keyframes yopDot1 { 0%,100%{transform:scale(0.6) translateY(0);opacity:0.4} 33%{transform:scale(1.6) translateY(-8px);opacity:1} }
          @keyframes yopDot2 { 0%,100%{transform:scale(0.6) translateY(0);opacity:0.4} 50%{transform:scale(1.8) translateY(-10px);opacity:1} }
          @keyframes yopDot3 { 0%,100%{transform:scale(0.6) translateY(0);opacity:0.4} 66%{transform:scale(1.6) translateY(-8px);opacity:1} }
          @keyframes yopWordmark { 0%{opacity:0;letter-spacing:8px;transform:translateY(8px)} 100%{opacity:1;letter-spacing:-2px;transform:translateY(0)} }
          @keyframes yopSub { 0%{opacity:0;transform:translateY(6px)} 100%{opacity:1;transform:translateY(0)} }
        `}</style>
        {/* Wordmark tricolore canonique fond clair : yo Ink, pp Main, aa Mid */}
        <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2.2rem', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 12, animation: 'yopWordmark 0.6s cubic-bezier(0.25,0.46,0.45,0.94) forwards' }}>
          <span style={{ color: C.ink }}>yo</span>
          <span style={{ color: C.main }}>pp</span>
          <span style={{ color: C.mid }}>aa</span>
        </p>
        {/* Dots V2-B sous le wordmark, animation tour à tour */}
        <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6, height: 17, marginBottom: 12 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: C.ink, animation: 'yopDot1 1.2s ease-in-out infinite' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.main, marginTop: 4.4, animation: 'yopDot2 1.2s ease-in-out infinite' }}/>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: C.main, marginTop: 4.4, animation: 'yopDot2 1.2s ease-in-out infinite' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.mid, marginTop: 4.4, animation: 'yopDot3 1.2s ease-in-out infinite' }}/>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: C.mid, animation: 'yopDot3 1.2s ease-in-out infinite' }}/>
        </div>
        <p style={{ fontWeight: 700, fontSize: '0.9rem', color: C.deep, animation: 'yopSub 0.5s ease 0.3s both', letterSpacing: '-0.2px' }}>
          Bien joué {clientPrenom || 'Yopper'} 🟣
        </p>
        <p style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 6, animation: 'yopSub 0.5s ease 0.5s both' }}>
          {sousTexteSucces}
        </p>
      </div>
    )
  }

  // ─── Phase idle / swiping ─────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <style>{`
        @keyframes swipeArrowPulse { 0%,100%{opacity:0.3;transform:translateX(0)} 50%{opacity:1;transform:translateX(5px)} }
      `}</style>

      {/* FIX : label "Glisse pour récupérer" - sans "YOP!" */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {[0,1,2].map(i => (
            <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="none"
              style={{ animation: `swipeArrowPulse 1s ease-in-out ${i*0.2}s infinite` }}>
              <path d="M9 18l6-6-6-6" stroke={C.mid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ))}
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#9CA3AF', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{libelle}</span>
      </div>

      {/* Track */}
      <div ref={containerRef}
        style={{ width: '100%', height: TRACK_H, borderRadius: 100, background: `linear-gradient(to right, ${C.pale} ${p*100}%, #F1F0F9 ${p*100}%)`, position: 'relative', border: `2px solid ${p > 0.5 ? C.main : C.light}`, userSelect: 'none', cursor: 'grab', touchAction: 'none', transition: 'border-color 0.2s', boxShadow: p > 0.3 ? `0 4px 20px ${C.main}22` : 'none' }}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>

        {/* Texte central - apparaît après 70% */}
        {p > 0.7 && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: THUMB + 12, right: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: C.main, letterSpacing: '1px', textTransform: 'uppercase' }}>Lâche !</span>
          </div>
        )}

        {/* FIX : thumb - "YOP" → "SWIPE" */}
        <div style={{ position: 'absolute', left: 4 + swipeX, top: 4, width: THUMB, height: THUMB, borderRadius: '50%', background: `linear-gradient(135deg, ${C.main}, ${C.mid})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 20px ${C.main}66, 0 0 0 ${p > 0.5 ? '3px' : '0px'} ${C.light}`, transition: swiping ? 'none' : 'left 0.3s, box-shadow 0.2s', userSelect: 'none', gap: 2 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {[{c:'rgba(255,255,255,0.5)',s:4},{c:'rgba(196,160,244,0.9)',s:5},{c:'rgba(150,96,224,0.9)',s:4}].map((d,i) => (
              <div key={i} style={{ width: d.s, height: d.s, borderRadius: '50%', background: d.c }}/>
            ))}
          </div>
          <span style={{ fontWeight: 900, fontSize: '0.52rem', color: '#fff', letterSpacing: '0.8px', textTransform: 'uppercase', lineHeight: 1 }}>SWIPE</span>
        </div>
      </div>
    </div>
  )
}

function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    // Sequence canonique : wordmark, 5 dots V2-B, slogan.
    const t1 = setTimeout(() => setPhase(1), 400)  // wordmark in
    const t2 = setTimeout(() => setPhase(2), 1200) // 5 dots V2-B pop cascade
    const t3 = setTimeout(() => setPhase(3), 2200) // slogan in
    const t4 = setTimeout(() => setPhase(4), 3800) // debut fadeOut
    const t5 = setTimeout(() => onDone(),    4600) // fin
    return () => [t1,t2,t3,t4,t5].forEach(clearTimeout)
  }, [])
  // Dimensions des 5 dots V2-B (spec : grand 18, mini 10, gap 10, offset 7.2)
  const dotBase = 18, dotMini = 10, dotOffset = 7.2
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: `linear-gradient(160deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: phase === 4 ? 'splash-out 0.8s ease-in forwards' : 'none', overflow: 'hidden' }}>
      {/* Signature canonique YOPPAA : bande degradee 3px Ink → Main → Light en haut */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, #1A0840 0%, #6B35C4 60%, #C4A0F4 100%)` }}/>

      {/* Wordmark tricolore canonique : yo blanc, pp Light, aa Mid */}
      <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '3.5rem', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 28, animation: phase >= 1 ? 'wordmark-in 0.7s cubic-bezier(0.25,0.46,0.45,0.94) forwards' : 'none', opacity: phase >= 1 ? 1 : 0 }}>
        <span style={{ color: '#fff' }}>yo</span>
        <span style={{ color: '#C4A0F4' }}>pp</span>
        <span style={{ color: '#9660E0' }}>aa</span>
      </p>

      {/* 5 dots V2-B : pop cascade nette de gauche a droite */}
      <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 10, height: dotBase + dotOffset, marginBottom: 22, opacity: phase >= 2 ? 1 : 0 }}>
        {[
          { w: dotBase, c: '#FFFFFF',  marginTop: 0,         delay: '0s' },
          { w: dotMini, c: '#C4A0F4',  marginTop: dotOffset, delay: '0.09s' },
          { w: dotBase, c: '#C4A0F4',  marginTop: dotOffset, delay: '0.18s' },
          { w: dotMini, c: '#9660E0',  marginTop: dotOffset, delay: '0.27s' },
          { w: dotBase, c: '#9660E0',  marginTop: 0,         delay: '0.36s' },
        ].map((d, i) => (
          <span key={i} style={{ width: d.w, height: d.w, borderRadius: '50%', background: d.c, marginTop: d.marginTop, boxShadow: `0 0 14px ${d.c}88`, animation: phase >= 2 ? `dot-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) ${d.delay} both` : 'none', display: 'block' }}/>
        ))}
      </div>

      <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 600, fontSize: '0.95rem', color: '#C4A0F4', letterSpacing: '0.012em', animation: phase >= 3 ? 'tagline-in 0.6s ease forwards' : 'none', opacity: phase >= 3 ? 1 : 0 }}>Ton quartier dans ta poche</p>
    </div>
  )
}

// ─── Suggestion commerce ──────────────────────────────────────────────────────
function SuggestionForm({ clientId }) {
  const [form, setForm] = useState({ nom: '', adresse: '', type: '', commentaire: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const inputSt = { width: '100%', padding: '0.875rem 1rem', border: `1.5px solid ${T.pale}`, borderRadius: 12, marginBottom: 10, fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none', color: T.ink, background: '#fff', display: 'block' }
  async function envoyer() {
    if (!form.nom.trim()) return; setSending(true)
    await supabase.from('suggestions_commercants').insert({ client_id: clientId || null, nom_commerce: form.nom.trim(), adresse: form.adresse.trim() || null, type_commerce: form.type.trim() || null, commentaire: form.commentaire.trim() || null })
    setSent(true); setSending(false)
  }
  if (sent) return (
    <div style={{ background: '#F0FDF4', borderRadius: 16, padding: '1.5rem', textAlign: 'center', border: '1.5px solid #10B98133' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 14, background: T.pale, marginBottom: 12 }}>
        <IconSparkle size={28} color={T.main}/>
      </div>
      <p style={{ fontWeight: 800, color: '#10B981', marginBottom: 6 }}>Merci pour ta suggestion !</p>
      <p style={{ fontSize: '0.875rem', color: T.muted }}>On va contacter ce commerçant. Tu contribues à faire grandir la Tribu Yoppaa.</p>
      <button onClick={() => { setSent(false); setForm({ nom: '', adresse: '', type: '', commentaire: '' }) }} style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: T.main, color: '#fff', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer' }}>Suggérer un autre commerçant</button>
    </div>
  )
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', border: `1.5px solid ${T.pale}` }}>
      <p style={{ fontWeight: 800, color: T.deep, marginBottom: '1rem' }}>Quel commerçant mérite Yoppaa ?</p>
      <input placeholder="Nom du commerce *" value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} style={inputSt}/>
      <input placeholder="Adresse" value={form.adresse} onChange={e => setForm(p => ({ ...p, adresse: e.target.value }))} style={inputSt}/>
      <input placeholder="Type (boulangerie, snack...)" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inputSt}/>
      <textarea placeholder="Pourquoi ce commerçant ?" value={form.commentaire} onChange={e => setForm(p => ({ ...p, commentaire: e.target.value }))} style={{ ...inputSt, resize: 'vertical', minHeight: 70, marginBottom: 14 }}/>
      <button onClick={envoyer} disabled={!form.nom.trim() || sending}
        style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '1rem', background: form.nom.trim() ? T.main : '#E5E7EB', color: '#fff', cursor: form.nom.trim() ? 'pointer' : 'default', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {sending ? 'Envoi...' : (<><IconHandshake size={18} color="#fff"/> Suggérer ce commerçant</>)}
      </button>
    </div>
  )
}

// ─── Édition prénom inline ────────────────────────────────────────────────────
function EditablePrenom({ client, setClient, clientId, openSignal }) {
  const [editing, setEditing] = useState(false)
  const [vPrenom, setVPrenom] = useState(client.prenom || '')
  const [vNom, setVNom]       = useState(client.nom || '')
  const [vTel, setVTel]       = useState(client.telephone || '')
  const [saving, setSaving] = useState(false)
  // openSignal : compteur incrementé par le parent (bandeau "Complete tes infos")
  // pour declencher l'edit mode depuis l'exterieur sans coupler tightly l'etat.
  useEffect(() => {
    if (openSignal && openSignal > 0) {
      setVPrenom(client.prenom || '')
      setVNom(client.nom || '')
      setVTel(client.telephone || '')
      setEditing(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  async function sauvegarder() {
    if (!vPrenom.trim()) return
    setSaving(true)
    const prenom = vPrenom.trim()
    const nom    = vNom.trim()
    const telephone = vTel.trim()
    localStorage.setItem('yoppaa_prenom', prenom)
    if (nom) localStorage.setItem('yoppaa_nom', nom)
    if (telephone) localStorage.setItem('yoppaa_telephone', telephone)
    setClient(p => ({ ...p, prenom, nom, telephone }))
    if (clientId) {
      // Update profil côté serveur (RLS clients verrouillé), autorisé par le cookie Yopper.
      await fetch('/api/yopper/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-own', prenom, nom, telephone }) })
    }
    setSaving(false)
    setEditing(false)
  }

  const inputDark = { background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '0.5rem 0.875rem', color: '#fff', fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' }

  if (editing) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input value={vPrenom} onChange={e => setVPrenom(e.target.value)} autoFocus placeholder="Prénom" style={inputDark}/>
        <input value={vNom} onChange={e => setVNom(e.target.value)} placeholder="Nom" style={inputDark}/>
      </div>
      <input value={vTel} onChange={e => setVTel(e.target.value)} type="tel" placeholder="Téléphone" onKeyDown={e => e.key === 'Enter' && sauvegarder()} style={inputDark}/>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={sauvegarder} disabled={!vPrenom.trim() || saving}
          style={{ flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', color: '#6B35C4', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {saving ? '…' : (<><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B35C4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg> Sauvegarder</>)}
        </button>
        <button onClick={() => setEditing(false)}
          style={{ padding: '0.5rem 0.875rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 100, color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          Annuler
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <p style={{ fontWeight: 900, fontSize: '1.15rem', color: '#fff', letterSpacing: '-0.3px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[client.prenom, client.nom].filter(Boolean).join(' ') || 'Yopper 🟣'}
        </p>
        <button onClick={() => { setVPrenom(client.prenom || ''); setVNom(client.nom || ''); setVTel(client.telephone || ''); setEditing(true) }}
          aria-label="Modifier mes infos"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 100, padding: '3px 9px', color: 'rgba(255,255,255,0.85)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Modifier
        </button>
      </div>
      <p style={{ fontSize: '0.78rem', color: '#C4A0F4', opacity: 0.9, marginBottom: client.telephone ? 2 : 0 }}>{client.email}</p>
      {client.telephone && (
        <p style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#C4A0F4', opacity: 0.7 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          {client.telephone}
        </p>
      )}
    </div>
  )
}

// ─── Écran pick-up hype ───────────────────────────────────────────────────────
// FIX NUMÉRO : numero_commande de la DB en priorité ; si manquant (anciennes
// commandes), on calcule la position du jour côté commerçant - même logique que
// le dashboard (getNumeroJour) pour que client et commerçant voient le même #.
function PickupScreen({ commande, clientPrenom, onConfirm }) {
  const estLivraison = commande.mode_retrait === 'livraison'
  const [numeroCalcule, setNumeroCalcule] = useState(null)

  useEffect(() => {
    let annule = false
    async function rechercherNumero() {
      // 1) numero_commande déjà présent → on l'utilise
      if (commande.numero_commande) {
        if (!annule) setNumeroCalcule(commande.numero_commande)
        return
      }
      // 2) re-fetch la commande pour obtenir un numero_commande à jour
      if (commande.id) {
        const { data: fresh } = await supabase
          .from('commandes')
          .select('numero_commande, commercant_id, date_commande, created_at')
          .eq('id', commande.id)
          .maybeSingle()
        if (fresh?.numero_commande) {
          if (!annule) setNumeroCalcule(fresh.numero_commande)
          return
        }
        // 3) fallback : position dans la liste triée du jour pour ce commerce
        const cid = fresh?.commercant_id || commande.commercant_id
        const dateRef = fresh?.date_commande || commande.date_commande
        if (cid && dateRef) {
          const dateStr = typeof dateRef === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRef)
            ? dateRef
            : new Date(dateRef).toISOString().slice(0, 10)
          const { data: duJour } = await supabase
            .from('commandes')
            .select('id, created_at, creneau:creneaux(heure_debut)')
            .eq('commercant_id', cid)
            .eq('date_commande', dateStr)
            .order('created_at', { ascending: true })
          const tri = (duJour || []).sort((a, b) =>
            (a.creneau?.heure_debut || '').localeCompare(b.creneau?.heure_debut || '') ||
            new Date(a.created_at) - new Date(b.created_at)
          )
          const idx = tri.findIndex(c => c.id === commande.id)
          if (!annule) setNumeroCalcule(idx >= 0 ? idx + 1 : '?')
          return
        }
      }
      if (!annule) setNumeroCalcule('?')
    }
    rechercherNumero()
    return () => { annule = true }
  }, [commande.id, commande.numero_commande, commande.commercant_id, commande.date_commande])

  const numero = numeroCalcule ?? '…'
  const cren = commande.creneau || commande.creneau_livraison
  const creneau = cren
    ? `${cren.heure_debut.slice(0,5)} – ${cren.heure_fin.slice(0,5)}`
    : null
  return (
    // FIX FOOTER : position: fixed + zIndex: 9999 - rendu HORS de page-wrap (voir return principal)
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'linear-gradient(160deg, #1A0840 0%, #2D0F6B 40%, #6B35C4 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '3rem 2rem calc(2.5rem + env(safe-area-inset-bottom, 0px))', overflow: 'hidden' }}>
      {/* Bande 3px canonique YOPPAA */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #1A0840 0%, #6B35C4 60%, #C4A0F4 100%)', zIndex: 3 }}/>
      <style>{`
        @keyframes pu-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.7} }
        @keyframes pu-fadein { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pu-glow { 0%,100%{text-shadow:0 0 40px #9660E088} 50%{text-shadow:0 0 80px #C4A0F4cc} }
      `}</style>
      {/* Déco fond */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 80% 20%, #9660E033 0%, transparent 50%), radial-gradient(circle at 20% 80%, #6B35C422 0%, transparent 50%)', pointerEvents: 'none' }}/>
      {/* Logo : 3 points tricolores + wordmark canonique (yo blanc, pp Light, aa Mid) */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', animation: 'pu-fadein 0.5s ease' }}>
        <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2.2rem', letterSpacing: '-0.05em', lineHeight: 1, animation: 'pu-glow 2s ease-in-out infinite', marginBottom: 10 }}>
          <span style={{ color: '#fff' }}>yo</span>
          <span style={{ color: '#C4A0F4' }}>pp</span>
          <span style={{ color: '#9660E0' }}>aa</span>
        </p>
        {/* Dots V2-B sous le wordmark */}
        <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 5, height: 14 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#fff', animation: 'pu-pulse 2s ease-in-out 0s infinite' }}/>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#C4A0F4', marginTop: 3.6, animation: 'pu-pulse 2s ease-in-out 0.15s infinite' }}/>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#C4A0F4', marginTop: 3.6, animation: 'pu-pulse 2s ease-in-out 0.3s infinite' }}/>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#9660E0', marginTop: 3.6, animation: 'pu-pulse 2s ease-in-out 0.45s infinite' }}/>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#9660E0', animation: 'pu-pulse 2s ease-in-out 0.6s infinite' }}/>
        </div>
      </div>
      {/* Numéro + infos */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', animation: 'pu-fadein 0.6s ease 0.1s both' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 800, color: '#C4A0F4', textTransform: 'uppercase', letterSpacing: 3, marginBottom: 12, opacity: 0.8 }}>{estLivraison ? 'Ta commande est arrivée' : 'Ta commande est prête'}</p>
        <p style={{ fontSize: '7rem', fontWeight: 900, color: '#fff', letterSpacing: '-4px', lineHeight: 1, textShadow: '0 0 60px #9660E088', marginBottom: 8 }}>#{numero}</p>
        <p style={{ fontSize: '1.6rem', fontWeight: 900, color: '#C4A0F4', letterSpacing: '-0.5px', marginBottom: 8 }}>{clientPrenom || 'Yopper'} 🟣</p>
        {creneau && (
          <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            {creneau}
          </p>
        )}
        <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: '12px 24px', display: 'inline-block' }}>
          <p style={{ fontWeight: 900, fontSize: '1rem', color: '#fff', letterSpacing: '-0.3px' }}>{estLivraison ? 'CONFIRME TA RÉCEPTION 🟣' : 'PRIORITÉ YOPPERS 🟣'}</p>
        </div>
      </div>
      {/* FIX : SwipeRetrait en bas - pas de conflit avec la navbar (rendu hors page-wrap) */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', animation: 'pu-fadein 0.6s ease 0.3s both' }}>
        <SwipeRetrait clientPrenom={clientPrenom} onConfirm={onConfirm}
          libelle={estLivraison ? 'Glisse pour confirmer la réception' : 'Glisse pour récupérer'}
          sousTexteSucces={estLivraison ? 'Bon appétit ! 🟣' : 'Tu skip la file'}/>
      </div>
    </div>
  )
}

// ─── Carte commerce - redesignée ──────────────────────────────────────────────
// ─── Carte d'un service public (Plan PUBLIC) ────────────────────────────────
// Affichée dans la section "Services & administrations" sur /commander.
// Différencie urgences nationales (badge rouge OFFICIEL) vs services locaux (badge violet OFFICIEL).
const SERVICE_TYPE_LABEL = {
  commune: 'Commune', cpas: 'CPAS', police: 'Police',
  pompiers: 'Pompiers', ecole: 'École', urgence: 'Urgence',
  medecin_garde: 'Médecin', pharmacie_garde: 'Pharmacie',
  autre: 'Service',
}

// ─── Section "Mes avis" - affichée dans l'onglet Profil ────────────────────
// Liste compacte des avis vérifiés (liés à une commande) postés par le Yopper.
function SectionMesAvis({ clientId }) {
  const [avis, setAvis] = useState([])
  // Loading initialisé selon la présence de clientId : évite un setState synchrone
  // dans l'effect (règle react-hooks/set-state-in-effect). Sans clientId, rien à
  // charger → loading part à false ; sinon on passe à false dans le .then (async).
  const [loading, setLoading] = useState(!!clientId)

  useEffect(() => {
    if (!clientId) return
    let annule = false
    supabase
      .from('avis')
      .select('id, note, commentaire, created_at, commande_id, commercant:commercants(nom, slug)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (annule) return
        setAvis(data || [])
        setLoading(false)
      })
    return () => { annule = true }
  }, [clientId])

  if (loading) return null

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px 12px', marginBottom: '0.875rem', border: `1px solid ${T.pale}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Mes avis
        </span>
        <div style={{ flex: 1, height: 1, background: T.pale }}/>
        {avis.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{avis.length}</span>}
      </div>
      {avis.length === 0 ? (
        <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, margin: 0 }}>
          Après ta prochaine commande récupérée, on te proposera de laisser un avis pour aider la tribu.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {avis.slice(0, 5).map(a => (
            <div key={a.id} style={{ padding: '10px 12px', background: T.bg, borderRadius: 10, border: `1px solid ${T.pale}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                  {a.commercant?.nom || 'Commerçant'}
                </p>
                <span style={{ fontSize: 12, color: '#F59E0B', fontWeight: 700, flexShrink: 0 }}>{'★'.repeat(a.note)}</span>
              </div>
              {a.commentaire && (
                <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  &laquo;&nbsp;{a.commentaire}&nbsp;&raquo;
                </p>
              )}
            </div>
          ))}
          {avis.length > 5 && (
            <p style={{ fontSize: 11, color: T.muted, fontStyle: 'italic', textAlign: 'center', margin: '4px 0 0' }}>
              + {avis.length - 5} autres avis
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CarteServicePublic({ s, onSelect, actusInfo }) {
  const isUrgence = s.national || s.type === 'urgence'
  const typeLabel = SERVICE_TYPE_LABEL[s.type] || 'Service'
  const nbAlertes = actusInfo?.alertes || 0
  const nbActus   = actusInfo?.actus   || 0
  return (
    <div onClick={onSelect}
      style={{
        background: '#fff',
        border: `1px solid ${isUrgence ? '#FECACA' : T.pale}`,
        borderLeft: `4px solid ${isUrgence ? '#DC2626' : T.deep}`,
        borderRadius: 14,
        padding: '10px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        transition: 'all 0.15s',
        maxWidth: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: isUrgence ? '#FEE2E2' : '#EDE0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <IconService type={s.type} size={20} color={isUrgence ? '#DC2626' : T.deep}/>
      </div>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: isUrgence ? '#DC2626' : T.deep, padding: '2px 7px', borderRadius: 100, letterSpacing: '0.6px', textTransform: 'uppercase', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {isUrgence && <IconWarning size={9} color="#fff"/>}
            {isUrgence ? 'Urgence' : 'Officiel'}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: '0.3px' }}>
            {typeLabel}
          </span>
        </div>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, letterSpacing: '-0.2px', margin: 0, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.nom}
        </p>
        {/* Pills statut actu/alerte (pattern PillsStatut commerçant) :
            alerte rouge pulse en priorité, actu violet juste à côté. */}
        {(nbAlertes > 0 || nbActus > 0) && (
          <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
            {nbAlertes > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px 2px 6px', borderRadius: 100,
                background: '#FEE2E2', color: '#991B1B',
                fontSize: 9, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', animation: 'pulseAlerte 1.4s ease-in-out infinite' }}/>
                Alerte{nbAlertes > 1 ? `s · ${nbAlertes}` : ''}
              </span>
            )}
            {nbActus > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px 2px 6px', borderRadius: 100,
                background: T.pale, color: T.deep,
                fontSize: 9, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.main }}/>
                Actu{nbActus > 1 ? `s · ${nbActus}` : ''}
              </span>
            )}
            <style>{`@keyframes pulseAlerte { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.5; transform: scale(1.3) } }`}</style>
          </div>
        )}
      </div>
      {/* Colonne droite : pill statut + bouton tel, alignes verticalement.
          Affichee uniquement si au moins un des deux est present. */}
      {((s.horaires_detail && Object.keys(s.horaires_detail).length > 0) || s.telephone) && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          {s.horaires_detail && Object.keys(s.horaires_detail).length > 0 && (
            <PillStatutOuverture horaires={s.horaires_detail} compact/>
          )}
          {s.telephone && (
            <a href={`tel:${s.telephone}`} onClick={e => e.stopPropagation()}
              aria-label={`Appeler ${s.nom}`}
              style={{ width: 34, height: 34, borderRadius: '50%', background: isUrgence ? '#DC2626' : T.main, color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.2 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.11 6.11l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// Badge type de commande : Retrait (C&C) vs Livraison. Icône SVG (design system).
function BadgeTypeCommande({ mode }) {
  const livraison = mode === 'livraison'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 8px', borderRadius: 100, background: livraison ? '#EEF2FF' : '#F0FDF4', color: livraison ? '#4F46E5' : '#059669', border: `1px solid ${livraison ? '#4F46E522' : '#05966922'}` }}>
      {livraison ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h2l2.5 6M6 17.5h7l-2-8H8.5"/></svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>
      )}
      {livraison ? 'Livraison' : 'Retrait'}
    </span>
  )
}

function CarteCommerce({ c, favoris, notesParCommerce, statutsCommerce, dealsActifs, actusActives, bonnesAffairesActives, onSelect, onToggleFavori }) {
  const estFavori = favoris.includes(c.id)
  const noteInfo = notesParCommerce[c.id]
  const statut = statutsCommerce[c.id]
  const bonneAffaire = bonnesAffairesActives?.has(c.id) || false

  function getStatutPhysique() {
    const JOURS_MAP = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
    const JOURS_LABELS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
    const nowDate = new Date()
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes()
    const todayIdx = nowDate.getDay()
    const j = JOURS_MAP[todayIdx]
    const h = c.horaires_detail?.[j]

    const ouvert = h?.ouvert && h.debut && h.fin
      ? nowMin >= heureEnMinutes(h.debut) && nowMin < heureEnMinutes(h.fin)
      : false

    if (ouvert) {
      const horaire = `${h.debut.slice(0,5)}–${h.fin.slice(0,5)}`
      return { dot: '#10B981', label: `Ouvert · ${horaire}`, color: '#10B981', bg: '#F0FDF4', pulse: true }
    }

    if (h?.ouvert && h.debut) {
      const ouvreLater = heureEnMinutes(h.debut) > nowMin
      if (ouvreLater) {
        return { dot: '#9CA3AF', label: `Fermé · ouvre à ${h.debut.slice(0,5)}`, color: '#6B7280', bg: '#F9FAFB', pulse: false }
      }
    }

    if (c.horaires_detail) {
      for (let i = 1; i <= 7; i++) {
        const nextIdx = (todayIdx + i) % 7
        const nextJour = JOURS_MAP[nextIdx]
        const nextH = c.horaires_detail[nextJour]
        if (nextH?.ouvert && nextH.debut) {
          const label = i === 1 ? `Fermé · ouvre demain à ${nextH.debut.slice(0,5)}`
            : `Fermé · ouvre ${JOURS_LABELS[nextIdx]} à ${nextH.debut.slice(0,5)}`
          return { dot: '#9CA3AF', label, color: '#6B7280', bg: '#F9FAFB', pulse: false }
        }
      }
    }

    return { dot: '#9CA3AF', label: 'Fermé', color: '#6B7280', bg: '#F9FAFB', pulse: false }
  }

  function getStatutResa() {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    const heureOuv = c.heure_ouverture_resa ? c.heure_ouverture_resa.slice(0,5) : '21:00'
    const resaDemainOuverte = nowMin >= heureEnMinutes(heureOuv)
    if (statut === 'ouvert')  return { dot: '#10B981', label: 'Créneaux disponibles', color: '#10B981', bg: '#F0FDF4' }
    if (statut === 'urgent')  return { dot: '#EA580C', label: 'Réserve vite !', color: '#EA580C', bg: '#FFF7ED' }
    if (statut === 'complet' || statut === 'ferme') {
      if (resaDemainOuverte) return { dot: T.main, label: 'Réserver pour demain', color: T.main, bg: T.pale }
      return { dot: '#9CA3AF', label: `Résa dès ${heureOuv}`, color: '#6B7280', bg: '#F9FAFB' }
    }
    return null
  }

  const physique = getStatutPhysique()
  // Pas de reservation si le plan ne permet pas la commande (palier Exister)
  const peutCommander = canDo(c.plan, 'commande')
  const resa = peutCommander ? getStatutResa() : null

  return (
    <div onClick={() => onSelect(c)}
      style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: '0.5rem', cursor: 'pointer', boxShadow: '0 1px 4px rgba(26,8,64,0.04)', border: `1px solid ${T.pale}`, transition: 'all 0.2s', position: 'relative' }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 32px rgba(26,8,64,0.12)`; e.currentTarget.style.borderColor = T.light }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(26,8,64,0.04)'; e.currentTarget.style.borderColor = T.pale }}>

      {/* Bande haute 'type' : marqueur de categorie (couleur) + type de commerce (texte) en une seule
          zone, signature visuelle compacte. Plus de pastilles couleur sous le nom = card moins chargee.
          Dispatch centralise via bandeauCategorie() (lib/plans.js) :
          • alimentaire (C&C) → degrade VIOLET canonique (Ink → Main → Light)
          • vitrine (services / RDV) → degrade VERT (Forest → Emerald → Mint)
          • detail (boutique / mise de cote) → degrade ORANGE chaud (Rust → Orange → Peach) */}
      <div style={{
        height: 24,
        background: bandeauCategorie(c),
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 0.875rem',
      }}>
        <span style={{
          color: '#fff',
          fontSize: '0.62rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          textShadow: '0 1px 2px rgba(0,0,0,0.18)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, minWidth: 0,
        }}>
          {c.type || 'Commerce'}
        </span>
        {bonneAffaire && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: '#FCD34D', color: '#7C2D12',
            padding: '2px 8px', borderRadius: 100,
            fontSize: '0.58rem', fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: '0.6px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
            flexShrink: 0,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="#7C2D12" stroke="#7C2D12" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Bonne affaire
          </span>
        )}
      </div>

      {/* Bouton favori en absolute coin haut droit de la vignette photo.
          Pattern UX standard TGTG/Airbnb : cœur outline → rempli rouge si favori.
          Cohérent avec la fiche détail commerçant (memo UX 2026-06-12). */}
      <button onClick={e => onToggleFavori(c.id, e)}
        aria-label={estFavori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        style={{
          position: 'absolute', top: 32, right: 10, zIndex: 2,
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
          border: 'none',
          cursor: 'pointer', padding: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s, box-shadow 0.15s',
          borderRadius: '50%',
          boxShadow: estFavori ? '0 3px 10px rgba(220,38,38,0.25)' : '0 1px 3px rgba(0,0,0,0.10)',
        }}
        onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(26,8,64,0.22)' }}
        onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = estFavori ? '0 3px 10px rgba(220,38,38,0.25)' : '0 1px 3px rgba(0,0,0,0.10)' }}>
        <svg width="17" height="17" viewBox="0 0 24 24"
          fill={estFavori ? '#DC2626' : 'none'}
          stroke={estFavori ? '#DC2626' : T.deep}
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>

      <div style={{ padding: '0.5rem 0.875rem 0.625rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: 4 }}>
              <p style={{ fontWeight: 900, color: T.ink, margin: 0, fontSize: '0.95rem', letterSpacing: '-0.3px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 32 }}>{c.nom}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Etoiles note={noteInfo?.moyenne || 0} taille={11}/>
              <span style={{ fontSize: '0.68rem', color: noteInfo?.count > 0 ? T.muted : '#D1D5DB' }}>
                {noteInfo?.count > 0 ? `${noteInfo.count} avis` : 'Pas encore d\'avis'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6, alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: physique.bg, borderRadius: 100, padding: '3px 8px', border: `1px solid ${physique.dot}22` }}>
                <span style={{ width: physique.pulse ? 9 : 7, height: physique.pulse ? 9 : 7, borderRadius: '50%', background: physique.dot, flexShrink: 0 }}/>
                <span style={{ fontSize: '0.66rem', fontWeight: 700, color: physique.color }}>{physique.label}</span>
              </span>
              {resa && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: resa.bg, borderRadius: 100, padding: '3px 8px', border: `1px solid ${resa.dot}22` }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: resa.dot, flexShrink: 0 }}/>
                  <span style={{ fontSize: '0.66rem', fontWeight: 700, color: resa.color }}>{resa.label}</span>
                </span>
              )}
              {c.distance != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', color: T.muted, fontWeight: 600 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  {formatDistance(c.distance)}
                </span>
              )}
            </div>
          </div>

          <div style={{ width: 68, height: 68, borderRadius: 14, background: c.logo_url ? '#fff' : T.pale, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(26,8,64,0.10)', border: c.logo_url ? `1px solid ${T.pale}` : 'none', flexShrink: 0 }}>
            {c.logo_url
              ? <img src={c.logo_url} alt={c.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              : <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9 4 5h16l1 4v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/>
                  <path d="M5 11v10h14V11"/>
                  <path d="M9 21v-6h6v6"/>
                </svg>
            }
          </div>
        </div>
        {/* Pills statut sur toute la largeur de la card : 5 pills une seule ligne, labels complets */}
        <div style={{ marginTop: 8 }}>
          <PillsStatut commercant={c} dealActif={dealsActifs?.has(c.id) || false} actuActive={actusActives?.has(c.id) || false} bonneAffaire={bonneAffaire} size="xs"/>
        </div>
      </div>
    </div>
  )
}

// Barre de categories scrollable horizontalement avec indicateurs gauche/droite cliquables.
// Sur PC : molette verticale = scroll horizontal (la scrollbar est masquee pour le design).
function CategoriesScroll({ categorieActive, setCategorieActive }) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft]   = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function check() {
      setCanScrollLeft(el.scrollLeft > 2)
      setCanScrollRight(el.scrollLeft + el.clientWidth + 2 < el.scrollWidth)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    // Molette verticale -> scroll horizontal sur PC (non-touchpad). On garde le scroll natif touchpad horizontal.
    function onWheel(e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('scroll', check)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', check)
    }
  }, [])

  function scrollBy(dir) {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(180, el.clientWidth * 0.7), behavior: 'smooth' })
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={scrollRef} className="cats">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategorieActive(cat)}
            style={{ flexShrink: 0, padding: '0.45rem 1rem', borderRadius: 100, border: categorieActive===cat ? 'none' : `1px solid ${T.light}33`, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', background: categorieActive===cat ? '#fff' : 'rgba(255,255,255,0.08)', color: categorieActive===cat ? T.main : '#fff', backdropFilter: 'blur(4px)', transition: 'all 0.15s', boxShadow: categorieActive===cat ? `0 4px 14px rgba(255,255,255,0.25)` : 'none', letterSpacing: '-0.2px' }}>
            {cat}
          </button>
        ))}
      </div>
      {/* Fade + chevron CLIQUABLE a gauche (quand scrolle) */}
      <button aria-label="Categories precedentes" onClick={() => scrollBy(-1)}
        style={{ position: 'absolute', top: 0, left: 0, bottom: '0.875rem', width: 42, padding: 0, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 6, background: `linear-gradient(to left, transparent, ${T.bgPanel} 70%)`, cursor: 'pointer', opacity: canScrollLeft ? 1 : 0, pointerEvents: canScrollLeft ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6"/>
          </svg>
        </span>
      </button>
      {/* Fade + chevron CLIQUABLE a droite (quand il en reste) */}
      <button aria-label="Categories suivantes" onClick={() => scrollBy(1)}
        style={{ position: 'absolute', top: 0, right: 0, bottom: '0.875rem', width: 42, padding: 0, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, background: `linear-gradient(to right, transparent, ${T.bgPanel} 70%)`, cursor: 'pointer', opacity: canScrollRight ? 1 : 0, pointerEvents: canScrollRight ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', animation: 'cats-chev-pulse 1.4s ease-in-out infinite' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6"/>
          </svg>
        </span>
      </button>
      <style>{`
        @keyframes cats-chev-pulse {
          0%, 100% { transform: translateX(0);   opacity: 1; }
          50%      { transform: translateX(3px); opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}

// ─── Icône SVG : enveloppe ouverte avec soleil dedans (Option D) ──────────────
// Hybride SVG + emoji : enveloppe dessinée en SVG monochrome (cohérent design
// system Yoppaa) + soleil ☀️ emoji centré dans le corps. L'emoji natif du
// système apporte une touche chaleureuse jaune/orange qui contraste joliment
// avec le fond violet du header. Métaphore "lettre du matin" préservée.
function IconCourrierMatin({ size = 24, color = '#fff' }) {
  return (
    <span style={{ display: 'inline-flex', position: 'relative', width: size, height: size, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        {/* Rabat triangulaire ouvert vers le haut */}
        <polyline points="3 9 12 3 21 9"/>
        {/* Corps de l'enveloppe */}
        <rect x="3" y="9" width="18" height="13" rx="2"/>
      </svg>
      {/* Soleil ☀️ emoji centré dans le corps (légèrement décalé vers le bas pour rester sous le rabat) */}
      <span aria-hidden="true" style={{
        position: 'absolute',
        top: '62%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        ☀️
      </span>
    </span>
  )
}

// ─── Bouton "Good Morning Yoppers" du header ─────────────────────────────────
// Affiche un badge violet pulse si le yopper n'a pas vu son Good Morning
// aujourd'hui (localStorage gm_seen_YYYY-MM-DD). Au tap, navigue vers /commander/morning.
function BoutonGoodMorning({ onClick, nonVu }) {
  return (
    <button onClick={onClick}
      aria-label={nonVu ? 'Bon matin, ton Good Morning Yoppers est arrivé' : 'Good Morning Yoppers'}
      style={{
        position: 'relative',
        width: 46, height: 46, borderRadius: '50%',
        background: nonVu ? 'rgba(196,160,244,0.28)' : 'rgba(255,255,255,0.12)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${nonVu ? 'rgba(196,160,244,0.6)' : 'rgba(255,255,255,0.18)'}`,
        color: '#fff', cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit',
        transition: 'all 0.2s',
      }}>
      <IconCourrierMatin size={30} color="#fff"/>
      {nonVu && (
        <>
          <span aria-hidden="true" style={{
            position: 'absolute', top: 3, right: 3,
            width: 9, height: 9, borderRadius: '50%',
            background: '#C4A0F4',
            boxShadow: '0 0 0 2px rgba(22,6,54,0.9), 0 0 8px rgba(196,160,244,0.7)',
            animation: 'gmDotPulse 1.6s ease-in-out infinite',
          }}/>
          <style>{`@keyframes gmDotPulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.35); opacity: 0.55 } }`}</style>
        </>
      )}
    </button>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Commander() {
  const router = useRouter()

  // Good Morning Yoppers : badge pulse violet si le yopper n'a pas encore vu
  // sa page morning aujourd'hui. Flag set quand il visite /commander/morning.
  const [gmNonVu, setGmNonVu] = useState(false)
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' })  // YYYY-MM-DD
    setGmNonVu(!localStorage.getItem(`yoppaa_gm_seen_${today}`))
  }, [])

  // showSplash DOIT s'initialiser à false (valeur identique serveur + 1er rendu
  // client), sinon le SSR rend sans splash et le client rend avec -> mismatch
  // d'hydration React #418 (mur d'erreurs postMessage constaté 03/07). On lit
  // sessionStorage seulement APRÈS montage, dans l'effet ci-dessous.
  const [showSplash, setShowSplash] = useState(false)
  useEffect(() => {
    if (!sessionStorage.getItem('yoppaa_splash_seen')) setShowSplash(true)
  }, [])
  function onSplashDone() { sessionStorage.setItem('yoppaa_splash_seen', '1'); setShowSplash(false) }

  const [onglet, setOngletState] = useState('accueil')
  function setOnglet(val) { setOngletState(val); localStorage.setItem('yoppaa_onglet', val) }

  // Sous-onglet de l'onglet Commandes : 'alimentaires' (C&C) ou 'rdvs' (vitrines).
  // Persistance sessionStorage pour conserver le dernier choix sans le mettre dans
  // le localStorage long-terme (les RDVs sont plus rares, le default 'alimentaires' a la priorite).
  const [sousOngletCmd, setSousOngletCmd] = useState('alimentaires')

  // Signal envoye a EditablePrenom pour ouvrir l'editor depuis le bandeau "Complete tes infos"
  // (cf memory feedback-zero-friction : on offre un raccourci direct au lieu d'une instruction)
  const [editProfilSignal, setEditProfilSignal] = useState(0)

  // Toast : message ephemere en bas d'ecran (3.5s). Tout ce qui a besoin d'un feedback rapide passe par ici.
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  function showToast(msg) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  // Modal confirmation custom (remplace window.confirm() qui est bloque/silencieux
  // en PWA installee iPhone). Utilisee pour confirmer annulations RDV et commandes.
  const [confirmModal, setConfirmModal] = useState(null)
  function askConfirm({ title, message, confirmLabel = 'Confirmer', danger = false, onConfirm }) {
    setConfirmModal({ title, message, confirmLabel, danger, onConfirm })
  }

  const [commercants, setCommercants] = useState([])
  const [notesParCommerce, setNotesParCommerce] = useState({})
  const [statutsCommerce, setStatutsCommerce] = useState({})
  // Set des commerçants qui ont un deal/actu actif aujourd'hui (pour dot LIVE sur pills)
  const [dealsActifs, setDealsActifs] = useState(new Set())
  const [actusActives, setActusActives] = useState(new Set())
  const [bonnesAffairesActives, setBonnesAffairesActives] = useState(new Set())
  const [position, setPosition] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [rue, setRue] = useState(null)
  const [showLocManuelle, setShowLocManuelle] = useState(false)
  const [locManuelle, setLocManuelle] = useState('')
  const [categorieActive, setCategorieActive] = useState('Tous')
  const [searchQuery, setSearchQuery] = useState('')
  const [favoris, setFavoris] = useState([])
  const [commercantsFavoris, setCommercantsFavoris] = useState([])
  const [client, setClient] = useState({ nom: '', email: '', telephone: '', prenom: '' })
  const [clientId, setClientId] = useState(null)
  const [clientCommandes, setClientCommandes] = useState([])
  const [clientRdvs, setClientRdvs] = useState([])
  // Commune du Yopper (référentiel `communes` joint via clients.commune_id)
  // commune = null  : pas encore chargé ou client pas connecté
  // commune = false : client connecté mais aucune commune setée → modale ConfirmCommune
  const [commune, setCommune] = useState(null)
  const [showConfirmCommune, setShowConfirmCommune] = useState(false)
  // Services publics (commune, CPAS, police, urgences) visibles dans la zone
  const [servicesPublics, setServicesPublics] = useState([])
  // Badge rouge sur l'onglet Services s'il y a au moins une alerte urgente active
  const [alerteUrgenteActive, setAlerteUrgenteActive] = useState(false)
  // Map service_id → { actus: n, alertes: n } pour afficher les pills sur les cards
  const [actusParService, setActusParService] = useState(new Map())
  // Modal d'avis post-commande : commande pour laquelle on propose un avis
  // (déclenché auto quand statut='recupere' et pas encore d'avis pour cette commande)
  const [avisCommande, setAvisCommande] = useState(null)
  const [pickupCommande, setPickupCommande] = useState(null)
  // Tick minute pour rafraichir le compteur "Plus que X min avant ton créneau"
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    // Query param ?onglet=accueil prioritaire sur localStorage : utile pour
    // la démo (slide 8 force l'onglet Accueil sans dépendre de l'historique).
    // Garde-fou V1 : si l'onglet demandé est 'services' (Officiel) et que le
    // flag PLAN_PUBLIC_ENABLED est OFF, on retombe sur 'accueil' au lieu
    // d'afficher une vue vide.
    const urlParams = new URLSearchParams(window.location.search)
    const ongletFromUrl = urlParams.get('onglet')
    const normaliser = (v) => (v === 'services' && !PLAN_PUBLIC_ENABLED) ? 'accueil' : v
    if (ongletFromUrl) {
      setOngletState(normaliser(ongletFromUrl))
    } else {
      const savedOnglet = localStorage.getItem('yoppaa_onglet')
      if (savedOnglet) setOngletState(normaliser(savedOnglet))
    }
    // Sous-onglet pour la page "Yoppers" (commandes vs rdvs). Param ?tab=rdvs
    // utilise depuis les emails RDV pour ouvrir directement la liste des RDV.
    const tabFromUrl = urlParams.get('tab')
    if (tabFromUrl === 'rdvs' || tabFromUrl === 'alimentaires') {
      setSousOngletCmd(tabFromUrl)
    }
    chargerCommercants()
    demanderGeolocalisation()

    // Sess 7 : Safari iOS ITP purge le localStorage apres 7j sans visite,
    // ce qui fait "disparaitre" les RDV/commandes cote client iPhone. Fallback :
    // cookie HTTP-only Same-Site (route /api/yopper/session) qui survit a ITP.
    // Priorite : localStorage (rapide, aucune requete), puis cookie serveur en
    // dernier recours. A chaque hydratation reussie, on re-sync le cookie pour
    // reset son Max-Age.
    async function hydrateYopper() {
      let email = localStorage.getItem('yoppaa_email')
      let nom = localStorage.getItem('yoppaa_nom')
      let prenom = localStorage.getItem('yoppaa_prenom')
      let telephone = localStorage.getItem('yoppaa_telephone')
      let id = localStorage.getItem('yoppaa_client_id')
      // Fallback cookie si localStorage vide (Safari iOS ITP purge probable)
      if (!email || !id) {
        try {
          const res = await fetch('/api/yopper/session')
          const data = await res.json()
          if (data.ok && data.identity?.email && data.identity?.client_id) {
            id       = data.identity.client_id
            email    = data.identity.email
            prenom   = data.identity.prenom || ''
            nom      = data.identity.nom || ''
            telephone= data.identity.telephone || ''
            // Restore localStorage pour les prochains reload rapides
            localStorage.setItem('yoppaa_client_id', id)
            localStorage.setItem('yoppaa_email', email)
            if (prenom)    localStorage.setItem('yoppaa_prenom', prenom)
            if (nom)       localStorage.setItem('yoppaa_nom', nom)
            if (telephone) localStorage.setItem('yoppaa_telephone', telephone)
          }
        } catch (e) {
          console.warn('[hydrate] cookie fallback KO', e?.message)
        }
      }
      if (email && id) {
        setClient(p => ({ ...p, email, nom: nom || '', prenom: prenom || '', telephone: telephone || '' }))
        setClientId(id)
        chargerFavoris(id)
        chargerCommandesClient(email); chargerRdvsClient(email)
        // Sync cookie serveur AWAITED (pas fire-and-forget) : le cookie doit
        // refléter le client courant AVANT l'appel get-own (commune/profil), sinon
        // get-own lit un cookie périmé -> mauvais client -> la modale commune
        // réapparaît à chaque connexion (bug 11).
        await fetch('/api/yopper/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: id, email, prenom, nom, telephone }),
        }).catch(() => {})
      }
      return { email, id, telephone, prenom, nom }
    }
    hydrateYopper().then(({ email, id, telephone, prenom, nom }) => {
      if (!id) return
      // Si telephone manquant en local (cas Magic Link sans signup complet, ou EditablePrenom save sans reload),
      // recharger depuis la DB pour synchroniser le state + localStorage. Sinon le bandeau "Profil incomplet"
      // reapparait apres chaque reload alors que la valeur est bien en DB.
      // Profil (prefill si manquant) + commune du Yopper, côté serveur (RLS clients
      // verrouillé, autorisé par le cookie Yopper). Un seul appel pour les deux.
      fetch('/api/yopper/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-own' }) })
        .then(r => r.json())
        .then(j => {
          const data = j?.client
          if (!data) return  // pas de session serveur : on ne force pas la modale (évite une boucle sans cookie)
          if (!telephone) {
            if (data.telephone) { localStorage.setItem('yoppaa_telephone', data.telephone); setClient(p => ({ ...p, telephone: data.telephone })) }
            if (data.prenom && !prenom) { localStorage.setItem('yoppaa_prenom', data.prenom); setClient(p => ({ ...p, prenom: data.prenom })) }
            if (data.nom && !nom) { localStorage.setItem('yoppaa_nom', data.nom); setClient(p => ({ ...p, nom: data.nom })) }
          }
          if (data.commune) setCommune(data.commune)
          else { setCommune(false); setShowConfirmCommune(true) }
        })
        .catch(() => {})
    })
  }, [])

  // ─── Polling client 5s ─────────────────────────────────────────────────────
  // IMPORTANT : on relit localStorage à CHAQUE tick (pas seulement au mount).
  // Sinon après "Se déconnecter", la closure conservait l'ancien email et le
  // polling continuait à re-fetch les commandes, faisant réapparaître l'onglet
  // Commandes côté UI après le clear state.
  useEffect(() => {
    const iv = setInterval(() => {
      const email = typeof window !== 'undefined' ? localStorage.getItem('yoppaa_email') : null
      if (!email) return  // utilisateur déconnecté → on saute ce tick (mais on laisse l'interval tourner pour le cas re-login)
      chargerCommandesClient(email); chargerRdvsClient(email)
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  // ─── Services publics : on charge les nationaux + ceux de la commune ─────
  useEffect(() => {
    let annule = false
    const codesPostaux = commune?.codes_postaux || []
    let q = supabase
      .from('services_publics')
      .select('id, slug, type, nom, description, codes_postaux, national, telephone, adresse, latitude, longitude, logo_url, photo_couverture_url, horaires_detail')
      .eq('statut', 'valide')
      .order('national', { ascending: false })
      .order('type')
      .order('nom')
    if (codesPostaux.length > 0) {
      // overlap : national=true OR au moins un CP commun avec la commune
      q = q.or(`national.eq.true,codes_postaux.ov.{${codesPostaux.join(',')}}`)
    } else {
      // Sans commune : on affiche au moins les urgences nationales
      q = q.eq('national', true)
    }
    q.then(({ data }) => { if (!annule) setServicesPublics(data || []) })
    return () => { annule = true }
  }, [commune?.id])

  // ─── Détection commandes récupérées → propose modale d'avis ─────────────
  // Avis vérifié = uniquement lié à une vraie commande (pas d'avis spontané = anti-troll).
  // Trigger : commande passée à statut='recupere' DEPUIS AU MOINS 60 MIN, pas
  // encore d'avis posté, pas ignoré côté serveur.
  //
  // Décision Alex 01/07/2026 :
  //   - Délai de 60 minutes après recupere_at pour laisser le Yopper goûter
  //     ou utiliser avant de solliciter l'évaluation.
  //   - Le dismiss est persisté côté serveur (commandes.avis_ignore_at) au
  //     lieu de localStorage, pour ne plus reproposer sur les autres devices.
  useEffect(() => {
    if (!clientId || avisCommande) return
    if (!clientCommandes.length) return

    const nowMs = Date.now()
    const DELAI_MIN_MS = 60 * 60 * 1000  // 60 minutes

    const candidates = clientCommandes.filter(c => {
      if (c.statut !== 'recupere' || !c.commercant_id) return false
      if (c.avis_ignore_at) return false  // dismiss serveur
      if (!c.recupere_at) return false    // pas encore setté = trop tôt
      const recupereMs = new Date(c.recupere_at).getTime()
      return (nowMs - recupereMs) >= DELAI_MIN_MS
    })
    if (candidates.length === 0) return

    let annule = false
    supabase.from('avis').select('commande_id').eq('client_id', clientId)
      .then(({ data: avisExistants }) => {
        if (annule) return
        const dejaAvis = new Set((avisExistants || []).map(a => a.commande_id).filter(Boolean))
        // Prend la commande la plus récente (clientCommandes est ordonné par created_at desc côté chargerCommandesClient)
        const prochaine = candidates.find(c => !dejaAvis.has(c.id))
        if (prochaine) setAvisCommande(prochaine)
      })
    return () => { annule = true }
  }, [clientCommandes, clientId, avisCommande])

  // Vérifie s'il y a une alerte urgente active sur un service de la zone
  // → déclenche le badge rouge sur l'onglet Services
  // ET groupe les actus/alertes par service_id pour afficher les pills sur les cards
  useEffect(() => {
    if (servicesPublics.length === 0) {
      setAlerteUrgenteActive(false)
      setActusParService(new Map())
      return
    }
    let annule = false
    const today = new Date().toISOString().slice(0, 10)
    const ids = servicesPublics.map(s => s.id)
    supabase
      .from('actualites')
      .select('id, service_id, urgence')
      .in('service_id', ids)
      .eq('actif', true)
      .lte('date_debut', today)
      .gte('date_fin', today)
      .then(({ data }) => {
        if (annule) return
        // Groupage par service_id
        const map = new Map()
        let anyAlerte = false
        for (const a of data || []) {
          const cur = map.get(a.service_id) || { actus: 0, alertes: 0 }
          if (a.urgence) { cur.alertes++; anyAlerte = true }
          else cur.actus++
          map.set(a.service_id, cur)
        }
        setActusParService(map)
        setAlerteUrgenteActive(anyAlerte)
      })
    return () => { annule = true }
  }, [servicesPublics])

  // Cache reverse geocoding : si on a deja resolu une position proche (~100m), on
  // reutilise la valeur en localStorage et on evite de pinger Nominatim a chaque refresh
  // (leur API publique gratuite a une politique 1 req/s max - sinon ils repondent vide).
  function libelleAdresse(addr) {
    if (!addr) return null
    const rue = addr.road || addr.pedestrian || addr.footway || addr.street || addr.path
    const n = addr.house_number
    if (rue) return n ? `${rue} ${n}` : rue
    return addr.quarter
        || addr.neighbourhood
        || addr.suburb
        || addr.hamlet
        || addr.village
        || addr.town
        || addr.city
        || addr.municipality
        || null
  }

  function demanderGeolocalisation() {
    if (!navigator.geolocation) return
    setGeoLoading(true); setRue(null)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        setPosition({ lat, lng })
        // Clé cache : position arrondie à 3 décimales (~100m de précision)
        const cacheKey = `yoppaa_geo_${lat.toFixed(3)}_${lng.toFixed(3)}`
        try {
          const cached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null
          if (cached) {
            setRue(cached)
            setGeoLoading(false)
            return
          }
        } catch {}
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr&zoom=18&addressdetails=1`, { headers: { 'Accept': 'application/json' } })
          if (res.ok) {
            const data = await res.json()
            const lib = libelleAdresse(data.address) || 'Près de toi'
            setRue(lib)
            try { localStorage.setItem(cacheKey, lib) } catch {}
          } else {
            setRue('Près de toi')
          }
        } catch {
          setRue('Près de toi')
        }
        setGeoLoading(false)
      },
      () => setGeoLoading(false),
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  async function chargerCommercants() {
    // Ne lister QUE les fiches publiées (validation admin OK).
    // Les brouillons / en_attente / refusées restent invisibles côté client.
    const { data } = await supabase
      .from('commercants_public')  // vue publique (colonnes sûres, publiés) — RLS commercants
      .select('*')
      .eq('statut_publication', 'publie')
      .order('nom')
    setCommercants(data || [])
    if (data?.length > 0) {
      chargerNotes(data.map(c => c.id), data)
      chargerActiviteAujourdhui(data.map(c => c.id))
    }
  }

  // Refresh deals/actus quand le user revient sur l'onglet (cas typique : il a cree une
  // actu cote dashboard et revient sur l'app client). + polling 60s en backup.
  // Sans ces 2 mecanismes, les nouvelles actus/deals ne sont jamais visibles cote client
  // sans hard refresh. Bug rapporte Alex 2026-06-01.
  useEffect(() => {
    if (commercants.length === 0) return
    const ids = commercants.map(c => c.id)
    const refresh = () => {
      if (document.visibilityState === 'visible') chargerActiviteAujourdhui(ids)
    }
    const onVisChange = () => refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisChange)
    const interval = setInterval(refresh, 60000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisChange)
      clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commercants.length])

  // Refresh commandes + RDVs client au focus/visibilitychange + polling 60s.
  // Sans ça, la pastille verte du footer (rdvsAVenir.length) ne se met pas a jour
  // quand un RDV est cree dans un autre onglet ou par le webhook Stripe en arriere-plan.
  // Bug rapporte Alex 2026-06-02 ("pastille verte qui disparait").
  useEffect(() => {
    const email = client?.email
    if (!email) return
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        chargerCommandesClient(email)
        chargerRdvsClient(email)
      }
    }
    const onVisChange = () => refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisChange)
    const interval = setInterval(refresh, 60000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisChange)
      clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.email])

  // Charge les deals et actus actifs aujourd'hui pour piloter le dot LIVE des pills
  async function chargerActiviteAujourdhui(ids) {
    if (!ids?.length) return
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const [{ data: deals }, { data: actus }] = await Promise.all([
      // Deals actifs : date_deal = aujourd'hui, OU intervalle date_debut/date_fin qui englobe.
      // On charge aussi est_bonne_affaire pour piloter le badge dore sur la card.
      supabase.from('yoppaa_deals')
        .select('commercant_id, date_deal, date_debut, date_fin, actif, est_bonne_affaire')
        .in('commercant_id', ids)
        .eq('actif', true),
      supabase.from('actualites')
        .select('commercant_id, date_debut, date_fin, actif')
        .in('commercant_id', ids)
        .eq('actif', true),
    ])
    const dealSet = new Set()
    const bonneAffaireSet = new Set()
    ;(deals || []).forEach(d => {
      const dateDeal = d.date_deal || null
      const dStart = d.date_debut ? d.date_debut.slice(0,10) : null
      const dEnd   = d.date_fin   ? d.date_fin.slice(0,10)   : null
      const dans = dateDeal === aujourdhui
        || (dStart && dEnd && dStart <= aujourdhui && aujourdhui <= dEnd)
      if (dans) {
        dealSet.add(d.commercant_id)
        if (d.est_bonne_affaire) bonneAffaireSet.add(d.commercant_id)
      }
    })
    const actuSet = new Set()
    ;(actus || []).forEach(a => {
      const dStart = a.date_debut ? a.date_debut.slice(0,10) : null
      const dEnd   = a.date_fin   ? a.date_fin.slice(0,10)   : null
      const dans = !dStart && !dEnd
        || (dStart && !dEnd && dStart <= aujourdhui)
        || (!dStart && dEnd && aujourdhui <= dEnd)
        || (dStart && dEnd && dStart <= aujourdhui && aujourdhui <= dEnd)
      if (dans) actuSet.add(a.commercant_id)
    })
    setDealsActifs(dealSet)
    setBonnesAffairesActives(bonneAffaireSet)
    setActusActives(actuSet)
  }

  async function chargerNotes(ids, commercantsData = []) {
    const [{ data: avisData }, { data: creneauxData }, { data: commandesData }] = await Promise.all([
      supabase.from('avis').select('commercant_id, note').in('commercant_id', ids),
      supabase.from('creneaux').select('id, commercant_id, heure_debut, heure_fin, max_commandes, actif').in('commercant_id', ids).eq('actif', true),
      supabase.from('commandes').select('commercant_id, creneau_id').in('commercant_id', ids).neq('statut', 'recupere')
    ])
    const notes = {}
    ids.forEach(id => {
      const av = (avisData||[]).filter(a => a.commercant_id === id)
      notes[id] = av.length > 0 ? { moyenne: av.reduce((a, x) => a+x.note, 0)/av.length, count: av.length } : { moyenne: 0, count: 0 }
    })
    setNotesParCommerce(notes)
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    const statuts = {}
    ids.forEach(id => {
      const crensDuJour = (creneauxData||[]).filter(c => c.commercant_id === id)
      const cmds = (commandesData||[]).filter(c => c.commercant_id === id)
      const countParCren = {}
      cmds.forEach(c => { countParCren[c.creneau_id] = (countParCren[c.creneau_id]||0)+1 })
      const crensDispos = crensDuJour.filter(c => {
        const debut = parseInt(c.heure_debut.slice(0,2))*60 + parseInt(c.heure_debut.slice(3,5))
        return debut > nowMin && (countParCren[c.id]||0) < c.max_commandes
      })
      const placesTotales = crensDispos.reduce((acc, c) => acc + (c.max_commandes - (countParCren[c.id]||0)), 0)
      if (crensDuJour.length === 0) { statuts[id] = 'ferme' }
      else if (crensDispos.length === 0) {
        const commercant = commercantsData.find(c => c.id === id)
        const heureOuv = commercant?.heure_ouverture_resa ? commercant.heure_ouverture_resa.slice(0,5) : '21:00'
        const tousPassees = crensDuJour.every(c => parseInt(c.heure_debut.slice(0,2))*60 + parseInt(c.heure_debut.slice(3,5)) <= nowMin)
        statuts[id] = (nowMin >= heureEnMinutes(heureOuv) && tousPassees) ? 'ouvert' : 'complet'
      } else if (placesTotales <= 2) { statuts[id] = 'urgent' }
      else { statuts[id] = 'ouvert' }
    })
    setStatutsCommerce(statuts)
  }

  async function chargerFavoris(cid) {
    const { data } = await supabase.from('favoris').select('commercant_id').eq('client_id', cid)
    const ids = (data||[]).map(f => f.commercant_id)
    setFavoris(ids)
    if (ids.length > 0) {
      const { data: comms } = await supabase
        .from('commercants_public')  // vue publique — RLS commercants
        .select('*')
        .in('id', ids)
        .eq('statut_publication', 'publie')
      setCommercantsFavoris(comms||[])
    }
  }

  // Fetch tous les RDVs du Yopper (vitrines, services). On garde les statuts vivants
  // (confirme, honore) pour les stats profil ; les annules / no-show sont retires pour
  // ne pas polluer le compteur "RDVs".
  async function chargerRdvsClient(email) {
    // Le SELECT direct Supabase echoue silencieusement sur les Yoppers non-auth
    // (RLS "Client voit ses RDV" exige auth.uid()). On passe par une route
    // serveur qui bypass RLS via service_role + auth cookie yopper HTTP-only.
    // Le param email est conserve pour compat (deja passe partout), la route
    // ignore et utilise le cookie serveur pour identifier le Yopper.
    try {
      const res = await fetch('/api/rdv/mes-rdvs', { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!body?.ok) {
        console.warn('[chargerRdvsClient] route KO', body)
        setClientRdvs([])
        return
      }
      console.info('[chargerRdvsClient]', { email, count: body.count })
      setClientRdvs(body.rdvs || [])
    } catch (e) {
      console.error('[chargerRdvsClient] exception', e?.message)
      setClientRdvs([])
    }
  }

  // Annulation d'un RDV depuis la vue Mes RDVs. Auth par rdv_id + client_email
  // (pas besoin du token dans ce contexte, le user est déjà identifié côté front).
  // Refund Stripe automatique côté serveur si acompte payé en ligne + avant cutoff.
  async function annulerRdv(rdv) {
    if (!rdv?.id || !rdv?.client_email) return
    askConfirm({
      title: 'Annuler ce RDV ?',
      message: 'L\'acompte sera remboursé automatiquement si tu en as payé un.',
      confirmLabel: 'Annuler le RDV',
      danger: true,
      onConfirm: async () => {
        try {
          const res = await fetch('/api/rdv/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rdv_id: rdv.id, client_email: rdv.client_email }),
          })
          const data = await res.json()
          if (!res.ok || !data.ok) {
            alert(`Annulation impossible : ${data?.error || 'erreur inconnue'}`)
            return
          }
          await chargerRdvsClient(rdv.client_email)
          const message = rdv.acompte_paye_en_ligne
            ? 'C\'est noté ! RDV annulé, remboursement de l\'acompte en cours 🟣'
            : 'C\'est noté ! Ton RDV est annulé 🟣'
          showToast({ msg: message, type: 'success' })
        } catch (e) {
          console.error('[annulerRdv] erreur', e)
          alert(`Erreur : ${e?.message || 'inconnue'}`)
        }
      },
    })
  }

  // Annulation d'une commande C&C depuis la vue Mes Commandes (parallèle au RDV).
  // Auth par commande_id + client_email. La route /api/commande/cancel verifie le
  // cutoff (created vs heure de retrait) et refund Stripe si paye_en_ligne=true.
  async function annulerCommandeFromList(c) {
    const email = c?.client_email || client.email
    if (!c?.id || !email) return
    askConfirm({
      title: 'Annuler cette commande ?',
      message: 'Si tu as payé en ligne, le remboursement sera lancé automatiquement.',
      confirmLabel: 'Annuler la commande',
      danger: true,
      onConfirm: async () => {
        try {
          const res = await fetch('/api/commande/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commande_id: c.id, client_email: email }),
          })
          const data = await res.json()
          if (!res.ok || !data.ok) {
            alert(`Annulation impossible : ${data?.error || 'erreur inconnue'}`)
            return
          }
          await chargerCommandesClient(email)
          const message = c.paye_en_ligne
            ? 'Yoppé ! Commande annulée, remboursement en cours 🟣'
            : 'Yoppé ! Ta commande est annulée 🟣'
          showToast({ msg: message, type: 'success' })
        } catch (e) {
          console.error('[annulerCommandeFromList] erreur', e)
          alert(`Erreur : ${e?.message || 'inconnue'}`)
        }
      },
    })
  }

  async function chargerCommandesClient(email) {
    const { data } = await supabase.from('commandes').select('*, commercant:commercants(nom, type), creneau:creneaux(heure_debut, heure_fin), creneau_livraison:livraison_creneaux(heure_debut, heure_fin)').eq('client_email', email).order('created_at', { ascending: false })
    if (!data || data.length === 0) { setClientCommandes([]); return }

    // FIX NUMÉRO : enrichir chaque commande avec son numéro affiché
    // (numero_commande DB en priorité, sinon position du jour - même logique
    // que le dashboard et le PickupScreen).
    function dateKeyOf(c) {
      const ref = c.date_commande || c.created_at
      if (typeof ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ref)) return ref
      return new Date(ref).toISOString().slice(0, 10)
    }
    const cles = [...new Set(data.map(c => `${c.commercant_id}|${dateKeyOf(c)}`))]
    const positionsMap = {}
    await Promise.all(cles.map(async cle => {
      const [cid, dateStr] = cle.split('|')
      const { data: duJour } = await supabase
        .from('commandes')
        .select('id, created_at, creneau:creneaux(heure_debut)')
        .eq('commercant_id', cid)
        .eq('date_commande', dateStr)
        .order('created_at', { ascending: true })
      const tri = (duJour || []).sort((a, b) =>
        (a.creneau?.heure_debut || '').localeCompare(b.creneau?.heure_debut || '') ||
        new Date(a.created_at) - new Date(b.created_at)
      )
      tri.forEach((c, idx) => { positionsMap[c.id] = idx + 1 })
    }))
    const enriched = data.map(c => ({
      ...c,
      numeroAffiche: c.numero_commande || positionsMap[c.id] || null,
    }))
    setClientCommandes(enriched)
  }

  useEffect(() => {
    if (!position || !commercants.length) return
    calculerDistances(commercants, position)
  }, [position, commercants.length])

  function calculerDistances(liste, pos) {
    // Distance à vol d'oiseau (Haversine) pour le tri "près de toi". C'est la
    // norme des apps de découverte (Yelp, résultats Google Maps, store locators)
    // et c'est suffisant à l'échelle locale. La distance routière (ORS via la
    // route /api/distance, en réserve) est réservée au module livraison alim, où
    // elle a un sens opérationnel (frais + zones). Décision Alex 05/07.
    const avecDistance = liste.map(c => ({
      ...c,
      distance: c.latitude && c.longitude
        ? distanceVolOiseau(pos.lat, pos.lng, parseFloat(c.latitude), parseFloat(c.longitude))
        : null,
    }))
    avecDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    setCommercants(avecDistance)
  }

  async function geocoderAdresseManuelle(adresse) {
    if (!adresse.trim()) return
    setGeoLoading(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(adresse)}&format=json&limit=1&accept-language=fr`, { headers: { 'Accept': 'application/json' } })
      if (res.ok) {
        const data = await res.json()
        if (data && data.length > 0) {
          const { lat, lon, display_name } = data[0]
          const newPos = { lat: parseFloat(lat), lng: parseFloat(lon) }
          setPosition(newPos)
          const parts = display_name.split(',')
          setRue(parts.slice(0, 2).join(',').trim())
          calculerDistances(commercants, newPos)
        } else {
          setRue(adresse)
        }
      }
    } catch { setRue(adresse) }
    setGeoLoading(false)
    setShowLocManuelle(false)
  }

  async function getOuCreerClient(email, nom) {
    // Get-or-create côté serveur (RLS clients verrouillé : plus d'accès anon direct).
    const res = await fetch('/api/yopper/client', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-or-create', email, nom }),
    })
    const j = await res.json().catch(() => ({}))
    const id = j?.client?.id
    if (!id) return null
    setClientId(id); localStorage.setItem('yoppaa_client_id', id); localStorage.setItem('yoppaa_email', email); localStorage.setItem('yoppaa_nom', nom)
    if (!j.created) { chargerFavoris(id); chargerCommandesClient(email); chargerRdvsClient(email) }
    return id
  }

  async function toggleFavori(commercantId, e) {
    e.stopPropagation()
    if (!client.email) {
      router.push('/commander/auth?redirect=/commander')
      return
    }
    let cid = clientId || await getOuCreerClient(client.email, client.nom)
    if (!cid) return
    if (favoris.includes(commercantId)) {
      await supabase.from('favoris').delete().eq('client_id', cid).eq('commercant_id', commercantId)
      setFavoris(prev => prev.filter(id => id!==commercantId))
      setCommercantsFavoris(prev => prev.filter(c => c.id!==commercantId))
      // Retrait du tag OneSignal côté serveur (valeur vide = suppression du tag).
      syncYopperTags({ [`favori:${commercantId}`]: '' })
      showToast({ type: 'info', msg: 'Retiré de tes favoris' })
    } else {
      await supabase.from('favoris').insert({ client_id: cid, commercant_id: commercantId })
      setFavoris(prev => [...prev, commercantId])
      const c = commercants.find(x => x.id===commercantId)
      if (c) setCommercantsFavoris(prev => [...prev, c])
      // Prompt push (client, user activation) + pose du tag côté serveur.
      taggerFavoriOneSignal(commercantId, true)
      syncYopperTags({ [`favori:${commercantId}`]: '1' })
      const nom = commercants.find(x => x.id===commercantId)?.nom
      showToast({ type: 'success', msg: `${nom ? nom + ' ajouté' : 'Ajouté'} aux favoris · tu recevras ses deals et actus` })
    }
  }

  function selectionnerCommercant(c) {
    if (!c.slug) {
      // Defensive : ne devrait jamais arriver depuis l'API admin/valider (auto-genere le slug),
      // mais on log pour debug + toast pour ne pas laisser l'user dans le silence si bug DB.
      console.warn('[selectionnerCommercant] commercant sans slug, click ignoré', { id: c.id, nom: c.nom })
      showToast({ type: 'info', msg: `Fiche temporairement indisponible pour ${c.nom}` })
      return
    }
    localStorage.setItem('yoppaa_onglet', 'accueil')
    // Routing par catégorie :
    //   • vitrine (coiffeur, esthe, etc.) → /commander/rdv/[slug] (module RDV natif)
    //   • alimentaire (boulangerie, etc.) → /commander/[slug] (Click & Collect)
    const route = c.categorie === 'vitrine' ? `/commander/rdv/${c.slug}` : `/commander/${c.slug}`
    router.push(route)
  }

  // Pour les stats profil on exclut les RDVs annules/no_show (sinon le compteur 'RDVs' du
  // profil et 'temps economise' seraient gonfles par des RDVs ratees).
  const rdvsActifs = clientRdvs.filter(r => r.statut === 'confirme' || r.statut === 'honore')

  // Temps economise : commandes retirees (~7-15min par type, file evitee) + RDVs pris en
  // ligne (~3min par RDV, appel/deplacement evite).
  const tempsEconomise =
    clientCommandes.filter(c => c.statut === 'recupere').reduce((acc, c) => acc + getTemps(c.commercant?.type), 0)
    + rdvsActifs.length * 3

  // Statistiques additionnelles (cards grid 2x2)
  const totalDepense =
    clientCommandes.reduce((acc, c) => acc + Number(c.total || 0), 0)
    + rdvsActifs.filter(r => r.statut === 'honore').reduce((acc, r) => acc + Number(r.prix_estime || 0), 0)
  const commercesUniques = new Set([
    ...clientCommandes.map(c => c.commercant_id),
    ...rdvsActifs.map(r => r.commercant_id),
  ].filter(Boolean)).size

  const commercantsFiltres = commercants
    .filter(c => categorieActive === 'Tous' || parseTypes(c.type).some(t => t===categorieActive || t.includes(categorieActive)))
    .filter(c => !searchQuery.trim() || c.nom.toLowerCase().includes(searchQuery.toLowerCase()) || (c.type||'').toLowerCase().includes(searchQuery.toLowerCase()) || (c.adresse||'').toLowerCase().includes(searchQuery.toLowerCase()))

  // Retrait « prêt à retirer » : swipe pour confirmer le retrait au comptoir.
  const commandesASwiper = clientCommandes.filter(c => c.statut === 'pret' && c.mode_retrait !== 'livraison')
  // Livraison EN COURS de livraison (le commerçant est parti) : swipe pour confirmer
  // la RÉCEPTION. Tant que statut_livraison n'est pas 'en_livraison', la commande
  // reste dans « En cours » (pas d'action possible côté Yopper).
  const commandesEnLivraison = clientCommandes.filter(c => c.mode_retrait === 'livraison' && c.statut === 'pret' && c.statut_livraison === 'en_livraison')
  const commandesEnCours = clientCommandes.filter(c =>
    ['en_attente','en_preparation'].includes(c.statut)
    || (c.mode_retrait === 'livraison' && c.statut === 'pret' && c.statut_livraison !== 'en_livraison')
  )
  // Historique : commandes recuperees + annulees (par client ou paiement_ko) + non_retire.
  // On garde la commande visible avec son statut final pour que le Yopper ait toujours
  // accès à son historique (signale par Alex : la commande annulee ne doit pas disparaitre).
  const commandesTerminees = clientCommandes.filter(c => ['recupere', 'annulee_client_refund', 'annulee_paiement_ko', 'non_retire'].includes(c.statut))
  // RDV vitrine a venir : statut confirme + date >= aujourd'hui
  const _todayMidnight = new Date(); _todayMidnight.setHours(0,0,0,0)
  const rdvsAVenir = clientRdvs
    .filter(r => r.statut === 'confirme' && r.date_rdv && new Date(r.date_rdv) >= _todayMidnight)
    .sort((a, b) => `${a.date_rdv}T${a.heure_debut || ''}`.localeCompare(`${b.date_rdv}T${b.heure_debut || ''}`))
  const rdvsPasses = clientRdvs
    .filter(r => !(r.statut === 'confirme' && r.date_rdv && new Date(r.date_rdv) >= _todayMidnight))
    .sort((a, b) => `${b.date_rdv}T${b.heure_debut || ''}`.localeCompare(`${a.date_rdv}T${a.heure_debut || ''}`))

  // Badge footer = commandes en cours/pretes/en livraison + RDVs a venir (cumul)
  const badgeCommandes = commandesASwiper.length + commandesEnLivraison.length + commandesEnCours.length + rdvsAVenir.length

  const card = { background: '#fff', borderRadius: 14, padding: '1rem', marginBottom: '0.75rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 1px 6px rgba(107,53,196,0.05)' }
  const btnPrimary = { width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }
  const statutStyle = {
    // 'recupere' (historique) -> neutre gris pour eviter de confondre avec les RDVs (vert).
    recupere:       { bg: '#F3F4F6', color: '#6B7280', label: 'Récupérée' },
    // 'pret' garde le vert : seul statut a action immediate (signature couleur preservee).
    pret:           { bg: '#F0FDF4', color: '#10B981', label: 'Prête à retirer' },
    en_preparation: { bg: '#EFF6FF', color: '#2563EB', label: 'En préparation' },
    // 'en_attente' (Validee) -> violet (signature commande alimentaire, pas vert).
    en_attente:     { bg: T.pale,    color: T.main,    label: 'Validée' },
  }
  // Sous-texte chaleureux par statut (affiche sous la pastille pour donner du contexte)
  const statutSousTexte = {
    en_attente:     'Ton commerçant préféré va bientôt s’y mettre 🟣',
    en_preparation: 'Préparation lancée, c’est entre de bonnes mains',
    pret:           'Présente-toi à l’heure de ton créneau',
  }

  // Vérifie si le créneau de retrait a commencé (peut SWIPER)
  function peutRetirer(commande) {
    if (!commande?.creneau?.heure_debut) return true
    const dateRef = commande.date_commande || commande.created_at
    const dateStr = typeof dateRef === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRef)
      ? dateRef
      : new Date(dateRef).toISOString().slice(0, 10)
    const [h, m] = commande.creneau.heure_debut.slice(0,5).split(':').map(Number)
    const target = new Date(dateStr + 'T00:00:00')
    target.setHours(h, m, 0, 0)
    return new Date() >= target
  }

  // Minutes restantes avant le début du créneau (positif = pas encore l'heure)
  function minutesAvantCreneau(commande) {
    if (!commande?.creneau?.heure_debut) return 0
    const dateRef = commande.date_commande || commande.created_at
    const dateStr = typeof dateRef === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRef)
      ? dateRef
      : new Date(dateRef).toISOString().slice(0, 10)
    const [h, m] = commande.creneau.heure_debut.slice(0,5).split(':').map(Number)
    const target = new Date(dateStr + 'T00:00:00')
    target.setHours(h, m, 0, 0)
    const diffMs = target - new Date()
    return Math.max(0, Math.ceil(diffMs / 60000))
  }

  // Formate les minutes en "X min" / "Xh Y min" / "Xj Yh"
  function formatTempsRestant(min) {
    if (min < 60) return `${min} min`
    if (min < 1440) {
      const h = Math.floor(min / 60)
      const m = min % 60
      return m === 0 ? `${h}h` : `${h}h ${m} min`
    }
    const j = Math.floor(min / 1440)
    const h = Math.floor((min % 1440) / 60)
    return h === 0 ? `${j}j` : `${j}j ${h}h`
  }

  return (
    <>
      {/* Init OneSignal Web SDK + sync tags (yopper_id, code_postal, favori:*).
          Chargé seulement dans /commander (pas dans /dashboard ni admin). */}
      <OneSignalInit
        yopperId={clientId}
        codePostal={commune?.codes_postaux?.[0]}
        favoris={favoris}
      />

      {showSplash && <SplashScreen onDone={onSplashDone}/>}

      {/* Confirmation/changement commune Yopper.
          mode='first' : pas fermable, déclenchée auto si commune_id null
          mode='change' : fermable, déclenchée depuis bouton "Changer ma commune" */}
      {showConfirmCommune && clientId && (
        <ConfirmCommune
          clientId={clientId}
          currentCommuneId={commune?.id || null}
          mode={commune ? 'change' : 'first'}
          onClose={() => setShowConfirmCommune(false)}
          onSet={(id, c) => {
            setCommune(c)
            setShowConfirmCommune(false)
          }}
        />
      )}

      {/* Modal d'avis post-commande : déclenchée auto 60 min après recupere_at,
          si aucun avis n'existe et si le Yopper n'a pas dismiss cette commande
          serveur (avis_ignore_at). Le dismiss est persiste via l'API pour ne
          plus reproposer sur les autres devices (fix Alex 01/07). */}
      {avisCommande && clientId && avisCommande.commercant && (
        <ModalAvis
          commercant={{ id: avisCommande.commercant_id, nom: avisCommande.commercant.nom, type: avisCommande.commercant.type }}
          clientId={clientId}
          commandeId={avisCommande.id}
          onClose={async () => {
            try {
              await fetch('/api/commande/ignore-avis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ commande_id: avisCommande.id }),
              })
            } catch (e) {
              console.warn('[commande/ignore-avis] échoué', e?.message)
            }
            // Rafraîchir les commandes pour récupérer avis_ignore_at à jour
            chargerCommandesClient(client.email)
            setAvisCommande(null)
          }}
          onSent={() => {
            // L'avis pose dans la table 'avis' bloquera naturellement la
            // re-proposition (filtre dejaAvis dans le useEffect). Pas besoin
            // de flag additionnel cote commande.
          }}
        />
      )}

      {/* FIX FOOTER : PickupScreen rendu HORS de .page-wrap pour éviter le stacking context
          (overflow-x: hidden sur .page-wrap bloque position:fixed des enfants) */}
      {pickupCommande && (
        <PickupScreen
          commande={pickupCommande}
          clientPrenom={client.prenom || client.nom?.split(' ')[0] || 'Yopper'}
          onConfirm={async () => {
            // Livraison : le Yopper confirme la RÉCEPTION → statut_livraison='livree'
            // en plus de statut='recupere' (aligné sur le flux commerçant).
            const patch = pickupCommande.mode_retrait === 'livraison'
              ? { statut: 'recupere', statut_livraison: 'livree' }
              : { statut: 'recupere' }
            await supabase.from('commandes').update(patch).eq('id', pickupCommande.id)
            setPickupCommande(null)
            chargerCommandesClient(client.email)
          }}
        />
      )}

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        /* Anti-débord horizontal MAXIMAL : aucun scroll horizontal autorisé sur la page entière.
           Le scroll vertical naturel reste OK. Les barres internes (.cats) gardent leur scroll-x interne. */
        html, body {
          height: 100%;
          width: 100%;
          max-width: 100vw;
          overflow-x: hidden !important;
          /* Bloque tout pan horizontal - seul le pan vertical et le pinch-zoom restent */
          touch-action: pan-y pinch-zoom !important;
          overscroll-behavior-x: none;
        }
        body { background: ${T.bg}; font-family: "DM Sans", sans-serif; font-size: 16px; -webkit-text-size-adjust: 100%; position: relative; }
        .page-wrap {
          display: flex; flex-direction: column;
          min-height: 100dvh; max-width: 760px; margin: 0 auto;
          background: ${T.bg}; width: 100%;
          overflow-x: hidden;
        }
        /* Force chaque enfant direct du page-wrap à rester dans la largeur. */
        .page-wrap > * { max-width: 100%; }
        .scroll-body {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          /* Bloque la propagation du scroll vers la page (rubber-banding) + pan-x interdit */
          overscroll-behavior: contain;
          touch-action: pan-y;
        }
        .scroll-body > * { max-width: 100%; }
        /* Hero + footer alignes sur la largeur des cards (760px max via page-wrap).
           La classe .hero-fullwidth est conservee mais ne fait plus rien - gardee pour ne pas
           casser les references existantes. Le rendu suit naturellement la largeur du parent. */
        .hero-fullwidth { /* no-op */ }
        /* Grille 2 cols pour les commerces sur PC/tablette large */
        @media (min-width: 800px) {
          .commerces-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; align-items: start; }
          .commerces-grid > * { margin-bottom: 0 !important; }
        }
        /* Footer nav : padding horizontal généreux pour ne pas toucher les courbes
           des angles iPhone + safe area iOS. Les onglets utilisent flex:1 mais
           restent à l'intérieur de cette zone safe. */
        /* Navbar : alignee sur la largeur des cards (760px page-wrap). Pas de full-width viewport. */
        .navbar {
          flex-shrink: 0;
          background: ${T.bgPanel};
          border-top: 1px solid ${T.main}33;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .navbar-tabs {
          display: flex;
          width: 100%;
          padding-left: max(env(safe-area-inset-left, 0px), 16px);
          padding-right: max(env(safe-area-inset-right, 0px), 16px);
          box-sizing: border-box;
        }
        .cats { display: flex; gap: 6px; overflow-x: auto; padding: 0 1rem 0.875rem; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .cats::-webkit-scrollbar { display: none; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        input, textarea, button, select { font-family: "DM Sans", sans-serif; }
        @keyframes tribu-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.15); } }
        @keyframes tribu-pulse2 { 0%,100% { opacity:0.85; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.1); } }
        @keyframes tribu-pulse3 { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:0.3; transform:scale(1.05); } }
        @keyframes dot-pulse { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.4); opacity:0.7; } }
        @keyframes dot-wave { 0%,60%,100% { transform: translateY(0); opacity:1; } 30% { transform: translateY(-3px); opacity:1; } }
        @keyframes yoppa-live-pulse { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.45); opacity:0.7; } }
        @keyframes toast-in { 0% { opacity:0; transform:translate(-50%, 12px) scale(0.95); } 100% { opacity:1; transform:translate(-50%, 0) scale(1); } }
        @keyframes modal-in { 0% { opacity:0; transform:translateY(12px) scale(0.96); } 100% { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes dot-pop { 0% { opacity:0; transform:scale(0) translateY(8px); } 70% { transform:scale(1.3) translateY(-4px); } 100% { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes wordmark-in { 0% { opacity:0; letter-spacing: 8px; } 100% { opacity:1; letter-spacing: -2px; } }
        @keyframes tagline-in { 0% { opacity:0; transform:translateY(6px); } 100% { opacity:1; transform:translateY(0); } }
        @keyframes splash-out { 0% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1.05); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .search-input:focus { border-color: rgba(255,255,255,0.6) !important; outline: none; }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="page-wrap">

        {/* ── HERO HEADER ── */}
        <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #3D1580 100%)`, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          {/* Barre dégradée fine 3px en haut - signature visuelle Yoppaa (design system canonique) */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 2 }}/>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 10%, ${T.mid}33 0%, transparent 50%), radial-gradient(circle at 10% 90%, ${T.light}18 0%, transparent 50%), radial-gradient(circle at 50% 50%, ${T.main}22 0%, transparent 70%)`, pointerEvents: 'none' }}/>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.875rem 1rem 0.625rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              {/* Wordmark tricolore : yo (blanc), pp (Light), aa (Mid) - canonique Good Morning Yoppers */}
              <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.05em', lineHeight: 1, margin: 0 }}>
                <span style={{ color: '#fff' }}>yo</span>
                <span style={{ color: T.light }}>pp</span>
                <span style={{ color: T.mid }}>aa</span>
              </p>
              {/* Dots V2-B centres sous le wordmark - meme animation que la page Tribu */}
              <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 4, height: 11 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', boxShadow: `0 0 6px #ffffffaa`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s forwards' }}/>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.light, marginTop: 2.8, boxShadow: `0 0 6px ${T.light}aa`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.2s forwards' }}/>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.light, marginTop: 2.8, boxShadow: `0 0 6px ${T.light}aa`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.3s forwards' }}/>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.mid, marginTop: 2.8, boxShadow: `0 0 6px ${T.mid}aa`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.4s forwards' }}/>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.mid, boxShadow: `0 0 6px ${T.mid}aa`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.5s forwards' }}/>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BoutonGoodMorning nonVu={gmNonVu} onClick={() => router.push('/commander/morning')}/>
                <button onClick={() => { if (!showLocManuelle) demanderGeolocalisation(); setShowLocManuelle(false) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', border: `1px solid ${T.light}33`, borderRadius: 100, padding: '0.45rem 0.875rem 0.45rem 0.75rem', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', transition: 'all 0.2s', letterSpacing: '-0.2px' }}>
                {geoLoading
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2.5" strokeDasharray="30 10" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.light} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                }
                <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {geoLoading ? 'Localisation...' : rue || locManuelle || (position ? 'Près de toi' : 'Activer GPS')}
                </span>
              </button>
              </div>
              <button onClick={() => setShowLocManuelle(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'rgba(196,160,244,0.7)', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                {showLocManuelle
                  ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="rgba(196,160,244,0.8)" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  : <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="rgba(196,160,244,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="rgba(196,160,244,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                }
                {showLocManuelle ? 'Fermer' : 'Saisir manuellement'}
              </button>
            </div>
          </div>



          {showLocManuelle && onglet === 'accueil' && (
            <div style={{ padding: '0 1rem 0.625rem', animation: 'fadeUp 0.2s ease' }}>
              <div style={{ position: 'relative' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <circle cx="12" cy="10" r="5" stroke="rgba(255,255,255,0.6)" strokeWidth="2.2"/>
                  <path d="M12 15 C12 15 6 20 6 22 Q6 24 12 24 Q18 24 18 22 C18 20 12 15 12 15Z" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinejoin="round" fill="none"/>
                </svg>
                <input
                  placeholder="Ville, rue, code postal..."
                  value={locManuelle}
                  onChange={e => setLocManuelle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && locManuelle.trim()) { geocoderAdresseManuelle(locManuelle.trim()) } }}
                  autoFocus
                  style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.5rem', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', backdropFilter: 'blur(8px)', outline: 'none' }}
                />
                {locManuelle && (
                  <button onClick={() => { if (locManuelle.trim()) geocoderAdresseManuelle(locManuelle.trim()) }}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: T.main, border: 'none', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    OK
                  </button>
                )}
              </div>
              <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginTop: 4, paddingLeft: 4 }}>Entrée ou OK pour valider</p>
            </div>
          )}


          {onglet === 'accueil' && (
            <div style={{ padding: '0.625rem 1rem 0.625rem' }}>
              <div style={{ position: 'relative', maxWidth: 520, margin: '0 auto' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <circle cx="11" cy="11" r="7" stroke="rgba(255,255,255,0.55)" strokeWidth="2.2"/>
                  <path d="M16.5 16.5L21 21" stroke="rgba(255,255,255,0.55)" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
                <input
                  className="search-input"
                  placeholder="Rechercher un commerce…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem 1rem 0.4rem 2.1rem', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', backdropFilter: 'blur(8px)' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: '#fff', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                )}
              </div>
            </div>
          )}

          {onglet === 'accueil' && (
            <CategoriesScroll categorieActive={categorieActive} setCategorieActive={setCategorieActive}/>
          )}

          {onglet !== 'accueil' && <div style={{ height: 10 }}/>}
        </div>

        {/* ── CONTENU ── */}
        <div className="scroll-body">

          {/* ACCUEIL */}
          {onglet === 'accueil' && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              {position && commercantsFiltres.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                    Près de toi
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>
                    {commercantsFiltres.length} commerce{commercantsFiltres.length > 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {commercantsFiltres.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: 18, background: T.pale, marginBottom: 14 }}>
                    <IconSearch size={36} color={T.main}/>
                  </div>
                  <p style={{ fontWeight: 800, color: T.ink, marginBottom: 4, letterSpacing: '-0.2px' }}>Aucun résultat</p>
                  <p style={{ fontSize: '0.875rem', color: T.muted }}>Essaie une autre catégorie ou recherche.</p>
                </div>
              ) : (
                <div className="commerces-grid">
                  {commercantsFiltres.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} statutsCommerce={statutsCommerce} dealsActifs={dealsActifs} actusActives={actusActives} bonnesAffairesActives={bonnesAffairesActives} onSelect={selectionnerCommercant} onToggleFavori={toggleFavori}/>)}
                </div>
              )}

              {/* ─── Section "Services & administrations" RETIRÉE de la home ───
                  Toutes ces fiches restent accessibles via l'onglet "Officiel".
                  Le state servicesPublics + le fetch sont conservés car l'onglet
                  Officiel et la détection d'alerte urgente les utilisent encore. */}
            </div>
          )}

          {/* COMMANDES */}
          {onglet === 'commandes' && (
            <div>
              {/* Hero header commandes - pattern canonique : 3px bar + radial multi + 3 points tricolores + eyebrow */}
              <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #1e0950 100%)`, padding: '0.875rem 1rem 1.25rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 2 }}/>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.main}44 0%, transparent 55%), radial-gradient(circle at 10% 90%, ${T.light}14 0%, transparent 50%)`, pointerEvents: 'none' }}/>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, position: 'relative' }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', margin: 0, opacity: 0.85 }}>Yoppers</p>
                </div>
                <h2 style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '-0.6px', margin: 0, position: 'relative', lineHeight: 1.1, color: '#fff' }}>
                  Commandes et rendez-vous
                </h2>
                {badgeCommandes > 0 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', borderRadius: 100, padding: '4px 12px', marginTop: 10, border: '1px solid rgba(255,255,255,0.15)', position: 'relative' }}>
                    {/* Point violet pale (T.light) au lieu de vert : le vert est reserve aux RDVs
                        et au statut 'Prete a retirer'. Ici on cumule commandes + RDVs, neutre marque. */}
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.light, border: '1.5px solid #fff', boxShadow: `0 0 0 1.5px ${T.light}33, 0 0 8px ${T.light}99`, animation: 'yoppa-live-pulse 1s ease-in-out infinite' }}/>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>{badgeCommandes} en cours</span>
                  </div>
                )}
              </div>

              {/* Toggle Commandes / Rendez-vous - meme onglet, 2 vues distinctes.
                  Labels en clair ("Commandes" / "Rendez-vous"), pas de jargon. Compteurs
                  inline pour signaler la presence d'items dans chaque vue. */}
              <div style={{ padding: '0.75rem 1rem 0', background: '#fff' }}>
                <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 12, padding: 4, gap: 4 }}>
                  {[
                    // Compteurs = items ACTIFS uniquement (pas l'historique total).
                    // Commandes actives = pretes a retirer + en cours (en_attente/en_preparation/pret).
                    // RDVs actifs = a venir (statut=confirme && date >= aujourd'hui).
                    { key: 'alimentaires', label: 'Commandes',    count: commandesASwiper.length + commandesEnLivraison.length + commandesEnCours.length },
                    { key: 'rdvs',          label: 'Rendez-vous', count: rdvsAVenir.length },
                  ].map(tab => {
                    const actif = sousOngletCmd === tab.key
                    // Couleur identite : violet pour Commandes (alimentaire), vert pour Rendez-vous (vitrine).
                    const couleurId = tab.key === 'rdvs' ? '#10B981' : T.main
                    return (
                      <button key={tab.key} onClick={() => setSousOngletCmd(tab.key)}
                        style={{
                          flex: 1, padding: '0.625rem 0.5rem',
                          border: 'none', borderRadius: 9,
                          background: actif ? '#fff' : 'transparent',
                          color: actif ? couleurId : T.muted,
                          fontWeight: 800, fontSize: '0.85rem',
                          fontFamily: '"DM Sans", sans-serif',
                          cursor: 'pointer', transition: 'all 0.15s',
                          boxShadow: actif ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          letterSpacing: '-0.2px',
                        }}>
                        {tab.label}
                        {tab.count > 0 && (
                          <span style={{ background: actif ? couleurId : T.muted, color: '#fff', borderRadius: 100, padding: '1px 7px', fontSize: '0.65rem', fontWeight: 900 }}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ padding: '1rem 1rem 1rem', display: sousOngletCmd === 'alimentaires' ? 'block' : 'none' }}>
              {/* EN LIVRAISON : le commerçant est parti livrer. Le Yopper confirme la
                  réception via le swipe (fallback : le commerçant peut marquer 'Livrée'). */}
              {commandesEnLivraison.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink }}>En livraison</span>
                    <span style={{ background: '#4F46E5', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>{commandesEnLivraison.length}</span>
                  </div>
                  {commandesEnLivraison.map(c => {
                    const cren = c.creneau_livraison || c.creneau
                    return (
                    <div key={c.id} style={{ background: 'linear-gradient(135deg, #EEF2FF, #fff)', borderRadius: 16, overflow: 'hidden', marginBottom: '0.75rem', border: '2px solid #4F46E544', boxShadow: '0 6px 20px #4F46E526' }}>
                      <div style={{ height: 3, background: 'linear-gradient(90deg, #312E81 0%, #4F46E5 60%, #A5B4FC 100%)' }}/>
                      <div style={{ padding: '1rem 1.125rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
                          <div>
                            <p style={{ fontWeight: 800, color: T.ink, marginBottom: 3, fontSize: '0.95rem' }}>
                              {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: '#4F46E5', fontWeight: 700 }}> - commande #{c.numeroAffiche}</span>}
                            </p>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#EEF2FF', borderRadius: 100, padding: '3px 10px', border: '1px solid #4F46E533' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4F46E5', border: '1.5px solid #fff', boxShadow: '0 0 0 1.5px #4F46E544, 0 0 8px #4F46E599', animation: 'yoppa-live-pulse 1s ease-in-out infinite' }}/>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4F46E5' }}>En route vers toi{cren ? ` · ${cren.heure_debut.slice(0,5)}–${cren.heure_fin.slice(0,5)}` : ''}</span>
                            </span>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ marginBottom: 4 }}><BadgeTypeCommande mode={c.mode_retrait} /></div><p style={{ fontWeight: 900, color: '#4F46E5', fontSize: '1rem', letterSpacing: '-0.3px' }}>{Number(c.total).toFixed(2)}€</p></div>
                        </div>
                        <button onClick={() => setPickupCommande(c)}
                          style={{ width: '100%', padding: '0.875rem', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.95rem', background: 'linear-gradient(135deg, #4F46E5, #6366F1)', color: '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 16px #4F46E544', letterSpacing: '-0.3px' }}>
                          J&apos;ai reçu ma commande →
                        </button>
                      </div>
                    </div>
                  )})}
                </>
              )}
              {commandesASwiper.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: commandesEnLivraison.length > 0 ? '1rem' : 0 }}>
                    <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink }}>Prêtes à retirer</span>
                    <span style={{ background: T.main, color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>{commandesASwiper.length}</span>
                  </div>
                  {commandesASwiper.map(c => {
                    const ok = peutRetirer(c)
                    const min = ok ? 0 : minutesAvantCreneau(c)
                    const cren = c.creneau || c.creneau_livraison
                    const heureCreneau = cren?.heure_debut?.slice(0,5)
                    const prenom = client.prenom || client.nom?.split(' ')[0] || 'Yopper'
                    return (
                    /* Card 'Prete a retirer' : signature violette renforcee.
                       L'effet 'action urgente' est cree par glow violet intense + bordure plus
                       epaisse (2px) + animation pulse sur le dot + bouton CTA gradient marque
                       - pas par le vert (reserve aux RDVs et au design system canonique). */
                    <div key={c.id} style={{ background: `linear-gradient(135deg, ${T.pale}, #fff)`, borderRadius: 16, overflow: 'hidden', marginBottom: '0.75rem', border: `2px solid ${T.main}44`, boxShadow: `0 6px 20px ${T.main}26` }}>
                      {/* Bande 3px canonique Yoppaa (Ink -> Main -> Light) */}
                      <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                      <div style={{ padding: '1rem 1.125rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
                        <div>
                          <p style={{ fontWeight: 800, color: T.ink, marginBottom: 3, fontSize: '0.95rem' }}>
                            {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: T.main, fontWeight: 700 }}> - commande #{c.numeroAffiche}</span>}
                          </p>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: T.pale, borderRadius: 100, padding: '3px 10px', border: `1px solid ${T.main}33` }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.main, border: '1.5px solid #fff', boxShadow: `0 0 0 1.5px ${T.main}44, 0 0 8px ${T.main}99`, animation: 'yoppa-live-pulse 1s ease-in-out infinite' }}/>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.main }}>{c.mode_retrait === 'livraison' ? 'Prête' : 'Prête à retirer'}{cren ? ` · ${cren.heure_debut.slice(0,5)}–${cren.heure_fin.slice(0,5)}` : ''}</span>
                          </span>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ marginBottom: 4 }}><BadgeTypeCommande mode={c.mode_retrait} /></div><p style={{ fontWeight: 900, color: T.main, fontSize: '1rem', letterSpacing: '-0.3px' }}>{Number(c.total).toFixed(2)}€</p></div>
                      </div>
                      {ok ? (
                        <button onClick={() => setPickupCommande(c)}
                          style={{ width: '100%', padding: '0.875rem', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.95rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 16px ${T.main}44`, letterSpacing: '-0.3px' }}>
                          Retirer ma commande →
                        </button>
                      ) : (
                        <div style={{ background: T.bgPanel, borderRadius: 14, padding: '0.875rem 1rem', color: '#fff', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <p style={{ fontSize: '0.78rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                            ⏱  Plus que {formatTempsRestant(min)} avant ton créneau
                          </p>
                          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.4 }}>
                            Présente-toi à partir de {heureCreneau}. Merci {prenom} 🟣
                          </p>
                        </div>
                      )}
                      </div>
                    </div>
                  )})}
                </>
              )}
              {commandesEnCours.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: commandesASwiper.length > 0 ? '1rem' : 0 }}>
                    <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink }}>En cours</span>
                  </div>
                  {commandesEnCours.map(c => {
                    // Livraison prête mais pas encore partie : libellé/sous-texte dédiés
                    // (le statut 'pret' générique dirait « Prête à retirer », faux ici).
                    const estLivPrete = c.mode_retrait === 'livraison' && c.statut === 'pret'
                    const sc = estLivPrete
                      ? { bg: '#EEF2FF', color: '#4F46E5', label: 'Prête, bientôt livrée' }
                      : statutStyle[c.statut]
                    const sousTexte = estLivPrete
                      ? 'C’est prêt ! Le commerçant va bientôt partir te livrer 🛵'
                      : statutSousTexte[c.statut]
                    const cren = c.creneau || c.creneau_livraison
                    return (
                      <div key={c.id} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: '0.625rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 2px 8px rgba(107,53,196,0.06)' }}>
                        {/* Bande 3px canonique YOPPAA (Ink → Main → Light) - signature pour les commandes en cours */}
                        <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                        <div style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 800, color: T.ink, marginBottom: 3, fontSize: '0.95rem' }}>
                              {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: T.main, fontWeight: 700 }}> - commande #{c.numeroAffiche}</span>}
                            </p>
                            <p style={{ fontSize: '0.72rem', color: T.muted }}>{new Date((c.date_commande || c.created_at) + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}{cren ? ` · ${cren.heure_debut.slice(0,5)}–${cren.heure_fin.slice(0,5)}` : ''}</p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ marginBottom: 4 }}><BadgeTypeCommande mode={c.mode_retrait} /></div>
                            <p style={{ fontWeight: 900, color: T.main, marginBottom: 4, fontSize: '0.95rem', letterSpacing: '-0.3px' }}>{Number(c.total).toFixed(2)}€</p>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: 100, background: sc.bg, color: sc.color }}>{sc.label}</span>
                          </div>
                        </div>
                        {sousTexte && (
                          <p style={{ fontSize: '0.72rem', color: T.deep, marginTop: 8, fontWeight: 600, lineHeight: 1.4 }}>
                            {sousTexte}
                          </p>
                        )}
                        {/* Lien discret "Annuler cette commande". La route vérifie le cutoff
                            (delai_annulation_heures, default 2h avant retrait) et refund Stripe si OK. */}
                        <button onClick={() => annulerCommandeFromList(c)}
                          style={{ marginTop: 10, padding: '6px 12px', background: 'transparent', color: '#DC2626', border: '1px solid #DC262644', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', fontFamily: '"DM Sans", sans-serif' }}>
                          Annuler cette commande
                        </button>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
              {commandesASwiper.length === 0 && commandesEnLivraison.length === 0 && commandesEnCours.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: 20, background: T.pale, marginBottom: 16 }}>
                    <IconBag size={40} color={T.main}/>
                  </div>
                  <p style={{ fontWeight: 800, color: T.ink, marginBottom: 6, fontSize: '1rem', letterSpacing: '-0.2px' }}>Aucune commande en cours</p>
                  <p style={{ fontSize: '0.875rem', color: T.muted, marginBottom: '1.5rem' }}>Tes commandes actives apparaîtront ici.</p>
                  <button onClick={() => setOnglet('accueil')} style={{ ...btnPrimary, width: 'auto', padding: '0.75rem 1.5rem' }}>Commander maintenant</button>
                </div>
              )}
              {commandesTerminees.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historique</span>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                  </div>
                  {commandesTerminees.slice(0, 5).map(c => {
                    // Mapping statuts terminaux vers libellés FR + couleur
                    const statutMapCmd = {
                      recupere:              { label: '✓ Récupérée',           bg: '#F3F4F6', color: '#6B7280' },
                      annulee_client_refund: { label: 'Annulée par toi',       bg: '#FEF2F2', color: '#DC2626' },
                      annulee_paiement_ko:   { label: 'Paiement échoué',       bg: '#FEF2F2', color: '#DC2626' },
                      non_retire:            { label: 'Non retirée',           bg: '#F9FAFB', color: '#6B7280' },
                    }
                    const sc = statutMapCmd[c.statut] || { label: c.statut, bg: T.pale, color: T.muted }
                    return (
                      <div key={c.id} style={{ background: '#fff', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.5rem', border: `1px solid ${T.pale}`, opacity: 0.75, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontWeight: 700, color: T.ink, marginBottom: 2, fontSize: '0.875rem' }}>
                            {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: T.muted, fontWeight: 600 }}> - commande #{c.numeroAffiche}</span>}
                          </p>
                          <p style={{ fontSize: '0.7rem', color: T.muted }}>{new Date((c.date_commande || c.created_at) + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontWeight: 700, color: T.main, marginBottom: 3, fontSize: '0.875rem' }}>{Number(c.total).toFixed(2)}€</p>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: sc.bg, color: sc.color }}>{sc.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Empty state alimentaires si Yopper connecte sans commande */}
              {client.email && commandesASwiper.length === 0 && commandesEnLivraison.length === 0 && commandesEnCours.length === 0 && commandesTerminees.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: T.muted }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: T.deep, marginBottom: 6 }}>Aucune commande pour l&apos;instant</p>
                  <p style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>Tape sur l&apos;onglet Accueil pour commander chez un boulanger, pizzaiolo, etc.</p>
                </div>
              )}
              </div>

              {/* ─── SOUS-ONGLET 'RENDEZ-VOUS' ─── */}
              <div style={{ padding: '1rem 1rem 1rem', display: sousOngletCmd === 'rdvs' ? 'block' : 'none' }}>
                {/* RDVs a venir */}
                {rdvsAVenir.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink }}>À venir</span>
                      <span style={{ background: '#10B981', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>{rdvsAVenir.length}</span>
                    </div>
                    {rdvsAVenir.map(r => {
                      const dateObj = r.date_rdv ? new Date(r.date_rdv + 'T12:00:00') : null
                      const heureD = r.heure_debut?.slice(0,5)
                      const heureF = r.heure_fin?.slice(0,5)
                      const dureeM = (heureEnMinutes(r.heure_fin) - heureEnMinutes(r.heure_debut)) || 0
                      const dureeT = dureeM >= 60 ? `${Math.floor(dureeM/60)}h${dureeM%60>0?(dureeM%60)+'min':''}` : `${dureeM}min`
                      return (
                        <div key={r.id} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: '0.75rem', border: `1.5px solid #10B98133`, boxShadow: '0 2px 8px rgba(16,185,129,0.08)' }}>
                          {/* Bande 3px verte = signature vitrine (cohérent avec les cards accueil) */}
                          <div style={{ height: 3, background: 'linear-gradient(90deg, #047857 0%, #10B981 60%, #6EE7B7 100%)' }}/>
                          <div style={{ padding: '0.875rem 1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '0.62rem', fontWeight: 800, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
                                  {dateObj ? dateObj.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' }) : '-'} · {heureD}
                                </p>
                                <p style={{ fontWeight: 800, color: T.ink, fontSize: '0.95rem', letterSpacing: '-0.2px', lineHeight: 1.25, marginBottom: 4 }}>
                                  {r.prestation_nom || 'Prestation'}
                                </p>
                                <p style={{ fontSize: '0.78rem', color: T.muted, lineHeight: 1.4 }}>
                                  {dureeT} · chez <strong style={{ color: T.deep }}>{r.commercant?.nom}</strong>
                                  {r.praticien?.prenom && (
                                    <> · avec <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: T.deep, fontWeight: 700 }}>
                                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.praticien.couleur_hex || T.main, display: 'inline-block' }}/>
                                      {r.praticien.prenom}
                                    </span></>
                                  )}
                                </p>
                              </div>
                              {r.prix_estime != null && (
                                <p style={{ fontWeight: 900, color: T.main, fontSize: '0.95rem', letterSpacing: '-0.3px', flexShrink: 0 }}>{Number(r.prix_estime).toFixed(0)}€</p>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#F0FDF4', borderRadius: 100, padding: '3px 9px', border: '1px solid #10B98122' }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981' }}/>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10B981' }}>Confirmé · {heureD}–{heureF}</span>
                              </span>
                              {r.acompte_paye_en_ligne && r.acompte_montant && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: T.pale, borderRadius: 100, padding: '3px 9px', border: `1px solid ${T.main}22` }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 11h20"/>
                                  </svg>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: T.main }}>
                                    Acompte {Number(r.acompte_montant).toFixed(2)}€ payé
                                  </span>
                                </span>
                              )}
                            </div>
                            {/* Lien discret "Annuler ce RDV". La route vérifie le cutoff
                                (rdv_delai_annulation_heures) et refund l'acompte si OK. */}
                            <button onClick={() => annulerRdv(r)}
                              style={{ marginTop: 10, padding: '6px 12px', background: 'transparent', color: '#DC2626', border: '1px solid #DC262644', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', fontFamily: '"DM Sans", sans-serif' }}>
                              Annuler ce RDV
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}

                {/* RDVs passes / annules */}
                {rdvsPasses.length > 0 && (
                  <div style={{ marginTop: rdvsAVenir.length > 0 ? '1.5rem' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historique</span>
                      <div style={{ flex: 1, height: 1, background: T.pale }}/>
                    </div>
                    {rdvsPasses.slice(0, 5).map(r => {
                      const dateObj = r.date_rdv ? new Date(r.date_rdv + 'T12:00:00') : null
                      // Mapping statuts vers libellés FR + couleur (badge)
                      const statutMap = {
                        honore:             { label: '✓ Effectué',                 bg: '#F0FDF4', color: '#10B981' },
                        annule_client:      { label: 'Annulé par toi',             bg: '#FEF2F2', color: '#DC2626' },
                        annule_commercant:  { label: 'Annulé par le commerçant',   bg: '#FEF2F2', color: '#DC2626' },
                        no_show:            { label: 'Non honoré',                 bg: '#F9FAFB', color: '#6B7280' },
                        reporte:            { label: 'Reporté',                    bg: '#FFF7ED', color: '#EA580C' },
                      }
                      const st = statutMap[r.statut] || { label: r.statut, bg: T.pale, color: T.muted }
                      const statutLabel = st.label
                      const statutBg = st.bg
                      const statutColor = st.color
                      return (
                        <div key={r.id} style={{ background: '#fff', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.5rem', border: `1px solid ${T.pale}`, opacity: 0.75, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontWeight: 700, color: T.ink, marginBottom: 2, fontSize: '0.875rem' }}>
                              {r.commercant?.nom} <span style={{ color: T.muted, fontWeight: 600 }}>- {r.prestation_nom || 'RDV'}</span>
                            </p>
                            <p style={{ fontSize: '0.7rem', color: T.muted }}>
                              {dateObj?.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })} · {r.heure_debut?.slice(0,5)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {r.prix_estime != null && <p style={{ fontWeight: 700, color: T.main, marginBottom: 3, fontSize: '0.875rem' }}>{Number(r.prix_estime).toFixed(0)}€</p>}
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: statutBg, color: statutColor }}>{statutLabel}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Empty state */}
                {rdvsAVenir.length === 0 && rdvsPasses.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: T.muted }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 700, color: T.deep, marginBottom: 6 }}>Aucun rendez-vous pour l&apos;instant</p>
                    <p style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>Réserve chez un coiffeur, esthéticien ou autre service depuis l&apos;onglet Accueil.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FAVORIS */}
          {/* SERVICES - onglet dédié, hero + 2 sections (Urgences nationales / Locaux) */}
          {onglet === 'services' && PLAN_PUBLIC_ENABLED && (() => {
            const urgences = servicesPublics.filter(s => s.national || s.type === 'urgence')
            const locaux   = servicesPublics.filter(s => !s.national && s.type !== 'urgence')
            return (
              <div>
                <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, ${T.main} 100%)`, padding: '0.875rem 1rem 1.25rem', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 2 }}/>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.light}33 0%, transparent 55%), radial-gradient(circle at 10% 90%, ${T.mid}22 0%, transparent 50%)`, pointerEvents: 'none' }}/>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, position: 'relative' }}>
                    <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', margin: 0, opacity: 0.85 }}>Officiel</p>
                  </div>
                  <h2 style={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-0.6px', margin: 0, lineHeight: 1.1, position: 'relative', color: '#fff' }}>
                    Services &amp; administrations
                  </h2>
                  {commune?.nom && (
                    <p style={{ fontSize: '0.78rem', color: T.light, marginTop: 6, fontWeight: 600, opacity: 0.85, position: 'relative' }}>
                      de {commune.nom} et services nationaux
                    </p>
                  )}
                </div>

                {servicesPublics.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 16, background: T.pale, marginBottom: 12 }}>
                      <IconService type="commune" size={36} color={T.main}/>
                    </div>
                    <p style={{ fontWeight: 800, color: T.ink, marginBottom: 6 }}>Pas de services pour ta zone</p>
                    <p style={{ fontSize: '0.875rem', color: T.muted, lineHeight: 1.5 }}>
                      On ajoute les communes au fil de l&rsquo;eau. Reviens bientôt.
                    </p>
                  </div>
                )}

                {urgences.length > 0 && (
                  <div style={{ padding: '1rem 1rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                        Urgences
                      </span>
                      <div style={{ flex: 1, height: 1, background: T.pale }}/>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{urgences.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                      {urgences.map(s => (
                        <CarteServicePublic key={s.id} s={s} actusInfo={actusParService.get(s.id)} onSelect={() => router.push(`/commander/services/${s.slug}`)}/>
                      ))}
                    </div>
                  </div>
                )}

                {locaux.length > 0 && (
                  <div style={{ padding: '1.25rem 1rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                        Services locaux{commune?.nom ? ` · ${commune.nom}` : ''}
                      </span>
                      <div style={{ flex: 1, height: 1, background: T.pale }}/>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{locaux.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                      {locaux.map(s => (
                        <CarteServicePublic key={s.id} s={s} actusInfo={actusParService.get(s.id)} onSelect={() => router.push(`/commander/services/${s.slug}`)}/>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* TRIBU */}
          {onglet === 'tribu' && (
            <div>
              {/* Hero - wordmark "Yoppers" tricolore (cohérence design system) + 3 cercles animés */}
              <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.main} 100%)`, padding: '2rem 1rem 2.25rem', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 50% 100%, ${T.light}33 0%, transparent 60%)`, pointerEvents: 'none' }}/>
                {/* Barre dégradée fine en haut - signature visuelle Yoppaa */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

                <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: 8, opacity: 0.85 }}>
                  La tribu
                </p>
                <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2.4rem', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 10 }}>
                  <span style={{ color: '#fff' }}>Yo</span>
                  <span style={{ color: T.light }}>pp</span>
                  <span style={{ color: T.mid }}>ers</span>
                </p>
                {/* Dots V2-B sous le wordmark Yoppers - animation pop cascade UNE FOIS au chargement de l'onglet */}
                <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 9, height: 22, marginBottom: 14 }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: `0 4px 14px #ffffff66`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s forwards' }}/>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.light, marginTop: 6.4, boxShadow: `0 4px 14px ${T.light}66`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.2s forwards' }}/>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: T.light, marginTop: 6.4, boxShadow: `0 4px 14px ${T.light}66`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.3s forwards' }}/>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.mid, marginTop: 6.4, boxShadow: `0 4px 14px ${T.mid}66`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.4s forwards' }}/>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: T.mid, boxShadow: `0 4px 14px ${T.mid}66`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.5s forwards' }}/>
                </div>
                <p style={{ fontSize: '0.85rem', color: T.light, lineHeight: 1.55, opacity: 0.92, maxWidth: 320, margin: '0 auto' }}>
                  Tu fais vivre Yoppaa. Suggère un commerce qu&rsquo;on devrait ajouter, ou signale un souci sur une fiche.
                </p>
              </div>

              <div style={{ padding: '1.25rem 1rem 1rem' }}>

                {/* Section 1 : Suggérer un commerce */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                    Suggérer un commerce
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                </div>
                <SuggestionForm clientId={clientId}/>

                {/* Section 2 : Signaler un problème */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 24 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                    Signaler un problème
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                </div>

                <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px 14px', border: `1px solid ${T.pale}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
                        <path d="M12 9v4M12 17h.01"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: T.ink, margin: '0 0 4px', letterSpacing: '-0.2px', lineHeight: 1.3 }}>
                        Tu vois un problème sur une fiche&nbsp;?
                      </p>
                      <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.5 }}>
                        Commerce fermé, horaires faux, numéro qui ne répond plus… Ouvre la fiche concernée et clique sur <strong style={{ color: T.deep, fontWeight: 700 }}>« Signaler un problème »</strong> en bas.
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setOnglet('accueil')}
                    style={{ width: '100%', padding: '10px 18px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    Voir les commerces
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PROFIL */}
          {onglet === 'profil' && (
            <div>
              <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #1e0950 100%)`, padding: '0.875rem 1rem 2.25rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 2 }}/>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 50%, ${T.main}44 0%, transparent 55%), radial-gradient(circle at 10% 90%, ${T.light}18 0%, transparent 50%)`, pointerEvents: 'none' }}/>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, position: 'relative' }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', margin: 0, opacity: 0.85 }}>{client.email ? 'Mon profil' : 'Bienvenue'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 6px 20px ${T.main}66, 0 0 0 3px rgba(255,255,255,0.15)` }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4"/>
                      <path d="M3 21Q3 16 12 16 Q21 16 21 21"/>
                    </svg>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {client.email
                      ? <EditablePrenom client={client} setClient={setClient} clientId={clientId} openSignal={editProfilSignal}/>
                      : <div>
                          <p style={{ fontWeight: 900, marginBottom: 10, fontSize: '1.2rem', letterSpacing: '-0.4px' }}>
                            <span style={{ color: '#fff' }}>Les </span>
                            <span style={{ color: T.light }}>Yoppers</span>
                            <span style={{ color: T.mid }}> 🟣</span>
                          </p>
                          <button onClick={() => router.push('/commander/auth?redirect=/commander')}
                            style={{ padding: '0.625rem 1.25rem', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 100, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                            Se connecter →
                          </button>
                        </div>
                    }
                  </div>
                </div>
              </div>

              <div style={{ padding: '0 1rem 1rem', marginTop: '-1.25rem' }}>
                {/* Bandeau profil incomplet - visible si Yopper connecte mais qu'il manque
                    nom et/ou telephone (cas typique : auth via Magic Link sans signup complet).
                    Clic = ouvre directement EditablePrenom en edit mode + scroll vers le haut. */}
                {client.email && (() => {
                  const champsManquants = []
                  if (!client.prenom || !client.prenom.trim()) champsManquants.push('prénom')
                  if (!client.nom || !client.nom.trim()) champsManquants.push('nom')
                  if (!client.telephone || !client.telephone.trim()) champsManquants.push('téléphone')
                  if (champsManquants.length === 0) return null
                  const texteManquants = champsManquants.length === 1
                    ? `ton ${champsManquants[0]}`
                    : champsManquants.length === 2
                      ? `ton ${champsManquants[0]} et ton ${champsManquants[1]}`
                      : `ton ${champsManquants[0]}, ton ${champsManquants[1]} et ton ${champsManquants[2]}`
                  return (
                    <button onClick={() => {
                      setEditProfilSignal(s => s + 1)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                        background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                        border: '1.5px solid #F59E0B', borderRadius: 14, padding: '12px 14px',
                        marginBottom: '0.875rem',
                        // Compensation du marginTop:-1.25rem du parent : sans ce push down,
                        // le label PROFIL INCOMPLET tombe dans la zone violette du hero et est masque.
                        // Seule la card 'Temps economise' garde l'effet d'overlap visuel.
                        marginTop: '1.5rem',
                        position: 'relative', zIndex: 1,
                        cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                        boxShadow: '0 2px 8px rgba(245,158,11,0.15)',
                      }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid #F59E0B' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 8v4M12 16h.01"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 10, fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0, marginBottom: 2 }}>
                          Profil incomplet
                        </p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#78350F', margin: 0, lineHeight: 1.35 }}>
                          Il manque {texteManquants} - clique pour compléter
                        </p>
                      </div>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </button>
                  )
                })()}

                {/* Card stat principale : temps economise - taille reduite pour rééquilibrer avec
                    le grid 2x2 en dessous (avant la hero etait trop dominante). Sous-titre adapte
                    selon si le Yopper a des RDVs ou seulement des commandes. */}
                {(() => {
                  const nbCmdRec = clientCommandes.filter(c => c.statut === 'recupere').length
                  const nbRdv = rdvsActifs.length
                  const sousTitre = nbRdv > 0
                    ? `${nbCmdRec + nbRdv} moment${(nbCmdRec + nbRdv) > 1 ? 's' : ''} sans friction`
                    : `${nbCmdRec} commande${nbCmdRec > 1 ? 's' : ''} sans faire la file`
                  return (
                    <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', marginBottom: '0.625rem', boxShadow: `0 4px 20px ${T.main}14`, border: `1px solid ${T.pale}` }}>
                      <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                      <div style={{ padding: '1.125rem 1rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                          <IconClock size={11} color={T.muted}/>
                          <p style={{ fontSize: '0.6rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Temps économisé</p>
                        </div>
                        <p style={{ fontSize: '2.5rem', fontWeight: 900, color: T.main, letterSpacing: '-2px', marginBottom: 2, lineHeight: 1 }}>
                          {tempsEconomise >= 60 ? `${Math.floor(tempsEconomise/60)}h${tempsEconomise%60>0?(tempsEconomise%60)+'min':''}` : `${tempsEconomise} min`}
                        </p>
                        <p style={{ fontSize: '0.78rem', color: T.muted, margin: 0 }}>
                          {sousTitre}
                        </p>
                      </div>
                    </div>
                  )
                })()}

                {/* Grid 2x2 stats : Commandes / RDV / Total depense / Commerces.
                    4 metriques egales en visuel pour equilibrer la page profil. */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.875rem' }}>
                  {[
                    {
                      label: 'Commandes', value: clientCommandes.length, color: T.main, bg: T.pale,
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></svg>,
                    },
                    {
                      label: 'RDV', value: rdvsActifs.length, color: '#10B981', bg: '#F0FDF4',
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
                    },
                    {
                      label: 'Total dépensé', value: `${totalDepense.toFixed(0)}€`, color: T.mid, bg: `${T.mid}18`,
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.mid} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9.5c-1-1-2.5-1.5-4-1.5C7 8 5 10 5 12s2 4 5 4c1.5 0 3-.5 4-1.5"/><path d="M3 10h6M3 14h6"/></svg>,
                    },
                    {
                      label: 'Commerces', value: commercesUniques, color: T.deep, bg: `${T.deep}14`,
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.deep} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9"/><path d="M3 9c0 1.5 1 3 3 3s3-1.5 3-3 1 3 3 3 3-1.5 3-3 1 3 3 3 3-1.5 3-3"/></svg>,
                    },
                  ].map((s, i) => (
                    <div key={i} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${T.pale}`, boxShadow: '0 2px 8px rgba(107,53,196,0.06)' }}>
                      <div style={{ height: 2, background: `linear-gradient(90deg, ${s.color}, ${s.color}55)` }}/>
                      <div style={{ padding: '0.75rem 0.75rem 0.875rem', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, background: s.bg, marginBottom: 5 }}>
                          {s.icon}
                        </div>
                        <p style={{ fontSize: '0.58rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3, marginTop: 0 }}>{s.label}</p>
                        <p style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, letterSpacing: '-0.8px', margin: 0, lineHeight: 1 }}>{s.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mes avis - derniers avis vérifiés laissés par le Yopper */}
                {client.email && (
                  <SectionMesAvis clientId={clientId}/>
                )}

                {/* Mes favoris - accessible si Yopper connecté.
                    Déplacé ici depuis l'ancien onglet "Favoris" du footer (remplacé par Services). */}
                {client.email && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px 12px', marginBottom: '0.875rem', border: `1px solid ${T.pale}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Mes favoris
                      </span>
                      <div style={{ flex: 1, height: 1, background: T.pale }}/>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{commercantsFavoris.length}</span>
                    </div>
                    {commercantsFavoris.length === 0 ? (
                      <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, margin: 0 }}>
                        Tape l&rsquo;étoile sur un commerce pour le retrouver ici en un clic.
                      </p>
                    ) : (
                      <div className="commerces-grid" style={{ marginTop: 4 }}>
                        {commercantsFavoris.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} statutsCommerce={statutsCommerce} dealsActifs={dealsActifs} actusActives={actusActives} bonnesAffairesActives={bonnesAffairesActives} onSelect={selectionnerCommercant} onToggleFavori={toggleFavori}/>)}
                      </div>
                    )}
                  </div>
                )}

                {/* Card "Ma commune" - accessible si Yopper connecté.
                    Clic sur "Changer" ouvre la modale ConfirmCommune en mode 'change'
                    (fermable + liste manuelle directe). */}
                {client.email && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: '0.875rem', border: `1px solid ${T.pale}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.7px', margin: 0 }}>
                        Ma commune principale
                      </p>
                      <p style={{ fontSize: 15, fontWeight: 800, color: T.ink, margin: '2px 0 0', letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {commune?.nom || 'Non définie'}
                      </p>
                    </div>
                    <button onClick={() => setShowConfirmCommune(true)}
                      style={{ padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
                      Changer
                    </button>
                  </div>
                )}

                {client.email && (
                  <button onClick={async () => {
                    await supabase.auth.signOut()
                    ;['yoppaa_email','yoppaa_nom','yoppaa_prenom','yoppaa_telephone','yoppaa_client_id','yoppaa_onglet'].forEach(k => localStorage.removeItem(k))
                    setClient({ nom:'', email:'', telephone:'', prenom:'' }); setClientId(null)
                    setFavoris([]); setCommercantsFavoris([]); setClientCommandes([])
                    setOngletState('accueil')
                  }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '0.875rem', background: 'transparent', color: '#DC2626', border: '1.5px solid #DC262633', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <path d="M16 17l5-5-5-5"/>
                      <path d="M21 12H9"/>
                    </svg>
                    Se déconnecter
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal confirmation custom : remplace window.confirm() qui est bloque/silencieux
            en PWA installee iPhone. Boutons Confirmer / Annuler. Clic backdrop = ferme. */}
        {confirmModal && (
          <div role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal(null) }}
            style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(22,6,54,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: '#fff', borderRadius: 20, maxWidth: 380, width: '100%', padding: '1.75rem 1.5rem 1.25rem', boxShadow: '0 30px 80px rgba(0,0,0,0.45)', animation: 'modal-in 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}>
              <h2 style={{ fontWeight: 900, fontSize: '1.2rem', color: T.ink, marginBottom: 8, letterSpacing: '-0.3px', textAlign: 'center' }}>
                {confirmModal.title}
              </h2>
              {confirmModal.message && (
                <p style={{ fontSize: '0.9rem', color: T.muted, lineHeight: 1.5, textAlign: 'center', marginBottom: 20 }}>
                  {confirmModal.message}
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={async () => {
                    const cb = confirmModal.onConfirm
                    setConfirmModal(null)
                    if (cb) await cb()
                  }}
                  style={{ width: '100%', padding: '0.9rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '0.95rem', background: confirmModal.danger ? 'linear-gradient(135deg, #DC2626, #B91C1C)' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: confirmModal.danger ? '0 6px 22px rgba(220,38,38,0.5)' : `0 6px 22px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }}>
                  {confirmModal.confirmLabel || 'Confirmer'}
                </button>
                <button
                  onClick={() => setConfirmModal(null)}
                  style={{ width: '100%', padding: '0.75rem', background: 'transparent', color: T.deep, border: `1.5px solid ${T.pale}`, borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif' }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast global : feedback ephemere 3.5s (favori, info), flotte au-dessus de la nav */}
        {toast && (
          <div role="status" aria-live="polite"
            style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)', zIndex: 1200, background: toast.type === 'success' ? `linear-gradient(135deg, ${T.deep}, ${T.bgPanel})` : T.bgPanel, color: '#fff', padding: '11px 16px', borderRadius: 100, fontSize: '0.82rem', fontWeight: 700, boxShadow: '0 8px 28px rgba(26,8,64,0.35), 0 0 0 1.5px rgba(255,255,255,0.08) inset', maxWidth: '92vw', display: 'inline-flex', alignItems: 'center', gap: 10, animation: 'toast-in 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}>
            {toast.type === 'success' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#10B981', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              </span>
            )}
            <span style={{ lineHeight: 1.3 }}>{toast.msg}</span>
          </div>
        )}

        {/* ── NAV BAR ── */}
        <nav className="navbar hero-fullwidth">
        <div className="navbar-tabs">
          {[
            { key: 'accueil',   label: 'Accueil',   badge: 0 },
            // Onglet "Officiel" (services publics) : neutralisé V1 via PLAN_PUBLIC_ENABLED.
            // Réactivation phase 2 sans toucher au code (juste flipper l'env var).
            ...(PLAN_PUBLIC_ENABLED ? [{ key: 'services',  label: 'Officiel',  badge: alerteUrgenteActive ? 1 : 0 }] : []),
            // Onglet 'commandes' : pas de label (label vide) + icône plus grande pour compenser,
            // 2 pastilles distinctes (violette = commandes en cours, verte = RDVs a venir).
            { key: 'commandes', label: '', badgeCmd: commandesASwiper.length + commandesEnLivraison.length + commandesEnCours.length, badgeRdv: rdvsAVenir.length, badge: badgeCommandes },
            { key: 'tribu',     label: 'Tribu',     badge: 0 },
            { key: 'profil',    label: 'Profil',    badge: 0 },
          ].map(item => {
            const actif = onglet === item.key
            const op = actif ? 1 : 0.5
            const stroke = '#ffffff'
            return (
              <button key={item.key} onClick={() => setOnglet(item.key)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0.625rem 0 0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', position: 'relative' }}>

                {item.key === 'accueil' && (
                  /* Signature Yoppaa : 3 points tricolores horizontaux (wordmark). */
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                    <circle cx="5"  cy="12" r="2.8" fill="#ffffff" opacity={actif ? 0.55 : 0.3}/>
                    <circle cx="12" cy="12" r="3.2" fill={T.light}  opacity={actif ? 1 : 0.5}/>
                    <circle cx="19" cy="12" r="2.8" fill={T.mid}    opacity={actif ? 1 : 0.55}/>
                  </svg>
                )}
                {item.key === 'commandes' && (
                  /* Icone v4 : agrandie 36px + decalee vers le bas (marginTop 6) pour
                     laisser de la place aux pastilles qui descendent aussi (top 6).
                     Sans ce decalage, pastilles + icone faisaient effet 'oreilles de Mickey'. */
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision" style={{ marginTop: 6 }}>
                    {/* Cadre calendrier */}
                    <rect x="3" y="5" width="18" height="16" rx="2.5" stroke={stroke} strokeWidth="2" strokeLinejoin="round" opacity={op}/>
                    {/* Barre header */}
                    <path d="M3,9.5 L21,9.5" stroke={stroke} strokeWidth="2" opacity={op}/>
                    {/* Anneaux du haut */}
                    <path d="M8,3 L8,7 M16,3 L16,7" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                    {/* 3 traits 'items de la liste' a l'interieur */}
                    <path d="M7,13   L17,13"   stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity={op * 0.85}/>
                    <path d="M7,16   L15,16"   stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity={op * 0.85}/>
                    <path d="M7,19   L13,19"   stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity={op * 0.85}/>
                  </svg>
                )}
                {item.key === 'services' && (
                  /* Bâtiment officiel : mairie/administration. Badge rouge si alerte urgente. */
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                    <path d="M3,11 L12,4 L21,11" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                    <path d="M5,11 L5,20 L19,20 L19,11" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                    <path d="M8,20 L8,13 M12,20 L12,13 M16,20 L16,13" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                    <path d="M3,20 L21,20" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                    {item.badge > 0 && (
                      <>
                        <circle cx="19" cy="5" r="5.5" fill="#DC2626" stroke="white" strokeWidth="1.8"/>
                        <text x="19" y="8.8" textAnchor="middle" fontSize="8" fontWeight="900" fill="white" fontFamily="DM Sans,sans-serif">!</text>
                      </>
                    )}
                  </svg>
                )}
                {item.key === 'tribu' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                    <circle cx="5" cy="8" r="2.5" stroke={stroke} strokeWidth="2" opacity={op * 0.75}/>
                    <path d="M1.5,17.5 Q1.5,14 5,14 Q8.5,14 8.5,17.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op * 0.75}/>
                    <circle cx="19" cy="8" r="2.5" stroke={stroke} strokeWidth="2" opacity={op * 0.75}/>
                    <path d="M15.5,17.5 Q15.5,14 19,14 Q22.5,14 22.5,17.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op * 0.75}/>
                    <circle cx="12" cy="6" r="3.5" stroke={stroke} strokeWidth="2" opacity={op}/>
                    <path d="M5.5,20 Q5.5,15 12,15 Q18.5,15 18.5,20" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                  </svg>
                )}
                {item.key === 'profil' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                    <circle cx="12" cy="8" r="4.5" stroke={stroke} strokeWidth="2" opacity={op}/>
                    <path d="M3,21 Q3,16 12,16 Q21,16 21,21" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                  </svg>
                )}

                {/* Onglet 'commandes' : 2 pastilles distinctes.
                    Violette en haut GAUCHE = commandes (pretes a retirer + en cours).
                    Verte    en haut DROITE = RDVs a venir.
                    Ordre coherent avec le toggle interne (Commandes a gauche / RDVs a droite).
                    Si une seule est >0, l'autre n'est pas rendue (pas de "0"). */}
                {item.key === 'commandes' && item.badgeCmd > 0 && (
                  <span style={{ position: 'absolute', top: 6, right: 'calc(50% + 10px)', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 100, background: T.main, color: '#fff', fontSize: '0.7rem', fontWeight: 900, fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', boxShadow: `0 2px 8px ${T.main}99, 0 0 0 1.5px ${T.main}44`, lineHeight: 1, letterSpacing: '-0.2px' }}>
                    {item.badgeCmd > 9 ? '9+' : item.badgeCmd}
                  </span>
                )}
                {item.key === 'commandes' && item.badgeRdv > 0 && (
                  <span style={{ position: 'absolute', top: 6, left: 'calc(50% + 10px)', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 100, background: '#10B981', color: '#fff', fontSize: '0.7rem', fontWeight: 900, fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(16,185,129,0.55), 0 0 0 1.5px rgba(16,185,129,0.27)', lineHeight: 1, letterSpacing: '-0.2px' }}>
                    {item.badgeRdv > 9 ? '9+' : item.badgeRdv}
                  </span>
                )}

                {item.label && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: actif ? '#fff' : '#6B7280', letterSpacing: '0.2px', fontFamily: '"DM Sans", sans-serif' }}>
                    {item.label}
                  </span>
                )}
                {actif && <div style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', width: 22, height: 3, borderRadius: 3, background: T.light, boxShadow: `0 0 6px ${T.light}66` }}/>}
              </button>
            )
          })}
        </div>
        </nav>
      </div>
    </>
  )
}