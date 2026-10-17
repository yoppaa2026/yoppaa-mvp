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
const RESTO = { id: 'r', nom: 'Le Témoin', slug: 'le-temoin', categorie: 'alimentaire', type: 'restaurant', adresse: ADRESSE, plan: 'vendre', rdv_actif: true }
// La preuve qu'une commande peut aller au bout, donnée par les layouts.
const OUVERTE = { commandeRealisable: true }
// ⚠️ `rdv_actif` (15/10) : un salon qui n'a pas allumé ses rendez-vous ne
// déclare plus rien à Google, et le banc l'a dit le jour même.
const SALON = { id: 's', nom: 'Salon Ciseaux', slug: 'ciseaux', categorie: 'vitrine', type: 'coiffeur', adresse: ADRESSE, plan: 'vendre', rdv_actif: true }
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

  const resto = metadataFiche(RESTO, PAGE_BOUTIQUE, OUVERTE)
  egal('la fiche d’un restaurant qui prend des commandes garde son titre', resto.title, 'Le Témoin à Mettet · Commander sur Yoppaa')
  egal('et se déclare elle-même', resto.alternates?.canonical, `${SITE}/commander/le-temoin`)

  // 🔴 LE BISTROLOGUE (15/10) : des tables, pas encore de commande. Son titre
  // Google disait « Commander sur Yoppaa ».
  const bistro = metadataFiche(RESTO, PAGE_BOUTIQUE)
  egal('🔴 sans commande possible, le titre ne promet pas « Commander »', bistro.title, 'Le Témoin à Mettet · Yoppaa')
  egal('🔴 et la description parle de sa réservation de table', bistro.description,
    'Découvre Le Témoin à Mettet sur Yoppaa : infos, horaires et réserver une table en ligne.')
  const ferme = metadataFiche({ ...SALON, rdv_actif: false }, PAGE_RDV)
  egal('🔴 un salon aux rendez-vous éteints ne promet pas « Prendre rendez-vous »', ferme.title, 'Salon Ciseaux à Mettet · Yoppaa')
  egal('ni dans sa description', ferme.description, 'Découvre Salon Ciseaux à Mettet sur Yoppaa : infos et horaires.')

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

// ═══ 5. LA PREUVE DE COMMANDE (15/10, le Bistrologue) ════════════════════
//
// 🔴 Le Bistrologue annonçait « Commander en ligne » à Google : interrupteur
// des commandes allumé, mais aucun créneau de retrait et ses articles en
// vitrine. La lecture s'exécute ici sur une fausse base qui répond comme
// Supabase.
{
  const { lireCommandeRealisable } = await import('../lib/commande-realisable-lecture.js')
  const { livraisonDisponible } = await import('../lib/zone-etoile.js')
  const base = (tables, erreurs = {}) => ({
    from(t) {
      const rep = () => Promise.resolve({ data: tables[t] ?? null, error: erreurs[t] || null })
      const b = { select: () => b, eq: () => b, limit: () => b, maybeSingle: rep, then: (ok, ko) => rep().then(ok, ko) }
      return b
    },
  })
  const EN_LIGNE = [{ actif: true, est_vitrine: false, prix: 3.5 }]
  const EN_VITRINE = [{ actif: true, est_vitrine: true, prix: 3.5 }]
  const RESTO_ID = { id: 'r', categorie: 'alimentaire' }

  verifier('un article en ligne et un créneau de retrait : la commande va au bout',
    await lireCommandeRealisable(base({ articles: EN_LIGNE, creneaux: [{ id: 1 }] }), RESTO_ID))
  verifier('🔴 le Bistrologue : articles en vitrine, pas de commande',
    !(await lireCommandeRealisable(base({ articles: EN_VITRINE, creneaux: [{ id: 1 }] }), RESTO_ID)))
  verifier('🔴 un article en ligne sans créneau ni livraison : pas de commande',
    !(await lireCommandeRealisable(base({ articles: EN_LIGNE, creneaux: [] }), RESTO_ID)))
  verifier('sans créneau, la livraison suffit',
    await lireCommandeRealisable(base({ articles: EN_LIGNE, creneaux: [], livraison_config: { codes_postaux: ['5640'] } }),
      { ...RESTO_ID, livraison_actif: true }))
  verifier('🔴 une livraison éteinte ne compte pas, même configurée',
    !(await lireCommandeRealisable(base({ articles: EN_LIGNE, creneaux: [], livraison_config: { codes_postaux: ['5640'] } }),
      { ...RESTO_ID, livraison_actif: false })))
  verifier('une boutique de détail n’a pas besoin de créneau',
    await lireCommandeRealisable(base({ articles: EN_LIGNE, creneaux: [] }), { id: 'b', categorie: 'detail' }))
  verifier('🔴 une lecture en erreur FERME (on parle à Google)',
    !(await lireCommandeRealisable(base({ articles: EN_LIGNE, creneaux: [{ id: 1 }] }, { creneaux: { message: 'x' } }), RESTO_ID)))
  verifier('sans commerce, rien', !(await lireCommandeRealisable(base({}), null)))
  verifier('sans client, rien', !(await lireCommandeRealisable(null, RESTO_ID)))

  verifier('la livraison se propose avec des codes postaux',
    livraisonDisponible({ livraison_actif: true }, { codes_postaux: ['5640'] }))
  verifier('🔴 pas sans zone', !livraisonDisponible({ livraison_actif: true }, { codes_postaux: [], zone_rayons_m: null }))
  verifier('🔴 pas éteinte', !livraisonDisponible({ livraison_actif: false }, { codes_postaux: ['5640'] }))
  verifier('pas sans configuration', !livraisonDisponible({ livraison_actif: true }, null))

  const fiche = lireCode('app/commander/[slug]/page.js')
  verifier('🔴 la fiche lit la livraison par la même règle',
    /const livraisonDispo = livraisonDisponible\(commercant, livraisonConfig\)/.test(fiche))
}

// ═══ 6. C'EST BRANCHÉ ? ══════════════════════════════════════════════════
{
  const sitemap = lireCode('app/sitemap.js')
  verifier('🔴 le sitemap annonce la page retenue', /url: adresseCanonique\(c\)/.test(sitemap))
  verifier('🔴 et il lit la catégorie, sans quoi un salon serait annoncé par sa boutique',
    /\.select\('slug, categorie, created_at'\)/.test(sitemap))
  // 🔴 DES DATES VRAIES, OU PAS DE DATE (17/10) : « modifiée à l'instant » à
  // chaque lecture apprend à Google à ignorer le plan.
  verifier('🔴 le plan n’annonce plus « modifiée à l’instant »', !/new Date\(\)/.test(sitemap) && !/lastModified: now/.test(sitemap))
  verifier('🔴 /commander porte la date du commerce le plus récent',
    /const liste = plusRecente\(publies\)/.test(sitemap) && /url: `\$\{BASE_URL\}\/commander`, \.\.\.\(liste \? \{ lastModified: liste \} : \{\}\)/.test(sitemap))
  const { plusRecente } = await import('../lib/plan-du-site.js')
  egal('la plus récente des dates', plusRecente([{ created_at: '2026-09-09T10:00:00Z' }, { created_at: '2026-10-16T08:00:00Z' }, { created_at: null }])?.toISOString(), '2026-10-16T08:00:00.000Z')
  egal('🔴 aucune date : aucune date (jamais « maintenant »)', plusRecente([]), undefined)
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
