// app/robots.js — robots.txt généré. Autorise l'indexation publique (fiches,
// /commander), bloque les zones privées/techniques.

const BASE_URL = 'https://www.yoppaa.app'
const SEO_INDEX = process.env.NEXT_PUBLIC_SEO_INDEX === 'true'

export default function robots() {
  // Pré-lancement (NEXT_PUBLIC_SEO_INDEX != 'true') : les fiches contiennent
  // encore des commerçants de test, elles restent fermées. Mais depuis le
  // dévoilement du 1er août la landing est publique et communiquée : la laisser
  // hors de Google ferait remonter des homonymes à la place de la marque.
  // On ouvre donc UNIQUEMENT l'accueil et les pages légales, qui n'exposent
  // aucune donnée de test.
  //
  // `/$` est l'ancre de fin d'URL : elle ne matche que la racine exacte, pas
  // les sous-chemins. Sur une collision, Google applique la règle la plus
  // longue, donc `Allow: /$` (2 caractères) l'emporte sur `Disallow: /` pour
  // l'accueil, et `Allow: /legal` pour les CGU, sans rien ouvrir d'autre.
  //
  // `/sitemap.xml` et les images de marque DOIVENT figurer dans les Allow :
  // le Disallow général s'applique aussi à eux, et un sitemap que Googlebot
  // n'a pas le droit de télécharger remonte en « Impossible de récupérer le
  // sitemap » dans la Search Console. Même chose pour le logo référencé par
  // le JSON-LD et l'image de partage.
  if (!SEO_INDEX) {
    return {
      rules: {
        userAgent: '*',
        allow: [
          '/$', '/legal', '/sitemap.xml',
          // Le favicon des résultats de recherche est récupéré par un crawl
          // SÉPARÉ, qui respecte lui aussi le robots.txt : sans ces trois
          // lignes, Google affiche son globe générique à la place du logo.
          '/favicon.ico', '/icon-192.png', '/icon-512.png',
          '/og-share.png', '/manifest.json',
        ],
        disallow: '/',
      },
      sitemap: `${BASE_URL}/sitemap.xml`,
      host: BASE_URL,
    }
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/admin',
        '/api/',
        '/login',
        '/signup',
        '/onboarding',
        '/commander/auth',
        '/auth/',
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
