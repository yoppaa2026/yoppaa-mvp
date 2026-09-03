// Comparer du texte comme les gens le tapent.
//
// ⚠️ POURQUOI ÇA EXISTE. Personne ne tape la majuscule accentuée sur un clavier
// de téléphone. « epicerie » ne rendait aucun résultat là où « Épicerie » en
// rendait, et « chatelet » ne trouvait pas « Châtelet ». On retire les accents
// des DEUX CÔTÉS de la comparaison, jamais des libellés affichés.
//
// ⚠️ CETTE FONCTION VIVAIT RECOPIÉE EN TROIS EXEMPLAIRES IDENTIQUES
// (`app/commander/page.js`, `app/admin/SectionCommunes.js`,
// `app/admin/SectionSuggestions.js`). Trois copies, c'est trois endroits à
// corriger le jour où la règle change, et deux qu'on oublie.
//
// ⚠️ ET ELLE NE RAMASSE PAS TOUT CE QUI CONTIENT UN `normalize('NFD')`. Trois
// AUTRES fonctions du dépôt partagent cette ligne sans faire le même travail :
// `cleCommerce` (lib/suggestions.js) ramène à des mots séparés par des espaces,
// et deux `slugify` fabriquent une adresse à tirets. Les fondre ici aurait
// changé leur résultat. Elles restent où elles sont ; les deux `slugify`, eux,
// sont de vrais jumeaux et attendent leur tour.

export function sansAccents(valeur) {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
