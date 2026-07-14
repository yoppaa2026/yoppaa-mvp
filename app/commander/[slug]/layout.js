// Layout serveur de la fiche commerçant : ajoute le SEO (metadata dynamiques +
// JSON-LD) SANS toucher à page.js (qui reste 'use client').
//
// Dans ce Next v16 : generateMetadata est Server-only et `params` est une Promise
// (await obligatoire). Le fetch est dédupliqué via React cache() entre
// generateMetadata et le rendu du layout.

import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://www.yoppaa.app'
const OG_FALLBACK = `${BASE_URL}/icon-512.png`

// Mapping catégorie Yoppaa -> type schema.org (décision B, 14/07).
const SCHEMA_TYPE = { alimentaire: 'FoodEstablishment', detail: 'Store', vitrine: 'LocalBusiness' }

// Fetch du commerçant publié (vue commercants_public = colonnes sûres, publiés only).
const getCommercant = cache(async (slug) => {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    )
    const { data } = await supabase
      .from('commercants_public')
      .select('nom, description, logo_url, adresse, slug, type, categorie, telephone, latitude, longitude')
      .eq('slug', slug)
      .maybeSingle()
    return data
  } catch {
    return null
  }
})

// Extrait la ville d'une adresse type "Rue X 12, 5640 Mettet, Belgique".
function extractVille(adresse) {
  if (!adresse) return null
  for (const part of adresse.split(',').map(p => p.trim())) {
    const m = part.match(/^\d{4}\s+(.+)$/)
    if (m) return m[1]
  }
  return null
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const c = await getCommercant(slug)
  if (!c) {
    // Fiche non publiée / introuvable → jamais indexée (même quand le SEO global est ON).
    return {
      title: 'Commerce · Yoppaa',
      description: 'Découvre les commerces de ton quartier sur Yoppaa.',
      robots: { index: false, follow: false },
    }
  }
  const ville = extractVille(c.adresse)
  const titre = `${c.nom}${ville ? ` à ${ville}` : ''} · Commander sur Yoppaa`
  const desc = (c.description && c.description.trim())
    || `Découvre ${c.nom}${ville ? ` à ${ville}` : ''} sur Yoppaa : infos, horaires et commande en ligne sans faire la file.`
  const image = c.logo_url || OG_FALLBACK
  const url = `${BASE_URL}/commander/${slug}`
  return {
    metadataBase: new URL(BASE_URL),
    title: titre,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title: titre, description: desc, url, siteName: 'Yoppaa',
      type: 'website', locale: 'fr_BE', images: [{ url: image }],
    },
    twitter: { card: 'summary_large_image', title: titre, description: desc, images: [image] },
  }
}

export default async function CommercantLayout({ children, params }) {
  const { slug } = await params
  const c = await getCommercant(slug)
  const jsonLd = c ? {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[c.categorie] || 'LocalBusiness',
    name: c.nom,
    url: `${BASE_URL}/commander/${slug}`,
    ...(c.description ? { description: c.description } : {}),
    ...(c.logo_url ? { image: c.logo_url } : {}),
    ...(c.telephone ? { telephone: c.telephone } : {}),
    ...(c.adresse ? { address: { '@type': 'PostalAddress', streetAddress: c.adresse, addressCountry: 'BE' } } : {}),
    ...(c.latitude && c.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude } } : {}),
  } : null
  return (
    <>
      {children}
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
    </>
  )
}
