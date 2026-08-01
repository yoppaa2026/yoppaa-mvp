// app/sitemap.js — sitemap.xml généré : routes statiques + toutes les fiches
// commerçant PUBLIÉES (via la vue commercants_public, publiés only).
// Revalidé toutes les heures pour que les nouvelles fiches apparaissent sans build.

import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://www.yoppaa.app'
const SEO_INDEX = process.env.NEXT_PUBLIC_SEO_INDEX === 'true'

export const revalidate = 3600

export default async function sitemap() {
  const now = new Date()

  // Pré-lancement : seules la landing et les pages légales sont ouvertes au
  // crawl (cf. app/robots.js). Annoncer les fiches ici reviendrait à proposer
  // à Google des URL que le robots.txt lui interdit, ce que la Search Console
  // signale comme une erreur.
  if (!SEO_INDEX) {
    return [
      { url: BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
      { url: `${BASE_URL}/legal`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    ]
  }

  const staticRoutes = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/commander`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/classement`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/legal`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ]

  let fiches = []
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    )
    const { data } = await supabase.from('commercants_public').select('slug, created_at')
    fiches = (data || [])
      .filter(c => c.slug)
      .map(c => ({
        url: `${BASE_URL}/commander/${c.slug}`,
        lastModified: c.created_at ? new Date(c.created_at) : now,
        changeFrequency: 'daily',
        priority: 0.8,
      }))
  } catch {
    fiches = []
  }

  return [...staticRoutes, ...fiches]
}
