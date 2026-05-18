'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const T = { main: '#6B35C4', light: '#C4A0F4', mid: '#9660E0', deep: '#2D0F6B' }

function ConfirmHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const next = searchParams.get('next') || '/commander'

    async function confirmer() {
      if (token_hash && type) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })
        if (!error && data.session) {
          // Créer ou récupérer le profil client
          const email = data.session.user.email
          const { data: client } = await supabase
            .from('clients')
            .select('id, nom')
            .eq('email', email)
            .single()

          if (client) {
            localStorage.setItem('yoppaa_client_id', client.id)
            localStorage.setItem('yoppaa_email', email)
            const parts = (client.nom || '').split(' ')
            localStorage.setItem('yoppaa_prenom', parts[0] || '')
            localStorage.setItem('yoppaa_nom', parts.slice(1).join(' ') || '')
          } else {
            // Nouveau client via magic link — créer le profil
            const { data: newClient } = await supabase
              .from('clients')
              .insert({ email })
              .select('id')
              .single()
            if (newClient) {
              localStorage.setItem('yoppaa_client_id', newClient.id)
              localStorage.setItem('yoppaa_email', email)
            }
          }
          router.replace(next)
        } else {
          router.replace('/commander/auth?error=lien-invalide')
        }
      } else {
        // Pas de token — vérifier session existante
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.replace(next)
        } else {
          router.replace('/commander/auth?error=lien-invalide')
        }
      }
    }

    confirmer()
  }, [router, searchParams])

  return null
}

export default function CommanderAuthConfirmPage() {
  return (
    <>
      <style>{`
        @keyframes pulse { from { transform:scale(1); opacity:0.6; } to { transform:scale(1.3); opacity:1; } }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;800&display=swap" rel="stylesheet"/>
      <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, #160636 0%, ${T.deep} 50%, #1A0840 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
            {[{c:'#fff',o:0.45},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: d.c, opacity: d.o, animation: `pulse ${0.8+i*0.2}s ease-in-out infinite alternate` }}/>
            ))}
          </div>
          <p style={{ fontWeight: 900, fontSize: '2rem', color: '#fff', letterSpacing: '-2px', marginBottom: 8 }}>yoppaa</p>
          <p style={{ color: T.light, fontSize: '0.9rem', fontWeight: 600 }}>Connexion en cours...</p>
        </div>
        <Suspense fallback={null}>
          <ConfirmHandler/>
        </Suspense>
      </div>
    </>
  )
}