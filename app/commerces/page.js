// LES COMMUNES QUI ONT DES COMMERCES SUR YOPPAA (27/10), page SERVEUR.
//
// ✅ ALEX, 27/10 (tableau) : seulement les communes qui ont au moins un
// commerce publié. Chacune mène à sa page, qui mène aux fiches. Liée depuis
// l'accueil et le bas de chaque fiche.

import Link from 'next/link'
import { getGroupesCommunes } from '@/lib/fiche-seo-server'
import { BASE_YOPPAA } from '@/lib/lien-fiche'
import { T, PageCommerces } from './PageCommerces'

export const revalidate = 3600

const TITRE = 'Les commerces par commune · Yoppaa'
const DESCRIPTION = 'Les communes où tu peux commander, réserver une table ou prendre rendez-vous chez tes commerçants avec Yoppaa.'

export const metadata = {
  metadataBase: new URL(BASE_YOPPAA),
  title: TITRE,
  description: DESCRIPTION,
  alternates: { canonical: `${BASE_YOPPAA}/commerces` },
  openGraph: { title: TITRE, description: DESCRIPTION, url: `${BASE_YOPPAA}/commerces`, siteName: 'Yoppaa', type: 'website', locale: 'fr_BE', images: [{ url: '/og-share.png', width: 640, height: 640, alt: 'Yoppaa' }] },
}

export default async function CommercesParCommune() {
  const groupes = await getGroupesCommunes()
  return (
    <PageCommerces
      titre="Les commerces par commune"
      intro="Commande à emporter, réserve une table ou prends rendez-vous chez les commerçants de ta commune.">
      {groupes.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.95rem', color: T.muted }}>Les premiers commerces arrivent bientôt.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groupes.map(g => (
            <li key={g.id}>
              <Link href={`/commerces/${g.slug}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 14, padding: '14px 16px', textDecoration: 'none', color: T.ink }}>
                <span style={{ fontWeight: 800, fontSize: '1.02rem' }}>{g.nom}</span>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: T.main, whiteSpace: 'nowrap' }}>
                  {g.commerces.length} {g.commerces.length > 1 ? 'commerces' : 'commerce'} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageCommerces>
  )
}
