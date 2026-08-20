import { getLandingMode } from '@/lib/landing-mode'
import { resolveReferentNom } from '@/lib/kit-resolve'
import { libelleLancement } from '@/lib/lancement'
import { jsonLdLandingString } from '@/lib/seo-landing'
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
      description: `L'app belge des commerces de quartier : Click & Collect, rendez-vous en ligne, deals du jour. 0% de commission Yoppaa pour les commerçants. Lancement le ${libelleLancement({ avecAnnee: true })}.`,
      // Le layout racine met tout le site en noindex tant que
      // NEXT_PUBLIC_SEO_INDEX n'est pas 'true', parce que les fiches
      // contiennent encore des commerçants de test. La landing dévoilée, elle,
      // n'expose aucune donnée de test et doit être trouvable dès maintenant :
      // on écrase donc la règle héritée, uniquement ici.
      robots: { index: true, follow: true },
      alternates: { canonical: 'https://www.yoppaa.app' },
      openGraph: {
        title: 'Yoppaa — Ton quartier dans ta poche',
        description: `L'app belge des commerces de quartier. 0% de commission Yoppaa pour les commerçants. Lancement le ${libelleLancement({ avecAnnee: true })}.`,
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

  // Données structurées : elles ne sont posées QUE sur la landing dévoilée,
  // parce que le balisage doit décrire ce que la page montre. Le mode teasing
  // n'affiche ni formules ni tarifs : les baliser serait faux, et Google
  // sanctionne un balisage qui promet ce que l'écran ne contient pas.
  if (mode !== 'reveal') return <LandingTeasing referent={referent} />

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdLandingString() }}
      />
      <LandingReveal referent={referent} />
    </>
  )
}
