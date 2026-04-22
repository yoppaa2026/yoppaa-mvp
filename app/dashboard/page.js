'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import ConfigDashboard from './ConfigDashboard'

const T = {
  bg:         '#F8F6FF',
  bgCard:     '#FFFFFF',
  bgPanel:    '#160636',
  main:       '#6B35C4',
  mid:        '#9660E0',
  light:      '#C4A0F4',
  pale:       '#EDE0FF',
  ink:        '#1A0840',
  rouge:  { border: '#DC2626', badge: '#DC2626', cardBg: '#FFF0F0' },
  orange: { border: '#EA580C', badge: '#EA580C', cardBg: '#FFF7ED' },
  vert:   { border: '#16A34A', badge: '#16A34A', cardBg: '#F0FDF4' },
  bleu:   { border: '#2563EB', badge: '#2563EB', cardBg: '#EFF6FF' },
}

const STATUTS = {
  'en_attente':     { label: 'Nouvelle',  couleur: T.rouge,  icon: '🔴', next: 'en_preparation', nextLabel: 'Démarrer' },
  'en_preparation': { label: 'En prépa',  couleur: T.orange, icon: '🟠', next: 'pret',            nextLabel: 'Marquer prêt' },
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

function CarteCommande({ commande, numero, onChangerStatut }) {
  const statut = STATUTS[commande.statut] || STATUTS['en_attente']
  const { couleur } = statut
  return (
    <div style={{ background: couleur.cardBg, border: `1.5px solid ${couleur.border}22`, borderLeft: `4px solid ${couleur.border}`, borderRadius: 14, padding: '1rem 1.25rem', boxShadow: `0 2px 8px ${couleur.border}11`, transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${couleur.border}22` }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 8px ${couleur.border}11` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: couleur.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1rem', color: '#fff', flexShrink: 0 }}>#{numero}</div>
          <div>
            <p style={{ fontWeight: 800, color: T.ink, margin: 0, fontSize: '0.95rem' }}>{commande.client_nom}</p>
            <p style={{ fontSize: '0.78rem', color: couleur.border, margin: 0, fontWeight: 600 }}>
              {commande.creneau ? `🕐 ${commande.creneau.heure_debut.slice(0,5)} – ${commande.creneau.heure_fin.slice(0,5)}` : 'Créneau non défini'}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontWeight: 900, color: T.ink, margin: '0 0 4px', fontSize: '1rem' }}>{Number(commande.total).toFixed(2)}€</p>
          <span style={{ background: couleur.badge, color: '#fff', fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 100, textTransform: 'uppercase' }}>{statut.icon} {statut.label}</span>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${couleur.border}18`, paddingTop: '0.6rem', marginBottom: '0.6rem' }}>
        {commande.commande_articles?.map(ligne => (
          <div key={ligne.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', color: '#4B5563', marginBottom: 3 }}>
            <span style={{ fontWeight: 600 }}>{ligne.quantite}× {ligne.article?.nom}</span>
            <span style={{ fontWeight: 700, color: T.ink }}>{(ligne.quantite * ligne.prix_unitaire).toFixed(2)}€</span>
          </div>
        ))}
      </div>
      {statut.next && (
        <button onClick={() => onChangerStatut(commande.id, statut.next)}
          style={{ width: '100%', padding: '0.6rem', background: couleur.border, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.84rem', transition: 'opacity 0.15s', fontFamily: '"DM Sans", sans-serif' }}
          onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
          onMouseOut={e => e.currentTarget.style.opacity = '1'}>
          {statut.nextLabel} →
        </button>
      )}
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
      // Si un seul commerce → sélection auto, sinon → afficher le sélecteur
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
    { key: 'actives',        label: 'Actives',       count: stats.nouvelles + stats.enPrepa + stats.pretes },
    { key: 'en_attente',     label: '🔴 Nouvelles',  count: stats.nouvelles },
    { key: 'en_preparation', label: '🟠 En prépa',   count: stats.enPrepa },
    { key: 'pret',           label: '🟢 Prêtes',     count: stats.pretes },
    { key: 'recupere',       label: '🔵 Récupérées', count: stats.recuperees },
    { key: 'tout',           label: 'Tout',           count: duJour.length },
  ]

  const navItems = [
    { key: 'commandes', label: 'Commandes', icon: '📋' },
    { key: 'config',    label: 'Config',    icon: '⚙️' },
  ]

  // Données pour le sticky header
  const statsData = [
    { label: 'Nouvelles',  value: stats.nouvelles, color: '#DC2626', bg: '#FFF0F0', border: '#DC262620' },
    { label: 'En prépa',   value: stats.enPrepa,   color: '#EA580C', bg: '#FFF7ED', border: '#EA580C20' },
    { label: 'Prêtes',     value: stats.pretes,    color: '#16A34A', bg: '#F0FDF4', border: '#16A34A20' },
    { label: 'CA du jour', value: `${stats.ca.toFixed(2)}€`, color: T.main, bg: T.pale, border: `${T.main}20` },
  ]

  // Sélecteur de commerce si plusieurs liés au compte
  if (listeCommercants.length > 0 && !commercant) return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg, #160636, #2D0F6B)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <p style={{ fontWeight: 900, fontSize: '2rem', letterSpacing: '-2px', color: '#fff', marginBottom: 4 }}>yoppaa</p>
          <p style={{ color: T.light, fontSize: '0.82rem', fontWeight: 600 }}>Choisir un commerce</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listeCommercants.map(c => (
            <button key={c.id} onClick={() => { setCommercant(c); setListeCommercants([]); chargerCommandes(c.id) }}
              style={{ padding: '1rem 1.25rem', borderRadius: 14, border: `1.5px solid ${T.main}44`, background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1rem', textAlign: 'left', transition: 'all 0.15s' }}
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
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: ${T.bgPanel}; }
        ::-webkit-scrollbar-thumb { background: ${T.main}66; border-radius: 3px; }

        .layout { display: flex; height: 100vh; overflow: hidden; }

        /* ── Sidebar dark — PC ≥ 1100px ── */
        .sidebar {
          width: 200px;
          flex-shrink: 0;
          background: ${T.bgPanel};
          border-right: 1px solid ${T.main}33;
          padding: 1.25rem 0.875rem;
          display: none;
          flex-direction: column;
          height: 100vh;
          overflow-y: auto;
        }

        /* ── Topbar — mobile/tablette ── */
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: ${T.bgPanel};
          border-bottom: 1px solid ${T.main}33;
          flex-shrink: 0;
        }

        /* ── Zone contenu scrollable ── */
        .content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          height: 100vh;
          overflow: hidden;
        }

        /* ── Sticky header (stats + filtres) ── */
        .sticky-header {
          flex-shrink: 0;
          background: ${T.bg};
          border-bottom: 1px solid ${T.pale};
          padding: 0.875rem 1rem;
          z-index: 10;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
          margin-bottom: 0.75rem;
        }

        .filtres-wrap {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }

        /* ── Zone cartes scrollable ── */
        .scroll-zone {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          padding-bottom: 80px;
        }

        .commandes-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }

        .filtre-btn {
          padding: 0.3rem 0.7rem;
          border-radius: 100px;
          border: 1.5px solid;
          font-weight: 700;
          font-size: 0.72rem;
          cursor: pointer;
          font-family: "DM Sans", sans-serif;
          transition: all 0.15s;
          white-space: nowrap;
        }

        .nav-bottom {
          display: flex;
          flex-shrink: 0;
          background: ${T.bgPanel};
          border-top: 1px solid ${T.main}33;
          z-index: 100;
          padding: 0.5rem;
          gap: 4px;
        }

        .nav-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 0.5rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-family: "DM Sans", sans-serif;
          font-weight: 700;
          font-size: 0.7rem;
          transition: all 0.15s;
          background: transparent;
          color: ${T.light};
          position: relative;
        }

        /* ── Tablette 600–1099px ── */
        @media (min-width: 600px) {
          .commandes-grid { grid-template-columns: repeat(2, 1fr); }
          .stats-grid { grid-template-columns: repeat(4, 1fr); gap: 8px; }
          .sticky-header { padding: 1rem 1.5rem; }
          .scroll-zone { padding: 1.25rem; padding-bottom: 80px; }
        }

        /* Nav bottom cachée — navigation dans le header */
        .nav-bottom { display: none !important; }
        .scroll-zone { padding-bottom: 1rem !important; }

        /* ── PC >= 1100px ── */
        @media (min-width: 1100px) {
          .sidebar { display: flex !important; }
          .topbar { display: none !important; }
          .scroll-zone { padding: 1.5rem !important; }
          .sticky-header { padding: 1rem 1.5rem; }
          .commandes-grid { grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
          .stats-grid { grid-template-columns: repeat(4, 1fr); gap: 8px; }
        }

        @keyframes slideDown { from { transform: translateY(-100%) } to { transform: translateY(0) } }
      `}</style>

      {/* Bannière nouvelle commande */}
      {nouvelleCommande && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', padding: '0.875rem', textAlign: 'center', fontWeight: 800, fontSize: '1rem', boxShadow: `0 4px 30px ${T.main}88`, animation: 'slideDown 0.3s ease' }}>
          🔔 Nouvelle commande reçue !
        </div>
      )}

      <div className="layout">

        {/* ── Sidebar dark — PC ── */}
        <aside className="sidebar">
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
              {[0.4, 1, 1].map((op, i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? '#fff' : i === 1 ? T.light : T.mid, opacity: op }}/>
              ))}
            </div>
            <p style={{ fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-2px', color: '#fff', marginBottom: 2 }}>yoppaa</p>
            <p style={{ fontSize: '0.72rem', color: T.light, fontWeight: 600 }}>{commercant?.nom}</p>
          </div>

          <nav style={{ flex: 1 }}>
            {navItems.map(item => (
              <button key={item.key} onClick={() => setOngletPrincipal(item.key)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.7rem 0.875rem', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 4, fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.875rem', transition: 'all 0.15s', background: ongletPrincipal === item.key ? `${T.main}33` : 'transparent', color: ongletPrincipal === item.key ? '#fff' : T.light, borderLeft: `3px solid ${ongletPrincipal === item.key ? T.main : 'transparent'}` }}>
                {item.icon} {item.label}
                {item.key === 'commandes' && stats.nouvelles > 0 && (
                  <span style={{ marginLeft: 'auto', background: '#DC2626', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: 100 }}>{stats.nouvelles}</span>
                )}
              </button>
            ))}
          </nav>

          <div style={{ margin: '1rem 0', padding: '0.875rem', background: `${T.main}18`, borderRadius: 10, border: `1px solid ${T.main}33` }}>
            <p style={{ fontSize: '0.6rem', color: T.light, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Aujourd'hui</p>
            {[
              { label: 'CA', value: `${stats.ca.toFixed(2)}€`, color: T.mid },
              { label: 'Total', value: duJour.length, color: '#fff' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.75rem', color: T.light }}>{s.label}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={activerNotifications} style={{ padding: '0.55rem', borderRadius: 8, border: `1px solid ${T.main}44`, background: notificationsActives ? `${T.main}22` : 'transparent', color: T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem' }}>
              {notificationsActives ? '🔔 Alertes actives' : '🔕 Alertes off'}
            </button>
            <button onClick={seDeconnecter} style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid #DC262633', background: '#DC262611', color: '#FCA5A5', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem' }}>
              Déconnexion
            </button>
          </div>
        </aside>

        {/* ── Zone contenu ── */}
        <div className="content-area">

          {/* Topbar mobile/tablette */}
          <div className="topbar">
            {/* Logo */}
            <div style={{ flexShrink: 0 }}>
              <p style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-1px', color: '#fff', margin: 0 }}>yoppaa</p>
              <p style={{ color: T.light, fontWeight: 600, fontSize: '0.7rem', margin: 0 }}>{commercant?.nom}</p>
            </div>

            {/* Boutons nav — centre */}
            <div style={{ display: 'flex', gap: 4, background: `${T.main}22`, borderRadius: 10, padding: 3 }}>
              {navItems.map(item => (
                <button key={item.key} onClick={() => setOngletPrincipal(item.key)}
                  style={{ padding: '0.3rem 0.75rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.75rem', transition: 'all 0.15s', background: ongletPrincipal === item.key ? T.main : 'transparent', color: ongletPrincipal === item.key ? '#fff' : T.light, position: 'relative' }}>
                  {item.icon} {item.label}
                  {item.key === 'commandes' && stats.nouvelles > 0 && (
                    <span style={{ position: 'absolute', top: -4, right: -4, background: '#DC2626', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '1px 4px', borderRadius: 100 }}>{stats.nouvelles}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Actions droite */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={activerNotifications} style={{ padding: '0.35rem 0.6rem', borderRadius: 8, border: `1px solid ${T.main}44`, background: notificationsActives ? `${T.main}22` : 'transparent', color: T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem' }}>
                {notificationsActives ? '🔔' : '🔕'}
              </button>
              <button onClick={seDeconnecter} style={{ padding: '0.35rem 0.6rem', borderRadius: 8, border: '1px solid #DC262633', background: '#DC262611', color: '#FCA5A5', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem' }}>
                ⏻
              </button>
            </div>
          </div>

          {/* ── STICKY HEADER — stats + filtres ── */}
          {ongletPrincipal === 'commandes' && (
            <div className="sticky-header">
              {/* Stats */}
              <div className="stats-grid">
                {statsData.map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 10, padding: '0.6rem 0.875rem', border: `1.5px solid ${s.border}` }}>
                    <p style={{ fontSize: '0.6rem', color: '#6B7280', marginBottom: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</p>
                    <p style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, letterSpacing: '-1px' }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Filtres */}
              <div className="filtres-wrap">
                {filtres.map(f => (
                  <button key={f.key} className="filtre-btn" onClick={() => setFiltreStatut(f.key)}
                    style={{ borderColor: filtreStatut === f.key ? T.main : `${T.main}33`, background: filtreStatut === f.key ? T.main : '#fff', color: filtreStatut === f.key ? '#fff' : T.ink }}>
                    {f.label}{f.count > 0 ? ` (${f.count})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Zone scrollable — cartes commandes ── */}
          <div className="scroll-zone">

            {ongletPrincipal === 'commandes' && (
              <>
                {loading && <p style={{ color: '#6B7280', textAlign: 'center', padding: '3rem' }}>Chargement...</p>}
                {!loading && commandesFiltrees.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                    <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎉</p>
                    <p style={{ fontWeight: 700, color: '#6B7280' }}>Aucune commande ici</p>
                  </div>
                )}
                <div className="commandes-grid">
                  {commandesFiltrees.map(commande => (
                    <CarteCommande key={commande.id} commande={commande} numero={getNumeroJour(commandes, commande.id)} onChangerStatut={changerStatut} />
                  ))}
                </div>
              </>
            )}

            {ongletPrincipal === 'config' && commercant && (
              <ConfigDashboard commercantId={commercant.id} />
            )}
          </div>

          {/* Nav bottom — mobile/tablette */}
          <nav className="nav-bottom">
            {navItems.map(item => (
              <button key={item.key} className="nav-btn" onClick={() => setOngletPrincipal(item.key)}
                style={{ background: ongletPrincipal === item.key ? `${T.main}33` : 'transparent', color: ongletPrincipal === item.key ? '#fff' : T.light }}>
                <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                {item.label}
                {item.key === 'commandes' && stats.nouvelles > 0 && (
                  <span style={{ position: 'absolute', top: 4, right: 'calc(50% - 18px)', background: '#DC2626', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100 }}>{stats.nouvelles}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}