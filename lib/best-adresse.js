// LE RÉFÉRENTIEL OFFICIEL DES ADRESSES WALLONNES (BeSt Address), CHEZ NOUS.
//
// POURQUOI. Décider « ce commerce livre-t-il à cette adresse ? » demande de
// savoir OÙ est l'adresse. Nominatim (OpenStreetMap) interdit cet usage, et on
// l'appelait depuis le navigateur à chaque frappe. Le SPF BOSA publie toutes
// les adresses wallonnes, avec leurs coordonnées, sous licence CC BY 4.0
// (source à citer sur /legal), mises à jour chaque semaine :
// https://opendata.bosa.be/download/best/openaddress-bewal.zip
//
// Décisions d'Alex (05/10) : précision à la MAISON ; une adresse absente de la
// liste ne se livre pas (on propose le retrait) ; l'expédition reste libre.
//
// Tout ce qui est ici est PUR : le script d'import et la route de recherche
// lisent les mêmes règles, et le banc les exécute.
//
// Ce que le fichier contient vraiment (relevé du 05/10, 2 107 107 lignes) :
//   • une ligne par BOÎTE AUX LETTRES : un immeuble de six appartements fait
//     six lignes au même numéro. On garde UNE maison par (rue, code postal,
//     numéro) : 1 617 222 maisons, 58 089 rues ;
//   • 4 172 lignes ont une virgule ENTRE GUILLEMETS (« "Weiherstraße,Recht" ») :
//     un découpage naïf sur la virgule décale toutes les colonnes ;
//   • 33 142 lignes, en Communauté germanophone, n'ont PAS de nom de rue
//     français : on prend l'allemand, puis le néerlandais ;
//   • 🔴 104 304 maisons N'ONT PAS DE POSITION : leurs coordonnées valent 0,0,
//     ce qui, converti, tombe en France (49,29 ; 2,31). 99 340 sont dans une
//     rue qui a d'autres maisons situées. Décision d'Alex (05/10) : on ESTIME
//     leur position par les numéros voisins (`estimerPositions`), et on le
//     marque (`origine_position` = 'voisins'). Les ~5 000 autres ne sont pas rangées :
//     sans position, pas de livraison, le retrait est proposé.

export const COLONNES_BEST = [
  'EPSG:31370_x', 'EPSG:31370_y', 'EPSG:4326_lat', 'EPSG:4326_lon', 'address_id',
  'box_number', 'house_number', 'municipality_id', 'municipality_name_de',
  'municipality_name_fr', 'municipality_name_nl', 'postcode', 'postname_fr',
  'postname_nl', 'street_id', 'streetname_de', 'streetname_fr', 'streetname_nl',
  'region_code', 'status',
]

/**
 * Découpe UNE ligne CSV (RFC 4180) : virgules entre guillemets, guillemets
 * doublés. Le fichier n'a aucun champ sur deux lignes (vérifié le 05/10 :
 * zéro ligne à guillemets impairs).
 */
export function decouperLigneCsv(ligne) {
  const champs = []
  let courant = ''
  let entreGuillemets = false
  const s = String(ligne ?? '').replace(/\r$/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (entreGuillemets) {
      if (c === '"') {
        if (s[i + 1] === '"') { courant += '"'; i++ }
        else entreGuillemets = false
      } else courant += c
    } else if (c === '"') entreGuillemets = true
    else if (c === ',') { champs.push(courant); courant = '' }
    else courant += c
  }
  champs.push(courant)
  return champs
}

/**
 * Ce qu'on compare quand quelqu'un tape : minuscules, sans accents, sans
 * ponctuation, espaces simples. « Rue de l'Église » et « rue de l eglise »
 * doivent se trouver.
 */
export function normaliserRecherche(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Un numéro de maison tel qu'on le range et qu'on le cherche : majuscules,
 * sans espaces. « 6 a » et « 6A » désignent la même porte.
 */
export function normaliserNumero(n) {
  return String(n ?? '').toUpperCase().replace(/\s+/g, '').trim()
}

/**
 * Une ligne du fichier, réduite à ce qui sert. `null` si elle ne décrit pas
 * une adresse en vigueur.
 *
 * ⚠️ UNE ADRESSE SANS POSITION EST RENDUE, AVEC `lat` ET `lng` À `null`. Elle
 * existe : `estimerPositions` tentera de la situer par ses voisines. Une
 * coordonnée hors de Belgique (le 0,0 du fichier) n'est JAMAIS gardée telle
 * quelle : elle déciderait d'une livraison.
 *
 * @param {string[]} champs le résultat de `decouperLigneCsv`
 * @param {Record<string, number>} idx position de chaque colonne (`indexColonnes`)
 */
export function adresseDeLigne(champs, idx) {
  const v = (nom) => (champs[idx[nom]] ?? '').trim()
  if (v('status') !== 'current') return null
  const rueId = Number(v('street_id'))
  const codePostal = v('postcode')
  const numero = normaliserNumero(v('house_number'))
  const lat = Number(v('EPSG:4326_lat'))
  const lng = Number(v('EPSG:4326_lon'))
  const nom = v('streetname_fr') || v('streetname_de') || v('streetname_nl')
  if (!Number.isInteger(rueId) || rueId <= 0) return null
  if (!/^\d{4}$/.test(codePostal) || !numero || !nom) return null
  // Même encadrement que `coordonneesPlausibles` (lib/adresse-livraison.js).
  const situee = lat >= 49.4 && lat <= 51.6 && lng >= 2.5 && lng <= 6.5
  return {
    rue_id: rueId,
    code_postal: codePostal,
    numero,
    lat: situee ? lat : null,
    lng: situee ? lng : null,
    nom,
    localite: v('postname_fr') || v('postname_nl') || v('municipality_name_fr') || v('municipality_name_de') || null,
    commune: v('municipality_name_fr') || v('municipality_name_de') || v('municipality_name_nl') || null,
  }
}

/**
 * Les rues qui répondent à ce qu'on tape : CHAQUE mot tapé doit se retrouver
 * dans le nom (sans accents ni apostrophes) ; celles où les mots commencent un
 * mot du nom passent devant. Partagée par les deux champs d'adresse (livraison
 * et commerçant), pour qu'ils trouvent la même chose.
 *
 * @param {Array<{nom:string, r?:string}>} liste `r` = nom déjà normalisé (sinon calculé)
 */
export function filtrerRues(liste, texte, max = 8) {
  const mots = normaliserRecherche(texte).split(' ').filter(Boolean)
  if (mots.length === 0) return []
  const norm = (x) => x.r ?? normaliserRecherche(x.nom)
  const debutDeMot = (r, m) => (' ' + r).includes(' ' + m)
  return (liste || [])
    .filter(x => { const r = norm(x); return mots.every(m => r.includes(m)) })
    .sort((a, b) => {
      const ra = norm(a), rb = norm(b)
      const sa = mots.filter(m => debutDeMot(ra, m)).length
      const sb = mots.filter(m => debutDeMot(rb, m)).length
      return sb - sa || ra.localeCompare(rb)
    })
    .slice(0, max)
}

/**
 * L'adresse lisible d'une maison ou d'une rue : « Rue X 12, 5640 Biesme ».
 * Sans numéro : « Place du Marché, 5070 Fosses-la-Ville ».
 */
export function composerAdresseOfficielle({ rue, numero, code_postal, localite } = {}) {
  const ligne1 = [String(rue ?? '').trim(), String(numero ?? '').trim()].filter(Boolean).join(' ')
  const ligne2 = [String(code_postal ?? '').trim(), String(localite ?? '').trim()].filter(Boolean).join(' ')
  return [ligne1, ligne2].filter(Boolean).join(', ')
}

/**
 * La partie chiffrée d'un numéro : « 15A » → 15, « 2/1 » → 2, « 12-14 » → 12.
 * `null` s'il ne commence pas par un chiffre.
 */
export function baseNumero(numero) {
  const m = /^(\d+)/.exec(String(numero ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * Situe les maisons d'UNE rue qui n'ont pas de position, par leurs voisines.
 *
 * Dans l'ordre :
 *   1. une maison située porte le même numéro de base (« 15 » pour « 15A ») :
 *      on reprend sa position, c'est le même bâtiment ou le voisin immédiat ;
 *   2. sinon, on prend le numéro situé juste en dessous et juste au-dessus,
 *      DU MÊME CÔTÉ de la rue (même parité) s'il en existe, et on place la
 *      maison entre les deux, au prorata des numéros. Le 15 entre le 13 et le
 *      17 tombe au milieu ;
 *   3. un seul voisin d'un côté : on prend le plus proche.
 *
 * Une maison sans numéro chiffré, ou dans une rue sans aucune maison située,
 * reste sans position : elle ne sera pas rangée.
 *
 * Fonction PURE : elle ne modifie pas son entrée.
 *
 * @param {Array<{numero:string, lat:number|null, lng:number|null}>} maisons d'une même rue (rue_id + code postal)
 * @returns {Array<{numero:string, lat:number, lng:number, origine_position:'officielle'|'voisins'}>}
 *          les maisons situées (officielles ou estimées), jamais les autres
 */
export function estimerPositions(maisons) {
  const situees = []
  const sans = []
  for (const m of maisons || []) {
    if (Number.isFinite(m?.lat) && Number.isFinite(m?.lng)) {
      situees.push({ numero: m.numero, lat: m.lat, lng: m.lng, origine_position: 'officielle', base: baseNumero(m.numero) })
    } else if (m) sans.push(m)
  }
  const resultat = situees.map(({ base: _base, ...m }) => m)
  if (situees.length === 0) return resultat

  const chiffrees = situees.filter(s => s.base !== null).sort((a, b) => a.base - b.base)
  for (const m of sans) {
    const n = baseNumero(m.numero)
    if (n === null || chiffrees.length === 0) continue

    const meme = chiffrees.find(s => s.base === n)
    if (meme) {
      resultat.push({ numero: m.numero, lat: meme.lat, lng: meme.lng, origine_position: 'voisins' })
      continue
    }
    const memeCote = chiffrees.filter(s => s.base % 2 === n % 2)
    const candidates = memeCote.length > 0 ? memeCote : chiffrees
    let bas = null, haut = null
    for (const s of candidates) {
      if (s.base < n) bas = s
      else if (s.base > n && haut === null) haut = s
    }
    let lat, lng
    if (bas && haut) {
      const t = (n - bas.base) / (haut.base - bas.base)
      lat = bas.lat + (haut.lat - bas.lat) * t
      lng = bas.lng + (haut.lng - bas.lng) * t
    } else {
      const seul = bas || haut
      lat = seul.lat
      lng = seul.lng
    }
    resultat.push({
      numero: m.numero,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      origine_position: 'voisins',
    })
  }
  return resultat
}

/**
 * La position de chaque colonne attendue dans l'en-tête. Lève une erreur si
 * une manque : un fichier dont le format a changé ne doit RIEN écrire.
 */
export function indexColonnes(entete) {
  const noms = decouperLigneCsv(entete).map(c => c.replace(/^﻿/, '').trim())
  const idx = {}
  for (const col of COLONNES_BEST) {
    const i = noms.indexOf(col)
    if (i === -1) throw new Error(`Colonne absente du fichier BeSt : ${col}`)
    idx[col] = i
  }
  return idx
}

/**
 * LES LOCALITÉS, CALCULÉES DEPUIS LES RUES (06/10, Nominatim retiré côté
 * Yopper). Une par (code postal, localité), à la position moyenne de ses rues
 * pondérée par leur nombre de maisons.
 *
 * ⚠️ MÊME RÈGLE QUE LE PREMIER REMPLISSAGE SQL (MIGRATION_BEST_LOCALITES_PROCHE)
 * : une localité sans nom prend celui de sa commune, seules les rues SITUÉES
 * comptent, et la commune retenue est la plus petite dans l'ordre alphabétique
 * (`min(commune)`). Deux règles qui divergent rendraient une liste différente
 * avant et après la prochaine mise à jour du référentiel.
 */
export function localitesDesRues(rues) {
  const parCle = new Map()
  for (const r of rues || []) {
    const nom = String(r?.localite ?? '').trim() || String(r?.commune ?? '').trim()
    const lat = r?.lat == null ? NaN : Number(r.lat)
    const lng = r?.lng == null ? NaN : Number(r.lng)
    const n = Number(r?.nb_maisons) || 0
    if (!nom || !Number.isFinite(lat) || !Number.isFinite(lng) || n <= 0) continue
    const cle = `${r.code_postal}|${nom}`
    let l = parCle.get(cle)
    if (!l) { l = { code_postal: r.code_postal, localite: nom, commune: null, sLat: 0, sLng: 0, n: 0 }; parCle.set(cle, l) }
    const commune = String(r.commune ?? '').trim() || null
    if (commune && (l.commune === null || commune < l.commune)) l.commune = commune
    l.sLat += lat * n; l.sLng += lng * n; l.n += n
  }
  return [...parCle.values()].map(l => ({
    code_postal: l.code_postal,
    localite: l.localite,
    commune: l.commune,
    lat: Math.round((l.sLat / l.n) * 1e6) / 1e6,
    lng: Math.round((l.sLng / l.n) * 1e6) / 1e6,
    nb_maisons: l.n,
  }))
}
