// L'icône du moment : ce qu'on vient chercher, dit d'un coup d'œil.
//
// Quatre situations, quatre dessins. Un pictogramme se lit avant le texte et
// donne son ton à l'écran avant même qu'on ait commencé à lire.
//
// Partagée par les TROIS écrans qui racontent le même moment : la confirmation
// de commande, la confirmation de rendez-vous et l'écran de retrait. Une seule
// définition, sinon les trois finissent par diverger.

import {
  RETRAIT_LIVRAISON, RETRAIT_EXPEDITION, RETRAIT_RDV, RETRAIT_BOUTIQUE,
} from '@/lib/ecran-retrait'

export default function IconeRetrait({ contexte, taille = 34, couleur = '#fff' }) {
  const c = {
    width: taille, height: taille, viewBox: '0 0 24 24', fill: 'none',
    stroke: couleur, strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round',
  }
  if (contexte === RETRAIT_LIVRAISON) {
    return (
      <svg {...c}>
        <circle cx="6" cy="17.5" r="2.5"/><circle cx="17" cy="17.5" r="2.5"/>
        <path d="M8.5 17.5h6M4 17.5V9a2 2 0 0 1 2-2h5l3 5h2.5a2.5 2.5 0 0 1 2.5 2.5v3"/>
      </svg>
    )
  }
  if (contexte === RETRAIT_EXPEDITION) {
    return (
      <svg {...c}>
        <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z"/>
        <path d="M3 8.5 12 13l9-4.5M12 13v7"/>
      </svg>
    )
  }
  if (contexte === RETRAIT_RDV) {
    return (
      <svg {...c}>
        <rect x="3" y="5" width="18" height="16" rx="2"/>
        <path d="M3 10h18M8 3v4M16 3v4"/>
        <path d="M9 15l2 2 4-4"/>
      </svg>
    )
  }
  if (contexte === RETRAIT_BOUTIQUE) {
    return (
      <svg {...c}>
        <path d="M4 8h16l-1.2 12.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 8z"/>
        <path d="M9 8V6a3 3 0 0 1 6 0v2"/>
        <path d="M9.5 13.5c.8.9 1.7 1.3 2.5 1.3s1.7-.4 2.5-1.3"/>
      </svg>
    )
  }
  // Alimentaire : le sac du boulanger.
  return (
    <svg {...c}>
      <path d="M5 9h14l-1 11a2 2 0 0 1-2 1.8H8A2 2 0 0 1 6 20L5 9z"/>
      <path d="M8 9V7a4 4 0 0 1 8 0v2"/>
      <path d="M5 9l1.5-3.5A2 2 0 0 1 8.3 4h7.4a2 2 0 0 1 1.8 1.5L19 9"/>
    </svg>
  )
}
