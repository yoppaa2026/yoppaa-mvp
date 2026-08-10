'use client'
// Page « Définir mon mot de passe » pour les Yoppers.
//
// Contexte : un Yopper qui a commandé en invité n'a pas de mot de passe (compte
// clients sans Supabase Auth). On lui offre d'en créer un, VÉRIFIÉ PAR EMAIL.
//
// Cette page gère tout le flux, en réutilisant le magic link comme véhicule de
// vérification (pas de token maison) :
//   - Pas de session Supabase → on envoie un magic link vers /commander/auth/confirm
//     avec next=/commander/auth/definir-mdp. L'email prouve la possession, et le
//     magic link crée le compte Supabase Auth + ouvre la session.
//   - Session active (retour du lien, ou Yopper déjà connecté) → formulaire mot de
//     passe → supabase.auth.updateUser({ password }).
// Le magic link reste toujours dispo comme méthode de connexion alternative.

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TurnstileWidget from '@/app/components/TurnstileWidget'
import { oublierDemande } from '@/lib/geoloc'

const T = {
  bgPanel: '#160636', main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4',
  pale: '#EDE0FF', ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280',
}

// Règles identiques à signup/page.js (source de vérité : PASSWORD_RULES là-bas).
const PASSWORD_RULES = [
  { test: (s) => s.length >= 8,          label: '8 caractères minimum' },
  { test: (s) => /[a-z]/.test(s),        label: '1 minuscule' },
  { test: (s) => /[A-Z]/.test(s),        label: '1 majuscule' },
  { test: (s) => /\d/.test(s),           label: '1 chiffre' },
  { test: (s) => /[^A-Za-z0-9]/.test(s), label: '1 caractère spécial (!@#$%...)' },
]
const isPasswordStrong = (p) => PASSWORD_RULES.every(r => r.test(p))

const inputSt = {
  width: '100%', padding: '0.875rem 1rem', borderRadius: 12,
  border: '1.5px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)',
  color: '#fff', fontSize: '1rem', fontFamily: '"DM Sans", sans-serif',
  outline: 'none', boxSizing: 'border-box', marginBottom: 12,
}
const btnPrimary = {
  width: '100%', padding: '0.9rem', border: 'none', borderRadius: 100,
  background: T.main, color: '#fff', fontWeight: 800, fontSize: '1rem',
  cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 20px ${T.main}66`,
}

export default function DefinirMdpPage() {
  const router = useRouter()
  // phase : 'loading' | 'envoi' (pas de session) | 'envoye' | 'form' (session) | 'succes'
  const [phase, setPhase] = useState('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const turnstileRef = useRef(null)

  useEffect(() => {
    // L'email cible peut arriver par le lien (?email=...) : c'est le compte de la
    // commande. On NE fait confiance a une session existante que si elle correspond a
    // ce meme compte, sinon on force la verification par magic link vers le bon email.
    // Sans ce garde-fou, une session tierce restee ouverte (ex. un autre compte de test)
    // capterait la definition du mot de passe (bug cross-compte du 16/07).
    const linkEmail = (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('email') || '')
      : '').trim().toLowerCase()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionEmail = (session?.user?.email || '').toLowerCase()
      if (session && (!linkEmail || linkEmail === sessionEmail)) { setPhase('form'); return }
      // Pas de session, OU session d'un AUTRE compte que celui du lien -> verif email.
      const fallback = typeof window !== 'undefined' ? (localStorage.getItem('yoppaa_email') || '') : ''
      setEmail(linkEmail || fallback)
      setPhase('envoi')
    })
  }, [])

  async function envoyerLien() {
    if (!email.trim()) { setMessage({ type: 'error', text: 'Email requis.' }); return }
    setLoading(true); setMessage(null)
    const captchaToken = await turnstileRef.current?.getToken()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/commander/auth/confirm?next=${encodeURIComponent('/commander/auth/definir-mdp')}`,
        captchaToken,
      },
    })
    if (error) setMessage({ type: 'error', text: "Erreur lors de l'envoi. Vérifie ton adresse email." })
    else setPhase('envoye')
    setLoading(false)
  }

  async function enregistrerMdp() {
    if (!isPasswordStrong(password)) {
      setMessage({ type: 'error', text: 'Ton mot de passe doit faire au moins 8 caractères et contenir 1 minuscule, 1 majuscule, 1 chiffre et 1 caractère spécial.' })
      return
    }
    if (password !== confirm) {
      setMessage({ type: 'error', text: 'Les deux mots de passe ne correspondent pas.' })
      return
    }
    setLoading(true); setMessage(null)
    // has_password marque le compte comme ayant un mot de passe (permet au Profil
    // d'afficher "Modifier" plutôt que "Créer").
    const { error } = await supabase.auth.updateUser({ password, data: { has_password: true } })
    if (error) {
      setMessage({ type: 'error', text: error.message || 'Erreur lors de la création du mot de passe.' })
      setLoading(false); return
    }
    // ⚠️ ON RÉARME LA DEMANDE DE POSITION. Le drapeau « déjà demandée » vit dans
    // le NAVIGATEUR, pas dans le compte : quelqu'un qui créait un compte sur un
    // navigateur ayant déjà croisé Yoppaa ne voyait jamais la fenêtre, et devait
    // aller cliquer sur la pastille d'adresse pour l'ouvrir à la main. Or c'est
    // au moment où l'on s'engage que la position sert le plus : c'est elle qui
    // fait apparaître les commerces autour de soi.
    // Un refus antérieur reste respecté : `decisionGeoloc` répond « jamais » sur
    // une autorisation refusée, quoi qu'il arrive ici.
    oublierDemande()
    setPhase('succes')
    setLoading(false)
  }

  const rulesOk = isPasswordStrong(password)

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.ink} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.05em', color: '#fff', lineHeight: 1, marginBottom: 6 }}>yoppaa</p>
          <p style={{ color: T.light, fontSize: '0.8rem', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' }}>Mot de passe</p>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', borderRadius: 20, padding: '2rem', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          {phase === 'loading' && (
            <p style={{ color: T.light, textAlign: 'center', fontWeight: 600 }}>Chargement…</p>
          )}

          {/* Pas de session : on envoie le lien de vérification */}
          {phase === 'envoi' && (
            <>
              <h1 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff', marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Crée ton mot de passe</h1>
              <p style={{ fontSize: '0.82rem', color: `${T.light}cc`, marginBottom: '1.25rem', lineHeight: 1.5 }}>
                Pour ta sécurité, on t&apos;envoie d&apos;abord un lien de vérification par email. Tu choisiras ton mot de passe juste après.
              </p>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setMessage(null) }}
                onKeyDown={e => e.key === 'Enter' && envoyerLien()} placeholder="ton@email.com" style={inputSt} autoFocus/>
              {message && <p style={{ fontSize: '0.78rem', color: '#FCA5A5', marginBottom: 12 }}>{message.text}</p>}
              <button onClick={envoyerLien} disabled={loading} style={{ ...btnPrimary, background: loading ? `${T.main}88` : T.main, cursor: loading ? 'wait' : 'pointer' }}>
                {loading ? 'Envoi…' : 'Recevoir mon lien de vérification →'}
              </button>
              <TurnstileWidget ref={turnstileRef} />
              <p style={{ fontSize: '0.72rem', color: `${T.light}88`, textAlign: 'center', marginTop: '1rem', lineHeight: 1.5 }}>
                Tu pourras toujours te connecter par lien magique, avec ou sans mot de passe.
              </p>
            </>
          )}

          {phase === 'envoye' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📬</div>
              <h2 style={{ fontWeight: 800, fontSize: '1.15rem', color: '#fff', marginBottom: '0.75rem' }}>Vérifie ta boîte mail</h2>
              <p style={{ fontSize: '0.875rem', color: T.light, lineHeight: 1.6 }}>
                On a envoyé un lien à<br/><strong style={{ color: '#fff' }}>{email}</strong><br/>
                Clique dessus pour choisir ton mot de passe.
              </p>
              <p style={{ fontSize: '0.72rem', color: `${T.light}88`, marginTop: '1rem' }}>Pense à vérifier tes spams.</p>
            </div>
          )}

          {/* Session active : choix du mot de passe */}
          {phase === 'form' && (
            <>
              <h1 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff', marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Choisis ton mot de passe</h1>
              <p style={{ fontSize: '0.82rem', color: `${T.light}cc`, marginBottom: '1.25rem', lineHeight: 1.5 }}>
                Il te permettra de te reconnecter en un clic, sans attendre d&apos;email.
              </p>
              <div style={{ position: 'relative' }}>
                <input type={show ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setMessage(null) }}
                  placeholder="Nouveau mot de passe" style={inputSt}/>
              </div>
              <input type={show ? 'text' : 'password'} value={confirm} onChange={e => { setConfirm(e.target.value); setMessage(null) }}
                onKeyDown={e => e.key === 'Enter' && enregistrerMdp()} placeholder="Confirme le mot de passe" style={inputSt}/>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: T.light, marginBottom: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)}/> Afficher les mots de passe
              </label>
              <div style={{ marginBottom: 14 }}>
                {PASSWORD_RULES.map((r, i) => {
                  const ok = r.test(password)
                  return (
                    <p key={i} style={{ fontSize: '0.72rem', color: ok ? '#6EE7B7' : `${T.light}99`, margin: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#10B981' : `${T.light}55`, display: 'inline-block' }}/> {r.label}
                    </p>
                  )
                })}
              </div>
              {message && <p style={{ fontSize: '0.78rem', color: '#FCA5A5', marginBottom: 12 }}>{message.text}</p>}
              <button onClick={enregistrerMdp} disabled={loading || !rulesOk || !confirm}
                style={{ ...btnPrimary, background: (loading || !rulesOk || !confirm) ? `${T.main}66` : T.main, cursor: (loading || !rulesOk || !confirm) ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Enregistrement…' : 'Créer mon mot de passe →'}
              </button>
            </>
          )}

          {phase === 'succes' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🟣</div>
              <h2 style={{ fontWeight: 800, fontSize: '1.15rem', color: '#fff', marginBottom: '0.75rem' }}>Mot de passe créé !</h2>
              <p style={{ fontSize: '0.875rem', color: T.light, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                Tu peux désormais te reconnecter avec ton email et ton mot de passe, ou toujours par lien magique.
              </p>
              <button onClick={() => router.replace('/commander')} style={btnPrimary}>Retour à Yoppaa →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
