import { getLandingMode } from '@/lib/landing-mode'
import { resolveReferentNom } from '@/lib/kit-resolve'
import LandingTeasing from './components/LandingTeasing'
import LandingReveal from './components/LandingReveal'

// Page d'accueil / : bascule automatique Teasing → Reveal selon NEXT_PUBLIC_REVEAL_DATE.
// Mode Teasing (avant le 1er août 10h) → page minimaliste mysterieuse.
// Mode Reveal (apres) → LandingReveal complete (mockups app + formules + preinscription).
//
// L'ancienne home /commander reste accessible directement via /commander.

export const dynamic = 'force-dynamic'  // sinon Next.js cache la page statique

// Metadata par phase : mystere avant le reveal, pitch complet apres.
export async function generateMetadata() {
  const mode = getLandingMode()
  if (mode === 'reveal') {
    return {
      title: 'Yoppaa — Ton quartier dans ta poche',
      description: "L'app belge des commerces de quartier : Click & Collect, rendez-vous en ligne, deals du jour. 0% de commission pour les commerçants. Lancement le 1er septembre 2026.",
      openGraph: {
        title: 'Yoppaa — Ton quartier dans ta poche',
        description: "L'app belge des commerces de quartier. 0% de commission pour les commerçants. Lancement le 1er septembre 2026.",
        type: 'website',
        locale: 'fr_BE',
        images: [{ url: '/og-share.png', width: 640, height: 640, alt: 'Yoppaa' }],
      },
      twitter: {
        card: 'summary',
        images: ['/og-share.png'],
      },
    }
  }
  return {
    title: 'Yoppaa — Quelque chose se prépare dans ton quartier',
    description: 'Un projet belge. Un projet pour ton quartier. Grande annonce le 1er août 2026.',
    openGraph: {
      title: 'Yoppaa — Quelque chose se prépare dans ton quartier',
      description: 'Un projet belge. Un projet pour ton quartier. Grande annonce le 1er août 2026.',
      type: 'website',
      locale: 'fr_BE',
      images: [{ url: '/og-share.png', width: 640, height: 640, alt: 'Yoppaa' }],
    },
    twitter: {
      card: 'summary',
      images: ['/og-share.png'],
    },
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  // Attribution / bandeau référent : ?ref=<slug commercant> (liens du Kit lancement).
  // On résout le nom côté serveur (service_role) pour afficher « <Nom> t'invite ».
  const sp = await searchParams
  // Aperçu interne avant le jour J : ?apercu=reveal-2026 force la LandingReveal
  // (validation visuelle en prod sans toucher aux env vars). Sans effet apres le 1/08.
  const mode = sp?.apercu === 'reveal-2026' ? 'reveal' : getLandingMode()
  const refBrut = Array.isArray(sp?.ref) ? sp.ref[0] : sp?.ref
  const referent = refBrut ? await resolveReferentNom(refBrut) : null
  return mode === 'reveal'
    ? <LandingReveal referent={referent} />
    : <LandingTeasing referent={referent} />
}
