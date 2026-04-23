'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Cette page est appelée après le clic sur le magic link.
// Elle laisse Supabase récupérer la session depuis l'URL (hash ou params),
// puis redirige vers le dashboard.

export default function SessionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const next = searchParams.get('next') || '/dashboard'

    // Supabase detectSessionInUrl récupère automatiquement la session
    // depuis le hash fragment (#access_token=...) ou les query params
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace(next)
      } else {
        // Écoute l'event auth si la session n'est pas encore dispo
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session) {
            subscription.unsubscribe()
            router.replace(next)
          }
        })
        // Timeout de sécurité — si rien au bout de 5s, retour login
        setTimeout(() => {
          subscription.unsubscribe()
          router.replace('/login?error=session-expirée')
        }, 5000)
      }
    })
  }, [router, searchParams])

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
      </div>
    </div>
  )
}