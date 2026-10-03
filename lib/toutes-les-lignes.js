// LIRE TOUTES LES LIGNES, PAS LES MILLE PREMIÈRES (B3, audit du 03/10).
//
// 🔴 LE PLAFOND QUE PERSONNE NE VOIT. Supabase rend au plus 1 000 lignes par
// requête, SANS ERREUR ET SANS LE DIRE : la réponse a simplement l'air
// complète. L'agenda d'un studio qui vend des abonnements à l'année y arrive
// vite (une trentaine d'abonnées à 36 séances), et ce qui dépasse disparaît :
// des séances absentes de l'agenda, et des soldes calculés sur une partie des
// réservations, donc une séance de trop accordée.
//
// ⚠️ LA REQUÊTE SE RECONSTRUIT À CHAQUE PAGE. Un constructeur Supabase ne sert
// qu'une fois : `construire` est donc une fonction qui en rend un neuf.
// ⚠️ ET SON ORDRE DOIT ÊTRE TOTAL (un `.order('id')` en dernier). Deux lignes à
// la même date et à la même heure peuvent sinon changer de page entre deux
// lectures : l'une est lue deux fois, l'autre jamais.
// ⚠️ UNE PAGE EN ÉCHEC REND `data: null`, jamais une liste partielle : la moitié
// d'un agenda présentée comme l'agenda entier est exactement le défaut corrigé.
//
// Fichier PUR : il s'exécute au banc avec un faux constructeur.

export const TAILLE_PAGE = 1000
// Garde-fou contre une boucle sans fin : 50 000 lignes. Au-delà, on le dit.
export const PAGES_MAX = 50

export async function toutesLesLignes(construire, { taille = TAILLE_PAGE, pagesMax = PAGES_MAX } = {}) {
  const lignes = []
  for (let page = 0; page < pagesMax; page++) {
    const de = page * taille
    const { data, error } = await construire().range(de, de + taille - 1)
    if (error) return { data: null, error }
    const lot = data || []
    lignes.push(...lot)
    if (lot.length < taille) return { data: lignes, error: null }
  }
  return { data: null, error: { message: 'trop_de_lignes' } }
}
