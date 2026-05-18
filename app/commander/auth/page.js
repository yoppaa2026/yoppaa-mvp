'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const T = {
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/commander'

  const [mode, setMode] = useState('magic') // magic | login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success'|'error', text }

  // Vérifier si déjà connecté
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        localStorage.setItem('yoppaa_onboarding_done', '1')
        router.replace(redirect)
      }
    })
  }, [])

  // ── Sauvegarder profil client en localStorage ─────────────────────────────
  async function sauvegarderClient(user) {
    if (!user) return
    const { data: client } = await supabase
      .from('clients')
      .select('id, nom, email')
      .eq('email', user.email)
      .single()
    if (client) {
      localStorage.setItem('yoppaa_client_id', client.id)
      localStorage.setItem('yoppaa_email', client.email)
      const parts = (client.nom || '').split(' ')
      localStorage.setItem('yoppaa_prenom', parts[0] || '')
      localStorage.setItem('yoppaa_nom', parts.slice(1).join(' ') || '')
    }
    // Marquer onboarding comme fait
    localStorage.setItem('yoppaa_onboarding_done', '1')
  }

  // ── Magic link ────────────────────────────────────────────────────────────
  async function envoyerMagicLink() {
    if (!email.trim()) return
    setLoading(true); setMessage(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/commander/auth/confirm?next=${encodeURIComponent(redirect)}`,
      }
    })
    if (error) {
      setMessage({ type: 'error', text: 'Erreur lors de l\'envoi. Vérifie ton adresse email.' })
    } else {
      setMessage({ type: 'success', text: `Lien envoyé à ${email} — vérifie ta boîte mail !` })
    }
    setLoading(false)
  }

  // ── Connexion mot de passe ────────────────────────────────────────────────
  async function seConnecter() {
    if (!email.trim() || !password.trim()) return
    setLoading(true); setMessage(null)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) {
      setMessage({ type: 'error', text: 'Email ou mot de passe incorrect.' })
      setLoading(false)
      return
    }
    await sauvegarderClient(data.user)
    router.replace(redirect)
  }

  // ── Inscription ───────────────────────────────────────────────────────────
  async function sInscrire() {
    if (!email.trim() || !password.trim() || !prenom.trim()) return
    setLoading(true); setMessage(null)
    const nomComplet = `${prenom.trim()} ${nom.trim()}`.trim()
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { nom: nomComplet },
        emailRedirectTo: `${window.location.origin}/commander/auth/confirm?next=${encodeURIComponent(redirect)}`,
      }
    })
    if (error) {
      setMessage({ type: 'error', text: error.message.includes('already') ? 'Cet email est déjà utilisé. Connecte-toi !' : 'Erreur lors de l\'inscription.' })
      setLoading(false)
      return
    }
    // Créer le profil client en DB
    if (data.user) {
      await supabase.from('clients').upsert({
        email: email.trim().toLowerCase(),
        nom: nomComplet,
      }, { onConflict: 'email' })
      const { data: client } = await supabase.from('clients').select('id').eq('email', email.trim().toLowerCase()).single()
      if (client) {
        localStorage.setItem('yoppaa_client_id', client.id)
        localStorage.setItem('yoppaa_email', email.trim().toLowerCase())
        localStorage.setItem('yoppaa_prenom', prenom.trim())
        localStorage.setItem('yoppaa_nom', nom.trim())
      }
      localStorage.setItem('yoppaa_onboarding_done', '1')
    }
    if (!data.session) {
      setMessage({ type: 'success', text: 'Compte créé ! Vérifie ta boîte mail pour confirmer.' })
    } else {
      router.replace(redirect)
    }
    setLoading(false)
  }

  const inputSt = {
    width: '100%', padding: '0.875rem 1rem',
    border: '1.5px solid rgba(255,255,255,0.15)',
    borderRadius: 14, fontSize: '1rem',
    fontFamily: '"DM Sans", sans-serif',
    boxSizing: 'border-box', outline: 'none',
    color: '#fff', background: 'rgba(255,255,255,0.08)',
    display: 'block', marginBottom: 10,
    backdropFilter: 'blur(8px)',
  }

  const btnPrimary = {
    width: '100%', padding: '1rem', border: 'none',
    borderRadius: 100, fontWeight: 800, cursor: loading ? 'default' : 'pointer',
    fontSize: '1rem', background: loading ? 'rgba(107,53,196,0.5)' : `linear-gradient(135deg, ${T.main}, ${T.mid})`,
    color: '#fff', boxShadow: loading ? 'none' : `0 6px 24px ${T.main}55`,
    fontFamily: '"DM Sans", sans-serif', transition: 'all 0.2s',
    opacity: loading ? 0.7 : 1,
  }

  return (
    <div style={{ width: '100%', maxWidth: 400, margin: '0 auto', padding: '0 1.25rem' }}>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
          {[{c:'rgba(255,255,255,0.4)',s:8},{c:T.light,s:11},{c:T.mid,s:8}].map((d,i) => (
            <div key={i} style={{ width: d.s, height: d.s, borderRadius: '50%', background: d.c, boxShadow: `0 0 12px ${d.c}88` }}/>
          ))}
        </div>
        <p style={{ fontWeight: 900, fontSize: '2.5rem', color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>yoppaa</p>
        <p style={{ fontSize: '0.72rem', color: T.light, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', marginTop: 4, opacity: 0.8 }}>
          Ton quartier, dans ta poche.
        </p>
      </div>

      {/* Onglets mode */}
      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 4, marginBottom: '1.5rem', gap: 4 }}>
        {[
          { key: 'magic', label: '✉️ Magic link' },
          { key: 'login', label: '🔑 Mot de passe' },
          { key: 'signup', label: '👤 Inscription' },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setMode(tab.key); setMessage(null) }}
            style={{ flex: 1, padding: '0.5rem 0.25rem', border: 'none', borderRadius: 10, fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', transition: 'all 0.2s',
              background: mode === tab.key ? '#fff' : 'transparent',
              color: mode === tab.key ? T.main : 'rgba(255,255,255,0.5)',
              boxShadow: mode === tab.key ? `0 2px 8px rgba(0,0,0,0.15)` : 'none',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div style={{ borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '1rem', background: message.type === 'success' ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)', border: `1px solid ${message.type === 'success' ? '#16A34A44' : '#DC262644'}` }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: message.type === 'success' ? '#4ADE80' : '#FCA5A5', lineHeight: 1.5 }}>
            {message.type === 'success' ? '✅ ' : '⚠️ '}{message.text}
          </p>
        </div>
      )}

      {/* ── MAGIC LINK ── */}
      {mode === 'magic' && (
        <div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 500, lineHeight: 1.6, marginBottom: '1.25rem', textAlign: 'center' }}>
            Reçois un lien magique par email.<br/>Un clic et tu es connecté — sans mot de passe.
          </p>
          <input
            placeholder="ton@email.com"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && envoyerMagicLink()}
            style={inputSt}
            autoFocus
          />
          <button onClick={envoyerMagicLink} disabled={!email.trim() || loading} style={{ ...btnPrimary, opacity: !email.trim() || loading ? 0.5 : 1 }}>
            {loading ? 'Envoi...' : 'Envoyer le lien magique ✨'}
          </button>
        </div>
      )}

      {/* ── CONNEXION MOT DE PASSE ── */}
      {mode === 'login' && (
        <div>
          <input placeholder="ton@email.com" type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputSt} autoFocus/>
          <input placeholder="Mot de passe" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && seConnecter()} style={inputSt}/>
          <button onClick={seConnecter} disabled={!email.trim() || !password.trim() || loading}
            style={{ ...btnPrimary, opacity: !email.trim() || !password.trim() || loading ? 0.5 : 1 }}>
            {loading ? 'Connexion...' : 'Se connecter →'}
          </button>
          <button onClick={() => setMode('signup')}
            style={{ width: '100%', marginTop: 10, padding: '0.75rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 100, color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            Pas encore de compte ? S'inscrire
          </button>
        </div>
      )}

      {/* ── INSCRIPTION ── */}
      {mode === 'signup' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 0 }}>
            <input placeholder="Prénom *" type="text" value={prenom} onChange={e => setPrenom(e.target.value)} style={{ ...inputSt, marginBottom: 0 }} autoFocus/>
            <input placeholder="Nom" type="text" value={nom} onChange={e => setNom(e.target.value)} style={{ ...inputSt, marginBottom: 0 }}/>
          </div>
          <div style={{ height: 10 }}/>
          <input placeholder="ton@email.com *" type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputSt}/>
          <input placeholder="Mot de passe *" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && sInscrire()} style={inputSt}/>
          <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginBottom: 12, paddingLeft: 4 }}>Minimum 6 caractères</p>
          <button onClick={sInscrire} disabled={!email.trim() || !password.trim() || !prenom.trim() || loading}
            style={{ ...btnPrimary, opacity: !email.trim() || !password.trim() || !prenom.trim() || loading ? 0.5 : 1 }}>
            {loading ? 'Création...' : 'Créer mon compte Yopper 🟣'}
          </button>
          <button onClick={() => setMode('login')}
            style={{ width: '100%', marginTop: 10, padding: '0.75rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 100, color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            Déjà un compte ? Se connecter
          </button>
        </div>
      )}

      {/* Skip */}
      <button onClick={() => {
        localStorage.setItem('yoppaa_onboarding_done', '1')
        router.push(redirect)
      }}
        style={{ width: '100%', marginTop: 20, padding: '0.75rem', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
        Continuer sans compte →
      </button>

      {/* Avantages compte */}
      <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ fontSize: '0.68rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, opacity: 0.8 }}>Avec un compte Yopper</p>
        {['Suis tes commandes en temps réel', 'Accède à tes favoris partout', 'Retrouve ton historique', 'Offres exclusives Yoppers'].map((a, i) => (
          <p key={i} style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: T.mid, fontSize: '0.65rem' }}>🟣</span> {a}
          </p>
        ))}
      </div>

      <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.62rem', color: 'rgba(255,255,255,0.2)' }}>
        ICI ON EST YOPPERS
      </p>
    </div>
  )
}

export default function CommanderAuthPage() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow-x: hidden; }
        body { font-family: "DM Sans", sans-serif; background: #160636; }
        input::placeholder { color: rgba(255,255,255,0.35); }
        input:focus { border-color: rgba(196,160,244,0.6) !important; outline: none; }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, #3D1580 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0' }}>
        <Suspense fallback={null}>
          <AuthForm/>
        </Suspense>
      </div>
    </>
  )
}