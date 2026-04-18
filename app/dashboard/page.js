'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const [commandes, setCommandes] = useState([])
  const [commercant, setCommercant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [onglet, setOnglet] = useState('aujourd_hui')
  const [notificationsActives, setNotificationsActives] = useState(false)

  useEffect(() => {
    chargerCommercant()
  }, [])

  useEffect(() => {
    if (!commercant) return

    const canal = supabase
      .channel('commandes-temps-reel')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'commandes', filter: `commercant_id=eq.${commercant.id}` },
        (payload) => {
          chargerCommandes(commercant.id)
          jouerSon()
        }
      )
      .subscribe()

    return () => supabase.removeChannel(canal)
  }, [commercant])

  function jouerSon() {
    if (!notificationsActives) return
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.frequency.setValueAtTime(880, ctx.currentTime)
    oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.3)
  }
  }

  async function chargerCommercant() {
    const { data } = await supabase.from('commercants').select('*').limit(1).single()
    setCommercant(data)
    if (data) chargerCommandes(data.id)
  }

  async function chargerCommandes(commercantId) {
    const { data } = await supabase
      .from('commandes')
      .select(`*, creneau:creneaux(*), commande_articles(*, article:articles(*))`)
      .eq('commercant_id', commercantId)
      .order('creneau_id', { ascending: true })
    const triees = (data || []).sort((a, b) => {
  const heureA = a.creneau?.heure_debut || ''
  const heureB = b.creneau?.heure_debut || ''
  return heureA.localeCompare(heureB)
})
setCommandes(triees)
    setLoading(false)
  }

  async function changerStatut(commandeId, statut) {
    await supabase.from('commandes').update({ statut }).eq('id', commandeId)
    setCommandes(prev => prev.map(c => c.id === commandeId ? { ...c, statut } : c))
  }

  const couleurStatut = {
    'en_attente': { bg: '#FFF3CD', color: '#856404', label: 'En attente' },
    'en_preparation': { bg: '#CCE5FF', color: '#004085', label: 'En préparation' },
    'pret': { bg: '#D4EDDA', color: '#155724', label: 'Prêt' },
    'recupere': { bg: '#E2E3E5', color: '#383d41', label: 'Récupéré' }
  }

  const commandesFiltrees = commandes.filter(c => {
    if (onglet === 'aujourd_hui') {
      const aujourd_hui = new Date().toDateString()
      return new Date(c.created_at).toDateString() === aujourd_hui
    }
    if (onglet === 'en_attente') return c.statut === 'en_attente'
    if (onglet === 'pret') return c.statut === 'pret'
    return true
  })

  const stats = {
    total: commandes.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length,
    en_attente: commandes.filter(c => c.statut === 'en_attente').length,
    en_preparation: commandes.filter(c => c.statut === 'en_preparation').length,
    pret: commandes.filter(c => c.statut === 'pret').length,
    chiffre: commandes.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).reduce((acc, c) => acc + Number(c.total), 0)
  }

  return (
    <main style={{ fontFamily: 'DM Sans, sans-serif', maxWidth: 700, margin: '0 auto', padding: '1.5rem 1rem' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-1px', color: '#6B35C4', margin: 0 }}>yoppaa</h1>
          <p style={{ color: '#1A0840', fontWeight: 700, margin: 0 }}>{commercant?.nom}</p>
        </div>
        <div onClick={() => setNotificationsActives(true)}
  style={{ background: notificationsActives ? '#D4EDDA' : '#EDE0FF', borderRadius: 100, padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: notificationsActives ? '#155724' : '#6B35C4', cursor: 'pointer' }}>
  {notificationsActives ? '🔔 Actif' : '🔕 Activer alertes'}
</div>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: '1.5rem' }}>
        {[
          { label: "Aujourd'hui", value: stats.total, color: '#6B35C4' },
          { label: 'En attente', value: stats.en_attente, color: '#856404' },
          { label: 'En prépa', value: stats.en_preparation, color: '#004085' },
          { label: 'CA du jour', value: `${stats.chiffre.toFixed(2)}€`, color: '#155724' }
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', border: '1.5px solid #EDE0FF', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.7rem', color: '#9660E0', margin: '0 0 4px', fontWeight: 500 }}>{s.label}</p>
            <p style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ONGLETS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        {[
          { key: 'aujourd_hui', label: "Aujourd'hui" },
          { key: 'en_attente', label: 'En attente' },
          { key: 'pret', label: 'Prêts' },
          { key: 'tout', label: 'Tout' }
        ].map(o => (
          <button key={o.key} onClick={() => setOnglet(o.key)}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 100, border: '1.5px solid #6B35C4', background: onglet === o.key ? '#6B35C4' : '#fff', color: onglet === o.key ? '#fff' : '#6B35C4', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
            {o.label}
          </button>
        ))}
      </div>

      {/* COMMANDES */}
      {loading && <p style={{ color: '#9660E0', textAlign: 'center' }}>Chargement...</p>}
      
      {!loading && commandesFiltrees.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#C4A0F4' }}>
          <p style={{ fontSize: '2rem' }}>🎉</p>
          <p style={{ fontWeight: 700 }}>Aucune commande pour le moment</p>
        </div>
      )}

      {commandesFiltrees.map(commande => (
        <div key={commande.id} style={{ background: '#fff', border: '1.5px solid #EDE0FF', borderRadius: 16, padding: '1rem 1.25rem', marginBottom: '0.75rem' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div>
              <p style={{ fontWeight: 800, color: '#1A0840', margin: '0 0 2px' }}>{commande.client_nom}</p>
              <p style={{ fontSize: '0.8rem', color: '#9660E0', margin: 0 }}>
                {commande.creneau ? `${commande.creneau.heure_debut.slice(0,5)} – ${commande.creneau.heure_fin.slice(0,5)}` : 'Créneau non défini'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 800, color: '#6B35C4', margin: '0 0 4px' }}>{Number(commande.total).toFixed(2)}€</p>
              <span style={{ background: couleurStatut[commande.statut]?.bg, color: couleurStatut[commande.statut]?.color, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100 }}>
                {couleurStatut[commande.statut]?.label}
              </span>
            </div>
          </div>

          {/* Articles */}
          <div style={{ borderTop: '1px solid #EDE0FF', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
            {commande.commande_articles?.map(ligne => (
              <div key={ligne.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#1A0840', marginBottom: 4 }}>
                <span>{ligne.quantite}x {ligne.article?.nom}</span>
                <span style={{ color: '#6B35C4', fontWeight: 700 }}>{(ligne.quantite * ligne.prix_unitaire).toFixed(2)}€</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            {commande.statut === 'en_attente' && (
              <button onClick={() => changerStatut(commande.id, 'en_preparation')}
                style={{ flex: 1, padding: '0.6rem', background: '#CCE5FF', color: '#004085', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                Démarrer prépa
              </button>
            )}
            {commande.statut === 'en_preparation' && (
              <button onClick={() => changerStatut(commande.id, 'pret')}
                style={{ flex: 1, padding: '0.6rem', background: '#D4EDDA', color: '#155724', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                Marquer comme prêt ✓
              </button>
            )}
            {commande.statut === 'pret' && (
              <button onClick={() => changerStatut(commande.id, 'recupere')}
                style={{ flex: 1, padding: '0.6rem', background: '#E2E3E5', color: '#383d41', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                Récupéré ✓
              </button>
            )}
          </div>
        </div>
      ))}
    </main>
  )
}