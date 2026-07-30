'use client'
// ─────────────────────────────────────────────────────────────────────────────
// /commander/rdv/[slug] - Fiche commerçant VITRINE avec prise de RDV native
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
import { isVitrine, canDo } from '@/lib/plans'
import { redirectTop } from '@/lib/redirect-top'
import { promptPushOneSignal } from '@/app/components/OneSignalInit'
import HorairesSection from '../../HorairesSection'
import CarteFideliteFiche from '../../CarteFideliteFiche'
// Icônes Lucide React (charte Yoppaa, pas d'emoji décoratif)
import { Lock, Flame, Star, Phone, Calendar } from 'lucide-react'

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
const MOIS_LONGS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

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

// Bug 6.1 : filtre les reservations "busy" avant de generer les slots, selon le
// praticien choisi et la logique Yoppaa multi-praticiens :
//
//   - Praticien X specifique choisi : seules les reservations de X et celles sans
//     praticien assigne (rdvs legacy pre-multi-prat, ou pris en "Sans preference")
//     bloquent les slots. Les rdvs des autres praticiens n'ont aucun impact sur X.
//
//   - "Sans preference" (praticienChoisi null) : un slot est bloque UNIQUEMENT si
//     TOUS les praticiens eligibles a cette prestation sont occupes a cette heure.
//     Si au moins un praticien eligible est libre, le slot reste dispo (il lui sera
//     assigne). Pattern aligne sur Treatwell/Planity/Fresha. Les RDV avec praticien_id
//     null (legacy) bloquent tout par safety (on ne peut pas savoir qui les fait).
//
// Retourne un tableau { heure_debut, heure_fin } pour genererSlots.
function filtrerReservationsPourSlots(reservations, praticienChoisi, praticiensEligibles) {
  const list = reservations || []
  if (praticienChoisi) {
    return list.filter(r => r.praticien_id === praticienChoisi.id || r.praticien_id === null)
  }
  // Sans preference : grouper par intervalle (heure_debut, heure_fin) et compter les
  // praticiens eligibles uniques qui occupent chaque slot. Bloque si TOUS pris.
  const eligibleIds = new Set((praticiensEligibles || []).map(p => p.id))
  const nbEligibles = eligibleIds.size
  if (nbEligibles === 0) return list  // aucun praticien configure : safe fallback
  const slotMap = new Map()  // key "HH:MM:SS-HH:MM:SS" -> { praticiens: Set, hasNull: bool }
  list.forEach(r => {
    const key = `${r.heure_debut}-${r.heure_fin}`
    if (!slotMap.has(key)) slotMap.set(key, { praticiens: new Set(), hasNull: false })
    const entry = slotMap.get(key)
    if (!r.praticien_id) entry.hasNull = true
    else if (eligibleIds.has(r.praticien_id)) entry.praticiens.add(r.praticien_id)
    // rdvs des praticiens non eligibles a cette prestation : ignores (ils n'occupent
    // pas les praticiens qui pourraient faire cette prestation)
  })
  const bloquants = []
  slotMap.forEach((entry, key) => {
    if (entry.hasNull || entry.praticiens.size >= nbEligibles) {
      const [heure_debut, heure_fin] = key.split('-')
      bloquants.push({ heure_debut, heure_fin })
    }
  })
  return bloquants
}

// Calcule les slots pour une date donnée, durée prestation, créneaux du commerçant,
// horaires d'ouverture du shop, et reservations existantes.
//
// Triple filtre applique :
//   1. rdv_creneaux (heure_debut..heure_fin, pause_debut..pause_fin, pas_minutes, actif)
//   2. horaires_detail du shop ce jour-la (clip a l'heure d'ouverture/fermeture reelle).
//      Sans ce 2eme filtre, un merchant qui aurait mis rdv_creneaux 9h-23h mais shop
//      ferme a 19h proposerait des RDV jusqu'a 23h -> bug. Defense en profondeur.
//   3. Slot end ne peut pas depasser le min(creneau.fin, shop.fin) ni chevaucher pause.
//
// Retourne un array de { heure: "HH:MM", pris: bool, motif: 'reserve'|'incompatible'|null }
//   - pris=false                   : slot cliquable libre
//   - pris=true,  motif='reserve'  : RDV commence pile a cette heure
//   - pris=true,  motif='incompatible' : la duree de la prestation deborderait sur un
//                                        RDV qui suit (slot lui-meme libre mais inutilisable)
function genererSlots({ dateChoisie, dureeMinutes, creneaux, reservations, horairesDetail }) {
  if (!dateChoisie || !dureeMinutes || !creneaux?.length) return []
  const dateStr = isoDate(dateChoisie)
  const jour    = jourSemaineDate(dateChoisie)
  const nowMin  = isToday(dateChoisie) ? new Date().getHours() * 60 + new Date().getMinutes() : -1

  // ── Filtre 2 : horaires shop ce jour-la ────────────────────────────────────
  // Si shop ferme (ouvert:false) => aucun slot (meme si rdv_creneaux dit ouvert).
  // Sinon on memorise les bornes shop pour clipper plus bas.
  const horaireJour = horairesDetail?.[jour]
  if (horaireJour && horaireJour.ouvert === false) {
    console.info('[rdv-slots] shop ferme', { jour })
    return []
  }
  const shopOpen  = horaireJour?.debut ? timeToMinutes(horaireJour.debut) : null
  const shopClose = horaireJour?.fin   ? timeToMinutes(horaireJour.fin)   : null
  // Horaires à pause : le RDV doit tenir ENTIÈREMENT dans une des plages du
  // shop (ex. 11:00-14:00 puis 18:00-22:00 → pas de RDV 13:30-14:30).
  const shopRanges = []
  if (shopOpen !== null && shopClose !== null) shopRanges.push([shopOpen, shopClose])
  if (horaireJour?.debut2 && horaireJour?.fin2) shopRanges.push([timeToMinutes(horaireJour.debut2), timeToMinutes(horaireJour.fin2)])
  const shopCloseMax = shopRanges.length > 0 ? Math.max(...shopRanges.map(r => r[1])) : shopClose

  // ── Filtre 1 : rdv_creneaux applicables ce jour ────────────────────────────
  const creneauxJour = creneaux.filter(c =>
    c.actif !== false
    && (c.date_specifique === dateStr || (!c.date_specifique && c.jour_semaine === jour))
  )
  if (creneauxJour.length === 0) return []

  // ── Reservations existantes (en minutes depuis minuit) ─────────────────────
  const plagesReservees = (reservations || []).map(r => ({
    start: timeToMinutes(r.heure_debut),
    end:   timeToMinutes(r.heure_fin),
  }))
  const startTimes = new Set(plagesReservees.map(p => minutesToTime(p.start)))
  console.info('[rdv-slots] genererSlots', {
    jour, dureeMinutes, nbCreneaux: creneauxJour.length, shopOpen, shopClose,
    nbResas: plagesReservees.length,
    resas: plagesReservees.map(p => `${minutesToTime(p.start)}-${minutesToTime(p.end)}`),
  })

  const slotsMap = new Map()
  for (const cr of creneauxJour) {
    // Clip aux bornes du shop : RDV impossible si le shop est ferme a ce moment.
    let debut = timeToMinutes(cr.heure_debut)
    let fin   = timeToMinutes(cr.heure_fin)
    if (shopOpen     !== null) debut = Math.max(debut, shopOpen)
    if (shopCloseMax !== null) fin   = Math.min(fin,   shopCloseMax)
    if (fin - debut < dureeMinutes) continue  // creneau trop court apres clip

    const pauseDebut = cr.pause_debut ? timeToMinutes(cr.pause_debut) : null
    const pauseFin   = cr.pause_fin   ? timeToMinutes(cr.pause_fin)   : null
    const pas        = cr.pas_minutes || 15

    for (let t = debut; t + dureeMinutes <= fin; t += pas) {
      const slotEnd = t + dureeMinutes
      if (nowMin >= 0 && t <= nowMin) continue  // passe (today)
      // Pause : la prestation chevauche la pause -> skip
      if (pauseDebut != null && pauseFin != null && t < pauseFin && slotEnd > pauseDebut) continue
      // Pause SHOP (horaires_detail debut2/fin2) : le RDV doit tenir dans une plage
      if (shopRanges.length > 1 && !shopRanges.some(([a, b]) => t >= a && slotEnd <= b)) continue
      const heure = minutesToTime(t)
      if (slotsMap.has(heure) && !slotsMap.get(heure).pris) continue
      const overlap = plagesReservees.some(p => t < p.end && slotEnd > p.start)
      const motif = !overlap ? null : (startTimes.has(heure) ? 'reserve' : 'incompatible')
      slotsMap.set(heure, { heure, pris: overlap, motif })
    }
  }
  return [...slotsMap.values()].sort((a, b) => a.heure.localeCompare(b.heure))
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

// ─── Mini-calendrier mensuel (deroulant depuis le picker horizontal de 14 jours) ─
// Affiche les 60 jours regroupes par mois. Cellules cliquables si ouvert, gris si ferme.
// Cellules hors fenetre 60j ou avant aujourd'hui : grisees non cliquables.
// Tap sur un jour ouvert -> onSelect(date) + ferme le mini-cal.
function MiniCalendrier({ jours, dateChoisie, onSelect }) {
  // Group jours by month-year, en ordre chronologique
  const months = []
  const monthsByKey = {}
  jours.forEach(j => {
    const key = `${j.date.getFullYear()}-${j.date.getMonth()}`
    if (!monthsByKey[key]) {
      const m = {
        label: `${MOIS_LONGS[j.date.getMonth()]} ${j.date.getFullYear()}`,
        year: j.date.getFullYear(),
        month: j.date.getMonth(),
        joursMap: {},
      }
      monthsByKey[key] = m
      months.push(m)
    }
    monthsByKey[key].joursMap[j.iso] = j
  })

  const dateChoisieIso = dateChoisie ? isoDate(dateChoisie) : null

  return (
    <div style={{ background: '#fff', border: '1.5px solid #EDE0FF', borderRadius: 14, padding: '0.875rem 0.875rem 0.75rem', marginBottom: 14, animation: 'fadeUp 0.2s ease' }}>
      {months.map(m => {
        const firstDay = new Date(m.year, m.month, 1)
        // Lundi = 0, Dimanche = 6 (convention francaise/europeenne)
        const firstWeekday = (firstDay.getDay() + 6) % 7
        const daysInMonth = new Date(m.year, m.month + 1, 0).getDate()

        const cells = []
        for (let i = 0; i < firstWeekday; i++) cells.push({ empty: true })
        for (let d = 1; d <= daysInMonth; d++) {
          const iso = `${m.year}-${String(m.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          cells.push({ d, iso, j: m.joursMap[iso] })
        }

        return (
          <div key={`${m.year}-${m.month}`} style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#2D0F6B', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0, marginBottom: 8 }}>
              {m.label}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
              {['L','M','M','J','V','S','D'].map((lbl, i) => (
                <div key={i} style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textAlign: 'center', padding: '2px 0' }}>{lbl}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {cells.map((c, i) => {
                if (c.empty) return <div key={i}/>
                // Pas dans la fenetre 60j (avant aujourd'hui ou apres J+60)
                if (!c.j) {
                  return (
                    <div key={i} style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#D1D5DB', fontWeight: 500 }}>
                      {c.d}
                    </div>
                  )
                }
                const choisi = c.iso === dateChoisieIso
                const ouvert = c.j.ouvert
                // Dot d'etat : vert si jour ouvert ET au moins 1 creneau libre, rouge sinon
                // (jour ferme du shop OU complet). Reflete la dispo POUR LA PRESTATION CHOISIE.
                const nbLibres = c.j.nbLibres || 0
                const dotColor = !ouvert ? '#FCA5A5' : (nbLibres > 0 ? '#10B981' : '#FCA5A5')
                return (
                  <button key={i} onClick={() => ouvert && nbLibres > 0 && onSelect(c.j.date)} disabled={!ouvert || nbLibres === 0}
                    title={!ouvert ? 'Fermé' : nbLibres === 0 ? 'Complet' : `${nbLibres} créneau${nbLibres>1?'x':''} libre${nbLibres>1?'s':''}`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 8,
                      border: choisi ? '1.5px solid #6B35C4' : '1px solid transparent',
                      background: choisi ? '#6B35C4' : (ouvert && nbLibres > 0 ? '#fff' : '#F9FAFB'),
                      color: choisi ? '#fff' : (ouvert && nbLibres > 0 ? '#1A0840' : '#D1D5DB'),
                      fontWeight: choisi ? 900 : (ouvert && nbLibres > 0 ? 700 : 500),
                      fontSize: 13, fontFamily: '"DM Sans", sans-serif',
                      cursor: (ouvert && nbLibres > 0) ? 'pointer' : 'not-allowed',
                      padding: 0,
                      transition: 'all 0.12s',
                      position: 'relative',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                    }}>
                    <span style={{ lineHeight: 1 }}>{c.d}</span>
                    {/* Dot d'etat : vert dispo / rouge non dispo. En blanc si la cellule est selectionnee. */}
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: choisi ? '#fff' : dotColor }}/>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function CommanderRdvSlug() {
  const { slug } = useParams()
  const router = useRouter()

  const [commercant, setCommercant] = useState(null)
  const [prestations, setPrestations] = useState([])
  const [creneauxConfig, setCreneauxConfig] = useState([])  // les rdv_creneaux du commerçant
  const [praticiens, setPraticiens] = useState([])          // rdv_praticiens actifs
  const [junctionMap, setJunctionMap] = useState({})        // { prestation_id: [praticien_id, ...] }
  const [fermetures, setFermetures] = useState([])          // Sess 6 : rdv_fermetures futures (date_fin >= today)
  const [deals, setDeals] = useState([])                    // deals actifs du jour (même fenêtre que la fiche commerce)
  const [dealDetailOuvert, setDealDetailOuvert] = useState(null)
  const [maCarteFid, setMaCarteFid] = useState(null)        // ma carte de fidélité chez ce commerçant
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState(null)

  // État du flow (4 étapes)
  const [etape, setEtape] = useState(1)
  const [prestationChoisie, setPrestationChoisie] = useState(null)
  const [praticienChoisi, setPraticienChoisi] = useState(null)  // null = "Sans préférence" (V1 : garde null en base)
  const [dateChoisie, setDateChoisie] = useState(null)        // Date object
  const [heureChoisie, setHeureChoisie] = useState(null)      // "HH:MM"
  const [slots, setSlots] = useState([])  // [{ heure, pris, motif }]
  const [reservationsJour, setReservationsJour] = useState([])  // [{ heure_debut, heure_fin }] pour la section 'Deja pris'
  const [showMiniCal, setShowMiniCal] = useState(false)  // toggle mini-calendrier mensuel pour jours > J+14
  const [reservations60j, setReservations60j] = useState([])  // toutes les resa du commercant sur 60j, pour points dispo mini-cal
  const [slotsLoading, setSlotsLoading] = useState(false)
  // RDV-4c : coordonnées client + RGPD (pré-fill depuis localStorage)
  const [client, setClient] = useState({ prenom: '', nom: '', email: '', telephone: '', notes: '' })
  const [clientId, setClientId] = useState(null)
  const [rgpdCommande, setRgpdCommande] = useState(false)
  const [rgpdMarketing, setRgpdMarketing] = useState(true)  // pré-coché (cf signup data flow)
  // RDV-4d : insert + confirmation
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [rdvCree, setRdvCree] = useState(null)  // contient la ligne rdv_reservations créée + meta affichage

  const scrollRef = useRef(null)

  // Tracking stats deals (même mécanique best-effort que la fiche commerce) :
  // chaque event compte 1x par session client, fire-and-forget non bloquant.
  const dealsVuesRef = useRef(new Set())
  const dealsCtaCliquesRef = useRef(new Set())
  async function trackDeal(dealId, event) {
    if (!dealId) return
    const seen = event === 'view' ? dealsVuesRef.current : dealsCtaCliquesRef.current
    if (seen.has(dealId)) return
    seen.add(dealId)
    try {
      await fetch('/api/deals/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_id: dealId, event }),
      })
    } catch (e) {
      console.warn('[trackDeal] envoi echoue', e?.message)
      seen.delete(dealId)  // retry autorise la prochaine fois
    }
  }
  useEffect(() => {
    if (dealDetailOuvert?.id) trackDeal(dealDetailOuvert.id, 'view')
  }, [dealDetailOuvert?.id])

  // Ma carte de fidélité chez ce commerçant (si son programme est actif)
  useEffect(() => {
    const id = commercant?.id
    if (!id || !commercant?.fidelite_actif) { setMaCarteFid(null); return }
    let vivant = true
    fetch('/api/fidelite/mes-cartes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'une', commercant_id: id }),
    })
      .then(r => r.json())
      .then(j => { if (vivant && j?.ok) setMaCarteFid(j.carte || null) })
      .catch(() => {})
    return () => { vivant = false }
  }, [commercant?.id, commercant?.fidelite_actif])

  // Change d'étape ET remonte en haut du conteneur scrollable (UX fluide).
  // Centralisé pour cohérence sur toutes les transitions du tunnel RDV.
  function allerEtape(n) {
    setEtape(n)
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

  // ─── Retour Stripe Checkout (paiement acompte en ligne) ────────────────────
  // URL params possibles :
  //   ?paiement=ok&session_id=cs_xxx -> paiement reussi, RDV cree par webhook
  //   ?paiement=annule              -> user a annule Stripe Checkout
  // L'etat (presta/date/heure/client) est restaure depuis sessionStorage (sauve
  // avant la redirection Stripe), sinon l'ecran de confirmation crashe.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const paiement = params.get('paiement')
    if (!paiement) return

    const STORAGE_KEY = `yoppaa.rdv.stripe.${slug}`
    let snapshot = null
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) snapshot = JSON.parse(raw)
    } catch (_) {}

    if (paiement === 'ok') {
      const sessionId = params.get('session_id')
      window.history.replaceState({}, '', window.location.pathname)

      if (snapshot) {
        if (snapshot.prestationChoisie) setPrestationChoisie(snapshot.prestationChoisie)
        if (snapshot.dateChoisie) setDateChoisie(new Date(snapshot.dateChoisie))
        if (snapshot.heureChoisie) setHeureChoisie(snapshot.heureChoisie)
        if (snapshot.client) setClient(p => ({ ...p, ...snapshot.client }))
        setRdvCree({
          _viaStripe: true,
          stripe_checkout_session_id: sessionId,
          statut: 'confirme',
          acompte_montant: snapshot.acompteMontant ?? null,
        })
        allerEtape(4)
        // Invite aux push (rappel de RDV) au moment de plus forte intention.
        promptPushOneSignal()

        // Poll pour recuperer le numero_rdv assigne par le webhook (max ~15s).
        // Le webhook arrive async, donc on tente plusieurs fois jusqu'a ce que
        // le RDV soit trouve en DB. On passe le slug du commercant pour que
        // l'API trouve directement le bon compte Connect (vs boucle sur tous).
        if (sessionId && slug) {
          let attempts = 0
          const MAX_ATTEMPTS = 15
          const pollInterval = setInterval(async () => {
            attempts++
            console.info('[rdv stripe] poll attempt', attempts, '/', MAX_ATTEMPTS)
            try {
              const res = await fetch(`/api/rdv/from-session?session_id=${encodeURIComponent(sessionId)}&slug=${encodeURIComponent(slug)}`)
              const j = await res.json()
              console.info('[rdv stripe] poll response', j)
              if (j.ok && j.rdv?.numero_rdv) {
                setRdvCree(p => ({ ...(p || {}), id: j.rdv.id, numero_rdv: j.rdv.numero_rdv, acompte_montant: j.rdv.acompte_montant ?? p?.acompte_montant }))
                clearInterval(pollInterval)
                console.info('[rdv stripe] numero recupere', j.rdv.numero_rdv)
              } else if (attempts >= MAX_ATTEMPTS) {
                console.warn('[rdv stripe] poll numero_rdv timeout - RDV pas trouve apres 15s')
                clearInterval(pollInterval)
              }
            } catch (e) {
              console.error('[rdv stripe] poll error', e)
              if (attempts >= MAX_ATTEMPTS) clearInterval(pollInterval)
            }
          }, 1000)
        }
      } else {
        // Pas de snapshot (cookies cleared ?) → fallback : message + retour accueil
        setSubmitError('Paiement reçu, mais impossible d\'afficher le récap (session expirée). Ton RDV est confirmé, tu recevras l\'email de confirmation.')
      }
      try { sessionStorage.removeItem(STORAGE_KEY) } catch (_) {}
    } else if (paiement === 'annule') {
      window.history.replaceState({}, '', window.location.pathname)
      // Restaure l'etat pour ne pas faire perdre la saisie au user
      if (snapshot) {
        if (snapshot.prestationChoisie) setPrestationChoisie(snapshot.prestationChoisie)
        if (snapshot.dateChoisie) setDateChoisie(new Date(snapshot.dateChoisie))
        if (snapshot.heureChoisie) setHeureChoisie(snapshot.heureChoisie)
        if (snapshot.client) setClient(p => ({ ...p, ...snapshot.client }))
        allerEtape(3)
      }
      setSubmitError('Paiement annulé. Ton RDV n\'a pas été créé. Tu peux réessayer.')
      try { sessionStorage.removeItem(STORAGE_KEY) } catch (_) {}
    }
  }, [slug])

  // ─── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return
    let annule = false
    ;(async () => {
      setLoading(true)
      setErreur(null)
      // 1. Fetch le commerçant via son slug (doit être vitrine + publié + rdv_actif)
      const { data: c, error: errC } = await supabase
        .from('commercants_public')  // vue publique (colonnes sûres, publiés) — RLS commercants
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

      // Deals actifs du jour : chargés AVANT le early-return module RDV désactivé,
      // pour que les vitrines Communiquer sans RDV affichent quand même leurs deals
      // (CTA « Appeler pour réserver »). Fenêtre identique à la fiche commerce :
      // date_deal ponctuelle = aujourd'hui OU intervalle date_debut/date_fin.
      if (canDo(c.plan, 'deals')) {
        const { data: dealsData, error: errDeals } = await supabase
          .from('yoppaa_deals')
          .select('*')
          .eq('commercant_id', c.id)
          .eq('actif', true)
        if (errDeals) console.warn('[rdv fiche] fetch deals KO', errDeals.message)
        const auj = new Date().toISOString().slice(0, 10)
        if (annule) return
        setDeals((dealsData || []).filter(d => {
          if (d.date_deal === auj) return true
          const dStart = d.date_debut ? d.date_debut.slice(0, 10) : null
          const dEnd   = d.date_fin   ? d.date_fin.slice(0, 10)   : null
          return !!(dStart && dEnd && dStart <= auj && auj <= dEnd)
        }))
      }

      if (!c.rdv_actif) {
        // Vitrine publiée mais module RDV pas activé : on affiche quand même la fiche en mode lecture
        setCommercant({ ...c, _rdvDesactive: true })
        setPrestations([])
        setLoading(false)
        return
      }
      setCommercant(c)

      // 2. Fetch prestations + créneaux config + praticiens + junction + fermetures en parallèle
      const todayISO = new Date().toISOString().slice(0, 10)
      const [{ data: prest }, { data: cren }, { data: prat }, { data: junction }, { data: ferm }] = await Promise.all([
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
        supabase
          .from('rdv_praticiens')
          .select('id, prenom, nom, description, photo_url, couleur_hex, ordre, actif')
          .eq('commercant_id', c.id)
          .eq('actif', true)
          .is('deleted_at', null)
          .order('ordre', { ascending: true }),
        // Junction : quelles prestations sont limitées à quels praticiens.
        // Junction vide pour une prestation = TOUS les praticiens peuvent (pattern Yoppaa).
        supabase
          .from('rdv_prestation_praticiens')
          .select('prestation_id, praticien_id'),
        // Sess 6 : fermetures exceptionnelles futures uniquement (date_fin >= today).
        // Filtrage cote client sur date_debut/date_fin pour bloquer les jours concernes.
        supabase
          .from('rdv_fermetures')
          .select('date_debut, date_fin, praticien_id')
          .eq('commercant_id', c.id)
          .is('deleted_at', null)
          .gte('date_fin', todayISO),
      ])

      if (annule) return
      setPrestations(prest || [])
      setCreneauxConfig(cren || [])
      setPraticiens(prat || [])
      // Build junction map : prestation_id -> [praticien_id, ...]
      const jm = {}
      ;(junction || []).forEach(row => {
        if (!jm[row.prestation_id]) jm[row.prestation_id] = []
        jm[row.prestation_id].push(row.praticien_id)
      })
      setJunctionMap(jm)
      setFermetures(ferm || [])
      setLoading(false)
    })()
    return () => { annule = true }
  }, [slug, router])

  // Fetch toutes les reservations du commercant sur 60 jours (1 seul call), pour calculer
  // les disponibilites par jour dans le mini-calendrier (dot vert = dispo, rouge = complet).
  // Re-fetch quand la prestation change (la dispo depend de la duree choisie).
  useEffect(() => {
    if (etape !== 2 || !commercant || !prestationChoisie) return
    let annule = false
    ;(async () => {
      const today = new Date(); today.setHours(0,0,0,0)
      const end = new Date(today); end.setDate(today.getDate() + 60)
      const { data, error } = await supabase.rpc('rdv_slots_busy_range', {
        p_commercant_id: commercant.id,
        p_date_start: isoDate(today),
        p_date_end: isoDate(end),
      })
      if (annule) return
      if (error) {
        console.warn('[rdv-60j] rpc error', error)
        setReservations60j([])
        return
      }
      setReservations60j(data || [])
    })()
    return () => { annule = true }
  }, [etape, commercant, prestationChoisie])

  // Fetch slots libres quand la date change (ou la prestation change)
  // Utilise la RPC rdv_slots_busy (SECURITY DEFINER) pour bypass RLS : tout Yopper
  // peut voir les slots déjà pris, sans exposer les infos perso des autres clients.
  useEffect(() => {
    if (etape !== 2 || !dateChoisie || !prestationChoisie || !commercant) return
    let annule = false
    ;(async () => {
      setSlotsLoading(true)
      const dateStr = isoDate(dateChoisie)
      const { data: reservations, error: errRpc } = await supabase
        .rpc('rdv_slots_busy', { p_commercant_id: commercant.id, p_date: dateStr })
      if (annule) return
      if (errRpc) console.warn('[rdv-slots] rpc error', errRpc)
      const reservationsFiltrees = filtrerReservationsPourSlots(reservations, praticienChoisi, praticiensEligibles)
      const list = genererSlots({
        dateChoisie,
        dureeMinutes: prestationChoisie.duree_minutes,
        creneaux: creneauxFiltres,
        reservations: reservationsFiltrees,
        horairesDetail: commercant.horaires_detail,
      })
      setSlots(list)
      // Tri des reservations par heure_debut pour la section info 'Deja pris'
      const sorted = (reservations || []).slice().sort((a, b) => (a.heure_debut || '').localeCompare(b.heure_debut || ''))
      setReservationsJour(sorted)
      setSlotsLoading(false)
    })()
    return () => { annule = true }
  }, [etape, dateChoisie, prestationChoisie, praticienChoisi, commercant, creneauxConfig])

  function choisirPrestation(p) {
    setPrestationChoisie(p)
    setPraticienChoisi(null)  // reset le praticien : sera auto-select via useEffect ci-dessous si 1 seul dispo
    setEtape(2)
    setDateChoisie(null)
    setHeureChoisie(null)
    setSlots([]); setReservationsJour([])
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 80)
  }

  // Praticiens éligibles pour la prestation choisie (junction) :
  //   • junction vide pour cette prestation = TOUS les praticiens actifs peuvent
  //   • junction renseignée = SEULS les praticiens listés (avec fallback si supprimés)
  const praticiensEligibles = (() => {
    if (!prestationChoisie || praticiens.length === 0) return []
    const junctionIds = junctionMap[prestationChoisie.id]
    if (!junctionIds || junctionIds.length === 0) return praticiens  // tous éligibles
    return praticiens.filter(p => junctionIds.includes(p.id))
  })()

  // Auto-select silencieux si 1 seul praticien éligible pour cette prestation
  // (l'UI de sélection n'est pas montrée). Si aucun praticien : praticienChoisi
  // reste null et l'utilisateur pourra quand même prendre RDV (créneaux communs).
  useEffect(() => {
    if (!prestationChoisie) return
    if (praticiensEligibles.length === 1 && !praticienChoisi) {
      setPraticienChoisi(praticiensEligibles[0])
    }
  }, [prestationChoisie, praticiens])

  // Filtre les créneaux config selon le praticien choisi :
  //   • praticienChoisi = null (Sans préférence ou pas encore choisi) : tous créneaux
  //   • praticienChoisi = X : créneaux de X + créneaux communs (praticien_id = null)
  const creneauxFiltres = praticienChoisi
    ? creneauxConfig.filter(c => c.praticien_id === praticienChoisi.id || c.praticien_id === null)
    : creneauxConfig

  // Helper Sess 6 : est-ce que la date ISO est dans une fermeture applicable ?
  // Fermeture applicable = globale (praticien_id null) OU celle du praticien choisi.
  // Si "Sans préférence" (praticienChoisi null) : seules les fermetures globales bloquent
  // (un praticien peut peut-être encore prendre, sinon pas de créneau dispo = déjà filtré).
  function estFerme(iso) {
    return fermetures.some(f => {
      if (iso < f.date_debut || iso > f.date_fin) return false
      if (f.praticien_id === null) return true  // fermeture globale, bloque tout
      if (praticienChoisi && f.praticien_id === praticienChoisi.id) return true  // praticien choisi indispo
      return false
    })
  }

  // Liste des jours disponibles (60 prochains pour les RDV vitrines - l'anticipation
  // est plus longue que pour de l'alimentaire C&C). Les 14 premiers sont affichés en scroll
  // horizontal, les 46 suivants sont accessibles via le mini-calendrier deroulant.
  // Sess 6 : filtre les fermetures exceptionnelles (marque ouvert:false pour ces jours).
  const joursDispos = commercant && creneauxFiltres.length > 0
    ? genererJoursDispos({ nbJours: 60, horairesDetail: commercant.horaires_detail, creneaux: creneauxFiltres })
        .map(j => estFerme(j.iso) ? { ...j, ouvert: false, motifFerme: 'Fermeture' } : j)
    : []

  // Enrichit chaque jour avec le nombre de slots libres pour la prestation choisie
  // (necessite reservations60j + commercant.horaires_detail). Utilise par le mini-calendrier
  // pour afficher un dot vert (dispo) / rouge (complet ou ferme) par jour.
  const joursAvecDispo = joursDispos.map(j => {
    if (!j.ouvert || !prestationChoisie) return { ...j, nbLibres: 0 }
    const resaDuJour = reservations60j.filter(r => r.date_rdv === j.iso)
    const resaFiltree = filtrerReservationsPourSlots(resaDuJour, praticienChoisi, praticiensEligibles)
    const list = genererSlots({
      dateChoisie: j.date,
      dureeMinutes: prestationChoisie.duree_minutes,
      creneaux: creneauxFiltres,
      reservations: resaFiltree,
      horairesDetail: commercant?.horaires_detail,
    })
    return { ...j, nbLibres: list.filter(s => !s.pris).length }
  })

  // Auto-sélectionne le premier jour ouvert quand on entre à l'étape 2
  useEffect(() => {
    if (etape === 2 && !dateChoisie && joursDispos.length > 0) {
      const premierOuvert = joursDispos.find(j => j.ouvert)
      if (premierOuvert) setDateChoisie(premierOuvert.date)
    }
  }, [etape, joursDispos, dateChoisie])

  // Pré-fill coordonnées depuis localStorage (Yopper connecté)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const email     = localStorage.getItem('yoppaa_email') || ''
    const prenom    = localStorage.getItem('yoppaa_prenom') || ''
    const nom       = localStorage.getItem('yoppaa_nom') || ''
    const telephone = localStorage.getItem('yoppaa_telephone') || ''
    const id        = localStorage.getItem('yoppaa_client_id')
    if (email) setClient(p => ({ ...p, email, prenom, nom, telephone }))
    if (id) setClientId(id)
  }, [])

  const yopperConnecte = !!(client.email && clientId)
  const formValide = !!(prestationChoisie && dateChoisie && heureChoisie
    && client.prenom.trim() && client.nom.trim()
    && client.email.trim() && client.telephone.trim()
    && rgpdCommande)

  // ─── Get-or-create client (invité ou Yopper connecté) ─────────────────────
  // Similaire à la logique panier C&C : on lie l'email à un row clients existant
  // ou on crée. Update seulement si données changées (perf, cf memory PERF FIX).
  async function getOuCreerClient(email, prenom, nom, telephone) {
    // IMPORTANT : on stocke prenom et nom SEPAREMENT dans clients (pas le nom complet).
    // Sinon a chaque RDV/commande clients.nom devient '${prenom} ${nom}' et ecrase la
    // modif du Profil au reload. Bug rapporte par Alex 2026-06-01.
    // Get-or-create côté serveur (RLS clients verrouillé : plus d'accès anon direct).
    const res = await fetch('/api/yopper/client', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-or-create', email, prenom, nom, telephone }),
    })
    const id = (await res.json().catch(() => ({})))?.client?.id
    if (!id) return null
    setClientId(id)
    if (typeof window !== 'undefined') {
      localStorage.setItem('yoppaa_client_id', id)
      localStorage.setItem('yoppaa_email', email)
      localStorage.setItem('yoppaa_prenom', prenom)
      localStorage.setItem('yoppaa_nom', nom)
      if (telephone) localStorage.setItem('yoppaa_telephone', telephone)
    }
    return id
  }

  // ─── Insert RDV (étape 4 onClick "Confirmer mon RDV") ──────────────────────
  // Anti double-booking via UNIQUE INDEX DB (code 23505) - catché pour UX explicite.
  // numero_rdv assigné automatiquement par trigger DB set_rdv_numero (BEFORE INSERT).
  async function passerRdv() {
    if (!formValide || !commercant) return
    console.info('[rdv] passerRdv start')
    setSubmitting(true)
    setSubmitError(null)

    try {
      const email = client.email.trim().toLowerCase()
      const prenom = client.prenom.trim()
      const nom = client.nom.trim()
      const telephone = client.telephone.trim()

      const cid = await getOuCreerClient(email, prenom, nom, telephone)
      console.info('[rdv] client id =', cid)

      const debutMin = timeToMinutes(heureChoisie)
      const finMin   = debutMin + prestationChoisie.duree_minutes
      const heureFin = minutesToTime(finMin)
      const dateStr  = isoDate(dateChoisie)

      // ── Validation server-side AVANT insert ───────────────────────────────────
      // Triple check fail-CLOSED : tout echec d'une verification (y compris RPC down
      // ou horaires absents) REFUSE le RDV. Mieux vaut un faux negatif (RDV refuse
      // alors qu'il etait OK) qu'un faux positif (RDV cree alors qu'il chevauche).
      const jourSem = jourSemaineDate(dateChoisie)
      const horaireJour = commercant.horaires_detail?.[jourSem]
      console.info('[rdv] validation pre-insert', {
        date: dateStr, jour: jourSem, debutMin, finMin,
        heure: heureChoisie, heureFin,
        horaireJour, hasHoraires: !!commercant.horaires_detail,
        nbCreneauxConfig: (creneauxConfig || []).length,
      })

      // 1. Overlap avec une reservation existante (RPC + filtre praticien).
      // Bug 7.1 : sans filtre praticien, un RDV Carole 9h-10h bloquait aussi
      // le "Payer" pour un RDV Alex 9h-10h (RPC retourne tous les RDV du
      // commercant). Meme logique que filtrerReservationsPourSlots utilise
      // pour l'affichage des slots dispo.
      const { data: busy, error: errBusy } = await supabase.rpc('rdv_slots_busy', { p_commercant_id: commercant.id, p_date: dateStr })
      if (errBusy) {
        console.error('[rdv] RPC rdv_slots_busy KO', errBusy)
        setSubmitError('Impossible de vérifier la disponibilité (RPC). Reessaie dans quelques secondes.')
        setSubmitting(false); return
      }
      const busyFiltres = filtrerReservationsPourSlots(busy, praticienChoisi, praticiensEligibles)
      console.info('[rdv] reservations bloquantes apres filtre praticien', busyFiltres)
      const overlap = busyFiltres.some(r => {
        const rStart = timeToMinutes(r.heure_debut)
        const rEnd   = timeToMinutes(r.heure_fin)
        const ov = debutMin < rEnd && finMin > rStart
        if (ov) console.warn('[rdv] overlap', { nouveau: `${debutMin}-${finMin}`, existant: `${rStart}-${rEnd}` })
        return ov
      })
      if (overlap) {
        setSubmitError('Ce créneau chevauche un RDV déjà pris. Choisis-en un autre.')
        setHeureChoisie(null)
        setSubmitting(false)
        setTimeout(() => allerEtape(2), 1200)
        return
      }

      // 2. Bornes shop ce jour-la (fail-closed si horaires absents pour ce jour)
      if (!horaireJour) {
        console.error('[rdv] horaires_detail manquant pour', jourSem, commercant.horaires_detail)
        setSubmitError(`Horaires de ${commercant.nom} non configurés pour ce jour. Contacte le commerçant.`)
        setSubmitting(false); return
      }
      if (horaireJour.ouvert === false) {
        setSubmitError(`${commercant.nom} est fermé ce jour-là. Choisis un autre jour.`)
        setSubmitting(false); setTimeout(() => allerEtape(2), 1200); return
      }
      // Le RDV doit tenir ENTIÈREMENT dans une des plages d'ouverture du jour
      // (horaires à pause : ex. 11:00-14:00 puis 18:00-22:00).
      const plagesShop = []
      if (horaireJour.debut && horaireJour.fin) plagesShop.push([timeToMinutes(horaireJour.debut), timeToMinutes(horaireJour.fin)])
      if (horaireJour.debut2 && horaireJour.fin2) plagesShop.push([timeToMinutes(horaireJour.debut2), timeToMinutes(horaireJour.fin2)])
      if (plagesShop.length > 0 && !plagesShop.some(([a, b]) => debutMin >= a && finMin <= b)) {
        console.warn('[rdv] hors plages shop', { debutMin, finMin, plagesShop })
        const plagesTxt = plagesShop.map(([a, b]) => `${minutesToTime(a)}-${minutesToTime(b)}`).join(' et ')
        setSubmitError(`Ce créneau tombe en dehors des heures d'ouverture (${plagesTxt}). Choisis-en un autre.`)
        setSubmitting(false); setTimeout(() => allerEtape(2), 1200); return
      }

      // 3. Chevauchement avec pause d'un des creneaux du jour
      const creneauxJourCheck = (creneauxConfig || []).filter(c =>
        c.actif !== false
        && (c.date_specifique === dateStr || (!c.date_specifique && c.jour_semaine === jourSem))
      )
      const pauseConflict = creneauxJourCheck.some(c => {
        if (!c.pause_debut || !c.pause_fin) return false
        const pStart = timeToMinutes(c.pause_debut), pEnd = timeToMinutes(c.pause_fin)
        const ov = debutMin < pEnd && finMin > pStart
        if (ov) console.warn('[rdv] pause overlap', { debutMin, finMin, pause: `${pStart}-${pEnd}` })
        return ov
      })
      if (pauseConflict) {
        setSubmitError('Ce créneau chevauche la pause du commerçant. Choisis-en un autre.')
        setSubmitting(false); setTimeout(() => allerEtape(2), 1200); return
      }
      console.info('[rdv] validation OK, insert')

      // Prix estimé (figé - si prix variable, on prend prix_min)
      const prixEstime = prestationChoisie.prix != null
        ? Number(prestationChoisie.prix)
        : (prestationChoisie.prix_min != null ? Number(prestationChoisie.prix_min) : null)

      // Acompte (figé)
      const acomptePct = prestationChoisie.acompte_pourcent || commercant.rdv_acompte_global || 0
      const acompteMontant = (prixEstime != null && acomptePct > 0)
        ? Math.round(prixEstime * acomptePct) / 100
        : null

      // ─── STRIPE PAIEMENT ACOMPTE EN LIGNE ─────────────────────────────────────
      // Si le commercant a active l'acompte en ligne ET que la prestation a un %
      // d'acompte > 0 ET que son compte Stripe est operationnel : on passe par Stripe
      // Checkout. Le RDV sera cree par le webhook payment_intent.succeeded apres paiement.
      const acompteEnLigneRequis = !!(
        commercant.rdv_acompte_en_ligne_actif
        && commercant.stripe_account_charges_enabled
        && acompteMontant && acompteMontant >= 0.5
      )

      if (acompteEnLigneRequis) {
        console.info('[rdv] paiement acompte en ligne requis', { montant: acompteMontant })
        // Sauve l'etat avant redirection Stripe - sera restaure au retour ?paiement=ok|annule
        try {
          sessionStorage.setItem(`yoppaa.rdv.stripe.${slug}`, JSON.stringify({
            prestationChoisie,
            dateChoisie: dateChoisie?.toISOString(),
            heureChoisie,
            client: { email, prenom, nom, telephone, notes: client.notes },
            acompteMontant,
          }))
        } catch (e) { console.warn('[rdv] sessionStorage save fail', e) }

        try {
          const res = await fetch('/api/stripe/checkout/create-rdv-acompte', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commercant_id: commercant.id,
              prestation_id: prestationChoisie.id,
              praticien_id: praticienChoisi?.id || null,
              date_rdv: dateStr,
              heure_debut: heureChoisie,
              heure_fin: heureFin,
              duree_minutes: prestationChoisie.duree_minutes,
              client_email: email,
              client_prenom: prenom,
              client_nom: nom,
              client_telephone: telephone,
              notes_client: client.notes.trim() || null,
              rgpd_marketing: rgpdMarketing,
            }),
          })
          const j = await res.json()
          if (!j.ok || !j.url) {
            throw new Error(j.error || 'Erreur création Checkout')
          }
          // Redirect Stripe Checkout. Au retour ?paiement=ok le webhook aura cree le RDV.
          // redirectTop : sort de l'iframe MobileFrame sur PC desktop via <a target="_top">.
          redirectTop(j.url)
          return
        } catch (e) {
          console.error('[rdv] erreur Stripe Checkout', e)
          setSubmitError(`Erreur paiement : ${e.message}. Reessaie ou contacte ${commercant.nom}.`)
          setSubmitting(false)
          return
        }
      }

      // UUID client-side : pas besoin de .select() après insert
      const rdvId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null
      const payload = {
        ...(rdvId ? { id: rdvId } : {}),
        commercant_id: commercant.id,
        client_id: cid,
        prestation_id: prestationChoisie.id,
        praticien_id: praticienChoisi?.id || null,  // null = Sans préférence (à assigner par commerçant)
        client_email: email,
        client_prenom: prenom,
        client_nom: nom,
        client_telephone: telephone,
        date_rdv: dateStr,
        heure_debut: heureChoisie,
        heure_fin: heureFin,
        duree_minutes: prestationChoisie.duree_minutes,
        prix_estime: prixEstime,
        acompte_montant: acompteMontant,
        acompte_paye: false,
        statut: 'confirme',
        notes_client: client.notes.trim() || null,
        rgpd_marketing: rgpdMarketing,
      }

      console.info('[rdv] inserting', { id: rdvId, date: dateStr, heure: heureChoisie })
      const { error } = await supabase.from('rdv_reservations').insert(payload)

      if (error) {
        // Double-booking rattrapé au niveau DB (atomique, race-proof) :
        //   23505 = unique_violation   -> rdv_no_double_book (même heure exacte)
        //   23P01 = exclusion_violation -> rdv_no_overlap_praticien (chevauchement)
        if (error.code === '23505' || error.code === '23P01') {
          console.warn('[rdv] double-booking caught', error.code)
          setSubmitError('Ce créneau vient d\'être pris par un autre client. Choisis-en un autre.')
          setHeureChoisie(null)
          setSubmitting(false)
          setTimeout(() => allerEtape(2), 1200)
          return
        }
        console.error('[rdv] insert error', error)
        setSubmitError(`Erreur : ${error.message || error.code || 'inconnue'}`)
        setSubmitting(false)
        return
      }

      console.info('[rdv] insert OK, fetching numero')

      // Rappel push 1h avant le RDV (booking sans acompte). Fire-and-forget,
      // non bloquant : le chemin avec acompte le programme via le webhook.
      if (rdvId) {
        fetch('/api/rdv/schedule-rappel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rdv_id: rdvId }),
        }).catch(e => console.warn('[rdv] schedule-rappel KO', e?.message))
      }

      // Récupère le numero_rdv assigné par le trigger DB (RPC SECURITY DEFINER, bypass RLS)
      let numeroFinal = null
      if (rdvId) {
        try {
          const { data: numero } = await supabase.rpc('rdv_numero_pour_id', { p_rdv_id: rdvId })
          numeroFinal = typeof numero === 'number' ? numero : null
          console.info('[rdv] numero =', numeroFinal)
        } catch (e) {
          console.warn('[rdv] numero rpc skip', e)
        }
      }

      // État final pour écran confirmation (étape 4)
      setRdvCree({
        id: rdvId,
        ...payload,
        numero_rdv: numeroFinal,
      })
      setSubmitting(false)
      setEtape(4)
      setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 80)
      // Invite aux push (rappel de RDV) au moment de plus forte intention.
      promptPushOneSignal()
      console.info('[rdv] success, etape=4')

      // Envoi emails post-confirmation (non-bloquant, fire-and-forget)
      if (rdvId) {
        fetch('/api/emails/rdv-confirme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rdv_id: rdvId }),
        }).catch(e => console.warn('[rdv] emails fire-and-forget KO', e))
      }

    } catch (e) {
      // Filet de sécurité : toute exception non gérée tombe ici
      console.error('[rdv] passerRdv exception', e)
      setSubmitError(`Erreur inattendue : ${e?.message || String(e)}`)
      setSubmitting(false)
    }
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow-x: hidden; max-width: 100vw; }
        body { font-family: "DM Sans", sans-serif; background: ${T.bg}; color: ${T.ink}; position: relative; }
        .page-wrap { display: flex; flex-direction: column; min-height: 100dvh; max-width: 760px; margin: 0 auto; background: ${T.bg}; overflow-x: hidden; width: 100%; }
        .scroll-body { flex: 1; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
        .topbar-rdv { overflow: hidden; max-width: 100%; }
        .step-label { display: inline; }
        @media (max-width: 479px) {
          .step-label { display: none; }
          .step-pill { padding: 3px 7px !important; }
          .step-sep { width: 4px !important; }
        }
        .action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 0.4rem 0.75rem; border-radius: 100px; border: 1px solid ${T.pale}; background: #fff; color: ${T.ink}; font-weight: 700; font-size: 0.74rem; cursor: pointer; transition: all 0.15s; line-height: 1.1; }
        .action-btn:hover { border-color: ${T.main}; color: ${T.main}; background: ${T.pale}; }
        .prest-card { transition: all 0.15s; }
        .prest-card:hover { border-color: ${T.main}; transform: translateY(-1px); box-shadow: 0 6px 24px rgba(107,53,196,0.12); }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dealGlow {
          0%, 100% { box-shadow: 0 4px 16px rgba(22,6,54,0.2),  0 0 0 0  rgba(196,160,244,0); }
          50%      { box-shadow: 0 6px 28px rgba(22,6,54,0.35), 0 0 0 10px rgba(196,160,244,0.45); }
        }
        .fiche-hero { height: 220px; }
        @media (min-width: 600px) { .fiche-hero { height: 280px; } }
        .day-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="page-wrap">

        {/* ── TOPBAR (bande 3px canonique + retour + step indicator) ──
            overflow:hidden + max-width:100% : empeche le step indicator de creer un
            scroll-x latent qui restait bloque sur Chrome iOS standalone apres un
            swipe involontaire (bug Yoppaa 4 du 2026-06-02). */}
        <div className="topbar-rdv" style={{ background: T.bgPanel, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderBottom: `1px solid ${T.main}33`, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
          <button onClick={() => {
              // Bug 7.3 : bouton Retour intelligent selon l'etape courante.
              // Etape 1 : sortir du wizard vers l'accueil / la fiche
              // Etape 2 : revenir a etape 1 (choix prestation), reset date+heure
              // Etape 3 : revenir a etape 2 (choix creneau), garder les choix
              if (etape === 1) { router.push('/commander') }
              else if (etape === 2) { setPrestationChoisie(null); allerEtape(1); setDateChoisie(null); setHeureChoisie(null) }
              else if (etape === 3) { allerEtape(2) }
            }}
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
                    <div className="step-pill" style={{ display: 'flex', alignItems: 'center', gap: 5, background: active ? T.main : done ? '#10B98122' : 'rgba(255,255,255,0.08)', border: `1.5px solid ${active ? T.light : done ? '#10B981' : 'rgba(255,255,255,0.15)'}`, borderRadius: 100, padding: '3px 10px', transition: 'all 0.3s', boxShadow: active ? `0 4px 12px ${T.main}44` : 'none' }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: active ? '#fff' : done ? '#10B981' : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 900, color: active ? T.main : '#fff', flexShrink: 0 }}>
                        {done ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg> : s.n}
                      </span>
                      <span className="step-label" style={{ fontSize: '0.7rem', fontWeight: 700, color: active ? '#fff' : done ? '#10B981' : 'rgba(255,255,255,0.5)' }}>{s.label}</span>
                    </div>
                    {i < 2 && <div className="step-sep" style={{ width: 8, height: 1.5, background: etape > s.n ? '#10B981' : 'rgba(255,255,255,0.15)' }}/>}
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
                        {h.ouvert ? `Ouvert · ${h.debut.slice(0,5)}–${h.fin.slice(0,5)}${h.debut2 && h.fin2 ? ` · ${h.debut2.slice(0,5)}–${h.fin2.slice(0,5)}` : ''}` : 'Fermé aujourd\'hui'}
                      </span>
                    </div>
                  )
                })()}

                {commercant.description && (
                  <p style={{ fontSize: '0.85rem', color: T.deep, lineHeight: 1.55, margin: '12px 0 0' }}>{commercant.description}</p>
                )}

                {/* Infos pratiques du commerçant (annulation, paiement, consignes) :
                    affichées AVANT la réservation, pas de pop-up bloquante */}
                {commercant.infos_pratiques && (
                  <div style={{ marginTop: 12, background: T.pale, borderRadius: 12, padding: '10px 12px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '0.62rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Infos pratiques</p>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: T.deep, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{commercant.infos_pratiques}</p>
                  </div>
                )}

                {/* Carte de fidélité : ma jauge ou le teaser du programme */}
                {etape === 1 && <CarteFideliteFiche commercant={commercant} carte={maCarteFid}/>}

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

                {/* Deals du jour : bandeau cliquable → modale détail + CTA appeler.
                    Affiché uniquement à l'étape 1 (fiche), pas pendant le tunnel RDV. */}
                {etape === 1 && deals.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {deals.map(d => (
                      <button key={d.id} onClick={() => setDealDetailOuvert(d)}
                        style={{ width: '100%', background: `linear-gradient(135deg, ${T.ink}, ${T.deep})`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, animation: 'dealGlow 1.8s ease-in-out infinite', border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'left' }}>
                        <Flame size={20} strokeWidth={2} color={T.light} style={{ flexShrink: 0 }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.65rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Deal du jour</p>
                          <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', marginTop: 2, lineHeight: 1.3 }}>{d.titre}</p>
                        </div>
                        {d.remise_pct ? (
                          <span style={{ fontSize: '1.05rem', fontWeight: 900, color: T.light, letterSpacing: '-0.3px', flexShrink: 0 }}>-{d.remise_pct}%</span>
                        ) : d.prix_deal ? (
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {d.prix_original && <p style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.55)', textDecoration: 'line-through' }}>{Number(d.prix_original).toFixed(2)}€</p>}
                            <p style={{ fontSize: '1.05rem', fontWeight: 900, color: T.light, letterSpacing: '-0.3px' }}>{Number(d.prix_deal).toFixed(2)}€</p>
                          </div>
                        ) : null}
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', flexShrink: 0, marginLeft: 4 }}>›</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Horaires complets (collapsible) - meme widget que la fiche alimentaire */}
                <div style={{ marginTop: 12 }}>
                  <HorairesSection horaires={commercant.horaires_detail} variant="card"/>
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
                      <strong>{commercant.nom}</strong> n&apos;a pas encore activé la prise de RDV en ligne sur Yoppaa. Contacte-le directement par téléphone pour réserver.
                    </p>
                  </div>
                </div>
              )}

              {/* ─── ÉTAPE 1 - LISTE PRESTATIONS ─── */}
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
                        Le commerçant n&apos;a pas encore renseigné ses prestations. Contacte-le directement pour réserver.
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

              {/* ─── ÉTAPE 2 - CALENDRIER + SLOTS CRÉNEAUX ─── */}
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
                      <button onClick={() => { setPrestationChoisie(null); allerEtape(1); setDateChoisie(null); setHeureChoisie(null) }}
                        style={{ background: '#fff', border: `1.5px solid ${T.main}`, color: T.main, fontWeight: 700, fontSize: '0.72rem', padding: '0.4rem 0.875rem', borderRadius: 100, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
                        Changer
                      </button>
                    </div>
                  </div>

                  {/* Section : Avec qui ? (praticiens éligibles pour cette prestation).
                      Affichée seulement si ≥2 praticiens éligibles. Si 1 seul, auto-select
                      silencieux via useEffect. Si aucun praticien : la section reste masquée
                      et le RDV se prend sur les créneaux communs. */}
                  {praticiensEligibles.length >= 2 && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="8" r="4"/>
                            <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
                          </svg>
                          Avec qui
                        </span>
                        <div style={{ flex: 1, height: 1, background: T.pale }}/>
                      </div>
                      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 14, scrollbarWidth: 'none' }}>
                        {/* Card "Sans préférence" - premier dispo. On garde la date deja choisie
                            (sinon le useEffect etape 2 la reset a aujourd'hui, bug UX signale par Alex),
                            on reset juste l'heure car les slots changent selon le praticien. */}
                        <button onClick={() => { setPraticienChoisi(null); setHeureChoisie(null) }}
                          style={{
                            flexShrink: 0, minWidth: 96, padding: '10px 8px',
                            background: !praticienChoisi ? `linear-gradient(135deg, ${T.pale}, #fff)` : '#fff',
                            border: `2px solid ${!praticienChoisi ? T.main : T.pale}`,
                            borderRadius: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                            boxShadow: !praticienChoisi ? `0 4px 14px ${T.main}22` : 'none',
                          }}>
                          <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18 }}>?</div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: !praticienChoisi ? T.main : T.deep, textAlign: 'center', lineHeight: 1.2 }}>Sans préférence</span>
                        </button>
                        {praticiensEligibles.map(p => {
                          const actif = praticienChoisi?.id === p.id
                          const initiales = `${(p.prenom?.[0] || '').toUpperCase()}${(p.nom?.[0] || '').toUpperCase()}`
                          return (
                            <button key={p.id} onClick={() => { setPraticienChoisi(p); setHeureChoisie(null) }}
                              style={{
                                flexShrink: 0, minWidth: 96, padding: '10px 8px',
                                background: actif ? `linear-gradient(135deg, ${T.pale}, #fff)` : '#fff',
                                border: `2px solid ${actif ? T.main : T.pale}`,
                                borderRadius: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                boxShadow: actif ? `0 4px 14px ${T.main}22` : 'none',
                              }}>
                              <div style={{ width: 44, height: 44, borderRadius: '50%', background: p.couleur_hex || T.main, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, overflow: 'hidden' }}>
                                {p.photo_url ? (
                                  <img src={p.photo_url} alt={p.prenom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                                ) : (
                                  <span>{initiales || '?'}</span>
                                )}
                              </div>
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: actif ? T.main : T.deep, textAlign: 'center', lineHeight: 1.2 }}>
                                {p.prenom}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}

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

                  {/* Day picker horizontal scrollable - 14 premiers jours uniquement.
                      Pour les RDVs plus eloignes (jusqu'a J+60), bouton 'Plus de jours' qui
                      deroule un mini-calendrier mensuel sous le picker. */}
                  <div className="day-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: showMiniCal ? 8 : 12, scrollbarWidth: 'none' }}>
                    {joursDispos.slice(0, 14).map(j => {
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
                    {joursDispos.length > 14 && (
                      <button onClick={() => setShowMiniCal(s => !s)}
                        style={{
                          flexShrink: 0, minWidth: 64,
                          padding: '0.5rem 0.75rem', borderRadius: 12,
                          border: `1.5px dashed ${showMiniCal ? T.main : T.pale}`,
                          background: showMiniCal ? T.pale : '#fff',
                          color: T.main,
                          cursor: 'pointer',
                          textAlign: 'center', fontFamily: '"DM Sans", sans-serif',
                          transition: 'all 0.15s',
                          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 2,
                        }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2"/>
                          <path d="M16 2v4M8 2v4M3 10h18"/>
                        </svg>
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.3px' }}>
                          {showMiniCal ? 'Fermer' : 'Plus'}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Mini-calendrier mensuel - apparait au clic sur le bouton 'Plus'.
                      joursAvecDispo embed nbLibres -> dots verts (libres) / rouges (complets) sur les cellules. */}
                  {showMiniCal && (
                    <MiniCalendrier
                      jours={joursAvecDispo}
                      dateChoisie={dateChoisie}
                      onSelect={d => {
                        setDateChoisie(d)
                        setHeureChoisie(null)
                        setShowMiniCal(false)
                      }}
                    />
                  )}

                  {/* Section : choix du créneau.
                      Le titre integre la DATE selectionnee pour confirmer visuellement la
                      selection (critique quand le user a clique un jour > J+14 dans le mini-cal :
                      sans ce titre, il ne sait pas si son clic est bien passe). */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                      </svg>
                      {dateChoisie
                        ? `Créneaux ${JOURS_LONGS[dateChoisie.getDay()].toLowerCase()} ${dateChoisie.getDate()} ${MOIS_COURTS[dateChoisie.getMonth()]}`
                        : 'À quelle heure'}
                    </span>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                    {dateChoisie && !slotsLoading && (() => {
                      const nbLibres = slots.filter(s => !s.pris).length
                      return (
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>
                          {nbLibres} {nbLibres > 1 ? 'créneaux libres' : nbLibres === 1 ? 'créneau libre' : 'plus de créneau'}
                        </span>
                      )
                    })()}
                  </div>

                  {!dateChoisie && (
                    <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: T.muted, fontSize: '0.85rem' }}>
                      Choisis d&apos;abord un jour ci-dessus ↑
                    </div>
                  )}

                  {dateChoisie && slotsLoading && (
                    <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: T.muted, fontSize: '0.85rem' }}>
                      Chargement des créneaux…
                    </div>
                  )}

                  {dateChoisie && !slotsLoading && slots.filter(s => !s.pris).length === 0 && (
                    <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.5 }}>
                        Aucun créneau libre ce jour-là. Essaie un autre jour ↑
                      </p>
                    </div>
                  )}

                  {/* SECTION 1 : SLOTS LIBRES UNIQUEMENT - gros boutons, lecture immediate */}
                  {dateChoisie && !slotsLoading && slots.filter(s => !s.pris).length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: 8, marginBottom: 14 }}>
                      {slots.filter(s => !s.pris).map(({ heure }) => {
                        const choisi = heureChoisie === heure
                        return (
                          <button key={heure} onClick={() => setHeureChoisie(heure)}
                            style={{
                              padding: '0.75rem 0.5rem', borderRadius: 12,
                              border: `1.5px solid ${choisi ? T.main : T.pale}`,
                              background: choisi ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff',
                              color: choisi ? '#fff' : T.ink,
                              fontWeight: 800, fontSize: '0.95rem',
                              cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                              transition: 'all 0.15s', letterSpacing: '-0.2px',
                              boxShadow: choisi ? `0 6px 18px ${T.main}55` : 'none',
                              position: 'relative',
                            }}
                            onMouseOver={e => { if (!choisi) { e.currentTarget.style.borderColor = T.main + '88'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
                            onMouseOut={e => { if (!choisi) { e.currentTarget.style.borderColor = T.pale; e.currentTarget.style.transform = 'translateY(0)' } }}>
                            {choisi && (
                              <span style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: '50%', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                              </span>
                            )}
                            {heure}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* SECTION 2 : DEJA PRIS - info uniquement, jamais cliquable. Affichee seulement
                      s'il existe au moins une reservation ce jour-la. Sert de preuve sociale
                      ('le commerce a de l'activite') sans polluer la zone de selection. */}
                  {/* Bug 7.2 : filtrage praticien-aware + affichage du prenom.
                      - Praticien X choisi : uniquement les RDV de X et null (legacy)
                      - Sans preference : tous, avec le nom pour clarifier
                      Evite l'ambiguite du screenshot Alex qui montrait un RDV Carole
                      sur une reservation avec Alex. */}
                  {(() => {
                    const rdvsAffiches = praticienChoisi
                      ? reservationsJour.filter(r => r.praticien_id === praticienChoisi.id || r.praticien_id === null)
                      : reservationsJour
                    if (!dateChoisie || slotsLoading || rdvsAffiches.length === 0) return null
                    return (
                      <div style={{ background: '#F9FAFB', border: `1px solid ${T.pale}`, borderRadius: 12, padding: '0.625rem 0.875rem', marginBottom: 16 }}>
                        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.62rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0, marginBottom: 6 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                          </svg>
                          Déjà pris ce jour-là ({rdvsAffiches.length})
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {rdvsAffiches.map((r, i) => {
                            const p = r.praticien_id ? praticiens.find(x => x.id === r.praticien_id) : null
                            return (
                              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 100, fontSize: '0.72rem', fontWeight: 700, color: T.deep, fontFamily: '"DM Sans", sans-serif' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: p?.couleur_hex || T.main }}/>
                                {r.heure_debut?.slice(0,5)} – {r.heure_fin?.slice(0,5)}
                                {p && <span style={{ color: T.muted, fontWeight: 600, marginLeft: 2 }}>· {p.prenom}</span>}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Bouton Continuer */}
                  {heureChoisie && (
                    <button onClick={() => allerEtape(3)}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '1rem', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 6px 24px ${T.main}55`, animation: 'fadeUp 0.3s ease' }}>
                      Continuer - {JOURS_LONGS[dateChoisie.getDay()]} {dateChoisie.getDate()} {MOIS_COURTS[dateChoisie.getMonth()]} à {heureChoisie}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* ─── ÉTAPE 3 - COORDONNÉES + RGPD ─── */}
              {etape === 3 && prestationChoisie && dateChoisie && heureChoisie && (
                <div style={{ padding: '1.25rem 1rem 2rem', animation: 'fadeUp 0.4s ease' }}>
                  {/* Recap RDV verrouillé */}
                  <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${T.pale}`, overflow: 'hidden', marginBottom: 18, boxShadow: '0 1px 4px rgba(107,53,196,0.04)' }}>
                    <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                    <div style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Ton RDV</p>
                          <p style={{ fontWeight: 800, color: T.ink, fontSize: '1rem', letterSpacing: '-0.2px', lineHeight: 1.25, marginBottom: 4 }}>
                            {prestationChoisie.nom}
                          </p>
                          <p style={{ fontSize: '0.82rem', color: T.deep, fontWeight: 600, lineHeight: 1.45 }}>
                            {JOURS_LONGS[dateChoisie.getDay()]} {dateChoisie.getDate()} {MOIS_COURTS[dateChoisie.getMonth()]} · {heureChoisie}<br/>
                            <span style={{ color: T.muted, fontWeight: 500 }}>
                              {formatDuree(prestationChoisie.duree_minutes)} · <span style={{ color: T.main, fontWeight: 800 }}>{formatPrix(prestationChoisie)}</span>
                            </span>
                          </p>
                        </div>
                        <button onClick={() => allerEtape(2)}
                          style={{ background: '#fff', border: `1.5px solid ${T.main}`, color: T.main, fontWeight: 700, fontSize: '0.72rem', padding: '0.4rem 0.875rem', borderRadius: 100, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
                          Modifier
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Encart Yopper connecté vs invité.
                      Wording : on rassure d'abord (PAS besoin de compte) puis on offre
                      le raccourci aux Yoppers existants - pas de pression a creer un compte
                      au milieu du flow (le CTA d'inscription arrive en etape 4 post-RDV). */}
                  {!yopperConnecte && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: T.pale, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: 14, border: `1px solid ${T.main}22` }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 16v-4M12 8h.01"/>
                      </svg>
                      <p style={{ fontSize: '0.78rem', color: T.deep, lineHeight: 1.5, flex: 1, margin: 0 }}>
                        <strong style={{ color: T.ink }}>Pas besoin de compte</strong> pour réserver - remplis juste tes coordonnées ci-dessous.<br/>
                        Déjà Yopper ?{' '}
                        <a href={`/commander/auth?redirect=/commander/rdv/${slug}`} style={{ color: T.main, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          Connecte-toi pour pré-remplir →
                        </a>
                      </p>
                    </div>
                  )}

                  {/* Section coordonnées */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      Tes coordonnées
                    </span>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <input placeholder="Prénom *" type="text" value={client.prenom} onChange={e => setClient(p => ({ ...p, prenom: e.target.value }))}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 12, border: `1.5px solid ${T.pale}`, fontSize: '0.95rem', fontFamily: '"DM Sans", sans-serif', color: T.ink, background: '#fff', outline: 'none', boxSizing: 'border-box' }}/>
                    <input placeholder="Nom *" type="text" value={client.nom} onChange={e => setClient(p => ({ ...p, nom: e.target.value }))}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 12, border: `1.5px solid ${T.pale}`, fontSize: '0.95rem', fontFamily: '"DM Sans", sans-serif', color: T.ink, background: '#fff', outline: 'none', boxSizing: 'border-box' }}/>
                  </div>
                  <input placeholder="Email *" type="email" value={client.email} onChange={e => setClient(p => ({ ...p, email: e.target.value }))}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 12, border: `1.5px solid ${T.pale}`, fontSize: '0.95rem', fontFamily: '"DM Sans", sans-serif', color: T.ink, background: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}/>
                  <input placeholder="Téléphone *" type="tel" value={client.telephone} onChange={e => setClient(p => ({ ...p, telephone: e.target.value }))}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 12, border: `1.5px solid ${T.pale}`, fontSize: '0.95rem', fontFamily: '"DM Sans", sans-serif', color: T.ink, background: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}/>

                  {/* Notes optionnelles */}
                  <textarea placeholder="Une précision pour le commerçant ? (optionnel - allergie, demande spécifique…)"
                    value={client.notes} onChange={e => setClient(p => ({ ...p, notes: e.target.value }))}
                    rows={3}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 12, border: `1.5px solid ${T.pale}`, fontSize: '0.85rem', fontFamily: '"DM Sans", sans-serif', color: T.ink, background: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 16, resize: 'vertical' }}/>

                  {/* RGPD */}
                  <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${T.pale}`, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ padding: '0.625rem 1rem', background: T.pale }}>
                      <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        Confidentialité
                      </p>
                    </div>
                    {[
                      { key: 'rgpdCommande', val: rgpdCommande, set: setRgpdCommande, label: 'Traitement de mon RDV', badge: 'Obligatoire', badgeColor: '#DC2626', badgeBg: '#FEE2E2', desc: `J'accepte que mes coordonnées soient transmises à ${commercant.nom} pour le traitement de mon rendez-vous.` },
                      { key: 'rgpdMarketing', val: rgpdMarketing, set: setRgpdMarketing, label: 'Offres et actualités', badge: 'Optionnel', badgeColor: T.main, badgeBg: T.pale, desc: `J'accepte que ${commercant.nom} utilise mes coordonnées pour m'envoyer des offres et actualités.` },
                    ].map((item, i) => (
                      <label key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.875rem 1rem', cursor: 'pointer', borderBottom: i === 0 ? `1px solid ${T.pale}` : 'none', background: item.val ? '#F0FDF4' : '#fff' }}>
                        <div onClick={() => item.set(v => !v)}
                          style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${item.val ? '#10B981' : '#D1D5DB'}`, background: item.val ? '#10B981' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s' }}>
                          {item.val && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                          )}
                        </div>
                        <div>
                          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: T.ink, marginBottom: 2 }}>
                            {item.label}{' '}
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, background: item.badgeBg, color: item.badgeColor, padding: '1px 6px', borderRadius: 100, marginLeft: 4 }}>{item.badge}</span>
                          </p>
                          <p style={{ fontSize: '0.75rem', color: T.muted, lineHeight: 1.5 }}>{item.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Erreur insert (double-booking ou autre) */}
                  {submitError && (
                    <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '0.875rem 1rem', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <path d="M12 9v4M12 17h.01"/>
                      </svg>
                      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.5, flex: 1 }}>{submitError}</p>
                    </div>
                  )}

                  {/* Bouton Confirmer - wording adapté si paiement en ligne requis */}
                  {(() => {
                    const acompteEnLigne = !!(commercant?.rdv_acompte_en_ligne_actif && commercant?.stripe_account_charges_enabled && prestationChoisie?.acompte_pourcent > 0)
                    const prixBase = prestationChoisie?.prix != null ? Number(prestationChoisie.prix) : (prestationChoisie?.prix_min != null ? Number(prestationChoisie.prix_min) : null)
                    const acompteMnt = (prixBase != null && prestationChoisie?.acompte_pourcent > 0)
                      ? Math.round(prixBase * prestationChoisie.acompte_pourcent) / 100
                      : null
                    return (
                      <>
                        <button disabled={!formValide || submitting}
                          onClick={passerRdv}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '1rem', border: 'none', borderRadius: 100, background: (!formValide || submitting) ? '#E5E7EB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: (!formValide || submitting) ? '#9CA3AF' : '#fff', fontWeight: 800, fontSize: '1rem', cursor: (!formValide || submitting) ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: (!formValide || submitting) ? 'none' : `0 6px 24px ${T.main}55`, opacity: (!formValide || submitting) ? 0.6 : 1, transition: 'all 0.2s' }}>
                          {submitting ? 'Réservation en cours…' : (
                            <>
                              {acompteEnLigne && acompteMnt ? `Payer ${acompteMnt.toFixed(2)}€ et confirmer` : 'Confirmer mon RDV'}
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                              </svg>
                            </>
                          )}
                        </button>
                        {acompteEnLigne && acompteMnt && !submitting && (
                          <p style={{ fontSize: '0.72rem', color: T.muted, textAlign: 'center', marginTop: 6, lineHeight: 1.4, display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                            <Lock size={11} strokeWidth={2}/> Paiement sécurisé Stripe · Solde de {prixBase ? (prixBase - acompteMnt).toFixed(2) : '?'}€ à régler sur place
                          </p>
                        )}
                      </>
                    )
                  })()}
                  {!rgpdCommande && (
                    <p style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#DC2626', textAlign: 'center', marginTop: 6, fontWeight: 600, justifyContent: 'center', width: '100%' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <path d="M12 9v4M12 17h.01"/>
                      </svg>
                      Accepte le traitement de ton RDV pour continuer
                    </p>
                  )}
                  <p style={{ fontSize: '0.7rem', color: T.muted, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
                    Tu pourras annuler ou reporter jusqu&apos;à {commercant.rdv_delai_annulation_heures || 24}h avant le RDV.
                  </p>
                </div>
              )}

              {/* ─── ÉTAPE 4 - CONFIRMATION "Ton RDV est Yoppé ! 🟣" ─── */}
              {etape === 4 && rdvCree && (
                <div style={{ padding: '1.5rem 1rem 2rem', animation: 'fadeUp 0.4s ease' }}>
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    {/* Cercle vert avec check (signature succès Yoppaa, identique confirmation commande) */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #10B981, #6EE7B7)', marginBottom: '0.875rem', boxShadow: '0 8px 28px rgba(16,185,129,0.45), 0 0 0 6px #10B98122' }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 7"/>
                      </svg>
                    </div>
                    {/* Wordmark tricolore canonique fond clair */}
                    <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1rem', marginBottom: 4, letterSpacing: '-0.05em', lineHeight: 1 }}>
                      <span style={{ color: T.ink }}>yo</span>
                      <span style={{ color: T.main }}>pp</span>
                      <span style={{ color: T.mid }}>aa</span>
                    </p>
                    {rdvCree.numero_rdv && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '6px 20px', marginBottom: 12, boxShadow: `0 4px 16px ${T.main}44` }}>
                        <span style={{ fontWeight: 900, fontSize: '1.4rem', color: '#fff', letterSpacing: '-0.5px' }}>#{rdvCree.numero_rdv}</span>
                      </div>
                    )}
                    <h2 style={{ fontWeight: 900, fontSize: '1.7rem', color: T.ink, marginBottom: '0.5rem', letterSpacing: '-0.75px' }}>Ton RDV est Yoppé ! 🟣</h2>
                    <p style={{ color: T.deep, fontWeight: 700, marginBottom: '0.25rem' }}>Chez {commercant.nom}</p>
                    <p style={{ color: T.muted, fontSize: '0.875rem' }}>
                      {JOURS_LONGS[dateChoisie.getDay()]} {dateChoisie.getDate()} {MOIS_COURTS[dateChoisie.getMonth()]} à {heureChoisie}
                    </p>
                  </div>

                  {/* Bandeau paiement Stripe reçu - cas _viaStripe (retour Checkout) */}
                  {rdvCree._viaStripe && (
                    <div style={{ background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)', border: '1.5px solid #10B981', borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M2 7h20M6 11h12M9 15h6M11 19h2"/>
                        <circle cx="12" cy="12" r="10" opacity="0"/>
                      </svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 800, fontSize: '0.88rem', color: '#065F46', margin: 0, marginBottom: 2 }}>
                          Acompte payé · paiement sécurisé Stripe
                        </p>
                        <p style={{ fontSize: '0.76rem', color: '#047857', lineHeight: 1.4, margin: 0 }}>
                          Ton RDV est confirmé. Tu vas recevoir l&apos;email de confirmation et le reçu de paiement d&apos;ici quelques secondes.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Card "Et après ?" */}
                  <div style={{ background: `linear-gradient(135deg, ${T.pale}, #fff)`, borderRadius: 20, overflow: 'hidden', marginBottom: '1rem', border: `1.5px solid ${T.main}22` }}>
                    <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                    <div style={{ padding: '1.25rem' }}>
                      <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: T.ink, marginBottom: 12, fontSize: '1rem' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 8v4l3 3"/>
                        </svg>
                        Et après&nbsp;?
                      </p>
                      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                          { n: 1, t: <>Tu reçois un email de confirmation avec ton RDV ajoutable à ton calendrier (iCal).</> },
                          { n: 2, t: <>Tu te rends chez <strong>{commercant.nom}</strong> à ton créneau ({heureChoisie}).</> },
                          { n: 3, t: <>Tu peux annuler ou reporter depuis ton espace Yoppaa jusqu&apos;à {commercant.rdv_delai_annulation_heures || 24}h avant.</> },
                        ].map(s => (
                          <li key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.85rem', color: T.deep, lineHeight: 1.5 }}>
                            <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 900, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, boxShadow: `0 2px 6px ${T.main}33` }}>{s.n}</span>
                            <span style={{ paddingTop: 2 }}>{s.t}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  {/* Récap RDV details */}
                  <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${T.pale}`, padding: '1rem 1.125rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${T.pale}` }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prestation</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: T.ink, textAlign: 'right', maxWidth: '60%' }}>{prestationChoisie.nom}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${T.pale}` }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Durée</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: T.ink }}>{formatDuree(prestationChoisie.duree_minutes)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: rdvCree.acompte_montant ? 8 : 0, paddingBottom: rdvCree.acompte_montant ? 8 : 0, borderBottom: rdvCree.acompte_montant ? `1px solid ${T.pale}` : 'none' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prix estimé</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 900, color: T.main }}>{formatPrix(prestationChoisie)}</span>
                    </div>
                    {rdvCree.acompte_montant && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Acompte</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: rdvCree._viaStripe ? '#059669' : T.deep }}>
                          {Number(rdvCree.acompte_montant).toFixed(2)} € {rdvCree._viaStripe ? '✓ payé en ligne' : 'sur place'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* CTA invite : creation de compte post-RDV (apres la confirmation, pas pendant le flow).
                      Pre-remplit email/prenom/nom via query params pour reduire encore la friction. */}
                  {!yopperConnecte && (
                    <div style={{ background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 100%)`, borderRadius: 16, padding: '1rem 1.125rem', marginBottom: '1rem', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.main}55 0%, transparent 55%)`, pointerEvents: 'none' }}/>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                            <path d="M2 17l10 5 10-5"/>
                            <path d="M2 12l10 5 10-5"/>
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.95rem', fontWeight: 900, color: '#fff', margin: 0, marginBottom: 4, letterSpacing: '-0.3px' }}>
                            Suis ce RDV depuis ton espace 🟣
                          </p>
                          <p style={{ fontSize: '0.78rem', color: T.light, lineHeight: 1.45, margin: 0, marginBottom: 10, opacity: 0.95 }}>
                            Crée ton compte Yopper en 30s pour annuler/reporter, suivre tes prochains RDV et retrouver tes favoris.
                          </p>
                          <button onClick={() => router.push(`/commander/auth?redirect=/commander`)}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0.625rem 1.125rem', background: '#fff', color: T.main, border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
                            Créer mon compte Yopper
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <button onClick={() => router.push('/commander')}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '0.875rem', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 6px 24px ${T.main}55`, marginBottom: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                    </svg>
                    Retour à l&apos;accueil
                  </button>
                  <button onClick={() => {
                    setPrestationChoisie(null); setDateChoisie(null); setHeureChoisie(null)
                    setClient(p => ({ ...p, notes: '' }))
                    setRgpdCommande(false); setRgpdMarketing(true)
                    setRdvCree(null); setSubmitError(null)
                    allerEtape(1)
                  }}
                    style={{ width: '100%', padding: '0.875rem', background: 'transparent', color: T.main, border: `1.5px solid ${T.main}`, borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif' }}>
                    Prendre un autre RDV chez {commercant.nom}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── MODALE DÉTAIL DEAL (même pattern que la fiche commerce) ─── */}
      {dealDetailOuvert && (
        <div onClick={() => setDealDetailOuvert(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeUp 0.2s ease' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 22, maxWidth: 440, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.35)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

            {/* Photo hero enrichie si dispo, sinon en-tête violet fallback */}
            {dealDetailOuvert.photo_url ? (
              <div style={{ position: 'relative', width: '100%', paddingTop: '62%', background: T.pale, flexShrink: 0 }}>
                <img src={dealDetailOuvert.photo_url} alt={dealDetailOuvert.titre}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(22,6,54,0.35) 0%, transparent 30%, transparent 65%, rgba(22,6,54,0.55) 100%)' }}/>
                <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '1.2px', background: 'rgba(22,6,54,0.65)', padding: '4px 10px', borderRadius: 100, backdropFilter: 'blur(8px)', display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
                    <Flame size={11} strokeWidth={2.2}/> Deal
                  </span>
                  {dealDetailOuvert.est_bonne_affaire && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#7C2D12', textTransform: 'uppercase', letterSpacing: '1.2px', background: 'rgba(252,211,77,0.95)', padding: '4px 10px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                      <Star size={11} strokeWidth={2.5}/> Bonne affaire
                    </span>
                  )}
                </div>
                <button onClick={() => setDealDetailOuvert(null)} aria-label="Fermer"
                  style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(22,6,54,0.65)', backdropFilter: 'blur(8px)', border: 'none', borderRadius: '50%', width: 34, height: 34, color: '#fff', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 20px', color: '#fff' }}>
                  <h2 style={{ fontWeight: 900, fontSize: '1.35rem', color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                    {dealDetailOuvert.titre}
                  </h2>
                  {dealDetailOuvert.remise_pct ? (
                    <span style={{ display: 'inline-block', fontWeight: 900, fontSize: '1.6rem', color: '#fff', letterSpacing: '-0.5px', textShadow: '0 2px 8px rgba(0,0,0,0.5)', marginTop: 8 }}>-{dealDetailOuvert.remise_pct}%</span>
                  ) : dealDetailOuvert.prix_deal ? (
                    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                      <span style={{ fontWeight: 900, fontSize: '1.6rem', color: '#fff', letterSpacing: '-0.5px', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{Number(dealDetailOuvert.prix_deal).toFixed(2)}€</span>
                      {dealDetailOuvert.prix_original && (
                        <span style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.75)', textDecoration: 'line-through', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{Number(dealDetailOuvert.prix_original).toFixed(2)}€</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, padding: '20px 22px 24px', color: '#fff', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.2px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 100, border: '1px solid rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Flame size={11} strokeWidth={2}/> Deal</span>
                    {dealDetailOuvert.est_bonne_affaire && (
                      <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#7C2D12', textTransform: 'uppercase', letterSpacing: '1.2px', background: '#FCD34D', padding: '4px 10px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Star size={11} strokeWidth={2.2}/> Bonne affaire</span>
                    )}
                  </div>
                  <button onClick={() => setDealDetailOuvert(null)} aria-label="Fermer"
                    style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 30, height: 30, color: '#fff', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
                <h2 style={{ fontWeight: 900, fontSize: '1.35rem', color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, margin: 0 }}>
                  {dealDetailOuvert.titre}
                </h2>
                {dealDetailOuvert.remise_pct ? (
                  <span style={{ display: 'inline-block', fontWeight: 900, fontSize: '1.6rem', color: T.light, letterSpacing: '-0.5px', marginTop: 12, background: 'rgba(255,255,255,0.1)', padding: '8px 14px', borderRadius: 12 }}>-{dealDetailOuvert.remise_pct}%</span>
                ) : dealDetailOuvert.prix_deal ? (
                  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, marginTop: 12, background: 'rgba(255,255,255,0.1)', padding: '8px 14px', borderRadius: 12 }}>
                    <span style={{ fontWeight: 900, fontSize: '1.6rem', color: T.light, letterSpacing: '-0.5px' }}>{Number(dealDetailOuvert.prix_deal).toFixed(2)}€</span>
                    {dealDetailOuvert.prix_original && (
                      <span style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.5)', textDecoration: 'line-through' }}>{Number(dealDetailOuvert.prix_original).toFixed(2)}€</span>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Corps blanc scrollable */}
            <div style={{ padding: '18px 22px 22px', overflowY: 'auto', flex: 1 }}>
              {dealDetailOuvert.description && (
                <p style={{ fontSize: '0.9rem', color: T.ink, lineHeight: 1.55, margin: '0 0 14px', fontWeight: 600 }}>
                  {dealDetailOuvert.description}
                </p>
              )}
              {dealDetailOuvert.description_longue && (
                <div style={{ fontSize: '0.88rem', color: T.deep, lineHeight: 1.65, margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>
                  {dealDetailOuvert.description_longue}
                </div>
              )}
              {dealDetailOuvert.date_deal && (
                <p style={{ fontSize: '0.78rem', color: T.muted, fontWeight: 600, margin: '0 0 6px' }}>
                  <Calendar size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Valable le {new Date(dealDetailOuvert.date_deal + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              )}

              {/* CTA « Appeler pour réserver » si activé par le commerçant */}
              {dealDetailOuvert.cta_appeler_reserver && commercant?.telephone ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  <a href={`tel:${commercant.telephone}`}
                    onClick={() => trackDeal(dealDetailOuvert.id, 'cta_click')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.95rem', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 6px 20px ${T.main}55`, textDecoration: 'none' }}>
                    <Phone size={16} strokeWidth={2.4}/>
                    Appeler pour réserver
                  </a>
                  <button onClick={() => setDealDetailOuvert(null)}
                    style={{ width: '100%', padding: '0.7rem', border: `1.5px solid ${T.pale}`, borderRadius: 100, background: '#fff', color: T.muted, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    Fermer
                  </button>
                </div>
              ) : (
                <button onClick={() => setDealDetailOuvert(null)}
                  style={{ width: '100%', marginTop: 14, padding: '0.875rem', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 16px ${T.main}55` }}>
                  Compris
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
