'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canDo, isVitrine } from '@/lib/plans'
import PillsStatut from '../PillsStatut'
import CTAUpgrade from '../CTAUpgrade'
import ModalSignalement from '../ModalSignalement'
import HorairesSection from '../HorairesSection'
// Icônes Lucide React (charte Yoppaa, pas d'emoji décoratif)
import { Star, Flame, Calendar, Store } from 'lucide-react'

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
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1,2,3,4,5].map(i => <Star key={i} size={taille} strokeWidth={1.6} color={i<=n ? '#F59E0B' : '#D1D5DB'} fill={i<=n ? '#F59E0B' : 'none'}/>)}</span>
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
      setSwiping(false); setPhase('success')
      try { const a = new Audio('/sounds/yop.mp3'); a.volume = 0.8; const p = a.play(); if (p) p.catch(()=>{}) } catch(e) {}
      setTimeout(() => { setPhase('done'); onConfirm() }, 2200)
    }
  }
  const onEnd = () => { if (phase !== 'swiping') return; setSwiping(false); setPhase('idle'); setSwipeX(0) }
  const p = swipeX / (getMaxX() || 1)
  const TRACK_H = THUMB + 8
  if (phase === 'success' || phase === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          {[{c:C.main,d:'0s',s:10},{c:C.light,d:'0.15s',s:14},{c:C.mid,d:'0.3s',s:10}].map((d,i) => (
            <div key={i} style={{ width: d.s, height: d.s, borderRadius: '50%', background: d.c, animation: `swipePulse 0.6s ease-in-out ${d.d} infinite alternate`, boxShadow: `0 0 12px ${d.c}88` }}/>
          ))}
        </div>
        <p style={{ fontWeight: 900, fontSize: '1.1rem', color: C.ink, letterSpacing: '-0.3px', marginBottom: 4 }}>Récupéré !</p>
        <p style={{ fontSize: '0.82rem', color: '#6B7280', fontWeight: 600 }}>Profite bien {clientPrenom} !</p>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', animation: 'swipeArrow 1.2s ease-in-out infinite' }}>Glisse pour récupérer →→→</span>
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
  const verifie = !!a.commande_id
  return (
    <div onClick={() => setOuvert(o => !o)}
      style={{ background: T.bgCard, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.5rem', border: `1.5px solid ${T.pale}`, cursor: 'pointer', transition: 'all 0.15s' }}
      onMouseOver={e => e.currentTarget.style.borderColor = T.main}
      onMouseOut={e => e.currentTarget.style.borderColor = T.pale}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Etoiles note={a.note} taille={14}/>
          {verifie && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: '#10B981', background: '#F0FDF4', padding: '2.5px 8px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase', border: '1px solid #BBF7D0' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              Vérifié
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', color: T.deep, fontWeight: 600 }}>{a.client?.nom || 'Client'}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: ouvert ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
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
    <div style={{ background: '#fff', borderRadius: 14, padding: '1rem', marginTop: 8, border: `1.5px solid ${T.pale}` }}>
      <p style={{ fontWeight: 800, color: T.deep, marginBottom: 12, fontSize: '0.9rem' }}>Personnalise ton {article.nom}</p>
      {groupes.map(g => {
        const isUnique = g.type === 'unique'
        return (
          <div key={g.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <p style={{ fontWeight: 800, color: T.ink, fontSize: '0.85rem' }}>{g.nom}</p>
              <span style={{ fontSize: '0.6rem', fontWeight: 800, background: isUnique ? T.deep : T.pale, color: isUnique ? '#fff' : T.deep, padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {isUnique ? 'Choisis-en un' : 'Cumulables'}
              </span>
              {g.obligatoire && <span style={{ fontSize: '0.6rem', fontWeight: 800, background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Obligatoire</span>}
            </div>
            {erreurs[g.id] && <p style={{ fontSize: '0.72rem', color: '#DC2626', marginBottom: 4, fontWeight: 700 }}>Choix obligatoire</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(g.valeurs||[]).map(v => {
                const selected = !!(selections[g.id]||[]).find(s => s.id === v.id)
                return (
                  <button key={v.id} onClick={() => toggleValeur(g, v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.55rem 0.75rem', borderRadius: 10, border: `1.5px solid ${selected ? T.main : T.pale}`, background: selected ? `${T.main}0c` : '#fff', cursor: 'pointer', transition: 'all 0.15s', fontFamily: '"DM Sans", sans-serif', textAlign: 'left', width: '100%' }}>
                    {/* Indicateur visuel : rond plein si unique (radio), carré coché si multi (checkbox) */}
                    <span style={{ width: 18, height: 18, borderRadius: isUnique ? '50%' : 5, border: `2px solid ${selected ? T.main : '#D1D5DB'}`, background: selected ? T.main : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                      {selected && (isUnique
                        ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }}/>
                        : <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </span>
                    <span style={{ flex: 1, fontWeight: selected ? 700 : 600, color: T.ink, fontSize: '0.85rem' }}>{v.nom}</span>
                    {v.prix_supplement > 0 && (
                      <span style={{ fontWeight: 800, color: T.main, fontSize: '0.78rem' }}>+{Number(v.prix_supplement).toFixed(2)}€</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      <button onClick={valider}
        style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${T.main}44`, marginTop: 4 }}>
        Ajouter au panier{supplement > 0 ? ` (+${supplement.toFixed(2)}€)` : ''}
      </button>
    </div>
  )
}

// ─── RecapPanier — FIX STOCK : prop getStockMax, bouton + bloqué ──────────────
function RecapPanier({ panier, onRetirer, onAjouter, total, onValider, getStockMax }) {
  const items = Object.entries(panier)
  if (items.length === 0) return null
  function labelOptions(options) {
    if (!options) return null
    return Object.values(options).flat().map(v => v.nom).join(', ')
  }
  return (
    <div style={{ background: '#fff', borderRadius: 20, border: `2px solid ${T.main}22`, overflow: 'hidden', marginTop: 20, boxShadow: `0 8px 32px ${T.main}18` }}>
      {/* Bande 3px canonique YOPPAA */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
      <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, padding: '0.875rem 1.25rem' }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#fff', fontSize: '0.875rem', margin: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h2l2.4 11.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L22 7H6"/>
            <circle cx="9" cy="20" r="1.5"/>
            <circle cx="18" cy="20" r="1.5"/>
          </svg>
          Mon panier
        </p>
      </div>
      <div style={{ padding: '0.5rem 1.25rem' }}>
        {items.map(([key, item]) => {
          const opts = labelOptions(item.options)
          const prixUnitaire = item.prix + (item.options ? Object.values(item.options).flat().reduce((s, v) => s + (v.prix_supplement||0), 0) : 0)
          // FIX STOCK : vérifier la limite par article dans le panier
          const stockMax = getStockMax ? getStockMax(item.id) : Infinity
          const stockAtteintPanier = stockMax !== Infinity && item.quantite >= stockMax
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.625rem 0', borderBottom: `1px solid ${T.pale}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button onClick={() => onRetirer(key)}
                  style={{ width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 900, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 22 }}>
                  <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink, textAlign: 'center' }}>{item.quantite}</span>
                  {stockAtteintPanier && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: '0.48rem', fontWeight: 800, color: T.main, letterSpacing: '0.3px', whiteSpace: 'nowrap', lineHeight: 1 }}>
                      MAX
                      <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => !stockAtteintPanier && onAjouter(key, item)}
                  disabled={stockAtteintPanier}
                  style={{ width: 30, height: 30, borderRadius: 9, border: 'none', background: stockAtteintPanier ? '#E5E7EB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: stockAtteintPanier ? '#9CA3AF' : '#fff', fontWeight: 900, cursor: stockAtteintPanier ? 'default' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>+</button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, color: T.ink, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nom}</p>
                {opts && <p style={{ fontSize: '0.7rem', color: T.muted, marginTop: 1 }}>{opts}</p>}
                {stockAtteintPanier && (
                  <p style={{ fontSize: '0.68rem', color: T.main, fontWeight: 700, marginTop: 2 }}>Stock disponible atteint</p>
                )}
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
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }}>
          Choisir mon créneau
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/>
            <path d="M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── ArticleRow ───────────────────────────────────────────────────────────────
function ArticleRow({ article, panier, optionsParArticle, ajouterAuPanier, retirerDuPanier, qteTotaleArticle, stocksJour, jourSelectionne, joursDispos, onCommanderDemain, getStockMax, commandesParArticleJour, modeVitrine = false, masquerPrix = false, dealArticle = null, onClickDeal = null }) {
  const groupes = optionsParArticle[article.id] || []
  const hasOptions = groupes.length > 0
  const [showOptions, setShowOptions] = useState(false)
  const qteTotale = qteTotaleArticle(article.id)
  const keySimple = String(article.id)

  const stocksArticle = stocksJour[article.id] || {}
  const hasStockJour = Object.keys(stocksArticle).length > 0

  const jourDateSelectionne = joursDispos[jourSelectionne]?.date || new Date()
  const jourNomSelectionne = JOURS[jourIdx(jourDateSelectionne)]

  // Logique unifiée avec getStockMax :
  // - entrée article_stock_jour pour ce jour → source de vérité
  // - sinon → fallback sur article.stock_jour global
  // - stock géré ssi (entrée existe pour ce jour) OU (stock_jour global > 0)
  const entryDay = stocksArticle[jourNomSelectionne]
  let stockBrutSelectionne, actifCeJour
  if (entryDay) {
    actifCeJour = entryDay.actif !== false
    stockBrutSelectionne = entryDay.actif === false ? 0 : (entryDay.stock || 0)
  } else {
    actifCeJour = true
    stockBrutSelectionne = article.stock_jour || 0
  }
  const stockGere = !!entryDay || (article.stock_jour || 0) > 0
  const dejaCommande = (commandesParArticleJour && commandesParArticleJour[article.id]) || 0
  const stockAujourdhui = Math.max(0, stockBrutSelectionne - dejaCommande)
  const epuiseAujourdhui = stockGere && stockAujourdhui === 0

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
  const stockAtteint = stockGere && stockAujourdhui > 0 && qteTotale >= stockAujourdhui

  return (
    <div className="art-card" style={{ background: '#fff', borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.625rem', border: `1.5px solid ${(epuiseComplet || inactifCeJour) ? '#E5E7EB' : qteTotale > 0 ? T.main+'44' : T.pale}`, boxShadow: qteTotale > 0 ? `0 2px 12px ${T.main}18` : '0 1px 4px rgba(107,53,196,0.04)', opacity: (epuiseComplet || inactifCeJour) ? 0.6 : 1, transition: 'all 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, color: T.ink, marginBottom: 2, fontSize: '0.95rem', letterSpacing: '-0.2px' }}>{article.nom}</p>
          {article.description && <p style={{ fontSize: '0.78rem', color: T.muted, marginBottom: 5, lineHeight: 1.4 }}>{article.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {masquerPrix ? (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, background: '#F3F4F6', padding: '4px 10px', borderRadius: 100, border: '1px dashed #D1D5DB' }}>
                Prix non affichés
              </span>
            ) : dealArticle && dealArticle.prix_deal != null ? (
              // Prix barré + prix deal en accent
              <>
                <p style={{ fontSize: '1rem', color: T.main, fontWeight: 900, letterSpacing: '-0.3px' }}>{Number(dealArticle.prix_deal).toFixed(2)}€</p>
                <p style={{ fontSize: '0.78rem', color: T.muted, fontWeight: 700, textDecoration: 'line-through' }}>{Number(article.prix).toFixed(2)}€</p>
              </>
            ) : article.est_vitrine ? (
              // Article en mode vitrine : "à partir de X €" ou "Prix sur demande"
              Number(article.prix) > 0 ? (
                <p style={{ fontSize: '0.95rem', color: T.main, fontWeight: 800, letterSpacing: '-0.2px' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: T.muted, marginRight: 4 }}>dès</span>
                  {Number(article.prix).toFixed(2)}€
                </p>
              ) : (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, background: '#F9FAFB', padding: '4px 10px', borderRadius: 100 }}>
                  Prix sur demande
                </span>
              )
            ) : (
              <p style={{ fontSize: '1rem', color: T.main, fontWeight: 900, letterSpacing: '-0.3px' }}>{Number(article.prix).toFixed(2)}€</p>
            )}
            {hasOptions && (
              <button onClick={e => { e.stopPropagation(); setShowOptions(v => !v) }}
                aria-label="Composer cet article"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 800, color: T.main, background: T.pale, padding: '3px 9px 3px 7px', borderRadius: 100, border: `1px solid ${T.main}22`, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', letterSpacing: '-0.1px', transition: 'all 0.15s' }}
                onMouseOver={e => { e.currentTarget.style.background = `${T.main}1f`; e.currentTarget.style.borderColor = `${T.main}55` }}
                onMouseOut={e => { e.currentTarget.style.background = T.pale; e.currentTarget.style.borderColor = `${T.main}22` }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.9 5.8H20l-5 3.6L17 18l-5-3.6L7 18l2-5.6-5-3.6h6.1L12 3z"/>
                </svg>
                Compose +{groupes.length}
              </button>
            )}
            {/* Badge DEAL cliquable si article lié à un deal actif */}
            {dealArticle && (
              <button onClick={e => { e.stopPropagation(); if (onClickDeal) onClickDeal(dealArticle) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, padding: '3px 10px 3px 8px', borderRadius: 100, border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px', boxShadow: `0 2px 8px rgba(22,6,54,0.3)`, animation: 'dealGlow 1.8s ease-in-out infinite', fontFamily: '"DM Sans", sans-serif' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#FB923C" stroke="#FB923C" strokeWidth="0.5" strokeLinejoin="round">
                  <path d="M12 2c1 3 3 4 3 7 0 1.5-1 3-3 3s-3-1.5-3-3c0-2 2-3 3-7zm-5 9c-1 0-3 2-3 6 0 4 3 5 8 5s8-1 8-5c0-4-2-6-3-6 0 3-2 5-5 5s-5-2-5-5z"/>
                </svg>
                Deal
              </button>
            )}
          </div>

          {/* Indicateur stock 3 niveaux — clair et pro */}
          {stockGere && (() => {
            // Pastilles status : dot taille 9 statique pour harmonisation YOPPAA (status indicator, pas live event)
            if (inactifCeJour) {
              return prochain ? (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#F9FAFB', color: T.muted, padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#9CA3AF', flexShrink: 0 }}/>
                  Fermé — dispo {prochain.nom}
                </span>
              ) : (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#F9FAFB', color: T.muted, padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#9CA3AF', flexShrink: 0 }}/>
                  Indisponible
                </span>
              )
            }
            if (stockAujourdhui === 0) {
              return (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }}/>
                  Épuisé
                </span>
              )
            }
            if (stockAujourdhui <= 5) {
              return (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#FFF7ED', color: '#EA580C', padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#EA580C', flexShrink: 0 }}/>
                  Plus que {stockAujourdhui}
                </span>
              )
            }
            return (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#F0FDF4', color: '#10B981', padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10B981', flexShrink: 0 }}/>
                Disponible
              </span>
            )
          })()}
        </div>

        {!modeVitrine && !epuiseComplet && !inactifCeJour && !epuiseAujourdhui && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12, flexShrink: 0 }}>
            {hasOptions ? (
              // hasOptions : "+ " ouvre les options (au lieu d'ajouter direct). Compteur visible si qte > 0.
              // Visuel uniforme avec les articles simples : meme bouton "+ " gradient, plus de gros gear violet.
              <>
                {qteTotale > 0 && (
                  <div style={{ background: T.main, color: '#fff', fontWeight: 900, fontSize: '0.78rem', borderRadius: 100, minWidth: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', boxShadow: `0 2px 8px ${T.main}33` }}>
                    {qteTotale}
                  </div>
                )}
                <button onClick={() => setShowOptions(v => !v)} disabled={stockAtteint}
                  aria-label="Composer cet article"
                  style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: stockAtteint ? '#E5E7EB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: stockAtteint ? '#9CA3AF' : '#fff', fontWeight: 900, cursor: stockAtteint ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: stockAtteint ? 'none' : `0 4px 14px ${T.main}55`, transition: 'all 0.15s' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14"/>
                    <path d="M5 12h14"/>
                  </svg>
                </button>
              </>
            ) : (
              qteTotale > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => retirerDuPanier(keySimple)}
                    aria-label="Retirer"
                    style={{ width: 34, height: 34, borderRadius: 10, border: `2px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink, minWidth: 22, textAlign: 'center' }}>{qteTotale}</span>
                    {stockAtteint && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: '0.5rem', fontWeight: 800, color: T.main, letterSpacing: '0.3px', whiteSpace: 'nowrap', lineHeight: 1 }}>
                        MAX
                        <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                      </span>
                    )}
                  </div>
                  <button onClick={() => !stockAtteint && ajouterAuPanier(article)} disabled={stockAtteint}
                    aria-label="Ajouter"
                    style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: stockAtteint ? '#E5E7EB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: stockAtteint ? '#9CA3AF' : '#fff', fontWeight: 900, cursor: stockAtteint ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: stockAtteint ? 'none' : `0 4px 14px ${T.main}55`, transition: 'all 0.15s' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => !stockAtteint && ajouterAuPanier(article)}
                  disabled={stockAtteint}
                  aria-label="Ajouter"
                  style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: stockAtteint ? '#E5E7EB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: stockAtteint ? '#9CA3AF' : '#fff', fontWeight: 900, cursor: stockAtteint ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: stockAtteint ? 'none' : `0 4px 14px ${T.main}55` }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                </button>
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

// ─── HeroCarousel : photo couverture + galerie scroll-snap horizontal ────────
// S4 : si une seule photo (ou aucune), comportement identique a l'ancien hero
// (image fullbleed ou fallback gradient branded). Si 2+ photos, scroll snap
// horizontal avec dots pagination en bas du hero.
function HeroCarousel({ couverture, galerie, nomCommerce }) {
  const scrollRef = useRef(null)
  const [active, setActive] = useState(0)

  // Liste des photos a afficher : couverture en premier, puis galerie par ordre
  const photos = []
  if (couverture?.url) photos.push({ id: 'couverture', url: couverture.url })
  ;(galerie || []).forEach(p => { if (p?.url) photos.push({ id: p.id, url: p.url }) })

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    if (idx !== active) setActive(idx)
  }
  function goTo(i) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  // Aucune photo : fallback gradient branded (comportement initial)
  if (photos.length === 0) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 40%, ${T.main} 100%)` }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 80% 20%, ${T.mid}55 0%, transparent 60%), radial-gradient(circle at 20% 80%, ${T.light}22 0%, transparent 50%)` }}/>
      </div>
    )
  }
  // Une seule photo : pas de carousel, image fullbleed
  if (photos.length === 1) {
    return <img src={photos[0].url} alt={nomCommerce} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
  }
  // 2+ photos : scroll snap horizontal natif + dots pagination
  return (
    <>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden',
          display: 'flex', scrollSnapType: 'x mandatory', scrollBehavior: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
        className="hero-carousel-track"
      >
        {photos.map(p => (
          <div key={p.id} style={{ flex: '0 0 100%', height: '100%', scrollSnapAlign: 'start' }}>
            <img src={p.url} alt={nomCommerce} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
          </div>
        ))}
      </div>
      {/* Pagination dots */}
      <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, zIndex: 4, display: 'flex', justifyContent: 'center', gap: 6, pointerEvents: 'none' }}>
        {photos.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Photo ${i + 1}`}
            style={{
              width: active === i ? 22 : 8, height: 8, borderRadius: 100,
              background: active === i ? '#fff' : 'rgba(255,255,255,0.5)',
              border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              pointerEvents: 'auto', padding: 0,
            }}
          />
        ))}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `.hero-carousel-track::-webkit-scrollbar { display: none; } .hero-carousel-track { scrollbar-width: none; }` }}/>
    </>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function CommanderSlug() {
  const { slug } = useParams()
  const router = useRouter()

  const [etape, setEtape] = useState(2)
  const [showSignalement, setShowSignalement] = useState(false)
  const [signalementSent, setSignalementSent] = useState(false)
  const [commercant, setCommercant] = useState(null)
  const [articles, setArticles] = useState([])
  const [creneaux, setCreneaux] = useState([])
  const [avisCommerce, setAvisCommerce] = useState([])
  const [notesInfo, setNotesInfo] = useState({ moyenne: 0, count: 0 })
  const [panier, setPanier] = useState({})
  const [creneauChoisi, setCreneauChoisi] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingCommande, setLoadingCommande] = useState(false)
  const [erreurCommande, setErreurCommande] = useState(null)
  const [ajustementStock, setAjustementStock] = useState(null)
  const [client, setClient] = useState({ prenom: '', nom: '', email: '', telephone: '' })
  const [rgpdCommande, setRgpdCommande] = useState(false)
  // Marketing pre-coche par defaut : maximise le taux d'opt-in (l'utilisateur peut decocher s'il refuse)
  const [rgpdMarketing, setRgpdMarketing] = useState(true)
  const [clientId, setClientId] = useState(null)
  const [joursDispos, setJoursDispos] = useState([])
  const [jourSelectionne, setJourSelectionne] = useState(0)
  // Confirmation de changement de jour quand le panier n'est pas vide
  const [confirmationJour, setConfirmationJour] = useState(null) // { nouveauIdx }
  const [optionsParArticle, setOptionsParArticle] = useState({})
  const [stocksJour, setStocksJour] = useState({})
  // FIX STOCK SYNC : quantités déjà commandées par d'autres clients pour le jour sélectionné
  const [commandesParArticleJour, setCommandesParArticleJour] = useState({})
  const [photoCouverture, setPhotoCouverture] = useState(null)
  const [galerie, setGalerie] = useState([])
  const [actualites, setActualites] = useState([])
  const [dealActif, setDealActif] = useState(null)
  // Map article_id → deal pour appliquer la reduction sur articles concernes
  const [dealsParArticle, setDealsParArticle] = useState({})
  // Modale detail deal (titre + description + dates + prix)
  const [dealDetailOuvert, setDealDetailOuvert] = useState(null)
  const [fermetures, setFermetures] = useState([])
  const [derniereCommande, setDerniereCommande] = useState(null)
  const [isDesktop, setIsDesktop] = useState(false)

  const [categorieActive, setCategorieActive] = useState(null)
  const [catBarVisible, setCatBarVisible] = useState(false)

  // Favoris + partage : 2 boutons en overlay sur le hero photo (pattern TGTG)
  const [estFavori, setEstFavori] = useState(false)
  const [favoriLoading, setFavoriLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)
  const catRefs = useRef({})
  const headerRef = useRef(null)
  const scrollRef = useRef(null)

  // Lecture de l'état favori au mount (et quand clientId / commercant changent)
  useEffect(() => {
    if (!clientId || !commercant?.id) return
    let annule = false
    ;(async () => {
      const { data } = await supabase
        .from('favoris')
        .select('client_id')
        .eq('client_id', clientId)
        .eq('commercant_id', commercant.id)
        .maybeSingle()
      if (!annule) setEstFavori(!!data)
    })()
    return () => { annule = true }
  }, [clientId, commercant?.id])

  // Toggle favori (création/suppression dans la table favoris)
  async function toggleFavori() {
    if (!commercant?.id || favoriLoading) return
    if (!client.email || !clientId) {
      // Pas connecté → redirige vers auth avec retour sur cette fiche
      router.push(`/commander/auth?redirect=/commander/${slug}`)
      return
    }
    setFavoriLoading(true)
    try {
      if (estFavori) {
        await supabase.from('favoris').delete().eq('client_id', clientId).eq('commercant_id', commercant.id)
        setEstFavori(false)
        setToastMessage('Retiré de tes favoris')
      } else {
        await supabase.from('favoris').insert({ client_id: clientId, commercant_id: commercant.id })
        setEstFavori(true)
        setToastMessage(`${commercant.nom} ajouté à tes favoris 🟣`)
      }
      setTimeout(() => setToastMessage(null), 2500)
    } finally {
      setFavoriLoading(false)
    }
  }

  // Partage natif (Web Share API) avec fallback copy URL
  async function partagerFiche() {
    const url = typeof window !== 'undefined' ? window.location.href : `https://www.yoppaa.app/commander/${slug}`
    const text = commercant ? `Découvre ${commercant.nom} sur Yoppaa 🟣` : 'Découvre ce commerce sur Yoppaa'
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: commercant?.nom || 'Yoppaa', text, url })
      } catch (e) {
        // L'utilisateur a annulé : on ne fait rien (AbortError est normal)
        if (e.name !== 'AbortError') console.warn('[share] échec', e)
      }
      return
    }
    // Fallback : copier l'URL dans le presse-papier
    try {
      await navigator.clipboard.writeText(url)
      setToastMessage('Lien copié dans le presse-papier 🟣')
    } catch (e) {
      setToastMessage('Impossible de partager — copie l\'URL manuellement')
    }
    setTimeout(() => setToastMessage(null), 2500)
  }

  useEffect(() => {
    // Vrai "desktop" = mouse-only (hover + pointer fine). Exclut iPad/Android tablette qui peuvent
    // installer la PWA pour le retrait. Un iPad detecte 1024px de large mais doit etre traite comme tablette.
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const check = () => setIsDesktop(mq.matches)
    check()
    if (mq.addEventListener) {
      mq.addEventListener('change', check)
      return () => mq.removeEventListener('change', check)
    }
    mq.addListener(check)
    return () => mq.removeListener(check)
  }, [])

  // Retour Stripe Checkout : success_url=?paiement=ok&commande_id=X&session_id=Y
  //                         cancel_url=?paiement=annule&commande_id=X
  // On nettoie l'URL via replaceState pour éviter de rejouer au refresh.
  useEffect(() => {
    if (typeof window === 'undefined' || !slug) return
    const params = new URLSearchParams(window.location.search)
    const paiement = params.get('paiement')
    const commandeId = params.get('commande_id')
    if (!paiement || !commandeId) return

    window.history.replaceState({}, '', window.location.pathname)

    if (paiement === 'annule') {
      setErreurCommande('Paiement annulé. Tu peux relancer ta commande quand tu veux 🟣')
      setEtape(3)
      return
    }

    if (paiement === 'ok') {
      // Statut peut encore être 'paiement_en_attente' si webhook pas encore arrivé :
      // on affiche quand même l'écran de confirmation (Stripe a confirmé le paiement).
      ;(async () => {
        const { data } = await supabase
          .from('commandes')
          .select('id, numero_commande, total, date_commande, statut, client_nom')
          .eq('id', commandeId)
          .single()
        if (data) {
          setDerniereCommande({ ...data, numeroSequentiel: data.numero_commande })
          setEtape(4)
          try { localStorage.removeItem(`yoppaa_commerce_${slug}`) } catch(e) {}
        }
      })()
    }
  }, [slug])

  useEffect(() => {
    if (!slug) return
    const email = localStorage.getItem('yoppaa_email')
    const prenom = localStorage.getItem('yoppaa_prenom')
    const nom = localStorage.getItem('yoppaa_nom')
    const telephone = localStorage.getItem('yoppaa_telephone')
    const id = localStorage.getItem('yoppaa_client_id')
    if (email && id) {
      // Pre-remplir TOUS les champs (telephone inclus depuis la migration SQL clients)
      setClient(p => ({ ...p, email, prenom: prenom || '', nom: nom || '', telephone: telephone || '' }))
      setClientId(id)
      // Si telephone manquant en local (compte cree avant migration), tenter de le recharger depuis la DB
      if (!telephone) {
        supabase.from('clients').select('prenom, nom, telephone').eq('id', id).single().then(({ data }) => {
          if (data) {
            if (data.prenom) { localStorage.setItem('yoppaa_prenom', data.prenom); setClient(p => ({ ...p, prenom: data.prenom })) }
            if (data.nom) { localStorage.setItem('yoppaa_nom', data.nom); setClient(p => ({ ...p, nom: data.nom })) }
            if (data.telephone) { localStorage.setItem('yoppaa_telephone', data.telephone); setClient(p => ({ ...p, telephone: data.telephone })) }
          }
        })
      }
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
    // Garde-fou : si on tape /commander/[slug] pour un commercant VITRINE (coiffeur, esthe, etc.),
    // on redirige vers la fiche RDV native (cette page est pour l'alimentaire C&C uniquement).
    if (data.commercant?.categorie === 'vitrine' && data.commercant?.slug) {
      router.replace(`/commander/rdv/${data.commercant.slug}`)
      return
    }
    setCommercant(data.commercant)
    setArticles(data.articles)
    setCreneaux(data.creneaux)
    setAvisCommerce(data.avis)
    setNotesInfo(data.notesInfo)
    setOptionsParArticle(data.options)
    setStocksJour(data.stocksJour)
    setPhotoCouverture(data.photoCouverture)
    setGalerie(data.galerie || [])
    setActualites(data.actualites || [])
    setDealActif(data.dealActif)
    setDealsParArticle(data.dealsParArticle || {})
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
    // Bloque l'accès aux fiches non publiées (brouillon, en_attente, refusée).
    // L'admin a une route d'aperçu dédiée — à coder plus tard.
    if (c.statut_publication !== 'publie') {
      setLoading(false)
      setCommercant({ ...c, _nonPublie: true })
      return
    }

    const [
      { data: arts },
      { data: cren },
      { data: avis },
      { data: avisNotes },
      { data: commandesActives },
      { data: photosData },
      { data: dealsData },
      { data: fermeturesData },
      { data: actualitesData },
    ] = await Promise.all([
      supabase.from('articles').select('*').eq('commercant_id', c.id).eq('actif', true).order('categorie').order('nom'),
      supabase.from('creneaux').select('*').eq('commercant_id', c.id).eq('actif', true).order('heure_debut'),
      supabase.from('avis').select('*, client:clients(nom)').eq('commercant_id', c.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('avis').select('note').eq('commercant_id', c.id),
      supabase.from('commandes').select('creneau_id, commande_articles(quantite, article:articles(temps_prepa))').eq('commercant_id', c.id).not('statut', 'in', '(recupere,non_retire)'),
      supabase.from('commercant_photos').select('*').eq('commercant_id', c.id).order('ordre'),
      supabase.from('yoppaa_deals').select('*').eq('commercant_id', c.id).eq('actif', true),
      supabase.from('fermetures_exceptionnelles').select('*').eq('commercant_id', c.id).gte('date_fin', new Date().toISOString()),
      supabase.from('actualites').select('*').eq('commercant_id', c.id).eq('actif', true).order('created_at', { ascending: false }),
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
    const galerieAutres = (photosData||[]).filter(p => p.type !== 'couverture' && p.url)
    // Filtre des deals actifs aujourd'hui : aligne sur la logique home (commander/page.js).
    // Accepte les 2 formats : date_deal ponctuelle = aujourd'hui OU intervalle date_debut/date_fin.
    const aujourdhuiDate = new Date().toISOString().slice(0, 10)
    const dealsActifs = (dealsData || []).filter(d => {
      const dateDeal = d.date_deal || null
      const dStart = d.date_debut ? d.date_debut.slice(0,10) : null
      const dEnd   = d.date_fin   ? d.date_fin.slice(0,10)   : null
      if (dateDeal === aujourdhuiDate) return true
      if (dStart && dEnd && dStart <= aujourdhuiDate && aujourdhuiDate <= dEnd) return true
      return false
    })
    // Deal "vedette" affiche en bandeau : 1er deal SANS article_id (générique),
    // sinon le 1er deal (avec article_id) pour ne pas avoir un bandeau vide
    const deal = dealsActifs.find(d => !d.article_id) || dealsActifs[0] || null
    // Map article_id → deal (pour appliquer la réduction sur les articles concernés)
    const dealsParArticle = {}
    dealsActifs.forEach(d => { if (d.article_id) dealsParArticle[d.article_id] = d })

    // Filtrer les actus actives aujourd'hui (sur la fenêtre date_debut/date_fin)
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const actusActives = (actualitesData || []).filter(a => {
      const dStart = a.date_debut ? a.date_debut.slice(0,10) : null
      const dEnd   = a.date_fin   ? a.date_fin.slice(0,10)   : null
      if (!dStart && !dEnd) return true
      if (dStart && !dEnd) return dStart <= aujourdhui
      if (!dStart && dEnd) return aujourdhui <= dEnd
      return dStart <= aujourdhui && aujourdhui <= dEnd
    })

    const cacheData = {
      commercant: c,
      articles: arts || [],
      creneaux: creneauxAvecCount,
      avis: avis || [],
      notesInfo,
      options: opts,
      stocksJour: stocksJourMap,
      photoCouverture: couverture,
      galerie: galerieAutres,
      dealActif: deal,
      dealsParArticle,
      fermetures: fermeturesData || [],
      actualites: actusActives,
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

  // ─── FIX STOCK SYNC : charger les commandes du jour sélectionné ─────────────
  // Récupère les quantités déjà commandées par article pour le jour sélectionné
  // (exclut les commandes "non_retire") afin que le stock disponible affiché côté
  // client soit cohérent avec ce que voit le commerçant sur son dashboard.
  const chargerCommandesJour = useCallback(async () => {
    if (!commercant) return
    const jourDate = joursDispos[jourSelectionne]?.date || new Date()
    const d = new Date(jourDate)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

    // Approche en 2 étapes (plus robuste qu'une jointure avec filtres) :
    // 1) commandes du jour pour ce commerçant 2) leurs commande_articles
    const { data: cmds } = await supabase
      .from('commandes')
      .select('id')
      .eq('commercant_id', commercant.id)
      .eq('date_commande', dateStr)
      .neq('statut', 'non_retire')
    if (!cmds || cmds.length === 0) { setCommandesParArticleJour({}); return }
    const cmdIds = cmds.map(c => c.id)
    const { data: lignes } = await supabase
      .from('commande_articles')
      .select('article_id, quantite')
      .in('commande_id', cmdIds)
    const map = {}
    ;(lignes || []).forEach(r => {
      map[r.article_id] = (map[r.article_id] || 0) + r.quantite
    })
    setCommandesParArticleJour(map)
  }, [commercant, joursDispos, jourSelectionne])

  // Recharge à chaque changement de jour ou de commerçant
  useEffect(() => {
    chargerCommandesJour()
  }, [chargerCommandesJour])

  // Rafraîchit articles + stocks de fond — garantit que le client voit toujours
  // les vrais stocks configurés par le commerçant, même si le cache localStorage
  // est encore "frais" ou si Supabase Realtime n'est pas activé sur ces tables.
  const rafraichirArticlesEtStocks = useCallback(async () => {
    if (!commercant) return
    const { data: arts } = await supabase
      .from('articles')
      .select('*')
      .eq('commercant_id', commercant.id)
      .eq('actif', true)
      .order('categorie').order('nom')
    if (arts) setArticles(arts)
    const artIds = (arts || []).map(a => a.id)
    if (artIds.length > 0) {
      const [{ data: stocksData }, { data: groupesData }] = await Promise.all([
        supabase
          .from('article_stock_jour')
          .select('*')
          .eq('commercant_id', commercant.id)
          .in('article_id', artIds),
        supabase
          .from('article_options_groupes')
          .select('*, valeurs:article_options_valeurs(*)')
          .in('article_id', artIds)
          .order('created_at'),
      ])
      const stocksMap = {}
      ;(stocksData || []).forEach(s => {
        if (!stocksMap[s.article_id]) stocksMap[s.article_id] = {}
        stocksMap[s.article_id][s.jour_semaine] = { stock: s.stock, actif: s.actif }
      })
      setStocksJour(stocksMap)
      const optsMap = {}
      ;(groupesData || []).forEach(g => {
        if (!optsMap[g.article_id]) optsMap[g.article_id] = []
        optsMap[g.article_id].push(g)
      })
      setOptionsParArticle(optsMap)
    }
  }, [commercant])

  useEffect(() => {
    if (commercant) rafraichirArticlesEtStocks()
  }, [commercant, rafraichirArticlesEtStocks])

  // Polling toutes les 5s + Realtime Supabase pour sync temps réel avec le dashboard
  const articlesRef = useRef(articles)
  useEffect(() => { articlesRef.current = articles }, [articles])
  useEffect(() => {
    if (!commercant) return
    const intervalId = setInterval(() => {
      chargerCommandesJour()
      rafraichirArticlesEtStocks()
    }, 5000)
    const channel = supabase
      .channel(`stock-sync-${commercant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes', filter: `commercant_id=eq.${commercant.id}` }, () => chargerCommandesJour())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commande_articles' }, () => chargerCommandesJour())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'articles', filter: `commercant_id=eq.${commercant.id}` }, payload => {
        setArticles(prev => prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_stock_jour', filter: `commercant_id=eq.${commercant.id}` }, async () => {
        const artIds = articlesRef.current.map(a => a.id)
        if (artIds.length === 0) return
        const { data: stocksData } = await supabase
          .from('article_stock_jour')
          .select('*')
          .eq('commercant_id', commercant.id)
          .in('article_id', artIds)
        const map = {}
        ;(stocksData || []).forEach(s => {
          if (!map[s.article_id]) map[s.article_id] = {}
          map[s.article_id][s.jour_semaine] = { stock: s.stock, actif: s.actif }
        })
        setStocksJour(map)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_options_groupes' }, () => rafraichirArticlesEtStocks())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_options_valeurs' }, () => rafraichirArticlesEtStocks())
      .subscribe()
    return () => {
      clearInterval(intervalId)
      supabase.removeChannel(channel)
    }
  }, [commercant, chargerCommandesJour, rafraichirArticlesEtStocks])

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
    // FIX STOCK : vérifier la limite avant d'ajouter
    const stockMax = getStockMax(article.id)
    const qteTotale = qteTotaleArticle(article.id)
    if (stockMax !== Infinity && qteTotale >= stockMax) return
    const key = options ? `${article.id}_${JSON.stringify(options)}` : String(article.id)
    // Si un deal est lié à cet article ET fournit un prix_deal, applique-le.
    // On stocke prix_original séparément pour pouvoir afficher la barré.
    const deal = dealsParArticle[article.id]
    const articleAvecPrix = (deal && deal.prix_deal != null)
      ? { ...article, prix: Number(deal.prix_deal), prix_avant_deal: Number(article.prix), deal_id: deal.id }
      : article
    setPanier(prev => ({ ...prev, [key]: { ...articleAvecPrix, options, quantite: (prev[key]?.quantite || 0) + 1 } }))
  }

  // FIX STOCK : incrementerPanier vérifie aussi le stock
  function incrementerPanier(key, item) {
    const stockMax = getStockMax(item.id)
    const qteTotale = qteTotaleArticle(item.id)
    if (stockMax !== Infinity && qteTotale >= stockMax) return
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

  // Stock disponible d'un article pour le jour sélectionné. Priorité :
  // 1) entrée article_stock_jour pour ce jour-de-semaine (override fiable)
  // 2) sinon, fallback sur articles.stock_jour global
  // 3) si rien de défini (les deux à 0/null) → Infinity = stock non géré.
  // Toujours soustrait les commandes déjà passées (sync temps réel).
  function getStockMax(articleId) {
    const article = articles.find(a => a.id === articleId)
    if (!article) return Infinity
    const stocksArticle = stocksJour[articleId] || {}
    const jourDateSelectionne = joursDispos[jourSelectionne]?.date || new Date()
    const jourNomSelectionne = JOURS[jourIdx(jourDateSelectionne)]
    const entryDay = stocksArticle[jourNomSelectionne]
    const dejaCommande = commandesParArticleJour[articleId] || 0

    if (entryDay) {
      if (entryDay.actif === false) return 0
      const stockBrut = entryDay.stock || 0
      if (stockBrut <= 0) return 0
      return Math.max(0, stockBrut - dejaCommande)
    }
    if (!article.stock_jour || article.stock_jour <= 0) return Infinity
    return Math.max(0, article.stock_jour - dejaCommande)
  }

  function totalPanier() {
    return Object.values(panier).reduce((acc, i) => {
      const supplement = i.options ? Object.values(i.options).flat().reduce((s, v) => s + (v.prix_supplement||0), 0) : 0
      return acc + (i.prix + supplement) * i.quantite
    }, 0)
  }

  function commanderPourJour(idxJour) {
    // Vient du bouton "Commander [jour] →" sur un article épuisé aujourd'hui.
    // Change le jour (avec confirmation si panier non vide) sans passer
    // immédiatement à l'étape 3 — l'utilisateur doit pouvoir compléter son panier
    // avec d'autres articles du jour ciblé avant de choisir son créneau.
    changerJour(idxJour)
  }

  function changerJour(idx) {
    if (idx === jourSelectionne) return
    const panierNonVide = Object.keys(panier).length > 0
    if (panierNonVide) {
      setConfirmationJour({ nouveauIdx: idx })
    } else {
      setJourSelectionne(idx)
      setCreneauChoisi(null)
    }
  }

  function confirmerChangementJour() {
    if (!confirmationJour) return
    setPanier({})
    setJourSelectionne(confirmationJour.nouveauIdx)
    setCreneauChoisi(null)
    setErreurCommande(null)
    setAjustementStock(null)
    setConfirmationJour(null)
  }

  async function getOuCreerClient(email, prenom, nom) {
    const telephone = client.telephone || ''
    // IMPORTANT : on UPDATE clients.nom avec `nom` SEUL (pas `${prenom} ${nom}`).
    // Sinon a chaque commande/RDV, clients.nom devient 'Alexandre Verstappen' alors que
    // dans le Profil le user a saisi nom='Verstappen' uniquement. Au reload, fetch DB
    // ecrase la modif propre. Bug rapporte par Alex 2026-06-01.
    const { data: ex } = await supabase.from('clients').select('id, prenom, nom, telephone').eq('email', email).maybeSingle()
    let id = ex?.id
    if (!ex) {
      // Nouveau client : INSERT avec tous les champs SEPARES
      const { data: { user } } = await supabase.auth.getUser()
      const base = { email, prenom, nom, telephone }
      const payload = user ? { ...base, auth_user_id: user.id } : base
      const { data: inserted } = await supabase.from('clients').insert(payload).select('id').single()
      id = inserted?.id
    } else {
      // Client existant : UPDATE seulement si donnees ont change (evite RTT inutile sur chaque commande)
      const needsUpdate = (
        (telephone && ex.telephone !== telephone) ||
        (prenom    && ex.prenom    !== prenom) ||
        (nom       && ex.nom       !== nom)
      )
      if (needsUpdate) {
        await supabase.from('clients').update({ prenom, nom, telephone }).eq('id', id)
      }
    }
    if (!id) return null
    setClientId(id)
    localStorage.setItem('yoppaa_client_id', id)
    localStorage.setItem('yoppaa_email', email)
    localStorage.setItem('yoppaa_prenom', prenom)
    localStorage.setItem('yoppaa_nom', nom)
    if (telephone) localStorage.setItem('yoppaa_telephone', telephone)
    return id
  }

  async function passerCommande() {
    if (!creneauChoisi || !client.prenom || !client.nom || !client.email || !client.telephone || !rgpdCommande || !commercant) return
    setLoadingCommande(true)
    setErreurCommande(null)
    try {
      // Persistance client (localStorage + clients DB) — utile pour favoris/historique
      await getOuCreerClient(client.email, client.prenom, client.nom)

      const jourDate = joursDispos[jourSelectionne]?.date || new Date()
      const d = new Date(jourDate)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

      // Payload articles avec options structurées (groupe_id + valeur_ids)
      // La route recalcule tout server-side (anti-tampering)
      const articlesPayload = Object.values(panier).map(i => ({
        id: i.id,
        quantite: i.quantite,
        options: i.options
          ? Object.entries(i.options).map(([groupe_id, valeurs]) => ({
              groupe_id,
              valeur_ids: valeurs.map(v => v.id),
            }))
          : [],
      }))

      const res = await fetch('/api/stripe/checkout/create-commande', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commercant_id: commercant.id,
          creneau_id: creneauChoisi,
          date_commande: dateStr,
          articles: articlesPayload,
          client_email: client.email,
          client_prenom: client.prenom,
          client_nom: client.nom,
          client_telephone: client.telephone,
          rgpd_marketing: rgpdMarketing,
        }),
      })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        // Stock épuisé entre-temps (409) : populate la modal d'ajustement existante
        if (res.status === 409 && data.article_id) {
          const item = panier[data.article_id]
          setAjustementStock({
            articleId: data.article_id,
            nom: item?.nom || 'cet article',
            stockDisponible: data.stock_disponible || 0,
          })
        }
        setErreurCommande(data?.error || 'Erreur lors de la création de la commande.')
        setLoadingCommande(false)
        return
      }

      // NB : on ne clear PAS le panier ici. Si Stripe redirige vers cancel_url,
      // le user retrouve son panier (hydraté depuis localStorage) pour réessayer.
      // Le clear se fait uniquement au retour ?paiement=ok (useEffect dédié).
      //
      // window.top.location : sur PC desktop la PWA tourne dans un iframe MobileFrame.
      // window.location.href = url redirigerait l'iframe vers Stripe Checkout, mais
      // Stripe refuse l'iframe (X-Frame-Options) → écran blanc. On force la nav
      // dans la fenêtre parent. Sur mobile window.top === window donc identique.
      ;(window.top || window).location.href = data.url
    } catch (e) {
      // Garde-fou anti-freeze : sans ce catch, toute exception (network, RLS)
      // laissait le bouton bloqué sur "En cours..." sans signal.
      console.error('[passerCommande] erreur', e)
      setErreurCommande(`Erreur : ${e?.message || 'inconnue'}. Réessaie ou contacte-nous.`)
      setLoadingCommande(false)
    }
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

  // Plans YOPPAA : single source of truth via lib/plans.js
  // peutCommander = BOOST/MAX uniquement (active panier + creneaux)
  // Bloque aussi catégorie vitrine (coiffeur/opticien : pas de C&C, module RDV natif Yoppaa à la place)
  const vitrine = isVitrine(commercant)
  const peutCommander = !vitrine && canDo(commercant?.plan, 'commande')
  // Module RDV natif : si vitrine FULL avec rdv_actif=true, on propose le bouton "Prendre RDV"
  const peutPrendreRdv = vitrine && canDo(commercant?.plan, 'rdv') && commercant?.rdv_actif === true

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; width: 100%; overflow: hidden; }
        body { background: ${T.bg}; font-family: "DM Sans", sans-serif; font-size: 16px; -webkit-text-size-adjust: 100%; }
        .page-wrap { display: flex; flex-direction: column; height: 100dvh; max-width: 760px; margin: 0 auto; background: ${T.bg}; overflow: hidden; width: 100%; position: relative; }
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
        /* Hero plus généreux : 240px mobile, 300px tablette+ */
        .fiche-hero { height: 240px; }
        @media (min-width: 600px) { .fiche-hero { height: 300px; } }
        @media (min-width: 900px) { .fiche-hero { height: 340px; } }
        @media (min-width: 800px) {
          .articles-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; align-items: start; }
          .articles-grid > .art-card { margin-bottom: 0 !important; }
        }
        .action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 0.4rem 0.75rem; border-radius: 100px; border: 1px solid ${T.pale}; background: #fff; color: ${T.ink}; font-weight: 700; font-size: 0.74rem; cursor: pointer; transition: all 0.15s; line-height: 1.1; }
        .action-btn:hover { border-color: ${T.main}; color: ${T.main}; background: ${T.pale}; }
        @keyframes pulse { from { opacity:0.4; transform:scale(0.8); } to { opacity:1; transform:scale(1.2); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { from { background-position: -200% center; } to { background-position: 200% center; } }
        @keyframes swipePulse { from { transform:scale(0.7) translateY(0); opacity:0.5; } to { transform:scale(1.4) translateY(-4px); opacity:1; } }
        @keyframes swipeArrow { 0%,100% { opacity:0.4; transform:translateX(0); } 50% { opacity:1; transform:translateX(4px); } }
        @keyframes dealGlow {
          0%, 100% { box-shadow: 0 4px 16px rgba(22,6,54,0.2),  0 0 0 0  rgba(196,160,244,0); }
          50%      { box-shadow: 0 6px 28px rgba(22,6,54,0.35), 0 0 0 10px rgba(196,160,244,0.45); }
        }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* Modale détail deal — titre + description complète + dates + prix */}
      {dealDetailOuvert && (
        <div onClick={() => setDealDetailOuvert(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeUp 0.2s ease' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 22, maxWidth: 440, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            {/* En-tête violet foncé */}
            <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, padding: '20px 22px 24px', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.2px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 100, border: '1px solid rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Flame size={11} strokeWidth={2}/> Deal du jour</span>
                <button onClick={() => setDealDetailOuvert(null)} aria-label="Fermer"
                  style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 30, height: 30, color: '#fff', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <h2 style={{ fontWeight: 900, fontSize: '1.35rem', color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, margin: 0 }}>
                {dealDetailOuvert.titre}
              </h2>
              {dealDetailOuvert.prix_deal && (
                <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, marginTop: 12, background: 'rgba(255,255,255,0.1)', padding: '8px 14px', borderRadius: 12 }}>
                  <span style={{ fontWeight: 900, fontSize: '1.6rem', color: T.light, letterSpacing: '-0.5px' }}>{Number(dealDetailOuvert.prix_deal).toFixed(2)}€</span>
                  {dealDetailOuvert.prix_original && (
                    <span style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.5)', textDecoration: 'line-through' }}>{Number(dealDetailOuvert.prix_original).toFixed(2)}€</span>
                  )}
                </div>
              )}
            </div>
            {/* Corps blanc */}
            <div style={{ padding: '18px 22px 22px' }}>
              {dealDetailOuvert.description && (
                <p style={{ fontSize: '0.9rem', color: T.ink, lineHeight: 1.55, margin: '0 0 14px' }}>{dealDetailOuvert.description}</p>
              )}
              {dealDetailOuvert.date_deal && (
                <p style={{ fontSize: '0.78rem', color: T.muted, fontWeight: 600, margin: '0 0 6px' }}>
                  <Calendar size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Valable le {new Date(dealDetailOuvert.date_deal + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              )}
              {dealDetailOuvert.article_id && (
                <p style={{ fontSize: '0.78rem', color: T.main, fontWeight: 700, margin: '0 0 6px' }}>
                  ✓ Appliqué automatiquement à l&rsquo;article concerné dans le menu
                </p>
              )}
              {/* Bouton "Appeler pour réserver" : uniquement si le commerçant
                  l'a active sur ce deal (cta_appeler_reserver) ET telephone OK */}
              {dealDetailOuvert.cta_appeler_reserver && commercant.telephone ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  <a href={`tel:${commercant.telephone}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.95rem', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 6px 20px ${T.main}55`, textDecoration: 'none' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.2 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.11 6.11l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                    </svg>
                    Appeler pour réserver
                  </a>
                  <button onClick={() => setDealDetailOuvert(null)}
                    style={{ width: '100%', padding: '0.7rem', border: `1.5px solid ${T.pale}`, borderRadius: 100, background: '#fff', color: T.muted, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    Fermer
                  </button>
                </div>
              ) : (
                <button onClick={() => setDealDetailOuvert(null)}
                  style={{ width: '100%', marginTop: 14, padding: '0.875rem', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 16px ${T.main}55` }}>
                  Compris
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale : confirmation de changement de jour avec panier non vide */}
      {confirmationJour && joursDispos[confirmationJour.nouveauIdx] && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.65)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeUp 0.2s ease' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '1.5rem 1.25rem', maxWidth: 380, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '2rem', textAlign: 'center', marginBottom: 12 }}>🗓️</div>
            <p style={{ fontWeight: 900, fontSize: '1.1rem', color: T.ink, textAlign: 'center', marginBottom: 8, letterSpacing: '-0.3px' }}>Changer de jour ?</p>
            <p style={{ fontSize: '0.875rem', color: T.muted, textAlign: 'center', lineHeight: 1.5, marginBottom: 18 }}>
              Tu vas passer à <strong style={{ color: T.deep }}>{joursDispos[confirmationJour.nouveauIdx].label}</strong>. Le stock dépend du jour : ton panier actuel sera vidé.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmationJour(null)}
                style={{ flex: 1, padding: '0.875rem', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                Annuler
              </button>
              <button onClick={confirmerChangementJour}
                style={{ flex: 1, padding: '0.875rem', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 16px ${T.main}55` }}>
                Vider et changer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-wrap">

        {/* ── TOPBAR ── */}
        <div style={{ background: T.bgPanel, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderBottom: `1px solid ${T.main}33`, position: 'relative' }}>
          {/* Bande 3px canonique YOPPAA (Ink → Main → Light) */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
          <button onClick={() => router.push('/commander')}
            aria-label="Retour"
            style={{ background: `rgba(255,255,255,0.1)`, border: `1px solid rgba(255,255,255,0.15)`, color: '#fff', cursor: 'pointer', borderRadius: 10, padding: '0.45rem 0.7rem 0.45rem 0.6rem', fontWeight: 700, fontSize: '0.82rem', flexShrink: 0, backdropFilter: 'blur(8px)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Retour
          </button>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            {commercant && (
              <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#fff', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', opacity: 0.9 }}>
                {commercant.nom}
              </span>
            )}
          </div>

          {etape < 4 && peutCommander && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {[{ n: 1, label: 'Menu' }, { n: 2, label: 'Créneau' }].map((s, i) => {
                const done = etape > s.n + 1
                const active = etape === s.n + 1
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: active ? T.main : done ? '#10B98122' : 'rgba(255,255,255,0.08)', border: `1.5px solid ${active ? T.light : done ? '#10B981' : 'rgba(255,255,255,0.15)'}`, borderRadius: 100, padding: '3px 10px', transition: 'all 0.3s', boxShadow: active ? `0 4px 12px ${T.main}44` : 'none' }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: active ? '#fff' : done ? '#10B981' : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 900, color: active ? T.main : '#fff', flexShrink: 0 }}>
                        {done ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg> : s.n}
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: active ? '#fff' : done ? '#10B981' : 'rgba(255,255,255,0.5)' }}>{s.label}</span>
                    </div>
                    {i === 0 && <div style={{ width: 12, height: 1.5, background: etape >= 3 ? '#10B981' : 'rgba(255,255,255,0.15)' }}/>}
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
          {/* Fiche non publiée (brouillon, en_attente_validation, refusée) → bloc d'info */}
          {!loading && commercant?._nonPublie && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
              <div style={{ maxWidth: 420, textAlign: 'center', background: '#fff', borderRadius: 18, padding: '32px 28px', border: `1px solid ${T.pale}`, boxShadow: '0 4px 20px rgba(22,6,54,0.08)' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛠️</div>
                <h2 style={{ fontWeight: 900, fontSize: '1.3rem', color: T.ink, letterSpacing: '-0.5px', margin: '0 0 8px' }}>
                  Bientôt en ligne
                </h2>
                <p style={{ fontSize: '0.95rem', color: T.muted, lineHeight: 1.55, margin: '0 0 18px' }}>
                  <strong style={{ color: T.bgPanel }}>{commercant.nom}</strong> finalise son inscription Yoppaa. Cette page sera disponible dès validation par notre équipe.
                </p>
                <button onClick={() => router.push('/commander')}
                  style={{ padding: '10px 22px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                  Voir les autres commerces →
                </button>
              </div>
            </div>
          )}

          {!loading && !commercant?._nonPublie && etape === 2 && commercant && (
            <>
              <div ref={headerRef}>

                <div className="fiche-hero" style={{ position: 'relative', overflow: 'hidden' }}>
                  {/* Bande 3px canonique YOPPAA en haut du hero (Ink → Main → Light) */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 3 }}/>
                  <HeroCarousel
                    couverture={photoCouverture}
                    galerie={galerie}
                    nomCommerce={commercant.nom}
                  />
                  {/* Voile dégradé bas pour finition visuelle */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, background: 'linear-gradient(to top, rgba(22,6,54,0.5), transparent)' }}/>

                  {/* Boutons overlay haut-droit : Partager + Favoris (pattern TGTG)
                      Partage = viralité organique (crucial scalabilité).
                      Favoris = engagement / retention du yopper. */}
                  <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 5, display: 'flex', gap: 8 }}>
                    <button onClick={partagerFiche} aria-label="Partager la fiche"
                      style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
                        border: 'none', cursor: 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
                        fontFamily: 'inherit',
                      }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.deep} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>
                        <polyline points="16 6 12 2 8 6"/>
                        <line x1="12" y1="2" x2="12" y2="15"/>
                      </svg>
                    </button>
                    <button onClick={toggleFavori} disabled={favoriLoading}
                      aria-label={estFavori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                      style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
                        border: 'none', cursor: favoriLoading ? 'wait' : 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
                        fontFamily: 'inherit',
                        transition: 'transform 0.15s',
                      }}>
                      <svg width="19" height="19" viewBox="0 0 24 24"
                        fill={estFavori ? '#DC2626' : 'none'}
                        stroke={estFavori ? '#DC2626' : T.deep}
                        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Card flottante : logo + type + nom + statut + actions
                    Chevauche le hero photo (marginTop -36) — donc placée JUSTE
                    après le hero pour ne pas recouvrir les bandeaux actus/deal */}
                <div style={{ background: '#fff', margin: '-36px 12px 0', borderRadius: 22, padding: '1.125rem 1.25rem 1rem', boxShadow: `0 12px 36px rgba(22,6,54,0.18), 0 2px 8px ${T.main}22`, border: `1px solid ${T.pale}`, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, background: commercant.logo_url ? '#fff' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, border: '3px solid #fff', boxShadow: `0 6px 20px rgba(22,6,54,0.22)`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: -28 }}>
                      {commercant.logo_url
                        ? <img src={commercant.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                        : <Store size={32} strokeWidth={1.6} color={T.muted}/>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {commercant.type && (
                        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: T.main, background: T.pale, padding: '3px 9px', borderRadius: 100, display: 'inline-block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {commercant.type}
                        </span>
                      )}
                      <h1 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.ink, letterSpacing: '-0.5px', lineHeight: 1.1, margin: 0 }}>
                        {commercant.nom}
                      </h1>
                    </div>
                  </div>

                  {/* Pills statut : visualisation des features dispo selon plan */}
                  <div style={{ marginTop: 12 }}>
                    <PillsStatut commercant={commercant} dealActif={!!dealActif} actuActive={actualites.length > 0} size="lg"/>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Etoiles note={notesInfo.moyenne} taille={13}/>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: T.ink }}>
                        {notesInfo.moyenne > 0 ? notesInfo.moyenne.toFixed(1) : '—'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: T.muted }}>
                        {notesInfo.count > 0 ? `· ${notesInfo.count} avis` : '· Pas encore d\'avis'}
                      </span>
                    </div>
                    {commercant.horaires_detail && (() => {
                      const j = jourActuel()
                      const h = commercant.horaires_detail[j]
                      if (!h) return null
                      return (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: h.ouvert ? '#F0FDF4' : '#FEF2F2', borderRadius: 100, padding: '3px 9px', border: `1px solid ${h.ouvert ? '#10B98133' : '#DC262633'}` }}>
                          <span style={{ width: h.ouvert ? 9 : 7, height: h.ouvert ? 9 : 7, borderRadius: '50%', background: h.ouvert ? '#10B981' : '#DC2626', flexShrink: 0 }}/>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: h.ouvert ? '#10B981' : '#DC2626' }}>
                            {h.ouvert ? `Ouvert · ${h.debut.slice(0,5)}–${h.fin.slice(0,5)}` : 'Fermé'}
                          </span>
                        </div>
                      )
                    })()}
                  </div>

                  {commercant.description && (
                    <p style={{ fontSize: '0.85rem', color: T.deep, lineHeight: 1.55, margin: '12px 0 0' }}>{commercant.description}</p>
                  )}

                  <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center', flexWrap: 'nowrap' }}>
                    {commercant.adresse && (
                      <button className="action-btn" onClick={ouvrirMaps}
                        style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}
                        aria-label={`Ouvrir ${commercant.adresse} dans Maps`}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{commercant.adresse}</span>
                      </button>
                    )}
                    {commercant.telephone && (
                      <button className="action-btn" onClick={appeler} aria-label="Appeler"
                        style={{ flexShrink: 0, background: '#F0FDF4', borderColor: '#10B98133', color: '#10B981' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        <span>Appeler</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Galerie photos (si présentes) — carrousel horizontal */}
                {galerie.length > 0 && (
                  <div style={{ marginTop: 18, paddingLeft: 12 }}>
                    <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, paddingRight: 12 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="5" width="18" height="14" rx="2"/>
                        <circle cx="12" cy="12" r="3.5"/>
                        <path d="M8 5l1.5-2h5L16 5"/>
                      </svg>
                      La maison en images
                    </p>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, paddingRight: 12, scrollbarWidth: 'none' }}>
                      {galerie.map(p => (
                        <div key={p.id} style={{ flexShrink: 0, width: 200, height: 140, borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 16px rgba(22,6,54,0.12)', border: `1px solid ${T.pale}` }}>
                          <img src={p.url} alt={p.legende || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ height: 12, background: T.bg }}/>

                {/* Bandeau alertes/actualités (alertes en rouge, prioritaires) */}
                {canDo(commercant.plan, 'actus_illimitees') && actualites.length > 0 && (
                  <div style={{ margin: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {actualites.map(a => {
                      const isAlerte = a.type === 'alerte'
                      return (
                        <div key={a.id} style={{ background: isAlerte ? 'linear-gradient(135deg, #7F1D1D, #B91C1C)' : `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, boxShadow: isAlerte ? '0 4px 16px rgba(220,38,38,0.25)' : '0 4px 16px rgba(22,6,54,0.15)' }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: isAlerte ? '#FCA5A5' : T.light, textTransform: 'uppercase', letterSpacing: '0.7px', flexShrink: 0, background: 'rgba(255,255,255,0.1)', padding: '3px 9px', borderRadius: 100, border: `1px solid ${isAlerte ? 'rgba(252,165,165,0.4)' : 'rgba(196,160,244,0.4)'}` }}>
                            {isAlerte ? 'Alerte' : 'Actualité'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.3 }}>{a.titre}</p>
                            {a.contenu && <p style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.85)', margin: '2px 0 0', lineHeight: 1.4 }}>{a.contenu}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Bandeau deal du jour — cliquable pour ouvrir le détail */}
                {canDo(commercant.plan, 'deals') && dealActif && (
                  <div style={{ margin: '0 12px 12px' }}>
                    <button onClick={() => setDealDetailOuvert(dealActif)}
                      style={{ width: '100%', background: `linear-gradient(135deg, ${T.ink}, ${T.deep})`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, animation: 'dealGlow 1.8s ease-in-out infinite', border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'left' }}>
                      <Flame size={20} strokeWidth={2} color={T.light} style={{ flexShrink: 0 }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.65rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Deal du jour</p>
                        <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', marginTop: 2, lineHeight: 1.3 }}>{dealActif.titre}</p>
                      </div>
                      {dealActif.prix_deal && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {dealActif.prix_original && <p style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.55)', textDecoration: 'line-through' }}>{Number(dealActif.prix_original).toFixed(2)}€</p>}
                          <p style={{ fontSize: '1.05rem', fontWeight: 900, color: T.light, letterSpacing: '-0.3px' }}>{Number(dealActif.prix_deal).toFixed(2)}€</p>
                        </div>
                      )}
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', flexShrink: 0, marginLeft: 4 }}>›</span>
                    </button>
                  </div>
                )}

                {/* Bouton Prendre RDV — module natif Yoppaa pour vitrine FULL avec rdv_actif */}
                {peutPrendreRdv && (
                  <div style={{ margin: '0 12px 12px' }}>
                    <a href={`/commander/rdv/${commercant.slug}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 18px', borderRadius: 14, background: `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none', boxShadow: `0 6px 22px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <rect x="3" y="5" width="18" height="16" rx="2"/>
                          <path d="M3 9h18M8 3v4M16 3v4"/>
                        </svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Prendre rendez-vous</span>
                      </span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                      </svg>
                    </a>
                  </div>
                )}

                {commercant.horaires_detail && <HorairesSection horaires={commercant.horaires_detail}/>}

                {/* Mention discrete + signal Yopper si le plan/feature n'est pas active */}
                {!peutCommander && !vitrine && (
                  <div style={{ background: T.pale, borderTop: `1px solid ${T.main}22`, borderBottom: `1px solid ${T.main}22`, padding: '10px 16px', fontSize: 12, color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>
                    Envie de commander à l&rsquo;avance&nbsp;? Demandez à <strong style={{ color: T.bgPanel, fontWeight: 800 }}>{commercant.nom}</strong> d&rsquo;activer Yoppaa Click &amp; Collect.
                  </div>
                )}
                {vitrine && !peutPrendreRdv && (
                  <div style={{ background: T.pale, borderTop: `1px solid ${T.main}22`, borderBottom: `1px solid ${T.main}22`, padding: '10px 16px', fontSize: 12, color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>
                    Passe directement à la boutique ou appelle <strong style={{ color: T.bgPanel, fontWeight: 800 }}>{commercant.nom}</strong> pour plus d&rsquo;infos. Tu peux aussi signaler que tu aimerais prendre RDV en ligne.
                  </div>
                )}
              </div>

              {/* Sélecteur de jour de retrait — pilote les stocks affichés et les créneaux dispo */}
              {peutCommander && joursDispos.length > 0 && (
                <div style={{ background: '#fff', borderBottom: `1px solid ${T.pale}`, padding: '0.625rem 1rem 0.5rem' }}>
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="16" rx="2"/>
                      <path d="M3 9h18M8 3v4M16 3v4"/>
                    </svg>
                    Je récupère le
                  </p>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                    {joursDispos.map((jour, idx) => {
                      const actif = jourSelectionne === idx
                      const dateStr = jour.date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
                      return (
                        <button key={idx} onClick={() => changerJour(idx)}
                          style={{ flexShrink: 0, padding: '0.4rem 0.875rem', borderRadius: 12, border: `1.5px solid ${actif ? T.main : T.pale}`, background: actif ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: actif ? '#fff' : T.muted, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'center', lineHeight: 1.3, boxShadow: actif ? `0 4px 14px ${T.main}33` : 'none', transition: 'all 0.15s' }}>
                          <div style={{ fontWeight: 800 }}>{jour.label}</div>
                          <div style={{ fontSize: '0.65rem', opacity: actif ? 0.85 : 0.6, marginTop: 1 }}>{dateStr}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

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
                      <div className="articles-grid">
                        {artsDecat.map(a => (
                          <ArticleRow key={a.id} article={a} panier={panier} optionsParArticle={optionsParArticle}
                            ajouterAuPanier={ajouterAuPanier} retirerDuPanier={retirerDuPanier} qteTotaleArticle={qteTotaleArticle}
                            stocksJour={stocksJour} jourSelectionne={jourSelectionne} joursDispos={joursDispos}
                            onCommanderDemain={commanderPourJour}
                            getStockMax={getStockMax} commandesParArticleJour={commandesParArticleJour} modeVitrine={!peutCommander} masquerPrix={!canDo(commercant?.plan, 'prix_affiches')} dealArticle={dealsParArticle[a.id] || null} onClickDeal={d => setDealDetailOuvert(d)}/>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {sansCat.length > 0 && (
                  <div ref={el => catRefs.current['__autres__'] = el} style={{ marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 10 }}>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink }}>Autres</span>
                    </div>
                    <div className="articles-grid">
                      {sansCat.map(a => (
                        <ArticleRow key={a.id} article={a} panier={panier} optionsParArticle={optionsParArticle}
                          ajouterAuPanier={ajouterAuPanier} retirerDuPanier={retirerDuPanier} qteTotaleArticle={qteTotaleArticle}
                          stocksJour={stocksJour} jourSelectionne={jourSelectionne} joursDispos={joursDispos}
                          onCommanderDemain={commanderPourJour}
                          getStockMax={getStockMax} commandesParArticleJour={commandesParArticleJour} modeVitrine={!peutCommander} masquerPrix={!canDo(commercant?.plan, 'prix_affiches')} dealArticle={dealsParArticle[a.id] || null} onClickDeal={d => setDealDetailOuvert(d)}/>
                      ))}
                    </div>
                  </div>
                )}

                {avisCommerce.length > 0 && (
                  <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${T.pale}` }}>
                    <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.deep, marginBottom: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.deep} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
                      </svg>
                      Avis clients
                    </h3>
                    {avisCommerce.map(a => <CarteAvis key={a.id} a={a}/>)}
                  </div>
                )}

                {/* RecapPanier : uniquement si plan permet la commande (BOOST/MAX) */}
                {peutCommander && (
                  <RecapPanier
                    panier={panier}
                    onRetirer={retirerDuPanier}
                    onAjouter={incrementerPanier}
                    total={totalPanier()}
                    onValider={() => setEtape(3)}
                    getStockMax={getStockMax}
                  />
                )}

                {/* CTAs contextuels selon le plan — sections grisées du commerce.
                    Pour la catégorie vitrine, on masque le CTA "commande" (pas pertinent
                    pour coiffeur/opticien) et on garde uniquement le CTA "prix" si plan ON. */}
                {!peutCommander && (
                  <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {!canDo(commercant.plan, 'prix') && (
                      <CTAUpgrade type="prix" commercant={commercant} variant="banner"/>
                    )}
                    {!vitrine && (
                      <CTAUpgrade type="commande" commercant={commercant} variant="banner"/>
                    )}
                  </div>
                )}
                {/* CTA livraison pour BOOST (n'a pas la livraison) — affichage discret en banner */}
                {peutCommander && !canDo(commercant.plan, 'livraison') && (
                  <div style={{ marginTop: 24 }}>
                    <CTAUpgrade type="livraison" commercant={commercant} variant="banner"/>
                  </div>
                )}

                {/* Lien discret de signalement en bas de fiche */}
                <div style={{ marginTop: 28, padding: '0 0 12px', textAlign: 'center' }}>
                  {signalementSent ? (
                    <p style={{ fontSize: 12, color: '#10B981', fontWeight: 700, margin: 0 }}>
                      ✓ Merci, signalement enregistré
                    </p>
                  ) : (
                    <button onClick={() => setShowSignalement(true)}
                      style={{ background: 'none', border: 'none', color: T.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textDecoration: 'underline', textDecorationColor: T.pale, textUnderlineOffset: 3 }}>
                      Signaler un problème sur cette fiche
                    </button>
                  )}
                </div>

                <div style={{ height: 24 }}/>
              </div>
            </>
          )}

          {/* ÉTAPE 3 — Créneau + coordonnées : pattern hero canonique */}
          {!loading && etape === 3 && commercant && (
            <div>
              <div style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.main} 100%)`, padding: '0.875rem 1rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
                {/* Bande 3px canonique YOPPAA */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 2 }}/>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.mid}44 0%, transparent 55%), radial-gradient(circle at 10% 90%, ${T.light}14 0%, transparent 50%)`, pointerEvents: 'none' }}/>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[
                      { c: '#fff',  o: 0.5, delay: '0s',   size: 5 },
                      { c: T.light, o: 1,   delay: '0.3s', size: 6 },
                      { c: T.mid,   o: 1,   delay: '0.6s', size: 5 },
                    ].map((d, i) => (
                      <div key={i} style={{ width: d.size, height: d.size, borderRadius: '50%', background: d.c, opacity: d.o, boxShadow: `0 0 8px ${d.c}aa`, animation: `dot-pulse 2s ease-in-out ${d.delay} infinite` }}/>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', margin: 0, opacity: 0.85 }}>Étape 2 · {commercant.nom}</p>
                </div>
                <h2 style={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-0.6px', margin: 0, lineHeight: 1.1, position: 'relative' }}>
                  <span style={{ color: '#fff' }}>Choisis ton </span>
                  <span style={{ color: T.light }}>créneau</span>
                </h2>
              </div>

              <div style={{ padding: '0 1rem 1rem', marginTop: -1 }}>
                <div style={{ background: '#fff', borderRadius: 16, padding: '1rem 1.125rem', marginBottom: '1.25rem', border: `1.5px solid ${T.pale}`, boxShadow: `0 4px 20px ${T.main}14`, marginTop: '-1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3h2l2.4 11.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L22 7H6"/>
                        <circle cx="9" cy="20" r="1.5"/>
                        <circle cx="18" cy="20" r="1.5"/>
                      </svg>
                      Ta commande
                    </span>
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

                {/* Jour verrouille — choisi a l'etape 2 (menu) */}
                {joursDispos[jourSelectionne] && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: '1rem', background: T.pale, border: `1.5px solid ${T.main}33`, borderRadius: 14, padding: '0.625rem 0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1.5px solid ${T.main}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="5" width="18" height="16" rx="2"/>
                          <path d="M3 9h18M8 3v4M16 3v4"/>
                        </svg>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Retrait</p>
                        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: T.deep, letterSpacing: '-0.3px', margin: 0 }}>
                          {joursDispos[jourSelectionne].label} <span style={{ color: T.muted, fontWeight: 600, fontSize: '0.82rem' }}>· {joursDispos[jourSelectionne].date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}</span>
                        </p>
                      </div>
                    </div>
                    <button onClick={() => { setEtape(2); setCreneauChoisi(null); setErreurCommande(null); setAjustementStock(null); setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 100) }}
                      style={{ background: '#fff', border: `1.5px solid ${T.main}`, color: T.main, fontWeight: 700, fontSize: '0.72rem', padding: '0.4rem 0.875rem', borderRadius: 100, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
                      Changer
                    </button>
                  </div>
                )}

                {/* Section header creneaux */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 6v6l4 2"/>
                    </svg>
                    Horaires de retrait
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
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
                    return (
                      <div key={c.id} onClick={() => { if (!complet) { setCreneauChoisi(c.id); setErreurCommande(null); setAjustementStock(null) } }}
                        style={{
                          position: 'relative',
                          padding: '0.75rem 0.5rem',
                          borderRadius: 14,
                          border: `2px solid ${complet ? '#E5E7EB' : choisi ? T.main : T.pale}`,
                          background: complet ? '#F9FAFB' : choisi ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff',
                          cursor: complet ? 'default' : 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s',
                          boxShadow: choisi ? `0 8px 22px ${T.main}55` : 'none',
                          overflow: 'hidden',
                        }}
                        onMouseOver={e => { if (!complet && !choisi) { e.currentTarget.style.borderColor = T.main + '88'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
                        onMouseOut={e => { if (!complet && !choisi) { e.currentTarget.style.borderColor = T.pale; e.currentTarget.style.transform = 'translateY(0)' } }}>
                        {/* Check overlay coin haut droit quand choisi */}
                        {choisi && (
                          <span style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                          </span>
                        )}
                        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: complet ? '#D1D5DB' : choisi ? '#fff' : T.ink, textDecoration: complet ? 'line-through' : 'none', letterSpacing: '-0.3px', margin: 0, lineHeight: 1.1 }}>
                          {c.heure_debut.slice(0,5)} – {c.heure_fin.slice(0,5)}
                        </p>
                        {/* Mention etat : SVG + texte, harmonise */}
                        {complet && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 800, color: '#DC2626', marginTop: 5 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M15 9l-6 6M9 9l6 6"/>
                            </svg>
                            Complet
                          </span>
                        )}
                        {bientot && !complet && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 800, color: choisi ? '#fff' : '#EA580C', marginTop: 5 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill={choisi ? '#FB923C' : '#FB923C'} stroke={choisi ? '#FB923C' : '#FB923C'} strokeWidth="0.5"><path d="M12 2c1 3 3 4 3 7 0 1.5-1 3-3 3s-3-1.5-3-3c0-2 2-3 3-7zm-5 9c-1 0-3 2-3 6 0 4 3 5 8 5s8-1 8-5c0-4-2-6-3-6 0 3-2 5-5 5s-5-2-5-5z"/></svg>
                            Dernière place
                          </span>
                        )}
                        {presque && !complet && !bientot && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 800, color: choisi ? '#fff' : '#D97706', marginTop: 5 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill={choisi ? '#FBBF24' : '#FBBF24'} stroke={choisi ? '#FBBF24' : '#FBBF24'} strokeWidth="0.5"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
                            Presque complet
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {(joursDispos[jourSelectionne]?.creneaux || []).length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '1.5rem', color: T.muted, fontSize: '0.875rem', fontWeight: 600 }}>
                      Aucun créneau disponible ce jour.
                    </div>
                  )}
                </div>

                {/* Encart invite : rassure (pas besoin de compte) + raccourci Yopper existant.
                    Wording cohérent avec /commander/rdv/[slug] étape 3. */}
                {!(client.email && clientId) && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: T.pale, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: 14, border: `1px solid ${T.main}22` }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    <p style={{ fontSize: '0.78rem', color: T.deep, lineHeight: 1.5, flex: 1, margin: 0 }}>
                      <strong style={{ color: T.ink }}>Pas besoin de compte</strong> pour commander — remplis juste tes coordonnées ci-dessous.<br/>
                      Déjà Yopper ?{' '}
                      <a href={`/commander/auth?redirect=/commander/${slug}`} style={{ color: T.main, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        Connecte-toi pour pré-remplir →
                      </a>
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    Tes coordonnées
                  </span>
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
                    <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      Confidentialité
                    </p>
                  </div>
                  {[
                    { key: 'rgpdCommande', val: rgpdCommande, set: setRgpdCommande, label: 'Traitement de ma commande', badge: 'Obligatoire', badgeColor: '#DC2626', badgeBg: '#FEE2E2', desc: `J'accepte que mes coordonnées soient transmises à ${commercant.nom} pour le traitement de ma commande.` },
                    { key: 'rgpdMarketing', val: rgpdMarketing, set: setRgpdMarketing, label: 'Offres et actualités', badge: 'Optionnel', badgeColor: T.main, badgeBg: T.pale, desc: `J'accepte que ${commercant.nom} utilise mes coordonnées pour m'envoyer des offres.` },
                  ].map((item, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.875rem 1rem', cursor: 'pointer', borderBottom: i === 0 ? `1px solid ${T.pale}` : 'none', background: item.val ? '#F0FDF4' : '#fff' }}>
                      <div onClick={() => item.set(v => !v)}
                        style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${item.val ? '#10B981' : '#D1D5DB'}`, background: item.val ? '#10B981' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s' }}>
                        {item.val && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                        )}
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

                {/* Message erreur stock — uniquement si stock change entre-temps */}
                {erreurCommande && (
                  <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '0.875rem 1rem', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <path d="M12 9v4M12 17h.01"/>
                      </svg>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.5 }}>{erreurCommande}</p>
                      </div>
                      <button onClick={() => { setErreurCommande(null); setAjustementStock(null) }}
                        aria-label="Fermer"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', flexShrink: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                    {ajustementStock && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        {ajustementStock.stockDisponible > 0 && (
                          <button onClick={() => {
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
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.5rem 1rem', borderRadius: 100, border: 'none', background: T.main, color: '#fff', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                            Réduire à {ajustementStock.stockDisponible}
                          </button>
                        )}
                        <button onClick={() => { setEtape(2); setErreurCommande(null); setAjustementStock(null) }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.5rem 1rem', borderRadius: 100, border: `1.5px solid ${T.main}`, background: '#fff', color: T.main, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                          Modifier mon panier
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button onClick={passerCommande} disabled={loadingCommande || !formValide}
                  style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !formValide ? 0.45 : 1, cursor: !formValide ? 'default' : 'pointer' }}>
                  {loadingCommande ? 'Redirection…' : (
                    <>
                      Payer &amp; confirmer — {totalPanier().toFixed(2)}€
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                    </>
                  )}
                </button>
                {!rgpdCommande && (
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#DC2626', textAlign: 'center', marginTop: 6, fontWeight: 600, justifyContent: 'center', width: '100%' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <path d="M12 9v4M12 17h.01"/>
                    </svg>
                    Accepte le traitement de ta commande pour continuer
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ÉTAPE 4 — Confirmation */}
          {!loading && etape === 4 && commercant && (
            <div style={{ padding: '1.5rem 1rem', animation: 'fadeUp 0.4s ease' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                {/* Cercle vert pulsant + check SVG : signal succes plus pro qu'un emoji */}
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #10B981, #6EE7B7)', marginBottom: '0.875rem', boxShadow: '0 8px 28px rgba(16,185,129,0.45), 0 0 0 6px #10B98122' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7"/>
                  </svg>
                </div>
                {/* Wordmark tricolore canonique fond clair : Yo Ink, pp Main, aa Mid */}
                <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1rem', marginBottom: 4, letterSpacing: '-0.05em', lineHeight: 1 }}>
                  <span style={{ color: T.ink }}>yo</span>
                  <span style={{ color: T.main }}>pp</span>
                  <span style={{ color: T.mid }}>aa</span>
                </p>
                {derniereCommande?.numeroSequentiel && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '6px 20px', marginBottom: 12, boxShadow: `0 4px 16px ${T.main}44` }}>
                    <span style={{ fontWeight: 900, fontSize: '1.4rem', color: '#fff', letterSpacing: '-0.5px' }}>#{derniereCommande.numeroSequentiel}</span>
                  </div>
                )}
                <h2 style={{ fontWeight: 900, fontSize: '1.7rem', color: T.ink, marginBottom: '0.5rem', letterSpacing: '-0.75px' }}>Yoppé ! 🟣</h2>
                <p style={{ color: T.deep, fontWeight: 700, marginBottom: '0.25rem' }}>Chez {commercant.nom}</p>
                <p style={{ color: T.muted, fontSize: '0.875rem' }}>On te prévient quand c&apos;est prêt à retirer.</p>
              </div>

              <div style={{ background: `linear-gradient(135deg, ${T.pale}, #fff)`, borderRadius: 20, overflow: 'hidden', marginBottom: '1rem', border: `1.5px solid ${T.main}22` }}>
                <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                <div style={{ padding: '1.25rem' }}>
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: T.ink, marginBottom: 12, fontSize: '1rem' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 8v4l3 3"/>
                    </svg>
                    Et après ?
                  </p>
                  {/* 3 etapes concretes — plus parlant pour un newcomer que "confirme depuis l'onglet Commandes" */}
                  <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { n: 1, t: <>On te notifie quand ta commande est <strong>prête à retirer</strong>.</> },
                      { n: 2, t: <>Tu te rends chez <strong>{commercant.nom}</strong> à ton créneau.</> },
                      { n: 3, t: <>Tu <strong>glisses pour confirmer</strong> ta récupération sur l&apos;onglet Commandes.</> },
                    ].map(s => (
                      <li key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.85rem', color: T.deep, lineHeight: 1.5 }}>
                        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 900, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, boxShadow: `0 2px 6px ${T.main}33` }}>{s.n}</span>
                        <span style={{ paddingTop: 2 }}>{s.t}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {isDesktop && (
                <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, borderRadius: 20, padding: '1.25rem', marginBottom: '1rem', border: `1px solid ${T.main}44`, textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
                    {[{c:'rgba(255,255,255,0.4)',s:5},{c:T.light,s:7},{c:T.mid,s:5}].map((d,i)=>(
                      <div key={i} style={{width:d.s,height:d.s,borderRadius:'50%',background:d.c}}/>
                    ))}
                  </div>
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#fff', fontSize: '0.95rem', marginBottom: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="2" width="12" height="20" rx="2.5"/>
                      <path d="M11 18h2"/>
                    </svg>
                    Pour ton retrait sans attendre
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, marginBottom: 12 }}>
                    Tu as commandé depuis ton PC. Pour utiliser l&apos;écran de retrait prioritaire Yoppaa chez le commerçant, télécharge l&apos;app sur ton téléphone.<br/>
                    <strong style={{ color: T.light }}>Tes identifiants restent les mêmes.</strong>
                  </p>
                  <a href="https://yoppaa.app/download"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', borderRadius: 100, padding: '10px 24px', fontSize: '0.875rem', fontWeight: 800, textDecoration: 'none', boxShadow: `0 4px 16px ${T.main}55` }}>
                    Télécharger Yoppaa
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                    </svg>
                  </a>
                  <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>ICI ON EST YOPPERS 🟣</p>
                </div>
              )}

              {/* CTA invite : creation de compte post-commande, cohérent avec /commander/rdv/[slug].
                  Le bon moment pour pousser l'inscription : la commande est confirmee et stockee. */}
              {!(client.email && clientId) && (
                <div style={{ background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 100%)`, borderRadius: 16, padding: '1rem 1.125rem', marginBottom: '1rem', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.main}55 0%, transparent 55%)`, pointerEvents: 'none' }}/>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                        <path d="M2 17l10 5 10-5"/>
                        <path d="M2 12l10 5 10-5"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.95rem', fontWeight: 900, color: '#fff', margin: 0, marginBottom: 4, letterSpacing: '-0.3px' }}>
                        Suis ta commande depuis ton espace 🟣
                      </p>
                      <p style={{ fontSize: '0.78rem', color: T.light, lineHeight: 1.45, margin: 0, marginBottom: 10, opacity: 0.95 }}>
                        Crée ton compte Yopper en 30s pour suivre tes commandes en temps réel, retrouver tes favoris et économiser ton temps à chaque retrait.
                      </p>
                      <button onClick={() => router.push(`/commander/auth?redirect=/commander`)}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0.625rem 1.125rem', background: '#fff', color: T.main, border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
                        Créer mon compte Yopper
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <button onClick={() => router.push('/commander')} style={{ ...btnPrimary, marginBottom: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                </svg>
                Retour à l&apos;accueil
              </button>
              <button onClick={() => { setPanier({}); setCreneauChoisi(null); setRgpdCommande(false); setRgpdMarketing(true); setErreurCommande(null); setAjustementStock(null); setEtape(2) }}
                style={{ width: '100%', padding: '0.875rem', background: 'transparent', color: T.main, border: `1.5px solid ${T.main}`, borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                Continuer chez {commercant.nom}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modale signalement (déclenchée depuis le lien en bas de fiche) */}
      {showSignalement && commercant && (
        <ModalSignalement
          target={{ kind: 'commerce', id: commercant.id, nom: commercant.nom }}
          yopperId={typeof window !== 'undefined' ? localStorage.getItem('yoppaa_client_id') : null}
          onClose={() => setShowSignalement(false)}
          onSent={() => setSignalementSent(true)}
        />
      )}

      {/* Toast de confirmation (favoris ajouté/retiré, lien copié) */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: T.ink, color: '#fff', padding: '12px 22px', borderRadius: 100,
          fontSize: 13, fontWeight: 700, zIndex: 1000,
          boxShadow: '0 10px 30px rgba(26,8,64,0.45)',
          animation: 'toastIn 0.25s ease',
          maxWidth: '90vw',
        }}>
          {toastMessage}
          <style>{`@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 10px) } to { opacity: 1; transform: translate(-50%, 0) } }`}</style>
        </div>
      )}
    </>
  )
}