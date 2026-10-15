// Banc de CE QUE GOOGLE LIT D'UNE FICHE (15/10).
//
// 🔴 CE QU'IL GARDE : que la fiche d'un salon existe pour Google. Jusqu'au
// 15/10, `/commander/rdv/<slug>` (la fiche de TOUS les commerces de services)
// n'avait ni titre, ni description, ni balisage : Google la voyait sous le
// titre générique du site. Et que chaque commerce n'ait QU'UNE page retenue,
// celle où mène la liste (`ficheDuCommerce`), décision d'Alex au tableau.
//
// ⚠️ TOUT S'EXÉCUTE : les fonctions pures, le layout de /commander, le
// robots.txt. Les gardes de code ne servent qu'à vérifier que les pages
// APPELLENT le module.

import { readFileSync } from 'node:fs'
import {
  adresseCanonique, urlDePage, estPageCanonique, metadataFiche, jsonLdFiche,
  extraireVille, PAGE_BOUTIQUE, PAGE_RDV,
} from '../lib/fiche-seo.js'
import { sansProse } from './lire-code.mjs'

// ⚠️ ON CHERCHE DANS LE CODE, JAMAIS DANS LA PROSE.
const lireCode = (chemin) => sansProse(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'))

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

const ADRESSE = 'Place Joseph Meunier 1, 5640 Mettet, Belgique'
const RESTO = { id: 'r', nom: 'Le Témoin', slug: 'le-temoin', categorie: 'alimentaire', type: 'restaurant', adresse: ADRESSE, plan: 'vendre' }
const SALON = { id: 's', nom: 'Salon Ciseaux', slug: 'ciseaux', categorie: 'vitrine', type: 'coiffeur', adresse: ADRESSE, plan: 'vendre' }
const BOUTIQUE = { id: 'b', nom: 'La Boutique', slug: 'boutique', categorie: 'detail', type: 'fleuriste', adresse: ADRESSE, plan: 'vendre' }
const SITE = 'https://www.yoppaa.app'

// ═══ 1. LA PAGE QUE GOOGLE RETIENT ═══════════════════════════════════════
{
  egal('un restaurant : sa fiche boutique', adresseCanonique(RESTO), `${SITE}/commander/le-temoin`)
  egal('🔴 un salon : sa fiche rendez-vous', adresseCanonique(SALON), `${SITE}/commander/rdv/ciseaux`)
  egal('une boutique de détail : sa fiche', adresseCanonique(BOUTIQUE), `${SITE}/commander/boutique`)
  egal('sans slug, aucune adresse', adresseCanonique({ nom: 'x', categorie: 'vitrine' }), null)
  egal('l’adresse de la page rendez-vous', urlDePage(RESTO, PAGE_RDV), `${SITE}/commander/rdv/le-temoin`)
  egal('l’adresse de la page boutique', urlDePage(SALON, PAGE_BOUTIQUE), `${SITE}/commander/ciseaux`)

  verifier('🔴 la fiche rendez-vous d’un salon est la page retenue', estPageCanonique(SALON, PAGE_RDV))
  verifier('🔴 sa boutique ne l’est pas', !estPageCanonique(SALON, PAGE_BOUTIQUE))
  verifier('la fiche d’un restaurant est retenue', estPageCanonique(RESTO, PAGE_BOUTIQUE))
  verifier('🔴 sa page de table ne l’est pas', !estPageCanonique(RESTO, PAGE_RDV))
  verifier('sans commerce, aucune page retenue', !estPageCanonique(null, PAGE_RDV))
}

// ═══ 2. LES MÉTADONNÉES ══════════════════════════════════════════════════
{
  const absent = metadataFiche(null, PAGE_RDV)
  egal('🔴 une fiche non publiée n’est jamais indexée', absent.robots, { index: false, follow: false })
  verifier('et elle ne déclare aucune adresse', !absent.alternates)

  const salon = metadataFiche(SALON, PAGE_RDV)
  egal('🔴 le titre d’un salon dit le geste et le lieu', salon.title, 'Prendre rendez-vous chez Salon Ciseaux à Mettet · Yoppaa')
  egal('🔴 il déclare sa fiche rendez-vous', salon.alternates?.canonical, `${SITE}/commander/rdv/ciseaux`)
  egal('l’aperçu de partage vise la même adresse', salon.openGraph?.url, `${SITE}/commander/rdv/ciseaux`)
  egal('la description par défaut parle de rendez-vous', salon.description,
    'Découvre Salon Ciseaux à Mettet sur Yoppaa : infos, horaires et prendre rendez-vous en ligne.')
  verifier('aucun robots ici : c’est le layout racine qui ouvre ou ferme', !('robots' in salon))

  const table = metadataFiche(RESTO, PAGE_RDV)
  egal('🔴 chez un restaurant, on réserve une table', table.title, 'Réserver une table chez Le Témoin à Mettet · Yoppaa')
  egal('🔴 et la page de table renvoie Google vers la fiche', table.alternates?.canonical, `${SITE}/commander/le-temoin`)

  const boutiqueSalon = metadataFiche(SALON, PAGE_BOUTIQUE)
  egal('🔴 la boutique d’un salon renvoie vers son agenda', boutiqueSalon.alternates?.canonical, `${SITE}/commander/rdv/ciseaux`)

  const resto = metadataFiche(RESTO, PAGE_BOUTIQUE)
  egal('la fiche d’un restaurant garde son titre', resto.title, 'Le Témoin à Mettet · Commander sur Yoppaa')
  egal('et se déclare elle-même', resto.alternates?.canonical, `${SITE}/commander/le-temoin`)

  const decrit = metadataFiche({ ...SALON, description: '  Le salon du village.  ' }, PAGE_RDV)
  egal('la description du commerçant passe, nettoyée', decrit.description, 'Le salon du village.')
  egal('l’image par défaut est le logo Yoppaa', salon.openGraph?.images?.[0]?.url, `${SITE}/icon-512.png`)

  const sansVille = metadataFiche({ ...SALON, adresse: null }, PAGE_RDV)
  egal('sans ville, pas de « à » orphelin', sansVille.title, 'Prendre rendez-vous chez Salon Ciseaux · Yoppaa')

  egal('la ville se lit dans l’adresse', extraireVille(ADRESSE), 'Mettet')
  egal('sans code postal, aucune ville', extraireVille('Rue sans code'), null)
}

// ═══ 3. LE BALISAGE, SUR UNE SEULE PAGE ══════════════════════════════════
{
  egal('🔴 la boutique d’un salon ne déclare rien', jsonLdFiche(SALON, PAGE_BOUTIQUE), null)
  egal('🔴 la page de table d’un restaurant non plus', jsonLdFiche(RESTO, PAGE_RDV), null)
  const salon = jsonLdFiche(SALON, PAGE_RDV)
  verifier('🔴 la fiche rendez-vous d’un salon déclare le commerce', salon?.name === 'Salon Ciseaux')
  egal('avec son adresse retenue', salon?.url, `${SITE}/commander/rdv/ciseaux`)
  egal('un salon est un LocalBusiness', salon?.['@type'], 'LocalBusiness')
  egal('🔴 et il se réserve, vers son agenda', salon?.potentialAction?.['@type'], 'ReserveAction')
  const resto = jsonLdFiche(RESTO, PAGE_BOUTIQUE, { moyenne: 4.5, count: 6 })
  egal('un restaurant est un FoodEstablishment', resto?.['@type'], 'FoodEstablishment')
  egal('les avis passent quand on les donne', resto?.aggregateRating?.ratingValue, 4.5)
  verifier('sans avis, pas de note', !('aggregateRating' in (jsonLdFiche(RESTO, PAGE_BOUTIQUE) || {})))
  egal('sans commerce, rien', jsonLdFiche(null, PAGE_BOUTIQUE), null)
}

// ═══ 4. /commander, ET LE ROBOTS.TXT UNE FOIS GOOGLE OUVERT ═════════════
{
  const { metadata } = await import('../app/commander/layout.js')
  egal('🔴 le titre validé par Alex', metadata.title, 'Les commerces de ton quartier · Yoppaa')
  egal('la description validée, espace insécable compris', metadata.description,
    'Commande à emporter, réserve une table ou prends rendez-vous chez les commerçants de ton quartier. Gratuit pour toi, 0 % de commission Yoppaa pour eux.')
  egal('l’aperçu de partage dit la même chose', metadata.openGraph?.title, metadata.title)
  // ⚠️ Une adresse canonique ici serait HÉRITÉE par les pages enfants qui n'en
  // déclarent pas, et un robots écraserait celui du layout racine.
  verifier('🔴 aucune adresse canonique héritable', !metadata.alternates)
  verifier('🔴 aucun robots qui contredirait le layout racine', !metadata.robots)

  process.env.NEXT_PUBLIC_SEO_INDEX = 'true'
  const { default: robots } = await import('../app/robots.js?ouvert')
  const ferme = [].concat(robots().rules.disallow || [])
  verifier('les pages d’annulation sont fermées aux robots',
    ferme.includes('/commander/cancel') && ferme.includes('/commander/rdv/cancel'))
  verifier('🔴 mais les fiches rendez-vous restent ouvertes',
    !ferme.some(d => d === '/commander/rdv' || d === '/commander/rdv/'))
}

// ═══ 5. C'EST BRANCHÉ ? ══════════════════════════════════════════════════
{
  const sitemap = lireCode('app/sitemap.js')
  verifier('🔴 le sitemap annonce la page retenue', /url: adresseCanonique\(c\)/.test(sitemap))
  verifier('🔴 et il lit la catégorie, sans quoi un salon serait annoncé par sa boutique',
    /\.select\('slug, categorie, created_at'\)/.test(sitemap))
  const landing = lireCode('app/page.tsx')
  // ⚠️ Le titre AFFICHÉ (phase dévoilée). Celui de la phase « mystère »
  // d'avant le 1er août dort dans le même fichier et ne sort plus.
  verifier('le titre de l’accueil n’a plus de tiret cadratin',
    /title: 'Yoppaa, ton quartier dans ta poche'/.test(landing) && !/title: 'Yoppaa — Ton quartier/.test(landing))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Ce que Google lit des fiches : vert.')
