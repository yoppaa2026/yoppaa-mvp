'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { PLAN_LABEL, PLAN_PRIX, PLANS } from '@/lib/plans'

// ─── PALETTE ──────────────────────────────────────────────────────────────────
const T = {
  bg:       '#F8F6FF',
  bgPanel:  '#160636',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',
  pale:     '#EDE0FF',
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  muted:    '#6B7280',
  hairline: '#EEE9F5',
}

const ETAPES = [
  { n: 1, label: 'Compte' },
  { n: 2, label: 'Infos' },
  { n: 3, label: 'Visuels' },
  { n: 4, label: 'Horaires' },
  { n: 5, label: 'Validation' },
]

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────
export default function Signup() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [session, setSession] = useState(null)
  const [commercant, setCommercant] = useState(null)
  const [onboarding, setOnboarding] = useState(null)
  const [etape, setEtape] = useState(1)

  // Au chargement : récupère la session + l'éventuel onboarding en cours
  useEffect(() => {
    let annule = false
    async function init() {
      const { data: { session: s } } = await supabase.auth.getSession()
      if (annule) return
      setSession(s)
      if (s) {
        const { data: c } = await supabase.from('commercants')
          .select('*')
          .eq('auth_user_id', s.user.id)
          .maybeSingle()
        if (annule) return
        if (c) {
          setCommercant(c)
          const { data: ob } = await supabase.from('onboarding_commercants')
            .select('*')
            .eq('commercant_id', c.id)
            .maybeSingle()
          if (annule) return
          if (ob) {
            setOnboarding(ob)
            // Déjà validé → redirige vers dashboard
            if (ob.statut === 'valide') { router.push('/dashboard'); return }
            setEtape(ob.etape_actuelle || 2)
          } else {
            // Compte + commerçant existent mais pas d'onboarding (cas de session déjà
            // existante de /login). On en crée un pour reprendre proprement.
            const { data: newOb } = await supabase.from('onboarding_commercants')
              .insert({ commercant_id: c.id, etape_actuelle: 2 })
              .select()
              .single()
            setOnboarding(newOb)
            setEtape(2)
          }
        }
        // Session sans commercant : on reste à l'étape 1 pour création
      }
      setChecking(false)
    }
    init()
    return () => { annule = true }
  }, [router])

  async function avancerVers(n) {
    setEtape(n)
    if (onboarding) {
      await supabase.from('onboarding_commercants')
        .update({ etape_actuelle: n })
        .eq('id', onboarding.id)
    }
  }

  if (checking) return (
    <div style={{ minHeight: '100vh', background: T.bgPanel, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: T.light, fontFamily: '"DM Sans", sans-serif' }}>Chargement…</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* En-tête violet foncé */}
      <header style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.ink} 100%)`, padding: '1.25rem 1.25rem 1rem', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.mid}33 0%, transparent 50%)`, pointerEvents: 'none' }}/>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', maxWidth: 720, margin: '0 auto', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {[{c:'#fff',o:0.4},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: d.c, opacity: d.o }}/>
              ))}
            </div>
            <p style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '-1.5px', color: '#fff', lineHeight: 1, margin: 0 }}>yoppaa</p>
            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: T.light, background: `${T.main}55`, padding: '3px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '1px', border: `1px solid ${T.light}44` }}>Inscription pro</span>
          </div>
          {session && (
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', borderRadius: 10, padding: '0.4rem 0.875rem', fontWeight: 700, fontSize: '0.75rem', fontFamily: '"DM Sans", sans-serif' }}>
              Se déconnecter
            </button>
          )}
        </div>

        {/* Barre de progression */}
        <div style={{ maxWidth: 720, margin: '1.25rem auto 0' }}>
          <BarreProgression etape={etape} />
        </div>
      </header>

      {/* Contenu de l'étape */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
        {etape === 1 && (
          <Etape1Compte
            session={session}
            commercant={commercant}
            onCompte={(s, c, ob) => {
              setSession(s); setCommercant(c); setOnboarding(ob); avancerVers(2)
            }}
          />
        )}
        {etape === 2 && (
          <EtapePlaceholder titre="Infos de base" n={2} avancer={() => avancerVers(3)} retour={() => avancerVers(1)}/>
        )}
        {etape === 3 && (
          <EtapePlaceholder titre="Visuels (photo couverture + logo)" n={3} avancer={() => avancerVers(4)} retour={() => avancerVers(2)}/>
        )}
        {etape === 4 && (
          <EtapePlaceholder titre="Horaires d'ouverture" n={4} avancer={() => avancerVers(5)} retour={() => avancerVers(3)}/>
        )}
        {etape === 5 && (
          <EtapePlaceholder titre="Success Pack & soumission" n={5} avancer={() => alert('Soumission à venir')} retour={() => avancerVers(4)}/>
        )}
      </main>
    </div>
  )
}

// ─── BARRE DE PROGRESSION ─────────────────────────────────────────────────────
function BarreProgression({ etape }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      {ETAPES.map((e, i) => {
        const done = etape > e.n
        const active = etape === e.n
        return (
          <div key={e.n} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? '#16A34A' : (active ? '#fff' : 'rgba(255,255,255,0.15)'), color: active ? T.bgPanel : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, border: active ? `2px solid ${T.light}` : 'none', transition: 'all 0.2s', boxShadow: active ? `0 4px 12px rgba(196,160,244,0.5)` : 'none' }}>
                {done ? '✓' : e.n}
              </div>
              <p style={{ fontSize: 10, fontWeight: 700, color: done || active ? '#fff' : 'rgba(255,255,255,0.4)', marginTop: 4, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{e.label}</p>
            </div>
            {i < ETAPES.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#16A34A' : 'rgba(255,255,255,0.15)', borderRadius: 2, marginTop: 13, transition: 'background 0.2s' }}/>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── ÉTAPE 1 : COMPTE + PLAN ──────────────────────────────────────────────────
function Etape1Compte({ session, commercant, onCompte }) {
  const [email, setEmail] = useState(session?.user?.email || '')
  const [password, setPassword] = useState('')
  const [plan, setPlan] = useState(commercant?.plan || 'on')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const dejaConnecte = !!session

  async function creerCompte() {
    setError('')
    if (!email.trim() || !password.trim()) return setError('Email et mot de passe obligatoires')
    if (password.length < 6) return setError('Mot de passe : 6 caractères minimum')
    setLoading(true)

    // 1) Création du compte Supabase Auth
    const { data: signupData, error: signupErr } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/signup`,
      },
    })
    if (signupErr) {
      setError(signupErr.message)
      setLoading(false)
      return
    }

    let userId = signupData.user?.id
    let s = signupData.session
    if (!s) {
      // Tente auto-connexion si pas de session retournée (cas où email verification désactivée)
      const { data: signInData } = await supabase.auth.signInWithPassword({
        email: email.trim(), password: password.trim(),
      })
      if (signInData?.session) { s = signInData.session; userId = signInData.user?.id }
    }
    if (!userId) {
      setError('Compte créé. Vérifie ta boîte mail pour confirmer, puis reviens sur /signup.')
      setLoading(false)
      return
    }

    // 2) Création du commerçant (champs minimaux, complétés à l'étape 2)
    const { data: c, error: cErr } = await supabase.from('commercants').insert({
      auth_user_id: userId,
      email: email.trim(),
      nom: 'Mon commerce',
      type: 'À définir',
      plan,
      plan_actif_depuis: new Date().toISOString(),
      statut: 'en_cours_onboarding',
      statut_publication: 'brouillon',
    }).select().single()
    if (cErr) {
      setError(`Création commerçant : ${cErr.message}`)
      setLoading(false)
      return
    }

    // 3) Création de la ligne onboarding_commercants
    const { data: ob, error: obErr } = await supabase.from('onboarding_commercants').insert({
      commercant_id: c.id,
      etape_actuelle: 2,
      plan_choisi: plan,
    }).select().single()
    if (obErr) {
      setError(`Initialisation onboarding : ${obErr.message}`)
      setLoading(false)
      return
    }

    setLoading(false)
    onCompte(s, c, ob)
  }

  // Si déjà connecté, juste mettre à jour le plan choisi
  async function mettreAJourPlan() {
    setLoading(true)
    await supabase.from('commercants').update({ plan, plan_actif_depuis: new Date().toISOString() }).eq('id', commercant.id)
    setLoading(false)
    onCompte(session, { ...commercant, plan }, null)
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
        Bienvenue sur Yoppaa
      </h1>
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 24px' }}>
        Crée ton compte et choisis ton plan. Tu pourras tout configurer en quelques minutes.
      </p>

      {!dejaConnecte ? (
        <Card titre="Ton compte">
          <FieldEmail value={email} onChange={setEmail}/>
          <FieldPassword value={password} onChange={setPassword}/>
        </Card>
      ) : (
        <Card titre="Ton compte">
          <p style={{ fontSize: '0.875rem', color: T.deep, margin: 0 }}>
            Connecté : <strong>{session.user.email}</strong>
          </p>
        </Card>
      )}

      <Card titre="Choisis ton plan" sous="Tu pourras changer plus tard depuis ton dashboard.">
        <div style={{ display: 'grid', gap: 10 }}>
          {PLANS.map(p => (
            <CardPlan key={p} plan={p} actif={plan === p} onClick={() => setPlan(p)}/>
          ))}
        </div>
        <p style={{ fontSize: 11, color: T.muted, marginTop: 12, lineHeight: 1.5 }}>
          Plans payants : 30 jours gratuits si tu souscris dès maintenant.
          Tu peux aussi démarrer en plan ON gratuit et upgrader à tout moment.
        </p>
      </Card>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#7F1D1D', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <button onClick={dejaConnecte ? mettreAJourPlan : creerCompte} disabled={loading}
        style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, background: loading ? `${T.main}88` : `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: loading ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 8px 24px ${T.main}55` }}>
        {loading ? 'En cours…' : (dejaConnecte ? 'Continuer →' : 'Créer mon compte →')}
      </button>

      <p style={{ fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 12 }}>
        Déjà inscrit ? <a href="/login" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>Se connecter</a>
      </p>
    </div>
  )
}

// ─── PLACEHOLDER pour les étapes 2-5 (commits suivants) ───────────────────────
function EtapePlaceholder({ titre, n, avancer, retour }) {
  return (
    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 12px' }}>
        Étape {n} — {titre}
      </h1>
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 24px' }}>
        En cours de développement — disponible dans le prochain commit.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={retour} style={{ padding: '0.75rem 1.5rem', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>← Retour</button>
        <button onClick={avancer} style={{ padding: '0.75rem 1.5rem', borderRadius: 100, border: 'none', background: T.bgPanel, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>Continuer →</button>
      </div>
    </div>
  )
}

// ─── COMPOSANTS UTILITAIRES ───────────────────────────────────────────────────
function Card({ titre, sous, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '1.25rem 1.25rem 1.125rem', marginBottom: 14, border: `1px solid ${T.hairline}`, boxShadow: '0 2px 12px rgba(22,6,54,0.05)' }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 11, fontWeight: 800, color: T.bgPanel, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>{titre}</h3>
        {sous && <p style={{ fontSize: 12, color: T.muted, margin: '4px 0 0' }}>{sous}</p>}
      </div>
      {children}
    </div>
  )
}

function FieldEmail({ value, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        Email
      </label>
      <input type="email" value={value} onChange={e => onChange(e.target.value)} placeholder="ton@email.com" autoComplete="email"
        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, color: T.ink, background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: '"DM Sans", sans-serif' }}/>
    </div>
  )
}

function FieldPassword({ value, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        Mot de passe (6 caractères min)
      </label>
      <input type="password" value={value} onChange={e => onChange(e.target.value)} placeholder="••••••••" autoComplete="new-password"
        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, color: T.ink, background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: '"DM Sans", sans-serif' }}/>
    </div>
  )
}

function CardPlan({ plan, actif, onClick }) {
  const p = PLAN_PRIX[plan]
  const label = PLAN_LABEL[plan]
  const features = {
    on:    'Page live + menu sans prix + horaires + avis. Idéal pour démarrer.',
    live:  'Tout ON + prix visibles + photos articles + deals + actualités + Morning Yoppaa.',
    boost: 'Tout LIVE + Click & Collect + fidélité + dashboard commandes + kit hardware.',
    max:   'Tout BOOST + module livraison complet + fidélité avancée + support prioritaire.',
  }
  return (
    <button onClick={onClick}
      style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 14, border: `2px solid ${actif ? T.bgPanel : T.hairline}`, background: actif ? T.bgPanel : '#fff', color: actif ? '#fff' : T.ink, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s', boxShadow: actif ? `0 8px 24px rgba(22,6,54,0.2)` : 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: '-0.3px' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: actif ? T.light : T.main }}>{p.label_annuel}</span>
      </div>
      {p.label_mensuel !== '—' && (
        <p style={{ fontSize: 11, color: actif ? 'rgba(255,255,255,0.65)' : T.muted, margin: '0 0 6px', fontWeight: 600 }}>
          ou {p.label_mensuel}
        </p>
      )}
      <p style={{ fontSize: 12, color: actif ? 'rgba(255,255,255,0.85)' : T.deep, margin: 0, lineHeight: 1.4 }}>{features[plan]}</p>
    </button>
  )
}
