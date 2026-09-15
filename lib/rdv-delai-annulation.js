// JUSQU'À QUAND ON PEUT ANNULER, ET CE QUI SE PASSE APRÈS.
//
// 🔴 LE DÉFAUT QUE CE FICHIER CORRIGE, TROUVÉ LE 14/09 EN PRÉPARANT L'EMPREINTE.
// Le délai vivait en CINQ copies, et trois d'entre elles étaient fausses de la
// même façon : `rdv_delai_annulation_heures || 24`. Un commerçant qui règle
// ZÉRO, c'est-à-dire « on peut annuler jusqu'au dernier moment », voyait son
// zéro transformé en vingt-quatre heures. L'email de confirmation, le rappel de
// 9 h et le webhook annonçaient donc au client une règle que la route
// d'annulation, elle, n'appliquait pas : elle utilisait `?? 24`, qui garde le
// zéro. On lui disait vingt-quatre, on lui en appliquait zéro. Le piège du
// zéro, neuvième fois.
//
// ⚠️ ET LE DÉFAUT NE PEUT PAS ÊTRE LE MÊME PARTOUT. Vingt-quatre heures est
// raisonnable chez un coiffeur, qui remplit un créneau annulé la veille. Sur
// une table, c'est un piège : personne ne sait la veille à midi qu'il ne dînera
// pas le soir, et un délai trop long ne protège pas le restaurateur, il fait
// débiter des gens de bonne foi. Chaque débit de bonne foi revient en
// contestation de carte, que Stripe tranche contre nous.
//
// L'enquête chez les spécialistes donne le même ordre de grandeur : Zenchef
// prend TROIS HEURES avant le service comme exemple de référence (réservation à
// midi, annulation libre jusqu'à 9 h). C'est le défaut retenu ici, décision
// d'Alex du 14/09.
//
// ⚠️ CE N'EST QU'UN DÉFAUT. Dès que le commerçant a posé sa valeur, elle prime,
// y compris zéro. Ce fichier ne décide que pour une colonne VIDE.

import { brusselsInstant } from './timezone'

// Le coiffeur, l'esthéticienne, le kiné : un créneau annulé la veille se
// remplit encore.
export const DELAI_DEFAUT_VITRINE = 24
// La table : assez court pour qu'un client de bonne foi ait le temps de
// prévenir, assez long pour que le restaurateur puisse la remplir.
export const DELAI_DEFAUT_TABLE = 3

// ⚠️ LA CATÉGORIE, PAS LE MÉTIER. Côté alimentaire, le module de rendez-vous
// SERT la table : c'est la logique du produit depuis le premier jour. Une
// boulangerie ne prend pas de rendez-vous.
export function delaiAnnulationHeures(commercant) {
  const regle = commercant?.rdv_delai_annulation_heures
  // ⚠️ `??` ET JAMAIS `||` : c'est toute la raison d'être de ce fichier.
  if (regle !== null && regle !== undefined && Number.isFinite(Number(regle))) {
    return Math.max(0, Number(regle))
  }
  return commercant?.categorie === 'alimentaire' ? DELAI_DEFAUT_TABLE : DELAI_DEFAUT_VITRINE
}

// Les bornes du réglage, les mêmes que celles du formulaire d'administration
// depuis toujours : jusqu'à une semaine.
export const DELAI_MIN = 0
export const DELAI_MAX = 168

// ⚠️ ZÉRO EST UNE VALEUR, PAS UN VIDE : « on peut annuler jusqu'au dernier
// moment » est un choix que le restaurateur a le droit de faire, et c'est
// exactement celui que les `|| 24` écrasaient.
export function validerDelai(saisie) {
  const texte = String(saisie ?? '').trim()
  if (texte === '') return { ok: true, valeur: null }
  const n = Math.floor(Number(texte.replace(',', '.')))
  if (!Number.isFinite(n)) return { ok: false, message: 'Écris un nombre d’heures.' }
  if (n < DELAI_MIN || n > DELAI_MAX) {
    return { ok: false, message: `Entre ${DELAI_MIN} et ${DELAI_MAX} heures.` }
  }
  return { ok: true, valeur: n }
}

// L'instant précis après lequel l'annulation devient tardive. En heure murale
// de Bruxelles, changements d'heure compris : sans ça la limite tombait une
// heure trop tôt en hiver et pénalisait le client.
export function limiteAnnulation(rdv, commercant) {
  if (!rdv?.date_rdv || !rdv?.heure_debut) return null
  const debut = brusselsInstant(rdv.date_rdv, rdv.heure_debut)
  return new Date(debut.getTime() - delaiAnnulationHeures(commercant) * 3600 * 1000)
}

// 🔴 ET LA PORTE NE SE FERME PLUS (14/09). Jusqu'ici, passé le délai, la route
// REFUSAIT d'annuler et renvoyait le client vers le téléphone. Avec une
// empreinte, ce refus se retourne contre tout le monde : le client qui ne peut
// pas annuler NE PRÉVIENT PAS, la table reste bloquée toute la soirée, et le
// restaurateur débite une absence qu'il aurait pu remplir. Les spécialistes ne
// ferment pas la porte non plus : chez eux la réservation devient « annulée
// tardivement », débitable comme un no-show. On fait pareil.
export function estAnnulationTardive(rdv, commercant, maintenant = new Date()) {
  const limite = limiteAnnulation(rdv, commercant)
  return limite ? maintenant > limite : false
}

// ─── CE QUE DEVIENT UNE ANNULATION HORS DÉLAI (15/09) ───────────────────────
//
// 🔴 LA PORTE S'OUVRE AUX TABLES, ET À ELLES SEULES. Le refus après le délai
// protège deux choses qui existent vraiment ailleurs :
//   • l'ACOMPTE d'un salon, qui n'est plus remboursé passé le délai ;
//   • la SÉANCE d'un abonnement : « annulée » y veut dire « annulée à temps »,
//     et une cliente qui prévient une heure avant ne récupère pas sa séance
//     (garde de `verif-abonnements`, décision du 15/08).
// Une TABLE n'a ni prix, ni acompte, ni séance : lui refuser l'annulation ne
// protège rien. Ça empêche seulement le client de prévenir, et la table reste
// vide toute la soirée. Chez les spécialistes, elle devient « annulée
// tardivement » ; ici aussi, et c'est ce qui la rend facturable si une
// empreinte la garantit.
//
// ⚠️ UNE TABLE POSÉE SUR UN ABONNEMENT RESTE UNE SÉANCE, et suit la règle des
// séances. Le cas n'existe pas aujourd'hui (on ne vend pas de carnet de
// tables), et c'est justement pour qu'il ne devienne pas un trou le jour où il
// existera.
export function decisionAnnulation(rdv, commercant, maintenant = new Date()) {
  const delaiH = delaiAnnulationHeures(commercant)
  const limite = limiteAnnulation(rdv, commercant)
  const horsDelai = limite ? maintenant > limite : false
  const tardiveAdmise = rdv?.prestation?.par_couverts === true && !rdv?.abonnement_id
  return {
    delaiH,
    limite,
    tardive: horsDelai && tardiveAdmise,
    refus: horsDelai && !tardiveAdmise,
  }
}
