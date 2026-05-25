'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canDo } from '@/lib/plans'
import PillsStatut from './PillsStatut'

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
function heureEnMinutes(heure) {
  const [h, m] = heure.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function maintenant() {
  const d = new Date(); return d.getHours() * 60 + d.getMinutes()
}

// ─── Splash Screen ────────────────────────────────────────────────────────────
// ─── FIX SWIPE : SwipeRetrait — YOP → SWIPE, instructions claires ────────────
function SwipeRetrait({ onConfirm, clientPrenom }) {
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | swiping | success | done
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

  const p = swipeX / (getMaxX() || 1)
  const TRACK_H = THUMB + 16

  // ─── Phase succès — animation 3 points + wordmark ─────────────────────────
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
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16, height: 32, alignItems: 'flex-end' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', boxShadow: `0 0 16px ${C.main}88`, animation: 'yopDot1 1.2s ease-in-out infinite' }}/>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: C.light, boxShadow: `0 0 20px ${C.light}88`, animation: 'yopDot2 1.2s ease-in-out infinite' }}/>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.mid, boxShadow: `0 0 16px ${C.mid}88`, animation: 'yopDot3 1.2s ease-in-out infinite' }}/>
        </div>
        <p style={{ fontWeight: 900, fontSize: '2.2rem', color: C.ink, letterSpacing: '-2px', lineHeight: 1, marginBottom: 8, animation: 'yopWordmark 0.6s cubic-bezier(0.25,0.46,0.45,0.94) forwards' }}>
          yoppaa
        </p>
        <p style={{ fontWeight: 700, fontSize: '0.9rem', color: C.deep, animation: 'yopSub 0.5s ease 0.3s both', letterSpacing: '-0.2px' }}>
          Récupéré ! <span style={{ fontWeight: 900, color: C.main }}>🎉</span> {clientPrenom || 'Yopper'}
        </p>
        <p style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 6, animation: 'yopSub 0.5s ease 0.5s both' }}>
          Skip the wait — bien joué !
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

      {/* FIX : label "Glisse pour récupérer" — sans "YOP!" */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {[0,1,2].map(i => (
            <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="none"
              style={{ animation: `swipeArrowPulse 1s ease-in-out ${i*0.2}s infinite` }}>
              <path d="M9 18l6-6-6-6" stroke={C.mid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ))}
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#9CA3AF', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Glisse pour récupérer</span>
      </div>

      {/* Track */}
      <div ref={containerRef}
        style={{ width: '100%', height: TRACK_H, borderRadius: 100, background: `linear-gradient(to right, ${C.pale} ${p*100}%, #F1F0F9 ${p*100}%)`, position: 'relative', border: `2px solid ${p > 0.5 ? C.main : C.light}`, userSelect: 'none', cursor: 'grab', touchAction: 'none', transition: 'border-color 0.2s', boxShadow: p > 0.3 ? `0 4px 20px ${C.main}22` : 'none' }}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>

        {/* Texte central — apparaît après 70% */}
        {p > 0.7 && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: THUMB + 12, right: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: C.main, letterSpacing: '1px', textTransform: 'uppercase' }}>Lâche !</span>
          </div>
        )}

        {/* FIX : thumb — "YOP" → "SWIPE" */}
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
    const t1 = setTimeout(() => setPhase(1), 900)
    const t2 = setTimeout(() => setPhase(2), 1500)
    const t3 = setTimeout(() => setPhase(3), 2100)
    const t4 = setTimeout(() => onDone(), 2700)
    return () => [t1,t2,t3,t4].forEach(clearTimeout)
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: `linear-gradient(160deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: phase === 3 ? 'splash-out 0.6s ease-in forwards' : 'none' }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {[{c:'#FFFFFF',d:'0s',o:0.45},{c:'#C4A0F4',d:'0.25s',o:1},{c:'#9660E0',d:'0.5s',o:1}].map((d, i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: d.c, opacity: d.o, boxShadow: `0 0 16px ${d.c}88`, animation: `dot-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) ${d.d} both` }}/>
        ))}
      </div>
      <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 900, fontSize: '3.5rem', color: '#fff', letterSpacing: '-2px', lineHeight: 1, marginBottom: 10, animation: phase >= 1 ? 'wordmark-in 0.6s cubic-bezier(0.25,0.46,0.45,0.94) forwards' : 'none', opacity: phase >= 1 ? 1 : 0 }}>yoppaa</p>
      <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.8rem', color: '#C4A0F4', letterSpacing: '1.5px', textTransform: 'uppercase', animation: phase >= 2 ? 'tagline-in 0.5s ease forwards' : 'none', opacity: phase >= 2 ? 1 : 0 }}>Ton quartier, dans ta poche</p>
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
    <div style={{ background: '#F0FDF4', borderRadius: 16, padding: '1.5rem', textAlign: 'center', border: '1.5px solid #16A34A33' }}>
      <p style={{ fontSize: '2rem', marginBottom: 10 }}>🎉</p>
      <p style={{ fontWeight: 800, color: '#16A34A', marginBottom: 6 }}>Merci pour ta suggestion !</p>
      <p style={{ fontSize: '0.875rem', color: T.muted }}>On va contacter ce commerçant. Tu contribues à faire grandir la Tribu Yoppaa 🫂</p>
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
        style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '1rem', background: form.nom.trim() ? T.main : '#E5E7EB', color: '#fff', cursor: form.nom.trim() ? 'pointer' : 'default', fontFamily: '"DM Sans", sans-serif' }}>
        {sending ? 'Envoi...' : '🫂 Suggérer ce commerçant'}
      </button>
    </div>
  )
}

// ─── Édition prénom inline ────────────────────────────────────────────────────
function EditablePrenom({ client, setClient, clientId }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(client.prenom || '')
  const [saving, setSaving] = useState(false)

  async function sauvegarder() {
    if (!val.trim()) return
    setSaving(true)
    const prenom = val.trim()
    localStorage.setItem('yoppaa_prenom', prenom)
    setClient(p => ({ ...p, prenom }))
    if (clientId) {
      await supabase.from('clients').update({ nom: prenom }).eq('id', clientId)
    }
    setSaving(false)
    setEditing(false)
  }

  if (editing) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && sauvegarder()}
        autoFocus
        placeholder="Ton prénom"
        style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '0.5rem 0.875rem', color: '#fff', fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={sauvegarder} disabled={!val.trim() || saving}
          style={{ flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', color: '#6B35C4', fontFamily: '"DM Sans", sans-serif' }}>
          {saving ? '...' : '✓ Sauvegarder'}
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
        <p style={{ fontWeight: 900, fontSize: '1.15rem', color: '#fff', letterSpacing: '-0.3px' }}>
          {client.prenom || 'Yopper 🟣'}
        </p>
        <button onClick={() => { setVal(client.prenom || ''); setEditing(true) }}
          style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 100, padding: '2px 10px', color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          ✏️ Modifier
        </button>
      </div>
      <p style={{ fontSize: '0.78rem', color: '#C4A0F4', opacity: 0.8 }}>{client.email}</p>
    </div>
  )
}

// ─── Écran pick-up hype ───────────────────────────────────────────────────────
// FIX NUMÉRO : numero_commande de la DB en priorité ; si manquant (anciennes
// commandes), on calcule la position du jour côté commerçant — même logique que
// le dashboard (getNumeroJour) pour que client et commerçant voient le même #.
function PickupScreen({ commande, clientPrenom, onConfirm }) {
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
  const creneau = commande.creneau
    ? `${commande.creneau.heure_debut.slice(0,5)} – ${commande.creneau.heure_fin.slice(0,5)}`
    : null
  return (
    // FIX FOOTER : position: fixed + zIndex: 9999 — rendu HORS de page-wrap (voir return principal)
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'linear-gradient(160deg, #1A0840 0%, #2D0F6B 40%, #6B35C4 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '3rem 2rem calc(2.5rem + env(safe-area-inset-bottom, 0px))', overflow: 'hidden' }}>
      <style>{`
        @keyframes pu-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.7} }
        @keyframes pu-fadein { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pu-glow { 0%,100%{text-shadow:0 0 40px #9660E088} 50%{text-shadow:0 0 80px #C4A0F4cc} }
      `}</style>
      {/* Déco fond */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 80% 20%, #9660E033 0%, transparent 50%), radial-gradient(circle at 20% 80%, #6B35C422 0%, transparent 50%)', pointerEvents: 'none' }}/>
      {/* Logo */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', animation: 'pu-fadein 0.5s ease' }}>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 10 }}>
          {[{c:'rgba(255,255,255,0.35)',s:10},{c:'#C4A0F4',s:14},{c:'#9660E0',s:10}].map((d,i) => (
            <div key={i} style={{ width: d.s, height: d.s, borderRadius: '50%', background: d.c, animation: `pu-pulse 2s ease-in-out ${i*0.3}s infinite` }}/>
          ))}
        </div>
        <p style={{ fontWeight: 900, fontSize: '2.2rem', color: '#fff', letterSpacing: '-2px', lineHeight: 1, animation: 'pu-glow 2s ease-in-out infinite' }}>yoppaa</p>
      </div>
      {/* Numéro + infos */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', animation: 'pu-fadein 0.6s ease 0.1s both' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 800, color: '#C4A0F4', textTransform: 'uppercase', letterSpacing: 3, marginBottom: 12, opacity: 0.8 }}>Ta commande est prête</p>
        <p style={{ fontSize: '7rem', fontWeight: 900, color: '#fff', letterSpacing: '-4px', lineHeight: 1, textShadow: '0 0 60px #9660E088', marginBottom: 8 }}>#{numero}</p>
        <p style={{ fontSize: '1.6rem', fontWeight: 900, color: '#C4A0F4', letterSpacing: '-0.5px', marginBottom: 8 }}>{clientPrenom || 'Yopper'} 🟣</p>
        {creneau && <p style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>🕐 {creneau}</p>}
        <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: '12px 24px', display: 'inline-block' }}>
          <p style={{ fontWeight: 900, fontSize: '1rem', color: '#fff', letterSpacing: '-0.3px' }}>Skip the wait — PRIORITÉ YOPPERS 🟣</p>
        </div>
      </div>
      {/* FIX : SwipeRetrait en bas — pas de conflit avec la navbar (rendu hors page-wrap) */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', animation: 'pu-fadein 0.6s ease 0.3s both' }}>
        <SwipeRetrait clientPrenom={clientPrenom} onConfirm={onConfirm}/>
      </div>
    </div>
  )
}

// ─── Carte commerce — redesignée ──────────────────────────────────────────────
function CarteCommerce({ c, favoris, notesParCommerce, statutsCommerce, dealsActifs, actusActives, onSelect, onToggleFavori }) {
  const estFavori = favoris.includes(c.id)
  const noteInfo = notesParCommerce[c.id]
  const statut = statutsCommerce[c.id]

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
      return { dot: '#16A34A', label: `Ouvert · ${horaire}`, color: '#16A34A', bg: '#F0FDF4', pulse: true }
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
    if (statut === 'ouvert')  return { dot: '#16A34A', label: 'Créneaux disponibles', color: '#16A34A', bg: '#F0FDF4' }
    if (statut === 'urgent')  return { dot: '#EA580C', label: 'Réserve vite !', color: '#EA580C', bg: '#FFF7ED' }
    if (statut === 'complet' || statut === 'ferme') {
      if (resaDemainOuverte) return { dot: T.main, label: 'Réserver pour demain', color: T.main, bg: T.pale }
      return { dot: '#9CA3AF', label: `Résa dès ${heureOuv}`, color: '#6B7280', bg: '#F9FAFB' }
    }
    return null
  }

  const physique = getStatutPhysique()
  // Pas de reservation si le plan ne permet pas la commande (ON, LIVE)
  const peutCommander = canDo(c.plan, 'commande')
  const isPlanOn = c.plan === 'on'
  const resa = peutCommander ? getStatutResa() : null

  return (
    <div onClick={() => onSelect(c)}
      style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: '0.875rem', cursor: 'pointer', boxShadow: '0 2px 12px rgba(107,53,196,0.07)', border: `1px solid ${T.pale}`, transition: 'all 0.2s' }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(107,53,196,0.14)' }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(107,53,196,0.07)' }}>

      {/* Bande haute : violet vif si Click & Collect actif, gris-violet doux sinon */}
      <div style={{ height: 5, background: peutCommander ? `linear-gradient(90deg, ${T.main}, ${T.mid})` : `linear-gradient(90deg, ${T.light}, ${T.pale})` }}/>

      <div style={{ padding: '0.875rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 900, color: T.ink, margin: '0 0 6px', fontSize: '1rem', letterSpacing: '-0.3px' }}>{c.nom}</p>
            <Badges type={c.type}/>
            {/* Pills statut : 5 pills toujours visibles, dot LIVE orange si actif */}
            <div style={{ marginTop: 8 }}>
              <PillsStatut commercant={c} dealActif={dealsActifs?.has(c.id) || false} actuActive={actusActives?.has(c.id) || false} size="sm"/>
            </div>
            {c.description && <p style={{ fontSize: '0.78rem', color: T.muted, margin: '6px 0 0', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.description}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
              <Etoiles note={noteInfo?.moyenne || 0}/>
              <span style={{ fontSize: '0.7rem', color: noteInfo?.count > 0 ? T.muted : '#D1D5DB' }}>
                {noteInfo?.count > 0 ? `${noteInfo.count} avis` : 'Pas encore d\'avis'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: physique.bg, borderRadius: 100, padding: '4px 10px', border: `1px solid ${physique.dot}22` }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: physique.dot, flexShrink: 0, animation: physique.pulse ? 'dot-pulse 2s ease-in-out infinite' : 'none', boxShadow: physique.pulse ? `0 0 6px ${physique.dot}88` : 'none' }}/>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: physique.color }}>{physique.label}</span>
              </span>
              {resa && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: resa.bg, borderRadius: 100, padding: '4px 10px', border: `1px solid ${resa.dot}22` }}>
                  <span style={{ fontSize: '0.62rem' }}>🟣</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: resa.color }}>{resa.label}</span>
                </span>
              )}
              {c.distance != null && (
                <span style={{ fontSize: '0.7rem', color: T.muted, fontWeight: 500 }}>📍 {formatDistance(c.distance)}</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: T.pale, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(107,53,196,0.12)' }}>
              {c.logo_url ? <img src={c.logo_url} alt={c.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <span style={{ fontSize: '1.5rem' }}>🏪</span>}
            </div>
            <button onClick={e => onToggleFavori(c.id, e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, transition: 'transform 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseOver={e => e.currentTarget.style.transform = 'scale(1.2)'}
              onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill={estFavori ? '#C4A0F4' : 'none'} xmlns="http://www.w3.org/2000/svg">
                <path d="M12,3 L14.5,9 L21.5,9.5 L16.5,14 L18.2,21 L12,17.5 L5.8,21 L7.5,14 L2.5,9.5 L9.5,9 Z"
                  stroke={estFavori ? '#9660E0' : '#D1D5DB'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Commander() {
  const router = useRouter()

  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === 'undefined') return false
    return !sessionStorage.getItem('yoppaa_splash_seen')
  })
  function onSplashDone() { sessionStorage.setItem('yoppaa_splash_seen', '1'); setShowSplash(false) }

  const [onglet, setOngletState] = useState('accueil')
  function setOnglet(val) { setOngletState(val); localStorage.setItem('yoppaa_onglet', val) }

  const [commercants, setCommercants] = useState([])
  const [notesParCommerce, setNotesParCommerce] = useState({})
  const [statutsCommerce, setStatutsCommerce] = useState({})
  // Set des commerçants qui ont un deal/actu actif aujourd'hui (pour dot LIVE sur pills)
  const [dealsActifs, setDealsActifs] = useState(new Set())
  const [actusActives, setActusActives] = useState(new Set())
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
  const [pickupCommande, setPickupCommande] = useState(null)
  // Tick minute pour rafraichir le compteur "Plus que X min avant ton créneau"
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const savedOnglet = localStorage.getItem('yoppaa_onglet')
    if (savedOnglet) setOngletState(savedOnglet)
    chargerCommercants()
    demanderGeolocalisation()
    const email = localStorage.getItem('yoppaa_email')
    const nom = localStorage.getItem('yoppaa_nom')
    const prenom = localStorage.getItem('yoppaa_prenom')
    const id = localStorage.getItem('yoppaa_client_id')
    if (email && id) {
      setClient(p => ({ ...p, email, nom: nom || '', prenom: prenom || '' }))
      setClientId(id)
      chargerFavoris(id)
      chargerCommandesClient(email)
    }
  }, [])

  // ─── Polling client 5s ─────────────────────────────────────────────────────
  useEffect(() => {
    const email = localStorage.getItem('yoppaa_email')
    if (!email) return
    const iv = setInterval(() => {
      chargerCommandesClient(email)
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  function demanderGeolocalisation() {
    if (!navigator.geolocation) return
    setGeoLoading(true); setRue(null)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        setPosition({ lat, lng })
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`, { headers: { 'Accept': 'application/json' } })
          if (res.ok) {
            const data = await res.json()
            const addr = data.address || {}
            const r = addr.road || addr.pedestrian || addr.footway || addr.street
            const n = addr.house_number
            setRue(r ? (n ? `${r} ${n}` : r) : (addr.quarter || addr.suburb || addr.town || addr.city || 'Position active'))
          }
        } catch { setRue('Position active') }
        setGeoLoading(false)
      },
      () => setGeoLoading(false),
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  async function chargerCommercants() {
    const { data } = await supabase.from('commercants').select('*').order('nom')
    setCommercants(data || [])
    if (data?.length > 0) {
      chargerNotes(data.map(c => c.id), data)
      chargerActiviteAujourdhui(data.map(c => c.id))
    }
  }

  // Charge les deals et actus actifs aujourd'hui pour piloter le dot LIVE des pills
  async function chargerActiviteAujourdhui(ids) {
    if (!ids?.length) return
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const [{ data: deals }, { data: actus }] = await Promise.all([
      // Deals actifs : date_deal = aujourd'hui, OU intervalle date_debut/date_fin qui englobe
      supabase.from('yoppaa_deals')
        .select('commercant_id, date_deal, date_debut, date_fin, actif')
        .in('commercant_id', ids)
        .eq('actif', true),
      supabase.from('actualites')
        .select('commercant_id, date_debut, date_fin, actif')
        .in('commercant_id', ids)
        .eq('actif', true),
    ])
    const dealSet = new Set()
    ;(deals || []).forEach(d => {
      const dateDeal = d.date_deal || null
      const dStart = d.date_debut ? d.date_debut.slice(0,10) : null
      const dEnd   = d.date_fin   ? d.date_fin.slice(0,10)   : null
      const dans = dateDeal === aujourdhui
        || (dStart && dEnd && dStart <= aujourdhui && aujourdhui <= dEnd)
      if (dans) dealSet.add(d.commercant_id)
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
      const { data: comms } = await supabase.from('commercants').select('*').in('id', ids)
      setCommercantsFavoris(comms||[])
    }
  }

  async function chargerCommandesClient(email) {
    const { data } = await supabase.from('commandes').select('*, commercant:commercants(nom, type), creneau:creneaux(heure_debut, heure_fin)').eq('client_email', email).order('created_at', { ascending: false })
    if (!data || data.length === 0) { setClientCommandes([]); return }

    // FIX NUMÉRO : enrichir chaque commande avec son numéro affiché
    // (numero_commande DB en priorité, sinon position du jour — même logique
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

  async function calculerDistances(liste, pos) {
    const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY
    const avecCoords = liste.filter(c => c.latitude && c.longitude)
    if (!avecCoords.length) return
    try {
      const res = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', { method: 'POST', headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ locations: [[pos.lng, pos.lat], ...avecCoords.map(c => [parseFloat(c.longitude), parseFloat(c.latitude)])], metrics: ['distance'], units: 'm' }) })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const distances = data.distances[0].slice(1)
      const avecDistance = liste.map(c => { const idx = avecCoords.findIndex(x => x.id===c.id); return { ...c, distance: idx===-1 ? null : distances[idx] } })
      avecDistance.sort((a,b) => (a.distance??Infinity)-(b.distance??Infinity))
      setCommercants(avecDistance)
    } catch {
      const avecDistance = liste.map(c => ({ ...c, distance: c.latitude && c.longitude ? distanceVolOiseau(pos.lat, pos.lng, parseFloat(c.latitude), parseFloat(c.longitude)) : null }))
      avecDistance.sort((a,b) => (a.distance??Infinity)-(b.distance??Infinity))
      setCommercants(avecDistance)
    }
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
    const { data: ex } = await supabase.from('clients').select('id').eq('email', email).single()
    const id = ex ? ex.id : (await supabase.from('clients').insert({ email, nom }).select('id').single()).data?.id
    if (!id) return null
    setClientId(id); localStorage.setItem('yoppaa_client_id', id); localStorage.setItem('yoppaa_email', email); localStorage.setItem('yoppaa_nom', nom)
    if (ex) { chargerFavoris(id); chargerCommandesClient(email) }
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
    } else {
      await supabase.from('favoris').insert({ client_id: cid, commercant_id: commercantId })
      setFavoris(prev => [...prev, commercantId])
      const c = commercants.find(x => x.id===commercantId)
      if (c) setCommercantsFavoris(prev => [...prev, c])
    }
  }

  function selectionnerCommercant(c) {
    if (!c.slug) return
    localStorage.setItem('yoppaa_onglet', 'accueil')
    router.push(`/commander/${c.slug}`)
  }

  const tempsEconomise = clientCommandes.filter(c => c.statut==='recupere').reduce((acc,c) => acc+getTemps(c.commercant?.type), 0)

  const commercantsFiltres = commercants
    .filter(c => categorieActive === 'Tous' || parseTypes(c.type).some(t => t===categorieActive || t.includes(categorieActive)))
    .filter(c => !searchQuery.trim() || c.nom.toLowerCase().includes(searchQuery.toLowerCase()) || (c.type||'').toLowerCase().includes(searchQuery.toLowerCase()) || (c.adresse||'').toLowerCase().includes(searchQuery.toLowerCase()))

  const commandesASwiper = clientCommandes.filter(c => c.statut === 'pret')
  const commandesEnCours = clientCommandes.filter(c => ['en_attente','en_preparation'].includes(c.statut))
  const commandesTerminees = clientCommandes.filter(c => c.statut === 'recupere')
  const badgeCommandes = commandesASwiper.length + commandesEnCours.length

  const card = { background: '#fff', borderRadius: 14, padding: '1rem', marginBottom: '0.75rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 1px 6px rgba(107,53,196,0.05)' }
  const btnPrimary = { width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }
  const statutStyle = {
    recupere:       { bg: '#F0FDF4', color: '#16A34A', label: 'Récupérée' },
    pret:           { bg: '#F0FDF4', color: '#16A34A', label: 'Prête à retirer' },
    en_preparation: { bg: '#EFF6FF', color: '#2563EB', label: 'En préparation' },
    en_attente:     { bg: '#F0FDF4', color: '#16A34A', label: 'Validée' },
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
      {showSplash && <SplashScreen onDone={onSplashDone}/>}

      {/* FIX FOOTER : PickupScreen rendu HORS de .page-wrap pour éviter le stacking context
          (overflow-x: hidden sur .page-wrap bloque position:fixed des enfants) */}
      {pickupCommande && (
        <PickupScreen
          commande={pickupCommande}
          clientPrenom={client.prenom || client.nom?.split(' ')[0] || 'Yopper'}
          onConfirm={async () => {
            await supabase.from('commandes').update({ statut: 'recupere' }).eq('id', pickupCommande.id)
            setPickupCommande(null)
            chargerCommandesClient(client.email)
          }}
        />
      )}

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; width: 100%; overflow-x: hidden; }
        body { background: ${T.bg}; font-family: "DM Sans", sans-serif; font-size: 16px; -webkit-text-size-adjust: 100%; }
        .page-wrap { display: flex; flex-direction: column; min-height: 100dvh; max-width: 760px; margin: 0 auto; background: ${T.bg}; width: 100%; }
        /* Header HYPE : background pleine largeur du viewport sur PC/tablette */
        .hero-fullwidth { margin-left: calc(-50vw + 50%); margin-right: calc(-50vw + 50%); padding-left: calc(50vw - 50%); padding-right: calc(50vw - 50%); }
        @media (max-width: 760px) {
          .hero-fullwidth { margin-left: 0; margin-right: 0; padding-left: 0; padding-right: 0; }
        }
        /* Grille 2 cols pour les commerces sur PC/tablette large */
        @media (min-width: 800px) {
          .commerces-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; align-items: start; }
          .commerces-grid > * { margin-bottom: 0 !important; }
        }
        .scroll-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .navbar { flex-shrink: 0; background: ${T.bgPanel}; border-top: 1px solid ${T.main}33; display: flex; padding-bottom: env(safe-area-inset-bottom, 0px); }
        .cats { display: flex; gap: 6px; overflow-x: auto; padding: 0 1rem 0.875rem; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .cats::-webkit-scrollbar { display: none; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        input, textarea, button, select { font-family: "DM Sans", sans-serif; }
        @keyframes tribu-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.15); } }
        @keyframes tribu-pulse2 { 0%,100% { opacity:0.85; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.1); } }
        @keyframes tribu-pulse3 { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:0.3; transform:scale(1.05); } }
        @keyframes dot-pulse { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.4); opacity:0.7; } }
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
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 10%, ${T.mid}33 0%, transparent 50%), radial-gradient(circle at 10% 90%, ${T.light}18 0%, transparent 50%), radial-gradient(circle at 50% 50%, ${T.main}22 0%, transparent 70%)`, pointerEvents: 'none' }}/>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {[
                  { c: '#fff',  o: 0.35, delay: '0s',    size: 6 },
                  { c: T.light, o: 1,    delay: '0.3s',  size: 8 },
                  { c: T.mid,   o: 1,    delay: '0.6s',  size: 6 },
                ].map((d, i) => (
                  <div key={i} style={{ width: d.size, height: d.size, borderRadius: '50%', background: d.c, opacity: d.o, boxShadow: `0 0 8px ${d.c}88`, animation: `dot-pulse 2s ease-in-out ${d.delay} infinite` }}/>
                ))}
              </div>
              <p style={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-1.5px', color: '#fff', lineHeight: 1, textShadow: `0 0 30px ${T.mid}55` }}>yoppaa</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
              <button onClick={() => { if (!showLocManuelle) demanderGeolocalisation(); setShowLocManuelle(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '0.5rem 0.875rem', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', transition: 'all 0.2s', letterSpacing: '-0.2px' }}>
                {geoLoading
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2.5" strokeDasharray="30 10" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="4" fill="white"/>
                      <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2"/>
                      <line x1="12" y1="2" x2="12" y2="4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="12" y1="20" x2="12" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="2" y1="12" x2="4" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="20" y1="12" x2="22" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                }
                <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {geoLoading ? 'Localisation...' : rue || locManuelle || (position ? 'Position active' : 'Activer GPS')}
                </span>
              </button>
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
            <div style={{ padding: '1rem 1rem 0.625rem' }}>
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
            <div className="cats">
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setCategorieActive(cat)}
                  style={{ flexShrink: 0, padding: '0.4rem 0.875rem', borderRadius: 100, border: categorieActive===cat ? 'none' : '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', background: categorieActive===cat ? '#fff' : 'rgba(255,255,255,0.08)', color: categorieActive===cat ? T.main : '#fff', backdropFilter: 'blur(4px)', transition: 'all 0.15s' }}>
                  {cat}
                </button>
              ))}
            </div>
          )}

          {onglet !== 'accueil' && <div style={{ height: 10 }}/>}
        </div>

        {/* ── CONTENU ── */}
        <div className="scroll-body">

          {/* ACCUEIL */}
          {onglet === 'accueil' && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              {position && commercantsFiltres.length > 0 && (
                <p style={{ fontSize: '0.72rem', color: T.muted, fontWeight: 600, marginBottom: 10 }}>
                  {commercantsFiltres.length} commerce{commercantsFiltres.length > 1 ? 's' : ''} près de toi
                </p>
              )}
              {commercantsFiltres.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <p style={{ fontSize: '2.5rem', marginBottom: 10 }}>🔍</p>
                  <p style={{ fontWeight: 700, color: T.muted, marginBottom: 4 }}>Aucun résultat</p>
                  <p style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>Essaie une autre catégorie ou recherche.</p>
                </div>
              ) : (
                <div className="commerces-grid">
                  {commercantsFiltres.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} statutsCommerce={statutsCommerce} dealsActifs={dealsActifs} actusActives={actusActives} onSelect={selectionnerCommercant} onToggleFavori={toggleFavori}/>)}
                </div>
              )}
            </div>
          )}

          {/* COMMANDES */}
          {onglet === 'commandes' && (
            <div>
              {/* Hero header commandes */}
              <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #1e0950 100%)`, padding: '1.25rem 1rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 80% 30%, ${T.main}44 0%, transparent 60%)`, pointerEvents: 'none' }}/>
                <p style={{ fontSize: '0.62rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, opacity: 0.7 }}>Yoppers</p>
                <h2 style={{ fontWeight: 900, fontSize: '1.4rem', color: '#fff', letterSpacing: '-0.5px' }}>Mes commandes</h2>
                {badgeCommandes > 0 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 100, padding: '4px 12px', marginTop: 8, border: '1px solid rgba(255,255,255,0.15)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A', boxShadow: '0 0 6px #16A34A88', animation: 'dot-pulse 2s ease-in-out infinite' }}/>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>{badgeCommandes} commande{badgeCommandes > 1 ? 's' : ''} en cours</span>
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem 1rem 1rem' }}>
              {commandesASwiper.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink }}>Prêtes à retirer</span>
                    <span style={{ background: '#16A34A', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>{commandesASwiper.length}</span>
                  </div>
                  {commandesASwiper.map(c => {
                    const ok = peutRetirer(c)
                    const min = ok ? 0 : minutesAvantCreneau(c)
                    const heureCreneau = c.creneau?.heure_debut?.slice(0,5)
                    const prenom = client.prenom || client.nom?.split(' ')[0] || 'Yopper'
                    return (
                    <div key={c.id} style={{ background: 'linear-gradient(135deg, #F0FDF4, #fff)', borderRadius: 16, padding: '1rem 1.125rem', marginBottom: '0.75rem', border: '2px solid #16A34A33', boxShadow: '0 4px 16px rgba(22,163,74,0.1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
                        <div>
                          <p style={{ fontWeight: 800, color: T.ink, marginBottom: 3, fontSize: '0.95rem' }}>
                            {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: T.main, fontWeight: 700 }}> — commande #{c.numeroAffiche}</span>}
                          </p>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#F0FDF4', borderRadius: 100, padding: '3px 10px', border: '1px solid #16A34A22' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', animation: 'dot-pulse 2s ease-in-out infinite' }}/>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#16A34A' }}>Prête à retirer{c.creneau ? ` · ${c.creneau.heure_debut.slice(0,5)}–${c.creneau.heure_fin.slice(0,5)}` : ''}</span>
                          </span>
                        </div>
                        <p style={{ fontWeight: 900, color: T.main, fontSize: '1rem', letterSpacing: '-0.3px' }}>{Number(c.total).toFixed(2)}€</p>
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
                  )})}
                </>
              )}
              {commandesEnCours.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: commandesASwiper.length > 0 ? '1rem' : 0 }}>
                    <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink }}>En cours</span>
                  </div>
                  {commandesEnCours.map(c => {
                    const sc = statutStyle[c.statut]
                    const sousTexte = statutSousTexte[c.statut]
                    return (
                      <div key={c.id} style={{ background: '#fff', borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.625rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 2px 8px rgba(107,53,196,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 800, color: T.ink, marginBottom: 3, fontSize: '0.95rem' }}>
                              {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: T.main, fontWeight: 700 }}> — commande #{c.numeroAffiche}</span>}
                            </p>
                            <p style={{ fontSize: '0.72rem', color: T.muted }}>{new Date((c.date_commande || c.created_at) + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}{c.creneau ? ` · ${c.creneau.heure_debut.slice(0,5)}–${c.creneau.heure_fin.slice(0,5)}` : ''}</p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ fontWeight: 900, color: T.main, marginBottom: 4, fontSize: '0.95rem', letterSpacing: '-0.3px' }}>{Number(c.total).toFixed(2)}€</p>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: 100, background: sc.bg, color: sc.color }}>{sc.label}</span>
                          </div>
                        </div>
                        {sousTexte && (
                          <p style={{ fontSize: '0.72rem', color: T.deep, marginTop: 8, fontWeight: 600, lineHeight: 1.4 }}>
                            {sousTexte}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
              {commandesASwiper.length === 0 && commandesEnCours.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛍️</div>
                  <p style={{ fontWeight: 800, color: T.ink, marginBottom: 6, fontSize: '1rem' }}>Aucune commande en cours</p>
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
                  {commandesTerminees.slice(0, 5).map(c => (
                    <div key={c.id} style={{ background: '#fff', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.5rem', border: `1px solid ${T.pale}`, opacity: 0.75, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 700, color: T.ink, marginBottom: 2, fontSize: '0.875rem' }}>
                          {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: T.muted, fontWeight: 600 }}> — commande #{c.numeroAffiche}</span>}
                        </p>
                        <p style={{ fontSize: '0.7rem', color: T.muted }}>{new Date((c.date_commande || c.created_at) + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 700, color: T.main, marginBottom: 3, fontSize: '0.875rem' }}>{Number(c.total).toFixed(2)}€</p>
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: '#F0FDF4', color: '#16A34A' }}>✓ Récupérée</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          )}

          {/* FAVORIS */}
          {onglet === 'favoris' && (
            <div>
              <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #3d1070 100%)`, padding: '1.25rem 1rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 20% 50%, #DC2626 0%, transparent 40%)`, opacity: 0.15, pointerEvents: 'none' }}/>
                <p style={{ fontSize: '0.62rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, opacity: 0.7 }}>Yoppers</p>
                <h2 style={{ fontWeight: 900, fontSize: '1.4rem', color: '#fff', letterSpacing: '-0.5px' }}>Mes favoris</h2>
                {favoris.length > 0 && (
                  <p style={{ fontSize: '0.78rem', color: T.light, marginTop: 6, fontWeight: 600, opacity: 0.8 }}>❤️ {favoris.length} commerce{favoris.length > 1 ? 's' : ''} sauvegardé{favoris.length > 1 ? 's' : ''}</p>
                )}
              </div>
              <div style={{ padding: '1rem' }}>
                {commercantsFavoris.length === 0
                  ? <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                      <div style={{ fontSize: '3rem', marginBottom: 12 }}>🤍</div>
                      <p style={{ fontWeight: 800, color: T.ink, marginBottom: 6 }}>Aucun favori</p>
                      <p style={{ fontSize: '0.875rem', color: T.muted }}>Tape ❤️ sur un commerce pour le retrouver ici.</p>
                    </div>
                  : <div className="commerces-grid">{commercantsFavoris.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} statutsCommerce={statutsCommerce} dealsActifs={dealsActifs} actusActives={actusActives} onSelect={selectionnerCommercant} onToggleFavori={toggleFavori}/>)}</div>
                }
              </div>
            </div>
          )}

          {/* TRIBU */}
          {onglet === 'tribu' && (
            <div>
              <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.main} 100%)`, padding: '2rem 1rem 3rem', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 50% 100%, ${T.light}33 0%, transparent 60%)`, pointerEvents: 'none' }}/>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
                  {[
                    { c: '#fff', delay: '0s', size: 44, opacity: 0.9, anim: 'tribu-pulse' },
                    { c: T.light, delay: '0.3s', size: 52, opacity: 1, anim: 'tribu-pulse2' },
                    { c: T.mid, delay: '0.6s', size: 44, opacity: 0.8, anim: 'tribu-pulse3' },
                  ].map((d, i) => (
                    <div key={i} style={{ width: d.size, height: d.size, borderRadius: '50%', background: d.c, opacity: d.opacity, boxShadow: `0 4px 20px ${d.c}66`, animation: `${d.anim} 2s ease-in-out ${d.delay} infinite` }}/>
                  ))}
                </div>
                <p style={{ fontWeight: 900, fontSize: '1.6rem', color: '#fff', letterSpacing: '-1px', marginBottom: 8 }}>La Tribu Yoppaa</p>
                <p style={{ fontSize: '0.875rem', color: T.light, lineHeight: 1.6, opacity: 0.9 }}>
                  Tu as fait la file chez un commerçant et tu penses<br/>qu'il mériterait Yoppaa ? Dis-le nous !
                </p>
              </div>
              <div style={{ padding: '1rem', marginTop: '-1.5rem' }}>
                <SuggestionForm clientId={clientId}/>
              </div>
            </div>
          )}

          {/* PROFIL */}
          {onglet === 'profil' && (
            <div>
              <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #1e0950 100%)`, padding: '1.5rem 1rem 2.5rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 50%, ${T.main}44 0%, transparent 50%)`, pointerEvents: 'none' }}/>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', flexShrink: 0, boxShadow: `0 6px 20px ${T.main}66, 0 0 0 3px rgba(255,255,255,0.15)` }}>👤</div>
                  <div>
                    {client.email
                      ? <EditablePrenom client={client} setClient={setClient} clientId={clientId}/>
                      : <div>
                          <p style={{ fontWeight: 900, color: '#fff', marginBottom: 10, fontSize: '1.1rem' }}>Les Yoppers 🟣</p>
                          <button onClick={() => router.push('/commander/auth?redirect=/commander')}
                            style={{ padding: '0.625rem 1.25rem', background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 100, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                            Se connecter →
                          </button>
                        </div>
                    }
                  </div>
                </div>
              </div>

              <div style={{ padding: '0 1rem 1rem', marginTop: '-1.25rem' }}>
                <div style={{ background: '#fff', borderRadius: 20, padding: '1.5rem', marginBottom: '0.875rem', textAlign: 'center', boxShadow: `0 4px 20px ${T.main}14`, border: `1px solid ${T.pale}` }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>⏱ Temps économisé en file</p>
                  <p style={{ fontSize: '3.5rem', fontWeight: 900, color: T.main, letterSpacing: '-3px', marginBottom: 4, lineHeight: 1 }}>
                    {tempsEconomise >= 60 ? `${Math.floor(tempsEconomise/60)}h${tempsEconomise%60>0?tempsEconomise%60+'min':''}` : `${tempsEconomise} min`}
                  </p>
                  <p style={{ fontSize: '0.82rem', color: T.muted }}>
                    {clientCommandes.filter(c=>c.statut==='recupere').length} commande{clientCommandes.filter(c=>c.statut==='recupere').length>1?'s':''} sans faire la file 🎉
                  </p>
                </div>

                <div className="grid2" style={{ marginBottom: '0.875rem' }}>
                  {[
                    { label: 'Commandes', value: clientCommandes.length, color: T.main, bg: T.pale, icon: '📦' },
                    { label: 'Total dépensé', value: `${clientCommandes.reduce((acc,c)=>acc+Number(c.total),0).toFixed(0)}€`, color: T.mid, bg: `${T.mid}18`, icon: '💰' },
                  ].map((s,i) => (
                    <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '1rem', textAlign: 'center', border: `1.5px solid ${T.pale}`, boxShadow: '0 2px 8px rgba(107,53,196,0.06)' }}>
                      <p style={{ fontSize: '1.2rem', marginBottom: 4 }}>{s.icon}</p>
                      <p style={{ fontSize: '0.62rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>{s.label}</p>
                      <p style={{ fontSize: '1.75rem', fontWeight: 900, color: s.color, letterSpacing: '-1px' }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {client.email && (
                  <button onClick={async () => {
                    await supabase.auth.signOut()
                    localStorage.removeItem('yoppaa_email'); localStorage.removeItem('yoppaa_nom'); localStorage.removeItem('yoppaa_prenom'); localStorage.removeItem('yoppaa_client_id'); localStorage.removeItem('yoppaa_onglet')
                    setClient({ nom:'', email:'', telephone:'', prenom:'' }); setClientId(null)
                    setFavoris([]); setCommercantsFavoris([]); setClientCommandes([])
                    setOngletState('accueil')
                  }} style={{ width: '100%', padding: '0.875rem', background: 'transparent', color: '#DC2626', border: '1.5px solid #DC262633', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>
                    Se déconnecter
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── NAV BAR ── */}
        <nav className="navbar hero-fullwidth">
          {[
            { key: 'accueil',   label: 'Accueil',   badge: 0 },
            { key: 'commandes', label: 'Commandes', badge: badgeCommandes },
            { key: 'favoris',   label: 'Favoris',   badge: 0 },
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
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3,10 L12,3 L21,10" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                    <path d="M5,10 L5,20 Q5,21 6,21 L9,21 L9,15 Q9,14 10,14 L14,14 Q15,14 15,15 L15,21 L18,21 Q19,21 19,20 L19,10" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                  </svg>
                )}
                {item.key === 'commandes' && (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="9" width="20" height="13" rx="3" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" opacity={op}/>
                    <path d="M2,13 L22,13" stroke={stroke} strokeWidth="2.5" opacity={op}/>
                    <path d="M8,9 L8,5 Q8,2 12,2 Q16,2 16,5 L16,9" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                    {item.badge > 0 && (
                      <>
                        <circle cx="19" cy="5" r="5.5" fill={T.main} stroke="white" strokeWidth="1.8"/>
                        <text x="19" y="8.8" textAnchor="middle" fontSize="7" fontWeight="900" fill="white" fontFamily="DM Sans,sans-serif">{item.badge}</text>
                      </>
                    )}
                  </svg>
                )}
                {item.key === 'favoris' && (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12,5 L13.6,9.2 L18.2,9.6 L14.9,12.4 L15.9,17 L12,14.6 L8.1,17 L9.1,12.4 L5.8,9.6 L10.4,9.2 Z" stroke={stroke} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round" opacity={op}/>
                    <circle cx="8.5" cy="21" r="1.8" fill={actif ? '#C4A0F4' : stroke} opacity={actif ? 1 : 0.35}/>
                    <circle cx="12" cy="21" r="2.2" fill={actif ? '#C4A0F4' : stroke} opacity={actif ? 1 : 0.5}/>
                    <circle cx="15.5" cy="21" r="1.8" fill={actif ? '#9660E0' : stroke} opacity={actif ? 0.85 : 0.35}/>
                  </svg>
                )}
                {item.key === 'tribu' && (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="4" cy="8" r="3" stroke={stroke} strokeWidth="2.2" opacity={op * 0.7}/>
                    <path d="M0,18 Q0,14 4,14 Q8,14 8,18" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" opacity={op * 0.7}/>
                    <circle cx="20" cy="8" r="3" stroke={stroke} strokeWidth="2.2" opacity={op * 0.7}/>
                    <path d="M16,18 Q16,14 20,14 Q24,14 24,18" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" opacity={op * 0.7}/>
                    <circle cx="12" cy="6" r="4" stroke={stroke} strokeWidth="2.5" opacity={op}/>
                    <path d="M5,20 Q5,15 12,15 Q19,15 19,20" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" opacity={op}/>
                  </svg>
                )}
                {item.key === 'profil' && (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="5" stroke={stroke} strokeWidth="2.5" opacity={op}/>
                    <path d="M2,21 Q2,16 12,16 Q22,16 22,21" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" opacity={op}/>
                  </svg>
                )}

                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: actif ? '#fff' : '#6B7280', letterSpacing: '0.2px', fontFamily: '"DM Sans", sans-serif' }}>
                  {item.label}
                </span>
                {actif && <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 20, height: 3, borderRadius: 3, background: T.light }}/>}
              </button>
            )
          })}
        </nav>
      </div>
    </>
  )
}