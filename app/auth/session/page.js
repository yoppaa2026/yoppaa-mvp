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

function SessionHandler({ setPhase, setNextUrl }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const next = searchParams.get('next') || '/dashboard'

    async function handleAuth() {
      let session = null

      if (token_hash && type) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })
        if (!error && data.session) session = data.session
      } else {
        const { data } = await supabase.auth.getSession()
        session = data.session
      }

      if (!session) {
        router.replace('/login?error=lien-invalide')
        return
      }

      const isStandalone = (typeof window !== 'undefined') && (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
      )

      if (isStandalone) {
        router.replace(next)
      } else {
        setNextUrl(next)
        setPhase('open-pwa')
      }
    }

    handleAuth()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export default function SessionPage() {
  const [phase, setPhase] = useState('loading')
  const [nextUrl, setNextUrl] = useState('/dashboard')

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(160deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"DM Sans", sans-serif',
      padding: '1rem',
      position: 'relative', overflow: 'hidden',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 80% 20%, #9660E033 0%, transparent 50%), radial-gradient(circle at 20% 80%, #C4A0F418 0%, transparent 50%)', pointerEvents: 'none' }}/>

      <div style={{ textAlign: 'center', position: 'relative', width: '100%', maxWidth: 340 }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
          {[{c:'#fff',o:0.45,s:10},{c:'#C4A0F4',o:1,s:13},{c:'#9660E0',o:1,s:10}].map((d, i) => (
            <div key={i} style={{ width: d.s, height: d.s, borderRadius: '50%', background: d.c, opacity: d.o, boxShadow: `0 0 12px ${d.c}88`, animation: `dotPulse ${0.8 + i * 0.2}s ease-in-out ${i * 0.15}s infinite alternate` }}/>
          ))}
        </div>

        <p style={{ fontWeight: 900, fontSize: '2rem', letterSpacing: '-2px', color: '#fff', marginBottom: 4, lineHeight: 1 }}>yoppaa</p>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#C4A0F4', letterSpacing: '3px', textTransform: 'uppercase', opacity: 0.7, marginBottom: 32 }}>Pro</p>

        {phase === 'loading' && (
          <p style={{ color: '#C4A0F4', fontSize: '0.875rem', fontWeight: 600, opacity: 0.8 }}>Connexion en cours...</p>
        )}

        {phase === 'open-pwa' && (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.25rem', marginBottom: 20, border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}>
              <p style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem', marginBottom: 6, letterSpacing: '-0.3px' }}>✅ Connexion réussie !</p>
              <p style={{ fontSize: '0.8rem', color: '#C4A0F4', opacity: 0.8, lineHeight: 1.5 }}>
                Ouvre l'app <strong style={{ color: '#fff' }}>Yoppaa Pro</strong> depuis ton écran d'accueil pour continuer.
              </p>
            </div>
            <a href={nextUrl}
              style={{ display: 'block', width: '100%', padding: '1rem', borderRadius: 100, fontWeight: 800, fontSize: '1rem', background: 'linear-gradient(135deg, #6B35C4, #9660E0)', color: '#fff', boxShadow: '0 6px 24px #6B35C455', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none', letterSpacing: '-0.3px', marginBottom: 12, boxSizing: 'border-box', textAlign: 'center' }}>
              Ouvrir Yoppaa Pro →
            </a>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '0.875rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: '0.72rem', color: '#C4A0F4', opacity: 0.7, lineHeight: 1.6 }}>
                💡 Si ça ne s'ouvre pas :<br/>
                Retourne sur l'écran d'accueil → tape <strong style={{ color: '#fff' }}>Yoppaa Pro</strong>
              </p>
            </div>
          </div>
        )}

        <style>{`
          @keyframes dotPulse { from { transform:scale(0.8); opacity:0.5; } to { transform:scale(1.3); opacity:1; } }
          @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        `}</style>

        <Suspense fallback={null}>
          <SessionHandler setPhase={setPhase} setNextUrl={setNextUrl} />
        </Suspense>
      </div>
    </div>
  )
}