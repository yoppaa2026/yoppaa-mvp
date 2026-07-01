// Composant 5 pills statut YOPPAA — réutilisé partout (card listing, fiche commerçant)
// Pills par catégorie commerçant (5 toujours, layout stable) :
//   • alimentaire : EN LIGNE / DEAL / ACTU / COMMANDE / LIVRAISON
//   • vitrine     : EN LIGNE / DEAL / ACTU / RDV / FIDÉLITÉ
//   • service public : EN LIGNE / ACTU / DEAL(indispo) / COMMANDE(indispo) / LIVRAISON(indispo)
// Pills grisées = levier visuel de pression sociale (upgrade plan).
// Le label affiché est dynamique (vient de getPillsStatut côté lib/plans.js).

import { getPillsStatut } from '@/lib/plans'

const C = {
  on:        { bg: '#10B981', color: '#fff',     border: '#10B981' }, // vert plein
  off:       { bg: '#F3F4F6', color: '#9CA3AF',  border: '#E5E7EB' }, // gris discret
  unavail:   { bg: '#FAFAFA', color: '#D1D5DB',  border: '#F3F4F6' }, // services-only
}

export default function PillsStatut({ commercant, dealActif = false, actuActive = false, bonneAffaire = false, size = 'sm' }) {
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
                Plus gros + animation marquee pour attirer l'oeil.
                Cas special : le dot DEAL est SUPPRIME quand est_bonne_affaire=true
                car le badge dore "Bonne affaire" sur le bandeau categorie prend
                le relais visuel (evite le double signal, decision Alex 01/07). */}
            {p.live && !(p.key === 'deal' && bonneAffaire) && (() => {
              const isDeal = p.key === 'deal'
              const liveColor = isDeal ? '#6B35C4' : '#DC2626' // violet ou rouge
              // Taille harmonisee : 7 sur card (xs), 10 sur fiche (sm/lg). Border 1.5px uniforme.
              const liveSize = size === 'lg' ? 10 : size === 'xs' ? 7 : 9
              const offset = size === 'xs' ? -3 : -4
              return (
                <span style={{ position: 'absolute', top: offset, right: offset, width: liveSize, height: liveSize, borderRadius: '50%', background: liveColor, border: '1.5px solid #fff', boxShadow: `0 0 0 1.5px ${liveColor}33, 0 0 8px ${liveColor}99`, animation: 'yoppa-live-pulse 1s ease-in-out infinite' }}/>
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
