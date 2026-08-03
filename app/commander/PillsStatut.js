// Pastilles de capacités YOPPAA, réutilisées sur la carte du listing et sur la
// fiche commerçant.
//
// Refonte du 03/08 : elles ne disent plus que ce que le client PEUT FAIRE ici.
// Plus de pastille grise, plus de gabarit fixe à cinq, plus de capitales.
// La liste vient de getPillsStatut (lib/plans.js), qui décide seul de son
// contenu ; ce composant ne fait que l'habiller.
//
// Un commerce sans capacité transactionnelle n'affiche donc RIEN, et c'est
// voulu : mieux vaut une carte sobre qu'une rangée de fonctions barrées.

import { getPillsStatut } from '@/lib/plans'

const T = {
  main:  '#6B35C4',
  deep:  '#2D0F6B',
  pale:  '#EDE0FF',
  light: '#C4A0F4',
}

export default function PillsStatut({ commercant, dealActif = false, actuActive = false, bonneAffaire = false, size = 'sm' }) {
  const pills = getPillsStatut(commercant, { dealActif, actuActive })
  if (pills.length === 0) return null

  const xs = size === 'xs'
  const fontSize = size === 'lg' ? '0.74rem' : xs ? '0.62rem' : '0.66rem'
  const padding  = size === 'lg' ? '5px 12px' : xs ? '3.5px 9px' : '4px 10px'
  const gap      = xs ? 4 : 5

  return (
    <div style={{ display: 'flex', flexWrap: xs ? 'nowrap' : 'wrap', gap, overflow: xs ? 'hidden' : 'visible', minWidth: 0 }}>
      {pills.map(p => (
        <span key={p.key}
          style={{
            position: 'relative', display: 'inline-flex', alignItems: 'center',
            fontSize, fontWeight: 700, padding, borderRadius: 100,
            background: T.pale, color: T.deep, border: `1px solid ${T.light}66`,
            letterSpacing: '0.1px', lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
          {p.label}
          {/* Point qui pulse sur ce qui se passe maintenant. Il est supprimé
              sur le deal quand le bandeau doré « Bonne affaire » prend déjà le
              relais visuel, pour éviter le double signal (décision 01/07). */}
          {p.live && !(p.key === 'deal' && bonneAffaire) && (
            <span style={{
              position: 'absolute', top: xs ? -3 : -4, right: xs ? -3 : -4,
              width: xs ? 7 : 9, height: xs ? 7 : 9, borderRadius: '50%',
              background: T.main, border: '1.5px solid #fff',
              boxShadow: `0 0 0 1.5px ${T.main}33, 0 0 8px ${T.main}99`,
              animation: 'yoppa-live-pulse 1s ease-in-out infinite',
            }}/>
          )}
        </span>
      ))}
      <style>{`
        @keyframes yoppa-live-pulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.45); opacity: 0.7; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes yoppa-live-pulse { 0%, 100% { transform: none; opacity: 1; } }
        }
      `}</style>
    </div>
  )
}
