'use client'
// ════════════════════════════════════════════════════════════════════
// GOOD MORNING YOPPERS — Écran 7h30 quotidien (Phase 1 — MVP visuel)
//
// Données encore mockées : on branche les vraies tables yoppaa_deals
// et actualites une fois le rendu validé visuellement.
//
// Référence canonique : lib/morning/_reference.jsx
// Spec : memory/project_good_morning_yoppers.md
// Design system : memory/feedback_visuel_yoppaa.md
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canDo } from '@/lib/plans'

// ─── Tokens design system (canoniques) ─────────────────────────────
const T = {
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',  // JAMAIS en texte
  pale:     '#EDE0FF',  // JAMAIS en texte
  bgPage:   '#F5F3FA',
  bgCard:   '#FFFFFF',
  hairline: '#F0EBF8',
  urgentBg: '#FFF2F2',
  urgentFg: '#CC3333',
}

// ─── Mapping type de commerce → emoji (pour illustrer la card) ────
// Les emojis restent autorisés sur les cards commerçant comme illustration
// du type de commerce (cf. design system : exception emoji autorisée).
const EMOJI_TYPE = {
  'Boulangerie': '🥐', 'Pâtisserie': '🧁', 'Chocolatier': '🍫',
  'Sandwicherie': '🥪', 'Snack': '🌯', 'Friterie': '🍟',
  'Pizzeria': '🍕', 'Coffee shop': '☕', 'Épicerie': '🛒',
  'Traiteur': '🍽️', 'Boucherie': '🥩', 'Fleuriste': '💐',
  'Pharmacie': '💊', 'Food truck': '🚚',
  'Coiffeur': '💇', 'Opticien': '👓', 'Pressing': '👔',
}
function emojiDuType(type) {
  if (!type) return '🏪'
  // Cas "Boulangerie & Pâtisserie" → prend le premier
  const first = type.split(/\s*[&\/,]\s*/)[0].trim()
  return EMOJI_TYPE[first] || EMOJI_TYPE[type] || '🏪'
}

// Codes postaux belges = 4 chiffres. Extrait depuis l'adresse libre.
function extraireCodePostal(adresse) {
  if (!adresse) return null
  const m = adresse.match(/\b(\d{4})\b/)
  return m ? m[1] : null
}

// Formate un prix en string "1,20€" (français)
function fmtPrix(n) {
  if (n == null) return null
  return Number(n).toFixed(2).replace('.', ',') + '€'
}

// ─── Helpers dates (locale FR-BE) ──────────────────────────────────
const DAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const LAUNCH_DATE = new Date(2026, 0, 1) // 1er janvier 2026

// ─── Fetch des deals + actus de la commune affichée ──────────────
// 3 sources pour les actus :
//   - Commerçants alimentaires (plans BOOST/MAX, canDo morning required)
//   - Vitrines / commerçants services (plans ON et + : retire restriction morning sur les actus)
//   - Services publics locaux de la commune (commune, CPAS, police, écoles...)
// Les deals restent réservés aux commerçants ayant accès au morning.
async function fetchMorningData(commune) {
  if (!commune?.codes_postaux?.length) return { deals: [], actus: [] }
  const today = new Date().toISOString().slice(0, 10)
  const cpDeLaCommune = new Set(commune.codes_postaux)

  const [{ data: dealsRaw }, { data: actusCommercantRaw }, { data: actusPubliqueRaw }] = await Promise.all([
    // 1) Deals : commerçants alimentaires avec accès morning (plans BOOST/MAX)
    supabase
      .from('yoppaa_deals')
      .select(`
        id, titre, description, prix_deal, prix_original, date_deal, article_id, cta_appeler_reserver,
        commercant:commercants ( id, nom, type, adresse, plan, statut_publication )
      `)
      .eq('actif', true)
      .eq('inclus_morning', true)
      .eq('date_deal', today),

    // 2) Actus commerçant : TOUTES (vitrines + alimentaires) publiées
    supabase
      .from('actualites')
      .select(`
        id, titre, contenu, type, date_debut, date_fin, urgence,
        commercant:commercants ( id, nom, type, adresse, plan, statut_publication )
      `)
      .not('commercant_id', 'is', null)
      .eq('actif', true)
      .lte('date_debut', today)
      .gte('date_fin', today),

    // 3) Actus services publics locaux (commune, CPAS, police, écoles)
    //    On exclut les nationaux (112, CEGENO, etc.) — trop génériques pour le morning
    supabase
      .from('actualites')
      .select(`
        id, titre, contenu, type, date_debut, date_fin, urgence,
        service:services_publics ( id, nom, type, codes_postaux, national )
      `)
      .not('service_id', 'is', null)
      .eq('actif', true)
      .lte('date_debut', today)
      .gte('date_fin', today),
  ])

  // Filtres
  function commercantEligibleDeal(c) {
    // Deals : commerçant publié + accès morning (plan BOOST/MAX) + CP commune
    if (!c) return false
    if (c.statut_publication !== 'publie') return false
    if (!canDo(c.plan, 'morning')) return false
    const cp = extraireCodePostal(c.adresse)
    return cp && cpDeLaCommune.has(cp)
  }

  function commercantEligibleActu(c) {
    // Actus : commerçant publié + CP commune (pas de restriction de plan, vitrines OK)
    if (!c) return false
    if (c.statut_publication !== 'publie') return false
    const cp = extraireCodePostal(c.adresse)
    return cp && cpDeLaCommune.has(cp)
  }

  function servicePublicEligible(s) {
    // Service public publié + non national + CP overlap avec la commune
    if (!s) return false
    if (s.national === true) return false
    if (!Array.isArray(s.codes_postaux) || s.codes_postaux.length === 0) return false
    return s.codes_postaux.some(cp => cpDeLaCommune.has(cp))
  }

  // Stocks articles pour les deals
  const articleIds = (dealsRaw || [])
    .filter(d => commercantEligibleDeal(d.commercant) && d.article_id)
    .map(d => d.article_id)
  let stockParArticle = {}
  if (articleIds.length > 0) {
    const { data: articles } = await supabase
      .from('articles')
      .select('id, stock_jour')
      .in('id', articleIds)
    stockParArticle = Object.fromEntries((articles || []).map(a => [a.id, a.stock_jour ?? 0]))
  }

  const deals = (dealsRaw || [])
    .filter(d => commercantEligibleDeal(d.commercant))
    .map(d => ({
      id: d.id,
      commerce: d.commercant.nom,
      type: emojiDuType(d.commercant.type),
      categorie: d.commercant.type || 'Commerce',
      deal: d.titre,
      prix: fmtPrix(d.prix_deal),
      prixNormal: fmtPrix(d.prix_original),
      stock: d.article_id ? (stockParArticle[d.article_id] ?? null) : null,
    }))

  // Emoji par type de service public
  const SERVICE_EMOJI = {
    commune: '🏛️', cpas: '🤝', police: '🚓', pompiers: '🚒',
    ecole: '🏫', medecin_garde: '🩺', pharmacie_garde: '💊', urgence: '🚨', autre: '🏢',
  }

  const actusCommercant = (actusCommercantRaw || [])
    .filter(a => commercantEligibleActu(a.commercant))
    .map(a => ({
      id: 'c-' + a.id,
      commerce: a.commercant.nom,
      type: emojiDuType(a.commercant.type),
      categorie: a.commercant.type || 'Commerce',
      titre: a.titre || null,
      actu: a.contenu || a.titre,
      alerte: a.type === 'alerte' || a.urgence === true,
    }))

  const actusPubliques = (actusPubliqueRaw || [])
    .filter(a => servicePublicEligible(a.service))
    .map(a => ({
      id: 'p-' + a.id,
      commerce: a.service.nom,
      type: SERVICE_EMOJI[a.service.type] || '🏛️',
      categorie: 'Officiel',
      titre: a.titre || null,
      actu: a.contenu || a.titre,
      alerte: a.type === 'alerte' || a.urgence === true,
    }))

  // Tri : alertes en tête, puis actus services publics, puis commerçants
  const actus = [...actusPubliques, ...actusCommercant].sort((a, b) => {
    if (a.alerte && !b.alerte) return -1
    if (!a.alerte && b.alerte) return 1
    return 0
  })

  return { deals, actus }
}

function getMorningContext() {
  const now = new Date()
  const tom = new Date(now); tom.setDate(tom.getDate() + 1)
  return {
    dayShort:     DAYS[now.getDay()],
    dateRest:     `${now.getDate()} ${MONTHS[now.getMonth()]}`,
    tomorrowStr:  `${DAYS[tom.getDay()]} ${tom.getDate()} ${MONTHS[tom.getMonth()]}`,
    editionNb:    Math.floor((now - LAUNCH_DATE) / 86400000) + 1,
  }
}

// ─── Hook useMatchWidth : font-size dynamique pour "Good Morning" ──
// Binary search la font-size qui donne à "Good Morning" la même largeur que "Yoppers".
function useMatchWidth(targetRef, sourceText, fontWeight = '800') {
  const [fontSize, setFontSize] = useState(28)
  useLayoutEffect(() => {
    if (!targetRef.current) return
    const targetW = targetRef.current.offsetWidth
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    let lo = 8, hi = 80, best = 28
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      ctx.font = `${fontWeight} ${mid}px 'DM Sans', sans-serif`
      const w = ctx.measureText(sourceText).width
      if (Math.abs(w - targetW) < 0.5) { best = mid; break }
      if (w < targetW) lo = mid; else hi = mid
      best = mid
    }
    setFontSize(Math.round(best * 10) / 10)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRef.current?.offsetWidth])
  return fontSize
}

// ─── Icons SVG inline (design system : jamais d'emoji UI) ──────────
function IconLocation({ size = 14, color = T.deep }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function IconCalendar({ size = 18, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
}
function IconArrow({ size = 12, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M5 12h14M13 5l7 7-7 7"/>
    </svg>
  )
}
function IconFire({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  )
}
function IconNews({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z"/>
    </svg>
  )
}
function IconChevronDown({ size = 10, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M6 9l6 6 6-6"/>
    </svg>
  )
}

// ─── Composants ─────────────────────────────────────────────────────

function MorningHeader({ ctx, communeAffichee, communePrincipale, communes, onSwitch }) {
  const yoppersRef = useRef(null)
  const gmFontSize = useMatchWidth(yoppersRef, 'Good Morning')
  const [openSwitch, setOpenSwitch] = useState(false)

  const enModeSwitch = communeAffichee && communePrincipale && communeAffichee.id !== communePrincipale.id
  const nomAffiche = communeAffichee?.nom || 'Mettet'

  return (
    <div style={{ padding: '24px 24px 20px', borderBottom: `1px solid ${T.hairline}`, position: 'relative' }}>
      {/* Barre dégradée fine en haut — signature visuelle Yoppaa */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

      {/* Ligne date + numéro d'édition */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.ink, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          {ctx.dayShort}
        </span>
        <span style={{ fontSize: 11, fontWeight: 500, color: T.main, letterSpacing: '0.3px' }}>
          {ctx.dateRest}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: T.mid, letterSpacing: '0.5px' }}>
          <span style={{ opacity: 0.6, marginRight: 2 }}>N°</span>{ctx.editionNb}
        </span>
      </div>

      {/* Wordmark "Good Morning Yoppers" — tricolore */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: gmFontSize, fontWeight: 800, color: T.ink, lineHeight: 1, letterSpacing: '-0.5px', whiteSpace: 'nowrap' }}>
          Good Morning
        </div>
        <div ref={yoppersRef} style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontSize: 48, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span style={{ color: T.ink }}>Yo</span>
          <span style={{ color: T.main }}>pp</span>
          <span style={{ color: T.mid }}>ers</span>
        </div>
      </div>

      {/* Zone : sélecteur de commune (cliquable pour switch session) + 3 dots tricolores */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
        <button
          onClick={() => communes?.length > 0 && setOpenSwitch(o => !o)}
          disabled={!communes?.length}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 6px', background: openSwitch ? T.bgPage : 'transparent', border: `1.5px solid ${openSwitch ? T.main : 'transparent'}`, borderRadius: 100, cursor: communes?.length ? 'pointer' : 'default', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}>
          <IconLocation size={13} color={T.main}/>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, letterSpacing: '0.5px' }}>
            {nomAffiche}
          </span>
          {communes?.length > 0 && <IconChevronDown size={9} color={T.main}/>}
        </button>

        {/* Indicateur switch session */}
        {enModeSwitch && (
          <span style={{ fontSize: 9, fontWeight: 700, color: T.mid, fontStyle: 'italic' }}>
            (cette session)
          </span>
        )}

        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.ink }}/>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.main }}/>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.mid }}/>
        </div>

        {/* Dropdown communes — popup ancré sous le bouton */}
        {openSwitch && (
          <>
            {/* overlay clic-pour-fermer */}
            <div onClick={() => setOpenSwitch(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 50 }}/>
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, boxShadow: '0 12px 32px rgba(26,8,64,0.18)', zIndex: 60, minWidth: 220, maxHeight: 320, overflowY: 'auto' }}>
              {enModeSwitch && (
                <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${T.hairline}`, background: T.bgPage }}>
                  <p style={{ fontSize: 9, fontWeight: 800, color: T.mid, textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 2px' }}>
                    Ta commune principale
                  </p>
                  <button onClick={() => { onSwitch(null); setOpenSwitch(false) }}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: T.main, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    ← Revenir à {communePrincipale?.nom}
                  </button>
                </div>
              )}
              <div style={{ padding: '8px 14px 6px', borderBottom: `1px solid ${T.hairline}` }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.7px', margin: 0 }}>
                  Voir le Morning de
                </p>
              </div>
              {communes.map(c => {
                const isCurrent = c.id === communeAffichee?.id
                const isPrincipale = c.id === communePrincipale?.id
                return (
                  <button key={c.id}
                    onClick={() => { if (!isCurrent) onSwitch(c); setOpenSwitch(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: 'none', borderBottom: `1px solid ${T.hairline}`, background: isCurrent ? T.bgPage : '#fff', cursor: isCurrent ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <IconLocation size={12} color={isCurrent ? T.main : T.deep}/>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.ink }}>{c.nom}</span>
                    {isPrincipale && (
                      <span style={{ fontSize: 9, fontWeight: 800, color: T.main, background: T.pale, padding: '2px 7px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Principale
                      </span>
                    )}
                    {isCurrent && !isPrincipale && (
                      <span style={{ fontSize: 9, fontWeight: 800, color: T.mid, fontStyle: 'italic' }}>
                        en cours
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Tabs({ tab, setTab, dealsCount, actusCount }) {
  const tabBase = {
    padding: '13px 0', marginRight: 24,
    fontSize: 12, fontWeight: 700, letterSpacing: '0.3px',
    cursor: 'pointer', border: 'none', background: 'none', outline: 'none',
    borderBottom: '2px solid transparent', transition: 'all 0.2s ease',
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: '"DM Sans", sans-serif',
  }
  const pillBase = {
    fontSize: 9, fontWeight: 700,
    padding: '1px 6px', borderRadius: 10,
  }
  return (
    <div style={{ display: 'flex', gap: 0, padding: '0 24px', borderBottom: `1px solid ${T.hairline}` }}>
      <button onClick={() => setTab('deals')}
        style={{ ...tabBase, color: tab === 'deals' ? T.ink : T.main, borderBottomColor: tab === 'deals' ? T.ink : 'transparent' }}>
        <IconFire size={13} color="currentColor"/> Deals
        <span style={{ ...pillBase, background: tab === 'deals' ? T.ink : T.pale, color: tab === 'deals' ? '#fff' : T.deep }}>
          {dealsCount}
        </span>
      </button>
      <button onClick={() => setTab('actus')}
        style={{ ...tabBase, color: tab === 'actus' ? T.ink : T.main, borderBottomColor: tab === 'actus' ? T.ink : 'transparent' }}>
        <IconNews size={13} color="currentColor"/> Actus
        <span style={{ ...pillBase, background: tab === 'actus' ? T.ink : T.pale, color: tab === 'actus' ? '#fff' : T.deep }}>
          {actusCount}
        </span>
      </button>
    </div>
  )
}

function DealCard({ d, shown, delay }) {
  const hasStock = typeof d.stock === 'number' && d.stock > 0
  const isUrgent = hasStock && d.stock <= 5
  return (
    <div className="gmy-anim" style={{ opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)', transitionDelay: `${delay}ms` }}>
      <div className="gmy-card-hover" style={{ border: `1px solid ${T.hairline}`, borderRadius: 16, padding: '14px 16px', cursor: 'pointer', background: '#fff', transition: 'all 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: T.bgPage, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            {d.type}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.deep, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 2 }}>
              {d.commerce}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, lineHeight: 1.3 }}>
              {d.deal}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {d.prix && <div style={{ fontSize: 20, fontWeight: 800, color: T.ink }}>{d.prix}</div>}
          {d.prixNormal && <div style={{ fontSize: 12, color: T.mid, textDecoration: 'line-through' }}>{d.prixNormal}</div>}
          {hasStock && (
            <div style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: isUrgent ? T.urgentBg : T.pale, color: isUrgent ? T.urgentFg : T.deep }}>
              {isUrgent ? '⚡ ' : ''}{d.stock} restants
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActuCard({ d, shown, delay }) {
  // Une alerte = bordure + accents rouges + badge ALERTE en tête
  const isAlerte = d.alerte
  return (
    <div className="gmy-anim" style={{ opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)', transitionDelay: `${delay}ms` }}>
      <div className="gmy-card-hover" style={{
        border: isAlerte ? '1px solid #FECACA' : `1px solid ${T.hairline}`,
        borderLeft: isAlerte ? '4px solid #DC2626' : `1px solid ${T.hairline}`,
        borderRadius: 16, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s ease',
        background: isAlerte ? '#FEF2F2' : '#fff',
        boxShadow: isAlerte ? '0 4px 16px rgba(220,38,38,0.10)' : 'none',
      }}>
        {/* Badge ALERTE en tête si urgence */}
        {isAlerte && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px 3px 7px', background: '#DC2626', borderRadius: 100, marginBottom: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'gmyAlertPulse 1.4s ease-in-out infinite' }}/>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.7px', textTransform: 'uppercase' }}>
              Alerte
            </span>
            <style>{`@keyframes gmyAlertPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }`}</style>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: isAlerte ? '#FEE2E2' : T.bgPage, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
            {d.type}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: isAlerte ? '#991B1B' : T.deep, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {d.commerce}
            </div>
            <div style={{ fontSize: 10, color: isAlerte ? '#DC2626' : T.main, fontWeight: isAlerte ? 700 : 400 }}>{d.categorie}</div>
          </div>
        </div>
        <div style={{ height: 1, background: isAlerte ? '#FECACA' : T.hairline, marginBottom: 10 }}/>
        {/* Titre en Playfair Display non-italic (signature morning, élégant) */}
        {d.titre && d.titre !== d.actu && (
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 15, fontWeight: 700, color: isAlerte ? '#7F1D1D' : T.ink, lineHeight: 1.3, marginBottom: 6, letterSpacing: '-0.2px' }}>
            {d.titre}
          </div>
        )}
        {/* Contenu en DM Sans (lisible, infos pratiques) */}
        <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13.5, fontWeight: 500, color: isAlerte ? '#991B1B' : T.deep, lineHeight: 1.55, marginBottom: 10 }}>
          {d.actu}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: isAlerte ? '#DC2626' : T.main, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          Lire <IconArrow size={11} color={isAlerte ? '#DC2626' : T.main}/>
        </div>
      </div>
    </div>
  )
}

function MorningFooter({ tomorrowStr, onExplore }) {
  return (
    <>
      {/* Footer combiné dark : message + icône + CTA */}
      <div style={{ background: T.ink, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(196,160,244,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconCalendar size={18} color={T.light}/>
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
          Rendez-vous <strong style={{ color: '#fff', fontWeight: 700 }}>{tomorrowStr}</strong> à <strong style={{ color: '#fff', fontWeight: 700 }}>07h30</strong> pour de nouveaux deals.
        </div>
        <button onClick={onExplore} className="gmy-cta-hover"
          style={{ fontSize: 11, fontWeight: 700, color: T.ink, background: T.light, padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', transition: 'background 0.2s', letterSpacing: '0.3px', flexShrink: 0, fontFamily: '"DM Sans", sans-serif' }}>
          Explorer
        </button>
      </div>

      {/* Signature "propulsé par yoppaa" */}
      <div style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: T.ink, borderTop: '1px solid rgba(196,160,244,0.1)' }}>
        <span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(196,160,244,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          propulsé par
        </span>
        <span style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '-0.05em' }}>
          <span style={{ color: '#fff' }}>yo</span>
          <span style={{ color: T.light }}>pp</span>
          <span style={{ color: T.mid }}>aa</span>
        </span>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

export default function GoodMorningYoppersPage() {
  const router = useRouter()
  const [tab, setTab] = useState('deals')
  const [shown, setShown] = useState([false, false, false])
  const [visible, setVisible] = useState(false)
  const ctx = getMorningContext()

  // Marque le Good Morning du jour comme "vu" → le badge violet pulse
  // du bouton header disparait jusqu'au lendemain.
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' })  // YYYY-MM-DD
    localStorage.setItem(`yoppaa_gm_seen_${today}`, '1')
  }, [])

  // Communes : principale (du Yopper) + switch temporaire (session) + liste pour le sélecteur
  const [communePrincipale, setCommunePrincipale] = useState(null)
  const [communeSwitch, setCommuneSwitch] = useState(null)
  const [communes, setCommunes] = useState([])
  const communeAffichee = communeSwitch || communePrincipale

  // Données réelles (deals + actus) chargées depuis Supabase selon la commune affichée
  const [realDeals, setRealDeals] = useState([])
  const [realActus, setRealActus] = useState([])
  const [loadingData, setLoadingData] = useState(true)

  // Charge la liste des communes + la commune principale du Yopper
  useEffect(() => {
    let annule = false

    async function init() {
      // 1) Toutes les communes actives
      const { data: allCommunes } = await supabase
        .from('communes')
        .select('id, nom, codes_postaux, province')
        .eq('active', true)
        .order('nom')
      if (annule) return
      setCommunes(allCommunes || [])

      // 2) Commune principale du Yopper si connecté ; sinon fallback Mettet
      const clientId = typeof window !== 'undefined' ? localStorage.getItem('yoppaa_client_id') : null
      let principale = null
      if (clientId) {
        const { data } = await supabase
          .from('clients')
          .select('commune:communes(id, nom, codes_postaux, province)')
          .eq('id', clientId)
          .maybeSingle()
        if (data?.commune) principale = data.commune
      }
      if (!principale && allCommunes?.length > 0) {
        principale = allCommunes.find(c => c.nom === 'Mettet') || allCommunes[0]
      }
      if (!annule && principale) setCommunePrincipale(principale)

      // 3) Restaure un switch session éventuel
      if (typeof window !== 'undefined') {
        try {
          const raw = sessionStorage.getItem('morning_commune_switch')
          if (raw && !annule) setCommuneSwitch(JSON.parse(raw))
        } catch {}
      }
    }

    init()
    return () => { annule = true }
  }, [])

  function onSwitchCommune(c) {
    // c = null → revient à la commune principale ; sinon switch temporaire stocké en session
    if (!c) {
      setCommuneSwitch(null)
      sessionStorage.removeItem('morning_commune_switch')
    } else {
      setCommuneSwitch(c)
      sessionStorage.setItem('morning_commune_switch', JSON.stringify(c))
    }
  }

  // Refetch deals/actus à chaque changement de commune affichée
  useEffect(() => {
    let annule = false
    if (!communeAffichee) {
      // Commune pas encore chargée — on attend
      return
    }
    setLoadingData(true)
    fetchMorningData(communeAffichee).then(({ deals, actus }) => {
      if (annule) return
      setRealDeals(deals)
      setRealActus(actus)
      setLoadingData(false)
    })
    return () => { annule = true }
  }, [communeAffichee?.id])

  // Items affichés selon l'onglet (deals ou actus) — source de la cascade animation
  const itemsAffiches = tab === 'deals' ? realDeals : realActus

  // Animation entrée de la card (1 fois)
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t1)
  }, [])

  // Animation cascade : se redéclenche quand on switch d'onglet OU quand les data changent
  useEffect(() => {
    setShown(Array(itemsAffiches.length).fill(false))
    const timers = itemsAffiches.map((_, i) =>
      setTimeout(() => setShown(p => { const n = [...p]; n[i] = true; return n }), 60 + i * 120)
    )
    return () => timers.forEach(clearTimeout)
  }, [tab, itemsAffiches.length])

  // Marque le morning comme vu aujourd'hui (logique "1 fois/jour")
  useEffect(() => {
    if (typeof window === 'undefined') return
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem('morning_last_shown', today)
  }, [])

  function onExplore() {
    router.push('/commander')
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700;0,800;1,400&family=Playfair+Display:ital@1&display=swap" rel="stylesheet"/>

      {/* CSS local : hover des cards (pseudo-classes nécessitent du CSS, pas du inline) */}
      <style>{`
        .gmy-card-hover:hover {
          border-color: ${T.main} !important;
          box-shadow: 0 4px 16px rgba(107,53,196,0.08);
          transform: translateY(-1px);
        }
        .gmy-cta-hover:hover { background: ${T.pale} !important; }
      `}</style>

      <div style={{
        width: '100%', maxWidth: 400, background: T.bgCard,
        borderRadius: 24, overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(26,8,64,0.06), 0 12px 40px rgba(26,8,64,0.1)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <MorningHeader
          ctx={ctx}
          communeAffichee={communeAffichee}
          communePrincipale={communePrincipale}
          communes={communes}
          onSwitch={onSwitchCommune}
        />
        <Tabs tab={tab} setTab={setTab} dealsCount={realDeals.length} actusCount={realActus.length}/>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 120 }}>
          {loadingData && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0', color: T.muted, fontSize: 13, fontWeight: 600 }}>
              Chargement…
            </div>
          )}

          {!loadingData && itemsAffiches.length === 0 && (
            <div style={{ padding: '24px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 32, margin: 0, lineHeight: 1 }}>☕</p>
              <p style={{ fontSize: 14, fontWeight: 800, color: T.ink, margin: '12px 0 4px', letterSpacing: '-0.2px' }}>
                Pas de {tab === 'deals' ? 'deals' : 'actus'} à {communeAffichee?.nom || 'cet endroit'} ce matin
              </p>
              <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.5 }}>
                Rendez-vous demain à 07h30 — ou switche de commune pour voir ailleurs.
              </p>
            </div>
          )}

          {!loadingData && tab === 'deals' && realDeals.map((d, i) => (
            <DealCard key={d.id} d={d} shown={shown[i]} delay={i * 55}/>
          ))}
          {!loadingData && tab === 'actus' && realActus.map((d, i) => (
            <ActuCard key={d.id} d={d} shown={shown[i]} delay={i * 55}/>
          ))}
        </div>

        <MorningFooter tomorrowStr={ctx.tomorrowStr} onExplore={onExplore}/>
      </div>
    </div>
  )
}
