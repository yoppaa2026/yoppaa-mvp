// CE QUE LA FICHE TECHNIQUE DIT À GOOGLE DÈS LA PREMIÈRE LECTURE (27/10).
//
// 🔴 LA FICHE ARRIVAIT VIDE CHEZ GOOGLE. Relevé en ligne le 27/10 : le HTML de
// `/commander/aux-delices-des-7-abbayes` ne contenait, en texte, que
// « Chargement… Retour Accueil Suivi Tribu Profil ». Les horaires, la carte,
// les prix, les prestations n'arrivaient qu'APRÈS, chargés par le navigateur.
//
// ✅ ALEX, 27/10 (tableau) : « il faut IMPÉRATIVEMENT que sa fiche soit indexée
// et visible sur Google. » Les horaires et la carte partent donc dans la fiche
// technique (JSON-LD), que Google lit sans exécuter la page.
// ❌ RIEN DE VISIBLE EN PLUS (Alex, 27/10 : « ça devient un vrai bazar ») : une
// fiche simplifiée pendant le chargement a été essayée puis retirée. Le vrai
// rendu serveur de la fiche est un chantier à part.
//
// ⚠️ LA MÊME VÉRITÉ QUE L'ÉCRAN. Chaque règle ici recopie celle de la fiche
// affichée, avec sa référence : un jour « Fermé » chez nous et ouvert chez
// Google, c'est un client devant une porte close.
//
// ⚠️ MODULE PUR : il reçoit ce que `lib/fiche-seo-server.js` a lu.

import { creneauxDuJour, JOURS_ORDRE } from './ouverture.js'
import { categoriesOrdonnees } from './categories-catalogue.js'
import { trierArticles } from './ordre-articles.js'
import { estParCouverts } from './cours-collectifs.js'
import { estJointure } from './inventaire-salle.js'
import { estItinerant } from './lieux-activite.js'

const JOUR_SCHEMA = {
  lundi: 'Monday', mardi: 'Tuesday', mercredi: 'Wednesday', jeudi: 'Thursday',
  vendredi: 'Friday', samedi: 'Saturday', dimanche: 'Sunday',
}

// Un nombre de catalogue, ou null : un prix vide ou nul ne s'annonce pas.
function prixAffichable(valeur) {
  const n = Number(valeur)
  return valeur != null && valeur !== '' && Number.isFinite(n) && n > 0 ? n : null
}

// Les plages d'un jour, telles que la fiche les affiche. ⚠️ MÊME RÈGLE QUE
// `HorairesSection` : un jour n'est ouvert que s'il le DIT (`ouvert`). Un jour
// fermé garde ses heures en base (le tableau de bord les conserve pour le jour
// où on le rouvre) : les lire sans regarder `ouvert` l'aurait déclaré ouvert.
function plagesAffichees(jour) {
  if (!jour || !jour.ouvert) return []
  return creneauxDuJour(jour).filter(p => Array.isArray(p) && p[0] && p[1])
}

/**
 * Les horaires au format schema.org. ⚠️ RIEN POUR UN COMMERCE ITINÉRANT : sa
 * fiche cache la grille et raconte « où me trouver cette semaine ». Annoncer à
 * Google des heures d'ouverture sans lieu fixe, c'est envoyer quelqu'un à une
 * adresse vide.
 */
export function specificationsHoraires(horairesDetail, lieux = []) {
  if (estItinerant(lieux)) return []
  if (!horairesDetail || typeof horairesDetail !== 'object') return []
  const specs = []
  for (const cle of JOURS_ORDRE) {
    for (const [d, f] of plagesAffichees(horairesDetail[cle])) {
      specs.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${JOUR_SCHEMA[cle]}`,
        opens: String(d).slice(0, 5),
        closes: String(f).slice(0, 5),
      })
    }
  }
  return specs
}

function dureeLisible(min) {
  const n = Number(min)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 60) return `${n} min`
  const h = Math.floor(n / 60)
  const m = n % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/**
 * La carte d'une fiche, en sections, dans l'ordre de l'écran.
 *
 * Boutique (`app/commander/[slug]/page.js`) : les articles actifs, rangés par
 * `trierArticles`, les catégories par `categoriesOrdonnees` avec l'ordre du
 * commerçant, les articles sans catégorie à la fin dans « Autres ».
 *
 * Rendez-vous (`app/commander/rdv/[slug]/page.js`) : les prestations au choix
 * (⚠️ ni les jointures, ni les tables d'un restaurant : une « Table de 4 »
 * n'est pas une prestation qu'on liste, et elle n'a pas de prix), les formules
 * affichées, puis les produits.
 *
 * @returns [{ titre, elements: [{ nom, prix: number|null, detail: string|null, sorte: 'Product'|'Service' }] }]
 */
export function catalogueDeFiche({ page = 'boutique', articles = [], prestations = [], formules = [], ordreCategories = null } = {}) {
  const sections = []
  if (page === 'rdv') {
    const presta = (prestations || [])
      .filter(p => p && p.nom && !estJointure(p) && !estParCouverts(p))
      .map(p => ({
        nom: p.nom,
        prix: prixAffichable(p.prix),
        detail: dureeLisible(p.duree_minutes),
        sorte: 'Service',
      }))
    if (presta.length) sections.push({ titre: 'Prestations', elements: presta })
    const form = (formules || [])
      .filter(f => f && f.libelle)
      // ⚠️ PAS DE PRIX ICI : celui qu'affiche la fiche dépend des plages du
      // cours (`avecPlagesDuCours`), qu'on ne relit pas. Un prix approché sur
      // une fiche, c'est un prix inventé.
      .map(f => ({ nom: f.libelle, prix: null, detail: null, sorte: 'Service' }))
    if (form.length) sections.push({ titre: 'Formules', elements: form })
  }

  const actifs = trierArticles((articles || []).filter(a => a && a.nom))
  const enElement = a => ({
    nom: a.nom,
    prix: prixAffichable(a.prix),
    detail: a.description ? String(a.description).trim() || null : null,
    sorte: 'Product',
  })
  if (page === 'rdv') {
    // La fiche rendez-vous montre ses produits d'un seul tenant.
    if (actifs.length) sections.push({ titre: 'Produits', elements: actifs.map(enElement) })
    return sections
  }
  const cats = categoriesOrdonnees([...new Set(actifs.map(a => a.categorie).filter(Boolean))], ordreCategories)
  for (const cat of cats) {
    const elements = actifs.filter(a => a.categorie === cat).map(enElement)
    if (elements.length) sections.push({ titre: cat, elements })
  }
  const sansCat = actifs.filter(a => !a.categorie).map(enElement)
  if (sansCat.length) sections.push({ titre: 'Autres', elements: sansCat })
  return sections
}

// Au-delà, Google n'en lit pas davantage et la page s'alourdit pour rien.
export const MAX_OFFRES_JSONLD = 100

/**
 * La carte au format schema.org (`hasOfferCatalog`), ou un objet VIDE à étaler.
 * Seuls les éléments qui ont un PRIX deviennent des offres : une offre sans
 * prix, Google la signale en erreur.
 */
export function catalogueJsonLd(sections = [], nomCommerce = '') {
  const offres = []
  for (const s of sections || []) {
    for (const e of s.elements || []) {
      if (e.prix == null || offres.length >= MAX_OFFRES_JSONLD) continue
      offres.push({
        '@type': 'Offer',
        price: e.prix.toFixed(2),
        priceCurrency: 'EUR',
        itemOffered: { '@type': e.sorte === 'Service' ? 'Service' : 'Product', name: e.nom },
      })
    }
  }
  if (!offres.length) return {}
  return {
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: nomCommerce ? `La carte de ${nomCommerce}` : 'La carte',
      itemListElement: offres,
    },
  }
}
