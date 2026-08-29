'use client'
//
// /commander/rdv/cancel?token=...
//
// Page d'annulation depuis lien email confirmation RDV vitrine.
// Lien typique : https://www.yoppaa.app/commander/rdv/cancel?token=<annulation_token>
//
// Flow :
//   1. Lecture token URL
//   2. Affichage écran confirmation "Tu veux annuler ?"
//   3. Click "Confirmer" → POST /api/rdv/cancel avec { token }
//   4. Affichage résultat (succès refund ou erreur cutoff)

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { euros } from '@/lib/montants'

const T = {
  bg:      '#F8F6FF',
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

export default function RdvCancelPage() {
  const router = useRouter()
  const [token, setToken] = useState(null)
  const [step, setStep] = useState('confirm')
  const [loading, setLoading] = useState(false)
  const [resultat, setResultat] = useState(null)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (!t) {
      setErreur('Lien d\'annulation invalide ou expiré.')
      setStep('erreur')
      return
    }
    setToken(t)
  }, [])

  // Le rendez-vous porte des produits déjà payés : le serveur refuse d'annuler
  // tant que le client n'a pas dit ce qu'il en fait. On ne décide pas à sa
  // place, et ce choix commande le montant remboursé.
  const [produits, setProduits] = useState(null)

  async function confirmer(produitsChoix = null) {
    if (!token) return
    setLoading(true)
    setErreur(null)
    try {
      const res = await fetch('/api/rdv/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...(produitsChoix ? { produits_choix: produitsChoix } : {}) }),
      })
      const data = await res.json()
      if (data?.choix_produits_requis) {
        setProduits(data.produits)
        setStep('produits')
        return
      }
      if (!res.ok || !data.ok) {
        setErreur(data?.error || 'Annulation impossible.')
        setStep('erreur')
        return
      }
      setResultat(data)
      setStep('succes')
    } catch (e) {
      console.error('[rdv/cancel] erreur', e)
      setErreur(`Erreur : ${e?.message || 'inconnue'}. Réessaie ou contacte-nous.`)
      setStep('erreur')
    } finally {
      setLoading(false)
    }
  }

  const cardSt = {
    background: '#fff',
    borderRadius: 20,
    padding: '2rem 1.5rem',
    margin: '0 auto',
    maxWidth: 440,
    border: `1.5px solid ${T.pale}`,
    boxShadow: `0 8px 28px ${T.main}11`,
  }
  const btnPrimary = {
    width: '100%', padding: '1rem', border: 'none', borderRadius: 100,
    fontWeight: 800, cursor: 'pointer', fontSize: '1rem',
    background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff',
    boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif',
  }
  const btnSecondary = {
    width: '100%', padding: '1rem', border: `1.5px solid ${T.pale}`, borderRadius: 100,
    fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem',
    background: '#fff', color: T.deep, marginTop: 10,
    fontFamily: '"DM Sans", sans-serif',
  }

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, padding: '2rem 1rem', fontFamily: '"DM Sans", sans-serif' }}>
      <div style={cardSt}>
        {/* Wordmark Yoppaa */}
        <p style={{ textAlign: 'center', fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1.4rem', marginBottom: 24, letterSpacing: '-0.05em', lineHeight: 1 }}>
          <span style={{ color: T.ink }}>yo</span>
          <span style={{ color: T.main }}>pp</span>
          <span style={{ color: T.mid }}>aa</span>
        </p>

        {step === 'confirm' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: '#FFFBEB', border: '2px solid #F59E0B', marginBottom: 16 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <path d="M12 9v4M12 17h.01"/>
                </svg>
              </div>
              <h1 style={{ fontWeight: 900, fontSize: '1.5rem', color: T.ink, marginBottom: 8, letterSpacing: '-0.5px' }}>
                Annuler ton RDV ?
              </h1>
              <p style={{ color: T.muted, fontSize: '0.95rem', lineHeight: 1.5 }}>
                Si tu as payé un acompte en ligne, le remboursement sera lancé automatiquement.
              </p>
            </div>

            <button onClick={() => confirmer()} disabled={loading || !token} style={{ ...btnPrimary, opacity: !token ? 0.45 : 1 }}>
              {loading ? 'Annulation en cours…' : 'Confirmer l\'annulation'}
            </button>
            <button onClick={() => router.push('/commander')} style={btnSecondary}>
              Garder mon RDV
            </button>
          </>
        )}

        {/* Le rendez-vous portait des produits payés en même temps. Ils n'ont
            rien à voir avec le créneau annulé : le client décide s'il les garde.
            Lui rembourser d'office serait lui reprendre une marchandise qu'il
            voulait, les lui imposer serait une vente forcée. */}
        {step === 'produits' && produits && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h1 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.ink, marginBottom: 8, letterSpacing: '-0.5px' }}>
                Tu gardes tes produits ?
              </h1>
              <p style={{ color: T.muted, fontSize: '0.92rem', lineHeight: 1.55 }}>
                Tu avais acheté des produits avec ce rendez-vous. Ils sont déjà payés et mis de côté.
              </p>
            </div>

            <div style={{ background: '#F9FAFB', border: `1px solid ${T.pale}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
              {produits.lignes.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${T.pale}` }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: T.ink }}>{l.quantite} × {l.nom}</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: T.ink }}>{euros(l.total)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: T.deep }}>Total produits</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 900, color: T.main }}>{euros(produits.total)}</span>
              </div>
            </div>

            <button onClick={() => confirmer('garde')} disabled={loading} style={btnPrimary}>
              {loading ? 'En cours…' : 'Je garde mes produits'}
            </button>
            <p style={{ fontSize: '0.78rem', color: T.muted, textAlign: 'center', margin: '8px 0 16px', lineHeight: 1.45 }}>
              {produits.acompte > 0
                ? `Seul ton acompte de ${euros(produits.acompte)} te sera remboursé. Tes produits t'attendent en boutique.`
                : 'Tes produits t\'attendent en boutique, rien n\'est remboursé.'}
            </p>

            <button onClick={() => confirmer('rend')} disabled={loading} style={btnSecondary}>
              {loading ? 'En cours…' : 'Je rends tout et je me fais rembourser'}
            </button>
            <p style={{ fontSize: '0.78rem', color: T.muted, textAlign: 'center', margin: '8px 0 0', lineHeight: 1.45 }}>
              {euros(produits.rembourse != null ? produits.rembourse : Number(produits.total) + Number(produits.acompte))} reviennent sur ton moyen de paiement dans 5 à 10 jours.
            </p>
          </>
        )}

        {step === 'succes' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #10B981, #6EE7B7)', marginBottom: 16, boxShadow: '0 8px 28px rgba(16,185,129,0.45)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7"/>
                </svg>
              </div>
              <h1 style={{ fontWeight: 900, fontSize: '1.5rem', color: T.ink, marginBottom: 12, letterSpacing: '-0.5px' }}>
                RDV annulé 🟣
              </h1>
              <p style={{ color: T.deep, fontSize: '0.95rem', lineHeight: 1.55, fontWeight: 600 }}>
                {resultat?.message || 'Ton RDV est annulé.'}
              </p>
            </div>

            <button onClick={() => router.push('/commander')} style={btnPrimary}>
              Retour à Yoppaa
            </button>
          </>
        )}

        {step === 'erreur' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: '#FEF2F2', border: '2px solid #DC2626', marginBottom: 16 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M15 9l-6 6M9 9l6 6"/>
                </svg>
              </div>
              <h1 style={{ fontWeight: 900, fontSize: '1.5rem', color: T.ink, marginBottom: 12, letterSpacing: '-0.5px' }}>
                Annulation impossible
              </h1>
              <p style={{ color: T.deep, fontSize: '0.95rem', lineHeight: 1.55, fontWeight: 600 }}>
                {erreur}
              </p>
            </div>

            <button onClick={() => router.push('/commander')} style={btnPrimary}>
              Retour à Yoppaa
            </button>
          </>
        )}
      </div>
    </div>
  )
}
