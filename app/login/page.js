'use client'
import { Suspense, useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import TurnstileWidget from '@/app/components/TurnstileWidget'
// ⚠️ SANS CETTE MARQUE, `session-permanente` REPOSE LA SESSION qu'on vient
// d'effacer : c'est son métier, et il ne s'abstient que pour un départ voulu.
// Changer de compte depuis cet écran est un départ voulu.
import { marquerDeconnexionVoulue } from '@/lib/session-permanente'
// ⚠️ LA MÊME TRADUCTION QUE « MON COMPTE », et c'est le but : deux écrans qui
// traduisent chacun les refus de Supabase finissent par en dire deux versions.
import { messageAuth } from '@/lib/messages-auth'

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

  // 🔴 CE BLOC A ENFERMÉ ALEX SUR SON TÉLÉPHONE LE 14/09, ET IL AURAIT ENFERMÉ
  // N'IMPORTE QUEL COMMERÇANT.
  //
  // Il appelait `getSession()`, qui LIT LE STOCKAGE LOCAL et ne vérifie rien :
  // un jeton mort, révoqué ou appartenant à un compte qu'on vient de quitter
  // suffisait à renvoyer vers `nextPath`. Le formulaire ne s'affichait donc
  // JAMAIS, et comme le tableau de bord renvoie lui-même ailleurs, la boucle se
  // refermait : impossible de se déconnecter, impossible de changer de compte.
  // La seule sortie était d'effacer les données du site dans les réglages du
  // navigateur, ce qu'un restaurateur ne fera pas : il arrête, simplement.
  //
  // ⚠️ `getUser()` DEMANDE AU SERVEUR. Une session que le serveur refuse n'est
  // pas une session, et on montre le formulaire. C'est toute la différence
  // entre « un jeton traîne ici » et « cette personne est connectée ».
  const [dejaConnecte, setDejaConnecte] = useState(null)

  useEffect(() => {
    let annule = false
    supabase.auth.getUser().then(({ data, error }) => {
      if (annule) return
      // ⚠️ LE MOINDRE DOUTE MÈNE AU FORMULAIRE, jamais à la redirection : se
      // voir proposer de se connecter alors qu'on l'est déjà est un petit
      // désagrément ; être renvoyé en boucle sans pouvoir rien faire est une
      // porte fermée.
      if (error || !data?.user) { setCheckingSession(false); return }
      // 🔴 ET PLUS DE REDIRECTION AUTOMATIQUE : on DIT qui est connecté, et on
      // laisse choisir. C'est exactement ce qui manquait le 14/09, quand une
      // session admin oubliée renvoyait sans fin vers un espace qu'on ne
      // voulait pas ouvrir, sans jamais dire à qui elle appartenait.
      setDejaConnecte(data.user.email || 'un compte')
      setCheckingSession(false)
    })
    return () => { annule = true }
  }, [])

  // La sortie qui n'existait pas. ⚠️ On marque la déconnexion comme VOULUE
  // avant de la demander, sinon `session-permanente` repose la session qu'on
  // vient d'effacer, et la personne se retrouve reconnectée malgré elle.
  async function changerDeCompte() {
    marquerDeconnexionVoulue()
    const { error: err } = await supabase.auth.signOut()
    if (err) {
      // ⚠️ ON LE DIT, ET ON NETTOIE CE QU'ON PEUT. Un échec silencieux ici
      // ramènerait exactement la boucle qu'on vient de fermer.
      console.error('[login] déconnexion refusée par le serveur', err.message)
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    setDejaConnecte(null)
    setCheckingSession(false)
  }

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
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
      options: { captchaToken },
    })
    if (err) {
      // 🔴 CE MESSAGE ÉCRASAIT TOUTES LES CAUSES, et Alex l'a payé le 24/09 :
      // son adresse n'existait plus, l'écran accusait son mot de passe, et il a
      // cherché une heure du mauvais côté. Un captcha qui n'a pas pu se
      // charger, une limite de tentatives atteinte ou une panne disaient tous
      // « mot de passe incorrect ».
      // ⚠️ POUR UN VRAI REFUS D'IDENTIFIANTS, LE FLOU RESTE : `messageAuth`
      // rend « Email ou mot de passe incorrect » sans dire lequel, sinon on
      // offrirait de quoi énumérer les comptes.
      setError(messageAuth(err) || 'Email ou mot de passe incorrect.')
      setLoading(false); return
    }
    // Auto-repair du flag has_password : la connexion par mot de passe prouve qu'il existe.
    // Backfill des comptes anciens (créés avant le flag) pour fiabiliser les offres MDP.
    if (data?.user && data.user.user_metadata?.has_password !== true) {
      supabase.auth.updateUser({ data: { has_password: true } }).catch(() => {})
    }
    router.push(nextPath)
  }

  if (checkingSession) return (
    <div style={{ minHeight: '100dvh', background: T.bgPanel, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: T.light, fontFamily: '"DM Sans", sans-serif' }}>Chargement...</p>
    </div>
  )

  // 🔴 L'ÉCRAN QUI MANQUAIT (14/09). Une session valide ne renvoie plus
  // ailleurs en silence : elle se NOMME, et on choisit. Sans lui, une session
  // oubliée sur un téléphone partagé rouvrait un espace sans jamais dire à qui
  // elle appartenait, et rien ne permettait d'en changer.
  if (dejaConnecte) return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${T.bgPanel} 0%, #2D0F6B 50%, ${T.ink} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 18, padding: '1.75rem' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6B6485', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 6px' }}>Déjà connecté</p>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 900, color: '#1A0840', margin: '0 0 6px', letterSpacing: '-0.3px', wordBreak: 'break-word' }}>
          {dejaConnecte}
        </h1>
        <p style={{ fontSize: '0.88rem', lineHeight: 1.55, color: '#6B6485', margin: '0 0 18px' }}>
          Ce navigateur garde une connexion ouverte. Tu peux continuer, ou entrer avec un autre compte.
        </p>
        <button type="button" onClick={() => router.push(nextPath)}
          style={{ width: '100%', padding: '0.8rem', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.ink}, #6B35C4)`, color: '#fff', fontWeight: 800, fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          Continuer avec ce compte
        </button>
        <button type="button" onClick={changerDeCompte}
          style={{ width: '100%', marginTop: 9, padding: '0.8rem', borderRadius: 100, border: '1.5px solid #E9E1F8', background: '#fff', color: '#6B35C4', fontWeight: 800, fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          Me connecter avec un autre compte
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${T.bgPanel} 0%, #2D0F6B 50%, ${T.ink} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: '"DM Sans", sans-serif' }}>
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
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '2rem', border: `1px solid rgba(255,255,255,0.12)`, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

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
                    if (mode === 'magic') envoyerMagicLink()
                    else connexionMotDePasse()
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

              {/* 🔴 LA SORTIE, QUI N'ÉTAIT ÉCRITE NULLE PART. Le chemin existe
                  et fonctionne : lien magique, puis « Mon compte ». Mais rien
                  ne le disait, alors celui qui a oublié son mot de passe
                  réessaie, échoue, et appelle. L'onglet est juste au-dessus de
                  ses yeux et il ne sait pas qu'il sert à ça.
                  ⚠️ EN MODE MOT DE PASSE SEULEMENT, et seulement après un
                  refus : affichée d'emblée, elle inviterait à contourner le mot
                  de passe, et affichée sous le lien magique elle n'aurait aucun
                  sens. */}
              {error && mode === 'password' && (
                <p style={{ fontSize: '0.74rem', color: T.light, opacity: 0.85, marginBottom: 12, lineHeight: 1.55 }}>
                  Tu ne te souviens plus de ton mot de passe ? Passe par <strong style={{ color: '#fff' }}>Lien magique</strong>, juste au-dessus :
                  tu recevras un lien qui te connecte sans mot de passe, et tu pourras en choisir un nouveau depuis <strong style={{ color: '#fff' }}>Mon compte</strong>.
                </p>
              )}

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