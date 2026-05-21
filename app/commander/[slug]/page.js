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
function jourIdx(date) {
  const idx = date.getDay()
  return idx === 0 ? 6 : idx - 1
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

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 16, r = 8, mb = 0 }) {
  return (
    <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg, #EDE0FF 25%, #F8F6FF 50%, #EDE0FF 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', marginBottom: mb }}/>
  )
}
function SkeletonHeader() {
  return (
    <div>
      <div style={{ height: 220, background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}/>
      </div>
      <div style={{ background: '#fff', padding: '1rem' }}>
        <Skeleton h={28} w="60%" r={8} mb={8}/>
        <Skeleton h={16} w="40%" r={6} mb={12}/>
        <Skeleton h={14} w="80%" r={6} mb={6}/>
        <Skeleton h={14} w="60%" r={6}/>
      </div>
    </div>
  )
}
function SkeletonArticle() {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.625rem', border: `1.5px solid ${T.pale}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <Skeleton h={18} w="55%" r={6} mb={8}/>
          <Skeleton h={13} w="80%" r={5} mb={8}/>
          <Skeleton h={20} w="25%" r={6}/>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: T.pale, marginLeft: 12 }}/>
      </div>
    </div>
  )
}

// ─── Swipe retrait ────────────────────────────────────────────────────────────
function SwipeRetrait({ onConfirm, clientPrenom }) {
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [phase, setPhase] = useState('idle')
  const startRef = useRef(0)
  const containerRef = useRef(null)
  const THUMB = 52
  const C = { main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF', ink: '#1A0840' }
  function getMaxX() { return (containerRef.current?.offsetWidth || 300) - THUMB - 8 }
  function getX(e) { return e.touches ? e.touches[0].clientX : e.clientX }
  const onStart = e => { if (phase !== 'idle') return; setPhase('swiping'); setSwiping(true); startRef.current = getX(e) - swipeX }
  const onMove = e => {
    if (phase !== 'swiping') return
    const x = Math.max(0, Math.min(getMaxX(), getX(e) - startRef.current))
    setSwipeX(x)
    if (x >= getMaxX()) {
      setSwiping(false); setPhase('yop')
      try { const a = new Audio('/sounds/yop.mp3'); a.volume = 0.8; const p = a.play(); if (p) p.catch(()=>{}) } catch(e) {}
      setTimeout(() => { setPhase('done'); onConfirm() }, 2200)
    }
  }
  const onEnd = () => { if (phase !== 'swiping') return; setSwiping(false); setPhase('idle'); setSwipeX(0) }
  const p = swipeX / (getMaxX() || 1)
  const TRACK_H = THUMB + 8
  if (phase === 'yop' || phase === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          {[{c:C.main,d:'0s',s:10},{c:C.light,d:'0.15s',s:14},{c:C.mid,d:'0.3s',s:10}].map((d,i) => (
            <div key={i} style={{ width: d.s, height: d.s, borderRadius: '50%', background: d.c, animation: `yopPulse 0.6s ease-in-out ${d.d} infinite alternate`, boxShadow: `0 0 12px ${d.c}88` }}/>
          ))}
        </div>
        <p style={{ fontWeight: 900, fontSize: '1.1rem', color: C.ink, letterSpacing: '-0.3px', marginBottom: 4 }}>Récupéré ! 🎉</p>
        <p style={{ fontSize: '0.82rem', color: '#6B7280', fontWeight: 600 }}>Profite bien {clientPrenom} !</p>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', animation: 'yopArrow 1.2s ease-in-out infinite' }}>Glisse pour récupérer →→→</span>
      </div>
      <div ref={containerRef}
        style={{ width: '100%', height: TRACK_H, borderRadius: 100, background: `linear-gradient(to right, ${C.pale} ${p*100}%, #F3F4F6 ${p*100}%)`, position: 'relative', border: `2px solid ${p > 0.5 ? C.main : C.light}`, userSelect: 'none', cursor: 'grab', touchAction: 'none', transition: 'border-color 0.2s' }}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: THUMB + 12, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: p > 0.3 ? C.main : '#9CA3AF', letterSpacing: '1px', textTransform: 'uppercase', transition: 'color 0.2s' }}>{p > 0.7 ? 'Lâche !' : ''}</span>
        </div>
        <div style={{ position: 'absolute', left: 4 + swipeX, top: 4, width: THUMB, height: THUMB, borderRadius: '50%', background: `linear-gradient(135deg, ${C.main}, ${C.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 16px ${C.main}66`, transition: swiping ? 'none' : 'left 0.3s', userSelect: 'none' }}>
          <span style={{ fontWeight: 800, fontSize: '0.62rem', color: '#fff', letterSpacing: '1px', textTransform: 'uppercase' }}>SWIPE</span>
        </div>
      </div>
    </div>
  )
}

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
                  style={{ width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 900, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontWeight: 900, minWidth: 22, textAlign: 'center', fontSize: '0.95rem', color: T.ink }}>{item.quantite}</span>
                <button onClick={() => onAjouter(key, item)}
                  style={{ width: 30, height: 30, borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, color: T.ink, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nom}</p>
                {opts && <p style={{ fontSize: '0.7rem', color: T.muted, marginTop: 1 }}>{opts}</p>}
              </div>
              <p style={{ fontWeight: 800, color: T.main, fontSize: '0.9rem', flexShrink: 0 }}>{(prixUnitaire * item.quantite).toFixed(2)}€</p>
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
          style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }}>
          Choisir mon créneau →
        </button>
      </div>
    </div>
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

// ─── ArticleRow ───────────────────────────────────────────────────────────────
function ArticleRow({ article, panier, optionsParArticle, ajouterAuPanier, retirerDuPanier, qteTotaleArticle, stocksJour, jourSelectionne, joursDispos, onCommanderDemain }) {
  const groupes = optionsParArticle[article.id] || []
  const hasOptions = groupes.length > 0
  const [showOptions, setShowOptions] = useState(false)
  const qteTotale = qteTotaleArticle(article.id)
  const keySimple = String(article.id)

  const stocksArticle = stocksJour[article.id] || {}
  const hasStockJour = Object.keys(stocksArticle).length > 0

  const jourDateSelectionne = joursDispos[jourSelectionne]?.date || new Date()
  const jourNomSelectionne = JOURS[jourIdx(jourDateSelectionne)]

  const stockAujourdhui = hasStockJour
    ? (stocksArticle[jourActuel()]?.actif !== false ? (stocksArticle[jourActuel()]?.stock ?? article.stock_jour) : 0)
    : article.stock_jour

  const actifCeJour = hasStockJour
    ? (stocksArticle[jourNomSelectionne]?.actif !== false)
    : true

  const epuiseAujourdhui = stockAujourdhui === 0

  function prochainJourDispo() {
    for (let i = 1; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i)
      const nom = JOURS[jourIdx(d)]
      const s = stocksArticle[nom]
      if (!hasStockJour || (s && s.actif !== false && s.stock > 0)) {
        return { nom: JOURS_LONGS[jourIdx(d)], idx: i }
      }
    }
    return null
  }

  function labelsDispos() {
    const labels = []
    const today = new Date()
    for (let i = 0; i < 4; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i)
      const nom = JOURS[jourIdx(d)]
      const s = stocksArticle[nom]
      if (!hasStockJour) continue
      const stock = s?.stock ?? article.stock_jour
      const actif = s?.actif !== false
      const label = i === 0 ? "Auj." : i === 1 ? "Dem." : JOURS_LONGS[jourIdx(d)].slice(0,3) + '.'
      if (actif && stock > 0) labels.push({ label, stock, epuise: false })
      else if (!actif || stock === 0) labels.push({ label, stock: 0, epuise: true })
    }
    return labels
  }

  const prochain = epuiseAujourdhui ? prochainJourDispo() : null
  const dispos = hasStockJour ? labelsDispos() : []
  const epuiseComplet = epuiseAujourdhui && !prochain
  const inactifCeJour = !actifCeJour
  // Stock limit : bloquer le + quand panier atteint le stock dispo
  const stockGere = article.stock_jour > 0
  const stockAtteint = stockGere && stockAujourdhui > 0 && qteTotale >= stockAujourdhui

  return (
    <div className="art-card" style={{ background: '#fff', borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.625rem', border: `1.5px solid ${(epuiseComplet || inactifCeJour) ? '#E5E7EB' : qteTotale > 0 ? T.main+'44' : T.pale}`, boxShadow: qteTotale > 0 ? `0 2px 12px ${T.main}18` : '0 1px 4px rgba(107,53,196,0.04)', opacity: (epuiseComplet || inactifCeJour) ? 0.6 : 1, transition: 'all 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, color: T.ink, marginBottom: 2, fontSize: '0.95rem', letterSpacing: '-0.2px' }}>{article.nom}</p>
          {article.description && <p style={{ fontSize: '0.78rem', color: T.muted, marginBottom: 5, lineHeight: 1.4 }}>{article.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontSize: '1rem', color: T.main, fontWeight: 900, letterSpacing: '-0.3px' }}>{Number(article.prix).toFixed(2)}€</p>
            {hasOptions && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: T.mid, background: T.pale, padding: '2px 8px', borderRadius: 100 }}>Personnalisable</span>}
          </div>

          {hasStockJour && dispos.length > 0 && (
            <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
              {dispos.map((d, i) => (
                <span key={i} style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: d.epuise ? '#FEF2F2' : '#F0FDF4', color: d.epuise ? '#DC2626' : '#16A34A', border: `1px solid ${d.epuise ? '#FCA5A5' : '#86EFAC'}` }}>
                  {d.label} {d.epuise ? '✗' : d.stock > 0 ? `${d.stock}` : '✓'}
                </span>
              ))}
            </div>
          )}

          {epuiseAujourdhui && prochain && (
            <button onClick={() => onCommanderDemain(prochain.idx)}
              style={{ marginTop: 6, fontSize: '0.72rem', fontWeight: 800, color: T.main, background: T.pale, border: `1px solid ${T.main}44`, borderRadius: 100, padding: '3px 10px', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
              Commander {prochain.nom} →
            </button>
          )}

          {epuiseComplet && (
            <span style={{ fontSize: '0.68rem', background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 6, fontWeight: 700, display: 'inline-block', marginTop: 6 }}>Épuisé</span>
          )}

          {inactifCeJour && !epuiseComplet && prochain && (
            <span style={{ fontSize: '0.68rem', background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 6, fontWeight: 700, display: 'inline-block', marginTop: 6 }}>
              Disponible {prochain.nom}
            </span>
          )}
        </div>

        {!epuiseComplet && !inactifCeJour && !epuiseAujourdhui && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12, flexShrink: 0 }}>
            {hasOptions ? (
              <>
                {qteTotale > 0 && (
                  <div style={{ background: T.main, color: '#fff', fontWeight: 900, fontSize: '0.78rem', borderRadius: 100, minWidth: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
                    {qteTotale}
                  </div>
                )}
                <button onClick={() => setShowOptions(v => !v)}
                  style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: showOptions ? T.mid : T.main, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', boxShadow: `0 3px 12px ${T.main}44` }}>
                  ⚙️
                </button>
              </>
            ) : (
              qteTotale > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => retirerDuPanier(keySimple)}
                    style={{ width: 34, height: 34, borderRadius: 10, border: `2px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 900, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink, minWidth: 22, textAlign: 'center' }}>{qteTotale}</span>
                    {stockAtteint && <span style={{ fontSize: '0.5rem', fontWeight: 700, color: T.main, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>MAX ✓</span>}
                  </div>
                  <button onClick={() => !stockAtteint && ajouterAuPanier(article)} disabled={stockAtteint}
                    style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: stockAtteint ? '#E5E7EB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: stockAtteint ? '#9CA3AF' : '#fff', fontWeight: 900, cursor: stockAtteint ? 'default' : 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: stockAtteint ? 'none' : `0 4px 14px ${T.main}55`, transition: 'all 0.15s' }}>+</button>
                </div>
              ) : (
                <button onClick={() => ajouterAuPanier(article)}
                  style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 14px ${T.main}55` }}>+</button>
              )
            )}
          </div>
        )}
      </div>
      {showOptions && hasOptions && (
        <OptionsSelector article={article} groupes={groupes} onAjouter={(a, opts) => { ajouterAuPanier(a, opts); setShowOptions(false) }}/>
      )}
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
  // FIX 1 — erreur stock non-bloquante (remplace alert)
  const [erreurCommande, setErreurCommande] = useState(null)
  const [ajustementStock, setAjustementStock] = useState(null) // { articleId, nom, stockDisponible }
  const [client, setClient] = useState({ prenom: '', nom: '', email: '', telephone: '' })
  const [rgpdCommande, setRgpdCommande] = useState(false)
  const [rgpdMarketing, setRgpdMarketing] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [joursDispos, setJoursDispos] = useState([])
  const [jourSelectionne, setJourSelectionne] = useState(0)
  const [optionsParArticle, setOptionsParArticle] = useState({})
  const [stocksJour, setStocksJour] = useState({})
  const [photoCouverture, setPhotoCouverture] = useState(null)
  const [dealActif, setDealActif] = useState(null)
  const [fermetures, setFermetures] = useState([])
  const [derniereCommande, setDerniereCommande] = useState(null)
  const [isDesktop, setIsDesktop] = useState(false)

  const [categorieActive, setCategorieActive] = useState(null)
  const [catBarVisible, setCatBarVisible] = useState(false)
  const catRefs = useRef({})
  const headerRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    setIsDesktop(window.innerWidth > 768)
    const h = () => setIsDesktop(window.innerWidth > 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

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

    const cacheKey = `yoppaa_commerce_${slug}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { data, ts } = JSON.parse(cached)
        if (Date.now() - ts < 5 * 60 * 1000) {
          hydrate(data)
          return
        }
      } catch(e) {}
    }
    chargerCommercant(slug)
  }, [slug])

  function hydrate(data) {
    setCommercant(data.commercant)
    setArticles(data.articles)
    setCreneaux(data.creneaux)
    setAvisCommerce(data.avis)
    setNotesInfo(data.notesInfo)
    setOptionsParArticle(data.options)
    setStocksJour(data.stocksJour)
    setPhotoCouverture(data.photoCouverture)
    setDealActif(data.dealActif)
    setFermetures(data.fermetures)
    buildJoursDispos(data.commercant, data.creneaux, data.fermetures)
    setLoading(false)
  }

  async function chargerCommercant(slug) {
    setLoading(true)

    const [{ data: c }] = await Promise.all([
      supabase.from('commercants').select('*').eq('slug', slug).single(),
    ])
    if (!c) { router.push('/commander'); return }

    const [
      { data: arts },
      { data: cren },
      { data: avis },
      { data: avisNotes },
      { data: commandesActives },
      { data: photosData },
      { data: dealsData },
      { data: fermeturesData },
    ] = await Promise.all([
      supabase.from('articles').select('*').eq('commercant_id', c.id).eq('actif', true).order('categorie').order('nom'),
      supabase.from('creneaux').select('*').eq('commercant_id', c.id).eq('actif', true).order('heure_debut'),
      supabase.from('avis').select('*, client:clients(nom)').eq('commercant_id', c.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('avis').select('note').eq('commercant_id', c.id),
      supabase.from('commandes').select('creneau_id, commande_articles(quantite, article:articles(temps_prepa))').eq('commercant_id', c.id).not('statut', 'in', '(recupere,non_retire)'),
      supabase.from('commercant_photos').select('*').eq('commercant_id', c.id).order('ordre'),
      supabase.from('yoppaa_deals').select('*').eq('commercant_id', c.id).eq('actif', true).lte('date_debut', new Date().toISOString()).gte('date_fin', new Date().toISOString()).limit(1),
      supabase.from('fermetures_exceptionnelles').select('*').eq('commercant_id', c.id).gte('date_fin', new Date().toISOString()),
    ])

    const notesInfo = avisNotes?.length > 0
      ? { moyenne: avisNotes.reduce((a, x) => a + x.note, 0) / avisNotes.length, count: avisNotes.length }
      : { moyenne: 0, count: 0 }

    const countParCreneau = {}
    const tempsParCreneau = {}
    ;(commandesActives || []).forEach(cmd => {
      countParCreneau[cmd.creneau_id] = (countParCreneau[cmd.creneau_id] || 0) + 1
      const tempsCmd = (cmd.commande_articles || []).reduce((acc, l) => acc + (l.quantite * (l.article?.temps_prepa || 1)), 0)
      tempsParCreneau[cmd.creneau_id] = (tempsParCreneau[cmd.creneau_id] || 0) + tempsCmd
    })
    const creneauxAvecCount = (cren || []).map(cr => ({ ...cr, count: countParCreneau[cr.id] || 0, temps_cumul: tempsParCreneau[cr.id] || 0 }))

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

    let stocksJourMap = {}
    if (artIds.length > 0) {
      const { data: stocksData } = await supabase
        .from('article_stock_jour')
        .select('*')
        .eq('commercant_id', c.id)
        .in('article_id', artIds)
      ;(stocksData||[]).forEach(s => {
        if (!stocksJourMap[s.article_id]) stocksJourMap[s.article_id] = {}
        stocksJourMap[s.article_id][s.jour_semaine] = { stock: s.stock, actif: s.actif }
      })
    }

    const couverture = (photosData||[]).find(p => p.type === 'couverture') || null
    const deal = dealsData?.[0] || null

    const cacheData = {
      commercant: c,
      articles: arts || [],
      creneaux: creneauxAvecCount,
      avis: avis || [],
      notesInfo,
      options: opts,
      stocksJour: stocksJourMap,
      photoCouverture: couverture,
      dealActif: deal,
      fermetures: fermeturesData || [],
    }

    try {
      localStorage.setItem(`yoppaa_commerce_${slug}`, JSON.stringify({ data: cacheData, ts: Date.now() }))
    } catch(e) {}

    hydrate(cacheData)
  }

  function buildJoursDispos(c, creneauxAvecCount, fermeturesData) {
    const horizon = c.horizon_commande || 1
    const heureOuverture = c.heure_ouverture_resa ? c.heure_ouverture_resa.slice(0,5) : '21:00'
    const now = maintenant()
    const joursDispos = []
    const today = new Date(); today.setHours(0,0,0,0)

    function estEnFermeture(date) {
      return (fermeturesData||[]).some(f => {
        const debut = new Date(f.date_debut); debut.setHours(0,0,0,0)
        const fin = new Date(f.date_fin); fin.setHours(23,59,59,999)
        return date >= debut && date <= fin
      })
    }

    function creneauxPourDate(date, avecCount = true) {
      const nomJour = JOURS[jourIdx(date)]
      return creneauxAvecCount.filter(cr => cr.jour_semaine === nomJour || cr.jour_semaine === null)
        .map(cr => avecCount ? cr : { ...cr, count: 0, temps_cumul: 0 })
    }

    if (!estEnFermeture(today)) {
      const crensAujourdhui = creneauxPourDate(today, true).filter(cr => heureEnMinutes(cr.heure_debut) > now)
      if (crensAujourdhui.length > 0) {
        joursDispos.push({ date: new Date(today), label: "Aujourd'hui", creneaux: creneauxPourDate(today, true) })
      }
    }

    for (let i = 1; i < horizon; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i)
      if (estEnFermeture(d)) continue
      const label = i === 1 ? 'Demain' : d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
      joursDispos.push({ date: d, label, creneaux: creneauxPourDate(d, false) })
    }

    const resaOuverte = now >= heureEnMinutes(heureOuverture)
    if (horizon >= 1 && resaOuverte) {
      const d = new Date(today); d.setDate(d.getDate() + horizon)
      if (!estEnFermeture(d) && !joursDispos.find(j => j.date.getTime() === d.getTime())) {
        const label = horizon === 1 ? 'Demain' : d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
        joursDispos.push({ date: d, label, creneaux: creneauxPourDate(d, false) })
      }
    }

    if (joursDispos.length === 0) {
      joursDispos.push({ date: new Date(today), label: "Aujourd'hui", creneaux: creneauxPourDate(today, true) })
    }

    setJoursDispos(joursDispos)
    setJourSelectionne(0)
  }

  useEffect(() => {
    if (commercant && creneaux.length > 0) {
      buildJoursDispos(commercant, creneaux, fermetures)
    }
  }, [commercant, creneaux, fermetures])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !headerRef.current) return
    const scrollTop = scrollRef.current.scrollTop
    const headerH = headerRef.current.offsetHeight
    setCatBarVisible(scrollTop > headerH - 60)
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
    scroll.scrollTo({ top: el.offsetTop - header.offsetHeight - 56, behavior: 'smooth' })
    setCategorieActive(cat)
  }

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
    return Object.entries(panier).filter(([key]) => key === String(articleId) || key.startsWith(`${articleId}_`)).reduce((acc, [, item]) => acc + item.quantite, 0)
  }
  function totalPanier() {
    return Object.values(panier).reduce((acc, i) => {
      const supplement = i.options ? Object.values(i.options).flat().reduce((s, v) => s + (v.prix_supplement||0), 0) : 0
      return acc + (i.prix + supplement) * i.quantite
    }, 0)
  }

  function commanderPourJour(idxJour) {
    setJourSelectionne(idxJour)
    setEtape(3)
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 100)
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
    setErreurCommande(null)

    const nomComplet = `${client.prenom} ${client.nom}`.trim()
    const jourDate = joursDispos[jourSelectionne]?.date || new Date()
    const d = new Date(jourDate)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

    // ── Validation stock ──────────────────────────────────────────────────────
    const articlesAValider = Object.values(panier).filter(i => i.stock_jour > 0)
    if (articlesAValider.length > 0) {
      const artIds = articlesAValider.map(i => i.id)
      const { data: dejaCommandes } = await supabase
        .from('commande_articles')
        .select('article_id, quantite, commande:commandes!inner(date_commande, statut, commercant_id)')
        .in('article_id', artIds)
        .eq('commande.date_commande', dateStr)
        .eq('commande.commercant_id', commercant.id)
        .neq('commande.statut', 'non_retire')
      const qteDeja = {}
      ;(dejaCommandes || []).forEach(r => {
        qteDeja[r.article_id] = (qteDeja[r.article_id] || 0) + r.quantite
      })
      for (const item of articlesAValider) {
        const deja = qteDeja[item.id] || 0
        const stockDisponible = item.stock_jour - deja
        if (item.quantite > stockDisponible) {
          // FIX 2 — Mémoriser l'ajustement suggéré + garder le panier intact
          setErreurCommande(`Stock insuffisant pour "${item.nom}" : ${stockDisponible} disponible${stockDisponible > 1 ? 's' : ''}, tu en demandes ${item.quantite}.`)
          setAjustementStock({ articleId: item.id, nom: item.nom, stockDisponible })
          setLoadingCommande(false)
          return
        }
      }
    }

    // ── Numéro de commande séquentiel fiable (max réel en DB) ─────────────────
    const { data: derniereCmd } = await supabase
      .from('commandes')
      .select('numero_commande')
      .eq('commercant_id', commercant.id)
      .eq('date_commande', dateStr)
      .order('numero_commande', { ascending: false })
      .limit(1)
      .maybeSingle()
    const numero_commande = ((derniereCmd?.numero_commande) ?? 0) + 1

    const cid = await getOuCreerClient(client.email, client.prenom, client.nom)

    // ── FIX 3 : Insert avec gestion d'erreur + fallback sans numero_commande ──
    const insertPayload = {
      commercant_id: commercant.id, creneau_id: creneauChoisi,
      client_nom: nomComplet, client_email: client.email, client_telephone: client.telephone,
      rgpd_commande: true, rgpd_marketing: rgpdMarketing,
      total: totalPanier(), statut: 'en_attente',
      date_commande: dateStr,
      numero_commande,
    }
    let { data: commande, error: errInsert } = await supabase.from('commandes').insert(insertPayload).select().single()

    // Fallback sans numero_commande si la colonne pose problème
    if (errInsert) {
      const { numero_commande: _, ...payloadSansNumero } = insertPayload
      const { data: c2, error: e2 } = await supabase.from('commandes').insert(payloadSansNumero).select().single()
      if (!e2 && c2) { commande = c2; errInsert = null }
      else {
        const msg = errInsert?.message || errInsert?.code || e2?.message || 'inconnue'
        setErreurCommande(`Erreur : ${msg}`)
        setLoadingCommande(false)
        return
      }
    }
    if (!commande) {
      setErreurCommande('Commande non créée. Réessaie.')
      setLoadingCommande(false)
      return
    }

    await supabase.from('commande_articles').insert(
      Object.values(panier).map(i => ({ commande_id: commande.id, article_id: i.id, quantite: i.quantite, prix_unitaire: i.prix }))
    )
    try { localStorage.removeItem(`yoppaa_commerce_${slug}`) } catch(e) {}

    // FIX 3 — Calculer le numéro séquentiel du jour (même logique que dashboard)
    let numeroSequentiel = 1
    try {
      const { data: ordresDuJour } = await supabase
        .from('commandes')
        .select('id, created_at, creneau:creneaux(heure_debut)')
        .eq('commercant_id', commercant.id)
        .eq('date_commande', dateStr)
      const sorted = (ordresDuJour || []).sort((a, b) =>
        (a.creneau?.heure_debut || '').localeCompare(b.creneau?.heure_debut || '') ||
        new Date(a.created_at) - new Date(b.created_at)
      )
      const pos = sorted.findIndex(c => c.id === commande.id)
      if (pos !== -1) numeroSequentiel = pos + 1
    } catch(e) {}

    setDerniereCommande({ ...commande, client_id: cid, numeroSequentiel })
    setEtape(4)
    setLoadingCommande(false)
  }

  const formValide = creneauChoisi && client.prenom.trim() && client.nom.trim() && client.email.trim() && client.telephone.trim() && rgpdCommande
  const inputSt = { width: '100%', padding: '0.875rem 1rem', border: `1.5px solid ${T.pale}`, borderRadius: 12, marginBottom: 10, fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none', color: T.ink, background: '#fff', display: 'block' }
  const btnPrimary = { width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }

  const categories = [...new Set(articles.map(a => a.categorie).filter(Boolean))]
  const sansCat = articles.filter(a => !a.categorie)
  const toutesLesCats = [...categories, ...(sansCat.length > 0 ? ['__autres__'] : [])]

  function ouvrirMaps() {
    if (!commercant?.adresse) return
    const q = encodeURIComponent(commercant.adresse)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    window.open(isIOS ? `maps://maps.apple.com/?q=${q}` : `https://maps.google.com/?q=${q}`, '_blank')
  }
  function appeler() {
    if (!commercant?.telephone) return
    window.open(`tel:${commercant.telephone}`)
  }
  function whatsapp() {
    if (!commercant?.telephone) return
    const num = commercant.telephone.replace(/\D/g, '').replace(/^0/, '32')
    window.open(`https://wa.me/${num}`)
  }

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
        .cat-bar { display: flex; gap: 0; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; background: #fff; border-bottom: 1px solid ${T.pale}; }
        .cat-bar::-webkit-scrollbar { display: none; }
        .cat-pill { flex-shrink: 0; padding: 0.75rem 1rem; border: none; background: transparent; font-family: "DM Sans", sans-serif; font-weight: 700; font-size: 0.82rem; cursor: pointer; color: ${T.muted}; border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap; }
        .cat-pill.active { color: ${T.main}; border-bottom-color: ${T.main}; }
        .art-card { transition: box-shadow 0.15s, transform 0.15s; }
        .art-card:hover { box-shadow: 0 6px 24px rgba(107,53,196,0.12) !important; transform: translateY(-1px); }
        .action-btn { display: flex; align-items: center; justify-content: center; gap: 5px; padding: 0.5rem 1rem; border-radius: 100px; border: 1.5px solid ${T.pale}; background: #fff; color: ${T.ink}; font-weight: 700; font-size: 0.78rem; cursor: pointer; transition: all 0.15s; }
        .action-btn:hover { border-color: ${T.main}; color: ${T.main}; background: ${T.pale}; }
        @keyframes pulse { from { opacity:0.4; transform:scale(0.8); } to { opacity:1; transform:scale(1.2); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { from { background-position: -200% center; } to { background-position: 200% center; } }
        @keyframes yopPulse { from { transform:scale(0.7) translateY(0); opacity:0.5; } to { transform:scale(1.4) translateY(-4px); opacity:1; } }
        @keyframes yopArrow { 0%,100% { opacity:0.4; transform:translateX(0); } 50% { opacity:1; transform:translateX(4px); } }
        @keyframes dealPulse { 0%,100% { opacity:1; } 50% { opacity:0.7; } }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="page-wrap">

        {/* ── TOPBAR ── */}
        <div style={{ background: T.bgPanel, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderBottom: `1px solid ${T.main}33` }}>
          <button onClick={() => router.push('/commander')}
            style={{ background: `rgba(255,255,255,0.1)`, border: `1px solid rgba(255,255,255,0.15)`, color: '#fff', cursor: 'pointer', borderRadius: 10, padding: '0.45rem 0.875rem', fontWeight: 700, fontSize: '0.82rem', flexShrink: 0, backdropFilter: 'blur(8px)' }}>
            ← Retour
          </button>

          {/* FIX 4 — Nom commerçant topbar : police réduite pour éviter la coupure */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {commercant && (
              <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#fff', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', opacity: 0.9 }}>
                {commercant.nom}
              </span>
            )}
          </div>

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
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: active ? '#fff' : done ? '#16A34A' : 'rgba(255,255,255,0.5)' }}>{s.label}</span>
                    </div>
                    {i === 0 && <div style={{ width: 12, height: 1.5, background: etape >= 3 ? '#16A34A' : 'rgba(255,255,255,0.15)' }}/>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── SCROLL BODY ── */}
        <div className="scroll-body" ref={scrollRef}>

          {loading && (
            <>
              <SkeletonHeader/>
              <div style={{ padding: '1rem' }}>
                {[1,2,3,4].map(i => <SkeletonArticle key={i}/>)}
              </div>
            </>
          )}

          {/* ÉTAPE 2 — Articles */}
          {!loading && etape === 2 && commercant && (
            <>
              <div ref={headerRef}>

                <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
                  {photoCouverture?.url
                    ? <img src={photoCouverture.url} alt={commercant.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                    : (
                      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 40%, ${T.main} 100%)` }}>
                        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 80% 20%, ${T.mid}55 0%, transparent 60%), radial-gradient(circle at 20% 80%, ${T.light}22 0%, transparent 50%)` }}/>
                        <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 5 }}>
                          {[{c:'#fff',o:0.35},{c:T.light,o:0.8},{c:T.mid,o:0.9}].map((d,i) => (
                            <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: d.c, opacity: d.o }}/>
                          ))}
                        </div>
                      </div>
                    )
                  }
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(to top, rgba(22,6,54,0.7), transparent)' }}/>
                </div>

                {dealActif && (
                  <div style={{ background: `linear-gradient(135deg, ${T.ink}, ${T.deep})`, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, animation: 'dealPulse 3s ease infinite' }}>
                    <span style={{ fontSize: 14 }}>🔥</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.68rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Deal Yoppers</p>
                      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{dealActif.titre}</p>
                    </div>
                    {dealActif.prix_deal && (
                      <div style={{ textAlign: 'right' }}>
                        {dealActif.prix_original && <p style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', textDecoration: 'line-through' }}>{dealActif.prix_original.toFixed(2)}€</p>}
                        <p style={{ fontSize: '0.88rem', fontWeight: 900, color: T.light }}>{dealActif.prix_deal.toFixed(2)}€</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Card flottante */}
                <div style={{ background: '#fff', margin: '0 12px', marginTop: -20, borderRadius: 20, padding: '1rem 1.125rem', boxShadow: `0 8px 32px rgba(22,6,54,0.2), 0 2px 8px ${T.main}22`, border: `1px solid ${T.pale}`, position: 'relative' }}>

                  {/* Logo flottant en haut à droite de la card (reste ici) */}
                  <div style={{ position: 'absolute', top: -24, right: 16, width: 48, height: 48, borderRadius: 14, background: commercant.logo_url ? '#fff' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, border: '3px solid #fff', boxShadow: `0 4px 16px rgba(0,0,0,0.15)`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                    {commercant.logo_url
                      ? <img src={commercant.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                      : '🏪'
                    }
                  </div>

                  <div style={{ paddingRight: 60 }}>
                    {commercant.type && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: T.mid, background: T.pale, padding: '2px 8px', borderRadius: 100, display: 'inline-block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        {commercant.type}
                      </span>
                    )}
                    <h1 style={{ fontWeight: 900, fontSize: '1.3rem', color: T.ink, letterSpacing: '-0.5px', lineHeight: 1.1, marginBottom: 6 }}>
                      {commercant.nom}
                    </h1>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Etoiles note={notesInfo.moyenne} taille={12}/>
                      <span style={{ fontSize: '0.7rem', color: T.muted }}>{notesInfo.count > 0 ? `${notesInfo.count} avis` : 'Pas d\'avis'}</span>
                    </div>
                    {commercant.horaires_detail && (() => {
                      const j = jourActuel()
                      const h = commercant.horaires_detail[j]
                      if (!h) return null
                      return (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: h.ouvert ? '#F0FDF4' : '#FEF2F2', borderRadius: 100, padding: '3px 8px', border: `1px solid ${h.ouvert ? '#16A34A33' : '#DC262633'}` }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: h.ouvert ? '#16A34A' : '#DC2626', flexShrink: 0 }}/>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: h.ouvert ? '#16A34A' : '#DC2626' }}>
                            {h.ouvert ? `Ouvert · ${h.debut.slice(0,5)}–${h.fin.slice(0,5)}` : 'Fermé'}
                          </span>
                        </div>
                      )
                    })()}
                  </div>

                  {commercant.description && (
                    <p style={{ fontSize: '0.78rem', color: T.muted, lineHeight: 1.5, marginBottom: 10 }}>{commercant.description}</p>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {commercant.adresse && (
                      <button className="action-btn" onClick={ouvrirMaps}>
                        <span>📍</span>
                        <span>{commercant.adresse}</span>
                      </button>
                    )}
                    {commercant.telephone && (
                      <>
                        <button className="action-btn" onClick={appeler}>
                          <span>📞</span>
                          <span>Appeler</span>
                        </button>
                        <button className="action-btn" onClick={whatsapp}>
                          <span>💬</span>
                          <span>WhatsApp</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ height: 12, background: T.bg }}/>

                {commercant.horaires_detail && <HorairesSection horaires={commercant.horaires_detail}/>}
              </div>

              {toutesLesCats.length > 1 && (
                <div style={{ position: 'sticky', top: 0, zIndex: 20, boxShadow: catBarVisible ? '0 2px 12px rgba(0,0,0,0.08)' : 'none' }}>
                  <div className="cat-bar">
                    {toutesLesCats.map(cat => (
                      <button key={cat} className={`cat-pill ${categorieActive === cat ? 'active' : ''}`} onClick={() => scrollToCategorie(cat)}>
                        {cat === '__autres__' ? 'Autres' : cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ padding: '0.875rem 1rem 0' }}>
                {categories.map(cat => {
                  const artsDecat = articles.filter(a => a.categorie === cat)
                  if (!artsDecat.length) return null
                  return (
                    <div key={cat} ref={el => catRefs.current[cat] = el} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 10 }}>
                        <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink, letterSpacing: '-0.3px' }}>{cat}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: T.muted }}>{artsDecat.length} article{artsDecat.length > 1 ? 's' : ''}</span>
                      </div>
                      {artsDecat.map(a => (
                        <ArticleRow key={a.id} article={a} panier={panier} optionsParArticle={optionsParArticle}
                          ajouterAuPanier={ajouterAuPanier} retirerDuPanier={retirerDuPanier} qteTotaleArticle={qteTotaleArticle}
                          stocksJour={stocksJour} jourSelectionne={jourSelectionne} joursDispos={joursDispos}
                          onCommanderDemain={commanderPourJour}/>
                      ))}
                    </div>
                  )
                })}

                {sansCat.length > 0 && (
                  <div ref={el => catRefs.current['__autres__'] = el} style={{ marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 10 }}>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink }}>Autres</span>
                    </div>
                    {sansCat.map(a => (
                      <ArticleRow key={a.id} article={a} panier={panier} optionsParArticle={optionsParArticle}
                        ajouterAuPanier={ajouterAuPanier} retirerDuPanier={retirerDuPanier} qteTotaleArticle={qteTotaleArticle}
                        stocksJour={stocksJour} jourSelectionne={jourSelectionne} joursDispos={joursDispos}
                        onCommanderDemain={commanderPourJour}/>
                    ))}
                  </div>
                )}

                {avisCommerce.length > 0 && (
                  <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${T.pale}` }}>
                    <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.deep, marginBottom: '0.75rem' }}>⭐ Avis clients</h3>
                    {avisCommerce.map(a => <CarteAvis key={a.id} a={a}/>)}
                  </div>
                )}

                <RecapPanier panier={panier} onRetirer={retirerDuPanier} onAjouter={incrementerPanier} total={totalPanier()} onValider={() => setEtape(3)}/>
                <div style={{ height: 24 }}/>
              </div>
            </>
          )}

          {/* ÉTAPE 3 — Créneau + coordonnées */}
          {!loading && etape === 3 && commercant && (
            <div>
              <div style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.main} 100%)`, padding: '1.25rem 1rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 80% 20%, ${T.mid}44 0%, transparent 50%)`, pointerEvents: 'none' }}/>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 6, opacity: 0.8 }}>{commercant.nom}</p>
                <h2 style={{ fontWeight: 900, fontSize: '1.3rem', color: '#fff', letterSpacing: '-0.5px' }}>Choisis ta date<br/>et ton créneau</h2>
              </div>

              <div style={{ padding: '0 1rem 1rem', marginTop: -1 }}>
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
                  <div style={{ borderTop: `1px solid ${T.pale}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, color: T.muted, fontSize: '0.82rem' }}>Total</span>
                    <span style={{ fontWeight: 900, color: T.ink, fontSize: '1.1rem' }}>{totalPanier().toFixed(2)}€</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                  {joursDispos.map((jour, idx) => {
                    const actif = jourSelectionne === idx
                    const dateStr = jour.date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
                    return (
                      <button key={idx} onClick={() => { setJourSelectionne(idx); setCreneauChoisi(null); setErreurCommande(null); setAjustementStock(null) }}
                        style={{ flexShrink: 0, padding: '0.5rem 1rem', borderRadius: 14, border: `2px solid ${actif ? T.main : T.pale}`, background: actif ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: actif ? '#fff' : T.muted, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.15s', boxShadow: actif ? `0 4px 16px ${T.main}44` : 'none', fontFamily: '"DM Sans", sans-serif', textAlign: 'center', lineHeight: 1.3 }}>
                        <div>{jour.label}</div>
                        <div style={{ fontSize: '0.68rem', opacity: actif ? 0.85 : 0.6, marginTop: 1 }}>{dateStr}</div>
                      </button>
                    )
                  })}
                </div>

                <div className="grid3" style={{ marginBottom: '1.5rem' }}>
                  {[...new Map(
                    (joursDispos[jourSelectionne]?.creneaux || creneaux)
                      .filter(c => {
                        const estAujourdhui = jourSelectionne === 0 && joursDispos[0]?.label === "Aujourd'hui"
                        if (estAujourdhui && heureEnMinutes(c.heure_debut) <= maintenant()) return false
                        return true
                      })
                      .map(c => [`${c.heure_debut}-${c.heure_fin}`, c])
                  ).values()].map(c => {
                    const modeTemps = (c.mode_capacite || commercant?.mode_capacite) === 'temps'
                    const capacite = modeTemps ? (c.capacite_temps || 30) : c.max_commandes
                    const utilise = modeTemps ? (c.temps_cumul || 0) : c.count
                    const creneauxTries = joursDispos[jourSelectionne]?.creneaux || creneaux
                    const idxCourant = creneauxTries.findIndex(x => x.id === c.id)
                    let debordement = 0
                    if (modeTemps && idxCourant > 0) {
                      const prec = creneauxTries[idxCourant - 1]
                      const cap = prec.capacite_temps || 30
                      const util = prec.temps_cumul || 0
                      if (util > cap) debordement = util - cap
                    }
                    const utiliseEff = utilise + debordement
                    const complet = utiliseEff >= capacite
                    const places = capacite - utiliseEff
                    const bientot = !complet && places <= (modeTemps ? capacite * 0.15 : 1)
                    const presque = !complet && places <= (modeTemps ? capacite * 0.3 : 2) && !bientot
                    const choisi = creneauChoisi === c.id
                    let mention = null
                    if (complet) mention = { text: 'Complet', color: '#DC2626' }
                    else if (bientot) mention = { text: '🔥 Dernière place !', color: '#EA580C' }
                    else if (presque) mention = { text: '⚡ Presque complet', color: '#D97706' }
                    return (
                      <div key={c.id} onClick={() => { if (!complet) { setCreneauChoisi(c.id); setErreurCommande(null); setAjustementStock(null) } }}
                        style={{ padding: '0.75rem 0.5rem', borderRadius: 14, border: `2px solid ${complet ? '#E5E7EB' : choisi ? T.main : T.pale}`, background: complet ? '#F9FAFB' : choisi ? T.pale : '#fff', cursor: complet ? 'default' : 'pointer', textAlign: 'center', transition: 'all 0.15s', boxShadow: choisi ? `0 4px 16px ${T.main}33` : 'none' }}>
                        <p style={{ fontWeight: 800, fontSize: '0.9rem', color: complet ? '#D1D5DB' : T.ink, textDecoration: complet ? 'line-through' : 'none' }}>
                          {c.heure_debut.slice(0,5)} – {c.heure_fin.slice(0,5)}
                        </p>
                        {mention && <p style={{ fontSize: '0.6rem', fontWeight: 800, color: mention.color, marginTop: 4 }}>{mention.text}</p>}
                        {choisi && <p style={{ fontSize: '0.6rem', fontWeight: 800, color: T.main, marginTop: 4 }}>✓ Choisi</p>}
                      </div>
                    )
                  })}
                  {(joursDispos[jourSelectionne]?.creneaux || []).length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '1.5rem', color: T.muted, fontSize: '0.875rem', fontWeight: 600 }}>
                      Aucun créneau disponible ce jour.
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink }}>Tes coordonnées</span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <input placeholder="Prénom *" type="text" value={client.prenom} onChange={e => setClient(p => ({ ...p, prenom: e.target.value }))} style={{ ...inputSt, marginBottom: 0 }}/>
                  <input placeholder="Nom *" type="text" value={client.nom} onChange={e => setClient(p => ({ ...p, nom: e.target.value }))} style={{ ...inputSt, marginBottom: 0 }}/>
                </div>
                <input placeholder="Email *" type="email" value={client.email} onChange={e => setClient(p => ({ ...p, email: e.target.value }))} style={inputSt}/>
                <input placeholder="Téléphone *" type="tel" value={client.telephone} onChange={e => setClient(p => ({ ...p, telephone: e.target.value }))} style={inputSt}/>

                <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${T.pale}`, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ padding: '0.625rem 1rem', background: T.pale }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔒 Confidentialité</p>
                  </div>
                  {[
                    { key: 'rgpdCommande', val: rgpdCommande, set: setRgpdCommande, label: 'Traitement de ma commande', badge: 'Obligatoire', badgeColor: '#DC2626', badgeBg: '#FEE2E2', desc: `J'accepte que mes coordonnées soient transmises à ${commercant.nom} pour le traitement de ma commande.` },
                    { key: 'rgpdMarketing', val: rgpdMarketing, set: setRgpdMarketing, label: 'Offres et actualités', badge: 'Optionnel', badgeColor: T.main, badgeBg: T.pale, desc: `J'accepte que ${commercant.nom} utilise mes coordonnées pour m'envoyer des offres.` },
                  ].map((item, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.875rem 1rem', cursor: 'pointer', borderBottom: i === 0 ? `1px solid ${T.pale}` : 'none', background: item.val ? '#F0FDF4' : '#fff' }}>
                      <div onClick={() => item.set(v => !v)}
                        style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${item.val ? '#16A34A' : '#D1D5DB'}`, background: item.val ? '#16A34A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s' }}>
                        {item.val && <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 900 }}>✓</span>}
                      </div>
                      <div>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: T.ink, marginBottom: 2 }}>
                          {item.label} <span style={{ fontSize: '0.62rem', fontWeight: 700, background: item.badgeBg, color: item.badgeColor, padding: '1px 6px', borderRadius: 100, marginLeft: 4 }}>{item.badge}</span>
                        </p>
                        <p style={{ fontSize: '0.75rem', color: T.muted, lineHeight: 1.5 }}>{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {/* FIX 1&2 — Message d'erreur avec actions intelligentes */}
                {erreurCommande && (
                  <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '0.875rem 1rem', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.5 }}>{erreurCommande}</p>
                      </div>
                      <button onClick={() => { setErreurCommande(null); setAjustementStock(null) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '1rem', fontWeight: 700, flexShrink: 0, padding: 0 }}>✕</button>
                    </div>
                    {ajustementStock && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        {ajustementStock.stockDisponible > 0 && (
                          <button onClick={() => {
                            // Réduire automatiquement la quantité au stock disponible
                            setPanier(prev => {
                              const next = { ...prev }
                              let restant = ajustementStock.stockDisponible
                              Object.keys(next).forEach(key => {
                                if (key === String(ajustementStock.articleId) || key.startsWith(`${ajustementStock.articleId}_`)) {
                                  if (restant > 0) {
                                    const qte = Math.min(next[key].quantite, restant)
                                    next[key] = { ...next[key], quantite: qte }
                                    restant -= qte
                                  } else {
                                    delete next[key]
                                  }
                                }
                              })
                              return next
                            })
                            setErreurCommande(null)
                            setAjustementStock(null)
                          }}
                            style={{ padding: '0.5rem 1rem', borderRadius: 100, border: 'none', background: T.main, color: '#fff', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                            ✓ Réduire à {ajustementStock.stockDisponible}
                          </button>
                        )}
                        <button onClick={() => { setEtape(2); setErreurCommande(null); setAjustementStock(null) }}
                          style={{ padding: '0.5rem 1rem', borderRadius: 100, border: `1.5px solid ${T.main}`, background: '#fff', color: T.main, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                          ← Modifier mon panier
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button onClick={passerCommande} disabled={loadingCommande || !formValide}
                  style={{ ...btnPrimary, opacity: !formValide ? 0.45 : 1, cursor: !formValide ? 'default' : 'pointer' }}>
                  {loadingCommande ? 'En cours...' : `Confirmer ma commande — ${totalPanier().toFixed(2)}€`}
                </button>
                {!rgpdCommande && <p style={{ fontSize: '0.75rem', color: '#DC2626', textAlign: 'center', marginTop: 6, fontWeight: 600 }}>⚠️ Accepte le traitement de ta commande pour continuer</p>}
                <p style={{ fontSize: '0.78rem', color: '#9a8ab0', textAlign: 'center', marginTop: 8, marginBottom: 24 }}>Le paiement sera activé prochainement</p>
              </div>
            </div>
          )}

          {/* ÉTAPE 4 — Confirmation */}
          {!loading && etape === 4 && commercant && (
            <div style={{ padding: '1.5rem 1rem', animation: 'fadeUp 0.4s ease' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>🎉</div>
                <p style={{ fontWeight: 900, fontSize: '1rem', color: T.main, marginBottom: 4 }}>yoppaa</p>
                {derniereCommande?.numeroSequentiel && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '6px 20px', marginBottom: 12, boxShadow: `0 4px 16px ${T.main}44` }}>
                    <span style={{ fontWeight: 900, fontSize: '1.4rem', color: '#fff', letterSpacing: '-0.5px' }}>#{derniereCommande.numeroSequentiel}</span>
                  </div>
                )}
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

              {isDesktop && (
                <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, borderRadius: 20, padding: '1.25rem', marginBottom: '1rem', border: `1px solid ${T.main}44`, textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
                    {[{c:'rgba(255,255,255,0.4)',s:5},{c:T.light,s:7},{c:T.mid,s:5}].map((d,i)=>(
                      <div key={i} style={{width:d.s,height:d.s,borderRadius:'50%',background:d.c}}/>
                    ))}
                  </div>
                  <p style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem', marginBottom: 6 }}>📱 Pour ton retrait sans attendre</p>
                  <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, marginBottom: 12 }}>
                    Tu as commandé depuis ton PC. Pour utiliser l'écran de retrait prioritaire Yoppaa chez le commerçant, télécharge l'app sur ton téléphone.<br/>
                    <strong style={{ color: T.light }}>Tes identifiants restent les mêmes.</strong>
                  </p>
                  <a href="https://yoppaa.app/download"
                    style={{ display: 'inline-block', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', borderRadius: 100, padding: '10px 24px', fontSize: '0.875rem', fontWeight: 800, textDecoration: 'none', boxShadow: `0 4px 16px ${T.main}55` }}>
                    Télécharger Yoppaa →
                  </a>
                  <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>ICI ON EST YOPPERS 🟣</p>
                </div>
              )}

              <button onClick={() => router.push('/commander')} style={{ ...btnPrimary, marginBottom: 10 }}>← Retour à l'accueil</button>
              <button onClick={() => { setPanier({}); setCreneauChoisi(null); setRgpdCommande(false); setRgpdMarketing(false); setErreurCommande(null); setAjustementStock(null); setEtape(2) }}
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