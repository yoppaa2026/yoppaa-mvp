// Layout serveur de /commander : le titre et la description que Google montre
// pour la liste des commerces (page.js reste 'use client').
//
// ✅ ALEX, 15/10 soir (tableau) : « Les commerces de ton quartier · Yoppaa ».
// La description d'avant (celle du site entier) ne parlait que de Click &
// Collect, alors qu'on y réserve aussi une table et un rendez-vous.
//
// ⚠️ PAS D'ADRESSE CANONIQUE ICI : elle serait héritée par les pages enfants
// qui n'en déclarent pas (connexion, annulation, Good Morning) et les
// renverrait toutes vers la liste. Les fiches déclarent la leur
// (lib/fiche-seo.js), et Google a lui-même retenu /commander pour cette page.
//
// ⚠️ PAS DE `robots` NON PLUS : c'est le layout racine qui ferme le site tant
// que NEXT_PUBLIC_SEO_INDEX n'est pas à 'true'.

const TITRE = 'Les commerces de ton quartier · Yoppaa'
const DESCRIPTION = 'Commande à emporter, réserve une table ou prends rendez-vous chez les commerçants de ton quartier. Gratuit pour toi, 0 % de commission Yoppaa pour eux.'

export const metadata = {
  title: TITRE,
  description: DESCRIPTION,
  openGraph: {
    title: TITRE,
    description: DESCRIPTION,
    type: 'website',
    locale: 'fr_BE',
    images: [{ url: '/og-share.png', width: 640, height: 640, alt: 'Yoppaa' }],
  },
}

export default function CommanderLayout({ children }) {
  return children
}
