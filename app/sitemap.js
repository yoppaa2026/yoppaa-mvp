// app/sitemap.js — sitemap.xml généré : routes statiques + toutes les fiches
// commerçant PUBLIÉES (via la vue commercants_public, publiés only).
// Revalidé toutes les heures pour que les nouvelles fiches apparaissent sans build.

import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://www.yoppaa.app'

export const revalidate = 3600

export default async function sitemap() {
  const now = new Date()
  const staticRoutes = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/commander`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/classement`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
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
