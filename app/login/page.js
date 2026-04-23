'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)
  const router = useRouter()

  // Si déjà connecté → rediriger vers dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/dashboard')
      else setCheckingSession(false)
    })
  }, [router])

  async function envoyerMagicLink() {
    if (!email.trim()) return setError('Email obligatoire')
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      }
    })
    if (err) {
      setError(err.message || JSON.stringify(err))
      setLoading(false); return
    }
    setSent(true); setLoading(false)
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
          <p style={{ fontWeight: 900, fontSize: '2.5rem', letterSpacing: '-2px', color: '#fff', lineHeight: 1, marginBottom: 6 }}>yoppaa</p>
          <p style={{ color: T.light, fontSize: '0.8rem', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' }}>Espace commerçant</p>
        </div>

        {/* Card */}
        <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', borderRadius: 20, padding: '2rem', border: `1px solid rgba(255,255,255,0.12)`, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          {!sent ? (
            <>
              <h1 style={{ fontWeight: 800, fontSize: '1.25rem', color: '#fff', marginBottom: 6, letterSpacing: '-0.5px' }}>Connexion</h1>
              <p style={{ fontSize: '0.82rem', color: T.light, marginBottom: '1.5rem', lineHeight: 1.5 }}>
                Entre ton email — on t'envoie un lien de connexion sécurisé. Pas de mot de passe à retenir.
              </p>

              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Adresse email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && envoyerMagicLink()}
                placeholder="ton@email.com"
                style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: 12, border: `1.5px solid ${error ? '#DC2626' : 'rgba(255,255,255,0.2)'}`, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', outline: 'none', boxSizing: 'border-box', marginBottom: error ? 6 : 16, transition: 'border-color 0.15s' }}
                autoFocus
              />
              {error && <p style={{ fontSize: '0.78rem', color: '#FCA5A5', marginBottom: 16 }}>⚠️ {error}</p>}

              <button onClick={envoyerMagicLink} disabled={loading}
                style={{ width: '100%', padding: '0.9rem', border: 'none', borderRadius: 100, background: loading ? `${T.main}88` : T.main, color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: loading ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 20px ${T.main}66`, transition: 'all 0.15s' }}>
                {loading ? 'Envoi en cours...' : 'Recevoir mon lien de connexion →'}
              </button>

              <p style={{ fontSize: '0.72rem', color: `${T.light}88`, textAlign: 'center', marginTop: '1rem', lineHeight: 1.5 }}>
                Accès réservé aux commerçants partenaires Yoppaa.
              </p>
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📬</div>
              <h2 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff', marginBottom: '0.75rem', letterSpacing: '-0.5px' }}>
                Vérifie ta boîte mail !
              </h2>
              <p style={{ fontSize: '0.875rem', color: T.light, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                On vient d'envoyer un lien de connexion à<br/>
                <strong style={{ color: '#fff' }}>{email}</strong><br/>
                Clique sur le lien pour accéder à ton dashboard.
              </p>
              <p style={{ fontSize: '0.75rem', color: `${T.light}88` }}>
                Le lien expire dans 1 heure.<br/>
                Vérifie aussi tes spams si tu ne le vois pas.
              </p>
              <button onClick={() => { setSent(false); setEmail('') }}
                style={{ marginTop: '1.5rem', padding: '0.6rem 1.5rem', border: `1px solid rgba(255,255,255,0.2)`, borderRadius: 100, background: 'transparent', color: T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.82rem' }}>
                ← Changer d'email
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