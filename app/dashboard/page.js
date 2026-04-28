'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import ConfigDashboard from './ConfigDashboard'

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
  rouge:   { border: '#DC2626', badge: '#DC2626', cardBg: '#FFF0F0' },
  orange:  { border: '#EA580C', badge: '#EA580C', cardBg: '#FFF7ED' },
  vert:    { border: '#16A34A', badge: '#16A34A', cardBg: '#F0FDF4' },
  bleu:    { border: '#2563EB', badge: '#2563EB', cardBg: '#EFF6FF' },
}

const STATUTS = {
  'en_attente':     { label: 'Nouvelle',  couleur: T.rouge,  icon: '🔴', next: 'en_preparation', nextLabel: 'Démarrer la prépa' },
  'en_preparation': { label: 'En prépa',  couleur: T.orange, icon: '🟠', next: 'pret',            nextLabel: 'Marquer prête' },
  'pret':           { label: 'Prête',     couleur: T.vert,   icon: '🟢', next: null,              nextLabel: null },
  'recupere':       { label: 'Récupérée', couleur: T.bleu,   icon: '🔵', next: null,              nextLabel: null },
}

function getNumeroJour(commandes, commandeId) {
  const duJour = [...commandes]
    .filter(c => new Date(c.created_at).toDateString() === new Date().toDateString())
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const idx = duJour.findIndex(c => c.id === commandeId)
  return idx === -1 ? '?' : idx + 1
}

function jouerSon() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.2)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4)
  } catch(e) {}
}

// ─── Icônes SVG ───────────────────────────────────────────────────────────────
function IconCommandes({ size = 20, color = '#fff', opacity = 1 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity }}>
      <rect x="2" y="9" width="20" height="13" rx="3" stroke={color} strokeWidth="2.2" strokeLinejoin="round"/>
      <path d="M2,13 L22,13" stroke={color} strokeWidth="2.2"/>
      <path d="M8,9 L8,5 Q8,2 12,2 Q16,2 16,5 L16,9" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconConfig({ size = 20, color = '#fff', opacity = 1 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity }}>
      <circle cx="12" cy="12" r="3.5" stroke={color} strokeWidth="2.2"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
function IconBell({ size = 18, color = '#fff', active = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? color : 'none'}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconLogout({ size = 18, color = '#FCA5A5' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ─── Carte commande redesignée ─────────────────────────────────────────────────
function CarteCommande({ commande, numero, onChangerStatut }) {
  const statut = STATUTS[commande.statut] || STATUTS['en_attente']
  const { couleur } = statut
  const heure = commande.creneau ? `${commande.creneau.heure_debut.slice(0,5)} – ${commande.creneau.heure_fin.slice(0,5)}` : null

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: `0 2px 12px ${couleur.border}14`, border: `1.5px solid ${couleur.border}22`, transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 28px ${couleur.border}28` }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 12px ${couleur.border}14` }}>

      {/* Bande couleur top */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${couleur.border}, ${couleur.border}88)` }}/>

      <div style={{ padding: '0.875rem 1rem' }}>
        {/* Header carte */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Numéro */}
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${couleur.border}, ${couleur.border}bb)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.9rem', color: '#fff', flexShrink: 0, boxShadow: `0 3px 10px ${couleur.border}44` }}>
              #{numero}
            </div>
            <div>
              <p style={{ fontWeight: 800, color: T.ink, margin: 0, fontSize: '0.95rem', letterSpacing: '-0.2px' }}>{commande.client_nom}</p>
              {heure && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={couleur.border} strokeWidth="2.2"/><path d="M12 7v5l3 3" stroke={couleur.border} strokeWidth="2.2" strokeLinecap="round"/></svg>
                  <span style={{ fontSize: '0.75rem', color: couleur.border, fontWeight: 700 }}>{heure}</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontWeight: 900, color: T.ink, margin: '0 0 4px', fontSize: '1.05rem', letterSpacing: '-0.3px' }}>{Number(commande.total).toFixed(2)}€</p>
            <span style={{ background: couleur.badge, color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '3px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              {statut.icon} {statut.label}
            </span>
          </div>
        </div>

        {/* Articles */}
        <div style={{ background: T.bg, borderRadius: 10, padding: '0.5rem 0.75rem', marginBottom: '0.625rem' }}>
          {commande.commande_articles?.map(ligne => (
            <div key={ligne.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: T.muted, marginBottom: 2, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 600 }}>{ligne.quantite}× {ligne.article?.nom}</span>
              <span style={{ fontWeight: 700, color: T.ink }}>{(ligne.quantite * ligne.prix_unitaire).toFixed(2)}€</span>
            </div>
          ))}
        </div>

        {/* Bouton action */}
        {statut.next && (
          <button onClick={() => onChangerStatut(commande.id, statut.next)}
            style={{ width: '100%', padding: '0.625rem', background: `linear-gradient(135deg, ${couleur.border}, ${couleur.border}cc)`, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${couleur.border}44`, transition: 'opacity 0.15s, transform 0.1s', letterSpacing: '-0.2px' }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'scale(0.99)' }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}>
            {statut.nextLabel} →
          </button>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [commandes, setCommandes] = useState([])
  const [commercant, setCommercant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [listeCommercants, setListeCommercants] = useState([])
  const [ongletPrincipal, setOngletPrincipal] = useState('commandes')
  const [filtreStatut, setFiltreStatut] = useState('actives')
  const [notificationsActives, setNotificationsActives] = useState(false)
  const [nouvelleCommande, setNouvelleCommande] = useState(false)
  const router = useRouter()

  const trierCommandes = (data) =>
    (data || []).sort((a, b) => (a.creneau?.heure_debut || '').localeCompare(b.creneau?.heure_debut || ''))

  const chargerCommandes = useCallback(async (id) => {
    const { data } = await supabase
      .from('commandes')
      .select(`*, creneau:creneaux(*), commande_articles(*, article:articles(*))`)
      .eq('commercant_id', id)
      .order('created_at', { ascending: true })
    setCommandes(trierCommandes(data))
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('commercants').select('*').eq('auth_user_id', user.id).order('nom')
      if (!data || data.length === 0) { router.push('/login'); return }
      if (data.length === 1) {
        setCommercant(data[0])
        chargerCommandes(data[0].id)
      } else {
        setListeCommercants(data)
        setLoading(false)
      }
    }
    init()
  }, [chargerCommandes, router])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem('notifs') === 'true') setNotificationsActives(true)
    }
  }, [])

  useEffect(() => {
    if (!commercant) return
    let dernierNombre = 0
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from('commandes')
        .select(`*, creneau:creneaux(*), commande_articles(*, article:articles(*))`)
        .eq('commercant_id', commercant.id)
        .order('created_at', { ascending: true })
      const triees = trierCommandes(data)
      if (dernierNombre > 0 && triees.length > dernierNombre) {
        if (notificationsActives) jouerSon()
        setNouvelleCommande(true)
        setTimeout(() => setNouvelleCommande(false), 6000)
      }
      dernierNombre = triees.length
      setCommandes(triees)
    }, 5000)
    return () => clearInterval(iv)
  }, [commercant, notificationsActives])

  async function changerStatut(commandeId, statut) {
    await supabase.from('commandes').update({ statut }).eq('id', commandeId)
    setCommandes(prev => prev.map(c => c.id === commandeId ? { ...c, statut } : c))
  }

  async function seDeconnecter() { await supabase.auth.signOut(); router.push('/login') }

  function activerNotifications() {
    const n = !notificationsActives
    setNotificationsActives(n)
    if (typeof window !== 'undefined') localStorage.setItem('notifs', String(n))
    if (n) jouerSon()
  }

  const duJour = commandes.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString())
  const stats = {
    nouvelles:  commandes.filter(c => c.statut === 'en_attente').length,
    enPrepa:    commandes.filter(c => c.statut === 'en_preparation').length,
    pretes:     commandes.filter(c => c.statut === 'pret').length,
    recuperees: duJour.filter(c => c.statut === 'recupere').length,
    ca:         duJour.reduce((acc, c) => acc + Number(c.total), 0),
  }

  const commandesFiltrees = commandes.filter(c => {
    if (filtreStatut === 'actives')        return ['en_attente','en_preparation','pret'].includes(c.statut)
    if (filtreStatut === 'en_attente')     return c.statut === 'en_attente'
    if (filtreStatut === 'en_preparation') return c.statut === 'en_preparation'
    if (filtreStatut === 'pret')           return c.statut === 'pret'
    if (filtreStatut === 'recupere')       return c.statut === 'recupere'
    return true
  })

  const filtres = [
    { key: 'actives',        label: 'Actives',      count: stats.nouvelles + stats.enPrepa + stats.pretes },
    { key: 'en_attente',     label: 'Nouvelles',    count: stats.nouvelles,  color: '#DC2626' },
    { key: 'en_preparation', label: 'En prépa',     count: stats.enPrepa,    color: '#EA580C' },
    { key: 'pret',           label: 'Prêtes',       count: stats.pretes,     color: '#16A34A' },
    { key: 'recupere',       label: 'Récupérées',   count: stats.recuperees, color: '#2563EB' },
    { key: 'tout',           label: 'Tout',         count: duJour.length },
  ]

  const statsCards = [
    { label: 'Nouvelles',  value: stats.nouvelles,          color: '#DC2626', bg: '#FFF0F0', border: '#DC262618', dot: true },
    { label: 'En prépa',   value: stats.enPrepa,            color: '#EA580C', bg: '#FFF7ED', border: '#EA580C18', dot: false },
    { label: 'Prêtes',     value: stats.pretes,             color: '#16A34A', bg: '#F0FDF4', border: '#16A34A18', dot: false },
    { label: 'CA du jour', value: `${stats.ca.toFixed(2)}€`, color: T.main,   bg: T.pale,   border: `${T.main}18`, dot: false },
  ]

  // ─── Sélecteur commerce ───────────────────────────────────────────────────────
  if (listeCommercants.length > 0 && !commercant) return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #3D1580 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: '"DM Sans", sans-serif', position: 'relative', overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 80% 20%, ${T.mid}33 0%, transparent 50%), radial-gradient(circle at 20% 80%, ${T.light}18 0%, transparent 50%)`, pointerEvents: 'none' }}/>
      <div style={{ width: '100%', maxWidth: 400, position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 12 }}>
            {[{c:'#fff',o:0.35},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: d.c, opacity: d.o }}/>
            ))}
          </div>
          <p style={{ fontWeight: 900, fontSize: '2rem', letterSpacing: '-2px', color: '#fff', marginBottom: 4 }}>yoppaa</p>
          <p style={{ color: T.light, fontSize: '0.82rem', fontWeight: 600, opacity: 0.8 }}>Choisir un commerce</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listeCommercants.map(c => (
            <button key={c.id} onClick={() => { setCommercant(c); setListeCommercants([]); chargerCommandes(c.id) }}
              style={{ padding: '1rem 1.25rem', borderRadius: 14, border: `1.5px solid ${T.main}44`, background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1rem', textAlign: 'left', transition: 'all 0.15s', backdropFilter: 'blur(8px)' }}
              onMouseOver={e => { e.currentTarget.style.background = `${T.main}44`; e.currentTarget.style.borderColor = T.main }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = `${T.main}44` }}>
              <p style={{ margin: '0 0 4px' }}>{c.nom}</p>
              <p style={{ fontSize: '0.75rem', color: T.light, margin: 0, fontWeight: 500 }}>{c.type} · {c.adresse}</p>
            </button>
          ))}
        </div>
        <button onClick={seDeconnecter} style={{ width: '100%', marginTop: '1.5rem', padding: '0.75rem', borderRadius: 100, border: '1px solid #DC262633', background: '#DC262611', color: '#FCA5A5', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.82rem' }}>
          Se déconnecter
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <link rel="manifest" href="/manifest-dashboard.json"/>
      <link rel="apple-touch-icon" href="/icon-pro-192.png"/>
      <meta name="apple-mobile-web-app-capable" content="yes"/>
      <meta name="apple-mobile-web-app-title" content="Yoppaa Pro"/>
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
      <meta name="theme-color" content="#160636"/>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: ${T.bgPanel}; }
        ::-webkit-scrollbar-thumb { background: ${T.main}66; border-radius: 3px; }
        .layout { display: flex; height: 100vh; overflow: hidden; }

        /* ── Sidebar PC ── */
        .sidebar {
          width: 220px; flex-shrink: 0;
          background: linear-gradient(180deg, ${T.bgPanel} 0%, #1e0950 100%);
          border-right: 1px solid ${T.main}33;
          padding: 1.5rem 1rem;
          display: none; flex-direction: column;
          height: 100vh; overflow-y: auto;
        }

        /* ── Header hype mobile/tablette ── */
        .topbar {
          background: linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 50%, #3D1580 100%);
          border-bottom: 1px solid ${T.main}33;
          flex-shrink: 0; position: relative; overflow: hidden;
        }
        .topbar-inner {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.875rem 1rem 0.75rem;
          position: relative; z-index: 1;
        }
        .topbar-deco {
          position: absolute; inset: 0;
          background-image: radial-gradient(circle at 90% 50%, ${T.mid}33 0%, transparent 60%), radial-gradient(circle at 10% 50%, ${T.light}18 0%, transparent 50%);
          pointer-events: none;
        }

        /* ── Contenu ── */
        .content-area { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100vh; overflow: hidden; }
        .sticky-header { flex-shrink: 0; background: ${T.bg}; border-bottom: 1px solid ${T.pale}; padding: 0.875rem 1rem; }
        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 0.75rem; }
        .filtres-wrap { display: flex; gap: 5px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
        .filtres-wrap::-webkit-scrollbar { display: none; }
        .scroll-zone { flex: 1; overflow-y: auto; padding: 1rem; }
        .commandes-grid { display: grid; grid-template-columns: 1fr; gap: 0.75rem; }

        .filtre-btn {
          flex-shrink: 0; padding: 0.3rem 0.75rem; border-radius: 100px; border: 1.5px solid;
          font-weight: 700; font-size: 0.72rem; cursor: pointer;
          font-family: "DM Sans", sans-serif; transition: all 0.15s; white-space: nowrap;
        }
        .sidebar-nav-btn {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 0.7rem 0.875rem; border-radius: 12px; border: none;
          cursor: pointer; font-family: "DM Sans", sans-serif;
          font-weight: 700; font-size: 0.875rem; transition: all 0.15s;
          margin-bottom: 4px; text-align: left;
        }

        @media (min-width: 600px) {
          .commandes-grid { grid-template-columns: repeat(2, 1fr); }
          .stats-grid { grid-template-columns: repeat(4, 1fr); gap: 10px; }
          .sticky-header { padding: 1rem 1.5rem; }
          .scroll-zone { padding: 1.25rem; }
        }
        @media (min-width: 1100px) {
          .sidebar { display: flex !important; }
          .topbar { display: none !important; }
          .scroll-zone { padding: 1.5rem !important; }
          .sticky-header { padding: 1rem 1.5rem; }
          .commandes-grid { grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
          .stats-grid { grid-template-columns: repeat(4, 1fr); gap: 10px; }
        }
        @keyframes slideDown { from { transform: translateY(-100%) } to { transform: translateY(0) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
      `}</style>

      {/* Bannière nouvelle commande */}
      {nouvelleCommande && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', padding: '0.875rem', textAlign: 'center', fontWeight: 800, fontSize: '1rem', boxShadow: `0 4px 30px ${T.main}88`, animation: 'slideDown 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ animation: 'pulse 1s ease infinite' }}>🔔</span>
          Nouvelle commande reçue !
        </div>
      )}

      <div className="layout">

        {/* ── SIDEBAR PC ── */}
        <aside className="sidebar">
          {/* Logo */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
              {[{c:'#fff',o:0.35},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: d.c, opacity: d.o }}/>
              ))}
            </div>
            <p style={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-2px', color: '#fff', marginBottom: 2, lineHeight: 1 }}>yoppaa</p>
            <p style={{ fontSize: '0.65rem', color: T.light, fontWeight: 600, opacity: 0.7, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Pro</p>
          </div>

          {/* Nom commerce */}
          <div style={{ background: `${T.main}22`, borderRadius: 12, padding: '0.75rem 0.875rem', marginBottom: '1.25rem', border: `1px solid ${T.main}33` }}>
            <p style={{ fontSize: '0.6rem', color: T.light, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, opacity: 0.7 }}>Commerce actif</p>
            <p style={{ fontWeight: 800, color: '#fff', fontSize: '0.9rem', letterSpacing: '-0.2px' }}>{commercant?.nom}</p>
            <p style={{ fontSize: '0.7rem', color: T.light, opacity: 0.65, marginTop: 2 }}>{commercant?.type}</p>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1 }}>
            {[
              { key: 'commandes', label: 'Commandes', Icon: IconCommandes },
              { key: 'config',    label: 'Paramètres', Icon: IconConfig },
            ].map(({ key, label, Icon }) => {
              const actif = ongletPrincipal === key
              return (
                <button key={key} className="sidebar-nav-btn" onClick={() => setOngletPrincipal(key)}
                  style={{ background: actif ? `linear-gradient(135deg, ${T.main}55, ${T.mid}33)` : 'transparent', color: actif ? '#fff' : T.light, borderLeft: `3px solid ${actif ? T.main : 'transparent'}`, boxShadow: actif ? `0 4px 16px ${T.main}33` : 'none' }}>
                  <Icon size={18} color={actif ? '#fff' : T.light} opacity={actif ? 1 : 0.6}/>
                  {label}
                  {key === 'commandes' && stats.nouvelles > 0 && (
                    <span style={{ marginLeft: 'auto', background: '#DC2626', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100, animation: 'pulse 2s ease infinite' }}>{stats.nouvelles}</span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Stats mini */}
          <div style={{ background: `${T.main}18`, borderRadius: 12, padding: '0.875rem', margin: '1rem 0', border: `1px solid ${T.main}28` }}>
            <p style={{ fontSize: '0.58rem', color: T.light, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, opacity: 0.7 }}>Aujourd'hui</p>
            {[
              { label: 'CA', value: `${stats.ca.toFixed(2)}€`, color: T.mid },
              { label: 'Commandes', value: duJour.length, color: '#fff' },
              { label: 'Récupérées', value: stats.recuperees, color: T.light },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.72rem', color: T.light, opacity: 0.7 }}>{s.label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 900, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={activerNotifications}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.875rem', borderRadius: 10, border: `1px solid ${notificationsActives ? T.main : T.main+'44'}`, background: notificationsActives ? `${T.main}33` : 'transparent', color: notificationsActives ? '#fff' : T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem', transition: 'all 0.15s' }}>
              <IconBell size={15} color={notificationsActives ? '#fff' : T.light} active={notificationsActives}/>
              {notificationsActives ? 'Alertes actives' : 'Alertes désactivées'}
            </button>
            <button onClick={seDeconnecter}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.875rem', borderRadius: 10, border: '1px solid #DC262633', background: '#DC262611', color: '#FCA5A5', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem' }}>
              <IconLogout size={15}/>
              Déconnexion
            </button>
          </div>
        </aside>

        {/* ── ZONE CONTENU ── */}
        <div className="content-area">

          {/* Topbar hype mobile/tablette */}
          <div className="topbar">
            <div className="topbar-deco"/>
            <div className="topbar-inner">
              {/* Logo + commerce */}
              <div style={{ flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[{c:'#fff',o:0.35},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: d.c, opacity: d.o }}/>
                    ))}
                  </div>
                  <p style={{ fontWeight: 900, fontSize: '1.15rem', letterSpacing: '-1.5px', color: '#fff', lineHeight: 1 }}>yoppaa</p>
                  <span style={{ fontSize: '0.58rem', fontWeight: 700, color: T.light, background: `${T.main}44`, padding: '2px 7px', borderRadius: 100, border: `1px solid ${T.light}33`, opacity: 0.9 }}>PRO</span>
                </div>
                <p style={{ color: T.light, fontWeight: 600, fontSize: '0.7rem', opacity: 0.75, marginTop: 2 }}>{commercant?.nom}</p>
              </div>

              {/* Nav pills */}
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 3, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {[
                  { key: 'commandes', label: 'Commandes', Icon: IconCommandes },
                  { key: 'config',    label: 'Config',    Icon: IconConfig },
                ].map(({ key, label, Icon }) => {
                  const actif = ongletPrincipal === key
                  return (
                    <button key={key} onClick={() => setOngletPrincipal(key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.75rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.75rem', transition: 'all 0.2s', background: actif ? T.main : 'transparent', color: actif ? '#fff' : T.light, boxShadow: actif ? `0 3px 12px ${T.main}55` : 'none', position: 'relative' }}>
                      <Icon size={14} color={actif ? '#fff' : T.light}/>
                      {label}
                      {key === 'commandes' && stats.nouvelles > 0 && (
                        <span style={{ position: 'absolute', top: -4, right: -4, background: '#DC2626', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100, animation: 'pulse 2s ease infinite' }}>{stats.nouvelles}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={activerNotifications}
                  style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: `1px solid ${notificationsActives ? T.main : 'rgba(255,255,255,0.15)'}`, background: notificationsActives ? `${T.main}44` : 'rgba(255,255,255,0.08)', color: T.light, cursor: 'pointer', backdropFilter: 'blur(8px)', transition: 'all 0.15s' }}>
                  <IconBell size={16} color={notificationsActives ? '#fff' : T.light} active={notificationsActives}/>
                </button>
                <button onClick={seDeconnecter}
                  style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1px solid #DC262333', background: '#DC262311', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
                  <IconLogout size={16}/>
                </button>
              </div>
            </div>
          </div>

          {/* Sticky header stats + filtres */}
          {ongletPrincipal === 'commandes' && (
            <div className="sticky-header">
              <div className="stats-grid">
                {statsCards.map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '0.625rem 0.875rem', border: `1.5px solid ${s.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {s.dot && s.value > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block', animation: 'pulse 2s ease infinite', flexShrink: 0 }}/>}
                      <p style={{ fontSize: '0.6rem', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</p>
                    </div>
                    <p style={{ fontSize: '1.5rem', fontWeight: 900, color: s.color, letterSpacing: '-1px', lineHeight: 1 }}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="filtres-wrap">
                {filtres.map(f => (
                  <button key={f.key} className="filtre-btn" onClick={() => setFiltreStatut(f.key)}
                    style={{ borderColor: filtreStatut === f.key ? (f.color || T.main) : `${T.main}28`, background: filtreStatut === f.key ? (f.color || T.main) : '#fff', color: filtreStatut === f.key ? '#fff' : T.ink }}>
                    {f.label}{f.count > 0 ? ` · ${f.count}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Zone scrollable */}
          <div className="scroll-zone">
            {ongletPrincipal === 'commandes' && (
              <>
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', gap: 10 }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: [T.light, T.mid, T.main][i], animation: `pulse 0.8s ease-in-out ${i*0.2}s infinite alternate` }}/>
                    ))}
                  </div>
                )}
                {!loading && commandesFiltrees.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
                    <p style={{ fontWeight: 800, color: T.ink, marginBottom: 4 }}>Aucune commande ici</p>
                    <p style={{ fontSize: '0.875rem', color: T.muted }}>
                      {filtreStatut === 'actives' ? 'Toutes les commandes sont traitées !' : 'Rien dans ce filtre.'}
                    </p>
                  </div>
                )}
                <div className="commandes-grid">
                  {commandesFiltrees.map(commande => (
                    <CarteCommande key={commande.id} commande={commande} numero={getNumeroJour(commandes, commande.id)} onChangerStatut={changerStatut}/>
                  ))}
                </div>
              </>
            )}
            {ongletPrincipal === 'config' && commercant && (
              <ConfigDashboard commercantId={commercant.id}/>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}