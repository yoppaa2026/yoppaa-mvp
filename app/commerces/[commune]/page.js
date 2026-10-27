// LES COMMERCES D'UNE COMMUNE (27/10), page SERVEUR.
//
// ✅ ALEX, 27/10 (tableau) : `/commerces/<commune>`, SEULEMENT pour une commune
// qui a au moins un commerce publié. Une page écrite au serveur, avec un lien
// vers chaque fiche : c'est par elle que Google trouve les commerces, que
// `/commander` (liste selon la position, chargée dans le navigateur) ne lui
// montre pas. Les règles vivent dans `lib/commerces-commune.js`.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGroupesCommunes } from '@/lib/fiche-seo-server'
import { ficheDuCommerce } from '@/lib/reservation-metier'
import { extraireVille } from '@/lib/fiche-seo'
import { BASE_YOPPAA } from '@/lib/lien-fiche'
import { T, PageCommerces } from '../PageCommerces'

export const revalidate = 3600

async function groupe(slug) {
  const groupes = await getGroupesCommunes()
  return groupes.find(g => g.slug === slug) || null
}

export async function generateMetadata({ params }) {
  const { commune } = await params
  const g = await groupe(commune)
  if (!g) return { title: 'Commerces · Yoppaa', robots: { index: false, follow: true } }
  const titre = `Les commerces de ${g.nom} · Yoppaa`
  const description = `Commande à emporter, réserve une table ou prends rendez-vous chez ${g.commerces.length > 1 ? `les ${g.commerces.length} commerces` : 'le commerce'} de ${g.nom} sur Yoppaa. Gratuit pour toi, 0 % de commission Yoppaa pour eux.`
  const url = `${BASE_YOPPAA}/commerces/${g.slug}`
  return {
    metadataBase: new URL(BASE_YOPPAA),
    title: titre,
    description,
    alternates: { canonical: url },
    openGraph: { title: titre, description, url, siteName: 'Yoppaa', type: 'website', locale: 'fr_BE', images: [{ url: '/og-share.png', width: 640, height: 640, alt: 'Yoppaa' }] },
  }
}

export default async function CommercesDeLaCommune({ params }) {
  const { commune } = await params
  const g = await groupe(commune)
  if (!g) notFound()
  return (
    <PageCommerces
      titre={`Les commerces de ${g.nom}`}
      intro={`Commande à emporter, réserve une table ou prends rendez-vous chez les commerçants de ${g.nom}. Gratuit pour toi, 0 % de commission Yoppaa pour eux.`}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {g.commerces.map(c => {
          const localite = extraireVille(c.lieu?.adresse)
          const ligne = [c.type, localite && localite !== g.nom ? `à ${localite}` : null].filter(Boolean).join(' ')
          return (
            <li key={c.id}>
              <Link href={ficheDuCommerce(c)}
                style={{ display: 'block', background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 14, padding: '14px 16px', textDecoration: 'none', color: T.ink }}>
                <span style={{ display: 'block', fontWeight: 800, fontSize: '1.02rem' }}>{c.nom}</span>
                {ligne && <span style={{ display: 'block', marginTop: 2, fontSize: '0.86rem', fontWeight: 700, color: T.main }}>{ligne}</span>}
                {c.description && (
                  <span style={{ display: 'block', marginTop: 6, fontSize: '0.86rem', lineHeight: 1.5, color: T.muted }}>
                    {String(c.description).length > 180 ? `${String(c.description).slice(0, 177).trimEnd()}…` : c.description}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
      <p style={{ margin: '18px 0 0', fontSize: '0.9rem' }}>
        <Link href="/commerces" style={{ color: T.main, fontWeight: 800, textDecoration: 'none' }}>Les autres communes →</Link>
      </p>
    </PageCommerces>
  )
}
