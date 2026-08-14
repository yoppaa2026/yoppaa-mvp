'use client'
// Composant AgendaRdv : grille hebdomadaire des RDV pour le dashboard commerçant vitrine.
// Desktop (≥768px) : 7 colonnes (semaine glissante à partir d'aujourd'hui), scroll vertical interne sur les heures.
// Mobile (<768px) : vue 1 jour avec navigation prev/next, swipe pas implémenté en V1.
//
// Cellules :
//  - Libre : blanc, cliquable -> onNouveauRdv(date, heure)
//  - Pause / Fermé : grisé, non cliquable
//  - RDV : bloc colore en absolute positioning, cliquable -> onSelectRdv(rdv). Hauteur = durée / 30min.
//
// Props :
//  - rdvs : tableau de rdv_reservations (avec prestation jointe)
//  - creneaux : tableau rdv_creneaux (pour pauses)
//  - horairesDetail : objet jsonb du commercant (horaires shop)
//  - onSelectRdv(rdv) : callback au clic sur un bloc RDV existant
//  - onNouveauRdv(date, heure) : callback au clic sur un slot libre

import { useState, useMemo, useEffect, Fragment } from 'react'
import BandeDefilante from '@/app/components/BandeDefilante'
import { couleurRdv, COULEUR_DEFAUT } from '@/lib/agenda-couleurs'
import { blocsAgenda } from '@/lib/cours-collectifs'
import { contenuBlocRdv } from '@/lib/agenda-bloc'

const T = {
  bg:      '#F8F6FF',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

const JOURS_KEY  = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']  // index lundi=0
const JOURS_CRT  = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
const JOURS_LONG = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']
const MOIS_CRT   = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc']

// Ce qu'on écrit sur la pastille d'un rendez-vous passé. Les libellés du
// tableau de bord vivent dans `page.js` avec leurs couleurs et leurs actions :
// ici on n'a besoin que du mot, et le recopier évite d'exporter une structure
// entière pour trois caractères.
const LIBELLES_STATUT = {
  confirme: 'Confirmé',
  honore: 'Honoré',
  no_show: 'No-show',
  annule_client: 'Annulé par le client',
  annule_commercant: 'Annulé',
}

const PAS_MINUTES = 30      // granularité grille
const HAUTEUR_CELLULE = 32  // hauteur d'une cellule 30min en pixels
const LARGEUR_HEURES  = 56  // largeur de la colonne labels heures à gauche

function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Index lundi-base (lun=0, dim=6) à partir de Date.getDay (dim=0, sam=6)
function jourIdxLun(d) { return (d.getDay() + 6) % 7 }

// Couleurs par statut (parallèle à STATUTS_RDV du dashboard)
// ⚠️ LES COULEURS VIVENT DÉSORMAIS DANS `lib/agenda-couleurs.js`, parce que le
// bloc prend la couleur DU PRATICIEN et non plus celle du statut. Tous les
// rendez-vous confirmés étaient du même violet : la couleur choisie pour Carole
// ne servait qu'à une pastille de douze pixels, et dans un salon à trois
// praticiennes il fallait lire les initiales une par une.
//
// La logique est sortie d'ici pour être testable : le calcul du contraste du
// texte, en particulier, décide de la lisibilité de tout l'écran.

export default function AgendaRdv({ rdvs, creneaux, praticiens = [], horairesDetail, onSelectRdv, onNouveauRdv }) {
  // Filtre praticien : 'all' = tous les praticiens, ou un praticien_id specifique.
  // Sess 5f : le commercant multi-prat peut isoler l'agenda d'un praticien pour
  // voir uniquement les RDV pris avec lui/elle.
  const [praticienFiltre, setPraticienFiltre] = useState('all')
  // Le cours dont on regarde la liste des inscrits. Un cours n'ouvre pas la
  // fiche d'un rendez-vous, il ouvre SA LISTE : c'est de là qu'on choisit
  // ensuite la personne dont on veut le détail.
  const [seanceOuverte, setSeanceOuverte] = useState(null)
  // refDate : 1er jour visible. Sur desktop = aujourd'hui (vue semaine glissante).
  // Sur mobile = jour actif (vue 1 jour avec nav prev/next).
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const [refDate, setRefDate] = useState(today)
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 768 : true)

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Vue Jour / Semaine : par défaut on suit la taille d'écran (semaine sur
  // desktop, jour sur mobile), mais le commerçant peut forcer l'autre vue
  // (demande Alex 01/08). En semaine sur petit écran, la grille défile
  // horizontalement avec des colonnes de largeur minimale.
  const [vueForcee, setVueForcee] = useState(null)   // null = auto | 'jour' | 'semaine'
  // ⚠️ L'HISTORIQUE MANQUAIT TOUT ENTIER. Naviguer semaine par semaine permet de
  // retrouver un rendez-vous quand on sait quand il a eu lieu ; ça ne remplace
  // pas la question réelle du commerçant, « qu'est-ce que j'ai oublié de
  // clôturer ? ». Cette vue répond à celle-là : tous les rendez-vous passés,
  // du plus récent au plus ancien, et ceux qui traînent encore en « confirmé »
  // remontent en premier.
  const [historique, setHistorique] = useState(false)
  const vueSemaine = vueForcee ? vueForcee === 'semaine' : isDesktop
  const nbJours = vueSemaine ? 7 : 1
  const scrollH = vueSemaine && !isDesktop           // besoin d'un défilement horizontal ?

  // Construction des jours affichés (refDate + n)
  const joursAffiches = useMemo(() => {
    const out = []
    for (let i = 0; i < nbJours; i++) {
      const d = new Date(refDate)
      d.setDate(refDate.getDate() + i)
      out.push({
        date: d,
        iso: isoDate(d),
        keyJour: JOURS_KEY[jourIdxLun(d)],
        labelCourt: JOURS_CRT[jourIdxLun(d)],
        labelLong: JOURS_LONG[jourIdxLun(d)],
        numero: d.getDate(),
        mois: d.getMonth(),
        isToday: d.getTime() === today.getTime(),
      })
    }
    return out
  }, [refDate, nbJours, today])

  // Enveloppe horaire : du plus tôt ouvert dans la fenêtre au plus tard. Fallback 9-18.
  const { heureMin, heureMax } = useMemo(() => {
    let min = 24 * 60, max = 0
    joursAffiches.forEach(j => {
      const h = horairesDetail?.[j.keyJour]
      if (h?.ouvert && h?.debut && h?.fin) {
        min = Math.min(min, timeToMinutes(h.debut))
        max = Math.max(max, timeToMinutes(h.fin))
        // Horaires à pause : la 2e plage étend la fenêtre affichée (ex. soir 18-22)
        if (h.debut2 && h.fin2) {
          min = Math.min(min, timeToMinutes(h.debut2))
          max = Math.max(max, timeToMinutes(h.fin2))
        }
      }
    })
    if (min === 24 * 60) { min = 9 * 60; max = 18 * 60 }
    // Aligne au pas (ex: 9h00, 9h30, etc.)
    min = Math.floor(min / PAS_MINUTES) * PAS_MINUTES
    max = Math.ceil(max / PAS_MINUTES) * PAS_MINUTES
    return { heureMin: min, heureMax: max }
  }, [joursAffiches, horairesDetail])

  // Lignes de slots 30min
  const slotsTimes = useMemo(() => {
    const out = []
    for (let t = heureMin; t < heureMax; t += PAS_MINUTES) out.push(t)
    return out
  }, [heureMin, heureMax])

  // État d'une cellule jour×slot : 'ferme' | 'pause' | 'libre'
  function getSlotState(jour, slotMin) {
    const h = horairesDetail?.[jour.keyJour]
    if (!h?.ouvert || !h?.debut || !h?.fin) return 'ferme'
    // Plages du jour (1 ou 2 avec les horaires à pause debut2/fin2)
    const plages = [[timeToMinutes(h.debut), timeToMinutes(h.fin)]]
    if (h.debut2 && h.fin2) plages.push([timeToMinutes(h.debut2), timeToMinutes(h.fin2)])
    if (!plages.some(([a, b]) => slotMin >= a && slotMin < b)) {
      // Entre deux plages shop → affiché comme pause (plutôt que fermé)
      return plages.length > 1 && slotMin >= plages[0][1] && slotMin < plages[1][0] ? 'pause' : 'ferme'
    }
    const creneauxJour = (creneaux || []).filter(c =>
      c.actif !== false
      && (c.date_specifique === jour.iso || (!c.date_specifique && c.jour_semaine === jour.keyJour))
    )
    for (const cr of creneauxJour) {
      if (cr.pause_debut && cr.pause_fin) {
        const pDebut = timeToMinutes(cr.pause_debut)
        const pFin = timeToMinutes(cr.pause_fin)
        if (slotMin >= pDebut && slotMin < pFin) return 'pause'
      }
    }
    return 'libre'
  }

  // RDVs visibles dans la fenêtre (exclut annulés, garde confirme + honore pour visibilité)
  // + filtre praticien si actif (Sess 5f)
  const rdvsVisibles = useMemo(() =>
    (rdvs || [])
      .filter(r => ['confirme', 'honore', 'no_show'].includes(r.statut))
      .filter(r => praticienFiltre === 'all' || r.praticien_id === praticienFiltre)
  , [rdvs, praticienFiltre])

  // RDVs par jour (indexé par iso)
  const rdvsParJour = useMemo(() => {
    const m = {}
    joursAffiches.forEach(j => {
      m[j.iso] = rdvsVisibles
        .filter(r => r.date_rdv === j.iso)
        .sort((a, b) => (a.heure_debut || '').localeCompare(b.heure_debut || ''))
    })
    return m
  }, [joursAffiches, rdvsVisibles])

  // ─── L'HISTORIQUE ─────────────────────────────────────────────────────────
  //
  // Tout ce qui est déjà passé, annulations comprises. Naviguer semaine par
  // semaine permet de retrouver un rendez-vous quand on sait quand il a eu lieu ;
  // ça ne répond pas à la vraie question du commerçant, « qu'ai-je oublié de
  // clôturer ? ».
  //
  // ⚠️ LES RENDEZ-VOUS RESTÉS « CONFIRMÉ » ALORS QUE LEUR DATE EST PASSÉE
  // REMONTENT EN PREMIER. Ce sont les seuls sur lesquels il reste un geste à
  // faire : marquer honoré, ou constater l'absence. Les trier par date les
  // noierait au milieu de tout le reste.
  const rdvsPasses = useMemo(() => {
    const aujourdhuiIso = isoDate(today)
    const rang = r => (r.statut === 'confirme' ? 0 : 1)
    return (rdvs || [])
      .filter(r => r.date_rdv && r.date_rdv < aujourdhuiIso)
      .filter(r => praticienFiltre === 'all' || r.praticien_id === praticienFiltre)
      .sort((a, b) =>
        rang(a) - rang(b)
        || String(b.date_rdv).localeCompare(String(a.date_rdv))
        || String(b.heure_debut || '').localeCompare(String(a.heure_debut || '')))
  }, [rdvs, praticienFiltre, today])

  const aClore = rdvsPasses.filter(r => r.statut === 'confirme').length

  // Navigation
  //
  // ⚠️ LE PASSÉ ÉTAIT INTERDIT, et c'était un verrou volontaire, commenté
  // « pas de navigation dans le passe pour MVP ». Un agenda qui ne remonte pas
  // est pourtant inutilisable au quotidien : le commerçant qui a oublié de
  // marquer un rendez-vous honoré la veille n'avait AUCUN moyen d'y revenir,
  // alors que ses commandes, elles, ont leur historique depuis le début.
  function decaler(jours) {
    const d = new Date(refDate)
    d.setDate(refDate.getDate() + jours)
    setRefDate(d)
  }
  function allerAujourdhui() { setRefDate(today); setHistorique(false) }

  // Label du header navigation
  const headerLabel = vueSemaine
    ? (() => {
        const last = joursAffiches[joursAffiches.length - 1]
        const sameM = refDate.getMonth() === last.date.getMonth()
        return sameM
          ? `${refDate.getDate()} – ${last.numero} ${MOIS_CRT[last.mois]}`
          : `${refDate.getDate()} ${MOIS_CRT[refDate.getMonth()]} – ${last.numero} ${MOIS_CRT[last.mois]}`
      })()
    : `${joursAffiches[0].labelLong} ${joursAffiches[0].numero} ${MOIS_CRT[joursAffiches[0].mois]}`

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${T.pale}`, overflow: 'hidden', fontFamily: '"DM Sans", sans-serif' }}>

      {/* Header navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.875rem', borderBottom: `1px solid ${T.pale}`, gap: 8 }}>
        <button onClick={() => decaler(-nbJours)}
          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.pale}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.main }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 800, color: T.ink, margin: 0, letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {headerLabel}
          </p>
          {refDate.getTime() !== today.getTime() && (
            <button onClick={allerAujourdhui}
              style={{ background: 'none', border: 'none', color: T.main, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', marginTop: 2, padding: 0, fontFamily: '"DM Sans", sans-serif' }}>
              ↪ Aujourd'hui
            </button>
          )}
        </div>
        <button onClick={() => decaler(nbJours)}
          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.pale}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.main }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>

        {/* Bascule Jour / Semaine */}
        <div style={{ display: 'flex', gap: 2, background: T.bg, borderRadius: 100, padding: 2, flexShrink: 0 }}>
          {[{ v: 'jour', label: 'Jour' }, { v: 'semaine', label: 'Semaine' }].map(opt => {
            const sel = (opt.v === 'semaine') === vueSemaine
            return (
              <button key={opt.v} onClick={() => setVueForcee(opt.v)}
                style={{ padding: '5px 10px', borderRadius: 100, border: 'none', background: sel ? T.main : 'transparent', color: sel ? '#fff' : T.muted, fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filtre praticien — affiché uniquement si ≥2 praticiens sur ce commerce */}
      {praticiens.length >= 2 && (
        <BandeDefilante libelle="les praticiens" style={{ display: 'flex', gap: 5, padding: '8px 0.875rem', overflowX: 'auto', borderBottom: `1px solid ${T.pale}`, scrollbarWidth: 'none' }}>
          <button onClick={() => setPraticienFiltre('all')}
            style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 100, border: `1.5px solid ${praticienFiltre === 'all' ? T.main : T.pale}`, background: praticienFiltre === 'all' ? T.pale : '#fff', color: praticienFiltre === 'all' ? T.main : T.muted, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            Tous
          </button>
          {praticiens.map(p => {
            const actif = praticienFiltre === p.id
            const initiales = `${(p.prenom?.[0] || '').toUpperCase()}${(p.nom?.[0] || '').toUpperCase()}`
            return (
              <button key={p.id} onClick={() => setPraticienFiltre(p.id)}
                style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px 4px 4px', borderRadius: 100, border: `1.5px solid ${actif ? (p.couleur_hex || T.main) : T.pale}`, background: actif ? `${p.couleur_hex || T.main}18` : '#fff', color: actif ? T.ink : T.muted, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: p.couleur_hex || T.main, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 9, overflow: 'hidden' }}>
                  {p.photo_url ? <img src={p.photo_url} alt={p.prenom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : (initiales || '?')}
                </span>
                {p.prenom}
              </button>
            )
          })}
        </BandeDefilante>
      )}

      {/* ⚠️ L'ACCÈS À L'HISTORIQUE EST UNE BANDE À PART, pas un bouton de plus
          dans l'en-tête. Celui-ci porte déjà deux flèches, un libellé et la
          bascule Jour/Semaine : un cinquième élément y aurait débordé sur
          téléphone, exactement comme la cloche du tableau de bord. */}
      <button onClick={() => setHistorique(h => !h)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0.875rem', border: 'none', borderBottom: `1px solid ${T.pale}`, background: historique ? T.pale : '#fff', color: historique ? T.main : T.muted, fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
        {historique ? (
          <>← Revenir à l&rsquo;agenda</>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
            </svg>
            Historique
            {aClore > 0 && (
              <span style={{ background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 100 }}>
                {aClore} à clôturer
              </span>
            )}
          </>
        )}
      </button>

      {/* L'historique : une liste, pas une grille. On ne cherche pas un horaire
          libre dans le passé, on cherche un rendez-vous. */}
      {historique && (
        <div style={{ maxHeight: '70vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0.625rem 0.875rem' }}>
          {rdvsPasses.length === 0 && (
            <p style={{ textAlign: 'center', color: T.muted, fontSize: '0.82rem', padding: '2rem 0', margin: 0 }}>
              Aucun rendez-vous passé pour le moment.
            </p>
          )}
          {rdvsPasses.map(r => {
            // ⚠️ `couleurRdv` ne connaît qu'un seul « annule », là où la base en
            // distingue deux selon qui a annulé. Sans cette normalisation, un
            // rendez-vous annulé reprenait la couleur de sa praticienne et se
            // confondait avec la journée à faire.
            const c = couleurRdv({
              statut: String(r.statut || '').startsWith('annule') ? 'annule' : r.statut,
              couleurPraticien: r.praticien?.couleur_hex,
            })
            const d = new Date(`${r.date_rdv}T12:00:00`)
            const aFaire = r.statut === 'confirme'
            return (
              <button key={r.id} onClick={() => onSelectRdv && onSelectRdv(r)}
                style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0.625rem', marginBottom: 6, borderRadius: 10, border: `1.5px solid ${aFaire ? '#FCA5A5' : T.pale}`, background: aFaire ? '#FEF2F2' : '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                <span style={{ width: 6, alignSelf: 'stretch', borderRadius: 100, background: c.bg || COULEUR_DEFAUT, flexShrink: 0 }}/>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[r.client_prenom, r.client_nom].filter(Boolean).join(' ') || 'Client'}
                    {r.prestation?.nom ? ` · ${r.prestation.nom}` : ''}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: T.muted, marginTop: 1 }}>
                    {JOURS_CRT[jourIdxLun(d)]} {d.getDate()} {MOIS_CRT[d.getMonth()]}
                    {r.heure_debut ? ` · ${r.heure_debut.slice(0, 5)}` : ''}
                    {r.praticien?.prenom ? ` · ${r.praticien.prenom}` : ''}
                  </span>
                </span>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 100, whiteSpace: 'nowrap', flexShrink: 0, background: aFaire ? '#DC2626' : T.bg, color: aFaire ? '#fff' : T.muted }}>
                  {aFaire ? 'À clôturer' : (LIBELLES_STATUT[r.statut] || r.statut)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Grille agenda — scroll vertical interne (+ horizontal en vue semaine
          sur petit écran : 7 colonnes ne tiennent pas dans 375 px) */}
      <div style={{ display: historique ? 'none' : undefined, maxHeight: '70vh', overflowY: 'auto', overflowX: scrollH ? 'auto' : 'hidden', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${LARGEUR_HEURES}px repeat(${nbJours}, ${scrollH ? 'minmax(96px, 1fr)' : '1fr'})`, position: 'relative', minWidth: scrollH ? LARGEUR_HEURES + 7 * 96 : undefined }}>

          {/* Header jours (sticky top dans le scroll) */}
          <div style={{ position: 'sticky', top: 0, zIndex: 3, background: '#fff', borderBottom: `1.5px solid ${T.pale}` }}/>
          {joursAffiches.map(j => (
            <div key={`h-${j.iso}`} style={{ position: 'sticky', top: 0, zIndex: 3, background: j.isToday ? T.pale : '#fff', borderBottom: `1.5px solid ${T.pale}`, padding: '8px 4px', textAlign: 'center', borderLeft: `1px solid ${T.pale}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: j.isToday ? T.main : T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{j.labelCourt}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: j.isToday ? T.main : T.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>{j.numero}</div>
            </div>
          ))}

          {/* Lignes slots × jours */}
          {slotsTimes.map(slotMin => (
            <Fragment key={`row-${slotMin}`}>
              {/* Label heure */}
              <div style={{
                height: HAUTEUR_CELLULE,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                paddingRight: 6, paddingTop: slotMin % 60 === 0 ? 2 : 0,
                fontSize: 10, color: T.muted, fontWeight: 600,
                borderBottom: slotMin % 60 === 30 ? `1px solid ${T.pale}` : `1px dashed ${T.pale}88`,
              }}>
                {slotMin % 60 === 0 ? minutesToTime(slotMin) : ''}
              </div>
              {/* Cellules jour x slot */}
              {joursAffiches.map(j => {
                const state = getSlotState(j, slotMin)
                const rdvsDuJour = rdvsParJour[j.iso] || []
                // Un RDV est rendu SUR sa cellule de départ uniquement (positionnement absolu, hauteur = durée).
                const rdvsCommencantIci = rdvsDuJour.filter(r => timeToMinutes(r.heure_debut) === slotMin)
                // Détecte si cette cellule est COUVERTE par un RDV qui a démarré plus tôt (pour ne pas la rendre clicable)
                const couvert = rdvsDuJour.some(r => {
                  const debut = timeToMinutes(r.heure_debut)
                  const fin   = timeToMinutes(r.heure_fin)
                  return debut < slotMin && fin > slotMin
                })

                const peutCreer = state === 'libre' && !couvert && rdvsCommencantIci.length === 0

                const bgCellule = state === 'ferme'
                  ? '#F3F4F6'
                  : state === 'pause'
                    ? '#FFFBEB'
                    : peutCreer ? '#fff' : '#FAFAFA'

                return (
                  <div key={`${j.iso}-${slotMin}`}
                    onClick={peutCreer ? () => onNouveauRdv && onNouveauRdv(j.date, minutesToTime(slotMin)) : undefined}
                    style={{
                      position: 'relative',
                      height: HAUTEUR_CELLULE,
                      background: bgCellule,
                      borderLeft: `1px solid ${T.pale}`,
                      borderBottom: slotMin % 60 === 30 ? `1px solid ${T.pale}` : `1px dashed ${T.pale}88`,
                      cursor: peutCreer ? 'pointer' : 'default',
                      transition: 'background 0.1s',
                    }}
                    onMouseOver={peutCreer ? (e) => e.currentTarget.style.background = T.pale + '66' : undefined}
                    onMouseOut={peutCreer ? (e) => e.currentTarget.style.background = bgCellule : undefined}
                    title={state === 'ferme' ? 'Fermé' : state === 'pause' ? 'Pause' : peutCreer ? 'Ajouter un RDV ici' : ''}>

                    {/* ⚠️ UN COURS COMPTE POUR UN BLOC, PAS POUR DOUZE. Les
                        blocs sont placés en position absolue sur leur heure de
                        début : douze inscrits au même cours se seraient
                        empilés exactement l'un sur l'autre, et le commerçant
                        n'aurait vu qu'un seul nom, celui du dernier rendu.
                        Le regroupement se lit sur `capacite_creneau`, gravé
                        dans la réservation : aucune jointure nécessaire. */}
                    {blocsAgenda(rdvsCommencantIci).filter(b => b.type === 'seance').map(seance => {
                      const dureeM = (timeToMinutes(seance.heure_fin) - timeToMinutes(seance.heure_debut)) || PAS_MINUTES
                      const hauteur = (dureeM / PAS_MINUTES) * HAUTEUR_CELLULE - 2
                      const premier = seance.inscrits[0]
                      const couleurs = couleurRdv({ statut: premier?.statut, couleurPraticien: premier?.praticien?.couleur_hex })
                      const nom = premier?.prestation?.nom || 'Cours'
                      const complet = seance.inscrits.length >= seance.capacite
                      return (
                        <div key={seance.cle}
                          onClick={(e) => { e.stopPropagation(); setSeanceOuverte(seance) }}
                          title={`${seance.heure_debut?.slice(0, 5)}–${seance.heure_fin?.slice(0, 5)} · ${nom} · ${seance.inscrits.length} inscrit${seance.inscrits.length > 1 ? 's' : ''} sur ${seance.capacite}`}
                          style={{
                            position: 'absolute', top: 1, left: 2, right: 2, height: hauteur,
                            background: couleurs.bg, color: couleurs.text,
                            borderRadius: 6, padding: '3px 5px', fontSize: 10, fontWeight: 700,
                            cursor: 'pointer', overflow: 'hidden',
                            boxShadow: `0 2px 6px ${couleurs.border}44`,
                            border: `1px solid ${couleurs.border}`,
                            zIndex: 2, display: 'flex', flexDirection: 'column', gap: 1,
                          }}>
                          <div style={{ fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {nom}
                          </div>
                          {/* La jauge, qui est TOUTE l'information utile d'un
                              coup d'œil : combien de personnes viennent, et
                              reste-t-il de la place. */}
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, opacity: 0.92 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                            </svg>
                            {seance.inscrits.length}/{seance.capacite}{complet ? ' · complet' : ''}
                          </div>
                        </div>
                      )
                    })}

                    {/* Render RDV blocks sur la cellule de depart uniquement */}
                    {blocsAgenda(rdvsCommencantIci).filter(b => b.type === 'rdv').map(b => b.rdv).map(r => {
                      const dureeM = (timeToMinutes(r.heure_fin) - timeToMinutes(r.heure_debut)) || PAS_MINUTES
                      const hauteur = (dureeM / PAS_MINUTES) * HAUTEUR_CELLULE - 2  // -2 pour respiration
                      const couleurs = couleurRdv({ statut: r.statut, couleurPraticien: r.praticien?.couleur_hex })
                      const heureD = r.heure_debut?.slice(0,5)
                      const heureF = r.heure_fin?.slice(0,5)
                      const contenu = contenuBlocRdv({ hauteur, rdv: r, praticienFiltre })
                      return (
                        <div key={r.id}
                          onClick={(e) => { e.stopPropagation(); if (onSelectRdv) onSelectRdv(r) }}
                          style={{
                            position: 'absolute',
                            top: 1, left: 2, right: 2,
                            height: hauteur,
                            background: couleurs.bg,
                            color: couleurs.text,
                            borderRadius: 6,
                            padding: '3px 5px',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                            overflow: 'hidden',
                            boxShadow: `0 2px 6px ${couleurs.border}44`,
                            border: `1px solid ${couleurs.border}`,
                            zIndex: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1,
                          }}
                          title={`${heureD}–${heureF} · ${r.client_prenom || ''} ${r.client_nom || ''} · ${r.prestation?.nom || ''}${r.praticien ? ' · avec ' + r.praticien.prenom : ''}${(r.commande?.commande_articles || []).length > 0 ? ' · produits à préparer' : ''}`}>
                          {/* Initiale de la praticienne, en haut à droite.
                              ⚠️ ELLE NE PEUT PLUS ÊTRE UNE PASTILLE DE SA COULEUR :
                              le bloc porte déjà cette couleur, la pastille s'y
                              fondrait et disparaîtrait. Sur un bloc coloré on
                              écrit donc l'initiale à même le fond, dans l'encre
                              lisible calculée ; sur un bloc gris ou rouge (sorti
                              du planning), la pastille colorée reprend son rôle,
                              car c'est le seul rappel de qui tenait le rendez-vous. */}
                          {r.praticien && (couleurs.estPraticien ? (
                            <div style={{ position: 'absolute', top: 2, right: 4, color: couleurs.text, opacity: 0.85, fontSize: 9, fontWeight: 900, lineHeight: 1 }}>
                              {(r.praticien.prenom?.[0] || '').toUpperCase()}
                            </div>
                          ) : (
                            <div style={{ position: 'absolute', top: 2, right: 2, width: 12, height: 12, borderRadius: '50%', background: r.praticien.couleur_hex || COULEUR_DEFAUT, border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 7, fontWeight: 900 }}>
                              {(r.praticien.prenom?.[0] || '').toUpperCase()}
                            </div>
                          ))}
                          {/* Pastille « produits à préparer ». En haut à gauche
                              pour ne pas heurter la pastille praticien, à
                              droite. Le détail se lit en ouvrant le RDV. */}
                          {(r.commande?.commande_articles || []).length > 0 && (
                            <div style={{ position: 'absolute', top: 2, left: 2, width: 12, height: 12, borderRadius: '50%', background: '#10B981', border: '1.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M16 10a4 4 0 0 1-8 0"/>
                              </svg>
                            </div>
                          )}
                          {/* Ce que le bloc écrit se décide dans contenuBlocRdv,
                              hors du composant, pour que le banc puisse l'exécuter
                              et relire ce qui en sort. La règle qu'il applique :
                              sur un bloc court, c'est L'HEURE qui cède sa ligne et
                              se replie sur le prénom, jamais la prestation. */}
                          {contenu.heureSeule ? (
                            <div style={{ fontSize: 9, opacity: 0.9, fontWeight: 600, lineHeight: 1 }}>{contenu.heureSeule}</div>
                          ) : null}
                          <div style={{ fontWeight: 800, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {contenu.titre}
                          </div>
                          <div style={{ fontSize: 9, opacity: 0.85, fontWeight: 600, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {contenu.prestation}
                            </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Legende discrete en bas */}
      <div style={{ display: 'flex', gap: 14, padding: '0.5rem 0.875rem', borderTop: `1px solid ${T.pale}`, fontSize: 10, color: T.muted, fontWeight: 600, flexWrap: 'wrap' }}>
        {/* ⚠️ LA LÉGENDE DIT MAINTENANT LA VRAIE RÈGLE. Elle annonçait « violet =
            confirmé, vert = honoré », alors que la couleur d'un bloc est celle
            de la praticienne qui le tient. Une légende qui décrit un autre
            écran que celui qu'on regarde est pire que pas de légende. */}
        {praticiens.length > 0 ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-flex', gap: 2 }}>
              {praticiens.slice(0, 3).map(p => (
                <span key={p.id} style={{ width: 10, height: 10, borderRadius: 3, background: p.couleur_hex || COULEUR_DEFAUT }}/>
              ))}
            </span>
            Chaque couleur, une praticienne
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: COULEUR_DEFAUT }}/>À venir
          </span>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#FEE2E2', border: '1px solid #DC2626' }}/>Annulé
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#E5E7EB', border: '1px solid #9CA3AF' }}/>Pas venu
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#FFFBEB', border: '1px solid #FDE68A' }}/>Pause
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#F3F4F6' }}/>Fermé
        </span>
        <span style={{ marginLeft: 'auto', color: T.main, fontWeight: 700 }}>
          Tap sur une case blanche pour ajouter un RDV
        </span>
      </div>

      {/* ─── LA LISTE D'UN COURS ────────────────────────────────────────────
          ⚠️ Un cours n'ouvre pas une fiche, il ouvre SA LISTE. Le commerçant a
          besoin de savoir qui vient avant de s'occuper d'une personne en
          particulier, et il ne peut pas le déduire d'un bloc qui n'affiche
          qu'un compteur.

          ⚠️ RENDUE ICI, EN FIN DE COMPOSANT, et non dans la grille : celle-ci
          défile, et sur iOS `-webkit-overflow-scrolling: touch` PIÈGE
          `position: fixed`, l'élément se plaçant alors par rapport au
          conteneur qui défile et non par rapport à l'écran. C'est le défaut
          corrigé le 12/08 sur la modale de détail, il ne doit pas revenir. */}
      {seanceOuverte && (
        <div onClick={() => setSeanceOuverte(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.55)', zIndex: 9998, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', width: '100%', maxWidth: 520, borderRadius: '18px 18px 0 0', padding: '18px 18px 26px', maxHeight: '80svh', overflowY: 'auto' }}>
            <div style={{ width: 38, height: 4, borderRadius: 100, background: T.pale, margin: '0 auto 14px' }}/>
            <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 900, color: T.ink }}>
              {seanceOuverte.inscrits[0]?.prestation?.nom || 'Cours'}
            </p>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: T.muted, fontWeight: 600 }}>
              {seanceOuverte.heure_debut?.slice(0, 5)}–{seanceOuverte.heure_fin?.slice(0, 5)}
              {' · '}{seanceOuverte.inscrits.length} inscrit{seanceOuverte.inscrits.length > 1 ? 's' : ''} sur {seanceOuverte.capacite}
              {seanceOuverte.inscrits.length >= seanceOuverte.capacite ? ' · complet' : ''}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {seanceOuverte.inscrits.map(i => (
                <button key={i.id}
                  onClick={() => { setSeanceOuverte(null); if (onSelectRdv) onSelectRdv(i) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 12, padding: '10px 12px', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: T.pale, color: T.main, fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {i.place_no || 1}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[i.client_prenom, i.client_nom].filter(Boolean).join(' ') || 'Client'}
                      {/* ⚠️ DISTINGUER L'ABONNÉE DE CELLE QUI PAIE À LA SÉANCE.
                          Sur une liste de douze noms identiques, le commerçant
                          n'a aucun moyen de savoir qui a déjà réglé son année
                          et qui doit payer en arrivant. Le lien existe déjà
                          dans la réservation, il ne manquait qu'à le dire. */}
                      {i.abonnement_id && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 900, color: T.main, background: T.pale, borderRadius: 100, padding: '1px 7px', verticalAlign: 'middle' }}>
                          abonnée
                        </span>
                      )}
                    </span>
                    {i.client_telephone && (
                      <span style={{ display: 'block', fontSize: 11.5, color: T.muted, fontWeight: 600 }}>{i.client_telephone}</span>
                    )}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              ))}
            </div>

            <button onClick={() => setSeanceOuverte(null)}
              style={{ width: '100%', marginTop: 14, padding: '11px 14px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.deep, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
