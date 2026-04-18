'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Commander() {
  const [commercants, setCommercants] = useState([])
  const [commercantSelectionne, setCommercantSelectionne] = useState(null)
  const [articles, setArticles] = useState([])
  const [creneaux, setCreneaux] = useState([])
  const [panier, setPanier] = useState({})
  const [creneauChoisi, setCreneauChoisi] = useState(null)
  const [client, setClient] = useState({ nom: '', email: '', telephone: '' })
  const [etape, setEtape] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    chargerCommercants()
  }, [])

  async function chargerCommercants() {
    const { data } = await supabase.from('commercants').select('*')
    setCommercants(data || [])
  }

  async function selectionnerCommercant(commercant) {
    setCommercantSelectionne(commercant)
    const { data: arts } = await supabase
      .from('articles')
      .select('*')
      .eq('commercant_id', commercant.id)
      .eq('actif', true)
    const { data: cren } = await supabase
      .from('creneaux')
      .select('*')
      .eq('commercant_id', commercant.id)
      .eq('actif', true)
    setArticles(arts || [])
    setCreneaux(cren || [])
    setEtape(2)
  }

  function ajouterAuPanier(article) {
    setPanier(prev => ({
      ...prev,
      [article.id]: {
        ...article,
        quantite: (prev[article.id]?.quantite || 0) + 1
      }
    }))
  }

  function retirerDuPanier(articleId) {
    setPanier(prev => {
      const nouveau = { ...prev }
      if (nouveau[articleId]?.quantite > 1) {
        nouveau[articleId].quantite -= 1
      } else {
        delete nouveau[articleId]
      }
      return nouveau
    })
  }

  function totalPanier() {
    return Object.values(panier).reduce((acc, item) => acc + item.prix * item.quantite, 0)
  }

  async function passerCommande() {
    if (!creneauChoisi || !client.nom || !client.email) return
    setLoading(true)

    const lignes = Object.values(panier).map(item => ({
      article_id: item.id,
      quantite: item.quantite,
      prix_unitaire: item.prix
    }))

    const { data: commande } = await supabase
      .from('commandes')
      .insert({
        commercant_id: commercantSelectionne.id,
        creneau_id: creneauChoisi,
        client_nom: client.nom,
        client_email: client.email,
        client_telephone: client.telephone,
        total: totalPanier(),
        statut: 'en_attente'
      })
      .select()
      .single()

    if (commande) {
      await supabase.from('commande_articles').insert(
        lignes.map(l => ({ ...l, commande_id: commande.id }))
      )
      setEtape(4)
    }
    setLoading(false)
  }

  return (
    <main style={{ fontFamily: 'DM Sans, sans-serif', maxWidth: 600, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1A0840' }}></div>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6B35C4' }}></div>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#9660E0' }}></div>
        </div>
        <h1 style={{ fontWeight: 800, fontSize: '1.8rem', letterSpacing: '-2px', color: '#6B35C4' }}>yoppaa</h1>
        <p style={{ color: '#9660E0', fontSize: '0.85rem' }}>Skip the wait</p>
      </div>

      {/* ETAPE 1 - Choisir le commerce */}
      {etape === 1 && (
        <div>
          <h2 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: '1rem', color: '#1A0840' }}>Où veux-tu commander ?</h2>
          {commercants.map(c => (
            <div key={c.id} onClick={() => selectionnerCommercant(c)}
              style={{ background: '#EDE0FF', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '0.75rem', cursor: 'pointer', border: '1.5px solid transparent' }}
              onMouseOver={e => e.currentTarget.style.borderColor = '#6B35C4'}
              onMouseOut={e => e.currentTarget.style.borderColor = 'transparent'}>
              <p style={{ fontWeight: 800, color: '#1A0840' }}>{c.nom}</p>
              <p style={{ fontSize: '0.85rem', color: '#6B35C4' }}>{c.type}</p>
            </div>
          ))}
        </div>
      )}

      {/* ETAPE 2 - Choisir les articles */}
      {etape === 2 && (
        <div>
          <button onClick={() => setEtape(1)} style={{ background: 'none', border: 'none', color: '#6B35C4', cursor: 'pointer', marginBottom: '1rem', fontWeight: 500 }}>← Retour</button>
          <h2 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: '1rem', color: '#1A0840' }}>{commercantSelectionne?.nom}</h2>
          {articles.map(article => (
            <div key={article.id} style={{ background: '#fff', border: '1.5px solid #EDE0FF', borderRadius: 12, padding: '1rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700, color: '#1A0840' }}>{article.nom}</p>
                <p style={{ fontSize: '0.85rem', color: '#9660E0' }}>{article.prix.toFixed(2)}€</p>
                {article.description && <p style={{ fontSize: '0.8rem', color: '#888' }}>{article.description}</p>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {panier[article.id] && (
                  <>
                    <button onClick={() => retirerDuPanier(article.id)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #6B35C4', background: '#fff', color: '#6B35C4', fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}>-</button>
                    <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{panier[article.id].quantite}</span>
                  </>
                )}
                <button onClick={() => ajouterAuPanier(article)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: '#6B35C4', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}>+</button>
              </div>
            </div>
          ))}
          {Object.keys(panier).length > 0 && (
            <div style={{ position: 'sticky', bottom: 16 }}>
              <button onClick={() => setEtape(3)} style={{ width: '100%', padding: '1rem', background: '#6B35C4', color: '#fff', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}>
                Choisir mon créneau — {totalPanier().toFixed(2)}€
              </button>
            </div>
          )}
        </div>
      )}

      {/* ETAPE 3 - Créneau + infos client */}
      {etape === 3 && (
        <div>
          <button onClick={() => setEtape(2)} style={{ background: 'none', border: 'none', color: '#6B35C4', cursor: 'pointer', marginBottom: '1rem', fontWeight: 500 }}>← Retour</button>
          <h2 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: '1rem', color: '#1A0840' }}>Choisis ton créneau</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
            {creneaux.map(c => (
              <div key={c.id} onClick={() => setCreneauChoisi(c.id)}
                style={{ padding: '0.75rem', borderRadius: 10, border: `2px solid ${creneauChoisi === c.id ? '#6B35C4' : '#EDE0FF'}`, background: creneauChoisi === c.id ? '#EDE0FF' : '#fff', cursor: 'pointer', textAlign: 'center', fontWeight: 700, color: '#1A0840' }}>
                {c.heure_debut.slice(0,5)} – {c.heure_fin.slice(0,5)}
              </div>
            ))}
          </div>

          <h2 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: '1rem', color: '#1A0840' }}>Tes coordonnées</h2>
          <input placeholder="Ton prénom et nom" value={client.nom} onChange={e => setClient({...client, nom: e.target.value})}
            style={{ width: '100%', padding: '0.85rem', border: '1.5px solid #EDE0FF', borderRadius: 10, marginBottom: 10, fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif' }} />
          <input placeholder="Email" type="email" value={client.email} onChange={e => setClient({...client, email: e.target.value})}
            style={{ width: '100%', padding: '0.85rem', border: '1.5px solid #EDE0FF', borderRadius: 10, marginBottom: 10, fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif' }} />
          <input placeholder="Téléphone (optionnel)" value={client.telephone} onChange={e => setClient({...client, telephone: e.target.value})}
            style={{ width: '100%', padding: '0.85rem', border: '1.5px solid #EDE0FF', borderRadius: 10, marginBottom: 16, fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif' }} />

          <button onClick={passerCommande} disabled={loading || !creneauChoisi || !client.nom || !client.email}
            style={{ width: '100%', padding: '1rem', background: '#6B35C4', color: '#fff', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '1rem', cursor: 'pointer', opacity: (!creneauChoisi || !client.nom || !client.email) ? 0.5 : 1 }}>
            {loading ? 'En cours...' : `Confirmer ma commande — ${totalPanier().toFixed(2)}€`}
          </button>
          <p style={{ fontSize: '0.78rem', color: '#9a8ab0', textAlign: 'center', marginTop: 8 }}>Le paiement sera activé prochainement</p>
        </div>
      )}

      {/* ETAPE 4 - Confirmation */}
      {etape === 4 && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
          <h2 style={{ fontWeight: 800, fontSize: '1.5rem', color: '#1A0840', marginBottom: '0.5rem' }}>Commande confirmée !</h2>
          <p style={{ color: '#6B35C4', marginBottom: '1.5rem' }}>Ta commande est enregistrée. Le commerce la prépare pour ton créneau.</p>
          <button onClick={() => { setEtape(1); setPanier({}); setClient({ nom: '', email: '', telephone: '' }); setCreneauChoisi(null); }}
            style={{ padding: '0.75rem 2rem', background: '#6B35C4', color: '#fff', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer' }}>
            Nouvelle commande
          </button>
        </div>
      )}
    </main>
  )
}