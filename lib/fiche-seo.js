// CE QUE GOOGLE LIT D'UNE FICHE COMMERÇANT, ÉCRIT UNE SEULE FOIS (15/10).
//
// 🔴 LA FICHE D'UN SALON ÉTAIT INVISIBLE POUR GOOGLE. Le titre, la description,
// l'adresse canonique et le balisage vivaient dans le layout de la fiche
// boutique (`/commander/<slug>`) et nulle part ailleurs. Or la fiche d'un
// salon, d'une esthéticienne, de tout commerce de services, c'est
// `/commander/rdv/<slug>` : Google l'y voyait sous le titre générique du site,
// sans description ni balisage. Les deux layouts appellent désormais ce module.
//
// ✅ ALEX, 15/10 soir (tableau) : pour un salon, Google montre la FICHE
// RENDEZ-VOUS. La règle est celle qui décide déjà où mène la liste :
// `ficheDuCommerce` (alimentaire et détail → la boutique, services → l'agenda).
// La page de table d'un restaurant, elle, renvoie Google vers sa fiche.
//
// ⚠️ CE N'EST PAS L'ADRESSE DES AFFICHES. Un papier, un QR, un post gardent
// `lienFiche` (`/commander/<slug>`), qui redirige d'elle-même : elle ne sait pas
// ce que vend le commerçant, et c'est voulu (voir lib/lien-fiche.js). Ici on
// dit à Google quelle page RETENIR, pas où envoyer un passant.
//
// ⚠️ MODULE PUR : il reçoit le commerce déjà lu (lib/fiche-seo-server.js).

import { BASE_YOPPAA } from './lien-fiche.js'
import { ficheDuCommerce, motsReservation } from './reservation-metier.js'
import { potentialActionJsonLd } from './action-google.js'

const OG_FALLBACK = `${BASE_YOPPAA}/icon-512.png`

// Mapping catégorie Yoppaa -> type schema.org (décision B, 14/07).
const SCHEMA_TYPE = { alimentaire: 'FoodEstablishment', detail: 'Store', vitrine: 'LocalBusiness' }

// Les deux pages publiques d'un commerce.
export const PAGE_BOUTIQUE = 'boutique'
export const PAGE_RDV = 'rdv'

// Extrait la ville d'une adresse type "Rue X 12, 5640 Mettet, Belgique".
export function extraireVille(adresse) {
  if (!adresse) return null
  for (const part of String(adresse).split(',').map(p => p.trim())) {
    const m = part.match(/^\d{4}\s+(.+)$/)
    if (m) return m[1]
  }
  return null
}

// L'adresse de cette page-ci.
export function urlDePage(c, page) {
  if (!c?.slug) return null
  return page === PAGE_RDV
    ? `${BASE_YOPPAA}/commander/rdv/${c.slug}`
    : `${BASE_YOPPAA}/commander/${c.slug}`
}

// La page que Google doit retenir pour ce commerce : celle de la liste.
export function adresseCanonique(c) {
  if (!c?.slug) return null
  return `${BASE_YOPPAA}${ficheDuCommerce(c)}`
}

// Le balisage ne se pose que sur la page retenue : deux pages qui déclarent le
// même commerce, c'est deux fiches pour Google.
export function estPageCanonique(c, page) {
  const ici = urlDePage(c, page)
  return !!ici && ici === adresseCanonique(c)
}

/**
 * Les métadonnées d'une fiche, pour `generateMetadata`.
 *
 * @param c     le commerce publié, ou `null` (introuvable, pas publié)
 * @param page  PAGE_BOUTIQUE ou PAGE_RDV
 */
export function metadataFiche(c, page = PAGE_BOUTIQUE) {
  if (!c) {
    // Fiche non publiée / introuvable → jamais indexée (même quand le SEO global est ON).
    return {
      title: 'Commerce · Yoppaa',
      description: 'Découvre les commerces de ton quartier sur Yoppaa.',
      robots: { index: false, follow: false },
    }
  }
  const ville = extraireVille(c.adresse)
  const ou = ville ? ` à ${ville}` : ''
  let titre, descParDefaut
  if (page === PAGE_RDV) {
    // « Réserver une table » chez un restaurant, « Prendre rendez-vous » ailleurs.
    const action = motsReservation(c).action
    titre = `${action} chez ${c.nom}${ou} · Yoppaa`
    descParDefaut = `Découvre ${c.nom}${ou} sur Yoppaa : infos, horaires et ${action.toLowerCase()} en ligne.`
  } else {
    titre = `${c.nom}${ou} · Commander sur Yoppaa`
    descParDefaut = `Découvre ${c.nom}${ou} sur Yoppaa : infos, horaires et commande en ligne sans faire la file.`
  }
  const desc = (c.description && String(c.description).trim()) || descParDefaut
  const image = c.logo_url || OG_FALLBACK
  const url = adresseCanonique(c)
  return {
    metadataBase: new URL(BASE_YOPPAA),
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

/**
 * Le balisage schema.org d'un commerce, ou `null` quand cette page n'est pas
 * celle que Google doit retenir.
 *
 * @param avis  { moyenne, count } déjà filtré par le seuil de l'écran, ou null
 */
export function jsonLdFiche(c, page, avis = null) {
  if (!c || !estPageCanonique(c, page)) return null
  return {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[c.categorie] || 'LocalBusiness',
    name: c.nom,
    url: adresseCanonique(c),
    ...(c.description ? { description: c.description } : {}),
    ...(c.logo_url ? { image: c.logo_url } : {}),
    ...(c.telephone ? { telephone: c.telephone } : {}),
    ...(c.adresse ? { address: { '@type': 'PostalAddress', streetAddress: c.adresse, addressCountry: 'BE' } } : {}),
    ...(c.latitude && c.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude } } : {}),
    ...(avis ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: avis.moyenne, reviewCount: avis.count, bestRating: 5, worstRating: 1 } } : {}),
    // Le geste transactionnel déclaré aux moteurs : « on commande ici », ou
    // « on prend rendez-vous ici », et RIEN si le commerçant ne peut ni l'un ni
    // l'autre. C'est ce que Google lit pour proposer un bouton d'action.
    ...potentialActionJsonLd(c),
  }
}
