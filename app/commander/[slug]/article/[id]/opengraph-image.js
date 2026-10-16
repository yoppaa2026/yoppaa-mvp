// L'IMAGE D'UN ARTICLE PARTAGÉ (16/10 soir).
//
// ✅ ALEX, 16/10 soir (tableau) : « Aperçu de l'article partagé ». Ce que la
// conversation WhatsApp ou Facebook montre : la photo de l'article, son nom,
// son prix, le commerce, et l'ADRESSE ÉCRITE SUR L'IMAGE (sur Instagram, un
// lien en légende ne se clique pas : voir le partage vers les réseaux, 05/09).
//
// ⚠️ RIEN NE DOIT FAIRE ÉCHOUER L'IMAGE : une photo illisible (format, réseau)
// donne la carte sans photo, une police introuvable la police par défaut. Une
// image en erreur, c'est un aperçu vide dans la conversation.

import { ImageResponse } from 'next/og'
import { getArticlePartage } from '@/lib/partage-article-server'
import { prixLisible } from '@/lib/partage-article'

export const alt = 'Un article sur Yoppaa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const C = { ink: '#1A0840', deep: '#2D0F6B', main: '#6B21D4', pale: '#EDE0FF', fond: '#F8F6FF', muted: '#6B7280' }

async function police(poids) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=DM+Sans:wght@${poids}`)).text()
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    if (!url) return null
    return await (await fetch(url)).arrayBuffer()
  } catch {
    return null
  }
}

// La photo, en données : seulement du JPEG ou du PNG, que le moteur sait lire.
async function photoEnDonnees(url) {
  if (!url) return null
  try {
    const rep = await fetch(url)
    if (!rep.ok) return null
    const type = String(rep.headers.get('content-type') || '').split(';')[0].trim()
    if (type !== 'image/jpeg' && type !== 'image/png') return null
    const octets = Buffer.from(await rep.arrayBuffer())
    if (octets.length > 6 * 1024 * 1024) return null
    return `data:${type};base64,${octets.toString('base64')}`
  } catch {
    return null
  }
}

export default async function Image({ params }) {
  const { slug, id } = await params
  const lu = await getArticlePartage(slug, id)
  const [gras, normal, photo] = await Promise.all([police(800), police(500), photoEnDonnees(lu?.article?.photo_url)])
  const polices = [
    ...(gras ? [{ name: 'DM Sans', data: gras, weight: 800, style: 'normal' }] : []),
    ...(normal ? [{ name: 'DM Sans', data: normal, weight: 500, style: 'normal' }] : []),
  ]
  const famille = polices.length ? 'DM Sans' : undefined
  const nom = lu?.article?.nom || 'Un article'
  const commerce = lu?.commerce?.nom || 'Yoppaa'
  const prix = prixLisible(lu?.article?.prix)
  const adresse = `yoppaa.app/commander/${slug}`
  const tailleNom = nom.length > 40 ? 52 : nom.length > 22 ? 64 : 76

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: photo ? '#fff' : C.ink, fontFamily: famille }}>
        {photo && (
          <img src={photo} alt="" width={560} height={630} decoding="async" loading="eager" style={{ width: 560, height: 630, objectFit: 'cover' }} />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '56px 60px' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, color: photo ? C.main : '#C4B5FD' }}>{commerce}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', fontSize: tailleNom, fontWeight: 800, color: photo ? C.ink : '#fff', lineHeight: 1.08, letterSpacing: -1.5 }}>{nom}</div>
            {prix && <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, color: photo ? C.main : '#fff' }}>{prix}</div>}
          </div>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 500, color: photo ? C.muted : '#DDD6FE' }}>{adresse}</div>
        </div>
      </div>
    ),
    { ...size, ...(polices.length ? { fonts: polices } : {}) }
  )
}
