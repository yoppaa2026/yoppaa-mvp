'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
// ⚠️ `prevenirClient` LIT LA RÉPONSE, `postPro` ne fait que la rendre. Les
// appels qui engagent le CLIENT passent par le premier : un email qui ne part
// pas doit se voir (Alex, 27/08).
import { postPro, prevenirClient } from '@/lib/fetch-pro'
import { supabase } from '@/lib/supabase'
import { marquerDeconnexionVoulue } from '@/lib/session-permanente'
import { retourArriereAutorise, alerteAutreOnglet, indexBlocages, appliquerBlocage, etatCreneau } from '@/lib/tableau-de-bord'
import { useRouter } from 'next/navigation'
import ConfigDashboard from './ConfigDashboard'
import AgendaRdv from './AgendaRdv'
import ModalNouveauRdv from './ModalNouveauRdv'
import ModaleConfirmation from './ModaleConfirmation'
import PosteConfirmation, { confirme } from './PosteConfirmation'
import { jourBruxelles } from '@/lib/timezone'
import { questionRdv, confirmationRdv, statutDepuisChoix, questionSeanceHonoree, confirmationSeanceHonoree, confirmationEncaissement, questionEncaissement, nomClient } from '@/lib/confirmation-rdv'
import { confirmationSimple } from '@/lib/confirmations'
import { etatPaiementRdv, etatPaiementCommande, couleurPaiement, caDesRdvs, resteAEncaisser, resteAEncaisserCommande } from '@/lib/rdv-paiement'
import ModalDeplacerRdv from './ModalDeplacerRdv'
import ModaleExpedition from './ModaleExpedition'
import { libelleExpedition, suiviUrl } from '@/lib/transporteurs'
import { Reply, ClipboardList } from 'lucide-react'
// ⚠️ `planEffectif` ET NON `commercant.plan` : c'est ce qui fait qu'un essai en
// cours se voit dans la navigation. La PORTÉE ne change pas d'un pouce (canDo
// sans catégorie, comme avant), seul le forfait lu devient celui qui est
// vraiment en vigueur. ⚠️ Cette fonction a besoin de `created_at` : le
// chargement de cet écran fait bien `select('*')`.
import { canDo, planEffectif } from '@/lib/plans'
import { remplissageCreneaux } from '@/lib/creneaux'
import BandeDefilante from '@/app/components/BandeDefilante'
import { partagerCommandes } from '@/lib/commandes-vue'
import { nouveauxRdvs, idsDes, texteAlerteRdv } from '@/lib/alerte-rdv'
import { referenceCommande, referenceRdv } from '@/lib/numero-commande'
import { libelleOptions } from '@/lib/options-ligne'
import { bonsDuJour, resumeBonsVendus, texteBonVendu } from '@/lib/bons-vendus'
import { eurosNus } from '@/lib/montants'
import { peutMarquerNonRetire, ancienneteCommande } from '@/lib/rappels-retrait'
import { libellePeriodeStats } from '@/lib/agenda-bloc'
import { compterAClore } from '@/lib/rdv-statut'
import { accesDashboard } from '@/lib/statut-commercant'
import EcranValidation from './EcranValidation'

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
  // ⚠️ LE CLICK AND COLLECT S'ARRÊTAIT ICI, EN CUL-DE-SAC (Alex, 17/08 : « je
  // ne sais pas la mettre en récupérée »). La livraison enchaînait « Partir en
  // livraison → Livrée », l'expédition « Marquer expédiée », et le retrait en
  // boutique n'avait RIEN : une commande prête le restait indéfiniment, avec
  // pour seule sortie « Non retiré ». Le geste le plus banal du comptoir,
  // remettre le paquet, n'existait pas.
  'pret':                    { label: 'Prête',              couleur: T.vert,   icon: '●', next: 'recupere',        nextLabel: 'Remettre au client' },
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
  // ⚠️ Timestamp → jour civil BELGE, et pas le fuseau de la machine.
  // L ancien calcul soustrayait `getTimezoneOffset()`, donc le fuseau du
  // navigateur : juste depuis Mettet, faux depuis un serveur en UTC ou depuis
  // un commerçant en vacances. Le fuseau se nomme, il ne se devine pas.
  return jourBruxelles(date)
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
// ⚠️ IL Y AVAIT UN REPLI ICI, ET IL MENTAIT. Quand le numéro manquait, cette
// fonction rendait « la position du jour » alors que la base numérote par
// SEMAINE : le commerçant pouvait chercher « 12 » là où son client annonçait
// « 3 ». Sur le seul point où ils doivent se comprendre, les deux écrans ne
// disaient pas la même chose.
//
// Le compteur en base attribue désormais la référence à coup sûr, sous verrou
// (MIGRATION_NUMERO_COMMANDE). Il n'y a plus rien à suppléer, et une commande
// sans référence affiche « ? » plutôt qu'un chiffre inventé.
function getNumeroJour(commandes, commandeId) {
  const commande = commandes.find(c => c.id === commandeId)
  return referenceCommande(commande || {}) || '?'
}

// ─── Ce que le tableau de bord demande à la base ──────────────────────────────
//
// ⚠️ UNE SEULE DÉFINITION POUR DEUX LECTURES. Les commandes comme les rendez-
// vous sont chargés à l'ouverture ET relus toutes les cinq secondes, par deux
// `select` recopiés à l'identique. Celui qui gagne une colonne sans l'autre fait
// clignoter l'écran : la donnée s'affiche au chargement puis disparaît au relevé
// suivant, et rien n'explique pourquoi.
//
// ⚠️ LE HINT `!nom_de_contrainte` EST OBLIGATOIRE. Les deux tables se pointent
// l'une l'autre (`commandes.rdv_reservation_id` et `rdv_reservations.commande_id`)
// depuis MIGRATION_RDV_COMMANDE_LIEE : sans lui, PostgREST ne sait pas quelle
// relation suivre et refuse la requête.
const SELECT_COMMANDES = `*, creneau:creneaux(*), creneau_livraison:livraison_creneaux(*), commande_articles(*, article:articles(*)), rdv:rdv_reservations!commandes_rdv_reservation_id_fkey(id, numero_rdv, numero_prefixe, date_rdv, heure_debut, heure_fin, statut, prestation:rdv_prestations(nom), praticien:rdv_praticiens(prenom))`

// Côté rendez-vous, la commande liée vient avec sa RÉFÉRENCE et le détail de ses
// lignes : c'est ce qui permet au commerçant de retrouver le paquet dans son
// onglet Commandes au lieu de le chercher au jugé.
const SELECT_RDVS = `*, prestation:rdv_prestations(nom, duree_minutes, prix), praticien:rdv_praticiens(id, prenom, nom, couleur_hex, photo_url), commande:commandes!rdv_reservations_commande_id_fkey(id, numero_commande, numero_prefixe, numero_semaine, total, statut, commande_articles(quantite, article_nom, options, article:articles(nom)))`

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

// ⚠️ `tag` DOIT DIFFÉRER SELON CE QU'ON ANNONCE. Deux notifications qui portent
// le même tag se REMPLACENT : une commande arrivée juste après un rendez-vous
// effaçait l'annonce du rendez-vous, et le commerçant n'en entendait jamais
// parler. Le tag était figé sur « yoppaa-commande » pour tout le monde.
function envoyerNotification(titre, body, tag = 'yoppaa-commande') {
  // 1. Notification système (son natif du device)
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(titre, {
        body,
        icon: '/icon-pro-192.png',
        badge: '/icon-pro-192.png',
        tag,
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
function CarteCommande({ commande, numero, onChangerStatut, onLivraisonStatut, onExpedier, onProduitsRemis, onRetourArriere, filtreCourant, modeHistorique = false }) {
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

  // Ce que le commerçant doit préparer, dit en un mot.
  const libelleMode = estExpedition ? 'Colis à envoyer'
    : estLivraison ? 'À livrer'
    : commande.creneau_id ? 'Click & Collect'
    : 'Retrait en magasin'

  // La date d'enlèvement, en toutes lettres. Le carré du numéro la donne en
  // abrégé, mais « mer. 12/08 » collé sous un chiffre se lit mal quand on
  // cherche vite.
  const dateLisible = dateRef ? (() => {
    const jour = dateKey(dateRef)
    const aujourdhui = dateKey(new Date())
    const demainD = new Date(); demainD.setDate(demainD.getDate() + 1)
    if (jour === aujourdhui) return "Aujourd'hui"
    if (jour === dateKey(demainD)) return 'Demain'
    return dateLabel(jour + 'T00:00:00')
  })() : null

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
        {/* ⚠️ LES DEUX COLONNES DOIVENT POUVOIR RÉTRÉCIR, ET UNE SEULE DOIT LE
            FAIRE. Sans `minWidth: 0`, un enfant de flex refuse de descendre
            sous la largeur de son contenu : une adresse un peu longue ou un
            email gonflaient la colonne de gauche, poussaient la colonne de
            droite HORS de la carte, et `overflow: hidden` la coupait net. Le
            commerçant perdait le montant, l'état et « à payer » : exactement
            les trois choses qu'il lit en premier (Alex, 26/08, capture à
            l'appui). La colonne de droite, elle, ne rétrécit JAMAIS : ses
            pastilles sont en `nowrap` et se couperaient à leur tour. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: '0.625rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {/* Numéro + date dans le carré */}
            <div style={{ minWidth: 44, borderRadius: 10, background: `linear-gradient(135deg, ${couleur.border}, ${couleur.border}bb)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: `0 3px 10px ${couleur.border}44`, padding: '6px 6px', gap: 2 }}>
              <span style={{ fontWeight: 900, fontSize: '0.9rem', lineHeight: 1 }}>#{numero}</span>
              {dateFormatee && <span style={{ fontSize: '0.55rem', fontWeight: 700, opacity: 0.85, textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{dateFormatee}</span>}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontWeight: 800, color: T.ink, margin: 0, fontSize: '0.95rem', letterSpacing: '-0.2px', overflowWrap: 'anywhere' }}>{nomAffiche}</p>
              {/* ⚠️ CE QUE LE COMMERÇANT DOIT LIRE SANS OUVRIR : quoi, quand,
                  comment. Il n'avait que le prénom et le téléphone. Le MODE dit
                  s'il prépare un colis, une remise au comptoir ou une tournée ;
                  la DATE dit pour quand. Sans ça il ouvrait chaque commande. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: couleur.border, background: `${couleur.border}14`, border: `1px solid ${couleur.border}33`, padding: '1px 7px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                  {libelleMode}
                </span>
                {dateLisible && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: T.ink }}>{dateLisible}</span>
                )}
                {heure && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: couleur.border, fontWeight: 800 }}>
                    <IconClock size={10} color={couleur.border}/>{heure}
                  </span>
                )}
              </div>
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
                  <span style={{ fontSize: '0.72rem', color: '#4F46E5', fontWeight: 700, lineHeight: 1.3 }}>
                    {commande.adresse_livraison}
                    {/* ⚠️ UNE ADRESSE NON LOCALISÉE SE DIT, elle ne se devine
                        pas. Elle sortira de l'itinéraire optimisé : le
                        commerçant doit le savoir en préparant sa tournée, pas
                        en cherchant pourquoi il lui reste un sac. */}
                    {estLivraison && !(typeof commande.livraison_lat === 'number') && (
                      <span style={{ display: 'inline-block', marginLeft: 6, background: '#FFF7ED', border: '1px solid #FED7AA', color: '#9A3412', fontSize: '0.62rem', fontWeight: 800, padding: '1px 6px', borderRadius: 100, verticalAlign: 'middle' }}>
                        non localisée
                      </span>
                    )}
                  </span>
                </div>
              )}
              {/* ⚠️ LE MOT DU YOPPER, ET IL SAUTE AUX YEUX (Alex, 22/08 : « le
                  commerçant doit voir facilement cette note car elle est
                  importante »). Depuis que l'adresse est normalisée par le
                  géocodeur, c'est ici que vivent « portail bleu » et « sonner
                  chez le voisin » : sans mise en évidence, on aurait gagné la
                  tournée et perdu la porte. */}
              {(estLivraison || estExpedition) && commande.note_livraison && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 5, background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '5px 8px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontSize: '0.72rem', color: '#92400E', fontWeight: 700, lineHeight: 1.4 }}>{commande.note_livraison}</span>
                </div>
              )}
              {/* ⚠️ LE TRANSPORTEUR AVEC LE NUMÉRO, jamais le numéro seul
                  (Alex, 26/08). Deux jours après avoir déposé le paquet, un
                  commerçant ne sait plus chez qui il l'a laissé : une suite de
                  seize chiffres ne le lui dit pas. */}
              {estExpedition && libelleExpedition(commande.expedition_transporteur, commande.expedition_suivi) && (
                <p style={{ fontSize: '0.72rem', color: T.muted, fontWeight: 700, margin: '3px 0 0', overflowWrap: 'anywhere' }}>
                  Suivi : {libelleExpedition(commande.expedition_transporteur, commande.expedition_suivi)}
                  {suiviUrl(commande.expedition_transporteur, commande.expedition_suivi) && (
                    <a href={suiviUrl(commande.expedition_transporteur, commande.expedition_suivi)}
                      target="_blank" rel="noopener noreferrer"
                      style={{ marginLeft: 6, color: T.main, fontWeight: 800, textDecoration: 'underline' }}>
                      suivre
                    </a>
                  )}
                </p>
              )}
              {/* L'adresse mail : le seul moyen de joindre un client qui n'a pas
                  laissé de numéro, et le commerçant n'y avait pas accès. */}
              {commande.client_email && (
                <p style={{ fontSize: '0.68rem', color: T.muted, fontWeight: 600, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                  {commande.client_email}
                </p>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontWeight: 900, color: T.ink, margin: '0 0 4px', fontSize: '1.05rem', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>{Number(commande.total).toFixed(2)}€</p>
            <span style={{ background: badge.couleur.badge, color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '3px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap', display: 'inline-block' }}>
              {badge.icon} {badge.label}
            </span>
            {/* ⚠️ UN TOTAL N'EST PAS UN ÉTAT (Alex, 17/08 : « rien n'indique le
                montant à payer quel que soit le statut »). Le chiffre au-dessus
                dit ce que vaut la commande, pas si le commerçant doit tendre la
                main. Le rendez-vous portait cette pastille depuis le matin, la
                commande non : même défaut, même code couleur, même module. */}
            {(() => {
              const p = etatPaiementCommande(commande)
              if (!p) return null
              const c = couleurPaiement(p)
              return (
                <span style={{ display: 'block', marginTop: 4, fontSize: '0.65rem', fontWeight: 900, color: c.texte, background: c.fond, border: `1px solid ${c.bord}`, padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                  {p.libelle}
                </span>
              )
            })()}
          </div>
        </div>
        {/* Ce que la pastille ne peut pas contenir : le bon cadeau déduit, le
            moyen déclaré. Une ligne, sous l'entête, et seulement s'il y a
            quelque chose à dire. */}
        {(() => {
          const p = etatPaiementCommande(commande)
          if (!p?.detail) return null
          return <p style={{ fontSize: '0.7rem', color: T.muted, fontWeight: 600, margin: '0 0 8px' }}>{p.detail}</p>
        })()}
        {/* ⚠️ CETTE COMMANDE N'EST PEUT-ÊTRE PAS À PRÉPARER POUR LE COMPTOIR, et
            rien ne le disait. Les produits achetés dans le tunnel de rendez-vous
            créent une commande ORDINAIRE, qui atterrit dans cette liste au
            milieu des retraits en magasin. Le commerçant la voyait « prête »,
            attendait un client qui ne viendrait jamais la chercher, puisqu'on
            les lui remet au fauteuil, et finissait par la marquer non retirée.
            Le lien existe en base depuis MIGRATION_RDV_COMMANDE_LIEE ; aucun des
            deux écrans ne le lisait. */}
        {commande.rdv && (
          <div style={{ background: '#F5F3FF', borderRadius: 10, padding: '0.5rem 0.75rem', marginBottom: '0.625rem', border: '1px solid #DDD6FE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Lié à un rendez-vous
              </span>
              {referenceRdv(commande.rdv) && (
                <span style={{ fontSize: '0.68rem', fontWeight: 900, color: '#fff', background: T.main, borderRadius: 100, padding: '1px 8px', whiteSpace: 'nowrap' }}>
                  #{referenceRdv(commande.rdv)}
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: T.ink, margin: 0, lineHeight: 1.4 }}>
              {commande.rdv.date_rdv ? dateLabel(commande.rdv.date_rdv + 'T00:00:00') : 'Date inconnue'}
              {commande.rdv.heure_debut ? ` à ${String(commande.rdv.heure_debut).slice(0, 5)}` : ''}
              {commande.rdv.prestation?.nom ? ` · ${commande.rdv.prestation.nom}` : ''}
              {commande.rdv.praticien?.prenom ? ` · avec ${commande.rdv.praticien.prenom}` : ''}
            </p>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: T.muted, margin: '2px 0 0', lineHeight: 1.4 }}>
              À remettre pendant la prestation. Le client ne passera pas les chercher.
            </p>
            {/* Le filet. Marquer le rendez-vous honoré clôture normalement cette
                commande toute seule ; ce bouton sert quand la prestation s'est
                passée sans que les produits soient remis, ou l'inverse. */}
            {!modeHistorique && ['en_attente', 'en_preparation', 'pret'].includes(commande.statut) && (
              <button onClick={async () => {
                if (await confirme(confirmationSimple({ titre: 'Tu as remis ces produits ?', message: 'La commande passera en récupérée.', action: 'Oui, je les ai remis', ton: 'principal' }))) onProduitsRemis?.(commande.id)
              }}
                style={{ width: '100%', marginTop: 8, padding: '0.5rem', background: T.main, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.78rem', fontFamily: '"DM Sans", sans-serif' }}>
                Produits remis au client
              </button>
            )}
          </div>
        )}
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
        {/* ⚠️ LA COMMANDE DOIT VIEILLIR SOUS LES YEUX DU COMMERÇANT.
            Jusqu'ici, une commande prête restait « Prête » sans jamais rien
            dire : elle pouvait dormir des semaines sur une étagère, son stock
            retiré des rayons, sans que rien ne la distingue de celle d'il y a
            dix minutes. C'est le pendant des rappels envoyés au client :
            puisque l'annulation lui appartient — décision d'Alex du 11/08 —
            encore faut-il qu'il voie ce qu'il a à décider.
            Rien avant vingt-quatre heures : afficher « prête depuis 3 heures »
            sur toutes les commandes du jour ne serait que du bruit. */}
        {commande.statut === 'pret' && (() => {
          const age = ancienneteCommande(commande.pret_at, new Date())
          if (!age) return null
          return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '3px 10px', borderRadius: 100, background: age.urgent ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${age.urgent ? '#DC262633' : '#F59E0B44'}` }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={age.urgent ? '#DC2626' : '#B45309'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: age.urgent ? '#991B1B' : '#92400E' }}>{age.texte}</span>
            </div>
          )
        })()}
        {/* Expédition boutique : à « Prête », remplace le bouton générique par
            « Marquer expédiée », qui ouvre la fenêtre transporteur + suivi.
            🔴 C'ÉTAIT UN `window.prompt()` JUSQU'AU 26/08 : la boîte grise du
            système, un seul champ, et pas de transporteur. */}
        {estExpedition && commande.statut === 'pret' && (
          <button onClick={() => onExpedier(commande)}
            style={{ width: '100%', padding: '0.625rem', background: `linear-gradient(135deg, ${T.bleu.border}, ${T.bleu.border}cc)`, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${T.bleu.border}44`, letterSpacing: '-0.2px' }}>
            Marquer expédiée →
          </button>
        )}
        {/* ⚠️ LIVRAISON ET EXPÉDITION ONT LEUR PROPRE SORTIE depuis « Prête »,
            juste en dessous. Sans cette exclusion, « Remettre au client »
            s'afficherait à côté de « Partir en livraison », et le commerçant
            aurait deux boutons pour un seul geste. */}
        {statut.next && !((estExpedition || estLivraison) && commande.statut === 'pret') && (
          <button onClick={() => onChangerStatut(commande.id, statut.next)}
            style={{ width: '100%', padding: '0.625rem', background: `linear-gradient(135deg, ${couleur.border}, ${couleur.border}cc)`, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${couleur.border}44`, transition: 'opacity 0.15s, transform 0.1s', letterSpacing: '-0.2px' }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'scale(0.99)' }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}>
            {statut.nextLabel} →
          </button>
        )}
        {/* ⚠️ LA PORTE DE SECOURS, quand la commande est déjà remise sans que
            l'encaissement ait été noté : les 66 commandes antérieures à ce
            geste, et tout ce qui dérivera. Sans elle, un montant réellement
            encaissé resterait à jamais absent du journal comptable, et le
            commerçant n'aurait aucun moyen de le rattraper.
            Elle rappelle simplement le même passage en « récupérée », qui
            rouvre la question du moyen. */}
        {commande.statut === 'recupere' && !commande.encaisse_mode && resteAEncaisserCommande(commande) > 0 && (
          <button onClick={() => onChangerStatut(commande.id, 'recupere')}
            style={{ width: '100%', padding: '0.5rem', background: '#fff', color: '#9A3412', border: '1.5px solid #EA580C55', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.78rem', fontFamily: '"DM Sans", sans-serif', marginTop: 6 }}>
            Noter l&rsquo;encaissement
          </button>
        )}
        {/* ⚠️ LE SEUL RETOUR ARRIÈRE DE L'APPLICATION, et il a été réduit à un
            seul cas EXPRÈS. Alex a demandé si c'était nécessaire avant que je
            code : sur les quatre transitions, trois ne méritent pas de bouton.
            Revenir de « prête » ne rappelle pas l'email déjà parti, et revenir
            de « non retirée » rendrait le stock une seconde fois.
            La règle et ses raisons vivent dans `lib/tableau-de-bord`.

            ⚠️ IL N'APPARAÎT QUE DANS LE FILTRE « RÉCUPÉRÉES ». Au comptoir, un
            bouton « Annuler » posé à côté de « Remettre au client » deviendrait
            à son tour une source de clics ratés. */}
        {filtreCourant === 'recupere' && retourArriereAutorise(commande) && (
          <button onClick={() => onRetourArriere(commande)}
            title={retourArriereAutorise(commande).aide}
            style={{ width: '100%', padding: '0.5rem', background: '#fff', color: T.muted, border: `1.5px solid ${T.pale}`, borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: '0.76rem', fontFamily: '"DM Sans", sans-serif', marginTop: 6 }}>
            ↩ {retourArriereAutorise(commande).libelle}
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
          <button onClick={async () => {
            if (await confirme(confirmationSimple({
              titre: 'Tu as livré cette commande ?',
              message: 'Elle passera en livrée, et le client en sera prévenu.',
              details: `${commande.client_nom}${commande.adresse_livraison ? ` · ${commande.adresse_livraison}` : ''}`,
              action: 'Oui, c’est livré', ton: 'principal',
            }))) {
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
        {/* ⚠️ CE BOUTON N'APPARAISSAIT JAMAIS EN BOUTIQUE. Il exigeait un
            CRÉNEAU pour vérifier que l'heure était passée ; une commande de
            détail n'en a aucun, donc `creneauPasse` restait faux et le bouton
            se retirait. Le statut « non retiré » y était donc INATTEIGNABLE :
            la commande restait « Prête » à vie et le stock des versions ne
            revenait jamais en rayon.
            La règle vit maintenant dans `lib/rappels-retrait.js` : à créneau,
            c'est sa fin qui fait foi ; sans créneau, c'est le lendemain du jour
            de retrait, pour laisser au client sa journée entière. */}
        {!estLivraison && !estExpedition && commande.statut === 'pret' && (() => {
          if (!peutMarquerNonRetire(commande, new Date())) return null
          const quand = commande.creneau?.heure_fin
            ? `Créneau : ${commande.creneau?.heure_debut?.slice(0,5)}–${commande.creneau?.heure_fin?.slice(0,5)}`
            : `Retrait souhaité : ${commande.date_commande || '—'}`
          return (
            <button onClick={async () => {
              if (await confirme(confirmationSimple({
                titre: 'Ce client n’est pas venu chercher sa commande ?',
                message: 'Les articles retournent en stock, et la commande sort de ta liste du jour.',
                details: `${commande.client_nom} · ${quand}`,
                action: 'Oui, il n’est pas venu',
              }))) {
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
          <button onClick={async () => {
            if (await confirme(confirmationSimple({
              titre: 'Remettre cette commande en « Prête » ?',
              message: 'Le client est finalement passé, ou tu l’avais marquée absent par erreur.',
              action: 'Oui, la remettre en Prête', ton: 'principal',
            }))) {
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
function CarteRdv({ rdv, onChangerStatut, onDemanderAction = null, onDeplacer = null }) {
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
        {/* ⚠️ MÊME RÈGLE QUE SUR LA CARTE DE COMMANDE, et c'est le FRÈRE du même
            défaut : sans `minWidth: 0` la colonne de gauche refuse de
            rétrécir, pousse la pastille de statut hors de la carte, et
            `overflow: hidden` la coupe. `flexShrink: 0` sur la pastille ne
            suffit pas : il l'empêche de maigrir, pas d'être poussée dehors. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: '0.625rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {/* Numero RDV + date */}
            <div style={{ minWidth: 44, borderRadius: 10, background: `linear-gradient(135deg, ${couleur.border}, ${couleur.border}bb)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: `0 3px 10px ${couleur.border}44`, padding: '6px 6px', gap: 2 }}>
              <span style={{ fontWeight: 900, fontSize: '0.9rem', lineHeight: 1 }}>#{rdv.numero_rdv || '?'}</span>
              {dateFormatee && <span style={{ fontSize: '0.55rem', fontWeight: 700, opacity: 0.85, textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{dateFormatee}</span>}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontWeight: 800, color: T.ink, margin: 0, fontSize: '0.95rem', letterSpacing: '-0.2px', overflowWrap: 'anywhere' }}>{nomComplet}</p>
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
            {/* ⚠️ LE MONTANT NU NE RÉPONDAIT PAS À LA SEULE QUESTION DU
                COMPTOIR : « je lui demande de l'argent, ou pas ? » (Alex,
                17/08). Et il mentait deux fois : « 0€ » sur une séance
                d'abonnement, et le PRIX COMPLET sur un rendez-vous dont
                l'acompte était déjà versé, ce qui fait encaisser trop.
                La règle vit dans le module, une seule écriture. */}
            {(() => {
              const p = etatPaiementRdv(rdv)
              if (!p) return null
              // ⚠️ LE MÊME CODE COULEUR QUE DANS LES LISTES, ET IL VIT DANS LE
              // MODULE. Une teinte recopiée à la main dérive au premier
              // changement, et c'est alors le même état qui se montre vert ici
              // et violet ailleurs.
              const c = couleurPaiement(p)
              return (
                <span style={{ fontSize: '0.72rem', fontWeight: 900, color: c.texte, background: c.fond, border: `1px solid ${c.bord}`, padding: '3px 9px', borderRadius: 100, letterSpacing: '0.3px', textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {p.libelle}
                </span>
              )
            })()}
          </div>
          {(() => {
            const p = etatPaiementRdv(rdv)
            if (!p?.detail) return null
            return (
              <p style={{ fontSize: '0.7rem', color: T.muted, marginTop: 3, fontWeight: 600 }}>{p.detail}</p>
            )
          })()}
        </div>

        {/* Produits achetés dans le même paiement que le rendez-vous. À
            préparer AVANT que le client arrive : c'est toute la promesse du
            tunnel unique, il repart avec en sortant du fauteuil. Une commande
            annulée ne s'affiche plus, le client ayant été remboursé. */}
        {rdv.commande && !['annulee_client_refund', 'annulee_paiement_ko'].includes(rdv.commande.statut) && (rdv.commande.commande_articles || []).length > 0 && (
          <div style={{ background: '#ECFDF5', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: 8, border: '1px solid #A7F3D0' }}>
            {/* ⚠️ CE BLOC NE DISAIT PAS DE QUELLE COMMANDE IL PARLAIT. Les mêmes
                produits vivent en double : ici, et dans l'onglet Commandes sous
                une référence. Sans elle, le commerçant qui voit « 1 × Shampoing »
                aux deux endroits ne peut pas savoir s'il s'agit d'une seule
                vente ou de deux, et il en prépare deux. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <p style={{ fontSize: '0.62rem', fontWeight: 800, color: '#065F46', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Produits à préparer · déjà payés
              </p>
              {referenceCommande(rdv.commande) && (
                <span style={{ fontSize: '0.68rem', fontWeight: 900, color: '#065F46', background: '#A7F3D055', border: '1px solid #6EE7B7', borderRadius: 100, padding: '1px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  #{referenceCommande(rdv.commande)}
                </span>
              )}
            </div>
            {rdv.commande.commande_articles.map((l, i) => {
              const version = libelleOptions(l.options)
              return (
                <div key={i} style={{ marginBottom: 2 }}>
                  <p style={{ fontSize: '0.78rem', color: '#065F46', lineHeight: 1.4, margin: 0, fontWeight: 700 }}>
                    {l.quantite} × {l.article_nom || l.article?.nom || 'Article'}
                  </p>
                  {version && (
                    <p style={{ fontSize: '0.7rem', color: '#047857', lineHeight: 1.35, margin: 0, fontWeight: 700 }}>{version}</p>
                  )}
                </div>
              )
            })}
            <p style={{ fontSize: '0.7rem', color: '#047857', margin: '4px 0 0', fontWeight: 800 }}>
              {Number(rdv.commande.total).toFixed(2)}€ encaissés{nomComplet ? ` · à remettre à ${nomComplet}` : ''}
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

        {/* DÉPLACER, et c'est un geste à part.
            ⚠️ IL MANQUAIT, et son absence forçait un contresens : pour décaler
            une cliente d'une heure, le commerçant n'avait d'autre choix que
            d'ANNULER puis de recréer. Le client lisait « ton rendez-vous est
            annulé », le numéro changeait, et l'historique gardait la trace
            d'une annulation qui n'avait jamais eu lieu.
            Réservé au statut confirmé : un rendez-vous honoré a eu lieu, un
            rendez-vous annulé n'a plus de place à reprendre. */}
        {onDeplacer && rdv.statut === 'confirme' && (
          <button onClick={() => onDeplacer(rdv)}
            style={{
              width: '100%', marginTop: 10, padding: '0.5rem',
              borderRadius: 10, border: `1.5px solid ${T.main}`,
              background: '#fff', color: T.main, fontWeight: 800, fontSize: '0.78rem',
              cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m14 15 2 2-2 2"/><path d="M8 17h8"/>
            </svg>
            Déplacer ce RDV
          </button>
        )}

        {/* Actions selon statut */}
        {statut.actions.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: statut.actions.length === 3 ? '2fr 1fr 1fr' : '1fr', gap: 6, marginTop: 10 }}>
            {statut.actions.map(action => {
              const cfg = ACTIONS_RDV_LABEL[action]
              if (!cfg) return null
              const isPrincipal = action === 'honore' || action === 'confirme'
              return (
                // ⚠️ PLUS AUCUN `window.confirm()` ICI. Annuler en posait DEUX
                // à la suite, et le second demandait « Est-ce parce que tu
                // déplaces cet endroit ? » avec pour seules réponses OK et
                // Annuler, où « Annuler » voulait dire « annulation ordinaire »,
                // donc CONTINUER. Relevé par Alex le 15/08. La question passe
                // désormais par une vraie fenêtre, dont chaque bouton porte la
                // phrase de ce qu'il fait, et qui confirme ensuite ce qui a été
                // fait. « Honoré » reste immédiat : le faire confirmer douze
                // fois par jour en ferait un réflexe, donc rien du tout.
                // ⚠️ « HONORÉ » DEMANDE MAINTENANT COMMENT L'ARGENT EST ENTRÉ
                // (Alex, 17/08 : « le RDV passe en payé mais il ne clique sur
                // rien »). Ce n'est toujours pas une confirmation, c'est
                // l'information qui manquait. Et elle ne se demande QUE s'il y
                // a quelque chose à encaisser : sur une séance d'abonnement,
                // déjà payée à l'achat, le bouton reste immédiat.
                <button key={action} onClick={() => {
                  const sansArgent = action === 'honore' && !(resteAEncaisser(rdv) > 0)
                  if (sansArgent || !onDemanderAction) { onChangerStatut(rdv.id, action, 'commercant'); return }
                  onDemanderAction(rdv, action)
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
  const [rdvADeplacer, setRdvADeplacer] = useState(null)      // RDV ouvert dans la modale de déplacement
  // La commande dont on est en train de dire qu'elle est partie. On garde la
  // COMMANDE entière et pas son seul identifiant : la fenêtre affiche sa
  // référence, et repropose le transporteur déjà saisi si le commerçant
  // revient corriger.
  const [commandeAExpedier, setCommandeAExpedier] = useState(null)
  // 🔴 CE QUI N'EST PAS PARTI CHEZ LE CLIENT, ET QUI NE SE DISAIT NULLE PART.
  // Voir `prevenirClient` : un 403 ou un 500 ne déclenchait aucun `.catch()`,
  // donc le commerçant croyait avoir prévenu quelqu'un qui n'avait rien reçu.
  const [envoiRate, setEnvoiRate] = useState(null)   // { quoi, erreur }
  // La question posée avant d'agir sur un rendez-vous, puis la phrase qui dit
  // ce qui a été fait. Deux états et pas un : la fenêtre reste ouverte après le
  // geste pour confirmer, au lieu de disparaître en laissant deviner.
  const [actionRdv, setActionRdv] = useState(null)            // { rdv, action }
  const [confirmationRdvTexte, setConfirmationRdvTexte] = useState(null)
  const [actionEnCours, setActionEnCours] = useState(false)
  // Clôturer un COURS ENTIER : la liste des inscrits encore à honorer, et la
  // phrase qui dira combien ont été enregistrés.
  const [seanceAHonorer, setSeanceAHonorer] = useState(null)  // tableau de rdvs
  const [confirmationSeanceTexte, setConfirmationSeanceTexte] = useState(null)
  // La commande payée sur place qu'on est en train de remettre : par quel moyen
  // le commerçant vient-il d'être payé ?
  const [commandeAEncaisser, setCommandeAEncaisser] = useState(null)
  const [confirmationCommandeTexte, setConfirmationCommandeTexte] = useState(null)
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
  // Verdict d'accès au tableau de bord. `null` tant qu'on n'a rien décidé,
  // sinon `{ raison, motif, nom }` et on montre l'écran d'attente à la place.
  const [refusAcces, setRefusAcces] = useState(null)
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
    if (commercant?.categorie === 'vitrine' && !canDo(planEffectif(commercant), 'commande') && ongletPrincipal === 'commandes') {
      setOngletPrincipal('rdv')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commercant?.id])
  const [filtreStatut, setFiltreStatut] = useState('actives')
  const [vueMode, setVueMode] = useState('retrait')  // vue Commandes : 'retrait' | 'livraison'
  // Créneaux fermés à la volée par le commerçant débordé. Table `creneaux_blocages`.
  const [blocages, setBlocages] = useState([])
  // Une tournée PAR CRÉNEAU : un commerçant qui livre à midi et le soir fait
  // deux tournées distinctes, et mélanger les deux donne un itinéraire absurde.
  // Indexées par identifiant de créneau de livraison.
  const [tournees, setTournees] = useState({})
  const [tourneeLoading, setTourneeLoading] = useState(null)   // id du créneau en cours de calcul
  const [jourSelectionne, setJourSelectionne] = useState(null) // null = aujourd'hui par défaut
  // ⚠️ CE QUE L'AGENDA MONTRE, remonté par lui (Alex, 16/08). Sans cet état, les
  // compteurs de l'onglet Rendez-vous lisaient un sélecteur de jours qui n'y est
  // pas affiché : ils étaient bloqués sur aujourd'hui à vie. `null` tant que
  // l'agenda n'a rien annoncé, et on retombe alors sur le jour actif.
  const [fenetreAgenda, setFenetreAgenda] = useState(null)  // { debut, fin } en ISO
  // ⚠️ STABLE, ET QUI NE RÉÉCRIT QUE SI ÇA A CHANGÉ. Les deux comptent :
  // l'agenda annonce sa fenêtre dans un effet qui dépend de cette fonction, donc
  // une fonction recréée à chaque rendu relancerait l'effet à chaque rendu ; et
  // poser un objet neuf à valeur identique provoquerait un rendu de plus, qui
  // relancerait l'effet. Dans les deux cas, boucle infinie et écran figé.
  const majFenetreAgenda = useCallback((f) => {
    if (!f?.debut || !f?.fin) return
    setFenetreAgenda(prev => (prev && prev.debut === f.debut && prev.fin === f.fin)
      ? prev
      : { debut: f.debut, fin: f.fin })
  }, [])
  const [modeHistorique, setModeHistorique] = useState(false)
  const [notificationsActives, setNotificationsActives] = useState(false)
  const [nouvelleCommande, setNouvelleCommande] = useState(false)
  // Alerte « nouveau rendez-vous » : elle n'existait pas, le salon ne recevait
  // ni son ni bandeau là où l'alimentaire est prévenu à chaque commande.
  const [nouveauRdv, setNouveauRdv] = useState(null)
  const [commandeRecuperee, setCommandeRecuperee] = useState(null) // { nom, numero }
  const router = useRouter()
  const dernierNombreRef = useRef(0)
  // `null` tant qu'aucun relevé n'a eu lieu : au premier, on prend note de
  // l'existant sans rien annoncer, sinon le commerçant recevrait une alerte par
  // rendez-vous déjà en agenda à chaque ouverture de son tableau de bord.
  const rdvsConnusRef = useRef(null)
  // Bons cadeaux vendus : le commerçant n'en savait RIEN depuis son tableau de
  // bord. Même mécanique que les rendez-vous, on compare des identifiants.
  const [bonsVendus, setBonsVendus] = useState([])
  const [nouveauBon, setNouveauBon] = useState(null)
  const bonsConnusRef = useRef(null)
  const pollingRef = useRef(null)

  // ⚠️ LES BLOCAGES SE RELISENT DEPUIS LA BASE APRÈS CHAQUE ÉCRITURE, jamais
  // devinés côté écran. Le commerçant a souvent son tableau de bord ouvert sur
  // deux appareils, le comptoir et l'arrière-boutique : un état local
  // divergerait, et il croirait avoir fermé un créneau resté ouvert.
  const chargerBlocages = useCallback(async (id) => {
    if (!id) return
    const { data } = await supabase
      .from('creneaux_blocages')
      .select('id, creneau_id, date_blocage')
      .eq('commercant_id', id)
    setBlocages(data || [])
  }, [])

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
      .select(SELECT_COMMANDES)
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
        .select(SELECT_RDVS)
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
        // ⚠️ `capacite` MANQUAIT, ET C'EST CE QUI TUAIT LES COURS COLLECTIFS.
        //
        // Le module du 13/08 était juste, la modale de création aussi : elle
        // demande `capacitePrestation(presta)` pour savoir si deux personnes
        // peuvent partager un horaire. Mais cette colonne n'arrivait jamais
        // jusqu'à elle, et `capacitePrestation` d'une prestation SANS capacité
        // rend 1, sa valeur de repli. Un cours de douze devenait donc un
        // rendez-vous individuel, et la deuxième inscrite se voyait refuser
        // « ce créneau chevauche un RDV déjà existant ».
        //
        // ⚠️ AUCUNE ERREUR NULLE PART. Ni au lint, ni au build, ni au banc :
        // une colonne absente d'un `select` ne lève rien, elle vaut
        // `undefined`, et un repli silencieux fait le reste. C'est le troisième
        // défaut de cette forme sur ce projet, après la galerie photos d'une
        // fiche et le lien vers l'abonnement dans « Mes rendez-vous ». Le banc
        // exige désormais que TOUS les champs lus par les modales soient
        // demandés ici.
        .select('id, nom, duree_minutes, prix, acompte_pourcent, ordre, tva_taux, capacite')
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
          chargerCommandes(c.id); chargerRdvs(c.id); chargerBlocages(c.id)
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

      // ⚠️ LA PORTE. Avant le 20/08, il suffisait d'avoir une ligne
      // `commercants` pour entrer : quelqu'un qui venait de terminer son
      // inscription ouvrait un espace complet alors que Yoppaa n'avait rien
      // validé, et rien ne lui disait d'attendre.
      //
      // On tranche sur la PREMIÈRE fiche : elles appartiennent au même compte
      // et sont validées ensemble. Le mode impersonation, lui, est sorti bien
      // plus haut et n'arrive jamais ici : l'admin doit pouvoir regarder un
      // dossier en attente, c'est même tout l'intérêt.
      const verdict = accesDashboard(data[0])
      if (!verdict.autorise) {
        setRefusAcces({ raison: verdict.raison, motif: verdict.motif, nom: data[0].nom })
        return
      }

      if (data.length === 1) {
        setCommercant(data[0])
        localStorage.setItem('yoppaa_dashboard_commercant_id', data[0].id)
        chargerCommandes(data[0].id); chargerRdvs(data[0].id); chargerBlocages(data[0].id)
      } else {
        // Multi-commerces — restaurer depuis localStorage
        const savedId = localStorage.getItem('yoppaa_dashboard_commercant_id')
        if (savedId) {
          const found = data.find(c => c.id === savedId)
          if (found) {
            setCommercant(found)
            chargerCommandes(found.id); chargerRdvs(found.id); chargerBlocages(found.id)
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
        .select(SELECT_COMMANDES)
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
      const { data: rdvsData } = await supabase
        .from('rdv_reservations')
        // La commande liée vient avec : un rendez-vous du tunnel unique porte
        // des produits déjà payés que le commerçant doit préparer AVANT que le
        // client arrive. Sans elle, il les découvrirait dans un autre onglet
        // sans faire le lien avec le créneau. Le hint !..._commande_id_fkey
        // lève l'ambiguïté, les deux tables se pointant désormais l'une l'autre.
        .select(SELECT_RDVS)
        .eq('commercant_id', commercant.id)
        .is('deleted_at', null)
        .order('date_rdv', { ascending: true })
        .order('heure_debut', { ascending: true })
      // ⚠️ LE SALON N'ÉTAIT PRÉVENU DE RIEN. Le commerçant alimentaire reçoit un
      // son et une notification à chaque commande ; la coiffeuse ne découvrait
      // ses nouveaux rendez-vous qu'en pensant à regarder son agenda.
      //
      // ⚠️ ON COMPARE DES IDENTIFIANTS, pas le nombre de lignes comme le fait la
      // détection des commandes : entre deux relevés, un rendez-vous annulé et
      // un autre pris laissent le total inchangé, et personne n'est prévenu.
      if (rdvsData) {
        const nouveaux = nouveauxRdvs(rdvsConnusRef.current, rdvsData)
        rdvsConnusRef.current = idsDes(rdvsData)
        if (nouveaux.length > 0) {
          const aujourdhui = dateKey(new Date())
          const demainD = new Date(); demainD.setDate(demainD.getDate() + 1)
          // Le plus proche d'abord : c'est celui qui presse.
          const aAnnoncer = [...nouveaux].sort((a, b) =>
            String(a.date_rdv || '').localeCompare(String(b.date_rdv || ''))
            || String(a.heure_debut || '').localeCompare(String(b.heure_debut || '')))[0]
          const { titre, corps } = texteAlerteRdv(aAnnoncer, { aujourdhui, demain: dateKey(demainD) })
          if (notificationsActives) {
            // ⚠️ Le point médian sépare des éléments, il ne coordonne pas :
            // « · et » mélangeait les deux rôles, et « 2 autres » tout court
            // laissait deviner 2 autres QUOI, juste après un nom de prestation.
            envoyerNotification(titre, nouveaux.length > 1 ? `${corps} · ${nouveaux.length - 1} autre${nouveaux.length > 2 ? 's' : ''} rendez-vous` : corps, 'yoppaa-rdv')
          }
          setNouveauRdv({ titre, corps, nombre: nouveaux.length })
          setTimeout(() => setNouveauRdv(null), 8000)
        }
        setRdvs(rdvsData)
      }

      // ⚠️ LES BONS CADEAUX VENDUS. Le commerçant n'en savait rien depuis son
      // tableau de bord : un email partait, mais UNIQUEMENT s'il était réglé sur
      // « à chaque commande ». Réglé sur le récapitulatif du matin ou sur rien,
      // il découvrait la vente dans ses chiffres, des jours plus tard.
      // Il n'a rien à préparer, mais quelqu'un vient d'offrir son commerce.
      const { data: bonsData } = await supabase
        .from('bons_cadeaux')
        .select('id, code, montant_initial, solde, statut, created_at, destinataire_mode')
        .eq('commercant_id', commercant.id)
        .order('created_at', { ascending: false })
        .limit(60)
      if (bonsData) {
        const nouveaux = nouveauxRdvs(bonsConnusRef.current, bonsData)
        bonsConnusRef.current = idsDes(bonsData)
        if (nouveaux.length > 0) {
          const { titre, corps } = texteBonVendu(nouveaux[0])
          if (notificationsActives) envoyerNotification(titre, corps, 'yoppaa-bon')
          setNouveauBon({ titre, corps, nombre: nouveaux.length })
          setTimeout(() => setNouveauBon(null), 8000)
        }
        setBonsVendus(bonsData)
      }
    }, 5000)

    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  }, [commercant?.id, notificationsActives])

  // Crédit fidélité automatique (Vendre) au statut final. Fire-and-forget,
  // idempotent côté serveur (index unique par commande).
  function crediterFideliteCommande(commandeId) {
    postPro('/api/fidelite/crediter', { commande_id: commandeId }).catch(e => console.warn('[dashboard] credit fidelite KO', e))
  }

  // ─── Les produits d'un rendez-vous viennent d'être remis ─────────────────
  //
  // ⚠️ CETTE COMMANDE NE POUVAIT ÊTRE CLÔTURÉE PAR PERSONNE, ni par le client,
  // qui n'a qu'un bouton « J'ai compris » sur son écran, ni par le commerçant,
  // dont la vignette n'offrait aucune action. Elle restait « prête » pour
  // toujours, faussait les compteurs, déclenchait des rappels de retrait et
  // finissait en « client non venu » alors qu'il était venu.
  //
  // Passe par le serveur, comme « non retiré » : le crédit de fidélité doit
  // suivre, et le navigateur n'a pas les droits d'écriture sur les cartes.
  async function produitsRemis(commandeId) {
    const { data: { session } = {} } = await supabase.auth.getSession()
    const res = await fetch('/api/commande/produits-remis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ commande_id: commandeId }),
    }).catch(() => null)
    const j = await res?.json().catch(() => null)
    if (!j?.ok) return false
    setCommandes(prev => prev.map(c => c.id === commandeId ? { ...c, statut: 'recupere' } : c))
    return true
  }

  async function changerStatut(commandeId, statut, { champs = null } = {}) {
    // ⚠️ LE MÊME GESTE QUE SUR UN RENDEZ-VOUS, ET POUR LA MÊME RAISON. Une
    // commande payée sur place partait au comptoir sans son moyen : un Click
    // and Collect réglé en liquide et un autre au terminal se ressemblaient
    // comme deux gouttes d'eau dans le journal. Règle d'Alex du 17/08, une
    // amélioration qui touche d'autres endroits s'y applique aussi.
    //
    // La question ne se pose qu'une fois, et seulement s'il reste de l'argent :
    // une commande déjà payée en ligne passe en récupérée d'un seul tap.
    if (statut === 'recupere' && !champs) {
      const c = commandes.find(x => x.id === commandeId)
      if (c && !c.encaisse_mode && resteAEncaisserCommande(c) > 0) {
        setCommandeAEncaisser(c)
        return
      }
    }
    // ⚠️ « NON RETIRÉ » PASSE PAR UNE ROUTE SERVEUR, et lui seul. Les articles à
    // versions sont décrémentés en dur à la commande : sans restitution, chaque
    // commande déclarée non retirée retirait DÉFINITIVEMENT une pièce des
    // rayons. Le navigateur ne peut pas rendre ce stock, la table des versions
    // ne lui est pas ouverte en écriture. La route pose le statut ET rend le
    // stock, filtrée sur l'ancien statut pour ne le rendre qu'une seule fois.
    if (statut === 'non_retire') {
      const { data: { session } = {} } = await supabase.auth.getSession()
      const res = await fetch('/api/commande/non-retire', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ commande_id: commandeId }),
      }).catch(() => null)
      const j = await res?.json().catch(() => null)
      if (!j?.ok) { alert(`Impossible de marquer non retirée : ${j?.error || 'erreur inconnue'}`); return }
      setCommandes(prev => prev.map(c => c.id === commandeId ? { ...c, statut } : c))
      return
    }

    const payloadCmd = { statut, ...(champs || {}) }
    await supabase.from('commandes').update(payloadCmd).eq('id', commandeId)
    setCommandes(prev => prev.map(c => c.id === commandeId ? { ...c, ...payloadCmd } : c))

    // Statut final : la commande récupérée remplit la carte de fidélité
    if (statut === 'recupere') crediterFideliteCommande(commandeId)

    // Push OneSignal au Yopper à chaque transition (en préparation, prête),
    // contenu actionnable + clic vers l'onglet Commandes. Fire-and-forget.
    if (statut === 'en_preparation' || statut === 'pret') {
      postPro('/api/commande/push-statut', { commande_id: commandeId, statut }).catch(e => console.warn('[dashboard] push-statut KO', e))
    }

    // Si on passe a 'pret' : email au Yopper pour le prevenir.
    // ⚠️ NON BLOQUANT MAIS PLUS MUET. L'écran du commerçant est déjà à jour, et
    // il le reste : on ne l'arrête pas parce qu'un email n'est pas parti. Mais
    // on le lui DIT, sinon il attend un client qui n'a jamais été prévenu.
    if (statut === 'pret') {
      signalerEnvoi('/api/emails/commande-prete', { commande_id: commandeId }, 'l’email « c’est prêt »')
    }
  }

  // ⚠️ « PERSONNE NE CHERCHE UNE INFORMATION » (règle d'Alex). Un email qui ne
  // part pas est une information que le commerçant doit recevoir SANS LA
  // CHERCHER : c'est lui qui attendra le client au comptoir.
  //
  // ⚠️ ET SEULEMENT POUR CE QUI ENGAGE LE CLIENT. Un push raté n'est pas un
  // email raté : le message se retrouve dans l'application de toute façon. Si
  // cette ligne s'affichait à chaque hoquet, plus personne ne la lirait, et
  // elle ne servirait plus le jour où elle compte.
  // ⚠️ `suite` DIT CE QUI MARCHE ENCORE, et ça change selon ce qui a échoué.
  // Un email raté laisse la commande à jour dans l'application du client ; un
  // crédit de fidélité raté, lui, sera rattrapé par le cron du lendemain matin.
  // Servir la même phrase aux deux ferait mentir l'une des deux.
  async function signalerEnvoi(url, corps, quoi, suite = null) {
    const r = await prevenirClient(url, corps, quoi)
    if (!r.ok) setEnvoiRate({ quoi: r.quoi, erreur: r.erreur, suite })
    return r.ok
  }

  // Flux de statut spécifique livraison : Prête → En livraison → Livrée.
  // À « livrée » on pose aussi statut='recupere' pour que CA/stats/avis fonctionnent
  // (comme un retrait récupéré). Le retrait, lui, s'arrête à « pret » (swipe client).
  // Boutique détail : marque la commande expédiée (statut final recupere) avec
  // le n° de suivi saisi à la main (MVP expédition, colonne expedition_suivi).
  async function expedierCommande(commandeId, { transporteur = null, suivi = null } = {}) {
    const patch = {
      statut: 'recupere',
      expedition_suivi: suivi || null,
      expedition_transporteur: transporteur || null,
    }
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
    signalerEnvoi('/api/emails/commande-expediee', { commande_id: commandeId }, 'l’email avec le suivi du colis')
    // 🔴 ET LE PUSH, QUI N'EXISTAIT PAS. « Prête » envoyait au client d'une
    // expédition le message du RETRAIT — « va récupérer ta commande » — puis
    // plus rien quand le colis partait vraiment. Il attendait au magasin un
    // paquet qui était dans un camion (Alex, 26/08 : « les pushs d'expédition
    // sont empruntés au tunnel de retrait »).
    postPro('/api/commande/push-statut', { commande_id: commandeId, statut: 'expediee' }).catch(e => console.warn('[dashboard] push expediee KO', e))
  }

  // ⚠️ LE RETOUR ARRIÈRE, ET SES TROIS PRÉCAUTIONS.
  //
  // 1. Il RELIT la règle au lieu de la refaire : `retourArriereAutorise` sait
  //    seule quels statuts se défont, et pourquoi les autres ne se défont pas.
  //    Une seconde copie de cette règle finirait par autoriser le retour depuis
  //    « non retirée », qui rendrait le stock une seconde fois.
  // 2. Il n'efface JAMAIS `encaisse_mode`. Si l'argent est entré, la trace
  //    comptable reste : on ne supprime pas une écriture pour réparer un clic.
  // 3. ⚠️ L'ÉCRITURE EST FILTRÉE SUR L'ANCIEN STATUT (`.eq('statut', 'recupere')`).
  //    Deux taps rapides, ou deux onglets ouverts, ne peuvent donc pas la
  //    rejouer : la seconde ne trouve plus de ligne. C'est la même précaution
  //    que la route « non retiré », et c'est ce qui manque presque toujours
  //    quand une action a un effet de bord.
  // ⚠️ FERMER OU ROUVRIR UN CRÉNEAU, POUR LE JOUR AFFICHÉ SEULEMENT.
  //
  // ⚠️ AUCUNE COMMANDE N'EST TOUCHÉE, et c'est la règle d'Alex : « si des
  // commandes sont déjà présentes, elles restent, il bloque la capacité
  // restante ». Ce geste n'écrit que dans `creneaux_blocages`.
  //
  // ⚠️ ET LA VRAIE BARRIÈRE EST AILLEURS : `create-commande` refuse un créneau
  // bloqué côté serveur. Ici, on ne fait que cacher et informer. Un onglet
  // client resté ouvert depuis dix minutes ne verra pas ce blocage, et c'est
  // exactement pour lui que la garde serveur existe.
  async function basculerBlocageCreneau(creneauId, estBloque) {
    if (!commercant?.id || !creneauId) return
    if (estBloque) {
      const { error } = await supabase
        .from('creneaux_blocages')
        .delete()
        .eq('creneau_id', creneauId)
        .eq('date_blocage', jourActif)
      // ⚠️ `alert` ET NON `toast` : ce fichier n'a pas de toast, et `verif:undef`
      // l'a attrapé. Sans lui, la fonction aurait planté au premier clic, sans
      // que le lint ni le build ne disent quoi que ce soit (`no-undef` est
      // éteint dans ce projet). Voir reference_eslint_no_undef_eteint.
      if (error) { alert(`Erreur : ${error.message}`); return }
    } else {
      const { error } = await supabase
        .from('creneaux_blocages')
        .insert({ commercant_id: commercant.id, creneau_id: creneauId, date_blocage: jourActif })
      // ⚠️ 23505 = la contrainte d'unicité. Deux taps rapides, ou deux
      // appareils, et le second arrive après le premier : ce n'est pas une
      // erreur à montrer, le créneau est fermé, c'est ce qu'il voulait.
      if (error && error.code !== '23505') { alert(`Erreur : ${error.message}`); return }
    }
    chargerBlocages(commercant.id)
  }

  async function annulerRemise(commande) {
    const regle = retourArriereAutorise(commande)
    if (!regle) return
    const patch = { statut: regle.versStatut }
    if (regle.effaceStatutLivraison) patch.statut_livraison = null
    // ⚠️ LES TROIS COLONNES DU RELEVÉ PARTENT ENSEMBLE. En laisser une seule
    // suffirait à mentir : un montant sans moyen, ou une date sans montant, et
    // le journal comptable garde une vente qui n'a pas eu lieu.
    // ⚠️ `paye_en_ligne` N'EST PAS DANS LA LISTE, et ne doit jamais y entrer.
    if (regle.effaceEncaissement) {
      patch.encaisse_mode = null
      patch.encaisse_montant = null
      patch.encaisse_le = null
    }

    const { data, error } = await supabase
      .from('commandes')
      .update(patch)
      .eq('id', commande.id)
      .eq('statut', 'recupere')
      .select('id')
    if (error) { alert(`Erreur : ${error.message}`); return }
    if (!data || data.length === 0) return  // déjà annulée entre-temps

    setCommandes(prev => prev.map(c => c.id === commande.id ? { ...c, ...patch } : c))
  }

  async function changerStatutLivraison(commandeId, statutLivraison, { champs = null } = {}) {
    // ⚠️ LA LIVRAISON ÉTAIT LE SEUL ENDROIT SANS RELEVÉ D'ARGENT (Alex, 22/08),
    // et c'est le plus gênant des trois : le livreur encaisse LOIN du comptoir,
    // souvent en liquide, et c'est justement là qu'une trace manque le plus.
    //
    // Cette fonction posait `statut: 'recupere'` en dur, court-circuitant la
    // question que `changerStatut` pose depuis le 17/08 pour un retrait et un
    // rendez-vous. Une livraison réglée au livreur devenait donc une commande
    // « récupérée » sans moyen de paiement, invisible dans le journal.
    //
    // ⚠️ ON NE DUPLIQUE PAS LA RÈGLE, ON LA RÉUTILISE : `commandeAEncaisser`
    // ouvre la même fenêtre, et `repondreCommande` sait maintenant qu'une
    // livraison doit aussi passer en « livrée ». Deux copies de cette règle
    // finiraient par diverger, et l'une des deux mentirait sur l'argent.
    if (statutLivraison === 'livree' && !champs) {
      const c = commandes.find(x => x.id === commandeId)
      if (c && !c.encaisse_mode && resteAEncaisserCommande(c) > 0) {
        setCommandeAEncaisser({ ...c, _viaLivraison: true })
        return
      }
    }
    const patch = { statut_livraison: statutLivraison, ...(champs || {}) }
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
    postPro('/api/livraison/statut', { commande_id: commandeId, statut_livraison: statutLivraison }).catch(e => console.warn('[dashboard] push livraison KO', e))
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

  // `raison` sert au seul cas où l'annulation n'en est pas vraiment une : le
  // commerçant DÉPLACE un emplacement, et le verrou l'oblige à libérer les
  // rendez-vous qui s'y tenaient (règle d'Alex du 13/08). Le client reçoit
  // alors « ton RDV change d'endroit » et une invitation à reprendre sa place,
  // au lieu d'un « annulé par le commerçant » qui lui ferait croire qu'on ne
  // veut plus de lui.
  // ⚠️ REND DÉSORMAIS true OU false. La fenêtre de confirmation doit savoir si
  // l'écriture a réussi : annoncer « le rendez-vous est annulé » après un échec
  // réseau ferait croire au commerçant que son client est prévenu alors que
  // rien n'a bougé. Les appelants qui ignorent ce retour se comportent comme
  // avant.
  // ⚠️ `silencieux` sert à la clôture d'un cours entier, et à elle seule : douze
  // écritures qui échouent ne doivent pas empiler douze fenêtres d'alerte les
  // unes derrière les autres. L'appelant COMPTE les échecs et les annonce en une
  // phrase. Sans ce drapeau, rien ne change pour les appelants d'avant.
  // ⚠️ `champs` PORTE L'ENCAISSEMENT, ET IL PART DANS LA MÊME ÉCRITURE que le
  // statut. Deux `update` séparés laisseraient une fenêtre où le rendez-vous
  // est honoré sans son encaissement, et c'est exactement l'état qu'on cherche
  // à faire disparaître.
  async function changerStatutRdv(rdvId, statut, raison = 'commercant', { silencieux = false, champs = null } = {}) {
    const payload = { statut, ...(champs || {}) }
    const { error } = await supabase.from('rdv_reservations').update(payload).eq('id', rdvId)
    if (error) {
      console.error('[dashboard] changerStatutRdv', error)
      if (!silencieux) alert(`Erreur : ${error.message}`)
      return false
    }
    setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, ...payload } : r))

    // Si statut change → emails contextuels (non-bloquant, fire-and-forget)
    if (statut === 'annule_commercant') {
      // TODO Sess 4/8 suite : refund Stripe acompte côté commerçant.
      // Pour l'instant on notifie juste le Yopper, le commerçant refund manuellement via Stripe Dashboard.
      signalerEnvoi('/api/emails/rdv-annule', { rdv_id: rdvId, raison_annulation: raison }, 'l’email d’annulation du rendez-vous')
    } else if (statut === 'honore') {
      // ⚠️ PLUS D'EMAIL ICI, ET C'EST UN RETRAIT VOLONTAIRE (27/08).
      // `/api/emails/rdv-honore` servait l'ANCIENNE fidélité des rendez-vous,
      // celle de `rdv_fidelite_progression`, supprimée le même jour. Elle
      // n'écrivait qu'un compteur : aucune carte, aucun SMS, et aucune ligne
      // dans `fidelite_recompenses`, donc une récompense annoncée par email et
      // impossible à dépenser au moment de payer.
      // La fidélité unifiée annonce le déblocage depuis `crediterFidelite`,
      // pour les trois segments à la fois. Le crédit d'un rendez-vous, lui,
      // passe par le cron de 9h le lendemain : l'annonce part donc le matin
      // suivant, pas à la seconde où le commerçant clôture.
      // ⚠️ L'email de PROGRESSION (« 4 sur 10 » à chaque passage) est retiré
      // pour de bon : dix messages pour une récompense, quand la progression se
      // lit déjà sur la fiche et sur la carte.

      // ⚠️ LA CARTE SE REMPLIT MAINTENANT, PLUS DEMAIN MATIN. Le crédit d'un
      // rendez-vous n'existait que dans le cron de 9h : le client repartait du
      // salon sans rien, et le commerçant n'avait rien à lui montrer. Le cron
      // reste EN FILET pour les rendez-vous que personne ne clôture, et l'index
      // unique (carte_id, rdv_id) empêche le double crédit.
      // ⚠️ La phrase de secours dit ce qui marche encore, et elle est VRAIE :
      // c'est précisément ce filet-là.
      signalerEnvoi(
        '/api/fidelite/rdv-honore',
        { rdv_id: rdvId },
        'le crédit de fidélité de ton client',
        'Le rendez-vous est bien clôturé. Le crédit sera rattrapé automatiquement demain matin.',
      )

      // ⚠️ LE RENDEZ-VOUS HONORÉ EMPORTE SES PRODUITS. C'est le moment exact où
      // le commerçant tend le sachet : lui demander un second geste dans un
      // autre onglet, c'est s'assurer qu'il l'oubliera. La route est filtrée sur
      // l'ancien statut, donc rejouer un « honoré » ne crédite pas deux fois.
      const rdvHonore = rdvs.find(r => r.id === rdvId)
      if (rdvHonore?.commande?.id) {
        await produitsRemis(rdvHonore.commande.id)
      }
    } else if (statut === 'no_show') {
      // Notif Yopper qu'il a été marqué absent (transparence + permet contestation).
      // L'acompte n'est PAS refundé (le commerçant a bloqué le créneau pour rien).
      signalerEnvoi('/api/emails/rdv-no-show', { rdv_id: rdvId }, 'l’email « tu n’es pas venu »')
    }
    return true
  }

  // Le choix fait dans la fenêtre, exécuté puis confirmé.
  async function repondreActionRdv(choix) {
    if (!actionRdv) return
    // ⚠️ LA PORTE VERS LE DÉPLACEMENT. Alex cherchait à décaler un rendez-vous
    // et se retrouvait dans la fenêtre d'annulation : on l'emmène là où il
    // voulait aller, au lieu de lui laisser annuler puis recréer.
    if (choix === 'deplacer') {
      const rdv = actionRdv.rdv
      setActionRdv(null)
      setRdvADeplacer(rdv)
      return
    }
    const decision = statutDepuisChoix(actionRdv.action, choix)
    // « Ne rien faire » est un résultat comme un autre : on referme, sans bruit
    // et surtout sans rien écrire.
    if (!decision) { setActionRdv(null); return }
    setActionEnCours(true)
    // ⚠️ LE MONTANT EST FIGÉ À L'ENCAISSEMENT, comme le prix l'est à la
    // réservation. Le tarif d'une prestation change ; ce qui est entré en
    // caisse ce jour-là, non. Le recalculer plus tard donnerait un autre
    // chiffre au comptable que celui compté dans le tiroir.
    const champs = decision.encaisse
      ? {
          encaisse_mode: decision.encaisse,
          encaisse_montant: decision.encaisse === 'rien' ? 0 : (resteAEncaisser(actionRdv.rdv) ?? 0),
          encaisse_le: new Date().toISOString(),
        }
      : null
    const ok = await changerStatutRdv(actionRdv.rdv.id, decision.statut, decision.raison, { champs })
    setActionEnCours(false)
    // ⚠️ ON NE CONFIRME QUE CE QUI A EU LIEU. Annoncer « c'est annulé » après un
    // échec ferait croire au commerçant que son client est prévenu.
    if (!ok) { setActionRdv(null); return }
    if (decision.encaisse) {
      setConfirmationRdvTexte(confirmationEncaissement(decision.encaisse, {
        montant: champs.encaisse_montant,
        nom: nomClient(actionRdv.rdv),
      }))
      return
    }
    setConfirmationRdvTexte(confirmationRdv(actionRdv.action, { rdv: actionRdv.rdv, raison: decision.raison }))
  }

  function fermerActionRdv() {
    setActionRdv(null)
    setConfirmationRdvTexte(null)
  }

  // ⚠️ UNE SEULE QUESTION POUR TOUT UN COURS, MAIS UNE ÉCRITURE PAR PERSONNE.
  // La base garde la vérité individuelle : chacun est venu ou non, reçoit son
  // email, et son montant entre au chiffre d'affaires pour ce qu'il vaut. C'est
  // seulement le GESTE qui est mutualisé.
  // Les écritures partent EN SÉRIE et non en parallèle : chacune déclenche un
  // email et, pour un rendez-vous qui porte des produits, le passage de sa
  // commande en récupérée. Douze d'un coup, c'est la file d'attente qui décide
  // de l'ordre, et un échec au milieu qu'on ne saurait plus attribuer.
  async function repondreSeance(choix) {
    if (!seanceAHonorer) return
    // ⚠️ QUATRE RÉPONSES POSSIBLES, ET UNE SEULE NE FAIT RIEN. `honore` clôture
    // un cours sans argent à encaisser ; `terminal`, `especes` et
    // `sans_paiement` clôturent ET notent l'encaissement ; `rien` referme.
    const MODES = { terminal: 'terminal', especes: 'especes', sans_paiement: 'rien' }
    if (choix !== 'honore' && !MODES[choix]) { setSeanceAHonorer(null); return }
    const mode = MODES[choix] || null
    setActionEnCours(true)
    let faits = 0
    let echecs = 0
    for (const rdv of seanceAHonorer) {
      // Le montant est celui de CHAQUE personne, pas le total du cours : une
      // ligne par inscrit, chacune avec ce qu'elle a réellement versé.
      const champs = mode
        ? {
            encaisse_mode: mode,
            encaisse_montant: mode === 'rien' ? 0 : (resteAEncaisser(rdv) ?? 0),
            encaisse_le: new Date().toISOString(),
          }
        : null
      const ok = await changerStatutRdv(rdv.id, 'honore', 'commercant', { silencieux: true, champs })
      if (ok) faits++
      else echecs++
    }
    setActionEnCours(false)
    setConfirmationSeanceTexte(confirmationSeanceHonoree({ faits, echecs }))
  }

  function fermerSeance() {
    setSeanceAHonorer(null)
    setConfirmationSeanceTexte(null)
  }

  // ⚠️ LE MÊME TRIO DE RÉPONSES QUE SUR UN RENDEZ-VOUS : terminal, espèces, ou
  // « rien encaissé », qui remet quand même la commande. Un client peut repartir
  // avec son paquet en promettant de payer, et le commerçant doit pouvoir le
  // noter au lieu de mentir sur le moyen de paiement.
  async function repondreCommande(choix) {
    if (!commandeAEncaisser) return
    const MODES = { terminal: 'terminal', especes: 'especes', sans_paiement: 'rien' }
    const mode = MODES[choix]
    if (!mode) { setCommandeAEncaisser(null); return }
    const montant = mode === 'rien' ? 0 : (resteAEncaisserCommande(commandeAEncaisser) ?? 0)
    const champs = {
      encaisse_mode: mode,
      encaisse_montant: montant,
      encaisse_le: new Date().toISOString(),
    }
    setActionEnCours(true)
    // ⚠️ UNE LIVRAISON NE SE TERMINE PAS COMME UN RETRAIT. Elle doit poser
    // `statut_livraison: 'livree'` en plus du statut de commande, sans quoi la
    // course resterait éternellement « en livraison » dans la tournée et le
    // Yopper ne recevrait jamais sa notification d'arrivée.
    if (commandeAEncaisser._viaLivraison) {
      await changerStatutLivraison(commandeAEncaisser.id, 'livree', { champs })
    } else {
      await changerStatut(commandeAEncaisser.id, 'recupere', { champs })
    }
    setActionEnCours(false)
    setConfirmationCommandeTexte(confirmationEncaissement(mode, {
      montant,
      nom: `La commande ${referenceCommande(commandeAEncaisser) ? `#${referenceCommande(commandeAEncaisser)}` : ''}`.trim(),
    }))
  }

  function fermerCommandeEncaissement() {
    setCommandeAEncaisser(null)
    setConfirmationCommandeTexte(null)
  }

  async function seDeconnecter() {
    localStorage.removeItem('yoppaa_dashboard_commercant_id')
    // ⚠️ Le commerçant et le Yopper partagent le même stockage de session sur
    // un même navigateur : le marqueur de départ voulu se pose ici aussi.
    marquerDeconnexionVoulue()
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

  // Les bons vendus le jour affiché. `created_at` est la date de VENTE, celle
  // où l'argent est entré, et non l'expiration du bon.
  const bonsDuJourAffiche = modeHistorique ? [] : bonsDuJour(bonsVendus, jourActif, b => dateKey(b.created_at))
  const resumeBons = resumeBonsVendus(bonsDuJourAffiche)
  // Vue séparée Retrait / Livraison si le commerce a la livraison activée.
  const livraisonActive = !!commercant?.livraison_actif
  const commandesDuJour = livraisonActive
    ? commandesDuJourTous.filter(c => vueMode === 'livraison' ? c.mode_retrait === 'livraison' : c.mode_retrait !== 'livraison')
    : commandesDuJourTous

  // Les créneaux que le commerçant a fermés lui-même, POUR LE JOUR AFFICHÉ.
  const blocagesDuJour = indexBlocages(blocages.filter(b => b.date_blocage === jourActif))

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
  // ⚠️ LE BLOCAGE S'AJOUTE AU REMPLISSAGE, IL NE LE REMPLACE PAS.
  // `remplissageCreneaux` reste seul juge des commandes déjà prises : fermer un
  // créneau ne change pas ce qui est vendu, il met à zéro ce qui reste.
  const creneauxRemplis = (modeHistorique ? [] : remplissageCreneaux({
    creneaux: vueMode === 'livraison' ? creneauxLivraison : creneauxRetrait,
    commandes,
    jour: jourActif,
    modeCapaciteDefaut: commercant?.mode_capacite,
    champCreneau: vueMode === 'livraison' ? 'creneau_livraison_id' : 'creneau_id',
  })).map(c => ({ ...c, ...appliquerBlocage(c, blocagesDuJour.has(c.creneau?.id)) }))

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
  //
  // ⚠️ LES COMPTEURS SUIVENT L'AGENDA, ET C'EST TOUT NOUVEAU (Alex, 16/08). Ils
  // lisaient `jourActif`, la date du sélecteur de jours… qui n'est affiché QUE
  // dans l'onglet Commandes. Dans l'onglet Rendez-vous, cette date ne pouvait
  // donc JAMAIS changer : les compteurs étaient bloqués sur aujourd'hui à vie,
  // pendant que l'agenda naviguait de son côté avec sa propre date.
  //
  // ⚠️ L'intitulé posé le matin même n'a rien cassé, il a RÉVÉLÉ ce défaut :
  // Alex a vu « Aujourd'hui · dimanche 16 août » au-dessus d'un agenda ouvert
  // sur lundi 17. C'est exactement à ça que sert de nommer sa période.
  //
  // La règle est maintenant : LES COMPTEURS DÉCRIVENT CE QUE L'AGENDA MONTRE.
  // Une fenêtre, pas un jour, parce qu'en vue semaine l'agenda en montre sept.
  const fenetreRdv = fenetreAgenda || { debut: jourActif, fin: jourActif }
  const rdvsDuJour = modeHistorique
    ? rdvs.filter(r => new Date(r.date_rdv) < new Date(dateKey(new Date())))  // historique = passes
    : rdvs.filter(r => r.date_rdv >= fenetreRdv.debut && r.date_rdv <= fenetreRdv.fin)
  const statsRdv = {
    aujourdhui: rdvs.filter(r => r.date_rdv === dateKey(new Date()) && r.statut === 'confirme').length,
    duJour:     rdvsDuJour.length,
    confirmes:  rdvsDuJour.filter(r => r.statut === 'confirme').length,
    honores:    rdvsDuJour.filter(r => r.statut === 'honore').length,
    // ⚠️ LE COMPTEUR DES ANNULATIONS A ÉTÉ RETIRÉ ICI, ET IL FAUT DIRE POURQUOI
    // plutôt que de laisser quelqu'un le réécrire dans six mois. Il comptait
    // les rendez-vous de statut `'annule'`, une valeur qui N'EXISTE PAS : la
    // base n'accepte que `annule_client` et `annule_commercant`. Il valait donc
    // zéro même avec dix annulations, et personne ne s'en apercevait puisqu'il
    // n'était affiché nulle part.
    //
    // ⚠️ Un calcul faux qu'on ne montre pas est un piège en attente : le jour
    // où on l'affiche, il ment avec l'autorité d'un chiffre. Si le besoin
    // revient, la bonne écriture est `r.statut.startsWith('annule')`.
    noShow:     rdvsDuJour.filter(r => r.statut === 'no_show').length,
    // ⚠️ LE SEUL CHIFFRE QUI APPELLE UN GESTE, ET IL N'ÉTAIT NULLE PART (Alex,
    // 17/08). Quatre cartes annonçaient À venir, Honorés, No-show et le CA :
    // aucune ne disait ce qui restait à faire. Il faut être passé par la bande
    // Historique pour l'apprendre, et elle-même ne comptait qu'à partir du
    // lendemain.
    aClore:     compterAClore(rdvsDuJour),
    // ⚠️ « LE 21 À 15 €, ELLE N'APPARAÎT PAS DANS LE CA » (Alex, 16 puis
    // 17/08). Le calcul était JUSTE : la carte s'appelle « CA honoré » et ne
    // compte que les rendez-vous honorés, donc un rendez-vous à venir n'y entre
    // pas, et rien à l'écran ne disait où était passé son montant. Un compteur
    // qui a raison mais qui laisse chercher a tort quand même : on rend
    // maintenant LES DEUX, ce qui est en caisse et ce qui est attendu.
    // Le calcul vit dans `lib/rdv-paiement.js`, avec sa règle : une séance
    // d'abonnement, déjà payée à l'achat, n'entre pas une deuxième fois.
    ca: caDesRdvs(rdvsDuJour),
  }
  const statsCardsRdv = [
    { label: 'À venir',     value: statsRdv.confirmes,                    color: T.main,    bg: T.pale,   border: `${T.main}18`,   pulse: statsRdv.confirmes > 0 },
    { label: 'Honorés',     value: statsRdv.honores,                       color: '#10B981', bg: '#F0FDF4', border: '#10B98118',     pulse: false },
    // ⚠️ « À CLÔTURER » PREND LA PLACE DE « NO-SHOW » DÈS QU'IL Y A QUELQUE
    // CHOSE À FAIRE. Une carte qui vaut zéro n'apprend rien, et le nombre de
    // séances en attente est la seule des cinq qui demande une action : elle
    // mérite la place, et le rouge.
    statsRdv.aClore > 0
      ? { label: 'À clôturer', value: statsRdv.aClore,                     color: '#DC2626', bg: '#FFF0F0', border: '#DC262622',     pulse: true }
      : { label: 'No-show',    value: statsRdv.noShow,                     color: '#6B7280', bg: '#F9FAFB', border: '#9CA3AF22',     pulse: false },
    {
      label: 'CA honoré',
      value: `${statsRdv.ca.encaisse.toFixed(0)}€`,
      sous: statsRdv.ca.attendu > 0 ? `+ ${statsRdv.ca.attendu.toFixed(0)}€ à venir` : null,
      color: T.main, bg: T.pale, border: `${T.main}18`, pulse: false,
    },
  ]

  // ⚠️ DE QUEL JOUR PARLENT CES CHIFFRES (défaut trouvé par Alex, 16/08). Il
  // annule un rendez-vous, en honore un autre, et les compteurs restent à zéro.
  // Le calcul était juste : les quatre cartes ne décrivent QU'UN SEUL JOUR,
  // celui du sélecteur, alors que l'agenda juste dessous montre la SEMAINE. Il
  // agissait sur lundi pendant que les compteurs parlaient de samedi, et rien à
  // l'écran ne le disait. Un compteur qui ne nomme pas sa période ment par
  // omission. Le même intitulé sert aux deux onglets, qui ont le même schéma.
  //
  // ⚠️ DEUX SOURCES, ET C'EST VOULU : l'onglet Rendez-vous suit la fenêtre de
  // l'agenda, l'onglet Commandes garde son sélecteur de jours, qui lui EST
  // affiché. Chacun nomme ce qu'il montre vraiment, et c'est la seule règle qui
  // vaille — c'est en la violant qu'on a fabriqué le défaut d'aujourd'hui.
  const periodeStats = ongletPrincipal === 'rdv'
    ? libellePeriodeStats({ jour: fenetreRdv.debut, fin: fenetreRdv.fin, aujourdhui: todayKey, historique: modeHistorique })
    : libellePeriodeStats({ jour: jourActif, aujourdhui: todayKey, historique: modeHistorique })

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
              style={{ padding: '1rem 1.25rem', borderRadius: 14, border: `1.5px solid ${T.main}44`, background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1rem', textAlign: 'left', transition: 'all 0.15s' }}
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

  // ⚠️ Le refus se rend AVANT tout le reste, et il remplace l'écran au lieu de
  // rediriger : une redirection vers /login ferait croire à un problème de mot
  // de passe alors que le compte est parfaitement valide, juste pas encore
  // ouvert. La personne doit lire POURQUOI.
  if (refusAcces) return (
    <EcranValidation
      raison={refusAcces.raison}
      motif={refusAcces.motif}
      nomCommerce={refusAcces.nom}
      onDeconnexion={seDeconnecter}
    />
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
        /* ⚠️ LA CLOCHE ET LA DÉCONNEXION SORTAIENT DE L'ÉCRAN chez un commerce à
           TROIS onglets (Commandes, Rendez-vous, Paramètres). Les trois blocs
           étaient posés en space-between SANS espacement déclaré, et les deux
           extrêmes refusaient de rétrécir : la somme dépassait la largeur d'un
           téléphone d'une cinquantaine de pixels, que overflow: hidden avalait
           en silence, toujours du même côté, la droite.

           Qui cède maintenant : l'identité, et elle seule. Le commerçant connaît
           le nom de son commerce ; il a besoin de ses onglets et de ses deux
           boutons.

           ⚠️ ET PAS D'ACCENT GRAVE DANS CE COMMENTAIRE : toute cette feuille de
           style vit dans un gabarit de chaîne, où le premier accent grave ferme
           la chaîne et fait échouer l'analyse du fichier entier. */
        .topbar-inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
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
          /* ⚠️ SANS CETTE LIGNE, LE TABLEAU DE BORD DÉFILE LATÉRALEMENT. En CSS,
             un axe en 'auto' force l'autre à devenir défilable : 'overflow-y:
             auto' seul rend donc 'overflow-x' scrollable, et il suffit qu'un
             enfant dépasse d'un pixel pour que toute la page glisse. Le
             commerçant voit alors ses cartes décalées et une bande vide à
             droite, sans comprendre ce qu'il a fait. */
          overflow-x: hidden;
          /* Et sur mobile, le geste latéral ne doit pas non plus entraîner la
             page qui se trouve derrière. */
          overscroll-behavior-x: contain;
          padding: 1rem;
        }

        /* ⚠️ MASQUER NE SUFFIT PAS, IL FAUT QUE LE CONTENU S'ADAPTE. Sans ce
           plafond, 'overflow-x: hidden' se contenterait de COUPER ce qui
           dépasse : le commerçant ne verrait plus la page glisser, mais le
           bord droit de ses cartes aurait disparu, ce qui est pire parce que
           rien ne le signale.
           ⚠️ AUCUN BACKTICK DANS CE COMMENTAIRE : ce bloc vit dans un template
           literal JavaScript, et un seul backtick y ferme la chaîne et casse
           le fichier entier. Piège vécu le 12/08, refait le 13/08. */
        .scroll-zone > * { max-width: 100%; }
        .scroll-zone :where(input, textarea, select, img, video, table) {
          max-width: 100%;
          box-sizing: border-box;
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

      {/* Notif NOUVEAU RENDEZ-VOUS — le pendant exact de la nouvelle commande.
          Le salon n'avait RIEN : la coiffeuse découvrait ses réservations en
          pensant à ouvrir son agenda. Elle se place sous la carte de commande
          quand les deux tombent ensemble, ce qui arrive chez une vitrine qui
          vend aussi des produits. */}
      {nouveauRdv && (
        <div onClick={() => setNouveauRdv(null)}
          style={{ position: 'fixed', top: 20 + (nouvelleCommande ? 90 : 0), right: 20, left: 20, zIndex: 9999, maxWidth: 360, marginLeft: 'auto', animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)', cursor: 'pointer' }}>
          <div style={{ background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 60%, ${T.main} 100%)`, borderRadius: 18, padding: '16px 18px', color: '#fff', boxShadow: `0 24px 48px rgba(22,6,54,0.4), 0 0 0 1px ${T.main}55`, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'wiggle 0.7s ease-in-out infinite alternate' }}>
                <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 2 }}>
                {nouveauRdv.nombre > 1 ? `${nouveauRdv.nombre} nouveaux rendez-vous` : 'Nouveau rendez-vous'}
              </p>
              <p style={{ fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: '-0.3px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nouveauRdv.corps}</p>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[T.light, T.mid, '#fff'].map((c, i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c, animation: `dotPulse 0.8s ease-in-out ${i*0.15}s infinite alternate` }}/>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notif BON CADEAU VENDU. Il n'a rien à faire, donc pas le violet
          d'urgence des commandes : du blanc, discret, mais il l'apprend au
          moment où ça arrive au lieu de le découvrir dans ses chiffres. */}
      {nouveauBon && (
        <div onClick={() => setNouveauBon(null)}
          style={{ position: 'fixed', top: 20 + (nouvelleCommande ? 90 : 0) + (nouveauRdv ? 90 : 0), right: 20, left: 20, zIndex: 9997, maxWidth: 360, marginLeft: 'auto', animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)', cursor: 'pointer' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '14px 18px', boxShadow: `0 24px 48px rgba(22,6,54,0.18), 0 0 0 1px ${T.pale}`, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/>
                <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 2 }}>
                {nouveauBon.nombre > 1 ? `${nouveauBon.nombre} bons cadeaux vendus` : 'Bon cadeau vendu'}
              </p>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.ink, margin: 0, lineHeight: 1.35 }}>{nouveauBon.corps}</p>
            </div>
          </div>
        </div>
      )}

      {/* Notif COMMANDE RÉCUPÉRÉE — card flottante en haut à droite (sans cacher la liste) */}
      {commandeRecuperee && (
        <div onClick={() => setCommandeRecuperee(null)}
          /* Trois cartes peuvent tomber en même temps chez une vitrine qui vend
             aussi des produits : chacune se décale sous la précédente. */
          style={{ position: 'fixed', top: 20 + (nouvelleCommande ? 90 : 0) + (nouveauRdv ? 90 : 0) + (nouveauBon ? 84 : 0), right: 20, left: 20, zIndex: 9998, maxWidth: 360, marginLeft: 'auto', animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)', cursor: 'pointer' }}>
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
              { key: 'commandes', label: 'Commandes',   Icon: IconCommandes, visible: commercant?.categorie !== 'vitrine' || canDo(planEffectif(commercant), 'commande') },
              // Services : l'onglet Rendez-vous reste visible même module non
              // activé (l'agenda explique alors comment l'activer), sinon un
              // salon qui vend aussi des produits ne voyait que Commandes.
              { key: 'rdv',       label: 'Rendez-vous', Icon: IconRdv,       visible: !!commercant?.rdv_actif || (commercant?.categorie === 'vitrine' && canDo(planEffectif(commercant), 'rdv')) },
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
              <div style={{ flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
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

              {/* ⚠️ LE LIBELLÉ NE S'AFFICHE QUE SUR L'ONGLET OUVERT. Trois mots
                  côte à côte prenaient 85 pixels de trop et poussaient la cloche
                  hors de l'écran. On garde donc le mot là où il sert, pour dire
                  où l'on est, et les autres se contentent de leur icône, qui
                  reste nommée pour les lecteurs d'écran et au survol. */}
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                {[
                  { key: 'commandes', label: 'Cmd',    titre: 'Commandes',   Icon: IconCommandes, visible: commercant?.categorie !== 'vitrine' || canDo(planEffectif(commercant), 'commande') },
                  { key: 'rdv',       label: 'RDV',    titre: 'Rendez-vous', Icon: IconRdv,       visible: !!commercant?.rdv_actif || (commercant?.categorie === 'vitrine' && canDo(planEffectif(commercant), 'rdv')) },
                  { key: 'config',    label: 'Config', titre: 'Paramètres',  Icon: IconConfig,    visible: true },
                ].filter(t => t.visible).map(({ key, label, titre, Icon }) => {
                  const actif = ongletPrincipal === key
                  const badgeCount = key === 'commandes' ? stats.nouvelles : key === 'rdv' ? statsRdv.aujourdhui : 0
                  return (
                    <button key={key} onClick={() => setOngletPrincipal(key)} title={titre} aria-label={titre} aria-current={actif ? 'page' : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: actif ? 5 : 0, padding: actif ? '0.35rem 0.625rem' : '0.35rem 0.5rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.72rem', transition: 'all 0.2s', background: actif ? T.main : 'transparent', color: actif ? '#fff' : T.light, boxShadow: actif ? `0 3px 12px ${T.main}55` : 'none', position: 'relative', whiteSpace: 'nowrap' }}>
                      <Icon size={13} color={actif ? '#fff' : T.light}/>
                      {actif && label}
                      {badgeCount > 0 && (
                        <span style={{ position: 'absolute', top: -4, right: -4, background: key === 'rdv' ? '#10B981' : '#DC2626', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 100, animation: key === 'commandes' ? 'pulse 2s ease infinite' : 'none' }}>{badgeCount}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <button onClick={activerNotifications}
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: `1px solid ${notificationsActives ? T.main : 'rgba(255,255,255,0.15)'}`, background: notificationsActives ? `${T.main}44` : 'rgba(255,255,255,0.08)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}>
                  <IconBell size={15} color={notificationsActives ? '#fff' : T.light} active={notificationsActives}/>
                </button>
                <button onClick={seDeconnecter}
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1px solid #DC262333', background: '#DC262311', cursor: 'pointer', flexShrink: 0 }}>
                  <IconLogout size={15}/>
                </button>
              </div>
            </div>
          </div>

          {/* ─── CE QUI N'EST PAS PARTI CHEZ LE CLIENT ─────────────────────
              🔴 « Le mail colis prêt n'arrive pas » (Alex, 27/08). Il ne
              partait pas ET personne ne pouvait le savoir : quatre couches se
              passaient le silence. Voir `prevenirClient`.

              ⚠️ ELLE DIT CE QUI MARCHE ENCORE. Sans ça le commerçant croit
              avoir tout perdu et rappelle son client à la main, alors que sa
              commande est bien à jour dans l'application. Un avertissement qui
              n'indique pas la suite est une inquiétude, pas une information.

              ⚠️ ET ELLE NE S'AFFICHE QUE POUR CE QUI ENGAGE LE CLIENT : un
              push raté n'apparaît pas ici. Une bande qui s'allume tout le
              temps ne se lit plus le jour où elle compte. */}
          {envoiRate && (
            <div style={{ margin: '0 0 12px', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#92400E', lineHeight: 1.4 }}>
                  {envoiRate.quoi} n&rsquo;a pas abouti
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', fontWeight: 600, color: '#92400E', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  {envoiRate.suite || 'Ta commande est bien à jour, ton client la voit dans son application. Tu peux le prévenir par téléphone si c’est urgent.'}
                  {envoiRate.erreur ? ` (${envoiRate.erreur})` : ''}
                </p>
              </div>
              <button onClick={() => setEnvoiRate(null)} aria-label="Fermer"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, color: '#B45309', fontWeight: 900, fontSize: '1rem', lineHeight: 1 }}>
                ×
              </button>
            </div>
          )}

          {/* ─── Actions rapides (esprit ODOO : les gestes de comptoir sont à
              portée de clic depuis l'écran d'accueil, sans fouiller les
              Paramètres). Demande Alex 01/08. ─── */}
          {ongletPrincipal !== 'config' && commercant && (() => {
            const actions = [
              canDo(planEffectif(commercant), 'fidelite') && {
                key: 'fidelite',
                label: commercant.fidelite_actif ? 'Carte de fidélité' : 'Activer la fidélité',
                aide: commercant.fidelite_actif ? 'Pointer un client au comptoir' : 'Programme en 2 minutes',
                icone: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/></svg>,
              },
              canDo(planEffectif(commercant), 'bons_cadeaux') && commercant.bons_cadeaux_actif && {
                key: 'bons',
                label: 'Bon cadeau',
                aide: 'Encaisser un code',
                icone: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>,
              },
              canDo(planEffectif(commercant), 'deals') && {
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
              {periodeStats && (
                <p style={{ margin: '0 0 6px', fontSize: '0.62rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  {periodeStats}
                </p>
              )}
              <div className="stats-grid">
                {statsCardsRdv.map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '0.5rem 0.75rem', border: `1.5px solid ${s.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      {s.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block', animation: 'pulse 1.5s ease infinite', flexShrink: 0 }}/>}
                      <p style={{ fontSize: '0.58rem', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</p>
                    </div>
                    <p style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, letterSpacing: '-1px', lineHeight: 1 }}>{s.value}</p>
                    {/* Ce qui n'est pas encore encaissé se lit SOUS le chiffre,
                        et jamais à sa place : la carte annonce le CA honoré, et
                        montre en petit ce qui l'attend. */}
                    {s.sous && (
                      <p style={{ fontSize: '0.6rem', fontWeight: 800, color: T.muted, marginTop: 3, lineHeight: 1 }}>{s.sous}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sticky header */}
          {ongletPrincipal === 'commandes' && (
            <div className="sticky-header">
              {/* Stats */}
              {periodeStats && (
                <p style={{ margin: '0 0 6px', fontSize: '0.62rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  {periodeStats}
                </p>
              )}
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
              {livraisonActive && (() => {
                // ⚠️ LE COMPTEUR EXISTANT N'EST PAS UNE ALERTE. Il affiche le
                // TOTAL du jour, commandes déjà traitées comprises, et il ne
                // bouge pas d'un pixel quand une nouvelle tombe. Un « 4 »
                // affiché toute la journée finit par ne plus être lu.
                // Ce qui compte, c'est le nombre de GESTES QUI ATTENDENT, et la
                // règle vit dans `lib/tableau-de-bord` (demande d'Alex, 22/08).
                const alerte = alerteAutreOnglet(commandesDuJourTous, vueMode)
                return (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { v: 'retrait', label: 'Retrait', n: commandesDuJourTous.filter(c => c.mode_retrait !== 'livraison').length },
                        { v: 'livraison', label: 'Livraison', n: commandesDuJourTous.filter(c => c.mode_retrait === 'livraison').length },
                      ].map(m => (
                        <button key={m.v} onClick={() => { setVueMode(m.v); setFiltreStatut('actives') }}
                          /* T.hairline n'existe pas dans la palette de cet écran : le bouton
                             inactif rendait « 2px solid undefined », donc AUCUN contour. */
                          style={{ position: 'relative', flex: 1, padding: '9px', borderRadius: 10, border: `2px solid ${vueMode === m.v ? T.main : T.pale}`, background: vueMode === m.v ? T.main : '#fff', color: vueMode === m.v ? '#fff' : T.ink, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                          {m.label}{m.n > 0 ? ` · ${m.n}` : ''}
                          {/* La pastille ne vit QUE sur l'onglet qu'il ne
                              regarde pas : une alerte sur la vue courante
                              apprend à ignorer les alertes. */}
                          {alerte?.mode === m.v && (
                            <span aria-hidden="true" style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 100, background: '#DC2626', color: '#fff', fontSize: 10.5, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', lineHeight: 1 }}>
                              {alerte.nb}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    {/* ⚠️ ET LE TEXTE DIT LE CÔTÉ ET LE NOMBRE. Une pastille
                        seule fait basculer pour voir ; la phrase lui permet de
                        décider d'y aller ou non sans quitter son écran
                        (feedback_information_complete). */}
                    {alerte && (
                      <button type="button" onClick={() => { setVueMode(alerte.mode); setFiltreStatut('actives') }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 6, padding: '7px 10px', borderRadius: 9, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#991B1B', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'left' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }}/>
                        {alerte.texte} · appuie pour y aller
                      </button>
                    )}
                  </div>
                )
              })()}

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
                {/* ⚠️ LES BONS CADEAUX VENDUS, que le commerçant ne voyait NULLE
                    PART. Il n'a rien à préparer, d'où le bandeau discret plutôt
                    qu'une vignette de commande avec ses boutons : mais quelqu'un
                    vient d'offrir son commerce, et c'est un client qui viendra. */}
                {resumeBons.nombre > 0 && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '11px 14px', marginBottom: 12, border: `1px solid ${T.pale}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/>
                        <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {resumeBons.nombre > 1 ? `${resumeBons.nombre} bons cadeaux vendus` : 'Bon cadeau vendu'}
                      </p>
                      <p style={{ fontSize: '0.95rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.3px', margin: '1px 0 0' }}>
                        {eurosNus(resumeBons.total)}€
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: T.muted, marginLeft: 7 }}>déjà encaissés · rien à préparer</span>
                      </p>
                    </div>
                  </div>
                )}

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
                      {creneauxRemplis.map((rempli) => {
                        const { creneau, modeTemps, capacite, utiliseEff, complet, bientot, presque, bloque } = rempli
                        // ⚠️ « FERMÉ » A SA PROPRE COULEUR, DISTINCTE DE
                        // « COMPLET ». Les confondre ferait chercher au
                        // commerçant des commandes qui n'existent pas : complet
                        // veut dire que ses clients ont rempli, fermé qu'il a
                        // fermé lui-même.
                        const couleur = bloque ? '#6B7280' : complet ? T.rouge.badge : bientot ? T.orange.badge : presque ? '#CA8A04' : T.vert.badge
                        const ratio = capacite > 0 ? Math.min(1, utiliseEff / capacite) : 0
                        const etat = etatCreneau(rempli)
                        // Le blocage ne concerne que les créneaux de RETRAIT :
                        // les tournées vivent dans une autre table.
                        const peutBloquer = vueMode !== 'livraison' && !modeHistorique
                        return (
                          <div key={creneau.id} style={{ minWidth: 98, flexShrink: 0, borderRadius: 10, padding: '8px 10px', background: bloque ? '#F3F4F6' : complet ? T.rouge.cardBg : '#FBFAFF', border: `1.5px solid ${couleur}33` }}>
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
                            {/* ⚠️ LE GESTE EST LÀ OÙ IL REGARDE. Le commerçant
                                débordé n'ira pas dans sa configuration des
                                créneaux : il a les mains dans la farine et
                                trente secondes. Le bouton vit donc sur la bande
                                qu'il consulte déjà (demande relayée par Alex).

                                ⚠️ PAS DE ROUGE POUR FERMER : rien n'est détruit,
                                et les commandes déjà prises restent
                                (feedback_boutons_qui_disent_le_geste). */}
                            {peutBloquer && (
                              <button type="button"
                                onClick={() => basculerBlocageCreneau(creneau.id, bloque)}
                                title={bloque
                                  ? 'Rouvrir ce créneau aux commandes Yoppaa'
                                  : 'Ne plus accepter de commande sur ce créneau. Celles déjà prises restent.'}
                                style={{ width: '100%', marginTop: 6, padding: '4px 0', borderRadius: 7, border: `1px solid ${bloque ? T.vert.badge + '55' : T.pale}`, background: bloque ? '#F0FDF4' : '#fff', color: bloque ? T.vert.badge : T.muted, fontWeight: 800, fontSize: '0.58rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', letterSpacing: '0.2px' }}>
                                {bloque ? 'Rouvrir' : 'Fermer'}
                              </button>
                            )}
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
                    // Le jour n'entre plus dans le calcul du numéro : la
                    // référence est portée par la commande elle-même.
                    return (
                      <CarteCommande
                        key={commande.id}
                        commande={commande}
                        numero={getNumeroJour(commandes, commande.id)}
                        onChangerStatut={changerStatut}
                        onLivraisonStatut={changerStatutLivraison}
                        onExpedier={setCommandeAExpedier}
                        onProduitsRemis={produitsRemis}
                        onRetourArriere={annulerRemise}
                        filtreCourant={filtreStatut}
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
                    onHonorerSeance={(inscrits) => setSeanceAHonorer(inscrits)}
                    onFenetreChange={majFenetreAgenda}
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
                {/* ⚠️ LA MODALE DE DÉTAIL N'EST PLUS ICI, et elle ne doit jamais y
                    revenir. Voir le bloc « Modale détail RDV » au niveau
                    supérieur, juste avant la fermeture du composant. */}
              </>
            )}

            {ongletPrincipal === 'config' && commercant && (
              <ConfigDashboard key={configTab} commercantId={commercant.id} tabInitial={configTab}/>
            )}
          </div>
        </div>
      </div>

      {/* ─── Modale détail RDV ────────────────────────────────────────────────
          ⚠️ RENDUE ICI, HORS DE `.scroll-zone`, ET C'EST TOUT L'ENJEU.
          Elle vivait à l'intérieur de la zone défilante, qui porte
          `-webkit-overflow-scrolling: touch`. Sur iPhone, ce réglage PIÈGE les
          éléments en `position: fixed` : ils se placent par rapport au
          conteneur qui défile et non par rapport à l'écran. La modale
          commençait donc sous l'en-tête des statistiques, qui lui mangeait le
          haut, et le nom du client comme la date du rendez-vous étaient
          invisibles.
          L'écran de retrait du client porte le même avertissement depuis le
          05/08 : « rendu HORS de page-wrap ». Même piège, même remède. */}
      {rdvSelectionne && (
        <div onClick={() => setRdvSelectionne(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998, padding: '1rem' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '85dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <CarteRdv rdv={rdvSelectionne}
              onChangerStatut={(id, st, raison) => { changerStatutRdv(id, st, raison); setRdvSelectionne(null) }}
              onDemanderAction={(r, action) => { setRdvSelectionne(null); setActionRdv({ rdv: r, action }) }}
              onDeplacer={(r) => { setRdvSelectionne(null); setRdvADeplacer(r) }}/>
            <button onClick={() => setRdvSelectionne(null)}
              style={{ width: '100%', marginTop: 12, padding: '0.75rem', background: '#fff', border: `1.5px solid ${T.pale}`, borderRadius: 100, color: T.muted, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif' }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ─── Modale « Déplacer ce RDV » ────────────────────────────────────── */}
      {rdvADeplacer && commercant && (
        <ModalDeplacerRdv
          commercant={commercant}
          rdv={rdvADeplacer}
          prestations={prestationsRdv}
          creneaux={creneauxRdv}
          rdvsExistants={rdvs}
          onClose={() => setRdvADeplacer(null)}
          onDeplace={() => {
            // Le déplacement se confirme comme le reste : la modale se ferme,
            // et une fenêtre dit ce qui vient d'être fait. Sans elle, le
            // commerçant ne sait pas si le client a été prévenu.
            const deplace = rdvADeplacer
            setRdvADeplacer(null)
            chargerRdvs(commercant.id)
            setActionRdv({ rdv: deplace, action: 'deplace' })
            setConfirmationRdvTexte(confirmationRdv('deplace', { rdv: deplace }))
          }}
        />
      )}

      {/* ⚠️ LE POSTE DE CONFIRMATION, MONTÉ UNE SEULE FOIS POUR TOUTE LA PAGE.
          C'est lui qui répond aux `confirme()` appelés de partout, y compris
          depuis ConfigDashboard, qui est rendu plus haut dans cette même page.
          Sans lui, `confirme()` rend `null` et aucun geste destructif ne part :
          le repli penche du côté qui ne détruit pas. */}
      <PosteConfirmation />

      {/* ─── LE COLIS EST PARTI : CHEZ QUI, SOUS QUEL NUMÉRO ──────────────── */}
      {/* 🔴 C'était un `window.prompt()` jusqu'au 26/08 : la boîte grise du
          système, un seul champ, aucun transporteur. */}
      <ModaleExpedition
        ouverte={!!commandeAExpedier}
        reference={commandeAExpedier && referenceCommande(commandeAExpedier)
          ? `#${referenceCommande(commandeAExpedier)}` : null}
        transporteurInitial={commandeAExpedier?.expedition_transporteur || ''}
        suiviInitial={commandeAExpedier?.expedition_suivi || ''}
        onValider={({ transporteur, suivi }) => {
          const id = commandeAExpedier?.id
          setCommandeAExpedier(null)
          if (id) expedierCommande(id, { transporteur, suivi })
        }}
        onFermer={() => setCommandeAExpedier(null)}
      />

      {/* ─── LA FENÊTRE QUI DEMANDE, PUIS QUI CONFIRME ────────────────────── */}
      <ModaleConfirmation
        ouverte={!!actionRdv}
        {...(actionRdv && !confirmationRdvTexte ? (questionRdv(actionRdv.action, actionRdv.rdv) || {}) : {})}
        enCours={actionEnCours}
        confirmation={confirmationRdvTexte}
        onChoix={repondreActionRdv}
        onFermer={fermerActionRdv}
      />

      {/* ─── CLÔTURER UN COURS ENTIER ─────────────────────────────────────── */}
      <ModaleConfirmation
        ouverte={!!seanceAHonorer}
        {...(seanceAHonorer && !confirmationSeanceTexte
          ? (questionSeanceHonoree(seanceAHonorer.length, {
              // Le total qui reste à encaisser sur tout le cours. Les abonnées
              // pèsent zéro : si elles sont seules, la question du moyen de
              // paiement ne se pose même pas.
              montant: seanceAHonorer.reduce((somme, r) => somme + (resteAEncaisser(r) || 0), 0),
            }) || {})
          : {})}
        enCours={actionEnCours}
        confirmation={confirmationSeanceTexte}
        onChoix={repondreSeance}
        onFermer={fermerSeance}
      />

      {/* ─── ENCAISSER UNE COMMANDE PAYÉE SUR PLACE ───────────────────────── */}
      <ModaleConfirmation
        ouverte={!!commandeAEncaisser}
        {...(commandeAEncaisser && !confirmationCommandeTexte
          ? (questionEncaissement({
              montant: resteAEncaisserCommande(commandeAEncaisser),
              nom: referenceCommande(commandeAEncaisser) ? `Commande #${referenceCommande(commandeAEncaisser)}` : null,
            }) || {})
          : {})}
        enCours={actionEnCours}
        confirmation={confirmationCommandeTexte}
        onChoix={repondreCommande}
        onFermer={fermerCommandeEncaissement}
      />
    </div>
  )
}