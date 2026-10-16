// LES CŒURS SERVENT ENFIN À QUELQU'UN (16/10 soir).
//
// ✅ ALEX, 16/10 soir (tableau, les quatre) : « Le cœur sert à quoi ? ».
// Jusqu'ici, un compteur anonyme par téléphone, visible seulement dans la fiche
// d'un article : le Yopper ne retrouvait pas ses cœurs, les autres ne les
// voyaient pas, le commerçant non plus. Désormais :
//   • le badge « Coup de cœur » sur l'article le plus aimé du commerce ;
//   • le compteur ne s'affiche qu'à partir de 3 (« 1 » fait vide) ;
//   • « Tes coups de cœur » en tête de la carte, pour recommander vite ;
//   • « Les plus aimés » dans les statistiques du commerçant.
//
// ⚠️ MODULE PUR : il reçoit les compteurs déjà lus.

export const SEUIL_COUP_DE_COEUR = 3

// Le compteur à afficher, ou null (sous le seuil, on écrit « J'aime »).
export function compteurAffiche(n) {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) && v >= SEUIL_COUP_DE_COEUR ? v : null
}

/**
 * Les articles qui portent le badge : le plus aimé du commerce, à partir du
 * seuil. Un ex aequo partage le badge (deux articles aimés autant, c'est vrai
 * des deux), mais jamais plus de deux : un badge sur toute la carte ne
 * distingue plus rien.
 * @param compteurs  { [articleId]: nombre }
 * @returns Set d'identifiants (en texte)
 */
export function coupsDeCoeur(compteurs) {
  const lignes = Object.entries(compteurs && typeof compteurs === 'object' ? compteurs : {})
    .map(([id, n]) => [String(id), Math.floor(Number(n))])
    .filter(([, n]) => Number.isFinite(n) && n >= SEUIL_COUP_DE_COEUR)
  if (lignes.length === 0) return new Set()
  const max = Math.max(...lignes.map(([, n]) => n))
  const tete = lignes.filter(([, n]) => n === max)
  return tete.length > 2 ? new Set() : new Set(tete.map(([id]) => id))
}

// Les plus aimés, pour le commerçant : du plus aimé au moins aimé, sans zéro.
// ⚠️ Le commerçant voit TOUT, seuil compris : un « 1 » lui dit déjà quelque chose.
export function plusAimes(compteurs, articles = [], limite = 5) {
  const nomDe = new Map((Array.isArray(articles) ? articles : []).map(a => [String(a.id), a.nom]))
  return Object.entries(compteurs && typeof compteurs === 'object' ? compteurs : {})
    .map(([id, n]) => ({ id: String(id), nom: nomDe.get(String(id)), n: Math.floor(Number(n)) }))
    .filter(l => l.nom && Number.isFinite(l.n) && l.n > 0)
    .sort((a, b) => b.n - a.n || String(a.nom).localeCompare(String(b.nom), 'fr'))
    .slice(0, limite)
}

// Les articles aimés par ce téléphone, dans l'ordre de la carte, encore en vente.
export function mesCoupsDeCoeur(articles = [], aimes = []) {
  const set = new Set((Array.isArray(aimes) ? aimes : []).map(String))
  return (Array.isArray(articles) ? articles : []).filter(a => a && set.has(String(a.id)))
}
