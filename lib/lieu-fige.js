// OÙ A LIEU CE RENDEZ-VOUS, ET COMMENT ON LE GRAVE.
//
// ⚠️ LE PARCOURS RENDEZ-VOUS ENVOYAIT LES CLIENTS AU SIÈGE SOCIAL. L'email de
// confirmation, le rappel de la veille et l'écran « Mes rendez-vous »
// affichaient tous `commercants.adresse`, sans jamais consulter les lieux. Pour
// une commerçante inscrite à son domicile mais qui donne cours en salle, cela
// veut dire envoyer un inconnu CHEZ ELLE. C'est exactement le défaut que le
// module LIEUX devait corriger, et il survivait intact sur tout ce parcours.
//
// ⚠️ ET ON FIGE, on ne recalcule pas. Décision d'Alex du 13/08 : un commerçant
// ne peut PAS déplacer un emplacement qui porte des rendez-vous, il doit
// d'abord les annuler et inviter ses clients à reprendre place. Le lieu gravé
// dans la réservation est ce qui rend ce verrou vérifiable, et ce qui fait
// qu'un rendez-vous d'il y a six mois dit encore où il a eu lieu, même si
// l'emplacement a été supprimé depuis. La table fige déjà le nom, le téléphone
// et le taux de TVA selon le même principe.
//
// Trois écrans créent un rendez-vous : la réservation par le client, le
// webhook Stripe quand il y a un acompte, et la création par le commerçant.
// Les trois passent par ici, sans quoi l'un d'eux graverait autre chose que
// les deux autres.

import { lieuALHeure, libelleLieu } from './lieux-activite'

// L'ADRESSE À ANNONCER pour un rendez-vous : celle où le client doit se rendre.
//
// ⚠️ UNE SEULE FONCTION POUR TOUS LES CANAUX. L'email de confirmation, le
// rappel de la veille, « Mes rendez-vous » et le fichier de calendrier disaient
// la même chose de quatre endroits différents, tous branchés sur
// `commercants.adresse`. Corrigés un par un, ils auraient divergé.
//
// Le lieu gravé gagne. À défaut, le siège social, ce qui reste juste pour
// l'immense majorité des commerces et pour tous les rendez-vous antérieurs à
// la bascule du 13/08.
export function adresseRendezVous(rdv) {
  const grave = libelleLieu({ libelle: rdv?.lieu_libelle, adresse: rdv?.lieu_adresse })
  return grave || rdv?.commercant?.adresse || ''
}

// Les colonnes à ajouter au payload d'une réservation ou d'une commande.
// Rend un objet vide plutôt que des `null` : on n'écrase pas ce qu'on ne sait
// pas, et un commerce sans lieu déclaré doit continuer de fonctionner.
export function champsLieu(lieu) {
  if (!lieu) return {}
  return {
    lieu_id: lieu.id ?? null,
    lieu_libelle: lieu.libelle ?? null,
    lieu_adresse: lieu.adresse ?? null,
  }
}

// Résout le lieu et rend directement les colonnes à graver.
//
// `client` est un client Supabase, celui de la page ou celui du serveur : la
// lecture des lieux est publique, les deux conviennent. En cas d'échec on rend
// un objet vide, jamais une exception : une réservation ne doit pas échouer
// parce que la table des lieux n'a pas répondu.
export async function champsLieuPour(client, commercant, { jour, heure } = {}) {
  if (!client || !commercant?.id) return {}
  try {
    const { data } = await client
      .from('commercant_lieux')
      .select('id, type, jour_semaine, date_jour, libelle, adresse, latitude, longitude, heure_debut, heure_fin, principal, actif')
      .eq('commercant_id', commercant.id)
      .eq('actif', true)
    return champsLieu(lieuALHeure({ commercant, lieux: data || [], jour, heure }))
  } catch {
    return {}
  }
}
