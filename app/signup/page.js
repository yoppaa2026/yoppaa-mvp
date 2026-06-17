'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { PLAN_LABEL, PLANS, plansDispoPourCategorie, getPrixPlan } from '@/lib/plans'

// Types de commerce séparés par catégorie : la liste affichée à l'étape 2
// dépend du choix fait à l'étape 1 (alimentaire vs vitrine).
const TYPES_ALIMENTAIRE = [
  'Boulangerie', 'Pâtisserie', 'Chocolatier', 'Sandwicherie', 'Snack',
  'Friterie', 'Pizzeria', 'Coffee shop', 'Épicerie', 'Traiteur',
  'Boucherie', 'Food truck', 'Distributeur automatique', 'Autre alimentaire',
]
// Vitrine = commerces de SERVICES (RDV : coiffeur, esthéticienne, garagiste…)
const TYPES_VITRINE = [
  'Coiffeur', 'Barbier', 'Esthéticienne', 'Opticien', 'Pharmacie',
  'Pressing', 'Garagiste', 'Toiletteur', 'Tatoueur', 'Studio photo',
  'Salle de sport', 'Cours / coaching', 'Autre service',
]

// Detail = commerces de PRODUITS NON ALIMENTAIRES (réservation produit / retrait)
const TYPES_DETAIL = [
  'Vêtements', 'Chaussures', 'Bijouterie', 'Fleuriste', 'Librairie',
  'Décoration / maison', 'Sport / équipement', 'Loisirs créatifs', 'Jouets',
  'Électroménager', 'Autre détail',
]

function typesPourCategorie(categorie) {
  if (categorie === 'vitrine') return TYPES_VITRINE
  if (categorie === 'detail')  return TYPES_DETAIL
  return TYPES_ALIMENTAIRE
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
            <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.05em', color: '#fff', lineHeight: 1, margin: 0 }}>yoppaa</p>
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
        {etape === 2 && commercant && (
          <Etape2Infos
            commercant={commercant}
            onboarding={onboarding}
            onUpdate={c => setCommercant(c)}
            onUpdateOb={ob => setOnboarding(ob)}
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
            retour={() => avancerVers(4)}
            aller={n => avancerVers(n)}
          />
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

  const dejaConnecte = !!session
  const plansDispos = plansDispoPourCategorie(categorie)

  // Si la catégorie change et que le plan choisi n'est plus dispo, on redescend
  // automatiquement sur le plan le plus haut dispo (FULL pour les 2 catégories).
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
      categorie,
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

  // Si déjà connecté, juste mettre à jour catégorie + plan choisi
  async function mettreAJourPlan() {
    setLoading(true)
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
            La formule <span style={{ color: T.light }}>Exister</span> est gratuite à vie. <span style={{ color: T.light }}>Communiquer</span> et <span style={{ color: T.light }}>Vendre</span> incluent 30 jours d'essai gratuit.
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
            icone="🥐"
          />
          <CategorieCard
            value="vitrine"
            actif={categorie === 'vitrine'}
            onClick={() => setCategorie('vitrine')}
            titre="Service"
            sous="Vitrine en ligne + prise de RDV"
            exemples="Coiffeur, opticien, esthéticienne, garagiste…"
            icone="💇"
          />
          <CategorieCard
            value="detail"
            actif={categorie === 'detail'}
            onClick={() => setCategorie('detail')}
            titre="Détail"
            sous="Réservation produit, retrait"
            exemples="Vêtements, chaussures, fleuriste, librairie…"
            icone="🛍️"
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
  // Qui est un Yopper, qu'est-ce qu'un signal, un favori, GMY, etc.
  const fondamentaux = [
    {
      icone: '👤', titre: 'Yopper',
      desc: 'C\'est ton client final : un habitant du quartier qui utilise l\'application Yoppaa pour découvrir, suivre et soutenir les commerces autour de lui. Les Yoppers voient ta fiche, te mettent en favori, reçoivent tes actus selon leurs préférences.',
      plan: 'exister',
    },
    {
      icone: '❤️', titre: 'Favori',
      desc: 'Quand un Yopper te met en favori, il choisit de te suivre. Il reçoit alors tes actus, tes deals et tes notifications selon ton plan. Tu vois combien de Yoppers t\'ont mis en favori dans tes statistiques.',
      plan: 'exister',
    },
    {
      icone: '📡', titre: 'Signal',
      desc: 'Un Yopper t\'envoie un signal pour te dire qu\'il est intéressé sans encore commander : "j\'aimerais ce produit", "je passerais bien demain", "tenez-moi au courant". Tu reçois ces signaux dans ton tableau de bord et tu peux y répondre.',
      plan: 'exister',
    },
    {
      icone: '☀️', titre: 'Good Morning Yoppers',
      desc: 'Push notification quotidien envoyé chaque matin à 7h30 aux Yoppers de ta zone. Avec Exister, tu y apparais automatiquement. Avec Communiquer et Vendre, tu peux y faire remonter tes deals, actus et créneaux du jour.',
      plan: 'exister',
    },
    {
      icone: '📢', titre: 'Actualité',
      desc: 'Une nouvelle que tu publies : nouveau produit, événement, créneau libre, etc. Affichée en bandeau sur ta fiche et envoyée aux Yoppers qui t\'ont mis en favori. Exister : 1 actu visible dans Good Morning Yoppers. Communiquer/Vendre : actus illimitées avec push ciblé.',
      plan: 'communiquer',
    },
    {
      icone: '🔥', titre: 'Deal',
      desc: 'Une promotion limitée dans le temps. Visible sur ta fiche et poussée aux Yoppers favoris. Catégorisée "Bonne affaire" si tu coches l\'option.',
      plan: 'communiquer',
    },
    {
      icone: '🚨', titre: 'Alerte',
      desc: 'Information urgente : fermeture exceptionnelle, rupture, indisponibilité. Bandeau rouge prioritaire sur ta fiche, push immédiat aux Yoppers favoris.',
      plan: 'communiquer',
    },
    {
      icone: '🔔', titre: 'Push ciblé',
      desc: 'Notification push envoyée uniquement aux Yoppers qui t\'ont mis en favori. Tu choisis quand l\'envoyer et tu peux segmenter par centre d\'intérêt.',
      plan: 'communiquer',
    },
    {
      icone: '💌', titre: 'Newsletter',
      desc: 'Email envoyé à tes Yoppers favoris, avec segmentation possible (par catégorie, par ancienneté, par engagement). Idéale pour les communications plus longues qu\'un push.',
      plan: 'communiquer',
    },
    {
      icone: '🤖', titre: 'IA Yoppaa',
      desc: 'Communiquer : IA bridée qui reformule tes textes, suggère des idées d\'actus et corrige tes fautes. Vendre : IA avancée qui rédige des textes complets, segmente automatiquement tes Yoppers et analyse tes performances.',
      plan: 'communiquer',
    },
    {
      icone: '📊', titre: 'Statistiques',
      desc: 'Exister : compteur vues, favoris, signaux. Communiquer : engagement push, taux d\'ouverture, performance newsletter. Vendre : suivi conversion complet, ROI par action.',
      plan: 'exister',
    },
  ]

  // ─── Section 2 : Fonctions transactionnelles (selon catégorie) ───────────
  // Seulement débloquées avec le plan Vendre.
  const featuresAlimentaire = [
    {
      icone: '🛒', titre: 'Click & Collect',
      desc: 'Le Yopper commande tes produits à l\'avance et choisit son créneau de retrait. Tu reçois la commande dans ton dashboard, tu valides, tu marques prête. C\'est le cœur de l\'expérience Yoppaa alimentaire.',
      plan: 'vendre',
    },
    {
      icone: '🚴', titre: 'Livraison',
      desc: 'Module complet : zone géographique configurable, frais paramétrables, créneaux dédiés à la livraison, suivi de la commande côté Yopper.',
      plan: 'vendre',
    },
    {
      icone: '🍽️', titre: 'Réservation de table',
      desc: 'Pour les restaurateurs : tes Yoppers réservent leur table directement depuis ta fiche, choisissent l\'horaire et le nombre de personnes.',
      plan: 'vendre',
    },
  ]

  const featuresVitrine = [
    {
      icone: '📅', titre: 'Module RDV natif',
      desc: 'Le Yopper choisit une prestation, une date et un créneau, valide en 3 clics. Tu reçois la notification dans ton dashboard. Fichier iCal joint à son email pour son calendrier. Aucune commission.',
      plan: 'vendre',
    },
    {
      icone: '🧰', titre: 'Prestations',
      desc: 'Catalogue de tes services : nom, durée (15 min à 3h), prix fixe ou fourchette, acompte optionnel. Modifiable à tout moment depuis ton dashboard.',
      plan: 'vendre',
    },
    {
      icone: '⏰', titre: 'Créneaux RDV',
      desc: 'Tu définis tes plages horaires par jour de la semaine, avec pause déjeuner si tu veux. Pas configurable (15 min, 30 min, 1h). Exceptions ponctuelles supportées.',
      plan: 'vendre',
    },
    {
      icone: '👥', titre: 'Multi-praticiens',
      desc: 'Tu ajoutes tes praticiens avec photo et spécialités. Chaque RDV est associé à une personne. Planning et statistiques par praticien. Le Yopper peut choisir ou laisser "Premier disponible".',
      plan: 'vendre',
    },
  ]

  const featuresDetail = [
    {
      icone: '📦', titre: 'Réservation produit',
      desc: 'Le Yopper réserve un article à venir chercher en magasin. Tu le mets de côté, tu reçois la notification, tu confirmes la disponibilité. Parfait pour vêtements, livres, fleurs, etc.',
      plan: 'vendre',
    },
  ]

  // ─── Section 3 : Communes aux plans payants ──────────────────────────────
  const featuresVendre = [
    {
      icone: '💳', titre: 'Paiement en ligne',
      desc: 'Stripe Connect intégré : ton Yopper paie son acompte ou sa commande directement sur ta fiche. Aucune commission Yoppaa. Tu reçois ton argent sur ton compte bancaire.',
      plan: 'vendre',
    },
    {
      icone: '⭐', titre: 'Fidélité configurable',
      desc: 'Programme à points entièrement paramétrable : règle de gain (X € = Y points), seuils de récompense, type de récompense (% de remise, produit offert). Analytics fidélité dans ton tableau de bord.',
      plan: 'vendre',
    },
    {
      icone: '📤', titre: 'Export comptable',
      desc: 'Exporte tes ventes, RDV ou réservations en CSV ou PDF mensuel pour ta comptabilité. Conservation des données 7 ans (loi belge).',
      plan: 'vendre',
    },
  ]

  // ─── Section 4 : Hardware et accessoires (optionnels) ────────────────────
  const featuresHardware = [
    {
      icone: '📱', titre: 'Compatibilité Android & iOS',
      desc: 'Ton tableau de bord Yoppaa fonctionne sur n\'importe quel téléphone, tablette ou ordinateur. Android, iPhone, iPad, Mac, PC : pas besoin de matériel spécifique pour démarrer.',
      plan: 'exister',
    },
    {
      icone: '🖨️', titre: 'Kit Yoppaa hardware',
      desc: 'Optionnel et disponible à tout moment : imprimante thermique pour imprimer les tickets de commande ou de RDV. Pratique en boutique alimentaire ou en commerce de détail avec retraits fréquents. Détail des kits dans ta boutique Yoppaa.',
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
          {features.map(f => (
            <div key={f.titre} style={{ display: 'flex', gap: 10, paddingTop: 12, borderBottom: `1px dashed ${T.hairline}`, paddingBottom: 12 }}>
              <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.3, marginTop: 1 }}>{f.icone}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: 0 }}>{f.titre}</p>
                <p style={{ fontSize: 12, color: T.deep, margin: '3px 0 0', lineHeight: 1.5 }}>{f.desc}</p>
                {f.plan && <BadgePlan plan={f.plan} />}
              </div>
            </div>
          ))}
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
function Etape2Infos({ commercant, onboarding, onUpdate, onUpdateOb, avancer, retour }) {
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
    setSaving(true)
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
    setSaving(false)
  }

  // Autocomplete Nominatim (Belgique en priorité)
  async function chercherAdresse(query) {
    if (!query || query.length < 3) { setSuggestions([]); return }
    setSearchingAdresse(true)
    clearTimeout(nominatimRef.current)
    nominatimRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=fr&countrycodes=be`, {
          headers: { Accept: 'application/json' },
        })
        const data = await res.json()
        setSuggestions(data || [])
      } catch { setSuggestions([]) }
      setSearchingAdresse(false)
    }, 400)
  }

  function choisirSuggestion(s) {
    const adresse = s.display_name.split(',').slice(0, 3).join(', ')
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
          <select value={form.type} onChange={e => updateField('type', e.target.value)} style={{ ...inputStyle(), cursor: 'pointer' }}>
            <option value="">— Choisir un type —</option>
            {typesPourCategorie(commercant.categorie).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
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

      <NavEtape retour={retour} continuer={continuer} valide={valide} saving={saving} hint={valide ? null : 'Complète tous les champs pour continuer.'}/>
    </div>
  )
}

// ─── ÉTAPE 3 : VISUELS ────────────────────────────────────────────────────────
// - Upload photo de couverture (16:9 conseillé) + logo (carré conseillé)
// - Validation : JPG / PNG / WEBP, 800px min, 8MB max
// - Stockage Supabase Storage bucket 'logos' (existant) avec préfixes différents
// - URL couverture insérée dans commercant_photos (type='couverture')
function Etape3Visuels({ commercant, onboarding, onUpdate, onUpdateOb, avancer, retour }) {
  const [logoUrl, setLogoUrl] = useState(commercant.logo_url || null)
  const [couvertureUrl, setCouvertureUrl] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [warningCover, setWarningCover] = useState(null) // avertissement non bloquant (orientation, qualité…)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Charge la photo de couverture existante au mount
  useEffect(() => {
    let annule = false
    supabase.from('commercant_photos')
      .select('url')
      .eq('commercant_id', commercant.id)
      .eq('type', 'couverture')
      .maybeSingle()
      .then(({ data }) => { if (!annule && data?.url) setCouvertureUrl(data.url) })
    return () => { annule = true }
  }, [commercant.id])

  // Retourne { error, dims }. Erreur bloque l'upload. Dims permet de générer un warning a posteriori.
  async function validerFichier(file) {
    if (!file) return { error: 'Aucun fichier', dims: null }
    const okType = /image\/(jpeg|jpg|png|webp)/.test(file.type)
    if (!okType) return { error: 'Format invalide. Utilise JPG, PNG ou WEBP.', dims: null }
    if (file.size > 8 * 1024 * 1024) return { error: 'Fichier trop lourd. Max 8 MB.', dims: null }
    const dims = await new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve({ w: img.width, h: img.height })
      img.onerror = () => resolve(null)
      img.src = URL.createObjectURL(file)
    })
    if (!dims) return { error: 'Fichier corrompu ou illisible.', dims: null }
    if (Math.max(dims.w, dims.h) < 800) return { error: 'Image trop petite. Min 800 px sur le plus grand côté.', dims }
    return { error: null, dims }
  }

  async function uploadLogo(file) {
    setError('')
    const { error: err } = await validerFichier(file)
    if (err) { setError(err); return }
    setUploadingLogo(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const fileName = `logo-${commercant.id}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, file, { upsert: true })
    if (upErr) { setError(`Upload échoué : ${upErr.message}`); setUploadingLogo(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    const url = urlData.publicUrl
    const { data: c } = await supabase.from('commercants').update({ logo_url: url }).eq('id', commercant.id).select().single()
    if (c) onUpdate(c)
    setLogoUrl(url)
    setUploadingLogo(false)
  }

  async function uploadCouverture(file) {
    setError('')
    setWarningCover(null)
    const { error: err, dims } = await validerFichier(file)
    if (err) { setError(err); return }
    // Warning non bloquant : orientation portrait sur la couverture = mauvais rendu
    // sur la fiche client. On accepte mais on prévient.
    if (dims && dims.h > dims.w * 1.1) {
      setWarningCover('Cette photo est en mode portrait — elle s\'affichera mal sur la couverture (paysage). On la garde quand même, mais on conseille de la remplacer par une photo prise à l\'horizontale.')
    } else if (dims && Math.min(dims.w, dims.h) < 500) {
      setWarningCover('La photo est un peu petite pour la couverture. Une image plus large (≥ 1200 px) rendra mieux sur grand écran.')
    }
    setUploadingCover(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const fileName = `cover-${commercant.id}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, file, { upsert: true })
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
              <li>Capture d'écran d'un autre site</li>
              <li>Image basse qualité ou recadrée à l'arrache</li>
            </ul>
          </div>
        </div>
        <p style={{ fontSize: 10.5, color: T.muted, margin: '10px 0 0', fontWeight: 600, lineHeight: 1.4 }}>
          Format accepté : JPG, PNG, WEBP · 800 px minimum sur le grand côté · 8 MB max
        </p>
      </div>

      <Card titre="Photo de couverture" sous="C'est ta vignette sur Yoppaa — la première chose qu'un client voit en parcourant les commerces. Doit être ultra reconnaissable et qualitative.">
        <UploadZone
          url={couvertureUrl}
          uploading={uploadingCover}
          aspect="16/9"
          minHeight={180}
          label="Ajouter la photo de couverture"
          onFile={f => uploadCouverture(f)}
        />
        {warningCover && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: '#FFF7ED', borderLeft: '3px solid #EA580C', borderRadius: 6, fontSize: 12, color: '#7C2D12', fontWeight: 600, lineHeight: 1.45 }}>
            ⚠️ {warningCover}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: T.muted, fontWeight: 600, lineHeight: 1.5 }}>
          <strong style={{ color: T.bgPanel }}>Idéal :</strong> ta façade telle qu'on la voit depuis la rue — c'est le <strong style={{ color: T.bgPanel }}>premier repère</strong> pour le client qui arrive à pied. Enseigne nette et lisible, couleurs vives, lumière du jour. Format paysage 16:9, qualité maximale. Si pas de façade exploitable (boutique en galerie, food truck mobile), prends un produit phare très photogénique.
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
        <div style={{ marginTop: 10, fontSize: 11, color: T.muted, fontWeight: 600, lineHeight: 1.5 }}>
          <strong style={{ color: T.bgPanel }}>Idéal :</strong> ton logo seul sur fond uni (blanc ou couleur). Si tu n'en as pas, une photo carrée recadrée sur ton enseigne fait l'affaire.
        </div>
      </Card>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#7F1D1D', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <NavEtape retour={retour} continuer={continuer} valide={true} saving={saving} hint={couvertureUrl ? null : 'Tu peux passer cette étape et ajouter les photos plus tard depuis ton dashboard.'}/>
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
            <p style={{ fontSize: '1.4rem', marginBottom: 6 }}>📷</p>
            <p style={{ fontSize: 13, color: T.muted, fontWeight: 700 }}>{label}</p>
            <p style={{ fontSize: 11, color: T.muted, fontWeight: 500, marginTop: 4 }}>JPG, PNG ou WEBP · 8 MB max</p>
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

function NavEtape({ retour, continuer, valide, saving, hint }) {
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

function Etape4Horaires({ commercant, onboarding, onUpdate, onUpdateOb, avancer, retour }) {
  const initial = commercant.horaires_detail || {}
  const [horaires, setHoraires] = useState(() => {
    const out = {}
    JOURS.forEach(j => {
      const h = initial[j.key]
      out[j.key] = h
        ? { ouvert: h.ouvert !== false, debut: h.debut || '09:00', fin: h.fin || '18:00' }
        : { ouvert: true, debut: '09:00', fin: '18:00' }
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
    setSaving(true)
    const { data } = await supabase.from('commercants')
      .update({ horaires_detail: values })
      .eq('id', commercant.id)
      .select()
      .single()
    if (data) onUpdate(data)
    setSaving(false)
  }

  // Valide si au moins 1 jour est ouvert
  const valide = Object.values(horaires).some(h => h.ouvert)

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

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
        Tes horaires d&rsquo;ouverture
      </h1>
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 24px' }}>
        Configure ton planning hebdomadaire. Tu pourras gérer les fermetures exceptionnelles depuis ton dashboard.
      </p>

      <Card titre="Planning hebdomadaire" sous="Astuce : configure lundi puis copie sur tous les jours.">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button type="button" onClick={copierLundi}
            style={{ padding: '6px 12px', background: T.pale, color: T.bgPanel, border: `1px solid ${T.main}33`, borderRadius: 100, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            ⤵ Copier Lundi sur tous les jours
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {JOURS.map(j => {
            const h = horaires[j.key]
            return (
              <div key={j.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: h.ouvert ? '#FAFAFA' : '#F3F4F6', border: `1px solid ${T.hairline}` }}>
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
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: T.muted, fontStyle: 'italic' }}>Fermé</span>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <NavEtape retour={retour} continuer={continuer} valide={valide} saving={saving} hint={valide ? null : 'Coche au moins un jour d\'ouverture.'}/>
    </div>
  )
}

// ─── ÉTAPE 5 : SUCCESS PACK + SOUMISSION ──────────────────────────────────────
// - Choix optionnel d'un Success Pack (STARTER 49€ ou PREMIUM 249€)
// - Calcul du score automatique 0-100 (visible en live)
// - Soumission (statut = en_attente_validation + email Yoppaa via Resend)
// - Bouton verrouille si score < 60
//
// Refactor 2026-06-02 : 3 packs → 2 packs alignés sur le nouveau modèle ON / FULL.
// - Starter dispo tous plans (ON + FULL), Premium réservé FULL (ali + vitrine).
const SUCCESS_PACKS = [
  {
    type: 'starter', label: 'Starter', prix: 49,
    desc: 'Aide rédaction + guide photo personnalisé + vérif profil + 1 session WhatsApp 30 min + 1er deal créé ensemble',
    bullets: ['Tous plans (ON + FULL)', 'Livré sous 48 h'],
  },
  {
    type: 'premium', label: 'Premium', prix: 249,
    desc: 'Tout Starter + séance photo demi-journée + création complète menu ou prestations + fidélité paramétrée + formation équipe 1 h + suivi J+30',
    bullets: ['FULL alimentaire + FULL vitrine', 'Livré sous 7 jours ouvrés', 'Rayon 50 km Mettet'],
  },
]

function Etape5Validation({ commercant, onboarding, onUpdate, onUpdateOb, retour, aller }) {
  const [packChoisi, setPackChoisi] = useState(onboarding.success_pack_choisi || null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(onboarding.statut === 'en_attente_validation' || onboarding.statut === 'valide')
  const [error, setError] = useState('')
  const [stockMenu, setStockMenu] = useState(0)

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
  const peutSoumettre = score >= 60

  async function selectPack(type) {
    setPackChoisi(type)
    await supabase.from('onboarding_commercants')
      .update({ success_pack_choisi: type })
      .eq('id', onboarding.id)
  }

  async function soumettre() {
    if (!peutSoumettre || submitting) return
    setSubmitting(true)
    setError('')

    // 1) Update onboarding : statut + score
    const { data: ob, error: obErr } = await supabase.from('onboarding_commercants')
      .update({
        statut: 'en_attente_validation',
        validation_auto_score: score,
        success_pack_choisi: packChoisi,
        completed_at: new Date().toISOString(),
      })
      .eq('id', onboarding.id)
      .select()
      .single()
    if (obErr) { setError(`Erreur : ${obErr.message}`); setSubmitting(false); return }
    onUpdateOb(ob)

    // 2) Si pack choisi : créer la ligne success_packs (statut en_attente)
    if (packChoisi) {
      const pack = SUCCESS_PACKS.find(p => p.type === packChoisi)
      await supabase.from('success_packs').insert({
        commercant_id: commercant.id,
        type: packChoisi,
        statut: 'en_attente',
        montant_ht: pack?.prix || 0,
      })
    }

    // 3) Update commerçant : statut publication = brouillon → en_attente
    //    Et on efface le motif_rejet précédent : la re-soumission corrige
    //    forcément le problème, plus de raison d'afficher l'ancien motif.
    const { data: c } = await supabase.from('commercants')
      .update({ statut_publication: 'en_attente', motif_rejet: null })
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
          plan: commercant.plan,
          score,
          success_pack: packChoisi,
        }),
      })
    } catch { /* email non bloquant pour la soumission */ }

    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>✅</div>
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
            {packChoisi && <li><strong>Success Pack :</strong> {SUCCESS_PACKS.find(p => p.type === packChoisi)?.label} ({SUCCESS_PACKS.find(p => p.type === packChoisi)?.prix}€ HT)</li>}
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
      <p style={{ fontSize: '0.95rem', color: T.muted, margin: '0 0 24px' }}>
        Choisis si tu veux être accompagné, puis envoie ta demande d&rsquo;activation.
      </p>

      {/* Bandeau de rejet : motif de l'admin si la demande précédente a été refusée.
          Affiché tant que le commerçant n'a pas re-soumis (motif_rejet est mis à null
          à la re-soumission). Inclut 3 raccourcis vers les étapes modifiables : zéro
          friction pour corriger ce qui doit l'être. */}
      {commercant.motif_rejet && (
        <div style={{ background: '#FFF7ED', border: '1px solid #FB923C', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>📝</span>
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
              { n: 2, icon: '✏️', label: 'Infos commerce' },
              { n: 3, icon: '📷', label: 'Visuels' },
              { n: 4, icon: '🕐', label: 'Horaires' },
            ].map(s => (
              <button key={s.n} type="button" onClick={() => aller && aller(s.n)}
                style={{ padding: '7px 12px', borderRadius: 100, border: '1.5px solid #FB923C', background: '#fff', color: '#9A3412', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span>{s.icon}</span> {s.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: '#9A3412', lineHeight: 1.5, margin: 0 }}>
            Une fois corrigé, re-soumets ci-dessous. On valide en moins de 24h après ta correction.
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

      {/* Success Packs */}
      <Card titre="Voulez-vous être accompagné pour votre démarrage ?" sous="Optionnel — tu peux te débrouiller seul si tu préfères.">
        <div style={{ display: 'grid', gap: 10 }}>
          {SUCCESS_PACKS.map(p => (
            <button key={p.type} type="button" onClick={() => selectPack(p.type === packChoisi ? null : p.type)}
              style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 14, border: `2px solid ${packChoisi === p.type ? T.bgPanel : T.hairline}`, background: packChoisi === p.type ? T.bgPanel : '#fff', color: packChoisi === p.type ? '#fff' : T.ink, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s', boxShadow: packChoisi === p.type ? `0 8px 24px rgba(22,6,54,0.2)` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, fontSize: 17, letterSpacing: '-0.3px' }}>{p.label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: packChoisi === p.type ? T.light : T.main }}>{p.prix}€ HT</span>
              </div>
              <p style={{ fontSize: 12, color: packChoisi === p.type ? 'rgba(255,255,255,0.85)' : T.deep, margin: '0 0 4px', lineHeight: 1.4 }}>{p.desc}</p>
              <p style={{ fontSize: 11, color: packChoisi === p.type ? 'rgba(255,255,255,0.55)' : T.muted, margin: 0, fontWeight: 600 }}>
                {p.bullets.join(' · ')}
              </p>
            </button>
          ))}
          <button type="button" onClick={() => selectPack(null)}
            style={{ width: '100%', padding: '12px 16px', borderRadius: 14, border: `1.5px dashed ${T.hairline}`, background: '#fff', color: T.muted, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 13 }}>
            Je me débrouille seul → Continuer
          </button>
        </div>
      </Card>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#7F1D1D', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        {!peutSoumettre && (
          <p style={{ fontSize: 12, color: '#EA580C', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
            Score trop bas ({score}/100). Reviens sur les étapes précédentes pour compléter ton profil.
          </p>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={retour}
            style={{ padding: '0.875rem 1.5rem', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            ← Retour
          </button>
          <button onClick={soumettre} disabled={!peutSoumettre || submitting}
            style={{ flex: 1, padding: '0.875rem 1.5rem', borderRadius: 100, border: 'none', background: (!peutSoumettre || submitting) ? `${T.muted}66` : `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 15, cursor: (!peutSoumettre || submitting) ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: peutSoumettre ? `0 6px 20px ${T.main}55` : 'none' }}>
            {submitting ? 'Envoi…' : 'Envoyer ma demande d’activation →'}
          </button>
        </div>
      </div>
    </div>
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

// ─── PLACEHOLDER pour les étapes restantes (commit suivant) ───────────────────
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
                <span style={{ fontSize: 12, lineHeight: 1 }}>{ok ? '✓' : '○'}</span>
                <span>{r.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CategorieCard({ actif, onClick, titre, sous, exemples, icone }) {
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
      <span style={{ fontSize: 26, lineHeight: 1, marginBottom: 2 }}>{icone}</span>
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
        }}>30 jours d'essai gratuit</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {cfg.features.map((f, i) => (
          <li key={i} style={{
            fontSize: 12, lineHeight: 1.45,
            color: actif ? 'rgba(255,255,255,0.92)' : T.deep,
            display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            <span style={{ color: actif ? T.light : T.main, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{f.startsWith('Tout ') ? '✦' : '✓'}</span>
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
