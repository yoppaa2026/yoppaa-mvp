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

// ─── Helpers horaires ─────────────────────────────────────────────────────────
const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOURS_COURTS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
const JOURS_LONGS  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']

function jourActuel() {
  const idx = new Date().getDay()
  return idx === 0 ? 'dimanche' : JOURS[idx - 1]
}

function resumeHoraires(h) {
  if (!h) return null
  const groupes = []
  let i = 0
  while (i < JOURS.length) {
    const jour = JOURS[i]
    const info = h[jour]
    if (!info) { i++; continue }
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

function heureEnMinutes(heure) {
  const [h, m] = heure.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function maintenant() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

// ─── FIX 2 : Swipe retrait — boule parfaitement centrée ───────────────────────
function SwipeRetrait({ onConfirm }) {
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const startRef = useRef(0)
  const containerRef = useRef(null)
  const THUMB = 48

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
  const TRACK_H = THUMB + 8

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <p style={{ fontSize: '0.875rem', color: T.muted, fontWeight: 600, margin: 0, textAlign: 'center' }}>
        Glisse pour confirmer le retrait
      </p>
      <div ref={containerRef}
        style={{ width: '100%', maxWidth: 340, height: TRACK_H, borderRadius: 100, background: confirmed ? '#D4EDDA' : `linear-gradient(to right, ${T.pale} ${p*100}%, #F3F4F6 ${p*100}%)`, position: 'relative', border: `2px solid ${confirmed ? '#16A34A' : T.light}`, transition: confirmed ? 'all 0.3s' : 'none', userSelect: 'none', cursor: confirmed ? 'default' : 'grab', touchAction: 'none' }}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        {/* Texte centré */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: THUMB + 12, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: 700, color: confirmed ? '#16A34A' : T.mid, pointerEvents: 'none' }}>
          {confirmed ? '✓ Confirmé !' : 'Glisse →'}
        </div>
        {/* Boule — top:4 pour centrer dans TRACK_H = THUMB+8, height THUMB */}
        <div style={{ position: 'absolute', left: 4 + swipeX, top: 4, width: THUMB, height: THUMB, borderRadius: '50%', background: confirmed ? '#16A34A' : T.main, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.15)', transition: swiping ? 'none' : 'left 0.3s, background 0.3s', userSelect: 'none' }}>
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
    ouvert:  { dot: '#16A34A', label: 'Créneaux disponibles',      labelColor: '#16A34A' },
    urgent:  { dot: '#EA580C', label: 'Réserve vite !',            labelColor: '#EA580C' },
    complet: { dot: '#DC2626', label: "Complet pour aujourd'hui",  labelColor: '#DC2626' },
    ferme:   { dot: '#9CA3AF', label: "Fermé aujourd'hui",         labelColor: '#9CA3AF' },
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

// ─── Suggestion commerce ──────────────────────────────────────────────────────
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
    setSent(true); setSending(false)
  }

  if (sent) return (
    <div style={{ background: '#F0FDF4', borderRadius: 16, padding: '1.5rem', textAlign: 'center', border: '1.5px solid #16A34A33' }}>
      <p style={{ fontSize: '2rem', marginBottom: 10 }}>🎉</p>
      <p style={{ fontWeight: 800, color: '#16A34A', marginBottom: 6, fontSize: '1rem' }}>Merci pour ta suggestion !</p>
      <p style={{ fontSize: '0.875rem', color: T.muted }}>On va contacter ce commerçant. Tu contribues à faire grandir la Tribu Yoppaa 🫂</p>
      <button onClick={() => { setSent(false); setForm({ nom: '', adresse: '', type: '', commentaire: '' }) }}
        style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: T.main, color: '#fff', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
        Suggérer un autre commerçant
      </button>
    </div>
  )

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 1px 6px rgba(107,53,196,0.05)' }}>
      <p style={{ fontWeight: 800, color: T.deep, marginBottom: '1rem', fontSize: '1rem' }}>Quel commerçant mérite Yoppaa ?</p>

      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Nom du commerce *</label>
      <input placeholder="Ex: Boulangerie Martin" value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} style={inputSt}/>

      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Adresse</label>
      <input placeholder="Ex: Rue de la Paix 12, Bruxelles" value={form.adresse} onChange={e => setForm(p => ({ ...p, adresse: e.target.value }))} style={inputSt}/>

      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Type de commerce</label>
      <input placeholder="Ex: Boulangerie, Coffee shop, Friterie..." value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inputSt}/>

      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Pourquoi ce commerçant ? (optionnel)</label>
      <textarea placeholder="Ex: Toujours plein le midi, la file est interminable mais les sandwichs valent le coup !" value={form.commentaire}
        onChange={e => setForm(p => ({ ...p, commentaire: e.target.value }))}
        style={{ ...inputSt, resize: 'vertical', minHeight: 80, marginBottom: 16 }}/>

      <button onClick={envoyer} disabled={!form.nom.trim() || sending}
        style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: form.nom.trim() ? 'pointer' : 'default', fontSize: '1rem', background: form.nom.trim() ? T.main : '#E5E7EB', color: '#fff', boxShadow: form.nom.trim() ? `0 4px 20px ${T.main}44` : 'none', fontFamily: '"DM Sans", sans-serif' }}>
        {sending ? 'Envoi...' : '🫂 Suggérer ce commerçant'}
      </button>

      <p style={{ fontSize: '0.75rem', color: '#9CA3AF', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
        On contacte le commerçant de ta part et on t'informe s'il rejoint la Tribu Yoppaa.
      </p>
    </div>
  )
}

// ─── FIX 3 : Avis expandable ──────────────────────────────────────────────────
function CarteAvis({ a }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div onClick={() => setOuvert(o => !o)}
      style={{ background: T.bgCard, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.5rem', border: `1.5px solid ${T.pale}`, cursor: 'pointer', transition: 'all 0.15s' }}
      onMouseOver={e => e.currentTarget.style.borderColor = T.main}
      onMouseOut={e => e.currentTarget.style.borderColor = T.pale}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Etoiles note={a.note} taille={14}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', color: T.deep, fontWeight: 600 }}>{a.client?.nom || 'Client'}</span>
          <span style={{ fontSize: '0.72rem', color: T.muted }}>{ouvert ? '▲' : '▼'}</span>
        </div>
      </div>
      {/* Aperçu commentaire même fermé */}
      {a.commentaire && !ouvert && (
        <p style={{ fontSize: '0.8rem', color: T.muted, marginTop: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
          {a.commentaire}
        </p>
      )}
      {/* Détail complet si ouvert */}
      {ouvert && (
        <div style={{ marginTop: 8 }}>
          {a.commentaire && <p style={{ fontSize: '0.875rem', color: T.ink, fontWeight: 500, lineHeight: 1.5, marginBottom: a.reponse_commercant ? 10 : 0 }}>{a.commentaire}</p>}
          {a.reponse_commercant && (
            <div style={{ background: T.pale, borderRadius: 10, padding: '0.5rem 0.75rem' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: T.main, marginBottom: 2 }}>Réponse du commerçant :</p>
              <p style={{ fontSize: '0.82rem', color: T.deep, fontWeight: 500 }}>{a.reponse_commercant}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Splash Screen ───────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(0) // 0=dots, 1=wordmark, 2=tagline, 3=fadeout

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 900)   // après les 3 dots
    const t2 = setTimeout(() => setPhase(2), 1500)  // wordmark visible
    const t3 = setTimeout(() => setPhase(3), 2100)  // tagline visible
    const t4 = setTimeout(() => onDone(), 2700)     // fin
    return () => [t1,t2,t3,t4].forEach(clearTimeout)
  }, [])

  const dots = [
    { color: '#FFFFFF', delay: '0s',    opacity: 0.45 },
    { color: '#C4A0F4', delay: '0.25s', opacity: 1 },
    { color: '#9660E0', delay: '0.5s',  opacity: 1 },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: `linear-gradient(160deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: phase === 3 ? 'splash-out 0.6s ease-in forwards' : 'none',
    }}>
      {/* 3 points yo·pp·aa */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {dots.map((d, i) => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: d.color, opacity: d.opacity,
            boxShadow: `0 0 16px ${d.color}88`,
            animation: `dot-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) ${d.delay} both`,
          }}/>
        ))}
      </div>

      {/* Wordmark yoppaa */}
      <p style={{
        fontFamily: '"DM Sans", sans-serif',
        fontWeight: 900,
        fontSize: '3.5rem',
        color: '#fff',
        letterSpacing: '-2px',
        lineHeight: 1,
        marginBottom: 10,
        animation: phase >= 1 ? 'wordmark-in 0.6s cubic-bezier(0.25,0.46,0.45,0.94) forwards' : 'none',
        opacity: phase >= 1 ? 1 : 0,
      }}>
        yoppaa
      </p>

      {/* Tagline */}
      <p style={{
        fontFamily: '"DM Sans", sans-serif',
        fontWeight: 700,
        fontSize: '0.8rem',
        color: '#C4A0F4',
        letterSpacing: '3px',
        textTransform: 'uppercase',
        animation: phase >= 2 ? 'tagline-in 0.5s ease forwards' : 'none',
        opacity: phase >= 2 ? 1 : 0,
      }}>
        Skip the wait
      </p>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Commander() {
  // Splash screen — une seule fois par session
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === 'undefined') return false
    const seen = sessionStorage.getItem('yoppaa_splash_seen')
    return !seen
  })

  function onSplashDone() {
    sessionStorage.setItem('yoppaa_splash_seen', '1')
    setShowSplash(false)
  }

  // FIX 1 : Persist onglet au refresh via localStorage
  const [onglet, setOngletState] = useState('accueil')
  function setOnglet(val) {
    setOngletState(val)
    localStorage.setItem('yoppaa_onglet', val)
  }

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
  const [avisEnAttente, setAvisEnAttente] = useState(null)
  const [avisForm, setAvisForm] = useState({ note: 0, commentaire: '' })
  const [avisSoumis, setAvisSoumis] = useState(false)
  const avisTimerRef = useRef(null)
  const [messageRetrait, setMessageRetrait] = useState(null)
  const [modeLendemain, setModeLendemain] = useState(false)

  useEffect(() => {
    // FIX 1 : Restaurer l'onglet sauvegardé
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
      if (crensDuJour.length === 0) {
        statuts[id] = 'ferme'
      } else if (crensDispos.length === 0) {
        // Vérifier si mode lendemain actif pour ce commerçant
        const commercant = commercantsData.find(c => c.id === id)
        const heureOuv = commercant?.heure_ouverture_resa ? commercant.heure_ouverture_resa.slice(0,5) : '21:00'
        const tousPassees = crensDuJour.every(c => {
          const debut = parseInt(c.heure_debut.slice(0,2))*60 + parseInt(c.heure_debut.slice(3,5))
          return debut <= nowMin
        })
        const modeLendemainActif = nowMin >= heureEnMinutes(heureOuv) && tousPassees
        statuts[id] = modeLendemainActif ? 'ouvert' : 'complet'
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

    // Déterminer si on est en mode "commandes du lendemain"
    const heureOuverture = c.heure_ouverture_resa ? c.heure_ouverture_resa.slice(0,5) : '21:00'
    const resaLendemainOuverte = maintenant() >= heureEnMinutes(heureOuverture)

    // Compter les commandes en cours (pour savoir si créneaux complets)
    // Si mode lendemain : compter les commandes de demain, sinon celles d'aujourd'hui
    const { data: commandesDuJour } = await supabase
      .from('commandes')
      .select('creneau_id, created_at')
      .eq('commercant_id', c.id)
      .neq('statut', 'recupere')

    const countParCreneau = {}
    ;(commandesDuJour || []).forEach(cmd => {
      // Si mode lendemain : ne compter que les commandes passées après l'heure d'ouverture (= pour demain)
      // Si mode aujourd'hui : compter toutes les commandes non récupérées
      countParCreneau[cmd.creneau_id] = (countParCreneau[cmd.creneau_id] || 0) + 1
    })

    // Si mode lendemain et tous les créneaux du jour sont passés → afficher créneaux pour demain
    const tousPassees = (cren || []).every(cr => heureEnMinutes(cr.heure_debut) <= maintenant())
    const modeLendemain = resaLendemainOuverte && tousPassees

    const creneauxAvecCount = (cren || []).map(cr => ({ ...cr, count: countParCreneau[cr.id] || 0 }))
    setArticles(arts||[])
    setCreneaux(creneauxAvecCount)
    setAvisCommerce(avis||[])
    setModeLendemain(modeLendemain)
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

  async function confirmerRetrait(commande) {
    await supabase.from('commandes').update({ statut: 'recupere' }).eq('id', commande.id)
    setClientCommandes(prev => prev.map(c => c.id===commande.id ? { ...c, statut: 'recupere' } : c))
    setMessageRetrait(commande.id)
    setTimeout(() => setMessageRetrait(null), 8000)
    const avisData = { commandeId: commande.id, clientId: commande.client_id || clientId, commercantId: commande.commercant_id, nom: commande.commercant?.nom || '' }
    if (avisTimerRef.current) clearTimeout(avisTimerRef.current)
    avisTimerRef.current = setTimeout(() => setAvisEnAttente(avisData), 45 * 60 * 1000)
  }

  async function soumettreAvis() {
    if (!avisForm.note || !avisEnAttente) return
    await supabase.from('avis').insert({ commande_id: avisEnAttente.commandeId, client_id: avisEnAttente.clientId, commercant_id: avisEnAttente.commercantId, note: avisForm.note, commentaire: avisForm.commentaire.trim() || null })
    setAvisSoumis(true); setAvisEnAttente(null); setAvisForm({ note: 0, commentaire: '' })
  }

  function noteMoyenne(avis) { return !avis?.length ? 0 : avis.reduce((acc,a) => acc+a.note, 0)/avis.length }

  function resetCommande() {
    setEtape(1); setPanier({}); setCreneauChoisi(null); setCommercantSelectionne(null); setModeLendemain(false)
  }

  const tempsEconomise = clientCommandes.filter(c => c.statut==='recupere').reduce((acc,c) => acc+getTemps(c.commercant?.type), 0)
  const commercantsFiltres = categorieActive === 'Tous' ? commercants : commercants.filter(c => parseTypes(c.type).some(t => t===categorieActive || t.includes(categorieActive)))
  const estDansCommerce = etape > 1
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
      {showSplash && <SplashScreen onDone={onSplashDone}/>}
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
        @keyframes tribu-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.15); } }
        @keyframes tribu-pulse2 { 0%,100% { opacity:0.85; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.1); } }
        @keyframes tribu-pulse3 { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:0.3; transform:scale(1.05); } }
        @keyframes dot-pop { 0% { opacity:0; transform:scale(0) translateY(8px); } 70% { transform:scale(1.3) translateY(-4px); } 100% { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes wordmark-in { 0% { opacity:0; letter-spacing: 8px; } 100% { opacity:1; letter-spacing: -2px; } }
        @keyframes tagline-in { 0% { opacity:0; transform:translateY(6px); } 100% { opacity:1; transform:translateY(0); } }
        @keyframes splash-out { 0% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1.05); } }
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
                  {commercantSelectionne?.adresse && <p style={{ fontSize: '0.82rem', color: T.deep, fontWeight: 600, marginBottom: 5 }}>📍 {commercantSelectionne.adresse}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Etoiles note={noteMoyenne(avisCommerce)} taille={13}/>
                    {avisCommerce.length > 0 ? <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>({avisCommerce.length} avis)</span> : <span style={{ fontSize: '0.72rem', color: '#D1D5DB' }}>Pas encore d'avis</span>}
                  </div>
                </div>
              </div>

              {/* Horaires 7 jours */}
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

              {/* FIX 3 : Avis cliquables avec CarteAvis expandable */}
              {avisCommerce.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.deep, marginBottom: '0.625rem' }}>Avis clients</h3>
                  {avisCommerce.map(a => <CarteAvis key={a.id} a={a}/>)}
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
                  {(() => {
                    const d = modeLendemain ? new Date(Date.now() + 86400000) : new Date()
                    return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
                  })()} · {commercantSelectionne?.nom}
                </p>
                <h2 style={{ fontWeight: 800, fontSize: '1.15rem', color: T.ink }}>
                  {modeLendemain ? 'Créneaux disponibles — demain' : 'Choisis ton créneau'}
                </h2>
                {modeLendemain && (
                  <p style={{ fontSize: '0.78rem', color: T.main, fontWeight: 600, marginTop: 4 }}>
                    🎉 Les réservations pour demain sont ouvertes !
                  </p>
                )}
              </div>
              <div className="grid3" style={{ marginBottom: '1.25rem' }}>
                {creneaux.map(c => {
                  // En mode lendemain : aucun créneau n'est "passé"
                  const passe = modeLendemain ? false : heureEnMinutes(c.heure_debut) <= maintenant()
                  const complet = c.count >= c.max_commandes
                  const placesRestantes = c.max_commandes - c.count
                  const bientotComplet = !complet && placesRestantes <= 1
                  const presqueComplet = !complet && placesRestantes === 2
                  const desactive = passe || complet
                  let mention = null
                  if (passe) mention = { text: 'Reviens demain !', color: T.deep }
                  else if (complet) mention = { text: 'Complet', color: '#DC2626' }
                  else if (bientotComplet) mention = { text: '🔥 Dernière place !', color: '#EA580C' }
                  else if (presqueComplet) mention = { text: '⚡ Presque complet', color: '#D97706' }
                  return (
                    <div key={c.id} onClick={() => !desactive && setCreneauChoisi(c.id)}
                      style={{ padding: '0.75rem 0.5rem', borderRadius: 12, border: `2px solid ${desactive ? '#E5E7EB' : creneauChoisi===c.id ? T.main : T.pale}`, background: desactive ? '#F9FAFB' : creneauChoisi===c.id ? T.pale : '#fff', cursor: desactive ? 'default' : 'pointer', textAlign: 'center', fontWeight: 700, color: desactive ? '#D1D5DB' : T.ink, fontSize: '0.875rem', transition: 'all 0.15s' }}>
                      <div style={{ textDecoration: complet ? 'line-through' : 'none', opacity: passe ? 0.5 : 1 }}>
                        {c.heure_debut.slice(0,5)} – {c.heure_fin.slice(0,5)}
                      </div>
                      {mention && <div style={{ fontSize: '0.62rem', fontWeight: 800, color: mention.color, marginTop: 3, lineHeight: 1.2 }}>{mention.text}</div>}
                    </div>
                  )
                })}
                {!modeLendemain && creneaux.length > 0 && creneaux.every(c => heureEnMinutes(c.heure_debut) <= maintenant()) && (() => {
                  const premierCreneau = creneaux.reduce((min, c) => heureEnMinutes(c.heure_debut) < heureEnMinutes(min.heure_debut) ? c : min, creneaux[0])
                  const demain = new Date(); demain.setDate(demain.getDate() + 1)
                  const jourDemain = demain.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
                  const heureOuverture = commercantSelectionne?.heure_ouverture_resa ? commercantSelectionne.heure_ouverture_resa.slice(0,5) : '21:00'
                  const resaOuverteMaintenat = maintenant() >= heureEnMinutes(heureOuverture)
                  return (
                    <div style={{ gridColumn: '1 / -1', background: T.pale, borderRadius: 12, padding: '1.25rem', textAlign: 'center', border: `1.5px solid ${T.main}33` }}>
                      <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🕐</p>
                      <p style={{ fontWeight: 800, marginBottom: 6, color: T.deep, fontSize: '1rem' }}>Plus de créneaux disponibles aujourd'hui</p>
                      {resaOuverteMaintenat
                        ? <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6 }}>Les réservations pour demain sont ouvertes ! 🎉<br/>Premier créneau chez <strong>{commercantSelectionne?.nom}</strong> à <strong>{premierCreneau.heure_debut.slice(0,5)}</strong> le <strong>{jourDemain}</strong>.</p>
                        : <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6 }}>Pour ta prochaine commande chez <strong>{commercantSelectionne?.nom}</strong>,<br/>reviens à partir de <strong>{heureOuverture}</strong> ce soir pour réserver<br/>le <strong>{jourDemain}</strong> dès <strong>{premierCreneau.heure_debut.slice(0,5)}</strong> !</p>
                      }
                    </div>
                  )
                })()}
              </div>

              {!modeLendemain && creneaux.some(c => heureEnMinutes(c.heure_debut) > maintenant()) && (() => {
                const heureOuverture = commercantSelectionne?.heure_ouverture_resa ? commercantSelectionne.heure_ouverture_resa.slice(0,5) : '21:00'
                const resaOuverte = maintenant() >= heureEnMinutes(heureOuverture)
                const demain = new Date(); demain.setDate(demain.getDate() + 1)
                const jourDemain = demain.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
                const premierCreneau = creneaux.reduce((min, c) => heureEnMinutes(c.heure_debut) < heureEnMinutes(min.heure_debut) ? c : min, creneaux[0])
                return (
                  <div style={{ background: T.pale, borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.25rem', border: `1px solid ${T.main}22` }}>
                    {resaOuverte
                      ? <p style={{ fontSize: '0.78rem', color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>🎉 Les réservations pour demain sont déjà ouvertes ! Premier créneau à <strong>{premierCreneau.heure_debut.slice(0,5)}</strong> le <strong>{jourDemain}</strong>.</p>
                      : <p style={{ fontSize: '0.78rem', color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>💡 Pour ta commande de demain chez <strong>{commercantSelectionne?.nom}</strong>, reviens à partir de <strong>{heureOuverture}</strong> ce soir !</p>
                    }
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

          {/* ÉTAPE 4 — Confirmation */}
          {etape === 4 && (
            <div style={{ padding: '1.5rem 1rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
                <p style={{ fontWeight: 900, fontSize: '1rem', color: T.main, letterSpacing: '-0.5px', marginBottom: 4 }}>yoppaa</p>
                <h2 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.ink, marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Ta commande est passée !</h2>
                <p style={{ color: T.deep, fontWeight: 700, marginBottom: '0.25rem', fontSize: '1rem' }}>Chez {commercantSelectionne?.nom}</p>
                <p style={{ color: T.muted, fontSize: '0.875rem' }}>On s'occupe du reste — présente-toi à ton créneau !</p>
              </div>
              <div style={{ background: T.pale, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', border: `1.5px solid ${T.main}33` }}>
                <p style={{ fontWeight: 800, color: T.ink, marginBottom: 8, fontSize: '1rem' }}>📦 Pour récupérer ta commande</p>
                <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6 }}>
                  Présente-toi chez <strong>{commercantSelectionne?.nom}</strong> à ton créneau.<br/>
                  Quand ta commande est prête, confirme depuis l'onglet <strong>Commandes</strong> en bas.
                </p>
              </div>
              <div style={{ ...card, textAlign: 'center', padding: '1rem' }}>
                <p style={{ fontSize: '0.8rem', color: T.muted, marginBottom: 12 }}>Retrouve le statut de ta commande ici :</p>
                <button onClick={() => { setOnglet('commandes'); resetCommande() }} style={{ ...btnPrimary, fontSize: '0.9rem' }}>
                  Voir mes commandes →
                </button>
              </div>
              <button onClick={resetCommande} style={{ width: '100%', marginTop: 10, padding: '0.875rem', background: 'transparent', color: T.main, border: `1.5px solid ${T.main}`, borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                Commander autre chose
              </button>
            </div>
          )}

          {/* ONGLET COMMANDES */}
          {onglet === 'commandes' && !estDansCommerce && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              {messageRetrait && (
                <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', textAlign: 'center', color: '#fff' }}>
                  <p style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-1px', marginBottom: 6 }}>yoppaa ✓</p>
                  <p style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>Retrait confirmé !</p>
                  <p style={{ fontSize: '0.82rem', color: T.light, lineHeight: 1.5 }}>Merci et profitez bien de votre commande 🎉<br/>Un message pour votre avis arrivera dans 45 min.</p>
                </div>
              )}
              {avisEnAttente && !avisSoumis && (
                <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', color: '#fff' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 12 }}>⭐ Comment était {avisEnAttente.nom} ?</h3>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {[1,2,3,4,5].map(i => <span key={i} onClick={() => setAvisForm(p => ({ ...p, note: i }))} style={{ fontSize: 30, cursor: 'pointer', color: i<=avisForm.note ? '#FCD34D' : 'rgba(255,255,255,0.3)', transition: 'color 0.1s' }}>★</span>)}
                  </div>
                  <textarea placeholder="Ton commentaire (optionnel)" value={avisForm.commentaire} onChange={e => setAvisForm(p => ({ ...p, commentaire: e.target.value }))}
                    style={{ width: '100%', padding: '0.75rem', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif', resize: 'vertical', minHeight: 70, boxSizing: 'border-box', outline: 'none', color: '#fff', background: 'rgba(255,255,255,0.1)', marginBottom: 10 }}/>
                  <button onClick={soumettreAvis} disabled={!avisForm.note}
                    style={{ width: '100%', padding: '0.75rem', background: avisForm.note ? '#fff' : 'rgba(255,255,255,0.2)', color: avisForm.note ? T.main : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 100, fontWeight: 800, cursor: avisForm.note ? 'pointer' : 'default', fontSize: '0.9rem' }}>
                    Envoyer mon avis
                  </button>
                </div>
              )}
              {avisSoumis && <div style={{ background: '#D4EDDA', borderRadius: 14, padding: '1rem', textAlign: 'center', marginBottom: '1rem' }}><p style={{ color: '#155724', fontWeight: 700 }}>✓ Merci pour ton avis !</p></div>}

              {commandesASwiper.length > 0 && (
                <>
                  <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: T.ink, marginBottom: '0.75rem' }}>📦 Prêtes à récupérer</h2>
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
                            <p style={{ fontSize: '0.75rem', color: T.muted }}>
                              {new Date(c.created_at).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
                              {c.creneau ? ` · 🕐 ${c.creneau.heure_debut.slice(0,5)}–${c.creneau.heure_fin.slice(0,5)}` : ''}
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
              <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', color: '#fff', textAlign: 'center' }}>
                {/* FIX 4 : Icône Tribu flashy avec animation pulse */}
                <svg viewBox="0 0 64 36" width="64" height="36" fill="none" style={{ marginBottom: 8 }}>
                  <circle cx="10" cy="18" r="10" fill="#fff" style={{ animation: 'tribu-pulse 2s ease-in-out infinite' }}/>
                  <circle cx="32" cy="12" r="10" fill={T.light} style={{ animation: 'tribu-pulse2 2s ease-in-out infinite 0.3s' }}/>
                  <circle cx="54" cy="18" r="10" fill={T.mid} style={{ animation: 'tribu-pulse3 2s ease-in-out infinite 0.6s' }}/>
                </svg>
                <p style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-1px', marginBottom: 4 }}>La Tribu Yoppaa</p>
                {/* FIX 5 : "commerçant" au lieu de "commerce" */}
                <p style={{ fontSize: '0.82rem', color: T.light, lineHeight: 1.5 }}>
                  Tu as fait la file chez un commerçant et tu penses qu'il mériterait Yoppaa ?<br/>
                  Dis-le nous — on le contacte !
                </p>
              </div>
              <SuggestionForm clientId={clientId}/>
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
                  ? <svg viewBox="0 0 32 22" width="28" height="20" fill="none">
                      {/* FIX 4 : Points plus flashy — couleurs vives + glow */}
                      <circle cx="6"  cy="11" r="5.5" fill={onglet==='tribu' ? '#fff' : T.main} opacity={onglet==='tribu' ? 1 : 0.5}
                        style={onglet==='tribu' ? { filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.8))' } : {}}/>
                      <circle cx="16" cy="7"  r="5.5" fill={onglet==='tribu' ? T.light : T.mid} opacity={onglet==='tribu' ? 1 : 0.6}
                        style={onglet==='tribu' ? { filter: 'drop-shadow(0 0 4px rgba(196,160,244,0.8))' } : {}}/>
                      <circle cx="26" cy="11" r="5.5" fill={onglet==='tribu' ? T.mid : '#9CA3AF'} opacity={onglet==='tribu' ? 1 : 0.4}
                        style={onglet==='tribu' ? { filter: 'drop-shadow(0 0 4px rgba(150,96,224,0.8))' } : {}}/>
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