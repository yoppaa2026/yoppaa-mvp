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
        return <span key={i} style={{ background: badge.bg, color: badge.color, fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>{t}</span>
      })}
    </div>
  )
}

// ─── Helpers horaires ────────────────────────────────────────────────────────
const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOURS_COURTS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
const JOURS_LONGS  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']

function jourActuel() {
  const idx = new Date().getDay() // 0=dim
  return idx === 0 ? 'dimanche' : JOURS[idx - 1]
}

// Résumé court pour la carte : "Lun–Ven 7h–14h · Sam 7h–13h · Dim Fermé"
function resumeHoraires(h) {
  if (!h) return null
  const groupes = []
  let i = 0
  while (i < JOURS.length) {
    const jour = JOURS[i]
    const info = h[jour]
    if (!info) { i++; continue }
    // Grouper les jours consécutifs avec mêmes horaires
    let j = i + 1
    while (j < JOURS.length) {
      const next = h[JOURS[j]]
      if (!next || next.ouvert !== info.ouvert || next.debut !== info.debut || next.fin !== info.fin) break
      j++
    }
    const label = j - i > 1 ? `${JOURS_COURTS[i]}–${JOURS_COURTS[j-1]}` : JOURS_COURTS[i]
    const horaire = info.ouvert ? `${info.debut.slice(0,5)}–${info.fin.slice(0,5)}` : 'Fermé'
    groupes.push(`${label} ${horaire}`)
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

function Etoiles({ note, taille = 14 }) {
  const n = note ? Math.round(note) : 0
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: taille, color: i<=n ? '#F59E0B' : '#D1D5DB' }}>★</span>)}</span>
}

// ─── Heure courante en minutes ────────────────────────────────────────────────
function heureEnMinutes(heure) {
  const [h, m] = heure.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function maintenant() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

// ─── Swipe retrait ────────────────────────────────────────────────────────────
function SwipeRetrait({ onConfirm }) {
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const startRef = useRef(0)
  const containerRef = useRef(null)
  const THUMB = 52

  function getMaxX() { return (containerRef.current?.offsetWidth || 300) - THUMB - 8 }
  function getX(e) { return e.touches ? e.touches[0].clientX : e.clientX }

  const onStart = e => { if (confirmed) return; setSwiping(true); startRef.current = getX(e) - swipeX }
  const onMove = e => {
    if (!swiping || confirmed) return
    const x = Math.max(0, Math.min(getMaxX(), getX(e) - startRef.current))
    setSwipeX(x)
    if (x >= getMaxX()) { setConfirmed(true); setSwiping(false); onConfirm() }
  }
  const onEnd = () => { if (confirmed) return; setSwiping(false); if (swipeX < getMaxX()) setSwipeX(0) }
  const p = swipeX / (getMaxX() || 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <p style={{ fontSize: '0.875rem', color: T.muted, fontWeight: 600, margin: 0, textAlign: 'center' }}>
        Glisse pour confirmer le retrait
      </p>
      <div ref={containerRef}
        style={{ width: '100%', maxWidth: 340, height: THUMB+8, borderRadius: 100, background: confirmed ? '#D4EDDA' : `linear-gradient(to right, ${T.pale} ${p*100}%, #F3F4F6 ${p*100}%)`, position: 'relative', overflow: 'hidden', border: `2px solid ${confirmed ? '#16A34A' : T.light}`, transition: confirmed ? 'all 0.3s' : 'none', userSelect: 'none', cursor: confirmed ? 'default' : 'grab', touchAction: 'none' }}
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
function CarteCommerce({ c, favoris, notesParCommerce, statutsCommerce, onSelect, onToggleFavori }) {
  const estFavori = favoris.includes(c.id)
  const noteInfo = notesParCommerce[c.id]
  const statut = statutsCommerce[c.id]

  const statutConfig = {
    ouvert:  { dot: '#16A34A', label: 'Créneaux disponibles',     labelColor: '#16A34A' },
    urgent:  { dot: '#EA580C', label: 'Réserve vite !',           labelColor: '#EA580C' },
    complet: { dot: '#DC2626', label: "Complet pour aujourd'hui", labelColor: '#DC2626' },
    ferme:   { dot: '#9CA3AF', label: "Fermé aujourd'hui",        labelColor: '#9CA3AF' },
  }
  const sc = statutConfig[statut] || null

  return (
    <div onClick={() => onSelect(c)}
      style={{ background: T.bgCard, border: `1.5px solid ${T.pale}`, borderLeft: `4px solid ${sc ? sc.dot : T.main}`, borderRadius: 14, padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer', boxShadow: '0 1px 6px rgba(107,53,196,0.06)', transition: 'all 0.15s' }}
      onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(107,53,196,0.14)'}
      onMouseOut={e => e.currentTarget.style.boxShadow = '0 1px 6px rgba(107,53,196,0.06)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <p style={{ fontWeight: 800, color: T.ink, margin: 0, fontSize: '1rem', letterSpacing: '-0.3px' }}>{c.nom}</p>
            {sc && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.dot, flexShrink: 0, boxShadow: `0 0 6px ${sc.dot}88` }}/>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: sc.labelColor, whiteSpace: 'nowrap' }}>{sc.label}</span>
              </span>
            )}
          </div>
          <Badges type={c.type}/>
          {c.description && <p style={{ fontSize: '0.82rem', color: '#6b5c8a', margin: '6px 0 0', lineHeight: 1.45 }}>{c.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
            <Etoiles note={noteInfo?.moyenne || 0} taille={13}/>
            <span style={{ fontSize: '0.72rem', color: noteInfo?.count > 0 ? '#9CA3AF' : '#D1D5DB' }}>
              {noteInfo?.count > 0 ? `(${noteInfo.count} avis)` : "Pas encore d'avis"}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px', marginTop: 5 }}>
            {c.distance != null && <span style={{ fontSize: '0.75rem', color: T.main, fontWeight: 700 }}>📍 {formatDistance(c.distance)}</span>}
            {(c.horaires_detail || c.horaires) && (
              <span style={{ fontSize: '0.72rem', color: T.deep, fontWeight: 600 }}>
                🕐 {c.horaires_detail ? (resumeHoraires(c.horaires_detail) || c.horaires) : c.horaires}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: T.pale, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {c.logo_url ? <img src={c.logo_url} alt={c.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <span style={{ fontSize: '1.4rem' }}>🏪</span>}
          </div>
          <button onClick={e => onToggleFavori(c.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, padding: 0 }}>
            {estFavori ? '❤️' : '🤍'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Suggestion commerce ─────────────────────────────────────────────────────
function SuggestionForm({ clientId }) {
  const [form, setForm] = useState({ nom: '', adresse: '', type: '', commentaire: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const inputSt = { width: '100%', padding: '0.875rem 1rem', border: `1.5px solid ${T.pale}`, borderRadius: 12, marginBottom: 10, fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none', color: T.ink, background: '#fff', display: 'block' }

  async function envoyer() {
    if (!form.nom.trim()) return
    setSending(true)
    await supabase.from('suggestions_commercants').insert({
      client_id: clientId || null,
      nom_commerce: form.nom.trim(),
      adresse: form.adresse.trim() || null,
      type_commerce: form.type.trim() || null,
      commentaire: form.commentaire.trim() || null,
    })
    setSent(true)
    setSending(false)
  }

  if (sent) return (
    <div style={{ background: '#F0FDF4', borderRadius: 16, padding: '1.5rem', textAlign: 'center', border: '1.5px solid #16A34A33' }}>
      <p style={{ fontSize: '2rem', marginBottom: 10 }}>🎉</p>
      <p style={{ fontWeight: 800, color: '#16A34A', marginBottom: 6, fontSize: '1rem' }}>Merci pour ta suggestion !</p>
      <p style={{ fontSize: '0.875rem', color: T.muted }}>On va contacter ce commerce. Tu contribues à faire grandir la Tribu Yoppaa 🫂</p>
      <button onClick={() => { setSent(false); setForm({ nom: '', adresse: '', type: '', commentaire: '' }) }}
        style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: T.main, color: '#fff', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
        Suggérer un autre commerce
      </button>
    </div>
  )

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 1px 6px rgba(107,53,196,0.05)' }}>
      <p style={{ fontWeight: 800, color: T.deep, marginBottom: '1rem', fontSize: '1rem' }}>Quel commerce mérite Yoppaa ?</p>

      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Nom du commerce *</label>
      <input placeholder="Ex: Boulangerie Martin" value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} style={inputSt}/>

      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Adresse</label>
      <input placeholder="Ex: Rue de la Paix 12, Bruxelles" value={form.adresse} onChange={e => setForm(p => ({ ...p, adresse: e.target.value }))} style={inputSt}/>

      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Type de commerce</label>
      <input placeholder="Ex: Boulangerie, Coffee shop, Friterie..." value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inputSt}/>

      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Pourquoi ce commerce ? (optionnel)</label>
      <textarea placeholder="Ex: Toujours plein le midi, la file est interminable mais les sandwichs valent le coup !" value={form.commentaire}
        onChange={e => setForm(p => ({ ...p, commentaire: e.target.value }))}
        style={{ ...inputSt, resize: 'vertical', minHeight: 80, marginBottom: 16 }}/>

      <button onClick={envoyer} disabled={!form.nom.trim() || sending}
        style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: form.nom.trim() ? 'pointer' : 'default', fontSize: '1rem', background: form.nom.trim() ? T.main : '#E5E7EB', color: '#fff', boxShadow: form.nom.trim() ? `0 4px 20px ${T.main}44` : 'none', fontFamily: '"DM Sans", sans-serif' }}>
        {sending ? 'Envoi...' : '🫂 Suggérer ce commerce'}
      </button>

      <p style={{ fontSize: '0.75rem', color: '#9CA3AF', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
        On contacte le commerce de ta part et on t'informe s'il rejoint la Tribu Yoppaa.
      </p>
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
  const [statutsCommerce, setStatutsCommerce] = useState({})
  const [panier, setPanier] = useState({})
  const [creneauChoisi, setCreneauChoisi] = useState(null)
  const [loading, setLoading] = useState(false)
  const [derniereCommande, setDerniereCommande] = useState(null)
  const [client, setClient] = useState({ nom: '', email: '', telephone: '' })
  const [clientId, setClientId] = useState(null)
  const [clientCommandes, setClientCommandes] = useState([])
  const [position, setPosition] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [rue, setRue] = useState(null)
  const [categorieActive, setCategorieActive] = useState('Tous')
  const [favoris, setFavoris] = useState([])
  const [commercantsFavoris, setCommercantsFavoris] = useState([])
  // Avis — déclenché depuis l'onglet Commandes
  const [avisEnAttente, setAvisEnAttente] = useState(null) // { commandeId, clientId, commercantId, nom }
  const [avisForm, setAvisForm] = useState({ note: 0, commentaire: '' })
  const [avisSoumis, setAvisSoumis] = useState(false)
  const avisTimerRef = useRef(null)
  const [messageRetrait, setMessageRetrait] = useState(null)

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
            const r = addr.road || addr.pedestrian || addr.footway || addr.path || addr.street
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
    if (data?.length > 0) chargerNotes(data.map(c => c.id))
  }

  async function chargerNotes(ids) {
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

    // Calculer le statut de chaque commerce
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const statuts = {}
    ids.forEach(id => {
      const crensDuJour = (creneauxData||[]).filter(c => c.commercant_id === id)
      const cmds = (commandesData||[]).filter(c => c.commercant_id === id)
      const countParCren = {}
      cmds.forEach(c => { countParCren[c.creneau_id] = (countParCren[c.creneau_id]||0)+1 })

      // Créneaux encore disponibles (pas passés, pas complets)
      const crensDispos = crensDuJour.filter(c => {
        const debut = parseInt(c.heure_debut.slice(0,2))*60 + parseInt(c.heure_debut.slice(3,5))
        const complet = (countParCren[c.id]||0) >= c.max_commandes
        return debut > nowMin && !complet
      })

      // Places restantes sur tous les créneaux dispos
      const placesTotales = crensDispos.reduce((acc, c) => acc + (c.max_commandes - (countParCren[c.id]||0)), 0)

      if (crensDuJour.length === 0) {
        statuts[id] = 'ferme'
      } else if (crensDispos.length === 0) {
        statuts[id] = 'complet'
      } else if (placesTotales <= 2) {
        statuts[id] = 'urgent'
      } else {
        statuts[id] = 'ouvert'
      }
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
    const { data } = await supabase
      .from('commandes')
      .select('*, commercant:commercants(nom, type), creneau:creneaux(heure_debut, heure_fin)')
      .eq('client_email', email)
      .order('created_at', { ascending: false })
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
    setClientId(id)
    localStorage.setItem('yoppaa_client_id', id)
    localStorage.setItem('yoppaa_email', email)
    localStorage.setItem('yoppaa_nom', nom)
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
      setFavoris(prev => [...prev, commercantId])
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

  async function selectionnerCommercant(c) {
    setCommercantSelectionne(c)
    const [{ data: arts }, { data: cren }, { data: avis }] = await Promise.all([
      supabase.from('articles').select('*').eq('commercant_id', c.id).eq('actif', true).order('nom'),
      supabase.from('creneaux').select('*').eq('commercant_id', c.id).eq('actif', true).order('heure_debut'),
      supabase.from('avis').select('*, client:clients(nom)').eq('commercant_id', c.id).order('created_at', { ascending: false }).limit(10)
    ])
    // Charger le nombre de commandes par créneau pour aujourd'hui
    const aujourd_hui = new Date().toDateString()
    const { data: commandesDuJour } = await supabase
      .from('commandes')
      .select('creneau_id')
      .eq('commercant_id', c.id)
      .neq('statut', 'recupere')
    const countParCreneau = {}
    ;(commandesDuJour || []).forEach(cmd => {
      countParCreneau[cmd.creneau_id] = (countParCreneau[cmd.creneau_id] || 0) + 1
    })
    const creneauxAvecCount = (cren || []).map(cr => ({ ...cr, count: countParCreneau[cr.id] || 0 }))
    setArticles(arts||[])
    setCreneaux(creneauxAvecCount)
    setAvisCommerce(avis||[])
    setEtape(2)
  }

  function ajouterAuPanier(a) { setPanier(p => ({ ...p, [a.id]: { ...a, quantite: (p[a.id]?.quantite||0)+1 } })) }
  function retirerDuPanier(id) { setPanier(p => { const n={...p}; if(n[id]?.quantite>1) n[id].quantite-=1; else delete n[id]; return n }) }
  function totalPanier() { return Object.values(panier).reduce((acc,i) => acc+i.prix*i.quantite, 0) }

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

  // ─── Confirmer retrait depuis l'onglet Commandes ──────────────────────────
  async function confirmerRetrait(commande) {
    await supabase.from('commandes').update({ statut: 'recupere' }).eq('id', commande.id)
    setClientCommandes(prev => prev.map(c => c.id===commande.id ? { ...c, statut: 'recupere' } : c))
    setMessageRetrait(commande.id)
    setTimeout(() => setMessageRetrait(null), 8000)
    // Déclencher avis après 45min
    const avisData = {
      commandeId: commande.id,
      clientId: commande.client_id || clientId,
      commercantId: commande.commercant_id,
      nom: commande.commercant?.nom || ''
    }
    if (avisTimerRef.current) clearTimeout(avisTimerRef.current)
    avisTimerRef.current = setTimeout(() => {
      setAvisEnAttente(avisData)
    }, 45 * 60 * 1000)
  }

  async function soumettreAvis() {
    if (!avisForm.note || !avisEnAttente) return
    await supabase.from('avis').insert({
      commande_id: avisEnAttente.commandeId,
      client_id: avisEnAttente.clientId,
      commercant_id: avisEnAttente.commercantId,
      note: avisForm.note,
      commentaire: avisForm.commentaire.trim() || null
    })
    setAvisSoumis(true)
    setAvisEnAttente(null)
    setAvisForm({ note: 0, commentaire: '' })
  }

  function noteMoyenne(avis) { return !avis?.length ? 0 : avis.reduce((acc,a) => acc+a.note, 0)/avis.length }

  function resetCommande() {
    setEtape(1); setPanier({}); setCreneauChoisi(null); setCommercantSelectionne(null)
  }

  const tempsEconomise = clientCommandes.filter(c => c.statut==='recupere').reduce((acc,c) => acc+getTemps(c.commercant?.type), 0)
  const commercantsFiltres = categorieActive === 'Tous' ? commercants : commercants.filter(c => parseTypes(c.type).some(t => t===categorieActive || t.includes(categorieActive)))
  const estDansCommerce = etape > 1

  // Commandes à swiper = statut pret
  const commandesASwiper = clientCommandes.filter(c => c.statut === 'pret')
  const commandesEnCours = clientCommandes.filter(c => ['en_attente','en_preparation'].includes(c.statut))
  const commandesTerminees = clientCommandes.filter(c => c.statut === 'recupere')
  const badgeCommandes = commandesASwiper.length + commandesEnCours.length

  const card = { background: T.bgCard, borderRadius: 14, padding: '1rem', marginBottom: '0.75rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 1px 6px rgba(107,53,196,0.05)' }
  const btnPrimary = { width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: T.main, color: '#fff', boxShadow: `0 4px 20px ${T.main}44`, fontFamily: '"DM Sans", sans-serif' }
  const inputSt = { width: '100%', padding: '0.875rem 1rem', border: `1.5px solid ${T.pale}`, borderRadius: 12, marginBottom: 10, fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none', color: T.ink, background: '#fff', display: 'block' }

  const statutStyle = {
    recupere:       { bg: '#F0FDF4', color: '#16A34A', label: '✓ Récupérée' },
    pret:           { bg: '#EDE0FF', color: T.main,    label: '📦 Prête' },
    en_preparation: { bg: '#EFF6FF', color: '#2563EB', label: '🟠 En prépa' },
    en_attente:     { bg: '#FFF7ED', color: '#EA580C', label: '🔴 En attente' },
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; width: 100%; overflow-x: hidden; position: relative; }
        body { background: ${T.bg}; font-family: "DM Sans", sans-serif; font-size: 16px; -webkit-text-size-adjust: 100%; }
        .page-wrap { display: flex; flex-direction: column; min-height: 100dvh; max-width: 640px; margin: 0 auto; background: ${T.bg}; overflow-x: hidden; width: 100%; }
        .topbar { flex-shrink: 0; background: ${T.bgPanel}; border-bottom: 1px solid ${T.main}33; }
        .scroll-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .navbar { flex-shrink: 0; background: ${T.bgPanel}; border-top: 1px solid ${T.main}33; display: flex; padding-bottom: env(safe-area-inset-bottom, 0px); }
        .cats { display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden; padding: 0 1rem 0.875rem; scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch; contain: layout style; }
        .cats::-webkit-scrollbar { display: none; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        @media (min-width: 480px) { .grid3 { grid-template-columns: 1fr 1fr 1fr; } }
        input, textarea, button, select { font-family: "DM Sans", sans-serif; }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="page-wrap">

        {/* ── TOPBAR ── */}
        <div className="topbar">
          {!estDansCommerce ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1rem 0.75rem' }}>
                <div>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
                    {[0.4,1,1].map((op,i) => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i===0?'#fff':i===1?T.light:T.mid, opacity: op }}/>)}
                  </div>
                  <p style={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-2px', color: '#fff', lineHeight: 1 }}>yoppaa</p>
                  <p style={{ color: T.light, fontSize: '0.75rem', marginTop: 2 }}>Skip the wait</p>
                </div>
                <button onClick={demanderGeolocalisation}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${T.main}55`, border: `1px solid ${T.main}88`, borderRadius: 12, padding: '0.5rem 0.875rem', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>
                  <span>{geoLoading ? '⏳' : '📍'}</span>
                  <span>{geoLoading ? 'Localisation...' : rue || (position ? 'Position active' : 'Activer')}</span>
                </button>
              </div>
              {onglet === 'accueil' && (
                <div className="cats">
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setCategorieActive(cat)}
                      style={{ flexShrink: 0, padding: '0.4rem 0.875rem', borderRadius: 100, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap', background: categorieActive===cat ? '#fff' : `${T.main}44`, color: categorieActive===cat ? T.main : '#fff' }}>
                      {cat}
                    </button>
                  ))}
                </div>
              )}
              {onglet !== 'accueil' && <div style={{ height: 8 }}/>}
            </>
          ) : (
            <div style={{ padding: '0.875rem 1rem' }}>
              <button onClick={resetCommande} style={{ background: `${T.main}55`, border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 10, padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.875rem' }}>
                ← Retour
              </button>
            </div>
          )}
        </div>

        {/* ── CONTENU ── */}
        <div className="scroll-body">

          {/* ACCUEIL */}
          {onglet === 'accueil' && !estDansCommerce && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              {position && <p style={{ fontSize: '0.8rem', color: T.mid, fontWeight: 600, marginBottom: '0.75rem' }}>📍 {commercantsFiltres.length} commerce{commercantsFiltres.length>1?'s':''} près de toi</p>}
              {commercantsFiltres.length === 0
                ? <div style={{ textAlign: 'center', padding: '3rem 0' }}><p style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</p><p style={{ color: T.muted }}>Aucun commerce dans cette catégorie</p></div>
                : commercantsFiltres.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} statutsCommerce={statutsCommerce} onSelect={selectionnerCommercant} onToggleFavori={toggleFavori}/>)
              }
            </div>
          )}

          {/* ÉTAPE 2 — Articles */}
          {etape === 2 && (
            <div style={{ padding: '1rem' }}>
              <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
                <div style={{ width: 60, height: 60, borderRadius: 12, background: T.pale, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {commercantSelectionne?.logo_url ? <img src={commercantSelectionne.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <span style={{ fontSize: '1.5rem' }}>🏪</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: T.deep, marginBottom: 4 }}>{commercantSelectionne?.nom}</h2>
                  {commercantSelectionne?.adresse && <p style={{ fontSize: '0.78rem', color: '#b0a0c8', marginBottom: 5 }}>📍 {commercantSelectionne.adresse}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Etoiles note={noteMoyenne(avisCommerce)} taille={13}/>
                    {avisCommerce.length > 0 ? <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>({avisCommerce.length} avis)</span> : <span style={{ fontSize: '0.72rem', color: '#D1D5DB' }}>Pas encore d'avis</span>}
                  </div>
                </div>
              </div>

              {/* Horaires détaillés 7 jours */}
              {commercantSelectionne?.horaires_detail && (
                <div style={{ background: T.bgCard, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.75rem', border: `1.5px solid ${T.pale}` }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>🕐 Horaires</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {JOURS.map((jour, idx) => {
                      const h = commercantSelectionne.horaires_detail[jour]
                      const estAujourdhui = jourActuel() === jour
                      if (!h) return null
                      return (
                        <div key={jour} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 8, background: estAujourdhui ? T.pale : 'transparent' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: estAujourdhui ? 800 : 500, color: estAujourdhui ? T.deep : T.muted, width: 90 }}>
                            {estAujourdhui ? '▸ ' : ''}{JOURS_LONGS[idx]}
                          </span>
                          {h.ouvert
                            ? <span style={{ fontSize: '0.82rem', fontWeight: estAujourdhui ? 700 : 500, color: estAujourdhui ? T.main : T.ink }}>{h.debut.slice(0,5)} – {h.fin.slice(0,5)}</span>
                            : <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#DC2626' }}>Fermé</span>
                          }
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {articles.map(article => (
                <div key={article.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, color: T.deep, marginBottom: 2, fontSize: '0.95rem' }}>{article.nom}</p>
                    {article.description && <p style={{ fontSize: '0.78rem', color: T.muted, marginBottom: 4, lineHeight: 1.4 }}>{article.description}</p>}
                    <p style={{ fontSize: '0.95rem', color: T.main, fontWeight: 800 }}>{Number(article.prix).toFixed(2)}€</p>
                    {article.stock_jour === 0 && <span style={{ fontSize: '0.7rem', background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>Épuisé</span>}
                  </div>
                  {article.stock_jour !== 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 12, flexShrink: 0 }}>
                      {panier[article.id] && (
                        <>
                          <button onClick={() => retirerDuPanier(article.id)} style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${T.main}`, background: '#fff', color: T.main, fontWeight: 800, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                          <span style={{ fontWeight: 800, minWidth: 24, textAlign: 'center', fontSize: '1.05rem', color: T.ink }}>{panier[article.id].quantite}</span>
                        </>
                      )}
                      <button onClick={() => ajouterAuPanier(article)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: T.main, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    </div>
                  )}
                </div>
              ))}

              {avisCommerce.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.deep, marginBottom: '0.625rem' }}>Avis clients</h3>
                  {avisCommerce.map(a => (
                    <div key={a.id} style={{ ...card, marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Etoiles note={a.note} taille={14}/>
                        <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{a.client?.nom || 'Client'}</span>
                      </div>
                      {a.commentaire && <p style={{ fontSize: '0.85rem', color: T.ink, marginTop: 4, lineHeight: 1.5 }}>{a.commentaire}</p>}
                      {a.reponse_commercant && (
                        <div style={{ background: T.pale, borderRadius: 10, padding: '0.5rem 0.75rem', marginTop: 8 }}>
                          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: T.main, marginBottom: 2 }}>Réponse :</p>
                          <p style={{ fontSize: '0.82rem', color: T.ink }}>{a.reponse_commercant}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {Object.keys(panier).length > 0 && (
                <div style={{ position: 'sticky', bottom: 16, marginTop: 16 }}>
                  <button onClick={() => setEtape(3)} style={btnPrimary}>
                    Choisir mon créneau — {totalPanier().toFixed(2)}€
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ÉTAPE 3 — Créneau */}
          {etape === 3 && (
            <div style={{ padding: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: T.mid, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  {new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })} · {commercantSelectionne?.nom}
                </p>
                <h2 style={{ fontWeight: 800, fontSize: '1.15rem', color: T.ink }}>Choisis ton créneau</h2>
              </div>
              <div className="grid3" style={{ marginBottom: '1.25rem' }}>
                {creneaux.map(c => {
                  const passe = heureEnMinutes(c.heure_debut) <= maintenant()
                  const complet = c.count >= c.max_commandes
                  const placesRestantes = c.max_commandes - c.count
                  const bientotComplet = !complet && placesRestantes <= 1
                  const presqueComplet = !complet && placesRestantes === 2
                  const desactive = passe || complet

                  let mention = null
                  if (passe) mention = { text: 'Reviens demain !', color: '#9CA3AF' }
                  else if (complet) mention = { text: 'Complet', color: '#DC2626' }
                  else if (bientotComplet) mention = { text: '🔥 Dernière place !', color: '#EA580C' }
                  else if (presqueComplet) mention = { text: '⚡ Presque complet', color: '#D97706' }

                  return (
                    <div key={c.id}
                      onClick={() => !desactive && setCreneauChoisi(c.id)}
                      style={{ padding: '0.75rem 0.5rem', borderRadius: 12, border: `2px solid ${desactive ? '#E5E7EB' : creneauChoisi===c.id ? T.main : T.pale}`, background: desactive ? '#F9FAFB' : creneauChoisi===c.id ? T.pale : '#fff', cursor: desactive ? 'default' : 'pointer', textAlign: 'center', fontWeight: 700, color: desactive ? '#D1D5DB' : T.ink, fontSize: '0.875rem', transition: 'all 0.15s', position: 'relative' }}>
                      <div style={{ textDecoration: complet ? 'line-through' : 'none', opacity: passe ? 0.5 : 1 }}>
                        {c.heure_debut.slice(0,5)} – {c.heure_fin.slice(0,5)}
                      </div>
                      {mention && (
                        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: passe ? T.deep : mention.color, marginTop: 3, lineHeight: 1.2 }}>
                          {mention.text}
                        </div>
                      )}
                    </div>
                  )
                })}
                {creneaux.length > 0 && creneaux.every(c => heureEnMinutes(c.heure_debut) <= maintenant()) && (() => {
                  // Premier créneau disponible = le plus tôt dans la liste
                  const premierCreneau = creneaux.reduce((min, c) => heureEnMinutes(c.heure_debut) < heureEnMinutes(min.heure_debut) ? c : min, creneaux[0])
                  const demain = new Date(); demain.setDate(demain.getDate() + 1)
                  const jourDemain = demain.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
                  const heureOuverture = commercantSelectionne?.heure_ouverture_resa
                    ? commercantSelectionne.heure_ouverture_resa.slice(0,5)
                    : '21:00'
                  // Est-ce qu'on est déjà après l'heure d'ouverture des résa ?
                  const resaOuverteMaintenat = maintenant() >= heureEnMinutes(heureOuverture)
                  return (
                    <div style={{ gridColumn: '1 / -1', background: T.pale, borderRadius: 12, padding: '1.25rem', textAlign: 'center', border: `1.5px solid ${T.main}33` }}>
                      <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🕐</p>
                      <p style={{ fontWeight: 800, marginBottom: 6, color: T.deep, fontSize: '1rem' }}>Plus de créneaux disponibles aujourd'hui</p>
                      {resaOuverteMaintenat ? (
                        <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6 }}>
                          Les réservations pour demain sont ouvertes ! 🎉<br/>
                          Premier créneau chez <strong>{commercantSelectionne?.nom}</strong> à <strong>{premierCreneau.heure_debut.slice(0,5)}</strong> le <strong>{jourDemain}</strong>.
                        </p>
                      ) : (
                        <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6 }}>
                          Pour ta prochaine commande chez <strong>{commercantSelectionne?.nom}</strong>,<br/>
                          reviens à partir de <strong>{heureOuverture}</strong> ce soir pour réserver<br/>
                          le <strong>{jourDemain}</strong> dès <strong>{premierCreneau.heure_debut.slice(0,5)}</strong> !
                        </p>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Message "réserver pour demain" — visible si des créneaux dispo aujourd'hui */}
              {creneaux.some(c => heureEnMinutes(c.heure_debut) > maintenant()) && (() => {
                const heureOuverture = commercantSelectionne?.heure_ouverture_resa
                  ? commercantSelectionne.heure_ouverture_resa.slice(0,5)
                  : '21:00'
                const resaOuverte = maintenant() >= heureEnMinutes(heureOuverture)
                const demain = new Date(); demain.setDate(demain.getDate() + 1)
                const jourDemain = demain.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
                const premierCreneau = creneaux.reduce((min, c) => heureEnMinutes(c.heure_debut) < heureEnMinutes(min.heure_debut) ? c : min, creneaux[0])
                return (
                  <div style={{ background: T.pale, borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.25rem', border: `1px solid ${T.main}22` }}>
                    {resaOuverte ? (
                      <p style={{ fontSize: '0.78rem', color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>
                        🎉 Les réservations pour demain sont déjà ouvertes ! Premier créneau à <strong>{premierCreneau.heure_debut.slice(0,5)}</strong> le <strong>{jourDemain}</strong>.
                      </p>
                    ) : (
                      <p style={{ fontSize: '0.78rem', color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>
                        💡 Pour ta commande de demain chez <strong>{commercantSelectionne?.nom}</strong>, reviens à partir de <strong>{heureOuverture}</strong> ce soir !
                      </p>
                    )}
                  </div>
                )
              })()}

              <h2 style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '1rem', color: T.ink }}>Tes coordonnées</h2>
              <input placeholder="Ton prénom et nom" type="text" value={client.nom} onChange={e => setClient(p => ({ ...p, nom: e.target.value }))} style={inputSt}/>
              <input placeholder="Email" type="email" value={client.email} onChange={e => setClient(p => ({ ...p, email: e.target.value }))} style={inputSt}/>
              <input placeholder="Téléphone (optionnel)" type="tel" value={client.telephone} onChange={e => setClient(p => ({ ...p, telephone: e.target.value }))} style={inputSt}/>

              <button onClick={passerCommande} disabled={loading || !creneauChoisi || !client.nom || !client.email}
                style={{ ...btnPrimary, opacity: (!creneauChoisi || !client.nom || !client.email) ? 0.5 : 1, marginTop: 4 }}>
                {loading ? 'En cours...' : `Confirmer — ${totalPanier().toFixed(2)}€`}
              </button>
              <p style={{ fontSize: '0.8rem', color: '#9a8ab0', textAlign: 'center', marginTop: 8 }}>Le paiement sera activé prochainement</p>
            </div>
          )}

          {/* ÉTAPE 4 — Confirmation (sans swipe) */}
          {etape === 4 && (
            <div style={{ padding: '1.5rem 1rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
                <p style={{ fontWeight: 900, fontSize: '1rem', color: T.main, letterSpacing: '-0.5px', marginBottom: 4 }}>yoppaa</p>
                <h2 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.ink, marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Ta commande est passée !</h2>
                <p style={{ color: T.deep, fontWeight: 700, marginBottom: '0.25rem', fontSize: '1rem' }}>Chez {commercantSelectionne?.nom}</p>
                <p style={{ color: T.muted, fontSize: '0.875rem' }}>On s'occupe du reste — présente-toi à ton créneau !</p>
              </div>

              {/* Message informatif — onglet Commandes */}
              <div style={{ background: T.pale, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', border: `1.5px solid ${T.main}33` }}>
                <p style={{ fontWeight: 800, color: T.ink, marginBottom: 8, fontSize: '1rem' }}>📦 Pour récupérer ta commande</p>
                <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6 }}>
                  Présente-toi chez <strong>{commercantSelectionne?.nom}</strong> à ton créneau.<br/>
                  Quand ta commande est prête, tu pourras la confirmer depuis l'onglet <strong>Commandes</strong> en bas de l'écran.
                </p>
              </div>

              <div style={{ ...card, textAlign: 'center', padding: '1rem' }}>
                <p style={{ fontSize: '0.8rem', color: T.muted, marginBottom: 12 }}>Retrouve le statut de ta commande ici :</p>
                <button onClick={() => { setOnglet('commandes'); resetCommande() }}
                  style={{ ...btnPrimary, fontSize: '0.9rem' }}>
                  Voir mes commandes →
                </button>
              </div>

              <button onClick={resetCommande} style={{ width: '100%', marginTop: 10, padding: '0.875rem', background: 'transparent', color: T.main, border: `1.5px solid ${T.main}`, borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                Commander autre chose
              </button>
            </div>
          )}

          {/* ── ONGLET COMMANDES ── */}
          {onglet === 'commandes' && !estDansCommerce && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>

              {/* Message post-retrait yoppaa */}
              {messageRetrait && (
                <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', textAlign: 'center', color: '#fff' }}>
                  <p style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-1px', marginBottom: 6 }}>yoppaa ✓</p>
                  <p style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>Retrait confirmé !</p>
                  <p style={{ fontSize: '0.82rem', color: T.light, lineHeight: 1.5 }}>Merci et profitez bien de votre commande 🎉<br/>Un message pour votre avis arrivera dans 45 min.</p>
                </div>
              )}

              {/* Avis en attente (après 45min) */}
              {avisEnAttente && !avisSoumis && (
                <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', color: '#fff' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 12 }}>⭐ Comment était {avisEnAttente.nom} ?</h3>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {[1,2,3,4,5].map(i => (
                      <span key={i} onClick={() => setAvisForm(p => ({ ...p, note: i }))}
                        style={{ fontSize: 30, cursor: 'pointer', color: i<=avisForm.note ? '#FCD34D' : 'rgba(255,255,255,0.3)', transition: 'color 0.1s' }}>★</span>
                    ))}
                  </div>
                  <textarea placeholder="Ton commentaire (optionnel)" value={avisForm.commentaire}
                    onChange={e => setAvisForm(p => ({ ...p, commentaire: e.target.value }))}
                    style={{ width: '100%', padding: '0.75rem', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif', resize: 'vertical', minHeight: 70, boxSizing: 'border-box', outline: 'none', color: '#fff', background: 'rgba(255,255,255,0.1)', marginBottom: 10 }}/>
                  <button onClick={soumettreAvis} disabled={!avisForm.note}
                    style={{ width: '100%', padding: '0.75rem', background: avisForm.note ? '#fff' : 'rgba(255,255,255,0.2)', color: avisForm.note ? T.main : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 100, fontWeight: 800, cursor: avisForm.note ? 'pointer' : 'default', fontSize: '0.9rem' }}>
                    Envoyer mon avis
                  </button>
                </div>
              )}

              {avisSoumis && (
                <div style={{ background: '#D4EDDA', borderRadius: 14, padding: '1rem', textAlign: 'center', marginBottom: '1rem' }}>
                  <p style={{ color: '#155724', fontWeight: 700 }}>✓ Merci pour ton avis !</p>
                </div>
              )}

              {/* À swiper */}
              {commandesASwiper.length > 0 && (
                <>
                  <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: T.ink, marginBottom: '0.75rem' }}>
                    📦 Prêtes à récupérer
                  </h2>
                  {commandesASwiper.map(c => (
                    <div key={c.id} style={{ background: '#F0FDF4', borderRadius: 16, padding: '1.25rem', marginBottom: '0.75rem', border: '2px solid #16A34A44' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <p style={{ fontWeight: 800, color: T.ink, marginBottom: 2, fontSize: '1rem' }}>{c.commercant?.nom}</p>
                          <p style={{ fontSize: '0.78rem', color: '#16A34A', fontWeight: 600 }}>
                            🟢 Prête · {new Date(c.created_at).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}{c.creneau ? ` · ${c.creneau.heure_debut.slice(0,5)}–${c.creneau.heure_fin.slice(0,5)}` : ''}
                          </p>
                        </div>
                        <p style={{ fontWeight: 800, color: T.main, fontSize: '1rem' }}>{Number(c.total).toFixed(2)}€</p>
                      </div>
                      <SwipeRetrait onConfirm={() => confirmerRetrait(c)}/>
                    </div>
                  ))}
                </>
              )}

              {/* En cours */}
              {commandesEnCours.length > 0 && (
                <>
                  <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: T.ink, marginBottom: '0.75rem', marginTop: commandesASwiper.length > 0 ? '1rem' : 0 }}>
                    🕐 En cours
                  </h2>
                  {commandesEnCours.map(c => {
                    const sc = statutStyle[c.statut]
                    return (
                      <div key={c.id} style={{ ...card }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontWeight: 800, color: T.ink, marginBottom: 2, fontSize: '0.95rem' }}>{c.commercant?.nom}</p>
                            <p style={{ fontSize: '0.75rem', color: T.muted }}>
                              {c.creneau ? `🕐 ${c.creneau.heure_debut.slice(0,5)} – ${c.creneau.heure_fin.slice(0,5)}` : ''}
                            </p>
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

              {/* Vide */}
              {commandesASwiper.length === 0 && commandesEnCours.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <p style={{ fontSize: '2.5rem', marginBottom: 10 }}>🛍️</p>
                  <p style={{ fontWeight: 700, color: T.muted, marginBottom: 6 }}>Aucune commande en cours</p>
                  <p style={{ fontSize: '0.875rem', color: '#9CA3AF', marginBottom: '1.25rem' }}>Tes commandes actives apparaîtront ici.</p>
                  <button onClick={() => setOnglet('accueil')} style={{ ...btnPrimary, width: 'auto', padding: '0.75rem 1.5rem' }}>
                    Commander maintenant
                  </button>
                </div>
              )}

              {/* Historique */}
              {commandesTerminees.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '0.95rem', color: T.muted, marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.72rem' }}>Historique</h3>
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
          {onglet === 'favoris' && !estDansCommerce && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              <h2 style={{ fontWeight: 800, fontSize: '1.15rem', color: T.ink, marginBottom: '0.875rem' }}>Mes favoris ❤️</h2>
              {commercantsFavoris.length === 0
                ? <div style={{ textAlign: 'center', padding: '3rem 0' }}><p style={{ fontSize: '2.5rem', marginBottom: 10 }}>🤍</p><p style={{ fontWeight: 700, color: T.muted, marginBottom: 6 }}>Aucun favori pour l'instant</p><p style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>Tape ❤️ sur un commerce pour le retrouver ici.</p></div>
                : commercantsFavoris.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} statutsCommerce={statutsCommerce} onSelect={c => { selectionnerCommercant(c); setOnglet('accueil') }} onToggleFavori={toggleFavori}/>)
              }
            </div>
          )}

          {/* TRIBU YOPPAA */}
          {onglet === 'tribu' && !estDansCommerce && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              {/* Header */}
              <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', color: '#fff', textAlign: 'center' }}>
                <svg viewBox="0 0 56 40" width="56" height="40" fill="none" style={{ marginBottom: 6 }}>
                  <circle cx="12"  cy="20" r="9" fill="rgba(255,255,255,0.5)"/>
                  <circle cx="28"  cy="14" r="9" fill="rgba(255,255,255,0.7)"/>
                  <circle cx="44"  cy="20" r="9" fill="rgba(255,255,255,0.4)"/>
                </svg>
                <p style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-1px', marginBottom: 4 }}>La Tribu Yoppaa</p>
                <p style={{ fontSize: '0.82rem', color: T.light, lineHeight: 1.5 }}>
                  Tu as fait la file chez un commerce et tu penses qu'ils mériteraient Yoppaa ?<br/>
                  Dis-le nous — on les contacte !
                </p>
              </div>

              <SuggestionForm clientId={clientId} />
            </div>
          )}

          {/* PROFIL */}
          {onglet === 'profil' && !estDansCommerce && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              <div style={{ background: T.bgPanel, borderRadius: 16, padding: '1.25rem', marginBottom: '0.875rem', border: `1px solid ${T.main}44` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${T.main}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>👤</div>
                  <div>
                    {client.nom
                      ? <><p style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff', marginBottom: 2 }}>{client.nom}</p><p style={{ fontSize: '0.8rem', color: T.light }}>{client.email}</p></>
                      : <p style={{ fontWeight: 700, color: T.light }}>Passe une commande pour créer ton profil</p>
                    }
                  </div>
                </div>
              </div>

              <div style={{ ...card, textAlign: 'center', padding: '1.25rem' }}>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>⏱ Temps économisé en file</p>
                <p style={{ fontSize: '3rem', fontWeight: 900, color: T.main, letterSpacing: '-2px', marginBottom: 6, lineHeight: 1 }}>
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
                  localStorage.removeItem('yoppaa_email'); localStorage.removeItem('yoppaa_nom'); localStorage.removeItem('yoppaa_client_id')
                  setClient({ nom:'', email:'', telephone:'' }); setClientId(null)
                  setFavoris([]); setCommercantsFavoris([]); setClientCommandes([])
                }} style={{ width: '100%', marginTop: '0.5rem', padding: '0.875rem', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                  Se déconnecter
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── NAV BAR — 4 onglets ── */}
        {!estDansCommerce && (
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
                  ? <svg viewBox="0 0 28 20" width="26" height="18" fill="none">
                      <circle cx="6"  cy="10" r="4.5" fill={onglet==='tribu' ? T.light : '#6B7280'} opacity={onglet==='tribu' ? 1 : 0.7}/>
                      <circle cx="14" cy="7"  r="4.5" fill={onglet==='tribu' ? T.light : '#6B7280'} opacity={onglet==='tribu' ? 1 : 0.5}/>
                      <circle cx="22" cy="10" r="4.5" fill={onglet==='tribu' ? T.light : '#6B7280'} opacity={onglet==='tribu' ? 1 : 0.3}/>
                    </svg>
                  : <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{item.icon}</span>
                }
                {item.label}
                {item.badge > 0 && (
                  <span style={{ position: 'absolute', top: 8, left: 'calc(50% + 8px)', background: item.key==='commandes' ? '#16A34A' : T.main, color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100, minWidth: 16, textAlign: 'center' }}>{item.badge}</span>
                )}
                {onglet===item.key && <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 24, height: 3, borderRadius: 3, background: T.light }}/>}
              </button>
            ))}
          </nav>
        )}
      </div>
    </>
  )
}