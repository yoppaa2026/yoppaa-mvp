'use client'
// Section "Tous les commerçants" du dashboard admin Yoppaa.
// Liste tous les commerçants (validés + en attente + rejetés + suspendus) avec
// recherche/filtres + actions : Modifier (modale d'édition) + Voir son dashboard
// (impersonation, à activer dans le prochain commit).

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ModalEditCommercant from './ModalEditCommercant'

const T = {
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',
  pale:     '#EDE0FF',
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  muted:    '#6B7280',
  hairline: '#EEE9F5',
}

// Badges visuels par statut publication
const BADGE_STATUT = {
  publie:     { bg: '#F0FDF4', color: '#10B981', label: 'Publié' },
  en_attente: { bg: '#FEF3C7', color: '#92400E', label: 'En attente' },
  rejete:     { bg: '#FEE2E2', color: '#DC2626', label: 'Rejeté' },
  suspendu:   { bg: '#E5E7EB', color: '#6B7280', label: 'Suspendu' },
}

const BADGE_PLAN = {
  on:      { bg: '#F3F4F6', color: '#6B7280' },
  live:    { bg: '#DBEAFE', color: '#1E40AF' },
  boost:   { bg: '#FED7AA', color: '#9A3412' },
  max:     { bg: '#FECACA', color: '#991B1B' },
  pro:     { bg: '#EDE0FF', color: '#6B35C4' },
  proplus: { bg: '#DDD6FE', color: '#5B21B6' },
}

export default function SectionTousCommercants({ toast }) {
  const router = useRouter()
  const [commercants, setCommercants] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [filtrePlan, setFiltrePlan] = useState('tous')
  const [filtreCategorie, setFiltreCategorie] = useState('tous')
  const [edition, setEdition] = useState(null)  // commerçant en édition (modale)

  const charger = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('commercants')
      .select('id, nom, slug, type, categorie, plan, statut_publication, email, telephone, adresse, description, rdv_actif, rdv_delai_annulation_heures, auth_user_id, created_at, logo_url')
      .order('nom')
    if (error) {
      console.error('[SectionTousCommercants]', error)
      toast?.('Erreur chargement commerçants', 'error')
    }
    setCommercants(data || [])
    setLoading(false)
  }, [toast])

  useEffect(() => { charger() }, [charger])

  // Filtre client-side (rapide, on a < 200 commerçants en MVP)
  const filtres = useMemo(() => {
    let res = commercants
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase()
      res = res.filter(c =>
        (c.nom || '').toLowerCase().includes(q)
        || (c.slug || '').toLowerCase().includes(q)
        || (c.email || '').toLowerCase().includes(q)
        || (c.type || '').toLowerCase().includes(q)
        || (c.adresse || '').toLowerCase().includes(q)
      )
    }
    if (filtreStatut !== 'tous') res = res.filter(c => c.statut_publication === filtreStatut)
    if (filtrePlan !== 'tous')   res = res.filter(c => c.plan === filtrePlan)
    if (filtreCategorie !== 'tous') res = res.filter(c => c.categorie === filtreCategorie)
    return res
  }, [commercants, recherche, filtreStatut, filtrePlan, filtreCategorie])

  function onSaved(updated) {
    setCommercants(list => list.map(c => c.id === updated.id ? { ...c, ...updated } : c))
  }

  async function voirDashboard(c) {
    // Demarre une session d'impersonation : POST /api/admin/impersonate-start qui logue
    // dans admin_impersonations (conformite RGPD). Retourne l'impersonation_id qu'on garde
    // en localStorage pour le fermer proprement via impersonate-end au "Quitter".
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/impersonate-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ commercant_id: c.id, raison: 'Acces depuis liste admin' }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Erreur impersonation')

      if (typeof window !== 'undefined') {
        localStorage.setItem('yoppaa_dashboard_commercant_id', c.id)
        localStorage.setItem('yoppaa_admin_impersonating', c.id)
        localStorage.setItem('yoppaa_admin_impersonation_session_id', j.impersonation_id)
      }
      router.push('/dashboard')
    } catch (e) {
      console.error('[voirDashboard]', e)
      toast?.(`Erreur impersonation : ${e.message}`, 'error')
    }
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0 }}>
          Tous les commerçants <span style={{ color: T.main, marginLeft: 6 }}>· {filtres.length}{filtres.length !== commercants.length ? `/${commercants.length}` : ''}</span>
        </h2>
        <button onClick={charger} style={{ background: 'none', border: `1px solid ${T.hairline}`, padding: '6px 12px', borderRadius: 100, color: T.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          ↻ Rafraîchir
        </button>
      </div>

      {/* Filtres + recherche */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${T.hairline}`, padding: 12, marginBottom: 14, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <input type="text" value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder="🔍 Recherche nom, slug, email, type, adresse…"
          style={{ gridColumn: '1 / -1', padding: '0.55rem 0.75rem', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 13, fontFamily: '"DM Sans", sans-serif', color: T.ink, outline: 'none' }}/>
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 13, fontFamily: '"DM Sans", sans-serif', color: T.ink, outline: 'none', cursor: 'pointer', background: '#fff' }}>
          <option value="tous">Tous les statuts</option>
          <option value="publie">Publiés</option>
          <option value="en_attente">En attente</option>
          <option value="rejete">Rejetés</option>
          <option value="suspendu">Suspendus</option>
        </select>
        <select value={filtrePlan} onChange={e => setFiltrePlan(e.target.value)}
          style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 13, fontFamily: '"DM Sans", sans-serif', color: T.ink, outline: 'none', cursor: 'pointer', background: '#fff' }}>
          <option value="tous">Tous les plans</option>
          {Object.keys(BADGE_PLAN).map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
        </select>
        <select value={filtreCategorie} onChange={e => setFiltreCategorie(e.target.value)}
          style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 13, fontFamily: '"DM Sans", sans-serif', color: T.ink, outline: 'none', cursor: 'pointer', background: '#fff' }}>
          <option value="tous">Toutes catégories</option>
          <option value="alimentaire">Alimentaire</option>
          <option value="vitrine">Vitrine</option>
        </select>
      </div>

      {loading && (
        <p style={{ color: T.muted, textAlign: 'center', padding: 30 }}>Chargement…</p>
      )}

      {!loading && filtres.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 14, padding: '24px 16px', textAlign: 'center', border: `1px solid ${T.hairline}` }}>
          <p style={{ color: T.muted, fontSize: 13, margin: 0 }}>
            Aucun commerçant ne correspond aux filtres.
          </p>
        </div>
      )}

      {!loading && filtres.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, overflow: 'hidden' }}>
          {filtres.map((c, i) => {
            const badgeS = BADGE_STATUT[c.statut_publication] || BADGE_STATUT.suspendu
            const badgeP = BADGE_PLAN[c.plan] || BADGE_PLAN.on
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}`, flexWrap: 'wrap' }}>
                {/* Logo / avatar */}
                <div style={{ width: 44, height: 44, borderRadius: 10, background: c.logo_url ? '#fff' : T.pale, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: c.logo_url ? `1px solid ${T.hairline}` : 'none' }}>
                  {c.logo_url
                    ? <img src={c.logo_url} alt={c.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                    : <span style={{ fontSize: 18, fontWeight: 800, color: T.main }}>{c.nom?.[0]?.toUpperCase() || '?'}</span>}
                </div>

                {/* Infos */}
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <p style={{ fontWeight: 800, color: T.ink, fontSize: 14, margin: 0, letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.nom}{c.rdv_actif && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#10B981', background: '#F0FDF4', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>RDV</span>}
                  </p>
                  <p style={{ fontSize: 11, color: T.muted, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{c.slug || <em>(sans slug)</em>}</span>
                    {c.type && <span>· {c.type}</span>}
                    {c.email && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {c.email}</span>}
                  </p>
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, background: badgeP.bg, color: badgeP.color, padding: '3px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {c.plan?.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, background: badgeS.bg, color: badgeS.color, padding: '3px 8px', borderRadius: 100, letterSpacing: '0.3px' }}>
                    {badgeS.label}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setEdition(c)}
                    style={{ padding: '5px 10px', borderRadius: 100, border: `1.5px solid ${T.main}33`, background: T.pale, color: T.main, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    ✏ Modifier
                  </button>
                  <button onClick={() => voirDashboard(c)}
                    style={{ padding: '5px 10px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 2px 8px ${T.main}44` }}>
                    Dashboard →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modale édition */}
      {edition && (
        <ModalEditCommercant
          commercant={edition}
          onClose={() => setEdition(null)}
          onSaved={onSaved}
          toast={toast}
        />
      )}
    </section>
  )
}
