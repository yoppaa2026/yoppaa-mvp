'use client'
// Console admin Yoppaa — valider/rejeter les commerçants en attente.
// Accès restreint à ADMIN_EMAIL (vérification côté client + côté API + RLS DB).

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SectionTousCommercants from './SectionTousCommercants'
import SectionKYBAValider from './SectionKYBAValider'
import SectionPreinscriptions from './SectionPreinscriptions'
import SectionDiagnosticBrevo from './SectionDiagnosticBrevo'
import SectionCommunes from './SectionCommunes'
import SectionSuggestions from './SectionSuggestions'
import { Sparkles, Store, Scissors, Croissant, ShoppingBag, Phone, Eye, Lock } from 'lucide-react'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

const T = {
  bg:       '#F8F6FF',
  bgPanel:  '#160636',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',
  pale:     '#EDE0FF',
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  muted:    '#6B7280',
  hairline: '#EEE9F5',
}

export default function AdminPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [aValider, setAValider] = useState([])
  const [historique, setHistorique] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionEnCours, setActionEnCours] = useState(null) // commercant_id en cours d'action
  const [rejetEnCours, setRejetEnCours] = useState(null)   // commercant en cours de rejet (modal)
  const [motifRejet, setMotifRejet] = useState('')
  const [toast, setToast] = useState(null) // { msg, type }

  // ─── Auth check ────────────────────────────────────────────────────────
  useEffect(() => {
    let annule = false
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (annule) return
      setSession(s)
      if (!s) { router.push('/login?next=/admin'); return }
      if (s.user.email !== ADMIN_EMAIL) {
        setChecking(false)
        return // affichera l'écran "accès refusé"
      }
      setChecking(false)
    })
    return () => { annule = true }
  }, [router])

  // ─── Chargement données ────────────────────────────────────────────────
  const charger = useCallback(async () => {
    if (!session || session.user.email !== ADMIN_EMAIL) return
    setLoading(true)
    // Commerçants en attente — join onboarding + success_packs
    const { data: cs } = await supabase
      .from('commercants')
      .select(`
        id, nom, slug, type, categorie, plan, description, telephone, email, adresse,
        logo_url, latitude, longitude, created_at, statut_publication, motif_rejet,
        onboarding_commercants ( id, statut, validation_auto_score, success_pack_choisi, completed_at )
      `)
      .eq('statut_publication', 'en_attente')
      .order('created_at', { ascending: false })
    setAValider(cs || [])

    // Historique (50 dernières actions)
    const { data: hs } = await supabase
      .from('admin_validations')
      .select(`
        id, action, motif, validated_by_email, created_at,
        commercants ( id, nom, plan, type )
      `)
      .order('created_at', { ascending: false })
      .limit(50)
    setHistorique(hs || [])
    setLoading(false)
  }, [session])

  useEffect(() => { charger() }, [charger])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ─── Actions ───────────────────────────────────────────────────────────
  async function valider(commercant_id) {
    if (!confirm('Confirmer la validation de ce commerçant ? Sa page sera publiée et un email lui sera envoyé.')) return
    setActionEnCours(commercant_id)
    try {
      const res = await fetch('/api/admin/valider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ commercant_id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erreur inconnue')
      showToast(`Validé ✓ · email : ${json.email}`, 'success')
      await charger()
    } catch (e) {
      showToast(`Erreur : ${e.message}`, 'error')
    }
    setActionEnCours(null)
  }

  function ouvrirRejet(commercant) {
    setRejetEnCours(commercant)
    setMotifRejet('')
  }

  async function confirmerRejet() {
    if (!motifRejet.trim() || motifRejet.trim().length < 10) {
      showToast('Le motif doit faire au moins 10 caractères.', 'error')
      return
    }
    const commercant_id = rejetEnCours.id
    setActionEnCours(commercant_id)
    try {
      const res = await fetch('/api/admin/rejeter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ commercant_id, motif: motifRejet.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erreur inconnue')
      showToast(`Rejeté ✓ · email : ${json.email}`, 'success')
      setRejetEnCours(null)
      setMotifRejet('')
      await charger()
    } catch (e) {
      showToast(`Erreur : ${e.message}`, 'error')
    }
    setActionEnCours(null)
  }

  // ─── Écrans de garde ───────────────────────────────────────────────────
  if (checking) return <CenteredMsg>Vérification…</CenteredMsg>
  if (!session) return null // redirect en cours
  if (session.user.email !== ADMIN_EMAIL) {
    return <CenteredMsg variant="error">
      <strong>Accès refusé.</strong><br/>
      Cette page est réservée à l&apos;équipe Yoppaa.<br/>
      <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
        style={{ marginTop: 16, padding: '10px 22px', borderRadius: 100, border: 'none', background: T.main, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
        Se déconnecter
      </button>
    </CenteredMsg>
  }

  // ─── Page admin principale ─────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* Header */}
      <header style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.ink} 100%)`, padding: '20px 24px 22px', color: '#fff' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{c:'#fff',o:0.4},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
                <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: d.c, opacity: d.o }}/>
              ))}
            </div>
            <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: 24, letterSpacing: '-0.05em', color: '#fff', margin: 0, lineHeight: 1 }}>yoppaa</p>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.light, background: `${T.main}55`, padding: '4px 10px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '1px', border: `1px solid ${T.light}44` }}>Admin</span>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', borderRadius: 10, padding: '0.5rem 1rem', fontWeight: 700, fontSize: 13, fontFamily: '"DM Sans", sans-serif' }}>
            Déconnexion
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px 80px' }}>
        {loading && <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement…</p>}

        {/* Diagnostic Brevo : la connexion email/SMS répond-elle ? */}
        <SectionDiagnosticBrevo />

        {/* Préinscriptions (suivi de croissance) */}
        <SectionPreinscriptions />

        {/* Communes : activation manuelle + réglage du seuil (remplace les UPDATE SQL) */}
        <SectionCommunes />

        {/* Commerces réclamés par les habitants et encore absents : la liste de
            prospection, classée par nombre de demandes. */}
        <SectionSuggestions />

        {/* À valider */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0 }}>
              À valider <span style={{ color: T.main, marginLeft: 6 }}>· {aValider.length}</span>
            </h2>
            <button onClick={charger} style={{ background: 'none', border: `1px solid ${T.hairline}`, padding: '6px 12px', borderRadius: 100, color: T.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
              ↻ Rafraîchir
            </button>
          </div>

          {!loading && aValider.length === 0 && (
            <div style={{ background: '#fff', borderRadius: 14, padding: '32px 20px', textAlign: 'center', border: `1px solid ${T.hairline}` }}>
              <Sparkles size={36} strokeWidth={1.6} style={{ margin: '0 auto 8px', display: 'block' }}/>
              <p style={{ color: T.muted, margin: 0, fontWeight: 600 }}>Aucune demande en attente.</p>
              <p style={{ color: T.muted, margin: '4px 0 0', fontSize: 13 }}>Pause méritée.</p>
            </div>
          )}

          <div style={{ display: 'grid', gap: 14 }}>
            {aValider.map(c => (
              <CarteAValider key={c.id}
                commercant={c}
                onValider={() => valider(c.id)}
                onRejeter={() => ouvrirRejet(c)}
                disabled={actionEnCours === c.id}
              />
            ))}
          </div>
        </section>

        {/* KYB en attente (S5.3 - 19/06) : valider/rejeter les verifications entreprise */}
        <SectionKYBAValider toast={(msg, type) => setToast({ msg, type })} />

        {/* Tous les commerçants (édition + impersonation) */}
        <SectionTousCommercants toast={(msg, type) => setToast({ msg, type })} />

        {/* Historique */}
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px', marginBottom: 10 }}>
            Historique <span style={{ color: T.muted, fontWeight: 700, fontSize: 14 }}>· 50 dernières actions</span>
          </h2>
          {historique.length === 0 ? (
            <p style={{ color: T.muted, fontSize: 13, fontStyle: 'italic' }}>Aucune action enregistrée pour l&apos;instant.</p>
          ) : (
            <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, overflow: 'hidden' }}>
              {historique.map((h, i) => (
                <div key={h.id} style={{ padding: '10px 16px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: h.action === 'valide' ? '#10B981' : '#DC2626', padding: '3px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
                    {h.action === 'valide' ? '✓ Validé' : '✕ Rejeté'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.commercants?.nom || '—'}
                  </span>
                  {h.motif && (
                    <span style={{ fontSize: 11, color: T.muted, fontStyle: 'italic', flex: '1 1 200px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      « {h.motif} »
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, flexShrink: 0 }}>
                    {new Date(h.created_at).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Modal rejet */}
      {rejetEnCours && (
        <div onClick={() => !actionEnCours && setRejetEnCours(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 18, padding: 24, maxWidth: 480, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 6px' }}>Rejet de demande</p>
            <h3 style={{ fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px', margin: '0 0 16px' }}>
              {rejetEnCours.nom}
            </h3>
            <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
              Motif (visible par le commerçant)
            </label>
            <textarea value={motifRejet} onChange={e => setMotifRejet(e.target.value)}
              rows={5}
              placeholder="Ex: La photo de couverture est trop floue. Merci de la remplacer par une image nette en format paysage (min. 1200px de large)."
              style={{ width: '100%', padding: 12, borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: '"DM Sans", sans-serif', color: T.ink, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 4 }}/>
            <p style={{ fontSize: 11, color: motifRejet.length < 10 ? '#DC2626' : T.muted, fontWeight: 600, margin: '0 0 16px' }}>
              {motifRejet.length} / 10 caractères minimum
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setRejetEnCours(null); setMotifRejet('') }}
                disabled={actionEnCours}
                style={{ flex: 1, padding: '11px 18px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 14, cursor: actionEnCours ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                Annuler
              </button>
              <button onClick={confirmerRejet}
                disabled={actionEnCours || motifRejet.trim().length < 10}
                style={{ flex: 1, padding: '11px 18px', borderRadius: 100, border: 'none', background: motifRejet.trim().length < 10 ? '#FCA5A5' : '#DC2626', color: '#fff', fontWeight: 800, fontSize: 14, cursor: actionEnCours || motifRejet.trim().length < 10 ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                {actionEnCours ? 'Envoi…' : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#DC2626' : '#10B981', color: '#fff', padding: '12px 22px', borderRadius: 100, fontWeight: 700, fontSize: 14, boxShadow: '0 8px 28px rgba(0,0,0,0.25)', zIndex: 2000, fontFamily: '"DM Sans", sans-serif', maxWidth: '90%' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Carte d'un commerçant à valider ──────────────────────────────────────
function CarteAValider({ commercant: c, onValider, onRejeter, disabled }) {
  const ob = Array.isArray(c.onboarding_commercants) ? c.onboarding_commercants[0] : c.onboarding_commercants
  const score = ob?.validation_auto_score ?? null
  const successPack = ob?.success_pack_choisi
  const dateSoumission = ob?.completed_at || c.created_at
  const couleurScore = score == null ? T.muted : score >= 80 ? '#10B981' : score >= 60 ? '#EA580C' : '#DC2626'

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${T.hairline}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(22,6,54,0.05)', opacity: disabled ? 0.5 : 1 }}>
      <div style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Logo */}
        <div style={{ width: 64, height: 64, borderRadius: 14, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {c.logo_url
            ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            : <Store size={26} strokeWidth={1.6}/>}
        </div>

        {/* Infos */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px', margin: 0 }}>{c.nom}</h3>
            <span style={{ fontSize: 10, fontWeight: 800, color: T.bgPanel, background: T.pale, padding: '3px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {(c.plan || 'exister').toUpperCase()}
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: T.main, background: '#fff', border: `1px solid ${T.main}33`, padding: '3px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {c.categorie === 'vitrine' ? (
                <><Scissors size={12} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/>Service</>
              ) : c.categorie === 'detail' ? (
                <><ShoppingBag size={12} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/>Détail</>
              ) : (
                <><Croissant size={12} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/>Alimentaire</>
              )}
            </span>
            {score != null && (
              <span style={{ fontSize: 11, fontWeight: 800, color: couleurScore, background: '#F9FAFB', padding: '3px 9px', borderRadius: 100, border: `1px solid ${couleurScore}33` }}>
                Score {score}/100
              </span>
            )}
            {successPack && (
              <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: T.bgPanel, padding: '3px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Pack {successPack}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: T.muted, fontWeight: 600, margin: '0 0 8px' }}>
            {c.type || '—'} · soumis le {new Date(dateSoumission).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
          </p>
          {c.description && (
            <p style={{ fontSize: 13, color: T.deep, margin: '0 0 8px', lineHeight: 1.5 }}>
              {c.description.length > 220 ? c.description.slice(0, 220) + '…' : c.description}
            </p>
          )}
          <div style={{ display: 'grid', gap: 4, fontSize: 12, color: T.muted }}>
            {c.adresse && <div>📍 {c.adresse}{c.latitude && c.longitude ? <span style={{ color: '#10B981', marginLeft: 6 }}>✓ géocodée</span> : <span style={{ color: '#EA580C', marginLeft: 6 }}>⚠ pas géocodée</span>}</div>}
            {c.telephone && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={12} strokeWidth={1.8}/> {c.telephone}</div>}
            {c.email && <div>✉ {c.email}</div>}
          </div>
          {c.motif_rejet && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#FFF7ED', borderLeft: `3px solid #EA580C`, borderRadius: 6, fontSize: 12, color: '#7C2D12' }}>
              <strong>Précédent rejet :</strong> {c.motif_rejet}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ borderTop: `1px solid ${T.hairline}`, padding: 14, background: T.bg, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {c.slug && (
          <a href={`/commander/${c.slug}`} target="_blank" rel="noopener noreferrer"
            style={{ padding: '9px 16px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none' }}>
            <Eye size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Aperçu fiche
          </a>
        )}
        <button onClick={onRejeter} disabled={disabled}
          style={{ padding: '9px 16px', borderRadius: 100, border: `1.5px solid #FCA5A5`, background: '#fff', color: '#DC2626', fontWeight: 700, fontSize: 13, cursor: disabled ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          ✕ Rejeter
        </button>
        <button onClick={onValider} disabled={disabled}
          style={{ padding: '9px 18px', borderRadius: 100, border: 'none', background: '#10B981', color: '#fff', fontWeight: 800, fontSize: 13, cursor: disabled ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 14px rgba(22,163,74,0.3)' }}>
          {disabled ? 'En cours…' : '✓ Valider'}
        </button>
      </div>
    </div>
  )
}

// ─── Écran centré (loader / accès refusé) ─────────────────────────────────
function CenteredMsg({ children, variant }) {
  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.ink} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', borderRadius: 18, padding: '28px 32px', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', textAlign: 'center', maxWidth: 420 }}>
        {variant === 'error' && <Lock size={38} strokeWidth={1.6} color="#DC2626" style={{ margin: '0 auto 8px', display: 'block' }}/>}
        <div style={{ color: '#fff', fontSize: 15, lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}
