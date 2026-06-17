'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import ConfigDashboard from './ConfigDashboard'
import AgendaRdv from './AgendaRdv'
import ModalNouveauRdv from './ModalNouveauRdv'
import { Reply, ClipboardList } from 'lucide-react'

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
  gris:    { border: '#9CA3AF', badge: '#6B7280', cardBg: '#F9FAFB' },
  rouge:   { border: '#DC2626', badge: '#DC2626', cardBg: '#FFF0F0' },
  orange:  { border: '#EA580C', badge: '#EA580C', cardBg: '#FFF7ED' },
  vert:    { border: '#10B981', badge: '#10B981', cardBg: '#F0FDF4' },
  bleu:    { border: '#2563EB', badge: '#2563EB', cardBg: '#EFF6FF' },
}

const STATUTS = {
  'en_attente':     { label: 'Nouvelle',    couleur: T.rouge,  icon: '●', next: 'en_preparation', nextLabel: 'Démarrer la prépa' },
  'en_preparation': { label: 'En prépa',    couleur: T.orange, icon: '●', next: 'pret',            nextLabel: 'Marquer prête' },
  'pret':           { label: 'Prête',       couleur: T.vert,   icon: '●', next: null,              nextLabel: null },
  'recupere':       { label: 'Récupérée',   couleur: T.bleu,   icon: '🔵', next: null,              nextLabel: null },
  'non_retire':     { label: 'Non retiré',  couleur: { border: '#9CA3AF', badge: '#6B7280', cardBg: '#F9FAFB' }, icon: '⚫', next: null, nextLabel: null },
}

// ─── Helpers dates ────────────────────────────────────────────────────────────
function dateLabel(date) {
  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const d = new Date(date); d.setHours(0,0,0,0)
  if (d.getTime() === today.getTime()) return "Aujourd'hui"
  if (d.getTime() === tomorrow.getTime()) return 'Demain'
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function dateKey(date) {
  if (!date) return ''
  // String date SQL pure YYYY-MM-DD → retourner directement
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  // Timestamp avec timezone → convertir en heure locale Belgique
  const d = new Date(date)
  const offset = d.getTimezoneOffset() * 60000
  const local = new Date(d.getTime() - offset)
  return local.toISOString().slice(0, 10)
}

function getJoursDispos(horizon = 1) {
  const today = new Date(); today.setHours(0,0,0,0)
  const jours = []
  for (let i = 0; i <= horizon; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    jours.push(dateKey(d))
  }
  return jours
}

// FIX NUMÉRO : source unique = numero_commande DB, sans restriction <= 999
function getNumeroJour(commandes, commandeId, jourKey) {
  const duJour = [...commandes]
    .filter(c => dateKey(c.date_commande || c.created_at) === jourKey)
    .sort((a, b) => (a.creneau?.heure_debut || '').localeCompare(b.creneau?.heure_debut || '') || new Date(a.created_at) - new Date(b.created_at))
  const commande = duJour.find(c => c.id === commandeId)
  // Priorité absolue : numero_commande de la DB (même source que le client)
  if (commande?.numero_commande) return commande.numero_commande
  // Fallback : position dans la liste triée du jour
  const idx = duJour.findIndex(c => c.id === commandeId)
  return idx === -1 ? '?' : idx + 1
}

// ─── Notifications système ────────────────────────────────────────────────────
let _notifPermission = 'default'

async function demanderPermissionNotif() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') { _notifPermission = 'granted'; return true }
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  _notifPermission = result
  return result === 'granted'
}

function envoyerNotification(titre, body) {
  // 1. Notification système (son natif du device)
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(titre, {
        body,
        icon: '/icon-pro-192.png',
        badge: '/icon-pro-192.png',
        tag: 'yoppaa-commande',
        renotify: true,
      })
    } catch(e) {}
  }
  // 2. Son audio en fallback
  try {
    const a = new Audio('/sounds/notification.mp3')
    a.volume = 0.7
    a.play().catch(() => {})
  } catch(e) {}
}

function jouerSon() {
  envoyerNotification('Nouvelle commande !', 'Une nouvelle commande vient d\'arriver sur Yoppaa.')
}

// Son distinct pour le retrait client (yop.mp3 — plus court, plus festif)
function jouerSonRetrait() {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('Commande récupérée !', {
        body: 'Le client vient de retirer sa commande.',
        icon: '/icon-pro-192.png',
        tag: 'yoppaa-retrait',
        renotify: true,
      })
    } catch(e) {}
  }
  try {
    const a = new Audio('/sounds/yop.mp3')
    a.volume = 0.8
    a.play().catch(() => {})
  } catch(e) {}
}

// ─── Icônes SVG ───────────────────────────────────────────────────────────────
function IconCommandes({ size = 20, color = '#fff', opacity = 1 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity, flexShrink: 0 }}>
      <rect x="2" y="9" width="20" height="13" rx="3" stroke={color} strokeWidth="2.2" strokeLinejoin="round"/>
      <path d="M2,13 L22,13" stroke={color} strokeWidth="2.2"/>
      <path d="M8,9 L8,5 Q8,2 12,2 Q16,2 16,5 L16,9" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconConfig({ size = 20, color = '#fff', opacity = 1 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity, flexShrink: 0 }}>
      <circle cx="12" cy="12" r="3.5" stroke={color} strokeWidth="2.2"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
function IconBell({ size = 18, color = '#fff', active = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? color : 'none'} style={{ flexShrink: 0 }}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconLogout({ size = 18, color = '#FCA5A5' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconClock({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.2"/>
      <path d="M12 7v5l3 3" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  )
}
function IconRdv({ size = 20, color = '#fff', opacity = 1 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity, flexShrink: 0 }}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" stroke={color} strokeWidth="2.2" strokeLinejoin="round"/>
      <path d="M3 9.5h18" stroke={color} strokeWidth="2.2"/>
      <path d="M8 3v4M16 3v4" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  )
}
function IconPhone({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// Statuts RDV (parallele de STATUTS pour les commandes).
// Vert pour 'honore', rouge pour 'annule' / 'no_show', violet pour 'confirme'.
const STATUTS_RDV = {
  'confirme':  { label: 'Confirmé',    couleur: { border: '#6B35C4', badge: '#6B35C4', cardBg: '#EDE0FF' }, icon: '●', actions: ['honore', 'no_show', 'annule'] },
  'honore':    { label: 'Honoré',      couleur: { border: '#10B981', badge: '#10B981', cardBg: '#F0FDF4' }, icon: '✓', actions: [] },
  'no_show':   { label: 'No-show',     couleur: { border: '#9CA3AF', badge: '#6B7280', cardBg: '#F9FAFB' }, icon: '⊘', actions: ['confirme'] },
  'annule':    { label: 'Annulé',      couleur: { border: '#DC2626', badge: '#DC2626', cardBg: '#FFF0F0' }, icon: '✕', actions: ['confirme'] },
}

const ACTIONS_RDV_LABEL = {
  honore:   { label: 'Marquer honoré',  bg: '#10B981', border: '#10B98144' },
  no_show:  { label: 'No-show',          bg: '#6B7280', border: '#6B728044' },
  annule:   { label: 'Annuler',          bg: '#DC2626', border: '#DC262644' },
  confirme: { label: 'Remettre en confirmé', bg: '#6B35C4', border: '#6B35C444' },
}

// ─── Carte commande ───────────────────────────────────────────────────────────
function CarteCommande({ commande, numero, onChangerStatut, modeHistorique = false }) {
  const statut = STATUTS[commande.statut] || STATUTS['en_attente']
  const { couleur } = statut
  const heure = commande.creneau
    ? `${commande.creneau.heure_debut.slice(0,5)} – ${commande.creneau.heure_fin.slice(0,5)}`
    : null

  // Date formatée mer. 29/04
  const dateRef = commande.date_commande || commande.created_at
  const dateFormatee = dateRef ? (() => {
    const d = typeof dateRef === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRef)
      ? new Date(dateRef + 'T12:00:00')
      : new Date(dateRef)
    return d.toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit' })
  })() : null

  // En historique : nom complet ; sinon prénom seul (gain de place sur la grille du jour)
  const prenom = commande.client_nom?.split(' ')[0] || commande.client_nom
  const nomAffiche = modeHistorique ? (commande.client_nom || prenom) : prenom

  // Heure de retrait (swipe client) = updated_at quand statut = recupere
  const heureRetrait = (modeHistorique && commande.statut === 'recupere' && commande.updated_at)
    ? new Date(commande.updated_at).toLocaleString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: `0 2px 12px ${couleur.border}14`, border: `1.5px solid ${couleur.border}22`, transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 28px ${couleur.border}28` }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 12px ${couleur.border}14` }}>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${couleur.border}, ${couleur.border}88)` }}/>
      <div style={{ padding: '0.875rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Numéro + date dans le carré */}
            <div style={{ minWidth: 44, borderRadius: 10, background: `linear-gradient(135deg, ${couleur.border}, ${couleur.border}bb)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: `0 3px 10px ${couleur.border}44`, padding: '6px 6px', gap: 2 }}>
              <span style={{ fontWeight: 900, fontSize: '0.9rem', lineHeight: 1 }}>#{numero}</span>
              {dateFormatee && <span style={{ fontSize: '0.55rem', fontWeight: 700, opacity: 0.85, textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{dateFormatee}</span>}
            </div>
            <div>
              <p style={{ fontWeight: 800, color: T.ink, margin: 0, fontSize: '0.95rem', letterSpacing: '-0.2px' }}>{nomAffiche}</p>
              {heure && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <IconClock size={11} color={couleur.border}/>
                  <span style={{ fontSize: '0.75rem', color: couleur.border, fontWeight: 700 }}>{heure}</span>
                </div>
              )}
              {heureRetrait && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Retiré</span>
                  <span style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 700 }}>{heureRetrait}</span>
                </div>
              )}
              {commande.client_telephone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.2 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.11 6.11l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontSize: '0.72rem', color: T.muted, fontWeight: 600 }}>{commande.client_telephone}</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontWeight: 900, color: T.ink, margin: '0 0 4px', fontSize: '1.05rem', letterSpacing: '-0.3px' }}>{Number(commande.total).toFixed(2)}€</p>
            <span style={{ background: couleur.badge, color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '3px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap', display: 'inline-block' }}>
              {statut.icon} {statut.label}
            </span>
          </div>
        </div>
        <div style={{ background: T.bg, borderRadius: 10, padding: '0.5rem 0.75rem', marginBottom: '0.625rem' }}>
          {commande.commande_articles?.map(ligne => {
            // Regroupe les options par groupe pour un affichage hiérarchisé
            const optionsParGroupe = {}
            ;(ligne.options || []).forEach(o => {
              const g = o.groupe_nom || 'Options'
              if (!optionsParGroupe[g]) optionsParGroupe[g] = []
              optionsParGroupe[g].push(o)
            })
            return (
              <div key={ligne.id} style={{ marginBottom: 6, lineHeight: 1.4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: T.muted }}>
                  <span style={{ fontWeight: 700, color: T.ink }}>{ligne.quantite}× {ligne.article?.nom}</span>
                  <span style={{ fontWeight: 700, color: T.ink }}>{(ligne.quantite * ligne.prix_unitaire).toFixed(2)}€</span>
                </div>
                {Object.entries(optionsParGroupe).map(([groupe, vals]) => (
                  <div key={groupe} style={{ fontSize: '0.72rem', color: T.deep, marginLeft: 10, marginTop: 1, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ color: T.muted, fontWeight: 600 }}>{groupe} :</span>
                    {vals.map((v, i) => (
                      <span key={i} style={{ fontWeight: 700, color: T.deep }}>
                        {v.valeur_nom}{Number(v.prix_supplement) > 0 ? ` +${Number(v.prix_supplement).toFixed(2)}€` : ''}{i < vals.length - 1 ? ',' : ''}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        {statut.next && (
          <button onClick={() => onChangerStatut(commande.id, statut.next)}
            style={{ width: '100%', padding: '0.625rem', background: `linear-gradient(135deg, ${couleur.border}, ${couleur.border}cc)`, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${couleur.border}44`, transition: 'opacity 0.15s, transform 0.1s', letterSpacing: '-0.2px' }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'scale(0.99)' }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}>
            {statut.nextLabel} →
          </button>
        )}
        {/* Bouton Non retiré — visible dès que le créneau est passé, confirmation obligatoire */}
        {commande.statut === 'pret' && (() => {
          const maintenant = new Date()
          let creneauPasse = false
          if (commande.creneau?.heure_fin) {
            const dateRef = commande.date_commande || commande.created_at
            const dateFin = typeof dateRef === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRef)
              ? new Date(dateRef + 'T' + commande.creneau.heure_fin.slice(0,5) + ':00')
              : new Date(dateRef)
            creneauPasse = maintenant > dateFin
          }
          if (!creneauPasse) return null
          return (
            <button onClick={() => {
              if (window.confirm(`Marquer comme non retiré ?\n\nClient : ${commande.client_nom}\nCréneau : ${commande.creneau?.heure_debut?.slice(0,5)}–${commande.creneau?.heure_fin?.slice(0,5)}\n\nConfirme que le client ne s'est pas présenté.`)) {
                onChangerStatut(commande.id, 'non_retire')
              }
            }}
              style={{ width: '100%', padding: '0.5rem', background: 'transparent', color: '#9CA3AF', border: '1.5px solid #E5E7EB', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', fontFamily: '"DM Sans", sans-serif', marginTop: 6, transition: 'all 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.borderColor = '#9CA3AF' }}
              onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#E5E7EB' }}>
              ⚫ Client non venu
            </button>
          )
        })()}
        {/* Remettre en Prête si non retiré par erreur */}
        {commande.statut === 'non_retire' && (
          <button onClick={() => {
            if (window.confirm('Annuler le statut "Non retiré" et remettre la commande en "Prête" ?')) {
              onChangerStatut(commande.id, 'pret')
            }
          }}
            style={{ width: '100%', padding: '0.5rem', background: 'transparent', color: '#6B7280', border: '1.5px solid #E5E7EB', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', fontFamily: '"DM Sans", sans-serif', marginTop: 6 }}>
            <Reply size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Annuler, remettre en Prête
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Carte RDV (vitrine) ──────────────────────────────────────────────────────
// Affichage d'un RDV pour le commercant : heure, prestation, duree, client (nom/tel/email),
// notes du client, prix estime. Actions : Honore / No-show / Annuler.
function CarteRdv({ rdv, onChangerStatut }) {
  const statut = STATUTS_RDV[rdv.statut] || STATUTS_RDV['confirme']
  const { couleur } = statut

  const heureD = rdv.heure_debut?.slice(0,5)
  const heureF = rdv.heure_fin?.slice(0,5)
  const dateRef = rdv.date_rdv
  const dateFormatee = dateRef
    ? new Date(dateRef + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit' })
    : null

  const dureeMin = rdv.duree_minutes
  const dureeTexte = dureeMin
    ? (dureeMin >= 60 ? `${Math.floor(dureeMin/60)}h${dureeMin%60>0?(dureeMin%60)+'min':''}` : `${dureeMin}min`)
    : null

  const prenom = rdv.client_prenom || rdv.client_nom?.split(' ')[0] || 'Client'
  const nomComplet = [rdv.client_prenom, rdv.client_nom].filter(Boolean).join(' ') || rdv.client_nom

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: `0 2px 12px ${couleur.border}14`, border: `1.5px solid ${couleur.border}22`, transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 28px ${couleur.border}28` }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 12px ${couleur.border}14` }}>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${couleur.border}, ${couleur.border}88)` }}/>
      <div style={{ padding: '0.875rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Numero RDV + date */}
            <div style={{ minWidth: 44, borderRadius: 10, background: `linear-gradient(135deg, ${couleur.border}, ${couleur.border}bb)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: `0 3px 10px ${couleur.border}44`, padding: '6px 6px', gap: 2 }}>
              <span style={{ fontWeight: 900, fontSize: '0.9rem', lineHeight: 1 }}>#{rdv.numero_rdv || '?'}</span>
              {dateFormatee && <span style={{ fontSize: '0.55rem', fontWeight: 700, opacity: 0.85, textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{dateFormatee}</span>}
            </div>
            <div>
              <p style={{ fontWeight: 800, color: T.ink, margin: 0, fontSize: '0.95rem', letterSpacing: '-0.2px' }}>{nomComplet}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <IconClock size={11} color={couleur.border}/>
                <span style={{ fontSize: '0.75rem', color: couleur.border, fontWeight: 700 }}>{heureD}–{heureF}{dureeTexte ? ` · ${dureeTexte}` : ''}</span>
              </div>
              {rdv.client_telephone && (
                <a href={`tel:${rdv.client_telephone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3, textDecoration: 'none', color: T.muted }}>
                  <IconPhone size={11} color={T.muted}/>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{rdv.client_telephone}</span>
                </a>
              )}
            </div>
          </div>
          {/* Statut badge a droite */}
          <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '4px 9px', borderRadius: 100, background: couleur.cardBg, color: couleur.badge, border: `1px solid ${couleur.border}33`, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {statut.icon} {statut.label}
          </span>
        </div>

        {/* Prestation */}
        <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '0.625rem 0.75rem', marginBottom: 8, border: '1px solid #F3F4F6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: T.ink, margin: 0, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
              {rdv.prestation?.nom || 'Prestation'}
            </p>
            {rdv.prix_estime != null && (
              <span style={{ fontSize: '0.85rem', fontWeight: 900, color: T.main, letterSpacing: '-0.3px', flexShrink: 0 }}>
                {Number(rdv.prix_estime).toFixed(0)}€
              </span>
            )}
          </div>
          {rdv.acompte_montant != null && rdv.acompte_montant > 0 && (
            <p style={{ fontSize: '0.7rem', color: T.muted, marginTop: 3, fontWeight: 600 }}>
              Acompte : {Number(rdv.acompte_montant).toFixed(2)}€ {rdv.acompte_paye ? '✓ payé' : '· en attente'}
            </p>
          )}
        </div>

        {/* Notes client si presentes */}
        {rdv.notes_client && (
          <div style={{ background: '#FFFBEB', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: 8, border: '1px solid #FDE68A' }}>
            <p style={{ fontSize: '0.62rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>Note du client</p>
            <p style={{ fontSize: '0.78rem', color: '#78350F', lineHeight: 1.4, margin: 0 }}>{rdv.notes_client}</p>
          </div>
        )}

        {/* Actions selon statut */}
        {statut.actions.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: statut.actions.length === 3 ? '2fr 1fr 1fr' : '1fr', gap: 6, marginTop: 10 }}>
            {statut.actions.map(action => {
              const cfg = ACTIONS_RDV_LABEL[action]
              if (!cfg) return null
              const isPrincipal = action === 'honore' || action === 'confirme'
              return (
                <button key={action} onClick={() => {
                  const msg = action === 'no_show' ? 'Marquer ce client en NO-SHOW ?'
                            : action === 'annule' ? 'ANNULER ce RDV ? Le client sera notifie.'
                            : action === 'honore' ? null
                            : 'Remettre ce RDV en CONFIRMÉ ?'
                  if (msg && !window.confirm(msg)) return
                  onChangerStatut(rdv.id, action)
                }}
                  style={{
                    padding: '0.5rem 0.5rem', borderRadius: 10,
                    border: isPrincipal ? 'none' : `1.5px solid ${cfg.border}`,
                    background: isPrincipal ? cfg.bg : 'transparent',
                    color: isPrincipal ? '#fff' : cfg.bg,
                    fontWeight: 700, fontSize: '0.75rem',
                    cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                    boxShadow: isPrincipal ? `0 3px 10px ${cfg.bg}44` : 'none',
                    transition: 'all 0.15s',
                  }}>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Dashboard() {
  const [commandes, setCommandes] = useState([])
  const [rdvs, setRdvs] = useState([])
  const [creneauxRdv, setCreneauxRdv] = useState([])  // rdv_creneaux du commercant, pour la grille agenda (pauses)
  const [prestationsRdv, setPrestationsRdv] = useState([])  // rdv_prestations actives, pour la modale 'Nouveau RDV manuel'
  const [rdvSelectionne, setRdvSelectionne] = useState(null)  // RDV ouvert dans la modale details
  const [nouveauRdvSlot, setNouveauRdvSlot] = useState(null)  // { date, heure } -> ouvre la modale d'ajout manuel
  // Mode impersonation : admin Yoppaa connecte en tant qu'un commercant pour le support.
  // Detecte via localStorage yoppaa_admin_impersonating (set depuis /admin "Voir Dashboard").
  // Affiche un banner sticky en haut + bouton Quitter qui revient sur /admin.
  const [impersonating, setImpersonating] = useState(false)
  const [impersonationId, setImpersonationId] = useState(null)
  const [commercant, setCommercant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [listeCommercants, setListeCommercants] = useState([])
  const [ongletPrincipal, setOngletPrincipal] = useState('commandes')

  // Pour les commerces vitrine purs (Dermae, coiffeur, etc.), on bascule auto sur l'onglet
  // RDV des que commercant est charge - l'onglet Commandes n'a pas de sens pour eux.
  useEffect(() => {
    if (commercant?.categorie === 'vitrine' && ongletPrincipal === 'commandes') {
      setOngletPrincipal('rdv')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commercant?.id])
  const [filtreStatut, setFiltreStatut] = useState('actives')
  const [jourSelectionne, setJourSelectionne] = useState(null) // null = aujourd'hui par défaut
  const [modeHistorique, setModeHistorique] = useState(false)
  const [notificationsActives, setNotificationsActives] = useState(false)
  const [nouvelleCommande, setNouvelleCommande] = useState(false)
  const [commandeRecuperee, setCommandeRecuperee] = useState(null) // { nom, numero }
  const router = useRouter()
  const dernierNombreRef = useRef(0)
  const pollingRef = useRef(null)

  const trierCommandes = (data) =>
    (data || []).sort((a, b) => {
      const dateA = dateKey(a.date_commande || a.created_at)
      const dateB = dateKey(b.date_commande || b.created_at)
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      return (a.creneau?.heure_debut || '').localeCompare(b.creneau?.heure_debut || '')
    })

  const chargerCommandes = useCallback(async (id) => {
    const { data } = await supabase
      .from('commandes')
      .select(`*, creneau:creneaux(*), commande_articles(*, article:articles(*))`)
      .eq('commercant_id', id)
      .order('created_at', { ascending: true })
    const triees = trierCommandes(data)
    setCommandes(triees)
    dernierNombreRef.current = triees.length
    setLoading(false)
    // Sélectionner aujourd'hui par défaut
    const todayKey = dateKey(new Date())
    setJourSelectionne(todayKey)
  }, [])

  // Fetch des RDVs d'un commercant. Filtre deleted_at IS NULL (legal Belgique 7 ans
  // mais on cache les supprimes du dashboard quotidien). Tri par date + heure.
  // Fetch aussi les rdv_creneaux (pauses) et rdv_prestations (modale ajout manuel).
  const chargerRdvs = useCallback(async (id) => {
    const [{ data: rdvData }, { data: crData }, { data: pData }] = await Promise.all([
      supabase
        .from('rdv_reservations')
        .select('*, prestation:rdv_prestations(nom, duree_minutes, prix)')
        .eq('commercant_id', id)
        .is('deleted_at', null)
        .order('date_rdv', { ascending: true })
        .order('heure_debut', { ascending: true }),
      supabase
        .from('rdv_creneaux')
        .select('*')
        .eq('commercant_id', id)
        .eq('actif', true)
        .is('deleted_at', null),
      supabase
        .from('rdv_prestations')
        .select('id, nom, duree_minutes, prix, prix_min, prix_max, acompte_pourcent, ordre')
        .eq('commercant_id', id)
        .eq('actif', true)
        .is('deleted_at', null)
        .order('ordre', { ascending: true })
        .order('created_at', { ascending: true }),
    ])
    setRdvs(rdvData || [])
    setCreneauxRdv(crData || [])
    setPrestationsRdv(pData || [])
  }, [])

  // ─── Init — mémoriser le commerce sélectionné ─────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // ─── MODE IMPERSONATION ADMIN ───
      // Si l'admin Yoppaa a cliqué "Voir Dashboard" depuis /admin, on a un flag
      // dans localStorage. On fetch ce commerçant directement (sans filtrer par auth_user_id)
      // grâce a la policy RLS "Admin Yoppaa FULL" qui autorise l'admin a tout voir.
      const adminEmail = 'verstappenalexandre@gmail.com'
      const impersonatingId = typeof window !== 'undefined' ? localStorage.getItem('yoppaa_admin_impersonating') : null
      if (user.email === adminEmail && impersonatingId) {
        const { data: c } = await supabase.from('commercants').select('*').eq('id', impersonatingId).maybeSingle()
        if (c) {
          setCommercant(c)
          setImpersonating(true)
          setImpersonationId(localStorage.getItem('yoppaa_admin_impersonation_session_id'))
          chargerCommandes(c.id); chargerRdvs(c.id)
          return
        } else {
          // Le commercant impersonne n'existe plus. On nettoie et retombe sur le flow normal.
          localStorage.removeItem('yoppaa_admin_impersonating')
          localStorage.removeItem('yoppaa_admin_impersonation_session_id')
        }
      }
      // ─── FLOW NORMAL : commercant connecte par son propre compte ───
      const { data } = await supabase.from('commercants').select('*').eq('auth_user_id', user.id).order('nom')
      if (!data || data.length === 0) {
        // Pas de commerçant lié : si c'est l'admin Yoppaa, on l'envoie vers /admin.
        // Sinon /login (cas où une session traîne sans onboarding finalisé).
        if (user.email === adminEmail) router.push('/admin')
        else router.push('/login')
        return
      }

      if (data.length === 1) {
        setCommercant(data[0])
        localStorage.setItem('yoppaa_dashboard_commercant_id', data[0].id)
        chargerCommandes(data[0].id); chargerRdvs(data[0].id)
      } else {
        // Multi-commerces — restaurer depuis localStorage
        const savedId = localStorage.getItem('yoppaa_dashboard_commercant_id')
        if (savedId) {
          const found = data.find(c => c.id === savedId)
          if (found) {
            setCommercant(found)
            chargerCommandes(found.id); chargerRdvs(found.id)
            return
          }
        }
        setListeCommercants(data)
        setLoading(false)
      }
    }
    init()
  }, [chargerCommandes, router])

  // Refresh commandes + RDVs commercant au focus/visibilitychange + polling 60s.
  // Sans ça, les nouveaux RDVs crees par les Yoppers (notamment via webhook Stripe
  // en arriere-plan) n'apparaissent pas tant que le commercant ne hard-refresh pas.
  // Bug rapporte Alex 2026-06-02 ("3 RDVs visibles alors qu'il y en a plus de 10").
  useEffect(() => {
    if (!commercant?.id) return
    const cid = commercant.id
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        chargerCommandes(cid)
        chargerRdvs(cid)
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
  }, [commercant?.id, chargerCommandes, chargerRdvs])

  // Fonction pour quitter le mode impersonation (logue end + nettoie flags + retour /admin)
  const quitterImpersonation = useCallback(async () => {
    const impId = typeof window !== 'undefined' ? localStorage.getItem('yoppaa_admin_impersonation_session_id') : null
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (impId) {
        await fetch('/api/admin/impersonate-end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({ impersonation_id: impId }),
        })
      }
    } catch (e) {
      console.warn('[dashboard] impersonate-end failed', e)
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('yoppaa_admin_impersonating')
      localStorage.removeItem('yoppaa_admin_impersonation_session_id')
    }
    router.push('/admin')
  }, [router])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem('notifs') === 'true') setNotificationsActives(true)
    }
  }, [])

  // ─── Polling auto 5s ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!commercant) return
    if (pollingRef.current) clearInterval(pollingRef.current)

    pollingRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('commandes')
        .select(`*, creneau:creneaux(*), commande_articles(*, article:articles(*))`)
        .eq('commercant_id', commercant.id)
        .order('created_at', { ascending: true })
      const triees = trierCommandes(data)

      // Nouvelle commande arrivée
      if (dernierNombreRef.current > 0 && triees.length > dernierNombreRef.current) {
        if (notificationsActives) jouerSon()
        setNouvelleCommande(true)
        setTimeout(() => setNouvelleCommande(false), 6000)
      }

      // Commande passée en "recupere" depuis le dernier poll
      setCommandes(prev => {
        const anciennes = prev.filter(c => c.statut === 'pret')
        anciennes.forEach(ancien => {
          const nouvelle = triees.find(n => n.id === ancien.id)
          if (nouvelle?.statut === 'recupere') {
            // numero_commande DB prioritaire, sinon position du jour
            const jourC = dateKey(nouvelle.date_commande || nouvelle.created_at)
            const nbDuJour = triees
              .filter(c => dateKey(c.date_commande || c.created_at) === jourC)
              .sort((a,b) => (a.creneau?.heure_debut || '').localeCompare(b.creneau?.heure_debut || '') || new Date(a.created_at) - new Date(b.created_at))
            const num = nouvelle.numero_commande || (nbDuJour.findIndex(c => c.id === ancien.id) + 1)
            const prenom = nouvelle.client_nom?.split(' ')[0] || 'Le Yopper'
            if (notificationsActives) jouerSonRetrait()
            setCommandeRecuperee({ nom: prenom, numero: num })
            setTimeout(() => setCommandeRecuperee(null), 8000)
          }
        })
        return prev
      })

      dernierNombreRef.current = triees.length
      setCommandes(triees)

      // Polling RDVs : meme interval pour eviter de multiplier les setInterval.
      // Pas de notif son speciale ici (ajoutee dans RDV-10).
      const { data: rdvsData } = await supabase
        .from('rdv_reservations')
        .select('*, prestation:rdv_prestations(nom, duree_minutes, prix)')
        .eq('commercant_id', commercant.id)
        .is('deleted_at', null)
        .order('date_rdv', { ascending: true })
        .order('heure_debut', { ascending: true })
      if (rdvsData) setRdvs(rdvsData)
    }, 5000)

    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [commercant?.id, notificationsActives])

  async function changerStatut(commandeId, statut) {
    await supabase.from('commandes').update({ statut }).eq('id', commandeId)
    setCommandes(prev => prev.map(c => c.id === commandeId ? { ...c, statut } : c))

    // Si on passe a 'pret' : email au Yopper pour le prevenir
    // (non-bloquant, fire-and-forget — l'UI commercant est deja a jour)
    if (statut === 'pret') {
      fetch('/api/emails/commande-prete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commande_id: commandeId }),
      }).catch(e => console.warn('[dashboard] email commande-prete KO', e))
    }
  }

  async function changerStatutRdv(rdvId, statut) {
    const { error } = await supabase.from('rdv_reservations').update({ statut }).eq('id', rdvId)
    if (error) {
      console.error('[dashboard] changerStatutRdv', error)
      alert(`Erreur : ${error.message}`)
      return
    }
    setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, statut } : r))

    // Si statut change → emails contextuels (non-bloquant, fire-and-forget)
    if (statut === 'annule') {
      fetch('/api/emails/rdv-annule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rdv_id: rdvId, raison_annulation: 'commercant' }),
      }).catch(e => console.warn('[dashboard] email rdv-annule KO', e))
    } else if (statut === 'honore') {
      fetch('/api/emails/rdv-honore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rdv_id: rdvId }),
      }).catch(e => console.warn('[dashboard] email rdv-honore KO', e))
    }
  }

  async function seDeconnecter() {
    localStorage.removeItem('yoppaa_dashboard_commercant_id')
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function activerNotifications() {
    const n = !notificationsActives
    setNotificationsActives(n)
    if (typeof window !== 'undefined') localStorage.setItem('notifs', String(n))
    if (n) {
      const ok = await demanderPermissionNotif()
      if (ok) {
        // Test immédiat
        envoyerNotification('Alertes Yoppaa activées !', 'Tu recevras une notification à chaque nouvelle commande.')
      } else {
        // Pas de permission — fallback audio seulement
        try { new Audio('/sounds/notification.mp3').play().catch(()=>{}) } catch(e) {}
      }
    }
  }

  // ─── Stats & filtres ──────────────────────────────────────────────────────
  const todayKey = dateKey(new Date())
  // Horizon different selon l'onglet : commandes alimentaires = J+1 ou J+2 max (workflow C&C
  // court), RDVs vitrines = J+14 (les clients reservent souvent 1-2 semaines a l'avance).
  // De plus, pour RDV on n'affiche que les jours qui ont au moins 1 RDV (sinon le selecteur
  // est pollue de 14 jours vides). Aujourd'hui et demain restent toujours visibles.
  const _joursBase = ongletPrincipal === 'rdv' ? getJoursDispos(14) : getJoursDispos(commercant?.horizon_commande || 1)
  const joursDispos = ongletPrincipal === 'rdv'
    ? _joursBase.filter((j, idx) => idx < 2 || rdvs.some(r => r.date_rdv === j))
    : _joursBase

  // Si aucun jour sélectionné ou jour inexistant → aujourd'hui
  const jourActif = (jourSelectionne && joursDispos.includes(jourSelectionne)) ? jourSelectionne : todayKey

  // Commandes hors horizon = historique
  // Tri : 1) date décroissante (récente d'abord) 2) numero_commande ascendant
  // (chronologie de prise de commande à l'intérieur d'un même jour)
  const commandesHistorique = commandes
    .filter(c => !joursDispos.includes(dateKey(c.date_commande || c.created_at)))
    .sort((a, b) => {
      const dateA = a.date_commande || a.created_at
      const dateB = b.date_commande || b.created_at
      const cmpDate = new Date(dateB) - new Date(dateA)
      if (cmpDate !== 0) return cmpDate
      return (a.numero_commande || 0) - (b.numero_commande || 0)
    })

  const commandesDuJour = modeHistorique
    ? commandesHistorique
    : commandes.filter(c => dateKey(c.date_commande || c.created_at) === jourActif)

  const stats = {
    nouvelles:  commandesDuJour.filter(c => c.statut === 'en_attente').length,
    enPrepa:    commandesDuJour.filter(c => c.statut === 'en_preparation').length,
    pretes:     commandesDuJour.filter(c => c.statut === 'pret').length,
    recuperees: commandesDuJour.filter(c => c.statut === 'recupere').length,
    ca:         commandesDuJour.reduce((acc, c) => acc + Number(c.total), 0),
  }

  const commandesFiltrees = commandesDuJour.filter(c => {
    if (filtreStatut === 'actives')        return ['en_attente','en_preparation','pret'].includes(c.statut)
    if (filtreStatut === 'en_attente')     return c.statut === 'en_attente'
    if (filtreStatut === 'en_preparation') return c.statut === 'en_preparation'
    if (filtreStatut === 'pret')           return c.statut === 'pret'
    if (filtreStatut === 'recupere')       return c.statut === 'recupere'
    if (filtreStatut === 'non_retire')     return c.statut === 'non_retire'
    return true
  })

  const nonRetires = commandesDuJour.filter(c => c.statut === 'non_retire').length

  const filtresStatut = [
    { key: 'actives',        label: 'Actives',      count: stats.nouvelles + stats.enPrepa + stats.pretes },
    { key: 'en_attente',     label: 'Nouvelles',    count: stats.nouvelles,  color: '#DC2626' },
    { key: 'en_preparation', label: 'En prépa',     count: stats.enPrepa,    color: '#EA580C' },
    { key: 'pret',           label: 'Prêtes',       count: stats.pretes,     color: '#10B981' },
    { key: 'recupere',       label: 'Récupérées',   count: stats.recuperees, color: '#2563EB' },
    { key: 'non_retire',     label: 'Non retirés',  count: nonRetires,       color: '#6B7280' },
    { key: 'tout',           label: 'Tout',         count: commandesDuJour.length },
  ]

  const statsCards = [
    { label: 'Nouvelles',  value: stats.nouvelles,           color: '#DC2626', bg: '#FFF0F0', border: '#DC262618', pulse: stats.nouvelles > 0 },
    { label: 'En prépa',   value: stats.enPrepa,             color: '#EA580C', bg: '#FFF7ED', border: '#EA580C18', pulse: false },
    { label: 'Prêtes',     value: stats.pretes,              color: '#10B981', bg: '#F0FDF4', border: '#10B98118', pulse: false },
    { label: 'CA du jour', value: `${stats.ca.toFixed(2)}€`, color: T.main,   bg: T.pale,   border: `${T.main}18`, pulse: false },
  ]

  // ─── RDVs : calculs derives ────────────────────────────────────────────────
  // Tous les filtres sur 'rdvs' qui alimentent l'onglet RDV (similaire a stats commandes).
  const rdvsDuJour = modeHistorique
    ? rdvs.filter(r => new Date(r.date_rdv) < new Date(dateKey(new Date())))  // historique = passes
    : rdvs.filter(r => r.date_rdv === jourActif)
  const statsRdv = {
    aujourdhui: rdvs.filter(r => r.date_rdv === dateKey(new Date()) && r.statut === 'confirme').length,
    duJour:     rdvsDuJour.length,
    confirmes:  rdvsDuJour.filter(r => r.statut === 'confirme').length,
    honores:    rdvsDuJour.filter(r => r.statut === 'honore').length,
    annules:    rdvsDuJour.filter(r => r.statut === 'annule').length,
    noShow:     rdvsDuJour.filter(r => r.statut === 'no_show').length,
    caEstime:   rdvsDuJour.filter(r => r.statut === 'honore').reduce((acc, r) => acc + Number(r.prix_estime || 0), 0),
  }
  // Filtre statut RDV
  const rdvsFiltres = rdvsDuJour.filter(r => {
    if (filtreStatut === 'actives')  return r.statut === 'confirme'
    if (filtreStatut === 'confirme') return r.statut === 'confirme'
    if (filtreStatut === 'honore')   return r.statut === 'honore'
    if (filtreStatut === 'no_show')  return r.statut === 'no_show'
    if (filtreStatut === 'annule')   return r.statut === 'annule'
    return true
  })
  const filtresStatutRdv = [
    { key: 'actives',  label: 'À venir',    count: statsRdv.confirmes,           color: T.main },
    { key: 'honore',   label: 'Honorés',    count: statsRdv.honores,             color: '#10B981' },
    { key: 'no_show',  label: 'No-show',    count: statsRdv.noShow,              color: '#6B7280' },
    { key: 'annule',   label: 'Annulés',    count: statsRdv.annules,             color: '#DC2626' },
    { key: 'tout',     label: 'Tout',       count: rdvsDuJour.length },
  ]
  const statsCardsRdv = [
    { label: 'À venir',     value: statsRdv.confirmes,                    color: T.main,    bg: T.pale,   border: `${T.main}18`,   pulse: statsRdv.confirmes > 0 },
    { label: 'Honorés',     value: statsRdv.honores,                       color: '#10B981', bg: '#F0FDF4', border: '#10B98118',     pulse: false },
    { label: 'No-show',     value: statsRdv.noShow,                        color: '#6B7280', bg: '#F9FAFB', border: '#9CA3AF22',     pulse: false },
    { label: 'CA honoré',   value: `${statsRdv.caEstime.toFixed(0)}€`,    color: T.main,    bg: T.pale,   border: `${T.main}18`,   pulse: false },
  ]

  // ─── Sélecteur commerce ───────────────────────────────────────────────────
  if (listeCommercants.length > 0 && !commercant) return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 60%, #3D1580 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: '"DM Sans", sans-serif', position: 'relative', overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 80% 20%, ${T.mid}33 0%, transparent 50%), radial-gradient(circle at 20% 80%, ${T.light}18 0%, transparent 50%)`, pointerEvents: 'none' }}/>
      <div style={{ width: '100%', maxWidth: 400, position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 12 }}>
            {[{c:'#fff',o:0.35},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: d.c, opacity: d.o }}/>
            ))}
          </div>
          <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.05em', color: '#fff', marginBottom: 4, lineHeight: 1 }}>yoppaa</p>
          <p style={{ color: T.light, fontSize: '0.82rem', fontWeight: 600, opacity: 0.8 }}>Choisir un commerce</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listeCommercants.map(c => (
            <button key={c.id} onClick={() => {
              setCommercant(c)
              setListeCommercants([])
              localStorage.setItem('yoppaa_dashboard_commercant_id', c.id)
              chargerCommandes(c.id)
            }}
              style={{ padding: '1rem 1.25rem', borderRadius: 14, border: `1.5px solid ${T.main}44`, background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1rem', textAlign: 'left', transition: 'all 0.15s', backdropFilter: 'blur(8px)' }}
              onMouseOver={e => { e.currentTarget.style.background = `${T.main}44`; e.currentTarget.style.borderColor = T.main }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = `${T.main}44` }}>
              <p style={{ margin: '0 0 4px' }}>{c.nom}</p>
              <p style={{ fontSize: '0.75rem', color: T.light, margin: 0, fontWeight: 500 }}>{c.type} · {c.adresse}</p>
            </button>
          ))}
        </div>
        <button onClick={seDeconnecter} style={{ width: '100%', marginTop: '1.5rem', padding: '0.75rem', borderRadius: 100, border: '1px solid #DC262633', background: '#DC262611', color: '#FCA5A5', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.82rem' }}>
          Se déconnecter
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <link rel="manifest" href="/manifest-dashboard.json"/>
      <meta name="apple-mobile-web-app-capable" content="yes"/>
      <meta name="apple-mobile-web-app-title" content="Yoppaa Pro"/>
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
      <meta name="theme-color" content="#160636"/>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.main}44; border-radius: 4px; }

        .dash-layout {
          display: flex;
          height: var(--dash-h, 100dvh);
          width: 100vw;
          overflow: hidden;
          background: ${T.bg};
        }

        /* ── Sidebar PC ── */
        .sidebar {
          width: 220px;
          flex-shrink: 0;
          background: linear-gradient(180deg, ${T.bgPanel} 0%, #1e0950 100%);
          border-right: 1px solid ${T.main}33;
          padding: 1.5rem 1rem;
          display: none;
          flex-direction: column;
          height: var(--dash-h, 100dvh);
          overflow-y: auto;
        }

        /* ── Zone contenu ── */
        .content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          height: var(--dash-h, 100dvh);
          overflow: hidden;
        }

        /* ── Topbar hype ── */
        .topbar {
          background: linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 50%, #3D1580 100%);
          border-bottom: 1px solid ${T.main}33;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
        }
        .topbar-deco {
          position: absolute; inset: 0;
          background-image: radial-gradient(circle at 90% 50%, ${T.mid}33 0%, transparent 60%), radial-gradient(circle at 10% 50%, ${T.light}18 0%, transparent 50%);
          pointer-events: none;
        }
        .topbar-inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          position: relative;
          z-index: 1;
          gap: 8px;
        }

        /* ── Sticky header stats+filtres ── */
        .sticky-header {
          flex-shrink: 0;
          background: ${T.bg};
          border-bottom: 1px solid ${T.pale};
          padding: 0.75rem 1rem 0;
        }

        /* ── Stats grid ── */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
          margin-bottom: 0.625rem;
        }

        /* ── Jours pills ── */
        .jours-wrap {
          display: flex;
          gap: 5px;
          overflow-x: auto;
          scrollbar-width: none;
          padding-bottom: 0.625rem;
          border-bottom: 1px solid ${T.pale};
          margin-bottom: 0.625rem;
        }
        .jours-wrap::-webkit-scrollbar { display: none; }

        /* ── Filtres statut ── */
        .filtres-wrap {
          display: flex;
          gap: 5px;
          overflow-x: auto;
          scrollbar-width: none;
          padding-bottom: 0.625rem;
        }
        .filtres-wrap::-webkit-scrollbar { display: none; }

        .pill {
          flex-shrink: 0;
          padding: 0.3rem 0.75rem;
          border-radius: 100px;
          border: 1.5px solid;
          font-weight: 700;
          font-size: 0.72rem;
          cursor: pointer;
          font-family: "DM Sans", sans-serif;
          transition: all 0.15s;
          white-space: nowrap;
        }

        /* ── Scroll zone ── */
        .scroll-zone {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          -webkit-overflow-scrolling: touch;
        }

        .commandes-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }

        /* ── Nav sidebar btn ── */
        .sidebar-nav-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0.7rem 0.875rem;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-family: "DM Sans", sans-serif;
          font-weight: 700;
          font-size: 0.875rem;
          transition: all 0.15s;
          margin-bottom: 4px;
          text-align: left;
        }

        /* ── Tablette 600px+ ── */
        @media (min-width: 600px) {
          .commandes-grid { grid-template-columns: repeat(2, 1fr); }
          .stats-grid { grid-template-columns: repeat(4, 1fr); gap: 8px; }
          .sticky-header { padding: 0.875rem 1.25rem 0; }
          .scroll-zone { padding: 1.25rem; }
          .topbar-inner { padding: 0.875rem 1.25rem; }
        }

        /* ── PC 1100px+ ── */
        @media (min-width: 1100px) {
          .sidebar { display: flex !important; }
          .topbar { display: none !important; }
          .scroll-zone { padding: 1.5rem !important; }
          .sticky-header { padding: 1rem 1.5rem 0; }
          .commandes-grid { grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
          .stats-grid { grid-template-columns: repeat(4, 1fr); gap: 10px; }
        }

        @keyframes slideDown { from { transform: translateY(-100%) } to { transform: translateY(0) } }
        @keyframes slideInRight { from { transform: translateX(120%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes wiggle { 0%,100% { transform: rotate(-8deg) } 50% { transform: rotate(8deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        @keyframes dotPulse { from { opacity:0.4; transform:scale(0.8); } to { opacity:1; transform:scale(1.2); } }
      `}</style>

      {/* Notif NOUVELLE COMMANDE — card flottante en haut à droite */}
      {nouvelleCommande && (
        <div onClick={() => setNouvelleCommande(false)}
          style={{ position: 'fixed', top: 20, right: 20, left: 20, zIndex: 9999, maxWidth: 360, marginLeft: 'auto', animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)', cursor: 'pointer' }}>
          <div style={{ background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 60%, ${T.main} 100%)`, borderRadius: 18, padding: '16px 18px', color: '#fff', boxShadow: `0 24px 48px rgba(22,6,54,0.4), 0 0 0 1px ${T.main}55`, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'wiggle 0.7s ease-in-out infinite alternate' }}>
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 2 }}>Nouvelle commande</p>
              <p style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '-0.3px', margin: 0 }}>À traiter maintenant</p>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[T.light, T.mid, '#fff'].map((c, i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c, animation: `dotPulse 0.8s ease-in-out ${i*0.15}s infinite alternate` }}/>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notif COMMANDE RÉCUPÉRÉE — card flottante en haut à droite (sans cacher la liste) */}
      {commandeRecuperee && (
        <div onClick={() => setCommandeRecuperee(null)}
          style={{ position: 'fixed', top: nouvelleCommande ? 110 : 20, right: 20, left: 20, zIndex: 9998, maxWidth: 360, marginLeft: 'auto', animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)', cursor: 'pointer' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '14px 18px', boxShadow: `0 24px 48px rgba(22,6,54,0.18), 0 0 0 1px ${T.hairline || T.pale}`, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 900, fontSize: 20, letterSpacing: '-0.5px', boxShadow: `0 6px 16px ${T.main}55` }}>
              #{commandeRecuperee.numero}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#10B981', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 2 }}>Récupérée</p>
              <p style={{ fontSize: 15, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{commandeRecuperee.nom}</p>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
            </div>
          </div>
        </div>
      )}

      {/* ── Banner sticky MODE ADMIN — hors dash-layout pour ne pas recouvrir le contenu.
          dash-layout a height: 100dvh, on lui retire 42px et on decale du meme montant. */}
      {impersonating && commercant && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9998,
          background: 'linear-gradient(90deg, #F59E0B, #FB923C)',
          color: '#fff', padding: '0.5rem 0.875rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 700,
          boxShadow: '0 2px 12px rgba(245,158,11,0.35)',
          letterSpacing: '-0.1px',
          flexWrap: 'wrap',
          height: 42,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
            <strong>MODE ADMIN</strong>
          </span>
          <span style={{ opacity: 0.92 }}>
            Tu es connecté en tant que <strong>{commercant.nom}</strong>
          </span>
          <button onClick={quitterImpersonation}
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: 100, padding: '4px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            Quitter →
          </button>
        </div>
      )}

      <div className="dash-layout" style={impersonating ? { marginTop: 42, '--dash-h': 'calc(100dvh - 42px)' } : undefined}>

        {/* ── SIDEBAR PC ── */}
        <aside className="sidebar">
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
              {[{c:'#fff',o:0.35},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: d.c, opacity: d.o }}/>
              ))}
            </div>
            <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.05em', color: '#fff', marginBottom: 2, lineHeight: 1 }}>yoppaa</p>
            <p style={{ fontSize: '0.6rem', color: T.light, fontWeight: 700, opacity: 0.7, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Pro</p>
          </div>

          <div style={{ background: `${T.main}22`, borderRadius: 12, padding: '0.75rem 0.875rem', marginBottom: '1.25rem', border: `1px solid ${T.main}33` }}>
            <p style={{ fontSize: '0.6rem', color: T.light, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, opacity: 0.7 }}>Commerce actif</p>
            <p style={{ fontWeight: 800, color: '#fff', fontSize: '0.9rem', letterSpacing: '-0.2px' }}>{commercant?.nom}</p>
            <p style={{ fontSize: '0.7rem', color: T.light, opacity: 0.65, marginTop: 2 }}>{commercant?.type}</p>
          </div>

          <nav style={{ flex: 1 }}>
            {[
              { key: 'commandes', label: 'Commandes',   Icon: IconCommandes, visible: commercant?.categorie !== 'vitrine' },
              { key: 'rdv',       label: 'Rendez-vous', Icon: IconRdv,       visible: !!commercant?.rdv_actif },
              { key: 'config',    label: 'Paramètres',  Icon: IconConfig,    visible: true },
            ].filter(t => t.visible).map(({ key, label, Icon }) => {
              const actif = ongletPrincipal === key
              const badgeCount = key === 'commandes' ? stats.nouvelles : key === 'rdv' ? statsRdv.aujourdhui : 0
              return (
                <button key={key} className="sidebar-nav-btn" onClick={() => setOngletPrincipal(key)}
                  style={{ background: actif ? `linear-gradient(135deg, ${T.main}55, ${T.mid}33)` : 'transparent', color: actif ? '#fff' : T.light, borderLeft: `3px solid ${actif ? T.main : 'transparent'}`, boxShadow: actif ? `0 4px 16px ${T.main}33` : 'none' }}>
                  <Icon size={18} color={actif ? '#fff' : T.light} opacity={actif ? 1 : 0.6}/>
                  {label}
                  {badgeCount > 0 && (
                    <span style={{ marginLeft: 'auto', background: key === 'rdv' ? '#10B981' : '#DC2626', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100, animation: key === 'commandes' ? 'pulse 2s ease infinite' : 'none' }}>{badgeCount}</span>
                  )}
                </button>
              )
            })}
          </nav>

          <div style={{ background: `${T.main}18`, borderRadius: 12, padding: '0.875rem', margin: '1rem 0', border: `1px solid ${T.main}28` }}>
            <p style={{ fontSize: '0.58rem', color: T.light, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, opacity: 0.7 }}>
              {jourActif ? dateLabel(jourActif + 'T00:00:00') : "Aujourd'hui"}
            </p>
            {[
              { label: 'CA', value: `${stats.ca.toFixed(2)}€`, color: T.mid },
              { label: 'Commandes', value: commandesDuJour.length, color: '#fff' },
              { label: 'Récupérées', value: stats.recuperees, color: T.light },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.72rem', color: T.light, opacity: 0.7 }}>{s.label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 900, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={activerNotifications}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.875rem', borderRadius: 10, border: `1px solid ${notificationsActives ? T.main : T.main+'44'}`, background: notificationsActives ? `${T.main}33` : 'transparent', color: notificationsActives ? '#fff' : T.light, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem', transition: 'all 0.15s' }}>
              <IconBell size={15} color={notificationsActives ? '#fff' : T.light} active={notificationsActives}/>
              {notificationsActives ? 'Alertes actives' : 'Alertes désactivées'}
            </button>
            <button onClick={seDeconnecter}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.875rem', borderRadius: 10, border: '1px solid #DC262633', background: '#DC262611', color: '#FCA5A5', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.78rem' }}>
              <IconLogout size={15}/>
              Déconnexion
            </button>
          </div>
        </aside>

        {/* ── ZONE CONTENU ── */}
        <div className="content-area">

          {/* Topbar hype mobile/tablette */}
          <div className="topbar">
            <div className="topbar-deco"/>
            <div className="topbar-inner">
              <div style={{ flexShrink: 0, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[{c:'#fff',o:0.35},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: d.c, opacity: d.o }}/>
                    ))}
                  </div>
                  <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.05em', color: '#fff', lineHeight: 1 }}>yoppaa</p>
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, color: T.light, background: `${T.main}44`, padding: '2px 6px', borderRadius: 100, border: `1px solid ${T.light}33` }}>PRO</span>
                </div>
                <p style={{ color: T.light, fontWeight: 600, fontSize: '0.68rem', opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'clamp(100px, 25vw, 240px)' }}>{commercant?.nom}</p>
              </div>

              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 3, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {[
                  { key: 'commandes', label: 'Cmd',    Icon: IconCommandes, visible: commercant?.categorie !== 'vitrine' },
                  { key: 'rdv',       label: 'RDV',    Icon: IconRdv,       visible: !!commercant?.rdv_actif },
                  { key: 'config',    label: 'Config', Icon: IconConfig,    visible: true },
                ].filter(t => t.visible).map(({ key, label, Icon }) => {
                  const actif = ongletPrincipal === key
                  const badgeCount = key === 'commandes' ? stats.nouvelles : key === 'rdv' ? statsRdv.aujourdhui : 0
                  return (
                    <button key={key} onClick={() => setOngletPrincipal(key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.35rem 0.625rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.72rem', transition: 'all 0.2s', background: actif ? T.main : 'transparent', color: actif ? '#fff' : T.light, boxShadow: actif ? `0 3px 12px ${T.main}55` : 'none', position: 'relative', whiteSpace: 'nowrap' }}>
                      <Icon size={13} color={actif ? '#fff' : T.light}/>
                      {label}
                      {badgeCount > 0 && (
                        <span style={{ position: 'absolute', top: -4, right: -4, background: key === 'rdv' ? '#10B981' : '#DC2626', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100, animation: key === 'commandes' ? 'pulse 2s ease infinite' : 'none' }}>{badgeCount}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <button onClick={activerNotifications}
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: `1px solid ${notificationsActives ? T.main : 'rgba(255,255,255,0.15)'}`, background: notificationsActives ? `${T.main}44` : 'rgba(255,255,255,0.08)', cursor: 'pointer', backdropFilter: 'blur(8px)', transition: 'all 0.15s', flexShrink: 0 }}>
                  <IconBell size={15} color={notificationsActives ? '#fff' : T.light} active={notificationsActives}/>
                </button>
                <button onClick={seDeconnecter}
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1px solid #DC262333', background: '#DC262311', cursor: 'pointer', flexShrink: 0 }}>
                  <IconLogout size={15}/>
                </button>
              </div>
            </div>
          </div>

          {/* Sticky header — RDV : stats compactes uniquement (la grille AgendaRdv a sa propre nav) */}
          {ongletPrincipal === 'rdv' && (
            <div className="sticky-header">
              <div className="stats-grid">
                {statsCardsRdv.map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '0.5rem 0.75rem', border: `1.5px solid ${s.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      {s.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block', animation: 'pulse 1.5s ease infinite', flexShrink: 0 }}/>}
                      <p style={{ fontSize: '0.58rem', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</p>
                    </div>
                    <p style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, letterSpacing: '-1px', lineHeight: 1 }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sticky header */}
          {ongletPrincipal === 'commandes' && (
            <div className="sticky-header">
              {/* Stats */}
              <div className="stats-grid">
                {statsCards.map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '0.5rem 0.75rem', border: `1.5px solid ${s.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      {s.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block', animation: 'pulse 1.5s ease infinite', flexShrink: 0 }}/>}
                      <p style={{ fontSize: '0.58rem', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</p>
                    </div>
                    <p style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, letterSpacing: '-1px', lineHeight: 1 }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Sélecteur jours */}
              {joursDispos.length > 0 && (
                <div className="jours-wrap">
                  {joursDispos.map(jour => {
                    const actif = !modeHistorique && jour === jourActif
                    const nbCmds = commandes.filter(c => dateKey(c.date_commande || c.created_at) === jour).length
                    const nbActives = commandes.filter(c => dateKey(c.date_commande || c.created_at) === jour && ['en_attente','en_preparation','pret'].includes(c.statut)).length
                    return (
                      <button key={jour} className="pill" onClick={() => { setJourSelectionne(jour); setModeHistorique(false); setFiltreStatut('actives') }}
                        style={{ borderColor: actif ? T.main : `${T.main}28`, background: actif ? T.main : '#fff', color: actif ? '#fff' : T.ink, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {dateLabel(jour + 'T00:00:00')}
                        {nbActives > 0 && (
                          <span style={{ background: actif ? 'rgba(255,255,255,0.3)' : '#DC2626', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100 }}>{nbActives}</span>
                        )}
                        {nbActives === 0 && nbCmds > 0 && (
                          <span style={{ background: actif ? 'rgba(255,255,255,0.2)' : T.pale, color: actif ? '#fff' : T.main, fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100 }}>{nbCmds}</span>
                        )}
                      </button>
                    )
                  })}
                  {/* Onglet Historique */}
                  <button className="pill" onClick={() => { setModeHistorique(true); setFiltreStatut('tout') }}
                    style={{ borderColor: modeHistorique ? '#6B7280' : `${T.main}28`, background: modeHistorique ? '#6B7280' : '#fff', color: modeHistorique ? '#fff' : T.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ClipboardList size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Historique
                    {commandesHistorique.length > 0 && (
                      <span style={{ background: modeHistorique ? 'rgba(255,255,255,0.3)' : '#E5E7EB', color: modeHistorique ? '#fff' : T.muted, fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100 }}>{commandesHistorique.length}</span>
                    )}
                  </button>
                </div>
              )}

              {/* Filtres statut */}
              <div className="filtres-wrap">
                {filtresStatut.map(f => (
                  <button key={f.key} className="pill" onClick={() => setFiltreStatut(f.key)}
                    style={{ borderColor: filtreStatut === f.key ? (f.color || T.main) : `${T.main}28`, background: filtreStatut === f.key ? (f.color || T.main) : '#fff', color: filtreStatut === f.key ? '#fff' : T.ink }}>
                    {f.label}{f.count > 0 ? ` · ${f.count}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Zone scrollable */}
          <div className="scroll-zone">
            {ongletPrincipal === 'commandes' && (
              <>
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', gap: 10 }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: [T.light, T.mid, T.main][i], animation: `dotPulse 0.8s ease-in-out ${i*0.2}s infinite alternate` }}/>
                    ))}
                  </div>
                )}
                {!loading && commandesFiltrees.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                    <div style={{ marginBottom: '0.75rem' }}/>
                    <p style={{ fontWeight: 800, color: T.ink, marginBottom: 4 }}>Aucune commande ici</p>
                    <p style={{ fontSize: '0.875rem', color: T.muted }}>
                      {filtreStatut === 'actives' ? 'Toutes les commandes sont traitées !' : 'Rien dans ce filtre pour ce jour.'}
                    </p>
                  </div>
                )}
                <div className="commandes-grid">
                  {commandesFiltrees.map(commande => {
                    // En historique, calculer le numéro avec le jour de la commande,
                    // pas le jour actif (sinon le filtre retourne "?")
                    const jourCommande = dateKey(commande.date_commande || commande.created_at)
                    return (
                      <CarteCommande
                        key={commande.id}
                        commande={commande}
                        numero={getNumeroJour(commandes, commande.id, modeHistorique ? jourCommande : jourActif)}
                        onChangerStatut={changerStatut}
                        modeHistorique={modeHistorique}
                      />
                    )
                  })}
                </div>
              </>
            )}

            {ongletPrincipal === 'rdv' && (
              <>
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', gap: 10 }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: [T.light, T.mid, T.main][i], animation: `dotPulse 0.8s ease-in-out ${i*0.2}s infinite alternate` }}/>
                    ))}
                  </div>
                )}
                {!loading && (
                  <AgendaRdv
                    rdvs={rdvs}
                    creneaux={creneauxRdv}
                    horairesDetail={commercant?.horaires_detail}
                    onSelectRdv={(r) => setRdvSelectionne(r)}
                    onNouveauRdv={(date, heure) => setNouveauRdvSlot({ date, heure })}
                  />
                )}
                {/* Modale 'Nouveau RDV manuel' — saisie rapide pour les RDV pris au telephone */}
                {nouveauRdvSlot && commercant && (
                  <ModalNouveauRdv
                    commercant={commercant}
                    prestations={prestationsRdv}
                    creneaux={creneauxRdv}
                    rdvsExistants={rdvs}
                    dateInit={nouveauRdvSlot.date}
                    heureInit={nouveauRdvSlot.heure}
                    onClose={() => setNouveauRdvSlot(null)}
                    onCreated={() => chargerRdvs(commercant.id)}
                  />
                )}
                {/* Modale details RDV : reutilise la CarteRdv qu'on avait codee pour l'ancienne vue liste */}
                {rdvSelectionne && (
                  <div onClick={() => setRdvSelectionne(null)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem', backdropFilter: 'blur(4px)' }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}>
                      <CarteRdv rdv={rdvSelectionne} onChangerStatut={(id, st) => { changerStatutRdv(id, st); setRdvSelectionne(null) }}/>
                      <button onClick={() => setRdvSelectionne(null)}
                        style={{ width: '100%', marginTop: 12, padding: '0.75rem', background: '#fff', border: `1.5px solid ${T.pale}`, borderRadius: 100, color: T.muted, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif' }}>
                        Fermer
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {ongletPrincipal === 'config' && commercant && (
              <ConfigDashboard commercantId={commercant.id}/>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}