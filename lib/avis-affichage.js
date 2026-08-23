// COMMENT LES AVIS SE MONTRENT SUR UNE FICHE.
//
// ⚠️ DEMANDE D'ALEX, 22/08 : « il faut que les avis puissent être consultés
// depuis un déroulant, tout ne doit pas être affiché en permanence, ça prend
// trop de place. Une note globale et le Yopper choisit s'il veut voir plus. »
//
// Un commerce qui a bien travaillé se retrouvait puni par son propre succès :
// seize avis dépliés poussaient le panier et les créneaux hors de l'écran, et
// le Yopper venu commander devait faire défiler à travers des compliments.
//
// ⚠️ ET UNE NOTE N'EST PAS UNE INFORMATION SANS SON NOMBRE. « 4,8 » ne veut
// rien dire : sur deux avis c'est du bruit, sur soixante c'est une réputation.
// Les deux vont toujours ensemble (feedback_information_complete).

// En dessous, la moyenne ne dit rien de fiable et l'afficher en grand la
// donnerait pour telle. On montre alors les avis eux-mêmes, qui se lisent.
export const AVIS_MINIMUM_POUR_MOYENNE = 3

/**
 * Ce qu'on affiche en tête du bloc d'avis.
 *
 * @param {{moyenne:number, count:number}} notesInfo
 * @returns {{aDesAvis:boolean, montreMoyenne:boolean, moyenne:string|null,
 *            libelleNombre:string, libelleBouton:string|null}}
 */
export function resumeAvis({ moyenne = 0, count = 0 } = {}) {
  const n = Number(count) || 0
  const m = Number(moyenne) || 0

  if (n <= 0) {
    return {
      aDesAvis: false,
      montreMoyenne: false,
      moyenne: null,
      // ⚠️ ON NE DIT PAS « 0 AVIS », qui se lit comme un reproche sur une fiche
      // toute neuve. Même raisonnement que le compteur du kit le 21/08.
      libelleNombre: 'Pas encore d’avis',
      libelleBouton: null,
    }
  }

  const montreMoyenne = n >= AVIS_MINIMUM_POUR_MOYENNE
  return {
    aDesAvis: true,
    montreMoyenne,
    // Une décimale, jamais deux : « 4,83 » donne une précision que trois avis
    // ne portent pas.
    moyenne: montreMoyenne ? m.toFixed(1).replace('.', ',') : null,
    libelleNombre: n === 1 ? '1 avis' : `${n} avis`,
    libelleBouton: n === 1 ? 'Lire l’avis' : `Lire les ${n} avis`,
  }
}

/**
 * Le libellé du bouton, selon qu'on est déplié ou non.
 *
 * ⚠️ LE BOUTON DIT LE GESTE, pas l'état : « Masquer » se comprend d'un coup
 * d'œil, « Avis (16) » laisse deviner (feedback_boutons_qui_disent_le_geste).
 */
export function libelleBascule(resume, deplie) {
  if (!resume?.aDesAvis) return null
  return deplie ? 'Masquer les avis' : resume.libelleBouton
}
