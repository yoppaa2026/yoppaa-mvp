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

  const [mode, setMode] = useState('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  // Telephone obligatoire a l'inscription : indispensable pour suivi commande + resolution probleme retrait
  const [telephone, setTelephone] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Rediriger seulement si session Supabase active ET email en localStorage
      // Si l'utilisateur s'est déconnecté, yoppaa_email est supprimé → on reste sur la page auth
      if (session && localStorage.getItem('yoppaa_email')) {
        localStorage.setItem('yoppaa_onboarding_done', '1')
        router.replace(redirect)
      }
    })
  }, [])

  async function sauvegarderClient(user) {
    if (!user) return
    // Fetch les vrais champs prenom/nom/telephone (SQL migration appliquee)
    const { data: client } = await supabase
      .from('clients')
      .select('id, nom, prenom, email, telephone')
      .eq('email', user.email)
      .single()
    if (client) {
      localStorage.setItem('yoppaa_client_id', client.id)
      localStorage.setItem('yoppaa_email', client.email)
      // Priorite : champ prenom dedie en DB, sinon ce qui est en localStorage
      const prenomDB = (client.prenom || '').trim()
      const prenomLocal = localStorage.getItem('yoppaa_prenom') || ''
      localStorage.setItem('yoppaa_prenom', prenomDB || prenomLocal)
      if (client.nom) localStorage.setItem('yoppaa_nom', client.nom)
      if (client.telephone) localStorage.setItem('yoppaa_telephone', client.telephone)
    }
    localStorage.setItem('yoppaa_onboarding_done', '1')
  }

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
      setMessage({ type: 'error', text: "Erreur lors de l'envoi. Vérifie ton adresse email." })
    } else {
      setMessage({ type: 'success', text: `Lien envoyé à ${email} - vérifie ta boîte mail !` })
    }
    setLoading(false)
  }

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

  async function sInscrire() {
    // Champs obligatoires : prenom, nom, email, password, telephone (suivi commande + retrait)
    if (!email.trim() || !password.trim() || !prenom.trim() || !nom.trim() || !telephone.trim()) return
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
      setMessage({ type: 'error', text: error.message.includes('already') ? 'Cet email est déjà utilisé. Connecte-toi !' : "Erreur lors de l'inscription." })
      setLoading(false)
      return
    }
    if (data.user) {
      // auth_user_id : lien Supabase Auth <-> table clients (requis par les RLS)
      // Save les 3 champs separes : prenom, nom, telephone (colonnes ajoutees par migration)
      await supabase.from('clients').upsert({
        email: email.trim().toLowerCase(),
        prenom: prenom.trim(),
        nom: nom.trim(),
        telephone: telephone.trim(),
        auth_user_id: data.user.id,
      }, { onConflict: 'email' })
      const { data: client } = await supabase.from('clients').select('id').eq('email', email.trim().toLowerCase()).single()
      if (client) {
        localStorage.setItem('yoppaa_client_id', client.id)
        localStorage.setItem('yoppaa_email', email.trim().toLowerCase())
        localStorage.setItem('yoppaa_prenom', prenom.trim())
        localStorage.setItem('yoppaa_nom', nom.trim())
        localStorage.setItem('yoppaa_telephone', telephone.trim())
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

  // Mini SVG helpers reutilises
  const IconMail = ({ size = 13, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <path d="M3 7l9 6 9-6"/>
    </svg>
  )
  const IconLock = ({ size = 13, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
  const IconUser = ({ size = 13, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M3 21Q3 16 12 16 Q21 16 21 21"/>
    </svg>
  )
  const IconArrowRight = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
    </svg>
  )

  return (
    <div style={{ width: '100%', maxWidth: 400, margin: '0 auto', padding: '0 1.25rem' }}>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        {/* Identite complete canonique : wordmark, 5 dots V2-B, slogan */}
        <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2.5rem', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 16 }}>
          <span style={{ color: '#fff' }}>yo</span>
          <span style={{ color: T.light }}>pp</span>
          <span style={{ color: T.mid }}>aa</span>
        </p>
        {/* Dots V2-B sous le wordmark - animation pop cascade one-shot */}
        <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6, height: 14, marginBottom: 16 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', boxShadow: `0 0 10px #ffffffaa`, opacity: 0, animation: 'dot-pop-auth 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s forwards' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.light, marginTop: 4, boxShadow: `0 0 10px ${T.light}aa`, opacity: 0, animation: 'dot-pop-auth 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.2s forwards' }}/>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.light, marginTop: 4, boxShadow: `0 0 10px ${T.light}aa`, opacity: 0, animation: 'dot-pop-auth 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.3s forwards' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.mid, marginTop: 4, boxShadow: `0 0 10px ${T.mid}aa`, opacity: 0, animation: 'dot-pop-auth 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.4s forwards' }}/>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.mid, boxShadow: `0 0 10px ${T.mid}aa`, opacity: 0, animation: 'dot-pop-auth 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.5s forwards' }}/>
        </div>
        <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontSize: '0.95rem', color: T.light, fontWeight: 600, letterSpacing: '0.012em', marginTop: 0 }}>
          Ton quartier dans ta poche
        </p>
        <style jsx>{`
          @keyframes dot-pop-auth { 0% { opacity:0; transform:scale(0) translateY(8px); } 70% { transform:scale(1.3) translateY(-4px); } 100% { opacity:1; transform:scale(1) translateY(0); } }
        `}</style>
      </div>

      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 4, marginBottom: '1.5rem', gap: 4 }}>
        {[
          { key: 'magic',  label: 'Magic link',  Icon: IconMail },
          { key: 'login',  label: 'Mot de passe',Icon: IconLock },
          { key: 'signup', label: 'Inscription', Icon: IconUser },
        ].map(tab => {
          const actif = mode === tab.key
          return (
            <button key={tab.key} onClick={() => { setMode(tab.key); setMessage(null) }}
              style={{ flex: 1, padding: '0.5rem 0.25rem', border: 'none', borderRadius: 10, fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', transition: 'all 0.2s',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                background: actif ? '#fff' : 'transparent',
                color: actif ? T.main : 'rgba(255,255,255,0.5)',
                boxShadow: actif ? `0 2px 8px rgba(0,0,0,0.15)` : 'none',
              }}>
              <tab.Icon size={12} color={actif ? T.main : 'rgba(255,255,255,0.5)'}/>
              {tab.label}
            </button>
          )
        })}
      </div>

      {message && (
        <div style={{ borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '1rem', background: message.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(220,38,38,0.15)', border: `1px solid ${message.type === 'success' ? '#10B98144' : '#DC262644'}` }}>
          <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600, color: message.type === 'success' ? '#4ADE80' : '#FCA5A5', lineHeight: 1.5 }}>
            {message.type === 'success' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M5 12l5 5L20 7"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FCA5A5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <path d="M12 9v4M12 17h.01"/>
              </svg>
            )}
            {message.text}
          </p>
        </div>
      )}

      {mode === 'magic' && (
        <div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 500, lineHeight: 1.6, marginBottom: '1.25rem', textAlign: 'center' }}>
            Reçois un lien magique par email.<br/>Un clic et tu es connecté - sans mot de passe.
          </p>
          <input placeholder="ton@email.com" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && envoyerMagicLink()} style={inputSt} autoFocus/>
          <button onClick={envoyerMagicLink} disabled={!email.trim() || loading}
            style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !email.trim() || loading ? 0.5 : 1 }}>
            {loading ? 'Envoi…' : (<>Envoyer le lien magique
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.9 5.8H20l-5 3.6L17 18l-5-3.6L7 18l2-5.6-5-3.6h6.1L12 3z"/>
              </svg></>)}
          </button>
        </div>
      )}

      {mode === 'login' && (
        <div>
          <input placeholder="ton@email.com" type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputSt} autoFocus/>
          <input placeholder="Mot de passe" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && seConnecter()} style={inputSt}/>
          <button onClick={seConnecter} disabled={!email.trim() || !password.trim() || loading}
            style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !email.trim() || !password.trim() || loading ? 0.5 : 1 }}>
            {loading ? 'Connexion…' : (<>Se connecter <IconArrowRight size={16} color="#fff"/></>)}
          </button>
          <button onClick={() => setMode('signup')}
            style={{ width: '100%', marginTop: 10, padding: '0.75rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 100, color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            Pas encore de compte ? S&apos;inscrire
          </button>
        </div>
      )}

      {mode === 'signup' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 0 }}>
            <input placeholder="Prénom *" type="text" value={prenom} onChange={e => setPrenom(e.target.value)} style={{ ...inputSt, marginBottom: 0 }} autoFocus/>
            <input placeholder="Nom *" type="text" value={nom} onChange={e => setNom(e.target.value)} style={{ ...inputSt, marginBottom: 0 }}/>
          </div>
          <div style={{ height: 10 }}/>
          <input placeholder="ton@email.com *" type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputSt}/>
          <input placeholder="Téléphone *" type="tel" value={telephone} onChange={e => setTelephone(e.target.value)} style={inputSt}/>
          <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginBottom: 10, paddingLeft: 4, lineHeight: 1.4 }}>Pour le suivi de tes commandes et en cas de souci au retrait.</p>
          <input placeholder="Mot de passe *" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && sInscrire()} style={inputSt}/>
          <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginBottom: 12, paddingLeft: 4 }}>Minimum 6 caractères</p>
          <button onClick={sInscrire} disabled={!email.trim() || !password.trim() || !prenom.trim() || !nom.trim() || !telephone.trim() || loading}
            style={{ ...btnPrimary, opacity: !email.trim() || !password.trim() || !prenom.trim() || !nom.trim() || !telephone.trim() || loading ? 0.5 : 1 }}>
            {loading ? 'Création...' : 'Créer mon compte Yopper 🟣'}
          </button>
          <button onClick={() => setMode('login')}
            style={{ width: '100%', marginTop: 10, padding: '0.75rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 100, color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            Déjà un compte ? Se connecter
          </button>
        </div>
      )}

      <button onClick={() => { localStorage.setItem('yoppaa_onboarding_done', '1'); router.push(redirect) }}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginTop: 20, padding: '0.75rem', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
        Continuer sans compte <IconArrowRight size={13} color="rgba(255,255,255,0.3)"/>
      </button>

      <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ fontSize: '0.68rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, opacity: 0.8 }}>Avec un compte Yopper</p>
        {['Suis tes commandes en temps réel', 'Accède à tes favoris partout', 'Retrouve ton historique', 'Offres exclusives Yoppers'].map((a, i) => (
          <p key={i} style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.mid, flexShrink: 0, display: 'inline-block' }}/> {a}
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
      {/* Layout iOS-safe :
          • minHeight 100dvh suit la viewport dynamique (clavier ouvert/fermé)
          • overflowX hidden uniquement (Y libre → scroll naturel si form > viewport)
          • Centrage via margin auto sur le wrapper interne au lieu de justifyContent
            (justifyContent: center coupe le HAUT en flex column quand content > viewport,
            margin auto degrade gracieusement en push-down naturel quand le clavier reduit)
          • Safe-area top/bottom pour iPhone notch + home indicator */}
      <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, #3D1580 100%)`, display: 'flex', flexDirection: 'column', padding: 'max(1.5rem, env(safe-area-inset-top)) 0 max(2rem, env(safe-area-inset-bottom))', position: 'relative', overflowX: 'hidden' }}>
        {/* Bande 3px canonique YOPPAA (Ink -> Main -> Light) */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 2 }}/>
        <div style={{ margin: 'auto 0', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <Suspense fallback={null}>
            <AuthForm/>
          </Suspense>
        </div>
      </div>
    </>
  )
}