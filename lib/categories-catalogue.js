// DANS QUEL ORDRE LES CATÉGORIES D'UN CATALOGUE S'AFFICHENT.
//
// 🔴 POURQUOI ÇA EXISTE (Alex, 17/09). L'ordre des catégories était celui
// d'apparition des articles : un restaurateur ne pouvait pas mettre ses plats
// avant ses boissons, et il n'avait aucune prise dessus. Il n'existe pas de
// table des catégories, c'est un simple champ texte sur chaque article ; l'ordre
// voulu vit donc dans une liste de noms sur le commerçant,
// `commercants.ordre_categories`.
//
// ⚠️ FONCTION PURE, et c'est ce qui permet de la mesurer. La fiche l'appelle
// UNE fois et en tire À LA FOIS la barre d'onglets et les sections : deux
// calculs séparés finiraient par diverger, et c'est exactement le défaut qu'on
// vient de corriger sur cette même barre.

// Les catégories rangées d'abord, dans l'ordre voulu ; les autres à la suite,
// dans leur ordre d'origine.
//
// ⚠️ NE RIEN RANGER EST LE CAS NORMAL, PAS UN CAS D'ERREUR. Un commerçant qui
// n'a jamais ouvert cet écran a `null`, et il doit voir exactement ce qu'il
// voyait avant. Cette fonction rend donc la liste d'origine, intacte.
//
// ⚠️ ON COMPARE LES NOMS À L'IDENTIQUE, sans toucher aux accents ni à la casse.
// « Frites » et « frites » sont DEUX catégories distinctes pour la base, puisque
// le champ est libre : les confondre ici fusionnerait à l'écran deux sections
// qui existent séparément, et le commerçant ne comprendrait pas pourquoi.
//
// ⚠️ UNE CATÉGORIE RANGÉE MAIS VIDE DISPARAÎT SANS BRUIT. Le commerçant a pu
// supprimer ses derniers articles de « Glaces » : son nom reste dans la liste
// rangée, et il ne doit surtout pas fabriquer un onglet qui n'aurait aucune
// section en face. C'est ce décalage-là qui a fait rougir toute la barre.
export function categoriesOrdonnees(categories = [], ordreVoulu = null) {
  const presentes = Array.isArray(categories) ? categories : []
  if (!Array.isArray(ordreVoulu) || ordreVoulu.length === 0) return [...presentes]

  const disponibles = new Set(presentes)
  const rangees = []
  // ⚠️ `vues` DÉDOUBLONNE LA LISTE RANGÉE. Deux fois le même nom produirait deux
  // fois la même section, donc deux ancres au même endroit, et la barre
  // choisirait au hasard.
  const vues = new Set()
  for (const nom of ordreVoulu) {
    if (!disponibles.has(nom) || vues.has(nom)) continue
    vues.add(nom)
    rangees.push(nom)
  }

  const reste = presentes.filter(nom => !vues.has(nom))
  return [...rangees, ...reste]
}

// Ce qu'on propose au commerçant dans son écran de tri : ses catégories
// actuelles, déjà dans l'ordre qu'il a choisi, prêtes à être déplacées.
//
// ⚠️ C'EST LA MÊME RÈGLE, PAS UNE COPIE. L'écran de réglage et la fiche
// publique doivent montrer le même ordre, sinon le commerçant range une liste
// et ses clients en voient une autre.
export function listeAOrdonner(categoriesExistantes = [], ordreVoulu = null) {
  return categoriesOrdonnees(categoriesExistantes, ordreVoulu)
}

// La liste à ENREGISTRER après un déplacement. On ne garde que des noms qui
// existent vraiment : une liste qui traîne des catégories supprimées grossit
// à chaque saison et ne dit plus rien de lisible.
//
// ⚠️ RENDRE `null` PLUTÔT QU'UN TABLEAU VIDE quand il n'y a rien à ranger.
// NULL veut dire « je n'ai rien rangé » ; un tableau vide voudrait dire « j'ai
// rangé zéro catégorie devant », et les deux méritent de rester distincts en
// base le jour où on voudra les traiter autrement.
export function ordrePourEnregistrer(nouvelOrdre = [], categoriesExistantes = []) {
  const existent = new Set(Array.isArray(categoriesExistantes) ? categoriesExistantes : [])
  const vues = new Set()
  const propre = []
  for (const nom of (Array.isArray(nouvelOrdre) ? nouvelOrdre : [])) {
    if (!existent.has(nom) || vues.has(nom)) continue
    vues.add(nom)
    propre.push(nom)
  }
  return propre.length > 0 ? propre : null
}
