'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const T = {
  bgPanel: '#160636',
  deep:    '#2D0F6B',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
}

function SessionHandler({ onSuccess, onError }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const next = searchParams.get('next') || '/dashboard'

    if (token_hash && type) {
      supabase.auth.verifyOtp({ token_hash, type }).then(({ data, error }) => {
        if (!error && data.session) {
          // Détecter si on est dans la PWA standalone
          const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true
          if (isStandalone) {
            // Déjà dans la PWA — rediriger directement
            router.replace(next)
          } else {
            // Dans Safari — afficher le bouton pour ouvrir la PWA
            onSuccess(next)
          }
        } else {
          onError()
          router.replace('/login?error=lien-invalide')
        }
      })
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true
          if (isStandalone) {
            router.replace('/dashboard')
          } else {
            onSuccess('/dashboard')
          }
        } else {
          onError()
          router.replace('/login?error=lien-invalide')
        }
      })
    }
  }, [router, searchParams, onSuccess, onError])

  return null
}

export default function SessionPage() {
  const [phase, setPhase] = useState('loading') // loading | open-pwa
  const [nextUrl, setNextUrl] = useState('/dashboard')

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, #1A0840 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"DM Sans", sans-serif',
      padding: '1rem',
      position: 'relative', overflow: 'hidden',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;800;900&display=swap" rel="stylesheet"/>
      {/* Déco */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 80% 20%, ${T.mid}33 0%, transparent 50%), radial-gradient(circle at 20% 80%, ${T.light}18 0%, transparent 50%)`, pointerEvents: 'none' }}/>

      <div style={{ textAlign: 'center', position: 'relative', width: '100%', maxWidth: 340 }}>

        {/* 3 points yo·pp·aa */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
          {[{c:'#fff',o:0.45,s:10},{c:T.light,o:1,s:13},{c:T.mid,o:1,s:10}].map((d, i) => (
            <div key={i} style={{
              width: d.s, height: d.s, borderRadius: '50%',
              background: d.c, opacity: d.o,
              boxShadow: `0 0 12px ${d.c}88`,
              animation: `dotPulse ${0.8 + i * 0.2}s ease-in-out ${i * 0.15}s infinite alternate`,
            }}/>
          ))}
        </div>

        {/* Wordmark */}
        <p style={{ fontWeight: 900, fontSize: '2rem', letterSpacing: '-2px', color: '#fff', marginBottom: 4, lineHeight: 1 }}>yoppaa</p>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, color: T.light, letterSpacing: '3px', textTransform: 'uppercase', opacity: 0.7, marginBottom: 32 }}>Pro</p>

        {phase === 'loading' && (
          <p style={{ color: T.light, fontSize: '0.875rem', fontWeight: 600, opacity: 0.8 }}>
            Connexion en cours...
          </p>
        )}

        {phase === 'open-pwa' && (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.25rem', marginBottom: 20, border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}>
              <p style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem', marginBottom: 6, letterSpacing: '-0.3px' }}>
                ✅ Connexion réussie !
              </p>
              <p style={{ fontSize: '0.8rem', color: T.light, opacity: 0.8, lineHeight: 1.5 }}>
                Pour continuer, ouvre l'app <strong style={{ color: '#fff' }}>Yoppaa Pro</strong> depuis ton écran d'accueil.
              </p>
            </div>

            {/* Bouton principal */}
            <a href={nextUrl}
              style={{ display: 'block', width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif', textDecoration: 'none', cursor: 'pointer', letterSpacing: '-0.3px', marginBottom: 12, boxSizing: 'border-box' }}>
              Ouvrir Yoppaa Pro →
            </a>

            {/* Instructions iOS */}
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '0.875rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: '0.72rem', color: T.light, opacity: 0.7, lineHeight: 1.6 }}>
                💡 Si ça ne s'ouvre pas automatiquement :<br/>
                Retourne sur l'écran d'accueil → tape l'icône <strong style={{ color: '#fff' }}>Yoppaa Pro</strong>
              </p>
            </div>
          </div>
        )}

        <style>{`
          @keyframes dotPulse { from { transform:scale(0.8); opacity:0.5; } to { transform:scale(1.3); opacity:1; } }
          @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        `}</style>

        <Suspense fallback={null}>
          <SessionHandler
            onSuccess={(next) => { setNextUrl(next); setPhase('open-pwa') }}
            onError={() => setPhase('loading')}
          />
        </Suspense>
      </div>
    </div>
  )
}