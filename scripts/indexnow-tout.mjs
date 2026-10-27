// Envoi UNIQUE à IndexNow (Bing…) de toutes les adresses du plan du site en
// ligne (27/10). Ensuite, chaque publication prévient Bing d'elle-même
// (app/api/admin/publier/route.js).
//
// À relancer seulement après un changement d'ensemble (nouvelles pages,
// adresses renommées). Bing n'aime pas recevoir encore et encore des pages
// qui n'ont pas changé.
//
//   node scripts/indexnow-tout.mjs           → montre la liste, n'envoie rien
//   node scripts/indexnow-tout.mjs --envoyer → envoie

import { readFileSync } from 'node:fs'
import { signalerAuxMoteurs, INDEXNOW_CLE, HOTE_INDEXNOW } from '../lib/indexnow.js'

const envoyer = process.argv.includes('--envoyer')

// La clé doit répondre en ligne AVANT tout envoi, sinon le moteur refuse.
const cleEnLigne = await (await fetch(`https://${HOTE_INDEXNOW}/${INDEXNOW_CLE}.txt`)).text().catch(() => '')
const cleLocale = readFileSync(new URL(`../public/${INDEXNOW_CLE}.txt`, import.meta.url), 'utf8')
if (cleEnLigne.trim() !== INDEXNOW_CLE || cleLocale.trim() !== INDEXNOW_CLE) {
  console.error('La clé ne répond pas encore en ligne (déploiement pas fini ?). Rien envoyé.')
  process.exit(1)
}

const plan = await (await fetch(`https://${HOTE_INDEXNOW}/sitemap.xml`)).text()
const urls = [...plan.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
console.log(`${urls.length} adresses dans le plan du site :`)
urls.forEach(u => console.log('  ' + u))

if (!envoyer) {
  console.log('\nRien envoyé (ajoute --envoyer).')
  process.exit(0)
}
// Script lancé à la main, sur le plan du site de la PRODUCTION : on lève la
// garde « hors production » explicitement, et seulement ici.
const r = await signalerAuxMoteurs(urls, { env: { VERCEL_ENV: 'production', NEXT_PUBLIC_SEO_INDEX: 'true' } })
console.log('\nRéponse :', r)
process.exit(r.ok ? 0 : 1)
