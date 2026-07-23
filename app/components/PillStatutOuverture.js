'use client'
// Pill statut d'ouverture en temps réel (timezone Europe/Brussels).
// Réutilisable sur les cards (mode compact) et sur les fiches détail (mode complet).
//
// Format attendu de `horaires` (JSONB de services_publics.horaires_detail) :
//
//   Cas normal :
//     {
//       lundi:    { ouvert: true, creneaux: [["08:30","12:00"], ["13:00","16:00"]] },
//       mardi:    { ouvert: true, debut: "08:30", fin: "16:00" },  // format legacy supporté
//       samedi:   { ouvert: false, note: "..." },
//       dimanche: { ouvert: false },
//       ...
//     }
//
//   Cas 24/24 (urgences, garde, distributeurs, parkings, ...) :
//     { always_open: true }
//
// Helpers (getDayBrussels, getCreneauxJour, calculerStatutOuverture) exportés
// pour pouvoir construire la section "Horaires" détaillée d'une fiche avec la
// même logique que celle qui pilote la pill.

import { useState, useEffect } from 'react'

const JOURS_ORDRE = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']

export function getDayBrussels(date) {
  const en = date.toLocaleString('en-US', { weekday: 'long', timeZone: 'Europe/Brussels' }).toLowerCase()
  const map = { monday: 'lundi', tuesday: 'mardi', wednesday: 'mercredi', thursday: 'jeudi', friday: 'vendredi', saturday: 'samedi', sunday: 'dimanche' }
  return map[en] || 'lundi'
}

function getMinutesBrussels(date) {
  const t = date.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Brussels' })
  const [h, m] = t.split(':').map(n => parseInt(n, 10))
  return h * 60 + m
}

function parseHHMM(s) {
  const [h, m] = s.split(':').map(n => parseInt(n, 10))
  return h * 60 + m
}

export function getCreneauxJour(jourData) {
  if (!jourData || jourData.ouvert === false) return []
  if (Array.isArray(jourData.creneaux)) return jourData.creneaux
  const out = []
  if (jourData.debut && jourData.fin) out.push([jourData.debut, jourData.fin])
  // Horaires à pause (restauration...) : 2e plage optionnelle debut2/fin2
  if (jourData.debut2 && jourData.fin2) out.push([jourData.debut2, jourData.fin2])
  return out
}

export function calculerStatutOuverture(horaires, now) {
  if (!horaires || Object.keys(horaires).length === 0) return null

  // Cas 24/24 (numéros nationaux d'urgence, garde, distributeurs, ...)
  if (horaires.always_open === true) {
    return { etat: 'always', label: '24h/24', sousTitre: null, is24: true }
  }

  const jour = getDayBrussels(now)
  const minNow = getMinutesBrussels(now)
  const creneauxAuj = getCreneauxJour(horaires[jour])

  // 1) Dans un créneau → OUVERT
  for (const [d, f] of creneauxAuj) {
    if (minNow >= parseHHMM(d) && minNow < parseHHMM(f)) {
      return { etat: 'ouvert', label: 'Ouvert', sousTitre: `Ferme à ${f}` }
    }
  }
  // 2) Entre 2 créneaux du jour → PAUSE
  for (let i = 0; i < creneauxAuj.length - 1; i++) {
    if (minNow >= parseHHMM(creneauxAuj[i][1]) && minNow < parseHHMM(creneauxAuj[i+1][0])) {
      return { etat: 'pause', label: 'En pause', sousTitre: `Réouvre à ${creneauxAuj[i+1][0]}` }
    }
  }
  // 3) Avant l'ouverture du jour
  if (creneauxAuj.length > 0 && minNow < parseHHMM(creneauxAuj[0][0])) {
    return { etat: 'ferme', label: 'Fermé', sousTitre: `Ouvre aujourd'hui à ${creneauxAuj[0][0]}` }
  }
  // 4) Fermé maintenant : on cherche le prochain jour ouvert
  const idx = JOURS_ORDRE.indexOf(jour)
  for (let i = 1; i <= 7; i++) {
    const next = JOURS_ORDRE[(idx + i) % 7]
    const c = getCreneauxJour(horaires[next])
    if (c.length > 0) {
      const labelJour = i === 1 ? 'demain' : next
      return { etat: 'ferme', label: 'Fermé', sousTitre: `Ouvre ${labelJour} à ${c[0][0]}` }
    }
  }
  return { etat: 'ferme', label: 'Fermé', sousTitre: null }
}

// Couleurs semantiques universelles : portees uniquement par le dot.
// Le label/bg restent dans la palette Yoppaa (glass translucide).
const SEM_DOT = {
  ouvert: '#10B981',  // vert
  ferme:  '#DC2626',  // rouge
  pause:  '#F59E0B',  // ambre
  always: '#C4A0F4',  // light Yoppaa (24h/24 = neutre)
}

export default function PillStatutOuverture({ horaires, compact = false, dark = false }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const statut = calculerStatutOuverture(horaires, now)
  if (!statut) return null

  // Glass translucide : blanc sur fond fonce, ink sur fond clair.
  // Le dot porte la semantique (vert/rouge/ambre/light) avec un halo discret.
  const bg          = dark ? 'rgba(255,255,255,0.10)' : 'rgba(26,8,64,0.06)'
  const borderColor = dark ? 'rgba(255,255,255,0.18)' : 'rgba(26,8,64,0.12)'
  const fgColor     = dark ? 'rgba(255,255,255,0.92)' : '#2D0F6B'
  const dotColor    = SEM_DOT[statut.etat]

  const showSousTitre = !compact && statut.sousTitre

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: compact ? '3px 9px 3px 7px' : '4px 12px 4px 9px',
      borderRadius: 100, background: bg, border: `1px solid ${borderColor}`,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      fontSize: compact ? 10 : 11, fontWeight: 700, color: fgColor,
      letterSpacing: '0.2px', maxWidth: '100%',
    }}>
      <span style={{
        width: compact ? 6 : 7, height: compact ? 6 : 7,
        borderRadius: '50%', background: dotColor, flexShrink: 0,
        boxShadow: `0 0 ${compact ? 6 : 8}px ${dotColor}99`,
        animation: statut.etat === 'ouvert' ? 'pillPulse 2s ease-in-out infinite' : 'none',
      }}/>
      <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{statut.label}</span>
      {showSousTitre && (
        <span style={{ fontWeight: 600, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          · {statut.sousTitre}
        </span>
      )}
      <style>{`@keyframes pillPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }`}</style>
    </span>
  )
}
