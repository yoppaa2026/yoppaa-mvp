'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function SessionHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const next = searchParams.get('next') || '/dashboard'

    if (token_hash && type) {
      // Vérification du OTP côté client — la session est créée dans le navigateur
      supabase.auth.verifyOtp({ token_hash, type }).then(({ data, error }) => {
        if (!error && data.session) {
          router.replace(next)
        } else {
          router.replace('/login?error=lien-invalide')
        }
      })
    } else {
      // Pas de token — vérifie si session déjà active
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace(next)
        } else {
          router.replace('/login?error=lien-invalide')
        }
      })
    }
  }, [router, searchParams])

  return null
}

export default function SessionPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '"DM Sans", sans-serif',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;800&display=swap" rel="stylesheet"/>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
          {[
            { color: '#fff', opacity: 0.45 },
            { color: '#C4A0F4', opacity: 1 },
            { color: '#9660E0', opacity: 1 },
          ].map((d, i) => (
            <div key={i} style={{
              width: 12, height: 12, borderRadius: '50%',
              background: d.color, opacity: d.opacity,
              animation: `pulse ${0.8 + i * 0.2}s ease-in-out infinite alternate`,
            }}/>
          ))}
        </div>
        <p style={{ color: '#C4A0F4', fontSize: '0.9rem', fontWeight: 600 }}>Connexion en cours...</p>
        <style>{`
          @keyframes pulse {
            from { transform: scale(1); opacity: 0.6; }
            to   { transform: scale(1.3); opacity: 1; }
          }
        `}</style>
        <Suspense fallback={null}>
          <SessionHandler />
        </Suspense>
      </div>
    </div>
  )
}