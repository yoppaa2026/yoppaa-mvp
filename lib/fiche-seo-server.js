// LA LECTURE D'UNE FICHE PUBLIÉE, POUR CE QUE GOOGLE EN LIT (15/10).
//
// Partagée par les deux layouts publics (`/commander/<slug>` et
// `/commander/rdv/<slug>`) : la boutique et l'agenda d'un même commerce ne
// peuvent pas le lire avec deux listes de colonnes. Le fetch est dédupliqué via
// React cache() entre generateMetadata et le rendu du layout.
//
// ⚠️ La vue `commercants_public` ne rend que les fiches PUBLIÉES à `anon` : une
// fiche en relecture n'existe pas ici, et sa page reste en noindex.

import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { AVIS_MINIMUM_POUR_MOYENNE } from '@/lib/avis-affichage'
import { lireCommandeRealisable } from '@/lib/commande-realisable-lecture'
import { regrouperParCommune } from '@/lib/commerces-commune'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )
}

// Fetch du commerçant publié (vue commercants_public = colonnes sûres, publiés only).
export const getCommercantPublic = cache(async (slug) => {
  try {
    const { data } = await client()
      .from('commercants_public')
      // ⚠️ `plan` EST INDISPENSABLE au balisage : sans lui, on déclarerait
      // « on commande ici » pour un commerce du palier Exister, qui n'a pas de
      // panier. Une colonne absente d'un select ne lève aucune erreur, elle
      // fait juste mentir la page. `essai_plan` et `created_at` aussi : sans
      // eux, un commerçant en essai de Vendre ne déclarerait rien (15/09).
      // `categorie` décide de la page que Google retient (lib/fiche-seo.js).
      // ⚠️ LES TROIS INTERRUPTEURS (15/10) : sans `rdv_actif`, aucune
      // réservation ne serait déclarée ; sans `commande_actif` ni
      // `livraison_actif`, une commande éteinte serait annoncée à Google.
      // 🔴 PLUS `adresse`, `latitude`, `longitude` (27/10) : c'est le SIÈGE
      // SOCIAL, et il partait chez Google. L'adresse publiée vient des lieux
      // (`getLieux`). Ne pas le lire, c'est ne plus pouvoir le publier.
      // `horaires_detail` et `ordre_categories` : la fiche écrite par le
      // serveur (lib/fiche-contenu-seo.js).
      .select('id, rdv_actif, commande_actif, livraison_actif, nom, description, logo_url, slug, type, categorie, telephone, horaires_detail, ordre_categories, plan, essai_plan, created_at')
      .eq('slug', slug)
      .maybeSingle()
    return data
  } catch {
    return null
  }
})

// Une commande peut-elle aller jusqu'au bout ? Sans cette preuve, le balisage
// ne déclare pas « Commander en ligne » (lib/action-google.js, 15/10).
export const getCommandeRealisable = cache(async (commercant) => {
  return lireCommandeRealisable(client(), commercant)
})

// Les lieux actifs d'un commerce : la seule adresse qu'on a le droit de publier.
// La lecture publique des lieux suit celle de la fiche (`commerce_lisible`).
const COLONNES_LIEU = 'id, commercant_id, type, libelle, adresse, latitude, longitude, principal, actif, jour_semaine, date_jour, heure_debut, heure_fin'
export const getLieux = cache(async (commercantId) => {
  if (!commercantId) return []
  try {
    const { data } = await client().from('commercant_lieux').select(COLONNES_LIEU)
      .eq('commercant_id', commercantId).eq('actif', true)
    return data || []
  } catch {
    return []
  }
})

// Ce que la fiche boutique montre : les articles actifs (même requête que
// `app/commander/[slug]/page.js`, `actif` est le seul filtre).
export const getArticles = cache(async (commercantId) => {
  if (!commercantId) return []
  try {
    const { data } = await client().from('articles').select('id, nom, prix, categorie, description, ordre')
      .eq('commercant_id', commercantId).eq('actif', true)
    return data || []
  } catch {
    return []
  }
})

// Ce que la fiche rendez-vous montre : les prestations actives non supprimées
// (même requête que `app/commander/rdv/[slug]/page.js`) et les formules
// affichées sur la fiche ou vendues en ligne.
export const getPrestations = cache(async (commercantId) => {
  if (!commercantId) return []
  try {
    const { data } = await client().from('rdv_prestations')
      .select('id, nom, prix, duree_minutes, ordre, created_at, par_couverts, jointure_de')
      .eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null)
      .order('ordre', { ascending: true }).order('created_at', { ascending: true })
    return data || []
  } catch {
    return []
  }
})

export const getFormules = cache(async (commercantId) => {
  if (!commercantId) return []
  try {
    const { data } = await client().from('abonnement_formules').select('id, libelle, ordre')
      .eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null)
      .or('vente_en_ligne.eq.true,affichee_fiche.eq.true')
      .order('ordre', { ascending: true })
    return data || []
  } catch {
    return []
  }
})

// Les communes et leurs codes postaux, pour ranger les commerces.
export const getCommunes = cache(async () => {
  try {
    const { data } = await client().from('communes').select('id, nom, codes_postaux')
    return data || []
  } catch {
    return []
  }
})

// Toutes les fiches publiées et leurs lieux PERMANENTS : de quoi ranger chaque
// commerce dans sa commune (lib/commerces-commune.js). La vue ne rend que les
// publiées, et la lecture des lieux suit la même règle.
export const getCommercesEtLieux = cache(async () => {
  try {
    const [{ data: commerces }, { data: lieux }] = await Promise.all([
      client().from('commercants_public').select('id, nom, slug, type, categorie, description, rdv_actif, plan, essai_plan, created_at'),
      client().from('commercant_lieux').select(COLONNES_LIEU).eq('actif', true).eq('type', 'permanent'),
    ])
    return { commerces: (commerces || []).filter(c => c.slug), lieux: lieux || [] }
  } catch {
    return { commerces: [], lieux: [] }
  }
})

// Les communes qui ont au moins un commerce publié, chacune avec ses commerces
// (lib/commerces-commune.js). Lu une fois par rendu, partagé par la fiche, les
// pages des communes et le plan du site.
export const getGroupesCommunes = cache(async () => {
  const [{ commerces, lieux }, communes] = await Promise.all([getCommercesEtLieux(), getCommunes()])
  return regrouperParCommune(commerces, lieux, communes)
})

// Agrégat des avis (note moyenne + nombre) pour aggregateRating schema.org.
// Les avis sont affichés sur la fiche → usage légitime des données structurées.
export const getAvisAgregat = cache(async (commercantId) => {
  if (!commercantId) return null
  try {
    const { data } = await client().from('avis_public').select('note').eq('commercant_id', commercantId)
    if (!data || data.length === 0) return null
    // ⚠️ MÊME SEUIL QUE L'ÉCRAN (lib/avis-affichage.js). Sans lui, la fiche
    // affichait « 1 avis » sans moyenne pendant que le balisage annonçait
    // « 4,0 sur 5 » à Google : deux vérités pour le même commerce, et c'est la
    // version Google qui finit dans les résultats de recherche.
    if (data.length < AVIS_MINIMUM_POUR_MOYENNE) return null
    const moyenne = data.reduce((acc, a) => acc + (a.note || 0), 0) / data.length
    return { moyenne: Math.round(moyenne * 10) / 10, count: data.length }
  } catch {
    return null
  }
})
