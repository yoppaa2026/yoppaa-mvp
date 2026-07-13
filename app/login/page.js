'use client'
import { Suspense, useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import TurnstileWidget from '@/app/components/TurnstileWidget'

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

export default function LoginPage() {
  // Suspense wrapper requis par Next.js 16 pour useSearchParams (build statique).
  return (
    <Suspense fallback={null}>
      <Login/>
    </Suspense>
  )
}

function Login() {
  const [mode, setMode] = useState('magic') // 'magic' | 'password'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams?.get('next') || '/dashboard'
  const modeAdmin = nextPath === '/admin'
  const turnstileRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push(nextPath)
      else setCheckingSession(false)
    })
  }, [router, nextPath])

  function resetForm() {
    setError('')
    setSent(false)
  }

  async function envoyerMagicLink() {
    if (!email.trim()) return setError('Email obligatoire')
    setLoading(true); setError('')
    const captchaToken = await turnstileRef.current?.getToken()
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
        captchaToken,
      }
    })
    if (err) {
      setError(err.message || JSON.stringify(err))
      setLoading(false); return
    }
    setSent(true); setLoading(false)
  }

  async function connexionMotDePasse() {
    if (!email.trim()) return setError('Email obligatoire')
    if (!password.trim()) return setError('Mot de passe obligatoire')
    setLoading(true); setError('')
    const captchaToken = await turnstileRef.current?.getToken()
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
      options: { captchaToken },
    })
    if (err) {
      setError('Email ou mot de passe incorrect')
      setLoading(false); return
    }
    router.push(nextPath)
  }

  if (checkingSession) return (
    <div style={{ minHeight: '100vh', background: T.bgPanel, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: T.light, fontFamily: '"DM Sans", sans-serif' }}>Chargement...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg, ${T.bgPanel} 0%, #2D0F6B 50%, ${T.ink} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
            {[
              { color: '#fff', opacity: 0.45 },
              { color: T.light, opacity: 1 },
              { color: T.mid, opacity: 1 },
            ].map((d, i) => (
              <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: d.color, opacity: d.opacity, boxShadow: `0 0 12px ${d.color}66` }}/>
            ))}
          </div>
          <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2.5rem', letterSpacing: '-0.05em', color: '#fff', lineHeight: 1, marginBottom: 6 }}>yoppaa</p>
          <p style={{ color: T.light, fontSize: '0.8rem', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' }}>
            {modeAdmin ? <><Lock size={14} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/>Espace admin</> : 'Espace commerçant'}
          </p>
        </div>

        {/* Card */}
        <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', borderRadius: 20, padding: '2rem', border: `1px solid rgba(255,255,255,0.12)`, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          {!sent ? (
            <>
              <h1 style={{ fontWeight: 800, fontSize: '1.25rem', color: '#fff', marginBottom: '1.25rem', letterSpacing: '-0.5px' }}>
                {modeAdmin ? 'Console admin' : 'Connexion'}
              </h1>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 4 }}>
                {[
                  { key: 'magic', label: '✉️ Lien magique' },
                  { key: 'password', label: '🔑 Mot de passe' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { setMode(tab.key); resetForm() }}
                    style={{
                      flex: 1,
                      padding: '0.55rem 0.5rem',
                      border: 'none',
                      borderRadius: 10,
                      background: mode === tab.key ? T.main : 'transparent',
                      color: mode === tab.key ? '#fff' : T.light,
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      fontFamily: '"DM Sans", sans-serif',
                      transition: 'all 0.15s',
                      boxShadow: mode === tab.key ? `0 2px 12px ${T.main}66` : 'none',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Email field — commun aux deux modes */}
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Adresse email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    mode === 'magic' ? envoyerMagicLink() : connexionMotDePasse()
                  }
                }}
                placeholder="ton@email.com"
                style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: 12, border: `1.5px solid ${error ? '#DC2626' : 'rgba(255,255,255,0.2)'}`, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', outline: 'none', boxSizing: 'border-box', marginBottom: 12, transition: 'border-color 0.15s' }}
                autoFocus
              />

              {/* Mot de passe — uniquement en mode password */}
              {mode === 'password' && (
                <>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                    Mot de passe
                  </label>
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError('') }}
                      onKeyDown={e => e.key === 'Enter' && connexionMotDePasse()}
                      placeholder="••••••••"
                      style={{ width: '100%', padding: '0.875rem 3rem 0.875rem 1rem', borderRadius: 12, border: `1.5px solid ${error ? '#DC2626' : 'rgba(255,255,255,0.2)'}`, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                    />
                    <button
                      onClick={() => setShowPassword(p => !p)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.light, fontSize: '1.1rem', padding: 4 }}
                    >
                      {showPassword ? <EyeOff size={16} strokeWidth={1.8}/> : <Eye size={16} strokeWidth={1.8}/>}
                    </button>
                  </div>
                </>
              )}

              {/* Description mode magic */}
              {mode === 'magic' && (
                <p style={{ fontSize: '0.78rem', color: `${T.light}99`, marginBottom: 16, lineHeight: 1.5 }}>
                  On t&apos;envoie un lien sécurisé par email — aucun mot de passe à retenir.
                </p>
              )}

              {error && <p style={{ fontSize: '0.78rem', color: '#FCA5A5', marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={13} strokeWidth={1.8}/> {error}</p>}

              <button
                onClick={mode === 'magic' ? envoyerMagicLink : connexionMotDePasse}
                disabled={loading}
                style={{ width: '100%', padding: '0.9rem', border: 'none', borderRadius: 100, background: loading ? `${T.main}88` : T.main, color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: loading ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 20px ${T.main}66`, transition: 'all 0.15s' }}
              >
                {loading
                  ? (mode === 'magic' ? 'Envoi en cours...' : 'Connexion...')
                  : (mode === 'magic' ? 'Recevoir mon lien de connexion →' : 'Se connecter →')
                }
              </button>

              {/* Anti-bot Cloudflare Turnstile (invisible) */}
              <TurnstileWidget ref={turnstileRef} />

              <p style={{ fontSize: '0.72rem', color: `${T.light}66`, textAlign: 'center', marginTop: '1rem', lineHeight: 1.5 }}>
                {modeAdmin
                  ? 'Accès réservé à l\'équipe Yoppaa.'
                  : 'Accès réservé aux commerçants partenaires Yoppaa.'}
              </p>

              {/* Lien acquisition : masqué en mode admin */}
              {!modeAdmin && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                  <a href="/signup"
                    style={{ display: 'inline-block', color: T.light, fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none', padding: '8px 4px', letterSpacing: '-0.2px' }}>
                    Pas encore inscrit&nbsp;? <span style={{ color: '#fff', textDecoration: 'underline' }}>Découvrir Yoppaa Pro →</span>
                  </a>
                </div>
              )}
            </>
          ) : (
            /* Écran confirmation magic link */
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📬</div>
              <h2 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff', marginBottom: '0.75rem', letterSpacing: '-0.5px' }}>
                Vérifie ta boîte mail !
              </h2>
              <p style={{ fontSize: '0.875rem', color: T.light, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                On vient d&apos;envoyer un lien de connexion à<br/>
                <strong style={{ color: '#fff' }}>{email}</strong><br/>
                Clique sur le lien pour accéder à ton dashboard.
              </p>
              <p style={{ fontSize: '0.75rem', color: `${T.light}88` }}>
                Le lien expire dans 1 heure.<br/>
                Vérifie aussi tes spams si tu ne le vois pas.
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                style={{ marginTop: '1.5rem', padding: '0.6rem 1.5rem', border: `1px solid rgba(255,255,255,0.2)`, borderRadius: 100, background: 'transparent', color: T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.82rem' }}
              >
                ← Changer d&apos;email
              </button>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', color: `${T.light}66`, fontSize: '0.72rem', marginTop: '1.5rem' }}>
          yoppaa.app · Skip the wait
        </p>
      </div>
    </div>
  )
}