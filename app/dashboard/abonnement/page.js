'use client'
// ═══════════════════════════════════════════════════════════════════════════
// /dashboard/abonnement
//
// Onglet "Abonnement" du dashboard commerçant.
// Affiche le plan actuel + permet de souscrire à Communiquer / Vendre via
// Stripe Checkout (essai 30j inclus).
//
// État subscription :
//   - exister + pas de stripe_subscription_id  → boutons Upgrade visibles
//   - billing_exempt = true (partenaires test)  → message "Partenariat test"
//   - subscription_status = trialing/active     → renvoie vers Customer Portal (Phase 3b)
//   - subscription_status = past_due/canceled   → message + bouton réactiver
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { PLAN_LABEL } from '@/lib/plans'

const T = {
  ink:    '#1A0840',
  deep:   '#2D0F6B',
  main:   '#6B35C4',
  mid:    '#9660E0',
  light:  '#C4A0F4',
  pale:   '#EDE0FF',
  bg:     '#F8F6FF',
  muted:  '#6B7280',
}

const TARIF_COMMUNIQUER = parseFloat(process.env.NEXT_PUBLIC_TARIF_COMMUNIQUER || '19.90')
const TARIF_VENDRE      = parseFloat(process.env.NEXT_PUBLIC_TARIF_VENDRE      || '49.90')

export default function AbonnementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [commercant, setCommercant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionPlan, setActionPlan] = useState(null)  // 'communiquer' | 'vendre' pendant l'appel API
  const [error, setError] = useState(null)
  const [checkoutResult, setCheckoutResult] = useState(null)

  // Chargement du commerçant lié au user connecté
  useEffect(() => {
    let mounted = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cmrc, error: err } = await supabase
        .from('commercants')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (!mounted) return
      if (err || !cmrc) {
        setError('Impossible de charger votre fiche commerçant.')
        setLoading(false)
        return
      }
      setCommercant(cmrc)
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [router])

  // Détection retour Stripe Checkout (success ou canceled)
  useEffect(() => {
    const status = searchParams.get('stripe_checkout')
    if (status === 'success') {
      setCheckoutResult({ ok: true, message: 'Merci ! Votre abonnement est en cours d\'activation. Vous recevrez un email de confirmation dans quelques instants.' })
    } else if (status === 'canceled') {
      setCheckoutResult({ ok: false, message: 'Souscription annulée. Vous pouvez relancer le processus à tout moment.' })
    }
  }, [searchParams])

  async function handleUpgrade(targetPlan) {
    if (!commercant?.id) return
    setActionPlan(targetPlan)
    setError(null)
    try {
      const res = await fetch('/api/stripe/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commercantId: commercant.id, targetPlan }),
      })
      const json = await res.json()
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || 'Erreur lors de la création de la session de paiement')
      }
      // Redirection vers Stripe Checkout
      window.location.href = json.url
    } catch (e) {
      setError(e?.message || 'Erreur inconnue')
      setActionPlan(null)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, padding: '60px 20px', fontFamily: '"DM Sans", system-ui, sans-serif', textAlign: 'center' }}>
        <p style={{ color: T.muted }}>Chargement de votre abonnement…</p>
      </div>
    )
  }

  if (error || !commercant) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, padding: '60px 20px', fontFamily: '"DM Sans", system-ui, sans-serif', textAlign: 'center' }}>
        <p style={{ color: '#DC2626', fontWeight: 700 }}>{error || 'Fiche commerçant introuvable.'}</p>
      </div>
    )
  }

  const plan = commercant.plan || 'exister'
  const isExempt = commercant.billing_exempt === true
  const hasActiveSub = commercant.subscription_status && ['active', 'trialing', 'past_due'].includes(commercant.subscription_status)
  const planLabel = PLAN_LABEL[plan] || plan

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '32px 20px 80px', fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>

        {/* Lien retour dashboard */}
        <a href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.main, textDecoration: 'none', fontWeight: 700, marginBottom: 18 }}>
          ← Retour au dashboard
        </a>

        {/* Titre */}
        <h1 style={{ fontSize: 32, fontWeight: 900, color: T.ink, letterSpacing: '-1px', margin: '0 0 6px' }}>
          Abonnement Yoppaa
        </h1>
        <p style={{ fontSize: 15, color: T.muted, margin: '0 0 28px' }}>
          Gérez votre formule, vos paiements et vos factures.
        </p>

        {/* Bandeau résultat checkout (success ou canceled) */}
        {checkoutResult && (
          <div style={{
            background: checkoutResult.ok ? '#ECFDF5' : '#FEF3C7',
            border: `1px solid ${checkoutResult.ok ? '#10B98144' : '#F59E0B44'}`,
            borderRadius: 12, padding: '14px 18px', marginBottom: 24,
            color: checkoutResult.ok ? '#065F46' : '#92400E', fontSize: 14, fontWeight: 600,
          }}>
            {checkoutResult.message}
          </div>
        )}

        {/* Carte plan actuel */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', border: `1px solid ${T.pale}`, marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 6px' }}>Votre formule actuelle</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0 }}>{planLabel}</h2>
            {isExempt && (
              <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, background: T.pale, padding: '4px 10px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Partenariat test
              </span>
            )}
            {hasActiveSub && (
              <span style={{ fontSize: 11, fontWeight: 800, color: '#065F46', background: '#ECFDF5', padding: '4px 10px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {commercant.subscription_status === 'trialing' ? 'Essai en cours' : 'Abonnement actif'}
              </span>
            )}
          </div>
          {isExempt && (
            <p style={{ fontSize: 13, color: T.muted, margin: '12px 0 0', lineHeight: 1.55 }}>
              Vous bénéficiez d'un accès gratuit à Yoppaa au titre de notre partenariat de lancement. Aucune facturation en cours. Quand vous serez prêt à activer votre formule payante, contactez-nous à <a href="mailto:hello@yoppaa.app" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>hello@yoppaa.app</a>.
            </p>
          )}
          {hasActiveSub && (
            <p style={{ fontSize: 13, color: T.muted, margin: '12px 0 0', lineHeight: 1.55 }}>
              Pour mettre à jour votre carte, changer de formule ou résilier, l'accès au portail client sera disponible très prochainement.
            </p>
          )}
        </div>

        {/* Boutons d'upgrade (visibles si pas de sub active et pas exempt) */}
        {!hasActiveSub && !isExempt && (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 900, color: T.deep, letterSpacing: '-0.3px', margin: '8px 0 14px' }}>
              {plan === 'exister' ? 'Passez au niveau supérieur' : 'Choisissez votre formule'}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

              {/* Carte Communiquer */}
              <PlanCard
                title="Communiquer"
                price={TARIF_COMMUNIQUER}
                features={[
                  'Push ciblés illimités aux Yoppers',
                  'Segmentation des favoris',
                  'Newsletter ciblée',
                  'Statistiques d\'engagement',
                  'IA bridée (reformulation + suggestions)',
                  'Mise en avant Bonnes affaires',
                ]}
                cta="Démarrer l'essai 30 jours"
                trial="30 jours gratuits, puis 19,90€/mois sans engagement"
                loading={actionPlan === 'communiquer'}
                onClick={() => handleUpgrade('communiquer')}
                accent={false}
              />

              {/* Carte Vendre */}
              <PlanCard
                title="Vendre"
                price={TARIF_VENDRE}
                features={[
                  'Tout Communiquer +',
                  'Transactionnel (commandes, RDV, réservations)',
                  'Paiement en ligne (Stripe Connect)',
                  'Fidélité configurable',
                  'IA avancée (rédaction, segmentation, benchmarking)',
                  'Export comptable',
                ]}
                cta="Démarrer l'essai 30 jours"
                trial="30 jours gratuits, puis 49,90€/mois sans engagement"
                loading={actionPlan === 'vendre'}
                onClick={() => handleUpgrade('vendre')}
                accent={true}
              />

            </div>

            {error && (
              <p style={{ color: '#DC2626', fontSize: 13, fontWeight: 700, marginTop: 16 }}>
                {error}
              </p>
            )}

            <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, margin: '24px 0 0' }}>
              Sans engagement, résiliable à tout moment. Tous les prix sont HTVA. La TVA applicable sera ajoutée au moment du paiement selon votre pays et votre statut TVA.
            </p>
          </>
        )}

      </div>
    </div>
  )
}

// ────────── Composant carte de plan ──────────
function PlanCard({ title, price, features, cta, trial, loading, onClick, accent }) {
  return (
    <div style={{
      background: accent ? `linear-gradient(160deg, ${T.deep} 0%, ${T.main} 100%)` : '#fff',
      color: accent ? '#fff' : T.ink,
      borderRadius: 16, padding: '24px 26px',
      border: accent ? 'none' : `1px solid ${T.pale}`,
      boxShadow: accent ? '0 12px 32px rgba(107,53,196,0.25)' : '0 2px 8px rgba(26,8,64,0.05)',
      display: 'flex', flexDirection: 'column', minHeight: 380,
    }}>
      <p style={{ fontSize: 11, fontWeight: 800, color: accent ? T.light : T.muted, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 6px' }}>Formule</p>
      <h3 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.5px', margin: 0 }}>{title}</h3>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '14px 0 4px' }}>
        <p style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-1px', margin: 0 }}>
          {price.toFixed(2).replace('.', ',')}€
        </p>
        <p style={{ fontSize: 13, color: accent ? T.light : T.muted, margin: 0 }}>HTVA / mois</p>
      </div>
      <p style={{ fontSize: 12, color: accent ? T.light : T.muted, margin: '0 0 18px' }}>{trial}</p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ color: accent ? '#fff' : T.main, flexShrink: 0, marginTop: 1 }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onClick}
        disabled={loading}
        style={{
          padding: '12px 22px',
          background: accent ? '#fff' : T.main,
          color: accent ? T.main : '#fff',
          border: 'none', borderRadius: 100, cursor: loading ? 'wait' : 'pointer',
          fontWeight: 800, fontSize: 14, letterSpacing: '-0.2px',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Redirection…' : cta}
      </button>
    </div>
  )
}
