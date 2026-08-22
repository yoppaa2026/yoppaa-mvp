// L'ADRESSE DE LIVRAISON : CE QU'ON AFFICHE, ET CE QU'ON DONNE AU GÉOCODEUR.
//
// ⚠️ CE FICHIER EXISTE À CAUSE D'UN DÉFAUT PRÉCIS, TROUVÉ LE 22/08. Le tableau
// de bord répondait « Aucune adresse géolocalisée dans cette tournée » sur des
// commandes dont l'adresse était parfaitement valide. Ni le géocodeur ni les
// colonnes n'étaient en cause : `livraison_lat` et `livraison_lng` existaient
// depuis MIGRATION_LIVRAISON_COORDS, et `geocoderAdresse` fonctionnait.
//
// C'est CE QU'ON LUI DONNAIT À MANGER qui ne pouvait pas marcher. L'écran
// composait UNE SEULE chaîne :
//
//     rue + complément + « code_postal ville »
//
// puis la route de commande rappelait le code postal par-dessus. La requête
// envoyée à Nominatim ressemblait donc à :
//
//     « Rue de prée 9g, Boîte 3, 5640 Biesme, 5640, Belgique »
//
// Le complément est une information de PORTE, pas de RUE : aucun moteur de
// géocodage ne sait quoi en faire, et avec `limit=1` il ne rend rien du tout.
//
// ⚠️ LA RÈGLE : deux chaînes, deux usages, et elles ne se ressemblent pas.
//   • celle qu'on AFFICHE porte tout, complément compris ;
//   • celle qu'on GÉOCODE ne porte que la rue, le code postal et la ville.
//
// Les deux vivent ici, et le banc les exécute.

function propre(v) {
  return String(v ?? '').trim()
}

/**
 * L'adresse telle qu'elle s'affiche au commerçant et sur l'email.
 * Le complément en fait partie : c'est lui qui dit à quelle porte sonner.
 */
export function composerAdresseLivraison({ rue, complement, code_postal, ville } = {}) {
  const ligneVille = [propre(code_postal), propre(ville)].filter(Boolean).join(' ')
  return [propre(rue), propre(complement), ligneVille].filter(Boolean).join(', ')
}

/**
 * La requête pour le géocodeur. SANS complément, et SANS répétition.
 *
 * ⚠️ Rend une chaîne VIDE quand il n'y a pas de rue : géocoder « 5640 Biesme »
 * rendrait le centre du village, c'est-à-dire une coordonnée fausse mais
 * plausible. Une tournée bâtie là-dessus enverrait le livreur au mauvais
 * endroit sans que rien ne le dise. Mieux vaut aucune coordonnée qu'une
 * approximation silencieuse.
 */
export function requeteGeocodage({ rue, code_postal, ville } = {}) {
  const r = propre(rue)
  if (!r) return ''
  return [r, propre(code_postal), propre(ville)].filter(Boolean).join(', ')
}

/**
 * Des coordonnées ne sont retenues que si elles sont deux nombres finis ET
 * qu'elles tombent en Belgique.
 *
 * ⚠️ ELLES VIENNENT DU NAVIGATEUR, donc de l'extérieur. L'enjeu est faible (un
 * Yopper ne peut fausser que sa propre livraison), mais une coordonnée absurde
 * ferait diverger l'itinéraire de TOUTE la tournée, celle des autres comprise.
 * On la refuse plutôt que de la corriger.
 *
 * ⚠️ CETTE FONCTION N'A QU'UNE LIGNE UTILE, ET C'EST LA MUTATION QUI L'A DIT.
 * J'en avais écrit trois : un garde contre `null`/`undefined`, un garde contre
 * les valeurs non finies, puis l'encadrement. Retirer l'un OU l'autre des deux
 * premiers ne faisait rougir AUCUNE vérification.
 *
 * Parce que l'encadrement les couvre déjà tous les deux :
 *   • `Number(null)` et `Number('')` valent 0, et 0/0 tombe au large du golfe
 *     de Guinée, très loin de la Belgique ;
 *   • `Number(undefined)` vaut NaN, et TOUTE comparaison avec NaN est fausse,
 *     donc `NaN >= 49.4` rend `false` de lui-même.
 *
 * Une ligne qui ne protège de rien ment sur le risque : elle laisse croire que
 * l'absence est traitée ici alors qu'elle l'est plus bas. La garantie tient à
 * un INVARIANT — l'encadrement géographique — et c'est lui que le banc éprouve,
 * avec 0/0, NaN, la chaîne vide et Paris parmi ses cas.
 * Voir reference_tests_faussement_verts, « la mutation qui ne casse rien n'est
 * pas toujours un trou ».
 *
 * ⚠️ SI CET ENCADREMENT S'ÉLARGIT UN JOUR à un pays qui touche l'équateur ou le
 * méridien de Greenwich, les gardes retirées redeviendraient nécessaires.
 */
const BELGIQUE = { latMin: 49.4, latMax: 51.6, lngMin: 2.5, lngMax: 6.5 }

export function coordonneesPlausibles(lat, lng) {
  const a = Number(lat)
  const b = Number(lng)
  return a >= BELGIQUE.latMin && a <= BELGIQUE.latMax && b >= BELGIQUE.lngMin && b <= BELGIQUE.lngMax
}

export const NOTE_MAX = 200

/** Ce que l'écran envoie à `create-commande`. */
export function champsAdressePourAPI(a = {}) {
  const coordsOk = coordonneesPlausibles(a.lat, a.lng)
  return {
    adresse_livraison: composerAdresseLivraison(a),
    code_postal_livraison: propre(a.code_postal),
    // ⚠️ ENVOYÉE À PART, ET C'EST TOUT L'INTÉRÊT : le serveur ne recompose plus
    // une requête à partir de la chaîne d'affichage, il reçoit la bonne.
    adresse_geocodage: requeteGeocodage(a),
    livraison_lat: coordsOk ? Number(a.lat) : null,
    livraison_lng: coordsOk ? Number(a.lng) : null,
    note_livraison: propre(a.note).slice(0, NOTE_MAX) || null,
  }
}
