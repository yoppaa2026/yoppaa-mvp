'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

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

const CATEGORIES = ['Tous', 'Boulangerie', 'Coffee shop', 'Sandwicherie', 'Snack', 'Friterie', 'Pizzeria', 'Épicerie', 'Traiteur']

// ─── Icônes SVG — 2 versions : dark (fond foncé → icône blanche) & light (fond clair → icône violette) ──
function IconeBoulangerie({ dark }) {
  const c = dark ? '#fff' : T.deep
  const a = dark ? 'rgba(255,255,255,0.15)' : T.pale
  return (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
      <ellipse cx="20" cy="22" rx="14" ry="9" fill={a}/>
      <path d="M8 22 Q10 12 20 11 Q30 12 32 22 Q30 28 20 28 Q10 28 8 22Z" fill={dark ? 'rgba(255,255,255,0.3)' : T.pale}/>
      <path d="M12 18 Q16 14 20 14 Q24 14 28 18" stroke={c} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <ellipse cx="20" cy="13" rx="4" ry="2.5" fill={c} opacity="0.7"/>
    </svg>
  )
}
function IconePatisserie({ dark }) {
  const c = dark ? '#fff' : T.deep
  const a = dark ? 'rgba(255,255,255,0.2)' : T.pale
  return (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
      <ellipse cx="20" cy="22" rx="14" ry="9" fill={a}/>
      <path d="M8 22 Q10 12 20 11 Q30 12 32 22 Q30 28 20 28 Q10 28 8 22Z" fill={dark ? 'rgba(255,255,255,0.25)' : T.pale}/>
      <circle cx="20" cy="13" r="4" fill={c} opacity="0.8" stroke={c} strokeWidth="0.5"/>
      <path d="M17 13 L20 10 L23 13" stroke={dark ? T.bgPanel : T.main} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
function IconeSandwich({ dark }) {
  const c = dark ? '#fff' : T.deep
  const a = dark ? 'rgba(255,255,255,0.25)' : T.pale
  return (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
      <rect x="7" y="24" width="26" height="5" rx="2.5" fill={c} opacity="0.9"/>
      <rect x="7" y="19" width="26" height="5" rx="1" fill={dark ? 'rgba(255,255,255,0.4)' : '#C4F4D0'}/>
      <rect x="9" y="16" width="22" height="3" rx="1" fill={dark ? 'rgba(255,255,255,0.3)' : '#FCA5A5'}/>
      <rect x="7" y="11" width="26" height="5" rx="2.5" fill={a}/>
    </svg>
  )
}
function IconeSnack({ dark }) {
  const c = dark ? '#fff' : T.deep
  return (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
      <path d="M15 28 L13 14 Q20 10 27 14 L25 28Z" fill={dark ? 'rgba(255,255,255,0.25)' : T.pale} stroke={c} strokeWidth="1.2"/>
      <path d="M15 19 Q20 16 25 19" stroke={c} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      <circle cx="18" cy="22" r="2" fill={c} opacity="0.7"/>
      <circle cx="22" cy="23" r="2" fill={c} opacity="0.5"/>
    </svg>
  )
}
function IconeFriterie({ dark }) {
  const c = dark ? '#fff' : T.deep
  const a = dark ? 'rgba(255,255,255,0.25)' : T.pale
  return (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
      <rect x="12" y="20" width="16" height="12" rx="2" fill={a} stroke={c} strokeWidth="1.2"/>
      <rect x="15" y="11" width="3" height="10" rx="1.5" fill={c} opacity="0.8"/>
      <rect x="19" y="9" width="3" height="12" rx="1.5" fill={c} opacity="0.9"/>
      <rect x="23" y="12" width="3" height="9" rx="1.5" fill={c} opacity="0.7"/>
    </svg>
  )
}
function IconePizza({ dark }) {
  const c = dark ? '#fff' : T.deep
  const a = dark ? 'rgba(255,255,255,0.25)' : T.pale
  return (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
      <path d="M20 8 L32 30 L8 30Z" fill={a} stroke={c} strokeWidth="1.2"/>
      <circle cx="20" cy="22" r="2.5" fill={c} opacity="0.8"/>
      <circle cx="15" cy="26" r="2" fill={c} opacity="0.6"/>
      <circle cx="25" cy="25" r="2" fill={c} opacity="0.6"/>
    </svg>
  )
}
function IconeCoffee({ dark }) {
  const c = dark ? '#fff' : T.deep
  const a = dark ? 'rgba(255,255,255,0.3)' : T.pale
  return (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
      <path d="M10 21 Q10 18 14 18 L26 18 Q30 18 30 21 L29 28 Q28 31 20 31 Q12 31 11 28Z" fill={a}/>
      <path d="M28 20 Q34 20 34 24 Q34 28 28 27" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M16 14 Q16 11 18 11" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M21 13 Q21 10 23 10" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}
function IconeEpicerie({ dark }) {
  const c = dark ? '#fff' : T.deep
  const a = dark ? 'rgba(255,255,255,0.15)' : T.pale
  return (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
      <rect x="8" y="20" width="24" height="12" rx="2" fill={a}/>
      <rect x="8" y="20" width="24" height="12" rx="2" stroke={c} strokeWidth="1.5" fill="none"/>
      <path d="M14 20 L12 14 L28 14 L26 20" stroke={c} strokeWidth="1.5" fill="none"/>
      <circle cx="16" cy="25" r="2" fill={c} opacity="0.8"/>
      <circle cx="24" cy="25" r="2" fill={c} opacity="0.8"/>
    </svg>
  )
}
function IconeTraiteur({ dark }) {
  const c = dark ? '#fff' : T.deep
  const a = dark ? 'rgba(255,255,255,0.2)' : T.pale
  return (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
      <path d="M8 22 Q8 18 20 18 Q32 18 32 22 L32 24 Q32 28 20 28 Q8 28 8 24Z" fill={a}/>
      <path d="M8 22 Q8 18 20 18 Q32 18 32 22 L32 24 Q32 28 20 28 Q8 28 8 24Z" stroke={c} strokeWidth="1.2" fill="none"/>
      <rect x="19" y="10" width="2" height="8" rx="1" fill={c} opacity="0.8"/>
      <ellipse cx="20" cy="10" rx="5" ry="2" fill={c} opacity="0.4"/>
    </svg>
  )
}
function IconeDefault({ dark }) {
  const c = dark ? '#fff' : T.deep
  const a = dark ? 'rgba(255,255,255,0.15)' : T.pale
  return (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
      <rect x="8" y="18" width="24" height="14" rx="3" fill={a}/>
      <rect x="8" y="18" width="24" height="14" rx="3" stroke={c} strokeWidth="1.5" fill="none"/>
      <rect x="14" y="10" width="12" height="8" rx="2" fill={a} stroke={c} strokeWidth="1.5"/>
    </svg>
  )
}

function getIcone(type, dark = false) {
  const props = { dark }
  switch(type) {
    case 'Boulangerie': return <IconeBoulangerie {...props}/>
    case 'Boulangerie & Pâtisserie': return <IconePatisserie {...props}/>
    case 'Sandwicherie': return <IconeSandwich {...props}/>
    case 'Snack': return <IconeSnack {...props}/>
    case 'Friterie': return <IconeFriterie {...props}/>
    case 'Pizzeria': return <IconePizza {...props}/>
    case 'Coffee shop': return <IconeCoffee {...props}/>
    case 'Épicerie': return <IconeEpicerie {...props}/>
    case 'Traiteur': return <IconeTraiteur {...props}/>
    default: return <IconeDefault {...props}/>
  }
}

const TYPE_BADGE = {
  'Boulangerie': { bg: '#FFF3CD', color: '#856404' },
  'Boulangerie & Pâtisserie': { bg: '#FEF3C7', color: '#92400E' },
  'Sandwicherie': { bg: '#CCE5FF', color: '#004085' },
  'Snack': { bg: '#D4EDDA', color: '#155724' },
  'Friterie': { bg: '#FEF9C3', color: '#854D0E' },
  'Pizzeria': { bg: '#FEE2E2', color: '#991B1B' },
  'Coffee shop': { bg: '#EDE0FF', color: '#2D0F6B' },
  'Épicerie': { bg: '#E0E7FF', color: '#3730A3' },
  'Traiteur': { bg: '#FCE7F3', color: '#9D174D' },
  'Pharmacie': { bg: '#D1FAE5', color: '#065F46' },
}
function getBadge(type) { return TYPE_BADGE[type] || { bg: T.pale, color: T.deep } }

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

function Etoiles({ note, taille = 14 }) {
  const n = note ? Math.round(note) : 0
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: taille, color: i<=n ? '#F59E0B' : '#D1D5DB' }}>★</span>)}</span>
}

// ─── Swipe retrait ────────────────────────────────────────────────────────────
function SwipeRetrait({ onConfirm }) {
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const startRef = useRef(0)
  const THUMB = 52

  function trackWidth() { return Math.min(window.innerWidth - 80, 320) }
  function maxX() { return trackWidth() - THUMB - 8 }
  function getX(e) { return e.touches ? e.touches[0].clientX : e.clientX }

  const onStart = e => { if (confirmed) return; setSwiping(true); startRef.current = getX(e) - swipeX }
  const onMove = e => {
    if (!swiping || confirmed) return
    const x = Math.max(0, Math.min(maxX(), getX(e) - startRef.current))
    setSwipeX(x)
    if (x >= maxX()) { setConfirmed(true); setSwiping(false); onConfirm() }
  }
  const onEnd = () => { if (confirmed) return; setSwiping(false); if (swipeX < maxX()) setSwipeX(0) }
  const p = swipeX / (maxX() || 1)
  const tw = typeof window !== 'undefined' ? Math.min(window.innerWidth - 80, 320) : 300

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <p style={{ fontSize: '0.875rem', color: T.muted, fontWeight: 600, margin: 0 }}>Glisse pour confirmer le retrait</p>
      <div style={{ width: tw, height: THUMB+8, borderRadius: 100, background: confirmed ? '#D4EDDA' : `linear-gradient(to right, ${T.pale} ${p*100}%, #F3F4F6 ${p*100}%)`, position: 'relative', overflow: 'hidden', border: `2px solid ${confirmed ? '#16A34A' : T.light}`, transition: confirmed ? 'all 0.3s' : 'none', userSelect: 'none', cursor: confirmed ? 'default' : 'grab', touchAction: 'none' }}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, color: confirmed ? '#16A34A' : T.mid, pointerEvents: 'none', paddingLeft: THUMB+12 }}>
          {confirmed ? '✓ Confirmé !' : 'Glisse →'}
        </div>
        <div style={{ position: 'absolute', left: 4+swipeX, top: 4, width: THUMB, height: THUMB, borderRadius: '50%', background: confirmed ? '#16A34A' : T.main, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', color: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.15)', transition: swiping ? 'none' : 'left 0.3s, background 0.3s', userSelect: 'none' }}>
          {confirmed ? '✓' : '→'}
        </div>
      </div>
    </div>
  )
}

// ─── Carte commerce ───────────────────────────────────────────────────────────
function CarteCommerce({ c, favoris, notesParCommerce, onSelect, onToggleFavori }) {
  const badge = getBadge(c.type)
  const estFavori = favoris.includes(c.id)
  const noteInfo = notesParCommerce[c.id]
  return (
    <div onClick={() => onSelect(c)}
      style={{ background: T.bgCard, border: `1.5px solid ${T.pale}`, borderRadius: 16, padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', boxShadow: '0 1px 6px rgba(107,53,196,0.06)', transition: 'all 0.15s' }}
      onMouseOver={e => { e.currentTarget.style.borderColor = T.main; e.currentTarget.style.boxShadow = '0 4px 20px rgba(107,53,196,0.12)' }}
      onMouseOut={e => { e.currentTarget.style.borderColor = T.pale; e.currentTarget.style.boxShadow = '0 1px 6px rgba(107,53,196,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Icône — fond blanc, dessin violet foncé */}
        <div style={{ width: 56, height: 56, borderRadius: 14, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', padding: 8 }}>
          {c.logo_url
            ? <img src={c.logo_url} alt={c.nom} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}/>
            : getIcone(c.type, false)
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 800, color: T.ink, margin: '0 0 4px', fontSize: '1rem', letterSpacing: '-0.3px' }}>{c.nom}</p>
              <span style={{ background: badge.bg, color: badge.color, fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: 100 }}>{c.type}</span>
            </div>
            <button onClick={e => onToggleFavori(c.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', padding: '0 0 0 8px', lineHeight: 1, flexShrink: 0 }}>
              {estFavori ? '❤️' : '🤍'}
            </button>
          </div>
          {c.description && <p style={{ fontSize: '0.82rem', color: '#6b5c8a', margin: '6px 0 0', lineHeight: 1.45 }}>{c.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
            <Etoiles note={noteInfo?.moyenne || 0} taille={13}/>
            <span style={{ fontSize: '0.72rem', color: noteInfo?.count > 0 ? '#9CA3AF' : '#D1D5DB' }}>
              {noteInfo?.count > 0 ? `(${noteInfo.count} avis)` : "Pas encore d'avis"}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px', marginTop: 4 }}>
            {c.distance != null && <span style={{ fontSize: '0.75rem', color: T.main, fontWeight: 700 }}>📍 {formatDistance(c.distance)}</span>}
            {/* Horaires en violet foncé */}
            {c.horaires && <span style={{ fontSize: '0.75rem', color: T.deep, fontWeight: 600 }}>🕐 {c.horaires}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Commander() {
  const [onglet, setOnglet] = useState('accueil')
  const [etape, setEtape] = useState(1)
  const [commercants, setCommercants] = useState([])
  const [commercantSelectionne, setCommercantSelectionne] = useState(null)
  const [articles, setArticles] = useState([])
  const [creneaux, setCreneaux] = useState([])
  const [avisCommerce, setAvisCommerce] = useState([])
  const [notesParCommerce, setNotesParCommerce] = useState({})
  const [panier, setPanier] = useState({})
  const [creneauChoisi, setCreneauChoisi] = useState(null)
  const [loading, setLoading] = useState(false)
  const [derniereCommande, setDerniereCommande] = useState(null)
  const [client, setClient] = useState({ nom: '', email: '', telephone: '' })
  const [clientId, setClientId] = useState(null)
  const [clientCommandes, setClientCommandes] = useState([])
  const [position, setPosition] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [categorieActive, setCategorieActive] = useState('Tous')
  const [favoris, setFavoris] = useState([])
  const [commercantsFavoris, setCommercantsFavoris] = useState([])
  const [avisForm, setAvisForm] = useState({ note: 0, commentaire: '' })
  const [avisSoumis, setAvisSoumis] = useState(false)
  const [commandeRecuperee, setCommandeRecuperee] = useState(false)
  const [minutesRestantes, setMinutesRestantes] = useState(30)
  const [avisDisponible, setAvisDisponible] = useState(false)
  const avisTimerRef = useRef(null)

  useEffect(() => {
    chargerCommercants()
    demanderGeolocalisation()
    const email = localStorage.getItem('yoppaa_email')
    const nom = localStorage.getItem('yoppaa_nom')
    const id = localStorage.getItem('yoppaa_client_id')
    if (email && id) {
      setClient(p => ({ ...p, email, nom: nom || '' }))
      setClientId(id)
      chargerFavoris(id)
      chargerCommandesClient(email)
    }
    return () => { if (avisTimerRef.current) clearTimeout(avisTimerRef.current) }
  }, [])

  function demanderGeolocalisation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoLoading(false) },
      () => setGeoLoading(false), { timeout: 8000 }
    )
  }

  async function chargerCommercants() {
    const { data } = await supabase.from('commercants').select('*').order('nom')
    setCommercants(data || [])
    if (data?.length > 0) chargerNotes(data.map(c => c.id))
  }

  async function chargerNotes(ids) {
    const { data } = await supabase.from('avis').select('commercant_id, note').in('commercant_id', ids)
    if (!data) return
    const notes = {}
    ids.forEach(id => {
      const av = data.filter(a => a.commercant_id === id)
      notes[id] = av.length > 0 ? { moyenne: av.reduce((a, x) => a + x.note, 0)/av.length, count: av.length } : { moyenne: 0, count: 0 }
    })
    setNotesParCommerce(notes)
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
    const { data } = await supabase.from('commandes').select('*, commercant:commercants(nom, type)').eq('client_email', email).order('created_at', { ascending: false })
    setClientCommandes(data||[])
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
      const res = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
        method: 'POST',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: [[pos.lng, pos.lat], ...avecCoords.map(c => [parseFloat(c.longitude), parseFloat(c.latitude)])], metrics: ['distance'], units: 'm' })
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const distances = data.distances[0].slice(1)
      const avecDistance = liste.map(c => { const idx = avecCoords.findIndex(x => x.id === c.id); return { ...c, distance: idx===-1 ? null : distances[idx] } })
      avecDistance.sort((a, b) => (a.distance??Infinity) - (b.distance??Infinity))
      setCommercants(avecDistance)
    } catch {
      const avecDistance = liste.map(c => ({ ...c, distance: c.latitude && c.longitude ? distanceVolOiseau(pos.lat, pos.lng, parseFloat(c.latitude), parseFloat(c.longitude)) : null }))
      avecDistance.sort((a, b) => (a.distance??Infinity) - (b.distance??Infinity))
      setCommercants(avecDistance)
    }
  }

  async function getOuCreerClient(email, nom) {
    const { data: ex } = await supabase.from('clients').select('id').eq('email', email).single()
    if (ex) {
      setClientId(ex.id)
      localStorage.setItem('yoppaa_client_id', ex.id)
      localStorage.setItem('yoppaa_email', email)
      localStorage.setItem('yoppaa_nom', nom)
      chargerFavoris(ex.id)
      chargerCommandesClient(email)
      return ex.id
    }
    const { data: n } = await supabase.from('clients').insert({ email, nom }).select('id').single()
    setClientId(n.id)
    localStorage.setItem('yoppaa_client_id', n.id)
    localStorage.setItem('yoppaa_email', email)
    localStorage.setItem('yoppaa_nom', nom)
    return n.id
  }

  async function toggleFavori(commercantId, e) {
    e.stopPropagation()
    if (!client.email) {
      const email = prompt('Entre ton email pour sauvegarder tes favoris :')
      if (!email) return
      setClient(p => ({ ...p, email }))
      const id = await getOuCreerClient(email, '')
      await supabase.from('favoris').insert({ client_id: id, commercant_id: commercantId })
      setFavoris(prev => [...prev, commercantId])
      return
    }
    let cid = clientId || await getOuCreerClient(client.email, client.nom)
    if (favoris.includes(commercantId)) {
      await supabase.from('favoris').delete().eq('client_id', cid).eq('commercant_id', commercantId)
      setFavoris(prev => prev.filter(id => id !== commercantId))
      setCommercantsFavoris(prev => prev.filter(c => c.id !== commercantId))
    } else {
      await supabase.from('favoris').insert({ client_id: cid, commercant_id: commercantId })
      setFavoris(prev => [...prev, commercantId])
      const c = commercants.find(x => x.id === commercantId)
      if (c) setCommercantsFavoris(prev => [...prev, c])
    }
  }

  async function selectionnerCommercant(c) {
    setCommercantSelectionne(c)
    const [{ data: arts }, { data: cren }, { data: avis }] = await Promise.all([
      supabase.from('articles').select('*').eq('commercant_id', c.id).eq('actif', true).order('nom'),
      supabase.from('creneaux').select('*').eq('commercant_id', c.id).eq('actif', true).order('heure_debut'),
      supabase.from('avis').select('*, client:clients(nom)').eq('commercant_id', c.id).order('created_at', { ascending: false }).limit(10)
    ])
    setArticles(arts||[])
    setCreneaux(cren||[])
    setAvisCommerce(avis||[])
    setEtape(2)
  }

  function ajouterAuPanier(a) { setPanier(p => ({ ...p, [a.id]: { ...a, quantite: (p[a.id]?.quantite||0)+1 } })) }
  function retirerDuPanier(id) { setPanier(p => { const n={...p}; if(n[id]?.quantite>1) n[id].quantite-=1; else delete n[id]; return n }) }
  function totalPanier() { return Object.values(panier).reduce((acc, i) => acc+i.prix*i.quantite, 0) }

  async function passerCommande() {
    if (!creneauChoisi || !client.nom || !client.email) return
    setLoading(true)
    const cid = await getOuCreerClient(client.email, client.nom)
    const { data: commande } = await supabase.from('commandes').insert({
      commercant_id: commercantSelectionne.id, creneau_id: creneauChoisi,
      client_nom: client.nom, client_email: client.email, client_telephone: client.telephone,
      total: totalPanier(), statut: 'en_attente'
    }).select().single()
    if (commande) {
      await supabase.from('commande_articles').insert(Object.values(panier).map(i => ({ commande_id: commande.id, article_id: i.id, quantite: i.quantite, prix_unitaire: i.prix })))
      setDerniereCommande({ ...commande, client_id: cid })
      setEtape(4)
      chargerCommandesClient(client.email)
    }
    setLoading(false)
  }

  async function confirmerRetrait() {
    if (!derniereCommande) return
    await supabase.from('commandes').update({ statut: 'recupere' }).eq('id', derniereCommande.id)
    setCommandeRecuperee(true)
    let restant = 30
    const iv = setInterval(() => { restant-=1; setMinutesRestantes(restant); if(restant<=0){clearInterval(iv);setAvisDisponible(true)} }, 60000)
    avisTimerRef.current = setTimeout(() => setAvisDisponible(true), 30*60*1000)
  }

  async function soumettreAvis() {
    if (!avisForm.note || !derniereCommande) return
    await supabase.from('avis').insert({ commande_id: derniereCommande.id, client_id: derniereCommande.client_id, commercant_id: commercantSelectionne.id, note: avisForm.note, commentaire: avisForm.commentaire.trim()||null })
    setAvisSoumis(true)
  }

  function noteMoyenne(avis) { return !avis?.length ? 0 : avis.reduce((acc,a)=>acc+a.note,0)/avis.length }

  function resetCommande() {
    setEtape(1); setPanier({}); setCreneauChoisi(null); setCommercantSelectionne(null)
    setAvisForm({ note:0, commentaire:'' }); setAvisSoumis(false)
    setCommandeRecuperee(false); setAvisDisponible(false); setMinutesRestantes(30)
    if (avisTimerRef.current) clearTimeout(avisTimerRef.current)
  }

  const tempsEconomise = clientCommandes.filter(c=>c.statut==='recupere').reduce((acc,c)=>acc+getTemps(c.commercant?.type),0)
  const estDansCommerce = etape > 1
  const commercantsFiltres = categorieActive === 'Tous' ? commercants : commercants.filter(c => c.type===categorieActive || c.type?.includes(categorieActive))

  // Styles réutilisables
  const card = { background: T.bgCard, borderRadius: 14, padding: '1rem', marginBottom: '0.75rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 1px 6px rgba(107,53,196,0.05)' }
  const btnPrimary = { width: '100%', padding: '0.9rem 1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: '1rem', background: T.main, color: '#fff', boxShadow: `0 4px 20px ${T.main}44` }
  const inputStyle = { width: '100%', padding: '0.875rem 1rem', border: `1.5px solid ${T.pale}`, borderRadius: 12, marginBottom: 10, fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none', color: T.ink, background: '#fff' }

  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', maxWidth: 640, margin: '0 auto', background: T.bg, minHeight: '100vh', paddingBottom: estDansCommerce ? 16 : 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <style>{`
        * { box-sizing: border-box; }
        html { font-size: 16px; }
        input, textarea, button { font-family: "DM Sans", sans-serif; }
        .cats-scroll { display: flex; gap: 8px; overflow-x: auto; padding: 0 1rem 0.875rem; scrollbar-width: none; -ms-overflow-style: none; }
        .cats-scroll::-webkit-scrollbar { display: none; }
        .grille-articles { display: grid; grid-template-columns: 1fr; gap: 0.75rem; }
        .grille-creneaux { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .grille-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (min-width: 500px) {
          .grille-articles { grid-template-columns: repeat(2, 1fr); }
          .grille-creneaux { grid-template-columns: repeat(3, 1fr); }
          .grille-stats { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      {/* ── HEADER DARK ── */}
      {!estDansCommerce && (
        <div style={{ background: T.bgPanel, borderBottom: `1px solid ${T.main}33`, position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1rem 0.75rem' }}>
            <div>
              <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
                {[0.4, 1, 1].map((op, i) => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i===0 ? '#fff' : i===1 ? T.light : T.mid, opacity: op }}/>)}
              </div>
              <p style={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-2px', color: '#fff', margin: 0, lineHeight: 1 }}>yoppaa</p>
              <p style={{ color: T.light, fontSize: '0.75rem', margin: '2px 0 0' }}>Skip the wait</p>
            </div>
            <button onClick={demanderGeolocalisation}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${T.main}55`, border: `1px solid ${T.main}88`, borderRadius: 12, padding: '0.5rem 0.875rem', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>
              <span style={{ fontSize: '1rem' }}>{geoLoading ? '⏳' : '📍'}</span>
              <span>{geoLoading ? 'Localisation...' : position ? 'Ma position' : 'Activer'}</span>
            </button>
          </div>

          {onglet === 'accueil' && (
            <div className="cats-scroll">
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setCategorieActive(cat)}
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.875rem', borderRadius: 100, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', transition: 'all 0.15s', background: categorieActive===cat ? '#fff' : `${T.main}44`, color: categorieActive===cat ? T.main : '#fff', whiteSpace: 'nowrap' }}>
                  {/* Icône mini dans filtre — fond dark → icône blanche, fond blanc → icône violette */}
                  <span style={{ width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {cat !== 'Tous' ? getIcone(cat, categorieActive !== cat) : '✦'}
                  </span>
                  {cat}
                </button>
              ))}
            </div>
          )}
          {onglet !== 'accueil' && <div style={{ height: 8 }}/>}
        </div>
      )}

      {/* Header dans le commerce */}
      {estDansCommerce && (
        <div style={{ background: T.bgPanel, padding: '1rem', borderBottom: `1px solid ${T.main}33` }}>
          <button onClick={resetCommande}
            style={{ background: `${T.main}55`, border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 10, padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.875rem' }}>
            ← Retour
          </button>
        </div>
      )}

      {/* ══ ACCUEIL ══ */}
      {onglet === 'accueil' && !estDansCommerce && (
        <div style={{ padding: '0.875rem 1rem 0' }}>
          {position && <p style={{ fontSize: '0.8rem', color: T.mid, fontWeight: 600, marginBottom: '0.75rem' }}>📍 {commercantsFiltres.length} commerce{commercantsFiltres.length>1?'s':''} près de toi</p>}
          {commercantsFiltres.length === 0
            ? <div style={{ textAlign: 'center', padding: '3rem 0' }}><p style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</p><p style={{ color: T.muted, fontSize: '1rem' }}>Aucun commerce dans cette catégorie</p></div>
            : commercantsFiltres.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} onSelect={selectionnerCommercant} onToggleFavori={toggleFavori}/>)
          }
        </div>
      )}

      {/* ══ ÉTAPE 2 — Articles ══ */}
      {etape === 2 && (
        <div style={{ padding: '1rem' }}>
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, marginBottom: '1rem' }}>
            <div style={{ width: 64, height: 64, borderRadius: 14, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', padding: 10 }}>
              {commercantSelectionne?.logo_url
                ? <img src={commercantSelectionne.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}/>
                : getIcone(commercantSelectionne?.type, false)
              }
            </div>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: T.ink, margin: '0 0 3px' }}>{commercantSelectionne?.nom}</h2>
              {commercantSelectionne?.adresse && <p style={{ fontSize: '0.78rem', color: '#b0a0c8', margin: '0 0 5px' }}>📍 {commercantSelectionne.adresse}</p>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Etoiles note={noteMoyenne(avisCommerce)} taille={13}/>
                {avisCommerce.length > 0
                  ? <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>({avisCommerce.length} avis)</span>
                  : <span style={{ fontSize: '0.72rem', color: '#D1D5DB' }}>Pas encore d'avis</span>
                }
              </div>
            </div>
          </div>

          <div className="grille-articles">
            {articles.map(article => (
              <div key={article.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, color: T.ink, margin: '0 0 2px', fontSize: '0.95rem' }}>{article.nom}</p>
                  {article.description && <p style={{ fontSize: '0.78rem', color: '#888', margin: '0 0 4px', lineHeight: 1.4 }}>{article.description}</p>}
                  <p style={{ fontSize: '0.9rem', color: T.main, fontWeight: 800, margin: 0 }}>{Number(article.prix).toFixed(2)}€</p>
                  {article.stock_jour === 0 && <span style={{ fontSize: '0.7rem', background: '#FEE2E2', color: '#DC2626', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>Épuisé</span>}
                </div>
                {article.stock_jour !== 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 10, flexShrink: 0 }}>
                    {panier[article.id] && (
                      <>
                        <button onClick={() => retirerDuPanier(article.id)} style={{ width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${T.main}`, background: '#fff', color: T.main, fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}>-</button>
                        <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center', fontSize: '1rem' }}>{panier[article.id].quantite}</span>
                      </>
                    )}
                    <button onClick={() => ajouterAuPanier(article)} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: T.main, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}>+</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {avisCommerce.length > 0 && (
            <div style={{ marginTop: '1.25rem' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.ink, marginBottom: '0.625rem' }}>Avis clients</h3>
              {avisCommerce.map(a => (
                <div key={a.id} style={{ ...card, marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Etoiles note={a.note} taille={14}/>
                    <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{a.client?.nom || 'Client'}</span>
                  </div>
                  {a.commentaire && <p style={{ fontSize: '0.82rem', color: T.ink, margin: '3px 0 0', lineHeight: 1.5 }}>{a.commentaire}</p>}
                  {a.reponse_commercant && (
                    <div style={{ background: T.pale, borderRadius: 10, padding: '0.5rem 0.75rem', marginTop: 8 }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: T.main, margin: '0 0 2px' }}>Réponse :</p>
                      <p style={{ fontSize: '0.8rem', color: T.ink, margin: 0 }}>{a.reponse_commercant}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {Object.keys(panier).length > 0 && (
            <div style={{ position: 'sticky', bottom: 16, marginTop: 16 }}>
              <button onClick={() => setEtape(3)} style={{ ...btnPrimary }}>
                Choisir mon créneau — {totalPanier().toFixed(2)}€
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ ÉTAPE 3 — Créneau ══ */}
      {etape === 3 && (
        <div style={{ padding: '1rem' }}>
          <h2 style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '1rem', color: T.ink }}>Choisis ton créneau</h2>
          <div className="grille-creneaux" style={{ marginBottom: '1.25rem' }}>
            {creneaux.map(c => (
              <div key={c.id} onClick={() => setCreneauChoisi(c.id)}
                style={{ padding: '0.875rem 0.5rem', borderRadius: 12, border: `2px solid ${creneauChoisi===c.id ? T.main : T.pale}`, background: creneauChoisi===c.id ? T.pale : '#fff', cursor: 'pointer', textAlign: 'center', fontWeight: 700, color: T.ink, fontSize: '0.9rem', transition: 'all 0.15s' }}>
                {c.heure_debut.slice(0,5)} – {c.heure_fin.slice(0,5)}
              </div>
            ))}
          </div>

          <h2 style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '1rem', color: T.ink }}>Tes coordonnées</h2>
          {[
            { key: 'nom', placeholder: 'Ton prénom et nom', type: 'text' },
            { key: 'email', placeholder: 'Email', type: 'email' },
            { key: 'telephone', placeholder: 'Téléphone (optionnel)', type: 'tel' },
          ].map(f => (
            <input key={f.key} placeholder={f.placeholder} type={f.type} value={client[f.key]}
              onChange={e => setClient(p => ({ ...p, [f.key]: e.target.value }))}
              style={inputStyle}/>
          ))}

          <button onClick={passerCommande} disabled={loading || !creneauChoisi || !client.nom || !client.email}
            style={{ ...btnPrimary, opacity: (!creneauChoisi || !client.nom || !client.email) ? 0.5 : 1, marginTop: 4 }}>
            {loading ? 'En cours...' : `Confirmer — ${totalPanier().toFixed(2)}€`}
          </button>
          <p style={{ fontSize: '0.8rem', color: '#9a8ab0', textAlign: 'center', marginTop: 8 }}>Le paiement sera activé prochainement</p>
        </div>
      )}

      {/* ══ ÉTAPE 4 — Confirmation ══ */}
      {etape === 4 && (
        <div style={{ padding: '1.25rem 1rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎉</div>
            <h2 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.ink, marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Commande confirmée !</h2>
            <p style={{ color: T.main, fontWeight: 700, marginBottom: '0.25rem', fontSize: '1rem' }}>Chez {commercantSelectionne?.nom}</p>
            <p style={{ color: T.muted, fontSize: '0.875rem' }}>Présente-toi au créneau — tout sera prêt !</p>
          </div>

          {!commandeRecuperee ? (
            <div style={{ ...card, textAlign: 'center', padding: '1.5rem' }}>
              <p style={{ fontWeight: 800, color: T.ink, marginBottom: '0.5rem', fontSize: '1rem' }}>📦 Tu as récupéré ta commande ?</p>
              <p style={{ fontSize: '0.875rem', color: T.muted, marginBottom: '1.25rem' }}>Glisse devant le commerçant pour confirmer.</p>
              <SwipeRetrait onConfirm={confirmerRetrait}/>
            </div>
          ) : (
            <div style={{ background: '#F0FDF4', borderRadius: 14, padding: '1.25rem', border: '1.5px solid #16A34A33', marginBottom: '0.75rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.75rem', marginBottom: 6 }}>✅</p>
              <p style={{ fontWeight: 800, color: '#16A34A', margin: 0, fontSize: '1rem' }}>Retrait confirmé !</p>
            </div>
          )}

          {commandeRecuperee && !avisSoumis && (
            <div style={{ ...card, padding: '1.25rem' }}>
              {!avisDisponible ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 700, color: T.ink, marginBottom: 4, fontSize: '1rem' }}>⏳ Ton avis dans {minutesRestantes} min</p>
                  <p style={{ fontSize: '0.875rem', color: T.muted }}>On te demandera un avis après — le temps de savourer !</p>
                </div>
              ) : (
                <>
                  <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.ink, margin: '0 0 12px' }}>Comment était {commercantSelectionne?.nom} ? ⭐</h3>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {[1,2,3,4,5].map(i => <span key={i} onClick={() => setAvisForm(p=>({...p,note:i}))} style={{ fontSize: 32, cursor: 'pointer', color: i<=avisForm.note ? '#F59E0B' : '#E5E7EB', transition: 'color 0.1s' }}>★</span>)}
                  </div>
                  <textarea placeholder="Ton commentaire (optionnel)" value={avisForm.commentaire}
                    onChange={e => setAvisForm(p=>({...p,commentaire:e.target.value}))}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 80, marginBottom: 0 }}/>
                  <button onClick={soumettreAvis} disabled={!avisForm.note}
                    style={{ ...btnPrimary, background: avisForm.note ? T.main : '#E5E7EB', marginTop: 10, cursor: avisForm.note ? 'pointer' : 'default', boxShadow: 'none' }}>
                    Envoyer mon avis
                  </button>
                </>
              )}
            </div>
          )}

          {avisSoumis && (
            <div style={{ background: '#D4EDDA', borderRadius: 14, padding: '1rem', textAlign: 'center', marginBottom: '0.75rem' }}>
              <p style={{ color: '#155724', fontWeight: 700, margin: 0, fontSize: '1rem' }}>✓ Merci pour ton avis !</p>
            </div>
          )}

          <button onClick={resetCommande} style={{ ...btnPrimary, marginTop: 8 }}>Commander autre chose</button>
        </div>
      )}

      {/* ══ FAVORIS ══ */}
      {onglet === 'favoris' && !estDansCommerce && (
        <div style={{ padding: '0.875rem 1rem 0' }}>
          <h2 style={{ fontWeight: 800, fontSize: '1.15rem', color: T.ink, marginBottom: '0.875rem' }}>Mes favoris ❤️</h2>
          {commercantsFavoris.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <p style={{ fontSize: '2.5rem', marginBottom: 10 }}>🤍</p>
              <p style={{ fontWeight: 700, color: T.muted, marginBottom: 6, fontSize: '1rem' }}>Aucun favori pour l'instant</p>
              <p style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>Tape ❤️ sur un commerce pour le retrouver ici.</p>
            </div>
          ) : commercantsFavoris.map(c => (
            <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce}
              onSelect={c => { selectionnerCommercant(c); setOnglet('accueil') }}
              onToggleFavori={toggleFavori}/>
          ))}
        </div>
      )}

      {/* ══ PROFIL ══ */}
      {onglet === 'profil' && !estDansCommerce && (
        <div style={{ padding: '0.875rem 1rem 0' }}>

          {/* Carte profil */}
          <div style={{ background: T.bgPanel, borderRadius: 16, padding: '1.25rem', marginBottom: '0.875rem', border: `1px solid ${T.main}44` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${T.main}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>👤</div>
              <div>
                {client.nom
                  ? <><p style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff', margin: '0 0 2px' }}>{client.nom}</p><p style={{ fontSize: '0.8rem', color: T.light, margin: 0 }}>{client.email}</p></>
                  : <p style={{ fontWeight: 700, color: T.light, margin: 0 }}>Passe une commande pour créer ton profil</p>
                }
              </div>
            </div>
          </div>

          {/* Temps économisé */}
          <div style={{ ...card, textAlign: 'center', padding: '1.25rem' }}>
            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>⏱ Temps économisé en file</p>
            <p style={{ fontSize: '3rem', fontWeight: 900, color: T.main, letterSpacing: '-2px', margin: '0 0 6px', lineHeight: 1 }}>
              {tempsEconomise >= 60 ? `${Math.floor(tempsEconomise/60)}h${tempsEconomise%60>0?tempsEconomise%60+'min':''}` : `${tempsEconomise} min`}
            </p>
            <p style={{ fontSize: '0.875rem', color: T.muted, margin: 0 }}>
              {clientCommandes.filter(c=>c.statut==='recupere').length} commande{clientCommandes.filter(c=>c.statut==='recupere').length>1?'s':''} sans faire la file 🎉
            </p>
          </div>

          {/* Stats */}
          <div className="grille-stats" style={{ marginBottom: '0.875rem' }}>
            {[
              { label: 'Commandes', value: clientCommandes.length, color: T.main },
              { label: 'Total dépensé', value: `${clientCommandes.reduce((acc,c)=>acc+Number(c.total),0).toFixed(0)}€`, color: T.mid },
            ].map((s, i) => (
              <div key={i} style={{ ...card, textAlign: 'center', padding: '0.875rem', marginBottom: 0 }}>
                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>{s.label}</p>
                <p style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color, letterSpacing: '-1px', margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Historique */}
          <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.ink, marginBottom: '0.625rem' }}>Historique</h3>
          {clientCommandes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🛍️</p>
              <p style={{ color: T.muted, fontSize: '0.9rem' }}>Aucune commande pour l'instant</p>
            </div>
          ) : clientCommandes.map(c => {
            const sc = {
              'recupere':       { bg: '#F0FDF4', color: '#16A34A', label: '✓ Récupérée' },
              'pret':           { bg: '#F0FDF4', color: '#16A34A', label: 'Prête' },
              'en_preparation': { bg: '#EFF6FF', color: '#2563EB', label: 'En prépa' },
              'en_attente':     { bg: '#FFF7ED', color: '#EA580C', label: 'En attente' },
            }[c.statut] || { bg: T.pale, color: T.main, label: c.statut }
            return (
              <div key={c.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div>
                  <p style={{ fontWeight: 700, color: T.ink, margin: '0 0 2px', fontSize: '0.95rem' }}>{c.commercant?.nom}</p>
                  <p style={{ fontSize: '0.75rem', color: '#9CA3AF', margin: 0 }}>{new Date(c.created_at).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 800, color: T.main, margin: '0 0 4px', fontSize: '1rem' }}>{Number(c.total).toFixed(2)}€</p>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.color }}>{sc.label}</span>
                </div>
              </div>
            )
          })}

          {client.email && (
            <button onClick={() => {
              localStorage.removeItem('yoppaa_email'); localStorage.removeItem('yoppaa_nom'); localStorage.removeItem('yoppaa_client_id')
              setClient({ nom:'', email:'', telephone:'' }); setClientId(null)
              setFavoris([]); setCommercantsFavoris([]); setClientCommandes([])
            }} style={{ width: '100%', marginTop: '1rem', padding: '0.875rem', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
              Se déconnecter
            </button>
          )}
        </div>
      )}

      {/* ══ NAV BAR FIXE ══ */}
      {!estDansCommerce && (
        <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 640, background: T.bgPanel, borderTop: `1px solid ${T.main}33`, display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -4px 20px rgba(107,53,196,0.15)' }}>
          {[
            { key: 'accueil', label: 'Accueil', icon: '🏠' },
            { key: 'favoris', label: 'Favoris', icon: '❤️', badge: favoris.length },
            { key: 'profil',  label: 'Profil',  icon: '👤' },
          ].map(item => (
            <button key={item.key} onClick={() => setOnglet(item.key)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0.75rem 0 0.625rem', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem', color: onglet===item.key ? T.light : '#6B7280', position: 'relative', transition: 'color 0.15s' }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{item.icon}</span>
              {item.label}
              {item.badge > 0 && (
                <span style={{ position: 'absolute', top: 8, left: 'calc(50% + 8px)', background: T.main, color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100, minWidth: 16, textAlign: 'center' }}>{item.badge}</span>
              )}
              {onglet===item.key && <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 24, height: 3, borderRadius: 3, background: T.light }}/>}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}