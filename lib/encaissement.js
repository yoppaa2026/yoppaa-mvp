// CE QUE « LE CLIENT A PAYÉ » ÉCRIT, POUR UN RENDEZ-VOUS OU UNE COMMANDE (29/09).
//
// La règle vivait en ligne dans `app/dashboard/page.js`, deux fois (un
// rendez-vous honoré, une commande remise). Le Poste équipe l'applique à son
// tour, côté SERVEUR cette fois : elle vit donc ici, et le montant vient du
// reste à encaisser calculé sur la ligne relue en base, jamais d'un nombre
// envoyé par l'écran.
//
// Les choix sont ceux du tableau de bord (`questionEncaissement`) :
//   terminal       payé à la caisse par carte
//   especes        payé en espèces
//   sans_paiement  le client est venu et n'a pas payé (écrit `rien`, 0 €)

export const CHOIX_ENCAISSEMENT = ['terminal', 'especes', 'sans_paiement']

/**
 * @param {object} o
 * @param {string|null} o.choix   un des CHOIX_ENCAISSEMENT
 * @param {number|null} o.reste   le reste à encaisser (resteAEncaisser…)
 * @param {Date} [o.maintenant]
 * @returns {{ champs: object|null, refus: string|null }}
 *   `champs` null quand il n'y a rien à encaisser : on n'écrit alors AUCUNE
 *   colonne d'encaissement, comme le tableau de bord.
 */
export function champsEncaissement({ choix = null, reste = null, maintenant = new Date() } = {}) {
  if (!(Number(reste) > 0)) return { champs: null, refus: null }
  if (!CHOIX_ENCAISSEMENT.includes(choix)) {
    return { champs: null, refus: 'Dis comment le client a payé : terminal, espèces, ou sans paiement.' }
  }
  const rien = choix === 'sans_paiement'
  return {
    champs: {
      encaisse_mode: rien ? 'rien' : choix,
      encaisse_montant: rien ? 0 : Math.round(Number(reste) * 100) / 100,
      encaisse_le: maintenant.toISOString(),
    },
    refus: null,
  }
}
