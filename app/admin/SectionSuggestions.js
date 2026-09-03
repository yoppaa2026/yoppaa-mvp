'use client'
// Section admin : les commerces réclamés par les habitants et absents de
// Yoppaa. C'est de la prospection, pas de la modération : l'écran répond à
// « où je vais demain, et je frappe à quelle porte ».
//
// Le plus réclamé est en haut, les communes sont résumées au-dessus. Aucun
// auteur n'est affiché : la route ne les renvoie même pas.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Store, Search, RefreshCw, MapPin, Copy } from 'lucide-react'
import { sansAccents } from '@/lib/texte-normalise'

const T = {
  bg: '#F8F6FF', main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
  ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280', hairline: '#EEE9F5', green: '#10B981',
}

// Minuscules + sans accents. La fonction vit dans `lib/texte-normalise.js`
// depuis le 03/09 : elle était recopiée à l'identique dans trois fichiers.
const norm = sansAccents

function dateCourte(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SectionSuggestions() {
  const [commerces, setCommerces] = useState([])
  const [communes, setCommunes] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [cpFiltre, setCpFiltre] = useState(null)
  const [ouvert, setOuvert] = useState(null)
  const [copie, setCopie] = useState(null)

  const charger = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setErr('Session expirée'); setLoading(false); return }
      const res = await fetch('/api/admin/suggestions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Erreur')
      setCommerces(j.commerces || [])
      setCommunes(j.communes || [])
      setTotal(j.total || 0)
    } catch (e) {
      setErr(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const filtres = useMemo(() => {
    const q = norm(recherche.trim())
    return commerces.filter(c => {
      if (cpFiltre && c.code_postal !== cpFiltre) return false
      if (!q) return true
      return norm(c.nom).includes(q) || norm(c.adresse).includes(q) || String(c.code_postal || '').includes(q)
    })
  }, [commerces, recherche, cpFiltre])

  // Copier nom + adresse en un geste : la prospection se fait ailleurs (carnet,
  // téléphone, courrier), l'écran doit servir de presse-papiers.
  function copier(c) {
    const texte = [c.nom, c.adresse].filter(Boolean).join(' · ')
    navigator.clipboard?.writeText(texte)
    setCopie(c.cle)
    setTimeout(() => setCopie(null), 1800)
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0 }}>
          <Store size={20} strokeWidth={2} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6, color: T.main }}/>
          Commerces réclamés <span style={{ color: T.main }}>· {commerces.length}</span>
          {total > 0 && <span style={{ color: T.muted, fontWeight: 700, fontSize: 14 }}> / {total} demande{total > 1 ? 's' : ''}</span>}
        </h2>
        <button onClick={charger} style={{ background: 'none', border: `1px solid ${T.hairline}`, padding: '6px 12px', borderRadius: 100, color: T.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} strokeWidth={2}/> Rafraîchir
        </button>
      </div>

      <p style={{ fontSize: 13, color: T.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        Les habitants ont demandé ces commerces, ils ne sont pas encore sur Yoppaa.
        Le plus réclamé est en haut : c&rsquo;est l&rsquo;ordre dans lequel les démarcher.
        Personne n&rsquo;est nommé, ni celui qui demande, ni son commentaire signé.
      </p>

      {/* Les communes en un coup d'œil : où concentrer une tournée. */}
      {communes.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {communes.slice(0, 12).map(c => {
            const actif = cpFiltre === c.code_postal
            return (
              <button key={c.code_postal} onClick={() => setCpFiltre(actif ? null : c.code_postal)}
                style={{ padding: '6px 12px', borderRadius: 100, border: `1.5px solid ${actif ? T.main : T.hairline}`, background: actif ? T.main : '#fff', color: actif ? '#fff' : T.deep, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={12} strokeWidth={2}/>
                {c.code_postal}
                <span style={{ fontSize: 10, fontWeight: 800, background: actif ? 'rgba(255,255,255,0.25)' : T.pale, color: actif ? '#fff' : T.main, padding: '1px 6px', borderRadius: 100 }}>
                  {c.commerces}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 14, maxWidth: 360 }}>
        <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.muted }}/>
        <input value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder="Nom, adresse ou code postal…"
          style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: '"DM Sans", sans-serif', color: T.ink, outline: 'none', boxSizing: 'border-box' }}/>
      </div>

      {loading && <p style={{ color: T.muted, textAlign: 'center', padding: 30 }}>Chargement…</p>}
      {err && <p style={{ color: '#DC2626', fontWeight: 700, fontSize: 13 }}>Erreur : {err}</p>}

      {!loading && !err && (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, overflow: 'hidden' }}>
          {filtres.length === 0 && (
            <p style={{ color: T.muted, textAlign: 'center', padding: 28, fontSize: 13, margin: 0 }}>
              {commerces.length === 0
                ? 'Personne n’a encore réclamé de commerce absent.'
                : 'Aucun commerce ne correspond à ce filtre.'}
            </p>
          )}
          {filtres.map((c, i) => (
            <div key={c.cle} style={{ padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: T.main, minWidth: 28, lineHeight: 1 }}>{c.demandes}</span>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.ink }}>{c.nom}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: T.muted, fontWeight: 600 }}>
                    {c.code_postal ? <strong style={{ color: T.deep }}>{c.code_postal}</strong> : 'Code postal inconnu'}
                    {c.type_commerce ? ` · ${c.type_commerce}` : ''}
                    {' · dernière demande le '}{dateCourte(c.derniere)}
                  </p>
                  {c.adresse && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: T.muted }}>{c.adresse}</p>
                  )}
                </div>
                <button onClick={() => copier(c)}
                  style={{ padding: '7px 12px', borderRadius: 100, border: `1px solid ${T.hairline}`, background: copie === c.cle ? T.pale : '#fff', color: copie === c.cle ? T.main : T.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Copy size={13} strokeWidth={2}/> {copie === c.cle ? 'Copié' : 'Copier'}
                </button>
                {c.commentaires?.length > 0 && (
                  <button onClick={() => setOuvert(ouvert === c.cle ? null : c.cle)}
                    style={{ padding: '7px 12px', borderRadius: 100, border: `1px solid ${T.hairline}`, background: '#fff', color: T.deep, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
                    {c.commentaires.length} mot{c.commentaires.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>
              {ouvert === c.cle && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {c.commentaires.map((m, k) => (
                    <p key={k} style={{ margin: 0, fontSize: 12.5, color: T.deep, background: T.bg, borderRadius: 10, padding: '8px 12px', lineHeight: 1.5 }}>
                      &laquo;&nbsp;{m}&nbsp;&raquo;
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
