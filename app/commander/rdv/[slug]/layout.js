// Layout serveur de la fiche rendez-vous : le SEO de l'agenda d'un commerce
// (page.js reste 'use client').
//
// 🔴 15/10 : CETTE PAGE N'AVAIT AUCUN LAYOUT. C'est la fiche de tous les salons,
// esthéticiennes et commerces de services, et Google la voyait sous le titre
// générique du site, sans description ni balisage. Elle dit maintenant
// « Prendre rendez-vous chez X à Mettet » (« Réserver une table » chez un
// restaurant), par la même règle que la fiche boutique : `lib/fiche-seo.js`.
//
// ✅ ALEX, 15/10 (tableau) : pour un salon, Google retient CETTE page ; pour un
// restaurant, la réservation de table renvoie Google vers sa fiche.

import { echapperJsonLd } from '@/lib/seo-landing'
import { metadataFiche, jsonLdFiche, PAGE_RDV } from '@/lib/fiche-seo'
import { getCommercantPublic, getAvisAgregat } from '@/lib/fiche-seo-server'

export async function generateMetadata({ params }) {
  const { slug } = await params
  return metadataFiche(await getCommercantPublic(slug), PAGE_RDV)
}

export default async function FicheRdvLayout({ children, params }) {
  const { slug } = await params
  const c = await getCommercantPublic(slug)
  const avis = c ? await getAvisAgregat(c.id) : null
  // `null` chez un restaurant : son balisage vit sur sa fiche boutique.
  const jsonLd = jsonLdFiche(c, PAGE_RDV, avis)
  return (
    <>
      {children}
      {/* ⚠️ `echapperJsonLd`, JAMAIS `JSON.stringify` NU : le nom et la
          description viennent du commerçant, et un « </script> » fermerait ce
          bloc (voir app/commander/[slug]/layout.js). */}
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: echapperJsonLd(jsonLd) }} />
      )}
    </>
  )
}
