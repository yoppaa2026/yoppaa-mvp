'use client'
// TabPaiements : section Stripe Connect dans la config commerçant.
// Permet au commerçant de :
//   • Lier son compte Stripe via onboarding Express hosted (5 min)
//   • Voir l'état de son compte (charges_enabled, payouts_enabled, requirements)
//   • Activer / désactiver le toggle "Acompte en ligne" pour ses RDVs vitrine
//
// Onglet visible uniquement si plan === 'full' :
//   • Vitrine FULL : acompte en ligne RDV
//   • Alimentaire FULL : paiement obligatoire à la commande C&C (Phase 1.5)

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const T = {
  bg:      '#F8F6FF',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
  hairline:'#EEE9F5',
}

export default function TabPaiements({ commercantId, toast }) {
  const [commercant, setCommercant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [savingToggle, setSavingToggle] = useState(false)

  const charger = useCallback(async () => {
    if (!commercantId) return
    setLoading(true)
    const { data } = await supabase
      .from('commercants')
      .select('id, nom, plan, categorie, stripe_account_id, stripe_account_charges_enabled, stripe_account_details_submitted, stripe_account_payouts_enabled, stripe_onboarding_done_at, rdv_acompte_en_ligne_actif')
      .eq('id', commercantId)
      .maybeSingle()
    setCommercant(data)
    setLoading(false)
  }, [commercantId])

  useEffect(() => { charger() }, [charger])

  // Re-fetch automatique si on revient depuis Stripe (return_url ?stripe=connected ou ?stripe=refresh)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('stripe') === 'connected' || params.get('stripe') === 'refresh') {
      // Nettoie l'URL puis refresh
      window.history.replaceState({}, '', window.location.pathname)
      rafraichirStatus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ouvrirOnboarding() {
    setConnecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/stripe/connect/create-account-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ commercant_id: commercantId }),
      })
      const j = await res.json()
      if (!j.ok) {
        toast?.(j.error || 'Erreur connexion Stripe', 'error')
        setConnecting(false)
        return
      }
      // Redirect vers Stripe onboarding hosted
      window.location.href = j.url
    } catch (e) {
      console.error('[TabPaiements] ouvrirOnboarding', e)
      toast?.(e.message || 'Erreur Stripe', 'error')
      setConnecting(false)
    }
  }

  async function rafraichirStatus() {
    if (!commercant?.stripe_account_id) return
    setRefreshing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/stripe/connect/refresh-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ commercant_id: commercantId }),
      })
      await charger()
    } catch (e) {
      console.error('[TabPaiements] rafraichirStatus', e)
    } finally {
      setRefreshing(false)
    }
  }

  async function toggleAcompteEnLigne(actif) {
    setSavingToggle(true)
    const { error } = await supabase
      .from('commercants')
      .update({ rdv_acompte_en_ligne_actif: actif })
      .eq('id', commercantId)
    setSavingToggle(false)
    if (error) {
      toast?.(`Erreur : ${error.message}`, 'error')
      return
    }
    setCommercant(c => ({ ...c, rdv_acompte_en_ligne_actif: actif }))
    toast?.(actif ? 'Acompte en ligne activé' : 'Acompte en ligne désactivé', 'success')
  }

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: T.muted }}>Chargement…</div>
  }
  if (!commercant) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: T.muted }}>Commerçant introuvable</div>
  }

  const estConnecte = !!commercant.stripe_account_id
  const onboardingComplet = estConnecte && commercant.stripe_account_charges_enabled
  const onboardingEnCours = estConnecte && !commercant.stripe_account_charges_enabled

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ─── SECTION 1 : Compte Stripe Connect ─── */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: `1px solid ${T.hairline}`, boxShadow: '0 1px 3px rgba(22,6,54,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0, marginBottom: 4 }}>Paiements en ligne</p>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: T.ink, margin: 0, letterSpacing: '-0.3px' }}>Compte Stripe Connect</h3>
            <p style={{ fontSize: '0.82rem', color: T.muted, lineHeight: 1.5, marginTop: 6 }}>
              Lie ton compte bancaire à Stripe pour recevoir les acomptes RDV en ligne.
              L'onboarding prend ~5 min (IBAN, pièce d'identité, adresse).{' '}
              <strong style={{ color: T.deep }}>Tu reçois les paiements directement sur ton IBAN (2-7j)</strong>, Yoppaa ne prélève aucune commission sur les transactions.
            </p>
          </div>
          {/* Badge statut */}
          {onboardingComplet && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#F0FDF4', color: '#10B981', borderRadius: 100, padding: '4px 10px', fontSize: 12, fontWeight: 800, border: '1px solid #10B98133', flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              Connecté
            </span>
          )}
          {onboardingEnCours && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#FEF3C7', color: '#92400E', borderRadius: 100, padding: '4px 10px', fontSize: 12, fontWeight: 800, border: '1px solid #F59E0B33', flexShrink: 0 }}>
              ⏳ À finaliser
            </span>
          )}
          {!estConnecte && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#F3F4F6', color: T.muted, borderRadius: 100, padding: '4px 10px', fontSize: 12, fontWeight: 800, border: `1px solid ${T.hairline}`, flexShrink: 0 }}>
              Non connecté
            </span>
          )}
        </div>

        {/* Détails compte */}
        {estConnecte && (
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: T.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>ID Stripe</span>
              <span style={{ fontFamily: 'monospace', color: T.deep, fontSize: 11 }}>{commercant.stripe_account_id?.slice(0, 8)}…{commercant.stripe_account_id?.slice(-4)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Encaisser des paiements</span>
              <span style={{ fontWeight: 700, color: commercant.stripe_account_charges_enabled ? '#10B981' : '#DC2626' }}>
                {commercant.stripe_account_charges_enabled ? '✓ Actif' : '✕ Inactif'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Versements vers IBAN</span>
              <span style={{ fontWeight: 700, color: commercant.stripe_account_payouts_enabled ? '#10B981' : '#DC2626' }}>
                {commercant.stripe_account_payouts_enabled ? '✓ Actif' : '✕ Inactif'}
              </span>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!estConnecte && (
            <button onClick={ouvrirOnboarding} disabled={connecting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.625rem 1.125rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.875rem', cursor: connecting ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${T.main}55`, opacity: connecting ? 0.6 : 1 }}>
              {connecting ? 'Redirection vers Stripe…' : (<>Connecter mon compte Stripe
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
              </>)}
            </button>
          )}
          {onboardingEnCours && (
            <button onClick={ouvrirOnboarding} disabled={connecting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.625rem 1.125rem', background: '#FEF3C7', color: '#92400E', border: '1.5px solid #F59E0B66', borderRadius: 100, fontWeight: 800, fontSize: '0.875rem', cursor: connecting ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
              {connecting ? 'Redirection vers Stripe…' : 'Continuer l\'onboarding →'}
            </button>
          )}
          {estConnecte && (
            <button onClick={rafraichirStatus} disabled={refreshing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.875rem', background: '#fff', color: T.muted, border: `1.5px solid ${T.hairline}`, borderRadius: 100, fontWeight: 700, fontSize: '0.78rem', cursor: refreshing ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
              {refreshing ? 'Actualisation…' : '↻ Actualiser le statut'}
            </button>
          )}
        </div>
      </div>

      {/* ─── SECTION 2 : Toggle 'Acompte en ligne pour les RDV vitrine' ─── */}
      {commercant.categorie === 'vitrine' && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: `1px solid ${T.hairline}`, boxShadow: '0 1px 3px rgba(22,6,54,0.04)', opacity: onboardingComplet ? 1 : 0.55 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0, marginBottom: 4 }}>Réservation de RDV</p>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: T.ink, margin: 0, letterSpacing: '-0.3px' }}>Exiger un acompte en ligne</h3>
              <p style={{ fontSize: '0.82rem', color: T.muted, lineHeight: 1.5, marginTop: 6 }}>
                Quand activé, tes clients devront payer l'acompte de la prestation par carte AU MOMENT de réserver.
                Réduit les no-shows. Refund automatique si le client annule dans les délais ({commercant.rdv_delai_annulation_heures || 24}h avant le RDV).
                {!onboardingComplet && <><br/><strong style={{ color: '#92400E' }}>⚠ Connecte d'abord ton compte Stripe pour activer cette option.</strong></>}
              </p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, flexShrink: 0, cursor: onboardingComplet ? 'pointer' : 'not-allowed' }}>
              <input type="checkbox"
                checked={!!commercant.rdv_acompte_en_ligne_actif}
                disabled={!onboardingComplet || savingToggle}
                onChange={(e) => toggleAcompteEnLigne(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}/>
              <span style={{
                position: 'absolute', cursor: onboardingComplet ? 'pointer' : 'not-allowed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: commercant.rdv_acompte_en_ligne_actif ? T.main : '#D1D5DB',
                borderRadius: 100, transition: '0.2s',
              }}>
                <span style={{
                  position: 'absolute',
                  height: 20, width: 20,
                  left: commercant.rdv_acompte_en_ligne_actif ? 24 : 4,
                  top: 3,
                  background: '#fff', borderRadius: '50%',
                  transition: '0.2s',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                }}/>
              </span>
            </label>
          </div>
        </div>
      )}

      {/* ─── Info doc / sécurité ─── */}
      <div style={{ background: T.pale, borderRadius: 10, padding: '12px 14px', border: `1px solid ${T.main}22` }}>
        <p style={{ fontSize: 12, color: T.deep, margin: 0, lineHeight: 1.55 }}>
          🔒 <strong>Sécurité & autonomie</strong> : Yoppaa n'a JAMAIS accès à ton argent. Tous les paiements transitent
          directement de la carte du client vers ton IBAN via Stripe Connect Express. Tu gardes 100% des paiements
          (zéro commission Yoppaa sur les transactions, on gagne uniquement sur ton abonnement mensuel).
        </p>
      </div>
    </div>
  )
}
