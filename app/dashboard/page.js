'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
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

// ─── Helpers dates ────────────────────────────────────────────────────────────
function dateLabel(date) {
  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const d = new Date(date); d.setHours(0,0,0,0)
  if (d.getTime() === today.getTime()) return "Aujourd'hui"
  if (d.getTime() === tomorrow.getTime()) return 'Demain'
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function dateKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getJoursDispos(horizon = 1) {
  const today = new Date(); today.setHours(0,0,0,0)
  const jours = []
  for (let i = 0; i <= horizon; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    jours.push(dateKey(d))
  }
  return jours
}

function getNumeroJour(commandes, commandeId, jourKey) {
  const duJour = [...commandes]
    .filter(c => dateKey(c.date_commande || c.created_at) === jourKey)
    .sort((a, b) => (a.creneau?.heure_debut || '').localeCompare(b.creneau?.heure_debut || '') || new Date(a.created_at) - new Date(b.created_at))
  const idx = duJour.findIndex(c => c.id === commandeId)
  return idx === -1 ? '?' : idx + 1
}

// ─── Son notification ─────────────────────────────────────────────────────────
function jouerSon() {
  try {
    const audio = new Audio('/sounds/notification.mp3')
    audio.currentTime = 0
    audio.volume = 0.7
    audio.play().catch(e => console.warn('Audio:', e))
  } catch(e) {}
}

// ─── Icônes SVG ───────────────────────────────────────────────────────────────
function IconCommandes({ size = 20, color = '#fff', opacity = 1 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity, flexShrink: 0 }}>
      <rect x="2" y="9" width="20" height="13" rx="3" stroke={color} strokeWidth="2.2" strokeLinejoin="round"/>
      <path d="M2,13 L22,13" stroke={color} strokeWidth="2.2"/>
      <path d="M8,9 L8,5 Q8,2 12,2 Q16,2 16,5 L16,9" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconConfig({ size = 20, color = '#fff', opacity = 1 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity, flexShrink: 0 }}>
      <circle cx="12" cy="12" r="3.5" stroke={color} strokeWidth="2.2"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
function IconBell({ size = 18, color = '#fff', active = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? color : 'none'} style={{ flexShrink: 0 }}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconLogout({ size = 18, color = '#FCA5A5' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconClock({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.2"/>
      <path d="M12 7v5l3 3" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  )
}

// ─── Carte commande ───────────────────────────────────────────────────────────
function CarteCommande({ commande, numero, onChangerStatut }) {
  const statut = STATUTS[commande.statut] || STATUTS['en_attente']
  const { couleur } = statut
  const heure = commande.creneau
    ? `${commande.creneau.heure_debut.slice(0,5)} – ${commande.creneau.heure_fin.slice(0,5)}`
    : null

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: `0 2px 12px ${couleur.border}14`, border: `1.5px solid ${couleur.border}22`, transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 28px ${couleur.border}28` }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 12px ${couleur.border}14` }}>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${couleur.border}, ${couleur.border}88)` }}/>
      <div style={{ padding: '0.875rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${couleur.border}, ${couleur.border}bb)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.9rem', color: '#fff', flexShrink: 0, boxShadow: `0 3px 10px ${couleur.border}44` }}>
              #{numero}
            </div>
            <div>
              <p style={{ fontWeight: 800, color: T.ink, margin: 0, fontSize: '0.95rem', letterSpacing: '-0.2px' }}>{commande.client_nom}</p>
              {heure && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <IconClock size={11} color={couleur.border}/>
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
        <div style={{ background: T.bg, borderRadius: 10, padding: '0.5rem 0.75rem', marginBottom: '0.625rem' }}>
          {commande.commande_articles?.map(ligne => (
            <div key={ligne.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: T.muted, marginBottom: 2, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 600 }}>{ligne.quantite}× {ligne.article?.nom}</span>
              <span style={{ fontWeight: 700, color: T.ink }}>{(ligne.quantite * ligne.prix_unitaire).toFixed(2)}€</span>
            </div>
          ))}
        </div>
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

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Dashboard() {
  const [commandes, setCommandes] = useState([])
  const [commercant, setCommercant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [listeCommercants, setListeCommercants] = useState([])
  const [ongletPrincipal, setOngletPrincipal] = useState('commandes')
  const [filtreStatut, setFiltreStatut] = useState('actives')
  const [jourSelectionne, setJourSelectionne] = useState(null) // null = aujourd'hui par défaut
  const [notificationsActives, setNotificationsActives] = useState(false)
  const [nouvelleCommande, setNouvelleCommande] = useState(false)
  const router = useRouter()
  const dernierNombreRef = useRef(0)
  const pollingRef = useRef(null)

  const trierCommandes = (data) =>
    (data || []).sort((a, b) => {
      const dateA = dateKey(a.date_commande || a.created_at)
      const dateB = dateKey(b.date_commande || b.created_at)
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      return (a.creneau?.heure_debut || '').localeCompare(b.creneau?.heure_debut || '')
    })

  const chargerCommandes = useCallback(async (id) => {
    const { data } = await supabase
      .from('commandes')
      .select(`*, creneau:creneaux(*), commande_articles(*, article:articles(*))`)
      .eq('commercant_id', id)
      .order('created_at', { ascending: true })
    const triees = trierCommandes(data)
    setCommandes(triees)
    dernierNombreRef.current = triees.length
    setLoading(false)
    // Sélectionner aujourd'hui par défaut
    const todayKey = dateKey(new Date())
    setJourSelectionne(todayKey)
  }, [])

  // ─── Init — mémoriser le commerce sélectionné ─────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('commercants').select('*').eq('auth_user_id', user.id).order('nom')
      if (!data || data.length === 0) { router.push('/login'); return }

      if (data.length === 1) {
        setCommercant(data[0])
        localStorage.setItem('yoppaa_dashboard_commercant_id', data[0].id)
        chargerCommandes(data[0].id)
      } else {
        // Multi-commerces — restaurer depuis localStorage
        const savedId = localStorage.getItem('yoppaa_dashboard_commercant_id')
        if (savedId) {
          const found = data.find(c => c.id === savedId)
          if (found) {
            setCommercant(found)
            chargerCommandes(found.id)
            return
          }
        }
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

  // ─── Polling auto 5s ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!commercant) return
    if (pollingRef.current) clearInterval(pollingRef.current)

    pollingRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('commandes')
        .select(`*, creneau:creneaux(*), commande_articles(*, article:articles(*))`)
        .eq('commercant_id', commercant.id)
        .order('created_at', { ascending: true })
      const triees = trierCommandes(data)
      if (dernierNombreRef.current > 0 && triees.length > dernierNombreRef.current) {
        if (notificationsActives) jouerSon()
        setNouvelleCommande(true)
        setTimeout(() => setNouvelleCommande(false), 6000)
      }
      dernierNombreRef.current = triees.length
      setCommandes(triees)
    }, 5000)

    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [commercant?.id, notificationsActives])

  async function changerStatut(commandeId, statut) {
    await supabase.from('commandes').update({ statut }).eq('id', commandeId)
    setCommandes(prev => prev.map(c => c.id === commandeId ? { ...c, statut } : c))
  }

  async function seDeconnecter() {
    localStorage.removeItem('yoppaa_dashboard_commercant_id')
    await supabase.auth.signOut()
    router.push('/login')
  }

  function activerNotifications() {
    const n = !notificationsActives
    setNotificationsActives(n)
    if (typeof window !== 'undefined') localStorage.setItem('notifs', String(n))
    if (n) jouerSon()
  }

  // ─── Stats & filtres ──────────────────────────────────────────────────────
  const todayKey = dateKey(new Date())
  const joursDispos = getJoursDispos(commercant?.horizon_commande || 1)

  // Si aucun jour sélectionné ou jour inexistant → aujourd'hui
  const jourActif = (jourSelectionne && joursDispos.includes(jourSelectionne)) ? jourSelectionne : todayKey

  const commandesDuJour = commandes.filter(c => dateKey(c.date_commande || c.created_at) === jourActif)

  const stats = {
    nouvelles:  commandesDuJour.filter(c => c.statut === 'en_attente').length,
    enPrepa:    commandesDuJour.filter(c => c.statut === 'en_preparation').length,
    pretes:     commandesDuJour.filter(c => c.statut === 'pret').length,
    recuperees: commandesDuJour.filter(c => c.statut === 'recupere').length,
    ca:         commandesDuJour.reduce((acc, c) => acc + Number(c.total), 0),
  }

  const commandesFiltrees = commandesDuJour.filter(c => {
    if (filtreStatut === 'actives')        return ['en_attente','en_preparation','pret'].includes(c.statut)
    if (filtreStatut === 'en_attente')     return c.statut === 'en_attente'
    if (filtreStatut === 'en_preparation') return c.statut === 'en_preparation'
    if (filtreStatut === 'pret')           return c.statut === 'pret'
    if (filtreStatut === 'recupere')       return c.statut === 'recupere'
    return true
  })

  const filtresStatut = [
    { key: 'actives',        label: 'Actives',    count: stats.nouvelles + stats.enPrepa + stats.pretes },
    { key: 'en_attente',     label: 'Nouvelles',  count: stats.nouvelles,  color: '#DC2626' },
    { key: 'en_preparation', label: 'En prépa',   count: stats.enPrepa,    color: '#EA580C' },
    { key: 'pret',           label: 'Prêtes',     count: stats.pretes,     color: '#16A34A' },
    { key: 'recupere',       label: 'Récupérées', count: stats.recuperees, color: '#2563EB' },
    { key: 'tout',           label: 'Tout',       count: commandesDuJour.length },
  ]

  const statsCards = [
    { label: 'Nouvelles',  value: stats.nouvelles,           color: '#DC2626', bg: '#FFF0F0', border: '#DC262618', pulse: stats.nouvelles > 0 },
    { label: 'En prépa',   value: stats.enPrepa,             color: '#EA580C', bg: '#FFF7ED', border: '#EA580C18', pulse: false },
    { label: 'Prêtes',     value: stats.pretes,              color: '#16A34A', bg: '#F0FDF4', border: '#16A34A18', pulse: false },
    { label: 'CA du jour', value: `${stats.ca.toFixed(2)}€`, color: T.main,   bg: T.pale,   border: `${T.main}18`, pulse: false },
  ]

  // ─── Sélecteur commerce ───────────────────────────────────────────────────
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
            <button key={c.id} onClick={() => {
              setCommercant(c)
              setListeCommercants([])
              localStorage.setItem('yoppaa_dashboard_commercant_id', c.id)
              chargerCommandes(c.id)
            }}
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
    <div style={{ fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <link rel="manifest" href="/manifest-dashboard.json"/>
      <meta name="apple-mobile-web-app-capable" content="yes"/>
      <meta name="apple-mobile-web-app-title" content="Yoppaa Pro"/>
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
      <meta name="theme-color" content="#160636"/>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.main}44; border-radius: 4px; }

        .dash-layout {
          display: flex;
          height: 100dvh;
          width: 100vw;
          overflow: hidden;
          background: ${T.bg};
        }

        /* ── Sidebar PC ── */
        .sidebar {
          width: 220px;
          flex-shrink: 0;
          background: linear-gradient(180deg, ${T.bgPanel} 0%, #1e0950 100%);
          border-right: 1px solid ${T.main}33;
          padding: 1.5rem 1rem;
          display: none;
          flex-direction: column;
          height: 100dvh;
          overflow-y: auto;
        }

        /* ── Zone contenu ── */
        .content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          height: 100dvh;
          overflow: hidden;
        }

        /* ── Topbar hype ── */
        .topbar {
          background: linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 50%, #3D1580 100%);
          border-bottom: 1px solid ${T.main}33;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
        }
        .topbar-deco {
          position: absolute; inset: 0;
          background-image: radial-gradient(circle at 90% 50%, ${T.mid}33 0%, transparent 60%), radial-gradient(circle at 10% 50%, ${T.light}18 0%, transparent 50%);
          pointer-events: none;
        }
        .topbar-inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          position: relative;
          z-index: 1;
          gap: 8px;
        }

        /* ── Sticky header stats+filtres ── */
        .sticky-header {
          flex-shrink: 0;
          background: ${T.bg};
          border-bottom: 1px solid ${T.pale};
          padding: 0.75rem 1rem 0;
        }

        /* ── Stats grid ── */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
          margin-bottom: 0.625rem;
        }

        /* ── Jours pills ── */
        .jours-wrap {
          display: flex;
          gap: 5px;
          overflow-x: auto;
          scrollbar-width: none;
          padding-bottom: 0.625rem;
          border-bottom: 1px solid ${T.pale};
          margin-bottom: 0.625rem;
        }
        .jours-wrap::-webkit-scrollbar { display: none; }

        /* ── Filtres statut ── */
        .filtres-wrap {
          display: flex;
          gap: 5px;
          overflow-x: auto;
          scrollbar-width: none;
          padding-bottom: 0.625rem;
        }
        .filtres-wrap::-webkit-scrollbar { display: none; }

        .pill {
          flex-shrink: 0;
          padding: 0.3rem 0.75rem;
          border-radius: 100px;
          border: 1.5px solid;
          font-weight: 700;
          font-size: 0.72rem;
          cursor: pointer;
          font-family: "DM Sans", sans-serif;
          transition: all 0.15s;
          white-space: nowrap;
        }

        /* ── Scroll zone ── */
        .scroll-zone {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          -webkit-overflow-scrolling: touch;
        }

        .commandes-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }

        /* ── Nav sidebar btn ── */
        .sidebar-nav-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0.7rem 0.875rem;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-family: "DM Sans", sans-serif;
          font-weight: 700;
          font-size: 0.875rem;
          transition: all 0.15s;
          margin-bottom: 4px;
          text-align: left;
        }

        /* ── Tablette 600px+ ── */
        @media (min-width: 600px) {
          .commandes-grid { grid-template-columns: repeat(2, 1fr); }
          .stats-grid { grid-template-columns: repeat(4, 1fr); gap: 8px; }
          .sticky-header { padding: 0.875rem 1.25rem 0; }
          .scroll-zone { padding: 1.25rem; }
          .topbar-inner { padding: 0.875rem 1.25rem; }
        }

        /* ── PC 1100px+ ── */
        @media (min-width: 1100px) {
          .sidebar { display: flex !important; }
          .topbar { display: none !important; }
          .scroll-zone { padding: 1.5rem !important; }
          .sticky-header { padding: 1rem 1.5rem 0; }
          .commandes-grid { grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
          .stats-grid { grid-template-columns: repeat(4, 1fr); gap: 10px; }
        }

        @keyframes slideDown { from { transform: translateY(-100%) } to { transform: translateY(0) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        @keyframes dotPulse { from { opacity:0.4; transform:scale(0.8); } to { opacity:1; transform:scale(1.2); } }
      `}</style>

      {/* Bannière nouvelle commande */}
      {nouvelleCommande && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', padding: '0.875rem', textAlign: 'center', fontWeight: 800, fontSize: '1rem', boxShadow: `0 4px 30px ${T.main}88`, animation: 'slideDown 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ animation: 'pulse 1s ease infinite' }}>🔔</span>
          Nouvelle commande reçue !
        </div>
      )}

      <div className="dash-layout">

        {/* ── SIDEBAR PC ── */}
        <aside className="sidebar">
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
              {[{c:'#fff',o:0.35},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: d.c, opacity: d.o }}/>
              ))}
            </div>
            <p style={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-2px', color: '#fff', marginBottom: 2, lineHeight: 1 }}>yoppaa</p>
            <p style={{ fontSize: '0.6rem', color: T.light, fontWeight: 700, opacity: 0.7, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Pro</p>
          </div>

          <div style={{ background: `${T.main}22`, borderRadius: 12, padding: '0.75rem 0.875rem', marginBottom: '1.25rem', border: `1px solid ${T.main}33` }}>
            <p style={{ fontSize: '0.6rem', color: T.light, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, opacity: 0.7 }}>Commerce actif</p>
            <p style={{ fontWeight: 800, color: '#fff', fontSize: '0.9rem', letterSpacing: '-0.2px' }}>{commercant?.nom}</p>
            <p style={{ fontSize: '0.7rem', color: T.light, opacity: 0.65, marginTop: 2 }}>{commercant?.type}</p>
          </div>

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

          <div style={{ background: `${T.main}18`, borderRadius: 12, padding: '0.875rem', margin: '1rem 0', border: `1px solid ${T.main}28` }}>
            <p style={{ fontSize: '0.58rem', color: T.light, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, opacity: 0.7 }}>
              {jourActif ? dateLabel(jourActif + 'T00:00:00') : "Aujourd'hui"}
            </p>
            {[
              { label: 'CA', value: `${stats.ca.toFixed(2)}€`, color: T.mid },
              { label: 'Commandes', value: commandesDuJour.length, color: '#fff' },
              { label: 'Récupérées', value: stats.recuperees, color: T.light },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.72rem', color: T.light, opacity: 0.7 }}>{s.label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 900, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

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
              <div style={{ flexShrink: 0, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[{c:'#fff',o:0.35},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: d.c, opacity: d.o }}/>
                    ))}
                  </div>
                  <p style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-1.5px', color: '#fff', lineHeight: 1 }}>yoppaa</p>
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, color: T.light, background: `${T.main}44`, padding: '2px 6px', borderRadius: 100, border: `1px solid ${T.light}33` }}>PRO</span>
                </div>
                <p style={{ color: T.light, fontWeight: 600, fontSize: '0.68rem', opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{commercant?.nom}</p>
              </div>

              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 3, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {[
                  { key: 'commandes', label: 'Commandes', Icon: IconCommandes },
                  { key: 'config',    label: 'Config',    Icon: IconConfig },
                ].map(({ key, label, Icon }) => {
                  const actif = ongletPrincipal === key
                  return (
                    <button key={key} onClick={() => setOngletPrincipal(key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.35rem 0.625rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.72rem', transition: 'all 0.2s', background: actif ? T.main : 'transparent', color: actif ? '#fff' : T.light, boxShadow: actif ? `0 3px 12px ${T.main}55` : 'none', position: 'relative', whiteSpace: 'nowrap' }}>
                      <Icon size={13} color={actif ? '#fff' : T.light}/>
                      {label}
                      {key === 'commandes' && stats.nouvelles > 0 && (
                        <span style={{ position: 'absolute', top: -4, right: -4, background: '#DC2626', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100, animation: 'pulse 2s ease infinite' }}>{stats.nouvelles}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <button onClick={activerNotifications}
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: `1px solid ${notificationsActives ? T.main : 'rgba(255,255,255,0.15)'}`, background: notificationsActives ? `${T.main}44` : 'rgba(255,255,255,0.08)', cursor: 'pointer', backdropFilter: 'blur(8px)', transition: 'all 0.15s', flexShrink: 0 }}>
                  <IconBell size={15} color={notificationsActives ? '#fff' : T.light} active={notificationsActives}/>
                </button>
                <button onClick={seDeconnecter}
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1px solid #DC262333', background: '#DC262311', cursor: 'pointer', flexShrink: 0 }}>
                  <IconLogout size={15}/>
                </button>
              </div>
            </div>
          </div>

          {/* Sticky header */}
          {ongletPrincipal === 'commandes' && (
            <div className="sticky-header">
              {/* Stats */}
              <div className="stats-grid">
                {statsCards.map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '0.5rem 0.75rem', border: `1.5px solid ${s.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      {s.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block', animation: 'pulse 1.5s ease infinite', flexShrink: 0 }}/>}
                      <p style={{ fontSize: '0.58rem', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</p>
                    </div>
                    <p style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, letterSpacing: '-1px', lineHeight: 1 }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Sélecteur jours */}
              {joursDispos.length > 0 && (
                <div className="jours-wrap">
                  {joursDispos.map(jour => {
                    const actif = jour === jourActif
                    const nbCmds = commandes.filter(c => dateKey(c.date_commande || c.created_at) === jour).length
                    const nbActives = commandes.filter(c => dateKey(c.date_commande || c.created_at) === jour && ['en_attente','en_preparation','pret'].includes(c.statut)).length
                    return (
                      <button key={jour} className="pill" onClick={() => setJourSelectionne(jour)}
                        style={{ borderColor: actif ? T.main : `${T.main}28`, background: actif ? T.main : '#fff', color: actif ? '#fff' : T.ink, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {dateLabel(jour + 'T00:00:00')}
                        {nbActives > 0 && (
                          <span style={{ background: actif ? 'rgba(255,255,255,0.3)' : '#DC2626', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100 }}>{nbActives}</span>
                        )}
                        {nbActives === 0 && nbCmds > 0 && (
                          <span style={{ background: actif ? 'rgba(255,255,255,0.2)' : T.pale, color: actif ? '#fff' : T.main, fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100 }}>{nbCmds}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Filtres statut */}
              <div className="filtres-wrap">
                {filtresStatut.map(f => (
                  <button key={f.key} className="pill" onClick={() => setFiltreStatut(f.key)}
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
                      <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: [T.light, T.mid, T.main][i], animation: `dotPulse 0.8s ease-in-out ${i*0.2}s infinite alternate` }}/>
                    ))}
                  </div>
                )}
                {!loading && commandesFiltrees.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
                    <p style={{ fontWeight: 800, color: T.ink, marginBottom: 4 }}>Aucune commande ici</p>
                    <p style={{ fontSize: '0.875rem', color: T.muted }}>
                      {filtreStatut === 'actives' ? 'Toutes les commandes sont traitées !' : 'Rien dans ce filtre pour ce jour.'}
                    </p>
                  </div>
                )}
                <div className="commandes-grid">
                  {commandesFiltrees.map(commande => (
                    <CarteCommande
                      key={commande.id}
                      commande={commande}
                      numero={getNumeroJour(commandes, commande.id, jourActif)}
                      onChangerStatut={changerStatut}
                    />
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