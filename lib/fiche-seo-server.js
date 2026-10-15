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
      .select('id, rdv_actif, commande_actif, livraison_actif, nom, description, logo_url, adresse, slug, type, categorie, telephone, latitude, longitude, plan, essai_plan, created_at')
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
