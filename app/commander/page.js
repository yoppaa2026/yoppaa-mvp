'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Palette Yoppaa ───────────────────────────────────────────────────────────
const C = {
  ink:   '#1A0840',
  deep:  '#2D0F6B',
  main:  '#6B35C4',
  mid:   '#9660E0',
  light: '#C4A0F4',
  pale:  '#EDE0FF',
}

// ─── Icônes SVG par segment ───────────────────────────────────────────────────
const ICONES = {
  'Boulangerie': (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={36} height={36}>
      <ellipse cx="20" cy="22" rx="14" ry="9" fill="#F59E0B" opacity="0.15"/>
      <path d="M8 22 Q10 12 20 11 Q30 12 32 22 Q30 28 20 28 Q10 28 8 22Z" fill="#F59E0B"/>
      <path d="M12 18 Q16 14 20 14 Q24 14 28 18" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <ellipse cx="20" cy="13" rx="4" ry="2.5" fill="#FCD34D"/>
    </svg>
  ),
  'Boulangerie & Pâtisserie': (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={36} height={36}>
      <ellipse cx="20" cy="22" rx="14" ry="9" fill="#F59E0B" opacity="0.15"/>
      <path d="M8 22 Q10 12 20 11 Q30 12 32 22 Q30 28 20 28 Q10 28 8 22Z" fill="#F59E0B"/>
      <circle cx="20" cy="13" r="4" fill="#FCD34D" stroke="#D97706" strokeWidth="1"/>
      <path d="M17 13 L20 10 L23 13" stroke="#D97706" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  'Sandwicherie': (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={36} height={36}>
      <rect x="7" y="24" width="26" height="5" rx="2.5" fill="#D97706"/>
      <rect x="7" y="19" width="26" height="5" rx="1" fill="#86EFAC"/>
      <rect x="9" y="16" width="22" height="3" rx="1" fill="#FCA5A5"/>
      <rect x="7" y="11" width="26" height="5" rx="2.5" fill="#FCD34D"/>
    </svg>
  ),
  'Snack': (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={36} height={36}>
      <path d="M15 28 L13 14 Q20 10 27 14 L25 28Z" fill="#FCD34D" stroke="#D97706" strokeWidth="1"/>
      <path d="M15 19 Q20 16 25 19" stroke="#D97706" strokeWidth="1" strokeLinecap="round" fill="none"/>
      <circle cx="18" cy="22" r="1.5" fill="#EF4444"/>
      <circle cx="22" cy="23" r="1.5" fill="#22C55E"/>
    </svg>
  ),
  'Pizzeria': (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={36} height={36}>
      <path d="M20 8 L32 30 L8 30Z" fill="#FCD34D" stroke="#D97706" strokeWidth="1.2"/>
      <circle cx="20" cy="22" r="2" fill="#EF4444"/>
      <circle cx="15" cy="26" r="1.5" fill="#EF4444"/>
      <circle cx="25" cy="25" r="1.5" fill="#EF4444"/>
      <path d="M20 8 L20 30" stroke="#D97706" strokeWidth="0.8" strokeDasharray="2,2"/>
      <path d="M20 8 L32 30" stroke="#D97706" strokeWidth="0.8" strokeDasharray="2,2"/>
    </svg>
  ),
  'Coffee shop': (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={36} height={36}>
      <path d="M10 21 Q10 18 14 18 L26 18 Q30 18 30 21 L29 28 Q28 31 20 31 Q12 31 11 28Z" fill="#92400E"/>
      <path d="M28 20 Q34 20 34 24 Q34 28 28 27" stroke="#92400E" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M16 14 Q16 11 18 11" stroke="#6B35C4" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M20 13 Q20 10 22 10" stroke="#6B35C4" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  'Épicerie': (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={36} height={36}>
      <rect x="8" y="20" width="24" height="12" rx="2" fill="#6B35C4" opacity="0.15"/>
      <rect x="8" y="20" width="24" height="12" rx="2" stroke="#6B35C4" strokeWidth="1.5" fill="none"/>
      <path d="M14 20 L12 14 L28 14 L26 20" stroke="#6B35C4" strokeWidth="1.5" fill="none"/>
      <circle cx="16" cy="25" r="2" fill="#6B35C4"/>
      <circle cx="24" cy="25" r="2" fill="#6B35C4"/>
    </svg>
  ),
  'Traiteur': (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={36} height={36}>
      <path d="M8 22 Q8 18 20 18 Q32 18 32 22 L32 24 Q32 28 20 28 Q8 28 8 24Z" fill="#C4A0F4"/>
      <rect x="19" y="10" width="2" height="8" rx="1" fill="#6B35C4"/>
      <ellipse cx="20" cy="10" rx="5" ry="2" fill="#6B35C4" opacity="0.4"/>
    </svg>
  ),
  'Pharmacie': (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={36} height={36}>
      <rect x="10" y="10" width="20" height="20" rx="4" fill="#22C55E" opacity="0.15"/>
      <rect x="10" y="10" width="20" height="20" rx="4" stroke="#22C55E" strokeWidth="1.5" fill="none"/>
      <rect x="18" y="14" width="4" height="12" rx="2" fill="#22C55E"/>
      <rect x="14" y="18" width="12" height="4" rx="2" fill="#22C55E"/>
    </svg>
  ),
  'default': (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={36} height={36}>
      <rect x="8" y="18" width="24" height="14" rx="3" fill="#6B35C4" opacity="0.15"/>
      <rect x="8" y="18" width="24" height="14" rx="3" stroke="#6B35C4" strokeWidth="1.5" fill="none"/>
      <rect x="14" y="10" width="12" height="8" rx="2" fill="#EDE0FF" stroke="#6B35C4" strokeWidth="1.5"/>
    </svg>
  )
}

function getIcone(type) { return ICONES[type] || ICONES['default'] }

const TYPE_BADGE = {
  'Boulangerie':              { bg: '#FFF3CD', color: '#856404' },
  'Boulangerie & Pâtisserie': { bg: '#FEF3C7', color: '#92400E' },
  'Sandwicherie':             { bg: '#CCE5FF', color: '#004085' },
  'Snack':                    { bg: '#D4EDDA', color: '#155724' },
  'Pizzeria':                 { bg: '#FEE2E2', color: '#991B1B' },
  'Coffee shop':              { bg: '#EDE0FF', color: '#2D0F6B' },
  'Épicerie':                 { bg: '#E0E7FF', color: '#3730A3' },
  'Traiteur':                 { bg: '#FCE7F3', color: '#9D174D' },
  'Pharmacie':                { bg: '#D1FAE5', color: '#065F46' },
}
function getBadge(type) { return TYPE_BADGE[type] || { bg: C.pale, color: C.deep } }

function distanceVolOiseau(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function formatDistance(m) {
  if (m === null || m === undefined) return null
  return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`
}

function Etoiles({ note, taille = 16 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize: taille, color: i <= note ? '#F59E0B' : '#E5E7EB' }}>★</span>
      ))}
    </span>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Commander() {
  const [commercants, setCommercants] = useState([])
  const [commercantSelectionne, setCommercantSelectionne] = useState(null)
  const [articles, setArticles] = useState([])
  const [creneaux, setCreneaux] = useState([])
  const [avisCommerce, setAvisCommerce] = useState([])
  const [panier, setPanier] = useState({})
  const [creneauChoisi, setCreneauChoisi] = useState(null)
  const [client, setClient] = useState({ nom: '', email: '', telephone: '' })
  const [etape, setEtape] = useState(1)
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [favoris, setFavoris] = useState([])
  const [clientId, setClientId] = useState(null)
  const [derniereCommande, setDerniereCommande] = useState(null)
  const [avisForm, setAvisForm] = useState({ note: 0, commentaire: '' })
  const [avisSoumis, setAvisSoumis] = useState(false)

  useEffect(() => {
    chargerCommercants()
    demanderGeolocalisation()
  }, [])

  function demanderGeolocalisation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoLoading(false) },
      () => setGeoLoading(false),
      { timeout: 8000 }
    )
  }

  async function chargerCommercants() {
    const { data } = await supabase.from('commercants').select('*').order('nom')
    setCommercants(data || [])
  }

  useEffect(() => {
    if (!position || commercants.length === 0) return
    calculerDistances(commercants, position)
  }, [position, commercants.length])

  async function calculerDistances(liste, pos) {
    const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY
    const avecCoords = liste.filter(c => c.latitude && c.longitude)
    if (avecCoords.length === 0) return
    try {
      const body = {
        locations: [[pos.lng, pos.lat], ...avecCoords.map(c => [parseFloat(c.longitude), parseFloat(c.latitude)])],
        metrics: ['distance'],
        units: 'm'
      }
      const res = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
        method: 'POST',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const distances = data.distances[0].slice(1)
      const avecDistance = liste.map(c => {
        const idx = avecCoords.findIndex(x => x.id === c.id)
        return { ...c, distance: idx === -1 ? null : distances[idx] }
      })
      avecDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
      setCommercants(avecDistance)
    } catch {
      const avecDistance = liste.map(c => ({
        ...c,
        distance: c.latitude && c.longitude ? distanceVolOiseau(pos.lat, pos.lng, parseFloat(c.latitude), parseFloat(c.longitude)) : null
      }))
      avecDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
      setCommercants(avecDistance)
    }
  }

  async function getOuCreerClient(email, nom) {
    const { data: existing } = await supabase.from('clients').select('id').eq('email', email).single()
    if (existing) {
      setClientId(existing.id)
      const { data: favs } = await supabase.from('favoris').select('commercant_id').eq('client_id', existing.id)
      setFavoris((favs || []).map(f => f.commercant_id))
      return existing.id
    }
    const { data: nouveau } = await supabase.from('clients').insert({ email, nom }).select('id').single()
    setClientId(nouveau.id)
    return nouveau.id
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
    let cid = clientId
    if (!cid) cid = await getOuCreerClient(client.email, client.nom)
    if (favoris.includes(commercantId)) {
      await supabase.from('favoris').delete().eq('client_id', cid).eq('commercant_id', commercantId)
      setFavoris(prev => prev.filter(id => id !== commercantId))
    } else {
      await supabase.from('favoris').insert({ client_id: cid, commercant_id: commercantId })
      setFavoris(prev => [...prev, commercantId])
    }
  }

  async function selectionnerCommercant(commercant) {
    setCommercantSelectionne(commercant)
    const [{ data: arts }, { data: cren }, { data: avis }] = await Promise.all([
      supabase.from('articles').select('*').eq('commercant_id', commercant.id).eq('actif', true).order('nom'),
      supabase.from('creneaux').select('*').eq('commercant_id', commercant.id).eq('actif', true).order('heure_debut'),
      supabase.from('avis').select('*, client:clients(nom)').eq('commercant_id', commercant.id).order('created_at', { ascending: false }).limit(10)
    ])
    setArticles(arts || [])
    setCreneaux(cren || [])
    setAvisCommerce(avis || [])
    setEtape(2)
  }

  function ajouterAuPanier(article) {
    setPanier(prev => ({ ...prev, [article.id]: { ...article, quantite: (prev[article.id]?.quantite || 0) + 1 } }))
  }

  function retirerDuPanier(articleId) {
    setPanier(prev => {
      const n = { ...prev }
      if (n[articleId]?.quantite > 1) n[articleId].quantite -= 1
      else delete n[articleId]
      return n
    })
  }

  function totalPanier() {
    return Object.values(panier).reduce((acc, item) => acc + item.prix * item.quantite, 0)
  }

  async function passerCommande() {
    if (!creneauChoisi || !client.nom || !client.email) return
    setLoading(true)
    const cid = await getOuCreerClient(client.email, client.nom)
    const { data: commande } = await supabase.from('commandes').insert({
      commercant_id: commercantSelectionne.id,
      creneau_id: creneauChoisi,
      client_nom: client.nom,
      client_email: client.email,
      client_telephone: client.telephone,
      total: totalPanier(),
      statut: 'en_attente'
    }).select().single()
    if (commande) {
      await supabase.from('commande_articles').insert(
        Object.values(panier).map(item => ({ commande_id: commande.id, article_id: item.id, quantite: item.quantite, prix_unitaire: item.prix }))
      )
      setDerniereCommande({ ...commande, client_id: cid })
      setEtape(4)
    }
    setLoading(false)
  }

  async function soumettreAvis() {
    if (!avisForm.note || !derniereCommande) return
    await supabase.from('avis').insert({
      commande_id: derniereCommande.id,
      client_id: derniereCommande.client_id,
      commercant_id: commercantSelectionne.id,
      note: avisForm.note,
      commentaire: avisForm.commentaire.trim() || null
    })
    setAvisSoumis(true)
  }

  function noteMoyenne(avis) {
    if (!avis || avis.length === 0) return null
    return (avis.reduce((acc, a) => acc + a.note, 0) / avis.length).toFixed(1)
  }

  function resetEtape1() {
    setEtape(1); setPanier({}); setClient({ nom: '', email: '', telephone: '' })
    setCreneauChoisi(null); setCommercantSelectionne(null)
    setAvisForm({ note: 0, commentaire: '' }); setAvisSoumis(false)
  }

  return (
    <main style={{ fontFamily: 'DM Sans, sans-serif', maxWidth: 600, margin: '0 auto', padding: '0 0 2rem', background: '#FAFAFA', minHeight: '100vh' }}>

      {/* HEADER */}
      <div style={{ background: C.main, padding: '1.5rem 1rem 1.2rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {[0.4, 1, 1].map((op, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? '#fff' : i === 1 ? C.light : C.mid, opacity: i === 0 ? op : 1 }}/>
          ))}
        </div>
        <h1 style={{ fontWeight: 800, fontSize: '1.8rem', letterSpacing: '-2px', color: '#fff', margin: 0 }}>yoppaa</h1>
        <p style={{ color: C.light, fontSize: '0.8rem', margin: 0 }}>Skip the wait</p>
      </div>

      {/* ── ÉTAPE 1 ──────────────────────────────────────────────────────── */}
      {etape === 1 && (
        <div style={{ padding: '0 1rem' }}>
          {geoLoading && (
            <div style={{ background: C.pale, borderRadius: 10, padding: '0.6rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: C.main, fontWeight: 600 }}>
              📍 Localisation en cours...
            </div>
          )}
          {position && !geoLoading && (
            <div style={{ background: C.pale, borderRadius: 10, padding: '0.6rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: C.main, fontWeight: 600 }}>
              📍 Triés par distance depuis ta position
            </div>
          )}
          <p style={{ fontWeight: 800, fontSize: '1.1rem', color: C.ink, marginBottom: '1rem' }}>Commande sans attendre 👇</p>

          {commercants.map(c => {
            const badge = getBadge(c.type)
            const estFavori = favoris.includes(c.id)
            return (
              <div key={c.id} onClick={() => selectionnerCommercant(c)}
                style={{ background: '#fff', border: `1.5px solid ${C.pale}`, borderRadius: 16, padding: '1rem 1.25rem', marginBottom: '0.75rem', cursor: 'pointer', boxShadow: '0 1px 4px rgba(107,53,196,0.06)' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = C.main; e.currentTarget.style.boxShadow = '0 4px 16px rgba(107,53,196,0.12)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = C.pale; e.currentTarget.style.boxShadow = '0 1px 4px rgba(107,53,196,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 12, background: C.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {c.logo_url ? <img src={c.logo_url} alt={c.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : getIcone(c.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ fontWeight: 800, color: C.ink, margin: '0 0 4px', fontSize: '1rem' }}>{c.nom}</p>
                        <span style={{ background: badge.bg, color: badge.color, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100 }}>{c.type}</span>
                      </div>
                      <button onClick={e => toggleFavori(c.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', padding: '0 0 0 8px', lineHeight: 1 }}>
                        {estFavori ? '❤️' : '🤍'}
                      </button>
                    </div>
                    {c.description && <p style={{ fontSize: '0.8rem', color: '#6b5c8a', margin: '6px 0 0', lineHeight: 1.4 }}>{c.description}</p>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 6 }}>
                      {c.distance != null && <span style={{ fontSize: '0.75rem', color: C.main, fontWeight: 700 }}>📍 {formatDistance(c.distance)}</span>}
                      {c.horaires && <span style={{ fontSize: '0.75rem', color: C.mid }}>🕐 {c.horaires}</span>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── ÉTAPE 2 ──────────────────────────────────────────────────────── */}
      {etape === 2 && (
        <div style={{ padding: '0 1rem' }}>
          <button onClick={() => { setEtape(1); setPanier({}) }} style={{ background: 'none', border: 'none', color: C.main, cursor: 'pointer', marginBottom: '1rem', fontWeight: 600, padding: 0, fontSize: '0.9rem' }}>← Retour</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.25rem', background: '#fff', borderRadius: 16, padding: '1rem', border: `1.5px solid ${C.pale}` }}>
            <div style={{ width: 64, height: 64, borderRadius: 14, background: C.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              {commercantSelectionne?.logo_url ? <img src={commercantSelectionne.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : getIcone(commercantSelectionne?.type)}
            </div>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: '1.15rem', color: C.ink, margin: '0 0 4px' }}>{commercantSelectionne?.nom}</h2>
              {commercantSelectionne?.adresse && <p style={{ fontSize: '0.75rem', color: '#b0a0c8', margin: '0 0 4px' }}>📍 {commercantSelectionne.adresse}</p>}
              {avisCommerce.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Etoiles note={Math.round(noteMoyenne(avisCommerce))} taille={13}/>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F59E0B' }}>{noteMoyenne(avisCommerce)}</span>
                  <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>({avisCommerce.length} avis)</span>
                </div>
              )}
            </div>
          </div>

          {articles.map(article => (
            <div key={article.id} style={{ background: '#fff', border: `1.5px solid ${C.pale}`, borderRadius: 12, padding: '1rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, color: C.ink, margin: '0 0 2px' }}>{article.nom}</p>
                {article.description && <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 2px' }}>{article.description}</p>}
                <p style={{ fontSize: '0.85rem', color: C.mid, fontWeight: 700, margin: 0 }}>{Number(article.prix).toFixed(2)}€</p>
                {article.stock_jour === 0 && <span style={{ fontSize: '0.72rem', background: '#FEE2E2', color: '#DC2626', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>Épuisé</span>}
              </div>
              {article.stock_jour !== 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {panier[article.id] && (
                    <>
                      <button onClick={() => retirerDuPanier(article.id)} style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${C.main}`, background: '#fff', color: C.main, fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}>-</button>
                      <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{panier[article.id].quantite}</span>
                    </>
                  )}
                  <button onClick={() => ajouterAuPanier(article)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: C.main, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}>+</button>
                </div>
              )}
            </div>
          ))}

          {avisCommerce.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1rem', color: C.ink, marginBottom: '0.75rem' }}>Avis clients</h3>
              {avisCommerce.map(a => (
                <div key={a.id} style={{ background: '#fff', border: `1.5px solid ${C.pale}`, borderRadius: 12, padding: '0.875rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Etoiles note={a.note} taille={14}/>
                    <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{a.client?.nom || 'Client'}</span>
                  </div>
                  {a.commentaire && <p style={{ fontSize: '0.82rem', color: C.ink, margin: '4px 0 0', lineHeight: 1.5 }}>{a.commentaire}</p>}
                  {a.reponse_commercant && (
                    <div style={{ background: C.pale, borderRadius: 8, padding: '0.5rem 0.75rem', marginTop: 8 }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: C.main, margin: '0 0 2px' }}>Réponse du commerce :</p>
                      <p style={{ fontSize: '0.8rem', color: C.ink, margin: 0 }}>{a.reponse_commercant}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {Object.keys(panier).length > 0 && (
            <div style={{ position: 'sticky', bottom: 16, marginTop: 8 }}>
              <button onClick={() => setEtape(3)} style={{ width: '100%', padding: '1rem', background: C.main, color: '#fff', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 20px rgba(107,53,196,0.3)' }}>
                Choisir mon créneau — {totalPanier().toFixed(2)}€
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── ÉTAPE 3 ──────────────────────────────────────────────────────── */}
      {etape === 3 && (
        <div style={{ padding: '0 1rem' }}>
          <button onClick={() => setEtape(2)} style={{ background: 'none', border: 'none', color: C.main, cursor: 'pointer', marginBottom: '1rem', fontWeight: 600, padding: 0, fontSize: '0.9rem' }}>← Retour</button>
          <h2 style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '1rem', color: C.ink }}>Choisis ton créneau</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
            {creneaux.map(c => (
              <div key={c.id} onClick={() => setCreneauChoisi(c.id)}
                style={{ padding: '0.75rem', borderRadius: 10, border: `2px solid ${creneauChoisi === c.id ? C.main : C.pale}`, background: creneauChoisi === c.id ? C.pale : '#fff', cursor: 'pointer', textAlign: 'center', fontWeight: 700, color: C.ink, fontSize: '0.9rem' }}>
                {c.heure_debut.slice(0,5)} – {c.heure_fin.slice(0,5)}
              </div>
            ))}
          </div>

          <h2 style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '1rem', color: C.ink }}>Tes coordonnées</h2>
          {[
            { key: 'nom', placeholder: 'Ton prénom et nom', type: 'text' },
            { key: 'email', placeholder: 'Email', type: 'email' },
            { key: 'telephone', placeholder: 'Téléphone (optionnel)', type: 'tel' },
          ].map(f => (
            <input key={f.key} placeholder={f.placeholder} type={f.type} value={client[f.key]}
              onChange={e => setClient(p => ({ ...p, [f.key]: e.target.value }))}
              style={{ width: '100%', padding: '0.85rem', border: `1.5px solid ${C.pale}`, borderRadius: 10, marginBottom: 10, fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', outline: 'none' }}/>
          ))}

          <button onClick={passerCommande} disabled={loading || !creneauChoisi || !client.nom || !client.email}
            style={{ width: '100%', padding: '1rem', background: C.main, color: '#fff', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '1rem', cursor: 'pointer', opacity: (!creneauChoisi || !client.nom || !client.email) ? 0.5 : 1, boxShadow: '0 4px 20px rgba(107,53,196,0.3)' }}>
            {loading ? 'En cours...' : `Confirmer ma commande — ${totalPanier().toFixed(2)}€`}
          </button>
          <p style={{ fontSize: '0.78rem', color: '#9a8ab0', textAlign: 'center', marginTop: 8 }}>Le paiement sera activé prochainement</p>
        </div>
      )}

      {/* ── ÉTAPE 4 ──────────────────────────────────────────────────────── */}
      {etape === 4 && (
        <div style={{ padding: '2rem 1rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
            <h2 style={{ fontWeight: 800, fontSize: '1.5rem', color: C.ink, marginBottom: '0.5rem' }}>Commande confirmée !</h2>
            <p style={{ color: C.main, marginBottom: '0.5rem' }}>Ta commande est enregistrée.</p>
            <p style={{ color: C.mid, fontSize: '0.9rem', marginBottom: 0 }}>Le commerce la prépare pour ton créneau — tu n'as plus qu'à arriver !</p>
          </div>

          {!avisSoumis ? (
            <div style={{ background: '#fff', borderRadius: 16, padding: '1.25rem', border: `1.5px solid ${C.pale}`, marginBottom: '1.5rem' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1rem', color: C.ink, margin: '0 0 12px' }}>Laisse un avis sur {commercantSelectionne?.nom} 👇</h3>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {[1,2,3,4,5].map(i => (
                  <span key={i} onClick={() => setAvisForm(p => ({ ...p, note: i }))}
                    style={{ fontSize: 28, cursor: 'pointer', color: i <= avisForm.note ? '#F59E0B' : '#E5E7EB', transition: 'color 0.1s' }}>★</span>
                ))}
              </div>
              <textarea placeholder="Ton commentaire (optionnel)" value={avisForm.commentaire}
                onChange={e => setAvisForm(p => ({ ...p, commentaire: e.target.value }))}
                style={{ width: '100%', padding: '0.75rem', border: `1.5px solid ${C.pale}`, borderRadius: 10, fontSize: '0.9rem', fontFamily: 'DM Sans, sans-serif', resize: 'vertical', minHeight: 80, boxSizing: 'border-box', outline: 'none' }}/>
              <button onClick={soumettreAvis} disabled={!avisForm.note}
                style={{ marginTop: 10, width: '100%', padding: '0.75rem', background: avisForm.note ? C.main : '#E5E7EB', color: '#fff', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.9rem', cursor: avisForm.note ? 'pointer' : 'default' }}>
                Envoyer mon avis
              </button>
            </div>
          ) : (
            <div style={{ background: '#D4EDDA', borderRadius: 16, padding: '1rem', textAlign: 'center', marginBottom: '1.5rem' }}>
              <p style={{ color: '#155724', fontWeight: 700, margin: 0 }}>✓ Merci pour ton avis !</p>
            </div>
          )}

          <button onClick={resetEtape1} style={{ width: '100%', padding: '0.75rem 2rem', background: C.main, color: '#fff', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '0.95rem' }}>
            Commander autre chose
          </button>
        </div>
      )}
    </main>
  )
}