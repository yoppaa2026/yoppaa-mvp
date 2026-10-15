// UNE COMMANDE PEUT-ELLE ALLER JUSQU'AU BOUT CHEZ CE COMMERCE ? (15/10)
//
// La fiche répond à cette question avec ce qu'elle a déjà chargé
// (`commandeRealisable`, lib/plans.js). La règle Google, elle, vit dans des
// pages qui n'ont chargé ni les articles ni les créneaux : le balisage des
// fiches, la page kit, le tableau de bord. Elles lisent ici, avec LEUR client
// Supabase (public, service ou commerçant connecté), les trois choses qui
// décident, puis passent par la MÊME règle que la fiche.
//
// 🔴 POURQUOI C'EST NÉCESSAIRE (Alex, 15/10) : le Bistrologue, interrupteur des
// commandes allumé mais aucun créneau de retrait et ses articles en vitrine,
// annonçait « Commander en ligne » à Google. Le forfait et l'interrupteur
// disent ce qu'il a le droit et l'envie de faire, pas ce qui est possible.
//
// ⚠️ UNE LECTURE QUI ÉCHOUE FERME. Ailleurs, une lecture manquante ouvre
// (`commandeAllumee`). Ici on parle à Google : déclarer une commande qu'on
// n'a pas pu vérifier, c'est risquer de promettre ce que personne ne tient.

import { commandeRealisable, isAlimentaire } from './plans.js'
import { livraisonDisponible } from './zone-etoile.js'

/**
 * @param supabase    un client Supabase capable de lire ce commerce
 * @param commercant  { id, categorie, livraison_actif }
 * @returns {Promise<boolean>}
 */
export async function lireCommandeRealisable(supabase, commercant) {
  if (!supabase || !commercant?.id) return false
  try {
    const [art, cre, liv] = await Promise.all([
      supabase.from('articles').select('actif, est_vitrine, prix').eq('commercant_id', commercant.id).eq('actif', true),
      supabase.from('creneaux').select('id').eq('commercant_id', commercant.id).eq('actif', true).limit(1),
      commercant.livraison_actif
        ? supabase.from('livraison_config').select('codes_postaux, zone_rayons_m').eq('commercant_id', commercant.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (art.error || cre.error || liv.error) return false
    return commandeRealisable({
      alimentaire: isAlimentaire(commercant),
      articles: art.data || [],
      creneaux: cre.data || [],
      livraisonDispo: livraisonDisponible(commercant, liv.data),
    })
  } catch {
    return false
  }
}
