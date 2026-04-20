'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import ConfigDashboard from './ConfigDashboard'

const T = {
  // Fond contenu — blanc légèrement lavande
  bg:      '#F8F6FF',
  bgCard:  '#FFFFFF',
  // Sidebar — dark violet
  bgPanel: '#160636',
  bgSideCard: '#1A0840',
  // Violets
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  // Statuts
  rouge:   { bg: '#FFF0F0', border: '#DC2626', text: '#DC2626', badge: '#DC2626', cardBg: '#FFF0F0' },
  orange:  { bg: '#FFF7ED', border: '#EA580C', text: '#EA580C', badge: '#EA580C', cardBg: '#FFF7ED' },
  vert:    { bg: '#F0FDF4', border: '#16A34A', text: '#16A34A', badge: '#16A34A', cardBg: '#F0FDF4' },
  bleu:    { bg: '#EFF6FF', border: '#2563EB', text: '#2563EB', badge: '#2563EB', cardBg: '#EFF6FF' },
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
    <div style={{ background: couleur.cardBg, border: `2px solid ${couleur.border}33`, borderLeft: `4px solid ${couleur.border}`, borderRadius: 14, padding: '1rem 1.25rem', boxShadow: `0 2px 12px ${couleur.border}11`, transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${couleur.border}22` }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 12px ${couleur.border}11` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: couleur.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.1rem', color: '#fff', flexShrink: 0 }}>#{numero}</div>
          <div>
            <p style={{ fontWeight: 800, color: T.ink, margin: 0, fontSize: '1rem', letterSpacing: '-0.5px' }}>{commande.client_nom}</p>
            <p style={{ fontSize: '0.8rem', color: couleur.text, margin: 0, fontWeight: 600 }}>
              {commande.creneau ? `🕐 ${commande.creneau.heure_debut.slice(0,5)} – ${commande.creneau.heure_fin.slice(0,5)}` : 'Créneau non défini'}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontWeight: 900, color: T.ink, margin: '0 0 4px', fontSize: '1.1rem' }}>{Number(commande.total).toFixed(2)}€</p>
          <span style={{ background: couleur.badge, color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '3px 10px', borderRadius: 100, textTransform: 'uppercase' }}>{statut.icon} {statut.label}</span>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${couleur.border}22`, paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
        {commande.commande_articles?.map(ligne => (
          <div key={ligne.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#4B5563', marginBottom: 3 }}>
            <span style={{ fontWeight: 600 }}>{ligne.quantite}× {ligne.article?.nom}</span>
            <span style={{ fontWeight: 700, color: T.ink }}>{(ligne.quantite * ligne.prix_unitaire).toFixed(2)}€</span>
          </div>
        ))}
      </div>
      {statut.next && (
        <button onClick={() => onChangerStatut(commande.id, statut.next)}
          style={{ width: '100%', padding: '0.65rem', background: couleur.border, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.875rem', transition: 'opacity 0.15s', fontFamily: '"DM Sans", sans-serif' }}
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
      const { data } = await supabase.from('commercants').select('*').eq('user_id', user.id).single()
      setCommercant(data)
      if (data) chargerCommandes(data.id)
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

  async function seDeconnecter() {
    await supabase.auth.signOut()
    router.push('/login')
  }

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
    { key: 'actives',         label: 'Actives',       count: stats.nouvelles + stats.enPrepa + stats.pretes },
    { key: 'en_attente',      label: '🔴 Nouvelles',  count: stats.nouvelles },
    { key: 'en_preparation',  label: '🟠 En prépa',   count: stats.enPrepa },
    { key: 'pret',            label: '🟢 Prêtes',     count: stats.pretes },
    { key: 'recupere',        label: '🔵 Récupérées', count: stats.recuperees },
    { key: 'tout',            label: 'Tout',           count: duJour.length },
  ]

  const navItems = [
    { key: 'commandes', label: 'Commandes', icon: '📋' },
    { key: 'config',    label: 'Config',    icon: '⚙️' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: ${T.bgPanel}; }
        ::-webkit-scrollbar-thumb { background: ${T.main}66; border-radius: 3px; }
        .layout { display: flex; min-height: 100vh; }

        /* Sidebar dark — PC uniquement */
        .sidebar {
          width: 220px;
          background: ${T.bgPanel};
          border-right: 1px solid ${T.main}33;
          padding: 1.5rem 1rem;
          display: none;
          flex-direction: column;
          flex-shrink: 0;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
        }

        /* Topbar — tablette/mobile */
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.25rem;
          padding: 0.875rem 1rem;
          background: ${T.bgPanel};
          border-bottom: 1px solid ${T.main}33;
        }

        /* Nav bottom — tablette/mobile */
        .nav-bottom {
          display: flex;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: ${T.bgPanel};
          border-top: 1px solid ${T.main}33;
          z-index: 100;
          padding: 0.5rem;
          gap: 4px;
        }

        .main-content {
          flex: 1;
          padding: 1rem;
          overflow-y: auto;
          padding-bottom: 80px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 1.25rem;
        }

        .commandes-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }

        .filtres-wrap {
          display: flex;
          gap: 5px;
          margin-bottom: 1.25rem;
          flex-wrap: wrap;
        }

        .filtre-btn {
          padding: 0.35rem 0.75rem;
          border-radius: 100px;
          border: 1.5px solid;
          font-weight: 700;
          font-size: 0.75rem;
          cursor: pointer;
          font-family: "DM Sans", sans-serif;
          transition: all 0.15s;
          white-space: nowrap;
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
        }

        /* Tablette 600–1099px */
        @media (min-width: 600px) {
          .commandes-grid { grid-template-columns: repeat(2, 1fr); }
          .stats-grid { grid-template-columns: repeat(4, 1fr); }
          .main-content { padding: 1.25rem; padding-bottom: 80px; }
          .topbar { padding: 1rem 1.5rem; }
        }

        /* PC ≥ 1100px */
        @media (min-width: 1100px) {
          .sidebar { display: flex !important; }
          .topbar { display: none !important; }
          .nav-bottom { display: none !important; }
          .main-content { padding: 2rem !important; padding-bottom: 2rem !important; }
          .commandes-grid { grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)) !important; }
          .stats-grid { grid-template-columns: repeat(4, 1fr) !important; }
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

        {/* ── Sidebar dark violet — PC ── */}
        <aside className="sidebar">
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
              {[0.4, 1, 1].map((op, i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i === 0 ? '#fff' : i === 1 ? T.light : T.mid, opacity: op }}/>
              ))}
            </div>
            <p style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '-2px', color: '#fff', marginBottom: 2 }}>yoppaa</p>
            <p style={{ fontSize: '0.75rem', color: T.light, fontWeight: 600 }}>{commercant?.nom}</p>
          </div>

          <nav style={{ flex: 1 }}>
            {navItems.map(item => (
              <button key={item.key} onClick={() => setOngletPrincipal(item.key)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 4, fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.9rem', transition: 'all 0.15s', background: ongletPrincipal === item.key ? `${T.main}33` : 'transparent', color: ongletPrincipal === item.key ? '#fff' : T.light, borderLeft: `3px solid ${ongletPrincipal === item.key ? T.main : 'transparent'}` }}>
                {item.icon} {item.label}
                {item.key === 'commandes' && stats.nouvelles > 0 && (
                  <span style={{ marginLeft: 'auto', background: '#DC2626', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>{stats.nouvelles}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Stats mini dans sidebar */}
          <div style={{ margin: '1rem 0', padding: '1rem', background: `${T.main}22`, borderRadius: 12, border: `1px solid ${T.main}33` }}>
            <p style={{ fontSize: '0.65rem', color: T.light, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Aujourd'hui</p>
            {[
              { label: 'CA', value: `${stats.ca.toFixed(2)}€`, color: T.mid },
              { label: 'Commandes', value: duJour.length, color: '#fff' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.78rem', color: T.light }}>{s.label}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={activerNotifications} style={{ padding: '0.6rem', borderRadius: 8, border: `1px solid ${T.main}44`, background: notificationsActives ? `${T.main}22` : 'transparent', color: T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.8rem' }}>
              {notificationsActives ? '🔔 Alertes actives' : '🔕 Alertes off'}
            </button>
            <button onClick={seDeconnecter} style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid #DC262633', background: '#DC262611', color: '#FCA5A5', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.8rem' }}>
              Déconnexion
            </button>
          </div>
        </aside>

        {/* ── Zone contenu fond clair ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Topbar mobile/tablette dark */}
          <div className="topbar">
            <div>
              <p style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-1px', color: '#fff' }}>yoppaa</p>
              <p style={{ color: T.light, fontWeight: 600, fontSize: '0.78rem' }}>{commercant?.nom}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={activerNotifications} style={{ padding: '0.4rem 0.75rem', borderRadius: 8, border: `1px solid ${T.main}44`, background: notificationsActives ? `${T.main}22` : 'transparent', color: T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.8rem' }}>
                {notificationsActives ? '🔔' : '🔕'}
              </button>
              <button onClick={seDeconnecter} style={{ padding: '0.4rem 0.75rem', borderRadius: 8, border: '1px solid #DC262633', background: '#DC262611', color: '#FCA5A5', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.8rem' }}>
                ⏻
              </button>
            </div>
          </div>

          {/* Contenu principal — fond blanc/lavande */}
          <main className="main-content" style={{ background: T.bg }}>

            {/* ── Commandes ── */}
            {ongletPrincipal === 'commandes' && (
              <>
                {/* Stats */}
                <div className="stats-grid">
                  {[
                    { label: 'Nouvelles',  value: stats.nouvelles, color: '#DC2626', bg: '#FFF0F0', border: '#DC262622' },
                    { label: 'En prépa',   value: stats.enPrepa,   color: '#EA580C', bg: '#FFF7ED', border: '#EA580C22' },
                    { label: 'Prêtes',     value: stats.pretes,    color: '#16A34A', bg: '#F0FDF4', border: '#16A34A22' },
                    { label: 'CA du jour', value: `${stats.ca.toFixed(2)}€`, color: T.main, bg: T.pale, border: `${T.main}22` },
                  ].map((s, i) => (
                    <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '0.875rem 1rem', border: `1.5px solid ${s.border}` }}>
                      <p style={{ fontSize: '0.65rem', color: '#6B7280', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</p>
                      <p style={{ fontSize: '1.6rem', fontWeight: 900, color: s.color, letterSpacing: '-1px' }}>{s.value}</p>
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

            {/* ── Config ── */}
            {ongletPrincipal === 'config' && commercant && (
              <ConfigDashboard commercantId={commercant.id} />
            )}
          </main>

          {/* Nav bottom dark — mobile/tablette */}
          <nav className="nav-bottom">
            {navItems.map(item => (
              <button key={item.key} className="nav-btn" onClick={() => setOngletPrincipal(item.key)}
                style={{ background: ongletPrincipal === item.key ? `${T.main}33` : 'transparent', color: ongletPrincipal === item.key ? '#fff' : T.light, position: 'relative' }}>
                <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                {item.label}
                {item.key === 'commandes' && stats.nouvelles > 0 && (
                  <span style={{ position: 'absolute', top: 4, right: 'calc(50% - 20px)', background: '#DC2626', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100 }}>{stats.nouvelles}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}