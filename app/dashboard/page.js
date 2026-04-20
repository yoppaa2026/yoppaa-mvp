'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import ConfigDashboard from './ConfigDashboard'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  // Fonds
  bg:      '#0D0520',
  bgCard:  '#1A0840',
  bgPanel: '#160636',
  // Violets
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  // Statuts
  rouge:   { bg: '#2D0A0A', border: '#DC2626', text: '#FCA5A5', badge: '#DC2626' },
  orange:  { bg: '#2D1A0A', border: '#EA580C', text: '#FED7AA', badge: '#EA580C' },
  vert:    { bg: '#0A2D1A', border: '#16A34A', text: '#86EFAC', badge: '#16A34A' },
  bleu:    { bg: '#0A1A2D', border: '#2563EB', text: '#93C5FD', badge: '#2563EB' },
}

const STATUTS = {
  'en_attente':    { label: 'Nouvelle', couleur: T.rouge,  icon: '🔴', next: 'en_preparation', nextLabel: 'Démarrer' },
  'en_preparation':{ label: 'En prépa', couleur: T.orange, icon: '🟠', next: 'pret',           nextLabel: 'Marquer prêt' },
  'pret':          { label: 'Prête',    couleur: T.vert,   icon: '🟢', next: null,              nextLabel: null },
  'recupere':      { label: 'Récupérée',couleur: T.bleu,   icon: '🔵', next: null,              nextLabel: null },
}

// ─── Numéro journalier ────────────────────────────────────────────────────────
function getNumeroJour(commandes, commandeId) {
  const aujourd_hui = new Date().toDateString()
  const duJour = [...commandes]
    .filter(c => new Date(c.created_at).toDateString() === aujourd_hui)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const idx = duJour.findIndex(c => c.id === commandeId)
  return idx === -1 ? null : idx + 1
}

// ─── Sons ─────────────────────────────────────────────────────────────────────
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

// ─── Composant carte commande ─────────────────────────────────────────────────
function CarteCommande({ commande, numero, onChangerStatut }) {
  const statut = STATUTS[commande.statut] || STATUTS['en_attente']
  const { couleur } = statut

  return (
    <div style={{
      background: couleur.bg,
      border: `1.5px solid ${couleur.border}`,
      borderRadius: 14,
      padding: '1rem 1.25rem',
      marginBottom: '0.75rem',
      transition: 'transform 0.15s, box-shadow 0.15s',
      boxShadow: `0 0 20px ${couleur.border}22`,
    }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 30px ${couleur.border}44` }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 0 20px ${couleur.border}22` }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Numéro */}
          <div style={{ width: 40, height: 40, borderRadius: 10, background: couleur.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.1rem', color: '#fff', flexShrink: 0 }}>
            #{numero}
          </div>
          <div>
            <p style={{ fontWeight: 800, color: '#fff', margin: 0, fontSize: '1rem', letterSpacing: '-0.5px' }}>{commande.client_nom}</p>
            <p style={{ fontSize: '0.8rem', color: couleur.text, margin: 0, fontWeight: 600 }}>
              {commande.creneau ? `🕐 ${commande.creneau.heure_debut.slice(0,5)} – ${commande.creneau.heure_fin.slice(0,5)}` : 'Créneau non défini'}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontWeight: 900, color: '#fff', margin: '0 0 4px', fontSize: '1.1rem' }}>{Number(commande.total).toFixed(2)}€</p>
          <span style={{ background: couleur.badge, color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '3px 10px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {statut.icon} {statut.label}
          </span>
        </div>
      </div>

      {/* Articles */}
      <div style={{ borderTop: `1px solid ${couleur.border}44`, paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
        {commande.commande_articles?.map(ligne => (
          <div key={ligne.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: couleur.text, marginBottom: 3 }}>
            <span style={{ fontWeight: 600 }}>{ligne.quantite}× {ligne.article?.nom}</span>
            <span style={{ fontWeight: 700, color: '#fff' }}>{(ligne.quantite * ligne.prix_unitaire).toFixed(2)}€</span>
          </div>
        ))}
      </div>

      {/* Action */}
      {statut.next && (
        <button
          onClick={() => onChangerStatut(commande.id, statut.next)}
          style={{ width: '100%', padding: '0.65rem', background: couleur.border, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.875rem', letterSpacing: '-0.3px', transition: 'opacity 0.15s' }}
          onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
          onMouseOut={e => e.currentTarget.style.opacity = '1'}
        >
          {statut.nextLabel} →
        </button>
      )}
    </div>
  )
}

// ─── Dashboard principal ──────────────────────────────────────────────────────
export default function Dashboard() {
  const [commandes, setCommandes] = useState([])
  const [commercant, setCommercant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ongletPrincipal, setOngletPrincipal] = useState('commandes')
  const [filtreStatut, setFiltreStatut] = useState('actives')
  const [notificationsActives, setNotificationsActives] = useState(false)
  const [nouvelleCommande, setNouvelleCommande] = useState(false)
  const [sidebarOuverte, setSidebarOuverte] = useState(false)
  const router = useRouter()

  const trierCommandes = (data) =>
    (data || []).sort((a, b) => {
      const heureA = a.creneau?.heure_debut || ''
      const heureB = b.creneau?.heure_debut || ''
      return heureA.localeCompare(heureB)
    })

  const chargerCommandes = useCallback(async (commercantId) => {
    const { data } = await supabase
      .from('commandes')
      .select(`*, creneau:creneaux(*), commande_articles(*, article:articles(*))`)
      .eq('commercant_id', commercantId)
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
      const saved = localStorage.getItem('notifs')
      if (saved === 'true') setNotificationsActives(true)
    }
  }, [])

  // Polling 5s
  useEffect(() => {
    if (!commercant) return
    let dernierNombre = 0
    const intervalle = setInterval(async () => {
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
    return () => clearInterval(intervalle)
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

  // Stats
  const aujourd_hui = new Date().toDateString()
  const duJour = commandes.filter(c => new Date(c.created_at).toDateString() === aujourd_hui)
  const stats = {
    nouvelles:    commandes.filter(c => c.statut === 'en_attente').length,
    enPrepa:      commandes.filter(c => c.statut === 'en_preparation').length,
    pretes:       commandes.filter(c => c.statut === 'pret').length,
    recuperees:   duJour.filter(c => c.statut === 'recupere').length,
    ca:           duJour.reduce((acc, c) => acc + Number(c.total), 0),
    total:        duJour.length,
  }

  // Filtres
  const commandesFiltrees = commandes.filter(c => {
    if (filtreStatut === 'actives') return ['en_attente', 'en_preparation', 'pret'].includes(c.statut)
    if (filtreStatut === 'en_attente') return c.statut === 'en_attente'
    if (filtreStatut === 'en_preparation') return c.statut === 'en_preparation'
    if (filtreStatut === 'pret') return c.statut === 'pret'
    if (filtreStatut === 'recupere') return c.statut === 'recupere'
    return true
  })

  const filtres = [
    { key: 'actives',        label: 'Actives',   count: stats.nouvelles + stats.enPrepa + stats.pretes },
    { key: 'en_attente',     label: '🔴 Nouvelles', count: stats.nouvelles },
    { key: 'en_preparation', label: '🟠 En prépa',  count: stats.enPrepa },
    { key: 'pret',           label: '🟢 Prêtes',    count: stats.pretes },
    { key: 'recupere',       label: '🔵 Récupérées',count: stats.recuperees },
    { key: 'tout',           label: 'Tout',      count: duJour.length },
  ]

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: '"DM Sans", sans-serif', color: '#fff' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {/* ── Bannière nouvelle commande ── */}
      {nouvelleCommande && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', padding: '1rem', textAlign: 'center', fontWeight: 800, fontSize: '1rem', boxShadow: `0 4px 30px ${T.main}88`, animation: 'slideDown 0.3s ease' }}>
          <style>{`@keyframes slideDown { from { transform: translateY(-100%) } to { transform: translateY(0) } }`}</style>
          🔔 Nouvelle commande !
        </div>
      )}

      {/* ── Layout principal ── */}
      <div style={{ display: 'flex', minHeight: '100vh' }}>

        {/* ── Sidebar (PC/tablette) ── */}
        <aside style={{
          width: 240,
          background: T.bgPanel,
          borderRight: `1px solid ${T.main}33`,
          padding: '1.5rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
          className="sidebar-desktop"
        >
          {/* Logo */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
              {['#fff', T.light, T.mid].map((col, i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: col, opacity: i === 0 ? 0.4 : 1 }}/>
              ))}
            </div>
            <p style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '-2px', color: '#fff', margin: 0 }}>yoppaa</p>
            <p style={{ fontSize: '0.75rem', color: T.light, margin: 0, fontWeight: 600 }}>{commercant?.nom}</p>
          </div>

          {/* Nav principale */}
          <nav style={{ flex: 1 }}>
            {[
              { key: 'commandes', label: 'Commandes', icon: '📋' },
              { key: 'config',    label: 'Configuration', icon: '⚙️' },
            ].map(item => (
              <button key={item.key} onClick={() => setOngletPrincipal(item.key)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 4, fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.9rem', transition: 'all 0.15s',
                  background: ongletPrincipal === item.key ? `${T.main}33` : 'transparent',
                  color: ongletPrincipal === item.key ? '#fff' : T.light,
                  borderLeft: ongletPrincipal === item.key ? `3px solid ${T.main}` : '3px solid transparent',
                }}>
                <span>{item.icon}</span> {item.label}
              </button>
            ))}
          </nav>

          {/* Actions bas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={activerNotifications}
              style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: `1px solid ${T.main}44`, background: notificationsActives ? `${T.main}22` : 'transparent', color: notificationsActives ? T.light : T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.8rem' }}>
              {notificationsActives ? '🔔 Alertes actives' : '🔕 Alertes off'}
            </button>
            <button onClick={seDeconnecter}
              style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid #DC262633', background: '#DC262611', color: '#FCA5A5', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.8rem' }}>
              Déconnexion
            </button>
          </div>
        </aside>

        {/* ── Contenu principal ── */}
        <main style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', maxWidth: '100%' }}>

          {/* ── Header mobile ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}
            className="mobile-header">
            <div>
              <p style={{ fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-1px', color: '#fff', margin: 0 }}>yoppaa</p>
              <p style={{ color: T.light, fontWeight: 600, margin: 0, fontSize: '0.85rem' }}>{commercant?.nom}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={activerNotifications}
                style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: `1px solid ${T.main}44`, background: notificationsActives ? `${T.main}22` : 'transparent', color: T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem' }}>
                {notificationsActives ? '🔔' : '🔕'}
              </button>
              <button onClick={() => setOngletPrincipal(ongletPrincipal === 'commandes' ? 'config' : 'commandes')}
                style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: `1px solid ${T.main}44`, background: `${T.main}22`, color: T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem' }}>
                {ongletPrincipal === 'commandes' ? '⚙️' : '📋'}
              </button>
              <button onClick={seDeconnecter}
                style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #DC262633', background: '#DC262611', color: '#FCA5A5', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem' }}>
                ⏻
              </button>
            </div>
          </div>

          {/* ── PAGE COMMANDES ── */}
          {ongletPrincipal === 'commandes' && (
            <>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: '1.5rem' }}>
                {[
                  { label: 'Nouvelles', value: stats.nouvelles, color: T.rouge.badge },
                  { label: 'En prépa',  value: stats.enPrepa,   color: T.orange.badge },
                  { label: 'Prêtes',    value: stats.pretes,    color: T.vert.badge },
                  { label: 'CA du jour',value: `${stats.ca.toFixed(2)}€`, color: T.mid },
                ].map((s, i) => (
                  <div key={i} style={{ background: T.bgCard, borderRadius: 12, padding: '0.875rem 1rem', border: `1px solid ${s.color}33` }}>
                    <p style={{ fontSize: '0.7rem', color: T.light, margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</p>
                    <p style={{ fontSize: '1.6rem', fontWeight: 900, color: s.color, margin: 0, letterSpacing: '-1px' }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Filtres */}
              <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                {filtres.map(f => (
                  <button key={f.key} onClick={() => setFiltreStatut(f.key)}
                    style={{ padding: '0.4rem 0.875rem', borderRadius: 100, border: `1.5px solid ${filtreStatut === f.key ? T.main : T.main + '44'}`, background: filtreStatut === f.key ? T.main : 'transparent', color: filtreStatut === f.key ? '#fff' : T.light, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}>
                    {f.label} {f.count > 0 && <span style={{ background: 'rgba(255,255,255,0.2)', padding: '0 5px', borderRadius: 6, marginLeft: 3 }}>{f.count}</span>}
                  </button>
                ))}
              </div>

              {/* Commandes */}
              {loading && <p style={{ color: T.light, textAlign: 'center', padding: '3rem' }}>Chargement...</p>}

              {!loading && commandesFiltrees.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                  <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎉</p>
                  <p style={{ fontWeight: 700, color: T.light }}>Aucune commande ici</p>
                </div>
              )}

              {/* Layout 2 colonnes sur PC */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.75rem' }}>
                {commandesFiltrees.map(commande => (
                  <CarteCommande
                    key={commande.id}
                    commande={commande}
                    numero={getNumeroJour(commandes, commande.id) || '?'}
                    onChangerStatut={changerStatut}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── PAGE CONFIG ── */}
          {ongletPrincipal === 'config' && commercant && (
            <div style={{ maxWidth: 720 }}>
              <ConfigDashboard commercantId={commercant.id} />
            </div>
          )}
        </main>
      </div>

      {/* ── Responsive styles ── */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
        }
        @media (min-width: 769px) {
          .mobile-header { display: none !important; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${T.bgPanel}; }
        ::-webkit-scrollbar-thumb { background: ${T.main}66; border-radius: 3px; }
      `}</style>
    </div>
  )
}