// LES DATES DU PLAN DU SITE (17/10). Voir app/sitemap.js pour le pourquoi.
// ⚠️ MODULE PUR.

// La date la plus récente d'une liste de lignes, ou `undefined` (pas de date :
// mieux vaut ne rien annoncer qu'une date fausse).
export function plusRecente(lignes = []) {
  const temps = (Array.isArray(lignes) ? lignes : [])
    .map(l => new Date(l?.created_at).getTime())
    .filter(Number.isFinite)
  return temps.length ? new Date(Math.max(...temps)) : undefined
}
