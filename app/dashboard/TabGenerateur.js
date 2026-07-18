'use client'
// Onglet "Générateur" du dashboard commerçant (Ch3bis) : génère des textes prêts à
// publier (post réseaux, accroche). TEXTE uniquement. Appelle /api/ia/generer-post
// (le plan + le quota + le modèle sont gérés côté serveur). Arme du palier Communiquer.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getIaConfig } from '@/lib/plans'

const T = {
  bgPanel: '#160636', main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
  ink: '#1A0840', muted: '#6B7280', hairline: '#EEE9F5', green: '#10B981',
}

const OCCASIONS = [
  { cle: 'Nouveauté', emo: '✨' },
  { cle: 'Bon plan', emo: '🔥' },
  { cle: 'Événement', emo: '📅' },
  { cle: 'Coup de cœur', emo: '💜' },
  { cle: 'Infos pratiques', emo: 'ℹ️' },
  { cle: 'Remerciement', emo: '🙏' },
]
const TONS = ['Chaleureux', 'Dynamique', 'Élégant', 'Décontracté', 'Gourmand']

export default function TabGenerateur({ commercantId, commercant, toast }) {
  const cfg = getIaConfig(commercant?.plan)
  const estExister = (commercant?.plan === 'exister' || commercant?.plan === 'on')

  const [occasion, setOccasion] = useState('Nouveauté')
  const [brief, setBrief] = useState('')
  const [ton, setTon] = useState('Chaleureux')
  const [infos, setInfos] = useState('')
  const [loading, setLoading] = useState(false)
  const [variantes, setVariantes] = useState([])
  const [quota, setQuota] = useState(null)
  const [copie, setCopie] = useState(null)

  const restant = quota ? quota.restant : cfg.quota_mois

  async function generer() {
    if (!brief.trim()) { toast?.('Décris en une ligne ce que tu veux annoncer.', 'error'); return }
    setLoading(true); setVariantes([])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast?.('Session expirée, reconnecte-toi.', 'error'); setLoading(false); return }
      const res = await fetch('/api/ia/generer-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commercant_id: commercantId, surface: 'post', occasion, brief, ton, infos }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) {
        if (j.error === 'quota_atteint') {
          setQuota(j.quota || { restant: 0, total: cfg.quota_mois })
          toast?.('Quota mensuel atteint. Il se réinitialise le 1er du mois.', 'error')
        } else if (j.error === 'plan_sans_ia') {
          toast?.(j.message || 'Le générateur est réservé aux paliers Communiquer et Vendre.', 'error')
        } else {
          toast?.(j.error || 'La génération a échoué, réessaie.', 'error')
        }
        setLoading(false); return
      }
      setVariantes(j.variantes || [])
      setQuota(j.quota || null)
    } catch (e) {
      toast?.('Erreur réseau, réessaie.', 'error')
    }
    setLoading(false)
  }

  async function copier(txt, cle) {
    try { await navigator.clipboard.writeText(txt); setCopie(cle); setTimeout(() => setCopie(null), 2000) } catch { /* clipboard indispo */ }
  }

  const puce = (actif) => ({
    padding: '9px 14px', borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s',
    border: `1.5px solid ${actif ? T.main : T.hairline}`,
    background: actif ? T.main : '#fff', color: actif ? '#fff' : T.muted,
  })
  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: '"DM Sans", sans-serif', color: T.ink, outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      {/* En-tête + compteur quota */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0 }}>Générateur de posts</h2>
          <p style={{ fontSize: 13, color: T.muted, margin: '4px 0 0', lineHeight: 1.5 }}>
            Décris ton idée, l&apos;IA rédige des posts prêts à publier. Aucun prix ni date inventé.
          </p>
        </div>
        <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: T.main, background: T.pale, padding: '6px 12px', borderRadius: 100 }}>
          {restant}/{cfg.quota_mois} ce mois-ci
        </span>
      </div>

      {estExister && (
        <div style={{ background: 'rgba(150,96,224,0.10)', border: `1px solid ${T.light}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.ink, lineHeight: 1.5 }}>
            Tu as <strong>1 essai gratuit ce mois-ci</strong> pour découvrir. Passe à <strong>Communiquer</strong> pour 40 posts/mois. 🟣
          </p>
        </div>
      )}

      {/* Formulaire */}
      <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${T.hairline}`, padding: 18, marginBottom: 18, boxShadow: '0 2px 12px rgba(22,6,54,0.05)' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Occasion</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {OCCASIONS.map(o => (
            <button key={o.cle} type="button" onClick={() => setOccasion(o.cle)} style={puce(occasion === o.cle)}>
              {o.emo} {o.cle}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Ce que tu veux annoncer</p>
        <textarea value={brief} onChange={e => setBrief(e.target.value.slice(0, 400))} rows={2}
          placeholder="Ex : nouvelle formule lunch à emporter, faite maison"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 54, marginBottom: 16 }} />

        <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Ton</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {TONS.map(t => (
            <button key={t} type="button" onClick={() => setTon(t)} style={puce(ton === t)}>{t}</button>
          ))}
        </div>

        <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Infos exactes à respecter (optionnel)</p>
        <input value={infos} onChange={e => setInfos(e.target.value.slice(0, 300))}
          placeholder="Prix, dates, horaires… (l'IA ne les inventera pas)"
          style={{ ...inputStyle, marginBottom: 18 }} />

        <button onClick={generer} disabled={loading || !brief.trim()}
          style={{ width: '100%', padding: '13px', borderRadius: 100, border: 'none', cursor: loading || !brief.trim() ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 900, fontSize: 14, letterSpacing: '0.3px', color: '#fff', background: loading || !brief.trim() ? '#C4A0F4' : `linear-gradient(135deg, ${T.main}, ${T.mid})` }}>
          {loading ? 'Génération…' : '✨ Générer mes posts'}
        </button>
      </div>

      {/* Résultats */}
      {variantes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
            {variantes.length} proposition{variantes.length > 1 ? 's' : ''}
          </p>
          {variantes.map((v, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 16, border: `1px solid ${T.hairline}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(22,6,54,0.05)' }}>
              <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink}, ${T.main} 60%, ${T.light})` }} />
              <div style={{ padding: 16 }}>
                {v.long && <p style={{ margin: '0 0 10px', fontSize: 14.5, color: T.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{v.long}</p>}
                {v.court && (
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: T.muted, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    <span style={{ fontWeight: 800, color: T.main }}>Version courte : </span>{v.court}
                  </p>
                )}
                {v.hashtags?.length > 0 && (
                  <p style={{ margin: '0 0 12px', fontSize: 12.5, color: T.mid, fontWeight: 700 }}>{v.hashtags.join(' ')}</p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => copier([v.long, v.hashtags?.join(' ')].filter(Boolean).join('\n\n'), `long-${i}`)}
                    style={{ padding: '8px 14px', borderRadius: 100, border: 'none', background: T.main, color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    {copie === `long-${i}` ? 'Copié !' : 'Copier le post'}
                  </button>
                  {v.court && (
                    <button onClick={() => copier(v.court, `court-${i}`)}
                      style={{ padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                      {copie === `court-${i}` ? 'Copié !' : 'Copier la courte'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11.5, color: T.muted, textAlign: 'center', margin: '4px 0 0', lineHeight: 1.5 }}>
            Relis toujours avant de publier. L&apos;IA t&apos;aide à rédiger, tu gardes le dernier mot. 🟣
          </p>
        </div>
      )}
    </div>
  )
}
