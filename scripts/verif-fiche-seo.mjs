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
const OUVERTE = { commandeRealisable: true, lieux: [{ type: 'permanent', principal: true, actif: true, adresse: 'Rue de la Station 3, 5640 Mettet' }] }
// ⚠️ `rdv_actif` (15/10) : un salon qui n'a pas allumé ses rendez-vous ne
// déclare plus rien à Google, et le banc l'a dit le jour même.
// ⚠️ 27/10 : `adresse`, `latitude`, `longitude` sont ceux du SIÈGE SOCIAL. Ils
// restent dans les fixtures EXPRÈS : le banc prouve qu'ils ne sortent plus.
const SALON = { id: 's', nom: 'Salon Ciseaux', slug: 'ciseaux', categorie: 'vitrine', type: 'coiffeur', adresse: ADRESSE, latitude: 50.11, longitude: 4.11, plan: 'vendre', rdv_actif: true }
// Le lieu DÉCLARÉ, la seule adresse publiable (27/10).
const ADRESSE_LIEU = 'Rue de la Station 3, 5640 Mettet'
const LIEUX = [{ id: 'l1', type: 'permanent', principal: true, actif: true, adresse: ADRESSE_LIEU, latitude: 50.35, longitude: 4.74 }]
const ICI = { lieux: LIEUX }
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

  const salon = metadataFiche(SALON, PAGE_RDV, ICI)
  egal('🔴 le titre d’un salon dit le geste et le lieu', salon.title, 'Prendre rendez-vous chez Salon Ciseaux à Mettet · Yoppaa')
  egal('🔴 il déclare sa fiche rendez-vous', salon.alternates?.canonical, `${SITE}/commander/rdv/ciseaux`)
  egal('l’aperçu de partage vise la même adresse', salon.openGraph?.url, `${SITE}/commander/rdv/ciseaux`)
  egal('la description par défaut parle de rendez-vous', salon.description,
    'Découvre Salon Ciseaux à Mettet sur Yoppaa : infos, horaires et prendre rendez-vous en ligne.')
  verifier('aucun robots ici : c’est le layout racine qui ouvre ou ferme', !('robots' in salon))

  const table = metadataFiche(RESTO, PAGE_RDV, ICI)
  egal('🔴 chez un restaurant, on réserve une table', table.title, 'Réserver une table chez Le Témoin à Mettet · Yoppaa')
  egal('🔴 et la page de table renvoie Google vers la fiche', table.alternates?.canonical, `${SITE}/commander/le-temoin`)

  const boutiqueSalon = metadataFiche(SALON, PAGE_BOUTIQUE)
  egal('🔴 la boutique d’un salon renvoie vers son agenda', boutiqueSalon.alternates?.canonical, `${SITE}/commander/rdv/ciseaux`)

  const resto = metadataFiche(RESTO, PAGE_BOUTIQUE, OUVERTE)
  egal('la fiche d’un restaurant qui prend des commandes garde son titre', resto.title, 'Le Témoin à Mettet · Commander sur Yoppaa')
  egal('et se déclare elle-même', resto.alternates?.canonical, `${SITE}/commander/le-temoin`)

  // 🔴 LE BISTROLOGUE (15/10) : des tables, pas encore de commande. Son titre
  // Google disait « Commander sur Yoppaa ».
  const bistro = metadataFiche(RESTO, PAGE_BOUTIQUE, ICI)
  egal('🔴 sans commande possible, le titre ne promet pas « Commander »', bistro.title, 'Le Témoin à Mettet · Yoppaa')
  egal('🔴 et la description parle de sa réservation de table', bistro.description,
    'Découvre Le Témoin à Mettet sur Yoppaa : infos, horaires et réserver une table en ligne.')
  const ferme = metadataFiche({ ...SALON, rdv_actif: false }, PAGE_RDV, ICI)
  egal('🔴 un salon aux rendez-vous éteints ne promet pas « Prendre rendez-vous »', ferme.title, 'Salon Ciseaux à Mettet · Yoppaa')
  egal('ni dans sa description', ferme.description, 'Découvre Salon Ciseaux à Mettet sur Yoppaa : infos et horaires.')

  const decrit = metadataFiche({ ...SALON, description: '  Le salon du village.  ' }, PAGE_RDV)
  egal('la description du commerçant passe, nettoyée', decrit.description, 'Le salon du village.')
  egal('l’image par défaut est le logo Yoppaa', salon.openGraph?.images?.[0]?.url, `${SITE}/icon-512.png`)

  const sansVille = metadataFiche({ ...SALON, adresse: null }, PAGE_RDV)
  egal('sans ville, pas de « à » orphelin', sansVille.title, 'Prendre rendez-vous chez Salon Ciseaux · Yoppaa')
  // 🔴 27/10 : LE SIÈGE SOCIAL NE DONNE JAMAIS LA VILLE. SALON porte une
  // adresse de siège à Mettet et aucun lieu : son titre ne dit aucune ville.
  egal('🔴 le siège seul ne donne jamais la ville du titre', metadataFiche(SALON, PAGE_RDV).title, 'Prendre rendez-vous chez Salon Ciseaux · Yoppaa')
  egal('🔴 un lieu hebdomadaire seul non plus (pas d’adresse fixe)',
    metadataFiche(SALON, PAGE_RDV, { lieux: [{ type: 'hebdo', actif: true, adresse: ADRESSE_LIEU }] }).title, 'Prendre rendez-vous chez Salon Ciseaux · Yoppaa')

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

  // 🔴 27/10 : L'ADRESSE PUBLIÉE EST CELLE DU LIEU, JAMAIS LE SIÈGE SOCIAL.
  // SALON porte un siège (adresse ET coordonnées) : rien ne doit en sortir.
  verifier('🔴 sans lieu, aucune adresse publiée (le siège reste chez nous)', !('address' in (salon || {})), JSON.stringify(salon?.address))
  verifier('🔴 ni ses coordonnées', !('geo' in (salon || {})))
  const situe = jsonLdFiche(SALON, PAGE_RDV, null, ICI)
  egal('🔴 avec un lieu, c’est SON adresse', situe?.address?.streetAddress, ADRESSE_LIEU)
  egal('et SES coordonnées', [situe?.geo?.latitude, situe?.geo?.longitude], [50.35, 4.74])
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
  // ✅ ALEX, 17/10 : le concours en noindex, LISIBLE par les robots (sinon le
  // noindex n'est jamais vu), et hors du plan du site.
  const concours = lireCode('app/concours/page.js')
  verifier('🔴 le concours est en noindex', /robots: \{ index: false, follow: true \}/.test(concours))
  verifier('🔴 et il n’est plus annoncé dans le plan du site', !/\/concours/.test(sitemap))
  // ⚠️ LA LISTE ENTIÈRE DES INTERDICTIONS, pas la seule première ligne.
  const interdits = (lireCode('app/robots.js').match(/disallow:\s*(\[[\s\S]*?\]|'[^']*')/g) || []).join(' ')
  verifier('🔴 mais les robots peuvent toujours le lire (sinon le noindex n’est jamais vu)',
    interdits.includes('/dashboard') && !interdits.includes('/concours'), interdits.slice(0, 120))
  const { plusRecente } = await import('../lib/plan-du-site.js')
  egal('la plus récente des dates', plusRecente([{ created_at: '2026-09-09T10:00:00Z' }, { created_at: '2026-10-16T08:00:00Z' }, { created_at: null }])?.toISOString(), '2026-10-16T08:00:00.000Z')
  egal('🔴 aucune date : aucune date (jamais « maintenant »)', plusRecente([]), undefined)
  const landing = lireCode('app/page.tsx')
  // ⚠️ Le titre AFFICHÉ (phase dévoilée). Celui de la phase « mystère »
  // d'avant le 1er août dort dans le même fichier et ne sort plus.
  verifier('le titre de l’accueil n’a plus de tiret cadratin',
    /title: 'Yoppaa, ton quartier dans ta poche'/.test(landing) && !/title: 'Yoppaa — Ton quartier/.test(landing))
}

// ═══ 7. LA FICHE COMPLÈTE CHEZ GOOGLE, ET LES COMMUNES (27/10) ═══════════
// ✅ ALEX, 27/10 : « il faut impérativement que sa fiche soit indexée et
// visible sur Google ». La fiche écrite au serveur dit la MÊME chose que l'écran.
{
  const { specificationsHoraires, catalogueDeFiche, catalogueJsonLd } = await import('../lib/fiche-contenu-seo.js')
  const GRILLE = {
    lundi: { ouvert: true, debut: '07:00', fin: '12:30', debut2: '13:30', fin2: '18:00' },
    mardi: { ouvert: false, debut: '07:00', fin: '14:00' },
    mercredi: { ouvert: true, creneaux: [['08:00', '12:00']] },
    // ⚠️ SANS `ouvert` : l'écran (`HorairesSection`) affiche « Fermé ».
    // `creneauxDuJour` seul l'aurait déclaré ouvert (vu par mutation, 27/10).
    jeudi: { debut: '07:00', fin: '14:00' },
    dimanche: { ouvert: true, debut: '07:00', fin: '12:00' },
  }
  egal('les jours annoncés, dans l’ordre de la semaine', [...new Set(specificationsHoraires(GRILLE).map(s => s.dayOfWeek.split('/').pop()))], ['Monday', 'Wednesday', 'Sunday'])
  // 🔴 Un jour fermé GARDE ses heures en base : sans `ouvert`, on l'annonçait ouvert.
  verifier('🔴 un jour fermé n’est jamais annoncé ouvert à Google',
    !specificationsHoraires(GRILLE).some(s => s.dayOfWeek.endsWith('Tuesday') || s.dayOfWeek.endsWith('Thursday')))
  egal('les plages à pause font deux créneaux', specificationsHoraires(GRILLE).filter(s => s.dayOfWeek.endsWith('Monday')).map(s => [s.opens, s.closes]), [['07:00', '12:30'], ['13:30', '18:00']])
  egal('🔴 un commerce itinérant n’annonce aucune heure d’ouverture', specificationsHoraires(GRILLE, [{ type: 'hebdo', actif: true }]), [])
  egal('sans grille, rien', specificationsHoraires(null), [])

  const ARTICLES = [
    { nom: 'Baguette', prix: 1.4, categorie: 'Pains', ordre: 2 },
    { nom: 'Pistolet', prix: 0.5, categorie: 'Pains', ordre: 1 },
    { nom: 'Éclair', prix: 2.8, categorie: 'Pâtisseries' },
    { nom: 'Sac en tissu', prix: 0, categorie: null },
  ]
  const boutique = catalogueDeFiche({ page: 'boutique', articles: ARTICLES, ordreCategories: ['Pâtisseries', 'Pains'] })
  egal('les catégories dans l’ordre du commerçant, « Autres » à la fin', boutique.map(s => s.titre), ['Pâtisseries', 'Pains', 'Autres'])
  egal('les articles dans l’ordre de la fiche', boutique[1].elements.map(e => e.nom), ['Pistolet', 'Baguette'])
  egal('🔴 un prix nul ne s’affiche pas', boutique[2].elements[0].prix, null)

  const PRESTA = [
    { nom: 'Coupe femme', prix: 38, duree_minutes: 45 },
    { nom: 'Table de 4', prix: 20, par_couverts: true },
    { nom: '2 tables de 4 jointes', jointure_de: 't4' },
  ]
  const rdv = catalogueDeFiche({ page: 'rdv', prestations: PRESTA, formules: [{ libelle: 'Carnet de 10' }], articles: [{ nom: 'Shampooing', prix: 12.5 }] })
  egal('la fiche rendez-vous : prestations, formules, produits', rdv.map(s => s.titre), ['Prestations', 'Formules', 'Produits'])
  egal('🔴 ni table de restaurant ni jointure dans les prestations', rdv[0].elements.map(e => [e.nom, e.prix, e.detail]), [['Coupe femme', 38, '45 min']])
  egal('🔴 une formule sans prix (celui de l’écran dépend des plages du cours)', rdv[1].elements[0].prix, null)

  const offres = catalogueJsonLd(boutique, 'La Mie')
  egal('🔴 seuls les éléments qui ont un prix deviennent des offres', offres.hasOfferCatalog?.itemListElement?.length, 3)
  egal('le prix au format schema.org', offres.hasOfferCatalog?.itemListElement?.[0]?.price, '2.80')
  egal('sans prix, aucun catalogue', catalogueJsonLd([{ titre: 'x', elements: [{ nom: 'y', prix: null }] }]), {})
  const balise = jsonLdFiche({ ...RESTO, horaires_detail: GRILLE }, PAGE_BOUTIQUE, null, { ...ICI, catalogue: boutique })
  verifier('🔴 le balisage porte les horaires', Array.isArray(balise?.openingHoursSpecification) && balise.openingHoursSpecification.length === 4)
  verifier('🔴 et la carte', balise?.hasOfferCatalog?.itemListElement?.length === 3)

  const { codePostalDe, slugCommune, communeDuCodePostal, regrouperParCommune } = await import('../lib/commerces-commune.js')
  egal('le code postal se lit dans l’adresse', codePostalDe('Rue X 12, 5640 Mettet, Belgique'), '5640')
  egal('sans code postal, rien', codePostalDe('Rue sans code'), null)
  egal('l’adresse d’une commune', slugCommune('Braine-l’Alleud'), 'braine-l-alleud')
  egal('une commune avec accent', slugCommune('Éghezée'), 'eghezee')
  const COMMUNES = [{ id: 'm', nom: 'Mettet', codes_postaux: ['5640'] }, { id: 'f', nom: 'Fosses-la-Ville', codes_postaux: ['5070'] }]
  egal('le code postal trouve sa commune', communeDuCodePostal('5640', COMMUNES)?.nom, 'Mettet')
  const COMMERCES = [
    { id: 'a', nom: 'Zèbre', slug: 'zebre', siege: 'ignoré' },
    { id: 'b', nom: 'Aux Délices', slug: 'aux-delices' },
    { id: 'c', nom: 'Le Camion', slug: 'camion' },
    { id: 'd', nom: 'Sans lieu', slug: 'sans-lieu', adresse: 'Rue du Siège 1, 5070 Fosses-la-Ville' },
  ]
  const LIEUX_TOUS = [
    { commercant_id: 'a', type: 'permanent', actif: true, adresse: 'Rue A 1, 5640 Mettet' },
    { commercant_id: 'b', type: 'permanent', actif: true, adresse: 'Rue B 2, 5640 Saint-Gérard' },
    { commercant_id: 'c', type: 'hebdo', actif: true, adresse: 'Place 1, 5070 Fosses-la-Ville' },
  ]
  const groupes = regrouperParCommune(COMMERCES, LIEUX_TOUS, COMMUNES)
  egal('🔴 seules les communes qui ont un commerce', groupes.map(g => g.nom), ['Mettet'])
  egal('ses commerces par nom, la section comprise (Saint-Gérard est à Mettet)', groupes[0].commerces.map(c => c.nom), ['Aux Délices', 'Zèbre'])
  verifier('🔴 un commerce sans lieu permanent n’est rangé nulle part (jamais par son siège)',
    !groupes.some(g => g.commerces.some(c => c.id === 'c' || c.id === 'd')))

  // ⚠️ ET C'EST BRANCHÉ ? Une règle juste que personne n'appelle (23/08).
  const lecture = lireCode('lib/fiche-seo-server.js')
  verifier('🔴 la lecture de la fiche ne rapatrie plus le siège social',
    !/\.select\('[^']*\badresse\b[^']*'\)\s*\n?\s*\.eq\('slug'/.test(lecture) && /\.select\('id, rdv_actif, commande_actif, livraison_actif, nom, description, logo_url, slug, type, categorie, telephone, horaires_detail, ordre_categories, plan, essai_plan, created_at'\)/.test(lecture))
  for (const [nom, chemin, page] of [
    ['la fiche boutique', 'app/commander/[slug]/layout.js', 'PAGE_BOUTIQUE'],
    ['la fiche rendez-vous', 'app/commander/rdv/[slug]/layout.js', 'PAGE_RDV'],
  ]) {
    const l = lireCode(chemin)
    verifier(`🔴 ${nom} : le titre lit la ville sur les lieux`, new RegExp(`metadataFiche\\(c, ${page}, \\{ commandeRealisable, lieux \\}\\)`).test(l))
    verifier(`🔴 ${nom} : le balisage reçoit les lieux et la carte`, new RegExp(`jsonLdFiche\\(c, ${page}, avis, \\{ commandeRealisable, lieux, catalogue \\}\\)`).test(l))
    // ❌ ALEX, 27/10 : « ça devient un vrai bazar ». Le layout ne rend RIEN de
    // visible autour de la fiche : la page, puis le seul bloc JSON-LD.
    verifier(`🔴 ${nom} : rien de visible en plus de la fiche`,
      // (le commentaire JSX sur l'échappement devient `{ }` une fois la prose ôtée)
      /return \(\s*<>\s*\{children\}\s*(\{\s*\}\s*)?\{jsonLd && \(/.test(l))
  }
  const plan = lireCode('app/sitemap.js')
  verifier('🔴 le plan du site annonce les communes', /url: `\$\{BASE_URL\}\/commerces\/\$\{g\.slug\}`/.test(plan) && /\.\.\.communes, \.\.\.fiches/.test(plan))
  verifier('l’accueil mène aux communes', /<Link href="\/commerces">/.test(lireCode('app/components/LandingReveal.js')))
  verifier('la liste des commerces aussi', /<Link href="\/commerces"/.test(lireCode('app/commander/page.js')))
}

// ── 8. IndexNow : Bing apprend la fiche à sa publication (27/10, lot 4) ──
{
  const { corpsIndexNow, indexNowActif, signalerAuxMoteurs, INDEXNOW_CLE } = await import('../lib/indexnow.js')
  const PROD = { VERCEL_ENV: 'production', NEXT_PUBLIC_SEO_INDEX: 'true' }
  verifier('🔴 la clé répond sur le site, à la racine',
    readFileSync(new URL(`../public/${INDEXNOW_CLE}.txt`, import.meta.url), 'utf8').trim() === INDEXNOW_CLE)
  verifier('🔴 le site d’essai ne prévient personne', !indexNowActif({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SEO_INDEX: 'true' }))
  verifier('un site fermé aux robots non plus', !indexNowActif({ VERCEL_ENV: 'production', NEXT_PUBLIC_SEO_INDEX: 'false' }))
  verifier('la production, oui', indexNowActif(PROD))
  const corps = corpsIndexNow([
    'https://www.yoppaa.app/commander/ciseaux', 'https://www.yoppaa.app/commander/ciseaux',
    'https://test.yoppaa.app/commander/ciseaux', 'https://www.yoppaa.app.evil.com/x', null,
  ])
  egal('🔴 seules nos adresses partent, une fois chacune', corps?.urlList, ['https://www.yoppaa.app/commander/ciseaux'])
  egal('la clé et son emplacement accompagnent l’envoi', [corps?.host, corps?.keyLocation],
    ['www.yoppaa.app', `https://www.yoppaa.app/${INDEXNOW_CLE}.txt`])
  verifier('rien à envoyer, pas d’envoi', corpsIndexNow([null, 'https://ailleurs.be/']) === null)
  let appels = 0
  const r1 = await signalerAuxMoteurs(['https://www.yoppaa.app/commander'], { env: { VERCEL_ENV: 'preview' }, fetchImpl: async () => { appels++; return { status: 200 } } })
  verifier('🔴 hors production, aucun appel au moteur', appels === 0 && r1.ok === false)
  // Une exception qui sortirait d'ici ferait échouer la publication : le banc
  // la rattrape pour la compter, au lieu de planter.
  const r2 = await signalerAuxMoteurs(['https://www.yoppaa.app/commander'], { env: PROD, fetchImpl: async () => { throw new Error('réseau') } })
    .catch(() => ({ leve: true }))
  verifier('🔴 un moteur muet ne fait rien échouer', !r2.leve && r2.ok === false && r2.raison === 'réseau')
  const r3 = await signalerAuxMoteurs(['https://www.yoppaa.app/commander'], { env: PROD, fetchImpl: async () => ({ status: 202 }) })
  verifier('202 (clé en cours de vérification) est un succès', r3.ok === true)
  const r4 = await signalerAuxMoteurs(['https://www.yoppaa.app/commander'], { env: PROD, fetchImpl: async () => ({ status: 403 }) })
  verifier('403 (clé refusée) est un échec', r4.ok === false && r4.statut === 403)

  const route = lireCode('app/api/admin/publier/route.js')
  const maj = route.indexOf(".update({ statut_publication: 'publie'")
  const signal = route.indexOf('await signalerAuxMoteurs(')
  verifier('🔴 la publication prévient Bing, APRÈS avoir publié', maj > 0 && signal > maj)
  verifier('la fiche, sa commune, la liste des communes et des commerces partent',
    /signalerAuxMoteurs\(\[adresseCanonique\(fiche\), pageCommune, `\$\{BASE\}\/commerces`, `\$\{BASE\}\/commander`\]\)/.test(route))
  verifier('la réponse dit si Bing a été prévenu', /NextResponse\.json\(\{ ok: true, email, bing \}\)/.test(route))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Ce que Google lit des fiches : vert.')
