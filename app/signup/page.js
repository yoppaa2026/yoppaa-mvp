'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { marquerDeconnexionVoulue } from '@/lib/session-permanente'
import ChampAdresse from '@/app/components/ChampAdresse'
import BanniereCommerce from '@/app/components/BanniereCommerce'
import { useRouter } from 'next/navigation'
import { PLAN_LABEL, plansDispoPourCategorie, getPrixPlan } from '@/lib/plans'
import { compresserImage } from '@/lib/compress-image'
import { TAILLE_CONSEILLEE, avertissementTaille, refusFichierImage, mesurerFichierImage } from '@/lib/image-qualite'
import { logoProvisoireSvg, propositionsLogo } from '@/lib/logo-provisoire'
import { scoreOnboarding, SEUIL_SOUMISSION } from '@/lib/score-onboarding'
import { conseilPhoto, MAX_PHOTOS } from '@/lib/guide-photos'
import { SHOP_PRODUCTS, classerProduitsParCategorie, prixProduitTexte } from '@/lib/produits-boutique'
import { FRAIS_STRIPE_TEXTE } from '@/lib/frais-paiement'
// Icônes Lucide React : SVG inline alignés sur la charte canonique Yoppaa.
// Convention : stroke-width 1.8, currentColor pour hériter de la palette parent.
// Aucun emoji dans l'UI (règle Master), sauf exceptions soleil GMY + 🟣 signature.
import {
  Croissant, Scissors, ShoppingBag,
  User, Heart, Radio, Sun, Megaphone, Flame, AlertTriangle, Bell, Mail, Sparkles, BarChart3,
  ShoppingCart, Bike, Utensils, Calendar, Briefcase, Clock, Users, Package, CreditCard, Star, Download,
  Smartphone, Printer, Camera, FileText, Pencil, CheckCircle, Check, Circle, Shield, IdCard,
  MapPin, Gift,
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
import { estFoodTruck } from '@/lib/types-commerce'
import {
  avantLancement, estRegimeLancement, joursOffertsAuLancement,
  libelleLancement, libelleFinEssaiLancement, libelleDernierJourGratuit, ESSAI_JOURS_MINIMUM,
} from '@/lib/lancement'

// ─── SKIP-LOGIC (esprit ODOO : adaptive selon plan + categorie) ────────────────
// La structure 5 etapes reste constante, mais le CONTENU et les contraintes
// s'adaptent au profil du commercant. Source : MASTER_FEATURES.md section 4.
function getPlanActif(commercant, onboarding) {
  return onboarding?.plan_choisi || commercant?.plan || 'exister'
}
// Horaires d'ouverture obligatoires SAUF pour services vitrine en plan Exister
// (un coiffeur peut etre purement sur RDV sans horaires fixes).
function peutSkipperHoraires(plan, categorie) {
  return plan === 'exister' && categorie === 'vitrine'
}

// ⚠️ UN COMMERÇANT QUI CHANGE D'ENDROIT N'A PAS D'HORAIRES FIXES, et lui en
// demander ici est une question qui n'a pas de réponse. Depuis le 13/08, ses
// horaires sont DÉDUITS de ses emplacements : ce qu'il saisirait à cette étape
// serait réécrit dès sa première tournée déclarée. Autant le lui dire et le
// laisser passer, plutôt que de lui faire remplir sept lignes pour rien.
function horairesViennentDesLieux(commercant) {
  return commercant?.siege_social_est_lieu_activite === false
}

// ─── GENERATEURS DE VISUELS AUTO (fallback branded Yoppaa) ────────────────────
// Quand le commercant n'a pas de logo/photo, on lui propose de generer un
// visuel propre dans la charte Yoppaa. Esprit Gmail/Notion : cercle initiale.
// Cover : gradient violet + nom + 3 dots tricolores (signature canonique).
async function canvasVersBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png', 0.95))
}

// ⚠️ L'INITIALE A ÉTÉ REMPLACÉE PAR LE SYMBOLE DU MÉTIER (Alex, 14/08). Sur
// l'accueil, la vignette d'un commerce fait 68 pixels de côté : un « C » blanc
// dans un cercle violet peut être Ciseaux, Carrefour ou Chez Momo. Ça
// ressemblait à un avatar par défaut, c'est-à-dire à l'absence de logo, et ça
// desservait exactement ce qu'un logo doit servir : reconnaître un commerce
// sans avoir à lire.
//
// Le tracé vit dans lib/logo-provisoire.js, qui n'a besoin ni du navigateur ni
// de React : il rend un SVG, donc il se teste au banc.
async function logoProvisoireCanvas(nom, type, choix = null) {
  const svg = logoProvisoireSvg({ nom, type, taille: 512, symbole: choix?.symbole, teinte: choix?.teinte })
  const image = new Image()
  // On passe par une data URI plutôt que par un blob object URL : pas d'URL à
  // révoquer, donc pas de fuite si la génération échoue en cours de route.
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error('SVG illisible'))
  })
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  canvas.getContext('2d').drawImage(image, 0, 0, 512, 512)
  return canvas
}

// Dots V2-B (5 dots maillon) — spec canonique 2026-06-12, fond fonce.
// Sequence : grand / mini / grand / mini / grand, decalage vertical 0.4*base
// sur les 4 dots du milieu pour former le sourire.


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
            <button onClick={async () => { marquerDeconnexionVoulue(); await supabase.auth.signOut(); window.location.href = '/login' }}
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
  // ⚠️ FOND OPAQUE, ET C'EST LA SEULE CONSÉQUENCE VISIBLE DU RETRAIT DES FLOUS.
  // Cet en-tête est COLLANT au-dessus d'un formulaire qui défile : c'était le
  // seul endroit de l'application où le flou servait à quelque chose, en
  // brouillant le texte qui passait dessous. Sans lui, les 8 % de transparence
  // laisseraient voir le contenu en fantôme. On rend donc le fond plein.
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#F8F6FF', borderBottom: `1px solid ${T.hairline}` }}>
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
  // ⚠️ UNE RÉUSSITE PASSAIT PAR LE CANAL DES ERREURS. « Compte créé ! » sortait
  // dans le bandeau ROUGE, celui des refus : le commerçant venait de franchir sa
  // première étape et l'écran lui répondait avec la couleur d'un échec.
  // Deux canaux, donc, et deux couleurs. Le côté Yopper le fait déjà
  // (`app/commander/auth/page.js` porte un `{ type: 'success' }`).
  const [compteCree, setCompteCree] = useState(false)
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
    setCompteCree(false)
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
      setCompteCree(true)
      setLoading(false)
      return
    }

    // Mémorise le choix plan/catégorie pour la reprise après confirmation d'email.
    try { localStorage.setItem('yoppaa_pending_commercant', JSON.stringify({ categorie, plan })) } catch (e) {}

    // Confirmation d'email ACTIVE : signUp ne renvoie pas de session tant que l'email
    // n'est pas confirmé. On ne peut pas créer le commerçant (RLS exige auth.uid). On
    // invite à confirmer ; le commerçant sera créé au retour (init détecte la session).
    if (!s) {
      setCompteCree(true)
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

  // ⚠️ LE BOUTON MENAIT À UN MUR. Le lien de confirmation s'ouvre depuis la boîte
  // mail, souvent sur un autre appareil : cet onglet-ci ne se remonte jamais, son
  // `init()` ne repasse pas, et « Créer mon compte » ne pouvait plus rendre qu'un
  // « User already registered ». Le bouton dit donc désormais le geste du moment,
  // et il relit la session au lieu d'en créer une seconde.
  async function reprendreApresConfirmation() {
    setError('')
    setLoading(true)
    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s?.user?.id) {
      setLoading(false)
      setError('Ton email n’est pas encore confirmé. Ouvre le lien qu’on vient de t’envoyer, puis reviens cliquer ici.')
      return
    }
    const res = await creerCommercantEtOnboarding(s.user.id, s.user.email, categorie, plan)
    setLoading(false)
    if (res.error) return setError(res.error)
    try { localStorage.removeItem('yoppaa_pending_commercant') } catch (e) {}
    setCompteCree(false)
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
        Crée ton compte et choisis ta formule. Le reste se remplit en quelques minutes, et tout se modifie ensuite depuis ton tableau de bord.
      </p>

      {/* Bandeau d'accroche : l'offre de lancement, en clair. On annonce la DATE
          de fin de gratuité plutôt qu'une durée, parce qu'elle se vérifie sur un
          calendrier et qu'elle ne vieillit pas. Le nombre de jours, lui, est
          calculé pour AUJOURD'HUI : plus on attend, plus il fond. */}
      <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, color: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>🟣</span>
        <div>
          <p style={{ fontWeight: 900, fontSize: 14, margin: 0, letterSpacing: '-0.3px' }}>
            {estRegimeLancement() ? (
              <>
                La formule <span style={{ color: T.light }}>Exister</span> est gratuite à vie.
                {' '}<span style={{ color: T.light }}>Communiquer</span> et <span style={{ color: T.light }}>Vendre</span> te sont
                offertes <span style={{ color: T.light }}>{joursOffertsAuLancement()} jours</span> à partir du {libelleLancement()}, et tout le temps d’ici là est en bonus.
              </>
            ) : (
              <>
                La formule <span style={{ color: T.light }}>Exister</span> est gratuite à vie.
                {' '}<span style={{ color: T.light }}>Communiquer</span> et <span style={{ color: T.light }}>Vendre</span> incluent
                {' '}{ESSAI_JOURS_MINIMUM} jours d&apos;essai gratuit.
              </>
            )}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: '3px 0 0', lineHeight: 1.4 }}>
            Sans carte de paiement, sans engagement, résiliable à tout moment.
            {avantLancement() && ` L'app s'ouvre officiellement au public le ${libelleLancement()} : ta page sera prête ce jour-là.`}
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
            sous="Commande à l’avance et livraison"
            exemples="Boulangerie, friterie, traiteur, food truck, épicerie…"
            Icon={Croissant}
          />
          <CategorieCard
            value="vitrine"
            actif={categorie === 'vitrine'}
            onClick={() => setCategorie('vitrine')}
            titre="Service"
            sous="Ta vitrine et tes rendez-vous"
            exemples="Coiffeur, esthéticienne, garagiste, yoga, coach, auto-école…"
            Icon={Scissors}
          />
          <CategorieCard
            value="detail"
            actif={categorie === 'detail'}
            onClick={() => setCategorie('detail')}
            titre="Détail"
            sous="Vente en ligne, retrait ou envoi"
            exemples="Vêtements, chaussures, fleuriste, librairie, déco…"
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

      {/* Compte créé : c'est une VICTOIRE, pas un incident. Vert, et le geste
          suivant nommé, parce qu'à cet instant la seule question est
          « et maintenant, je fais quoi ? ». */}
      {compteCree && (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '14px 16px', marginBottom: 14, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <CheckCircle size={19} strokeWidth={2.2} color="#059669" style={{ flexShrink: 0, marginTop: 1 }}/>
          <div>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#065F46', lineHeight: 1.45 }}>
              Première étape franchie, ton compte est créé.
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#047857', lineHeight: 1.55 }}>
              On vient de t’envoyer un email de confirmation. Ouvre-le, clique sur le lien, et reviens ici : la suite se remplit en quelques minutes.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#7F1D1D', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <button onClick={compteCree ? reprendreApresConfirmation : (dejaConnecte ? mettreAJourPlan : creerCompte)} disabled={loading}
        style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, background: loading ? `${T.main}88` : `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: loading ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 8px 24px ${T.main}55` }}>
        {loading ? 'En cours…' : (compteCree ? 'J’ai confirmé mon email →' : (dejaConnecte ? 'Continuer →' : 'Créer mon compte →'))}
      </button>

      {/* Anti-bot Cloudflare Turnstile (invisible) */}
      <TurnstileWidget ref={turnstileRef} />

      <p style={{ fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 12 }}>
        Déjà inscrit ? <a href="/login" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>Se connecter</a>
      </p>

      {/* ⚠️ LE BLOC « ADMINISTRATION COMMUNALE » A ÉTÉ RETIRÉ (demande d'Alex,
          21/08), et il pointait de toute façon vers `/administrations`, une page
          qui N'EXISTE PAS dans `app/` : le seul lien de tout le site menait donc
          à un 404, en production, sous le bouton principal de l'inscription.
          Le secteur public se contacte de la main à la main, pas par un
          formulaire greffé sur le tunnel des commerçants. */}
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
    // ⚠️ CE QUI EST DÉCRIT ICI DOIT EXISTER DANS LE CODE, et ce badge est la
    // seule exception tolérée. Une fonction annoncée sans être marquée ainsi
    // est une promesse : le commerçant souscrit au palier payant en comptant
    // dessus, attend, et ne revient pas. Le cas s'était déjà produit le 10/08
    // avec une « réservation produit » dont aucune ligne n'avait été écrite.
    bientot:     { bg: '#F3F4F6', fg: '#4B5563', label: 'En construction, pas encore disponible' },
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
      desc: 'Notification envoyée à tes Yoppers favoris, ceux qui ont choisi de te suivre. Tu choisis le moment. Yoppaa relaie le message : tu ne vois jamais leur email ni leur identité, tout passe par nous pour respecter le RGPD.',
      plan: 'communiquer',
    },
    {
      Icon: Mail, titre: 'Newsletter ciblée',
      desc: 'Un email plus long et plus construit qu’une notification, envoyé à tes Yoppers favoris depuis ton tableau de bord. Pas encore ouvert : un envoi commercial exige le consentement explicite de chaque Yopper, et nous le mettons en place avant d’activer cette fonction.',
      plan: 'bientot',
    },
    {
      Icon: Sparkles, titre: 'IA Yoppaa',
      desc: 'Un assistant qui écrit à ta place quand la page blanche bloque : ta présentation, tes actus, tes deals. Tu lui donnes trois éléments, il te propose des textes que tu retouches à ta main. Il propose, tu décides : rien n’est publié sans toi.',
      plan: 'communiquer',
    },
    {
      Icon: BarChart3, titre: 'Statistiques',
      desc: 'Combien de personnes ont vu ta fiche, combien t’ont mis en favori, combien t’ont envoyé un signal. Avec Vendre, tu suis aussi tes ventes, tes rendez-vous et ton chiffre d’affaires, et tu exportes tout pour ta comptabilité.',
      plan: 'exister',
    },
    {
      // ⚠️ Le module existe et fonctionne, et le signup n'en disait pas un mot :
      // un commerçant ne pouvait pas savoir qu'il l'avait.
      Icon: MapPin, titre: 'Plusieurs endroits, ou un seul',
      desc: 'Si tu bouges, tu déclares où tu es et quand : les mêmes endroits chaque semaine, deux services dans la même journée pour un food truck, ou une date exceptionnelle comme un marché de Noël. Ta fiche annonce l’endroit du jour, et la distance affichée au Yopper part de là, pas de ton siège social. Si tu ne bouges pas, tu n’as rien à régler.',
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
      desc: 'Pour les restaurateurs : tes capacités par service, et le Yopper réserve depuis ta fiche en choisissant son horaire et le nombre de personnes. C’est le prochain module que nous construisons, il n’est pas encore utilisable.',
      plan: 'bientot',
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
      Icon: Clock, titre: 'Créneaux de rendez-vous',
      desc: 'Tes plages horaires jour par jour, avec pause si tu en prends une, et la durée des créneaux au choix (15 min, 30 min, 1 h). Les exceptions ponctuelles sont prévues.',
      plan: 'vendre',
    },
    {
      // ⚠️ Livré le 13/08. Sans cette ligne, un studio de yoga ou une
      // auto-école ne peut pas deviner que Yoppaa gère autre chose que du
      // tête-à-tête, et passe son chemin.
      Icon: Users, titre: 'Cours collectifs',
      desc: 'Un créneau peut accueillir plusieurs personnes : tu dis combien, et le Yopper voit les places restantes avant de s’inscrire. Le cours s’affiche « complet » quand il est plein, et ton agenda montre la liste des inscrits en un bloc plutôt qu’en dix lignes. Pour le yoga, le pilates, un coach, une auto-école.',
      plan: 'vendre',
    },
    {
      Icon: Users, titre: 'Multi-praticiens',
      desc: 'Tu ajoutes tes praticiens avec photo et spécialités. Chaque RDV est associé à une personne. Planning et statistiques par praticien. Le Yopper peut choisir ou laisser "Premier disponible".',
      plan: 'vendre',
    },
  ]

  // ⚠️ CE QUI EST DÉCRIT ICI DOIT EXISTER DANS LE CODE. Cette carte promettait
  // une « réservation produit » (le Yopper réserve, tu mets de côté, tu confirmes
  // la disponibilité) dont AUCUNE ligne n'a jamais été écrite. Un commerçant de
  // détail souscrivait donc au palier payant sur une fonctionnalité inexistante
  // et attendait une notification qui n'arrivait pas. Décision Alex du 10/08 :
  // la réservation, c'est pour les tables de restaurant, pas pour les articles.
  // Le détail, c'est la vente en ligne, avec retrait au magasin ou envoi.
  const featuresDetail = [
    {
      Icon: Package, titre: 'Vente en ligne de tes articles',
      desc: 'Le Yopper commande depuis ta fiche et choisit : venir chercher au magasin, ou se faire envoyer le colis. Tailles et coloris avec leur stock, paiement en ligne ou au comptoir selon ce que tu préfères. Parfait pour vêtements, livres, fleurs, jouets, etc.',
      plan: 'vendre',
    },
  ]

  // ─── Section 3 : Communes aux plans payants ──────────────────────────────
  const featuresVendre = [
    {
      Icon: CreditCard, titre: 'Paiement en ligne',
      // ⚠️ NE JAMAIS LAISSER CROIRE QUE TOUT LUI REVIENT. Yoppaa ne prend
      // effectivement aucune commission, mais Stripe prélève ses frais à la
      // source, et c'est le commerçant qui les supporte. Les taire ici pour les
      // découvrir sur son premier versement, c'est exactement le reproche qu'on
      // ne veut pas s'attirer. La page /legal les chiffre déjà, le signup doit
      // dire la même chose.
      desc: `Ton client paie son acompte ou sa commande depuis ta fiche, et l’argent arrive sur ton compte bancaire sous quelques jours. Yoppaa ne prend aucune commission. Seuls les frais de Stripe, notre prestataire de paiement, s’appliquent : ${FRAIS_STRIPE_TEXTE}.`,
      plan: 'vendre',
    },
    {
      Icon: Star, titre: 'Carte de fidélité',
      desc: 'Tu fixes la règle, par exemple 10 € dépensés donnent 1 point, et ce que le client gagne au bout : une remise, un produit offert. Plus de carton perdu au fond d’un sac, tout se compte tout seul.',
      plan: 'vendre',
    },
    {
      // ⚠️ Le module est complet depuis le 31/07 et n'apparaissait nulle part
      // dans le signup : un commerçant payait pour une fonction qu'il ignorait.
      Icon: Gift, titre: 'Bons cadeaux',
      desc: 'Tes clients achètent un bon d’un montant qu’ils choisissent, à offrir. Le bénéficiaire le fait valoir chez toi, et le solde restant se garde pour la prochaine fois. Tu es payé à l’achat du bon.',
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
      // ⚠️ « N'IMPORTE QUEL APPAREIL » ÉTAIT VRAI DU TABLEAU DE BORD ET FAUX
      // DE L'IMPRESSION, et l'argument ne faisait pas la différence. Un
      // commerçant qui lit cette phrase, achète une imprimante ailleurs et
      // n'arrive pas à imprimer aura été trompé par une omission.
      desc: 'Ton tableau de bord Yoppaa fonctionne sur n\'importe quel téléphone, tablette ou ordinateur. Android, iPhone, iPad, Mac, PC : pas besoin de matériel spécifique pour démarrer. L\'impression d\'étiquettes, en revanche, n\'est garantie qu\'avec le modèle Brother fourni par Yoppaa.',
      plan: 'exister',
    },
    {
      Icon: Printer, titre: 'Kit Yoppaa hardware',
      // ⚠️ LES PRIX SE LISENT DANS LE CATALOGUE, ILS NE SE RECOPIENT PLUS.
      // Cette phrase a porté 399€ et 179€ en dur pendant que
      // lib/produits-boutique.js faisait foi partout ailleurs.
      desc: `Optionnel et disponible à tout moment depuis ton tableau de bord : Kit Yoppaa Pro (tablette, imprimante d'étiquettes, support de comptoir et 8 rouleaux, ${prixProduitTexte('kit_pro')} HTVA) ou Kit Yoppaa Light (imprimante et 8 rouleaux, ${prixProduitTexte('kit_light')} HTVA). Surtout utile si tu prépares des commandes à retirer. Sinon, ton téléphone, ta tablette ou ton PC suffisent pour tout gérer.`,
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
    site_web: commercant.site_web || '',
    latitude: commercant.latitude,
    longitude: commercant.longitude,
  })
  // Rédaction assistée de la présentation : quelques mots du commerçant, plus
  // son site s'il en a un, contre trois propositions modifiables.
  const [motsCles, setMotsCles] = useState('')
  const [propositions, setPropositions] = useState([])
  const [iaEnCours, setIaEnCours] = useState(false)
  const [iaMessage, setIaMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef(null)

  // ─── Le siège social est-il le lieu de l'activité ? ──────────────────────
  //
  // ⚠️ LE SIGNUP NE DEMANDE PLUS OÙ SE PASSE L'ACTIVITÉ, seulement SI c'est
  // ailleurs. Décision d'Alex du 13/08, et elle corrige une erreur de
  // vocabulaire autant qu'une erreur d'ergonomie.
  //
  // « Siège d'exploitation » est un terme de la Banque-Carrefour : il désigne
  // une unité d'établissement déclarée. Une salle de yoga louée deux heures le
  // mardi n'en est pas une, l'emplacement d'un food truck sur une place non
  // plus. Le mot faisait croire à une formalité administrative là où il n'y a
  // qu'une question simple : où tes clients te trouvent.
  //
  // Et le signup était le pire moment pour la poser. Il porte déjà cinq étapes,
  // il ne gérait qu'UN lieu là où le besoin en compte trois ou quatre, et le
  // commerçant qui s'inscrit ne sait pas encore ce que Yoppaa fera de cette
  // adresse. L'éditeur de lieux de Config fait tout, et le fait mieux.
  //
  // ⚠️ ET LA CASE A DISPARU AUSSI (Alex, 15/08). Elle demandait « mon activité
  // se passe-t-elle à cette adresse ? », donc au commerçant d'arbitrer entre
  // une adresse administrative et un lieu d'accueil, au moment où il ne sait
  // pas encore ce que Yoppaa en fera. Cochée par défaut, elle publiait le
  // DOMICILE de qui s'inscrit chez lui.
  //
  // Plus de question, plus d'arbitrage : cette adresse ne sert qu'au dossier,
  // un message le dit, et les lieux d'activité s'encodent au Profil. Le
  // commerçant part donc avec `siege_social_est_lieu_activite` à son défaut
  // `true`, qui ne veut plus dire « mon siège est mon lieu » mais « j'ai une
  // adresse fixe », et c'est le Profil qui le règle.

  // Validation des champs requis (basée sur les seuils du brief)
  //
  // ⚠️ DÉCOCHER LA CASE NE BLOQUE PLUS L'INSCRIPTION. La version du 12/08
  // exigeait ici une adresse de lieu d'activité, ce qui condamnait le
  // commerçant à la saisir au pire moment : dans un formulaire de cinq étapes,
  // sans jour ni horaire, alors qu'il en a souvent trois à déclarer.
  //
  // Ce n'est pas un contrôle abandonné, c'est un contrôle DÉPLACÉ : décocher
  // la case retire l'adresse du siège des lieux montrés au client, donc la
  // fiche n'annonce plus rien, et « Mes lieux » réclame le complément dès la
  // première connexion au tableau de bord. Le client n'est jamais envoyé chez
  // un commerçant qui n'a pas dit où il accueille.
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
      site_web: values.site_web?.trim() || null,
      latitude: values.latitude || null,
      longitude: values.longitude || null,
    }
    const { data } = await supabase.from('commercants').update(payload).eq('id', commercant.id).select().single()
    if (data) onUpdate(data)
    setSaving(false); onSaving?.('saved')
  }

  // Trois propositions de présentation, à partir des mots du commerçant et de
  // son site s'il en a déclaré un. Le nombre de demandes est plafonné côté
  // serveur : on affiche le décompte plutôt que de couper sans prévenir.
  async function genererPresentation() {
    if (iaEnCours) return
    if (!form.nom.trim()) { setIaMessage({ type: 'error', texte: 'Renseigne d\'abord le nom de ton commerce.' }); return }
    setIaEnCours(true); setIaMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setIaMessage({ type: 'error', texte: 'Session expirée, reconnecte-toi.' }); setIaEnCours(false); return }
      const r = await fetch('/api/ia/presentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commercant_id: commercant.id, mots: motsCles, site_web: form.site_web }),
      })
      const j = await r.json()
      if (!j?.ok) {
        setIaMessage({ type: 'error', texte: j?.message || j?.error || 'La rédaction a échoué, réessaie.' })
        setIaEnCours(false)
        return
      }
      setPropositions(j.variantes || [])
      setIaMessage({
        type: 'ok',
        texte: `${j.site_lu ? 'On a lu ton site pour t\'aider. ' : ''}Choisis le texte le plus juste, tu pourras le modifier.${
          j.restant > 0 ? ` Il te reste ${j.restant} demande${j.restant > 1 ? 's' : ''}.` : ' C\'était ta dernière demande.'}`,
      })
    } catch {
      setIaMessage({ type: 'error', texte: 'La rédaction a échoué, réessaie dans un instant.' })
    }
    setIaEnCours(false)
  }

  // ⚠️ LA RECHERCHE D'ADRESSE VIT DANS `ChampAdresse`, hissé au niveau du
  // fichier : il y a DEUX champs depuis le 12/08, le siège social et le lieu
  // d'activité, et les recopier aurait garanti qu'ils divergent.

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

      {/* ⚠️ DEUX ADRESSES DEPUIS LE 12/08, ET C'EST TOUT L'ENJEU. Ce champ unique
          servait à la fois de mention légale, de point de retrait, de base de
          calcul des distances et de rattachement communal. Un commerçant inscrit
          à la BCE à son DOMICILE saisissait son domicile pour être en règle, et
          Yoppaa y envoyait ses clients.
          La case reste cochée par défaut : pour l'immense majorité, les deux
          adresses n'en font qu'une, et le formulaire ne s'allonge pas d'un pouce. */}
      <Card titre="Localisation" sous="On distingue l'adresse de ton entreprise de l'endroit où se passe ton activité.">
        <Field label="Adresse du siège social *">
          <ChampAdresse
            style={inputStyle()}
            valeur={form.adresse}
            position={form}
            placeholder="Ex: Place Meunier 1, 5640 Mettet"
            onTexte={v => updateField('adresse', v)}
            onChoisir={({ adresse, latitude, longitude }) => {
              setForm(p => ({ ...p, adresse, latitude, longitude }))
              sauvegarder({ ...form, adresse, latitude, longitude })
            }}
          />
          <p style={{ fontSize: 11, color: T.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
            Celle de ton inscription à la Banque-Carrefour des Entreprises.
          </p>
        </Field>

        {/* ⚠️ LA CASE A DISPARU, ET AVEC ELLE UNE AMBIGUÏTÉ (Alex, 15/08).
            Elle demandait si l'activité s'y passe, donc au commerçant
            d'arbitrer, au pire moment, entre une adresse administrative et un
            lieu d'accueil. Coché par défaut, ce qui publiait le DOMICILE de qui
            s'inscrit chez lui sans qu'il ait rien demandé.
            La règle est désormais sans exception : cette adresse ne sert qu'à
            valider le dossier, et les lieux d'activité s'encodent au Profil.
            La colonne `siege_social_est_lieu_activite` survit, mais elle ne dit
            plus « mon siège est mon lieu » : elle dit « une adresse fixe » ou
            « je change d'endroit », et c'est le Profil qui la règle. */}
        <div style={{ background: T.pale, borderRadius: 12, padding: '11px 13px', margin: '2px 0 14px' }}>
          <p style={{ margin: 0, fontSize: 12, color: T.deep, fontWeight: 700, lineHeight: 1.5 }}>
            Cette adresse ne sert qu’à valider ton dossier.
            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: T.muted, marginTop: 3 }}>
              Elle n’est jamais montrée à tes clients. Tu indiqueras juste après,
              depuis ton profil, où ils viennent te trouver :{' '}
              {estFoodTruck(form.type)
                ? 'tes emplacements, leurs jours et leurs heures, autant que tu veux.'
                : 'une adresse fixe, ou plusieurs endroits selon les jours si tu bouges.'}
            </span>
          </p>
        </div>
        <Field label="Téléphone *">
          <input type="tel" value={form.telephone} onChange={e => updateField('telephone', e.target.value)} placeholder="+32 71 00 00 00" style={inputStyle()}/>
        </Field>
      </Card>

      <Card titre="Site web" sous="Facultatif. Si tu en as un, l'assistant s'en servira pour rédiger ta présentation.">
        <input type="url" inputMode="url" value={form.site_web}
          onChange={e => updateField('site_web', e.target.value)}
          placeholder="www.mon-commerce.be" style={inputStyle()}/>
        <p style={{ fontSize: 11, color: T.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
          Une page Facebook fait aussi l&rsquo;affaire. Rien du tout, c&rsquo;est très bien aussi.
        </p>
      </Card>

      <Card titre="Ta présentation" sous={`Minimum 20 caractères. ${form.description.length} / 20.`}>
        {/* Écrire sur soi est l'étape où l'on abandonne une inscription. Trois
            textes à choisir et à retoucher lèvent ce blocage, et le commerçant
            découvre au passage l'assistant de rédaction. */}
        <div style={{ background: T.pale, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: T.deep }}>
            Tu ne sais pas par où commencer ? Donne trois éléments, on te propose des textes.
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 11.5, color: T.muted, lineHeight: 1.55 }}>
            Ce que tu vends ou proposes, depuis quand tu es là, et ce qui te distingue du voisin.
            Par exemple : <em>« pains au levain, cuisson maison, ouvert depuis 1998, on connaît nos clients par leur prénom »</em>.
          </p>
          <textarea value={motsCles} onChange={e => setMotsCles(e.target.value)}
            placeholder="Tes mots à toi, en vrac. Pas besoin de faire des phrases."
            rows={2}
            style={{ ...inputStyle(), minHeight: 56, resize: 'vertical', marginBottom: 8 }}/>
          <button type="button" onClick={genererPresentation} disabled={iaEnCours}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 100, border: 'none', background: iaEnCours ? T.muted : T.bgPanel, color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: iaEnCours ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            {iaEnCours ? 'Rédaction en cours…' : 'Proposer des textes'}
          </button>
          {iaMessage && (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: iaMessage.type === 'error' ? '#B45309' : T.muted, lineHeight: 1.5 }}>
              {iaMessage.texte}
            </p>
          )}
          {propositions.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {propositions.map((p, i) => (
                <button key={i} type="button" onClick={() => { updateField('description', p); setIaMessage({ type: 'ok', texte: 'Texte repris. Modifie-le autant que tu veux, c\'est le tien.' }) }}
                  style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${form.description === p ? T.main : '#EDE0FF'}`, background: form.description === p ? '#FAF8FE' : '#fff', fontSize: 12.5, color: T.ink, cursor: 'pointer', lineHeight: 1.5, fontFamily: 'inherit' }}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

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
  // S4 : galerie = jusqu'a 4 photos supplementaires affichees en carrousel
  // sur la fiche client. Stockees en commercant_photos type='galerie'.
  const [galerie, setGalerie] = useState([])
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingGalerie, setUploadingGalerie] = useState(false)
  // ⚠️ UN MESSAGE PAR CARTE, ET C'EST LE CORRECTIF PRINCIPAL (Alex, 21/08).
  // Un état `error` UNIQUE, rendu tout en bas de l'étape, faisait s'afficher le
  // refus d'une photo de GALERIE sous la carte du LOGO, collé au bouton
  // « Continuer ». Alex a cru que son logo venait d'être refusé : le message
  // accusait le mauvais bloc, à deux cartes du geste.
  // Un message se lit LÀ OÙ LE GESTE A EU LIEU.
  const [msgLogo, setMsgLogo] = useState(null)      // { ton, titre, detail }
  const [msgGalerie, setMsgGalerie] = useState(null)
  // Tailles mesurées des images, pour que l'avertissement RESTE visible sur la
  // vignette au lieu de disparaître avec le message.
  const [dimsImages, setDimsImages] = useState({})  // { logo | <id photo> : { w, h } }
  const [saving, setSaving] = useState(false)
  // La couverture compte pour une : neuf de plus font dix photos en tout.
  const MAX_GALERIE = MAX_PHOTOS - 1

  // Charge couverture + galerie au mount
  useEffect(() => {
    let annule = false
    supabase.from('commercant_photos')
      .select('id, url, type, ordre')
      .eq('commercant_id', commercant.id)
      .order('ordre')
      .then(({ data }) => {
        if (annule) return
        setGalerie((data || []).filter(p => p.type === 'galerie' && p.url))
      })
    return () => { annule = true }
  }, [commercant.id])

  // ⚠️ LA TAILLE EN PIXELS NE BLOQUE PLUS (arbitrage d'Alex, 21/08). Ce qui
  // bloque encore : un fichier qui n'est pas une image, trop lourd, ou que le
  // navigateur ne sait pas décoder. La règle et ses textes vivent dans
  // `lib/image-qualite`, une seule fois, pour le signup ET le tableau de bord.
  // Retourne les dimensions si le fichier passe, null sinon.
  async function controlerImage(file, poser) {
    poser(null)
    const refus = refusFichierImage(file)
    if (refus) { poser({ ton: 'erreur', titre: refus }); return null }
    const dims = await mesurerFichierImage(file)
    if (!dims) {
      poser({ ton: 'erreur', titre: 'Cette image ne s\'ouvre pas.',
        detail: 'Le fichier est peut-être abîmé, ou dans un format que ton navigateur ne lit pas. Réessaie avec une autre image.' })
      return null
    }
    return dims
  }

  async function uploadLogo(file) {
    const dims = await controlerImage(file, setMsgLogo)
    if (!dims) return
    setUploadingLogo(true)
    // Compression client automatique (feedback_zero_friction)
    const compressed = await compresserImage(file, { maxWidth: 400, maxHeight: 400, quality: 0.85 })
    const fileName = `logo-${commercant.id}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { setMsgLogo({ ton: 'erreur', titre: `Upload échoué : ${upErr.message}` }); setUploadingLogo(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    const url = urlData.publicUrl
    const { data: c } = await supabase.from('commercants').update({ logo_url: url }).eq('id', commercant.id).select().single()
    if (c) onUpdate(c)
    setLogoUrl(url)
    setDimsImages(prev => ({ ...prev, logo: dims }))
    // ⚠️ L'AVERTISSEMENT ARRIVE APRÈS LE SUCCÈS, PAS À LA PLACE. Le logo est
    // en ligne : on le dit d'abord en le montrant, et on signale ensuite ce
    // qu'il gagnerait à devenir. Un avertissement n'est pas un refus.
    const av = avertissementTaille(dims, TAILLE_CONSEILLEE.logo, 'logo')
    setMsgLogo(av ? { ton: 'avertissement', titre: av.titre, detail: av.detail } : null)
    setUploadingLogo(false)
  }

  // Fallback "Genere-moi" : produit un cercle violet avec initiale du nom
  // dans la charte Yoppaa. Pas de friction, propre, identitaire.
  async function genererLogoAuto(choix = null) {
    setMsgLogo(null)
    setUploadingLogo(true)
    onSaving?.('saving')
    try {
      const nom = commercant.nom && commercant.nom !== 'Mon commerce' ? commercant.nom : 'Y'
      const canvas = await logoProvisoireCanvas(nom, commercant.type, choix)
      const blob = await canvasVersBlob(canvas)
      if (!blob) { setMsgLogo({ ton: 'erreur', titre: 'Génération du logo impossible.' }); return }
      const fileName = `logo-${commercant.id}-${Date.now()}.png`
      const { error: upErr } = await supabase.storage.from('logos').upload(fileName, blob, { upsert: true, contentType: 'image/png' })
      if (upErr) { setMsgLogo({ ton: 'erreur', titre: `Upload échoué : ${upErr.message}` }); return }
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
      const url = urlData.publicUrl
      const { data: c } = await supabase.from('commercants').update({ logo_url: url }).eq('id', commercant.id).select().single()
      if (c) onUpdate(c)
      setLogoUrl(url)
      // Le logo provisoire est dessiné en 512 px : jamais d'avertissement ici,
      // et surtout pas celui d'une image précédente resté à l'écran.
      setDimsImages(prev => ({ ...prev, logo: { w: canvas.width, h: canvas.height } }))
      onSaving?.('saved')
    } finally {
      setUploadingLogo(false)
    }
  }



  // S4 : ajout d'une photo a la galerie (max 4). Ordre = max courant + 1
  // pour preserver l'ordre d'affichage du carousel cote fiche client.
  async function uploadPhotoGalerie(file) {
    if (galerie.length >= MAX_GALERIE) {
      setMsgGalerie({ ton: 'erreur', titre: `Maximum ${MAX_GALERIE} photos supplémentaires.` })
      return
    }
    const dims = await controlerImage(file, setMsgGalerie)
    if (!dims) return
    setUploadingGalerie(true)
    onSaving?.('saving')
    // Compression client automatique (feedback_zero_friction) — galerie carousel
    const compressed = await compresserImage(file, { maxWidth: 1600, maxHeight: 1200, quality: 0.85 })
    const fileName = `gal-${commercant.id}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { setMsgGalerie({ ton: 'erreur', titre: `Upload échoué : ${upErr.message}` }); setUploadingGalerie(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    const url = urlData.publicUrl
    const ordreSuivant = galerie.length > 0 ? Math.max(...galerie.map(p => p.ordre || 0)) + 1 : 1
    const { data: row, error: insErr } = await supabase.from('commercant_photos').insert({
      commercant_id: commercant.id,
      type: 'galerie',
      url,
      ordre: ordreSuivant,
    }).select().single()
    if (insErr) { setMsgGalerie({ ton: 'erreur', titre: `Enregistrement échoué : ${insErr.message}` }); setUploadingGalerie(false); return }
    setGalerie(prev => [...prev, row])
    if (row?.id) setDimsImages(prev => ({ ...prev, [row.id]: dims }))
    const av = avertissementTaille(dims, TAILLE_CONSEILLEE.photo, 'photo')
    setMsgGalerie(av ? { ton: 'avertissement', titre: av.titre, detail: av.detail } : null)
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
      // ⚠️ `photo_ok` PORTE 20 DES 100 POINTS DU SCORE, et le seuil pour
      // soumettre est de 60. Le brancher sur une photo de couverture qu'on ne
      // demande plus aurait rendu ces 20 points inatteignables : un commerçant
      // de service, qui peut déjà passer les horaires, se serait retrouvé
      // bloqué sous le seuil sans comprendre pourquoi.
      // Il porte donc désormais sur la galerie, qui est ce qu'on lui demande
      // vraiment et ce que ses clients verront.
      const { data } = await supabase.from('onboarding_commercants')
        .update({ photo_ok: galerie.length > 0 }).eq('id', onboarding.id).select().single()
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
        {/* ⚠️ « +40 % DE CLICS » A ÉTÉ RETIRÉ D'ICI. Ce chiffre ne reposait sur
            aucune mesure : ni sur les statistiques de Yoppaa, qui n'existaient
            pas encore, ni sur une étude citée. Une allégation chiffrée
            invérifiable est une promesse commerciale, et le commerçant qui ne
            voit pas ces 40 % arriver a raison de nous le reprocher. On dit
            plutôt ce qui est vrai et vérifiable : la photo est ce qu'on voit
            avant le nom. */}
        Ta photo est ce qu&rsquo;un client voit avant même ton nom, dans la liste des commerces autour de lui. Tu pourras en ajouter d&rsquo;autres plus tard.
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
        {/* ⚠️ « MINIMUM » EST DEVENU « CONSEILLÉ », ET C'EST MAINTENANT VRAI :
            une photo plus petite passe, on te dit simplement ce qu'elle vaudra.
            Annoncer un minimum qu'on n'applique plus serait pire que de ne rien
            annoncer du tout. */}
        <p style={{ fontSize: 10.5, color: T.muted, margin: '10px 0 0', fontWeight: 600, lineHeight: 1.4 }}>
          Format accepté : JPG, PNG, WEBP · 800 px conseillés sur le grand côté · 15 Mo max
        </p>
      </div>

      {/* ⚠️ « PHOTO DE COUVERTURE » RETIRÉE ICI (Alex, 14/08). Elle ne
          devenait PAS la bannière du haut de fiche : celle-ci est dessinée par
          le composant BanniereCommerce, à partir du nom, et ne lit aucune
          image. On demandait donc un travail au commerçant pour une photo qui
          n'apparaissait pas là où le titre le laissait croire.
          À la place, il voit ce que sa fiche donnera vraiment. */}
      <Card titre="Le haut de ta fiche" sous="Il est créé automatiquement à partir du nom de ton commerce. Rien à faire, et rien à uploader.">
        <div style={{ position: 'relative', height: 150, borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.hairline}` }}>
          <BanniereCommerce nom={commercant.nom && commercant.nom !== 'Mon commerce' ? commercant.nom : 'Ton commerce'} taillePolice="1.3rem" compact/>
        </div>
        <p style={{ fontSize: 11.5, color: T.muted, margin: '10px 0 0', lineHeight: 1.5 }}>
          C&apos;est la signature Yoppaa : un Yopper reconnaît une fiche Yoppaa avant même
          de lire. Tes photos à toi, elles, s&apos;affichent juste en dessous.
        </p>
      </Card>

      <Card titre={`Mon commerce en images (${galerie.length + 1}/${MAX_PHOTOS})`} sous="Elles défilent dans cet ordre sur ta page. Rien n'est obligatoire, mais trois photos valent mieux qu'une.">
        {/* « Ajoute des photos » ne dit rien à personne. Une consigne par place,
            en revanche, se comprend et se fait : c'est la demande d'Alex du
            05/08, et c'est ce qui fait la différence entre une fiche vide et
            une fiche qui donne envie. */}
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {[2, 3, 4].map(position => {
            // Conseils adaptés au métier : un food truck n'a pas de devanture,
            // un salon ne vend pas des rayons.
            const c = conseilPhoto(position, { categorie: commercant.categorie, type: commercant.type })
            return (
              <p key={position} style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                <strong style={{ color: T.bgPanel }}>Photo {position} · {c.titre}</strong> {c.aide}
              </p>
            )
          })}
          <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
            Au-delà, tu peux aller jusqu&rsquo;à {MAX_PHOTOS} photos et changer leur ordre depuis ton tableau de bord.
          </p>
        </div>
        <GalerieMini
          photos={galerie}
          max={MAX_GALERIE}
          uploading={uploadingGalerie}
          onFile={uploadPhotoGalerie}
          onSupprimer={supprimerPhotoGalerie}
          dims={dimsImages}
          onMesure={(id, d) => setDimsImages(prev => (prev[id] ? prev : { ...prev, [id]: d }))}
        />
        <MessageImage msg={msgGalerie}/>
        <div style={{ marginTop: 10, fontSize: 11, color: T.muted, fontWeight: 600, lineHeight: 1.5 }}>
          Format paysage idéal, mais tous les ratios passent. Compression automatique.
        </div>
      </Card>

      {/* ⚠️ LE LOGO N'EST PAS UN ORNEMENT, et le texte doit le dire (Alex,
          14/08). C'est la seule image qui accompagne un commerce PARTOUT :
          l'accueil, la liste des favoris, le suivi de commande. Un Yopper
          retrouve son boulanger à sa vignette avant de lire son nom. On peut
          lui en générer un, mais son vrai logo vaudra toujours mieux : c'est
          son identité, pas la nôtre. */}
      <Card titre="Ton logo" sous="C'est à ça que tes clients te reconnaîtront dans la liste des commerces, dans leurs favoris et sur leurs commandes.">
        <UploadZone
          url={logoUrl}
          uploading={uploadingLogo}
          aspect="1/1"
          minHeight={120}
          label="Ajouter le logo"
          onFile={uploadLogo}
          maxWidth={140}
          dims={dimsImages.logo}
          onMesure={d => setDimsImages(prev => (prev.logo ? prev : { ...prev, logo: d }))}
          minPx={TAILLE_CONSEILLEE.logo}
          quoi="logo"
        />
        <MessageImage msg={msgLogo}/>
        {/* ⚠️ ON PROPOSE, ON N'IMPOSE PAS (Alex, 14/08). Un logo qu'on choisit
            devient le sien ; un logo imposé reste « celui de Yoppaa », et le
            commerçant s'en détache au lieu de se l'approprier. Le premier de
            la grille est le symbole le plus attendu pour son métier, dans une
            teinte dérivée de son nom : c'est une proposition, pas un verdict. */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${T.hairline}` }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: T.bgPanel, margin: '0 0 3px' }}>
            Pas encore de logo ? Choisis-en un en attendant
          </p>
          <p style={{ fontSize: 11, color: T.muted, margin: '0 0 10px', lineHeight: 1.45 }}>
            Il reprend le symbole de ton métier. Tu le remplaceras par le tien quand tu voudras.
          </p>

          {/* ⚠️ DIRE QUE C'EST PROVISOIRE, ET POURQUOI ON Y TIENT (Alex, 14/08).
              Formuler ça comme une règle de la plateforme serait exact et
              contre-productif : le commerçant y entendrait une case à cocher de
              plus, et chercherait comment y couper. Ce qui le convainc, c'est ce
              que ça lui rapporte à LUI, et ça se démontre en une image : une
              liste de commerces sans vignette est illisible, et celui qui n'en a
              pas est celui qu'on ne remarque pas. */}
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: T.pale, borderRadius: 12, padding: '11px 13px', marginBottom: 12 }}>
            <span style={{ flexShrink: 0, marginTop: 1, color: T.main }}><Sparkles size={16} strokeWidth={2.2}/></span>
            <p style={{ margin: 0, fontSize: 11.5, color: T.deep, fontWeight: 700, lineHeight: 1.5 }}>
              C&apos;est un dépannage, et ça se remplace en dix secondes.
              <span style={{ display: 'block', fontWeight: 500, color: T.muted, marginTop: 3 }}>
                Sur Yoppaa, chaque commerce a sa vignette : c&apos;est à ça qu&apos;un habitant
                retrouve son boulanger dans une liste, d&apos;un coup d&apos;œil et sans lire.
                Celui qui n&apos;en a pas est celui qu&apos;on ne remarque pas. Alors on t&apos;en
                prête un, le temps que tu mettes le tien.
              </span>
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 8 }}>
            {propositionsLogo({ nom: commercant.nom && commercant.nom !== 'Mon commerce' ? commercant.nom : 'Yoppaa', type: commercant.type }).map(p => (
              <button key={p.cle} type="button" disabled={uploadingLogo}
                onClick={() => genererLogoAuto({ symbole: p.symbole, teinte: p.teinte })}
                aria-label={`Choisir ce logo, symbole ${p.symbole}`}
                style={{ padding: 0, border: `2px solid ${T.hairline}`, borderRadius: 14, background: 'none', cursor: uploadingLogo ? 'wait' : 'pointer', aspectRatio: '1/1', overflow: 'hidden', lineHeight: 0, transition: 'border-color 0.15s, transform 0.15s' }}
                onMouseOver={e => { if (!uploadingLogo) { e.currentTarget.style.borderColor = T.main; e.currentTarget.style.transform = 'translateY(-2px)' } }}
                onMouseOut={e => { e.currentTarget.style.borderColor = T.hairline; e.currentTarget.style.transform = 'none' }}>
                {/* Le SVG est rendu tel quel : pas d'aller-retour au serveur
                    pour un aperçu, et ce qu'il voit est exactement ce qu'il
                    obtiendra en cliquant. */}
                <span style={{ display: 'block', width: '100%' }} dangerouslySetInnerHTML={{ __html: p.svg.replace('width="512" height="512"', 'width="100%" height="100%"') }}/>
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: T.muted, fontWeight: 600, lineHeight: 1.5 }}>
          <strong style={{ color: T.bgPanel }}>Le tien vaut mieux que le nôtre :</strong> c&apos;est ton identité,
          celle qu&apos;on retrouve sur ta vitrine et sur tes sacs. Ton logo seul sur fond uni,
          ou une photo carrée bien recadrée sur ton enseigne.
          <span style={{ display: 'block', marginTop: 4 }}>
            Si tu n&apos;en as pas encore, on t&apos;en fabrique un aux couleurs de ton métier
            pour que ta fiche ne reste pas vide. Tu le remplaceras quand tu voudras.
          </span>
        </div>
      </Card>

      {/* ⚠️ PLUS AUCUN BANDEAU D'ERREUR ICI. C'est ce bandeau, rendu après les
          deux cartes, qui affichait le refus d'une photo de galerie juste sous
          la carte du logo. Chaque message est désormais dans SA carte. */}

      <NavEtape
        retour={retour}
        continuer={continuer}
        valide={true}
        saving={saving}
        hint={logoUrl || galerie.length > 0 ? null : 'Sans logo ni photo, ta fiche paraît vide. Tu peux aussi les ajouter plus tard depuis ton tableau de bord.'}
      />
    </div>
  )
}

// ⚠️ UN MESSAGE SE LIT LÀ OÙ LE GESTE A EU LIEU. Rendu DANS la carte concernée,
// jamais en pied d'étape. Deux tons, et ils ne disent pas la même chose :
//   • erreur         → rien n'a été enregistré, il faut recommencer.
//   • avertissement  → c'est enregistré, et voilà ce que ça vaudra.
// Le rouge est réservé à ce qui a échoué (feedback_boutons_qui_disent_le_geste).
function MessageImage({ msg }) {
  if (!msg) return null
  const erreur = msg.ton === 'erreur'
  const couleurs = erreur
    ? { fond: '#FEE2E2', bord: '#FCA5A5', texte: '#7F1D1D', doux: '#991B1B' }
    : { fond: '#FFF7ED', bord: '#FED7AA', texte: '#7C2D12', doux: '#9A3412' }
  return (
    <div role={erreur ? 'alert' : 'status'}
      style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: couleurs.fond, border: `1px solid ${couleurs.bord}`, borderRadius: 10, padding: '10px 13px', marginTop: 12 }}>
      <span style={{ flexShrink: 0, marginTop: 1, color: couleurs.texte }}>
        <AlertTriangle size={15} strokeWidth={2}/>
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: couleurs.texte, lineHeight: 1.45 }}>{msg.titre}</p>
        {msg.detail && (
          <p style={{ margin: '3px 0 0', fontSize: 11.5, fontWeight: 500, color: couleurs.doux, lineHeight: 1.5 }}>{msg.detail}</p>
        )}
      </div>
    </div>
  )
}

// Pastille posée sur une vignette quand l'image est sous sa taille conseillée.
// ⚠️ ELLE SURVIT AU MESSAGE. Le texte d'avertissement disparaît au téléversement
// suivant ; la pastille, elle, est encore là au retour sur l'étape, et c'est ce
// qui permet de savoir LAQUELLE des six photos reprendre.
function PastilleTaille({ dims, minPx, quoi = 'photo' }) {
  const av = avertissementTaille(dims, minPx, quoi)
  if (!av) return null
  return (
    <span title={`${av.titre}. ${av.detail}`}
      style={{ position: 'absolute', left: 4, bottom: 4, background: 'rgba(124,45,18,0.92)', color: '#fff', fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 100, letterSpacing: '0.2px', pointerEvents: 'none' }}>
      {av.grandCote} px
    </span>
  )
}

// Grille de thumbs galerie + bouton "+" pour ajouter une photo (max atteint).
// Affiche une croix sur chaque thumb pour supprimer.
function GalerieMini({ photos, max, uploading, onFile, onSupprimer, dims = {}, onMesure }) {
  const inputRef = useRef(null)
  const peutAjouter = photos.length < max
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
        {photos.map(p => (
          <div key={p.id} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.hairline}` }}>
            {/* ⚠️ ON MESURE L'IMAGE EN LIGNE, PAS SEULEMENT LE FICHIER TÉLÉVERSÉ.
                La compression ne fait que RÉDUIRE : une source de 640 px reste
                à 640 px une fois stockée. La mesure au chargement donne donc la
                même réponse, et elle vaut aussi pour les photos déjà en place
                avant aujourd'hui. Aucune migration, aucune colonne à remplir. */}
            <img decoding="async" loading="lazy" src={p.url} alt=""
              onLoad={e => onMesure?.(p.id, { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            <PastilleTaille dims={dims[p.id]} minPx={TAILLE_CONSEILLEE.photo}/>
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
      {/* ⚠️ `image/*` ET NON UNE LISTE DE TROIS FORMATS. Un iPhone propose ses
          photos en HEIC : la liste étroite les grisait dans le sélecteur, alors
          que le tableau de bord les accepte. Safari sait les décoder, la
          compression les ressort en JPEG, et ce qui ne se décode pas est
          attrapé par la mesure avec un message clair. */}
      <input ref={inputRef} type="file" accept="image/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        style={{ display: 'none' }}/>
    </div>
  )
}

function UploadZone({ url, uploading, aspect, minHeight, label, onFile, maxWidth, dims, onMesure, minPx, quoi }) {
  const inputRef = useRef(null)
  return (
    <div style={{ maxWidth }}>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        style={{ width: '100%', minHeight, aspectRatio: aspect, borderRadius: 14, border: `2px dashed ${url ? T.bgPanel : T.hairline}`, background: url ? '#fff' : '#FAFAFA', cursor: uploading ? 'wait' : 'pointer', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', padding: 0 }}>
        {url ? (
          <img decoding="async" loading="lazy" src={url} alt=""
            onLoad={e => onMesure?.({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        ) : (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Camera size={26} strokeWidth={1.8} color={T.main} style={{ marginBottom: 6 }}/>
            <p style={{ fontSize: 13, color: T.muted, fontWeight: 700 }}>{label}</p>
            <p style={{ fontSize: 11, color: T.muted, fontWeight: 500, marginTop: 4 }}>JPG, PNG ou WEBP · 15 Mo max</p>
          </div>
        )}
        {url && minPx ? <PastilleTaille dims={dims} minPx={minPx} quoi={quoi}/> : null}
        {uploading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: T.bgPanel }}>
            Upload en cours…
          </div>
        )}
      </button>
      {/* ⚠️ `image/*` ET NON UNE LISTE DE TROIS FORMATS. Un iPhone propose ses
          photos en HEIC : la liste étroite les grisait dans le sélecteur, alors
          que le tableau de bord les accepte. Safari sait les décoder, la
          compression les ressort en JPEG, et ce qui ne se décode pas est
          attrapé par la mesure avec un message clair. */}
      <input ref={inputRef} type="file" accept="image/*"
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
  // ⚠️ ET CELUI QUI CHANGE D'ENDROIT PEUT PASSER AUSSI, quel que soit son plan
  // et sa catégorie : ses horaires ne se saisissent pas ici, ils se déduisent
  // de ses emplacements. Le bloquer sur une grille qu'on va réécrire serait
  // lui faire perdre son temps au pire moment, celui de l'inscription.
  const skipAutorise = peutSkipperHoraires(plan, commercant.categorie)
    || horairesViennentDesLieux(commercant)

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

      {/* ⚠️ CE COMMERÇANT N'A PAS D'HORAIRES FIXES, et lui en demander ici est
          une question sans réponse. Il a dit à l'étape précédente que son
          activité ne se passe pas à l'adresse de son siège : depuis le 13/08,
          ses horaires sont DÉDUITS de ses emplacements, et ce qu'il saisirait
          ici serait réécrit dès sa première tournée déclarée. */}
      {horairesViennentDesLieux(commercant) && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: T.pale, border: `1.5px solid ${T.main}44`, borderRadius: 14, padding: '13px 15px', marginBottom: 16 }}>
          <span style={{ flexShrink: 0, marginTop: 1, color: T.main }}><MapPin size={17} strokeWidth={2.2}/></span>
          <p style={{ margin: 0, fontSize: 12.5, color: T.deep, fontWeight: 700, lineHeight: 1.5 }}>
            Tu changes d’endroit : tes horaires viendront de tes emplacements.
            <span style={{ display: 'block', fontWeight: 500, marginTop: 3, color: T.muted }}>
              Tu déclareras où tu es et à quelles heures depuis ton tableau de bord,
              et tes horaires d’ouverture en découleront tout seuls. Tu peux donc passer
              cette étape, ou poser ici des heures indicatives en attendant.
            </span>
          </p>
        </div>
      )}

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
        hint={valide ? null : (horairesViennentDesLieux(commercant)
          ? 'Tu peux passer : tes horaires viendront de tes emplacements.'
          : skipAutorise ? 'Tu peux passer cette étape si tu fonctionnes uniquement sur RDV.'
          : 'Coche au moins un jour d\'ouverture.')}
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
//
// Le catalogue vit désormais dans lib/produits-boutique.js : il est partagé
// avec l'onglet Accompagnement du tableau de bord (où le commerçant peut
// commander à tout moment) et avec la route Stripe, pour que les libellés et
// les prix ne divergent jamais entre les surfaces.

// Bandeau recap adapte au plan choisi affiche en tete de l'etape 5.
// Resume ce qui se passe a la soumission : essai gratuit si paye (offre de
// lancement, cf. lib/lancement.js), gratuit a vie si Exister.
function BandeauRecapPlan({ plan }) {
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
          Plan <span style={{ color: T.main }}>{PLAN_LABEL[plan]}</span> &middot;{' '}
          {estRegimeLancement()
            ? `offert jusqu'au ${libelleDernierJourGratuit()}`
            : `essai ${ESSAI_JOURS_MINIMUM} jours gratuit`}
        </p>
      </div>
      <p style={{ fontSize: 12.5, color: T.deep, margin: 0, lineHeight: 1.5 }}>
        {estRegimeLancement()
          ? <>Aucun prélèvement avant le <strong>{libelleFinEssaiLancement()}</strong>. </>
          : <>Aucun prélèvement pendant {ESSAI_JOURS_MINIMUM} jours. </>}
        Ensuite, <strong>{tarifFormate}&euro; HTVA / mois</strong>,
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
function CardKYB({ commercant, onUpdate, onSaving }) {
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
                {/* ⚠️ CE MESSAGE AFFIRMAIT CE QU'IL NE POUVAIT PAS SAVOIR.
                    Il disait « ce numéro n'existe pas au registre BCE », alors
                    que le contrôle est PUREMENT ARITHMÉTIQUE, un modulo 97 sur
                    les chiffres saisis : aucune consultation du registre n'a
                    lieu. Un numéro parfaitement inexistant mais bien formé
                    passait donc, et un commerçant qui avait juste inversé deux
                    chiffres s'entendait dire que son entreprise n'existe pas.
                    On dit ce qu'on a vérifié, et rien de plus. */}
                Ce numéro n&rsquo;est pas valide, vérifie les chiffres.
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


  // Calcul du score 0-100 selon le brief
  // ⚠️ LES HORAIRES NE CONCERNENT PAS TOUT LE MONDE, et c'est ce qui empêchait
  // certains d'atteindre 100 % : un service en formule Exister peut les passer,
  // et depuis le 13/08 celui dont les horaires viennent de ses emplacements
  // aussi. Le critère est alors retiré du calcul, pas laissé rouge à vie.
  const score = scoreOnboarding({
    commercant,
    onboarding,
    horairesRequis: !peutSkipperHoraires(getPlanActif(commercant, onboarding), commercant.categorie)
      && !horairesViennentDesLieux(commercant),
  })
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
  const peutSoumettre = score.peutSoumettre && kybRempli

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
        // ⚠️ LE POURCENTAGE, PAS L'OBJET. `scoreOnboarding` rendait un nombre
        // avant le 14/08 ; depuis, elle rend un bilan complet (pourcentage,
        // critères, manquants). Le nom de la variable n'a pas bougé, donc cette
        // écriture a continué de passer l'objet entier dans une colonne
        // `integer`, et PostgreSQL refusait la soumission au tout dernier
        // clic du parcours d'inscription.
        validation_auto_score: score.pourcentage,
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
    // ⚠️ LE JETON EST OBLIGATOIRE DEPUIS LE 21/08. Sans lui, `/api/notify-yoppaa`
    // était un relais de courrier ouvert : n'importe qui choisissait le
    // destinataire ET le texte d'un email signé par notre domaine. Le nom, le
    // plan et l'adresse ne sont plus envoyés du tout, la route les relit en base.
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      await fetch('/api/notify-yoppaa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s?.access_token || ''}`,
        },
        body: JSON.stringify({
          commercant_id: commercant.id,
          type: commercant.type,
          // Même raison qu'au-dessus : on annonce un pourcentage, pas un bilan.
          score: score.pourcentage,
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
            <li><strong>Ta fiche :</strong> {score.pourcentage} % complète{score.complet ? ' 🟣' : ''}</li>
            {[...shopChoices].map(type => {
              const p = SHOP_PRODUCTS.find(p => p.type === type)
              if (!p) return null
              return <li key={type}><strong>{p.label} :</strong> {p.prix.toFixed(2).replace('.', ',')}€ HTVA</li>
            })}
            {shopChoices.size > 0 && <li style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.hairline}` }}><strong>Total boutique :</strong> {totalChoisis.toFixed(2).replace('.', ',')}€ HTVA</li>}
          </ul>
        </Card>
        <div style={{ background: T.pale, borderRadius: 14, padding: '14px 16px', marginTop: 16, textAlign: 'left' }}>
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: T.deep }}>
            Et après, qu'est-ce qui t'attend ?
          </p>
          <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
            Dès que ta page est en ligne, ton tableau de bord t'ouvre le reste : ton
            catalogue, tes créneaux, tes actus, tes deals. Rien d'obligatoire, rien à
            faire dans l'urgence, et tout se remplit au fil de l'eau.
            <span style={{ display: 'block', marginTop: 6, color: T.deep, fontWeight: 600 }}>
              Le plus utile pour commencer : ajouter tes premiers articles ou tes
              premières prestations. C'est ce que tes clients viendront chercher.
            </span>
          </p>
        </div>
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

      {/* ─── LE SCORE, ET LA VICTOIRE QU'IL DOIT PERMETTRE ────────────────
          ⚠️ IL ÉTAIT IMPOSSIBLE D'ATTEINDRE 100 %. Dix points étaient donnés
          pour « au moins un article au menu », or aucun écran du signup ne
          permet d'en ajouter : le commerçant plafonnait à 90 % sans comprendre
          ce qui manquait, et terminait son inscription sur un échec.
          Le calcul vit désormais dans lib/score-onboarding.js, qui ne compte
          que ce qui est FAISABLE ICI, et qui retire les horaires de la liste
          quand ils ne concernent pas ce commerçant. Tout le monde peut donc
          arriver à 100 %. */}
      <Card titre="Où tu en es" sous={`Il t'en faut ${SEUIL_SOUMISSION} % pour envoyer ton dossier.`}>
        <ScoreBar score={score.pourcentage}/>

        {score.complet ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 12, padding: '12px 14px', marginTop: 14 }}>
            <span style={{ flexShrink: 0, marginTop: 1, color: '#065F46' }}><CheckCircle size={18} strokeWidth={2.4}/></span>
            <p style={{ margin: 0, fontSize: 12.5, color: '#065F46', fontWeight: 800, lineHeight: 1.5 }}>
              Ta fiche est complète. 🟣
              <span style={{ display: 'block', fontWeight: 500, marginTop: 3 }}>
                Tout y est, et tu peux envoyer ton dossier. Le reste, ton catalogue,
                tes créneaux, tes deals, t&apos;attend dans ton tableau de bord : tu
                l&apos;ajouteras tranquillement une fois ton compte validé.
              </span>
            </p>
          </div>
        ) : (
          <p style={{ fontSize: 11.5, color: T.muted, margin: '12px 0 0', lineHeight: 1.5 }}>
            {score.manquants.length === 1
              ? 'Il ne te manque plus qu’une chose : '
              : `Il te reste ${score.manquants.length} points à compléter, en commençant par le plus utile : `}
            <strong style={{ color: T.deep }}>{score.manquants[0]?.label.toLowerCase()}</strong>.
            {score.manquants[0]?.aide ? ` ${score.manquants[0].aide}` : ''}
          </p>
        )}

        {/* La liste vient de la règle : un critère qui ne concerne pas ce
            commerçant n'y figure pas du tout, au lieu de rester rouge à vie. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 14, fontSize: 12 }}>
          {score.criteres.map(c => (
            <ScoreItem key={c.cle} label={c.label} ok={c.atteint} pts={c.poids}/>
          ))}
        </div>
      </Card>


      {/* Boutique Yoppaa : Success Pack + Kits hardware + Consommables */}
      <Card titre="Boutique Yoppaa" sous="Du matériel et de l'accompagnement, si tu en veux.">

        {/* ⚠️ EN HAUT, ET PAS EN BAS. Le message « tu peux continuer sans rien
            ajouter » existait déjà, mais en italique gris sous la liste : il
            ressemblait à une note de bas de page, et on ne le lisait qu'après
            avoir fait défiler tous les produits. Un commerçant qui s'inscrit
            doit savoir AVANT de regarder les prix qu'il n'a rien à prendre. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <span style={{ flexShrink: 0, marginTop: 1, color: '#065F46' }}><Check size={17} strokeWidth={2.6}/></span>
          <p style={{ margin: 0, fontSize: 12.5, color: '#065F46', fontWeight: 700, lineHeight: 1.5 }}>
            Rien n’est obligatoire ici.
            <span style={{ display: 'block', fontWeight: 500, marginTop: 3 }}>
              Tu peux passer cette étape et continuer. Tout reste disponible dans ton
              tableau de bord, et tu commanderas le jour où tu en auras vraiment besoin.
            </span>
          </p>
        </div>

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
          <p style={{ fontSize: 12, color: T.muted, marginTop: 14, textAlign: 'center' }}>
            Rien de sélectionné, et c&apos;est très bien : continue.
          </p>
        )}

        <p style={{ fontSize: 10.5, color: T.muted, marginTop: 14, lineHeight: 1.5, textAlign: 'center' }}>
          Paiement sécurisé par Stripe. Tu retrouveras cette boutique dans ton tableau de bord, onglet Boutique Yoppaa.
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
              `Il te manque encore un peu : ${score.pourcentage} % sur les ${SEUIL_SOUMISSION} % attendus. Reviens aux étapes précédentes pour compléter.`
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
                : 'Démarrer mon essai gratuit →'
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

      {/* ⚠️ CE QU'IL Y A DANS LA BOÎTE, ÉNUMÉRÉ. Une phrase de résumé suffit à
          donner envie, jamais à décider : « imprimante + rouleaux » ne dit ni
          combien de rouleaux, ni pour combien de temps, ni ce qui est fait
          avant l'envoi. Un commerçant qui hésite sur 469 € a besoin de la
          liste, pas d'un argument. */}
      {Array.isArray(produit.contenu) && produit.contenu.length > 0 && (
        <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 3 }}>
          {produit.contenu.map((ligne, i) => (
            <li key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11.5, lineHeight: 1.45, color: actif ? 'rgba(255,255,255,0.9)' : T.deep }}>
              <span style={{ flexShrink: 0, marginTop: 1, color: actif ? T.light : produit.badgeColor }}>
                <Check size={12} strokeWidth={3}/>
              </span>
              <span>{ligne}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ⚠️ LA MENTION NE S'AFFICHAIT QUE SUR LES PRODUITS SECONDAIRES, et le
          24/08 elle a cessé d'être un simple avertissement de catégorie : elle
          porte désormais le rayon de 30 km, l'exigence d'un Kit Yoppaa et la
          porte de sortie si le réseau ne permet pas la visio. Cachée sur les
          produits PRINCIPAUX, elle laissait le commerçant acheter une
          prestation dont il ignorait les limites. */}
      {produit.mention && (
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
    // ⚠️ Le détail promettait une « réservation produit » qui n'existe pas.
    : categorie === 'detail'
      ? 'Vente en ligne : retrait en magasin ou expédition'
      : 'Commande à l’avance et livraison'

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
        'Un assistant qui rédige tes textes à ta place',
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
        'Paiement en ligne, sans commission Yoppaa',
        'Carte de fidélité, bons cadeaux, export comptable',
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
        }}>{estRegimeLancement()
          ? `Offert jusqu'au ${libelleDernierJourGratuit()}`
          : `${ESSAI_JOURS_MINIMUM} jours d'essai gratuit`}</p>
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
