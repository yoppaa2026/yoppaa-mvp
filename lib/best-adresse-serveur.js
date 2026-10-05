// LIRE LE RÉFÉRENTIEL BeSt, CÔTÉ SERVEUR SEULEMENT.
//
// Les tables `best_rues` et `best_adresses` n'ont aucune policy : seule la clé
// de service les lit (MIGRATION_BEST_ADRESSES.sql). Ce module est le seul
// endroit qui les interroge ; la route de recherche ET la création de commande
// passent par lui, pour qu'une adresse « trouvée » à l'écran soit exactement
// celle que le serveur retrouve au paiement.
//
// Les règles pures (normalisation, estimation) vivent dans lib/best-adresse.js.

import { normaliserNumero } from './best-adresse.js'

// PostgREST rend au plus 1 000 lignes par appel, quoi qu'on demande. Un code
// postal de grande ville dépasse ce nombre de rues : on lit par pages.
const PAGE = 1000

/**
 * Les rues d'un code postal, triées par nom. `null` si la lecture échoue :
 * l'appelant doit le dire, une liste vide voudrait dire « aucune rue ici ».
 */
export async function ruesDuCodePostal(supabase, codePostal) {
  const cp = String(codePostal ?? '').trim()
  if (!/^\d{4}$/.test(cp)) return []
  const toutes = []
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await supabase
      .from('best_rues')
      .select('rue_id, nom, nom_recherche, localite')
      .eq('code_postal', cp)
      .order('nom_recherche', { ascending: true })
      .order('rue_id', { ascending: true })
      .range(debut, debut + PAGE - 1)
    if (error) {
      console.error('[best] lecture des rues KO', error.message)
      return null
    }
    toutes.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return toutes
}

/**
 * Situe UNE maison. Rend :
 *   { ok: true, trouvee: true, lat, lng, estimee, rue, localite, numero }
 *   { ok: true, trouvee: false }      la maison n'est pas dans le référentiel
 *   { ok: false }                     la base n'a pas répondu
 *
 * ⚠️ LE NUMÉRO EST NORMALISÉ ICI, comme à l'import (« 6 a » = « 6A »). Sans
 * cela, une adresse rangée sous « 6A » serait « introuvable » pour qui tape
 * « 6a », et la livraison refusée pour une majuscule.
 */
export async function situerMaison(supabase, { rueId, codePostal, numero } = {}) {
  const rue = Number(rueId)
  const cp = String(codePostal ?? '').trim()
  const num = normaliserNumero(numero)
  if (!Number.isInteger(rue) || rue <= 0 || !/^\d{4}$/.test(cp) || !num || num.length > 12) {
    return { ok: true, trouvee: false }
  }
  const [{ data: maison, error: errM }, { data: laRue, error: errR }] = await Promise.all([
    supabase.from('best_adresses')
      .select('lat, lng, origine_position')
      .eq('rue_id', rue).eq('code_postal', cp).eq('numero', num)
      .maybeSingle(),
    supabase.from('best_rues')
      .select('nom, localite')
      .eq('rue_id', rue).eq('code_postal', cp)
      .maybeSingle(),
  ])
  if (errM || errR) {
    console.error('[best] situer KO', errM?.message || errR?.message)
    return { ok: false }
  }
  if (!maison || !laRue) return { ok: true, trouvee: false }
  return {
    ok: true,
    trouvee: true,
    lat: Number(maison.lat),
    lng: Number(maison.lng),
    estimee: maison.origine_position === 'voisins',
    rue: laRue.nom,
    localite: laRue.localite,
    numero: num,
  }
}
