'use client'
// ─────────────────────────────────────────────────────────────────────────────
// /commander/rdv/[slug] — Fiche commerçant VITRINE avec prise de RDV native
//
// Distinct de :
//   • /commander/[slug]         → commerçant ALIMENTAIRE (Click & Collect)
//   • /commander/services/[slug] → service PUBLIC (commune, police, etc.)
//
// Étapes (state `etape`) :
//   1 = fiche + sélection prestation       (RDV-4a)
//   2 = sélection date + créneau           (RDV-4b)
//   3 = coordonnées + RGPD                 (RDV-4c)
//   4 = confirmation écran "RDV pris ! 🟣" (RDV-4d)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isVitrine } from '@/lib/plans'

const T = {
  bg:       '#F8F6FF',
  bgCard:   '#FFFFFF',
  bgPanel:  '#160636',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',
  pale:     '#EDE0FF',
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  muted:    '#6B7280',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
function jourActuel() { return JOURS[new Date().getDay()] }
function formatDuree(min) {
  if (!min) return ''
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`
}
function formatPrix(prestation) {
  const { prix, prix_min, prix_max } = prestation
  if (prix != null) return `${Number(prix).toFixed(2)} €`
  if (prix_min != null && prix_max != null) return `${Number(prix_min).toFixed(0)} – ${Number(prix_max).toFixed(0)} €`
  if (prix_min != null) return `dès ${Number(prix_min).toFixed(2)} €`
  return 'Sur demande'
}

// ─── Helpers calcul slots ────────────────────────────────────────────────────
const JOURS_LONGS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
const JOURS_COURTS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
const MOIS_COURTS = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc']

function timeToMinutes(t) {
  // "09:30" ou "09:30:00" → 570
  if (!t) return 0
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function jourSemaineDate(d) {
  return JOURS[d.getDay()]
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isToday(d) {
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

// Calcule les slots libres pour une date donnée, durée prestation, créneaux du commerçant
// et réservations existantes (statuts confirme + honore).
// Retourne un array de strings "HH:MM" triés.
function genererSlotsLibres({ dateChoisie, dureeMinutes, creneaux, reservations }) {
  if (!dateChoisie || !dureeMinutes || !creneaux?.length) return []
  const dateStr = isoDate(dateChoisie)
  const jour    = jourSemaineDate(dateChoisie)
  const nowMin  = isToday(dateChoisie) ? new Date().getHours() * 60 + new Date().getMinutes() : -1

  // Filtre creneaux : ceux qui matchent ce jour-là (par jour_semaine récurrent ou par date_specifique ponctuelle)
  const creneauxJour = creneaux.filter(c =>
    c.actif !== false
    && (c.date_specifique === dateStr || (!c.date_specifique && c.jour_semaine === jour))
  )
  if (creneauxJour.length === 0) return []

  // Map des plages réservées (en minutes depuis minuit) pour overlap check
  const plagesReservees = (reservations || []).map(r => ({
    start: timeToMinutes(r.heure_debut),
    end:   timeToMinutes(r.heure_fin),
  }))

  const slotsLibres = new Set()
  for (const cr of creneauxJour) {
    const debut      = timeToMinutes(cr.heure_debut)
    const fin        = timeToMinutes(cr.heure_fin)
    const pauseDebut = cr.pause_debut ? timeToMinutes(cr.pause_debut) : null
    const pauseFin   = cr.pause_fin   ? timeToMinutes(cr.pause_fin)   : null
    const pas        = cr.pas_minutes || 15

    for (let t = debut; t + dureeMinutes <= fin; t += pas) {
      const slotEnd = t + dureeMinutes
      // Si aujourd'hui, exclure les créneaux passés
      if (nowMin >= 0 && t <= nowMin) continue
      // Exclure si chevauche la pause
      if (pauseDebut != null && pauseFin != null && t < pauseFin && slotEnd > pauseDebut) continue
      // Exclure si overlap avec une réservation existante
      const collision = plagesReservees.some(p => t < p.end && slotEnd > p.start)
      if (collision) continue
      slotsLibres.add(minutesToTime(t))
    }
  }
  return [...slotsLibres].sort()
}

// Génère N jours à partir d'aujourd'hui, en marquant lesquels sont ouverts (au moins 1 créneau).
function genererJoursDispos({ nbJours, horairesDetail, creneaux }) {
  const out = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (let i = 0; i < nbJours; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    const jour = jourSemaineDate(d)
    const horaireJour = horairesDetail?.[jour]
    const aCreneau = (creneaux || []).some(c =>
      c.actif !== false
      && (c.date_specifique === isoDate(d) || (!c.date_specifique && c.jour_semaine === jour))
    )
    out.push({
      date: d,
      iso: isoDate(d),
      jour,
      ouvert: !!(horaireJour?.ouvert && aCreneau),
      isToday: i === 0,
    })
  }
  return out
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function CommanderRdvSlug() {
  const { slug } = useParams()
  const router = useRouter()

  const [commercant, setCommercant] = useState(null)
  const [prestations, setPrestations] = useState([])
  const [creneauxConfig, setCreneauxConfig] = useState([])  // les rdv_creneaux du commerçant
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState(null)

  // État du flow (4 étapes)
  const [etape, setEtape] = useState(1)
  const [prestationChoisie, setPrestationChoisie] = useState(null)
  const [dateChoisie, setDateChoisie] = useState(null)        // Date object
  const [heureChoisie, setHeureChoisie] = useState(null)      // "HH:MM"
  const [slotsLibres, setSlotsLibres] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  // RDV-4c : coordonnées client (à venir)
  // RDV-4d : derniereRdv pour écran confirmation (à venir)

  const scrollRef = useRef(null)

  // ─── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return
    let annule = false
    ;(async () => {
      setLoading(true)
      setErreur(null)
      // 1. Fetch le commerçant via son slug (doit être vitrine + publié + rdv_actif)
      const { data: c, error: errC } = await supabase
        .from('commercants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (annule) return
      if (errC || !c) {
        setErreur('Ce commerçant n\'existe pas ou n\'est plus disponible.')
        setLoading(false)
        return
      }
      // Garde-fous métier : doit être vitrine + publié
      if (!isVitrine(c)) {
        // C'est un alimentaire → rediriger vers la bonne route
        router.replace(`/commander/${slug}`)
        return
      }
      if (c.statut_publication !== 'publie') {
        setCommercant({ ...c, _nonPublie: true })
        setLoading(false)
        return
      }
      if (!c.rdv_actif) {
        // Vitrine publiée mais module RDV pas activé : on affiche quand même la fiche en mode lecture
        setCommercant({ ...c, _rdvDesactive: true })
        setPrestations([])
        setLoading(false)
        return
      }
      setCommercant(c)

      // 2. Fetch prestations + créneaux config en parallèle
      const [{ data: prest }, { data: cren }] = await Promise.all([
        supabase
          .from('rdv_prestations')
          .select('*')
          .eq('commercant_id', c.id)
          .eq('actif', true)
          .is('deleted_at', null)
          .order('ordre', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('rdv_creneaux')
          .select('*')
          .eq('commercant_id', c.id)
          .eq('actif', true)
          .is('deleted_at', null),
      ])

      if (annule) return
      setPrestations(prest || [])
      setCreneauxConfig(cren || [])
      setLoading(false)
    })()
    return () => { annule = true }
  }, [slug, router])

  // Fetch slots libres quand la date change (ou la prestation change)
  useEffect(() => {
    if (etape !== 2 || !dateChoisie || !prestationChoisie || !commercant) return
    let annule = false
    ;(async () => {
      setSlotsLoading(true)
      // Fetch réservations existantes du jour (statuts confirme + honore uniquement)
      const dateStr = isoDate(dateChoisie)
      const { data: reservations } = await supabase
        .from('rdv_reservations')
        .select('heure_debut, heure_fin, statut')
        .eq('commercant_id', commercant.id)
        .eq('date_rdv', dateStr)
        .in('statut', ['confirme', 'honore'])
        .is('deleted_at', null)
      if (annule) return
      const slots = genererSlotsLibres({
        dateChoisie,
        dureeMinutes: prestationChoisie.duree_minutes,
        creneaux: creneauxConfig,
        reservations: reservations || [],
      })
      setSlotsLibres(slots)
      setSlotsLoading(false)
    })()
    return () => { annule = true }
  }, [etape, dateChoisie, prestationChoisie, commercant, creneauxConfig])

  function choisirPrestation(p) {
    setPrestationChoisie(p)
    setEtape(2)
    setDateChoisie(null)
    setHeureChoisie(null)
    setSlotsLibres([])
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 80)
  }

  // Liste des jours disponibles (14 prochains)
  const joursDispos = commercant && creneauxConfig.length > 0
    ? genererJoursDispos({ nbJours: 14, horairesDetail: commercant.horaires_detail, creneaux: creneauxConfig })
    : []

  // Auto-sélectionne le premier jour ouvert quand on entre à l'étape 2
  useEffect(() => {
    if (etape === 2 && !dateChoisie && joursDispos.length > 0) {
      const premierOuvert = joursDispos.find(j => j.ouvert)
      if (premierOuvert) setDateChoisie(premierOuvert.date)
    }
  }, [etape, joursDispos, dateChoisie])

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow-x: hidden; }
        body { font-family: "DM Sans", sans-serif; background: ${T.bg}; color: ${T.ink}; }
        .page-wrap { display: flex; flex-direction: column; min-height: 100dvh; max-width: 760px; margin: 0 auto; background: ${T.bg}; }
        .scroll-body { flex: 1; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
        .action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 0.4rem 0.75rem; border-radius: 100px; border: 1px solid ${T.pale}; background: #fff; color: ${T.ink}; font-weight: 700; font-size: 0.74rem; cursor: pointer; transition: all 0.15s; line-height: 1.1; }
        .action-btn:hover { border-color: ${T.main}; color: ${T.main}; background: ${T.pale}; }
        .prest-card { transition: all 0.15s; }
        .prest-card:hover { border-color: ${T.main}; transform: translateY(-1px); box-shadow: 0 6px 24px rgba(107,53,196,0.12); }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .fiche-hero { height: 220px; }
        @media (min-width: 600px) { .fiche-hero { height: 280px; } }
        .day-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="page-wrap">

        {/* ── TOPBAR (bande 3px canonique + retour + step indicator) ── */}
        <div style={{ background: T.bgPanel, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderBottom: `1px solid ${T.main}33`, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
          <button onClick={() => router.push('/commander')}
            aria-label="Retour"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', borderRadius: 10, padding: '0.45rem 0.7rem 0.45rem 0.6rem', fontWeight: 700, fontSize: '0.82rem', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Retour
          </button>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            {commercant && (
              <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#fff', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', opacity: 0.9 }}>
                {commercant.nom}
              </span>
            )}
          </div>

          {/* Step indicator : 3 étapes (Prestation / Créneau / Coordonnées). Étape 4 = écran final, pas de pill */}
          {etape < 4 && commercant && !commercant._nonPublie && !commercant._rdvDesactive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {[{ n: 1, label: 'Service' }, { n: 2, label: 'Créneau' }, { n: 3, label: 'Coords' }].map((s, i) => {
                const done = etape > s.n
                const active = etape === s.n
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: active ? T.main : done ? '#10B98122' : 'rgba(255,255,255,0.08)', border: `1.5px solid ${active ? T.light : done ? '#10B981' : 'rgba(255,255,255,0.15)'}`, borderRadius: 100, padding: '3px 10px', transition: 'all 0.3s', boxShadow: active ? `0 4px 12px ${T.main}44` : 'none' }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: active ? '#fff' : done ? '#10B981' : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 900, color: active ? T.main : '#fff', flexShrink: 0 }}>
                        {done ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg> : s.n}
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: active ? '#fff' : done ? '#10B981' : 'rgba(255,255,255,0.5)' }}>{s.label}</span>
                    </div>
                    {i < 2 && <div style={{ width: 8, height: 1.5, background: etape > s.n ? '#10B981' : 'rgba(255,255,255,0.15)' }}/>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── BODY ── */}
        <div className="scroll-body" ref={scrollRef}>

          {loading && (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: T.muted }}>Chargement…</div>
          )}

          {!loading && erreur && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
              <div style={{ background: '#fff', borderRadius: 20, padding: '2rem', maxWidth: 380, textAlign: 'center', border: `1px solid ${T.pale}`, boxShadow: `0 12px 32px ${T.main}14` }}>
                <p style={{ fontWeight: 900, color: T.ink, fontSize: '1.1rem', marginBottom: 8 }}>Oups</p>
                <p style={{ color: T.muted, fontSize: '0.9rem', lineHeight: 1.55, marginBottom: 18 }}>{erreur}</p>
                <button onClick={() => router.push('/commander')}
                  style={{ padding: '10px 22px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                  Voir les autres commerces →
                </button>
              </div>
            </div>
          )}

          {!loading && commercant?._nonPublie && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
              <p style={{ fontWeight: 900, fontSize: '1.1rem', color: T.ink, marginBottom: 8 }}>Fiche en cours de validation</p>
              <p style={{ fontSize: '0.9rem', color: T.muted, lineHeight: 1.55, marginBottom: 18 }}>
                <strong style={{ color: T.bgPanel }}>{commercant.nom}</strong> finalise son inscription Yoppaa. La fiche sera disponible dès validation par notre équipe.
              </p>
              <button onClick={() => router.push('/commander')}
                style={{ padding: '10px 22px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                Voir les autres commerces →
              </button>
            </div>
          )}

          {!loading && commercant && !commercant._nonPublie && (
            <>
              {/* ─── HERO PHOTO ─── */}
              <div className="fiche-hero" style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 3 }}/>
                {commercant.photo_couverture_url
                  ? <img src={commercant.photo_couverture_url} alt={commercant.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                  : (
                    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 40%, ${T.main} 100%)` }}>
                      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 80% 20%, ${T.mid}55 0%, transparent 60%), radial-gradient(circle at 20% 80%, ${T.light}22 0%, transparent 50%)` }}/>
                    </div>
                  )
                }
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, background: 'linear-gradient(to top, rgba(22,6,54,0.5), transparent)' }}/>
              </div>

              {/* ─── CARD INFOS COMMERÇANT (chevauche le hero photo) ─── */}
              <div style={{ background: '#fff', margin: '-36px 12px 0', borderRadius: 22, padding: '1.125rem 1.25rem 1rem', boxShadow: `0 12px 36px rgba(22,6,54,0.18), 0 2px 8px ${T.main}22`, border: `1px solid ${T.pale}`, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: commercant.logo_url ? '#fff' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, border: '3px solid #fff', boxShadow: '0 6px 20px rgba(22,6,54,0.22)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: -28 }}>
                    {commercant.logo_url
                      ? <img src={commercant.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                      : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2l2 4h8l2-4"/><path d="M6 22l-2-9h16l-2 9"/><path d="M9 12v4M15 12v4M12 12v4"/></svg>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {commercant.type && (
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, color: T.main, background: T.pale, padding: '3px 9px', borderRadius: 100, display: 'inline-block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {commercant.type}
                      </span>
                    )}
                    <h1 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.ink, letterSpacing: '-0.5px', lineHeight: 1.1, margin: 0 }}>
                      {commercant.nom}
                    </h1>
                  </div>
                </div>

                {/* Horaire today (dot vert si ouvert, gris si fermé) */}
                {commercant.horaires_detail && (() => {
                  const j = jourActuel()
                  const h = commercant.horaires_detail[j]
                  if (!h) return null
                  return (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: h.ouvert ? '#F0FDF4' : '#FEF2F2', borderRadius: 100, padding: '3px 9px', border: `1px solid ${h.ouvert ? '#10B98133' : '#DC262633'}`, marginTop: 10 }}>
                      <span style={{ width: h.ouvert ? 9 : 7, height: h.ouvert ? 9 : 7, borderRadius: '50%', background: h.ouvert ? '#10B981' : '#DC2626', flexShrink: 0 }}/>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: h.ouvert ? '#10B981' : '#DC2626' }}>
                        {h.ouvert ? `Ouvert · ${h.debut.slice(0,5)}–${h.fin.slice(0,5)}` : 'Fermé aujourd\'hui'}
                      </span>
                    </div>
                  )
                })()}

                {commercant.description && (
                  <p style={{ fontSize: '0.85rem', color: T.deep, lineHeight: 1.55, margin: '12px 0 0' }}>{commercant.description}</p>
                )}

                {/* Actions (adresse + appeler, alignées sur le pattern fiche commerce) */}
                <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center', flexWrap: 'nowrap' }}>
                  {commercant.adresse && (
                    <button className="action-btn" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(commercant.adresse)}`, '_blank')}
                      style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}
                      aria-label={`Ouvrir ${commercant.adresse} dans Maps`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{commercant.adresse}</span>
                    </button>
                  )}
                  {commercant.telephone && (
                    <a href={`tel:${commercant.telephone}`} className="action-btn"
                      style={{ flexShrink: 0, background: '#F0FDF4', borderColor: '#10B98133', color: '#10B981', textDecoration: 'none' }}
                      aria-label="Appeler">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                      <span>Appeler</span>
                    </a>
                  )}
                </div>
              </div>

              {/* ─── BANDEAU RDV DÉSACTIVÉ (vitrine publiée mais module RDV pas activé) ─── */}
              {commercant._rdvDesactive && (
                <div style={{ margin: '18px 12px 0', background: T.pale, border: `1px solid ${T.main}22`, borderRadius: 16, padding: '1rem 1.125rem', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                    <rect x="3" y="5" width="18" height="16" rx="2"/>
                    <path d="M3 9h18M8 3v4M16 3v4"/>
                  </svg>
                  <div>
                    <p style={{ fontWeight: 800, color: T.ink, fontSize: '0.9rem', marginBottom: 4 }}>Prise de RDV en ligne pas encore activée</p>
                    <p style={{ fontSize: '0.78rem', color: T.deep, lineHeight: 1.5 }}>
                      <strong>{commercant.nom}</strong> n'a pas encore activé la prise de RDV en ligne sur Yoppaa. Contacte-le directement par téléphone pour réserver.
                    </p>
                  </div>
                </div>
              )}

              {/* ─── ÉTAPE 1 — LISTE PRESTATIONS ─── */}
              {!commercant._rdvDesactive && etape === 1 && (
                <div style={{ padding: '1.5rem 1rem 2rem', animation: 'fadeUp 0.4s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l1.9 5.8H20l-5 3.6L17 18l-5-3.6L7 18l2-5.6-5-3.6h6.1L12 3z"/>
                      </svg>
                      Choisis ta prestation
                    </span>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                    {prestations.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{prestations.length} dispo</span>
                    )}
                  </div>

                  {prestations.length === 0 ? (
                    <div style={{ background: '#fff', border: `1px dashed ${T.pale}`, borderRadius: 14, padding: '2rem 1rem', textAlign: 'center' }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: T.ink, marginBottom: 6 }}>Aucune prestation disponible pour le moment</p>
                      <p style={{ fontSize: '0.78rem', color: T.muted, lineHeight: 1.5 }}>
                        Le commerçant n'a pas encore renseigné ses prestations. Contacte-le directement pour réserver.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {prestations.map(p => (
                        <button key={p.id} className="prest-card" onClick={() => choisirPrestation(p)}
                          style={{ width: '100%', textAlign: 'left', background: '#fff', borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${T.pale}`, boxShadow: '0 1px 4px rgba(107,53,196,0.04)', cursor: 'pointer', padding: 0, fontFamily: '"DM Sans", sans-serif' }}>
                          {/* Bande 3px canonique en haut de chaque card prestation */}
                          <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                          <div style={{ padding: '0.875rem 1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
                              <p style={{ fontWeight: 800, color: T.ink, fontSize: '1rem', letterSpacing: '-0.2px', lineHeight: 1.2, margin: 0, flex: 1, minWidth: 0 }}>
                                {p.nom}
                              </p>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 800, color: T.muted, background: T.pale, padding: '3px 8px', borderRadius: 100, flexShrink: 0 }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"/>
                                  <path d="M12 6v6l4 2"/>
                                </svg>
                                {formatDuree(p.duree_minutes)}
                              </span>
                            </div>
                            {p.description && (
                              <p style={{ fontSize: '0.78rem', color: T.muted, lineHeight: 1.4, margin: '0 0 8px' }}>
                                {p.description}
                              </p>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: '1.05rem', fontWeight: 900, color: T.main, letterSpacing: '-0.3px' }}>{formatPrix(p)}</span>
                                {p.acompte_pourcent > 0 && (
                                  <span style={{ fontSize: '0.62rem', fontWeight: 800, color: T.deep, background: T.pale, padding: '2px 7px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                    Acompte {p.acompte_pourcent}%
                                  </span>
                                )}
                              </div>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, padding: '6px 14px', borderRadius: 100, boxShadow: `0 4px 14px ${T.main}33` }}>
                                Réserver
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                                </svg>
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─── ÉTAPE 2 — CALENDRIER + SLOTS CRÉNEAUX ─── */}
              {etape === 2 && prestationChoisie && (
                <div style={{ padding: '1.25rem 1rem 2rem', animation: 'fadeUp 0.4s ease' }}>
                  {/* Recap prestation choisie + bouton Changer */}
                  <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${T.pale}`, overflow: 'hidden', marginBottom: 18, boxShadow: '0 1px 4px rgba(107,53,196,0.04)' }}>
                    <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Prestation choisie</p>
                        <p style={{ fontWeight: 800, color: T.ink, fontSize: '0.92rem', letterSpacing: '-0.2px', lineHeight: 1.2, marginBottom: 4 }}>{prestationChoisie.nom}</p>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: T.muted, fontWeight: 700 }}>
                          <span>{formatDuree(prestationChoisie.duree_minutes)}</span>
                          <span style={{ opacity: 0.5 }}>·</span>
                          <span style={{ color: T.main, fontWeight: 800 }}>{formatPrix(prestationChoisie)}</span>
                        </div>
                      </div>
                      <button onClick={() => { setPrestationChoisie(null); setEtape(1); setDateChoisie(null); setHeureChoisie(null) }}
                        style={{ background: '#fff', border: `1.5px solid ${T.main}`, color: T.main, fontWeight: 700, fontSize: '0.72rem', padding: '0.4rem 0.875rem', borderRadius: 100, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
                        Changer
                      </button>
                    </div>
                  </div>

                  {/* Section : choix du jour */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="5" width="18" height="16" rx="2"/>
                        <path d="M3 9h18M8 3v4M16 3v4"/>
                      </svg>
                      Je viens le
                    </span>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                  </div>

                  {/* Day picker horizontal scrollable */}
                  <div className="day-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 18, scrollbarWidth: 'none' }}>
                    {joursDispos.map(j => {
                      const choisi = dateChoisie && isoDate(dateChoisie) === j.iso
                      return (
                        <button key={j.iso} onClick={() => { if (j.ouvert) { setDateChoisie(j.date); setHeureChoisie(null) } }} disabled={!j.ouvert}
                          style={{
                            flexShrink: 0, minWidth: 64,
                            padding: '0.5rem 0.75rem', borderRadius: 12,
                            border: `1.5px solid ${j.ouvert ? (choisi ? T.main : T.pale) : '#E5E7EB'}`,
                            background: !j.ouvert ? '#F9FAFB' : (choisi ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff'),
                            color: !j.ouvert ? '#D1D5DB' : (choisi ? '#fff' : T.ink),
                            cursor: j.ouvert ? 'pointer' : 'not-allowed',
                            textAlign: 'center', fontFamily: '"DM Sans", sans-serif',
                            transition: 'all 0.15s',
                            boxShadow: choisi ? `0 8px 22px ${T.main}55` : 'none',
                            position: 'relative',
                          }}>
                          {j.isToday && (
                            <span style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.45rem', fontWeight: 900, color: choisi ? T.main : T.muted, background: choisi ? '#fff' : T.pale, padding: '1px 4px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Auj</span>
                          )}
                          <div style={{ fontSize: '0.62rem', fontWeight: 700, opacity: 0.8, marginBottom: 2 }}>
                            {JOURS_COURTS[j.date.getDay()]}
                          </div>
                          <div style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1 }}>
                            {j.date.getDate()}
                          </div>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, opacity: 0.7, marginTop: 2 }}>
                            {MOIS_COURTS[j.date.getMonth()]}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Section : choix du créneau */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                      </svg>
                      À quelle heure
                    </span>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                    {dateChoisie && !slotsLoading && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>
                        {slotsLibres.length} {slotsLibres.length > 1 ? 'créneaux libres' : slotsLibres.length === 1 ? 'créneau libre' : 'plus de créneau'}
                      </span>
                    )}
                  </div>

                  {!dateChoisie && (
                    <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: T.muted, fontSize: '0.85rem' }}>
                      Choisis d'abord un jour ci-dessus ↑
                    </div>
                  )}

                  {dateChoisie && slotsLoading && (
                    <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: T.muted, fontSize: '0.85rem' }}>
                      Chargement des créneaux…
                    </div>
                  )}

                  {dateChoisie && !slotsLoading && slotsLibres.length === 0 && (
                    <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.5 }}>
                        Aucun créneau libre ce jour-là. Essaie un autre jour ↑
                      </p>
                    </div>
                  )}

                  {dateChoisie && !slotsLoading && slotsLibres.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6, marginBottom: 18 }}>
                      {slotsLibres.map(slot => {
                        const choisi = heureChoisie === slot
                        return (
                          <button key={slot} onClick={() => setHeureChoisie(slot)}
                            style={{
                              padding: '0.55rem 0.5rem', borderRadius: 10,
                              border: `1.5px solid ${choisi ? T.main : T.pale}`,
                              background: choisi ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff',
                              color: choisi ? '#fff' : T.ink,
                              fontWeight: 800, fontSize: '0.85rem',
                              cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                              transition: 'all 0.15s', letterSpacing: '-0.2px',
                              boxShadow: choisi ? `0 6px 18px ${T.main}55` : 'none',
                              position: 'relative',
                            }}
                            onMouseOver={e => { if (!choisi) { e.currentTarget.style.borderColor = T.main + '88'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
                            onMouseOut={e => { if (!choisi) { e.currentTarget.style.borderColor = T.pale; e.currentTarget.style.transform = 'translateY(0)' } }}>
                            {choisi && (
                              <span style={{ position: 'absolute', top: 3, right: 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                              </span>
                            )}
                            {slot}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Bouton Continuer */}
                  {heureChoisie && (
                    <button onClick={() => setEtape(3)}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '1rem', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 6px 24px ${T.main}55`, animation: 'fadeUp 0.3s ease' }}>
                      Continuer — {JOURS_LONGS[dateChoisie.getDay()]} {dateChoisie.getDate()} {MOIS_COURTS[dateChoisie.getMonth()]} à {heureChoisie}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* ─── ÉTAPE 3 — placeholder, sera implémenté en RDV-4c ─── */}
              {etape === 3 && prestationChoisie && dateChoisie && heureChoisie && (
                <div style={{ padding: '1.5rem 1rem 2rem', textAlign: 'center', color: T.muted }}>
                  <p style={{ fontWeight: 800, color: T.ink, marginBottom: 8 }}>Étape 3 — Coordonnées (à venir en RDV-4c)</p>
                  <p style={{ fontSize: '0.85rem', marginBottom: 6 }}>Prestation : <strong style={{ color: T.main }}>{prestationChoisie.nom}</strong></p>
                  <p style={{ fontSize: '0.85rem', marginBottom: 16 }}>RDV : <strong style={{ color: T.main }}>{JOURS_LONGS[dateChoisie.getDay()]} {dateChoisie.getDate()} {MOIS_COURTS[dateChoisie.getMonth()]} à {heureChoisie}</strong></p>
                  <button onClick={() => setEtape(2)}
                    style={{ padding: '10px 22px', borderRadius: 100, border: `1.5px solid ${T.main}`, background: '#fff', color: T.main, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    ← Modifier le créneau
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
