'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { PLAN_LABEL, PLANS, plansDispoPourCategorie, getPrixPlan } from '@/lib/plans'
import { compresserImage } from '@/lib/compress-image'
// Icônes Lucide React : SVG inline alignés sur la charte canonique Yoppaa.
// Convention : stroke-width 1.8, currentColor pour hériter de la palette parent.
// Aucun emoji dans l'UI (règle Master), sauf exceptions soleil GMY + 🟣 signature.
import {
  Croissant, Scissors, ShoppingBag,
  User, Heart, Radio, Sun, Megaphone, Flame, AlertTriangle, Bell, Mail, Sparkles, BarChart3,
  ShoppingCart, Bike, Utensils, Calendar, Briefcase, Clock, Users, Package, CreditCard, Star, Download,
  Smartphone, Printer, Camera, FileText, Pencil, CheckCircle, Check, Circle, Shield, Upload, IdCard,
} from 'lucide-react'
// Logo canonique Yoppaa : wordmark + 5 dots V2-B (spec validee 12/06).
// Ne JAMAIS redessiner les dots ailleurs : importer YoppaaLogo ou YoppaaDots.
import YoppaaLogo from '@/app/components/YoppaaLogo'
// Helpers KYB (validation BCE belge mod 97).
import { validerBCE, formaterBCECompact } from '@/lib/kyb'
import TurnstileWidget from '@/app/components/TurnstileWidget'

// Types de commerce : source unique lib/types-commerce (listes étendues 23/07,
// double métier max 2, champ libre « Autre… »). Sélection via SelecteurTypes.
import SelecteurTypes from '@/app/components/SelecteurTypes'

// ─── SKIP-LOGIC (esprit ODOO : adaptive selon plan + categorie) ────────────────
// La structure 5 etapes reste constante, mais le CONTENU et les contraintes
// s'adaptent au profil du commercant. Source : MASTER_FEATURES.md section 4.
function getPlanActif(commercant, onboarding) {
  return onboarding?.plan_choisi || commercant?.plan || 'exister'
}
// Exister = gratuit a vie : visuels et horaires sont fortement optionnels
// (on offre une experience zero friction). Le commercant peut tout completer
// depuis son dashboard apres signup.
function peutSkipperVisuels(plan) {
  return plan === 'exister' || plan === 'communiquer'
}
// Horaires d'ouverture obligatoires SAUF pour services vitrine en plan Exister
// (un coiffeur peut etre purement sur RDV sans horaires fixes).
function peutSkipperHoraires(plan, categorie) {
  return plan === 'exister' && categorie === 'vitrine'
}

// ─── GENERATEURS DE VISUELS AUTO (fallback branded Yoppaa) ────────────────────
// Quand le commercant n'a pas de logo/photo, on lui propose de generer un
// visuel propre dans la charte Yoppaa. Esprit Gmail/Notion : cercle initiale.
// Cover : gradient violet + nom + 3 dots tricolores (signature canonique).
async function canvasVersBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png', 0.95))
}

function genererLogoCanvas(nom) {
  const taille = 512
  const canvas = document.createElement('canvas')
  canvas.width = taille
  canvas.height = taille
  const ctx = canvas.getContext('2d')
  // Gradient radial violet : du clair au centre vers le sombre en bord
  const grad = ctx.createRadialGradient(taille * 0.4, taille * 0.35, 30, taille / 2, taille / 2, taille / 2)
  grad.addColorStop(0, '#9660E0')
  grad.addColorStop(0.6, '#6B35C4')
  grad.addColorStop(1, '#2D0F6B')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(taille / 2, taille / 2, taille / 2, 0, Math.PI * 2)
  ctx.fill()
  // Initiale en blanc, Plus Jakarta Sans 800
  const nomClean = (nom || 'Y').trim()
  const initiale = nomClean.charAt(0).toUpperCase()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 300px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initiale, taille / 2, taille / 2 + 12)
  return canvas
}

// Dots V2-B (5 dots maillon) — spec canonique 2026-06-12, fond fonce.
// Sequence : grand / mini / grand / mini / grand, decalage vertical 0.4*base
// sur les 4 dots du milieu pour former le sourire.
function dessinerDotsV2B(ctx, centerX, topY, base, colors) {
  const mini = base * 0.55
  const gap = base * 0.55
  const offset = base * 0.4
  const total = 3 * base + 2 * mini + 4 * gap
  let x = centerX - total / 2
  // d1 grand (pas d'offset)
  ctx.fillStyle = colors[0]
  ctx.beginPath(); ctx.arc(x + base / 2, topY + base / 2, base / 2, 0, Math.PI * 2); ctx.fill()
  x += base + gap
  // d2 mini (offset)
  ctx.fillStyle = colors[1]
  ctx.beginPath(); ctx.arc(x + mini / 2, topY + offset + mini / 2, mini / 2, 0, Math.PI * 2); ctx.fill()
  x += mini + gap
  // d3 grand (offset)
  ctx.fillStyle = colors[2]
  ctx.beginPath(); ctx.arc(x + base / 2, topY + offset + base / 2, base / 2, 0, Math.PI * 2); ctx.fill()
  x += base + gap
  // d4 mini (offset)
  ctx.fillStyle = colors[3]
  ctx.beginPath(); ctx.arc(x + mini / 2, topY + offset + mini / 2, mini / 2, 0, Math.PI * 2); ctx.fill()
  x += mini + gap
  // d5 grand (pas d'offset)
  ctx.fillStyle = colors[4]
  ctx.beginPath(); ctx.arc(x + base / 2, topY + base / 2, base / 2, 0, Math.PI * 2); ctx.fill()
}

function genererCoverCanvas(nom) {
  const w = 1600, h = 900
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  // Gradient diagonal sombre Yoppaa
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, '#160636')
  grad.addColorStop(0.5, '#2D0F6B')
  grad.addColorStop(1, '#1A0840')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  // Halo violet en haut a droite (rappel du header Yoppaa)
  const halo = ctx.createRadialGradient(w * 0.85, h * 0.15, 0, w * 0.85, h * 0.15, w * 0.55)
  halo.addColorStop(0, 'rgba(150, 96, 224, 0.35)')
  halo.addColorStop(1, 'rgba(150, 96, 224, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, w, h)
  // Nom du commerce centre (Plus Jakarta Sans 800 minuscules style wordmark)
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let fontSize = 130
  ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`
  const nomClean = (nom || 'Mon commerce').trim()
  while (ctx.measureText(nomClean).width > w * 0.82 && fontSize > 50) {
    fontSize -= 6
    ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`
  }
  ctx.fillText(nomClean, w / 2, h / 2 - 40)
  // Dots V2-B SOUS le nom (5 dots maillon, palette fond fonce)
  // Couleurs : blanc / light / light / mid / mid (cf. composant YoppaaLogo)
  const dotBase = 56
  const dotsTopY = h / 2 + 60
  dessinerDotsV2B(ctx, w / 2, dotsTopY, dotBase, ['#FFFFFF', '#C4A0F4', '#C4A0F4', '#9660E0', '#9660E0'])
  // Slogan "sur Yoppaa" SOUS les dots
  ctx.fillStyle = 'rgba(196, 160, 244, 0.9)'
  ctx.font = '600 34px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.fillText('sur Yoppaa', w / 2, dotsTopY + dotBase + 50)
  return canvas
}

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
// Crée le commerçant + sa ligne d'onboarding (nécessite une session Supabase active,
// les RLS exigeant auth.uid()). Partagé entre la création directe (confirmation email
// OFF) et la reprise au retour de confirmation (confirmation email ON).
async function creerCommercantEtOnboarding(userId, email, categorie, plan) {
  const { data: c, error: cErr } = await supabase.from('commercants').insert({
    auth_user_id: userId,
    email,
    nom: 'Mon commerce',
    type: 'À définir',
    categorie,
    plan,
    plan_actif_depuis: new Date().toISOString(),
    statut: 'en_cours_onboarding',
    statut_publication: 'brouillon',
  }).select().single()
  if (cErr) return { error: `Création commerçant : ${cErr.message}` }

  const { data: ob, error: obErr } = await supabase.from('onboarding_commercants').insert({
    commercant_id: c.id,
    etape_actuelle: 2,
    plan_choisi: plan,
  }).select().single()
  if (obErr) return { error: `Initialisation onboarding : ${obErr.message}`, commercant: c }

  return { commercant: c, onboarding: ob }
}

export default function Signup() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [session, setSession] = useState(null)
  const [commercant, setCommercant] = useState(null)
  const [onboarding, setOnboarding] = useState(null)
  const [etape, setEtape] = useState(1)
  // Etat de sauvegarde global affiche dans le bandeau recap (entete sticky).
  // Cycle : null -> 'saving' -> 'saved' (auto -> null apres 2s).
  const [etatSauvegarde, setEtatSauvegarde] = useState(null)
  const timerSavedRef = useRef(null)

  function signalerSauvegarde(status) {
    clearTimeout(timerSavedRef.current)
    setEtatSauvegarde(status)
    if (status === 'saved') {
      timerSavedRef.current = setTimeout(() => setEtatSauvegarde(null), 2000)
    }
  }

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
        } else {
          // Session sans commerçant : reprise après confirmation d'email ? Si un choix
          // plan/catégorie est en attente (creerCompte l'a mémorisé avant la confirmation),
          // on crée le commerçant maintenant (session présente → RLS OK). Sinon on reste
          // à l'étape 1 pour création.
          let pending = null
          try { pending = JSON.parse(localStorage.getItem('yoppaa_pending_commercant') || 'null') } catch (e) {}
          if (pending?.categorie && pending?.plan) {
            const res = await creerCommercantEtOnboarding(s.user.id, s.user.email, pending.categorie, pending.plan)
            try { localStorage.removeItem('yoppaa_pending_commercant') } catch (e) {}
            if (annule) return
            if (res.commercant) {
              setCommercant(res.commercant)
              if (res.onboarding) { setOnboarding(res.onboarding); setEtape(res.onboarding.etape_actuelle || 2) }
              else setEtape(2)
            }
          }
        }
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
      {/* Animations globales du signup (slide entre etapes + pulse indicateur sauvegarde) */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes yopSlideIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes yopPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      ` }}/>

      {/* En-tête violet foncé */}
      <header style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.ink} 100%)`, padding: '1.25rem 1.25rem 1rem', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.mid}33 0%, transparent 50%)`, pointerEvents: 'none' }}/>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', maxWidth: 720, margin: '0 auto', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <YoppaaLogo size={28} mode="dark"/>
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

      {/* Bandeau recap sticky : visible des qu'on a un nom de commerce reel (etapes 2+) */}
      <RecapHeader commercant={commercant} etatSauvegarde={etatSauvegarde}/>

      {/* Contenu de l'etape - key={etape} declenche l'animation slide a chaque changement */}
      <main key={etape} style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1.25rem 4rem', animation: 'yopSlideIn 0.3s ease-out' }}>
        {etape === 1 && (
          <Etape1Compte
            session={session}
            commercant={commercant}
            onCompte={(s, c, ob) => {
              setSession(s); setCommercant(c); setOnboarding(ob); avancerVers(2)
            }}
          />
        )}
        {etape === 2 && commercant && (
          <Etape2Infos
            commercant={commercant}
            onboarding={onboarding}
            onUpdate={c => setCommercant(c)}
            onUpdateOb={ob => setOnboarding(ob)}
            onSaving={signalerSauvegarde}
            avancer={() => avancerVers(3)}
            retour={() => avancerVers(1)}
          />
        )}
        {etape === 3 && commercant && (
          <Etape3Visuels
            commercant={commercant}
            onboarding={onboarding}
            onUpdate={c => setCommercant(c)}
            onUpdateOb={ob => setOnboarding(ob)}
            onSaving={signalerSauvegarde}
            avancer={() => avancerVers(4)}
            retour={() => avancerVers(2)}
          />
        )}
        {etape === 4 && commercant && (
          <Etape4Horaires
            commercant={commercant}
            onboarding={onboarding}
            onUpdate={c => setCommercant(c)}
            onUpdateOb={ob => setOnboarding(ob)}
            onSaving={signalerSauvegarde}
            avancer={() => avancerVers(5)}
            retour={() => avancerVers(3)}
          />
        )}
        {etape === 5 && commercant && onboarding && (
          <Etape5Validation
            commercant={commercant}
            onboarding={onboarding}
            onUpdate={c => setCommercant(c)}
            onUpdateOb={ob => setOnboarding(ob)}
            onSaving={signalerSauvegarde}
            retour={() => avancerVers(4)}
            aller={n => avancerVers(n)}
          />
        )}
      </main>
    </div>
  )
}

// ─── RECAP HEADER STICKY ──────────────────────────────────────────────────────
// Bandeau persistant juste sous le header violet. Affiche "{nom} · {ville}"
// des que le commercant a un vrai nom (apres l'etape 1) + indicateur sauvegarde
// type Notion sur la droite.
function extractVille(adresse) {
  if (!adresse) return null
  const parts = adresse.split(',').map(p => p.trim())
  // Format Nominatim typique : "Rue X 12, 5640 Mettet, Belgique"
  for (const part of parts) {
    const m = part.match(/^\d{4}\s+(.+)$/)
    if (m) return m[1]
  }
  return null
}

function RecapHeader({ commercant, etatSauvegarde }) {
  if (!commercant) return null
  const nomAffiche = commercant.nom && commercant.nom !== 'Mon commerce' ? commercant.nom : null
  if (!nomAffiche) return null
  const ville = extractVille(commercant.adresse)
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,246,255,0.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: `1px solid ${T.hairline}` }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0.625rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ fontSize: '0.85rem', fontWeight: 800, color: T.deep, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {nomAffiche}
          {ville && <span style={{ color: T.muted, fontWeight: 500 }}> · {ville}</span>}
        </p>
        <IndicateurSauvegarde etat={etatSauvegarde}/>
      </div>
    </div>
  )
}

function IndicateurSauvegarde({ etat }) {
  if (!etat) return <span style={{ width: 1, flexShrink: 0 }}/>
  if (etat === 'saving') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: T.muted, fontWeight: 600, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.mid, animation: 'yopPulse 1.2s infinite', flexShrink: 0 }}/>
        Enregistrement…
      </span>
    )
  }
  if (etat === 'saved') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#10B981', fontWeight: 700, flexShrink: 0 }}>
        <Check size={13} strokeWidth={2.6}/>
        Enregistré
      </span>
    )
  }
  return null
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
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? '#10B981' : (active ? '#fff' : 'rgba(255,255,255,0.15)'), color: active ? T.bgPanel : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, border: active ? `2px solid ${T.light}` : 'none', transition: 'all 0.2s', boxShadow: active ? `0 4px 12px rgba(196,160,244,0.5)` : 'none' }}>
                {done ? '✓' : e.n}
              </div>
              <p style={{ fontSize: 10, fontWeight: 700, color: done || active ? '#fff' : 'rgba(255,255,255,0.4)', marginTop: 4, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{e.label}</p>
            </div>
            {i < ETAPES.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#10B981' : 'rgba(255,255,255,0.15)', borderRadius: 2, marginTop: 13, transition: 'background 0.2s' }}/>
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
  const [categorie, setCategorie] = useState(commercant?.categorie || 'alimentaire')
  const [plan, setPlan] = useState(commercant?.plan || 'exister')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const turnstileRef = useRef(null)

  const dejaConnecte = !!session
  const plansDispos = plansDispoPourCategorie(categorie)

  // Si la catégorie change et que le plan choisi n'est plus dispo, on redescend
  // automatiquement sur le plan le plus haut dispo (Vendre pour toutes catégories).
  useEffect(() => {
    if (!plansDispos.includes(plan)) {
      setPlan(plansDispos[plansDispos.length - 1])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorie])

  async function creerCompte() {
    setError('')
    if (!email.trim() || !password.trim()) return setError('Email et mot de passe obligatoires')
    if (!isPasswordStrong(password)) return setError('Ton mot de passe doit faire au moins 8 caractères et contenir 1 minuscule, 1 majuscule, 1 chiffre et 1 caractère spécial.')
    setLoading(true)

    // 1) Création du compte Supabase Auth (token Turnstile single-use)
    const captchaToken = await turnstileRef.current?.getToken()
    const { data: signupData, error: signupErr } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/signup`,
        captchaToken,
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
      // Tente auto-connexion si pas de session retournée (cas où email verification
      // désactivée). Le token Turnstile étant single-use, on en régénère un 2e.
      const captchaToken2 = await turnstileRef.current?.getToken()
      const { data: signInData } = await supabase.auth.signInWithPassword({
        email: email.trim(), password: password.trim(),
        options: { captchaToken: captchaToken2 },
      })
      if (signInData?.session) { s = signInData.session; userId = signInData.user?.id }
    }
    if (!userId) {
      setError('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis reviens sur cette page pour finaliser ton inscription.')
      setLoading(false)
      return
    }

    // Mémorise le choix plan/catégorie pour la reprise après confirmation d'email.
    try { localStorage.setItem('yoppaa_pending_commercant', JSON.stringify({ categorie, plan })) } catch (e) {}

    // Confirmation d'email ACTIVE : signUp ne renvoie pas de session tant que l'email
    // n'est pas confirmé. On ne peut pas créer le commerçant (RLS exige auth.uid). On
    // invite à confirmer ; le commerçant sera créé au retour (init détecte la session).
    if (!s) {
      setError('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis reviens sur cette page pour finaliser ton inscription.')
      setLoading(false)
      return
    }

    // Session active → création immédiate du commerçant + onboarding.
    const res = await creerCommercantEtOnboarding(userId, email.trim(), categorie, plan)
    if (res.error) {
      setError(res.error)
      setLoading(false)
      return
    }
    try { localStorage.removeItem('yoppaa_pending_commercant') } catch (e) {}
    setLoading(false)
    onCompte(s, res.commercant, res.onboarding)
  }

  // Si déjà connecté, juste mettre à jour catégorie + plan choisi.
  // Cas limite : session active SANS fiche commerçant (retour de confirmation
  // d'email sans choix mémorisé, ou compte Yopper) → on crée la fiche ici.
  async function mettreAJourPlan() {
    setError('')
    setLoading(true)
    if (!commercant) {
      const res = await creerCommercantEtOnboarding(session.user.id, session.user.email, categorie, plan)
      setLoading(false)
      if (res.error) return setError(res.error)
      onCompte(session, res.commercant, res.onboarding)
      return
    }
    await supabase.from('commercants')
      .update({ categorie, plan, plan_actif_depuis: new Date().toISOString() })
      .eq('id', commercant.id)
    setLoading(false)
    onCompte(session, { ...commercant, categorie, plan }, null)
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
        Bienvenue sur Yoppaa
      </h1>
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 16px' }}>
        Crée ton compte et choisis ton plan. Tu pourras tout configurer en quelques minutes.
      </p>

      {/* Bandeau d'accroche : rassure sur la gratuité du plan Exister + essai 30j sur Communiquer/Vendre */}
      <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, color: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>🟣</span>
        <div>
          <p style={{ fontWeight: 900, fontSize: 14, margin: 0, letterSpacing: '-0.3px' }}>
            La formule <span style={{ color: T.light }}>Exister</span> est gratuite à vie. <span style={{ color: T.light }}>Communiquer</span> et <span style={{ color: T.light }}>Vendre</span> incluent 30 jours d&apos;essai gratuit.
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: '3px 0 0', lineHeight: 1.4 }}>
            Sans engagement. Tu peux changer de formule ou résilier à tout moment depuis ton tableau de bord.
          </p>
        </div>
      </div>

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

      <Card titre="Ton activité" sous="Yoppaa s'adapte à ton type de commerce.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <CategorieCard
            value="alimentaire"
            actif={categorie === 'alimentaire'}
            onClick={() => setCategorie('alimentaire')}
            titre="Alimentaire"
            sous="Click & Collect, livraison"
            exemples="Boulangerie, friterie, traiteur, snack…"
            Icon={Croissant}
          />
          <CategorieCard
            value="vitrine"
            actif={categorie === 'vitrine'}
            onClick={() => setCategorie('vitrine')}
            titre="Service"
            sous="Vitrine en ligne + prise de RDV"
            exemples="Coiffeur, opticien, esthéticienne, garagiste…"
            Icon={Scissors}
          />
          <CategorieCard
            value="detail"
            actif={categorie === 'detail'}
            onClick={() => setCategorie('detail')}
            titre="Détail"
            sous="Réservation produit, retrait"
            exemples="Vêtements, chaussures, fleuriste, librairie…"
            Icon={ShoppingBag}
          />
        </div>
      </Card>

      <Card titre="Choisis ta formule" sous="Tu pourras changer plus tard depuis ton tableau de bord.">
        <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
          {plansDispos.map(p => (
            <CardPlan key={p} plan={p} categorie={categorie} actif={plan === p} onClick={() => setPlan(p)}/>
          ))}
        </div>
        <p style={{ fontSize: 11, color: T.muted, marginTop: 14, lineHeight: 1.5, textAlign: 'center' }}>
          Tous les tarifs sont HTVA. La TVA applicable sera ajoutée au moment du paiement selon ton statut et ton pays.
        </p>
      </Card>

      {/* Mini-glossaire des fonctionnalités — contextuel selon la catégorie choisie */}
      <GlossaireFeatures categorie={categorie}/>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#7F1D1D', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <button onClick={dejaConnecte ? mettreAJourPlan : creerCompte} disabled={loading}
        style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, background: loading ? `${T.main}88` : `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: loading ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 8px 24px ${T.main}55` }}>
        {loading ? 'En cours…' : (dejaConnecte ? 'Continuer →' : 'Créer mon compte →')}
      </button>

      {/* Anti-bot Cloudflare Turnstile (invisible) */}
      <TurnstileWidget ref={turnstileRef} />

      <p style={{ fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 12 }}>
        Déjà inscrit ? <a href="/login" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>Se connecter</a>
      </p>

      {/* Lien discret pour les administrations communales : redirige vers une page
          de contact où ils peuvent demander à être contactés par Yoppaa pour un
          onboarding manuel (plan Public, gratuit à vie, dédié au secteur public). */}
      <div style={{ marginTop: 28, padding: '14px 16px', background: T.pale, borderRadius: 12, border: `1px solid ${T.main}22`, textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: T.deep, margin: 0, lineHeight: 1.5 }}>
          Vous représentez une <strong>administration communale ou un service public</strong> ?
          <br />
          <a href="/administrations" style={{ color: T.main, fontWeight: 800, textDecoration: 'none' }}>
            Demander un contact Yoppaa →
          </a>
        </p>
      </div>
    </div>
  )
}

// ─── GLOSSAIRE FEATURES — chaque concept Yoppaa expliqué clairement ─────────
// Refondu 17/06 pour la clarté : explique TOUS les concepts (Yopper, signal,
// favori, GMY, push…) + précise pour chaque feature dans quel plan elle est
// incluse. Adapté à la catégorie sélectionnée.
//
// Principe : "la clarté fait le succès". Le commerçant doit comprendre
// instantanément ce qu'il a, ce qu'il n'a pas, et ce qu'il débloque en
// passant au plan supérieur.

// Petit composant pour afficher le badge "Inclus avec Exister/Communiquer/Vendre".
function BadgePlan({ plan }) {
  const COLORS = {
    exister:     { bg: '#ECFDF5', fg: '#065F46', label: 'Inclus avec Exister' },
    communiquer: { bg: '#EDE0FF', fg: '#2D0F6B', label: 'Inclus avec Communiquer' },
    vendre:      { bg: '#FEF3C7', fg: '#78350F', label: 'Inclus avec Vendre' },
  }
  const c = COLORS[plan]
  if (!c) return null
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 800,
      background: c.bg, color: c.fg,
      padding: '2px 8px', borderRadius: 100, marginTop: 4,
      letterSpacing: '0.3px',
    }}>{c.label}</span>
  )
}

function GlossaireFeatures({ categorie = 'alimentaire' }) {
  const [ouvert, setOuvert] = useState(false)

  // ─── Section 1 : Les fondamentaux Yoppaa (toujours affichés) ─────────────
  // Refactor 17/06 : remplacement de tous les emojis par des composants Lucide.
  // Descriptions alignées sur MASTER_FEATURES.md (source unique de vérité).
  const fondamentaux = [
    {
      Icon: User, titre: 'Yopper',
      desc: 'C\'est ton client final : un habitant du quartier qui utilise l\'application Yoppaa pour découvrir, suivre et soutenir les commerces autour de lui. Les commerçants sont aussi des Yoppers : la tribu est unique.',
      plan: 'exister',
    },
    {
      Icon: Heart, titre: 'Favori',
      desc: 'Quand un Yopper te met en favori, il choisit de te suivre. Il reçoit tes actus, tes deals et tes notifications selon ton plan. Tu vois le nombre de favoris dans tes statistiques (jamais leur identité directe : tout passe par Yoppaa pour respecter le RGPD).',
      plan: 'exister',
    },
    {
      Icon: Radio, titre: 'Signal',
      desc: 'Un Yopper t\'envoie un signal préenregistré : "Je voudrais commander à l\'avance", "Vous livrez ?", "Avez-vous en stock ?" (catalogue adapté à ta catégorie). Tu vois les signaux dans ton tableau de bord et tu peux répondre rapidement. Les signaux ne sont pas un chat : ils servent à mesurer la demande et à débloquer les bonnes fonctions au bon moment.',
      plan: 'exister',
    },
    {
      Icon: Sun, titre: 'Good Morning Yoppers',
      desc: 'Push quotidien envoyé chaque matin à 7h30 aux Yoppers de ta zone. Exister : tu apparais automatiquement + tu peux y publier 1 actu basique. Communiquer / Vendre : tu fais remonter tes deals et actus enrichies. Public : la commune publie ses infos et alertes du jour. Deadline de publication : 23h la veille.',
      plan: 'exister',
    },
    {
      Icon: Megaphone, titre: 'Actualité',
      desc: 'Une nouvelle que tu publies : nouveau produit, événement, créneau libre. Exister : 1 actu basique par jour, visible uniquement dans Good Morning Yoppers (pas de bandeau sur ta fiche). Communiquer / Vendre : actus enrichies illimitées (titre + photo + description longue), visibles sur ta fiche + push aux favoris.',
      plan: 'communiquer',
    },
    {
      Icon: Flame, titre: 'Deal',
      desc: 'Une promotion à durée libre que tu fixes (quelques heures, plusieurs jours, plusieurs semaines). Visible sur ta fiche et envoyée en push à tes Yoppers favoris. Sur Communiquer, le Deal est informatif (le Yopper passe en boutique). Sur Vendre, le Yopper peut commander ou réserver directement depuis le deal.',
      plan: 'communiquer',
    },
    {
      Icon: Flame, titre: 'Bonne affaire',
      desc: 'Une promotion publiée le jour J pour le jour J uniquement : valable de la publication jusqu\'à minuit. Impossible de la programmer pour demain. Elle apparaît dans la section "Bonnes affaires" transverse de l\'app, visible par tous les Yoppers de la zone (pas seulement tes favoris). Si publiée avant 7h30, elle remonte aussi dans le Good Morning Yoppers. Idéale pour écouler un stock du jour, créer de l\'urgence et faire découvrir ton commerce.',
      plan: 'communiquer',
    },
    {
      Icon: AlertTriangle, titre: 'Alerte',
      desc: 'Information urgente : fermeture exceptionnelle, rupture, indisponibilité. Bandeau rouge prioritaire sur ta fiche, push immédiat à tes Yoppers favoris. Réservée aux plans Communiquer et Vendre, pas disponible sur Exister.',
      plan: 'communiquer',
    },
    {
      Icon: Bell, titre: 'Push ciblé',
      desc: 'Notification push envoyée uniquement à tes Yoppers favoris. Tu choisis le moment et tu peux segmenter (par centre d\'intérêt, ancienneté, dernière interaction). Yoppaa relaie le message via OneSignal : tu ne vois jamais les emails ou identités individuelles, tout reste conforme au RGPD.',
      plan: 'communiquer',
    },
    {
      Icon: Mail, titre: 'Newsletter ciblée',
      desc: 'Email envoyé à tes Yoppers favoris via Brevo (notre service intégré). Plus long et structuré qu\'un push. Tu rédiges dans ton tableau de bord, Yoppaa envoie pour toi. Désabonnement automatique conforme RGPD. Stats d\'ouverture et de clic dans ton tableau de bord.',
      plan: 'communiquer',
    },
    {
      Icon: Sparkles, titre: 'IA Yoppaa',
      desc: 'Assistant IA intégré pour rédiger plus vite. Communiquer (IA bridée) : reformulation de textes, suggestions d\'idées d\'actus, correction orthographique. Vendre (IA avancée) : rédaction complète, segmentation automatique des Yoppers, analyse de performance, benchmarking. Tu valides toujours avant publication, l\'IA propose, tu décides.',
      plan: 'communiquer',
    },
    {
      Icon: BarChart3, titre: 'Statistiques',
      desc: 'Exister : compteur vues, favoris, signaux. Communiquer : engagement push, taux d\'ouverture, performance newsletter. Vendre : suivi conversion complet, ROI par action, export comptable.',
      plan: 'exister',
    },
  ]

  // ─── Section 2 : Fonctions transactionnelles (selon catégorie) ───────────
  // Seulement débloquées avec le plan Vendre.
  const featuresAlimentaire = [
    {
      Icon: ShoppingCart, titre: 'Click & Collect',
      desc: 'Le Yopper commande tes produits à l\'avance et choisit son créneau de retrait. Tu reçois la commande dans ton tableau de bord, tu valides, tu marques prête. Confirmation "Ta commande est Yoppée !" côté Yopper. C\'est le cœur de l\'expérience Yoppaa alimentaire.',
      plan: 'vendre',
    },
    {
      Icon: Bike, titre: 'Livraison',
      desc: 'Module complet : zone géographique configurable, frais paramétrables, créneaux dédiés à la livraison, suivi de la commande côté Yopper.',
      plan: 'vendre',
    },
    {
      Icon: Utensils, titre: 'Réservation de table',
      desc: 'Pour les restaurateurs : tu configures tes capacités (X tables de 2, Y tables de 4, etc.) et tes créneaux par service (midi, soir). Le Yopper réserve depuis ta fiche, choisit l\'horaire et le nombre de personnes. Acompte optionnel. Confirmation "Ta table est Yoppée !" côté Yopper.',
      plan: 'vendre',
    },
  ]

  const featuresVitrine = [
    {
      Icon: Calendar, titre: 'Module RDV natif',
      desc: 'Le Yopper choisit une prestation, une date et un créneau, valide en 3 clics. Tu reçois la notification dans ton tableau de bord. Confirmation "C\'est noté !" côté Yopper, avec fichier iCal joint pour son calendrier. Aucune commission Yoppaa.',
      plan: 'vendre',
    },
    {
      Icon: Briefcase, titre: 'Prestations',
      desc: 'Catalogue de tes services : nom, durée (15 min à 3h), prix fixe ou fourchette, acompte optionnel. Modifiable à tout moment depuis ton tableau de bord.',
      plan: 'vendre',
    },
    {
      Icon: Clock, titre: 'Créneaux RDV',
      desc: 'Tu définis tes plages horaires par jour de la semaine, avec pause déjeuner si tu veux. Durée des créneaux configurable (15 min, 30 min, 1 h). Exceptions ponctuelles supportées.',
      plan: 'vendre',
    },
    {
      Icon: Users, titre: 'Multi-praticiens',
      desc: 'Tu ajoutes tes praticiens avec photo et spécialités. Chaque RDV est associé à une personne. Planning et statistiques par praticien. Le Yopper peut choisir ou laisser "Premier disponible".',
      plan: 'vendre',
    },
  ]

  const featuresDetail = [
    {
      Icon: Package, titre: 'Réservation produit',
      desc: 'Le Yopper réserve un article à venir chercher en magasin. Tu le mets de côté, tu reçois la notification, tu confirmes la disponibilité. Confirmation "Ton article est Yoppé !" côté Yopper. Parfait pour vêtements, livres, fleurs, jouets, etc.',
      plan: 'vendre',
    },
  ]

  // ─── Section 3 : Communes aux plans payants ──────────────────────────────
  const featuresVendre = [
    {
      Icon: CreditCard, titre: 'Paiement en ligne',
      desc: 'Stripe Connect intégré : ton Yopper paie son acompte ou sa commande directement sur ta fiche. Aucune commission Yoppaa. Ton argent va directement sur ton compte bancaire.',
      plan: 'vendre',
    },
    {
      Icon: Star, titre: 'Fidélité configurable',
      desc: 'Programme à points entièrement paramétrable : règle de gain (X € = Y points), seuils de récompense, type de récompense (% de remise, produit offert). Statistiques fidélité dans ton tableau de bord.',
      plan: 'vendre',
    },
    {
      Icon: Download, titre: 'Export comptable',
      desc: 'Exporte tes ventes, RDV ou réservations en CSV ou PDF mensuel pour ta comptabilité. Conservation des données 7 ans (loi belge).',
      plan: 'vendre',
    },
  ]

  // ─── Section 4 : Hardware et accessoires (optionnels) ────────────────────
  const featuresHardware = [
    {
      Icon: Smartphone, titre: 'Compatibilité Android & iOS',
      desc: 'Ton tableau de bord Yoppaa fonctionne sur n\'importe quel téléphone, tablette ou ordinateur. Android, iPhone, iPad, Mac, PC : pas besoin de matériel spécifique pour démarrer.',
      plan: 'exister',
    },
    {
      Icon: Printer, titre: 'Kit Yoppaa hardware',
      desc: 'Optionnel et disponible à tout moment depuis ton tableau de bord : Kit Yoppaa Pro (tablette + imprimante thermique, 399€ HTVA) ou Kit Yoppaa Light (imprimante seule, 179€ HTVA). Surtout utile en alimentaire (Click & Collect avec gestion comptoir). Les commerces de service ou de détail peuvent gérer leur activité sans hardware spécifique.',
      plan: null,
    },
  ]

  // Assemblage selon la catégorie
  const featuresParCategorie =
    categorie === 'vitrine' ? featuresVitrine :
    categorie === 'detail'  ? featuresDetail  :
                              featuresAlimentaire

  const features = [
    ...fondamentaux,
    ...featuresParCategorie,
    ...featuresVendre,
    ...featuresHardware,
  ]

  const sousTitre = 'Yopper, signal, favori, Good Morning Yoppers, deal, actu, push, IA…'

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, marginBottom: 14, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOuvert(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'left' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 800, color: T.bgPanel, margin: 0, letterSpacing: '-0.2px' }}>
            Comprendre les fonctionnalités
          </p>
          <p style={{ fontSize: 11, color: T.muted, margin: '2px 0 0', fontWeight: 600 }}>
            {sousTitre}
          </p>
        </div>
        <span style={{ fontSize: 14, color: T.main, fontWeight: 800, transform: ouvert ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
      </button>
      {ouvert && (
        <div style={{ padding: '4px 18px 16px', borderTop: `1px solid ${T.hairline}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {features.map(f => {
            const FeatureIcon = f.Icon
            return (
              <div key={f.titre} style={{ display: 'flex', gap: 10, paddingTop: 12, borderBottom: `1px dashed ${T.hairline}`, paddingBottom: 12 }}>
                <span style={{ flexShrink: 0, marginTop: 2, color: T.main }}>
                  {FeatureIcon ? <FeatureIcon size={20} strokeWidth={1.8}/> : null}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: 0 }}>{f.titre}</p>
                  <p style={{ fontSize: 12, color: T.deep, margin: '3px 0 0', lineHeight: 1.5 }}>{f.desc}</p>
                  {f.plan && <BadgePlan plan={f.plan} />}
                </div>
              </div>
            )
          })}
          <p style={{ fontSize: 11, color: T.muted, margin: '4px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
            Tout ce qu&apos;a Exister, Communiquer l&apos;a aussi. Tout ce qu&apos;a Communiquer, Vendre l&apos;a aussi.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── ÉTAPE 2 : INFOS DE BASE ──────────────────────────────────────────────────
// - Nom, type, adresse (autocomplete Nominatim), téléphone, description ≥20
// - Sauvegarde auto champ par champ (debounce 600ms)
// - Update onboarding_commercants.infos_ok = true quand tous les champs requis
function Etape2Infos({ commercant, onboarding, onUpdate, onUpdateOb, onSaving, avancer, retour }) {
  const [form, setForm] = useState({
    nom: commercant.nom === 'Mon commerce' ? '' : (commercant.nom || ''),
    type: commercant.type === 'À définir' ? '' : (commercant.type || ''),
    adresse: commercant.adresse || '',
    telephone: commercant.telephone || '',
    description: commercant.description || '',
    latitude: commercant.latitude,
    longitude: commercant.longitude,
  })
  const [suggestions, setSuggestions] = useState([])
  const [searchingAdresse, setSearchingAdresse] = useState(false)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef(null)
  const nominatimRef = useRef(null)

  // Validation des champs requis (basée sur les seuils du brief)
  const valide =
    form.nom.trim().length >= 2 &&
    form.type.trim().length > 0 &&
    form.adresse.trim().length > 0 &&
    form.telephone.trim().length >= 8 &&
    form.description.trim().length >= 20 &&
    form.latitude && form.longitude

  // Sauvegarde auto (debounced)
  function updateField(k, v) {
    setForm(p => ({ ...p, [k]: v }))
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => sauvegarder({ ...form, [k]: v }), 600)
  }

  async function sauvegarder(values) {
    setSaving(true); onSaving?.('saving')
    const payload = {
      nom: values.nom.trim() || 'Mon commerce',
      type: values.type.trim() || 'À définir',
      adresse: values.adresse.trim() || null,
      telephone: values.telephone.trim() || null,
      description: values.description.trim() || null,
      latitude: values.latitude || null,
      longitude: values.longitude || null,
    }
    const { data } = await supabase.from('commercants').update(payload).eq('id', commercant.id).select().single()
    if (data) onUpdate(data)
    setSaving(false); onSaving?.('saved')
  }

  // Autocomplete Nominatim (Belgique en priorité)
  async function chercherAdresse(query) {
    if (!query || query.length < 3) { setSuggestions([]); return }
    setSearchingAdresse(true)
    clearTimeout(nominatimRef.current)
    nominatimRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=fr&countrycodes=be&addressdetails=1`, {
          headers: { Accept: 'application/json' },
        })
        const data = await res.json()
        setSuggestions(data || [])
      } catch { setSuggestions([]) }
      setSearchingAdresse(false)
    }, 400)
  }

  function choisirSuggestion(s) {
    // Compose une adresse propre « Rue X 12, 5640 Localité » depuis les champs
    // structurés Nominatim. Le display_name brut intercale les hameaux/lieux-dits
    // (ex. « La Marchauderie ») et la troncature perdait la localité et le CP.
    const a = s.address || {}
    const rue = a.road || a.pedestrian || a.square || ''
    const num = a.house_number || ''
    const localite = a.village || a.town || a.city || a.municipality || a.hamlet || ''
    const cp = a.postcode || ''
    const adresse = rue
      ? `${rue}${num ? ` ${num}` : ''}${(cp || localite) ? `, ${[cp, localite].filter(Boolean).join(' ')}` : ''}`
      : s.display_name.split(',').slice(0, 3).join(', ')
    setForm(p => ({
      ...p,
      adresse,
      latitude: parseFloat(s.lat),
      longitude: parseFloat(s.lon),
    }))
    setSuggestions([])
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => sauvegarder({
      ...form, adresse, latitude: parseFloat(s.lat), longitude: parseFloat(s.lon),
    }), 100)
  }

  async function continuer() {
    if (!valide) return
    // Sync immédiate avant d'avancer
    clearTimeout(debounceRef.current)
    await sauvegarder(form)
    if (onboarding) {
      const { data } = await supabase.from('onboarding_commercants')
        .update({ infos_ok: true }).eq('id', onboarding.id).select().single()
      if (data) onUpdateOb(data)
    }
    avancer()
  }

  // Save on back : on flush le debounce pour ne pas perdre les saisies en cours
  // si le user clique Retour avant le delai de sauvegarde auto.
  async function retourAvecSauvegarde() {
    clearTimeout(debounceRef.current)
    if (saving) return retour()
    await sauvegarder(form)
    retour()
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
        Présente ton commerce
      </h1>
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 24px' }}>
        Ces infos apparaîtront sur ta page Yoppaa. Tu peux les modifier à tout moment.
      </p>

      <Card titre="Identité">
        <Field label="Nom du commerce *">
          <input type="text" value={form.nom} onChange={e => updateField('nom', e.target.value)} placeholder="Ex: Au Pain Doré" style={inputStyle()}/>
        </Field>
        <Field label="Type *">
          <SelecteurTypes categorie={commercant.categorie} value={form.type} onChange={v => updateField('type', v)}/>
        </Field>
      </Card>

      <Card titre="Localisation" sous="L'adresse permet aux clients de te trouver sur la carte.">
        <Field label="Adresse complète *">
          <div style={{ position: 'relative' }}>
            <input type="text" value={form.adresse}
              onChange={e => { updateField('adresse', e.target.value); chercherAdresse(e.target.value) }}
              placeholder="Ex: Place Meunier 1, 5640 Mettet"
              style={inputStyle()}/>
            {searchingAdresse && (
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: T.muted }}>…</span>
            )}
            {suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 12, marginTop: 4, boxShadow: '0 8px 24px rgba(22,6,54,0.12)', zIndex: 10, maxHeight: 240, overflowY: 'auto' }}>
                {suggestions.map(s => (
                  <button key={s.place_id} type="button" onClick={() => choisirSuggestion(s)}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${T.hairline}`, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: T.deep }}>
                    {s.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {form.latitude && form.longitude && (
            <p style={{ fontSize: 11, color: '#10B981', fontWeight: 700, margin: '6px 0 0' }}>
              ✓ Position GPS confirmée ({form.latitude.toFixed(4)}, {form.longitude.toFixed(4)})
            </p>
          )}
          {/* Food truck : l'adresse d'onboarding = ancre (commune, zone GMY, KYB),
              les emplacements de vente arriveront avec le module M5 */}
          {(form.type || '').includes('Food truck') && (
            <p style={{ fontSize: 11, color: T.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
              Truck mobile ? Indique l&rsquo;adresse de ton dépôt ou de ton siège : elle définit ta commune sur Yoppaa. Tu annonceras ensuite tes emplacements de vente depuis ton tableau de bord.
            </p>
          )}
        </Field>
        <Field label="Téléphone *">
          <input type="tel" value={form.telephone} onChange={e => updateField('telephone', e.target.value)} placeholder="+32 71 00 00 00" style={inputStyle()}/>
        </Field>
      </Card>

      <Card titre="Description" sous={`Minimum 20 caractères. ${form.description.length} / 20.`}>
        <textarea value={form.description} onChange={e => updateField('description', e.target.value)}
          placeholder="Quelques mots qui décrivent ton commerce, ce qui te rend unique…"
          rows={4}
          style={{ ...inputStyle(), minHeight: 90, resize: 'vertical' }}/>
      </Card>

      <NavEtape retour={retourAvecSauvegarde} continuer={continuer} valide={valide} saving={saving}
        hint={valide ? null
          : (form.adresse.trim().length > 0 && (!form.latitude || !form.longitude))
            ? 'Sélectionne ton adresse dans la liste de suggestions pour la localiser sur la carte.'
            : 'Complète tous les champs pour continuer.'}/>
    </div>
  )
}

// ─── ÉTAPE 3 : VISUELS ────────────────────────────────────────────────────────
// - Upload photo de couverture (16:9 conseillé) + logo (carré conseillé)
// - Validation : JPG / PNG / WEBP, 800px min, 8MB max
// - Stockage Supabase Storage bucket 'logos' (existant) avec préfixes différents
// - URL couverture insérée dans commercant_photos (type='couverture')
function Etape3Visuels({ commercant, onboarding, onUpdate, onUpdateOb, onSaving, avancer, retour }) {
  const [logoUrl, setLogoUrl] = useState(commercant.logo_url || null)
  const [couvertureUrl, setCouvertureUrl] = useState(null)
  // S4 : galerie = jusqu'a 4 photos supplementaires affichees en carrousel
  // sur la fiche client. Stockees en commercant_photos type='galerie'.
  const [galerie, setGalerie] = useState([])
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingGalerie, setUploadingGalerie] = useState(false)
  const [warningCover, setWarningCover] = useState(null) // avertissement non bloquant (orientation, qualité…)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const MAX_GALERIE = 4

  // Charge couverture + galerie au mount
  useEffect(() => {
    let annule = false
    supabase.from('commercant_photos')
      .select('id, url, type, ordre')
      .eq('commercant_id', commercant.id)
      .order('ordre')
      .then(({ data }) => {
        if (annule) return
        const couv = (data || []).find(p => p.type === 'couverture')
        if (couv?.url) setCouvertureUrl(couv.url)
        setGalerie((data || []).filter(p => p.type === 'galerie' && p.url))
      })
    return () => { annule = true }
  }, [commercant.id])

  // Retourne { error, dims }. Erreur bloque l'upload. Dims permet de générer un warning a posteriori.
  // minPx : 800 par défaut (photos de couverture/galerie), abaissé pour le logo
  // qui est recompressé en 400x400 de toute façon (beaucoup de vrais logos font < 800 px).
  async function validerFichier(file, { minPx = 800 } = {}) {
    if (!file) return { error: 'Aucun fichier', dims: null }
    const okType = /image\/(jpeg|jpg|png|webp)/.test(file.type)
    if (!okType) return { error: 'Format invalide. Utilise JPG, PNG ou WEBP.', dims: null }
    if (file.size > 8 * 1024 * 1024) return { error: 'Fichier trop lourd. Max 8 Mo.', dims: null }
    const dims = await new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve({ w: img.width, h: img.height })
      img.onerror = () => resolve(null)
      img.src = URL.createObjectURL(file)
    })
    if (!dims) return { error: 'Fichier corrompu ou illisible.', dims: null }
    if (Math.max(dims.w, dims.h) < minPx) return { error: `Image trop petite. Min ${minPx} px sur le plus grand côté.`, dims }
    return { error: null, dims }
  }

  async function uploadLogo(file) {
    setError('')
    const { error: err } = await validerFichier(file, { minPx: 256 })
    if (err) { setError(err); return }
    setUploadingLogo(true)
    // Compression client automatique (feedback_zero_friction)
    const compressed = await compresserImage(file, { maxWidth: 400, maxHeight: 400, quality: 0.85 })
    const fileName = `logo-${commercant.id}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { setError(`Upload échoué : ${upErr.message}`); setUploadingLogo(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    const url = urlData.publicUrl
    const { data: c } = await supabase.from('commercants').update({ logo_url: url }).eq('id', commercant.id).select().single()
    if (c) onUpdate(c)
    setLogoUrl(url)
    setUploadingLogo(false)
  }

  // Fallback "Genere-moi" : produit un cercle violet avec initiale du nom
  // dans la charte Yoppaa. Pas de friction, propre, identitaire.
  async function genererLogoAuto() {
    setError('')
    setUploadingLogo(true)
    onSaving?.('saving')
    try {
      const nom = commercant.nom && commercant.nom !== 'Mon commerce' ? commercant.nom : 'Y'
      const canvas = genererLogoCanvas(nom)
      const blob = await canvasVersBlob(canvas)
      if (!blob) { setError('Génération du logo impossible.'); return }
      const fileName = `logo-${commercant.id}-${Date.now()}.png`
      const { error: upErr } = await supabase.storage.from('logos').upload(fileName, blob, { upsert: true, contentType: 'image/png' })
      if (upErr) { setError(`Upload échoué : ${upErr.message}`); return }
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
      const url = urlData.publicUrl
      const { data: c } = await supabase.from('commercants').update({ logo_url: url }).eq('id', commercant.id).select().single()
      if (c) onUpdate(c)
      setLogoUrl(url)
      onSaving?.('saved')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function genererCoverAuto() {
    setError(''); setWarningCover(null)
    setUploadingCover(true)
    onSaving?.('saving')
    try {
      const nom = commercant.nom && commercant.nom !== 'Mon commerce' ? commercant.nom : 'Mon commerce'
      const canvas = genererCoverCanvas(nom)
      const blob = await canvasVersBlob(canvas)
      if (!blob) { setError('Génération de la couverture impossible.'); return }
      const fileName = `cover-${commercant.id}-${Date.now()}.png`
      const { error: upErr } = await supabase.storage.from('logos').upload(fileName, blob, { upsert: true, contentType: 'image/png' })
      if (upErr) { setError(`Upload échoué : ${upErr.message}`); return }
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
      const url = urlData.publicUrl
      await supabase.from('commercant_photos')
        .delete()
        .eq('commercant_id', commercant.id)
        .eq('type', 'couverture')
      await supabase.from('commercant_photos').insert({
        commercant_id: commercant.id,
        type: 'couverture',
        url,
        ordre: 0,
      })
      setCouvertureUrl(url)
      onSaving?.('saved')
    } finally {
      setUploadingCover(false)
    }
  }

  async function uploadCouverture(file) {
    setError('')
    setWarningCover(null)
    const { error: err, dims } = await validerFichier(file)
    if (err) { setError(err); return }
    // Warning non bloquant : orientation portrait sur la couverture = mauvais rendu
    // sur la fiche client. On accepte mais on prévient.
    if (dims && dims.h > dims.w * 1.1) {
      setWarningCover('Cette photo est en mode portrait : elle s\'affichera mal sur la couverture (paysage). On la garde quand même, mais on conseille de la remplacer par une photo prise à l\'horizontale.')
    } else if (dims && Math.min(dims.w, dims.h) < 500) {
      setWarningCover('La photo est un peu petite pour la couverture. Une image plus large (≥ 1200 px) rendra mieux sur grand écran.')
    }
    setUploadingCover(true)
    // Compression client automatique (feedback_zero_friction) — cover paysage
    const compressed = await compresserImage(file, { maxWidth: 1600, maxHeight: 1200, quality: 0.85 })
    const fileName = `cover-${commercant.id}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { setError(`Upload échoué : ${upErr.message}`); setUploadingCover(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    const url = urlData.publicUrl
    // Une seule photo de couverture : on supprime l'ancienne entrée si elle existe
    await supabase.from('commercant_photos')
      .delete()
      .eq('commercant_id', commercant.id)
      .eq('type', 'couverture')
    await supabase.from('commercant_photos').insert({
      commercant_id: commercant.id,
      type: 'couverture',
      url,
      ordre: 0,
    })
    setCouvertureUrl(url)
    setUploadingCover(false)
  }

  // S4 : ajout d'une photo a la galerie (max 4). Ordre = max courant + 1
  // pour preserver l'ordre d'affichage du carousel cote fiche client.
  async function uploadPhotoGalerie(file) {
    if (galerie.length >= MAX_GALERIE) {
      setError(`Maximum ${MAX_GALERIE} photos supplémentaires.`)
      return
    }
    setError('')
    const { error: err } = await validerFichier(file)
    if (err) { setError(err); return }
    setUploadingGalerie(true)
    onSaving?.('saving')
    // Compression client automatique (feedback_zero_friction) — galerie carousel
    const compressed = await compresserImage(file, { maxWidth: 1600, maxHeight: 1200, quality: 0.85 })
    const fileName = `gal-${commercant.id}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { setError(`Upload échoué : ${upErr.message}`); setUploadingGalerie(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    const url = urlData.publicUrl
    const ordreSuivant = galerie.length > 0 ? Math.max(...galerie.map(p => p.ordre || 0)) + 1 : 1
    const { data: row, error: insErr } = await supabase.from('commercant_photos').insert({
      commercant_id: commercant.id,
      type: 'galerie',
      url,
      ordre: ordreSuivant,
    }).select().single()
    if (insErr) { setError(`Enregistrement échoué : ${insErr.message}`); setUploadingGalerie(false); return }
    setGalerie(prev => [...prev, row])
    setUploadingGalerie(false)
    onSaving?.('saved')
  }

  async function supprimerPhotoGalerie(photo) {
    onSaving?.('saving')
    await supabase.from('commercant_photos').delete().eq('id', photo.id)
    // Supprime aussi le fichier dans storage (nom = derniere segment de l'url)
    try {
      const segments = (photo.url || '').split('/')
      const objectName = segments[segments.length - 1]
      if (objectName) await supabase.storage.from('logos').remove([objectName])
    } catch { /* nettoyage best-effort, l'image orpheline ne casse rien */ }
    setGalerie(prev => prev.filter(p => p.id !== photo.id))
    onSaving?.('saved')
  }

  async function continuer() {
    setSaving(true)
    if (onboarding) {
      const { data } = await supabase.from('onboarding_commercants')
        .update({ photo_ok: !!couvertureUrl }).eq('id', onboarding.id).select().single()
      if (data) onUpdateOb(data)
    }
    setSaving(false)
    avancer()
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
        Tes visuels
      </h1>
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 12px' }}>
        Une belle photo, c&rsquo;est <strong style={{ color: T.bgPanel }}>+40 % de clics</strong> sur ta page. Tu pourras en ajouter d&rsquo;autres plus tard.
      </p>

      {/* Bloc d'aide : ce qui fonctionne, ce qui ne fonctionne pas */}
      <div style={{ background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, padding: '14px 16px 12px', marginBottom: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: T.bgPanel, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
          Pour des photos qui convertissent
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '10px 12px', border: '1px solid #BBF7D0' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#15803D', margin: '0 0 6px' }}>✓ Bon</p>
            <ul style={{ fontSize: 11.5, color: '#166534', margin: 0, paddingLeft: 14, lineHeight: 1.55 }}>
              <li>Façade reconnaissable (premier repère client)</li>
              <li>Format paysage 16:9 (1200×675 px ou +)</li>
              <li>Lumière naturelle de jour, image nette</li>
              <li>Enseigne lisible et bien cadrée</li>
              <li>Qualité maximale (pas de compression douteuse)</li>
            </ul>
          </div>
          <div style={{ background: '#FEF2F2', borderRadius: 10, padding: '10px 12px', border: '1px solid #FECACA' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#B91C1C', margin: '0 0 6px' }}>✗ Pas bon</p>
            <ul style={{ fontSize: 11.5, color: '#991B1B', margin: 0, paddingLeft: 14, lineHeight: 1.55 }}>
              <li>Photo verticale (portrait) sur la couverture</li>
              <li>Floue, sombre ou contre-jour</li>
              <li>Filtres lourds, cadres déco, watermark</li>
              <li>Photo de logo en couverture (utilise le champ Logo dédié)</li>
              <li>Capture d&apos;écran d&apos;un autre site</li>
              <li>Image basse qualité ou recadrée à l&apos;arrache</li>
            </ul>
          </div>
        </div>
        <p style={{ fontSize: 10.5, color: T.muted, margin: '10px 0 0', fontWeight: 600, lineHeight: 1.4 }}>
          Format accepté : JPG, PNG, WEBP · 800 px minimum sur le grand côté · 8 Mo max
        </p>
      </div>

      <Card titre="Photo de couverture" sous="C'est ta vignette sur Yoppaa : la première chose qu'un client voit en parcourant les commerces. Doit être ultra reconnaissable et qualitative.">
        <UploadZone
          url={couvertureUrl}
          uploading={uploadingCover}
          aspect="16/9"
          minHeight={180}
          label="Ajouter la photo de couverture"
          onFile={f => uploadCouverture(f)}
        />
        {warningCover && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: '#FFF7ED', borderLeft: '3px solid #EA580C', borderRadius: 6, fontSize: 12, color: '#7C2D12', fontWeight: 600, lineHeight: 1.45, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={14} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }}/>
            <span>{warningCover}</span>
          </div>
        )}
        <BoutonGenererVisuel onClick={genererCoverAuto} disabled={uploadingCover} libelle="Je n'ai pas de photo, génère une couverture aux couleurs de Yoppaa"/>
        <div style={{ marginTop: 10, fontSize: 11, color: T.muted, fontWeight: 600, lineHeight: 1.5 }}>
          <strong style={{ color: T.bgPanel }}>Idéal :</strong> ta façade telle qu&apos;on la voit depuis la rue, c&apos;est le <strong style={{ color: T.bgPanel }}>premier repère</strong> pour le client qui arrive à pied. Enseigne nette et lisible, couleurs vives, lumière du jour. Format paysage 16:9, qualité maximale. Si pas de façade exploitable (boutique en galerie, food truck mobile), prends un produit phare très photogénique.
        </div>
      </Card>

      <Card titre={`Photos supplémentaires (${galerie.length}/${MAX_GALERIE})`} sous="Affichées en carrousel sous la couverture sur ta page client. Optionnel mais conseillé : intérieur, produits, équipe…">
        <GalerieMini
          photos={galerie}
          max={MAX_GALERIE}
          uploading={uploadingGalerie}
          onFile={uploadPhotoGalerie}
          onSupprimer={supprimerPhotoGalerie}
        />
        <div style={{ marginTop: 10, fontSize: 11, color: T.muted, fontWeight: 600, lineHeight: 1.5 }}>
          <strong style={{ color: T.bgPanel }}>Conseil :</strong> varie les angles (intérieur ambiance + produit signature + équipe en action). Format paysage 16:9 idéal, mais on accepte tous les ratios.
        </div>
      </Card>

      <Card titre="Logo" sous="Affiché dans la card flottante de ta page client. Format carré conseillé.">
        <UploadZone
          url={logoUrl}
          uploading={uploadingLogo}
          aspect="1/1"
          minHeight={120}
          label="Ajouter le logo"
          onFile={uploadLogo}
          maxWidth={140}
        />
        <BoutonGenererVisuel onClick={genererLogoAuto} disabled={uploadingLogo} libelle="Je n'ai pas de logo, génère un cercle violet avec mon initiale"/>
        <div style={{ marginTop: 10, fontSize: 11, color: T.muted, fontWeight: 600, lineHeight: 1.5 }}>
          <strong style={{ color: T.bgPanel }}>Idéal :</strong> ton logo seul sur fond uni (blanc ou couleur). Si tu n&apos;en as pas, une photo carrée recadrée sur ton enseigne fait l&apos;affaire.
        </div>
      </Card>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#7F1D1D', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <NavEtape
        retour={retour}
        continuer={continuer}
        valide={true}
        saving={saving}
        hint={couvertureUrl || logoUrl ? null : (peutSkipperVisuels(getPlanActif(commercant, onboarding)) ? 'Tu peux passer et ajouter tes visuels plus tard depuis ton tableau de bord.' : 'Recommandé pour ta visibilité.')}
      />
    </div>
  )
}

// Grille de thumbs galerie + bouton "+" pour ajouter une photo (max atteint).
// Affiche une croix sur chaque thumb pour supprimer.
function GalerieMini({ photos, max, uploading, onFile, onSupprimer }) {
  const inputRef = useRef(null)
  const peutAjouter = photos.length < max
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
        {photos.map(p => (
          <div key={p.id} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.hairline}` }}>
            <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            <button type="button" onClick={() => onSupprimer(p)} aria-label="Supprimer"
              style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(22,6,54,0.85)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, lineHeight: 1, padding: 0 }}>
              <span style={{ marginTop: -1 }}>×</span>
            </button>
          </div>
        ))}
        {peutAjouter && (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
            style={{ aspectRatio: '4/3', borderRadius: 12, border: `2px dashed ${T.hairline}`, background: '#FAFAFA', cursor: uploading ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: '"DM Sans", sans-serif' }}>
            {uploading ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.bgPanel }}>Upload…</span>
            ) : (
              <>
                <Camera size={20} strokeWidth={1.8} color={T.main}/>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>Ajouter</span>
              </>
            )}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        style={{ display: 'none' }}/>
    </div>
  )
}

function UploadZone({ url, uploading, aspect, minHeight, label, onFile, maxWidth }) {
  const inputRef = useRef(null)
  return (
    <div style={{ maxWidth }}>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        style={{ width: '100%', minHeight, aspectRatio: aspect, borderRadius: 14, border: `2px dashed ${url ? T.bgPanel : T.hairline}`, background: url ? '#fff' : '#FAFAFA', cursor: uploading ? 'wait' : 'pointer', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', padding: 0 }}>
        {url ? (
          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        ) : (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Camera size={26} strokeWidth={1.8} color={T.main} style={{ marginBottom: 6 }}/>
            <p style={{ fontSize: 13, color: T.muted, fontWeight: 700 }}>{label}</p>
            <p style={{ fontSize: 11, color: T.muted, fontWeight: 500, marginTop: 4 }}>JPG, PNG ou WEBP · 8 Mo max</p>
          </div>
        )}
        {uploading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: T.bgPanel }}>
            Upload en cours…
          </div>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        style={{ display: 'none' }}/>
      {url && (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          style={{ marginTop: 8, padding: '6px 12px', background: 'none', border: `1px solid ${T.hairline}`, borderRadius: 100, color: T.muted, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          Remplacer
        </button>
      )}
    </div>
  )
}

// ─── HELPERS UI partagés ──────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  )
}

function inputStyle() {
  return { width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, color: T.ink, background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: '"DM Sans", sans-serif' }
}

// Lien discret affichee sous chaque UploadZone pour proposer la generation
// auto d'un visuel branded Yoppaa quand le commercant n'a pas de logo/photo.
function BoutonGenererVisuel({ onClick, disabled, libelle }) {
  return (
    <button onClick={onClick} disabled={disabled} type="button"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '8px 14px', background: T.pale, border: `1px dashed ${T.light}`, borderRadius: 100, color: T.deep, fontSize: 12, fontWeight: 700, cursor: disabled ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = T.light; e.currentTarget.style.color = '#fff' } }}
      onMouseLeave={e => { if (!disabled) { e.currentTarget.style.background = T.pale; e.currentTarget.style.color = T.deep } }}
    >
      <Sparkles size={13} strokeWidth={2.2}/>
      {libelle}
    </button>
  )
}

function NavEtape({ retour, continuer, valide, saving, hint, plusTard, plusTardLabel }) {
  return (
    <div style={{ marginTop: 8 }}>
      {hint && (
        <p style={{ fontSize: 12, color: T.muted, fontStyle: 'italic', textAlign: 'center', marginBottom: 12 }}>{hint}</p>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={retour}
          style={{ padding: '0.875rem 1.5rem', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          ← Retour
        </button>
        <button onClick={continuer} disabled={!valide || saving}
          style={{ flex: 1, padding: '0.875rem 1.5rem', borderRadius: 100, border: 'none', background: (!valide || saving) ? `${T.muted}66` : `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 15, cursor: (!valide || saving) ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: valide ? `0 6px 20px ${T.main}55` : 'none' }}>
          {saving ? 'Enregistrement…' : 'Continuer →'}
        </button>
      </div>
      {/* Lien discret "Configurer plus tard" : seulement si la skip-logic l'autorise. */}
      {plusTard && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button onClick={plusTard} disabled={saving}
            style={{ background: 'transparent', border: 'none', color: T.muted, fontWeight: 600, fontSize: 12.5, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {plusTardLabel || 'Je ferai ça plus tard depuis mon tableau de bord →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── ÉTAPE 4 : HORAIRES ───────────────────────────────────────────────────────
// Grille 7 jours avec heures début/fin + toggle ouvert/fermé.
// Bouton "Copier lundi → tous les jours" pour gagner du temps.
const JOURS = [
  { key: 'lundi',    label: 'Lundi' },
  { key: 'mardi',    label: 'Mardi' },
  { key: 'mercredi', label: 'Mercredi' },
  { key: 'jeudi',    label: 'Jeudi' },
  { key: 'vendredi', label: 'Vendredi' },
  { key: 'samedi',   label: 'Samedi' },
  { key: 'dimanche', label: 'Dimanche' },
]

function Etape4Horaires({ commercant, onboarding, onUpdate, onUpdateOb, onSaving, avancer, retour }) {
  const initial = commercant.horaires_detail || {}
  const [horaires, setHoraires] = useState(() => {
    const out = {}
    JOURS.forEach(j => {
      const h = initial[j.key]
      out[j.key] = h
        ? { ouvert: h.ouvert !== false, debut: h.debut || '09:00', fin: h.fin || '18:00', debut2: h.debut2 || null, fin2: h.fin2 || null }
        : { ouvert: true, debut: '09:00', fin: '18:00', debut2: null, fin2: null }
    })
    return out
  })
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef(null)

  function updateJour(jour, patch) {
    setHoraires(prev => {
      const next = { ...prev, [jour]: { ...prev[jour], ...patch } }
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => sauvegarder(next), 500)
      return next
    })
  }

  function copierLundi() {
    const lun = horaires.lundi
    const next = {}
    JOURS.forEach(j => { next[j.key] = { ...lun } })
    setHoraires(next)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => sauvegarder(next), 200)
  }

  async function sauvegarder(values) {
    setSaving(true); onSaving?.('saving')
    const { data } = await supabase.from('commercants')
      .update({ horaires_detail: values })
      .eq('id', commercant.id)
      .select()
      .single()
    if (data) onUpdate(data)
    setSaving(false); onSaving?.('saved')
  }

  // Valide si au moins 1 jour est ouvert
  const valide = Object.values(horaires).some(h => h.ouvert)

  // Skip-logic : un service vitrine en plan Exister peut ne pas avoir d'horaires
  // (coiffeur 100% RDV, garagiste sur appel...). Master section 4.
  const plan = getPlanActif(commercant, onboarding)
  const skipAutorise = peutSkipperHoraires(plan, commercant.categorie)

  async function continuer() {
    if (!valide) return
    clearTimeout(debounceRef.current)
    await sauvegarder(horaires)
    if (onboarding) {
      const { data } = await supabase.from('onboarding_commercants')
        .update({ horaires_ok: true }).eq('id', onboarding.id).select().single()
      if (data) onUpdateOb(data)
    }
    avancer()
  }

  // Save on back : flush le debounce pour ne pas perdre les saisies horaires
  async function retourAvecSauvegarde() {
    clearTimeout(debounceRef.current)
    if (saving) return retour()
    await sauvegarder(horaires)
    retour()
  }

  async function configurerPlusTard() {
    clearTimeout(debounceRef.current)
    if (onboarding) {
      const { data } = await supabase.from('onboarding_commercants')
        .update({ horaires_ok: false }).eq('id', onboarding.id).select().single()
      if (data) onUpdateOb(data)
    }
    avancer()
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
        Tes horaires d&rsquo;ouverture
      </h1>
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 24px' }}>
        Configure ton planning hebdomadaire. Tu pourras gérer les fermetures exceptionnelles depuis ton tableau de bord.
      </p>

      <Card titre="Planning hebdomadaire" sous="Astuce : configure lundi puis copie sur tous les jours.">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button type="button" onClick={copierLundi}
            style={{ padding: '6px 12px', background: T.pale, color: T.bgPanel, border: `1px solid ${T.main}33`, borderRadius: 100, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            ⤵ Copier lundi sur tous les jours
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {JOURS.map(j => {
            const h = horaires[j.key]
            const aPause = !!(h.debut2 || h.fin2)
            return (
              <div key={j.key} style={{ padding: '8px 12px', borderRadius: 10, background: h.ouvert ? '#FAFAFA' : '#F3F4F6', border: `1px solid ${T.hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: '0 0 110px' }}>
                    <input type="checkbox" checked={h.ouvert} onChange={e => updateJour(j.key, { ouvert: e.target.checked })} style={{ width: 16, height: 16, cursor: 'pointer' }}/>
                    <span style={{ fontWeight: 700, fontSize: 13, color: h.ouvert ? T.ink : T.muted }}>{j.label}</span>
                  </label>
                  {h.ouvert ? (
                    <>
                      <input type="time" value={h.debut} onChange={e => updateJour(j.key, { debut: e.target.value })}
                        style={{ ...inputStyle(), width: 110, padding: '6px 10px', fontSize: 13 }}/>
                      <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>→</span>
                      <input type="time" value={h.fin} onChange={e => updateJour(j.key, { fin: e.target.value })}
                        style={{ ...inputStyle(), width: 110, padding: '6px 10px', fontSize: 13 }}/>
                      {!aPause && (
                        <button type="button" onClick={() => updateJour(j.key, { debut2: '18:00', fin2: '22:00' })}
                          title="Ajouter une 2e plage (ex : service du soir)"
                          style={{ padding: '4px 9px', background: 'none', border: `1px dashed ${T.main}55`, borderRadius: 100, color: T.main, fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          + pause
                        </button>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: T.muted, fontStyle: 'italic' }}>Fermé</span>
                  )}
                </div>
                {/* 2e plage : horaires à pause (restauration 11:00-14:00 puis 18:00-22:00) */}
                {h.ouvert && aPause && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                    <span style={{ flex: '0 0 110px', fontSize: 11, fontWeight: 700, color: T.muted, textAlign: 'right' }}>puis</span>
                    <input type="time" value={h.debut2 || ''} onChange={e => updateJour(j.key, { debut2: e.target.value })}
                      style={{ ...inputStyle(), width: 110, padding: '6px 10px', fontSize: 13 }}/>
                    <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>→</span>
                    <input type="time" value={h.fin2 || ''} onChange={e => updateJour(j.key, { fin2: e.target.value })}
                      style={{ ...inputStyle(), width: 110, padding: '6px 10px', fontSize: 13 }}/>
                    <button type="button" onClick={() => updateJour(j.key, { debut2: null, fin2: null })} title="Retirer la 2e plage"
                      style={{ width: 22, height: 22, borderRadius: 100, border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontSize: 12, fontWeight: 800, flexShrink: 0, lineHeight: '22px', padding: 0 }}>
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <NavEtape
        retour={retourAvecSauvegarde}
        continuer={continuer}
        valide={valide}
        saving={saving}
        hint={valide ? null : (skipAutorise ? 'Tu peux passer cette étape si tu fonctionnes uniquement sur RDV.' : 'Coche au moins un jour d\'ouverture.')}
        plusTard={skipAutorise ? configurerPlusTard : null}
        plusTardLabel="Je fonctionne sur RDV uniquement, je configurerai plus tard →"
      />
    </div>
  )
}

// ─── ÉTAPE 5 : SUCCESS PACK + SOUMISSION ──────────────────────────────────────
// - Choix optionnel d'un Success Pack (STARTER 49€ ou PREMIUM 249€)
// - Calcul du score automatique 0-100 (visible en live)
// - Soumission (statut = en_attente_validation + email Yoppaa via Resend)
// - Bouton verrouille si score < 60
//
// Refactor 17/06 (S2a) : passage de 2 packs uniques (Starter 49 + Premium 249)
// à une vraie boutique Yoppaa avec 4 produits cumulables.
// 1 service humain : Success Pack on-site 199€
// 2 kits hardware optionnels (surtout utiles en alimentaire) : Pro 399 + Light 179
// 1 consommable : Rouleau d'étiquettes 44,90€
//
// CATEGORIES_RECOMMANDEES indique pour quelles catégories chaque produit est
// considéré comme principal (affiché en haut sans mention spéciale). Les
// autres catégories le voient en bas avec une mention "principalement utile
// en alimentaire" pour éviter qu'un opticien achète une imprimante par erreur.
const SHOP_PRODUCTS = [
  {
    type: 'success_pack',
    label: 'Success Pack on-site',
    prix: 199,
    desc: 'On vient chez toi : photos pro de ton commerce, setup complet de ton menu ou de tes prestations, formation rapide, suivi à J+30. Idéal pour démarrer sereinement.',
    badge: 'Service humain',
    badgeColor: '#10B981',
    categories: ['alimentaire', 'vitrine', 'detail'],
    mention: null,
  },
  {
    type: 'kit_pro',
    label: 'Kit Yoppaa Pro',
    prix: 399,
    desc: 'Tablette tactile + imprimante thermique. Tu gères tes commandes ou tes RDV au comptoir, sans téléphone à la main. Configuration plug-and-play livrée prête à l\'emploi.',
    badge: 'Hardware',
    badgeColor: '#6B35C4',
    categories: ['alimentaire'],
    mention: 'Surtout utile en alimentaire (gestion comptoir Click & Collect). Tu peux aussi gérer ton activité depuis n\'importe quel téléphone, tablette ou PC sans hardware.',
  },
  {
    type: 'kit_light',
    label: 'Kit Yoppaa Light',
    prix: 179,
    desc: 'Imprimante thermique seule. Idéale pour imprimer les tickets de commande, les bons de retrait ou les étiquettes produits. Connecte-la à ton téléphone ou ta tablette existante.',
    badge: 'Hardware',
    badgeColor: '#6B35C4',
    categories: ['alimentaire'],
    mention: 'Surtout utile en alimentaire. Pour service ou détail, ton smartphone ou ton PC suffisent largement.',
  },
  {
    type: 'rouleau_etiquettes',
    label: 'Rouleau d\'étiquettes',
    prix: 44.90,
    desc: 'Recharge papier thermique compatible Kit Pro et Kit Light. Tu peux en commander à tout moment quand tu seras à court, depuis ton tableau de bord.',
    badge: 'Consommable',
    badgeColor: '#F59E0B',
    categories: ['alimentaire'],
    mention: 'Nécessite un Kit Pro ou Kit Light.',
  },
]

// Helper : retourne les produits "recommandés" pour la catégorie + ceux affichés en "options secondaires"
function classerProduitsParCategorie(categorie) {
  const principaux = SHOP_PRODUCTS.filter(p => p.categories.includes(categorie))
  const secondaires = SHOP_PRODUCTS.filter(p => !p.categories.includes(categorie))
  return { principaux, secondaires }
}

// Bandeau recap adapte au plan choisi affiche en tete de l'etape 5.
// Resume ce qui se passe a la soumission : essai 30j si paye, gratuit si Exister.
function BandeauRecapPlan({ plan, commercant }) {
  const tarif = getPrixPlan(plan)
  if (plan === 'exister') {
    return (
      <div style={{ background: '#ECFDF5', border: '1px solid #10B98144', borderRadius: 14, padding: '14px 16px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <CheckCircle size={18} strokeWidth={2.2} color="#10B981"/>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#065F46', margin: 0 }}>
            Tu es prêt(e) à exister sur Yoppaa
          </p>
        </div>
        <p style={{ fontSize: 12.5, color: '#065F46', margin: 0, lineHeight: 1.5 }}>
          Plan <strong>Exister</strong> : <strong>gratuit à vie</strong>, sans informations de paiement.
          Ta fiche sera publiée après validation par l&rsquo;équipe Yoppaa, sous 24 h.
        </p>
      </div>
    )
  }
  if (plan === 'public') {
    return (
      <div style={{ background: '#EFF6FF', border: '1px solid #3B82F644', borderRadius: 14, padding: '14px 16px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Briefcase size={18} strokeWidth={2.2} color="#1D4ED8"/>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#1E3A8A', margin: 0 }}>
            Plan Public (commune, CPAS, service)
          </p>
        </div>
        <p style={{ fontSize: 12.5, color: '#1E3A8A', margin: 0, lineHeight: 1.5 }}>
          Accès sur invitation Yoppaa. Validation manuelle après réception de ta demande.
        </p>
      </div>
    )
  }
  const tarifFormate = tarif.mensuel.toFixed(2).replace('.', ',')
  return (
    <div style={{ background: `linear-gradient(135deg, ${T.pale} 0%, #fff 100%)`, border: `1px solid ${T.light}66`, borderRadius: 14, padding: '14px 16px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Sparkles size={18} strokeWidth={2.2} color={T.main}/>
        <p style={{ fontSize: 13, fontWeight: 800, color: T.deep, margin: 0 }}>
          Plan <span style={{ color: T.main }}>{PLAN_LABEL[plan]}</span> &middot; essai 30 jours gratuit
        </p>
      </div>
      <p style={{ fontSize: 12.5, color: T.deep, margin: 0, lineHeight: 1.5 }}>
        Aucun prélèvement pendant 30 jours. Après, <strong>{tarifFormate}&euro; HTVA / mois</strong>,
        sans engagement, résiliable à tout moment. Tu seras invité(e) à renseigner tes
        informations de paiement après validation de ta fiche par l&rsquo;équipe Yoppaa.
      </p>
    </div>
  )
}

// ─── CARD KYB (verification entreprise) ──────────────────────────────────────
// Plan = TOUS (Exister/Communiquer/Vendre/Public). Etape obligatoire avant
// soumission. Collecte BCE + nom prenom representant legal + carte ID recto/
// verso. Stockage dans bucket Supabase 'kyb_documents' (prive, RLS strict).
// La fiche du commercant ne sera PUBLIEE qu'apres validation manuelle par
// Yoppaa (kyb_statut='valide').
function CardKYB({ commercant, onUpdate, onSaving, onErreur }) {
  const [bce, setBce] = useState(commercant.bce ? formaterBCECompact(commercant.bce.replace(/\D/g, '')) : '')
  const [nomRep, setNomRep] = useState(commercant.representant_legal_nom || '')
  const [prenomRep, setPrenomRep] = useState(commercant.representant_legal_prenom || '')
  const [rectoUrl, setRectoUrl] = useState(commercant.kyb_id_recto_url || null)
  const [versoUrl, setVersoUrl] = useState(commercant.kyb_id_verso_url || null)
  const [uploadingRecto, setUploadingRecto] = useState(false)
  const [uploadingVerso, setUploadingVerso] = useState(false)
  const [erreurLocal, setErreurLocal] = useState('')
  const debounceRef = useRef(null)

  const verifBce = validerBCE(bce)
  const champsTextOk = verifBce.valide && nomRep.trim().length >= 2 && prenomRep.trim().length >= 2

  // Sauvegarde immediate des 3 champs texte (BCE + nom + prenom) en DB, sans
  // debounce. Utilisee par onBlur des inputs et par le cleanup useEffect au
  // demontage du composant (evite la perte de saisie si l'utilisateur clique
  // Suivant avant que le debounce ait fire).
  const saveTexteRef = useRef(null)
  saveTexteRef.current = async () => {
    if (!champsTextOk) return
    onSaving?.('saving')
    const { data, error } = await supabase.from('commercants')
      .update({
        bce: verifBce.raw,
        representant_legal_nom: nomRep.trim(),
        representant_legal_prenom: prenomRep.trim(),
      })
      .eq('id', commercant.id)
      .select()
      .single()
    if (error) {
      console.error('[S5 saveTexte] ERREUR Supabase', error)
      // Cas frequent : contrainte unique sur bce → deja utilise ailleurs
      const isDuplicateBce =
        error.code === '23505' &&
        (error.message?.includes('bce') || error.message?.includes('commercant_bce_unique'))
      if (isDuplicateBce) {
        setErreurLocal('Ce numéro BCE est déjà associé à un autre compte Yoppaa. Utilise le numéro exact de ton entreprise, ou contacte-nous si tu penses à une erreur.')
      } else {
        setErreurLocal(`Sauvegarde échouée : ${error.message}`)
      }
      onSaving?.('saved')
      return
    }
    if (!data) {
      console.error('[S5 saveTexte] Aucune ligne modifiée (RLS ?)', { commercantId: commercant.id })
      setErreurLocal('Sauvegarde refusée par les permissions Supabase (RLS). Ta session a peut-être expiré : reconnecte-toi.')
      onSaving?.('saved')
      return
    }
    onUpdate(data)
    onSaving?.('saved')
  }

  // Debounce 600ms pendant la frappe (feedback "saving..." puis "saved").
  // Le cleanup a chaque frappe ANNULE juste le timer (le prochain effect en
  // repose un) : ne surtout pas flusher ici, sinon un save part a chaque touche.
  useEffect(() => {
    if (!champsTextOk) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { debounceRef.current = null; saveTexteRef.current?.() }, 600)
    return () => clearTimeout(debounceRef.current)
  }, [bce, nomRep, prenomRep, champsTextOk])

  // Flush au DEMONTAGE uniquement : si un save est encore en attente quand
  // l'utilisateur quitte la carte (clic Retour/Envoyer rapide), on l'execute
  // immediatement pour ne rien perdre.
  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      saveTexteRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function uploaderIdentite(file, kind) {
    if (!file) return
    setErreurLocal('')
    // Validation cote client : type + taille
    const okType = /^(image\/(jpeg|jpg|png)|application\/pdf)$/.test(file.type)
    if (!okType) { setErreurLocal('Format invalide. JPG, PNG ou PDF uniquement.'); return }
    if (file.size > 5 * 1024 * 1024) { setErreurLocal('Fichier trop lourd. Maximum 5 Mo.'); return }
    const setUploading = kind === 'recto' ? setUploadingRecto : setUploadingVerso
    const setUrl = kind === 'recto' ? setRectoUrl : setVersoUrl
    const colonne = kind === 'recto' ? 'kyb_id_recto_url' : 'kyb_id_verso_url'
    setUploading(true)
    onSaving?.('saving')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setErreurLocal('Session expirée, reconnecte-toi.'); return }
      const ext = file.name.split('.').pop().toLowerCase()
      // Path = ${auth.uid}/${commercant_id}_${kind}.${ext} (matche policy RLS)
      const fileName = `${user.id}/${commercant.id}_${kind}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('kyb_documents').upload(fileName, file, { upsert: true, contentType: file.type })
      if (upErr) { setErreurLocal(`Upload échoué : ${upErr.message}`); return }
      // L'URL n'est PAS publique : on stocke juste le chemin storage pour signature ulterieure
      const cheminStockage = fileName
      const { data } = await supabase.from('commercants').update({ [colonne]: cheminStockage }).eq('id', commercant.id).select().single()
      if (data) onUpdate(data)
      setUrl(cheminStockage)
      onSaving?.('saved')
    } finally {
      setUploading(false)
    }
  }

  const statut = commercant.kyb_statut || 'non_demarre'
  const dejaSoumis = statut === 'en_attente' || statut === 'valide'
  const rejete = statut === 'rejete'

  return (
    <Card titre="Vérification de ton entreprise" sous="Conforme RGPD. Obligatoire avant publication de ta fiche. Ces infos restent privées.">
      {/* Badge statut KYB */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 100, marginBottom: 12,
        background: statut === 'valide' ? '#ECFDF5' : statut === 'en_attente' ? '#FEF3C7' : statut === 'rejete' ? '#FEE2E2' : T.bg,
        border: `1px solid ${statut === 'valide' ? '#10B98144' : statut === 'en_attente' ? '#F59E0B44' : statut === 'rejete' ? '#EF444466' : T.hairline}` }}>
        <Shield size={13} strokeWidth={2.2} color={statut === 'valide' ? '#10B981' : statut === 'en_attente' ? '#D97706' : statut === 'rejete' ? '#DC2626' : T.muted}/>
        <span style={{ fontSize: 11, fontWeight: 800, color: statut === 'valide' ? '#065F46' : statut === 'en_attente' ? '#92400E' : statut === 'rejete' ? '#991B1B' : T.muted, letterSpacing: '0.3px' }}>
          {statut === 'valide' ? 'KYB validé' : statut === 'en_attente' ? 'En attente de vérification Yoppaa' : statut === 'rejete' ? 'KYB rejeté à corriger' : 'À compléter'}
        </span>
      </div>

      {rejete && commercant.kyb_motif_rejet && (
        <div style={{ background: '#FEF2F2', borderLeft: '3px solid #DC2626', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12.5, color: '#7F1D1D', lineHeight: 1.5 }}>
          <strong>Motif :</strong> {commercant.kyb_motif_rejet}
        </div>
      )}

      {/* BCE */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: T.deep, marginBottom: 6, letterSpacing: '0.3px' }}>
          Numéro d&apos;entreprise (BCE) *
        </label>
        <input
          type="text"
          value={bce}
          onChange={e => setBce(e.target.value)}
          onBlur={() => saveTexteRef.current?.()}
          placeholder="0123.456.789"
          disabled={dejaSoumis}
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 10,
            border: `1.5px solid ${bce.length === 0 ? T.hairline : verifBce.valide ? '#10B981' : '#EF4444'}`,
            fontSize: 14, fontWeight: 600, color: T.ink, fontFamily: '"DM Sans", sans-serif',
            outline: 'none', background: dejaSoumis ? T.bg : '#fff',
          }}
        />
        {bce.length > 0 && !verifBce.valide && (
          <p style={{ fontSize: 11, color: '#DC2626', marginTop: 4, fontWeight: 600, lineHeight: 1.45 }}>
            {verifBce.raison === 'checksum' ? (
              <>
                Ce numéro n&rsquo;existe pas au registre BCE (contrôle mod 97 échoué).
                <br/>
                Vérifie le numéro exact sur{' '}
                <a href="https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html?lang=fr"
                   target="_blank" rel="noopener noreferrer"
                   style={{ color: '#DC2626', fontWeight: 800, textDecoration: 'underline' }}>
                  kbopub.economie.fgov.be
                </a>.
              </>
            ) : verifBce.raison === 'prefixe' ? (
              <>Format BE : 10 chiffres qui commencent par 0 ou 1.</>
            ) : (
              <>Format BE : 10 chiffres (ex. 0123.456.789).</>
            )}
          </p>
        )}
        {verifBce.valide && (
          <p style={{ fontSize: 11, color: '#10B981', marginTop: 4, fontWeight: 700 }}>
            Format valide ({verifBce.formate}).
          </p>
        )}
      </div>

      {/* Représentant légal */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: T.deep, marginBottom: 6, letterSpacing: '0.3px' }}>
            Prénom du représentant légal *
          </label>
          <input
            type="text"
            value={prenomRep}
            onChange={e => setPrenomRep(e.target.value)}
            onBlur={() => saveTexteRef.current?.()}
            placeholder="Prénom"
            disabled={dejaSoumis}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontWeight: 600, color: T.ink, fontFamily: '"DM Sans", sans-serif', outline: 'none', background: dejaSoumis ? T.bg : '#fff' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: T.deep, marginBottom: 6, letterSpacing: '0.3px' }}>
            Nom *
          </label>
          <input
            type="text"
            value={nomRep}
            onChange={e => setNomRep(e.target.value)}
            onBlur={() => saveTexteRef.current?.()}
            placeholder="Nom"
            disabled={dejaSoumis}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontWeight: 600, color: T.ink, fontFamily: '"DM Sans", sans-serif', outline: 'none', background: dejaSoumis ? T.bg : '#fff' }}
          />
        </div>
      </div>
      <p style={{ fontSize: 11, color: T.muted, marginTop: -8, marginBottom: 14, lineHeight: 1.5, fontStyle: 'italic' }}>
        Le prénom et le nom doivent figurer dans les statuts publiés au BCE.
      </p>

      {/* Upload carte ID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <UploadIdentite kind="recto" url={rectoUrl} uploading={uploadingRecto} onFile={f => uploaderIdentite(f, 'recto')} disabled={dejaSoumis}/>
        <UploadIdentite kind="verso" url={versoUrl} uploading={uploadingVerso} onFile={f => uploaderIdentite(f, 'verso')} disabled={dejaSoumis}/>
      </div>

      {erreurLocal && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEE2E2', borderLeft: '3px solid #DC2626', borderRadius: 6, fontSize: 12.5, color: '#7F1D1D', fontWeight: 600 }}>
          {erreurLocal}
        </div>
      )}
    </Card>
  )
}

function UploadIdentite({ kind, url, uploading, onFile, disabled }) {
  const inputRef = useRef(null)
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: T.deep, marginBottom: 6, letterSpacing: '0.3px' }}>
        Carte d&apos;identité {kind === 'recto' ? 'recto' : 'verso'} *
      </label>
      <button type="button" onClick={() => !disabled && inputRef.current?.click()} disabled={uploading || disabled}
        style={{
          width: '100%', minHeight: 100, aspectRatio: '16/10', borderRadius: 10,
          border: `1.5px dashed ${url ? '#10B981' : T.hairline}`,
          background: url ? '#ECFDF5' : disabled ? T.bg : '#FAFAFA',
          cursor: disabled ? 'not-allowed' : uploading ? 'wait' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
          fontFamily: '"DM Sans", sans-serif', padding: 12,
        }}>
        {uploading ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: T.bgPanel }}>Téléversement…</span>
        ) : url ? (
          <>
            <CheckCircle size={22} strokeWidth={2.2} color="#10B981"/>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#065F46' }}>Fichier ajouté</span>
            {!disabled && <span style={{ fontSize: 10, fontWeight: 600, color: '#065F46', textDecoration: 'underline' }}>Remplacer</span>}
          </>
        ) : (
          <>
            <IdCard size={22} strokeWidth={1.8} color={T.main}/>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, textAlign: 'center' }}>Ajouter le {kind}</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: T.muted }}>JPG, PNG, PDF · 5 Mo max</span>
          </>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,application/pdf"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        style={{ display: 'none' }}/>
    </div>
  )
}

function Etape5Validation({ commercant, onboarding, onUpdate, onUpdateOb, onSaving, retour, aller }) {
  // S2a (17/06) : shopChoices = Set des types de produits choisis.
  // Persistance locale pour l'instant ; migration DB + paiement Stripe en S2b.
  // Pour compat ascendante : si onboarding.success_pack_choisi existe (ancien
  // schéma à un seul item), on l'inclut dans le Set initial.
  const initialChoices = onboarding.success_pack_choisi
    ? new Set([onboarding.success_pack_choisi === 'starter' || onboarding.success_pack_choisi === 'premium'
        ? 'success_pack'  // mapping legacy → nouveau Success Pack
        : onboarding.success_pack_choisi])
    : new Set()
  const [shopChoices, setShopChoices] = useState(initialChoices)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(onboarding.statut === 'en_attente_validation' || onboarding.statut === 'valide')
  const [error, setError] = useState('')
  const [stockMenu, setStockMenu] = useState(0)

  // Classement des produits selon la catégorie du commerçant
  const { principaux, secondaires } = classerProduitsParCategorie(commercant.categorie)

  // Toggle d'un produit dans le panier
  const toggleProduit = (type) => {
    setShopChoices(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  // Total des produits choisis
  const totalChoisis = [...shopChoices]
    .map(type => SHOP_PRODUCTS.find(p => p.type === type))
    .filter(Boolean)
    .reduce((sum, p) => sum + p.prix, 0)

  // Compte les articles du commerçant (pour le score)
  useEffect(() => {
    let annule = false
    supabase.from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercant.id)
      .then(({ count }) => { if (!annule) setStockMenu(count || 0) })
    return () => { annule = true }
  }, [commercant.id])

  // Calcul du score 0-100 selon le brief
  const score = (() => {
    let s = 0
    if (commercant.latitude && commercant.longitude) s += 20      // adresse géocodable
    if (onboarding.photo_ok) s += 20                              // photo couverture uploadée
    if (commercant.horaires_detail && Object.values(commercant.horaires_detail).some(h => h?.ouvert)) s += 20  // horaires
    if (commercant.description && commercant.description.length >= 20) s += 10
    if (commercant.logo_url) s += 10
    if (commercant.telephone && /^\+?[\d\s.-]{8,}$/.test(commercant.telephone)) s += 10
    if (stockMenu >= 1) s += 10
    return s
  })()
  // S5 : KYB obligatoire avant soumission. Sans KYB rempli (BCE + nom prenom +
  // recto + verso), bouton "Envoyer" disabled. La validation FINALE (kyb_statut
  // = 'valide') est faite par Yoppaa cote admin avant publication de la fiche.
  const kybManques = []
  if (!commercant.bce || !validerBCE(commercant.bce).valide) kybManques.push('numéro BCE')
  if (!commercant.representant_legal_prenom) kybManques.push('prénom du représentant légal')
  if (!commercant.representant_legal_nom) kybManques.push('nom du représentant légal')
  if (!commercant.kyb_id_recto_url) kybManques.push('carte d\'identité recto')
  if (!commercant.kyb_id_verso_url) kybManques.push('carte d\'identité verso')
  const kybRempli = kybManques.length === 0
  const peutSoumettre = score >= 60 && kybRempli

  async function soumettre() {
    if (!peutSoumettre || submitting) return
    setSubmitting(true)
    setError('')

    // S2a : on persiste UNIQUEMENT le success_pack dans onboarding_commercants
    // (compat schéma existant). Les kits hardware + rouleau sont collectés en
    // local state pour l'instant et seront persistés en S2b après migration DB.
    const aSuccessPack = shopChoices.has('success_pack')

    // 1) Update onboarding : statut + score + success_pack_choisi (legacy)
    const { data: ob, error: obErr } = await supabase.from('onboarding_commercants')
      .update({
        statut: 'en_attente_validation',
        validation_auto_score: score,
        success_pack_choisi: aSuccessPack ? 'success_pack' : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', onboarding.id)
      .select()
      .single()
    if (obErr) { setError(`Erreur : ${obErr.message}`); setSubmitting(false); return }
    onUpdateOb(ob)

    // 2) Si Success Pack choisi : créer la ligne success_packs (statut en_attente)
    if (aSuccessPack) {
      await supabase.from('success_packs').insert({
        commercant_id: commercant.id,
        type: 'success_pack',
        statut: 'en_attente',
        montant_ht: 199,
      })
    }
    // TODO S2b : persister aussi kit_pro / kit_light / rouleau_etiquettes
    // dans une table commercant_shop_orders dédiée + déclencher checkout Stripe

    // 3) Update commerçant : statut publication = brouillon → en_attente
    //    + kyb_statut = en_attente (S5 : Yoppaa doit valider la conformite KYB
    //    avant publication de la fiche). La fiche ne sera publiee que quand
    //    statut_publication='valide' ET kyb_statut='valide' (croisement).
    //    Et on efface le motif_rejet précédent : la re-soumission corrige
    //    forcément le problème, plus de raison d'afficher l'ancien motif.
    const { data: c } = await supabase.from('commercants')
      .update({
        statut_publication: 'en_attente',
        motif_rejet: null,
        kyb_statut: commercant.kyb_statut === 'valide' ? 'valide' : 'en_attente',
        kyb_motif_rejet: null,
      })
      .eq('id', commercant.id)
      .select()
      .single()
    if (c) onUpdate(c)

    // 4) Email à Yoppaa via API route Resend (à implémenter — pour le MVP
    //    on log juste un avertissement console + on continue. Quand l'API
    //    /api/notify-yoppaa sera prête, on l'appelle ici.)
    try {
      await fetch('/api/notify-yoppaa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commercant_id: commercant.id,
          nom: commercant.nom,
          type: commercant.type,
          email: commercant.email,
          plan: commercant.plan,
          score,
          success_pack: shopChoices.has('success_pack') ? 'success_pack' : null,
          shop_choices: [...shopChoices],
          shop_total_ht: totalChoisis,
        }),
      })
    } catch { /* email non bloquant pour la soumission */ }

    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: '#ECFDF5', marginBottom: 16 }}>
          <CheckCircle size={36} strokeWidth={2} color="#10B981"/>
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 12px' }}>
          Demande envoyée&nbsp;!
        </h1>
        <p style={{ fontSize: '1rem', color: T.muted, margin: '0 0 24px', lineHeight: 1.6, maxWidth: 480, marginInline: 'auto' }}>
          On valide ton profil <strong style={{ color: T.bgPanel }}>sous 24 h ouvrées</strong>. Tu recevras un email dès que ta page sera en ligne.
        </p>
        <Card titre="Récapitulatif">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13, color: T.deep, lineHeight: 1.9 }}>
            <li><strong>Commerce :</strong> {commercant.nom}</li>
            <li><strong>Plan choisi :</strong> {PLAN_LABEL[commercant.plan]}</li>
            <li><strong>Score profil :</strong> {score} / 100</li>
            {[...shopChoices].map(type => {
              const p = SHOP_PRODUCTS.find(p => p.type === type)
              if (!p) return null
              return <li key={type}><strong>{p.label} :</strong> {p.prix.toFixed(2).replace('.', ',')}€ HTVA</li>
            })}
            {shopChoices.size > 0 && <li style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.hairline}` }}><strong>Total boutique :</strong> {totalChoisis.toFixed(2).replace('.', ',')}€ HTVA</li>}
          </ul>
        </Card>
        <p style={{ fontSize: 12, color: T.muted, marginTop: 16 }}>
          Tu peux fermer cette page. On te recontacte par email à <strong>{commercant.email}</strong>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
        Dernière étape&nbsp;: validation
      </h1>
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 18px' }}>
        Choisis si tu veux être accompagné, puis envoie ta demande d&rsquo;activation.
      </p>

      <BandeauRecapPlan plan={getPlanActif(commercant, onboarding)} commercant={commercant}/>

      {/* KYB obligatoire AVANT toute soumission. Pas de KYB = fiche jamais publiee. */}
      <CardKYB commercant={commercant} onUpdate={onUpdate} onSaving={onSaving} onErreur={setError}/>

      {/* Bandeau de rejet : motif de l'admin si la demande précédente a été refusée.
          Affiché tant que le commerçant n'a pas re-soumis (motif_rejet est mis à null
          à la re-soumission). Inclut 3 raccourcis vers les étapes modifiables : zéro
          friction pour corriger ce qui doit l'être. */}
      {commercant.motif_rejet && (
        <div style={{ background: '#FFF7ED', border: '1px solid #FB923C', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <FileText size={18} strokeWidth={1.8} color="#9A3412"/>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#9A3412', margin: 0, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
              Ta précédente demande a été refusée
            </p>
          </div>
          <p style={{ fontSize: 13, color: '#7C2D12', fontWeight: 600, lineHeight: 1.5, margin: '0 0 12px' }}>
            <strong>Motif de l&rsquo;équipe Yoppaa :</strong><br/>
            {commercant.motif_rejet}
          </p>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#9A3412', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
            Corrige directement →
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { n: 2, Icon: Pencil,  label: 'Infos commerce' },
              { n: 3, Icon: Camera,  label: 'Visuels' },
              { n: 4, Icon: Clock,   label: 'Horaires' },
            ].map(s => (
              <button key={s.n} type="button" onClick={() => aller && aller(s.n)}
                style={{ padding: '7px 12px', borderRadius: 100, border: '1.5px solid #FB923C', background: '#fff', color: '#9A3412', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <s.Icon size={13} strokeWidth={1.8}/> {s.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: '#9A3412', lineHeight: 1.5, margin: 0 }}>
            Une fois corrigé, re-soumets ci-dessous. On valide en moins de 24 h après ta correction.
          </p>
        </div>
      )}

      {/* Score */}
      <Card titre="Ton score de complétude" sous="Minimum 60 / 100 pour soumettre.">
        <ScoreBar score={score}/>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 14, fontSize: 12 }}>
          <ScoreItem label="Adresse géocodable" ok={commercant.latitude && commercant.longitude} pts={20}/>
          <ScoreItem label="Photo couverture" ok={onboarding.photo_ok} pts={20}/>
          <ScoreItem label="Horaires" ok={commercant.horaires_detail && Object.values(commercant.horaires_detail).some(h => h?.ouvert)} pts={20}/>
          <ScoreItem label="Description ≥ 20" ok={commercant.description?.length >= 20} pts={10}/>
          <ScoreItem label="Logo" ok={!!commercant.logo_url} pts={10}/>
          <ScoreItem label="Téléphone valide" ok={commercant.telephone && /^\+?[\d\s.-]{8,}$/.test(commercant.telephone)} pts={10}/>
          <ScoreItem label="Menu (≥ 1 article)" ok={stockMenu >= 1} pts={10}/>
        </div>
      </Card>

      {/* Boutique Yoppaa : Success Pack + Kits hardware + Consommables */}
      <Card titre="Boutique Yoppaa" sous="Service d'accompagnement et matériel optionnels. Tu pourras aussi commander à tout moment depuis ton tableau de bord.">

        {/* Produits principaux pour la catégorie */}
        <div style={{ display: 'grid', gap: 10 }}>
          {principaux.map(p => (
            <ProduitCard key={p.type} produit={p} actif={shopChoices.has(p.type)} onToggle={() => toggleProduit(p.type)}/>
          ))}
        </div>

        {/* Produits secondaires (hors catégorie principale) avec mention adaptative */}
        {secondaires.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${T.hairline}` }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: '0.7px', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Autres produits disponibles
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              {secondaires.map(p => (
                <ProduitCard key={p.type} produit={p} actif={shopChoices.has(p.type)} onToggle={() => toggleProduit(p.type)} secondaire/>
              ))}
            </div>
          </div>
        )}

        {/* Récap total */}
        {shopChoices.size > 0 ? (
          <div style={{ marginTop: 14, padding: '12px 14px', background: T.bgPanel, borderRadius: 12, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {shopChoices.size} produit{shopChoices.size > 1 ? 's' : ''} sélectionné{shopChoices.size > 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.3px' }}>
              Total : {totalChoisis.toFixed(2).replace('.', ',')}€ HTVA
            </span>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: T.muted, marginTop: 14, textAlign: 'center', fontStyle: 'italic' }}>
            Aucun produit sélectionné. Tu peux continuer sans rien ajouter, c&apos;est optionnel.
          </p>
        )}

        <p style={{ fontSize: 10.5, color: T.muted, marginTop: 14, lineHeight: 1.5, textAlign: 'center' }}>
          Paiement sécurisé Stripe. Tu peux ajouter ou commander d&apos;autres produits à tout moment depuis ton tableau de bord.
        </p>
      </Card>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#7F1D1D', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        {!peutSoumettre && (
          <p style={{ fontSize: 12, color: '#EA580C', fontWeight: 700, textAlign: 'center', marginBottom: 12, lineHeight: 1.5 }}>
            {!kybRempli ? (
              <>
                Vérification entreprise incomplète. Il manque : {kybManques.join(', ')}.
                <br/>
                <span style={{ fontWeight: 500, color: T.muted }}>
                  Complète la carte «&nbsp;Vérification de ton entreprise&nbsp;» ci-dessus, puis attends quelques secondes que la sauvegarde soit prise en compte.
                </span>
              </>
            ) : (
              `Score trop bas (${score}/100). Reviens sur les étapes précédentes pour compléter ton profil.`
            )}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={retour}
            style={{ padding: '0.875rem 1.5rem', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            ← Retour
          </button>
          <button onClick={soumettre} disabled={!peutSoumettre || submitting}
            style={{ flex: 1, padding: '0.875rem 1.5rem', borderRadius: 100, border: 'none', background: (!peutSoumettre || submitting) ? `${T.muted}66` : `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 15, cursor: (!peutSoumettre || submitting) ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: peutSoumettre ? `0 6px 20px ${T.main}55` : 'none' }}>
            {submitting ? 'Envoi…' : (
              getPlanActif(commercant, onboarding) === 'exister' || getPlanActif(commercant, onboarding) === 'public'
                ? 'Envoyer ma demande d’activation →'
                : 'Démarrer mon essai 30 jours gratuit →'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Carte d'un produit dans la boutique signup (Success Pack, Kit Pro/Light,
// Rouleau étiquettes). Checkbox visuelle, badge catégorie, mention adaptative
// pour les produits "secondaires" (hors catégorie principale du commerçant).
function ProduitCard({ produit, actif, onToggle, secondaire = false }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 14,
        border: `2px solid ${actif ? T.bgPanel : T.hairline}`,
        background: actif ? T.bgPanel : '#fff',
        color: actif ? '#fff' : T.ink,
        cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
        transition: 'all 0.15s',
        boxShadow: actif ? `0 8px 24px rgba(22,6,54,0.2)` : 'none',
        opacity: secondaire && !actif ? 0.85 : 1,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-block', fontSize: 9, fontWeight: 800,
              background: actif ? 'rgba(255,255,255,0.18)' : produit.badgeColor + '22',
              color: actif ? '#fff' : produit.badgeColor,
              padding: '2px 7px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>{produit.badge}</span>
            <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.3px' }}>{produit.label}</span>
          </div>
          <p style={{ fontSize: 12, color: actif ? 'rgba(255,255,255,0.85)' : T.deep, margin: 0, lineHeight: 1.45 }}>
            {produit.desc}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: actif ? T.light : T.main, whiteSpace: 'nowrap' }}>
            {produit.prix.toFixed(2).replace('.', ',')}€
          </span>
          <p style={{ fontSize: 10, color: actif ? 'rgba(255,255,255,0.55)' : T.muted, margin: '1px 0 0', fontWeight: 700 }}>HTVA</p>
        </div>
      </div>

      {/* Mention adaptative (visible uniquement pour produits "secondaires") */}
      {secondaire && produit.mention && (
        <p style={{
          fontSize: 10.5,
          color: actif ? 'rgba(255,255,255,0.6)' : T.muted,
          margin: '6px 0 0',
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}>
          {produit.mention}
        </p>
      )}

      {/* Indicateur checkbox visuel en bas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, fontWeight: 700, color: actif ? T.light : T.muted }}>
        <span style={{
          display: 'inline-block', width: 14, height: 14, borderRadius: 4,
          border: `1.5px solid ${actif ? T.light : T.hairline}`,
          background: actif ? T.main : '#fff',
          textAlign: 'center', lineHeight: '11px', fontSize: 10, color: '#fff', fontWeight: 900,
        }}>{actif ? '✓' : ''}</span>
        <span>{actif ? 'Ajouté à ta commande' : 'Cliquer pour ajouter'}</span>
      </div>
    </button>
  )
}

function ScoreBar({ score }) {
  const couleur = score >= 80 ? '#10B981' : score >= 60 ? '#EA580C' : '#DC2626'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Score actuel</span>
        <span style={{ fontWeight: 900, fontSize: 22, color: couleur, letterSpacing: '-0.5px' }}>{score} <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>/ 100</span></span>
      </div>
      <div style={{ width: '100%', height: 10, background: T.hairline, borderRadius: 100, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: `linear-gradient(90deg, ${couleur}, ${couleur}cc)`, transition: 'width 0.3s ease' }}/>
      </div>
    </div>
  )
}

function ScoreItem({ label, ok, pts }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: ok ? '#10B981' : '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, color: '#fff', fontWeight: 900 }}>{ok ? '✓' : '·'}</span>
      <span style={{ fontWeight: 600, color: ok ? T.ink : T.muted, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: ok ? '#10B981' : T.muted }}>+{pts}</span>
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

// Règles de force du mot de passe (durci 17/06 pour la prod).
// Min 8 chars + 1 minuscule + 1 majuscule + 1 chiffre + 1 caractère spécial.
// Exposé pour réutilisation dans la validation côté creerCompte().
export const PASSWORD_RULES = [
  { test: (s) => s.length >= 8,           label: '8 caractères minimum' },
  { test: (s) => /[a-z]/.test(s),         label: '1 minuscule' },
  { test: (s) => /[A-Z]/.test(s),         label: '1 majuscule' },
  { test: (s) => /\d/.test(s),            label: '1 chiffre' },
  { test: (s) => /[^A-Za-z0-9]/.test(s),  label: '1 caractère spécial (!@#$%...)' },
]

export function isPasswordStrong(pwd) {
  return PASSWORD_RULES.every(r => r.test(pwd))
}

function FieldPassword({ value, onChange }) {
  const [focused, setFocused] = useState(false)
  const showRules = focused || (value && !isPasswordStrong(value))

  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        Mot de passe
      </label>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="••••••••"
        autoComplete="new-password"
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 10,
          border: `1.5px solid ${value && !isPasswordStrong(value) ? '#DC2626' : value && isPasswordStrong(value) ? '#10B981' : T.hairline}`,
          fontSize: 14, color: T.ink, background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: '"DM Sans", sans-serif',
        }}
      />
      {showRules && (
        <ul style={{ listStyle: 'none', padding: '8px 0 0', margin: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {PASSWORD_RULES.map((r, i) => {
            const ok = r.test(value || '')
            return (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: ok ? '#10B981' : T.muted, fontWeight: 600 }}>
                {ok ? <Check size={13} strokeWidth={2.4}/> : <Circle size={13} strokeWidth={1.8}/>}
                <span>{r.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Card de catégorie. Icon est maintenant un composant React (Lucide), pas une string emoji.
function CategorieCard({ actif, onClick, titre, sous, exemples, Icon }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        textAlign: 'left', padding: '14px 14px 12px', borderRadius: 14,
        border: `2px solid ${actif ? T.bgPanel : T.hairline}`,
        background: actif ? T.bgPanel : '#fff',
        color: actif ? '#fff' : T.ink,
        cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
        transition: 'all 0.15s',
        boxShadow: actif ? `0 8px 24px rgba(22,6,54,0.2)` : 'none',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
      {Icon && <Icon size={28} strokeWidth={1.8} color={actif ? T.light : T.main} style={{ marginBottom: 4 }}/>}
      <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: '-0.3px' }}>{titre}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: actif ? T.light : T.main }}>{sous}</span>
      <span style={{ fontSize: 11, color: actif ? 'rgba(255,255,255,0.7)' : T.muted, lineHeight: 1.4, marginTop: 4 }}>{exemples}</span>
    </button>
  )
}

// Cards plan refondues 16/06 (S1) : 3 paliers Yoppaa avec features cohérentes
// avec lib/plans.js (source unique). Features varient légèrement selon la
// catégorie pour les plans "Vendre" (RDV vs Click&Collect).
function CardPlan({ plan, categorie, actif, onClick }) {
  const p = getPrixPlan(plan)
  const label = PLAN_LABEL[plan]
  if (!p) return null

  // Tagline + 4 features clés par plan. Pour Vendre, on adapte selon la
  // catégorie (alimentaire = Click & Collect, vitrine = RDV).
  const VENDRE_FEATURE_TRANSACTIONNEL = categorie === 'vitrine'
    ? 'Module RDV complet : prestations, créneaux, multi-praticiens'
    : categorie === 'detail'
      ? 'Réservation produit + retrait en magasin'
      : 'Click & Collect + livraison + réservation table'

  const PLAN_CONFIG = {
    exister: {
      tagline: 'Ton commerce visible sur Yoppaa, sans coût',
      essai: false,
      features: [
        'Fiche commerce, photos, horaires',
        'Tu apparais chaque jour dans Good Morning Yoppers',
        'Tes Yoppers peuvent te mettre en favori et t\'envoyer des signaux',
        'Statistiques de base sur ta fiche',
      ],
      note: 'Aucune information de paiement demandée',
    },
    communiquer: {
      tagline: 'Pour grandir ton audience',
      essai: true,
      features: [
        'Tout Exister, plus :',
        'Actus illimitées, deals, Bonnes affaires',
        'Push ciblés aux Yoppers favoris',
        'Newsletter, segmentation, IA assistant',
      ],
      note: 'Sans engagement, résiliable en 1 clic',
    },
    vendre: {
      tagline: 'Pour transactionner et fidéliser',
      essai: true,
      recommande: true,
      features: [
        'Tout Communiquer, plus :',
        VENDRE_FEATURE_TRANSACTIONNEL,
        'Paiement en ligne (0 % commission)',
        'Fidélité, IA avancée, export comptable',
      ],
      note: 'Sans engagement, résiliable en 1 clic',
    },
  }
  const cfg = PLAN_CONFIG[plan]
  if (!cfg) return null

  return (
    <button onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '16px 18px', borderRadius: 16,
        border: `2px solid ${actif ? T.bgPanel : T.hairline}`,
        background: actif ? T.bgPanel : '#fff',
        color: actif ? '#fff' : T.ink,
        cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
        transition: 'all 0.15s',
        boxShadow: actif ? `0 12px 28px rgba(22,6,54,0.25)` : 'none',
        position: 'relative',
      }}>
      {cfg.recommande && !actif && (
        <span style={{
          position: 'absolute', top: -10, right: 14,
          background: T.main, color: '#fff', fontSize: 10, fontWeight: 800,
          padding: '3px 10px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase',
        }}>Recommandé</span>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: '-0.4px' }}>{label}</span>
        {p.mensuel === 0 ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: actif ? T.light : T.main }}>Gratuit à vie</span>
        ) : (
          <span style={{ fontSize: 16, fontWeight: 900, color: actif ? '#fff' : T.ink }}>
            {p.mensuel.toFixed(2).replace('.', ',')}€<span style={{ fontSize: 11, fontWeight: 600, color: actif ? T.light : T.muted, marginLeft: 2 }}>HTVA/mois</span>
          </span>
        )}
      </div>

      <p style={{ fontSize: 12, color: actif ? T.light : T.main, fontWeight: 700, margin: '0 0 10px' }}>
        {cfg.tagline}
      </p>

      {cfg.essai && (
        <p style={{
          fontSize: 11, fontWeight: 800,
          color: actif ? '#fff' : '#065F46',
          background: actif ? 'rgba(255,255,255,0.12)' : '#ECFDF5',
          padding: '4px 9px', borderRadius: 100, display: 'inline-block',
          margin: '0 0 10px', letterSpacing: '0.3px',
        }}>30 jours d&apos;essai gratuit</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {cfg.features.map((f, i) => (
          <li key={i} style={{
            fontSize: 12, lineHeight: 1.45,
            color: actif ? 'rgba(255,255,255,0.92)' : T.deep,
            display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            <span style={{ color: actif ? T.light : T.main, flexShrink: 0, marginTop: 2 }}>
              {f.startsWith('Tout ') ? <Sparkles size={13} strokeWidth={2}/> : <Check size={13} strokeWidth={2.4}/>}
            </span>
            <span style={{ fontWeight: f.startsWith('Tout ') ? 800 : 500 }}>{f}</span>
          </li>
        ))}
      </ul>

      <p style={{ fontSize: 10.5, color: actif ? 'rgba(255,255,255,0.65)' : T.muted, margin: 0, fontStyle: 'italic' }}>
        {cfg.note}
      </p>
    </button>
  )
}
