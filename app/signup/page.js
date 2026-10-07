'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { marquerDeconnexionVoulue } from '@/lib/session-permanente'
import ChampAdresseOfficielle from '@/app/components/ChampAdresseOfficielle'
import { useRouter } from 'next/navigation'
import { PLAN_LABEL, plansDispoPourCategorie, getPrixPlan, TVA_ABONNEMENT_POURCENT } from '@/lib/plans'
import { scoreOnboarding } from '@/lib/score-onboarding'
import { ETAPES_INSCRIPTION, DERNIERE_ETAPE, etapeReprise } from '@/lib/etapes-inscription'
import { CGU_COMMERCANT_VERSION, LIEN_CGU_COMMERCANT } from '@/lib/cgu'
import { SHOP_PRODUCTS, classerProduitsParCategorie, prixProduitTexte } from '@/lib/produits-boutique'
import { FRAIS_STRIPE_TEXTE } from '@/lib/frais-paiement'
import { libelleBon } from '@/lib/bons-cadeaux'
// Icônes Lucide React : SVG inline alignés sur la charte canonique Yoppaa.
// Convention : stroke-width 1.8, currentColor pour hériter de la palette parent.
// Aucun emoji dans l'UI (règle Master), sauf exceptions soleil GMY + 🟣 signature.
import {
  Croissant, Scissors, ShoppingBag,
  User, Heart, Radio, Sun, Megaphone, Flame, AlertTriangle, Bell, Mail, Sparkles, BarChart3,
  ShoppingCart, Bike, Utensils, Calendar, Briefcase, Clock, Users, Package, CreditCard, Star, Download,
  Smartphone, Printer, FileText, Pencil, CheckCircle, Check, Circle, Shield, IdCard,
  MapPin, Gift, Sunset, Ticket,
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
import { euros } from '@/lib/montants'
import {
  avantLancement, estRegimeLancement, joursOffertsAuLancement,
  libelleFinEssaiLancement, libelleDernierJourGratuit, ESSAI_JOURS_MINIMUM,
  // L'ouverture à confirmer (30/09) : datée ou « très bientôt ».
  quandOuverture, depuisLOuverture,
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

// 🔴 TROIS ÉTAPES, PLUS CINQ (Alex, 06/10, tableau : « alléger le signup »).
// Les Visuels, les Horaires et la présentation se redemandaient ensuite au
// tableau de bord : le commerçant remplissait deux fois, et le score de 60
// exigeait photos, logo et horaires AVANT même que son compte soit ouvert. Ils
// vivent désormais au tableau de bord, où « fiche complète » les exige avant
// la PUBLICATION. L'inscription ne garde que ce qui sert à OUVRIR le compte :
// qui il est, et la vérification de son identité.
// La liste et la reprise vivent dans `lib/etapes-inscription.js` : l'admin
// et la relance lisent les mêmes étapes, et le banc les exécute.
const ETAPES = ETAPES_INSCRIPTION

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
            setEtape(etapeReprise(ob.etape_actuelle))
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
              if (res.onboarding) { setOnboarding(res.onboarding); setEtape(etapeReprise(res.onboarding.etape_actuelle)) }
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
            avancer={() => avancerVers(DERNIERE_ETAPE)}
            retour={() => avancerVers(1)}
          />
        )}
        {etape === DERNIERE_ETAPE && commercant && onboarding && (
          <EtapeVerification
            commercant={commercant}
            onboarding={onboarding}
            onUpdate={c => setCommercant(c)}
            onUpdateOb={ob => setOnboarding(ob)}
            onSaving={signalerSauvegarde}
            retour={() => avancerVers(2)}
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
  // Format du référentiel : "Rue X 12, 5640 Mettet" (et l'ancien format
  // Nominatim "Rue X 12, 5640 Mettet, Belgique", encore en base)
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
    // ⚠️ CETTE ERREUR N'ÉTAIT PAS LUE, ET ELLE A CACHÉ UN DÉFAUT ENTIER.
    // Le verrou posé sur `plan` le 26/08 refusait cette écriture : l'écran
    // passait quand même à l'étape suivante, avec en mémoire une formule que
    // la base n'avait jamais enregistrée. Le commerçant remplissait son
    // inscription complète en croyant avoir choisi Vendre, et se retrouvait
    // en Exister à l'arrivée, sans qu'aucun message ne soit passé.
    // Un `await` sans lecture de l'erreur n'est pas une écriture, c'est un
    // espoir.
    const { error: errPlan } = await supabase.from('commercants')
      .update({ categorie, plan, plan_actif_depuis: new Date().toISOString() })
      .eq('id', commercant.id)
    setLoading(false)
    if (errPlan) return setError(`Ta formule n'a pas pu être enregistrée : ${errPlan.message}`)
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

      {/* 🔴 CE QU'IL FAUT AVOIR SOUS LA MAIN, DIT AVANT DE COMMENCER (Alex,
          29/09). Le contrôle d'identité arrive à la DERNIÈRE étape et bloque
          l'envoi du dossier : un commerçant qui découvre là qu'il lui faut sa
          carte d'identité et son numéro d'entreprise s'arrête, et beaucoup ne
          reviennent pas. Le dire ici lui laisse le choix d'aller les chercher
          avant, plutôt que d'abandonner au bout de vingt minutes.
          ⚠️ LA LISTE EST CELLE QUE LE DOSSIER EXIGE (`kybManques`), rien de
          plus : pas de numéro de TVA à part, c'est le même que le numéro
          d'entreprise pour un commerce assujetti. */}
      <div role="note" style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 14, padding: '14px 16px', marginBottom: 22 }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', fontSize: 14, fontWeight: 900, color: '#78350F' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M14 10h4M14 14h3"/></svg>
          Avant de commencer, garde ceci sous la main
        </p>
        <ul style={{ margin: '0 0 8px', paddingLeft: 20, fontSize: 13, color: '#78350F', lineHeight: 1.6 }}>
          <li><strong>Ta carte d&rsquo;identité</strong> : on te demandera une photo du recto et du verso.</li>
          <li><strong>Ton numéro d&rsquo;entreprise (BCE)</strong>. C&rsquo;est aussi ton numéro de TVA si ton commerce y est assujetti.</li>
          <li><strong>Le nom et le prénom</strong> de la personne qui représente légalement le commerce.</li>
        </ul>
        <p style={{ margin: 0, fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
          Sans eux, tu ne pourras pas envoyer ton dossier. Tout ce que tu remplis est enregistré au fur et à mesure : tu peux t&rsquo;arrêter et reprendre plus tard.
        </p>
      </div>

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
                offertes <span style={{ color: T.light }}>{joursOffertsAuLancement()} jours</span> {depuisLOuverture()}, et le temps d’ici là pour tout préparer.
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
            {avantLancement() && ` L'app s'ouvre officiellement au public ${quandOuverture()} : ta page sera prête ce jour-là.`}
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
            Compte connecté : <strong>{session.user.email}</strong>
          </p>
        </Card>
      )}

      <Card titre="Ton activité">
        {/* 🔴 L'EXEMPLE EST CELUI D'ICONIC, PRESQUE MOT POUR MOT. Une boutique
            de vêtements inscrite en Alimentaire, parce qu'elle a lu « commande »
            et « livraison » sous ce titre et y a reconnu ce qu'elle voulait
            faire. Un commerçant qui se reconnaît dans cette phrase n'a plus
            besoin de lire la suite.
            ⚠️ ET ON NE PROMET PAS QU'IL POURRA CHANGER : vérifié le 21/09, la
            colonne `categorie` n'est écrite NULLE PART dans le tableau de bord.
            Seule l'équipe peut la corriger. */}
        <EncartChoix titre="Choisis d’après ce que tu vends">
          Une boutique de vêtements qui veut prendre des commandes et livrer choisit <strong>Détail</strong>,
          pas Alimentaire.
          <span style={{ display: 'block', marginTop: 6 }}>
            Ta catégorie décide des fonctions qui existeront chez toi, quelle que soit ta formule.
            Tu ne pourras pas la changer toi-même ensuite : en cas de doute, écris-nous à{' '}
            <a href="mailto:hello@yoppaa.app" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>hello@yoppaa.app</a>.
          </span>
        </EncartChoix>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {/* ⚠️ LES SOUS-TITRES NOMMENT UN MÉTIER, PLUS UNE CAPACITÉ. C'est là
              qu'ICONIC s'est perdue : « Commande à l'avance et livraison »
              décrivait ce qu'elle cherchait à faire, pas ce qu'elle vend. Les
              capacités restent dans les cartes de forfait, à leur place. */}
          <CategorieCard
            value="alimentaire"
            actif={categorie === 'alimentaire'}
            onClick={() => setCategorie('alimentaire')}
            titre="Alimentaire"
            sous="Tu vends à manger ou à boire"
            exemples="Boulangerie, friterie, traiteur, food truck, épicerie…"
            Icon={Croissant}
          />
          <CategorieCard
            value="vitrine"
            actif={categorie === 'vitrine'}
            onClick={() => setCategorie('vitrine')}
            titre="Service"
            sous="Tu reçois sur rendez-vous"
            exemples="Coiffeur, esthéticienne, garagiste, yoga, coach, auto-école…"
            Icon={Scissors}
          />
          <CategorieCard
            value="detail"
            actif={categorie === 'detail'}
            onClick={() => setCategorie('detail')}
            titre="Détail"
            sous="Tu vends des articles non alimentaires"
            exemples="Vêtements, chaussures, fleuriste, librairie, déco…"
            Icon={ShoppingBag}
          />
        </div>
      </Card>

      <Card titre="Choisis ta formule">
        {/* 🔴 IL RÉPOND À UNE PEUR, PAS À UNE QUESTION. Trois commerçants réels
            ont pris Exister en croyant se protéger d'un prélèvement, alors
            qu'ils voulaient vendre. On ne répond pas à une peur par un
            argumentaire : on donne le fait, AVANT les prix, et on nomme la
            sortie.
            ⚠️ ET LA DATE NE S'ÉCRIT PAS À LA MAIN. `libelleDernierJourGratuit`
            et `estRegimeLancement` descendent de `lib/lancement.js` : un
            8 janvier recopié ici finirait par contredire la facture, et le banc
            du lancement refuse les dates en dur depuis le 20/08. */}
        <EncartChoix titre="Prends la formule dont tu as besoin, pas la plus prudente">
          {estRegimeLancement()
            ? <>Jusqu’au {libelleDernierJourGratuit()} inclus, les trois formules sont gratuites et aucune carte ne t’est demandée.</>
            : <>Pendant tes {ESSAI_JOURS_MINIMUM} premiers jours, les trois formules sont gratuites et aucune carte ne t’est demandée.</>}
          <span style={{ display: 'block', marginTop: 6 }}>
            À la fin de l’essai, tu décides : tu continues, ou tu repasses en Exister, qui reste gratuite,
            et tu gardes ta fiche. Tu changes de formule quand tu veux depuis ton tableau de bord,
            dans un sens comme dans l’autre.
          </span>
        </EncartChoix>
        <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
          {plansDispos.map(p => (
            <CardPlan key={p} plan={p} categorie={categorie} actif={plan === p} onClick={() => setPlan(p)}/>
          ))}
        </div>
        {/* 🔴 ELLE PARLAIT DE PAIEMENT PILE AU MOMENT DE L'HÉSITATION (21/09).
            « La TVA sera ajoutée au moment du paiement » se lisait juste sous
            les trois cartes, à l'instant précis où le commerçant se demande si
            ça va lui coûter quelque chose. Le fait est vrai et doit rester,
            mais il se DATE : la TVA arrive sur la première facture, donc après
            l'essai. Et « selon ton statut et ton pays » était du bruit, Yoppaa
            n'ouvre qu'en Belgique. Le taux vient de `lib/plans.js`, source
            unique, jamais d'un 21 écrit à la main. */}
        <p style={{ fontSize: 11, color: T.muted, marginTop: 14, lineHeight: 1.5, textAlign: 'center' }}>
          Tous les tarifs sont HTVA. La TVA belge de {TVA_ABONNEMENT_POURCENT} % s’ajoutera sur la première facture,
          après l’essai.
        </p>
        {/* 🔴 LE KIT EST UNE OPTION, PAS UN PALIER (Alex, 22/09). Il ne monte
            sur aucune des trois cartes, et ce n'est pas un oubli : l'y écrire
            dirait « inclus avec Vendre », ce qui serait faux dans les deux sens
            puisqu'il n'est ni compris dans le forfait, ni réservé à celui-ci.
            La clé `hardware` de la matrice (lib/plans.js:243) n'est d'ailleurs
            lue par AUCUNE ligne de code : c'est la boutique qui le vend, à tous
            les paliers.
            ⚠️ ET LA PREMIÈRE PHRASE COMPTE AUTANT QUE LA SECONDE : un
            commerçant qui croit devoir acheter du matériel pour commencer ne
            s'inscrit pas. Le détail des kits et leurs prix restent dans le
            glossaire, juste en dessous. */}
        <p style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.5, textAlign: 'center' }}>
          Yoppaa fonctionne sur PC, Android et iPhone : <strong style={{ color: T.deep }}>aucun matériel n’est obligatoire</strong>.
          Le kit Yoppaa reste disponible en option, selon tes besoins.
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
        Déjà un compte ? <a href="/login" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>Se connecter</a>
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
      // 🔴 « PAR JOUR » ÉTAIT FAUX, ET C'EST LE FRÈRE DU DÉFAUT DU 22/09. La
      // carte Exister de cette même page l'annonçait aussi et a été corrigée ;
      // le glossaire, à quelques centimètres, continuait de promettre une actu
      // quotidienne. Le code plafonne à UNE par semaine calendaire depuis le
      // 01/07 (décision d'Alex contre la cannibalisation de Communiquer) :
      // le commerçant publiait sa deuxième actu et se heurtait au plafond sans
      // comprendre pourquoi.
      desc: 'Une nouvelle que tu publies : nouveau produit, événement, créneau libre. Exister : 1 actu basique par semaine, visible uniquement dans Good Morning Yoppers (pas de bandeau sur ta fiche). Communiquer / Vendre : actus enrichies illimitées (titre + photo + description longue), visibles sur ta fiche + push aux favoris.',
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
      // ⚠️ ELLE VIT DANS LA LISTE ALIMENTAIRE, ET NULLE PART AILLEURS. Un
      // vêtement ne périme pas, une tarte si : `anti_gaspi` est verrouillée sur
      // la catégorie alimentaire dans `lib/plans.js`, et cette liste est déjà
      // choisie par catégorie. La proposer ailleurs vendrait une fonction que
      // le commerçant ne verrait jamais apparaître.
      //
      // ⚠️ ON DIT « AVANT LA FERMETURE », le nom que le commerçant verra dans
      // son tableau de bord, pas « Rien ne se perd », qui est le nom côté
      // Yopper. Les deux vivent dans `lib/anti-gaspi.js` : c'est délibéré, et
      // annoncer le mauvais ferait chercher un onglet qui n'existe pas.
      Icon: Sunset, titre: 'Avant la fermeture',
      desc: 'Il te reste trois tartes à 17 h ? Tu les republies à prix réduit en trois gestes, pour ce soir seulement : ce qu\'il te reste, à quel prix, jusqu\'à quelle heure. Les habitants les voient apparaître dans « Rien ne se perd », sur leur accueil, et viennent les chercher sur un créneau comme n\'importe quelle commande. Ce qui ne se vend pas ne se jette pas.',
      plan: 'vendre',
    },
    {
      Icon: Utensils, titre: 'Réservation de table',
      // ⚠️ L'EMPREINTE EST ANNONCÉE ALORS QU'ELLE SE TERMINE (décision d'Alex,
      // 13/09 : « le module sera terminé avant l'ouverture de leurs comptes,
      // donc pas de problème »). C'est un ENGAGEMENT DE DATE, et il est écrit
      // ici pour que personne ne l'oublie : si le module glissait, c'est ce
      // texte qu'il faudrait corriger, pas l'inverse. Un restaurateur qui pense
      // « table qui ne vient pas » cherche cette ligne en premier ; c'est elle
      // qui décide de son abonnement.
      //
      // 🔴 L'ACOMPTE EN EST SORTI LE 14/09, ET IL NE REVIENDRA PAS. Un acompte
      // encaissé est un produit à déclarer, avec TVA et caisse certifiée belge.
      // Une empreinte non capturée n'est rien : c'est ce qui met le point
      // fiscal hors du chemin. Et on n'écrit jamais qu'une somme est bloquée,
      // parce qu'avec un `SetupIntent` rien ne l'est.
      desc: 'Pour les restaurateurs : tu déclares tes services et ta salle, et le Yopper réserve depuis ta fiche en choisissant son horaire et le nombre de personnes. Il dit combien ils sont, c’est ta salle qui attribue la table. Sur les grandes tables, tu peux demander une empreinte bancaire : la carte du client est enregistrée, rien n’est débité s’il vient, et l’absence se facture.',
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
      // ⚠️ LE MODULE ÉTAIT COMPLET ET NE FIGURAIT NULLE PART DANS CETTE LISTE.
      // « Cours collectifs » parle des PLACES d'un créneau, pas de la vente d'un
      // abonnement : un centre de yoga lisait les vingt-neuf fonctions sans
      // apprendre qu'il pouvait vendre sa carte de séances. C'est la troisième
      // fois qu'un module fini reste invisible, après le restaurant et les
      // invendus du soir.
      Icon: Ticket, titre: 'Abonnements et cartes de séances',
      desc: 'Tu vends une carte de séances ou un abonnement sur une période : tu fixes le nombre de séances, les dates de validité et le rythme autorisé. Ton élève paie une fois, puis réserve ses cours lui-même quand il veut, et son solde se décompte tout seul. Il voit ce qu’il lui reste, tu vois qui vient.',
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
      // 🔴 CE BADGE DISAIT « VENDRE » ET IL COÛTAIT 30 € PAR MOIS (22/09).
      // `PLAN_FEATURES.communiquer.fidelite` vaut `true` (lib/plans.js:179) et
      // la route du comptoir ne vérifie que le forfait
      // (app/api/fidelite/comptoir/route.js:98) : la carte au comptoir est
      // acquise dès Communiquer. Un commerçant qui ne voulait que ça lisait
      // « Inclus avec Vendre » et montait à 49,90 pour rien.
      //
      // ⚠️ LA DESCRIPTION DIT MAINTENANT LES DEUX NIVEAUX, parce que la
      // différence est réelle et qu'elle justifie Vendre : `fidelite_auto`
      // (lib/plans.js:239) est ce qui crédite sans qu'on tape quoi que ce soit.
      // ⚠️ LE BADGE EST SUR LA MÊME LIGNE QUE LE TITRE, et c'est pour qu'on
      // puisse le mesurer : `plan: 'communiquer'` apparaît sept fois dans ce
      // glossaire, donc une ancre de mutation posée dessus seule viserait une
      // autre entrée et ne prouverait rien.
      Icon: Star, titre: 'Carte de fidélité', plan: 'communiquer',
      desc: 'Tu fixes la règle, par exemple 10 € dépensés donnent 1 point, et ce que le client gagne au bout : une remise, un produit offert. Plus de carton perdu au fond d’un sac, tout se compte tout seul. Dès Communiquer, tu crédites au comptoir avec le numéro de GSM de ton client ; avec Vendre, chaque commande et chaque rendez-vous créditent tout seuls.',
    },
    {
      // ⚠️ Le module est complet depuis le 31/07 et n'apparaissait nulle part
      // dans le signup : un commerçant payait pour une fonction qu'il ignorait.
      // ⚠️ LE MOT SUIT LE MÉTIER DÈS L'INSCRIPTION, et c'est ici qu'il compte le
      // plus : le commerçant n'a encore rien vu de Yoppaa, il lit une liste de
      // fonctions pour décider s'il paie. Un frituriste à qui l'on propose des
      // « bons cadeaux » se dit que ce n'est pas pour lui et passe la ligne.
      Icon: Gift, titre: libelleBon(categorie, { pluriel: true, majuscule: true }),
      desc: `Tes clients achètent un ${libelleBon(categorie)} d’un montant qu’ils choisissent, à offrir. Le bénéficiaire le fait valoir chez toi, et le solde restant se garde pour la prochaine fois. Tu encaisses à l’achat du bon.`,
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
// - Nom, type, adresse (référentiel officiel BeSt depuis le 05/10), téléphone, description ≥20
// - Sauvegarde auto champ par champ (debounce 600ms)
// - Update onboarding_commercants.infos_ok = true quand tous les champs requis
function Etape2Infos({ commercant, onboarding, onUpdate, onUpdateOb, onSaving, avancer, retour }) {
  const [form, setForm] = useState({
    nom: commercant.nom === 'Mon commerce' ? '' : (commercant.nom || ''),
    type: commercant.type === 'À définir' ? '' : (commercant.type || ''),
    adresse: commercant.adresse || '',
    telephone: commercant.telephone || '',
    site_web: commercant.site_web || '',
    latitude: commercant.latitude,
    longitude: commercant.longitude,
  })
  // 🔴 LA PRÉSENTATION A QUITTÉ L'INSCRIPTION (Alex, 06/10, « alléger le
  // signup »). Elle bloquait déjà des commerçants le 29/09, et se redemandait
  // au tableau de bord : elle s'y écrit désormais, avec le même assistant
  // (`BoutonIaFiche`), et « fiche complète » l'exige avant la publication.
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef(null)
  // ⚠️ UN SIÈGE HORS WALLONIE N'A PAS DE POSITION, ET C'EST ADMIS (Alex, 05/10,
  // décision B) : le référentiel officiel ne couvre que la Wallonie, et le
  // siège ne sert qu'à valider le dossier. Le choix explicite « sans position »
  // du champ lève l'exigence de coordonnées ; une adresse tapée sans choix,
  // non.
  const [sansPositionAssumee, setSansPositionAssumee] = useState(false)

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
  // ⚠️ PLUS DE PRÉSENTATION À CETTE ÉTAPE (06/10, voir plus haut) : la
  // présentation bloquait déjà des commerçants ici le 29/09.
  const valide =
    form.nom.trim().length >= 2 &&
    form.type.trim().length > 0 &&
    form.adresse.trim().length > 0 &&
    form.telephone.trim().length >= 8 &&
    ((form.latitude && form.longitude) || sansPositionAssumee)

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
      site_web: values.site_web?.trim() || null,
      latitude: values.latitude || null,
      longitude: values.longitude || null,
    }
    const { data } = await supabase.from('commercants').update(payload).eq('id', commercant.id).select().single()
    if (data) onUpdate(data)
    setSaving(false); onSaving?.('saved')
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
        L’essentiel sur ton commerce
      </h1>
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 24px' }}>
        Quatre informations, et c’est tout pour l’instant. Ta présentation, tes photos et tes horaires
        se font ensuite depuis ton tableau de bord, à ton rythme.
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
          {/* 🔴 LE RÉFÉRENTIEL OFFICIEL, PLUS NOMINATIM (Alex, 05/10). Hors
              Wallonie, saisie libre sans position (décision B). */}
          <ChampAdresseOfficielle
            style={inputStyle()}
            valeur={form.adresse}
            position={form}
            libreHorsWallonie
            onChoisir={({ adresse, latitude, longitude }) => {
              setSansPositionAssumee(latitude === null || longitude === null)
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

      <Card titre="Site web" sous="Facultatif. Si tu en as un, l'assistant de ton tableau de bord s'en servira pour rédiger ta présentation.">
        <input type="url" inputMode="url" value={form.site_web}
          onChange={e => updateField('site_web', e.target.value)}
          placeholder="www.mon-commerce.be" style={inputStyle()}/>
        <p style={{ fontSize: 11, color: T.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
          Une page Facebook fait aussi l&rsquo;affaire. Rien du tout, c&rsquo;est très bien aussi.
        </p>
      </Card>

      <NavEtape retour={retourAvecSauvegarde} continuer={continuer} valide={valide} saving={saving}
        hint={valide ? null
          : (!form.adresse.trim() || ((!form.latitude || !form.longitude) && !sansPositionAssumee))
            ? 'Indique ton adresse : code postal, rue choisie dans la liste, puis « Utiliser cette adresse ».'
            : 'Complète tous les champs pour continuer.'}/>
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

// ─── ÉTAPE 5 : SUCCESS PACK + SOUMISSION ──────────────────────────────────────
// - Choix optionnel de matériel et d'accompagnement, lus dans le CATALOGUE
//   (lib/produits-boutique.js). ⚠️ Cette ligne annonçait « STARTER 49€ ou
//   PREMIUM 249€ » : deux packs qui n'existent plus depuis la refonte de la
//   gamme du 24/08, à des prix qui n'ont jamais été ceux d'aujourd'hui. Un
//   commentaire faux est plus coûteux qu'un commentaire absent : il fait
//   croire qu'on sait.
// - Soumission (statut = en_attente_validation + email Yoppaa via Resend)
// - 🔴 DEPUIS LE 06/10 : plus de score de 60 (il exigeait photos, logo et
//   horaires avant l'ouverture du compte). Le bouton attend la VÉRIFICATION
//   (KYB complet) et l'acceptation des CGU, rien d'autre. Le score reste
//   calculé pour l'admin (`validation_auto_score`), il ne bloque plus.
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
            Tout est prêt pour exister sur Yoppaa
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
        sans engagement, résiliable à tout moment. On te demandera de renseigner tes
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

function EtapeVerification({ commercant, onboarding, onUpdate, onUpdateOb, onSaving, retour, aller }) {
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

  // 🔴 LES CHOIX ENREGISTRÉS NE REVENAIENT PAS À L'ÉCRAN (26/08).
  //
  // Les cases se reconstituaient depuis `onboarding.success_pack_choisi`, un
  // champ LEGACY qui ne retient qu'une valeur, et seulement le Success Pack.
  // Un commerçant qui avait coché Kit Pro, rouleaux et mise en route
  // retrouvait l'écran VIDE : ses choix étaient pourtant bien en base, dans
  // `success_packs`, personne ne les relisait.
  //
  // Ce n'est pas un cas d'école : c'est le parcours de tout commerçant rejeté
  // au KYB qui corrige sa fiche et la renvoie. Il recochait, ou il repartait
  // sans son matériel.
  //
  // ⚠️ ON N'ÉCRASE JAMAIS UNE SÉLECTION EN COURS. Si la réponse arrive après
  // qu'il a coché quelque chose, on la laisse : reprendre la main sur des
  // cases qu'il vient de toucher serait pire que l'oubli qu'on répare.
  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session || annule) return
        const r = await fetch(`/api/accompagnement/souhaits?commercant_id=${commercant.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const j = await r.json()
        if (annule || !j?.ok || !Array.isArray(j.souhaites) || j.souhaites.length === 0) return
        setShopChoices(prev => (prev.size > 0 ? prev : new Set(j.souhaites)))
      } catch { /* la boutique reste vide : elle n'a rien d'obligatoire */ }
    })()
    return () => { annule = true }
  }, [commercant.id])

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
  // 🔴 LES CGU, COCHÉES ET PROUVÉES (Alex, 06/10). Rien ne les faisait
  // accepter : ni case ni trace. La case est obligatoire, et c'est le SERVEUR
  // qui enregistre l'acceptation (`/api/commercant/accepter-cgu`), avec son
  // heure, avant que le dossier parte.
  const [cguCochees, setCguCochees] = useState(false)
  const peutSoumettre = kybRempli && cguCochees

  async function soumettre() {
    if (!peutSoumettre || submitting) return
    setSubmitting(true)
    setError('')

    // 0) L'ACCEPTATION DES CGU D'ABORD : sans elle, le dossier ne part pas.
    try {
      const { data: { session: sCgu } } = await supabase.auth.getSession()
      const rCgu = await fetch('/api/commercant/accepter-cgu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sCgu?.access_token || ''}` },
        body: JSON.stringify({ commercant_id: commercant.id, version: CGU_COMMERCANT_VERSION }),
      })
      const jCgu = await rCgu.json().catch(() => ({}))
      if (!rCgu.ok || !jCgu?.ok) {
        setError(jCgu?.error || 'L’acceptation des conditions n’a pas pu être enregistrée. Réessaie.')
        setSubmitting(false)
        return
      }
    } catch {
      setError('L’acceptation des conditions n’a pas pu être enregistrée. Vérifie ta connexion et réessaie.')
      setSubmitting(false)
      return
    }

    // ⚠️ CE CHAMP EST UN VESTIGE, ET IL NE SERT PLUS QU'À L'ADMIN. Il ne retient
    // qu'une valeur, et seulement le Success Pack : c'est un drapeau, pas un
    // panier. Le panier complet part juste en dessous vers `success_packs`, et
    // c'est LUI qui fait foi.
    //
    // Le commentaire précédent annonçait des kits « collectés en local state,
    // persistés en S2b après migration DB » : c'est faux depuis le 24/08, ils
    // sont enregistrés par la route serveur. Un commentaire périmé sur ce qui
    // touche à l'argent finit par décider quelqu'un.
    const aSuccessPack = shopChoices.has('success_pack')

    // 1) Update commerçant : statut publication = brouillon → en_attente
    //    + kyb_statut = en_attente (S5 : Yoppaa doit valider la conformite KYB
    //    avant publication de la fiche). La fiche ne sera publiee que quand
    //    statut_publication='valide' ET kyb_statut='valide' (croisement).
    //    Et on efface le motif_rejet précédent : la re-soumission corrige
    //    forcément le problème, plus de raison d'afficher l'ancien motif.
    //
    // 🔴 LA FICHE D'ABORD, ET ON LIT SA RÉPONSE (07/10). Cette écriture venait
    // en troisième et personne n'écoutait son erreur : l'onboarding passait
    // « en attente de validation », le commerçant lisait « Demande envoyée ! »
    // (et le relisait à chaque retour, puisque `submitted` naît de l'onboarding),
    // pendant que sa fiche restait `brouillon` : absente des dossiers à valider,
    // et relancée le lendemain comme une inscription abandonnée.
    const { data: c, error: cErr } = await supabase.from('commercants')
      .update({
        statut_publication: 'en_attente',
        motif_rejet: null,
        kyb_statut: commercant.kyb_statut === 'valide' ? 'valide' : 'en_attente',
        kyb_motif_rejet: null,
      })
      .eq('id', commercant.id)
      .select()
      .single()
    if (cErr || !c) {
      setError('Ta demande n’a pas pu être envoyée. Vérifie ta connexion et réessaie.')
      setSubmitting(false)
      return
    }
    onUpdate(c)

    // 2) Update onboarding : statut + score + success_pack_choisi (legacy)
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

    // 3) LES CHOIX DE LA BOUTIQUE, ENREGISTRÉS PAR LE SERVEUR.
    //
    // ⚠️ CE BLOC ÉCRIVAIT DANS `success_packs` DEPUIS LE NAVIGATEUR, avec
    // `montant_ht: 199` EN DUR, et uniquement pour le Success Pack. Trois
    // défauts d'un coup :
    //   1) le montant venait du client, or RLS protège la LIGNE, jamais la
    //      VALEUR — la même leçon que la carte de fidélité, le matin même ;
    //   2) le 199 était figé et ne suivait plus le catalogue ;
    //   3) un commerçant qui cochait le Kit Pro voyait 469 €, un total, la
    //      mention « Paiement sécurisé par Stripe », et RIEN n'était gardé.
    //
    // ⚠️ ET IL NE PAIE PAS ICI (arbitrage d'Alex, option B, 24/08) : sa fiche
    // n'est pas validée, le matériel ne partirait pas et la prestation
    // n'aurait pas lieu. Il paiera depuis son tableau de bord une fois publié.
    // La règle « paiement avant la prestation » reste donc tenue.
    //
    // Non bloquant pour la soumission : perdre un souhait ne doit pas empêcher
    // une fiche de partir en validation. Il reste rattrapable d'un clic dans
    // le tableau de bord, où les mêmes produits sont proposés.
    try {
      const { data: { session: sSouhaits } } = await supabase.auth.getSession()
      await fetch('/api/accompagnement/souhaits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sSouhaits?.access_token || ''}`,
        },
        body: JSON.stringify({ commercant_id: commercant.id, produits: [...shopChoices] }),
      })
    } catch { /* voir ci-dessus : jamais bloquant */ }

    // 4) Email à Yoppaa via API route Resend (à implémenter — pour le MVP
    //    on log juste un avertissement console + on continue. Quand l'API
    //    /api/notify-yoppaa sera prête, on l'appelle ici.)
    // ⚠️ LE JETON EST OBLIGATOIRE DEPUIS LE 21/08. Sans lui, `/api/notify-yoppaa`
    // était un relais de courrier ouvert : n'importe qui choisissait le
    // destinataire ET le texte d'un email signé par notre domaine. Le nom, le
    // plan et l'adresse ne sont plus envoyés du tout, la route les relit en base.
    // 🔴 ON LIT LA RÉPONSE, ET ON RÉESSAIE UNE FOIS (16/09). Cet appel partait
    // dans un `try` vide : `fetch` ne lève pas sur un 403 ni sur un 500, donc
    // un échec ne déclenchait même pas le `catch`. Le commerçant voyait
    // « Demande envoyée ! », personne n'était prévenu, et il n'existait AUCUNE
    // trace de l'échec nulle part.
    //
    // ⚠️ ET CETTE ROUTE ENVOIE DEUX EMAILS : l'alerte à Yoppaa ET l'accusé de
    // réception au commerçant. Perdre l'appel, c'est aussi le laisser sans
    // trace écrite de sa demande.
    //
    // ⚠️ UN SEUL NOUVEL ESSAI, PAS UNE BOUCLE : on rattrape l'incident
    // passager, on n'insiste pas sur un refus qui se répétera à l'identique.
    // Le vrai filet est ailleurs, côté serveur : le rappel quotidien des
    // dossiers en attente, qui ne dépend d'aucun navigateur resté ouvert.
    const prevenirYoppaa = async () => {
      const { data: { session: s } } = await supabase.auth.getSession()
      const res = await fetch('/api/notify-yoppaa', {
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
      // 🔴 `fetch` NE LÈVE PAS SUR UN CODE HTTP. Sans cette lecture, un 403 ou
      // un 500 passait pour un succès.
      if (!res.ok) throw new Error(`notify-yoppaa ${res.status}`)
      return res
    }
    try {
      await prevenirYoppaa()
    } catch (e1) {
      try {
        await prevenirYoppaa()
      } catch (e2) {
        // ⚠️ ON NE BLOQUE PAS SA SOUMISSION : sa fiche est bien enregistrée et
        // attend la validation, l'email n'y change rien. Mais l'échec cesse
        // d'être invisible, et le rappel quotidien le rattrapera côté serveur.
        console.error('[signup] Yoppaa n a pas pu etre prevenu', e2?.message || e1?.message)
      }
    }

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
          On valide ton profil <strong style={{ color: T.bgPanel }}>sous 24 h ouvrées</strong>. Tu recevras un email dès que ton tableau de bord sera ouvert.
        </p>
        <Card titre="Récapitulatif">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13, color: T.deep, lineHeight: 1.9 }}>
            <li><strong>Commerce :</strong> {commercant.nom}</li>
            <li><strong>Plan choisi :</strong> {PLAN_LABEL[commercant.plan]}</li>
            {[...shopChoices].map(type => {
              const p = SHOP_PRODUCTS.find(p => p.type === type)
              if (!p) return null
              return <li key={type}><strong>{p.label} :</strong> {euros(p.prix)} HTVA</li>
            })}
            {shopChoices.size > 0 && <li style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.hairline}` }}><strong>Total boutique :</strong> {euros(totalChoisis)} HTVA</li>}
          </ul>
        </Card>
        <div style={{ background: T.pale, borderRadius: 14, padding: '14px 16px', marginTop: 16, textAlign: 'left' }}>
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: T.deep }}>
            Et après, qu'est-ce qui t'attend ?
          </p>
          <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
            Dès que ton profil est validé, ton tableau de bord s'ouvre. Tu y complètes
            ta fiche : au moins 3 articles ou prestations, 2 photos, ton logo, ta
            présentation, tes horaires et un moyen d'encaisser. Quand tout est prêt,
            tu demandes sa mise en ligne et on la publie.
            <span style={{ display: 'block', marginTop: 6, color: T.deep, fontWeight: 600 }}>
              Le plus utile pour commencer : ajouter tes articles ou tes
              prestations. C'est ce que tes clients viendront chercher.
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
        Dernière étape&nbsp;: vérification
      </h1>
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 18px' }}>
        On vérifie que ton entreprise est bien la tienne, puis tu envoies ta demande d&rsquo;activation.
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
            {/* ⚠️ UNE SEULE ÉTAPE À CORRIGER DEPUIS LE 06/10 : les visuels et
                les horaires se règlent au tableau de bord, plus ici. */}
            {[
              { n: 2, Icon: Pencil,  label: 'L’essentiel' },
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
          <>
            <div style={{ marginTop: 14, padding: '12px 14px', background: T.bgPanel, borderRadius: 12, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {shopChoices.size} produit{shopChoices.size > 1 ? 's' : ''} sélectionné{shopChoices.size > 1 ? 's' : ''}
              </span>
              <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.3px' }}>
                Total : {euros(totalChoisis)} HTVA
              </span>
            </div>
            {/* ⚠️ CE TOTAL S'AFFICHAIT SANS DIRE CE QU'IL DEVENAIT, juste
                au-dessus d'un « Paiement sécurisé par Stripe » qui laissait
                croire à un débit imminent. Rien n'était pourtant ni facturé ni
                même enregistré pour les kits. On dit maintenant les deux
                choses : ce n'est pas payé, et voilà quand ça le sera. */}
            <p style={{ margin: '10px 0 0', fontSize: 11.5, fontWeight: 600, color: '#065F46', background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 10, padding: '10px 12px', lineHeight: 1.55 }}>
              Rien n&rsquo;est débité maintenant. On garde ton choix de côté, et tu le règles
              depuis ton tableau de bord quand ta fiche est validée : ton matériel part
              à ce moment-là, pas avant.
            </p>
          </>
        ) : (
          <p style={{ fontSize: 12, color: T.muted, marginTop: 14, textAlign: 'center' }}>
            Rien de sélectionné, et c&apos;est très bien : continue.
          </p>
        )}

        <p style={{ fontSize: 10.5, color: T.muted, marginTop: 14, lineHeight: 1.5, textAlign: 'center' }}>
          Tu retrouveras cette boutique dans ton tableau de bord, onglet Boutique Yoppaa, avec le paiement sécurisé par Stripe.
        </p>
      </Card>

      {/* 🔴 LES CONDITIONS, COCHÉES ET PROUVÉES (06/10). Le lien ouvre la
          page légale dans un nouvel onglet : on ne perd pas son inscription
          pour les lire. */}
      <Card titre="Conditions d’utilisation">
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13, color: T.ink, lineHeight: 1.5 }}>
          <input type="checkbox" checked={cguCochees} onChange={e => setCguCochees(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 1, accentColor: T.main, flexShrink: 0, cursor: 'pointer' }}/>
          <span>
            J’ai lu et j’accepte les{' '}
            <a href={LIEN_CGU_COMMERCANT} target="_blank" rel="noopener noreferrer"
              style={{ color: T.main, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              conditions générales d’utilisation pour les commerçants
            </a>
            , y compris les frais de paiement et les règles de remboursement.
          </span>
        </label>
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
              'Coche la case des conditions d’utilisation pour envoyer ta demande.'
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
            {euros(produit.prix)}
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

// 🔴 CE QUE LE CHOIX ENGAGE, LÀ OÙ IL SE FAIT (21/09, demandé par Alex).
//
// Deux erreurs réelles ont motivé cet encart, et les deux venaient du même
// endroit : l'information existait, dans le sous-titre de la carte, en 12 px
// gris, c'est-à-dire à l'endroit où personne ne lit.
//
//   - Trois commerçants ont choisi Exister alors qu'ils voulaient vendre,
//     « de peur que ça ne soit pas gratuit ».
//   - ICONIC, boutique de vêtements, a choisi la catégorie Alimentaire : elle a
//     lu « Commande à l'avance et livraison » sous ce titre, y a reconnu ce
//     qu'elle voulait FAIRE, et a cliqué. Le sous-titre promettait une capacité
//     là où il devait nommer un métier.
//
// ⚠️ IL REMPLACE LE SOUS-TITRE, IL NE S'AJOUTE PAS. Deux blocs de plus sur un
// écran d'inscription déjà long feraient un mur, et un mur ne se lit pas mieux
// qu'une ligne grise. Les deux `Card` concernées perdent donc leur `sous`.
function EncartChoix({ titre, children }) {
  return (
    <div style={{
      background: '#F8F6FF', border: `1px solid ${T.pale}`, borderRadius: 12,
      padding: '11px 13px', marginBottom: 14,
    }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: T.deep, margin: '0 0 5px', lineHeight: 1.35 }}>{titre}</p>
      <div style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.55 }}>{children}</div>
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

// 🔴 CE QUI TUE LA PEUR, ET C'EST LA PHRASE LA PLUS IMPORTANTE DE L'ÉCRAN.
// Constat d'Alex le 21/09 : « ils veulent du Vendre offert jusqu'au 8 janvier
// mais ils choisissent Exister de peur que ça ne soit pas gratuit ». Leur peur
// était infondée et c'est CET écran qui la fabriquait : seule la carte Exister
// portait « Aucune information de paiement demandée », donc par contraste les
// deux autres avaient l'air d'en demander une. Aucune carte n'est demandée sur
// aucun des trois, ni ici ni au tableau de bord (`payment_method_collection:
// 'if_required'`).
//
// ⚠️ ELLE NOMME LA SORTIE, ET C'EST TOUT LE SUJET. « Sans engagement,
// résiliable en 1 clic » est du vocabulaire d'abonnement : il suppose justement
// l'abonnement qui fait peur. Ce qui rassure, c'est de savoir ce qui arrive si
// on ne veut plus : on repasse en Exister, et la fiche reste. C'est exactement
// ce que fait `cron/billing-relances` après ses trois relances.
const NOTE_SANS_CARTE = 'Aucune carte demandée. À la fin de l\'essai, tu décides : tu continues, ou tu repasses en Exister et tu gardes ta fiche.'

// Cards plan refondues 16/06 (S1) : 3 paliers Yoppaa avec features cohérentes
// avec lib/plans.js (source unique). Features varient légèrement selon la
// catégorie pour les plans "Vendre" (RDV vs Click&Collect).
function CardPlan({ plan, categorie, actif, onClick }) {
  const p = getPrixPlan(plan)
  const label = PLAN_LABEL[plan]
  if (!p) return null

  // ─── CE QUE CHAQUE FORFAIT DONNE VRAIMENT (22/09, audit demandé par Alex) ──
  //
  // 🔴 LA MATRICE TRANCHE, PAS LA LANDING. Alex a demandé d'aligner ces cartes
  // sur celles de la page d'accueil, et un audit des trois sources a montré que
  // ni l'une ni l'autre ne pouvait servir de référence :
  //
  //   - le signup CACHAIT `fidelite` à Communiquer, qui la paie, et la carte
  //     Vendre se l'attribuait. Un commerçant qui voulait juste une carte au
  //     comptoir croyait devoir payer 49,90 au lieu de 19,90 ;
  //   - le signup annonçait le Good Morning « chaque jour » en Exister, alors
  //     que `ConfigDashboard.js:2989` plafonne à UNE actu par semaine
  //     calendaire, décision d'Alex du 01/07 contre la cannibalisation ;
  //   - la landing, elle, promet des push « aux habitants de ta commune » quand
  //     le code ne connaît que `push_cibles_favoris`, et se contredit 130
  //     lignes plus loin. On ne l'a donc PAS recopiée.
  //
  // ⚠️ ET ON NE VEND AUCUNE CLÉ MORTE. `newsletter_ciblee`,
  // `segmentation_favoris`, `ia_bridee`, `ia_avancee` et `hardware` valent
  // `true` dans la matrice et ne sont lues par AUCUNE ligne de code. Décision
  // d'Alex du 22/09 : on les tait ici, sans toucher à `lib/plans.js`.

  // 🔴 DEUX LIGNES VARIENT, PAS UNE, et c'est ce qui évite de promettre une
  // réservation de table à un coiffeur. Les six fonctions de métier sont
  // verrouillées par `canDoAvecCategorie` (lib/plans.js:410-411) : aucune ne
  // doit jamais passer en ligne fixe.
  //
  // ⚠️ LA VENTE EN LIGNE, ELLE, N'EST PAS VERROUILLÉE PAR LE MÉTIER. La fiche
  // publique décide avec `canDo(forfait, 'commande')`, sans la catégorie
  // (app/commander/[slug]/page.js:3305) : Le Dressing de Sophie vend déjà en
  // ligne aujourd'hui. Décision d'Alex du 22/09 : c'est le code qui tourne qui
  // fait foi, et les trois métiers l'annoncent avec leur propre mot.
  const VENDRE_VENTE = categorie === 'vitrine'
    ? 'Rendez-vous en ligne, réservables 24 h sur 24'
    : categorie === 'detail'
      // ⚠️ « EXPÉDITION », PAS « ENVOI », ET UNE GARDE ME L'A APPRIS. C'est le
      // mot de la colonne `boutique_mode_vente`, qui vaut `retrait`,
      // `expedition` ou `les_deux`, et c'est aussi celui de la landing.
      // `verif:plans` exige la formule exacte depuis le jour où le signup
      // promettait une « réservation produit » qui n'a jamais existé.
      ? 'Vente en ligne : retrait en magasin ou expédition'
      : 'Commande à l’avance : retrait ou livraison'

  const VENDRE_MODULE = categorie === 'vitrine'
    ? 'Abonnements et cartes de séances, plusieurs praticiens'
    : categorie === 'detail'
      ? 'Tes articles avec leurs tailles et leurs couleurs'
      : 'Réservation de table, et tes invendus du soir'

  const PLAN_CONFIG = {
    exister: {
      tagline: 'Ton commerce existe en ligne, sans rien débourser',
      essai: false,
      features: [
        'Ta fiche : photos illimitées, horaires détaillés, tes prix',
        'Référencée sur Google et retrouvée dans l’app',
        // 🔴 « CHAQUE JOUR » ÉTAIT FAUX. Une actu par semaine calendaire en
        // Exister, et c'est voulu : voir le commentaire en tête.
        'Une actu par semaine, publiée dans le Good Morning de ta commune',
        'Favoris et signaux : le quartier te dit ce qu’il cherche',
        'Tes statistiques : vues, favoris, signaux',
      ],
      note: 'Aucune information de paiement demandée',
    },
    communiquer: {
      tagline: 'Ta commune entend parler de toi chaque matin',
      essai: true,
      features: [
        'Tout Exister, plus :',
        'Actus illimitées, deals, Bonnes affaires',
        'Alertes urgentes sur ta fiche : fermeture, rupture',
        'Ta place chaque matin dans le Good Morning, en priorité',
        // ⚠️ « à tes favoris », jamais « à ta commune » : le code ne sait
        // toucher que ceux qui t'ont mis en favori.
        'Push à tes favoris, autant que tu veux',
        // 🔴 LA LIGNE QUI MANQUAIT, ET QUI COÛTAIT 30 € PAR MOIS AU COMMERÇANT.
        'Carte de fidélité au comptoir : le GSM de ton client suffit',
        'Tes statistiques détaillées : audience et engagement',
        'Un assistant qui rédige tes textes',
      ],
      note: NOTE_SANS_CARTE,
    },
    vendre: {
      tagline: 'Pour transactionner et fidéliser',
      essai: true,
      recommande: true,
      features: [
        'Tout Communiquer, plus :',
        VENDRE_VENTE,
        VENDRE_MODULE,
        // ⚠️ LE COMPTOIR AUSSI, et il n'était écrit nulle part : `paiement_cash`
        // (lib/plans.js:236) existe pour de vrai. Un commerçant qui n'encaisse
        // qu'à la remise croyait que Vendre ne servait qu'au paiement en ligne.
        'Paiement en ligne ou au comptoir, sans commission Yoppaa',
        // 🔴 CE QUE VENDRE AJOUTE VRAIMENT À LA FIDÉLITÉ. Communiquer a déjà la
        // carte au comptoir ; ici c'est `fidelite_auto` (lib/plans.js:239) :
        // chaque vente et chaque rendez-vous créditent sans geste.
        'La fidélité se crédite toute seule à chaque vente',
        `${libelleBon(categorie, { pluriel: true, majuscule: true })} à offrir, et export comptable`,
      ],
      note: NOTE_SANS_CARTE,
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
        {/* 🔴 LE PRIX S'EFFACE TANT QUE L'ESSAI COURT (21/09). Il s'affichait en
            16 px poids 900, et « Offert jusqu'au 8 janvier » en 11 px sous la
            tagline : l'œil tombait sur 49,90 € et jamais sur l'offre. Le mot
            « puis » fait tout le travail, parce qu'il dit à lui seul que ce
            n'est pas maintenant. Le montant reste lisible, il n'est pas caché :
            une offre qui masque son prix se paie en méfiance. */}
        {p.mensuel === 0 ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: actif ? T.light : T.main }}>Gratuit à vie</span>
        ) : cfg.essai ? (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: actif ? T.light : T.muted }}>
            puis {euros(p.mensuel)} HTVA/mois
          </span>
        ) : (
          <span style={{ fontSize: 16, fontWeight: 900, color: actif ? '#fff' : T.ink }}>
            {euros(p.mensuel)}<span style={{ fontSize: 11, fontWeight: 600, color: actif ? T.light : T.muted, marginLeft: 2 }}>HTVA/mois</span>
          </span>
        )}
      </div>

      <p style={{ fontSize: 12, color: actif ? T.light : T.main, fontWeight: 700, margin: '0 0 10px' }}>
        {cfg.tagline}
      </p>

      {/* La pastille prend la place que le prix occupait : c'est elle que le
          commerçant doit lire en premier sur un forfait payant. */}
      {cfg.essai && (
        <p style={{
          fontSize: 12.5, fontWeight: 800,
          color: actif ? '#fff' : '#065F46',
          background: actif ? 'rgba(255,255,255,0.12)' : '#ECFDF5',
          padding: '5px 11px', borderRadius: 100, display: 'inline-block',
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

      {/* ⚠️ LA NOTE DU FORFAIT PAYANT N'EST PAS UNE NOTE DE BAS DE PAGE. En
          10,5 px gris italique, la seule phrase qui lève l'hésitation se lisait
          comme une mention légale, donc ne se lisait pas. Elle garde sa place,
          elle change de poids. Celle d'Exister reste discrète : elle confirme
          une gratuité que personne ne met en doute. */}
      <p style={{
        fontSize: cfg.essai ? 11.5 : 10.5,
        color: actif ? (cfg.essai ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.65)') : (cfg.essai ? T.deep : T.muted),
        fontWeight: cfg.essai ? 600 : 400,
        fontStyle: cfg.essai ? 'normal' : 'italic',
        lineHeight: 1.45, margin: 0,
      }}>
        {cfg.note}
      </p>
    </button>
  )
}
