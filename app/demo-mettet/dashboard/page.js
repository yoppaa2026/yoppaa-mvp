'use client'
// ════════════════════════════════════════════════════════════════════
// MOCK DASHBOARD COMMUNE METTET — pour la démo conseil communal 15/06.
//
// URL : /demo-mettet/dashboard (accessible direct, pas d'auth pour la démo)
//
// 3 onglets :
//   📊 Vue d'ensemble : KPIs + activité récente
//   🚨 Signalements   : liste avec photos + boutons d'action
//   📰 Actus          : table CRUD avec bouton "Nouvelle actu"
//
// Données 100% mockées, pas de Supabase fetch. Le vrai dashboard
// (auth, CRUD réel, stats live) sera codé post-partenariat conseil.
// ════════════════════════════════════════════════════════════════════

import { useState } from 'react'

const T = {
  bg:       '#F5F3FA',
  bgCard:   '#FFFFFF',
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',
  pale:     '#EDE0FF',
  hairline: '#F0EBF8',
  muted:    '#6B7280',
}

// ────────── DONNÉES MOCKÉES ──────────

const KPIS = {
  signalements_nouveau:  4,
  signalements_en_cours: 2,
  signalements_traites:  18,
  actus_publiees:        4,
  alertes_actives:       1,
  visites_fiche_mois:    1843,
  yoppers_mettetois:     127,
}

const SIGNALEMENTS = [
  {
    id: 's1', type: 'nid_poule', statut: 'nouveau',
    adresse: 'Rue de l\'Église 12, 5640 Mettet',
    description: 'Trou profond environ 15 cm, dangereux pour les vélos',
    yopper: 'Alexandre V.', yopper_email: 'verstappenalexandre@gmail.com',
    created_at: '2026-06-13T08:32:00',
    photo_emoji: '🕳️',
  },
  {
    id: 's2', type: 'depot_sauvage', statut: 'nouveau',
    adresse: 'Chemin du Bois 8, 5641 Furnaux',
    description: 'Sacs poubelles + matelas abandonnés au bord de la route',
    yopper: 'Sophie M.', yopper_email: 'sophie.m@example.be',
    created_at: '2026-06-12T17:45:00',
    photo_emoji: '🗑️',
  },
  {
    id: 's3', type: 'nid_poule', statut: 'nouveau',
    adresse: 'Place Joseph Meunier, 5640 Mettet',
    description: 'Pavés descellés près du passage piéton',
    yopper: 'Anonyme', yopper_email: 'anonyme@example.be',
    created_at: '2026-06-12T14:20:00',
    photo_emoji: '🕳️',
  },
  {
    id: 's4', type: 'egout', statut: 'nouveau',
    adresse: 'Rue des Combattants, 5644 Ermeton-sur-Biert',
    description: 'Avaloir complètement bouché, eau stagnante depuis 3 jours',
    yopper: 'Pierre L.', yopper_email: 'pierre.l@example.be',
    created_at: '2026-06-11T09:10:00',
    photo_emoji: '🚰',
  },
  {
    id: 's5', type: 'depot_sauvage', statut: 'en_cours',
    adresse: 'Stationnement parc à conteneurs',
    description: 'Encombrants déposés à côté du parc fermé',
    yopper: 'Marc D.', yopper_email: 'marc.d@example.be',
    created_at: '2026-06-10T15:50:00',
    photo_emoji: '🗑️',
  },
  {
    id: 's6', type: 'nid_poule', statut: 'en_cours',
    adresse: 'Rue de Stave 47, 5646 Stave',
    description: 'Affaissement de chaussée sur 2 mètres',
    yopper: 'Julie B.', yopper_email: 'julie.b@example.be',
    created_at: '2026-06-09T11:30:00',
    photo_emoji: '🕳️',
  },
]

const TYPE_LABEL = {
  nid_poule:     { emoji: '🕳️',  label: 'Nid de poule',     color: '#92400E', bg: '#FEF3C7' },
  depot_sauvage: { emoji: '🗑️', label: 'Dépôt sauvage',    color: '#7F1D1D', bg: '#FEE2E2' },
  egout:         { emoji: '🚰', label: 'Égout bouché',     color: '#1E40AF', bg: '#DBEAFE' },
  autre:         { emoji: '⚠️',  label: 'Autre',            color: '#374151', bg: '#F3F4F6' },
}

const STATUT_LABEL = {
  nouveau:  { label: 'Nouveau',   color: '#065F46', bg: '#D1FAE5' },
  en_cours: { label: 'En cours',  color: '#92400E', bg: '#FEF3C7' },
  traite:   { label: 'Traité',    color: '#3730A3', bg: '#E0E7FF' },
  ferme:    { label: 'Fermé',     color: '#6B7280', bg: '#F3F4F6' },
}

const ACTUS = [
  { id: 'a1', type: 'actu', titre: 'Marché du terroir', contenu: 'Tous les dimanches matin sur la Place J. Meunier', date_debut: '2026-06-01', date_fin: '2026-12-31', actif: true },
  { id: 'a2', type: 'actu', titre: 'Inscription stage été pour les 6-12 ans', contenu: 'Inscriptions ouvertes jusqu\'au 25/06 à la Maison de la Jeunesse', date_debut: '2026-06-01', date_fin: '2026-06-25', actif: true },
  { id: 'a3', type: 'actu', titre: 'Conseil communal du 27 juin', contenu: 'Ordre du jour disponible sur mettet.be', date_debut: '2026-06-13', date_fin: '2026-06-27', actif: true },
  { id: 'a4', type: 'alerte', titre: 'Travaux Place du Marché', contenu: 'Stationnement interdit du 22/06 au 5/07. Déviation par la rue Saint-Donat.', date_debut: '2026-06-22', date_fin: '2026-07-05', actif: true },
]

const ACTIVITE_RECENTE = [
  { time: 'Il y a 23 min', emoji: '🕳️', text: 'Nouveau signalement nid de poule', adresse: 'Rue de l\'Église 12' },
  { time: 'Il y a 1 h',    emoji: '📰', text: 'Actu publiée', adresse: '"Conseil communal du 27 juin"' },
  { time: 'Il y a 3 h',    emoji: '🗑️', text: 'Signalement dépôt sauvage', adresse: 'Chemin du Bois' },
  { time: 'Il y a 5 h',    emoji: '✓',  text: 'Signalement marqué comme traité', adresse: 'Voirie rue de Stave' },
  { time: 'Hier 16h45',    emoji: '🕳️', text: 'Nouveau signalement nid de poule', adresse: 'Place Meunier' },
]

// ────────── ICÔNES SVG ──────────

function IconChart({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/>
    </svg>
  )
}
function IconWarning({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
      <path d="M12 9v4M12 17h.01"/>
    </svg>
  )
}
function IconNewspaper({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z"/>
    </svg>
  )
}

// ────────── COMPOSANTS ──────────

function Sidebar({ onglet, setOnglet }) {
  const items = [
    { key: 'overview',     label: 'Vue d\'ensemble', Icon: IconChart },
    { key: 'signalements', label: 'Signalements',   Icon: IconWarning, badge: KPIS.signalements_nouveau },
    { key: 'actus',        label: 'Actus & Alertes', Icon: IconNewspaper },
  ]
  return (
    <aside style={{ width: 240, background: `linear-gradient(180deg, ${T.ink} 0%, ${T.deep} 100%)`, color: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

      {/* Logo + nom commune */}
      <div style={{ padding: '24px 22px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            🏛️
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, letterSpacing: '-0.3px' }}>Mairie de Mettet</p>
            <p style={{ margin: '1px 0 0', fontSize: 10, color: T.light, fontWeight: 700, letterSpacing: '0.5px' }}>TABLEAU DE BORD</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '14px 12px' }}>
        {items.map(item => {
          const actif = onglet === item.key
          return (
            <button key={item.key} onClick={() => setOnglet(item.key)}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px',
                marginBottom: 4,
                background: actif ? 'rgba(196,160,244,0.18)' : 'transparent',
                border: actif ? '1px solid rgba(196,160,244,0.3)' : '1px solid transparent',
                borderRadius: 10,
                color: actif ? '#fff' : 'rgba(255,255,255,0.7)',
                fontWeight: actif ? 800 : 600,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}>
              <item.Icon size={18} color={actif ? T.light : 'rgba(255,255,255,0.6)'}/>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span style={{ background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 100 }}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer sidebar : powered by */}
      <div style={{ padding: '18px 22px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
          Propulsé par
        </p>
        <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontSize: 16, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1 }}>
          <span style={{ color: '#fff' }}>yo</span>
          <span style={{ color: T.light }}>pp</span>
          <span style={{ color: T.mid }}>aa</span>
        </p>
      </div>
    </aside>
  )
}

function Header({ titre, sousTitre }) {
  return (
    <header style={{ background: '#fff', borderBottom: `1px solid ${T.hairline}`, padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px' }}>{titre}</h1>
        {sousTitre && <p style={{ margin: '2px 0 0', fontSize: 12, color: T.muted, fontWeight: 600 }}>{sousTitre}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={{ padding: '8px 16px', background: T.bg, border: `1px solid ${T.pale}`, borderRadius: 100, color: T.deep, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          🔔 Notifications
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
            BG
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.ink }}>Bourgmestre</p>
            <p style={{ margin: 0, fontSize: 10, color: T.muted, fontWeight: 600 }}>mettet@mettet.be</p>
          </div>
        </div>
      </div>
    </header>
  )
}

function KPICard({ label, value, color = T.main, badge = null }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, padding: '18px 20px' }}>
      <p style={{ margin: 0, fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: '8px 0 0', fontSize: 32, fontWeight: 900, color, letterSpacing: '-1px', lineHeight: 1 }}>{value}</p>
      {badge && <p style={{ margin: '6px 0 0', fontSize: 11, color: badge.color, fontWeight: 700 }}>{badge.text}</p>}
    </div>
  )
}

function Overview() {
  return (
    <div style={{ padding: '24px 32px' }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 26 }}>
        <KPICard label="Nouveaux signalements" value={KPIS.signalements_nouveau} color="#DC2626" badge={{ text: '↑ +2 depuis hier', color: '#DC2626' }}/>
        <KPICard label="En cours de traitement" value={KPIS.signalements_en_cours} color="#D97706"/>
        <KPICard label="Traités ce mois" value={KPIS.signalements_traites} color="#10B981" badge={{ text: '↑ +6 vs mois dernier', color: '#10B981' }}/>
        <KPICard label="Visites fiche Yoppaa" value={KPIS.visites_fiche_mois.toLocaleString('fr-BE')} color={T.main} badge={{ text: '↑ +12% ce mois', color: '#10B981' }}/>
      </div>

      {/* 2 colonnes : activité récente + état général */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>

        {/* Activité récente */}
        <div style={{ background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, padding: '20px 22px' }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 900, color: T.deep, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
            Activité récente
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ACTIVITE_RECENTE.map((act, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: 12, borderBottom: i < ACTIVITE_RECENTE.length - 1 ? `1px solid ${T.hairline}` : 'none' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {act.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, color: T.ink, fontWeight: 700, lineHeight: 1.3 }}>{act.text}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: T.muted, fontWeight: 600 }}>{act.adresse}</p>
                </div>
                <p style={{ margin: 0, fontSize: 10, color: T.muted, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>{act.time}</p>
              </div>
            ))}
          </div>
        </div>

        {/* État général */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'linear-gradient(135deg, #1A0840, #6B35C4)', borderRadius: 14, padding: '22px 24px', color: '#fff' }}>
            <p style={{ margin: 0, fontSize: 11, color: T.light, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Yoppers mettetois
            </p>
            <p style={{ margin: '10px 0 4px', fontSize: 36, fontWeight: 900, letterSpacing: '-1.2px', lineHeight: 1 }}>
              {KPIS.yoppers_mettetois}
            </p>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, opacity: 0.9 }}>citoyens utilisent l&rsquo;app</p>
          </div>

          <div style={{ background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, padding: '18px 20px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: T.deep, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
              📰 Publications actives
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: `1px solid ${T.hairline}`, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>Actus en ligne</span>
              <span style={{ fontSize: 16, color: T.main, fontWeight: 900 }}>{KPIS.actus_publiees}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>Alertes actives</span>
              <span style={{ fontSize: 16, color: '#DC2626', fontWeight: 900 }}>{KPIS.alertes_actives}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

function SignalementsList() {
  const [filtre, setFiltre] = useState('tous')  // tous / nouveau / en_cours / traite

  const filtres = [
    { key: 'tous',     label: 'Tous', count: SIGNALEMENTS.length },
    { key: 'nouveau',  label: 'Nouveaux', count: SIGNALEMENTS.filter(s => s.statut === 'nouveau').length },
    { key: 'en_cours', label: 'En cours', count: SIGNALEMENTS.filter(s => s.statut === 'en_cours').length },
  ]
  const list = filtre === 'tous' ? SIGNALEMENTS : SIGNALEMENTS.filter(s => s.statut === filtre)

  return (
    <div style={{ padding: '24px 32px' }}>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {filtres.map(f => (
          <button key={f.key} onClick={() => setFiltre(f.key)}
            style={{
              padding: '8px 14px', borderRadius: 100,
              background: filtre === f.key ? T.ink : '#fff',
              color: filtre === f.key ? '#fff' : T.deep,
              border: filtre === f.key ? 'none' : `1px solid ${T.pale}`,
              fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            {f.label}
            <span style={{ background: filtre === f.key ? 'rgba(255,255,255,0.2)' : T.pale, color: filtre === f.key ? '#fff' : T.deep, fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 100 }}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Liste des signalements */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map(s => {
          const t = TYPE_LABEL[s.type]
          const st = STATUT_LABEL[s.statut]
          const dateBE = new Date(s.created_at).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
          return (
            <div key={s.id} style={{ background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, overflow: 'hidden', display: 'flex' }}>

              {/* Photo "mockée" : grand emoji sur fond coloré */}
              <div style={{ width: 140, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 56 }}>{s.photo_emoji}</span>
              </div>

              {/* Contenu */}
              <div style={{ flex: 1, padding: '16px 20px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 9px', background: t.bg, color: t.color, borderRadius: 100, fontSize: 10, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                    {t.emoji} {t.label}
                  </span>
                  <span style={{ padding: '3px 9px', background: st.bg, color: st.color, borderRadius: 100, fontSize: 10, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginLeft: 'auto' }}>
                    🕐 {dateBE}
                  </span>
                </div>
                <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: T.ink, letterSpacing: '-0.2px' }}>
                  📍 {s.adresse}
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: T.muted, lineHeight: 1.5, fontStyle: 'italic' }}>
                  « {s.description} »
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: T.deep, fontWeight: 700 }}>👤 {s.yopper}</span>
                  <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>📧 {s.yopper_email}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {s.statut !== 'traite' && (
                      <>
                        <button style={{ padding: '7px 14px', background: '#fff', color: T.deep, border: `1.5px solid ${T.pale}`, borderRadius: 100, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Répondre
                        </button>
                        <button style={{ padding: '7px 14px', background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', border: 'none', borderRadius: 100, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Marquer traité ✓
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ActusList() {
  return (
    <div style={{ padding: '24px 32px' }}>

      {/* Bouton créer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <p style={{ margin: 0, fontSize: 13, color: T.muted, fontWeight: 600 }}>
          {ACTUS.length} publications · {ACTUS.filter(a => a.actif).length} actives
        </p>
        <button style={{ padding: '10px 18px', background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', border: 'none', borderRadius: 100, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          + Nouvelle publication
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 140px 110px 90px', padding: '14px 20px', background: T.bg, borderBottom: `1px solid ${T.hairline}`, fontSize: 10, fontWeight: 800, color: T.deep, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
          <span>Type</span>
          <span>Titre</span>
          <span>Période</span>
          <span>Statut</span>
          <span></span>
        </div>
        {ACTUS.map((a, i) => {
          const debut = new Date(a.date_debut).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
          const fin = new Date(a.date_fin).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
          const isAlerte = a.type === 'alerte'
          return (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 140px 110px 90px', padding: '14px 20px', borderBottom: i < ACTUS.length - 1 ? `1px solid ${T.hairline}` : 'none', alignItems: 'center', gap: 12 }}>
              <span style={{ padding: '3px 9px', background: isAlerte ? '#FEE2E2' : T.pale, color: isAlerte ? '#7F1D1D' : T.deep, borderRadius: 100, fontSize: 10, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', display: 'inline-block', width: 'fit-content' }}>
                {isAlerte ? '⚠ Alerte' : '📰 Actu'}
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titre}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.contenu}</p>
              </div>
              <span style={{ fontSize: 11, color: T.deep, fontWeight: 600 }}>{debut} → {fin}</span>
              <span style={{ padding: '3px 9px', background: '#D1FAE5', color: '#065F46', borderRadius: 100, fontSize: 10, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', display: 'inline-block', width: 'fit-content' }}>
                {a.actif ? '✓ Active' : 'Brouillon'}
              </span>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button style={{ width: 30, height: 30, background: T.bg, border: `1px solid ${T.pale}`, borderRadius: 8, color: T.deep, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Éditer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </button>
                <button style={{ width: 30, height: 30, background: T.bg, border: `1px solid ${T.pale}`, borderRadius: 8, color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Supprimer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ────────── COMPOSANT PRINCIPAL ──────────

export default function DashboardCommuneMettet() {
  const [onglet, setOnglet] = useState('overview')

  const meta = {
    overview:     { titre: 'Vue d\'ensemble',     sousTitre: 'Tableau de bord de la commune de Mettet' },
    signalements: { titre: 'Signalements citoyens', sousTitre: 'Nid de poule, dépôt sauvage, égout — reçus depuis l\'app Yoppaa' },
    actus:        { titre: 'Actus & Alertes',     sousTitre: 'Publications affichées dans la fiche Yoppaa de Mettet' },
  }[onglet]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg, fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: T.ink }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <Sidebar onglet={onglet} setOnglet={setOnglet}/>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header titre={meta.titre} sousTitre={meta.sousTitre}/>
        {onglet === 'overview'     && <Overview/>}
        {onglet === 'signalements' && <SignalementsList/>}
        {onglet === 'actus'        && <ActusList/>}
      </main>
    </div>
  )
}
