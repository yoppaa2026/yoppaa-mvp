// LE CALENDRIER DE COMMANDE D'UN COMMERCE, LU EN BASE (10/10).
//
// 🔴 LA FENÊTRE D'ENCODAGE AVAIT SON PROPRE CALENDRIER (trouvé par Alex,
// 10/10) : « Aujourd'hui », « Demain » et une date libre sans limite, alors
// que la fiche et le tableau de bord montrent l'horizon du commerce. Le
// commerçant voyait deux calendriers pour la même boutique.
//
// LA MÊME LONGUEUR QUE LA FICHE ET QUE `create-commande` : `longueurCalendrier`,
// lue sur TOUT le catalogue actif hors vitrine (jamais le panier), avec les
// jours de vente (`article_stock_jour`). Les jours de fermeture se sautent
// (`estFermeExceptionnellement`), comme sur la fiche.
//
// Ce module lit la base ; la règle reste pure (`longueurCalendrier`, et
// `joursDuCalendrier` / `horsCalendrier` dans lib/commande-encodee.js).

import { longueurCalendrier, delaiEnJours } from './delai-commande.js'
import { circuitsDeLArticle } from './stock-article.js'
import { COLONNES_EXCEPTIONS, exceptionsPour } from './horaires-du-jour.js'

/**
 * @param commercant { id, categorie, horizon_commande, commande_veille_avant }
 *   ⚠️ `commande_veille_avant` (20/10) : passé l'heure limite de la veille, le
 *   calendrier gagne un jour, comme sur la fiche. Absente, il ne bouge pas.
 * @returns {Promise<{ ok: true, longueur: number, fermetures: object[] } | { ok: false }>}
 *   ⚠️ Une lecture ratée rend `ok: false`, jamais un calendrier inventé.
 */
export async function calendrierDuCommerce({ supabase, commercant }) {
  const [{ data: catalogue, error: errCat }, { data: off, error: errOff }, { data: fermetures, error: errF }] = await Promise.all([
    supabase.from('articles').select('id, delai_minutes, horizon_jours, vente_jour, commande_active, stock_mode, est_vitrine')
      .eq('commercant_id', commercant.id).eq('actif', true),
    supabase.from('article_stock_jour').select('article_id, jour_semaine').eq('commercant_id', commercant.id).eq('actif', false),
    // ⚠️ AVEC LES PLAGES (16/10) : un jour d'horaires adaptés n'est pas fermé.
    supabase.from('fermetures_exceptionnelles').select(COLONNES_EXCEPTIONS).eq('commercant_id', commercant.id),
  ])
  if (errCat || errOff || errF) return { ok: false }
  const offParArticle = {}
  for (const o of off || []) (offParArticle[o.article_id] ||= []).push(o.jour_semaine)
  const longueur = longueurCalendrier({
    horizon: commercant.horizon_commande,
    articles: (catalogue || []).filter(a => !a.est_vitrine).map(a => ({
      delaiJours: delaiEnJours(a), indispo: offParArticle[a.id] || [], horizonJours: a.horizon_jours, circuits: circuitsDeLArticle(a, commercant),
    })),
  })
  // ✅ 16/10 soir : seulement ce qui ferme les COMMANDES.
  return { ok: true, longueur, fermetures: exceptionsPour(fermetures, 'commandes') }
}
