'use client'
import { useEffect, useState, useRef } from 'react'
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
const JOURS_LONGS  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']

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
        <p style={{ fontSize: '0.8rem', color: T.muted, marginTop: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
          {a.commentaire}
        </p>
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
      if (groupe.type === 'unique') {
        return { ...prev, [groupe.id]: [valeur] }
      } else {
        const exists = current.find(v => v.id === valeur.id)
        return { ...prev, [groupe.id]: exists ? current.filter(v => v.id !== valeur.id) : [...current, valeur] }
      }
    })
    setErreurs(p => ({ ...p, [groupe.id]: false }))
  }

  function valider() {
    const errs = {}
    let ok = true
    groupes.forEach(g => {
      if (g.obligatoire && (!selections[g.id] || selections[g.id].length === 0)) {
        errs[g.id] = true; ok = false
      }
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
  const [client, setClient] = useState({ nom: '', email: '', telephone: '' })
  const [clientId, setClientId] = useState(null)
  const [modeLendemain, setModeLendemain] = useState(false)
  const [optionsParArticle, setOptionsParArticle] = useState({})
  const [derniereCommande, setDerniereCommande] = useState(null)

  // Charger les données du commerçant au montage (et au refresh)
  useEffect(() => {
    if (!slug) return
    const email = localStorage.getItem('yoppaa_email')
    const nom = localStorage.getItem('yoppaa_nom')
    const id = localStorage.getItem('yoppaa_client_id')
    if (email && id) {
      setClient(p => ({ ...p, email, nom: nom || '' }))
      setClientId(id)
    }
    chargerCommercant(slug)
  }, [slug])

  async function chargerCommercant(slug) {
    setLoading(true)
    // Charger le commerçant par slug
    const { data: c } = await supabase
      .from('commercants')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!c) { router.push('/commander'); return }
    setCommercant(c)

    // Charger articles, créneaux, avis en parallèle
    const [{ data: arts }, { data: cren }, { data: avis }, { data: avisNotes }] = await Promise.all([
      supabase.from('articles').select('*').eq('commercant_id', c.id).eq('actif', true).order('nom'),
      supabase.from('creneaux').select('*').eq('commercant_id', c.id).eq('actif', true).order('heure_debut'),
      supabase.from('avis').select('*, client:clients(nom)').eq('commercant_id', c.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('avis').select('note').eq('commercant_id', c.id),
    ])

    // Notes moyennes
    if (avisNotes?.length > 0) {
      setNotesInfo({ moyenne: avisNotes.reduce((a, x) => a + x.note, 0) / avisNotes.length, count: avisNotes.length })
    }

    // Mode lendemain
    const heureOuverture = c.heure_ouverture_resa ? c.heure_ouverture_resa.slice(0,5) : '21:00'
    const resaLendemainOuverte = maintenant() >= heureEnMinutes(heureOuverture)
    const { data: commandesDuJour } = await supabase
      .from('commandes')
      .select('creneau_id')
      .eq('commercant_id', c.id)
      .neq('statut', 'recupere')

    const countParCreneau = {}
    ;(commandesDuJour || []).forEach(cmd => {
      countParCreneau[cmd.creneau_id] = (countParCreneau[cmd.creneau_id] || 0) + 1
    })

    const tousPassees = (cren || []).every(cr => heureEnMinutes(cr.heure_debut) <= maintenant())
    const modeLend = resaLendemainOuverte && tousPassees

    const creneauxAvecCount = (cren || []).map(cr => ({ ...cr, count: countParCreneau[cr.id] || 0 }))

    // Options articles
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
    setAvisCommerce(avis||[])
    setModeLendemain(modeLend)
    setLoading(false)
  }

  function ajouterAuPanier(a, options = null) {
    const key = options ? `${a.id}_${JSON.stringify(options)}` : a.id
    const item = options ? { ...a, options, quantite: (panier[key]?.quantite||0)+1 } : { ...a, quantite: (panier[a.id]?.quantite||0)+1 }
    setPanier(p => ({ ...p, [key]: item }))
  }
  function retirerDuPanier(id) { setPanier(p => { const n={...p}; if(n[id]?.quantite>1) n[id].quantite-=1; else delete n[id]; return n }) }
  function totalPanier() {
    return Object.values(panier).reduce((acc, i) => {
      const supplement = i.options ? Object.values(i.options).flat().reduce((s, v) => s + (v.prix_supplement||0), 0) : 0
      return acc + (i.prix + supplement) * i.quantite
    }, 0)
  }

  async function getOuCreerClient(email, nom) {
    const { data: ex } = await supabase.from('clients').select('id').eq('email', email).single()
    const id = ex ? ex.id : (await supabase.from('clients').insert({ email, nom }).select('id').single()).data?.id
    if (!id) return null
    setClientId(id)
    localStorage.setItem('yoppaa_client_id', id)
    localStorage.setItem('yoppaa_email', email)
    localStorage.setItem('yoppaa_nom', nom)
    return id
  }

  async function passerCommande() {
    if (!creneauChoisi || !client.nom || !client.email || !commercant) return
    setLoadingCommande(true)
    const cid = await getOuCreerClient(client.email, client.nom)
    const { data: commande } = await supabase.from('commandes').insert({
      commercant_id: commercant.id, creneau_id: creneauChoisi,
      client_nom: client.nom, client_email: client.email, client_telephone: client.telephone,
      total: totalPanier(), statut: 'en_attente'
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

  const card = { background: T.bgCard, borderRadius: 14, padding: '1rem', marginBottom: '0.75rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 1px 6px rgba(107,53,196,0.05)' }
  const btnPrimary = { width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: T.main, color: '#fff', boxShadow: `0 4px 20px ${T.main}44`, fontFamily: '"DM Sans", sans-serif' }
  const inputSt = { width: '100%', padding: '0.875rem 1rem', border: `1.5px solid ${T.pale}`, borderRadius: 12, marginBottom: 10, fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none', color: T.ink, background: '#fff', display: 'block' }

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;800;900&display=swap" rel="stylesheet"/>
      <div style={{ display: 'flex', gap: 8 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: [T.light, T.mid, T.main][i], animation: `pulse 0.8s ease-in-out ${i*0.2}s infinite alternate` }}/>
        ))}
      </div>
      <style>{`@keyframes pulse { from { opacity:0.4; transform:scale(0.8); } to { opacity:1; transform:scale(1.2); } }`}</style>
    </div>
  )

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; width: 100%; overflow-x: hidden; }
        body { background: ${T.bg}; font-family: "DM Sans", sans-serif; font-size: 16px; -webkit-text-size-adjust: 100%; }
        .page-wrap { display: flex; flex-direction: column; min-height: 100dvh; max-width: 640px; margin: 0 auto; background: ${T.bg}; overflow-x: hidden; width: 100%; }
        .topbar { flex-shrink: 0; background: ${T.bgPanel}; border-bottom: 1px solid ${T.main}33; }
        .scroll-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        @media (min-width: 480px) { .grid3 { grid-template-columns: 1fr 1fr 1fr; } }
        input, textarea, button, select { font-family: "DM Sans", sans-serif; }
        @keyframes pulse { from { opacity:0.4; transform:scale(0.8); } to { opacity:1; transform:scale(1.2); } }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="page-wrap">
        {/* ── TOPBAR ── */}
        <div className="topbar" style={{ padding: '0.875rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/commander')}
              style={{ background: `${T.main}55`, border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 10, padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0 }}>
              ← Retour
            </button>
            {etape < 4 && (
              <div style={{ display: 'flex', gap: 4 }}>
                {[2,3].map(s => (
                  <div key={s} style={{ height: 3, width: etape >= s ? 32 : 20, borderRadius: 3, background: etape >= s ? T.light : `${T.main}44`, transition: 'all 0.3s' }}/>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── CONTENU ── */}
        <div className="scroll-body">

          {/* ÉTAPE 2 — Articles */}
          {etape === 2 && commercant && (
            <div style={{ padding: '1rem' }}>
              {/* En-tête commerçant */}
              <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
                <div style={{ width: 60, height: 60, borderRadius: 12, background: T.pale, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {commercant.logo_url ? <img src={commercant.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <span style={{ fontSize: '1.5rem' }}>🏪</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: T.deep, marginBottom: 4 }}>{commercant.nom}</h2>
                  {commercant.adresse && <p style={{ fontSize: '0.82rem', color: T.deep, fontWeight: 600, marginBottom: 5 }}>📍 {commercant.adresse}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Etoiles note={notesInfo.moyenne} taille={13}/>
                    {notesInfo.count > 0
                      ? <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>({notesInfo.count} avis)</span>
                      : <span style={{ fontSize: '0.72rem', color: '#D1D5DB' }}>Pas encore d'avis</span>
                    }
                  </div>
                </div>
              </div>

              {/* Horaires 7 jours */}
              {commercant.horaires_detail && (
                <div style={{ background: T.bgCard, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.75rem', border: `1.5px solid ${T.pale}` }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>🕐 Horaires</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {JOURS.map((jour, idx) => {
                      const h = commercant.horaires_detail[jour]
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

              {/* Articles groupés par catégorie */}
              {(() => {
                const categories = [...new Set(articles.map(a => a.categorie).filter(Boolean))]
                const sansCat = articles.filter(a => !a.categorie)

                const ArticleRow = ({ article }) => {
                  const groupes = optionsParArticle[article.id] || []
                  const hasOptions = groupes.length > 0
                  const [showOptions, setShowOptions] = useState(false)
                  const qte = panier[article.id]?.quantite || 0

                  return (
                    <div style={{ ...card }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 700, color: T.deep, marginBottom: 2, fontSize: '0.95rem' }}>{article.nom}</p>
                          {article.description && <p style={{ fontSize: '0.78rem', color: T.muted, marginBottom: 4, lineHeight: 1.4 }}>{article.description}</p>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <p style={{ fontSize: '0.95rem', color: T.main, fontWeight: 800 }}>{Number(article.prix).toFixed(2)}€</p>
                            {hasOptions && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: T.mid, background: T.pale, padding: '1px 6px', borderRadius: 100 }}>Options dispo</span>}
                          </div>
                          {article.stock_jour === 0 && <span style={{ fontSize: '0.7rem', background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>Épuisé</span>}
                        </div>
                        {article.stock_jour !== 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 12, flexShrink: 0 }}>
                            {!hasOptions && qte > 0 && (
                              <>
                                <button onClick={() => retirerDuPanier(article.id)}
                                  style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${T.main}`, background: '#fff', color: T.main, fontWeight: 800, cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                <span style={{ fontWeight: 800, minWidth: 24, textAlign: 'center', fontSize: '1.05rem', color: T.ink }}>{qte}</span>
                              </>
                            )}
                            <button onClick={() => hasOptions ? setShowOptions(v => !v) : ajouterAuPanier(article)}
                              style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: showOptions ? T.mid : T.main, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: hasOptions ? '0.9rem' : '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

                if (categories.length === 0) {
                  return articles.map(a => <ArticleRow key={a.id} article={a}/>)
                }

                return (
                  <>
                    {categories.map(cat => {
                      const artsDecat = articles.filter(a => a.categorie === cat)
                      if (!artsDecat.length) return null
                      return (
                        <div key={cat} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 }}>
                            <div style={{ flex: 1, height: 1, background: T.pale }}/>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px', background: T.pale, padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>{cat}</span>
                            <div style={{ flex: 1, height: 1, background: T.pale }}/>
                          </div>
                          {artsDecat.map(a => <ArticleRow key={a.id} article={a}/>)}
                        </div>
                      )
                    })}
                    {sansCat.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 }}>
                          <div style={{ flex: 1, height: 1, background: T.pale }}/>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', background: '#F9FAFB', padding: '3px 10px', borderRadius: 100 }}>Autres</span>
                          <div style={{ flex: 1, height: 1, background: T.pale }}/>
                        </div>
                        {sansCat.map(a => <ArticleRow key={a.id} article={a}/>)}
                      </div>
                    )}
                  </>
                )
              })()}

              {/* Avis */}
              {avisCommerce.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.deep, marginBottom: '0.625rem' }}>Avis clients</h3>
                  {avisCommerce.map(a => <CarteAvis key={a.id} a={a}/>)}
                </div>
              )}

              {/* Bouton panier sticky */}
              {Object.keys(panier).length > 0 && (
                <div style={{ position: 'sticky', bottom: 16, marginTop: 16 }}>
                  <button onClick={() => setEtape(3)} style={btnPrimary}>
                    Choisir mon créneau — {totalPanier().toFixed(2)}€
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ÉTAPE 3 — Créneau + coordonnées */}
          {etape === 3 && commercant && (
            <div style={{ padding: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: T.mid, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  {(() => {
                    const d = modeLendemain ? new Date(Date.now() + 86400000) : new Date()
                    return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
                  })()} · {commercant.nom}
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
                  const heureOuverture = commercant?.heure_ouverture_resa ? commercant.heure_ouverture_resa.slice(0,5) : '21:00'
                  const resaOuverte = maintenant() >= heureEnMinutes(heureOuverture)
                  return (
                    <div style={{ gridColumn: '1 / -1', background: T.pale, borderRadius: 12, padding: '1.25rem', textAlign: 'center', border: `1.5px solid ${T.main}33` }}>
                      <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🕐</p>
                      <p style={{ fontWeight: 800, marginBottom: 6, color: T.deep, fontSize: '1rem' }}>Plus de créneaux disponibles aujourd'hui</p>
                      {resaOuverte
                        ? <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6 }}>Les réservations pour demain sont ouvertes ! 🎉<br/>Premier créneau à <strong>{premierCreneau.heure_debut.slice(0,5)}</strong> le <strong>{jourDemain}</strong>.</p>
                        : <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6 }}>Reviens à partir de <strong>{heureOuverture}</strong> ce soir pour réserver<br/>le <strong>{jourDemain}</strong> dès <strong>{premierCreneau.heure_debut.slice(0,5)}</strong> !</p>
                      }
                    </div>
                  )
                })()}
              </div>

              <h2 style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '1rem', color: T.ink }}>Tes coordonnées</h2>
              <input placeholder="Ton prénom et nom" type="text" value={client.nom} onChange={e => setClient(p => ({ ...p, nom: e.target.value }))} style={inputSt}/>
              <input placeholder="Email" type="email" value={client.email} onChange={e => setClient(p => ({ ...p, email: e.target.value }))} style={inputSt}/>
              <input placeholder="Téléphone (optionnel)" type="tel" value={client.telephone} onChange={e => setClient(p => ({ ...p, telephone: e.target.value }))} style={inputSt}/>
              <button onClick={passerCommande} disabled={loadingCommande || !creneauChoisi || !client.nom || !client.email}
                style={{ ...btnPrimary, opacity: (!creneauChoisi || !client.nom || !client.email) ? 0.5 : 1, marginTop: 4 }}>
                {loadingCommande ? 'En cours...' : `Confirmer — ${totalPanier().toFixed(2)}€`}
              </button>
              <p style={{ fontSize: '0.8rem', color: '#9a8ab0', textAlign: 'center', marginTop: 8 }}>Le paiement sera activé prochainement</p>
            </div>
          )}

          {/* ÉTAPE 4 — Confirmation */}
          {etape === 4 && commercant && (
            <div style={{ padding: '1.5rem 1rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
                <p style={{ fontWeight: 900, fontSize: '1rem', color: T.main, letterSpacing: '-0.5px', marginBottom: 4 }}>yoppaa</p>
                <h2 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.ink, marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Ta commande est passée !</h2>
                <p style={{ color: T.deep, fontWeight: 700, marginBottom: '0.25rem', fontSize: '1rem' }}>Chez {commercant.nom}</p>
                <p style={{ color: T.muted, fontSize: '0.875rem' }}>On s'occupe du reste — présente-toi à ton créneau !</p>
              </div>
              <div style={{ background: T.pale, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', border: `1.5px solid ${T.main}33` }}>
                <p style={{ fontWeight: 800, color: T.ink, marginBottom: 8, fontSize: '1rem' }}>📦 Pour récupérer ta commande</p>
                <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6 }}>
                  Présente-toi chez <strong>{commercant.nom}</strong> à ton créneau.<br/>
                  Quand ta commande est prête, confirme depuis l'onglet <strong>Commandes</strong>.
                </p>
              </div>
              <button onClick={() => router.push('/commander')} style={{ ...btnPrimary, marginBottom: 10 }}>
                ← Retour à l'accueil
              </button>
              <button onClick={() => { setPanier({}); setCreneauChoisi(null); setEtape(2) }}
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