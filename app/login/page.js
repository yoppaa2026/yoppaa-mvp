'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState('')
  const router = useRouter()

  async function seConnecter(e) {
    e.preventDefault()
    setLoading(true)
    setErreur('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setErreur('Email ou mot de passe incorrect')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <main style={{ fontFamily: 'DM Sans, sans-serif', maxWidth: 400, margin: '0 auto', padding: '3rem 1rem' }}>
      
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1A0840' }}></div>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6B35C4' }}></div>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#9660E0' }}></div>
        </div>
        <h1 style={{ fontWeight: 800, fontSize: '2rem', letterSpacing: '-2px', color: '#6B35C4', margin: '0 0 4px' }}>yoppaa</h1>
        <p style={{ color: '#9660E0', fontSize: '0.85rem', margin: 0 }}>Espace commerçant</p>
      </div>

      <div style={{ background: '#fff', border: '1.5px solid #EDE0FF', borderRadius: 16, padding: '1.5rem' }}>
        <h2 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#1A0840', margin: '0 0 1.5rem' }}>Connexion</h2>
        
        <form onSubmit={seConnecter} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b5c8a', display: 'block', marginBottom: 4 }}>Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
              style={{ width: '100%', padding: '0.85rem', border: '1.5px solid #EDE0FF', borderRadius: 10, fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }}
            />
          </div>
          
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b5c8a', display: 'block', marginBottom: 4 }}>Mot de passe</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: '100%', padding: '0.85rem', border: '1.5px solid #EDE0FF', borderRadius: 10, fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }}
            />
          </div>

          {erreur && (
            <p style={{ background: '#F8D7DA', color: '#721c24', padding: '0.75rem', borderRadius: 8, fontSize: '0.85rem', margin: 0 }}>
              {erreur}
            </p>
          )}

          <button 
            type="submit" 
            disabled={loading}
            style={{ width: '100%', padding: '1rem', background: '#6B35C4', color: '#fff', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '1rem', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Connexion...' : 'Se connecter →'}
          </button>
        </form>
      </div>

      <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#b0a0c8', marginTop: '1rem' }}>
        Accès réservé aux commerçants partenaires Yoppaa
      </p>
    </main>
  )
}