// Composant partagé : affichage des horaires d'ouverture hebdomadaires d'un commerçant.
// Collapsible (fermé par défaut), highlight du jour courant, badge "Fermé" en rouge.
// Utilisé sur /commander/[slug] (alimentaire) ET /commander/rdv/[slug] (vitrine).
//
// Important : ordre d'affichage FIXE (lundi -> dimanche), peu importe comment l'appelant
// indexe ses constantes JOURS internes. Évite les bugs de mapping incoherent entre fiches.

import { useState } from 'react'

const T = {
  main:  '#6B35C4',
  pale:  '#EDE0FF',
  ink:   '#1A0840',
  deep:  '#2D0F6B',
  muted: '#6B7280',
}

// Date.getDay() retourne 0=dim, 1=lun, ..., 6=sam. On mappe sur les clefs de horaires_detail.
const JOUR_KEYS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']

// Ordre d'affichage : lundi -> dimanche (convention francaise / europeenne).
const ORDRE_AFFICHAGE = [
  { key: 'lundi',    label: 'Lundi'    },
  { key: 'mardi',    label: 'Mardi'    },
  { key: 'mercredi', label: 'Mercredi' },
  { key: 'jeudi',    label: 'Jeudi'    },
  { key: 'vendredi', label: 'Vendredi' },
  { key: 'samedi',   label: 'Samedi'   },
  { key: 'dimanche', label: 'Dimanche' },
]

export default function HorairesSection({ horaires, variant = 'border' }) {
  const [open, setOpen] = useState(false)
  if (!horaires) return null
  const jourCourant = JOUR_KEYS[new Date().getDay()]

  // variant 'border' : bordure bas seule (style historique alimentaire dans hero)
  // variant 'card'   : carte autonome avec bordure complete (utilisable n'importe ou)
  const wrapStyle = variant === 'card'
    ? { background: '#fff', borderRadius: 12, border: `1px solid ${T.pale}`, overflow: 'hidden' }
    : { background: '#fff', borderBottom: `1px solid ${T.pale}` }

  return (
    <div style={wrapStyle}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '0.625rem 1rem', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: '"DM Sans", sans-serif' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          Horaires complets
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: T.main, fontWeight: 700 }}>
          {open ? 'Fermer' : 'Voir'}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 1rem 0.875rem' }}>
          {ORDRE_AFFICHAGE.map(({ key, label }) => {
            const h = horaires[key]
            const estAujourdhui = jourCourant === key
            if (!h) return null
            return (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 8, background: estAujourdhui ? T.pale : 'transparent' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: estAujourdhui ? 800 : 500, color: estAujourdhui ? T.deep : T.muted, width: 90 }}>
                  {estAujourdhui && <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.main }}/>}
                  {label}
                </span>
                {h.ouvert && h.debut && h.fin
                  ? <span style={{ fontSize: '0.82rem', fontWeight: estAujourdhui ? 700 : 500, color: estAujourdhui ? T.main : T.ink }}>{h.debut.slice(0,5)} – {h.fin.slice(0,5)}</span>
                  : <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#DC2626' }}>Fermé</span>
                }
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
