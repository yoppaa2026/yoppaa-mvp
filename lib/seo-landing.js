// lib/seo-landing.js
//
// Les données structurées (JSON-LD) de la page d'accueil.
//
// À quoi ça sert, concrètement : Google ne « comprend » pas une page en lisant
// ses jolies phrases. Il cherche des balises normalisées qui lui disent, sans
// ambiguïté, QUI publie, QUOI est proposé, À QUEL PRIX et OÙ. Sans elles, la
// landing n'est qu'un mur de texte et les formules n'apparaissent nulle part
// dans les résultats. Avec elles, Google peut afficher l'entreprise, l'app et
// les trois formules avec leur tarif.
//
// ⚠️ RÈGLE ABSOLUE : on ne balise QUE ce qui est VISIBLE sur la page. Décrire
// dans le balisage une promesse absente de l'écran, c'est une pénalité Google,
// pas un gain. C'est pourquoi ce fichier ne recopie AUCUN prix : il les lit
// dans `lib/plans.js`, la même source que les cartes affichées, et il lit la
// date d'essai dans `lib/lancement.js`, la même source que la facturation.
// Un tarif changé dans une variable d'environnement suit tout seul.
//
// Fichier PUR : aucune dépendance serveur, testable par le banc en l'exécutant.

import { getPrixPlan, PLAN_LABEL } from './plans'
import { RESEAUX_URLS } from './reseaux'
import { LAUNCH_DATE_ISO, libelleDernierJourGratuit, estRegimeLancement } from './lancement'

export const SITE_URL = 'https://www.yoppaa.app'

// Identité légale de l'éditeur. Mêmes valeurs que les mentions légales de
// /legal : si elles divergeaient, Google verrait deux entreprises différentes.
export const EDITEUR = {
  nom: 'Yoppaa',
  raisonSociale: 'Avcotech SRL',
  tva: 'BE0731.637.148',
  rue: 'Rue de Prée 9G',
  codePostal: '5640',
  ville: 'Mettet',
  pays: 'BE',
  email: 'hello@yoppaa.app',
  telephone: '+32492730869',
}

// Ce que chaque formule donne, en une phrase. Repris des cartes visibles de la
// section « Formules » : le balisage doit dire la même chose que l'écran.
const DESCRIPTIONS = {
  exister: 'Page professionnelle, horaires, photos et itinéraire, visibilité dans l\'app et présence dans le Good Morning Yoppers.',
  communiquer: 'Tout Exister, plus les deals du jour, les actualités et les notifications ciblées vers les habitants de la commune.',
  vendre: 'Tout Communiquer, plus le Click and Collect, les rendez-vous en ligne, la livraison locale, la fidélité et les bons cadeaux. Aucune commission Yoppaa sur les ventes.',
}

// Construit l'offre d'une formule. `priceSpecification` porte la périodicité :
// sans elle, Google lit « 19,90 € » comme un prix d'achat unique.
function offreFormule(plan, position, maintenant = new Date()) {
  const prix = getPrixPlan(plan)
  if (!prix) return null
  const gratuite = estRegimeLancement(maintenant)
  return {
    '@type': 'Offer',
    '@id': `${SITE_URL}/#offre-${plan}`,
    name: PLAN_LABEL[plan] || plan,
    description: prix.mensuel > 0 && gratuite
      ? `${DESCRIPTIONS[plan]} Offert jusqu'au ${libelleDernierJourGratuit()} inclus, sans carte de paiement.`
      : DESCRIPTIONS[plan],
    position,
    price: prix.mensuel.toFixed(2),
    priceCurrency: 'EUR',
    // Les tarifs Yoppaa sont annoncés HORS TVA sur toute la page.
    valueAddedTaxIncluded: false,
    availability: 'https://schema.org/InStock',
    areaServed: { '@type': 'Country', name: 'Belgique' },
    url: `${SITE_URL}/signup`,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: prix.mensuel.toFixed(2),
      priceCurrency: 'EUR',
      valueAddedTaxIncluded: false,
      billingDuration: 1,
      billingIncrement: 1,
      unitCode: 'MON',  // code UN/CEFACT du MOIS
    },
    // ⚠️ PAS de `priceValidUntil` ici, et c'est délibéré.
    // Je l'avais posé pour exprimer la fin de la gratuité, et c'était un
    // contresens : `priceValidUntil` dit quand LE PRIX ANNONCÉ cesse d'être
    // valable. Or le prix annoncé est 19,90 €/mois, et il ne cesse pas le
    // 9 janvier : il COMMENCE. Google aurait affiché une expiration de tarif
    // là où il n'y en a aucune. La gratuité se dit dans la description, qui
    // est faite pour ça.
  }
}

// Le graphe complet. Un seul bloc <script>, plusieurs entités reliées par @id :
// c'est la forme que Google recommande, et elle évite de répéter l'éditeur
// dans chaque entité.
export function jsonLdLanding(maintenant = new Date()) {
  const offres = ['exister', 'communiquer', 'vendre']
    .map((plan, i) => offreFormule(plan, i + 1, maintenant))
    .filter(Boolean)

  const editeur = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organisation`,
    name: EDITEUR.nom,
    legalName: EDITEUR.raisonSociale,
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/og-share.png` },
    email: EDITEUR.email,
    telephone: EDITEUR.telephone,
    vatID: EDITEUR.tva,
    address: {
      '@type': 'PostalAddress',
      streetAddress: EDITEUR.rue,
      postalCode: EDITEUR.codePostal,
      addressLocality: EDITEUR.ville,
      addressCountry: EDITEUR.pays,
    },
    areaServed: { '@type': 'Country', name: 'Belgique' },
    // ⚠️ `sameAs` est ce qui permet à Google de relier la page Facebook à
    // l'entreprise et de les traiter comme une seule entité. Sans lui, les
    // deux existent côte à côte sans se connaître.
    sameAs: RESEAUX_URLS,
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      editeur,
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#site`,
        url: SITE_URL,
        name: 'Yoppaa',
        inLanguage: 'fr-BE',
        publisher: { '@id': `${SITE_URL}/#organisation` },
      },
      {
        // L'app elle-même, côté habitant : gratuite, iOS et Android.
        '@type': 'MobileApplication',
        '@id': `${SITE_URL}/#application`,
        name: 'Yoppaa',
        applicationCategory: 'ShoppingApplication',
        operatingSystem: 'iOS, Android, Web',
        inLanguage: 'fr-BE',
        // ⚠️ Plus de « commune par commune » : la Wallonie est ouverte. Cette
        // phrase avait survécu ici alors que la landing ne la disait plus, et
        // c'est mon propre contrôle de la page servie qui l'a trouvée.
        description: "L'app belge des commerces de quartier : Click and Collect, rendez-vous en ligne, deals du jour, carte de fidélité et bons cadeaux, partout en Wallonie.",
        datePublished: LAUNCH_DATE_ISO.slice(0, 10),
        publisher: { '@id': `${SITE_URL}/#organisation` },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
        },
      },
      {
        // Le versant commerçant : c'est là que vivent les trois formules.
        '@type': 'Service',
        '@id': `${SITE_URL}/#offre-commercants`,
        name: 'Yoppaa pour les commerçants',
        serviceType: 'Plateforme de commerce local',
        description: "Page professionnelle, Click and Collect, rendez-vous en ligne, livraison locale, notifications aux habitants, carte de fidélité et bons cadeaux. Yoppaa ne prend aucune commission sur les ventes : l'abonnement est son seul revenu.",
        provider: { '@id': `${SITE_URL}/#organisation` },
        areaServed: { '@type': 'Country', name: 'Belgique' },
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Formules Yoppaa',
          itemListElement: offres,
        },
      },
    ],
  }
}

// Sérialisation sûre. `<` devient son équivalent unicode : sans ça, un texte
// contenant une balise fermerait le <script> et injecterait du HTML dans la
// page. C'est la précaution que la documentation Next impose explicitement.
//
// ⚠️ Fonction SÉPARÉE, et exportée, pour une raison précise : le graphe de la
// landing ne contient aujourd'hui aucun « < ». Une garde qui se contenterait
// de vérifier son absence dans la sortie serait donc verte SANS RIEN PROUVER,
// et le resterait le jour où l'échappement disparaîtrait. Le banc éprouve donc
// l'échappement sur une charge qui, elle, contient vraiment une balise.
export function echapperJsonLd(objet) {
  return JSON.stringify(objet).replace(/</g, '\\u003c')
}

export function jsonLdLandingString(maintenant = new Date()) {
  return echapperJsonLd(jsonLdLanding(maintenant))
}
