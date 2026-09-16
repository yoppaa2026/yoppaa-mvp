// CE QU'ON FAIT D'UN ÉVÉNEMENT STRIPE DÉJÀ VU.
//
// 🔴 LE REJEU DE STRIPE ÉTAIT AVALÉ (16/09, essai E4 d'Alex : la table garantie
// n'est jamais née et aucun email n'est parti). Le verrou d'idempotence du
// webhook est posé AVANT le traitement, et la condition de sortie ne regardait
// pas le statut — il était pourtant sélectionné juste au-dessus, lu et jamais
// utilisé. Donc : premier essai en échec → `status = 'error'` → 500 rendu pour
// que Stripe rejoue → et le rejeu repartait avec « event déjà traité, skip ».
//
// 🔴 CE N'ÉTAIT PAS UN DÉFAUT DE L'EMPREINTE, MAIS DE TOUS LES FLUX. Plusieurs
// handlers lèvent EXPRÈS pour obtenir un rejeu (acompte, commande, bon cadeau,
// abonnement) : aucun de ces rejeux ne pouvait aboutir. Une seule défaillance
// passagère perdait la réservation DÉFINITIVEMENT, sans prévenir personne.
//
// ⚠️ SORTI DE LA ROUTE POUR ÊTRE EXÉCUTÉ AU BANC. Une garde qui cherche cette
// condition dans le fichier trouve son jumeau dans la condition voisine et
// reste verte quand on casse la bonne. Ici, la règle se joue.

// Rend 'traiter' (jamais vu), 'reprendre' (vu, et ÉCHOUÉ) ou 'sauter'.
//
// ⚠️ `=== 'error'` ET RIEN D'AUTRE : un statut absent, inconnu ou nul se traite
// comme un succès. Rejouer ce qu'on ne comprend pas est plus dangereux que de
// ne pas le rejouer, parce qu'au bout d'un rejeu il y a de l'argent.
export function decisionRejeu(existant) {
  if (!existant) return 'traiter'
  return existant.status === 'error' ? 'reprendre' : 'sauter'
}
