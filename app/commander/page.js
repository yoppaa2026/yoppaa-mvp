'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchYopper, estSessionPerdue } from '@/lib/fetch-yopper'
import CarteAbonnement from './CarteAbonnement'
import { libelleRetrait } from '@/lib/libelle-retrait'
// La décision « reste-t-il quelque chose à gauche, à droite » vit en fonction
// pure et testée : un voile éteint au mauvais moment cache du contenu.
import { bordsDefilement } from '@/lib/responsive'
import { referenceCommande } from '@/lib/numero-commande'
import { resteAEncaisserCommande, etatPaiementClient, couleurPaiement, montantNetCommande, phraseAvantages } from '@/lib/rdv-paiement'
import { eurosNus } from '@/lib/montants'
import { contexteRetrait, textesRetrait, RETRAIT_RDV, RETRAIT_BOUTIQUE } from '@/lib/ecran-retrait'
import { libelleOptions } from '@/lib/options-ligne'
import IconeRetrait from '@/app/components/IconeRetrait'
// ⚠️ `planEffectif` ET NON `c.plan` : sans lui, un commerçant en essai de
// Vendre restait « vitrine » dans la liste des commerces (26/08).
import { canDo, bandeauCategorie, planEffectif } from '@/lib/plans'
// Une note sans son nombre d'avis ne dit rien, et cinq étoiles vides se lisent
// comme un zéro. La règle vit en fonction pure et testée.
import { resumeAvis } from '@/lib/avis-affichage'
import { STATUTS_OCCUPENT_CRENEAU } from '@/lib/creneaux'
import { statutCreneaux, pastilleCreneaux, jourPlus } from '@/lib/statut-commerce'
import { jourLocalISO, jourBruxelles } from '@/lib/timezone'
import { lieuxDuJour } from '@/lib/lieux-activite'
import { morningADuContenu } from '@/lib/morning-contenu'
import { libellePrixSeance } from '@/lib/abonnements'
import { libelleCarteRecompenses } from '@/lib/fidelite-recompense'
import { libelleExpedition, suiviUrl } from '@/lib/transporteurs'
import { lirePositionMemorisee, memoriserPosition, marquerDemandee, dejaDemandee, decisionGeoloc, etatAutorisation,
  lectureReussieDansCetteSession, marquerLectureDeCetteSession, demandeFaiteDansCetteSession, marquerDemandeDeCetteSession } from '@/lib/geoloc'
import PillsStatut from './PillsStatut'
import ConfirmCommune from './ConfirmCommune'
import ModalAvis from './ModalAvis'
import { brancherSessionPermanente, marquerDeconnexionVoulue } from '@/lib/session-permanente'
import OneSignalInit, { taggerFavoriOneSignal, syncYopperTags } from '@/app/components/OneSignalInit'
import CarteNotifications from './CarteNotifications'
import SupprimerCompte from './SupprimerCompte'

const T = {
  bg:      '#F8F6FF',
  bgCard:  '#FFFFFF',
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

const TEMPS_PAR_TYPE = {
  'Boulangerie': 5, 'Boulangerie & Pâtisserie': 6, 'Coffee shop': 5,
  'Sandwicherie': 8, 'Snack': 8, 'Friterie': 10,
  'Pizzeria': 10, 'Épicerie': 6, 'Traiteur': 8, 'Pharmacie': 7,
}
function getTemps(type) { return TEMPS_PAR_TYPE[type] || 7 }

// Bandeau de filtres (refonte 23/07) : rangée 1 = les 3 catégories commerçant
// (+ Tous), rangée 2 = les métiers réellement présents dans la zone du Yopper
// (générés depuis les commerces chargés, avec compteur : jamais de filtre vide).
const FAMILLES = [
  { key: 'tous', label: 'Tous' },
  { key: 'alimentaire', label: 'Alimentaire' },
  { key: 'vitrine', label: 'Services' },
  { key: 'detail', label: 'Boutiques' },
]
// Les anciens commerçants d'avant la colonne categorie sont tous alimentaires.
const familleDe = (c) => c?.categorie || 'alimentaire'

function parseTypes(type) {
  if (!type) return ['Commerce']
  const parts = type.split(/\s*[&\/,]\s*/).map(t => t.trim()).filter(Boolean)
  return parts.length >= 2 ? parts.slice(0, 2) : [type]
}
// ⚠️ LA RECHERCHE NE TROUVAIT RIEN SANS ACCENT. « epicerie » rendait zéro
// résultat là où « Épicerie » en rendait un : personne ne tape la majuscule
// accentuée sur un clavier de téléphone. On retire les accents des deux côtés
// de la comparaison, jamais des libellés affichés.
function sansAccents(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
function distanceVolOiseau(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function formatDistance(m) {
  if (!m && m !== 0) return null
  return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`
}
function Etoiles({ note, taille = 13 }) {
  const n = note ? Math.round(note) : 0
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: taille, color: i<=n ? '#F59E0B' : '#D1D5DB' }}>★</span>)}</span>
}

// ─── Icônes SVG réutilisables (design system canonique) ─────────────────────
// Remplace les emojis UI : strokeWidth 2, round caps, palette stricte.
function IconBag({ size = 28, color = T.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>
    </svg>
  )
}
function IconClock({ size = 16, color = T.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  )
}
function IconSearch({ size = 36, color = T.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  )
}
function IconHandshake({ size = 18, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m11 17 2 2a1 1 0 1 0 3-3"/>
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/>
      <path d="m21 3 1 11h-2"/>
      <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/>
      <path d="M3 4h8"/>
    </svg>
  )
}
function IconSparkle({ size = 18, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
      <path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>
    </svg>
  )
}

function heureEnMinutes(heure) {
  const [h, m] = heure.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

// ─── Splash Screen ────────────────────────────────────────────────────────────
// ─── FIX SWIPE : SwipeRetrait - YOP → SWIPE, instructions claires ────────────
function SwipeRetrait({ onConfirm, clientPrenom, libelle = 'Glisse pour récupérer', sousTexteSucces = 'Tu skip la file' }) {
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | swiping | success | done
  const [containerW, setContainerW] = useState(0)
  const startRef = useRef(0)
  const containerRef = useRef(null)
  const THUMB = 48
  const C = { main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF', ink: '#1A0840', deep: '#2D0F6B' }

  function getMaxX() { return (containerRef.current?.offsetWidth || 300) - THUMB - 8 }
  function getX(e) { return e.touches ? e.touches[0].clientX : e.clientX }

  const audioRef = useRef(null)
  const phaseRef = useRef('idle')

  function setPhaseSync(val) {
    phaseRef.current = val
    setPhase(val)
  }

  const onStart = e => {
    if (phaseRef.current !== 'idle') return
    setPhaseSync('swiping'); setSwiping(true)
    startRef.current = getX(e) - swipeX
    try {
      audioRef.current = new Audio('/sounds/yop.mp3')
      audioRef.current.volume = 0.8
      audioRef.current.load()
    } catch(e) {}
  }
  const onMove = e => {
    if (phaseRef.current !== 'swiping') return
    const x = Math.max(0, Math.min(getMaxX(), getX(e) - startRef.current))
    setSwipeX(x)
    if (x >= getMaxX()) {
      setSwiping(false)
      setPhaseSync('success')
      try {
        if (audioRef.current) {
          audioRef.current.play().catch(() => {})
        } else {
          new Audio('/sounds/yop.mp3').play().catch(() => {})
        }
      } catch(e) {}
      setTimeout(() => { setPhaseSync('done'); onConfirm() }, 3500)
    }
  }
  const onEnd = () => {
    if (phaseRef.current !== 'swiping') return
    setSwiping(false); setPhaseSync('idle'); setSwipeX(0)
  }

  // Largeur suivie en state (réactif) : pas de lecture de containerRef pendant le
  // render (interdit). Les handlers, eux, lisent le ref directement (autorisé).
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') { if (el) setContainerW(el.offsetWidth); return }
    setContainerW(el.offsetWidth)
    const ro = new ResizeObserver(() => setContainerW(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])
  const p = swipeX / (((containerW || 300) - THUMB - 8) || 1)
  const TRACK_H = THUMB + 16

  // ─── Phase succès - animation 3 points + wordmark ─────────────────────────
  if (phase === 'success' || phase === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '1rem 0' }}>
        <style>{`
          @keyframes yopDot1 { 0%,100%{transform:scale(0.6) translateY(0);opacity:0.4} 33%{transform:scale(1.6) translateY(-8px);opacity:1} }
          @keyframes yopDot2 { 0%,100%{transform:scale(0.6) translateY(0);opacity:0.4} 50%{transform:scale(1.8) translateY(-10px);opacity:1} }
          @keyframes yopDot3 { 0%,100%{transform:scale(0.6) translateY(0);opacity:0.4} 66%{transform:scale(1.6) translateY(-8px);opacity:1} }
          @keyframes yopWordmark { 0%{opacity:0;letter-spacing:8px;transform:translateY(8px)} 100%{opacity:1;letter-spacing:-2px;transform:translateY(0)} }
          @keyframes yopSub { 0%{opacity:0;transform:translateY(6px)} 100%{opacity:1;transform:translateY(0)} }
        `}</style>
        {/* Wordmark tricolore canonique fond clair : yo Ink, pp Main, aa Mid */}
        <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2.2rem', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 12, animation: 'yopWordmark 0.6s cubic-bezier(0.25,0.46,0.45,0.94) forwards' }}>
          <span style={{ color: C.ink }}>yo</span>
          <span style={{ color: C.main }}>pp</span>
          <span style={{ color: C.mid }}>aa</span>
        </p>
        {/* Dots V2-B sous le wordmark, animation tour à tour */}
        <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6, height: 17, marginBottom: 12 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: C.ink, animation: 'yopDot1 1.2s ease-in-out infinite' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.main, marginTop: 4.4, animation: 'yopDot2 1.2s ease-in-out infinite' }}/>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: C.main, marginTop: 4.4, animation: 'yopDot2 1.2s ease-in-out infinite' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.mid, marginTop: 4.4, animation: 'yopDot3 1.2s ease-in-out infinite' }}/>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: C.mid, animation: 'yopDot3 1.2s ease-in-out infinite' }}/>
        </div>
        <p style={{ fontWeight: 700, fontSize: '0.9rem', color: C.deep, animation: 'yopSub 0.5s ease 0.3s both', letterSpacing: '-0.2px' }}>
          Bien joué {clientPrenom || 'Yopper'} 🟣
        </p>
        <p style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 6, animation: 'yopSub 0.5s ease 0.5s both' }}>
          {sousTexteSucces}
        </p>
      </div>
    )
  }

  // ─── Phase idle / swiping ─────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <style>{`
        @keyframes swipeArrowPulse { 0%,100%{opacity:0.3;transform:translateX(0)} 50%{opacity:1;transform:translateX(5px)} }
      `}</style>

      {/* FIX : label "Glisse pour récupérer" - sans "YOP!" */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {[0,1,2].map(i => (
            <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="none"
              style={{ animation: `swipeArrowPulse 1s ease-in-out ${i*0.2}s infinite` }}>
              <path d="M9 18l6-6-6-6" stroke={C.mid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ))}
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#9CA3AF', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{libelle}</span>
      </div>

      {/* Track */}
      <div ref={containerRef}
        style={{ width: '100%', height: TRACK_H, borderRadius: 100, background: `linear-gradient(to right, ${C.pale} ${p*100}%, #F1F0F9 ${p*100}%)`, position: 'relative', border: `2px solid ${p > 0.5 ? C.main : C.light}`, userSelect: 'none', cursor: 'grab', touchAction: 'none', transition: 'border-color 0.2s', boxShadow: p > 0.3 ? `0 4px 20px ${C.main}22` : 'none' }}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>

        {/* Texte central - apparaît après 70% */}
        {p > 0.7 && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: THUMB + 12, right: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: C.main, letterSpacing: '1px', textTransform: 'uppercase' }}>Lâche !</span>
          </div>
        )}

        {/* FIX : thumb - "YOP" → "SWIPE" */}
        <div style={{ position: 'absolute', left: 4 + swipeX, top: 4, width: THUMB, height: THUMB, borderRadius: '50%', background: `linear-gradient(135deg, ${C.main}, ${C.mid})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 20px ${C.main}66, 0 0 0 ${p > 0.5 ? '3px' : '0px'} ${C.light}`, transition: swiping ? 'none' : 'left 0.3s, box-shadow 0.2s', userSelect: 'none', gap: 2 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {[{c:'rgba(255,255,255,0.5)',s:4},{c:'rgba(196,160,244,0.9)',s:5},{c:'rgba(150,96,224,0.9)',s:4}].map((d,i) => (
              <div key={i} style={{ width: d.s, height: d.s, borderRadius: '50%', background: d.c }}/>
            ))}
          </div>
          <span style={{ fontWeight: 900, fontSize: '0.52rem', color: '#fff', letterSpacing: '0.8px', textTransform: 'uppercase', lineHeight: 1 }}>SWIPE</span>
        </div>
      </div>
    </div>
  )
}

function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    // Sequence canonique : wordmark, 5 dots V2-B, slogan.
    // ⚠️ SÉQUENCE RESSERRÉE LE 19/08 : elle durait 4,3 s À CHAQUE SESSION, et
    // Alex l'a dite agaçante. L'écran système qui la précède, lui, n'est pas
    // supprimable tant qu'on est en PWA ; la seule durée qu'on maîtrise est
    // celle-ci. 2,4 s au total, la séquence canonique reste entière.
    const t1 = setTimeout(() => setPhase(1), 150)  // wordmark in
    const t2 = setTimeout(() => setPhase(2), 600)  // 5 dots V2-B pop cascade
    const t3 = setTimeout(() => setPhase(3), 1100) // slogan in
    const t4 = setTimeout(() => setPhase(4), 1900) // debut fadeOut
    // ⚠️ t5 SUIT LA DURÉE DE `splash-out`, ils ne se règlent pas séparément.
    // 1900 + 500 : démonter plus tôt ferait disparaître le splash d'un coup,
    // plus tard laisserait un écran déjà invisible bloquer le doigt.
    const t5 = setTimeout(() => onDone(),    2400) // fin
    return () => [t1,t2,t3,t4,t5].forEach(clearTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  }, [])
  // Dimensions des 5 dots V2-B (spec : grand 18, mini 10, gap 10, offset 7.2)
  const dotBase = 18, dotMini = 10, dotOffset = 7.2
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: `linear-gradient(160deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: phase === 4 ? 'splash-out 0.5s ease-in forwards' : 'none', overflow: 'hidden' }}>
      {/* Signature canonique YOPPAA : bande degradee 3px Ink → Main → Light en haut */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, #1A0840 0%, #6B35C4 60%, #C4A0F4 100%)` }}/>

      {/* Wordmark tricolore canonique : yo blanc, pp Light, aa Mid */}
      <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '3.5rem', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 28, animation: phase >= 1 ? 'wordmark-in 0.7s cubic-bezier(0.25,0.46,0.45,0.94) forwards' : 'none', opacity: phase >= 1 ? 1 : 0 }}>
        <span style={{ color: '#fff' }}>yo</span>
        <span style={{ color: '#C4A0F4' }}>pp</span>
        <span style={{ color: '#9660E0' }}>aa</span>
      </p>

      {/* 5 dots V2-B : pop cascade nette de gauche a droite */}
      <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 10, height: dotBase + dotOffset, marginBottom: 22, opacity: phase >= 2 ? 1 : 0 }}>
        {[
          { w: dotBase, c: '#FFFFFF',  marginTop: 0,         delay: '0s' },
          { w: dotMini, c: '#C4A0F4',  marginTop: dotOffset, delay: '0.09s' },
          { w: dotBase, c: '#C4A0F4',  marginTop: dotOffset, delay: '0.18s' },
          { w: dotMini, c: '#9660E0',  marginTop: dotOffset, delay: '0.27s' },
          { w: dotBase, c: '#9660E0',  marginTop: 0,         delay: '0.36s' },
        ].map((d, i) => (
          <span key={i} style={{ width: d.w, height: d.w, borderRadius: '50%', background: d.c, marginTop: d.marginTop, boxShadow: `0 0 14px ${d.c}88`, animation: phase >= 2 ? `dot-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) ${d.delay} both` : 'none', display: 'block' }}/>
        ))}
      </div>

      <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 600, fontSize: '0.95rem', color: '#C4A0F4', letterSpacing: '0.012em', animation: phase >= 3 ? 'tagline-in 0.6s ease forwards' : 'none', opacity: phase >= 3 ? 1 : 0 }}>Ton quartier dans ta poche</p>
    </div>
  )
}

// ─── Suggestion commerce ──────────────────────────────────────────────────────
function SuggestionForm() {
  const [form, setForm] = useState({ nom: '', adresse: '', type: '', commentaire: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const inputSt = { width: '100%', padding: '0.875rem 1rem', border: `1.5px solid ${T.pale}`, borderRadius: 12, marginBottom: 10, fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none', color: T.ink, background: '#fff', display: 'block' }
  async function envoyer() {
    if (!form.nom.trim()) return; setSending(true)
    // Route serveur : la table n'accepte plus d'insertion directe, elle était
    // ouverte à tous et donc à n'importe quel robot.
    await fetch('/api/signaux', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'suggestion', nom_commerce: form.nom.trim(), adresse: form.adresse.trim() || null, type_commerce: form.type.trim() || null, commentaire: form.commentaire.trim() || null }),
    }).catch(() => {})
    setSent(true); setSending(false)
  }
  if (sent) return (
    <div style={{ background: '#F0FDF4', borderRadius: 16, padding: '1.5rem', textAlign: 'center', border: '1.5px solid #10B98133' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 14, background: T.pale, marginBottom: 12 }}>
        <IconSparkle size={28} color={T.main}/>
      </div>
      <p style={{ fontWeight: 800, color: '#10B981', marginBottom: 6 }}>Merci pour ta suggestion !</p>
      <p style={{ fontSize: '0.875rem', color: T.muted }}>On va contacter ce commerçant. Tu contribues à faire grandir la Tribu Yoppaa.</p>
      <button onClick={() => { setSent(false); setForm({ nom: '', adresse: '', type: '', commentaire: '' }) }} style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: T.main, color: '#fff', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer' }}>Suggérer un autre commerçant</button>
    </div>
  )
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', border: `1.5px solid ${T.pale}` }}>
      <p style={{ fontWeight: 800, color: T.deep, marginBottom: '1rem' }}>Quel commerçant mérite Yoppaa ?</p>
      <input placeholder="Nom du commerce *" value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} style={inputSt}/>
      <input placeholder="Adresse" value={form.adresse} onChange={e => setForm(p => ({ ...p, adresse: e.target.value }))} style={inputSt}/>
      <input placeholder="Type (boulangerie, snack...)" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inputSt}/>
      <textarea placeholder="Pourquoi ce commerçant ?" value={form.commentaire} onChange={e => setForm(p => ({ ...p, commentaire: e.target.value }))} style={{ ...inputSt, resize: 'vertical', minHeight: 70, marginBottom: 14 }}/>
      <button onClick={envoyer} disabled={!form.nom.trim() || sending}
        style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '1rem', background: form.nom.trim() ? T.main : '#E5E7EB', color: '#fff', cursor: form.nom.trim() ? 'pointer' : 'default', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {sending ? 'Envoi...' : (<><IconHandshake size={18} color="#fff"/> Suggérer ce commerçant</>)}
      </button>
    </div>
  )
}

// ─── Édition prénom inline ────────────────────────────────────────────────────
function EditablePrenom({ client, setClient, clientId, openSignal }) {
  const [editing, setEditing] = useState(false)
  const [vPrenom, setVPrenom] = useState(client.prenom || '')
  const [vNom, setVNom]       = useState(client.nom || '')
  const [vTel, setVTel]       = useState(client.telephone || '')
  const [saving, setSaving] = useState(false)
  // openSignal : compteur incrementé par le parent (bandeau "Complete tes infos")
  // pour declencher l'edit mode depuis l'exterieur sans coupler tightly l'etat.
  useEffect(() => {
    if (openSignal && openSignal > 0) {
      setVPrenom(client.prenom || '')
      setVNom(client.nom || '')
      setVTel(client.telephone || '')
      setEditing(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  async function sauvegarder() {
    if (!vPrenom.trim()) return
    setSaving(true)
    const prenom = vPrenom.trim()
    const nom    = vNom.trim()
    const telephone = vTel.trim()
    localStorage.setItem('yoppaa_prenom', prenom)
    if (nom) localStorage.setItem('yoppaa_nom', nom)
    if (telephone) localStorage.setItem('yoppaa_telephone', telephone)
    setClient(p => ({ ...p, prenom, nom, telephone }))
    if (clientId) {
      // ⚠️ ENCORE UN `fetch` NU. La route exige une identité PROUVÉE depuis le
      // 03/08 : chaque enregistrement du prénom, du nom ou du téléphone partait
      // donc dans le vide, avec un 401 que personne ne lisait. L'écran affichait
      // la nouvelle valeur, prise du navigateur, et la base gardait l'ancienne.
      // Attrapé par le test qui interdit les appels nus vers cette route.
      await fetchYopper('/api/yopper/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-own', prenom, nom, telephone }) })
    }
    setSaving(false)
    setEditing(false)
  }

  const inputDark = { background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '0.5rem 0.875rem', color: '#fff', fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' }

  if (editing) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input value={vPrenom} onChange={e => setVPrenom(e.target.value)} autoFocus placeholder="Prénom" style={inputDark}/>
        <input value={vNom} onChange={e => setVNom(e.target.value)} placeholder="Nom" style={inputDark}/>
      </div>
      <input value={vTel} onChange={e => setVTel(e.target.value)} type="tel" placeholder="Téléphone" onKeyDown={e => e.key === 'Enter' && sauvegarder()} style={inputDark}/>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={sauvegarder} disabled={!vPrenom.trim() || saving}
          style={{ flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', color: '#6B35C4', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {saving ? '…' : (<><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B35C4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg> Sauvegarder</>)}
        </button>
        <button onClick={() => setEditing(false)}
          style={{ padding: '0.5rem 0.875rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 100, color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          Annuler
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <p style={{ fontWeight: 900, fontSize: '1.15rem', color: '#fff', letterSpacing: '-0.3px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[client.prenom, client.nom].filter(Boolean).join(' ') || 'Yopper 🟣'}
        </p>
        <button onClick={() => { setVPrenom(client.prenom || ''); setVNom(client.nom || ''); setVTel(client.telephone || ''); setEditing(true) }}
          aria-label="Modifier mes infos"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 100, padding: '3px 9px', color: 'rgba(255,255,255,0.85)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Modifier
        </button>
      </div>
      <p style={{ fontSize: '0.78rem', color: '#C4A0F4', opacity: 0.9, marginBottom: client.telephone ? 2 : 0 }}>{client.email}</p>
      {client.telephone && (
        <p style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#C4A0F4', opacity: 0.7 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          {client.telephone}
        </p>
      )}
    </div>
  )
}

// ─── Écran pick-up hype ───────────────────────────────────────────────────────
// FIX NUMÉRO : numero_commande de la DB en priorité ; si manquant (anciennes
// commandes), on calcule la position du jour côté commerçant - même logique que
// le dashboard (getNumeroJour) pour que client et commerçant voient le même #.
// ─── Écran plein de retrait ────────────────────────────────────────────────
// Le moment où le Yopper arrive au comptoir. Il doit être lisible en une
// seconde, par-dessus une épaule, et donner envie : c'est l'aboutissement de
// la commande, pas un accusé de réception.
//
// Ce qui NE change jamais : le numéro, clé de la commande côté commerçant, et
// le prénom qui l'humanise. Ce qui change : tout ce qui l'entoure, selon qu'on
// vient chercher un pain, un colis mis de côté, ou des produits qu'on nous
// remettra pendant un rendez-vous. Voir lib/ecran-retrait.js.
function PickupScreen({ commande, clientPrenom, onConfirm, onFermer }) {
  const contexte = contexteRetrait(commande)
  const textes = textesRetrait(contexte)
  const [numeroCalcule, setNumeroCalcule] = useState(null)

  useEffect(() => {
    let annule = false
    async function rechercherNumero() {
      // 1) la référence est déjà là → on l'affiche telle quelle
      const dejaLa = referenceCommande(commande)
      if (dejaLa) {
        if (!annule) setNumeroCalcule(dejaLa)
        return
      }
      // 2) elle arrive avec un instant de retard sur le retour de paiement :
      //    on relit la commande pour l'obtenir.
      if (commande.id) {
        const { data: fresh } = await supabase
          .from('commandes_stats')
          .select('numero_commande, numero_prefixe, numero_semaine')
          .eq('id', commande.id)
          .maybeSingle()
        const relue = referenceCommande(fresh || {})
        if (relue) {
          if (!annule) setNumeroCalcule(relue)
          return
        }
        // ⚠️ IL Y AVAIT UN TROISIÈME RECOURS ICI, ET IL MENTAIT : il recalculait
        // « la position du jour » alors que la base numérote par SEMAINE. Le
        // client pouvait donc annoncer « 3 » au comptoir pendant que le
        // commerçant cherchait « C12 ». Sur le seul point où ils doivent se
        // comprendre, ils ne disaient pas la même chose.
        //
        // Le compteur en base attribue maintenant un numéro à coup sûr, sous
        // verrou. Il n'y a plus rien à suppléer.
      }
      if (!annule) setNumeroCalcule('?')
    }
    rechercherNumero()
    return () => { annule = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- on ne dépend que de l'identité de la commande et de sa référence, pas de l'objet entier qui change à chaque rendu
  }, [commande.id, commande.numero_commande, commande.numero_prefixe])

  const numero = numeroCalcule ?? '…'
  const cren = commande.creneau || commande.creneau_livraison
  // La ligne sous le prénom dit CE QU'IL RESTE À SAVOIR, et elle diffère
  // complètement d'un commerce à l'autre. Un horaire chez le boulanger, la
  // liste des articles en boutique (le vendeur doit sortir le bon paquet), le
  // rappel du rendez-vous chez un salon.
  const lignes = commande.commande_articles || []
  return (
    // FIX FOOTER : position: fixed + zIndex: 9999 - rendu HORS de page-wrap (voir return principal)
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'linear-gradient(160deg, #1A0840 0%, #2D0F6B 40%, #6B35C4 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '2.5rem 1.75rem calc(2.5rem + env(safe-area-inset-bottom, 0px))', overflow: 'hidden' }}>
      {/* Bande 3px canonique YOPPAA */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #1A0840 0%, #6B35C4 60%, #C4A0F4 100%)', zIndex: 3 }}/>

      {/* ⚠️ LA CROIX, ET ELLE MANQUAIT DEPUIS TOUJOURS (Alex, 17/08 : « il faut
          mettre une croix sur tous les écrans de swipe si le client veut sortir
          de cet écran et y revenir plus tard »).
          Cet écran occupe TOUT le téléphone, par-dessus la navigation. Sans
          elle, le Yopper qui ouvre son numéro dans la file, se ravise et veut
          revoir sa commande devait TUER l'application. Et depuis que l'encadré
          du solde a remplacé le swipe, il n'y avait plus une seule sortie à
          l'écran : je l'avais enfermé.
          Elle est là dans les TROIS cas, y compris quand le geste existe :
          ouvrir son numéro n'engage à rien. */}
      <button onClick={onFermer} aria-label="Fermer et revenir à mes commandes"
        style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top, 0px))', right: 14, zIndex: 4, width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', padding: 0 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
      <style>{`
        @keyframes pu-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.7} }
        @keyframes pu-fadein { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pu-glow { 0%,100%{text-shadow:0 0 40px #9660E088} 50%{text-shadow:0 0 80px #C4A0F4cc} }
        /* Le numéro ARRIVE : petit rebond à l'apparition, comme un ticket qu'on
           sort. C'est ce qui transforme un affichage en petit événement. */
        @keyframes pu-numero { 0%{opacity:0;transform:scale(0.7)} 60%{opacity:1;transform:scale(1.06)} 100%{opacity:1;transform:scale(1)} }
        /* Halo qui respire derrière le numéro : le regard y revient tout seul. */
        @keyframes pu-halo { 0%,100%{transform:scale(1);opacity:0.35} 50%{transform:scale(1.12);opacity:0.6} }
        /* L'icône flotte doucement : de la vie, jamais de l'agitation. */
        @keyframes pu-flotte { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
      `}</style>
      {/* Déco fond */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 80% 20%, #9660E033 0%, transparent 50%), radial-gradient(circle at 20% 80%, #6B35C422 0%, transparent 50%)', pointerEvents: 'none' }}/>

      {/* Identité : wordmark tricolore + dots V2-B canoniques */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', animation: 'pu-fadein 0.5s ease' }}>
        <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1.7rem', letterSpacing: '-0.05em', lineHeight: 1, animation: 'pu-glow 2s ease-in-out infinite', marginBottom: 8 }}>
          <span style={{ color: '#fff' }}>yo</span>
          <span style={{ color: '#C4A0F4' }}>pp</span>
          <span style={{ color: '#9660E0' }}>aa</span>
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 4, height: 11 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pu-pulse 2s ease-in-out 0s infinite' }}/>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#C4A0F4', marginTop: 2.8, animation: 'pu-pulse 2s ease-in-out 0.15s infinite' }}/>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C4A0F4', marginTop: 2.8, animation: 'pu-pulse 2s ease-in-out 0.3s infinite' }}/>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#9660E0', marginTop: 2.8, animation: 'pu-pulse 2s ease-in-out 0.45s infinite' }}/>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#9660E0', animation: 'pu-pulse 2s ease-in-out 0.6s infinite' }}/>
        </div>
      </div>

      {/* Le cœur de l'écran */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', animation: 'pu-fadein 0.6s ease 0.1s both', width: '100%' }}>
        {/* Icône du moment, dans une pastille douce */}
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 62, height: 62, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.22)', marginBottom: 14, animation: 'pu-flotte 3.2s ease-in-out infinite' }}>
          <IconeRetrait contexte={contexte}/>
        </div>
        <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#C4A0F4', textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 10, opacity: 0.85 }}>{textes.surtitre}</p>

        {/* Le numéro, avec son halo. Il ne bouge dans AUCUN segment : c'est la
            clé par laquelle le commerçant retrouve la commande. */}
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 4 }}>
          <span aria-hidden="true" style={{ position: 'absolute', inset: '-18% -12%', borderRadius: '50%', background: 'radial-gradient(circle, #9660E0 0%, transparent 68%)', animation: 'pu-halo 2.8s ease-in-out infinite', pointerEvents: 'none' }}/>
          <p style={{ position: 'relative', fontSize: '6.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-4px', lineHeight: 1, animation: 'pu-numero 0.55s cubic-bezier(0.34,1.56,0.64,1) both' }}>#{numero}</p>
        </div>
        <p style={{ fontSize: '1.35rem', fontWeight: 900, color: '#C4A0F4', letterSpacing: '-0.5px', marginBottom: 10 }}>{clientPrenom || 'Yopper'} 🟣</p>

        {/* Horaire : uniquement là où un créneau existe vraiment. */}
        {contexte !== RETRAIT_RDV && cren && (
          <p style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '0.95rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            {cren.heure_debut.slice(0, 5)} – {cren.heure_fin.slice(0, 5)}
          </p>
        )}

        {/* Rappel du rendez-vous : c'est LÀ qu'on remettra les produits. */}
        {contexte === RETRAIT_RDV && commande.date_commande && (
          <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}>
            On te les remet à ton rendez-vous,<br/>
            {new Date(commande.date_commande + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        )}

        {/* Liste des articles : en boutique, le vendeur doit sortir le bon
            paquet, et le client doit pouvoir vérifier. Inutile chez le
            boulanger, où l'écran doit se lire en une seconde. */}
        {(contexte === RETRAIT_BOUTIQUE || contexte === RETRAIT_RDV) && lignes.length > 0 && (
          <div style={{ marginTop: 14, display: 'inline-block', textAlign: 'left', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 16px', maxWidth: '100%' }}>
            {lignes.slice(0, 4).map((l, i) => {
              // ⚠️ LA VERSION CHOISIE MANQUAIT, et c'est justement ce que le
              // vendeur doit lire. « 1 × Robe fleurie » ne lui dit ni la taille
              // ni le coloris : il sortait le mauvais paquet, ou demandait au
              // client de reprendre son téléphone pour retrouver sa commande.
              // Le libellé vit dans `options`, il n'a pas de colonne à lui.
              const version = libelleOptions(l.options)
              return (
                <div key={i} style={{ marginBottom: i < Math.min(lignes.length, 4) - 1 ? 6 : 0 }}>
                  <p style={{ fontSize: '0.86rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)', lineHeight: 1.45 }}>
                    {/* Le nom figé à la vente d'abord : c'est ce que le client a
                        acheté, titre du deal compris. La jointure ne sert que pour
                        les commandes d'avant la colonne. */}
                    {l.quantite} × {l.article_nom || l.article?.nom || 'Article'}
                  </p>
                  {version && (
                    <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#C4A0F4', lineHeight: 1.4 }}>
                      {version}
                    </p>
                  )}
                </div>
              )
            })}
            {lignes.length > 4 && (
              <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>et {lignes.length - 4} autre{lignes.length - 4 > 1 ? 's' : ''}…</p>
            )}
          </div>
        )}

        <div style={{ marginTop: 18, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: '11px 22px', display: 'inline-block' }}>
          <p style={{ fontWeight: 900, fontSize: '0.92rem', color: '#fff', letterSpacing: '-0.2px' }}>{textes.badge} 🟣</p>
        </div>

        {/* Et l'état du paiement, LÀ OÙ LES DEUX LE REGARDENT. Cet écran est
            tendu par-dessus le comptoir : le commerçant y lit le numéro, il
            doit y lire aussi s'il tend la main. Le mot d'état est le même que
            sur la carte de suivi et dans l'email, jamais un troisième. */}
        <div style={{ marginTop: 10 }}>
          <PillPaiementClient commande={commande}/>
        </div>
      </div>

      {/* Le geste, quand il y en a un. Les produits d'un rendez-vous sont remis
          par le commerçant en fin de prestation : le client a les mains prises,
          on ne lui demande rien. */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', animation: 'pu-fadein 0.6s ease 0.3s both' }}>
        {/* ⚠️ LE SWIPE NE VAUT QUE S'IL N'Y A PLUS RIEN À PAYER (Alex, 17/08 :
            « le swipe est uniquement valable s'il n'y a pas de solde à payer ? »).
            Sa promesse est « tu skips la file » : une confirmation en
            libre-service. Or il écrivait `statut = 'recupere'` côté serveur SANS
            regarder le solde, donc une commande payée sur place devenait
            récupérée sans que personne n'ait encaissé quoi que ce soit, et le
            commerçant n'avait plus aucun bouton pour le noter.
            ⚠️ ON NE CACHE PAS LE GESTE, ON DIT POURQUOI IL N'EST PAS LÀ : ne
            rien afficher est la pire des sorties, le client croirait à une
            panne. */}
        {resteAEncaisserCommande(commande) > 0 ? (
          <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 16, padding: '14px 18px' }}>
            <p style={{ fontWeight: 900, fontSize: '0.95rem', color: '#fff', marginBottom: 4 }}>
              C&rsquo;est ton commerçant qui confirme la remise
            </p>
            {/* ⚠️ LE MONTANT N'EST PLUS RÉPÉTÉ ICI : la pastille au-dessus le
                dit déjà. Deux fois le même chiffre à dix lignes d'écart, et on
                se demande s'il y a deux sommes à payer. */}
            <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
              Montre-lui ce numéro : il valide au moment où tu règles. Le geste en libre-service est réservé aux commandes déjà payées.
            </p>
          </div>
        ) : textes.avecGeste ? (
          <SwipeRetrait clientPrenom={clientPrenom} onConfirm={onConfirm}
            libelle={textes.libelleGeste}
            sousTexteSucces={textes.sousTexteSucces}/>
        ) : (
          <button onClick={onFermer}
            style={{ width: '100%', padding: '1rem', borderRadius: 100, border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            J&rsquo;ai compris
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Section "Mes avis" - affichée dans l'onglet Profil ────────────────────
// Liste compacte des avis vérifiés (liés à une commande) postés par le Yopper.
function SectionMesAvis({ clientId }) {
  const [avis, setAvis] = useState([])
  // Loading initialisé selon la présence de clientId : évite un setState synchrone
  // dans l'effect (règle react-hooks/set-state-in-effect). Sans clientId, rien à
  // charger → loading part à false ; sinon on passe à false dans le .then (async).
  const [loading, setLoading] = useState(!!clientId)

  useEffect(() => {
    if (!clientId) return
    let annule = false
    // Route serveur : la table avis n'est plus lisible publiquement, elle
    // exposait l'identifiant du client et celui de sa commande.
    fetchYopper('/api/yopper/avis')
      .then(r => r.json())
      .then(j => {
        if (annule) return
        setAvis(j?.avis || [])
        setLoading(false)
      })
      .catch(() => { if (!annule) setLoading(false) })
    return () => { annule = true }
  }, [clientId])

  if (loading) return null

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px 12px', marginBottom: '0.875rem', border: `1px solid ${T.pale}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Mes avis
        </span>
        <div style={{ flex: 1, height: 1, background: T.pale }}/>
        {avis.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{avis.length}</span>}
      </div>
      {avis.length === 0 ? (
        <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, margin: 0 }}>
          Après ta prochaine commande récupérée, on te proposera de laisser un avis pour aider la tribu.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {avis.slice(0, 5).map(a => (
            <div key={a.id} style={{ padding: '10px 12px', background: T.bg, borderRadius: 10, border: `1px solid ${T.pale}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                  {a.commercant?.nom || 'Commerçant'}
                </p>
                <span style={{ fontSize: 12, color: '#F59E0B', fontWeight: 700, flexShrink: 0 }}>{'★'.repeat(a.note)}</span>
              </div>
              {a.commentaire && (
                <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  &laquo;&nbsp;{a.commentaire}&nbsp;&raquo;
                </p>
              )}
            </div>
          ))}
          {avis.length > 5 && (
            <p style={{ fontSize: 11, color: T.muted, fontStyle: 'italic', textAlign: 'center', margin: '4px 0 0' }}>
              + {avis.length - 5} autres avis
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Badge type de commande : 4 identités (décision Alex 23/07).
//   Retrait créneau (alimentaire) = VERT · Livraison = INDIGO ·
//   Boutique détail (retrait libre) = ORANGE · Colis (expédition) = ORANGE.
// Le violet reste la marque, le vert les RDV : ici seule l'icône + couleur
// du badge différencie, pas de sections en plus (ODOO).
function BadgeTypeCommande({ mode, categorie = null }) {
  const cfg = mode === 'livraison'
    ? { label: 'Livraison', fg: '#4F46E5', bg: '#EEF2FF',
        icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h2l2.5 6M6 17.5h7l-2-8H8.5"/></svg> }
    : mode === 'expedition'
    ? { label: 'Colis', fg: '#EA580C', bg: '#FFF7ED',
        icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/></svg> }
    : categorie === 'detail'
    ? { label: 'Boutique', fg: '#EA580C', bg: '#FFF7ED',
        icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg> }
    : { label: 'Retrait', fg: '#059669', bg: '#F0FDF4',
        icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg> }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 8px', borderRadius: 100, background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.fg}22` }}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ─── EST-CE QUE JE DOIS SORTIR DE QUOI PAYER ? ───────────────────────────────
//
// ⚠️ RIEN NE LE DISAIT AU CLIENT (Alex, 17/08). La carte annonçait « 6,00 € » et
// « 15,00 € » côte à côte : l'une était réglée en ligne, l'autre attendait au
// comptoir, et rien à l'écran ne les distinguait. Le commerçant avait sa
// pastille depuis le matin, la personne qui paie n'avait rien.
//
// Un total n'est pas un état. Le mot d'état vient donc en tête, ici comme dans
// l'agenda du commerçant : « À régler sur place 15,00 € », jamais l'inverse.
// 🔴 LE COMPTE ANNONÇAIT LE TARIF PLEIN. Quatre cartes affichaient
// `commande.total` brut : un Yopper qui avait réglé 26 € grâce à une récompense
// et un bon cadeau lisait « 36.00€ » dans son historique, sans un mot pour
// expliquer les dix euros. La donnée était pourtant là, chargée par le `select
// *` de la liste : c'est l'AFFICHAGE qui l'ignorait.
//
// ⚠️ On ne remplace pas le montant, on montre les DEUX : le prix barré dit d'où
// l'on part, le net dit ce qu'on a payé. Sans le barré, le client se demande si
// le commerçant s'est trompé de prix.
//
// Aucun style propre : le fragment hérite de la couleur et de la taille du
// parent, et fonctionne donc à l'identique dans les quatre cartes.
function MontantPaye({ commande }) {
  const net = montantNetCommande(commande)
  if (net === null) return null
  const brut = Number(commande?.total)
  const remise = Number.isFinite(brut) && brut > net
  return (
    <>
      {remise && (
        <span style={{ textDecoration: 'line-through', fontWeight: 700, opacity: 0.45, marginRight: 5, fontSize: '0.82em' }}>
          {eurosNus(brut)}€
        </span>
      )}
      {eurosNus(net)}€
    </>
  )
}

function PillPaiementClient({ commande, taille = 'normal' }) {
  const etat = etatPaiementClient(commande)
  if (!etat) return null
  const c = couleurPaiement(etat)
  const petit = taille === 'petit'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: petit ? '0.62rem' : '0.68rem', fontWeight: 800,
      padding: petit ? '2px 7px' : '3px 9px', borderRadius: 100,
      background: c.fond, color: c.texte, border: `1px solid ${c.bord}`,
      letterSpacing: '-0.1px', whiteSpace: 'nowrap',
    }}>
      {etat.cle === 'paye' ? (
        <svg width={petit ? 9 : 10} height={petit ? 9 : 10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      ) : (
        <svg width={petit ? 9 : 10} height={petit ? 9 : 10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
      )}
      {etat.libelle}
    </span>
  )
}

function CarteCommerce({ c, favoris, notesParCommerce, statutsCommerce, fermetures, dealsActifs, actusActives, bonnesAffairesActives, onSelect, onToggleFavori, onPartager }) {
  const estFavori = favoris.includes(c.id)
  const noteInfo = notesParCommerce[c.id]
  // ⚠️ Sous 3 avis on ne montre PAS de moyenne : « 5,0 » sur un seul avis se lit
  // comme une réputation alors que c'est du bruit, et cinq étoiles vides à côté
  // de « Pas encore d'avis » se lisaient comme un ZÉRO pour un commerce neuf.
  const resumeNote = resumeAvis(noteInfo || {})
  const info = statutsCommerce[c.id]
  const fermeturesDuCommerce = fermetures?.[c.id] || []
  const bonneAffaire = bonnesAffairesActives?.has(c.id) || false

  function getStatutPhysique() {
    const JOURS_MAP = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
    const JOURS_LABELS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
    const nowDate = new Date()
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes()
    const todayIdx = nowDate.getDay()
    const j = JOURS_MAP[todayIdx]
    const h = c.horaires_detail?.[j]

    // ⚠️ LES CONGÉS ÉTAIENT IGNORÉS ICI. La carte ne lisait que les horaires
    // hebdomadaires : un commerce en fermeture exceptionnelle s'affichait
    // « Ouvert · 07:00-14:00 » en vert, alors que sa fiche, elle, le savait
    // fermé. Le Yopper se déplaçait pour rien.
    const enFermeture = (date) => fermeturesDuCommerce.some(f => {
      const debut = new Date(f.date_debut); debut.setHours(0,0,0,0)
      const fin = new Date(f.date_fin); fin.setHours(23,59,59,999)
      return date >= debut && date <= fin
    })
    if (enFermeture(nowDate)) {
      return { dot: '#9CA3AF', label: 'Fermé exceptionnellement', color: '#6B7280', bg: '#F9FAFB', pulse: false, ferme: true, quand: null }
    }

    // Plages du jour : 1 ou 2 (horaires à pause, ex. restauration 11-14 / 18-22)
    const plagesJour = (hj) => {
      if (!hj?.ouvert) return []
      const out = []
      if (hj.debut && hj.fin) out.push([hj.debut, hj.fin])
      if (hj.debut2 && hj.fin2) out.push([hj.debut2, hj.fin2])
      return out
    }
    const plages = plagesJour(h)

    // Dans une plage → OUVERT (affiche la plage en cours)
    for (const [d, f] of plages) {
      if (nowMin >= heureEnMinutes(d) && nowMin < heureEnMinutes(f)) {
        return { dot: '#10B981', label: `Ouvert · ${d.slice(0,5)}–${f.slice(0,5)}`, color: '#10B981', bg: '#F0FDF4', pulse: true }
      }
    }
    // Entre deux plages → EN PAUSE
    for (let i = 0; i < plages.length - 1; i++) {
      if (nowMin >= heureEnMinutes(plages[i][1]) && nowMin < heureEnMinutes(plages[i+1][0])) {
        return { dot: '#F59E0B', label: `En pause · réouvre à ${plages[i+1][0].slice(0,5)}`, color: '#B45309', bg: '#FFFBEB', pulse: false }
      }
    }
    // Avant la 1re plage du jour
    if (plages.length > 0 && nowMin < heureEnMinutes(plages[0][0])) {
      return { dot: '#9CA3AF', label: `Fermé · ouvre à ${plages[0][0].slice(0,5)}`, color: '#6B7280', bg: '#F9FAFB', pulse: false }
    }

    if (c.horaires_detail) {
      for (let i = 1; i <= 7; i++) {
        const nextIdx = (todayIdx + i) % 7
        const nextJour = JOURS_MAP[nextIdx]
        const nextH = c.horaires_detail[nextJour]
        if (nextH?.ouvert && nextH.debut) {
          const quand = i === 1 ? 'demain' : JOURS_LABELS[nextIdx]
          const label = `Fermé · ouvre ${quand} à ${nextH.debut.slice(0,5)}`
          // `ferme` et `quand` servent à la pastille de créneaux juste en dessous :
          // annoncer « Créneaux disponibles » en vert sous un « Fermé » gris se
          // lit comme une contradiction, même si les deux sont exacts.
          return { dot: '#9CA3AF', label, color: '#6B7280', bg: '#F9FAFB', pulse: false, ferme: true, quand }
        }
      }
    }

    return { dot: '#9CA3AF', label: 'Fermé', color: '#6B7280', bg: '#F9FAFB', pulse: false }
  }

  // ⚠️ PLUS D'HEURE MAGIQUE, ET PLUS DE PASTILLE LÀ OÙ IL N'Y A PAS DE GRILLE.
  // On affichait « Résa dès 21:00 » sur TOUTES les boutiques et TOUS les
  // salons, qui n'ont aucun créneau par construction, et sur les commerces
  // alimentaires dont la journée était finie, pendant des heures. La pastille
  // dit maintenant QUAND, ou ne dit rien.
  function getStatutResa(physiqueEtat) {
    const p = pastilleCreneaux({
      statut: info?.statut,
      creneaux: info?.creneaux || [],
      jour: info?.jour,
      horizon: info?.horizon,
      fermeAujourdhui: !!physiqueEtat?.ferme,
      quandOuvre: physiqueEtat?.quand || null,
    })
    if (!p) return null
    if (p.cle === 'ouvert')    return { dot: '#10B981', label: p.label, color: '#10B981', bg: '#F0FDF4' }
    if (p.cle === 'urgent')    return { dot: '#EA580C', label: p.label, color: '#EA580C', bg: '#FFF7ED' }
    if (p.cle === 'plus_tard') return { dot: T.main,    label: p.label, color: T.main,    bg: T.pale }
    return { dot: '#9CA3AF', label: p.label, color: '#6B7280', bg: '#F9FAFB' }
  }

  const physique = getStatutPhysique()
  // Pas de reservation si le plan ne permet pas la commande (palier Exister)
  const peutCommander = canDo(planEffectif(c), 'commande')
  const resa = peutCommander ? getStatutResa(physique) : null

  return (
    <div onClick={() => onSelect(c)}
      style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: '0.5rem', cursor: 'pointer', boxShadow: '0 1px 4px rgba(26,8,64,0.04)', border: `1px solid ${T.pale}`, transition: 'all 0.2s', position: 'relative' }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 32px rgba(26,8,64,0.12)`; e.currentTarget.style.borderColor = T.light }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(26,8,64,0.04)'; e.currentTarget.style.borderColor = T.pale }}>

      {/* Bande haute 'type' : marqueur de categorie (couleur) + type de commerce (texte) en une seule
          zone, signature visuelle compacte. Plus de pastilles couleur sous le nom = card moins chargee.
          Dispatch centralise via bandeauCategorie() (lib/plans.js) :
          • alimentaire (C&C) → degrade VIOLET canonique (Ink → Main → Light)
          • vitrine (services / RDV) → degrade VERT (Forest → Emerald → Mint)
          • detail (boutique / mise de cote) → degrade ORANGE chaud (Rust → Orange → Peach) */}
      <div style={{
        height: 24,
        background: bandeauCategorie(c),
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 0.875rem',
      }}>
        <span style={{
          color: '#fff',
          fontSize: '0.62rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          textShadow: '0 1px 2px rgba(0,0,0,0.18)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, minWidth: 0,
        }}>
          {c.type || 'Commerce'}
        </span>
        {bonneAffaire && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: '#FCD34D', color: '#7C2D12',
            padding: '2px 8px', borderRadius: 100,
            fontSize: '0.58rem', fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: '0.6px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
            flexShrink: 0,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="#7C2D12" stroke="#7C2D12" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Bonne affaire
          </span>
        )}
      </div>

      {/* Partage du commerce. Un Yopper qui trouve son boucher n'a aucun moyen
          de l'envoyer à quelqu'un sans ouvrir la fiche : le geste est le même
          que celui du cœur, il doit être au même endroit.

          ⚠️ CORRECTION D'ALEX SUR CAPTURE, DEUX FOIS LE 24/08. D'abord « il
          cache trop le logo » : il était posé à `right: 44`, c'est-à-dire en
          PLEIN MILIEU du logo, qui fait 68 de large et commence à `right: 14`.
          Puis, une fois déplacé : « le logo du commerçant ne doit pas être
          mangé ». Les deux boutons sont donc allés jusqu'au bout de leur coin
          et ont MAIGRI : ils débordent vers l'extérieur de la vignette et ne
          lui prennent plus qu'une pointe. C'est l'enseigne du commerçant, la
          seule image par laquelle son client le reconnaît d'un coup d'œil.

          ⚠️ Et le dessin est VIOLET, pas noir (charte, Alex 24/08). `T.deep`
          reste du violet sur le papier, mais à 15 px sur du blanc l'œil n'y
          voit que du noir : c'est `T.main` qui se lit comme du Yoppaa.

          ⚠️ stopPropagation, sinon la carte entière s'ouvre sous le doigt. */}
      <button onClick={e => onPartager?.(c, e)}
        aria-label={`Partager ${c.nom}`}
        style={{
          position: 'absolute', top: 22, right: 74, zIndex: 2,
          background: 'rgba(255,255,255,0.95)',
          border: 'none',
          cursor: 'pointer', padding: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s, box-shadow 0.15s',
          borderRadius: '50%',
          boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
        }}
        onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(26,8,64,0.22)' }}
        onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.10)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.main}
          strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      </button>

      {/* Bouton favori en absolute coin haut droit de la vignette photo.
          Pattern UX standard TGTG/Airbnb : cœur outline → rempli rouge si favori.
          Cohérent avec la fiche détail commerçant (memo UX 2026-06-12). */}
      <button onClick={e => onToggleFavori(c.id, e)}
        aria-label={estFavori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        style={{
          // Poussé jusqu'au bout du coin, et rétréci avec son voisin de partage
          // (Alex, 24/08 : « le logo du commerçant ne doit pas être mangé »).
          position: 'absolute', top: 22, right: 2, zIndex: 2,
          background: 'rgba(255,255,255,0.95)',
          border: 'none',
          cursor: 'pointer', padding: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s, box-shadow 0.15s',
          borderRadius: '50%',
          boxShadow: estFavori ? '0 3px 10px rgba(220,38,38,0.25)' : '0 1px 3px rgba(0,0,0,0.10)',
        }}
        onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(26,8,64,0.22)' }}
        onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = estFavori ? '0 3px 10px rgba(220,38,38,0.25)' : '0 1px 3px rgba(0,0,0,0.10)' }}>
        {/* Le cœur vide suit le partage : violet de la charte, pas du noir. */}
        <svg width="15" height="15" viewBox="0 0 24 24"
          fill={estFavori ? '#DC2626' : 'none'}
          stroke={estFavori ? '#DC2626' : T.main}
          strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>

      <div style={{ padding: '0.5rem 0.875rem 0.625rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: 4 }}>
              <p style={{ fontWeight: 900, color: T.ink, margin: 0, fontSize: '0.95rem', letterSpacing: '-0.3px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 32 }}>{c.nom}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {resumeNote.montreMoyenne && (
                <>
                  <Etoiles note={noteInfo?.moyenne || 0} taille={11}/>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: T.ink }}>{resumeNote.moyenne}</span>
                </>
              )}
              <span style={{ fontSize: '0.68rem', color: resumeNote.aDesAvis ? T.muted : '#D1D5DB' }}>
                {resumeNote.libelleNombre}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6, alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: physique.bg, borderRadius: 100, padding: '3px 8px', border: `1px solid ${physique.dot}22` }}>
                <span style={{ width: physique.pulse ? 9 : 7, height: physique.pulse ? 9 : 7, borderRadius: '50%', background: physique.dot, flexShrink: 0 }}/>
                <span style={{ fontSize: '0.66rem', fontWeight: 700, color: physique.color }}>{physique.label}</span>
              </span>
              {resa && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: resa.bg, borderRadius: 100, padding: '3px 8px', border: `1px solid ${resa.dot}22` }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: resa.dot, flexShrink: 0 }}/>
                  <span style={{ fontSize: '0.66rem', fontWeight: 700, color: resa.color }}>{resa.label}</span>
                </span>
              )}
              {c.distance != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', color: T.muted, fontWeight: 600, minWidth: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  {/* Le nom du lieu n'apparaît que s'il diffère du siège :
                      « 1,2 km » suffit pour une boulangerie, « Salle Saint-Roch »
                      est ce qui manque à un cours de yoga ou à un food truck. */}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.lieu_proche?.libelle ? `${c.lieu_proche.libelle} · ` : ''}{formatDistance(c.distance)}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div style={{ width: 68, height: 68, borderRadius: 14, background: c.logo_url ? '#fff' : T.pale, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(26,8,64,0.10)', border: c.logo_url ? `1px solid ${T.pale}` : 'none', flexShrink: 0 }}>
            {c.logo_url
              ? <img decoding="async" loading="lazy" src={c.logo_url} alt={c.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              : <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9 4 5h16l1 4v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/>
                  <path d="M5 11v10h14V11"/>
                  <path d="M9 21v-6h6v6"/>
                </svg>
            }
          </div>
        </div>
        {/* Pills statut sur toute la largeur de la card : 5 pills une seule ligne, labels complets */}
        <div style={{ marginTop: 8 }}>
          <PillsStatut commercant={c} dealActif={dealsActifs?.has(c.id) || false} actuActive={actusActives?.has(c.id) || false} bonneAffaire={bonneAffaire} size="xs"/>
        </div>
      </div>
    </div>
  )
}

// Une bande de pastilles qui défile, et qui DIT qu'elle continue.
//
// ⚠️ UNE BARRE PLUS LARGE QUE L'ÉCRAN DOIT L'ANNONCER (règle d'Alex). La rangée
// des familles portait bien son voile et ses chevrons ; la rangée des MÉTIERS,
// juste en dessous, défilait en SILENCE (Alex, 19/08). Le client ne voyait
// qu'une partie des métiers présents dans sa zone, et n'avait aucune raison
// d'aller chercher les autres.
//
// ⚠️ ET ON NE DUPLIQUE PAS LA PREMIÈRE RANGÉE, ON LA FACTORISE. La copier
// aurait copié son défaut : elle ne mesurait ses bords QU'AU MONTAGE. Ses
// familles étant fixes, ça passait ; les métiers, eux, changent à chaque
// famille choisie, et les chevrons seraient restés sur l'état précédent, à
// promettre ou à cacher du contenu au hasard. Un observateur de taille règle
// les deux cas d'un coup.
//
// ⚠️ UN MASQUE, JAMAIS UN FLOU : un dégradé vers la couleur du panneau. Le flou
// gelait le défilement sur iPhone, voir `reference_scroll_jank_ios`.
function BandeCategories({ enfants, libelle, couleurFond, pulse = false, style }) {
  const piste = useRef(null)
  const [bords, setBords] = useState({ gauche: false, droite: false })

  useEffect(() => {
    const el = piste.current
    if (!el) return
    const mesurer = () => {
      const b = bordsDefilement(el)
      setBords(prec => (prec.gauche === b.gauche && prec.droite === b.droite) ? prec : b)
    }
    mesurer()
    el.addEventListener('scroll', mesurer, { passive: true })
    window.addEventListener('resize', mesurer)
    // Molette verticale -> défilement horizontal sur PC. Le geste horizontal
    // natif du pavé tactile reste intact.
    function onWheel(e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault() }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mesurer) : null
    if (obs) { obs.observe(el); for (const enfant of el.children) obs.observe(enfant) }
    return () => {
      el.removeEventListener('scroll', mesurer)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', mesurer)
      obs?.disconnect()
    }
  }, [enfants])

  const glisser = (sens) => {
    const el = piste.current
    if (el) el.scrollBy({ left: sens * Math.max(180, el.clientWidth * 0.7), behavior: 'smooth' })
  }

  const bouton = (cote, actif) => {
    const gauche = cote === 'gauche'
    return (
      <button type="button" onClick={() => glisser(gauche ? -1 : 1)}
        aria-label={`${libelle} ${gauche ? 'précédents' : 'suivants'}`}
        aria-hidden={!actif} tabIndex={actif ? 0 : -1}
        style={{
          position: 'absolute', top: 0, bottom: '0.875rem', width: 42, padding: 0, border: 'none',
          [gauche ? 'left' : 'right']: 0,
          [gauche ? 'paddingLeft' : 'paddingRight']: 6,
          display: 'flex', alignItems: 'center', justifyContent: gauche ? 'flex-start' : 'flex-end',
          background: `linear-gradient(to ${gauche ? 'left' : 'right'}, transparent, ${couleurFond} 70%)`,
          cursor: 'pointer', opacity: actif ? 1 : 0,
          pointerEvents: actif ? 'auto' : 'none', transition: 'opacity 0.2s',
        }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
          animation: (pulse && !gauche) ? 'cats-chev-pulse 1.4s ease-in-out infinite' : 'none',
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d={gauche ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}/>
          </svg>
        </span>
      </button>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={piste} className="cats" style={style}>{enfants}</div>
      {bouton('gauche', bords.gauche)}
      {bouton('droite', bords.droite)}
    </div>
  )
}

// Les deux rangées de catégories de l'accueil : les familles, puis les métiers
// présents dans la zone pour la famille choisie.
function CategoriesScroll({ familleActive, setFamilleActive, metierActif, setMetierActif, metiersZone }) {
  return (
    <div>
    {/* Rangée 1 : les familles. Le chevron de droite pulse, c'est la première
        invitation au geste que voit un visiteur qui arrive. */}
    <BandeCategories libelle="Catégories" couleurFond={T.bgPanel} pulse enfants={
      FAMILLES.map(f => (
        <button key={f.key} onClick={() => { setFamilleActive(f.key); setMetierActif(null) }}
          style={{ flexShrink: 0, padding: '0.45rem 1rem', borderRadius: 100, border: familleActive===f.key ? 'none' : `1px solid ${T.light}33`, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', background: familleActive===f.key ? '#fff' : 'rgba(255,255,255,0.08)', color: familleActive===f.key ? T.main : '#fff', transition: 'all 0.15s', boxShadow: familleActive===f.key ? `0 4px 14px rgba(255,255,255,0.25)` : 'none', letterSpacing: '-0.2px' }}>
          {f.label}
        </button>
      ))
    }/>
    {/* Rangée 2 : métiers présents dans la zone pour la famille choisie
        (avec compteur). Toggle : retaper le métier actif revient à la famille.
        ⚠️ Elle défilait SANS RIEN DIRE jusqu'au 19/08 : voile et chevrons
        s'arrêtaient à la rangée du dessus. Pas de pulsation ici, un seul
        clignotement à l'écran suffit à dire « ça continue ». */}
    {familleActive !== 'tous' && metiersZone.length > 0 && (
      <BandeCategories libelle="Métiers" couleurFond={T.bgPanel} style={{ marginTop: '-0.25rem' }} enfants={
        metiersZone.map(([metier, n]) => {
          const actif = metierActif === metier
          return (
            <button key={metier} onClick={() => setMetierActif(actif ? null : metier)}
              style={{ flexShrink: 0, padding: '0.3rem 0.8rem', borderRadius: 100, border: actif ? 'none' : `1px solid ${T.light}26`, cursor: 'pointer', fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap', background: actif ? T.light : 'rgba(255,255,255,0.06)', color: actif ? T.deep : 'rgba(255,255,255,0.85)', transition: 'all 0.15s', letterSpacing: '-0.2px' }}>
              {metier}<span style={{ marginLeft: 5, opacity: 0.6, fontWeight: 800 }}>{n}</span>
            </button>
          )
        })
      }/>
    )}
    <style>{`
      @keyframes cats-chev-pulse {
        0%, 100% { transform: translateX(0);   opacity: 1; }
        50%      { transform: translateX(3px); opacity: 0.6; }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes cats-chev-pulse { 0%, 100% { transform: none; opacity: 1; } }
      }
    `}</style>
    </div>
  )
}

// ─── Icône SVG : enveloppe ouverte avec soleil dedans (Option D) ──────────────
// Hybride SVG + emoji : enveloppe dessinée en SVG monochrome (cohérent design
// system Yoppaa) + soleil ☀️ emoji centré dans le corps. L'emoji natif du
// système apporte une touche chaleureuse jaune/orange qui contraste joliment
// avec le fond violet du header. Métaphore "lettre du matin" préservée.
function IconCourrierMatin({ size = 24, color = '#fff' }) {
  return (
    <span style={{ display: 'inline-flex', position: 'relative', width: size, height: size, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        {/* Rabat triangulaire ouvert vers le haut */}
        <polyline points="3 9 12 3 21 9"/>
        {/* Corps de l'enveloppe */}
        <rect x="3" y="9" width="18" height="13" rx="2"/>
      </svg>
      {/* Soleil ☀️ emoji centré dans le corps (légèrement décalé vers le bas pour rester sous le rabat) */}
      <span aria-hidden="true" style={{
        position: 'absolute',
        top: '62%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        ☀️
      </span>
    </span>
  )
}

// ─── Bouton "Good Morning Yoppers" du header ─────────────────────────────────
// Affiche un badge violet pulse si le yopper n'a pas vu son Good Morning
// aujourd'hui (localStorage gm_seen_YYYY-MM-DD). Au tap, navigue vers /commander/morning.
function BoutonGoodMorning({ onClick, nonVu }) {
  return (
    <button onClick={onClick}
      aria-label={nonVu ? 'Bon matin, ton Good Morning Yoppers est arrivé' : 'Good Morning Yoppers'}
      style={{
        position: 'relative',
        width: 46, height: 46, borderRadius: '50%',
        // Un point violet sur un fond violet ne se voit pas et ne donne envie
        // de rien (Alex, 05/08). Quand le Good Morning n'a pas été lu, c'est le
        // BOUTON ENTIER qui s'allume comme un lever de soleil : chaud, vivant,
        // impossible à confondre avec le reste du bandeau. Une fois lu, il
        // redevient discret et ne réclame plus l'attention.
        background: nonVu
          ? 'linear-gradient(135deg, #FDBA74 0%, #FB923C 45%, #C4A0F4 100%)'
          : 'rgba(255,255,255,0.12)',
        border: `1px solid ${nonVu ? 'rgba(253,186,116,0.9)' : 'rgba(255,255,255,0.18)'}`,
        boxShadow: nonVu ? '0 0 0 3px rgba(251,146,60,0.22), 0 6px 20px rgba(251,146,60,0.45)' : 'none',
        color: '#fff', cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit',
        transition: 'all 0.2s',
        animation: nonVu ? 'gmLeverSoleil 2.6s ease-in-out infinite' : 'none',
      }}>
      <IconCourrierMatin size={30} color="#fff"/>
      {nonVu && (
        <>
          {/* Le mot fait le travail que le point ne faisait pas : il annonce
              qu'il y a quelque chose à lire, aujourd'hui. */}
          <span aria-hidden="true" style={{
            position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)',
            background: '#1A0840', color: '#FDBA74',
            fontSize: 8.5, fontWeight: 900, letterSpacing: '0.5px',
            padding: '2px 7px', borderRadius: 100, whiteSpace: 'nowrap',
            border: '1px solid rgba(253,186,116,0.5)', textTransform: 'uppercase',
          }}>
            Nouveau
          </span>
          <style>{`@keyframes gmLeverSoleil {
            0%, 100% { transform: translateY(0) scale(1); }
            50%      { transform: translateY(-2.5px) scale(1.05); }
          }`}</style>
        </>
      )}
    </button>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Commander() {
  const router = useRouter()

  // Good Morning Yoppers : le bouton s'allume si le Yopper n'a pas encore
  // ouvert sa page du jour. Ça ne suffisait pas (Alex, 05/08) : le badge
  // s'allumait aussi les jours où l'édition était VIDE, et promettait donc du
  // contenu inexistant. Un badge qui ment deux fois ne se regarde plus jamais.
  // On vérifie donc qu'il y a réellement quelque chose dans SA commune.
  const [gmPasOuvert, setGmPasOuvert] = useState(false)
  const [gmADuContenu, setGmADuContenu] = useState(false)
  const gmNonVu = gmPasOuvert && gmADuContenu
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' })  // YYYY-MM-DD
    setGmPasOuvert(!localStorage.getItem(`yoppaa_gm_seen_${today}`))
  }, [])

  // ⚠️ showSplash S'INITIALISE À `true`, ET SÛREMENT PAS À `false`.
  //
  // La contrainte d'origine tient toujours : serveur et premier rendu client
  // doivent donner la MÊME valeur, sinon mismatch d'hydration React #418 (mur
  // d'erreurs postMessage constaté le 03/07). Mais `true` la respecte tout
  // autant que `false` : ce qui compte, c'est que les deux côtés s'accordent,
  // pas la valeur choisie. On lit sessionStorage après montage, comme avant.
  //
  // Et `false` fabriquait un défaut visible, signalé par Alex le 19/08 : la
  // page peignait l'ACCUEIL EN CLAIR, logo de l'en-tête compris, avant que
  // l'effet ne monte le splash violet. Au lancement d'une PWA iOS ça donnait
  // DEUX arrivées de suite : l'image native sombre, un éclair d'app claire,
  // puis le splash animé. « Deux animations », mot pour mot.
  //
  // Avec `true`, le HTML du tout premier jet EST le dégradé du splash, donc
  // exactement ce que l'image `apple-touch-startup-image` vient de peindre.
  // Le relais est invisible.
  //
  // Contrepartie assumée : celui qui a DÉJÀ vu le splash dans sa session voit
  // une image de dégradé avant que l'effet ne le retire. C'est une trame,
  // sombre, sur une app dont le splash est sombre. L'éclair blanc d'avant
  // était bien plus violent.
  const [showSplash, setShowSplash] = useState(true)
  useEffect(() => {
    // ⚠️ LE BRANCHEMENT DES 4 ÉCRANS D'ACCUEIL.
    //
    // Ils existaient depuis des semaines et PERSONNE NE LES VOYAIT :
    // `yoppaa_onboarding_done` était posé à six endroits et lu à aucun, et
    // rien ne routait vers `/onboarding`. C'est ici que ça se joue, et pas
    // dans `start_url` du manifeste : le manifeste ne gouverne QUE le
    // lancement depuis l'écran d'accueil, alors qu'un premier client arrive
    // le plus souvent par un lien. Le drapeau, lui, protège les deux entrées.
    //
    // Et le splash ne se joue PAS ce jour-là. Sinon la toute première
    // ouverture enchaînerait l'écran du système, 2,4 s d'animation, puis
    // quatre écrans : personne n'a envie de ça pour dire bonjour.
    if (!localStorage.getItem('yoppaa_onboarding_done')) {
      setShowSplash(false)
      router.replace('/onboarding')
      return
    }
    if (sessionStorage.getItem('yoppaa_splash_seen')) setShowSplash(false)
  }, [])
  function onSplashDone() { sessionStorage.setItem('yoppaa_splash_seen', '1'); setShowSplash(false) }

  const [onglet, setOngletState] = useState('accueil')

  // Cartes de fidélité du Yopper : chargées à l'ouverture du Profil.
  // fetchYopper obligatoire : la route exige une identité prouvée depuis le
  // 03/08. Avec un fetch nu, le profil restait vide en silence.
  useEffect(() => {
    if (onglet !== 'profil') return
    let vivant = true
    fetchYopper('/api/fidelite/mes-cartes', {
      method: 'POST',
      body: JSON.stringify({ action: 'list' }),
    })
      .then(r => r.json())
      .then(j => {
        if (!vivant || !j?.ok) return
        setMesCartesFid(j.cartes || [])
        setFidConnecte(j.connecte !== false)
      })
      .catch(() => {})
    return () => { vivant = false }
  }, [onglet])

  // ⚠️ MES BONS CADEAUX (28/08). Ils n'existaient que dans l'email reçu le jour
  // de l'achat : perdre l'email, c'était perdre le bon. La page `/cadeau` était
  // bien faite mais ORPHELINE, aucun écran n'y menait.
  //
  // ⚠️ `fetchYopper`, pas `fetch` : la route exige une identité PROUVÉE. Un
  // fetch nu laisserait la liste vide EN SILENCE, comme la fidélité l'a été
  // pendant deux jours.
  useEffect(() => {
    if (onglet !== 'profil') return
    let vivant = true
    fetchYopper('/api/yopper/mes-bons', {
      method: 'POST',
      body: JSON.stringify({ action: 'list' }),
    })
      .then(r => r.json())
      .then(j => { if (vivant && j?.ok) setMesBons(j.bons || []) })
      .catch(() => {})
    return () => { vivant = false }
  }, [onglet])
  function setOnglet(val) { setOngletState(val); localStorage.setItem('yoppaa_onglet', val) }

  // Sous-onglet de l'onglet Commandes : 'alimentaires' (C&C) ou 'rdvs' (vitrines).
  // Persistance sessionStorage pour conserver le dernier choix sans le mettre dans
  // le localStorage long-terme (les RDVs sont plus rares, le default 'alimentaires' a la priorite).
  const [sousOngletCmd, setSousOngletCmd] = useState('alimentaires')

  // Signal envoye a EditablePrenom pour ouvrir l'editor depuis le bandeau "Complete tes infos"
  // (cf memory feedback-zero-friction : on offre un raccourci direct au lieu d'une instruction)
  const [editProfilSignal, setEditProfilSignal] = useState(0)

  // Toast : message ephemere en bas d'ecran (3.5s). Tout ce qui a besoin d'un feedback rapide passe par ici.
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  function showToast(msg) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  // Partage de l'app (onglet Tribu) : Web Share natif, repli copie du lien.
  async function partagerYoppaa() {
    const url = 'https://www.yoppaa.app'
    const texte = 'Découvre Yoppaa, ton quartier dans ta poche : commande et réserve chez tes commerçants locaux.'
    try {
      if (navigator.share) { await navigator.share({ title: 'Yoppaa', text: texte, url }); return }
      await navigator.clipboard.writeText(url)
      showToast({ type: 'success', msg: 'Lien copié, partage-le autour de toi !' })
    } catch { /* partage annulé par l'utilisateur : silencieux */ }
  }

  // Partage d'UN commerce depuis sa carte d'accueil. Même mécanique que le
  // partage de l'app : Web Share natif, repli sur la copie du lien.
  //
  // ⚠️ LE LIEN PASSE TOUJOURS PAR /commander/<slug>, jamais par /commander/rdv/.
  // Vérifié : la fiche redirige elle-même un commerce vitrine vers sa page RDV
  // (app/commander/[slug]/page.js, `router.replace` sur categorie === 'vitrine').
  // Une seule forme de lien à maintenir, et c'est EXACTEMENT celle que le QR du
  // kit média imprime déjà : un lien partagé et un lien imprimé qui divergent,
  // c'est deux règles à corriger le jour où la route change.
  async function partagerCommerce(c, e) {
    e?.stopPropagation?.()
    if (!c?.slug) return
    const url = `https://www.yoppaa.app/commander/${encodeURIComponent(c.slug)}`
    const texte = `${c.nom} est sur Yoppaa, ton quartier dans ta poche.`
    try {
      if (navigator.share) { await navigator.share({ title: c.nom, text: texte, url }); return }
      await navigator.clipboard.writeText(url)
      showToast({ type: 'success', msg: 'Lien copié, partage-le autour de toi !' })
    } catch { /* partage annulé par l'utilisateur : silencieux */ }
  }

  // Modal confirmation custom (remplace window.confirm() qui est bloque/silencieux
  // en PWA installee iPhone). Utilisee pour confirmer annulations RDV et commandes.
  const [confirmModal, setConfirmModal] = useState(null)
  // `cancelLabel` et `onCancel` servent aux choix à deux issues, où le second
  // bouton n'est pas « je renonce » mais une vraie décision : garder ses
  // produits ou les rendre, par exemple.
  function askConfirm({ title, message, confirmLabel = 'Confirmer', cancelLabel = null, danger = false, onConfirm, onCancel = null }) {
    setConfirmModal({ title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel })
  }

  const [commercants, setCommercants] = useState([])
  // Le chargement de la liste devait se DIRE. Tant qu'il n'existait pas, une
  // liste encore vide déclenchait « Aucun résultat », et au retour sur l'app,
  // quand la requête est la plus lente, le Yopper croyait qu'il n'y avait
  // aucun commerce chez lui. Vrai vide et pas-encore-chargé sont deux choses
  // différentes, elles doivent se lire différemment.
  const [commercesEnChargement, setCommercesEnChargement] = useState(true)
  // Le dernier chargement a-t-il échoué ? Une panne de réseau doit se dire, et
  // se réessayer, pas se déguiser en « aucun commerce chez toi ».
  const [erreurChargement, setErreurChargement] = useState(false)
  const [notesParCommerce, setNotesParCommerce] = useState({})
  // ⚠️ LA PERTE DE SESSION DOIT SE VOIR. Sur iPhone, le jeton du Yopper peut
  // mourir pendant que l'application dort. Jusqu'ici, tout se vidait en
  // silence : zéro commande, zéro rendez-vous, zéro euro, pendant que son nom
  // et son email restaient affichés. Il n'avait aucun moyen de comprendre, et
  // redémarrer l'application n'y changeait rien.
  const [sessionPerdue, setSessionPerdue] = useState(false)
  const [statutsCommerce, setStatutsCommerce] = useState({})
  // Fermetures exceptionnelles, par commerçant. La carte les ignorait : un
  // commerce en congé s'affichait « Ouvert » en vert sur l'accueil.
  const [fermetures, setFermetures] = useState({})
  // Set des commerçants qui ont un deal/actu actif aujourd'hui (pour dot LIVE sur pills)
  const [dealsActifs, setDealsActifs] = useState(new Set())
  const [actusActives, setActusActives] = useState(new Set())
  const [bonnesAffairesActives, setBonnesAffairesActives] = useState(new Set())
  const [position, setPosition] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [rue, setRue] = useState(null)
  const [showLocManuelle, setShowLocManuelle] = useState(false)
  // Appui long sur la pastille d'adresse : rafraîchir la position sans ouvrir le
  // panneau. Deux références plutôt qu'un état : elles ne doivent surtout pas
  // provoquer de rendu, sans quoi le bouton se reconstruirait pendant l'appui.
  const appuiLongRef = useRef(false)
  const minuteurAppuiRef = useRef(null)
  const [locManuelle, setLocManuelle] = useState('')
  // Filtre accueil : famille (3 catégories commerçant) + métier précis optionnel
  const [familleActive, setFamilleActive] = useState('tous')
  const [metierActif, setMetierActif] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [favoris, setFavoris] = useState([])
  const [commercantsFavoris, setCommercantsFavoris] = useState([])
  const [client, setClient] = useState({ nom: '', email: '', telephone: '', prenom: '' })
  const [clientId, setClientId] = useState(null)
  const [aMotDePasse, setAMotDePasse] = useState(false)  // le compte Supabase a-t-il déjà un mot de passe ?
  const [clientCommandes, setClientCommandes] = useState([])
  // B.6 fidélité : mes cartes (rattachées par les téléphones de mes commandes)
  const [mesCartesFid, setMesCartesFid] = useState([])
  // Mes bons cadeaux dépensables, tous commerces confondus, du plus proche de
  // l'expiration au plus lointain (la route les trie).
  const [mesBons, setMesBons] = useState([])
  const [fidConnecte, setFidConnecte] = useState(true)
  const [clientRdvs, setClientRdvs] = useState([])
  // Les abonnements de la cliente. Vide pour l'immense majorité des Yoppers,
  // et c'est pour ça que leur onglet n'existe QUE s'il y en a au moins un.
  const [clientAbonnements, setClientAbonnements] = useState([])

  // ⚠️ L'ONGLET DES ABONNEMENTS PEUT DISPARAÎTRE SOUS LES PIEDS : il n'existe
  // que tant qu'il reste un contrat. Une résiliation, une déconnexion ou une
  // lecture qui échoue, et le Yopper se retrouverait devant un écran vide sans
  // aucun onglet actif, sans rien pour lui dire où il est. On le ramène.
  //
  // ⚠️ ET CE BLOC EST ICI, APRÈS LA DÉCLARATION, PAS PLUS HAUT. Je l'avais
  // d'abord écrit à côté de `sousOngletCmd`, cent lignes au-dessus : le tableau
  // de dépendances lit `clientAbonnements` pendant le rendu, donc AVANT son
  // `const`, et c'est un ÉCRAN BLANC que ni le lint, ni le build, ni le banc
  // n'attrapent. Exactement le défaut qui a cassé l'accueil en production le
  // 12/08.
  useEffect(() => {
    if (sousOngletCmd === 'abos' && clientAbonnements.length === 0) setSousOngletCmd('rdvs')
  }, [sousOngletCmd, clientAbonnements.length])
  // Commune du Yopper (référentiel `communes` joint via clients.commune_id)
  // commune = null  : pas encore chargé ou client pas connecté
  // commune = false : client connecté mais aucune commune setée → modale ConfirmCommune
  const [commune, setCommune] = useState(null)
  const [showConfirmCommune, setShowConfirmCommune] = useState(false)

  // L'édition du jour a-t-elle du contenu dans CETTE commune ? Mis en cache
  // pour la journée : la réponse ne change qu'au cron de 7h30, il est inutile
  // de la redemander à chaque ouverture de l'application.
  useEffect(() => {
    if (!commune?.codes_postaux?.length) return
    const jour = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' })
    const cle = `yoppaa_gm_contenu_${jour}_${commune.codes_postaux[0]}`
    const memo = sessionStorage.getItem(cle)
    if (memo !== null) { setGmADuContenu(memo === '1'); return }
    let vivant = true
    morningADuContenu(supabase, commune)
      .then(oui => {
        if (!vivant) return
        sessionStorage.setItem(cle, oui ? '1' : '0')
        setGmADuContenu(oui)
      })
      .catch(() => {})
    return () => { vivant = false }
  }, [commune])
  // Les services publics (commune, CPAS, police, urgences) ont été retirés du
  // produit le 09/08. Ni state, ni requête, ni onglet.
  // Modal d'avis post-commande : commande pour laquelle on propose un avis
  // (déclenché auto quand statut='recupere' et pas encore d'avis pour cette commande)
  const [avisCommande, setAvisCommande] = useState(null)
  // Anti-rafale (bug Alex 31/07) : UNE seule sollicitation d'avis par visite.
  // Sans ce verrou, fermer une modale déclenchait aussitôt la suivante
  // (le refresh des commandes relançait l'effet sur la commande d'après).
  const avisSessionRef = useRef(false)
  const [pickupCommande, setPickupCommande] = useState(null)
  // Tick minute pour rafraichir le compteur "Plus que X min avant ton créneau"
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    // Query param ?onglet=accueil prioritaire sur localStorage : utile pour
    // la démo (slide 8 force l'onglet Accueil sans dépendre de l'historique).
    // Garde-fou : l'onglet « Officiel » n'existe plus (09/08). Un ancien lien
    // ou un onglet mémorisé en localStorage retombe sur l'accueil plutôt que
    // d'afficher une page vide.
    const urlParams = new URLSearchParams(window.location.search)
    const ongletFromUrl = urlParams.get('onglet')
    const normaliser = (v) => (v === 'services' ? 'accueil' : v)
    if (ongletFromUrl) {
      setOngletState(normaliser(ongletFromUrl))
    } else {
      const savedOnglet = localStorage.getItem('yoppaa_onglet')
      if (savedOnglet) setOngletState(normaliser(savedOnglet))
    }
    // Sous-onglet pour la page "Yoppers" (commandes vs rdvs). Param ?tab=rdvs
    // utilise depuis les emails RDV pour ouvrir directement la liste des RDV.
    const tabFromUrl = urlParams.get('tab')
    if (tabFromUrl === 'rdvs' || tabFromUrl === 'alimentaires') {
      setSousOngletCmd(tabFromUrl)
    }
    chargerCommercants()
    // PAS demanderGeolocalisation() directement : appelée à chaque montage,
    // elle rouvrait la fenêtre d'autorisation encore et encore (Alex, 07/08).
    geolocaliserAuDemarrage()

    // ⚠️ ET AU RETOUR AU PREMIER PLAN. Le Yopper ouvre l'application chez lui,
    // la laisse en fond, la rouvre trois rues plus loin : sans ceci, elle lui
    // montrait encore les commerces de son point de départ. Une application
    // installée sur téléphone n'est presque jamais rechargée, elle est
    // seulement remise au premier plan.
    //
    // ⚠️ On repasse par `geolocaliserAuDemarrage`, jamais par la demande
    // directe : lui seul sait qu'une autorisation refusée ne se redemande pas.
    // Appeler `demanderGeolocalisation` ici rouvrirait la fenêtre à chaque
    // bascule d'application, exactement le défaut corrigé le 07/08.
    const auRetour = () => { if (document.visibilityState === 'visible') geolocaliserAuDemarrage() }
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('focus', auRetour)

    // Sess 7 : Safari iOS ITP purge le localStorage apres 7j sans visite,
    // ce qui fait "disparaitre" les RDV/commandes cote client iPhone. Fallback :
    // cookie HTTP-only Same-Site (route /api/yopper/session) qui survit a ITP.
    // Priorite : localStorage (rapide, aucune requete), puis cookie serveur en
    // dernier recours. A chaque hydratation reussie, on re-sync le cookie pour
    // reset son Max-Age.
    async function hydrateYopper() {
      let email = localStorage.getItem('yoppaa_email')
      let nom = localStorage.getItem('yoppaa_nom')
      let prenom = localStorage.getItem('yoppaa_prenom')
      let telephone = localStorage.getItem('yoppaa_telephone')
      let id = localStorage.getItem('yoppaa_client_id')
      // Fallback cookie si localStorage vide (Safari iOS ITP purge probable)
      if (!email || !id) {
        try {
          const res = await fetch('/api/yopper/session')
          const data = await res.json()
          if (data.ok && data.identity?.email && data.identity?.client_id) {
            id       = data.identity.client_id
            email    = data.identity.email
            prenom   = data.identity.prenom || ''
            nom      = data.identity.nom || ''
            telephone= data.identity.telephone || ''
            // Restore localStorage pour les prochains reload rapides
            localStorage.setItem('yoppaa_client_id', id)
            localStorage.setItem('yoppaa_email', email)
            if (prenom)    localStorage.setItem('yoppaa_prenom', prenom)
            if (nom)       localStorage.setItem('yoppaa_nom', nom)
            if (telephone) localStorage.setItem('yoppaa_telephone', telephone)
          }
        } catch (e) {
          console.warn('[hydrate] cookie fallback KO', e?.message)
        }
      }
      if (email && id) {
        setClient(p => ({ ...p, email, nom: nom || '', prenom: prenom || '', telephone: telephone || '' }))
        setClientId(id)
        chargerFavoris(id)
        chargerCommandesClient(email); chargerRdvsClient(email); chargerAbonnementsClient()
        // Sync cookie serveur AWAITED (pas fire-and-forget) : le cookie doit
        // refléter le client courant AVANT l'appel get-own (commune/profil), sinon
        // get-own lit un cookie périmé -> mauvais client -> la modale commune
        // réapparaît à chaque connexion (bug 11).
        await fetch('/api/yopper/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: id, email, prenom, nom, telephone }),
        }).catch(() => {})
      }
      return { email, id, telephone, prenom, nom }
    }
    hydrateYopper().then(({ id, telephone, prenom, nom }) => {
      if (!id) return
      // Si telephone manquant en local (cas Magic Link sans signup complet, ou EditablePrenom save sans reload),
      // recharger depuis la DB pour synchroniser le state + localStorage. Sinon le bandeau "Profil incomplet"
      // reapparait apres chaque reload alors que la valeur est bien en DB.
      // Profil (prefill si manquant) + commune du Yopper, côté serveur (RLS clients
      // verrouillé, autorisé par le cookie Yopper). Un seul appel pour les deux.
      // ⚠️ C'ÉTAIT UN `fetch` NU sur une route qui exige une identité prouvée :
      // elle répondait 401 à TOUS LES COUPS, et la commune du Yopper n'était
      // jamais chargée par cette voie. Le `catch` muet et le `if (!data) return`
      // faisaient passer l'échec pour un silence normal.
      fetchYopper('/api/yopper/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-own' }) })
        .then(r => r.json())
        .then(j => {
          const data = j?.client
          if (!data) return  // pas de session serveur : on ne force pas la modale (évite une boucle sans cookie)
          if (!telephone) {
            if (data.telephone) { localStorage.setItem('yoppaa_telephone', data.telephone); setClient(p => ({ ...p, telephone: data.telephone })) }
            if (data.prenom && !prenom) { localStorage.setItem('yoppaa_prenom', data.prenom); setClient(p => ({ ...p, prenom: data.prenom })) }
            if (data.nom && !nom) { localStorage.setItem('yoppaa_nom', data.nom); setClient(p => ({ ...p, nom: data.nom })) }
          }
          if (data.commune) setCommune(data.commune)
          else { setCommune(false); setShowConfirmCommune(true) }
        })
        .catch(() => {})
    })

    // Les écouteurs de retour au premier plan s'empileraient à chaque montage
    // sans ce nettoyage, et la position serait redemandée autant de fois.
    return () => {
      document.removeEventListener('visibilitychange', auRetour)
      window.removeEventListener('focus', auRetour)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  }, [])

  // Détecte si le compte Supabase a déjà un mot de passe (user_metadata.has_password)
  // pour afficher "Modifier" plutôt que "Créer" dans le Profil. On écoute
  // onAuthStateChange (fiable dès que la session est prête : SIGNED_IN au load,
  // USER_UPDATED après définition du mdp) + un getUser initial de secours.
  useEffect(() => {
    const check = (user) => setAMotDePasse(!!user?.user_metadata?.has_password)
    supabase.auth.getUser().then(({ data }) => check(data?.user)).catch(() => {})
    // ⚠️ CETTE ÉCOUTE IGNORAIT LA DÉCONNEXION. Elle ne regardait que le mot de
    // passe, alors qu'elle est le seul endroit de l'application prévenu quand
    // la session tombe. `SIGNED_OUT` est émis par la bibliothèque au moment
    // exact où elle efface une session dont le renouvellement a été refusé :
    // c'est là qu'il faut l'attraper, pas cinq secondes plus tard sur un 401.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      check(session?.user)
    })

    // ⚠️ LE BANDEAU « SESSION EXPIRÉE » NE S'ALLUME PLUS QU'EN DERNIER RECOURS.
    // Il s'affichait dès le `SIGNED_OUT`, c'est-à-dire au moment exact où la
    // bibliothèque effaçait une session perdue dans une course de
    // renouvellement. Or cette session est RÉCUPÉRABLE : on en garde une copie,
    // et on la repose avant de déranger qui que ce soit.
    // Alex, 22/08 : la déconnexion n'appartient qu'au Yopper.
    const debrancher = brancherSessionPermanente(perdue => setSessionPerdue(perdue))

    return () => {
      try { sub?.subscription?.unsubscribe() } catch (e) {}
      debrancher()
    }
  }, [])

  // ─── Polling client 5s ─────────────────────────────────────────────────────
  // IMPORTANT : on relit localStorage à CHAQUE tick (pas seulement au mount).
  // Sinon après "Se déconnecter", la closure conservait l'ancien email et le
  // polling continuait à re-fetch les commandes, faisant réapparaître l'onglet
  // Commandes côté UI après le clear state.
  // ⚠️ CE RELEVÉ TOURNAIT TOUTES LES 5 SECONDES SANS REGARDER SI L'ÉCRAN ÉTAIT
  // ALLUMÉ, et c'est lui qui déclenchait la perte de session.
  //
  // Chaque tick lance deux appels, donc deux lectures de session. Dans les 90
  // dernières secondes de vie du jeton, chaque lecture tente un renouvellement.
  // Au retour au premier plan, ces tentatives se superposent à celle que la
  // bibliothèque lance de son côté : le jeton de rafraîchissement est consommé
  // deux fois, le second essai reçoit « déjà utilisé », et la session est
  // effacée pour de bon.
  //
  // Les deux autres relevés de cette page vérifient déjà la visibilité ; celui-
  // ci avait été oublié. Et cinq secondes n'apportaient rien : le Yopper n'a pas
  // besoin de voir sa commande changer d'état à la seconde près.
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const email = typeof window !== 'undefined' ? localStorage.getItem('yoppaa_email') : null
      if (!email) return  // utilisateur déconnecté → on saute ce tick (mais on laisse l'interval tourner pour le cas re-login)
      chargerCommandesClient(email); chargerRdvsClient(email); chargerAbonnementsClient()
    }, 15000)
    return () => clearInterval(iv)
  }, [])

  // ─── Détection commandes récupérées → propose modale d'avis ─────────────
  // Avis vérifié = uniquement lié à une vraie commande (pas d'avis spontané = anti-troll).
  // Trigger : commande passée à statut='recupere' DEPUIS AU MOINS 60 MIN, pas
  // encore d'avis posté, pas ignoré côté serveur.
  //
  // Décision Alex 01/07/2026 :
  //   - Délai de 60 minutes après recupere_at pour laisser le Yopper goûter
  //     ou utiliser avant de solliciter l'évaluation.
  //   - Le dismiss est persisté côté serveur (commandes.avis_ignore_at) au
  //     lieu de localStorage, pour ne plus reproposer sur les autres devices.
  useEffect(() => {
    if (!clientId || avisCommande) return
    if (avisSessionRef.current) return  // une seule sollicitation par visite (anti-rafale)
    if (!clientCommandes.length) return

    const nowMs = Date.now()
    const DELAI_MIN_MS = 60 * 60 * 1000              // 60 minutes après le retrait
    const FENETRE_MAX_MS = 7 * 24 * 60 * 60 * 1000   // pertinence : 7 jours max

    // Dismiss LOCAL en secours : si l'API ignore-avis a échoué (cookie yopper
    // absent sur ce device, réseau), la commande ne re-sollicite plus ici.
    let ignoresLocaux = new Set()
    try { ignoresLocaux = new Set(JSON.parse(localStorage.getItem('yoppaa_avis_ignores') || '[]')) } catch { /* ignore */ }

    const candidates = clientCommandes.filter(c => {
      if (c.statut !== 'recupere' || !c.commercant_id) return false
      if (c.avis_ignore_at) return false     // dismiss serveur
      if (ignoresLocaux.has(c.id)) return false  // dismiss local (fallback)
      if (!c.recupere_at) return false       // pas encore setté = trop tôt
      const age = nowMs - new Date(c.recupere_at).getTime()
      return age >= DELAI_MIN_MS && age <= FENETRE_MAX_MS
    })
    if (candidates.length === 0) return

    let annule = false
    // Même route serveur : on a besoin de savoir quelles commandes ont déjà
    // reçu un avis, sans exposer la table.
    fetchYopper('/api/yopper/avis')
      .then(r => r.json())
      .then(j => {
        if (annule) return
        const dejaAvis = new Set((j?.avis || []).map(a => a.commande_id).filter(Boolean))
        // Prend la commande la plus récente (clientCommandes est ordonné par created_at desc côté chargerCommandesClient)
        const prochaine = candidates.find(c => !dejaAvis.has(c.id))
        if (prochaine) { avisSessionRef.current = true; setAvisCommande(prochaine) }
      })
    return () => { annule = true }
  }, [clientCommandes, clientId, avisCommande])

  // Cache reverse geocoding : si on a deja resolu une position proche (~100m), on
  // reutilise la valeur en localStorage et on evite de pinger Nominatim a chaque refresh
  // (leur API publique gratuite a une politique 1 req/s max - sinon ils repondent vide).
  function libelleAdresse(addr) {
    if (!addr) return null
    const rue = addr.road || addr.pedestrian || addr.footway || addr.street || addr.path
    const n = addr.house_number
    if (rue) return n ? `${rue} ${n}` : rue
    return addr.quarter
        || addr.neighbourhood
        || addr.suburb
        || addr.hamlet
        || addr.village
        || addr.town
        || addr.city
        || addr.municipality
        || null
  }

  // Au démarrage : on n'ouvre la fenêtre du navigateur que si c'est justifié.
  // Appelée sans argument depuis le bouton « Utiliser ma position », elle
  // demande toujours : là, c'est le Yopper qui l'a voulu.
  async function geolocaliserAuDemarrage() {
    if (!navigator.geolocation) return

    // La dernière position connue s'affiche tout de suite : la commune apparaît
    // sans attendre le satellite, et même hors ligne.
    const memo = lirePositionMemorisee()
    if (memo) {
      setPosition({ lat: memo.lat, lng: memo.lng })
      if (memo.rue) setRue(memo.rue)
    }

    // ⚠️ LES DEUX MÉMOIRES DE SESSION SONT CE QUI DÉGÈLE LA POSITION SUR
    // IPHONE. Sans elles, `dejaDemande` répondait « jamais » pour la vie du
    // navigateur et la rue affichée restait celle du premier jour. Voir le
    // commentaire de `decisionGeoloc`.
    const decision = decisionGeoloc({
      etat: await etatAutorisation(),
      dejaDemande: dejaDemandee(),
      lectureReussieSession: lectureReussieDansCetteSession(),
      demandeFaiteSession: demandeFaiteDansCetteSession(),
      positionDejaObtenue: !!memo,
    })
    if (decision === 'jamais') return
    if (decision === 'demander') { marquerDemandee(); marquerDemandeDeCetteSession() }

    // ⚠️ ON LIT TOUJOURS QUAND C'EST POSSIBLE (Alex, 09/08 : « la localisation
    // ne s'actualise plus »). Le raccourci « position fraîche = rien à
    // demander », ajouté le 07/08 pour ne plus déranger, GELAIT la commune
    // pendant douze heures : le Yopper se déplaçait et l'application
    // continuait d'afficher la rue de la veille.
    //
    // C'était une prudence inutile. Quand l'autorisation est accordée, lire la
    // position n'ouvre AUCUNE fenêtre : il n'y avait rien à économiser. Le
    // seul cas qu'il fallait protéger, c'est la DEMANDE d'autorisation, et
    // c'est `decisionGeoloc` qui s'en charge, pas la fraîcheur du cache.
    //
    // La position mémorisée garde son rôle : afficher quelque chose tout de
    // suite, pendant que la vraie arrive.
    demanderGeolocalisation({ silencieux: !!memo })
  }

  // `silencieux` : rafraîchissement en arrière-plan. On garde la rue déjà
  // affichée le temps que la nouvelle arrive, au lieu de faire clignoter un
  // vide à chaque ouverture de l'application.
  function demanderGeolocalisation({ silencieux = false } = {}) {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    if (!silencieux) setRue(null)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        // ⚠️ LA PREUVE QUE L'AUTORISATION EST VIVANTE, et la seule dont on
        // dispose sur iPhone. À partir d'ici, relire la position ne peut plus
        // ouvrir de fenêtre : elle vient de ne pas s'ouvrir.
        marquerLectureDeCetteSession()
        setPosition({ lat, lng })
        // Clé cache : position arrondie à 3 décimales (~100m de précision)
        const cacheKey = `yoppaa_geo_${lat.toFixed(3)}_${lng.toFixed(3)}`
        try {
          const cached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null
          if (cached) {
            setRue(cached)
            memoriserPosition({ lat, lng, rue: cached })
            setGeoLoading(false)
            return
          }
        } catch {}
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr&zoom=18&addressdetails=1`, { headers: { 'Accept': 'application/json' } })
          if (res.ok) {
            const data = await res.json()
            const lib = libelleAdresse(data.address) || 'Près de toi'
            setRue(lib)
            memoriserPosition({ lat, lng, rue: lib })
            try { localStorage.setItem(cacheKey, lib) } catch {}
          } else {
            setRue('Près de toi')
            memoriserPosition({ lat, lng })
          }
        } catch {
          setRue('Près de toi')
          memoriserPosition({ lat, lng })
        }
        setGeoLoading(false)
      },
      () => setGeoLoading(false),
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  // Au-delà, on cesse d'attendre et on propose de réessayer. Douze secondes,
  // c'est déjà très long pour une liste, et infiniment moins qu'un écran de
  // chargement qui ne finit jamais.
  const DELAI_MAX_COMMERCES_MS = 12000

  async function chargerCommercants() {
    // Ne lister QUE les fiches publiées (validation admin OK).
    // Les brouillons / en_attente / refusées restent invisibles côté client.
    //
    // ⚠️ L'ERREUR NE DOIT PAS RESSEMBLER À UN VIDE. Cette fonction faisait
    // `setCommercants(data || [])` : quand la requête échouait, ce qui arrive
    // au réveil du téléphone avec un réseau lent ou coupé, Supabase renvoie
    // data: null SANS lever d'exception. La liste était donc effacée et le
    // Yopper lisait « Aucun résultat » pour une simple panne de réseau, en
    // concluant qu'il n'y avait aucun commerce chez lui.
    //
    // 🔴 ET SURTOUT : UNE REQUÊTE QUI NE REND JAMAIS LA MAIN N'EST PAS UNE
    // ERREUR, C'EST UN ÉCRAN MORT. Trouvé par Alex le 26/08 : au retour dans
    // l'application après un moment, elle restait sur « On réveille ton
    // quartier · Les commerces arrivent… », **définitivement**.
    //
    // Le `finally` ci-dessous remettait pourtant bien le drapeau à false. Mais
    // il n'est atteint que si la promesse se règle : au réveil de l'iPhone, la
    // connexion est morte sans que personne ne le dise, la requête reste
    // PENDANTE, et aucun délai maximal n'existait. Ni succès, ni échec, ni
    // message : les trois points tournaient pour toujours.
    //
    // ⚠️ C'est le même motif que le bouton « Redirection… » du 24/08 : un état
    // de chargement sans porte de sortie. Là c'était le cache du navigateur,
    // ici c'est le réseau, et le remède est le même : PRÉVOIR LA SORTIE.
    setErreurChargement(false)
    setCommercesEnChargement(true)
    const abandon = new AbortController()
    const minuteur = setTimeout(() => abandon.abort(), DELAI_MAX_COMMERCES_MS)
    try {
      const { data, error } = await supabase
        .from('commercants_public')  // vue publique (colonnes sûres, publiés) — RLS commercants
        .select('*')
        .eq('statut_publication', 'publie')
        .order('nom')
        .abortSignal(abandon.signal)
      if (error) throw error
      setCommercants(data || [])
      if (data?.length > 0) {
        chargerNotes(data.map(c => c.id), data)
        chargerActiviteAujourdhui(data.map(c => c.id))
        chargerLieux(data.map(c => c.id))
      }
    } catch (e) {
      // On GARDE la liste précédente : mieux vaut des commerces d'il y a une
      // minute qu'un écran vide. On signale seulement que le rafraîchissement
      // a échoué, avec de quoi réessayer.
      console.warn('[commander] chargement des commerces KO', e?.message)
      setErreurChargement(true)
    } finally {
      clearTimeout(minuteur)
      setCommercesEnChargement(false)
    }
  }

  // 🔴 LA LISTE DES COMMERCES NE SE RECHARGEAIT JAMAIS AU RETOUR (Alex, 26/08).
  //
  // `chargerCommercants` n'était appelée QU'AU MONTAGE. Tout le reste se
  // rafraîchit au retour au premier plan — l'activité du jour, les notes, les
  // commandes, les rendez-vous — mais pas la liste elle-même. Résultat : un
  // premier chargement resté en carafe n'avait plus aucune seconde chance, et
  // l'écran restait sur ses trois points jusqu'à ce que le Yopper tue
  // l'application.
  //
  // ⚠️ ON NE RELANCE QUE SI LA LISTE EST VIDE. Recharger une liste déjà
  // affichée à chaque bascule d'application ferait clignoter l'écran et
  // consommerait du réseau pour rien.
  //
  // ⚠️ ET `pageshow` EN PLUS DE `visibilitychange` : une page restaurée depuis
  // le cache du navigateur ne repasse pas toujours par un changement de
  // visibilité. C'est la leçon du bouton mort au retour de Stripe.
  // 🔴 ET LE PREMIER CHARGEMENT AVAIT DISPARU AVEC LA CORRECTION (Alex, 26/08).
  //
  // En ajoutant la relance au retour au premier plan, j'ai REMPLACÉ l'appel au
  // montage au lieu de m'y ajouter. `chargerCommercants` n'avait donc plus
  // qu'un seul appelant : cet écouteur. Or à l'ouverture de l'application,
  // `pageshow` s'est déjà produit AVANT que React n'attache quoi que ce soit :
  // l'événement est manqué, personne n'appelle, et les trois points tournent
  // pour toujours. Sur iPhone comme sur Android, à chaque ouverture.
  //
  // ⚠️ CE N'EST PAS LA MÊME PANNE QUE CELLE DU MATIN, C'EST SON EXACT INVERSE.
  // Le matin, la requête ne rendait jamais la main. Ici elle n'est jamais
  // partie. Le symptôme à l'écran est identique au pixel près, et c'est
  // précisément ce qui rend ce défaut si facile à croire déjà corrigé.
  //
  // ⚠️ LA RELANCE N'EST PAS UN CHARGEMENT. Un écouteur ne remplace jamais
  // l'appel qu'il est censé secourir : le secours ne se déclenche que si
  // quelqu'un a d'abord essayé.
  useEffect(() => {
    if (commercants.length > 0) return
    chargerCommercants()
    const reveiller = () => {
      if (document.visibilityState !== 'visible') return
      chargerCommercants()
    }
    document.addEventListener('visibilitychange', reveiller)
    window.addEventListener('pageshow', reveiller)
    return () => {
      document.removeEventListener('visibilitychange', reveiller)
      window.removeEventListener('pageshow', reveiller)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- relance pilotée par le vide, pas par l'identité de la fonction
  }, [commercants.length])

  // Refresh deals/actus quand le user revient sur l'onglet (cas typique : il a cree une
  // actu cote dashboard et revient sur l'app client). + polling 60s en backup.
  // Sans ces 2 mecanismes, les nouvelles actus/deals ne sont jamais visibles cote client
  // sans hard refresh. Bug rapporte Alex 2026-06-01.
  // ⚠️ LA DISPONIBILITÉ NE SE RAFRAÎCHISSAIT JAMAIS. Les deals se remettaient à
  // jour au retour au premier plan et toutes les minutes, la disponibilité des
  // créneaux JAMAIS : elle était calculée une seule fois au montage. Une
  // application installée sur téléphone n'est presque jamais rechargée, elle
  // est seulement remise au premier plan : la carte montrait donc l'état du
  // matin toute la journée, créneaux passés compris.
  useEffect(() => {
    if (commercants.length === 0) return
    const ids = commercants.map(c => c.id)
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        chargerActiviteAujourdhui(ids)
        chargerNotes(ids, commercants)
      }
    }
    const onVisChange = () => refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisChange)
    const interval = setInterval(refresh, 60000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisChange)
      clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commercants.length])

  // Refresh commandes + RDVs client au focus/visibilitychange + polling 60s.
  // Sans ça, la pastille verte du footer (rdvsAVenir.length) ne se met pas a jour
  // quand un RDV est cree dans un autre onglet ou par le webhook Stripe en arriere-plan.
  // Bug rapporte Alex 2026-06-02 ("pastille verte qui disparait").
  useEffect(() => {
    const email = client?.email
    if (!email) return
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        chargerCommandesClient(email)
        chargerRdvsClient(email); chargerAbonnementsClient()
      }
    }
    const onVisChange = () => refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisChange)
    const interval = setInterval(refresh, 60000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisChange)
      clearInterval(interval)
    }
   
  }, [client?.email])

  // Charge les deals et actus actifs aujourd'hui pour piloter le dot LIVE des pills
  async function chargerActiviteAujourdhui(ids) {
    if (!ids?.length) return
    // ⚠️ LE JOUR SE LIT EN HEURE BELGE, PAS EN UTC. `toISOString()` renvoie le
    // jour PRÉCÉDENT entre minuit et 2h du matin chez nous : une friterie ou
    // une pizzeria, ouvertes à ces heures-là, affichaient le deal de la veille
    // et masquaient celui du jour.
    const aujourdhui = jourLocalISO(new Date())
    const [{ data: deals }, { data: actus }] = await Promise.all([
      // Deals actifs : date_deal = aujourd'hui, OU intervalle date_debut/date_fin qui englobe.
      // On charge aussi est_bonne_affaire pour piloter le badge dore sur la card.
      supabase.from('yoppaa_deals')
        .select('commercant_id, date_deal, date_debut, date_fin, actif, est_bonne_affaire')
        .in('commercant_id', ids)
        .eq('actif', true),
      supabase.from('actualites')
        .select('commercant_id, date_debut, date_fin, actif')
        .in('commercant_id', ids)
        .eq('actif', true),
    ])
    const dealSet = new Set()
    const bonneAffaireSet = new Set()
    ;(deals || []).forEach(d => {
      const dateDeal = d.date_deal || null
      const dStart = d.date_debut ? d.date_debut.slice(0,10) : null
      const dEnd   = d.date_fin   ? d.date_fin.slice(0,10)   : null
      const dans = dateDeal === aujourdhui
        || (dStart && dEnd && dStart <= aujourdhui && aujourdhui <= dEnd)
      if (dans) {
        dealSet.add(d.commercant_id)
        if (d.est_bonne_affaire) bonneAffaireSet.add(d.commercant_id)
      }
    })
    const actuSet = new Set()
    ;(actus || []).forEach(a => {
      const dStart = a.date_debut ? a.date_debut.slice(0,10) : null
      const dEnd   = a.date_fin   ? a.date_fin.slice(0,10)   : null
      const dans = !dStart && !dEnd
        || (dStart && !dEnd && dStart <= aujourdhui)
        || (!dStart && dEnd && aujourdhui <= dEnd)
        || (dStart && dEnd && dStart <= aujourdhui && aujourdhui <= dEnd)
      if (dans) actuSet.add(a.commercant_id)
    })
    setDealsActifs(dealSet)
    setBonnesAffairesActives(bonneAffaireSet)
    setActusActives(actuSet)
  }

  // ⚠️ CETTE FONCTION REFAISAIT SON PROPRE CALCUL DE DISPONIBILITÉ, avec des
  // règles qui n'étaient celles de personne d'autre : aucun filtre de jour sur
  // les créneaux, aucun filtre de date sur les commandes, et les annulées
  // comptées comme occupantes à vie. Un commerce parfaitement libre pouvait
  // afficher « Résa dès 21:00 ». Tout est parti dans `lib/statut-commerce.js`,
  // qui applique les règles de `lib/creneaux.js`, celles du reste de l'app.
  //
  // Les FERMETURES arrivent avec : un commerce en congé annuel s'affichait
  // « Ouvert · 07:00-14:00 » en vert sur l'accueil, alors que sa fiche, elle,
  // le savait fermé.
  async function chargerNotes(ids, commercantsData = []) {
    const jour = jourLocalISO(new Date())
    // Fenêtre utile : aujourd'hui plus l'horizon le plus long possible. Inutile
    // de rapatrier les commandes d'il y a trois semaines, elles n'occupent plus
    // rien.
    const finFenetre = jourPlus(jour, 7)
    const [{ data: avisData }, { data: creneauxData }, { data: commandesData }, { data: fermeturesData }] = await Promise.all([
      supabase.from('avis_public').select('commercant_id, note').in('commercant_id', ids),
      // `jour_semaine` est INDISPENSABLE : sans lui, la grille de toute la
      // semaine est prise pour celle d'aujourd'hui.
      supabase.from('creneaux').select('id, commercant_id, jour_semaine, heure_debut, heure_fin, max_commandes, actif').in('commercant_id', ids).eq('actif', true),
      supabase.from('commandes_stats')
        .select('commercant_id, creneau_id, statut, date_commande')
        .in('commercant_id', ids)
        .in('statut', STATUTS_OCCUPENT_CRENEAU)
        .gte('date_commande', jour)
        .lte('date_commande', finFenetre),
      supabase.from('fermetures_exceptionnelles').select('commercant_id, date_debut, date_fin').in('commercant_id', ids),
    ])
    const notes = {}
    ids.forEach(id => {
      const av = (avisData||[]).filter(a => a.commercant_id === id)
      notes[id] = av.length > 0 ? { moyenne: av.reduce((a, x) => a+x.note, 0)/av.length, count: av.length } : { moyenne: 0, count: 0 }
    })
    setNotesParCommerce(notes)

    const maintenant = new Date()
    const nowMin = maintenant.getHours() * 60 + maintenant.getMinutes()
    const statuts = {}
    ids.forEach(id => {
      const commercant = commercantsData.find(c => c.id === id)
      const creneaux = (creneauxData||[]).filter(c => c.commercant_id === id)
      statuts[id] = {
        statut: statutCreneaux({
          creneaux,
          commandes: (commandesData||[]).filter(c => c.commercant_id === id),
          jour,
          nowMin,
          categorie: commercant?.categorie,
        }),
        creneaux,
        jour,
        horizon: commercant?.horizon_commande,
      }
    })
    setStatutsCommerce(statuts)
    const parCommerce = {}
    ;(fermeturesData || []).forEach(f => {
      if (!parCommerce[f.commercant_id]) parCommerce[f.commercant_id] = []
      parCommerce[f.commercant_id].push(f)
    })
    setFermetures(parCommerce)
  }

  // Les favoris passent par une route serveur : la table n'est plus lisible ni
  // modifiable depuis le navigateur. Elle l'était par tout le monde, ce qui
  // permettait de lire les favoris d'autrui et surtout d'effacer les siens.
  async function chargerFavoris() {
    let ids = []
    try {
      const r = await fetchYopper('/api/yopper/favoris')
      const j = await r.json()
      // ⚠️ CETTE ROUTE REND UNE LISTE VIDE AVEC UN CODE 200 quand l'identité
      // n'est pas prouvée. Impossible de distinguer « aucun favori » de « je ne
      // te reconnais plus » en regardant la seule liste : on interroge donc la
      // réponse elle-même avant d'effacer quoi que ce soit.
      if (estSessionPerdue(r, j)) { setSessionPerdue(true); return }
      ids = j?.favoris || []
    } catch { return }  // panne réseau : on garde les favoris affichés
    setFavoris(ids)
    if (ids.length > 0) {
      const { data: comms } = await supabase
        .from('commercants_public')  // vue publique — RLS commercants
        .select('*')
        .in('id', ids)
        .eq('statut_publication', 'publie')
      setCommercantsFavoris(comms||[])
    }
  }

  // Fetch tous les RDVs du Yopper (vitrines, services). On garde les statuts vivants
  // (confirme, honore) pour les stats profil ; les annules / no-show sont retires pour
  // ne pas polluer le compteur "RDVs".
  async function chargerRdvsClient(email) {
    // Le SELECT direct Supabase echoue silencieusement sur les Yoppers non-auth
    // (RLS "Client voit ses RDV" exige auth.uid()). On passe par une route
    // serveur qui bypass RLS via service_role + auth cookie yopper HTTP-only.
    // Le param email est conserve pour compat (deja passe partout), la route
    // ignore et utilise le cookie serveur pour identifier le Yopper.
    try {
      // fetchYopper, pas fetch : la route exige une identité prouvée, donc le
      // jeton Supabase doit accompagner l'appel. Avec un fetch nu, la réponse
      // était un 401 et l'onglet restait vide.
      const res = await fetchYopper('/api/rdv/mes-rdvs')
      const body = await res.json().catch(() => ({}))
      // ⚠️ UNE SESSION PERDUE N'EST PAS UNE LISTE VIDE. Ce `setClientRdvs([])`
      // effaçait les rendez-vous du Yopper à chaque relevé dès que son jeton
      // mourait, sans le moindre signal. On garde ce qui est à l'écran et on le
      // prévient : ses rendez-vous existent toujours, c'est l'accès qui est
      // tombé.
      if (estSessionPerdue(res, body)) { setSessionPerdue(true); return }
      if (!body?.ok) {
        console.warn('[chargerRdvsClient] route KO', body)
        setClientRdvs([])
        return
      }
      setSessionPerdue(false)
      console.info('[chargerRdvsClient]', { email, count: body.count })
      setClientRdvs(body.rdvs || [])
    } catch (e) {
      // Une exception réseau n'est pas non plus un vide : on ne touche à rien.
      console.error('[chargerRdvsClient] exception', e?.message)
    }
  }

  // Les abonnements de la cliente : combien de séances il lui reste, et
  // jusqu'à quand. La route exige une identité PROUVÉE, donc `fetchYopper` et
  // jamais un `fetch` nu, qui repartirait avec un 401 et un écran vide.
  async function chargerAbonnementsClient() {
    try {
      const res = await fetchYopper('/api/yopper/abonnements')
      const body = await res.json().catch(() => ({}))
      // ⚠️ Une session perdue n'est pas une absence d'abonnement. On garde ce
      // qui est à l'écran et le bandeau de reconnexion fait le reste : effacer
      // ici dirait à une cliente qu'elle n'a rien acheté.
      if (estSessionPerdue(res, body)) { setSessionPerdue(true); return }
      if (!body?.ok) return
      setClientAbonnements(body.abonnements || [])
    } catch (e) {
      console.error('[chargerAbonnementsClient] exception', e?.message)
    }
  }

  // Annulation d'un RDV depuis la vue Mes RDVs. Auth par rdv_id + client_email
  // (pas besoin du token dans ce contexte, le user est déjà identifié côté front).
  // Refund Stripe automatique côté serveur si acompte payé en ligne + avant cutoff.
  async function annulerRdv(rdv) {
    if (!rdv?.id || !rdv?.client_email) return

    // `produitsChoix` n'est renseigné qu'au second passage, quand le
    // rendez-vous portait des produits payés et que le client a dit ce qu'il
    // en fait. Ce second passage ne redemande PAS de confirmer l'annulation :
    // elle est déjà confirmée, seul le sort des produits restait à trancher.
    async function executer(produitsChoix = null) {
      try {
        const res = await fetch('/api/rdv/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rdv_id: rdv.id, client_email: rdv.client_email, ...(produitsChoix ? { produits_choix: produitsChoix } : {}) }),
        })
        const data = await res.json()
        // Le serveur refuse tant que le client n'a pas tranché : on lui pose
        // la question, avec le montant en jeu, plutôt que de décider pour lui.
        if (data?.choix_produits_requis) {
          const p = data.produits
          askConfirm({
            title: 'Tu gardes tes produits ?',
            message: `Tu avais acheté ${p.lignes.map(l => `${l.quantite} × ${l.nom}`).join(', ')} pour ${Number(p.total).toFixed(2)}€, déjà payés et mis de côté.\n\nSi tu les gardes, ils t'attendent en boutique${p.acompte > 0 ? ` et seul ton acompte de ${Number(p.acompte).toFixed(2)}€ te revient` : ''}. Sinon, ${(Number(p.total) + Number(p.acompte)).toFixed(2)}€ te sont remboursés.`,
            confirmLabel: 'Je garde mes produits',
            cancelLabel: 'Je rends tout',
            onConfirm: () => executer('garde'),
            onCancel: () => executer('rend'),
          })
          return
        }
        if (!res.ok || !data.ok) {
          alert(`Annulation impossible : ${data?.error || 'erreur inconnue'}`)
          return
        }
        await chargerRdvsClient(rdv.client_email)
        // ⚠️ ET LE SOLDE, PARCE QU'IL VIENT DE CHANGER. Une séance annulée à
        // temps est RENDUE (décision du 15/08) : sans ce rechargement, la
        // cliente lit encore l'ancien solde et croit avoir perdu sa séance.
        await chargerAbonnementsClient()
        showToast({ msg: `C'est noté ! ${data.message || 'Ton RDV est annulé'} 🟣`, type: 'success' })
      } catch (e) {
        console.error('[annulerRdv] erreur', e)
        alert(`Erreur : ${e?.message || 'inconnue'}`)
      }
    }

    askConfirm({
      title: 'Annuler ce RDV ?',
      message: 'L\'acompte sera remboursé automatiquement si tu en as payé un.',
      confirmLabel: 'Annuler le RDV',
      danger: true,
      onConfirm: () => executer(),
    })
  }

  // Annulation d'une commande C&C depuis la vue Mes Commandes (parallèle au RDV).
  // Auth par commande_id + client_email. La route /api/commande/cancel verifie le
  // cutoff (created vs heure de retrait) et refund Stripe si paye_en_ligne=true.
  async function annulerCommandeFromList(c) {
    const email = c?.client_email || client.email
    if (!c?.id || !email) return
    askConfirm({
      title: 'Annuler cette commande ?',
      message: 'Si tu as payé en ligne, le remboursement sera lancé automatiquement.',
      confirmLabel: 'Annuler la commande',
      danger: true,
      onConfirm: async () => {
        try {
          const res = await fetch('/api/commande/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commande_id: c.id, client_email: email }),
          })
          const data = await res.json()
          if (!res.ok || !data.ok) {
            alert(`Annulation impossible : ${data?.error || 'erreur inconnue'}`)
            return
          }
          await chargerCommandesClient(email)
          // « Yoppé » célèbre une commande qui aboutit, pas une qui s'arrête :
          // l'employer ici sonnerait faux, comme féliciter quelqu'un qui
          // renonce. Le verbe reste réservé au moment où ça marche.
          const message = c.paye_en_ligne
            ? 'C\'est annulé. Ton remboursement est en route 🟣'
            : 'C\'est annulé 🟣'
          showToast({ msg: message, type: 'success' })
        } catch (e) {
          console.error('[annulerCommandeFromList] erreur', e)
          alert(`Erreur : ${e?.message || 'inconnue'}`)
        }
      },
    })
  }

  async function chargerCommandesClient(_email) {
    // « Mes commandes » = PII (email/nom/téléphone/adresse/total) → lecture via
    // l'API serveur (service_role + cookie yoppaa_yopper). L'email vient du cookie
    // côté serveur, pas de ce paramètre. L'enrichissement numéro (numero_commande
    // ou position du jour) est fait côté serveur pour garder la parité d'affichage.
    // ⚠️ `setClientCommandes(res?.commandes || [])` EFFAÇAIT TOUT sur un 401.
    // Le relevé tournant en boucle, les commandes disparaissaient et ne
    // revenaient jamais, sans qu'aucun message n'explique pourquoi.
    let res
    try {
      res = await fetchYopper('/api/yopper/commandes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      })
    } catch { return }  // panne réseau : on garde l'affichage précédent
    const body = await res.json().catch(() => null)
    if (estSessionPerdue(res, body)) { setSessionPerdue(true); return }
    if (!body?.ok && !body?.commandes) return
    setSessionPerdue(false)
    setClientCommandes(body?.commandes || [])
  }

  useEffect(() => {
    if (!position || !commercants.length) return
    calculerDistances(commercants, position)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  }, [position, commercants.length])

  // ─── Les lieux d'activité des commerces affichés ─────────────────────────
  //
  // Une requête à part plutôt qu'une jointure : la vue publique
  // `commercants_public` expose des colonnes choisies, et lui greffer une
  // relation demanderait de la recréer. Les lieux sont peu nombreux et
  // n'appartiennent qu'aux commerces qui bougent ou qui ont plusieurs adresses.
  //
  // Rangés dans une référence plutôt que dans un état : ils ne s'affichent
  // jamais seuls, ils ne servent qu'à mesurer. Un état de plus ferait rejouer
  // le calcul des distances à contretemps.
  const lieuxRef = useRef({})

  async function chargerLieux(ids) {
    if (!ids?.length) return
    const { data } = await supabase
      .from('commercant_lieux')
      .select('commercant_id, type, jour_semaine, date_jour, libelle, adresse, latitude, longitude, actif')
      .in('commercant_id', ids)
      .eq('actif', true)
    const parCommercant = {}
    for (const l of (data || [])) {
      (parCommercant[l.commercant_id] ||= []).push(l)
    }
    lieuxRef.current = parCommercant
    // ⚠️ LES LIEUX ARRIVENT APRÈS LES COMMERCES, et souvent après la position.
    // Sans ce recalcul, la distance resterait celle du siège social jusqu'au
    // prochain relevé : la professeure de yoga apparaîtrait à huit kilomètres
    // pendant les premières secondes, c'est-à-dire pendant tout le temps où le
    // Yopper regarde son écran. La mise à jour est fonctionnelle : on repart de
    // la liste réellement affichée, pas d'une copie figée dans la fermeture.
    if (position) {
      setCommercants(prev => avecDistances(prev, position, parCommercant))
    }
  }

  // Le calcul lui-même, séparé de la pose dans l'état : deux chemins y mènent,
  // l'arrivée de la position et celle des lieux.
  function avecDistances(liste, pos, lieuxParCommercant = lieuxRef.current) {
    // Distance à vol d'oiseau (Haversine) pour le tri "près de toi". C'est la
    // norme des apps de découverte (Yelp, résultats Google Maps, store locators)
    // et c'est suffisant à l'échelle locale. La distance routière (ORS via la
    // route /api/distance, en réserve) est réservée au module livraison alim, où
    // elle a un sens opérationnel (frais + zones). Décision Alex 05/07.
    //
    // ⚠️ ELLE SE MESURAIT DEPUIS LE SIÈGE SOCIAL, ET C'ÉTAIT FAUX POUR TROIS
    // COMMERÇANTS SUR QUATRE DÈS QU'IL BOUGE. Le food truck affichait la
    // distance jusqu'à son dépôt pendant qu'il était au marché, et la
    // professeure de yoga inscrite chez elle la distance jusqu'à son domicile.
    // Un Yopper à deux rues de la salle de cours la voyait à huit kilomètres et
    // passait son chemin.
    //
    // On mesure désormais jusqu'au lieu ACTIF LE PLUS PROCHE, celui du jour
    // compris. C'est aussi ce qui rend une professeure de yoga visible dans
    // toutes ses communes, décision d'Alex du 12/08 : elle est proche de
    // quiconque habite près de l'une de ses salles.
    const jour = jourLocalISO(new Date())
    const avecDistance = liste.map(c => {
      const lieux = lieuxDuJour({ commercant: c, lieux: lieuxParCommercant[c.id] || [], jour })
      let distance = null
      let lieuProche = null
      for (const l of lieux) {
        if (!l.latitude || !l.longitude) continue
        const d = distanceVolOiseau(pos.lat, pos.lng, parseFloat(l.latitude), parseFloat(l.longitude))
        if (distance === null || d < distance) { distance = d; lieuProche = l }
      }
      // Le nom du lieu n'est affiché que s'il diffère du siège : « 1,2 km »
      // suffit pour une boulangerie, « Salle Saint-Roch · 1,2 km » est ce qui
      // manque à un cours de yoga.
      return { ...c, distance, lieu_proche: lieuProche?.source === 'siege' ? null : lieuProche }
    })
    avecDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    return avecDistance
  }

  function calculerDistances(liste, pos) {
    setCommercants(avecDistances(liste, pos))
  }

  async function geocoderAdresseManuelle(adresse) {
    if (!adresse.trim()) return
    setGeoLoading(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(adresse)}&format=json&limit=1&accept-language=fr`, { headers: { 'Accept': 'application/json' } })
      if (res.ok) {
        const data = await res.json()
        if (data && data.length > 0) {
          const { lat, lon, display_name } = data[0]
          const newPos = { lat: parseFloat(lat), lng: parseFloat(lon) }
          setPosition(newPos)
          const parts = display_name.split(',')
          setRue(parts.slice(0, 2).join(',').trim())
          calculerDistances(commercants, newPos)
        } else {
          setRue(adresse)
        }
      }
    } catch { setRue(adresse) }
    setGeoLoading(false)
    setShowLocManuelle(false)
  }

  async function getOuCreerClient(email, nom) {
    // Get-or-create côté serveur (RLS clients verrouillé : plus d'accès anon direct).
    const res = await fetch('/api/yopper/client', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-or-create', email, nom }),
    })
    const j = await res.json().catch(() => ({}))
    const id = j?.client?.id
    if (!id) return null
    setClientId(id); localStorage.setItem('yoppaa_client_id', id); localStorage.setItem('yoppaa_email', email); localStorage.setItem('yoppaa_nom', nom)
    if (!j.created) { chargerFavoris(id); chargerCommandesClient(email); chargerRdvsClient(email); chargerAbonnementsClient() }
    return id
  }

  async function toggleFavori(commercantId, e) {
    e.stopPropagation()
    if (!client.email) {
      router.push('/commander/auth?redirect=/commander')
      return
    }
    let cid = clientId || await getOuCreerClient(client.email, client.nom)
    if (!cid) return
    if (favoris.includes(commercantId)) {
      await fetchYopper('/api/yopper/favoris', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commercant_id: commercantId, action: 'retirer' }) })
      setFavoris(prev => prev.filter(id => id!==commercantId))
      setCommercantsFavoris(prev => prev.filter(c => c.id!==commercantId))
      // Retrait du tag OneSignal côté serveur (valeur vide = suppression du tag).
      syncYopperTags({ [`favori:${commercantId}`]: '' })
      showToast({ type: 'info', msg: 'Retiré de tes favoris' })
    } else {
      await fetchYopper('/api/yopper/favoris', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commercant_id: commercantId, action: 'ajouter' }) })
      setFavoris(prev => [...prev, commercantId])
      const c = commercants.find(x => x.id===commercantId)
      if (c) setCommercantsFavoris(prev => [...prev, c])
      // Prompt push (client, user activation) + pose du tag côté serveur.
      taggerFavoriOneSignal(commercantId, true)
      syncYopperTags({ [`favori:${commercantId}`]: '1' })
      const nom = commercants.find(x => x.id===commercantId)?.nom
      showToast({ type: 'success', msg: `${nom ? nom + ' ajouté' : 'Ajouté'} aux favoris · tu recevras ses deals et actus` })
    }
  }

  function selectionnerCommercant(c) {
    if (!c.slug) {
      // Defensive : ne devrait jamais arriver depuis l'API admin/valider (auto-genere le slug),
      // mais on log pour debug + toast pour ne pas laisser l'user dans le silence si bug DB.
      console.warn('[selectionnerCommercant] commercant sans slug, click ignoré', { id: c.id, nom: c.nom })
      showToast({ type: 'info', msg: `Fiche temporairement indisponible pour ${c.nom}` })
      return
    }
    localStorage.setItem('yoppaa_onglet', 'accueil')
    // Routing par catégorie :
    //   • vitrine (coiffeur, esthe, etc.) → /commander/rdv/[slug] (module RDV natif)
    //   • alimentaire (boulangerie, etc.) → /commander/[slug] (Click & Collect)
    const route = c.categorie === 'vitrine' ? `/commander/rdv/${c.slug}` : `/commander/${c.slug}`
    router.push(route)
  }

  // Pour les stats profil on exclut les RDVs annules/no_show (sinon le compteur 'RDVs' du
  // profil et 'temps economise' seraient gonfles par des RDVs ratees).
  const rdvsActifs = clientRdvs.filter(r => r.statut === 'confirme' || r.statut === 'honore')

  // Temps economise : commandes retirees (~7-15min par type, file evitee) + RDVs pris en
  // ligne (~3min par RDV, appel/deplacement evite).
  const tempsEconomise =
    clientCommandes.filter(c => c.statut === 'recupere').reduce((acc, c) => acc + getTemps(c.commercant?.type), 0)
    + rdvsActifs.length * 3

  // Statistiques additionnelles (cards grid 2x2)
  // ⚠️ UNE SÉANCE D'ABONNEMENT NE COMPTE PAS ICI, et son exclusion est
  // EXPLICITE. Elle porte `prix_estime: 0`, donc l'addition ne changeait rien
  // en chiffres, mais elle changeait le sens : cette carte prétendait totaliser
  // ce que le Yopper a dépensé, en additionnant trente-six zéros pour une
  // cliente qui avait réglé son année. Le prix vit sur le CONTRAT.
  //
  // ⚠️ CE TOTAL RESTE INCOMPLET tant que l'écran d'abonnement n'existe pas :
  // le montant du contrat n'est lu nulle part côté Yopper. L'exclusion dit au
  // moins clairement pourquoi, au lieu de faire croire à un calcul juste.
  // 🔴 ET IL COMPTAIT LE TARIF PLEIN. Cette carte annonce « ce que tu as
  // dépensé » : elle additionnait des prix affichés, pas des euros sortis du
  // portefeuille. Une récompense fidélité et un bon cadeau ne se paient pas,
  // et les compter gonflait le total de tout ce que le Yopper avait ÉCONOMISÉ.
  const totalDepense =
    clientCommandes.reduce((acc, c) => acc + (montantNetCommande(c) || 0), 0)
    + rdvsActifs
      .filter(r => r.statut === 'honore' && !r.abonnement_id)
      // Le rendez-vous n'accepte pas encore de bon cadeau ; on lit quand même
      // la colonne, pour que ce total reste juste le jour où il en acceptera.
      .reduce((acc, r) => acc + Math.max(0,
        Number(r.prix_estime || 0)
        - Number(r.fidelite_remise || 0)
        - Number(r.bon_cadeau_montant || 0)), 0)
  const commercesUniques = new Set([
    ...clientCommandes.map(c => c.commercant_id),
    ...rdvsActifs.map(r => r.commercant_id),
  ].filter(Boolean)).size

  // Métiers présents dans la zone pour la famille choisie (rangée 2 du bandeau),
  // triés par nombre de commerces puis alphabétique. [[métier, count], ...]
  const metiersZone = (() => {
    if (familleActive === 'tous') return []
    const counts = new Map()
    for (const c of commercants) {
      if (familleDe(c) !== familleActive) continue
      for (const t of parseTypes(c.type)) counts.set(t, (counts.get(t) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  })()

  const commercantsFiltres = commercants
    .filter(c => familleActive === 'tous' || familleDe(c) === familleActive)
    .filter(c => !metierActif || parseTypes(c.type).includes(metierActif))
    .filter(c => {
      const q = sansAccents(searchQuery.trim())
      if (!q) return true
      return sansAccents(c.nom).includes(q) || sansAccents(c.type).includes(q) || sansAccents(c.adresse).includes(q)
    })

  // Retrait « prêt à retirer » : swipe pour confirmer le retrait au comptoir.
  // Expédition exclue du swipe retrait : un colis ne se « récupère » pas au
  // comptoir, il arrive par la poste (suivi affiché sur la carte).
  const commandesASwiper = clientCommandes.filter(c => c.statut === 'pret' && c.mode_retrait !== 'livraison' && c.mode_retrait !== 'expedition')
  // Livraison EN COURS de livraison (le commerçant est parti) : swipe pour confirmer
  // la RÉCEPTION. Tant que statut_livraison n'est pas 'en_livraison', la commande
  // reste dans « En cours » (pas d'action possible côté Yopper).
  const commandesEnLivraison = clientCommandes.filter(c => c.mode_retrait === 'livraison' && c.statut === 'pret' && c.statut_livraison === 'en_livraison')
  const commandesEnCours = clientCommandes.filter(c =>
    ['en_attente','en_preparation'].includes(c.statut)
    || (c.mode_retrait === 'livraison' && c.statut === 'pret' && c.statut_livraison !== 'en_livraison')
    // Colis prêt = en attente d'expédition par le commerçant : reste « en cours »
    || (c.mode_retrait === 'expedition' && c.statut === 'pret')
  )
  // Historique : commandes recuperees + annulees (par client ou paiement_ko) + non_retire.
  // On garde la commande visible avec son statut final pour que le Yopper ait toujours
  // accès à son historique (signale par Alex : la commande annulee ne doit pas disparaitre).
  const commandesTerminees = clientCommandes.filter(c => ['recupere', 'annulee_client_refund', 'annulee_paiement_ko', 'non_retire'].includes(c.statut))
  // RDV vitrine a venir : statut confirme + date >= aujourd'hui
  const _todayMidnight = new Date(); _todayMidnight.setHours(0,0,0,0)
  const rdvsAVenir = clientRdvs
    .filter(r => r.statut === 'confirme' && r.date_rdv && new Date(r.date_rdv) >= _todayMidnight)
    .sort((a, b) => `${a.date_rdv}T${a.heure_debut || ''}`.localeCompare(`${b.date_rdv}T${b.heure_debut || ''}`))
  const rdvsPasses = clientRdvs
    .filter(r => !(r.statut === 'confirme' && r.date_rdv && new Date(r.date_rdv) >= _todayMidnight))
    .sort((a, b) => `${b.date_rdv}T${b.heure_debut || ''}`.localeCompare(`${a.date_rdv}T${a.heure_debut || ''}`))

  // Badge footer = commandes en cours/pretes/en livraison + RDVs a venir (cumul)
  const badgeCommandes = commandesASwiper.length + commandesEnLivraison.length + commandesEnCours.length + rdvsAVenir.length

  const btnPrimary = { width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }
  const statutStyle = {
    // 'recupere' (historique) -> neutre gris pour eviter de confondre avec les RDVs (vert).
    recupere:       { bg: '#F3F4F6', color: '#6B7280', label: 'Récupérée' },
    // 'pret' garde le vert : seul statut a action immediate (signature couleur preservee).
    pret:           { bg: '#F0FDF4', color: '#10B981', label: 'Prête à retirer' },
    en_preparation: { bg: '#EFF6FF', color: '#2563EB', label: 'En préparation' },
    // 'en_attente' (Validee) -> violet (signature commande alimentaire, pas vert).
    en_attente:     { bg: T.pale,    color: T.main,    label: 'Validée' },
  }
  // Sous-texte sous la pastille de statut.
  //
  // ⚠️ RÉÉCRIT LE 05/08. Les anciens textes étaient figés et parfois faux :
  // « ton commerçant préféré va bientôt s'y mettre » présumait une relation que
  // le Yopper n'a pas forcément, et « présente-toi à l'heure de ton créneau »
  // s'affichait aussi pour une commande de boutique, qui n'a AUCUN créneau.
  // Le texte suit maintenant le mode de retrait, et parle de ce que le Yopper
  // doit faire ou attendre, pas de sentiments.
  function statutSousTexte(c) {
    const enBoutique = c?.mode_retrait === 'retrait_boutique'
    if (c?.statut === 'en_attente') {
      return enBoutique
        ? 'Bien reçue. On te prévient dès qu’elle t’attend.'
        : 'Bien reçue. La préparation démarre bientôt.'
    }
    if (c?.statut === 'en_preparation') {
      return enBoutique
        ? 'En préparation. Tu reçois un message dès qu’elle est prête.'
        : 'En préparation, ça avance.'
    }
    if (c?.statut === 'pret') {
      if (c?.mode_retrait === 'livraison') return 'Prête, elle part vers toi.'
      if (enBoutique) return 'Elle t’attend, pendant les heures d’ouverture.'
      const cren = c?.creneau
      return cren?.heure_debut
        ? `Elle t’attend, viens entre ${cren.heure_debut.slice(0, 5)} et ${cren.heure_fin?.slice(0, 5) || ''}.`
        : 'Elle t’attend.'
    }
    return null
  }

  // Vérifie si le créneau de retrait a commencé (peut SWIPER)
  function peutRetirer(commande) {
    if (!commande?.creneau?.heure_debut) return true
    const dateRef = commande.date_commande || commande.created_at
    // Une date nue est déjà le bon jour. Un instant, lui, se lit en heure
    // BELGE : sinon une commande créée après minuit désigne le créneau de la
    // VEILLE, et le client peut swiper « récupérée » un jour trop tôt.
    const dateStr = typeof dateRef === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRef)
      ? dateRef
      : jourBruxelles(dateRef)
    const [h, m] = commande.creneau.heure_debut.slice(0,5).split(':').map(Number)
    const target = new Date(dateStr + 'T00:00:00')
    target.setHours(h, m, 0, 0)
    return new Date() >= target
  }

  // Minutes restantes avant le début du créneau (positif = pas encore l'heure)
  function minutesAvantCreneau(commande) {
    if (!commande?.creneau?.heure_debut) return 0
    const dateRef = commande.date_commande || commande.created_at
    // Une date nue est déjà le bon jour. Un instant, lui, se lit en heure
    // BELGE : sinon une commande créée après minuit désigne le créneau de la
    // VEILLE, et le client peut swiper « récupérée » un jour trop tôt.
    const dateStr = typeof dateRef === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRef)
      ? dateRef
      : jourBruxelles(dateRef)
    const [h, m] = commande.creneau.heure_debut.slice(0,5).split(':').map(Number)
    const target = new Date(dateStr + 'T00:00:00')
    target.setHours(h, m, 0, 0)
    const diffMs = target - new Date()
    return Math.max(0, Math.ceil(diffMs / 60000))
  }

  // Formate les minutes en "X min" / "Xh Y min" / "Xj Yh"
  function formatTempsRestant(min) {
    if (min < 60) return `${min} min`
    if (min < 1440) {
      const h = Math.floor(min / 60)
      const m = min % 60
      return m === 0 ? `${h}h` : `${h}h ${m} min`
    }
    const j = Math.floor(min / 1440)
    const h = Math.floor((min % 1440) / 60)
    return h === 0 ? `${j}j` : `${j}j ${h}h`
  }

  return (
    <>
      {/* Init OneSignal Web SDK + sync tags (yopper_id, code_postal, favori:*).
          Chargé seulement dans /commander (pas dans /dashboard ni admin). */}
      <OneSignalInit
        yopperId={clientId}
        codePostal={commune?.codes_postaux?.[0]}
        favoris={favoris}
      />

      {showSplash && <SplashScreen onDone={onSplashDone}/>}

      {/* Confirmation/changement commune Yopper.
          mode='first' : pas fermable, déclenchée auto si commune_id null
          mode='change' : fermable, déclenchée depuis bouton "Changer ma commune" */}
      {showConfirmCommune && clientId && (
        <ConfirmCommune
          clientId={clientId}
          currentCommuneId={commune?.id || null}
          mode={commune ? 'change' : 'first'}
          onClose={() => setShowConfirmCommune(false)}
          onSet={(id, c) => {
            setCommune(c)
            setShowConfirmCommune(false)
          }}
        />
      )}

      {/* Modal d'avis post-commande : déclenchée auto 60 min après recupere_at,
          si aucun avis n'existe et si le Yopper n'a pas dismiss cette commande
          serveur (avis_ignore_at). Le dismiss est persiste via l'API pour ne
          plus reproposer sur les autres devices (fix Alex 01/07). */}
      {avisCommande && clientId && avisCommande.commercant && (
        <ModalAvis
          commercant={{ id: avisCommande.commercant_id, nom: avisCommande.commercant.nom, type: avisCommande.commercant.type }}
          clientId={clientId}
          commandeId={avisCommande.id}
          onClose={async () => {
            // Dismiss LOCAL d'abord (ceinture + bretelles) : même si l'API
            // échoue (401 cookie absent, réseau), ce device ne re-sollicite
            // plus cette commande. Le serveur reste la source cross-devices.
            try {
              const key = 'yoppaa_avis_ignores'
              const ids = new Set(JSON.parse(localStorage.getItem(key) || '[]'))
              ids.add(avisCommande.id)
              localStorage.setItem(key, JSON.stringify([...ids].slice(-100)))
            } catch { /* ignore */ }
            try {
              await fetch('/api/commande/ignore-avis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ commande_id: avisCommande.id }),
              })
            } catch (e) {
              console.warn('[commande/ignore-avis] échoué', e?.message)
            }
            // Rafraîchir les commandes pour récupérer avis_ignore_at à jour
            chargerCommandesClient(client.email)
            setAvisCommande(null)
          }}
          onSent={() => {
            // L'avis pose dans la table 'avis' bloquera naturellement la
            // re-proposition (filtre dejaAvis dans le useEffect). Pas besoin
            // de flag additionnel cote commande.
          }}
        />
      )}

      {/* FIX FOOTER : PickupScreen rendu HORS de .page-wrap pour éviter le stacking context
          (overflow-x: hidden sur .page-wrap bloque position:fixed des enfants) */}
      {pickupCommande && (
        <PickupScreen
          commande={pickupCommande}
          clientPrenom={client.prenom || client.nom?.split(' ')[0] || 'Yopper'}
          onConfirm={async () => {
            // Confirmation de réception → via l'API serveur (service_role + cookie).
            // Le serveur applique statut='recupere' (+ statut_livraison='livree' en
            // livraison) après avoir vérifié que la commande appartient au Yopper.
            await fetchYopper('/api/yopper/commandes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'confirmer-reception', commande_id: pickupCommande.id }),
            }).catch(() => {})
            setPickupCommande(null)
            chargerCommandesClient(client.email)
          }}
          onFermer={() => setPickupCommande(null)}
        />
      )}

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        /* Anti-débord horizontal MAXIMAL : aucun scroll horizontal autorisé sur la page entière.
           Le scroll vertical naturel reste OK. Les barres internes (.cats) gardent leur scroll-x interne. */
        html, body {
          height: 100%;
          width: 100%;
          max-width: 100vw;
          overflow-x: hidden !important;
          /* Bloque tout pan horizontal - seul le pan vertical et le pinch-zoom restent */
          touch-action: pan-y pinch-zoom !important;
          overscroll-behavior-x: none;
        }
        body { background: ${T.bg}; font-family: "DM Sans", sans-serif; font-size: 16px; -webkit-text-size-adjust: 100%; position: relative; }
        .page-wrap {
          display: flex; flex-direction: column;
          min-height: 100dvh; max-width: 760px; margin: 0 auto;
          background: ${T.bg}; width: 100%;
          overflow-x: hidden;
        }
        /* Force chaque enfant direct du page-wrap à rester dans la largeur. */
        .page-wrap > * { max-width: 100%; }
        .scroll-body {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          /* Bloque la propagation du scroll vers la page (rubber-banding) + pan-x interdit */
          overscroll-behavior: contain;
          touch-action: pan-y;
        }
        .scroll-body > * { max-width: 100%; }
        /* Hero + footer alignes sur la largeur des cards (760px max via page-wrap).
           La classe .hero-fullwidth est conservee mais ne fait plus rien - gardee pour ne pas
           casser les references existantes. Le rendu suit naturellement la largeur du parent. */
        .hero-fullwidth { /* no-op */ }
        /* Grille 2 cols pour les commerces sur PC/tablette large */
        @media (min-width: 800px) {
          .commerces-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; align-items: start; }
          .commerces-grid > * { margin-bottom: 0 !important; }
        }
        /* Footer nav : padding horizontal généreux pour ne pas toucher les courbes
           des angles iPhone + safe area iOS. Les onglets utilisent flex:1 mais
           restent à l'intérieur de cette zone safe. */
        /* Navbar : alignee sur la largeur des cards (760px page-wrap). Pas de full-width viewport. */
        .navbar {
          flex-shrink: 0;
          background: ${T.bgPanel};
          border-top: 1px solid ${T.main}33;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .navbar-tabs {
          display: flex;
          width: 100%;
          padding-left: max(env(safe-area-inset-left, 0px), 16px);
          padding-right: max(env(safe-area-inset-right, 0px), 16px);
          box-sizing: border-box;
        }
        .cats { display: flex; gap: 6px; overflow-x: auto; padding: 0 1rem 0.875rem; scrollbar-width: none; }
        .cats::-webkit-scrollbar { display: none; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        input, textarea, button, select { font-family: "DM Sans", sans-serif; }
        @keyframes tribu-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.15); } }
        @keyframes navPillPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.14); } }
        @keyframes tribu-pulse2 { 0%,100% { opacity:0.85; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.1); } }
        @keyframes tribu-pulse3 { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:0.3; transform:scale(1.05); } }
        @keyframes dot-pulse { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.4); opacity:0.7; } }
        @keyframes dot-wave { 0%,60%,100% { transform: translateY(0); opacity:1; } 30% { transform: translateY(-3px); opacity:1; } }
        @keyframes yoppa-live-pulse { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.45); opacity:0.7; } }
        @keyframes yoppa-dot-bounce { 0%,80%,100% { transform:translateY(0); opacity:0.45; } 40% { transform:translateY(-7px); opacity:1; } }
        @keyframes toast-in { 0% { opacity:0; transform:translate(-50%, 12px) scale(0.95); } 100% { opacity:1; transform:translate(-50%, 0) scale(1); } }
        @keyframes modal-in { 0% { opacity:0; transform:translateY(12px) scale(0.96); } 100% { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes dot-pop { 0% { opacity:0; transform:scale(0) translateY(8px); } 70% { transform:scale(1.3) translateY(-4px); } 100% { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes wordmark-in { 0% { opacity:0; letter-spacing: 8px; } 100% { opacity:1; letter-spacing: -2px; } }
        @keyframes tagline-in { 0% { opacity:0; transform:translateY(6px); } 100% { opacity:1; transform:translateY(0); } }
        /* ⚠️ LE PALIER À 45 % N'EST PAS UN DÉTAIL DE GOÛT.
           Une dissolution qui commence à 0 % rend le splash translucide
           pendant TOUTE sa durée : on lit la liste des commerces à travers le
           wordmark, et le lancement donne l'impression de montrer deux écrans
           en même temps (constaté par Alex sur Android le 19/08).
           Le fond reste donc OPAQUE la première moitié, et ne s'efface qu'à la
           fin, vite. */
        @keyframes splash-out { 0%, 45% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1.03); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .search-input:focus { border-color: rgba(255,255,255,0.6) !important; outline: none; }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="page-wrap">

        {/* ── HERO HEADER ── */}
        <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #3D1580 100%)`, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          {/* Barre dégradée fine 3px en haut - signature visuelle Yoppaa (design system canonique) */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 2 }}/>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 10%, ${T.mid}33 0%, transparent 50%), radial-gradient(circle at 10% 90%, ${T.light}18 0%, transparent 50%), radial-gradient(circle at 50% 50%, ${T.main}22 0%, transparent 70%)`, pointerEvents: 'none' }}/>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.875rem 1rem 0.625rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              {/* Wordmark tricolore : yo (blanc), pp (Light), aa (Mid) - canonique Good Morning Yoppers */}
              <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.05em', lineHeight: 1, margin: 0 }}>
                <span style={{ color: '#fff' }}>yo</span>
                <span style={{ color: T.light }}>pp</span>
                <span style={{ color: T.mid }}>aa</span>
              </p>
              {/* Dots V2-B centres sous le wordmark - meme animation que la page Tribu */}
              <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 4, height: 11 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', boxShadow: `0 0 6px #ffffffaa`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s forwards' }}/>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.light, marginTop: 2.8, boxShadow: `0 0 6px ${T.light}aa`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.2s forwards' }}/>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.light, marginTop: 2.8, boxShadow: `0 0 6px ${T.light}aa`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.3s forwards' }}/>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.mid, marginTop: 2.8, boxShadow: `0 0 6px ${T.mid}aa`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.4s forwards' }}/>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.mid, boxShadow: `0 0 6px ${T.mid}aa`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.5s forwards' }}/>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BoutonGoodMorning nonVu={gmNonVu} onClick={() => router.push('/commander/morning')}/>
                {/* Pill d'adresse tappable : ouvre directement l'édition (le lien
                    « Saisir manuellement » séparé est supprimé, zéro friction).
                    Le GPS se relance depuis le panneau (« Utiliser ma position »). */}
                {/* ⚠️ APPUI LONG = RAFRAÎCHIR SANS OUVRIR LE PANNEAU. Le Yopper
                    qui se déplace n'avait aucun moyen simple de redemander sa
                    position : il fallait ouvrir le panneau puis viser « Utiliser
                    ma position », deux gestes pour une action qu'on fait en
                    marchant. Un appui long sur la pastille suffit désormais, et
                    l'appui court garde son comportement, celui qu'on connaît. */}
                <button onClick={() => { if (appuiLongRef.current) { appuiLongRef.current = false; return } setShowLocManuelle(v => !v) }}
                onPointerDown={() => {
                  appuiLongRef.current = false
                  minuteurAppuiRef.current = setTimeout(() => {
                    appuiLongRef.current = true
                    demanderGeolocalisation()
                  }, 550)
                }}
                onPointerUp={() => clearTimeout(minuteurAppuiRef.current)}
                onPointerLeave={() => clearTimeout(minuteurAppuiRef.current)}
                onContextMenu={e => e.preventDefault()}
                title="Appui long pour rafraîchir ta position"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.12)', border: `1px solid ${T.light}33`, borderRadius: 100, padding: '0.45rem 0.875rem 0.45rem 0.75rem', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', transition: 'all 0.2s', letterSpacing: '-0.2px' }}>
                {geoLoading
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2.5" strokeDasharray="30 10" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.light} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                }
                <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {geoLoading ? 'Localisation...' : rue || locManuelle || (position ? 'Près de toi' : 'Ma position')}
                </span>
                {showLocManuelle
                  ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M18 6L6 18M6 6l12 12" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                }
              </button>
              </div>
            </div>
          </div>



          {showLocManuelle && onglet === 'accueil' && (
            <div style={{ padding: '0 1rem 0.625rem', animation: 'fadeUp 0.2s ease' }}>
              <div style={{ position: 'relative' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <circle cx="12" cy="10" r="5" stroke="rgba(255,255,255,0.6)" strokeWidth="2.2"/>
                  <path d="M12 15 C12 15 6 20 6 22 Q6 24 12 24 Q18 24 18 22 C18 20 12 15 12 15Z" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinejoin="round" fill="none"/>
                </svg>
                <input
                  placeholder="Ville, rue, code postal..."
                  value={locManuelle}
                  onChange={e => setLocManuelle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && locManuelle.trim()) { geocoderAdresseManuelle(locManuelle.trim()) } }}
                  autoFocus
                  style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.5rem', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none' }}
                />
                {locManuelle && (
                  <button onClick={() => { if (locManuelle.trim()) geocoderAdresseManuelle(locManuelle.trim()) }}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: T.main, border: 'none', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    OK
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingLeft: 4 }}>
                <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', margin: 0 }}>Entrée ou OK pour valider</p>
                {/* Relance du GPS depuis le panneau (la pill n'appelle plus la géoloc) */}
                <button onClick={() => { demanderGeolocalisation(); setShowLocManuelle(false) }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'rgba(196,160,244,0.9)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: '"DM Sans", sans-serif' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(196,160,244,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  Utiliser ma position
                </button>
              </div>
            </div>
          )}


          {onglet === 'accueil' && (
            <div style={{ padding: '0.625rem 1rem 0.625rem' }}>
              <div style={{ position: 'relative', maxWidth: 520, margin: '0 auto' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <circle cx="11" cy="11" r="7" stroke="rgba(255,255,255,0.55)" strokeWidth="2.2"/>
                  <path d="M16.5 16.5L21 21" stroke="rgba(255,255,255,0.55)" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
                <input
                  className="search-input"
                  placeholder="Rechercher un commerce…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem 1rem 0.4rem 2.1rem', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: '#fff', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                )}
              </div>
            </div>
          )}

          {onglet === 'accueil' && (
            <CategoriesScroll familleActive={familleActive} setFamilleActive={setFamilleActive}
              metierActif={metierActif} setMetierActif={setMetierActif} metiersZone={metiersZone}/>
          )}

          {onglet !== 'accueil' && <div style={{ height: 10 }}/>}
        </div>

        {/* ── CONTENU ── */}
        <div className="scroll-body">

          {/* ⚠️ LE BANDEAU QUI MANQUAIT. Quand la session du Yopper meurt, ses
              commandes et ses rendez-vous ne disparaissent pas : c'est l'accès
              qui tombe. Sans ce bandeau, il lisait « Aucune commande en cours »
              et concluait que l'application avait perdu ses achats. Il est
              affiché partout, pas seulement dans l'onglet Suivi : la perte se
              constate aussi bien depuis le profil ou les favoris. */}
          {sessionPerdue && client.email && (
            <div style={{ margin: '0.875rem 1rem 0', background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', border: '1.5px solid #F59E0B', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid #F59E0B' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 2px' }}>
                  Session expirée
                </p>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#78350F', margin: 0, lineHeight: 1.35 }}>
                  Reconnecte-toi pour retrouver tes commandes et tes rendez-vous. Rien n&rsquo;est perdu 🟣
                </p>
              </div>
              <button onClick={() => router.push('/commander/auth?redirect=/commander')}
                style={{ padding: '8px 14px', borderRadius: 100, border: 'none', background: '#92400E', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
                Se reconnecter
              </button>
            </div>
          )}

          {/* ACCUEIL */}
          {onglet === 'accueil' && (
            <div style={{ padding: '0.875rem 1rem 1rem' }}>
              {position && commercantsFiltres.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                    Près de toi
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>
                    {commercantsFiltres.length} commerce{commercantsFiltres.length > 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {commercesEnChargement && commercants.length === 0 ? (
                /* Chargement : les trois dots de la marque, jamais « Aucun
                   résultat ». Au retour sur l'app, c'est le moment le plus
                   lent, et c'est justement là que le Yopper croyait qu'il n'y
                   avait rien chez lui. */
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <div style={{ display: 'inline-flex', gap: 7, marginBottom: 14 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: T.main, opacity: 0.85, animation: `yoppa-dot-bounce 1s ease-in-out ${i * 0.15}s infinite` }}/>
                    ))}
                  </div>
                  <p style={{ fontWeight: 800, color: T.ink, marginBottom: 4, letterSpacing: '-0.2px' }}>On réveille ton quartier</p>
                  <p style={{ fontSize: '0.875rem', color: T.muted }}>Les commerces arrivent…</p>
                </div>
              ) : erreurChargement && commercants.length === 0 ? (
                /* Échec du chargement : on le DIT et on propose de réessayer.
                   Afficher « Aucun résultat » pour une panne de réseau faisait
                   croire au Yopper qu'aucun commerce n'existait chez lui. */
                <div style={{ textAlign: 'center', padding: '3rem 1.25rem' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: 18, background: '#FEF2F2', marginBottom: 14 }}>
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
                      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
                      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                      <line x1="12" y1="20" x2="12.01" y2="20"/>
                    </svg>
                  </div>
                  <p style={{ fontWeight: 800, color: T.ink, marginBottom: 4, letterSpacing: '-0.2px' }}>Connexion perdue</p>
                  <p style={{ fontSize: '0.875rem', color: T.muted, marginBottom: 16 }}>On n&rsquo;a pas pu charger les commerces. Vérifie ta connexion.</p>
                  <button onClick={chargerCommercants}
                    style={{ padding: '0.7rem 1.5rem', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 16px ${T.main}44` }}>
                    Réessayer
                  </button>
                </div>
              ) : commercantsFiltres.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: 18, background: T.pale, marginBottom: 14 }}>
                    <IconSearch size={36} color={T.main}/>
                  </div>
                  <p style={{ fontWeight: 800, color: T.ink, marginBottom: 4, letterSpacing: '-0.2px' }}>Aucun résultat</p>
                  <p style={{ fontSize: '0.875rem', color: T.muted }}>Essaie une autre catégorie ou recherche.</p>
                </div>
              ) : (
                <div className="commerces-grid">
                  {commercantsFiltres.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} statutsCommerce={statutsCommerce} fermetures={fermetures} dealsActifs={dealsActifs} actusActives={actusActives} bonnesAffairesActives={bonnesAffairesActives} onSelect={selectionnerCommercant} onToggleFavori={toggleFavori} onPartager={partagerCommerce}/>)}
                </div>
              )}

            </div>
          )}

          {/* COMMANDES */}
          {onglet === 'commandes' && (
            <div>
              {/* Hero header commandes - pattern canonique : 3px bar + radial multi + 3 points tricolores + eyebrow */}
              <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #1e0950 100%)`, padding: '0.875rem 1rem 1.25rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 2 }}/>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.main}44 0%, transparent 55%), radial-gradient(circle at 10% 90%, ${T.light}14 0%, transparent 50%)`, pointerEvents: 'none' }}/>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, position: 'relative' }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', margin: 0, opacity: 0.85 }}>Yoppers</p>
                </div>
                {/* ⚠️ LE TITRE NOMME LES TROIS CHOSES QU'ON TROUVE ICI (Alex,
                    17/08 : « il faudrait adapter pour que le Yopper ne cherche
                    pas »). Un abonnement de 400 € rangé sous un titre qui ne le
                    mentionne pas, c'est demander à quelqu'un de deviner où est
                    son argent. Un titre est un panneau, pas une décoration. */}
                <h2 style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '-0.6px', margin: 0, position: 'relative', lineHeight: 1.1, color: '#fff' }}>
                  Commandes, rendez-vous et abonnements
                </h2>
                {badgeCommandes > 0 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 100, padding: '4px 12px', marginTop: 10, border: '1px solid rgba(255,255,255,0.15)', position: 'relative' }}>
                    {/* Point violet pale (T.light) au lieu de vert : le vert est reserve aux RDVs
                        et au statut 'Prete a retirer'. Ici on cumule commandes + RDVs, neutre marque. */}
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.light, border: '1.5px solid #fff', boxShadow: `0 0 0 1.5px ${T.light}33, 0 0 8px ${T.light}99`, animation: 'yoppa-live-pulse 1s ease-in-out infinite' }}/>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>{badgeCommandes} en cours</span>
                  </div>
                )}
              </div>

              {/* Toggle Commandes / Rendez-vous - meme onglet, 2 vues distinctes.
                  Labels en clair ("Commandes" / "Rendez-vous"), pas de jargon. Compteurs
                  inline pour signaler la presence d'items dans chaque vue. */}
              <div style={{ padding: '0.75rem 1rem 0', background: '#fff' }}>
                <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 12, padding: 4, gap: 4 }}>
                  {[
                    // Compteurs = items ACTIFS uniquement (pas l'historique total).
                    // Commandes actives = pretes a retirer + en cours (en_attente/en_preparation/pret).
                    // RDVs actifs = a venir (statut=confirme && date >= aujourd'hui).
                    { key: 'alimentaires', label: 'Commandes',    count: commandesASwiper.length + commandesEnLivraison.length + commandesEnCours.length },
                    { key: 'rdvs',          label: 'Rendez-vous', count: rdvsAVenir.length },
                    // ⚠️ CET ONGLET N'EXISTE QUE POUR QUI A UN ABONNEMENT
                    // (Alex, 17/08). Le premier réflexe avait été de refuser un
                    // onglet à part, parce qu'il resterait vide à vie pour la
                    // quasi totalité des Yoppers, et cet argument reste juste.
                    // Il ne vaut simplement pas contre un onglet CONDITIONNEL :
                    // celui qui n'a pas d'abonnement ne voit rien, celui qui en
                    // a un ne cherche plus. Même règle que partout ici, rien ne
                    // s'affiche quand il n'y a rien à montrer.
                    ...(clientAbonnements.length > 0
                      ? [{ key: 'abos', label: 'Abonnements', count: clientAbonnements.length }]
                      : []),
                  ].map(tab => {
                    const actif = sousOngletCmd === tab.key
                    // Couleur identite : violet pour Commandes (alimentaire), vert pour Rendez-vous (vitrine).
                    const couleurId = tab.key === 'rdvs' ? '#10B981' : T.main
                    // ⚠️ À TROIS ONGLETS, LE TEXTE DOIT TENIR. « Abonnements »
                    // est le plus long des trois, et une pastille tronquée en
                    // silence est un défaut déjà relevé ailleurs dans ce
                    // projet : on resserre plutôt que de laisser couper.
                    const troisOnglets = clientAbonnements.length > 0
                    return (
                      <button key={tab.key} onClick={() => setSousOngletCmd(tab.key)}
                        style={{
                          flex: 1, minWidth: 0,
                          padding: troisOnglets ? '0.625rem 0.25rem' : '0.625rem 0.5rem',
                          border: 'none', borderRadius: 9,
                          background: actif ? '#fff' : 'transparent',
                          color: actif ? couleurId : T.muted,
                          fontWeight: 800, fontSize: troisOnglets ? '0.78rem' : '0.85rem',
                          fontFamily: '"DM Sans", sans-serif',
                          cursor: 'pointer', transition: 'all 0.15s',
                          boxShadow: actif ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          gap: troisOnglets ? 4 : 6,
                          letterSpacing: '-0.2px', whiteSpace: 'nowrap',
                        }}>
                        {tab.label}
                        {tab.count > 0 && (
                          <span style={{ background: actif ? couleurId : T.muted, color: '#fff', borderRadius: 100, padding: '1px 7px', fontSize: '0.65rem', fontWeight: 900 }}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ padding: '1rem 1rem 1rem', display: sousOngletCmd === 'alimentaires' ? 'block' : 'none' }}>
              {/* EN LIVRAISON : le commerçant est parti livrer. Le Yopper confirme la
                  réception via le swipe (fallback : le commerçant peut marquer 'Livrée'). */}
              {commandesEnLivraison.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink }}>En livraison</span>
                    <span style={{ background: '#4F46E5', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>{commandesEnLivraison.length}</span>
                  </div>
                  {commandesEnLivraison.map(c => {
                    const cren = c.creneau_livraison || c.creneau
                    return (
                    <div key={c.id} style={{ background: 'linear-gradient(135deg, #EEF2FF, #fff)', borderRadius: 16, overflow: 'hidden', marginBottom: '0.75rem', border: '2px solid #4F46E544', boxShadow: '0 6px 20px #4F46E526' }}>
                      <div style={{ height: 3, background: 'linear-gradient(90deg, #312E81 0%, #4F46E5 60%, #A5B4FC 100%)' }}/>
                      <div style={{ padding: '1rem 1.125rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
                          <div>
                            <p style={{ fontWeight: 800, color: T.ink, marginBottom: 3, fontSize: '0.95rem' }}>
                              {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: '#4F46E5', fontWeight: 700 }}> - commande #{c.numeroAffiche}</span>}
                            </p>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#EEF2FF', borderRadius: 100, padding: '3px 10px', border: '1px solid #4F46E533' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4F46E5', border: '1.5px solid #fff', boxShadow: '0 0 0 1.5px #4F46E544, 0 0 8px #4F46E599', animation: 'yoppa-live-pulse 1s ease-in-out infinite' }}/>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4F46E5' }}>En route vers toi{c.date_commande ? ` · ${new Date(c.date_commande + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}{cren ? ` · ${cren.heure_debut.slice(0,5)}–${cren.heure_fin.slice(0,5)}` : ''}</span>
                            </span>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}><BadgeTypeCommande mode={c.mode_retrait} categorie={c.commercant?.categorie} /><p style={{ fontWeight: 900, color: '#4F46E5', fontSize: '1rem', letterSpacing: '-0.3px' }}><MontantPaye commande={c}/></p><PillPaiementClient commande={c}/></div>
                        </div>
                        <button onClick={() => setPickupCommande(c)}
                          style={{ width: '100%', padding: '0.875rem', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.95rem', background: 'linear-gradient(135deg, #4F46E5, #6366F1)', color: '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 16px #4F46E544', letterSpacing: '-0.3px' }}>
                          J&apos;ai reçu ma commande →
                        </button>
                      </div>
                    </div>
                  )})}
                </>
              )}
              {commandesASwiper.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: commandesEnLivraison.length > 0 ? '1rem' : 0 }}>
                    <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink }}>Prêtes à retirer</span>
                    <span style={{ background: T.main, color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>{commandesASwiper.length}</span>
                  </div>
                  {commandesASwiper.map(c => {
                    const ok = peutRetirer(c)
                    const min = ok ? 0 : minutesAvantCreneau(c)
                    const cren = c.creneau || c.creneau_livraison
                    const heureCreneau = cren?.heure_debut?.slice(0,5)
                    const prenom = client.prenom || client.nom?.split(' ')[0] || 'Yopper'
                    return (
                    /* Card 'Prete a retirer' : signature violette renforcee.
                       L'effet 'action urgente' est cree par glow violet intense + bordure plus
                       epaisse (2px) + animation pulse sur le dot + bouton CTA gradient marque
                       - pas par le vert (reserve aux RDVs et au design system canonique). */
                    <div key={c.id} style={{ background: `linear-gradient(135deg, ${T.pale}, #fff)`, borderRadius: 16, overflow: 'hidden', marginBottom: '0.75rem', border: `2px solid ${T.main}44`, boxShadow: `0 6px 20px ${T.main}26` }}>
                      {/* Bande 3px canonique Yoppaa (Ink -> Main -> Light) */}
                      <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                      <div style={{ padding: '1rem 1.125rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
                        <div>
                          <p style={{ fontWeight: 800, color: T.ink, marginBottom: 3, fontSize: '0.95rem' }}>
                            {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: T.main, fontWeight: 700 }}> - commande #{c.numeroAffiche}</span>}
                          </p>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: T.pale, borderRadius: 100, padding: '3px 10px', border: `1px solid ${T.main}33` }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.main, border: '1.5px solid #fff', boxShadow: `0 0 0 1.5px ${T.main}44, 0 0 8px ${T.main}99`, animation: 'yoppa-live-pulse 1s ease-in-out infinite' }}/>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.main }}>{libelleRetrait(c, cren, { court: true })}</span>
                          </span>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}><BadgeTypeCommande mode={c.mode_retrait} categorie={c.commercant?.categorie} /><p style={{ fontWeight: 900, color: T.main, fontSize: '1rem', letterSpacing: '-0.3px' }}><MontantPaye commande={c}/></p><PillPaiementClient commande={c}/></div>
                      </div>
                      {ok ? (
                        <button onClick={() => setPickupCommande(c)}
                          style={{ width: '100%', padding: '0.875rem', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.95rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 16px ${T.main}44`, letterSpacing: '-0.3px' }}>
                          Retirer ma commande →
                        </button>
                      ) : (
                        <div style={{ background: T.bgPanel, borderRadius: 14, padding: '0.875rem 1rem', color: '#fff', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <p style={{ fontSize: '0.78rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                            ⏱  Plus que {formatTempsRestant(min)} avant ton créneau
                          </p>
                          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.4 }}>
                            Présente-toi à partir de {heureCreneau}. Merci {prenom} 🟣
                          </p>
                        </div>
                      )}
                      </div>
                    </div>
                  )})}
                </>
              )}
              {commandesEnCours.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: commandesASwiper.length > 0 ? '1rem' : 0 }}>
                    <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink }}>En cours</span>
                  </div>
                  {commandesEnCours.map(c => {
                    // Livraison prête mais pas encore partie : libellé/sous-texte dédiés
                    // (le statut 'pret' générique dirait « Prête à retirer », faux ici).
                    const estLivPrete = c.mode_retrait === 'livraison' && c.statut === 'pret'
                    // Colis prêt = emballé, en attente de dépôt par le commerçant
                    const estColisPret = c.mode_retrait === 'expedition' && c.statut === 'pret'
                    const sc = estLivPrete
                      ? { bg: '#EEF2FF', color: '#4F46E5', label: 'Prête, bientôt livrée' }
                      : estColisPret
                      ? { bg: '#FFF7ED', color: '#EA580C', label: 'Emballé, bientôt expédié' }
                      : statutStyle[c.statut]
                    const sousTexte = estLivPrete
                      ? 'C’est prêt ! Le commerçant va bientôt partir te livrer 🛵'
                      : estColisPret
                      ? 'Ton colis part bientôt. Tu recevras le numéro de suivi dès l’expédition.'
                      : statutSousTexte(c)
                    const cren = c.creneau || c.creneau_livraison
                    return (
                      <div key={c.id} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: '0.625rem', border: `1.5px solid ${T.pale}`, boxShadow: '0 2px 8px rgba(107,53,196,0.06)' }}>
                        {/* Bande 3px canonique YOPPAA (Ink → Main → Light) - signature pour les commandes en cours */}
                        <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                        <div style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 800, color: T.ink, marginBottom: 3, fontSize: '0.95rem' }}>
                              {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: T.main, fontWeight: 700 }}> - commande #{c.numeroAffiche}</span>}
                            </p>
                            <p style={{ fontSize: '0.72rem', color: T.muted }}>{libelleRetrait({ ...c, date_commande: c.date_commande || c.created_at }, cren, { court: true })}</p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ marginBottom: 4 }}><BadgeTypeCommande mode={c.mode_retrait} categorie={c.commercant?.categorie} /></div>
                            <p style={{ fontWeight: 900, color: T.main, marginBottom: 4, fontSize: '0.95rem', letterSpacing: '-0.3px' }}><MontantPaye commande={c}/></p>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: 100, background: sc.bg, color: sc.color }}>{sc.label}</span>
                            <div style={{ marginTop: 4 }}><PillPaiementClient commande={c} taille="petit"/></div>
                          </div>
                        </div>
                        {sousTexte && (
                          <p style={{ fontSize: '0.72rem', color: T.deep, marginTop: 8, fontWeight: 600, lineHeight: 1.4 }}>
                            {sousTexte}
                          </p>
                        )}
                        {/* Lien discret "Annuler cette commande". La route vérifie le cutoff
                            (delai_annulation_heures, default 2h avant retrait) et refund Stripe si OK. */}
                        <button onClick={() => annulerCommandeFromList(c)}
                          style={{ marginTop: 10, padding: '6px 12px', background: 'transparent', color: '#DC2626', border: '1px solid #DC262644', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', fontFamily: '"DM Sans", sans-serif' }}>
                          Annuler cette commande
                        </button>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
              {commandesASwiper.length === 0 && commandesEnLivraison.length === 0 && commandesEnCours.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: 20, background: T.pale, marginBottom: 16 }}>
                    <IconBag size={40} color={T.main}/>
                  </div>
                  <p style={{ fontWeight: 800, color: T.ink, marginBottom: 6, fontSize: '1rem', letterSpacing: '-0.2px' }}>Aucune commande en cours</p>
                  <p style={{ fontSize: '0.875rem', color: T.muted, marginBottom: '1.5rem' }}>Tes commandes actives apparaîtront ici.</p>
                  <button onClick={() => setOnglet('accueil')} style={{ ...btnPrimary, width: 'auto', padding: '0.75rem 1.5rem' }}>Commander maintenant</button>
                </div>
              )}
              {commandesTerminees.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historique</span>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                  </div>
                  {commandesTerminees.slice(0, 5).map(c => {
                    // Mapping statuts terminaux vers libellés FR + couleur
                    const statutMapCmd = {
                      recupere:              { label: '✓ Récupérée',           bg: '#F3F4F6', color: '#6B7280' },
                      annulee_client_refund: { label: 'Annulée par toi',       bg: '#FEF2F2', color: '#DC2626' },
                      annulee_paiement_ko:   { label: 'Paiement échoué',       bg: '#FEF2F2', color: '#DC2626' },
                      non_retire:            { label: 'Non retirée',           bg: '#F9FAFB', color: '#6B7280' },
                    }
                    // Colis expédié : libellé dédié + numéro de suivi affiché
                    const estColisExpedie = c.mode_retrait === 'expedition' && c.statut === 'recupere'
                    const sc = estColisExpedie
                      ? { label: '✓ Expédiée', bg: '#FFF7ED', color: '#EA580C' }
                      : statutMapCmd[c.statut] || { label: c.statut, bg: T.pale, color: T.muted }
                    return (
                      <div key={c.id} style={{ background: '#fff', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.5rem', border: `1px solid ${T.pale}`, opacity: 0.75, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 700, color: T.ink, marginBottom: 2, fontSize: '0.875rem' }}>
                            {c.commercant?.nom}{c.numeroAffiche && <span style={{ color: T.muted, fontWeight: 600 }}> - commande #{c.numeroAffiche}</span>}
                          </p>
                          <p style={{ fontSize: '0.7rem', color: T.muted }}>{new Date((c.date_commande || c.created_at) + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}</p>
                          {/* 🔴 LE TRANSPORTEUR, PAS SEULEMENT LE NUMÉRO (Alex,
                              26/08). Le Yopper lisait « Suivi :
                              0072638628362826 » et n'avait aucun moyen de
                              savoir où coller ces seize chiffres. Le nom, et
                              quand on peut, le lien direct. */}
                          {estColisExpedie && libelleExpedition(c.expedition_transporteur, c.expedition_suivi) && (
                            <p style={{ fontSize: '0.7rem', color: '#EA580C', fontWeight: 700, margin: '2px 0 0', overflowWrap: 'anywhere' }}>
                              Suivi : {libelleExpedition(c.expedition_transporteur, c.expedition_suivi)}
                              {suiviUrl(c.expedition_transporteur, c.expedition_suivi) && (
                                <a href={suiviUrl(c.expedition_transporteur, c.expedition_suivi)}
                                  target="_blank" rel="noopener noreferrer"
                                  style={{ marginLeft: 6, color: T.main, fontWeight: 800, textDecoration: 'underline' }}>
                                  suivre mon colis
                                </a>
                              )}
                            </p>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontWeight: 700, color: T.main, marginBottom: 3, fontSize: '0.875rem' }}><MontantPaye commande={c}/></p>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: sc.bg, color: sc.color }}>{sc.label}</span>
                          {/* ⚠️ L'HISTORIQUE AUSSI. Une commande récupérée dont
                              rien n'a été encaissé reste une dette : c'est
                              justement là qu'on la cherche des semaines après. */}
                          <div style={{ marginTop: 3 }}><PillPaiementClient commande={c} taille="petit"/></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Empty state alimentaires si Yopper connecte sans commande */}
              {client.email && commandesASwiper.length === 0 && commandesEnLivraison.length === 0 && commandesEnCours.length === 0 && commandesTerminees.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: T.muted }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: T.deep, marginBottom: 6 }}>Aucune commande pour l&apos;instant</p>
                  <p style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>Tape sur l&apos;onglet Accueil pour commander chez un boulanger, pizzaiolo, etc.</p>
                </div>
              )}
              </div>

              {/* ─── SOUS-ONGLET 'ABONNEMENTS' ────────────────────────────────
                  ⚠️ SON PROPRE ONGLET DEPUIS LE 17/08, à la demande d'Alex.
                  Les cartes vivaient au-dessus des rendez-vous, ce qui les
                  rendait introuvables pour qui ne défilait pas : un abonnement
                  à trois chiffres ne se range pas sous un titre qui ne le
                  nomme pas.
                  ⚠️ L'onglet n'existe QUE s'il y a un abonnement, sans quoi il
                  resterait vide à vie pour la quasi totalité des Yoppers. */}
              <div style={{ padding: '1rem', display: sousOngletCmd === 'abos' ? 'block' : 'none' }}>
                {clientAbonnements.map(a => <CarteAbonnement key={a.id} abonnement={a} />)}
                <p style={{ margin: '10px 2px 0', fontSize: '0.78rem', color: T.muted, lineHeight: 1.5 }}>
                  Tes séances réservées apparaissent dans <strong style={{ color: T.deep }}>Rendez-vous</strong>.
                </p>
              </div>

              {/* ─── SOUS-ONGLET 'RENDEZ-VOUS' ─── */}
              <div style={{ padding: '1rem 1rem 1rem', display: sousOngletCmd === 'rdvs' ? 'block' : 'none' }}>
                {/* RDVs a venir */}
                {rdvsAVenir.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink }}>À venir</span>
                      <span style={{ background: '#10B981', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>{rdvsAVenir.length}</span>
                    </div>
                    {rdvsAVenir.map(r => {
                      const dateObj = r.date_rdv ? new Date(r.date_rdv + 'T12:00:00') : null
                      const heureD = r.heure_debut?.slice(0,5)
                      const heureF = r.heure_fin?.slice(0,5)
                      const dureeM = (heureEnMinutes(r.heure_fin) - heureEnMinutes(r.heure_debut)) || 0
                      const dureeT = dureeM >= 60 ? `${Math.floor(dureeM/60)}h${dureeM%60>0?(dureeM%60)+'min':''}` : `${dureeM}min`
                      return (
                        <div key={r.id} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: '0.75rem', border: `1.5px solid #10B98133`, boxShadow: '0 2px 8px rgba(16,185,129,0.08)' }}>
                          {/* Bande 3px verte = signature vitrine (cohérent avec les cards accueil) */}
                          <div style={{ height: 3, background: 'linear-gradient(90deg, #047857 0%, #10B981 60%, #6EE7B7 100%)' }}/>
                          <div style={{ padding: '0.875rem 1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '0.62rem', fontWeight: 800, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
                                  {dateObj ? dateObj.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' }) : '-'} · {heureD}
                                </p>
                                <p style={{ fontWeight: 800, color: T.ink, fontSize: '0.95rem', letterSpacing: '-0.2px', lineHeight: 1.25, marginBottom: 4 }}>
                                  {r.prestation_nom || 'Prestation'}
                                </p>
                                <p style={{ fontSize: '0.78rem', color: T.muted, lineHeight: 1.4 }}>
                                  {dureeT} · chez <strong style={{ color: T.deep }}>{r.commercant?.nom}</strong>
                                  {r.praticien?.prenom && (
                                    <> · avec <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: T.deep, fontWeight: 700 }}>
                                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.praticien.couleur_hex || T.main, display: 'inline-block' }}/>
                                      {r.praticien.prenom}
                                    </span></>
                                  )}
                                </p>
                                {/* ⚠️ OÙ ALLER. Cet écran ne disait que QUAND : le Yopper devait
                                    rouvrir la fiche du commerce pour retrouver l'adresse, et il y
                                    lisait le siège social, donc le DOMICILE d'une commerçante
                                    inscrite chez elle mais qui donne cours en salle. L'adresse
                                    affichée ici est celle GRAVÉE dans le rendez-vous. */}
                                {r.lieu_affiche && (
                                  <p style={{ display: 'flex', alignItems: 'flex-start', gap: 4, fontSize: '0.74rem', color: T.muted, lineHeight: 1.4, marginTop: 3 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                                    </svg>
                                    <span>{r.lieu_affiche}</span>
                                  </p>
                                )}
                              </div>
                              {/* ⚠️ UNE SÉANCE D'ABONNEMENT N'EST PAS À « 0 € »,
                                  elle est DÉJÀ PAYÉE. Le prix vit sur le
                                  contrat, chaque séance porte zéro pour ne pas
                                  multiplier le chiffre d'affaires du commerçant
                                  par trente-six, et l'affichage testait
                                  `!= null` : une cliente qui avait réglé son
                                  année voyait trente-six lignes à « 0 € ». */}
                              {libellePrixSeance(r) ? (
                                <p style={{ fontWeight: 800, color: '#10B981', fontSize: '0.7rem', flexShrink: 0, textAlign: 'right', maxWidth: 92, lineHeight: 1.3 }}>{libellePrixSeance(r)}</p>
                              ) : r.prix_estime != null && (
                                <p style={{ fontWeight: 900, color: T.main, fontSize: '0.95rem', letterSpacing: '-0.3px', flexShrink: 0 }}>{Number(r.prix_estime).toFixed(0)}€</p>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#F0FDF4', borderRadius: 100, padding: '3px 9px', border: '1px solid #10B98122' }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981' }}/>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10B981' }}>Confirmé · {heureD}–{heureF}</span>
                              </span>
                              {r.acompte_paye_en_ligne && r.acompte_montant && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: T.pale, borderRadius: 100, padding: '3px 9px', border: `1px solid ${T.main}22` }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 11h20"/>
                                  </svg>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: T.main }}>
                                    Acompte {Number(r.acompte_montant).toFixed(2)}€ payé
                                  </span>
                                </span>
                              )}
                            </div>
                            {/* Lien discret "Annuler ce RDV". La route vérifie le cutoff
                                (rdv_delai_annulation_heures) et refund l'acompte si OK. */}
                            <button onClick={() => annulerRdv(r)}
                              style={{ marginTop: 10, padding: '6px 12px', background: 'transparent', color: '#DC2626', border: '1px solid #DC262644', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', fontFamily: '"DM Sans", sans-serif' }}>
                              Annuler ce RDV
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}

                {/* RDVs passes / annules */}
                {rdvsPasses.length > 0 && (
                  <div style={{ marginTop: rdvsAVenir.length > 0 ? '1.5rem' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historique</span>
                      <div style={{ flex: 1, height: 1, background: T.pale }}/>
                    </div>
                    {rdvsPasses.slice(0, 5).map(r => {
                      const dateObj = r.date_rdv ? new Date(r.date_rdv + 'T12:00:00') : null
                      // Mapping statuts vers libellés FR + couleur (badge)
                      const statutMap = {
                        honore:             { label: '✓ Effectué',                 bg: '#F0FDF4', color: '#10B981' },
                        annule_client:      { label: 'Annulé par toi',             bg: '#FEF2F2', color: '#DC2626' },
                        annule_commercant:  { label: 'Annulé par le commerçant',   bg: '#FEF2F2', color: '#DC2626' },
                        no_show:            { label: 'Non honoré',                 bg: '#F9FAFB', color: '#6B7280' },
                        reporte:            { label: 'Reporté',                    bg: '#FFF7ED', color: '#EA580C' },
                      }
                      const st = statutMap[r.statut] || { label: r.statut, bg: T.pale, color: T.muted }
                      const statutLabel = st.label
                      const statutBg = st.bg
                      const statutColor = st.color
                      return (
                        <div key={r.id} style={{ background: '#fff', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.5rem', border: `1px solid ${T.pale}`, opacity: 0.75, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontWeight: 700, color: T.ink, marginBottom: 2, fontSize: '0.875rem' }}>
                              {r.commercant?.nom} <span style={{ color: T.muted, fontWeight: 600 }}>- {r.prestation_nom || 'RDV'}</span>
                            </p>
                            <p style={{ fontSize: '0.7rem', color: T.muted }}>
                              {dateObj?.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })} · {r.heure_debut?.slice(0,5)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {/* Même règle dans l'historique : « 0 € » sur une
                                séance d'abonnement se lit comme une séance
                                gratuite, pas comme une séance déjà réglée. */}
                            {libellePrixSeance(r)
                              ? <p style={{ fontWeight: 800, color: '#10B981', marginBottom: 3, fontSize: '0.66rem', lineHeight: 1.3 }}>Compris dans<br/>ton abonnement</p>
                              : r.prix_estime != null && <p style={{ fontWeight: 700, color: T.main, marginBottom: 3, fontSize: '0.875rem' }}>{Number(r.prix_estime).toFixed(0)}€</p>}
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: statutBg, color: statutColor }}>{statutLabel}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Empty state */}
                {rdvsAVenir.length === 0 && rdvsPasses.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: T.muted }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 700, color: T.deep, marginBottom: 6 }}>Aucun rendez-vous pour l&apos;instant</p>
                    <p style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>Réserve chez un coiffeur, esthéticien ou autre service depuis l&apos;onglet Accueil.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FAVORIS */}
          {/* TRIBU */}
          {onglet === 'tribu' && (
            <div>
              {/* Hero - wordmark "Yoppers" tricolore (cohérence design system) + 3 cercles animés */}
              <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.main} 100%)`, padding: '2rem 1rem 2.25rem', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 50% 100%, ${T.light}33 0%, transparent 60%)`, pointerEvents: 'none' }}/>
                {/* Barre dégradée fine en haut - signature visuelle Yoppaa */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

                <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: 8, opacity: 0.85 }}>
                  La tribu
                </p>
                <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2.4rem', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 10 }}>
                  <span style={{ color: '#fff' }}>Yo</span>
                  <span style={{ color: T.light }}>pp</span>
                  <span style={{ color: T.mid }}>ers</span>
                </p>
                {/* Dots V2-B sous le wordmark Yoppers - animation pop cascade UNE FOIS au chargement de l'onglet */}
                <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 9, height: 22, marginBottom: 14 }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: `0 4px 14px #ffffff66`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s forwards' }}/>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.light, marginTop: 6.4, boxShadow: `0 4px 14px ${T.light}66`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.2s forwards' }}/>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: T.light, marginTop: 6.4, boxShadow: `0 4px 14px ${T.light}66`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.3s forwards' }}/>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.mid, marginTop: 6.4, boxShadow: `0 4px 14px ${T.mid}66`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.4s forwards' }}/>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: T.mid, boxShadow: `0 4px 14px ${T.mid}66`, opacity: 0, animation: 'dot-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.5s forwards' }}/>
                </div>
                <p style={{ fontSize: '0.85rem', color: T.light, lineHeight: 1.55, opacity: 0.92, maxWidth: 320, margin: '0 auto' }}>
                  Tu fais vivre Yoppaa. Suggère un commerce qu&rsquo;on devrait ajouter, ou signale un souci sur une fiche.
                </p>
                {/* Pastille tribu locale : rend la communauté tangible (données déjà chargées) */}
                {commercants.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '5px 14px', borderRadius: 100, background: 'rgba(255,255,255,0.12)', border: `1px solid ${T.light}33`, fontSize: '0.72rem', fontWeight: 700, color: '#fff' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B98199' }}/>
                    {commercants.length} commerce{commercants.length > 1 ? 's' : ''} près de toi
                  </span>
                )}
              </div>

              <div style={{ padding: '1.25rem 1rem 1rem' }}>

                {/* Section 1 : Suggérer un commerce */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                    Suggérer un commerce
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                </div>
                <SuggestionForm clientId={clientId}/>

                {/* Section 2 : Faire grandir la tribu (partage de l'app) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 24 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                    Faire grandir la tribu
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                </div>
                <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px 14px', border: `1px solid ${T.pale}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m3 11 18-8-8 18-2.5-7.5L3 11Z"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: T.ink, margin: '0 0 4px', letterSpacing: '-0.2px', lineHeight: 1.3 }}>
                        Plus on est de Yoppers, plus le quartier vit
                      </p>
                      <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.5 }}>
                        Fais découvrir Yoppaa à tes voisins, ta famille, tes collègues : chaque Yopper en plus aide tes commerçants préférés.
                      </p>
                    </div>
                  </div>
                  <button onClick={partagerYoppaa}
                    style={{ width: '100%', padding: '10px 18px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: `0 4px 14px ${T.main}44` }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>
                    </svg>
                    Partager Yoppaa
                  </button>
                </div>

                {/* Section 3 : Signaler un problème */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 24 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                    Signaler un problème
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                </div>

                <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px 14px', border: `1px solid ${T.pale}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
                        <path d="M12 9v4M12 17h.01"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: T.ink, margin: '0 0 4px', letterSpacing: '-0.2px', lineHeight: 1.3 }}>
                        Tu vois un problème sur une fiche&nbsp;?
                      </p>
                      <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.5 }}>
                        Commerce fermé, horaires faux, numéro qui ne répond plus… Ouvre la fiche concernée et clique sur <strong style={{ color: T.deep, fontWeight: 700 }}>« Signaler un problème »</strong> en bas.
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setOnglet('accueil')}
                    style={{ width: '100%', padding: '10px 18px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    Voir les commerces
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PROFIL */}
          {onglet === 'profil' && (
            <div>
              <div className="hero-fullwidth" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #1e0950 100%)`, padding: '0.875rem 1rem 2.25rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 2 }}/>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 50%, ${T.main}44 0%, transparent 55%), radial-gradient(circle at 10% 90%, ${T.light}18 0%, transparent 50%)`, pointerEvents: 'none' }}/>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, position: 'relative' }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', margin: 0, opacity: 0.85 }}>{client.email ? 'Mon profil' : 'Bienvenue'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 6px 20px ${T.main}66, 0 0 0 3px rgba(255,255,255,0.15)` }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4"/>
                      <path d="M3 21Q3 16 12 16 Q21 16 21 21"/>
                    </svg>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {client.email
                      ? <EditablePrenom client={client} setClient={setClient} clientId={clientId} openSignal={editProfilSignal}/>
                      : <div>
                          <p style={{ fontWeight: 900, marginBottom: 10, fontSize: '1.2rem', letterSpacing: '-0.4px' }}>
                            <span style={{ color: '#fff' }}>Les </span>
                            <span style={{ color: T.light }}>Yoppers</span>
                            <span style={{ color: T.mid }}> 🟣</span>
                          </p>
                          <button onClick={() => router.push('/commander/auth?redirect=/commander')}
                            style={{ padding: '0.625rem 1.25rem', background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 100, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                            Se connecter →
                          </button>
                        </div>
                    }
                  </div>
                </div>
              </div>

              <div style={{ padding: '0 1rem 1rem', marginTop: '-1.25rem' }}>
                {/* Bandeau profil incomplet - visible si Yopper connecte mais qu'il manque
                    nom et/ou telephone (cas typique : auth via Magic Link sans signup complet).
                    Clic = ouvre directement EditablePrenom en edit mode + scroll vers le haut. */}
                {client.email && (() => {
                  const champsManquants = []
                  if (!client.prenom || !client.prenom.trim()) champsManquants.push('prénom')
                  if (!client.nom || !client.nom.trim()) champsManquants.push('nom')
                  if (!client.telephone || !client.telephone.trim()) champsManquants.push('téléphone')
                  if (champsManquants.length === 0) return null
                  const texteManquants = champsManquants.length === 1
                    ? `ton ${champsManquants[0]}`
                    : champsManquants.length === 2
                      ? `ton ${champsManquants[0]} et ton ${champsManquants[1]}`
                      : `ton ${champsManquants[0]}, ton ${champsManquants[1]} et ton ${champsManquants[2]}`
                  return (
                    <button onClick={() => {
                      setEditProfilSignal(s => s + 1)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                        background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                        border: '1.5px solid #F59E0B', borderRadius: 14, padding: '12px 14px',
                        marginBottom: '0.875rem',
                        // Compensation du marginTop:-1.25rem du parent : sans ce push down,
                        // le label PROFIL INCOMPLET tombe dans la zone violette du hero et est masque.
                        // Seule la card 'Temps economise' garde l'effet d'overlap visuel.
                        marginTop: '1.5rem',
                        position: 'relative', zIndex: 1,
                        cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                        boxShadow: '0 2px 8px rgba(245,158,11,0.15)',
                      }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid #F59E0B' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 8v4M12 16h.01"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 10, fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0, marginBottom: 2 }}>
                          Profil incomplet
                        </p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#78350F', margin: 0, lineHeight: 1.35 }}>
                          Il manque {texteManquants} - clique pour compléter
                        </p>
                      </div>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </button>
                  )
                })()}

                {/* Header de section (style aligné sur l'onglet Tribu) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: '1.5rem', position: 'relative', zIndex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                    Mon activité
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                </div>

                {/* Card stat principale : temps economise - taille reduite pour rééquilibrer avec
                    le grid 2x2 en dessous (avant la hero etait trop dominante). Sous-titre adapte
                    selon si le Yopper a des RDVs ou seulement des commandes. */}
                {(() => {
                  const nbCmdRec = clientCommandes.filter(c => c.statut === 'recupere').length
                  const nbRdv = rdvsActifs.length
                  const sousTitre = nbRdv > 0
                    ? `${nbCmdRec + nbRdv} moment${(nbCmdRec + nbRdv) > 1 ? 's' : ''} sans friction`
                    : `${nbCmdRec} commande${nbCmdRec > 1 ? 's' : ''} sans faire la file`
                  return (
                    <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', marginBottom: '0.625rem', boxShadow: `0 4px 20px ${T.main}14`, border: `1px solid ${T.pale}` }}>
                      <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                      <div style={{ padding: '1.125rem 1rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                          <IconClock size={11} color={T.muted}/>
                          <p style={{ fontSize: '0.6rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Temps économisé</p>
                        </div>
                        <p style={{ fontSize: '2.5rem', fontWeight: 900, color: T.main, letterSpacing: '-2px', marginBottom: 2, lineHeight: 1 }}>
                          {tempsEconomise >= 60 ? `${Math.floor(tempsEconomise/60)}h${tempsEconomise%60>0?(tempsEconomise%60)+'min':''}` : `${tempsEconomise} min`}
                        </p>
                        <p style={{ fontSize: '0.78rem', color: T.muted, margin: 0 }}>
                          {sousTitre}
                        </p>
                      </div>
                    </div>
                  )
                })()}

                {/* Grid 2x2 stats : Commandes / RDV / Depense local / Commerces.
                    4 metriques egales en visuel pour equilibrer la page profil. */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.875rem' }}>
                  {[
                    {
                      label: 'Commandes', value: clientCommandes.length, color: T.main, bg: T.pale,
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></svg>,
                    },
                    {
                      label: 'RDV', value: rdvsActifs.length, color: '#10B981', bg: '#F0FDF4',
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
                    },
                    {
                      label: 'Dépensé local', value: `${totalDepense.toFixed(0)}€`, color: T.mid, bg: `${T.mid}18`,
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.mid} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9.5c-1-1-2.5-1.5-4-1.5C7 8 5 10 5 12s2 4 5 4c1.5 0 3-.5 4-1.5"/><path d="M3 10h6M3 14h6"/></svg>,
                    },
                    {
                      label: 'Commerces', value: commercesUniques, color: T.deep, bg: `${T.deep}14`,
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.deep} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9"/><path d="M3 9c0 1.5 1 3 3 3s3-1.5 3-3 1 3 3 3 3-1.5 3-3 1 3 3 3 3-1.5 3-3"/></svg>,
                    },
                  ].map((s, i) => (
                    <div key={i} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${T.pale}`, boxShadow: '0 2px 8px rgba(107,53,196,0.06)' }}>
                      <div style={{ height: 2, background: `linear-gradient(90deg, ${s.color}, ${s.color}55)` }}/>
                      <div style={{ padding: '0.75rem 0.75rem 0.875rem', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, background: s.bg, marginBottom: 5 }}>
                          {s.icon}
                        </div>
                        <p style={{ fontSize: '0.58rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3, marginTop: 0 }}>{s.label}</p>
                        <p style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, letterSpacing: '-0.8px', margin: 0, lineHeight: 1 }}>{s.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pas connecté : le profil ne peut pas montrer les cartes, il
                    doit le DIRE. Silencieux, il laissait croire qu'aucun achat
                    n'avait été compté (Alex, 05/08). */}
                {!fidConnecte && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: '0.875rem', border: `1px solid ${T.pale}` }}>
                    <p style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 6px' }}>
                      Mes cartes de fidélité
                    </p>
                    <p style={{ fontSize: '0.8rem', color: T.muted, lineHeight: 1.55, margin: 0 }}>
                      Connecte-toi pour retrouver tes cartes et voir où en sont tes points 🟣
                    </p>
                  </div>
                )}

                {/* 🔴 MES BONS CADEAUX (28/08). Ils n'existaient QUE dans
                    l'email du jour de l'achat : perdre l'email, c'était perdre
                    le bon. Alex, en production : « rien côté Yopper, pas de
                    trace des BC dans son compte ».

                    ⚠️ AU-DESSUS DES CARTES DE FIDÉLITÉ, et c'est voulu : un bon
                    cadeau est de l'argent qui DORT et qui peut EXPIRER, une
                    carte de fidélité se remplit toute seule sans rien risquer.

                    ⚠️ Chaque bon mène à sa page par jeton, qui reste la seule
                    vue complète (solde en temps réel, mode d'emploi). */}
                {mesBons.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px 12px', marginBottom: '0.875rem', border: '1px solid #86EFAC' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        {mesBons.length > 1 ? 'Mes bons cadeaux' : 'Mon bon cadeau'}
                      </span>
                      <div style={{ flex: 1, height: 1, background: '#D1FAE5' }}/>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>
                        {eurosNus(mesBons.reduce((s, b) => s + Number(b.solde || 0), 0))}€
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {mesBons.map(b => {
                        const jours = b.expires_at
                          ? Math.ceil((new Date(b.expires_at).getTime() - Date.now()) / 86400000)
                          : null
                        // ⚠️ ON N'ALARME QUE QUAND IL Y A DE QUOI : un bon
                        // valable encore onze mois n'a pas besoin d'un compte
                        // à rebours, il ferait du bruit pour rien.
                        const presse = jours !== null && jours <= 30
                        return (
                          <a key={b.id} href={`/cadeau/${b.token}`}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#F0FDF4', border: '1px solid #D1FAE5', borderRadius: 12, padding: '10px 12px', textDecoration: 'none' }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#065F46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {b.commercant?.nom || 'Bon cadeau'}
                              </p>
                              <p style={{ margin: '2px 0 0', fontSize: '0.72rem', fontWeight: 600, color: presse ? '#B45309' : '#047857' }}>
                                {b.code}
                                {jours !== null && (presse
                                  ? ` · expire dans ${jours} jour${jours > 1 ? 's' : ''}`
                                  : ` · valable jusqu’au ${new Date(b.expires_at).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' })}`)}
                              </p>
                            </div>
                            <span style={{ flexShrink: 0, fontSize: '1rem', fontWeight: 900, color: '#059669', letterSpacing: '-0.3px' }}>
                              {eurosNus(b.solde)}€
                              {Number(b.solde) < Number(b.montant_initial) && (
                                <span style={{ display: 'block', fontSize: '0.62rem', fontWeight: 700, color: '#047857', opacity: 0.75, textAlign: 'right' }}>
                                  sur {eurosNus(b.montant_initial)}€
                                </span>
                              )}
                            </span>
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Mes cartes de fidélité (B.6) : une carte par commerçant, jauge
                    tampons ou cagnotte, badge quand une récompense est débloquée */}
                {mesCartesFid.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px 12px', marginBottom: '0.875rem', border: `1px solid ${T.pale}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Mes cartes de fidélité
                      </span>
                      <div style={{ flex: 1, height: 1, background: T.pale }}/>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{mesCartesFid.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {mesCartesFid.map(carte => {
                        const com = carte.commercant || {}
                        const estCagnotte = com.fidelite_mecanique === 'cagnotte'
                        const seuilP = com.fidelite_seuil_passages || 10
                        const seuilC = Number(com.fidelite_seuil_cagnotte || 10)
                        const pct = estCagnotte ? Math.min(100, Math.round((Number(carte.cagnotte) / seuilC) * 100)) : Math.min(100, Math.round((carte.passages / seuilP) * 100))
                        // ⚠️ UN NOMBRE, PAS UN BOOLÉEN. Deux récompenses ne
                        // s'annonçaient pas plus qu'une, ici comme sur la fiche.
                        const nbRecompenses = Number(carte.recompenses_disponibles || 0)
                        const recompense = nbRecompenses > 0
                        const lien = com.categorie === 'vitrine' ? `/commander/rdv/${com.slug}` : `/commander/${com.slug}`
                        const libelle = com.fidelite_recompense_libelle
                          || (com.fidelite_recompense_type === 'remise_pct' && com.fidelite_recompense_valeur ? `-${Number(com.fidelite_recompense_valeur)}%` : com.fidelite_recompense_valeur ? `${Number(com.fidelite_recompense_valeur).toFixed(2)}€ offerts` : 'Récompense fidélité')
                        return (
                          <button key={carte.id} onClick={() => com.slug && router.push(lien)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${recompense ? '#10B98155' : T.pale}`, background: recompense ? '#F0FDF4' : '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'left', width: '100%' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {com.logo_url
                                ? <img decoding="async" loading="lazy" src={com.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                                : <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.95rem' }}>{(com.nom || 'Y').charAt(0).toUpperCase()}</span>}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{com.nom}</p>
                              <div style={{ height: 6, borderRadius: 100, background: T.pale, overflow: 'hidden', margin: '5px 0 3px' }}>
                                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: recompense ? '#10B981' : `linear-gradient(90deg, ${T.main}, ${T.mid})`, transition: 'width 0.3s' }}/>
                              </div>
                              <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 700, color: recompense ? '#059669' : T.muted }}>
                                {recompense
                                  ? libelleCarteRecompenses(nbRecompenses, libelle, { court: true })
                                  : estCagnotte
                                    ? `${Number(carte.cagnotte).toFixed(2).replace('.', ',')}€ / ${seuilC.toFixed(2).replace('.', ',')}€ → ${libelle}`
                                    : `${carte.passages}/${seuilP} passages → ${libelle}`}
                              </p>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={recompense ? '#10B981' : T.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="M9 6l6 6-6 6"/>
                            </svg>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Mes avis - derniers avis vérifiés laissés par le Yopper */}
                {client.email && (
                  <SectionMesAvis clientId={clientId}/>
                )}

                {/* Mes favoris - accessible si Yopper connecté.
                    Déplacé ici depuis l'ancien onglet "Favoris" du footer (remplacé par Services). */}
                {client.email && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px 12px', marginBottom: '0.875rem', border: `1px solid ${T.pale}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Mes favoris
                      </span>
                      <div style={{ flex: 1, height: 1, background: T.pale }}/>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{commercantsFavoris.length}</span>
                    </div>
                    {commercantsFavoris.length === 0 ? (
                      <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, margin: 0 }}>
                        Tape l&rsquo;étoile sur un commerce pour le retrouver ici en un clic.
                      </p>
                    ) : (
                      <div className="commerces-grid" style={{ marginTop: 4 }}>
                        {commercantsFavoris.map(c => <CarteCommerce key={c.id} c={c} favoris={favoris} notesParCommerce={notesParCommerce} statutsCommerce={statutsCommerce} fermetures={fermetures} dealsActifs={dealsActifs} actusActives={actusActives} bonnesAffairesActives={bonnesAffairesActives} onSelect={selectionnerCommercant} onToggleFavori={toggleFavori} onPartager={partagerCommerce}/>)}
                      </div>
                    )}
                  </div>
                )}

                {/* Header Réglages : regroupe notifs + commune + mot de passe + déconnexion
                    (avant, la carte notifications était coincée entre deux blocs de stats) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 20 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                    Réglages
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                </div>

                {/* Notifications : bouton explicite d'activation/réparation des push
                    (le prompt ne se déclenchait qu'au favori/commande, cf. bug 18/07). */}
                <CarteNotifications />

                {/* Card "Ma commune" - accessible si Yopper connecté.
                    Clic sur "Changer" ouvre la modale ConfirmCommune en mode 'change'
                    (fermable + liste manuelle directe). */}
                {client.email && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: '0.875rem', border: `1px solid ${T.pale}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.7px', margin: 0 }}>
                        Ma commune principale
                      </p>
                      <p style={{ fontSize: 15, fontWeight: 800, color: T.ink, margin: '2px 0 0', letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {commune?.nom || 'Non définie'}
                      </p>
                    </div>
                    <button onClick={() => setShowConfirmCommune(true)}
                      style={{ padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
                      Changer
                    </button>
                  </div>
                )}

                {client.email && (
                  <button onClick={() => router.push('/commander/auth/definir-mdp')}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '0.875rem', background: 'transparent', color: T.main, border: `1.5px solid ${T.pale}`, borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', marginBottom: 10, fontFamily: '"DM Sans", sans-serif' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    {aMotDePasse ? 'Modifier mon mot de passe' : 'Créer un mot de passe'}
                  </button>
                )}

                {client.email && (
                  <button onClick={async () => {
                    // ⚠️ AVANT LE `signOut`, JAMAIS APRÈS. C'est ce marqueur qui
                    // distingue « il s'en va » de « la session est tombée ».
                    // Sans lui, la restauration le reconnecterait aussitôt.
                    marquerDeconnexionVoulue()
                    await supabase.auth.signOut()
                    ;['yoppaa_email','yoppaa_nom','yoppaa_prenom','yoppaa_telephone','yoppaa_client_id','yoppaa_onglet'].forEach(k => localStorage.removeItem(k))
                    // Efface aussi le cookie serveur (vrai logout : get-own ne doit plus rien renvoyer).
                    fetch('/api/yopper/session', { method: 'DELETE' }).catch(() => {})
                    // ⚠️ LES RENDEZ-VOUS RESTAIENT À L'ÉCRAN. Cette remise à zéro
                    // oubliait `clientRdvs`, `mesCartesFid` et `commune` : après
                    // déconnexion, les rendez-vous de la personne qui venait de
                    // partir restaient affichés, et la pastille du pied de page
                    // continuait de les compter. Le relevé toutes les cinq
                    // secondes ne les effaçait pas non plus, il saute le tour
                    // quand il n'y a plus d'email.
                    setClient({ nom:'', email:'', telephone:'', prenom:'' }); setClientId(null)
                    setFavoris([]); setCommercantsFavoris([]); setClientCommandes([])
                    setClientRdvs([]); setMesCartesFid([]); setCommune(null)
                    // On reste sur l'onglet Profil (état invité + CTA connexion) et on remonte en haut.
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
                  }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '0.875rem', background: 'transparent', color: '#DC2626', border: '1.5px solid #DC262633', borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <path d="M16 17l5-5-5-5"/>
                      <path d="M21 12H9"/>
                    </svg>
                    Se déconnecter
                  </button>
                )}

                {/* Suppression de compte. Obligatoire à deux titres : droit à
                    l'effacement du RGPD, et règle commune à Apple et Google qui
                    refusent toute app permettant de créer un compte sans
                    permettre de le supprimer depuis l'app. */}
                {client.email && (
                  <SupprimerCompte email={client.email} onSupprime={() => {
                    ;['yoppaa_email','yoppaa_nom','yoppaa_prenom','yoppaa_telephone','yoppaa_client_id','yoppaa_onglet'].forEach(k => localStorage.removeItem(k))
                    // ⚠️ LES RENDEZ-VOUS RESTAIENT À L'ÉCRAN. Cette remise à zéro
                    // oubliait `clientRdvs`, `mesCartesFid` et `commune` : après
                    // déconnexion, les rendez-vous de la personne qui venait de
                    // partir restaient affichés, et la pastille du pied de page
                    // continuait de les compter. Le relevé toutes les cinq
                    // secondes ne les effaçait pas non plus, il saute le tour
                    // quand il n'y a plus d'email.
                    setClient({ nom:'', email:'', telephone:'', prenom:'' }); setClientId(null)
                    setFavoris([]); setCommercantsFavoris([]); setClientCommandes([])
                    setClientRdvs([]); setMesCartesFid([]); setCommune(null)
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}/>
                )}

                {/* ── Mentions légales, CGU et confidentialité ──────────────────
                    ⚠️ OBLIGATOIRE POUR LES DEUX STORES. Apple et Google exigent
                    que la politique de confidentialité soit atteignable DEPUIS
                    L'APPLICATION, pas seulement depuis le site vitrine. Le lien
                    n'existait que dans le pied de la landing : c'est un motif de
                    rejet classique, et il ne coûte rien à corriger.
                    Affiché pour TOUT LE MONDE, y compris sans compte : le
                    visiteur qui commande en invité a exactement les mêmes
                    droits d'information. */}
                <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${T.pale}`, display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
                  {[
                    { href: '/legal#cgu-client', label: 'Conditions d’utilisation' },
                    { href: '/legal#confidentialite', label: 'Confidentialité' },
                    { href: '/legal#mentions', label: 'Mentions légales' },
                  ].map(l => (
                    <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '0.74rem', fontWeight: 700, color: T.muted, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal confirmation custom : remplace window.confirm() qui est bloque/silencieux
            en PWA installee iPhone. Boutons Confirmer / Annuler. Clic backdrop = ferme. */}
        {confirmModal && (
          <div role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal(null) }}
            style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(22,6,54,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: '#fff', borderRadius: 20, maxWidth: 380, width: '100%', padding: '1.75rem 1.5rem 1.25rem', boxShadow: '0 30px 80px rgba(0,0,0,0.45)', animation: 'modal-in 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}>
              <h2 style={{ fontWeight: 900, fontSize: '1.2rem', color: T.ink, marginBottom: 8, letterSpacing: '-0.3px', textAlign: 'center' }}>
                {confirmModal.title}
              </h2>
              {confirmModal.message && (
                <p style={{ fontSize: '0.9rem', color: T.muted, lineHeight: 1.5, textAlign: 'center', marginBottom: 20 }}>
                  {confirmModal.message}
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={async () => {
                    const cb = confirmModal.onConfirm
                    setConfirmModal(null)
                    if (cb) await cb()
                  }}
                  style={{ width: '100%', padding: '0.9rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '0.95rem', background: confirmModal.danger ? 'linear-gradient(135deg, #DC2626, #B91C1C)' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: confirmModal.danger ? '0 6px 22px rgba(220,38,38,0.5)' : `0 6px 22px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }}>
                  {confirmModal.confirmLabel || 'Confirmer'}
                </button>
                <button
                  onClick={async () => {
                    const cb = confirmModal.onCancel
                    setConfirmModal(null)
                    if (cb) await cb()
                  }}
                  style={{ width: '100%', padding: '0.75rem', background: 'transparent', color: T.deep, border: `1.5px solid ${T.pale}`, borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif' }}>
                  {confirmModal.cancelLabel || 'Annuler'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast global : feedback ephemere 3.5s (favori, info), flotte au-dessus de la nav */}
        {toast && (
          <div role="status" aria-live="polite"
            style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)', zIndex: 1200, background: toast.type === 'success' ? `linear-gradient(135deg, ${T.deep}, ${T.bgPanel})` : T.bgPanel, color: '#fff', padding: '11px 16px', borderRadius: 100, fontSize: '0.82rem', fontWeight: 700, boxShadow: '0 8px 28px rgba(26,8,64,0.35), 0 0 0 1.5px rgba(255,255,255,0.08) inset', maxWidth: '92vw', display: 'inline-flex', alignItems: 'center', gap: 10, animation: 'toast-in 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}>
            {toast.type === 'success' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#10B981', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              </span>
            )}
            <span style={{ lineHeight: 1.3 }}>{toast.msg}</span>
          </div>
        )}

        {/* ── NAV BAR ── */}
        <nav className="navbar hero-fullwidth">
        <div className="navbar-tabs">
          {[
            { key: 'accueil',   label: 'Accueil',   badge: 0 },
            // Onglet 'commandes' : pas de label (label vide) + icône plus grande pour compenser,
            // 2 pastilles distinctes (violette = commandes en cours, verte = RDVs a venir).
            // Pills légendées (icône + chiffre) : violette = commandes, verte = RDV.
            // La violette PULSE quand une action attend le Yopper (commande prête
            // à retirer, ou livraison en route à réceptionner).
            { key: 'commandes', label: 'Suivi', badgeCmd: commandesASwiper.length + commandesEnLivraison.length + commandesEnCours.length, badgeRdv: rdvsAVenir.length, badgeCmdUrgent: (commandesASwiper.length + commandesEnLivraison.length) > 0, badge: badgeCommandes },
            { key: 'tribu',     label: 'Tribu',     badge: 0 },
            { key: 'profil',    label: 'Profil',    badge: 0 },
          ].map(item => {
            const actif = onglet === item.key
            const op = actif ? 1 : 0.5
            const stroke = '#ffffff'
            return (
              <button key={item.key} onClick={() => setOnglet(item.key)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0.625rem 0 0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', position: 'relative' }}>

                {item.key === 'accueil' && (
                  /* Maison (remplace les 3 dots horizontaux, trop proches du
                     glyphe « plus d'options » ⋯ — décision Alex 23/07). */
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                    <path d="M3 11 L12 3.5 L21 11" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                    <path d="M5.5 9.5 L5.5 20 L18.5 20 L18.5 9.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                    <path d="M10 20 L10 14.5 L14 14.5 L14 20" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                  </svg>
                )}
                {item.key === 'commandes' && (
                  /* Icone v4 : agrandie 36px + decalee vers le bas (marginTop 6) pour
                     laisser de la place aux pastilles qui descendent aussi (top 6).
                     Sans ce decalage, pastilles + icone faisaient effet 'oreilles de Mickey'. */
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision" style={{ marginTop: 2 }}>
                    {/* Cadre calendrier */}
                    <rect x="3" y="5" width="18" height="16" rx="2.5" stroke={stroke} strokeWidth="2" strokeLinejoin="round" opacity={op}/>
                    {/* Barre header */}
                    <path d="M3,9.5 L21,9.5" stroke={stroke} strokeWidth="2" opacity={op}/>
                    {/* Anneaux du haut */}
                    <path d="M8,3 L8,7 M16,3 L16,7" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                    {/* 3 traits 'items de la liste' a l'interieur */}
                    <path d="M7,13   L17,13"   stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity={op * 0.85}/>
                    <path d="M7,16   L15,16"   stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity={op * 0.85}/>
                    <path d="M7,19   L13,19"   stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity={op * 0.85}/>
                  </svg>
                )}
                {item.key === 'tribu' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                    <circle cx="5" cy="8" r="2.5" stroke={stroke} strokeWidth="2" opacity={op * 0.75}/>
                    <path d="M1.5,17.5 Q1.5,14 5,14 Q8.5,14 8.5,17.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op * 0.75}/>
                    <circle cx="19" cy="8" r="2.5" stroke={stroke} strokeWidth="2" opacity={op * 0.75}/>
                    <path d="M15.5,17.5 Q15.5,14 19,14 Q22.5,14 22.5,17.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op * 0.75}/>
                    <circle cx="12" cy="6" r="3.5" stroke={stroke} strokeWidth="2" opacity={op}/>
                    <path d="M5.5,20 Q5.5,15 12,15 Q18.5,15 18.5,20" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                  </svg>
                )}
                {item.key === 'profil' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                    <circle cx="12" cy="8" r="4.5" stroke={stroke} strokeWidth="2" opacity={op}/>
                    <path d="M3,21 Q3,16 12,16 Q21,16 21,21" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                  </svg>
                )}

                {/* Onglet 'commandes' : 2 pastilles distinctes.
                    Violette en haut GAUCHE = commandes (pretes a retirer + en cours).
                    Verte    en haut DROITE = RDVs a venir.
                    Ordre coherent avec le toggle interne (Commandes a gauche / RDVs a droite).
                    Si une seule est >0, l'autre n'est pas rendue (pas de "0"). */}
                {item.key === 'commandes' && item.badgeCmd > 0 && (
                  <span style={{ position: 'absolute', top: 2, right: 'calc(50% + 6px)', height: 20, padding: '0 7px 0 5px', borderRadius: 100, background: T.main, color: '#fff', fontSize: '0.7rem', fontWeight: 900, fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 3, border: '2px solid #fff', boxShadow: `0 2px 8px ${T.main}99, 0 0 0 1.5px ${T.main}44`, lineHeight: 1, letterSpacing: '-0.2px', animation: item.badgeCmdUrgent ? 'navPillPulse 1.4s ease-in-out infinite' : 'none' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>
                    {item.badgeCmd > 9 ? '9+' : item.badgeCmd}
                  </span>
                )}
                {item.key === 'commandes' && item.badgeRdv > 0 && (
                  <span style={{ position: 'absolute', top: 2, left: 'calc(50% + 6px)', height: 20, padding: '0 7px 0 5px', borderRadius: 100, background: '#10B981', color: '#fff', fontSize: '0.7rem', fontWeight: 900, fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 3, border: '2px solid #fff', boxShadow: '0 2px 8px rgba(16,185,129,0.55), 0 0 0 1.5px rgba(16,185,129,0.27)', lineHeight: 1, letterSpacing: '-0.2px' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
                    {item.badgeRdv > 9 ? '9+' : item.badgeRdv}
                  </span>
                )}

                {item.label && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: actif ? '#fff' : '#6B7280', letterSpacing: '0.2px', fontFamily: '"DM Sans", sans-serif' }}>
                    {item.label}
                  </span>
                )}
                {actif && <div style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', width: 22, height: 3, borderRadius: 3, background: T.light, boxShadow: `0 0 6px ${T.light}66` }}/>}
              </button>
            )
          })}
        </div>
        </nav>
      </div>
    </>
  )
}
