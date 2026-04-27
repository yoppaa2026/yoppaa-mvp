'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
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

const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOURS_LONGS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']

function jourActuel() {
  const idx = new Date().getDay()
  return idx === 0 ? 'dimanche' : JOURS[idx - 1]
}
function heureEnMinutes(heure) {
  const [h, m] = heure.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function maintenant() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
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
      <p style={{ fontSize: '0.875rem', color: T.muted, fontWeight: 600, margin: 0, textAlign: 'center' }}>Glisse pour confirmer le retrait</p>
      <div ref={containerRef}
        style={{ width: '100%', maxWidth: 340, height: TRACK_H, borderRadius: 100, background: confirmed ? '#D4EDDA' : `linear-gradient(to right, ${T.pale} ${p*100}%, #F3F4F6 ${p*100}%)`, position: 'relative', border: `2px solid ${confirmed ? '#16A34A' : T.light}`, transition: confirmed ? 'all 0.3s' : 'none', userSelect: 'none', cursor: confirmed ? 'default' : 'grab', touchAction: 'none' }}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: THUMB + 12, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: 700, color: confirmed ? '#16A34A' : T.mid, pointerEvents: 'none' }}>
          {confirmed ? '✓ Confirmé !' : 'Glisse →'}
        </div>
        <div style={{ position: 'absolute', left: 4 + swipeX, top: 4, width: THUMB, height: THUMB, borderRadius: '50%', background: confirmed ? '#16A34A' : T.main, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.15)', transition: swiping ? 'none' : 'left 0.3s, background 0.3s', userSelect: 'none' }}>
          {confirmed ? '✓' : '→'}
        </div>
      </div>
    </div>
  )
}

// ─── Avis expandable ──────────────────────────────────────────────────────────
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
      {a.commentaire && !ouvert && (
        <p style={{ fontSize: '0.8rem', color: T.muted, marginTop: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{a.commentaire}</p>
      )}
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

// ─── Sélecteur d'options article ──────────────────────────────────────────────
function OptionsSelector({ article, groupes, onAjouter }) {
  const [selections, setSelections] = useState({})
  const [erreurs, setErreurs] = useState({})

  function toggleValeur(groupe, valeur) {
    setSelections(prev => {
      const current = prev[groupe.id] || []
      if (groupe.type === 'unique') return { ...prev, [groupe.id]: [valeur] }
      const exists = current.find(v => v.id === valeur.id)
      return { ...prev, [groupe.id]: exists ? current.filter(v => v.id !== valeur.id) : [...current, valeur] }
    })
    setErreurs(p => ({ ...p, [groupe.id]: false }))
  }

  function valider() {
    const errs = {}; let ok = true
    groupes.forEach(g => {
      if (g.obligatoire && (!selections[g.id] || selections[g.id].length === 0)) { errs[g.id] = true; ok = false }
    })
    setErreurs(errs)
    if (!ok) return
    onAjouter(article, Object.keys(selections).length > 0 ? selections : null)
  }

  const supplement = Object.values(selections).flat().reduce((acc, v) => acc + (v.prix_supplement||0), 0)

  return (
    <div style={{ background: T.pale, borderRadius: 14, padding: '1rem', marginTop: 8, border: `1.5px solid ${T.main}33` }}>
      <p style={{ fontWeight: 800, color: T.deep, marginBottom: 10, fontSize: '0.9rem' }}>⚙️ Personnalise ton {article.nom}</p>
      {groupes.map(g => (
        <div key={g.id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <p style={{ fontWeight: 700, color: T.ink, fontSize: '0.82rem' }}>{g.nom}</p>
            {g.obligatoire && <span style={{ fontSize: '0.62rem', fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '1px 6px', borderRadius: 100 }}>Obligatoire</span>}
            <span style={{ fontSize: '0.62rem', fontWeight: 700, background: g.type === 'unique' ? '#FEF3C7' : T.pale, color: g.type === 'unique' ? '#92400E' : T.main, padding: '1px 6px', borderRadius: 100 }}>
              {g.type === 'unique' ? '1 choix' : 'Multi'}
            </span>
          </div>
          {erreurs[g.id] && <p style={{ fontSize: '0.72rem', color: '#DC2626', marginBottom: 4 }}>⚠️ Choix obligatoire</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(g.valeurs||[]).map(v => {
              const selected = (selections[g.id]||[]).find(s => s.id === v.id)
              return (
                <button key={v.id} onClick={() => toggleValeur(g, v)}
                  style={{ padding: '0.35rem 0.75rem', borderRadius: 100, border: `1.5px solid ${selected ? T.main : T.pale}`, background: selected ? T.main : '#fff', color: selected ? '#fff' : T.ink, fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s' }}>
                  {v.nom}{v.prix_supplement > 0 ? ` +${Number(v.prix_supplement).toFixed(2)}€` : ''}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <button onClick={valider}
        style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 100, background: T.main, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif' }}>
        Ajouter au panier{supplement > 0 ? ` (+${supplement.toFixed(2)}€)` : ''}
      </button>
    </div>
  )
}

// ─── Récap panier ─────────────────────────────────────────────────────────────
function RecapPanier({ panier, onRetirer, onAjouter, total, onValider }) {
  const items = Object.entries(panier)
  if (items.length === 0) return null

  function labelOptions(options) {
    if (!options) return null
    return Object.values(options).flat().map(v => v.nom).join(', ')
  }

  return (
    <div style={{ background: '#fff', borderRadius: 20, border: `2px solid ${T.main}22`, overflow: 'hidden', marginTop: 20, boxShadow: `0 8px 32px ${T.main}18` }}>
      <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, padding: '0.875rem 1.25rem' }}>
        <p style={{ fontWeight: 800, color: '#fff', fontSize: '0.875rem', margin: 0 }}>🛒 Mon panier</p>
      </div>
      <div style={{ padding: '0.5rem 1.25rem' }}>
        {items.map(([key, item]) => {
          const opts = labelOptions(item.options)
          const prixUnitaire = item.prix + (item.options ? Object.values(item.options).flat().reduce((s, v) => s + (v.prix_supplement||0), 0) : 0)
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.625rem 0', borderBottom: `1px solid ${T.pale}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button onClick={() => onRetirer(key)}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${T.main}`, background: '#fff', color: T.main, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontWeight: 800, minWidth: 20, textAlign: 'center', fontSize: '1rem', color: T.ink }}>{item.quantite}</span>
                <button onClick={() => onAjouter(key, item)}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: T.main, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, color: T.ink, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nom}</p>
                {opts && <p style={{ fontSize: '0.7rem', color: T.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opts}</p>}
              </div>
              <p style={{ fontWeight: 800, color: T.main, fontSize: '0.9rem', flexShrink: 0 }}>
                {(prixUnitaire * item.quantite).toFixed(2)}€
              </p>
            </div>
          )
        })}
      </div>
      <div style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, color: T.muted, fontSize: '0.875rem' }}>Total commande</span>
          <span style={{ fontWeight: 900, color: T.ink, fontSize: '1.25rem', letterSpacing: '-0.5px' }}>{total.toFixed(2)}€</span>
        </div>
        <button onClick={onValider}
          style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif', letterSpacing: '-0.3px' }}>
          Choisir mon créneau →
        </button>
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function CommanderSlug() {
  const { slug } = useParams()
  const router = useRouter()

  const [etape, setEtape] = useState(2)
  const [commercant, setCommercant] = useState(null)
  const [articles, setArticles] = useState([])
  const [creneaux, setCreneaux] = useState([])
  const [avisCommerce, setAvisCommerce] = useState([])
  const [notesInfo, setNotesInfo] = useState({ moyenne: 0, count: 0 })
  const [panier, setPanier] = useState({})
  const [creneauChoisi, setCreneauChoisi] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingCommande, setLoadingCommande] = useState(false)
  const [client, setClient] = useState({ prenom: '', nom: '', email: '', telephone: '' })
  const [rgpdCommande, setRgpdCommande] = useState(false)
  const [rgpdMarketing, setRgpdMarketing] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [modeLendemain, setModeLendemain] = useState(false)
  const [joursDispos, setJoursDispos] = useState([])
  const [jourSelectionne, setJourSelectionne] = useState(0)
  const [optionsParArticle, setOptionsParArticle] = useState({})
  const [derniereCommande, setDerniereCommande] = useState(null)

  // ─── Barre catégories sticky ──────────────────────────────────
  const [categorieActive, setCategorieActive] = useState(null)
  const [catBarVisible, setCatBarVisible] = useState(false)
  const catRefs = useRef({})
  const headerRef = useRef(null)
  const scrollRef = useRef(null)
  const catBarRef = useRef(null)

  useEffect(() => {
    if (!slug) return
    const email = localStorage.getItem('yoppaa_email')
    const prenom = localStorage.getItem('yoppaa_prenom')
    const nom = localStorage.getItem('yoppaa_nom')
    const id = localStorage.getItem('yoppaa_client_id')
    if (email && id) {
      setClient(p => ({ ...p, email, prenom: prenom || '', nom: nom || '' }))
      setClientId(id)
    }
    chargerCommercant(slug)
  }, [slug])

  async function chargerCommercant(slug) {
    setLoading(true)
    const { data: c } = await supabase.from('commercants').select('*').eq('slug', slug).single()
    if (!c) { router.push('/commander'); return }
    setCommercant(c)

    const [{ data: arts }, { data: cren }, { data: avis }, { data: avisNotes }] = await Promise.all([
      supabase.from('articles').select('*').eq('commercant_id', c.id).eq('actif', true).order('categorie').order('nom'),
      supabase.from('creneaux').select('*').eq('commercant_id', c.id).eq('actif', true).order('heure_debut'),
      supabase.from('avis').select('*, client:clients(nom)').eq('commercant_id', c.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('avis').select('note').eq('commercant_id', c.id),
    ])

    if (avisNotes?.length > 0) {
      setNotesInfo({ moyenne: avisNotes.reduce((a, x) => a + x.note, 0) / avisNotes.length, count: avisNotes.length })
    }

    const horizon = c.horizon_commande || 1
    const heureOuverture = c.heure_ouverture_resa ? c.heure_ouverture_resa.slice(0,5) : '21:00'
    const now = maintenant()
    const resaOuverte = now >= heureEnMinutes(heureOuverture)

    // Charger toutes les commandes actives (pour compter les places prises)
    const { data: commandesActives } = await supabase
      .from('commandes').select('creneau_id, date_commande').eq('commercant_id', c.id).neq('statut', 'recupere')

    const countParCreneau = {}
    ;(commandesActives || []).forEach(cmd => {
      countParCreneau[cmd.creneau_id] = (countParCreneau[cmd.creneau_id] || 0) + 1
    })

    // Générer les jours disponibles selon l'horizon
    const joursDispos = []
    const today = new Date(); today.setHours(0,0,0,0)

    // Jour 0 = aujourd'hui — uniquement si des créneaux futurs existent
    const creneauxAvecCount = (cren || []).map(cr => ({ ...cr, count: countParCreneau[cr.id] || 0 }))
    const crensDisposAujourdhui = creneauxAvecCount.filter(cr => heureEnMinutes(cr.heure_debut) > now)

    if (crensDisposAujourdhui.length > 0) {
      joursDispos.push({ date: new Date(today), label: "Aujourd'hui", creneaux: creneauxAvecCount })
    }

    // Jours suivants selon horizon (si résa ouverte OU horizon > 1)
    const maxJours = resaOuverte ? horizon : Math.max(horizon - 1, 0)
    for (let i = 1; i <= maxJours; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i)
      const label = i === 1 ? 'Demain' : d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
      // Pour les jours futurs : tous les créneaux sont disponibles (pas de notion "passé")
      const crensFuturs = creneauxAvecCount.map(cr => ({ ...cr, count: 0 })) // reset count pour jours futurs
      joursDispos.push({ date: d, label, creneaux: crensFuturs })
    }

    // Si aucun jour dispo aujourd'hui mais horizon = 1 et résa pas encore ouverte
    if (joursDispos.length === 0) {
      joursDispos.push({ date: new Date(today), label: "Aujourd'hui", creneaux: creneauxAvecCount })
    }

    const artIds = (arts||[]).map(a => a.id)
    let opts = {}
    if (artIds.length > 0) {
      const { data: groupesData } = await supabase
        .from('article_options_groupes')
        .select('*, valeurs:article_options_valeurs(*)')
        .in('article_id', artIds)
        .order('created_at')
      ;(groupesData||[]).forEach(g => {
        if (!opts[g.article_id]) opts[g.article_id] = []
        opts[g.article_id].push(g)
      })
    }

    setArticles(arts||[])
    setOptionsParArticle(opts)
    setCreneaux(creneauxAvecCount)
    setJoursDispos(joursDispos)
    setJourSelectionne(0)
    setAvisCommerce(avis||[])
    setModeLendemain(joursDispos[0]?.label !== "Aujourd'hui")
    setLoading(false)
  }

  // ─── Scroll spy pour la barre catégories ─────────────────────
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !headerRef.current) return
    const scrollTop = scrollRef.current.scrollTop
    const headerH = headerRef.current.offsetHeight

    // Afficher la barre catégories après le header
    setCatBarVisible(scrollTop > headerH - 60)

    // Détecter la catégorie active
    const cats = Object.keys(catRefs.current)
    let active = cats[0]
    for (const cat of cats) {
      const el = catRefs.current[cat]
      if (!el) continue
      const top = el.offsetTop - headerH - 80
      if (scrollTop >= top) active = cat
    }
    setCategorieActive(active)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll, etape])

  function scrollToCategorie(cat) {
    const el = catRefs.current[cat]
    const scroll = scrollRef.current
    const header = headerRef.current
    if (!el || !scroll || !header) return
    const top = el.offsetTop - header.offsetHeight - 56
    scroll.scrollTo({ top, behavior: 'smooth' })
    setCategorieActive(cat)
  }

  // ─── Panier ───────────────────────────────────────────────────
  function ajouterAuPanier(article, options = null) {
    const key = options ? `${article.id}_${JSON.stringify(options)}` : String(article.id)
    setPanier(prev => ({ ...prev, [key]: { ...article, options, quantite: (prev[key]?.quantite || 0) + 1 } }))
  }
  function incrementerPanier(key, item) {
    setPanier(prev => ({ ...prev, [key]: { ...item, quantite: (prev[key]?.quantite || 0) + 1 } }))
  }
  function retirerDuPanier(key) {
    setPanier(prev => {
      const next = { ...prev }
      if (next[key]?.quantite > 1) next[key] = { ...next[key], quantite: next[key].quantite - 1 }
      else delete next[key]
      return next
    })
  }
  function qteTotaleArticle(articleId) {
    return Object.entries(panier)
      .filter(([key]) => key === String(articleId) || key.startsWith(`${articleId}_`))
      .reduce((acc, [, item]) => acc + item.quantite, 0)
  }
  function totalPanier() {
    return Object.values(panier).reduce((acc, i) => {
      const supplement = i.options ? Object.values(i.options).flat().reduce((s, v) => s + (v.prix_supplement||0), 0) : 0
      return acc + (i.prix + supplement) * i.quantite
    }, 0)
  }

  async function getOuCreerClient(email, prenom, nom) {
    const nomComplet = `${prenom} ${nom}`.trim()
    const { data: ex } = await supabase.from('clients').select('id').eq('email', email).single()
    const id = ex ? ex.id : (await supabase.from('clients').insert({ email, nom: nomComplet }).select('id').single()).data?.id
    if (!id) return null
    setClientId(id)
    localStorage.setItem('yoppaa_client_id', id)
    localStorage.setItem('yoppaa_email', email)
    localStorage.setItem('yoppaa_prenom', prenom)
    localStorage.setItem('yoppaa_nom', nom)
    return id
  }

  async function passerCommande() {
    if (!creneauChoisi || !client.prenom || !client.nom || !client.email || !client.telephone || !rgpdCommande || !commercant) return
    setLoadingCommande(true)
    const nomComplet = `${client.prenom} ${client.nom}`.trim()
    const cid = await getOuCreerClient(client.email, client.prenom, client.nom)
    const { data: commande } = await supabase.from('commandes').insert({
      commercant_id: commercant.id, creneau_id: creneauChoisi,
      client_nom: nomComplet, client_email: client.email, client_telephone: client.telephone,
      rgpd_commande: true, rgpd_marketing: rgpdMarketing,
      total: totalPanier(), statut: 'en_attente',
    }).select().single()
    if (commande) {
      await supabase.from('commande_articles').insert(
        Object.values(panier).map(i => ({ commande_id: commande.id, article_id: i.id, quantite: i.quantite, prix_unitaire: i.prix }))
      )
      setDerniereCommande({ ...commande, client_id: cid })
      setEtape(4)
    }
    setLoadingCommande(false)
  }

  const formValide = creneauChoisi && client.prenom.trim() && client.nom.trim() && client.email.trim() && client.telephone.trim() && rgpdCommande
  const inputSt = { width: '100%', padding: '0.875rem 1rem', border: `1.5px solid ${T.pale}`, borderRadius: 12, marginBottom: 10, fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none', color: T.ink, background: '#fff', display: 'block' }
  const btnPrimary = { width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${T.bgPanel} 0%, #2D0F6B 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;800;900&display=swap" rel="stylesheet"/>
      <div style={{ display: 'flex', gap: 10 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: [T.light, T.mid, T.main][i], animation: `pulse 0.8s ease-in-out ${i*0.2}s infinite alternate` }}/>
        ))}
      </div>
      <p style={{ color: T.light, fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif', fontWeight: 600 }}>Chargement...</p>
      <style>{`@keyframes pulse { from { opacity:0.4; transform:scale(0.8); } to { opacity:1; transform:scale(1.2); } }`}</style>
    </div>
  )

  // ─── Catégories pour la barre ─────────────────────────────────
  const categories = [...new Set(articles.map(a => a.categorie).filter(Boolean))]
  const sansCat = articles.filter(a => !a.categorie)
  const toutesLesCats = [...categories, ...(sansCat.length > 0 ? ['__autres__'] : [])]

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; width: 100%; overflow: hidden; }
        body { background: ${T.bg}; font-family: "DM Sans", sans-serif; font-size: 16px; -webkit-text-size-adjust: 100%; }
        .page-wrap { display: flex; flex-direction: column; height: 100dvh; max-width: 640px; margin: 0 auto; background: ${T.bg}; overflow: hidden; width: 100%; position: relative; }
        .scroll-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        @media (min-width: 480px) { .grid3 { grid-template-columns: 1fr 1fr 1fr; } }
        input, textarea, button, select { font-family: "DM Sans", sans-serif; }

        /* Barre catégories */
        .cat-bar { display: flex; gap: 0; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; background: #fff; border-bottom: 1px solid ${T.pale}; }
        .cat-bar::-webkit-scrollbar { display: none; }
        .cat-pill { flex-shrink: 0; padding: 0.75rem 1rem; border: none; background: transparent; font-family: "DM Sans", sans-serif; font-weight: 700; font-size: 0.82rem; cursor: pointer; color: ${T.muted}; border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap; }
        .cat-pill.active { color: ${T.main}; border-bottom-color: ${T.main}; }

        /* Article card hover */
        .art-card { transition: box-shadow 0.15s, transform 0.15s; }
        .art-card:hover { box-shadow: 0 6px 24px rgba(107,53,196,0.12) !important; transform: translateY(-1px); }

        /* Animations */
        @keyframes pulse { from { opacity:0.4; transform:scale(0.8); } to { opacity:1; transform:scale(1.2); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideIn { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="page-wrap">

        {/* ── TOPBAR fixe ── */}
        <div style={{ background: T.bgPanel, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderBottom: `1px solid ${T.main}33` }}>
          {/* Bouton retour */}
          <button onClick={() => router.push('/commander')}
            style={{ background: `rgba(255,255,255,0.1)`, border: `1px solid rgba(255,255,255,0.15)`, color: '#fff', cursor: 'pointer', borderRadius: 10, padding: '0.45rem 0.875rem', fontWeight: 700, fontSize: '0.82rem', flexShrink: 0, backdropFilter: 'blur(8px)', letterSpacing: '-0.2px' }}>
            ← Retour
          </button>

          {/* Badge type — hype */}
          {commercant?.type && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <span style={{ background: `linear-gradient(135deg, ${T.main}88, ${T.mid}88)`, backdropFilter: 'blur(8px)', border: `1px solid ${T.light}44`, borderRadius: 100, padding: '5px 14px', fontSize: '0.78rem', fontWeight: 800, color: '#fff', letterSpacing: '0.5px', textTransform: 'uppercase', boxShadow: `0 2px 12px ${T.main}44` }}>
                {commercant.type}
              </span>
            </div>
          )}
          {!commercant?.type && <div style={{ flex: 1 }}/>}

          {/* Étapes — pills stylées */}
          {etape < 4 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {[{ n: 1, label: 'Menu' }, { n: 2, label: 'Créneau' }].map((s, i) => {
                const done = etape > s.n + 1
                const active = etape === s.n + 1
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: active ? T.main : done ? '#16A34A22' : 'rgba(255,255,255,0.08)', border: `1.5px solid ${active ? T.light : done ? '#16A34A' : 'rgba(255,255,255,0.15)'}`, borderRadius: 100, padding: '3px 10px', transition: 'all 0.3s' }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: active ? '#fff' : done ? '#16A34A' : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 900, color: active ? T.main : '#fff', flexShrink: 0 }}>
                        {done ? '✓' : s.n}
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: active ? '#fff' : done ? '#16A34A' : 'rgba(255,255,255,0.5)', letterSpacing: '0.2px' }}>{s.label}</span>
                    </div>
                    {i === 0 && <div style={{ width: 12, height: 1.5, borderRadius: 1, background: etape >= 3 ? '#16A34A' : 'rgba(255,255,255,0.15)' }}/>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── SCROLL BODY ── */}
        <div className="scroll-body" ref={scrollRef}>

          {/* ÉTAPE 2 — Articles */}
          {etape === 2 && commercant && (
            <>
              {/* ── HEADER COMMERÇANT ── */}
              <div ref={headerRef}>
                {/* Bannière */}
                <div style={{ position: 'relative', height: 160, overflow: 'hidden', background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 40%, ${T.main} 100%)` }}>
                  {commercant.logo_url && (
                    <img src={commercant.logo_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.25 }}/>
                  )}
                  {/* Motif décoratif */}
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 80% 20%, ${T.mid}55 0%, transparent 60%), radial-gradient(circle at 20% 80%, ${T.light}22 0%, transparent 50%), radial-gradient(circle at 50% 110%, ${T.main}44 0%, transparent 50%)` }}/>
                  {/* Contenu bannière */}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '1rem 1.25rem' }}>
                    {/* 3 points yo·pp·aa */}
                    <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 5 }}>
                      {[{c:'#fff',o:0.35},{c:T.light,o:0.8},{c:T.mid,o:0.9}].map((d,i) => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: d.c, opacity: d.o }}/>
                      ))}
                    </div>
                    {/* Badge type */}
                    {commercant?.type && (
                      <span style={{ display: 'inline-block', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 100, padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#fff', marginBottom: 6, alignSelf: 'flex-start', letterSpacing: '0.3px' }}>
                        {commercant.type}
                      </span>
                    )}
                    {/* Nom en grand */}
                    <h1 style={{ fontWeight: 900, fontSize: '1.75rem', color: '#fff', letterSpacing: '-0.75px', lineHeight: 1.1, textShadow: '0 2px 12px rgba(0,0,0,0.3)', margin: 0 }}>
                      {commercant?.nom}
                    </h1>
                    {commercant?.adresse && (
                      <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', marginTop: 4, fontWeight: 500 }}>📍 {commercant.adresse}</p>
                    )}
                  </div>
                </div>

                {/* Infos commerçant */}
                <div style={{ padding: '0.75rem 1rem 0.875rem', background: '#fff', borderBottom: `1px solid ${T.pale}`, position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Logo flottant — à droite, grand */}
                  <div style={{ position: 'absolute', top: -36, right: '1rem', width: 72, height: 72, borderRadius: 18, background: '#fff', border: `4px solid #fff`, boxShadow: `0 6px 24px rgba(0,0,0,0.2), 0 0 0 1px ${T.pale}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {commercant.logo_url
                      ? <img src={commercant.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                      : <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>🏪</div>
                    }
                  </div>

                  <div style={{ flex: 1, paddingRight: 84 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                      <Etoiles note={notesInfo.moyenne} taille={13}/>
                      {notesInfo.count > 0
                        ? <span style={{ fontSize: '0.7rem', color: T.muted }}>{notesInfo.count} avis</span>
                        : <span style={{ fontSize: '0.7rem', color: '#D1D5DB' }}>Pas encore d'avis</span>
                      }
                    </div>

                    {commercant.description && (
                      <p style={{ fontSize: '0.78rem', color: T.muted, lineHeight: 1.5 }}>{commercant.description}</p>
                    )}

                    {/* Horaires inline */}
                    {commercant.horaires_detail && (() => {
                      const j = jourActuel()
                      const h = commercant.horaires_detail[j]
                      if (!h) return null
                      return (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, background: h.ouvert ? '#F0FDF4' : '#FEF2F2', borderRadius: 100, padding: '4px 10px', border: `1px solid ${h.ouvert ? '#16A34A33' : '#DC262633'}` }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: h.ouvert ? '#16A34A' : '#DC2626', boxShadow: `0 0 6px ${h.ouvert ? '#16A34A' : '#DC2626'}88`, flexShrink: 0 }}/>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: h.ouvert ? '#16A34A' : '#DC2626' }}>
                            {h.ouvert ? `Ouvert · ${h.debut.slice(0,5)}–${h.fin.slice(0,5)}` : 'Fermé aujourd\'hui'}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* Horaires 7 jours — collapsible */}
                {commercant.horaires_detail && (
                  <HorairesSection horaires={commercant.horaires_detail} />
                )}
              </div>

              {/* ── BARRE CATÉGORIES STICKY ── */}
              {toutesLesCats.length > 1 && (
                <div ref={catBarRef}
                  style={{ position: 'sticky', top: 0, zIndex: 20, transition: 'box-shadow 0.2s', boxShadow: catBarVisible ? '0 2px 12px rgba(0,0,0,0.08)' : 'none' }}>
                  <div className="cat-bar">
                    {toutesLesCats.map(cat => (
                      <button key={cat} className={`cat-pill ${categorieActive === cat ? 'active' : ''}`}
                        onClick={() => scrollToCategorie(cat)}>
                        {cat === '__autres__' ? 'Autres' : cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── ARTICLES ── */}
              <div style={{ padding: '0.875rem 1rem 0' }}>
                {categories.map(cat => {
                  const artsDecat = articles.filter(a => a.categorie === cat)
                  if (!artsDecat.length) return null
                  return (
                    <div key={cat} ref={el => catRefs.current[cat] = el} style={{ marginBottom: 4 }}>
                      {/* Titre catégorie */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 10 }}>
                        <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink, letterSpacing: '-0.3px' }}>{cat}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: T.muted }}>{artsDecat.length} article{artsDecat.length > 1 ? 's' : ''}</span>
                      </div>
                      {artsDecat.map(a => <ArticleRow key={a.id} article={a} panier={panier} optionsParArticle={optionsParArticle} ajouterAuPanier={ajouterAuPanier} qteTotaleArticle={qteTotaleArticle}/>)}
                    </div>
                  )
                })}

                {sansCat.length > 0 && (
                  <div ref={el => catRefs.current['__autres__'] = el} style={{ marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 10 }}>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink, letterSpacing: '-0.3px' }}>Autres</span>
                    </div>
                    {sansCat.map(a => <ArticleRow key={a.id} article={a} panier={panier} optionsParArticle={optionsParArticle} ajouterAuPanier={ajouterAuPanier} qteTotaleArticle={qteTotaleArticle}/>)}
                  </div>
                )}

                {/* Avis */}
                {avisCommerce.length > 0 && (
                  <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${T.pale}` }}>
                    <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.deep, marginBottom: '0.75rem' }}>⭐ Avis clients</h3>
                    {avisCommerce.map(a => <CarteAvis key={a.id} a={a}/>)}
                  </div>
                )}

                <RecapPanier
                  panier={panier}
                  onRetirer={retirerDuPanier}
                  onAjouter={incrementerPanier}
                  total={totalPanier()}
                  onValider={() => setEtape(3)}
                />
                <div style={{ height: 24 }}/>
              </div>
            </>
          )}

          {/* ÉTAPE 3 — Créneau + coordonnées + RGPD */}
          {etape === 3 && commercant && (
            <div>
              {/* ── Header hype étape 3 ── */}
              <div style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.main} 100%)`, padding: '1.25rem 1rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 80% 20%, ${T.mid}44 0%, transparent 50%), radial-gradient(circle at 20% 80%, ${T.light}18 0%, transparent 50%)`, pointerEvents: 'none' }}/>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, opacity: 0.8 }}>{commercant.nom}</p>
                <h2 style={{ fontWeight: 900, fontSize: '1.3rem', color: '#fff', letterSpacing: '-0.5px', marginBottom: 0, textShadow: `0 2px 12px ${T.deep}88` }}>
                  Choisis ta date<br/>et ton créneau
                </h2>
              </div>

              <div style={{ padding: '0 1rem 1rem', marginTop: -1 }}>
                {/* Mini récap commande — card flottante */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '1rem 1.125rem', marginBottom: '1.25rem', border: `1.5px solid ${T.pale}`, boxShadow: `0 4px 20px ${T.main}14`, marginTop: '-1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🛒 Ta commande</span>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                  </div>
                  {Object.values(panier).map((item, i) => {
                    const supplement = item.options ? Object.values(item.options).flat().reduce((s, v) => s + (v.prix_supplement||0), 0) : 0
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 3 }}>
                        <span style={{ color: T.ink, fontWeight: 600 }}>{item.quantite}× {item.nom}</span>
                        <span style={{ color: T.main, fontWeight: 800 }}>{((item.prix + supplement) * item.quantite).toFixed(2)}€</span>
                      </div>
                    )
                  })}
                  <div style={{ borderTop: `1px solid ${T.pale}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: T.muted, fontSize: '0.82rem' }}>Total</span>
                    <span style={{ fontWeight: 900, color: T.ink, fontSize: '1.1rem', letterSpacing: '-0.5px' }}>{totalPanier().toFixed(2)}€</span>
                  </div>
                </div>

              {/* ── Onglets jours ── */}
              {joursDispos.length > 1 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                  {joursDispos.map((jour, idx) => (
                    <button key={idx} onClick={() => { setJourSelectionne(idx); setCreneauChoisi(null) }}
                      style={{ flexShrink: 0, padding: '0.5rem 1.125rem', borderRadius: 100, border: `2px solid ${jourSelectionne === idx ? T.main : T.pale}`, background: jourSelectionne === idx ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: jourSelectionne === idx ? '#fff' : T.muted, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s', boxShadow: jourSelectionne === idx ? `0 4px 16px ${T.main}44` : 'none', fontFamily: '"DM Sans", sans-serif' }}>
                      {jour.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Label date sélectionnée */}
              {joursDispos[jourSelectionne] && (
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ background: T.pale, borderRadius: 100, padding: '2px 8px', color: T.main, fontSize: '0.68rem' }}>
                    📅 {joursDispos[jourSelectionne].label === "Aujourd'hui" || joursDispos[jourSelectionne].label === 'Demain'
                      ? joursDispos[jourSelectionne].label
                      : joursDispos[jourSelectionne].date.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
                    }
                  </span>
                </p>
              )}

              {/* Créneaux du jour sélectionné — passés masqués */}
              <div className="grid3" style={{ marginBottom: '1.5rem' }}>
                {(joursDispos[jourSelectionne]?.creneaux || creneaux)
                  .filter(c => {
                    const estAujourdhui = jourSelectionne === 0 && joursDispos[0]?.label === "Aujourd'hui"
                    if (estAujourdhui && heureEnMinutes(c.heure_debut) <= maintenant()) return false
                    return true
                  })
                  .map(c => {
                  const complet = c.count >= c.max_commandes
                  const placesRestantes = c.max_commandes - c.count
                  const bientotComplet = !complet && placesRestantes <= 1
                  const presqueComplet = !complet && placesRestantes === 2
                  const choisi = creneauChoisi === c.id
                  let mention = null
                  if (complet) mention = { text: 'Complet', color: '#DC2626' }
                  else if (bientotComplet) mention = { text: '🔥 Dernière place !', color: '#EA580C' }
                  else if (presqueComplet) mention = { text: '⚡ Presque complet', color: '#D97706' }
                  return (
                    <div key={c.id} onClick={() => !complet && setCreneauChoisi(c.id)}
                      style={{ padding: '0.875rem 0.5rem', borderRadius: 14, border: `2px solid ${complet ? '#E5E7EB' : choisi ? T.main : T.pale}`, background: complet ? '#F9FAFB' : choisi ? T.pale : '#fff', cursor: complet ? 'default' : 'pointer', textAlign: 'center', fontWeight: 700, color: complet ? '#D1D5DB' : T.ink, fontSize: '0.875rem', transition: 'all 0.15s', boxShadow: choisi ? `0 4px 16px ${T.main}33` : 'none' }}>
                      <div style={{ textDecoration: complet ? 'line-through' : 'none', fontSize: '0.875rem', letterSpacing: '-0.3px' }}>
                        {c.heure_debut.slice(0,5)}<br/><span style={{ fontSize: '0.72rem', fontWeight: 600, color: T.muted }}>–{c.heure_fin.slice(0,5)}</span>
                      </div>
                      {mention && <div style={{ fontSize: '0.6rem', fontWeight: 800, color: mention.color, marginTop: 4, lineHeight: 1.2 }}>{mention.text}</div>}
                      {choisi && <div style={{ fontSize: '0.6rem', fontWeight: 800, color: T.main, marginTop: 4 }}>✓ Choisi</div>}
                    </div>
                  )
                })}
                {/* Aucun créneau dispo sur ce jour */}
                {(joursDispos[jourSelectionne]?.creneaux || creneaux).filter(c => {
                  const estAujourdhui = jourSelectionne === 0 && joursDispos[0]?.label === "Aujourd'hui"
                  if (estAujourdhui && heureEnMinutes(c.heure_debut) <= maintenant()) return false
                  return true
                }).length === 0 && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '1.5rem', color: T.muted, fontSize: '0.875rem', fontWeight: 600 }}>
                    Aucun créneau disponible ce jour — choisis une autre date.
                  </div>
                )}
              </div>

              {/* ── Coordonnées ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 4 }}>
                <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink, letterSpacing: '-0.3px' }}>Tes coordonnées</span>
                <div style={{ flex: 1, height: 1, background: T.pale }}/>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <input placeholder="Prénom *" type="text" value={client.prenom} onChange={e => setClient(p => ({ ...p, prenom: e.target.value }))} style={{ ...inputSt, marginBottom: 0 }}/>
                <input placeholder="Nom *" type="text" value={client.nom} onChange={e => setClient(p => ({ ...p, nom: e.target.value }))} style={{ ...inputSt, marginBottom: 0 }}/>
              </div>
              <input placeholder="Email *" type="email" value={client.email} onChange={e => setClient(p => ({ ...p, email: e.target.value }))} style={inputSt}/>
              <input placeholder="Téléphone *" type="tel" value={client.telephone} onChange={e => setClient(p => ({ ...p, telephone: e.target.value }))} style={inputSt}/>

              {/* RGPD */}
              <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${T.pale}`, overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 8px rgba(107,53,196,0.05)' }}>
                <div style={{ padding: '0.625rem 1rem', background: T.pale, borderBottom: `1px solid ${T.main}11` }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔒 Confidentialité</p>
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.875rem 1rem', cursor: 'pointer', borderBottom: `1px solid ${T.pale}`, background: rgpdCommande ? '#F0FDF4' : '#fff' }}>
                  <div onClick={() => setRgpdCommande(v => !v)}
                    style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${rgpdCommande ? '#16A34A' : '#D1D5DB'}`, background: rgpdCommande ? '#16A34A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s', cursor: 'pointer' }}>
                    {rgpdCommande && <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 900 }}>✓</span>}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.82rem', fontWeight: 700, color: T.ink, marginBottom: 2 }}>
                      Traitement de ma commande <span style={{ fontSize: '0.62rem', fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '1px 6px', borderRadius: 100, marginLeft: 4 }}>Obligatoire</span>
                    </p>
                    <p style={{ fontSize: '0.75rem', color: T.muted, lineHeight: 1.5 }}>
                      J'accepte que mes coordonnées soient transmises à <strong>{commercant.nom}</strong> pour le traitement de ma commande.
                    </p>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.875rem 1rem', cursor: 'pointer', background: rgpdMarketing ? '#F0FDF4' : '#fff' }}>
                  <div onClick={() => setRgpdMarketing(v => !v)}
                    style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${rgpdMarketing ? '#16A34A' : '#D1D5DB'}`, background: rgpdMarketing ? '#16A34A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s', cursor: 'pointer' }}>
                    {rgpdMarketing && <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 900 }}>✓</span>}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.82rem', fontWeight: 700, color: T.ink, marginBottom: 2 }}>
                      Offres et actualités <span style={{ fontSize: '0.62rem', fontWeight: 600, background: T.pale, color: T.main, padding: '1px 6px', borderRadius: 100, marginLeft: 4 }}>Optionnel</span>
                    </p>
                    <p style={{ fontSize: '0.75rem', color: T.muted, lineHeight: 1.5 }}>
                      J'accepte que <strong>{commercant.nom}</strong> utilise mes coordonnées pour m'envoyer des offres et actualités.
                    </p>
                  </div>
                </label>
              </div>

              <button onClick={passerCommande} disabled={loadingCommande || !formValide}
                style={{ ...btnPrimary, opacity: !formValide ? 0.45 : 1, cursor: !formValide ? 'default' : 'pointer' }}>
                {loadingCommande ? 'En cours...' : `Confirmer ma commande — ${totalPanier().toFixed(2)}€`}
              </button>
              {!rgpdCommande && (
                <p style={{ fontSize: '0.75rem', color: '#DC2626', textAlign: 'center', marginTop: 6, fontWeight: 600 }}>
                  ⚠️ Accepte le traitement de ta commande pour continuer
                </p>
              )}
              <p style={{ fontSize: '0.78rem', color: '#9a8ab0', textAlign: 'center', marginTop: 8, marginBottom: 24 }}>Le paiement sera activé prochainement</p>
              </div>{/* fin padding div */}
            </div>
          )}

          {/* ÉTAPE 4 — Confirmation */}
          {etape === 4 && commercant && (
            <div style={{ padding: '1.5rem 1rem', animation: 'fadeUp 0.4s ease' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>🎉</div>
                <p style={{ fontWeight: 900, fontSize: '1rem', color: T.main, letterSpacing: '-0.5px', marginBottom: 4 }}>yoppaa</p>
                <h2 style={{ fontWeight: 900, fontSize: '1.5rem', color: T.ink, marginBottom: '0.5rem', letterSpacing: '-0.75px' }}>Commande confirmée !</h2>
                <p style={{ color: T.deep, fontWeight: 700, marginBottom: '0.25rem' }}>Chez {commercant.nom}</p>
                <p style={{ color: T.muted, fontSize: '0.875rem' }}>Présente-toi à ton créneau — c'est tout !</p>
              </div>
              <div style={{ background: `linear-gradient(135deg, ${T.pale}, #fff)`, borderRadius: 20, padding: '1.25rem', marginBottom: '1rem', border: `1.5px solid ${T.main}22` }}>
                <p style={{ fontWeight: 800, color: T.ink, marginBottom: 8 }}>📦 Comment récupérer ta commande</p>
                <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6 }}>
                  Présente-toi chez <strong>{commercant.nom}</strong> à ton créneau.<br/>
                  Quand ta commande est prête, confirme depuis l'onglet <strong>Commandes</strong>.
                </p>
              </div>
              <button onClick={() => router.push('/commander')} style={{ ...btnPrimary, marginBottom: 10 }}>
                ← Retour à l'accueil
              </button>
              <button onClick={() => { setPanier({}); setCreneauChoisi(null); setRgpdCommande(false); setRgpdMarketing(false); setEtape(2) }}
                style={{ width: '100%', padding: '0.875rem', background: 'transparent', color: T.main, border: `1.5px solid ${T.main}`, borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                Commander autre chose chez {commercant.nom}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Horaires section collapsible ─────────────────────────────────────────────
function HorairesSection({ horaires }) {
  const [open, setOpen] = useState(false)
  const j = jourActuel()

  return (
    <div style={{ background: '#fff', borderBottom: `1px solid ${T.pale}` }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '0.625rem 1rem', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: '"DM Sans", sans-serif' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🕐 Horaires complets</span>
        <span style={{ fontSize: '0.72rem', color: T.main, fontWeight: 700 }}>{open ? '▲ Fermer' : '▼ Voir'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 1rem 0.875rem' }}>
          {JOURS.map((jour, idx) => {
            const h = horaires[jour]
            const estAujourdhui = j === jour
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
      )}
    </div>
  )
}

// ─── ArticleRow extrait du composant principal ────────────────────────────────
function ArticleRow({ article, panier, optionsParArticle, ajouterAuPanier, qteTotaleArticle }) {
  const groupes = optionsParArticle[article.id] || []
  const hasOptions = groupes.length > 0
  const [showOptions, setShowOptions] = useState(false)
  const qteTotale = qteTotaleArticle(article.id)

  return (
    <div className="art-card" style={{ background: '#fff', borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.625rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 1px 4px rgba(107,53,196,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, color: T.ink, marginBottom: 2, fontSize: '0.95rem', letterSpacing: '-0.2px' }}>{article.nom}</p>
          {article.description && <p style={{ fontSize: '0.78rem', color: T.muted, marginBottom: 5, lineHeight: 1.4 }}>{article.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: '1rem', color: T.main, fontWeight: 900, letterSpacing: '-0.3px' }}>{Number(article.prix).toFixed(2)}€</p>
            {hasOptions && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: T.mid, background: T.pale, padding: '2px 8px', borderRadius: 100 }}>Personnalisable</span>}
          </div>
          {article.stock_jour === 0 && <span style={{ fontSize: '0.68rem', background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 6, fontWeight: 700, display: 'inline-block', marginTop: 4 }}>Épuisé</span>}
        </div>
        {article.stock_jour !== 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12, flexShrink: 0 }}>
            {qteTotale > 0 && (
              <div style={{ background: T.main, color: '#fff', fontWeight: 900, fontSize: '0.78rem', borderRadius: 100, minWidth: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', boxShadow: `0 2px 8px ${T.main}55` }}>
                {qteTotale}
              </div>
            )}
            <button onClick={() => hasOptions ? setShowOptions(v => !v) : ajouterAuPanier(article)}
              style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: showOptions ? T.mid : qteTotale > 0 ? T.deep : T.main, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: hasOptions ? '1rem' : '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', boxShadow: `0 3px 12px ${T.main}44` }}>
              {hasOptions ? '⚙️' : '+'}
            </button>
          </div>
        )}
      </div>
      {showOptions && hasOptions && (
        <OptionsSelector article={article} groupes={groupes} onAjouter={(a, opts) => { ajouterAuPanier(a, opts); setShowOptions(false) }}/>
      )}
    </div>
  )
}