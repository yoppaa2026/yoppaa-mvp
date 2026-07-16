import { getLandingMode } from '@/lib/landing-mode'
import LandingTeasing from './components/LandingTeasing'

// Page d'accueil / : bascule automatique Teasing → Reveal selon NEXT_PUBLIC_REVEAL_DATE.
// Mode Teasing (avant le 1er août 10h) → page minimaliste mysterieuse.
// Mode Reveal (apres) → landing complete 9 sections (sera ajoutee dans Sprint Reveal).
//
// L'ancienne home /commander reste accessible directement via /commander.

export const dynamic = 'force-dynamic'  // sinon Next.js cache la page statique

export const metadata = {
  title: 'Yoppaa — Quelque chose se prépare dans ton quartier',
  description: 'Un projet belge. Un projet pour ton quartier. Grande annonce le 1er août 2026.',
  openGraph: {
    title: 'Yoppaa — Quelque chose se prépare dans ton quartier',
    description: 'Un projet belge. Un projet pour ton quartier. Grande annonce le 1er août 2026.',
    type: 'website',
    locale: 'fr_BE',
  },
}

export default function Home() {
  const mode = getLandingMode()
  // Pour l'instant on n'a que LandingTeasing. LandingReveal arrivera dans Sprint LR.
  // En attendant, meme en mode 'reveal' on affiche le Teasing (sera remplace).
  return <LandingTeasing />
}
