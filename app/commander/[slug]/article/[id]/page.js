// /commander/<slug>/article/<id> : LE LIEN D'UN ARTICLE PARTAGÉ (16/10 soir).
//
// ✅ ALEX, 16/10 soir (tableau) : « Aperçu de l'article partagé ». WhatsApp,
// Facebook et Messenger lisent les métadonnées de CETTE page (le nom, le prix,
// l'image de `opengraph-image.js`), puis la personne qui clique est envoyée sur
// la fiche, ouverte sur l'article.
//
// ⚠️ PAS DE REDIRECTION SERVEUR : les robots de partage la suivraient et
// liraient l'aperçu générique de la fiche, c'est-à-dire le défaut qu'on corrige.
// ⚠️ JAMAIS INDEXÉE : Google garde la fiche (adresse canonique).

import { notFound } from 'next/navigation'
import { getArticlePartage } from '@/lib/partage-article-server'
import { texteApercuArticle, ficheSurArticle } from '@/lib/partage-article'
import { adresseCanonique } from '@/lib/fiche-seo'
import { BASE_YOPPAA } from '@/lib/lien-fiche'
import OuvrirLaFiche from './OuvrirLaFiche'

export async function generateMetadata({ params }) {
  const { slug, id } = await params
  const lu = await getArticlePartage(slug, id)
  const texte = texteApercuArticle(lu || {})
  if (!texte) return { title: 'Article · Yoppaa', robots: { index: false, follow: false } }
  return {
    metadataBase: new URL(BASE_YOPPAA),
    title: texte.titre,
    description: texte.description,
    alternates: { canonical: adresseCanonique(lu.commerce) },
    robots: { index: false, follow: true },
    openGraph: {
      title: texte.titre,
      description: texte.description,
      type: 'website',
      siteName: 'Yoppaa',
      locale: 'fr_BE',
    },
    twitter: { card: 'summary_large_image', title: texte.titre, description: texte.description },
  }
}

export default async function ArticlePartage({ params }) {
  const { slug, id } = await params
  const lu = await getArticlePartage(slug, id)
  if (!lu) notFound()
  return <OuvrirLaFiche cible={ficheSurArticle(slug, id)} nom={lu.article.nom} commerce={lu.commerce.nom} />
}
