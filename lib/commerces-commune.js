// LES COMMERCES D'UNE COMMUNE, POUR GOOGLE ET POUR LE PASSANT (27/10).
//
// 🔴 AUCUN LIEN NE MENAIT AUX FICHES. Ni l'accueil, ni `/commander` (sa liste
// dépend de la position et se charge dans le navigateur), ni les fiches entre
// elles : la Search Console disait « Aucune page d'origine détectée » pour les
// 7 Abbayes, et seul le plan du site annonçait les commerces.
//
// ✅ ALEX, 27/10 (tableau) : `/commerces/<commune>` SEULEMENT pour les communes
// qui ont au moins un commerce publié, `/commerces` qui les liste, et en bas de
// chaque fiche « Autres commerces à <commune> ». Pas 260 pages vides : Google
// les classe en contenu pauvre et en tient rigueur au site entier.
//
// ⚠️ LA COMMUNE SE LIT SUR LE LIEU DÉCLARÉ, JAMAIS SUR LE SIÈGE SOCIAL. Le
// siège ne sert qu'à valider le dossier (Alex, 15/08, `lib/lieux-activite.js`).
// Et `commune_id` n'est écrit sur aucun lieu : on passe donc par le CODE
// POSTAL de l'adresse du lieu, retrouvé dans `communes.codes_postaux`.
//
// ⚠️ MODULE PUR.

import { sansAccents } from './texte-normalise.js'
import { lieuPrincipal } from './lieux-activite.js'

// « Rue X 12, 5640 Mettet, Belgique » → '5640'. Le code postal belge a quatre
// chiffres et ouvre le morceau qui porte la localité.
export function codePostalDe(adresse) {
  if (!adresse) return null
  for (const part of String(adresse).split(',').map(p => p.trim())) {
    const m = part.match(/^(\d{4})\b/)
    if (m) return m[1]
  }
  return null
}

// L'adresse d'une commune dans l'URL : « Braine-l'Alleud » → 'braine-l-alleud'.
export function slugCommune(nom) {
  return sansAccents(nom).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// La commune qui porte ce code postal, ou null.
export function communeDuCodePostal(cp, communes = []) {
  if (!cp) return null
  for (const c of communes || []) {
    const codes = Array.isArray(c?.codes_postaux) ? c.codes_postaux : []
    if (codes.map(String).includes(String(cp))) return c
  }
  return null
}

/**
 * Les communes qui ont au moins un commerce publié, chacune avec ses commerces.
 *
 * @param commerces   les fiches publiées (`commercants_public`)
 * @param lieux       les lieux actifs de ces commerces (`commercant_lieux`)
 * @param communes    `{ id, nom, codes_postaux }`
 * @returns [{ id, nom, slug, commerces: [...] }], communes et commerces par nom
 */
export function regrouperParCommune(commerces = [], lieux = [], communes = []) {
  const lieuxDe = new Map()
  for (const l of lieux || []) {
    if (!l?.commercant_id) continue
    if (!lieuxDe.has(l.commercant_id)) lieuxDe.set(l.commercant_id, [])
    lieuxDe.get(l.commercant_id).push(l)
  }
  const groupes = new Map()
  for (const c of commerces || []) {
    if (!c?.slug) continue
    // Un commerce sans lieu permanent (food truck, cours itinérants) n'a pas
    // de commune à lui : il n'est rangé nulle part plutôt qu'au mauvais endroit.
    const lieu = lieuPrincipal({ lieux: lieuxDe.get(c.id) || [] })
    const commune = communeDuCodePostal(codePostalDe(lieu?.adresse), communes)
    if (!commune) continue
    if (!groupes.has(commune.id)) {
      groupes.set(commune.id, { id: commune.id, nom: commune.nom, slug: slugCommune(commune.nom), commerces: [] })
    }
    groupes.get(commune.id).commerces.push({ ...c, lieu })
  }
  const parNom = (a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')
  return [...groupes.values()]
    .map(g => ({ ...g, commerces: g.commerces.sort(parNom) }))
    .sort(parNom)
}

// La commune d'un commerce dans ces groupes, ou null.
export function communeDuCommerce(commercantId, groupes = []) {
  return (groupes || []).find(g => g.commerces.some(c => c.id === commercantId)) || null
}

// Combien de voisins on cite en bas d'une fiche : au-delà, la page de la
// commune les montre tous.
export const MAX_VOISINS = 8
