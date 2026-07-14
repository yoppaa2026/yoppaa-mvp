// app/robots.js — robots.txt généré. Autorise l'indexation publique (fiches,
// /commander), bloque les zones privées/techniques.

const BASE_URL = 'https://www.yoppaa.app'

export default function robots() {
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
