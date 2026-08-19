'use client'
// Section admin : suivi des préinscriptions (contrôle de croissance).
// Lecture via /api/admin/preinscriptions (service_role + check admin).

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, Store, TrendingUp, MapPin, RefreshCw } from 'lucide-react'
import { jourBruxelles } from '@/lib/timezone'

const T = {
  bg: '#F8F6FF', main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
  ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280', hairline: '#EEE9F5', green: '#10B981',
}

function StatCard({ icon, valeur, label, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 120, background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: accent || T.main }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: T.muted }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 30, fontWeight: 900, color: T.ink, letterSpacing: '-1px', lineHeight: 1 }}>{valeur}</p>
    </div>
  )
}

function fmtJour(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
}

export default function SectionPreinscriptions() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const charger = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setErr('Session expirée'); setLoading(false); return }
      const res = await fetch('/api/admin/preinscriptions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Erreur')
      setData(j)
    } catch (e) {
      setErr(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  // Courbe : 14 derniers jours (complète les jours vides à 0).
  const derniers14 = (() => {
    if (!data) return []
    const map = Object.fromEntries((data.croissance || []).map(c => [c.jour, c.n]))
    const out = []
    const base = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(base); d.setDate(base.getDate() - i)
      const iso = jourBruxelles(d)
      out.push({ jour: iso, n: map[iso] || 0 })
    }
    return out
  })()
  const maxN = Math.max(1, ...derniers14.map(d => d.n))

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0 }}>
          Préinscriptions {data && <span style={{ color: T.main, marginLeft: 6 }}>· {data.total}</span>}
        </h2>
        <button onClick={charger} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: `1px solid ${T.hairline}`, padding: '6px 12px', borderRadius: 100, color: T.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          <RefreshCw size={13} strokeWidth={2}/> Rafraîchir
        </button>
      </div>

      {loading && <p style={{ color: T.muted, padding: 20 }}>Chargement…</p>}
      {err && <p style={{ color: '#DC2626', fontWeight: 600 }}>Erreur : {err}</p>}

      {data && !loading && (
        <>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <StatCard icon={<TrendingUp size={16} strokeWidth={2.2}/>} valeur={data.total} label="Total"/>
            <StatCard icon={<Users size={16} strokeWidth={2.2}/>} valeur={data.nbCurieux} label="Curieux"/>
            <StatCard icon={<Store size={16} strokeWidth={2.2}/>} valeur={data.nbCommercants} label="Commerçants" accent={T.green}/>
          </div>

          {/* Courbe 14 jours */}
          <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: T.ink }}>Croissance · 14 derniers jours</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90 }}>
              {derniers14.map(d => (
                <div key={d.jour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: d.n ? T.main : T.hairline }}>{d.n || ''}</span>
                  <div title={`${fmtJour(d.jour)} : ${d.n}`} style={{ width: '100%', height: `${Math.round((d.n / maxN) * 66)}px`, minHeight: d.n ? 4 : 2, borderRadius: 4, background: d.n ? `linear-gradient(180deg, ${T.mid}, ${T.main})` : T.pale }}/>
                  <span style={{ fontSize: 8.5, color: T.muted, whiteSpace: 'nowrap' }}>{fmtJour(d.jour).replace('.', '')}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
            {/* Top communes */}
            <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, padding: 16 }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: T.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} strokeWidth={2}/> Top communes
              </p>
              {data.topCommunes.length === 0 ? <p style={{ color: T.muted, fontSize: 13 }}>Aucune donnée.</p> : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {data.topCommunes.slice(0, 12).map(c => (
                    <div key={c.nom} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</span>
                      <span style={{ color: T.muted, fontWeight: 700, flexShrink: 0 }}>
                        {c.total} <span style={{ fontSize: 11, color: T.green }}>· {c.commercants} comm.</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Commerçants cités */}
            <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, padding: 16 }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: T.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Store size={14} strokeWidth={2}/> Commerçants cités <span style={{ color: T.muted, fontWeight: 700 }}>· {data.commercantsCites.length}</span>
              </p>
              {data.commercantsCites.length === 0 ? <p style={{ color: T.muted, fontSize: 13 }}>Aucun encore.</p> : (
                <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {data.commercantsCites.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.nom} {c.type === 'commercant' && <span style={{ fontSize: 10, color: T.green, fontWeight: 800 }}>(pro)</span>}
                      </span>
                      <span style={{ color: T.muted, flexShrink: 0, fontSize: 12 }}>{c.code_postal}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Liste récente */}
          <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, overflow: 'hidden' }}>
            <p style={{ margin: 0, padding: '12px 16px', fontSize: 13, fontWeight: 800, color: T.ink, borderBottom: `1px solid ${T.hairline}` }}>40 dernières inscriptions</p>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {data.recent.map((r, i) => (
                <div key={i} style={{ padding: '9px 16px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: r.type === 'commercant' ? T.green : T.main, padding: '2px 8px', borderRadius: 100, flexShrink: 0 }}>
                    {r.type === 'commercant' ? 'PRO' : 'CURIEUX'}
                  </span>
                  <span style={{ fontWeight: 700, color: T.ink, flex: '1 1 180px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</span>
                  <span style={{ color: T.muted, flexShrink: 0 }}>{r.code_postal}{r.commune ? ` · ${r.commune}` : ''}</span>
                  {r.commercant_nom && <span style={{ color: T.deep, fontStyle: 'italic', flexShrink: 0 }}>« {r.commercant_nom} »</span>}
                  {r.ref_commercant && <span style={{ color: T.main, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>ref:{r.ref_commercant}</span>}
                  <span style={{ color: T.muted, flexShrink: 0, fontSize: 11 }}>
                    {new Date(r.created_at).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
