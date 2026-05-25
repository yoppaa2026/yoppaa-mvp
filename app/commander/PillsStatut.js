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
  const fontSize = size === 'lg' ? '0.7rem' : '0.58rem'
  const padding  = size === 'lg' ? '5px 11px' : '3px 8px'
  const iconSize = size === 'lg' ? 10 : 8

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {pills.map(p => {
        const style = p.indisponible ? C.unavail : (p.actif ? C.on : C.off)
        return (
          <span key={p.key}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize, fontWeight: 800, padding, borderRadius: 100, background: style.bg, color: style.color, border: `1px solid ${style.border}`, textTransform: 'uppercase', letterSpacing: '0.4px', lineHeight: 1, whiteSpace: 'nowrap' }}>
            {/* Icône check ou tiret selon état */}
            {p.actif ? (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7"/>
              </svg>
            ) : (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M5 12h14"/>
              </svg>
            )}
            {p.label}
            {/* Dot LIVE pulsant : violet pour DEAL, rouge pour ACTU.
                Plus gros + animation marquee pour attirer l'oeil */}
            {p.live && (() => {
              const isDeal = p.key === 'deal'
              const liveColor = isDeal ? '#6B35C4' : '#DC2626' // violet ou rouge
              const liveSize = size === 'lg' ? 13 : 10
              return (
                <span style={{ position: 'absolute', top: -5, right: -5, width: liveSize, height: liveSize, borderRadius: '50%', background: liveColor, border: '2.5px solid #fff', boxShadow: `0 0 0 2px ${liveColor}33, 0 0 12px ${liveColor}cc`, animation: 'yoppa-live-pulse 1s ease-in-out infinite' }}/>
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
