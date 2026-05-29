// Composant 5 pills statut YOPPAA — réutilisé partout (card listing, fiche commerçant)
// Visualise EN LIGNE / DEAL / ACTU / COMMANDE / LIVRAISON
// Pills grisées = levier visuel de pression sociale (upgrade)

import { getPillsStatut } from '@/lib/plans'

const C = {
  on:        { bg: '#16A34A', color: '#fff',     border: '#16A34A' }, // vert plein
  off:       { bg: '#F3F4F6', color: '#9CA3AF',  border: '#E5E7EB' }, // gris discret
  unavail:   { bg: '#FAFAFA', color: '#D1D5DB',  border: '#F3F4F6' }, // services-only
}

export default function PillsStatut({ commercant, dealActif = false, actuActive = false, size = 'sm' }) {
  const pills = getPillsStatut(commercant, { dealActif, actuActive })
  const fontSize = size === 'lg' ? '0.7rem' : size === 'xs' ? '0.58rem' : '0.58rem'
  const padding  = size === 'lg' ? '5px 11px' : size === 'xs' ? '3.5px 7px' : '3px 8px'
  const iconSize = size === 'lg' ? 10 : size === 'xs' ? 6 : 8
  const gap      = size === 'xs' ? 3 : 4
  const xs       = size === 'xs'
  const letter   = size === 'xs' ? '0.3px' : '0.4px'

  return (
    <div style={{ display: 'flex', flexWrap: xs ? 'nowrap' : 'wrap', gap, overflow: xs ? 'hidden' : 'visible', minWidth: 0 }}>
      {pills.map(p => {
        const style = p.indisponible ? C.unavail : (p.actif ? C.on : C.off)
        return (
          <span key={p.key}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: xs ? 0 : 4, fontSize, fontWeight: 800, padding, borderRadius: 100, background: style.bg, color: style.color, border: `1px solid ${style.border}`, textTransform: 'uppercase', letterSpacing: letter, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {/* Icône check ou tiret (cachée en size xs : couleur seule suffit) */}
            {!xs && (p.actif ? (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7"/>
              </svg>
            ) : (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M5 12h14"/>
              </svg>
            ))}
            {p.label}
            {/* Dot LIVE pulsant : violet pour DEAL, rouge pour ACTU.
                Plus gros + animation marquee pour attirer l'oeil */}
            {p.live && (() => {
              const isDeal = p.key === 'deal'
              const liveColor = isDeal ? '#6B35C4' : '#DC2626' // violet ou rouge
              const liveSize = size === 'lg' ? 13 : size === 'xs' ? 8 : 10
              const offset = size === 'xs' ? -3 : -5
              const borderW = size === 'xs' ? '2px' : '2.5px'
              return (
                <span style={{ position: 'absolute', top: offset, right: offset, width: liveSize, height: liveSize, borderRadius: '50%', background: liveColor, border: `${borderW} solid #fff`, boxShadow: `0 0 0 2px ${liveColor}33, 0 0 12px ${liveColor}cc`, animation: 'yoppa-live-pulse 1s ease-in-out infinite' }}/>
              )
            })()}
          </span>
        )
      })}
      <style>{`
        @keyframes yoppa-live-pulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.45); opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}
