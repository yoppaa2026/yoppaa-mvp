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
// Helpers (getDayBrussels, calculerStatutOuverture) réexportés pour pouvoir
// construire la section « Horaires » détaillée d'une fiche avec la même logique
// que celle qui pilote la pastille.

import { useState, useEffect } from 'react'

// ⚠️ LA RÈGLE A DÉMÉNAGÉ DANS `lib/ouverture.js` (09/09), et le déménagement
// EST la correction. Elle vivait ici, dans un fichier que les bancs ne
// peuvent pas lire : Node bute sur le premier `<span>`. Elle décidait
// pourtant de ce que chaque visiteur lit en tête de fiche, et rien ne
// l'exécutait jamais — c'est ainsi qu'une brasserie ouverte jusqu'à minuit a
// pu porter « Fermé » en pleine journée sans que rien ne rougisse.
//
// ⚠️ UN IMPORT **ET** UNE RÉEXPORTATION, PAS UN `export … from` SEUL. La
// seconde forme republie le nom sans jamais le lier dans ce module : le
// composant s'en sert dix lignes plus bas, et l'appel aurait visé une variable
// inexistante. C'est `npm run verif:undef` qui l'a dit, et personne d'autre —
// `no-undef` est éteint dans la configuration principale. Même défaut qu'en
// août dans `lib/resend.js`.
import { getDayBrussels, calculerStatutOuverture } from '@/lib/ouverture'
export { getDayBrussels, calculerStatutOuverture }

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
