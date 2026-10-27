// app/sitemap.js — sitemap.xml généré : routes statiques + toutes les fiches
// commerçant PUBLIÉES (via la vue commercants_public, publiés only).
// Revalidé toutes les heures pour que les nouvelles fiches apparaissent sans build.
//
// 🔴 DES DATES VRAIES, OU PAS DE DATE (17/10, Alex : « ok pour la modif »).
// Les pages fixes annonçaient « modifiée à l'instant » à CHAQUE lecture du
// plan : Google apprend vite qu'une date qui change toujours ne veut rien dire,
// et cesse de se fier au plan pour savoir quand revenir (il n'était plus
// repassé sur /commander depuis le 12 juin). Désormais :
//   • /commander : la publication du commerce le plus récent, puisque c'est
//     l'arrivée d'un commerce qui change la liste ;
//   • une fiche : sa date de publication ;
//   • les autres pages : aucune date, plutôt qu'une date fausse.

import { createClient } from '@supabase/supabase-js'
import { adresseCanonique } from '@/lib/fiche-seo'
import { plusRecente } from '@/lib/plan-du-site'
import { getGroupesCommunes } from '@/lib/fiche-seo-server'

const BASE_URL = 'https://www.yoppaa.app'
const SEO_INDEX = process.env.NEXT_PUBLIC_SEO_INDEX === 'true'

export const revalidate = 3600

export default async function sitemap() {
  // Pré-lancement : seules la landing et les pages légales sont ouvertes au
  // crawl (cf. app/robots.js). Annoncer les fiches ici reviendrait à proposer
  // à Google des URL que le robots.txt lui interdit, ce que la Search Console
  // signale comme une erreur.
  if (!SEO_INDEX) {
    return [
      { url: BASE_URL, changeFrequency: 'daily', priority: 1 },
      { url: `${BASE_URL}/legal`, changeFrequency: 'monthly', priority: 0.3 },
    ]
  }

  let publies = []
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    )
    // ⚠️ `categorie` : un salon s'annonce par sa fiche rendez-vous, la page que
    // Google doit retenir (lib/fiche-seo.js, Alex 15/10). Annoncer la boutique
    // d'un salon, c'est annoncer une page qui redirige ou qui renvoie ailleurs.
    const { data } = await supabase.from('commercants_public').select('slug, categorie, created_at')
    publies = (data || []).filter(c => c.slug)
  } catch {
    publies = []
  }

  const liste = plusRecente(publies)
  const staticRoutes = [
    { url: BASE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/commander`, ...(liste ? { lastModified: liste } : {}), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/classement`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/legal`, changeFrequency: 'monthly', priority: 0.3 },
    // ⚠️ PAS /concours : en noindex pour le moment (Alex, 17/10). Annoncer une
    // page qu'on interdit d'indexer, la Search Console le signale en erreur.
  ]
  // ✅ 27/10 (Alex) : les pages des communes qui ont au moins un commerce, et
  // la page qui les liste. Chacune porte la date de son commerce le plus récent.
  let groupes = []
  try {
    groupes = await getGroupesCommunes()
  } catch {
    groupes = []
  }
  const communes = groupes.length ? [
    { url: `${BASE_URL}/commerces`, ...(liste ? { lastModified: liste } : {}), changeFrequency: 'weekly', priority: 0.7 },
    ...groupes.map(g => {
      const recente = plusRecente(g.commerces)
      return { url: `${BASE_URL}/commerces/${g.slug}`, ...(recente ? { lastModified: recente } : {}), changeFrequency: 'weekly', priority: 0.7 }
    }),
  ] : []

  const fiches = publies.map(c => ({
    url: adresseCanonique(c),
    ...(c.created_at ? { lastModified: new Date(c.created_at) } : {}),
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  return [...staticRoutes, ...communes, ...fiches]
}
