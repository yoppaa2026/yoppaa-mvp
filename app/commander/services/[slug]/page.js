'use client'
// ════════════════════════════════════════════════════════════════════
// FICHE SERVICE PUBLIC — Plan PUBLIC (commune, CPAS, police, urgences…)
//
// Lecture seule côté client. Pas de menu, pas de panier, pas de
// réservation. Vise à donner les infos de contact + actus officielles.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ModalSignalement from '../../ModalSignalement'
import ModalSignalerProbleme from './ModalSignalerProbleme'
import PillStatutOuverture, { getDayBrussels, getCreneauxJour } from '@/app/components/PillStatutOuverture'

// Design system canonique
const T = {
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',
  pale:     '#EDE0FF',
  bgPage:   '#F5F3FA',
  hairline: '#F0EBF8',
  muted:    '#6B7280',
}

// SVG par type de service (cohérent avec IconService de /commander/page.js)
function IconService({ type, size = 32, color = '#2D0F6B' }) {
  const c = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { flexShrink: 0 } }
  switch (type) {
    case 'commune':         return <svg {...c}><path d="M3 11 12 4 21 11"/><path d="M5 11v9h14v-9"/><path d="M8 20v-7M12 20v-7M16 20v-7M3 20h18"/></svg>
    case 'cpas':            return <svg {...c}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
    case 'police':          return <svg {...c}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
    case 'pompiers':        return <svg {...c}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
    case 'ecole':           return <svg {...c}><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1 3 2.5 6 2.5s6-1.5 6-2.5v-5"/></svg>
    case 'urgence':         return <svg {...c}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
    case 'medecin_garde':   return <svg {...c}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg>
    case 'pharmacie_garde': return <svg {...c}><path d="M10.5 4.5 4.5 10.5a3.5 3.5 0 0 0 5 5L15.5 9.5a3.5 3.5 0 1 0-5-5Z"/><path d="m8 8 7 7"/></svg>
    default:                return <svg {...c}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M12 21v-3"/></svg>
  }
}
const SERVICE_TYPE_LABEL = {
  commune: 'Administration communale', cpas: 'CPAS', police: 'Police',
  pompiers: 'Pompiers', ecole: 'École', urgence: 'Urgence',
  medecin_garde: 'Médecin de garde', pharmacie_garde: 'Pharmacie de garde',
  autre: 'Service public',
}
const JOURS_LABEL = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
  jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}

// ─── Icons SVG ──────────────────────────────────────────────────────
function IconPhone({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.2 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.11 6.11l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  )
}
function IconMail({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <path d="M22 6l-10 7L2 6"/>
    </svg>
  )
}
function IconMap({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function IconGlobe({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  )
}
function IconBack({ size = 14, color = T.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  )
}
function IconClock({ size = 14, color = T.deep }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  )
}

// ─── Picker "Ton agent de quartier" ─────────────────────────────────
// Pour les fiches type=police qui stockent leurs inspecteurs dans
// service.donnees_riches.agents_quartier : on liste les villages couverts
// (uniques, triés FR) dans un select natif, puis on highlight l'agent
// dont les villages contiennent celui sélectionné par le yopper.
function AgentQuartierPicker({ agents }) {
  const [village, setVillage] = useState('')

  // Tous les villages uniques (à plat), triés en français
  const tousVillages = [...new Set(agents.flatMap(a => a.villages || []))]
    .sort((a, b) => a.localeCompare(b, 'fr'))

  const matchedAgent = village ? agents.find(a => (a.villages || []).includes(village)) : null

  // T.deep / T.main / T.pale viennent de la portée parent (constantes en haut du fichier)
  // Pas de titre interne : la description sert d'intro (la section "## Ton agent de quartier"
  // dans le markdown du service introduit déjà le picker).
  return (
    <div style={{ padding: '8px 18px 8px', boxSizing: 'border-box', maxWidth: '100%' }}>
      {/* Picker village */}
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6, letterSpacing: '0.3px' }}>
        Sélectionne ton village
      </label>
      <select value={village} onChange={e => setVillage(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '12px 40px 12px 14px', fontSize: 14, fontWeight: 600, border: `1.5px solid ${T.pale}`, borderRadius: 12, background: '#fff', color: T.ink, fontFamily: 'inherit', cursor: 'pointer', WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B35C4' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center', marginBottom: 14 }}>
        <option value="">— Choisir mon village —</option>
        {tousVillages.map(v => <option key={v} value={v}>{v}</option>)}
      </select>

      {/* Liste des agents avec highlight du match */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '100%' }}>
        {agents.map(agent => {
          const isMatch  = matchedAgent && agent.nom === matchedAgent.nom
          const isDimmed = village && !isMatch
          const bgTag    = isMatch ? 'rgba(255,255,255,0.22)' : T.pale
          const fgTag    = isMatch ? '#fff' : T.deep
          return (
            <div key={agent.nom}
              style={{
                background: isMatch ? `linear-gradient(135deg, ${T.ink}, ${T.main})` : '#fff',
                color:      isMatch ? '#fff' : T.ink,
                border:     isMatch ? 'none' : `1px solid ${T.pale}`,
                borderLeft: isMatch ? `4px solid ${T.main}` : `4px solid ${T.deep}`,
                borderRadius: 12, padding: '12px 14px',
                opacity:    isDimmed ? 0.5 : 1,
                transition: 'opacity 0.2s, box-shadow 0.2s',
                boxShadow:  isMatch ? `0 8px 22px ${T.main}55` : 'none',
                boxSizing: 'border-box', maxWidth: '100%', overflow: 'hidden',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: isMatch ? '#fff' : T.ink, letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {agent.nom}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 600, margin: '2px 0 0', color: isMatch ? 'rgba(255,255,255,0.85)' : T.muted, letterSpacing: '0.2px' }}>
                    {agent.fonction}
                  </p>
                </div>
                {isMatch && (
                  <span style={{ fontSize: 9, fontWeight: 800, color: T.ink, background: '#fff', padding: '4px 9px', borderRadius: 100, letterSpacing: '0.7px', textTransform: 'uppercase', flexShrink: 0 }}>
                    Pour toi
                  </span>
                )}
              </div>

              {agent.villages && agent.villages.length > 0 && (
                <p style={{ fontSize: 11, color: isMatch ? 'rgba(255,255,255,0.92)' : T.deep, margin: '6px 0 0', lineHeight: 1.4, fontWeight: 600, overflowWrap: 'anywhere' }}>
                  📍 {agent.villages.join(' · ')}
                </p>
              )}

              {(agent.telephone || agent.mobile || agent.email) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {agent.telephone && (
                    <a href={`tel:${agent.telephone.replace(/\s/g, '')}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 100, background: bgTag, color: fgTag, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                      📞 {agent.telephone}
                    </a>
                  )}
                  {agent.mobile && (
                    <a href={`tel:${agent.mobile.replace(/\s/g, '')}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 100, background: bgTag, color: fgTag, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                      📱 {agent.mobile}
                    </a>
                  )}
                  {agent.email && (
                    <a href={`mailto:${agent.email}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 100, background: bgTag, color: fgTag, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                      📧 Email
                    </a>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Rendu structuré d'une description ──────────────────────────────
// Mini-parser Markdown léger pour aérer les contenus des fiches services.
// Conventions reconnues dans le texte :
//   ## Titre              → titre de section (h3 violet uppercase)
//   > Texte               → callout neutre violet pâle
//   ⚠ Texte               → callout warning ambre
//   🚨 Texte              → callout danger rouge
//   • Item   (ou - Item)  → puce de liste
//   (ligne vide)          → séparateur entre blocs
//   sinon                 → paragraphe normal
function parseDescriptionBlocks(text) {
  const lines = text.split('\n')
  const blocks = []
  let currentList = null
  const flushList = () => { if (currentList) { blocks.push(currentList); currentList = null } }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushList(); continue }
    if (line.startsWith('## ')) {
      flushList()
      blocks.push({ type: 'title', content: line.slice(3).trim() })
    } else if (line.startsWith('> ')) {
      flushList()
      blocks.push({ type: 'callout-info', content: line.slice(2).trim() })
    } else if (line.startsWith('⚠')) {
      flushList()
      blocks.push({ type: 'callout-warning', content: line.replace(/^⚠\s*/, '').trim() })
    } else if (line.startsWith('🚨')) {
      flushList()
      blocks.push({ type: 'callout-danger', content: line.replace(/^🚨\s*/, '').trim() })
    } else if (line.startsWith('• ') || line.startsWith('- ')) {
      if (!currentList) currentList = { type: 'list', items: [] }
      currentList.items.push(line.slice(2).trim())
    } else {
      flushList()
      blocks.push({ type: 'paragraph', content: line })
    }
  }
  flushList()
  return blocks
}

// Détecte les numéros de téléphone belges (fixe, mobile, courts 1XXX, +32) dans
// un texte et les rend cliquables. Soulignage discret violet, ouverture du
// composeur natif au tap.
const PHONE_REGEX_BE = /(\+32\s?\d{1,3}(?:[\s./]?\d{2,3}){2,4}|0\d{1,3}(?:[\s./]?\d{2,3}){2,4}|\b1\d{2,3}\b)/g

function linkifyTel(text) {
  if (typeof text !== 'string') return text
  const parts = []
  let lastIdx = 0
  let m
  PHONE_REGEX_BE.lastIndex = 0
  while ((m = PHONE_REGEX_BE.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index))
    const phone = m[0]
    const clean = phone.replace(/[\s./]/g, '')
    parts.push(
      <a key={`tel-${m.index}`} href={`tel:${clean}`}
        onClick={e => e.stopPropagation()}
        style={{ color: T.main, fontWeight: 700, textDecoration: 'underline', textDecorationColor: T.light, textDecorationThickness: '1px', textUnderlineOffset: '2px' }}>
        {phone}
      </a>
    )
    lastIdx = m.index + phone.length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts.length > 0 ? parts : text
}

function ServiceDescription({ text }) {
  if (!text) return null
  const blocks = parseDescriptionBlocks(text)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {blocks.map((b, i) => {
        if (b.type === 'title') {
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: i === 0 ? 0 : 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>
                {b.content}
              </span>
              <div style={{ flex: 1, height: 1, background: T.hairline }}/>
            </div>
          )
        }
        if (b.type === 'callout-warning') {
          return (
            <div key={i} style={{ background: '#FEF3C7', borderLeft: '3px solid #D97706', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#78350F', lineHeight: 1.5 }}>
              ⚠ {b.content}
            </div>
          )
        }
        if (b.type === 'callout-danger') {
          return (
            <div key={i} style={{ background: '#FEE2E2', borderLeft: '3px solid #DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#7F1D1D', lineHeight: 1.5 }}>
              🚨 {b.content}
            </div>
          )
        }
        if (b.type === 'callout-info') {
          return (
            <div key={i} style={{ background: T.pale, borderLeft: `3px solid ${T.main}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600, color: T.deep, lineHeight: 1.5 }}>
              {b.content}
            </div>
          )
        }
        if (b.type === 'list') {
          return (
            <ul key={i} style={{ margin: '2px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {b.items.map((item, j) => (
                <li key={j} style={{ display: 'flex', gap: 8, fontSize: 14, color: T.ink, lineHeight: 1.5, fontWeight: 500 }}>
                  <span style={{ color: T.main, fontWeight: 900, flexShrink: 0 }}>•</span>
                  <span>{linkifyTel(item)}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} style={{ fontSize: 14, color: T.ink, lineHeight: 1.55, margin: 0, fontWeight: 500 }}>
            {linkifyTel(b.content)}
          </p>
        )
      })}
    </div>
  )
}

export default function FicheServicePublic({ params }) {
  const router = useRouter()
  const [service, setService] = useState(null)
  const [actus, setActus] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // Next.js 15+ : params est un Promise — on l'attend
  const [slug, setSlug] = useState(null)
  const [showSignalement, setShowSignalement] = useState(false)
  const [signalementSent, setSignalementSent] = useState(false)
  const [showSurtaxe, setShowSurtaxe] = useState(false)
  // État pour ModalSignalerProbleme : null = fermée, sinon le type ('nid_poule', 'depot_sauvage', 'egout', 'autre')
  const [signalerType, setSignalerType] = useState(null)
  const [signalerSent, setSignalerSent] = useState(false)

  useEffect(() => {
    Promise.resolve(params).then(p => setSlug(p?.slug))
  }, [params])

  useEffect(() => {
    if (!slug) return
    let annule = false
    async function load() {
      const { data: s } = await supabase
        .from('services_publics')
        .select('*')
        .eq('slug', slug)
        .eq('statut', 'valide')
        .maybeSingle()
      if (annule) return
      if (!s) { setNotFound(true); setLoading(false); return }
      setService(s)

      const today = new Date().toISOString().slice(0, 10)
      const { data: a } = await supabase
        .from('actualites')
        .select('id, titre, contenu, type, date_debut, date_fin, urgence')
        .eq('service_id', s.id)
        .eq('actif', true)
        .lte('date_debut', today)
        .gte('date_fin', today)
        .order('urgence', { ascending: false })
        .order('date_debut', { ascending: false })
      if (!annule) setActus(a || [])
      setLoading(false)
    }
    load()
    return () => { annule = true }
  }, [slug])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', color: T.muted }}>
        Chargement…
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: '"DM Sans", sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: '32px 28px', maxWidth: 400, textAlign: 'center', border: `1px solid ${T.pale}` }}>
          <p style={{ fontSize: '2.5rem', marginBottom: 12 }}>🏛️</p>
          <h2 style={{ fontWeight: 900, fontSize: '1.2rem', color: T.ink, margin: '0 0 8px', letterSpacing: '-0.3px' }}>
            Service introuvable
          </h2>
          <p style={{ fontSize: 13, color: T.muted, margin: '0 0 18px', lineHeight: 1.5 }}>
            Ce service public n&rsquo;existe pas ou n&rsquo;est pas encore activé.
          </p>
          <button onClick={() => { if (window.history.length > 1) router.back(); else router.push('/commander') }}
            style={{ padding: '10px 22px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Retour
          </button>
        </div>
      </div>
    )
  }

  const isUrgence = service.national || service.type === 'urgence'
  const typeLabel = SERVICE_TYPE_LABEL[service.type] || 'Service'
  const couleurAccent = isUrgence ? '#DC2626' : T.deep

  const mapsUrl = service.latitude && service.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${service.latitude},${service.longitude}`
    : service.adresse ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(service.adresse)}` : null

  return (
    <div style={{ minHeight: '100vh', background: T.bgPage, fontFamily: '"DM Sans", sans-serif', maxWidth: 760, margin: '0 auto', overflowX: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* Topbar : retour */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `1px solid ${T.hairline}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => { if (window.history.length > 1) router.back(); else router.push('/commander') }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: T.bgPage, border: 'none', borderRadius: 100, color: T.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          <IconBack/> Retour
        </button>
      </div>

      {/* Photo de couverture pleine largeur si présente */}
      {service.photo_couverture_url && (
        <div style={{ width: '100%', height: 200, position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${T.hairline}` }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: isUrgence ? `linear-gradient(90deg, #DC2626, #B91C1C, #7F1D1D)` : `linear-gradient(90deg, ${T.ink}, ${T.main}, ${T.light})`, zIndex: 2 }}/>
          <img src={service.photo_couverture_url} alt={service.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        </div>
      )}

      {/* Hero header */}
      <div style={{ background: '#fff', padding: '20px 18px 18px', borderBottom: `1px solid ${T.hairline}`, position: 'relative' }}>
        {!service.photo_couverture_url && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: isUrgence ? `linear-gradient(90deg, #DC2626, #B91C1C, #7F1D1D)` : `linear-gradient(90deg, ${T.ink}, ${T.main}, ${T.light})` }}/>
        )}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: service.logo_url ? '#fff' : (isUrgence ? '#FEE2E2' : T.pale), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', border: service.logo_url ? `1px solid ${T.pale}` : 'none', marginTop: service.photo_couverture_url ? -48 : 0, boxShadow: service.photo_couverture_url ? '0 4px 16px rgba(26,8,64,0.18)' : 'none' }}>
            {service.logo_url ? (
              <img src={service.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            ) : (
              <IconService type={service.type} size={30} color={isUrgence ? '#DC2626' : T.deep}/>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: couleurAccent, padding: '3px 8px', borderRadius: 100, letterSpacing: '0.7px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {isUrgence && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
                    <path d="M12 9v4M12 17h.01"/>
                  </svg>
                )}
                {isUrgence ? 'Urgence' : 'Officiel'}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: '0.3px' }}>
                {typeLabel}
              </span>
            </div>
            <h1 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.ink, letterSpacing: '-0.5px', margin: 0, lineHeight: 1.15, overflowWrap: 'break-word', wordBreak: 'normal', hyphens: 'auto' }}>
              {service.nom}
            </h1>
            {/* Pill statut d'ouverture (temps réel Bruxelles) — visible si horaires_detail défini */}
            {service.horaires_detail && Object.keys(service.horaires_detail).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <PillStatutOuverture horaires={service.horaires_detail}/>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actus en cours du service (alertes urgentes en tête) */}
      {actus.length > 0 && (
        <div style={{ padding: '12px 14px 0' }}>
          {actus.map(a => {
            const isAlerte = a.urgence || a.type === 'alerte'
            return (
              <div key={a.id} style={{ background: isAlerte ? 'linear-gradient(135deg, #7F1D1D, #B91C1C)' : `linear-gradient(135deg, ${T.ink}, ${T.deep})`, borderRadius: 14, padding: '12px 14px', color: '#fff', marginBottom: 10, boxShadow: isAlerte ? '0 4px 16px rgba(220,38,38,0.25)' : '0 4px 16px rgba(26,8,64,0.15)' }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: isAlerte ? '#FCA5A5' : T.light, textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 4px' }}>
                  {isAlerte ? '⚠ Alerte' : 'Actualité'}
                </p>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: '0 0 4px', lineHeight: 1.25 }}>
                  {a.titre}
                </p>
                {a.contenu && (
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.45 }}>
                    {a.contenu}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Description structurée : parse les conventions ##/⚠/🚨/>/• */}
      {service.description && (
        <div style={{ padding: '16px 18px 8px' }}>
          <ServiceDescription text={service.description}/>
        </div>
      )}

      {/* Section "Ton agent de quartier" — affichée si donnees_riches.agents_quartier non vide */}
      {Array.isArray(service.donnees_riches?.agents_quartier) && service.donnees_riches.agents_quartier.length > 0 && (
        <AgentQuartierPicker agents={service.donnees_riches.agents_quartier}/>
      )}

      {/* Section "Signaler un problème" — uniquement pour les fiches type=commune */}
      {service.type === 'commune' && (
        <div style={{ padding: '14px 18px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>
              Signaler un problème
            </span>
            <div style={{ flex: 1, height: 1, background: T.hairline }}/>
          </div>
          <p style={{ fontSize: 12, color: T.muted, margin: '0 0 12px', lineHeight: 1.5 }}>
            Vu un nid de poule, un dépôt sauvage&nbsp;? Préviens la commune en 3 clics avec photo géolocalisée.
          </p>

          {signalerSent ? (
            <div style={{ background: '#D1FAE5', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#065F46', fontWeight: 800 }}>
                ✓ Merci, signalement envoyé à la commune 🟣
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {[
                { type: 'nid_poule',     emoji: '🕳️',  label: 'Nid de poule' },
                { type: 'depot_sauvage', emoji: '🗑️', label: 'Dépôt sauvage' },
                { type: 'egout',         emoji: '🚰', label: 'Égout bouché' },
              ].map(item => (
                <button key={item.type} onClick={() => setSignalerType(item.type)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '16px 10px', background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', transition: 'all 0.15s' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = T.main; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 16px ${T.main}25` }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = T.pale; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{item.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: T.ink, letterSpacing: '-0.1px' }}>{item.label}</span>
                </button>
              ))}
              {/* Éclairage public = lien externe ORES (pas de signalement Yoppaa) */}
              <a href="https://www.ores.be/panne-eclairage" target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '16px 10px', background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 14, textDecoration: 'none', textAlign: 'center', transition: 'all 0.15s' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = T.main; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 16px ${T.main}25` }}
                onMouseOut={e => { e.currentTarget.style.borderColor = T.pale; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>💡</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: T.ink, letterSpacing: '-0.1px' }}>
                  Éclairage public <span style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>(ORES →)</span>
                </span>
              </a>
            </div>
          )}
        </div>
      )}

      {/* Actions principales — Appeler / Email / Itinéraire / Site
          minmax(0, 1fr) au lieu de 1fr : empêche les colonnes de déborder du
          parent quand le contenu interne (ex : email zp.sambreetmeuse@police.belgium.eu)
          n'a pas d'opportunité de wrap. Sans ça, le grid 'explose' = grid blowout. */}
      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {service.telephone && (() => {
          // Si telephone_notice est défini : on intercepte avec une modal (ex : numéro surtaxé).
          // Sinon : appel direct via lien tel:
          const sharedStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 10px', borderRadius: 14, background: `linear-gradient(135deg, ${couleurAccent}, ${isUrgence ? '#991B1B' : T.main})`, color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 13, gap: 6, boxShadow: `0 6px 18px ${isUrgence ? '#DC262633' : T.main + '33'}`, fontFamily: 'inherit', border: 'none', cursor: 'pointer' }
          const inner = (
            <>
              <IconPhone size={20} color="#fff"/>
              <span>Appeler</span>
              <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}>{service.telephone}</span>
            </>
          )
          return service.telephone_notice
            ? <button onClick={() => setShowSurtaxe(true)} style={sharedStyle}>{inner}</button>
            : <a href={`tel:${service.telephone}`} style={sharedStyle}>{inner}</a>
        })()}
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 10px', borderRadius: 14, background: '#fff', color: T.ink, textDecoration: 'none', fontWeight: 800, fontSize: 13, gap: 6, border: `1.5px solid ${T.pale}` }}>
            <IconMap size={20} color={T.main}/>
            <span>Itinéraire</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {service.adresse || 'Voir sur la carte'}
            </span>
          </a>
        )}
        {service.email_public && (
          <a href={`mailto:${service.email_public}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 10px', borderRadius: 14, background: '#fff', color: T.ink, textDecoration: 'none', fontWeight: 800, fontSize: 13, gap: 6, border: `1.5px solid ${T.pale}` }}>
            <IconMail size={20} color={T.main}/>
            <span>Email</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {service.email_public}
            </span>
          </a>
        )}
        {service.site_web && (
          <a href={service.site_web.startsWith('http') ? service.site_web : `https://${service.site_web}`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 10px', borderRadius: 14, background: '#fff', color: T.ink, textDecoration: 'none', fontWeight: 800, fontSize: 13, gap: 6, border: `1.5px solid ${T.pale}` }}>
            <IconGlobe size={20} color={T.main}/>
            <span>Site web</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {service.site_web.replace(/^https?:\/\//, '')}
            </span>
          </a>
        )}
      </div>

      {/* Horaires : multi-créneaux + ligne "Aujourd'hui" mise en valeur + notes spéciales */}
      {service.horaires_detail && Object.keys(service.horaires_detail).length > 0 && (() => {
        const jourBruxelles = getDayBrussels(new Date())
        const entries = Object.entries(JOURS_LABEL)
        return (
          <div style={{ padding: '14px 18px 6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <IconClock size={16} color={T.deep}/>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                Horaires
              </span>
            </div>
            <div style={{ background: '#fff', borderRadius: 14, padding: '4px 0', border: `1px solid ${T.hairline}`, overflow: 'hidden' }}>
              {entries.map(([key, label], i) => {
                const h = service.horaires_detail?.[key]
                const creneaux = getCreneauxJour(h)
                const isToday = key === jourBruxelles
                const ferme = creneaux.length === 0
                return (
                  <div key={key} style={{ padding: '10px 14px', borderBottom: i < entries.length - 1 ? `1px solid ${T.hairline}` : 'none', background: isToday ? T.pale + '60' : 'transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 700, color: T.ink, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {label}
                        {isToday && (
                          <span style={{ fontSize: 9, color: '#fff', background: T.main, fontWeight: 800, padding: '2px 7px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                            Aujourd&rsquo;hui
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: ferme ? T.muted : T.main, textAlign: 'right' }}>
                        {ferme
                          ? 'Fermé'
                          : creneaux.map(([d, f], j) => (
                              <span key={j}>
                                {j > 0 && <span style={{ margin: '0 6px', color: T.light }}>·</span>}
                                {d} – {f}
                              </span>
                            ))}
                      </span>
                    </div>
                    {h?.note && (
                      <p style={{ margin: '6px 0 0', fontSize: 10.5, color: T.deep, fontStyle: 'italic', lineHeight: 1.4 }}>
                        💡 {h.note}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Périmètre couvert */}
      {service.codes_postaux && service.codes_postaux.length > 0 && !service.national && (
        <div style={{ padding: '12px 18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 6px' }}>
            Périmètre couvert
          </p>
          <p style={{ fontSize: 12, color: T.deep, margin: 0, lineHeight: 1.5 }}>
            Codes postaux : {service.codes_postaux.join(' · ')}
          </p>
        </div>
      )}

      {service.national && (
        <div style={{ padding: '12px 18px 8px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 100, background: '#FEE2E2', color: '#991B1B', fontWeight: 700, fontSize: 11, letterSpacing: '0.3px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#991B1B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            Service national — disponible dans toute la Belgique
          </div>
        </div>
      )}

      {/* Bouton signalement discret en bas */}
      <div style={{ padding: '14px 18px 28px', textAlign: 'center' }}>
        {signalementSent ? (
          <p style={{ fontSize: 12, color: '#10B981', fontWeight: 700, margin: 0 }}>
            ✓ Merci, signalement enregistré
          </p>
        ) : (
          <button onClick={() => setShowSignalement(true)}
            style={{ background: 'none', border: 'none', color: T.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textDecorationColor: T.hairline, textUnderlineOffset: 3 }}>
            Signaler un problème sur cette fiche
          </button>
        )}
      </div>

      {showSignalement && (
        <ModalSignalement
          target={{ kind: 'service', id: service.id, nom: service.nom }}
          yopperId={typeof window !== 'undefined' ? localStorage.getItem('yoppaa_client_id') : null}
          onClose={() => setShowSignalement(false)}
          onSent={() => setSignalementSent(true)}
        />
      )}

      {/* Modal signalement citoyen (nid de poule, dépôt sauvage, égout) */}
      {signalerType && (
        <ModalSignalerProbleme
          service={{ id: service.id, nom: service.nom, slug: service.slug }}
          type={signalerType}
          yopperId={typeof window !== 'undefined' ? localStorage.getItem('yoppaa_client_id') : null}
          onClose={() => setSignalerType(null)}
          onSent={() => { setSignalerType(null); setSignalerSent(true) }}
        />
      )}

      {/* Modal de confirmation avant appel d'un numéro avec notice (ex : surtaxé) */}
      {showSurtaxe && (
        <div onClick={() => setShowSurtaxe(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 18, maxWidth: 380, width: '100%', padding: '24px 22px', boxShadow: '0 12px 40px rgba(26,8,64,0.35)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
                  <path d="M12 9v4M12 17h.01"/>
                </svg>
              </div>
              <p style={{ fontSize: 16, fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.3px' }}>
                Avant d&rsquo;appeler
              </p>
            </div>
            <p style={{ fontSize: 13.5, color: T.ink, margin: '0 0 18px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {service.telephone_notice}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setShowSurtaxe(false)}
                style={{ padding: '12px 16px', borderRadius: 100, background: '#fff', color: T.ink, border: `1.5px solid ${T.pale}`, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Annuler
              </button>
              <a href={`tel:${service.telephone}`} onClick={() => setShowSurtaxe(false)}
                style={{ padding: '12px 16px', borderRadius: 100, background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', border: 'none', textDecoration: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Appeler quand même
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
