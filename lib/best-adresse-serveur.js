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
import { arrondirPosition, positionPlausible, rectangleAutour, plusProche, RAYONS_RECHERCHE_M } from './localiser.js'

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
      // `lat`/`lng` : le centre de la rue (moyenne de ses maisons OFFICIELLES),
      // pour un lieu d'activité sans numéro (Alex, 05/10, décision A).
      .select('rue_id, nom, nom_recherche, localite, lat, lng')
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

/**
 * LA MAISON LA PLUS PROCHE D'UNE POSITION (Nominatim retiré côté Yopper,
 * 06/10). Rend :
 *   { ok: true, trouvee: true, rue, numero, localite, code_postal, distance_m }
 *   { ok: true, trouvee: false }   rien à moins de RAYON_PROCHE_M (hors
 *                                  Wallonie, pleine campagne)
 *   { ok: false }                  la base n'a pas répondu
 *
 * ⚠️ LA POSITION N'EST NI JOURNALISÉE NI GARDÉE : elle sert à cette lecture et
 * disparaît. Aucun `console.*` ne doit l'écrire, même en cas d'erreur.
 * ⚠️ Deux passes (60 m puis 150 m) : dans un centre-ville, un rectangle de
 * 150 m compte des centaines de maisons, et la limite de lignes couperait au
 * hasard, pas au plus près.
 */
export async function maisonLaPlusProche(supabase, position) {
  const p = arrondirPosition(position)
  if (!p || !positionPlausible(p)) return { ok: true, trouvee: false }
  let proche = null
  for (const rayon of RAYONS_RECHERCHE_M) {
    const r = rectangleAutour(p, rayon)
    const { data, error } = await supabase
      .from('best_adresses')
      .select('rue_id, code_postal, numero, lat, lng')
      .gte('lat', r.latMin).lte('lat', r.latMax)
      .gte('lng', r.lngMin).lte('lng', r.lngMax)
      .limit(PAGE)
    if (error) {
      console.error('[best] maison proche KO', error.message)
      return { ok: false }
    }
    proche = plusProche(p, data || [], rayon)
    if (proche) break
  }
  if (!proche) return { ok: true, trouvee: false }
  const { data: laRue, error: errR } = await supabase
    .from('best_rues')
    .select('nom, localite, commune')
    .eq('rue_id', proche.maison.rue_id).eq('code_postal', proche.maison.code_postal)
    .maybeSingle()
  if (errR) {
    console.error('[best] rue proche KO', errR.message)
    return { ok: false }
  }
  if (!laRue) return { ok: true, trouvee: false }
  return {
    ok: true,
    trouvee: true,
    rue: laRue.nom,
    numero: proche.maison.numero,
    localite: laRue.localite || laRue.commune || '',
    code_postal: proche.maison.code_postal,
    distance_m: Math.round(proche.distance_m),
  }
}

/**
 * Toutes les localités (~1 900), pour la liste filtrée sur le téléphone.
 * `null` si la lecture échoue : une liste vide voudrait dire « aucune ».
 */
export async function toutesLesLocalites(supabase) {
  const toutes = []
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await supabase
      .from('best_localites')
      .select('code_postal, localite, commune, lat, lng, nb_maisons')
      .order('code_postal', { ascending: true })
      .order('localite', { ascending: true })
      .range(debut, debut + PAGE - 1)
    if (error) {
      console.error('[best] lecture des localites KO', error.message)
      return null
    }
    toutes.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return toutes
}
