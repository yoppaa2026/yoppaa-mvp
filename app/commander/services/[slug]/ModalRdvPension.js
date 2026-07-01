'use client'
// ════════════════════════════════════════════════════════════════════
// ModalRdvPension - flow de prise de RDV avec l'expert pension SFPD
// qui se déplace à la commune le 3e jeudi du mois 13h30-15h30.
//
// ⚠ MOCK VISUEL pour la démo conseil communal Mettet 15/06/2026 :
//   pas d'écriture en base, pas d'email envoyé. Le but est de
//   démontrer le concept "RDV admin en ligne" au bourgmestre.
//   La vraie implémentation (basée sur l'infra rdv existante)
//   sera codée après validation du partenariat.
//
// Flow en 2 étapes :
//   1. Choix d'un créneau parmi les 3 prochains 3e jeudis du mois
//      × créneaux 13h30 / 14h00 / 14h30
//   2. Écran de confirmation "RDV confirmé 🟣"
// ════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { Lightbulb } from 'lucide-react'

const T = {
  bgPage:   '#F5F3FA',
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',
  pale:     '#EDE0FF',
  hairline: '#F0EBF8',
  muted:    '#6B7280',
}

// Calcul des prochains 3e jeudis du mois (à partir d'aujourd'hui)
function getProchainsTroisiemeJeudis(nombre = 3) {
  const out = []
  const now = new Date()
  // Ramène à minuit pour comparaison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let year = today.getFullYear()
  let month = today.getMonth()

  for (let i = 0; out.length < nombre && i < 24; i++) {
    const targetYear  = year + Math.floor((month + i) / 12)
    const targetMonth = (month + i) % 12
    const firstOfMonth = new Date(targetYear, targetMonth, 1)
    const dayOfWeek = firstOfMonth.getDay()  // 0=dim ... 4=jeu
    const offsetToFirstThursday = (4 - dayOfWeek + 7) % 7
    const dayNumOf3rdThursday = 1 + offsetToFirstThursday + 14
    const date = new Date(targetYear, targetMonth, dayNumOf3rdThursday)
    if (date >= today) out.push(date)
  }
  return out
}

const CRENEAUX = ['13:30', '14:00', '14:30']

function formatDateLong(date) {
  return date.toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function ModalRdvPension({ service, onClose }) {
  const [creneauChoisi, setCreneauChoisi] = useState(null)  // { date, heure }
  const [confirme, setConfirme] = useState(false)
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')

  const jeudis = getProchainsTroisiemeJeudis(3)

  function confirmer() {
    if (!creneauChoisi || !nom || !email) return
    // MOCK : on simule juste l'envoi, pas de vraie écriture / email
    setTimeout(() => setConfirme(true), 350)
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.75)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem',
  }
  const modal = {
    background: '#fff', borderRadius: 20, maxWidth: 460, width: '100%', maxHeight: '92vh',
    overflowY: 'auto', boxShadow: '0 20px 60px rgba(26,8,64,0.4)', position: 'relative',
  }

  // ═══════ ÉCRAN DE SUCCÈS ═══════
  if (confirme) {
    return (
      <div style={overlay}>
        <div style={modal}>
          <div style={{ padding: '40px 28px 30px', textAlign: 'center' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto 20px',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 10px 30px rgba(16,185,129,0.4)',
            }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: T.ink, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
              Ton RDV est Yoppé ! 🟣
            </h2>
            <p style={{ fontSize: 14, color: T.muted, margin: '0 0 6px', lineHeight: 1.5 }}>
              <strong style={{ color: T.deep }}>{formatDateLong(creneauChoisi.date)}</strong>
              <br/>à {creneauChoisi.heure}
            </p>
            <p style={{ fontSize: 13, color: T.muted, margin: '14px 0 24px', lineHeight: 1.5 }}>
              Un email de confirmation va être envoyé à <strong style={{ color: T.deep }}>{email}</strong>.<br/>
              Tu seras reçu à l&rsquo;Hôtel de Ville de Mettet.
            </p>
            <button onClick={onClose}
              style={{
                padding: '14px 34px', background: `linear-gradient(135deg, ${T.ink}, ${T.main})`,
                color: '#fff', border: 'none', borderRadius: 100, fontSize: 14, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.2px',
                boxShadow: `0 8px 22px ${T.main}40`,
              }}>
              Terminer
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════ ÉCRAN PRINCIPAL ═══════
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: `1px solid ${T.hairline}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 2 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.deep} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8"  y1="2" x2="8"  y2="6"/>
              <line x1="3"  y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>
              RDV Expert Pension
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: T.muted, fontWeight: 600 }}>
              Hôtel de Ville · Place J. Meunier 1
            </p>
          </div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: T.bgPage, color: T.muted, cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            ×
          </button>
        </div>

        <div style={{ padding: '18px 20px' }}>

          {/* Info introductive */}
          <div style={{ background: T.pale, borderLeft: `3px solid ${T.main}`, borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
            <p style={{ fontSize: 13, color: T.deep, margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
              Un fonctionnaire du Service Pensions se déplace à la commune chaque <strong>3e jeudi du mois de 13h30 à 15h30</strong>. Choisis ton créneau.
            </p>
          </div>

          {/* Sélection créneau */}
          <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>
            Choisis ton créneau
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {jeudis.map((date, i) => (
              <div key={i} style={{ border: `1.5px solid ${T.pale}`, borderRadius: 14, padding: '12px 14px', background: '#fff' }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: T.ink, letterSpacing: '-0.2px', textTransform: 'capitalize' }}>
                  {formatDateLong(date)}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CRENEAUX.map(heure => {
                    const isSelected = creneauChoisi && creneauChoisi.date.getTime() === date.getTime() && creneauChoisi.heure === heure
                    return (
                      <button key={heure}
                        onClick={() => setCreneauChoisi({ date, heure })}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 100,
                          background: isSelected ? `linear-gradient(135deg, ${T.ink}, ${T.main})` : T.pale,
                          color: isSelected ? '#fff' : T.deep,
                          border: 'none',
                          fontWeight: 800, fontSize: 12,
                          cursor: 'pointer', fontFamily: 'inherit',
                          letterSpacing: '-0.1px',
                          boxShadow: isSelected ? `0 4px 12px ${T.main}40` : 'none',
                          transition: 'all 0.15s',
                        }}>
                        {heure}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Coordonnées (seulement si créneau choisi) */}
          {creneauChoisi && (
            <div style={{ animation: 'fadeIn 0.25s ease' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 6 }}>
                Ton nom complet <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                placeholder="Prénom Nom"
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 14, border: `1.5px solid ${T.pale}`, borderRadius: 12, color: T.ink, fontFamily: 'inherit', background: '#fff', marginBottom: 12 }}/>

              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 6 }}>
                Ton email <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="ton@email.be"
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 14, border: `1.5px solid ${T.pale}`, borderRadius: 12, color: T.ink, fontFamily: 'inherit', background: '#fff', marginBottom: 14 }}/>

              <div style={{ background: '#FEF3C7', borderLeft: '3px solid #D97706', borderRadius: 10, padding: '10px 12px', marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: '#78350F', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                  <Lightbulb size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Pense à apporter ta carte d&rsquo;identité ainsi qu&rsquo;une copie de ta dernière fiche de paie si tu en disposes.
                </p>
              </div>
            </div>
          )}

          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }`}</style>
        </div>

        {/* Bouton confirmer (sticky bottom) */}
        <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${T.hairline}`, padding: '14px 20px' }}>
          <button onClick={confirmer}
            disabled={!creneauChoisi || !nom || !email}
            style={{
              width: '100%', padding: '14px 18px',
              background: (creneauChoisi && nom && email) ? `linear-gradient(135deg, ${T.ink}, ${T.main})` : T.pale,
              color: (creneauChoisi && nom && email) ? '#fff' : T.muted,
              border: 'none', borderRadius: 100, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              opacity: (creneauChoisi && nom && email) ? 1 : 0.6,
              boxShadow: (creneauChoisi && nom && email) ? `0 8px 22px ${T.main}40` : 'none',
            }}>
            Confirmer mon rendez-vous 🟣
          </button>
        </div>

      </div>
    </div>
  )
}
