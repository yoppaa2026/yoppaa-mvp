'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

const TYPE_BADGE = {
  'Boulangerie':              { bg: '#FFF3CD', color: '#856404' },
  'Boulangerie & Pâtisserie': { bg: '#FEF3C7', color: '#92400E' },
  'Sandwicherie':             { bg: '#CCE5FF', color: '#004085' },
  'Snack':                    { bg: '#D4EDDA', color: '#155724' },
  'Friterie':                 { bg: '#FEF9C3', color: '#854D0E' },
  'Pizzeria':                 { bg: '#FEE2E2', color: '#991B1B' },
  'Coffee shop':              { bg: '#EDE0FF', color: '#2D0F6B' },
  'Épicerie':                 { bg: '#E0E7FF', color: '#3730A3' },
  'Traiteur':                 { bg: '#FCE7F3', color: '#9D174D' },
  'Pharmacie':                { bg: '#D1FAE5', color: '#065F46' },
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
      <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.8rem', color: '#C4A0F4', letterSpacing: '3px', textTransform: 'uppercase', animation: phase >= 2 ? 'tagline-in 0.5s ease forwards' : 'none', opacity: phase >= 2 ? 1 : 0 }}>Skip the wait</p>
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

// ─── Carte commerce — redesignée ──────────────────────────────────────────────
function CarteCommerce({ c, favoris, notesParCommerce, statutsCommerce, onSelect, onToggleFavori }) {
  const estFavori = favoris.includes(c.id)
  const noteInfo = notesParCommerce[c.id]
  const statut = statutsCommerce[c.id]

  const statutConfig = {
    ouvert:  { dot: '#16A34A', label: 'Ouvert',    bg: '#F0FDF4', color: '#16A34A' },
    urgent:  { dot: '#EA580C', label: 'Réserve vite !', bg: '#FFF7ED', color: '#EA580C' },
    complet: { dot: '#DC2626', label: 'Complet',   bg: '#FEF2F2', color: '#DC2626' },
    ferme:   { dot: '#9CA3AF', label: 'Fermé',     bg: '#F9FAFB', color: '#9CA3AF' },
  }
  const sc = statutConfig[statut] || statutConfig['ferme']

  return (
    <div onClick={() => onSelect(c)}
      style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: '0.875rem', cursor: 'pointer', boxShadow: '0 2px 12px rgba(107,53,196,0.07)', border: `1px solid ${T.pale}`, transition: 'all 0.2s' }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(107,53,196,0.14)' }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(107,53,196,0.07)' }}>

      {/* Mini bannière colorée */}
      <div style={{ height: 6, background: `linear-gradient(90deg, ${T.main}, ${T.mid})` }}/>

      <div style={{ padding: '0.875rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Nom + statut */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <p style={{ fontWeight: 900, color: T.ink, margin: 0, fontSize: '1rem', letterSpacing: '-0.3px' }}>{c.nom}</p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: sc.bg, borderRadius: 100, padding: '2px 8px', flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, boxShadow: `0 0 5px ${sc.dot}88` }}/>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: sc.color }}>{sc.label}</span>
              </span>
            </div>

            <Badges type={c.type}/>

            {c.description && <p style={{ fontSize: '0.78rem', color: T.muted, margin: '6px 0 0', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.description}</p>}

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
              <Etoiles note={noteInfo?.moyenne || 0}/>
              <span style={{ fontSize: '0.7rem', color: noteInfo?.count > 0 ? T.muted : '#D1D5DB' }}>
                {noteInfo?.count > 0 ? `${noteInfo.count} avis` : 'Pas encore d\'avis'}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 6 }}>
              {c.distance != null && (
                <span style={{ fontSize: '0.72rem', color: T.main, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                  📍 {formatDistance(c.distance)}
                </span>
              )}
              {(c.horaires_detail || c.horaires) && (
                <span style={{ fontSize: '0.7rem', color: T.deep, fontWeight: 600 }}>
                  🕐 {c.horaires_detail ? (resumeHoraires(c.horaires_detail) || c.horaires) : c.horaires}
                </span>
              )}
            </div>
          </div>

          {/* Logo + favori */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: T.pale, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(107,53,196,0.12)' }}>
              {c.logo_url ? <img src={c.logo_url} alt={c.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <span style={{ fontSize: '1.5rem' }}>🏪</span>}
            </div>
            <button onClick={e => onToggleFavori(c.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0, transition: 'transform 0.15s' }}
              onMouseOver={e => e.currentTarget.style.transform = 'scale(1.2)'}
              onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
              {estFavori ? '❤️' : '🤍'}
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
  const [position, setPosition] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [rue, setRue] = useState(null)
  const [categorieActive, setCategorieActive] = useState('Tous')
  const [searchQuery, setSearchQuery] = useState('')
  const [favoris, setFavoris] = useState([])
  const [commercantsFavoris, setCommercantsFavoris] = useState([])
  const [client, setClient] = useState({ nom: '', email: '', telephone: '' })
  const [clientId, setClientId] = useState(null)
  const [clientCommandes, setClientCommandes] = useState([])

  useEffect(() => {
    const savedOnglet = localStorage.getItem('yoppaa_onglet')
    if (savedOnglet) setOngletState(savedOnglet)
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
    if (data?.length > 0) chargerNotes(data.map(c => c.id), data)
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
      const email = prompt('Entre ton email pour sauvegarder tes favoris :')
      if (!email) return
      setClient(p => ({ ...p, email }))
      const id = await getOuCreerClient(email, '')
      await supabase.from('favoris').insert({ client_id: id, commercant_id: commercantId })
      setFavoris(prev => [...prev, commercantId]); return
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

  // Filtres combinés : catégorie + recherche
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
    recupere:       { bg: '#F0FDF4', color: '#16A34A', label: '✓ Récupérée' },
    pret:           { bg: T.pale,    color: T.main,    label: '📦 Prête' },
    en_preparation: { bg: '#EFF6FF', color: '#2563EB', label: '🟠 En prépa' },
    en_attente:     { bg: '#FFF7ED', color: '#EA580C', label: '🔴 En attente' },
  }

  return (
    <>
      {showSplash && <SplashScreen onDone={onSplashDone}/>}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; width: 100%; overflow-x: hidden; }
        body { background: ${T.bg}; font-family: "DM Sans", sans-serif; font-size: 16px; -webkit-text-size-adjust: 100%; }
        .page-wrap { display: flex; flex-direction: column; min-height: 100dvh; max-width: 640px; margin: 0 auto; background: ${T.bg}; overflow-x: hidden; width: 100%; }
        .scroll-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .navbar { flex-shrink: 0; background: ${T.bgPanel}; border-top: 1px solid ${T.main}33; display: flex; padding-bottom: env(safe-area-inset-bottom, 0px); }
        .cats { display: flex; gap: 6px; overflow-x: auto; padding: 0 1rem 0.875rem; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .cats::-webkit-scrollbar { display: none; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        input, textarea, button, select { font-family: "DM Sans", sans-serif; }
        @keyframes tribu-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.15); } }
        @keyframes tribu-pulse2 { 0%,100% { opacity:0.85; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.1); } }
        @keyframes tribu-pulse3 { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:0.3; transform:scale(1.05); } }
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
        <div style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #3D1580 100%)`, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          {/* Motif décoratif */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 10%, ${T.mid}33 0%, transparent 50%), radial-gradient(circle at 10% 90%, ${T.light}18 0%, transparent 50%), radial-gradient(circle at 50% 50%, ${T.main}22 0%, transparent 70%)`, pointerEvents: 'none' }}/>

          {/* Top row — logo + géoloc */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1rem 0' }}>
            <div>
              <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
                {[{o:0.4,c:'#fff'},{o:1,c:T.light},{o:1,c:T.mid}].map((d,i) => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: d.c, opacity: d.o, boxShadow: `0 0 6px ${d.c}66` }}/>
                ))}
              </div>
              <p style={{ fontWeight: 900, fontSize: '1.6rem', letterSpacing: '-2px', color: '#fff', lineHeight: 1 }}>yoppaa</p>
              <p style={{ color: T.light, fontSize: '0.7rem', marginTop: 2, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Skip the wait</p>
            </div>
            <button onClick={demanderGeolocalisation}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, padding: '0.5rem 0.875rem', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem', transition: 'all 0.15s' }}>
              <span style={{ fontSize: '0.9rem' }}>{geoLoading ? '⏳' : '📍'}</span>
              <span>{geoLoading ? 'Localisation...' : rue || (position ? 'Position active' : 'Activer GPS')}</span>
            </button>
          </div>

          {/* Tagline hero */}
          {onglet === 'accueil' && (
            <div style={{ padding: '1rem 1rem 0.875rem', animation: 'fadeUp 0.4s ease' }}>
              <p style={{ fontWeight: 900, fontSize: '1.35rem', color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.25, marginBottom: 4 }}>
                Commander avant d'arriver,<br/>
                <span style={{ color: T.light }}>récupère sans attendre.</span>
              </p>
              {position && (
                <p style={{ fontSize: '0.78rem', color: T.light, fontWeight: 600, marginTop: 6, opacity: 0.8 }}>
                  📍 {commercantsFiltres.length} commerce{commercantsFiltres.length > 1 ? 's' : ''} près de toi
                </p>
              )}
            </div>
          )}

          {/* Barre de recherche */}
          {onglet === 'accueil' && (
            <div style={{ padding: '0 1rem 0.875rem' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', pointerEvents: 'none' }}>🔍</span>
                <input
                  className="search-input"
                  placeholder="Rechercher un commerce..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.75rem', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', backdropFilter: 'blur(8px)' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', color: '#fff', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                )}
              </div>
            </div>
          )}

          {/* Filtres catégories */}
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
            <div style={{ padding: '1rem 1rem 1rem' }}>
              {commercantsFiltres.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <p style={{ fontSize: '2.5rem', marginBottom: 10 }}>🔍</p>
                  <p style={{ fontWeight: 700, color: T.muted, marginBottom: 4 }}>Aucun résultat</p>
                  <p style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>Essaie une autre catégorie ou recherche.</p>
                </div>
              ) : (
                commercantsFiltres.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} statutsCommerce={statutsCommerce} onSelect={selectionnerCommercant} onToggleFavori={toggleFavori}/>)
              )}
            </div>
          )}

          {/* COMMANDES */}
          {onglet === 'commandes' && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              {commandesASwiper.length > 0 && (
                <>
                  <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: T.ink, marginBottom: '0.75rem' }}>📦 Prêtes à récupérer</h2>
                  {commandesASwiper.map(c => (
                    <div key={c.id} style={{ background: '#F0FDF4', borderRadius: 16, padding: '1.25rem', marginBottom: '0.75rem', border: '2px solid #16A34A44' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <p style={{ fontWeight: 800, color: T.ink, marginBottom: 2 }}>{c.commercant?.nom}</p>
                          <p style={{ fontSize: '0.78rem', color: '#16A34A', fontWeight: 600 }}>🟢 Prête{c.creneau ? ` · ${c.creneau.heure_debut.slice(0,5)}–${c.creneau.heure_fin.slice(0,5)}` : ''}</p>
                        </div>
                        <p style={{ fontWeight: 800, color: T.main }}>{Number(c.total).toFixed(2)}€</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {commandesEnCours.length > 0 && (
                <>
                  <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: T.ink, marginBottom: '0.75rem', marginTop: commandesASwiper.length > 0 ? '1rem' : 0 }}>🕐 En cours</h2>
                  {commandesEnCours.map(c => {
                    const sc = statutStyle[c.statut]
                    return (
                      <div key={c.id} style={{ ...card }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontWeight: 800, color: T.ink, marginBottom: 2, fontSize: '0.95rem' }}>{c.commercant?.nom}</p>
                            <p style={{ fontSize: '0.75rem', color: T.muted }}>{new Date(c.created_at).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}{c.creneau ? ` · 🕐 ${c.creneau.heure_debut.slice(0,5)}–${c.creneau.heure_fin.slice(0,5)}` : ''}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontWeight: 800, color: T.main, marginBottom: 4, fontSize: '0.95rem' }}>{Number(c.total).toFixed(2)}€</p>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.color }}>{sc.label}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
              {commandesASwiper.length === 0 && commandesEnCours.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <p style={{ fontSize: '2.5rem', marginBottom: 10 }}>🛍️</p>
                  <p style={{ fontWeight: 700, color: T.muted, marginBottom: 6 }}>Aucune commande en cours</p>
                  <p style={{ fontSize: '0.875rem', color: '#9CA3AF', marginBottom: '1.25rem' }}>Tes commandes actives apparaîtront ici.</p>
                  <button onClick={() => setOnglet('accueil')} style={{ ...btnPrimary, width: 'auto', padding: '0.75rem 1.5rem' }}>Commander maintenant</button>
                </div>
              )}
              {commandesTerminees.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '0.72rem', color: T.muted, marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historique</h3>
                  {commandesTerminees.slice(0, 5).map(c => (
                    <div key={c.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', opacity: 0.7 }}>
                      <div>
                        <p style={{ fontWeight: 700, color: T.ink, marginBottom: 2, fontSize: '0.9rem' }}>{c.commercant?.nom}</p>
                        <p style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{new Date(c.created_at).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 700, color: T.main, marginBottom: 2, fontSize: '0.9rem' }}>{Number(c.total).toFixed(2)}€</p>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: '#F0FDF4', color: '#16A34A' }}>✓ Récupérée</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FAVORIS */}
          {onglet === 'favoris' && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              <h2 style={{ fontWeight: 800, fontSize: '1.15rem', color: T.ink, marginBottom: '0.875rem' }}>Mes favoris ❤️</h2>
              {commercantsFavoris.length === 0
                ? <div style={{ textAlign: 'center', padding: '3rem 0' }}><p style={{ fontSize: '2.5rem', marginBottom: 10 }}>🤍</p><p style={{ fontWeight: 700, color: T.muted, marginBottom: 6 }}>Aucun favori</p><p style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>Tape ❤️ sur un commerce pour le retrouver ici.</p></div>
                : commercantsFavoris.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} statutsCommerce={statutsCommerce} onSelect={selectionnerCommercant} onToggleFavori={toggleFavori}/>)
              }
            </div>
          )}

          {/* TRIBU */}
          {onglet === 'tribu' && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 20, padding: '1.5rem', marginBottom: '1rem', color: '#fff', textAlign: 'center' }}>
                <svg viewBox="0 0 64 36" width="64" height="36" fill="none" style={{ marginBottom: 10 }}>
                  <circle cx="10" cy="18" r="10" fill="#fff" style={{ animation: 'tribu-pulse 2s ease-in-out infinite' }}/>
                  <circle cx="32" cy="12" r="10" fill={T.light} style={{ animation: 'tribu-pulse2 2s ease-in-out infinite 0.3s' }}/>
                  <circle cx="54" cy="18" r="10" fill={T.mid} style={{ animation: 'tribu-pulse3 2s ease-in-out infinite 0.6s' }}/>
                </svg>
                <p style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-0.5px', marginBottom: 6 }}>La Tribu Yoppaa</p>
                <p style={{ fontSize: '0.85rem', color: T.light, lineHeight: 1.6 }}>
                  Tu as fait la file chez un commerçant et tu penses<br/>qu'il mériterait Yoppaa ? Dis-le nous !
                </p>
              </div>
              <SuggestionForm clientId={clientId}/>
            </div>
          )}

          {/* PROFIL */}
          {onglet === 'profil' && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, borderRadius: 20, padding: '1.5rem', marginBottom: '1rem', border: `1px solid ${T.main}44` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0, boxShadow: `0 4px 16px ${T.main}44` }}>👤</div>
                  <div>
                    {client.nom
                      ? <><p style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff', marginBottom: 2 }}>{client.nom}</p><p style={{ fontSize: '0.8rem', color: T.light }}>{client.email}</p></>
                      : <><p style={{ fontWeight: 800, color: '#fff', marginBottom: 4 }}>Les Yoppers</p><p style={{ fontWeight: 600, color: T.light, fontSize: '0.82rem' }}>Passe une commande pour créer ton profil</p></>
                    }
                  </div>
                </div>
              </div>

              <div style={{ ...card, textAlign: 'center', padding: '1.5rem', background: `linear-gradient(135deg, ${T.pale}, #fff)` }}>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>⏱ Temps économisé en file</p>
                <p style={{ fontSize: '3.5rem', fontWeight: 900, color: T.main, letterSpacing: '-2px', marginBottom: 6, lineHeight: 1 }}>
                  {tempsEconomise >= 60 ? `${Math.floor(tempsEconomise/60)}h${tempsEconomise%60>0?tempsEconomise%60+'min':''}` : `${tempsEconomise} min`}
                </p>
                <p style={{ fontSize: '0.875rem', color: T.muted }}>
                  {clientCommandes.filter(c=>c.statut==='recupere').length} commande{clientCommandes.filter(c=>c.statut==='recupere').length>1?'s':''} sans faire la file 🎉
                </p>
              </div>

              <div className="grid2" style={{ marginBottom: '0.875rem' }}>
                {[
                  { label: 'Commandes', value: clientCommandes.length, color: T.main },
                  { label: 'Total dépensé', value: `${clientCommandes.reduce((acc,c)=>acc+Number(c.total),0).toFixed(0)}€`, color: T.mid },
                ].map((s,i) => (
                  <div key={i} style={{ ...card, textAlign: 'center', padding: '0.875rem', marginBottom: 0 }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>{s.label}</p>
                    <p style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color, letterSpacing: '-1px' }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {client.email && (
                <button onClick={() => {
                  localStorage.removeItem('yoppaa_email'); localStorage.removeItem('yoppaa_nom'); localStorage.removeItem('yoppaa_client_id'); localStorage.removeItem('yoppaa_onglet')
                  setClient({ nom:'', email:'', telephone:'' }); setClientId(null)
                  setFavoris([]); setCommercantsFavoris([]); setClientCommandes([])
                  setOngletState('accueil')
                }} style={{ width: '100%', marginTop: '0.5rem', padding: '0.875rem', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                  Se déconnecter
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── NAV BAR ── */}
        <nav className="navbar">
          {[
            { key: 'accueil',   label: 'Accueil',   icon: '🏠' },
            { key: 'commandes', label: 'Commandes', icon: '📦', badge: badgeCommandes },
            { key: 'favoris',   label: 'Favoris',   icon: '❤️', badge: favoris.length },
            { key: 'tribu',     label: 'Tribu',     icon: 'tribu' },
            { key: 'profil',    label: 'Profil',    icon: '👤' },
          ].map(item => (
            <button key={item.key} onClick={() => setOnglet(item.key)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0.75rem 0 0.625rem', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: '0.65rem', color: onglet===item.key ? T.light : '#6B7280', position: 'relative', transition: 'color 0.15s' }}>
              {item.icon === 'tribu'
                ? <svg viewBox="0 0 32 22" width="28" height="20" fill="none">
                    <circle cx="6" cy="11" r="5.5" fill={onglet==='tribu'?'#fff':T.main} opacity={onglet==='tribu'?1:0.5} style={onglet==='tribu'?{filter:'drop-shadow(0 0 4px rgba(255,255,255,0.8))'}:{}}/>
                    <circle cx="16" cy="7" r="5.5" fill={onglet==='tribu'?T.light:T.mid} opacity={onglet==='tribu'?1:0.6} style={onglet==='tribu'?{filter:'drop-shadow(0 0 4px rgba(196,160,244,0.8))'}:{}}/>
                    <circle cx="26" cy="11" r="5.5" fill={onglet==='tribu'?T.mid:'#9CA3AF'} opacity={onglet==='tribu'?1:0.4} style={onglet==='tribu'?{filter:'drop-shadow(0 0 4px rgba(150,96,224,0.8))'}:{}}/>
                  </svg>
                : <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{item.icon}</span>
              }
              {item.label}
              {item.badge > 0 && (
                <span style={{ position: 'absolute', top: 8, left: 'calc(50% + 8px)', background: item.key==='commandes'?'#16A34A':T.main, color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100, minWidth: 16, textAlign: 'center' }}>{item.badge}</span>
              )}
              {onglet===item.key && <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 24, height: 3, borderRadius: 3, background: T.light }}/>}
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}