// app/robots.js — robots.txt généré. Autorise l'indexation publique (fiches,
// /commander), bloque les zones privées/techniques.

const BASE_URL = 'https://www.yoppaa.app'
const SEO_INDEX = process.env.NEXT_PUBLIC_SEO_INDEX === 'true'

export default function robots() {
  // Pré-lancement : NEXT_PUBLIC_SEO_INDEX != 'true' → on bloque TOUT crawl (rien ne
  // doit être indexé tant que les données sont de test). On flippe au lancement.
  if (!SEO_INDEX) {
    return { rules: { userAgent: '*', disallow: '/' } }
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
