// CE QUE LA RÈGLE NE LIT PAS ELLE-MÊME : combien d'articles, de prestations,
// de photos et de lieux situés une fiche porte vraiment.
//
// ⚠️ SERVEUR SEULEMENT : le client passé ici est celui de la clé de service,
// qui ignore la RLS. Chaque route qui l'appelle a vérifié QUI appelle avant.
//
// 🔴 UNE ERREUR DE LECTURE N'EST PAS UN ZÉRO. Si le comptage échoue, on le dit
// et on s'arrête : compter zéro article à tort ferait relancer un commerçant
// pour un catalogue qu'il a rempli, ou refuser une publication méritée.
//
// ⚠️ UN COMPTE PAR FICHE, JAMAIS UNE LISTE DE LIGNES. Lire toutes les lignes
// d'articles de vingt commerces tombe sur la limite de mille lignes de
// Supabase, et la troncature est MUETTE : le dernier commerce paraîtrait vide.

import { ficheComplete, COLONNES_FICHE_COMPLETE } from './fiche-complete'

async function compter(requete, quoi) {
  const { count, error } = await requete
  if (error) throw new Error(`comptage des ${quoi} impossible : ${error.message}`)
  return count || 0
}

export async function comptesDeLaFiche(admin, commercantId) {
  const [articles, prestations, photos, lieux] = await Promise.all([
    compter(admin.from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId).eq('actif', true), 'articles'),
    compter(admin.from('rdv_prestations')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null), 'prestations'),
    compter(admin.from('commercant_photos')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId).not('url', 'is', null), 'photos'),
    // « Où me trouver » : un lieu actif ET situé. Sans position, il n'y a ni
    // distance sur la card ni point de départ de livraison.
    compter(admin.from('commercant_lieux')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId).eq('actif', true).not('latitude', 'is', null).not('longitude', 'is', null), 'lieux'),
  ])
  return { nbCatalogue: articles + prestations, nbPhotos: photos, nbLieuxSitues: lieux }
}

// Charge la fiche et rend `{ commercant, bilan }`, ou lève si la lecture échoue.
// Rend `{ commercant: null }` quand la fiche n'existe pas.
export async function bilanDeLaFiche(admin, commercantId, maintenant = new Date()) {
  const { data: commercant, error } = await admin
    .from('commercants')
    .select(COLONNES_FICHE_COMPLETE)
    .eq('id', commercantId)
    .maybeSingle()
  if (error) throw new Error(`lecture de la fiche impossible : ${error.message}`)
  if (!commercant) return { commercant: null, bilan: null }
  const comptes = await comptesDeLaFiche(admin, commercantId)
  return { commercant, bilan: ficheComplete({ commercant, ...comptes, maintenant }) }
}
