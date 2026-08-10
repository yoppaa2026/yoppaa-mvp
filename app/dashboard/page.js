'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import ConfigDashboard from './ConfigDashboard'
import AgendaRdv from './AgendaRdv'
import ModalNouveauRdv from './ModalNouveauRdv'
import { Reply, ClipboardList } from 'lucide-react'
import { canDo } from '@/lib/plans'
import { remplissageCreneaux } from '@/lib/creneaux'
import BandeDefilante from '@/app/components/BandeDefilante'
import { partagerCommandes } from '@/lib/commandes-vue'

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
  'en_attente':              { label: 'Nouvelle',           couleur: T.rouge,  icon: '●', next: 'en_preparation', nextLabel: 'Démarrer la prépa' },
  'en_preparation':          { label: 'En prépa',           couleur: T.orange, icon: '●', next: 'pret',            nextLabel: 'Marquer prête' },
  'pret':                    { label: 'Prête',              couleur: T.vert,   icon: '●', next: null,              nextLabel: null },
  'recupere':                { label: 'Récupérée',          couleur: T.bleu,   icon: '🔵', next: null,              nextLabel: null },
  'non_retire':              { label: 'Non retiré',         couleur: T.gris,   icon: '⚫', next: null, nextLabel: null },
  'annulee_client_refund':   { label: 'Annulée par client', couleur: T.rouge,  icon: '✕', next: null, nextLabel: null },
  'annulee_paiement_ko':     { label: 'Paiement échoué',    couleur: T.gris,   icon: '⊘', next: null, nextLabel: null },
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
// Vert pour 'honore', rouge pour annule_*, gris pour 'no_show', violet pour 'confirme'.
// NB : le CHECK DB sur rdv_reservations.statut n'accepte que les valeurs ci-dessous
// (jamais 'annule' tout court). annule_client vs annule_commercant = qui a annule.
const STATUTS_RDV = {
  'confirme':          { label: 'Confirmé',           couleur: { border: '#6B35C4', badge: '#6B35C4', cardBg: '#EDE0FF' }, icon: '●', actions: ['honore', 'no_show', 'annule_commercant'] },
  'honore':            { label: 'Honoré',             couleur: { border: '#10B981', badge: '#10B981', cardBg: '#F0FDF4' }, icon: '✓', actions: [] },
  'no_show':           { label: 'No-show',            couleur: { border: '#9CA3AF', badge: '#6B7280', cardBg: '#F9FAFB' }, icon: '⊘', actions: ['confirme'] },
  'annule_client':     { label: 'Annulé par client',  couleur: { border: '#DC2626', badge: '#DC2626', cardBg: '#FFF0F0' }, icon: '✕', actions: [] },
  'annule_commercant': { label: 'Annulé',             couleur: { border: '#DC2626', badge: '#DC2626', cardBg: '#FFF0F0' }, icon: '✕', actions: ['confirme'] },
}

const ACTIONS_RDV_LABEL = {
  honore:            { label: 'Marquer honoré',          bg: '#10B981', border: '#10B98144' },
  no_show:           { label: 'No-show',                 bg: '#6B7280', border: '#6B728044' },
  annule_commercant: { label: 'Annuler',                 bg: '#DC2626', border: '#DC262644' },
  confirme:          { label: 'Remettre en confirmé',    bg: '#6B35C4', border: '#6B35C444' },
}

// ─── Carte commande ───────────────────────────────────────────────────────────
function CarteCommande({ commande, numero, onChangerStatut, onLivraisonStatut, onExpedier, modeHistorique = false }) {
  const statut = STATUTS[commande.statut] || STATUTS['en_attente']
  const { couleur } = statut
  const estLivraison = commande.mode_retrait === 'livraison'
  const estExpedition = commande.mode_retrait === 'expedition'
  const statutLiv = commande.statut_livraison

  // Pour une livraison, le badge suit le sous-statut de livraison une fois « Prête » atteinte :
  // Prête → En livraison → Livrée. On surcharge label + couleur uniquement dans ce cas.
  const badge = (() => {
    // Expédition boutique : « Prête » devient « À expédier », état final « Expédiée »
    if (estExpedition) {
      if (commande.statut === 'recupere') return { label: 'Expédiée', icon: '●', couleur: T.bleu }
      if (commande.statut === 'pret') return { label: 'À expédier', icon: statut.icon, couleur }
      return { label: statut.label, icon: statut.icon, couleur }
    }
    if (!estLivraison) return { label: statut.label, icon: statut.icon, couleur }
    if (statutLiv === 'en_livraison') return { label: 'En livraison', icon: '●', couleur: T.bleu }
    if (statutLiv === 'livree' || commande.statut === 'recupere') return { label: 'Livrée', icon: '🔵', couleur: T.bleu }
    return { label: statut.label, icon: statut.icon, couleur }
  })()
  const cren = commande.creneau || commande.creneau_livraison
  const heure = cren
    ? `${cren.heure_debut.slice(0,5)} – ${cren.heure_fin.slice(0,5)}`
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

  // ⚠️ « EN ATTENTE DEPUIS ». Une commande de boutique reste ouverte tant que le
  // client n'est pas passé ou que le colis n'est pas parti : elle remonte donc
  // sur la journée en cours. Sans le dire, le commerçant la prendrait pour une
  // commande du jour et croirait avoir tout le temps devant lui.
  const jourCommande = dateKey(commande.date_commande || commande.created_at)
  const enAttenteDepuis = (!modeHistorique
    && ['en_attente', 'en_preparation', 'pret'].includes(commande.statut)
    && jourCommande && jourCommande < dateKey(new Date()))
    ? dateLabel(jourCommande + 'T00:00:00')
    : null

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
              {enAttenteDepuis && (
                <span style={{ display: 'inline-block', marginTop: 3, background: '#FEF3C7', color: '#92400E', fontSize: '0.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: 100, letterSpacing: '0.2px' }}>
                  En attente depuis {enAttenteDepuis.toLowerCase()}
                </span>
              )}
              {commande.client_telephone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.2 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.11 6.11l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontSize: '0.72rem', color: T.muted, fontWeight: 600 }}>{commande.client_telephone}</span>
                </div>
              )}
              {(estLivraison || estExpedition) && commande.adresse_livraison && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 3 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="#4F46E5" strokeWidth="2"/><circle cx="12" cy="10" r="3" stroke="#4F46E5" strokeWidth="2"/></svg>
                  <span style={{ fontSize: '0.72rem', color: '#4F46E5', fontWeight: 700, lineHeight: 1.3 }}>{commande.adresse_livraison}</span>
                </div>
              )}
              {estExpedition && commande.expedition_suivi && (
                <p style={{ fontSize: '0.72rem', color: T.muted, fontWeight: 700, margin: '3px 0 0' }}>Suivi : {commande.expedition_suivi}</p>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontWeight: 900, color: T.ink, margin: '0 0 4px', fontSize: '1.05rem', letterSpacing: '-0.3px' }}>{Number(commande.total).toFixed(2)}€</p>
            <span style={{ background: badge.couleur.badge, color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '3px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap', display: 'inline-block' }}>
              {badge.icon} {badge.label}
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
                  {/* ⚠️ LE NOM FIGÉ À LA VENTE D'ABORD, la jointure ensuite.
                      Le nom ne venait QUE de la jointure : un article retiré du
                      catalogue, ce qui arrive à chaque fin de collection en
                      boutique de détail, et la ligne affichait « 1× » suivi de
                      RIEN. Le commerçant ne savait plus ce qu'il avait vendu, et
                      la commande devenait illisible pour toujours.
                      Les commandes d'avant la colonne n'ont pas de nom figé :
                      elles continuent de passer par la jointure, comme avant. */}
                  {(() => {
                    const nomVendu = ligne.article_nom || ligne.article?.nom
                    return (
                      <span style={{ fontWeight: 700, color: nomVendu ? T.ink : T.muted, fontStyle: nomVendu ? 'normal' : 'italic' }}>
                        {ligne.quantite}× {nomVendu || 'Article retiré du catalogue'}
                      </span>
                    )
                  })()}
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
        {/* Expédition boutique : à « Prête », remplace le bouton générique par
            « Marquer expédiée » avec saisie du n° de suivi (manuel, optionnel) */}
        {estExpedition && commande.statut === 'pret' && (
          <button onClick={() => {
            const suivi = window.prompt('N° de suivi du colis (optionnel, laisse vide si aucun) :', commande.expedition_suivi || '')
            if (suivi === null) return
            onExpedier(commande.id, suivi.trim())
          }}
            style={{ width: '100%', padding: '0.625rem', background: `linear-gradient(135deg, ${T.bleu.border}, ${T.bleu.border}cc)`, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${T.bleu.border}44`, letterSpacing: '-0.2px' }}>
            Marquer expédiée →
          </button>
        )}
        {statut.next && !(estExpedition && commande.statut === 'pret') && (
          <button onClick={() => onChangerStatut(commande.id, statut.next)}
            style={{ width: '100%', padding: '0.625rem', background: `linear-gradient(135deg, ${couleur.border}, ${couleur.border}cc)`, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${couleur.border}44`, transition: 'opacity 0.15s, transform 0.1s', letterSpacing: '-0.2px' }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'scale(0.99)' }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}>
            {statut.nextLabel} →
          </button>
        )}
        {/* Flux livraison : une fois « Prête », le commerçant enchaîne Partir en livraison → Livrée */}
        {estLivraison && commande.statut === 'pret' && statutLiv !== 'en_livraison' && (
          <button onClick={() => onLivraisonStatut(commande.id, 'en_livraison')}
            style={{ width: '100%', padding: '0.625rem', background: `linear-gradient(135deg, ${T.bleu.border}, ${T.bleu.border}cc)`, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${T.bleu.border}44`, transition: 'opacity 0.15s, transform 0.1s', letterSpacing: '-0.2px', marginTop: 6 }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'scale(0.99)' }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 6 }}><path d="M14 16V4a1 1 0 00-1-1H2a1 1 0 00-1 1v12a1 1 0 001 1h1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 8h4l3 3v5a1 1 0 01-1 1h-1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6.5" cy="17.5" r="1.5" stroke="#fff" strokeWidth="2"/><circle cx="17.5" cy="17.5" r="1.5" stroke="#fff" strokeWidth="2"/></svg>
            Partir en livraison →
          </button>
        )}
        {estLivraison && commande.statut === 'pret' && statutLiv === 'en_livraison' && (
          <button onClick={() => {
            if (window.confirm(`Confirmer la livraison ?\n\nClient : ${commande.client_nom}\n${commande.adresse_livraison || ''}\n\nLa commande sera marquée comme livrée.`)) {
              onLivraisonStatut(commande.id, 'livree')
            }
          }}
            style={{ width: '100%', padding: '0.625rem', background: `linear-gradient(135deg, ${T.vert.border}, ${T.vert.border}cc)`, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${T.vert.border}44`, transition: 'opacity 0.15s, transform 0.1s', letterSpacing: '-0.2px', marginTop: 6 }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'scale(0.99)' }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 6 }}><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Marquer livrée
          </button>
        )}
        {/* Bouton Non retiré — retrait uniquement, visible dès que le créneau est passé, confirmation obligatoire */}
        {!estLivraison && !estExpedition && commande.statut === 'pret' && (() => {
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

        {/* Produits achetés dans le même paiement que le rendez-vous. À
            préparer AVANT que le client arrive : c'est toute la promesse du
            tunnel unique, il repart avec en sortant du fauteuil. Une commande
            annulée ne s'affiche plus, le client ayant été remboursé. */}
        {rdv.commande && !['annulee_client_refund', 'annulee_paiement_ko'].includes(rdv.commande.statut) && (rdv.commande.commande_articles || []).length > 0 && (
          <div style={{ background: '#ECFDF5', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: 8, border: '1px solid #A7F3D0' }}>
            <p style={{ fontSize: '0.62rem', fontWeight: 800, color: '#065F46', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
              Produits à préparer · déjà payés
            </p>
            {rdv.commande.commande_articles.map((l, i) => (
              <p key={i} style={{ fontSize: '0.78rem', color: '#065F46', lineHeight: 1.4, margin: 0, fontWeight: 700 }}>
                {l.quantite} × {l.article?.nom || 'Article'}
              </p>
            ))}
            <p style={{ fontSize: '0.7rem', color: '#047857', margin: '4px 0 0', fontWeight: 800 }}>
              {Number(rdv.commande.total).toFixed(2)}€ encaissés
            </p>
          </div>
        )}

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
                  const msg = action === 'no_show' ? 'Marquer ce client en NO-SHOW ? Le client sera notifié et tu gardes l\'acompte (le créneau était bloqué).'
                            : action === 'annule_commercant' ? 'ANNULER ce RDV ? Le client sera notifié et son acompte (si payé) sera remboursé.'
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
  // Grilles de créneaux alimentaires (retrait + tournées), pour AFFICHER LE
  // REMPLISSAGE au commerçant. Chargées une seule fois par commerce : une grille
  // hebdomadaire ne change pas toutes les minutes, elle n'a rien à faire dans le
  // rafraîchissement des commandes.
  const [creneauxRetrait, setCreneauxRetrait] = useState([])
  const [creneauxLivraison, setCreneauxLivraison] = useState([])
  const [prestationsRdv, setPrestationsRdv] = useState([])  // rdv_prestations actives, pour la modale 'Nouveau RDV manuel'
  const [praticiensRdv, setPraticiensRdv] = useState([])    // rdv_praticiens actifs, pour AgendaRdv (filtre + badges)
  const [rdvSelectionne, setRdvSelectionne] = useState(null)  // RDV ouvert dans la modale details
  const [nouveauRdvSlot, setNouveauRdvSlot] = useState(null)  // { date, heure } -> ouvre la modale d'ajout manuel
  // Mode impersonation : admin Yoppaa connecte en tant qu'un commercant pour le support.
  // Detecte via localStorage yoppaa_admin_impersonating (set depuis /admin "Voir Dashboard").
  // Affiche un banner sticky en haut + bouton Quitter qui revient sur /admin.
  const [impersonating, setImpersonating] = useState(false)
  const [_impersonationId, setImpersonationId] = useState(null)
  const [activationRdv, setActivationRdv] = useState(false)
  // Onglet de configuration ouvert par les raccourcis « Actions rapides »
  const [configTab, setConfigTab] = useState('menu')
  function ouvrirConfig(tab) { setConfigTab(tab); setOngletPrincipal('config') }
  const [commercant, setCommercant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [listeCommercants, setListeCommercants] = useState([])
  const [ongletPrincipal, setOngletPrincipal] = useState('commandes')

  // Raccourci d'email : /dashboard?config=signaux ouvre directement le bon
  // onglet de configuration. Sans lui, un email devrait ÉCRIRE le chemin à
  // suivre au lieu de l'ouvrir.
  useEffect(() => {
    const cible = new URLSearchParams(window.location.search).get('config')
    if (cible) ouvrirConfig(cible)
  }, [])

  // Pour les commerces vitrine SANS vente en ligne (plan < Vendre), on bascule
  // auto sur l'onglet RDV. Une vitrine Vendre vend ses produits au salon (31/07)
  // et garde donc l'onglet Commandes.
  useEffect(() => {
    if (commercant?.categorie === 'vitrine' && !canDo(commercant?.plan, 'commande') && ongletPrincipal === 'commandes') {
      setOngletPrincipal('rdv')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commercant?.id])
  const [filtreStatut, setFiltreStatut] = useState('actives')
  const [vueMode, setVueMode] = useState('retrait')  // vue Commandes : 'retrait' | 'livraison'
  // Une tournée PAR CRÉNEAU : un commerçant qui livre à midi et le soir fait
  // deux tournées distinctes, et mélanger les deux donne un itinéraire absurde.
  // Indexées par identifiant de créneau de livraison.
  const [tournees, setTournees] = useState({})
  const [tourneeLoading, setTourneeLoading] = useState(null)   // id du créneau en cours de calcul
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
      .select(`*, creneau:creneaux(*), creneau_livraison:livraison_creneaux(*), commande_articles(*, article:articles(*))`)
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
    const [{ data: rdvData }, { data: crData }, { data: pData }, { data: praData }] = await Promise.all([
      supabase
        .from('rdv_reservations')
        // La commande liée vient avec : un rendez-vous du tunnel unique porte
        // des produits déjà payés que le commerçant doit préparer AVANT que le
        // client arrive. Sans elle, il les découvrirait dans un autre onglet
        // sans faire le lien avec le créneau. Le hint !..._commande_id_fkey
        // lève l'ambiguïté, les deux tables se pointant désormais l'une l'autre.
        .select('*, prestation:rdv_prestations(nom, duree_minutes, prix), praticien:rdv_praticiens(id, prenom, nom, couleur_hex, photo_url), commande:commandes!rdv_reservations_commande_id_fkey(id, total, statut, commande_articles(quantite, prix_unitaire, article:articles(nom)))')
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
        .select('id, nom, duree_minutes, prix, prix_min, prix_max, acompte_pourcent, ordre, tva_taux')
        .eq('commercant_id', id)
        .eq('actif', true)
        .is('deleted_at', null)
        .order('ordre', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('rdv_praticiens')
        .select('id, prenom, nom, couleur_hex, photo_url, actif, ordre')
        .eq('commercant_id', id)
        .eq('actif', true)
        .is('deleted_at', null)
        .order('ordre', { ascending: true }),
    ])
    setRdvs(rdvData || [])
    setCreneauxRdv(crData || [])
    setPrestationsRdv(pData || [])
    setPraticiensRdv(praData || [])
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  }, [chargerCommandes, router])

  // Active la prise de RDV en ligne depuis l'agenda (zéro friction : le
  // commerçant a déjà saisi prestations, praticiens et créneaux, il ne devrait
  // pas avoir à chercher un toggle dans les Paramètres).
  async function activerPriseRdv() {
    if (!commercant?.id || activationRdv) return
    setActivationRdv(true)
    const { error } = await supabase.from('commercants').update({ rdv_actif: true }).eq('id', commercant.id)
    setActivationRdv(false)
    if (error) { alert(`Activation impossible : ${error.message}`); return }
    setCommercant(c => ({ ...c, rdv_actif: true }))
    chargerRdvs(commercant.id)
  }

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

  // ─── Grilles de créneaux, pour afficher le remplissage ────────────────────
  // Volontairement HORS du polling : ces grilles sont une configuration, pas un
  // flux. Ce qui bouge d'une minute à l'autre, ce sont les commandes, et elles
  // sont déjà rafraîchies. Un effet à part suffit, et il suit le changement de
  // commerce pour les comptes multi-boutiques.
  useEffect(() => {
    if (!commercant?.id) return
    let annule = false
    const cid = commercant.id
    ;(async () => {
      const [{ data: retrait }, { data: livraison }] = await Promise.all([
        supabase.from('creneaux').select('*').eq('commercant_id', cid).eq('actif', true).order('heure_debut'),
        supabase.from('livraison_creneaux').select('*').eq('commercant_id', cid).eq('actif', true).order('heure_debut'),
      ])
      if (annule) return
      setCreneauxRetrait(retrait || [])
      setCreneauxLivraison(livraison || [])
    })()
    return () => { annule = true }
  }, [commercant?.id])

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
        .select(`*, creneau:creneaux(*), creneau_livraison:livraison_creneaux(*), commande_articles(*, article:articles(*))`)
        .eq('commercant_id', commercant.id)
        // Exclut 'paiement_en_attente' : commande créée mais Stripe Checkout pas
        // encore validé. Sinon la notif "Nouvelle commande !" tomberait trop tôt
        // (dès le clic Payer & confirmer, avant la confirmation paiement).
        .neq('statut', 'paiement_en_attente')
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
        // La commande liée vient avec : un rendez-vous du tunnel unique porte
        // des produits déjà payés que le commerçant doit préparer AVANT que le
        // client arrive. Sans elle, il les découvrirait dans un autre onglet
        // sans faire le lien avec le créneau. Le hint !..._commande_id_fkey
        // lève l'ambiguïté, les deux tables se pointant désormais l'une l'autre.
        .select('*, prestation:rdv_prestations(nom, duree_minutes, prix), praticien:rdv_praticiens(id, prenom, nom, couleur_hex, photo_url), commande:commandes!rdv_reservations_commande_id_fkey(id, total, statut, commande_articles(quantite, prix_unitaire, article:articles(nom)))')
        .eq('commercant_id', commercant.id)
        .is('deleted_at', null)
        .order('date_rdv', { ascending: true })
        .order('heure_debut', { ascending: true })
      if (rdvsData) setRdvs(rdvsData)
    }, 5000)

    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  }, [commercant?.id, notificationsActives])

  // Crédit fidélité automatique (Vendre) au statut final. Fire-and-forget,
  // idempotent côté serveur (index unique par commande).
  function crediterFideliteCommande(commandeId) {
    fetch('/api/fidelite/crediter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commande_id: commandeId }),
    }).catch(e => console.warn('[dashboard] credit fidelite KO', e))
  }

  async function changerStatut(commandeId, statut) {
    await supabase.from('commandes').update({ statut }).eq('id', commandeId)
    setCommandes(prev => prev.map(c => c.id === commandeId ? { ...c, statut } : c))

    // Statut final : la commande récupérée remplit la carte de fidélité
    if (statut === 'recupere') crediterFideliteCommande(commandeId)

    // Push OneSignal au Yopper à chaque transition (en préparation, prête),
    // contenu actionnable + clic vers l'onglet Commandes. Fire-and-forget.
    if (statut === 'en_preparation' || statut === 'pret') {
      fetch('/api/commande/push-statut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commande_id: commandeId, statut }),
      }).catch(e => console.warn('[dashboard] push-statut KO', e))
    }

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

  // Flux de statut spécifique livraison : Prête → En livraison → Livrée.
  // À « livrée » on pose aussi statut='recupere' pour que CA/stats/avis fonctionnent
  // (comme un retrait récupéré). Le retrait, lui, s'arrête à « pret » (swipe client).
  // Boutique détail : marque la commande expédiée (statut final recupere) avec
  // le n° de suivi saisi à la main (MVP expédition, colonne expedition_suivi).
  async function expedierCommande(commandeId, suivi) {
    const patch = { statut: 'recupere', expedition_suivi: suivi || null }
    const { error } = await supabase.from('commandes').update(patch).eq('id', commandeId)
    if (error) { alert(`Erreur : ${error.message}`); return }
    setCommandes(prev => prev.map(c => c.id === commandeId ? { ...c, ...patch } : c))
    crediterFideliteCommande(commandeId)

    // ⚠️ PRÉVENIR LE CLIENT, ce que personne ne faisait. L'expédition était le
    // SEUL mode sans aucune nouvelle : le retrait dit « ta commande est prête »,
    // la livraison dit « le commerçant vient de partir », et celui qui avait payé
    // un colis n'apprenait rien. Le numéro de suivi restait dans ce tableau de
    // bord. Envoyé APRÈS la mise à jour en base, pour que la route relise le
    // numéro qui vient d'être enregistré. Non bloquant : l'écran est déjà à jour.
    fetch('/api/emails/commande-expediee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commande_id: commandeId }),
    }).catch(e => console.warn('[dashboard] email commande-expediee KO', e))
  }

  async function changerStatutLivraison(commandeId, statutLivraison) {
    const patch = { statut_livraison: statutLivraison }
    if (statutLivraison === 'livree') patch.statut = 'recupere'
    const { error } = await supabase.from('commandes').update(patch).eq('id', commandeId)
    if (error) {
      console.error('[dashboard] changerStatutLivraison', error)
      alert(`Erreur : ${error.message}`)
      return
    }
    setCommandes(prev => prev.map(c => c.id === commandeId ? { ...c, ...patch } : c))
    if (statutLivraison === 'livree') crediterFideliteCommande(commandeId)

    // Push OneSignal au Yopper (en route / livrée). Non-bloquant : l'UI est déjà à jour.
    fetch('/api/livraison/statut', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commande_id: commandeId, statut_livraison: statutLivraison }),
    }).catch(e => console.warn('[dashboard] push livraison KO', e))
  }

  // Optimise l'ordre de passage des livraisons actives du jour et récupère un
  // lien d'itinéraire. commandesALivrer = livraisons non terminées du jour.
  // Optimise UNE tournée : un créneau, un jour. Le serveur choisit lui-même
  // les commandes concernées — on ne lui envoie plus de liste d'identifiants,
  // qui permettait de réclamer des adresses de livraison sans être personne.
  async function optimiserTournee(creneauLivraisonId) {
    if (!creneauLivraisonId || !commercant?.id) return
    setTourneeLoading(creneauLivraisonId)
    setTournees(prev => ({ ...prev, [creneauLivraisonId]: null }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { alert('Session expirée, reconnecte-toi.'); return }
      const res = await fetch('/api/livraison/tournee-optimisee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          commercant_id: commercant.id,
          date: jourActif,
          creneau_livraison_id: creneauLivraisonId,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        alert(data.error === 'acces_refuse' ? 'Accès refusé.' : (data.error || 'Optimisation impossible.'))
        return
      }
      setTournees(prev => ({ ...prev, [creneauLivraisonId]: data }))
    } catch (e) {
      console.error('[dashboard] optimiserTournee', e)
      alert('Erreur réseau lors de l’optimisation.')
    } finally {
      setTourneeLoading(null)
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
    if (statut === 'annule_commercant') {
      // TODO Sess 4/8 suite : refund Stripe acompte côté commerçant.
      // Pour l'instant on notifie juste le Yopper, le commerçant refund manuellement via Stripe Dashboard.
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
    } else if (statut === 'no_show') {
      // Notif Yopper qu'il a été marqué absent (transparence + permet contestation).
      // L'acompte n'est PAS refundé (le commerçant a bloqué le créneau pour rien).
      fetch('/api/emails/rdv-no-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rdv_id: rdvId }),
      }).catch(e => console.warn('[dashboard] email rdv-no-show KO', e))
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
  // ⚠️ UNE COMMANDE DE BOUTIQUE NON TERMINÉE DISPARAISSAIT LE LENDEMAIN.
  //
  // Le classement par jour a été pensé pour le Click & Collect alimentaire, où
  // la commande est attachée à un CRÉNEAU : passé le jour dit, elle est retirée
  // ou elle ne le sera jamais, et l'historique est sa place naturelle.
  //
  // La boutique de détail ne fonctionne pas comme ça. Il n'y a AUCUN créneau :
  // le client passe « dans la semaine », et un colis part quand il est emballé.
  // Une commande passée lundi et pas encore expédiée basculait donc mardi dans
  // l'Historique, un onglet qu'on ouvre pour chercher, pas pour travailler. Le
  // commerçant devait deviner qu'il lui restait des colis à envoyer.
  //
  // Une commande qui n'est pas finie reste sur le bureau. C'est tout.
  // Le partage lui-même vit dans `lib/commandes-vue.js`, en fonction pure, pour
  // que le banc puisse l'exécuter sur de vraies commandes plutôt que lire ce
  // fichier.
  const jourDeCommande = (c) => dateKey(c.date_commande || c.created_at)
  const { duJour: _duJour, historique: _historique } = partagerCommandes({
    commandes,
    categorie: commercant?.categorie,
    joursDispos,
    jourActif,
    aujourdhui: todayKey,
    jourDe: jourDeCommande,
  })

  const commandesHistorique = _historique
    .sort((a, b) => {
      const dateA = a.date_commande || a.created_at
      const dateB = b.date_commande || b.created_at
      const cmpDate = new Date(dateB) - new Date(dateA)
      if (cmpDate !== 0) return cmpDate
      return (a.numero_commande || 0) - (b.numero_commande || 0)
    })

  const commandesDuJourTous = modeHistorique ? commandesHistorique : _duJour
  // Vue séparée Retrait / Livraison si le commerce a la livraison activée.
  const livraisonActive = !!commercant?.livraison_actif
  const commandesDuJour = livraisonActive
    ? commandesDuJourTous.filter(c => vueMode === 'livraison' ? c.mode_retrait === 'livraison' : c.mode_retrait !== 'livraison')
    : commandesDuJourTous

  // Livraisons du jour encore à livrer, GROUPÉES PAR CRÉNEAU.
  //
  // ⚠️ UNE TOURNÉE = UN CRÉNEAU. Avant, toutes les livraisons du jour partaient
  // dans un seul itinéraire : un commerçant livrant à midi ET le soir recevait
  // un trajet qui mélangeait les deux, donc inutilisable. Le créneau est la
  // seule unité qui a du sens, c'est celle qu'il annonce à ses clients.
  const commandesALivrer = commandesDuJour
    .filter(c => ['en_attente','en_preparation','pret'].includes(c.statut))
    .filter(c => (c.statut_livraison || null) !== 'livree')

  const tourneesDuJour = (() => {
    const par = new Map()
    for (const c of commandesALivrer) {
      const id = c.creneau_livraison_id
      if (!id) continue   // sans créneau, pas de tournée : traité à la main
      if (!par.has(id)) {
        par.set(id, {
          id,
          heure_debut: c.creneau_livraison?.heure_debut || null,
          heure_fin: c.creneau_livraison?.heure_fin || null,
          commandes: [],
        })
      }
      par.get(id).commandes.push(c)
    }
    return [...par.values()].sort((a, b) => String(a.heure_debut || '').localeCompare(String(b.heure_debut || '')))
  })()

  // Les livraisons sans créneau : elles n'entrent dans aucune tournée. On le
  // DIT plutôt que de les laisser disparaître de l'écran d'organisation.
  const livraisonsSansCreneau = commandesALivrer.filter(c => !c.creneau_livraison_id)

  // Remplissage des créneaux du jour affiché, dans la vue affichée.
  //
  // ⚠️ LA CHARGE SE LIT SUR TOUTES LES COMMANDES, pas sur `commandesDuJour` :
  // celle-ci est déjà filtrée par statut et par vue, alors qu'un créneau est
  // occupé par tout ce qui attend d'être préparé, y compris les paiements en
  // cours. Le tri revient à `remplissageCreneaux`, qui applique les mêmes
  // statuts que le serveur.
  //
  // En historique, il n'y a pas de jour à remplir : on n'affiche rien.
  const creneauxRemplis = modeHistorique ? [] : remplissageCreneaux({
    creneaux: vueMode === 'livraison' ? creneauxLivraison : creneauxRetrait,
    commandes,
    jour: jourActif,
    modeCapaciteDefaut: commercant?.mode_capacite,
    champCreneau: vueMode === 'livraison' ? 'creneau_livraison_id' : 'creneau_id',
  })

  const stats = {
    nouvelles:  commandesDuJour.filter(c => c.statut === 'en_attente').length,
    enPrepa:    commandesDuJour.filter(c => c.statut === 'en_preparation').length,
    pretes:     commandesDuJour.filter(c => c.statut === 'pret').length,
    recuperees: commandesDuJour.filter(c => c.statut === 'recupere').length,
    annulees:   commandesDuJour.filter(c => c.statut === 'annulee_client_refund' || c.statut === 'annulee_paiement_ko').length,
    // CA = uniquement commandes effectivement honorées (exclut les annulees pour ne pas fausser)
    ca:         commandesDuJour.filter(c => c.statut !== 'annulee_client_refund' && c.statut !== 'annulee_paiement_ko').reduce((acc, c) => acc + Number(c.total), 0),
  }

  const commandesFiltrees = commandesDuJour.filter(c => {
    if (filtreStatut === 'actives')        return ['en_attente','en_preparation','pret'].includes(c.statut)
    if (filtreStatut === 'en_attente')     return c.statut === 'en_attente'
    if (filtreStatut === 'en_preparation') return c.statut === 'en_preparation'
    if (filtreStatut === 'pret')           return c.statut === 'pret'
    if (filtreStatut === 'recupere')       return c.statut === 'recupere'
    if (filtreStatut === 'non_retire')     return c.statut === 'non_retire'
    if (filtreStatut === 'annulees')       return c.statut === 'annulee_client_refund' || c.statut === 'annulee_paiement_ko'
    return true
  })

  const nonRetires = commandesDuJour.filter(c => c.statut === 'non_retire').length

  const filtresStatut = [
    { key: 'actives',        label: 'Actives',      count: stats.nouvelles + stats.enPrepa + stats.pretes },
    { key: 'en_attente',     label: 'Nouvelles',    count: stats.nouvelles,  color: '#DC2626' },
    { key: 'en_preparation', label: 'En prépa',     count: stats.enPrepa,    color: '#EA580C' },
    { key: 'pret',           label: 'Prêtes',       count: stats.pretes,     color: '#10B981' },
    { key: 'recupere',       label: vueMode === 'livraison' ? 'Livrées' : 'Récupérées', count: stats.recuperees, color: '#2563EB' },
    ...(vueMode === 'livraison' ? [] : [{ key: 'non_retire', label: 'Non retirés', count: nonRetires, color: '#6B7280' }]),
    { key: 'annulees',       label: 'Annulées',     count: stats.annulees,   color: '#DC2626' },
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
      {/* manifest / apple-web-app / theme-color : gérés côté SERVEUR par l'export
          metadata + viewport de app/dashboard/layout.tsx (requis pour l'install PWA
          Android). Ne pas les redéclarer ici (client) : doublon + conflit theme-color. */}

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
              { key: 'commandes', label: 'Commandes',   Icon: IconCommandes, visible: commercant?.categorie !== 'vitrine' || canDo(commercant?.plan, 'commande') },
              // Services : l'onglet Rendez-vous reste visible même module non
              // activé (l'agenda explique alors comment l'activer), sinon un
              // salon qui vend aussi des produits ne voyait que Commandes.
              { key: 'rdv',       label: 'Rendez-vous', Icon: IconRdv,       visible: !!commercant?.rdv_actif || (commercant?.categorie === 'vitrine' && canDo(commercant?.plan, 'rdv')) },
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
            {/* Mentions légales, CGU commerçant et confidentialité. Même
                exigence que côté client : les stores veulent ces textes
                atteignables depuis l'application. Le commerçant, lui, a en
                plus un intérêt direct à retrouver ses conditions et le DPA
                sans les chercher sur le site. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4, paddingTop: 10, borderTop: `1px solid ${T.main}22` }}>
              {[
                { href: '/legal#cgu-commercant', label: 'Conditions' },
                { href: '/legal#confidentialite', label: 'Confidentialité' },
                { href: '/legal#dpa', label: 'DPA' },
              ].map(l => (
                <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.7rem', fontWeight: 600, color: T.light, opacity: 0.75, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  {l.label}
                </a>
              ))}
            </div>
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
                  { key: 'commandes', label: 'Cmd',    Icon: IconCommandes, visible: commercant?.categorie !== 'vitrine' || canDo(commercant?.plan, 'commande') },
                  { key: 'rdv',       label: 'RDV',    Icon: IconRdv,       visible: !!commercant?.rdv_actif || (commercant?.categorie === 'vitrine' && canDo(commercant?.plan, 'rdv')) },
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

          {/* ─── Actions rapides (esprit ODOO : les gestes de comptoir sont à
              portée de clic depuis l'écran d'accueil, sans fouiller les
              Paramètres). Demande Alex 01/08. ─── */}
          {ongletPrincipal !== 'config' && commercant && (() => {
            const actions = [
              canDo(commercant.plan, 'fidelite') && {
                key: 'fidelite',
                label: commercant.fidelite_actif ? 'Carte de fidélité' : 'Activer la fidélité',
                aide: commercant.fidelite_actif ? 'Pointer un client au comptoir' : 'Programme en 2 minutes',
                icone: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/></svg>,
              },
              canDo(commercant.plan, 'bons_cadeaux') && commercant.bons_cadeaux_actif && {
                key: 'bons',
                label: 'Bon cadeau',
                aide: 'Encaisser un code',
                icone: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>,
              },
              canDo(commercant.plan, 'deals') && {
                key: 'deals',
                label: 'Deal du jour',
                aide: 'Créer une offre',
                icone: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12l-8.5 8.5a2 2 0 01-2.83 0L2 13.83V4h9.83L20 12z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>,
              },
            ].filter(Boolean)
            if (actions.length === 0) return null
            return (
              <BandeDefilante libelle="les raccourcis" style={{ display: 'flex', gap: 8, padding: '0 1rem', marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
                {actions.map(a => (
                  <button key={a.key} onClick={() => ouvrirConfig(a.key)}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', borderRadius: 12, border: `1.5px solid ${T.pale}`, background: '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'left', boxShadow: '0 1px 6px rgba(22,6,54,0.05)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: T.pale, flexShrink: 0 }}>{a.icone}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: T.ink, whiteSpace: 'nowrap' }}>{a.label}</span>
                      <span style={{ display: 'block', fontSize: '0.66rem', color: T.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>{a.aide}</span>
                    </span>
                  </button>
                ))}
              </BandeDefilante>
            )
          })()}

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

              {/* Bascule Retrait / Livraison (si le commerce livre) */}
              {livraisonActive && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {[
                    { v: 'retrait', label: 'Retrait', n: commandesDuJourTous.filter(c => c.mode_retrait !== 'livraison').length },
                    { v: 'livraison', label: 'Livraison', n: commandesDuJourTous.filter(c => c.mode_retrait === 'livraison').length },
                  ].map(m => (
                    <button key={m.v} onClick={() => { setVueMode(m.v); setFiltreStatut('actives') }}
                      /* T.hairline n'existe pas dans la palette de cet écran : le bouton
                         inactif rendait « 2px solid undefined », donc AUCUN contour. */
                      style={{ flex: 1, padding: '9px', borderRadius: 10, border: `2px solid ${vueMode === m.v ? T.main : T.pale}`, background: vueMode === m.v ? T.main : '#fff', color: vueMode === m.v ? '#fff' : T.ink, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                      {m.label}{m.n > 0 ? ` · ${m.n}` : ''}
                    </button>
                  ))}
                </div>
              )}

              {/* Sélecteur jours */}
              {joursDispos.length > 0 && (
                <BandeDefilante className="jours-wrap" libelle="les jours">
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
                </BandeDefilante>
              )}

              {/* Filtres statut */}
              <BandeDefilante className="filtres-wrap" libelle="les filtres">
                {filtresStatut.map(f => (
                  <button key={f.key} className="pill" onClick={() => setFiltreStatut(f.key)}
                    style={{ borderColor: filtreStatut === f.key ? (f.color || T.main) : `${T.main}28`, background: filtreStatut === f.key ? (f.color || T.main) : '#fff', color: filtreStatut === f.key ? '#fff' : T.ink }}>
                    {f.label}{f.count > 0 ? ` · ${f.count}` : ''}
                  </button>
                ))}
              </BandeDefilante>
            </div>
          )}

          {/* Zone scrollable */}
          <div className="scroll-zone">
            {ongletPrincipal === 'commandes' && (
              <>
                {/* Remplissage des créneaux du jour.
                    Le commerçant règle « max 5 » ou « 30 min » dans sa configuration et
                    son client lit « presque plein » sur la fiche : jusqu'ici, lui seul
                    ne voyait rien et devait compter ses commandes à la main. */}
                {creneauxRemplis.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 12, border: `1px solid ${T.pale}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                      <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Remplissage {vueMode === 'livraison' ? 'des tournées' : 'des créneaux'}
                      </p>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: T.main }}>{dateLabel(jourActif + 'T00:00:00')}</span>
                    </div>
                    <BandeDefilante libelle="les créneaux" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                      {creneauxRemplis.map(({ creneau, modeTemps, capacite, utiliseEff, complet, bientot, presque }) => {
                        const couleur = complet ? T.rouge.badge : bientot ? T.orange.badge : presque ? '#CA8A04' : T.vert.badge
                        const ratio = capacite > 0 ? Math.min(1, utiliseEff / capacite) : 0
                        const etat = complet ? 'Complet' : bientot ? 'Bientôt plein' : presque ? 'Presque plein' : utiliseEff === 0 ? 'Libre' : 'De la place'
                        return (
                          <div key={creneau.id} style={{ minWidth: 98, flexShrink: 0, borderRadius: 10, padding: '8px 10px', background: complet ? T.rouge.cardBg : '#FBFAFF', border: `1.5px solid ${couleur}33` }}>
                            <p style={{ fontSize: '0.72rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.2px' }}>
                              {String(creneau.heure_debut || '').slice(0, 5)}–{String(creneau.heure_fin || '').slice(0, 5)}
                            </p>
                            <p style={{ fontSize: '0.95rem', fontWeight: 900, color: couleur, lineHeight: 1.2, marginTop: 2 }}>
                              {Math.round(utiliseEff)}<span style={{ color: T.muted, fontWeight: 800 }}>/{Math.round(capacite)}</span>
                              {modeTemps && <span style={{ fontSize: '0.58rem', fontWeight: 700, color: T.muted, marginLeft: 3 }}>min</span>}
                            </p>
                            <div style={{ height: 4, borderRadius: 100, background: '#EEE9F8', overflow: 'hidden', marginTop: 5 }}>
                              <div style={{ width: `${ratio * 100}%`, height: '100%', background: couleur, borderRadius: 100 }}/>
                            </div>
                            <p style={{ fontSize: '0.56rem', fontWeight: 800, color: couleur, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{etat}</p>
                          </div>
                        )
                      })}
                    </BandeDefilante>
                  </div>
                )}

                {/* Tournées du jour, UNE PAR CRÉNEAU (vue Livraison) */}
                {vueMode === 'livraison' && !modeHistorique && tourneesDuJour.map(t => {
                  const tournee = tournees[t.id]
                  const enCours = tourneeLoading === t.id
                  const plage = t.heure_debut && t.heure_fin
                    ? `${String(t.heure_debut).slice(0, 5)} – ${String(t.heure_fin).slice(0, 5)}`
                    : 'Créneau'
                  return (
                  <div key={t.id} style={{ background: 'linear-gradient(135deg, #EEF2FF, #fff)', border: '1.5px solid #4F46E533', borderRadius: 14, padding: '0.875rem 1rem', margin: '0 0 0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 20l-5.5 2V6l5.5-2m0 16l6-2m-6 2V4m6 14l5.5 2V6l-5.5-2m0 16V4m0 0L9 6" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span style={{ fontWeight: 800, color: T.ink, fontSize: 14 }}>
                          Tournée {plage} · {t.commandes.length} livraison{t.commandes.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <button onClick={() => optimiserTournee(t.id)} disabled={!!tourneeLoading}
                        style={{ padding: '8px 14px', borderRadius: 100, border: 'none', background: enCours ? '#A5B4FC' : 'linear-gradient(135deg, #4F46E5, #6366F1)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: tourneeLoading ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 14px #4F46E544' }}>
                        {enCours ? 'Calcul…' : 'Optimiser la tournée'}
                      </button>
                    </div>

                    {tournee?.ordre?.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {tournee.ordre.map(o => (
                            <li key={o.commande_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg, #4F46E5, #6366F1)', color: '#fff', fontWeight: 900, fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{o.position}</span>
                              <span style={{ fontSize: 13, color: T.deep, lineHeight: 1.35, paddingTop: 2 }}>
                                <strong style={{ color: '#4F46E5' }}>#{o.numero}</strong> · {o.adresse || 'adresse inconnue'}
                              </span>
                            </li>
                          ))}
                        </ol>

                        {tournee.sans_coords?.length > 0 && (
                          <p style={{ fontSize: 11.5, color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 9px', marginTop: 8 }}>
                            {tournee.sans_coords.length} commande{tournee.sans_coords.length > 1 ? 's' : ''} sans adresse géolocalisée, non incluse{tournee.sans_coords.length > 1 ? 's' : ''} dans l’itinéraire (#{tournee.sans_coords.map(s => s.numero).join(', #')}). À faire à la main.
                          </p>
                        )}

                        {/* ⚠️ Maps n'accepte que 9 étapes par lien : au-delà il les
                            ignore SANS RIEN DIRE. On découpe, et on annonce le
                            découpage plutôt que de laisser croire à un trajet complet. */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                          {(tournee.itineraires || []).map((seg, i) => (
                            <a key={i} href={seg.url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 100, background: T.ink, color: '#fff', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="#fff" strokeWidth="2"/><circle cx="12" cy="10" r="3" stroke="#fff" strokeWidth="2"/></svg>
                              {(tournee.itineraires || []).length > 1
                                ? `Itinéraire ${i + 1}/${tournee.itineraires.length} · #${seg.de} → #${seg.a}`
                                : 'Ouvrir l’itinéraire'}
                            </a>
                          ))}
                        </div>
                        {(tournee.itineraires || []).length > 1 && (
                          <span style={{ display: 'block', fontSize: 10.5, color: T.muted, marginTop: 6 }}>
                            Maps limite un itinéraire à dix arrêts : ta tournée est découpée en {tournee.itineraires.length} liens qui s’enchaînent.
                          </span>
                        )}
                        {tournee.methode === 'plus_proche_voisin' && (
                          <span style={{ display: 'block', fontSize: 10.5, color: T.muted, marginTop: 6 }}>Ordre calculé au plus proche. Itinéraire routier optimal via l’app Maps.</span>
                        )}
                      </div>
                    )}
                  </div>
                  )
                })}

                {/* Livraisons sans créneau : elles n'entrent dans aucune tournée. */}
                {vueMode === 'livraison' && !modeHistorique && livraisonsSansCreneau.length > 0 && (
                  <p style={{ fontSize: 12, color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '8px 11px', margin: '0 0 0.875rem' }}>
                    {livraisonsSansCreneau.length} livraison{livraisonsSansCreneau.length > 1 ? 's' : ''} sans créneau (#{livraisonsSansCreneau.map(c => c.numero_commande).join(', #')}) :
                    elle{livraisonsSansCreneau.length > 1 ? 's n\'entrent' : ' n\'entre'} dans aucune tournée, à organiser à la main.
                  </p>
                )}
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
                        onLivraisonStatut={changerStatutLivraison}
                        onExpedier={expedierCommande}
                        modeHistorique={modeHistorique}
                      />
                    )
                  })}
                </div>
              </>
            )}

            {ongletPrincipal === 'rdv' && (
              <>
                {/* Module RDV pas encore activé : l'agenda serait vide et muet.
                    Zéro friction : on l'active ICI en un clic, pas d'aller-retour
                    vers les Paramètres (demande Alex 01/08). */}
                {!commercant?.rdv_actif && (
                  <div style={{ background: '#fff', border: `1.5px solid ${T.pale}`, borderRadius: 16, padding: '1rem 1.125rem', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <IconRdv size={22} color={T.main}/>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 800, color: T.ink, fontSize: '0.92rem', marginBottom: 4 }}>La prise de rendez-vous n&rsquo;est pas encore activée</p>
                      <p style={{ fontSize: '0.8rem', color: T.muted, lineHeight: 1.55, marginBottom: 10 }}>
                        Tes prestations, praticiens et créneaux sont prêts. Active la réservation en ligne : ta fiche affichera aussitôt tes créneaux libres, et les rendez-vous atterriront dans cet agenda.
                      </p>
                      <button onClick={activerPriseRdv} disabled={activationRdv}
                        style={{ padding: '9px 18px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: activationRdv ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${T.main}55` }}>
                        {activationRdv ? 'Activation…' : 'Activer la prise de rendez-vous'}
                      </button>
                    </div>
                  </div>
                )}
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
                    praticiens={praticiensRdv}
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
              <ConfigDashboard key={configTab} commercantId={commercant.id} tabInitial={configTab}/>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}