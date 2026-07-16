'use client'
// LandingTeasing : page mysterieuse pendant la phase teasing -> lancement 21/07.
// Hero violet sombre + compteur en temps reel + formulaire pre-inscription
// minimaliste avec Cloudflare Turnstile invisible.
//
// Bascule automatique cote CLIENT le jour J :
// - Avant LAUNCH_DATE  : mode teasing (titre mystere + compteur + formulaire)
// - A partir LAUNCH_DATE : mode lancement (titre "Yoppaa est arrive" + boutons
//   App Store + Play Store, ou fallback si les URLs ne sont pas encore en env)

import { useState, useEffect, useRef } from 'react'
import Script from 'next/script'
import { Lock } from 'lucide-react'
import YoppaaLogo from '@/app/components/YoppaaLogo'

const T = {
  ink:     '#1A0840',
  panel:   '#160636',
  deep:    '#2D0F6B',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  bg:      '#F8F6FF',
  muted:   '#9CA3AF',
}

// Retroplanning Yoppaa 2 dates cles (strategie Alex 21/06) :
//
// 1) REVEAL_DATE = 21 juillet 2026 (fete nationale belge) = DEVOILEMENT.
//    Le grand post + revelation des premiers partenaires. Pas de stores.
// 2) LAUNCH_DATE = 1er septembre 2026 (rentree) = LANCEMENT APP.
//    L'app devient telechargeable sur App Store + Play Store.
//
// Pourquoi 2 dates : on dissocie le temps fort symbolique (21/07) du
// lancement produit (01/09) qui beneficie de la rentree + d'un ete
// d'onboarding commercants pour atteindre 20-30 commerces (densite
// avant tout).
//
// Format ISO avec offset CEST belge +02:00 (juillet + septembre).
// Variables d'env Vercel :
// - NEXT_PUBLIC_REVEAL_DATE  (annonce, defaut 2026-08-01T10:00:00+02:00)
// - NEXT_PUBLIC_LAUNCH_DATE  (lancement app, defaut 2026-09-01T10:00:00+02:00)
// Retro-compat : NEXT_PUBLIC_LANDING_REVEAL_DATE (ancien nom) -> REVEAL_DATE.
// NB : annonce deplacee du 21/07 au 1er aout (decision 14/07).
const REVEAL_DATE = new Date(
  process.env.NEXT_PUBLIC_REVEAL_DATE
  || process.env.NEXT_PUBLIC_LANDING_REVEAL_DATE
  || '2026-08-01T10:00:00+02:00'
)
const LAUNCH_DATE = new Date(
  process.env.NEXT_PUBLIC_LAUNCH_DATE
  || '2026-09-01T10:00:00+02:00'
)

// Libelle FR de la date d'annonce, DERIVE de REVEAL_DATE (le texte suit toujours la
// date, plus jamais de derive en dur). Ex : "1er aout" / "1er aout 2026".
const REVEAL_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][REVEAL_DATE.getMonth()]
const REVEAL_JOUR = REVEAL_DATE.getDate() === 1 ? '1er' : String(REVEAL_DATE.getDate())
const REVEAL_LABEL = `${REVEAL_JOUR} ${REVEAL_MOIS}`
const REVEAL_LABEL_ANNEE = `${REVEAL_LABEL} ${REVEAL_DATE.getFullYear()}`

function pad(n) { return String(n).padStart(2, '0') }

// 3 phases de rendu :
// - phase='teasing'  : avant REVEAL_DATE, compteur vers REVEAL_DATE
// - phase='devoile'  : entre REVEAL et LAUNCH, compteur vers LAUNCH_DATE
// - phase='lancement': apres LAUNCH_DATE, boutons stores
function calculerEtatTemps() {
  const now = new Date()
  const revealAtteint = now >= REVEAL_DATE
  const launchAtteint = now >= LAUNCH_DATE
  const cible = launchAtteint ? LAUNCH_DATE : (revealAtteint ? LAUNCH_DATE : REVEAL_DATE)
  const diff = Math.max(0, cible.getTime() - now.getTime())
  const jours    = Math.floor(diff / (1000 * 60 * 60 * 24))
  const heures   = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const minutes  = Math.floor((diff / (1000 * 60)) % 60)
  const secondes = Math.floor((diff / 1000) % 60)
  const phase = launchAtteint ? 'lancement' : (revealAtteint ? 'devoile' : 'teasing')
  return { jours, heures, minutes, secondes, phase }
}

export default function LandingTeasing() {
  const [temps, setTemps] = useState(calculerEtatTemps())
  const [form, setForm] = useState({
    email: '', code_postal: '', type_utilisateur: 'yopper', commercant_nom: '', message: '', consentement_marketing: true,
  })
  const [statut, setStatut] = useState({ envoi: 'idle', message: null })  // 'idle'|'envoi'|'ok'|'ko'
  const [turnstileToken, setTurnstileToken] = useState(null)
  const [communeStats, setCommuneStats] = useState(null)  // incitant : compteur de la commune saisie
  const turnstileRef = useRef(null)
  // Attribution : ?ref=<slug commercant> (liens du Kit lancement) + utm bruts.
  // Capturés une fois au montage pour survivre à un éventuel nettoyage d'URL.
  const attributionRef = useRef({ ref_commercant: null, utm_source: null, utm_medium: null, utm_campaign: null })

  // Compteur en temps reel (tick chaque seconde). Quand on franchit
  // REVEAL_DATE ou LAUNCH_DATE, le rendu bascule automatiquement.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const tick = () => setTemps(calculerEtatTemps())
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Capture des paramètres d'attribution depuis l'URL (une fois au montage).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    attributionRef.current = {
      ref_commercant: p.get('ref') || null,
      utm_source: p.get('utm_source') || null,
      utm_medium: p.get('utm_medium') || null,
      utm_campaign: p.get('utm_campaign') || null,
    }
  }, [])

  // Incitant : dès que le code postal est complet (4 chiffres), on va chercher le
  // compteur de la commune correspondante (agrégats only). Débounce léger pour ne
  // pas spammer pendant la frappe.
  useEffect(() => {
    const cp = form.code_postal.trim()
    let vivant = true
    // Tout est fait dans le callback débounced (pas de setState synchrone dans le
    // corps de l'effet) : CP incomplet -> on efface, sinon on va chercher le compteur.
    const t = setTimeout(() => {
      if (!/^\d{4}$/.test(cp)) { if (vivant) setCommuneStats(null); return }
      fetch(`/api/communes/stats?cp=${cp}`)
        .then(r => r.json())
        .then(j => { if (vivant) setCommuneStats(j?.ok && j?.found ? j : null) })
        .catch(() => { if (vivant) setCommuneStats(null) })
    }, 400)
    return () => { vivant = false; clearTimeout(t) }
  }, [form.code_postal])

  // Turnstile invisible callback : on stocke le token quand recu
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.onTurnstileSuccess = (token) => setTurnstileToken(token)
    window.onTurnstileExpired = () => setTurnstileToken(null)
    window.onTurnstileError   = () => setTurnstileToken(null)
  }, [])

  async function soumettre(e) {
    e.preventDefault()
    if (statut.envoi === 'envoi') return

    setStatut({ envoi: 'envoi', message: null })
    try {
      const res = await fetch('/api/pre-inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          code_postal: form.code_postal,
          type_utilisateur: form.type_utilisateur,
          commercant_nom: form.commercant_nom,
          message: form.message,
          consentement_marketing: form.consentement_marketing,
          turnstile_token: turnstileToken,
          ...attributionRef.current,
        }),
      })
      const j = await res.json()
      if (!j.ok) {
        setStatut({ envoi: 'ko', message: j.error || 'Une erreur est survenue, réessaie' })
        return
      }
      setStatut({ envoi: 'ok', message: 'Bien reçu 🟣 Tu fais partie des premiers curieux. À très vite !' })
      // Reset Turnstile pour permettre une nouvelle soumission si besoin
      if (typeof window !== 'undefined' && window.turnstile && turnstileRef.current) {
        try { window.turnstile.reset(turnstileRef.current) } catch (_) {}
      }
    } catch (err) {
      setStatut({ envoi: 'ko', message: 'Erreur réseau, réessaie' })
    }
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const formValide = form.email.trim() && /^\d{4}$/.test(form.code_postal.trim()) && form.consentement_marketing
    && (form.type_utilisateur !== 'commercant' || !!form.commercant_nom.trim())
  // URLs stores en env (vides tant que les apps ne sont pas publiees).
  const appstoreUrl  = process.env.NEXT_PUBLIC_APPSTORE_URL || ''
  const playstoreUrl = process.env.NEXT_PUBLIC_PLAYSTORE_URL || ''
  const storesPretsAuTelechargement = !!(appstoreUrl && playstoreUrl)

  // Texte du sous-bloc formulaire : different selon la phase (avant dev. on
  // promet la decouverte ; entre dev. et lancement on promet le telechargement)
  const sousTexteForm = temps.phase === 'devoile'
    ? 'Laisse-nous ton email, et le 1er septembre tu seras parmi les premiers à télécharger Yoppaa.'
    : `Laisse-nous ton email, et le ${REVEAL_LABEL} tu seras parmi les premiers à découvrir Yoppaa.`

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(135deg, ${T.ink} 0%, ${T.deep} 60%, ${T.panel} 100%)`, color: '#fff', fontFamily: '"DM Sans", sans-serif', position: 'relative', overflowX: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer/>

      {/* Halo decoratif */}
      <div aria-hidden="true" style={{ position: 'absolute', top: '-200px', right: '-200px', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${T.main}33 0%, transparent 60%)`, pointerEvents: 'none' }}/>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: '-300px', left: '-200px', width: 700, height: 700, borderRadius: '50%', background: `radial-gradient(circle, ${T.mid}25 0%, transparent 60%)`, pointerEvents: 'none' }}/>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 60px', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', minHeight: '100dvh', justifyContent: 'center' }}>

        {/* Logo canonique Yoppaa : wordmark + 5 dots V2-B (proportions strictes
            dotBase = wordmarkSize * 0.254, cf. composant <YoppaaLogo>).
            Le pulse hero est applique sur l'ensemble du logo (signature
            d'arrivee animee) au lieu d'un gros dot pulse separe. */}
        <div style={{ marginBottom: 48, animation: 'pulse 2.4s ease-in-out infinite' }}>
          <YoppaaLogo size={64} mode="dark"/>
        </div>

        {/* ─── BASCULE date-conditionnelle 3 modes ─── */}
        {temps.phase === 'lancement' ? (
          // MODE LANCEMENT (>= 01/09) : l'app est dispo
          <>
            <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.4rem)', fontWeight: 900, letterSpacing: '-1.8px', lineHeight: 1.1, margin: '0 0 14px', maxWidth: 580 }}>
              Yoppaa est arrivé. 🟣
            </h1>
            <p style={{ fontSize: '1.05rem', color: T.light, lineHeight: 1.6, maxWidth: 480, margin: '0 0 36px', opacity: 0.92 }}>
              L&rsquo;app belge de ton quartier est disponible.<br/>
              Télécharge-la maintenant.
            </p>

            {storesPretsAuTelechargement ? (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 32 }}>
                <a href={appstoreUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderRadius: 14, background: '#000', color: '#fff', textDecoration: 'none', fontFamily: '"DM Sans", sans-serif', minWidth: 220, justifyContent: 'flex-start', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', border: '1.5px solid rgba(255,255,255,0.1)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <span style={{ textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 600, opacity: 0.7, letterSpacing: 0.5 }}>Télécharger dans l&rsquo;</span>
                    <span style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>App Store</span>
                  </span>
                </a>
                <a href={playstoreUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderRadius: 14, background: '#000', color: '#fff', textDecoration: 'none', fontFamily: '"DM Sans", sans-serif', minWidth: 220, justifyContent: 'flex-start', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', border: '1.5px solid rgba(255,255,255,0.1)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734c0-.378.234-.706.61-.92z" fill="#34A853"/>
                    <path d="M16.81 15.013l-3.018-3.013 3.018-3.013 4.39 2.474c1.05.59 1.05 2.084 0 2.674l-4.39 2.878z" fill="#FBBC04"/>
                    <path d="M13.792 12L3.609 1.814A1.005 1.005 0 0 1 4.22 1.78l13.012 7.31-3.44 2.91z" fill="#4285F4"/>
                    <path d="M13.792 12l3.44 2.91-13.013 7.31a1.005 1.005 0 0 1-.61-.034L13.792 12z" fill="#EA4335"/>
                  </svg>
                  <span style={{ textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 600, opacity: 0.7, letterSpacing: 0.5 }}>Disponible sur</span>
                    <span style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>Google Play</span>
                  </span>
                </a>
              </div>
            ) : (
              // Garde-fou : si les URLs stores ne sont pas encore renseignees en env
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: '18px 22px', maxWidth: 460, width: '100%', backdropFilter: 'blur(12px)', marginBottom: 32 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.5 }}>
                  Disponible très bientôt sur l&rsquo;App Store et Google Play.
                </p>
              </div>
            )}
          </>
        ) : temps.phase === 'devoile' ? (
          // MODE DEVOILE (1er août → 31/08) : Yoppaa annonce + compteur vers 01/09
          <>
            <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.4rem)', fontWeight: 900, letterSpacing: '-1.8px', lineHeight: 1.1, margin: '0 0 14px', maxWidth: 620 }}>
              Yoppaa, c&rsquo;est <span style={{ color: T.light }}>dévoilé</span>. 🟣
              <span style={{ display: 'block', marginTop: 14, fontSize: '0.62em', fontWeight: 700, opacity: 0.88, letterSpacing: '-0.8px' }}>
                Lancement complet le 1<sup style={{ fontSize: '0.6em' }}>er</sup> septembre.
              </span>
            </h1>
            <p style={{ fontSize: '1.05rem', color: T.light, lineHeight: 1.6, maxWidth: 520, margin: '0 0 36px', opacity: 0.92 }}>
              L&rsquo;app belge de ton quartier arrive le <strong style={{ color: '#fff' }}>1<sup style={{ fontSize: '0.7em' }}>er</sup> septembre 2026</strong>.<br/>
              D&rsquo;ici là, regarde ton quartier rejoindre Yoppaa tout l&rsquo;été. <DrapeauBelge/> 🟣
            </p>
            <CompteurEtForm
              temps={temps}
              statut={statut}
              form={form}
              setForm={setForm}
              soumettre={soumettre}
              formValide={formValide}
              siteKey={siteKey}
              turnstileRef={turnstileRef}
              sousTexteForm={sousTexteForm}
              communeStats={communeStats}
            />
          </>
        ) : (
          // MODE TEASING (< 1er août) : compteur vers le devoilement
          <>
            <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.4rem)', fontWeight: 900, letterSpacing: '-1.8px', lineHeight: 1.1, margin: '0 0 14px', maxWidth: 620 }}>
              {/* Par défaut inclusif (« ton quartier »), personnalisé sur la commune
                  du visiteur dès qu'on l'a résolue via son code postal. */}
              Quelque chose se<br/>prépare {communeStats?.nom
                ? <>à <span style={{ color: T.light }}>{communeStats.nom}</span>.</>
                : <>dans <span style={{ color: T.light }}>ton quartier</span>.</>}
              <span style={{ display: 'block', marginTop: 14, fontSize: '0.62em', fontWeight: 700, opacity: 0.88, letterSpacing: '-0.8px' }}>
                Et bientôt partout en Belgique.
              </span>
            </h1>
            <p style={{ fontSize: '1.05rem', color: T.light, lineHeight: 1.6, maxWidth: 480, margin: '0 0 36px', opacity: 0.92 }}>
              Un projet belge. Un projet pour ton quartier.<br/>
              Le grand dévoilement le <strong style={{ color: '#fff' }}>{REVEAL_LABEL_ANNEE}</strong>. 🟣
            </p>
            <CompteurEtForm
              temps={temps}
              statut={statut}
              form={form}
              setForm={setForm}
              soumettre={soumettre}
              formValide={formValide}
              siteKey={siteKey}
              turnstileRef={turnstileRef}
              sousTexteForm={sousTexteForm}
              communeStats={communeStats}
            />
          </>
        )}

        {/* Footer minimal (commun aux 2 modes) */}
        <footer style={{ marginTop: 60, fontSize: 11, color: T.light, opacity: 0.6, lineHeight: 1.7 }}>
          <p style={{ margin: 0 }}>📧 hello@yoppaa.app · 📍 Belgique</p>
          <p style={{ margin: '6px 0 0' }}>Yoppaa est un projet d&rsquo;Avcotech SRL · BCE 0731.637.148</p>
        </footer>
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50%      { transform: scale(1.08); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  )
}

// Drapeau belge SVG inline : 3 bandes verticales noir / jaune / rouge.
// On evite l'emoji 🇧🇪 qui sur Windows + certains navigateurs s'affiche en
// "BE" (Regional Indicator Symbols non rendus comme drapeau par Microsoft).
// SVG = rendu identique partout + respecte la charte Yoppaa (pas d'emoji).
function DrapeauBelge() {
  return (
    <svg width="20" height="14" viewBox="0 0 30 20" aria-label="Belgique"
      style={{ display: 'inline-block', verticalAlign: '-0.15em', marginLeft: 4, borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
      <rect width="10" height="20" fill="#000000"/>
      <rect x="10" width="10" height="20" fill="#FAE042"/>
      <rect x="20" width="10" height="20" fill="#ED2939"/>
    </svg>
  )
}

// Bloc compteur + formulaire pre-inscription. Partage entre les modes teasing
// et devoile (le compteur cible REVEAL_DATE en teasing, LAUNCH_DATE en devoile
// via la valeur de temps.phase qui pilote calculerEtatTemps).
function CompteurEtForm({ temps, statut, form, setForm, soumettre, formValide, siteKey, turnstileRef, sousTexteForm, communeStats }) {
  return (
    <>
      {/* Compteur */}
      <div style={{ display: 'flex', gap: 'clamp(10px, 3vw, 22px)', marginBottom: 44, justifyContent: 'center', flexWrap: 'wrap' }}>
        {[
          { val: temps.jours,    label: 'jours' },
          { val: temps.heures,   label: 'heures' },
          { val: temps.minutes,  label: 'minutes' },
          { val: temps.secondes, label: 'secondes' },
        ].map(({ val, label }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 }}>
            <span style={{ fontSize: 'clamp(2.4rem, 7vw, 3.6rem)', fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums', textShadow: '0 4px 24px #6B35C480' }}>
              {pad(val)}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Message d'accueil : parle aux deux publics (commerçants + curieux).
          Texte blanc haut contraste (jamais de violet pâle, surtout en petit). */}
      <div style={{ maxWidth: 460, width: '100%', margin: '0 auto 18px', padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
        <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.4 }}>
          Sur Yoppaa, tout le monde a sa place.
        </p>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: 'rgba(255,255,255,0.92)', lineHeight: 1.55 }}>
          Commerçant alimentaire, de service ou de détail : tu peux <strong style={{ color: '#fff', fontWeight: 800 }}>exister</strong> et te faire connaître dans ton quartier.<br/>
          Simplement curieux ? Suis la vie de tes commerces et <strong style={{ color: '#fff', fontWeight: 800 }}>rejoins la tribu Yoppaa</strong>. 🟣
        </p>
      </div>

      {/* Formulaire pre-inscription */}
      {statut.envoi === 'ok' ? (
        <div style={{ background: 'rgba(16,185,129,0.15)', border: '1.5px solid #10B98166', borderRadius: 18, padding: '24px 22px', maxWidth: 460, width: '100%', backdropFilter: 'blur(12px)' }}>
          <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#A7F3D0' }}>
            ✓ {statut.message}
          </p>
        </div>
      ) : (
        <form onSubmit={soumettre} style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '24px 22px', maxWidth: 460, width: '100%', backdropFilter: 'blur(12px)' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>Sois prévenu en premier</p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', margin: '0 0 16px', lineHeight: 1.5 }}>
            {sousTexteForm}
          </p>

          <input type="email" required placeholder="Ton email"
            value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            style={inputStyle}/>

          <input type="text" required inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="Ton code postal (4 chiffres)"
            value={form.code_postal} onChange={e => setForm(p => ({ ...p, code_postal: e.target.value.replace(/\D/g, '').slice(0,4) }))}
            style={inputStyle}/>

          {/* Incitant : compteur de la commune saisie (preuve sociale, aucun nom). */}
          {communeStats && (() => {
            const nb = communeStats.nb_preinscrits || 0
            const seuil = Math.max(1, communeStats.seuil_preinscrits || 50)
            const reste = Math.max(0, seuil - nb)
            const pct = Math.min(100, Math.round((nb / seuil) * 100))
            const pionnier = nb < 5
            return (
              <div style={{ margin: '-4px 0 14px', padding: '12px 14px', borderRadius: 12, background: 'rgba(150,96,224,0.14)', border: '1px solid rgba(196,160,244,0.35)' }}>
                {communeStats.active ? (
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.45 }}>
                    Yoppaa est déjà disponible à <strong>{communeStats.nom}</strong> 🟣
                  </p>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.45 }}>
                      {pionnier
                        ? <>Sois parmi les premiers pionniers de <strong>{communeStats.nom}</strong> 🟣</>
                        : <><strong>{nb}</strong> personnes attendent déjà Yoppaa à <strong>{communeStats.nom}</strong> 🟣</>}
                    </p>
                    <div style={{ height: 7, borderRadius: 100, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', margin: '8px 0 6px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: 'linear-gradient(90deg, #9660E0, #C4A0F4)', transition: 'width 0.4s' }}/>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
                      {reste > 0 ? `Plus que ${reste} pour débloquer ta commune` : 'Objectif de mobilisation atteint !'}
                    </p>
                  </>
                )}
              </div>
            )
          })()}

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {[
              { val: 'yopper',     label: 'Je suis curieux' },
              { val: 'commercant', label: 'Je suis commerçant' },
            ].map(opt => {
              const actif = form.type_utilisateur === opt.val
              return (
                <button key={opt.val} type="button"
                  onClick={() => setForm(p => ({ ...p, type_utilisateur: opt.val }))}
                  style={{ flex: 1, padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${actif ? '#C4A0F4' : 'rgba(255,255,255,0.18)'}`, background: actif ? 'rgba(196,160,244,0.18)' : 'transparent', color: actif ? '#fff' : '#C4A0F4', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}>
                  {opt.label}
                </button>
              )
            })}
          </div>

          {/* Nom de commerce : requis si commerçant (son enseigne), optionnel si
              curieux (un commerce qu'il aimerait voir). */}
          <input type="text"
            required={form.type_utilisateur === 'commercant'}
            maxLength={160}
            placeholder={form.type_utilisateur === 'commercant'
              ? 'Le nom de ton commerce'
              : 'Un commerce que tu aimerais sur Yoppaa ? (optionnel)'}
            value={form.commercant_nom}
            onChange={e => setForm(p => ({ ...p, commercant_nom: e.target.value }))}
            style={inputStyle}/>

          <textarea placeholder="Un message ? (optionnel)" rows={2}
            value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value.slice(0, 500) }))}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 50 }}/>

          {/* Cloudflare Turnstile invisible */}
          {siteKey && (
            <div ref={turnstileRef} className="cf-turnstile"
              data-sitekey={siteKey}
              data-callback="onTurnstileSuccess"
              data-expired-callback="onTurnstileExpired"
              data-error-callback="onTurnstileError"
              data-size="invisible"/>
          )}

          <button type="submit" disabled={statut.envoi === 'envoi' || !formValide}
            style={{ width: '100%', padding: '14px', borderRadius: 100, border: 'none', background: !formValide || statut.envoi === 'envoi' ? 'rgba(255,255,255,0.12)' : 'linear-gradient(135deg, #C4A0F4, #9660E0)', color: !formValide || statut.envoi === 'envoi' ? 'rgba(255,255,255,0.5)' : '#1A0840', fontWeight: 900, fontSize: 14, letterSpacing: 0.5, textTransform: 'uppercase', cursor: !formValide || statut.envoi === 'envoi' ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s', marginTop: 4 }}>
            {statut.envoi === 'envoi' ? 'Envoi…' : 'Me prévenir du lancement'}
          </button>

          {statut.envoi === 'ko' && statut.message && (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: '#FCA5A5', fontWeight: 700, textAlign: 'center' }}>
              ⚠ {statut.message}
            </p>
          )}

          <p style={{ margin: '14px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 1.5 }}>
            <Lock size={11} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Aucun spam. Données protégées.
          </p>
        </form>
      )}
    </>
  )
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1.5px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 12,
  fontFamily: '"DM Sans", sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
}
