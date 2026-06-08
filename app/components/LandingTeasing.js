'use client'
// LandingTeasing — page mysterieuse pendant la phase 8/06 → 7/07.
// Hero violet sombre + compteur en temps reel + formulaire pre-inscription
// minimaliste avec Cloudflare Turnstile invisible.
//
// La bascule auto vers le mode Reveal se fait cote serveur (composant parent
// passe mode='teasing' ou 'reveal').

import { useState, useEffect, useRef } from 'react'
import Script from 'next/script'

const T = {
  ink:     '#1A0840',
  panel:   '#160636',
  deep:    '#2D0F6B',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  bg:      '#F8F6FF',
  muted:   '#9CA3AF',
}

const REVEAL_DATE = new Date(process.env.NEXT_PUBLIC_LANDING_REVEAL_DATE || '2026-07-07T09:00:00+02:00')

function pad(n) { return String(n).padStart(2, '0') }

function calculerTempsRestant() {
  const now = new Date()
  const diff = Math.max(0, REVEAL_DATE.getTime() - now.getTime())
  const jours    = Math.floor(diff / (1000 * 60 * 60 * 24))
  const heures   = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const minutes  = Math.floor((diff / (1000 * 60)) % 60)
  const secondes = Math.floor((diff / 1000) % 60)
  return { jours, heures, minutes, secondes, ecoule: diff === 0 }
}

export default function LandingTeasing() {
  const [temps, setTemps] = useState(calculerTempsRestant())
  const [form, setForm] = useState({
    email: '', code_postal: '', type_utilisateur: 'yopper', message: '', consentement_marketing: true,
  })
  const [statut, setStatut] = useState({ envoi: 'idle', message: null })  // 'idle'|'envoi'|'ok'|'ko'
  const [turnstileToken, setTurnstileToken] = useState(null)
  const turnstileRef = useRef(null)

  // Compteur en temps reel (tick chaque seconde, pause si onglet pas visible)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const tick = () => setTemps(calculerTempsRestant())
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Turnstile invisible callback : on stocke le token quand recu
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.onTurnstileSuccess = (token) => setTurnstileToken(token)
    window.onTurnstileExpired = () => setTurnstileToken(null)
    window.onTurnstileError   = () => setTurnstileToken(null)
  }, [])

  async function soumettre(e) {
    e.preventDefault()
    if (statut.envoi === 'envoi') return

    setStatut({ envoi: 'envoi', message: null })
    try {
      const res = await fetch('/api/pre-inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          code_postal: form.code_postal,
          type_utilisateur: form.type_utilisateur,
          message: form.message,
          consentement_marketing: form.consentement_marketing,
          turnstile_token: turnstileToken,
        }),
      })
      const j = await res.json()
      if (!j.ok) {
        setStatut({ envoi: 'ko', message: j.error || 'Une erreur est survenue, réessaie' })
        return
      }
      setStatut({ envoi: 'ok', message: 'Bien reçu 🟣 Tu fais partie des premiers curieux. À très vite !' })
      // Reset Turnstile pour permettre une nouvelle soumission si besoin
      if (typeof window !== 'undefined' && window.turnstile && turnstileRef.current) {
        try { window.turnstile.reset(turnstileRef.current) } catch (_) {}
      }
    } catch (err) {
      setStatut({ envoi: 'ko', message: 'Erreur réseau, réessaie' })
    }
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const formValide = form.email.trim() && /^\d{4}$/.test(form.code_postal.trim()) && form.consentement_marketing

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(135deg, ${T.ink} 0%, ${T.deep} 60%, ${T.panel} 100%)`, color: '#fff', fontFamily: '"DM Sans", sans-serif', position: 'relative', overflowX: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer/>

      {/* Halo decoratif */}
      <div aria-hidden="true" style={{ position: 'absolute', top: '-200px', right: '-200px', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${T.main}33 0%, transparent 60%)`, pointerEvents: 'none' }}/>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: '-300px', left: '-200px', width: 700, height: 700, borderRadius: '50%', background: `radial-gradient(circle, ${T.mid}25 0%, transparent 60%)`, pointerEvents: 'none' }}/>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 60px', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', minHeight: '100dvh', justifyContent: 'center' }}>

        {/* Logo wordmark tricolore */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#fff', opacity: 0.85 }}/>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: T.light }}/>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: T.mid }}/>
          </div>
          <p style={{ margin: 0, fontWeight: 900, fontSize: 28, letterSpacing: '-1.2px', lineHeight: 1 }}>
            <span style={{ color: '#fff' }}>yo</span>
            <span style={{ color: T.light }}>pp</span>
            <span style={{ color: T.mid }}>aa</span>
          </p>
        </div>

        {/* Symbole pulse */}
        <div style={{ fontSize: 60, marginBottom: 16, animation: 'pulse 2.4s ease-in-out infinite' }}>🟣</div>

        {/* Headline mystere */}
        <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.4rem)', fontWeight: 900, letterSpacing: '-1.8px', lineHeight: 1.1, margin: '0 0 14px', maxWidth: 580 }}>
          Quelque chose se prépare<br/>à <span style={{ color: T.light }}>Mettet</span>.
        </h1>
        <p style={{ fontSize: '1.05rem', color: T.light, lineHeight: 1.6, maxWidth: 480, margin: '0 0 36px', opacity: 0.92 }}>
          Un projet belge. Un projet pour ton quartier.<br/>
          Lancement complet le <strong style={{ color: '#fff' }}>7 juillet 2026</strong>.
        </p>

        {/* Compteur */}
        <div style={{ display: 'flex', gap: 'clamp(10px, 3vw, 22px)', marginBottom: 44, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { val: temps.jours,    label: 'jours' },
            { val: temps.heures,   label: 'heures' },
            { val: temps.minutes,  label: 'minutes' },
            { val: temps.secondes, label: 'secondes' },
          ].map(({ val, label }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 }}>
              <span style={{ fontSize: 'clamp(2.4rem, 7vw, 3.6rem)', fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums', textShadow: `0 4px 24px ${T.main}80` }}>
                {pad(val)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4, opacity: 0.85 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Formulaire pre-inscription */}
        {statut.envoi === 'ok' ? (
          <div style={{ background: 'rgba(16,185,129,0.15)', border: `1.5px solid #10B98166`, borderRadius: 18, padding: '24px 22px', maxWidth: 460, width: '100%', backdropFilter: 'blur(12px)' }}>
            <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#A7F3D0' }}>
              ✓ {statut.message}
            </p>
          </div>
        ) : (
          <form onSubmit={soumettre} style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '24px 22px', maxWidth: 460, width: '100%', backdropFilter: 'blur(12px)' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>Sois prévenu en premier</p>
            <p style={{ fontSize: 12, color: T.light, margin: '0 0 16px', opacity: 0.85, lineHeight: 1.5 }}>
              Laisse-nous ton email et le 7 juillet, tu seras parmi les premiers à découvrir Yoppaa.
            </p>

            <input type="email" required placeholder="Ton email"
              value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              style={inputStyle}/>

            <input type="text" required inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="Ton code postal (4 chiffres)"
              value={form.code_postal} onChange={e => setForm(p => ({ ...p, code_postal: e.target.value.replace(/\D/g, '').slice(0,4) }))}
              style={inputStyle}/>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              {[
                { val: 'yopper',     label: 'Je suis curieux' },
                { val: 'commercant', label: 'Je suis commerçant' },
              ].map(opt => {
                const actif = form.type_utilisateur === opt.val
                return (
                  <button key={opt.val} type="button"
                    onClick={() => setForm(p => ({ ...p, type_utilisateur: opt.val }))}
                    style={{ flex: 1, padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${actif ? T.light : 'rgba(255,255,255,0.18)'}`, background: actif ? 'rgba(196,160,244,0.18)' : 'transparent', color: actif ? '#fff' : T.light, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>

            <textarea placeholder="Un message ? (optionnel)" rows={2}
              value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value.slice(0, 500) }))}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 50 }}/>

            {/* Cloudflare Turnstile invisible */}
            {siteKey && (
              <div ref={turnstileRef} className="cf-turnstile"
                data-sitekey={siteKey}
                data-callback="onTurnstileSuccess"
                data-expired-callback="onTurnstileExpired"
                data-error-callback="onTurnstileError"
                data-size="invisible"/>
            )}

            <button type="submit" disabled={statut.envoi === 'envoi' || !formValide}
              style={{ width: '100%', padding: '14px', borderRadius: 100, border: 'none', background: !formValide || statut.envoi === 'envoi' ? 'rgba(255,255,255,0.12)' : `linear-gradient(135deg, ${T.light}, ${T.mid})`, color: !formValide || statut.envoi === 'envoi' ? 'rgba(255,255,255,0.5)' : T.ink, fontWeight: 900, fontSize: 14, letterSpacing: 0.5, textTransform: 'uppercase', cursor: !formValide || statut.envoi === 'envoi' ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s', marginTop: 4 }}>
              {statut.envoi === 'envoi' ? 'Envoi…' : 'Me prévenir du lancement'}
            </button>

            {statut.envoi === 'ko' && statut.message && (
              <p style={{ margin: '12px 0 0', fontSize: 12, color: '#FCA5A5', fontWeight: 700, textAlign: 'center' }}>
                ⚠ {statut.message}
              </p>
            )}

            <p style={{ margin: '14px 0 0', fontSize: 11, color: T.light, opacity: 0.7, textAlign: 'center', lineHeight: 1.5 }}>
              🔒 Aucun spam. Données protégées.
            </p>
          </form>
        )}

        {/* Footer minimal */}
        <footer style={{ marginTop: 60, fontSize: 11, color: T.light, opacity: 0.6, lineHeight: 1.7 }}>
          <p style={{ margin: 0 }}>📧 hello@yoppaa.app · 📍 Mettet, Belgique</p>
          <p style={{ margin: '6px 0 0' }}>Yoppaa est un projet d'Avcotech SRL · BCE 0731.637.148</p>
        </footer>
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50%      { transform: scale(1.08); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1.5px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 12,
  fontFamily: '"DM Sans", sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
}
